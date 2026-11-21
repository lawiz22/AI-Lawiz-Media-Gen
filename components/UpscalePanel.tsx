import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { generateSeedVr2Upscale, type SeedVr2UpscaleOptions } from '../services/comfyUIService';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { getSeedVr2Models, selectSeedVr2Model } from '../utils/seedVr2Models';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, SaveIcon, SpinnerIcon } from './icons';
import { ImageUploader } from './ImageUploader';
import { ZImageCreativeUpscalePanel } from './ZImageCreativeUpscalePanel';
import { Accordion } from './ui/Accordion';
import { NumberField, SeedField, TextField } from './ui/fields';
import { Select } from './ui/Select';

interface UpscalePanelProps {
    sourceFile: File | null;
    setSourceFile: (file: File | null) => void;
    onOpenLibrary: () => void;
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
}

const NAME = 'SeedVR2';
const DEFAULT_OPTIONS: SeedVr2UpscaleOptions = {
    ditModel: '',
    vaeModel: '',
    resolution: 2180,
    ditDevice: 'cuda:0',
    blocksToSwap: 36,
    swapIoComponents: false,
    ditOffloadDevice: 'cpu',
    cacheDitModel: false,
    attentionMode: 'flash_attn',
    vaeDevice: 'cuda:0',
    vaeEncodeTiled: true,
    vaeEncodeTileSize: 1024,
    vaeEncodeTileOverlap: 128,
    vaeDecodeTiled: true,
    vaeDecodeTileSize: 1024,
    vaeDecodeTileOverlap: 128,
    tileDebug: 'false',
    vaeOffloadDevice: 'cpu',
    cacheVaeModel: false,
    batchSize: 1,
    uniformBatchSize: false,
    colorCorrection: 'lab',
    temporalOverlap: 16,
    prependFrames: 0,
    inputNoiseScale: 0,
    latentNoiseScale: 0,
    upscalerOffloadDevice: 'cpu',
    enableDebug: false,
};

