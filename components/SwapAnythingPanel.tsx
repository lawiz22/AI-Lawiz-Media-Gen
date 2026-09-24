import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { generateComfyUISwapAnything } from '../services/comfyUIService';
import type { SwapAnythingOptions } from '../services/swapAnythingWorkflow';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider, SelectInput, TextInput } from './InputComponents';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon } from './icons';

interface SwapAnythingPanelProps {
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
}

const LIBRARY_IMAGE_TYPES: LibraryItemType[] = ['image', 'character', 'clothes', 'hair', 'object', 'past-forward-photo', 'group-fusion', 'swap-anything'];

interface SwapPreset {
    id: string;
    label: string;
    destinationTarget: string;
    donorTarget: string;
    prompt: string;
}

const SWAP_PRESETS: SwapPreset[] = [
    {
        id: 'face-hair',
        label: 'Face + Hair',
        destinationTarget: "the woman's face",
        donorTarget: "the woman's hair",
        prompt: '',
    },
    {
        id: 'full-head',
        label: 'Full Head',
        destinationTarget: "the person's head, face, and hair",
        donorTarget: "the person's head, face, and hair",
        prompt: '',
    },
    {
        id: 'full-outfit',
        label: 'Full Outfit',
        destinationTarget: "the person's outfit",
        donorTarget: 'the outfit, including every article of clothing and accessory',
        prompt: 'Style the person in Picture 1 with every article of clothing from Picture 2. In the final image, all features of the clothes should be on the person in Picture 1.',
    },
    {
        id: 'top',
        label: 'Top Clothing',
        destinationTarget: "the person's upper-body clothing",
        donorTarget: 'the top, shirt, jacket, or upper-body clothing',
        prompt: 'Replace only the upper-body clothing in Picture 1 with the top from Picture 2. Preserve the person, pose, face, hair, lower-body clothing, and background.',
    },
    {
        id: 'bottom',
        label: 'Bottom Clothing',
        destinationTarget: "the person's lower-body clothing",
        donorTarget: 'the pants, skirt, shorts, or lower-body clothing',
        prompt: 'Replace only the lower-body clothing in Picture 1 with the bottom from Picture 2. Preserve the person, pose, face, hair, upper-body clothing, and background.',
    },
    {
        id: 'dress',
        label: 'Dress',
        destinationTarget: "the person's outfit",
        donorTarget: 'the dress',
        prompt: 'Style the person in Picture 1 with the dress from Picture 2. Preserve the person, pose, face, hair, body proportions, and background.',
    },
    {
        id: 'swimwear',
        label: 'Swimwear / Bikini',
        destinationTarget: "the person's outfit",
        donorTarget: 'the bikini, swimwear, and matching accessories',
        prompt: 'Style the person in Picture 1 with the bikini or swimwear and matching accessories from Picture 2. Preserve the person, pose, face, hair, body proportions, and background.',
    },
    {
        id: 'accessories',
        label: 'Accessories',
        destinationTarget: "the person's accessories",
        donorTarget: 'the accessories, such as jewelry, belt, bag, hat, or glasses',
        prompt: 'Style the person in Picture 1 with the accessories from Picture 2. Preserve the person, clothing, pose, face, hair, and background.',
    },
    {
        id: 'shoes',
        label: 'Shoes',
        destinationTarget: "the person's shoes",
        donorTarget: 'the shoes or footwear',
        prompt: 'Replace only the footwear in Picture 1 with the shoes from Picture 2. Preserve the person, pose, clothing, and background.',
    },
];

const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean))).map(value => ({ value, label: value }));

const DEFAULT_OPTIONS: SwapAnythingOptions = {
    destinationTarget: "the person's head, face, and hair",
    donorTarget: "the person's head, face, and hair",
    prompt: '',
    unet: 'flux-2-klein-4b-fp8.safetensors',
    clip: 'qwen_3_4b.safetensors',
    vae: 'flux2-vae.safetensors',
    samCheckpoint: 'sam3.1_multiplex_fp16.safetensors',
    megapixels: 1,
    donorMegapixels: 1.5,
    samThreshold: 0.5,
    samRefineIterations: 2,
    maskGrow: 2,
    steps: 4,
    cfg: 1,
    sampler: 'ddim',
    seed: -1,
    lora1Name: '',
    lora1Strength: 1,
    lora2Name: '',
    lora2Strength: 1,
};

