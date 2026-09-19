import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { setPromptSaveStatus, updatePromptGenState } from '../store/promptGenSlice';
import { ImageUploader } from './ImageUploader';
// Fix: Corrected typo in imported function name from 'extractSubjectFromImage' to 'extractSubjectPromptFromImage'.
import { generateComfyUIPromptFromSource, extractBackgroundPromptFromImage, extractSubjectPromptFromImage, generateFlorence2Prompt, generateMagicalPromptSoup } from '../services/comfyUIService';
import { generateOllamaPromptFromImage, generateOllamaPromptSoup, testOllamaConnection, type OllamaActivity } from '../services/ollamaService';
import type { LibraryItem, PromptGenState, GenerationOptions, PromptSoupPart } from '../types';
import { GenerateIcon, SpinnerIcon, CopyIcon, SendIcon, SaveIcon, CheckIcon, LibraryIcon, ResetIcon, WorkflowIcon, CloseIcon } from './icons';
import { fileToResizedDataUrl, dataUrlToThumbnail } from '../utils/imageUtils';
import { updateOptions, setGenerationMode, switchComfyModelOptions } from '../store/generationSlice';
import { setActiveTab } from '../store/appSlice';
import { createAccentStyle } from '../utils/accentTheme';
import { getPromptDestinationOptions, PROMPT_T2I_WORKFLOWS } from '../utils/promptDestination';


type PromptModelType = 'sd1.5' | 'sdxl' | 'flux' | 'flux2-simple' | 'gemini' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea';
type PromptCategory = 'image' | 'background' | 'subject' | 'soup' | 'wan-video' | 'qwen-image';
type AnalysisProvider = 'mammouth' | 'ollama' | 'comfyui';

const getComfyChoices = (input: any): string[] => {
    const choices = Array.isArray(input?.[0]) ? input[0] : [];
    return choices.filter((choice: unknown): choice is string => typeof choice === 'string' && Boolean(choice));
};

const PROMPT_ACCENT_STYLES: Record<string, React.CSSProperties> = {
    'from-image': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    'extract-background': createAccentStyle('#4ade80', '#86efac', '#16a34a'),
    'extract-subject': createAccentStyle('#facc15', '#fde047', '#ca8a04'),
    'prompt-soup': createAccentStyle('#a78bfa', '#c4b5fd', '#7c3aed'),
    'qwen-image': createAccentStyle('#60a5fa', '#93c5fd', '#2563eb'),
};

