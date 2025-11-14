import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { setExtractorItemSaveStatus, updateExtractorState, resetExtractorState } from '../store/extractorSlice';
import { addToLibrary } from '../store/librarySlice';
import { ImageUploader } from './ImageUploader';
import { LoadingState } from './LoadingState';
import { ExtractorResultsGrid } from './ExtractorResultsGrid';
import { generateClothingImage, identifyClothing, identifyObjects, generateObjectImage, generatePoseMannequin, generatePoseDescription, generateFontChart } from '../services/geminiService';
import { detectPosesInImage } from '../services/mediaPipeService';
import { mediaPipeToOpenPose, renderPoseSkeleton } from '../utils/poseRenderer';
import type { GeneratedClothing, IdentifiedClothing, IdentifiedObject, GeneratedObject, ExtractorState, GeneratedPose, MannequinStyle, LibraryItem } from '../types';
// Fix: Imported the missing icon components (DownloadIcon, SaveIcon, CheckIcon) to resolve "Cannot find name" errors.
import { GenerateIcon, TshirtIcon, CubeIcon, SpinnerIcon, ResetIcon, LibraryIcon, PoseIcon, FontIcon, DownloadIcon, SaveIcon, CheckIcon } from './icons';
import { dataUrlToThumbnail, fileToResizedDataUrl } from '../utils/imageUtils';

// --- Helper Components ---

const ToolHeader: React.FC<{ icon: React.ReactNode, title: string, description: string }> = ({ icon, title, description }) => (
    <div className="border-b-2 border-accent/30 pb-4 mb-6">
        <div className="flex items-center gap-3 mb-2">
            <div className="bg-accent p-2 rounded-lg text-accent-text">{icon}</div>
            <h2 className="text-2xl font-bold text-accent">{title}</h2>
        </div>
        <p className="text-sm text-text-secondary">{description}</p>
    </div>
);

interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  tabs: SubTab[];
  activeTab: string;
  onTabClick: (id: string) => void;
}

