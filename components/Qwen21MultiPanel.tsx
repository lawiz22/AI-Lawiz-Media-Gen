import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { GenerationOptions, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { addSessionTokenUsage } from '../store/appSlice';
import { setLoadingState } from '../store/generationSlice';
import { cancelComfyUIExecution, exportComfyUIWorkflow, generateComfyUIQwen21Multi } from '../services/comfyUIService';
import { analyzeQwen21Reference } from '../services/qwen21ReferenceService';
import { buildQwen21MultiWorkflow, defaultQwen21MultiOptions, getQwen21Choices, QWEN21_MULTI_SIZES, qwen21MultiDimensions, qwen21MultiPrompt, qwen21ReferenceInteractions, validateQwen21MultiReadiness, type Qwen21Lora, type Qwen21MultiOptions, type Qwen21MultiReference, type Qwen21ReferenceRole } from '../services/qwen21Workflow';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from '../services/ollamaService';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider } from './InputComponents';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, ResetIcon, SaveIcon, SpinnerIcon, TrashIcon, WorkflowIcon } from './icons';

export interface Qwen21MultiHandle { exportWorkflow: () => Promise<void> }
interface Props { options: GenerationOptions; updateOptions: (change: Partial<GenerationOptions>) => void; isComfyUIConnected: boolean | null; objectInfo: any; ref?: React.Ref<Qwen21MultiHandle> }
interface Result { src: string; sources: string[]; prompt: string; seed: number; width: number; height: number; seconds: number; options: GenerationOptions }
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const input = 'mt-1 w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary disabled:opacity-50';
const roles: { value: Qwen21ReferenceRole; label: string }[] = [{ value: 'identity', label: 'Another person' }, { value: 'object', label: 'Object' }, { value: 'background', label: 'Background' }, { value: 'outfit', label: 'Clothing' }, { value: 'pose', label: 'Pose' }, { value: 'style', label: 'Visual style' }, { value: 'custom', label: 'Other / custom' }];
const initial = () => ({ ...defaultQwen21MultiOptions(), ollamaUrl: localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL, ollamaModel: localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL });
const Fold: React.FC<{ title: string; children: React.ReactNode; open?: boolean }> = ({ title, children, open = false }) => <details open={open || undefined} className="border-t border-border-primary pt-3"><summary className="cursor-pointer text-sm font-bold uppercase text-accent">{title}</summary><div className="space-y-3 pt-3">{children}</div></details>;

