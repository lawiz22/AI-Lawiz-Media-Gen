import { configureStore } from '@reduxjs/toolkit';
import appReducer from './appSlice';
import generationReducer from './generationSlice';
import videoReducer from './videoSlice';
import promptGenReducer from './promptGenSlice';
import extractorReducer from './extractorSlice';
import logoThemeReducer from './logoThemeSlice';
import libraryReducer from './librarySlice';
import groupPhotoFusionReducer from './groupPhotoFusionSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    generation: generationReducer,
    video: videoReducer,
    promptGen: promptGenReducer,
    extractor: extractorReducer,
    logoTheme: logoThemeReducer,
    library: libraryReducer,
    groupPhotoFusion: groupPhotoFusionReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;