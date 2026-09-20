
import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { ComfyModelType, GenerationSliceState, GenerationOptions } from '../types';
import type { RootState } from './store';
import { getEnabledCharacterAngles } from '../services/characterAnglesWorkflow';

const KREA_TURBO_LORA_FIELDS = [
  'comfyKreaLora1Name',
  'comfyKreaLora2Name',
  'comfyKreaLora3Name',
  'comfyKreaLora4Name',
  'comfyKreaLora5Name',
  'comfyKreaLora6Name',
] as const;

const initialOptions: GenerationOptions = {
  provider: 'comfyui',
  numImages: 1,
  poseMode: 'random',
  poseSelection: [],
  poseLibraryItems: [],
  geminiPoseSource: 'mannequin',
  background: 'original',
  clothing: 'original',
  aspectRatio: '3:4',
  imageStyle: 'photorealistic',
  photoStyle: 'professional photoshoot',
  eraStyle: 'a modern digital photograph',
  geminiMode: 't2i',
  mammouthImageModel: 'gemini-3.1-flash-image-preview',
  geminiI2iMode: 'general',
  geminiGeneralEditPrompt: '',
  geminiInpaintTask: 'remove',
  geminiInpaintCustomPrompt: '',
  geminiInpaintTargetPrompt: '',
  geminiComposePrompt: '',
  comfyModelType: 'krea2-simple',
  comfyPrompt: '',
  comfyNegativePrompt: 'blurry, bad quality, low-res, ugly, deformed, disfigured',
  comfySteps: 10,
  comfyCfg: 1,
  comfySampler: 'er_sde',
  comfyScheduler: 'beta',

  // FLUX2 multi-reference edit defaults
  comfyFlux2EditPrompt: '',
  comfyFlux2EditUnet: 'flux-2-klein-4b-Q4_K_M.gguf',
  comfyFlux2EditClip: 'qwen_3_4b.safetensors',
  comfyFlux2EditVae: 'flux2-vae.safetensors',
  comfyFlux2EditSteps: 4,
  comfyFlux2EditCfg: 1,
  comfyFlux2EditSampler: 'euler',
  comfyFlux2EditMegapixels: 1,
  comfyFlux2EditReferenceRoles: ['outfit', 'background', 'pose'],
  comfyFlux2EditReferenceDescriptions: ['', '', ''],
  comfyFlux2EditReferenceLibraryPrompts: ['', '', ''],
  comfyFlux2EditUseCacheDit: false,
  comfyFlux2EditCacheDitModelType: 'Auto',
  comfyFlux2EditCacheDitWarmupSteps: 0,
  comfyFlux2EditCacheDitSkipInterval: 0,

  // KREA2 Simple defaults
  comfyKreaPrompt: '',
  comfyKreaNegativePrompt: '',
  comfyKreaUnet: 'krea2_raw_fp8_scaled.safetensors',
  comfyKreaClip: 'qwen3vl_4b_fp8_scaled.safetensors',
  comfyKreaVae: 'qwen_image_vae.safetensors',
  comfyKreaResolution: '832x1216',
  comfyKreaUseLora: true,
  comfyKreaLora1Name: 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors',
  comfyKreaLora1Strength: 0.6,
  comfyKreaLora2Name: 'KREA\\snofs_krea_v1_nostrip.safetensors',
  comfyKreaLora2Strength: 1,
  comfyKreaLora3Name: '',
  comfyKreaLora3Strength: 1,
  comfyKreaLora4Name: '',
  comfyKreaLora4Strength: 1,
  comfyKreaLora5Name: '',
  comfyKreaLora5Strength: 1,
  comfyKreaLora6Name: '',
  comfyKreaLora6Strength: 1,

  // Z-Image CacheDiT defaults
  comfyZImageUseCacheDit: true,
  comfyZImageCacheDitModelType: 'Auto',
  comfyZImageCacheDitWarmupSteps: 3,
  comfyZImageCacheDitSkipInterval: 2,
  comfyZImageCacheDitPrintSummary: true,

  // Refine Feature Defaults
  useRefine: false,
  refineDenoise: 0.5,
  refineMegapixels: 0.5,

  // Qwen t2i GGUF defaults
  comfyQwenUnet: 'qwen-image-Q6_K.gguf',
  comfyQwenClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  comfyQwenVae: 'qwen_image_vae.safetensors',
  comfyQwenShift: 2.5,
  comfyQwenUseLora: true,
  comfyQwenLora1Name: 'QWEN\\Qwen-Image-Lightning-4steps-V2.0.safetensors',
  comfyQwenLora1Strength: 1.0,
  comfyQwenLora2Name: '',
  comfyQwenLora2Strength: 1.0,
  comfyQwenLora3Name: '',
  comfyQwenLora3Strength: 1.0,
  comfyQwenLora4Name: '',
  comfyQwenLora4Strength: 1.0,

  // Qwen Image Edit defaults
  comfyQwenEditUnet: 'qwen_image_edit_2509_fp8_e4m3fn.safetensors',
  comfyQwenEditClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  comfyQwenEditVae: 'qwen_image_vae.safetensors',
  comfyQwenEditShift: 2.5,
  comfyQwenEditMegapixels: 1,
  comfyQwenEditUseLora: true,
  comfyQwenEditLora1Name: 'QWEN\\Qwen-Image-Lightning-8steps-V2.0.safetensors',
  comfyQwenEditLora1Strength: 1,
  comfyQwenEditLora2Name: '',
  comfyQwenEditLora2Strength: 1,
  comfyQwenEditLora3Name: '',
  comfyQwenEditLora3Strength: 1,
  comfyQwenEditLora4Name: '',
  comfyQwenEditLora4Strength: 1,
  comfyQwenEditLora5Name: '',
  comfyQwenEditLora5Strength: 1,

  // Video Generation
  videoProvider: 'comfyui',

  // ComfyUI Video Defaults (I2V)
  comfyVidModelType: 'wan-i2v',
  comfyVidWanI2VPositivePrompt: 'cinematic shot of a majestic lion walking through the savanna',
  comfyVidWanI2VNegativePrompt: 'blurry, bad quality, low-res, ugly, deformed, disfigured, text, watermark',
  comfyVidWanI2VSteps: 6,
  comfyVidWanI2VCfg: 1,
  comfyVidWanI2VSampler: 'euler',
  comfyVidWanI2VScheduler: 'simple',
  comfyVidWanI2VFrameCount: 65,
  comfyVidWanI2VRefinerStartStep: 3,
  comfyVidWanI2VUseLightningLora: true,
  comfyVidWanI2VHighNoiseLoraStrength: 2.0,
  comfyVidWanI2VLowNoiseLoraStrength: 1.0,
  comfyVidWanI2VUseFilmGrain: true,
  comfyVidWanI2VFilmGrainIntensity: 0.02,
  comfyVidWanI2VFilmGrainSize: 0.3, // Saturation Mix
  comfyVidWanI2VFrameRate: 24,
  comfyVidWanI2VVideoFormat: 'video/nvenc_h264-mp4',
  comfyVidWanI2VUseEndFrame: false,
  comfyVidWanI2VNoiseSeed: undefined,
  comfyVidWanI2VSeedControl: 'randomize',

  // ComfyUI Video Defaults (T2V)
  comfyVidWanT2VHighNoiseModel: 'Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf',
  comfyVidWanT2VLowNoiseModel: 'Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf',
  comfyVidWanT2VClipModel: 'umt5-xxl-encoder-Q5_K_M.gguf',
  comfyVidWanT2VVaeModel: 'wan_2.1_vae.safetensors',
  comfyVidWanT2VPositivePrompt: 'A confident woman with red hair in a vibrant patterned dress against a plain green background., at sunrise with golden light, a steady tracking shot, the camera moves alongside the subject',
  comfyVidWanT2VNegativePrompt: 'blurry, low quality, pixelated, distorted, out of frame, cropped, watermark, text, bad anatomy, disfigured, mutated, extra limbs, extra arms, extra legs, extra fingers, fused fingers, deformed hands, disconnected limbs, broken body, twisted posture, bad face, deformed face, asymmetrical face, mutated eyes, long neck, short limbs, unnatural body, flickering, jitter, duplicated body, ghosting, static pose, unnatural movement, stiff animation, camera shake, distorted perspective, ugly, poorly drawn, cartoon, 3d render, cgi',
  comfyVidWanT2VWidth: 856,
  comfyVidWanT2VHeight: 480,
  comfyVidWanT2VFrameCount: 57,
  comfyVidWanT2VSteps: 6,
  comfyVidWanT2VCfg: 1,
  comfyVidWanT2VSampler: 'euler',
  comfyVidWanT2VScheduler: 'simple',
  comfyVidWanT2VRefinerStartStep: 3,
  comfyVidWanT2VNoiseSeed: undefined,
  comfyVidWanT2VSeedControl: 'randomize',
  comfyVidWanT2VUseLightningLora: true,
  comfyVidWanT2VLightningLoraHigh: 'Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors',
  comfyVidWanT2VLightningLoraStrengthHigh: 2.0,
  comfyVidWanT2VLightningLoraLow: 'Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors',
  comfyVidWanT2VLightningLoraStrengthLow: 1.0,
  comfyVidWanT2VUseOptionalLora: false,
  comfyVidWanT2VOptionalLoraName: '',
  comfyVidWanT2VOptionalLoraStrength: 1.0,
  comfyVidWanT2VUseFilmGrain: true,
  comfyVidWanT2VFilmGrainIntensity: 0.02,
  comfyVidWanT2VFilmGrainSaturation: 0.3,
  comfyVidWanT2VFrameRate: 24,
  comfyVidWanT2VVideoFormat: 'video/nvenc_h264-mp4',
};

