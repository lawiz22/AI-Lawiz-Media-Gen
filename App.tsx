import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Login } from './components/Login';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { AdminPanel } from './components/AdminPanel';
import { Loader } from './components/Loader';
import { ConnectionSettingsModal } from './components/ComfyUIConnection';
import { HistoryPanel } from './components/HistoryPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { LibraryPickerModal } from './components/LibraryPickerModal';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { VideoGeneratorPanel } from './components/VideoGeneratorPanel';
import { ClothesExtractorPanel } from './components/ClothesExtractorPanel';
import { VideoUtilsPanel } from './components/VideoUtilsPanel';
import { GenerateIcon, LibraryIcon } from './components/icons';
import type { GenerationOptions, User, HistoryItem, VersionInfo, GeneratedClothing, LibraryItem, DriveFolder } from './types';
import { authenticateUser } from './services/cloudUserService';
import { generatePortraitSeries, generateImagesFromPrompt, generateGeminiVideo } from './services/geminiService';
import { exportComfyUIWorkflow, generateComfyUIPortraits, checkConnection as checkComfyUIConnection, getComfyUIObjectInfo, generateComfyUIPromptFromSource as generateComfyUIPromptService, generateComfyUIVideo } from './services/comfyUIService';
import { saveGenerationToHistory } from './services/historyService';
import * as libraryService from './services/libraryService';
import * as googleDriveService from './services/googleDriveService';
import { fileToResizedDataUrl, dataUrlToThumbnail, dataUrlToFile } from './utils/imageUtils';
import { PHOTO_STYLE_OPTIONS, IMAGE_STYLE_OPTIONS, ERA_STYLE_OPTIONS } from './constants';
import { OAuthHelperModal } from './components/OAuthHelperModal';

