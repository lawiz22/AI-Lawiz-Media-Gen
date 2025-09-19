import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getLibraryItems, deleteLibraryItem, exportLibraryAsJson, clearLibrary } from '../services/libraryService';
import type { LibraryItem, LibraryItemType, GenerationOptions } from '../types';
import {
  CloseIcon, SpinnerIcon, LibraryIcon, VideoIcon, PhotographIcon, TshirtIcon,
  DocumentTextIcon, FilmIcon, CubeIcon, CheckIcon, LogoIconSimple, CharacterIcon, PaletteIcon,
  BannerIcon, AlbumCoverIcon, TrashIcon, LoadIcon, FileExportIcon, UploadIconSimple, GoogleDriveIcon,
  PoseIcon
} from './icons';
import { dataUrlToBlob } from '../utils/imageUtils';

interface LibraryPanelProps {
  onLoadItem: (item: LibraryItem) => void;
  isDriveConnected: boolean;
  onSyncWithDrive: () => void;
  isSyncing: boolean;
  syncMessage: string;
  isDriveConfigured: boolean;
}

const getCategoryIcon = (mediaType: LibraryItemType, className: string = "w-4 h-4") => {
    const props = { className };
    switch(mediaType) {
        case 'image': return <PhotographIcon {...props} />;
        case 'character': return <CharacterIcon {...props} />;
        case 'video': return <VideoIcon {...props} />;
        case 'logo': return <LogoIconSimple {...props} />;
        case 'banner': return <BannerIcon {...props} />;
        case 'album-cover': return <AlbumCoverIcon {...props} />;
        case 'clothes': return <TshirtIcon {...props} />;
        case 'prompt': return <DocumentTextIcon {...props} />;
        case 'extracted-frame': return <FilmIcon {...props} />;
        case 'object': return <CubeIcon {...props} />;
        case 'color-palette': return <PaletteIcon {...props} />;
        case 'pose': return <PoseIcon {...props} />;
        default: return null;
    }
};

