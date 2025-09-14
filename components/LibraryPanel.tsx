import React, { useState, useEffect, useCallback } from 'react';
import { getLibraryItems, deleteLibraryItem, clearLibrary } from '../services/libraryService';
import type { LibraryItem, GenerationOptions } from '../types';
import { SpinnerIcon, TrashIcon, LoadIcon, LibraryIcon, CloseIcon, VideoIcon } from './icons';

interface LibraryPanelProps {
  onLoadItem: (item: LibraryItem) => void;
}

const formatOptionKey = (key: string): string => {
  return key
    .replace(/([A-Z])/g, ' $1') // insert a space before all caps
    .replace(/^./, (str) => str.toUpperCase()); // capitalize the first letter
};

const OptionDisplay: React.FC<{ options: GenerationOptions }> = ({ options }) => {
    const relevantOptions = Object.entries(options).filter(([key, value]) => {
        return value !== undefined && value !== null && value !== '' && value !== false;
    });

    return (
        <div className="text-xs text-text-secondary space-y-1">
            {relevantOptions.map(([key, value]) => (
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
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {items.map(item => (
                    <div 
                        key={item.id} 
                        className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer"
                        onClick={() => setSelectedItem(item)}
                    >
                        <img src={item.thumbnail} alt={`Library item ${item.id}`} className="object-cover w-full h-full" />
                        {item.mediaType === 'video' && (
                             <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full">
                                <VideoIcon className="w-4 h-4 text-white" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center text-white text-xs font-semibold">
                            {new Date(item.id).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
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
                         {selectedItem.mediaType === 'image' ? (
                            <img src={selectedItem.media} alt="Selected library item" className="max-w-full max-h-full object-contain rounded-md" />
                         ) : (
                            <video src={selectedItem.media} controls autoPlay loop className="max-w-full max-h-full object-contain rounded-md" />
                         )}
                    </div>
                    <div className="w-full md:w-64 flex-shrink-0 flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 id="library-item-title" className="text-lg font-bold text-accent">Generation Details</h3>
                                <p className="text-xs text-text-muted">{new Date(selectedItem.id).toLocaleString()}</p>
                            </div>
                             <button onClick={() => setSelectedItem(null)} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover transition-colors">
                                <CloseIcon className="w-5 h-5"/>
                             </button>
                        </div>
                        <div className="flex-grow overflow-y-auto pr-2 -mr-2 bg-bg-tertiary/50 p-3 rounded-md border border-border-primary/50">
                             <OptionDisplay options={selectedItem.options} />
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                            <button
                                onClick={() => onLoadItem(selectedItem)}
                                className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"
                            >
                                <LoadIcon className="w-5 h-5"/> Load Settings
                            </button>
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