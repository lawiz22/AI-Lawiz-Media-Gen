import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { PromptGenState } from '../types';

interface PromptGenSliceState {
  promptGenState: PromptGenState;
  activePromptToolsSubTab: string;
}

const initialState: PromptGenSliceState = {
  promptGenState: {
    image: null,
    prompt: '',
    bgImage: null,
    bgPrompt: '',
    subjectImage: null,
    subjectPrompt: '',
    soupPrompt: '',
    soupHistory: [],
  },
  activePromptToolsSubTab: 'from-image',
};

const promptGenSlice = createSlice({
  name: 'promptGen',
  initialState,
  reducers: {
    setPromptGenState: (state, action: PayloadAction<PromptGenState>) => {
      state.promptGenState = action.payload;
    },
    addSoupToHistory: (state, action: PayloadAction<string>) => {
        state.promptGenState.soupPrompt = action.payload;
        state.promptGenState.soupHistory = [action.payload, ...state.promptGenState.soupHistory].slice(0, 5);
    },
    setActivePromptToolsSubTab: (state, action: PayloadAction<string>) => {
      state.activePromptToolsSubTab = action.payload;
    },
    resetPromptGenState: (state) => {
      state.promptGenState = initialState.promptGenState;
    },
  },
});

export const {
  setPromptGenState,
  addSoupToHistory,
  setActivePromptToolsSubTab,
  resetPromptGenState,
} = promptGenSlice.actions;

export default promptGenSlice.reducer;
