import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getLibraryItems } from '../services/libraryService';
import type { LibraryItem, LibraryItemType } from '../types';
import { normalizeAudioDataUrl } from '../utils/imageUtils';
import { CloseIcon, SpinnerIcon, LibraryIcon, VideoIcon, PhotographIcon, TshirtIcon, DocumentTextIcon, FilmIcon, CubeIcon, CheckIcon, LogoIconSimple, CharacterIcon, PaletteIcon, BannerIcon, AlbumCoverIcon, PoseIcon, FontIcon, MicrophoneIcon } from './icons';

interface LibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: LibraryItem) => void;
  filter: LibraryItemType | LibraryItemType[] | null;
  multiSelect?: boolean;
  onSelectMultiple?: (items: LibraryItem[]) => void;
}

// Fix: Widened the type of `mediaType` to `LibraryItemType` to include all possible values from `LibraryItem` and added a case for 'object' to resolve the TypeScript error.
const getCategoryIcon = (mediaType: LibraryItemType) => {
    switch(mediaType) {
        case 'image': return <PhotographIcon className="w-4 h-4 text-white" />;
        case 'character': return <CharacterIcon className="w-4 h-4 text-white" />;
        case 'video': return <VideoIcon className="w-4 h-4 text-white" />;
        case 'audio-tts':
        case 'tts-reference': return <MicrophoneIcon className="w-4 h-4 text-white" />;
        case 'logo': return <LogoIconSimple className="w-4 h-4 text-white" />;
        case 'banner': return <BannerIcon className="w-4 h-4 text-white" />;
        case 'album-cover': return <AlbumCoverIcon className="w-4 h-4 text-white" />;
        case 'clothes': return <TshirtIcon className="w-4 h-4 text-white" />;
        case 'prompt': return <DocumentTextIcon className="w-4 h-4 text-white" />;
        case 'extracted-frame': return <FilmIcon className="w-4 h-4 text-white" />;
        case 'object': return <CubeIcon className="w-4 h-4 text-white" />;
        case 'color-palette': return <PaletteIcon className="w-4 h-4 text-white" />;
        case 'pose': return <PoseIcon className="w-4 h-4 text-white" />;
        case 'font': return <FontIcon className="w-4 h-4 text-white" />;
        default: return null;
    }
};

