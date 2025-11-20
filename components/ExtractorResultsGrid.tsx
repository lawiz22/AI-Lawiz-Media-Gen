
import React, { useState, useCallback, useEffect } from 'react';
import type { GeneratedClothing, GeneratedObject, GeneratedPose } from '../types';
import { DownloadIcon, SaveIcon, SpinnerIcon, CheckIcon, CloseIcon, CodeBracketIcon, CopyIcon, DocumentTextIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ExtractorResultsGridProps {
  items: (GeneratedClothing | GeneratedObject | GeneratedPose)[];
  onSave: (item: GeneratedClothing | GeneratedObject | GeneratedPose, index: number) => void;
  title: string;
}

const isClothing = (item: any): item is GeneratedClothing => 'itemName' in item;
const isPose = (item: any): item is GeneratedPose => 'poseJson' in item || 'mannequinStyle' in item;

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
        if (!dataUrl) return;
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

    const getModalImage = (item: any) => {
        if (isClothing(item)) return item.laidOutImage;
        if (isPose(item)) return item.mode === 'controlnet-json' && item.skeletonImage ? item.skeletonImage : (item.image || '');
        return item.image;
    };

    const getDescriptionText = (item: any) => {
        if (isClothing(item)) return item.itemName; 
        if (isPose(item)) return item.description;
        return item.name;
    };

    return (
        <>
            <div className="space-y-4 w-full">
                <h3 className="text-xl font-bold text-accent">{title}</h3>
                {/* Responsive grid to prevent overlap */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                    {items.map((item, index) => {
                        let name: string, image: string;
                        if (isClothing(item)) { 
                            name = item.itemName; 
                            image = item.laidOutImage; 
                        } else if (isPose(item)) { 
                            name = item.mode === 'controlnet-json' ? 'Pose Skeleton' : 'Mannequin'; 
                            image = item.mode === 'controlnet-json' && item.skeletonImage ? item.skeletonImage : (item.image || '');
                        } else { 
                            name = (item as GeneratedObject).name; 
                            image = item.image; 
                        }

                        return (
                             <div key={index} className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer" onClick={() => setSelectedItemIndex(index)}>
                                <img src={image} alt={name} className="object-contain w-full h-full p-2" />
                                
                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 gap-3 z-10">
                                    <div className="text-center text-white w-full px-2">
                                        <p className="text-sm font-bold truncate w-full">{name}</p>
                                        {isPose(item) && (
                                            <p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider">
                                                {item.mode === 'controlnet-json' ? 'JSON Skeleton' : 'Mannequin'}
                                            </p>
                                        )}
                                    </div>

                                    {/* Thumb Action Buttons */}
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                         {isPose(item) && item.mode === 'controlnet-json' ? (
                                            <>
                                                <button 
                                                    onClick={() => handleDownload(item.skeletonImage || '', `${item.description}_skeleton`)} 
                                                    className="p-2 rounded-full bg-bg-secondary/90 text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Download Skeleton"
                                                >
                                                    <DownloadIcon className="w-4 h-4"/>
                                                </button>
                                                <button 
                                                    onClick={() => handleDownloadText(JSON.stringify(item.poseJson, null, 2), `${item.description}_pose.json`)} 
                                                    className="p-2 rounded-full bg-bg-secondary/90 text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Download JSON"
                                                >
                                                    <CodeBracketIcon className="w-4 h-4"/>
                                                </button>
                                            </>
                                        ) : (
                                            <button 
                                                onClick={() => handleDownload(image, name)} 
                                                className="p-2 rounded-full bg-bg-secondary/90 text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                title="Download Image"
                                            >
                                                <DownloadIcon className="w-4 h-4"/>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => onSave(item, index)}
                                            disabled={item.saved !== 'idle'}
                                            className={`p-2 rounded-full transition-colors shadow-lg ${item.saved === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-secondary/90 text-text-primary hover:bg-accent hover:text-accent-text'}`}
                                            title={item.saved === 'saved' ? 'Saved' : 'Save to Library'}
                                        >
                                            {item.saved === 'saving' ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : item.saved === 'saved' ? <CheckIcon className="w-4 h-4"/> : <SaveIcon className="w-4 h-4"/>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedItemModal && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={handleCloseModals}>
                    {items.length > 1 && (
                        <>
                            <button onClick={(e) => { e.stopPropagation(); handlePrevItem(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors z-50" aria-label="Previous">
                                <ChevronLeftIcon className="w-8 h-8" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleNextItem(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text transition-colors z-50" aria-label="Next">
                                <ChevronRightIcon className="w-8 h-8" />
                            </button>
                        </>
                    )}
                    
                    <div className="bg-bg-secondary w-full max-w-6xl rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh] h-full md:h-auto" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-start justify-between p-6 border-b border-border-primary flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent truncate pr-8">
                                {isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? (selectedItemModal.mode === 'controlnet-json' ? 'Pose Analysis' : 'Mannequin Result') : (selectedItemModal as GeneratedObject).name}
                            </h3>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>

                        {/* Modal Body - Flex container to handle overflow properly */}
                        <div className="flex-1 min-h-0 overflow-hidden p-6">
                            <div className="flex flex-col lg:flex-row gap-6 h-full">
                                
                                {/* Image Column */}
                                <div className="lg:w-1/2 flex items-center justify-center bg-black/20 rounded-lg p-2 h-1/2 lg:h-full overflow-hidden relative border border-border-primary/30 flex-shrink-0">
                                    <img 
                                        src={getModalImage(selectedItemModal)} 
                                        alt="Result" 
                                        className="max-h-full max-w-full object-contain rounded-md shadow-sm" 
                                    />
                                     {isClothing(selectedItemModal) && selectedItemModal.foldedImage && (
                                         <div className="absolute bottom-2 right-2 w-1/3 border-2 border-white rounded-lg shadow-lg overflow-hidden">
                                            <img src={selectedItemModal.foldedImage} alt="Folded" className="w-full h-auto" />
                                         </div>
                                     )}
                                </div>

                                {/* Details & Actions Column */}
                                <div className="lg:w-1/2 flex flex-col h-1/2 lg:h-full min-h-0">
                                    
                                    {/* Scrollable Text Area */}
                                    <div className="flex-1 overflow-y-auto pr-2 mb-4 min-h-0">
                                        <div className="flex items-center justify-between mb-2 sticky top-0 bg-bg-secondary z-10 py-1">
                                            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                                                {isPose(selectedItemModal) && selectedItemModal.mode === 'controlnet-json' ? 'Detailed Analysis' : 'Description'}
                                            </h4>
                                            <button 
                                                onClick={() => { navigator.clipboard.writeText(getDescriptionText(selectedItemModal)); }}
                                                className="text-[10px] flex items-center gap-1 text-accent hover:text-accent-hover"
                                            >
                                                <CopyIcon className="w-3 h-3" /> Copy Text
                                            </button>
                                        </div>
                                        <div className="bg-bg-primary border border-border-primary rounded-md p-3">
                                            <p className="text-[10px] leading-relaxed font-mono text-text-secondary whitespace-pre-wrap">
                                                {getDescriptionText(selectedItemModal)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Fixed Action Buttons Area */}
                                    <div className="flex-shrink-0 pt-4 border-t border-border-primary">
                                        {isPose(selectedItemModal) && selectedItemModal.mode === 'controlnet-json' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                                <button 
                                                    onClick={() => handleDownload(selectedItemModal.skeletonImage || '', `${selectedItemModal.description}_skeleton`)} 
                                                    className="flex items-center justify-center gap-2 px-3 py-3 bg-bg-tertiary text-text-primary font-semibold rounded-lg hover:bg-bg-tertiary-hover transition-colors text-xs"
                                                >
                                                    <DownloadIcon className="w-4 h-4"/> Download Skeleton
                                                </button>
                                                <button 
                                                    onClick={() => handleDownloadText(JSON.stringify(selectedItemModal.poseJson, null, 2), `${selectedItemModal.description}_pose.json`)} 
                                                    className="flex items-center justify-center gap-2 px-3 py-3 bg-bg-tertiary text-text-primary font-semibold rounded-lg hover:bg-bg-tertiary-hover transition-colors text-xs"
                                                >
                                                    <CodeBracketIcon className="w-4 h-4"/> Download JSON
                                                </button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleDownload(getModalImage(selectedItemModal), isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? selectedItemModal.description : (selectedItemModal as GeneratedObject).name)} 
                                                className="flex items-center justify-center gap-2 px-4 py-3 bg-bg-tertiary text-text-primary font-semibold rounded-lg hover:bg-bg-tertiary-hover transition-colors w-full mb-3"
                                            >
                                                <DownloadIcon className="w-5 h-5"/> Download Image
                                            </button>
                                        )}

                                        <button
                                            onClick={() => onSave(selectedItemModal, selectedItemModal.index)}
                                            disabled={selectedItemModal.saved !== 'idle'}
                                            className={`w-full flex items-center justify-center gap-2 px-4 py-3 font-bold rounded-lg transition-colors ${selectedItemModal.saved === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}
                                        >
                                            {selectedItemModal.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : selectedItemModal.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                            {selectedItemModal.saved === 'saving' ? 'Saving...' : selectedItemModal.saved === 'saved' ? 'Saved to Library' : 'Save to Library'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {textViewer && (
                <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={handleCloseModals}>
                     <div className="bg-bg-secondary w-full max-w-xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent">{textViewer.title}</h3>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>
                         <pre className="flex-grow bg-bg-primary p-3 rounded-md overflow-auto text-[10px] text-text-secondary whitespace-pre-wrap font-mono">
                            <code>{textViewer.content}</code>
                        </pre>
                        <div className="mt-4 flex-shrink-0 grid grid-cols-2 gap-4">
                            <button onClick={() => handleDownloadText(textViewer.content, `${textViewer.title.replace(/\s+/g, '_')}.json`)} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5"/> Download JSON</button>
                            <button onClick={handleCopyText} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><CopyIcon className="w-5 h-5"/> {textCopyButton}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
