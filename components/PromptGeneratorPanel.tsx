import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { setPromptSaveStatus, updatePromptGenState } from '../store/promptGenSlice';
import { ImageUploader } from './ImageUploader';
import { generateComfyUIPromptFromSource, extractBackgroundPromptFromImage, extractSubjectPromptFromImage, generateMagicalPromptSoup, generateWanVideoPromptFromImage } from '../services/comfyUIService';
import type { LibraryItem, PromptGenState } from '../types';
import { GenerateIcon, SpinnerIcon, CopyIcon, SendIcon, SaveIcon, CheckIcon, LibraryIcon, ResetIcon, CodeBracketIcon } from './icons';
import { fileToResizedDataUrl, dataUrlToThumbnail } from '../utils/imageUtils';
import { WAN_VIDEO_PROMPT_BLOCKS, CAMERA_MOVES } from '../constants';

interface PromptGeneratorPanelProps {
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
    onUsePrompt: (prompt: string) => void;
    onOpenLibraryForImage: () => void;
    onOpenLibraryForBg: () => void;
    onOpenLibraryForSubject: () => void;
    onOpenLibraryForWanVideoImage: () => void;
    onReset: () => void;
}

interface PromptPart {
  text: string;
  source: number; // 0 for new, 1 for full, 2 for bg, 3 for subject
}

type PromptModelType = 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea';
type PromptCategory = 'image' | 'background' | 'subject' | 'soup' | 'wan-video' | 'qwen-image';

