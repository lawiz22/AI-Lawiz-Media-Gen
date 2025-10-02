import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { PromptGenState, PromptCategory } from '../types';

interface PromptGenSliceState {
  promptGenState: PromptGenState;
  activePromptToolsSubTab: string;
}

const initialState: PromptGenSliceState = {
  promptGenState: {
    image: null,
    prompt: '',
    promptSaveStatus: 'idle',
    bgImage: null,
    bgPrompt: '',
    bgPromptSaveStatus: 'idle',
    subjectImage: null,
    subjectPrompt: '',
    subjectPromptSaveStatus: 'idle',
    soupPrompt: '',
    soupPromptSaveStatus: 'idle',
    soupHistory: [],
    wanVideoImage: null,
    wanVideoBasePrompt: '',
    wanVideoCategory: 'sci-fi',
    wanVideoSubject: '',
    wanVideoAction: '',
    wanVideoEnvironment: '',
    wanVideoCameraMove: '',
    wanVideoStyle: '',
    wanVideoFinalPrompt: '',
    wanVideoPromptSaveStatus: 'idle',
    // Qwen Image pre-filled with an example
    qwenTitle: 'A majestic cyberpunk phoenix, wings made of neon data streams, soaring through a rainy city at night.',
    qwenUseTextInImage: true,
    qwenTextPosition: 'bottom-center',
    qwenTextContent: 'CYBER PHOENIX',
    qwenTextStyle: 'glowing, futuristic font',
    qwenStyleModifiers: 'hyperrealistic, 8k, cinematic lighting, volumetric fog, trending on artstation',
    qwenFinalPrompt: '',
    qwenPromptSaveStatus: 'idle',
  },
  activePromptToolsSubTab: 'from-image',
};

const promptGenSlice = createSlice({
  name: 'promptGen',
  initialState,
  reducers: {
    updatePromptGenState: (state, action: PayloadAction<Partial<PromptGenState>>) => {
        const updates = action.payload;

        // When a prompt's text is being updated, first check if it's different from the current state.
        // If it is, reset the corresponding save status to 'idle'. This ensures editing a "Saved!" prompt
        // correctly resets the button back to "Save".
        if (updates.prompt !== undefined && updates.prompt !== state.promptGenState.prompt) {
            state.promptGenState.promptSaveStatus = 'idle';
        }
        if (updates.bgPrompt !== undefined && updates.bgPrompt !== state.promptGenState.bgPrompt) {
            state.promptGenState.bgPromptSaveStatus = 'idle';
        }
        if (updates.subjectPrompt !== undefined && updates.subjectPrompt !== state.promptGenState.subjectPrompt) {
            state.promptGenState.subjectPromptSaveStatus = 'idle';
        }
        if (updates.soupPrompt !== undefined && updates.soupPrompt !== state.promptGenState.soupPrompt) {
            state.promptGenState.soupPromptSaveStatus = 'idle';
        }
        if (updates.wanVideoFinalPrompt !== undefined && updates.wanVideoFinalPrompt !== state.promptGenState.wanVideoFinalPrompt) {
            state.promptGenState.wanVideoPromptSaveStatus = 'idle';
        }
        if (updates.qwenFinalPrompt !== undefined && updates.qwenFinalPrompt !== state.promptGenState.qwenFinalPrompt) {
            state.promptGenState.qwenPromptSaveStatus = 'idle';
        }
        
        // Apply all updates to the state using direct mutation, which is handled correctly by Immer.
        Object.assign(state.promptGenState, updates);
    },
    addSoupToHistory: (state, action: PayloadAction<string>) => {
        const newHistory = [action.payload, ...state.promptGenState.soupHistory].slice(0, 5);
        state.promptGenState.soupHistory = newHistory;
        state.promptGenState.soupPrompt = action.payload;
        state.promptGenState.soupPromptSaveStatus = 'idle';
    },
    setActivePromptToolsSubTab: (state, action: PayloadAction<string>) => {
      state.activePromptToolsSubTab = action.payload;
    },
    resetPromptGenState: (state) => {
      state.promptGenState = initialState.promptGenState;
    },
    setPromptSaveStatus: (state, action: PayloadAction<{ type: PromptCategory; status: 'idle' | 'saving' | 'saved' }>) => {
        const { type, status } = action.payload;
        switch(type) {
            case 'image': 
                state.promptGenState.promptSaveStatus = status;
                break;
            case 'background': 
                state.promptGenState.bgPromptSaveStatus = status;
                break;
            case 'subject': 
                state.promptGenState.subjectPromptSaveStatus = status;
                break;
            case 'soup': 
                state.promptGenState.soupPromptSaveStatus = status;
                break;
            case 'wan-video':
                state.promptGenState.wanVideoPromptSaveStatus = status;
                break;
            case 'qwen-image':
                state.promptGenState.qwenPromptSaveStatus = status;
                break;
        }
    }
  },
});

export const {
  updatePromptGenState,
  addSoupToHistory,
  setActivePromptToolsSubTab,
  resetPromptGenState,
  setPromptSaveStatus,
} = promptGenSlice.actions;

export default promptGenSlice.reducer;