
import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Fix: Added LibraryItemType to the import to allow for explicit typing of filter arrays.
import type { User, GenerationOptions, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState, LibraryItemType, MannequinStyle } from './types';
import { authenticateUser } from './services/cloudUserService';
import { fileToDataUrl, fileToResizedDataUrl } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { generatePortraits, generateGeminiVideo, generateCharacterNameForImage } from './services/geminiService';
// Fix: Import 'checkConnection' to resolve missing name error.
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
// Fix: Corrected import to use `ExtractorToolsPanel`, which is the correct export from the module.
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

const initialExtractorState: ExtractorState = {
    clothesSourceFile: null,
    clothesDetails: '',
    isIdentifying: false,
    identifiedItems: [],
    isGenerating: false,
    generatedClothes: [],
    clothesError: null,
    generateFolded: false,
    excludeAccessories: true,
    objectSourceFile: null,
    objectHints: '',
    maxObjects: 5,
    isIdentifyingObjects: false,
    identifiedObjects: [],
    isGeneratingObjects: false,
    generatedObjects: [],
    objectError: null,
    poseSourceFile: null,
    isGeneratingPoses: false,
    generatedPoses: [],
    poseError: null,
    // Fix: Removed 'posesKeepClothes' as it does not exist in the ExtractorState type.
    mannequinStyle: 'wooden-artist',
    mannequinReferenceFile: null,
    fontSourceFile: null,
    isGeneratingFont: false,
    generatedFontChart: null,
    fontError: null,
};

const initialVideoUtilsState: VideoUtilsState = {
    videoFile: null,
    extractedFrame: null,
    colorPicker: {
        imageFile: null,
        palette: [],
        paletteName: '',
        colorCount: 8,
        isExtracting: false,
        error: null,
        dominantColorPool: [],
        pickingColorIndex: null,
    },
};

const initialLogoThemeState: LogoThemeState = {
    logoPrompt: '',
    brandName: '',
    slogan: '',
    logoStyle: 'symbolic',
    referenceItems: [],
    selectedPalette: null,
    numLogos: 4,
    backgroundColor: 'transparent',
    isGeneratingLogos: false,
    generatedLogos: [],
    logoError: null,
    
    // Banner Generator State
    bannerPrompt: '',
    bannerTitle: '',
    bannerAspectRatio: '16:9',
    bannerStyle: 'corporate-clean',
    bannerReferenceItems: [],
    bannerSelectedPalette: null,
    bannerSelectedLogo: null,
    bannerLogoPlacement: 'top-left',
    numBanners: 4,
    isGeneratingBanners: false,
    generatedBanners: [],
    bannerError: null,
    
    // Album Cover Generator State
    albumPrompt: '',
    albumTitle: '',
    artistName: '',
    musicStyle: 'rock',
    customMusicStyle: '',
    albumEra: 'modern',
    albumMediaType: 'digital',
    addVinylWear: false,
    albumFontStyleAdjectives: [],
    albumReferenceItems: [],
    albumSelectedPalette: null,
    albumSelectedLogo: null,
    numAlbumCovers: 1,
    isGeneratingAlbumCovers: false,
    generatedAlbumCovers: [],
    albumCoverError: null,
};


