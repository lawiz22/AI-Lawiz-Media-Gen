import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { cancelComfyUIExecution, generateZImageCreativeUpscale, type ZImageCreativeLora, type ZImageCreativeUpscaleOptions } from '../services/comfyUIService';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, SaveIcon, SpinnerIcon } from './icons';
import { ImageUploader } from './ImageUploader';

interface Props {
    sourceFile: File | null;
    setSourceFile: (file: File | null) => void;
    onOpenLibrary: () => void;
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
    advancedOpen: boolean;
}

const emptyLora = (): ZImageCreativeLora => ({ enabled: false, name: '', strength: 1 });
const DEFAULT_OPTIONS: ZImageCreativeUpscaleOptions = {
    turboUnet: 'z_image_turbo_bf16.safetensors',
    baseUnet: 'z_image_turbo_bf16.safetensors',
    vae: 'ae.safetensors',
    clip: 'Josiefied-Qwen3-4B-abliterated-v2.Q8_0.gguf',
    upscaleModel: '4xPurePhoto-RealPLSKR.pth',
    florenceModel: 'MiaoshouAI/Florence-2-large-PromptGen-v2.0',
    florencePrecision: 'fp16',
    florenceAttention: 'sdpa',
    promptPrefix: '',
    turboLoras: [
        { enabled: true, name: 'ZIT\\Z-Image-Fun-Lora-Distill-8-Steps_ComfyUI.safetensors', strength: 1.2 },
        { enabled: true, name: 'ZIT\\Realistic World zib v3.1.safetensors', strength: 0.65 },
        emptyLora(), emptyLora(), emptyLora(),
    ],
    baseLoras: [
        { enabled: true, name: 'ZIT\\Portrait Engine V14.safetensors', strength: 0.75 },
        emptyLora(), emptyLora(), emptyLora(), emptyLora(),
    ],
    turboShift: 5.5,
    baseShift: 3,
    upscaleFactor: 6,
    maxStepScale: 1.6,
    steps: 9,
    sampler: 'euler',
    scheduler: 'beta57',
    tailStepsFirst: 6,
    tailStepsLast: 1,
    refineSampler: 'euler',
    refineScheduler: 'beta57',
    refineSteps: 18,
    refineEnterSigma: 0.6,
    sageAttention: 'auto',
    allowCompile: true,
    florenceKeepLoaded: true,
    florenceMaxTokens: 1024,
    florenceBeams: 3,
    florenceSample: true,
};

const choices = (widget: any): string[] => Array.isArray(widget?.[0]) ? widget[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean)));
const controlClass = 'mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary';

const LoraGroup: React.FC<{
    title: string;
    description: string;
    loras: ZImageCreativeLora[];
    availableLoras: string[];
    onChange: (loras: ZImageCreativeLora[]) => void;
}> = ({ title, description, loras, availableLoras, onChange }) => {
    const update = (index: number, patch: Partial<ZImageCreativeLora>) => onChange(loras.map((lora, loraIndex) => loraIndex === index ? { ...lora, ...patch } : lora));
    return <div className="border-t border-border-primary pt-4 lg:col-span-3">
        <div className="mb-3"><h4 className="text-sm font-bold text-accent">{title}</h4><p className="text-xs text-text-muted">{description}</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {loras.map((lora, index) => {
                const models = withCurrent(lora.name, availableLoras);
                return <div key={index} className="rounded-md border border-border-primary bg-bg-secondary p-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-text-secondary"><input type="checkbox" checked={lora.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} className="accent-accent" />LoRA {index + 1}</label>
                    <select value={lora.name} onChange={(event) => update(index, { name: event.target.value, enabled: Boolean(event.target.value) })} className={controlClass}><option value="">None</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select>
                    <label className="mt-2 block text-xs text-text-muted">Strength: {lora.strength}<input type="range" min="-2" max="2" step="0.05" value={lora.strength} onChange={(event) => update(index, { strength: Number(event.target.value) })} className="mt-1 w-full accent-accent" /></label>
                </div>;
            })}
        </div>
    </div>;
};