const Qwen21MultiPanel: React.FC<Props> = ({ options, updateOptions, isComfyUIConnected, objectInfo, ref }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const storedSettings = options.comfyQwen21Multi || initial();
    const settings = storedSettings.references[0].role === 'identity' ? storedSettings : { ...storedSettings, references: storedSettings.references.map((reference, index) => index === 0 ? { ...reference, role: 'identity' as const, description: '', interactionId: '', interactionChoices: [] } : reference) };
    const [files, setFiles] = useState<(File | null)[]>([null, null, null, null]);
    const [analysis, setAnalysis] = useState<string[]>(['', '', '', '']);
    const [analysisErrors, setAnalysisErrors] = useState<string[]>(['', '', '', '']);
    const [result, setResult] = useState<Result | null>(null);
    const [running, setRunning] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [library, setLibrary] = useState<{ index: number; restore: boolean } | null>(null);
    const busy = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const requests = useRef<(AbortController | null)[]>([null, null, null, null]);
    const latest = useRef({ settings, options, files, updateOptions });
    latest.current = { settings, options, files, updateOptions };
    const locked = running || saving || otherBusy;
    const analyzing = analysis.some(Boolean);
    const update = (change: Partial<Qwen21MultiOptions>) => {
        const next = { ...latest.current.settings, ...change };
        latest.current.settings = next; latest.current.updateOptions({ comfyQwen21Multi: next });
    };
    const updateReference = (index: number, change: Partial<Qwen21MultiReference>) => {
        const current = latest.current;
        const next = { ...current.settings, references: current.settings.references.map((item, slot) => slot === index ? { ...item, ...change } : item) };
        latest.current.settings = next; current.updateOptions({ comfyQwen21Multi: next });
    };
    const abortAnalysis = () => { requests.current.forEach(request => request?.abort()); requests.current = [null, null, null, null]; setAnalysis(['', '', '', '']); };
    useEffect(() => () => { requests.current.forEach(request => request?.abort()); }, []);
    const analyze = async (index: number, file: File, role: Qwen21ReferenceRole) => {
        requests.current[index]?.abort();
        const cancellation = new AbortController(); requests.current[index] = cancellation;
        updateReference(index, { interactionId: '', interactionChoices: [] });
        setAnalysis(status => status.map((value, slot) => slot === index ? 'Analyzing...' : value));
        setAnalysisErrors(errors => errors.map((value, slot) => slot === index ? '' : value));
        try {
            const response = await analyzeQwen21Reference(file, index === 0 ? 'identity' : role, latest.current.settings, cancellation.signal, { isMainPerson: index === 0, primary: index === 0 ? null : latest.current.files[0] });
            if (requests.current[index] !== cancellation || cancellation.signal.aborted) return;
            updateReference(index, { description: response.description, interactionChoices: response.interactionChoices });
            if (response.usageMetadata) dispatch(addSessionTokenUsage(response.usageMetadata));
        } catch (failure) {
            if (requests.current[index] !== cancellation || cancellation.signal.aborted) return;
            setAnalysisErrors(errors => errors.map((value, slot) => slot === index ? failure instanceof Error ? failure.message : 'Analysis failed.' : value));
        } finally {
            if (requests.current[index] === cancellation) { requests.current[index] = null; setAnalysis(status => status.map((value, slot) => slot === index ? '' : value)); }
        }
    };
    const choose = (index: number, file: File | null) => {
        if (busy.current || locked) return;
        if (index === 0) abortAnalysis();
        requests.current[index]?.abort(); requests.current[index] = null;
        const nextFiles = latest.current.files.map((value, slot) => slot === index ? file : value);
        latest.current.files = nextFiles; setFiles(nextFiles);
        updateReference(index, { description: '', refinement: '', interactionId: '', interactionChoices: [], ...(index === 0 ? { role: 'identity' as const } : {}) });
        setAnalysis(status => status.map((value, slot) => slot === index ? '' : value));
        setAnalysisErrors(errors => errors.map((value, slot) => slot === index ? '' : value));
        if (index === 0) for (let slot = 1; slot < nextFiles.length; slot++) {
            updateReference(slot, { description: '', interactionId: '', interactionChoices: [] });
        }
    };
    const resolvedPrompt = qwen21MultiPrompt(settings);
    const activeFiles = files.slice(0, settings.referenceCount);
    let readiness = ''; let dimensions = { width: 1024, height: 1024 };
    try {
        dimensions = qwen21MultiDimensions(settings);
        const graph = buildQwen21MultiWorkflow(activeFiles.map((file, index) => file?.name || `reference-${index + 1}.png`), { ...settings, prompt: resolvedPrompt, seed: settings.seed === -1 ? 0 : settings.seed });
        if (isComfyUIConnected && objectInfo) validateQwen21MultiReadiness(graph, objectInfo);
    } catch (failure) { readiness = failure instanceof Error ? failure.message : 'Invalid settings.'; }
    const ready = activeFiles.every(Boolean) && !!isComfyUIConnected && !!objectInfo && !readiness && !!resolvedPrompt.trim() && !locked && !analyzing;
    const exportWorkflow = async () => {
        if (!ready || busy.current) return;
        busy.current = true; setSaving(true); setError('');
        try { await exportComfyUIWorkflow({ ...options, comfyModelType: 'qwen21-i2i-multi', comfyQwen21Multi: settings }, activeFiles[0], activeFiles.slice(1) as File[]); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Export failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    useImperativeHandle(ref, () => ({ exportWorkflow }));
    const generate = async () => {
        if (!ready || busy.current) return;
        busy.current = true; setRunning(true); setStopping(false); setError('');
        const cancellation = new AbortController(); controller.current = cancellation;
        const snapshot = structuredClone(settings); const optionSnapshot = structuredClone(options); const sources = activeFiles as File[]; const started = performance.now();
        dispatch(setLoadingState({ isLoading: true }));
        try {
            const originals = await Promise.all(sources.map(fileToDataUrl)); cancellation.signal.throwIfAborted();
            const generated = await generateComfyUIQwen21Multi(sources, snapshot, (text, value) => { setMessage(text); setProgress(value); }, cancellation.signal);
            const image = new Image(); image.src = generated.src; await image.decode(); cancellation.signal.throwIfAborted();
            setResult({ ...generated, sources: originals, width: image.naturalWidth, height: image.naturalHeight, seconds: (performance.now() - started) / 1000,
                options: { ...optionSnapshot, provider: 'comfyui', comfyModelType: 'qwen21-i2i-multi', comfyPrompt: generated.prompt, comfyNegativePrompt: snapshot.negativePrompt, comfySeed: generated.seed, comfyQwen21Multi: { ...snapshot, seed: generated.seed, prompt: generated.prompt } } });
            setSaved(false);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Generation failed.'); }
        finally { busy.current = false; controller.current = null; setRunning(false); setStopping(false); dispatch(setLoadingState({ isLoading: false })); }
    };
    const stop = async () => { if (!running || stopping) return; setStopping(true); controller.current?.abort(new Error('Generation cancelled.')); await cancelComfyUIExecution(); };
    const save = async () => {
        if (!result || saved || locked || busy.current) return;
        busy.current = true; setSaving(true); setError('');
        try { await dispatch(addToLibrary({ mediaType: 'image', name: `Qwen 2.1 Multi - ${result.width}x${result.height}`, media: result.src, thumbnail: await dataUrlToThumbnail(result.src, 256), qwen21MultiSources: result.sources, options: result.options, tags: ['qwen21', 'i2i-multi'] })).unwrap(); setSaved(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Library save failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const chooseLibrary = async (item: LibraryItem) => {
        if (!library || locked || busy.current) return;
        const target = library; setLibrary(null); busy.current = true; setSaving(true); setError('');
        try {
            const urls = target.restore ? item.qwen21MultiSources : [item.media];
            if (!urls?.length || urls.length > 4 || (target.restore && !item.options?.comfyQwen21Multi)) throw new Error('Choose a saved Qwen multi-image composition.');
            const imported = await Promise.all(urls.map(async (url, index) => { const response = await fetch(url); if (!response.ok) throw new Error('Library reference unavailable.'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Choose an image.'); return new File([blob], `reference-${index + 1}.png`, { type: blob.type }); }));
            if (target.restore) {
                abortAnalysis(); const restored = structuredClone(item.options!.comfyQwen21Multi!);
                if (restored.references[0].role !== 'identity') restored.references[0] = { ...restored.references[0], role: 'identity', description: '', interactionId: '', interactionChoices: [] };
                restored.referenceCount = imported.length; const nextFiles = Array.from({ length: 4 }, (_, index) => imported[index] || null);
                latest.current.files = nextFiles; latest.current.settings = restored; setFiles(nextFiles); updateOptions({ comfyQwen21Multi: restored }); setAnalysisErrors(['', '', '', '']);
            } else {
                busy.current = false; choose(target.index, imported[0]);
            }
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library load failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const select = (label: string, key: keyof Qwen21MultiOptions, node: string, name: string) => <label className="block text-sm text-text-secondary">{label}<select aria-label={label} className={input} value={String(settings[key])} disabled={locked} onChange={event => update({ [key]: event.target.value })}>{[...new Set([String(settings[key]), ...getQwen21Choices(objectInfo, node, name)])].map(value => <option key={value}>{value}</option>)}</select></label>;
    const loraChange = (index: number, change: Partial<Qwen21Lora>) => update({ loras: settings.loras.map((lora, slot) => slot === index ? { ...lora, ...change } : lora) });
    const reset = () => { if (locked || busy.current) return; abortAnalysis(); updateOptions({ comfyQwen21Multi: initial() }); setFiles([null, null, null, null]); setResult(null); setSaved(false); setError(''); setAnalysisErrors(['', '', '', '']); };
    return <section aria-label="Qwen 2.1 I2I Multi Images" className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary pb-3"><h2 className="text-xl font-bold text-accent">I2I Multi Images</h2><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={() => setLibrary({ index: 0, restore: true })}><LibraryIcon className="h-4 w-4" />Restore composition</button><button type="button" className={button} disabled={locked} onClick={reset}><ResetIcon className="h-4 w-4" />Reset</button></div></header>
        {!isComfyUIConnected && <p role="status" className="text-sm text-text-secondary">ComfyUI disconnected.</p>}
        {(error || readiness) && <p role="alert" className="rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">{error || readiness}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
                <label className="block text-sm text-text-secondary">Image analysis<select aria-label="Image analysis provider" className={input} disabled={locked || analyzing} value={settings.analysisProvider} onChange={event => update({ analysisProvider: event.target.value as Qwen21MultiOptions['analysisProvider'] })}><option value="gemini">Gemini</option><option value="mammouth">Mammouth</option><option value="ollama">Ollama</option></select></label>
                {settings.analysisProvider === 'gemini' && <p className="text-xs text-text-secondary">Gemini 2.5 Flash</p>}
                {settings.analysisProvider === 'mammouth' && <label className="block text-sm text-text-secondary">Mammouth vision model<input aria-label="Mammouth vision model" className={input} disabled={locked || analyzing} value={settings.mammouthModel} placeholder="gemini-2.5-flash" onChange={event => update({ mammouthModel: event.target.value })} /></label>}
                {settings.analysisProvider === 'ollama' && <><label className="block text-sm text-text-secondary">Ollama URL<input aria-label="Ollama URL" className={input} disabled={locked || analyzing} value={settings.ollamaUrl} onChange={event => update({ ollamaUrl: event.target.value })} /></label><label className="block text-sm text-text-secondary">Ollama vision model<input aria-label="Ollama vision model" className={input} disabled={locked || analyzing} value={settings.ollamaModel} onChange={event => update({ ollamaModel: event.target.value })} /></label></>}
                <label className="block text-sm text-text-secondary">References<select aria-label="Reference count" className={input} disabled={locked || analyzing} value={settings.referenceCount} onChange={event => {
                    const referenceCount = Number(event.target.value); update({ referenceCount });
                }}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count}</option>)}</select></label>
                {activeFiles.map((file, index) => <div key={index} className="min-w-0 space-y-3 border-b border-border-primary pb-4">
                    <ImageUploader id={`qwen21-multi-reference-${index + 1}`} label={index === 0 ? 'Main person / <image1>' : `Reference ${index + 1} / <image${index + 1}>`} sourceFile={file} onImageUpload={selected => choose(index, selected)} disabled={locked} />
                    <div className="flex gap-2"><button type="button" className={`${button} flex-1`} disabled={locked} onClick={() => setLibrary({ index, restore: false })}><LibraryIcon className="h-4 w-4" />Library</button><button type="button" aria-label={`Clear reference ${index + 1}`} title={`Clear reference ${index + 1}`} className={button} disabled={locked || !file} onClick={() => choose(index, null)}><TrashIcon className="h-4 w-4" /></button></div>
                    <label className="block text-sm text-text-secondary">Reference {index + 1} role<select aria-label={`Reference ${index + 1} role`} className={input} value={settings.references[index].role} disabled={locked || index === 0} onChange={event => { const role = event.target.value as Qwen21ReferenceRole; requests.current[index]?.abort(); requests.current[index] = null; setAnalysis(status => status.map((value, slot) => slot === index ? '' : value)); setAnalysisErrors(errors => errors.map((value, slot) => slot === index ? '' : value)); updateReference(index, { role, description: '', interactionId: '', interactionChoices: [] }); }}>{index === 0 ? <option value="identity">Main person</option> : roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
                    <label className="block text-sm text-text-secondary">Brief description<textarea aria-label={`Reference ${index + 1} description`} className={input} rows={2} disabled={locked || !!analysis[index]} value={settings.references[index].description} onChange={event => updateReference(index, { description: event.target.value })} /></label>
                    <button type="button" className={button} disabled={locked || !file || !!analysis[index]} onClick={() => { if (file) void analyze(index, file, settings.references[index].role); }}>{analysis[index] ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}{analysis[index] || 'Analyze reference'}</button>
                    {analysisErrors[index] && <p role="alert" className="break-words text-xs text-danger">{analysisErrors[index]}</p>}
                    {index > 0 && <label className="block text-sm text-text-secondary">Interaction with main person<select aria-label={`Reference ${index + 1} interaction`} className={input} value={settings.references[index].interactionId || ''} disabled={locked || !file || !!analysis[index]} onChange={event => updateReference(index, { interactionId: event.target.value })}><option value="">Default / refinement only</option>{qwen21ReferenceInteractions(settings.references[index], index).map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>}
                    <label className="block text-sm text-text-secondary">Refine reference {index + 1}<textarea aria-label={`Reference ${index + 1} refinement`} className={input} rows={2} disabled={locked} value={settings.references[index].refinement} onChange={event => updateReference(index, { refinement: event.target.value })} /></label>
                </div>)}
                <label className="block text-sm text-text-secondary">Output Size<select aria-label="Output Size" className={input} disabled={locked} value={settings.sizeIndex} onChange={event => update({ sizeIndex: Number(event.target.value) })}>{QWEN21_MULTI_SIZES.map(([width, height], index) => <option key={index} value={index}>{width} x {height}</option>)}</select></label>
                <label className="block text-sm text-text-secondary">Orientation<select aria-label="Orientation" className={input} disabled={locked} value={settings.orientation} onChange={event => update({ orientation: event.target.value as 'portrait' | 'landscape' })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                <output className="text-xs text-text-secondary">{dimensions.width} x {dimensions.height}</output>
                <label className="block text-sm text-text-secondary">Seed (-1 = random)<input aria-label="Multi Images Seed" type="number" min={-1} max={Number.MAX_SAFE_INTEGER} step={1} className={input} value={settings.seed} disabled={locked} onChange={event => update({ seed: Number(event.target.value) })} /></label>
                <Fold title="Models & CLIP">{select('Diffusion Model', 'unet', 'UNETLoader', 'unet_name')}{select('Weight Dtype', 'weightDtype', 'UNETLoader', 'weight_dtype')}{select('CLIP', 'clip', 'CLIPLoader', 'clip_name')}{select('CLIP Device', 'clipDevice', 'CLIPLoader', 'device')}{select('VAE', 'vae', 'VAELoader', 'vae_name')}{select('Attention', 'attention', 'ModelAttentionBackend', 'attention')}{select('Cache Device', 'cacheDevice', 'QwenImage21Cache', 'device')}{select('Cache Dtype', 'cacheDtype', 'QwenImage21Cache', 'dtype')}</Fold>
                <Fold title="Sampler Settings">{select('Sampler', 'sampler', 'KSampler', 'sampler_name')}{select('Scheduler', 'scheduler', 'KSampler', 'scheduler')}{(['steps', 'cfg', 'denoise', 'referenceResolution'] as const).map(key => <NumberSlider key={key} label={key === 'referenceResolution' ? 'Encoder Resolution' : key === 'cfg' ? 'CFG' : key === 'steps' ? 'Steps' : 'Denoise'} min={key === 'steps' ? 1 : 0} max={key === 'steps' ? 100 : key === 'cfg' ? 20 : key === 'denoise' ? 1 : 4096} step={key === 'steps' ? 1 : key === 'referenceResolution' ? 32 : 0.01} value={settings[key]} allowDirectInput disabled={locked} onChange={event => update({ [key]: Number(event.target.value) })} />)}<label className="block text-sm text-text-secondary">Negative Prompt<textarea aria-label="Negative Prompt" className={input} rows={3} disabled={locked} value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} /></label></Fold>
            </div>
            <div className="min-w-0 space-y-4">
                <label className="block text-sm text-text-secondary">Scene / composition<textarea aria-label="Scene composition" className={input} rows={3} disabled={locked} value={settings.instruction} onChange={event => update({ instruction: event.target.value })} /></label>
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input aria-label="Manual prompt" type="checkbox" disabled={locked} checked={settings.manualPrompt} onChange={event => update({ manualPrompt: event.target.checked, prompt: resolvedPrompt })} />Manual prompt</label>
                <label className="block text-sm text-text-secondary">Qwen 2.1 Prompt<textarea aria-label="Qwen 2.1 Multi Prompt" className={input} rows={8} readOnly={!settings.manualPrompt} disabled={locked} value={resolvedPrompt} onChange={event => update({ prompt: event.target.value })} /></label>
                <div className="flex flex-wrap justify-end gap-2"><button type="button" aria-label="Export multi-image workflow" title="Export multi-image workflow" className={button} disabled={!ready} onClick={() => { void exportWorkflow(); }}><WorkflowIcon className="h-4 w-4" /></button>{running && <button type="button" className={button} disabled={stopping} onClick={stop}><CloseIcon className="h-4 w-4" />{stopping ? 'Stopping...' : 'Stop'}</button>}<button type="button" className={`${button} !border-accent bg-accent !text-accent-text`} disabled={!ready} onClick={generate}>{running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{running ? 'Generating...' : 'Generate'}</button></div>
                {running && <div role="status"><p className="text-xs text-text-secondary">{message}</p><progress aria-label="Multi Images progress" max={1} value={progress} className="w-full accent-accent" /></div>}
                {result && <div className="space-y-3 border-t border-border-primary pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Result <span className="text-xs font-normal text-text-secondary">{result.width} x {result.height} / {result.seconds.toFixed(1)} s</span></h3><div className="flex flex-wrap gap-2"><a aria-label="Download PNG" title="Download PNG" className={button} href={result.src} download={`qwen21-multi-${result.seed}.png`}><DownloadIcon className="h-4 w-4" /></a><button type="button" className={button} disabled={locked || saved} onClick={save} aria-label="Save PNG to Library">{saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved ? 'Saved' : 'Save to Library'}</button><SendToLTXButton imageDataUrl={result.src} prompt={result.prompt} className={button} /></div></div>
                    <div className="relative mx-auto overflow-hidden bg-bg-tertiary" style={{ width: '100%', maxWidth: 520 * result.width / result.height, aspectRatio: `${result.width} / ${result.height}` }}><img src={result.src} alt="Qwen multi-image result" className="absolute h-full w-full object-contain" /></div>
                    <p className="text-xs text-text-muted">Seed {result.seed}</p>
                </div>}
                <Fold title="LoRA Settings" open><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{settings.loras.map((lora, index) => <div key={index} className="min-w-0 space-y-3 border-b border-border-primary pb-3"><label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" aria-label={`Enable LoRA ${index + 1}`} checked={lora.enabled} disabled={locked} onChange={event => loraChange(index, { enabled: event.target.checked })} />LoRA {index + 1}</label><label className="block text-sm text-text-secondary">LoRA {index + 1} Model<select aria-label={`LoRA ${index + 1} Model`} className={input} value={lora.name} disabled={locked} onChange={event => loraChange(index, { name: event.target.value, enabled: !!event.target.value })}>{[...new Set(['', lora.name, ...getQwen21Choices(objectInfo, 'LoraLoader', 'lora_name'), ...getQwen21Choices(objectInfo, 'LoraLoaderModelOnly', 'lora_name')])].map(name => <option key={name} value={name}>{name || 'None'}</option>)}</select></label>{lora.name && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><NumberSlider label={`LoRA ${index + 1} Model Strength`} min={-2} max={2} step={0.05} value={lora.modelStrength} allowDirectInput disabled={locked || !lora.enabled} onChange={event => loraChange(index, { modelStrength: Number(event.target.value) })} /><NumberSlider label={`LoRA ${index + 1} CLIP Strength`} min={-2} max={2} step={0.05} value={lora.clipStrength} allowDirectInput disabled={locked || !lora.enabled} onChange={event => loraChange(index, { clipStrength: Number(event.target.value) })} /></div>}</div>)}</div></Fold>
            </div>
        </div>
        <LibraryPickerModal isOpen={!!library} onClose={() => setLibrary(null)} onSelectItem={item => { void chooseLibrary(item); }} filter={['image', 'character', 'clothes', 'hair', 'object', 'extracted-frame', 'group-fusion', 'swap-anything', 'past-forward-photo']} />
    </section>;
};
export default Qwen21MultiPanel;