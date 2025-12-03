import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { addSessionTokenUsage } from '../store/appSlice';
import { setImageSaveStatus } from '../store/generationSlice';
import { DownloadIcon, EnhanceIcon, SpinnerIcon, ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, AddAsSourceIcon, CopyIcon, SaveIcon, CheckIcon, CharacterIcon, InfoIcon } from './icons';
import { enhanceImageResolution } from '../services/geminiService';
import type { GenerationOptions, LibraryItem } from '../types';
import { fileToResizedDataUrl, dataUrlToThumbnail, getImageDimensionsFromDataUrl, dataUrlToFile } from '../utils/imageUtils';

const generateCharacterDescription = (options: GenerationOptions): string => {
  const parts = [];
  parts.push(`${options.poseMode} pose`);

  let clothing: string = options.clothing;
  if ((clothing === 'prompt' || clothing === 'random') && options.customClothingPrompt) {
    clothing = `'${options.customClothingPrompt.substring(0, 15).trim()}...'`;
  }
  parts.push(`clothing ${clothing}`);

  let bg: string = options.background;
  if ((bg === 'prompt' || bg === 'random') && options.customBackground) {
    bg = `'${options.customBackground.substring(0, 15).trim()}...'`;
  }
  parts.push(`bg ${bg}`);

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
  images: {
    src: string;
    saved: 'idle' | 'saving' | 'saved';
    seed?: number;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
  }[];
  onSendToI2I: (imageData: string) => void;
  onSendToCharacter: (imageData: string) => void;
  lastUsedPrompt?: string | null;
  options: GenerationOptions;
  sourceImage: File | null;
  characterName?: string;
  activeTab: string;
  generationTime?: number | null;
}

export const ImageGrid: React.FC<ImageGridProps> = ({ images, onSendToI2I, onSendToCharacter, lastUsedPrompt, options, sourceImage, characterName, activeTab, generationTime }) => {
  const dispatch: AppDispatch = useDispatch();
  const [enhancedImages, setEnhancedImages] = useState<Record<number, string>>({});
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);
  const [errorIndex, setErrorIndex] = useState<Record<number, string>>({});
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy');

  useEffect(() => {
    setEnhancedImages({});
    setEnhancingIndex(null);
    setErrorIndex({});
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
      const { enhancedSrc, usageMetadata } = await enhanceImageResolution(imageSrc);
      if (usageMetadata) {
        dispatch(addSessionTokenUsage(usageMetadata));
      }
      setEnhancedImages(prev => ({ ...prev, [index]: enhancedSrc }));
      dispatch(setImageSaveStatus({ tabId: activeTab, index, status: 'idle' }));
    } catch (err: any) {
      console.error("Enhancement failed:", err);
      setErrorIndex(prev => ({ ...prev, [index]: err.message || 'Failed to enhance image.' }));
    } finally {
      setEnhancingIndex(null);
    }
  };

  const handleSaveToLibrary = async (imageSrc: string, index: number) => {
    dispatch(setImageSaveStatus({ tabId: activeTab, index, status: 'saving' }));
    try {
      const isEnhanced = !!enhancedImages[index];
      const { width, height } = await getImageDimensionsFromDataUrl(imageSrc);
      const isCharacter = activeTab === 'character-generator';

      let optionsToSave: Partial<GenerationOptions>;
      let itemName: string | undefined;
      let sourceImageToSave: File | null = sourceImage;

      const isGeminiT2I = options.provider === 'gemini' && options.geminiMode === 't2i';

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

        if (!sourceImage) {
          sourceImageToSave = await dataUrlToFile(images[index].src, 't2i_source.jpeg');
        } else {
          sourceImageToSave = sourceImage;
        }
      } else {
        optionsToSave = { ...options, width, height };
        if (isCharacter) {
          const description = generateCharacterDescription(optionsToSave as GenerationOptions);
          itemName = `${characterName || 'Character'}: ${description}`;
        }

        if (isGeminiT2I || isComfyT2I) {
          sourceImageToSave = null;
        }

        // Propagate the specific seed used for this image if available
        if (images[index].seed !== undefined) {
          optionsToSave.comfySeed = images[index].seed;
          // Ensure seed control is set to fixed so it reproduces exactly
          optionsToSave.comfySeedControl = 'fixed';
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

      await dispatch(addToLibrary(item)).unwrap();
      dispatch(setImageSaveStatus({ tabId: activeTab, index, status: 'saved' }));
    } catch (err: any) {
      console.error("Failed to save to library:", err);
      dispatch(setImageSaveStatus({ tabId: activeTab, index, status: 'idle' }));
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

      images.forEach((image, index) => {
        const finalSrc = enhancedImages[index] || image.src;
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
      switch (e.key) {
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

  const currentZoomedSrc = zoomedImageIndex !== null ? (enhancedImages[zoomedImageIndex] || images[zoomedImageIndex].src) : null;

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
            <label htmlFor="final-prompt" className="block text-sm font-medium text-text-secondary mb-1">
              Final Prompt Used
              {generationTime !== undefined && generationTime !== null && (
                <span className="ml-2 text-text-secondary font-normal normal-case">
                  (took {generationTime.toFixed(2)}s)
                </span>
              )}
            </label>
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
          {images.map((image, index) => {
            const isEnhancing = enhancingIndex === index;
            const finalSrc = enhancedImages[index] || image.src;
            const hasError = !!errorIndex[index];
            const savingStatus = image.saved;
            const { usageMetadata } = image;

            return (
              <div key={index} className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md">
                <img src={finalSrc} alt={`Generated Content ${index + 1}`} className="object-cover w-full h-full" />

                {/* Unified hover overlay for all actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <div className="relative w-full h-full p-2">
                    {/* Save to Library Button (Top Right) */}
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => handleSaveToLibrary(finalSrc, index)}
                        title={savingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                        disabled={savingStatus !== 'idle'}
                        className={`p-2 rounded-full transition-all duration-200 ${savingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' :
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
                              onClick={() => handleEnhance(image.src, index)}
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
                {/* Token Info Display - higher z-index to appear over the hover overlay */}
                {usageMetadata && (
                  <div className="group/tooltip absolute bottom-2 left-2 z-20">
                    <div className="p-1 bg-black/60 rounded-full text-white cursor-help">
                      <InfoIcon className="w-4 h-4" />
                    </div>
                    <div className="absolute bottom-full mb-2 -left-1 w-48 bg-bg-primary p-3 rounded-lg shadow-lg text-xs text-text-secondary opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-30 border border-border-primary">
                      <h5 className="font-bold text-text-primary mb-1">Gemini Token Usage</h5>
                      <p>Prompt Tokens: <span className="font-semibold text-text-primary">{usageMetadata.promptTokenCount}</span></p>
                      <p>Response Tokens: <span className="font-semibold text-text-primary">{usageMetadata.candidatesTokenCount}</span></p>
                      <p className="font-bold mt-1 pt-1 border-t border-border-primary">Total: <span className="text-accent">{usageMetadata.totalTokenCount}</span></p>
                    </div>
                  </div>
                )}
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
                onClick={() => handleEnhance(images[zoomedImageIndex].src, zoomedImageIndex)}
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