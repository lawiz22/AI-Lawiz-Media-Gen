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
import type { GenerationOptions, User, HistoryItem } from './types';
import { authenticateUser } from './services/cloudUserService';
import { generatePortraitSeries, generatePromptFromImage } from './services/geminiService';
import { exportComfyUIWorkflow, generateComfyUIPortraits, checkConnection as checkComfyUIConnection, getComfyUIObjectInfo } from './services/comfyUIService';
import { saveGenerationToHistory } from './services/historyService';
import { fileToResizedDataUrl, dataUrlToThumbnail } from './utils/imageUtils';
import { PHOTO_STYLE_OPTIONS, IMAGE_STYLE_OPTIONS, ASPECT_RATIO_OPTIONS, ERA_STYLE_OPTIONS } from './constants';

const initialOptions: GenerationOptions = {
  provider: 'gemini',
  numImages: 4,
  background: 'gray',
  aspectRatio: ASPECT_RATIO_OPTIONS[0].value,
  customBackground: '',
  consistentBackground: false,
  clothing: 'original',
  customClothingPrompt: '',
  randomizeClothing: false,
  clothingStyleConsistency: 'varied',
  poseMode: 'random',
  poseSelection: [],
  photoStyle: PHOTO_STYLE_OPTIONS[0].value,
  imageStyle: IMAGE_STYLE_OPTIONS[0].value,
  eraStyle: ERA_STYLE_OPTIONS[0].value,
  
  // ComfyUI defaults
  comfyModelType: 'sdxl',
  comfyFluxGuidance: 3.5,
  comfyModel: '',
  comfySteps: 25,
  comfyCfg: 7,
  comfySampler: 'euler',
  comfyScheduler: 'normal',
  comfyPrompt: '',
  comfyFluxNodeName: null,
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
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [adminTab, setAdminTab] = useState<'generate' | 'manage'>('generate');
  const [isComfyModalOpen, setIsComfyModalOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  
  // Refactored: Manage ComfyUI URL and connection status in state
  const [comfyUIUrl, setComfyUIUrl] = useState<string>(() => localStorage.getItem('comfyui_url') || '');
  const [isComfyUIConnected, setIsComfyUIConnected] = useState<boolean | null>(null);
  const [comfyUIObjectInfo, setComfyUIObjectInfo] = useState<any | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  // Refactored: Connection check is now a pure function
  const checkComfyStatus = useCallback(async (url: string) => {
      if (!url) {
          setIsComfyUIConnected(false);
          return;
      }
      setIsComfyUIConnected(null); // Set to checking state
      const result = await checkComfyUIConnection(url);
      setIsComfyUIConnected(result.success);
  }, []);

  // Refactored: Effect now declaratively handles connection status based on state
  useEffect(() => {
    if (currentUser && comfyUIUrl) {
      checkComfyStatus(comfyUIUrl);
    } else if (currentUser) {
      // User is logged in, but no URL is set.
      setIsComfyUIConnected(false);
    }
  }, [currentUser, comfyUIUrl, checkComfyStatus]);
  
  // Effect to fetch ComfyUI server capabilities (nodes, models, etc.)
  useEffect(() => {
    if (options.provider === 'comfyui' && comfyUIUrl) {
      // Set to null to indicate loading
      setComfyUIObjectInfo(null);
      const fetchInfo = async () => {
        try {
          const info = await getComfyUIObjectInfo();
          setComfyUIObjectInfo(info);
        } catch (error) {
          console.error("Failed to fetch ComfyUI info:", error);
          setComfyUIObjectInfo({}); // Set to empty object on error to stop loading
        }
      };
      fetchInfo();
    }
  }, [options.provider, comfyUIUrl]);

  // Effect to detect the correct FLUX guidance node name from the server info
  useEffect(() => {
    if (options.provider === 'comfyui' && options.comfyModelType === 'flux' && comfyUIObjectInfo) {
      const availableNodes = Object.keys(comfyUIObjectInfo);
      
      const foundNode = availableNodes.find(node => {
          const lowerNode = node.toLowerCase();
          const hasFlux = lowerNode.includes('flux');
          const hasGuidance = lowerNode.includes('guidance') || lowerNode.includes('guidage');
          return hasFlux && hasGuidance;
      });
      
      // Update the options state with the found node name or null if not found
      if (foundNode !== options.comfyFluxNodeName) {
        setOptions(prev => ({ ...prev, comfyFluxNodeName: foundNode || null }));
      }
    } else if (options.comfyFluxNodeName !== null) {
      // Reset if not in flux mode or provider changed
      setOptions(prev => ({ ...prev, comfyFluxNodeName: null }));
    }
  }, [options.provider, options.comfyModelType, comfyUIObjectInfo, options.comfyFluxNodeName, setOptions]);

  useEffect(() => {
    if (options.provider === 'comfyui' && sourceImage) {
      const generatePrompt = async () => {
        setIsGeneratingPrompt(true);
        setError(null);
        try {
          const prompt = await generatePromptFromImage(sourceImage);
          setOptions(prev => ({ ...prev, comfyPrompt: prompt }));
        } catch (err: any) {
          setError(`Failed to generate prompt from image: ${err.message}`);
          setOptions(prev => ({ ...prev, comfyPrompt: '' }));
        } finally {
          setIsGeneratingPrompt(false);
        }
      };
      generatePrompt();
    }
  }, [sourceImage, options.provider]);
  
  const isReadyToGenerate = (() => {
    if (isLoading || isGeneratingPrompt) return false;
    if (options.provider === 'gemini') {
      if (!sourceImage) return false;
      if (options.clothing === 'image' && !clothingImage) return false;
      if (options.background === 'image' && !backgroundImage) return false;
      return true;
    }
    if (options.provider === 'comfyui') {
      // Not ready if capabilities are still loading
      if (!comfyUIObjectInfo) return false;

      if (options.comfyModelType === 'flux') {
          // If in flux mode, we MUST have found the guidance node.
          // The effect above handles setting this in the options state.
          if (!options.comfyFluxNodeName) {
              return false;
          }
      }
      return !!options.comfyModel && !!options.comfyPrompt?.trim();
    }
    return false;
  })();

  const handleLogin = async (username: string, password: string): Promise<string | true> => {
    const user = await authenticateUser(username, password);
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem('currentUser', JSON.stringify(user));
      // The useEffect hook will now handle the connection check automatically upon state change.
      return true;
    }
    return 'Invalid username or password.';
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
  };
  
  const handleReset = () => {
    setOptions(initialOptions);
    setSourceImage(null);
    setClothingImage(null);
    setBackgroundImage(null);
    setGeneratedImages([]);
    setError(null);
    setIsLoading(false);
  };
  
  const handleSetNewSource = async (imageDataUrl: string) => {
    try {
      // Convert data URL to File
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const newFile = new File([blob], `generated-source-${Date.now()}.jpeg`, {
        type: 'image/jpeg',
      });
      setSourceImage(newFile);
      setGeneratedImages([]); // Clear the gallery to show the placeholder
      setError(null);
    } catch (e) {
      console.error('Failed to set new source image:', e);
      setError('Could not use the selected image as the new source.');
    }
  };

  const handleGenerate = async () => {
    if (!isReadyToGenerate) {
      setError("Generation Failed\n\nPlease ensure a source image and all required options are set.");
      return;
    }
    
    // A source image is ONLY required for the Gemini provider.
    if (options.provider === 'gemini' && !sourceImage) {
      setError("Please ensure a source image is uploaded for Gemini generation.");
      return;
    }
    
    setIsLoading(true);
    setGeneratedImages([]);
    setError(null);
    setProgressMessage("Starting generation...");
    setProgressValue(0);

    const onProgress = (message: string, progress: number) => {
      setProgressMessage(message);
      setProgressValue(progress);
    };

    try {
      let images: string[];
      if (options.provider === 'comfyui') {
        images = await generateComfyUIPortraits(
          options,
          onProgress
        );
      } else {
        // We've already confirmed sourceImage is not null for gemini provider.
        images = await generatePortraitSeries(
          sourceImage!,
          clothingImage,
          backgroundImage,
          previewedBackgroundImage,
          options,
          onProgress
        );
      }
      setGeneratedImages(images);

      onProgress("Saving to history...", 0.98);
      
      // For ComfyUI runs without a source image, use the first generated image
      // as the "source" for the history record. Otherwise, use the provided source image.
      const sourceForHistoryDataUrl = sourceImage
        ? await fileToResizedDataUrl(sourceImage, 1024)
        : (images.length > 0 ? await dataUrlToThumbnail(images[0], 1024) : null);

      // Only save to history if we have a source and some results.
      if (sourceForHistoryDataUrl && images.length > 0) {
        const generatedThumbnails = await Promise.all(
          images.map(imgDataUrl => dataUrlToThumbnail(imgDataUrl, 256))
        );

        const historyItem: Omit<HistoryItem, 'id'> = {
          timestamp: new Date().toISOString(),
          sourceImage: sourceForHistoryDataUrl,
          options,
          generatedImages: generatedThumbnails,
        };
        saveGenerationToHistory(historyItem);
      }

    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during image generation.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleLoadHistoryItem = async (item: HistoryItem) => {
    try {
      setOptions(item.options);
      
      const response = await fetch(item.sourceImage);
      const blob = await response.blob();
      const sourceFile = new File([blob], `history-source-${item.id}.jpeg`, { type: blob.type });
      setSourceImage(sourceFile);
      
      // Reset other inputs and results
      setClothingImage(null);
      setBackgroundImage(null);
      setGeneratedImages([]);
      setError(null);
      setIsHistoryPanelOpen(false);

    } catch (err) {
      console.error("Failed to load history item:", err);
      setError("Could not load the selected history item.");
    }
  };
  
  const handleExportWorkflow = () => {
    if (options.provider === 'comfyui' && !options.comfyPrompt) {
      setError("Cannot export ComfyUI workflow without a prompt.");
      return;
    }
    try {
      exportComfyUIWorkflow(options);
      alert(`ComfyUI workflow.json downloaded!\n\nThis is a text-to-image workflow. Just load it in ComfyUI and queue prompt!`);
    } catch (e: any) {
      setError(e.message || "Failed to export workflow.");
    }
  };
  
  const handleSetComfyUIUrl = (url: string) => {
    localStorage.setItem('comfyui_url', url);
    setComfyUIUrl(url);
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary font-sans transition-colors duration-300">
      <Header 
        theme={theme} 
        setTheme={setTheme} 
        onLogout={handleLogout} 
        currentUser={currentUser}
        onOpenComfyModal={() => setIsComfyModalOpen(true)} 
        onOpenHistoryPanel={() => setIsHistoryPanelOpen(true)}
        isComfyUIConnected={isComfyUIConnected}
      />
      
      <main className="container mx-auto p-4 md:p-8 space-y-8">
        {currentUser.role === 'admin' && (
          <div className="flex border-b border-border-primary">
            <button
              onClick={() => setAdminTab('generate')}
              className={`py-2 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none ${
                adminTab === 'generate'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
              }`}
              aria-pressed={adminTab === 'generate'}
            >
              Generate Portraits
            </button>
            <button
              onClick={() => setAdminTab('manage')}
              className={`py-2 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none ${
                adminTab === 'manage'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
              }`}
              aria-pressed={adminTab === 'manage'}
            >
              Manage Users
            </button>
          </div>
        )}

        {currentUser.role === 'user' || (currentUser.role === 'admin' && adminTab === 'generate') ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* --- Left Column: Controls --- */}
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                  <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Image</h2>
                  <div className="space-y-4">
                    <ImageUploader 
                      label={options.provider === 'comfyui' ? "Source Image (to generate prompt)" : "Source Portrait"}
                      id="source-image" 
                      onImageUpload={setSourceImage} 
                      sourceFile={sourceImage}
                    />
                    {options.provider === 'gemini' && options.clothing === 'image' && (
                      <ImageUploader 
                          label="Clothing Reference" 
                          id="clothing-image" 
                          onImageUpload={setClothingImage} 
                          sourceFile={clothingImage}
                      />
                    )}
                    {options.provider === 'gemini' && options.background === 'image' && (
                        <ImageUploader 
                            label="Background Image" 
                            id="background-image" 
                            onImageUpload={setBackgroundImage}
                            sourceFile={backgroundImage}
                        />
                    )}
                  </div>
              </div>
              <OptionsPanel 
                options={options} 
                setOptions={setOptions} 
                setPreviewedBackgroundImage={setPreviewedBackgroundImage}
                onGenerate={handleGenerate}
                onReset={handleReset}
                isDisabled={isLoading || isGeneratingPrompt}
                isReady={isReadyToGenerate}
                onExportWorkflow={handleExportWorkflow}
                isGeneratingPrompt={isGeneratingPrompt}
                comfyUIObjectInfo={comfyUIObjectInfo}
                comfyUIUrl={comfyUIUrl}
              />
            </div>

            {/* --- Right Column: Results --- */}
            <div className="lg:col-span-3 lg:sticky lg:top-24">
              {isLoading ? (
                <div className="flex items-center justify-center min-h-[60vh] bg-bg-secondary rounded-2xl shadow-lg p-8">
                  <Loader message={progressMessage} progress={progressValue} />
                </div>
              ) : error ? (
                <div className="flex items-center justify-center min-h-[60vh] bg-bg-secondary rounded-2xl shadow-lg p-8">
                  <div className="bg-danger-bg text-danger text-center p-6 rounded-lg shadow-lg w-full whitespace-pre-line">
                      <p className="font-bold text-lg">Generation Failed</p>
                      <p className="mt-2">{error}</p>
                  </div>
                </div>
              ) : generatedImages.length > 0 ? (
                <ImageGrid 
                  images={generatedImages} 
                  onSetNewSource={handleSetNewSource} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[60vh] bg-bg-secondary rounded-2xl shadow-lg p-8 text-center text-text-secondary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-24 h-24 text-border-primary mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <h2 className="text-xl font-bold text-text-primary mb-2">Your Gallery Awaits</h2>
                  <p>Configure your options on the left and click "Generate Portraits".</p>
                  <p>Your masterpieces will appear here.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          currentUser.role === 'admin' && adminTab === 'manage' && <AdminPanel />
        )}
      </main>
      
      {isComfyModalOpen && (
        <ComfyUIConnection
          isOpen={isComfyModalOpen}
          onClose={() => setIsComfyModalOpen(false)}
          initialUrl={comfyUIUrl}
          onSaveUrl={handleSetComfyUIUrl}
        />
      )}
      
      {isHistoryPanelOpen && (
        <HistoryPanel
          isOpen={isHistoryPanelOpen}
          onClose={() => setIsHistoryPanelOpen(false)}
          onLoadHistoryItem={handleLoadHistoryItem}
        />
      )}
    </div>
  );
}

export default App;