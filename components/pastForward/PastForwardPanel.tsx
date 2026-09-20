
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store/store';
import { addToLibrary } from '../../store/librarySlice';
import { addSessionTokenUsage } from '../../store/appSlice';
import { updateOptions } from '../../store/generationSlice';
import { generateMammouthImage } from '../../services/mammouthService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../../services/mammouthService';
import { generateComfyUIPastForwardImage } from '../../services/pastForwardService';
import { createAlbumPage } from '../../utils/pastForwardAlbumUtils';
import { dataUrlToThumbnail, fileToDataUrl } from '../../utils/imageUtils';
import type { LibraryItem, LibraryItemType } from '../../types';
import { 
    SaveIcon, SpinnerIcon, CheckIcon, DownloadIcon, RefreshIcon, 
    GenerateIcon, PastForwardIcon, LibraryIcon
} from '../icons';
import { ImageUploader } from '../ImageUploader';
import { LibraryPickerModal } from '../LibraryPickerModal';
import { NumberSlider, SelectInput } from '../InputComponents';
import { SendToLTXButton } from '../SendToLTXButton';

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];
const LIBRARY_IMAGE_TYPES: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'];
const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean))).map(value => ({ value, label: value }));
const FLUX_HAIRSTYLES: Record<string, string> = {
    '1950s': 'a realistic 1950s swept-back pompadour with neatly sculpted volume and tapered sides',
    '1960s': 'a realistic 1960s mod hairstyle with a full rounded shape, controlled volume, and period-accurate finish',
    '1970s': 'a realistic 1970s feathered medium-length hairstyle with soft natural layers and side-swept volume',
    '1980s': 'a realistic 1980s long layered hairstyle with pronounced volume, feathered sides, and natural individual strands',
    '1990s': 'a realistic 1990s medium-length grunge hairstyle with relaxed textured layers and natural movement',
    '2000s': 'a realistic 2000s textured shag hairstyle with defined layers, side-swept fringe, and a natural salon finish',
};
const FLUX_DECADE_REIMAGININGS: Record<string, string> = {
    '1950s': 'a sculpted side-part or pompadour, tailored mid-century clothing, a period living room or portrait studio, and authentic black-and-white or early color film photography',
    '1960s': 'a polished mod hairstyle, slim-cut period clothing with bold details, a colorful mid-century interior or music studio, and warm saturated 1960s film',
    '1970s': 'a visibly feathered or shag hairstyle, wide-collar earth-toned clothing, a wood-paneled home or recording studio, and warm grainy 1970s film',
    '1980s': 'a dramatically voluminous layered hairstyle, bold denim or statement clothing, a colorful 1980s interior, and punchy flash-lit analog photography',
    '1990s': 'a textured grunge-era hairstyle, relaxed layered clothing, a 1990s rehearsal room or urban interior, and natural consumer-film color and grain',
    '2000s': 'a defined textured hairstyle with an early-2000s salon finish, fitted layered clothing, a contemporary Y2K interior, and crisp early-digital-camera rendering',
};
const SUPERHERO_COMIC_STYLES: Record<string, string> = {
    '1950s': 'a 1950s Golden Age comic cover with bold hand-drawn ink outlines, simple heroic anatomy, limited CMYK colors, aged paper, and visible halftone dots',
    '1960s': 'a 1960s Silver Age comic panel with clean expressive inks, flat bright primary colors, dramatic action lines, caption boxes, and Ben-Day dots',
    '1970s': 'a 1970s Bronze Age comic illustration with detailed linework, natural heroic proportions, muted printed colors, textured shadows, and vintage newsprint grain',
    '1980s': 'a 1980s comic-book splash page with muscular heroic anatomy, dynamic foreshortening, heavy black inks, saturated colors, and dramatic cross-hatching',
    '1990s': 'a 1990s extreme-action comic cover with energetic angular linework, exaggerated perspective, dense cross-hatching, vivid colors, and explosive graphic composition',
    '2000s': 'a polished 2000s digital comic cover with crisp ink lines, cinematic panel composition, rich cel shading, controlled highlights, and modern printed-comic color',
};
const HISTORICAL_CAMEO_SCENES: Record<string, string> = {
    '1950s': 'a 1950s civil-rights march on an American city street, walking purposefully near the front among peaceful demonstrators carrying period-appropriate equality signs, wearing authentic mid-century clothing, photographed by a press photographer on grainy black-and-white film',
    '1960s': 'a crowded 1960s public gathering watching the Apollo 11 Moon landing broadcast, reacting with wonder beside families and journalists, surrounded by period televisions, cameras, furniture, and clothing, captured on warm documentary color film',
    '1970s': 'a major 1970s anti-war peace march in Washington, D.C., walking among a dense crowd of demonstrators near the Washington Monument while holding a hand-painted PEACE NOW placard, wearing authentic denim and period clothing, captured as candid documentary photography',
    '1980s': 'the jubilant crowd at the Berlin Wall in November 1989, standing on the wall among celebrating citizens as people gather on both sides, wearing authentic late-1980s clothing, illuminated by press lights and photographed on high-speed color film',
    '1990s': 'a lively early-1990s election-night street celebration as an engaged participant among journalists and cheering citizens, surrounded by handmade signs, broadcast cameras, period cars, and authentic 1990s clothing, photographed on candid color film',
    '2000s': 'the crowded Times Square millennium celebration at midnight entering the year 2000, celebrating among revelers beneath illuminated signs, confetti, broadcast cameras, and authentic turn-of-the-millennium clothing, captured as crisp early-digital news photography',
};
const REIMAGINE_SCENE_PROMPT = 'Create a completely new scene and composition that is not based on the source room, background, pose, crop, framing, or camera angle. Place the same recognizable subject in a different era-appropriate environment with a new natural pose, new body positioning, new camera viewpoint, new lighting, and new composition. Preserve only the subject identity and defining facial features from the source.';

