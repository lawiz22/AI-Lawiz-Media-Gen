import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
// Fix: Import `NunchakuAttention` type to be used for casting.
import type { GenerationOptions, NunchakuAttention } from '../types';
import {
  BACKGROUND_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  PHOTO_STYLE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  ERA_STYLE_OPTIONS,
  PRESET_POSES,
  MAX_IMAGES,
} from '../constants';
import { generateBackgroundImagePreview, generateClothingPreview } from '../services/geminiService';
import { generateRandomClothingPrompt, generateRandomBackgroundPrompt, generateRandomPosePrompts, getRandomTextObjectPrompt } from '../utils/promptBuilder';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon, WorkflowIcon, CloseIcon, WarningIcon, LibraryIcon } from './icons';
import { ImageUploader } from './ImageUploader';

// --- Prop Types ---
interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  generationMode: 't2i' | 'i2i';
  setGenerationMode: React.Dispatch<React.SetStateAction<'t2i' | 'i2i'>>;
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

// Fix: Defined the missing `NumberSlider` helper component.
const NumberSlider: React.FC<{
    label: string,
    value: number,
    onChange: (e: ChangeEvent<HTMLInputElement>) => void,
    min: number,
    max: number,
    step: number,
    disabled?: boolean
}> = ({ label, value, onChange, min, max, step, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}: {value}</label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
        />
    </div>
);

