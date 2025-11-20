
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
import type { GeneratedClothing, IdentifiedClothing, IdentifiedObject, GeneratedObject, ExtractorState, GeneratedPose, MannequinStyle, LibraryItem, PoseOutputMode } from '../types';
import { GenerateIcon, TshirtIcon, CubeIcon, SpinnerIcon, ResetIcon, LibraryIcon, PoseIcon, FontIcon, DownloadIcon, SaveIcon, CheckIcon } from './icons';
import { dataUrlToThumbnail, fileToResizedDataUrl } from '../utils/imageUtils';

interface ExtractorToolsPanelProps {
    onOpenLibraryForClothes: () => void;
    onOpenLibraryForObjects: () => void;
    onOpenLibraryForPoses: () => void;
    onOpenLibraryForMannequinRef: () => void;
    onOpenLibraryForFont: () => void;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
}

const ToolHeader: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
    <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-bg-primary rounded-full text-accent">
            {icon}
        </div>
        <div>
            <h2 className="text-2xl font-bold text-accent">{title}</h2>
            <p className="text-sm text-text-secondary">{description}</p>
        </div>
    </div>
);

interface SubTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
}

const subTabs: SubTab[] = [
    { id: 'clothes', label: 'Clothes' },
    { id: 'objects', label: 'Objects' },
    { id: 'poses', label: 'Poses' },
    { id: 'font', label: 'Font' },
];

