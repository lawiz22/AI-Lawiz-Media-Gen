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
    setExtractorItemSaveStatus: (state, action: PayloadAction<{ itemType: 'clothes' | 'objects' | 'poses' | 'font', index?: number, status: 'idle' | 'saving' | 'saved' }>) => {
        const { itemType, index, status } = action.payload;
        switch (itemType) {
            case 'clothes':
                if (typeof index === 'number' && state.extractorState.generatedClothes[index]) {
                    state.extractorState.generatedClothes[index].saved = status;
                }
                break;
            case 'objects':
                if (typeof index === 'number' && state.extractorState.generatedObjects[index]) {
                    state.extractorState.generatedObjects[index].saved = status;
                }
                break;
            case 'poses':
                if (typeof index === 'number' && state.extractorState.generatedPoses[index]) {
                    state.extractorState.generatedPoses[index].saved = status;
                }
                break;
            case 'font':
                if (state.extractorState.generatedFontChart) {
                    state.extractorState.generatedFontChart.saved = status;
                }
                break;
        }
    },
  },
});

export const {
  setExtractorState,
  setActiveExtractorSubTab,
  resetExtractorState,
  setExtractorItemSaveStatus,
} = extractorSlice.actions;

export default extractorSlice.reducer;