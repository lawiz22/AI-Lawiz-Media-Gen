import React, { useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { cancelComfyUIExecution, generateComfyUIOutpaint } from '../services/comfyUIService';
import { buildQwen21OutpaintWorkflow, defaultQwen21OutpaintOptions, getQwen21Choices, QWEN21_OUTPAINT_RATIOS, qwen21OutpaintLayout, qwen21OutpaintPrompt, validateQwen21OutpaintReadiness } from '../services/qwen21Workflow';
import type { OutpaintLayout, Qwen21Lora, Qwen21OutpaintOptions } from '../services/qwen21Workflow';
import { dataUrlToFile, dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, ResetIcon, SaveIcon, SpinnerIcon } from './icons';
import { Accordion } from './ui/Accordion';
import { NumberField, SeedField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';

interface Source { file: File; src: string; width: number; height: number }
interface Result { src: string; source: Source; settings: Qwen21OutpaintOptions; layout: OutpaintLayout; prompt: string; seconds: number }
const imageTypes: LibraryItemType[] = ['image', 'character', 'group-fusion', 'past-forward-photo', 'swap-anything', 'extracted-frame', 'object', 'clothes', 'hair'];
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const NAME = 'Outpaint';
const PaddedPicture: React.FC<{ source: Source; layout: OutpaintLayout; label: string }> = ({ source, layout, label }) => <div role="img" aria-label={label} className="relative mx-auto overflow-hidden" style={{ backgroundColor: '#808080', width: '100%', maxWidth: 480 * layout.canvasWidth / layout.canvasHeight, aspectRatio: `${layout.canvasWidth} / ${layout.canvasHeight}` }}>
    <img src={source.src} alt="Original image" draggable={false} className="absolute block" style={{ left: `${100 * layout.left / layout.canvasWidth}%`, top: `${100 * layout.top / layout.canvasHeight}%`, width: `${100 * source.width / layout.canvasWidth}%`, height: `${100 * source.height / layout.canvasHeight}%` }} />
    {layout.left / layout.canvasWidth > 0.07 && <span className="absolute top-1/2 -translate-y-1/2 text-center text-xs font-semibold text-black" style={{ left: 0, width: `${100 * layout.left / layout.canvasWidth}%` }}>{layout.left}</span>}
    {layout.right / layout.canvasWidth > 0.07 && <span className="absolute top-1/2 -translate-y-1/2 text-center text-xs font-semibold text-black" style={{ right: 0, width: `${100 * layout.right / layout.canvasWidth}%` }}>{layout.right}</span>}
    {layout.top / layout.canvasHeight > 0.07 && <span className="absolute left-1/2 -translate-x-1/2 flex items-center text-xs font-semibold text-black" style={{ top: 0, height: `${100 * layout.top / layout.canvasHeight}%` }}>{layout.top}</span>}
    {layout.bottom / layout.canvasHeight > 0.07 && <span className="absolute left-1/2 -translate-x-1/2 flex items-center text-xs font-semibold text-black" style={{ bottom: 0, height: `${100 * layout.bottom / layout.canvasHeight}%` }}>{layout.bottom}</span>}
</div>;

const OutpaintPanel: React.FC<{ isComfyUIConnected: boolean | null; comfyUIObjectInfo: any }> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const { inventory } = useModelInventory();
    const [options, setOptions] = useState(defaultQwen21OutpaintOptions);
    const [source, setSource] = useState<Source | null>(null);
    const [sourceLoading, setSourceLoading] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [result, setResult] = useState<Result | null>(null);
    const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [compare, setCompare] = useState(false);
    const [comparison, setComparison] = useState(50);
    const sourceRequest = useRef(0);
    const generating = useRef(false);
    const saving = useRef(false);
    const cancellation = useRef<AbortController | null>(null);
    const locked = running || sourceLoading || otherBusy || saved === 'saving';
    const update = (change: Partial<Qwen21OutpaintOptions>) => setOptions(current => ({ ...current, ...change }));
    const loadSource = useCallback(async (file: File | null) => {
        if (generating.current || saving.current || otherBusy) return;
        const request = ++sourceRequest.current;
        if (!file) { setSource(null); setSourceLoading(false); return; }
        setSourceLoading(true); setError('');
        try {
            if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
            const src = await fileToDataUrl(file);
            const image = new Image();
            image.src = src; await image.decode();
            qwen21OutpaintLayout(image.naturalWidth, image.naturalHeight, defaultQwen21OutpaintOptions());
            if (request === sourceRequest.current) setSource({ file, src, width: image.naturalWidth, height: image.naturalHeight });
        } catch (failure) { if (request === sourceRequest.current) setError(failure instanceof Error ? failure.message : 'Could not open the image.'); }
        finally { if (request === sourceRequest.current) setSourceLoading(false); }
    }, [otherBusy]);
    const chooseLibrary = async (item: LibraryItem) => {
        setLibraryOpen(false); setError(''); setSourceLoading(true);
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error('Could not load the Library image.');
            const blob = await response.blob();
            await loadSource(new File([blob], `${item.name || 'outpaint-source'}.png`, { type: blob.type || 'image/png' }));
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not open the Library image.'); }
        finally { setSourceLoading(false); }
    };
    let layout: OutpaintLayout | null = null;
    let readiness = '';
    try {
        if (source) layout = qwen21OutpaintLayout(source.width, source.height, options);
        const graph = buildQwen21OutpaintWorkflow('source.png', { ...options, seed: options.seed === -1 ? 0 : options.seed });
        if (isComfyUIConnected && comfyUIObjectInfo) validateQwen21OutpaintReadiness(graph, comfyUIObjectInfo);
    } catch (failure) { readiness = failure instanceof Error ? failure.message : 'Invalid outpaint settings.'; }
    const hasPadding = !!layout && layout.top + layout.bottom + layout.left + layout.right > 0;
    const canGenerate = !!isComfyUIConnected && !!comfyUIObjectInfo && !!source && hasPadding && !readiness && !locked;
    const modelChoices = (node: string, input: string) => getQwen21Choices(comfyUIObjectInfo, node, input);
    const loraChoices = [{ value: '', label: 'None' }, ...familyFiles([...new Set([...modelChoices('LoraLoaderModelOnly', 'lora_name'), ...modelChoices('LoraLoader', 'lora_name')])], 'qwen21', inventory).map(value => ({ value, label: value }))];
    const select = (label: string, key: 'unet' | 'clip' | 'vae' | 'attention' | 'sampler' | 'scheduler' | 'cacheDevice' | 'cacheDtype', choices: string[]) =>
        <Select variant="search" label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} options={choices} disabled={locked} onChange={value => update({ [key]: value })} />;
    const generate = async () => {
        if (!canGenerate || !source || !layout || generating.current) return;
        generating.current = true; setRunning(true); setError(''); setStopping(false);
        cancellation.current = new AbortController();
        const original = source; const settings = structuredClone(options); const submittedLayout = { ...layout }; const started = performance.now();
        dispatch(setLoadingState({ isLoading: true, owner: 'outpaint' }));
        try {
            const generated = await generateComfyUIOutpaint(original.file, settings, (text, value) => { setMessage(text); setProgress(value); }, cancellation.current.signal);
            setResult({ src: generated.src, prompt: generated.prompt, source: original, settings: { ...settings, seed: generated.seed }, layout: submittedLayout, seconds: (performance.now() - started) / 1000 });
            setSaved('idle'); setCompare(false); setComparison(50);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Outpaint failed.'); }
        finally { cancellation.current = null; generating.current = false; setRunning(false); setStopping(false); dispatch(setLoadingState({ isLoading: false, owner: 'outpaint' })); }
    };
    const stop = async () => {
        if (!generating.current || stopping) return;
        setStopping(true);
        cancellation.current?.abort(new Error('Operation was cancelled by the user.'));
        try { await cancelComfyUIExecution(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not stop outpainting.'); setStopping(false); }
    };
    const save = async () => {
        if (!result || saving.current || locked || saved === 'saved') return;
        saving.current = true; setSaved('saving');
        const snapshot = result;
        try {
            await dispatch(addToLibrary({ mediaType: 'image', name: `Outpaint - ${snapshot.layout.canvasWidth}x${snapshot.layout.canvasHeight}`, media: snapshot.src,
                thumbnail: await dataUrlToThumbnail(snapshot.src, 256), sourceImage: snapshot.source.src, prompt: snapshot.prompt,
                outpaintSettings: snapshot.settings, tags: ['outpaint', 'qwen21'] })).unwrap();
            setSaved('saved');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save outpaint.'); setSaved('idle'); }
        finally { saving.current = false; }
    };
    const reset = () => {
        if (locked || generating.current || saving.current) return;
        sourceRequest.current++; setSource(null); setOptions(defaultQwen21OutpaintOptions()); setResult(null); setSaved('idle'); setError(''); setCompare(false); setProgress(0); setMessage('');
    };
    const loraControl = (key: 'outpaintLora' | 'extraLora', title: string) => {
        const lora = options[key];
        const change = (values: Partial<Qwen21Lora>) => update({ [key]: { ...lora, ...values } });
        return <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={lora.enabled} disabled={locked} onChange={event => change({ enabled: event.target.checked })} />{title}</label>
            <Select variant="search" label={`${title} Model`} ariaLabel={`${NAME} ${title} Model`} value={lora.name} options={loraChoices} disabled={locked} onChange={name => change({ name, enabled: !!name })} />
            {lora.name && <><NumberField slider label={`${title} Model Strength`} value={lora.modelStrength} min={-10} max={10} step={0.05} disabled={locked || !lora.enabled} onChange={modelStrength => change({ modelStrength })} /><NumberField slider label={`${title} CLIP Strength`} value={lora.clipStrength} min={-10} max={10} step={0.05} disabled={locked || !lora.enabled} onChange={clipStrength => change({ clipStrength })} /></>}
        </div>;
    };
    const chip = (label: string, active: boolean, action: () => void, disabled = locked) => <button key={label} type="button" aria-pressed={active} disabled={disabled} onClick={action} className={`min-h-9 min-w-0 rounded-md border px-2 py-2 text-xs font-semibold disabled:opacity-40 ${active ? 'border-accent bg-accent text-accent-text' : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-accent'}`}>{label}</button>;
    const vertical = layout?.axis === 'vertical';
    return <section aria-label="Outpaint" className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary pb-3"><div><h2 className="text-xl font-bold text-accent">OUTPAINT</h2><span className="text-xs text-text-secondary">Qwen Image 2.1</span></div><button type="button" className={buttonClass} onClick={reset} disabled={locked}><ResetIcon className="h-4 w-4" />Reset</button></header>
        {!isComfyUIConnected && <p role="status" className="text-sm text-text-secondary">ComfyUI disconnected.</p>}
        {readiness && <p role="alert" className="rounded-md border border-danger bg-danger-bg p-3 text-sm text-danger">{readiness}</p>}
        {error && <p role="alert" className="rounded-md border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
                <ImageUploader id="outpaint-source" label="1. Load Image" sourceFile={source?.file || null} onImageUpload={loadSource} disabled={locked} />
                <button type="button" className={`${buttonClass} w-full`} disabled={locked} onClick={() => setLibraryOpen(true)}><LibraryIcon className="h-4 w-4" />Choose from Library</button>
                <Accordion title="Models">
                    {select('Diffusion Model', 'unet', familyFiles(modelChoices('UNETLoader', 'unet_name'), 'qwen21', inventory))}
                    {select('CLIP', 'clip', modelChoices('CLIPLoader', 'clip_name'))}
                    {select('VAE', 'vae', modelChoices('VAELoader', 'vae_name'))}
                    {select('Attention', 'attention', modelChoices('ModelAttentionBackend', 'attention'))}
                </Accordion>
                <Accordion title="LoRAs">{loraControl('outpaintLora', 'Outpaint LoRA')}{loraControl('extraLora', 'Extra LoRA')}</Accordion>
                <Accordion title="Sampler">
                    {select('Sampler', 'sampler', modelChoices('KSampler', 'sampler_name'))}
                    {select('Scheduler', 'scheduler', modelChoices('KSampler', 'scheduler'))}
                    <NumberField slider label="Steps" value={options.steps} min={1} max={100} step={1} disabled={locked} onChange={steps => update({ steps })} />
                    <NumberField slider label="CFG" value={options.cfg} min={0} max={20} step={0.1} disabled={locked} onChange={cfg => update({ cfg })} />
                    <SeedField name={NAME} value={Math.max(options.seed, 0)} onChange={seed => update({ seed })} randomize={options.seed === -1} onRandomizeChange={random => update({ seed: random ? -1 : 0 })} disabled={locked} />
                </Accordion>
                <Accordion title="Advanced">
                    {select('Cache Device', 'cacheDevice', modelChoices('QwenImage21Cache', 'device'))}
                    {select('Cache Dtype', 'cacheDtype', modelChoices('QwenImage21Cache', 'dtype'))}
                    <NumberField slider label="Stitch Feather" value={options.feather} min={0} max={256} step={1} disabled={locked} onChange={feather => update({ feather })} />
                    <NumberField slider label="Stitch Color Match" value={options.colorMatch} min={0} max={100} step={1} disabled={locked} onChange={colorMatch => update({ colorMatch })} />
                    <PromptBox kind="readonly" label="Outpaint Prompt" ariaLabel="Outpaint Prompt" rows={5} value={qwen21OutpaintPrompt(options)} />
                </Accordion>
            </div>
            <div className="min-w-0 space-y-5">
                <div className="space-y-4 rounded-lg border border-border-primary bg-bg-secondary p-4">
                    <h3 className="text-base font-bold">2. Extend the Picture</h3>
                    <div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-md border border-border-primary bg-bg-tertiary p-2"><span className="block text-xs text-text-muted">INPUT</span><span className="text-sm font-bold">{source ? `${source.width} x ${source.height}` : '-'}</span></div><div className="rounded-md border border-accent bg-bg-tertiary p-2"><span className="block text-xs text-text-muted">RENDER</span><span className="text-sm font-bold text-accent" aria-label="Render dimensions">{layout ? `${layout.renderWidth} x ${layout.renderHeight}` : '-'}</span></div></div>
                    <div role="group" aria-label="Extension mode" className="grid grid-cols-2 gap-2">{chip('To ratio', options.mode === 'ratio', () => update({ mode: 'ratio' }))}{chip('By side', options.mode === 'sides', () => update({ mode: 'sides' }))}</div>
                    {options.mode === 'ratio' ? <>
                        <div role="group" aria-label="Aspect ratio" className="grid grid-cols-5 gap-2">{QWEN21_OUTPAINT_RATIOS.map(ratio => chip(ratio, options.ratio === ratio, () => update({ ratio })))}</div>
                        <div role="group" aria-label="Add space" className="grid grid-cols-3 gap-2">{chip(vertical ? 'Top' : 'Left', ['left', 'top'].includes(options.anchor), () => update({ anchor: vertical ? 'top' : 'left' }), locked || !layout?.axis)}{chip('Both', ['centre', 'middle'].includes(options.anchor), () => update({ anchor: vertical ? 'middle' : 'centre' }), locked || !layout?.axis)}{chip(vertical ? 'Bottom' : 'Right', ['right', 'bottom'].includes(options.anchor), () => update({ anchor: vertical ? 'bottom' : 'right' }), locked || !layout?.axis)}</div>
                    </> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['top', 'bottom', 'left', 'right'] as const).map(side => <div key={side} className="min-w-0 capitalize"><NumberField label={side} ariaLabel={`${side} padding`} value={options[side]} min={0} max={8192} step={1} disabled={locked} onChange={value => update({ [side]: Math.floor(value) })} /></div>)}</div>}
                    <div className="flex items-center gap-2"><div role="group" aria-label="Megapixel limit" className="grid flex-1 grid-cols-4 gap-2">{[0, 1, 1.5, 2].map(limit => chip(limit ? `${limit} MP` : 'Off', options.limit === limit, () => update({ limit })))}</div><span title="Fill #808080" aria-label="Fill #808080" className="h-8 w-8 shrink-0 rounded border border-border-primary" style={{ backgroundColor: '#808080' }} /></div>
                    <div className="flex min-h-48 items-center justify-center overflow-hidden bg-bg-primary p-2">{source && layout ? <PaddedPicture source={source} layout={layout} label="Outpaint preview" /> : <span className="text-sm text-text-muted">{sourceLoading ? 'Loading image...' : 'No image'}</span>}</div>
                    {layout && <div className="flex flex-wrap justify-between gap-2 text-xs text-text-secondary"><span aria-label="Final dimensions">FINAL {layout.canvasWidth} x {layout.canvasHeight}</span><span>Top {layout.top} / Bottom {layout.bottom} / Left {layout.left} / Right {layout.right} px</span></div>}
                    {source && !hasPadding && <p role="status" className="text-sm text-text-secondary">No area to extend.</p>}
                    <PromptBox kind="positive" label="Scene" ariaLabel="Scene" rows={4} value={options.scene} disabled={locked} onChange={scene => update({ scene })} />
                    <div className="flex flex-wrap items-center justify-end gap-3">{running && <button type="button" className={buttonClass} onClick={stop} disabled={stopping}><CloseIcon className="h-4 w-4" />{stopping ? 'Stopping...' : 'Stop'}</button>}<button type="button" onClick={generate} disabled={!canGenerate} className={`${buttonClass} !border-accent bg-accent !text-accent-text`}>{running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{running ? 'Outpainting...' : 'Outpaint'}</button></div>
                    {running && <div role="status" className="space-y-2"><p className="text-xs text-text-secondary">{message}</p><progress aria-label="Outpaint progress" value={progress} max={1} className="w-full accent-accent" /></div>}
                </div>
                {result && <div className="space-y-3 border-t border-border-primary pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Result <span className="text-xs font-normal text-text-secondary">{result.layout.canvasWidth} x {result.layout.canvasHeight} / {result.seconds.toFixed(1)} s</span></h3><div className="flex flex-wrap gap-2"><a className={buttonClass} href={result.src} download={`outpaint-${result.settings.seed}.png`} title="Download PNG"><DownloadIcon className="h-4 w-4" /></a><button className={buttonClass} type="button" onClick={save} disabled={locked || saved === 'saved'} title="Save to Library" aria-label="Save to Library">{saved === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}</button><SendToLTXButton imageDataUrl={result.src} prompt={result.prompt} className={buttonClass} /><button className={buttonClass} type="button" disabled={locked} onClick={() => { void loadSource(dataUrlToFile(result.src, `outpaint-${result.settings.seed}.png`)); }} title="Use result as source" aria-label="Use result as source"><RefreshIcon className="h-4 w-4" /></button></div></div>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Compare before / after</label>
                    {compare ? <><div className="relative mx-auto overflow-hidden" style={{ aspectRatio: `${result.layout.canvasWidth} / ${result.layout.canvasHeight}`, maxWidth: 480 * result.layout.canvasWidth / result.layout.canvasHeight }}><img src={result.src} alt="Outpaint result" className="absolute h-full w-full object-fill" /><div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }}><PaddedPicture source={result.source} layout={result.layout} label="Original padded image" /></div><div className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${comparison}%` }} /></div><input type="range" aria-label="Before / after comparison" min={0} max={100} value={comparison} onChange={event => setComparison(Number(event.target.value))} className="w-full accent-accent" /></> : <img src={result.src} alt="Outpaint result" className="max-h-[65vh] w-full object-contain" />}
                    <p className="text-xs text-text-muted">Seed {result.settings.seed}</p>
                </div>}
            </div>
        </div>
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={item => { void chooseLibrary(item); }} filter={imageTypes} />
    </section>;
};
export default OutpaintPanel;