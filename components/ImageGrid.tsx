import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { DownloadIcon, EnhanceIcon, SpinnerIcon, ZoomIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { enhanceImageResolution } from '../services/geminiService';

interface ImageGridProps {
  images: string[];
}

export const ImageGrid: React.FC<ImageGridProps> = ({ images }) => {
  const [enhancedImages, setEnhancedImages] = useState<Record<number, string>>({});
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);
  const [errorIndex, setErrorIndex] = useState<Record<number, string>>({});
  const [zoomedImageIndex, setZoomedImageIndex] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const handleDownload = (imageSrc: string, index: number) => {
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `portrait-${index + 1}${enhancedImages[index] ? '-enhanced' : ''}.jpeg`;
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
    } catch (err: any) {
        console.error("Enhancement failed:", err);
        setErrorIndex(prev => ({ ...prev, [index]: err.message || 'Failed to enhance image.' }));
    } finally {
        setEnhancingIndex(null);
    }
  };

  const handleDownloadAll = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      images.forEach((src, index) => {
        const finalSrc = enhancedImages[index] || src;
        const base64Data = finalSrc.split(',')[1];
        if (base64Data) {
          const fileName = `portrait-${index + 1}${enhancedImages[index] ? '-enhanced' : ''}.jpeg`;
          zip.file(fileName, base64Data, { base64: true });
        }
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'LAWIZ-portraits.zip';
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
              <h2 className="text-xl font-bold text-accent">3. Generated Portraits</h2>
              <button
                onClick={handleDownloadAll}
                disabled={isZipping || images.length === 0}
                className="flex items-center justify-center gap-2 border-2 border-accent text-accent font-semibold py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-text transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait"
              >
                  {isZipping ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DownloadIcon className="w-5 h-5" />}
                  {isZipping ? 'Zipping...' : 'Download All (.zip)'}
              </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {images.map((src, index) => {
                  const isEnhancing = enhancingIndex === index;
                  const finalSrc = enhancedImages[index] || src;
                  const hasError = !!errorIndex[index];

                  return (
                      <div key={index} className="group relative aspect-w-1 aspect-h-1 bg-bg-tertiary rounded-lg overflow-hidden shadow-md">
                          <img src={finalSrc} alt={`Generated Portrait ${index + 1}`} className="object-cover w-full h-full" />
                          
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
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
          <img 
            src={currentZoomedSrc} 
            alt={`Zoomed portrait ${zoomedImageIndex + 1}`} 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()} // Prevent closing modal when clicking on image
          />
          <button
            onClick={handleCloseZoom}
            className="absolute top-4 right-4 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
            aria-label="Close zoomed image"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
          
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
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-bg-secondary/80 backdrop-blur-sm p-3 rounded-full shadow-lg"
            onClick={e => e.stopPropagation()}
            role="toolbar"
            aria-label="Image actions"
          >
            <button
                onClick={() => handleDownload(currentZoomedSrc, zoomedImageIndex)}
                title="Download Image"
                aria-label="Download this image"
                className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
            >
                <DownloadIcon className="w-6 h-6" />
            </button>

            {enhancingIndex === zoomedImageIndex ? (
                <div className="p-3 rounded-full text-text-primary" aria-label="Enhancing image quality">
                    <SpinnerIcon className="w-6 h-6 animate-spin" />
                </div>
            ) : !enhancedImages[zoomedImageIndex] && (
                <button
                    onClick={() => handleEnhance(images[zoomedImageIndex], zoomedImageIndex)}
                    disabled={enhancingIndex !== null}
                    title="Enhance Quality"
                    aria-label="Enhance image quality"
                    className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <EnhanceIcon className="w-6 h-6" />
                </button>
            )}
          </div>

        </div>
      )}
    </>
  );
};