const SwapAnythingPanel: React.FC<SwapAnythingPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const [destinationImage, setDestinationImage] = useState<File | null>(null);
    const [donorImage, setDonorImage] = useState<File | null>(null);
    const [options, setOptions] = useState<SwapAnythingOptions>(DEFAULT_OPTIONS);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [libraryTarget, setLibraryTarget] = useState<'destination' | 'donor' | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const models = useMemo(() => Array.from(new Set([
        ...getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name).filter(model => /flux[-_ ]?2|klein/i.test(model)),
        ...getOptions(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name),
    ])), [comfyUIObjectInfo]);
    const clips = useMemo(() => getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name), [comfyUIObjectInfo]);
    const vaes = useMemo(() => getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name), [comfyUIObjectInfo]);
    const samModels = useMemo(() => getOptions(comfyUIObjectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name).filter(model => /sam3/i.test(model)), [comfyUIObjectInfo]);
    const samplers = useMemo(() => getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name), [comfyUIObjectInfo]);
    const loras = useMemo(() => getOptions(comfyUIObjectInfo?.LoraLoader?.input?.required?.lora_name).filter(model => /flux[-_ ]?2|klein/i.test(model)), [comfyUIObjectInfo]);
    const activePreset = useMemo(() => SWAP_PRESETS.find(preset =>
        preset.destinationTarget === options.destinationTarget &&
        preset.donorTarget === options.donorTarget &&
        preset.prompt === (options.prompt || '')
    )?.id || 'custom', [options.destinationTarget, options.donorTarget, options.prompt]);

    const updateOption = <K extends keyof SwapAnythingOptions>(key: K, value: SwapAnythingOptions[K]) => setOptions(current => ({ ...current, [key]: value }));
    const handleNumber = (key: keyof SwapAnythingOptions) => (event: React.ChangeEvent<HTMLInputElement>) => updateOption(key, Number(event.target.value) as never);
    const handleText = (key: keyof SwapAnythingOptions) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => updateOption(key, event.target.value as never);
    const applyPreset = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = SWAP_PRESETS.find(candidate => candidate.id === event.target.value);
        if (!preset) return;
        setOptions(current => ({
            ...current,
            destinationTarget: preset.destinationTarget,
            donorTarget: preset.donorTarget,
            prompt: preset.prompt,
        }));
    };

    const selectLibraryImage = async (item: LibraryItem) => {
        const response = await fetch(item.media);
        const blob = await response.blob();
        const file = new File([blob], `${libraryTarget || 'swap'}-${item.name || item.id}.png`, { type: blob.type || 'image/png' });
        if (libraryTarget === 'destination') setDestinationImage(file);
        if (libraryTarget === 'donor') setDonorImage(file);
    };

    const generate = async () => {
        if (!destinationImage || !donorImage) return;
        setIsGenerating(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        try {
            const generated = await generateComfyUISwapAnything(destinationImage, donorImage, {
                ...options,
                seed: options.seed < 0 ? Math.floor(Math.random() * 1e15) : options.seed,
            }, (message, value) => {
                setProgressMessage(message);
                setProgress(value);
            });
            setResult(generated);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'Swap Anything generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    const reset = () => {
        setDestinationImage(null);
        setDonorImage(null);
        setOptions(DEFAULT_OPTIONS);
        setResult(null);
        setError(null);
        setSaveStatus('idle');
    };

    const saveResult = async () => {
        if (!result || !destinationImage) return;
        setSaveStatus('saving');
        try {
            await dispatch(addToLibrary({
                mediaType: 'swap-anything',
                name: `Swap Anything - ${options.destinationTarget}`,
                media: result,
                thumbnail: await dataUrlToThumbnail(result, 256),
                sourceImage: await fileToDataUrl(destinationImage),
            })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save the result.');
        }
    };

    const canGenerate = isComfyUIConnected && !!destinationImage && !!donorImage && !!options.destinationTarget.trim() && !!options.donorTarget.trim() && !isGenerating;

    return <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
            <div><h2 className="text-xl font-bold text-accent">Swap Anything</h2><p className="text-xs text-text-muted">Replace one selected element while preserving the destination image.</p></div>
            <button type="button" onClick={() => setAdvancedOpen(open => !open)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${advancedOpen ? 'border-accent text-accent' : 'border-border-primary text-text-secondary'}`}>Advanced</button>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="min-w-0 space-y-2"><ImageUploader id="swap-destination" label="Picture 1 - Destination" sourceFile={destinationImage} onImageUpload={setDestinationImage} disabled={isGenerating} /><button type="button" onClick={() => setLibraryTarget('destination')} disabled={isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm font-semibold text-text-secondary hover:text-accent"><LibraryIcon className="h-4 w-4" />Choose from Library</button></div>
                    <div className="min-w-0 space-y-2"><ImageUploader id="swap-donor" label="Picture 2 - Element Donor" sourceFile={donorImage} onImageUpload={setDonorImage} disabled={isGenerating} /><button type="button" onClick={() => setLibraryTarget('donor')} disabled={isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm font-semibold text-text-secondary hover:text-accent"><LibraryIcon className="h-4 w-4" />Choose from Library</button></div>
                </div>
                <SelectInput label="Swap preset" value={activePreset} onChange={applyPreset} options={[{ value: 'custom', label: 'Custom' }, ...SWAP_PRESETS.map(preset => ({ value: preset.id, label: preset.label }))]} disabled={isGenerating} />
                <TextInput label="Area to replace in Picture 1" value={options.destinationTarget} onChange={handleText('destinationTarget')} disabled={isGenerating} />
                <TextInput label="Element to take from Picture 2" value={options.donorTarget} onChange={handleText('donorTarget')} disabled={isGenerating} />
                <TextInput label="Optional editing instructions" value={options.prompt || ''} onChange={handleText('prompt')} disabled={isGenerating} isTextArea />

                {advancedOpen && <div className="space-y-5 border-t border-border-primary pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <SelectInput label="FLUX2 Model" value={options.unet} onChange={handleText('unet')} options={withCurrent(options.unet, models)} disabled={isGenerating} />
                        <SelectInput label="SAM3.1 Model" value={options.samCheckpoint} onChange={handleText('samCheckpoint')} options={withCurrent(options.samCheckpoint, samModels)} disabled={isGenerating} />
                        <SelectInput label="CLIP" value={options.clip} onChange={handleText('clip')} options={withCurrent(options.clip, clips)} disabled={isGenerating} />
                        <SelectInput label="VAE" value={options.vae} onChange={handleText('vae')} options={withCurrent(options.vae, vaes)} disabled={isGenerating} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <NumberSlider label={`Destination MP: ${options.megapixels}`} value={options.megapixels} onChange={handleNumber('megapixels')} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`Donor MP: ${options.donorMegapixels}`} value={options.donorMegapixels} onChange={handleNumber('donorMegapixels')} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`SAM Threshold: ${options.samThreshold}`} value={options.samThreshold} onChange={handleNumber('samThreshold')} min={0.05} max={1} step={0.05} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`SAM Refine Iterations: ${options.samRefineIterations}`} value={options.samRefineIterations} onChange={handleNumber('samRefineIterations')} min={0} max={10} step={1} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`Mask Grow: ${options.maskGrow}`} value={options.maskGrow} onChange={handleNumber('maskGrow')} min={-32} max={64} step={1} disabled={isGenerating} allowDirectInput />
                        <SelectInput label="Sampler" value={options.sampler} onChange={handleText('sampler')} options={withCurrent(options.sampler, samplers)} disabled={isGenerating} />
                        <NumberSlider label={`Steps: ${options.steps}`} value={options.steps} onChange={handleNumber('steps')} min={1} max={40} step={1} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`CFG: ${options.cfg}`} value={options.cfg} onChange={handleNumber('cfg')} min={0.1} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                    </div>
                    <label className="block text-sm font-medium text-text-secondary">Seed (-1 = random)<input type="number" value={options.seed} onChange={handleNumber('seed')} disabled={isGenerating} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2" /></label>
                    <div className="grid gap-4 rounded-md border border-border-primary p-3 sm:grid-cols-2">
                        <div className="space-y-3"><SelectInput label="Optional LoRA 1" value={options.lora1Name || ''} onChange={handleText('lora1Name')} options={[{ value: '', label: 'None' }, ...withCurrent(options.lora1Name || '', loras).filter(option => option.value)]} disabled={isGenerating} /><NumberSlider label={`LoRA 1 Strength: ${options.lora1Strength}`} value={options.lora1Strength} onChange={handleNumber('lora1Strength')} min={-10} max={10} step={0.5} disabled={isGenerating} allowDirectInput /></div>
                        <div className="space-y-3"><SelectInput label="Optional LoRA 2" value={options.lora2Name || ''} onChange={handleText('lora2Name')} options={[{ value: '', label: 'None' }, ...withCurrent(options.lora2Name || '', loras).filter(option => option.value)]} disabled={isGenerating} /><NumberSlider label={`LoRA 2 Strength: ${options.lora2Strength}`} value={options.lora2Strength} onChange={handleNumber('lora2Strength')} min={-10} max={10} step={0.5} disabled={isGenerating} allowDirectInput /></div>
                    </div>
                </div>}

                {!isComfyUIConnected && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use Swap Anything.</p>}
                {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                <div className="flex gap-3"><button type="button" onClick={reset} disabled={isGenerating} className="flex items-center gap-2 rounded-md border border-border-primary px-4 py-3 font-semibold text-text-secondary"><RefreshIcon className="h-5 w-5" />Reset</button><button type="button" onClick={generate} disabled={!canGenerate} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Swapping...' : 'Swap Anything'}</button></div>
            </div>

            <div className="flex min-h-[520px] flex-col">
                <h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Result</h3>
                <div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{result ? <img src={result} alt="Swap Anything result" className="max-h-[70vh] max-w-full object-contain" /> : <span className="px-6 text-center text-sm text-text-muted">The generated image will preserve Picture 1 dimensions.</span>}</div>
                {result && <div className="mt-3 grid grid-cols-2 gap-2"><a href={result} download="swap-anything.png" className="flex items-center justify-center gap-2 rounded-md border border-border-primary py-2 text-sm font-semibold text-text-secondary"><DownloadIcon className="h-4 w-4" />Download</a><button type="button" onClick={saveResult} disabled={saveStatus !== 'idle'} className="flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-bold text-accent-text disabled:opacity-60">{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div>}
            </div>
        </div>

        <LibraryPickerModal isOpen={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelectItem={selectLibraryImage} filter={LIBRARY_IMAGE_TYPES} />
    </section>;
};

export default SwapAnythingPanel;