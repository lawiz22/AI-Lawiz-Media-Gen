

import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from './store/store';
import {
    setCurrentUser, setTheme, setActiveTab, setIsComfyUIConnected, setComfyUIObjectInfo, setVersionInfo,
    setGlobalError, setDriveFolder, setIsSyncing, setSyncMessage, setIsDriveConfigured,
    openSettingsModal, closeSettingsModal, openAdminPanel, closeAdminPanel,
    openFeatureAnalysisModal, closeFeatureAnalysisModal, openOAuthHelper, closeOAuthHelper,
    setModalOpen
} from './store/appSlice';
// Fix: Imported the `selectIsReadyToGenerate` selector to resolve the "Cannot find name" error.
import {
    setSourceImage, setGenerationMode, setCharacterName, setShouldGenerateCharacterName,
    setClothingImage, setBackgroundImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
    setMaskImage, setElementImages, setOptions, updateOptions, setLoadingState,
    updateProgress, setGeneratedImages, setLastUsedPrompt, resetGenerationState,
    selectIsReadyToGenerate
} from './store/generationSlice';
import {
    setVideoStartFrame, setVideoEndFrame, setGeneratedVideoUrl, setGenerationOptionsForSave,
    // Fix: Replaced non-existent 'setVideoUtilsState' with the correct action 'updateVideoUtilsState'.
    updateVideoUtilsState, setActiveVideoUtilsSubTab, resetVideoGenerationState,
    resetVideoUtilsState, selectIsVideoReady
} from './store/videoSlice';
import {
    addSoupToHistory, setActivePromptToolsSubTab, resetPromptGenState, updatePromptGenState
} from './store/promptGenSlice';
import {
    setActiveExtractorSubTab, updateExtractorState
} from './store/extractorSlice';
import {
    setActiveLogoThemeSubTab, resetLogoThemeState, updateLogoThemeState
} from './store/logoThemeSlice';
import { fetchLibrary } from './store/librarySlice';