const createPromptThumbnail = (text: string, type: PromptCategory, modelType: PromptModelType | 'wan2.2' | 'qwen-image', promptParts?: PromptSoupPart[]): string => {
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

    const sourceColors: Record<number, string> = { 0: textColor, 1: '#22d3ee', 2: '#4ade80', 3: '#facc15' };
    const coloredLines: PromptSoupPart[][] = [];
    if (promptParts?.length) {
        let currentLine: PromptSoupPart[] = [];
        let currentLength = 0;
        for (const part of promptParts) {
            for (const word of part.text.split(/\s+/).filter(Boolean)) {
                if (currentLength > 0 && currentLength + word.length + 1 > charsPerLine) {
                    coloredLines.push(currentLine);
                    currentLine = [];
                    currentLength = 0;
                    if (coloredLines.length === 6) break;
                }
                const prefix = currentLength > 0 ? ' ' : '';
                currentLine.push({ text: `${prefix}${word}`, source: part.source });
                currentLength += prefix.length + word.length;
            }
            if (coloredLines.length === 6) break;
        }
        if (currentLine.length > 0 && coloredLines.length < 6) coloredLines.push(currentLine);
    }
    const coloredText = coloredLines.length
        ? coloredLines.map((line, index) => `<tspan x="15" dy="${index === 0 ? 0 : '1.4em'}">${line.map(part => `<tspan fill="${sourceColors[part.source] || textColor}">${part.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</tspan>`).join('')}</tspan>`).join('')
        : lines.slice(0, 6).map((line, index) => `<tspan x="15" dy="${index === 0 ? 0 : '1.4em'}">${line}</tspan>`).join('');

    const finalSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="${bgColor}"/>
        <rect x="2" y="2" width="252" height="252" fill="none" stroke="${borderColor}" stroke-width="4" rx="8"/>
        
        <text x="15" y="40" font-family="Orbitron, monospace" font-size="16px" font-weight="bold" fill="${borderColor}">${modelType.toUpperCase()}</text>
        <text x="15" y="60" font-family="sans-serif" font-size="12px" fill="${modelTypeColor}" style="text-transform: uppercase; letter-spacing: 0.5px;">${type.replace('-', ' ')} Prompt</text>
        
        <text x="15" y="100" font-family="sans-serif" font-size="14px" fill="${textColor}">
            ${coloredText}${!coloredLines.length && lines.length > 6 ? '<tspan x="15" dy="1.4em">...</tspan>' : ''}
        </text>
    </svg>
    `;

    const svgBytes = new TextEncoder().encode(finalSvg);
    const binarySvg = Array.from(svgBytes, byte => String.fromCharCode(byte)).join('');
    return `data:image/svg+xml;base64,${btoa(binarySvg)}`;
};

interface PromptDestinationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
}

const PromptDestinationPickerModal: React.FC<PromptDestinationPickerModalProps> = ({ isOpen, onClose, prompt }) => {
  const dispatch: AppDispatch = useDispatch();

    const handleSelectDestination = (provider: 'comfyui' | 'mammouth', comfyModelType?: GenerationOptions['comfyModelType']) => {
        if (provider === 'mammouth') {
            dispatch(updateOptions({ provider, geminiPrompt: prompt, geminiMode: 't2i' }));
        } else if (comfyModelType) {
            dispatch(switchComfyModelOptions(getPromptDestinationOptions(prompt, comfyModelType)));
        }
    dispatch(setGenerationMode('t2i'));
    dispatch(setActiveTab('image-generator'));
    onClose();
  };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="prompt-destination-title">
            <div className="w-full max-w-2xl rounded-2xl border border-border-primary bg-bg-secondary p-6 shadow-lg" onClick={event => event.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <h2 id="prompt-destination-title" className="flex items-center gap-2 text-xl font-bold text-accent"><SendIcon className="h-6 w-6" />Use Prompt In...</h2>
                    <button onClick={onClose} className="rounded-full p-1 text-text-secondary hover:bg-bg-tertiary-hover"><CloseIcon className="h-5 w-5" /></button>
                </div>
                <p className="mb-6 text-sm text-text-secondary">Where would you like to use this generated prompt?</p>
                <div className="space-y-6">
                    <div>
                        <h3 className="mb-3 text-lg font-semibold text-text-primary">Mammouth AI</h3>
                        <button onClick={() => handleSelectDestination('mammouth')} className="flex w-full items-center gap-4 rounded-lg bg-bg-tertiary p-4 text-left transition-colors hover:bg-bg-tertiary-hover">
                            <GenerateIcon className="h-8 w-8 flex-shrink-0 text-accent" />
                            <div><p className="font-bold">Mammouth T2I</p><p className="text-xs text-text-secondary">Use the selected Mammouth image model.</p></div>
                        </button>
                    </div>
                    <div>
                        <h3 className="mb-3 text-lg font-semibold text-text-primary">ComfyUI (T2I Workflows)</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {PROMPT_T2I_WORKFLOWS.map(workflow => (
                                <button key={workflow.id} onClick={() => handleSelectDestination('comfyui', workflow.id as GenerationOptions['comfyModelType'])} className="flex w-full items-center gap-3 rounded-lg bg-bg-tertiary p-3 text-left transition-colors hover:bg-bg-tertiary-hover">
                                    <WorkflowIcon className="h-6 w-6 flex-shrink-0 text-highlight-green" />
                                    <div><p className="font-semibold">{workflow.label}</p><p className="text-xs text-text-secondary">Switch to Image Generator with this workflow.</p></div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface PromptGeneratorPanelProps {
        activeSubTab: string;
        setActiveSubTab: (tabId: string) => void;
        onOpenLibraryForImage: () => void;
        onOpenLibraryForBg: () => void;
        onOpenLibraryForSubject: () => void;
        onReset: () => void;
        isComfyUIConnected: boolean | null;
        comfyUIObjectInfo: any | null;
        ollamaUrl: string;
        defaultOllamaModel: string;
}

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
        <div className="mb-8 -mt-2 flex items-center border-b-2 border-border-primary">
                {tabs.map(tab => (
                        <button key={tab.id} onClick={() => onTabClick(tab.id)} className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors duration-200 ${activeTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                                {tab.icon}{tab.label}
                        </button>
                ))}
        </div>
);

const OllamaActivityPanel: React.FC<{ activity: OllamaActivity; model: string; onClose: () => void; onStop: () => void }> = ({ activity, model, onClose, onStop }) => {
    const phaseLabels = {
        loading: 'Loading model',
        thinking: 'Thinking',
        responding: 'Writing response',
        complete: 'Complete',
        cancelled: 'Stopped',
        failed: 'Failed',
    };
    const isActive = activity.phase === 'loading' || activity.phase === 'thinking' || activity.phase === 'responding';
    return (
        <div className="mb-6 overflow-hidden rounded-md border border-emerald-400/40 bg-bg-primary shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border-primary bg-emerald-500/10 px-3 py-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                        {isActive && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                        Ollama · {phaseLabels[activity.phase]}
                    </div>
                    <p className="truncate text-xs text-text-muted" title={model}>{model}</p>
                </div>
                <div className="flex items-center gap-2">
                    {isActive && <button type="button" onClick={onStop} className="rounded border border-red-400/50 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-300 hover:bg-red-500/20">Stop</button>}
                    <button type="button" onClick={onClose} className="rounded p-1 text-text-secondary hover:bg-bg-tertiary-hover" aria-label="Close Ollama activity"><CloseIcon className="h-4 w-4" /></button>
                </div>
            </div>
            <div className="grid max-h-56 grid-cols-1 gap-3 overflow-y-auto p-3 md:grid-cols-2">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-muted">Thinking</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">{activity.thinking || (activity.phase === 'loading' ? 'Preparing request and loading model…' : 'This model is not exposing its reasoning.')}</pre>
                </div>
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-muted">Live output</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-accent">{activity.response || 'Waiting for response…'}</pre>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-primary px-3 py-2 text-xs text-text-muted">
                <span>Input tokens: {activity.promptTokens ?? 'pending'}</span>
                <span>Output tokens: {activity.responseTokens ?? 'pending'}</span>
                <span>Speed: {activity.tokensPerSecond ? `${activity.tokensPerSecond.toFixed(1)} tok/s` : 'pending'}</span>
            </div>
        </div>
    );
};


export const PromptGeneratorPanel: React.FC<PromptGeneratorPanelProps> = ({
    activeSubTab,
    setActiveSubTab,
    onOpenLibraryForImage,
    onOpenLibraryForBg,
    onOpenLibraryForSubject,
    onReset,
    isComfyUIConnected,
    comfyUIObjectInfo,
    ollamaUrl,
    defaultOllamaModel,
}) => {
    const dispatch: AppDispatch = useDispatch();
    const state = useSelector((state: RootState) => state.promptGen.promptGenState);
    const { 
        image, prompt, bgImage, bgPrompt, subjectImage, subjectPrompt, soupPrompt, soupHistory,
        promptSaveStatus, bgPromptSaveStatus, subjectPromptSaveStatus, soupPromptSaveStatus,
    } = state;

    // --- Ephemeral state (not persisted) ---
    const [modelType, setModelType] = useState<PromptModelType>('sdxl');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');
    const [analysisProvider, setAnalysisProvider] = useState<AnalysisProvider>('mammouth');
    const [florenceModel, setFlorenceModel] = useState('MiaoshouAI/Florence-2-large-PromptGen-v2.0');
    const [florenceTask, setFlorenceTask] = useState('detailed_caption');
    const [ollamaModel, setOllamaModel] = useState(defaultOllamaModel);
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [isOllamaConnected, setIsOllamaConnected] = useState<boolean | null>(null);
    const [ollamaActivity, setOllamaActivity] = useState<OllamaActivity | null>(null);
    const ollamaAbortController = useRef<AbortController | null>(null);

    const startOllamaRequest = () => {
        ollamaAbortController.current?.abort();
        const controller = new AbortController();
        ollamaAbortController.current = controller;
        return controller;
    };

    const stopOllamaRequest = () => {
        ollamaAbortController.current?.abort();
        ollamaAbortController.current = null;
        setOllamaActivity(current => current ? { ...current, phase: 'cancelled' } : current);
    };

    useEffect(() => () => ollamaAbortController.current?.abort(), []);

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
    const [soupPromptParts, setSoupPromptParts] = useState<PromptSoupPart[]>([]);

    
    // State for the new destination picker modal
    const [isPickerOpen, setPickerOpen] = useState(false);
    const [promptToUse, setPromptToUse] = useState<string>('');

    const florenceModels = useMemo(
        () => getComfyChoices(comfyUIObjectInfo?.DownloadAndLoadFlorence2Model?.input?.required?.model),
        [comfyUIObjectInfo],
    );
    const florenceTasks = useMemo(
        () => getComfyChoices(comfyUIObjectInfo?.Florence2Run?.input?.required?.task),
        [comfyUIObjectInfo],
    );
    const hasFlorenceNodes = Boolean(
        comfyUIObjectInfo?.LoadImage
        && comfyUIObjectInfo?.Florence2Run
        && comfyUIObjectInfo?.DownloadAndLoadFlorence2Model
        && comfyUIObjectInfo?.['ShowText|pysssss'],
    );
    const isFlorenceUnavailable = analysisProvider === 'comfyui'
        && (isComfyUIConnected !== true || !hasFlorenceNodes || !florenceModel || !florenceTask);
    const isOllamaUnavailable = analysisProvider === 'ollama' && (isOllamaConnected !== true || !ollamaModel.trim());

    useEffect(() => {
        if (florenceModels.length > 0 && !florenceModels.includes(florenceModel)) setFlorenceModel(florenceModels[0]);
    }, [florenceModel, florenceModels]);

    useEffect(() => {
        if (florenceTasks.includes('detailed_caption')) {
            if (!florenceTasks.includes(florenceTask)) setFlorenceTask('detailed_caption');
        } else if (florenceTasks.length > 0 && !florenceTasks.includes(florenceTask)) {
            setFlorenceTask(florenceTasks[0]);
        }
    }, [florenceTask, florenceTasks]);

    useEffect(() => {
        setOllamaModel(defaultOllamaModel);
    }, [defaultOllamaModel]);

    useEffect(() => {
        let cancelled = false;
        setIsOllamaConnected(null);
        testOllamaConnection(ollamaUrl).then((result) => {
            if (cancelled) return;
            setIsOllamaConnected(result.success);
            setOllamaModels(result.models);
        });
        return () => { cancelled = true; };
    }, [ollamaUrl]);

    useEffect(() => {
        if (analysisProvider === 'comfyui' && activeSubTab !== 'from-image') setAnalysisProvider('ollama');
    }, [activeSubTab, analysisProvider]);

    useEffect(() => {
        if (activeSubTab === 'qwen-image' || activeSubTab === 'wan-video') setActiveSubTab('from-image');
    }, [activeSubTab, setActiveSubTab]);

    const handleSavePrompt = async (
        promptToSave: string, 
        type: PromptCategory,
        modelTypeToSave: PromptModelType | 'wan2.2' | 'qwen-image',
        sourceFile: File | null,
        promptParts?: PromptSoupPart[],
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
                thumbnail: createPromptThumbnail(promptToSave, type, modelTypeToSave, promptParts),
                sourceImage: sourceFile
                    ? await fileToResizedDataUrl(sourceFile, 512)
                    : undefined,
                promptParts: promptParts?.length ? promptParts : undefined,
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
        setOllamaActivity(null);
        const controller = analysisProvider === 'ollama' ? startOllamaRequest() : null;
        try {
            const generatedPrompt = analysisProvider === 'comfyui'
                ? await generateFlorence2Prompt(image, 'image', { model: florenceModel, task: florenceTask })
                : analysisProvider === 'ollama'
                    ? await generateOllamaPromptFromImage(image, 'image', modelType, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal)
                    : await generateComfyUIPromptFromSource(image, modelType);
            dispatch(updatePromptGenState({ prompt: generatedPrompt }));
        } catch (err: any) {
            setError(err?.name === 'AbortError' ? 'Ollama request stopped.' : err.message || 'An unknown error occurred.');
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
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

    const handleUsePromptClick = (prompt: string) => {
        if (prompt) {
          setPromptToUse(prompt);
          setPickerOpen(true);
        }
    };

    const handleBgGenerate = async () => {
        if (!bgImage) {
            setBgError("Please upload an image first.");
            return;
        }
        setIsBgLoading(true);
        setBgError(null);
        setOllamaActivity(null);
        const controller = analysisProvider === 'ollama' ? startOllamaRequest() : null;
        try {
            const generatedPrompt = analysisProvider === 'ollama'
                ? await generateOllamaPromptFromImage(bgImage, 'background', bgModelType, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal)
                : await extractBackgroundPromptFromImage(bgImage, bgModelType);
            dispatch(updatePromptGenState({ bgPrompt: generatedPrompt }));
        } catch (err: any) {
            setBgError(err?.name === 'AbortError' ? 'Ollama request stopped.' : err.message || 'An unknown error occurred.');
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
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
        setOllamaActivity(null);
        const controller = analysisProvider === 'ollama' ? startOllamaRequest() : null;
        try {
            const generatedPrompt = analysisProvider === 'ollama'
                ? await generateOllamaPromptFromImage(subjectImage, 'subject', subjectModelType, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal)
                : await extractSubjectPromptFromImage(subjectImage, subjectModelType);
            dispatch(updatePromptGenState({ subjectPrompt: generatedPrompt }));
        } catch (err: any) {
            setSubjectError(err?.name === 'AbortError' ? 'Ollama request stopped.' : err.message || 'An unknown error occurred.');
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
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
        setOllamaActivity(null);
        const controller = analysisProvider === 'ollama' ? startOllamaRequest() : null;
        try {
            const generatedParts = analysisProvider === 'ollama'
                ? await generateOllamaPromptSoup(prompt, bgPrompt, subjectPrompt, soupModelType, soupCreativity, ollamaUrl, ollamaModel, setOllamaActivity, controller?.signal)
                : await generateMagicalPromptSoup(prompt, bgPrompt, subjectPrompt, soupModelType, soupCreativity);
            const fullPromptString = generatedParts.map(p => p.text).join(' ');
            setSoupPromptParts(generatedParts);
            dispatch(updatePromptGenState({ 
                soupPrompt: fullPromptString,
                soupHistory: [fullPromptString, ...soupHistory].slice(0, 5)
            }));

        } catch (err: any) {
            setSoupError(err?.name === 'AbortError' ? 'Ollama request stopped.' : err.message || 'An unknown error occurred.');
        } finally {
            if (ollamaAbortController.current === controller) ollamaAbortController.current = null;
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

    
    const renderPromptTypeButtons = (currentType: PromptModelType, setType: (type: PromptModelType) => void) => {
        const types: { id: PromptModelType; label: string }[] = [
            { id: 'gemini', label: 'Narrative (Very Long)' },
            { id: 'flux2-simple', label: 'Prompt Segment (FLUX2)' },
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

    const renderOllamaControls = (currentType: PromptModelType, setType: (type: PromptModelType) => void) => (
        <div className="space-y-3">
            <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Ollama Model</label>
                <select value={ollamaModel} onChange={(event) => { setOllamaModel(event.target.value); localStorage.setItem('ollama_model', event.target.value); }} className="block w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm">
                    {[...new Set([ollamaModel, ...ollamaModels])].filter(Boolean).map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
            </div>
            <div>
                <label className="mb-2 block text-sm font-medium text-text-secondary">Prompt Type</label>
                {renderPromptTypeButtons(currentType, setType)}
            </div>
            {isOllamaConnected === null && <p className="text-xs text-text-muted">Checking Ollama connection...</p>}
            {isOllamaConnected === false && <p className="text-xs text-danger">Ollama is not connected. Check its URL in Connection Settings.</p>}
        </div>
    );

    const renderAnalysisControls = (currentType: PromptModelType, setType: (type: PromptModelType) => void, allowFlorence = false) => (
        <div className="space-y-4">
            <div>
                <label className="mb-2 block text-sm font-medium text-text-secondary">Analysis Provider</label>
                <div className={`grid ${allowFlorence ? 'grid-cols-3' : 'grid-cols-2'} rounded-md border border-border-primary bg-bg-primary p-1`}>
                    <button type="button" onClick={() => setAnalysisProvider('mammouth')} className={`rounded px-3 py-2 text-sm font-semibold transition-colors ${analysisProvider === 'mammouth' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary-hover'}`}>Mammouth AI</button>
                    <button type="button" onClick={() => setAnalysisProvider('ollama')} className={`rounded px-3 py-2 text-sm font-semibold transition-colors ${analysisProvider === 'ollama' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary-hover'}`}>Ollama</button>
                    {allowFlorence && <button type="button" onClick={() => setAnalysisProvider('comfyui')} className={`rounded px-3 py-2 text-sm font-semibold transition-colors ${analysisProvider === 'comfyui' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary-hover'}`}>Florence2</button>}
                </div>
            </div>
            {analysisProvider === 'mammouth' ? (
                <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">Prompt Type</label>
                    {renderPromptTypeButtons(currentType, setType)}
                </div>
            ) : analysisProvider === 'ollama' ? renderOllamaControls(currentType, setType) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-text-secondary">Florence2 Model</label>
                        <select value={florenceModel} onChange={(event) => setFlorenceModel(event.target.value)} disabled={florenceModels.length === 0} className="block w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm disabled:opacity-50">
                            {florenceModels.length === 0 && <option value={florenceModel}>{florenceModel}</option>}
                            {florenceModels.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-text-secondary">Florence2 Task</label>
                        <select value={florenceTask} onChange={(event) => setFlorenceTask(event.target.value)} disabled={florenceTasks.length === 0} className="block w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm disabled:opacity-50">
                            {florenceTasks.length === 0 && <option value={florenceTask}>{florenceTask}</option>}
                            {florenceTasks.map((task) => <option key={task} value={task}>{task}</option>)}
                        </select>
                    </div>
                    {isComfyUIConnected !== true && <p className="text-xs text-danger sm:col-span-2">Connect ComfyUI to use Florence2.</p>}
                    {isComfyUIConnected === true && !hasFlorenceNodes && <p className="text-xs text-danger sm:col-span-2">Install Florence2 and pysssss ShowText custom nodes, then reconnect ComfyUI.</p>}
                </div>
            )}
        </div>
    );

    const subTabs = [
        { id: 'from-image', label: 'Prompt from Image' },
        { id: 'extract-background', label: 'Extract Background' },
        { id: 'extract-subject', label: 'Subject / Object' },
        { id: 'prompt-soup', label: 'Magical Prompt Soup' },
    ];

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-4xl mx-auto" style={PROMPT_ACCENT_STYLES[activeSubTab] || PROMPT_ACCENT_STYLES['prompt-soup']}>
            <div className="mb-4 border border-border-primary bg-bg-primary/50 p-3 text-sm text-text-secondary">
                {activeSubTab === 'prompt-soup'
                    ? `Prompt remix powered by ${analysisProvider === 'ollama' ? 'Ollama' : 'Mammouth AI'}`
                    : activeSubTab === 'from-image' || activeSubTab === 'extract-background' || activeSubTab === 'extract-subject'
                        ? `Prompt analysis powered by ${analysisProvider === 'comfyui' ? 'ComfyUI Florence2' : analysisProvider === 'ollama' ? 'Ollama' : 'Mammouth AI'}`
                        : 'Prompt tools'}
            </div>
            <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

            {analysisProvider === 'ollama' && ollamaActivity && (
                <OllamaActivityPanel activity={ollamaActivity} model={ollamaModel} onClose={() => setOllamaActivity(null)} onStop={stopOllamaRequest} />
            )}

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
                            {renderAnalysisControls(modelType, setModelType, true)}
                            <button
                                onClick={handleGenerate}
                                disabled={!image || isLoading || isFlorenceUnavailable || isOllamaUnavailable}
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
                                <button onClick={() => handleUsePromptClick(prompt)} disabled={!prompt || isLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'extract-background' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent space-y-8">
                    <h2 className="text-xl font-bold text-accent">Extract Background from Image</h2>
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
                            {renderAnalysisControls(bgModelType, setBgModelType)}
                            <button onClick={handleBgGenerate} disabled={!bgImage || isBgLoading || isOllamaUnavailable} style={bgImage && !isBgLoading && !isOllamaUnavailable ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary">
                                {isBgLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}{isBgLoading ? 'Generating...' : 'Generate Background Prompt'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-bg-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Background Prompt</label>
                                <textarea id="generated-bg-prompt" value={bgPrompt} onChange={(e) => dispatch(updatePromptGenState({ bgPrompt: e.target.value }))} readOnly={isBgLoading} placeholder="Your generated background prompt will appear here..." className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-accent font-medium" rows={10}/>
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
                                <button onClick={() => handleUsePromptClick(bgPrompt)} disabled={!bgPrompt || isBgLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <SendIcon className="w-5 h-5" />Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSubTab === 'extract-subject' && (
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent space-y-8">
                    <h2 className="text-xl font-bold text-accent">Extract Subject or Object from Image</h2>
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
                            {renderAnalysisControls(subjectModelType, setSubjectModelType)}
                            <button onClick={handleSubjectGenerate} disabled={!subjectImage || isSubjectLoading || isOllamaUnavailable} style={subjectImage && !isSubjectLoading && !isOllamaUnavailable ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-primary text-text-secondary">
                                {isSubjectLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}{isSubjectLoading ? 'Generating...' : 'Generate Subject Prompt'}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="generated-subject-prompt" className="block text-sm font-medium text-text-secondary mb-1">Generated Subject Prompt</label>
                                <textarea id="generated-subject-prompt" value={subjectPrompt} onChange={(e) => dispatch(updatePromptGenState({ subjectPrompt: e.target.value }))} readOnly={isSubjectLoading} placeholder="Your generated subject prompt will appear here..." className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px] text-accent font-medium" rows={10}/>
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
                                <button onClick={() => handleUsePromptClick(subjectPrompt)} disabled={!subjectPrompt || isSubjectLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
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
                            {renderAnalysisControls(soupModelType, setSoupModelType)}
                            {(prompt || bgPrompt || subjectPrompt) && (
                                <div>
                                    <p className="mb-2 text-sm font-medium text-text-secondary">Soup Ingredients</p>
                                    <div className="space-y-2 rounded-md border border-border-primary bg-bg-primary p-3 text-xs">
                                        {prompt && <p className="whitespace-pre-wrap text-accent"><span className="font-bold">Main:</span> {prompt}</p>}
                                        {bgPrompt && <p className="whitespace-pre-wrap text-highlight-green"><span className="font-bold">Background:</span> {bgPrompt}</p>}
                                        {subjectPrompt && <p className="whitespace-pre-wrap text-highlight-yellow"><span className="font-bold">Subject:</span> {subjectPrompt}</p>}
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Creativity: {soupCreativity}</label>
                                <input type="range" min="0" max="1" step="0.1" value={soupCreativity} onChange={(e) => setSoupCreativity(parseFloat(e.target.value))} disabled={isSoupLoading} className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer" />
                                <p className="text-xs text-text-muted mt-1">Higher values lead to more unexpected combinations.</p>
                            </div>
                            <button onClick={handleGenerateSoup} disabled={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading || isOllamaUnavailable} style={(!prompt && !bgPrompt && !subjectPrompt) || isSoupLoading || isOllamaUnavailable ? {} : { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
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
                                <button onClick={() => handleSavePrompt(soupPrompt, 'soup', soupModelType, null, soupPromptParts)} disabled={!soupPrompt || isSoupLoading || soupPromptSaveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${soupPromptSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-primary text-text-secondary hover:bg-bg-tertiary-hover'}`}>
                                    {soupPromptSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : soupPromptSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                    {soupPromptSaveStatus === 'saved' ? 'Saved!' : 'Save'}
                                </button>
                                <button onClick={handleSoupCopy} disabled={!soupPrompt || isSoupLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                    <CopyIcon className="w-5 h-5" />{soupCopyButtonText}
                                </button>
                                <button onClick={() => handleUsePromptClick(soupPrompt)} disabled={!soupPrompt || isSoupLoading} className="flex items-center justify-center gap-2 bg-bg-primary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
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
            
            <div className="mt-8 pt-4 border-t border-danger-bg">
                <button onClick={onReset} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                    <ResetIcon className="w-5 h-5" /> Reset All Prompt Tools
                </button>
            </div>
             <PromptDestinationPickerModal
                isOpen={isPickerOpen}
                onClose={() => setPickerOpen(false)}
                prompt={promptToUse}
            />
        </div>
    );
};