const createPromptThumbnail = (text: string, type: PromptCategory, modelType: PromptModelType | 'wan2.2' | 'qwen-image'): string => {
    const colors: Record<PromptCategory, string> = {
        image: '#06b6d4',
        background: '#4ade80',
        subject: '#facc15',
        soup: '#a78bfa',
        'wan-video': '#ec4899',
        'qwen-image': '#3b82f6',
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
        <text x="15" y="60" font-family="sans-serif" font-size="12px" fill="${modelTypeColor}" style="text-transform: uppercase; letter-spacing: 0.5px;">${type.replace('-', ' ')} Prompt</text>
        
        <text x="15" y="100" font-family="sans-serif" font-size="14px" fill="${textColor}">
            ${tspan}${lines.length > 6 ? '<tspan x="15" dy="1.4em">...</tspan>' : ''}
        </text>
    </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(finalSvg)}`;
};


interface SubTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
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
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors duration-200 border-b-2 ${
                    activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
            >
                {tab.icon}
                {tab.label}
            </button>
        ))}
    </div>
);


export const PromptGeneratorPanel: React.FC<PromptGeneratorPanelProps> = ({
    activeSubTab,
    setActiveSubTab,
    onUsePrompt,
    onOpenLibraryForImage,
    onOpenLibraryForBg,
    onOpenLibraryForSubject,
    onOpenLibraryForWanVideoImage,
    onReset
}) => {
    const dispatch: AppDispatch = useDispatch();
    const state = useSelector((state: RootState) => state.promptGen.promptGenState);
    const { 
        image, prompt, bgImage, bgPrompt, subjectImage, subjectPrompt, soupPrompt, soupHistory,
        promptSaveStatus, bgPromptSaveStatus, subjectPromptSaveStatus, soupPromptSaveStatus,
        wanVideoImage, wanVideoBasePrompt, wanVideoCategory, wanVideoSubject, wanVideoAction,
        wanVideoEnvironment, wanVideoCameraMove, wanVideoStyle, wanVideoFinalPrompt, wanVideoPromptSaveStatus,
        qwenTitle, qwenUseTextInImage, qwenTextPosition, qwenTextContent, qwenTextStyle, qwenStyleModifiers,
        qwenFinalPrompt, qwenPromptSaveStatus
    } = state;

    // --- Ephemeral state (not persisted) ---
    const [modelType, setModelType] = useState<PromptModelType>('sdxl');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');

    const [bgModelType, setBgModelType] = useState<PromptModelType>('sdxl');
    const [isBgLoading, setIsBgLoading] = useState<boolean>(false);
    const [bgError, setBgError] = useState<string | null>(null);
    const [bgCopyButtonText, setBgCopyButtonText] = useState('Copy Prompt');

    const [subjectModelType, setSubjectModelType] = useState<PromptModelType>('sdxl');
    const [isSubjectLoading, setIsSubjectLoading] = useState<boolean>(false);
    const [subjectError, setSubjectError] = useState<string | null>(null);
    const [subjectCopyButtonText, setSubjectCopyButtonText] = useState('Copy Prompt');

    const [soupModelType, setSoupModelType] = useState<PromptModelType>('sdxl');
    const [soupCreativity, setSoupCreativity] = useState<number>(0.7);
    const [isSoupLoading, setIsSoupLoading] = useState<boolean>(false);
    const [soupError, setSoupError] = useState<string | null>(null);
    const [soupCopyButtonText, setSoupCopyButtonText] = useState('Copy Prompt');
    
    const [historyCopyStates, setHistoryCopyStates] = useState<Record<number, string>>({});
    const [soupPromptParts, setSoupPromptParts] = useState<PromptPart[]>([]);

    const [wanVideoMode, setWanVideoMode] = useState<'scratch' | 'image'>('scratch');
    const [isWanVideoLoading, setIsWanVideoLoading] = useState(false);
    const [wanVideoError, setWanVideoError] = useState<string | null>(null);
    const [wanVideoCopyButtonText, setWanVideoCopyButtonText] = useState('Copy Prompt');
    
    const [qwenCopyButtonText, setQwenCopyButtonText] = useState('Copy Prompt');

    const allWanEnvironments = useMemo(() => {
        return [...new Set(Object.values(WAN_VIDEO_PROMPT_BLOCKS).flatMap(category => category.environments))];
    }, []);

    const allWanStyles = useMemo(() => {
        return [...new Set(Object.values(WAN_VIDEO_PROMPT_BLOCKS).flatMap(category => category.styles))];
    }, []);

    useEffect(() => {
        let finalPrompt = `${qwenTitle.trim()}\n`;

        if (qwenUseTextInImage && qwenTextContent.trim()) {
            finalPrompt += `[text-in-image]\n`;
            finalPrompt += `position: ${qwenTextPosition}\n`;
            finalPrompt += `content: ${qwenTextContent.trim()}\n`;
            if (qwenTextStyle.trim()) {
                finalPrompt += `style: ${qwenTextStyle.trim()}\n`;
            }
        }

        if (qwenStyleModifiers.trim()) {
            finalPrompt += `[style]\n`;
            finalPrompt += `${qwenStyleModifiers.trim()}\n`;
        }

        dispatch(updatePromptGenState({ qwenFinalPrompt: finalPrompt.trim() }));
    }, [qwenTitle, qwenUseTextInImage, qwenTextPosition, qwenTextContent, qwenTextStyle, qwenStyleModifiers, dispatch]);

    const handleSavePrompt = async (
        promptToSave: string, 
        type: PromptCategory,
        modelTypeToSave: PromptModelType | 'wan2.2' | 'qwen-image',
        sourceFile: File | null
    ) => {
        if (!promptToSave.trim()) return;
        dispatch(setPromptSaveStatus({ type, status: 'saving' }));
        try {
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'prompt',
                promptType: type,
                promptModelType: modelTypeToSave === 'qwen-image' ? 'sdxl' : modelTypeToSave, // Save as sdxl for now
                name: `${type.charAt(0).toUpperCase() + type.slice(1)} Prompt (${modelTypeToSave.toUpperCase()})`,
                media: promptToSave,
                thumbnail: createPromptThumbnail(promptToSave, type, modelTypeToSave),
                sourceImage: sourceFile
                    ? await fileToResizedDataUrl(sourceFile, 512)
                    : undefined,
            };
            await dispatch(addToLibrary(item)).unwrap();
            dispatch(setPromptSaveStatus({ type, status: 'saved' }));
        } catch (err) {
            console.error("Failed to save prompt:", err);
            dispatch(setPromptSaveStatus({ type, status: 'idle' }));
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
            dispatch(updatePromptGenState({ prompt: generatedPrompt }));
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

    const handleUsePrompt = (p: string) => {
        if (p) {
            onUsePrompt(p);
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
            dispatch(updatePromptGenState({ bgPrompt: generatedPrompt }));
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

    const handleSubjectGenerate = async () => {
        if (!subjectImage) {
            setSubjectError("Please upload an image first.");
            return;
        }
        setIsSubjectLoading(true);
        setSubjectError(null);
        try {
            const generatedPrompt = await extractSubjectPromptFromImage(subjectImage, subjectModelType);
            dispatch(updatePromptGenState({ subjectPrompt: generatedPrompt }));
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
            dispatch(updatePromptGenState({ 
                soupPrompt: fullPromptString,
                soupHistory: [fullPromptString, ...soupHistory].slice(0, 5)
            }));

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

    // --- WAN 2.2 Video Prompt Builder Logic ---
    useEffect(() => {
        const parts = [
            wanVideoMode === 'image' ? wanVideoBasePrompt : wanVideoSubject,
            wanVideoAction,
            wanVideoEnvironment,
            wanVideoCameraMove,
            wanVideoStyle,
        ].filter(Boolean).join(', ');
        dispatch(updatePromptGenState({ wanVideoFinalPrompt: parts }));
    }, [wanVideoSubject, wanVideoAction, wanVideoEnvironment, wanVideoCameraMove, wanVideoStyle, wanVideoBasePrompt, wanVideoMode, dispatch]);

    const handleWanVideoGenerateFromImage = async () => {
        if (!wanVideoImage) {
            setWanVideoError("Please upload an image first.");
            return;
        }
        setIsWanVideoLoading(true);
        setWanVideoError(null);
        try {
            const base = await generateWanVideoPromptFromImage(wanVideoImage);
            dispatch(updatePromptGenState({ wanVideoBasePrompt: base }));
        } catch (err: any) {
            setWanVideoError(err.message || 'Failed to generate prompt from image.');
        } finally {
            setIsWanVideoLoading(false);
        }
    };

    const handleWanVideoCopy = () => {
        if (!wanVideoFinalPrompt) return;
        navigator.clipboard.writeText(wanVideoFinalPrompt).then(() => {
            setWanVideoCopyButtonText('Copied!');
            setTimeout(() => setWanVideoCopyButtonText('Copy Prompt'), 2000);
        });
    };
    
    const handleQwenCopy = () => {
        if (!qwenFinalPrompt) return;
        navigator.clipboard.writeText(qwenFinalPrompt).then(() => {
            setQwenCopyButtonText('Copied!');
            setTimeout(() => setQwenCopyButtonText('Copy Prompt'), 2000);
        });
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

    const subTabs = [
        { id: 'from-image', label: 'Prompt from Image' },
        { id: 'extract-background', label: 'Extract Background' },
        { id: 'extract-subject', label: 'Extract Subject' },
        { id: 'prompt-soup', label: 'Magical Prompt Soup' },
        { id: 'wan-video', label: 'WAN 2.2 Video' },
        { id: 'qwen-image', label: 'Qwen Prompt Tool', icon: <CodeBracketIcon className="w-5 h-5"/>},
    ];

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

            {activeSubTab === 'from-image' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent space-y-8">
                    <h2 className="text-xl font-bold text-accent">Generate Prompt from Image</h2>
                    <p className="text-sm text-text-secondary -mt-6">
                        Upload a photo to generate a descriptive prompt using AI. Choose a prompt type optimized for your target model.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader 
                                        label="Upload Photo"
                                        id="prompt-gen-image"
                                        onImageUpload={file => dispatch(updatePromptGenState({ image: file, prompt: '' }))}
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
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Prompt</label>
                                <textarea
                                    id="generated-prompt"
                                    value={prompt}
                                    onChange={(e) => dispatch(updatePromptGenState({ prompt: e.target.value }))}
                                    readOnly={isLoading}
                                    placeholder="Your generated prompt will appear here..."
                                    className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-accent font-medium"
                                    rows={10}
                                />
                            </div>
                            {error && <div className="bg-danger-bg text-danger text-sm p-3 rounded-md"><p className="font-bold">Error</p><p>{error}</p></div>}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button onClick={() => handleSavePrompt(prompt, 'image', modelType, image)} disabled={!prompt || isLoading || promptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${promptSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {promptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : promptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                    {promptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleCopy} disabled={!prompt || isLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <CopyIcon className="w-5 h-5" />{copyButtonText}
                                </button>
                                <button onClick={() => handleUsePrompt(prompt)} disabled={!prompt || isLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'extract-background' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-green space-y-8">
                    <h2 className="text-xl font-bold text-highlight-green">Extract Background from Image</h2>
                    <p className="text-sm text-text-secondary -mt-6">
                        Upload a photo to generate a prompt describing only the background. This is useful for creating consistent environments.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader label="Upload Photo" id="bg-extract-image" onImageUpload={file => dispatch(updatePromptGenState({ bgImage: file, bgPrompt: '' }))} sourceFile={bgImage} />
                                </div>
                                <button onClick={onOpenLibraryForBg} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select from Library"><LibraryIcon className="w-6 h-6"/></button>
                            </div>
                            <div><label className="block text-sm font-medium text-text-secondary mb-2">Prompt Type</label>{renderPromptTypeButtons(bgModelType, setBgModelType)}</div>
                            <button onClick={handleBgGenerate} disabled={!bgImage || isBgLoading} style={bgImage && !isBgLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary">
                                {isBgLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}{isBgLoading ? 'Generating...' : 'Generate Background Prompt'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-bg-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Background Prompt</label>
                                <textarea id="generated-bg-prompt" value={bgPrompt} onChange={(e) => dispatch(updatePromptGenState({ bgPrompt: e.target.value }))} readOnly={isBgLoading} placeholder="Your generated background prompt will appear here..." className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-highlight-green font-medium" rows={10}/>
                            </div>
                            {bgError && <div className="bg-danger-bg text-danger text-sm p-3 rounded-md"><p className="font-bold">Error</p><p>{bgError}</p></div>}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button onClick={() => handleSavePrompt(bgPrompt, 'background', bgModelType, bgImage)} disabled={!bgPrompt || isBgLoading || bgPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${bgPromptSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {bgPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : bgPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                    {bgPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleBgCopy} disabled={!bgPrompt || isBgLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <CopyIcon className="w-5 h-5" />{bgCopyButtonText}
                                </button>
                                <button onClick={() => handleUsePrompt(bgPrompt)} disabled={!bgPrompt || isBgLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'extract-subject' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-yellow space-y-8">
                     <h2 className="text-xl font-bold text-highlight-yellow">Extract Subject from Image</h2>
                     <p className="text-sm text-text-secondary -mt-6">
                        Upload a photo to generate a prompt describing only the main subject(s). This is useful for isolating characters or objects from their environment.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader label="Upload Photo" id="subject-extract-image" onImageUpload={file => dispatch(updatePromptGenState({ subjectImage: file, subjectPrompt: '' }))} sourceFile={subjectImage} />
                                </div>
                                <button onClick={onOpenLibraryForSubject} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select from Library"><LibraryIcon className="w-6 h-6"/></button>
                            </div>
                            <div><label className="block text-sm font-medium text-text-secondary mb-2">Prompt Type</label>{renderPromptTypeButtons(subjectModelType, setSubjectModelType)}</div>
                            <button onClick={handleSubjectGenerate} disabled={!subjectImage || isSubjectLoading} style={subjectImage && !isSubjectLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary">
                                {isSubjectLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}{isSubjectLoading ? 'Generating...' : 'Generate Subject Prompt'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-subject-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Subject Prompt</label>
                                <textarea id="generated-subject-prompt" value={subjectPrompt} onChange={(e) => dispatch(updatePromptGenState({ subjectPrompt: e.target.value }))} readOnly={isSubjectLoading} placeholder="Your generated subject prompt will appear here..." className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-highlight-yellow font-medium" rows={10}/>
                            </div>
                            {subjectError && <div className="bg-danger-bg text-danger text-sm p-3 rounded-md"><p className="font-bold">Error</p><p>{subjectError}</p></div>}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button onClick={() => handleSavePrompt(subjectPrompt, 'subject', subjectModelType, subjectImage)} disabled={!subjectPrompt || isSubjectLoading || subjectPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${subjectPromptSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {subjectPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : subjectPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                    {subjectPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleSubjectCopy} disabled={!subjectPrompt || isSubjectLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <CopyIcon className="w-5 h-5" />{subjectCopyButtonText}
                                </button>
                                <button onClick={() => handleUsePrompt(subjectPrompt)} disabled={!subjectPrompt || isSubjectLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'prompt-soup' && (
                <div className="space-y-8">
                    <h2 className="text-xl font-bold text-accent">Magical Prompt Soup</h2>
                    <p className="text-sm text-text-secondary -mt-6">
                        Mash up the prompts generated in other tabs into a new, unique, and often surprising creation. Adjust the creativity to control how wild the result is!
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-6 bg-bg-tertiary p-6 rounded-lg border border-border-primary/50">
                            <div><label className="block text-sm font-medium text-text-secondary mb-2">Output Prompt Type</label>{renderPromptTypeButtons(soupModelType, setSoupModelType)}</div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Creativity: {soupCreativity}</label>
                                <input type="range" min="0" max="1" step="0.1" value={soupCreativity} onChange={(e) => setSoupCreativity(parseFloat(e.target.value))} disabled={isSoupLoading} className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer" />
                                <p className="text-xs text-text-muted mt-1">Higher values lead to more unexpected combinations.</p>
                            </div>
                            <button onClick={handleGenerateSoup} disabled={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading} style={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading ? {} : { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                                {isSoupLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}{isSoupLoading ? 'Stirring...' : 'Create Soup'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-soup-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Soup Prompt</label>
                                <div id="generated-soup-prompt" className="w-full bg-bg-primary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent min-h-[184px] whitespace-pre-wrap">
                                    {soupPromptParts.length > 0 ? soupPromptParts.map((part, index) => <span key={index} className={getSourceColor(part.source)}>{part.text + ' '}</span>) : soupPrompt ? <span className="text-text-primary">{soupPrompt}</span> : <span className="text-text-muted">Your magical prompt soup will appear here...</span>}
                                </div>
                            </div>
                            {soupError && <div className="bg-danger-bg text-danger text-sm p-3 rounded-md"><p className="font-bold">Error</p><p>{soupError}</p></div>}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button onClick={() => handleSavePrompt(soupPrompt, 'soup', soupModelType, null)} disabled={!soupPrompt || isSoupLoading || soupPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${soupPromptSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {soupPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : soupPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                    {soupPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleSoupCopy} disabled={!soupPrompt || isSoupLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <CopyIcon className="w-5 h-5" />{soupCopyButtonText}
                                </button>
                                <button onClick={() => handleUsePrompt(soupPrompt)} disabled={!soupPrompt || isSoupLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                            {soupHistory.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="text-md font-semibold text-text-secondary mb-2">Recent Soups</h4>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 bg-bg-primary/50 p-2 rounded-md border border-border-primary/50">
                                        {soupHistory.map((soup, index) => (
                                            <div key={index} className="group bg-bg-tertiary p-2 rounded-md flex items-center justify-between gap-2">
                                                <p className="text-xs text-text-secondary truncate cursor-pointer hover:text-text-primary transition-colors" title={soup} onClick={() => { dispatch(updatePromptGenState({soupPrompt: soup})); setSoupPromptParts([]); }}>{soup}</p>
                                                <button onClick={() => handleHistoryItemCopy(soup, index)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-bg-secondary text-text-secondary hover:bg-accent hover:text-accent-text" title={historyCopyStates[index] || "Copy"}>
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
            )}
            
            {activeSubTab === 'wan-video' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-pink-500 space-y-8">
                     <h2 className="text-xl font-bold text-pink-500">WAN 2.2 Video Prompt Builder</h2>
                     <p className="text-sm text-text-secondary -mt-6">
                        Craft the perfect prompt for text-to-video generation using a structured formula.
                    </p>
                    <div className="flex items-center justify-center gap-2 bg-bg-tertiary p-1 rounded-full max-w-sm mx-auto">
                        <button onClick={() => setWanVideoMode('scratch')} className={`w-1/2 py-2 text-sm font-bold rounded-full transition-colors ${wanVideoMode === 'scratch' ? 'bg-accent text-accent-text' : ''}`}>From Scratch</button>
                        <button onClick={() => setWanVideoMode('image')} className={`w-1/2 py-2 text-sm font-bold rounded-full transition-colors ${wanVideoMode === 'image' ? 'bg-accent text-accent-text' : ''}`}>From Image</button>
                    </div>

                    {wanVideoMode === 'image' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-bg-tertiary p-4 rounded-lg">
                             <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <ImageUploader label="Upload Photo" id="wan-video-image" onImageUpload={file => dispatch(updatePromptGenState({ wanVideoImage: file, wanVideoBasePrompt: '' }))} sourceFile={wanVideoImage} />
                                </div>
                                <button onClick={onOpenLibraryForWanVideoImage} className="mt-8 self-center bg-bg-primary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"><LibraryIcon className="w-6 h-6"/></button>
                            </div>
                            <div className="space-y-4">
                                <button onClick={handleWanVideoGenerateFromImage} disabled={!wanVideoImage || isWanVideoLoading} className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover disabled:opacity-50">
                                    {isWanVideoLoading ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5" />}
                                    Generate Base Prompt
                                </button>
                                 <textarea value={wanVideoBasePrompt} onChange={e => dispatch(updatePromptGenState({ wanVideoBasePrompt: e.target.value }))} placeholder="Base prompt from image appears here..." className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm h-28" />
                                {wanVideoError && <p className="text-xs text-danger">{wanVideoError}</p>}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {wanVideoMode === 'scratch' && (
                            <div className="lg:col-span-1">
                                <label className="block text-sm font-medium text-text-secondary">Category</label>
                                <select value={wanVideoCategory} onChange={e => dispatch(updatePromptGenState({ wanVideoCategory: e.target.value as any, wanVideoSubject: '', wanVideoEnvironment: '', wanVideoStyle: '' }))} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                    {Object.keys(WAN_VIDEO_PROMPT_BLOCKS).map(key => <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1).replace('-', ' / ')}</option>)}
                                </select>
                            </div>
                        )}
                        {wanVideoMode === 'scratch' && (
                            <div className="lg:col-span-2">
                                <label className="block text-sm font-medium text-text-secondary">Subject</label>
                                <select value={wanVideoSubject} onChange={e => dispatch(updatePromptGenState({ wanVideoSubject: e.target.value }))} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                    <option value="">-- Select Subject --</option>
                                    {WAN_VIDEO_PROMPT_BLOCKS[wanVideoCategory].subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary">Action</label>
                            <input type="text" value={wanVideoAction} onChange={e => dispatch(updatePromptGenState({ wanVideoAction: e.target.value }))} placeholder="e.g., walking, running, flying" className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-medium text-text-secondary">Environment</label>
                            <select value={wanVideoEnvironment} onChange={e => dispatch(updatePromptGenState({ wanVideoEnvironment: e.target.value }))} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                <option value="">-- Select Environment --</option>
                                {(wanVideoMode === 'image' ? allWanEnvironments : WAN_VIDEO_PROMPT_BLOCKS[wanVideoCategory].environments).map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-medium text-text-secondary">Style / Mood</label>
                            <select value={wanVideoStyle} onChange={e => dispatch(updatePromptGenState({ wanVideoStyle: e.target.value }))} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                <option value="">-- Select Style --</option>
                                {(wanVideoMode === 'image' ? allWanStyles : WAN_VIDEO_PROMPT_BLOCKS[wanVideoCategory].styles).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary">Camera Move</label>
                            <select value={wanVideoCameraMove} onChange={e => dispatch(updatePromptGenState({ wanVideoCameraMove: e.target.value }))} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                {CAMERA_MOVES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-border-primary">
                        <label className="block text-sm font-medium text-text-secondary mb-1">Final Prompt</label>
                        <textarea value={wanVideoFinalPrompt} readOnly className="w-full bg-bg-primary border border-border-primary rounded-md p-3 text-sm h-28 text-pink-400 font-semibold" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                             <button onClick={() => handleSavePrompt(wanVideoFinalPrompt, 'wan-video', 'wan2.2', wanVideoImage)} disabled={!wanVideoFinalPrompt || wanVideoPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 ${wanVideoPromptSaveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                {wanVideoPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : wanVideoPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                {wanVideoPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                            </button>
                            <button onClick={handleWanVideoCopy} disabled={!wanVideoFinalPrompt} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover disabled:opacity-50"><CopyIcon className="w-5 h-5" /> {wanVideoCopyButtonText}</button>
                            <button onClick={() => handleUsePrompt(wanVideoFinalPrompt)} disabled={!wanVideoFinalPrompt} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover disabled:opacity-50"><SendIcon className="w-5 h-5" />Use</button>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'qwen-image' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-blue-400 space-y-8">
                    <h2 className="text-2xl font-bold text-blue-400">Qwen Image Prompt Builder</h2>
                    <p className="text-sm text-text-secondary -mt-6">
                        Construct a structured prompt for Qwen Image models using this formula-based builder.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Column: Controls */}
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">1. Main Subject / Scene</label>
                                <textarea 
                                    value={qwenTitle}
                                    onChange={e => dispatch(updatePromptGenState({ qwenTitle: e.target.value }))}
                                    placeholder="e.g., A majestic cyberpunk phoenix..." 
                                    className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                    rows={4}
                                />
                            </div>
                            
                            <div className="space-y-4 p-4 bg-bg-tertiary rounded-lg border border-border-primary/50">
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={qwenUseTextInImage}
                                        onChange={e => dispatch(updatePromptGenState({ qwenUseTextInImage: e.target.checked }))}
                                        className="rounded text-accent focus:ring-accent"
                                    />
                                    2. Add Text-in-Image (Optional)
                                </label>
                                {qwenUseTextInImage && (
                                    <div className="space-y-4 pl-6 border-l-2 border-border-primary">
                                         <input 
                                            type="text" 
                                            value={qwenTextContent}
                                            onChange={e => dispatch(updatePromptGenState({ qwenTextContent: e.target.value }))}
                                            placeholder="Text content" 
                                            className="block w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm"
                                        />
                                        <div>
                                            <label className="block text-xs font-medium text-text-muted">Position</label>
                                            <select 
                                                value={qwenTextPosition}
                                                onChange={e => dispatch(updatePromptGenState({ qwenTextPosition: e.target.value as any }))}
                                                className="mt-1 block w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm"
                                            >
                                                {['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                                                    <option key={pos} value={pos}>{pos.replace('-', ' ')}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <input 
                                            type="text" 
                                            value={qwenTextStyle}
                                            onChange={e => dispatch(updatePromptGenState({ qwenTextStyle: e.target.value }))}
                                            placeholder="Font / Style (e.g., glowing, futuristic)" 
                                            className="block w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm"
                                        />
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-text-secondary">3. Style Modifiers</label>
                                 <textarea 
                                    value={qwenStyleModifiers}
                                    onChange={e => dispatch(updatePromptGenState({ qwenStyleModifiers: e.target.value }))}
                                    placeholder="e.g., hyperrealistic, 8k, cinematic..." 
                                    className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm"
                                    rows={4}
                                />
                            </div>
                             <div>
                                <h4 className="text-xs font-semibold text-text-secondary mb-2">Preset Styles</h4>
                                <div className="flex flex-wrap gap-2">
                                    {['Cinematic', 'Photorealistic', 'Anime', '3D Render', 'Oil Painting', 'Watercolor'].map(style => (
                                         <button 
                                            key={style}
                                            onClick={() => dispatch(updatePromptGenState({ qwenStyleModifiers: (qwenStyleModifiers ? qwenStyleModifiers + ', ' : '') + style.toLowerCase() }))}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors bg-bg-primary hover:bg-bg-tertiary-hover"
                                        >
                                            + {style}
                                        </button>
                                    ))}
                                </div>
                             </div>
                        </div>
                        
                        {/* Right Column: Result */}
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-text-secondary">Final Prompt</label>
                             <textarea 
                                value={qwenFinalPrompt}
                                readOnly 
                                className="w-full bg-bg-primary border border-border-primary rounded-md p-3 text-sm h-96 text-blue-300 font-mono"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button onClick={() => handleSavePrompt(qwenFinalPrompt, 'qwen-image', 'qwen-image', null)} disabled={!qwenFinalPrompt || qwenPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 ${qwenPromptSaveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {qwenPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : qwenPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                    {qwenPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleQwenCopy} disabled={!qwenFinalPrompt} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover disabled:opacity-50"><CopyIcon className="w-5 h-5" /> {qwenCopyButtonText}</button>
                                <button onClick={() => handleUsePrompt(qwenFinalPrompt)} disabled={!qwenFinalPrompt} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover disabled:opacity-50"><SendIcon className="w-5 h-5" />Use</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="mt-8 pt-4 border-t border-danger-bg">
                <button onClick={onReset} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                    <ResetIcon className="w-5 h-5" /> Reset All Prompt Tools
                </button>
            </div>
        </div>
    );
};