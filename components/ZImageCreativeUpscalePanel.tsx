import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { cancelComfyUIExecution, generateZImageCreativeUpscale, type ZImageCreativeLora, type ZImageCreativeUpscaleOptions } from '../services/comfyUIService';
import { familyFiles } from '../services/styleLibrary';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, SaveIcon, SpinnerIcon } from './icons';
import { ImageUploader } from './ImageUploader';
import { useModelInventory } from './useModelInventory';
import { Accordion } from './ui/Accordion';
import { NumberField, SeedField, TextField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';

interface Props {
    sourceFile: File | null;
    setSourceFile: (file: File | null) => void;
    onOpenLibrary: () => void;
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
}

const NAME = 'Z-Image Upscale';
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

type ModelKey = 'turboUnet' | 'baseUnet' | 'vae' | 'clip' | 'upscaleModel';
type TextKey = 'florenceModel' | 'sampler' | 'scheduler' | 'refineSampler' | 'refineScheduler';
type NumberKey = 'turboShift' | 'baseShift' | 'upscaleFactor' | 'maxStepScale' | 'steps' | 'tailStepsFirst' | 'tailStepsLast' | 'refineSteps' | 'refineEnterSigma' | 'florenceMaxTokens' | 'florenceBeams';
const choices = (widget: any): string[] => Array.isArray(widget?.[0]) ? widget[0] : Array.isArray(widget?.[1]?.options) ? widget[1].options : [];

const LoraGroup: React.FC<{
    title: string;
    description: string;
    loras: ZImageCreativeLora[];
    availableLoras: string[];
    onChange: (loras: ZImageCreativeLora[]) => void;
}> = ({ title, description, loras, availableLoras, onChange }) => {
    const update = (index: number, patch: Partial<ZImageCreativeLora>) => onChange(loras.map((lora, loraIndex) => loraIndex === index ? { ...lora, ...patch } : lora));
    const options = [{ value: '', label: 'None' }, ...availableLoras.map(value => ({ value, label: value }))];
    return <div className="space-y-3">
        <div><h4 className="text-sm font-bold text-accent">{title}</h4><p className="text-xs text-text-muted">{description}</p></div>
        {loras.map((lora, index) => {
            const slot = `${title} ${index + 1}`;
            return <div key={index} className="space-y-2 rounded-md border border-border-primary p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" aria-label={`Enable ${slot}`} checked={lora.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} className="accent-accent" />LoRA {index + 1}</label>
                <Select variant="search" ariaLabel={`${slot} file`} value={lora.name} options={options} onChange={(name) => update(index, { name, enabled: Boolean(name) })} />
                <NumberField slider label="Strength" ariaLabel={`${slot} strength`} value={lora.strength} min={-10} max={10} step={0.5} onChange={(strength) => update(index, { strength })} />
            </div>;
        })}
    </div>;
};

export const ZImageCreativeUpscalePanel: React.FC<Props> = ({ sourceFile, setSourceFile, onOpenLibrary, isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const { inventory } = useModelInventory();
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

    const unets = useMemo(() => familyFiles(choices(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name), 'zit-base', inventory), [comfyUIObjectInfo, inventory]);
    const vaes = useMemo(() => choices(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name), [comfyUIObjectInfo]);
    const clips = useMemo(() => choices(comfyUIObjectInfo?.CLIPLoaderGGUF?.input?.required?.clip_name), [comfyUIObjectInfo]);
    const upscaleModels = useMemo(() => choices(comfyUIObjectInfo?.UpscaleModelLoader?.input?.required?.model_name), [comfyUIObjectInfo]);
    const loras = useMemo(() => familyFiles(choices(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name), 'zit-base', inventory), [comfyUIObjectInfo, inventory]);

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

    const model = (label: string, key: ModelKey, files: string[]) =>
        <Select variant="search" label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} options={files} onChange={(value) => update(key, value)} />;
    const text = (label: string, key: TextKey) =>
        <TextField label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} onChange={(value) => update(key, value)} />;
    const number = (label: string, key: NumberKey, range: { min?: number; max?: number; step?: number }) =>
        <NumberField slider={range.max !== undefined} label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} {...range} onChange={(value) => update(key, value)} />;
    const stage = (title: string, description: string) => <div><h4 className="text-sm font-bold text-accent">{title}</h4><p className="text-xs text-text-muted">{description}</p></div>;

    return <>
        <div className="border-b border-border-primary px-5 py-3 text-sm text-text-secondary"><strong className="text-highlight-yellow">Creative reinterpretation:</strong> Florence2 describes the source, then Z-Image generates a new image. Identity, pose and details may differ from the original.</div>
        <div className="grid items-start gap-6 p-5 lg:grid-cols-[320px_1fr]">
            <div className="min-w-0 space-y-4">
                <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><ImageUploader id="z-image-creative-source" label="Source for Florence2" onImageUpload={setSourceFile} sourceFile={sourceFile} /></div><button onClick={onOpenLibrary} title="Choose from Library" className="mb-1 shrink-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-text-secondary hover:text-accent"><LibraryIcon className="h-5 w-5" /></button></div>
                <Accordion title="Models">
                    {model('Turbo UNET', 'turboUnet', unets)}
                    {model('Base Refine UNET', 'baseUnet', unets)}
                    {model('VAE', 'vae', vaes)}
                    {model('CLIP GGUF', 'clip', clips)}
                    {model('Pixel Upscale Model', 'upscaleModel', upscaleModels)}
                    {text('Florence2 Model', 'florenceModel')}
                    <Select label="Florence Precision" ariaLabel={`${NAME} Florence Precision`} value={options.florencePrecision} options={['fp16', 'bf16', 'fp32']} onChange={(value) => update('florencePrecision', value)} />
                    <Select label="Florence Attention" ariaLabel={`${NAME} Florence Attention`} value={options.florenceAttention} options={['sdpa', 'flash_attention_2', 'eager']} onChange={(value) => update('florenceAttention', value)} />
                </Accordion>
                <Accordion title="LoRAs">
                    <LoraGroup title="Turbo Generation LoRAs" description="Distill 8-Steps and Realistic World are enabled from the supplied workflow. These affect initial composition and rendering." loras={options.turboLoras} availableLoras={loras} onChange={(value) => update('turboLoras', value)} />
                    <LoraGroup title="Base Refine LoRAs" description="Portrait Engine is enabled from the supplied workflow. These LoRAs affect the final refinement pass only." loras={options.baseLoras} availableLoras={loras} onChange={(value) => update('baseLoras', value)} />
                </Accordion>
                <Accordion title="Sampler">
                    {stage('Turbo Generation Stage', 'Creates the new composition from the Florence2 prompt and an empty latent.')}
                    {number('Generation Steps', 'steps', { min: 1, step: 1 })}
                    {number('Turbo Shift', 'turboShift', { step: 0.1 })}
                    {text('Generation Sampler', 'sampler')}
                    {text('Generation Scheduler', 'scheduler')}
                    {stage('Base Refine Stage', 'Refines the progressively upscaled image after Turbo generation. It does not create the initial composition.')}
                    {number('Refine Steps', 'refineSteps', { min: 1, step: 1 })}
                    {number('Base Shift', 'baseShift', { step: 0.1 })}
                    {number('Refine Enter Sigma', 'refineEnterSigma', { min: 0, max: 1, step: 0.05 })}
                    {text('Refine Sampler', 'refineSampler')}
                    {text('Refine Scheduler', 'refineScheduler')}
                    {number('First Tail Steps', 'tailStepsFirst', { min: 0, step: 1 })}
                    {number('Last Tail Steps', 'tailStepsLast', { min: 0, step: 1 })}
                    <SeedField name={NAME} value={options.seed ?? 0} onChange={(seed) => update('seed', seed)} randomize={options.seed === undefined} onRandomizeChange={(random) => update('seed', random ? undefined : 0)} />
                </Accordion>
                <Accordion title="Advanced">
                    {number('Upscale Factor', 'upscaleFactor', { min: 1, max: 8, step: 0.5 })}
                    {number('Max Step Scale', 'maxStepScale', { min: 1, step: 0.1 })}
                    {number('Florence Max Tokens', 'florenceMaxTokens', { min: 64, step: 1 })}
                    {number('Florence Beams', 'florenceBeams', { min: 1, step: 1 })}
                    <div className="space-y-2 text-sm text-text-secondary">{([['allowCompile', 'Allow Sage Compile'], ['florenceKeepLoaded', 'Keep Florence Loaded'], ['florenceSample', 'Florence Sampling']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={(event) => update(key, event.target.checked)} className="accent-accent" />{label}</label>)}</div>
                </Accordion>
            </div>
            <div className="min-w-0 space-y-4">
                <PromptBox kind="instruction" label="Prompt Direction" ariaLabel={`${NAME} Prompt Direction`} rows={4} value={options.promptPrefix} onChange={(value) => update('promptPrefix', value)} placeholder="Optional. Florence2 will describe the image automatically." hint="Added before the Florence2 caption." />
                {(isGenerating || florencePrompt) && <PromptBox kind="readonly" label="Florence2 Prompt" ariaLabel={`${NAME} Florence2 Prompt`} rows={7} value={florencePrompt} placeholder="Florence2 prompt will appear here as soon as it is ready..." />}
                <div className={`grid gap-2 ${isGenerating ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}><button onClick={generate} disabled={!sourceFile || !sourceSize || !isComfyUIConnected || isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Creating reinterpretation...' : 'Create Z-Image Upscale'}</button>{isGenerating && <button onClick={() => { setProgressMessage('Stopping generation...'); cancelComfyUIExecution(); }} title="Stop generation" className="flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-3 font-bold text-white"><CloseIcon className="h-5 w-5" />Stop</button>}</div>
                {!isComfyUIConnected && <p className="text-xs text-danger">Connect ComfyUI to run this workflow.</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                {error && <p className="rounded bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                <div className="grid gap-4 md:grid-cols-2"><div className="flex min-h-[420px] min-w-0 flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Florence2 Source</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{sourceUrl ? <img src={sourceUrl} alt="Florence2 source" onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Choose an image</span>}</div></div><div className="flex min-h-[420px] min-w-0 flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Creative Reinterpretation</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{resultUrl ? <img src={resultUrl} alt="Z-Image creative reinterpretation" className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Result appears here</span>}</div></div></div>
                {resultUrl && <div className="grid grid-cols-2 gap-2"><a href={resultUrl} download={`z_image_creative_${sourceFile?.name || 'result.png'}`} className="flex items-center justify-center gap-2 rounded-md border border-border-primary py-2 text-sm font-semibold text-text-secondary"><DownloadIcon className="h-4 w-4" />Download</a><button onClick={save} disabled={saveStatus !== 'idle'} className="flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-bold text-accent-text">{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div>}
            </div>
        </div>
    </>;
};
