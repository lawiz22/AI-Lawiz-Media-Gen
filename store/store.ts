import { configureStore } from '@reduxjs/toolkit';
import appReducer from './appSlice';
import generationReducer from './generationSlice';
import videoReducer from './videoSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    generation: generationReducer,
    video: videoReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // This is needed because some state holds non-serializable data like File objects.
        ignoredPaths: [
            'app.comfyUIObjectInfo', 
            'app.driveFolder',
            'generation.sourceImage',
            'generation.clothingImage',
            'generation.backgroundImage',
            'generation.maskImage',
            'generation.elementImages',
            'video.videoStartFrame',
            'video.videoEndFrame',
            'video.videoUtilsState.videoFile',
            'video.videoUtilsState.colorPicker.imageFile',
        ],
        ignoredActions: ['app/setDriveFolder'], // The folder object may not be serializable
      },
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;