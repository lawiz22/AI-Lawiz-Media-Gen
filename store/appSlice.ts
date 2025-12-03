import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User, VersionInfo, DriveFolder, AppSliceState } from '../types';

const initialState: AppSliceState = {
  currentUser: null,
  theme: 'cyberpunk',
  projectName: 'Project Lawiz 1',
  fontSize: 14,
  activeTab: 'image-generator',
  isComfyUIConnected: null,
  comfyUIObjectInfo: null,
  versionInfo: null,
  globalError: null,

  // Modals & Panels
  isSettingsModalOpen: false,
  isVisualSettingsModalOpen: false,
  isAdminPanelOpen: false,
  isComfyUIHelperOpen: false,
  isClothingPickerOpen: false,
  isBackgroundPickerOpen: false,
  isPosePickerOpen: false,
  isColorImagePickerOpen: false,
  isVideoUtilsPickerOpen: false,
  isStartFramePickerOpen: false,
  isEndFramePickerOpen: false,
  isLogoRefPickerOpen: false,
  isLogoPalettePickerOpen: false,
  isLogoFontPickerOpen: false,
  isOAuthHelperOpen: false,
  isPromptGenImagePickerOpen: false,
  isPromptGenBgImagePickerOpen: false,
  isPromptGenSubjectImagePickerOpen: false,
  isNunchakuSourcePickerOpen: false,
  isCharacterSourcePickerOpen: false,
  isVideoStartFramePickerOpen: false,
  isVideoEndFramePickerOpen: false,
  isGeminiVideoSourcePickerOpen: false,
  isClothesSourcePickerOpen: false,
  isObjectSourcePickerOpen: false,
  isPoseSourcePickerOpen: false,
  isBannerRefPickerOpen: false,
  isBannerPalettePickerOpen: false,
  isBannerLogoPickerOpen: false,
  isBannerFontPickerOpen: false,
  isAlbumCoverRefPickerOpen: false,
  isAlbumCoverPalettePickerOpen: false,
  isAlbumCoverLogoPickerOpen: false,
  isAlbumCoverFontPickerOpen: false,
  isMannequinRefPickerOpen: false,
  isRefineSourcePickerOpen: false,
  isFontSourcePickerOpen: false,
  isMaskPickerOpen: false,
  isElementPickerOpen: false,
  isWanVideoImagePickerOpen: false,
  isResizeCropPickerOpen: false,
  isGroupFusionPickerOpen: false,

  // Google Drive State
  driveFolder: null,
  isSyncing: false,
  syncMessage: '',
  isDriveConfigured: false,

  // Session Token Usage
  sessionTokenUsage: {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
  },
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setCurrentUser: (state, action: PayloadAction<User | null>) => {
      state.currentUser = action.payload;
      if (action.payload) {
        sessionStorage.setItem('currentUser', JSON.stringify(action.payload));
      } else {
        sessionStorage.removeItem('currentUser');
      }
    },
    setTheme: (state, action: PayloadAction<string>) => {
      state.theme = action.payload;
    },
    setProjectName: (state, action: PayloadAction<string>) => {
      state.projectName = action.payload;
      localStorage.setItem('projectName', action.payload);
    },
    setFontSize: (state, action: PayloadAction<number>) => {
      state.fontSize = action.payload;
      localStorage.setItem('fontSize', action.payload.toString());
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTab = action.payload;
    },
    setIsComfyUIConnected: (state, action: PayloadAction<boolean | null>) => {
      state.isComfyUIConnected = action.payload;
    },
    setComfyUIObjectInfo: (state, action: PayloadAction<any | null>) => {
      state.comfyUIObjectInfo = action.payload;
    },
    setVersionInfo: (state, action: PayloadAction<VersionInfo | null>) => {
      state.versionInfo = action.payload;
    },
    setGlobalError: (state, action: PayloadAction<{ title: string; message: string } | null>) => {
      state.globalError = action.payload;
    },
    setDriveFolder: (state, action: PayloadAction<DriveFolder | null>) => {
      state.driveFolder = action.payload;
      if (action.payload) {
        localStorage.setItem('drive_folder', JSON.stringify(action.payload));
      } else {
        localStorage.removeItem('drive_folder');
      }
    },
    setIsSyncing: (state, action: PayloadAction<boolean>) => {
      state.isSyncing = action.payload;
    },
    setSyncMessage: (state, action: PayloadAction<string>) => {
      state.syncMessage = action.payload;
    },
    setIsDriveConfigured: (state, action: PayloadAction<boolean>) => {
      state.isDriveConfigured = action.payload;
    },

    // Token Usage
    addSessionTokenUsage: (state, action: PayloadAction<{ promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }>) => {
      if (action.payload) {
        state.sessionTokenUsage.promptTokenCount += action.payload.promptTokenCount || 0;
        state.sessionTokenUsage.candidatesTokenCount += action.payload.candidatesTokenCount || 0;
        state.sessionTokenUsage.totalTokenCount += action.payload.totalTokenCount || 0;
      }
    },
    resetSessionTokenUsage: (state) => {
      state.sessionTokenUsage = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
    },

    // Modal Toggles
    openSettingsModal: state => { state.isSettingsModalOpen = true; },
    closeSettingsModal: state => { state.isSettingsModalOpen = false; },
    openVisualSettingsModal: state => { state.isVisualSettingsModalOpen = true; },
    closeVisualSettingsModal: state => { state.isVisualSettingsModalOpen = false; },
    openAdminPanel: state => { state.isAdminPanelOpen = true; },
    closeAdminPanel: state => { state.isAdminPanelOpen = false; },
    openOAuthHelper: state => { state.isOAuthHelperOpen = true; },
    closeOAuthHelper: state => { state.isOAuthHelperOpen = false; },
    openComfyUIHelper: state => { state.isComfyUIHelperOpen = true; },
    closeComfyUIHelper: state => { state.isComfyUIHelperOpen = false; },

    // Dynamic Modal Toggler
    // Fix: Narrowed the 'modal' payload type to only accept keys matching the 'is...Open' pattern.
    // This makes the reducer type-safe and resolves downstream type inference errors.
    setModalOpen: (state, action: PayloadAction<{ modal: Extract<keyof AppSliceState, `is${string}Open`>; isOpen: boolean }>) => {
      const { modal, isOpen } = action.payload;
      if (modal.startsWith('is') && modal.endsWith('Open')) {
        (state as any)[modal] = isOpen;
      }
    }
  },
});

export const {
  setCurrentUser,
  setTheme,
  setFontSize,
  setProjectName,
  setActiveTab,
  setIsComfyUIConnected,
  setComfyUIObjectInfo,
  setVersionInfo,
  setGlobalError,
  setDriveFolder,
  setIsSyncing,
  setSyncMessage,
  setIsDriveConfigured,
  addSessionTokenUsage,
  resetSessionTokenUsage,
  openSettingsModal,
  closeSettingsModal,
  openVisualSettingsModal,
  closeVisualSettingsModal,
  openAdminPanel,
  closeAdminPanel,
  openOAuthHelper,
  closeOAuthHelper,
  openComfyUIHelper,
  closeComfyUIHelper,
  setModalOpen,
} = appSlice.actions;

export default appSlice.reducer;