const App: React.FC = () => {
    // --- App State ---
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [theme, setTheme] = useState<string>('cyberpunk');
    const [activeTab, setActiveTab] = useState<string>('image-generator');
    const [isComfyUIConnected, setIsComfyUIConnected] = useState<boolean | null>(null);
    const [comfyUIObjectInfo, setComfyUIObjectInfo] = useState<any | null>(null);
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

    // --- Image Generation State ---
    const [sourceImage, setSourceImage] = useState<File | null>(null);
    const [characterName, setCharacterName] = useState<string>('');
    const [shouldGenerateCharacterName, setShouldGenerateCharacterName] = useState<boolean>(false);
    const [clothingImage, setClothingImage] = useState<File | null>(null);
    const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
    const [previewedBackgroundImage, setPreviewedBackgroundImage] = useState<string | null>(null);
    const [previewedClothingImage, setPreviewedClothingImage] = useState<string | null>(null);
    const [options, setOptions] = useState<GenerationOptions>({
        provider: 'gemini',
        numImages: 4,
        poseMode: 'random',
        poseSelection: [],
        background: 'original',
        clothing: 'original',
        aspectRatio: '3:4',
        imageStyle: 'photorealistic',
        photoStyle: 'professional photoshoot',
        eraStyle: 'a modern digital photograph',
        geminiMode: 't2i', // Default to T2I for the first tab
        // ComfyUI specific
        comfyModelType: 'sdxl',
        comfyPrompt: '',
        comfyNegativePrompt: 'blurry, bad quality, low-res, ugly, deformed, disfigured',
        comfySteps: 25,
        comfyCfg: 5.5,
        comfySampler: 'euler',
        comfyScheduler: 'normal',
        // Video Generation defaults
        videoProvider: 'comfyui',
        comfyVidModelType: 'wan-i2v',
    });
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [progressValue, setProgressValue] = useState<number>(0);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [lastUsedPrompt, setLastUsedPrompt] = useState<string | null>(null);
    const [globalError, setGlobalError] = useState<{ title: string; message: string } | null>(null);
    
    // --- Prompt Generation State ---
    const [promptGenState, setPromptGenState] = useState<PromptGenState>({
        image: null,
        prompt: '',
        bgImage: null,
        bgPrompt: '',
        subjectImage: null,
        subjectPrompt: '',
        soupPrompt: '',
        soupHistory: [],
    });
    const [activePromptToolsSubTab, setActivePromptToolsSubTab] = useState<string>('from-image');


    // --- Video Generation State ---
    const [videoStartFrame, setVideoStartFrame] = useState<File | null>(null);
    const [videoEndFrame, setVideoEndFrame] = useState<File | null>(null);
    const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
    const [generationOptionsForSave, setGenerationOptionsForSave] = useState<GenerationOptions | null>(null);

    // --- Video Utilities State ---
    const [videoUtilsState, setVideoUtilsState] = useState<VideoUtilsState>(initialVideoUtilsState);
    const [activeVideoUtilsSubTab, setActiveVideoUtilsSubTab] = useState<string>('frames');
    
    // --- Extractor Tools State ---
    const [extractorState, setExtractorState] = useState<ExtractorState>(initialExtractorState);
    const [activeExtractorSubTab, setActiveExtractorSubTab] = useState<string>('clothes');
    
    // --- Logo & Theme State ---
    const [logoThemeState, setLogoThemeState] = useState<LogoThemeState>(initialLogoThemeState);
    const [activeLogoThemeSubTab, setActiveLogoThemeSubTab] = useState<string>('logo');


    // --- UI Modals & Panels State ---
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
    const [isFeatureAnalysisModalOpen, setIsFeatureAnalysisModalOpen] = useState(false);
    const [isClothingPickerOpen, setIsClothingPickerOpen] = useState(false);
    const [isBackgroundPickerOpen, setIsBackgroundPickerOpen] = useState(false);
    const [isColorImagePickerOpen, setIsColorImagePickerOpen] = useState(false);
    const [isVideoUtilsPickerOpen, setIsVideoUtilsPickerOpen] = useState(false);
    const [isStartFramePickerOpen, setIsStartFramePickerOpen] = useState(false);
    const [isEndFramePickerOpen, setIsEndFramePickerOpen] = useState(false);
    const [isLogoRefPickerOpen, setIsLogoRefPickerOpen] = useState(false);
    const [isLogoPalettePickerOpen, setIsLogoPalettePickerOpen] = useState(false);
    const [isOAuthHelperOpen, setIsOAuthHelperOpen] = useState(false);
    const [isPromptGenImagePickerOpen, setIsPromptGenImagePickerOpen] = useState(false);
    const [isPromptGenBgImagePickerOpen, setIsPromptGenBgImagePickerOpen] = useState(false);
    const [isPromptGenSubjectImagePickerOpen, setIsPromptGenSubjectImagePickerOpen] = useState(false);
    const [isNunchakuSourcePickerOpen, setIsNunchakuSourcePickerOpen] = useState(false);
    const [isCharacterSourcePickerOpen, setIsCharacterSourcePickerOpen] = useState(false);
    const [isVideoStartFramePickerOpen, setIsVideoStartFramePickerOpen] = useState(false);
    const [isVideoEndFramePickerOpen, setIsVideoEndFramePickerOpen] = useState(false);
    const [isGeminiVideoSourcePickerOpen, setIsGeminiVideoSourcePickerOpen] = useState(false);
    const [isClothesSourcePickerOpen, setIsClothesSourcePickerOpen] = useState(false);
    const [isObjectSourcePickerOpen, setIsObjectSourcePickerOpen] = useState(false);
    const [isPoseSourcePickerOpen, setIsPoseSourcePickerOpen] = useState(false);
    const [isBannerRefPickerOpen, setIsBannerRefPickerOpen] = useState(false);
    const [isBannerPalettePickerOpen, setIsBannerPalettePickerOpen] = useState(false);
    const [isBannerLogoPickerOpen, setIsBannerLogoPickerOpen] = useState(false);
    const [isAlbumCoverRefPickerOpen, setIsAlbumCoverRefPickerOpen] = useState(false);
    const [isAlbumCoverPalettePickerOpen, setIsAlbumCoverPalettePickerOpen] = useState(false);
    const [isAlbumCoverLogoPickerOpen, setIsAlbumCoverLogoPickerOpen] = useState(false);
    const [isMannequinRefPickerOpen, setIsMannequinRefPickerOpen] = useState(false);
    const [isFontSourcePickerOpen, setIsFontSourcePickerOpen] = useState(false);

    
    // --- Google Drive State ---
    const [driveFolder, setDriveFolder] = useState<DriveFolder | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [isDriveConfigured, setIsDriveConfigured] = useState(false);

    // --- Computed State ---
    const isReadyToGenerate = useMemo(() => {
        if (isLoading) return false;
        if (options.provider === 'gemini') {
            if (options.geminiMode === 't2i') return !!options.geminiPrompt?.trim();
            return !!sourceImage;
        } else if (options.provider === 'comfyui') {
            const baseReady = !!isComfyUIConnected && !!options.comfyPrompt?.trim();
            if (options.comfyModelType === 'nunchaku-kontext-flux') {
                return baseReady && !!sourceImage;
            }
            return baseReady;
        }
        return false;
    }, [sourceImage, options, isLoading, isComfyUIConnected]);
    
    const isVideoReady = useMemo(() => {
        if (isLoading) return false;
        if (options.videoProvider === 'gemini') {
            return !!options.geminiVidPrompt?.trim();
        } else { // comfyui
            return !!videoStartFrame;
        }
    }, [isLoading, options.videoProvider, options.geminiVidPrompt, videoStartFrame]);

    // --- Effects ---
    useEffect(() => {
        fetch('/version.json').then(res => res.json()).then(setVersionInfo).catch(console.error);
        const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) setCurrentUser(JSON.parse(savedUser));
        
        const savedComfyUrl = localStorage.getItem('comfyui_url') || '';
        if (savedComfyUrl) {
            checkComfyUIConnection(savedComfyUrl);
        } else {
            setIsComfyUIConnected(false);
        }
        
        const savedClientId = localStorage.getItem('google_client_id') || '';
        setIsDriveConfigured(!!savedClientId);
        
        if (savedClientId) {
            setDriveService(driveService);
            driveService.restoreConnection().then(connected => {
                if (connected) {
                    const savedFolder = localStorage.getItem('drive_folder');
                    if (savedFolder) {
                        const folder = JSON.parse(savedFolder);
                        setDriveFolder(folder);
                        driveService.setFolder(folder);
                    }
                }
            });
        }
        
    }, []);

    const checkComfyUIConnection = async (url: string) => {
        setIsComfyUIConnected(null); // Set to loading state
        const { success } = await checkConnection(url);
        setIsComfyUIConnected(success);
        if (success) {
            try {
                const info = await getComfyUIObjectInfo();
                setComfyUIObjectInfo(info);
            } catch (err) {
                console.error("Failed to get ComfyUI object info:", err);
                setGlobalError({ title: "ComfyUI Error", message: "Connected to ComfyUI, but failed to retrieve model information. Check the server console for errors." });
            }
        }
    };
    
    const handleLogin = async (username: string, password: string): Promise<string | true> => {
        const user = await authenticateUser(username, password);
        if (user) {
            setCurrentUser(user);
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            return true;
        }
        return "Invalid username or password.";
    };

    const handleLogout = () => {
        setCurrentUser(null);
        sessionStorage.removeItem('currentUser');
    };

    const handleThemeChange = (newTheme: string) => {
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    const updateProgress = (message: string, value: number) => {
        setProgressMessage(message);
        setProgressValue(value);
    };
    
    const onAddSoupToHistory = (soup: string) => {
        setPromptGenState(prev => ({
            ...prev,
            soupPrompt: soup,
            soupHistory: [soup, ...prev.soupHistory].slice(0, 5)
        }));
    };
    
    const handleReset = () => {
        setSourceImage(null);
        setClothingImage(null);
        setBackgroundImage(null);
        setPreviewedBackgroundImage(null);
        setPreviewedClothingImage(null);
        setGeneratedImages([]);
        setLastUsedPrompt(null);
        setCharacterName('');
        setShouldGenerateCharacterName(false);
        setOptions(prev => ({
            ...prev,
            geminiPrompt: '',
            comfyPrompt: '',
            customBackground: '',
            customClothingPrompt: '',
        }));
        setPromptGenState({
            image: null, prompt: '', bgImage: null, bgPrompt: '',
            subjectImage: null, subjectPrompt: '', soupPrompt: '',
            soupHistory: [],
        });
    };
    
    const handleVideoReset = () => {
        setVideoStartFrame(null);
        setVideoEndFrame(null);
        setGeneratedVideo(null);
        setGenerationOptionsForSave(null);
    };

    const handleExtractorReset = () => {
        setExtractorState(initialExtractorState);
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setGeneratedImages([]);
        setLastUsedPrompt(null);
        setGlobalError(null);
        if (!shouldGenerateCharacterName) {
             setCharacterName('');
        }
        
        try {
            let result: { images: string[]; finalPrompt: string | null } = { images: [], finalPrompt: null };
            
            if (options.provider === 'gemini') {
                if (options.geminiMode === 't2i') {
                    result = await generatePortraits(
                        null, options, updateProgress, null, null,
                        previewedBackgroundImage, previewedClothingImage
                    );
                } else {
                    if (!sourceImage) throw new Error("Source image is required for Image-to-Image mode.");
                    result = await generatePortraits(
                        sourceImage, options, updateProgress, clothingImage, backgroundImage,
                        previewedBackgroundImage, previewedClothingImage
                    );
                }
            } else if (options.provider === 'comfyui') {
                result = await generateComfyUIPortraits(sourceImage, options, updateProgress);
            }
            
            setGeneratedImages(result.images);
            setLastUsedPrompt(result.finalPrompt);
            
            if(result.images.length > 0) {
                if (activeTab === 'character-generator' && shouldGenerateCharacterName) {
                    updateProgress("Generating character name...", 0.96);
                    try {
                        const name = await generateCharacterNameForImage(result.images[0]);
                        setCharacterName(name);
                    } catch (nameError) {
                        console.warn("Could not generate character name:", nameError);
                        setCharacterName(''); // Clear on error
                    }
                }
            }

        } catch (err: any) {
            console.error("Generation failed:", err);
            if (err.message?.includes('cancelled by the user')) {
                console.log("Generation promise rejected due to cancellation.");
            } else {
                setGlobalError({ title: "Generation Error", message: err.message || 'An unknown error occurred during generation.' });
            }
        } finally {
            setIsLoading(false);
            setProgressValue(0);
            setProgressMessage('');
        }
    };
    
    const handleGenerateVideo = async () => {
        setIsLoading(true);
        setGeneratedVideo(null);
        setLastUsedPrompt(null);
        setGlobalError(null);
        setGenerationOptionsForSave(options);

        try {
            if (options.videoProvider === 'comfyui') {
                if (!videoStartFrame) throw new Error("A start frame is required for video generation.");
                const { videoUrl, finalPrompt } = await generateComfyUIVideo(
                    videoStartFrame, videoEndFrame, options, updateProgress
                );
                setGeneratedVideo(videoUrl);
                setLastUsedPrompt(finalPrompt);
            } else if (options.videoProvider === 'gemini') {
                const { videoUrl, finalPrompt } = await generateGeminiVideo(
                    options,
                    videoStartFrame, // This is optional for the service
                    updateProgress
                );
                setGeneratedVideo(videoUrl);
                setLastUsedPrompt(finalPrompt);
            } else {
                 throw new Error("Selected video provider is not implemented.");
            }
        } catch (err: any) {
            console.error("Video generation failed:", err);
            if (err.message?.includes('cancelled by the user')) {
                console.log("Video generation promise rejected due to cancellation.");
            } else {
                setGlobalError({ title: "Video Generation Error", message: err.message || 'An unknown error occurred during video generation.' });
            }
        } finally {
            setIsLoading(false);
            setProgressValue(0);
            setProgressMessage('');
        }
    };

    const handleSaveSettings = (comfyUIUrl: string, googleClientId: string) => {
        localStorage.setItem('comfyui_url', comfyUIUrl);
        localStorage.setItem('google_client_id', googleClientId);
        checkComfyUIConnection(comfyUIUrl);
        setIsDriveConfigured(!!googleClientId);
        if (googleClientId) {
            setDriveService(driveService); // Re-initialize with new client ID
        } else {
            setDriveService(null);
            handleDriveDisconnect(); // Disconnect if ID is removed
        }
    };

    const handleSetNewSource = async (imageDataUrl: string) => {
        try {
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], "new_source_image.jpeg", { type: "image/jpeg" });
            setSourceImage(file);
            setCharacterName('');
            setActiveTab('character-generator');
        } catch (error) {
            console.error("Error setting new source image:", error);
            setGlobalError({ title: "File Error", message: "Could not use the selected image as a new source." });
        }
    };
    
    const handleLoadLibraryItem = async (item: LibraryItem) => {
        if (item.options) {
            setOptions(item.options);
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
                setSourceImage(sourceToSet);
                setGeneratedImages([item.media]);
                // When loading a character, parse the name to separate it from the description
                const [namePart] = (item.name || '').split(':');
                setCharacterName(namePart.trim());
                setActiveTab('character-generator');
                break;
            case 'image':
                setSourceImage(sourceToSet);
                setGeneratedImages([item.media]);
                setCharacterName('');
                const isI2I = !!sourceToSet || item.options?.geminiMode === 'i2i';
                setActiveTab(isI2I ? 'character-generator' : 'image-generator');
                break;
            case 'video':
                setVideoStartFrame(sourceToSet);
                if (item.endFrame) {
                    try {
                         const response = await fetch(item.endFrame);
                         const blob = await response.blob();
                         setVideoEndFrame(new File([blob], "library-end-frame.jpeg", { type: "image/jpeg" }));
                    } catch(e) { console.error("Could not load library end frame image:", e); }
                } else {
                    setVideoEndFrame(null);
                }
                setGeneratedVideo(item.media);
                setActiveTab('video-generator');
                break;
            case 'clothes':
            case 'prompt':
            default:
                break;
        }
    };
    
    const handleUsePrompt = (prompt: string) => {
        setOptions(prev => ({ ...prev, comfyPrompt: prompt, provider: 'comfyui' }));
        setActiveTab('image-generator');
    };
    
    const handleDriveConnect = async () => {
        try {
            const folder = await driveService.connectAndPickFolder();
            if (folder) {
                setDriveFolder(folder);
                localStorage.setItem('drive_folder', JSON.stringify(folder));
                await handleSyncWithDrive();
            }
        } catch (error: any) {
            if (error.message?.includes("popup_closed_by_user")) {
              return; // User cancelled, do nothing.
            }
            if (error.message?.includes("invalid client") || error.message?.includes("Check your OAuth Client ID")) {
                setIsOAuthHelperOpen(true);
            } else if (error.message?.includes("Check API Key")) {
                setIsOAuthHelperOpen(true);
            }
            else {
                setGlobalError({ title: "Google Drive Connection Error", message: error.message || "An unknown error occurred." });
            }
        }
    };
    
    const handleSyncWithDrive = async () => {
        if (!driveFolder) {
            setGlobalError({ title: "Sync Error", message: "You must connect to a Drive folder first." });
            return;
        }
        setIsSyncing(true);
        try {
            await initializeDriveSync((msg) => setSyncMessage(msg));
        } catch (error: any) {
            setGlobalError({ title: "Google Drive Sync Error", message: error.message || "An unknown sync error occurred." });
        } finally {
            setIsSyncing(false);
            setSyncMessage('');
        }
    };

    const handleDriveDisconnect = () => {
        driveService.disconnect();
        setDriveFolder(null);
        localStorage.removeItem('drive_folder');
    };

    const handleExport = async () => {
        if (!options) return;
        try {
            await exportComfyUIWorkflow(options, sourceImage);
        } catch (error: any) {
            setGlobalError({ title: "Workflow Export Error", message: error.message || 'Failed to export workflow.' });
        }
    };

    const handleCancelGeneration = async () => {
        console.log("User requested to cancel generation.");
        if (options.provider === 'comfyui' || options.videoProvider === 'comfyui') {
            try {
                await cancelComfyUIExecution();
                setGlobalError({ title: "Operation Cancelled", message: "The generation was successfully cancelled." });
            } catch (e: any) {
                setGlobalError({ title: "Cancellation Error", message: e.message || "Could not cancel the operation." });
            }
        } else {
            console.warn("Cancellation is not supported for the current provider.");
        }

        setIsLoading(false);
        setProgressValue(0);
        setProgressMessage('');
    };

    const handleTabClick = (tabId: string) => {
        if (tabId === 'character-generator') {
            // This tab is Gemini I2I only
            setOptions(prev => ({ ...prev, provider: 'gemini', geminiMode: 'i2i' }));
        } else if (tabId === 'image-generator') {
            // This tab is T2I only for Gemini
            if (options.provider === 'gemini') {
                setOptions(prev => ({ ...prev, geminiMode: 't2i' }));
            }
        }
        setActiveTab(tabId);
    };

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

    // Fix: Explicitly type filter arrays as LibraryItemType[] to fix TypeScript assignment errors.
    const imageLikeFilter: LibraryItemType[] = ['image', 'character', 'logo', 'album-cover', 'clothes', 'object', 'extracted-frame', 'pose', 'font'];
    const broadImagePickerFilter: LibraryItemType[] = ['image', 'character', 'logo', 'album-cover', 'clothes', 'extracted-frame', 'object', 'pose', 'font'];

    return (
        <div className="min-h-screen bg-bg-primary text-text-primary font-sans">
            <Header 
                theme={theme} 
                setTheme={handleThemeChange} 
                onLogout={handleLogout} 
                currentUser={currentUser}
                onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
                onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
                onOpenFeatureAnalysisModal={() => setIsFeatureAnalysisModalOpen(true)}
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
                            {options.provider === 'comfyui' && options.comfyModelType === 'nunchaku-kontext-flux' && (
                                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                                    <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Source Image</h2>
                                     <div className="flex items-center gap-2">
                                        <div className="flex-grow">
                                            <ImageUploader 
                                                label="Source Image" 
                                                id="nunchaku-source-image" 
                                                onImageUpload={setSourceImage} 
                                                sourceFile={sourceImage}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => setIsNunchakuSourcePickerOpen(true)} 
                                            className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                            title="Select from Library"
                                        >
                                            <LibraryIcon className="w-6 h-6"/>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <OptionsPanel 
                                title={
                                    options.provider === 'comfyui' && options.comfyModelType === 'nunchaku-kontext-flux'
                                    ? "2. Configure Options"
                                    : "1. Configure Options"
                                }
                                options={options} 
                                setOptions={setOptions}
                                onGenerate={handleGenerate}
                                onReset={handleReset}
                                onGeneratePrompt={() => {}}
                                onExportWorkflow={handleExport}
                                isDisabled={isLoading}
                                isReady={isReadyToGenerate}
                                isGeneratingPrompt={false}
                                previewedBackgroundImage={previewedBackgroundImage}
                                setPreviewedBackgroundImage={setPreviewedBackgroundImage}
                                previewedClothingImage={previewedClothingImage}
                                setPreviewedClothingImage={setPreviewedClothingImage}
                                comfyUIObjectInfo={comfyUIObjectInfo}
                                comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                sourceImage={sourceImage}
                                hideGeminiModeSwitch={true}
                            />
                        </div>

                        {/* --- Results Column (Right) --- */}
                        <div className="lg:col-span-2">
                           <ImageGrid 
                                images={generatedImages} 
                                onSetNewSource={handleSetNewSource}
                                lastUsedPrompt={lastUsedPrompt}
                                options={options}
                                sourceImage={sourceImage}
                                characterName={characterName}
                                activeTab={activeTab}
                            />
                             {generatedImages.length === 0 && !isLoading && (
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
                                            onImageUpload={setSourceImage} 
                                            sourceFile={sourceImage}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => setIsCharacterSourcePickerOpen(true)} 
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
                                        onChange={(e) => setCharacterName(e.target.value)}
                                        placeholder={shouldGenerateCharacterName ? "AI will suggest a name after generation..." : "Enter a name for your character"}
                                        className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                        disabled={isLoading}
                                    />
                                    <div className="mt-2">
                                        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={shouldGenerateCharacterName}
                                                onChange={(e) => setShouldGenerateCharacterName(e.target.checked)}
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
                                                <ImageUploader label="Clothing" id="clothing-image" onImageUpload={setClothingImage} sourceFile={clothingImage} />
                                                <button onClick={() => setIsClothingPickerOpen(true)} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary">
                                                    <LibraryIcon className="w-6 h-6"/>
                                                </button>
                                            </div>
                                        )}
                                        {options.background === 'image' && (
                                            <div className="flex items-center gap-2">
                                                <ImageUploader label="Background" id="background-image" onImageUpload={setBackgroundImage} sourceFile={backgroundImage}/>
                                                <button onClick={() => setIsBackgroundPickerOpen(true)} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary">
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
                                setOptions={setOptions}
                                onGenerate={handleGenerate}
                                onReset={handleReset}
                                onGeneratePrompt={() => {}}
                                onExportWorkflow={handleExport}
                                isDisabled={isLoading}
                                isReady={isReadyToGenerate}
                                isGeneratingPrompt={false}
                                previewedBackgroundImage={previewedBackgroundImage}
                                setPreviewedBackgroundImage={setPreviewedBackgroundImage}
                                previewedClothingImage={previewedClothingImage}
                                setPreviewedClothingImage={setPreviewedClothingImage}
                                comfyUIObjectInfo={comfyUIObjectInfo}
                                comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                                sourceImage={sourceImage}
                                hideProviderSwitch={true}
                                hideGeminiModeSwitch={true}
                            />
                        </div>

                        {/* --- Results Column (Right) --- */}
                        <div className="lg:col-span-2">
                           <ImageGrid 
                                images={generatedImages} 
                                onSetNewSource={handleSetNewSource}
                                lastUsedPrompt={lastUsedPrompt}
                                options={options}
                                sourceImage={sourceImage}
                                characterName={characterName}
                                activeTab={activeTab}
                            />
                             {generatedImages.length === 0 && !isLoading && (
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
                        setOptions={setOptions}
                        comfyUIObjectInfo={comfyUIObjectInfo}
                        startFrame={videoStartFrame}
                        setStartFrame={setVideoStartFrame}
                        endFrame={videoEndFrame}
                        setEndFrame={setVideoEndFrame}
                        onGenerate={handleGenerateVideo}
                        isReady={isVideoReady}
                        isLoading={isLoading}
                        error={globalError ? globalError.message : null}
                        generatedVideo={generatedVideo}
                        lastUsedPrompt={lastUsedPrompt}
                        progressMessage={progressMessage}
                        progressValue={progressValue}
                        onReset={handleVideoReset}
                        generationOptionsForSave={generationOptionsForSave}
                        onOpenLibraryForStartFrame={() => setIsVideoStartFramePickerOpen(true)}
                        onOpenLibraryForEndFrame={() => setIsVideoEndFramePickerOpen(true)}
                        onOpenLibraryForGeminiSource={() => setIsGeminiVideoSourcePickerOpen(true)}
                    />
                </div>

                <div className={activeTab === 'logo-theme-generator' ? 'block' : 'hidden'}>
                    <LogoThemeGeneratorPanel
                        state={logoThemeState}
                        setState={setLogoThemeState}
                        activeSubTab={activeLogoThemeSubTab}
                        setActiveSubTab={setActiveLogoThemeSubTab}
                        onOpenLibraryForReferences={() => setIsLogoRefPickerOpen(true)}
                        onOpenLibraryForPalette={() => setIsLogoPalettePickerOpen(true)}
                        onOpenLibraryForBannerReferences={() => setIsBannerRefPickerOpen(true)}
                        onOpenLibraryForBannerPalette={() => setIsBannerPalettePickerOpen(true)}
                        onOpenLibraryForBannerLogo={() => setIsBannerLogoPickerOpen(true)}
                        onOpenLibraryForAlbumCoverReferences={() => setIsAlbumCoverRefPickerOpen(true)}
                        onOpenLibraryForAlbumCoverPalette={() => setIsAlbumCoverPalettePickerOpen(true)}
                        onOpenLibraryForAlbumCoverLogo={() => setIsAlbumCoverLogoPickerOpen(true)}
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
                            setActiveSubTab={setActivePromptToolsSubTab}
                            onUsePrompt={handleUsePrompt}
                            image={promptGenState.image} setImage={file => setPromptGenState(prev => ({...prev, image: file}))}
                            prompt={promptGenState.prompt} setPrompt={p => setPromptGenState(prev => ({...prev, prompt: p}))}
                            bgImage={promptGenState.bgImage} setBgImage={file => setPromptGenState(prev => ({...prev, bgImage: file}))}
                            bgPrompt={promptGenState.bgPrompt} setBgPrompt={p => setPromptGenState(prev => ({...prev, bgPrompt: p}))}
                            subjectImage={promptGenState.subjectImage} setSubjectImage={file => setPromptGenState(prev => ({...prev, subjectImage: file}))}
                            subjectPrompt={promptGenState.subjectPrompt} setSubjectPrompt={p => setPromptGenState(prev => ({...prev, subjectPrompt: p}))}
                            soupPrompt={promptGenState.soupPrompt} setSoupPrompt={p => setPromptGenState(prev => ({...prev, soupPrompt: p}))}
                            soupHistory={promptGenState.soupHistory} onAddSoupToHistory={onAddSoupToHistory}
                            onOpenLibraryForImage={() => setIsPromptGenImagePickerOpen(true)}
                            onOpenLibraryForBg={() => setIsPromptGenBgImagePickerOpen(true)}
                            onOpenLibraryForSubject={() => setIsPromptGenSubjectImagePickerOpen(true)}
                        />
                    </div>
                )}
                
                <div className={activeTab === 'extractor-tools' ? 'block' : 'hidden'}>
                    <ExtractorToolsPanel 
                        state={extractorState} 
                        setState={setExtractorState} 
                        onReset={handleExtractorReset} 
                        onOpenLibraryForClothes={() => setIsClothesSourcePickerOpen(true)}
                        onOpenLibraryForObjects={() => setIsObjectSourcePickerOpen(true)}
                        onOpenLibraryForPoses={() => setIsPoseSourcePickerOpen(true)}
                        onOpenLibraryForMannequinRef={() => setIsMannequinRefPickerOpen(true)}
                        onOpenLibraryForFont={() => setIsFontSourcePickerOpen(true)}
                        activeSubTab={activeExtractorSubTab}
                        setActiveSubTab={setActiveExtractorSubTab}
                    />
                </div>
                
                 <div className={activeTab === 'video-utils' ? 'block' : 'hidden'}>
                    <VideoUtilsPanel
                        setStartFrame={setVideoStartFrame}
                        // Fix: Corrected prop from `setStartFrame` to `setVideoStartFrame` to match the state setter name.
                        setEndFrame={setVideoEndFrame}
                        videoUtilsState={videoUtilsState}
                        setVideoUtilsState={setVideoUtilsState}
                        onOpenLibrary={() => setIsColorImagePickerOpen(true)}
                        onOpenVideoLibrary={() => setIsVideoUtilsPickerOpen(true)}
                        activeSubTab={activeVideoUtilsSubTab}
                        setActiveSubTab={setActiveVideoUtilsSubTab}
                    />
                </div>
            </main>

            {/* --- Global Loader --- */}
            {isLoading && (activeTab === 'image-generator' || activeTab === 'video-generator' || activeTab === 'character-generator') && (
                <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <Loader 
                        message={progressMessage} 
                        progress={progressValue} 
                        onCancel={handleCancelGeneration}
                    />
                </div>
            )}


            {/* --- Modals & Panels --- */}
            {isSettingsModalOpen && (
                <ConnectionSettingsModal
                    isOpen={isSettingsModalOpen}
                    onClose={() => setIsSettingsModalOpen(false)}
                    initialComfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                    initialGoogleClientId={localStorage.getItem('google_client_id') || ''}
                    onSave={handleSaveSettings}
                />
            )}
            {isAdminPanelOpen && (
                 <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-panel-title"
                    onClick={() => setIsAdminPanelOpen(false)}
                >
                    <div
                        className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h2 id="admin-panel-title" className="text-xl font-bold text-accent flex items-center gap-2">
                                <AdminIcon className="w-6 h-6" />
                                Admin Panel
                            </h2>
                            <button
                                onClick={() => setIsAdminPanelOpen(false)}
                                className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
                                aria-label="Close"
                            >
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                            <AdminPanel />
                        </div>
                    </div>
                </div>
            )}
            {isFeatureAnalysisModalOpen && (
                <FeatureAnalysisModal
                    isOpen={isFeatureAnalysisModalOpen}
                    onClose={() => setIsFeatureAnalysisModalOpen(false)}
                />
            )}
            {isClothingPickerOpen && (
                <LibraryPickerModal
                    isOpen={isClothingPickerOpen}
                    onClose={() => setIsClothingPickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        setClothingImage(new File([blob], "library_clothing.jpeg", { type: blob.type }));
                    }}
                    filter="clothes"
                />
            )}
            {isBackgroundPickerOpen && (
                 <LibraryPickerModal
                    isOpen={isBackgroundPickerOpen}
                    onClose={() => setIsBackgroundPickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        setBackgroundImage(new File([blob], "library_background.jpeg", { type: blob.type }));
                    }}
                    filter="image"
                />
            )}
             {isNunchakuSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isNunchakuSourcePickerOpen}
                    onClose={() => setIsNunchakuSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        setSourceImage(new File([blob], "library_source.jpeg", { type: blob.type }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isCharacterSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isCharacterSourcePickerOpen}
                    onClose={() => setIsCharacterSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_source.jpeg", { type: blob.type });
                        setSourceImage(file);
                        setCharacterName('');
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isVideoStartFramePickerOpen && (
                <LibraryPickerModal
                    isOpen={isVideoStartFramePickerOpen}
                    onClose={() => setIsVideoStartFramePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_start_frame.jpeg", { type: blob.type });
                        setVideoStartFrame(file);
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isVideoEndFramePickerOpen && (
                <LibraryPickerModal
                    isOpen={isVideoEndFramePickerOpen}
                    onClose={() => setIsVideoEndFramePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_end_frame.jpeg", { type: blob.type });
                        setVideoEndFrame(file);
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isGeminiVideoSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isGeminiVideoSourcePickerOpen}
                    onClose={() => setIsGeminiVideoSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_gemini_source.jpeg", { type: blob.type });
                        setVideoStartFrame(file); // Gemini uses the start frame state
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isClothesSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isClothesSourcePickerOpen}
                    onClose={() => setIsClothesSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_clothes_source.jpeg", { type: blob.type });
                        setExtractorState(prev => ({ ...prev, clothesSourceFile: file }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isObjectSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isObjectSourcePickerOpen}
                    onClose={() => setIsObjectSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_object_source.jpeg", { type: blob.type });
                        setExtractorState(prev => ({ ...prev, objectSourceFile: file }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isPoseSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isPoseSourcePickerOpen}
                    onClose={() => setIsPoseSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_pose_source.jpeg", { type: blob.type });
                        setExtractorState(prev => ({ ...prev, poseSourceFile: file }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
             {isMannequinRefPickerOpen && (
                <LibraryPickerModal
                    isOpen={isMannequinRefPickerOpen}
                    onClose={() => setIsMannequinRefPickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_mannequin_ref.jpeg", { type: blob.type });
                        setExtractorState(prev => ({ ...prev, mannequinReferenceFile: file }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isFontSourcePickerOpen && (
                <LibraryPickerModal
                    isOpen={isFontSourcePickerOpen}
                    onClose={() => setIsFontSourcePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], "library_font_source.jpeg", { type: blob.type });
                        setExtractorState(prev => ({ ...prev, fontSourceFile: file }));
                    }}
                    filter={broadImagePickerFilter}
                />
            )}
            {isColorImagePickerOpen && (
                 <LibraryPickerModal
                    isOpen={isColorImagePickerOpen}
                    onClose={() => setIsColorImagePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], item.name || "library_color_source.jpeg", { type: blob.type });
                        const paletteName = `Palette from "${item.name || 'Library Item'}"`;
                        setVideoUtilsState(prev => ({
                            ...prev,
                            colorPicker: { 
                                ...prev.colorPicker, 
                                imageFile: file,
                                paletteName: paletteName,
                                palette: [],
                                error: null,
                            }
                        }));
                    }}
                    filter={imageLikeFilter}
                />
            )}
            {isVideoUtilsPickerOpen && (
                <LibraryPickerModal
                    isOpen={isVideoUtilsPickerOpen}
                    onClose={() => setIsVideoUtilsPickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], item.name || "library_video.mp4", { type: blob.type });
                        setVideoUtilsState(prev => ({
                            ...prev,
                            videoFile: file,
                            extractedFrame: null,
                        }));
                    }}
                    filter="video"
                />
            )}
             {isLogoRefPickerOpen && (
                 <LibraryPickerModal
                    isOpen={isLogoRefPickerOpen}
                    onClose={() => setIsLogoRefPickerOpen(false)}
                    onSelectItem={() => {}} // Single select not used here
                    onSelectMultiple={(items) => {
                        setLogoThemeState(prev => ({ ...prev, referenceItems: [...(prev.referenceItems || []), ...items] }));
                    }}
                    filter={imageLikeFilter}
                    multiSelect
                />
            )}
            {isLogoPalettePickerOpen && (
                 <LibraryPickerModal
                    isOpen={isLogoPalettePickerOpen}
                    onClose={() => setIsLogoPalettePickerOpen(false)}
                    onSelectItem={(item) => {
                        setLogoThemeState(prev => ({ ...prev, selectedPalette: item }));
                    }}
                    filter="color-palette"
                />
            )}
            {isBannerRefPickerOpen && (
                <LibraryPickerModal
                    isOpen={isBannerRefPickerOpen}
                    onClose={() => setIsBannerRefPickerOpen(false)}
                    // Fix: Add the required 'onSelectItem' prop. It's a no-op because this modal is in multi-select mode.
                    onSelectItem={() => {}}
                    onSelectMultiple={(items) => {
                        setLogoThemeState(prev => ({ ...prev, bannerReferenceItems: [...(prev.bannerReferenceItems || []), ...items] }));
                    }}
                    filter={imageLikeFilter}
                    multiSelect
                />
            )}
            {isBannerPalettePickerOpen && (
                <LibraryPickerModal
                    isOpen={isBannerPalettePickerOpen}
                    onClose={() => setIsBannerPalettePickerOpen(false)}
                    onSelectItem={(item) => {
                        setLogoThemeState(prev => ({ ...prev, bannerSelectedPalette: item }));
                    }}
                    filter="color-palette"
                />
            )}
            {isBannerLogoPickerOpen && (
                <LibraryPickerModal
                    isOpen={isBannerLogoPickerOpen}
                    onClose={() => setIsBannerLogoPickerOpen(false)}
                    onSelectItem={(item) => {
                        setLogoThemeState(prev => ({ ...prev, bannerSelectedLogo: item }));
                    }}
                    filter="logo"
                />
            )}
            {isAlbumCoverRefPickerOpen && (
                <LibraryPickerModal
                    isOpen={isAlbumCoverRefPickerOpen}
                    onClose={() => setIsAlbumCoverRefPickerOpen(false)}
                    onSelectItem={() => {}}
                    onSelectMultiple={(items) => {
                        setLogoThemeState(prev => ({ ...prev, albumReferenceItems: [...(prev.albumReferenceItems || []), ...items] }));
                    }}
                    filter={imageLikeFilter}
                    multiSelect
                />
            )}
            {isAlbumCoverPalettePickerOpen && (
                <LibraryPickerModal
                    isOpen={isAlbumCoverPalettePickerOpen}
                    onClose={() => setIsAlbumCoverPalettePickerOpen(false)}
                    onSelectItem={(item) => {
                        setLogoThemeState(prev => ({ ...prev, albumSelectedPalette: item }));
                    }}
                    filter="color-palette"
                />
            )}
            {isAlbumCoverLogoPickerOpen && (
                <LibraryPickerModal
                    isOpen={isAlbumCoverLogoPickerOpen}
                    onClose={() => setIsAlbumCoverLogoPickerOpen(false)}
                    onSelectItem={(item) => {
                        setLogoThemeState(prev => ({ ...prev, albumSelectedLogo: item }));
                    }}
                    filter="logo"
                />
            )}
            {isPromptGenImagePickerOpen && (
                <LibraryPickerModal
                    isOpen={isPromptGenImagePickerOpen}
                    onClose={() => setIsPromptGenImagePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], item.name || "library_image.jpeg", { type: blob.type });
                        setPromptGenState(prev => ({...prev, image: file}));
                    }}
                    filter={imageLikeFilter}
                />
            )}
            {isPromptGenBgImagePickerOpen && (
                <LibraryPickerModal
                    isOpen={isPromptGenBgImagePickerOpen}
                    onClose={() => setIsPromptGenBgImagePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], item.name || "library_image.jpeg", { type: blob.type });
                        setPromptGenState(prev => ({...prev, bgImage: file}));
                    }}
                    filter={imageLikeFilter}
                />
            )}
            {isPromptGenSubjectImagePickerOpen && (
                <LibraryPickerModal
                    isOpen={isPromptGenSubjectImagePickerOpen}
                    onClose={() => setIsPromptGenSubjectImagePickerOpen(false)}
                    onSelectItem={async (item) => {
                        const res = await fetch(item.media);
                        const blob = await res.blob();
                        const file = new File([blob], item.name || "library_image.jpeg", { type: blob.type });
                        setPromptGenState(prev => ({...prev, subjectImage: file}));
                    }}
                    filter={imageLikeFilter}
                />
            )}
            {globalError && (
                <ErrorModal 
                    title={globalError.title}
                    message={globalError.message}
                    onClose={() => setGlobalError(null)}
                />
            )}
            {isOAuthHelperOpen && (
                <OAuthHelperModal
                    isOpen={isOAuthHelperOpen}
                    onClose={() => setIsOAuthHelperOpen(false)}
                    onProceed={() => {
                        setIsOAuthHelperOpen(false);
                        handleDriveConnect();
                    }}
                    clientId={localStorage.getItem('google_client_id') || ''}
                    origin={window.location.origin}
                />
            )}
        </div>
    );
};

export default App;