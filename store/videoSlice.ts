import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { VideoSliceState, GenerationOptions, VideoUtilsState, ColorPickerState } from '../types';
import type { RootState } from './store';

const initialVideoUtilsState: VideoUtilsState = {
    videoFile: null,
    extractedFrame: null,
    colorPicker: {
        imageFile: null,
        palette: [],
        paletteName: '',
        colorCount: 8,
        isExtracting: false,
        error: null,
        dominantColorPool: [],
        pickingColorIndex: null,
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
      state.generatedVideoUrl = action.payload;
    },
    setGenerationOptionsForSave: (state, action: PayloadAction<GenerationOptions | null>) => {
      state.generationOptionsForSave = action.payload;
    },
    setVideoUtilsState: (state, action: PayloadAction<VideoUtilsState>) => {
      state.videoUtilsState = action.payload;
    },
    updateColorPickerState: (state, action: PayloadAction<Partial<ColorPickerState>>) => {
        state.videoUtilsState.colorPicker = {
            ...state.videoUtilsState.colorPicker,
            ...action.payload,
        };
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
  },
});

export const {
    setVideoStartFrame,
    setVideoEndFrame,
    setGeneratedVideoUrl,
    setGenerationOptionsForSave,
    setVideoUtilsState,
    updateColorPickerState,
    setActiveVideoUtilsSubTab,
    resetVideoGenerationState,
    resetVideoUtilsState,
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
        return !!videoStartFrame;
    }
  }
);

export default videoSlice.reducer;
