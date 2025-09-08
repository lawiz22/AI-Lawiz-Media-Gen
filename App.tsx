import React, { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { OptionsPanel } from './components/OptionsPanel';
import { ImageGrid } from './components/ImageGrid';
import { Loader } from './components/Loader';
import { ImageUploader } from './components/ImageUploader';
import { generatePortraitSeries } from './services/geminiService';
import type { GenerationOptions } from './types';
import { CloseIcon, DownloadIcon } from './components/icons';

const App: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [options, setOptions] = useState<GenerationOptions>({
    numImages: 12,
    background: 'black',
  });

  const handleGenerate = useCallback(async () => {
    if (!sourceImage) {
      setError('Please upload a source image first.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImages([]);
    setProgress(0);

    try {
      const images = await generatePortraitSeries(
        sourceImage,
        options,
        (currentStep) => {
          setStatusMessage(`Generating image ${currentStep} of ${options.numImages}...`);
          setProgress(currentStep / options.numImages);
        }
      );
      setGeneratedImages(images);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during image generation.');
      console.error(err);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  }, [sourceImage, options]);
  
  const resetState = () => {
    setSourceImage(null);
    setGeneratedImages([]);
    setIsLoading(false);
    setStatusMessage('');
    setProgress(0);
    setError(null);
    setOptions({
        numImages: 12,
        background: 'black',
    });
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

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col">
      <Header />
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-1/3 xl:w-1/4 flex flex-col gap-6">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-cyan-400">1. Upload Image</h2>
                <div className="space-y-4">
                    <ImageUploader 
                        label="Source Image"
                        onImageUpload={setSourceImage}
                        id="source-uploader"
                    />
                </div>
            </div>
            
            <OptionsPanel
              options={options}
              setOptions={setOptions}
              onGenerate={handleGenerate}
              onReset={resetState}
              isDisabled={isLoading}
              isReady={!!sourceImage}
            />
          </aside>

          <section className="w-full lg:w-2/3 xl:w-3/4 bg-gray-800 p-6 rounded-2xl shadow-lg min-h-[60vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-cyan-400">3. Generated Portraits</h2>
              {generatedImages.length > 0 && !isLoading && (
                  <button onClick={handleDownloadAll} className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 text-cyan-300 font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                      <DownloadIcon className="w-4 h-4" />
                      Download All as ZIP
                  </button>
              )}
            </div>
            <div className="flex-grow flex items-center justify-center">
              {isLoading ? (
                <Loader message={statusMessage} progress={progress} />
              ) : error ? (
                <div className="text-center text-red-400 bg-red-900/20 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">Generation Failed</h3>
                  <p>{error}</p>
                </div>
              ) : generatedImages.length > 0 ? (
                <ImageGrid images={generatedImages} onZoom={setZoomedImage} />
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
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={zoomedImage} alt="Zoomed view" className="object-contain w-full h-full rounded-lg shadow-2xl" />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-2 hover:bg-gray-700 transition-colors"
              aria-label="Close zoomed image"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;