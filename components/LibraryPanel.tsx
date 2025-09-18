import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getLibraryItems, deleteLibraryItem, clearLibrary, saveLibraryItemToDisk, syncLibraryToDrive, exportLibraryAsJson } from '../services/libraryService';
import type { LibraryItem, GenerationOptions, LibraryItemType, PaletteColor } from '../types';
// Fix: Import `UploadIconSimple` to resolve missing name error.
import { SpinnerIcon, TrashIcon, LoadIcon, LibraryIcon, CloseIcon, VideoIcon, PhotographIcon, TshirtIcon, CopyIcon, DownloadIcon, GoogleDriveIcon, UploadIcon, FileExportIcon, DocumentTextIcon, Squares2X2Icon, ListBulletIcon, ArrowUpIcon, ArrowDownIcon, FilmIcon, CubeIcon, PaletteIcon, LogoIconSimple, CharacterIcon, BannerIcon, AlbumCoverIcon, PoseIcon, UploadIconSimple } from './icons';

type FilterType = 'all' | 'image' | 'character' | 'video' | 'logo' | 'banner' | 'album-cover' | 'clothes' | 'prompt' | 'extracted-frame' | 'object' | 'color-palette' | 'pose';

interface LibraryPanelProps {
  onLoadItem: (item: LibraryItem) => void;
  isDriveConnected: boolean;
  onSyncWithDrive: () => void;
  isSyncing: boolean;
  syncMessage: string;
  isDriveConfigured: boolean;
}

// --- Helper Components for Option Display ---

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
                keys.add('geminiT2IModel');
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