import type { User, GenerationOptions, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState, LibraryItemType, MannequinStyle, AppSliceState } from './types';
import { authenticateUser } from './services/cloudUserService';
import { fileToDataUrl, fileToResizedDataUrl, dataUrlToFile } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { generatePortraits, generateGeminiVideo, generateCharacterNameForImage } from './services/geminiService';
import { generateComfyUIPortraits, generateComfyUIVideo, exportComfyUIWorkflow, getComfyUIObjectInfo, checkConnection, cancelComfyUIExecution } from './services/comfyUIService';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { LibraryPanel } from './components/LibraryPanel';
// Fix: The imported component name `ClothesExtractorPanel` did not match the exported component `ExtractorToolsPanel`. Corrected the import to use the correct component name.
import { ExtractorToolsPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { VideoGeneratorPanel } from './components/VideoGeneratorPanel';
import { LibraryPickerModal } from './components/LibraryPickerModal';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { LogoThemeGeneratorPanel } from './components/LogoThemeGeneratorPanel';
import { ErrorModal } from './components/ErrorModal';
import { OAuthHelperModal } from './components/OAuthHelperModal';
import { FeatureAnalysisModal } from './components/FeatureAnalysisModal';
import { ImageGeneratorIcon, AdminIcon, LibraryIcon, VideoIcon, PromptIcon, ExtractorIcon, VideoUtilsIcon, SwatchIcon, CharacterIcon, CloseIcon } from './components/icons';
import * as driveService from './services/googleDriveService';
import { setDriveService, initializeDriveSync } from './services/libraryService';

const App: React.FC = () => {
    // --- Redux Dispatch ---
    const dispatch: AppDispatch = useDispatch();
    
    // --- App State (from appSlice) ---
    const {
        currentUser, theme, activeTab, isComfyUIConnected, comfyUIObjectInfo, versionInfo, globalError,
        isSettingsModalOpen, isAdminPanelOpen, isFeatureAnalysisModalOpen, isOAuthHelperOpen,
        isClothingPickerOpen, isBackgroundPickerOpen, isPosePickerOpen, isColorImagePickerOpen, isVideoUtilsPickerOpen,
        isStartFramePickerOpen, isEndFramePickerOpen, isLogoRefPickerOpen, isLogoPalettePickerOpen, isLogoFontPickerOpen,
        isPromptGenImagePickerOpen, isPromptGenBgImagePickerOpen, isPromptGenSubjectImagePickerOpen,
        isNunchakuSourcePickerOpen, isCharacterSourcePickerOpen, isVideoStartFramePickerOpen, isVideoEndFramePickerOpen,
        isGeminiVideoSourcePickerOpen, isClothesSourcePickerOpen, isObjectSourcePickerOpen, isPoseSourcePickerOpen,
        isBannerRefPickerOpen, isBannerPalettePickerOpen, isBannerLogoPickerOpen, isBannerFontPickerOpen,
        isAlbumCoverRefPickerOpen, isAlbumCoverPalettePickerOpen, isAlbumCoverLogoPickerOpen, isAlbumCoverFontPickerOpen,
        isMannequinRefPickerOpen, isFontSourcePickerOpen, isMaskPickerOpen, isElementPickerOpen,
        isWanVideoImagePickerOpen,
        driveFolder, isSyncing, syncMessage, isDriveConfigured
    } = useSelector((state: RootState) => state.app);

    // --- Generation State (from generationSlice) ---
    const {
        sourceImage, generationMode, characterName, shouldGenerateCharacterName, clothingImage,
        backgroundImage, previewedBackgroundImage, previewedClothingImage, maskImage, elementImages,
        options, isLoading, progressMessage, progressValue, generatedContent
    } = useSelector((state: RootState) => state.generation);

    // --- Video State (from videoSlice) ---
    const videoStartFrame = useSelector((state: RootState) => state.video.videoStartFrame);
    const videoEndFrame = useSelector((state: RootState) => state.video.videoEndFrame);
    const generatedVideoUrl = useSelector((state: RootState) => state.video.generatedVideoUrl);
    const generationOptionsForSave = useSelector((state: RootState) => state.video.generationOptionsForSave);
    const videoUtilsState = useSelector((state: RootState) => state.video.videoUtilsState);
    const activeVideoUtilsSubTab = useSelector((state: RootState) => state.video.activeVideoUtilsSubTab);

    // --- Prompt Gen State (from promptGenSlice) ---
    const activePromptToolsSubTab = useSelector((state: RootState) => state.promptGen.activePromptToolsSubTab);
    
    // --- Extractor State (from extractorSlice) ---
    const activeExtractorSubTab = useSelector((state: RootState) => state.extractor.activeExtractorSubTab);
    
    // --- Logo & Theme State (from logoThemeSlice) ---
    const logoThemeState = useSelector((state: RootState) => state.logoTheme.logoThemeState);
    const activeLogoThemeSubTab = useSelector((state: RootState) => state.logoTheme.activeLogoThemeSubTab);
    
    // --- Computed State ---
    const isReadyToGenerate = useSelector(selectIsReadyToGenerate);
    const isVideoReady = useSelector(selectIsVideoReady);
    
    // --- Memoized Handlers for Redux ---
    const handleSetOptions = useCallback((newOptions: GenerationOptions) => {
        dispatch(setOptions(newOptions));
    }, [dispatch]);

    const handleUpdateOptions = useCallback((opts: Partial<GenerationOptions>) => {
        dispatch(updateOptions(opts));
    }, [dispatch]);

    const handleSetVideoStartFrame = useCallback((file: File | null) => {
        dispatch(setVideoStartFrame(file));
    }, [dispatch]);

    const handleSetVideoEndFrame = useCallback((file: File | null) => {
        dispatch(setVideoEndFrame(file));
    }, [dispatch]);

    // --- Effects ---
    const checkComfyUIConnection = useCallback(async (url: string) => {
        dispatch(setIsComfyUIConnected(null)); // Set to loading state
        const { success } = await checkConnection(url);
        dispatch(setIsComfyUIConnected(success));
        if (success) {
            try {
                const info = await getComfyUIObjectInfo();
                dispatch(setComfyUIObjectInfo(info));
            } catch (err) {
                console.error("Failed to get ComfyUI object info:", err);
                dispatch(setGlobalError({ title: "ComfyUI Error", message: "Connected to ComfyUI, but failed to retrieve model information. Check the server console for errors." }));
            }
        }
    }, [dispatch]);

    useEffect(() => {
        fetch('/version.json').then(res => res.json()).then(data => dispatch(setVersionInfo(data))).catch(console.error);
        const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
        dispatch(setTheme(savedTheme));

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) dispatch(setCurrentUser(JSON.parse(savedUser)));
        
        const savedComfyUrl = localStorage.getItem('comfyui_url') || '';
        if (savedComfyUrl) {
            checkComfyUIConnection(savedComfyUrl);
        } else {
            dispatch(setIsComfyUIConnected(false));
        }
        
        const savedClientId = localStorage.getItem('google_client_id') || '';
        dispatch(setIsDriveConfigured(!!savedClientId));
        
        if (savedClientId) {
            setDriveService(driveService);
            driveService.restoreConnection().then(connected => {
                if (connected) {
                    const savedFolder = localStorage.getItem('drive_folder');
                    if (savedFolder) {
                        const folder = JSON.parse(savedFolder);
                        dispatch(setDriveFolder(folder));
                        driveService.setFolder(folder);
                    }
                }
            });
        }
        
        // Fetch library items on initial load
        dispatch(fetchLibrary());

    }, [dispatch, checkComfyUIConnection]);
    
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    
    const handleLogin = async (username: string, password: string): Promise<string | true> => {
        const user = await authenticateUser(username, password);
        if (user) {
            dispatch(setCurrentUser(user));
            return true;
        }
        return "Invalid username or password.";
    };

    const handleLogout = () => {
        dispatch(setCurrentUser(null));
    };

    const handleThemeChange = (newTheme: string) => {
        dispatch(setTheme(newTheme));
    };
    
    const handleReset = () => {
        dispatch(resetGenerationState());
    };
    
    const handleVideoReset = () => {
        dispatch(resetVideoGenerationState());
    };
    
    const handlePromptGenReset = useCallback(() => {
        dispatch(resetPromptGenState());
    }, [dispatch]);

    const handleVideoUtilsReset = useCallback(() => {
        dispatch(resetVideoUtilsState());
    }, [dispatch]);

    const handleGenerate = async () => {
        dispatch(setLoadingState({ isLoading: true }));
        dispatch(setGeneratedImages({ tabId: activeTab, images: [] }));
        dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: null }));
        dispatch(setGlobalError(null));
        if (!shouldGenerateCharacterName) {
             dispatch(setCharacterName(''));
        }
        
        const localUpdateProgress = (message: string, value: number) => {
            dispatch(updateProgress({ message, value }));
        };
        
        try {
            let result: { images: string[]; finalPrompt: string | null } = { images: [], finalPrompt: null };
            
            if (options.provider === 'gemini') {
                if (options.geminiMode === 't2i') {
                    result = await generatePortraits(
                        null, options, localUpdateProgress, null, null,
                        previewedBackgroundImage, previewedClothingImage, null, []
                    );
                } else {
                    if (!sourceImage) throw new Error("Source image is required for Image-to-Image mode.");
                    result = await generatePortraits(
                        sourceImage, options, localUpdateProgress, clothingImage, backgroundImage,
                        previewedBackgroundImage, previewedClothingImage, maskImage, elementImages
                    );
                }
            } else if (options.provider === 'comfyui') {
                result = await generateComfyUIPortraits(sourceImage, options, localUpdateProgress);
            }
            
            dispatch(setGeneratedImages({ tabId: activeTab, images: result.images }));
            dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: result.finalPrompt }));
            
            if(result.images.length > 0) {
                if (activeTab === 'character-generator' && shouldGenerateCharacterName) {
                    localUpdateProgress("Generating character name...", 0.96);
                    try {
                        const name = await generateCharacterNameForImage(result.images[0]);
                        dispatch(setCharacterName(name));
                    } catch (nameError) {
                        console.warn("Could not generate character name:", nameError);
                        dispatch(setCharacterName('')); // Clear on error
                    }
                }
            }

        } catch (err: any) {
            console.error("Generation failed:", err);
            if (err.message?.includes('cancelled by the user')) {
                console.log("Generation promise rejected due to cancellation.");
            } else {
                dispatch(setGlobalError({ title: "Generation Error", message: err.message || 'An unknown error occurred during generation.' }));
            }
        } finally {
            dispatch(setLoadingState({ isLoading: false }));
        }
    };
    
    const handleGenerateVideo = async () => {
        dispatch(setLoadingState({ isLoading: true }));
        dispatch(setGeneratedVideoUrl(null));
        dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: null }));
        dispatch(setGlobalError(null));
        dispatch(setGenerationOptionsForSave(options));

        const localUpdateProgress = (message: string, value: number) => {
            dispatch(updateProgress({ message, value }));
        };

        try {
            if (options.videoProvider === 'comfyui') {
                const { videoUrl, finalPrompt } = await generateComfyUIVideo(
                    videoStartFrame, videoEndFrame, options, localUpdateProgress
                );
                dispatch(setGeneratedVideoUrl(videoUrl));
                dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: finalPrompt }));
            } else if (options.videoProvider === 'gemini') {
                const { videoUrl, finalPrompt } = await generateGeminiVideo(
                    options,
                    videoStartFrame, // This is optional for the service
                    localUpdateProgress
                );
                dispatch(setGeneratedVideoUrl(videoUrl));
                dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: finalPrompt }));
            } else {
                 throw new Error("Selected video provider is not implemented.");
            }
        } catch (err: any) {
            console.error("Video generation failed:", err);
            if (err.message?.includes('cancelled by the user')) {
                console.log("Video generation promise rejected due to cancellation.");
            } else {
                dispatch(setGlobalError({ title: "Video Generation Error", message: err.message || 'An unknown error occurred during video generation.' }));
            }
        } finally {
            dispatch(setLoadingState({ isLoading: false }));
        }
    };

    const handleSaveSettings = (comfyUIUrl: string, googleClientId: string) => {
        localStorage.setItem('comfyui_url', comfyUIUrl);
        localStorage.setItem('google_client_id', googleClientId);
        checkComfyUIConnection(comfyUIUrl);
        dispatch(setIsDriveConfigured(!!googleClientId));
        if (googleClientId) {
            setDriveService(driveService); // Re-initialize with new client ID
        } else {
            setDriveService(null);
            handleDriveDisconnect(); // Disconnect if ID is removed
        }
    };

    const handleSendToI2I = async (imageDataUrl: string) => {
        try {
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], "i2i_source_image.jpeg", { type: "image/jpeg" });
            dispatch(setSourceImage(file));
            dispatch(setGenerationMode('i2i'));
            dispatch(setActiveTab('image-generator'));
            dispatch(setCharacterName(''));
        } catch (error) {
            console.error("Error setting image for I2I:", error);
            dispatch(setGlobalError({ title: "File Error", message: "Could not use the selected image as a new source for I2I." }));
        }
    };

    const handleSendToCharacter = async (imageDataUrl: string) => {
        try {
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], "character_source_image.jpeg", { type: "image/jpeg" });
            dispatch(setSourceImage(file));
            dispatch(setCharacterName(''));
            dispatch(setActiveTab('character-generator'));
        } catch (error) {
            console.error("Error setting new source image for character:", error);
            dispatch(setGlobalError({ title: "File Error", message: "Could not use the selected image as a new character source." }));
        }
    };
    
    const handleLoadLibraryItem = async (item: LibraryItem) => {
        if (item.options) {
            dispatch(setOptions(item.options));
        }
        
        let sourceToSet: File | null = null;
        if (item.mediaType === 'image' || item.mediaType === 'video' || item.mediaType === 'character') {
            if (item.sourceImage || item.startFrame) {
                try {
                    const sourceDataUrl = item.sourceImage || item.startFrame;
                    const response = await fetch(sourceDataUrl!);
                    const blob = await response.blob();
                    sourceToSet = new File([blob], "library-source.jpeg", { type: "image/jpeg" });
                } catch(e) { console.error("Could not load library source image:", e); }
            }
        }

        switch (item.mediaType) {
            case 'character':
                dispatch(setSourceImage(sourceToSet));
                dispatch(setGeneratedImages({ tabId: 'character-generator', images: [item.media] }));
                dispatch(setGeneratedImages({ tabId: 'image-generator', images: [] }));
                dispatch(setLastUsedPrompt({ tabId: 'image-generator', prompt: null }));
                // When loading a character, parse the name to separate it from the description
                const [namePart] = (item.name || '').split(':');
                dispatch(setCharacterName(namePart.trim()));
                dispatch(setActiveTab('character-generator'));
                break;
            case 'image':
                dispatch(setSourceImage(sourceToSet));
                dispatch(setGeneratedImages({ tabId: 'image-generator', images: [item.media] }));
                dispatch(setGeneratedImages({ tabId: 'character-generator', images: [] }));
                dispatch(setLastUsedPrompt({ tabId: 'character-generator', prompt: null }));
                dispatch(setCharacterName(''));
                const isI2I = !!sourceToSet || item.options?.geminiMode === 'i2i';
                dispatch(setGenerationMode(isI2I ? 'i2i' : 't2i'));
                dispatch(setActiveTab('image-generator'));
                break;
            case 'video':
                dispatch(setVideoStartFrame(sourceToSet));
                if (item.endFrame) {
                    try {
                         const response = await fetch(item.endFrame);
                         const blob = await response.blob();
                         dispatch(setVideoEndFrame(new File([blob], "library-end-frame.jpeg", { type: "image/jpeg" })));
                    } catch(e) { console.error("Could not load library end frame image:", e); }
                } else {
                    dispatch(setVideoEndFrame(null));
                }
                dispatch(setGeneratedVideoUrl(item.media));
                dispatch(setActiveTab('video-generator'));
                break;
            case 'clothes':
            case 'prompt':
            default:
                break;
        }
    };
    
    const handleUsePrompt = (prompt: string) => {
        dispatch(updateOptions({ comfyPrompt: prompt, provider: 'comfyui' }));
        dispatch(setActiveTab('image-generator'));
    };
    
    const handleDriveConnect = async () => {
        try {
            const folder = await driveService.connectAndPickFolder();
            if (folder) {
                dispatch(setDriveFolder(folder));
                await handleSyncWithDrive(folder);
            }
        } catch (error: any) {
            if (error.message?.includes("popup_closed_by_user")) {
              return; // User cancelled, do nothing.
            }
            if (error.message?.includes("invalid client") || error.message?.includes("Check your OAuth Client ID")) {
                dispatch(openOAuthHelper());
            } else if (error.message?.includes("Check API Key")) {
                dispatch(openOAuthHelper());
            }
            else {
                dispatch(setGlobalError({ title: "Google Drive Connection Error", message: error.message || "An unknown error occurred." }));
            }
        }
    };
    
    const handleSyncWithDrive = async (newFolder?: DriveFolder) => {
        const folderToSync = newFolder || driveFolder;
        if (!folderToSync) {
            dispatch(setGlobalError({ title: "Sync Error", message: "You must connect to a Drive folder first." }));
            return;
        }
        dispatch(setIsSyncing(true));
        try {
            await initializeDriveSync((msg) => dispatch(setSyncMessage(msg)));
            // After sync, re-fetch the library to update the UI with any changes.
            dispatch(fetchLibrary());
        } catch (error: any) {
            dispatch(setGlobalError({ title: "Google Drive Sync Error", message: error.message || "An unknown sync error occurred." }));
        } finally {
            dispatch(setIsSyncing(false));
            dispatch(setSyncMessage(''));
        }
    };

    const handleDriveDisconnect = () => {
        driveService.disconnect();
        dispatch(setDriveFolder(null));
    };

    const handleExport = async () => {
        if (!options) return;
        try {
            await exportComfyUIWorkflow(options, sourceImage);
        } catch (error: any) {
            dispatch(setGlobalError({ title: "Workflow Export Error", message: error.message || 'Failed to export workflow.' }));
        }
    };

    const handleCancelGeneration = async () => {
        console.log("User requested to cancel generation.");
        if (options.provider === 'comfyui' || options.videoProvider === 'comfyui') {
            try {
                await cancelComfyUIExecution();
                dispatch(setGlobalError({ title: "Operation Cancelled", message: "The generation was successfully cancelled." }));
            } catch (e: any) {
                dispatch(setGlobalError({ title: "Cancellation Error", message: e.message || "Could not cancel the operation." }));
            }
        } else {
            console.warn("Cancellation is not supported for the current provider.");
        }

        dispatch(setLoadingState({ isLoading: false }));
    };

    const handleTabClick = (tabId: string) => {
        if (tabId === 'character-generator') {
            // This tab is Gemini I2I only
            dispatch(setGenerationMode('i2i'));
            dispatch(updateOptions({ provider: 'gemini', geminiMode: 'i2i', geminiI2iMode: 'general' }));
        } else if (tabId === 'image-generator') {
            // Reset to T2I when coming back to this tab
            dispatch(setGenerationMode('t2i'));
            if (options.provider === 'gemini') {
                dispatch(updateOptions({ geminiMode: 't2i' }));
            }
        }
        dispatch(setActiveTab(tabId));
    };
    
    // Fix: Narrowed the `modal` parameter type to only include valid boolean modal flag keys from the state.
    // This ensures type safety when calling the `setModalOpen` reducer, resolving downstream type errors.
    const openModal = (modal: Extract<keyof AppSliceState, `is${string}Open`>) => { dispatch(setModalOpen({ modal, isOpen: true })); };
    const closeModal = (modal: Extract<keyof AppSliceState, `is${string}Open`>) => { dispatch(setModalOpen({ modal, isOpen: false })); };

    if (!currentUser) {
        return <Login onLogin={handleLogin} />;
    }

    const TABS = [
        { id: 'image-generator', label: 'Image Generator', icon: <ImageGeneratorIcon className="w-5 h-5"/> },
        { id: 'character-generator', label: 'Character/Poses Generator', icon: <CharacterIcon className="w-5 h-5"/> },
        { id: 'video-generator', label: 'Video Generator', icon: <VideoIcon className="w-5 h-5"/> },
        { id: 'logo-theme-generator', label: 'Logo/Theme Generator', icon: <SwatchIcon className="w-5 h-5"/> },
        { id: 'library', label: 'Library', icon: <LibraryIcon className="w-5 h-5"/> },
        { id: 'prompt-generator', label: 'Prompt Tools', icon: <PromptIcon className="w-5 h-5"/>, adminOnly: true },
        { id: 'extractor-tools', label: 'Extractor Tools', icon: <ExtractorIcon className="w-5 h-5"/> },
        { id: 'video-utils', label: 'Video Utilities', icon: <VideoUtilsIcon className="w-5 h-5"/> },
    ];

    const imageLikeFilter: LibraryItemType[] = ['image', 'character', 'logo', 'album-cover', 'clothes', 'object', 'extracted-frame', 'pose', 'font'];
    const broadImagePickerFilter: LibraryItemType[] = ['image', 'character', 'logo', 'album-cover', 'clothes', 'extracted-frame', 'object', 'pose', 'font'];
    
    const imageGenContent = generatedContent['image-generator'] || { images: [], lastUsedPrompt: null };
    const charGenContent = generatedContent['character-generator'] || { images: [], lastUsedPrompt: null };

    return (
        <div className="min-h-screen bg-bg-primary text-text-primary font-sans">
            <Header 
                theme={theme} 
                setTheme={handleThemeChange} 
                onLogout={handleLogout} 
                currentUser={currentUser}
                onOpenSettingsModal={() => dispatch(openSettingsModal())}
                onOpenAdminPanel={() => dispatch(openAdminPanel())}
                onOpenFeatureAnalysisModal={() => dispatch(openFeatureAnalysisModal())}
                isComfyUIConnected={isComfyUIConnected}
                versionInfo={versionInfo}
                driveFolder={driveFolder}
                onDriveConnect={handleDriveConnect}
                onDriveDisconnect={handleDriveDisconnect}
                isDriveConfigured={isDriveConfigured}
            />
            <main className="container mx-auto p-4 md:p-8">
                <div className="flex flex-wrap items-center justify-center border-b-2 border-border-primary mb-8">
                    {TABS.map(tab => {
                        if (tab.adminOnly && currentUser.role !== 'admin') {
                            return null;
                        }
                        return (
                             <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors duration-200 border-b-4 ${
                                    activeTab === tab.id
                                    ? 'border-accent text-accent'
                                    : 'border-transparent text-text-secondary hover:border-accent/50 hover:text-text-primary'
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        )
                    })}
                </div>

                <div className={activeTab === 'image-generator' ? 'block' : 'hidden'}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        {/* --- Controls Column (Left) --- */}
                        <div className="lg:col-span-1 space-y-8 sticky top-24">
                            {generationMode === 'i2i' && (
                                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                    <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Source Image</h2>
                                     <div className="flex items-center gap-2">
                                        <div className="flex-grow">
                                            <ImageUploader 
                                                label="Source Image" 
                                                id="i2i-source-image" 
                                                onImageUpload={(file) => dispatch(setSourceImage(file))} 
                                                sourceFile={sourceImage}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => openModal('isNunchakuSourcePickerOpen')} 
                                            className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                            title="Select from Library"
                                        >
                                            <LibraryIcon className="w-6 h-6"/>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <OptionsPanel 
                                title={generationMode === 'i2i' ? "2. Configure Options" : "1. Configure Options"}
                                options={options} 
                                setOptions={handleSetOptions}
                                updateOptions={handleUpdateOptions}
                                generationMode={generationMode}
                                setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                                onGenerate={handleGenerate}
                                onReset={handleReset}
                                onGeneratePrompt={() => {}}
                                onExportWorkflow={handleExport}
                                isDisabled={isLoading}
                                isReady={isReadyToGenerate}
                                isGeneratingPrompt={false}
                                previewedBackgroundImage={previewedBackgroundImage}
                                setPreviewedBackgroundImage={(url) => dispatch(setPreviewedBackgroundImage(url))}
                                previewedClothingImage={previewedClothingImage}
                                setPreviewedClothingImage={(url) => dispatch(setPreviewedClothingImage(url))}
                                comfyUIObjectInfo={comfyUIObjectInfo}
                                comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                sourceImage={sourceImage}
                                hideGeminiModeSwitch={true}
                                activeTab={activeTab}
                                maskImage={maskImage}
                                setMaskImage={(file) => dispatch(setMaskImage(file))}
                                elementImages={elementImages}
                                setElementImages={(files) => dispatch(setElementImages(files))}
                                onOpenMaskPicker={() => openModal('isMaskPickerOpen')}
                                onOpenElementPicker={() => openModal('isElementPickerOpen')}
                            />
                        </div>

                        {/* --- Results Column (Right) --- */}
                        <div className="lg:col-span-2">
                           <ImageGrid 
                                images={imageGenContent.images} 
                                onSendToI2I={handleSendToI2I}
                                onSendToCharacter={handleSendToCharacter}
                                lastUsedPrompt={imageGenContent.lastUsedPrompt}
                                options={options}
                                sourceImage={sourceImage}
                                characterName={characterName}
                                activeTab={activeTab}
                            />
                             {imageGenContent.images.length === 0 && !isLoading && (
                                <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg h-full min-h-[500px]">
                                    <ImageGeneratorIcon className="w-16 h-16 text-border-primary mb-4" />
                                    <h3 className="text-lg font-bold text-text-primary">Your generated images will appear here</h3>
                                    <p className="text-text-secondary max-w-xs">Configure your options and click "Generate".</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'character-generator' ? 'block' : 'hidden'}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        {/* --- Controls Column (Left) --- */}
                        <div className="lg:col-span-1 space-y-8 sticky top-24">
                            <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Source Image</h2>
                                <div className="flex items-center gap-2">
                                    <div className="flex-grow">
                                        <ImageUploader 
                                            label="Source Face / Pose" 
                                            id="source-image" 
                                            onImageUpload={(file) => dispatch(setSourceImage(file))} 
                                            sourceFile={sourceImage}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => openModal('isCharacterSourcePickerOpen')} 
                                        className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                        title="Select from Library"
                                    >
                                        <LibraryIcon className="w-6 h-6"/>
                                    </button>
                                </div>
                                 <div className="mt-4">
                                    <label htmlFor="character-name" className="block text-sm font-medium text-text-secondary">Character Name</label>
                                    <input
                                        type="text"
                                        id="character-name"
                                        value={characterName}
                                        onChange={(e) => dispatch(setCharacterName(e.target.value))}
                                        placeholder={shouldGenerateCharacterName ? "AI will suggest a name after generation..." : "Enter a name for your character"}
                                        className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                        disabled={isLoading}
                                    />
                                    <div className="mt-2">
                                        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={shouldGenerateCharacterName}
                                                onChange={(e) => dispatch(setShouldGenerateCharacterName(e.target.checked))}
                                                disabled={isLoading}
                                                className="rounded text-accent focus:ring-accent"
                                            />
                                            Use AI to generate a name
                                        </label>
                                    </div>
                                </div>
                            </div>
                            
                            {(options.clothing === 'image' || options.background === 'image') && (
                                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                    <h2 className="text-xl font-bold mb-4 text-accent">Optional Reference Images</h2>
                                    <div className="space-y-4">
                                        {options.clothing === 'image' && (
                                            <div className="flex items-center gap-2">
                                                <ImageUploader label="Clothing" id="clothing-image" onImageUpload={(file) => dispatch(setClothingImage(file))} sourceFile={clothingImage} />
                                                <button onClick={() => openModal('isClothingPickerOpen')} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary">
                                                    <LibraryIcon className="w-6 h-6"/>
                                                </button>
                                            </div>
                                        )}
                                        {options.background === 'image' && (
                                            <div className="flex items-center gap-2">
                                                <ImageUploader label="Background" id="background-image" onImageUpload={(file) => dispatch(setBackgroundImage(file))} sourceFile={backgroundImage}/>
                                                <button onClick={() => openModal('isBackgroundPickerOpen')} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary">
                                                    <LibraryIcon className="w-6 h-6"/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <OptionsPanel 
                                title="2. Configure Options"
                                options={options} 
                                setOptions={handleSetOptions}
                                updateOptions={handleUpdateOptions}
                                generationMode={generationMode}
                                setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                                onGenerate={handleGenerate}
                                onReset={handleReset}
                                onGeneratePrompt={() => {}}
                                onOpenPosePicker={() => openModal('isPosePickerOpen')}
                                onExportWorkflow={handleExport}
                                isDisabled={isLoading}
                                isReady={isReadyToGenerate}
                                isGeneratingPrompt={false}
                                previewedBackgroundImage={previewedBackgroundImage}
                                setPreviewedBackgroundImage={(url) => dispatch(setPreviewedBackgroundImage(url))}
                                previewedClothingImage={previewedClothingImage}
                                setPreviewedClothingImage={(url) => dispatch(setPreviewedClothingImage(url))}
                                comfyUIObjectInfo={comfyUIObjectInfo}
                                comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                sourceImage={sourceImage}
                                hideProviderSwitch={true}
                                hideGeminiModeSwitch={true}
                                hideGenerationModeSwitch={true}
                                activeTab={activeTab}
                                maskImage={maskImage}
                                setMaskImage={(file) => dispatch(setMaskImage(file))}
                                elementImages={elementImages}
                                setElementImages={(files) => dispatch(setElementImages(files))}
                                onOpenMaskPicker={() => {}}
                                onOpenElementPicker={() => {}}
                            />
                        </div>

                        {/* --- Results Column (Right) --- */}
                        <div className="lg:col-span-2">
                           <ImageGrid 
                                images={charGenContent.images} 
                                onSendToI2I={handleSendToI2I}
                                onSendToCharacter={handleSendToCharacter}
                                lastUsedPrompt={charGenContent.lastUsedPrompt}
                                options={options}
                                sourceImage={sourceImage}
                                characterName={characterName}
                                activeTab={activeTab}
                            />
                             {charGenContent.images.length === 0 && !isLoading && (
                                <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg h-full min-h-[500px]">
                                    <CharacterIcon className="w-16 h-16 text-border-primary mb-4" />
                                    <h3 className="text-lg font-bold text-text-primary">Your generated characters will appear here</h3>
                                    <p className="text-text-secondary max-w-xs">Upload a source image, configure options, and click "Generate".</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className={activeTab === 'video-generator' ? 'block' : 'hidden'}>
                     <VideoGeneratorPanel
                        options={options}
                        setOptions={handleUpdateOptions}
                        comfyUIObjectInfo={comfyUIObjectInfo}
                        startFrame={videoStartFrame}
                        setStartFrame={handleSetVideoStartFrame}
                        endFrame={videoEndFrame}
                        setEndFrame={handleSetVideoEndFrame}
                        onGenerate={handleGenerateVideo}
                        isReady={isVideoReady}
                        isLoading={isLoading}
                        error={globalError ? globalError.message : null}
                        generatedVideo={generatedVideoUrl}
                        lastUsedPrompt={generatedContent[activeTab]?.lastUsedPrompt || null}
                        progressMessage={progressMessage}
                        progressValue={progressValue}
                        onReset={handleVideoReset}
                        generationOptionsForSave={generationOptionsForSave}
                        onOpenLibraryForStartFrame={() => openModal('isVideoStartFramePickerOpen')}
                        onOpenLibraryForEndFrame={() => openModal('isVideoEndFramePickerOpen')}
                        onOpenLibraryForGeminiSource={() => openModal('isGeminiVideoSourcePickerOpen')}
                    />
                </div>

                <div className={activeTab === 'logo-theme-generator' ? 'block' : 'hidden'}>
                    <LogoThemeGeneratorPanel
                        activeSubTab={activeLogoThemeSubTab}
                        setActiveSubTab={(tab) => dispatch(setActiveLogoThemeSubTab(tab))}
                        onOpenLibraryForReferences={() => openModal('isLogoRefPickerOpen')}
                        onOpenLibraryForPalette={() => openModal('isLogoPalettePickerOpen')}
                        onOpenLibraryForFont={() => openModal('isLogoFontPickerOpen')}
                        onOpenLibraryForBannerReferences={() => openModal('isBannerRefPickerOpen')}
                        onOpenLibraryForBannerPalette={() => openModal('isBannerPalettePickerOpen')}
                        onOpenLibraryForBannerLogo={() => openModal('isBannerLogoPickerOpen')}
                        onOpenLibraryForBannerFont={() => openModal('isBannerFontPickerOpen')}
                        onOpenLibraryForAlbumCoverReferences={() => openModal('isAlbumCoverRefPickerOpen')}
                        onOpenLibraryForAlbumCoverPalette={() => openModal('isAlbumCoverPalettePickerOpen')}
                        onOpenLibraryForAlbumCoverLogo={() => openModal('isAlbumCoverLogoPickerOpen')}
                        onOpenLibraryForAlbumCoverFont={() => openModal('isAlbumCoverFontPickerOpen')}
                    />
                </div>

                <div className={activeTab === 'library' ? 'block' : 'hidden'}>
                    <LibraryPanel 
                        onLoadItem={handleLoadLibraryItem} 
                        isDriveConnected={!!driveFolder}
                        onSyncWithDrive={handleSyncWithDrive}
                        isSyncing={isSyncing}
                        syncMessage={syncMessage}
                        isDriveConfigured={isDriveConfigured}
                    />
                </div>
                
                {currentUser.role === 'admin' && (
                    <div className={activeTab === 'prompt-generator' ? 'block' : 'hidden'}>
                        <PromptGeneratorPanel 
                            activeSubTab={activePromptToolsSubTab}
                            setActiveSubTab={(tab) => dispatch(setActivePromptToolsSubTab(tab))}
                            onUsePrompt={handleUsePrompt}
                            onOpenLibraryForImage={() => openModal('isPromptGenImagePickerOpen')}
                            onOpenLibraryForBg={() => openModal('isPromptGenBgImagePickerOpen')}
                            onOpenLibraryForSubject={() => openModal('isPromptGenSubjectImagePickerOpen')}
                            onOpenLibraryForWanVideoImage={() => openModal('isWanVideoImagePickerOpen')}
                            onReset={handlePromptGenReset}
                        />
                    </div>
                )}
                
                <div className={activeTab === 'extractor-tools' ? 'block' : 'hidden'}>
                    {/* Fix: Added all required props to the ExtractorToolsPanel component. */}
                    <ExtractorToolsPanel 
                        onOpenLibraryForClothes={() => openModal('isClothesSourcePickerOpen')}
                        onOpenLibraryForObjects={() => openModal('isObjectSourcePickerOpen')}
                        onOpenLibraryForPoses={() => openModal('isPoseSourcePickerOpen')}
                        onOpenLibraryForMannequinRef={() => openModal('isMannequinRefPickerOpen')}
                        onOpenLibraryForFont={() => openModal('isFontSourcePickerOpen')}
                        activeSubTab={activeExtractorSubTab}
                        setActiveSubTab={(tab) => dispatch(setActiveExtractorSubTab(tab))}
                    />
                </div>
                
                <div className={activeTab === 'video-utils' ? 'block' : 'hidden'}>
                    <VideoUtilsPanel
                        setStartFrame={handleSetVideoStartFrame}
                        setEndFrame={handleSetVideoEndFrame}
                        onOpenLibrary={(() => openModal('isColorImagePickerOpen'))}
                        onOpenVideoLibrary={(() => openModal('isVideoUtilsPickerOpen'))}
                        activeSubTab={activeVideoUtilsSubTab}
                        setActiveSubTab={(tab) => dispatch(setActiveVideoUtilsSubTab(tab))}
                        onReset={handleVideoUtilsReset}
                    />
                </div>
                
            </main>
            {isLoading && (
                <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4">
                    <Loader 
                        message={progressMessage} 
                        progress={progressValue} 
                        onCancel={handleCancelGeneration}
                    />
                </div>
            )}
             {globalError && (
                <ErrorModal 
                    title={globalError.title} 
                    message={globalError.message} 
                    onClose={() => dispatch(setGlobalError(null))} 
                />
            )}
            {isSettingsModalOpen && (
                <ConnectionSettingsModal 
                    isOpen={isSettingsModalOpen} 
                    onClose={() => dispatch(closeSettingsModal())} 
                    initialComfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                    initialGoogleClientId={localStorage.getItem('google_client_id') || ''}
                    onSave={handleSaveSettings}
                />
            )}
             {isAdminPanelOpen && (
                <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4" onClick={() => dispatch(closeAdminPanel())}>
                    <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
                        <AdminPanel />
                    </div>
                </div>
            )}
             {isFeatureAnalysisModalOpen && (
                 <FeatureAnalysisModal isOpen={isFeatureAnalysisModalOpen} onClose={() => dispatch(closeFeatureAnalysisModal())} />
            )}
            {isOAuthHelperOpen && (
                <OAuthHelperModal
                    isOpen={isOAuthHelperOpen}
                    onClose={() => dispatch(closeOAuthHelper())}
                    onProceed={() => {
                        dispatch(closeOAuthHelper());
                        handleDriveConnect();
                    }}
                    clientId={localStorage.getItem('google_client_id') || ''}
                    origin={window.location.origin}
                />
            )}
            <LibraryPickerModal isOpen={isClothingPickerOpen} onClose={() => closeModal('isClothingPickerOpen')} onSelectItem={item => dispatch(setClothingImage(dataUrlToFile(item.media, item.name || 'clothing.jpeg')))} filter="clothes" />
            <LibraryPickerModal isOpen={isBackgroundPickerOpen} onClose={() => closeModal('isBackgroundPickerOpen')} onSelectItem={item => dispatch(setBackgroundImage(dataUrlToFile(item.media, item.name || 'background.jpeg')))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isPosePickerOpen} onClose={() => closeModal('isPosePickerOpen')} onSelectItem={item => {}} filter="pose" multiSelect={true} onSelectMultiple={(items) => dispatch(updateOptions({ poseLibraryItems: items }))} />
            <LibraryPickerModal isOpen={isColorImagePickerOpen} onClose={() => closeModal('isColorImagePickerOpen')} onSelectItem={item => dispatch(updateVideoUtilsState({ colorPicker: { ...videoUtilsState.colorPicker, imageFile: dataUrlToFile(item.media, item.name || 'color-source.jpeg') } }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isVideoUtilsPickerOpen} onClose={() => closeModal('isVideoUtilsPickerOpen')} onSelectItem={item => dispatch(updateVideoUtilsState({ videoFile: dataUrlToFile(item.media, item.name || 'video.mp4') }))} filter="video" />
            <LibraryPickerModal isOpen={isVideoStartFramePickerOpen} onClose={() => closeModal('isVideoStartFramePickerOpen')} onSelectItem={item => dispatch(setVideoStartFrame(dataUrlToFile(item.media, item.name || 'start-frame.jpeg')))} filter={['image', 'character', 'extracted-frame']} />
            <LibraryPickerModal isOpen={isVideoEndFramePickerOpen} onClose={() => closeModal('isVideoEndFramePickerOpen')} onSelectItem={item => dispatch(setVideoEndFrame(dataUrlToFile(item.media, item.name || 'end-frame.jpeg')))} filter={['image', 'character', 'extracted-frame']} />
            <LibraryPickerModal isOpen={isGeminiVideoSourcePickerOpen} onClose={() => closeModal('isGeminiVideoSourcePickerOpen')} onSelectItem={item => dispatch(setVideoStartFrame(dataUrlToFile(item.media, item.name || 'gemini-source.jpeg')))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isNunchakuSourcePickerOpen} onClose={() => closeModal('isNunchakuSourcePickerOpen')} onSelectItem={item => dispatch(setSourceImage(dataUrlToFile(item.media, item.name || 'nunchaku-source.jpeg')))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isCharacterSourcePickerOpen} onClose={() => closeModal('isCharacterSourcePickerOpen')} onSelectItem={item => dispatch(setSourceImage(dataUrlToFile(item.media, item.name || 'character-source.jpeg')))} filter={['image', 'character']} />
            
            {/* Prompt Gen Pickers */}
            <LibraryPickerModal isOpen={isPromptGenImagePickerOpen} onClose={() => closeModal('isPromptGenImagePickerOpen')} onSelectItem={item => dispatch(updatePromptGenState({ image: dataUrlToFile(item.media, 'prompt-source.jpeg') }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isPromptGenBgImagePickerOpen} onClose={() => closeModal('isPromptGenBgImagePickerOpen')} onSelectItem={item => dispatch(updatePromptGenState({ bgImage: dataUrlToFile(item.media, 'bg-source.jpeg') }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isPromptGenSubjectImagePickerOpen} onClose={() => closeModal('isPromptGenSubjectImagePickerOpen')} onSelectItem={item => dispatch(updatePromptGenState({ subjectImage: dataUrlToFile(item.media, 'subject-source.jpeg') }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isWanVideoImagePickerOpen} onClose={() => closeModal('isWanVideoImagePickerOpen')} onSelectItem={item => dispatch(updatePromptGenState({ wanVideoImage: dataUrlToFile(item.media, 'wan-video-source.jpeg') }))} filter={imageLikeFilter} />
            
            {/* Extractor Pickers */}
            <LibraryPickerModal isOpen={isClothesSourcePickerOpen} onClose={() => closeModal('isClothesSourcePickerOpen')} onSelectItem={item => dispatch(updateExtractorState({ clothesSourceFile: dataUrlToFile(item.media, item.name || 'clothes-source.jpeg') }))} filter={['image', 'character']} />
            <LibraryPickerModal isOpen={isObjectSourcePickerOpen} onClose={() => closeModal('isObjectSourcePickerOpen')} onSelectItem={item => dispatch(updateExtractorState({ objectSourceFile: dataUrlToFile(item.media, item.name || 'object-source.jpeg') }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isPoseSourcePickerOpen} onClose={() => closeModal('isPoseSourcePickerOpen')} onSelectItem={item => dispatch(updateExtractorState({ poseSourceFile: dataUrlToFile(item.media, item.name || 'pose-source.jpeg') }))} filter={['image', 'character']} />
            <LibraryPickerModal isOpen={isMannequinRefPickerOpen} onClose={() => closeModal('isMannequinRefPickerOpen')} onSelectItem={item => dispatch(updateExtractorState({ mannequinReferenceFile: dataUrlToFile(item.media, item.name || 'mannequin-ref.jpeg') }))} filter={['image', 'character']} />
            <LibraryPickerModal isOpen={isFontSourcePickerOpen} onClose={() => closeModal('isFontSourcePickerOpen')} onSelectItem={item => dispatch(updateExtractorState({ fontSourceFile: dataUrlToFile(item.media, item.name || 'font-source.jpeg') }))} filter={imageLikeFilter} />
            
            {/* Logo/Theme Pickers */}
            <LibraryPickerModal isOpen={isLogoRefPickerOpen} onClose={() => closeModal('isLogoRefPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ referenceItems: [...(logoThemeState.referenceItems || []), item] }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isLogoPalettePickerOpen} onClose={() => closeModal('isLogoPalettePickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ selectedPalette: item }))} filter={'color-palette'} />
            <LibraryPickerModal isOpen={isLogoFontPickerOpen} onClose={() => closeModal('isLogoFontPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ selectedFont: item, fontReferenceImage: null }))} filter={'font'} />
            
            <LibraryPickerModal isOpen={isBannerRefPickerOpen} onClose={() => closeModal('isBannerRefPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ bannerReferenceItems: [...(logoThemeState.bannerReferenceItems || []), item] }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isBannerPalettePickerOpen} onClose={() => closeModal('isBannerPalettePickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedPalette: item }))} filter={'color-palette'} />
            <LibraryPickerModal isOpen={isBannerLogoPickerOpen} onClose={() => closeModal('isBannerLogoPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedLogo: item }))} filter={'logo'} />
            <LibraryPickerModal isOpen={isBannerFontPickerOpen} onClose={() => closeModal('isBannerFontPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedFont: item, bannerFontReferenceImage: null }))} filter={'font'} />
            
            <LibraryPickerModal isOpen={isAlbumCoverRefPickerOpen} onClose={() => closeModal('isAlbumCoverRefPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ albumReferenceItems: [...(logoThemeState.albumReferenceItems || []), item] }))} filter={imageLikeFilter} />
            <LibraryPickerModal isOpen={isAlbumCoverPalettePickerOpen} onClose={() => closeModal('isAlbumCoverPalettePickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedPalette: item }))} filter={'color-palette'} />
            <LibraryPickerModal isOpen={isAlbumCoverLogoPickerOpen} onClose={() => closeModal('isAlbumCoverLogoPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedLogo: item }))} filter={'logo'} />
            <LibraryPickerModal isOpen={isAlbumCoverFontPickerOpen} onClose={() => closeModal('isAlbumCoverFontPickerOpen')} onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedFont: item, albumFontReferenceImage: null }))} filter={'font'} />

             {/* Mask/Element Pickers */}
             <LibraryPickerModal isOpen={isMaskPickerOpen} onClose={() => closeModal('isMaskPickerOpen')} onSelectItem={item => dispatch(setMaskImage(dataUrlToFile(item.media, item.name || 'mask.jpeg')))} filter={imageLikeFilter} />
             <LibraryPickerModal isOpen={isElementPickerOpen} onClose={() => closeModal('isElementPickerOpen')} onSelectItem={item => dispatch(setElementImages([...elementImages, dataUrlToFile(item.media, item.name || 'element.jpeg')]))} filter={broadImagePickerFilter} />
        </div>
    );
};

// Fix: Added default export for the App component.
export default App;