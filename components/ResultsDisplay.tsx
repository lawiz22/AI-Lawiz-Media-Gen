import React, { useState, useEffect } from 'react';
import type { GeneratedClothing, LibraryItem } from '../types';
import { saveToLibrary } from '../services/libraryService';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { DownloadIcon, SaveIcon, SpinnerIcon, CheckIcon } from './icons';

interface ResultsDisplayProps {
  items: GeneratedClothing[];
  onItemsChange: (items: GeneratedClothing[]) => void;
  sourceImage: File | null;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ items, onItemsChange, sourceImage }) => {

    const handleDownload = (dataUrl: string, name: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSaveToLibrary = async (item: GeneratedClothing, index: number) => {
        const updatedItems = [...items];
        updatedItems[index] = { ...updatedItems[index], saved: 'saving' };
        onItemsChange(updatedItems);
        
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'clothes',
                name: item.itemName,
                media: item.laidOutImage,
                thumbnail: await dataUrlToThumbnail(item.laidOutImage, 256),
                sourceImage: sourceImage ? await dataUrlToThumbnail(URL.createObjectURL(sourceImage), 512) : undefined,
            };
            await saveToLibrary(libraryItem);
            
            updatedItems[index] = { ...updatedItems[index], saved: 'saved' };
            onItemsChange(updatedItems);

        } catch (err) {
            console.error("Failed to save to library:", err);
            updatedItems[index] = { ...updatedItems[index], saved: 'idle' }; // Reset on error
            onItemsChange(updatedItems);
        }
    };
    
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="mt-8 space-y-6">
            <h2 className="text-2xl font-bold text-accent">Generated Product Shots</h2>
            {items.map((item, index) => {
                const savingStatus = item.saved || 'idle';
                return (
                    <div key={index} className="bg-bg-primary/50 p-4 rounded-lg border-l-4 border-accent">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-text-primary">{item.itemName}</h3>
                             <button
                                onClick={() => handleSaveToLibrary(item, index)}
                                title={savingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                disabled={savingStatus !== 'idle'}
                                className={`flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg transition-all duration-200 ${
                                    savingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' :
                                    savingStatus === 'saving' ? 'bg-bg-tertiary text-text-secondary cursor-wait' :
                                    'bg-bg-tertiary text-text-secondary hover:bg-accent hover:text-accent-text'
                                }`}
                            >
                                {savingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : savingStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                {savingStatus === 'saving' ? 'Saving...' : savingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                            </button>
                        </div>

                        <div className={`grid gap-4 ${item.foldedImage ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                            {/* Laid Out Image */}
                            <div className="text-center p-2 bg-bg-tertiary rounded-md">
                                <h4 className="text-sm font-medium text-text-secondary mb-2">Laid Out</h4>
                                <div className="aspect-square bg-white rounded-md flex items-center justify-center p-2">
                                    <img src={item.laidOutImage} alt={`${item.itemName} laid out`} className="max-w-full max-h-full object-contain" />
                                </div>
                                <button onClick={() => handleDownload(item.laidOutImage, `${item.itemName.replace(/\s+/g, '_')}_laid_out.png`)} className="mt-2 w-full flex items-center justify-center gap-2 text-xs bg-bg-primary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                    <DownloadIcon className="w-4 h-4" /> Download
                                </button>
                            </div>

                            {/* Folded Image (Conditional) */}
                            {item.foldedImage && (
                                <div className="text-center p-2 bg-bg-tertiary rounded-md">
                                    <h4 className="text-sm font-medium text-text-secondary mb-2">Folded</h4>
                                    <div className="aspect-square bg-white rounded-md flex items-center justify-center p-2">
                                        <img src={item.foldedImage} alt={`${item.itemName} folded`} className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <button onClick={() => handleDownload(item.foldedImage, `${item.itemName.replace(/\s+/g, '_')}_folded.png`)} className="mt-2 w-full flex items-center justify-center gap-2 text-xs bg-bg-primary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                        <DownloadIcon className="w-4 h-4" /> Download
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
