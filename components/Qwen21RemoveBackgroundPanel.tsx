import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { GenerationOptions, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { cancelComfyUIExecution, generateComfyUIRemoveBackground, generateComfyUIQwen21Edit } from '../services/comfyUIService';
import { buildQwen21RemoveBackgroundWorkflow, defaultQwen21RemoveBackgroundOptions, getQwen21Choices, validateQwen21RemoveBackgroundReadiness } from '../services/qwen21Workflow';
import { buildQwen21EditWorkflow, defaultQwen21EditOptions, validateQwen21EditReadiness } from '../services/qwen21Workflow';
import type { Qwen21RemoveBackgroundOptions, Qwen21EditOptions, Qwen21EditMode, Qwen21Lora } from '../services/qwen21Workflow';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider } from './InputComponents';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, ResetIcon, SaveIcon, SpinnerIcon } from './icons';

interface Props { options: GenerationOptions; updateOptions: (change: Partial<GenerationOptions>) => void; sourceFile: File | null; onSourceChange: (file: File | null) => void; isComfyUIConnected: boolean | null; objectInfo: any; editMode?: Qwen21EditMode }
interface Result { src: string; before: string; original: string; prompt: string; seed: number; width: number; height: number; seconds: number; options: GenerationOptions }
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary disabled:opacity-50';
const checkerboard: React.CSSProperties = { backgroundColor: '#e4e4e7', backgroundImage: 'conic-gradient(#a1a1aa 25%, transparent 0 50%, #a1a1aa 0 75%, transparent 0)', backgroundSize: '20px 20px' };
const Fold: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide = false }) => {
    const [open, setOpen] = useState(wide);
    return <div className={wide ? 'pt-4' : 'border-t border-border-primary pt-2'}><button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className={wide ? 'flex w-full items-center justify-between border-b border-accent/30 pb-2 text-left text-base font-bold uppercase text-accent' : 'flex w-full items-center justify-between py-2 text-left text-sm font-bold text-accent'}><span>{title}</span><span aria-hidden="true">{open ? '-' : '+'}</span></button>{open && <div className={wide ? 'mt-4' : 'space-y-3 pt-3'}>{children}</div>}</div>;
};
const Qwen21RemoveBackgroundPanel: React.FC<Props> = ({ options, updateOptions, sourceFile, onSourceChange, isComfyUIConnected, objectInfo, editMode }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const settingsKey = editMode === 'turbo' ? 'comfyQwen21EditTurbo' : editMode === 'consistency' ? 'comfyQwen21EditConsistency' : 'comfyQwen21RemoveBackground';
    const defaults = () => editMode ? defaultQwen21EditOptions(editMode) : defaultQwen21RemoveBackgroundOptions();
    const settings = options[settingsKey] || defaults();
    const editSettings = editMode ? settings as Qwen21EditOptions : null;
    const extraLoras: Qwen21Lora[] = Array.from({ length: 4 }, (_, index) => editSettings?.extraLoras?.[index] || { name: '', enabled: false, modelStrength: 1, clipStrength: 1 });
    const title = editMode === 'turbo' ? 'I2I Turbo' : editMode === 'consistency' ? 'I2I Consistency' : 'Remove Background';
    const model = editMode === 'turbo' ? 'qwen21-i2i-turbo' : editMode === 'consistency' ? 'qwen21-i2i-consistency' : 'qwen21-remove-background';
    const [result, setResult] = useState<Result | null>(null);
    const [running, setRunning] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadingSource, setLoadingSource] = useState(false);
    const [saved, setSaved] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [compare, setCompare] = useState(true);
    const [position, setPosition] = useState(50);
    const busy = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const locked = running || saving || loadingSource || otherBusy;
    const update = (change: Partial<Qwen21EditOptions>) => updateOptions({ [settingsKey]: { ...settings, ...change } });
    const updateExtraLora = (index: number, change: Partial<Qwen21Lora>) => update({ extraLoras: extraLoras.map((lora, slot) => slot === index ? { ...lora, ...change } : lora) });
    let readiness = '';
    try {
        const resolved = { ...settings, seed: settings.seed === -1 ? 0 : settings.seed };
        const graph = editMode ? buildQwen21EditWorkflow('source.png', resolved as Qwen21EditOptions, editMode) : buildQwen21RemoveBackgroundWorkflow('source.png', resolved);
        if (isComfyUIConnected && objectInfo) (editMode ? validateQwen21EditReadiness : validateQwen21RemoveBackgroundReadiness)(graph, objectInfo);
    } catch (failure) { readiness = failure instanceof Error ? failure.message : 'Invalid Remove Background settings.'; }
    const canGenerate = !!sourceFile && !!isComfyUIConnected && !!objectInfo && !readiness && !locked;
    const select = (label: string, key: keyof Qwen21RemoveBackgroundOptions, node: string, input: string) => <label className="block min-w-0 text-sm text-text-secondary">{label}<select aria-label={label} className={inputClass} disabled={locked} value={String(settings[key])} onChange={event => update({ [key]: event.target.value })}>{[...new Set([String(settings[key]), ...getQwen21Choices(objectInfo, node, input)])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
    const chooseLibrary = async (item: LibraryItem) => {
        setLibraryOpen(false);
        if (locked || busy.current) return;
        busy.current = true; setLoadingSource(true); setError('');
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error('Could not open the Library image.');
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) throw new Error('Choose a Library image.');
            onSourceChange(new File([blob], `${item.name || 'source'}.png`, { type: blob.type }));
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load image.'); }
        finally { busy.current = false; setLoadingSource(false); }
    };
    const generate = async () => {
        if (!canGenerate || !sourceFile || busy.current) return;
        busy.current = true; setRunning(true); setStopping(false); setError('');
        const cancellation = new AbortController(); controller.current = cancellation;
        const snapshot = structuredClone(settings); const generationOptions = structuredClone(options); const file = sourceFile; const started = performance.now();
        dispatch(setLoadingState({ isLoading: true }));
        try {
            const original = await fileToDataUrl(file);
            const report = (text: string, value: number) => { setMessage(text); setProgress(value); };
            const generated = editMode ? await generateComfyUIQwen21Edit(file, snapshot as Qwen21EditOptions, editMode, report, cancellation.signal) : await generateComfyUIRemoveBackground(file, snapshot, report, cancellation.signal);
            const image = new Image(); image.src = generated.src; await image.decode(); cancellation.signal.throwIfAborted();
            setResult({ ...generated, original, width: image.naturalWidth, height: image.naturalHeight, seconds: (performance.now() - started) / 1000,
                options: { ...generationOptions, provider: 'comfyui', comfyModelType: model, comfyPrompt: generated.prompt, comfyNegativePrompt: snapshot.negativePrompt, comfySeed: generated.seed, [settingsKey]: { ...snapshot, seed: generated.seed } } });
            setSaved(false); setPosition(50);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Remove Background failed.'); }
        finally { busy.current = false; controller.current = null; setRunning(false); setStopping(false); dispatch(setLoadingState({ isLoading: false })); }
    };
    const stop = async () => {
        if (!running || stopping) return;
        setStopping(true); controller.current?.abort(new Error('Operation was cancelled by the user.'));
        await cancelComfyUIExecution();
    };
    const save = async () => {
        if (!result || saved || locked || busy.current) return;
        busy.current = true; setSaving(true); setError('');
        const snapshot = result;
        try {
            await dispatch(addToLibrary({ mediaType: 'image', name: `${title} - ${snapshot.width}x${snapshot.height}`, media: snapshot.src, thumbnail: await dataUrlToThumbnail(snapshot.src, 256), sourceImage: snapshot.original,
                prompt: snapshot.prompt, options: snapshot.options, tags: ['qwen21', editMode ? `i2i-${editMode}` : 'remove-background'] })).unwrap();
            setSaved(true);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save PNG to Library.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const reset = () => { if (locked || busy.current) return; updateOptions({ [settingsKey]: defaults() }); setResult(null); setSaved(false); setError(''); setPosition(50); setCompare(true); };
    return <section aria-label={`Qwen 2.1 ${title}`} className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary pb-3"><h2 className="text-xl font-bold text-accent">{title}</h2><button type="button" className={buttonClass} onClick={reset} disabled={locked}><ResetIcon className="h-4 w-4" />Reset</button></header>
        {!isComfyUIConnected && <p role="status" className="text-sm text-text-secondary">ComfyUI disconnected.</p>}
        {(error || readiness) && <p role="alert" className="rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">{error || readiness}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
                <ImageUploader id={editMode ? `qwen21-i2i-${editMode}-source` : 'qwen21-remove-background-source'} label="1. Source Image" sourceFile={sourceFile} onImageUpload={onSourceChange} disabled={locked} />
                <button type="button" className={`${buttonClass} w-full`} disabled={locked} onClick={() => setLibraryOpen(true)}><LibraryIcon className="h-4 w-4" />Choose from Library</button>
                <label className="block text-sm text-text-secondary">Output Size<select aria-label="Output Size" className={inputClass} disabled={locked} value={[1, 2.25, 4].includes(settings.megapixels) ? settings.megapixels : 'custom'} onChange={event => { if (event.target.value !== 'custom') update({ megapixels: Number(event.target.value) }); }}><option value="1">1024 / 1 MP</option><option value="2.25">1536 / 2.25 MP</option><option value="4">2048 / 4 MP</option>{![1, 2.25, 4].includes(settings.megapixels) && <option value="custom">Custom / {settings.megapixels} MP</option>}</select></label>
                <NumberSlider label="Output Megapixels" min={0.01} max={16} step={0.01} value={settings.megapixels} allowDirectInput disabled={locked} onChange={event => update({ megapixels: Number(event.target.value) })} />
                <label className="block text-sm text-text-secondary">Seed (-1 = random)<input aria-label={`${title} Seed`} type="number" className={inputClass} min={-1} max={Number.MAX_SAFE_INTEGER} step={1} value={settings.seed} disabled={locked} onChange={event => update({ seed: Number(event.target.value) })} /></label>
                <Fold title="Models & CLIP">
                    {select('Diffusion Model', 'unet', 'UNETLoader', 'unet_name')}{select('Weight Dtype', 'weightDtype', 'UNETLoader', 'weight_dtype')}{select('CLIP', 'clip', 'CLIPLoader', 'clip_name')}{select('CLIP Device', 'clipDevice', 'CLIPLoader', 'device')}{select('VAE', 'vae', 'VAELoader', 'vae_name')}
                    {select('Attention', 'attention', 'ModelAttentionBackend', 'attention')}{select('Cache Device', 'cacheDevice', 'QwenImage21Cache', 'device')}{select('Cache Dtype', 'cacheDtype', 'QwenImage21Cache', 'dtype')}
                </Fold>
                <Fold title="Reference Settings">
                    {select('Reference Upscale Method', 'referenceUpscale', 'ImageScaleToTotalPixels', 'upscale_method')}
                    <NumberSlider label="Resolution Steps" min={1} max={256} step={1} value={settings.resolutionSteps} allowDirectInput disabled={locked} onChange={event => update({ resolutionSteps: Number(event.target.value) })} />
                    <NumberSlider label="Encoder Resolution" min={0} max={4096} step={32} value={settings.referenceResolution} allowDirectInput disabled={locked} onChange={event => update({ referenceResolution: Number(event.target.value) })} />
                </Fold>
                <Fold title="Sampler Settings">
                    {select('Sampler', 'sampler', editMode === 'turbo' ? 'KSamplerSelect' : 'KSampler', 'sampler_name')}{select('Scheduler', 'scheduler', editMode === 'turbo' ? 'BasicScheduler' : 'KSampler', 'scheduler')}
                    <NumberSlider label={editMode === 'turbo' ? 'Base Steps' : 'Steps'} min={1} max={100} step={1} value={settings.steps} allowDirectInput disabled={locked} onChange={event => update({ steps: Number(event.target.value) })} />
                    {editMode !== 'turbo' && <NumberSlider label="CFG" min={0} max={20} step={0.1} value={settings.cfg} allowDirectInput disabled={locked} onChange={event => update({ cfg: Number(event.target.value) })} />}
                    <NumberSlider label="Denoise" min={0} max={1} step={0.01} value={settings.denoise} allowDirectInput disabled={locked} onChange={event => update({ denoise: Number(event.target.value) })} />
                    {editMode !== 'turbo' && <label className="block text-sm text-text-secondary">Negative Prompt<textarea aria-label="Negative Prompt" className={inputClass} rows={3} value={settings.negativePrompt} disabled={locked} onChange={event => update({ negativePrompt: event.target.value })} /></label>}
                    {editMode === 'turbo' && editSettings && <>
                        <NumberSlider label="Intermediate Steps" min={1} max={20} step={1} value={editSettings.intermediateSteps} allowDirectInput disabled={locked} onChange={event => update({ intermediateSteps: Number(event.target.value) })} />
                        <NumberSlider label="Max Shift" min={0} max={2} step={0.01} value={editSettings.maxShift} allowDirectInput disabled={locked} onChange={event => update({ maxShift: Number(event.target.value) })} />
                        <NumberSlider label="Base Shift" min={0} max={2} step={0.01} value={editSettings.baseShift} allowDirectInput disabled={locked} onChange={event => update({ baseShift: Number(event.target.value) })} />
                        <NumberSlider label="Start Sigma" min={-1} max={1} step={0.01} value={editSettings.startSigma} allowDirectInput disabled={locked} onChange={event => update({ startSigma: Number(event.target.value) })} />
                        <NumberSlider label="End Sigma" min={0} max={1} step={0.01} value={editSettings.endSigma} allowDirectInput disabled={locked} onChange={event => update({ endSigma: Number(event.target.value) })} />
                        <label className="block text-sm text-text-secondary">Sigma Spacing<select aria-label="Sigma Spacing" className={inputClass} value={editSettings.spacing} disabled={locked} onChange={event => update({ spacing: event.target.value })}>{[...new Set([editSettings.spacing, ...getQwen21Choices(objectInfo, 'ExtendIntermediateSigmas', 'spacing')])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                    </>}
                </Fold>
            </div>
            <div className="min-w-0 space-y-4">
                <label className="block text-sm text-text-secondary">{title} Prompt<textarea aria-label={`${title} Prompt`} className={inputClass} rows={4} value={settings.prompt} disabled={locked} onChange={event => update({ prompt: event.target.value })} /></label>
                <div className="flex flex-wrap justify-end gap-2">{running && <button type="button" className={buttonClass} onClick={stop} disabled={stopping}><CloseIcon className="h-4 w-4" />{stopping ? 'Stopping...' : 'Stop'}</button>}<button type="button" className={`${buttonClass} !border-accent bg-accent !text-accent-text`} onClick={generate} disabled={!canGenerate}>{running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{running ? editMode ? 'Editing...' : 'Removing...' : editMode ? 'Generate' : 'Remove Background'}</button></div>
                {running && <div role="status" className="space-y-2"><p className="text-xs text-text-secondary">{message}</p><progress aria-label={`${title} progress`} value={progress} max={1} className="w-full accent-accent" /></div>}
                {result && <div className="space-y-4 border-t border-border-primary pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Result <span className="text-xs font-normal text-text-secondary">{result.width} x {result.height} / {result.seconds.toFixed(1)} s</span></h3><div className="flex flex-wrap gap-2"><a className={buttonClass} href={result.src} download={`${model}-${result.seed}.png`} title={editMode ? 'Download PNG' : 'Download transparent PNG'} aria-label={editMode ? 'Download PNG' : 'Download transparent PNG'}><DownloadIcon className="h-4 w-4" /></a><button type="button" className={buttonClass} onClick={save} disabled={locked || saved} aria-label="Save PNG to Library" title="Save PNG to Library">{saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved ? 'Saved' : 'Save to Library'}</button><SendToLTXButton imageDataUrl={result.src} prompt={result.prompt} className={buttonClass} /></div></div>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Compare before / after</label>
                    <div className="relative mx-auto overflow-hidden" style={{ ...checkerboard, width: '100%', maxWidth: 520 * result.width / result.height, aspectRatio: `${result.width} / ${result.height}` }}>
                        <img src={result.src} alt={editMode ? 'Edited image' : 'Transparent background result'} className="absolute h-full w-full object-contain" />
                        {compare && <><img src={result.before} alt="Workflow resized source" className="absolute h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} /><div className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${position}%` }} /></>}
                    </div>
                    {compare && <><div className="flex justify-between text-xs text-text-secondary"><span>Before</span><span>After</span></div><input aria-label="Before / after comparison" type="range" min={0} max={100} value={position} onChange={event => setPosition(Number(event.target.value))} className="w-full accent-accent" /></>}
                    <p className="text-xs text-text-muted">Seed {result.seed}</p>
                </div>}
                {editSettings && <Fold title="LoRA Settings" wide>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {[editSettings.lora, ...extraLoras].map((lora, index) => {
                            const label = index === 0 ? 'LoRA' : `Additional LoRA ${index}`;
                            const changeLora = (change: Partial<Qwen21Lora>) => index === 0 ? update({ lora: { ...lora, ...change } }) : updateExtraLora(index - 1, change);
                            return <div key={index} className="min-w-0 space-y-3 border-b border-border-primary pb-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" aria-label={index === 0 ? 'Enable edit LoRA' : `Enable additional LoRA ${index}`} checked={lora.enabled} disabled={locked} className="h-4 w-4 accent-accent" onChange={event => changeLora({ enabled: event.target.checked })} />{index === 0 ? editMode === 'turbo' ? 'Turbo LoRA' : 'Consistency LoRA' : label}</label>
                                <label className="block text-sm font-medium text-text-secondary">{label} Model<select aria-label={`${label} Model`} className={inputClass} disabled={locked} value={lora.name} onChange={event => changeLora({ name: event.target.value, enabled: !!event.target.value })}>{[...new Set(['', lora.name, ...getQwen21Choices(objectInfo, 'LoraLoader', 'lora_name'), ...getQwen21Choices(objectInfo, 'LoraLoaderModelOnly', 'lora_name')])].map(name => <option key={name} value={name}>{name || 'None'}</option>)}</select></label>
                                {lora.name && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <NumberSlider label={`${label} Model Strength`} min={-2} max={2} step={0.05} value={lora.modelStrength} allowDirectInput disabled={locked || !lora.enabled} onChange={event => changeLora({ modelStrength: Number(event.target.value) })} />
                                    <NumberSlider label={`${label} CLIP Strength`} min={-2} max={2} step={0.05} value={lora.clipStrength} allowDirectInput disabled={locked || !lora.enabled} onChange={event => changeLora({ clipStrength: Number(event.target.value) })} />
                                </div>}
                            </div>;
                        })}
                    </div>
                </Fold>}
            </div>
        </div>
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={item => { void chooseLibrary(item); }} filter={['image', 'character', 'clothes', 'hair', 'object', 'extracted-frame', 'group-fusion', 'swap-anything', 'past-forward-photo']} />
    </section>;
};
export default Qwen21RemoveBackgroundPanel;