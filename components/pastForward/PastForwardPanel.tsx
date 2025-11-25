
import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store/store';
import { addToLibrary } from '../../store/librarySlice';
import { generateDecadeImage } from '../../services/geminiService';
import { createAlbumPage } from '../../utils/pastForwardAlbumUtils';
import { dataUrlToThumbnail, fileToDataUrl } from '../../utils/imageUtils';
import { 
    SaveIcon, SpinnerIcon, CheckIcon, DownloadIcon, RefreshIcon, 
    GenerateIcon, PastForwardIcon 
} from '../icons';
import { ImageUploader } from '../ImageUploader';

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];

const THEMES: Record<string, { title: string, description: string, prompt: (decade: string) => string }> = {
    'decades': {
        title: 'Through the Decades',
        description: 'The original experience. See yourself reimagined in the style of past decades.',
        prompt: (decade: string) => `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`,
    },
    'hairstyles': {
        title: 'Hairstyle Time Machine',
        description: 'Try on the most popular hairstyles from each decade.',
        prompt: (decade: string) => `Reimagine the person in this photo with a popular hairstyle from the ${decade}. The output must be a photorealistic image showing the person clearly, focusing on the hair.`,
    },
    'pet-cartoon': {
        title: 'Pet Cartoon-a-tron',
        description: 'Turn your pet into a cartoon character from different eras.',
        prompt: (decade: string) => `Turn the pet in this photo into a cartoon character in the animation style of the ${decade}. The output must be a colorful cartoon image.`,
    },
    'fantasy': {
        title: 'Fantasy You',
        description: 'Create a fantasy version of yourself through the ages.',
        prompt: (decade: string) => `Create a fantasy version of the person in this photo, with attire and setting inspired by fantasy art trends of the ${decade}. The output must be a photorealistic image.`,
    },
    'superhero': {
        title: 'Superhero Saga',
        description: 'Design a superhero version of you from different comic book eras.',
        prompt: (decade: string) => `Design a superhero based on the person in this photo, with a costume and style that reflects the comic book aesthetics of the ${decade}. The output must be a photorealistic image.`,
    },
    'historical': {
        title: 'Historical Cameo',
        description: 'Place yourself in famous historical events or scenes.',
        prompt: (decade: string) => `Place the person from this photo into a famous historical event or a scene typical of the ${decade}. The output must be a photorealistic image that blends the person seamlessly into the historical context.`,
    },
};

type ImageStatus = 'idle' | 'pending' | 'done' | 'error';

interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const PastForwardPanel: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    
    // State
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState<boolean>(false);
    const [selectedTheme, setSelectedTheme] = useState<string>('decades');
    const [saveStatuses, setSaveStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [albumSaveStatus, setAlbumSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

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
                setSaveStatuses({});
                setAlbumSaveStatus('idle');
            } catch (e) {
                console.error("Error reading file:", e);
            }
        } else {
            setUploadedImageBase64(null);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImageBase64) return;

        setIsGenerating(true);
        
        // Set all to pending initially to show loading state in grid
        setGeneratedImages(prev => {
            const next = { ...prev };
            DECADES.forEach(d => next[d] = { status: 'pending' });
            return next;
        });

        const concurrencyLimit = 2;
        const decadesQueue = [...DECADES];

        const processDecade = async (decade: string) => {
            try {
                const prompt = THEMES[selectedTheme].prompt(decade);
                const resultUrl = await generateDecadeImage(uploadedImageBase64, prompt);
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'done', url: resultUrl },
                }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'error', error: errorMessage },
                }));
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
        if (generatedImages[decade]?.status === 'pending') return;
        
        setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));

        try {
            const prompt = THEMES[selectedTheme].prompt(decade);
            const resultUrl = await generateDecadeImage(uploadedImageBase64, prompt);
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'done', url: resultUrl },
            }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'error', error: errorMessage },
            }));
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
            .filter(([, image]) => image.status === 'done' && image.url)
            .reduce((acc, [decade, image]) => {
                acc[decade] = image.url!;
                return acc;
            }, {} as Record<string, string>);
    };

    const handleDownloadAlbum = async () => {
        const imageData = getCompletedImages();
        if (Object.keys(imageData).length < DECADES.length) {
            alert("Please wait for all images to finish generating.");
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
        if (Object.keys(imageData).length < DECADES.length) {
            alert("Please wait for all images to finish generating.");
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

    const isReadyToGenerate = !!uploadedImageBase64 && !isGenerating;
    const hasResults = (Object.values(generatedImages) as GeneratedImage[]).some(img => img.status === 'done');

    return (
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

                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Select Journey Theme</label>
                            <div className="grid grid-cols-1 gap-2">
                                {Object.entries(THEMES).map(([key, theme]) => (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedTheme(key)}
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
                    </div>
                </div>

                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <button 
                        onClick={handleGenerateClick}
                        disabled={!isReadyToGenerate}
                        style={isReadyToGenerate ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                        className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                    >
                        {isGenerating ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}
                        {isGenerating ? 'Travelling Through Time...' : 'Start Journey'}
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
                                    disabled={isCreatingAlbum}
                                    className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                >
                                    {isCreatingAlbum ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <DownloadIcon className="w-4 h-4"/>}
                                    Download Album
                                </button>
                                <button 
                                    onClick={handleSaveAlbum}
                                    disabled={albumSaveStatus !== 'idle'}
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {DECADES.map(decade => {
                            const image = generatedImages[decade];
                            const status = image?.status || 'idle';
                            const savedStatus = saveStatuses[decade] || 'idle';

                            return (
                                <div key={decade} className="group relative aspect-[3/4] bg-bg-tertiary rounded-lg overflow-hidden shadow-md border border-border-primary/30">
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
                                            <span className="text-xs text-accent font-semibold animate-pulse">Generating {decade}...</span>
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
                                            <img src={image.url} alt={decade} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            
                                            {/* Label Badge */}
                                            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                                                {decade}
                                            </div>

                                            {/* Hover Actions */}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleDownloadIndividualImage(decade)}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Download"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleSaveIndividualImage(decade)}
                                                    disabled={savedStatus !== 'idle'}
                                                    className={`p-2 rounded-full transition-colors shadow-lg ${
                                                        savedStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text'
                                                    }`}
                                                    title="Save to Library"
                                                >
                                                    {savedStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : savedStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                                </button>
                                                <button
                                                    onClick={() => handleRegenerateDecade(decade)}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Regenerate"
                                                >
                                                    <RefreshIcon className="w-5 h-5" />
                                                </button>
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
    );
};

export default PastForwardPanel;
