import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Login } from './components/Login';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { AdminPanel } from './components/AdminPanel';
import { Loader } from './components/Loader';
import { ComfyUIConnection } from './components/ComfyUIConnection';
import { HistoryPanel } from './components/HistoryPanel';
import { PromptGeneratorPanel } from './components/PromptGeneratorPanel';
import { GenerateIcon } from './components/icons';
import type { GenerationOptions, User, HistoryItem, VersionInfo } from './types';
import { authenticateUser } from './services/cloudUserService';
import { generatePortraitSeries } from './services/geminiService';
import { exportComfyUIWorkflow, generateComfyUIPortraits, checkConnection as checkComfyUIConnection, getComfyUIObjectInfo, generateComfyUIPromptFromSource as generateComfyUIPromptService } from './services/comfyUIService';
import { saveGenerationToHistory } from './services/historyService';
import { fileToResizedDataUrl, dataUrlToThumbnail } from './utils/imageUtils';
import { PHOTO_STYLE_OPTIONS, IMAGE_STYLE_OPTIONS, ERA_STYLE_OPTIONS } from './constants';

const initialOptions: GenerationOptions = {
  provider: 'gemini',
  numImages: 2,
  background: 'original',
  aspectRatio: '3:4',
  customBackground: '',
  consistentBackground: false,
  clothing: 'original',
  customClothingPrompt: '',
  // Fix: Removed the obsolete 'randomizeClothing' property, which is not defined in the GenerationOptions type.
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
  const [error, setError] = useState<string | null>(null);
  
  const [adminTab, setAdminTab] = useState<'generate' | 'prompt' | 'manage'>('generate');
  const [isComfyModalOpen, setIsComfyModalOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyui_url') || '');
  const [isComfyUIConnected, setIsComfyUIConnected] = useState<boolean | null>(null);
  const [comfyUIObjectInfo, setComfyUIObjectInfo] = useState<any | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  
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
    // Fix: Added parentheses to resolve mixed '||' and '??' operator precedence.
    const urlToUse = newUrl ?? (localStorage.getItem('comfyui_url') || '');

    // "Save" part: update both localStorage and React state for consistency.
    localStorage.setItem('comfyui_url', urlToUse);
    setComfyUIUrl(urlToUse);

    // "Test" part.
    if (!urlToUse) {
      setIsComfyUIConnected(false);
      return;
    }

    setIsComfyUIConnected(null); // Set to "checking" state
    const result = await checkComfyUIConnection(urlToUse);
    setIsComfyUIConnected(result.success);
  }, []);

  // Effect for initial mount (handles page refresh with a saved session)
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
          // Auto-detect FLUX node
          const fluxNode = Object.keys(info).find(key => key.toLowerCase().includes('fluxguidancesampler'));
          if (fluxNode) {
            setOptions(prev => ({...prev, comfyFluxNodeName: fluxNode}));
          }
        })
        .catch(err => {
          console.error("Failed to get ComfyUI object info:", err);
          setComfyUIObjectInfo({}); // Set to empty object on error
        });
    } else {
        setComfyUIObjectInfo(null);
    }
  }, [isComfyUIConnected]);

  const handleLogin = async (username: string, password: string): Promise<true | string> => {
    const user = await authenticateUser(username, password);
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem('currentUser', JSON.stringify(user));
      // Directly call the new function after successful login
      await updateAndTestConnection();
      return true;
    }
    return "Invalid username or password.";
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
    setIsComfyUIConnected(false);
  };
  
  // The modal save function now just calls our central logic handler.
  const handleSaveComfyUrl = (newUrl: string) => {
    updateAndTestConnection(newUrl);
  };
  
  const handleReset = useCallback(() => {
    setOptions(initialOptions);
    setSourceImage(null);
    setClothingImage(null);
    setBackgroundImage(null);
    setPreviewedBackgroundImage(null);
    setPreviewedClothingImage(null);
    setGeneratedImages([]);
    setError(null);
    setLastUsedPrompt(null);
  }, []);

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
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();
        const file = new File([blob], "new_source.jpeg", { type: "image/jpeg" });
        setSourceImage(file);
        setGeneratedImages([]); // Clear previous results
        setError(null);
        setLastUsedPrompt(null);
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
    setError(null);
    setLastUsedPrompt(null);

    let generationPromise;

    try {
      if (options.provider === 'gemini') {
        if (!sourceImage) {
          setError("Please upload a source image for Gemini generation.");
          setIsLoading(false);
          return;
        }
        generationPromise = generatePortraitSeries(
          sourceImage,
          clothingImage,
          backgroundImage,
          previewedBackgroundImage,
          previewedClothingImage,
          options,
          updateProgress
        );
      } else if (options.provider === 'comfyui') {
        if (options.comfyModelType === 'nunchaku-kontext-flux' && !sourceImage) {
          setError("Nunchaku Kontext Flux requires a source image.");
          setIsLoading(false);
          return;
        }
        if (!options.comfyPrompt) {
          setError("Please enter a prompt for ComfyUI or generate one from a source image.");
          setIsLoading(false);
          return;
        }
        setProgressMessage('Connecting to ComfyUI...');
        generationPromise = generateComfyUIPortraits(sourceImage, options, updateProgress);
      } else {
        throw new Error("Invalid provider selected.");
      }

      const { images, finalPrompt } = await generationPromise;
      
      if (images.length > 0 && sourceImage) {
        const sourceImageForHistory = await fileToResizedDataUrl(sourceImage, 512);
        const sourceThumbnail = await dataUrlToThumbnail(sourceImageForHistory, 128);

        // Create thumbnails for all generated images to save space in localStorage
        const generatedThumbnails = await Promise.all(
          images.map(imgDataUrl => dataUrlToThumbnail(imgDataUrl, 128))
        );

        saveGenerationToHistory({
          timestamp: new Date().toISOString(),
          sourceImage: sourceThumbnail,
          options: options,
          generatedImages: generatedThumbnails, // Save thumbnails instead of full images
        });
      }
      setGeneratedImages(images);
      setLastUsedPrompt(finalPrompt);

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
    
    // Try to reconstruct the source image File object
    try {
      const response = await fetch(item.sourceImage);
      const blob = await response.blob();
      const file = new File([blob], "history_source.jpeg", { type: blob.type });
      setSourceImage(file);
    } catch(e) {
      console.error("Could not load source image from history", e);
      setSourceImage(null); // clear if it fails
    }
    
    setIsHistoryPanelOpen(false); // Close panel on load
  };

  const handleExportWorkflow = () => {
    try {
        exportComfyUIWorkflow(options, sourceImage);
    } catch (err: any) {
        setError(err.message || "Failed to export workflow.");
    }
  };

  const isGenerationReady = (options.provider === 'gemini' && sourceImage !== null) || 
    (options.provider === 'comfyui' && !!options.comfyPrompt && (options.comfyModelType !== 'nunchaku-kontext-flux' || sourceImage !== null));


  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }
  
  const getUploaderSectionTitle = () => {
      if (options.provider === 'gemini') return "1. Upload Images";
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
      if (options.provider === 'gemini') return true;
      if (options.provider === 'comfyui' && (options.comfyModelType !== 'flux-krea')) return true;
      return false;
  }


  return (
    <>
      <Header 
        theme={theme} 
        setTheme={setTheme} 
        onLogout={handleLogout} 
        currentUser={currentUser}
        onOpenComfyModal={() => setIsComfyModalOpen(true)}
        onOpenHistoryPanel={() => setIsHistoryPanelOpen(true)}
        isComfyUIConnected={isComfyUIConnected}
        versionInfo={versionInfo}
      />
      <main className="container mx-auto p-4 md:p-8">
        {currentUser.role === 'admin' && (
            <div className="bg-bg-secondary p-4 rounded-2xl shadow-lg mb-8">
                <div className="flex items-center justify-center border-b border-border-primary">
                    <button onClick={() => setAdminTab('generate')} className={`px-4 py-2 text-sm font-bold transition-colors ${adminTab === 'generate' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Generator
                    </button>
                    <button onClick={() => setAdminTab('prompt')} className={`px-4 py-2 text-sm font-bold transition-colors ${adminTab === 'prompt' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Prompt Tool
                    </button>
                    <button onClick={() => setAdminTab('manage')} className={`px-4 py-2 text-sm font-bold transition-colors ${adminTab === 'manage' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Manage Users
                    </button>
                </div>
            </div>
        )}

        { (currentUser.role !== 'admin' || adminTab === 'generate') &&
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column for Controls */}
            <div className="lg:col-span-1 space-y-8">
              <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-accent">{getUploaderSectionTitle()}</h2>
                <div className="space-y-4">
                  {showSourceImageUploader() && (
                    <ImageUploader 
                      label={getSourceImageLabel()}
                      id="source-image" 
                      onImageUpload={setSourceImage} 
                      sourceFile={sourceImage}
                    />
                  )}
                  {options.provider === 'gemini' && options.clothing === 'image' && (
                    <ImageUploader label="Clothing Reference Image (Optional)" id="clothing-image" onImageUpload={setClothingImage} sourceFile={clothingImage} />
                  )}
                  {options.provider === 'gemini' && options.background === 'image' && (
                    <ImageUploader label="Background Image (Optional)" id="background-image" onImageUpload={setBackgroundImage} sourceFile={backgroundImage} />
                  )}
                </div>
              </div>
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
                isReady={isGenerationReady && !isLoading}
                isGeneratingPrompt={isGeneratingPrompt}
                comfyUIObjectInfo={comfyUIObjectInfo}
                comfyUIUrl={comfyUIUrl}
                sourceImage={sourceImage}
              />
            </div>

            {/* Right column for results */}
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
              ) : generatedImages.length > 0 ? (
                <ImageGrid images={generatedImages} onSetNewSource={handleSetNewSource} lastUsedPrompt={lastUsedPrompt}/>
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
        
        {currentUser.role === 'admin' && adminTab === 'prompt' && <PromptGeneratorPanel onUsePrompt={(p) => { setOptions(prev => ({...prev, comfyPrompt: p})); setAdminTab('generate'); }} />}
        {currentUser.role === 'admin' && adminTab === 'manage' && <AdminPanel />}

      </main>
      
      <ComfyUIConnection 
        isOpen={isComfyModalOpen}
        onClose={() => setIsComfyModalOpen(false)}
        initialUrl={comfyUIUrl}
        onSaveUrl={handleSaveComfyUrl}
      />
      <HistoryPanel
        isOpen={isHistoryPanelOpen}
        onClose={() => setIsHistoryPanelOpen(false)}
        onLoadHistoryItem={handleLoadHistoryItem}
      />
    </>
  );
}

export default App;