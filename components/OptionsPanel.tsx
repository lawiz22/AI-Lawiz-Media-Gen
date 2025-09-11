// Fix: Implemented the full OptionsPanel component, which was missing.
// This resolves the module resolution error and provides the necessary UI
// for configuring image generation for both Gemini and ComfyUI providers.
import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import type { GenerationOptions } from '../types';
import {
  BACKGROUND_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  PHOTO_STYLE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  ERA_STYLE_OPTIONS,
  PRESET_POSES,
} from '../constants';
import { generateBackgroundImagePreview, generateClothingPreview } from '../services/geminiService';
import { generateRandomClothingPrompt, generateRandomBackgroundPrompt, generateRandomPosePrompts, getRandomTextObjectPrompt } from '../utils/promptBuilder';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon, WorkflowIcon, CloseIcon, WarningIcon } from './icons';

// --- Prop Types ---
interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  previewedBackgroundImage: string | null;
  setPreviewedBackgroundImage: (url: string | null) => void;
  previewedClothingImage: string | null;
  setPreviewedClothingImage: (url: string | null) => void;
  onGenerate: () => void;
  onReset: () => void;
  onGeneratePrompt: () => void;
  onExportWorkflow: () => void;
  isDisabled: boolean;
  isReady: boolean;
  isGeneratingPrompt: boolean;
  comfyUIObjectInfo: any | null;
  comfyUIUrl: string;
  sourceImage: File | null;
}

// Helper function to safely extract model lists from ComfyUI's object_info
const getModelListFromInfo = (widgetInfo: any): string[] => {
    // The model list is expected to be in widgetInfo[0]
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

const SelectInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, options: {value: string, label: string}[], disabled?: boolean }> = 
({ label, value, onChange, options, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        <select value={value} onChange={onChange} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

const TextInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, placeholder?: string, disabled?: boolean, isTextArea?: boolean, tooltip?: string }> =
({ label, value, onChange, placeholder, disabled, isTextArea, tooltip }) => (
    <div className="relative">
        <label className="block text-sm font-medium text-text-secondary" title={tooltip}>{label}</label>
        {isTextArea ? (
            <textarea value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} rows={3} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
        ) : (
            <input type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
        )}
    </div>
);

const CheckboxSlider: React.FC<{
    label: string;
    isChecked: boolean;
    onCheckboxChange: (e: ChangeEvent<HTMLInputElement>) => void;
    sliderValue: number;
    onSliderChange: (e: ChangeEvent<HTMLInputElement>) => void;
    min: number; max: number; step: number;
    disabled?: boolean;
    sliderLabel?: string;
}> = ({ label, isChecked, onCheckboxChange, sliderValue, onSliderChange, min, max, step, disabled, sliderLabel }) => (
    <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
            <input type="checkbox" checked={isChecked} onChange={onCheckboxChange} disabled={disabled} className="rounded text-accent focus:ring-accent" />
            {label} {isChecked && sliderLabel && `(${sliderValue})`}
        </label>
        {isChecked && (
             <>
                {sliderLabel && <label className="block text-xs font-medium text-text-muted mt-2">{sliderLabel}: {sliderValue}</label>}
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={sliderValue}
                    onChange={onSliderChange}
                    disabled={disabled}
                    className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                />
            </>
        )}
    </div>
);


