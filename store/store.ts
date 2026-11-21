import { configureStore, type Middleware } from '@reduxjs/toolkit';
import appReducer, { setCurrentUser, setDriveFolder, setFontSize, setProjectName } from './appSlice';
import generationReducer from './generationSlice';
import videoReducer from './videoSlice';
import promptGenReducer from './promptGenSlice';
import extractorReducer from './extractorSlice';
import logoThemeReducer from './logoThemeSlice';
import libraryReducer from './librarySlice';
import groupPhotoFusionReducer from './groupPhotoFusionSlice';

// Reducers stay pure: these preferences are written to browser storage once the state has changed.
const persistPreferences: Middleware = () => next => action => {
  const result = next(action);
  const keep = (storage: Storage, key: string, value: string | null) => { if (value === null) storage.removeItem(key); else storage.setItem(key, value); };
  if (setCurrentUser.match(action)) keep(sessionStorage, 'currentUser', action.payload ? JSON.stringify(action.payload) : null);
  else if (setProjectName.match(action)) keep(localStorage, 'projectName', action.payload);
  else if (setFontSize.match(action)) keep(localStorage, 'fontSize', action.payload.toString());
  else if (setDriveFolder.match(action)) keep(localStorage, 'drive_folder', action.payload ? JSON.stringify(action.payload) : null);
  return result;
};

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
    }).concat(persistPreferences),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;