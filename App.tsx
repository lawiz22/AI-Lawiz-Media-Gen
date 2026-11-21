import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { RootState, AppDispatch } from './store/store';
import { clearGenerationJobs, setGenerationJobs, setGenerationPreview, type GenerationJob } from './store/generationJobs';
import {
    setCurrentUser, setTheme, setFontSize, setProjectName, setActiveTab, setIsComfyUIConnected, setIsMammouthConnected, setComfyUIObjectInfo, setVersionInfo,
    setGlobalError, setDriveFolder, setIsSyncing, setSyncMessage, setIsDriveConfigured,
    openSettingsModal, closeSettingsModal, openVisualSettingsModal, closeVisualSettingsModal,
    openOAuthHelper, closeOAuthHelper, openComfyUIHelper, closeComfyUIHelper,
    setModalOpen, addSessionTokenUsage, resetSessionTokenUsage, queueLtxTransfer, clearLtxTransfer
} from './store/appSlice';
import {
    setSourceImage, setGenerationMode, setCharacterName,
    setMaskImage, setElementImages, setOptions, updateOptions, setCharacterOptions, updateCharacterOptions, setLoadingState,
    switchComfyModelOptions, updateProgress, setGeneratedImages, setLastUsedPrompt, resetGenerationState,
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
    setActiveExtractorSubTab, updateExtractorState, resetExtractorState
} from './store/extractorSlice';
import {
    setActiveLogoThemeSubTab, resetLogoThemeState, updateLogoThemeState
} from './store/logoThemeSlice';
import { fetchLibrary } from './store/librarySlice';
import { removeAllFiles, setUploadedFiles } from './store/groupPhotoFusionSlice';
import { removedImageWorkflowMessage } from './constants';

