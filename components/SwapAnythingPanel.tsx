import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { generateComfyUISwapAnything } from '../services/comfyUIService';
import { defaultSwapAnythingOptions, type SwapAnythingOptions } from '../services/swapAnythingWorkflow';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { TextInput } from './InputComponents';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon } from './icons';
import { Button, ModelFields, NumberField, SamplerFields, SeedField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { SettingsLayout } from './ui/SettingsLayout';
import { ui } from './ui/styles';

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

const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : Array.isArray(input?.[1]?.options) ? input[1].options : [];
const NAME = 'Swap Anything';

const DEFAULT_OPTIONS = defaultSwapAnythingOptions();

const SwapAnythingPanel: React.FC<SwapAnythingPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const [destinationImage, setDestinationImage] = useState<File | null>(null);
    const [donorImage, setDonorImage] = useState<File | null>(null);
    const [options, setOptions] = useState<SwapAnythingOptions>(DEFAULT_OPTIONS);
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
    const handleText = (key: keyof SwapAnythingOptions) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => updateOption(key, event.target.value as never);
    const applyPreset = (id: string) => {
        const preset = SWAP_PRESETS.find(candidate => candidate.id === id);
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
    const number = (label: string, key: 'megapixels' | 'donorMegapixels' | 'samThreshold' | 'samRefineIterations' | 'maskGrow', min: number, max: number, step: number) =>
        <NumberField slider label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} min={min} max={max} step={step} disabled={isGenerating} onChange={value => updateOption(key, value)} />;
    const source = (side: 'destination' | 'donor', label: string, file: File | null, change: (file: File | null) => void) => <div className="min-w-0 space-y-2">
        <ImageUploader id={`swap-${side}`} label={label} sourceFile={file} onImageUpload={change} disabled={isGenerating} />
        <Button className="w-full" onClick={() => setLibraryTarget(side)} disabled={isGenerating}><LibraryIcon className="h-4 w-4" />Choose from Library</Button>
    </div>;

    return <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
        <header className="border-b border-border-primary px-5 py-4"><h2 className="text-xl font-bold text-accent">{NAME}</h2><p className="text-xs text-text-muted">Replace one selected element while preserving the destination image.</p></header>

        <div className="p-5">
            <SettingsLayout label={NAME} disabled={isGenerating}
                top={<>{source('destination', 'Picture 1 - Destination', destinationImage, setDestinationImage)}{source('donor', 'Picture 2 - Element Donor', donorImage, setDonorImage)}</>}
                models={() => <ModelFields name={NAME} disabled={isGenerating} onChange={(id, value) => updateOption(id as 'unet' | 'samCheckpoint' | 'clip' | 'vae', value)} fields={[
                    { id: 'unet', label: 'FLUX2 Model', value: options.unet, choices: models },
                    { id: 'samCheckpoint', label: 'SAM3.1 Model', value: options.samCheckpoint, choices: samModels },
                    { id: 'clip', label: 'CLIP', value: options.clip, choices: clips },
                    { id: 'vae', label: 'VAE', value: options.vae, choices: vaes },
                ]} />}
                loras={() => ([1, 2] as const).map(index => <div key={index} className="space-y-2">
                    <Select variant="search" label={`Optional LoRA ${index}`} ariaLabel={`${NAME} LoRA ${index}`} value={options[`lora${index}Name`] || ''} disabled={isGenerating}
                        options={[{ value: '', label: 'None' }, ...loras.map(value => ({ value, label: value }))]} onChange={value => updateOption(`lora${index}Name`, value)} />
                    <NumberField slider label={`LoRA ${index} Strength`} ariaLabel={`${NAME} LoRA ${index} strength`} value={options[`lora${index}Strength`]} min={-10} max={10} step={0.5} disabled={isGenerating} onChange={value => updateOption(`lora${index}Strength`, value)} />
                </div>)}
                sampler={() => <>
                    <SamplerFields name={NAME} disabled={isGenerating} value={{ sampler: options.sampler, steps: options.steps, cfg: options.cfg }} samplers={samplers}
                        limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }} onChange={patch => setOptions(current => ({ ...current, ...patch }))} />
                    {/* The workflow uses a negative seed for "new seed for every run". */}
                    <SeedField name={NAME} value={Math.max(options.seed, 0)} onChange={seed => updateOption('seed', seed)} randomize={options.seed < 0} onRandomizeChange={random => updateOption('seed', random ? -1 : 0)} disabled={isGenerating} />
                </>}
                advanced={() => <>
                    {number('Destination MP', 'megapixels', 0.25, 4, 0.25)}
                    {number('Donor MP', 'donorMegapixels', 0.25, 4, 0.25)}
                    {number('SAM Threshold', 'samThreshold', 0.05, 1, 0.05)}
                    {number('SAM Refine Iterations', 'samRefineIterations', 0, 10, 1)}
                    {number('Mask Grow', 'maskGrow', -32, 64, 1)}
                </>}>
                <Select label="Swap preset" ariaLabel={`${NAME} Swap preset`} value={activePreset} onChange={applyPreset} options={[{ value: 'custom', label: 'Custom' }, ...SWAP_PRESETS.map(preset => ({ value: preset.id, label: preset.label }))]} disabled={isGenerating} />
                <TextInput label="Area to replace in Picture 1" value={options.destinationTarget} onChange={handleText('destinationTarget')} disabled={isGenerating} />
                <TextInput label="Element to take from Picture 2" value={options.donorTarget} onChange={handleText('donorTarget')} disabled={isGenerating} />
                <PromptBox kind="instruction" label="Optional editing instructions" ariaLabel={`${NAME} Optional editing instructions`} rows={3} value={options.prompt || ''} onChange={value => updateOption('prompt', value)} disabled={isGenerating} />

                {!isComfyUIConnected && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use Swap Anything.</p>}
                {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                <div className="flex gap-3">
                    <Button onClick={reset} disabled={isGenerating}><RefreshIcon className="h-5 w-5" />Reset</Button>
                    <Button variant="primary" className="flex-1" onClick={generate} disabled={!canGenerate}>{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Swapping...' : 'Swap Anything'}</Button>
                </div>

                <h3 className="text-xs font-bold uppercase text-text-muted">Result</h3>
                <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{result ? <img src={result} alt="Swap Anything result" className="max-h-[70vh] max-w-full object-contain" /> : <span className="px-6 text-center text-sm text-text-muted">The generated image will preserve Picture 1 dimensions.</span>}</div>
                {result && <div className="grid grid-cols-2 gap-2">
                    <a href={result} download="swap-anything.png" className={ui.buttons.secondary}><DownloadIcon className="h-4 w-4" />Download</a>
                    <Button variant="primary" onClick={saveResult} disabled={saveStatus !== 'idle'}>{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</Button>
                </div>}
            </SettingsLayout>
        </div>

        <LibraryPickerModal isOpen={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelectItem={selectLibraryImage} filter={LIBRARY_IMAGE_TYPES} />
    </section>;
};

export default SwapAnythingPanel;