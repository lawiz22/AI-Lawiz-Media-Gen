import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { generateSeedVr2Upscale, type SeedVr2UpscaleOptions } from '../services/comfyUIService';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, SaveIcon, SpinnerIcon } from './icons';
import { ImageUploader } from './ImageUploader';
import { ZImageCreativeUpscalePanel } from './ZImageCreativeUpscalePanel';

interface UpscalePanelProps {
    sourceFile: File | null;
    setSourceFile: (file: File | null) => void;
    onOpenLibrary: () => void;
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
}

const DEFAULT_OPTIONS: SeedVr2UpscaleOptions = {
    ditModel: 'seedvr2_ema_7b_fp16.safetensors',
    vaeModel: 'ema_vae_fp16.safetensors',
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

const getChoices = (widget: any): string[] => Array.isArray(widget?.[0]) ? widget[0] : [];

export const UpscalePanel: React.FC<UpscalePanelProps> = ({ sourceFile, setSourceFile, onOpenLibrary, isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const [options, setOptions] = useState(DEFAULT_OPTIONS);
    const [activeUpscaler, setActiveUpscaler] = useState<'seedvr2' | 'z-image-creative'>('seedvr2');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
    const [resultUrl, setResultUrl] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [comparePosition, setComparePosition] = useState(50);

    const ditModels = useMemo(() => Array.from(new Set([
        options.ditModel,
        ...getChoices(comfyUIObjectInfo?.SeedVR2LoadDiTModel?.input?.required?.model),
    ].filter(Boolean))), [comfyUIObjectInfo, options.ditModel]);
    const vaeModels = useMemo(() => Array.from(new Set([
        options.vaeModel,
        ...getChoices(comfyUIObjectInfo?.SeedVR2LoadVAEModel?.input?.required?.model),
    ].filter(Boolean))), [comfyUIObjectInfo, options.vaeModel]);

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
        if (!sourceFile || !isComfyUIConnected || isGenerating) return;
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

    return (
        <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
                <div><h2 className="text-xl font-bold text-accent">Upscale</h2><p className="text-xs text-text-muted">Dedicated enhancement workflows</p></div>
                <button onClick={() => setAdvancedOpen((open) => !open)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${advancedOpen ? 'border-accent text-accent' : 'border-border-primary text-text-secondary'}`}>Advanced</button>
            </header>
            <div className="flex gap-1 overflow-x-auto border-b border-border-primary px-5 pt-3">
                <button onClick={() => setActiveUpscaler('seedvr2')} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${activeUpscaler === 'seedvr2' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Upscale SeedVR2</button>
                <button onClick={() => setActiveUpscaler('z-image-creative')} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${activeUpscaler === 'z-image-creative' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>Z-Image Creative Upscale</button>
            </div>

            {activeUpscaler === 'z-image-creative' ? (
                <ZImageCreativeUpscalePanel sourceFile={sourceFile} setSourceFile={setSourceFile} onOpenLibrary={onOpenLibrary} isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} advancedOpen={advancedOpen} />
            ) : <>
            {advancedOpen && <div className="grid gap-4 border-b border-border-primary bg-bg-primary/40 p-5 md:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold text-text-secondary">DiT Model<select value={options.ditModel} onChange={(event) => updateOption('ditModel', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm">{ditModels.map((model) => <option key={model}>{model}</option>)}</select></label>
                <label className="text-xs font-semibold text-text-secondary">VAE Model<select value={options.vaeModel} onChange={(event) => updateOption('vaeModel', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm">{vaeModels.map((model) => <option key={model}>{model}</option>)}</select></label>
                <label className="text-xs font-semibold text-text-secondary">Attention<select value={options.attentionMode} onChange={(event) => updateOption('attentionMode', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm"><option value="flash_attn">flash_attn</option><option value="sdpa">sdpa</option><option value="sageattn">sageattn</option></select></label>
                <label className="text-xs font-semibold text-text-secondary">DiT Device<input value={options.ditDevice} onChange={(event) => updateOption('ditDevice', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">DiT Offload Device<input value={options.ditOffloadDevice} onChange={(event) => updateOption('ditOffloadDevice', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Blocks to Swap: {options.blocksToSwap}<input type="range" min="0" max="40" value={options.blocksToSwap} onChange={(event) => updateOption('blocksToSwap', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">VAE Device<input value={options.vaeDevice} onChange={(event) => updateOption('vaeDevice', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">VAE Offload Device<input value={options.vaeOffloadDevice} onChange={(event) => updateOption('vaeOffloadDevice', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Encode Tile: {options.vaeEncodeTileSize}<input type="range" min="256" max="2048" step="128" value={options.vaeEncodeTileSize} onChange={(event) => updateOption('vaeEncodeTileSize', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">Encode Overlap: {options.vaeEncodeTileOverlap}<input type="range" min="0" max="512" step="32" value={options.vaeEncodeTileOverlap} onChange={(event) => updateOption('vaeEncodeTileOverlap', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">Decode Tile: {options.vaeDecodeTileSize}<input type="range" min="256" max="2048" step="128" value={options.vaeDecodeTileSize} onChange={(event) => updateOption('vaeDecodeTileSize', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">Decode Overlap: {options.vaeDecodeTileOverlap}<input type="range" min="0" max="512" step="32" value={options.vaeDecodeTileOverlap} onChange={(event) => updateOption('vaeDecodeTileOverlap', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">Color Correction<select value={options.colorCorrection} onChange={(event) => updateOption('colorCorrection', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm"><option value="lab">lab</option><option value="wavelet">wavelet</option><option value="none">none</option></select></label>
                <label className="text-xs font-semibold text-text-secondary">Tile Debug<select value={options.tileDebug} onChange={(event) => updateOption('tileDebug', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm"><option value="false">Off</option><option value="encode">Encode</option><option value="decode">Decode</option></select></label>
                <label className="text-xs font-semibold text-text-secondary">Seed<input type="number" value={options.seed ?? ''} placeholder="Random" onChange={(event) => updateOption('seed', event.target.value ? Number(event.target.value) : undefined)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Batch Size<input type="number" min="1" value={options.batchSize} onChange={(event) => updateOption('batchSize', Math.max(1, Number(event.target.value)))} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Temporal Overlap<input type="number" min="0" value={options.temporalOverlap} onChange={(event) => updateOption('temporalOverlap', Math.max(0, Number(event.target.value)))} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Prepend Frames<input type="number" min="0" value={options.prependFrames} onChange={(event) => updateOption('prependFrames', Math.max(0, Number(event.target.value)))} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Upscaler Offload Device<input value={options.upscalerOffloadDevice} onChange={(event) => updateOption('upscalerOffloadDevice', event.target.value)} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-sm" /></label>
                <label className="text-xs font-semibold text-text-secondary">Input Noise: {options.inputNoiseScale}<input type="range" min="0" max="1" step="0.01" value={options.inputNoiseScale} onChange={(event) => updateOption('inputNoiseScale', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <label className="text-xs font-semibold text-text-secondary">Latent Noise: {options.latentNoiseScale}<input type="range" min="0" max="1" step="0.01" value={options.latentNoiseScale} onChange={(event) => updateOption('latentNoiseScale', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
                    {([['swapIoComponents', 'Swap I/O'], ['cacheDitModel', 'Cache DiT'], ['cacheVaeModel', 'Cache VAE'], ['vaeEncodeTiled', 'Tiled Encode'], ['vaeDecodeTiled', 'Tiled Decode'], ['uniformBatchSize', 'Uniform Batch'], ['enableDebug', 'Debug']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={(event) => updateOption(key, event.target.checked)} className="accent-accent" />{label}</label>)}
                </div>
            </div>}

            <div className="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
                <div className="min-w-0 space-y-5">
                    <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><ImageUploader id="seedvr2-source" label="Source Image" onImageUpload={setSourceFile} sourceFile={sourceFile} /></div><button onClick={onOpenLibrary} title="Choose from Library" className="mb-1 shrink-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-text-secondary hover:text-accent"><LibraryIcon className="h-5 w-5" /></button></div>
                    <label className="block text-sm font-semibold text-text-secondary">Maximum output side: {options.resolution}px<input type="range" min="512" max="2180" step="2" value={options.resolution} onChange={(event) => updateOption('resolution', Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>
                    <div className="rounded-md border border-border-primary bg-bg-primary p-3 text-xs text-text-muted">{sourceSize ? `Source ${sourceSize.width}×${sourceSize.height} → target ${outputSize?.width}×${outputSize?.height}` : 'Output preserves the original aspect ratio.'}<br />SeedVR2 is capped at 2180 px on the longest side.</div>
                    <button onClick={generate} disabled={!sourceFile || !isComfyUIConnected || isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Upscaling...' : 'Upscale with SeedVR2'}</button>
                    {!isComfyUIConnected && <p className="text-xs text-danger">Connect ComfyUI to run SeedVR2.</p>}
                    {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                    {error && <p className="rounded bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                </div>
                <div className="grid min-h-[420px] gap-4 md:grid-cols-2">
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
                        <div className="flex flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Original</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{sourceUrl ? <img src={sourceUrl} alt="SeedVR2 source" onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="max-h-[65vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">Choose an image</span>}</div></div>
                        <div className="flex flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">SeedVR2 Result</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary"><span className="text-sm text-text-muted">Result appears here</span></div></div>
                    </>}
                </div>
            </div>
            </>}
        </section>
    );
};
