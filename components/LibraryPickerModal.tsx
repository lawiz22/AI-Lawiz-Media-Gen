import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getLibraryItems } from '../services/libraryService';
import type { LibraryItem, LibraryItemType } from '../types';
import { CloseIcon, SpinnerIcon, LibraryIcon, VideoIcon, PhotographIcon, TshirtIcon, DocumentTextIcon, FilmIcon, CubeIcon } from './icons';

interface LibraryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (mediaDataUrl: string) => void;
  filter: 'image' | 'clothes' | null;
}

// Fix: Widened the type of `mediaType` to `LibraryItemType` to include all possible values from `LibraryItem` and added a case for 'object' to resolve the TypeScript error.
const getCategoryIcon = (mediaType: LibraryItemType) => {
    switch(mediaType) {
        case 'image': return <PhotographIcon className="w-4 h-4 text-white" />;
        case 'video': return <VideoIcon className="w-4 h-4 text-white" />;
        case 'clothes': return <TshirtIcon className="w-4 h-4 text-white" />;
        case 'prompt': return <DocumentTextIcon className="w-4 h-4 text-white" />;
        case 'extracted-frame': return <FilmIcon className="w-4 h-4 text-white" />;
        case 'object': return <CubeIcon className="w-4 h-4 text-white" />;
        default: return null;
    }
};

export const LibraryPickerModal: React.FC<LibraryPickerModalProps> = ({ isOpen, onClose, onSelectItem, filter }) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
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
    return items.filter(item => item.mediaType === filter);
  }, [items, filter]);

  const handleSelect = (item: LibraryItem) => {
    // For clothes, the old format stores a JSON string, while the new format stores a data URL.
    // This logic ensures a valid image data URL is always returned.
    if (item.mediaType === 'clothes') {
        try {
            // Attempt to parse JSON for old format. If it works, it's an object with images.
            const parsed = JSON.parse(item.media);
            if (parsed.laidOutImage) {
                onSelectItem(parsed.laidOutImage); // Prefer the 'laid out' view for reference
            } else {
                 console.error("Could not find image in old clothes library item format");
            }
        } catch (e) {
            // If parsing fails, it's the new format (a single data URL string).
            onSelectItem(item.media);
        }
    } else {
        // For images and videos, 'media' is always a data URL.
        onSelectItem(item.media);
    }
    onClose();
  };

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
                <p className="capitalize">Your library doesn't contain any '{filter}' items yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer"
                  onClick={() => handleSelect(item)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${item.name || item.mediaType}`}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect(item)}
                >
                  <img src={item.thumbnail} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
                   <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>
                        {getCategoryIcon(item.mediaType)}
                    </div>
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center text-white text-sm font-semibold">
                    Select
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};