export const LibraryPickerModal: React.FC<LibraryPickerModalProps> = ({ isOpen, onClose, onSelectItem, filter, multiSelect = false, onSelectMultiple }) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<LibraryItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSelectedItems([]); // Reset selection when opening
      getLibraryItems()
        .then(setItems)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  const filteredItems = useMemo(() => {
    if (!filter) return [];
    const activeFilters = Array.isArray(filter) ? filter : [filter];
    if (activeFilters.length === 0) return [];
    return items.filter(item => activeFilters.includes(item.mediaType));
  }, [items, filter]);

  const handleSelect = (item: LibraryItem) => {
    if (multiSelect) {
      setSelectedItems(prev => {
        const isSelected = prev.some(selected => selected.id === item.id);
        if (isSelected) {
          return prev.filter(selected => selected.id !== item.id);
        } else {
          return [...prev, item];
        }
      });
    } else {
      onSelectItem(item);
      onClose();
    }
  };
  
  const handleConfirmMultiSelect = () => {
    if (multiSelect && onSelectMultiple) {
      onSelectMultiple(selectedItems);
      onClose();
    }
  };

  const filterText = useMemo(() => {
    if (!filter) return 'items';
    const filters = Array.isArray(filter) ? filter : [filter];
    if (filters.length > 1) return 'matching items';
    return `${filters[0].replace('-', ' ')} items`;
  }, [filter]);

  const isTtsPicker = useMemo(() => {
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    return filters.length > 0 && filters.every(itemType => itemType === 'tts-reference' || itemType === 'audio-tts');
  }, [filter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-picker-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 id="library-picker-title" className="text-xl font-bold text-accent flex items-center gap-2">
            <LibraryIcon className="w-6 h-6" />
            Select from Library
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors" aria-label="Close">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <SpinnerIcon className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-text-secondary p-8">
                <LibraryIcon className="w-16 h-16 text-border-primary mb-4" />
                <h3 className="text-lg font-bold text-text-primary">No Matching Items Found</h3>
                <p>Your library doesn't contain any {filterText} yet.</p>
            </div>
          ) : isTtsPicker ? (
            <div className="space-y-6">
              {([
                { type: 'tts-reference' as const, title: 'Voice references', description: 'Original voices saved for reuse' },
                { type: 'audio-tts' as const, title: 'Generated results', description: 'Previous TTS outputs that can be reused' },
              ]).map(group => {
                const groupItems = filteredItems.filter(item => item.mediaType === group.type);
                if (groupItems.length === 0) return null;
                return <section key={group.type}>
                  <div className="mb-3 flex items-end justify-between gap-3 border-b border-border-primary pb-2">
                    <div><h3 className="text-sm font-bold text-text-primary">{group.title}</h3><p className="text-xs text-text-muted">{group.description}</p></div>
                    <span className="text-xs font-semibold text-text-muted">{groupItems.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {groupItems.map(item => {
                      const isReference = item.mediaType === 'tts-reference';
                      return <article key={item.id} className="overflow-hidden rounded-md border border-border-primary bg-bg-primary shadow-md">
                        <div className="relative aspect-[4/3] overflow-hidden bg-bg-tertiary">
                          <img src={item.thumbnail} alt={item.name || `TTS item ${item.id}`} className="h-full w-full object-cover" />
                          <span className={`absolute left-2 top-2 rounded px-2 py-1 text-[10px] font-bold uppercase text-white shadow ${isReference ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                            {isReference ? 'Voice reference' : 'Generated result'}
                          </span>
                        </div>
                        <div className="p-3">
                          <h4 className="truncate text-sm font-bold text-text-primary" title={item.name || undefined}>{item.name || (isReference ? 'Unnamed reference' : 'Unnamed result')}</h4>
                          {!isReference && item.ttsOptions?.referenceAudioName && <p className="mt-1 truncate text-xs text-text-muted">Voice: {item.ttsOptions.referenceAudioName}</p>}
                          <audio controls preload="none" src={normalizeAudioDataUrl(item.media)} className="mt-3 h-9 w-full" onClick={event => event.stopPropagation()} />
                          <button onClick={() => handleSelect(item)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-xs font-bold text-accent-text hover:bg-accent-hover">
                            <MicrophoneIcon className="h-4 w-4" />Use this voice
                          </button>
                        </div>
                      </article>;
                    })}
                  </div>
                </section>;
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredItems.map(item => {
                const isSelected = multiSelect && selectedItems.some(selected => selected.id === item.id);
                return (
                  <div
                    key={item.id}
                    className={`group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer transition-all duration-200 ${isSelected ? 'ring-4 ring-accent' : ''}`}
                    onClick={() => handleSelect(item)}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`Select ${item.name || item.mediaType}`}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect(item)}
                  >
                    <img src={item.thumbnail} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
                    <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>
                          {getCategoryIcon(item.mediaType)}
                      </div>
                    <div className={`absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center text-white text-sm font-semibold`}>
                      {multiSelect ? (isSelected ? 'Selected' : 'Select') : 'Select'}
                    </div>
                    {isSelected && (
                      <div className="absolute bottom-2 right-2 bg-accent text-accent-text p-1 rounded-full">
                        <CheckIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {multiSelect && (
          <div className="mt-4 pt-4 border-t border-border-primary flex-shrink-0 flex justify-end">
            <button
              onClick={handleConfirmMultiSelect}
              disabled={selectedItems.length === 0}
              className="bg-accent text-accent-text font-bold py-2 px-6 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Select {selectedItems.length > 0 ? `${selectedItems.length} Item(s)` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};