import React from 'react';
import { ImageUploader } from './ImageUploader';
import { LoadingState } from './LoadingState';
import { ExtractorResultsGrid } from './ExtractorResultsGrid';
import { generateClothingImage, identifyClothing, identifyObjects, generateObjectImage, identifyPoses, generatePoseMannequin, extractPoseKeypoints } from '../services/geminiService';
import type { GeneratedClothing, IdentifiedClothing, IdentifiedObject, GeneratedObject, ExtractorState, GeneratedPose } from '../types';
import { GenerateIcon, TshirtIcon, CubeIcon, SpinnerIcon, ResetIcon, LibraryIcon, PoseIcon } from './icons';
import { saveToLibrary } from '../services/libraryService';
import { dataUrlToThumbnail, fileToResizedDataUrl } from '../utils/imageUtils';
import { renderPoseSkeleton } from '../utils/poseRenderer';

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
    state: ExtractorState;
    setState: React.Dispatch<React.SetStateAction<ExtractorState>>;
    onReset: () => void;
    onOpenLibraryForClothes: () => void;
    onOpenLibraryForObjects: () => void;
    onOpenLibraryForPoses: () => void;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
}

// --- Main Panel ---
export const ExtractorToolsPanel: React.FC<ExtractorToolsPanelProps> = ({ state, setState, onReset, onOpenLibraryForClothes, onOpenLibraryForObjects, onOpenLibraryForPoses, activeSubTab, setActiveSubTab }) => {
    
    // --- Clothes Logic ---
    const handleIdentify = async () => {
        if (!state.clothesSourceFile) return;
        setState(prev => ({
            ...prev,
            isIdentifying: true,
            clothesError: null,
            identifiedItems: [],
            generatedClothes: []
        }));

        try {
            const items = await identifyClothing(state.clothesSourceFile, state.clothesDetails, state.excludeAccessories);
            setState(prev => ({ ...prev, identifiedItems: items.map(item => ({ ...item, selected: true })) }));
        } catch (err: any) {
            setState(prev => ({ ...prev, clothesError: err.message || 'Failed to identify clothing items.' }));
        } finally {
            setState(prev => ({ ...prev, isIdentifying: false }));
        }
    };
    
    const handleToggleClothingSelection = (index: number) => {
        setState(prev => ({
            ...prev,
            identifiedItems: prev.identifiedItems.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
        }));
    };

    const handleSelectAllClothes = () => {
        setState(prev => ({
            ...prev,
            identifiedItems: prev.identifiedItems.map(item => ({ ...item, selected: true }))
        }));
    };

    const handleUnselectAllClothes = () => {
        setState(prev => ({
            ...prev,
            identifiedItems: prev.identifiedItems.map(item => ({ ...item, selected: false }))
        }));
    };

    const handleGenerateSelectedClothes = async () => {
        if (!state.clothesSourceFile || state.identifiedItems.every(i => !i.selected)) return;
        
        setState(prev => ({ ...prev, isGenerating: true, clothesError: null, generatedClothes: [] }));
        const selectedItems = state.identifiedItems.filter(item => item.selected);
        
        for (const item of selectedItems) {
            try {
                const laidOutImage = await generateClothingImage(state.clothesSourceFile, item.itemName, 'laid out');
                let foldedImage: string | undefined = undefined;
                if (state.generateFolded) {
                    foldedImage = await generateClothingImage(state.clothesSourceFile, item.itemName, 'folded');
                }
                
                setState(prev => ({ ...prev, generatedClothes: [...prev.generatedClothes, { itemName: item.itemName, laidOutImage, foldedImage, saved: 'idle' }] }));
            } catch (err: any) {
                 console.error(`Failed to generate image for ${item.itemName}:`, err);
                setState(prev => ({ ...prev, clothesError: `Error generating "${item.itemName}". Skipping.` }));
            }
        }
        setState(prev => ({ ...prev, isGenerating: false }));
    };
    
    const handleClothesSaveToLibrary = async (item: GeneratedClothing, index: number) => {
        setState(prev => {
            const updatedItems = [...prev.generatedClothes];
            updatedItems[index] = { ...item, saved: 'saving' };
            return { ...prev, generatedClothes: updatedItems };
        });

        try {
            await saveToLibrary({
                mediaType: 'clothes',
                name: item.itemName,
                media: item.laidOutImage,
                thumbnail: await dataUrlToThumbnail(item.laidOutImage, 256),
                sourceImage: state.clothesSourceFile ? await fileToResizedDataUrl(state.clothesSourceFile, 512) : undefined,
            });
            setState(prev => {
                const updatedItems = [...prev.generatedClothes];
                updatedItems[index] = { ...item, saved: 'saved' };
                return { ...prev, generatedClothes: updatedItems };
            });
        } catch (e) {
            console.error("Failed to save clothing to library", e);
            setState(prev => {
                const updatedItems = [...prev.generatedClothes];
                updatedItems[index] = { ...item, saved: 'idle' };
                return { ...prev, generatedClothes: updatedItems };
            });
        }
    };

    // --- Object Logic ---
    const handleIdentifyObjects = async () => {
        if (!state.objectSourceFile) return;
        setState(prev => ({
            ...prev,
            isIdentifyingObjects: true,
            objectError: null,
            identifiedObjects: [],
            generatedObjects: [],
        }));

        try {
            const items = await identifyObjects(state.objectSourceFile, state.maxObjects, state.objectHints);
            setState(prev => ({ ...prev, identifiedObjects: items.map(item => ({ ...item, selected: true })) }));
        } catch (err: any) {
            setState(prev => ({ ...prev, objectError: err.message || 'Failed to identify objects.' }));
        } finally {
            setState(prev => ({ ...prev, isIdentifyingObjects: false }));
        }
    };

    const handleToggleObjectSelection = (index: number) => {
        setState(prev => ({
            ...prev,
            identifiedObjects: prev.identifiedObjects.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
        }));
    };
    
    const handleSelectAllObjects = () => {
        setState(prev => ({
            ...prev,
            identifiedObjects: prev.identifiedObjects.map(obj => ({ ...obj, selected: true }))
        }));
    };

    const handleUnselectAllObjects = () => {
        setState(prev => ({
            ...prev,
            identifiedObjects: prev.identifiedObjects.map(obj => ({ ...obj, selected: false }))
        }));
    };

    const handleGenerateObjects = async () => {
        if (!state.objectSourceFile || state.identifiedObjects.every(obj => !obj.selected)) return;
        
        setState(prev => ({ ...prev, isGeneratingObjects: true, objectError: null, generatedObjects: [] }));
        const selectedObjects = state.identifiedObjects.filter(obj => obj.selected);

        for (const obj of selectedObjects) {
            try {
                const image = await generateObjectImage(state.objectSourceFile, obj.name);
                setState(prev => ({ ...prev, generatedObjects: [...prev.generatedObjects, { name: obj.name, image, saved: 'idle' }] }));
            } catch (err: any) {
                console.error(`Failed to generate image for ${obj.name}:`, err);
                setState(prev => ({ ...prev, objectError: `Error generating "${obj.name}". Skipping.` }));
            }
        }
        setState(prev => ({ ...prev, isGeneratingObjects: false }));
    };

    const handleObjectSaveToLibrary = async (item: GeneratedObject, index: number) => {
        setState(prev => {
            const updatedObjects = [...prev.generatedObjects];
            updatedObjects[index] = { ...item, saved: 'saving' };
            return { ...prev, generatedObjects: updatedObjects };
        });
        
        try {
            await saveToLibrary({
                mediaType: 'object',
                name: item.name,
                media: item.image,
                thumbnail: await dataUrlToThumbnail(item.image, 256),
                sourceImage: state.objectSourceFile ? await fileToResizedDataUrl(state.objectSourceFile, 512) : undefined,
            });
             setState(prev => {
                const updatedObjects = [...prev.generatedObjects];
                updatedObjects[index] = { ...item, saved: 'saved' };
                return { ...prev, generatedObjects: updatedObjects };
            });
        } catch(e) {
             console.error("Failed to save object to library", e);
             setState(prev => {
                const updatedObjects = [...prev.generatedObjects];
                updatedObjects[index] = { ...item, saved: 'idle' }; // Revert on error
                return { ...prev, generatedObjects: updatedObjects };
            });
        }
    };

    // --- Pose Logic ---
    const handleIdentifyPoses = async () => {
        if (!state.poseSourceFile) return;
        setState(prev => ({
            ...prev,
            isIdentifyingPoses: true,
            poseError: null,
            identifiedPoses: [],
            generatedPoses: []
        }));

        try {
            const poses = await identifyPoses(state.poseSourceFile);
            setState(prev => ({ ...prev, identifiedPoses: poses.map(pose => ({ ...pose, selected: true })) }));
        } catch (err: any) {
            setState(prev => ({ ...prev, poseError: err.message || 'Failed to identify poses.' }));
        } finally {
            setState(prev => ({ ...prev, isIdentifyingPoses: false }));
        }
    };

    const handleTogglePoseSelection = (index: number) => {
        setState(prev => ({
            ...prev,
            identifiedPoses: prev.identifiedPoses.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
        }));
    };

    const handleSelectAllPoses = () => {
        setState(prev => ({
            ...prev,
            identifiedPoses: prev.identifiedPoses.map(item => ({ ...item, selected: true }))
        }));
    };

    const handleUnselectAllPoses = () => {
        setState(prev => ({
            ...prev,
            identifiedPoses: prev.identifiedPoses.map(item => ({ ...item, selected: false }))
        }));
    };

    const handleGeneratePoses = async () => {
        if (!state.poseSourceFile || state.identifiedPoses.every(p => !p.selected)) return;

        setState(prev => ({ ...prev, isGeneratingPoses: true, poseError: null, generatedPoses: [] }));

        try {
            // Extract keypoints for ALL people in the image once.
            const poseJsonData = await extractPoseKeypoints(state.poseSourceFile);
            
            const selectedPoseInfos = state.identifiedPoses
                .map((pose, index) => ({...pose, originalIndex: index}))
                .filter(pose => pose.selected);

            for (const poseInfo of selectedPoseInfos) {
                const { description, originalIndex } = poseInfo;
                try {
                    // Generate the mannequin image using the text description
                    const image = await generatePoseMannequin(description, state.poseSourceFile, state.posesKeepClothes);
                    
                    // Get the corresponding JSON data for this person, assuming order is preserved
                    const allPeople = (poseJsonData as any).people || [];
                    const personJsonData = allPeople[originalIndex];
                    
                    if (!personJsonData) {
                         throw new Error(`Could not find matching JSON data for pose index ${originalIndex}.`);
                    }

                    // Create a new JSON object with only this person's data
                    const finalJson = {
                        width: (poseJsonData as any).width,
                        height: (poseJsonData as any).height,
                        people: [personJsonData] 
                    };

                    const skeletonImage = renderPoseSkeleton(finalJson);

                    setState(prev => ({ 
                        ...prev, 
                        generatedPoses: [
                            ...prev.generatedPoses, 
                            { description, image, poseJson: finalJson, skeletonImage, saved: 'idle' }
                        ] 
                    }));
                } catch (err: any) {
                    console.error(`Failed to generate mannequin or JSON for pose index ${originalIndex}:`, err);
                    setState(prev => ({ ...prev, poseError: `Error generating assets for a pose. Skipping.` }));
                }
            }
        } catch (err: any) {
            console.error(`Failed to extract pose keypoints:`, err);
            setState(prev => ({ ...prev, poseError: `Critical error extracting pose data: ${err.message}` }));
        }

        setState(prev => ({ ...prev, isGeneratingPoses: false }));
    };

    const handlePoseSaveToLibrary = async (item: GeneratedPose, index: number) => {
        setState(prev => {
            const updatedPoses = [...prev.generatedPoses];
            updatedPoses[index] = { ...item, saved: 'saving' };
            return { ...prev, generatedPoses: updatedPoses };
        });

        try {
            await saveToLibrary({
                mediaType: 'pose',
                name: `Pose from ${state.poseSourceFile?.name || 'source'}`,
                media: item.image,
                thumbnail: await dataUrlToThumbnail(item.image, 256),
                sourceImage: state.poseSourceFile ? await fileToResizedDataUrl(state.poseSourceFile, 512) : undefined,
                poseDescription: item.description,
                skeletonImage: item.skeletonImage,
                poseJson: JSON.stringify(item.poseJson, null, 2),
            });
             setState(prev => {
                const updatedPoses = [...prev.generatedPoses];
                updatedPoses[index] = { ...item, saved: 'saved' };
                return { ...prev, generatedPoses: updatedPoses };
            });
        } catch (e) {
            console.error("Failed to save pose to library", e);
            setState(prev => {
                const updatedPoses = [...prev.generatedPoses];
                updatedPoses[index] = { ...item, saved: 'idle' };
                return { ...prev, generatedPoses: updatedPoses };
            });
        }
    };


    const subTabs = [
        { id: 'clothes', label: 'Clothes Extractor' },
        { id: 'objects', label: 'Object Extractor' },
        { id: 'poses', label: 'Pose Extractor' },
    ];
    
    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-accent">Extractor Tools</h2>
                <button
                    onClick={onReset}
                    className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200"
                >
                    <ResetIcon className="w-5 h-5" /> Reset All Fields
                </button>
            </div>
            
            <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

            {/* --- Clothes Extractor Tool --- */}
            <div className={activeSubTab === 'clothes' ? 'block' : 'hidden'}>
                <section aria-labelledby="clothes-extractor-title">
                    <ToolHeader 
                        icon={<TshirtIcon className="w-8 h-8"/>}
                        title="Clothes Extractor"
                        description="Automatically identify clothing in an image and generate professional, e-commerce style product shots."
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader 
                                        label="Upload Photo" 
                                        id="clothes-extractor-image" 
                                        onImageUpload={(file) => setState(prev => ({ ...prev, clothesSourceFile: file }))}
                                        sourceFile={state.clothesSourceFile} 
                                    />
                                </div>
                                <button
                                    onClick={onOpenLibraryForClothes}
                                    className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                    title="Select from Library"
                                >
                                    <LibraryIcon className="w-6 h-6"/>
                                </button>
                            </div>
                            <div>
                                <label htmlFor="clothes-details" className="block text-sm font-medium text-text-secondary mb-1">
                                    Add Details (Optional)
                                </label>
                                <textarea
                                    id="clothes-details"
                                    value={state.clothesDetails}
                                    onChange={(e) => setState(prev => ({ ...prev, clothesDetails: e.target.value }))}
                                    placeholder="e.g., 'the red floral dress' or 'the jacket on the person on the left'"
                                    className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-3 pt-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                    <input type="checkbox" checked={state.generateFolded} onChange={(e) => setState(prev => ({ ...prev, generateFolded: e.target.checked }))} className="rounded text-accent focus:ring-accent" />
                                    Generate folded version
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                    <input type="checkbox" checked={state.excludeAccessories} onChange={(e) => setState(prev => ({ ...prev, excludeAccessories: e.target.checked }))} className="rounded text-accent focus:ring-accent" />
                                    Extract clothing only (no accessories)
                                </label>
                            </div>
                            <button
                                onClick={handleIdentify}
                                disabled={!state.clothesSourceFile || state.isIdentifying || state.isGenerating}
                                style={state.clothesSourceFile && !state.isIdentifying && !state.isGenerating ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                                className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                            >
                                {state.isIdentifying ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                {state.isIdentifying ? 'Identifying...' : '1. Identify Clothing'}
                            </button>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            {state.clothesError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.clothesError}</p>}
                            {state.isIdentifying && <LoadingState message="Analyzing your image to find clothing items..." />}

                            {state.identifiedItems.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xl font-bold text-accent">Select Items to Extract</h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSelectAllClothes} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Select All</button>
                                            <button onClick={handleUnselectAllClothes} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Unselect All</button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto p-2 border border-border-primary rounded-md bg-bg-primary/50">
                                        {state.identifiedItems.map((item, index) => (
                                            <label key={index} className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg cursor-pointer hover:bg-bg-tertiary-hover">
                                                <input type="checkbox" checked={item.selected} onChange={() => handleToggleClothingSelection(index)} className="mt-1 rounded text-accent focus:ring-accent" />
                                                <div>
                                                    <span className="font-semibold text-text-primary">{item.itemName}</span>
                                                    <p className="text-sm text-text-secondary">{item.description}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerateSelectedClothes}
                                        disabled={state.identifiedItems.every(o => !o.selected) || state.isGenerating}
                                        className="w-full mt-4 flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors duration-200 bg-accent text-accent-text disabled:opacity-50"
                                    >
                                        {state.isGenerating ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                        2. Generate Product Shots
                                    </button>
                                </div>
                            )}

                            {state.isGenerating && <LoadingState message={`Generating images for selected items... (${state.generatedClothes.length}/${state.identifiedItems.filter(i => i.selected).length} done)`} />}
                            
                            <ExtractorResultsGrid items={state.generatedClothes} onSave={handleClothesSaveToLibrary} title="Generated Product Shots" />

                        </div>
                    </div>
                </section>
            </div>
            
            {/* --- Object Extractor Tool --- */}
            <div className={activeSubTab === 'objects' ? 'block' : 'hidden'}>
                <section aria-labelledby="object-extractor-title">
                    <ToolHeader 
                        icon={<CubeIcon className="w-8 h-8"/>}
                        title="Object Extractor"
                        description="Find multiple objects in a complex image (like a garage sale) and extract them into individual product shots."
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader 
                                        label="Upload Photo" 
                                        id="object-extractor-image" 
                                        onImageUpload={(file) => setState(prev => ({...prev, objectSourceFile: file}))}
                                        sourceFile={state.objectSourceFile}
                                    />
                                </div>
                                <button
                                    onClick={onOpenLibraryForObjects}
                                    className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                    title="Select from Library"
                                >
                                    <LibraryIcon className="w-6 h-6"/>
                                </button>
                            </div>
                            <div>
                                <label htmlFor="object-details" className="block text-sm font-medium text-text-secondary mb-1">
                                    Specific objects to look for (Optional)
                                </label>
                                <textarea
                                    id="object-details"
                                    value={state.objectHints}
                                    onChange={(e) => setState(prev => ({ ...prev, objectHints: e.target.value }))}
                                    placeholder="e.g., 'any vintage cameras' or 'the blue vase'"
                                    className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Max objects to identify: {state.maxObjects}</label>
                                <input
                                    type="range" min="1" max="20" step="1"
                                    value={state.maxObjects}
                                    onChange={e => setState(prev => ({ ...prev, maxObjects: Number(e.target.value) }))}
                                    className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <button
                                onClick={handleIdentifyObjects}
                                disabled={!state.objectSourceFile || state.isIdentifyingObjects || state.isGeneratingObjects}
                                style={state.objectSourceFile && !state.isIdentifyingObjects && !state.isGeneratingObjects ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                                className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                            >
                                {state.isIdentifyingObjects ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                {state.isIdentifyingObjects ? 'Identifying...' : '1. Identify Objects'}
                            </button>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            {state.objectError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.objectError}</p>}
                            {state.isIdentifyingObjects && <LoadingState message="Scanning your image for objects..." />}
                            
                            {state.identifiedObjects.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xl font-bold text-accent">Select Objects to Extract</h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSelectAllObjects} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Select All</button>
                                            <button onClick={handleUnselectAllObjects} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Unselect All</button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto p-2 border border-border-primary rounded-md bg-bg-primary/50">
                                        {state.identifiedObjects.map((obj, index) => (
                                            <label key={index} className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg cursor-pointer hover:bg-bg-tertiary-hover">
                                                <input type="checkbox" checked={obj.selected} onChange={() => handleToggleObjectSelection(index)} className="mt-1 rounded text-accent focus:ring-accent" />
                                                <div>
                                                    <span className="font-semibold text-text-primary">{obj.name}</span>
                                                    <p className="text-sm text-text-secondary">{obj.description}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerateObjects}
                                        disabled={state.identifiedObjects.every(o => !o.selected) || state.isGeneratingObjects}
                                        className="w-full mt-4 flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors duration-200 bg-accent text-accent-text disabled:opacity-50"
                                    >
                                        {state.isGeneratingObjects ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                        2. Generate Product Shots
                                    </button>
                                </div>
                            )}

                            {state.isGeneratingObjects && <LoadingState message={`Generating images for selected objects... (${state.generatedObjects.length}/${state.identifiedObjects.filter(o => o.selected).length} done)`} />}
                            
                            <ExtractorResultsGrid items={state.generatedObjects} onSave={handleObjectSaveToLibrary} title="Generated Object Shots" />

                        </div>
                    </div>
                </section>
            </div>

            {/* --- Pose Extractor Tool --- */}
            <div className={activeSubTab === 'poses' ? 'block' : 'hidden'}>
                 <section aria-labelledby="pose-extractor-title">
                    <ToolHeader 
                        icon={<PoseIcon className="w-8 h-8"/>}
                        title="Pose Extractor"
                        description="Identify human poses in an image and generate wooden mannequins to save and reuse the compositions."
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader 
                                        label="Upload Photo" 
                                        id="pose-extractor-image" 
                                        onImageUpload={(file) => setState(prev => ({...prev, poseSourceFile: file}))}
                                        sourceFile={state.poseSourceFile}
                                    />
                                </div>
                                <button
                                    onClick={onOpenLibraryForPoses}
                                    className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                    title="Select from Library"
                                >
                                    <LibraryIcon className="w-6 h-6"/>
                                </button>
                            </div>
                            <div className="space-y-3 pt-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={state.posesKeepClothes} 
                                        onChange={(e) => setState(prev => ({ ...prev, posesKeepClothes: e.target.checked }))} 
                                        className="rounded text-accent focus:ring-accent" 
                                    />
                                    Keep clothes and accessories on mannequin
                                </label>
                            </div>
                           
                            <button
                                onClick={handleIdentifyPoses}
                                disabled={!state.poseSourceFile || state.isIdentifyingPoses || state.isGeneratingPoses}
                                style={state.poseSourceFile && !state.isIdentifyingPoses && !state.isGeneratingPoses ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                                className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                            >
                                {state.isIdentifyingPoses ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                {state.isIdentifyingPoses ? 'Identifying...' : '1. Identify Poses'}
                            </button>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            {state.poseError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.poseError}</p>}
                            {state.isIdentifyingPoses && <LoadingState message="Scanning your image for human poses..." />}
                            
                            {state.identifiedPoses.length > 0 && (
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-xl font-bold text-accent">Select Poses to Extract</h3>
                                        <div className="flex gap-2">
                                            <button onClick={handleSelectAllPoses} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Select All</button>
                                            <button onClick={handleUnselectAllPoses} className="text-xs font-semibold bg-bg-tertiary text-text-secondary py-1 px-3 rounded-md hover:bg-bg-tertiary-hover">Unselect All</button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto p-2 border border-border-primary rounded-md bg-bg-primary/50">
                                        {state.identifiedPoses.map((pose, index) => (
                                            <label key={index} className="flex items-start gap-3 p-3 bg-bg-tertiary rounded-lg cursor-pointer hover:bg-bg-tertiary-hover">
                                                <input type="checkbox" checked={pose.selected} onChange={() => handleTogglePoseSelection(index)} className="mt-1 rounded text-accent focus:ring-accent" />
                                                <div>
                                                    <span className="font-semibold text-text-primary">Pose #{index + 1}</span>
                                                    <p className="text-sm text-text-secondary">{pose.description}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGeneratePoses}
                                        disabled={state.identifiedPoses.every(p => !p.selected) || state.isGeneratingPoses}
                                        className="w-full mt-4 flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors duration-200 bg-accent text-accent-text disabled:opacity-50"
                                    >
                                        {state.isGeneratingPoses ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                        2. Generate Mannequins & Skeletons
                                    </button>
                                </div>
                            )}

                            {state.isGeneratingPoses && <LoadingState message={`Generating assets for selected poses... (${state.generatedPoses.length}/${state.identifiedPoses.filter(p => p.selected).length} done)`} />}
                            
                            <ExtractorResultsGrid items={state.generatedPoses} onSave={handlePoseSaveToLibrary} title="Generated Poses" />

                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};