import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from './store/store';
import {
    setCurrentUser, setTheme, setFontSize, setProjectName, setActiveTab, setIsComfyUIConnected, setIsMammouthConnected, setComfyUIObjectInfo, setVersionInfo,
    setGlobalError, setDriveFolder, setIsSyncing, setSyncMessage, setIsDriveConfigured,
    openSettingsModal, closeSettingsModal, openVisualSettingsModal, closeVisualSettingsModal,
    openOAuthHelper, closeOAuthHelper, openComfyUIHelper, closeComfyUIHelper,
    setModalOpen, addSessionTokenUsage, resetSessionTokenUsage, queueLtxTransfer, clearLtxTransfer
} from './store/appSlice';
import {
    setSourceImage, setGenerationMode, setCharacterName, setShouldGenerateCharacterName,
    setClothingImage, setBackgroundImage, setCharacterPoseImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
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

import type { User, GenerationOptions, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState, LibraryItemType, MannequinStyle, AppSliceState, UploadedFile, Provider } from './types';
import { fileToDataUrl, fileToResizedDataUrl, dataUrlToFile } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { DEFAULT_GEMINI_IMAGE_MODEL, generatePortraits, generateCharacterNameForImage, updateGeminiApiKey, getApiKey, generatePromptFromImage, getGeminiAspectRatios } from './services/geminiService';
import { generateComfyUICharacterAngles, generateComfyUIPortraits, exportComfyUIWorkflow, getComfyUIObjectInfo, checkConnection, cancelComfyUIExecution, generateComfyUIPromptFromSource } from './services/comfyUIService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, generateMammouthImages, getMammouthApiKey, testMammouthConnection, updateMammouthApiKey } from './services/mammouthService';
import { buildCharacterAnglePrompts, CHARACTER_ANGLES, getEnabledCharacterAngles } from './services/characterAnglesWorkflow';
import { Login } from './components/Login';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, testOllamaConnection } from './services/ollamaService';
import { LibraryPanel } from './components/LibraryPanel';
import { ExtractorToolsPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { LTXDirectorPanel } from './components/LTXDirectorPanel';
import { TtsPanel } from './components/TtsPanel';
import { createLtxScenePrompt, formatIndexTtsTranscript } from './utils/ttsTranscript';
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
import { InstallationDashboardModal } from './components/InstallationDashboardModal';
import { DriveFolderCreateModal } from './components/DriveFolderCreateModal';
import { ImageGeneratorIcon, LibraryIcon, VideoIcon, PromptIcon, ExtractorIcon, VideoUtilsIcon, SwatchIcon, CharacterIcon, CloseIcon, GroupPhotoFusionIcon, PastForwardIcon, MicrophoneIcon, EnhanceIcon, DownloadIcon, ResetIcon } from './components/icons';
import { ImageGeneratorHeader } from './components/ImageGeneratorHeader';
import { ActionControlPanel } from './components/ActionControlPanel';
import { CloudImageProviderBar } from './components/CloudImageProviderBar';
import { SamplerSettingsPanel } from './components/SamplerSettingsPanel';
import { LoraSettingsPanel } from './components/LoraSettingsPanel';
import * as driveService from './services/googleDriveService';
import { clearDriveFileReferences, setDriveService, syncLibraryFromDrive, syncLibraryToDrive } from './services/libraryService';
import GroupPhotoFusionPanel from './components/groupPhotoFusion/GroupPhotoFusionPanel';
import PastForwardPanel from './components/pastForward/PastForwardPanel';
import SwapAnythingPanel from './components/SwapAnythingPanel';
import StyliseAnythingPanel from './components/StyliseAnythingPanel';
import { PERSONAS } from './groupPhotoFusion/constants';
import { createAccentStyle, getTabAccentStyle } from './utils/accentTheme';

const FUN_ACCENT_STYLES = {
    'photo-fusion': createAccentStyle('#fb7185', '#fda4af', '#e11d48'),
    'past-forward': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    'swap-anything': createAccentStyle('#f59e0b', '#fbbf24', '#d97706'),
    'stylise-anything': createAccentStyle('#34d399', '#6ee7b7', '#059669'),
};

const getLibraryReferencePrompt = (item: LibraryItem): string => {
    if (['clothes', 'pose', 'object'].includes(item.mediaType) && item.name?.trim()) return item.name.trim();
    const candidates = [
        item.options?.comfyFlux2Prompt,
        item.options?.comfyPrompt,
        item.options?.geminiPrompt,
        item.themeOptions?.prompt,
        item.name,
    ];
    return candidates.find(candidate => candidate?.trim() && !/^(image|character)\s*#?\d+/i.test(candidate.trim()))?.trim() || '';
};

const App: React.FC = () => {
    // --- Redux Dispatch ---
    const dispatch: AppDispatch = useDispatch();

    // --- Local State ---
    const [comfyUrlForHelper, setComfyUrlForHelper] = useState('');
    const [localGeminiKey, setLocalGeminiKey] = useState('');
    const [localMammouthKey, setLocalMammouthKey] = useState('');
    const [localOllamaUrl, setLocalOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL);
    const [localOllamaModel, setLocalOllamaModel] = useState(() => localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL);
    const [isOllamaConnected, setIsOllamaConnected] = useState<boolean | null>(null);
    const [isGeneratingRefinePrompt, setIsGeneratingRefinePrompt] = useState(false);
    const [generationTimes, setGenerationTimes] = useState<Record<string, number | null>>({});
    const [imageGenerationJobs, setImageGenerationJobs] = useState<Array<{ label: string; progress: number; message: string; status: 'pending' | 'done' | 'error'; src?: string }>>([]);
    const [characterGenerationJobs, setCharacterGenerationJobs] = useState<Array<{ label: string; progress: number; message: string; status: 'pending' | 'done' | 'error'; src?: string }>>([]);
    const [upscaleSourceFile, setUpscaleSourceFile] = useState<File | null>(null);
    const [isUpscalePickerOpen, setIsUpscalePickerOpen] = useState(false);
    const [isInstallationDashboardOpen, setIsInstallationDashboardOpen] = useState(false);
    const [isDriveFolderCreateOpen, setIsDriveFolderCreateOpen] = useState(false);
    const driveSyncControllerRef = useRef<AbortController | null>(null);
    const [activeFunSubTab, setActiveFunSubTab] = useState<'photo-fusion' | 'past-forward' | 'swap-anything' | 'stylise-anything'>('photo-fusion');
    const [panelResetVersions, setPanelResetVersions] = useState<Record<string, number>>({});

    // --- App State (from appSlice) ---
    const {
        currentUser, theme, projectName, fontSize, activeTab, isComfyUIConnected, comfyUIObjectInfo, versionInfo, globalError,
        isSettingsModalOpen, isVisualSettingsModalOpen, isOAuthHelperOpen, isComfyUIHelperOpen, isMammouthConnected,
        isClothingPickerOpen, isBackgroundPickerOpen, isPosePickerOpen, isColorImagePickerOpen, isVideoUtilsPickerOpen,
        isStartFramePickerOpen, isEndFramePickerOpen, isLogoRefPickerOpen, isLogoPalettePickerOpen, isLogoFontPickerOpen,
        isPromptGenImagePickerOpen, isPromptGenBgImagePickerOpen, isPromptGenSubjectImagePickerOpen,
        isNunchakuSourcePickerOpen, isCharacterSourcePickerOpen,
        isClothesSourcePickerOpen, isHairSourcePickerOpen, isObjectSourcePickerOpen, isPoseSourcePickerOpen,
        isBannerRefPickerOpen, isBannerPalettePickerOpen, isBannerLogoPickerOpen, isBannerFontPickerOpen,
        isAlbumCoverRefPickerOpen, isAlbumCoverPalettePickerOpen, isAlbumCoverLogoPickerOpen, isAlbumCoverFontPickerOpen,
        isMannequinRefPickerOpen, isRefineSourcePickerOpen, isFontSourcePickerOpen, isMaskPickerOpen, isElementPickerOpen,
        isResizeCropPickerOpen,
        isGroupFusionPickerOpen,
        driveFolder, isSyncing, syncMessage, isDriveConfigured, sessionTokenUsage
    } = useSelector((state: RootState) => state.app);

    // --- Generation State (from generationSlice) ---
    const {
        sourceImage, generationMode, characterName, shouldGenerateCharacterName, clothingImage,
        backgroundImage, characterPoseImage, previewedBackgroundImage, previewedClothingImage, maskImage, elementImages,
        options, characterOptions, isLoading, progressMessage, progressValue, generatedContent
    } = useSelector((state: RootState) => state.generation);

    // --- Video State (from videoSlice) ---
    const videoStartFrame = useSelector((state: RootState) => state.video.videoStartFrame);
    const videoEndFrame = useSelector((state: RootState) => state.video.videoEndFrame);
    const videoUtilsState = useSelector((state: RootState) => state.video.videoUtilsState);
    const activeVideoUtilsSubTab = useSelector((state: RootState) => state.video.activeVideoUtilsSubTab);
    const groupPhotoFusionProvider = useSelector((state: RootState) => state.groupPhotoFusion.provider);

    // --- Prompt Gen State (from promptGenSlice) ---
    const activePromptToolsSubTab = useSelector((state: RootState) => state.promptGen.activePromptToolsSubTab);

    // --- Extractor State (from extractorSlice) ---
    const activeExtractorSubTab = useSelector((state: RootState) => state.extractor.activeExtractorSubTab);
    const extractorState = useSelector((state: RootState) => state.extractor.extractorState);

    // --- Logo & Theme State (from logoThemeSlice) ---
    const logoThemeState = useSelector((state: RootState) => state.logoTheme.logoThemeState);
    const activeLogoThemeSubTab = useSelector((state: RootState) => state.logoTheme.activeLogoThemeSubTab);

    // --- Group Photo Fusion State ---
    const { uploadedFiles } = useSelector((state: RootState) => state.groupPhotoFusion);

    // --- Computed State ---
    const isReadyToGenerate = useSelector(selectIsReadyToGenerate);
    // Determine which options object to use based on the active tab
    const currentOptions = activeTab === 'character-generator' ? characterOptions : options;
    const imageGeneratorContentKey = options.provider === 'comfyui'
        ? `image-generator:${options.comfyModelType || 'sdxl'}`
        : 'image-generator';
    const activeGenerationContentKey = activeTab === 'image-generator' ? imageGeneratorContentKey : activeTab;

    // --- Memoized Handlers for Redux ---
    const handleSetOptions = useCallback((newOptions: GenerationOptions) => {
        if (activeTab === 'character-generator') {
            dispatch(setCharacterOptions(newOptions));
        } else {
            dispatch(setOptions(newOptions));
        }
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

        if (newOpts.comfyModelType === 'flux') {
            applyDefaultsIfMissing({
                comfyFluxUseLora: true,
                comfyFluxLora1Name: "Flux\\flux-turbo.safetensors",
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
                comfyFlux2EditUnet: 'flux-2-klein-4b-Q4_K_M.gguf',
                comfyFlux2EditClip: 'qwen_3_4b.safetensors',
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
                comfyFlux2NegativePrompt: '',
                comfyFlux2Unet: 'flux-2-klein-4b-Q4_K_M.gguf',
                comfyFlux2Clip: 'qwen3vl_4b_fp8_scaled.safetensors',
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
                comfyKreaNegativePrompt: '',
                comfyKreaUnet: 'krea2_raw_fp8_scaled.safetensors',
                comfyKreaClip: 'qwen3vl_4b_fp8_scaled.safetensors',
                comfyKreaVae: 'qwen_image_vae.safetensors',
                comfyKreaResolution: '832x1216',
                comfyKreaUseLora: true,
                comfyKreaLora1Name: 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors',
                comfyKreaLora1Strength: 0.6,
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
        dispatch(fetchLibrary());
    }, [dispatch]);

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
        if (activeTab === 'video-utils') dispatch(resetVideoUtilsState());
        if (activeTab === 'upscale') setUpscaleSourceFile(null);
        setPanelResetVersions(current => ({ ...current, [activeTab]: (current[activeTab] || 0) + 1 }));
    }, [activeTab, dispatch]);

    const handleGenerate = async () => {
        const startTime = performance.now();
        setGenerationTimes(prev => ({ ...prev, [activeGenerationContentKey]: null }));

        const supportsProgressiveCharacter = activeTab === 'character-generator' && (currentOptions.provider === 'comfyui' || currentOptions.provider === 'mammouth');
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
        } else {
            setCharacterGenerationJobs([]);
        }

        const supportsProgressiveImageGeneration = activeTab === 'image-generator' && currentOptions.provider === 'comfyui';
        const imageOutputCount = currentOptions.comfyModelType === 'face-detailer-sd1.5' ? 1 : currentOptions.numImages;
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

        dispatch(setLoadingState({ isLoading: true }));
        dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: [] }));
        dispatch(setLastUsedPrompt({ tabId: activeGenerationContentKey, prompt: null }));
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
                if (activeTab === 'character-generator') {
                    if (enabledCharacterAngles.length === 0) throw new Error('Enable at least one character output before generating.');
                    const prompts = buildCharacterAnglePrompts(characterOptions);
                    const completedImages: { src: string; usageMetadata?: any }[] = [];
                    for (let index = 0; index < enabledCharacterAngles.length; index += 1) {
                        const angle = enabledCharacterAngles[index];
                        const angleLabel = characterOptions.comfyCharacterAngleSettings?.[angle.id]?.angle?.trim() || angle.label;
                        const updateOutputProgress = (message: string, value: number) => {
                            setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job));
                            localUpdateProgress(`${angleLabel}: ${message}`, (index + value) / enabledCharacterAngles.length);
                        };
                        try {
                            updateOutputProgress(`Starting ${angleLabel}...`, 0.02);
                            const angleResult = await generateMammouthImages(sourceImage, {
                                ...optionsToUse,
                                numImages: 1,
                                poseMode: 'prompt',
                                poseSelection: [prompts[index]],
                            }, updateOutputProgress, clothingImage, backgroundImage, maskImage, elementImages);
                            const image = angleResult.images[0];
                            if (!image) throw new Error(`Mammouth returned no image for ${angleLabel}.`);
                            completedImages.push(image);
                            setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: 1, message: `${angleLabel} complete`, status: 'done', src: image.src } : job));
                            dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: [...completedImages] }));
                        } catch (outputError) {
                            setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: 1, message: outputError instanceof Error ? outputError.message : 'Generation failed', status: 'error' } : job));
                            throw outputError;
                        }
                    }
                    result = { images: completedImages, finalPrompt: prompts.join('\n\n') };
                } else {
                    result = await generateMammouthImages(
                        sourceImage, optionsToUse, localUpdateProgress, clothingImage, backgroundImage, maskImage, elementImages
                    );
                }
            } else if (currentOptions.provider === 'comfyui') {
                const progressiveImages: { src: string; seed: number }[] = [];
                const comfyResult = activeTab === 'character-generator'
                    ? await generateComfyUICharacterAngles(
                        sourceImage!, characterOptions, localUpdateProgress, clothingImage, backgroundImage, characterPoseImage,
                        (index, message, value) => setCharacterGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job)),
                        (index, image) => {
                            setCharacterGenerationJobs(current => {
                                const next = current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: 1, message: `${job.label} complete`, status: 'done' as const, src: image.src } : job);
                                const completed = next.filter(job => job.status === 'done' && job.src).map(job => ({ src: job.src! }));
                                dispatch(setGeneratedImages({ tabId: activeGenerationContentKey, images: completed }));
                                return next;
                            });
                        },
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
                                images: progressiveImages.filter((item): item is { src: string; seed: number } => !!item),
                            }));
                        } : undefined,
                        activeTab === 'image-generator' ? (index, message, value) => {
                            setImageGenerationJobs(current => current.map((job, jobIndex) => jobIndex === index ? { ...job, progress: value, message } : job));
                        } : undefined,
                    );
                result = {
                    images: comfyResult.images.map(img => ({ src: img.src, seed: img.seed, usageMetadata: undefined })),
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
            dispatch(setLoadingState({ isLoading: false }));
        }
    };

    const handleSaveSettings = async (comfyUIUrl: string, googleClientId: string, googleApiKey: string, geminiApiKey?: string, mammouthApiKey?: string, ollamaUrl?: string, ollamaModel?: string) => {
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
                    ? 'FLUX2-Klein-Multi-Angle'
                    : 'Qwen-Edit-Multi-Angle'
                : DEFAULT_GEMINI_IMAGE_MODEL;
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
        if (extractorGenerationProvider === 'mammouth') activeModel = options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL;
        else if (extractorGenerationProvider === 'flux2') activeModel = `FLUX2 Edit · ${options.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf'}`;
        else if (activeExtractorSubTab === 'poses') activeModel = 'MediaPipe + Gemini 2.5';
        else if (activeExtractorSubTab === 'font') activeModel = DEFAULT_GEMINI_IMAGE_MODEL;
        else activeModel = 'gemini-2.5-flash';
    } else if (activeTab === 'logo-theme-generator') {
        activeModel = options.provider === 'mammouth' ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL;
    }

    const activeProvider: Provider = activeTab === 'character-generator'
        ? characterOptions.provider
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'clothes'
            ? extractorState.clothesGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'objects'
            ? extractorState.objectGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'hair'
            ? extractorState.hairGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'poses' && extractorState.poseOutputMode === 'mannequin-image'
            ? extractorState.poseGenerationProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'extractor-tools' && activeExtractorSubTab === 'font'
            ? (extractorState.fontGenerationProvider || 'flux2') === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'photo-fusion'
            ? groupPhotoFusionProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'past-forward'
            ? options.pastForwardProvider === 'mammouth' ? 'mammouth' : 'comfyui'
        : activeTab === 'fun' && activeFunSubTab === 'swap-anything'
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
                <div className="flex flex-nowrap justify-start xl:justify-center gap-0.5 mb-4 sticky top-0 z-[11] bg-bg-primary/95 backdrop-blur-md p-1 rounded-lg border border-border-primary shadow-sm mx-auto w-full max-w-7xl overflow-x-auto">
                    {[
                        { id: 'image-generator', label: 'Image Gen', icon: <ImageGeneratorIcon className="w-4 h-4" />, activeClass: 'border-cyan-400 bg-cyan-400/15 text-cyan-300 shadow-cyan-500/20' },
                        { id: 'character-generator', label: 'Character', icon: <CharacterIcon className="w-4 h-4" />, activeClass: 'border-fuchsia-400 bg-fuchsia-400/15 text-fuchsia-300 shadow-fuchsia-500/20' },
                        { id: 'ltx-director', label: 'LTX Director', icon: <VideoIcon className="w-4 h-4" />, activeClass: 'border-amber-400 bg-amber-400/15 text-amber-300 shadow-amber-500/20' },
                        { id: 'tts', label: 'TTS', icon: <MicrophoneIcon className="w-4 h-4" />, activeClass: 'border-emerald-400 bg-emerald-400/15 text-emerald-300 shadow-emerald-500/20' },
                        { id: 'prompt-generator', label: 'Prompt', icon: <PromptIcon className="w-4 h-4" />, activeClass: 'border-violet-400 bg-violet-400/15 text-violet-300 shadow-violet-500/20' },
                        { id: 'extractor-tools', label: 'Extractor', icon: <ExtractorIcon className="w-4 h-4" />, activeClass: 'border-orange-400 bg-orange-400/15 text-orange-300 shadow-orange-500/20' },
                        { id: 'fun', label: 'Fun', icon: <GroupPhotoFusionIcon className="w-4 h-4" />, activeClass: 'border-rose-400 bg-rose-400/15 text-rose-300 shadow-rose-500/20' },
                        { id: 'logo-theme-generator', label: 'Logo', icon: <SwatchIcon className="w-4 h-4" />, activeClass: 'border-pink-400 bg-pink-400/15 text-pink-300 shadow-pink-500/20' },
                        { id: 'video-utils', label: 'Tools', icon: <VideoUtilsIcon className="w-4 h-4" />, activeClass: 'border-sky-400 bg-sky-400/15 text-sky-300 shadow-sky-500/20' },
                        { id: 'upscale', label: 'Upscale', icon: <EnhanceIcon className="w-4 h-4" />, activeClass: 'border-lime-400 bg-lime-400/15 text-lime-300 shadow-lime-500/20' },
                        { id: 'civitai', label: 'Models/LoRAs', icon: <DownloadIcon className="w-4 h-4" />, activeClass: 'border-teal-400 bg-teal-400/15 text-teal-300 shadow-teal-500/20' },
                        { id: 'library', label: 'Library', icon: <LibraryIcon className="w-4 h-4" />, activeClass: 'border-indigo-400 bg-indigo-400/15 text-indigo-300 shadow-indigo-500/20' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            aria-label={tab.label}
                            title={tab.label}
                            className={`flex items-center gap-1 border px-2 py-1 rounded-md font-medium transition-all duration-200 text-[10px] md:text-xs whitespace-nowrap ${activeTab === tab.id
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
                <div className={`w-full mx-auto border-t-2 border-accent pt-3 ${activeTab === 'library' ? 'max-w-none' : 'max-w-7xl'}`} style={getTabAccentStyle(activeTab)}>
                    {['ltx-director', 'tts', 'prompt-generator', 'video-utils', 'upscale'].includes(activeTab) || (activeTab === 'fun' && (activeFunSubTab === 'photo-fusion' || activeFunSubTab === 'past-forward' || activeFunSubTab === 'swap-anything' || activeFunSubTab === 'stylise-anything')) ? (
                        <div className="mb-3 flex justify-end">
                            <button type="button" onClick={handleActivePanelReset} className="flex items-center gap-2 rounded-md border border-danger/50 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white">
                                <ResetIcon className="h-4 w-4" /> Reset
                            </button>
                        </div>
                    ) : null}
                    {['extractor-tools', 'logo-theme-generator'].includes(activeTab) && (
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
                                <button type="button" onClick={handleActivePanelReset} className="flex items-center gap-2 rounded-md border border-danger/50 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger hover:text-white">
                                    <ResetIcon className="h-4 w-4" /> Reset
                                </button>
                            }
                        />
                    )}
                    <React.Activity mode={activeTab === 'image-generator' ? 'visible' : 'hidden'}>
                        <>
                            <ImageGeneratorHeader
                                options={currentOptions}
                                updateOptions={handleUpdateOptions}
                                restoreOptions={handleSetOptions}
                                switchComfyModel={handleSwitchComfyModel}
                                generationMode={generationMode}
                                setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                                onExportWorkflow={() => {
                                    const generatedImages = generatedContent[imageGeneratorContentKey]?.images || [];
                                    const lastImage = generatedImages.length > 0 ? generatedImages[generatedImages.length - 1] as any : null;
                                    const optionsToExport = lastImage && lastImage.seed !== undefined
                                        ? { ...currentOptions, comfySeed: lastImage.seed }
                                        : currentOptions;
                                    exportComfyUIWorkflow(optionsToExport, sourceImage, elementImages.slice(0, optionsToExport.comfyModelType === 'flux2-edit' ? 3 : 2));
                                }}
                                isDisabled={isLoading}
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                <div className="lg:col-span-1 space-y-8">
                                    {!(currentOptions.provider === 'comfyui'
                                        && generationMode === 't2i'
                                        && (currentOptions.comfyModelType === 'flux2-simple'
                                            || currentOptions.comfyModelType === 'krea2-simple'
                                            || currentOptions.comfyModelType === 'krea2-raw')) && (
                                    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                        <div className="mb-4 flex flex-wrap items-center gap-3">
                                            <h2 className="text-xl font-bold text-accent">
                                                {currentOptions.provider === 'comfyui' && generationMode === 't2i' && (currentOptions.comfyModelType === 'sd1.5' || currentOptions.comfyModelType === 'sdxl' || currentOptions.comfyModelType === 'flux' || currentOptions.comfyModelType === 'qwen-t2i-gguf' || currentOptions.comfyModelType === 'z-image')
                                                    ? '1. Refine (Optional)'
                                                    : '1. Source & Context'}
                                            </h2>
                                        </div>

                                        {currentOptions.provider === 'comfyui' && generationMode === 't2i' && (currentOptions.comfyModelType === 'sd1.5' || currentOptions.comfyModelType === 'sdxl' || currentOptions.comfyModelType === 'flux' || currentOptions.comfyModelType === 'qwen-t2i-gguf' || currentOptions.comfyModelType === 'z-image') ? (
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
                                            <div className="space-y-2">
                                                {currentOptions.comfyModelType === 'flux2-edit' && <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-text-secondary">Image 1</span>
                                                    <button type="button" onClick={() => dispatch(setModalOpen({ modal: 'isRefineSourcePickerOpen', isOpen: true }))} className="rounded-md bg-bg-tertiary p-2 text-text-secondary hover:bg-bg-tertiary-hover" title="Select Image 1 from Library"><LibraryIcon className="h-5 w-5" /></button>
                                                </div>}
                                                <ImageUploader
                                                    label={generationMode === 'i2i' ? 'Upload Source Image (Required)' : 'Upload Source Image (Optional for T2I)'}
                                                    id="main-source-upload"
                                                    onImageUpload={(file) => dispatch(setSourceImage(file))}
                                                    sourceFile={sourceImage}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    )}
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
                                                dispatch(updateOptions(currentOptions.comfyModelType === 'krea2-simple' || currentOptions.comfyModelType === 'krea2-raw'
                                                    ? { comfyKreaPrompt: prompt }
                                                    : currentOptions.comfyModelType === 'flux2-simple'
                                                        ? { comfyFlux2Prompt: prompt }
                                                        : { comfyPrompt: prompt }));
                                            } catch (error) {
                                                console.error("Failed to generate prompt:", error);
                                                dispatch(setGlobalError({ title: "Prompt Generation Failed", message: "Could not generate prompt from image." }));
                                            } finally {
                                                setIsGeneratingRefinePrompt(false);
                                            }
                                        }}
                                        onExportWorkflow={() => exportComfyUIWorkflow(options, sourceImage, elementImages.slice(0, options.comfyModelType === 'flux2-edit' ? 3 : 2))}
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
                                        isReady={isReadyToGenerate}
                                        isDisabled={isLoading}
                                        updateOptions={handleUpdateOptions}
                                    />
                                    {isLoading && imageGenerationJobs.length === 0 ? (
                                        <Loader message={progressMessage} progress={progressValue} onCancel={cancelComfyUIExecution} />
                                    ) : (
                                        <>
                                            {isLoading && <Loader message={progressMessage} progress={progressValue} onCancel={cancelComfyUIExecution} />}
                                            <ImageGrid
                                                images={generatedContent[imageGeneratorContentKey]?.images || []}
                                                generationJobs={isLoading ? imageGenerationJobs : []}
                                                onSendToI2I={handleSendToI2I}
                                                onSendToCharacter={handleSendToCharacter}
                                                onSendToUpscale={handleSendToUpscale}
                                                lastUsedPrompt={generatedContent[imageGeneratorContentKey]?.lastUsedPrompt}
                                                options={currentOptions}
                                                sourceImage={sourceImage}
                                                activeTab={imageGeneratorContentKey}
                                                generationTime={generationTimes[imageGeneratorContentKey]}
                                            />
                                        </>
                                    )}
                                    {currentOptions.provider === 'comfyui' && <>
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
                                    </>}
                                </div>
                            </div>
                        </>
                    </React.Activity>

                    <React.Activity mode={activeTab === 'character-generator' ? 'visible' : 'hidden'}>
                        <>
                        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border-primary bg-bg-secondary p-2 shadow-sm">
                            <div className="flex gap-1 rounded-lg bg-bg-tertiary p-1">
                                <button
                                    type="button"
                                    onClick={() => handleUpdateOptions({ provider: 'comfyui' })}
                                    disabled={isLoading}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currentOptions.provider === 'comfyui'
                                        ? 'bg-accent text-accent-text shadow-sm'
                                        : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                                        } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    ComfyUI
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleUpdateOptions({ provider: 'mammouth' })}
                                    disabled={isLoading}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currentOptions.provider === 'mammouth'
                                        ? 'bg-accent text-accent-text shadow-sm'
                                        : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                                        } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    Mammouth
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const geminiModel = currentOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL;
                                        const aspectRatio = getGeminiAspectRatios(geminiModel).includes(currentOptions.aspectRatio)
                                            ? currentOptions.aspectRatio
                                            : '1:1';
                                        handleUpdateOptions({ provider: 'gemini', geminiMode: 'i2i', geminiI2iMode: 'character', aspectRatio });
                                    }}
                                    disabled={isLoading}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currentOptions.provider === 'gemini'
                                        ? 'bg-accent text-accent-text shadow-sm'
                                        : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                                        } disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    Gemini
                                </button>
                            </div>
                            {currentOptions.provider === 'comfyui' && <div role="tablist" aria-label="ComfyUI character workflow" className="flex gap-1 rounded-lg bg-bg-tertiary p-1">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={(currentOptions.comfyCharacterMode || 'qwen') === 'qwen'}
                                    onClick={() => handleUpdateOptions({ comfyCharacterMode: 'qwen' })}
                                    disabled={isLoading}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${(currentOptions.comfyCharacterMode || 'qwen') === 'qwen' ? 'bg-accent text-accent-text shadow-sm' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'} disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    QWEN
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={currentOptions.comfyCharacterMode === 'flux2'}
                                    onClick={() => handleUpdateOptions({ comfyCharacterMode: 'flux2' })}
                                    disabled={isLoading}
                                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currentOptions.comfyCharacterMode === 'flux2' ? 'bg-accent text-accent-text shadow-sm' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'} disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                    FLUX2
                                </button>
                            </div>}
                        </div>
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
                                    hideProviderSwitch={true}
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
                                    characterPoseImage={characterPoseImage}
                                    setCharacterPoseImage={(file) => dispatch(setCharacterPoseImage(file))}
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
                                    isReady={isReadyToGenerate}
                                    isDisabled={isLoading}
                                />
                                {isLoading && characterGenerationJobs.length === 0 ? (
                                    <Loader message={progressMessage} progress={progressValue} />
                                ) : (
                                    <ImageGrid
                                        images={generatedContent['character-generator']?.images || []}
                                        generationJobs={characterGenerationJobs}
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
                        </>
                    </React.Activity>

                    {activeTab === 'fun' && <div className="mb-4 flex justify-center"><div className="inline-flex flex-wrap rounded-md border border-rose-400/40 bg-bg-secondary p-1 shadow-sm"><button type="button" onClick={() => setActiveFunSubTab('photo-fusion')} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold transition-colors ${activeFunSubTab === 'photo-fusion' ? 'bg-rose-500 text-white' : 'text-text-secondary hover:bg-bg-tertiary hover:text-rose-300'}`}><GroupPhotoFusionIcon className="h-4 w-4" />Photo Fusion</button><button type="button" onClick={() => setActiveFunSubTab('past-forward')} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold transition-colors ${activeFunSubTab === 'past-forward' ? 'bg-cyan-500 text-white' : 'text-text-secondary hover:bg-bg-tertiary hover:text-cyan-300'}`}><PastForwardIcon className="h-4 w-4" />Past Forward</button><button type="button" onClick={() => setActiveFunSubTab('swap-anything')} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold transition-colors ${activeFunSubTab === 'swap-anything' ? 'bg-amber-500 text-black' : 'text-text-secondary hover:bg-bg-tertiary hover:text-amber-300'}`}><EnhanceIcon className="h-4 w-4" />Swap Anything</button><button type="button" onClick={() => setActiveFunSubTab('stylise-anything')} className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold transition-colors ${activeFunSubTab === 'stylise-anything' ? 'bg-emerald-500 text-black' : 'text-text-secondary hover:bg-bg-tertiary hover:text-emerald-300'}`}><SwatchIcon className="h-4 w-4" />Stylise Anything</button></div></div>}

                    <React.Activity mode={activeTab === 'fun' && activeFunSubTab === 'past-forward' ? 'visible' : 'hidden'}><div key={`past-forward-${panelResetVersions.fun || 0}`} style={FUN_ACCENT_STYLES['past-forward']}><PastForwardPanel /></div></React.Activity>

                    <React.Activity mode={activeTab === 'fun' && activeFunSubTab === 'photo-fusion' ? 'visible' : 'hidden'}><div key={`photo-fusion-${panelResetVersions.fun || 0}`} style={FUN_ACCENT_STYLES['photo-fusion']}><GroupPhotoFusionPanel /></div></React.Activity>

                    <React.Activity mode={activeTab === 'fun' && activeFunSubTab === 'swap-anything' ? 'visible' : 'hidden'}><div key={`swap-anything-${panelResetVersions.fun || 0}`} style={FUN_ACCENT_STYLES['swap-anything']}><SwapAnythingPanel isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} /></div></React.Activity>

                    <React.Activity mode={activeTab === 'fun' && activeFunSubTab === 'stylise-anything' ? 'visible' : 'hidden'}><div key={`stylise-anything-${panelResetVersions.fun || 0}`} style={FUN_ACCENT_STYLES['stylise-anything']}><StyliseAnythingPanel isComfyUIConnected={isComfyUIConnected} comfyUIObjectInfo={comfyUIObjectInfo} /></div></React.Activity>

                    <React.Activity mode={activeTab === 'prompt-generator' ? 'visible' : 'hidden'}>
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
                    </React.Activity>

                    <React.Activity mode={activeTab === 'extractor-tools' ? 'visible' : 'hidden'}>
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
                    </React.Activity>

                    <React.Activity mode={activeTab === 'logo-theme-generator' ? 'visible' : 'hidden'}>
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
                    </React.Activity>

                    <React.Activity mode={activeTab === 'video-utils' ? 'visible' : 'hidden'}>
                        <VideoUtilsPanel
                            key={`tools-${panelResetVersions['video-utils'] || 0}`}
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
                            key={`ltx-${panelResetVersions['ltx-director'] || 0}`}
                            isComfyUIConnected={isComfyUIConnected}
                            comfyUIObjectInfo={comfyUIObjectInfo}
                        />
                    </React.Activity>

                    <React.Activity mode={activeTab === 'tts' ? 'visible' : 'hidden'}><TtsPanel key={`tts-${panelResetVersions.tts || 0}`} isComfyUIConnected={isComfyUIConnected} /></React.Activity>

                    <React.Activity mode={activeTab === 'upscale' ? 'visible' : 'hidden'}>
                        <UpscalePanel
                            key={`upscale-${panelResetVersions.upscale || 0}`}
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
                            onLoadItem={(item, loadOptions) => {
                                // Logic to load item back into generator state
                                if (item.ltxDirectorOptions) {
                                    dispatch(queueLtxTransfer({
                                        imageDataUrl: item.sourceImage || item.startFrame,
                                        videoDataUrl: item.mediaType === 'video' ? item.media : undefined,
                                        directorOptions: item.ltxDirectorOptions,
                                    }));
                                } else if (item.mediaType === 'preset' && item.options) {
                                    const isComfyI2I = item.options.provider === 'comfyui'
                                        && ['qwen-edit', 'flux2-edit', 'face-detailer-sd1.5', 'nunchaku-kontext-flux'].includes(item.options.comfyModelType || '');
                                    const isCloudI2I = item.options.provider !== 'comfyui' && item.options.geminiMode === 'i2i';
                                    dispatch(setOptions(item.options));
                                    dispatch(setGenerationMode(isComfyI2I || isCloudI2I ? 'i2i' : 't2i'));
                                    dispatch(setSourceImage(null));
                                    dispatch(setMaskImage(null));
                                    dispatch(setElementImages([]));
                                    dispatch(setActiveTab('image-generator'));
                                } else if (item.mediaType === 'image' || item.mediaType === 'character') {
                                    if (item.options) {
                                        const isComfyI2I = item.options.provider === 'comfyui'
                                            && ['qwen-edit', 'flux2-edit', 'face-detailer-sd1.5', 'nunchaku-kontext-flux'].includes(item.options.comfyModelType || '');
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
                    </React.Activity>
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
                onSelectItem={async (item) => {
                    if (characterOptions.comfyCharacterMode === 'flux2') {
                        const response = await fetch(item.media);
                        const blob = await response.blob();
                        dispatch(setCharacterPoseImage(new File([blob], 'pose_ref.jpg', { type: blob.type })));
                        return;
                    }
                    dispatch(updateCharacterOptions({
                        poseLibraryItems: [...(characterOptions.poseLibraryItems || []), item],
                        poseMode: 'library'
                    }));
                }}
                filter="pose"
                multiSelect={characterOptions.comfyCharacterMode !== 'flux2'}
                onSelectMultiple={(items) => {
                    if (characterOptions.comfyCharacterMode === 'flux2') return;
                    dispatch(updateCharacterOptions({
                        poseLibraryItems: items,
                        poseMode: 'library'
                    }));
                }}
            />
            {/* ... Other pickers ... */}
            <LibraryPickerModal isOpen={isCharacterSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isCharacterSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setSourceImage(new File([b], "char_source.jpg", { type: b.type }))); }} filter={['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo']} />
            <LibraryPickerModal isOpen={isRefineSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isRefineSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setSourceImage(new File([b], "refine_source.jpg", { type: b.type }))); }} filter={options.comfyModelType === 'flux2-edit' ? ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'] : 'image'} />
            <LibraryPickerModal isOpen={isMaskPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isMaskPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(setMaskImage(new File([b], "mask.png", { type: b.type }))); }} filter="image" />
            <LibraryPickerModal isOpen={isElementPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isElementPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); const maxReferences = options.comfyModelType === 'flux2-edit' ? 3 : 2; dispatch(setElementImages([...elementImages, new File([b], `element_${Date.now()}.jpg`, { type: b.type })].slice(0, maxReferences))); if (options.comfyModelType === 'flux2-edit' && elementImages.length < 3) { const roles = [...(options.comfyFlux2EditReferenceRoles || ['outfit', 'background', 'pose'])]; const libraryPrompts = [...(options.comfyFlux2EditReferenceLibraryPrompts || [])]; roles[elementImages.length] = item.mediaType === 'clothes' ? 'outfit' : item.mediaType === 'pose' ? 'pose' : roles[elementImages.length] || 'custom'; libraryPrompts[elementImages.length] = getLibraryReferencePrompt(item); dispatch(updateOptions({ comfyFlux2EditReferenceRoles: roles, comfyFlux2EditReferenceLibraryPrompts: libraryPrompts })); } }} filter={['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo']} />
            <LibraryPickerModal isOpen={isPromptGenImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ image: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPromptGenBgImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenBgImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ bgImage: new File([b], "bg_source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPromptGenSubjectImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPromptGenSubjectImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updatePromptGenState({ subjectImage: new File([b], "subj_source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isClothesSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isClothesSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ clothesSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isHairSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isHairSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ hairSourceFile: new File([b], "source.jpg", { type: b.type }), generatedHair: [] })); }} filter={['image', 'character', 'group-fusion']} />
            <LibraryPickerModal isOpen={isObjectSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isObjectSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ objectSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isPoseSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isPoseSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ poseSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isMannequinRefPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isMannequinRefPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ mannequinReferenceFile: new File([b], "ref.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isFontSourcePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isFontSourcePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateExtractorState({ fontSourceFile: new File([b], "source.jpg", { type: b.type }) })); }} filter="image" />
            <LibraryPickerModal isOpen={isColorImagePickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isColorImagePickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ colorPicker: { ...videoUtilsState.colorPicker, imageFile: new File([b], "source.jpg", { type: b.type }) } })); }} filter="image" />
            <LibraryPickerModal isOpen={isVideoUtilsPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isVideoUtilsPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ videoFile: new File([b], "video.mp4", { type: b.type }) })); }} filter="video" />
            <LibraryPickerModal isOpen={isResizeCropPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isResizeCropPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); dispatch(updateVideoUtilsState({ resizeCrop: { ...videoUtilsState.resizeCrop, sourceFile: new File([b], "source.jpg", { type: b.type }) } })); }} filter="image" />
            <LibraryPickerModal isOpen={isGroupFusionPickerOpen} onClose={() => dispatch(setModalOpen({ modal: 'isGroupFusionPickerOpen', isOpen: false }))} onSelectItem={async (item) => { const r = await fetch(item.media); const b = await r.blob(); const file = new File([b], `group-fusion-${item.id}.jpg`, { type: b.type }); const newFile: UploadedFile = { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), personaId: 'default' }; dispatch(setUploadedFiles([...uploadedFiles, newFile])); }} filter="image" />
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
