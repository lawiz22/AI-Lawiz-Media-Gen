import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { GenerationOptions } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { cancelComfyUIExecution, generateComfyUICharacterSheet } from '../services/comfyUIService';
import { buildQwen21CharacterSheetWorkflow, characterSheetCropRects, defaultQwen21CharacterSheetOptions, getQwen21Choices, QWEN21_CHARACTER_SIZES, qwen21CharacterDimensions, qwen21CharacterPrompt, validateQwen21CharacterReadiness } from '../services/qwen21Workflow';
import type { Qwen21CharacterSheetOptions } from '../services/qwen21Workflow';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { NumberSlider } from './InputComponents';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, CropIcon, DownloadIcon, GenerateIcon, LibraryIcon, ResetIcon, SaveIcon, SpinnerIcon } from './icons';

interface Props {
    options: GenerationOptions; onOptionsChange: (change: Partial<GenerationOptions>) => void;
    sourceFile: File | null; onSourceChange: (file: File | null) => void; onOpenLibrary: () => void;
    characterName: string; onNameChange: (name: string) => void;
    isComfyUIConnected: boolean | null; objectInfo: any;
}
interface SheetResult { src: string; source: string; options: GenerationOptions; settings: Qwen21CharacterSheetOptions; prompt: string; name: string; width: number; height: number; seconds: number }
interface SheetView { src: string; x: number; y: number; width: number; height: number; cuts: number[] }
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary disabled:opacity-50';
const Fold: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return <div className="border-t border-border-primary pt-2"><button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center justify-between py-2 text-left text-sm font-bold text-accent"><span>{title}</span><span aria-hidden="true">{open ? '-' : '+'}</span></button>{open && <div className="space-y-3 pt-3">{children}</div>}</div>;
};
const cropSheet = async (src: string, cuts: number[]): Promise<SheetView[]> => {
    const image = new Image(); image.src = src; await image.decode();
    return characterSheetCropRects(image.naturalWidth, image.naturalHeight, cuts).map(rect => {
        const canvas = document.createElement('canvas'); canvas.width = rect.width; canvas.height = rect.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create individual view images.');
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        return { ...rect, src: canvas.toDataURL('image/png'), cuts: [...cuts] };
    });
};
const Qwen21CharacterSheetPanel: React.FC<Props> = ({ options, onOptionsChange, sourceFile, onSourceChange, onOpenLibrary, characterName, onNameChange, isComfyUIConnected, objectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const settings = options.qwen21CharacterSheet || defaultQwen21CharacterSheetOptions();
    const [result, setResult] = useState<SheetResult | null>(null);
    const [views, setViews] = useState<SheetView[]>([]);
    const [cuts, setCuts] = useState([1 / 3, 2 / 3]);
    const [includeViews, setIncludeViews] = useState(false);
    const [running, setRunning] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [saved, setSaved] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const busy = useRef(false);
    const savedKeys = useRef(new Set<string>());
    const cancellation = useRef<AbortController | null>(null);
    const locked = running || processing || otherBusy;
    const update = (change: Partial<Qwen21CharacterSheetOptions>) => onOptionsChange({ qwen21CharacterSheet: { ...settings, ...change } });
    let readiness = '';
    let dimensions = { width: 1920, height: 1088 };
    try {
        dimensions = qwen21CharacterDimensions(settings);
        const graph = buildQwen21CharacterSheetWorkflow('character.png', { ...settings, seed: settings.seed === -1 ? 0 : settings.seed });
        if (isComfyUIConnected && objectInfo) validateQwen21CharacterReadiness(graph, objectInfo);
    } catch (failure) { readiness = failure instanceof Error ? failure.message : 'Invalid Character Sheet settings.'; }
    const canGenerate = !!sourceFile && !!isComfyUIConnected && !!objectInfo && !readiness && !locked;
    const select = (label: string, key: keyof Qwen21CharacterSheetOptions, values: string[]) => <label className="block min-w-0 text-sm text-text-secondary">{label}<select aria-label={label} className={inputClass} value={String(settings[key])} disabled={locked} onChange={event => update({ [key]: event.target.value })}>{[...new Set([String(settings[key]), ...values])].map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
    const choices = (node: string, input: string) => getQwen21Choices(objectInfo, node, input);
    const generate = async () => {
        if (!canGenerate || !sourceFile || busy.current) return;
        busy.current = true; setRunning(true); setStopping(false); setError('');
        const controller = new AbortController(); cancellation.current = controller;
        const snapshot = structuredClone(settings); const generationOptions = structuredClone(options); const name = characterName.trim() || 'Character'; const file = sourceFile; const started = performance.now();
        dispatch(setLoadingState({ isLoading: true }));
        try {
            const source = await fileToDataUrl(file);
            const generated = await generateComfyUICharacterSheet(file, snapshot, (text, value) => { setMessage(text); setProgress(value); }, controller.signal);
            const image = new Image(); image.src = generated.src; await image.decode(); controller.signal.throwIfAborted();
            const submitted = { ...snapshot, seed: generated.seed };
            setResult({ src: generated.src, source, settings: submitted, options: { ...generationOptions, provider: 'comfyui', comfyCharacterMode: 'qwen21', qwen21CharacterSheet: submitted }, prompt: generated.prompt, name, width: image.naturalWidth, height: image.naturalHeight, seconds: (performance.now() - started) / 1000 });
            setViews([]); setSaved([]); savedKeys.current.clear();
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Character Sheet generation failed.'); }
        finally { busy.current = false; cancellation.current = null; setRunning(false); setStopping(false); dispatch(setLoadingState({ isLoading: false })); }
    };
    const stop = async () => {
        if (!running || stopping) return;
        setStopping(true); cancellation.current?.abort(new Error('Operation was cancelled by the user.'));
        await cancelComfyUIExecution();
    };
    const split = async () => {
        if (!result || locked || busy.current) return;
        busy.current = true; setProcessing(true); setError('');
        try { setViews(await cropSheet(result.src, cuts)); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not separate views.'); }
        finally { busy.current = false; setProcessing(false); }
    };
    const viewKey = (view: SheetView) => `view:${view.x}:${view.width}`;
    const save = async (onlyView?: SheetView, index?: number, withViews = false) => {
        if (!result || locked || busy.current) return;
        busy.current = true; setProcessing(true); setError('');
        const snapshot = result;
        try {
            const selected = onlyView ? [onlyView] : withViews ? (views.length ? views : await cropSheet(snapshot.src, cuts)) : [];
            if (!onlyView && selected.length) setViews(selected);
            const items = [...(!onlyView ? [{ key: 'sheet', src: snapshot.src, name: `${snapshot.name} - Character Sheet`, view: undefined, index: 0 }] : []), ...selected.map((view, viewIndex) => ({ key: viewKey(view), src: view.src, name: `${snapshot.name} - View ${(index ?? viewIndex) + 1}`, view, index: index ?? viewIndex }))];
            for (const item of items) {
                if (savedKeys.current.has(item.key)) continue;
                await dispatch(addToLibrary({ mediaType: 'character', name: item.name, characterName: snapshot.name, media: item.src, thumbnail: await dataUrlToThumbnail(item.src, 256), sourceImage: snapshot.source, prompt: snapshot.prompt, options: snapshot.options, tags: ['qwen21', item.view ? 'character-view' : 'character-sheet'],
                    ...(item.view ? { characterSheetView: { index: item.index, cuts: item.view.cuts, x: item.view.x, y: item.view.y, width: item.view.width, height: item.view.height } } : {}) })).unwrap();
                savedKeys.current.add(item.key); setSaved([...savedKeys.current]);
            }
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save Character Sheet images.'); }
        finally { busy.current = false; setProcessing(false); }
    };
    const changeCuts = (next: number[]) => { setCuts(next); setViews([]); };
    const reset = () => { if (locked || busy.current) return; onOptionsChange({ qwen21CharacterSheet: defaultQwen21CharacterSheetOptions() }); setCuts([1 / 3, 2 / 3]); setIncludeViews(false); setResult(null); setViews([]); setSaved([]); savedKeys.current.clear(); setError(''); };
    return <section aria-label="Qwen 2.1 Character Sheet" className="space-y-5">
        <div role="tablist" aria-label="Qwen 2.1 character tools" className="flex border-b border-border-primary"><button role="tab" type="button" aria-selected="true" className="border-b-2 border-accent px-4 py-3 text-sm font-bold text-accent">Character Sheet</button></div>
        {!isComfyUIConnected && <p role="status" className="text-sm text-text-secondary">ComfyUI disconnected.</p>}
        {(readiness || error) && <p role="alert" className="rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">{error || readiness}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
                <ImageUploader id="qwen21-character-source" label="1. Character Reference" sourceFile={sourceFile} onImageUpload={onSourceChange} disabled={locked} />
                <button type="button" className={`${buttonClass} w-full`} onClick={onOpenLibrary} disabled={locked}><LibraryIcon className="h-4 w-4" />Choose from Library</button>
                <label className="block text-sm text-text-secondary">Character Name<input aria-label="Character Name" className={inputClass} value={characterName} disabled={locked} onChange={event => onNameChange(event.target.value)} /></label>
                <Fold title="Models & CLIP">
                    {select('Diffusion Model', 'unet', choices('UNETLoader', 'unet_name'))}{select('Weight Dtype', 'weightDtype', choices('UNETLoader', 'weight_dtype'))}
                    {select('CLIP', 'clip', choices('CLIPLoader', 'clip_name'))}{select('CLIP Device', 'clipDevice', choices('CLIPLoader', 'device'))}{select('VAE', 'vae', choices('VAELoader', 'vae_name'))}
                    {select('Attention', 'attention', choices('ModelAttentionBackend', 'attention'))}{select('Cache Device', 'cacheDevice', choices('QwenImage21Cache', 'device'))}{select('Cache Dtype', 'cacheDtype', choices('QwenImage21Cache', 'dtype'))}
                </Fold>
                <Fold title="Reference Settings">
                    {select('Reference Upscale Method', 'referenceUpscale', choices('ImageScaleToTotalPixels', 'upscale_method'))}
                    <NumberSlider label="Resolution Steps" min={1} max={256} step={1} value={settings.resolutionSteps} disabled={locked} allowDirectInput onChange={event => update({ resolutionSteps: Number(event.target.value) })} />
                    <NumberSlider label="Encoder Resolution" min={0} max={4096} step={32} value={settings.referenceResolution} disabled={locked} allowDirectInput onChange={event => update({ referenceResolution: Number(event.target.value) })} />
                </Fold>
                <Fold title="Sampler Settings">
                    {select('Sampler', 'sampler', choices('KSampler', 'sampler_name'))}{select('Scheduler', 'scheduler', choices('KSampler', 'scheduler'))}
                    <NumberSlider label="Steps" min={1} max={100} step={1} value={settings.steps} disabled={locked} allowDirectInput onChange={event => update({ steps: Number(event.target.value) })} />
                    <NumberSlider label="CFG" min={0} max={20} step={0.1} value={settings.cfg} disabled={locked} allowDirectInput onChange={event => update({ cfg: Number(event.target.value) })} />
                    <NumberSlider label="Denoise" min={0} max={1} step={0.01} value={settings.denoise} disabled={locked} allowDirectInput onChange={event => update({ denoise: Number(event.target.value) })} />
                    <label className="block text-sm text-text-secondary">Negative Prompt<textarea aria-label="Negative Prompt" rows={3} className={inputClass} value={settings.negativePrompt} disabled={locked} onChange={event => update({ negativePrompt: event.target.value })} /></label>
                </Fold>
            </div>
            <div className="min-w-0 space-y-5">
                <h3 className="text-lg font-bold text-accent">Character Sheet Prompt</h3>
                <div className="grid gap-3 sm:grid-cols-2">{['Character sheet', 'Views', 'Keep the same', 'Background'].map((label, index) => <label key={label} className="block min-w-0 text-sm text-text-secondary">{label}<textarea aria-label={label} className={inputClass} rows={5} value={settings.texts[index]} disabled={locked} onChange={event => { const texts = [...settings.texts] as Qwen21CharacterSheetOptions['texts']; texts[index] = event.target.value; update({ texts }); }} /></label>)}</div>
                <Fold title="Prompt Join Settings">
                    {select('Separator', 'separator', ['newline', 'comma', 'space', 'none', 'custom'])}
                    {settings.separator === 'custom' && <label className="block text-sm text-text-secondary">Custom Separator<input aria-label="Custom Separator" className={inputClass} value={settings.customSeparator} disabled={locked} onChange={event => update({ customSeparator: event.target.value })} /></label>}
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={settings.skipEmpty} disabled={locked} onChange={event => update({ skipEmpty: event.target.checked })} />Skip empty blocks</label>
                    <textarea aria-label="Combined Sheet Prompt" className={inputClass} rows={6} value={qwen21CharacterPrompt(settings)} readOnly />
                </Fold>
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block min-w-0 text-sm text-text-secondary">Size<select aria-label="Sheet Size" className={inputClass} value={settings.sizeIndex} disabled={locked} onChange={event => update({ sizeIndex: Number(event.target.value) })}>{QWEN21_CHARACTER_SIZES.map((size, index) => <option value={index} key={index}>{settings.orientation === 'portrait' ? `${size[1]} x ${size[0]}` : `${size[0]} x ${size[1]}`}</option>)}</select></label>
                    {select('Orientation', 'orientation', ['landscape', 'portrait'])}
                    <label className="block min-w-0 text-sm text-text-secondary">Seed (-1 = random)<input aria-label="Sheet Seed" type="number" min={-1} max={Number.MAX_SAFE_INTEGER} step={1} className={inputClass} value={settings.seed} disabled={locked} onChange={event => update({ seed: Number(event.target.value) })} /></label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border-primary py-3"><span className="text-sm font-semibold">{dimensions.width} x {dimensions.height}</span><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={reset} disabled={locked}><ResetIcon className="h-4 w-4" />Reset</button>{running && <button type="button" className={buttonClass} onClick={stop} disabled={stopping}><CloseIcon className="h-4 w-4" />{stopping ? 'Stopping...' : 'Stop'}</button>}<button type="button" className={`${buttonClass} !border-accent bg-accent !text-accent-text`} onClick={generate} disabled={!canGenerate}>{running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{running ? 'Generating...' : 'Generate Sheet'}</button></div></div>
                {running && <div role="status" className="space-y-2"><p className="text-xs text-text-secondary">{message}</p><progress aria-label="Character Sheet progress" max={1} value={progress} className="w-full accent-accent" /></div>}
                {result && <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{result.name} <span className="text-xs font-normal text-text-secondary">{result.width} x {result.height} / {result.seconds.toFixed(1)} s</span></h3><div className="flex flex-wrap gap-2"><a className={buttonClass} href={result.src} download={`character-sheet-${result.settings.seed}.png`} title="Download sheet" aria-label="Download sheet"><DownloadIcon className="h-4 w-4" /></a><button type="button" className={buttonClass} onClick={() => { void save(); }} disabled={locked || saved.includes('sheet')} title="Save full Character Sheet to Library" aria-label="Save sheet to Library">{saved.includes('sheet') ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved.includes('sheet') ? 'Sheet Saved' : 'Save Sheet to Library'}</button><SendToLTXButton imageDataUrl={result.src} prompt={result.prompt} className={buttonClass} /></div></div>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={includeViews} disabled={locked} onChange={event => setIncludeViews(event.target.checked)} />Save individual views too</label>
                    {includeViews && <button type="button" className={buttonClass} onClick={() => { void save(undefined, undefined, true); }} disabled={locked || (saved.includes('sheet') && views.length > 0 && views.every(view => saved.includes(viewKey(view))))} aria-label="Save sheet and views to Library"><SaveIcon className="h-4 w-4" />Save Sheet + Views</button>}
                    <div className="relative overflow-hidden" style={{ aspectRatio: `${result.width} / ${result.height}` }}><img src={result.src} alt="Character Sheet result" className="absolute h-full w-full object-contain" />{cuts.map((cut, index) => <div key={index} className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-accent" style={{ left: `${cut * 100}%` }} />)}</div>
                    <div className="flex flex-wrap items-end gap-3"><label className="text-sm text-text-secondary">View Count<select aria-label="View Count" className={inputClass} value={cuts.length + 1} disabled={locked} onChange={event => { const count = Number(event.target.value); changeCuts(Array.from({ length: count - 1 }, (_, index) => (index + 1) / count)); }}>{[1, 2, 3, 4, 5, 6, 7, 8].map(count => <option value={count} key={count}>{count}</option>)}</select></label><button type="button" className={buttonClass} onClick={split} disabled={locked}><CropIcon className="h-4 w-4" />Separate Views</button><span className="text-xs text-text-muted">Seed {result.settings.seed}</span></div>
                    <div className="grid gap-3 sm:grid-cols-2">{cuts.map((cut, index) => <NumberSlider key={index} label={`Split ${index + 1} (%)`} value={Math.round(cut * 10000) / 100} min={Math.round((index ? cuts[index - 1] : 0) * 10000) / 100 + 0.1} max={Math.round((cuts[index + 1] ?? 1) * 10000) / 100 - 0.1} step={0.1} disabled={locked} allowDirectInput onChange={event => changeCuts(cuts.map((value, position) => position === index ? Number(event.target.value) / 100 : value))} />)}</div>
                    {views.length > 0 && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{views.map((view, index) => <div key={viewKey(view)} className="min-w-0 space-y-2 rounded-md border border-border-primary bg-bg-secondary p-2"><img src={view.src} alt={`Character view ${index + 1}`} className="w-full object-contain" style={{ aspectRatio: `${view.width} / ${view.height}` }} /><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-text-secondary">{view.width} x {view.height}</span><div className="flex gap-1"><a className={buttonClass} href={view.src} download={`character-view-${index + 1}-${result.settings.seed}.png`} aria-label={`Download view ${index + 1}`} title={`Download view ${index + 1}`}><DownloadIcon className="h-4 w-4" /></a><button type="button" className={buttonClass} disabled={locked || saved.includes(viewKey(view))} onClick={() => { void save(view, index); }} aria-label={`Save view ${index + 1}`} title={`Save view ${index + 1}`}>{saved.includes(viewKey(view)) ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}</button></div></div></div>)}</div>}
                </div>}
            </div>
        </div>
    </section>;
};
export default Qwen21CharacterSheetPanel;