export const UpscalePanel: React.FC<UpscalePanelProps> = ({ sourceFile, setSourceFile, onOpenLibrary, isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const [options, setOptions] = useState(DEFAULT_OPTIONS);
    const [activeUpscaler, setActiveUpscaler] = useState<'seedvr2' | 'z-image-creative'>('seedvr2');
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
    const [resultUrl, setResultUrl] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [comparePosition, setComparePosition] = useState(50);

    const { ditModels, vaeModels } = useMemo(() => getSeedVr2Models(comfyUIObjectInfo), [comfyUIObjectInfo]);

    useEffect(() => {
        setOptions((current) => {
            const ditModel = selectSeedVr2Model(ditModels, current.ditModel);
            const vaeModel = selectSeedVr2Model(vaeModels, current.vaeModel);
            return ditModel === current.ditModel && vaeModel === current.vaeModel
                ? current
                : { ...current, ditModel, vaeModel };
        });
    }, [ditModels, vaeModels]);

    const modelsAvailable = ditModels.length > 0 && vaeModels.length > 0;

    useEffect(() => {
        if (!sourceFile) {
            setSourceUrl('');
            setSourceSize(null);
            setResultUrl('');
            return;
        }
        const url = URL.createObjectURL(sourceFile);
        setSourceUrl(url);
        setResultUrl('');
        setComparePosition(50);
        setSaveStatus('idle');
        setError('');
        return () => URL.revokeObjectURL(url);
    }, [sourceFile]);

    const outputSize = useMemo(() => {
        if (!sourceSize) return null;
        const upscaleScale = options.resolution / Math.max(sourceSize.width, sourceSize.height);
        return {
            width: Math.max(1, Math.round(sourceSize.width * upscaleScale)),
            height: Math.max(1, Math.round(sourceSize.height * upscaleScale)),
        };
    }, [options.resolution, sourceSize]);

    const updateOption = <K extends keyof SeedVr2UpscaleOptions>(key: K, value: SeedVr2UpscaleOptions[K]) => {
        setOptions((current) => ({ ...current, [key]: value }));
    };

    const generate = async () => {
        if (!sourceFile || !isComfyUIConnected || !modelsAvailable || isGenerating) return;
        setIsGenerating(true);
        setResultUrl('');
        setError('');
        setSaveStatus('idle');
        try {
            const result = await generateSeedVr2Upscale(sourceFile, options, (message, value) => {
                setProgressMessage(message);
                setProgress(value);
            });
            setResultUrl(result);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'SeedVR2 upscale failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    const saveToLibrary = async () => {
        if (!resultUrl || !sourceFile || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        try {
            await dispatch(addToLibrary({
                mediaType: 'image',
                name: `Upscale SeedVR2 - ${sourceFile.name}`,
                media: resultUrl,
                thumbnail: await dataUrlToThumbnail(resultUrl, 256),
            })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save the upscaled image.');
        }
    };

    const text = (label: string, key: 'ditDevice' | 'ditOffloadDevice' | 'vaeDevice' | 'vaeOffloadDevice' | 'upscalerOffloadDevice') =>
        <TextField label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} onChange={(value) => updateOption(key, value)} />;
    const slider = (label: string, key: 'blocksToSwap' | 'vaeEncodeTileSize' | 'vaeEncodeTileOverlap' | 'vaeDecodeTileSize' | 'vaeDecodeTileOverlap' | 'inputNoiseScale' | 'latentNoiseScale', min: number, max: number, step: number) =>
        <NumberField slider label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} min={min} max={max} step={step} onChange={(value) => updateOption(key, value)} />;
    const count = (label: string, key: 'batchSize' | 'temporalOverlap' | 'prependFrames', min: number) =>
        <NumberField label={label} ariaLabel={`${NAME} ${label}`} value={options[key]} min={min} step={1} onChange={(value) => updateOption(key, value)} />;

    return (
        <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
            <header className="border-b border-border-primary px-5 py-4"><h2 className="text-xl font-bold text-accent">Upscale</h2><p className="text-xs text-text-muted">Dedicated enhancement workflows</p></header>
            <div className="flex gap-1 overflow-x-auto border-b border-border-primary px-5 pt-3">
                <button onClick={() => setActiveUpscaler('seedvr2')} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${activeUpscaler === 'seedvr2' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Upscale SeedVR2</button>
                <button onClick={() => setActiveUpscaler('z-image-creative')} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${activeUpscaler === 'z-image-creative' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Z-Image Creative Upscale</button>
            </div>

            {activeUpscaler === 'z-image-creative' ? (
                <ZImageCreativeUpscalePanel sourceFile={sourceFile} setSourceFile={setSourceFile} onOpenLibrary={onOpenLibrary} isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} />
            ) : (
            <div className="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
                <div className="min-w-0 space-y-5">
                    <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><ImageUploader id="seedvr2-source" label="Source Image" onImageUpload={setSourceFile} sourceFile={sourceFile} /></div><button onClick={onOpenLibrary} title="Choose from Library" className="mb-1 shrink-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-text-secondary hover:text-accent"><LibraryIcon className="h-5 w-5" /></button></div>
                    <NumberField slider label="Maximum output side (px)" ariaLabel={`${NAME} Maximum output side`} value={options.resolution} min={512} max={2180} step={2} onChange={(value) => updateOption('resolution', value)} />
                    <div className="rounded-md border border-border-primary bg-bg-primary p-3 text-xs text-text-muted">{sourceSize ? `Source ${sourceSize.width}×${sourceSize.height} → target ${outputSize?.width}×${outputSize?.height}` : 'Output preserves the original aspect ratio.'}<br />SeedVR2 is capped at 2180 px on the longest side.</div>
                    <button onClick={generate} disabled={!sourceFile || !isComfyUIConnected || !modelsAvailable || isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Upscaling...' : 'Upscale with SeedVR2'}</button>
                    {!isComfyUIConnected && <p className="text-xs text-danger">Connect ComfyUI to run SeedVR2.</p>}
                    {isComfyUIConnected && !modelsAvailable && <p className="text-xs text-danger">{comfyUIObjectInfo ? `No SeedVR2 ${!ditModels.length ? 'DiT' : 'VAE'} models available. Check the installed SeedVR2 nodes and models, then reconnect ComfyUI.` : 'Loading SeedVR2 model lists from ComfyUI...'}</p>}
                    {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                    {error && <p className="rounded bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                    <Accordion title="Models">
                        <Select variant="search" label="DiT Model" ariaLabel={`${NAME} DiT Model`} value={options.ditModel} options={ditModels} placeholder="Select a model" onChange={(value) => updateOption('ditModel', value)} />
                        <Select variant="search" label="VAE Model" ariaLabel={`${NAME} VAE Model`} value={options.vaeModel} options={vaeModels} placeholder="Select a model" onChange={(value) => updateOption('vaeModel', value)} />
                    </Accordion>
                    <Accordion title="Advanced">
                        <Select label="Attention" ariaLabel={`${NAME} Attention`} value={options.attentionMode} options={['flash_attn', 'sdpa', 'sageattn']} onChange={(value) => updateOption('attentionMode', value)} />
                        {text('DiT Device', 'ditDevice')}
                        {text('DiT Offload Device', 'ditOffloadDevice')}
                        {slider('Blocks to Swap', 'blocksToSwap', 0, 40, 1)}
                        {text('VAE Device', 'vaeDevice')}
                        {text('VAE Offload Device', 'vaeOffloadDevice')}
                        {slider('Encode Tile', 'vaeEncodeTileSize', 256, 2048, 128)}
                        {slider('Encode Overlap', 'vaeEncodeTileOverlap', 0, 512, 32)}
                        {slider('Decode Tile', 'vaeDecodeTileSize', 256, 2048, 128)}
                        {slider('Decode Overlap', 'vaeDecodeTileOverlap', 0, 512, 32)}
                        <Select label="Color Correction" ariaLabel={`${NAME} Color Correction`} value={options.colorCorrection} options={['lab', 'wavelet', 'none']} onChange={(value) => updateOption('colorCorrection', value)} />
                        <Select label="Tile Debug" ariaLabel={`${NAME} Tile Debug`} value={options.tileDebug} options={[{ value: 'false', label: 'Off' }, { value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} onChange={(value) => updateOption('tileDebug', value)} />
                        <SeedField name={NAME} value={options.seed ?? 0} onChange={(seed) => updateOption('seed', seed)} randomize={options.seed === undefined} onRandomizeChange={(random) => updateOption('seed', random ? undefined : 0)} />
                        {count('Batch Size', 'batchSize', 1)}
                        {count('Temporal Overlap', 'temporalOverlap', 0)}
                        {count('Prepend Frames', 'prependFrames', 0)}
                        {text('Upscaler Offload Device', 'upscalerOffloadDevice')}
                        {slider('Input Noise', 'inputNoiseScale', 0, 1, 0.01)}
                        {slider('Latent Noise', 'latentNoiseScale', 0, 1, 0.01)}
                        <div className="grid grid-cols-2 gap-2 text-sm text-text-secondary">
                            {([['swapIoComponents', 'Swap I/O'], ['cacheDitModel', 'Cache DiT'], ['cacheVaeModel', 'Cache VAE'], ['vaeEncodeTiled', 'Tiled Encode'], ['vaeDecodeTiled', 'Tiled Decode'], ['uniformBatchSize', 'Uniform Batch'], ['enableDebug', 'Debug']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={(event) => updateOption(key, event.target.checked)} className="accent-accent" />{label}</label>)}
                        </div>
                    </Accordion>
                </div>
                <div className="grid min-h-[420px] content-start gap-4 md:grid-cols-2">
                    {resultUrl && sourceUrl ? (
                        <div className="flex flex-col md:col-span-2">
                            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase text-text-muted"><span>Before</span><span>Drag to compare</span><span>After</span></div>
                            <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-md bg-bg-primary" style={{ aspectRatio: sourceSize ? `${sourceSize.width} / ${sourceSize.height}` : '1 / 1', maxHeight: '65vh' }}>
                                <img src={resultUrl} alt="SeedVR2 upscaled result" className="absolute inset-0 h-full w-full object-contain" />
                                <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
                                    <img src={sourceUrl} alt="SeedVR2 source before comparison" className="absolute inset-0 h-full w-full object-contain" />
                                </div>
                                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_5px_rgba(0,0,0,0.8)]" style={{ left: `${comparePosition}%` }}><div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/60 text-sm text-white">↔</div></div>
                                <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">Before</span>
                                <span className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">After</span>
                                <input type="range" min="0" max="100" value={comparePosition} onChange={(event) => setComparePosition(Number(event.target.value))} aria-label="Before and after comparison" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2"><a href={resultUrl} download={`seedvr2_${sourceFile?.name || 'upscale.png'}`} className="flex items-center justify-center gap-2 rounded-md border border-border-primary py-2 text-sm font-semibold text-text-secondary"><DownloadIcon className="h-4 w-4" />Download</a><button onClick={saveToLibrary} disabled={saveStatus !== 'idle'} className="flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-bold text-accent-text">{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div>
                        </div>
                    ) : <>
                        <div className="flex min-h-[420px] flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Original</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{sourceUrl ? <img src={sourceUrl} alt="SeedVR2 source" onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Choose an image</span>}</div></div>
                        <div className="flex min-h-[420px] flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">SeedVR2 Result</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary"><span className="text-sm text-text-muted">Result appears here</span></div></div>
                    </>}
                </div>
            </div>
            )}
        </section>
    );
};