const FILTER_BUTTONS: { id: LibraryItemType; label: string; icon: JSX.Element }[] = [
    { id: 'image', label: 'Images', icon: <PhotographIcon className="w-5 h-5"/> },
    { id: 'character', label: 'Characters', icon: <CharacterIcon className="w-5 h-5"/> },
    { id: 'video', label: 'Videos', icon: <VideoIcon className="w-5 h-5"/> },
    { id: 'logo', label: 'Logos', icon: <LogoIconSimple className="w-5 h-5"/> },
    { id: 'banner', label: 'Banners', icon: <BannerIcon className="w-5 h-5"/> },
    { id: 'album-cover', label: 'Album Covers', icon: <AlbumCoverIcon className="w-5 h-5"/> },
    { id: 'clothes', label: 'Clothes', icon: <TshirtIcon className="w-5 h-5"/> },
    { id: 'object', label: 'Objects', icon: <CubeIcon className="w-5 h-5"/> },
    { id: 'pose', label: 'Poses', icon: <PoseIcon className="w-5 h-5"/> },
    { id: 'prompt', label: 'Prompts', icon: <DocumentTextIcon className="w-5 h-5"/> },
    { id: 'color-palette', label: 'Palettes', icon: <PaletteIcon className="w-5 h-5"/> },
    { id: 'extracted-frame', label: 'Frames', icon: <FilmIcon className="w-5 h-5"/> },
];

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ onLoadItem, isDriveConnected, onSyncWithDrive, isSyncing, syncMessage, isDriveConfigured }) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<LibraryItemType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedItemModal, setSelectedItemModal] = useState<LibraryItem | null>(null);

  const fetchItems = useCallback(() => {
    setIsLoading(true);
    getLibraryItems()
      .then(setItems)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
    window.addEventListener('libraryUpdated', fetchItems);
    return () => {
      window.removeEventListener('libraryUpdated', fetchItems);
    };
  }, [fetchItems]);
  
  const handleFilterClick = (type: LibraryItemType) => {
    setFilter(prev => {
      if (prev.includes(type)) {
        return prev.filter(f => f !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleClearFilters = () => {
    setFilter([]);
    setSearchTerm('');
  };

  const handleDelete = async (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      setDeletingId(id);
      try {
        await deleteLibraryItem(id);
      } catch (err) {
        console.error("Failed to delete item:", err);
      } finally {
        setDeletingId(null);
      }
    }
  };
  
  const handleExport = async () => {
    try {
        await exportLibraryAsJson();
    } catch(e) {
        console.error("Export failed", e);
        alert("Failed to export library. See console for details.");
    }
  };

  const handleClearLibrary = async () => {
    if (window.confirm("ARE YOU SURE you want to delete your ENTIRE local library? This action cannot be undone and will permanently remove all saved items from this browser.")) {
        if (window.confirm("This is your final warning. Are you absolutely certain you wish to proceed?")) {
            await clearLibrary();
        }
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (filter.length > 0) {
      filtered = filtered.filter(item => filter.includes(item.mediaType));
    }
    if (searchTerm.trim() !== '') {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(item => item.name?.toLowerCase().includes(lowerSearch));
    }
    return filtered;
  }, [items, filter, searchTerm]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedItemModal(null);
    }
  }, []);

  useEffect(() => {
    if (selectedItemModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedItemModal, handleKeyDown]);

  const DetailItem: React.FC<{ label: string; value?: string | number | null; isCode?: boolean }> = ({ label, value, isCode }) => {
    if (!value) return null;
    return (
        <div className="mb-2">
            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</h4>
            {isCode ? (
                <pre className="text-xs bg-bg-primary p-2 rounded-md mt-1 max-h-48 overflow-auto text-text-secondary whitespace-pre-wrap font-mono">
                    <code>{value}</code>
                </pre>
            ) : (
                <p className="text-sm text-text-primary mt-1">{value}</p>
            )}
        </div>
    );
  };
  
  const renderOptionsDetails = (options?: GenerationOptions) => {
    if (!options) return <DetailItem label="Options" value="Not available" />;
    const { provider } = options;
    return (
      <div>
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Generation Options</h4>
        <div className="space-y-3 bg-bg-primary p-3 rounded-md max-h-96 overflow-y-auto">
          <DetailItem label="Provider" value={provider} />
          {provider === 'gemini' && (
            <>
              <DetailItem label="Mode" value={options.geminiMode} />
              {options.geminiMode === 't2i' && <DetailItem label="Prompt" value={options.geminiPrompt} isCode />}
              <DetailItem label="Pose" value={options.poseMode} />
              <DetailItem label="Background" value={options.background} />
              {options.background === 'prompt' && <DetailItem label="BG Prompt" value={options.customBackground} isCode />}
              <DetailItem label="Clothing" value={options.clothing} />
              {options.clothing === 'prompt' && <DetailItem label="Clothing Prompt" value={options.customClothingPrompt} isCode />}
              <DetailItem label="Image Style" value={options.imageStyle} />
            </>
          )}
          {provider === 'comfyui' && (
             <>
                <DetailItem label="Workflow" value={options.comfyModelType} />
                <DetailItem label="Model" value={options.comfyModel} />
                <DetailItem label="Prompt" value={options.comfyPrompt} isCode/>
                <DetailItem label="Negative Prompt" value={options.comfyNegativePrompt} isCode/>
                <DetailItem label="Steps" value={options.comfySteps} />
                <DetailItem label="CFG" value={options.comfyCfg} />
             </>
          )}
          {options.videoProvider && (
            <>
                <DetailItem label="Video Provider" value={options.videoProvider} />
                {options.videoProvider === 'gemini' && <DetailItem label="Video Prompt" value={options.geminiVidPrompt} isCode />}
                {options.videoProvider === 'comfyui' && <DetailItem label="Video Prompt" value={options.comfyVidWanI2VPositivePrompt} isCode />}
            </>
          )}
          <DetailItem label="Aspect Ratio" value={options.aspectRatio} />
        </div>
      </div>
    );
  };


  return (
    <>
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold text-accent">Library</h2>
          <div className="flex items-center gap-2">
            {isDriveConfigured && (
              <button onClick={onSyncWithDrive} disabled={!isDriveConnected || isSyncing} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                  {isSyncing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GoogleDriveIcon className="w-5 h-5"/>}
                  {isSyncing ? 'Syncing...' : 'Sync with Drive'}
              </button>
            )}
            <button onClick={handleExport} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200">
                <FileExportIcon className="w-5 h-5"/> Export
            </button>
          </div>
        </div>
        
        {isSyncing && <p className="text-sm text-accent text-center mb-4">{syncMessage}</p>}

        {/* Filters */}
        <div className="mb-6 p-4 bg-bg-primary/50 rounded-lg border border-border-primary/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text-secondary mr-2">Filter:</p>
                    {FILTER_BUTTONS.map(({ id, label, icon }) => (
                         <button
                            key={id}
                            onClick={() => handleFilterClick(id)}
                            title={label}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${filter.includes(id) ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}
                        >
                            {icon}
                            <span>{label}</span>
                        </button>
                    ))}
                    {(filter.length > 0 || searchTerm) && (
                        <button onClick={handleClearFilters} className="text-xs text-accent hover:underline">Clear</button>
                    )}
                </div>
            </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex justify-center items-center py-16"><SpinnerIcon className="w-12 h-12 text-accent animate-spin" /></div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer"
                onClick={() => setSelectedItemModal(item)}
              >
                <img src={item.thumbnail} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute bottom-0 left-0 p-2 text-white transform translate-y-4 group-hover:translate-y-0 transition-transform">
                  <p className="text-xs font-bold truncate max-w-full">{item.name}</p>
                </div>
                <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>
                    {getCategoryIcon(item.mediaType, "w-4 h-4 text-white")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-text-secondary">
             <LibraryIcon className="w-16 h-16 mx-auto text-border-primary mb-4" />
            <h3 className="font-bold text-lg text-text-primary">No Items Found</h3>
            <p>Your library is empty or no items match your current filters.</p>
          </div>
        )}
         <div className="mt-8 pt-4 border-t border-danger-bg">
            <button
                onClick={handleClearLibrary}
                className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors"
            >
                <TrashIcon className="w-5 h-5" /> Clear Entire Local Library
            </button>
         </div>
      </div>
      
      {selectedItemModal && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-item-title"
          onClick={() => setSelectedItemModal(null)}
        >
          <div 
            className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 id="library-item-title" className="text-xl font-bold text-accent flex items-center gap-2">
                {getCategoryIcon(selectedItemModal.mediaType, "w-6 h-6")}
                {selectedItemModal.name || `Library Item #${selectedItemModal.id}`}
              </h2>
              <button
                onClick={() => setSelectedItemModal(null)}
                className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-2 -mr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Media Column */}
                  <div className="space-y-4">
                    {selectedItemModal.mediaType === 'pose' ? (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <h4 className="text-sm font-semibold text-text-secondary mb-2 text-center">Mannequin</h4>
                                <div className="aspect-square bg-white rounded-lg flex items-center justify-center p-1">
                                    <img src={selectedItemModal.media} alt="Mannequin" className="max-w-full max-h-full object-contain" />
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-text-secondary mb-2 text-center">Skeleton</h4>
                                <div className="aspect-square bg-black rounded-lg flex items-center justify-center p-1">
                                    {selectedItemModal.skeletonImage ? <img src={selectedItemModal.skeletonImage} alt="Skeleton" className="max-w-full max-h-full object-contain" /> : <p className="text-xs text-text-muted">No skeleton available</p>}
                                </div>
                            </div>
                        </div>
                    ) : (selectedItemModal.mediaType !== 'prompt' && selectedItemModal.mediaType !== 'color-palette') && (
                        <div className="aspect-square bg-bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                            {selectedItemModal.mediaType === 'video' ? (
                                <video src={selectedItemModal.media} controls className="w-full h-full object-contain" />
                            ) : (
                                <img src={selectedItemModal.media} alt={selectedItemModal.name} className="w-full h-full object-contain" />
                            )}
                        </div>
                    )}
                    {(selectedItemModal.sourceImage || selectedItemModal.startFrame) && (
                        <div>
                            <h4 className="text-sm font-semibold text-text-secondary mb-2">Source Image</h4>
                            <div className="aspect-square bg-bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                                <img src={selectedItemModal.sourceImage || selectedItemModal.startFrame} alt="Source for the generated item" className="w-full h-full object-contain" />
                            </div>
                        </div>
                    )}
                     {(selectedItemModal.mediaType === 'color-palette') && (
                        <div>
                             <h4 className="text-sm font-semibold text-text-secondary mb-2">Palette</h4>
                             <div className="grid grid-cols-4 gap-2 p-2 bg-bg-primary rounded-md">
                                {JSON.parse(selectedItemModal.media).map((color: any) => (
                                    <div key={color.hex} className="text-center">
                                        <div className="w-full h-16 rounded-md" style={{backgroundColor: color.hex}}></div>
                                        <p className="text-xs mt-1 text-text-primary truncate">{color.name}</p>
                                        <p className="text-xs text-text-muted">{color.hex}</p>
                                    </div>
                                ))}
                             </div>
                        </div>
                     )}
                  </div>
                  {/* Details Column */}
                  <div className="space-y-4">
                    <DetailItem label="Item ID" value={selectedItemModal.id} />
                    <DetailItem label="Type" value={selectedItemModal.mediaType} />
                    {selectedItemModal.mediaType === 'prompt' && <DetailItem label="Prompt Text" value={selectedItemModal.media} isCode />}
                    {selectedItemModal.poseDescription && <DetailItem label="Pose Description" value={selectedItemModal.poseDescription} isCode />}
                    {selectedItemModal.poseJson && <DetailItem label="Pose JSON (ControlNet)" value={selectedItemModal.poseJson} isCode />}
                    {renderOptionsDetails(selectedItemModal.options)}
                    <div className="pt-4 flex flex-wrap gap-2">
                         <button
                            onClick={() => {
                                onLoadItem(selectedItemModal);
                                setSelectedItemModal(null);
                            }}
                            className="flex-1 flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"
                        >
                            <LoadIcon className="w-5 h-5"/> Load in Generator
                        </button>
                        <button
                            onClick={() => handleDelete(selectedItemModal.id, selectedItemModal.name || `Item #${selectedItemModal.id}`)}
                            disabled={deletingId === selectedItemModal.id}
                            className="flex items-center justify-center gap-2 bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors"
                        >
                            {deletingId === selectedItemModal.id ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <TrashIcon className="w-5 h-5"/>}
                        </button>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};