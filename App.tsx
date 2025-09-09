import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Login } from './components/Login';
import { ImageUploader } from './components/ImageUploader';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { AdminPanel } from './components/AdminPanel';
import { Loader } from './components/Loader';
import type { GenerationOptions, User } from './types';
import { authenticateUser } from './services/cloudUserService';
import { generatePortraitSeries } from './services/geminiService';
import { PHOTO_STYLE_OPTIONS, IMAGE_STYLE_OPTIONS, ASPECT_RATIO_OPTIONS } from './constants';

const initialOptions: GenerationOptions = {
  numImages: 4,
  background: 'gray',
  aspectRatio: ASPECT_RATIO_OPTIONS[0].value,
  customBackground: '',
  consistentBackground: false,
  clothing: 'original',
  customClothingPrompt: '',
  poseMode: 'random',
  poseSelection: [],
  photoStyle: PHOTO_STYLE_OPTIONS[0].value,
  imageStyle: IMAGE_STYLE_OPTIONS[0].value,
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
  const [progressMessage, setProgressMessage] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [adminTab, setAdminTab] = useState<'generate' | 'manage'>('generate');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const isReadyToGenerate = sourceImage && (
    (options.clothing !== 'image' || clothingImage) &&
    (options.background !== 'image' || backgroundImage)
  );

  const handleLogin = async (username: string, password: string): Promise<string | true> => {
    const user = await authenticateUser(username, password);
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem('currentUser', JSON.stringify(user));
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

  const handleGenerate = async () => {
    if (!isReadyToGenerate) {
      setError("Please ensure all required images are uploaded.");
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
      const images = await generatePortraitSeries(
        sourceImage!,
        clothingImage,
        backgroundImage,
        previewedBackgroundImage,
        options,
        onProgress
      );
      setGeneratedImages(images);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during image generation.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary font-sans transition-colors duration-300">
      <Header theme={theme} setTheme={setTheme} onLogout={handleLogout} currentUser={currentUser} />
      
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
                  <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Images</h2>
                  <div className="space-y-4">
                    <ImageUploader 
                      label="Source Portrait" 
                      id="source-image" 
                      onImageUpload={setSourceImage} 
                      sourceFile={sourceImage}
                    />
                    {options.clothing === 'image' && (
                      <ImageUploader 
                          label="Clothing Reference" 
                          id="clothing-image" 
                          onImageUpload={setClothingImage} 
                          sourceFile={clothingImage}
                      />
                    )}
                    {options.background === 'image' && (
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
                isDisabled={isLoading}
                isReady={!!isReadyToGenerate}
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
                <ImageGrid images={generatedImages} />
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
    </div>
  );
}

export default App;
