import React, { useState, useMemo, ChangeEvent, useEffect, useRef } from 'react';
import { GenerateIcon, ResetIcon, VideoIcon, SpinnerIcon, CopyIcon, SaveIcon, FilmIcon, DownloadIcon, StartFrameIcon, EndFrameIcon, CheckIcon } from './icons';
import { ImageUploader } from './ImageUploader';
import { Loader } from './Loader';
import type { GenerationOptions, LibraryItem } from '../types';
import { resizeImageFile } from '../utils/imageProcessing';
import { saveToLibrary } from '../services/libraryService';
import { fileToResizedDataUrl, dataUrlToThumbnail, getImageDimensionsFromFile, dataUrlToFile, createVideoPlaceholderThumbnail } from '../utils/imageUtils';

// --- Prop Types ---
interface VideoGeneratorPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  comfyUIObjectInfo: any | null;
  startFrame: File | null;
  setStartFrame: (file: File | null) => void;
  endFrame: File | null;
  setEndFrame: (file: File | null) => void;
  onGenerate: () => void;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  generatedVideo: string | null;
  lastUsedPrompt: string | null;
  progressMessage: string;
  progressValue: number;
  onReset: () => void;
  generationOptionsForSave?: GenerationOptions | null;
}

// --- Helper Functions ---
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(3, '0')}`;
};

const OptionSection: React.FC<{ title: string, children: React.ReactNode, defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-border-primary pb-4">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
                <h3 className="text-lg font-bold text-accent tracking-wider uppercase">{title}</h3>
                <span className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {isOpen && <div className="space-y-4 pt-4">{children}</div>}
        </div>
    );
};

const getModelListFromInfo = (widgetInfo: any): string[] => {
    if (Array.isArray(widgetInfo) && Array.isArray(widgetInfo[0])) {
        return widgetInfo[0] || [];
    }
    return [];
};

const SelectInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, options: {value: string, label: string}[], disabled?: boolean }> = 
({ label, value, onChange, options, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        <select value={value} onChange={onChange} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

const TextInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, placeholder?: string, disabled?: boolean, isTextArea?: boolean }> =
({ label, value, onChange, placeholder, disabled, isTextArea }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        {isTextArea ? (
            <textarea value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} rows={4} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
        ) : (
            <input type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
        )}
    </div>
);

const NumberSlider: React.FC<{ label: string, value: number, onChange: (e: ChangeEvent<HTMLInputElement>) => void, min: number, max: number, step: number, disabled?: boolean }> =
({ label, value, onChange, min, max, step, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}: {value}</label>
        <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} disabled={disabled} className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
    </div>
);

// --- Main Component ---
export const VideoGeneratorPanel: React.FC<VideoGeneratorPanelProps> = ({
    options, setOptions, comfyUIObjectInfo,
    startFrame, setStartFrame, endFrame, setEndFrame,
    onGenerate, isReady, isLoading, error, generatedVideo, lastUsedPrompt,
    progressMessage, progressValue, onReset, generationOptionsForSave
}) => {
    const [copyButtonText, setCopyButtonText] = useState('Copy');
    const [originalStartFrame, setOriginalStartFrame] = useState<File | null>(null);
    const [originalEndFrame, setOriginalEndFrame] = useState<File | null>(null);
    const [frameResizeScale, setFrameResizeScale] = useState(1.0); // 1.0 = 100%
    const [isResizing, setIsResizing] = useState(false);
    const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    // State and refs for frame extractor
    const [extractedFrame, setExtractedFrame] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [frameSavingState, setFrameSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Reset frame extractor and save states when a new video is generated
    useEffect(() => {
        setExtractedFrame(null);
        setCurrentTime(0);
        setDuration(0);
        setSavingState('idle');
    }, [generatedVideo]);

    useEffect(() => {
        setFrameSavingState('idle');
    }, [extractedFrame]);

    const comfyGgufModels = useMemo(() => {
        const widgetInfo = comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name || comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.gguf_name;
        return getModelListFromInfo(widgetInfo);
    }, [comfyUIObjectInfo]);

    const comfyGgufClipModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.CLIPLoaderGGUF?.input?.required?.clip_name), [comfyUIObjectInfo]);
    const comfyVaes = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name), [comfyUIObjectInfo]);
    const comfyClipVision = useMemo(() => {
        if (!comfyUIObjectInfo) return [];
        // More robustly check for CLIP Vision models, as custom nodes might use different names.
        const sources = [
            comfyUIObjectInfo?.CLIPVisionLoader?.input?.required?.clip_vision_name, // Standard
            comfyUIObjectInfo?.CLIPVisionLoader?.input?.required?.clip_name, // Some use this
        ];
        const modelSet = new Set<string>();
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list?.length > 0) {
                list.forEach(model => modelSet.add(model));
            }
        }
        return Array.from(modelSet);
    }, [comfyUIObjectInfo]);
    const comfyLoras = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name), [comfyUIObjectInfo]);
    const comfySamplers = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.KSamplerAdvanced?.input?.required?.sampler_name), [comfyUIObjectInfo]);
    const comfySchedulers = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.KSamplerAdvanced?.input?.required?.scheduler), [comfyUIObjectInfo]);
    
    // This effect populates the WAN 2.2 I2V workflow with sensible defaults
    // whenever it's selected, ensuring it's ready to use immediately.
    useEffect(() => {
        if (options.videoProvider === 'comfyui' && options.comfyVidModelType === 'wan-i2v' && comfyUIObjectInfo) {
            // Guard against running if no models are found, which would set incorrect fallbacks.
            if (comfyGgufModels.length === 0) return;

            setOptions(prev => ({
                ...prev,
                // --- Models ---
                comfyVidWanI2VHighNoiseModel: comfyGgufModels.find(m => m.toLowerCase().includes('highnoise')) || comfyGgufModels[0],
                comfyVidWanI2VLowNoiseModel: comfyGgufModels.find(m => m.toLowerCase().includes('lownoise')) || (comfyGgufModels.length > 1 ? comfyGgufModels[1] : comfyGgufModels[0]),
                comfyVidWanI2VClipModel: comfyGgufClipModels.find(m => m.includes('umt5')) || comfyGgufClipModels[0],
                comfyVidWanI2VVaeModel: comfyVaes.find(v => v.includes('wan_2.1')) || comfyVaes[0],
                comfyVidWanI2VClipVisionModel: comfyClipVision.find(cv => cv.includes('clip_vision_h')) || comfyClipVision[0],

                // --- Prompts (keep user's if they exist) ---
                comfyVidWanI2VPositivePrompt: prev.comfyVidWanI2VPositivePrompt || 'cinematic shot of a majestic lion walking through the savanna',
                comfyVidWanI2VNegativePrompt: prev.comfyVidWanI2VNegativePrompt || 'blurry, bad quality, low-res, ugly, deformed, disfigured, text, watermark',

                // --- Core Settings ---
                comfyVidWanI2VSteps: 6,
                comfyVidWanI2VCfg: 1,
                comfyVidWanI2VSampler: 'euler',
                comfyVidWanI2VScheduler: 'simple',
                comfyVidWanI2VFrameCount: 65,
                comfyVidWanI2VRefinerStartStep: 3,

                // --- LoRAs (Lightning enabled by default for speed) ---
                comfyVidWanI2VUseLightningLora: true,
                comfyVidWanI2VHighNoiseLora: 
                    comfyLoras.find(l => l.toLowerCase().includes('lightning') && l.toLowerCase().includes('4step') && l.toLowerCase().includes('high')) 
                    || comfyLoras.find(l => l.toLowerCase().includes('lightning') && l.toLowerCase().includes('high')) 
                    || comfyLoras[0],
                comfyVidWanI2VHighNoiseLoraStrength: 2.0,
                comfyVidWanI2VLowNoiseLora: 
                    comfyLoras.find(l => l.toLowerCase().includes('lightning') && l.toLowerCase().includes('4step') && l.toLowerCase().includes('low')) 
                    || comfyLoras.find(l => l.toLowerCase().includes('lightning') && l.toLowerCase().includes('low')) 
                    || (comfyLoras.length > 1 ? comfyLoras[1] : comfyLoras[0]),
                comfyVidWanI2VLowNoiseLoraStrength: 1.0,

                // --- Post-Processing ---
                comfyVidWanI2VUseFilmGrain: true,
                comfyVidWanI2VFilmGrainIntensity: 0.02,
                comfyVidWanI2VFilmGrainSize: 0.3,

                // --- Video Format ---
                comfyVidWanI2VFrameRate: 24,
                comfyVidWanI2VVideoFormat: 'video/nvenc_h264-mp4',
                
                // --- End Frame Logic ---
                comfyVidWanI2VUseEndFrame: !!endFrame,
                comfyVidWanI2VEndFrameStrength: 1.0,
            }));
        }
    }, [
        options.videoProvider, 
        options.comfyVidModelType, 
        comfyUIObjectInfo, 
        comfyGgufModels, 
        comfyLoras,
        comfyGgufClipModels, 
        comfyVaes, 
        comfyClipVision, 
        endFrame, 
        setOptions
    ]);

    const handleStartFrameUpload = (file: File | null) => {
        setOriginalStartFrame(file);
    };

    const handleEndFrameUpload = (file: File | null) => {
        setOriginalEndFrame(file);
    };
    
    useEffect(() => {
        const applyResize = async () => {
            if (!originalStartFrame && !originalEndFrame) return;
            
            setIsResizing(true);
            try {
                if (frameResizeScale < 1.0) {
                    if (originalStartFrame) setStartFrame(await resizeImageFile(originalStartFrame, frameResizeScale));
                    else setStartFrame(null);
                    if (originalEndFrame) setEndFrame(await resizeImageFile(originalEndFrame, frameResizeScale));
                    else setEndFrame(null);
                } else {
                    setStartFrame(originalStartFrame);
                    setEndFrame(originalEndFrame);
                }
            } catch (e) {
                console.error("Error during image resize:", e);
                setStartFrame(originalStartFrame);
                setEndFrame(originalEndFrame);
            } finally {
                setIsResizing(false);
            }
        };
        applyResize();
    }, [frameResizeScale, originalStartFrame, originalEndFrame, setStartFrame, setEndFrame]);
    
    useEffect(() => {
        const detectAndSetDimensions = (file: File) => {
            try {
                const img = new Image();
                const objectUrl = URL.createObjectURL(file);
                img.onload = () => {
                    const width = Math.round(img.naturalWidth / 8) * 8;
                    const height = Math.round(img.naturalHeight / 8) * 8;
                    setOptions(prev => ({ ...prev, comfyVidWanI2VWidth: width, comfyVidWanI2VHeight: height }));
                    URL.revokeObjectURL(objectUrl);
                };
                img.onerror = () => URL.revokeObjectURL(objectUrl);
                img.src = objectUrl;
            } catch (error) { console.error("Error detecting image dimensions:", error); }
        };

        if (startFrame) detectAndSetDimensions(startFrame);
        else setOptions(prev => ({ ...prev, comfyVidWanI2VWidth: 848, comfyVidWanI2VHeight: 560 }));
    }, [startFrame, setOptions]);

    const handleOptionChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSliderChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [field]: parseFloat(e.target.value) }));
    };

    const handleCopyPrompt = () => {
        if (!lastUsedPrompt) return;
        navigator.clipboard.writeText(lastUsedPrompt)
          .then(() => { setCopyButtonText('Copied!'); setTimeout(() => setCopyButtonText('Copy'), 2000); })
          .catch(err => console.error('Failed to copy prompt:', err));
    };

    const handleUseEndFrameChange = (e: ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setOptions(prev => ({ ...prev, comfyVidWanI2VUseEndFrame: isChecked }));
        if (!isChecked) {
            setEndFrame(null);
            setOriginalEndFrame(null);
        }
    };
    
    const handleSaveToLibrary = async () => {
        if (!generatedVideo) return;
        
        setSavingState('saving');
        try {
            const optionsToSave = { ...(generationOptionsForSave || options) };
            
            let thumbnail: string;
            if (startFrame) {
                thumbnail = await dataUrlToThumbnail(await fileToResizedDataUrl(startFrame, 256), 256);
            } else {
                // No start frame (e.g., Gemini text-to-video), create a placeholder.
                thumbnail = createVideoPlaceholderThumbnail();
            }

            if (optionsToSave.videoProvider === 'comfyui') {
                optionsToSave.width = optionsToSave.comfyVidWanI2VWidth;
                optionsToSave.height = optionsToSave.comfyVidWanI2VHeight;
            } else if (startFrame) { // Covers Gemini with input image
                const { width, height } = await getImageDimensionsFromFile(startFrame);
                optionsToSave.width = width;
                optionsToSave.height = height;
            }

            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'video',
                media: generatedVideo,
                thumbnail: thumbnail,
                options: optionsToSave,
                startFrame: startFrame ? await fileToResizedDataUrl(startFrame, 512) : undefined,
                endFrame: endFrame ? await fileToResizedDataUrl(endFrame, 512) : undefined,
            };
            await saveToLibrary(item);
            setSavingState('saved');
        } catch (err) {
            console.error("Failed to save video to library:", err);
            setSavingState('idle'); // Allow retry on error
        }
    };

    const handleExtractFrame = (time: number) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const captureFrame = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                setExtractedFrame(canvas.toDataURL('image/jpeg', 0.95));
            }
        };

        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            video.currentTime = time;
            // The 'seeked' event ensures the frame is ready to be drawn
            const onSeeked = () => {
                captureFrame();
                video.removeEventListener('seeked', onSeeked);
            };
            video.addEventListener('seeked', onSeeked);
        }
    };

    const handleDownloadFrame = () => {
        if (!extractedFrame) return;
        const link = document.createElement('a');
        link.href = extractedFrame;
        link.download = `frame_${formatTime(currentTime).replace(/:|\./g, '_')}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSetAsStartFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'start_frame.jpeg');
        setStartFrame(file);
    };

    const handleSetAsEndFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'end_frame.jpeg');
        setEndFrame(file);
    };

    const handleSaveFrameToLibrary = async () => {
        if (!extractedFrame) return;
        setFrameSavingState('saving');
        try {
            const videoName = lastUsedPrompt 
                ? `"${lastUsedPrompt.substring(0, 20)}..."` 
                : startFrame?.name || 'Generated Video';

            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'extracted-frame',
                media: extractedFrame,
                thumbnail: await dataUrlToThumbnail(extractedFrame, 256),
                name: `Frame at ${formatTime(currentTime)} from ${videoName}`,
            };
            await saveToLibrary(item);
            setFrameSavingState('saved');
        } catch (err) {
            console.error("Failed to save frame to library:", err);
            setFrameSavingState('idle'); // Allow retry on error
        }
    };
    
    const videoSavingStatus = savingState;
    const frameSavingStatus = frameSavingState;

    const renderProviderSwitch = () => (
        <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1 mb-6">
            <button 
                onClick={() => setOptions(prev => ({...prev, videoProvider: 'comfyui'}))} 
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.videoProvider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
            >
                ComfyUI
            </button>
            <button 
                onClick={() => setOptions(prev => ({...prev, videoProvider: 'gemini'}))} 
                disabled={isLoading}
                className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.videoProvider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
            >
                Gemini
            </button>
        </div>
    );

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left Column for Controls */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                        {renderProviderSwitch()}

                        {options.videoProvider === 'gemini' ? (
                            <>
                                <div className="space-y-4">
                                    <h2 className="text-xl font-bold mb-4 text-accent">1. Configure Generation</h2>
                                    <SelectInput
                                        label="Gemini Video Model"
                                        value={options.geminiVidModel || ''}
                                        onChange={handleOptionChange('geminiVidModel')}
                                        options={[{ value: 'veo-2.0-generate-001', label: 'VEO 2.0' }]}
                                        disabled={isLoading}
                                    />
                                    <TextInput
                                        label="Prompt"
                                        value={options.geminiVidPrompt || ''}
                                        onChange={handleOptionChange('geminiVidPrompt')}
                                        placeholder="e.g., A cinematic aerial shot of a futuristic city at sunset."
                                        disabled={isLoading}
                                        isTextArea
                                    />
                                </div>
                                <div className="space-y-4 mt-8">
                                    <h2 className="text-xl font-bold mb-4 text-accent">2. Upload Media (Optional)</h2>
                                    <ImageUploader
                                        label="Input Image (Optional)"
                                        id="gemini-vid-input"
                                        onImageUpload={setStartFrame}
                                        sourceFile={startFrame}
                                    />
                                    <div className="pt-2 space-y-2" title="The Gemini VEO API currently only supports a single input image. This feature is disabled.">
                                        <label className="flex items-center gap-2 text-sm font-medium text-text-muted cursor-not-allowed">
                                            <input 
                                                type="checkbox" 
                                                checked={false}
                                                onChange={() => {}} // No-op
                                                disabled={true}
                                                className="rounded text-accent focus:ring-accent"
                                            />
                                            Use End Frame
                                        </label>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Frames</h2>
                                <ImageUploader label="Start Frame" id="start-frame" onImageUpload={handleStartFrameUpload} sourceFile={startFrame} />
                                <div className="pt-2 space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                        <input type="checkbox" checked={options.comfyVidWanI2VUseEndFrame} onChange={handleUseEndFrameChange} disabled={isLoading} className="rounded text-accent focus:ring-accent" />
                                        Use End Frame
                                    </label>
                                    {options.comfyVidWanI2VUseEndFrame && (
                                        <ImageUploader label="End Frame" id="end-frame" onImageUpload={handleEndFrameUpload} sourceFile={endFrame} />
                                    )}
                                </div>
                                <div className="pt-2">
                                    <NumberSlider 
                                        label={`Frame Size (${Math.round(frameResizeScale * 100)}%)`}
                                        value={frameResizeScale}
                                        onChange={(e) => setFrameResizeScale(parseFloat(e.target.value))}
                                        min={0.25}
                                        max={1.0}
                                        step={0.25}
                                        disabled={isLoading || isResizing}
                                    />
                                    <p className="text-xs text-text-muted mt-1 flex items-center gap-2">
                                        Resize frames to reduce VRAM usage. 100% is original size.
                                        {isResizing && <SpinnerIcon className="w-4 h-4 animate-spin text-accent" />}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {options.videoProvider === 'comfyui' && (
                        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
                            <div>
                                <h2 className="text-xl font-bold mb-4 text-accent">2. Configure Generation</h2>
                                <SelectInput label="Video Workflow" value={options.comfyVidModelType || 'wan-i2v'} onChange={handleOptionChange('comfyVidModelType')} options={[{value: 'wan-i2v', label: 'Wan 2.2 First/Last Frame'}]} disabled={isLoading} />
                            </div>
                            
                            <OptionSection title="Prompts & Core Settings" defaultOpen>
                                <TextInput label="Positive Prompt" value={options.comfyVidWanI2VPositivePrompt || ''} onChange={handleOptionChange('comfyVidWanI2VPositivePrompt')} disabled={isLoading} isTextArea placeholder="A cinematic shot of..."/>
                                <TextInput label="Negative Prompt" value={options.comfyVidWanI2VNegativePrompt || ''} onChange={handleOptionChange('comfyVidWanI2VNegativePrompt')} disabled={isLoading} isTextArea />
                                {options.comfyVidWanI2VUseEndFrame && (
                                    <NumberSlider label={`End Frame Strength`} value={options.comfyVidWanI2VEndFrameStrength || 1.0} onChange={handleSliderChange('comfyVidWanI2VEndFrameStrength')} min={0} max={2.0} step={0.05} disabled={isLoading} />
                                )}
                                <NumberSlider label={`Frame Count`} value={options.comfyVidWanI2VFrameCount || 65} onChange={handleSliderChange('comfyVidWanI2VFrameCount')} min={16} max={128} step={1} disabled={isLoading} />
                                <NumberSlider label={`Frame Rate`} value={options.comfyVidWanI2VFrameRate || 24} onChange={handleSliderChange('comfyVidWanI2VFrameRate')} min={8} max={60} step={1} disabled={isLoading} />
                                <div className="text-sm text-text-secondary p-2 bg-bg-tertiary rounded-md border border-border-primary/50">
                                    <p>Video Dimensions: <span className="font-semibold text-text-primary ml-2">{options.comfyVidWanI2VWidth}px × {options.comfyVidWanI2VHeight}px</span></p>
                                    <p className="text-xs text-text-muted mt-1">Dimensions are based on your start frame and rounded for model compatibility.</p>
                                </div>
                            </OptionSection>
                            
                            <OptionSection title="Models & LoRAs">
                                <SelectInput label="High-Noise Unet" value={options.comfyVidWanI2VHighNoiseModel || ''} onChange={handleOptionChange('comfyVidWanI2VHighNoiseModel')} options={comfyGgufModels.map(m => ({value: m, label: m}))} disabled={isLoading} />
                                <SelectInput label="Low-Noise Unet" value={options.comfyVidWanI2VLowNoiseModel || ''} onChange={handleOptionChange('comfyVidWanI2VLowNoiseModel')} options={comfyGgufModels.map(m => ({value: m, label: m}))} disabled={isLoading} />
                                <SelectInput label="CLIP Model (GGUF)" value={options.comfyVidWanI2VClipModel || ''} onChange={handleOptionChange('comfyVidWanI2VClipModel')} options={comfyGgufClipModels.map(m => ({value: m, label: m}))} disabled={isLoading} />
                                <SelectInput label="VAE Model" value={options.comfyVidWanI2VVaeModel || ''} onChange={handleOptionChange('comfyVidWanI2VVaeModel')} options={comfyVaes.map(m => ({value: m, label: m}))} disabled={isLoading} />
                                <SelectInput label="CLIP Vision Model" value={options.comfyVidWanI2VClipVisionModel || ''} onChange={handleOptionChange('comfyVidWanI2VClipVisionModel')} options={comfyClipVision.map(m => ({value: m, label: m}))} disabled={isLoading} />
                                
                                <div className="space-y-4 p-4 mt-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                                    <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                        <input type="checkbox" checked={options.comfyVidWanI2VUseLightningLora} onChange={handleOptionChange('comfyVidWanI2VUseLightningLora')} disabled={isLoading} className="rounded text-accent focus:ring-accent" />
                                        Use Lightning LoRA
                                    </label>
                                    {options.comfyVidWanI2VUseLightningLora && (
                                        <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                                            <SelectInput label="High-Noise LoRA" value={options.comfyVidWanI2VHighNoiseLora || ''} onChange={handleOptionChange('comfyVidWanI2VHighNoiseLora')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isLoading} />
                                            <NumberSlider label={`High-Noise Strength`} value={options.comfyVidWanI2VHighNoiseLoraStrength || 2.0} onChange={handleSliderChange('comfyVidWanI2VHighNoiseLoraStrength')} min={0} max={3} step={0.1} disabled={isLoading} />
                                            <SelectInput label="Low-Noise LoRA" value={options.comfyVidWanI2VLowNoiseLora || ''} onChange={handleOptionChange('comfyVidWanI2VLowNoiseLora')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isLoading} />
                                            <NumberSlider label={`Low-Noise Strength`} value={options.comfyVidWanI2VLowNoiseLoraStrength || 1.0} onChange={handleSliderChange('comfyVidWanI2VLowNoiseLoraStrength')} min={0} max={3} step={0.1} disabled={isLoading} />
                                        </div>
                                    )}
                                </div>
                            </OptionSection>

                            <OptionSection title="Sampler">
                                <SelectInput label="Sampler" value={options.comfyVidWanI2VSampler || 'euler'} onChange={handleOptionChange('comfyVidWanI2VSampler')} options={comfySamplers.map(s => ({value: s, label: s}))} disabled={isLoading} />
                                <SelectInput label="Scheduler" value={options.comfyVidWanI2VScheduler || 'simple'} onChange={handleOptionChange('comfyVidWanI2VScheduler')} options={comfySchedulers.map(s => ({value: s, label: s}))} disabled={isLoading} />
                                <NumberSlider label={`Steps`} value={options.comfyVidWanI2VSteps || 6} onChange={handleSliderChange('comfyVidWanI2VSteps')} min={4} max={20} step={1} disabled={isLoading} />
                                <NumberSlider label={`CFG`} value={options.comfyVidWanI2VCfg || 1} onChange={handleSliderChange('comfyVidWanI2VCfg')} min={1} max={5} step={0.1} disabled={isLoading} />
                                <NumberSlider label={`Refiner Start Step`} value={options.comfyVidWanI2VRefinerStartStep || 3} onChange={handleSliderChange('comfyVidWanI2VRefinerStartStep')} min={1} max={(options.comfyVidWanI2VSteps || 6) - 1} step={1} disabled={isLoading} />
                            </OptionSection>
                            
                            <OptionSection title="Post-Processing">
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                    <input type="checkbox" checked={options.comfyVidWanI2VUseFilmGrain} onChange={handleOptionChange('comfyVidWanI2VUseFilmGrain')} disabled={isLoading} className="rounded text-accent focus:ring-accent" />
                                    Add Film Grain
                                </label>
                                {options.comfyVidWanI2VUseFilmGrain && (
                                    <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                                        <NumberSlider label={`Intensity`} value={options.comfyVidWanI2VFilmGrainIntensity || 0.02} onChange={handleSliderChange('comfyVidWanI2VFilmGrainIntensity')} min={0} max={0.2} step={0.01} disabled={isLoading} />
                                        <NumberSlider label={`Saturation Mix`} value={options.comfyVidWanI2VFilmGrainSize || 0.3} onChange={handleSliderChange('comfyVidWanI2VFilmGrainSize')} min={0.1} max={1} step={0.05} disabled={isLoading} />
                                    </div>
                                )}
                            </OptionSection>
                        </div>
                    )}

                    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                        <h3 className="text-lg font-bold text-accent tracking-wider uppercase border-b-2 border-accent/30 pb-2">Actions</h3>
                        <div className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={onReset} disabled={isLoading} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <ResetIcon className="w-5 h-5"/> Reset
                                </button>
                                <button onClick={onGenerate} disabled={!isReady} style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                                    <GenerateIcon className="w-5 h-5"/> Generate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column for results */}
                <div className="lg:col-span-2 sticky top-24">
                    { !isLoading && error ? (
                        <div className="bg-danger-bg text-danger p-4 rounded-lg text-center">
                            <h3 className="font-bold mb-2">Generation Failed</h3>
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : generatedVideo ? (
                        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-6">
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                    <h2 className="text-xl font-bold text-accent">Generated Video</h2>
                                    <button
                                        onClick={handleSaveToLibrary}
                                        title={videoSavingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                        disabled={videoSavingStatus !== 'idle'}
                                        className={`flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg transition-all duration-200 ${
                                            videoSavingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' :
                                            videoSavingStatus === 'saving' ? 'bg-bg-tertiary text-text-secondary cursor-wait' :
                                            'bg-bg-tertiary text-text-secondary hover:bg-accent hover:text-accent-text'
                                        }`}
                                    >
                                        {videoSavingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : videoSavingStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                        {videoSavingStatus === 'saving' ? 'Saving...' : videoSavingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                    </button>
                                </div>
                                {lastUsedPrompt && (
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-text-secondary mb-1">Final Prompt Used</label>
                                        <div className="relative">
                                            <textarea readOnly value={lastUsedPrompt} className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-xs text-text-secondary focus:ring-accent focus:border-accent" rows={2}/>
                                            <button onClick={handleCopyPrompt} title="Copy Prompt" className="absolute top-2 right-2 flex items-center gap-1.5 bg-bg-primary/80 text-text-secondary text-xs font-semibold py-1 px-2 rounded-full hover:bg-accent hover:text-accent-text transition-colors">
                                                <CopyIcon className="w-3 h-3" /> {copyButtonText}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <video 
                                    ref={videoRef}
                                    src={generatedVideo} 
                                    controls 
                                    autoPlay 
                                    loop 
                                    className="w-full rounded-lg bg-black"
                                    onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                />
                            </div>
                            
                            {/* Frame Extractor UI */}
                            <div className="space-y-4 pt-6 border-t border-border-primary">
                                <div className="flex items-center gap-3">
                                    <FilmIcon className="w-6 h-6 text-accent"/>
                                    <h3 className="text-lg font-bold text-accent">Frame Extractor</h3>
                                </div>
                                <div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={duration || 0}
                                        step="0.01"
                                        value={currentTime}
                                        onChange={(e) => {
                                            if (videoRef.current) {
                                                videoRef.current.currentTime = parseFloat(e.target.value);
                                            }
                                        }}
                                        className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="text-center text-sm font-mono text-text-secondary mt-2">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleExtractFrame(currentTime)}
                                        className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                                    >
                                        Save Current Frame
                                    </button>
                                    <button
                                        onClick={() => handleExtractFrame(duration)}
                                        className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                                    >
                                        Save Last Frame
                                    </button>
                                </div>
                                {extractedFrame && (
                                    <div className="text-center p-4 bg-bg-primary/50 rounded-lg space-y-4">
                                        <h3 className="text-lg font-semibold text-text-primary">Frame Preview</h3>
                                        <img src={extractedFrame} alt="Extracted Frame" className="max-w-full mx-auto rounded-md shadow-lg" />
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            <button onClick={handleDownloadFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                                <DownloadIcon className="w-5 h-5"/> Download
                                            </button>
                                            <button onClick={handleSetAsStartFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                                <StartFrameIcon className="w-5 h-5"/> Set as Start
                                            </button>
                                            <button onClick={handleSetAsEndFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                                <EndFrameIcon className="w-5 h-5"/> Set as End
                                            </button>
                                            <button
                                                onClick={handleSaveFrameToLibrary}
                                                disabled={frameSavingState !== 'idle'}
                                                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors ${
                                                    frameSavingState === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                    frameSavingState === 'saving' ? 'bg-bg-tertiary cursor-wait' :
                                                    'bg-bg-tertiary hover:bg-accent hover:text-accent-text'
                                                }`}
                                            >
                                                {frameSavingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : frameSavingState === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                                {frameSavingState === 'saved' ? 'Saved!' : 'Save to Library'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg h-full min-h-[500px]">
                            <VideoIcon className="w-16 h-16 text-border-primary mb-4" />
                            <h3 className="text-lg font-bold text-text-primary">Your generated video will appear here</h3>
                            <p className="text-text-secondary max-w-xs">Configure your options and click "Generate".</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Canvas for frame extraction (hidden) */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </>
    );
};