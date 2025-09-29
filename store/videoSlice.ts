import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { VideoSliceState, GenerationOptions, VideoUtilsState, ColorPickerState } from '../types';
import type { RootState } from './store';

const initialVideoUtilsState: VideoUtilsState = {
    videoFile: null,
    extractedFrame: null,
    extractedFrameSaveStatus: 'idle',
    colorPicker: {
        imageFile: null,
        palette: [],
        paletteName: '',
        colorCount: 8,
        isExtracting: false,
        error: null,
        dominantColorPool: [],
        pickingColorIndex: null,
        paletteSaveStatus: 'idle',
    },
};

const initialState: VideoSliceState = {
  videoStartFrame: null,
  videoEndFrame: null,
  generatedVideoUrl: null,
  generationOptionsForSave: null,
  videoUtilsState: initialVideoUtilsState,
  activeVideoUtilsSubTab: 'frames',
};

const videoSlice = createSlice({
  name: 'video',
  initialState,
  reducers: {
    setVideoStartFrame: (state, action: PayloadAction<File | null>) => {
      state.videoStartFrame = action.payload;
    },
    setVideoEndFrame: (state, action: PayloadAction<File | null>) => {
      state.videoEndFrame = action.payload;
    },
    setGeneratedVideoUrl: (state, action: PayloadAction<string | null>) => {
      if (action.payload) {
        state.generatedVideoUrl = { url: action.payload, saved: 'idle' };
      } else {
        state.generatedVideoUrl = null;
      }
    },
    setVideoSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        if (state.generatedVideoUrl) {
            state.generatedVideoUrl.saved = action.payload;
        }
    },
    setGenerationOptionsForSave: (state, action: PayloadAction<GenerationOptions | null>) => {
      state.generationOptionsForSave = action.payload;
    },
    updateVideoUtilsState: (state, action: PayloadAction<Partial<VideoUtilsState>>) => {
        const updates = action.payload;
        // Reset save status if the relevant content has changed
        if ('extractedFrame' in updates && updates.extractedFrame !== state.videoUtilsState.extractedFrame) {
            state.videoUtilsState.extractedFrameSaveStatus = 'idle';
        }
        state.videoUtilsState = { ...state.videoUtilsState, ...updates };
    },
    updateColorPickerState: (state, action: PayloadAction<Partial<ColorPickerState>>) => {
        const oldPalette = JSON.stringify(state.videoUtilsState.colorPicker.palette);
        state.videoUtilsState.colorPicker = {
            ...state.videoUtilsState.colorPicker,
            ...action.payload,
        };
        const newPalette = JSON.stringify(state.videoUtilsState.colorPicker.palette);
        if (newPalette !== oldPalette) {
            state.videoUtilsState.colorPicker.paletteSaveStatus = 'idle';
        }
    },
    setActiveVideoUtilsSubTab: (state, action: PayloadAction<'frames' | 'colors'>) => {
      state.activeVideoUtilsSubTab = action.payload;
    },
    resetVideoGenerationState: (state) => {
      state.videoStartFrame = null;
      state.videoEndFrame = null;
      state.generatedVideoUrl = null;
      state.generationOptionsForSave = null;
    },
    resetVideoUtilsState: (state) => {
      state.videoUtilsState = initialVideoUtilsState;
    },
    setFrameSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        state.videoUtilsState.extractedFrameSaveStatus = action.payload;
    },
    setPaletteSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        state.videoUtilsState.colorPicker.paletteSaveStatus = action.payload;
    },
  },
});

export const {
    setVideoStartFrame,
    setVideoEndFrame,
    setGeneratedVideoUrl,
    setVideoSaveStatus,
    setGenerationOptionsForSave,
    updateVideoUtilsState,
    updateColorPickerState,
    setActiveVideoUtilsSubTab,
    resetVideoGenerationState,
    resetVideoUtilsState,
    setFrameSaveStatus,
    setPaletteSaveStatus,
} = videoSlice.actions;

// --- Selectors ---
const selectGeneration = (state: RootState) => state.generation;
const selectVideo = (state: RootState) => state.video;

export const selectIsVideoReady = createSelector(
  [selectGeneration, selectVideo],
  (generation, video) => {
    const { isLoading, options } = generation;
    const { videoStartFrame } = video;

    if (isLoading) return false;

    if (options.videoProvider === 'gemini') {
        return !!options.geminiVidPrompt?.trim();
    } else { // comfyui
        // Fix: Added a check for the ComfyUI positive prompt to ensure all required fields are present before enabling generation.
        return !!videoStartFrame && !!options.comfyVidWanI2VPositivePrompt?.trim();
    }
  }
);

export default videoSlice.reducer;