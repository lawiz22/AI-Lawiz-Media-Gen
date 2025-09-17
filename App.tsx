import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, GenerationOptions, HistoryItem, GeneratedClothing, LibraryItem, VersionInfo, DriveFolder, VideoUtilsState, PromptGenState, ExtractorState, IdentifiedObject, LogoThemeState } from './types';
import { authenticateUser } from './services/cloudUserService';
import { fileToDataUrl, fileToResizedDataUrl } from './utils/imageUtils';
import { decodePose, getRandomPose } from './utils/promptBuilder';
import { generatePortraits, generateGeminiVideo, generateCharacterNameForImage } from './services/geminiService';
// Fix: Import 'checkConnection' to resolve missing name error.
import { generateComfyUIPortraits, generateComfyUIVideo, exportComfyUIWorkflow, getComfyUIObjectInfo, checkConnection, cancelComfyUIExecution } from './services/comfyUIService';
import { saveGenerationToHistory } from './services/historyService';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { Header } from './components/Header';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { HistoryPanel } from './components/HistoryPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { ExtractorToolsPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { VideoGeneratorPanel } from './components/VideoGeneratorPanel';
import { LibraryPickerModal } from './components/LibraryPickerModal';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { LogoThemeGeneratorPanel } from './components/LogoThemeGeneratorPanel';
import { ErrorModal } from './components/ErrorModal';
import { OAuthHelperModal } from './components/OAuthHelperModal';
import { ImageGeneratorIcon, AdminIcon, LibraryIcon, VideoIcon, PromptIcon, ExtractorIcon, VideoUtilsIcon, SwatchIcon, CharacterIcon } from './components/icons';
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

    // --- Video Generation State ---
    const [videoStartFrame, setVideoStartFrame] = useState<File | null>(null);
    const [videoEndFrame, setVideoEndFrame] = useState<File | null>(null);
    const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
    const [generationOptionsForSave, setGenerationOptionsForSave] = useState<GenerationOptions | null>(null);

    // --- Video Utilities State ---
    const [videoUtilsState, setVideoUtilsState] = useState<VideoUtilsState>(initialVideoUtilsState);
    
    // --- Extractor Tools State ---
    const [extractorState, setExtractorState] = useState<ExtractorState>(initialExtractorState);
    
    // --- Logo & Theme State ---
    const [logoThemeState, setLogoThemeState] = useState<LogoThemeState>(initialLogoThemeState);


    // --- UI Modals & Panels State ---
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
    const [isClothingPickerOpen, setIsClothingPickerOpen] = useState(false);
    const [isBackgroundPickerOpen, setIsBackgroundPickerOpen] = useState(false);
    const [isColorImagePickerOpen, setIsColorImagePickerOpen] = useState(false);
    const [isStartFramePickerOpen, setIsStartFramePickerOpen] = useState(false);
    const [isEndFramePickerOpen, setIsEndFramePickerOpen] = useState(false);
    const [isLogoRefPickerOpen, setIsLogoRefPickerOpen] = useState(false);
    const [isLogoPalettePickerOpen, setIsLogoPalettePickerOpen] = useState(false);
    const [isOAuthHelperOpen, setIsOAuthHelperOpen] = useState(false);
    const [isPromptGenImagePickerOpen, setIsPromptGenImagePickerOpen] = useState(false);
    const [isPromptGenBgImagePickerOpen, setIsPromptGenBgImagePickerOpen] = useState(false);
    const [isPromptGenSubjectImagePickerOpen, setIsPromptGenSubjectImagePickerOpen] = useState(false);
    
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
            return !!isComfyUIConnected && !!options.comfyPrompt?.trim();
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
        setCharacterName('');
        
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
                if (activeTab === 'character-generator') {
                    updateProgress("Generating character name...", 0.96);
                    try {
                        const name = await generateCharacterNameForImage(result.images[0]);
                        setCharacterName(name);
                    } catch (nameError) {
                        console.warn("Could not generate character name:", nameError);
                        setCharacterName(''); // Clear on error
                    }
                }
                saveGenerationToHistory({
                    timestamp: Date.now(),
                    sourceImage: sourceImage ? await fileToResizedDataUrl(sourceImage, 256) : undefined,
                    generatedImages: result.images,
                    options: options,
                });
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
    
    const handleLoadHistoryItem = async (item: HistoryItem) => {
        setOptions(item.options);
        setGeneratedImages(item.generatedImages);
        setCharacterName('');
        // This is a simplification; a more robust solution would re-fetch the File object if needed
        if (item.sourceImage) {
           try {
                const response = await fetch(item.sourceImage);
                const blob = await response.blob();
                const file = new File([blob], "history-source.jpeg", { type: "image/jpeg" });
                setSourceImage(file);
           } catch (e) {
                console.error("Could not load history source image:", e);
                setSourceImage(null);
           }
        } else {
            setSourceImage(null);
        }
        setIsHistoryPanelOpen(false);

        // Determine which tab to switch to
        const isI2I = !!item.sourceImage || item.options.geminiMode === 'i2i';
        setActiveTab(isI2I ? 'character-generator' : 'image-generator');
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
                setCharacterName(item.name || '');
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
        { id: 'admin-panel', label: 'Admin Panel', icon: <AdminIcon className="w-5 h-5"/>, adminOnly: true },
    ];

    return (
        <div className="min-h-screen bg-bg-primary text-text-primary font-sans">
            <Header 
                theme={theme} 
                setTheme={handleThemeChange} 
                onLogout={handleLogout} 
                currentUser={currentUser}
                onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
                onOpenHistoryPanel={() => setIsHistoryPanelOpen(true)}
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
                            <OptionsPanel 
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
                                <ImageUploader 
                                    label="Source Face / Pose" 
                                    id="source-image" 
                                    onImageUpload={setSourceImage} 
                                    sourceFile={sourceImage}
                                />
                                 <div className="mt-4">
                                    <label htmlFor="character-name" className="block text-sm font-medium text-text-secondary">Character Name</label>
                                    <input
                                        type="text"
                                        id="character-name"
                                        value={characterName}
                                        onChange={(e) => setCharacterName(e.target.value)}
                                        placeholder="AI will suggest a name after generation..."
                                        className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                        disabled={isLoading}
                                    />
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
                    />
                </div>

                <div className={activeTab === 'logo-theme-generator' ? 'block' : 'hidden'}>
                    <LogoThemeGeneratorPanel
                        state={logoThemeState}
                        setState={setLogoThemeState}
                        onOpenLibraryForReferences={() => setIsLogoRefPickerOpen(true)}
                        onOpenLibraryForPalette={() => setIsLogoPalettePickerOpen(true)}
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
                    <ExtractorToolsPanel state={extractorState} setState={setExtractorState} onReset={handleExtractorReset} />
                </div>
                
                 <div className={activeTab === 'video-utils' ? 'block' : 'hidden'}>
                    <VideoUtilsPanel
                        setStartFrame={setVideoStartFrame}
                        setEndFrame={setVideoEndFrame}
                        videoUtilsState={videoUtilsState}
                        setVideoUtilsState={setVideoUtilsState}
                        onOpenLibrary={() => setIsColorImagePickerOpen(true)}
                    />
                </div>

                {currentUser.role === 'admin' && (
                    <div className={activeTab === 'admin-panel' ? 'block' : 'hidden'}>
                        <AdminPanel />
                    </div>
                )}
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
            {isHistoryPanelOpen && (
                <HistoryPanel 
                    isOpen={isHistoryPanelOpen}
                    onClose={() => setIsHistoryPanelOpen(false)}
                    onLoadHistoryItem={handleLoadHistoryItem}
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
                    filter={['image', 'clothes', 'extracted-frame', 'object']}
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
                    filter={['image', 'clothes', 'object', 'extracted-frame']}
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
                    filter={['image', 'clothes', 'extracted-frame', 'object']}
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
                    filter={['image', 'clothes', 'extracted-frame', 'object']}
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
                    filter={['image', 'clothes', 'extracted-frame', 'object']}
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