const ElementImageManager: React.FC<{
  elementImages: File[];
  setElementImages: (files: File[]) => void;
  disabled: boolean;
}> = ({ elementImages, setElementImages, disabled }) => {
  const handleAddImage = (file: File | null) => {
    if (file) {
      setElementImages([...elementImages, file]);
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
      <ImageUploader
        id="element-image-uploader"
        onImageUpload={handleAddImage}
        disabled={disabled || elementImages.length >= 5}
        label="Add Element Image"
        infoText={elementImages.length >= 5 ? "Max 5 elements" : "PNG, JPG, WEBP"}
      />
    </div>
  );
};


// --- Main Component ---
export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options, setOptions,
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
  elementImages, setElementImages
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
    
    // Face Detailer specific model lists
    const comfyBboxModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.UltralyticsDetectorProvider?.input?.required?.model_name), [comfyUIObjectInfo]);
    const comfySamModels = useMemo(() => getModelListFromInfo(comfyUIObjectInfo?.SAMLoader?.input?.required?.model_name), [comfyUIObjectInfo]);

    // This effect synchronizes the model types whenever the provider or generation mode changes.
    // It ensures the correct model and its default settings are loaded.
    useEffect(() => {
        setOptions(prev => {
            let newOptions = { ...prev };
            let optionsChanged = false;

            if (newOptions.provider === 'comfyui') {
                const isI2IModel = ['nunchaku-kontext-flux', 'face-detailer-sd1.5'].includes(newOptions.comfyModelType!);
                if (generationMode === 'i2i' && !isI2IModel) {
                    // Switching TO I2I mode for Comfy
                    optionsChanged = true;
                    newOptions.comfyModelType = 'nunchaku-kontext-flux';
                    // Reset to nunchaku defaults (copied from handleOptionChange)
                    newOptions.comfySteps = 10;
                    newOptions.comfyCfg = 1;
                    newOptions.comfySampler = 'euler';
                    newOptions.comfyScheduler = 'simple';
                    newOptions.comfyNegativePrompt = '';
                    newOptions.comfyFluxGuidanceKontext = 2.5;
                    newOptions.comfyNunchakuModel = nunchakuModels.find(m => m.includes('kontext-dev')) || nunchakuModels[0] || 'svdq-int4_r32-flux.1-kontext-dev.safetensors';
                    newOptions.comfyNunchakuVae = comfyVaes.find(v => v.includes('ae')) || comfyVaes[0] || 'ae.safetensors';
                    newOptions.comfyNunchakuClipL = comfyClips.find(c => c.includes('ViT-L')) || comfyClips[0] || 'ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors';
                    newOptions.comfyNunchakuT5XXL = t5SafetensorEncoderModels.find(t => t.includes('t5xxl')) || t5SafetensorEncoderModels[0] || 't5xxl_fp8_e4m3fn_scaled.safetensors';
                    newOptions.comfyNunchakuCacheThreshold = 0.12;
                    newOptions.comfyNunchakuCpuOffload = 'enable';
                    newOptions.comfyNunchakuAttention = (nunchakuAttentions[0] || 'nunchaku-fp16') as NunchakuAttention;
                    newOptions.comfyNunchakuUseTurboLora = true;
                    newOptions.comfyNunchakuTurboLoraName = comfyLoras.find(l => l.includes('turbo')) || comfyLoras[0] || 'flux-turbo.safetensors';
                    newOptions.comfyNunchakuTurboLoraStrength = 1.0;
                    newOptions.comfyNunchakuUseNudifyLora = true;
                    newOptions.comfyNunchakuNudifyLoraName = comfyLoras.find(l => l.includes('Nudify')) || comfyLoras[0] || 'JD3s_Nudify_Kontext.safetensors';
                    newOptions.comfyNunchakuNudifyLoraStrength = 1.0;
                    newOptions.comfyNunchakuUseDetailLora = false;
                    newOptions.comfyNunchakuDetailLoraName = comfyLoras.find(l => l.includes('nipples')) || comfyLoras[0] || 'flux_nipples_saggy_breasts.safetensors';
                    newOptions.comfyNunchakuDetailLoraStrength = 1.0;
                } else if (generationMode === 't2i' && isI2IModel) {
                    // Switching FROM I2I mode for Comfy
                    optionsChanged = true;
                    const sdxlModel = comfyModels.find((m: string) => m.toLowerCase().includes('sdxl'));
                    newOptions.comfyModelType = 'sdxl';
                    newOptions.comfyModel = sdxlModel || (comfyModels.length > 0 ? comfyModels[0] : '');
                    newOptions.comfySteps = 25;
                    newOptions.comfyCfg = 5.5;
                    newOptions.comfySampler = 'euler';
                    newOptions.comfyScheduler = 'normal';
                }
            } else if (newOptions.provider === 'gemini') {
                if (newOptions.geminiMode !== generationMode) {
                    optionsChanged = true;
                    newOptions.geminiMode = generationMode;
                }
            }
            
            return optionsChanged ? newOptions : prev;
        });
    }, [options.provider, generationMode, setOptions, comfyModels, comfyVaes, comfyClips, comfyLoras, nunchakuModels, nunchakuAttentions, t5SafetensorEncoderModels]);


    const handleGenerationModeChange = (mode: 't2i' | 'i2i') => {
        setGenerationMode(mode);
    };

    const handleOptionChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;

        if (field === 'geminiT2IModel') {
            const newModel = value as 'imagen-4.0-generate-001' | 'gemini-2.5-flash-image-preview';
            setOptions(prev => ({
                ...prev,
                geminiT2IModel: newModel,
                aspectRatio: newModel === 'gemini-2.5-flash-image-preview' ? '1:1' : '3:4', // 3:4 is default
            }));
            return;
        }

        // Fix: Refactor to use a clearer if/else if structure to avoid TS comparison error.
        const getStylePrefix = (opts: GenerationOptions) => {
            if (opts.imageStyle === 'photorealistic') {
                return `${opts.photoStyle}, ${opts.eraStyle}, `;
            } else if (opts.imageStyle) {
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
            const newModelType = value as 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea' | 'face-detailer-sd1.5';
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
                    comfySeed: undefined,
                    comfySeedControl: 'randomize',
                    comfySeedIncrement: 1,
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
                    comfySampler: 'euler',
                    comfyScheduler: 'normal',
                    comfyFluxGuidance: 3.5,
                }));
            } else if (newModelType === 'wan2.2') {
                 const allT5Models = [...t5GgufEncoderModels, ...t5SafetensorEncoderModels];
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'wan2.2',
                    comfySteps: 6,
                    comfyCfg: 1,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                    comfyWanRefinerStartStep: 3,
                    comfyWanHighNoiseModel: comfyGgufModels.find(m => m.includes('HighNoise')) || comfyGgufModels[0] || 'Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf',
                    comfyWanLowNoiseModel: comfyGgufModels.find(m => m.includes('LowNoise')) || comfyGgufModels[1] || 'Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf',
                    comfyWanClipModel: allT5Models.find(t => t.includes('umt5')) || allT5Models[0] || 'umt5-xxl-encoder-Q5_K_M.gguf',
                    comfyWanVaeModel: comfyVaes.find(v => v.includes('wan_2.1')) || comfyVaes[0] || 'wan_2.1_vae.safetensors',
                    comfyWanUseFusionXLora: true,
                    comfyWanFusionXLoraStrength: 0.8,
                    comfyWanFusionXLoraName: comfyLoras.find(l => l.includes('FusionX')) || comfyLoras[0] || 'Wan2.1_T2V_14B_FusionX_LoRA.safetensors',
                    comfyWanUseLightningLora: true,
                    comfyWanLightningLoraStrength: 0.6,
                    comfyWanLightningLoraNameHigh: comfyLoras.find(l => l.includes('Lightning') && l.includes('HIGH')) || comfyLoras[0] || 'Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors',
                    comfyWanLightningLoraNameLow: comfyLoras.find(l => l.includes('Lightning') && l.includes('LOW')) || comfyLoras[1] || 'Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors',
                    comfyWanUseStockPhotoLora: true,
                    comfyWanStockPhotoLoraStrength: 1.5,
                    comfyWanStockPhotoLoraNameHigh: comfyLoras.find(l => l.includes('stock') && l.includes('HIGH')) || comfyLoras[0] || 'stock_photography_wan22_HIGH_v1.safetensors',
                    comfyWanStockPhotoLoraNameLow: comfyLoras.find(l => l.includes('stock') && l.includes('LOW')) || comfyLoras[1] || 'stock_photography_wan22_LOW_v1.safetensors',
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
                    comfyFluxGuidanceKontext: 2.5,
                    comfyNunchakuModel: nunchakuModels.find(m => m.includes('kontext-dev')) || nunchakuModels[0] || 'svdq-int4_r32-flux.1-kontext-dev.safetensors',
                    comfyNunchakuVae: comfyVaes.find(v => v.includes('ae')) || comfyVaes[0] || 'ae.safetensors',
                    comfyNunchakuClipL: comfyClips.find(c => c.includes('ViT-L')) || comfyClips[0] || 'ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors',
                    comfyNunchakuT5XXL: t5SafetensorEncoderModels.find(t => t.includes('t5xxl')) || t5SafetensorEncoderModels[0] || 't5xxl_fp8_e4m3fn_scaled.safetensors',
                    comfyNunchakuCacheThreshold: 0.12,
                    comfyNunchakuCpuOffload: 'enable',
                    // Fix: Cast the string value to the NunchakuAttention type to resolve TypeScript error.
                    comfyNunchakuAttention: (nunchakuAttentions[0] || 'nunchaku-fp16') as NunchakuAttention,
                    comfyNunchakuUseTurboLora: true,
                    comfyNunchakuTurboLoraName: comfyLoras.find(l => l.includes('turbo')) || comfyLoras[0] || 'flux-turbo.safetensors',
                    comfyNunchakuTurboLoraStrength: 1.0,
                    comfyNunchakuUseNudifyLora: true,
                    comfyNunchakuNudifyLoraName: comfyLoras.find(l => l.includes('Nudify')) || comfyLoras[0] || 'JD3s_Nudify_Kontext.safetensors',
                    comfyNunchakuNudifyLoraStrength: 1.0,
                    comfyNunchakuUseDetailLora: false,
                    comfyNunchakuDetailLoraName: comfyLoras.find(l => l.includes('nipples')) || comfyLoras[0] || 'flux_nipples_saggy_breasts.safetensors',
                    comfyNunchakuDetailLoraStrength: 1.0,
                }));
            } else if (newModelType === 'nunchaku-flux-image') {
                 setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'nunchaku-flux-image',
                    comfySteps: 10,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                    comfyFluxGuidanceKontext: 3.5,
                    comfyNegativePrompt: '',
                    comfyNunchakuBaseShift: 1.0,
                    comfyNunchakuMaxShift: 1.15,
                    comfyNunchakuModel: nunchakuModels.find(m => m.includes('kontext-dev')) || nunchakuModels[0] || 'svdq-int4_r32-flux.1-kontext-dev.safetensors',
                    comfyNunchakuVae: comfyVaes.find(v => v.includes('ae')) || comfyVaes[0] || 'ae.safetensors',
                    comfyNunchakuClipL: comfyClips.find(c => c.includes('clip_l')) || comfyClips[0] || 'clip_l.safetensors',
                    comfyNunchakuT5XXL: t5SafetensorEncoderModels.find(t => t.includes('t5xxl')) || t5SafetensorEncoderModels[0] || 't5xxl_fp16.safetensors',
                    comfyNunchakuCacheThreshold: 0,
                    comfyNunchakuCpuOffload: 'enable',
                    // Fix: Cast the string value to the NunchakuAttention type to resolve TypeScript error.
                    comfyNunchakuAttention: (nunchakuAttentions[0] || 'nunchaku-fp16') as NunchakuAttention,
                    comfyNunchakuUseTurboLora: true,
                    comfyNunchakuTurboLoraName: comfyLoras.find(l => l.includes('turbo')) || comfyLoras[0] || 'flux-turbo.safetensors',
                    comfyNunchakuTurboLoraStrength: 1.0,
                    comfyNunchakuUseNudifyLora: true,
                    comfyNunchakuNudifyLoraName: comfyLoras.find(l => l.includes('Nudify')) || comfyLoras[0] || 'JD3s_Nudify_Kontext.safetensors',
                    comfyNunchakuNudifyLoraStrength: 1.12,
                    comfyNunchakuUseDetailLora: false,
                    comfyNunchakuDetailLoraName: comfyLoras.find(l => l.includes('nipples')) || comfyLoras[0] || 'flux_nipples_saggy_breasts.safetensors',
                    comfyNunchakuDetailLoraStrength: 1.0,
                }));
            } else if (newModelType === 'flux-krea') {
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'flux-krea',
                    comfySteps: 20,
                    comfyCfg: 1,
                    comfySampler: 'res_2s',
                    comfyScheduler: 'bong_tangent',
                    comfyNegativePrompt: '',
                    comfyFluxGuidance: 3.5,
                    comfyFluxKreaModel: comfyGgufModels.find(m => m.includes('krea')) || comfyGgufModels[0] || 'flux1-krea-dev-Q5_K_M.gguf',
                    comfyFluxKreaClipT5: t5GgufEncoderModels.find(t => t.includes('t5-v1_1')) || t5GgufEncoderModels[0] || 't5-v1_1-xxl-encoder-Q5_K_M.gguf',
                    comfyFluxKreaClipL: comfyClips.find(c => c.includes('clip_l')) || comfyClips[0] || 'clip_l.safetensors',
                    comfyFluxKreaVae: comfyVaes.find(v => v.includes('ae')) || comfyVaes[0] || 'ae.safetensors',
                    useP1x4r0maWomanLora: false,
                    p1x4r0maWomanLoraName: comfyLoras.find(l => l.includes('p1x4r0ma')) || comfyLoras[0] || 'p1x4r0ma_woman.safetensors',
                    p1x4r0maWomanLoraStrength: 0.9,
                    useNippleDiffusionLora: true,
                    nippleDiffusionLoraName: comfyLoras.find(l => l.includes('nipple')) || comfyLoras[0] || 'nipplediffusion-saggy-f1.safetensors',
                    nippleDiffusionLoraStrength: 1.0,
                    usePussyDiffusionLora: false,
                    pussyDiffusionLoraName: comfyLoras.find(l => l.includes('pussy')) || comfyLoras[0] || 'pussydiffusion-f1.safetensors',
                    pussyDiffusionLoraStrength: 1.0,
                    comfyFluxKreaUseUpscaler: true,
                    comfyFluxKreaUpscaleModel: comfyUpscaleModels.find(m => m.includes('Siax')) || comfyUpscaleModels[0] || '4x_NMKD-Siax_200k.pth',
                    comfyFluxKreaDenoise: 0.8,
                    comfyFluxKreaUpscalerSteps: 10,
                }));
            } else if (newModelType === 'face-detailer-sd1.5') {
                const sd15Model = comfyModels.find((m: string) => m.toLowerCase().includes('1.5') || m.toLowerCase().includes('15') || m.toLowerCase().includes('epicphotogasm')) || (comfyModels.length > 0 ? comfyModels[0] : '');
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'face-detailer-sd1.5',
                    comfyModel: sd15Model,
                    comfyPrompt: 'Female, young adult, dark long wavy hair, smiling, sunglasses, light-medium skin tone, green crop top, white trim, 85 on shirt, black wide-leg pants, barefoot, small earrings, bracelet, bare midriff, forearm tattoo.',
                    comfyNegativePrompt: 'embedding:easynegative, embedding:badhandv4, paintings, sketches, (worst quality:1.4, low quality, normal quality), lowres, normal quality, (monochrome), (grayscale), skin spots, acnes, skin blemishes, age spot, glans,  watermark, signature, text, bad anatomy, (six_fingers), (nail_art), nail polish, blush, fruit,',
                    comfyDetailerBboxModel: comfyBboxModels.find(m => m.includes('face_yolov8m')) || comfyBboxModels[0],
                    comfyDetailerSamModel: comfySamModels.find(m => m.includes('sam_vit_b')) || comfySamModels[0],
                    comfyDetailerSteps: 20,
                    comfyDetailerCfg: 8,
                    comfyDetailerSampler: 'euler',
                    comfyDetailerScheduler: 'normal',
                    comfyDetailerDenoise: 0.5,
                    comfyDetailerFeather: 5,
                    comfyDetailerBboxThreshold: 0.70,
                    comfyDetailerBboxDilation: 0,
                    comfyDetailerBboxCropFactor: 3.0,
                }));
            } else { // Switching back to 'sdxl'
                const sdxlModel = comfyModels.find((m: string) => m.toLowerCase().includes('sdxl'));
                setOptions(prev => ({
                    ...prev,
                    comfyModelType: 'sdxl',
                    comfyModel: sdxlModel || (comfyModels.length > 0 ? comfyModels[0] : ''),
                    comfySteps: 25, // Default for SDXL
                    comfyCfg: 5.5, // Default for SDXL
                    comfySampler: 'euler',
                    comfyScheduler: 'normal',
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
        setOptions(prev => ({ ...prev, customClothingPrompt: generateRandomClothingPrompt() }));
    };

    const handleRandomizeBackground = () => {
        setOptions(prev => ({ ...prev, customBackground: generateRandomBackgroundPrompt() }));
    };
    
    const handleRandomizeTextObject = () => {
        setOptions(prev => ({ ...prev, textObjectPrompt: getRandomTextObjectPrompt() }));
    };

    // --- Render Methods for different providers ---

    const renderGeminiOptions = () => (
      <>
        {generationMode === 't2i' ? (
            <OptionSection title="Prompt Options">
                <SelectInput
                    label="Generation Model"
                    value={options.geminiT2IModel || 'imagen-4.0-generate-001'}
                    onChange={handleOptionChange('geminiT2IModel')}
                    options={[
                        { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 (High Quality)' },
                        { value: 'gemini-2.5-flash-image-preview', label: 'Gemini Flash (Fast/Cheap)' },
                    ]}
                    disabled={isDisabled}
                />
                <TextInput
                    label="Prompt"
                    value={options.geminiPrompt || ''}
                    onChange={handleOptionChange('geminiPrompt')}
                    placeholder="e.g., A photorealistic image of an astronaut riding a horse on Mars"
                    disabled={isDisabled}
                    isTextArea
                />
            </OptionSection>
        ) : (
             <>
                {activeTab === 'image-generator' && (
                    <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-3 gap-1">
                        {(['general', 'inpaint', 'compose'] as const).map(mode => (
                             <button 
                                key={mode}
                                onClick={() => setOptions(prev => ({...prev, geminiI2iMode: mode}))} 
                                disabled={isDisabled}
                                className={`px-2 py-2 text-xs font-bold rounded-full transition-colors capitalize ${options.geminiI2iMode === mode ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                )}

                {options.geminiI2iMode === 'general' && (
                    <>
                        <OptionSection title="Pose & Composition">
                            <SelectInput
                                label="Pose Mode"
                                value={options.poseMode}
                                onChange={handleOptionChange('poseMode')}
                                options={[
                                    { value: 'random', label: 'Random Preset Poses' },
                                    { value: 'select', label: 'Select Preset Poses' },
                                    { value: 'prompt', label: 'Custom Pose Prompts' },
                                    { value: 'library', label: 'From Library' },
                                ]}
                                disabled={isDisabled}
                            />
                            {options.poseMode === 'select' && (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md">
                                    <p className="text-xs text-text-muted">Select up to {options.numImages} poses.</p>
                                    {PRESET_POSES.map(pose => (
                                        <label key={pose.value} className="flex items-center gap-2 p-2 bg-bg-tertiary rounded-md hover:bg-bg-tertiary-hover cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedPoses.includes(pose.value)}
                                                onChange={() => handlePoseSelection(pose.value)}
                                                disabled={isDisabled || (!selectedPoses.includes(pose.value) && selectedPoses.length >= options.numImages)}
                                                className="rounded text-accent focus:ring-accent"
                                            />
                                            <span className="text-sm">{pose.label}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                            {options.poseMode === 'prompt' && (
                                <div>
                                    <textarea
                                        value={options.poseSelection.join('\n')}
                                        onChange={handleCustomPoseChange}
                                        placeholder="Enter one pose prompt per line..."
                                        disabled={isDisabled}
                                        rows={4}
                                        className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    />
                                    <button
                                        onClick={handleRandomizeCustomPoses}
                                        disabled={isDisabled}
                                        className="mt-2 flex items-center gap-1.5 text-xs bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-1 px-2 rounded-lg transition-colors"
                                    >
                                        <RefreshIcon className="w-4 h-4" /> Randomize
                                    </button>
                                </div>
                            )}
                            {options.poseMode === 'library' && onOpenPosePicker && (
                                <div className="space-y-4 p-3 bg-bg-primary/50 rounded-lg border border-border-primary">
                                    <button
                                        onClick={onOpenPosePicker}
                                        disabled={isDisabled}
                                        className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                                    >
                                        <LibraryIcon className="w-5 h-5" />
                                        Select Poses ({options.poseLibraryItems?.length || 0}/{options.numImages} selected)
                                    </button>
                                    {options.poseLibraryItems && options.poseLibraryItems.length > 0 && (
                                        <div className="grid grid-cols-4 gap-2">
                                            {options.poseLibraryItems.map(item => (
                                                <div key={item.id} className="relative aspect-square">
                                                    <img src={item.thumbnail} alt={item.name} title={item.name} className="w-full h-full object-cover rounded-md" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <SelectInput
                                        label="Use Pose As"
                                        value={options.geminiPoseSource || 'mannequin'}
                                        onChange={handleOptionChange('geminiPoseSource')}
                                        options={[
                                            { value: 'mannequin', label: 'Mannequin Image' },
                                            { value: 'json', label: 'JSON Data' },
                                        ]}
                                        disabled={isDisabled}
                                    />
                                </div>
                            )}
                        </OptionSection>

                        <OptionSection title="Background">
                            <SelectInput label="Background Source" value={options.background} onChange={handleOptionChange('background')} options={BACKGROUND_OPTIONS} disabled={isDisabled} />
                            {(options.background === 'prompt' || options.background === 'random') && (
                                <div className="relative">
                                    <TextInput label="Custom Background Prompt" value={options.customBackground || ''} onChange={handleOptionChange('customBackground')} placeholder="e.g., a futuristic neon-lit city" disabled={isDisabled} />
                                    <button onClick={handleRandomizeBackground} disabled={isDisabled} className="absolute top-0 right-0 p-1 rounded-full text-text-secondary hover:bg-bg-primary" title="Randomize Prompt"><RefreshIcon className="w-4 h-4"/></button>
                                </div>
                            )}
                            {options.background === 'prompt' && (
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                        <input type="checkbox" checked={options.consistentBackground} onChange={handleOptionChange('consistentBackground')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                                        Use a Consistent Background
                                    </label>
                                    <p className="text-xs text-text-muted mt-1">Generate one background and apply it to all images. Slower first image, but faster subsequent images.</p>
                                    {options.consistentBackground && (
                                        <div className="mt-2">
                                            <button onClick={handleGenerateBgPreview} disabled={isPreviewingBg || !options.customBackground} className="flex w-full items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                                {isPreviewingBg ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
                                                {isPreviewingBg ? 'Generating...' : (previewedBackgroundImage ? 'Regenerate Preview' : 'Generate Preview')}
                                            </button>
                                            {bgPreviewError && <p className="text-xs text-danger mt-1">{bgPreviewError}</p>}
                                            {previewedBackgroundImage && (
                                                <div className="relative mt-2">
                                                    <img src={previewedBackgroundImage} alt="Background Preview" className="w-full h-auto rounded-md"/>
                                                    <button onClick={() => setPreviewedBackgroundImage(null)} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/80" title="Clear Preview"><CloseIcon className="w-4 h-4"/></button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </OptionSection>

                        <OptionSection title="Clothing">
                            <SelectInput label="Clothing Source" value={options.clothing} onChange={handleOptionChange('clothing')} options={[
                                {value: 'original', label: 'Original from Image'},
                                {value: 'image', label: 'From Reference Image'},
                                {value: 'prompt', label: 'From Custom Prompt'},
                                {value: 'random', label: 'Random from Prompt'},
                            ]} disabled={isDisabled}/>
                            {(options.clothing === 'prompt' || options.clothing === 'random') && (
                                <>
                                    <div className="relative">
                                        <TextInput label="Custom Clothing Prompt" value={options.customClothingPrompt || ''} onChange={handleOptionChange('customClothingPrompt')} placeholder="e.g., a stylish leather jacket" disabled={isDisabled}/>
                                        <button onClick={handleRandomizeClothing} disabled={isDisabled} className="absolute top-0 right-0 p-1 rounded-full text-text-secondary hover:bg-bg-primary" title="Randomize Prompt"><RefreshIcon className="w-4 h-4"/></button>
                                    </div>
                                    <SelectInput label="Style Consistency" value={options.clothingStyleConsistency || 'varied'} onChange={handleOptionChange('clothingStyleConsistency')} options={[
                                        {value: 'varied', label: 'Varied Interpretations'},
                                        {value: 'strict', label: 'Strictly Identical'},
                                    ]} disabled={isDisabled}/>
                                    <div className="mt-2">
                                        <button onClick={handleGenerateClothingPreview} disabled={isPreviewingClothing || !options.customClothingPrompt} className="flex w-full items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                            {isPreviewingClothing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
                                            {isPreviewingClothing ? 'Generating...' : (previewedClothingImage ? 'Regenerate Preview' : 'Generate Preview')}
                                        </button>
                                        {clothingPreviewError && <p className="text-xs text-danger mt-1">{clothingPreviewError}</p>}
                                        {previewedClothingImage && (
                                            <div className="relative mt-2">
                                                <img src={previewedClothingImage} alt="Clothing Preview" className="w-full h-auto rounded-md"/>
                                                <button onClick={() => setPreviewedClothingImage(null)} className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white hover:bg-black/80" title="Clear Preview"><CloseIcon className="w-4 h-4"/></button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </OptionSection>
                    </>
                )}

                {options.geminiI2iMode === 'inpaint' && (
                     <OptionSection title="Inpainting / Outpainting">
                        <ImageUploader
                            id="mask-image"
                            label="Mask Image"
                            onImageUpload={setMaskImage}
                            sourceFile={maskImage}
                            disabled={isDisabled}
                            infoText="White areas are edited, black areas are protected."
                        />
                        <SelectInput
                            label="Task"
                            value={options.geminiInpaintTask || 'remove'}
                            onChange={handleOptionChange('geminiInpaintTask')}
                            options={[
                                { value: 'remove', label: 'Remove Area' },
                                { value: 'replace', label: 'Replace with...' },
                                { value: 'changeColor', label: 'Change Color to...' },
                                { value: 'custom', label: 'Custom Prompt' },
                            ]}
                            disabled={isDisabled}
                        />
                        {(options.geminiInpaintTask === 'replace' || options.geminiInpaintTask === 'changeColor') && (
                            <TextInput
                                label={options.geminiInpaintTask === 'replace' ? "Replacement Object" : "New Color"}
                                value={options.geminiInpaintTargetPrompt || ''}
                                onChange={handleOptionChange('geminiInpaintTargetPrompt')}
                                placeholder={options.geminiInpaintTask === 'replace' ? "e.g., a blue sports car" : "e.g., bright red"}
                                disabled={isDisabled}
                            />
                        )}
                        {options.geminiInpaintTask === 'custom' && (
                            <TextInput
                                label="Custom Inpainting Prompt"
                                value={options.geminiInpaintCustomPrompt || ''}
                                onChange={handleOptionChange('geminiInpaintCustomPrompt')}
                                placeholder="e.g., add a futuristic city in the background"
                                disabled={isDisabled}
                                isTextArea
                            />
                        )}
                     </OptionSection>
                )}

                {options.geminiI2iMode === 'compose' && (
                    <OptionSection title="Image Composition">
                        <ElementImageManager
                            elementImages={elementImages}
                            setElementImages={setElementImages}
                            disabled={isDisabled}
                        />
                        <TextInput
                            label="Composition Instructions"
                            value={options.geminiComposePrompt || ''}
                            onChange={handleOptionChange('geminiComposePrompt')}
                            placeholder="Describe how to combine the images. The source image is the background..."
                            disabled={isDisabled}
                            isTextArea
                        />
                    </OptionSection>
                )}
             </>
        )}
      </>
    );

    const renderComfyUIOptions = () => {
        const modelType = options.comfyModelType || 'sdxl';

        const t2iModelOptions = [
            {value: 'sdxl', label: 'SDXL'},
            {value: 'sd1.5', label: 'SD 1.5'},
            {value: 'flux', label: 'FLUX'},
            {value: 'wan2.2', label: 'WAN 2.2'},
            {value: 'nunchaku-flux-image', label: 'Nunchaku FLUX Image'},
            {value: 'flux-krea', label: 'FLUX Krea'},
        ];

        const i2iModelOptions = [
            {value: 'nunchaku-kontext-flux', label: 'Nunchaku Kontext FLUX (i2i)'},
            {value: 'face-detailer-sd1.5', label: 'Face Detailer SD 1.5 (i2i)'},
        ];

        const renderSamplerOptions = () => (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map(s => ({value: s, label: s}))} disabled={isDisabled}/>
                <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map(s => ({value: s, label: s}))} disabled={isDisabled}/>
             </div>
        );

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
                    <SelectInput 
                        label="Workflow Type" 
                        value={modelType} 
                        onChange={handleOptionChange('comfyModelType')} 
                        options={generationMode === 'i2i' ? i2iModelOptions : t2iModelOptions} 
                        disabled={isDisabled}
                    />

                    {modelType === 'sd1.5' || modelType === 'sdxl' || modelType === 'flux' || modelType === 'face-detailer-sd1.5' ? (
                        <SelectInput label="Checkpoint Model" value={options.comfyModel || ''} onChange={handleOptionChange('comfyModel')} options={comfyModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                    ) : null}

                     <div className="space-y-2">
                        <SelectInput label="Image Style" value={options.imageStyle} onChange={handleOptionChange('imageStyle')} options={IMAGE_STYLE_OPTIONS} disabled={isDisabled} />
                        {options.imageStyle === 'photorealistic' && (
                            <>
                                <SelectInput label="Photo Style" value={options.photoStyle} onChange={handleOptionChange('photoStyle')} options={PHOTO_STYLE_OPTIONS} disabled={isDisabled} />
                                <SelectInput label="Era / Medium" value={options.eraStyle} onChange={handleOptionChange('eraStyle')} options={ERA_STYLE_OPTIONS} disabled={isDisabled} />
                            </>
                        )}
                    </div>
                    
                    <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea/>
                    {modelType !== 'nunchaku-kontext-flux' && modelType !== 'nunchaku-flux-image' && modelType !== 'flux-krea' && (
                        <TextInput label="Negative Prompt" value={options.comfyNegativePrompt || ''} onChange={handleOptionChange('comfyNegativePrompt')} disabled={isDisabled} isTextArea/>
                    )}
                </OptionSection>

                {modelType === 'face-detailer-sd1.5' && (
                    <>
                        <OptionSection title="Face Detailer Models">
                            <SelectInput label="BBOX Model" value={options.comfyDetailerBboxModel || ''} onChange={handleOptionChange('comfyDetailerBboxModel')} options={comfyBboxModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="SAM Model" value={options.comfyDetailerSamModel || ''} onChange={handleOptionChange('comfyDetailerSamModel')} options={comfySamModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                        </OptionSection>
                        <OptionSection title="Face Detailer Settings">
                            <NumberSlider label="Steps" value={options.comfyDetailerSteps || 20} onChange={handleSliderChange('comfyDetailerSteps')} min={1} max={50} step={1} disabled={isDisabled}/>
                            <NumberSlider label="CFG" value={options.comfyDetailerCfg || 8} onChange={handleSliderChange('comfyDetailerCfg')} min={1} max={20} step={0.5} disabled={isDisabled}/>
                            <NumberSlider label="Denoise" value={options.comfyDetailerDenoise || 0.5} onChange={handleSliderChange('comfyDetailerDenoise')} min={0} max={1} step={0.05} disabled={isDisabled}/>
                            <SelectInput label="Sampler" value={options.comfyDetailerSampler || ''} onChange={handleOptionChange('comfyDetailerSampler')} options={comfySamplers.map(s => ({value: s, label: s}))} disabled={isDisabled}/>
                            <SelectInput label="Scheduler" value={options.comfyDetailerScheduler || ''} onChange={handleOptionChange('comfyDetailerScheduler')} options={comfySchedulers.map(s => ({value: s, label: s}))} disabled={isDisabled}/>
                            <NumberSlider label="Mask Feathering" value={options.comfyDetailerFeather || 5} onChange={handleSliderChange('comfyDetailerFeather')} min={0} max={50} step={1} disabled={isDisabled}/>
                            <NumberSlider label="BBOX Threshold" value={options.comfyDetailerBboxThreshold || 0.70} onChange={handleSliderChange('comfyDetailerBboxThreshold')} min={0} max={1} step={0.01} disabled={isDisabled}/>
                            <NumberSlider label="BBOX Dilation" value={options.comfyDetailerBboxDilation || 0} onChange={handleSliderChange('comfyDetailerBboxDilation')} min={0} max={50} step={1} disabled={isDisabled}/>
                            <NumberSlider label="BBOX Crop Factor" value={options.comfyDetailerBboxCropFactor || 3.0} onChange={handleSliderChange('comfyDetailerBboxCropFactor')} min={1.0} max={10.0} step={0.1} disabled={isDisabled}/>
                        </OptionSection>
                    </>
                )}

                {modelType === 'wan2.2' && (
                    <>
                         <OptionSection title="WAN 2.2 Models">
                            <SelectInput label="High-Noise Unet" value={options.comfyWanHighNoiseModel || ''} onChange={handleOptionChange('comfyWanHighNoiseModel')} options={comfyGgufModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="Low-Noise Unet" value={options.comfyWanLowNoiseModel || ''} onChange={handleOptionChange('comfyWanLowNoiseModel')} options={comfyGgufModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="CLIP Model (T5)" value={options.comfyWanClipModel || ''} onChange={handleOptionChange('comfyWanClipModel')} options={[...t5GgufEncoderModels, ...t5SafetensorEncoderModels].map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="VAE Model" value={options.comfyWanVaeModel || ''} onChange={handleOptionChange('comfyWanVaeModel')} options={comfyVaes.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                        </OptionSection>
                         <OptionSection title="WAN 2.2 Sampler">
                            {renderSamplerOptions()}
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <NumberSlider label="Steps" value={options.comfySteps || 0} onChange={handleSliderChange('comfySteps')} min={4} max={12} step={1} disabled={isDisabled}/>
                                <NumberSlider label="CFG" value={options.comfyCfg || 0} onChange={handleSliderChange('comfyCfg')} min={1} max={3} step={0.1} disabled={isDisabled}/>
                                <NumberSlider label="Refiner Start Step" value={options.comfyWanRefinerStartStep || 0} onChange={handleSliderChange('comfyWanRefinerStartStep')} min={1} max={options.comfySteps ? options.comfySteps-1 : 11} step={1} disabled={isDisabled}/>
                             </div>
                        </OptionSection>
                        <OptionSection title="WAN 2.2 LoRAs">
                            <CheckboxSlider
                                label="Use FusionX LoRA"
                                isChecked={options.comfyWanUseFusionXLora || false}
                                onCheckboxChange={handleOptionChange('comfyWanUseFusionXLora')}
                                sliderValue={options.comfyWanFusionXLoraStrength || 0.8}
                                onSliderChange={handleSliderChange('comfyWanFusionXLoraStrength')}
                                min={0} max={2} step={0.1}
                                disabled={isDisabled}
                                sliderLabel="Strength"
                            />
                             {options.comfyWanUseFusionXLora && <SelectInput label="FusionX LoRA Name" value={options.comfyWanFusionXLoraName || ''} onChange={handleOptionChange('comfyWanFusionXLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}
                            <CheckboxSlider
                                label="Use Lightning LoRA"
                                isChecked={options.comfyWanUseLightningLora || false}
                                onCheckboxChange={handleOptionChange('comfyWanUseLightningLora')}
                                sliderValue={options.comfyWanLightningLoraStrength || 0.6}
                                onSliderChange={handleSliderChange('comfyWanLightningLoraStrength')}
                                min={0} max={2} step={0.1}
                                disabled={isDisabled}
                                sliderLabel="Strength"
                            />
                            {options.comfyWanUseLightningLora && (
                                <>
                                    <SelectInput label="High-Noise Lightning LoRA" value={options.comfyWanLightningLoraNameHigh || ''} onChange={handleOptionChange('comfyWanLightningLoraNameHigh')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>
                                    <SelectInput label="Low-Noise Lightning LoRA" value={options.comfyWanLightningLoraNameLow || ''} onChange={handleOptionChange('comfyWanLightningLoraNameLow')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>
                                </>
                            )}
                             <CheckboxSlider
                                label="Use Stock Photography LoRA"
                                isChecked={options.comfyWanUseStockPhotoLora || false}
                                onCheckboxChange={handleOptionChange('comfyWanUseStockPhotoLora')}
                                sliderValue={options.comfyWanStockPhotoLoraStrength || 1.5}
                                onSliderChange={handleSliderChange('comfyWanStockPhotoLoraStrength')}
                                min={0} max={3} step={0.1}
                                disabled={isDisabled}
                                sliderLabel="Strength"
                            />
                            {options.comfyWanUseStockPhotoLora && (
                                <>
                                    <SelectInput label="High-Noise Stock LoRA" value={options.comfyWanStockPhotoLoraNameHigh || ''} onChange={handleOptionChange('comfyWanStockPhotoLoraNameHigh')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>
                                    <SelectInput label="Low-Noise Stock LoRA" value={options.comfyWanStockPhotoLoraNameLow || ''} onChange={handleOptionChange('comfyWanStockPhotoLoraNameLow')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>
                                </>
                            )}
                        </OptionSection>
                    </>
                )}
                
                {modelType === 'nunchaku-kontext-flux' || modelType === 'nunchaku-flux-image' ? (
                     <>
                        <OptionSection title="Nunchaku Models">
                            <SelectInput label="DiT Model" value={options.comfyNunchakuModel || ''} onChange={handleOptionChange('comfyNunchakuModel')} options={nunchakuModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                             <SelectInput label="CLIP L Model" value={options.comfyNunchakuClipL || ''} onChange={handleOptionChange('comfyNunchakuClipL')} options={comfyClips.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                             <SelectInput label="T5 XXL Model" value={options.comfyNunchakuT5XXL || ''} onChange={handleOptionChange('comfyNunchakuT5XXL')} options={t5SafetensorEncoderModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                             <SelectInput label="VAE Model" value={options.comfyNunchakuVae || ''} onChange={handleOptionChange('comfyNunchakuVae')} options={comfyVaes.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                        </OptionSection>
                         <OptionSection title="Nunchaku Sampler">
                            {renderSamplerOptions()}
                             <NumberSlider label="Steps" value={options.comfySteps || 10} onChange={handleSliderChange('comfySteps')} min={4} max={20} step={1} disabled={isDisabled}/>
                             {modelType === 'nunchaku-kontext-flux' && <NumberSlider label="CFG" value={options.comfyCfg || 1} onChange={handleSliderChange('comfyCfg')} min={1} max={3} step={0.1} disabled={isDisabled}/>}
                             <NumberSlider label="FLUX Guidance" value={options.comfyFluxGuidanceKontext || 2.5} onChange={handleSliderChange('comfyFluxGuidanceKontext')} min={1} max={10} step={0.1} disabled={isDisabled}/>
                             {modelType === 'nunchaku-flux-image' && (
                                <>
                                    <NumberSlider label="Base Shift" value={options.comfyNunchakuBaseShift || 1.0} onChange={handleSliderChange('comfyNunchakuBaseShift')} min={0} max={2} step={0.05} disabled={isDisabled}/>
                                    <NumberSlider label="Max Shift" value={options.comfyNunchakuMaxShift || 1.15} onChange={handleSliderChange('comfyNunchakuMaxShift')} min={0} max={2} step={0.05} disabled={isDisabled}/>
                                </>
                             )}
                        </OptionSection>
                        <OptionSection title="Nunchaku LoRAs & Settings">
                              <CheckboxSlider
                                label="Use Turbo LoRA" isChecked={options.comfyNunchakuUseTurboLora || false} onCheckboxChange={handleOptionChange('comfyNunchakuUseTurboLora')}
                                sliderValue={options.comfyNunchakuTurboLoraStrength || 1} onSliderChange={handleSliderChange('comfyNunchakuTurboLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.comfyNunchakuUseTurboLora && <SelectInput label="Turbo LoRA Name" value={options.comfyNunchakuTurboLoraName || ''} onChange={handleOptionChange('comfyNunchakuTurboLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}
                            
                            <CheckboxSlider
                                label="Use Nudify LoRA" isChecked={options.comfyNunchakuUseNudifyLora || false} onCheckboxChange={handleOptionChange('comfyNunchakuUseNudifyLora')}
                                sliderValue={options.comfyNunchakuNudifyLoraStrength || 1} onSliderChange={handleSliderChange('comfyNunchakuNudifyLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.comfyNunchakuUseNudifyLora && <SelectInput label="Nudify LoRA Name" value={options.comfyNunchakuNudifyLoraName || ''} onChange={handleOptionChange('comfyNunchakuNudifyLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}

                            <CheckboxSlider
                                label="Use Detail LoRA" isChecked={options.comfyNunchakuUseDetailLora || false} onCheckboxChange={handleOptionChange('comfyNunchakuUseDetailLora')}
                                sliderValue={options.comfyNunchakuDetailLoraStrength || 1} onSliderChange={handleSliderChange('comfyNunchakuDetailLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.comfyNunchakuUseDetailLora && <SelectInput label="Detail LoRA Name" value={options.comfyNunchakuDetailLoraName || ''} onChange={handleOptionChange('comfyNunchakuDetailLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}

                            <hr className="border-border-primary my-4" />
                            <NumberSlider label="Cache Threshold" value={options.comfyNunchakuCacheThreshold ?? (options.comfyModelType === 'nunchaku-flux-image' ? 0 : 0.12)} onChange={handleSliderChange('comfyNunchakuCacheThreshold')} min={0} max={1} step={0.01} disabled={isDisabled}/>
                            <SelectInput label="CPU Offload" value={options.comfyNunchakuCpuOffload || 'enable'} onChange={handleOptionChange('comfyNunchakuCpuOffload')} options={[{value:'auto',label:'Auto'},{value:'enable',label:'Enable'},{value:'disable',label:'Disable'}]} disabled={isDisabled}/>
                            <SelectInput label="Attention" value={options.comfyNunchakuAttention || 'nunchaku-fp16'} onChange={handleOptionChange('comfyNunchakuAttention')} options={nunchakuAttentions.map(a => ({value: a, label: a}))} disabled={isDisabled}/>
                        </OptionSection>
                    </>
                ) : null}

                {modelType === 'flux-krea' && (
                     <>
                        <OptionSection title="FLUX Krea Models">
                            <SelectInput label="Unet GGUF" value={options.comfyFluxKreaModel || ''} onChange={handleOptionChange('comfyFluxKreaModel')} options={comfyGgufModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="CLIP T5 GGUF" value={options.comfyFluxKreaClipT5 || ''} onChange={handleOptionChange('comfyFluxKreaClipT5')} options={t5GgufEncoderModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="CLIP L" value={options.comfyFluxKreaClipL || ''} onChange={handleOptionChange('comfyFluxKreaClipL')} options={comfyClips.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                            <SelectInput label="VAE" value={options.comfyFluxKreaVae || ''} onChange={handleOptionChange('comfyFluxKreaVae')} options={comfyVaes.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                        </OptionSection>
                        <OptionSection title="FLUX Krea Sampler">
                            {renderSamplerOptions()}
                             <NumberSlider label="Steps" value={options.comfySteps || 20} onChange={handleSliderChange('comfySteps')} min={4} max={30} step={1} disabled={isDisabled}/>
                             <NumberSlider label="FLUX Guidance" value={options.comfyFluxGuidance || 3.5} onChange={handleSliderChange('comfyFluxGuidance')} min={0} max={10} step={0.1} disabled={isDisabled}/>
                        </OptionSection>
                        <OptionSection title="FLUX Krea LoRAs">
                              <CheckboxSlider
                                label="Use p1x4r0ma Woman LoRA" isChecked={options.useP1x4r0maWomanLora || false} onCheckboxChange={handleOptionChange('useP1x4r0maWomanLora')}
                                sliderValue={options.p1x4r0maWomanLoraStrength || 0.9} onSliderChange={handleSliderChange('p1x4r0maWomanLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.useP1x4r0maWomanLora && <SelectInput label="p1x4r0ma LoRA Name" value={options.p1x4r0maWomanLoraName || ''} onChange={handleOptionChange('p1x4r0maWomanLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}
                            
                            <CheckboxSlider
                                label="Use Nipple Diffusion LoRA" isChecked={options.useNippleDiffusionLora || false} onCheckboxChange={handleOptionChange('useNippleDiffusionLora')}
                                sliderValue={options.nippleDiffusionLoraStrength || 1} onSliderChange={handleSliderChange('nippleDiffusionLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.useNippleDiffusionLora && <SelectInput label="Nipple Diffusion LoRA Name" value={options.nippleDiffusionLoraName || ''} onChange={handleOptionChange('nippleDiffusionLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}

                             <CheckboxSlider
                                label="Use Pussy Diffusion LoRA" isChecked={options.usePussyDiffusionLora || false} onCheckboxChange={handleOptionChange('usePussyDiffusionLora')}
                                sliderValue={options.pussyDiffusionLoraStrength || 1} onSliderChange={handleSliderChange('pussyDiffusionLoraStrength')}
                                min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                            />
                            {options.usePussyDiffusionLora && <SelectInput label="Pussy Diffusion LoRA Name" value={options.pussyDiffusionLoraName || ''} onChange={handleOptionChange('pussyDiffusionLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}
                        </OptionSection>
                        <OptionSection title="FLUX Krea Upscaler">
                             <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                <input type="checkbox" checked={options.comfyFluxKreaUseUpscaler} onChange={handleOptionChange('comfyFluxKreaUseUpscaler')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                                Use Upscaler
                            </label>
                            {options.comfyFluxKreaUseUpscaler && (
                                <div className="space-y-4 pl-4 border-l-2 border-border-primary">
                                    <SelectInput label="Upscale Model" value={options.comfyFluxKreaUpscaleModel || ''} onChange={handleOptionChange('comfyFluxKreaUpscaleModel')} options={comfyUpscaleModels.map(m => ({value: m, label: m}))} disabled={isDisabled}/>
                                    <NumberSlider label="Upscaler Steps" value={options.comfyFluxKreaUpscalerSteps || 10} onChange={handleSliderChange('comfyFluxKreaUpscalerSteps')} min={4} max={20} step={1} disabled={isDisabled}/>
                                    <NumberSlider label="Denoise" value={options.comfyFluxKreaDenoise || 0.8} onChange={handleSliderChange('comfyFluxKreaDenoise')} min={0.1} max={1} step={0.05} disabled={isDisabled}/>
                                </div>
                            )}
                        </OptionSection>
                     </>
                )}

                {(modelType === 'sd1.5' || modelType === 'sdxl' || modelType === 'flux') && (
                    <OptionSection title="Sampler">
                        {renderSamplerOptions()}
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <NumberSlider label="Steps" value={options.comfySteps || 0} onChange={handleSliderChange('comfySteps')} min={1} max={100} step={1} disabled={isDisabled}/>
                            <NumberSlider label="CFG" value={options.comfyCfg || 0} onChange={handleSliderChange('comfyCfg')} min={1} max={20} step={0.5} disabled={isDisabled}/>
                         </div>
                         {modelType === 'flux' && <NumberSlider label="FLUX Guidance" value={options.comfyFluxGuidance || 3.5} onChange={handleSliderChange('comfyFluxGuidance')} min={0} max={10} step={0.1} disabled={isDisabled}/>}
                    </OptionSection>
                )}
                
                {modelType === 'sd1.5' && (
                    <OptionSection title="Seed Control">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Seed</label>
                                <input
                                    type="number"
                                    value={options.comfySeed ?? ''}
                                    onChange={(e) => setOptions(prev => ({ ...prev, comfySeed: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                                    placeholder="Random"
                                    className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    disabled={isDisabled}
                                />
                            </div>
                            <SelectInput
                                label="After Generate"
                                value={options.comfySeedControl || 'randomize'}
                                onChange={handleOptionChange('comfySeedControl')}
                                options={[
                                    { value: 'randomize', label: 'Randomize' },
                                    { value: 'fixed', label: 'Fixed' },
                                    { value: 'increment', label: 'Increment' },
                                    { value: 'decrement', label: 'Decrement' },
                                ]}
                                disabled={isDisabled}
                            />
                        </div>
                        {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && (
                             <div>
                                <label className="block text-sm font-medium text-text-secondary">Step Value</label>
                                <input
                                    type="number"
                                    value={options.comfySeedIncrement ?? 1}
                                    onChange={(e) => setOptions(prev => ({ ...prev, comfySeedIncrement: parseInt(e.target.value, 10) || 1 }))}
                                    min="1"
                                    className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    disabled={isDisabled}
                                />
                            </div>
                        )}
                    </OptionSection>
                )}

                 {modelType === 'sdxl' && (
                    <OptionSection title="SDXL LoRA">
                        <CheckboxSlider
                            label="Use LoRA" isChecked={options.comfySdxlUseLora || false} onCheckboxChange={handleOptionChange('comfySdxlUseLora')}
                            sliderValue={options.comfySdxlLoraStrength || 0.8} onSliderChange={handleSliderChange('comfySdxlLoraStrength')}
                            min={0} max={2} step={0.1} disabled={isDisabled} sliderLabel="Strength"
                        />
                        {options.comfySdxlUseLora && <SelectInput label="LoRA Name" value={options.comfySdxlLoraName || ''} onChange={handleOptionChange('comfySdxlLoraName')} options={comfyLoras.map(l => ({value: l, label: l}))} disabled={isDisabled}/>}
                    </OptionSection>
                )}
            </>
        )
    };
  
  return (
    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4 text-accent">{title}</h2>
        {!hideGenerationModeSwitch && (
             <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1 mb-4">
                <button 
                    onClick={() => handleGenerationModeChange('t2i')} 
                    disabled={isDisabled}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${generationMode === 't2i' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                >
                    Text-to-Image
                </button>
                <button 
                    onClick={() => handleGenerationModeChange('i2i')} 
                    disabled={isDisabled}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${generationMode === 'i2i' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                >
                    Image-to-Image
                </button>
            </div>
        )}
        {!hideProviderSwitch && (
            <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1">
                <button 
                    onClick={() => setOptions(prev => ({...prev, provider: 'gemini'}))} 
                    disabled={isDisabled}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                >
                    Gemini
                </button>
                <button 
                    onClick={() => setOptions(prev => ({...prev, provider: 'comfyui'}))} 
                    disabled={isDisabled || !comfyUIUrl}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors disabled:opacity-50 ${options.provider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}
                >
                    ComfyUI
                </button>
            </div>
        )}
      </div>
      
      <OptionSection title="General Settings">
        <NumberSlider
            label="Number of Images"
            value={options.numImages}
            onChange={handleSliderChange('numImages')}
            min={1}
            max={MAX_IMAGES}
            step={1}
            disabled={isDisabled}
        />
        {(options.provider === 'gemini' || (options.provider === 'comfyui' && ['sd1.5', 'sdxl', 'flux', 'wan2.2', 'nunchaku-kontext-flux', 'nunchaku-flux-image', 'flux-krea', 'face-detailer-sd1.5'].includes(options.comfyModelType || ''))) && (
            <SelectInput
                label="Aspect Ratio"
                value={options.aspectRatio}
                onChange={handleOptionChange('aspectRatio')}
                options={ASPECT_RATIO_OPTIONS}
                disabled={isDisabled || (options.provider === 'gemini' && options.geminiMode === 't2i' && options.geminiT2IModel === 'gemini-2.5-flash-image-preview')}
            />
        )}
      </OptionSection>

      {options.provider === 'gemini' ? renderGeminiOptions() : renderComfyUIOptions()}

      <OptionSection title="Actions">
        <div className="grid grid-cols-2 gap-4">
            <button onClick={onReset} disabled={isDisabled} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                <ResetIcon className="w-5 h-5"/> Reset
            </button>
            <button onClick={onGenerate} disabled={!isReady} style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                <GenerateIcon className="w-5 h-5"/> Generate
            </button>
        </div>
        {options.provider === 'comfyui' && 
             <button onClick={onExportWorkflow} disabled={isDisabled} className="w-full mt-2 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                <WorkflowIcon className="w-5 h-5"/> Export ComfyUI Workflow (.json)
            </button>
        }
      </OptionSection>

    </div>
  );
};