
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ExtractorState } from '../types';

interface ExtractorSliceState {
  extractorState: ExtractorState;
  activeExtractorSubTab: string;
}

const initialExtractorState: ExtractorState = {
    clothesSourceFile: null,
    clothesDetails: '',
  clothesAnalysisProvider: 'mammouth',
  clothesGenerationProvider: 'flux2',
    isIdentifying: false,
    identifiedItems: [],
    isGenerating: false,
    generatedClothes: [],
    clothesError: null,
    generateFolded: false,
    excludeAccessories: true,
    hairSourceFile: null,
    hairPersonCount: 1,
    hairExactFidelity: true,
    hairGenerationProvider: 'flux2',
    isGeneratingHair: false,
    generatedHair: [],
    hairError: null,
    objectSourceFile: null,
    objectHints: '',
    maxObjects: 5,
    objectAnalysisProvider: 'mammouth',
    objectGenerationProvider: 'flux2',
    isIdentifyingObjects: false,
    identifiedObjects: [],
    isGeneratingObjects: false,
    generatedObjects: [],
    objectError: null,
    poseSourceFile: null,
    isGeneratingPoses: false,
    generatedPoses: [],
    poseError: null,
    mannequinStyle: 'custom-reference',
    mannequinReferenceFile: null,
    poseOutputMode: 'mannequin-image',
    mannequinPromptHint: 'a clean white articulated artist mannequin with visible joint construction and a matte studio finish',
    poseGenerationProvider: 'flux2',
    fontSourceFile: null,
    fontGenerationProvider: 'flux2',
    fontUseSourceColors: false,
    fontFlux2Steps: 8,
    fontFlux2Cfg: 1.1,
    fontFlux2Sampler: 'euler',
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
    updateExtractorState: (state, action: PayloadAction<Partial<ExtractorState>>) => {
        state.extractorState = { ...state.extractorState, ...action.payload };
    },
    setActiveExtractorSubTab: (state, action: PayloadAction<string>) => {
      state.activeExtractorSubTab = action.payload;
    },
    resetExtractorState: (state) => {
      state.extractorState = initialState.extractorState;
    },
    setExtractorItemSaveStatus: (state, action: PayloadAction<{ itemType: 'clothes' | 'hair' | 'objects' | 'poses' | 'font', index?: number, status: 'idle' | 'saving' | 'saved' }>) => {
        const { itemType, index, status } = action.payload;
        switch (itemType) {
            case 'clothes':
                if (typeof index === 'number' && state.extractorState.generatedClothes[index]) {
                    // Create a new array with the updated item to ensure re-render
                    state.extractorState.generatedClothes = state.extractorState.generatedClothes.map((item, i) =>
                        i === index ? { ...item, saved: status } : item
                    );
                }
                break;
              case 'hair':
                if (typeof index === 'number' && state.extractorState.generatedHair[index]) {
                  state.extractorState.generatedHair = state.extractorState.generatedHair.map((item, i) =>
                    i === index ? { ...item, saved: status } : item
                  );
                }
                break;
            case 'objects':
                if (typeof index === 'number' && state.extractorState.generatedObjects[index]) {
                    state.extractorState.generatedObjects = state.extractorState.generatedObjects.map((item, i) =>
                        i === index ? { ...item, saved: status } : item
                    );
                }
                break;
            case 'poses':
                if (typeof index === 'number' && state.extractorState.generatedPoses[index]) {
                    state.extractorState.generatedPoses = state.extractorState.generatedPoses.map((item, i) =>
                        i === index ? { ...item, saved: status } : item
                    );
                }
                break;
            case 'font':
                if (state.extractorState.generatedFontChart) {
                    state.extractorState.generatedFontChart = {
                        ...state.extractorState.generatedFontChart,
                        saved: status
                    };
                }
                break;
        }
    },
  },
});

export const {
  setExtractorState,
  updateExtractorState,
  setActiveExtractorSubTab,
  resetExtractorState,
  setExtractorItemSaveStatus,
} = extractorSlice.actions;

export default extractorSlice.reducer;
