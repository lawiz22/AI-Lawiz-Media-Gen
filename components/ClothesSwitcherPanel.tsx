import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryAssetRole, LibraryItem } from '../types';
import { addToLibrary, deleteFromLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import { readRenderedLibraryMedia } from '../services/minimaxH3Library';
import { h3Choices, h3Input, isRecord, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import {
    applyClothesSwitcherParameters, buildClothesSwitcherWorkflow, clothesSwitcherParameterPreset, CLOTHES_SWITCHER_CONTROLS,
    CLOTHES_SWITCHER_LORA_IDS, defaultClothesSwitcherSettings, upgradeClothesSwitcherSettings, validateClothesSwitcherDraft,
    type ClothesSwitcherDraft, type ClothesSwitcherSnapshot, type ClothesSwitcherValue,
} from '../services/clothesSwitcherWorkflow';
import {
    generateClothesSwitcher, loadClothesSwitcherDraft, loadClothesSwitcherObjectInfo, prepareClothesSwitcherWorkflow,
    saveClothesSwitcherDraft, type ClothesSwitcherLive, type ClothesSwitcherResult,
} from '../services/clothesSwitcherService';
import { createVideoPlaceholderThumbnail } from '../utils/imageUtils';
import { useMediaURL } from './VideoReferenceEditor';
import { useUnmountCleanup } from './useUnmountCleanup';
import { useDraftAutosave } from './useDraftAutosave';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CreationSuiteResult as ResultImage } from './CreationSuiteResult';
import { PresetSaveModal } from './PresetSaveModal';
import { ConfirmationModal } from './ConfirmationModal';
import { SaveIcon, TrashIcon } from './icons';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const input = 'mt-1 w-full min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary';
const initial = (): ClothesSwitcherDraft => ({ settings: defaultClothesSwitcherSettings() });
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const titles: Record<string, string> = {
    '106': 'Diffusion model', '107': 'Text encoder', '110': 'VAE', '138': 'Sampler', '146': 'Resize',
    '148': 'Depth Anything V2 model', '161': 'Canny', '144': 'LoRA 1 - REMC', '165': 'LoRA 2 - kathl',
    '166': 'LoRA 3 - snofs', '168': 'LoRA 4', '167': 'CacheDiT', '9': 'Output',
};
const Accordion: React.FC<{ title: string; children: () => React.ReactNode }> = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return <details className="rounded-xl border border-border-primary p-4" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{title}</summary>{open && <div className="mt-4 space-y-4">{children()}</div>}
    </details>;
};
export const ClothesSwitcherPanel: React.FC<{
    isComfyUIConnected: boolean | null;
    onModelChange: (model: string) => void;
    pendingPreset?: LibraryItem | null;
    onPresetLoaded?: () => void;
}> = ({ isComfyUIConnected, onModelChange, pendingPreset, onPresetLoaded }) => {
    const dispatch = useDispatch<AppDispatch>(), globalBusy = useSelector((state: RootState) => state.generation.isLoading);
    const presets = useSelector((state: RootState) => state.library.items).filter(item => item.mediaType === 'preset' && item.clothesSwitcherOptions?.kind === 'parameters');
    const [selectedPresetId, setSelectedPresetId] = useState(''), [presetSaveOpen, setPresetSaveOpen] = useState(false), [presetDeleteOpen, setPresetDeleteOpen] = useState(false);
    const [draft, setDraft] = useState<ClothesSwitcherDraft>(initial), [ready, setReady] = useState(false);
    const [running, setRunning] = useState(false), [working, setWorking] = useState(false), [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState(''), [storageError, setStorageError] = useState(''), [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0), [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [picker, setPicker] = useState<'image' | 'preset' | null>(null), [live, setLive] = useState<ClothesSwitcherLive>({});
    const [result, setResult] = useState<ClothesSwitcherResult | null>(null), [resultDraft, setResultDraft] = useState<ClothesSwitcherDraft | null>(null);
    const latest = useRef(draft); latest.current = draft;
    const loaded = useRef(false), busy = useRef(false), saves = useRef<Promise<void>>(Promise.resolve());
    const controller = useRef<AbortController | null>(null), loadingPreset = useRef<number | null>(null);
    const locked = !ready || running || working || globalBusy, settings = draft.settings;
    const sourceURL = useMediaURL(draft.file), originalURL = useMediaURL(resultDraft?.file), previewURL = useMediaURL(live.preview);
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        loadClothesSwitcherDraft().then(value => { if (value) setDraft(value); setReady(true); })
            .catch(cause => setStorageError(`Could not restore Clothes Switcher. Saving is disabled to protect the existing draft. ${errorText(cause)}`));
    }, []);
    useDraftAutosave(draft, ready, value => {
        saves.current = saves.current.then(() => saveClothesSwitcherDraft(value)).then(() => setStorageError(''))
            .catch(cause => setStorageError(`Could not save Clothes Switcher locally: ${errorText(cause)}`));
    });
    useEffect(() => {
        if (!isComfyUIConnected) return;
        const abort = new AbortController();
        loadClothesSwitcherObjectInfo(abort.signal).then(setInfo).catch(cause => {
            if (!abort.signal.aborted) setError(`Could not load Clothes Switcher models/nodes. Use Check workflow to retry. ${errorText(cause)}`);
        });
        return () => abort.abort();
    }, [isComfyUIConnected]);
    useEffect(() => { onModelChange(`Clothes Switcher: ${settings.nodes['106'].unet_name}`); }, [settings.nodes['106'].unet_name, onModelChange]);
    const root = useUnmountCleanup(() => controller.current?.abort());
    const setValue = (id: string, name: string, value: ClothesSwitcherValue) => setDraft(current => ({ ...current, settings: {
        ...current.settings, nodes: { ...current.settings.nodes, [id]: { ...current.settings.nodes[id], [name]: value } },
    } }));
    const setFile = (file?: File) => {
        if (file && (!file.size || !file.type.startsWith('image/'))) { setError('Choose a non-empty image file.'); return; }
        setDraft(current => ({ ...current, file }));
    };
    const clearResults = () => { setResult(null); setResultDraft(null); setLive({}); };
    const restore = async (item: LibraryItem) => {
        const snapshot = item.clothesSwitcherOptions;
        if (!snapshot || snapshot.version !== 1) throw new Error('Choose a supported Clothes Switcher setup or image.');
        const restoredSettings = upgradeClothesSwitcherSettings(snapshot.settings);
        if (snapshot.kind === 'parameters') {
            setDraft(current => applyClothesSwitcherParameters(current, restoredSettings)); setSelectedPresetId(String(item.id));
            setError(''); setStatus('Clothes Switcher parameters loaded. The current photo and clothing prompt were kept.');
            return;
        }
        if (snapshot.kind !== undefined) throw new Error('Unsupported Clothes Switcher preset kind.');
        if (!window.confirm('Replace only Clothes Switcher settings and input with this Library setup? Other tabs will not change.')) return;
        let file: File | undefined;
        if (snapshot.input) {
            const ref = item.assetRefs?.sourceImage;
            if (!ref) throw new Error(`The setup is missing ${snapshot.input.name}. No draft was replaced.`);
            const blob = await getLibraryAssetBlob(ref);
            file = new File([blob], snapshot.input.name, { type: snapshot.input.type || blob.type, lastModified: snapshot.input.lastModified });
        }
        const restored = { settings: restoredSettings, file };
        validateClothesSwitcherDraft(restored);
        setDraft(restored); setSelectedPresetId(''); clearResults(); setError(''); setStatus('Clothes Switcher settings and original photo restored.');
    };
    useEffect(() => {
        if (!pendingPreset) { loadingPreset.current = null; return; }
        if (!pendingPreset.clothesSwitcherOptions || locked || loadingPreset.current === pendingPreset.id) return;
        loadingPreset.current = pendingPreset.id; busy.current = true; setWorking(true);
        void restore(pendingPreset).catch(cause => setError(errorText(cause))).finally(() => { busy.current = false; setWorking(false); onPresetLoaded?.(); });
    }, [pendingPreset, locked]);
    const fields = (id: string, omit: string[] = []) => <div key={id} className="space-y-2">
        <h4 className="text-sm font-semibold text-accent">{titles[id]}</h4>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(settings.nodes[id]).filter(([name]) => !omit.includes(name)).map(([name, value]) => {
            const type = CLOTHES_SWITCHER_CONTROLS[id].class_type, choices = h3Choices(info, type, name);
            const schema = h3Input(info, type, name), config = Array.isArray(schema) && isRecord(schema[1]) ? schema[1] : {};
            const label = `${titles[id]}: ${name.replaceAll('_', ' ')}`;
            return <label key={name} className="min-w-0 text-xs text-text-secondary">{name.replaceAll('_', ' ')}
                {typeof value === 'boolean' ? <input aria-label={label} type="checkbox" className="ml-2" checked={value} onChange={event => setValue(id, name, event.target.checked)} />
                : choices.length || ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'model'].includes(name) ? <select aria-label={label} className={input} value={String(value)} onChange={event => setValue(id, name, event.target.value)}>
                    {!choices.includes(String(value)) && <option value={String(value)}>{String(value) || 'Select a model'} (current / not listed)</option>}
                    {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                </select> : <input aria-label={label} className={input} type={typeof value === 'number' ? 'number' : 'text'} value={value}
                    min={typeof config.min === 'number' ? config.min : undefined} max={typeof value === 'number' ? Math.min(typeof config.max === 'number' ? config.max : Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : undefined}
                    step={Array.isArray(schema) && schema[0] === 'INT' || ['seed', 'steps', 'width', 'height', 'multiple_of'].includes(name) ? 1 : 'any'}
                    onChange={event => setValue(id, name, typeof value === 'number' ? Number(event.target.value) : event.target.value)} />}
            </label>;
        })}</div>
    </div>;
    const check = async () => {
        if (locked || busy.current) return;
        busy.current = true; setWorking(true); setError(''); setStatus('');
        try {
            validateClothesSwitcherDraft(latest.current);
            const nodes = await loadClothesSwitcherObjectInfo(undefined, true); setInfo(nodes);
            buildClothesSwitcherWorkflow(latest.current.settings, latest.current.file?.name || '', nodes);
            setStatus('Clothes Switcher nodes, models and parameters validated. No upload or job was queued.');
        } catch (cause) { setError(errorText(cause)); } finally { busy.current = false; setWorking(false); }
    };
    const run = async (exportOnly: boolean) => {
        if (locked || busy.current) return;
        busy.current = true; setRunning(true); setError(''); setStatus(''); setProgress(0); setCancelling(false);
        const snapshot = { settings: structuredClone(latest.current.settings), file: latest.current.file };
        if (!exportOnly) setLive({});
        const abort = new AbortController(); controller.current = abort;
        dispatch(setLoadingState({ isLoading: true, owner: 'clothes-switcher' }));
        try {
            if (exportOnly) {
                const workflow = await prepareClothesSwitcherWorkflow(snapshot, abort.signal);
                download(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }), 'clothes-switcher-api.json');
                setStatus('Clothes Switcher API exported with uploaded input. No job was queued.');
            } else {
                const generated = await generateClothesSwitcher(snapshot, abort.signal, (message, value) => { setStatus(message); setProgress(value); }, setLive);
                setResult(generated); setResultDraft({ ...snapshot, settings: generated.settings });
                setDraft(current => ({ ...current, settings: { ...current.settings, nodes: { ...current.settings.nodes,
                    '138': { ...current.settings.nodes['138'], seed: generated.settings.nodes['138'].seed } } } }));
            }
        } catch (cause) { setError(errorText(cause)); }
        finally {
            controller.current = null; busy.current = false; setRunning(false); setCancelling(false);
            setLive(current => ({ ...current, node: undefined })); dispatch(setLoadingState({ isLoading: false, owner: 'clothes-switcher' }));
        }
    };
    const save = async (output = false): Promise<boolean> => {
        if (locked || busy.current) return false;
        busy.current = true; setWorking(true); setError(''); setStatus('');
        try {
            const source = output ? resultDraft : latest.current;
            if (!source || output && !result) throw new Error('Generate an image before saving this result.');
            validateClothesSwitcherDraft(source);
            const metadata: ClothesSwitcherSnapshot = { version: 1, settings: structuredClone(source.settings),
                ...(source.file ? { input: { name: source.file.name, type: source.file.type, lastModified: source.file.lastModified } } : {}),
                ...(output && result ? { output: 'result', workflow: result.workflow, promptId: result.promptId } : {}) };
            const assetBlobs: Partial<Record<LibraryAssetRole, Blob>> = source.file ? { sourceImage: source.file } : {};
            let thumbnail = createVideoPlaceholderThumbnail(), warning = '';
            if (output && result) {
                const media = await readRenderedLibraryMedia(result.url, undefined, 'Clothes Switcher');
                if (media.mediaType !== 'image') throw new Error('Clothes Switcher returned a non-image result.');
                assetBlobs.media = media.blob; thumbnail = media.thumbnail; warning = media.warning || '';
            }
            await dispatch(addToLibrary({ mediaType: output ? 'image' : 'preset', media: output ? '' : JSON.stringify(metadata.settings), thumbnail,
                name: `Clothes Switcher - ${output ? 'result' : 'setup'}`, tags: ['clothes-switcher', 'flux2-klein'], clothesSwitcherOptions: metadata, assetBlobs })).unwrap();
            setStatus(`Clothes Switcher ${output ? 'result' : 'setup'} saved to Library with settings and original photo.${warning ? ` ${warning}` : ''}`);
            return true;
        } catch (cause) { setError(errorText(cause)); return false; } finally { busy.current = false; setWorking(false); }
    };
    const saveParameterPreset = async (name: string) => {
        if (locked || busy.current) return;
        busy.current = true; setWorking(true); setError('');
        try {
            const metadata = clothesSwitcherParameterPreset(latest.current.settings);
            const item = await dispatch(addToLibrary({ mediaType: 'preset', media: '', thumbnail: '',
                name: `CLOTHES-SWITCHER_FLUX2_Param_${name}`, tags: ['clothes-switcher'], clothesSwitcherOptions: metadata })).unwrap();
            setSelectedPresetId(String(item.id)); setStatus('Clothes Switcher parameter preset saved to Library.');
        } catch (cause) { setError(errorText(cause)); } finally { busy.current = false; setWorking(false); }
    };
    const deleteParameterPreset = async () => {
        if (locked || busy.current || !selectedPresetId) return;
        busy.current = true; setWorking(true); setError('');
        try {
            await dispatch(deleteFromLibrary(Number(selectedPresetId))).unwrap();
            setSelectedPresetId(''); setStatus('Clothes Switcher parameter preset deleted.');
        } catch (cause) { setError(errorText(cause)); } finally { busy.current = false; setWorking(false); }
    };
    return <section ref={root} className="min-w-0 space-y-5 rounded-2xl border border-accent/20 bg-bg-secondary p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-accent">Clothes Switcher</h2>
            <p className="mt-1 text-sm text-text-secondary">The supplied FLUX2 Klein 9B workflow: original photo + depth + Canny references, with no automatic prompt rewriting.</p></div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <select aria-label="Clothes Switcher preset" className={`${input} !mt-0 !w-auto max-w-full sm:max-w-64`} disabled={locked}
                value={presets.some(item => String(item.id) === selectedPresetId) ? selectedPresetId : ''} onChange={event => {
                    if (locked || busy.current) return;
                    const item = presets.find(candidate => String(candidate.id) === event.target.value);
                    if (item) void restore(item).catch(cause => setError(errorText(cause))); else setSelectedPresetId('');
                }}>
                <option value="">Load Preset...</option>{presets.map(item => <option key={item.id} value={item.id}>{item.name?.replace(/^CLOTHES-SWITCHER_FLUX2_Param_/, '') || `Preset ${item.id}`}</option>)}
            </select>
            <button type="button" className={button} title="Save Current Parameters as Preset" aria-label="Save Clothes Switcher preset" disabled={locked} onClick={() => setPresetSaveOpen(true)}><SaveIcon className="h-4 w-4" /></button>
            {presets.some(item => String(item.id) === selectedPresetId) && <button type="button" className={button} title="Delete Selected Preset" aria-label="Delete Clothes Switcher preset" disabled={locked} onClick={() => setPresetDeleteOpen(true)}><TrashIcon className="h-4 w-4" /></button>}
            <button type="button" className={button} disabled={locked} onClick={() => {
                if (!window.confirm('Reset only Clothes Switcher to the supplied workflow defaults and clear its input/results?')) return;
                setDraft(initial()); setSelectedPresetId(''); clearResults(); setError(''); setStatus('');
            }}>Start from scratch</button></div></div>
        {error && <p role="alert" className="whitespace-pre-wrap rounded-lg border border-red-400/40 p-3 text-sm text-red-300">{error}</p>}
        {storageError && <p role="alert" className="text-sm text-red-300">{storageError}</p>}
        {status && <p role="status" className="text-sm text-text-secondary">{status}</p>}
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
            <aside aria-label="Clothes Switcher options" className="order-2 min-w-0 lg:order-1">
                <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
                    <legend className="mb-3 font-bold">Photo and workflow options</legend>
                    <div className="min-w-0 space-y-3 rounded-xl border border-border-primary p-3"><h3 className="font-semibold">Original photo</h3>
                        <input aria-label="Clothes Switcher original photo" type="file" accept="image/*" className="w-full text-xs" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) setFile(selected); }} />
                        <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setPicker('image')}>Load image from Library</button>{draft.file && <button type="button" className={button} onClick={() => setFile()}>Remove image</button>}</div>
                        <p className="break-all text-xs text-text-secondary">{draft.file?.name || 'No image selected'}</p>
                        {sourceURL && <img src={sourceURL} alt="Original Clothes Switcher photo" className="max-h-80 w-full object-contain" />}
                    </div>
                    <Accordion title="Models and encoders">{() => <>{['106', '107', '110'].map(id => fields(id))}</>}</Accordion>
                    <Accordion title="LoRAs - up to four">{() => <>{CLOTHES_SWITCHER_LORA_IDS.map((id, index) => <div key={id} className="space-y-3">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.loraEnabled[id]} onChange={event => setDraft(current => ({ ...current, settings: { ...current.settings,
                            loraEnabled: { ...current.settings.loraEnabled, [id]: event.target.checked } } }))} />Enable LoRA {index + 1}</label>
                        {settings.loraEnabled[id] && fields(id)}
                    </div>)}</>}</Accordion>
                    <Accordion title="CacheDiT acceleration">{() => <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.nodes['167'].enable === true} onChange={event => setValue('167', 'enable', event.target.checked)} />Enable CacheDiT</label>
                        {settings.nodes['167'].enable === true && fields('167', ['enable'])}</>}</Accordion>
                    <Accordion title="Sampling and seed">{() => <>{fields('138')}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSeed} onChange={event => setDraft(current => ({ ...current, settings: { ...current.settings, randomizeSeed: event.target.checked } }))} />Randomize seed</label></>}</Accordion>
                    <Accordion title="Resize, Depth Anything V2 and Canny">{() => <>{['146', '148', '161'].map(id => fields(id))}</>}</Accordion>
                    <Accordion title="Negative prompt and output">{() => <><label className="block text-sm">Negative prompt<textarea aria-label="Clothes Switcher negative prompt" className={input} rows={4} value={String(settings.nodes['109'].text)} onChange={event => setValue('109', 'text', event.target.value)} /></label>{fields('9')}</>}</Accordion>
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void check()}>Check workflow</button>
                        <button type="button" className={button} onClick={() => void run(true)}>Export API workflow</button>
                        <button type="button" className={button} onClick={() => void save()}>Save setup to Library</button>
                        <button type="button" className={button} onClick={() => setPicker('preset')}>Load setup from Library</button></div>
                </fieldset>
            </aside>
            <div aria-label="Clothes Switcher prompt and generation" className="order-1 min-w-0 space-y-4 lg:order-2">
                <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
                    <legend className="mb-3 font-bold">Prompt and generation</legend>
                    <label className="block text-sm">Describe the clothing change<textarea aria-label="Clothes Switcher prompt" className={input} rows={7} placeholder="Describe the outfit you want..." value={String(settings.nodes['108'].text)} onChange={event => setValue('108', 'text', event.target.value)} /></label>
                    <p className="text-xs text-text-secondary">Sent verbatim to CLIP. Up to four independently enabled LoRAs run in slot order before CacheDiT. The three original slots default to 1 / 0.9 / 0.8; slot 4 starts disabled.</p>
                    <button type="button" className={`${button} w-full border-accent/50 bg-accent/10 py-3 text-accent`} disabled={!isComfyUIConnected || !draft.file} onClick={() => void run(false)}>Generate Clothes Switcher</button>
                </fieldset>
                {running && <div className="space-y-2"><progress aria-label="Clothes Switcher progress" className="w-full" max={1} value={progress} />
                    <button type="button" className={button} disabled={cancelling} onClick={() => { setCancelling(true); controller.current?.abort(); }}>Cancel this job</button>
                    <p className="text-xs text-text-secondary">Targets only this job; never sends a global interrupt.</p></div>}
                <ClothesSwitcherPreviews live={live} />
                {running && previewURL && <figure><img src={previewURL} alt="Clothes Switcher live sampling preview" className="max-h-96 w-full rounded-lg object-contain" /><figcaption className="text-xs text-text-secondary">Sampling{live.step !== undefined ? `: ${live.step} / ${live.total}` : ''}</figcaption></figure>}
                {result && <div key={result.promptId} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Clothes Switcher result</h3>
                        <button type="button" className={`${button} text-xs`} onClick={() => download(new Blob([JSON.stringify(result.workflow, null, 2)], { type: 'application/json' }), 'clothes-switcher-executed-api.json')}>Export executed API</button></div>
                    <ResultImage src={result.url} alt="Clothes Switcher output" title="Clothes Switcher result" busy={locked} onSave={() => save(true)} onDownload={() => {
                        void readRenderedLibraryMedia(result.url, undefined, 'Clothes Switcher').then(media => download(media.blob, 'clothes-switcher.png')).catch(cause => setError(errorText(cause)));
                    }} />
                    {originalURL && <ClothesSwitcherComparison before={originalURL} after={result.url} />}
                </div>}
            </div>
        </div>
        <PresetSaveModal isOpen={presetSaveOpen} onClose={() => setPresetSaveOpen(false)} onSave={name => { void saveParameterPreset(name); }} />
        <ConfirmationModal isOpen={presetDeleteOpen} onClose={() => setPresetDeleteOpen(false)} onConfirm={() => { void deleteParameterPreset(); }}
            title="Delete Preset" message={`Delete "${presets.find(item => String(item.id) === selectedPresetId)?.name || 'this preset'}"? This cannot be undone.`} confirmLabel="Delete" isDanger />
        {picker && <LibraryPickerModal isOpen onClose={() => setPicker(null)} filter={picker === 'preset' ? ['preset', 'image'] : ['image', 'character', 'extracted-frame']} hydrateMedia={false} onSelectItem={async item => {
            if (locked || busy.current) return;
            busy.current = true; setWorking(true); setError('');
            try {
                if (picker === 'preset') await restore(item);
                else {
                    let blob: Blob;
                    if (item.assetRefs?.media) blob = await getLibraryAssetBlob(item.assetRefs.media);
                    else { const response = await fetch(item.media); if (!response.ok) throw new Error(`Could not read the Library photo (${response.status}).`); blob = await response.blob(); }
                    if (!blob.size || !blob.type.startsWith('image/')) throw new Error('The Library item does not contain a valid image.');
                    setFile(new File([blob], `library-${item.id}.png`, { type: blob.type }));
                }
                setPicker(null);
            } catch (cause) { setError(errorText(cause)); } finally { busy.current = false; setWorking(false); }
        }} />}
    </section>;
};
export const ClothesSwitcherPreviews: React.FC<{ live: ClothesSwitcherLive }> = ({ live }) => <section aria-label="Clothes Switcher workflow previews" className="space-y-3 rounded-xl border border-border-primary p-3">
    <h3 className="font-semibold">Workflow previews</h3>
    <div className="grid gap-3 sm:grid-cols-2">{([['Depth Anything V2 - depth map', live.depthUrl], ['Canny - edge map', live.cannyUrl]] as const).map(([title, url]) => <figure key={title} className="min-w-0 space-y-2">
        <figcaption className="text-sm text-text-secondary">{title}</figcaption>
        {url ? <img src={url} alt={title} className="max-h-80 w-full rounded-lg bg-black object-contain" /> : <p className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border-primary p-3 text-center text-xs text-text-secondary">Appears when this workflow node completes.</p>}
    </figure>)}</div>
</section>;
export const ClothesSwitcherComparison: React.FC<{ before: string; after: string }> = ({ before, after }) => {
    const [position, setPosition] = useState(50), [aspect, setAspect] = useState('1 / 1'), [error, setError] = useState('');
    return <section aria-label="Clothes Switcher before after" className="space-y-3 rounded-xl border border-border-primary p-3">
        <h3 className="font-semibold">Compare original / result</h3>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: aspect }}>
            <img src={after} alt="Comparison result" className="absolute inset-0 h-full w-full object-contain" onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setAspect(`${image.naturalWidth} / ${image.naturalHeight}`); }} onError={() => setError('Could not load the comparison result. Check that the output still exists on ComfyUI.')} />
            <img src={before} alt="Comparison original" className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} onError={() => setError('Could not load the original comparison photo.')} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l-2 border-accent" style={{ left: `${position}%` }} />
        </div>
        <div className="flex justify-between text-xs text-text-secondary"><span>Original</span><span>Result</span></div>
        <label className="flex items-center gap-3 text-sm">Original / result<input aria-label="Clothes Switcher before after comparison" className="min-w-0 flex-1 accent-accent" type="range" min="0" max="100" value={position} onChange={event => setPosition(Number(event.target.value))} /><span>{position}%</span></label>
    </section>;
};
