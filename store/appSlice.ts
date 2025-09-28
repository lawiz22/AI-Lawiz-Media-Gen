import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User, VersionInfo, DriveFolder, AppSliceState } from '../types';

const initialState: AppSliceState = {
  currentUser: null,
  theme: 'cyberpunk',
  activeTab: 'image-generator',
  isComfyUIConnected: null,
  comfyUIObjectInfo: null,
  versionInfo: null,
  globalError: null,

  // Modals & Panels
  isSettingsModalOpen: false,
  isAdminPanelOpen: false,
  isFeatureAnalysisModalOpen: false,
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
  isFontSourcePickerOpen: false,
  isMaskPickerOpen: false,
  isElementPickerOpen: false,
  
  // Google Drive State
  driveFolder: null,
  isSyncing: false,
  syncMessage: '',
  isDriveConfigured: false,
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
    
    // Modal Toggles
    openSettingsModal: state => { state.isSettingsModalOpen = true; },
    closeSettingsModal: state => { state.isSettingsModalOpen = false; },
    openAdminPanel: state => { state.isAdminPanelOpen = true; },
    closeAdminPanel: state => { state.isAdminPanelOpen = false; },
    openFeatureAnalysisModal: state => { state.isFeatureAnalysisModalOpen = true; },
    closeFeatureAnalysisModal: state => { state.isFeatureAnalysisModalOpen = false; },
    openOAuthHelper: state => { state.isOAuthHelperOpen = true; },
    closeOAuthHelper: state => { state.isOAuthHelperOpen = false; },
    
    // Dynamic Modal Toggler
    setModalOpen: (state, action: PayloadAction<{ modal: keyof AppSliceState; isOpen: boolean }>) => {
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
  setActiveTab,
  setIsComfyUIConnected,
  setComfyUIObjectInfo,
  setVersionInfo,
  setGlobalError,
  setDriveFolder,
  setIsSyncing,
  setSyncMessage,
  setIsDriveConfigured,
  openSettingsModal,
  closeSettingsModal,
  openAdminPanel,
  closeAdminPanel,
  openFeatureAnalysisModal,
  closeFeatureAnalysisModal,
  openOAuthHelper,
  closeOAuthHelper,
  setModalOpen,
} = appSlice.actions;

export default appSlice.reducer;
