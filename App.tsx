
import React, { useState, useEffect } from 'react';
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
import { exportComfyUIWorkflow, generateComfyUIPortraits, checkConnection as checkComfyUIConnection } from './services/comfyUIService';
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
  comfyModel: '',
  comfySteps: 25,
  comfyCfg: 7,
  comfySampler: 'euler',
  comfyScheduler: 'normal',
  comfyPrompt: '',
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
  const [isComfyUIConnected, setIsComfyUIConnected] = useState<boolean | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const checkComfyStatus = async () => {
      setIsComfyUIConnected(null); // Set to checking state
      const url = localStorage.getItem('comfyui_url');
      if (!url) {
          setIsComfyUIConnected(false);
          return;
      }
      const result = await checkComfyUIConnection(url);
      setIsComfyUIConnected(result.success);
  };

  useEffect(() => {
      if (currentUser) {
          checkComfyStatus();
      }
  }, [currentUser]);

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
      return !!options.comfyModel && !!options.comfyPrompt?.trim();
    }
    return false;
  })();

  const handleLogin = async (username: string, password: string): Promise<string | true> => {
    const user = await authenticateUser(username, password);
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem('currentUser', JSON.stringify(user));
      // Explicitly trigger the connection check upon successful login.
      // This ensures the status is updated immediately without relying solely on the useEffect,
      // which handles subsequent page loads.
      checkComfyStatus();
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
    if (!isReadyToGenerate || !sourceImage) {
      setError("Please ensure a source image and all required options are set.");
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
        images = await generatePortraitSeries(
          sourceImage,
          clothingImage,
          backgroundImage,
          previewedBackgroundImage,
          options,
          onProgress
        );
      }
      setGeneratedImages(images);

      // Save to history on success, with resized images to avoid storage limit
      onProgress("Saving to history...", 0.98);
      
      const sourceImageDataUrl = await fileToResizedDataUrl(sourceImage, 1024);
      const generatedThumbnails = await Promise.all(
        images.map(imgDataUrl => dataUrlToThumbnail(imgDataUrl, 256))
      );

      const historyItem: Omit<HistoryItem, 'id'> = {
        timestamp: new Date().toISOString(),
        sourceImage: sourceImageDataUrl,
        options,
        generatedImages: generatedThumbnails,
      };
      saveGenerationToHistory(historyItem);

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
  
  const handleComfyModalClose = () => {
    setIsComfyModalOpen(false);
    checkComfyStatus();
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
                  <div className="bg-danger-bg text-danger text-center p-6 rounded-lg shadow-lg w-full">
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
          onClose={handleComfyModalClose}
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
