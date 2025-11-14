/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, ChangeEvent, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { motion } from 'framer-motion';
import { AppDispatch } from '../../store/store';
import { addToLibrary } from '../../store/librarySlice';
import { generateDecadeImage } from '../../services/geminiService';
import PolaroidCard from './PolaroidCard';
import { createAlbumPage } from '../../utils/pastForwardAlbumUtils';
import Footer from './Footer';
import { cn } from '../../utils/cn';
import { dataUrlToThumbnail } from '../../utils/imageUtils';
import { SaveIcon, SpinnerIcon, CheckIcon } from '../icons';

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];

// Pre-defined themes and their corresponding prompts
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
        description: 'Turn your pet into a cartoon character from different eras. (Best with photos of pets!)',
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

const GHOST_POLAROIDS_CONFIG = [
  { initial: { x: "-150%", y: "-100%", rotate: -30 }, transition: { delay: 0.2 } },
  { initial: { x: "150%", y: "-80%", rotate: 25 }, transition: { delay: 0.4 } },
  { initial: { x: "-120%", y: "120%", rotate: 45 }, transition: { delay: 0.6 } },
  { initial: { x: "180%", y: "90%", rotate: -20 }, transition: { delay: 0.8 } },
  { initial: { x: "0%", y: "-200%", rotate: 0 }, transition: { delay: 0.5 } },
  { initial: { x: "100%", y: "150%", rotate: 10 }, transition: { delay: 0.3 } },
];


type ImageStatus = 'pending' | 'done' | 'error';
interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

const primaryButtonClasses = "font-permanent-marker text-xl text-center text-black bg-yellow-400 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:-rotate-2 hover:bg-yellow-300 shadow-[2px_2px_0px_2px_rgba(0,0,0,0.2)]";
const secondaryButtonClasses = "font-permanent-marker text-xl text-center text-white bg-white/10 backdrop-blur-sm border-2 border-white/80 py-3 px-8 rounded-sm transform transition-transform duration-200 hover:scale-105 hover:rotate-2 hover:bg-white hover:text-black";

