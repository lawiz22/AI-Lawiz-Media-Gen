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
            'promptGen.promptGenState.image',
            'promptGen.promptGenState.bgImage',
            'promptGen.promptGenState.subjectImage',
            'extractor.extractorState.clothesSourceFile',
            'extractor.extractorState.objectSourceFile',
            'extractor.extractorState.poseSourceFile',
            'extractor.extractorState.mannequinReferenceFile',
            'extractor.extractorState.fontSourceFile',
            'logoTheme.logoThemeState.fontReferenceImage',
            'logoTheme.logoThemeState.bannerFontReferenceImage',
            'logoTheme.logoThemeState.albumFontReferenceImage',
            'groupPhotoFusion.uploadedFiles',
            'groupPhotoFusion.backgroundFile',
            'groupPhotoFusion.selectedPose'
        ],
        ignoredActions: [
            'app/setDriveFolder', 
            'groupPhotoFusion/setUploadedFiles', 
            'groupPhotoFusion/setBackgroundFile', 
            'groupPhotoFusion/setSelectedPose'
        ],
      },
    }),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
