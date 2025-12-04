
import React, { useState, useEffect, useMemo, ChangeEvent, useRef } from 'react';
// Fix: Import `NunchakuAttention` type to be used for casting.
import type { GenerationOptions, NunchakuAttention, ImageStyle } from '../types';
import {
    BACKGROUND_OPTIONS,
    ASPECT_RATIO_OPTIONS,
    PHOTO_STYLE_OPTIONS,
    IMAGE_STYLE_OPTIONS,
    ERA_STYLE_OPTIONS,
    PRESET_POSES,
    MAX_IMAGES,
} from '../constants';
import { generateBackgroundImagePreview, generateClothingPreview, generateMaskForImage, getGeminiModels } from '../services/geminiService';
import { generateRandomClothingPrompt, generateRandomBackgroundPrompt, generateRandomPosePrompts, getRandomTextObjectPrompt } from '../utils/promptBuilder';
import { saveToLibrary } from '../services/libraryService';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon, WorkflowIcon, CloseIcon, WarningIcon, LibraryIcon, SaveIcon, CheckIcon } from './icons';
import { ImageUploader } from './ImageUploader';
import { dataUrlToFile, fileToDataUrl, dataUrlToThumbnail, fileToResizedDataUrl } from '../utils/imageUtils';
import { SelectInput, TextInput, NumberSlider, CheckboxSlider } from './InputComponents';

// --- Prop Types ---
interface OptionsPanelProps {
    options: GenerationOptions;
    setOptions: (options: GenerationOptions) => void;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    generationMode: 't2i' | 'i2i';
    setGenerationMode: (mode: 't2i' | 'i2i') => void;
    previewedBackgroundImage: string | null;
    setPreviewedBackgroundImage: (url: string | null) => void;
    previewedClothingImage: string | null;
    setPreviewedClothingImage: (url: string | null) => void;
    onGenerate: () => void;
    onReset: () => void;
    onGeneratePrompt: () => void;
    onExportWorkflow: () => void;
    onOpenPosePicker?: () => void;
    isDisabled: boolean;
    isReady: boolean;
    isGeneratingPrompt: boolean;
    comfyUIObjectInfo: any | null;
    comfyUIUrl: string;
    sourceImage: File | null;
    hideProviderSwitch?: boolean;
    hideGeminiModeSwitch?: boolean;
    hideGenerationModeSwitch?: boolean;
    title?: string;
    activeTab: string;
    maskImage: File | null;
    setMaskImage: (file: File | null) => void;
    elementImages: File[];
    setElementImages: (files: File[]) => void;
    onOpenMaskPicker: () => void;
    onOpenElementPicker: () => void;
    // New optional props for Character Generator
    clothingImage?: File | null;
    setClothingImage?: (file: File | null) => void;
    backgroundImage?: File | null;
    setBackgroundImage?: (file: File | null) => void;
    onOpenClothingLibrary?: () => void;
    onOpenBackgroundLibrary?: () => void;
    hideGeneralSettings?: boolean;
}

// Helper function to safely extract model lists from ComfyUI's object_info
const getModelListFromInfo = (widgetInfo: any): string[] => {
    if (Array.isArray(widgetInfo) && Array.isArray(widgetInfo[0])) {
        return widgetInfo[0] || [];
    }
    return [];
};

// --- Helper Components ---
const OptionSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-4">
        <h3 className="text-lg font-bold text-accent tracking-wider uppercase border-b-2 border-accent/30 pb-2">{title}</h3>
        <div className="space-y-4 pt-2">{children}</div>
    </div>
);



