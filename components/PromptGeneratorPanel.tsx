import React, { useState, useEffect } from 'react';
import { ImageUploader } from './ImageUploader';
import { generateComfyUIPromptFromSource, extractBackgroundPromptFromImage, extractSubjectPromptFromImage, generateMagicalPromptSoup } from '../services/comfyUIService';
import { saveToLibrary } from '../services/libraryService';
import type { LibraryItem } from '../types';
import { GenerateIcon, SpinnerIcon, CopyIcon, SendIcon, SaveIcon, CheckIcon, LibraryIcon } from './icons';

interface PromptGeneratorPanelProps {
    onUsePrompt: (prompt: string) => void;
    image: File | null;
    setImage: (file: File | null) => void;
    prompt: string;
    setPrompt: (prompt: string) => void;
    bgImage: File | null;
    setBgImage: (file: File | null) => void;
    bgPrompt: string;
    setBgPrompt: (prompt: string) => void;
    subjectImage: File | null;
    setSubjectImage: (file: File | null) => void;
    subjectPrompt: string;
    setSubjectPrompt: (prompt: string) => void;
    soupPrompt: string;
    setSoupPrompt: (prompt: string) => void;
    soupHistory: string[];
    onAddSoupToHistory: (soup: string) => void;
    onOpenLibraryForImage: () => void;
    onOpenLibraryForBg: () => void;
    onOpenLibraryForSubject: () => void;
}

interface PromptPart {
  text: string;
  source: number; // 0 for new, 1 for full, 2 for bg, 3 for subject
}

// Fix: Corrected the 'wan 2.2' type to 'wan2.2' to match the service layer function signatures and fix the type error.
type PromptModelType = 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2';
type PromptCategory = 'image' | 'background' | 'subject' | 'soup';

