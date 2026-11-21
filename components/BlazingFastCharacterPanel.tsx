import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { store, type AppDispatch, type RootState } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import type { LibraryItem } from '../types';
import { normalizeStyleModel, saveStyleGallery } from '../services/styleGallery';
import { CHARACTER_ANGLE_OPTIONS, CHARACTER_POSE_OPTIONS, CHARACTER_EXPRESSION_OPTIONS, CHARACTER_NONE_VALUE } from '../services/characterAnglesWorkflow';
import { h3Choices, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { blazingOutputs, blazingPoseCount, blazingPrompts, buildBlazingWorkflow, defaultBlazingSettings, randomBlazingPose, validateBlazingDraft, type BlazingDraft, type BlazingSettings, type BlazingPose } from '../services/blazingFastCharacterWorkflow';
import { generateBlazingCharacter, loadBlazingDraft, loadBlazingObjectInfo, prepareBlazingWorkflow, saveBlazingDraft, type BlazingResult } from '../services/blazingFastCharacterService';
import { buildBlazingLibraryCaption, buildBlazingLibraryImage, downloadBlazingBlob, downloadBlazingBundle } from '../services/blazingFastCharacterLibrary';
import { comfyOutputImage, comfyOutputText, type GraphLive } from '../services/comfyGraphExecution';
import { useStyleGallery } from './useStyleGallery';
import { useModelInventory } from './useModelInventory';
import { resolveLibraryStyle, styleInstalledLoras } from '../services/styleLibrary';
import { inferFlux2Variant } from '../services/civitaiService';
import { StylePicker } from './StyleBrowser';
import { useMediaURL } from './VideoReferenceEditor';
import { useUnmountCleanup } from './useUnmountCleanup';
import { useDraftAutosave } from './useDraftAutosave';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CreationSuiteResult } from './CreationSuiteResult';
import { SelectInput, PresetTextInput } from './InputComponents';
import { DiceIcon } from './icons';
import { BACKGROUND_OPTIONS } from '../constants';
import { SaveStyleSamplingButton } from './SaveStyleSamplingButton';

const input = 'mt-1 w-full min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2 text-sm';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40';
const emptyLive = (): GraphLive => ({ completedNodes: [], outputs: {} });
const backgroundPresets = ['Same Background', 'Remove Background', ...BACKGROUND_OPTIONS
    .filter(option => !['original', 'image', 'random', 'prompt'].includes(option.value))
    .map(option => `${option.label} Background`)];
