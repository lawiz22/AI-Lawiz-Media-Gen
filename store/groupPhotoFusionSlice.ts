import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UploadedFile, Pose, Quality, GeneratedImage, DebugInfo } from '../groupPhotoFusion/types';
import { POSES } from '../groupPhotoFusion/constants';

interface GroupPhotoFusionState {
  uploadedFiles: UploadedFile[];
  backgroundFile: UploadedFile | null;
  selectedPose: Pose | null;
  quality: Quality;
  numImages: number;
  isLoading: boolean;
  generatedImages: GeneratedImage[] | null;
  error: string | null;
  isDebugMode: boolean;
  debugInfos: DebugInfo[];
}

const initialState: GroupPhotoFusionState = {
  uploadedFiles: [],
  backgroundFile: null,
  selectedPose: POSES[0],
  quality: 'High',
  numImages: 1,
  isLoading: false,
  generatedImages: null,
  error: null,
  isDebugMode: false,
  debugInfos: [],
};

const groupPhotoFusionSlice = createSlice({
  name: 'groupPhotoFusion',
  initialState,
  reducers: {
    setUploadedFiles: (state, action: PayloadAction<UploadedFile[]>) => {
      state.uploadedFiles = action.payload;
      state.generatedImages = null;
      state.error = null;
      state.debugInfos = [];
    },
    setBackgroundFile: (state, action: PayloadAction<UploadedFile | null>) => {
      state.backgroundFile = action.payload;
      state.debugInfos = [];
    },
    removeUploadedFile: (state, action: PayloadAction<string>) => {
        state.uploadedFiles = state.uploadedFiles.filter(f => f.id !== action.payload);
        state.debugInfos = [];
    },
    updatePersona: (state, action: PayloadAction<{ id: string; personaId: string }>) => {
        const { id, personaId } = action.payload;
        const file = state.uploadedFiles.find(f => f.id === id);
        if (file) {
            file.personaId = personaId;
        }
    },
    removeAllFiles: (state) => {
        state.uploadedFiles = [];
        state.backgroundFile = null;
        state.generatedImages = null;
        state.error = null;
        state.debugInfos = [];
    },
    setSelectedPose: (state, action: PayloadAction<Pose | null>) => {
      state.selectedPose = action.payload;
    },
    setQuality: (state, action: PayloadAction<Quality>) => {
      state.quality = action.payload;
    },
    setNumImages: (state, action: PayloadAction<number>) => {
      state.numImages = action.payload;
    },
    setGeneratedImages: (state, action: PayloadAction<GeneratedImage[] | null>) => {
      state.generatedImages = action.payload?.map(img => ({ ...img, saveStatus: 'idle' })) || null;
    },
    updateGeneratedImage: (state, action: PayloadAction<Partial<GeneratedImage> & { id: string }>) => {
        if(state.generatedImages) {
            const index = state.generatedImages.findIndex(img => img.id === action.payload.id);
            if (index !== -1) {
                state.generatedImages[index] = { ...state.generatedImages[index], ...action.payload };
            }
        }
    },
    setSaveStatus: (state, action: PayloadAction<{ index: number; status: 'idle' | 'saving' | 'saved' }>) => {
      if (state.generatedImages && state.generatedImages[action.payload.index]) {
        state.generatedImages[action.payload.index].saveStatus = action.payload.status;
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    startOver: (state) => {
        state.generatedImages = null;
        state.error = null;
        state.isLoading = false;
        state.debugInfos = [];
    },
    setIsDebugMode: (state, action: PayloadAction<boolean>) => {
      state.isDebugMode = action.payload;
    },
    addDebugInfo: (state, action: PayloadAction<DebugInfo>) => {
        state.debugInfos.push(action.payload);
    },
    clearDebugInfos: (state) => {
        state.debugInfos = [];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
        state.isLoading = action.payload;
    },
  },
});

export const {
    setUploadedFiles,
    setBackgroundFile,
    removeUploadedFile,
    updatePersona,
    removeAllFiles,
    setSelectedPose,
    setQuality,
    setNumImages,
    setGeneratedImages,
    updateGeneratedImage,
    setSaveStatus,
    setError,
    startOver,
    setIsDebugMode,
    addDebugInfo,
    clearDebugInfos,
    setLoading,
} = groupPhotoFusionSlice.actions;

export default groupPhotoFusionSlice.reducer;