const THEMES: Record<string, { title: string, description: string, prompt: (decade: string) => string, fluxPrompt: (decade: string) => string }> = {
    'decades': {
        title: 'Through the Decades',
        description: 'The original experience. See yourself reimagined in the style of past decades.',
        prompt: (decade: string) => `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`,
        fluxPrompt: (decade: string) => `Reimagine the entire source photograph as a newly photographed, authentic ${decade} portrait of the same recognizable person. Replace the original hairstyle, clothing, background, lighting, props, color treatment, and photographic medium with ${FLUX_DECADE_REIMAGININGS[decade]}. The transformation must be obvious: do not retain the source hairstyle, wardrobe, room, or modern photographic look. Preserve the person's recognizable facial identity, facial anatomy, eyewear if present, facial hair if present, skin tone, and apparent age. Create a cohesive photorealistic period scene rather than a subtle filter on the source image.`,
    },
    'hairstyles': {
        title: 'Hairstyle Time Machine',
        description: 'Try on the most popular hairstyles from each decade.',
        prompt: (decade: string) => `Reimagine the person in this photo with a popular hairstyle from the ${decade}. The output must be a photorealistic image showing the person clearly, focusing on the hair.`,
        fluxPrompt: (decade: string) => `Replace the current hair with ${FLUX_HAIRSTYLES[decade]}. Make the new hair visibly different from the source, with believable roots, hairline, strand detail, texture, volume, and lighting. Keep the face, glasses, facial hair, skin, expression, clothing, body, pose, camera framing, and background exactly unchanged. Photorealistic professional hairstyle edit, not a wig, illustration, or beauty-filtered face.`,
    },
    'fantasy': {
        title: 'Fantasy You',
        description: 'Create a fantasy version of yourself through the ages.',
        prompt: (decade: string) => `Create a fantasy version of the person in this photo, with attire and setting inspired by fantasy art trends of the ${decade}. The output must be a photorealistic image.`,
        fluxPrompt: (decade: string) => `Reimagine the source person as a complete photorealistic fantasy character inspired by fantasy art from the ${decade}. Create entirely new era-inspired fantasy attire, hairstyle, accessories, props, environment, atmosphere, lighting, pose, body positioning, framing, and camera angle. Do not reuse the source room, clothing, pose, crop, or composition. Preserve the person's recognizable facial identity, facial anatomy, skin tone, apparent age, eyewear if present, and facial hair if present. The result must look like a newly photographed cinematic fantasy scene, not a filtered source photo.`,
    },
    'superhero': {
        title: 'Superhero Saga',
        description: 'Design a superhero version of you from different comic book eras.',
        prompt: (decade: string) => `Reimagine the person in this photo as an original superhero in ${SUPERHERO_COMIC_STYLES[decade]}. Create a new superhero costume, emblem, powers, action pose, camera angle, city environment, and complete comic-book composition. Preserve the person's recognizable facial identity. The output must be a hand-drawn comic-book illustration, not a photograph, not photorealistic, and not a person wearing a costume in a photo.`,
        fluxPrompt: (decade: string) => `Reimagine the source person as an original superhero in ${SUPERHERO_COMIC_STYLES[decade]}. Create an entirely new superhero costume, emblem, powers, action pose, body positioning, dramatic camera angle, city environment, lighting, and complete comic-cover composition. Do not reuse the source room, clothing, pose, crop, or photographic rendering. Preserve the person's recognizable face shape, eyes, nose, mouth, eyewear if present, facial hair if present, skin tone, and apparent age, translated into illustrated linework. Render every element as a cohesive hand-drawn comic-book illustration. Absolutely no photography, photorealism, live-action appearance, realistic skin texture, or cosplay photograph.`,
    },
    'historical': {
        title: 'Historical Cameo',
        description: 'Place yourself in famous historical events or scenes.',
        prompt: (decade: string) => `Insert the person from the source photo naturally into ${HISTORICAL_CAMEO_SCENES[decade]}. Recompose the entire image around that event: give the person a believable role, action, pose, body position, expression, wardrobe, camera angle, lighting, and scale within the crowd. Preserve the person's recognizable facial identity, eyewear if present, facial hair if present, skin tone, and apparent age. The result must look like an authentic photograph taken during the event, not a modern portrait with a replaced background. Include historically appropriate supporting people without duplicating the source person.`,
        fluxPrompt: (decade: string) => `Reimagine the entire source photograph as a newly captured historical photograph showing the source person participating naturally in ${HISTORICAL_CAMEO_SCENES[decade]}. Replace the source room, clothing, pose, expression, crop, framing, camera angle, lighting, props, and composition. Integrate the person at a believable scale and depth within the action, interacting naturally with the scene rather than facing the camera like a pasted-in portrait. Preserve the person's recognizable face shape, eyes, nose, mouth, eyewear if present, facial hair if present, skin tone, and apparent age. Supporting people must be varied period-appropriate individuals and must not duplicate the source face. Match the event's documentary lens, film grain, color response, shadows, perspective, and ambient light across the entire image. Photorealistic historical documentary photograph, not a studio portrait, costume portrait, backdrop replacement, collage, or modern reenactment.`,
    },
};