const initialCharacterOptions: GenerationOptions = {
  ...initialOptions,
  provider: 'comfyui',
  geminiMode: 'i2i',
  geminiI2iMode: 'character',
  comfyCharacterMode: 'qwen',
  comfyCharacterFlux2Unet: 'flux-2-klein-4b-Q4_K_M.gguf',
  comfyCharacterFlux2Clip: 'qwen_3_4b.safetensors',
  comfyCharacterFlux2Vae: 'flux2-vae.safetensors',
  comfyCharacterFlux2Steps: 4,
  comfyCharacterFlux2Cfg: 1,
  comfyCharacterFlux2Sampler: 'euler',
  comfyCharacterFlux2Megapixels: 1,
  comfyCharacterFlux2UseLoras: false,
  comfyCharacterFlux2Lora1Name: '',
  comfyCharacterFlux2Lora1Strength: 1,
  comfyCharacterFlux2Lora2Name: '',
  comfyCharacterFlux2Lora2Strength: 1,
  comfyCharacterFlux2UseCacheDit: false,
  comfyCharacterFlux2CacheDitModelType: 'Auto',
  comfyCharacterFlux2CacheDitWarmupSteps: 3,
  comfyCharacterFlux2CacheDitSkipInterval: 2,
  comfyCharacterFlux2CacheDitPrintSummary: true,
  comfyCharacterUnet: 'qwen_image_edit_2509_fp8_e4m3fn.safetensors',
  comfyCharacterClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  comfyCharacterVae: 'qwen_image_vae.safetensors',
  comfyCharacterLightningLora: 'QWEN\\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors',
  comfyCharacterLightningStrength: 1,
  comfyCharacterAnglesLora: 'QWEN\\Qwen-Edit-2509-Multiple-angles.safetensors',
  comfyCharacterAnglesStrength: 1,
  comfyCharacterUseAdditionalLora: false,
  comfyCharacterAdditionalLora: '',
  comfyCharacterAdditionalLoraStrength: 1,
  comfyCharacterSteps: 4,
  comfyCharacterCfg: 1,
  comfyCharacterSampler: 'euler',
  comfyCharacterScheduler: 'simple',
  comfyCharacterShift: 3,
  comfyCharacterMegapixels: 1,
};