const initialOptions: GenerationOptions = {
  provider: 'gemini',
  geminiMode: 'i2i',
  geminiT2IModel: 'imagen-4.0-generate-001',
  geminiPrompt: '',
  numImages: 2,
  background: 'original',
  aspectRatio: '3:4',
  customBackground: '',
  consistentBackground: false,
  clothing: 'original',
  customClothingPrompt: '',
  clothingStyleConsistency: 'varied',
  poseMode: 'random',
  poseSelection: [],
  photoStyle: PHOTO_STYLE_OPTIONS[0].value,
  imageStyle: IMAGE_STYLE_OPTIONS[0].value,
  eraStyle: ERA_STYLE_OPTIONS[0].value,
  creativity: 0.7,
  addTextToImage: false,
  textOnImagePrompt: '',
  textObjectPrompt: "a sign in the background that reads '%s'",
  
  // ComfyUI defaults
  comfyModelType: 'sdxl',
  comfyFluxGuidance: 3.5,
  comfyModel: '',
  comfySteps: 25,
  comfyCfg: 5.5,
  comfySampler: 'euler',
  comfyScheduler: 'simple',
  comfyPrompt: '',
  comfyNegativePrompt: 'blurry, bad quality, low-res, ugly, deformed',
  comfyFluxNodeName: null,
  comfySdxlUseLora: false,
  comfySdxlLoraName: '',
  comfySdxlLoraStrength: 0.8,


  // ComfyUI WAN 2.2 defaults
  comfyWanHighNoiseModel: 'Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf',
  comfyWanLowNoiseModel: 'Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf',
  comfyWanClipModel: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  comfyWanVaeModel: 'wan_2.1_vae.safetensors',
  comfyWanUseFusionXLora: true,
  comfyWanFusionXLoraStrength: 0.8,
  comfyWanFusionXLoraName: 'Wan2.1_T2V_14B_FusionX_LoRA.safetensors',
  comfyWanUseLightningLora: true,
  comfyWanLightningLoraStrength: 0.6,
  comfyWanLightningLoraNameHigh: 'Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors',
  comfyWanLightningLoraNameLow: 'Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors',
  comfyWanUseStockPhotoLora: true,
  comfyWanStockPhotoLoraStrength: 1.5,
  comfyWanStockPhotoLoraNameHigh: 'stock_photography_wan22_HIGH_v1.safetensors',
  comfyWanStockPhotoLoraNameLow: 'stock_photography_wan22_LOW_v1.safetensors',
  comfyWanRefinerStartStep: 3,

  // Nunchaku Kontext Flux defaults
  comfyNunchakuModel: 'svdq-int4_r32-flux.1-kontext-dev.safetensors',
  comfyNunchakuClipL: 'ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors',
  comfyNunchakuT5XXL: 't5xxl_fp8_e4m3fn_scaled.safetensors',
  comfyNunchakuVae: 'ae.safetensors',
  comfyNunchakuUseTurboLora: true,
  comfyNunchakuTurboLoraName: 'flux-turbo.safetensors',
  comfyNunchakuTurboLoraStrength: 1.0,
  comfyNunchakuUseNudifyLora: true,
  comfyNunchakuNudifyLoraName: 'JD3s_Nudify_Kontext.safetensors',
  comfyNunchakuNudifyLoraStrength: 1.0,
  comfyNunchakuUseDetailLora: true,
  comfyNunchakuDetailLoraName: 'flux_nipples_saggy_breasts.safetensors',
  comfyNunchakuDetailLoraStrength: 1.0,
  comfyFluxGuidanceKontext: 2.5,
  comfyNunchakuCacheThreshold: 0.12,
  comfyNunchakuCpuOffload: 'enable',
  comfyNunchakuAttention: 'nunchaku-fp16',
  comfyNunchakuBaseShift: 1.0,
  comfyNunchakuMaxShift: 1.15,

  // Flux Krea defaults
  comfyFluxKreaModel: 'flux1-krea-dev-Q5_K_M.gguf',
  comfyFluxKreaClipT5: 't5-v1_1-xxl-encoder-Q5_K_M.gguf',
  comfyFluxKreaClipL: 'clip_l.safetensors',
  comfyFluxKreaVae: 'ae.safetensors',
  comfyFluxKreaUpscaleModel: '4x_NMKD-Siax_200k.pth',
  useP1x4r0maWomanLora: false,
  p1x4r0maWomanLoraStrength: 0.9,
  p1x4r0maWomanLoraName: 'p1x4r0ma_woman.safetensors',
  useNippleDiffusionLora: true,
  nippleDiffusionLoraStrength: 1.0,
  nippleDiffusionLoraName: 'nipplediffusion-saggy-f1.safetensors',
  usePussyDiffusionLora: false,
  pussyDiffusionLoraStrength: 1.0,
  pussyDiffusionLoraName: 'pussydiffusion-f1.safetensors',
  comfyFluxKreaUseUpscaler: false,
  comfyFluxKreaDenoise: 0.8,
  comfyFluxKreaUpscalerSteps: 10,

  // Video options
  videoProvider: 'comfyui',
  comfyVidModelType: 'wan-i2v',
  comfyVidWanI2VHighNoiseModel: 'Wan2.2-I2V-A14B-HighNoise-Q5_K_M.gguf',
  comfyVidWanI2VLowNoiseModel: 'Wan2.2-I2V-A14B-LowNoise-Q5_K_M.gguf',
  comfyVidWanI2VClipModel: 'umt5-xxl-encoder-Q5_K_M.gguf',
  comfyVidWanI2VVaeModel: 'wan_2.1_vae.safetensors',
  comfyVidWanI2VClipVisionModel: 'clip_vision_h.safetensors',
  comfyVidWanI2VUseLightningLora: true,
  comfyVidWanI2VHighNoiseLora: 'Wan2.2-Lightning_I2V-A14B-4steps-lora_HIGH_fp16.safetensors',
  comfyVidWanI2VHighNoiseLoraStrength: 2.0,
  comfyVidWanI2VLowNoiseLora: 'Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16.safetensors',
  comfyVidWanI2VLowNoiseLoraStrength: 1.0,
  comfyVidWanI2VSteps: 6,
  comfyVidWanI2VCfg: 1,
  comfyVidWanI2VSampler: 'euler',
  comfyVidWanI2VScheduler: 'simple',
  comfyVidWanI2VFrameCount: 65,
  comfyVidWanI2VRefinerStartStep: 3,
  comfyVidWanI2VFrameRate: 24,
  comfyVidWanI2VVideoFormat: 'video/nvenc_h264-mp4',
  comfyVidWanI2VUseFilmGrain: true,
  comfyVidWanI2VFilmGrainIntensity: 0.02,
  comfyVidWanI2VFilmGrainSize: 0.3,
  comfyVidWanI2VPositivePrompt: '',
  comfyVidWanI2VNegativePrompt: 'disney pixar 3d type, pixar type cartoon, worst quality, low quality, jpeg artifacts, ugly, deformed, blurry',
  comfyVidWanI2VWidth: 848,
  comfyVidWanI2VHeight: 560,
  comfyVidWanI2VUseEndFrame: true,
  comfyVidWanI2VEndFrameStrength: 1.0,

  // Gemini Video options
  geminiVidModel: 'veo-2.0-generate-001',
  geminiVidPrompt: '',
  geminiVidUseEndFrame: false,
};

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme || 'cyberpunk';
  });
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [options, setOptions] = useState<GenerationOptions>(initialOptions);
  
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [clothingImage, setClothingImage] = useState<File | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [previewedBackgroundImage, setPreviewedBackgroundImage] = useState<string | null>(null);
  const [previewedClothingImage, setPreviewedClothingImage] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [lastUsedPrompt, setLastUsedPrompt] = useState<string | null>(null);
  const [lastGenerationOptions, setLastGenerationOptions] = useState<GenerationOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'library' | 'clothes' | 'video-utils' | 'prompt' | 'manage'>('image');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isOAuthHelperOpen, setIsOAuthHelperOpen] = useState(false);
  
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyui_url') || '');
  const [isComfyUIConnected, setIsComfyUIConnected] = useState<boolean | null>(null);
  const [comfyUIObjectInfo, setComfyUIObjectInfo] = useState<any | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  // --- State for Google Drive ---
  const [googleClientId, setGoogleClientId] = useState<string>(() => localStorage.getItem('google_client_id') || '');
  const [isDriveConfigured, setIsDriveConfigured] = useState(() => googleDriveService.isDriveConfigured());
  const [driveFolder, setDriveFolder] = useState<DriveFolder | null>(() => {
    if (!googleDriveService.isDriveConfigured()) return null;
    const savedFolder = localStorage.getItem('driveFolder');
    return savedFolder ? JSON.parse(savedFolder) : null;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // --- State for PromptGeneratorPanel to persist across tab changes ---
  const [promptToolImage, setPromptToolImage] = useState<File | null>(null);
  const [promptToolPrompt, setPromptToolPrompt] = useState<string>('');
  const [promptToolBgImage, setPromptToolBgImage] = useState<File | null>(null);
  const [promptToolBgPrompt, setPromptToolBgPrompt] = useState<string>('');
  const [promptToolSubjectImage, setPromptToolSubjectImage] = useState<File | null>(null);
  const [promptToolSubjectPrompt, setPromptToolSubjectPrompt] = useState<string>('');
  const [promptToolSoupPrompt, setPromptToolSoupPrompt] = useState<string>('');
  const [promptToolSoupHistory, setPromptToolSoupHistory] = useState<string[]>([]);

  // --- State for VideoGeneratorPanel ---
  const [startFrame, setStartFrame] = useState<File | null>(null);
  const [endFrame, setEndFrame] = useState<File | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  
  // --- State for ClothesExtractorPanel ---
  const [clothesExtractorFile, setClothesExtractorFile] = useState<File | null>(null);
  const [clothesExtractorDetails, setClothesExtractorDetails] = useState<string>('');
  const [clothesExtractorResults, setClothesExtractorResults] = useState<GeneratedClothing[]>([]);

  // --- State for LibraryPickerModal ---
  const [isLibraryPickerOpen, setIsLibraryPickerOpen] = useState(false);
  const [libraryPickerConfig, setLibraryPickerConfig] = useState<{
    target: 'sourceImage' | 'clothingImage' | null;
    filter: 'image' | 'clothes' | null;
  }>({ target: null, filter: null });

  const handleOpenLibraryPicker = (target: 'sourceImage' | 'clothingImage', filter: 'image' | 'clothes') => {
    setLibraryPickerConfig({ target, filter });
    setIsLibraryPickerOpen(true);
  };

  const handleSelectFromLibrary = async (mediaDataUrl: string) => {
    if (!libraryPickerConfig.target) return;

    try {
      const file = await dataUrlToFile(mediaDataUrl, `library_${libraryPickerConfig.target}.jpg`);
      if (libraryPickerConfig.target === 'sourceImage') {
        setSourceImage(file);
      } else if (libraryPickerConfig.target === 'clothingImage') {
        setClothingImage(file);
      }
    } catch (err) {
      console.error("Failed to load from library", err);
      setError("Failed to load the selected item.");
    }

    setIsLibraryPickerOpen(false);
    setLibraryPickerConfig({ target: null, filter: null });
  };


  const handleAddSoupToHistory = (soup: string) => {
    // Add new soup to the front, prevent duplicates, and limit history size
    setPromptToolSoupHistory(prev => [soup, ...prev.filter(s => s !== soup)].slice(0, 10));
    setPromptToolSoupPrompt(soup);
  };
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch('/version.json')
      .then(res => res.json())
      .then(data => setVersionInfo(data))
      .catch(err => console.error("Failed to load version info:", err));
  }, []);
  
  const updateAndTestConnection = useCallback(async (newUrl?: string) => {
    const urlToUse = newUrl ?? (localStorage.getItem('comfyui_url') || '');
    localStorage.setItem('comfyui_url', urlToUse);
    setComfyUIUrl(urlToUse);
    if (!urlToUse) {
      setIsComfyUIConnected(false);
      return;
    }
    setIsComfyUIConnected(null);
    const result = await checkComfyUIConnection(urlToUse);
    setIsComfyUIConnected(result.success);
  }, []);

  useEffect(() => {
    if (currentUser) {
      updateAndTestConnection();
    } else {
      setIsComfyUIConnected(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 
  
  useEffect(() => {
    if (isComfyUIConnected) {
      getComfyUIObjectInfo()
        .then(info => {
          setComfyUIObjectInfo(info);
          const fluxNode = Object.keys(info).find(key => key.toLowerCase().includes('fluxguidancesampler'));
          if (fluxNode) {
            setOptions(prev => ({...prev, comfyFluxNodeName: fluxNode}));
          }
        })
        .catch(err => {
          console.error("Failed to get ComfyUI object info:", err);
          setComfyUIObjectInfo({});
        });
    } else {
        setComfyUIObjectInfo(null);
    }
  }, [isComfyUIConnected]);

  // --- Google Drive Integration Effects ---
  useEffect(() => {
    const setupDriveService = () => {
      if (currentUser && isDriveConfigured) {
          libraryService.setDriveService(googleDriveService);
          const savedFolder = localStorage.getItem('driveFolder');
          if (savedFolder) {
              try {
                const folder: DriveFolder = JSON.parse(savedFolder);
                googleDriveService.setFolder(folder);
              } catch (e) {
                console.error("Failed to parse saved drive folder.", e);
                localStorage.removeItem('driveFolder');
              }
          }
      }
    };
    setupDriveService();
  }, [currentUser, isDriveConfigured]);


  const handleDriveConnect = () => {
    setError(null);
    setIsOAuthHelperOpen(true);
  };
  
  const proceedWithGoogleLogin = async () => {
    setIsOAuthHelperOpen(false);
    setIsSyncing(true);
    setSyncMessage('Connecting to Google Drive...');
    setError(null);
    try {
        const folder = await googleDriveService.connectAndPickFolder();
        if (folder) {
            setDriveFolder(folder);
            localStorage.setItem('driveFolder', JSON.stringify(folder));
            libraryService.setDriveService(googleDriveService);
            
            setSyncMessage('Initializing library on Google Drive...');
            await libraryService.initializeDriveSync(setSyncMessage);
            alert("Google Drive library initialized and synced successfully!");

        } else {
            setSyncMessage('');
        }
    } catch (e: any) {
        console.error("Drive Connection/Initialization Error:", e);
        if (e.message && !e.message.includes('User cancelled')) {
            setError(`Failed to connect or initialize Google Drive library. Error: ${e.message}`);
        }
    } finally {
        setIsSyncing(false);
        setSyncMessage('');
    }
  };


  const handleDriveDisconnect = () => {
    googleDriveService.disconnect();
    setDriveFolder(null);
    localStorage.removeItem('driveFolder');
    libraryService.setDriveService(null);
  };
  
  const handleSyncWithDrive = async () => {
    setIsSyncing(true);
    setError(null);
    try {
        await libraryService.syncLibraryFromDrive((msg) => setSyncMessage(msg));
        await libraryService.syncLibraryToDrive((msg) => setSyncMessage(msg));
        alert("Two-way sync complete!");
    } catch (e: any) {
        console.error("Sync Error:", e);
        setError("Failed to sync with Google Drive: " + e.message);
    } finally {
        setIsSyncing(false);
        setSyncMessage('');
    }
  };

  const handleLogin = async (username: string, password: string): Promise<true | string> => {
    const user = await authenticateUser(username, password);
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem('currentUser', JSON.stringify(user));
      await updateAndTestConnection();
      return true;
    }
    return "Invalid username or password.";
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
    setIsComfyUIConnected(false);
    handleDriveDisconnect();
  };
  
  const handleSaveSettings = (newComfyUrl: string, newClientId: string) => {
    updateAndTestConnection(newComfyUrl);
    localStorage.setItem('google_client_id', newClientId);
    setGoogleClientId(newClientId);
    setIsDriveConfigured(!!newClientId);
  };

  const handleReset = useCallback(() => {
    const provider = options.provider;
    const videoProvider = options.videoProvider;
    setOptions({
        ...initialOptions,
        provider: provider,
        videoProvider: videoProvider
    });
    setSourceImage(null);
    setClothingImage(null);
    setBackgroundImage(null);
    setPreviewedBackgroundImage(null);
    setPreviewedClothingImage(null);
    setGeneratedImages([]);
    setStartFrame(null);
    setEndFrame(null);
    setGeneratedVideo(null);
    setError(null);
    setLastUsedPrompt(null);
    setLastGenerationOptions(null);
  }, [options.provider, options.videoProvider]);

  const handleGeneratePrompt = useCallback(async () => {
    if (!sourceImage) return;
    setIsGeneratingPrompt(true);
    setError(null);
    try {
        const modelType = options.comfyModelType || 'sdxl';
        const prompt = await generateComfyUIPromptService(sourceImage, modelType);
        setOptions(prev => ({ ...prev, comfyPrompt: prompt }));
    } catch (err: any) {
        setError(err.message || "Failed to generate prompt.");
    } finally {
        setIsGeneratingPrompt(false);
    }
  }, [sourceImage, options.comfyModelType]);

  const handleSetNewSource = async (imageDataUrl: string) => {
      try {
        const file = await dataUrlToFile(imageDataUrl, "new_source.jpeg");
        setSourceImage(file);
        setGeneratedImages([]);
        setError(null);
        setLastUsedPrompt(null);
        setLastGenerationOptions(null);
      } catch (err) {
          console.error("Failed to set new source image:", err);
          setError("Could not use this image as the new source.");
      }
  };

  const updateProgress = useCallback((message: string, value: number) => {
    setProgressMessage(message);
    setProgressValue(value);
  }, []);

  const handleGenerate = async () => {
    setIsLoading(true);
    setGeneratedImages([]);
    setGeneratedVideo(null);
    setError(null);
    setLastUsedPrompt(null);
    setLastGenerationOptions(null);
    const generationOptions = { ...options };

    try {
      if (activeTab === 'image') {
          let generationPromise;
          if (generationOptions.provider === 'gemini') {
            if (generationOptions.geminiMode === 't2i') {
                if (!generationOptions.geminiPrompt) {
                  throw new Error("Please enter a prompt for Gemini text-to-image generation.");
                }
                generationPromise = generateImagesFromPrompt(generationOptions, updateProgress);
            } else { // i2i mode
                if (!sourceImage) {
                  throw new Error("Please upload a source image for Gemini image-to-image generation.");
                }
                generationPromise = generatePortraitSeries(
                  sourceImage,
                  clothingImage,
                  backgroundImage,
                  previewedBackgroundImage,
                  previewedClothingImage,
                  generationOptions,
                  updateProgress
                );
            }
          } else if (generationOptions.provider === 'comfyui') {
            if (generationOptions.comfyModelType === 'nunchaku-kontext-flux' && !sourceImage) {
              throw new Error("Nunchaku Kontext Flux requires a source image.");
            }
            if (!generationOptions.comfyPrompt) {
              throw new Error("Please enter a prompt for ComfyUI or generate one from a source image.");
            }
            setProgressMessage('Connecting to ComfyUI...');
            generationPromise = generateComfyUIPortraits(sourceImage, generationOptions, updateProgress);
          } else {
            throw new Error("Invalid provider selected.");
          }

          const { images, finalPrompt } = await generationPromise;
          
          if (images.length > 0) {
            const generatedThumbnails = await Promise.all(
              images.map(imgDataUrl => dataUrlToThumbnail(imgDataUrl, 128))
            );
            
            const historyItem: Omit<HistoryItem, 'id'> = {
              timestamp: new Date().toISOString(),
              options: generationOptions,
              generatedImages: generatedThumbnails,
              sourceImage: undefined,
            };

            const needsSourceImage = (generationOptions.provider === 'gemini' && generationOptions.geminiMode === 'i2i') || (generationOptions.provider === 'comfyui');

            if (needsSourceImage && sourceImage) {
              const sourceImageForHistory = await fileToResizedDataUrl(sourceImage, 512);
              historyItem.sourceImage = await dataUrlToThumbnail(sourceImageForHistory, 128);
            }
            
            saveGenerationToHistory(historyItem);
          }
          setGeneratedImages(images);
          setLastUsedPrompt(finalPrompt);
          setLastGenerationOptions(generationOptions);

      } else if (activeTab === 'video') {
        if (generationOptions.videoProvider === 'gemini') {
            if (!startFrame && !generationOptions.geminiVidPrompt?.trim()) {
                throw new Error("Please upload an input image or provide a prompt for Gemini video generation.");
            }
            setProgressMessage('Connecting to Gemini for video generation...');
            const { videoUrl, finalPrompt } = await generateGeminiVideo(startFrame, generationOptions, updateProgress);
            setGeneratedVideo(videoUrl);
            setLastUsedPrompt(finalPrompt);
        } else { // ComfyUI
            if (!startFrame) {
              throw new Error("Please upload a start frame for ComfyUI video generation.");
            }
            setProgressMessage('Connecting to ComfyUI for video generation...');
            const { videoUrl, finalPrompt } = await generateComfyUIVideo(startFrame, endFrame, generationOptions, updateProgress);
            setGeneratedVideo(videoUrl);
            setLastUsedPrompt(finalPrompt);
        }
        setLastGenerationOptions(generationOptions);
      } else {
        throw new Error("Invalid active tab for generation.");
      }
    } catch (err: any) {
      console.error("Generation failed:", err);
      setError(err.message || "An unknown error occurred during generation.");
    } finally {
      setIsLoading(false);
      setProgressValue(0);
      setProgressMessage('');
    }
  };
  
  const handleLoadHistoryItem = async (item: HistoryItem) => {
    setOptions(item.options);
    setGeneratedImages(item.generatedImages);
    setLastGenerationOptions(item.options);
    
    if (item.sourceImage) {
      try {
        const file = await dataUrlToFile(item.sourceImage, "history_source.jpeg");
        setSourceImage(file);
      } catch(e) {
        console.error("Could not load source image from history", e);
        setSourceImage(null);
      }
    } else {
      setSourceImage(null);
    }
    
    setIsHistoryPanelOpen(false); // Close panel on load
  };
  
  const handleLoadFromLibrary = async (item: LibraryItem) => {
    // Shared reset logic
    setGeneratedImages([]);
    setGeneratedVideo(null);
    setError(null);
    setLastUsedPrompt(null);
    setLastGenerationOptions(null);

    switch (item.mediaType) {
        case 'image':
        case 'video':
            if (item.options) {
                setOptions(item.options);
                setLastGenerationOptions(item.options);
            }
            setSourceImage(item.sourceImage ? await dataUrlToFile(item.sourceImage, 'library_source.jpg') : null);
            setStartFrame(item.startFrame ? await dataUrlToFile(item.startFrame, 'library_start.jpg') : null);
            setEndFrame(item.endFrame ? await dataUrlToFile(item.endFrame, 'library_end.jpg') : null);

            if (item.mediaType === 'image') {
                setGeneratedImages([item.media]);
                setActiveTab('image');
            } else {
                setGeneratedVideo(item.media);
                setActiveTab('video');
            }
            break;
        
        case 'clothes':
            setActiveTab('clothes');
            setClothesExtractorFile(item.sourceImage ? await dataUrlToFile(item.sourceImage, 'library_source.jpg') : null);
            setClothesExtractorDetails(item.clothingDetails || '');
            try {
                // Handle new (data URL) and old (JSON) formats
                const isJson = item.media.trim().startsWith('{');
                if (isJson) {
                    const parsedMedia = JSON.parse(item.media);
                    setClothesExtractorResults([{ name: item.name || 'Loaded Item', ...parsedMedia }]);
                } else {
                    const dummyItem = { name: item.name || 'Loaded Item', laidOutImage: item.media, foldedImage: item.media };
                     setClothesExtractorResults([dummyItem]);
                }
            } catch (e) {
                console.error("Failed to parse media from clothes library item", e);
                setClothesExtractorResults([]);
            }
            break;
        
        case 'prompt':
            setOptions(prev => ({ ...prev, provider: 'comfyui', comfyPrompt: item.media }));
            setActiveTab('image');
            break;
    }
  };


  const handleExportWorkflow = () => {
    try {
        exportComfyUIWorkflow(options, sourceImage);
    } catch (err: any) {
        setError(err.message || "Failed to export workflow.");
    }
  };

  const isGenerationReady = () => {
    if (isLoading) return false;
    
    if (activeTab === 'image') {
        return (options.provider === 'gemini' && ((options.geminiMode === 'i2i' && sourceImage !== null) || (options.geminiMode === 't2i' && !!options.geminiPrompt))) || 
               (options.provider === 'comfyui' && !!options.comfyPrompt && (options.comfyModelType !== 'nunchaku-kontext-flux' || sourceImage !== null));
    }
    
    if (activeTab === 'video') {
        if (options.videoProvider === 'gemini') {
            return !!options.geminiVidPrompt?.trim();
        } else { // comfyui
            return !!startFrame && (!options.comfyVidWanI2VUseEndFrame || !!endFrame) && !!options.comfyVidWanI2VPositivePrompt;
        }
    }
    
    return false;
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const getUploaderSectionTitle = () => {
      if (options.provider === 'gemini') {
        return options.geminiMode === 't2i' ? "1. Configure Prompt" : "1. Upload Images";
      }
      if (options.comfyModelType === 'nunchaku-kontext-flux' || options.comfyModelType === 'flux-krea') return "1. Setup Prompt";
      return "1. Upload Image & Set Prompt";
  };

  const getSourceImageLabel = () => {
    if (options.provider === 'comfyui') {
        if (options.comfyModelType === 'nunchaku-kontext-flux') return "1. Upload Source Image";
        return "Source Image (to generate prompt)";
    }
    return "1. Upload Source Image"; // Gemini
  };

  const showSourceImageUploader = () => {
      if (options.provider === 'gemini') {
          return options.geminiMode === 'i2i';
      }
      if (options.provider === 'comfyui') {
          return true;
      }
      return false;
  }


  return (
    <>
      <Header 
        theme={theme} 
        setTheme={setTheme} 
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
        <div className="bg-bg-secondary p-4 rounded-2xl shadow-lg mb-8">
            <div className="flex items-center justify-center border-b border-border-primary">
                <button onClick={() => setActiveTab('image')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'image' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                    Image Generator
                </button>
                <button onClick={() => setActiveTab('video')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'video' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                    Video Generator
                </button>
                <button onClick={() => setActiveTab('library')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'library' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                    Library
                </button>
                <button onClick={() => setActiveTab('clothes')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'clothes' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                    Clothes Extractor
                </button>
                <button onClick={() => setActiveTab('video-utils')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'video-utils' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                    Video Utilities
                </button>
                {currentUser.role === 'admin' && (
                    <>
                        <button onClick={() => setActiveTab('prompt')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'prompt' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                            Prompt Tool
                        </button>
                        <button onClick={() => setActiveTab('manage')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeTab === 'manage' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                            Manage Users
                        </button>
                    </>
                )}
            </div>
        </div>

        { activeTab === 'image' &&
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-1 space-y-8">
              {!(options.provider === 'gemini' && options.geminiMode === 't2i') &&
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                  <h2 className="text-xl font-bold mb-4 text-accent">{getUploaderSectionTitle()}</h2>
                  <div className="space-y-4">
                    {showSourceImageUploader() && (
                       <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="block text-sm font-medium text-text-secondary">{getSourceImageLabel()}</span>
                                <button onClick={() => handleOpenLibraryPicker('sourceImage', 'image')} className="flex items-center gap-1.5 text-xs bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-1 px-2 rounded-lg transition-colors">
                                    <LibraryIcon className="w-4 h-4" /> From Library
                                </button>
                            </div>
                            <ImageUploader 
                                id="source-image" 
                                onImageUpload={setSourceImage} 
                                sourceFile={sourceImage}
                            />
                        </div>
                    )}
                    {options.provider === 'gemini' && options.geminiMode === 'i2i' && options.clothing === 'image' && (
                       <div>
                           <div className="flex items-center justify-between mb-2">
                                <span className="block text-sm font-medium text-text-secondary">Clothing Reference Image (Optional)</span>
                                <button onClick={() => handleOpenLibraryPicker('clothingImage', 'clothes')} className="flex items-center gap-1.5 text-xs bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-1 px-2 rounded-lg transition-colors">
                                    <LibraryIcon className="w-4 h-4" /> From Library
                                </button>
                            </div>
                            <ImageUploader id="clothing-image" onImageUpload={setClothingImage} sourceFile={clothingImage} />
                        </div>
                    )}
                    {options.provider === 'gemini' && options.geminiMode === 'i2i' && options.background === 'image' && (
                      <ImageUploader label="Background Image (Optional)" id="background-image" onImageUpload={setBackgroundImage} sourceFile={backgroundImage} />
                    )}
                  </div>
                </div>
              }
              <OptionsPanel 
                options={options} 
                setOptions={setOptions}
                previewedBackgroundImage={previewedBackgroundImage}
                setPreviewedBackgroundImage={setPreviewedBackgroundImage}
                previewedClothingImage={previewedClothingImage}
                setPreviewedClothingImage={setPreviewedClothingImage}
                onGenerate={handleGenerate}
                onReset={handleReset}
                onGeneratePrompt={handleGeneratePrompt}
                onExportWorkflow={handleExportWorkflow}
                isDisabled={isLoading}
                isReady={isGenerationReady()}
                isGeneratingPrompt={isGeneratingPrompt}
                comfyUIObjectInfo={comfyUIObjectInfo}
                comfyUIUrl={comfyUIUrl}
                sourceImage={sourceImage}
              />
            </div>

            <div className="lg:col-span-2 sticky top-24">
              {isLoading ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg min-h-[500px]">
                      <Loader message={progressMessage} progress={progressValue} />
                  </div>
              ) : error ? (
                <div className="bg-danger-bg text-danger p-4 rounded-lg text-center">
                  <h3 className="font-bold mb-2">Generation Failed</h3>
                  <p className="text-sm">{error}</p>
                </div>
              ) : generatedImages.length > 0 && lastGenerationOptions ? (
                <ImageGrid 
                    images={generatedImages} 
                    onSetNewSource={handleSetNewSource} 
                    lastUsedPrompt={lastUsedPrompt}
                    options={lastGenerationOptions}
                    sourceImage={sourceImage}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg h-full min-h-[500px]">
                    <GenerateIcon className="w-16 h-16 text-border-primary mb-4" />
                    <h3 className="text-lg font-bold text-text-primary">Your generated images will appear here</h3>
                    <p className="text-text-secondary max-w-xs">Configure your options on the left and click "Generate" to see the magic happen.</p>
                </div>
              )}
            </div>
          </div>
        }
        
        {activeTab === 'video' && 
          <VideoGeneratorPanel
            options={options}
            setOptions={setOptions}
            comfyUIObjectInfo={comfyUIObjectInfo}
            startFrame={startFrame}
            setStartFrame={setStartFrame}
            endFrame={endFrame}
            setEndFrame={setEndFrame}
            onGenerate={handleGenerate}
            isReady={isGenerationReady()}
            isLoading={isLoading}
            error={error}
            generatedVideo={generatedVideo}
            lastUsedPrompt={lastUsedPrompt}
            progressMessage={progressMessage}
            progressValue={progressValue}
            onReset={handleReset}
            generationOptionsForSave={lastGenerationOptions}
          />
        }

        {activeTab === 'library' && 
            <LibraryPanel 
                onLoadItem={handleLoadFromLibrary} 
                isDriveConnected={!!driveFolder}
                isDriveConfigured={isDriveConfigured}
                onSyncWithDrive={handleSyncWithDrive}
                isSyncing={isSyncing}
                syncMessage={syncMessage}
            />
        }

        {activeTab === 'clothes' &&
            <ClothesExtractorPanel 
                selectedFile={clothesExtractorFile}
                setSelectedFile={setClothesExtractorFile}
                details={clothesExtractorDetails}
                setDetails={setClothesExtractorDetails}
                generatedItems={clothesExtractorResults}
                setGeneratedItems={setClothesExtractorResults}
            />
        }

        {activeTab === 'video-utils' && <VideoUtilsPanel />}

        {activeTab === 'prompt' && currentUser.role === 'admin' && 
            <PromptGeneratorPanel
                onUsePrompt={(p) => { 
                    setOptions(prev => ({...prev, provider: 'comfyui', comfyPrompt: p})); 
                    setActiveTab('image'); 
                }}
                image={promptToolImage}
                setImage={setPromptToolImage}
                prompt={promptToolPrompt}
                setPrompt={setPromptToolPrompt}
                bgImage={promptToolBgImage}
                setBgImage={setPromptToolBgImage}
                bgPrompt={promptToolBgPrompt}
                setBgPrompt={setPromptToolBgPrompt}
                subjectImage={promptToolSubjectImage}
                setSubjectImage={setPromptToolSubjectImage}
                subjectPrompt={promptToolSubjectPrompt}
                setSubjectPrompt={setPromptToolSubjectPrompt}
                soupPrompt={promptToolSoupPrompt}
                setSoupPrompt={setPromptToolSoupPrompt}
                soupHistory={promptToolSoupHistory}
                onAddSoupToHistory={handleAddSoupToHistory}
            />
        }
        {activeTab === 'manage' && currentUser.role === 'admin' && <AdminPanel />}

      </main>
      
      <ConnectionSettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialComfyUIUrl={comfyUIUrl}
        initialGoogleClientId={googleClientId}
        onSave={handleSaveSettings}
      />
      <HistoryPanel
        isOpen={isHistoryPanelOpen}
        onClose={() => setIsHistoryPanelOpen(false)}
        onLoadHistoryItem={handleLoadHistoryItem}
      />
      <LibraryPickerModal
        isOpen={isLibraryPickerOpen}
        onClose={() => setIsLibraryPickerOpen(false)}
        onSelectItem={handleSelectFromLibrary}
        filter={libraryPickerConfig.filter}
      />
      <OAuthHelperModal
        isOpen={isOAuthHelperOpen}
        onClose={() => setIsOAuthHelperOpen(false)}
        onProceed={proceedWithGoogleLogin}
        clientId={googleClientId}
        origin={typeof window !== 'undefined' ? window.location.origin : ''}
      />
    </>
  );
}

export default App;