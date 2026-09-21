
import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { setExtractorItemSaveStatus, updateExtractorState, resetExtractorState } from '../store/extractorSlice';
import { addToLibrary } from '../store/librarySlice';
import { addSessionTokenUsage } from '../store/appSlice';
import { ImageUploader } from './ImageUploader';
import { LoadingState } from './LoadingState';
import { ExtractorResultsGrid } from './ExtractorResultsGrid';
import { generatePoseDescription } from '../services/geminiService';
import { generateMammouthImage, generateMammouthText } from '../services/mammouthService';
import { generateComfyUIPortraits } from '../services/comfyUIService';
import { identifyClothingWithOllama, identifyObjectsWithOllama, testOllamaConnection, type OllamaActivity } from '../services/ollamaService';
import { detectPosesInImage } from '../services/mediaPipeService';
import { mediaPipeToOpenPose, renderPoseSkeleton } from '../utils/poseRenderer';
import type { GeneratedClothing, GeneratedHair, IdentifiedClothing, IdentifiedObject, GeneratedObject, ExtractorState, GeneratedPose, LibraryItem, PoseOutputMode } from '../types';
import { CharacterIcon, GenerateIcon, TshirtIcon, CubeIcon, SpinnerIcon, ResetIcon, LibraryIcon, PoseIcon, FontIcon, DownloadIcon, SaveIcon, CheckIcon } from './icons';
import { createFontChartGuide, dataUrlToFile, dataUrlToThumbnail, fileToResizedDataUrl, getDominantImageColor } from '../utils/imageUtils';
import { SendToLTXButton } from './SendToLTXButton';
import { createAccentStyle } from '../utils/accentTheme';
import { OllamaActivityPanel } from './OllamaActivityPanel';

const EXTRACTOR_ACCENT_STYLES: Record<string, React.CSSProperties> = {
    clothes: createAccentStyle('#fb923c', '#fdba74', '#ea580c'),
    hair: createAccentStyle('#ec4899', '#f9a8d4', '#db2777'),
    objects: createAccentStyle('#4ade80', '#86efac', '#16a34a'),
    poses: createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    font: createAccentStyle('#f472b6', '#f9a8d4', '#db2777'),
};

const CLOTHING_INVENTORY_PROMPT = 'Create an exhaustive head-to-toe inventory of every separately removable wardrobe item visible in this image. Include main garments and layers, footwear (a matching pair is one item), belts, hats, gloves, scarves, bags, jewelry such as necklaces, earrings and bracelets, watches, eyewear, and hair accessories. A jumpsuit or dress is one garment, but do not stop after finding it: inspect the head, neck, ears, wrists, waist, hands, and feet for accessories. Include partially occluded items when identifiable. Never merge an accessory into a garment. Exclude the person, hair, body, and background. Return only a JSON array with one object per item, using itemName and description fields. Describe each item with its color, material, pattern, construction, shape, and distinctive details.';

const MANNEQUIN_STYLE_PRESETS = [
    { label: 'White Artist Mannequin', value: 'a clean white articulated artist mannequin with visible joint construction and a matte studio finish' },
    { label: 'Wooden Art Mannequin', value: 'a classic articulated wooden art mannequin with natural light wood grain and rounded joints' },
    { label: 'Futuristic Chrome Robot', value: 'a futuristic chrome humanoid robot with polished metal panels, precise mechanical joints, and subtle cyan accents' },
    { label: 'Matte Black Fashion Mannequin', value: 'a premium matte black fashion mannequin with elegant proportions and a featureless sculpted face' },
    { label: 'Porcelain Display Mannequin', value: 'a refined white porcelain display mannequin with smooth sculpted surfaces and delicate articulated joints' },
    { label: 'Translucent Glass Mannequin', value: 'a translucent glass mannequin with realistic refraction, polished edges, and minimal internal structure' },
] as const;

const buildFontChartPrompt = (useSourceColors: boolean, backgroundColor: string, hasGlyphGuide: boolean) => `First identify the single most visually prominent display typeface in the typography reference image. Prioritize the largest, boldest, most distinctive headline or title lettering, especially accent-colored lettering near the top. Ignore small body copy, captions, labels, logos, and all secondary typefaces. Infer one complete and internally consistent alphabet from that dominant display typeface only.

Create a clean professional type specimen sheet. Do not reproduce photographs, people, objects, existing words, titles, logos, or the source layout. ${useSourceColors
    ? `Preserve the exact foreground letter color used by that selected headline. Use ${backgroundColor} as the uniform full-page background color and apply the same high-contrast source color pairing throughout.`
    : 'Normalize colors only: render every glyph in solid pure black on a clean pure white background.'}

${hasGlyphGuide
    ? 'Picture 1 already contains the complete required glyph set in five rows at final positions. This is an image-to-image restyling task, not a text-generation task. Modify only the visible strokes of each existing glyph, one-for-one, while retaining its exact identity, case, position, size, spacing, and order. Never write or typeset any new text. Never move, replace, remove, repeat, merge, complete, reinterpret, or add a glyph. Preserve all 62 existing glyphs and all five rows exactly. The first visible content remains the uppercase A already present in Picture 1. Add no title, header, sample word, logo, introductory row, extra symbol, box, border, divider, or guide line. Preserve the guide\'s baselines, straight rows, and wide outer margins. Transfer only the selected display typeface\'s stroke weight, slant, width, serifs, terminals, curvature, counters, texture, and period personality onto the existing glyph shapes. Exact pixel-positioned glyph preservation has absolute priority over style.'
    : `Render exactly these five rows in order:\nA B C D E F G H I J K L M\nN O P Q R S T U V W X Y Z\na b c d e f g h i j k l m\nn o p q r s t u v w x y z\n0 1 2 3 4 5 6 7 8 9\nInclude each character exactly once with no title, omissions, repetitions, substitutions, ligatures, extra symbols, borders, or guide lines.`}`;