const OptionDisplay: React.FC<{ options: GenerationOptions; mediaType: 'image' | 'video' }> = ({ options, mediaType }) => {
    // useMemo will prevent re-calculation on every render unless dependencies change
    const filteredOptions = useMemo(() => {
        if (!options) return [];
        
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


export const LibraryPanel: React.FC<LibraryPanelProps> = ({ 
    onLoadItem, isDriveConnected, onSyncWithDrive, isSyncing, syncMessage, isDriveConfigured
}) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [isSavingToDisk, setIsSavingToDisk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // desc = newest first
  
  const [thumbnailPreview, setThumbnailPreview] = useState<{
    url: string | null;
    loading: boolean;
    position: { top: number; left: number };
  } | null>(null);
  
  const selectedPalette = useMemo<PaletteColor[] | null>(() => {
    if (selectedItem?.mediaType === 'color-palette') {
        try {
            return JSON.parse(selectedItem.media);
        } catch (e) {
            console.error("Failed to parse palette data:", e);
            return null;
        }
    }
    return null;
  }, [selectedItem]);

  useEffect(() => {
    if (selectedItem) {
        setCopyButtonText('Copy Prompt'); // Reset button text when a new item is selected
        setSaveError(null);
    }
  }, [selectedItem]);
  
  const relevantPrompt = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.mediaType === 'pose') return selectedItem.poseDescription;
    if (selectedItem.mediaType === 'prompt') return selectedItem.media;
    if (!selectedItem.options) return null;
    
    const opts = selectedItem.options;
    if (selectedItem.mediaType === 'image' || selectedItem.mediaType === 'character') {
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
    loadItems(); // Initial load when panel becomes active
    
    // Listen for custom event to refresh library
    const handleLibraryUpdate = () => loadItems();
    window.addEventListener('libraryUpdated', handleLibraryUpdate);

    return () => {
      window.removeEventListener('libraryUpdated', handleLibraryUpdate);
    };
  }, [loadItems]);

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this item from your library?')) {
      try {
        await deleteLibraryItem(id);
        // The event listener will handle updating the state, no need to call loadItems() here
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
            // The event listener will handle updating the state
            setSelectedItem(null);
        } catch (error) {
             console.error("Failed to clear library:", error);
        }
    }
  };

  const handleSaveToDisk = async () => {
    if (!selectedItem) return;
    setIsSavingToDisk(true);
    setSaveError(null);
    try {
        await saveLibraryItemToDisk(selectedItem);
    } catch (error: any) {
        console.error("Failed to save item to disk:", error);
        setSaveError(error.message || "An unknown error occurred.");
    } finally {
        setIsSavingToDisk(false);
    }
  };
  
  const handleSyncToDrive = async () => {
    setIsUploading(true);
    setUploadMessage('');
    try {
        await syncLibraryToDrive((msg) => setUploadMessage(msg));
        alert("Upload sync complete!");
    } catch (e: any) {
        console.error("Upload sync error:", e);
        alert(`Upload Sync Error:\n${e.message}`);
    } finally {
        setIsUploading(false);
        setUploadMessage('');
        loadItems(); // Reload items to show updated sync status
    }
  };
  
  const handleExportLibrary = async () => {
    await exportLibraryAsJson();
  };

  const handleItemMouseEnter = (item: LibraryItem, e: React.MouseEvent) => {
    // Show a preview only for prompts and palettes that have a source image.
    if ((item.mediaType === 'prompt' || item.mediaType === 'color-palette' || item.mediaType === 'pose') && item.sourceImage) {
        const imageUrl = item.sourceImage;
        const rect = e.currentTarget.getBoundingClientRect();
        const previewSize = 128;
        const gap = 10;
        
        let top = rect.top;
        let left = rect.right + gap;

        if (left + previewSize > window.innerWidth) {
            left = rect.left - previewSize - gap;
        }
        if (top + previewSize > window.innerHeight) {
            top = window.innerHeight - previewSize - gap;
        }
        if (top < gap) {
            top = gap;
        }
        const position = { top, left };

        setThumbnailPreview({ url: imageUrl, loading: false, position });
    }
  };

  const handleItemMouseLeave = () => {
    setThumbnailPreview(null);
  };

  const getCategoryIcon = (mediaType: LibraryItemType) => {
      switch(mediaType) {
          case 'image': return <PhotographIcon className="w-4 h-4 text-white" />;
          case 'character': return <CharacterIcon className="w-4 h-4 text-white" />;
          case 'video': return <VideoIcon className="w-4 h-4 text-white" />;
          case 'logo': return <LogoIconSimple className="w-4 h-4 text-white" />;
          case 'banner': return <BannerIcon className="w-4 h-4 text-white" />;
          case 'album-cover': return <AlbumCoverIcon className="w-4 h-4 text-white" />;
          case 'clothes': return <TshirtIcon className="w-4 h-4 text-white" />;
          case 'prompt': return <DocumentTextIcon className="w-4 h-4 text-white" />;
          case 'extracted-frame': return <FilmIcon className="w-4 h-4 text-white" />;
          case 'object': return <CubeIcon className="w-4 h-4 text-white" />;
          case 'color-palette': return <PaletteIcon className="w-4 h-4 text-white" />;
          case 'pose': return <PoseIcon className="w-4 h-4 text-white" />;
          default: return null;
      }
  };

  const displayedItems = useMemo(() => {
    const filtered = activeFilter === 'all' ? items : items.filter(item => item.mediaType === activeFilter);
    return filtered.sort((a, b) => sortOrder === 'asc' ? a.id - b.id : b.id - a.id);
  }, [items, activeFilter, sortOrder]);

  const FilterButton: React.FC<{ filter: FilterType; label: string, icon: React.ReactNode }> = ({ filter, label, icon }) => (
      <button
          onClick={() => setActiveFilter(filter)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              activeFilter === filter ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'
          }`}
      >
        {icon}
        {label}
      </button>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: List */}
        <div className="md:col-span-2 bg-bg-secondary p-6 rounded-2xl shadow-lg">
           <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                 <FilterButton filter="all" label="All" icon={<LibraryIcon className="w-4 h-4" />}/>
                 <FilterButton filter="image" label="Images" icon={<PhotographIcon className="w-4 h-4" />}/>
                 <FilterButton filter="character" label="Characters" icon={<CharacterIcon className="w-4 h-4" />}/>
                 <FilterButton filter="video" label="Videos" icon={<VideoIcon className="w-4 h-4" />}/>
                 <FilterButton filter="logo" label="Logos" icon={<LogoIconSimple className="w-4 h-4" />}/>
                 <FilterButton filter="banner" label="Banners" icon={<BannerIcon className="w-4 h-4" />}/>
                 <FilterButton filter="album-cover" label="Album Covers" icon={<AlbumCoverIcon className="w-4 h-4" />}/>
                 <FilterButton filter="clothes" label="Clothes" icon={<TshirtIcon className="w-4 h-4" />}/>
                 <FilterButton filter="object" label="Objects" icon={<CubeIcon className="w-4 h-4" />}/>
                 <FilterButton filter="pose" label="Poses" icon={<PoseIcon className="w-4 h-4" />}/>
                 <FilterButton filter="prompt" label="Prompts" icon={<DocumentTextIcon className="w-4 h-4" />}/>
                 <FilterButton filter="extracted-frame" label="Frames" icon={<FilmIcon className="w-4 h-4" />}/>
                 <FilterButton filter="color-palette" label="Palettes" icon={<PaletteIcon className="w-4 h-4" />}/>
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="p-2 bg-bg-tertiary rounded-md hover:bg-bg-tertiary-hover" title={sortOrder === 'asc' ? "Sort Newest First" : "Sort Oldest First"}>
                    {sortOrder === 'asc' ? <ArrowUpIcon className="w-5 h-5"/> : <ArrowDownIcon className="w-5 h-5"/>}
                 </button>
                 <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`} title="List View"><ListBulletIcon className="w-5 h-5"/></button>
                 <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`} title="Grid View"><Squares2X2Icon className="w-5 h-5"/></button>
              </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2">
            {isLoading ? (
              <div className="flex justify-center items-center h-64"><SpinnerIcon className="w-8 h-8 text-accent animate-spin" /></div>
            ) : displayedItems.length === 0 ? (
              <div className="text-center py-16 text-text-secondary">
                  <LibraryIcon className="w-16 h-16 mx-auto mb-4 text-border-primary" />
                  <p>Your library is empty.</p>
                  <p className="text-sm">Generated content will appear here once saved.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {displayedItems.map(item => (
                  <div
                    key={item.id}
                    className={`group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer transition-transform duration-200 hover:scale-105 ${selectedItem?.id === item.id ? 'ring-4 ring-accent' : ''}`}
                    onClick={() => setSelectedItem(item)}
                    onMouseEnter={(e) => handleItemMouseEnter(item, e)}
                    onMouseLeave={handleItemMouseLeave}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedItem(item)}
                  >
                    <img src={item.thumbnail} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-xs text-white font-semibold truncate">{item.name || 'Untitled'}</p>
                    </div>
                     <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>
                          {getCategoryIcon(item.mediaType)}
                      </div>
                  </div>
                ))}
              </div>
            ) : ( // List View
                 <div className="space-y-2">
                     {displayedItems.map(item => (
                        <div
                            key={item.id}
                            className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${selectedItem?.id === item.id ? 'bg-accent/20' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}
                            onClick={() => setSelectedItem(item)}
                            onMouseEnter={(e) => handleItemMouseEnter(item, e)}
                            onMouseLeave={handleItemMouseLeave}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => e.key === 'Enter' && setSelectedItem(item)}
                        >
                            <img src={item.thumbnail} alt={item.name} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
                            <div className="flex-grow overflow-hidden">
                                <p className="text-sm font-semibold text-text-primary truncate">{item.name || 'Untitled'}</p>
                                <p className="text-xs text-text-secondary capitalize">{item.mediaType.replace('-', ' ')}</p>
                            </div>
                             <div className="flex-shrink-0 flex items-center gap-2">
                               {/* Fix: Wrap the icon in a span with a title to avoid prop type errors. */}
                               {item.driveFileId && <span title="Synced with Google Drive"><GoogleDriveIcon className="w-4 h-4 text-text-muted"/></span>}
                                <span className="text-xs text-text-muted">{new Date(item.id).toLocaleDateString()}</span>
                            </div>
                        </div>
                     ))}
                 </div>
            )}
          </div>
        </div>

        {/* Right Column: Details */}
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg sticky top-24">
          <h3 className="text-xl font-bold text-accent mb-4 border-b-2 border-accent/30 pb-2">Details</h3>
          {selectedItem ? (
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
              <div className="relative">
                {selectedItem.mediaType === 'video' ? (
                     <video src={selectedItem.media} controls autoPlay loop className="w-full aspect-square object-contain rounded-lg bg-black"></video>
                ) : (
                    <img src={selectedItem.media} alt={selectedItem.name} className="w-full aspect-square object-contain rounded-lg bg-bg-primary" />
                )}
              </div>
              
              <h4 className="text-lg font-bold text-text-primary break-words">{selectedItem.name}</h4>
              <p className="text-sm text-text-secondary capitalize">{selectedItem.mediaType.replace('-', ' ')} &bull; Created: {new Date(selectedItem.id).toLocaleString()}</p>
              
              {selectedItem.sourceImage && (
                  <div>
                    <h5 className="text-md font-semibold text-text-secondary mb-2">Source Image</h5>
                    <img src={selectedItem.sourceImage} alt="Source" className="w-full rounded-md"/>
                  </div>
              )}

              {selectedPalette && (
                  <div>
                      <h5 className="text-md font-semibold text-text-secondary mb-2">Palette Colors</h5>
                      <div className="grid grid-cols-4 gap-2">
                          {selectedPalette.map(c => (
                              <div key={c.hex} className="text-center">
                                  <div className="w-full h-12 rounded" style={{backgroundColor: c.hex}}></div>
                                  <p className="text-xs mt-1 truncate">{c.name}</p>
                                  <p className="text-xs text-text-muted">{c.hex}</p>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
              
              {relevantPrompt && (
                  <div>
                      <h5 className="text-md font-semibold text-text-secondary mb-2">
                          {selectedItem.mediaType === 'pose' ? "Pose Description" : "Prompt"}
                      </h5>
                      <div className="relative">
                           <textarea readOnly value={relevantPrompt} className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-xs text-text-secondary" rows={5}/>
                           <button onClick={handleCopyPrompt} title="Copy" className="absolute top-2 right-2 p-1 bg-bg-primary rounded-full text-text-secondary hover:text-white"><CopyIcon className="w-4 h-4"/></button>
                      </div>
                  </div>
              )}

              {selectedItem.options && (selectedItem.mediaType === 'image' || selectedItem.mediaType === 'video') && (
                  <div>
                    <h5 className="text-md font-semibold text-text-secondary mb-2">Generation Options</h5>
                    <div className="p-3 bg-bg-tertiary rounded-md">
                        <OptionDisplay options={selectedItem.options} mediaType={selectedItem.mediaType} />
                    </div>
                  </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-4">
                  <button onClick={() => onLoadItem(selectedItem)} className="flex items-center justify-center gap-2 bg-accent text-accent-text font-semibold py-2 px-3 rounded-lg hover:bg-accent-hover transition-colors">
                      <LoadIcon className="w-5 h-5"/> Load
                  </button>
                  <button onClick={() => handleDelete(selectedItem.id)} className="flex items-center justify-center gap-2 bg-danger-bg text-danger font-semibold py-2 px-3 rounded-lg hover:bg-danger hover:text-white transition-colors">
                      <TrashIcon className="w-5 h-5"/> Delete
                  </button>
                  <button onClick={handleSaveToDisk} disabled={isSavingToDisk} className="col-span-2 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                      {isSavingToDisk ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <DownloadIcon className="w-5 h-5"/>}
                      Save to Disk
                  </button>
                  {saveError && <p className="col-span-2 text-xs text-danger text-center">{saveError}</p>}
              </div>

            </div>
          ) : (
            <div className="text-center text-text-secondary py-16">
                 <LibraryIcon className="w-16 h-16 mx-auto mb-4 text-border-primary" />
                <p>Select an item to see its details.</p>
            </div>
          )}
        </div>
      </div>
      
       {/* Global Actions */}
      <div className="mt-8 bg-bg-secondary p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
              <button onClick={handleExportLibrary} className="flex items-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"><FileExportIcon className="w-5 h-5"/> Export Library (.json)</button>
              <button onClick={handleClearAll} className="flex items-center gap-2 text-sm bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors"><TrashIcon className="w-5 h-5"/> Clear Library</button>
          </div>
          {isDriveConfigured && (
              <div className="flex flex-wrap gap-2">
                  <button onClick={handleSyncToDrive} disabled={isUploading} className="flex items-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50">
                      {isUploading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <UploadIconSimple className="w-5 h-5"/>}
                      {isUploading ? uploadMessage || 'Syncing...' : 'Upload Unsynced Items'}
                  </button>
                  <button 
                      onClick={onSyncWithDrive} 
                      disabled={!isDriveConnected || isSyncing} 
                      className="flex items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50"
                  >
                      {isSyncing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GoogleDriveIcon className="w-5 h-5" />}
                      {isSyncing ? syncMessage || "Syncing..." : "Sync with Drive"}
                  </button>
              </div>
          )}
      </div>
      
      {thumbnailPreview && (
        <div 
          className="fixed z-50 p-1 bg-bg-secondary rounded shadow-lg pointer-events-none animate-fade-in"
          style={{ top: thumbnailPreview.position.top, left: thumbnailPreview.position.left, width: '128px', height: '128px' }}
        >
          {thumbnailPreview.loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <SpinnerIcon className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : (
            <img 
              src={thumbnailPreview.url!} 
              alt="Source Preview" 
              className="w-full h-full object-cover rounded"
            />
          )}
        </div>
      )}
    </>
  );
};
