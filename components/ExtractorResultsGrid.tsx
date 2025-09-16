
import React, { useState, useCallback, useEffect } from 'react';
import type { GeneratedClothing, GeneratedObject } from '../types';
import { DownloadIcon, SaveIcon, SpinnerIcon, CheckIcon, CloseIcon } from './icons';

interface ExtractorResultsGridProps {
  items: (GeneratedClothing | GeneratedObject)[];
  onSave: (item: GeneratedClothing | GeneratedObject, index: number) => void;
  title: string;
}

export const ExtractorResultsGrid: React.FC<ExtractorResultsGridProps> = ({ items, onSave, title }) => {
    const [zoomedItemIndex, setZoomedItemIndex] = useState<number | null>(null);
    const [isShowingFolded, setIsShowingFolded] = useState(false);

    const handleCloseZoom = useCallback(() => {
        setZoomedItemIndex(null);
        setIsShowingFolded(false);
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleCloseZoom();
        }
    }, [handleCloseZoom]);

    useEffect(() => {
        if (zoomedItemIndex !== null) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [zoomedItemIndex, handleKeyDown]);
    
    const currentZoomedItem = zoomedItemIndex !== null ? items[zoomedItemIndex] : null;
    let currentZoomedImageSrc = null;
    if (currentZoomedItem) {
        if ('itemName' in currentZoomedItem && currentZoomedItem.foldedImage) {
            currentZoomedImageSrc = isShowingFolded ? currentZoomedItem.foldedImage : currentZoomedItem.laidOutImage;
        } else {
            currentZoomedImageSrc = 'itemName' in currentZoomedItem ? currentZoomedItem.laidOutImage : currentZoomedItem.image;
        }
    }

    const handleDownload = (dataUrl: string, name: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (items.length === 0) {
        return null;
    }

    return (
        <>
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-accent">{title}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((item, index) => {
                        const isClothing = 'itemName' in item;
                        const name = isClothing ? item.itemName : item.name;
                        const image = isClothing ? item.laidOutImage : item.image;
                        const savingStatus = item.saved || 'idle';

                        return (
                            <div key={index} className="text-center p-2 bg-bg-tertiary rounded-md flex flex-col">
                                <h4 className="text-sm font-medium text-text-primary mb-2 truncate" title={name}>{name}</h4>
                                <div className="aspect-square bg-white rounded-md flex items-center justify-center p-2 flex-grow cursor-pointer" onClick={() => setZoomedItemIndex(index)}>
                                    <img src={image} alt={name} className="max-w-full max-h-full object-contain" />
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button
                                        onClick={() => handleDownload(image, `${name.replace(/\s+/g, '_')}_laid_out.png`)}
                                        className="w-full flex items-center justify-center gap-2 text-xs bg-bg-primary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                                    >
                                        <DownloadIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onSave(item, index)}
                                        disabled={savingStatus !== 'idle'}
                                        className={`w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 px-3 rounded-lg transition-colors ${
                                            savingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' :
                                            savingStatus === 'saving' ? 'bg-bg-primary text-text-secondary cursor-wait' :
                                            'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'
                                        }`}
                                    >
                                        {savingStatus === 'saving' ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : savingStatus === 'saved' ? <CheckIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {currentZoomedItem && currentZoomedImageSrc && (
                <div 
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Zoomed image view"
                    onClick={handleCloseZoom}
                >
                    <div 
                        className="relative max-w-4xl max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <img 
                            src={currentZoomedImageSrc}
                            alt={`Zoomed content`}
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            onClick={handleCloseZoom}
                            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition-colors z-10"
                            aria-label="Close zoomed image"
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-bg-secondary/80 backdrop-blur-sm p-3 rounded-full shadow-lg"
                        onClick={e => e.stopPropagation()}
                        role="toolbar"
                        aria-label="Image actions"
                    >
                        {'itemName' in currentZoomedItem && currentZoomedItem.foldedImage && (
                            <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-full">
                                <button
                                    onClick={() => setIsShowingFolded(false)}
                                    className={`px-3 py-1 text-xs rounded-full ${!isShowingFolded ? 'bg-accent text-accent-text' : 'text-text-secondary'}`}
                                >
                                    Laid Out
                                </button>
                                <button
                                    onClick={() => setIsShowingFolded(true)}
                                    className={`px-3 py-1 text-xs rounded-full ${isShowingFolded ? 'bg-accent text-accent-text' : 'text-text-secondary'}`}
                                >
                                    Folded
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => handleDownload(currentZoomedImageSrc!, ('itemName' in currentZoomedItem ? currentZoomedItem.itemName : currentZoomedItem.name))}
                            title="Download Image"
                            aria-label="Download this image"
                            className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                        >
                            <DownloadIcon className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => onSave(currentZoomedItem, zoomedItemIndex!)}
                            disabled={currentZoomedItem.saved !== 'idle'}
                            title="Save to Library"
                            className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text transition-colors disabled:opacity-50"
                        >
                             {currentZoomedItem.saved === 'saving' ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : currentZoomedItem.saved === 'saved' ? <CheckIcon className="w-6 h-6" /> : <SaveIcon className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
