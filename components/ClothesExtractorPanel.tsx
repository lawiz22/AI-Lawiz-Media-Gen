import React, { useState, useCallback } from 'react';
import { ImageUploader } from './ImageUploader';
import { ResultsDisplay } from './ResultsDisplay';
import { LoadingState } from './LoadingState';
import { ErrorModal } from './ErrorModal';
import type { GeneratedClothing } from '../types';
import { identifyClothing, generateClothingImage } from '../services/geminiService';
import { fileToDataUrl } from '../utils/imageUtils';

interface ClothesExtractorPanelProps {
    selectedFile: File | null;
    setSelectedFile: (file: File | null) => void;
    details: string;
    setDetails: (details: string) => void;
    generatedItems: GeneratedClothing[];
    setGeneratedItems: (items: GeneratedClothing[]) => void;
}

export const ClothesExtractorPanel: React.FC<ClothesExtractorPanelProps> = ({
    selectedFile,
    setSelectedFile,
    details,
    setDetails,
    generatedItems,
    setGeneratedItems
}) => {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  const handleImageSelected = useCallback(async (file: File | null) => {
    if (!file) {
        setSelectedFile(null);
        setOriginalImage(null);
        return;
    }
    setError(null);
    setSelectedFile(file);
    try {
        const dataUrl = await fileToDataUrl(file);
        setOriginalImage(dataUrl);
    } catch (e) {
      setError('Failed to read the image file.');
      setIsLoading(false);
    }
  }, [setSelectedFile]);

  const processImage = useCallback(async () => {
    if (!selectedFile || !originalImage) {
      setError("Please select an image first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedItems([]);

    const base64Image = originalImage.split(',')[1];
    const mimeType = selectedFile.type;

    try {
      setLoadingMessage('Identifying clothing items...');
      const clothingDescriptions = await identifyClothing(base64Image, mimeType, details);
      
      if (!clothingDescriptions || clothingDescriptions.length === 0) {
          throw new Error("Could not identify any clothing items. Please try a clearer image.");
      }

      const allGeneratedItems: GeneratedClothing[] = [];
      const processingErrors: string[] = [];

      const getPlaceholder = (text: string) => {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#374151"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24px" fill="#9ca3af">${text}</text></svg>`;
          return `data:image/svg+xml;base64,${btoa(svg)}`;
      };

      for (let i = 0; i < clothingDescriptions.length; i++) {
        const item = clothingDescriptions[i];
        setLoadingMessage(`Extracting: ${item.name} (${i + 1}/${clothingDescriptions.length})...`);
        
        const laidOutPromise = generateClothingImage(base64Image, mimeType, item.description, 'laid out');
        const foldedPromise = generateClothingImage(base64Image, mimeType, item.description, 'folded');

        const [laidOutResult, foldedResult] = await Promise.allSettled([laidOutPromise, foldedPromise]);

        let laidOutImage: string;
        if (laidOutResult.status === 'fulfilled') {
            laidOutImage = `data:image/png;base64,${laidOutResult.value}`;
        } else {
            console.error(`Failed to generate 'laid out' image for ${item.name}:`, laidOutResult.reason);
            processingErrors.push(`'Laid out' image for "${item.name}" failed.`);
            laidOutImage = getPlaceholder('Generation Failed');
        }

        let foldedImage: string;
        if (foldedResult.status === 'fulfilled') {
            foldedImage = `data:image/png;base64,${foldedResult.value}`;
        } else {
            console.error(`Failed to generate 'folded' image for ${item.name}:`, foldedResult.reason);
            processingErrors.push(`'Folded' image for "${item.name}" failed.`);
            foldedImage = getPlaceholder('Generation Failed');
        }
        
        allGeneratedItems.push({
          name: item.name,
          laidOutImage,
          foldedImage,
        });
        
        setGeneratedItems([...allGeneratedItems]);
      }
      
      if (processingErrors.length > 0) {
          const errorMsg = `Some images could not be generated and are shown as placeholders:\n• ${processingErrors.join('\n• ')}`;
          setError(errorMsg);
          setIsErrorModalOpen(true);
      }

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to process image. ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [selectedFile, originalImage, details, setGeneratedItems]);

  const handleReset = () => {
    setOriginalImage(null);
    setSelectedFile(null);
    setGeneratedItems([]);
    setError(null);
    setIsLoading(false);
    setDetails('');
  };

  const handleImageChange = () => {
    setOriginalImage(null);
    setSelectedFile(null);
  };

  return (
    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
      {!isLoading && generatedItems.length === 0 && (
          <div className="max-w-3xl mx-auto">
            {!originalImage ? (
                <div>
                    <h2 className="text-2xl font-semibold text-center text-text-primary mb-2">Upload an Image to Begin</h2>
                    <p className="text-center text-text-secondary mb-6">
                        Let AI transform your fashion photos into professional e-commerce product shots.
                    </p>
                    <ImageUploader onImageUpload={handleImageSelected} disabled={isLoading} id="clothes-extractor-upload" label="" />
                </div>
            ) : (
                <div className="text-center">
                    <h3 className="text-xl font-semibold text-text-primary mb-4">Image Preview</h3>
                    <img src={originalImage} alt="Selected for processing" className="rounded-xl shadow-lg w-full max-w-lg mx-auto mb-4" />
                </div>
            )}
            
            <div className="mt-6">
              <label htmlFor="clothing-details" className="block text-sm font-medium text-text-secondary">
                  Clothing Details (Optional)
              </label>
              <textarea
                  id="clothing-details"
                  rows={4}
                  className="mt-1 block w-full rounded-md border-border-primary shadow-sm focus:border-accent focus:ring-accent sm:text-sm text-text-primary placeholder-text-muted bg-bg-tertiary"
                  placeholder="e.g., The shirt is a navy blue Prada polo made of cotton. The pants are beige wool trousers."
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  disabled={isLoading}
              />
              <p className="mt-2 text-xs text-text-muted">
                  Help the AI be more accurate. Describe materials, colors, brands, or hidden details.
              </p>
            </div>
            <div className="mt-8 flex items-center justify-center gap-4">
                {originalImage && (
                    <button
                        onClick={handleImageChange}
                        className="bg-bg-tertiary text-text-secondary font-semibold py-2 px-5 border border-border-primary rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                    >
                        Change Image
                    </button>
                )}
                <button
                    onClick={processImage}
                    disabled={!selectedFile || isLoading}
                    className="px-8 py-3 bg-accent text-accent-text font-bold text-lg rounded-lg shadow-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-light disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300"
                >
                    Start Extraction
                </button>
            </div>
            {error && !isLoading && (
                <div className="text-center max-w-2xl mx-auto my-10 p-6 bg-danger-bg border border-danger rounded-lg">
                    <h3 className="text-xl font-semibold text-danger">An Error Occurred</h3>
                    <p className="text-danger mt-2" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>
                    <button
                        onClick={handleReset}
                        className="mt-6 bg-danger text-white font-bold py-2 px-6 rounded-lg hover:opacity-80 transition-opacity"
                    >
                        Try Again
                    </button>
                </div>
            )}
          </div>
        )}

      {isLoading && <LoadingState message={loadingMessage} />}
      
      {!isLoading && generatedItems.length > 0 && originalImage && (
        <ResultsDisplay 
          originalImage={originalImage}
          generatedItems={generatedItems}
          onReset={handleReset}
          details={details}
        />
      )}

      {isErrorModalOpen && error && (
          <ErrorModal
              title="Processing Notes"
              message={error}
              onClose={() => {
                  setIsErrorModalOpen(false);
                  setError(null);
              }}
          />
      )}
    </div>
  );
};