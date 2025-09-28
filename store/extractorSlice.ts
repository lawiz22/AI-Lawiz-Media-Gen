import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ExtractorState } from '../types';

interface ExtractorSliceState {
  extractorState: ExtractorState;
  activeExtractorSubTab: string;
}

const initialExtractorState: ExtractorState = {
    clothesSourceFile: null,
    clothesDetails: '',
    isIdentifying: false,
    identifiedItems: [],
    isGenerating: false,
    generatedClothes: [],
    clothesError: null,
    generateFolded: false,
    excludeAccessories: true,
    objectSourceFile: null,
    objectHints: '',
    maxObjects: 5,
    isIdentifyingObjects: false,
    identifiedObjects: [],
    isGeneratingObjects: false,
    generatedObjects: [],
    objectError: null,
    poseSourceFile: null,
    isGeneratingPoses: false,
    generatedPoses: [],
    poseError: null,
    mannequinStyle: 'wooden-artist',
    mannequinReferenceFile: null,
    fontSourceFile: null,
    isGeneratingFont: false,
    generatedFontChart: null,
    fontError: null,
};

const initialState: ExtractorSliceState = {
  extractorState: initialExtractorState,
  activeExtractorSubTab: 'clothes',
};

const extractorSlice = createSlice({
  name: 'extractor',
  initialState,
  reducers: {
    setExtractorState: (state, action: PayloadAction<ExtractorState>) => {
      state.extractorState = action.payload;
    },
    setActiveExtractorSubTab: (state, action: PayloadAction<string>) => {
      state.activeExtractorSubTab = action.payload;
    },
    resetExtractorState: (state) => {
      state.extractorState = initialState.extractorState;
    },
  },
});

export const {
  setExtractorState,
  setActiveExtractorSubTab,
  resetExtractorState,
} = extractorSlice.actions;

export default extractorSlice.reducer;