function PastForwardPanel() {
    const dispatch: AppDispatch = useDispatch();
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDownloading, setIsDownloading] = useState<boolean>(false);
    const [appState, setAppState] = useState<'idle' | 'image-uploaded' | 'generating' | 'results-shown'>('idle');
    const [selectedTheme, setSelectedTheme] = useState<string>('decades');
    const [saveStatuses, setSaveStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [albumSaveStatus, setAlbumSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');


    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setUploadedImage(reader.result as string);
                setAppState('image-uploaded');
                setGeneratedImages({}); // Clear previous results
                setSaveStatuses({});
                setAlbumSaveStatus('idle');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateClick = async () => {
        if (!uploadedImage) return;

        setIsLoading(true);
        setAppState('generating');
        
        const initialImages: Record<string, GeneratedImage> = {};
        DECADES.forEach(decade => {
            initialImages[decade] = { status: 'pending' };
        });
        setGeneratedImages(initialImages);

        const concurrencyLimit = 2; // Process two decades at a time
        const decadesQueue = [...DECADES];

        const processDecade = async (decade: string) => {
            try {
                const prompt = THEMES[selectedTheme].prompt(decade);
                const resultUrl = await generateDecadeImage(uploadedImage, prompt);
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
                console.error(`Failed to generate image for ${decade}:`, err);
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

        setIsLoading(false);
        setAppState('results-shown');
    };

    const handleRegenerateDecade = async (decade: string) => {
        if (!uploadedImage) return;

        // Prevent re-triggering if a generation is already in progress
        if (generatedImages[decade]?.status === 'pending') {
            return;
        }
        
        setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        console.log(`Regenerating image for ${decade}...`);

        // Set the specific decade to 'pending' to show the loading spinner
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));

        // Call the generation service for the specific decade
        try {
            const prompt = THEMES[selectedTheme].prompt(decade);
            const resultUrl = await generateDecadeImage(uploadedImage, prompt);
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
            console.error(`Failed to regenerate image for ${decade}:`, err);
        }
    };
    
    const handleReset = () => {
        setUploadedImage(null);
        setGeneratedImages({});
        setSelectedTheme('decades');
        setAppState('idle');
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
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

    const handleSaveIndividualImage = async (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status !== 'done' || !image.url || !uploadedImage) return;

        setSaveStatuses(prev => ({ ...prev, [decade]: 'saving' }));
        try {
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward - ${decade} (${THEMES[selectedTheme].title})`,
                media: image.url,
                thumbnail: await dataUrlToThumbnail(image.url, 256),
                sourceImage: uploadedImage
            };
            await dispatch(addToLibrary(item)).unwrap();
            setSaveStatuses(prev => ({ ...prev, [decade]: 'saved' }));
        } catch (err) {
            console.error("Failed to save image to library:", err);
            alert("Failed to save image to library. See console for details.");
            setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        }
    };

    const handleDownloadAlbum = async () => {
        setIsDownloading(true);
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => (image as GeneratedImage).status === 'done' && (image as GeneratedImage).url)
                .reduce((acc, [decade, image]) => {
                    acc[decade] = (image as GeneratedImage).url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < DECADES.length) {
                alert("Please wait for all images to finish generating before downloading the album.");
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);

            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'past-forward-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to create or download album:", error);
            alert("Sorry, there was an error creating your album. Please try again.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSaveAlbum = async () => {
        setAlbumSaveStatus('saving');
        try {
            const imageData = Object.entries(generatedImages)
                .filter(([, image]) => (image as GeneratedImage).status === 'done' && (image as GeneratedImage).url)
                .reduce((acc, [decade, image]) => {
                    acc[decade] = (image as GeneratedImage).url!;
                    return acc;
                }, {} as Record<string, string>);

            if (Object.keys(imageData).length < DECADES.length) {
                alert("Please wait for all images to finish generating before saving the album.");
                setAlbumSaveStatus('idle');
                return;
            }

            const albumDataUrl = await createAlbumPage(imageData);
            
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward Album (${THEMES[selectedTheme].title})`,
                media: albumDataUrl,
                thumbnail: await dataUrlToThumbnail(albumDataUrl, 256),
                sourceImage: uploadedImage!
            };
            await dispatch(addToLibrary(item)).unwrap();
            setAlbumSaveStatus('saved');
        } catch (error) {
            console.error("Failed to create or save album:", error);
            alert("Sorry, there was an error saving your album. Please try again.");
            setAlbumSaveStatus('idle');
        }
    };

    return (
        <main className="bg-black text-neutral-200 w-full flex flex-col items-center justify-center p-4 pb-24 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05]"></div>
            
            <div className="z-10 flex flex-col items-center justify-center w-full h-full flex-1 min-h-0">
                <div className="text-center mb-10">
                    <h1 className="text-6xl md:text-8xl font-caveat font-bold text-neutral-100">Past Forward</h1>
                    <p className="font-permanent-marker text-neutral-300 mt-2 text-xl tracking-wide">Generate yourself through the decades.</p>
                </div>

                {appState === 'idle' && (
                     <div className="relative flex flex-col items-center justify-center w-full">
                        {/* Ghost polaroids for intro animation */}
                        {GHOST_POLAROIDS_CONFIG.map((config, index) => (
                             <motion.div
                                key={index}
                                className="absolute w-80 h-[26rem] rounded-md p-4 bg-neutral-100/10 blur-sm"
                                initial={config.initial}
                                animate={{
                                    x: "0%", y: "0%", rotate: (Math.random() - 0.5) * 20,
                                    scale: 0,
                                    opacity: 0,
                                }}
                                transition={{
                                    ...config.transition,
                                    ease: "circOut",
                                    duration: 2,
                                }}
                            />
                        ))}
                        <motion.div
                             initial={{ opacity: 0, scale: 0.8 }}
                             animate={{ opacity: 1, scale: 1 }}
                             transition={{ delay: 2, duration: 0.8, type: 'spring' }}
                             className="flex flex-col items-center"
                        >
                            <label htmlFor="file-upload" className="cursor-pointer group transform hover:scale-105 transition-transform duration-300">
                                 <PolaroidCard 
                                     caption="Click to begin"
                                     status="done"
                                 />
                            </label>
                            <input id="file-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleImageUpload} />
                            <p className="mt-8 font-permanent-marker text-neutral-500 text-center max-w-xs text-lg">
                                Click the polaroid to upload your photo and start your journey through time.
                            </p>
                        </motion.div>
                    </div>
                )}

                {appState === 'image-uploaded' && uploadedImage && (
                    <motion.div 
                        className="flex flex-col items-center gap-8 w-full max-w-5xl px-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="w-full flex justify-center">
                            <PolaroidCard 
                                imageUrl={uploadedImage} 
                                caption="Your Photo" 
                                status="done"
                            />
                        </div>

                        <h2 className="font-permanent-marker text-3xl text-center text-yellow-400 mt-4">Choose Your Journey</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                            {Object.entries(THEMES).map(([key, theme]) => (
                                <button 
                                    key={key} 
                                    onClick={() => setSelectedTheme(key)}
                                    className={cn(
                                        "p-4 rounded-lg border-2 text-left transition-all duration-200 transform hover:scale-105",
                                        selectedTheme === key 
                                            ? 'border-yellow-400 bg-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.5)]' 
                                            : 'border-neutral-700 bg-neutral-900/50 hover:border-neutral-500 hover:bg-neutral-800/50'
                                    )}
                                >
                                    <h3 className="font-permanent-marker text-xl text-neutral-100">{theme.title}</h3>
                                    <p className="text-neutral-400 text-sm mt-1">{theme.description}</p>
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-center gap-4 mt-6">
                            <button onClick={handleReset} className={secondaryButtonClasses}>
                                Different Photo
                            </button>
                            <button onClick={handleGenerateClick} className={primaryButtonClasses}>
                                Generate: {THEMES[selectedTheme].title}
                            </button>
                        </div>
                    </motion.div>
                )}


                {(appState === 'generating' || appState === 'results-shown') && (
                     <>
                        <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 mt-8">
                             {DECADES.map((decade, index) => (
                                 <motion.div
                                     key={decade}
                                     initial={{ opacity: 0, scale: 0.8, y: 50 }}
                                     animate={{ opacity: 1, scale: 1, y: 0 }}
                                     transition={{ type: 'spring', stiffness: 100, damping: 20, delay: index * 0.1 }}
                                     className="flex justify-center"
                                 >
                                     <PolaroidCard
                                         caption={decade}
                                         status={generatedImages[decade]?.status || 'pending'}
                                         imageUrl={generatedImages[decade]?.url}
                                         error={generatedImages[decade]?.error}
                                         onRegenerate={handleRegenerateDecade}
                                         onDownload={handleDownloadIndividualImage}
                                         onSave={handleSaveIndividualImage}
                                         saveStatus={saveStatuses[decade] || 'idle'}
                                     />
                                 </motion.div>
                             ))}
                         </div>
                         <div className="h-20 mt-8 flex items-center justify-center">
                            {appState === 'results-shown' && (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button 
                                        onClick={handleDownloadAlbum} 
                                        disabled={isDownloading} 
                                        className={`${primaryButtonClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isDownloading ? 'Creating Album...' : 'Download Album'}
                                    </button>
                                    <button
                                        onClick={handleSaveAlbum}
                                        disabled={albumSaveStatus !== 'idle'}
                                        className={cn(
                                            primaryButtonClasses,
                                            "flex items-center gap-2",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            albumSaveStatus === 'saved' && "!bg-green-500 !text-white"
                                        )}
                                    >
                                        {albumSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : albumSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                        {albumSaveStatus === 'saving' ? 'Saving...' : albumSaveStatus === 'saved' ? 'Saved!' : 'Save Album'}
                                    </button>
                                    <button onClick={handleReset} className={secondaryButtonClasses}>
                                        Start Over
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            <Footer />
        </main>
    );
}

export default PastForwardPanel;