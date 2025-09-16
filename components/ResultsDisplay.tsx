import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import type { GeneratedClothing, LibraryItem } from '../types';
import { DownloadIcon, ResetIcon, SpinnerIcon, SaveIcon, CheckIcon } from './icons';
import { saveToLibrary } from '../services/libraryService';
import { dataUrlToThumbnail } from '../utils/imageUtils';

interface ResultsDisplayProps {
  originalImage: string;
  generatedItems: GeneratedClothing[];
  onReset: () => void;
  details: string;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ originalImage, generatedItems, onReset, details }) => {
    const [isZipping, setIsZipping] = useState(false);
    const [savingStates, setSavingStates] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});

    useEffect(() => {
        setSavingStates({});
    }, [generatedItems]);

    const handleDownloadAll = async () => {
        setIsZipping(true);
        try {
            const zip = new JSZip();
            const folder = zip.folder('extracted-clothing');
            if (!folder) throw new Error("Could not create zip folder.");

            generatedItems.forEach((item, index) => {
                const safeName = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const laidOutBase64 = item.laidOutImage.split(',')[1];
                const foldedBase64 = item.foldedImage.split(',')[1];

                if (laidOutBase64) {
                    folder.file(`${index + 1}_${safeName}_laid_out.png`, laidOutBase64, { base64: true });
                }
                if (foldedBase64) {
                    folder.file(`${index + 1}_${safeName}_folded.png`, foldedBase64, { base64: true });
                }
            });

            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'extracted-clothing.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (err) {
            console.error("Failed to create zip file:", err);
            alert("Sorry, there was an error creating the zip file.");
        } finally {
            setIsZipping(false);
        }
    };

    const handleSaveToLibrary = async (item: GeneratedClothing, index: number, view: 'laid out' | 'folded') => {
        const stateKey = `${index}-${view}`;
        setSavingStates(prev => ({ ...prev, [stateKey]: 'saving' }));
        try {
            const imageToSave = view === 'laid out' ? item.laidOutImage : item.foldedImage;
            const itemName = `${item.name} (${view})`;

            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'clothes',
                name: itemName,
                thumbnail: await dataUrlToThumbnail(imageToSave, 256),
                media: imageToSave, // Save single image data URL
                sourceImage: originalImage,
                clothingDetails: details,
            };
            await saveToLibrary(libraryItem);
            setSavingStates(prev => ({ ...prev, [stateKey]: 'saved' }));
        } catch (err) {
            console.error("Failed to save clothing item to library:", err);
            setSavingStates(prev => ({ ...prev, [stateKey]: 'idle' })); // Allow retry on error
        }
    };


  return (
    <div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-accent">Extraction Results</h2>
            <div className="flex gap-4">
                <button
                    onClick={onReset}
                    className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                >
                    <ResetIcon className="w-5 h-5" /> Start Over
                </button>
                <button
                    onClick={handleDownloadAll}
                    disabled={isZipping}
                    className="flex items-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                    {isZipping ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DownloadIcon className="w-5 h-5" />}
                    {isZipping ? 'Zipping...' : 'Download All'}
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Original Image</h3>
                <img src={originalImage} alt="Original input" className="rounded-lg shadow-md w-full" />
            </div>

            <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Extracted Items ({generatedItems.length})</h3>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-4 -mr-4 border border-border-primary rounded-lg p-4 bg-bg-primary/50">
                    {generatedItems.map((item, index) => {
                        const laidOutStateKey = `${index}-laid out`;
                        const foldedStateKey = `${index}-folded`;
                        const laidOutSavingStatus = savingStates[laidOutStateKey] || 'idle';
                        const foldedSavingStatus = savingStates[foldedStateKey] || 'idle';
                        
                        return (
                            <div key={index} className="bg-bg-tertiary p-4 rounded-lg shadow-sm">
                                <h4 className="font-bold text-accent mb-3 text-center sm:text-left">{item.name}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Laid Out Image Card */}
                                    <div className="relative group">
                                        <p className="text-sm font-medium text-text-secondary mb-2 text-center">Laid Out</p>
                                        <img src={item.laidOutImage} alt={`${item.name} laid out`} className="w-full aspect-square object-cover rounded-md bg-bg-secondary" />
                                        <div className="absolute inset-0 bg-black/60 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => handleSaveToLibrary(item, index, 'laid out')}
                                                title={laidOutSavingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                                disabled={laidOutSavingStatus !== 'idle'}
                                                className={`flex items-center gap-2 p-3 rounded-full transition-all duration-200 ${
                                                    laidOutSavingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                    laidOutSavingStatus === 'saving' ? 'bg-bg-secondary text-text-secondary cursor-wait' :
                                                    'bg-bg-secondary/70 text-text-secondary hover:bg-accent hover:text-accent-text'
                                                }`}
                                            >
                                                {laidOutSavingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : laidOutSavingStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                {laidOutSavingStatus === 'idle' && <span className="text-sm font-bold">Save</span>}
                                            </button>
                                        </div>
                                    </div>
                                    {/* Folded Image Card */}
                                    <div className="relative group">
                                        <p className="text-sm font-medium text-text-secondary mb-2 text-center">Folded</p>
                                        <img src={item.foldedImage} alt={`${item.name} folded`} className="w-full aspect-square object-cover rounded-md bg-bg-secondary" />
                                        <div className="absolute inset-0 bg-black/60 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => handleSaveToLibrary(item, index, 'folded')}
                                                title={foldedSavingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                                disabled={foldedSavingStatus !== 'idle'}
                                                className={`flex items-center gap-2 p-3 rounded-full transition-all duration-200 ${
                                                    foldedSavingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                    foldedSavingStatus === 'saving' ? 'bg-bg-secondary text-text-secondary cursor-wait' :
                                                    'bg-bg-secondary/70 text-text-secondary hover:bg-accent hover:text-accent-text'
                                                }`}
                                            >
                                                {foldedSavingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : foldedSavingStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                {foldedSavingStatus === 'idle' && <span className="text-sm font-bold">Save</span>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
  );
};
