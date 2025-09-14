import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getLibraryItems, deleteLibraryItem, clearLibrary } from '../services/libraryService';
import type { LibraryItem, GenerationOptions } from '../types';
import { SpinnerIcon, TrashIcon, LoadIcon, LibraryIcon, CloseIcon, VideoIcon, PhotographIcon, TshirtIcon, CopyIcon } from './icons';

interface LibraryPanelProps {
  onLoadItem: (item: LibraryItem) => void;
}

// --- Helper Functions and Components for Option Display ---

const formatOptionKey = (key: string): string => {
  return key
    .replace(/([A-Z])/g, ' $1') // insert a space before all caps
    .replace(/^./, (str) => str.toUpperCase()); // capitalize the first letter
};

const getRelevantOptionKeys = (options: GenerationOptions, mediaType: 'image' | 'video'): Set<string> => {
    const keys = new Set<string>();
    keys.add('width').add('height');

    if (mediaType === 'image') {
        keys.add('provider');
        keys.add('numImages');
        keys.add('aspectRatio');
        keys.add('imageStyle');

        if (options.imageStyle === 'photorealistic') {
            keys.add('photoStyle');
            keys.add('eraStyle');
        } else {
            keys.add('creativity');
        }

        if (options.addTextToImage) {
            keys.add('addTextToImage');
            keys.add('textOnImagePrompt');
            keys.add('textObjectPrompt');
        }

        if (options.provider === 'gemini') {
            keys.add('geminiMode');
            if (options.geminiMode === 't2i') {
                keys.add('geminiPrompt');
            } else { // i2i
                keys.add('background');
                if (options.background === 'prompt' || options.background === 'random') {
                    keys.add('customBackground');
                    if (options.consistentBackground) keys.add('consistentBackground');
                }
                keys.add('clothing');
                if (options.clothing === 'prompt' || options.clothing === 'random') {
                    keys.add('customClothingPrompt');
                    keys.add('clothingStyleConsistency');
                }
                keys.add('poseMode');
                if (options.poseMode === 'select' || options.poseMode === 'prompt') {
                    keys.add('poseSelection');
                }
            }
        } else if (options.provider === 'comfyui') {
            keys.add('comfyModelType');
            keys.add('comfyPrompt');
            if(options.comfyNegativePrompt) keys.add('comfyNegativePrompt');

            if (options.comfyModelType === 'sd1.5' || options.comfyModelType === 'sdxl' || options.comfyModelType === 'flux') {
                keys.add('comfyModel');
                keys.add('comfySteps');
                keys.add('comfyCfg');
                keys.add('comfySampler');
                keys.add('comfyScheduler');
                if (options.comfyModelType === 'flux') {
                    keys.add('comfyFluxGuidance');
                }
                if (options.comfySdxlUseLora) {
                    keys.add('comfySdxlUseLora');
                    keys.add('comfySdxlLoraName');
                    keys.add('comfySdxlLoraStrength');
                }
            } else if (options.comfyModelType === 'wan2.2') {
                keys.add('comfyWanHighNoiseModel').add('comfyWanLowNoiseModel').add('comfyWanClipModel').add('comfyWanVaeModel').add('comfyWanRefinerStartStep');
                keys.add('comfySteps').add('comfyCfg').add('comfySampler').add('comfyScheduler');
                if (options.comfyWanUseFusionXLora) {
                    keys.add('comfyWanUseFusionXLora').add('comfyWanFusionXLoraStrength').add('comfyWanFusionXLoraName');
                }
                if (options.comfyWanUseLightningLora) {
                    keys.add('comfyWanUseLightningLora').add('comfyWanLightningLoraStrength').add('comfyWanLightningLoraNameHigh').add('comfyWanLightningLoraNameLow');
                }
                if (options.comfyWanUseStockPhotoLora) {
                    keys.add('comfyWanUseStockPhotoLora').add('comfyWanStockPhotoLoraStrength').add('comfyWanStockPhotoLoraNameHigh').add('comfyWanStockPhotoLoraNameLow');
                }
            } else if (options.comfyModelType === 'nunchaku-kontext-flux' || options.comfyModelType === 'nunchaku-flux-image') {
                keys.add('comfyNunchakuModel').add('comfyNunchakuVae').add('comfyNunchakuClipL').add('comfyNunchakuT5XXL');
                keys.add('comfySteps').add('comfyCfg').add('comfySampler').add('comfyScheduler');
                keys.add('comfyFluxGuidanceKontext').add('comfyNunchakuCacheThreshold').add('comfyNunchakuCpuOffload').add('comfyNunchakuAttention');
                if (options.comfyModelType === 'nunchaku-flux-image') {
                  keys.add('comfyNunchakuBaseShift').add('comfyNunchakuMaxShift');
                }
                if (options.comfyNunchakuUseTurboLora) {
                    keys.add('comfyNunchakuUseTurboLora').add('comfyNunchakuTurboLoraName').add('comfyNunchakuTurboLoraStrength');
                }
                if (options.comfyNunchakuUseNudifyLora) {
                    keys.add('comfyNunchakuUseNudifyLora').add('comfyNunchakuNudifyLoraName').add('comfyNunchakuNudifyLoraStrength');
                }
                if (options.comfyNunchakuUseDetailLora) {
                    keys.add('comfyNunchakuUseDetailLora').add('comfyNunchakuDetailLoraName').add('comfyNunchakuDetailLoraStrength');
                }
            } else if (options.comfyModelType === 'flux-krea') {
                keys.add('comfyFluxKreaModel').add('comfyFluxKreaClipT5').add('comfyFluxKreaClipL').add('comfyFluxKreaVae');
                keys.add('comfySteps').add('comfySampler').add('comfyScheduler');
                if (options.useP1x4r0maWomanLora) {
                    keys.add('useP1x4r0maWomanLora').add('p1x4r0maWomanLoraStrength').add('p1x4r0maWomanLoraName');
                }
                if (options.useNippleDiffusionLora) {
                    keys.add('useNippleDiffusionLora').add('nippleDiffusionLoraStrength').add('nippleDiffusionLoraName');
                }
                if (options.usePussyDiffusionLora) {
                    keys.add('usePussyDiffusionLora').add('pussyDiffusionLoraStrength').add('pussyDiffusionLoraName');
                }
                if (options.comfyFluxKreaUseUpscaler) {
                    keys.add('comfyFluxKreaUseUpscaler').add('comfyFluxKreaUpscaleModel').add('comfyFluxKreaDenoise').add('comfyFluxKreaUpscalerSteps');
                }
            }
        }
    } else if (mediaType === 'video') {
        keys.add('videoProvider');

        if (options.videoProvider === 'gemini') {
            keys.add('geminiVidModel');
            keys.add('geminiVidPrompt');
            if (options.geminiVidUseEndFrame) keys.add('geminiVidUseEndFrame');
        } else if (options.videoProvider === 'comfyui') {
            keys.add('comfyVidModelType');
            if (options.comfyVidModelType === 'wan-i2v') {
                keys.add('comfyVidWanI2VHighNoiseModel').add('comfyVidWanI2VLowNoiseModel').add('comfyVidWanI2VClipModel').add('comfyVidWanI2VVaeModel').add('comfyVidWanI2VClipVisionModel');
                keys.add('comfyVidWanI2VSteps').add('comfyVidWanI2VCfg').add('comfyVidWanI2VSampler').add('comfyVidWanI2VScheduler').add('comfyVidWanI2VFrameCount').add('comfyVidWanI2VRefinerStartStep').add('comfyVidWanI2VFrameRate').add('comfyVidWanI2VVideoFormat');
                keys.add('comfyVidWanI2VPositivePrompt').add('comfyVidWanI2VNegativePrompt').add('comfyVidWanI2VWidth').add('comfyVidWanI2VHeight');

                if (options.comfyVidWanI2VUseLightningLora) {
                    keys.add('comfyVidWanI2VUseLightningLora').add('comfyVidWanI2VHighNoiseLora').add('comfyVidWanI2VHighNoiseLoraStrength').add('comfyVidWanI2VLowNoiseLora').add('comfyVidWanI2VLowNoiseLoraStrength');
                }
                if (options.comfyVidWanI2VUseFilmGrain) {
                    keys.add('comfyVidWanI2VUseFilmGrain').add('comfyVidWanI2VFilmGrainIntensity').add('comfyVidWanI2VFilmGrainSize');
                }
                if (options.comfyVidWanI2VUseEndFrame) {
                    keys.add('comfyVidWanI2VUseEndFrame').add('comfyVidWanI2VEndFrameStrength');
                }
            }
        }
    }

    return keys;
};

