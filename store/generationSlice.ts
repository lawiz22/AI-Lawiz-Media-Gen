import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { GenerationSliceState, GenerationOptions } from '../types';
import type { RootState } from './store';

const initialOptions: GenerationOptions = {
    provider: 'comfyui',
    numImages: 4,
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
    geminiI2iMode: 'general',
    geminiGeneralEditPrompt: '',
    geminiInpaintTask: 'remove',
    geminiInpaintCustomPrompt: '',
    geminiInpaintTargetPrompt: '',
    geminiComposePrompt: '',
    comfyModelType: 'sdxl',
    comfyPrompt: '',
    comfyNegativePrompt: 'blurry, bad quality, low-res, ugly, deformed, disfigured',
    comfySteps: 25,
    comfyCfg: 5.5,
    comfySampler: 'euler',
    comfyScheduler: 'normal',
    
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
    comfyVidWanT2VFrameRate: 17.6,
    comfyVidWanT2VVideoFormat: 'video/nvenc_h264-mp4',
};

const initialState: GenerationSliceState = {
    sourceImage: null,
    generationMode: 't2i',
    characterName: '',
    shouldGenerateCharacterName: false,
    clothingImage: null,
    backgroundImage: null,
    previewedBackgroundImage: null,
    previewedClothingImage: null,
    maskImage: null,
    elementImages: [],
    options: initialOptions,
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
    setGeneratedImages: (state, action: PayloadAction<{ tabId: string; images: string[] }>) => {
      const { tabId, images } = action.payload;
      if (!state.generatedContent[tabId]) {
          state.generatedContent[tabId] = { images: [], lastUsedPrompt: null };
      }
      state.generatedContent[tabId].images = images.map(src => ({ src, saved: 'idle' }));
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
        state.previewedBackgroundImage = null;
        state.previewedClothingImage = null;
        state.generatedContent = {
            'image-generator': { images: [], lastUsedPrompt: null },
            'character-generator': { images: [], lastUsedPrompt: null },
        };
        state.characterName = '';
        state.shouldGenerateCharacterName = false;
        state.maskImage = null;
        state.elementImages = [];
        state.options = {
            ...state.options,
            geminiPrompt: '',
            comfyPrompt: '',
            customBackground: '',
            customClothingPrompt: '',
            poseLibraryItems: [],
            geminiI2iMode: 'general',
            geminiGeneralEditPrompt: '',
            geminiInpaintTask: 'remove',
            geminiInpaintCustomPrompt: '',
            geminiInpaintTargetPrompt: '',
            geminiComposePrompt: '',
        };
    }
  },
});

export const {
    setSourceImage, setGenerationMode, setCharacterName, setShouldGenerateCharacterName,
    setClothingImage, setBackgroundImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
    setMaskImage, setElementImages, setOptions, updateOptions, setLoadingState,
    updateProgress, setGeneratedImages, setImageSaveStatus, setLastUsedPrompt, resetGenerationState
} = generationSlice.actions;

// --- Selectors ---
const selectGeneration = (state: RootState) => state.generation;
const selectApp = (state: RootState) => state.app;

export const selectIsReadyToGenerate = createSelector(
  [selectGeneration, selectApp],
  (generation, app) => {
    const { isLoading, options, sourceImage, elementImages, generationMode } = generation;
    const { isComfyUIConnected, activeTab } = app;

    if (isLoading) return false;

    if (options.provider === 'gemini') {
        if (options.geminiMode === 't2i') return !!options.geminiPrompt?.trim();
        
        // I2I modes
        if (activeTab === 'image-generator') {
            if (options.geminiI2iMode === 'general') {
                return !!sourceImage && !!options.geminiGeneralEditPrompt?.trim();
            }
            if (options.geminiI2iMode === 'inpaint') {
                return !!sourceImage; // Mask is optional
            }
            if (options.geminiI2iMode === 'compose') {
                return !!sourceImage && elementImages.length > 0 && !!options.geminiComposePrompt?.trim();
            }
        } else if (activeTab === 'character-generator') {
            if (options.poseMode === 'library') {
                 return !!sourceImage && !!options.poseLibraryItems && options.poseLibraryItems.length > 0;
            }
            return !!sourceImage;
        }
    } else if (options.provider === 'comfyui') {
        const isI2IMode = generationMode === 'i2i';
        const baseReady = !!isComfyUIConnected && !!options.comfyPrompt?.trim();
        if (isI2IMode) {
            return baseReady && !!sourceImage;
        }
        return baseReady;
    }
    return false;
  }
);


export default generationSlice.reducer;