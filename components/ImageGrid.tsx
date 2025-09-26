
import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { DownloadIcon, EnhanceIcon, SpinnerIcon, ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, AddAsSourceIcon, CopyIcon, SaveIcon, CheckIcon, CharacterIcon } from './icons';
import { enhanceImageResolution } from '../services/geminiService';
import { saveToLibrary } from '../services/libraryService';
import type { GenerationOptions, LibraryItem } from '../types';
// Fix: Import the missing `dataUrlToFile` utility function.
import { fileToResizedDataUrl, dataUrlToThumbnail, getImageDimensionsFromDataUrl, dataUrlToFile } from '../utils/imageUtils';

/**
 * Creates a simple, readable description of the character generation settings.
 * @param options The generation options used.
 * @returns A string like "random pose; clothing original; bg natural studio; photorealistic".
 */
const generateCharacterDescription = (options: GenerationOptions): string => {
    const parts = [];
    // Pose
    parts.push(`${options.poseMode} pose`);
    
    // Fix: Explicitly type `clothing` as `string` to allow assigning a descriptive string. This resolves a TypeScript error where the variable was inferred as the strict literal type `ClothingMode`.
    let clothing: string = options.clothing;
    if ((clothing === 'prompt' || clothing === 'random') && options.customClothingPrompt) {
         clothing = `'${options.customClothingPrompt.substring(0, 15).trim()}...'`;
    }
    parts.push(`clothing ${clothing}`);
    
    // Fix: Explicitly type `bg` as `string` to allow assigning a descriptive string. This resolves a TypeScript error where the variable was inferred as the strict literal type `BackgroundMode`.
    let bg: string = options.background;
    if ((bg === 'prompt' || bg === 'random') && options.customBackground) {
        bg = `'${options.customBackground.substring(0, 15).trim()}...'`;
    }
    parts.push(`bg ${bg}`);
    
    // Style
    parts.push(options.imageStyle);
    
    return parts.join('; ');
};

const sanitizeForFilename = (text: string, maxLength: number = 40): string => {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/\s+/g, '_') // replace spaces with underscores
        .replace(/[^a-z0-9_]/g, '') // remove all other invalid characters
        .replace(/__+/g, '_') // collapse multiple underscores
        .replace(/^_+|_+$/g, '') // trim underscores from start/end
        .substring(0, maxLength);
};