type ImageStatus = 'idle' | 'pending' | 'done' | 'error';

interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

interface DecadeProgress {
    value: number;
    message: string;
}

const PastForwardPanel: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const generationOptions = useSelector((state: RootState) => state.generation.options);
    const { isComfyUIConnected, isMammouthConnected, comfyUIObjectInfo } = useSelector((state: RootState) => state.app);
    
    // State
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [generationProgress, setGenerationProgress] = useState<Record<string, DecadeProgress>>({});
    const [generationDecades, setGenerationDecades] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState<boolean>(false);
    const [selectedTheme, setSelectedTheme] = useState<string>('decades');
    const [reimagineScene, setReimagineScene] = useState(false);
    const [selectedDecades, setSelectedDecades] = useState<string[]>([...DECADES]);
    const [saveStatuses, setSaveStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [albumSaveStatus, setAlbumSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [provider, setProvider] = useState<'comfyui' | 'mammouth'>('comfyui');
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [zoomedImage, setZoomedImage] = useState<{ url: string; decade: string } | null>(null);
    const [mammouthModels, setMammouthModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
    const [isLoadingMammouthModels, setIsLoadingMammouthModels] = useState(false);

    const models = getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name);
    const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
    const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
    const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    const cacheDitModels = getOptions(comfyUIObjectInfo?.CacheDiT_Model_Optimizer?.input?.required?.model_type);
    const requiredNodes = ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'];
    const missingNodes = comfyUIObjectInfo ? requiredNodes.filter(node => !comfyUIObjectInfo[node]) : [];
    if (generationOptions.comfyFlux2EditUseCacheDit && comfyUIObjectInfo && !comfyUIObjectInfo.CacheDiT_Model_Optimizer) missingNodes.push('CacheDiT_Model_Optimizer');

    useEffect(() => {
        if (provider !== 'mammouth') return;
        setIsLoadingMammouthModels(true);
        getMammouthImageModels()
            .then(models => setMammouthModels(models.length > 0 ? models : [...MAMMOUTH_IMAGE_MODELS].sort()))
            .finally(() => setIsLoadingMammouthModels(false));
    }, [provider]);

    useEffect(() => {
        if (!zoomedImage) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setZoomedImage(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoomedImage]);

    // Initialize empty state for grid
    useEffect(() => {
        const initialImages: Record<string, GeneratedImage> = {};
        DECADES.forEach(decade => {
            initialImages[decade] = { status: 'idle' };
        });
        setGeneratedImages(initialImages);
    }, []);

    const handleImageUpload = async (file: File | null) => {
        setUploadedFile(file);
        if (file) {
            try {
                const base64 = await fileToDataUrl(file);
                setUploadedImageBase64(base64);
                // Reset results when new image is uploaded
                const initialImages: Record<string, GeneratedImage> = {};
                DECADES.forEach(decade => {
                    initialImages[decade] = { status: 'idle' };
                });
                setGeneratedImages(initialImages);
                setGenerationProgress({});
                setGenerationDecades([]);
                setSaveStatuses({});
                setAlbumSaveStatus('idle');
            } catch (e) {
                console.error("Error reading file:", e);
            }
        } else {
            setUploadedImageBase64(null);
        }
    };

    const handleLibrarySelect = async (item: LibraryItem) => {
        const response = await fetch(item.media);
        if (!response.ok) throw new Error(`Unable to load Library image (${response.status}).`);
        const blob = await response.blob();
        const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
        await handleImageUpload(new File([blob], `past-forward-${item.id}.${extension}`, { type: blob.type }));
    };

    const generatePastForwardImage = async (prompt: string, fluxPrompt: string, decade: string): Promise<string> => {
        if (!uploadedFile || !uploadedImageBase64) throw new Error('Select a source photo first.');
        const finalPrompt = reimagineScene ? `${prompt} ${REIMAGINE_SCENE_PROMPT}` : prompt;
        const finalFluxPrompt = reimagineScene ? `${fluxPrompt} ${REIMAGINE_SCENE_PROMPT}` : fluxPrompt;
        if (provider === 'mammouth') {
            setGenerationProgress(current => ({ ...current, [decade]: { value: 0.1, message: `Generating ${decade} with Mammouth...` } }));
            const result = await generateMammouthImage(finalPrompt, [uploadedImageBase64], '3:4', generationOptions.mammouthImageModel);
            if (result.usageMetadata) dispatch(addSessionTokenUsage(result.usageMetadata));
            if (!result.images[0]) throw new Error('Mammouth completed without returning a Past Forward image.');
            return result.images[0];
        }
        return generateComfyUIPastForwardImage(
            uploadedFile,
            finalFluxPrompt,
            generationOptions,
            !reimagineScene && selectedTheme !== 'hairstyles' && selectedTheme !== 'decades' && selectedTheme !== 'fantasy' && selectedTheme !== 'superhero' && selectedTheme !== 'historical',
            selectedTheme !== 'superhero',
            selectedTheme === 'historical',
            (message, value) => setGenerationProgress(current => ({ ...current, [decade]: { value, message } })),
        );
    };

    const toggleDecade = (decade: string) => {
        if (isGenerating) return;
        setSelectedDecades(current => DECADES.filter(item => item === decade ? !current.includes(item) : current.includes(item)));
        setAlbumSaveStatus('idle');
    };

    const handleGenerateClick = async () => {
        if (!uploadedImageBase64 || selectedDecades.length === 0) return;

        const activeDecades = [...selectedDecades];
        setIsGenerating(true);
        setGenerationDecades(activeDecades);
        setGenerationProgress(Object.fromEntries(activeDecades.map(decade => [decade, { value: 0, message: 'Queued' }])));
        
        setGeneratedImages(prev => {
            const next = { ...prev };
            activeDecades.forEach(decade => next[decade] = { status: 'pending' });
            return next;
        });

        const concurrencyLimit = 2;
        const decadesQueue = [...activeDecades];

        const processDecade = async (decade: string) => {
            try {
                setGenerationProgress(current => ({ ...current, [decade]: { value: 0.02, message: `Starting ${decade}...` } }));
                const prompt = THEMES[selectedTheme].prompt(decade);
                const resultUrl = await generatePastForwardImage(prompt, THEMES[selectedTheme].fluxPrompt(decade), decade);
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'done', url: resultUrl },
                }));
                setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} complete` } }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'error', error: errorMessage },
                }));
                setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} failed` } }));
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (decadesQueue.length > 0) {
                const decade = decadesQueue.shift();
                if (decade) {
                    await processDecade(decade);
                }
            }
        });

        await Promise.all(workers);
        setIsGenerating(false);
    };

    const handleRegenerateDecade = async (decade: string) => {
        if (!uploadedImageBase64) return;
        if (!selectedDecades.includes(decade)) return;
        if (generatedImages[decade]?.status === 'pending') return;
        
        setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));
        setGenerationDecades(current => current.includes(decade) ? current : [...current, decade]);
        setGenerationProgress(current => ({ ...current, [decade]: { value: 0.02, message: `Starting ${decade}...` } }));

        try {
            const prompt = THEMES[selectedTheme].prompt(decade);
            const resultUrl = await generatePastForwardImage(prompt, THEMES[selectedTheme].fluxPrompt(decade), decade);
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'done', url: resultUrl },
            }));
            setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} complete` } }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'error', error: errorMessage },
            }));
            setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} failed` } }));
        }
    };

    const handleSaveIndividualImage = async (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status !== 'done' || !image.url || !uploadedImageBase64) return;

        setSaveStatuses(prev => ({ ...prev, [decade]: 'saving' }));
        try {
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward - ${decade} (${THEMES[selectedTheme].title})`,
                media: image.url,
                thumbnail: await dataUrlToThumbnail(image.url, 256),
                sourceImage: uploadedImageBase64
            };
            await dispatch(addToLibrary(item)).unwrap();
            setSaveStatuses(prev => ({ ...prev, [decade]: 'saved' }));
        } catch (err) {
            console.error("Failed to save image:", err);
            setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        }
    };

    const handleDownloadIndividualImage = (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `past-forward-${decade}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const getCompletedImages = () => {
        return (Object.entries(generatedImages) as [string, GeneratedImage][])
            .filter(([decade, image]) => selectedDecades.includes(decade) && image.status === 'done' && image.url)
            .reduce((acc, [decade, image]) => {
                acc[decade] = image.url!;
                return acc;
            }, {} as Record<string, string>);
    };

    const handleDownloadAlbum = async () => {
        const imageData = getCompletedImages();
        if (selectedDecades.length === 0 || Object.keys(imageData).length < selectedDecades.length) {
            alert("Please wait for all selected decades to finish generating.");
            return;
        }

        setIsCreatingAlbum(true);
        try {
            const albumDataUrl = await createAlbumPage(imageData);
            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'past-forward-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Album error:", error);
            alert("Error creating album.");
        } finally {
            setIsCreatingAlbum(false);
        }
    };

    const handleSaveAlbum = async () => {
        const imageData = getCompletedImages();
        if (selectedDecades.length === 0 || Object.keys(imageData).length < selectedDecades.length) {
            alert("Please wait for all selected decades to finish generating.");
            return;
        }

        setAlbumSaveStatus('saving');
        try {
            const albumDataUrl = await createAlbumPage(imageData);
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward Album (${THEMES[selectedTheme].title})`,
                media: albumDataUrl,
                thumbnail: await dataUrlToThumbnail(albumDataUrl, 256),
                sourceImage: uploadedImageBase64!
            };
            await dispatch(addToLibrary(item)).unwrap();
            setAlbumSaveStatus('saved');
        } catch (error) {
            console.error("Album save error:", error);
            setAlbumSaveStatus('idle');
        }
    };

    const providerReady = provider === 'comfyui'
        ? !!isComfyUIConnected && missingNodes.length === 0
        : !!isMammouthConnected;
    const isReadyToGenerate = !!uploadedImageBase64 && !!uploadedFile && selectedDecades.length > 0 && providerReady && !isGenerating;
    const hasResults = selectedDecades.some(decade => generatedImages[decade]?.status === 'done');
    const selectedResultsComplete = selectedDecades.length > 0 && selectedDecades.every(decade => generatedImages[decade]?.status === 'done');
    const runningDecades = generationDecades.filter(decade => generatedImages[decade]?.status === 'pending');
    const failedDecades = generationDecades.filter(decade => generatedImages[decade]?.status === 'error');
    const completedGenerationCount = generationDecades.filter(decade => generatedImages[decade]?.status === 'done' || generatedImages[decade]?.status === 'error').length;
    const overallProgress = generationDecades.length > 0
        ? generationDecades.reduce((total, decade) => total + (generationProgress[decade]?.value || 0), 0) / generationDecades.length
        : 0;

    return (
        <div className="space-y-6">
            {zoomedImage && <div className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${zoomedImage.decade} full-size result`} onClick={() => setZoomedImage(null)}>
                <img src={zoomedImage.url} alt={`Past Forward ${zoomedImage.decade} full-size result`} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" onClick={event => event.stopPropagation()} />
            </div>}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-primary bg-bg-secondary p-3">
                <span className="text-sm font-semibold text-text-secondary">Past Forward engine</span>
                <div className="flex gap-1 rounded-md bg-bg-tertiary p-1">
                    <button type="button" onClick={() => setProvider('comfyui')} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'comfyui' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>FLUX2</button>
                    <button type="button" onClick={() => setProvider('mammouth')} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'mammouth' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Mammouth</button>
                </div>
                {provider === 'mammouth' && <div className="relative min-w-[240px] flex-1">
                    <select value={generationOptions.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} onChange={(event) => dispatch(updateOptions({ mammouthImageModel: event.target.value }))} disabled={isGenerating || isLoadingMammouthModels} className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2 pr-8 text-sm" aria-label="Mammouth image model">
                        {mammouthModels.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                    {isLoadingMammouthModels && <SpinnerIcon className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-text-muted" />}
                </div>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* LEFT COLUMN: Controls */}
            <div className="lg:col-span-1 space-y-8">
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <PastForwardIcon className="w-8 h-8 text-accent" />
                        <h2 className="text-xl font-bold text-accent">1. Source & Theme</h2>
                    </div>

                    <div className="space-y-6">
                        <ImageUploader 
                            label="Upload Source Photo" 
                            id="past-forward-upload"
                            onImageUpload={handleImageUpload}
                            sourceFile={uploadedFile}
                        />
                        <button type="button" onClick={() => setIsLibraryOpen(true)} disabled={isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50">
                            <LibraryIcon className="h-4 w-4" /> Choose from Library
                        </button>

                        {provider === 'comfyui' && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <button type="button" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:text-accent" aria-expanded={advancedOpen}>
                                <span>FLUX2 Advanced Settings</span><span>{advancedOpen ? '−' : '+'}</span>
                            </button>
                            {advancedOpen && <div className="space-y-4 border-t border-border-primary p-4">
                                <SelectInput label="FLUX2 Model" value={generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditUnet: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf', models)} disabled={isGenerating} />
                                <SelectInput label="CLIP" value={generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditClip: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors', clips)} disabled={isGenerating} />
                                <SelectInput label="VAE" value={generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditVae: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors', vaes)} disabled={isGenerating} />
                                <SelectInput label="Sampler" value={generationOptions.comfyFlux2EditSampler || 'euler'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditSampler: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditSampler || 'euler', samplers)} disabled={isGenerating} />
                                <NumberSlider label={`Source Megapixels: ${generationOptions.comfyFlux2EditMegapixels ?? 1}`} value={generationOptions.comfyFlux2EditMegapixels ?? 1} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditMegapixels: Number(event.target.value) }))} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`Steps: ${generationOptions.comfyFlux2EditSteps ?? 4}`} value={generationOptions.comfyFlux2EditSteps ?? 4} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditSteps: Number(event.target.value) }))} min={1} max={40} step={1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`CFG: ${generationOptions.comfyFlux2EditCfg ?? 1}`} value={generationOptions.comfyFlux2EditCfg ?? 1} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCfg: Number(event.target.value) }))} min={0.1} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={!!generationOptions.comfyFlux2EditUseCacheDit} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditUseCacheDit: event.target.checked }))} disabled={isGenerating} className="rounded text-accent focus:ring-accent" />Enable CacheDiT Accelerator</label>
                                {generationOptions.comfyFlux2EditUseCacheDit && <div className="space-y-4">
                                    <SelectInput label="CacheDiT Model Type" value={generationOptions.comfyFlux2EditCacheDitModelType || 'Auto'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitModelType: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditCacheDitModelType || 'Auto', cacheDitModels)} disabled={isGenerating} />
                                    <NumberSlider label={`Warmup: ${generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitWarmupSteps: Number(event.target.value) }))} min={0} max={20} step={1} disabled={isGenerating} allowDirectInput />
                                    <NumberSlider label={`Skip: ${generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitSkipInterval: Number(event.target.value) }))} min={0} max={10} step={1} disabled={isGenerating} allowDirectInput />
                                </div>}
                            </div>}
                        </div>}

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Select Journey Theme</label>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.entries(THEMES).map(([key, theme]) => (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedTheme(key)}
                                        disabled={isGenerating}
                                        className={`p-3 rounded-lg text-left transition-all duration-200 border ${
                                            selectedTheme === key 
                                                ? 'bg-accent/10 border-accent shadow-sm' 
                                                : 'bg-bg-tertiary border-transparent hover:bg-bg-tertiary-hover'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`font-bold text-sm ${selectedTheme === key ? 'text-accent' : 'text-text-primary'}`}>
                                                {theme.title}
                                            </span>
                                            {selectedTheme === key && <CheckIcon className="w-4 h-4 text-accent" />}
                                        </div>
                                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                            {theme.description}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${reimagineScene ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-accent'}`}>
                            <input type="checkbox" checked={reimagineScene} onChange={(event) => { setReimagineScene(event.target.checked); setAlbumSaveStatus('idle'); }} disabled={isGenerating} className="mt-0.5 rounded border-border-primary text-accent focus:ring-accent" />
                            <span>
                                <span className={`block text-sm font-bold ${reimagineScene ? 'text-accent' : 'text-text-primary'}`}>Reimagine the scene</span>
                                <span className="mt-1 block text-xs text-text-muted">Create a new background, pose, framing, camera angle, lighting, and composition.</span>
                            </span>
                        </label>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="text-sm font-medium text-text-secondary">Select Decades ({selectedDecades.length}/{DECADES.length})</label>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => { setSelectedDecades([...DECADES]); setAlbumSaveStatus('idle'); }} disabled={isGenerating || selectedDecades.length === DECADES.length} className="rounded px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40">Select All</button>
                                    <button type="button" onClick={() => { setSelectedDecades([]); setAlbumSaveStatus('idle'); }} disabled={isGenerating || selectedDecades.length === 0} className="rounded px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40">Deselect All</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {DECADES.map(decade => {
                                    const isSelected = selectedDecades.includes(decade);
                                    return <label key={decade} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${isSelected ? 'border-accent bg-accent/10 text-accent' : 'border-border-primary bg-bg-tertiary text-text-muted'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'hover:border-accent'}`}>
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleDecade(decade)} disabled={isGenerating} className="rounded border-border-primary text-accent focus:ring-accent" />
                                        {decade}
                                    </label>;
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    {provider === 'comfyui' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use FLUX2 Past Forward.</p>}
                    {provider === 'mammouth' && !isMammouthConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect Mammouth to use Mammouth Past Forward.</p>}
                    {provider === 'comfyui' && missingNodes.length > 0 && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
                    <button 
                        onClick={handleGenerateClick}
                        disabled={!isReadyToGenerate}
                        style={isReadyToGenerate ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                        className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                    >
                        {isGenerating ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}
                        {isGenerating ? 'Travelling Through Time...' : selectedDecades.length === 0 ? 'Select at least one decade' : `Generate ${selectedDecades.length} with ${provider === 'comfyui' ? 'FLUX2' : 'Mammouth'}`}
                    </button>
                </div>
            </div>

            {/* RIGHT COLUMN: Results */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                        <h2 className="text-xl font-bold text-accent">2. Time Travel Results</h2>
                        {hasResults && (
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleDownloadAlbum}
                                    disabled={isCreatingAlbum || !selectedResultsComplete}
                                    className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                >
                                    {isCreatingAlbum ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <DownloadIcon className="w-4 h-4"/>}
                                    Download Album
                                </button>
                                <button 
                                    onClick={handleSaveAlbum}
                                    disabled={albumSaveStatus !== 'idle' || !selectedResultsComplete}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                                        albumSaveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover'
                                    }`}
                                >
                                    {albumSaveStatus === 'saving' ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : albumSaveStatus === 'saved' ? <CheckIcon className="w-4 h-4"/> : <SaveIcon className="w-4 h-4"/>}
                                    {albumSaveStatus === 'saved' ? 'Saved' : 'Save Album'}
                                </button>
                            </div>
                        )}
                    </div>

                    {generationDecades.length > 0 && <div className="mb-6 space-y-3 rounded-md border border-border-primary bg-bg-primary p-4">
                        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                            <span className="text-text-primary">Generation progress</span>
                            <span className="text-text-secondary">{completedGenerationCount}/{generationDecades.length}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary" role="progressbar" aria-label="Past Forward generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overallProgress * 100)}>
                            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round(overallProgress * 100)}%` }} />
                        </div>
                        {runningDecades.length > 0 && <p className="text-xs text-text-secondary">In progress: <span className="font-bold text-accent">{runningDecades.join(', ')}</span></p>}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {generationDecades.map(decade => {
                                const progress = generationProgress[decade] || { value: 0, message: 'Queued' };
                                return <div key={decade} className="rounded border border-border-primary bg-bg-secondary px-3 py-2">
                                    <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-bold text-text-primary">{decade}</span><span className="text-text-muted">{Math.round(progress.value * 100)}%</span></div>
                                    <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary"><div className={`h-full transition-all duration-300 ${generatedImages[decade]?.status === 'error' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.round(progress.value * 100)}%` }} /></div>
                                    <p className="mt-1 truncate text-[11px] text-text-muted" title={progress.message}>{progress.message}</p>
                                </div>;
                            })}
                        </div>
                        {failedDecades.length > 0 && <div className="rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">
                            <p className="font-bold">Generation errors</p>
                            {failedDecades.map(decade => <p key={decade} className="mt-1"><span className="font-semibold">{decade}:</span> {generatedImages[decade]?.error}</p>)}
                        </div>}
                    </div>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {DECADES.map(decade => {
                            const image = generatedImages[decade];
                            const status = image?.status || 'idle';
                            const savedStatus = saveStatuses[decade] || 'idle';
                            const isSelected = selectedDecades.includes(decade);

                            return (
                                <div
                                    key={decade}
                                    className={`group relative aspect-[3/4] overflow-hidden rounded-lg border bg-bg-tertiary shadow-md transition-opacity ${status === 'done' && image.url ? 'cursor-zoom-in' : ''} ${isSelected ? 'border-accent/50' : 'border-border-primary/30 opacity-45'}`}
                                    onClick={() => { if (status === 'done' && image.url) setZoomedImage({ url: image.url, decade }); }}
                                    onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && status === 'done' && image.url) setZoomedImage({ url: image.url, decade }); }}
                                    role={status === 'done' && image.url ? 'button' : undefined}
                                    tabIndex={status === 'done' && image.url ? 0 : undefined}
                                    aria-label={status === 'done' && image.url ? `View ${decade} result full size` : undefined}
                                >
                                    <span className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">{isSelected ? 'Active' : 'Inactive'}</span>
                                    {/* Card Content */}
                                    {status === 'idle' && (
                                        <div className="flex flex-col items-center justify-center h-full text-text-muted p-4 text-center">
                                            <PastForwardIcon className="w-12 h-12 opacity-20 mb-2" />
                                            <span className="text-lg font-bold opacity-40">{decade}</span>
                                        </div>
                                    )}
                                    
                                    {status === 'pending' && (
                                        <div className="flex flex-col items-center justify-center h-full bg-black/20">
                                            <SpinnerIcon className="w-8 h-8 text-accent animate-spin mb-2" />
                                            <span className="text-xs text-accent font-semibold animate-pulse">{generationProgress[decade]?.message || `Generating ${decade}...`}</span>
                                            <div className="mt-3 h-1.5 w-3/4 overflow-hidden rounded-full bg-bg-primary"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round((generationProgress[decade]?.value || 0) * 100)}%` }} /></div>
                                        </div>
                                    )}

                                    {status === 'error' && (
                                        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                                            <p className="text-danger font-bold text-sm">Generation Failed</p>
                                            <p className="text-xs text-danger/70 mt-1">{image.error}</p>
                                            <button 
                                                onClick={() => handleRegenerateDecade(decade)}
                                                className="mt-3 p-2 bg-bg-primary rounded-full hover:bg-accent hover:text-accent-text transition-colors"
                                            >
                                                <RefreshIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}

                                    {status === 'done' && image.url && (
                                        <>
                                            <img src={image.url} alt={decade} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            
                                            {/* Label Badge */}
                                            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                                                {decade}
                                            </div>

                                            {/* Hover Actions */}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleDownloadIndividualImage(decade); }}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Download"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleSaveIndividualImage(decade); }}
                                                    disabled={savedStatus !== 'idle'}
                                                    className={`p-2 rounded-full transition-colors shadow-lg ${
                                                        savedStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text'
                                                    }`}
                                                    title="Save to Library"
                                                >
                                                    {savedStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : savedStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                                </button>
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleRegenerateDecade(decade); }}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Regenerate"
                                                >
                                                    <RefreshIcon className="w-5 h-5" />
                                                </button>
                                                <SendToLTXButton imageDataUrl={image.url} prompt={THEMES[selectedTheme].prompt(decade)} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            </div>
            <LibraryPickerModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onSelectItem={handleLibrarySelect} filter={LIBRARY_IMAGE_TYPES} />
        </div>
    );
};

export default PastForwardPanel;
