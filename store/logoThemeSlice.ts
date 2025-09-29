import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LogoThemeState } from '../types';

interface LogoThemeSliceState {
  logoThemeState: LogoThemeState;
  activeLogoThemeSubTab: string;
}

const initialLogoThemeState: LogoThemeState = {
    logoPrompt: '',
    brandName: '',
    slogan: '',
    logoStyle: 'symbolic',
    fontReferenceImage: null,
    selectedFont: null,
    referenceItems: [],
    selectedPalette: null,
    numLogos: 4,
    backgroundColor: 'transparent',
    isGeneratingLogos: false,
    generatedLogos: [],
    logoError: null,
    
    bannerPrompt: '',
    bannerTitle: '',
    bannerAspectRatio: '16:9',
    bannerStyle: 'corporate-clean',
    bannerFontReferenceImage: null,
    bannerSelectedFont: null,
    bannerReferenceItems: [],
    bannerSelectedPalette: null,
    bannerSelectedLogo: null,
    bannerLogoPlacement: 'top-left',
    numBanners: 4,
    isGeneratingBanners: false,
    generatedBanners: [],
    bannerError: null,
    
    albumPrompt: '',
    albumTitle: '',
    artistName: '',
    musicStyle: 'rock',
    customMusicStyle: '',
    albumEra: 'modern',
    albumMediaType: 'digital',
    addVinylWear: false,
    albumFontReferenceImage: null,
    albumSelectedFont: null,
    albumReferenceItems: [],
    albumSelectedPalette: null,
    albumSelectedLogo: null,
    numAlbumCovers: 1,
    isGeneratingAlbumCovers: false,
    generatedAlbumCovers: [],
    albumCoverError: null,
};


const initialState: LogoThemeSliceState = {
  logoThemeState: initialLogoThemeState,
  activeLogoThemeSubTab: 'logo',
};

const logoThemeSlice = createSlice({
  name: 'logoTheme',
  initialState,
  reducers: {
    setLogoThemeState: (state, action: PayloadAction<LogoThemeState>) => {
      state.logoThemeState = action.payload;
    },
    updateLogoThemeState: (state, action: PayloadAction<Partial<LogoThemeState>>) => {
        state.logoThemeState = { ...state.logoThemeState, ...action.payload };
    },
    setActiveLogoThemeSubTab: (state, action: PayloadAction<string>) => {
      state.activeLogoThemeSubTab = action.payload;
    },
    resetLogoThemeState: (state) => {
      state.logoThemeState = initialLogoThemeState;
    },
    setLogoSaveStatus: (state, action: PayloadAction<{ index: number; status: 'idle' | 'saving' | 'saved' }>) => {
        const { index, status } = action.payload;
        if (state.logoThemeState.generatedLogos && state.logoThemeState.generatedLogos[index]) {
            state.logoThemeState.generatedLogos[index].saved = status;
        }
    },
    setBannerSaveStatus: (state, action: PayloadAction<{ index: number; status: 'idle' | 'saving' | 'saved' }>) => {
        const { index, status } = action.payload;
        if (state.logoThemeState.generatedBanners && state.logoThemeState.generatedBanners[index]) {
            state.logoThemeState.generatedBanners[index].saved = status;
        }
    },
    setAlbumCoverSaveStatus: (state, action: PayloadAction<{ index: number; status: 'idle' | 'saving' | 'saved' }>) => {
        const { index, status } = action.payload;
        if (state.logoThemeState.generatedAlbumCovers && state.logoThemeState.generatedAlbumCovers[index]) {
            state.logoThemeState.generatedAlbumCovers[index].saved = status;
        }
    },
  },
});

export const {
  setLogoThemeState,
  updateLogoThemeState,
  setActiveLogoThemeSubTab,
  resetLogoThemeState,
  setLogoSaveStatus,
  setBannerSaveStatus,
  setAlbumCoverSaveStatus,
} = logoThemeSlice.actions;

export default logoThemeSlice.reducer;