interface ExtractorGenerationJob {
    id: string;
    name: string;
    progress: number;
    message: string;
    error?: string;
}

interface ExtractorToolsPanelProps {
    onOpenLibraryForClothes: () => void;
    onOpenLibraryForHair: () => void;
    onOpenLibraryForObjects: () => void;
    onOpenLibraryForPoses: () => void;
    onOpenLibraryForMannequinRef: () => void;
    onOpenLibraryForFont: () => void;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
    ollamaUrl: string;
    defaultOllamaModel: string;
    onOllamaModelChange: (model: string) => void;
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
    { id: 'hair', label: 'Hair' },
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
    onOpenLibraryForHair,
    onOpenLibraryForObjects,
    onOpenLibraryForPoses,
    onOpenLibraryForMannequinRef,
    onOpenLibraryForFont,
    activeSubTab,
    setActiveSubTab,
    ollamaUrl,
    defaultOllamaModel,
    onOllamaModelChange,
}) => {
    const dispatch: AppDispatch = useDispatch();
    const state = useSelector((state: RootState) => state.extractor.extractorState);
    const generationOptions = useSelector((state: RootState) => state.generation.options);
    const [ollamaModel, setOllamaModel] = useState(defaultOllamaModel);
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [isOllamaConnected, setIsOllamaConnected] = useState<boolean | null>(null);
    const [ollamaActivity, setOllamaActivity] = useState<OllamaActivity | null>(null);
    const [clothesGenerationJobs, setClothesGenerationJobs] = useState<ExtractorGenerationJob[]>([]);
    const [hairGenerationJobs, setHairGenerationJobs] = useState<ExtractorGenerationJob[]>([]);
    const [objectGenerationJobs, setObjectGenerationJobs] = useState<ExtractorGenerationJob[]>([]);
    const ollamaAbortController = useRef<AbortController | null>(null);

    const updateGenerationJob = (
        setter: React.Dispatch<React.SetStateAction<ExtractorGenerationJob[]>>,
        id: string,
        updates: Partial<ExtractorGenerationJob>,
    ) => setter(current => current.map(job => job.id === id ? { ...job, ...updates } : job));

    useEffect(() => {
        setOllamaModel(defaultOllamaModel);
    }, [defaultOllamaModel]);

    useEffect(() => {
        let cancelled = false;
        setIsOllamaConnected(null);
        testOllamaConnection(ollamaUrl).then(result => {
            if (cancelled) return;
            setIsOllamaConnected(result.success);
            setOllamaModels(result.models);
        });
        return () => { cancelled = true; };
    }, [ollamaUrl]);

    useEffect(() => () => ollamaAbortController.current?.abort(), []);

    const startOllamaRequest = () => {
        ollamaAbortController.current?.abort();
        const controller = new AbortController();
        ollamaAbortController.current = controller;
        setOllamaActivity(null);
        return controller;
    };

    const stopOllamaRequest = () => {
        ollamaAbortController.current?.abort();
        ollamaAbortController.current = null;
        setOllamaActivity(current => current ? { ...current, phase: 'cancelled' } : current);
    };

    const handleResetExtractor = () => {
        ollamaAbortController.current?.abort();
        ollamaAbortController.current = null;
        setOllamaActivity(null);
        setClothesGenerationJobs([]);
        setHairGenerationJobs([]);
        setObjectGenerationJobs([]);
        dispatch(resetExtractorState());
    };

    const recordUsage = (usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }) => {
        if (usage) dispatch(addSessionTokenUsage(usage));
    };

    const parseJsonResponse = <T,>(text: string): T => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));

    const {
        clothesSourceFile, clothesDetails, clothesAnalysisProvider, clothesGenerationProvider, isIdentifying, identifiedItems, isGenerating, generatedClothes, clothesError, generateFolded, excludeAccessories,
        hairSourceFile, hairPersonCount, hairExactFidelity, hairGenerationProvider, isGeneratingHair, generatedHair, hairError,
        objectSourceFile, objectHints, maxObjects, objectAnalysisProvider, objectGenerationProvider, isIdentifyingObjects, identifiedObjects, isGeneratingObjects, generatedObjects, objectError,
        poseSourceFile, isGeneratingPoses, generatedPoses, poseError, mannequinReferenceFile, poseOutputMode, mannequinPromptHint, poseGenerationProvider,
        fontSourceFile, fontGenerationProvider = 'flux2', fontUseSourceColors = false, fontFlux2Steps = 8, fontFlux2Cfg = 1.1, fontFlux2Sampler = 'euler', isGeneratingFont, generatedFontChart, fontError
    } = state;

    const handleIdentifyClothing = async () => {
        if (!clothesSourceFile) return;
        const controller = clothesAnalysisProvider === 'ollama' ? startOllamaRequest() : null;
        dispatch(updateExtractorState({ isIdentifying: true, clothesError: null }));
        try {
            const mammouthResult = clothesAnalysisProvider === 'mammouth'
                ? await generateMammouthText(CLOTHING_INVENTORY_PROMPT, [clothesSourceFile])
                : null;
            recordUsage(mammouthResult?.usageMetadata);
            let items: IdentifiedClothing[];
            if (mammouthResult) {
                items = parseJsonResponse<IdentifiedClothing[]>(mammouthResult.text);
            } else {
                items = await identifyClothingWithOllama(clothesSourceFile, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal);
            }
            dispatch(updateExtractorState({ 
                identifiedItems: items.map(item => ({ ...item, selected: true })),
                isIdentifying: false 
            }));
        } catch (err: any) {
            dispatch(updateExtractorState({ clothesError: err?.name === 'AbortError' ? 'Ollama analysis stopped.' : err.message, isIdentifying: false }));
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
        }
    };

    const handleGenerateClothing = async () => {
        const selectedItems = identifiedItems.filter(item => item.selected);
        if (selectedItems.length === 0) return;

        dispatch(updateExtractorState({ isGenerating: true, clothesError: null, generatedClothes: [] }));
        const jobs = selectedItems.map((item, index) => ({ id: `clothes-${index}`, name: item.itemName, progress: 0, message: 'Queued' }));
        setClothesGenerationJobs(jobs);
        const results: GeneratedClothing[] = [];
        let failedCount = 0;
        for (const [index, item] of selectedItems.entries()) {
            const jobId = `clothes-${index}`;
            try {
                updateGenerationJob(setClothesGenerationJobs, jobId, { progress: 0.02, message: `Starting ${item.itemName}...` });
                const laidOutPrompt = `Extract only the ${item.itemName} from the source image and present it as a clean flat lay product photo on a plain white background. Preserve exactly its colors, material, pattern, cut, logos, fasteners, and distinctive details. Remove the person, body parts, other garments, accessories, and background. Item description: ${item.description}`;
                const foldedPrompt = `Extract only the ${item.itemName} from the source image and present it neatly folded as a clean product photo on a plain white background. Preserve exactly its colors, material, pattern, logos, fasteners, and distinctive details. Remove the person, body parts, other garments, accessories, and background. Item description: ${item.description}`;
                const flux2Options = {
                    ...generationOptions,
                    provider: 'comfyui' as const,
                    comfyModelType: 'flux2-edit' as const,
                    comfyFlux2EditPrompt: laidOutPrompt,
                    numImages: 1,
                };
                const laidOutFlux2 = clothesGenerationProvider === 'flux2'
                    ? await generateComfyUIPortraits(clothesSourceFile, flux2Options, (message, value) => updateGenerationJob(setClothesGenerationJobs, jobId, {
                        progress: generateFolded ? 0.05 + value * 0.6 : 0.05 + value * 0.95,
                        message,
                    }))
                    : null;
                const laidOutResult = clothesGenerationProvider === 'mammouth'
                    ? (updateGenerationJob(setClothesGenerationJobs, jobId, { progress: 0.15, message: `Generating ${item.itemName} with Mammouth...` }), await generateMammouthImage(`Generate a flat lay image of: ${item.description}. Plain white background.`, [], '1:1', generationOptions.mammouthImageModel))
                    : null;
                recordUsage(laidOutResult?.usageMetadata);
                const laidOutImage = clothesGenerationProvider === 'flux2'
                    ? laidOutFlux2?.images[0]?.src
                    : laidOutResult?.images[0];
                if (!laidOutImage) throw new Error(`${clothesGenerationProvider} returned no clothing image.`);
                let foldedImage: string | undefined;
                if (generateFolded) {
                    const foldedFlux2 = clothesGenerationProvider === 'flux2'
                        ? await generateComfyUIPortraits(clothesSourceFile, { ...flux2Options, comfyFlux2EditPrompt: foldedPrompt }, (message, value) => updateGenerationJob(setClothesGenerationJobs, jobId, {
                            progress: 0.65 + value * 0.35,
                            message: `Folded: ${message}`,
                        }))
                        : null;
                    const foldedResult = clothesGenerationProvider === 'mammouth'
                        ? (updateGenerationJob(setClothesGenerationJobs, jobId, { progress: 0.7, message: `Generating folded ${item.itemName}...` }), await generateMammouthImage(`Generate a neatly folded image of: ${item.description}. Plain background.`, [], '1:1', generationOptions.mammouthImageModel))
                        : null;
                    recordUsage(foldedResult?.usageMetadata);
                    foldedImage = clothesGenerationProvider === 'flux2'
                        ? foldedFlux2?.images[0]?.src
                        : foldedResult?.images[0];
                    if (!foldedImage) throw new Error(`${clothesGenerationProvider} returned no folded clothing image.`);
                }
                results.push({ itemName: item.itemName, laidOutImage, foldedImage, saved: 'idle' });
                dispatch(updateExtractorState({ generatedClothes: [...results] }));
                setClothesGenerationJobs(current => current.filter(job => job.id !== jobId));
            } catch (err: any) {
                failedCount += 1;
                updateGenerationJob(setClothesGenerationJobs, jobId, { progress: 1, message: 'Generation failed', error: err.message || 'Unknown generation error.' });
            }
        }
        dispatch(updateExtractorState({
            isGenerating: false,
            clothesError: failedCount === selectedItems.length ? 'No clothing images could be generated.' : null,
        }));
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

    const handleGenerateHair = async () => {
        if (!hairSourceFile) return;
        dispatch(updateExtractorState({ isGeneratingHair: true, generatedHair: [], hairError: null }));
        setHairGenerationJobs(Array.from({ length: hairPersonCount }, (_, index) => ({
            id: `hair-${index}`,
            name: `Person ${index + 1}`,
            progress: 0,
            message: 'Queued',
        })));
        const results: GeneratedHair[] = [];
        let failedCount = 0;
        for (let index = 0; index < hairPersonCount; index += 1) {
            const personNumber = index + 1;
            const jobId = `hair-${index}`;
            try {
                updateGenerationJob(setHairGenerationJobs, jobId, { progress: 0.02, message: `Extracting person ${personNumber}...` });
                const fidelityInstruction = hairExactFidelity
                    ? `HAIR FIDELITY LOCK: Treat the visible hair as fixed source material, not as inspiration. Match its outer silhouette, hairline, temples, sideburn area, part location, fringe shape, exact length, volume distribution, strand direction, curl or wave pattern, braids, layers, density, gaps, and visible scalp. Reproduce the same root-to-tip colors, highlights, faded dye, uneven tones, shadows, shine, dryness, damage, frizz, flyaways, cowlicks, flattened areas, tangled locks, asymmetry, and irregular edges. Retain every natural imperfection in the same location. The extracted hair must look physically lifted from Picture 1 without grooming, beautification, smoothing, symmetry correction, added volume, recoloring, invented strands, or a different haircut.`
                    : 'HAIR FIDELITY: Match the visible hair silhouette, hairline, cut, length, volume, part, fringe, texture, curl pattern, colors, highlights, loose strands, and accessories. Keep the hairstyle recognizable and do not redesign it.';
                const targetInstruction = hairPersonCount === 1
                    ? 'Picture 1 contains one person. That person is the only hair source.'
                    : `Picture 1 contains ${hairPersonCount} people. Use only person ${personNumber}, counting complete or partially visible people strictly from left to right. Ignore the hair of every other person.`;
                const prompt = `HAIRSTYLE EXTRACTION TASK. ${targetInstruction}

ONLY TRANSFERRED PROPERTY: Copy only the target person's hair and any accessory physically attached to that hair. The source face and identity are not output content. Replace the entire source person, including forehead below the hairline, eyebrows, eyes, ears, nose, mouth, skin, neck, body, clothing, and jewelry, with a single anonymous display mannequin.

${fidelityInstruction}

OUTPUT SUBJECT: One smooth matte light-gray salon mannequin head on a minimal short display bust. Use generic, simplified, symmetrical mannequin facial forms with blank unpainted eyes and no human identity, realistic skin, makeup, eyelashes, facial hair, clothing, or jewelry. Align the mannequin head to the target person's original head yaw, pitch, and roll so the copied hairstyle keeps the same visible geometry. Fit the hair naturally at the mannequin hairline without changing its shape.

OUTPUT COMPOSITION: Center one head only in a square catalog image. Show the complete hairstyle from crown to every visible tip with generous margin and no cropping. Use a seamless neutral warm-gray studio background, soft broad frontal lighting, accurate color, and sharp strand detail. The final image contains only the mannequin bust and the extracted hairstyle: no source face, human portrait, second person, extra head, hands, room, furniture, labels, or text. This is faithful hairstyle documentation, not a new hairstyle design.`;
                const flux2Result = hairGenerationProvider === 'flux2'
                    ? await generateComfyUIPortraits(hairSourceFile, {
                        ...generationOptions,
                        provider: 'comfyui',
                        comfyModelType: 'flux2-edit',
                        comfyFlux2EditPrompt: prompt,
                        comfyFlux2EditReinforceSourceIdentity: false,
                        numImages: 1,
                    }, (message, value) => updateGenerationJob(setHairGenerationJobs, jobId, { progress: 0.05 + value * 0.95, message }))
                    : null;
                const mammouthResult = hairGenerationProvider === 'mammouth'
                    ? (updateGenerationJob(setHairGenerationJobs, jobId, { progress: 0.15, message: `Generating person ${personNumber} with Mammouth...` }), await generateMammouthImage(prompt, [hairSourceFile], '1:1', generationOptions.mammouthImageModel))
                    : null;
                recordUsage(mammouthResult?.usageMetadata);
                const image = hairGenerationProvider === 'flux2' ? flux2Result?.images[0]?.src : mammouthResult?.images[0];
                if (!image) throw new Error(`${hairGenerationProvider} returned no hair image.`);
                results.push({ name: `Hair - Person ${personNumber}`, image, personIndex: personNumber, saved: 'idle' });
                dispatch(updateExtractorState({ generatedHair: [...results] }));
                setHairGenerationJobs(current => current.filter(job => job.id !== jobId));
            } catch (err: any) {
                failedCount += 1;
                updateGenerationJob(setHairGenerationJobs, jobId, { progress: 1, message: 'Generation failed', error: err.message || 'Unknown generation error.' });
            }
        }
        dispatch(updateExtractorState({
            isGeneratingHair: false,
            hairError: failedCount === hairPersonCount ? 'No hairstyles could be generated.' : null,
        }));
    };

    const handleSaveHair = async (item: GeneratedHair, index: number) => {
        if (!hairSourceFile) return;
        dispatch(setExtractorItemSaveStatus({ itemType: 'hair', index, status: 'saving' }));
        try {
            await dispatch(addToLibrary({
                mediaType: 'hair',
                name: item.name,
                media: item.image,
                thumbnail: await dataUrlToThumbnail(item.image, 256),
                sourceImage: await fileToResizedDataUrl(hairSourceFile, 512),
            })).unwrap();
            dispatch(setExtractorItemSaveStatus({ itemType: 'hair', index, status: 'saved' }));
        } catch (err) {
            console.error('Failed to save hair:', err);
            dispatch(setExtractorItemSaveStatus({ itemType: 'hair', index, status: 'idle' }));
        }
    };

    const handleIdentifyObjects = async () => {
        if (!objectSourceFile) return;
        const controller = objectAnalysisProvider === 'ollama' ? startOllamaRequest() : null;
        dispatch(updateExtractorState({ isIdentifyingObjects: true, objectError: null }));
        try {
            const prompt = `Identify up to ${maxObjects} distinct, physically separate objects visible in this image. ${objectHints ? `Prioritize objects matching this focus: ${objectHints}.` : ''} Inspect the entire frame, including foreground, background, surfaces, hands, and partially occluded areas. Rank objects by visual importance and relevance to the requested focus. Exclude people, body parts, clothing, footwear, jewelry, and the background itself. Never merge separate objects into one entry. Return only a JSON array with one object per item using 'name' and 'description'. Describe color, material, shape, construction, condition, markings, and distinctive features.`;
            const mammouthResult = objectAnalysisProvider === 'mammouth'
                ? await generateMammouthText(prompt, [objectSourceFile])
                : null;
            recordUsage(mammouthResult?.usageMetadata);
            const objects = mammouthResult
                ? parseJsonResponse<IdentifiedObject[]>(mammouthResult.text).slice(0, maxObjects)
                : await identifyObjectsWithOllama(objectSourceFile, maxObjects, objectHints, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal);
            dispatch(updateExtractorState({ 
                identifiedObjects: objects.map(obj => ({ ...obj, selected: true })),
                isIdentifyingObjects: false 
            }));
        } catch (err: any) {
            dispatch(updateExtractorState({ objectError: err?.name === 'AbortError' ? 'Ollama analysis stopped.' : err.message, isIdentifyingObjects: false }));
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
        }
    };

    const handleGenerateObjects = async () => {
        const selectedObjects = identifiedObjects.filter(obj => obj.selected);
        if (selectedObjects.length === 0) return;

        dispatch(updateExtractorState({ isGeneratingObjects: true, objectError: null, generatedObjects: [] }));
        const jobs = selectedObjects.map((obj, index) => ({ id: `object-${index}`, name: obj.name, progress: 0, message: 'Queued' }));
        setObjectGenerationJobs(jobs);
        const results: GeneratedObject[] = [];
        let failedCount = 0;
        for (const [index, obj] of selectedObjects.entries()) {
            const jobId = `object-${index}`;
            try {
                updateGenerationJob(setObjectGenerationJobs, jobId, { progress: 0.02, message: `Starting ${obj.name}...` });
                const extractionPrompt = `Extract only the ${obj.name} from the source image and present it as a centered, high-quality product photo on a plain white background. Preserve exactly its visible shape, proportions, colors, materials, texture, markings, wear, and distinctive details. Reconstruct only small occluded portions when necessary. Remove people, hands, other objects, supports, shadows from the original scene, and the original background. Object description: ${obj.description}`;
                const flux2Result = objectGenerationProvider === 'flux2'
                    ? await generateComfyUIPortraits(objectSourceFile, {
                        ...generationOptions,
                        provider: 'comfyui',
                        comfyModelType: 'flux2-edit',
                        comfyFlux2EditPrompt: extractionPrompt,
                        numImages: 1,
                    }, (message, value) => updateGenerationJob(setObjectGenerationJobs, jobId, { progress: 0.05 + value * 0.95, message }))
                    : null;
                const mammouthResult = objectGenerationProvider === 'mammouth'
                    ? (updateGenerationJob(setObjectGenerationJobs, jobId, { progress: 0.15, message: `Generating ${obj.name} with Mammouth...` }), await generateMammouthImage(`Generate a high quality image of: ${obj.description}. Isolated on white background.`, [], '1:1', generationOptions.mammouthImageModel))
                    : null;
                recordUsage(mammouthResult?.usageMetadata);
                const image = objectGenerationProvider === 'flux2' ? flux2Result?.images[0]?.src : mammouthResult?.images[0];
                if (!image) throw new Error(`${objectGenerationProvider} returned no object image.`);
                results.push({ name: obj.name, image, saved: 'idle' });
                dispatch(updateExtractorState({ generatedObjects: [...results] }));
                setObjectGenerationJobs(current => current.filter(job => job.id !== jobId));
            } catch (err: any) {
                failedCount += 1;
                updateGenerationJob(setObjectGenerationJobs, jobId, { progress: 1, message: 'Generation failed', error: err.message || 'Unknown generation error.' });
            }
        }
        dispatch(updateExtractorState({
            isGeneratingObjects: false,
            objectError: failedCount === selectedObjects.length ? 'No object images could be generated.' : null,
        }));
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
                    const mammouthResult = generationOptions.provider === 'mammouth'
                        ? await generateMammouthText('Describe the pose of the person in this image in detail for a text-to-image prompt.', [poseSourceFile])
                        : null;
                    recordUsage(mammouthResult?.usageMetadata);
                    const description = mammouthResult?.text || await generatePoseDescription(poseSourceFile, poseData);
    
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
                const requestedStyle = mannequinPromptHint.trim() || MANNEQUIN_STYLE_PRESETS[0].value;
                const prompt = mannequinReferenceFile
                    ? `Generate one full-body mannequin on a clean neutral studio background. Picture 1 is the appearance reference: preserve only its mannequin or character design, materials, colors, surface details, proportions, and visual style. Picture 2 is the pose reference: reproduce its body orientation, weight distribution, head angle, torso bend, shoulder and hip rotation, and the exact articulation and placement of every visible arm, hand, leg, and foot. Do not copy the person, face, hair, clothing, accessories, scenery, lighting, or visual style from Picture 2. Keep the entire figure visible from head to feet, centered, anatomically coherent, with no extra or missing limbs. Additional direction: ${requestedStyle}.`
                    : `Replace the person in Picture 1 with ${requestedStyle}. Reproduce only the pose: match the body orientation, weight distribution, head angle, torso bend, shoulder and hip rotation, and the exact articulation and placement of every visible arm, hand, leg, and foot. Do not preserve the person's identity, face, hair, skin, clothing, accessories, or background. Render one complete, anatomically coherent mannequin from head to feet, centered on a clean neutral studio background, with no extra or missing limbs.`;
                const mammouthResult = poseGenerationProvider === 'mammouth'
                    ? await generateMammouthImage(prompt, mannequinReferenceFile ? [mannequinReferenceFile, poseSourceFile] : [poseSourceFile], '3:4', generationOptions.mammouthImageModel)
                    : null;
                recordUsage(mammouthResult?.usageMetadata);
                let flux2PoseGuide: File | null = null;
                if (poseGenerationProvider === 'flux2') {
                    if (poseLandmarks.length === 0) throw new Error('No pose could be detected for the Flux2 mannequin transfer.');
                    const poseData = mediaPipeToOpenPose(poseLandmarks[0], handLandmarks, handedness, faceLandmarks[0], width, height);
                    flux2PoseGuide = await dataUrlToFile(renderPoseSkeleton(poseData), 'flux2-pose-guide.png');
                }
                const flux2Prompt = mannequinReferenceFile
                    ? `Picture 1 is the authoritative pose skeleton and composition guide. Build one complete full-body mannequin directly over that skeleton, matching every joint location, limb angle, body orientation, torso bend, head direction, hand position, foot position, and weight distribution exactly. Picture 2 is only the appearance reference: copy its mannequin materials, colors, proportions, surface details, and visual style, but completely discard its pose and composition. Do not generate a neutral standing pose. Do not include the skeleton, guides, a human identity, face, hair, skin, clothing, or accessories in the final image. Render only the articulated mannequin, centered and fully visible from head to feet on a clean neutral studio background, with no extra or missing limbs.`
                    : `Transform the pose skeleton in Picture 1 directly into ${requestedStyle}. Keep every joint centered on the same coordinates and preserve every limb angle, body orientation, torso bend, head direction, hand position, foot position, and weight distribution exactly. Do not straighten, normalize, balance, or reinterpret the pose. Replace all skeleton lines and markers with the finished articulated mannequin. Include no human identity, face, hair, skin, clothing, or accessories. Keep the complete mannequin visible from head to feet on a clean neutral studio background, with no extra or missing limbs.`;
                const flux2Result = poseGenerationProvider === 'flux2' && flux2PoseGuide
                    ? await generateComfyUIPortraits(flux2PoseGuide, {
                        ...generationOptions,
                        provider: 'comfyui',
                        comfyModelType: 'flux2-edit',
                        comfyFlux2EditPrompt: flux2Prompt,
                        comfyFlux2EditReferenceRoles: mannequinReferenceFile ? ['style'] : [],
                        comfyFlux2EditReferenceDescriptions: mannequinReferenceFile ? ['Copy only this mannequin appearance and materials. Ignore its pose.'] : [],
                        comfyFlux2EditReinforceSourceIdentity: false,
                        numImages: 1,
                    }, () => undefined, mannequinReferenceFile ? [mannequinReferenceFile] : [])
                    : null;
                const image = poseGenerationProvider === 'flux2' ? flux2Result?.images[0]?.src : mammouthResult?.images[0];
                if (!image) throw new Error(`${poseGenerationProvider} returned no mannequin image.`);
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
            const chartBackground = fontUseSourceColors ? await getDominantImageColor(fontSourceFile) : '#ffffff';
            const mammouthFontPrompt = buildFontChartPrompt(fontUseSourceColors, chartBackground, false);
            const flux2FontPrompt = buildFontChartPrompt(fontUseSourceColors, chartBackground, true);
            const mammouthResult = fontGenerationProvider === 'mammouth'
                ? await generateMammouthImage(mammouthFontPrompt, [fontSourceFile], '3:4', generationOptions.mammouthImageModel)
                : null;
            recordUsage(mammouthResult?.usageMetadata);
            const fontChartCanvas = fontGenerationProvider === 'flux2'
                ? await createFontChartGuide(chartBackground, 'font-chart-guide.png')
                : null;
            const flux2Result = fontGenerationProvider === 'flux2' && fontChartCanvas
                ? await generateComfyUIPortraits(fontChartCanvas, {
                    ...generationOptions,
                    provider: 'comfyui',
                    comfyModelType: 'flux2-edit',
                    comfyFlux2EditPrompt: `Picture 1 is the exact glyph layout guide and every character in it is mandatory. Picture 2 is only a typography reference. ${flux2FontPrompt}`,
                    comfyFlux2EditReferenceRoles: ['style'],
                    comfyFlux2EditReferenceDescriptions: [fontUseSourceColors
                        ? 'Copy only the most prominent headline letterforms and their exact foreground/background color pairing. Ignore imagery, words, and layout.'
                        : 'Copy only the most prominent headline letterform design. Ignore imagery, words, colors, and layout.'],
                    comfyFlux2EditReinforceSourceIdentity: false,
                    comfyFlux2EditSteps: fontFlux2Steps,
                    comfyFlux2EditCfg: fontFlux2Cfg,
                    comfyFlux2EditSampler: fontFlux2Sampler,
                    comfyFlux2EditMegapixels: 1.5,
                    numImages: 1,
                }, () => undefined, [fontSourceFile])
                : null;
            const chartImage = fontGenerationProvider === 'flux2' ? flux2Result?.images[0]?.src : mammouthResult?.images[0];
            if (!chartImage) throw new Error(`${fontGenerationProvider} returned no font chart image.`);
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

    const renderOllamaControls = () => (
        <div className="mt-3 space-y-2">
            <label className="block text-xs font-bold text-text-secondary">Ollama model</label>
            <select
                value={ollamaModel}
                onChange={event => {
                    setOllamaModel(event.target.value);
                    localStorage.setItem('ollama_model', event.target.value);
                    onOllamaModelChange(event.target.value);
                }}
                disabled={isOllamaConnected !== true}
                className="block w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm disabled:opacity-50"
            >
                {[...new Set([ollamaModel, ...ollamaModels])].filter(Boolean).map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            {isOllamaConnected === null && <p className="text-xs text-text-muted">Checking Ollama connection...</p>}
            {isOllamaConnected === false && <p className="text-xs text-danger">Ollama is not connected. Check its URL in Connection Settings.</p>}
        </div>
    );
    
    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto" style={EXTRACTOR_ACCENT_STYLES[activeSubTab] || EXTRACTOR_ACCENT_STYLES.clothes}>
             <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

                 {((activeSubTab === 'clothes' && clothesAnalysisProvider === 'ollama') || (activeSubTab === 'objects' && objectAnalysisProvider === 'ollama')) && ollamaActivity && (
                     <div className="mb-6"><OllamaActivityPanel activity={ollamaActivity} model={ollamaModel} onClose={() => setOllamaActivity(null)} onStop={stopOllamaRequest} /></div>
                 )}

             <div className={activeSubTab === 'clothes' ? 'block' : 'hidden'}>
                <ToolHeader icon={<TshirtIcon className="w-8 h-8"/>} title="Clothing Extractor" description="Extract clothing items from an image and generate variations." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Image" id="clothes-source" onImageUpload={file => { setClothesGenerationJobs([]); setOllamaActivity(null); dispatch(updateExtractorState({ clothesSourceFile: file, identifiedItems: [], generatedClothes: [] })); }} sourceFile={clothesSourceFile} /></div><button onClick={onOpenLibraryForClothes} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <div className="space-y-3 rounded-lg border border-border-primary bg-bg-tertiary p-4">
                            <div>
                                <span className="mb-2 block text-xs font-bold text-text-secondary">Image analysis</span>
                                <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg-primary p-1">
                                    {(['mammouth', 'ollama'] as const).map(provider => <button key={provider} type="button" onClick={() => dispatch(updateExtractorState({ clothesAnalysisProvider: provider }))} className={`rounded-md px-2 py-2 text-xs font-bold capitalize ${clothesAnalysisProvider === provider ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary-hover'}`}>{provider}</button>)}
                                </div>
                                {clothesAnalysisProvider === 'ollama' && renderOllamaControls()}
                            </div>
                        </div>
                        <button onClick={handleIdentifyClothing} disabled={!clothesSourceFile || isIdentifying || (clothesAnalysisProvider === 'ollama' && isOllamaConnected !== true)} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isIdentifying ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Analyzing...</> : 'Identify Clothing'}
                        </button>
                        
                        {identifiedItems.length > 0 && (
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary">Select Items to Extract</h4>
                                {identifiedItems.map((item, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer p-2 hover:bg-bg-primary rounded">
                                        <input type="checkbox" checked={item.selected} onChange={() => {
                                            dispatch(updateExtractorState({
                                                identifiedItems: identifiedItems.map((current, itemIndex) => itemIndex === idx
                                                    ? { ...current, selected: !current.selected }
                                                    : current),
                                            }));
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
                        <ExtractorResultsGrid items={generatedClothes} pendingItems={clothesGenerationJobs} onSave={handleSaveClothing} title="Results" />
                    </div>
                </div>
            </div>

            <div className={activeSubTab === 'hair' ? 'block' : 'hidden'}>
                <ToolHeader icon={<CharacterIcon className="w-8 h-8" />} title="Hair Extractor" description="Extract each person's hairstyle onto a neutral mannequin head." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Image" id="hair-source" onImageUpload={file => { setHairGenerationJobs([]); dispatch(updateExtractorState({ hairSourceFile: file, generatedHair: [] })); }} sourceFile={hairSourceFile} /></div><button onClick={onOpenLibraryForHair} title="Choose from Library" className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6" /></button></div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">People in image: {hairPersonCount}</label>
                            <input type="range" min="1" max="10" value={hairPersonCount} onChange={event => dispatch(updateExtractorState({ hairPersonCount: Number(event.target.value) }))} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                            <p className="mt-2 text-xs text-text-muted">People are processed from left to right.</p>
                        </div>
                        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-primary bg-bg-tertiary p-4">
                            <input type="checkbox" checked={hairExactFidelity} onChange={event => dispatch(updateExtractorState({ hairExactFidelity: event.target.checked }))} className="mt-0.5 rounded text-accent focus:ring-accent" />
                            <span>
                                <span className="block text-sm font-bold text-text-primary">Exact hair fidelity</span>
                                <span className="mt-1 block text-xs text-text-muted">Keep identical messiness, flyaways, asymmetry, texture and colors without grooming.</span>
                            </span>
                        </label>
                        <button onClick={handleGenerateHair} disabled={!hairSourceFile || isGeneratingHair} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isGeneratingHair ? <><SpinnerIcon className="w-5 h-5 animate-spin" />Extracting hair...</> : 'Extract Hairstyles'}
                        </button>
                    </div>
                    <div className="lg:col-span-2">
                        {isGeneratingHair && <LoadingState message="Generating mannequin hairstyle references..." />}
                        {hairError && <p className="text-danger bg-danger-bg p-3 rounded-md">{hairError}</p>}
                        <ExtractorResultsGrid items={generatedHair} pendingItems={hairGenerationJobs} onSave={handleSaveHair} title="Hair Results" />
                    </div>
                </div>
            </div>

             <div className={activeSubTab === 'objects' ? 'block' : 'hidden'}>
                <ToolHeader icon={<CubeIcon className="w-8 h-8"/>} title="Object Extractor" description="Identify and extract specific objects from a scene." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center gap-2"><div className="flex-grow"><ImageUploader label="Source Image" id="object-source" onImageUpload={file => { setObjectGenerationJobs([]); setOllamaActivity(null); dispatch(updateExtractorState({ objectSourceFile: file, identifiedObjects: [], generatedObjects: [] })); }} sourceFile={objectSourceFile} /></div><button onClick={onOpenLibraryForObjects} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button></div>
                        <div className="rounded-lg border border-border-primary bg-bg-tertiary p-4">
                            <span className="mb-2 block text-xs font-bold text-text-secondary">Image analysis</span>
                            <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg-primary p-1">
                                {(['mammouth', 'ollama'] as const).map(provider => <button key={provider} type="button" onClick={() => dispatch(updateExtractorState({ objectAnalysisProvider: provider }))} className={`rounded-md px-2 py-2 text-xs font-bold capitalize ${objectAnalysisProvider === provider ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary-hover'}`}>{provider}</button>)}
                            </div>
                            {objectAnalysisProvider === 'ollama' && renderOllamaControls()}
                        </div>
                        <div><label className="block text-sm font-medium text-text-secondary mb-1">Focus/Hints (Optional)</label><input type="text" value={objectHints} onChange={e => dispatch(updateExtractorState({ objectHints: e.target.value }))} placeholder="e.g., furniture, electronics" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm"/></div>
                        <div><label className="block text-sm font-medium text-text-secondary mb-1">Max Objects: {maxObjects}</label><input type="range" min="1" max="10" value={maxObjects} onChange={e => dispatch(updateExtractorState({ maxObjects: Number(e.target.value) }))} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"/></div>
                        <button onClick={handleIdentifyObjects} disabled={!objectSourceFile || isIdentifyingObjects || (objectAnalysisProvider === 'ollama' && isOllamaConnected !== true)} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
                            {isIdentifyingObjects ? <><SpinnerIcon className="w-5 h-5 animate-spin"/>Scanning...</> : 'Identify Objects'}
                        </button>

                        {identifiedObjects.length > 0 && (
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <h4 className="text-sm font-bold text-text-primary">Select Objects</h4>
                                {identifiedObjects.map((obj, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer p-2 hover:bg-bg-primary rounded">
                                        <input type="checkbox" checked={obj.selected} onChange={() => {
                                            dispatch(updateExtractorState({
                                                identifiedObjects: identifiedObjects.map((current, objectIndex) => objectIndex === idx
                                                    ? { ...current, selected: !current.selected }
                                                    : current),
                                            }));
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
                        <ExtractorResultsGrid items={generatedObjects} pendingItems={objectGenerationJobs} onSave={handleSaveObject} title="Results" />
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
                                    <label className="block text-xs font-medium text-text-secondary mb-1">Mannequin preset</label>
                                    <select
                                        value={MANNEQUIN_STYLE_PRESETS.some(preset => preset.value === mannequinPromptHint) ? mannequinPromptHint : 'custom'}
                                        onChange={event => dispatch(updateExtractorState({ mannequinPromptHint: event.target.value === 'custom' ? '' : event.target.value }))}
                                        className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm"
                                    >
                                        {MANNEQUIN_STYLE_PRESETS.map(preset => <option key={preset.label} value={preset.value}>{preset.label}</option>)}
                                        <option value="custom">Custom style...</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-secondary mb-1">Style instructions</label>
                                    <textarea value={mannequinPromptHint} onChange={(e) => dispatch(updateExtractorState({ mannequinPromptHint: e.target.value }))} placeholder="Describe a custom mannequin style or refine the selected preset..." rows={3} className="w-full resize-y bg-bg-primary border border-border-primary rounded-md p-2 text-sm" />
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
                        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border-primary bg-bg-tertiary p-3">
                            <span><span className="block text-sm font-semibold text-text-primary">Preserve source colors</span><span className="block text-xs text-text-muted">Use the dominant headline color and its background; otherwise generate black on white.</span></span>
                            <input type="checkbox" checked={fontUseSourceColors} onChange={event => dispatch(updateExtractorState({ fontUseSourceColors: event.target.checked, generatedFontChart: null }))} className="h-5 w-5 shrink-0 accent-accent" />
                        </label>
                        {fontGenerationProvider === 'flux2' && (
                            <div className="space-y-4 rounded-md border border-border-primary bg-bg-tertiary p-3">
                                <h4 className="text-sm font-semibold text-text-primary">Flux2 Font Settings</h4>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Steps: {fontFlux2Steps}</label>
                                    <input type="range" min="4" max="20" step="1" value={fontFlux2Steps} onChange={event => dispatch(updateExtractorState({ fontFlux2Steps: Number(event.target.value) }))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg-primary" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">CFG: {fontFlux2Cfg.toFixed(1)}</label>
                                    <input type="range" min="0.8" max="2" step="0.1" value={fontFlux2Cfg} onChange={event => dispatch(updateExtractorState({ fontFlux2Cfg: Number(event.target.value) }))} className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-bg-primary" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-text-secondary">Sampler</label>
                                    <select value={fontFlux2Sampler} onChange={event => dispatch(updateExtractorState({ fontFlux2Sampler: event.target.value }))} className="w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm">
                                        <option value="euler">Euler</option>
                                        <option value="euler_ancestral">Euler Ancestral</option>
                                        <option value="heun">Heun</option>
                                        <option value="dpmpp_2m">DPM++ 2M</option>
                                        <option value="dpmpp_2m_sde">DPM++ 2M SDE</option>
                                    </select>
                                </div>
                            </div>
                        )}
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
                                    <SendToLTXButton imageDataUrl={generatedFontChart.src} prompt="A camera explores the generated typography chart with smooth cinematic motion." showLabel className="flex items-center gap-2 px-4 py-2 bg-bg-primary text-text-secondary font-semibold rounded-lg hover:bg-accent hover:text-accent-text" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
             
             <div className="mt-8 pt-4 border-t border-danger-bg">
                <button onClick={handleResetExtractor} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                    <ResetIcon className="w-5 h-5" /> Reset Extractor Tools
                </button>
            </div>
        </div>
    );
};
