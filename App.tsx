import React, { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ImageUploader } from './components/ImageUploader';
import { generatePortraitSeries, enhanceImageResolution } from './services/geminiService';
import type { GenerationOptions } from './types';
import { CloseIcon, DownloadIcon, SpinnerIcon, GenerateIcon } from './components/icons';

const App: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [clothingImage, setClothingImage] = useState<File | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Single image zoom/enhance state
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // Bulk enhancement state
  const [isEnhancingAll, setIsEnhancingAll] = useState<boolean>(false);
  const [enhancementResults, setEnhancementResults] = useState<Record<number, string>>({});
  const [enhancementProgress, setEnhancementProgress] = useState<number>(0);
  const [enhancementStatus, setEnhancementStatus] = useState<string>('');
  const [enhancementError, setEnhancementError] = useState<string | null>(null);


  const [options, setOptions] = useState<GenerationOptions>({
    numImages: 12,
    background: 'black',
    aspectRatio: '1:1',
    customBackground: '',
    consistentBackground: false,
    clothing: 'original',
    customClothingPrompt: '',
    randomizeClothing: false,
    poseMode: 'random',
    poseSelection: [],
  });

  const handleGenerate = useCallback(async () => {
    if (!sourceImage) {
      setError('Please upload a source image first.');
      return;
    }
    if (options.clothing === 'image' && !clothingImage) {
      setError('Please upload a clothing image or change the clothing style.');
      return;
    }
    if (options.background === 'image' && !backgroundImage) {
      setError('Please upload a background image or change the background style.');
      return;
    }
    if (options.poseMode === 'select' && options.poseSelection.length === 0) {
      setError('Please select at least one pose or switch to Random Poses mode.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);
    setProgress(0);
    setStatusMessage('Kicking things off...');
    setEnhancementResults({});
    setEnhancementError(null);

    try {
      const images = await generatePortraitSeries(
        sourceImage,
        clothingImage,
        backgroundImage,
        options,
        (message: string, newProgress: number) => {
          setStatusMessage(message);
          setProgress(newProgress);
        }
      );
      setGeneratedImages(images);
    } catch (err: any) {
      let errorMessage = err.message || 'An unknown error occurred during image generation.';
      if (errorMessage.includes("AI returned text instead of an image")) {
        errorMessage = "The AI failed to generate an image for one of the poses and returned text instead. This can sometimes happen with complex requests. Please try again or adjust the options.";
      }
      setError(errorMessage);
      console.error(err);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  }, [sourceImage, clothingImage, backgroundImage, options]);
  
  const resetState = () => {
    setSourceImage(null);
    setClothingImage(null);
    setBackgroundImage(null);
    setGeneratedImages([]);
    setIsLoading(false);
    setStatusMessage('');
    setProgress(0);
    setError(null);
    setOptions({
        numImages: 12,
        background: 'black',
        aspectRatio: '1:1',
        customBackground: '',
        consistentBackground: false,
        clothing: 'original',
        customClothingPrompt: '',
        randomizeClothing: false,
        poseMode: 'random',
        poseSelection: [],
    });
    setEnhancementResults({});
    setIsEnhancingAll(false);
    setEnhancementProgress(0);
    setEnhancementStatus('');
    setEnhancementError(null);
  }

  const dataURLToBlob = (dataURL: string) => {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

  const handleDownloadAll = async () => {
    if (generatedImages.length === 0) return;
    const zip = new JSZip();
    generatedImages.forEach((imgSrc, index) => {
        const blob = dataURLToBlob(imgSrc);
        zip.file(`portrait_${index + 1}.png`, blob);
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'zGenMedia_Portraits.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEnhanceAll = async () => {
    if (generatedImages.length === 0) return;

    setIsEnhancingAll(true);
    setEnhancementError(null);
    setEnhancementProgress(0);
    setEnhancementStatus('Starting enhancement process...');
    const results: Record<number, string> = {};

    try {
        for (let i = 0; i < generatedImages.length; i++) {
            setEnhancementStatus(`Enhancing image ${i + 1} of ${generatedImages.length}...`);
            const enhanced = await enhanceImageResolution(generatedImages[i]);
            results[i] = enhanced;
            setEnhancementResults({ ...results });
            setEnhancementProgress((i + 1) / generatedImages.length);
        }
    } catch (err: any) {
        setEnhancementError(err.message || 'An error occurred during bulk enhancement.');
        console.error(err);
    } finally {
        setIsEnhancingAll(false);
        setEnhancementStatus('');
    }
  };

  const handleDownloadEnhancedZip = async () => {
    const enhancedCount = Object.keys(enhancementResults).length;
    if (enhancedCount === 0) return;

    const zip = new JSZip();
    Object.entries(enhancementResults).forEach(([index, imgSrc]) => {
        const blob = dataURLToBlob(imgSrc);
        zip.file(`enhanced_portrait_${parseInt(index, 10) + 1}.png`, blob);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'zGenMedia_Enhanced_Portraits.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoom = useCallback(async (imageSrc: string) => {
    setZoomedImage(imageSrc);
    setEnhancedImage(null);
    setEnhanceError(null);
    setIsEnhancing(true);

    try {
      const highResImage = await enhanceImageResolution(imageSrc);
      setEnhancedImage(highResImage);
    } catch (err: any) {
      setEnhanceError(err.message || 'An unknown error occurred while enhancing the image.');
      console.error(err);
    } finally {
      setIsEnhancing(false);
    }
  }, []);

  const closeZoom = useCallback(() => {
    setZoomedImage(null);
    setEnhancedImage(null);
    setEnhanceError(null);
  }, []);

  const downloadZoomedImage = useCallback(() => {
    const imageToDownload = enhancedImage || zoomedImage;
    if (imageToDownload) {
      const link = document.createElement('a');
      link.href = imageToDownload;
      link.download = enhancedImage ? 'enhanced_portrait.png' : 'portrait.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [zoomedImage, enhancedImage]);

  const numEnhanced = Object.keys(enhancementResults).length;
  const allAreEnhanced = numEnhanced === generatedImages.length && generatedImages.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col">
      <Header />
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-6">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-cyan-400">1. Upload Image(s)</h2>
                <div className="space-y-4">
                    <ImageUploader 
                        label="Source Image (Subject)"
                        onImageUpload={setSourceImage}
                        id="source-uploader"
                    />
                    {options.clothing === 'image' && (
                        <ImageUploader 
                            label="Clothing Image"
                            onImageUpload={setClothingImage}
                            id="clothing-uploader"
                        />
                    )}
                    {options.background === 'image' && (
                        <ImageUploader
                            label="Background Image"
                            onImageUpload={setBackgroundImage}
                            id="background-uploader"
                        />
                    )}
                </div>
            </div>
            
            <OptionsPanel
              options={options}
              setOptions={setOptions}
              onGenerate={handleGenerate}
              onReset={resetState}
              isDisabled={isLoading || isEnhancingAll}
              isReady={!!sourceImage}
            />
          </aside>

          <section className="w-full lg:w-2/3 xl:w-3/4 bg-gray-800 p-6 rounded-2xl shadow-lg min-h-[60vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-cyan-400">3. Generated Portraits</h2>
              {generatedImages.length > 0 && !isLoading && (
                  <div className="flex items-center gap-2">
                      <button onClick={handleDownloadAll} className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-cyan-300 font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                          <DownloadIcon className="w-4 h-4" />
                          Download All as ZIP
                      </button>
                      {allAreEnhanced ? (
                         <button onClick={handleDownloadEnhancedZip} className="flex items-center gap-2 text-sm bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                            <DownloadIcon className="w-4 h-4" />
                            Download Enhanced ZIP
                        </button>
                      ) : (
                        <button onClick={handleEnhanceAll} disabled={isEnhancingAll} className="flex items-center gap-2 text-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed">
                           {isEnhancingAll ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4" />}
                           {isEnhancingAll ? 'Enhancing...' : 'Enhance All'}
                        </button>
                      )}
                  </div>
              )}
            </div>
            <div className="flex-grow flex items-center justify-center">
              {isLoading ? (
                <Loader message={statusMessage} progress={progress} />
              ) : isEnhancingAll ? (
                <Loader message={enhancementStatus} progress={enhancementProgress} />
              ) : error ? (
                <div className="text-center text-red-400 bg-red-900/20 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Generation Failed</h3>
                  <p>{error}</p>
                </div>
              ) : enhancementError ? (
                <div className="text-center text-red-400 bg-red-900/20 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Enhancement Failed</h3>
                  <p>{enhancementError}</p>
                </div>
              ) : generatedImages.length > 0 ? (
                <ImageGrid images={generatedImages} onZoom={handleZoom} />
              ) : (
                <div className="text-center text-gray-400">
                  <p className="text-lg">Your generated images will appear here.</p>
                  <p className="text-sm">Upload an image and configure the options to get started.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <footer className="text-center p-4 text-gray-500 text-xs">
        <p>Based off of Replicate's flux-kontext-apps/portrait-series. Thank you everyone that supports us on our group (<a href="https://www.facebook.com/groups/alrevolutionmidjourneydalle2stablediffusion" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">join here</a>).</p>
        <p>If you have any issues or want an app of your own make a request on our fb or our socials. We are ©zgenmedia everywhere and blkcosmo.com</p>
      </footer>

      {zoomedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" 
          onClick={closeZoom}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <div className="relative bg-gray-900 rounded-lg shadow-2xl">
              <img 
                src={enhancedImage || zoomedImage} 
                alt="Zoomed view" 
                className="object-contain max-w-[90vw] max-h-[85vh] rounded-lg" 
              />
              
              {isEnhancing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-lg text-white">
                  <SpinnerIcon className="w-12 h-12 text-cyan-400 animate-spin" />
                  <p className="mt-4 font-semibold">Enhancing resolution...</p>
                </div>
              )}

              {enhanceError && !isEnhancing && (
                  <div className="absolute inset-0 bg-red-900/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg p-4 text-center">
                      <p className="text-lg font-semibold text-red-300">Enhancement Failed</p>
                      <p className="text-red-400 text-sm mt-2 max-w-md">{enhanceError}</p>
                  </div>
              )}
            </div>
            
            <button
              onClick={closeZoom}
              className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-2 hover:bg-gray-700 transition-colors shadow-lg"
              aria-label="Close zoomed image"
            >
              <CloseIcon className="w-6 h-6" />
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <button
                  onClick={downloadZoomedImage}
                  disabled={isEnhancing || !zoomedImage}
                  className="flex items-center gap-2 bg-cyan-600 text-white font-bold py-2 px-5 rounded-full hover:bg-cyan-700 transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg"
              >
                  <DownloadIcon className="w-5 h-5"/>
                  Download {enhancedImage ? 'Enhanced' : 'Image'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;