const initialState: GenerationSliceState = {
  sourceImage: null,
  generationMode: 't2i',
  characterName: '',
  shouldGenerateCharacterName: false,
  clothingImage: null,
  backgroundImage: null,
  characterPoseImage: null,
  previewedBackgroundImage: null,
  previewedClothingImage: null,
  maskImage: null,
  elementImages: [],
  options: initialOptions,
  comfyOptionsByModel: {},
  comfyDefaultOptionsByModel: {
    'krea2-simple': { ...initialOptions },
  },
  characterOptions: initialCharacterOptions,
  isLoading: false,
  progressMessage: '',
  progressValue: 0,
  generatedContent: {
    'image-generator': { images: [], lastUsedPrompt: null },
    'character-generator': { images: [], lastUsedPrompt: null },
  },
};

const generationSlice = createSlice({
  name: 'generation',
  initialState,
  reducers: {
    setSourceImage: (state, action: PayloadAction<File | null>) => {
      state.sourceImage = action.payload;
    },
    setGenerationMode: (state, action: PayloadAction<'t2i' | 'i2i'>) => {
      state.generationMode = action.payload;
    },
    setCharacterName: (state, action: PayloadAction<string>) => {
      state.characterName = action.payload;
    },
    setShouldGenerateCharacterName: (state, action: PayloadAction<boolean>) => {
      state.shouldGenerateCharacterName = action.payload;
    },
    setClothingImage: (state, action: PayloadAction<File | null>) => {
      state.clothingImage = action.payload;
    },
    setBackgroundImage: (state, action: PayloadAction<File | null>) => {
      state.backgroundImage = action.payload;
    },
    setCharacterPoseImage: (state, action: PayloadAction<File | null>) => {
      state.characterPoseImage = action.payload;
    },
    setPreviewedBackgroundImage: (state, action: PayloadAction<string | null>) => {
      state.previewedBackgroundImage = action.payload;
    },
    setPreviewedClothingImage: (state, action: PayloadAction<string | null>) => {
      state.previewedClothingImage = action.payload;
    },
    setMaskImage: (state, action: PayloadAction<File | null>) => {
      state.maskImage = action.payload;
    },
    setElementImages: (state, action: PayloadAction<File[]>) => {
      state.elementImages = action.payload;
    },
    setOptions: (state, action: PayloadAction<GenerationOptions>) => {
      state.options = action.payload;
    },
    updateOptions: (state, action: PayloadAction<Partial<GenerationOptions>>) => {
      state.options = { ...state.options, ...action.payload };
      if (action.payload.comfyKreaUnet && /krea2[_ .-]?turbo/i.test(action.payload.comfyKreaUnet)) {
        for (const field of KREA_TURBO_LORA_FIELDS) {
          if (/krea2[_ .-]?turbo/i.test(state.options[field] || '')) state.options[field] = '';
        }
      }
    },
    switchComfyModelOptions: (state, action: PayloadAction<Partial<GenerationOptions> & { comfyModelType: ComfyModelType }>) => {
      const currentModelType = state.options.comfyModelType;
      if (currentModelType) {
        state.comfyOptionsByModel[currentModelType] = { ...state.options };
      }

      const sharedPrompts = {
        comfyPrompt: state.options.comfyPrompt,
        comfyNegativePrompt: state.options.comfyNegativePrompt,
      };
      const savedOptions = state.comfyOptionsByModel[action.payload.comfyModelType];
      const nextOptions: GenerationOptions = savedOptions
        ? { ...savedOptions, ...sharedPrompts, ...action.payload, provider: 'comfyui', comfyModelType: action.payload.comfyModelType }
        : { ...state.options, ...sharedPrompts, ...action.payload, provider: 'comfyui' };
      if (!savedOptions && (action.payload.comfyModelType === 'krea2-simple' || action.payload.comfyModelType === 'krea2-raw')) {
        nextOptions.comfyKreaPrompt = action.payload.comfyKreaPrompt ?? action.payload.comfyPrompt ?? state.options.comfyPrompt ?? '';
        nextOptions.comfyKreaNegativePrompt = action.payload.comfyKreaNegativePrompt ?? action.payload.comfyNegativePrompt ?? state.options.comfyNegativePrompt ?? '';
      } else if (!savedOptions && action.payload.comfyModelType === 'flux2-simple') {
        nextOptions.comfyFlux2Prompt = action.payload.comfyFlux2Prompt ?? action.payload.comfyPrompt ?? state.options.comfyPrompt ?? '';
        nextOptions.comfyFlux2NegativePrompt = action.payload.comfyFlux2NegativePrompt ?? action.payload.comfyNegativePrompt ?? state.options.comfyNegativePrompt ?? '';
      }
      if (action.payload.comfyModelType === 'qwen-t2i-gguf') {
        nextOptions.comfySteps = 4;
        nextOptions.comfyCfg = 1;
      } else if (action.payload.comfyModelType === 'flux2-simple') {
        nextOptions.comfyFlux2Clip = 'qwen3vl_4b_fp8_scaled.safetensors';
        nextOptions.comfyFlux2Vae = 'flux2-vae.safetensors';
        if (!savedOptions) {
          nextOptions.comfySteps = action.payload.comfySteps ?? 10;
          nextOptions.comfyCfg = action.payload.comfyCfg ?? 1;
          nextOptions.comfySampler = action.payload.comfySampler ?? 'euler';
        }
      } else if (action.payload.comfyModelType === 'flux2-edit') {
        nextOptions.comfyFlux2EditUnet = action.payload.comfyFlux2EditUnet ?? 'flux-2-klein-4b-Q4_K_M.gguf';
        nextOptions.comfyFlux2EditClip = action.payload.comfyFlux2EditClip ?? 'qwen_3_4b.safetensors';
        nextOptions.comfyFlux2EditVae = action.payload.comfyFlux2EditVae ?? 'flux2-vae.safetensors';
        nextOptions.comfyFlux2EditReferenceRoles = action.payload.comfyFlux2EditReferenceRoles ?? ['outfit', 'background', 'pose'];
        nextOptions.comfyFlux2EditReferenceDescriptions = action.payload.comfyFlux2EditReferenceDescriptions ?? ['', '', ''];
        nextOptions.comfyFlux2EditReferenceLibraryPrompts = action.payload.comfyFlux2EditReferenceLibraryPrompts ?? ['', '', ''];
      } else if (action.payload.comfyModelType === 'krea2-simple') {
        nextOptions.comfyKreaUnet = action.payload.comfyKreaUnet ?? 'krea2_raw_fp8_scaled.safetensors';
        nextOptions.comfyKreaClip = 'qwen3vl_4b_fp8_scaled.safetensors';
        nextOptions.comfyKreaVae = 'qwen_image_vae.safetensors';
      } else if (action.payload.comfyModelType === 'krea2-raw') {
        nextOptions.comfyKreaUnet = 'krea2_raw_fp8_scaled.safetensors';
        nextOptions.comfyKreaClip = 'qwen3vl_4b_fp8_scaled.safetensors';
        nextOptions.comfyKreaVae = 'Wan2.1_VAE.safetensors';
      }
      state.options = nextOptions;
      if (!state.comfyDefaultOptionsByModel[action.payload.comfyModelType]) {
        state.comfyDefaultOptionsByModel[action.payload.comfyModelType] = { ...nextOptions };
      }
    },
    setCharacterOptions: (state, action: PayloadAction<GenerationOptions>) => {
      state.characterOptions = action.payload;
    },
    updateCharacterOptions: (state, action: PayloadAction<Partial<GenerationOptions>>) => {
      state.characterOptions = { ...state.characterOptions, ...action.payload };
    },
    setLoadingState: (state, action: PayloadAction<{ isLoading: boolean; message?: string; value?: number }>) => {
      state.isLoading = action.payload.isLoading;
      state.progressMessage = action.payload.message ?? (action.payload.isLoading ? 'Initializing...' : '');
      state.progressValue = action.payload.value ?? (action.payload.isLoading ? 0 : 1);
    },
    updateProgress: (state, action: PayloadAction<{ message: string, value: number }>) => {
      state.progressMessage = action.payload.message;
      state.progressValue = action.payload.value;
    },
    setGeneratedImages: (state, action: PayloadAction<{ tabId: string; images: { src: string, seed?: number, usageMetadata?: any }[] }>) => {
      const { tabId, images } = action.payload;
      if (!state.generatedContent[tabId]) {
        state.generatedContent[tabId] = { images: [], lastUsedPrompt: null };
      }
      state.generatedContent[tabId].images = images.map(({ src, seed, usageMetadata }) => ({ src, seed, saved: 'idle', usageMetadata }));
    },
    setImageSaveStatus: (state, action: PayloadAction<{ tabId: string; index: number; status: 'idle' | 'saving' | 'saved' }>) => {
      const { tabId, index, status } = action.payload;
      if (state.generatedContent[tabId] && state.generatedContent[tabId].images[index]) {
        state.generatedContent[tabId].images[index].saved = status;
      }
    },
    setLastUsedPrompt: (state, action: PayloadAction<{ tabId: string, prompt: string | null }>) => {
      const { tabId, prompt } = action.payload;
      if (!state.generatedContent[tabId]) {
        state.generatedContent[tabId] = { images: [], lastUsedPrompt: null };
      }
      state.generatedContent[tabId].lastUsedPrompt = prompt;
    },
    resetGenerationState: (state) => {
      state.sourceImage = null;
      state.clothingImage = null;
      state.backgroundImage = null;
      state.characterPoseImage = null;
      state.previewedBackgroundImage = null;
      state.previewedClothingImage = null;
      state.generatedContent = {
        'image-generator': { images: [], lastUsedPrompt: null },
        'character-generator': { images: [], lastUsedPrompt: null },
      };
      const activeModelType = state.options.comfyModelType;
      const activeModelDefaults = activeModelType && state.comfyDefaultOptionsByModel[activeModelType];
      if (activeModelDefaults) {
        state.options = {
          ...activeModelDefaults,
          provider: state.options.provider,
          comfyModelType: activeModelType,
          comfyPrompt: '',
          comfyNegativePrompt: initialOptions.comfyNegativePrompt,
        };
      }
      state.comfyOptionsByModel = {};
      state.characterName = '';
      state.shouldGenerateCharacterName = false;
      state.maskImage = null;
      state.elementImages = [];

      const resetDefaults: Partial<GenerationOptions> = {
        geminiPrompt: '',
        comfyPrompt: '',
        comfyFlux2Prompt: '',
        comfyFlux2NegativePrompt: '',
        comfyFlux2EditPrompt: '',
        comfyFlux2EditReferenceRoles: ['outfit', 'background', 'pose'],
        comfyFlux2EditReferenceDescriptions: ['', '', ''],
        comfyFlux2EditReferenceLibraryPrompts: ['', '', ''],
        comfyKreaPrompt: '',
        comfyKreaNegativePrompt: '',
        comfyPromptExampleSource: undefined,
        customBackground: '',
        customClothingPrompt: '',
        poseLibraryItems: [],
        geminiI2iMode: 'general',
        geminiGeneralEditPrompt: '',
        geminiInpaintTask: 'remove',
        geminiInpaintCustomPrompt: '',
        geminiInpaintTargetPrompt: '',
        geminiComposePrompt: '',
        comfyCharacterAngleSettings: undefined,
        comfyCharacterUseAdditionalLora: false,
        comfyCharacterAdditionalLora: '',
        comfyCharacterAdditionalLoraStrength: 1,
        comfyCharacterFlux2UseLoras: false,
        comfyCharacterFlux2Lora1Name: '',
        comfyCharacterFlux2Lora1Strength: 1,
        comfyCharacterFlux2Lora2Name: '',
        comfyCharacterFlux2Lora2Strength: 1,
        comfyCharacterFlux2UseCacheDit: false,
        comfyCharacterFlux2CacheDitModelType: 'Auto',
        comfyCharacterFlux2CacheDitWarmupSteps: 3,
        comfyCharacterFlux2CacheDitSkipInterval: 2,
        comfyCharacterFlux2CacheDitPrintSummary: true,
      };

      state.options = { ...state.options, ...resetDefaults };

      // Ensure character options are reset but KEEP the specific mode
      state.characterOptions = {
        ...state.characterOptions,
        ...resetDefaults,
        geminiI2iMode: 'character',
        geminiMode: 'i2i'
      };
    }
  },
});

