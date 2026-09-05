import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from './store/store';
import {
    setCurrentUser, setTheme, setFontSize, setProjectName, setActiveTab, setIsComfyUIConnected, setIsMammouthConnected, setComfyUIObjectInfo, setVersionInfo,
    setGlobalError, setDriveFolder, setIsSyncing, setSyncMessage, setIsDriveConfigured,
    openSettingsModal, closeSettingsModal, openVisualSettingsModal, closeVisualSettingsModal, closeAdminPanel,
    openOAuthHelper, closeOAuthHelper, openComfyUIHelper, closeComfyUIHelper,
    setModalOpen, addSessionTokenUsage, resetSessionTokenUsage, queueLtxTransfer
} from './store/appSlice';
import {
    setSourceImage, setGenerationMode, setCharacterName, setShouldGenerateCharacterName,
    setClothingImage, setBackgroundImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
    setMaskImage, setElementImages, setOptions, updateOptions, setCharacterOptions, updateCharacterOptions, setLoadingState,
    updateProgress, setGeneratedImages, setLastUsedPrompt, resetGenerationState,
    selectIsReadyToGenerate
} from './store/generationSlice';
import {
    updateVideoUtilsState, setActiveVideoUtilsSubTab,
    resetVideoUtilsState
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
import { fetchLibrary, unloadLibrary } from './store/librarySlice';
import { setUploadedFiles } from './store/groupPhotoFusionSlice';

import type { User, GenerationOptions, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState, LibraryItemType, MannequinStyle, AppSliceState, UploadedFile, Provider } from './types';
import { fileToDataUrl, fileToResizedDataUrl, dataUrlToFile } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { DEFAULT_GEMINI_IMAGE_MODEL, generatePortraits, generateCharacterNameForImage, updateGeminiApiKey, getApiKey, generatePromptFromImage } from './services/geminiService';
import { generateComfyUICharacterAngles, generateComfyUIPortraits, exportComfyUIWorkflow, getComfyUIObjectInfo, checkConnection, cancelComfyUIExecution, generateComfyUIPromptFromSource } from './services/comfyUIService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, generateMammouthImages, getMammouthApiKey, testMammouthConnection, updateMammouthApiKey } from './services/mammouthService';
import { Login } from './components/Login';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { LibraryPanel } from './components/LibraryPanel';
import { ExtractorToolsPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { LTXDirectorPanel } from './components/LTXDirectorPanel';
import { TtsPanel } from './components/TtsPanel';
import { UpscalePanel } from './components/UpscalePanel';
import { CivitaiPanel } from './components/CivitaiPanel';
import versionData from './version.json';
import { LibraryPickerModal } from './components/LibraryPickerModal';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { LogoThemeGeneratorPanel } from './components/LogoThemeGeneratorPanel';
import { ErrorModal } from './components/ErrorModal';
import { OAuthHelperModal } from './components/OAuthHelperModal';
import { ComfyUIConnectionHelperModal } from './components/ComfyUIConnectionHelperModal';
import { VisualSettingsModal } from './components/VisualSettingsModal';
import { ImageGeneratorIcon, AdminIcon, LibraryIcon, VideoIcon, PromptIcon, ExtractorIcon, VideoUtilsIcon, SwatchIcon, CharacterIcon, CloseIcon, GroupPhotoFusionIcon, PastForwardIcon, MicrophoneIcon, EnhanceIcon, DownloadIcon } from './components/icons';
import { ImageGeneratorHeader } from './components/ImageGeneratorHeader';
import { ActionControlPanel } from './components/ActionControlPanel';
import { CloudImageProviderBar } from './components/CloudImageProviderBar';
import { SamplerSettingsPanel } from './components/SamplerSettingsPanel';
import { LoraSettingsPanel } from './components/LoraSettingsPanel';
import * as driveService from './services/googleDriveService';
import { setDriveService, initializeDriveSync } from './services/libraryService';
import GroupPhotoFusionPanel from './components/groupPhotoFusion/GroupPhotoFusionPanel';
import PastForwardPanel from './components/pastForward/PastForwardPanel';
import { PERSONAS } from './groupPhotoFusion/constants';

const App: React.FC = () => {
    // --- Redux Dispatch ---
    const dispatch: AppDispatch = useDispatch();

    // --- Local State ---
    const [comfyUrlForHelper, setComfyUrlForHelper] = useState('');
    const [localGeminiKey, setLocalGeminiKey] = useState('');
    const [localMammouthKey, setLocalMammouthKey] = useState('');
    const [isGeneratingRefinePrompt, setIsGeneratingRefinePrompt] = useState(false);
    const [generationTimes, setGenerationTimes] = useState<Record<string, number | null>>({});
    const [upscaleSourceFile, setUpscaleSourceFile] = useState<File | null>(null);
    const [isUpscalePickerOpen, setIsUpscalePickerOpen] = useState(false);

    // --- App State (from appSlice) ---
    const {
        currentUser, theme, projectName, fontSize, activeTab, isComfyUIConnected, comfyUIObjectInfo, versionInfo, globalError,
        isSettingsModalOpen, isVisualSettingsModalOpen, isOAuthHelperOpen, isComfyUIHelperOpen, isMammouthConnected,
        isClothingPickerOpen, isBackgroundPickerOpen, isPosePickerOpen, isColorImagePickerOpen, isVideoUtilsPickerOpen,
        isStartFramePickerOpen, isEndFramePickerOpen, isLogoRefPickerOpen, isLogoPalettePickerOpen, isLogoFontPickerOpen,
        isPromptGenImagePickerOpen, isPromptGenBgImagePickerOpen, isPromptGenSubjectImagePickerOpen,
        isNunchakuSourcePickerOpen, isCharacterSourcePickerOpen,
        isClothesSourcePickerOpen, isObjectSourcePickerOpen, isPoseSourcePickerOpen,
        isBannerRefPickerOpen, isBannerPalettePickerOpen, isBannerLogoPickerOpen, isBannerFontPickerOpen,
        isAlbumCoverRefPickerOpen, isAlbumCoverPalettePickerOpen, isAlbumCoverLogoPickerOpen, isAlbumCoverFontPickerOpen,
        isMannequinRefPickerOpen, isRefineSourcePickerOpen, isFontSourcePickerOpen, isMaskPickerOpen, isElementPickerOpen,
        isWanVideoImagePickerOpen,
        isResizeCropPickerOpen,
        isGroupFusionPickerOpen,
        driveFolder, isSyncing, syncMessage, isDriveConfigured, sessionTokenUsage
    } = useSelector((state: RootState) => state.app);

    // --- Generation State (from generationSlice) ---
    const {
        sourceImage, generationMode, characterName, shouldGenerateCharacterName, clothingImage,
        backgroundImage, previewedBackgroundImage, previewedClothingImage, maskImage, elementImages,
        options, characterOptions, isLoading, progressMessage, progressValue, generatedContent
    } = useSelector((state: RootState) => state.generation);

    // --- Video State (from videoSlice) ---
    const videoStartFrame = useSelector((state: RootState) => state.video.videoStartFrame);
    const videoEndFrame = useSelector((state: RootState) => state.video.videoEndFrame);
    const videoUtilsState = useSelector((state: RootState) => state.video.videoUtilsState);
    const activeVideoUtilsSubTab = useSelector((state: RootState) => state.video.activeVideoUtilsSubTab);

    // --- Prompt Gen State (from promptGenSlice) ---
    const activePromptToolsSubTab = useSelector((state: RootState) => state.promptGen.activePromptToolsSubTab);

    // --- Extractor State (from extractorSlice) ---
    const activeExtractorSubTab = useSelector((state: RootState) => state.extractor.activeExtractorSubTab);

    // --- Logo & Theme State (from logoThemeSlice) ---
    const logoThemeState = useSelector((state: RootState) => state.logoTheme.logoThemeState);
    const activeLogoThemeSubTab = useSelector((state: RootState) => state.logoTheme.activeLogoThemeSubTab);

    // --- Group Photo Fusion State ---
    const { uploadedFiles } = useSelector((state: RootState) => state.groupPhotoFusion);

    // --- Computed State ---
    const isReadyToGenerate = useSelector(selectIsReadyToGenerate);
    // Determine which options object to use based on the active tab
    const currentOptions = activeTab === 'character-generator' ? characterOptions : options;

    // --- Memoized Handlers for Redux ---
    const handleSetOptions = useCallback((newOptions: GenerationOptions) => {
        if (activeTab === 'character-generator') {
            dispatch(setCharacterOptions(newOptions));
        } else {
            dispatch(setOptions(newOptions));
        }
    }, [dispatch, activeTab]);

    const handleUpdateOptions = useCallback((opts: Partial<GenerationOptions>) => {
        const newOpts = { ...opts };

        // Helper to apply defaults only if keys are missing in newOpts
        const applyDefaultsIfMissing = (defaults: Partial<GenerationOptions>) => {
            (Object.keys(defaults) as Array<keyof GenerationOptions>).forEach(key => {
                if (newOpts[key] === undefined) {
                    // @ts-ignore
                    newOpts[key] = defaults[key];
                }
            });
        };

        if (newOpts.comfyModelType === 'flux') {
            applyDefaultsIfMissing({
                comfyFluxUseLora: true,
                comfyFluxLora1Name: "flux-turbo.safetensors",
                comfyFluxLora1Strength: 1.0,
                comfyFluxClip1: "t5xxl_fp8_e4m3fn_scaled.safetensors",
                comfyFluxClip2: "clip_l.safetensors",
                comfyFluxVae: "ae.safetensors",
                comfyCfg: 1.0,
                comfySteps: 10,
                comfySampler: "euler",
                comfyScheduler: "simple",
            });
        } else if (newOpts.comfyModelType === 'qwen-edit') {
            applyDefaultsIfMissing({
                comfyQwenEditUnet: 'qwen_image_edit_2509_fp8_e4m3fn.safetensors',
                comfyQwenEditClip: 'Qwen2.5-VL-7B-Instruct-Q6_K.gguf',
                comfyQwenEditVae: 'qwen_image_vae.safetensors',
                comfyQwenEditShift: 2.5,
                comfyQwenEditMegapixels: 1,
                comfyQwenEditUseLora: true,
                comfyQwenEditLora1Name: 'QWEN\\Qwen-Image-Lightning-8steps-V2.0.safetensors',
                comfyQwenEditLora1Strength: 1,
                comfyQwenEditLora2Name: '', comfyQwenEditLora2Strength: 1,
                comfyQwenEditLora3Name: '', comfyQwenEditLora3Strength: 1,
                comfyQwenEditLora4Name: '', comfyQwenEditLora4Strength: 1,
                comfyQwenEditLora5Name: '', comfyQwenEditLora5Strength: 1,
                comfySteps: 8,
                comfyCfg: 1,
                comfySampler: 'euler_ancestral',
                comfyScheduler: 'beta57',
            });
        } else if (newOpts.comfyModelType === 'qwen-t2i-gguf') {
            applyDefaultsIfMissing({
                comfyQwenUseLora: true,
                comfyQwenLora1Name: "QWEN\\Qwen-Image-Lightning-4steps-V2.0.safetensors",
                comfyQwenLora1Strength: 1.0,
                comfyQwenLora2Name: "",
                comfyQwenLora2Strength: 1.0,
                comfyQwenLora3Name: "",
                comfyQwenLora3Strength: 1.0,
                comfyQwenLora4Name: "",
                comfyQwenLora4Strength: 1.0,
                comfyQwenUnet: "qwen-image-Q6_K.gguf",
                comfyQwenVae: "qwen_image_vae.safetensors",
                comfyQwenClip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
                comfyQwenShift: 2.5,
                comfySteps: 4,
                comfyCfg: 1.0,
                comfySampler: "er_sde",
                comfyScheduler: "beta57",
            });
        } else if (newOpts.comfyModelType === 'z-image') {
            applyDefaultsIfMissing({
                comfyZImageUseLora: true,
                comfyZImageLora1Name: "Z-TURBO_Photography_35mmPhoto_1536.safetensors",
                comfyZImageLora1Strength: 1.0,
                comfyZImageLora2Name: "",
                comfyZImageLora2Strength: 1.0,
                comfyZImageLora3Name: "",
                comfyZImageLora3Strength: 1.0,
                comfyZImageLora4Name: "",
                comfyZImageLora4Strength: 1.0,
                comfyZImageUnet: "z_image_turbo_bf16.safetensors",
                comfyZImageVae: "ae.safetensors",
                comfyZImageClip: "Qwen3-4B-UD-Q8_K_XL.gguf",
                comfyZImageShift: 3.0,
                comfyZImageUseShift: true,
                comfySteps: 8,
                comfyCfg: 1.0,
                comfySampler: "euler",
                comfyScheduler: "simple",
                megapixel: 1.0,
                aspectRatio: "1:1"
            });
        }

        if (activeTab === 'character-generator') {
            dispatch(updateCharacterOptions(newOpts));
        } else {
            dispatch(updateOptions(newOpts));
        }
    }, [dispatch, activeTab]);

    const handleSetVideoStartFrame = useCallback(async (file: File | null) => {
        if (!file) return;
        dispatch(queueLtxTransfer({ imageDataUrl: await fileToDataUrl(file) }));
    }, [dispatch]);

    const handleSetVideoEndFrame = useCallback(async (file: File | null) => {
        if (!file) return;
        dispatch(queueLtxTransfer({ imageDataUrl: await fileToDataUrl(file) }));
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
        } else {
            setComfyUrlForHelper(url);
        }
    }, [dispatch]);

    useEffect(() => {
        dispatch(setVersionInfo(versionData));
        const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
        dispatch(setTheme(savedTheme));

        const savedProjectName = localStorage.getItem('projectName');
        if (savedProjectName) {
            dispatch(setProjectName(savedProjectName));
        }

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) dispatch(setCurrentUser(JSON.parse(savedUser)));

        const savedFontSize = localStorage.getItem('fontSize');
        if (savedFontSize) dispatch(setFontSize(parseInt(savedFontSize)));

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

        // Check for Electron API key
        if (window.electron) {
            window.electron.getApiKey().then(key => {
                if (key) {
                    updateGeminiApiKey(key);
                    setLocalGeminiKey(key);
                }
            });
            window.electron.getMammouthApiKey().then(async key => {
                if (!key) return;
                updateMammouthApiKey(key);
                setLocalMammouthKey(key);
                dispatch(setIsMammouthConnected(null));
                const result = await testMammouthConnection(key);
                dispatch(setIsMammouthConnected(result.success));
            });
        } else {
            // Fallback to env or local storage if we decide to implement it for web
            const envKey = getApiKey();
            if (envKey) setLocalGeminiKey(envKey);
            const mammouthKey = localStorage.getItem('mammouth_api_key') || '';
            if (mammouthKey) {
                updateMammouthApiKey(mammouthKey);
                setLocalMammouthKey(mammouthKey);
                testMammouthConnection(mammouthKey).then(result => dispatch(setIsMammouthConnected(result.success)));
            }
        }

    }, [dispatch, checkConnection]);

    useEffect(() => {
        if (activeTab === 'library') {
            dispatch(fetchLibrary());
        } else {
            dispatch(unloadLibrary());
        }
    }, [activeTab, dispatch]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.style.fontSize = `${fontSize}px`;
    }, [fontSize]);

    const handleTabChange = (tabId: string) => {
        dispatch(setActiveTab(tabId));

        // Ensure Character Generator starts in I2I mode with clean prompt state and character logic
        if (tabId === 'character-generator') {
            dispatch(setGenerationMode('i2i'));
            dispatch(updateCharacterOptions({
                geminiMode: 'i2i',
                geminiI2iMode: 'character'
            }));
        }
    };

    const handleLogin = async (username: string, projectName: string): Promise<string | true> => {
        dispatch(setCurrentUser({ username, role: 'user' }));
        dispatch(setProjectName(projectName));
        return true;
    };

    const handleLogout = () => {
        dispatch(setCurrentUser(null));
        dispatch(resetSessionTokenUsage());
    };

    const handleThemeChange = (newTheme: string) => {
        dispatch(setTheme(newTheme));
    };

    const handleProjectNameChange = (newName: string) => {
        dispatch(setProjectName(newName));
    };

    const handleReset = () => {
        dispatch(resetGenerationState());
    };

    const handlePromptGenReset = useCallback(() => {
        dispatch(resetPromptGenState());
    }, [dispatch]);

    const handleVideoUtilsReset = useCallback(() => {
        dispatch(resetVideoUtilsState());
    }, [dispatch]);

    const handleGenerate = async () => {
        const startTime = performance.now();
        setGenerationTimes(prev => ({ ...prev, [activeTab]: null }));

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
            let result: { images: { src: string; usageMetadata?: any }[], finalPrompt: string | null };

            if (currentOptions.provider === 'gemini') {
                // We now pass the tab-specific options directly
                // FORCE character mode for character tab to ensure robustness against state drift
                const optionsToUse = activeTab === 'character-generator'
                    ? { ...characterOptions, geminiGeneralEditPrompt: '', geminiI2iMode: 'character' as const, geminiMode: 'i2i' as const }
                    : options;

                result = await generatePortraits(
                    sourceImage, optionsToUse, localUpdateProgress, clothingImage, backgroundImage,
                    previewedBackgroundImage, previewedClothingImage, maskImage, elementImages
                );
            } else if (currentOptions.provider === 'mammouth') {
                const optionsToUse = activeTab === 'character-generator'
                    ? { ...characterOptions, geminiGeneralEditPrompt: '', geminiI2iMode: 'character' as const, geminiMode: 'i2i' as const }
                    : options;
                result = await generateMammouthImages(
                    sourceImage, optionsToUse, localUpdateProgress, clothingImage, backgroundImage, maskImage, elementImages
                );
            } else if (currentOptions.provider === 'comfyui') {
                const comfyResult = activeTab === 'character-generator'
                    ? await generateComfyUICharacterAngles(sourceImage!, characterOptions, localUpdateProgress)
                    : await generateComfyUIPortraits(sourceImage, options, localUpdateProgress, elementImages.slice(0, 2));
                result = {
                    images: comfyResult.images.map(img => ({ src: img.src, seed: img.seed, usageMetadata: undefined })),
                    finalPrompt: comfyResult.finalPrompt
                };
            } else {
                result = { images: [], finalPrompt: null };
            }

            dispatch(setGeneratedImages({ tabId: activeTab, images: result.images }));
            dispatch(setLastUsedPrompt({ tabId: activeTab, prompt: result.finalPrompt }));

            const endTime = performance.now();
            setGenerationTimes(prev => ({ ...prev, [activeTab]: (endTime - startTime) / 1000 }));

            if (result.images) {
                for (const image of result.images) {
                    if (image.usageMetadata) {
                        dispatch(addSessionTokenUsage(image.usageMetadata));
                    }
                }
            }

            if (result.images.length > 0) {
                if (activeTab === 'character-generator' && shouldGenerateCharacterName) {
                    localUpdateProgress("Generating character name...", 0.96);
                    try {
                        const { name, usageMetadata } = await generateCharacterNameForImage(result.images[0].src);
                        dispatch(setCharacterName(name));
                        if (usageMetadata) {
                            dispatch(addSessionTokenUsage(usageMetadata));
                        }
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

    const handleSaveSettings = async (comfyUIUrl: string, googleClientId: string, geminiApiKey?: string, mammouthApiKey?: string) => {
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

        if (geminiApiKey) {
            if (window.electron) {
                window.electron.setApiKey(geminiApiKey);
            }
            updateGeminiApiKey(geminiApiKey);
            setLocalGeminiKey(geminiApiKey);
        }

        const mammouthKey = mammouthApiKey?.trim() || '';
        if (window.electron) {
            await window.electron.setMammouthApiKey(mammouthKey);
        } else if (mammouthKey) {
            localStorage.setItem('mammouth_api_key', mammouthKey);
        } else {
            localStorage.removeItem('mammouth_api_key');
        }
        updateMammouthApiKey(mammouthKey);
        setLocalMammouthKey(mammouthKey);
        if (mammouthKey) {
            dispatch(setIsMammouthConnected(null));
            const result = await testMammouthConnection(mammouthKey);
            dispatch(setIsMammouthConnected(result.success));
        } else {
            dispatch(setIsMammouthConnected(false));
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

    const handleSendToUpscale = async (imageDataUrl: string, name = 'upscale_source.png') => {
        try {
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            setUpscaleSourceFile(new File([blob], name, { type: blob.type || 'image/png' }));
            dispatch(setActiveTab('upscale'));
        } catch (error) {
            console.error('Error setting upscale source:', error);
            dispatch(setGlobalError({ title: 'File Error', message: 'Could not use the selected image for SeedVR2.' }));
        }
    };

    const handleSendToCharacter = async (imageDataUrl: string) => {
        try {
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], "character_source.jpeg", { type: "image/jpeg" });
            dispatch(setSourceImage(file));
            dispatch(setGenerationMode('i2i'));
            dispatch(updateCharacterOptions({
                geminiMode: 'i2i',
                geminiI2iMode: 'character',
                geminiGeneralEditPrompt: '',
                provider: 'mammouth'
            }));
            dispatch(setActiveTab('character-generator'));
            dispatch(setCharacterName(''));
        } catch (error) {
            console.error("Error setting image for Character:", error);
            dispatch(setGlobalError({ title: "File Error", message: "Could not use the selected image as a source for Character Generator." }));
        }
    };

    const handleDriveConnect = async () => {
        dispatch(setIsSyncing(true));
        dispatch(setSyncMessage('Connecting to Google Drive...'));
        try {
            const folder = await driveService.connectAndPickFolder();
            if (folder) {
                dispatch(setDriveFolder(folder));
                await initializeDriveSync((msg) => dispatch(setSyncMessage(msg)));
                dispatch(fetchLibrary());
            }
        } catch (err: any) {
            console.error("Drive connection failed:", err);
            dispatch(setGlobalError({ title: "Google Drive Error", message: err.message }));
        } finally {
            dispatch(setIsSyncing(false));
            dispatch(setSyncMessage(''));
        }
    };

    const handleDriveDisconnect = () => {
        driveService.disconnect();
        dispatch(setDriveFolder(null));
    };

    const handleSyncWithDrive = async () => {
        if (!driveFolder) return;
        dispatch(setIsSyncing(true));
        try {
            await initializeDriveSync((msg) => dispatch(setSyncMessage(msg)));
            dispatch(fetchLibrary()); // Refresh UI
        } catch (err: any) {
            console.error("Sync failed:", err);
            dispatch(setGlobalError({ title: "Sync Error", message: err.message }));
        } finally {
            dispatch(setIsSyncing(false));
            dispatch(setSyncMessage(''));
        }
    };

    const handleResetTokenUsage = () => {
        if (window.confirm("Are you sure you want to reset the session token usage counter?")) {
            dispatch(resetSessionTokenUsage());
        }
    };

    // Determine active model for display in header
    let activeModel = '';
    if (activeTab === 'image-generator') {
        activeModel = options.provider === 'gemini'
            ? (options.geminiMode === 't2i' ? (options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL)
            : options.provider === 'mammouth'
                ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
                : (options.comfyModelType || 'sdxl');
    } else if (activeTab === 'character-generator') {
        activeModel = characterOptions.provider === 'mammouth'
            ? (characterOptions.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
            : DEFAULT_GEMINI_IMAGE_MODEL;
    } else if (activeTab === 'group-photo-fusion') {
        activeModel = options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    } else if (activeTab === 'extractor-tools') {
        if (options.provider === 'mammouth') activeModel = options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL;
        else if (activeExtractorSubTab === 'clothes') activeModel = DEFAULT_GEMINI_IMAGE_MODEL;
        else if (activeExtractorSubTab === 'objects') activeModel = 'gemini-2.5-flash';
        else if (activeExtractorSubTab === 'poses') activeModel = 'MediaPipe + Gemini 2.5';
        else if (activeExtractorSubTab === 'font') activeModel = DEFAULT_GEMINI_IMAGE_MODEL;
        else activeModel = 'gemini-2.5-flash';
    } else if (activeTab === 'logo-theme-generator') {
        activeModel = options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    } else if (activeTab === 'past-forward') {
        activeModel = options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    }

    const activeProvider: Provider = activeTab === 'character-generator' ? characterOptions.provider : options.provider;

    const availableLoras = useMemo(() => {
        const getModelListFromInfo = (widgetInfo: any): string[] => {
            if (Array.isArray(widgetInfo) && Array.isArray(widgetInfo[0])) {
                return widgetInfo[0] || [];
            }
            return [];
        };
        const sources = [
            comfyUIObjectInfo?.LoraLoader?.input?.required?.lora_name,
            comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name,
        ];
        const modelSet = new Set<string>();
        for (const source of sources) {
            const list = getModelListFromInfo(source);
            if (list.length > 0) {
                list.forEach(model => modelSet.add(model));
            }
        }
        return Array.from(modelSet);
    }, [comfyUIObjectInfo]);

    if (!currentUser) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <div className="min-h-screen bg-bg-primary text-text-primary font-sans transition-colors duration-300 flex flex-col">
            <Header
                theme={theme}
                setTheme={handleThemeChange}
                onLogout={handleLogout}
                currentUser={currentUser}
                projectName={projectName}
                onProjectNameChange={handleProjectNameChange}
                onOpenSettingsModal={() => dispatch(openSettingsModal())}
                onOpenVisualSettings={() => dispatch(openVisualSettingsModal())}
                onOpenComfyUIHelper={() => dispatch(openComfyUIHelper())}
                isComfyUIConnected={isComfyUIConnected}
                versionInfo={versionInfo}
                driveFolder={driveFolder}
                onDriveConnect={handleDriveConnect}
                onDriveDisconnect={handleDriveDisconnect}
                isDriveConfigured={isDriveConfigured}
                sessionTokenUsage={sessionTokenUsage}
                onResetTokenUsage={handleResetTokenUsage}
                activeTab={activeTab}
                provider={activeProvider}
                activeModel={activeModel}
            />

            {/* Main Content Area */}
            <main className="flex-grow container mx-auto p-4 pt-6 flex flex-col relative">
                {/* Global Error Display */}
                {globalError && (
                    <ErrorModal
                        title={globalError.title}
                        message={globalError.message}
                        onClose={() => dispatch(setGlobalError(null))}
                    />
                )}

                {/* Helper Modals */}
                <ConnectionSettingsModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => dispatch(closeSettingsModal())}
                    initialComfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                    initialGoogleClientId={localStorage.getItem('google_client_id') || ''}
                    initialGeminiApiKey={localGeminiKey}
                    initialMammouthApiKey={localMammouthKey}
                    onSave={handleSaveSettings}
                    onConnectionFail={(url) => setComfyUrlForHelper(url)}
                />

                <OAuthHelperModal
                    isOpen={isOAuthHelperOpen}
                    onClose={() => dispatch(closeOAuthHelper())}
                    onProceed={handleDriveConnect}
                    clientId={localStorage.getItem('google_client_id') || ''}
                    origin={window.location.origin}
                />

                <ComfyUIConnectionHelperModal
                    isOpen={isComfyUIHelperOpen}
                    onClose={() => dispatch(closeComfyUIHelper())}
                    testedUrl={comfyUrlForHelper || localStorage.getItem('comfyui_url') || 'http://127.0.0.1:8188'}
                />

                <VisualSettingsModal
                    isOpen={isVisualSettingsModalOpen}
                    onClose={() => dispatch(closeVisualSettingsModal())}
                    currentTheme={theme}
                    setTheme={handleThemeChange}
                    fontSize={fontSize}
                    setFontSize={(size) => dispatch(setFontSize(size))}
                />

                {/* Navigation Tabs */}
                <div className="flex flex-nowrap justify-start xl:justify-center gap-0.5 mb-4 sticky top-0 z-[11] bg-bg-primary/95 backdrop-blur-md p-1 rounded-lg border border-border-primary shadow-sm mx-auto w-full max-w-7xl overflow-x-auto">
                    {[
                        { id: 'image-generator', label: 'Image Gen', icon: <ImageGeneratorIcon className="w-4 h-4" /> },
                        { id: 'character-generator', label: 'Character', icon: <CharacterIcon className="w-4 h-4" /> },
                        { id: 'ltx-director', label: 'LTX Director', icon: <VideoIcon className="w-4 h-4" /> },
                        { id: 'tts', label: 'TTS', icon: <MicrophoneIcon className="w-4 h-4" /> },
                        { id: 'prompt-generator', label: 'Prompt', icon: <PromptIcon className="w-4 h-4" /> },
                        { id: 'extractor-tools', label: 'Extractor', icon: <ExtractorIcon className="w-4 h-4" /> },
                        { id: 'group-photo-fusion', label: 'Fusion', icon: <GroupPhotoFusionIcon className="w-4 h-4" /> },
                        { id: 'past-forward', label: 'PastForward', icon: <PastForwardIcon className="w-4 h-4" /> },
                        { id: 'logo-theme-generator', label: 'Logo', icon: <SwatchIcon className="w-4 h-4" /> },
                        { id: 'video-utils', label: 'Tools', icon: <VideoUtilsIcon className="w-4 h-4" /> },
                        { id: 'upscale', label: 'Upscale', icon: <EnhanceIcon className="w-4 h-4" /> },
                        { id: 'civitai', label: 'Models/LoRAs', icon: <DownloadIcon className="w-4 h-4" /> },
                        { id: 'library', label: 'Library', icon: <LibraryIcon className="w-4 h-4" /> },
                        ...(currentUser.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: <AdminIcon className="w-4 h-4" /> }] : [])
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            aria-label={tab.label}
                            title={tab.label}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-all duration-200 text-[10px] md:text-xs whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-accent text-accent-text shadow-sm'
                                : 'bg-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                                }`}
                        >
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content Views - Centered Wrapper */}
                <div className="w-full max-w-7xl mx-auto">
                    {['group-photo-fusion', 'extractor-tools', 'logo-theme-generator', 'past-forward'].includes(activeTab) && (
                        <CloudImageProviderBar
                            options={options}
                            updateOptions={(updates) => dispatch(updateOptions(updates))}
                            disabled={isLoading}
                        />
                    )}
                    <React.Activity mode={activeTab === 'image-generator' ? 'visible' : 'hidden'}>
                        <>
                            <ImageGeneratorHeader
                                options={currentOptions}
                                updateOptions={handleUpdateOptions}
                                generationMode={generationMode}
                                setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                                isDisabled={isLoading}
                                comfyModels={
                                    comfyUIObjectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []
                                }
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                <div className="lg:col-span-1 space-y-8">
                                    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                        <div className="flex items-center justify-between mb-4">
                                            <h2 className="text-xl font-bold text-accent">
                                                {generationMode === 't2i' && (currentOptions.comfyModelType === 'sd1.5' || currentOptions.comfyModelType === 'sdxl' || currentOptions.comfyModelType === 'flux' || currentOptions.comfyModelType === 'qwen-t2i-gguf' || currentOptions.comfyModelType === 'z-image')
                                                    ? '1. Refine (Optional)'
                                                    : '1. Source & Context'}
                                            </h2>
                                        </div>

                                        {generationMode === 't2i' && (currentOptions.comfyModelType === 'sd1.5' || currentOptions.comfyModelType === 'sdxl' || currentOptions.comfyModelType === 'flux' || currentOptions.comfyModelType === 'qwen-t2i-gguf' || currentOptions.comfyModelType === 'z-image') ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id="useRefine"
                                                        checked={currentOptions.useRefine || false}
                                                        onChange={(e) => dispatch(updateOptions({ useRefine: e.target.checked }))}
                                                        className="w-5 h-5 rounded border-border-primary text-accent focus:ring-accent"
                                                    />
                                                    <label htmlFor="useRefine" className="text-sm font-medium text-text-primary cursor-pointer">
                                                        Enable Refine (Image-to-Image)
                                                    </label>
                                                </div>

                                                {currentOptions.useRefine && (
                                                    <div className="animate-fade-in space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-sm font-medium text-text-secondary">Source Image</label>
                                                            <button
                                                                onClick={() => dispatch(setModalOpen({ modal: 'isRefineSourcePickerOpen', isOpen: true }))}
                                                                className="p-2 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                                                title="Load from Library"
                                                            >
                                                                <LibraryIcon className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                        <ImageUploader
                                                            label="Upload Source Image to Refine"
                                                            id="refine-source-upload"
                                                            onImageUpload={(file) => dispatch(setSourceImage(file))}
                                                            sourceFile={sourceImage}
                                                        />

                                                        <div>
                                                            <div className="flex justify-between mb-1">
                                                                <label className="text-sm font-medium text-text-secondary">Denoise Strength</label>
                                                                <span className="text-sm font-bold text-accent">{currentOptions.refineDenoise || 0.5}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.01"
                                                                max="1.0"
                                                                step="0.01"
                                                                value={currentOptions.refineDenoise || 0.5}
                                                                onChange={(e) => dispatch(updateOptions({ refineDenoise: parseFloat(e.target.value) }))}
                                                                className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                                                            />
                                                            <p className="text-xs text-text-muted mt-1">Lower values keep more of the original image structure.</p>
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between mb-1">
                                                                <label className="text-sm font-medium text-text-secondary">Megapixels (Resize)</label>
                                                                <span className="text-sm font-bold text-accent">{currentOptions.refineMegapixels || 0.5} MP</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.1"
                                                                max="2.0"
                                                                step="0.1"
                                                                value={currentOptions.refineMegapixels || 0.5}
                                                                onChange={(e) => dispatch(updateOptions({ refineMegapixels: parseFloat(e.target.value) }))}
                                                                className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                                                            />
                                                            <p className="text-xs text-text-muted mt-1">Target resolution in megapixels (0.5 is approx 700x700).</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <ImageUploader
                                                label={generationMode === 'i2i' ? 'Upload Source Image (Required)' : 'Upload Source Image (Optional for T2I)'}
                                                id="main-source-upload"
                                                onImageUpload={(file) => dispatch(setSourceImage(file))}
                                                sourceFile={sourceImage}
                                            />
                                        )}
                                    </div>
                                    <OptionsPanel
                                        options={currentOptions}
                                        setOptions={handleSetOptions}
                                        updateOptions={handleUpdateOptions}
                                        generationMode={generationMode}
                                        setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                                        previewedBackgroundImage={previewedBackgroundImage}
                                        setPreviewedBackgroundImage={(url) => dispatch(setPreviewedBackgroundImage(url))}
                                        previewedClothingImage={previewedClothingImage}
                                        setPreviewedClothingImage={(url) => dispatch(setPreviewedClothingImage(url))}
                                        onGenerate={handleGenerate}
                                        onReset={handleReset}
                                        onGeneratePrompt={async () => {
                                            if (!sourceImage) return;

                                            setIsGeneratingRefinePrompt(true);
                                            try {
                                                let prompt = "";
                                                if (currentOptions.provider === 'comfyui') {
                                                    prompt = await generateComfyUIPromptFromSource(sourceImage, currentOptions.comfyModelType || 'sdxl');
                                                } else {
                                                    prompt = await generatePromptFromImage(sourceImage);
                                                }
                                                dispatch(updateOptions({ comfyPrompt: prompt }));
                                            } catch (error) {
                                                console.error("Failed to generate prompt:", error);
                                                dispatch(setGlobalError({ title: "Prompt Generation Failed", message: "Could not generate prompt from image." }));
                                            } finally {
                                                setIsGeneratingRefinePrompt(false);
                                            }
                                        }}
                                        onExportWorkflow={() => exportComfyUIWorkflow(options, sourceImage, elementImages.slice(0, 2))}
                                        isDisabled={isLoading}
                                        isReady={isReadyToGenerate}
                                        isGeneratingPrompt={isGeneratingRefinePrompt}
                                        comfyUIObjectInfo={comfyUIObjectInfo}
                                        comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                        sourceImage={sourceImage}
                                        activeTab={activeTab}
                                        maskImage={maskImage}
                                        setMaskImage={(file) => dispatch(setMaskImage(file))}
                                        elementImages={elementImages}
                                        setElementImages={(files) => dispatch(setElementImages(files))}
                                        onOpenMaskPicker={() => dispatch(setModalOpen({ modal: 'isMaskPickerOpen', isOpen: true }))}
                                        onOpenElementPicker={() => dispatch(setModalOpen({ modal: 'isElementPickerOpen', isOpen: true }))}
                                        hideGeneralSettings={true}
                                    />
                                </div>
                                <div className="lg:col-span-2 space-y-8">
                                    <ActionControlPanel
                                        options={currentOptions}
                                        generationMode={generationMode}
                                        onGenerate={handleGenerate}
                                        onReset={handleReset}
                                        onExportWorkflow={() => {
                                            const generatedImages = generatedContent['image-generator']?.images || [];
                                            const lastImage = generatedImages.length > 0 ? generatedImages[generatedImages.length - 1] as any : null;
                                            const optionsToExport = lastImage && lastImage.seed !== undefined
                                                ? { ...currentOptions, comfySeed: lastImage.seed }
                                                : currentOptions;
                                            exportComfyUIWorkflow(optionsToExport, sourceImage, elementImages.slice(0, 2));
                                        }}
                                        isReady={isReadyToGenerate}
                                        isDisabled={isLoading}
                                    />
                                    {isLoading ? (
                                        <Loader message={progressMessage} progress={progressValue} onCancel={cancelComfyUIExecution} />
                                    ) : (
                                        <ImageGrid
                                            images={generatedContent['image-generator']?.images || []}
                                            onSendToI2I={handleSendToI2I}
                                            onSendToCharacter={handleSendToCharacter}
                                            onSendToUpscale={handleSendToUpscale}
                                            lastUsedPrompt={generatedContent['image-generator']?.lastUsedPrompt}
                                            options={currentOptions}
                                            sourceImage={sourceImage}
                                            activeTab={activeTab}
                                            generationTime={generationTimes[activeTab]}
                                        />
                                    )}
                                    <LoraSettingsPanel
                                        options={currentOptions}
                                        updateOptions={(opts) => dispatch(updateOptions(opts))}
                                        isDisabled={isLoading}
                                        availableLoras={availableLoras}
                                    />
                                    <SamplerSettingsPanel
                                        options={currentOptions}
                                        updateOptions={(opts) => dispatch(updateOptions(opts))}
                                        isDisabled={isLoading}
                                        comfyUIObjectInfo={comfyUIObjectInfo}
                                    />
                                </div>
                            </div>
                        </>
                    </React.Activity>

                    <React.Activity mode={activeTab === 'character-generator' ? 'visible' : 'hidden'}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                            <div className="lg:col-span-1 space-y-8">
                                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-bold text-accent">1. Character Source</h2>
                                        <button onClick={() => dispatch(setModalOpen({ modal: 'isCharacterSourcePickerOpen', isOpen: true }))} className="p-2 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover" title="Load from Library"><LibraryIcon className="w-5 h-5" /></button>
                                    </div>
                                    <ImageUploader label="Upload Face/Character Reference" id="char-source-upload" onImageUpload={(file) => dispatch(setSourceImage(file))} sourceFile={sourceImage} />
                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-text-secondary mb-1">Character Name</label>
                                        <div className="flex gap-2">
                                            <input type="text" value={characterName} onChange={(e) => dispatch(setCharacterName(e.target.value))} placeholder="Enter or Auto-Generate" className="flex-grow bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm" />
                                            <button onClick={() => dispatch(setShouldGenerateCharacterName(!shouldGenerateCharacterName))} className={`p - 2 rounded - md border ${shouldGenerateCharacterName ? 'bg-accent text-accent-text border-accent' : 'bg-bg-tertiary text-text-secondary border-border-primary'} `} title="Auto-generate name"><CharacterIcon className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </div>
                                <OptionsPanel
                                    options={currentOptions}
                                    setOptions={handleSetOptions}
                                    updateOptions={handleUpdateOptions}
                                    generationMode="i2i" // Always I2I for character gen
                                    setGenerationMode={() => { }} // No-op, locked to I2I
                                    previewedBackgroundImage={previewedBackgroundImage}
                                    setPreviewedBackgroundImage={(url) => dispatch(setPreviewedBackgroundImage(url))}
                                    previewedClothingImage={previewedClothingImage}
                                    setPreviewedClothingImage={(url) => dispatch(setPreviewedClothingImage(url))}
                                    onGenerate={handleGenerate}
                                    onReset={handleReset}
                                    onGeneratePrompt={() => { }}
                                    onExportWorkflow={() => { }}
                                    onOpenPosePicker={() => dispatch(setModalOpen({ modal: 'isPosePickerOpen', isOpen: true }))}
                                    isDisabled={isLoading}
                                    isReady={isReadyToGenerate}
                                    isGeneratingPrompt={false}
                                    comfyUIObjectInfo={comfyUIObjectInfo}
                                    comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                    sourceImage={sourceImage}
                                    hideProviderSwitch={false}
                                    hideGenerationModeSwitch={true} // Hide mode switch, locked to I2I
                                    title="2. Character Options"
                                    activeTab={activeTab}
                                    maskImage={null} // Not used in this simple view
                                    setMaskImage={() => { }}
                                    elementImages={[]}
                                    setElementImages={() => { }}
                                    onOpenMaskPicker={() => { }}
                                    onOpenElementPicker={() => { }}
                                    // New props passed for Character Generator Image Uploads
                                    clothingImage={clothingImage}
                                    setClothingImage={(file) => dispatch(setClothingImage(file))}
                                    backgroundImage={backgroundImage}
                                    setBackgroundImage={(file) => dispatch(setBackgroundImage(file))}
                                    onOpenClothingLibrary={() => dispatch(setModalOpen({ modal: 'isClothingPickerOpen', isOpen: true }))}
                                    onOpenBackgroundLibrary={() => dispatch(setModalOpen({ modal: 'isBackgroundPickerOpen', isOpen: true }))}
                                />
                            </div>
                            <div className="lg:col-span-2 space-y-8">
                                <ActionControlPanel
                                    options={currentOptions}
                                    generationMode="i2i"
                                    onGenerate={handleGenerate}
                                    onReset={handleReset}
                                    onExportWorkflow={() => { }}
                                    isReady={isReadyToGenerate}
                                    isDisabled={isLoading}
                                />
                                {isLoading ? (
                                    <Loader message={progressMessage} progress={progressValue} />
                                ) : (
                                    <ImageGrid
                                        images={generatedContent['character-generator']?.images || []}
                                        onSendToI2I={handleSendToI2I}
                                        onSendToCharacter={handleSendToCharacter}
                                        onSendToUpscale={handleSendToUpscale}
                                        lastUsedPrompt={generatedContent['character-generator']?.lastUsedPrompt}
                                        options={currentOptions}
                                        sourceImage={sourceImage}
                                        characterName={characterName}
                                        activeTab={activeTab}
                                        generationTime={generationTimes[activeTab]}
                                    />
                                )}
                            </div>
                        </div>
                    </React.Activity>

                    <React.Activity mode={activeTab === 'past-forward' ? 'visible' : 'hidden'}><PastForwardPanel /></React.Activity>

                    <React.Activity mode={activeTab === 'group-photo-fusion' ? 'visible' : 'hidden'}><GroupPhotoFusionPanel /></React.Activity>

                    <React.Activity mode={activeTab === 'prompt-generator' ? 'visible' : 'hidden'}>
                        <PromptGeneratorPanel
                            activeSubTab={activePromptToolsSubTab}
                            setActiveSubTab={(id) => dispatch(setActivePromptToolsSubTab(id))}
                            onUsePrompt={(prompt) => {
                                // Logic to copy prompt to relevant fields
                                if (options.provider === 'gemini') dispatch(updateOptions({ geminiPrompt: prompt }));
                                else dispatch(updateOptions({ comfyPrompt: prompt, comfyVidWanI2VPositivePrompt: prompt, comfyVidWanT2VPositivePrompt: prompt }));
                                // Optionally switch tab? For now, let user decide via modal or just stay.
                            }}
                            onOpenLibraryForImage={() => dispatch(setModalOpen({ modal: 'isPromptGenImagePickerOpen', isOpen: true }))}
                            onOpenLibraryForBg={() => dispatch(setModalOpen({ modal: 'isPromptGenBgImagePickerOpen', isOpen: true }))}
                            onOpenLibraryForSubject={() => dispatch(setModalOpen({ modal: 'isPromptGenSubjectImagePickerOpen', isOpen: true }))}
                            onOpenLibraryForWanVideoImage={() => dispatch(setModalOpen({ modal: 'isWanVideoImagePickerOpen', isOpen: true }))}
                            onReset={handlePromptGenReset}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'extractor-tools' ? 'visible' : 'hidden'}>
                        <ExtractorToolsPanel
                            onOpenLibraryForClothes={() => dispatch(setModalOpen({ modal: 'isClothesSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForObjects={() => dispatch(setModalOpen({ modal: 'isObjectSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForPoses={() => dispatch(setModalOpen({ modal: 'isPoseSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForMannequinRef={() => dispatch(setModalOpen({ modal: 'isMannequinRefPickerOpen', isOpen: true }))}
                            onOpenLibraryForFont={() => dispatch(setModalOpen({ modal: 'isFontSourcePickerOpen', isOpen: true }))}
                            activeSubTab={activeExtractorSubTab}
                            setActiveSubTab={(id) => dispatch(setActiveExtractorSubTab(id))}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'logo-theme-generator' ? 'visible' : 'hidden'}>
                        <LogoThemeGeneratorPanel
                            activeSubTab={activeLogoThemeSubTab}
                            setActiveSubTab={(id) => dispatch(setActiveLogoThemeSubTab(id))}
                            onOpenLibraryForReferences={() => dispatch(setModalOpen({ modal: 'isLogoRefPickerOpen', isOpen: true }))}
                            onOpenLibraryForPalette={() => dispatch(setModalOpen({ modal: 'isLogoPalettePickerOpen', isOpen: true }))}
                            onOpenLibraryForFont={() => dispatch(setModalOpen({ modal: 'isLogoFontPickerOpen', isOpen: true }))}
                            onOpenLibraryForBannerReferences={() => dispatch(setModalOpen({ modal: 'isBannerRefPickerOpen', isOpen: true }))}
                            onOpenLibraryForBannerPalette={() => dispatch(setModalOpen({ modal: 'isBannerPalettePickerOpen', isOpen: true }))}
                            onOpenLibraryForBannerLogo={() => dispatch(setModalOpen({ modal: 'isBannerLogoPickerOpen', isOpen: true }))}
                            onOpenLibraryForBannerFont={() => dispatch(setModalOpen({ modal: 'isBannerFontPickerOpen', isOpen: true }))}
                            onOpenLibraryForAlbumCoverReferences={() => dispatch(setModalOpen({ modal: 'isAlbumCoverRefPickerOpen', isOpen: true }))}
                            onOpenLibraryForAlbumCoverPalette={() => dispatch(setModalOpen({ modal: 'isAlbumCoverPalettePickerOpen', isOpen: true }))}
                            onOpenLibraryForAlbumCoverLogo={() => dispatch(setModalOpen({ modal: 'isAlbumCoverLogoPickerOpen', isOpen: true }))}
                            onOpenLibraryForAlbumCoverFont={() => dispatch(setModalOpen({ modal: 'isAlbumCoverFontPickerOpen', isOpen: true }))}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'video-utils' ? 'visible' : 'hidden'}>
                        <VideoUtilsPanel
                            setStartFrame={handleSetVideoStartFrame}
                            setEndFrame={handleSetVideoEndFrame}
                            onOpenLibrary={() => dispatch(setModalOpen({ modal: 'isColorImagePickerOpen', isOpen: true }))}
                            onOpenVideoLibrary={() => dispatch(setModalOpen({ modal: 'isVideoUtilsPickerOpen', isOpen: true }))}
                            activeSubTab={activeVideoUtilsSubTab}
                            setActiveSubTab={(id) => dispatch(setActiveVideoUtilsSubTab(id as any))}
                            onReset={handleVideoUtilsReset}
                            onOpenLibraryForResizeCrop={() => dispatch(setModalOpen({ modal: 'isResizeCropPickerOpen', isOpen: true }))}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'ltx-director' ? 'visible' : 'hidden'}>
                        <LTXDirectorPanel
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'tts' ? 'visible' : 'hidden'}><TtsPanel isComfyUIConnected={isComfyUIConnected} /></React.Activity>

                    <React.Activity mode={activeTab === 'upscale' ? 'visible' : 'hidden'}>
                        <UpscalePanel
                            sourceFile={upscaleSourceFile}
                            setSourceFile={setUpscaleSourceFile}
                            onOpenLibrary={() => setIsUpscalePickerOpen(true)}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'civitai' ? 'visible' : 'hidden'}>
                        <CivitaiPanel />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'library' ? 'visible' : 'hidden'}>
                        <LibraryPanel
                            onUpscaleItem={(item) => handleSendToUpscale(item.media, item.name ? `${item.name}.png` : undefined)}
                            onLoadItem={(item) => {
                                // Logic to load item back into generator state
                                if (item.mediaType === 'image' || item.mediaType === 'character') {
                                    if (item.sourceImage) {
                                        fetch(item.sourceImage).then(r => r.blob()).then(b => dispatch(setSourceImage(new File([b], "source.jpg", { type: "image/jpeg" }))));
                                    }
                                    if (item.options) {
                                        // Determine where to load options based on item type
                                        if (item.mediaType === 'character') {
                                            dispatch(setCharacterOptions(item.options));
                                        } else {
                                            dispatch(setOptions(item.options));
                                        }
                                    }
                                    if (item.mediaType === 'character' && item.name) {
                                        const namePart = item.name.split(':')[0];
                                        dispatch(setCharacterName(namePart));
                                        handleTabChange('character-generator');
                                    } else {
                                        dispatch(setActiveTab('image-generator'));
                                    }
                                } else if (item.mediaType === 'video') {
                                    if (item.ltxDirectorOptions) {
                                        dispatch(queueLtxTransfer({
                                            imageDataUrl: item.sourceImage || item.startFrame,
                                            videoDataUrl: item.media,
                                            directorOptions: item.ltxDirectorOptions,
                                        }));
                                    } else {
                                        dispatch(setActiveTab('ltx-director'));
                                    }
                                } else if (item.mediaType === 'audio-tts') {
                                    const spokenText = item.ttsOptions?.text.trim() || '';
                                    const dialogue = spokenText.replace(/"/g, "'");
                                    const mimeType = item.media.match(/^data:([^;,]+)/)?.[1] || '';
                                    const extension = mimeType.includes('flac') ? 'flac' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'wav';
                                    dispatch(queueLtxTransfer({
                                        audioDataUrl: item.media,
                                        audioName: `${item.name || 'tts-result'}.${extension}`,
                                        ttsText: spokenText,
                                        prompt: dialogue ? `The character speaks clearly and naturally, saying: "${dialogue}"` : 'The character speaks clearly and naturally.',
                                    }));
                                }
                                // Add handling for other types if needed
                            }}
                            isDriveConnected={!!driveFolder}
                            onSyncWithDrive={handleSyncWithDrive}
                            isSyncing={isSyncing}
                            syncMessage={syncMessage}
                            isDriveConfigured={isDriveConfigured}
                        />
                    </React.Activity>

                    {activeTab === 'admin' && currentUser.role === 'admin' && <div className="max-w-4xl mx-auto"><AdminIcon className="w-12 h-12 text-accent mx-auto mb-6" /><h2 className="text-2xl font-bold text-center mb-8">Admin Dashboard</h2></div>}
                </div>
            </main>

            {/* Modals */}
            <LibraryPickerModal
                isOpen={isClothingPickerOpen}
                onClose={() => dispatch(setModalOpen({ modal: 'isClothingPickerOpen', isOpen: false }))}
                onSelectItem={async (item) => {
                    const response = await fetch(item.media);
                    const blob = await response.blob();
                    dispatch(setClothingImage(new File([blob], "clothing_ref.jpg", { type: blob.type })));
                }}
                filter="clothes"
            />
            <LibraryPickerModal
                isOpen={isBackgroundPickerOpen}
                onClose={() => dispatch(setModalOpen({ modal: 'isBackgroundPickerOpen', isOpen: false }))}
                onSelectItem={async (item) => {
                    const response = await fetch(item.media);
                    const blob = await response.blob();
                    dispatch(setBackgroundImage(new File([blob], "background_ref.jpg", { type: blob.type })));
                }}
                filter={['image', 'extracted-frame', 'background' as any]}
            />
            <LibraryPickerModal
                isOpen={isPosePickerOpen}
                onClose={() => dispatch(setModalOpen({ modal: 'isPosePickerOpen', isOpen: false }))}
                onSelectItem={(item) => {
                    dispatch(updateCharacterOptions({
                        poseLibraryItems: [...(characterOptions.poseLibraryItems || []), item],
                        poseMode: 'library'
                    }));
                }}
                filter="pose"
                multiSelect
                onSelectMultiple={(items) => {
                    dispatch(updateCharacterOptions({
                        poseLibraryItems: items,
                        poseMode: 'library'
                    }));
                }}
            />
            {/* ... Other pickers ... */}
            <LibraryPickerModal isOpen={isCharacterSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isCharacterSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setSourceImage(new File([b], "char_source.jpg", { type: b.type }))); }} filter="character" />
            <LibraryPickerModal isOpen={isRefineSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isRefineSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setSourceImage(new File([b], "refine_source.jpg", { type: b.type }))); }} filter="image" />
            <LibraryPickerModal isOpen={isMaskPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isMaskPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setMaskImage(new File([b], "mask.png", { type: b.type }))); }} filter="image" />
            <LibraryPickerModal isOpen={isElementPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isElementPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setElementImages([...elementImages, new File([b], `element_${Date.now()}.jpg`, { type: b.type })])); }} filter={['image', 'object', 'clothes']} />
            <LibraryPickerModal isOpen={isPromptGenImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ image: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPromptGenBgImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenBgImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ bgImage: new File([b], "bg_source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPromptGenSubjectImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenSubjectImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ subjectImage: new File([b], "subj_source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isWanVideoImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isWanVideoImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ wanVideoImage: new File([b], "wan_source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isClothesSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isClothesSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ clothesSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isObjectSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isObjectSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ objectSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPoseSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPoseSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ poseSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isMannequinRefPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isMannequinRefPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ mannequinReferenceFile: new File([b], "ref.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isFontSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isFontSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ fontSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isColorImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isColorImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ colorPicker: { ...videoUtilsState.colorPicker, imageFile: new File([b], "source.jpg", { type: b.type }) } })); }} filter="image" />
            <LibraryPickerModal isOpen={isVideoUtilsPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isVideoUtilsPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ videoFile: new File([b], "video.mp4", { type: b.type }) })); }} filter="video" />
            <LibraryPickerModal isOpen={isResizeCropPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isResizeCropPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ resizeCrop: { ...videoUtilsState.resizeCrop, sourceFile: new File([b], "source.jpg", { type: b.type }) } })); }} filter="image" />
            <LibraryPickerModal isOpen={isGroupFusionPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isGroupFusionPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); const file = new File([b], "imported.jpg", { type: b.type }); const newFile: UploadedFile = { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), personaId: 'default' }; dispatch(setUploadedFiles([...uploadedFiles, newFile])); }} filter="image" />
            <LibraryPickerModal isOpen={isUpscalePickerOpen} onClose={() => setIsUpscalePickerOpen(false)} onSelectItem={(item) => { setIsUpscalePickerOpen(false); handleSendToUpscale(item.media, item.name ? `${item.name}.png` : undefined); }} filter={['image', 'character', 'logo', 'banner', 'album-cover']} />

            {/* Logo Theme Pickers */}
            <LibraryPickerModal isOpen={isLogoRefPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isLogoRefPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ referenceItems: [...(logoThemeState.referenceItems || []), item] }))} filter="image" />
            <LibraryPickerModal isOpen={isLogoPalettePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isLogoPalettePickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ selectedPalette: item }))} filter="color-palette" />
            <LibraryPickerModal isOpen={isLogoFontPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isLogoFontPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ selectedFont: item, fontReferenceImage: null }))} filter="font" />
            <LibraryPickerModal isOpen={isBannerRefPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isBannerRefPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ bannerReferenceItems: [...(logoThemeState.bannerReferenceItems || []), item] }))} filter="image" />
            <LibraryPickerModal isOpen={isBannerPalettePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isBannerPalettePickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ bannerSelectedPalette: item }))} filter="color-palette" />
            <LibraryPickerModal isOpen={isBannerLogoPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isBannerLogoPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ bannerSelectedLogo: item }))} filter="logo" />
            <LibraryPickerModal isOpen={isBannerFontPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isBannerFontPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ bannerSelectedFont: item, bannerFontReferenceImage: null }))} filter="font" />
            <LibraryPickerModal isOpen={isAlbumCoverRefPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isAlbumCoverRefPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ albumReferenceItems: [...(logoThemeState.albumReferenceItems || []), item] }))} filter="image" />
            <LibraryPickerModal isOpen={isAlbumCoverPalettePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isAlbumCoverPalettePickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ albumSelectedPalette: item }))} filter="color-palette" />
            <LibraryPickerModal isOpen={isAlbumCoverLogoPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isAlbumCoverLogoPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ albumSelectedLogo: item }))} filter="logo" />
            <LibraryPickerModal isOpen={isAlbumCoverFontPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isAlbumCoverFontPickerOpen', isOpen: false }))} onSelectItem={(item) => dispatch(updateLogoThemeState({ albumSelectedFont: item, albumFontReferenceImage: null }))} filter="font" />

        </div>
    );
};

export default App;
