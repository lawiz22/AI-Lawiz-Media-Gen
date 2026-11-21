import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { VideoSliceState, VideoUtilsState, ColorPickerState, ResizeCropState } from '../types';

const initialResizeCropState: ResizeCropState = {
    sourceFile: null,
    previewUrl: null,
    scale: 100,
    crop: null,
    aspectRatio: 'free',
    resultUrl: null,
    isLoading: false,
    error: null,
    saveStatus: 'idle',
};

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
    resizeCrop: initialResizeCropState,
};

const initialState: VideoSliceState = {
  videoUtilsState: initialVideoUtilsState,
  activeVideoUtilsSubTab: 'frames',
  referenceMakerResetVersion: 0,
  videoMergeResetVersion: 0,
  audioExtractorResetVersion: 0,
};

const videoSlice = createSlice({
  name: 'video',
  initialState,
  reducers: {
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
    updateResizeCropState: (state, action: PayloadAction<Partial<ResizeCropState>>) => {
        state.videoUtilsState.resizeCrop = {
            ...state.videoUtilsState.resizeCrop,
            ...action.payload,
        };
    },
    setActiveVideoUtilsSubTab: (state, action: PayloadAction<VideoSliceState['activeVideoUtilsSubTab']>) => {
      state.activeVideoUtilsSubTab = action.payload;
    },
    resetVideoUtilsState: (state) => {
      state.videoUtilsState = initialVideoUtilsState;
      state.referenceMakerResetVersion++;
      state.videoMergeResetVersion++;
      state.audioExtractorResetVersion++;
    },
    setFrameSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        state.videoUtilsState.extractedFrameSaveStatus = action.payload;
    },
    setPaletteSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        state.videoUtilsState.colorPicker.paletteSaveStatus = action.payload;
    },
    setResizeCropSaveStatus: (state, action: PayloadAction<'idle' | 'saving' | 'saved'>) => {
        state.videoUtilsState.resizeCrop.saveStatus = action.payload;
    },
  },
});

export const {
    updateVideoUtilsState,
    updateColorPickerState,
    updateResizeCropState,
    setActiveVideoUtilsSubTab,
    resetVideoUtilsState,
    setFrameSaveStatus,
    setPaletteSaveStatus,
    setResizeCropSaveStatus,
} = videoSlice.actions;

export default videoSlice.reducer;