const isMeaningfulValue = (value: any): boolean => {
    if (value === null || value === undefined || value === false || value === '') {
        return false;
    }
    if (Array.isArray(value) && value.length === 0) {
        return false;
    }
    // Keep 0 as it can be a valid setting (e.g. strength)
    return true;
};


const OptionDisplay: React.FC<{ options: GenerationOptions; mediaType: 'image' | 'video' | 'clothes' }> = ({ options, mediaType }) => {
    // useMemo will prevent re-calculation on every render unless dependencies change
    const filteredOptions = useMemo(() => {
        if (mediaType === 'clothes' || !options) return [];
        
        const relevantKeys = getRelevantOptionKeys(options, mediaType);
        
        return Object.entries(options)
            .filter(([key, value]) => relevantKeys.has(key) && isMeaningfulValue(value))
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)); // Sort alphabetically for consistency
    }, [options, mediaType]);

    if (filteredOptions.length === 0) {
        return <p className="text-xs text-text-muted">No specific options were recorded for this generation.</p>;
    }

    return (
        <div className="text-xs text-text-secondary space-y-1">
            {filteredOptions.map(([key, value]) => (
                <div key={key} className="grid grid-cols-2 gap-2">
                    <span className="font-semibold truncate" title={formatOptionKey(key)}>{formatOptionKey(key)}:</span>
                    <span className="truncate" title={String(value)}>{String(value)}</span>
                </div>
            ))}
        </div>
    );
};


