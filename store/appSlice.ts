import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User, VersionInfo, DriveFolder, AppSliceState, LibraryPicker } from '../types';

type DialogFlag = 'isSettingsModalOpen' | 'isVisualSettingsModalOpen' | 'isComfyUIHelperOpen' | 'isOAuthHelperOpen';
const DIALOG_FLAGS: readonly string[] = ['isSettingsModalOpen', 'isVisualSettingsModalOpen', 'isComfyUIHelperOpen', 'isOAuthHelperOpen'] satisfies DialogFlag[];

const initialState: AppSliceState = {
  currentUser: null,
  theme: 'cyberpunk',
  projectName: 'Project Lawiz 1',
  fontSize: 14,
  activeTab: 'image-generator',
  isComfyUIConnected: null,
  isMammouthConnected: false,
  comfyUIObjectInfo: null,
  versionInfo: null,
  globalError: null,
  pendingLtxTransfer: null,

  // Modals & Panels
  isSettingsModalOpen: false,
  isVisualSettingsModalOpen: false,
  isComfyUIHelperOpen: false,
  isOAuthHelperOpen: false,
  activePicker: null,

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
    },
    setTheme: (state, action: PayloadAction<string>) => {
      state.theme = action.payload;
    },
    setProjectName: (state, action: PayloadAction<string>) => {
      state.projectName = action.payload;
    },
    setFontSize: (state, action: PayloadAction<number>) => {
      state.fontSize = action.payload;
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTab = action.payload;
    },
    setIsComfyUIConnected: (state, action: PayloadAction<boolean | null>) => {
      state.isComfyUIConnected = action.payload;
    },
    setIsMammouthConnected: (state, action: PayloadAction<boolean | null>) => {
      state.isMammouthConnected = action.payload;
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
    queueLtxTransfer: {
      reducer: (state, action: PayloadAction<NonNullable<AppSliceState['pendingLtxTransfer']>>) => {
        state.pendingLtxTransfer = action.payload;
        state.activeTab = 'ltx-director';
      },
      // The transfer id is created with the action, so the reducer itself stays deterministic.
      prepare: (transfer: Omit<NonNullable<AppSliceState['pendingLtxTransfer']>, 'id'>) => ({ payload: { id: crypto.randomUUID(), ...transfer } }),
    },
    clearLtxTransfer: (state) => {
      state.pendingLtxTransfer = null;
    },
    setDriveFolder: (state, action: PayloadAction<DriveFolder | null>) => {
      state.driveFolder = action.payload;
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
    openOAuthHelper: state => { state.isOAuthHelperOpen = true; },
    closeOAuthHelper: state => { state.isOAuthHelperOpen = false; },
    openComfyUIHelper: state => { state.isComfyUIHelperOpen = true; },
    closeComfyUIHelper: state => { state.isComfyUIHelperOpen = false; },

    // Library pickers share one slot; a late close of a picker that is no longer open is ignored.
    setModalOpen: (state, action: PayloadAction<{ modal: DialogFlag | LibraryPicker; isOpen: boolean }>) => {
      const { modal, isOpen } = action.payload;
      if (DIALOG_FLAGS.includes(modal)) state[modal as DialogFlag] = isOpen;
      else if (isOpen) state.activePicker = modal as LibraryPicker;
      else if (state.activePicker === modal) state.activePicker = null;
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
  setIsMammouthConnected,
  setComfyUIObjectInfo,
  setVersionInfo,
  setGlobalError,
  queueLtxTransfer,
  clearLtxTransfer,
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
  openOAuthHelper,
  closeOAuthHelper,
  openComfyUIHelper,
  closeComfyUIHelper,
  setModalOpen,
} = appSlice.actions;

export default appSlice.reducer;
