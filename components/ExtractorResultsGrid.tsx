import React, { useState, useCallback, useEffect } from 'react';
import type { GeneratedClothing, GeneratedObject, GeneratedPose } from '../types';
import { DownloadIcon, SaveIcon, SpinnerIcon, CheckIcon, CloseIcon, CodeBracketIcon, CopyIcon, DocumentTextIcon, ZoomIcon } from './icons';

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
    const [selectedItemModal, setSelectedItemModal] = useState<(GeneratedClothing | GeneratedObject | GeneratedPose) & { index: number } | null>(null);
    const [textViewer, setTextViewer] = useState<{ title: string; content: string } | null>(null);
    const [textCopyButton, setTextCopyButton] = useState('Copy');
    const [zoomedImage, setZoomedImage] = useState<{ src: string, alt: string } | null>(null);

    const handleCloseModals = useCallback(() => {
        setSelectedItemModal(null);
        setTextViewer(null);
        setZoomedImage(null);
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (zoomedImage) setZoomedImage(null);
            else if (textViewer) setTextViewer(null);
            else handleCloseModals();
        }
    }, [zoomedImage, textViewer, handleCloseModals]);

    useEffect(() => {
        if (selectedItemModal !== null || textViewer !== null || zoomedImage !== null) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedItemModal, textViewer, zoomedImage, handleKeyDown]);
    
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
                             <div key={index} className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md">
                                <img src={image} alt={name} className="object-contain w-full h-full p-2" />
                                
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2"
                                    onClick={() => setSelectedItemModal({ ...item, index })}
                                >
                                    <div className="text-center text-white">
                                        <p className="text-sm font-bold truncate">{name}</p>
                                        <p className="text-xs">Click for details</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Zoomed Image Modal */}
            {zoomedImage && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        <img src={zoomedImage.src} alt={zoomedImage.alt} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }} />
                        <button onClick={() => setZoomedImage(null)} className="absolute -top-2 -right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75"><CloseIcon className="w-5 h-5"/></button>
                    </div>
                </div>
            )}

            {/* Details Modal */}
            {selectedItemModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={handleCloseModals}>
                    <div className="bg-bg-secondary w-full max-w-2xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent">{isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? selectedItemModal.description : (selectedItemModal as GeneratedObject).name}</h3>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>

                        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Images */}
                                <div className="space-y-4">
                                   {isClothing(selectedItemModal) ? (
                                        <>
                                            <div className="relative"><img src={selectedItemModal.laidOutImage} alt="Laid out" className="w-full rounded-lg"/><button onClick={() => setZoomedImage({src: selectedItemModal.laidOutImage, alt: 'Laid out'})} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"><ZoomIcon className="w-5 h-5"/></button></div>
                                            {selectedItemModal.foldedImage && <div className="relative"><img src={selectedItemModal.foldedImage} alt="Folded" className="w-full rounded-lg"/><button onClick={() => setZoomedImage({src: selectedItemModal.foldedImage, alt: 'Folded'})} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"><ZoomIcon className="w-5 h-5"/></button></div>}
                                        </>
                                   ) : isPose(selectedItemModal) ? (
                                        <>
                                            <div><h4 className="text-sm font-semibold text-text-secondary mb-1">Mannequin</h4><div className="relative"><img src={selectedItemModal.image} alt="Mannequin" className="w-full rounded-lg bg-white p-2"/><button onClick={() => setZoomedImage({src: selectedItemModal.image, alt: 'Mannequin'})} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"><ZoomIcon className="w-5 h-5"/></button></div></div>
                                            <div><h4 className="text-sm font-semibold text-text-secondary mb-1">Skeleton</h4><div className="relative"><img src={selectedItemModal.skeletonImage} alt="Skeleton" className="w-full rounded-lg bg-black p-2" style={{filter: 'invert(1)'}}/><button onClick={() => setZoomedImage({src: selectedItemModal.skeletonImage, alt: 'Skeleton'})} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"><ZoomIcon className="w-5 h-5"/></button></div></div>
                                        </>
                                   ) : (
                                        <div className="relative"><img src={(selectedItemModal as GeneratedObject).image} alt={(selectedItemModal as GeneratedObject).name} className="w-full rounded-lg"/><button onClick={() => setZoomedImage({src: (selectedItemModal as GeneratedObject).image, alt: (selectedItemModal as GeneratedObject).name})} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"><ZoomIcon className="w-5 h-5"/></button></div>
                                   )}
                                </div>
                                {/* Actions and Details */}
                                <div className="space-y-4">
                                    {isPose(selectedItemModal) && selectedItemModal.generationPrompt && (
                                        <button onClick={() => setTextViewer({title: 'Mannequin Generation Prompt', content: selectedItemModal.generationPrompt || ''})} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><DocumentTextIcon className="w-5 h-5"/> View Prompt</button>
                                    )}
                                    {isPose(selectedItemModal) && selectedItemModal.poseJson && (
                                        <button onClick={() => setTextViewer({title: 'Pose JSON (ControlNet)', content: JSON.stringify(selectedItemModal.poseJson, null, 2)})} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><CodeBracketIcon className="w-5 h-5"/> View JSON</button>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                         <button
                                            onClick={() => handleDownload(
                                                isClothing(selectedItemModal) ? selectedItemModal.laidOutImage : isPose(selectedItemModal) ? selectedItemModal.image : (selectedItemModal as GeneratedObject).image,
                                                isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? selectedItemModal.description : (selectedItemModal as GeneratedObject).name
                                            )}
                                            className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"
                                        >
                                            <DownloadIcon className="w-5 h-5"/> Download
                                        </button>
                                        <button
                                            onClick={() => onSave(selectedItemModal, selectedItemModal.index)}
                                            disabled={selectedItemModal.saved !== 'idle'}
                                            className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors ${selectedItemModal.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}
                                        >
                                            {selectedItemModal.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : selectedItemModal.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                            {selectedItemModal.saved === 'saving' ? 'Saving...' : selectedItemModal.saved === 'saved' ? 'Saved' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>
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