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
    videoProvider: 'comfyui',
    comfyVidModelType: 'wan-i2v',
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
    generatedImages: [],
    lastUsedPrompt: null,
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
    setGeneratedImages: (state, action: PayloadAction<string[]>) => {
      state.generatedImages = action.payload;
    },
    setLastUsedPrompt: (state, action: PayloadAction<string | null>) => {
      state.lastUsedPrompt = action.payload;
    },
    resetGenerationState: (state) => {
        state.sourceImage = null;
        state.clothingImage = null;
        state.backgroundImage = null;
        state.previewedBackgroundImage = null;
        state.previewedClothingImage = null;
        state.generatedImages = [];
        state.lastUsedPrompt = null;
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
    updateProgress, setGeneratedImages, setLastUsedPrompt, resetGenerationState
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
