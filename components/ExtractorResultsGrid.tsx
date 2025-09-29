import React, { useState, useCallback, useEffect } from 'react';
import type { GeneratedClothing, GeneratedObject, GeneratedPose } from '../types';
import { DownloadIcon, SaveIcon, SpinnerIcon, CheckIcon, CloseIcon, CodeBracketIcon, CopyIcon, DocumentTextIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ExtractorResultsGridProps {
  items: (GeneratedClothing | GeneratedObject | GeneratedPose)[];
  onSave: (item: GeneratedClothing | GeneratedObject | GeneratedPose, index: number) => void;
  title: string;
}

const isClothing = (item: any): item is GeneratedClothing => 'itemName' in item;
const isPose = (item: any): item is GeneratedPose => 'poseJson' in item;

const sanitizeForFilename = (text: string, maxLength: number = 40): string => {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/__+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, maxLength);
};

export const ExtractorResultsGrid: React.FC<ExtractorResultsGridProps> = ({ items, onSave, title }) => {
    const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
    const [textViewer, setTextViewer] = useState<{ title: string; content: string } | null>(null);
    const [textCopyButton, setTextCopyButton] = useState('Copy');
    
    const selectedItemModal = selectedItemIndex !== null ? { ...items[selectedItemIndex], index: selectedItemIndex } : null;

    const handleCloseModals = useCallback(() => {
        setSelectedItemIndex(null);
        setTextViewer(null);
    }, []);

    const handleNextItem = useCallback(() => {
        if (selectedItemIndex !== null && items.length > 1) {
            setSelectedItemIndex(prev => (prev! + 1) % items.length);
        }
    }, [selectedItemIndex, items.length]);

    const handlePrevItem = useCallback(() => {
        if (selectedItemIndex !== null && items.length > 1) {
            setSelectedItemIndex(prev => (prev! - 1 + items.length) % items.length);
        }
    }, [selectedItemIndex, items.length]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (textViewer) setTextViewer(null);
            else handleCloseModals();
        }
         if (selectedItemModal) {
            if (e.key === 'ArrowRight') handleNextItem();
            if (e.key === 'ArrowLeft') handlePrevItem();
        }
    }, [textViewer, handleCloseModals, selectedItemModal, handleNextItem, handlePrevItem]);

    useEffect(() => {
        if (selectedItemModal !== null || textViewer !== null) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedItemModal, textViewer, handleKeyDown]);
    
    const handleDownload = (dataUrl: string, name: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        const baseName = sanitizeForFilename(name);
        const randomPart = Math.random().toString(36).substring(2, 7);
        link.download = `${baseName}_${randomPart}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleDownloadText = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleCopyText = () => {
        if (!textViewer) return;
        navigator.clipboard.writeText(textViewer.content).then(() => {
            setTextCopyButton('Copied!');
            setTimeout(() => setTextCopyButton('Copy'), 2000);
        });
    };

    if (items.length === 0) {
        return null;
    }

    return (
        <>
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-accent">{title}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {items.map((item, index) => {
                        let name: string, image: string;
                        if (isClothing(item)) { name = item.itemName; image = item.laidOutImage; } 
                        else if (isPose(item)) { name = item.description; image = item.image; } 
                        else { name = (item as GeneratedObject).name; image = item.image; }

                        return (
                             <div key={index} className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer" onClick={() => setSelectedItemIndex(index)}>
                                <img src={image} alt={name} className="object-contain w-full h-full p-2" />
                                
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                    <div className="text-center text-white">
                                        <p className="text-sm font-bold truncate">{name}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Details/Zoom Modal */}
            {selectedItemModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleCloseModals}>
                    {items.length > 1 && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handlePrevItem(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors" aria-label="Previous item">
                                <ChevronLeftIcon className="w-8 h-8" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleNextItem(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors" aria-label="Next item">
                                <ChevronRightIcon className="w-8 h-8" />
                            </button>
                        </>
                    )}
                    <div className="bg-bg-secondary w-full max-w-5xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4 flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent">{isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? selectedItemModal.description : (selectedItemModal as GeneratedObject).name}</h3>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>

                        <div className="flex-grow overflow-y-auto pr-2 -mr-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                           {isClothing(selectedItemModal) ? (
                                <>
                                    <div className="space-y-2"><h4 className="text-sm font-semibold text-text-secondary text-center">Laid Out</h4><img src={selectedItemModal.laidOutImage} alt="Laid out" className="w-full rounded-lg bg-bg-primary p-2"/></div>
                                    {selectedItemModal.foldedImage && <div className="space-y-2"><h4 className="text-sm font-semibold text-text-secondary text-center">Folded</h4><img src={selectedItemModal.foldedImage} alt="Folded" className="w-full rounded-lg bg-bg-primary p-2"/></div>}
                                </>
                           ) : isPose(selectedItemModal) ? (
                                <>
                                    <div className="space-y-2"><h4 className="text-sm font-semibold text-text-secondary text-center">Mannequin</h4><img src={selectedItemModal.image} alt="Mannequin" className="w-full rounded-lg bg-white p-2"/></div>
                                    <div className="space-y-2"><h4 className="text-sm font-semibold text-text-secondary text-center">Skeleton</h4><img src={selectedItemModal.skeletonImage} alt="Skeleton" className="w-full rounded-lg bg-black p-2"/></div>
                                </>
                           ) : (
                                <div className="md:col-span-2 flex items-center justify-center">
                                    <img src={(selectedItemModal as GeneratedObject).image} alt={(selectedItemModal as GeneratedObject).name} className="max-w-full max-h-[60vh] object-contain rounded-lg"/>
                                </div>
                           )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-border-primary flex-shrink-0 flex flex-wrap items-center justify-center gap-4">
                           {isClothing(selectedItemModal) && (
                                <>
                                    <button onClick={() => handleDownload(selectedItemModal.laidOutImage, `${selectedItemModal.itemName}_laid_out`)} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Download Laid Out</button>
                                    {selectedItemModal.foldedImage && <button onClick={() => handleDownload(selectedItemModal.foldedImage, `${selectedItemModal.itemName}_folded`)} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Download Folded</button>}
                                </>
                           )}
                           {isPose(selectedItemModal) && (
                                <>
                                    <button onClick={() => handleDownload(selectedItemModal.image, `${selectedItemModal.description}_mannequin`)} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Mannequin</button>
                                    <button onClick={() => handleDownload(selectedItemModal.skeletonImage, `${selectedItemModal.description}_skeleton`)} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Skeleton</button>
                                    <button onClick={() => setTextViewer({title: 'Mannequin Generation Prompt', content: selectedItemModal.generationPrompt || ''})} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DocumentTextIcon className="w-5 h-5"/> Prompt</button>
                                    <button onClick={() => setTextViewer({title: 'Pose JSON (ControlNet)', content: JSON.stringify(selectedItemModal.poseJson, null, 2)})} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><CodeBracketIcon className="w-5 h-5"/> JSON</button>
                                </>
                           )}
                           {!isClothing(selectedItemModal) && !isPose(selectedItemModal) && <button onClick={() => handleDownload((selectedItemModal as GeneratedObject).image, (selectedItemModal as GeneratedObject).name)} className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Download</button>}

                            <button
                                onClick={() => onSave(selectedItemModal, selectedItemModal.index)}
                                disabled={selectedItemModal.saved !== 'idle'}
                                className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors ${selectedItemModal.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}
                            >
                                {selectedItemModal.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : selectedItemModal.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                {selectedItemModal.saved === 'saving' ? 'Saving...' : selectedItemModal.saved === 'saved' ? 'Saved' : 'Save to Library'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Text Viewer Modal */}
            {textViewer && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={handleCloseModals}>
                     <div className="bg-bg-secondary w-full max-w-xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent">{textViewer.title}</h3>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>
                         <pre className="flex-grow bg-bg-primary p-3 rounded-md overflow-auto text-xs text-text-secondary whitespace-pre-wrap font-mono">
                            <code>{textViewer.content}</code>
                        </pre>
                        <div className="mt-4 flex-shrink-0 grid grid-cols-2 gap-4">
                            <button onClick={() => handleDownloadText(textViewer.content, `${textViewer.title.replace(/\s+/g, '_')}.txt`)} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Download</button>
                            <button onClick={handleCopyText} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><CopyIcon className="w-5 h-5"/> {textCopyButton}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