export const LibraryPanel: React.FC<LibraryPanelProps> = ({ onLoadItem }) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');
  const [activeFilter, setActiveFilter] = useState<'all' | 'image' | 'video' | 'clothes'>('all');

  useEffect(() => {
    if (selectedItem) {
        setCopyButtonText('Copy Prompt'); // Reset button text when a new item is selected
    }
  }, [selectedItem]);
  
  const relevantPrompt = useMemo(() => {
    if (!selectedItem || !selectedItem.options) return null;
    const opts = selectedItem.options;
    if (selectedItem.mediaType === 'image') {
        return opts.geminiPrompt || opts.comfyPrompt || null;
    }
    if (selectedItem.mediaType === 'video') {
        return opts.geminiVidPrompt || opts.comfyVidWanI2VPositivePrompt || null;
    }
    return null;
  }, [selectedItem]);

  const handleCopyPrompt = useCallback(() => {
    if (!relevantPrompt) return;
    navigator.clipboard.writeText(relevantPrompt)
        .then(() => {
            setCopyButtonText('Copied!');
            setTimeout(() => setCopyButtonText('Copy Prompt'), 2000);
        })
        .catch(err => {
            console.error('Failed to copy prompt:', err);
        });
  }, [relevantPrompt]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const libraryItems = await getLibraryItems();
      setItems(libraryItems);
    } catch (error) {
      console.error("Failed to load library items:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this item from your library?')) {
      try {
        await deleteLibraryItem(id);
        setItems(prev => prev.filter(item => item.id !== id));
        if (selectedItem?.id === id) {
          setSelectedItem(null);
        }
      } catch (error) {
        console.error("Failed to delete library item:", error);
      }
    }
  };
  
  const handleClearAll = async () => {
     if (window.confirm('Are you sure you want to delete your entire library? This cannot be undone.')) {
        try {
            await clearLibrary();
            setItems([]);
            setSelectedItem(null);
        } catch (error) {
             console.error("Failed to clear library:", error);
        }
    }
  };

  const getCategoryIcon = (mediaType: 'image' | 'video' | 'clothes') => {
      switch(mediaType) {
          case 'image': return <PhotographIcon className="w-4 h-4 text-white" />;
          case 'video': return <VideoIcon className="w-4 h-4 text-white" />;
          case 'clothes': return <TshirtIcon className="w-4 h-4 text-white" />;
          default: return null;
      }
  };

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter(item => item.mediaType === activeFilter);
  }, [items, activeFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <SpinnerIcon className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-accent flex items-center gap-3">
                <LibraryIcon className="w-8 h-8"/>
                My Library
            </h2>
            {items.length > 0 && (
                <button
                    onClick={handleClearAll}
                    className="flex items-center gap-2 bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors"
                >
                    <TrashIcon className="w-5 h-5" /> Clear All
                </button>
            )}
        </div>

        {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-text-secondary p-16">
                <LibraryIcon className="w-20 h-20 text-border-primary mb-4" />
                <h3 className="text-lg font-bold text-text-primary">Your Library is Empty</h3>
                <p>Generated images and videos can be saved here for later use.</p>
            </div>
        ) : (
            <>
                <div className="flex items-center justify-center border-b border-border-primary mb-6">
                    <button onClick={() => setActiveFilter('all')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeFilter === 'all' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        All
                    </button>
                    <button onClick={() => setActiveFilter('image')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeFilter === 'image' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Images
                    </button>
                    <button onClick={() => setActiveFilter('video')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeFilter === 'video' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Videos
                    </button>
                    <button onClick={() => setActiveFilter('clothes')} className={`px-4 py-2 text-sm font-bold transition-colors ${activeFilter === 'clothes' ? 'text-accent border-b-2 border-accent' : 'text-text-secondary'}`}>
                        Clothes
                    </button>
                </div>

                {filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-text-secondary p-16">
                        <LibraryIcon className="w-20 h-20 text-border-primary mb-4" />
                        <h3 className="text-lg font-bold text-text-primary">No Items in this Category</h3>
                        <p className="capitalize">Your saved {activeFilter} will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {filteredItems.map(item => (
                            <div 
                                key={item.id} 
                                className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer"
                                onClick={() => setSelectedItem(item)}
                            >
                                <img src={item.thumbnail} alt={`Library item ${item.id}`} className="object-cover w-full h-full" />
                                <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>
                                    {getCategoryIcon(item.mediaType)}
                                </div>
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center text-white text-xs font-semibold">
                                    <span className="capitalize font-bold text-sm">{item.mediaType}</span>
                                    <span>{new Date(item.id).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        )}

        {selectedItem && (
             <div 
                className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
                role="dialog"
                aria-modal="true"
                aria-labelledby="library-item-title"
                onClick={() => setSelectedItem(null)}
            >
                <div 
                    className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col md:flex-row gap-6 max-h-[90vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex-grow flex flex-col items-center justify-center bg-bg-primary rounded-lg p-2">
                         {selectedItem.mediaType === 'image' && (
                            <img src={selectedItem.media} alt="Selected library item" className="max-w-full max-h-full object-contain rounded-md" />
                         )}
                         {selectedItem.mediaType === 'video' && (
                            <video src={selectedItem.media} controls autoPlay loop className="max-w-full max-h-full object-contain rounded-md" />
                         )}
                         {selectedItem.mediaType === 'clothes' && (() => {
                            let mediaContent;
                            try {
                                // Try to parse as JSON for old items (which stored both images)
                                const media = JSON.parse(selectedItem.media);
                                mediaContent = (
                                    <div className="flex flex-col gap-4 h-full w-full items-center justify-center">
                                        <div className="flex-1 w-full flex items-center justify-center"><img src={media.laidOutImage} alt="Laid out view" className="max-w-full max-h-full object-contain"/></div>
                                        <div className="flex-1 w-full flex items-center justify-center"><img src={media.foldedImage} alt="Folded view" className="max-w-full max-h-full object-contain"/></div>
                                    </div>
                                );
                            } catch(e) {
                                // If parsing fails, it's a new item (single image data URL)
                                mediaContent = (
                                    <img src={selectedItem.media} alt={selectedItem.name || 'Clothing item'} className="max-w-full max-h-full object-contain rounded-md" />
                                );
                            }
                            return mediaContent;
                         })()}
                    </div>
                    <div className="w-full md:w-72 flex-shrink-0 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 id="library-item-title" className="text-lg font-bold text-accent capitalize">{selectedItem.mediaType} Details</h3>
                                <p className="text-xs text-text-muted">{new Date(selectedItem.id).toLocaleString()}</p>
                            </div>
                             <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover transition-colors">
                                <CloseIcon className="w-5 h-5"/>
                             </button>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2 -mr-2 bg-bg-tertiary/50 p-3 rounded-md border border-border-primary/50">
                             {selectedItem.mediaType !== 'clothes' && selectedItem.options ? (
                                <OptionDisplay options={selectedItem.options} mediaType={selectedItem.mediaType} />
                            ) : (
                                <div className="text-sm text-text-secondary space-y-3">
                                    <div>
                                        <span className="font-semibold text-text-primary">Item Name:</span>
                                        <p className="break-words">{selectedItem.name || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-text-primary">Details Provided:</span>
                                        <p className="whitespace-pre-wrap break-words text-xs">{selectedItem.clothingDetails || 'None'}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                            {relevantPrompt && (
                                <button
                                    onClick={handleCopyPrompt}
                                    className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                                >
                                    <CopyIcon className="w-5 h-5" /> {copyButtonText}
                                </button>
                            )}
                            {(selectedItem.mediaType === 'image' || (selectedItem.mediaType === 'video' && selectedItem.options?.videoProvider !== 'gemini')) && (
                                <button
                                    onClick={() => { onLoadItem(selectedItem); setSelectedItem(null); }}
                                    className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"
                                >
                                    <LoadIcon className="w-5 h-5"/> Load Item
                                </button>
                            )}
                            <button
                                onClick={() => handleDelete(selectedItem.id)}
                                className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors"
                            >
                                <TrashIcon className="w-5 h-5"/> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};