import type { User, GenerationOptions, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState, LibraryItemType, MannequinStyle, AppSliceState, UploadedFile, Provider } from './types';
import { fileToDataUrl, fileToResizedDataUrl, dataUrlToFile } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { DEFAULT_GEMINI_IMAGE_MODEL, generatePortraits, generateCharacterNameForImage, updateGeminiApiKey, getApiKey } from './services/geminiService';
import { generateComfyUICharacterAngles, generateComfyUIPortraits, exportComfyUIWorkflow, getComfyUIObjectInfo, subscribeComfyUIObjectInfo, checkConnection, cancelComfyUIExecution } from './services/comfyUIService';
import { clearH3CatalogCache } from './services/minimaxH3Service';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, generateMammouthImages, getMammouthApiKey, testMammouthConnection, updateMammouthApiKey } from './services/mammouthService';
import { DEFAULT_OPENROUTER_MODEL, updateOpenRouterSettings, type OpenRouterSettings } from './services/openRouterService';
import { CHARACTER_ANGLES, getEnabledCharacterAngles } from './services/characterAnglesWorkflow';
import { generateCloudCharacterAngles } from './services/cloudCharacterService';
import { createCharacterResultSnapshot, getCharacterResultKey, type CharacterResultSnapshot } from './services/characterResults';
import { Login } from './components/Login';
import { Header } from './components/Header';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, testOllamaConnection } from './services/ollamaService';
import { LibraryPanel } from './components/LibraryPanel';
import { ExtractorToolsPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { LTXDirectorPanel } from './components/LTXDirectorPanel';
import { VideoWorkspace } from './components/VideoWorkspace';
import SceneVariationPanel from './components/SceneVariationWorkspace';
import OutpaintPanel from './components/OutpaintPanel';
import { StyleGalleryPanel } from './components/StyleGalleryPanel';
import { TtsPanel } from './components/TtsPanel';
import { createLtxScenePrompt, formatIndexTtsTranscript } from './utils/ttsTranscript';
import { UpscalePanel } from './components/UpscalePanel';
import { CivitaiPanel } from './components/CivitaiPanel';
import versionData from './version.json';
import { LibraryPickerModal } from './components/LibraryPickerModal';
import { LibraryPickerHost } from './components/LibraryPickerHost';
import { TabActivity } from './components/TabActivity';
import { ImageGeneratorTab } from './components/ImageGeneratorTab';
import { CharacterTab } from './components/CharacterTab';
import { isMinimaxH3PromptLibraryItem } from './services/videoPromptLibrary';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { LogoThemeGeneratorPanel } from './components/LogoThemeGeneratorPanel';
import { ErrorModal } from './components/ErrorModal';
import { OAuthHelperModal } from './components/OAuthHelperModal';
import { ComfyUIConnectionHelperModal } from './components/ComfyUIConnectionHelperModal';
import { VisualSettingsModal } from './components/VisualSettingsModal';
import { InstallationDashboardModal } from './components/InstallationDashboardModal';
import { DriveFolderCreateModal } from './components/DriveFolderCreateModal';
import { ImageGeneratorIcon, LibraryIcon, VideoIcon, PromptIcon, ExtractorIcon, VideoUtilsIcon, SwatchIcon, CharacterIcon, CloseIcon, GroupPhotoFusionIcon, MicrophoneIcon, DownloadIcon, ResetIcon } from './components/icons';
import { CloudImageProviderBar } from './components/CloudImageProviderBar';
import * as driveService from './services/googleDriveService';
import { clearDriveFileReferences, setDriveService, syncLibraryFromDrive, syncLibraryToDrive } from './services/libraryService';
import { FunTab, type FunSubTab } from './components/FunTab';
import { PERSONAS } from './groupPhotoFusion/constants';
import { getTabAccentStyle } from './utils/accentTheme';

const IMAGE_JOBS_KEY = 'image-generator';

const App: React.FC = () => {
    // --- Redux Dispatch ---
    const dispatch: AppDispatch = useDispatch();

    // --- Local State ---
    const [comfyUrlForHelper, setComfyUrlForHelper] = useState('');
    const [localGeminiKey, setLocalGeminiKey] = useState('');
    const [localMammouthKey, setLocalMammouthKey] = useState('');
    const [localOpenRouterSettings, setLocalOpenRouterSettings] = useState<OpenRouterSettings>({ apiKey: '', model: DEFAULT_OPENROUTER_MODEL });
    const [videoPromptToLoad, setVideoPromptToLoad] = useState<LibraryItem | null>(null);
    const [blazingPreset, setBlazingPreset] = useState<LibraryItem | null>(null);
    const [modelLibraryRequest, setModelLibraryRequest] = useState<{ path: string; id: number } | null>(null);
    const [blazingModel, setBlazingModel] = useState('');
    const [videoPromptDestination, setVideoPromptDestination] = useState<'reference' | 'ultrafast' | 'advanced' | 'ltx-audio-sync' | 'ltx-ripple-ffaf'>('reference');
    const [videoFinishing, setVideoFinishing] = useState<'latent' | 'ltx' | undefined>();
    const handleVideoPromptLoaded = useCallback(() => setVideoPromptToLoad(null), []);
    const handleLeaveVideoDirector = useCallback(() => dispatch(setActiveTab('video')), [dispatch]);
    const [localOllamaUrl, setLocalOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL);
    const [localOllamaModel, setLocalOllamaModel] = useState(() => localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL);
    const [isOllamaConnected, setIsOllamaConnected] = useState<boolean | null>(null);
    const [generationTimes, setGenerationTimes] = useState<Record<string, number | null>>({});
    const [characterResultSnapshots, setCharacterResultSnapshots] = useState<Record<string, CharacterResultSnapshot>>({});
    const [upscaleSourceFile, setUpscaleSourceFile] = useState<File | null>(null);
    const [isUpscalePickerOpen, setIsUpscalePickerOpen] = useState(false);
    const [isInstallationDashboardOpen, setIsInstallationDashboardOpen] = useState(false);
    const [isDriveFolderCreateOpen, setIsDriveFolderCreateOpen] = useState(false);
    const driveSyncControllerRef = useRef<AbortController | null>(null);
    const [activeFunSubTab, setActiveFunSubTab] = useState<FunSubTab>('photo-fusion');
    const [panelResetVersions, setPanelResetVersions] = useState<Record<string, number>>({});
    const [sceneVariationModel, setSceneVariationModel] = useState('');
    const [sceneVariationPreset, setSceneVariationPreset] = useState<LibraryItem | null>(null);

    // --- App State (from appSlice) ---
    // The open Library picker is left out: LibraryPickerHost subscribes to it.
    const {
        currentUser, theme, projectName, fontSize, activeTab, isComfyUIConnected, comfyUIObjectInfo, versionInfo, globalError,
        isSettingsModalOpen, isVisualSettingsModalOpen, isOAuthHelperOpen, isComfyUIHelperOpen, isMammouthConnected,
        driveFolder, isSyncing, syncMessage, isDriveConfigured, sessionTokenUsage
    } = useSelector((state: RootState) => {
        const { activePicker, pendingLtxTransfer, ...shell } = state.app;
        return shell;
    }, shallowEqual);

    // --- Generation State (from generationSlice) ---
    // Progress text and value are left out: they change on every tick and are read by GenerationProgress.
    const {
        sourceImage, generationMode, characterName, shouldGenerateCharacterName, clothingImage,
        backgroundImage, characterPoseImage, previewedBackgroundImage, previewedClothingImage, maskImage, elementImages,
        options, characterOptions, isLoading, generatedContent
    } = useSelector((state: RootState) => {
        const { progressMessage, progressValue, ...stable } = state.generation;
        return stable;
    }, shallowEqual);

    // --- Video State (from videoSlice) ---
    const activeVideoUtilsSubTab = useSelector((state: RootState) => state.video.activeVideoUtilsSubTab);
    const groupPhotoFusionProvider = useSelector((state: RootState) => state.groupPhotoFusion.provider);

    // --- Prompt Gen State (from promptGenSlice) ---
    const activePromptToolsSubTab = useSelector((state: RootState) => state.promptGen.activePromptToolsSubTab);

    // --- Extractor State (from extractorSlice) ---
    const activeExtractorSubTab = useSelector((state: RootState) => state.extractor.activeExtractorSubTab);
    // Only what the header and the provider switch read; extraction results do not re-render the application.
    const extractorState = useSelector((state: RootState) => {
        const {
            clothesGenerationProvider, hairGenerationProvider, objectGenerationProvider, poseGenerationProvider, fontGenerationProvider,
            poseAnalysisProvider, poseOutputMode, isGenerating, isGeneratingHair, isGeneratingObjects, isGeneratingPoses, isGeneratingFont,
        } = state.extractor.extractorState;
        return {
            clothesGenerationProvider, hairGenerationProvider, objectGenerationProvider, poseGenerationProvider, fontGenerationProvider,
            poseAnalysisProvider, poseOutputMode, isGenerating, isGeneratingHair, isGeneratingObjects, isGeneratingPoses, isGeneratingFont,
        };
    }, shallowEqual);

    // --- Logo & Theme State (from logoThemeSlice) ---
    const activeLogoThemeSubTab = useSelector((state: RootState) => state.logoTheme.activeLogoThemeSubTab);

    // --- Computed State ---
    const isReadyToGenerate = useSelector(selectIsReadyToGenerate);
    // Determine which options object to use based on the active tab
    const currentOptions = activeTab === 'character-generator' ? characterOptions : options;
    const activePanelResetKey = activeTab === 'video-utils' && (activeVideoUtilsSubTab === 'outpaint' || activeVideoUtilsSubTab === 'upscale')
        ? activeVideoUtilsSubTab : activeTab;
    const isBlazingCharacter = characterOptions.provider === 'comfyui' && characterOptions.comfyCharacterMode === 'flux2' && characterOptions.comfyCharacterFlux2Tab === 'blazing-fast';
    const handleSheetSourceChange = useCallback((file: File | null) => { dispatch(setSourceImage(file)); }, [dispatch]);
    const imageGeneratorContentKey = options.provider === 'comfyui'
        ? `image-generator:${options.comfyModelType || 'sdxl'}`
        : 'image-generator';
    const characterGeneratorContentKey = getCharacterResultKey(characterOptions);
    const characterResultSnapshot = characterResultSnapshots[characterGeneratorContentKey];
    const activeGenerationContentKey = activeTab === 'image-generator' ? imageGeneratorContentKey
        : activeTab === 'character-generator' ? characterGeneratorContentKey : activeTab;

    // --- Memoized Handlers for Redux ---
    const handleSetOptions = useCallback((newOptions: GenerationOptions): boolean => {
        const removedMessage = newOptions.provider === 'comfyui' ? removedImageWorkflowMessage(newOptions.comfyModelType) : null;
        if (removedMessage) {
            dispatch(setGlobalError({ title: 'Workflow removed', message: removedMessage }));
            return false;
        }
        if (activeTab === 'character-generator') {
            dispatch(setCharacterOptions(newOptions));
        } else {
            dispatch(setOptions(newOptions));
        }
        return true;
    }, [dispatch, activeTab]);

    const handleUpdateOptions = useCallback((opts: Partial<GenerationOptions>, switchModel = false) => {
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

        if (newOpts.comfyModelType === 'qwen-edit') {
            applyDefaultsIfMissing({
                comfyQwenEditUnet: 'qwen_image_edit_2509_fp8_e4m3fn.safetensors',
                comfyQwenEditClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
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
        } else if (newOpts.comfyModelType === 'flux2-edit') {
            applyDefaultsIfMissing({
                comfyFlux2EditPrompt: '',
                comfyFlux2EditStyle: undefined,
                comfyFlux2EditStyleStrength: undefined,
                comfyFlux2EditUseStyleSettings: false,
                comfyFlux2EditUnet: 'flux2\\flux2Klein9BInt8_v10.safetensors',
                comfyFlux2EditClip: 'qwen38BFluxKlein9BTE_38b.safetensors',
                comfyFlux2EditVae: 'flux2-vae.safetensors',
                comfyFlux2EditSteps: 4,
                comfyFlux2EditCfg: 1,
                comfyFlux2EditSampler: 'euler',
                comfyFlux2EditMegapixels: 1,
                comfyFlux2EditReferenceRoles: ['outfit', 'background', 'pose'],
                comfyFlux2EditReferenceDescriptions: ['', '', ''],
                comfyFlux2EditReferenceLibraryPrompts: ['', '', ''],
                comfyFlux2EditUseCacheDit: false,
                comfyFlux2EditCacheDitModelType: 'Auto',
                comfyFlux2EditCacheDitWarmupSteps: 0,
                comfyFlux2EditCacheDitSkipInterval: 0,
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
                comfyZImageUseLora: false,
                comfyZImageLora1Name: "",
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
                comfyZImageUseCacheDit: true,
                comfyZImageCacheDitModelType: "Auto",
                comfyZImageCacheDitWarmupSteps: 3,
                comfyZImageCacheDitSkipInterval: 2,
                comfyZImageCacheDitPrintSummary: true,
                comfySteps: 8,
                comfyCfg: 1.0,
                comfySampler: "euler",
                comfyScheduler: "simple",
                megapixel: 1.0,
                aspectRatio: "1:1"
            });
        } else if (newOpts.comfyModelType === 'flux2-simple') {
            applyDefaultsIfMissing({
                comfyFlux2Prompt: '',
                comfyFlux2Style: undefined,
                comfyFlux2StyleStrength: undefined,
                comfyFlux2UseStyleSettings: false,
                comfyFlux2NegativePrompt: '',
                comfyFlux2Unet: 'flux2\\flux2Klein9BInt8_v10.safetensors',
                comfyFlux2Clip: 'qwen38BFluxKlein9BTE_38b.safetensors',
                comfyFlux2Vae: 'flux2-vae.safetensors',
                comfyFlux2Resolution: '832x1216',
                comfyFlux2UseLora: true,
                comfyFlux2Lora1Name: '',
                comfyFlux2Lora1Strength: 1,
                comfyFlux2Lora2Name: '',
                comfyFlux2Lora2Strength: 1,
                comfyFlux2Lora3Name: '',
                comfyFlux2Lora3Strength: 1,
                comfyFlux2Lora4Name: '',
                comfyFlux2Lora4Strength: 1,
                comfyFlux2Lora5Name: '',
                comfyFlux2Lora5Strength: 1,
                comfyFlux2Lora6Name: '',
                comfyFlux2Lora6Strength: 1,
                comfySteps: 10,
                comfyCfg: 1,
                comfySampler: 'euler',
            });
        } else if (newOpts.comfyModelType === 'krea2-simple') {
            applyDefaultsIfMissing({
                comfyKreaPrompt: '',
                comfyKreaStyle: undefined,
                comfyKreaStyleStrength: undefined,
                comfyKreaUseStyleSettings: false,
                comfyKreaNegativePrompt: '',
                comfyKreaUnet: 'krea2_turbo_fp8_scaled.safetensors',
                comfyKreaClip: 'qwen3vl_4b_fp8_scaled.safetensors',
                comfyKreaVae: 'qwen_image_vae.safetensors',
                comfyKreaResolution: '832x1216',
                comfyKreaUseLora: true,
                comfyKreaLora1Name: '',
                comfyKreaLora1Strength: 1,
                comfyKreaLora2Name: 'KREA\\snofs_krea_v1_nostrip.safetensors',
                comfyKreaLora2Strength: 1,
                comfyKreaLora3Name: '',
                comfyKreaLora3Strength: 1,
                comfyKreaLora4Name: '',
                comfyKreaLora4Strength: 1,
                comfyKreaLora5Name: '',
                comfyKreaLora5Strength: 1,
                comfyKreaLora6Name: '',
                comfyKreaLora6Strength: 1,
                comfySteps: 10,
                comfyCfg: 1,
                comfySampler: 'er_sde',
                comfyScheduler: 'beta',
            });
        } else if (newOpts.comfyModelType === 'krea2-raw') {
            applyDefaultsIfMissing({
                comfyKreaPrompt: '',
                comfyKreaNegativePrompt: '',
                comfyKreaUnet: 'krea2_raw_fp8_scaled.safetensors',
                comfyKreaClip: 'qwen3vl_4b_fp8_scaled.safetensors',
                comfyKreaVae: 'Wan2.1_VAE.safetensors',
                comfyKreaResolution: '1920x1088',
                comfyKreaUseLora: true,
                comfyKreaLora1Name: 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors',
                comfyKreaLora1Strength: 0.6,
                comfyKreaLora2Name: 'KREA\\snofs_krea_v1_nostrip.safetensors',
                comfyKreaLora2Strength: 1,
                comfyKreaLora3Name: '', comfyKreaLora3Strength: 1,
                comfyKreaLora4Name: '', comfyKreaLora4Strength: 1,
                comfyKreaLora5Name: '', comfyKreaLora5Strength: 1,
                comfyKreaLora6Name: '', comfyKreaLora6Strength: 1.5,
                comfyCfg: 1,
            });
        }

        if (activeTab === 'character-generator') {
            dispatch(updateCharacterOptions(newOpts));
        } else if (switchModel && newOpts.comfyModelType) {
            dispatch(switchComfyModelOptions({ ...newOpts, comfyModelType: newOpts.comfyModelType }));
        } else {
            dispatch(updateOptions(newOpts));
        }
    }, [dispatch, activeTab]);

    const handleSwitchComfyModel = useCallback((modelType: NonNullable<GenerationOptions['comfyModelType']>) => {
        handleUpdateOptions({ comfyModelType: modelType }, true);
    }, [handleUpdateOptions]);

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
                const info = await getComfyUIObjectInfo(true);
                dispatch(setComfyUIObjectInfo(info));
            } catch (err) {
                console.error("Failed to get ComfyUI object info:", err);
                dispatch(setGlobalError({ title: "ComfyUI Error", message: "Connected to ComfyUI, but failed to retrieve model information. Check the server console for errors." }));
            }
        } else {
            setComfyUrlForHelper(url);
        }
    }, [dispatch]);

    const checkOllamaConnection = useCallback(async (url: string) => {
        setIsOllamaConnected(null);
        const result = await testOllamaConnection(url);
        setIsOllamaConnected(result.success);
    }, []);

    useEffect(() => {
        dispatch(setVersionInfo(versionData));
        const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
        dispatch(setTheme(savedTheme));

        const savedProjectName = localStorage.getItem('projectName');
        if (savedProjectName) {
            dispatch(setProjectName(savedProjectName));
        }

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            const user = JSON.parse(savedUser) as User;
            dispatch(setCurrentUser({ username: user.username, role: 'admin' }));
        }

        const savedFontSize = localStorage.getItem('fontSize');
        if (savedFontSize) dispatch(setFontSize(parseInt(savedFontSize)));

        const savedComfyUrl = localStorage.getItem('comfyui_url') || '';
        if (savedComfyUrl) {
            checkComfyUIConnection(savedComfyUrl);
        } else {
            dispatch(setIsComfyUIConnected(false));
        }

        checkOllamaConnection(localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL);

        const savedClientId = localStorage.getItem('google_client_id') || '';
        const savedDriveApiKey = localStorage.getItem('google_drive_api_key') || '';
        dispatch(setIsDriveConfigured(Boolean(savedClientId && savedDriveApiKey)));

        if (savedClientId && savedDriveApiKey) {
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

    }, [dispatch, checkComfyUIConnection, checkOllamaConnection]);

    useEffect(() => {
        let disposed = false;
        const load = async () => {
            try {
                let next: OpenRouterSettings;
                if (window.electron) {
                    if (!window.electron.getOpenRouterSettings) throw new Error('Restart Electron to load OpenRouter settings.');
                    next = await window.electron.getOpenRouterSettings();
                } else {
                    next = {
                        apiKey: localStorage.getItem('openrouter_api_key') || '',
                        model: localStorage.getItem('openrouter_model') || DEFAULT_OPENROUTER_MODEL,
                    };
                }
                if (disposed) return;
                updateOpenRouterSettings(next);
                setLocalOpenRouterSettings(next);
            } catch (cause) {
                console.error('Could not load OpenRouter settings:', cause);
                if (!disposed) dispatch(setGlobalError({ title: 'OpenRouter Settings Error', message: cause instanceof Error ? cause.message : String(cause) }));
            }
        };
        void load();
        return () => { disposed = true; };
    }, [dispatch]);

    useEffect(() => {
        dispatch(fetchLibrary());
    }, [dispatch]);

    // A changed catalog (new model or LoRA) also drops the per-node schemas cached for the workflow panels.
    useEffect(() => subscribeComfyUIObjectInfo(info => {
        try { clearH3CatalogCache(); } catch { /* URL rejected by the workflow panels: they cached nothing. */ }
        dispatch(setComfyUIObjectInfo(info));
    }), [dispatch]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.style.fontSize = `${fontSize}px`;
    }, [fontSize]);

    const handleTabChange = (tabId: string) => {
        if (tabId === 'group-photo-fusion' || tabId === 'past-forward') {
            setActiveFunSubTab(tabId === 'past-forward' ? 'past-forward' : 'photo-fusion');
            dispatch(setActiveTab('fun'));
        } else {
            dispatch(setActiveTab(tabId));
        }

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
        dispatch(setCurrentUser({ username, role: 'admin' }));
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
        clearGenerationJobs();
        setCharacterResultSnapshots({});
        setGenerationTimes({});
    };

    const handlePromptGenReset = useCallback(() => {
        dispatch(resetPromptGenState());
    }, [dispatch]);

    const handleVideoUtilsReset = useCallback(() => {
        dispatch(resetVideoUtilsState());
    }, [dispatch]);

    const handleActivePanelReset = useCallback(() => {
        if (activeTab === 'ltx-director') dispatch(clearLtxTransfer());
        if (activeTab === 'prompt-generator') dispatch(resetPromptGenState());
        if (activeTab === 'extractor-tools') dispatch(resetExtractorState());
        if (activeTab === 'fun') dispatch(removeAllFiles());
        if (activeTab === 'logo-theme-generator') dispatch(resetLogoThemeState());
        if (activePanelResetKey === 'video-utils') dispatch(resetVideoUtilsState());
        if (activePanelResetKey === 'upscale') setUpscaleSourceFile(null);
        setPanelResetVersions(current => ({ ...current, [activePanelResetKey]: (current[activePanelResetKey] || 0) + 1 }));
    }, [activeTab, activePanelResetKey, dispatch]);

    const characterGenerationControllerRef = useRef<AbortController | null>(null);
    const [isCharacterCancelling, setCharacterCancelling] = useState(false);
    const handleCancelCharacterGeneration = async () => {
        const cancellation = characterGenerationControllerRef.current;
        if (!cancellation || cancellation.signal.aborted) return;
        setCharacterCancelling(true);
        cancellation.abort(new Error('Operation was cancelled by the user.'));
        await cancelComfyUIExecution();
    };
    const handleExportImageWorkflow = async (exportOptions: GenerationOptions) => {
        try {
            await exportComfyUIWorkflow(exportOptions, sourceImage, elementImages.slice(0, exportOptions.comfyModelType === 'flux2-edit' ? 3 : 2));
        } catch (failure) {
            console.error('Could not export the image workflow:', failure);
            dispatch(setGlobalError({ title: 'Workflow Export Failed', message: failure instanceof Error ? failure.message : 'Could not export the image workflow.' }));
        }
    };

    const handleGenerate = async () => {
        type JobsUpdate = GenerationJob[] | ((current: GenerationJob[]) => GenerationJob[]);
        const setCharacterGenerationJobs = (update: JobsUpdate) => setGenerationJobs(activeGenerationContentKey, update);
        const setImageGenerationJobs = (update: JobsUpdate) => setGenerationJobs(IMAGE_JOBS_KEY, update);
        const setMossPreview = setGenerationPreview;
        const characterCancellation = activeTab === 'character-generator' && currentOptions.provider === 'comfyui' ? new AbortController() : null;
        characterGenerationControllerRef.current = characterCancellation;
        setCharacterCancelling(false);
        const startTime = performance.now();
        setGenerationTimes(prev => ({ ...prev, [activeGenerationContentKey]: null }));

        const supportsProgressiveCharacter = activeTab === 'character-generator';
        const enabledCharacterAngles = supportsProgressiveCharacter ? getEnabledCharacterAngles(characterOptions) : [];
        if (supportsProgressiveCharacter) {
            setCharacterGenerationJobs(enabledCharacterAngles.map((angle, index) => {
                const outputNumber = CHARACTER_ANGLES.findIndex(candidate => candidate.id === angle.id) + 1;
                return {
                    label: characterOptions.comfyCharacterAngleSettings?.[angle.id]?.angle?.trim() || angle.label || `Output ${outputNumber || index + 1}`,
                    progress: 0,
                    message: 'Queued',
                    status: 'pending' as const,
                };
            }));
        }

        const supportsProgressiveImageGeneration = activeTab === 'image-generator' && currentOptions.provider === 'comfyui';
        const imageOutputCount = currentOptions.comfyModelType === 'face-detailer-sd1.5' ? 1
            : currentOptions.numImages * (currentOptions.comfyModelType === 'moss-photo' ? currentOptions.comfyMossPhoto?.batchSize ?? 1 : currentOptions.comfyModelType === 'moss-image' ? currentOptions.comfyMoss?.batchSize ?? 1 : currentOptions.comfyModelType === 'krea2-edit' ? currentOptions.comfyKrea2Edit?.batchSize ?? 1 : 1);
        setMossPreview(null);
        if (supportsProgressiveImageGeneration) {
            setImageGenerationJobs(Array.from({ length: imageOutputCount }, (_, index) => ({
                label: `Image ${index + 1}`,
                progress: 0,
                message: 'Queued',
                status: 'pending' as const,
            })));
        } else {
            setImageGenerationJobs([]);
        }

        dispatch(setLoadingState({ isLoading: true, owner: activeTab }));
        dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: [], options: currentOptions }));
        dispatch(setLastUsedPrompt({ tabId: activeGenerationContentKey, prompt: null }));
        dispatch(setGlobalError(null));
        if (!shouldGenerateCharacterName) {
            dispatch(setCharacterName(''));
        }

        const localUpdateProgress = (message: string, value: number) => {
            dispatch(updateProgress({ message, value }));
        };

        try {
            if (supportsProgressiveCharacter) {
                const snapshot = createCharacterResultSnapshot(characterOptions, sourceImage, shouldGenerateCharacterName ? '' : characterName);
                setCharacterResultSnapshots(current => ({ ...current, [activeGenerationContentKey]: snapshot }));
            }
            let result: { images: { src: string; usageMetadata?: any }[], finalPrompt: string | null };

            if (activeTab === 'character-generator' && (currentOptions.provider === 'gemini' || currentOptions.provider === 'mammouth')) {
                const completedImages: Awaited<ReturnType<typeof generateCloudCharacterAngles>>['images'] = [];
                const completedPrompts: string[] = [];
                result = await generateCloudCharacterAngles(
                    sourceImage, characterOptions, localUpdateProgress, clothingImage, backgroundImage, characterPoseImage,
                    (index, message, value) => setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job)),
                    (index, image, prompt) => {
                        completedImages.push(image);
                        completedPrompts.push(prompt);
                        setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: 1, message: `${job.label} complete`, status: 'done', src: image.src } : job));
                        dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: [...completedImages] }));
                        dispatch(setLastUsedPrompt({ tabId: activeGenerationContentKey, prompt: completedPrompts.join('\n\n') }));
                    },
                );
            } else if (currentOptions.provider === 'gemini') {
                result = await generatePortraits(
                    sourceImage, options, localUpdateProgress, clothingImage, backgroundImage,
                    previewedBackgroundImage, previewedClothingImage, maskImage, elementImages
                );
            } else if (currentOptions.provider === 'mammouth') {
                result = await generateMammouthImages(
                    sourceImage, options, localUpdateProgress, clothingImage, backgroundImage, maskImage, elementImages
                );
            } else if (currentOptions.provider === 'comfyui') {
                const comparisonSource = sourceImage && activeTab !== 'character-generator' && (options.comfyModelType === 'qwen-edit' || options.comfyModelType === 'krea2-edit' || (options.comfyModelType === 'moss-image' && options.comfyMoss?.refineImage)) ? await fileToDataUrl(sourceImage) : undefined;
                const progressiveImages: { src: string; seed: number }[] = [];
                const comfyResult = activeTab === 'character-generator'
                    ? await generateComfyUICharacterAngles(
                        sourceImage!, characterOptions, localUpdateProgress, clothingImage, backgroundImage, characterPoseImage,
                        (index, message, value) => setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job)),
                        (index, image) => {
                            progressiveImages[index] = image;
                            setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: 1, message: `${job.label} complete`, status: 'done', src: image.src } : job));
                            dispatch(setGeneratedImages({
                                tabId: activeGenerationContentKey,
                                images: progressiveImages.filter((item): item is { src: string; seed: number } => !!item),
                            }));
                        },
                        characterCancellation?.signal,
                    )
                    : await generateComfyUIPortraits(
                        sourceImage,
                        options,
                        localUpdateProgress,
                        elementImages.slice(0, options.comfyModelType === 'flux2-edit' ? 3 : 2),
                        activeTab === 'image-generator' ? (index, image) => {
                            progressiveImages[index] = image;
                            setImageGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? {
                                ...job,
                                progress: 1,
                                message: `Image ${index + 1} complete`,
                                status: 'done',
                                src: image.src,
                            } : job));
                            dispatch(setGeneratedImages({
                                tabId: activeGenerationContentKey,
                                images: progressiveImages.filter((item): item is { src: string; seed: number } => !!item).map(image => ({ ...image, before: comparisonSource })),
                            }));
                        } : undefined,
                        activeTab === 'image-generator' ? (index, message, value) => {
                            setImageGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job));
                        } : undefined,
                        activeTab === 'image-generator' && (options.comfyModelType === 'moss-image' || options.comfyModelType === 'moss-photo') ? setMossPreview : undefined,
                    );
                result = {
                    images: comfyResult.images.map(img => ({ src: img.src, seed: img.seed, usageMetadata: undefined, before: comparisonSource })),
                    finalPrompt: comfyResult.finalPrompt
                };
            } else {
                result = { images: [], finalPrompt: null };
            }

            dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: result.images }));
            dispatch(setLastUsedPrompt({ tabId: activeGenerationContentKey, prompt: result.finalPrompt }));

            const endTime = performance.now();
            setGenerationTimes(prev => ({ ...prev, [activeGenerationContentKey]: (endTime - startTime) / 1000 }));

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
                        setCharacterResultSnapshots(current => ({
                            ...current,
                            [activeGenerationContentKey]: { ...current[activeGenerationContentKey], characterName: name },
                        }));
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
            if (activeTab === 'character-generator') {
                setCharacterGenerationJobs(current => current.map(job => job.status === 'pending' ? { ...job, progress: 1, status: 'error', message: err.message || 'Generation failed' } : job));
            }
            if (activeTab === 'image-generator' && currentOptions.provider === 'comfyui') {
                setImageGenerationJobs(current => current.map(job => job.status === 'pending' ? { ...job, progress: 1, status: 'error', message: err.message || 'Generation failed' } : job));
            }
            if (err.message?.includes('cancelled by the user')) {
                console.log("Generation promise rejected due to cancellation.");
            } else {
                dispatch(setGlobalError({ title: "Generation Error", message: err.message || 'An unknown error occurred during generation.' }));
            }
        } finally {
            setMossPreview(null);
            if (characterCancellation && characterGenerationControllerRef.current === characterCancellation) {
                characterGenerationControllerRef.current = null;
                setCharacterCancelling(false);
            }
            dispatch(setLoadingState({ isLoading: false, owner: activeTab }));
        }
    };

    const handleSaveSettings = async (comfyUIUrl: string, googleClientId: string, googleApiKey: string, geminiApiKey?: string, mammouthApiKey?: string, ollamaUrl?: string, ollamaModel?: string, openRouterSettings?: OpenRouterSettings) => {
        if (openRouterSettings) {
            const next = { apiKey: openRouterSettings.apiKey.trim(), model: openRouterSettings.model.trim() || DEFAULT_OPENROUTER_MODEL };
            if (window.electron) {
                if (!window.electron.setOpenRouterSettings) throw new Error('Restart Electron to enable OpenRouter settings.');
                const saved = await window.electron.setOpenRouterSettings(next);
                if (!saved) throw new Error('OpenRouter settings could not be saved.');
            } else {
                if (next.apiKey) localStorage.setItem('openrouter_api_key', next.apiKey);
                else localStorage.removeItem('openrouter_api_key');
                localStorage.setItem('openrouter_model', next.model);
            }
            updateOpenRouterSettings(next);
            setLocalOpenRouterSettings(next);
        }
        localStorage.setItem('comfyui_url', comfyUIUrl);
        localStorage.setItem('google_client_id', googleClientId);
        localStorage.setItem('google_drive_api_key', googleApiKey.trim());
        driveService.resetGoogleDriveConfiguration();
        checkComfyUIConnection(comfyUIUrl);
        dispatch(setIsDriveConfigured(Boolean(googleClientId && googleApiKey.trim())));
        if (googleClientId && googleApiKey.trim()) {
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
        const nextOllamaUrl = ollamaUrl?.trim() || DEFAULT_OLLAMA_URL;
        const nextOllamaModel = ollamaModel?.trim() || DEFAULT_OLLAMA_MODEL;
        localStorage.setItem('ollama_url', nextOllamaUrl);
        localStorage.setItem('ollama_model', nextOllamaModel);
        setLocalOllamaUrl(nextOllamaUrl);
        setLocalOllamaModel(nextOllamaModel);
        await checkOllamaConnection(nextOllamaUrl);
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
            dispatch(setActiveVideoUtilsSubTab('upscale'));
            dispatch(setActiveTab('video-utils'));
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
        try {
            const folder = await driveService.connectAndPickFolder();
            if (folder) {
                if (driveFolder && driveFolder.id !== folder.id) {
                    await clearDriveFileReferences();
                    dispatch(fetchLibrary());
                }
                dispatch(setDriveFolder(folder));
            }
        } catch (err: any) {
            console.error("Drive connection failed:", err);
            dispatch(setGlobalError({ title: "Google Drive Error", message: err.message }));
        } finally {
            dispatch(setSyncMessage(''));
        }
    };

    const handleDriveDisconnect = () => {
        driveService.disconnect();
        dispatch(setDriveFolder(null));
    };

    const handleCreateDriveFolder = async (name: string) => {
        try {
            const folder = await driveService.createFolder(name);
            await clearDriveFileReferences();
            driveService.setFolder(folder);
            dispatch(setDriveFolder(folder));
            dispatch(fetchLibrary());
            dispatch(setSyncMessage(''));
        } catch (err: any) {
            console.error('Drive folder creation failed:', err);
            dispatch(setGlobalError({ title: 'Google Drive Error', message: err.message }));
            throw err;
        }
    };

    const runDriveSync = async (direction: 'download' | 'backup') => {
        if (!driveFolder || driveSyncControllerRef.current) return;
        const controller = new AbortController();
        driveSyncControllerRef.current = controller;
        dispatch(setIsSyncing(true));
        try {
            const onProgress = (message: string) => dispatch(setSyncMessage(message));
            if (direction === 'download') {
                await syncLibraryFromDrive(onProgress, undefined, controller.signal);
            } else {
                await syncLibraryToDrive(onProgress, controller.signal);
            }
            dispatch(fetchLibrary()); // Refresh UI
        } catch (err: any) {
            if (controller.signal.aborted) {
                dispatch(setSyncMessage(`${direction === 'download' ? 'Download' : 'Backup'} cancelled.`));
            } else {
                console.error(`Drive ${direction} failed:`, err);
                dispatch(setGlobalError({ title: `Drive ${direction === 'download' ? 'Download' : 'Backup'} Error`, message: err.message }));
            }
        } finally {
            driveSyncControllerRef.current = null;
            dispatch(setIsSyncing(false));
        }
    };

    const handleDownloadFromDrive = () => runDriveSync('download');
    const handleBackupToDrive = () => runDriveSync('backup');

    const handleCancelDriveSync = () => {
        driveSyncControllerRef.current?.abort();
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
            : characterOptions.provider === 'gemini'
                ? (characterOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL)
            : characterOptions.provider === 'comfyui'
                ? characterOptions.comfyCharacterMode === 'flux2'
                    ? isBlazingCharacter ? `Blazing Fast character: ${blazingModel}` : 'FLUX2-Klein-Multi-Angle'
                    : characterOptions.comfyCharacterMode === 'qwen21' ? 'Qwen Image 2.1 - Character Sheet' : characterOptions.comfyCharacterMode === 'qwen21-create' ? 'Qwen Image 2.1 - Create Character' : 'Qwen-Edit-Multi-Angle'
                : DEFAULT_GEMINI_IMAGE_MODEL;
    } else if (activeTab === 'scene-variation') {
        activeModel = sceneVariationModel.startsWith('Qwen Image 2.1') || sceneVariationModel.startsWith('Creation suite') || sceneVariationModel.startsWith('Clothes Switcher') ? sceneVariationModel : `FLUX2 Edit: ${sceneVariationModel}`;
    } else if (activeTab === 'video-utils' && activeVideoUtilsSubTab === 'outpaint') {
        activeModel = 'Qwen Image 2.1 Outpaint';
    } else if (activeTab === 'fun') {
        activeModel = activeFunSubTab === 'photo-fusion'
            ? groupPhotoFusionProvider === 'comfyui'
                ? 'ComfyUI · FLUX2 Photo Fusion'
                : groupPhotoFusionProvider === 'qwen'
                    ? `Qwen Edit · ${options.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors'}`
                    : `Mammouth · ${options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL}`
            : activeFunSubTab === 'past-forward'
                ? options.pastForwardProvider === 'mammouth'
                    ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
                    : options.pastForwardProvider === 'qwen'
                        ? `Qwen Edit · ${options.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors'}`
                    : `FLUX2 Edit · ${options.comfyFlux2EditUnet || 'Default UNet'}`
            : activeFunSubTab === 'swap-anything'
                ? 'ComfyUI · FLUX2 Swap Anything'
            : activeFunSubTab === 'swap-person'
                ? 'ComfyUI · FLUX2 Swap a Person'
            : activeFunSubTab === 'stylise-anything'
                ? `FLUX2 Edit · ${options.comfyFlux2EditUnet || 'Default UNet'}`
            : options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    } else if (activeTab === 'extractor-tools') {
        const extractorGenerationProvider = activeExtractorSubTab === 'clothes'
            ? extractorState.clothesGenerationProvider
            : activeExtractorSubTab === 'hair'
                ? extractorState.hairGenerationProvider
            : activeExtractorSubTab === 'objects'
                ? extractorState.objectGenerationProvider
                : activeExtractorSubTab === 'poses' && extractorState.poseOutputMode === 'mannequin-image'
                    ? extractorState.poseGenerationProvider
                : activeExtractorSubTab === 'font'
                    ? extractorState.fontGenerationProvider || 'flux2'
                : null;
        if (extractorGenerationProvider === 'gemini') activeModel = options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL;
        else if (extractorGenerationProvider === 'mammouth') activeModel = options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL;
        else if (extractorGenerationProvider === 'flux2') activeModel = `FLUX2 Edit · ${options.comfyFlux2EditUnet || 'flux2\\flux2Klein9BInt8_v10.safetensors'}`;
        else if (activeExtractorSubTab === 'poses') activeModel = extractorState.poseAnalysisProvider === 'mammouth' ? 'MediaPipe + Mammouth' : 'MediaPipe + Gemini 2.5';
        else if (activeExtractorSubTab === 'font') activeModel = DEFAULT_GEMINI_IMAGE_MODEL;
        else activeModel = 'gemini-2.5-flash';
    } else if (activeTab === 'logo-theme-generator') {
        activeModel = options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    }

    const activeProvider: Provider = activeTab === 'scene-variation' || activeTab === 'video-utils' && (activeVideoUtilsSubTab === 'outpaint' || activeVideoUtilsSubTab === 'upscale') ? 'comfyui' : activeTab === 'character-generator'
        ? characterOptions.provider
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'clothes'
            ? extractorState.clothesGenerationProvider === 'gemini' ? 'gemini' : extractorState.clothesGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'objects'
            ? extractorState.objectGenerationProvider === 'gemini' ? 'gemini' : extractorState.objectGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'hair'
            ? extractorState.hairGenerationProvider === 'gemini' ? 'gemini' : extractorState.hairGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'poses' && extractorState.poseOutputMode === 'mannequin-image'
            ? extractorState.poseGenerationProvider === 'gemini' ? 'gemini' : extractorState.poseGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'poses'
            ? extractorState.poseAnalysisProvider
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'font'
            ? (extractorState.fontGenerationProvider || 'flux2') === 'gemini' ? 'gemini' : (extractorState.fontGenerationProvider || 'flux2') === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'photo-fusion'
            ? groupPhotoFusionProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'past-forward'
            ? options.pastForwardProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && (activeFunSubTab === 'swap-anything' || activeFunSubTab === 'swap-person')
            ? 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'stylise-anything'
            ? 'comfyui'
            : options.provider;

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

    // The tab bar sticks under the header, whose height changes when it wraps.
    const stickUnderHeader = useCallback((bar: HTMLDivElement | null) => {
        const header = document.querySelector('header');
        if (!bar || !header) return undefined;
        const observer = new ResizeObserver(() => { bar.style.top = `${header.offsetHeight}px`; });
        observer.observe(header);
        return () => observer.disconnect();
    }, []);

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
                onOpenInstallationDashboard={() => setIsInstallationDashboardOpen(true)}
                onOpenVisualSettings={() => dispatch(openVisualSettingsModal())}
                onOpenComfyUIHelper={() => dispatch(openComfyUIHelper())}
                isComfyUIConnected={isComfyUIConnected}
                isOllamaConnected={isOllamaConnected}
                versionInfo={versionInfo}
                driveFolder={driveFolder}
                onDriveConnect={handleDriveConnect}
                onCreateDriveFolder={() => setIsDriveFolderCreateOpen(true)}
                onDriveDisconnect={handleDriveDisconnect}
                onCancelDriveSync={handleCancelDriveSync}
                isDriveSyncing={isSyncing}
                isDriveConfigured={isDriveConfigured}
                sessionTokenUsage={sessionTokenUsage}
                onResetTokenUsage={handleResetTokenUsage}
                activeTab={activeTab}
                provider={activeProvider}
                activeModel={activeModel}
            />

            {/* Main Content Area */}
            <main className="flex-grow w-full mx-auto p-4 pt-6 flex flex-col relative">
                {/* Global Error Display */}
                {globalError && (
                    <ErrorModal
                        title={globalError.title}
                        message={globalError.message}
                        onClose={() => dispatch(setGlobalError(null))}
                    />
                )}

                <DriveFolderCreateModal
                    isOpen={isDriveFolderCreateOpen}
                    parentName={driveFolder?.name || 'My Drive'}
                    onClose={() => setIsDriveFolderCreateOpen(false)}
                    onCreate={handleCreateDriveFolder}
                />

                {/* Helper Modals */}
                <ConnectionSettingsModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => dispatch(closeSettingsModal())}
                    initialComfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                    initialGoogleClientId={localStorage.getItem('google_client_id') || ''}
                    initialGoogleApiKey={localStorage.getItem('google_drive_api_key') || ''}
                    initialGeminiApiKey={localGeminiKey}
                    initialMammouthApiKey={localMammouthKey}
                    initialOpenRouterSettings={localOpenRouterSettings}
                    initialOllamaUrl={localOllamaUrl}
                    initialOllamaModel={localOllamaModel}
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

                <InstallationDashboardModal
                    isOpen={isInstallationDashboardOpen}
                    onClose={() => setIsInstallationDashboardOpen(false)}
                    geminiConfigured={Boolean(localGeminiKey)}
                    mammouthKey={localMammouthKey}
                    ollamaUrl={localOllamaUrl}
                />

                {/* Navigation Tabs */}
                <div ref={stickUnderHeader} className="flex flex-nowrap justify-start xl:justify-center gap-0.5 mb-4 sticky top-0 z-[11] bg-bg-primary p-1 rounded-lg border border-border-primary shadow-sm mx-auto w-full max-w-7xl overflow-x-auto">
                    {[
                        { id: 'image-generator', label: 'Image Gen', icon: <ImageGeneratorIcon className="w-4 h-4" />, activeClass: 'border-cyan-400 bg-cyan-400/15 text-cyan-300 shadow-cyan-500/20' },
                        { id: 'character-generator', label: 'Character', icon: <CharacterIcon className="w-4 h-4" />, activeClass: 'border-fuchsia-400 bg-fuchsia-400/15 text-fuchsia-300 shadow-fuchsia-500/20' },
                        { id: 'style-gallery', label: 'Gestionnaire de styles', icon: <SwatchIcon className="w-4 h-4" />, activeClass: 'border-purple-400 bg-purple-400/15 text-purple-300 shadow-purple-500/20' },
                        { id: 'scene-variation', label: 'Scene Variation', icon: <ImageGeneratorIcon className="w-4 h-4" />, activeClass: 'border-lime-300 bg-lime-300/15 text-lime-200 shadow-lime-400/20' },
                        { id: 'video', label: 'Video', icon: <VideoIcon className="w-4 h-4" />, activeClass: 'border-amber-400 bg-amber-400/15 text-amber-300 shadow-amber-500/20' },
                        { id: 'tts', label: 'TTS', icon: <MicrophoneIcon className="w-4 h-4" />, activeClass: 'border-emerald-400 bg-emerald-400/15 text-emerald-300 shadow-emerald-500/20' },
                        { id: 'prompt-generator', label: 'Prompt', icon: <PromptIcon className="w-4 h-4" />, activeClass: 'border-violet-400 bg-violet-400/15 text-violet-300 shadow-violet-500/20' },
                        { id: 'extractor-tools', label: 'Extractor', icon: <ExtractorIcon className="w-4 h-4" />, activeClass: 'border-orange-400 bg-orange-400/15 text-orange-300 shadow-orange-500/20' },
                        { id: 'fun', label: 'Fun', icon: <GroupPhotoFusionIcon className="w-4 h-4" />, activeClass: 'border-rose-400 bg-rose-400/15 text-rose-300 shadow-rose-500/20' },
                        { id: 'logo-theme-generator', label: 'Logo', icon: <SwatchIcon className="w-4 h-4" />, activeClass: 'border-pink-400 bg-pink-400/15 text-pink-300 shadow-pink-500/20' },
                        { id: 'video-utils', label: 'Tools', icon: <VideoUtilsIcon className="w-4 h-4" />, activeClass: 'border-sky-400 bg-sky-400/15 text-sky-300 shadow-sky-500/20' },
                        { id: 'civitai', label: 'Models/LoRAs', icon: <DownloadIcon className="w-4 h-4" />, activeClass: 'border-teal-400 bg-teal-400/15 text-teal-300 shadow-teal-500/20' },
                        { id: 'library', label: 'Library', icon: <LibraryIcon className="w-4 h-4" />, activeClass: 'border-indigo-400 bg-indigo-400/15 text-indigo-300 shadow-indigo-500/20' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            aria-label={tab.label}
                            title={tab.label}
                            className={`flex items-center gap-1 border px-2 py-1 rounded-md font-medium transition-all duration-200 text-[10px] md:text-xs whitespace-nowrap ${activeTab === tab.id || (tab.id === 'video' && activeTab === 'ltx-director')
                                ? `${tab.activeClass} shadow-sm`
                                : 'border-transparent bg-transparent text-text-secondary hover:border-border-primary hover:bg-bg-tertiary hover:text-text-primary'
                                }`}
                        >
                            {tab.icon}
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content Views - Centered Wrapper */}
                <div className={`w-full mx-auto border-t-2 border-accent pt-3 ${activeTab === 'library' ? 'max-w-none' : 'max-w-7xl'}`} style={getTabAccentStyle(activePanelResetKey)}>
                    {['ltx-director', 'tts', 'prompt-generator', 'video-utils'].includes(activeTab) || (activeTab === 'fun' && (activeFunSubTab === 'photo-fusion' || activeFunSubTab === 'past-forward' || activeFunSubTab === 'swap-anything' || activeFunSubTab === 'stylise-anything')) ? (
                        <div className="mb-3 flex justify-end">
                            <button type="button" onClick={handleActivePanelReset} className="flex items-center gap-2 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white">
                                <ResetIcon className="h-4 w-4" /> Reset
                            </button>
                        </div>
                    ) : null}
                    {['extractor-tools', 'logo-theme-generator'].includes(activeTab) && !(activeTab === 'extractor-tools' && activeExtractorSubTab === 'poses' && extractorState.poseOutputMode === 'controlnet-json') && (
                        <CloudImageProviderBar
                            options={options}
                            updateOptions={(updates) => dispatch(updateOptions(updates))}
                            extractorProvider={activeTab === 'extractor-tools'
                                ? activeExtractorSubTab === 'clothes'
                                    ? extractorState.clothesGenerationProvider
                                    : activeExtractorSubTab === 'hair'
                                        ? extractorState.hairGenerationProvider
                                    : activeExtractorSubTab === 'objects'
                                        ? extractorState.objectGenerationProvider
                                        : activeExtractorSubTab === 'poses' && extractorState.poseOutputMode === 'mannequin-image'
                                            ? extractorState.poseGenerationProvider
                                        : activeExtractorSubTab === 'font'
                                            ? extractorState.fontGenerationProvider || 'flux2'
                                        : undefined
                                : undefined}
                            onExtractorProviderChange={(provider) => dispatch(updateExtractorState(activeExtractorSubTab === 'objects'
                                ? { objectGenerationProvider: provider }
                                : activeExtractorSubTab === 'hair'
                                    ? { hairGenerationProvider: provider }
                                : activeExtractorSubTab === 'poses'
                                    ? { poseGenerationProvider: provider }
                                    : activeExtractorSubTab === 'font'
                                        ? { fontGenerationProvider: provider }
                                    : { clothesGenerationProvider: provider }))}
                            disabled={isLoading || extractorState.isGenerating || extractorState.isGeneratingHair || extractorState.isGeneratingObjects || extractorState.isGeneratingPoses || extractorState.isGeneratingFont}
                            action={
                                <button type="button" onClick={handleActivePanelReset} className="flex items-center gap-2 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white">
                                    <ResetIcon className="h-4 w-4" /> Reset
                                </button>
                            }
                        />
                    )}
                    <TabActivity mode={activeTab === 'image-generator' ? 'visible' : 'hidden'}>
                        <ImageGeneratorTab
                            options={options}
                            generationMode={generationMode}
                            sourceImage={sourceImage}
                            maskImage={maskImage}
                            elementImages={elementImages}
                            previewedBackgroundImage={previewedBackgroundImage}
                            previewedClothingImage={previewedClothingImage}
                            isLoading={isLoading}
                            isReady={isReadyToGenerate}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                            availableLoras={availableLoras}
                            activeTab={activeTab}
                            content={generatedContent[imageGeneratorContentKey]}
                            contentKey={imageGeneratorContentKey}
                            generationTime={generationTimes[imageGeneratorContentKey]}
                            jobsKey={IMAGE_JOBS_KEY}
                            updateOptions={handleUpdateOptions}
                            restoreOptions={handleSetOptions}
                            switchComfyModel={handleSwitchComfyModel}
                            onGenerate={handleGenerate}
                            onReset={handleReset}
                            onExportWorkflow={handleExportImageWorkflow}
                            onSourceChange={handleSheetSourceChange}
                            onSendToI2I={handleSendToI2I}
                            onSendToCharacter={handleSendToCharacter}
                            onSendToUpscale={handleSendToUpscale}
                        />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'scene-variation' ? 'visible' : 'hidden'}>
                        <SceneVariationPanel isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} onModelChange={setSceneVariationModel} pendingPreset={sceneVariationPreset} onPresetLoaded={() => setSceneVariationPreset(null)} />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'style-gallery' ? 'visible' : 'hidden'}>
                        <StyleGalleryPanel isComfyUIConnected={isComfyUIConnected} onOpenLibrary={path => { setModelLibraryRequest({ path, id: Date.now() }); handleTabChange('civitai'); }} />
                    </TabActivity>
                    <TabActivity mode={activeTab === 'character-generator' ? 'visible' : 'hidden'}>
                        <CharacterTab
                            options={characterOptions}
                            sourceImage={sourceImage}
                            clothingImage={clothingImage}
                            backgroundImage={backgroundImage}
                            characterPoseImage={characterPoseImage}
                            previewedBackgroundImage={previewedBackgroundImage}
                            previewedClothingImage={previewedClothingImage}
                            characterName={characterName}
                            shouldGenerateCharacterName={shouldGenerateCharacterName}
                            isLoading={isLoading}
                            isReady={isReadyToGenerate}
                            isCancelling={isCharacterCancelling}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                            content={generatedContent[characterGeneratorContentKey]}
                            contentKey={characterGeneratorContentKey}
                            generationTime={generationTimes[characterGeneratorContentKey]}
                            resultSnapshot={characterResultSnapshot}
                            blazingPreset={blazingPreset}
                            onBlazingPresetLoaded={() => setBlazingPreset(null)}
                            onBlazingModelChange={setBlazingModel}
                            onManageStyles={() => handleTabChange('style-gallery')}
                            updateOptions={handleUpdateOptions}
                            restoreOptions={handleSetOptions}
                            onGenerate={handleGenerate}
                            onReset={handleReset}
                            onCancel={handleCancelCharacterGeneration}
                            onSendToI2I={handleSendToI2I}
                            onSendToCharacter={handleSendToCharacter}
                            onSendToUpscale={handleSendToUpscale}
                        />
                    </TabActivity>

                    <FunTab active={activeTab === 'fun'} subTab={activeFunSubTab} onSubTabChange={setActiveFunSubTab} resetVersion={panelResetVersions.fun || 0} isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} />

                    <TabActivity mode={activeTab === 'prompt-generator' ? 'visible' : 'hidden'}>
                        <PromptGeneratorPanel
                            key={`prompt-${panelResetVersions['prompt-generator'] || 0}`}
                            activeSubTab={activePromptToolsSubTab}
                            setActiveSubTab={(id) => dispatch(setActivePromptToolsSubTab(id))}
                            onOpenLibraryForImage={() => dispatch(setModalOpen({ modal: 'isPromptGenImagePickerOpen', isOpen: true }))}
                            onOpenLibraryForBg={() => dispatch(setModalOpen({ modal: 'isPromptGenBgImagePickerOpen', isOpen: true }))}
                            onOpenLibraryForSubject={() => dispatch(setModalOpen({ modal: 'isPromptGenSubjectImagePickerOpen', isOpen: true }))}
                            onReset={handlePromptGenReset}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                            ollamaUrl={localOllamaUrl}
                            defaultOllamaModel={localOllamaModel}
                        />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'extractor-tools' ? 'visible' : 'hidden'}>
                        <ExtractorToolsPanel
                            key={`extractor-${panelResetVersions['extractor-tools'] || 0}`}
                            onOpenLibraryForClothes={() => dispatch(setModalOpen({ modal: 'isClothesSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForHair={() => dispatch(setModalOpen({ modal: 'isHairSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForObjects={() => dispatch(setModalOpen({ modal: 'isObjectSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForPoses={() => dispatch(setModalOpen({ modal: 'isPoseSourcePickerOpen', isOpen: true }))}
                            onOpenLibraryForMannequinRef={() => dispatch(setModalOpen({ modal: 'isMannequinRefPickerOpen', isOpen: true }))}
                            onOpenLibraryForFont={() => dispatch(setModalOpen({ modal: 'isFontSourcePickerOpen', isOpen: true }))}
                            ollamaUrl={localOllamaUrl}
                            defaultOllamaModel={localOllamaModel}
                            onOllamaModelChange={setLocalOllamaModel}
                            activeSubTab={activeExtractorSubTab}
                            setActiveSubTab={(id) => dispatch(setActiveExtractorSubTab(id))}
                        />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'logo-theme-generator' ? 'visible' : 'hidden'}>
                        <LogoThemeGeneratorPanel
                            key={`logo-${panelResetVersions['logo-theme-generator'] || 0}`}
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
                    </TabActivity>

                    <TabActivity mode={activeTab === 'video-utils' ? 'visible' : 'hidden'}>
                        <VideoUtilsPanel
                            key={`tools-${panelResetVersions['video-utils'] || 0}`}
                            setStartFrame={handleSetVideoStartFrame}
                            setEndFrame={handleSetVideoEndFrame}
                            onOpenLibrary={() => dispatch(setModalOpen({ modal: 'isColorImagePickerOpen', isOpen: true }))}
                            onOpenVideoLibrary={() => dispatch(setModalOpen({ modal: 'isVideoUtilsPickerOpen', isOpen: true }))}
                            activeSubTab={activeVideoUtilsSubTab}
                            setActiveSubTab={(id) => dispatch(setActiveVideoUtilsSubTab(id))}
                            onReset={handleVideoUtilsReset}
                            onOpenLibraryForResizeCrop={() => dispatch(setModalOpen({ modal: 'isResizeCropPickerOpen', isOpen: true }))}
                        />
                        <div className="mt-4">
                            <TabActivity mode={activeVideoUtilsSubTab === 'outpaint' ? 'visible' : 'hidden'}>
                                <OutpaintPanel key={`outpaint-${panelResetVersions.outpaint || 0}`} isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} />
                            </TabActivity>
                            <TabActivity mode={activeVideoUtilsSubTab === 'upscale' ? 'visible' : 'hidden'}>
                                <UpscalePanel
                                    key={`upscale-${panelResetVersions.upscale || 0}`}
                                    sourceFile={upscaleSourceFile}
                                    setSourceFile={setUpscaleSourceFile}
                                    onOpenLibrary={() => setIsUpscalePickerOpen(true)}
                                    isComfyUIConnected={isComfyUIConnected}
                                    comfyUIObjectInfo={comfyUIObjectInfo}
                                />
                            </TabActivity>
                        </div>
                    </TabActivity>

                    <TabActivity mode={activeTab === 'video' || activeTab === 'ltx-director' ? 'visible' : 'hidden'}>
                        <VideoWorkspace
                            libraryItem={videoPromptToLoad}
                            libraryWorkflow={videoPromptDestination}
                            libraryFinishing={videoFinishing}
                            onLibraryItemLoaded={handleVideoPromptLoaded}
                            openDirector={activeTab === 'ltx-director'}
                            onLeaveDirector={handleLeaveVideoDirector}
                            onResetDirector={() => {
                                dispatch(clearLtxTransfer());
                                setPanelResetVersions(current => ({ ...current, 'ltx-director': (current['ltx-director'] || 0) + 1 }));
                            }}
                            director={<LTXDirectorPanel
                            key={`ltx-${panelResetVersions['ltx-director'] || 0}`}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                            />}
                        />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'tts' ? 'visible' : 'hidden'}><TtsPanel key={`tts-${panelResetVersions.tts || 0}`} isComfyUIConnected={isComfyUIConnected} /></TabActivity>


                    <TabActivity mode={activeTab === 'civitai' ? 'visible' : 'hidden'}>
                        <CivitaiPanel libraryRequest={modelLibraryRequest} onLibraryRequestHandled={() => setModelLibraryRequest(null)} />
                    </TabActivity>

                    <TabActivity mode={activeTab === 'library' ? 'visible' : 'hidden'}>
                        <LibraryPanel
                            onUpscaleItem={(item) => handleSendToUpscale(item.media, item.name ? `${item.name}.png` : undefined)}
                            onLoadItem={(item, loadOptions) => {
                                // Logic to load item back into generator state
                                if (item.blazingFastOptions) {
                                    setBlazingPreset(item);
                                    dispatch(updateCharacterOptions({ provider: 'comfyui', comfyCharacterMode: 'flux2', comfyCharacterFlux2Tab: 'blazing-fast' }));
                                    dispatch(setActiveTab('character-generator'));
                                } else if (item.creationSuiteOptions || item.clothesSwitcherOptions) {
                                    setSceneVariationPreset(item);
                                    dispatch(setActiveTab('scene-variation'));
                                } else if (item.ltxRippleOptions) {
                                    setVideoFinishing(undefined);
                                    setVideoPromptDestination('ltx-ripple-ffaf');
                                    setVideoPromptToLoad(item);
                                    dispatch(setActiveTab('video'));
                                } else if (item.ltxAudioSyncOptions) {
                                    setVideoFinishing(undefined);
                                    setVideoPromptDestination('ltx-audio-sync');
                                    setVideoPromptToLoad(item);
                                    dispatch(setActiveTab('video'));
                                } else if (loadOptions?.videoFinishing || isMinimaxH3PromptLibraryItem(item)) {
                                    setVideoFinishing(loadOptions?.videoFinishing);
                                    setVideoPromptDestination(loadOptions?.videoFinishing ? 'advanced' : loadOptions?.videoWorkflow ?? item.videoPromptOptions?.renderOptions?.variant ?? 'reference');
                                    setVideoPromptToLoad(item);
                                    dispatch(setActiveTab('video'));
                                } else if (item.mediaType === 'preset' && item.sceneVariationPreset) {
                                    setSceneVariationPreset(item);
                                    dispatch(setActiveTab('scene-variation'));
                                } else if (item.ltxDirectorOptions) {
                                    dispatch(queueLtxTransfer({
                                        imageDataUrl: item.sourceImage || item.startFrame,
                                        videoDataUrl: item.mediaType === 'video' ? item.media : undefined,
                                        directorOptions: item.ltxDirectorOptions,
                                    }));
                                } else if (item.mediaType === 'preset' && item.options) {
                                    const removedMessage = item.options.provider === 'comfyui' ? removedImageWorkflowMessage(item.options.comfyModelType) : null;
                                    if (removedMessage) {
                                        dispatch(setGlobalError({ title: 'Workflow removed', message: removedMessage }));
                                        return;
                                    }
                                    const isComfyI2I = item.options.provider === 'comfyui'
                                        && ['qwen-edit', 'flux2-edit', 'krea2-edit', 'face-detailer-sd1.5'].includes(item.options.comfyModelType || '');
                                    const isCloudI2I = item.options.provider !== 'comfyui' && item.options.geminiMode === 'i2i';
                                    dispatch(setOptions(item.options));
                                    dispatch(setGenerationMode(isComfyI2I || isCloudI2I ? 'i2i' : 't2i'));
                                    dispatch(setSourceImage(null));
                                    dispatch(setMaskImage(null));
                                    dispatch(setElementImages([]));
                                    dispatch(setActiveTab('image-generator'));
                                } else if (item.mediaType === 'image' || item.mediaType === 'character') {
                                    if (item.options) {
                                        // Character items load into the Character Generator, not the Image Generator.
                                        const removedMessage = item.mediaType === 'image' && item.options.provider === 'comfyui' ? removedImageWorkflowMessage(item.options.comfyModelType) : null;
                                        if (removedMessage) {
                                            dispatch(setGlobalError({ title: 'Workflow removed', message: removedMessage }));
                                            return;
                                        }
                                        const isComfyI2I = item.options.provider === 'comfyui'
                                            && ['qwen-edit', 'flux2-edit', 'krea2-edit', 'face-detailer-sd1.5'].includes(item.options.comfyModelType || '');
                                        const isCloudI2I = item.options.provider !== 'comfyui' && item.options.geminiMode === 'i2i';
                                        const restoredMode = isComfyI2I || isCloudI2I ? 'i2i' : 't2i';
                                        dispatch(setGenerationMode(restoredMode));
                                        dispatch(setMaskImage(null));
                                        dispatch(setElementImages([]));
                                        const sourceDataUrl = restoredMode === 'i2i' ? (item.sourceImage || item.media) : null;
                                        if (sourceDataUrl) {
                                            fetch(sourceDataUrl).then(async response => {
                                                const blob = await response.blob();
                                                dispatch(setSourceImage(new File([blob], "library-source", { type: blob.type || 'image/jpeg' })));
                                            });
                                        } else {
                                            dispatch(setSourceImage(null));
                                        }
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
                                    dispatch(setActiveTab('ltx-director'));
                                } else if (item.mediaType === 'audio-tts') {
                                    const spokenText = item.indexTtsOptions
                                        ? formatIndexTtsTranscript(item.indexTtsOptions)
                                        : item.ttsOptions?.text.trim() || '';
                                    const dialogue = spokenText.replace(/"/g, "'");
                                    const ttsSegments = item.indexTtsOptions?.lines.map((line) => {
                                        const character = item.indexTtsOptions?.characters.find((candidate) => candidate.id === line.characterId);
                                        const ttsText = `${character?.name.trim() || 'Character'}: ${line.text.trim()}`;
                                        return {
                                            ttsText,
                                            prompt: createLtxScenePrompt(ttsText),
                                            imageDataUrl: loadOptions?.importTtsCharacterPhotos ? character?.thumbnail : undefined,
                                        };
                                    });
                                    const mimeType = item.media.match(/^data:([^;,]+)/)?.[1] || '';
                                    const extension = mimeType.includes('flac') ? 'flac' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'wav';
                                    dispatch(queueLtxTransfer({
                                        audioDataUrl: item.media,
                                        audioName: `${item.name || 'tts-result'}.${extension}`,
                                        ttsText: spokenText,
                                        ttsSegments,
                                        prompt: item.indexTtsOptions
                                            ? createLtxScenePrompt(spokenText)
                                            : dialogue ? `The character speaks clearly and naturally, saying: "${dialogue}"` : 'The character speaks clearly and naturally.',
                                    }));
                                }
                                // Add handling for other types if needed
                            }}
                            isDriveConnected={!!driveFolder}
                            onDownloadFromDrive={handleDownloadFromDrive}
                            onBackupToDrive={handleBackupToDrive}
                            onCancelDriveSync={handleCancelDriveSync}
                            isSyncing={isSyncing}
                            syncMessage={syncMessage}
                            isDriveConfigured={isDriveConfigured}
                        />
                    </TabActivity>
                </div>
            </main>

            {/* Modals */}
            <LibraryPickerHost />
            <LibraryPickerModal isOpen={isUpscalePickerOpen} onClose={() => setIsUpscalePickerOpen(false)} onSelectItem={(item) => { setIsUpscalePickerOpen(false); handleSendToUpscale(item.media, item.name ? `${item.name}.png` : undefined); }} filter={['image', 'character', 'logo', 'banner', 'album-cover']} />

        </div>
    );
};

export default App;