const SubTabs: React.FC<{ tabs: SubTab[]; activeTab: string; onTabClick: (id: string) => void }> = ({ tabs, activeTab, onTabClick }) => (
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
        poseSourceFile, isGeneratingPoses, generatedPoses, poseError, mannequinStyle, mannequinReferenceFile, poseOutputMode, mannequinPromptHint,
        fontSourceFile, isGeneratingFont, generatedFontChart, fontError
    } = state;

    const handleIdentifyClothing = async () => {
        if (!clothesSourceFile) return;
        dispatch(updateExtractorState({ isIdentifying: true, clothesError: null }));
        try {
            const items = await identifyClothing(clothesSourceFile);
            dispatch(updateExtractorState({ 
                identifiedItems: items.map(item => ({ ...item, selected: true })),
                isIdentifying: false 
            }));
        } catch (err: any) {
            dispatch(updateExtractorState({ clothesError: err.message, isIdentifying: false }));
        }
    };

    const handleGenerateClothing = async () => {
        const selectedItems = identifiedItems.filter(item => item.selected);
        if (selectedItems.length === 0) return;

        dispatch(updateExtractorState({ isGenerating: true, clothesError: null, generatedClothes: [] }));
        try {
            const results: GeneratedClothing[] = [];
            for (const item of selectedItems) {
                const laidOutImage = await generateClothingImage(item.description, false);
                let foldedImage: string | undefined;
                if (generateFolded) {
                    foldedImage = await generateClothingImage(item.description, true);
                }
                results.push({ itemName: item.itemName, laidOutImage, foldedImage, saved: 'idle' });
            }
            dispatch(updateExtractorState({ generatedClothes: results, isGenerating: false }));
        } catch (err: any) {
            dispatch(updateExtractorState({ clothesError: err.message, isGenerating: false }));
        }
    };

    const handleSaveClothing = async (item: GeneratedClothing, index: number) => {
        if (!clothesSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'clothes', 
                name: item.itemName, 
                media: item.laidOutImage, // Save laid out version as main
                thumbnail: await dataUrlToThumbnail(item.laidOutImage, 256),
                sourceImage: await fileToResizedDataUrl(clothesSourceFile, 512),
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save clothing:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'clothes', index, status: 'idle' }));
        }
    };

    const handleIdentifyObjects = async () => {
        if (!objectSourceFile) return;
        dispatch(updateExtractorState({ isIdentifyingObjects: true, objectError: null }));
        try {
            const objects = await identifyObjects(objectSourceFile, maxObjects, objectHints);
            dispatch(updateExtractorState({ 
                identifiedObjects: objects.map(obj => ({ ...obj, selected: true })),
                isIdentifyingObjects: false 
            }));
        } catch (err: any) {
            dispatch(updateExtractorState({ objectError: err.message, isIdentifyingObjects: false }));
        }
    };

    const handleGenerateObjects = async () => {
        const selectedObjects = identifiedObjects.filter(obj => obj.selected);
        if (selectedObjects.length === 0) return;

        dispatch(updateExtractorState({ isGeneratingObjects: true, objectError: null, generatedObjects: [] }));
        try {
            const results: GeneratedObject[] = [];
            for (const obj of selectedObjects) {
                const image = await generateObjectImage(obj.description);
                results.push({ name: obj.name, image, saved: 'idle' });
            }
            dispatch(updateExtractorState({ generatedObjects: results, isGeneratingObjects: false }));
        } catch (err: any) {
            dispatch(updateExtractorState({ objectError: err.message, isGeneratingObjects: false }));
        }
    };

    const handleSaveObject = async (item: GeneratedObject, index: number) => {
        if (!objectSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'objects', index, status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'object', 
                name: item.name, 
                media: item.image,
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

    const handleGeneratePoses = async () => {
        if (!poseSourceFile) return;
        
        if (poseOutputMode === 'mannequin-image' && !mannequinReferenceFile && !mannequinPromptHint) {
             dispatch(updateExtractorState({ poseError: "Please provide either a reference image or a style prompt." }));
             return;
        }

        dispatch(updateExtractorState({ isGeneratingPoses: true, generatedPoses: [], poseError: null }));
        try {
            const { poseLandmarks, handLandmarks, handedness, faceLandmarks, width, height } = await detectPosesInImage(poseSourceFile);
            
            if (poseLandmarks.length === 0) {
                 if (poseOutputMode === 'controlnet-json') {
                     throw new Error("No poses could be detected in the image for extraction.");
                 }
            }

            const allGeneratedPoses: GeneratedPose[] = [];

            if (poseOutputMode === 'controlnet-json') {
                 for (let i = 0; i < poseLandmarks.length; i++) {
                    const poseData = mediaPipeToOpenPose(poseLandmarks[i], handLandmarks, handedness, faceLandmarks[i], width, height);
                    const skeletonImage = renderPoseSkeleton(poseData);
                    const description = await generatePoseDescription(poseSourceFile, poseData);
    
                    allGeneratedPoses.push({
                        description, 
                        skeletonImage, 
                        poseJson: poseData,
                        mannequinStyle: 'custom-reference',
                        mode: 'controlnet-json',
                        saved: 'idle',
                    });
                }
            } else {
                const { image, prompt } = await generatePoseMannequin(poseSourceFile, 'custom-reference', mannequinReferenceFile, mannequinPromptHint);
                allGeneratedPoses.push({
                    description: "Mannequin Transfer",
                    image: image,
                    mannequinStyle: 'custom-reference',
                    generationPrompt: prompt,
                    mode: 'mannequin-image',
                    saved: 'idle'
                });
            }

            dispatch(updateExtractorState({ generatedPoses: allGeneratedPoses }));
        } catch (err: any) {
            dispatch(updateExtractorState({ poseError: err.message || "An unknown error occurred." }));
        } finally {
            dispatch(updateExtractorState({ isGeneratingPoses: false }));
        }
    };
    
    const handleSavePose = async (item: GeneratedPose, index: number) => {
        if (!poseSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'saving' }));
        try {
            const mainMedia = item.mode === 'mannequin-image' ? item.image! : item.skeletonImage!;

            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'pose', 
                name: item.description || 'Extracted Pose', 
                media: mainMedia,
                thumbnail: await dataUrlToThumbnail(mainMedia, 256),
                sourceImage: await fileToResizedDataUrl(poseSourceFile, 512),
                poseJson: item.poseJson ? JSON.stringify(item.poseJson) : undefined,
                skeletonImage: item.skeletonImage,
            };
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save pose:", err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'poses', index, status: 'idle' }));
        }
    };
    
    const handleOutputModeChange = (mode: PoseOutputMode) => {
        dispatch(updateExtractorState({ poseOutputMode: mode, generatedPoses: [], poseError: null }));
    };

    const handleGenerateFont = async () => {
        if (!fontSourceFile) return;
        dispatch(updateExtractorState({ isGeneratingFont: true, fontError: null, generatedFontChart: null }));
        try {
            const chartImage = await generateFontChart(fontSourceFile);
            dispatch(updateExtractorState({ generatedFontChart: { src: chartImage, saved: 'idle' } }));
        } catch (err: any) {
            dispatch(updateExtractorState({ fontError: err.message }));
        } finally {
            dispatch(updateExtractorState({ isGeneratingFont: false }));
        }
    };

    const handleSaveFont = async () => {
        if (!fontSourceFile || !generatedFontChart) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'font', status: 'saving' }));
        try {
            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'font',
                name: `Font Extracted from ${fontSourceFile.name}`,
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
    
    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto">
             <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

             <div className={activeSubTab === 'clothes' ? 'block' : 'hidden'}>
                <ToolHeader icon={<TshirtIcon className="w-8 h-8"/>} title="Clothing Extractor" description="Extract clothing items from an image and generate variations." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Image" id="clothes-source" onImageUpload={file => dispatch(updateExtractorState({ clothesSourceFile: file, identifiedItems: [], generatedClothes: [] }))} sourceFile={clothesSourceFile} /></div><button onClick={onOpenLibraryForClothes} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <button onClick={handleIdentifyClothing} disabled={!clothesSourceFile || isIdentifying} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isIdentifying ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Analyzing...</> : 'Identify Clothing'}
                        </button>
                        
                        {identifiedItems.length > 0 && (
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary">Select Items to Extract</h4>
                                {identifiedItems.map((item, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer p-2 hover:bg-bg-primary rounded">
                                        <input type="checkbox" checked={item.selected} onChange={() => {
                                            const newItems = [...identifiedItems];
                                            newItems[idx].selected = !newItems[idx].selected;
                                            dispatch(updateExtractorState({ identifiedItems: newItems }));
                                        }} className="rounded text-accent focus:ring-accent"/>
                                        <div><span className="font-bold text-text-primary">{item.itemName}</span><p className="text-xs text-text-muted truncate max-w-[200px]">{item.description}</p></div>
                                    </label>
                                ))}
                                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer border-t border-border-primary pt-2"><input type="checkbox" checked={generateFolded} onChange={e => dispatch(updateExtractorState({ generateFolded: e.target.checked }))} className="rounded text-accent focus:ring-accent"/>Generate folded version</label>
                                <button onClick={handleGenerateClothing} disabled={isGenerating} className="w-full flex items-center justify-center gap-2 bg-highlight-green text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-colors disabled:opacity-50">
                                    {isGenerating ? <><SpinnerIcon className="w-4 h-4 animate-spin"/>Generating...</> : 'Generate Images'}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-2">
                        {isIdentifying && <LoadingState message="Analyzing image for clothing items..." />}
                        {isGenerating && <LoadingState message="Generating isolated clothing images..." />}
                        {clothesError && <p className="text-danger bg-danger-bg p-3 rounded-md">{clothesError}</p>}
                        <ExtractorResultsGrid items={generatedClothes} onSave={handleSaveClothing} title="Results" />
                    </div>
                </div>
            </div>

             <div className={activeSubTab === 'objects' ? 'block' : 'hidden'}>
                <ToolHeader icon={<CubeIcon className="w-8 h-8"/>} title="Object Extractor" description="Identify and extract specific objects from a scene." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Image" id="object-source" onImageUpload={file => dispatch(updateExtractorState({ objectSourceFile: file, identifiedObjects: [], generatedObjects: [] }))} sourceFile={objectSourceFile} /></div><button onClick={onOpenLibraryForObjects} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <div><label className="block text-sm font-medium text-text-secondary mb-1">Focus/Hints (Optional)</label><input type="text" value={objectHints} onChange={e => dispatch(updateExtractorState({ objectHints: e.target.value }))} placeholder="e.g., furniture, electronics" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm"/></div>
                        <div><label className="block text-sm font-medium text-text-secondary mb-1">Max Objects: {maxObjects}</label><input type="range" min="1" max="10" value={maxObjects} onChange={e => dispatch(updateExtractorState({ maxObjects: Number(e.target.value) }))} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"/></div>
                        <button onClick={handleIdentifyObjects} disabled={!objectSourceFile || isIdentifyingObjects} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isIdentifyingObjects ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Scanning...</> : 'Identify Objects'}
                        </button>

                        {identifiedObjects.length > 0 && (
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary">Select Objects</h4>
                                {identifiedObjects.map((obj, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer p-2 hover:bg-bg-primary rounded">
                                        <input type="checkbox" checked={obj.selected} onChange={() => {
                                            const newObjs = [...identifiedObjects];
                                            newObjs[idx].selected = !newObjs[idx].selected;
                                            dispatch(updateExtractorState({ identifiedObjects: newObjs }));
                                        }} className="rounded text-accent focus:ring-accent"/>
                                        <div><span className="font-bold text-text-primary">{obj.name}</span><p className="text-xs text-text-muted truncate max-w-[200px]">{obj.description}</p></div>
                                    </label>
                                ))}
                                <button onClick={handleGenerateObjects} disabled={isGeneratingObjects} className="w-full flex items-center justify-center gap-2 bg-highlight-green text-white font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-colors disabled:opacity-50">
                                    {isGeneratingObjects ? <><SpinnerIcon className="w-4 h-4 animate-spin"/>Generating...</> : 'Extract Objects'}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-2">
                        {isIdentifyingObjects && <LoadingState message="Analyzing image for objects..." />}
                        {isGeneratingObjects && <LoadingState message="Generating isolated object images..." />}
                        {objectError && <p className="text-danger bg-danger-bg p-3 rounded-md">{objectError}</p>}
                        <ExtractorResultsGrid items={generatedObjects} onSave={handleSaveObject} title="Results" />
                    </div>
                </div>
            </div>

             <div className={activeSubTab === 'poses' ? 'block' : 'hidden'}>
                <ToolHeader icon={<PoseIcon className="w-8 h-8"/>} title="Pose Extractor" description="Extract poses for ControlNet or apply poses to mannequins." />
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1">
                            <button onClick={() => handleOutputModeChange('controlnet-json')} className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${poseOutputMode === 'controlnet-json' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>ControlNet JSON</button>
                            <button onClick={() => handleOutputModeChange('mannequin-image')} className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${poseOutputMode === 'mannequin-image' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>Mannequin Image</button>
                        </div>

                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Pose Image" id="pose-source" onImageUpload={file => dispatch(updateExtractorState({ poseSourceFile: file, generatedPoses: [] }))} sourceFile={poseSourceFile} /></div><button onClick={onOpenLibraryForPoses} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        
                        {poseOutputMode === 'mannequin-image' && (
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary">Target Style</h4>
                                <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Style Reference (Optional)" id="mannequin-ref" onImageUpload={file => dispatch(updateExtractorState({ mannequinReferenceFile: file }))} sourceFile={mannequinReferenceFile} infoText="Upload an image to copy its style" /></div><button onClick={onOpenLibraryForMannequinRef} className="mt-8 self-center bg-bg-primary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">Or describe the style</label>
                                    <input type="text" value={mannequinPromptHint} onChange={(e) => dispatch(updateExtractorState({ mannequinPromptHint: e.target.value }))} placeholder="e.g., wooden art mannequin, futuristic chrome robot" className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm" />
                                </div>
                            </div>
                        )}

                        <button onClick={handleGeneratePoses} disabled={!poseSourceFile || isGeneratingPoses} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isGeneratingPoses ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : (poseOutputMode === 'controlnet-json' ? 'Extract JSON & Skeleton' : 'Generate Mannequin')}
                        </button>
                    </div>
                    <div className="lg:col-span-2">
                        {isGeneratingPoses && <LoadingState message={poseOutputMode === 'controlnet-json' ? "Detecting landmarks..." : "Applying pose to mannequin..."} />}
                        {poseError && <p className="text-danger bg-danger-bg p-3 rounded-md">{poseError}</p>}
                        <ExtractorResultsGrid items={generatedPoses} onSave={handleSavePose} title="Results" />
                    </div>
                </div>
            </div>

             <div className={activeSubTab === 'font' ? 'block' : 'hidden'}>
                <ToolHeader icon={<FontIcon className="w-8 h-8"/>} title="Font Extractor" description="Generate a complete character set from a sample text image." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Sample Text Image" id="font-source" onImageUpload={file => dispatch(updateExtractorState({ fontSourceFile: file, generatedFontChart: null }))} sourceFile={fontSourceFile} infoText="Upload an image containing text in the desired style" /></div><button onClick={onOpenLibraryForFont} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <button onClick={handleGenerateFont} disabled={!fontSourceFile || isGeneratingFont} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isGeneratingFont ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Generating...</> : 'Generate Font Chart'}
                        </button>
                    </div>
                    <div className="lg:col-span-2">
                        {isGeneratingFont && <LoadingState message="Generating full character set from sample..." />}
                        {fontError && <p className="text-danger bg-danger-bg p-3 rounded-md">{fontError}</p>}
                        {generatedFontChart && (
                            <div className="bg-bg-tertiary p-4 rounded-lg">
                                <h3 className="text-lg font-bold text-text-primary mb-4">Generated Font Chart</h3>
                                <img src={generatedFontChart.src} alt="Generated Font Chart" className="w-full rounded-lg shadow-lg mb-4 bg-white" />
                                <div className="flex justify-end gap-4">
                                    <button onClick={() => { const link = document.createElement('a'); link.href = generatedFontChart.src; link.download = 'font_chart.png'; link.click(); }} className="flex items-center gap-2 px-4 py-2 bg-bg-primary text-text-secondary font-semibold rounded-lg hover:bg-bg-secondary"><DownloadIcon className="w-5 h-5"/> Download</button>
                                    <button onClick={handleSaveFont} disabled={generatedFontChart.saved !== 'idle'} className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors ${generatedFontChart.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}>
                                        {generatedFontChart.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : generatedFontChart.saved === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                        {generatedFontChart.saved === 'saving' ? 'Saving...' : generatedFontChart.saved === 'saved' ? 'Saved' : 'Save to Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
             
             <div className="mt-8 pt-4 border-t border-danger-bg">
                <button onClick={() => dispatch(resetExtractorState())} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                    <ResetIcon className="w-5 h-5" /> Reset Extractor Tools
                </button>
            </div>
        </div>
    );
};