export const {
  setSourceImage, setGenerationMode, setCharacterName, setShouldGenerateCharacterName,
  setClothingImage, setBackgroundImage, setCharacterPoseImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
  setMaskImage, setElementImages, setOptions, updateOptions, setCharacterOptions, updateCharacterOptions, setLoadingState,
  switchComfyModelOptions, updateProgress, setGeneratedImages, setImageSaveStatus, setLastUsedPrompt, resetGenerationState
} = generationSlice.actions;

// --- Selectors ---
const selectGeneration = (state: RootState) => state.generation;
const selectApp = (state: RootState) => state.app;

export const selectIsReadyToGenerate = createSelector(
  [selectGeneration, selectApp],
  (generation, app) => {
    const { isLoading, options, characterOptions, sourceImage, characterPoseImage, maskImage, elementImages, generationMode } = generation;
    const { isComfyUIConnected, activeTab } = app;

    if (isLoading) return false;

    // Determine which options to check based on active tab
    const activeOptions = activeTab === 'character-generator' ? characterOptions : options;

    if (activeOptions.provider === 'gemini' || activeOptions.provider === 'mammouth') {
      if (activeOptions.provider === 'mammouth' && !app.isMammouthConnected) return false;
      if (activeOptions.geminiMode === 't2i') return !!activeOptions.geminiPrompt?.trim();

      // I2I modes
      if (activeTab === 'image-generator') {
        if (activeOptions.geminiI2iMode === 'general') {
          return !!sourceImage && !!activeOptions.geminiGeneralEditPrompt?.trim();
        }
        if (activeOptions.geminiI2iMode === 'inpaint') {
          const task = activeOptions.geminiInpaintTask;
          const taskReady =
            (task === 'remove') ||
            (task === 'replace' && !!activeOptions.geminiInpaintTargetPrompt?.trim()) ||
            (task === 'changeColor' && !!activeOptions.geminiInpaintTargetPrompt?.trim()) ||
            (task === 'custom' && !!activeOptions.geminiInpaintCustomPrompt?.trim());
          return !!sourceImage && !!maskImage && taskReady;
        }
        if (activeOptions.geminiI2iMode === 'compose') {
          return !!sourceImage && elementImages.length > 0 && !!activeOptions.geminiComposePrompt?.trim();
        }
      } else if (activeTab === 'character-generator') {
        if (activeOptions.poseMode === 'library') {
          return !!sourceImage && !!activeOptions.poseLibraryItems && activeOptions.poseLibraryItems.length > 0;
        }
        return !!sourceImage;
      }
    } else if (activeOptions.provider === 'comfyui') {
      if (activeTab === 'character-generator') {
        if (activeOptions.comfyCharacterMode === 'flux2' && characterPoseImage && !app.comfyUIObjectInfo?.AIO_Preprocessor) return false;
        if (activeOptions.comfyCharacterMode === 'flux2' && activeOptions.comfyCharacterFlux2UseLoras && (activeOptions.comfyCharacterFlux2Lora1Name?.trim() || activeOptions.comfyCharacterFlux2Lora2Name?.trim()) && !app.comfyUIObjectInfo?.LoraLoaderModelOnly) return false;
        if (activeOptions.comfyCharacterMode === 'flux2' && activeOptions.comfyCharacterFlux2UseCacheDit && !app.comfyUIObjectInfo?.CacheDiT_Model_Optimizer) return false;
        return !!isComfyUIConnected && !!sourceImage && getEnabledCharacterAngles(activeOptions).length > 0;
      }
      const isI2IMode = generationMode === 'i2i';
      const activePrompt = activeOptions.comfyModelType === 'krea2-simple' || activeOptions.comfyModelType === 'krea2-raw'
        ? activeOptions.comfyKreaPrompt
        : activeOptions.comfyModelType === 'flux2-simple'
          ? activeOptions.comfyFlux2Prompt
          : activeOptions.comfyModelType === 'flux2-edit'
            ? activeOptions.comfyFlux2EditPrompt || activeOptions.comfyFlux2EditReferenceDescriptions?.find(description => description.trim())
          : activeOptions.comfyPrompt;
      const baseReady = !!isComfyUIConnected && !!activePrompt?.trim();
      if (isI2IMode) {
        if (activeOptions.comfyModelType === 'flux2-edit') {
          const usesPose = elementImages.some((_, index) => (activeOptions.comfyFlux2EditReferenceRoles?.[index] || ['outfit', 'background', 'pose'][index]) === 'pose');
          if (usesPose && !app.comfyUIObjectInfo?.AIO_Preprocessor) return false;
          if (activeOptions.comfyFlux2EditUseCacheDit && !app.comfyUIObjectInfo?.CacheDiT_Model_Optimizer) return false;
        }
        return baseReady && !!sourceImage;
      }
      return baseReady;
    }
    return false;
  }
);


export default generationSlice.reducer;