export const BlazingFastCharacterPanel: React.FC<{
    isComfyUIConnected: boolean | null; onManageStyles: () => void; onModelChange: (model: string) => void;
    pendingPreset?: LibraryItem | null; onPresetLoaded?: () => void;
}> = ({ isComfyUIConnected, onManageStyles, onModelChange, pendingPreset, onPresetLoaded }) => {
    const dispatch = useDispatch<AppDispatch>(), globalBusy = useSelector((state: RootState) => state.generation.isLoading);
    const { gallery, error: galleryError } = useStyleGallery();
    const { inventory, error: inventoryError, loading: inventoryLoading } = useModelInventory();
    const [draft, setDraft] = useState<BlazingDraft>(() => ({ settings: defaultBlazingSettings() }));
    const [ready, setReady] = useState(false), [storageError, setStorageError] = useState('');
    const [running, setRunning] = useState(false), [cancelling, setCancelling] = useState(false), [picker, setPicker] = useState(false);
    const [restoringPreset, setRestoringPreset] = useState(false);
    const [error, setError] = useState(''), [status, setStatus] = useState(''), [progress, setProgress] = useState(0);
    const [live, setLive] = useState<GraphLive>(emptyLive), [result, setResult] = useState<BlazingResult | null>(null);
    const [info, setInfo] = useState<H3ObjectInfo>({}), [savedCount, setSavedCount] = useState(0);
    const styleModel = inferFlux2Variant(draft.settings.model)?.toUpperCase() || 'FLUX2 (unknown variant)';
    const loraOptions = useMemo(() => [
        { value: '', label: 'None' },
        ...styleInstalledLoras(h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), styleModel, inventory)
            .map(name => ({ value: name, label: name })),
    ], [info, styleModel, inventory]);
    const samplerOptions = useMemo(() => h3Choices(info, 'KSamplerSelect', 'sampler_name').map(value => ({ value, label: value })), [info]);
    const busy = useRef(false), controller = useRef<AbortController | null>(null), saves = useRef<Promise<void>>(Promise.resolve());
    const initialized = useRef(false);
    const restoring = useRef<number | null>(null);
    const settings = draft.settings, locked = !ready || running || restoringPreset || globalBusy || inventoryLoading;
    const poseCount = blazingPoseCount(settings);
    const displayedOutputs = blazingOutputs(result?.draft.settings ?? settings);
    const storedStyle = gallery?.styles.find(style => style.id === settings.styleId);
    const libraryStyle = useMemo(() => storedStyle ? resolveLibraryStyle(storedStyle, inventory, samplerOptions.map(option => option.value)) : undefined, [storedStyle, inventory, samplerOptions]);
    const selectedStyle = libraryStyle?.style;
    const prompts = useMemo(() => blazingPrompts(settings, selectedStyle), [settings, selectedStyle]);
    const latestInitialPrompt = comfyOutputText(live.outputs['495']) || (result ? blazingPrompts(result.draft.settings, result.style, result.identity).initial : '');
    const sourceURL = useMediaURL(draft.file), previewURL = useMediaURL(live.preview);
    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        loadBlazingDraft().then(value => { if (value) setDraft(value); setReady(true); })
            .catch(cause => setStorageError(`Cannot restore Blazing Fast. Saving is disabled to protect the stored draft. ${String(cause)}`));
    }, []);
    useDraftAutosave(draft, ready, value => {
        saves.current = saves.current.then(() => saveBlazingDraft(value)).then(() => setStorageError(''))
            .catch(cause => setStorageError(`Cannot save the Blazing Fast draft: ${String(cause)}`));
    });
    useEffect(() => {
        if (!isComfyUIConnected) return;
        const abort = new AbortController();
        loadBlazingObjectInfo(abort.signal).then(setInfo).catch(cause => { if (!abort.signal.aborted) setError(String(cause)); });
        return () => abort.abort();
    }, [isComfyUIConnected]);
    useEffect(() => { onModelChange(settings.model); }, [settings.model, onModelChange]);
    const root = useUnmountCleanup(() => controller.current?.abort());
    const update = (patch: Partial<BlazingSettings>) => setDraft(current => ({ ...current, settings: { ...current.settings, ...patch } }));
    const updatePose = (index: number, patch: Partial<BlazingPose>) => update({ poses: settings.poses.map((pose, i) => i === index ? { ...pose, ...patch } : pose) });
    const setFile = (file?: File) => {
        if (file && (!file.size || !file.type.startsWith('image/'))) { setError('Choose a non-empty image file.'); return; }
        setDraft(current => ({ ...current, file }));
    };
    useEffect(() => {
        if (!pendingPreset || !ready || locked || restoring.current === pendingPreset.id) return;
        restoring.current = pendingPreset.id;
        setRestoringPreset(true);
        const restore = async () => {
            if (!window.confirm('Restore this Blazing Fast reference and exact settings? Other generators will not change.')) return;
            const snapshot = pendingPreset.blazingFastOptions;
            if (!snapshot || snapshot.version !== 1) throw new Error('Unsupported Blazing Fast Library snapshot.');
            const item = pendingPreset.mediaType === 'prompt' ? store.getState().library.items.find(value => value.id === pendingPreset.linkedResultId) : pendingPreset;
            const ref = item?.assetRefs?.sourceImage;
            let source: Blob | undefined;
            if (ref) source = await getLibraryAssetBlob(ref);
            else if (item?.sourceImage) {
                const response = await fetch(item.sourceImage);
                if (!response.ok) throw new Error('Cannot restore the saved reference.');
                source = await response.blob();
            }
            if (!source) throw new Error('The original Blazing Fast reference is missing from Library.');
            const restored: BlazingDraft = { settings: structuredClone(snapshot.settings), file: new File([source], 'blazing-library-reference.png', { type: source.type }) };
            validateBlazingDraft(restored);
            if (snapshot.style) {
                if (!gallery) throw new Error(galleryError);
                const style = { ...structuredClone(snapshot.style), model: normalizeStyleModel(snapshot.style.model) }, existing = gallery.styles.find(value => value.id === style.id);
                if (existing && JSON.stringify(existing) !== JSON.stringify(style)) { style.id = `blazing-snapshot-${snapshot.promptId}`; style.title += ' (saved generation)'; }
                restored.settings.styleId = style.id;
                saveStyleGallery({ version: 1, styles: [...gallery.styles.filter(value => value.id !== style.id), style] });
            }
            validateBlazingDraft(restored); setDraft(restored); setError(''); setStatus('Saved Blazing Fast reference and settings restored.');
        };
        void restore().catch(cause => setError(String(cause))).finally(() => { restoring.current = null; setRestoringPreset(false); onPresetLoaded?.(); });
    }, [pendingPreset, ready, locked, gallery, galleryError, onPresetLoaded]);
    const saveResults = async (value: BlazingResult, signal: AbortSignal, outputId?: string) => {
        const outputs = outputId ? value.images.filter(output => output.id === outputId) : value.images;
        if (!outputs.length) throw new Error('No completed images are available to save.');
        let count = 0;
        for (const output of outputs) {
            signal.throwIfAborted();
            const matches = (item: RootState['library']['items'][number]) => item.blazingFastOptions?.promptId === value.promptId && item.blazingFastOptions.outputId === output.id;
            let image = store.getState().library.items.find(item => item.mediaType === 'character' && matches(item));
            if (!image) {
                const built = await buildBlazingLibraryImage(value, output.id, signal);
                signal.throwIfAborted();
                image = await dispatch(addToLibrary(built.item)).unwrap();
                if (built.warning) setError(built.warning);
            }
            signal.throwIfAborted();
            if (!store.getState().library.items.some(item => item.mediaType === 'prompt' && item.linkedResultId === image.id && matches(item))) {
                await dispatch(addToLibrary(buildBlazingLibraryCaption(image))).unwrap();
            }
            count++;
            setSavedCount(value.images.filter(output => store.getState().library.items.some(item =>
                item.mediaType === 'prompt' && item.blazingFastOptions?.promptId === value.promptId && item.blazingFastOptions.outputId === output.id)).length);
            setStatus(`Saving images + associated captions to Library: ${count}/${outputs.length}`);
        }
        setStatus(`Saved ${outputs.length} completed image(s) and associated text captions in Library.`);
    };
    const perform = async (action: 'generate' | 'check' | 'export' | 'save' | 'download', outputId?: string): Promise<boolean> => {
        if (busy.current || locked) return false;
        busy.current = true; setRunning(true); setCancelling(false); setError('');
        const abort = new AbortController(); controller.current = abort;
        dispatch(setLoadingState({ isLoading: true, owner: 'blazing-fast' }));
        try {
            if (action === 'generate') {
                if (galleryError) throw new Error(galleryError);
                setResult(null); setLive(emptyLive()); setProgress(0); setSavedCount(0);
                const generated = await generateBlazingCharacter(draft, selectedStyle, abort.signal, (message, value) => { setStatus(message); setProgress(value); }, setLive,
                    partial => { setResult(partial); update({ seed: partial.draft.settings.seed }); });
                setResult(generated); update({ seed: generated.draft.settings.seed });
                await saveResults(generated, abort.signal);
                setProgress(1);
            } else if (action === 'check') {
                const catalog = await loadBlazingObjectInfo(abort.signal, true); setInfo(catalog);
                buildBlazingWorkflow(settings, draft.file?.name || 'check-only.png', selectedStyle, catalog);
                setStatus('Nodes, models, LoRAs and sampling settings checked. No generation was queued.');
            } else if (action === 'export') {
                const graph = await prepareBlazingWorkflow(draft, selectedStyle, abort.signal);
                downloadBlazingBlob(new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' }), 'blazing-fast-character-api.json');
                setStatus('API workflow exported with uploaded reference. No generation was queued.');
            } else {
                if (!result?.images.length) throw new Error('No completed images are available yet.');
                if (action === 'save') await saveResults(result, abort.signal, outputId);
                else await downloadBlazingBundle(outputId ? result.images.filter(image => image.id === outputId) : result.images, abort.signal);
            }
            return true;
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') setStatus('Cancelled. Any completed images below can now be downloaded or saved to Library. Already saved items were kept.');
            else setError(String(cause));
            return false;
        } finally {
            controller.current = null; busy.current = false; setRunning(false); setCancelling(false);
            setLive(current => ({ ...current, node: undefined, preview: undefined }));
            dispatch(setLoadingState({ isLoading: false, owner: 'blazing-fast' }));
        }
    };
    const modelField = (key: 'model' | 'clip' | 'vae' | 'vision', label: string, node: string, name: string) => <label className="block text-sm">{label}
        <input className={input} list={`blazing-${key}`} value={settings[key]} onChange={event => update({ [key]: event.target.value })} />
        <datalist id={`blazing-${key}`}>{h3Choices(info, node, name).map(value => <option key={value} value={value} />)}</datalist>
    </label>;
    const poseField = (index: number, key: keyof BlazingPose, values: string[]) => <PresetTextInput label={key}
        ariaLabel={`${key} for Blazing pose ${index + 1}`} emptyLabel="Same as reference" disabled={locked}
        value={settings.poses[index][key] === CHARACTER_NONE_VALUE ? '' : settings.poses[index][key]}
        options={values.filter(value => value !== CHARACTER_NONE_VALUE)} onChange={value => updatePose(index, { [key]: value })} />;
    return <section ref={root} className="space-y-5 rounded-2xl border border-accent/25 bg-bg-secondary p-4 sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold text-accent">Blazing Fast character</h2>
                <p className="mt-1 text-sm text-text-secondary">FLUX2 Klein 9B · original workflow v1.1 · 1–6 poses · collage at 6 poses</p></div>
            <div className="flex gap-2"><button className={button} disabled={locked || !isComfyUIConnected} onClick={() => void perform('check')}>Check workflow</button>
                <button className={button} disabled={locked || !isComfyUIConnected || !draft.file} onClick={() => void perform('export')}>Export API</button></div>
        </header>
        {(error || storageError || galleryError || inventoryError) && <div role="alert" className="space-y-1 rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{[error, storageError, galleryError, inventoryError].filter(Boolean).map(message => <p key={message}>{message}</p>)}</div>}
        <div className="grid items-start gap-5 lg:grid-cols-3">
            <fieldset disabled={locked} className="min-w-0 space-y-5">
                <div className="space-y-3 rounded-xl border border-border-primary p-4">
                    <h3 className="font-semibold">Reference & options</h3>
                    <label className="block text-sm">Character reference<input type="file" accept="image/*" className={`${input} max-w-full`} onChange={event => { setFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
                    <div className="flex gap-2"><button type="button" className={button} onClick={() => setPicker(true)}>From Library</button>{draft.file && <button type="button" className={button} onClick={() => setFile()}>Clear</button>}</div>
                    {draft.file && <p className="break-all text-xs text-text-muted">{draft.file.name}</p>}
                    {sourceURL && <img src={sourceURL} alt="Blazing Fast character reference" className="max-h-64 w-full rounded-lg object-contain" />}
                    {modelField('model', 'Diffusion model', 'UNETLoader', 'unet_name')}
                    {modelField('clip', 'FLUX2 text encoder', 'CLIPLoader', 'clip_name')}
                    {modelField('vae', 'VAE', 'VAELoader', 'vae_name')}
                    {modelField('vision', 'Vision / caption model', 'CLIPLoader', 'clip_name')}
                </div>
                <div className="space-y-3 rounded-xl border border-border-primary p-4">
                    <h3 className="font-semibold">Sampling</h3>
                    <div className="grid grid-cols-2 gap-3">{(['steps', 'cfg', 'megapixels', 'seed'] as const).map(key => <label key={key} className="text-sm">{key}<input type="number" step={key === 'steps' || key === 'seed' ? 1 : 'any'} className={input} value={settings[key]} onChange={event => update({ [key]: event.target.valueAsNumber })} /></label>)}</div>
                    <SelectInput label="Blazing sampler" value={settings.sampler} disabled={locked}
                        options={samplerOptions.some(option => option.value === settings.sampler) ? samplerOptions
                            : [{ value: settings.sampler, label: `${settings.sampler} (not in current catalog)`, disabled: true }, ...samplerOptions]}
                        onChange={event => update({ sampler: event.target.value })} />
                    <p className="text-xs text-text-muted">All samplers reported by ComfyUI are available. Scheduler: {settings.useStyleSettings && selectedStyle?.settings.scheduler && selectedStyle.settings.scheduler !== 'flux2' ? `${selectedStyle.settings.scheduler} (style override)` : 'Flux2Scheduler (as supplied)'}. The same settings and noise seed are shared by all selected samplers.</p>
                    <SaveStyleSamplingButton style={selectedStyle} sampling={{ steps: settings.steps, cfg: settings.cfg, sampler: settings.sampler, scheduler: settings.useStyleSettings ? selectedStyle?.settings.scheduler ?? 'flux2' : 'flux2' }} disabled={locked} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSeed} onChange={event => update({ randomizeSeed: event.target.checked })} />Randomize seed</label>
                </div>
                <SelectInput label="Number of Blazing poses" value={String(poseCount)} disabled={locked}
                    options={[1, 2, 3, 4, 5, 6].map(value => ({ value: String(value), label: `${value} pose${value === 1 ? '' : 's'}` }))}
                    onChange={event => update({ poseCount: Number(event.target.value) })} />
                <p className="text-xs text-text-muted">Generates the first {poseCount} pose(s). Collage, comparison and final collage caption require all six. Unused pose settings are kept.</p>
                <details className="rounded-xl border border-border-primary p-4">
                    <summary className="cursor-pointer font-semibold">Poses & expressions</summary>
                    <p className="my-3 text-xs text-text-muted">Pose 1 edits the source; later poses use that edited image. Defaults keep the reference angle, pose and expression. Pick a preset or Custom to change one.</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                        <button type="button" className={`${button} inline-flex items-center gap-2`} disabled={locked} onClick={() => update({ poses: settings.poses.map((pose, index) => index < poseCount ? randomBlazingPose() : pose) })}><DiceIcon className="h-4 w-4" />Randomize all poses</button>
                        <button type="button" className={button} disabled={locked} onClick={() => update({ poses: defaultBlazingSettings().poses })}>Reset poses to reference</button>
                    </div>
                    <div className="space-y-4">{settings.poses.slice(0, poseCount).map((pose, index) => <div key={index} className="space-y-2 rounded-lg bg-bg-primary/50 p-3">
                        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Pose {index + 1}</h4>
                            <button type="button" className={button} disabled={locked} aria-label={`Randomize Blazing pose ${index + 1}`} title="Randomize angle, pose and expression" onClick={() => updatePose(index, randomBlazingPose())}><DiceIcon className="h-4 w-4" /></button></div>
                        {poseField(index, 'angle', [...CHARACTER_ANGLE_OPTIONS])}
                        {poseField(index, 'pose', [...CHARACTER_POSE_OPTIONS])}
                        {poseField(index, 'expression', [...CHARACTER_EXPRESSION_OPTIONS, 'laughing'])}
                    </div>)}</div>
                </details>
            </fieldset>
            <div className="min-w-0 space-y-5 lg:col-span-2">
                <fieldset disabled={locked} className="space-y-4 rounded-xl border border-border-primary p-4">
                    <h3 className="font-semibold">Prompt & style</h3>
                    <label className="block text-sm">Additional editing prompt<textarea rows={5} className={input} placeholder="Describe the edit to the original character..." value={settings.prompt} onChange={event => update({ prompt: event.target.value })} /></label>
                    <PresetTextInput label="Background" ariaLabel="Blazing background" emptyLabel="Same as reference" value={settings.background} options={backgroundPresets} disabled={locked} onChange={background => update({ background })} />
                    <StylePicker styles={gallery?.styles || []} inventory={inventory} model={styleModel} selectedId={settings.styleId} disabled={locked}
                        onSelect={style => update({ styleId: style?.id || '', styleLoraStrength: undefined })} />
                    <button type="button" className={button} onClick={onManageStyles}>Manage styles</button>
                    {selectedStyle && <div className="rounded-lg bg-accent/10 p-3 text-sm">
                        {libraryStyle?.item && <p className="mb-2 text-xs text-accent">My Library: {libraryStyle.item.modelName || libraryStyle.item.fileName} · Auto-filled: {libraryStyle.filled.join(', ') || 'none (manual values kept)'}</p>}
                        {libraryStyle?.warnings.map(message => <p key={message} className="mb-2 text-xs text-amber-400">{message}</p>)}
                        <p className="break-all">{selectedStyle.lora || 'Prompt-only style'}</p>
                        {selectedStyle.lora && <div className="mt-2 flex flex-wrap items-end gap-2">
                            <label className="text-sm">Style LoRA strength<input aria-label="Style LoRA strength" type="number" step="0.05" className={input} value={settings.styleLoraStrength ?? selectedStyle.strength} onChange={event => update({ styleLoraStrength: event.target.valueAsNumber })} /></label>
                            <button type="button" className={button} onClick={() => update({ styleLoraStrength: undefined })}>Use gallery strength</button>
                            <p className="w-full text-xs text-text-muted">Applies to this generation only; the gallery style is unchanged.</p>
                        </div>}
                        <p className="mt-2 whitespace-pre-wrap text-text-secondary">{[selectedStyle.trigger, selectedStyle.prompt].filter(Boolean).join('\n') || 'No text trigger supplied.'}</p>
                        <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={settings.useStyleSettings} onChange={event => update({ useStyleSettings: event.target.checked })} />Apply style sampling overrides</label>
                        <p className="mt-1 text-xs">{Object.entries(selectedStyle.settings).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No overrides: workflow sampling values above are used.'}</p>
                    </div>}
                    <details open className="rounded-lg border border-accent/30 p-3">
                        <summary className="cursor-pointer font-semibold">Prompt preview — current settings</summary>
                        <p className="my-2 text-xs text-accent">{settings.prompt.trim() ? 'Additional editing prompt: added to every pose.' : 'Additional editing prompt: empty.'} {selectedStyle?.trigger.trim() ? 'Style trigger: added.' : 'No style trigger.'} {selectedStyle?.prompt.trim() ? 'Style prompt: added.' : 'No style prompt.'}</p>
                        <p className="mb-2 text-xs text-text-muted">Every pose receives the editing prompt and its own camera, expression and body-pose instructions. Later poses use the first edited image as reference. Requested changes take priority over reference posture and expression; style controls rendering only. Vision analysis supplies stable identity traits.</p>
                        <label className="block text-xs">Pose 1<textarea aria-label="Blazing pose 1 prompt preview" readOnly rows={5} className={input} value={prompts.initial} /></label>
                        {prompts.views.slice(0, poseCount - 1).map((prompt, index) => <details key={index} className="mt-2">
                            <summary className="cursor-pointer text-xs">Pose {index + 2} prompt</summary>
                            <textarea aria-label={`Blazing pose ${index + 2} prompt preview`} readOnly rows={4} className={input} value={prompt} />
                        </details>)}
                    </details>
                </fieldset>
                <fieldset disabled={locked} className="space-y-3 rounded-xl border border-border-primary p-4">
                    <h3 className="font-semibold">Additional LoRAs</h3><p className="text-xs text-text-muted">Independent of the selected style LoRA. Applied to all selected generations, after the style LoRA.</p>
                    <p className="text-xs text-text-muted">{styleModel}: {loraOptions.length - 1} compatible installed LoRAs. Legacy FLUX2 folders default to 9B unless explicitly classified as 4B.</p>
                    {settings.loras.map((lora, index) => <div key={index} className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lora.enabled} disabled={!lora.name} onChange={event => update({ loras: settings.loras.map((value, i) => i === index ? { ...value, enabled: event.target.checked } : value) })} />LoRA {index + 1}</label>
                        <SelectInput label={`Blazing LoRA ${index + 1} filename`} className="min-w-0 flex-1" selectClassName="min-w-0" disabled={locked} value={lora.name}
                            options={lora.name && !loraOptions.some(option => option.value === lora.name)
                                ? [...loraOptions, { value: lora.name, label: `${lora.name} (saved; unavailable in FLUX2 list)`, disabled: true }]
                                : loraOptions}
                            onChange={event => update({ loras: settings.loras.map((value, i) => i === index ? { ...value, name: event.target.value, enabled: !!event.target.value && value.enabled } : value) })} />
                        <input aria-label={`Blazing LoRA ${index + 1} strength`} className={`${input} !mt-0 !w-20`} type="number" step="0.05" value={lora.strength} onChange={event => update({ loras: settings.loras.map((value, i) => i === index ? { ...value, strength: event.target.valueAsNumber } : value) })} />
                    </div>)}
                </fieldset>
                <details className="rounded-xl border border-border-primary p-4"><summary className="cursor-pointer font-semibold">Vision & caption prompts</summary>
                    <fieldset disabled={locked} className="mt-3 space-y-3">{(['identitySystem', 'captionSystem'] as const).map(key => <label key={key} className="block text-sm">{key === 'identitySystem' ? 'Identity analysis system prompt' : 'Final six-pose caption system prompt'}<textarea rows={6} className={input} value={settings[key]} onChange={event => update({ [key]: event.target.value })} /></label>)}
                        <div className="grid grid-cols-2 gap-3">{(['identityTokens', 'captionTokens'] as const).map(key => <label key={key} className="text-sm">{key}<input type="number" min="1" className={input} value={settings[key]} onChange={event => update({ [key]: event.target.valueAsNumber })} /></label>)}</div>
                    </fieldset>
                </details>
                <div className="space-y-3 rounded-xl border border-accent/30 p-4">
                    <div className="flex flex-wrap gap-2"><button className={`${button} flex-1 bg-accent text-accent-text`} disabled={locked || !isComfyUIConnected || !draft.file || !!galleryError} onClick={() => void perform('generate')}>Generate {poseCount} pose{poseCount === 1 ? '' : 's'}</button>
                        {running && <button className={`${button} border-red-400 text-red-400`} disabled={cancelling} onClick={() => { setCancelling(true); setStatus('Cancelling the owned job...'); controller.current?.abort(); }}>{cancelling ? 'Cancelling...' : 'Cancel'}</button>}</div>
                    {!isComfyUIConnected && <p className="text-sm text-text-muted">Connect ComfyUI to generate. Styles and settings can be edited offline.</p>}
                    <p role="status" className="text-sm">{status}</p>
                    <progress aria-label="Blazing Fast progress" className="w-full accent-accent" value={progress} max={1} />
                    {previewURL && <img src={previewURL} alt="Current Blazing Fast sampling preview" className="max-h-80 w-full rounded-lg object-contain" />}
                </div>
            </div>
        </div>
        {latestInitialPrompt && <details open className="rounded-xl border border-accent/30 p-4"><summary className="cursor-pointer font-semibold">Latest run — actual initial prompt</summary>
            <textarea aria-label="Blazing actual initial prompt" readOnly rows={6} className={input} value={latestInitialPrompt} />
        </details>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{displayedOutputs.slice(0, 6).map((output, index) => {
            const image = result?.images.find(value => value.id === output.id);
            const url = image?.url || comfyOutputImage(live.outputs[output.id]);
            const active = live.node?.startsWith(output.decode.split(':')[0] + ':');
            return <article key={output.id} className={`min-w-0 space-y-2 rounded-xl border p-3 ${active ? 'border-accent' : 'border-border-primary'}`}>
                <h3 className="text-sm font-semibold">Pose {index + 1} · {url ? 'Ready' : active ? 'Generating...' : result ? 'Not generated' : 'Waiting'}</h3>
                {url ? <CreationSuiteResult key={`${result?.promptId || live.promptId}-${output.id}`} src={url} title={`Blazing pose ${index + 1}`} alt={`Blazing Fast generated pose ${index + 1}`} busy={locked || !image} onDownload={() => void perform('download', output.id)} onSave={() => perform('save', output.id)} />
                    : <div className="flex aspect-square items-center justify-center rounded-lg bg-bg-primary text-text-muted">Pose {index + 1}</div>}
                {image && <details><summary className="cursor-pointer text-xs text-accent">Caption & instructions</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{image.caption}</pre></details>}
            </article>;
        })}</div>
        {(result?.identity || comfyOutputText(live.outputs['358'])) && <details className="rounded-xl border border-border-primary p-4"><summary className="cursor-pointer font-semibold">Generated identity description</summary><p className="mt-3 whitespace-pre-wrap text-sm">{result?.identity || comfyOutputText(live.outputs['358'])}</p></details>}
        {result && <div className="space-y-4">
            <p className="text-sm">{result.outcome === 'complete' ? 'Completed' : `Stopped (${result.outcome})`} · {result.images.length} completed image(s) available. Only completed images are saved or downloaded.</p>
            <div className="flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={() => void perform('save')}>Save / retry Library ({savedCount}/{result.images.length})</button><button className={button} disabled={locked} onClick={() => void perform('download')}>Download {result.images.length} images + TXT (ZIP)</button></div>
            <div className="grid gap-4 lg:grid-cols-2">{result.images.filter(image => ['592', '364'].includes(image.id)).map(image => <div key={image.id} className="space-y-2"><h3 className="font-semibold">{image.label}</h3><CreationSuiteResult key={`${result.promptId}-${image.id}`} src={image.url} title={image.label} alt={image.label} busy={locked} onDownload={() => void perform('download', image.id)} onSave={() => perform('save', image.id)} /></div>)}</div>
            {result.finalCaption ? <label className="block text-sm font-semibold">Generated final caption<textarea aria-label="Generated final caption" readOnly rows={10} className={input} value={result.finalCaption} /></label>
                : <p className="text-sm text-text-muted">No final collage caption was generated. Available identity text and actual generation instructions are included in each image's TXT.</p>}
        </div>}
        <LibraryPickerModal isOpen={picker} onClose={() => setPicker(false)} filter={['image', 'character', 'extracted-frame']} hydrateMedia={false} onSelectItem={async item => {
            const blob = item.assetRefs?.media ? await getLibraryAssetBlob(item.assetRefs.media) : await fetch(item.media).then(response => { if (!response.ok) throw new Error('Cannot read this Library image.'); return response.blob(); });
            if (!blob.size || !blob.type.startsWith('image/')) throw new Error('Select a non-empty Library image.');
            setFile(new File([blob], `library-${item.id}.png`, { type: blob.type })); setPicker(false);
        }} />
    </section>;
};