interface ImageGridProps {
  images: string[];
  onSendToI2I: (imageData: string) => void;
  onSendToCharacter: (imageData: string) => void;
  lastUsedPrompt?: string | null;
  options: GenerationOptions;
  sourceImage: File | null;
  characterName?: string;
  activeTab: string;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ images, onSendToI2I, onSendToCharacter, lastUsedPrompt, options, sourceImage, characterName, activeTab }) => {
  const [enhancedImages, setEnhancedImages] = useState<Record<number, string>>({});
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);
  const [errorIndex, setErrorIndex] = useState<Record<number, string>>({});
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy');
  const [savingState, setSavingState] = useState<Record<number, 'idle' | 'saving' | 'saved'>>({});

  // This useEffect hook is crucial. It resets all the local state related to a specific
  // set of images whenever a *new* set of images is passed in from a new generation.
  // This prevents old enhanced images, errors, or save states from persisting incorrectly.
  useEffect(() => {
    setEnhancedImages({});
    setEnhancingIndex(null);
    setErrorIndex({});
    setSavingState({});
  }, [images]);

  const handleDownload = (imageSrc: string, index: number) => {
    const link = document.createElement('a');
    link.href = imageSrc;
    
    let baseName = '';
    if (activeTab === 'character-generator' && characterName) {
        baseName = sanitizeForFilename(characterName);
    } else if (lastUsedPrompt) {
        const promptSnippet = lastUsedPrompt.split(/\s+/).slice(0, 5).join(' ');
        baseName = sanitizeForFilename(promptSnippet);
    }
    if (!baseName) { baseName = 'generated_image'; }

    const isEnhanced = !!enhancedImages[index];
    const enhancedTag = isEnhanced ? '_enhanced' : '';
    const randomPart = Math.random().toString(36).substring(2, 7);
    
    link.download = `${baseName}_${index + 1}${enhancedTag}_${randomPart}.jpeg`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEnhance = async (imageSrc: string, index: number) => {
    setEnhancingIndex(index);
    setErrorIndex(prev => ({ ...prev, [index]: '' }));
    try {
        const enhancedSrc = await enhanceImageResolution(imageSrc);
        setEnhancedImages(prev => ({...prev, [index]: enhancedSrc}));
        // Fix: Reset the save state for this image slot because the enhanced
        // image is a new, unsaved entity, allowing it to be saved.
        setSavingState(prev => ({ ...prev, [index]: 'idle' }));
    } catch (err: any) {
        console.error("Enhancement failed:", err);
        setErrorIndex(prev => ({ ...prev, [index]: err.message || 'Failed to enhance image.' }));
    } finally {
        setEnhancingIndex(null);
    }
  };
  
  const handleSaveToLibrary = async (imageSrc: string, index: number) => {
    setSavingState(prev => ({ ...prev, [index]: 'saving' }));
    try {
      const isEnhanced = !!enhancedImages[index];
      const { width, height } = await getImageDimensionsFromDataUrl(imageSrc);
      const isCharacter = activeTab === 'character-generator';

      let optionsToSave: Partial<GenerationOptions>;
      let itemName: string | undefined;
      let sourceImageToSave: File | null = sourceImage;
      
      // Determine if the generation was Text-to-Image to prevent saving a lingering source image from a previous run.
      const isGeminiT2I = options.provider === 'gemini' && options.geminiMode === 't2i';
      
      // An i2i workflow requires a source image. If the model type is one of these, it's i2i.
      const comfyI2IWorkflows: (GenerationOptions['comfyModelType'])[] = ['nunchaku-kontext-flux', 'face-detailer-sd1.5'];
      const isComfyT2I = options.provider === 'comfyui' && !comfyI2IWorkflows.includes(options.comfyModelType);

      if (isEnhanced) {
        optionsToSave = {
            provider: 'gemini',
            width,
            height,
            comfyPrompt: 'This image was enhanced using the gemini-2.5-flash-image-preview model.',
        };
        const baseName = characterName || (isCharacter ? `Character #${index + 1}` : `Image #${index + 1}`);
        itemName = `${baseName} (Enhanced)`;

        // For an enhanced T2I image, its "source" is the image *before* enhancement.
        // For an enhanced I2I image, its "source" is the original I2I input image.
        if (!sourceImage) { // If original had no source, it was T2I.
            sourceImageToSave = await dataUrlToFile(images[index], 't2i_source.jpeg');
        } else {
            sourceImageToSave = sourceImage; // Keep the original I2I source.
        }
      } else {
        // This is a normal, non-enhanced generation.
        optionsToSave = { ...options, width, height };
        if (isCharacter) {
          const description = generateCharacterDescription(optionsToSave as GenerationOptions);
          itemName = `${characterName || 'Character'}: ${description}`;
        }
        
        // If it's T2I, ensure no source image is saved.
        if (isGeminiT2I || isComfyT2I) {
            sourceImageToSave = null;
        }
      }

      const item: Omit<LibraryItem, 'id'> = {
        mediaType: isCharacter ? 'character' : 'image',
        media: imageSrc,
        thumbnail: await dataUrlToThumbnail(imageSrc, 256),
        options: optionsToSave as GenerationOptions,
        sourceImage: sourceImageToSave ? await fileToResizedDataUrl(sourceImageToSave, 512) : undefined,
        name: itemName,
      };

      await saveToLibrary(item);
      setSavingState(prev => ({ ...prev, [index]: 'saved' }));
    } catch (err: any) {
      console.error("Failed to save to library:", err);
      setSavingState(prev => ({ ...prev, [index]: 'idle' })); // Allow retry on error
    }
  };

  const handleSendToI2I = () => {
      if (zoomedImageIndex !== null && currentZoomedSrc) {
        onSendToI2I(currentZoomedSrc);
        handleCloseZoom();
      }
    };

    const handleSendToCharacter = () => {
      if (zoomedImageIndex !== null && currentZoomedSrc) {
        onSendToCharacter(currentZoomedSrc);
        handleCloseZoom();
      }
    };

  const handleDownloadAll = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      
      let baseName = '';
      if (activeTab === 'character-generator' && characterName) {
          baseName = sanitizeForFilename(characterName);
      } else if (lastUsedPrompt) {
          const promptSnippet = lastUsedPrompt.split(/\s+/).slice(0, 5).join(' ');
          baseName = sanitizeForFilename(promptSnippet);
      }
      if (!baseName) { baseName = 'generated_images'; }
      const zipBaseName = baseName;

      images.forEach((src, index) => {
        const finalSrc = enhancedImages[index] || src;
        const base64Data = finalSrc.split(',')[1];
        if (base64Data) {
          const isEnhanced = !!enhancedImages[index];
          const enhancedTag = isEnhanced ? '_enhanced' : '';
          const fileName = `${zipBaseName}_${index + 1}${enhancedTag}.jpeg`;
          zip.file(fileName, base64Data, { base64: true });
        }
      });
      
      const randomPart = Math.random().toString(36).substring(2, 7);
      const zipFilename = `lawiz_${zipBaseName}_${randomPart}.zip`;

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("Failed to create zip file:", err);
    } finally {
      setIsZipping(false);
    }
  };
  
  const handleCopyPrompt = () => {
    if (!lastUsedPrompt) return;
    navigator.clipboard.writeText(lastUsedPrompt)
      .then(() => {
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy'), 2000);
      })
      .catch(err => {
        console.error('Failed to copy prompt:', err);
      });
  };
  
  const handleOpenZoom = (index: number) => setZoomedImageIndex(index);
  const handleCloseZoom = useCallback(() => setZoomedImageIndex(null), []);

  const handleNextImage = useCallback(() => {
    if (zoomedImageIndex !== null && images.length > 1) {
      setZoomedImageIndex(prev => (prev! + 1) % images.length);
    }
  }, [zoomedImageIndex, images.length]);

  const handlePrevImage = useCallback(() => {
    if (zoomedImageIndex !== null && images.length > 1) {
      setZoomedImageIndex(prev => (prev! - 1 + images.length) % images.length);
    }
  }, [zoomedImageIndex, images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (zoomedImageIndex === null) return;
      switch(e.key) {
        case 'Escape':
          handleCloseZoom();
          break;
        case 'ArrowRight':
          handleNextImage();
          break;
        case 'ArrowLeft':
          handlePrevImage();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedImageIndex, handleCloseZoom, handleNextImage, handlePrevImage]);
  
  if (images.length === 0) {
    return null;
  }

  const currentZoomedSrc = zoomedImageIndex !== null ? (enhancedImages[zoomedImageIndex] || images[zoomedImageIndex]) : null;

  return (
    <>
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold text-accent">3. Generated Content</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDownloadAll}
                  disabled={isZipping || images.length === 0}
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                  className="flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg hover:opacity-80 transition-opacity duration-200 disabled:opacity-50 disabled:cursor-wait"
                >
                    {isZipping ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DownloadIcon className="w-5 h-5" />}
                    {isZipping ? 'Zipping...' : 'Download All (.zip)'}
                </button>
              </div>
          </div>

          {lastUsedPrompt && (
            <div className="mb-6">
              <label htmlFor="final-prompt" className="block text-sm font-medium text-text-secondary mb-1">Final Prompt Used</label>
              <div className="relative">
                <textarea
                  id="final-prompt"
                  readOnly
                  value={lastUsedPrompt}
                  className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-xs text-text-secondary focus:ring-accent focus:border-accent"
                  rows={3}
                />
                <button 
                  onClick={handleCopyPrompt}
                  title="Copy Prompt"
                  className="absolute top-2 right-2 flex items-center gap-1.5 bg-bg-primary/80 backdrop-blur-sm text-text-secondary text-xs font-semibold py-1 px-2 rounded-full hover:bg-accent hover:text-accent-text transition-colors duration-200 shadow"
                >
                  <CopyIcon className="w-3 h-3" />
                  {copyButtonText}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {images.map((src, index) => {
                  const isEnhancing = enhancingIndex === index;
                  const finalSrc = enhancedImages[index] || src;
                  const hasError = !!errorIndex[index];
                  const savingStatus = savingState[index] || 'idle';

                  return (
                      <div key={index} className="group relative aspect-w-1 aspect-h-1 bg-bg-tertiary rounded-lg overflow-hidden shadow-md">
                          <img src={finalSrc} alt={`Generated Content ${index + 1}`} className="object-cover w-full h-full" />
                          
                          {/* Unified hover overlay for all actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="relative w-full h-full p-2">
                                  {/* Save to Library Button (Top Right) */}
                                  <div className="absolute top-2 right-2">
                                      <button
                                          onClick={() => handleSaveToLibrary(finalSrc, index)}
                                          title={savingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                          disabled={savingStatus !== 'idle'}
                                          className={`p-2 rounded-full transition-all duration-200 ${
                                              savingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                              savingStatus === 'saving' ? 'bg-bg-secondary text-text-secondary cursor-wait' :
                                              'bg-bg-secondary/70 text-text-secondary hover:bg-accent hover:text-accent-text'
                                          }`}
                                      >
                                          {savingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : savingStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                      </button>
                                  </div>

                                  {/* Main Action Buttons (Centered) */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                      {isEnhancing ? (
                                          <div className="text-center text-white">
                                              <SpinnerIcon className="w-8 h-8 animate-spin mx-auto mb-2" />
                                              <p className="text-sm font-semibold">Enhancing...</p>
                                          </div>
                                      ) : hasError ? (
                                          <div className="text-center text-danger p-2">
                                              <p className="text-sm font-bold">Enhance Failed</p>
                                              <p className="text-xs mt-1">{errorIndex[index]}</p>
                                          </div>
                                      ) : (
                                          <div className="flex items-center gap-2">
                                              <button
                                                  onClick={() => handleOpenZoom(index)}
                                                  title="Zoom In"
                                                  className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                              >
                                                  <ZoomIcon className="w-5 h-5" />
                                              </button>
                                              <button
                                                  onClick={() => handleDownload(finalSrc, index)}
                                                  title="Download Image"
                                                  className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                              >
                                                  <DownloadIcon className="w-5 h-5" />
                                              </button>
                                              {!enhancedImages[index] && (
                                                  <button
                                                      onClick={() => handleEnhance(src, index)}
                                                      disabled={enhancingIndex !== null}
                                                      title="Enhance Quality"
                                                      className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                  >
                                                      <EnhanceIcon className="w-5 h-5" />
                                                  </button>
                                              )}
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>
      
      {zoomedImageIndex !== null && currentZoomedSrc && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Zoomed image view"
          onClick={handleCloseZoom}
        >
          <div 
            className="relative"
            onClick={e => e.stopPropagation()} // Prevent closing modal when clicking on image wrapper
          >
            <img 
              src={currentZoomedSrc} 
              alt={`Zoomed content ${zoomedImageIndex + 1}`} 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleCloseZoom(); }}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition-colors z-10"
              aria-label="Close zoomed image"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                aria-label="Previous image"
              >
                <ChevronLeftIcon className="w-8 h-8" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                aria-label="Next image"
              >
                <ChevronRightIcon className="w-8 h-8" />
              </button>
            </>
          )}

          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-bg-secondary/80 backdrop-blur-sm p-2 rounded-full shadow-lg"
            onClick={e => e.stopPropagation()}
            role="toolbar"
            aria-label="Image actions"
          >
            {activeTab === 'image-generator' ? (
                <>
                    <button
                        onClick={handleSendToI2I}
                        title="Use in Image-to-Image"
                        aria-label="Use this image for a new image-to-image generation"
                        className="flex items-center gap-2 px-3 py-2 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors text-xs font-semibold"
                    >
                        <AddAsSourceIcon className="w-4 h-4" />
                        <span>Use in I2I</span>
                    </button>
                    <button
                        onClick={handleSendToCharacter}
                        title="Use for new character"
                        aria-label="Use this image as the source for a new character"
                        className="flex items-center gap-2 px-3 py-2 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors text-xs font-semibold"
                    >
                        <CharacterIcon className="w-4 h-4" />
                        <span>Use for Character</span>
                    </button>
                </>
            ) : (
                <button
                    onClick={handleSendToCharacter}
                    title="Set as New Character Source"
                    aria-label="Use this image as the new source for character variations"
                    className="flex items-center gap-2 px-3 py-2 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors text-xs font-semibold"
                >
                    <AddAsSourceIcon className="w-4 h-4" />
                    <span>Set as New Character</span>
                </button>
            )}

            <div className="w-px h-5 bg-border-primary/50"></div>

            <button
                onClick={() => handleDownload(currentZoomedSrc, zoomedImageIndex)}
                title="Download Image"
                aria-label="Download this image"
                className="p-2 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
            >
                <DownloadIcon className="w-5 h-5" />
            </button>

            {enhancingIndex === zoomedImageIndex ? (
                <div className="p-2 rounded-full text-text-primary" aria-label="Enhancing image quality">
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                </div>
            ) : !enhancedImages[zoomedImageIndex] && (
                <button
                    onClick={() => handleEnhance(images[zoomedImageIndex], zoomedImageIndex)}
                    disabled={enhancingIndex !== null}
                    title="Enhance Quality"
                    aria-label="Enhance image quality"
                    className="p-2 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors disabled:opacity-50"
                >
                    <EnhanceIcon className="w-5 h-5" />
                </button>
            )}
          </div>

        </div>
      )}
    </>
  );
};