// --- Main Component ---
export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options, setOptions,
  previewedBackgroundImage, setPreviewedBackgroundImage,
  previewedClothingImage, setPreviewedClothingImage,
  onGenerate, onReset, onGeneratePrompt, onExportWorkflow,
  isDisabled, isReady, isGeneratingPrompt,
  comfyUIObjectInfo, comfyUIUrl, sourceImage,
}) => {
    const [isPreviewingBg, setIsPreviewingBg] = useState(false);
    const [bgPreviewError, setBgPreviewError] = useState<string | null>(null);
    const [isPreviewingClothing, setIsPreviewingClothing] = useState(false);
    const [clothingPreviewError, setClothingPreviewError] = useState<string | null>(null);
    const [selectedPoses, setSelectedPoses] = useState<string[]>(options.poseSelection);

    useEffect(() => {
        setOptions(prev => ({ ...prev, poseSelection: selectedPoses }));
    }, [selectedPoses, setOptions]);
    
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
    
    // For Flux Krea: GGUF-based T5 Encoders
    const t5GgufEncoderModels = useMemo(() => {
        const sources = [
            // Primary source for Flux Krea workflow
            comfyUIObjectInfo?.DualCLIPLoaderGGUF?.input?.required?.clip_name,
            // Alternative source if user has a different GGUF loader
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

    // For Nunchaku Workflows: Safetensor-based T5 Encoders
    const t5SafetensorEncoderModels = useMemo(() => {
        const sources = [
            // Source for older Nunchaku workflow
            comfyUIObjectInfo?.DualCLIPLoader?.input?.required?.clip_name2,
            // Source for newer Nunchaku workflow
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

    // GGUF model lists
    const comfyGgufModels = useMemo(() => {
        const widgetInfo = comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name || comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.gguf_name;
        return getModelListFromInfo(widgetInfo);
    }, [comfyUIObjectInfo]);

    // Nunchaku specific model lists
    const nunchakuModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.NunchakuFluxDiTLoader?.input?.required?.model_path), [comfyUIObjectInfo]);
    
    const nunchakuAttentions = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.NunchakuFluxDiTLoader?.input?.required?.attention);
        return list.length > 0 ? list : ['nunchaku-fp16', 'flash-attention2'];
    }, [comfyUIObjectInfo]);

    const handleOptionChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        const getStylePrefix = (opts: GenerationOptions) => {
            if (opts.imageStyle === 'photorealistic') {
                return `${opts.photoStyle}, ${opts.eraStyle}, `;
            }
            if (opts.imageStyle && opts.imageStyle !== 'photorealistic') {
                return `${opts.imageStyle}, `;
            }
            return '';
        };

        if (options.provider === 'comfyui' && ['imageStyle', 'photoStyle', 'eraStyle'].includes(field)) {
            setOptions(prev => {
                const oldPrefix = getStylePrefix(prev);
                const tempOptions = { ...prev, [field]: value as string };
                const newPrefix = getStylePrefix(tempOptions);
                
                let currentPrompt = prev.comfyPrompt || '';
                
                if (oldPrefix && currentPrompt.startsWith(oldPrefix)) {
                    currentPrompt = currentPrompt.substring(oldPrefix.length);
                }
                
                const newPrompt = `${newPrefix}${currentPrompt}`;
                
                return { ...prev, [field]: value, comfyPrompt: newPrompt };
            });
            return;
        }
        
        if (field === 'comfyModelType') {
            const newModelType = value as 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea';
            if (newModelType === 'sd1.5') {
                 const sd15Model = comfyModels.find((m: string) => m.toLowerCase().includes('1.5') || m.toLowerCase().includes('15') || m.toLowerCase().includes('realisticvision')) || (comfyModels.length > 0 ? comfyModels[0] : '');
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'sd1.5',
                    comfyModel: sd15Model,
                    comfySteps: 20,
                    comfyCfg: 7,
                    comfySampler: 'euler',
                    comfyScheduler: 'normal',
                }));
            } else if (newModelType === 'flux') {
                const specificFluxModel = comfyModels.find((m: string) => m === 'flux1-dev-fp8.safetensors');
                const genericFluxModel = comfyModels.find((m: string) => m.toLowerCase().includes('flux'));
                
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'flux',
                    comfyModel: specificFluxModel || genericFluxModel || 'flux1-dev-fp8.safetensors',
                    comfySteps: 20,
                    comfyCfg: 1,
                }));
            } else if (newModelType === 'wan2.2') {
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'wan2.2',
                    comfySteps: 6,
                    comfyCfg: 1,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                }));
            } else if (newModelType === 'nunchaku-kontext-flux') {
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'nunchaku-kontext-flux',
                    comfySteps: 10,
                    comfyCfg: 1,
                    comfySampler: 'euler',
                    comfyScheduler: 'simple',
                    comfyNegativePrompt: '',
                }));
            } else if (newModelType === 'nunchaku-flux-image') {
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'nunchaku-flux-image',
                    comfySteps: 10,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                    comfyFluxGuidanceKontext: 3.5,
                    comfyNegativePrompt: '', // This workflow has no negative prompt
                    comfyNunchakuBaseShift: 1.0,
                    comfyNunchakuMaxShift: 1.15,
                }));
            } else if (newModelType === 'flux-krea') {
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'flux-krea',
                    comfySteps: 20,
                    comfyCfg: 1,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                    comfyNegativePrompt: '', // This workflow uses ConditioningZeroOut
                }));
            } else { // Switching back to 'sdxl'
                const sdxlModel = comfyModels.find((m: string) => m.toLowerCase().includes('sdxl'));
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'sdxl',
                    comfyModel: sdxlModel || (comfyModels.length > 0 ? comfyModels[0] : ''),
                    comfySteps: 25, // Default for SDXL
                    comfyCfg: 5.5, // Default for SDXL
                }));
            }
        } else {
            setOptions(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSliderChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [field]: parseFloat(e.target.value) }));
    };
    
    const handleNumberInputChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [field]: parseInt(e.target.value, 10) || 0 }));
    };

    const handlePoseSelection = (poseValue: string) => {
        setSelectedPoses(prev => {
            const isSelected = prev.includes(poseValue);
            if (isSelected) {
                return prev.filter(p => p !== poseValue);
            } else {
                return [...prev, poseValue];
            }
        });
    };

    const handleCustomPoseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const poses = e.target.value
            .split('\n')
            .map(p => p.trim())
            .filter(Boolean)
            .slice(0, 13); // Max 13 poses
        setOptions(prev => ({ ...prev, poseSelection: poses }));
    };

    const handleRandomizeCustomPoses = () => {
        const randomPoses = generateRandomPosePrompts(options.numImages);
        setOptions(prev => ({ ...prev, poseSelection: randomPoses }));
    };
    
    const handleGenerateBgPreview = async () => {
        if (!options.customBackground) {
            setBgPreviewError("Please enter a background prompt first.");
            return;
        }
        setIsPreviewingBg(true);
        setBgPreviewError(null);
        setPreviewedBackgroundImage(null);
        try {
            const imageUrl = await generateBackgroundImagePreview(options.customBackground, options.aspectRatio);
            setPreviewedBackgroundImage(imageUrl);
            setOptions(prev => ({ ...prev, consistentBackground: true }));
        } catch (err: any) {
            setBgPreviewError(err.message || "Failed to generate preview.");
        } finally {
            setIsPreviewingBg(false);
        }
    };
    
    const handleGenerateClothingPreview = async () => {
        if (!options.customClothingPrompt) {
            setClothingPreviewError("Please enter a clothing prompt first.");
            return;
        }
        setIsPreviewingClothing(true);
        setClothingPreviewError(null);
        setPreviewedClothingImage(null);
        try {
            const imageUrl = await generateClothingPreview(options.customClothingPrompt, options.aspectRatio);
            setPreviewedClothingImage(imageUrl);
        } catch (err: any) {
            setClothingPreviewError(err.message || "Failed to generate clothing preview.");
        } finally {
            setIsPreviewingClothing(false);
        }
    };

    useEffect(() => {
        if (options.provider === 'comfyui' && comfyModels.length > 0 && !options.comfyModel) {
            setOptions(prev => ({ ...prev, comfyModel: comfyModels[0] }));
        }
    }, [options.provider, comfyModels, options.comfyModel, setOptions]);

    const handleBackgroundTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value;
        if (newType === 'random') {
            setOptions(prev => ({...prev, background: newType, customBackground: generateRandomBackgroundPrompt()}));
        } else {
            setOptions(prev => ({...prev, background: newType}));
        }
    };

    const handleRerollBackground = () => setOptions(prev => ({...prev, customBackground: generateRandomBackgroundPrompt()}));

    const handleClothingTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as GenerationOptions['clothing'];
        if (newType === 'random') {
            setOptions(prev => ({...prev, clothing: newType, customClothingPrompt: generateRandomClothingPrompt()}));
        } else {
            setOptions(prev => ({...prev, clothing: newType}));
        }
    };
    
    const handleRerollClothing = () => setOptions(prev => ({...prev, customClothingPrompt: generateRandomClothingPrompt()}));

    const handleRandomizeTextObject = () => {
        setOptions(prev => ({ ...prev, textObjectPrompt: getRandomTextObjectPrompt() }));
    };

    const renderProviderSwitch = () => (
        <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1">
            <button onClick={() => setOptions(prev => ({...prev, provider: 'gemini'}))} disabled={isDisabled}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>
                Gemini
            </button>
            <button onClick={() => setOptions(prev => ({...prev, provider: 'comfyui'}))} disabled={isDisabled || !comfyUIUrl}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'} ${!comfyUIUrl ? 'cursor-not-allowed opacity-50' : ''}`}>
                ComfyUI
            </button>
        </div>
    );
    
    const renderStyleSection = () => (
        <OptionSection title="Style">
            <SelectInput label="Artistic Style" value={options.imageStyle} onChange={handleOptionChange('imageStyle')} options={IMAGE_STYLE_OPTIONS} disabled={isDisabled} />
            {options.imageStyle === 'photorealistic' ? (
                <>
                    <SelectInput label="Photo Style" value={options.photoStyle} onChange={handleOptionChange('photoStyle')} options={PHOTO_STYLE_OPTIONS} disabled={isDisabled} />
                    <SelectInput label="Era / Theme" value={options.eraStyle} onChange={handleOptionChange('eraStyle')} options={ERA_STYLE_OPTIONS} disabled={isDisabled} />
                </>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Creativity: {options.creativity}</label>
                    <input type="range" min="0" max="1" step="0.1" value={options.creativity} onChange={handleSliderChange('creativity')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            )}
        </OptionSection>
    );

    const renderGeminiOptions = () => (
      <>
        <OptionSection title="Core Settings">
            <div>
                <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
            </div>
            <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
        </OptionSection>

        <OptionSection title="Background">
            <SelectInput label="Background Type" value={options.background} onChange={handleBackgroundTypeChange} options={BACKGROUND_OPTIONS} disabled={isDisabled} />
            {(options.background === 'prompt' || options.background === 'random') && (
                <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Custom Background Prompt" value={options.customBackground || ''} onChange={handleOptionChange('customBackground')} placeholder="e.g., a futuristic neon city" disabled={isDisabled} />
                    <div className="flex items-center gap-2">
                         {options.background === 'random' && (
                            <button onClick={handleRerollBackground} disabled={isDisabled} className="text-sm bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                               <RefreshIcon className="w-4 h-4"/> Re-roll
                            </button>
                        )}
                        <button onClick={handleGenerateBgPreview} disabled={isDisabled || isPreviewingBg} className={`text-sm flex-1 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2`}>
                            {isPreviewingBg ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <RefreshIcon className="w-4 h-4"/>}
                            {isPreviewingBg ? 'Generating...' : 'Preview Background'}
                        </button>
                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                           <input type="checkbox" checked={options.consistentBackground} onChange={handleOptionChange('consistentBackground')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                           Use same BG
                        </label>
                    </div>
                    {bgPreviewError && <p className="text-xs text-danger">{bgPreviewError}</p>}
                    {previewedBackgroundImage && (
                        <div className="mt-4 relative">
                            <p className="text-xs font-medium text-text-secondary mb-1">Background Preview:</p>
                            <img src={previewedBackgroundImage} alt="Background Preview" className="rounded-lg w-full object-contain border border-border-primary" />
                            <button 
                                onClick={() => setPreviewedBackgroundImage(null)}
                                className="absolute top-6 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/75 transition-colors"
                                title="Clear Preview"
                                aria-label="Clear background preview"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </OptionSection>
        
        <OptionSection title="Clothing">
            <SelectInput label="Clothing Source" value={options.clothing} onChange={handleClothingTypeChange} options={[
                { value: 'original', label: 'Keep Original' },
                { value: 'image', label: 'Use Reference Image' },
                { value: 'prompt', label: 'Describe with Prompt' },
                { value: 'random', label: 'Random Prompt' }
            ]} disabled={isDisabled} />
             {(options.clothing === 'prompt' || options.clothing === 'random') && (
                <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Custom Clothing Prompt" value={options.customClothingPrompt || ''} onChange={handleOptionChange('customClothingPrompt')} placeholder="e.g., a stylish leather jacket" disabled={isDisabled} />
                    <div className="flex items-center gap-2">
                         {options.clothing === 'random' && (
                            <button onClick={handleRerollClothing} disabled={isDisabled} className="text-sm bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                               <RefreshIcon className="w-4 h-4"/> Re-roll
                            </button>
                        )}
                        <button onClick={handleGenerateClothingPreview} disabled={isDisabled || isPreviewingClothing} className={`text-sm flex-1 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2`}>
                            {isPreviewingClothing ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <RefreshIcon className="w-4 h-4"/>}
                            {isPreviewingClothing ? 'Generating...' : 'Preview Clothing'}
                        </button>
                    </div>
                     {clothingPreviewError && <p className="text-xs text-danger">{clothingPreviewError}</p>}
                    {previewedClothingImage && (
                        <div className="mt-4 relative">
                            <p className="text-xs font-medium text-text-secondary mb-1">Clothing Preview:</p>
                            <img src={previewedClothingImage} alt="Clothing Preview" className="rounded-lg w-full object-contain border border-border-primary" />
                            <button 
                                onClick={() => setPreviewedClothingImage(null)}
                                className="absolute top-6 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/75 transition-colors"
                                title="Clear Clothing Preview"
                                aria-label="Clear clothing preview"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    {(options.clothing === 'prompt' || options.clothing === 'random') && (
                        <SelectInput label="Style Consistency" value={options.clothingStyleConsistency || 'varied'} onChange={handleOptionChange('clothingStyleConsistency')} options={[
                            {value: 'varied', label: 'Varied Interpretations'}, {value: 'strict', label: 'Strictly Identical'},
                        ]} disabled={isDisabled} />
                    )}
                </div>
            )}
        </OptionSection>

        <OptionSection title="Pose">
            <SelectInput label="Pose Mode" value={options.poseMode} onChange={handleOptionChange('poseMode')} options={[
                { value: 'random', label: 'Random' },
                { value: 'select', label: 'Select from Presets' },
                { value: 'prompt', label: 'Custom Poses' },
            ]} disabled={isDisabled} />
            {options.poseMode === 'select' && (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                    {PRESET_POSES.map(pose => (
                        <button key={pose.value} onClick={() => handlePoseSelection(pose.value)} disabled={isDisabled}
                            className={`p-2 text-xs text-left rounded-md transition-colors ${selectedPoses.includes(pose.value) ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>
                            {pose.label}
                        </button>
                    ))}
                </div>
            )}
            {options.poseMode === 'prompt' && (
                <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <div className="flex items-center justify-between">
                        <label htmlFor="custom-poses" className="block text-sm font-medium text-text-secondary">
                            Custom Poses (1 per line, max 13)
                        </label>
                        <button 
                            onClick={handleRandomizeCustomPoses}
                            disabled={isDisabled} 
                            className="text-xs flex items-center gap-1 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-1 px-2 rounded-lg transition-colors"
                            title="Generate random ideas"
                        >
                            <RefreshIcon className="w-3 h-3"/> Random Ideas
                        </button>
                    </div>
                    <textarea 
                        id="custom-poses"
                        value={options.poseSelection.join('\n')}
                        onChange={handleCustomPoseChange}
                        placeholder="e.g., Leaning against a wall, looking thoughtfully to the side."
                        disabled={isDisabled} 
                        rows={5}
                        className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                    />
                    <p className="text-xs text-text-muted">
                        {`Current poses: ${options.poseSelection.length}. The number of generated images will be capped by the number of poses.`}
                    </p>
                </div>
            )}
        </OptionSection>

        {renderStyleSection()}
        
        <OptionSection title="Text Overlay (Optional)">
             <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={options.addTextToImage} onChange={handleOptionChange('addTextToImage')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                Add text to image
            </label>
            {options.addTextToImage && (
                 <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Text to Display" value={options.textOnImagePrompt || ''} onChange={handleOptionChange('textOnImagePrompt')} placeholder="e.g., Happy Birthday" disabled={isDisabled} />
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">How to display text</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={options.textObjectPrompt || ''}
                                onChange={handleOptionChange('textObjectPrompt')}
                                placeholder="a sign with '%s' on it"
                                disabled={isDisabled}
                                className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                            />
                            <button
                                type="button"
                                onClick={handleRandomizeTextObject}
                                disabled={isDisabled}
                                className="p-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold rounded-lg transition-colors flex-shrink-0"
                                title="Randomize how text is displayed"
                            >
                                <RefreshIcon className="w-5 h-5"/>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </OptionSection>
      </>
    );
    
    const renderComfyUIBaseOptions = () => (
        <>
            <OptionSection title="Core Settings">
                <SelectInput label="Checkpoint Model" value={options.comfyModel || ''} onChange={handleOptionChange('comfyModel')} options={comfyModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                    <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>

            <OptionSection title="Prompt">
                <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="A photorealistic portrait of a person..." />
                <TextInput label="Negative Prompt" value={options.comfyNegativePrompt || ''} onChange={handleOptionChange('comfyNegativePrompt')} disabled={isDisabled} isTextArea={true} placeholder="blurry, bad quality, low-res, ugly, deformed..." />
                {options.comfyModelType !== 'nunchaku-kontext-flux' &&
                    <button onClick={onGeneratePrompt} disabled={!sourceImage || isGeneratingPrompt || isDisabled} className="w-full text-sm flex items-center justify-center gap-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isGeneratingPrompt ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4"/>}
                        {isGeneratingPrompt ? 'Generating...' : 'Generate from Source Image'}
                    </button>
                }
            </OptionSection>
            
            {renderStyleSection()}
            
            <OptionSection title="LoRA">
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use LoRA"
                        isChecked={!!options.comfySdxlUseLora}
                        onCheckboxChange={handleOptionChange('comfySdxlUseLora')}
                        sliderValue={options.comfySdxlLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfySdxlLoraStrength')}
                        min={0} max={2} step={0.05}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfySdxlUseLora && <SelectInput label="" value={options.comfySdxlLoraName || ''} onChange={handleOptionChange('comfySdxlLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
            </OptionSection>

            <OptionSection title="Parameters">
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Steps: {options.comfySteps}</label>
                    <input type="range" min="10" max="50" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-text-secondary">CFG Scale: {options.comfyCfg}</label>
                    <input type="range" min="1" max="15" step="0.5" value={options.comfyCfg} onChange={handleSliderChange('comfyCfg')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                {options.comfyModelType === 'flux' && (
                    <div>
                        <label className="block text-sm font-medium text-text-secondary">FLUX Guidance: {options.comfyFluxGuidance}</label>
                        <input type="range" min="1" max="10" step="0.1" value={options.comfyFluxGuidance} onChange={handleSliderChange('comfyFluxGuidance')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                    </div>
                )}
            </OptionSection>
        </>
    );

    const renderWan22Options = () => (
        <>
            <OptionSection title="WAN 2.2 Models">
                {comfyGgufModels.length > 0 ? (
                    <SelectInput label="High-Noise GGUF" value={options.comfyWanHighNoiseModel || ''} onChange={handleOptionChange('comfyWanHighNoiseModel')} options={comfyGgufModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                ) : (
                    <TextInput label="High-Noise GGUF Filename" value={options.comfyWanHighNoiseModel || ''} onChange={handleOptionChange('comfyWanHighNoiseModel')} placeholder="e.g., Wan2.2-HighNoise.gguf" disabled={isDisabled} />
                )}
                {comfyGgufModels.length > 0 ? (
                    <SelectInput label="Low-Noise GGUF" value={options.comfyWanLowNoiseModel || ''} onChange={handleOptionChange('comfyWanLowNoiseModel')} options={comfyGgufModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                ) : (
                    <TextInput label="Low-Noise GGUF Filename" value={options.comfyWanLowNoiseModel || ''} onChange={handleOptionChange('comfyWanLowNoiseModel')} placeholder="e.g., Wan2.2-LowNoise.gguf" disabled={isDisabled} />
                )}
                <SelectInput label="CLIP Model" value={options.comfyWanClipModel || ''} onChange={handleOptionChange('comfyWanClipModel')} options={comfyClips.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="VAE Model" value={options.comfyWanVaeModel || ''} onChange={handleOptionChange('comfyWanVaeModel')} options={comfyVaes.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
            </OptionSection>

            <OptionSection title="Prompt & Core">
                <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="A photorealistic portrait of a person..." />
                <TextInput label="Negative Prompt" value={options.comfyNegativePrompt || ''} onChange={handleOptionChange('comfyNegativePrompt')} disabled={isDisabled} isTextArea={true} placeholder="blurry, bad quality, low-res, ugly, deformed..." />
                <button onClick={onGeneratePrompt} disabled={!sourceImage || isGeneratingPrompt || isDisabled} className="w-full text-sm flex items-center justify-center gap-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isGeneratingPrompt ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4"/>}
                    {isGeneratingPrompt ? 'Generating...' : 'Generate from Source Image'}
                </button>
                <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                    <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>
            
            {renderStyleSection()}

            <OptionSection title="WAN 2.2 LoRAs">
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use FusionX LoRA"
                        isChecked={!!options.comfyWanUseFusionXLora}
                        onCheckboxChange={handleOptionChange('comfyWanUseFusionXLora')}
                        sliderValue={options.comfyWanFusionXLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyWanFusionXLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyWanUseFusionXLora && <SelectInput label="" value={options.comfyWanFusionXLoraName || ''} onChange={handleOptionChange('comfyWanFusionXLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>

                 <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Lightning LoRA"
                        isChecked={!!options.comfyWanUseLightningLora}
                        onCheckboxChange={handleOptionChange('comfyWanUseLightningLora')}
                        sliderValue={options.comfyWanLightningLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyWanLightningLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyWanUseLightningLora && (
                        <div className="space-y-2">
                            <SelectInput label="High-Noise LoRA" value={options.comfyWanLightningLoraNameHigh || ''} onChange={handleOptionChange('comfyWanLightningLoraNameHigh')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />
                            <SelectInput label="Low-Noise LoRA" value={options.comfyWanLightningLoraNameLow || ''} onChange={handleOptionChange('comfyWanLightningLoraNameLow')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />
                        </div>
                    )}
                </div>

                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Stock Photo LoRA"
                        isChecked={!!options.comfyWanUseStockPhotoLora}
                        onCheckboxChange={handleOptionChange('comfyWanUseStockPhotoLora')}
                        sliderValue={options.comfyWanStockPhotoLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyWanStockPhotoLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyWanUseStockPhotoLora && (
                         <div className="space-y-2">
                            <SelectInput label="High-Noise LoRA" value={options.comfyWanStockPhotoLoraNameHigh || ''} onChange={handleOptionChange('comfyWanStockPhotoLoraNameHigh')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />
                            <SelectInput label="Low-Noise LoRA" value={options.comfyWanStockPhotoLoraNameLow || ''} onChange={handleOptionChange('comfyWanStockPhotoLoraNameLow')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />
                        </div>
                    )}
                </div>
            </OptionSection>

            <OptionSection title="WAN 2.2 Sampler">
                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Steps: {options.comfySteps}</label>
                    <input type="range" min="4" max="20" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">CFG Scale: {options.comfyCfg}</label>
                    <input type="range" min="1" max="5" step="0.1" value={options.comfyCfg} onChange={handleSliderChange('comfyCfg')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Refiner Start At Step: {options.comfyWanRefinerStartStep}</label>
                    <input type="range" min="1" max={(options.comfySteps || 6) - 1} step="1" value={options.comfyWanRefinerStartStep} onChange={handleSliderChange('comfyWanRefinerStartStep')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>
        </>
    );

    const renderNunchakuKontextOptions = () => (
        <>
            <OptionSection title="Nunchaku Models">
                <SelectInput label="Main Model" value={options.comfyNunchakuModel || ''} onChange={handleOptionChange('comfyNunchakuModel')} options={nunchakuModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="VAE Model" value={options.comfyNunchakuVae || ''} onChange={handleOptionChange('comfyNunchakuVae')} options={comfyVaes.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="CLIP L Model" value={options.comfyNunchakuClipL || ''} onChange={handleOptionChange('comfyNunchakuClipL')} options={comfyClips.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="T5-XXL Model" value={options.comfyNunchakuT5XXL || ''} onChange={handleOptionChange('comfyNunchakuT5XXL')} options={t5SafetensorEncoderModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
            </OptionSection>

             <OptionSection title="Edit Instruction">
                <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="e.g., Change the shirt to red, keep the background the same" />
                <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                    <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>

            {renderStyleSection()}

            <OptionSection title="Nunchaku LoRAs">
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Turbo LoRA"
                        isChecked={!!options.comfyNunchakuUseTurboLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseTurboLora')}
                        sliderValue={options.comfyNunchakuTurboLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuTurboLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseTurboLora && <SelectInput label="" value={options.comfyNunchakuTurboLoraName || ''} onChange={handleOptionChange('comfyNunchakuTurboLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                 <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Nudify LoRA"
                        isChecked={!!options.comfyNunchakuUseNudifyLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseNudifyLora')}
                        sliderValue={options.comfyNunchakuNudifyLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuNudifyLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseNudifyLora && <SelectInput label="" value={options.comfyNunchakuNudifyLoraName || ''} onChange={handleOptionChange('comfyNunchakuNudifyLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Detail LoRA"
                        isChecked={!!options.comfyNunchakuUseDetailLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseDetailLora')}
                        sliderValue={options.comfyNunchakuDetailLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuDetailLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseDetailLora && <SelectInput label="" value={options.comfyNunchakuDetailLoraName || ''} onChange={handleOptionChange('comfyNunchakuDetailLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
            </OptionSection>

            <OptionSection title="Nunchaku Parameters">
                 <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Steps: {options.comfySteps}</label>
                    <input type="range" min="5" max="30" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">CFG Scale: {options.comfyCfg}</label>
                    <input type="range" min="1" max="5" step="0.1" value={options.comfyCfg} onChange={handleSliderChange('comfyCfg')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Flux Guidance: {options.comfyFluxGuidanceKontext}</label>
                    <input type="range" min="1" max="10" step="0.1" value={options.comfyFluxGuidanceKontext} onChange={handleSliderChange('comfyFluxGuidanceKontext')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Cache Threshold: {options.comfyNunchakuCacheThreshold}</label>
                    <input type="range" min="0" max="1" step="0.01" value={options.comfyNunchakuCacheThreshold} onChange={handleSliderChange('comfyNunchakuCacheThreshold')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                <SelectInput
                    label="CPU Offload"
                    value={options.comfyNunchakuCpuOffload || 'auto'}
                    onChange={handleOptionChange('comfyNunchakuCpuOffload')}
                    options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'enable', label: 'Enable' },
                        { value: 'disable', label: 'Disable' },
                    ]}
                    disabled={isDisabled}
                />
                <SelectInput
                    label="Attention"
                    value={options.comfyNunchakuAttention || 'nunchaku-fp16'}
                    onChange={handleOptionChange('comfyNunchakuAttention')}
                    options={nunchakuAttentions.map((a: string) => ({ value: a, label: a }))}
                    disabled={isDisabled}
                />
            </OptionSection>
        </>
    );

    const renderNunchakuFluxImageOptions = () => (
        <>
            <OptionSection title="Nunchaku Flux Image Models">
                <SelectInput label="Main Model" value={options.comfyNunchakuModel || ''} onChange={handleOptionChange('comfyNunchakuModel')} options={nunchakuModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="VAE Model" value={options.comfyNunchakuVae || ''} onChange={handleOptionChange('comfyNunchakuVae')} options={comfyVaes.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="CLIP L Model" value={options.comfyNunchakuClipL || ''} onChange={handleOptionChange('comfyNunchakuClipL')} options={comfyClips.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="T5-XXL Model" value={options.comfyNunchakuT5XXL || ''} onChange={handleOptionChange('comfyNunchakuT5XXL')} options={t5SafetensorEncoderModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
            </OptionSection>

             <OptionSection title="Prompt">
                <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="A photorealistic portrait of a person..." />
                <button onClick={onGeneratePrompt} disabled={!sourceImage || isGeneratingPrompt || isDisabled} className="w-full text-sm flex items-center justify-center gap-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isGeneratingPrompt ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4"/>}
                    {isGeneratingPrompt ? 'Generating...' : 'Generate from Source Image'}
                </button>
                <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                    <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>

            {renderStyleSection()}

            <OptionSection title="Nunchaku LoRAs">
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Turbo LoRA"
                        isChecked={!!options.comfyNunchakuUseTurboLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseTurboLora')}
                        sliderValue={options.comfyNunchakuTurboLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuTurboLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseTurboLora && <SelectInput label="" value={options.comfyNunchakuTurboLoraName || ''} onChange={handleOptionChange('comfyNunchakuTurboLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                 <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Nudify LoRA"
                        isChecked={!!options.comfyNunchakuUseNudifyLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseNudifyLora')}
                        sliderValue={options.comfyNunchakuNudifyLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuNudifyLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseNudifyLora && <SelectInput label="" value={options.comfyNunchakuNudifyLoraName || ''} onChange={handleOptionChange('comfyNunchakuNudifyLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use Detail LoRA"
                        isChecked={!!options.comfyNunchakuUseDetailLora}
                        onCheckboxChange={handleOptionChange('comfyNunchakuUseDetailLora')}
                        sliderValue={options.comfyNunchakuDetailLoraStrength || 0}
                        onSliderChange={handleSliderChange('comfyNunchakuDetailLoraStrength')}
                        min={0} max={2} step={0.1}
                        disabled={isDisabled}
                        sliderLabel="Strength"
                    />
                    {options.comfyNunchakuUseDetailLora && <SelectInput label="" value={options.comfyNunchakuDetailLoraName || ''} onChange={handleOptionChange('comfyNunchakuDetailLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
            </OptionSection>

            <OptionSection title="Nunchaku Parameters">
                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Steps: {options.comfySteps}</label>
                    <input type="range" min="5" max="30" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Flux Guidance: {options.comfyFluxGuidanceKontext}</label>
                    <input type="range" min="1" max="10" step="0.1" value={options.comfyFluxGuidanceKontext} onChange={handleSliderChange('comfyFluxGuidanceKontext')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Base Shift: {options.comfyNunchakuBaseShift}</label>
                    <input type="range" min="0" max="5" step="0.05" value={options.comfyNunchakuBaseShift} onChange={handleSliderChange('comfyNunchakuBaseShift')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Max Shift: {options.comfyNunchakuMaxShift}</label>
                    <input type="range" min="0" max="5" step="0.05" value={options.comfyNunchakuMaxShift} onChange={handleSliderChange('comfyNunchakuMaxShift')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                <SelectInput
                    label="CPU Offload"
                    value={options.comfyNunchakuCpuOffload || 'auto'}
                    onChange={handleOptionChange('comfyNunchakuCpuOffload')}
                    options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'enable', label: 'Enable' },
                        { value: 'disable', label: 'Disable' },
                    ]}
                    disabled={isDisabled}
                />
                <SelectInput
                    label="Attention"
                    value={options.comfyNunchakuAttention || 'nunchaku-fp16'}
                    onChange={handleOptionChange('comfyNunchakuAttention')}
                    options={nunchakuAttentions.map((a: string) => ({ value: a, label: a }))}
                    disabled={isDisabled}
                />
            </OptionSection>
        </>
    );
    
    const renderFluxKreaOptions = () => (
        <>
            <OptionSection title="Flux Krea Models">
                <SelectInput label="Main GGUF Model" value={options.comfyFluxKreaModel || ''} onChange={handleOptionChange('comfyFluxKreaModel')} options={comfyGgufModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="T5 Encoder GGUF" value={options.comfyFluxKreaClipT5 || ''} onChange={handleOptionChange('comfyFluxKreaClipT5')} options={t5GgufEncoderModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="CLIP L Model" value={options.comfyFluxKreaClipL || ''} onChange={handleOptionChange('comfyFluxKreaClipL')} options={comfyClips.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                <SelectInput label="VAE Model" value={options.comfyFluxKreaVae || ''} onChange={handleOptionChange('comfyFluxKreaVae')} options={comfyVaes.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
            </OptionSection>

            <OptionSection title="Prompt & Core">
                <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="A photorealistic portrait of a person..." />
                <button onClick={onGeneratePrompt} disabled={!sourceImage || isGeneratingPrompt || isDisabled} className="w-full text-sm flex items-center justify-center gap-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isGeneratingPrompt ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4"/>}
                    {isGeneratingPrompt ? 'Generating...' : 'Generate from Source Image'}
                </button>
                <TextInput label="Negative Prompt" value={options.comfyNegativePrompt || ''} onChange={handleOptionChange('comfyNegativePrompt')} disabled={true} isTextArea={true} tooltip="This workflow uses a ConditioningZeroOut node, so a negative prompt is not used."/>
                <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                    <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-text-secondary">Steps (Initial Pass): {options.comfySteps}</label>
                    <input type="range" min="10" max="40" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            </OptionSection>
            
            {renderStyleSection()}

            <OptionSection title="Flux Krea LoRAs">
                <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use p1x4r0ma_woman LoRA"
                        isChecked={!!options.useP1x4r0maWomanLora}
                        onCheckboxChange={handleOptionChange('useP1x4r0maWomanLora')}
                        sliderValue={options.p1x4r0maWomanLoraStrength || 0}
                        onSliderChange={handleSliderChange('p1x4r0maWomanLoraStrength')}
                        min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                    {options.useP1x4r0maWomanLora && <SelectInput label="" value={options.p1x4r0maWomanLoraName || ''} onChange={handleOptionChange('p1x4r0maWomanLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                 <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use nipplediffusion LoRA"
                        isChecked={!!options.useNippleDiffusionLora}
                        onCheckboxChange={handleOptionChange('useNippleDiffusionLora')}
                        sliderValue={options.nippleDiffusionLoraStrength || 0}
                        onSliderChange={handleSliderChange('nippleDiffusionLoraStrength')}
                        min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                    {options.useNippleDiffusionLora && <SelectInput label="" value={options.nippleDiffusionLoraName || ''} onChange={handleOptionChange('nippleDiffusionLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
                 <div className="space-y-4 p-4 bg-bg-primary/30 rounded-lg border border-border-primary/50">
                    <CheckboxSlider
                        label="Use pussydiffusion LoRA"
                        isChecked={!!options.usePussyDiffusionLora}
                        onCheckboxChange={handleOptionChange('usePussyDiffusionLora')}
                        sliderValue={options.pussyDiffusionLoraStrength || 0}
                        onSliderChange={handleSliderChange('pussyDiffusionLoraStrength')}
                        min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength" />
                    {options.usePussyDiffusionLora && <SelectInput label="" value={options.pussyDiffusionLoraName || ''} onChange={handleOptionChange('pussyDiffusionLoraName')} options={comfyLoras.map((l:string) => ({value: l, label: l}))} disabled={isDisabled} />}
                </div>
            </OptionSection>

            <OptionSection title="Upscaler / Refiner">
                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                    <input type="checkbox" checked={options.comfyFluxKreaUseUpscaler} onChange={handleOptionChange('comfyFluxKreaUseUpscaler')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                    Enable Upscaler
                </label>
                {options.comfyFluxKreaUseUpscaler && (
                    <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                        <SelectInput label="Upscale Model" value={options.comfyFluxKreaUpscaleModel || ''} onChange={handleOptionChange('comfyFluxKreaUpscaleModel')} options={comfyUpscaleModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                         <div>
                            <label className="block text-sm font-medium text-text-secondary">Steps (Upscaler Pass): {options.comfyFluxKreaUpscalerSteps}</label>
                            <input type="range" min="5" max="25" step="1" value={options.comfyFluxKreaUpscalerSteps} onChange={handleSliderChange('comfyFluxKreaUpscalerSteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary">Denoise Strength: {options.comfyFluxKreaDenoise}</label>
                            <input type="range" min="0.1" max="1.0" step="0.05" value={options.comfyFluxKreaDenoise} onChange={handleSliderChange('comfyFluxKreaDenoise')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                        </div>
                    </div>
                )}
            </OptionSection>
        </>
    );

    const renderComfyUIOptions = () => (
      <>
        {comfyUIObjectInfo === null ? (
            <div className="flex items-center justify-center text-text-secondary p-8">
                <SpinnerIcon className="w-8 h-8 animate-spin mr-2" />
                <span>Loading ComfyUI models...</span>
            </div>
        ) : comfyModels.length === 0 && nunchakuModels.length === 0 && comfyGgufModels.length === 0 ? (
            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm">
                Could not load any ComfyUI models. Ensure your server is running and accessible. Check the connection in the header.
            </div>
        ) : (
            <>
                <OptionSection title="Core Settings">
                    <SelectInput 
                        label="Model Type" 
                        value={options.comfyModelType || 'sdxl'} 
                        onChange={handleOptionChange('comfyModelType')} 
                        options={[
                            {label: 'SD 1.5', value: 'sd1.5'},
                            {label: 'SDXL', value: 'sdxl'}, 
                            {label: 'FLUX', value: 'flux'},
                            {label: 'Flux Krea', value: 'flux-krea'},
                            {label: 'WAN 2.2 Image', value: 'wan2.2'},
                            {label: 'Nunchaku Kontext Flux', value: 'nunchaku-kontext-flux'},
                            {label: 'Nunchaku Flux Image', value: 'nunchaku-flux-image'}
                        ]} 
                        disabled={isDisabled} 
                    />
                </OptionSection>

                {(() => {
                    if (options.comfyModelType === 'wan2.2') {
                        const isWanReady = !!comfyUIObjectInfo?.UnetLoaderGGUF;
                        if (isWanReady) {
                             return (
                                <>
                                    {renderWan22Options()}
                                    <OptionSection title="Text Overlay (Optional)">
                                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                                            <input type="checkbox" checked={options.addTextToImage} onChange={handleOptionChange('addTextToImage')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                                            Add text to image
                                        </label>
                                        {options.addTextToImage && (
                                            <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                                                <TextInput label="Text to Display" value={options.textOnImagePrompt || ''} onChange={handleOptionChange('textOnImagePrompt')} placeholder="e.g., Happy Birthday" disabled={isDisabled} />
                                                <div>
                                                    <label className="block text-sm font-medium text-text-secondary mb-1">How to display text</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={options.textObjectPrompt || ''}
                                                            onChange={handleOptionChange('textObjectPrompt')}
                                                            placeholder="a sign with '%s' on it"
                                                            disabled={isDisabled}
                                                            className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={handleRandomizeTextObject}
                                                            disabled={isDisabled}
                                                            className="p-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold rounded-lg transition-colors flex-shrink-0"
                                                            title="Randomize how text is displayed"
                                                        >
                                                            <RefreshIcon className="w-5 h-5"/>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </OptionSection>
                                </>
                            );
                        }
                        return (
                            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm space-y-2 mt-4">
                                <h4 className="font-bold flex items-center gap-2"><WarningIcon className="w-5 h-5"/>WAN 2.2 Workflow Not Available</h4>
                                <p>Your ComfyUI server appears to be missing required custom nodes for this workflow.</p>
                                <ul className="list-disc list-inside text-xs space-y-1">
                                    <li>Ensure the <strong>UnetLoaderGGUF</strong> custom node is installed via the ComfyUI Manager.</li>
                                </ul>
                            </div>
                        );
                    } else if (options.comfyModelType === 'nunchaku-kontext-flux') {
                         const isNunchakuReady = !!comfyUIObjectInfo?.NunchakuFluxDiTLoader;
                         if (isNunchakuReady) {
                            return renderNunchakuKontextOptions();
                         }
                         return (
                            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm space-y-2 mt-4">
                                <h4 className="font-bold flex items-center gap-2"><WarningIcon className="w-5 h-5"/>Nunchaku Workflow Not Available</h4>
                                <p>Your ComfyUI server appears to be missing required custom nodes for this workflow.</p>
                                 <ul className="list-disc list-inside text-xs space-y-1">
                                    <li>Ensure the <strong>ComfyUI-nunchaku</strong> custom node is installed via the ComfyUI Manager.</li>
                                </ul>
                            </div>
                        );
                    } else if (options.comfyModelType === 'nunchaku-flux-image') {
                         const isNunchakuReady = !!comfyUIObjectInfo?.NunchakuFluxDiTLoader && !!comfyUIObjectInfo?.NunchakuTextEncoderLoader;
                         if (isNunchakuReady) {
                            return renderNunchakuFluxImageOptions();
                         }
                         return (
                            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm space-y-2 mt-4">
                                <h4 className="font-bold flex items-center gap-2"><WarningIcon className="w-5 h-5"/>Nunchaku Workflow Not Available</h4>
                                <p>Your ComfyUI server appears to be missing required custom nodes for this workflow.</p>
                                 <ul className="list-disc list-inside text-xs space-y-1">
                                    <li>Ensure the <strong>ComfyUI-nunchaku</strong> custom node (with all its nodes like NunchakuTextEncoderLoader) is installed via the ComfyUI Manager.</li>
                                </ul>
                            </div>
                        );
                    } else if (options.comfyModelType === 'flux-krea') {
                         const isFluxKreaReady = !!comfyUIObjectInfo?.DualCLIPLoaderGGUF && !!comfyUIObjectInfo?.["Power Lora Loader (rgthree)"];
                         if (isFluxKreaReady) {
                            return renderFluxKreaOptions();
                         }
                         return (
                            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm space-y-2 mt-4">
                                <h4 className="font-bold flex items-center gap-2"><WarningIcon className="w-5 h-5"/>Flux Krea Workflow Not Available</h4>
                                <p>Your ComfyUI server appears to be missing required custom nodes for this workflow.</p>
                                 <ul className="list-disc list-inside text-xs space-y-1">
                                    <li>Ensure <strong>ComfyUI-GGUF</strong> and <strong>rgthree-comfy</strong> nodes are installed via the ComfyUI Manager.</li>
                                </ul>
                            </div>
                        );
                    }
                    
                    // For SD1.5, SDXL and FLUX
                    return (
                         <>
                            {renderComfyUIBaseOptions()}
                             <OptionSection title="Text Overlay (Optional)">
                                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                                    <input type="checkbox" checked={options.addTextToImage} onChange={handleOptionChange('addTextToImage')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                                    Add text to image
                                </label>
                                {options.addTextToImage && (
                                    <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                                        <TextInput label="Text to Display" value={options.textOnImagePrompt || ''} onChange={handleOptionChange('textOnImagePrompt')} placeholder="e.g., Happy Birthday" disabled={isDisabled} />
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary mb-1">How to display text</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={options.textObjectPrompt || ''}
                                                    onChange={handleOptionChange('textObjectPrompt')}
                                                    placeholder="a sign with '%s' on it"
                                                    disabled={isDisabled}
                                                    className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleRandomizeTextObject}
                                                    disabled={isDisabled}
                                                    className="p-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold rounded-lg transition-colors flex-shrink-0"
                                                    title="Randomize how text is displayed"
                                                >
                                                    <RefreshIcon className="w-5 h-5"/>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </OptionSection>
                        </>
                    );
                })()}
            </>
        )}
      </>
    );

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
            <div>
                <h2 className="text-xl font-bold mb-4 text-accent">2. Configure Generation</h2>
                {renderProviderSwitch()}
            </div>
            
            {options.provider === 'gemini' ? renderGeminiOptions() : renderComfyUIOptions()}

            <OptionSection title="Actions">
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <button onClick={onReset} disabled={isDisabled} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                          <ResetIcon className="w-5 h-5"/> Reset
                      </button>
                      <button onClick={onGenerate} disabled={!isReady} style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                          <GenerateIcon className="w-5 h-5"/> Generate
                      </button>
                  </div>
                  {options.provider === 'comfyui' && (
                      <button onClick={onExportWorkflow} disabled={isDisabled || !options.comfyPrompt} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                          <WorkflowIcon className="w-5 h-5" /> Export Workflow (.json)
                      </button>
                  )}
              </div>
            </OptionSection>
        </div>
    );
};