const createPromptThumbnail = (text: string, type: PromptCategory, modelType: PromptModelType): string => {
    const colors: Record<PromptCategory, string> = {
        image: '#06b6d4',
        background: '#4ade80',
        subject: '#facc15',
        soup: '#a78bfa'
    };
    const borderColor = colors[type] || '#374151';
    const bgColor = '#1f2937';
    const textColor = '#e5e7eb';
    const modelTypeColor = '#9ca3af';

    const cleanedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const lines = [];
    const charsPerLine = 35; 
    for(let i = 0; i < cleanedText.length; i += charsPerLine) {
        lines.push(cleanedText.substring(i, i + charsPerLine));
    }

    const tspan = lines.slice(0, 6).map((line, index) => `<tspan x="15" dy="${index === 0 ? 0 : '1.4em'}">${line}</tspan>`).join('');

    const finalSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="${bgColor}"/>
        <rect x="2" y="2" width="252" height="252" fill="none" stroke="${borderColor}" stroke-width="4" rx="8"/>
        
        <text x="15" y="40" font-family="Orbitron, monospace" font-size="16px" font-weight="bold" fill="${borderColor}">${modelType.toUpperCase()}</text>
        <text x="15" y="60" font-family="sans-serif" font-size="12px" fill="${modelTypeColor}" style="text-transform: uppercase; letter-spacing: 0.5px;">${type} Prompt</text>
        
        <text x="15" y="100" font-family="sans-serif" font-size="14px" fill="${textColor}">
            ${tspan}${lines.length > 6 ? '<tspan x="15" dy="1.4em">...</tspan>' : ''}
        </text>
    </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(finalSvg)}`;
};


export const PromptGeneratorPanel: React.FC<PromptGeneratorPanelProps> = ({
    onUsePrompt,
    image, setImage, prompt, setPrompt,
    bgImage, setBgImage, bgPrompt, setBgPrompt,
    subjectImage, setSubjectImage, subjectPrompt, setSubjectPrompt,
    soupPrompt, setSoupPrompt, soupHistory, onAddSoupToHistory,
    onOpenLibraryForImage,
    onOpenLibraryForBg,
    onOpenLibraryForSubject
}) => {
    // --- Ephemeral state (not persisted) ---
    const [modelType, setModelType] = useState<PromptModelType>('sdxl');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');
    const [savingState, setSavingState] = useState<'idle'|'saving'|'saved'>('idle');

    const [bgModelType, setBgModelType] = useState<PromptModelType>('sdxl');
    const [isBgLoading, setIsBgLoading] = useState<boolean>(false);
    const [bgError, setBgError] = useState<string | null>(null);
    const [bgCopyButtonText, setBgCopyButtonText] = useState('Copy Prompt');
    const [bgSavingState, setBgSavingState] = useState<'idle'|'saving'|'saved'>('idle');

    const [subjectModelType, setSubjectModelType] = useState<PromptModelType>('sdxl');
    const [isSubjectLoading, setIsSubjectLoading] = useState<boolean>(false);
    const [subjectError, setSubjectError] = useState<string | null>(null);
    const [subjectCopyButtonText, setSubjectCopyButtonText] = useState('Copy Prompt');
    const [subjectSavingState, setSubjectSavingState] = useState<'idle'|'saving'|'saved'>('idle');

    const [soupModelType, setSoupModelType] = useState<PromptModelType>('sdxl');
    const [soupCreativity, setSoupCreativity] = useState<number>(0.7);
    const [isSoupLoading, setIsSoupLoading] = useState<boolean>(false);
    const [soupError, setSoupError] = useState<string | null>(null);
    const [soupCopyButtonText, setSoupCopyButtonText] = useState('Copy Prompt');
    const [soupSavingState, setSoupSavingState] = useState<'idle'|'saving'|'saved'>('idle');
    
    const [historyCopyStates, setHistoryCopyStates] = useState<Record<number, string>>({});
    const [soupPromptParts, setSoupPromptParts] = useState<PromptPart[]>([]);

    useEffect(() => { setSavingState('idle'); }, [prompt]);
    useEffect(() => { setBgSavingState('idle'); }, [bgPrompt]);
    useEffect(() => { setSubjectSavingState('idle'); }, [subjectPrompt]);
    useEffect(() => { setSoupSavingState('idle'); }, [soupPrompt]);

    const handleSavePrompt = async (
        promptToSave: string, 
        type: PromptCategory,
        modelType: PromptModelType,
        setSaveState: React.Dispatch<React.SetStateAction<'idle'|'saving'|'saved'>>
    ) => {
        if (!promptToSave.trim()) return;
        setSaveState('saving');
        try {
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'prompt',
                promptType: type,
                promptModelType: modelType,
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} Prompt (${modelType.toUpperCase()})`,
                media: promptToSave,
                thumbnail: createPromptThumbnail(promptToSave, type, modelType),
            };
            await saveToLibrary(item);
            setSaveState('saved');
        } catch (err) {
            console.error("Failed to save prompt:", err);
            setSaveState('idle'); // Allow retry on error
        }
    };

    const handleGenerate = async () => {
        if (!image) {
            setError("Please upload an image first.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const generatedPrompt = await generateComfyUIPromptFromSource(image, modelType);
            setPrompt(generatedPrompt);
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCopy = () => {
        if (!prompt) return;
        navigator.clipboard.writeText(prompt)
            .then(() => {
                setCopyButtonText('Copied!');
                setTimeout(() => setCopyButtonText('Copy Prompt'), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy prompt to clipboard.');
            });
    };

    const handleUsePrompt = () => {
        if (prompt) {
            onUsePrompt(prompt);
        }
    };

    const handleBgGenerate = async () => {
        if (!bgImage) {
            setBgError("Please upload an image first.");
            return;
        }
        setIsBgLoading(true);
        setBgError(null);
        try {
            const generatedPrompt = await extractBackgroundPromptFromImage(bgImage, bgModelType);
            setBgPrompt(generatedPrompt);
        } catch (err: any) {
            setBgError(err.message || 'An unknown error occurred.');
        } finally {
            setIsBgLoading(false);
        }
    };
    
    const handleBgCopy = () => {
        if (!bgPrompt) return;
        navigator.clipboard.writeText(bgPrompt)
            .then(() => {
                setBgCopyButtonText('Copied!');
                setTimeout(() => setBgCopyButtonText('Copy Prompt'), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy prompt to clipboard.');
            });
    };

    const handleUseBgPrompt = () => {
        if (bgPrompt) {
            onUsePrompt(bgPrompt);
        }
    };

    const handleSubjectGenerate = async () => {
        if (!subjectImage) {
            setSubjectError("Please upload an image first.");
            return;
        }
        setIsSubjectLoading(true);
        setSubjectError(null);
        try {
            const generatedPrompt = await extractSubjectPromptFromImage(subjectImage, subjectModelType);
            setSubjectPrompt(generatedPrompt);
        } catch (err: any) {
            setSubjectError(err.message || 'An unknown error occurred.');
        } finally {
            setIsSubjectLoading(false);
        }
    };
    
    const handleSubjectCopy = () => {
        if (!subjectPrompt) return;
        navigator.clipboard.writeText(subjectPrompt)
            .then(() => {
                setSubjectCopyButtonText('Copied!');
                setTimeout(() => setSubjectCopyButtonText('Copy Prompt'), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy prompt to clipboard.');
            });
    };

    const handleUseSubjectPrompt = () => {
        if (subjectPrompt) {
            onUsePrompt(subjectPrompt);
        }
    };
    
    const handleGenerateSoup = async () => {
        if (!prompt && !bgPrompt && !subjectPrompt) {
            setSoupError("Generate at least one prompt above to create a soup!");
            return;
        }
        setIsSoupLoading(true);
        setSoupError(null);
        try {
            const generatedParts = await generateMagicalPromptSoup(
                prompt,
                bgPrompt,
                subjectPrompt,
                soupModelType,
                soupCreativity
            );
            const fullPromptString = generatedParts.map(p => p.text).join(' ');
            setSoupPromptParts(generatedParts);
            onAddSoupToHistory(fullPromptString);

        } catch (err: any) {
            setSoupError(err.message || 'An unknown error occurred.');
        } finally {
            setIsSoupLoading(false);
        }
    };

    const handleSoupCopy = () => {
        if (!soupPrompt) return;
        navigator.clipboard.writeText(soupPrompt)
            .then(() => {
                setSoupCopyButtonText('Copied!');
                setTimeout(() => setSoupCopyButtonText('Copy Prompt'), 2000);
            });
    };

    const handleUseSoupPrompt = () => {
        if (soupPrompt) {
            onUsePrompt(soupPrompt);
        }
    };

    const handleHistoryItemCopy = (soup: string, index: number) => {
        navigator.clipboard.writeText(soup).then(() => {
            setHistoryCopyStates(prev => ({...prev, [index]: 'Copied!'}));
            setTimeout(() => {
                setHistoryCopyStates(prev => {
                    const newStates = {...prev};
                    delete newStates[index];
                    return newStates;
                });
            }, 2000);
        });
    };
    
    const getSourceColor = (source: number): string => {
        switch (source) {
            case 1: return 'text-accent';
            case 2: return 'text-highlight-green';
            case 3: return 'text-highlight-yellow';
            default: return 'text-text-primary'; // Source 0 or unknown
        }
    };

    const renderPromptTypeButtons = (currentType: PromptModelType, setType: (type: PromptModelType) => void) => {
        const types: { id: PromptModelType; label: string }[] = [
            { id: 'gemini', label: 'Narrative (Gemini)' },
            { id: 'wan2.2', label: 'Photographic (WAN 2.2)' },
            { id: 'flux', label: 'Descriptive (FLUX)' },
            { id: 'sdxl', label: 'Sentence (SDXL)' },
            { id: 'sd1.5', label: 'Keywords (SD1.5)' },
        ];
        return (
            <div className="flex flex-wrap gap-2">
                {types.map(type => (
                    <button
                        key={type.id}
                        onClick={() => setType(type.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${currentType === type.id ? 'bg-accent text-accent-text' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}
                    >
                        {type.label}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-4xl mx-auto space-y-8">
            {/* --- Generate Prompt from Image Section --- */}
            <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
                <h2 className="text-xl font-bold text-accent mb-4">Generate Prompt from Image</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a photo to generate a descriptive prompt using AI. Choose a prompt type optimized for your target model.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column: Uploader & Generate Button */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-grow">
                                <ImageUploader 
                                    label="Upload Photo"
                                    id="prompt-gen-image"
                                    onImageUpload={setImage}
                                    sourceFile={image}
                                />
                            </div>
                            <button
                                onClick={onOpenLibraryForImage}
                                className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                title="Select from Library"
                            >
                                <LibraryIcon className="w-6 h-6"/>
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Prompt Type</label>
                            {renderPromptTypeButtons(modelType, setModelType)}
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={!image || isLoading}
                            style={image && !isLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary"
                        >
                            {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isLoading ? 'Generating...' : 'Generate Prompt'}
                        </button>
                    </div>
                    {/* Right Column: Results & Actions */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Prompt
                            </label>
                            <textarea
                                id="generated-prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                readOnly={isLoading}
                                placeholder="Your generated prompt will appear here..."
                                className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-accent font-medium"
                                rows={10}
                            />
                        </div>
                        {error && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{error}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button 
                                onClick={() => handleSavePrompt(prompt, 'image', modelType, setSavingState)}
                                disabled={!prompt || isLoading || savingState !== 'idle'}
                                className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${
                                    savingState === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'
                                }`}
                            >
                                {savingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : savingState === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                {savingState === 'saved' ? 'Saved!' : 'Save'}
                            </button>
                            <button 
                                onClick={handleCopy}
                                disabled={!prompt || isLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {copyButtonText}
                            </button>
                            <button 
                                onClick={handleUsePrompt}
                                disabled={!prompt || isLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Extract Background from Image Section --- */}
            <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-green">
                <h2 className="text-xl font-bold text-highlight-green mb-4">Extract Background from Image</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a photo to generate a prompt describing only the background. This is useful for creating consistent environments.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-grow">
                                <ImageUploader 
                                    label="Upload Photo"
                                    id="bg-extract-image"
                                    onImageUpload={setBgImage}
                                    sourceFile={bgImage}
                                />
                            </div>
                            <button
                                onClick={onOpenLibraryForBg}
                                className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                title="Select from Library"
                            >
                                <LibraryIcon className="w-6 h-6"/>
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Prompt Type</label>
                            {renderPromptTypeButtons(bgModelType, setBgModelType)}
                        </div>
                         <button
                            onClick={handleBgGenerate}
                            disabled={!bgImage || isBgLoading}
                            style={bgImage && !isBgLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary"
                        >
                            {isBgLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isBgLoading ? 'Generating...' : 'Generate Background Prompt'}
                        </button>
                    </div>
                    {/* Right Column */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-bg-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Background Prompt
                            </label>
                            <textarea
                                id="generated-bg-prompt"
                                value={bgPrompt}
                                onChange={(e) => setBgPrompt(e.target.value)}
                                readOnly={isBgLoading}
                                placeholder="Your generated background prompt will appear here..."
                                className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-highlight-green font-medium"
                                rows={10}
                            />
                        </div>
                         {bgError && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{bgError}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button 
                                onClick={() => handleSavePrompt(bgPrompt, 'background', bgModelType, setBgSavingState)}
                                disabled={!bgPrompt || isBgLoading || bgSavingState !== 'idle'}
                                className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${
                                    bgSavingState === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'
                                }`}
                            >
                                {bgSavingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : bgSavingState === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                {bgSavingState === 'saved' ? 'Saved!' : 'Save'}
                            </button>
                            <button 
                                onClick={handleBgCopy}
                                disabled={!bgPrompt || isBgLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {bgCopyButtonText}
                            </button>
                             <button 
                                onClick={handleUseBgPrompt}
                                disabled={!bgPrompt || isBgLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Extract Subject from Image Section --- */}
            <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-yellow">
                <h2 className="text-xl font-bold text-highlight-yellow mb-4">Extract Subject from Image</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a photo to generate a prompt describing only the main subject(s). This is useful for isolating characters or objects from their environment.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-grow">
                                <ImageUploader 
                                    label="Upload Photo"
                                    id="subject-extract-image"
                                    onImageUpload={setSubjectImage}
                                    sourceFile={subjectImage}
                                />
                            </div>
                            <button
                                onClick={onOpenLibraryForSubject}
                                className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                title="Select from Library"
                            >
                                <LibraryIcon className="w-6 h-6"/>
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Prompt Type</label>
                            {renderPromptTypeButtons(subjectModelType, setSubjectModelType)}
                        </div>
                         <button
                            onClick={handleSubjectGenerate}
                            disabled={!subjectImage || isSubjectLoading}
                            style={subjectImage && !isSubjectLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary"
                        >
                            {isSubjectLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isSubjectLoading ? 'Generating...' : 'Generate Subject Prompt'}
                        </button>
                    </div>
                    {/* Right Column */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-subject-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Subject Prompt
                            </label>
                            <textarea
                                id="generated-subject-prompt"
                                value={subjectPrompt}
                                onChange={(e) => setSubjectPrompt(e.target.value)}
                                readOnly={isSubjectLoading}
                                placeholder="Your generated subject prompt will appear here..."
                                className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-highlight-yellow font-medium"
                                rows={10}
                            />
                        </div>
                         {subjectError && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{subjectError}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button 
                                onClick={() => handleSavePrompt(subjectPrompt, 'subject', subjectModelType, setSubjectSavingState)}
                                disabled={!subjectPrompt || isSubjectLoading || subjectSavingState !== 'idle'}
                                className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${
                                    subjectSavingState === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'
                                }`}
                            >
                                {subjectSavingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : subjectSavingState === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                {subjectSavingState === 'saved' ? 'Saved!' : 'Save'}
                            </button>
                            <button 
                                onClick={handleSubjectCopy}
                                disabled={!subjectPrompt || isSubjectLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {subjectCopyButtonText}
                            </button>
                             <button 
                                onClick={handleUseSubjectPrompt}
                                disabled={!subjectPrompt || isSubjectLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* --- Magical Prompt Soup Section --- */}
            <div>
                <hr className="border-t-2 border-border-primary/50 mb-8" />
                <h2 className="text-xl font-bold text-accent mb-4">Magical Prompt Soup</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Mash up the prompts generated above into a new, unique, and often surprising creation. Adjust the creativity to control how wild the result is!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column: Controls */}
                    <div className="space-y-6 bg-bg-tertiary p-6 rounded-lg border border-border-primary/50">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-2">Output Prompt Type</label>
                            {renderPromptTypeButtons(soupModelType, setSoupModelType)}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-text-secondary">Creativity: {soupCreativity}</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={soupCreativity}
                                onChange={(e) => setSoupCreativity(parseFloat(e.target.value))}
                                disabled={isSoupLoading}
                                className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer"
                            />
                             <p className="text-xs text-text-muted mt-1">Higher values lead to more unexpected combinations.</p>
                        </div>
                        
                        <button
                            onClick={handleGenerateSoup}
                            disabled={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading}
                            style={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading ? {} : { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                        >
                            {isSoupLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isSoupLoading ? 'Stirring...' : 'Create Soup'}
                        </button>
                    </div>

                    {/* Right Column: Results & Actions */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-soup-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Soup Prompt
                            </label>
                            <div
                                id="generated-soup-prompt"
                                className="w-full bg-bg-primary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent min-h-[184px] whitespace-pre-wrap"
                            >
                                {soupPromptParts.length > 0 ? (
                                    soupPromptParts.map((part, index) => (
                                        <span key={index} className={getSourceColor(part.source)}>
                                            {part.text + ' '}
                                        </span>
                                    ))
                                ) : soupPrompt ? (
                                    <span className="text-text-primary">{soupPrompt}</span>
                                ) : (
                                    <span className="text-text-muted">Your magical prompt soup will appear here...</span>
                                )}
                            </div>
                        </div>
                        {soupError && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{soupError}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                             <button 
                                onClick={() => handleSavePrompt(soupPrompt, 'soup', soupModelType, setSoupSavingState)}
                                disabled={!soupPrompt || isSoupLoading || soupSavingState !== 'idle'}
                                className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${
                                    soupSavingState === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'
                                }`}
                            >
                                {soupSavingState === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : soupSavingState === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                {soupSavingState === 'saved' ? 'Saved!' : 'Save'}
                            </button>
                            <button 
                                onClick={handleSoupCopy}
                                disabled={!soupPrompt || isSoupLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {soupCopyButtonText}
                            </button>
                             <button 
                                onClick={handleUseSoupPrompt}
                                disabled={!soupPrompt || isSoupLoading}
                                className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use
                            </button>
                        </div>
                        {soupHistory.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-md font-semibold text-text-secondary mb-2">Recent Soups</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md border border-border-primary/50">
                                    {soupHistory.map((soup, index) => (
                                        <div key={index} className="group bg-bg-tertiary p-2 rounded-md flex items-center justify-between gap-2">
                                            <p 
                                                className="text-xs text-text-secondary truncate cursor-pointer hover:text-text-primary transition-colors" 
                                                title={soup} 
                                                onClick={() => { setSoupPrompt(soup); setSoupPromptParts([]); }}
                                            >
                                                {soup}
                                            </p>
                                            <button 
                                                onClick={() => handleHistoryItemCopy(soup, index)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-bg-secondary text-text-secondary hover:bg-accent hover:text-accent-text"
                                                title={historyCopyStates[index] || "Copy"}
                                            >
                                                <CopyIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};