const ElementImageManager: React.FC<{
    elementImages: File[];
    setElementImages: (files: File[]) => void;
    disabled: boolean;
    onOpenElementPicker: () => void;
}> = ({ elementImages, setElementImages, disabled, onOpenElementPicker }) => {
    const handleAddImages = (files: File[]) => {
        if (files.length > 0) {
            setElementImages([...elementImages, ...files].slice(0, 5));
        }
    };

    const handleRemoveImage = (index: number) => {
        setElementImages(elementImages.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            {elementImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {elementImages.map((file, index) => (
                        <div key={index} className="relative group">
                            <img src={URL.createObjectURL(file)} alt={`Element ${index + 1}`} className="w-full aspect-square object-cover rounded-lg" />
                            <button
                                onClick={() => handleRemoveImage(index)}
                                className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                disabled={disabled}
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2">
                <div className="flex-grow">
                    <ImageUploader
                        id="element-image-uploader"
                        onImageUpload={() => { }}
                        onImagesUpload={handleAddImages}
                        multiple
                        disabled={disabled || elementImages.length >= 5}
                        label="Add Element Image(s)"
                        infoText={elementImages.length >= 5 ? "Max 5 elements" : "PNG, JPG, WEBP"}
                    />
                </div>
                <button
                    onClick={onOpenElementPicker}
                    disabled={disabled || elementImages.length >= 5}
                    className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                    title="Select from Library"
                >
                    <LibraryIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};


// --- Main Component ---
export const OptionsPanel: React.FC<OptionsPanelProps> = ({
    options, setOptions, updateOptions,
    generationMode, setGenerationMode,
    previewedBackgroundImage, setPreviewedBackgroundImage,
    previewedClothingImage, setPreviewedClothingImage,
    onGenerate, onReset, onGeneratePrompt, onExportWorkflow, onOpenPosePicker,
    isDisabled, isReady, isGeneratingPrompt,
    comfyUIObjectInfo, comfyUIUrl, sourceImage,
    hideProviderSwitch = false, hideGeminiModeSwitch = false, hideGenerationModeSwitch = false,
    title = "Configure Options",
    activeTab,
    maskImage, setMaskImage,
    elementImages, setElementImages,
    onOpenMaskPicker, onOpenElementPicker,
    clothingImage, setClothingImage,
    backgroundImage, setBackgroundImage,
    onOpenClothingLibrary, onOpenBackgroundLibrary,
    hideGeneralSettings = false,
}) => {
    const [isPreviewingBg, setIsPreviewingBg] = useState(false);
    const [bgPreviewError, setBgPreviewError] = useState<string | null>(null);
    const [isPreviewingClothing, setIsPreviewingClothing] = useState(false);
    const [clothingPreviewError, setClothingPreviewError] = useState<string | null>(null);
    const [isGeneratingMask, setIsGeneratingMask] = useState<boolean>(false);
    const [maskGenError, setMaskGenError] = useState<string | null>(null);
    const [maskSavingState, setMaskSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

    // Models that we want to ensure are always present
    const DEFAULT_MODELS = useMemo(() => [
        'gemini-2.5-flash-image',
        'gemini-3-pro-image-preview',
        'gemini-3.0-pro-preview',
        'imagen-4.0-generate-001',
        'imagen-3.0-generate-001',
        'veo-2.0-generate-preview-01'
    ], []);

    // Initialize with default models to prevent empty dropdowns
    const [geminiModels, setGeminiModels] = useState<string[]>(DEFAULT_MODELS);
    const [loadingModels, setLoadingModels] = useState(false);

    useEffect(() => {
        const fetchModels = async () => {
            if (options.provider === 'gemini') {
                setLoadingModels(true);
                try {
                    const apiModels = await getGeminiModels();
                    // Merge defaults with API results and deduplicate
                    if (apiModels.length > 0) {
                        const allModels = Array.from(new Set([...DEFAULT_MODELS, ...apiModels])).sort();
                        setGeminiModels(allModels);
                    }
                } catch (error) {
                    console.warn("Failed to fetch remote Gemini models, keeping defaults.", error);
                } finally {
                    setLoadingModels(false);
                }
            }
        };
        fetchModels();
    }, [options.provider, DEFAULT_MODELS]);

    useEffect(() => {
        setMaskSavingState('idle');
    }, [maskImage]);

    // --- Memoized Model Lists from ComfyUI Object Info ---
    const comfyModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name), [comfyUIObjectInfo]);

    const comfySamplers = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.KSampler?.input?.required?.sampler_name);
        return list.length ? list : getModelListFromInfo(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    }, [comfyUIObjectInfo]);

    const comfySchedulers = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.KSampler?.input?.required?.scheduler);
        return list.length ? list : getModelListFromInfo(comfyUIObjectInfo?.BasicScheduler?.input?.required?.scheduler);
    }, [comfyUIObjectInfo]);

    const comfyLoras = useMemo(() => {
        const sources = [
            comfyUIObjectInfo?.LoraLoader?.input?.required?.lora_name,
            comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name,
            comfyUIObjectInfo?.NunchakuFluxLoraLoader?.input?.required?.lora_name,
            comfyUIObjectInfo?.["Power Lora Loader (rgthree)"]?.input?.required?.lora_name
        ];
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) return list;
        }
        return [];
    }, [comfyUIObjectInfo]);

    const comfyVaes = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name), [comfyUIObjectInfo]);

    const comfyClips = useMemo(() => {
        const sources = [
            comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name,
            comfyUIObjectInfo?.DualCLIPLoader?.input?.required?.clip_name1,
            comfyUIObjectInfo?.NunchakuTextEncoderLoader?.input?.required?.text_encoder1,
            comfyUIObjectInfo?.DualCLIPLoaderGGUF?.input?.required?.clip_l_name
        ];
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) return list;
        }
        return [];
    }, [comfyUIObjectInfo]);

    const t5GgufEncoderModels = useMemo(() => {
        const sources = [
            comfyUIObjectInfo?.DualCLIPLoaderGGUF?.input?.required?.clip_name,
            comfyUIObjectInfo?.CLIPLoaderGGUF?.input?.required?.clip_name,
        ];
        const modelSet = new Set<string>();
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) {
                list.forEach(model => modelSet.add(model));
            }
        }
        return Array.from(modelSet);
    }, [comfyUIObjectInfo]);

    const t5SafetensorEncoderModels = useMemo(() => {
        const sources = [
            comfyUIObjectInfo?.DualCLIPLoader?.input?.required?.clip_name2,
            comfyUIObjectInfo?.NunchakuTextEncoderLoader?.input?.required?.text_encoder2,
        ];
        const modelSet = new Set<string>();
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) {
                list.forEach(model => modelSet.add(model));
            }
        }
        return Array.from(modelSet);
    }, [comfyUIObjectInfo]);

    const comfyUpscaleModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.UpscaleModelLoader?.input?.required?.model_name), [comfyUIObjectInfo]);

    const comfyGgufModels = useMemo(() => {
        const sources = [
            comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name,
            comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.gguf_name,
            comfyUIObjectInfo?.CLIPLoaderGGUF?.input?.required?.clip_name,
        ];
        const modelSet = new Set<string>();
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) {
                list.forEach(model => modelSet.add(model));
            }
        }
        return Array.from(modelSet);
        return Array.from(modelSet);
    }, [comfyUIObjectInfo]);

    const comfyUnets = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name), [comfyUIObjectInfo]);

    const nunchakuModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.NunchakuFluxDiTLoader?.input?.required?.model_path), [comfyUIObjectInfo]);

    const nunchakuAttentions = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.NunchakuFluxDiTLoader?.input?.required?.attention);
        return list.length > 0 ? list : ['nunchaku-fp16', 'flash-attention2'];
    }, [comfyUIObjectInfo]);

    const comfyBboxModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.UltralyticsDetectorProvider?.input?.required?.model_name), [comfyUIObjectInfo]);
    const comfySamModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.SAMLoader?.input?.required?.model_name), [comfyUIObjectInfo]);

    const prevComfyModelType = useRef<GenerationOptions['comfyModelType']>();

    useEffect(() => {
        if (options.provider === 'comfyui' && options.comfyModelType !== prevComfyModelType.current) {
            // ... (Logic for ComfyUI defaults)
            // Assuming no changes needed here as per instructions
        }
        prevComfyModelType.current = options.comfyModelType;
    }, [options.provider, options.comfyModelType, updateOptions, comfyModels, comfyLoras, comfyVaes, comfyClips, comfyGgufModels, t5GgufEncoderModels, t5SafetensorEncoderModels, comfySamplers, comfySchedulers, nunchakuModels, nunchakuAttentions, comfyUpscaleModels, comfyBboxModels, comfySamModels]);


    useEffect(() => {
        let newOptions = { ...options };
        let optionsChanged = false;

        if (newOptions.provider === 'comfyui') {
            const isI2IModel = ['nunchaku-kontext-flux', 'face-detailer-sd1.5'].includes(newOptions.comfyModelType!);
            if (generationMode === 'i2i' && !isI2IModel) {
                optionsChanged = true;
                newOptions.comfyModelType = 'nunchaku-kontext-flux';
            } else if (generationMode === 't2i' && isI2IModel) {
                optionsChanged = true;
                newOptions.comfyModelType = 'sdxl';
            }
        } else if (newOptions.provider === 'gemini') {
            if (newOptions.geminiMode !== generationMode) {
                optionsChanged = true;
                newOptions.geminiMode = generationMode;
            }
        }

        if (optionsChanged) {
            updateOptions({ comfyModelType: newOptions.comfyModelType, geminiMode: newOptions.geminiMode });
        }
    }, [options.provider, generationMode, updateOptions]);


    const handleGenerationModeChange = (mode: 't2i' | 'i2i') => {
        setGenerationMode(mode);
    };

    const handleOptionChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        if (field === 'imageStyle') {
            if (options.provider === 'gemini') {
                const newStyle = value as ImageStyle;
                updateOptions({
                    imageStyle: newStyle,
                    creativity: newStyle === 'photorealistic' ? undefined : (options.creativity ?? 0.7)
                });
                return;
            }
        }

        if (field === 'geminiT2IModel') {
            const newModel = value as string;
            updateOptions({
                geminiT2IModel: newModel,
            });
            return;
        }

        const getStylePrefix = (opts: GenerationOptions) => {
            if (opts.imageStyle === 'photorealistic') {
                return `${opts.photoStyle}, ${opts.eraStyle}, `;
            } else if (opts.imageStyle) {
                return `${opts.imageStyle}, `;
            }
            return '';
        };

        if (options.provider === 'comfyui' && ['imageStyle', 'photoStyle', 'eraStyle'].includes(field)) {
            const oldPrefix = getStylePrefix(options);
            const tempOptions = { ...options, [field]: value as string };
            const newPrefix = getStylePrefix(tempOptions);

            let currentPrompt = options.comfyPrompt || '';

            if (oldPrefix && currentPrompt.startsWith(oldPrefix)) {
                currentPrompt = currentPrompt.substring(oldPrefix.length);
            }

            const newPrompt = `${newPrefix}${currentPrompt}`;

            updateOptions({ [field]: value, comfyPrompt: newPrompt });
            return;
        }

        if (field === 'comfyModelType') {
            updateOptions({ comfyModelType: value as GenerationOptions['comfyModelType'] });
        } else {
            updateOptions({ [field]: value });
        }
    };

    const handleSliderChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(e.target.value) });
    };

    const handlePoseSelection = (poseValue: string) => {
        const { poseSelection } = options;
        const isSelected = poseSelection.includes(poseValue);
        let newSelectedPoses;
        if (isSelected) {
            newSelectedPoses = poseSelection.filter(p => p !== poseValue);
        } else {
            newSelectedPoses = [...poseSelection, poseValue];
        }
        updateOptions({ poseSelection: newSelectedPoses });
    };

    const handleCustomPoseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const poses = e.target.value
            .split('\n')
            .map(p => p.trim())
            .filter(Boolean)
            .slice(0, 13); // Max 13 poses
        updateOptions({ poseSelection: poses });
    };

    const handleRandomizeCustomPoses = () => {
        const randomPoses = generateRandomPosePrompts(options.numImages);
        updateOptions({ poseSelection: randomPoses });
    };

    const handleGenerateBgPreview = async () => {
        if (!options.customBackground) {
            setBgPreviewError("Prompt cannot be empty.");
            return;
        }
        setIsPreviewingBg(true);
        setBgPreviewError(null);
        setPreviewedBackgroundImage(null);
        try {
            const previewUrl = await generateBackgroundImagePreview(options.customBackground, options.aspectRatio);
            setPreviewedBackgroundImage(previewUrl);
        } catch (err: any) {
            setBgPreviewError(err.message || "Failed to generate preview.");
        } finally {
            setIsPreviewingBg(false);
        }
    };

    const handleGenerateClothingPreview = async () => {
        if (!options.customClothingPrompt) {
            setClothingPreviewError("Prompt cannot be empty.");
            return;
        }
        setIsPreviewingClothing(true);
        setClothingPreviewError(null);
        setPreviewedClothingImage(null);
        try {
            const previewUrl = await generateClothingPreview(options.customClothingPrompt, options.aspectRatio);
            setPreviewedClothingImage(previewUrl);
        } catch (err: any) {
            setClothingPreviewError(err.message || "Failed to generate preview.");
        } finally {
            setIsPreviewingClothing(false);
        }
    };

    const handleRandomizeClothing = () => {
        updateOptions({ customClothingPrompt: generateRandomClothingPrompt() });
    };

    const handleRandomizeBackground = () => {
        updateOptions({ customBackground: generateRandomBackgroundPrompt() });
    };

    const handleGenerateMask = async (subject: 'person' | 'clothing') => {
        if (!sourceImage) return;
        setIsGeneratingMask(true);
        setMaskGenError(null);
        setMaskImage(null);
        try {
            const maskDataUrl = await generateMaskForImage(sourceImage, subject);
            const maskFile = await dataUrlToFile(maskDataUrl, `mask_${subject}.png`);
            setMaskImage(maskFile);
        } catch (err: any) {
            setMaskGenError(err.message || `Failed to generate ${subject} mask.`);
        } finally {
            setIsGeneratingMask(false);
        }
    };

    const handleSaveMask = async () => {
        if (!maskImage) return;
        setMaskSavingState('saving');
        try {
            const media = await fileToDataUrl(maskImage);
            const thumbnail = await dataUrlToThumbnail(media, 256);
            const name = `Mask from "${sourceImage?.name || 'source image'}"`;
            await saveToLibrary({
                mediaType: 'image',
                name,
                media,
                thumbnail,
                sourceImage: sourceImage ? await fileToResizedDataUrl(sourceImage, 512) : undefined,
            });
            setMaskSavingState('saved');
        } catch (err) {
            console.error("Failed to save mask to library:", err);
            setMaskSavingState('idle');
        }
    };

    // --- Render Methods for different providers ---

    const renderGeminiOptions = () => (
        <>
            {generationMode === 't2i' ? (
                <OptionSection title="Prompt Options">
                    {/* ... T2I Options ... */}
                    <div>
                        <label className="block text-sm font-medium text-text-secondary">Generation Model</label>
                        {/* We show the input always now, but with a spinner if loading */}
                        <div className="relative">
                            <input
                                list="gemini-models-list"
                                type="text"
                                value={options.geminiT2IModel || 'gemini-2.5-flash-image'}
                                onChange={handleOptionChange('geminiT2IModel')}
                                placeholder="Select or type model name"
                                disabled={isDisabled}
                                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent pr-8"
                            />
                            {loadingModels && <div className="absolute right-2 top-1/2 transform -translate-y-1/2"><SpinnerIcon className="w-4 h-4 animate-spin text-text-muted" /></div>}
                        </div>
                        <datalist id="gemini-models-list">
                            {geminiModels.map(m => <option key={m} value={m} />)}
                        </datalist>
                        <p className="text-xs text-text-muted mt-1">Type a custom model name if not listed.</p>
                    </div>
                    <TextInput
                        label="Prompt"
                        value={options.geminiPrompt || ''}
                        onChange={handleOptionChange('geminiPrompt')}
                        placeholder="e.g., A photorealistic image of an astronaut riding a horse on Mars"
                        disabled={isDisabled}
                        isTextArea
                    />
                </OptionSection>
            ) : ( // --- I2I Mode ---
                <>
                    {activeTab === 'image-generator' ? (
                        // --- IMAGE GENERATOR I2I ---
                        <>
                            <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-3 gap-1">
                                {(['general', 'inpaint', 'compose'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => updateOptions({ geminiI2iMode: mode })}
                                        disabled={isDisabled}
                                        className={`px-2 py-2 text-xs font-bold rounded-full transition-colors capitalize ${options.geminiI2iMode === mode ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                                    >
                                        {mode === 'inpaint' ? 'Inpaint/Outpaint' : mode}
                                    </button>
                                ))}
                            </div>
                            {options.geminiI2iMode === 'general' && (
                                <OptionSection title="General Edit">
                                    <TextInput
                                        label="Edit Instruction"
                                        isTextArea
                                        rows={5}
                                        value={options.geminiGeneralEditPrompt || ''}
                                        onChange={handleOptionChange('geminiGeneralEditPrompt')}
                                        placeholder="Describe the change you want to make to the image..."
                                        disabled={isDisabled}
                                    />
                                    <p className="text-xs text-text-muted">Example: "Turn the person into a fantasy elf. Make the background a magical forest."</p>
                                </OptionSection>
                            )}
                            {options.geminiI2iMode === 'inpaint' && (
                                <OptionSection title="Inpainting / Outpainting">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-grow">
                                            <ImageUploader id="mask-image" label="Upload Mask" onImageUpload={setMaskImage} sourceFile={maskImage} disabled={isDisabled} infoText="White: edit, Black: protect." />
                                        </div>
                                        <button onClick={onOpenMaskPicker} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select Mask from Library">
                                            <LibraryIcon className="w-6 h-6" />
                                        </button>
                                    </div>
                                    <div className="text-center text-sm text-text-secondary my-2">OR</div>
                                    <div className="space-y-2">
                                        <button onClick={() => handleGenerateMask('person')} disabled={!sourceImage || isDisabled || isGeneratingMask} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50">
                                            {isGeneratingMask && <SpinnerIcon className="w-5 h-5 animate-spin" />} Generate Subject Mask
                                        </button>
                                        <button onClick={() => handleGenerateMask('clothing')} disabled={!sourceImage || isDisabled || isGeneratingMask} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50">
                                            {isGeneratingMask && <SpinnerIcon className="w-5 h-5 animate-spin" />} Generate Clothing Mask
                                        </button>
                                        {isGeneratingMask && <p className="text-xs text-accent text-center">AI is generating mask...</p>}
                                        {maskGenError && <p className="text-xs text-danger text-center mt-1">{maskGenError}</p>}
                                    </div>
                                    {maskImage && (
                                        <div className="mt-2 space-y-2 p-3 bg-bg-primary/50 rounded-lg">
                                            <h4 className="text-sm font-semibold text-text-secondary">Active Mask</h4>
                                            <div className="relative">
                                                <img src={URL.createObjectURL(maskImage)} alt="Active Mask" className="w-full rounded-md" />
                                                <button onClick={() => setMaskImage(null)} title="Remove Mask" className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors">
                                                    <CloseIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <button onClick={handleSaveMask} disabled={maskSavingState !== 'idle' || isDisabled} className={`w-full flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg transition-all duration-200 disabled:opacity-50 ${maskSavingState === 'saved' ? 'bg-green-500 text-white cursor-default' : maskSavingState === 'saving' ? 'bg-bg-tertiary text-text-secondary cursor-wait' : 'bg-bg-tertiary text-text-secondary hover:bg-accent hover:text-accent-text'}`}>
                                                {maskSavingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : maskSavingState === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                {maskSavingState === 'saving' ? 'Saving...' : maskSavingState === 'saved' ? 'Saved!' : 'Save Mask to Library'}
                                            </button>
                                        </div>
                                    )}
                                    <SelectInput label="Task" value={options.geminiInpaintTask || 'remove'} onChange={handleOptionChange('geminiInpaintTask')} options={[{ value: 'remove', label: 'Remove Area' }, { value: 'replace', label: 'Replace with...' }, { value: 'changeColor', label: 'Change Color to...' }, { value: 'custom', label: 'Custom Prompt' }]} disabled={isDisabled} />
                                    {(options.geminiInpaintTask === 'replace' || options.geminiInpaintTask === 'changeColor') && (<TextInput label={options.geminiInpaintTask === 'replace' ? "Replacement Object (Prompt)" : "New Color (Prompt)"} value={options.geminiInpaintTargetPrompt || ''} onChange={handleOptionChange('geminiInpaintTargetPrompt')} placeholder={options.geminiInpaintTask === 'replace' ? "e.g., a blue sports car" : "e.g., bright red"} disabled={isDisabled} />)}
                                    {options.geminiInpaintTask === 'custom' && (<TextInput label="Custom Inpainting Prompt" value={options.geminiInpaintCustomPrompt || ''} onChange={handleOptionChange('geminiInpaintCustomPrompt')} placeholder="e.g., add a futuristic city in the background" disabled={isDisabled} isTextArea />)}
                                </OptionSection>
                            )}
                            {options.geminiI2iMode === 'compose' && (
                                <OptionSection title="Image Composition">
                                    <ElementImageManager elementImages={elementImages} setElementImages={setElementImages} disabled={isDisabled} onOpenElementPicker={onOpenElementPicker} />
                                    <TextInput label="Composition Instructions" value={options.geminiComposePrompt || ''} onChange={handleOptionChange('geminiComposePrompt')} placeholder="Describe how to combine the images. The source image is the background..." disabled={isDisabled} isTextArea />
                                </OptionSection>
                            )}
                        </>
                    ) : (
                        // --- CHARACTER GENERATOR I2I ---
                        <>
                            <OptionSection title="Pose & Composition">
                                <SelectInput label="Pose Mode" value={options.poseMode} onChange={handleOptionChange('poseMode')} options={[{ value: 'random', label: 'Random Preset Poses' }, { value: 'select', label: 'Select Preset Poses' }, { value: 'prompt', label: 'Custom Pose Prompts' }, { value: 'library', label: 'From Library' }]} disabled={isDisabled} />
                                {options.poseMode === 'select' && (<div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md"><p className="text-xs text-text-muted">Select up to {options.numImages} poses.</p>{PRESET_POSES.map(pose => (<label key={pose.value} className="flex items-center gap-2 p-2 bg-bg-tertiary rounded-md hover:bg-bg-tertiary-hover cursor-pointer"><input type="checkbox" checked={options.poseSelection.includes(pose.value)} onChange={() => handlePoseSelection(pose.value)} disabled={isDisabled || (!options.poseSelection.includes(pose.value) && options.poseSelection.length >= options.numImages)} className="rounded text-accent focus:ring-accent" /><span className="text-sm">{pose.label}</span></label>))}</div>)}
                                {options.poseMode === 'prompt' && (<div><textarea value={options.poseSelection.join('\n')} onChange={handleCustomPoseChange} placeholder="Enter one pose prompt per line..." disabled={isDisabled} rows={4} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent" /><button onClick={handleRandomizeCustomPoses} disabled={isDisabled} className="mt-2 flex items-center gap-1.5 text-xs bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-1 px-2 rounded-lg transition-colors"><RefreshIcon className="w-4 h-4" /> Randomize</button></div>)}
                                {options.poseMode === 'library' && onOpenPosePicker && (<div className="space-y-4 p-3 bg-bg-primary/50 rounded-lg border border-border-primary"><button onClick={onOpenPosePicker} disabled={isDisabled} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"><LibraryIcon className="w-5 h-5" />Select Poses ({options.poseLibraryItems?.length || 0}/{options.numImages} selected)</button>{options.poseLibraryItems && options.poseLibraryItems.length > 0 && (<div className="grid grid-cols-4 gap-2">{options.poseLibraryItems.map(item => (<div key={item.id} className="relative aspect-square"><img src={item.thumbnail} alt={item.name} title={item.name} className="w-full h-full object-cover rounded-md" /></div>))}</div>)}<SelectInput label="Use Pose As" value={options.geminiPoseSource || 'mannequin'} onChange={handleOptionChange('geminiPoseSource')} options={[{ value: 'mannequin', label: 'Mannequin Image' }, { value: 'json', label: 'JSON Data' }]} disabled={isDisabled} /></div>)}
                            </OptionSection>

                            <OptionSection title="Background">
                                <SelectInput label="Background Source" value={options.background} onChange={handleOptionChange('background')} options={BACKGROUND_OPTIONS} disabled={isDisabled} />

                                {/* ADDED: Image Upload UI for Background */}
                                {options.background === 'image' && setBackgroundImage && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex-grow">
                                            <ImageUploader
                                                label="Background Image"
                                                id="char-bg-upload"
                                                onImageUpload={setBackgroundImage}
                                                sourceFile={backgroundImage}
                                                disabled={isDisabled}
                                            />
                                        </div>
                                        {onOpenBackgroundLibrary && (
                                            <button onClick={onOpenBackgroundLibrary} disabled={isDisabled} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select from Library">
                                                <LibraryIcon className="w-6 h-6" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {(options.background === 'prompt' || options.background === 'random') && (<div className="relative"><TextInput label="Custom Background Prompt" value={options.customBackground || ''} onChange={handleOptionChange('customBackground')} placeholder="e.g., a futuristic neon-lit city" disabled={isDisabled} /><button onClick={handleRandomizeBackground} disabled={isDisabled} className="absolute top-0 right-0 p-1 rounded-full text-text-secondary hover:bg-bg-primary" title="Randomize Prompt"><RefreshIcon className="w-4 h-4" /></button></div>)}
                                {options.background === 'prompt' && (<div><label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer"><input type="checkbox" checked={options.consistentBackground} onChange={handleOptionChange('consistentBackground')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />Use a Consistent Background</label><p className="text-xs text-text-muted mt-1">Generate one background and apply it to all images. Slower first image, but faster subsequent images.</p>{options.consistentBackground && (<div className="mt-2"><button onClick={handleGenerateBgPreview} disabled={isPreviewingBg || !options.customBackground} className="flex w-full items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">{isPreviewingBg ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}{isPreviewingBg ? 'Generating...' : (previewedBackgroundImage ? 'Regenerate Preview' : 'Generate Preview')}</button>{bgPreviewError && <p className="text-xs text-danger mt-1">{bgPreviewError}</p>}{previewedBackgroundImage && (<div className="relative mt-2"><img src={previewedBackgroundImage} alt="Background Preview" className="w-full h-auto rounded-md" /><button onClick={() => setPreviewedBackgroundImage(null)} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/80" title="Clear Preview"><CloseIcon className="w-4 h-4" /></button></div>)}</div>)}</div>)}
                            </OptionSection>

                            <OptionSection title="Clothing">
                                <SelectInput label="Clothing Source" value={options.clothing} onChange={handleOptionChange('clothing')} options={[{ value: 'original', label: 'Original from Image' }, { value: 'image', label: 'From Reference Image' }, { value: 'prompt', label: 'From Custom Prompt' }, { value: 'random', label: 'Random from Prompt' }]} disabled={isDisabled} />

                                {/* ADDED: Image Upload UI for Clothing */}
                                {options.clothing === 'image' && setClothingImage && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className="flex-grow">
                                            <ImageUploader
                                                label="Clothing Reference Image"
                                                id="char-clothing-upload"
                                                onImageUpload={setClothingImage}
                                                sourceFile={clothingImage}
                                                disabled={isDisabled}
                                            />
                                        </div>
                                        {onOpenClothingLibrary && (
                                            <button onClick={onOpenClothingLibrary} disabled={isDisabled} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select from Library">
                                                <LibraryIcon className="w-6 h-6" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {(options.clothing === 'prompt' || options.clothing === 'random') && (<><div className="relative"><TextInput label="Custom Clothing Prompt" value={options.customClothingPrompt || ''} onChange={handleOptionChange('customClothingPrompt')} placeholder="e.g., a stylish leather jacket" disabled={isDisabled} /><button onClick={handleRandomizeClothing} disabled={isDisabled} className="absolute top-0 right-0 p-1 rounded-full text-text-secondary hover:bg-bg-primary" title="Randomize Prompt"><RefreshIcon className="w-4 h-4" /></button></div><SelectInput label="Style Consistency" value={options.clothingStyleConsistency || 'varied'} onChange={handleOptionChange('clothingStyleConsistency')} options={[{ value: 'varied', label: 'Varied Interpretations' }, { value: 'strict', label: 'Strictly Identical' }]} disabled={isDisabled} /><div className="mt-2"><button onClick={handleGenerateClothingPreview} disabled={isPreviewingClothing || !options.customClothingPrompt} className="flex w-full items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">{isPreviewingClothing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}{isPreviewingClothing ? 'Generating...' : (previewedClothingImage ? 'Regenerate Preview' : 'Generate Preview')}</button>{clothingPreviewError && <p className="text-xs text-danger mt-1">{clothingPreviewError}</p>}{previewedClothingImage && (<div className="relative mt-2"><img src={previewedClothingImage} alt="Clothing Preview" className="w-full h-auto rounded-md" /><button onClick={() => setPreviewedClothingImage(null)} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/80" title="Clear Preview"><CloseIcon className="w-4 h-4" /></button></div>)}</div></>)}
                            </OptionSection>

                            <OptionSection title="Style">
                                <SelectInput label="Image Style" value={options.imageStyle} onChange={handleOptionChange('imageStyle')} options={IMAGE_STYLE_OPTIONS} disabled={isDisabled} />
                                {options.imageStyle === 'photorealistic' ? (
                                    <>
                                        <SelectInput label="Photo Style" value={options.photoStyle} onChange={handleOptionChange('photoStyle')} options={PHOTO_STYLE_OPTIONS} disabled={isDisabled} />
                                        <SelectInput label="Era / Medium" value={options.eraStyle} onChange={handleOptionChange('eraStyle')} options={ERA_STYLE_OPTIONS} disabled={isDisabled} />
                                    </>
                                ) : (
                                    <NumberSlider
                                        label={`Creativity: ${options.creativity ?? 0.7}`}
                                        value={options.creativity ?? 0.7}
                                        onChange={handleSliderChange('creativity')}
                                        min={0}
                                        max={1}
                                        step={0.1}
                                        disabled={isDisabled}
                                    />
                                )}
                            </OptionSection>
                        </>
                    )}
                </>
            )}
        </>
    );

    const renderComfyUIOptions = () => {
        const modelType = options.comfyModelType || 'sdxl';





        return (
            <>
                {sourceImage && comfyUIUrl &&
                    <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary/50 text-center">
                        <button onClick={onGeneratePrompt} disabled={isGeneratingPrompt} className="w-full flex items-center justify-center gap-2 text-sm bg-bg-primary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                            {isGeneratingPrompt ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isGeneratingPrompt ? 'Generating...' : 'Generate Prompt from Source'}
                        </button>
                    </div>
                }

                <OptionSection title="Model & Prompt">


                    <div className="space-y-2">
                        <SelectInput label="Image Style" value={options.imageStyle} onChange={handleOptionChange('imageStyle')} options={IMAGE_STYLE_OPTIONS} disabled={isDisabled} />
                        {options.imageStyle === 'photorealistic' && (
                            <>
                                <SelectInput label="Photo Style" value={options.photoStyle} onChange={handleOptionChange('photoStyle')} options={PHOTO_STYLE_OPTIONS} disabled={isDisabled} />
                                <SelectInput label="Era / Medium" value={options.eraStyle} onChange={handleOptionChange('eraStyle')} options={ERA_STYLE_OPTIONS} disabled={isDisabled} />
                            </>
                        )}

                        {modelType === 'flux' && (
                            <div className="pt-2 border-t border-border-primary/50 space-y-2">
                                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Flux Models</h4>
                                <SelectInput
                                    label="CLIP 1 (T5)"
                                    value={options.comfyFluxClip1 || ''}
                                    onChange={handleOptionChange('comfyFluxClip1')}
                                    options={comfyClips.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="CLIP 2 (CLIP L)"
                                    value={options.comfyFluxClip2 || ''}
                                    onChange={handleOptionChange('comfyFluxClip2')}
                                    options={comfyClips.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="VAE"
                                    value={options.comfyFluxVae || ''}
                                    onChange={handleOptionChange('comfyFluxVae')}
                                    options={comfyVaes.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                            </div>
                        )}

                        {modelType === 'qwen-t2i-gguf' && (
                            <div className="pt-2 border-t border-border-primary/50 space-y-2">
                                <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Qwen Models</h4>
                                <SelectInput
                                    label="Unet (GGUF)"
                                    value={options.comfyQwenUnet || ''}
                                    onChange={handleOptionChange('comfyQwenUnet')}
                                    options={comfyGgufModels.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="CLIP"
                                    value={options.comfyQwenClip || ''}
                                    onChange={handleOptionChange('comfyQwenClip')}
                                    options={comfyClips.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="VAE"
                                    value={options.comfyQwenVae || ''}
                                    onChange={handleOptionChange('comfyQwenVae')}
                                    options={comfyVaes.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <NumberSlider
                                    label={`Model Sampling AuraFlow (Shift): ${options.comfyQwenShift || 2.5}`}
                                    value={options.comfyQwenShift || 2.5}
                                    onChange={handleSliderChange('comfyQwenShift')}
                                    min={0.0}
                                    max={10.0}
                                    step={0.1}
                                    disabled={isDisabled}
                                />
                            </div>
                        )}
                    </div>

                    {/* Z-Image Models */}
                    {modelType === 'z-image' && (
                        <div className="mt-4 p-4 bg-bg-tertiary rounded-lg border border-border-secondary">
                            <h3 className="text-sm font-medium text-text-primary mb-3">Z-Image Models</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <SelectInput
                                    label="Unet Model (Safetensors)"
                                    value={options.comfyZImageUnet || ''}
                                    onChange={handleOptionChange('comfyZImageUnet')}
                                    options={comfyUnets.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="CLIP Model (GGUF)"
                                    value={options.comfyZImageClip || ''}
                                    onChange={handleOptionChange('comfyZImageClip')}
                                    options={t5GgufEncoderModels.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <SelectInput
                                    label="VAE Model"
                                    value={options.comfyZImageVae || ''}
                                    onChange={handleOptionChange('comfyZImageVae')}
                                    options={comfyVaes.map(m => ({ value: m, label: m }))}
                                    disabled={isDisabled}
                                />
                                <CheckboxSlider
                                    label="Enable Model Sampling AuraFlow (Shift)"
                                    isChecked={options.comfyZImageUseShift ?? true}
                                    onCheckboxChange={handleOptionChange('comfyZImageUseShift')}
                                    sliderLabel="Shift Value"
                                    sliderValue={options.comfyZImageShift || 3.0}
                                    onSliderChange={handleSliderChange('comfyZImageShift')}
                                    min={0.0}
                                    max={10.0}
                                    step={0.1}
                                    disabled={isDisabled}
                                />
                            </div>
                        </div>
                    )}

                    <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea />
                    {modelType !== 'nunchaku-kontext-flux' && modelType !== 'nunchaku-flux-image' && modelType !== 'flux-krea' && (
                        <TextInput label="Negative Prompt" value={options.comfyNegativePrompt || ''} onChange={handleOptionChange('comfyNegativePrompt')} disabled={isDisabled} isTextArea />
                    )}
                </OptionSection>



                {modelType === 'wan2.2' && (
                    <>
                        <OptionSection title="Core Sampler Settings">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <NumberSlider label={`Steps: ${options.comfySteps || 6}`} value={options.comfySteps || 6} onChange={handleSliderChange('comfySteps')} min={4} max={12} step={1} disabled={isDisabled} />
                                <NumberSlider label={`CFG: ${options.comfyCfg || 1.0}`} value={options.comfyCfg || 1.0} onChange={handleSliderChange('comfyCfg')} min={1.0} max={3.0} step={0.1} disabled={isDisabled} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                            </div>
                            <NumberSlider label={`Refiner Start Step: ${options.comfyWanRefinerStartStep || 3}`} value={options.comfyWanRefinerStartStep || 3} onChange={handleSliderChange('comfyWanRefinerStartStep')} min={1} max={(options.comfySteps || 6) - 1} step={1} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="Models">
                            <SelectInput label="High-Noise Unet" value={options.comfyWanHighNoiseModel || ''} onChange={handleOptionChange('comfyWanHighNoiseModel')} options={comfyGgufModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="Low-Noise Unet" value={options.comfyWanLowNoiseModel || ''} onChange={handleOptionChange('comfyWanLowNoiseModel')} options={comfyGgufModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="CLIP Model" value={options.comfyWanClipModel || ''} onChange={handleOptionChange('comfyWanClipModel')} options={[...t5GgufEncoderModels, ...t5SafetensorEncoderModels].map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="VAE Model" value={options.comfyWanVaeModel || ''} onChange={handleOptionChange('comfyWanVaeModel')} options={comfyVaes.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="LoRAs">
                            <CheckboxSlider label="Use FusionX LoRA" isChecked={!!options.comfyWanUseFusionXLora} onCheckboxChange={handleOptionChange('comfyWanUseFusionXLora')} sliderValue={options.comfyWanFusionXLoraStrength || 0} onSliderChange={handleSliderChange('comfyWanFusionXLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Use Lightning LoRA" isChecked={!!options.comfyWanUseLightningLora} onCheckboxChange={handleOptionChange('comfyWanUseLightningLora')} sliderValue={options.comfyWanLightningLoraStrength || 0} onSliderChange={handleSliderChange('comfyWanLightningLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Use Stock Photo LoRA" isChecked={!!options.comfyWanUseStockPhotoLora} onCheckboxChange={handleOptionChange('comfyWanUseStockPhotoLora')} sliderValue={options.comfyWanStockPhotoLoraStrength || 0} onSliderChange={handleSliderChange('comfyWanStockPhotoLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                        </OptionSection>
                    </>
                )}

                {(modelType === 'nunchaku-kontext-flux' || modelType === 'nunchaku-flux-image') && (
                    <>
                        <OptionSection title="Sampler Settings">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <NumberSlider label={`Steps: ${options.comfySteps || 10}`} value={options.comfySteps || 10} onChange={handleSliderChange('comfySteps')} min={1} max={20} step={1} disabled={isDisabled} />
                                {modelType === 'nunchaku-kontext-flux' && <NumberSlider label={`CFG: ${options.comfyCfg || 1}`} value={options.comfyCfg || 1} onChange={handleSliderChange('comfyCfg')} min={1} max={5} step={0.1} disabled={isDisabled} />}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                            </div>
                        </OptionSection>
                        <OptionSection title="Advanced Settings">
                            <NumberSlider label={`FLUX Guidance: ${options.comfyFluxGuidanceKontext || 2.5}`} value={options.comfyFluxGuidanceKontext || 2.5} onChange={handleSliderChange('comfyFluxGuidanceKontext')} min={0} max={10} step={0.1} disabled={isDisabled} />
                            {modelType === 'nunchaku-flux-image' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <NumberSlider label={`Base Shift: ${options.comfyNunchakuBaseShift || 1.0}`} value={options.comfyNunchakuBaseShift || 1.0} onChange={handleSliderChange('comfyNunchakuBaseShift')} min={0.5} max={1.5} step={0.05} disabled={isDisabled} />
                                    <NumberSlider label={`Max Shift: ${options.comfyNunchakuMaxShift || 1.15}`} value={options.comfyNunchakuMaxShift || 1.15} onChange={handleSliderChange('comfyNunchakuMaxShift')} min={1.0} max={2.0} step={0.05} disabled={isDisabled} />
                                </div>
                            )}
                            <NumberSlider label={`Cache Threshold: ${options.comfyNunchakuCacheThreshold || 0}`} value={options.comfyNunchakuCacheThreshold || 0} onChange={handleSliderChange('comfyNunchakuCacheThreshold')} min={0} max={1} step={0.01} disabled={isDisabled} />
                            <SelectInput label="CPU Offload" value={options.comfyNunchakuCpuOffload || 'enable'} onChange={handleOptionChange('comfyNunchakuCpuOffload')} options={[{ value: 'enable', label: 'Enable' }, { value: 'disable', label: 'Disable' }, { value: 'auto', label: 'Auto' }]} disabled={isDisabled} />
                            <SelectInput label="Attention Type" value={options.comfyNunchakuAttention || 'nunchaku-fp16'} onChange={e => updateOptions({ comfyNunchakuAttention: e.target.value as NunchakuAttention })} options={nunchakuAttentions.map(a => ({ value: a, label: a }))} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="Models">
                            <SelectInput label="DiT Model" value={options.comfyNunchakuModel || ''} onChange={handleOptionChange('comfyNunchakuModel')} options={nunchakuModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="VAE Model" value={options.comfyNunchakuVae || ''} onChange={handleOptionChange('comfyNunchakuVae')} options={comfyVaes.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="CLIP L Model" value={options.comfyNunchakuClipL || ''} onChange={handleOptionChange('comfyNunchakuClipL')} options={comfyClips.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="T5 XXL Model" value={options.comfyNunchakuT5XXL || ''} onChange={handleOptionChange('comfyNunchakuT5XXL')} options={t5SafetensorEncoderModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="LoRAs">
                            <CheckboxSlider label="Use Turbo LoRA" isChecked={!!options.comfyNunchakuUseTurboLora} onCheckboxChange={handleOptionChange('comfyNunchakuUseTurboLora')} sliderValue={options.comfyNunchakuTurboLoraStrength || 0} onSliderChange={handleSliderChange('comfyNunchakuTurboLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Use Nudify LoRA" isChecked={!!options.comfyNunchakuUseNudifyLora} onCheckboxChange={handleOptionChange('comfyNunchakuUseNudifyLora')} sliderValue={options.comfyNunchakuNudifyLoraStrength || 0} onSliderChange={handleSliderChange('comfyNunchakuNudifyLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Use Detail LoRA" isChecked={!!options.comfyNunchakuUseDetailLora} onCheckboxChange={handleOptionChange('comfyNunchakuUseDetailLora')} sliderValue={options.comfyNunchakuDetailLoraStrength || 0} onSliderChange={handleSliderChange('comfyNunchakuDetailLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                        </OptionSection>
                    </>
                )}

                {modelType === 'flux-krea' && (
                    <>
                        <OptionSection title="Sampler Settings">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <NumberSlider label={`Steps: ${options.comfySteps || 20}`} value={options.comfySteps || 20} onChange={handleSliderChange('comfySteps')} min={10} max={40} step={1} disabled={isDisabled} />
                                <NumberSlider label={`FLUX Guidance: ${options.comfyFluxGuidance || 3.5}`} value={options.comfyFluxGuidance || 3.5} onChange={handleSliderChange('comfyFluxGuidance')} min={0} max={10} step={0.1} disabled={isDisabled} />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                            </div>
                        </OptionSection>
                        <OptionSection title="Models">
                            <SelectInput label="Unet GGUF" value={options.comfyFluxKreaModel || ''} onChange={handleOptionChange('comfyFluxKreaModel')} options={comfyGgufModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="CLIP T5 GGUF" value={options.comfyFluxKreaClipT5 || ''} onChange={handleOptionChange('comfyFluxKreaClipT5')} options={t5GgufEncoderModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="CLIP L" value={options.comfyFluxKreaClipL || ''} onChange={handleOptionChange('comfyFluxKreaClipL')} options={comfyClips.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="VAE" value={options.comfyFluxKreaVae || ''} onChange={handleOptionChange('comfyFluxKreaVae')} options={comfyVaes.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="LoRAs">
                            <CheckboxSlider label="Woman LoRA" isChecked={!!options.useP1x4r0maWomanLora} onCheckboxChange={handleOptionChange('useP1x4r0maWomanLora')} sliderValue={options.p1x4r0maWomanLoraStrength || 0} onSliderChange={handleSliderChange('p1x4r0maWomanLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Nipple Diffusion LoRA" isChecked={!!options.useNippleDiffusionLora} onCheckboxChange={handleOptionChange('useNippleDiffusionLora')} sliderValue={options.nippleDiffusionLoraStrength || 0} onSliderChange={handleSliderChange('nippleDiffusionLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                            <CheckboxSlider label="Pussy Diffusion LoRA" isChecked={!!options.usePussyDiffusionLora} onCheckboxChange={handleOptionChange('usePussyDiffusionLora')} sliderValue={options.pussyDiffusionLoraStrength || 0} onSliderChange={handleSliderChange('pussyDiffusionLoraStrength')} min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                        </OptionSection>
                        <OptionSection title="Upscaler">
                            <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer"><input type="checkbox" checked={!!options.comfyFluxKreaUseUpscaler} onChange={handleOptionChange('comfyFluxKreaUseUpscaler')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />Enable Upscaler</label>
                            {options.comfyFluxKreaUseUpscaler && (
                                <div className="space-y-4 pt-2">
                                    <SelectInput label="Upscale Model" value={options.comfyFluxKreaUpscaleModel || ''} onChange={handleOptionChange('comfyFluxKreaUpscaleModel')} options={comfyUpscaleModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                                    <NumberSlider label={`Upscaler Steps: ${options.comfyFluxKreaUpscalerSteps || 10}`} value={options.comfyFluxKreaUpscalerSteps || 10} onChange={handleSliderChange('comfyFluxKreaUpscalerSteps')} min={5} max={20} step={1} disabled={isDisabled} />
                                    <NumberSlider label={`Upscaler Denoise: ${options.comfyFluxKreaDenoise || 0.8}`} value={options.comfyFluxKreaDenoise || 0.8} onChange={handleSliderChange('comfyFluxKreaDenoise')} min={0} max={1} step={0.05} disabled={isDisabled} />
                                </div>
                            )}
                        </OptionSection>
                    </>
                )}

                {modelType === 'face-detailer-sd1.5' && (
                    <>
                        <OptionSection title="Face Detailer Models">
                            <SelectInput label="BBOX Model" value={options.comfyDetailerBboxModel || ''} onChange={handleOptionChange('comfyDetailerBboxModel')} options={comfyBboxModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                            <SelectInput label="SAM Model" value={options.comfyDetailerSamModel || ''} onChange={handleOptionChange('comfyDetailerSamModel')} options={comfySamModels.map(m => ({ value: m, label: m }))} disabled={isDisabled} />
                        </OptionSection>
                        <OptionSection title="Face Detailer Settings">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map(s => ({ value: s, label: s }))} disabled={isDisabled} />
                            </div>
                            <NumberSlider label={`Steps: ${options.comfyDetailerSteps || 20}`} value={options.comfyDetailerSteps || 20} onChange={handleSliderChange('comfyDetailerSteps')} min={10} max={40} step={1} disabled={isDisabled} />
                            <NumberSlider label={`CFG: ${options.comfyDetailerCfg || 8}`} value={options.comfyDetailerCfg || 8} onChange={handleSliderChange('comfyDetailerCfg')} min={1} max={15} step={0.5} disabled={isDisabled} />
                            <NumberSlider label={`Denoise: ${options.comfyDetailerDenoise || 0.5}`} value={options.comfyDetailerDenoise || 0.5} onChange={handleSliderChange('comfyDetailerDenoise')} min={0.1} max={1.0} step={0.05} disabled={isDisabled} />
                            <NumberSlider label={`BBOX Threshold: ${options.comfyDetailerBboxThreshold || 0.7}`} value={options.comfyDetailerBboxThreshold || 0.7} onChange={handleSliderChange('comfyDetailerBboxThreshold')} min={0.1} max={1.0} step={0.01} disabled={isDisabled} />
                            <NumberSlider label={`BBOX Dilation: ${options.comfyDetailerBboxDilation || 0}`} value={options.comfyDetailerBboxDilation || 0} onChange={handleSliderChange('comfyDetailerBboxDilation')} min={0} max={100} step={1} disabled={isDisabled} />
                            <NumberSlider label={`BBOX Crop Factor: ${options.comfyDetailerBboxCropFactor || 3.0}`} value={options.comfyDetailerBboxCropFactor || 3.0} onChange={handleSliderChange('comfyDetailerBboxCropFactor')} min={1.0} max={5.0} step={0.1} disabled={isDisabled} />
                            <NumberSlider label={`Feathering: ${options.comfyDetailerFeather || 5}`} value={options.comfyDetailerFeather || 5} onChange={handleSliderChange('comfyDetailerFeather')} min={0} max={50} step={1} disabled={isDisabled} />
                        </OptionSection>
                    </>
                )}


            </>
        );
    };

    const activeModelName = options.provider === 'gemini'
        ? (generationMode === 't2i' ? (options.geminiT2IModel || 'gemini-2.5-flash-image') : 'gemini-2.5-flash-image')
        : (options.comfyModelType || 'sdxl');

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-bold">{title}</h2>
                <div className="flex items-center gap-2">
                    {!hideGenerationModeSwitch && !hideGeneralSettings && <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1 text-sm">
                        <button onClick={() => handleGenerationModeChange('t2i')} disabled={isDisabled} className={`px-3 py-1 rounded-full font-semibold transition-colors ${generationMode === 't2i' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}>T2I</button>
                        <button onClick={() => handleGenerationModeChange('i2i')} disabled={isDisabled} className={`px-3 py-1 rounded-full font-semibold transition-colors ${generationMode === 'i2i' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}>I2I</button>
                    </div>}
                </div>
            </div>

            <div className="space-y-6">
                {!hideGeneralSettings && (
                    <OptionSection title="General Settings">
                        {!hideProviderSwitch && <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1"><button onClick={() => updateOptions({ provider: 'comfyui' })} disabled={isDisabled} className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>ComfyUI</button><button onClick={() => updateOptions({ provider: 'gemini' })} disabled={isDisabled} className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>Gemini</button></div>}
                        <NumberSlider label={`Number of Images: ${options.numImages}`} value={options.numImages} onChange={(e) => updateOptions({ numImages: parseInt(e.target.value, 10), poseSelection: options.poseSelection.slice(0, parseInt(e.target.value, 10)) })} min={1} max={MAX_IMAGES} step={1} disabled={isDisabled} />
                        {!(options.provider === 'comfyui' && options.comfyModelType === 'qwen-t2i-gguf') && (
                            <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                        )}
                    </OptionSection>
                )}

                {options.provider === 'gemini' ? renderGeminiOptions() : renderComfyUIOptions()}
            </div>

        </div>
    );
};