const SubTabs: React.FC<SubTabsProps> = ({ tabs, activeTab, onTabClick }) => (
    <div className="flex items-center border-b-2 border-border-primary mb-8 -mt-2">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-semibold transition-colors duration-200 border-b-2 ${
                    activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);


interface ExtractorToolsPanelProps {
    onOpenLibraryForClothes: () => void;
    onOpenLibraryForObjects: () => void;
    onOpenLibraryForPoses: () => void;
    onOpenLibraryForMannequinRef: () => void;
    onOpenLibraryForFont: () => void;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
}


// --- Main Component ---
export const ExtractorToolsPanel: React.FC<ExtractorToolsPanelProps> = ({
    onOpenLibraryForClothes,
    onOpenLibraryForObjects,
    onOpenLibraryForPoses,
    onOpenLibraryForMannequinRef,
    onOpenLibraryForFont,
    activeSubTab,
    setActiveSubTab,
}) => {
    const dispatch: AppDispatch = useDispatch();
    const state = useSelector((state: RootState) => state.extractor.extractorState);

    const {
        clothesSourceFile, clothesDetails, isIdentifying, identifiedItems, isGenerating, generatedClothes, clothesError, generateFolded, excludeAccessories,
        objectSourceFile, objectHints, maxObjects, isIdentifyingObjects, identifiedObjects, isGeneratingObjects, generatedObjects, objectError,
        poseSourceFile, isGeneratingPoses, generatedPoses, poseError, mannequinStyle, mannequinReferenceFile,
        fontSourceFile, isGeneratingFont, generatedFontChart, fontError
    } = state;

    // --- Clothes ---
    const handleIdentify = async () => {
        if (!clothesSourceFile) return;
        dispatch(updateExtractorState({ isIdentifying: true, identifiedItems: [], clothesError: null, generatedClothes: [] }));
        try {
            const items = await identifyClothing(clothesSourceFile, clothesDetails, excludeAccessories);
            dispatch(updateExtractorState({ identifiedItems: items.map(item => ({ ...item, selected: true })) }));
        } catch (err: any) {
            dispatch(updateExtractorState({ clothesError: err.message || "Failed to identify clothing." }));
        } finally {
            dispatch(updateExtractorState({ isIdentifying: false }));
        }
    };

    const handleGenerateClothes = async () => {
        const selected = identifiedItems.filter(item => item.selected);
        if (!clothesSourceFile || selected.length === 0) return;

        dispatch(updateExtractorState({ isGenerating: true, generatedClothes: [], clothesError: null }));
        const results: GeneratedClothing[] = [];
        try {
            for (const item of selected) {
                const laidOutImage = await generateClothingImage(clothesSourceFile, item.itemName, 'laid out');
                let foldedImage: string | undefined = undefined;
                if (generateFolded) {
                    try {
                        foldedImage = await generateClothingImage(clothesSourceFile, item.itemName, 'folded');
                    } catch (e) {
                        console.warn(`Could not generate folded image for ${item.itemName}:`, e);
                    }
                }
                results.push({ itemName: item.itemName, laidOutImage, foldedImage, saved: 'idle' });
            }
            dispatch(updateExtractorState({ generatedClothes: results }));
        } catch (err: any) {
            dispatch(updateExtractorState({ clothesError: err.message || "Failed to generate clothing images." }));
        } finally {
            dispatch(updateExtractorState({ isGenerating: false }));
        }
    };
    
    const handleSaveClothing = async (item: GeneratedClothing, index: number) => {
        if (!clothesSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'clothes',
                name: item.itemName,
                media: item.laidOutImage,
                thumbnail: await dataUrlToThumbnail(item.laidOutImage, 256),
                sourceImage: await fileToResizedDataUrl(clothesSourceFile, 512),
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save clothing to library:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'idle' }));
        }
    };
    
    const handleToggleClothingItem = (index: number) => {
        const newItems = identifiedItems.map((item, i) => 
            i === index ? { ...item, selected: !item.selected } : item
        );
        dispatch(updateExtractorState({ identifiedItems: newItems }));
    };

    const handleSelectAllClothes = (select: boolean) => {
        const newItems = identifiedItems.map(item => ({ ...item, selected: select }));
        dispatch(updateExtractorState({ identifiedItems: newItems }));
    };


    // --- Objects ---
    const handleIdentifyObjects = async () => {
        if (!objectSourceFile) return;
        dispatch(updateExtractorState({ isIdentifyingObjects: true, identifiedObjects: [], objectError: null, generatedObjects: [] }));
        try {
            const items = await identifyObjects(objectSourceFile, maxObjects, objectHints);
            dispatch(updateExtractorState({ identifiedObjects: items.map(item => ({ ...item, selected: true })) }));
        } catch (err: any) {
            dispatch(updateExtractorState({ objectError: err.message || "Failed to identify objects." }));
        } finally {
            dispatch(updateExtractorState({ isIdentifyingObjects: false }));
        }
    };
    
    const handleGenerateObjects = async () => {
        const selected = identifiedObjects.filter(item => item.selected);
        if (!objectSourceFile || selected.length === 0) return;

        dispatch(updateExtractorState({ isGeneratingObjects: true, generatedObjects: [], objectError: null }));
        const results: GeneratedObject[] = [];
        try {
            for (const item of selected) {
                const image = await generateObjectImage(objectSourceFile, item.name);
                results.push({ name: item.name, image, saved: 'idle' });
            }
            dispatch(updateExtractorState({ generatedObjects: results }));
        } catch (err: any) {
            dispatch(updateExtractorState({ objectError: err.message || "Failed to generate object images." }));
        } finally {
            dispatch(updateExtractorState({ isGeneratingObjects: false }));
        }
    };

    const handleSaveObject = async (item: GeneratedObject, index: number) => {
        if (!objectSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'objects', index, status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'object', name: item.name, media: item.image,
                thumbnail: await dataUrlToThumbnail(item.image, 256),
                sourceImage: await fileToResizedDataUrl(objectSourceFile, 512),
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'objects', index, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save object:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'objects', index, status: 'idle' }));
        }
    };

    const handleToggleObjectItem = (index: number) => {
        const newItems = identifiedObjects.map((item, i) => 
            i === index ? { ...item, selected: !item.selected } : item
        );
        dispatch(updateExtractorState({ identifiedObjects: newItems }));
    };

    const handleSelectAllObjects = (select: boolean) => {
        const newItems = identifiedObjects.map(item => ({ ...item, selected: select }));
        dispatch(updateExtractorState({ identifiedObjects: newItems }));
    };
    
    // --- Poses ---
    const handleGeneratePoses = async () => {
        if (!poseSourceFile || !mannequinReferenceFile) return;
        dispatch(updateExtractorState({ isGeneratingPoses: true, generatedPoses: [], poseError: null }));
        try {
            const { poseLandmarks, handLandmarks, handedness, faceLandmarks, width, height } = await detectPosesInImage(poseSourceFile);
            if (poseLandmarks.length === 0) {
                throw new Error("No poses could be detected in the image.");
            }
            const allGeneratedPoses: GeneratedPose[] = [];
            for (let i = 0; i < poseLandmarks.length; i++) {
                const poseData = mediaPipeToOpenPose(poseLandmarks[i], handLandmarks, handedness, faceLandmarks[i], width, height);
                const { image, prompt: generationPrompt } = await generatePoseMannequin(poseSourceFile, mannequinStyle, mannequinReferenceFile);
                const skeletonImage = renderPoseSkeleton(poseData);
                const description = await generatePoseDescription(poseSourceFile, poseData);

                allGeneratedPoses.push({
                    description, image, skeletonImage, poseJson: poseData,
                    mannequinStyle, generationPrompt, saved: 'idle',
                });
            }
            dispatch(updateExtractorState({ generatedPoses: allGeneratedPoses }));
        } catch (err: any) {
            dispatch(updateExtractorState({ poseError: err.message || "An unknown error occurred during pose generation." }));
        } finally {
            dispatch(updateExtractorState({ isGeneratingPoses: false }));
        }
    };
    
    const handleSavePose = async (item: GeneratedPose, index: number) => {
        if (!poseSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'pose', name: item.description, media: item.image,
                thumbnail: await dataUrlToThumbnail(item.image, 256),
                sourceImage: await fileToResizedDataUrl(poseSourceFile, 512),
                poseJson: JSON.stringify(item.poseJson),
                skeletonImage: item.skeletonImage,
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save pose:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'idle' }));
        }
    };

    // --- Font ---
    const handleGenerateFont = async () => {
        if (!fontSourceFile) return;
        dispatch(updateExtractorState({ isGeneratingFont: true, generatedFontChart: null, fontError: null }));
        try {
            const chartSrc = await generateFontChart(fontSourceFile);
            dispatch(updateExtractorState({ generatedFontChart: { src: chartSrc, saved: 'idle' } }));
        } catch (err: any) {
            dispatch(updateExtractorState({ fontError: err.message || "An unknown error occurred." }));
        } finally {
            dispatch(updateExtractorState({ isGeneratingFont: false }));
        }
    };

    const handleSaveFont = async () => {
        if (!generatedFontChart || !fontSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'font', status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'font',
                name: `Font from ${fontSourceFile.name}`,
                media: generatedFontChart.src,
                thumbnail: await dataUrlToThumbnail(generatedFontChart.src, 256),
                sourceImage: await fileToResizedDataUrl(fontSourceFile, 512),
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'font', status: 'saved' }));
        } catch (err) {
            console.error("Failed to save font:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'font', status: 'idle' }));
        }
    };

    const handleReset = () => {
        dispatch(resetExtractorState());
    };

    const subTabs = [
        { id: 'clothes', label: 'Clothes' },
        { id: 'objects', label: 'Objects' },
        { id: 'poses', label: 'Poses' },
        { id: 'font', label: 'Font' },
    ];
    
    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto">
            <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

            <div className={activeSubTab === 'clothes' ? 'block' : 'hidden'}>
                <ToolHeader icon={<TshirtIcon className="w-8 h-8"/>} title="Clothes Extractor" description="Identify clothing items from an image and generate new product-style photos of them." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    {/* --- Controls Column --- */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2">
                            <div className="flex-grow">
                                <ImageUploader label="Upload Image" id="clothes-source" onImageUpload={file => dispatch(updateExtractorState({ clothesSourceFile: file, identifiedItems: [], generatedClothes: [] }))} sourceFile={clothesSourceFile} />
                            </div>
                            <button onClick={onOpenLibraryForClothes} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button>
                        </div>
                        <textarea value={clothesDetails} onChange={e => dispatch(updateExtractorState({ clothesDetails: e.target.value }))} placeholder="Optional: add details or hints, e.g., 'focus on the jacket'" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent" rows={2}/>
                        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer"><input type="checkbox" checked={excludeAccessories} onChange={e => dispatch(updateExtractorState({ excludeAccessories: e.target.checked }))} className="rounded text-accent focus:ring-accent" />Exclude accessories (hats, glasses, etc.)</label>
                        <button onClick={handleIdentify} disabled={!clothesSourceFile || isIdentifying} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isIdentifying ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Identifying...</> : '1. Identify Clothing'}</button>
                    </div>
                    {/* --- Identification & Generation Column --- */}
                    <div className="lg:col-span-2">
                        {isIdentifying && <LoadingState message="Analyzing image for clothing items..." />}
                        {clothesError && <p className="text-danger bg-danger-bg p-3 rounded-md">{clothesError}</p>}
                        {identifiedItems.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-bold text-accent">Identified Items</h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleSelectAllClothes(true)} className="text-xs font-semibold text-text-secondary hover:text-accent transition-colors">Check All</button>
                                        <span className="text-text-muted">|</span>
                                        <button onClick={() => handleSelectAllClothes(false)} className="text-xs font-semibold text-text-secondary hover:text-accent transition-colors">Uncheck All</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md">
                                    {identifiedItems.map((item, index) => (
                                        <label key={index} className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-md hover:bg-bg-tertiary-hover cursor-pointer">
                                            <input type="checkbox" checked={item.selected} onChange={() => handleToggleClothingItem(index)} className="mt-1 rounded text-accent focus:ring-accent" />
                                            <div>
                                                <p className="font-semibold text-text-primary">{item.itemName}</p>
                                                <p className="text-sm text-text-secondary">{item.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer"><input type="checkbox" checked={generateFolded} onChange={e => dispatch(updateExtractorState({ generateFolded: e.target.checked }))} className="rounded text-accent focus:ring-accent" />Also generate folded version</label>
                                <button onClick={handleGenerateClothes} disabled={isGenerating || identifiedItems.every(i => !i.selected)} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isGenerating ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : '2. Generate Selected'}</button>
                            </div>
                        )}
                        {isGenerating && <LoadingState message="Generating product images for selected items..." />}
                        <ExtractorResultsGrid items={generatedClothes} onSave={handleSaveClothing} title="Generated Clothing" />
                    </div>
                </div>
            </div>
            
            <div className={activeSubTab === 'objects' ? 'block' : 'hidden'}>
                 <ToolHeader icon={<CubeIcon className="w-8 h-8"/>} title="Object Extractor" description="Identify individual objects in an image and generate new product-style photos of them." />
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Upload Image" id="object-source" onImageUpload={file => dispatch(updateExtractorState({ objectSourceFile: file, identifiedObjects: [], generatedObjects: [] }))} sourceFile={objectSourceFile} /></div><button onClick={onOpenLibraryForObjects} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <textarea value={objectHints} onChange={e => dispatch(updateExtractorState({ objectHints: e.target.value }))} placeholder="Optional: hints to guide identification, e.g., 'focus on the electronic devices'" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm" rows={2}/>
                        <div><label className="block text-sm font-medium text-text-secondary">Max Objects: {maxObjects}</label><input type="range" min="1" max="10" value={maxObjects} onChange={e => dispatch(updateExtractorState({ maxObjects: parseInt(e.target.value) }))} className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer" /></div>
                        <button onClick={handleIdentifyObjects} disabled={!objectSourceFile || isIdentifyingObjects} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isIdentifyingObjects ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Identifying...</> : '1. Identify Objects'}</button>
                    </div>
                     <div className="lg:col-span-2">
                        {isIdentifyingObjects && <LoadingState message="Analyzing image for objects..." />}
                        {objectError && <p className="text-danger bg-danger-bg p-3 rounded-md">{objectError}</p>}
                        {identifiedObjects.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xl font-bold text-accent">Identified Objects</h3>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleSelectAllObjects(true)} className="text-xs font-semibold text-text-secondary hover:text-accent transition-colors">Check All</button>
                                        <span className="text-text-muted">|</span>
                                        <button onClick={() => handleSelectAllObjects(false)} className="text-xs font-semibold text-text-secondary hover:text-accent transition-colors">Uncheck All</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md">
                                    {identifiedObjects.map((item, index) => (
                                        <label key={index} className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-md hover:bg-bg-tertiary-hover cursor-pointer">
                                            <input type="checkbox" checked={item.selected} onChange={() => handleToggleObjectItem(index)} className="mt-1 rounded text-accent focus:ring-accent" />
                                            <div>
                                                <p className="font-semibold text-text-primary">{item.name}</p>
                                                <p className="text-sm text-text-secondary">{item.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <button onClick={handleGenerateObjects} disabled={isGeneratingObjects || identifiedObjects.every(i => !i.selected)} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isGeneratingObjects ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : '2. Generate Selected'}</button>
                            </div>
                        )}
                        {isGeneratingObjects && <LoadingState message="Generating product images for selected objects..." />}
                        <ExtractorResultsGrid items={generatedObjects} onSave={handleSaveObject} title="Generated Objects" />
                    </div>
                </div>
            </div>
            
            <div className={activeSubTab === 'poses' ? 'block' : 'hidden'}>
                <ToolHeader icon={<PoseIcon className="w-8 h-8"/>} title="Pose Extractor" description="Extract human poses from an image and render them onto a stylized mannequin. Generates pose data compatible with ControlNet." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Upload Image" id="pose-source" onImageUpload={file => dispatch(updateExtractorState({ poseSourceFile: file, generatedPoses: [] }))} sourceFile={poseSourceFile} /></div><button onClick={onOpenLibraryForPoses} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <div>
                           <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Mannequin Reference Image" id="mannequin-ref" onImageUpload={file => dispatch(updateExtractorState({ mannequinReferenceFile: file }))} sourceFile={mannequinReferenceFile} /></div><button onClick={onOpenLibraryForMannequinRef} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        </div>
                        <button onClick={handleGeneratePoses} disabled={!poseSourceFile || isGeneratingPoses || !mannequinReferenceFile} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isGeneratingPoses ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : 'Generate Poses'}</button>
                    </div>
                    <div className="lg:col-span-2">
                        {isGeneratingPoses && <LoadingState message="Detecting poses and generating mannequins..." />}
                        {poseError && <p className="text-danger bg-danger-bg p-3 rounded-md">{poseError}</p>}
                        <ExtractorResultsGrid items={generatedPoses} onSave={handleSavePose} title="Generated Poses" />
                    </div>
                </div>
            </div>
            
             <div className={activeSubTab === 'font' ? 'block' : 'hidden'}>
                <ToolHeader icon={<FontIcon className="w-8 h-8"/>} title="Font Extractor" description="Identify the font style from text in an image and generate a full A-Z, 0-9 character chart." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Upload Image with Text" id="font-source" onImageUpload={file => dispatch(updateExtractorState({ fontSourceFile: file, generatedFontChart: null }))} sourceFile={fontSourceFile} /></div><button onClick={onOpenLibraryForFont} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <button onClick={handleGenerateFont} disabled={!fontSourceFile || isGeneratingFont} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">{isGeneratingFont ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : 'Generate Font Chart'}</button>
                    </div>
                    <div className="lg:col-span-2">
                        {isGeneratingFont && <LoadingState message="Analyzing font and generating character chart..." />}
                        {fontError && <p className="text-danger bg-danger-bg p-3 rounded-md">{fontError}</p>}
                        {generatedFontChart && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-accent">Generated Font Chart</h3>
                                <div className="bg-white p-2 rounded-lg">
                                    <img src={generatedFontChart.src} alt="Generated Font Chart" className="w-full h-auto" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => { const link = document.createElement('a'); link.href = generatedFontChart.src; link.download = 'font_chart.png'; link.click(); }} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                        <DownloadIcon className="w-5 h-5"/> Download
                                    </button>
                                    <button onClick={handleSaveFont} disabled={generatedFontChart.saved !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors ${generatedFontChart.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}>
                                        {generatedFontChart.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : generatedFontChart.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                        {generatedFontChart.saved === 'saving' ? 'Saving...' : generatedFontChart.saved === 'saved' ? 'Saved' : 'Save to Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {(activeSubTab === 'clothes' || activeSubTab === 'objects' || activeSubTab === 'poses' || activeSubTab === 'font') && (
                <div className="mt-8 pt-4 border-t border-danger-bg">
                    <button onClick={handleReset} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                        <ResetIcon className="w-5 h-5" /> Reset All Extractor Tools
                    </button>
                </div>
            )}
        </div>
    );
};