export const ZImageCreativeUpscalePanel: React.FC<Props> = ({ sourceFile, setSourceFile, onOpenLibrary, isComfyUIConnected, comfyUIObjectInfo, advancedOpen }) => {
    const dispatch: AppDispatch = useDispatch();
    const [options, setOptions] = useState(DEFAULT_OPTIONS);
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
    const [resultUrl, setResultUrl] = useState('');
    const [florencePrompt, setFlorencePrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const unets = useMemo(() => choices(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name), [comfyUIObjectInfo]);
    const vaes = useMemo(() => choices(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name), [comfyUIObjectInfo]);
    const clips = useMemo(() => choices(comfyUIObjectInfo?.CLIPLoaderGGUF?.input?.required?.clip_name), [comfyUIObjectInfo]);
    const upscaleModels = useMemo(() => choices(comfyUIObjectInfo?.UpscaleModelLoader?.input?.required?.model_name), [comfyUIObjectInfo]);
    const loras = useMemo(() => choices(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name), [comfyUIObjectInfo]);

    useEffect(() => {
        if (!sourceFile) { setSourceUrl(''); setSourceSize(null); setResultUrl(''); return; }
        const url = URL.createObjectURL(sourceFile);
        setSourceUrl(url); setResultUrl(''); setFlorencePrompt(''); setSaveStatus('idle'); setError('');
        return () => URL.revokeObjectURL(url);
    }, [sourceFile]);

    const update = <K extends keyof ZImageCreativeUpscaleOptions>(key: K, value: ZImageCreativeUpscaleOptions[K]) => setOptions((current) => ({ ...current, [key]: value }));

    const generate = async () => {
        if (!sourceFile || !sourceSize || !isComfyUIConnected || isGenerating) return;
        setIsGenerating(true); setResultUrl(''); setFlorencePrompt(''); setError(''); setSaveStatus('idle');
        try {
            setResultUrl(await generateZImageCreativeUpscale(sourceFile, sourceSize, options, (message, value) => { setProgressMessage(message); setProgress(value); }, setFlorencePrompt));
        } catch (generationError) {
            if (generationError instanceof Error && generationError.message === 'Operation was cancelled by the user.') {
                setProgressMessage('Generation stopped.');
            } else {
                setError(generationError instanceof Error ? generationError.message : 'Z-Image Creative Upscale failed.');
            }
        } finally { setIsGenerating(false); }
    };

    const save = async () => {
        if (!resultUrl || !sourceFile || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        try {
            await dispatch(addToLibrary({ mediaType: 'image', name: `Z-Image Creative Upscale - ${sourceFile.name}`, media: resultUrl, thumbnail: await dataUrlToThumbnail(resultUrl, 256) })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) { setSaveStatus('idle'); setError(saveError instanceof Error ? saveError.message : 'Could not save the creative upscale.'); }
    };

    return <>
        <div className="border-b border-border-primary bg-warning-bg/30 px-5 py-3 text-sm text-text-secondary"><strong className="text-warning">Creative reinterpretation:</strong> Florence2 describes the source, then Z-Image generates a new image. Identity, pose and details may differ from the original.</div>
        {advancedOpen && <div className="grid gap-4 border-b border-border-primary bg-bg-primary/40 p-5 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-3"><h3 className="text-sm font-bold text-accent">Shared Models and Florence2 Prompting</h3></div>
            <label className="text-xs font-semibold text-text-secondary">VAE<select value={options.vae} onChange={(event) => update('vae', event.target.value)} className={controlClass}>{withCurrent(options.vae, vaes).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="text-xs font-semibold text-text-secondary">CLIP GGUF<select value={options.clip} onChange={(event) => update('clip', event.target.value)} className={controlClass}>{withCurrent(options.clip, clips).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="text-xs font-semibold text-text-secondary">Pixel Upscale Model<select value={options.upscaleModel} onChange={(event) => update('upscaleModel', event.target.value)} className={controlClass}>{withCurrent(options.upscaleModel, upscaleModels).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="text-xs font-semibold text-text-secondary">Florence2 Model<input value={options.florenceModel} onChange={(event) => update('florenceModel', event.target.value)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Florence Precision<select value={options.florencePrecision} onChange={(event) => update('florencePrecision', event.target.value)} className={controlClass}><option>fp16</option><option>bf16</option><option>fp32</option></select></label>
            <label className="text-xs font-semibold text-text-secondary">Florence Attention<select value={options.florenceAttention} onChange={(event) => update('florenceAttention', event.target.value)} className={controlClass}><option>sdpa</option><option>flash_attention_2</option><option>eager</option></select></label>
            <label className="text-xs font-semibold text-text-secondary lg:col-span-3">Prompt Prefix<textarea value={options.promptPrefix} onChange={(event) => update('promptPrefix', event.target.value)} rows={2} placeholder="Optional style, subject or quality instructions added before the Florence2 caption" className={controlClass} /></label>

            <div className="border-t border-border-primary pt-4 lg:col-span-3"><h3 className="text-sm font-bold text-accent">Turbo Generation Stage</h3><p className="text-xs text-text-muted">Creates the new composition from the Florence2 prompt and an empty latent.</p></div>
            <label className="text-xs font-semibold text-text-secondary">Turbo UNET<select value={options.turboUnet} onChange={(event) => update('turboUnet', event.target.value)} className={controlClass}>{withCurrent(options.turboUnet, unets).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="text-xs font-semibold text-text-secondary">Turbo Shift<input type="number" step="0.1" value={options.turboShift} onChange={(event) => update('turboShift', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Generation Steps<input type="number" min="1" value={options.steps} onChange={(event) => update('steps', Number(event.target.value))} className={controlClass} /></label>
            <LoraGroup title="Turbo Generation LoRAs" description="Distill 8-Steps and Realistic World are enabled from the supplied workflow. These affect initial composition and rendering." loras={options.turboLoras} availableLoras={loras} onChange={(value) => update('turboLoras', value)} />

            <div className="border-t border-border-primary pt-4 lg:col-span-3"><h3 className="text-sm font-bold text-accent">Base Refine Stage</h3><p className="text-xs text-text-muted">Refines the progressively upscaled image after Turbo generation. It does not create the initial composition.</p></div>
            <label className="text-xs font-semibold text-text-secondary">Base Refine UNET<select value={options.baseUnet} onChange={(event) => update('baseUnet', event.target.value)} className={controlClass}>{withCurrent(options.baseUnet, unets).map((model) => <option key={model}>{model}</option>)}</select></label>
            <label className="text-xs font-semibold text-text-secondary">Base Shift<input type="number" step="0.1" value={options.baseShift} onChange={(event) => update('baseShift', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Refine Steps<input type="number" min="1" value={options.refineSteps} onChange={(event) => update('refineSteps', Number(event.target.value))} className={controlClass} /></label>
            <LoraGroup title="Base Refine LoRAs" description="Portrait Engine is enabled from the supplied workflow. These LoRAs affect the final refinement pass only." loras={options.baseLoras} availableLoras={loras} onChange={(value) => update('baseLoras', value)} />

            <div className="border-t border-border-primary pt-4 lg:col-span-3"><h3 className="text-sm font-bold text-accent">Progressive Upscale and Sampling</h3></div>
            <label className="text-xs font-semibold text-text-secondary">Upscale Factor<input type="number" min="1" max="8" step="0.5" value={options.upscaleFactor} onChange={(event) => update('upscaleFactor', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Max Step Scale<input type="number" min="1" step="0.1" value={options.maxStepScale} onChange={(event) => update('maxStepScale', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Seed<input type="number" value={options.seed ?? ''} placeholder="Random" onChange={(event) => update('seed', event.target.value ? Number(event.target.value) : undefined)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Generation Sampler<input value={options.sampler} onChange={(event) => update('sampler', event.target.value)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Generation Scheduler<input value={options.scheduler} onChange={(event) => update('scheduler', event.target.value)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Refine Enter Sigma<input type="number" min="0" max="1" step="0.05" value={options.refineEnterSigma} onChange={(event) => update('refineEnterSigma', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Refine Sampler<input value={options.refineSampler} onChange={(event) => update('refineSampler', event.target.value)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Refine Scheduler<input value={options.refineScheduler} onChange={(event) => update('refineScheduler', event.target.value)} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">First Tail Steps<input type="number" min="0" value={options.tailStepsFirst} onChange={(event) => update('tailStepsFirst', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Last Tail Steps<input type="number" min="0" value={options.tailStepsLast} onChange={(event) => update('tailStepsLast', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Florence Max Tokens<input type="number" min="64" value={options.florenceMaxTokens} onChange={(event) => update('florenceMaxTokens', Number(event.target.value))} className={controlClass} /></label>
            <label className="text-xs font-semibold text-text-secondary">Florence Beams<input type="number" min="1" value={options.florenceBeams} onChange={(event) => update('florenceBeams', Number(event.target.value))} className={controlClass} /></label>
            <div className="flex flex-wrap gap-4 text-xs text-text-secondary lg:col-span-3">{([['allowCompile', 'Allow Sage Compile'], ['florenceKeepLoaded', 'Keep Florence Loaded'], ['florenceSample', 'Florence Sampling']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={(event) => update(key, event.target.checked)} className="accent-accent" />{label}</label>)}</div>
        </div>}

        <div className="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
            <div className="min-w-0 space-y-5">
                <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><ImageUploader id="z-image-creative-source" label="Source for Florence2" onImageUpload={setSourceFile} sourceFile={sourceFile} /></div><button onClick={onOpenLibrary} title="Choose from Library" className="mb-1 shrink-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-text-secondary hover:text-accent"><LibraryIcon className="h-5 w-5" /></button></div>
                <label className="block text-sm font-semibold text-text-secondary">Prompt Direction<textarea value={options.promptPrefix} onChange={(event) => update('promptPrefix', event.target.value)} rows={4} placeholder="Optional. Florence2 will describe the image automatically." className={controlClass} /></label>
                {(isGenerating || florencePrompt) && <label className="block text-sm font-semibold text-text-secondary">Florence2 Prompt<textarea value={florencePrompt} readOnly rows={7} placeholder="Florence2 prompt will appear here as soon as it is ready..." className={controlClass} /></label>}
                <div className={`grid gap-2 ${isGenerating ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}><button onClick={generate} disabled={!sourceFile || !sourceSize || !isComfyUIConnected || isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Creating reinterpretation...' : 'Create Z-Image Upscale'}</button>{isGenerating && <button onClick={() => { setProgressMessage('Stopping generation...'); cancelComfyUIExecution(); }} title="Stop generation" className="flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-3 font-bold text-white"><CloseIcon className="h-5 w-5" />Stop</button>}</div>
                {!isComfyUIConnected && <p className="text-xs text-danger">Connect ComfyUI to run this workflow.</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                {error && <p className="rounded bg-danger-bg p-3 text-sm text-danger">{error}</p>}
            </div>
            <div className="flex min-h-[420px] flex-col">
                <div className="grid flex-1 gap-4 md:grid-cols-2"><div className="flex min-w-0 flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Florence2 Source</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{sourceUrl ? <img src={sourceUrl} alt="Florence2 source" onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Choose an image</span>}</div></div><div className="flex min-w-0 flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Creative Reinterpretation</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{resultUrl ? <img src={resultUrl} alt="Z-Image creative reinterpretation" className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Result appears here</span>}</div></div></div>
                {resultUrl && <div className="mt-3 grid grid-cols-2 gap-2"><a href={resultUrl} download={`z_image_creative_${sourceFile?.name || 'result.png'}`} className="flex items-center justify-center gap-2 rounded-md border border-border-primary py-2 text-sm font-semibold text-text-secondary"><DownloadIcon className="h-4 w-4" />Download</a><button onClick={save} disabled={saveStatus !== 'idle'} className="flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-bold text-accent-text">{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div>}
            </div>
        </div>
    </>;
};
