import { configureStore } from '@reduxjs/toolkit';
import appReducer from './appSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // This is needed because comfyUIObjectInfo can contain non-serializable data.
        ignoredPaths: ['app.comfyUIObjectInfo', 'app.driveFolder'],
        ignoredActions: ['app/setDriveFolder'], // The folder object may not be serializable
      },
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
