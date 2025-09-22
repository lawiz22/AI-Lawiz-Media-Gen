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
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleDownloadText = (content: string, filename: string) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        handleDownload(url, filename);
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
                                <img src={image} alt={name} className="object-contain w-full h-full p-2" style={isPose(item) ? {backgroundColor: 'white'} : {}}/>
                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button
                                        onClick={() => setSelectedItemModal({ ...item, index })}
                                        title="View Details"
                                        className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                    >
                                        <ZoomIcon className="w-5 h-5" />
                                    </button>
                                     <button
                                        onClick={() => handleDownload(image, `${name.replace(/\s+/g, '_')}.png`)}
                                        title="Download Image"
                                        className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                <p className="absolute bottom-0 left-0 p-2 text-white text-xs font-bold truncate max-w-full">{name}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {selectedItemModal && (
                <div 
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={handleCloseModals}
                >
                    <div 
                        className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h2 className="text-xl font-bold text-accent truncate">
                                {isClothing(selectedItemModal) ? selectedItemModal.itemName : isPose(selectedItemModal) ? selectedItemModal.description : (selectedItemModal as GeneratedObject).name}
                            </h2>
                            <button onClick={handleCloseModals} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                            {isPose(selectedItemModal) ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-semibold text-text-secondary">Mannequin</h4>
                                            <button onClick={() => handleDownload(selectedItemModal.image, `${selectedItemModal.description.replace(/\s+/g, '_')}_mannequin.png`)} title="Download Mannequin" className="p-1 rounded-full text-text-muted hover:text-text-primary"><DownloadIcon className="w-4 h-4"/></button>
                                        </div>
                                        <div onClick={() => setZoomedImage({ src: selectedItemModal.image, alt: 'Mannequin' })} className="relative group aspect-square bg-white rounded-lg p-1 cursor-zoom-in"><img src={selectedItemModal.image} className="w-full h-full object-contain" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIcon className="w-10 h-10 text-white"/></div></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <h4 className="text-sm font-semibold text-text-secondary">Skeleton</h4>
                                            <button onClick={() => handleDownload(selectedItemModal.skeletonImage, `${selectedItemModal.description.replace(/\s+/g, '_')}_skeleton.png`)} title="Download Skeleton" className="p-1 rounded-full text-text-muted hover:text-text-primary"><DownloadIcon className="w-4 h-4"/></button>
                                        </div>
                                        <div onClick={() => setZoomedImage({ src: selectedItemModal.skeletonImage, alt: 'Skeleton' })} className="relative group aspect-square bg-black rounded-lg p-1 cursor-zoom-in"><img src={selectedItemModal.skeletonImage} className="w-full h-full object-contain" /><div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIcon className="w-10 h-10 text-white"/></div></div>
                                    </div>
                                </div>
                            ) : (
                                <div className="aspect-square bg-white rounded-lg p-2 flex items-center justify-center">
                                    <img src={isClothing(selectedItemModal) ? selectedItemModal.laidOutImage : (selectedItemModal as GeneratedObject).image} className="max-w-full max-h-full object-contain" />
                                </div>
                            )}
                        </div>
                        
                        <div className="pt-4 mt-4 border-t border-border-primary flex-shrink-0 flex flex-wrap gap-2 justify-end">
                             {isPose(selectedItemModal) && selectedItemModal.generationPrompt && (
                                <button onClick={() => setTextViewer({ title: 'Mannequin Generation Prompt', content: selectedItemModal.generationPrompt! })} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover">
                                    <DocumentTextIcon className="w-5 h-5"/> View Prompt
                                </button>
                            )}
                            {isPose(selectedItemModal) && (
                                <button onClick={() => setTextViewer({ title: 'Pose JSON (ControlNet)', content: JSON.stringify(selectedItemModal.poseJson, null, 2) })} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover">
                                    <CodeBracketIcon className="w-5 h-5"/> View JSON
                                </button>
                            )}
                            <button onClick={() => onSave(selectedItemModal, selectedItemModal.index)} disabled={selectedItemModal.saved !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors ${selectedItemModal.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}>
                                {selectedItemModal.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : selectedItemModal.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                {selectedItemModal.saved === 'saving' ? 'Saving...' : selectedItemModal.saved === 'saved' ? 'Saved' : 'Save to Library'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {textViewer && (
                <div className="fixed inset-0 bg-black/80 z-[51] flex items-center justify-center p-4" onClick={() => setTextViewer(null)}>
                    <div className="bg-bg-secondary w-full max-w-2xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h3 className="text-xl font-bold text-accent">{textViewer.title}</h3>
                            <button onClick={() => setTextViewer(null)} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="w-5 h-5"/></button>
                        </div>
                        <div className="relative flex-grow bg-bg-primary rounded-md overflow-hidden">
                            <pre className="h-full overflow-auto p-4 text-xs text-text-secondary whitespace-pre-wrap font-mono">{textViewer.content}</pre>
                        </div>
                         <div className="pt-4 mt-4 border-t border-border-primary flex-shrink-0 flex flex-wrap gap-2 justify-end">
                            <button onClick={() => handleDownloadText(textViewer.content, `${textViewer.title.replace(/\s/g, '_')}${textViewer.title.includes('JSON') ? '.json' : '.txt'}`)} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover">
                                <DownloadIcon className="w-5 h-5"/> Download
                            </button>
                            <button onClick={handleCopyText} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover">
                                <CopyIcon className="w-5 h-5"/>{textCopyButton}
                            </button>
                         </div>
                    </div>
                </div>
            )}

            {zoomedImage && (
                <div className="fixed inset-0 bg-black/90 z-[52] flex items-center justify-center p-4" onClick={() => setZoomedImage(null)}>
                     <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
                        <img src={zoomedImage.src} alt={zoomedImage.alt} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" style={{ maxHeight: '90vh', maxWidth: '90vw' }} />
                        <button onClick={() => setZoomedImage(null)} className="absolute -top-3 -right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 transition-colors"><CloseIcon className="w-6 h-6"/></button>
                     </div>
                </div>
            )}
        </>
    );
};