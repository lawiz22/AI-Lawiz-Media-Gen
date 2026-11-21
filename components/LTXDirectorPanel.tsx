import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CheckIcon, CloseIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, PauseIcon, PlayIcon, SaveIcon, SpinnerIcon, UploadCloudIcon } from './icons';
import { calculateLtxResolution, generateLtxDirectorPrompt, generateLtxDirectorVideo, LTX_PROMPT_AUDIO_STYLES, LTX_PROMPT_CAMERA_STYLES, LTX_PROMPT_SUBTHEMES, LTX_PROMPT_THEMES, LTX_T2V_RESOLUTIONS, type LtxPromptAudioStyle, type LtxPromptCameraStyle, type LtxPromptSubtheme, type LtxPromptTheme } from '../services/comfyUIService';
import { createLtxDialogueInstruction, parseSpeakerTranscript, stripLtxDialogueInstruction } from '../utils/ttsTranscript';
import { addSessionTokenUsage, clearLtxTransfer } from '../store/appSlice';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LtxDirectorGenerationInfo } from '../types';
import { createVideoPlaceholderThumbnail, dataUrlToFile, dataUrlToThumbnail, fileToDataUrl, fileToResizedDataUrl, getAudioMimeType, normalizeAudioDataUrl, videoToThumbnail } from '../utils/imageUtils';
import { LibraryPickerModal } from './LibraryPickerModal';
import { Accordion } from './ui/Accordion';
import { NumberField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { ui } from './ui/styles';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { PresetSaveModal } from './PresetSaveModal';
import { findInventoryModel } from '../services/civitaiService';
import { getLtxDirectorModelLists, splitLtxTextEncoders } from '../services/ltxDirectorWorkflow';

interface LTXDirectorPanelProps {
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
}

interface DirectorSegment {
    id: string;
    image: File | null;
    imageUrl: string;
    prompt: string;
    ttsText?: string;
    durationSeconds: number;
}

interface DirectorLora {
    enabled: boolean;
    name: string;
    strength: number;
}

interface LtxPromptExample {
    positive: string;
    negative?: string;
    source: 'civitai' | 'archive' | 'huggingface';
}

interface LtxPromptExampleSource {
    modelPath: string;
    modelName: string;
    triggerWords?: string[];
    hasLocalPrompts: boolean;
    sources: Array<'civitai' | 'archive' | 'huggingface'>;
}

interface DirectorGenerationSnapshot {
    segments: {
        image: File | null;
        prompt: string;
        ttsText?: string;
        durationSeconds: number;
    }[];
    frameRate: number;
    guideStrength: number;
    t2vOrientation: 'landscape' | 'portrait';
    imageScalePercent: number;
    vaeDecodeMode: 'standard' | 'tiled';
    vaeTileSize: number;
    vaeOverlap: number;
    vaeTemporalSize: number;
    vaeTemporalOverlap: number;
    useCacheDit: boolean;
    cacheDitWarmupSteps: number;
    cacheDitSkipInterval: number;
    cacheDitNoiseScale: number;
    cacheDitPrintSummary: boolean;
    modelVersion: LtxModelVersion;
    checkpoint: string;
    textEncoder: string;
    videoVae: string;
    audioVae: string;
    latentUpscaler: string;
    loras: DirectorLora[];
    audioName?: string;
}

type LtxModelVersion = '2.3' | '2.5';

interface LtxModelProfile {
    checkpoint: string;
    textEncoder: string;
    videoVae: string;
    audioVae: string;
    latentUpscaler: string;
    cacheDitWarmupSteps: number;
    cacheDitSkipInterval: number;
    loras: DirectorLora[];
}

const LTX_MODEL_PROFILES: Record<LtxModelVersion, LtxModelProfile> = {
    '2.3': {
        checkpoint: 'LTX2\\sulphur2Base_distilled.safetensors',
        textEncoder: 'gemma312BAbliterated_v10aExperimental.safetensors + ltx-2.3_text_projection_bf16.safetensors',
        videoVae: 'LTX23_video_vae_bf16.safetensors',
        audioVae: 'LTX23_audio_vae_bf16.safetensors',
        latentUpscaler: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        cacheDitWarmupSteps: 6,
        cacheDitSkipInterval: 4,
        loras: [
            { enabled: true, name: 'LTX2\\ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors', strength: 1 },
            { enabled: true, name: 'LTX2\\LTX-2-Image2Vid-Adapter.safetensors', strength: 0.7 },
            { enabled: true, name: 'LTX2\\LTX2.3_reasoning_I2V_V3.safetensors', strength: 0.9 },
            { enabled: false, name: '', strength: 1 },
            { enabled: false, name: '', strength: 1 },
        ],
    },
    '2.5': {
        checkpoint: 'LTX-2.5-Distilled-Q4_K_M.gguf',
        textEncoder: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
        videoVae: 'ltx-2.5-video-vae-bf16.safetensors',
        audioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
        latentUpscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
        cacheDitWarmupSteps: 8,
        cacheDitSkipInterval: 3,
        loras: [
            { enabled: true, name: 'LTX2\\ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors', strength: 1 },
            { enabled: true, name: 'LTX2\\LTX-2.3-OmniNFT-RL-Lora_bf16.safetensors', strength: 0.8 },
            { enabled: true, name: 'LTX2\\ltx2.3-transition.safetensors', strength: 0.4 },
            { enabled: false, name: '', strength: 1 },
            { enabled: false, name: '', strength: 1 },
        ],
    },
};

const DEFAULT_CHECKPOINT = LTX_MODEL_PROFILES['2.3'].checkpoint;
const MIN_CLIP_DURATION = 3;
const MIN_AUDIO_CLIP_DURATION = 1;
const MAX_CLIP_DURATION = 15;
const clampClipDuration = (durationSeconds: number) => Math.min(MAX_CLIP_DURATION, Math.max(MIN_CLIP_DURATION, durationSeconds));
const includeTtsDialogue = (prompt: string, ttsText?: string): string => {
    const speakingCue = createLtxDialogueInstruction(ttsText);
    return !speakingCue || prompt.includes(speakingCue) ? prompt : `${prompt.trim()} ${speakingCue}`.trim();
};
const stripTtsDialogue = stripLtxDialogueInstruction;
const splitTranscript = (text: string | undefined, ratio: number): [string | undefined, string | undefined] => {
    const transcript = text?.trim();
    if (!transcript) return [undefined, undefined];
    const speakerLines = parseSpeakerTranscript(transcript);
    if (speakerLines.length > 1) {
        const target = transcript.length * ratio;
        const boundaries = [...transcript.matchAll(/\r?\n/g)]
            .map((match) => match.index)
            .filter((position) => position > 0 && position < transcript.length);
        const boundary = boundaries.sort((left, right) => Math.abs(left - target) - Math.abs(right - target))[0];
        if (boundary !== undefined) return [transcript.slice(0, boundary).trim(), transcript.slice(boundary).trim()];
    }
    const target = transcript.length * ratio;
    const wordBoundaries: number[] = [];
    const sentenceBoundaries: number[] = [];
    for (const match of transcript.matchAll(/\s+/g)) wordBoundaries.push(match.index);
    for (const match of transcript.matchAll(/[.!?。！？](?:\s+|$)/g)) sentenceBoundaries.push(match.index + match[0].trimEnd().length);
    const nearest = (boundaries: number[]) => boundaries
        .filter((position) => position > 0 && position < transcript.length)
        .sort((left, right) => Math.abs(left - target) - Math.abs(right - target))[0];
    const sentenceBoundary = nearest(sentenceBoundaries);
    const boundary = sentenceBoundary !== undefined && Math.abs(sentenceBoundary - target) <= transcript.length * 0.2
        ? sentenceBoundary
        : nearest(wordBoundaries) ?? Math.round(target);
    const left = transcript.slice(0, boundary).trim();
    const right = transcript.slice(boundary).trim();
    if (speakerLines.length === 1) {
        const prefix = `${speakerLines[0].speaker}: `;
        return [left, right.startsWith(prefix) ? right : `${prefix}${right}`];
    }
    return [left, right];
};
const getAudioDuration = (file: File): Promise<number> => new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const media = new Audio();
    const finish = (duration: number) => {
        URL.revokeObjectURL(objectUrl);
        resolve(Math.max(MIN_AUDIO_CLIP_DURATION, Math.round((duration || 5) * 10) / 10));
    };
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(5);
    media.src = objectUrl;
});
const DEFAULT_LORAS = LTX_MODEL_PROFILES['2.3'].loras;
const ghost = 'rounded-md border border-border-primary text-sm font-semibold text-text-secondary hover:border-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50';
const solid = 'rounded-md bg-accent font-bold text-accent-text hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40';
const toggle = (on: boolean) => `rounded px-3 text-xs font-semibold ${on ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'}`;

const getModelList = (widgetInfo: any): string[] => Array.isArray(widgetInfo?.[0]) ? widgetInfo[0] : Array.isArray(widgetInfo?.[1]?.options) ? widgetInfo[1].options : [];
const appendMissingTriggerWords = (prompt: string, triggerWords: string[] = []) => {
    const trimmedPrompt = prompt.trim();
    const normalizedPrompt = trimmedPrompt.toLowerCase();
    const additions = triggerWords.filter((word) => word.trim() && !normalizedPrompt.includes(word.trim().toLowerCase()));
    return additions.length ? `${trimmedPrompt}${trimmedPrompt ? ', ' : ''}${additions.join(', ')}` : trimmedPrompt;
};

export const LTXDirectorPanel: React.FC<LTXDirectorPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const pendingTransfer = useSelector((state: RootState) => state.app.pendingLtxTransfer);
    const { inventory: modelInventory } = useModelInventory();
    const imageInput = useRef<HTMLInputElement>(null);
    const audioInput = useRef<HTMLInputElement>(null);
    const audioPlayer = useRef<HTMLAudioElement>(null);
    const [segments, setSegments] = useState<DirectorSegment[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [audio, setAudio] = useState<File | null>(null);
    const [audioTimelineLocked, setAudioTimelineLocked] = useState(false);
    const [audioUrl, setAudioUrl] = useState('');
    const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
    const [playheadSeconds, setPlayheadSeconds] = useState(0);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [frameRate, setFrameRate] = useState(24);
    const [guideStrength, setGuideStrength] = useState(1);
    const [t2vOrientation, setT2vOrientation] = useState<'landscape' | 'portrait'>('landscape');
    const [imageScalePercent, setImageScalePercent] = useState(100);
    const [sourceResolution, setSourceResolution] = useState<{ width: number; height: number } | null>(null);
    const [vaeDecodeMode, setVaeDecodeMode] = useState<'standard' | 'tiled'>('tiled');
    const [vaeTileSize, setVaeTileSize] = useState(256);
    const [vaeOverlap, setVaeOverlap] = useState(64);
    const [vaeTemporalSize, setVaeTemporalSize] = useState(64);
    const [vaeTemporalOverlap, setVaeTemporalOverlap] = useState(4);
    const [useCacheDit, setUseCacheDit] = useState(true);
    const [cacheDitWarmupSteps, setCacheDitWarmupSteps] = useState(LTX_MODEL_PROFILES['2.3'].cacheDitWarmupSteps);
    const [cacheDitSkipInterval, setCacheDitSkipInterval] = useState(LTX_MODEL_PROFILES['2.3'].cacheDitSkipInterval);
    const [cacheDitNoiseScale, setCacheDitNoiseScale] = useState(0.001);
    const [cacheDitPrintSummary, setCacheDitPrintSummary] = useState(true);
    const [settingsReveal, setSettingsReveal] = useState(0);
    const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
    const [audioLibraryOpen, setAudioLibraryOpen] = useState(false);
    const [modelVersion, setModelVersion] = useState<LtxModelVersion>('2.3');
    const [checkpoint, setCheckpoint] = useState(DEFAULT_CHECKPOINT);
    const [textEncoder, setTextEncoder] = useState(LTX_MODEL_PROFILES['2.3'].textEncoder);
    const [videoVae, setVideoVae] = useState(LTX_MODEL_PROFILES['2.3'].videoVae);
    const [audioVae, setAudioVae] = useState(LTX_MODEL_PROFILES['2.3'].audioVae);
    const [latentUpscaler, setLatentUpscaler] = useState(LTX_MODEL_PROFILES['2.3'].latentUpscaler);
    const [loras, setLoras] = useState<DirectorLora[]>(DEFAULT_LORAS);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [generationSnapshot, setGenerationSnapshot] = useState<DirectorGenerationSnapshot | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [presetSaveOpen, setPresetSaveOpen] = useState(false);
    const [presetStatus, setPresetStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [promptTheme, setPromptTheme] = useState<LtxPromptTheme>('surprise');
    const [promptSubtheme, setPromptSubtheme] = useState<LtxPromptSubtheme>('surprise');
    const [promptCameraStyle, setPromptCameraStyle] = useState<LtxPromptCameraStyle>('surprise');
    const [promptAudioStyle, setPromptAudioStyle] = useState<LtxPromptAudioStyle>('natural');
    const [promptRelationship, setPromptRelationship] = useState<'continuation' | 'new'>('continuation');
    const [keepTtsDialogue, setKeepTtsDialogue] = useState(true);
    const [useTtsAsPromptContext, setUseTtsAsPromptContext] = useState(true);
    const [promptLoadingId, setPromptLoadingId] = useState('');
    const [promptError, setPromptError] = useState('');
    const [promptExampleSources, setPromptExampleSources] = useState<LtxPromptExampleSource[]>([]);
    const [activePromptExampleSource, setActivePromptExampleSource] = useState<LtxPromptExampleSource | null>(null);
    const [promptExamples, setPromptExamples] = useState<LtxPromptExample[]>([]);
    const [promptExamplesOpen, setPromptExamplesOpen] = useState(false);
    const [promptExamplesLoading, setPromptExamplesLoading] = useState(false);
    const [promptExamplesError, setPromptExamplesError] = useState('');
    const [promptExamplesStorage, setPromptExamplesStorage] = useState<'sidecar' | 'remote' | null>(null);
    const [promptExamplesSaving, setPromptExamplesSaving] = useState(false);

    const selectedSegment = segments.find((segment) => segment.id === selectedId) || segments[0];
    const firstImageSegment = segments.find((segment) => segment.image);
    const isTextToVideo = !firstImageSegment;
    const baseResolution = sourceResolution || LTX_T2V_RESOLUTIONS[t2vOrientation];
    const outputResolution = calculateLtxResolution(baseResolution.width, baseResolution.height, imageScalePercent);
    const totalDuration = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
    const selectedIndex = selectedSegment ? segments.indexOf(selectedSegment) : -1;
    const selectedStart = selectedIndex > 0 ? segments.slice(0, selectedIndex).reduce((total, segment) => total + segment.durationSeconds, 0) : 0;
    const canSplitAtPlayhead = Boolean(selectedSegment
        && playheadSeconds - selectedStart >= MIN_AUDIO_CLIP_DURATION
        && selectedStart + selectedSegment.durationSeconds - playheadSeconds >= MIN_AUDIO_CLIP_DURATION);
    const modelLists = useMemo(() => getLtxDirectorModelLists(comfyUIObjectInfo), [comfyUIObjectInfo]);
    const checkpoints = useMemo(() => Array.from(new Set([
        checkpoint, LTX_MODEL_PROFILES[modelVersion].checkpoint, ...modelLists.checkpoints,
    ].filter(Boolean))), [checkpoint, modelLists, modelVersion]);
    const dualTextEncoders = modelVersion === '2.3' ? splitLtxTextEncoders(textEncoder) : null;
    const textEncoderModels = useMemo(() => {
        const selected = modelVersion === '2.3' ? splitLtxTextEncoders(textEncoder) : [textEncoder];
        const defaults = modelVersion === '2.3'
            ? splitLtxTextEncoders(LTX_MODEL_PROFILES[modelVersion].textEncoder)
            : [LTX_MODEL_PROFILES[modelVersion].textEncoder];
        return Array.from(new Set([...selected, ...defaults, ...modelLists.textEncoders].filter(Boolean)));
    }, [modelLists, modelVersion, textEncoder]);
    const vaeModels = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.VAELoaderKJ?.input?.required?.vae_name);
        return Array.from(new Set([videoVae, audioVae, ...models].filter(Boolean)));
    }, [audioVae, comfyUIObjectInfo, videoVae]);
    const latentUpscalerModels = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.LatentUpscaleModelLoader?.input?.required?.model_name);
        return Array.from(new Set([latentUpscaler, ...models].filter(Boolean)));
    }, [comfyUIObjectInfo, latentUpscaler]);
    const loraModels = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name);
        return Array.from(new Set([
            ...loras.map((lora) => lora.name).filter(Boolean),
            ...DEFAULT_LORAS.map((lora) => lora.name).filter(Boolean),
            ...models,
        ].filter(Boolean))).sort((left, right) => left.localeCompare(right));
    }, [comfyUIObjectInfo, loras]);

    const selectedLoraKey = loras.filter((lora) => lora.enabled && lora.name).map((lora) => lora.name).join('\u0000');

    useEffect(() => {
        const imageUrl = firstImageSegment?.imageUrl;
        if (!imageUrl) {
            setSourceResolution(null);
            return;
        }
        let active = true;
        const image = new Image();
        image.onload = () => {
            if (active) setSourceResolution({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
            if (active) setSourceResolution(null);
        };
        image.src = imageUrl;
        return () => { active = false; };
    }, [firstImageSegment?.imageUrl]);

    useEffect(() => {
        let active = true;
        setPromptExampleSources([]);
        if (!window.electron || !selectedLoraKey) return () => { active = false; };
        const loadSources = async () => {
            const inventory = await window.electron!.getCivitaiInventory().catch(() => undefined);
            if (!inventory) return;
            const sources = await Promise.all(loras.filter((lora) => lora.enabled && lora.name).map(async (lora) => {
                const item = findInventoryModel(inventory, lora.name);
                if (!item) return null;
                return {
                    modelPath: item.path,
                    modelName: item.modelName || item.fileName,
                    triggerWords: item.usageMetadata?.triggerWords,
                    hasLocalPrompts: await window.electron!.hasLocalModelPromptExamples(item.path).catch(() => false),
                    sources: ['civitai', 'archive', 'huggingface'] as Array<'civitai' | 'archive' | 'huggingface'>,
                };
            }));
            if (active) setPromptExampleSources(sources.filter((source): source is LtxPromptExampleSource => Boolean(source)));
        };
        void loadSources();
        return () => { active = false; };
    }, [selectedLoraKey]);

    const openPromptExamples = async (source: LtxPromptExampleSource) => {
        if (!window.electron) return;
        setActivePromptExampleSource(source);
        setPromptExamplesOpen(true);
        setPromptExamplesLoading(true);
        setPromptExamplesError('');
        setPromptExamples([]);
        setPromptExamplesStorage(null);
        try {
            const result = await window.electron.getLocalModelPromptExamples({ modelPath: source.modelPath, provider: 'regular', sources: source.sources });
            setPromptExamples(result.examples);
            setPromptExamplesStorage(result.storage);
        } catch (promptExampleError) {
            setPromptExamplesError(promptExampleError instanceof Error ? promptExampleError.message : 'Prompt examples could not be loaded.');
        } finally {
            setPromptExamplesLoading(false);
        }
    };

    const savePromptExamples = async () => {
        if (!window.electron || !activePromptExampleSource || !promptExamples.length) return;
        setPromptExamplesSaving(true);
        try {
            await window.electron.saveLocalModelPromptExamples({ modelPath: activePromptExampleSource.modelPath, examples: promptExamples });
            setPromptExamplesStorage('sidecar');
            setPromptExampleSources((current) => current.map((source) => source.modelPath === activePromptExampleSource.modelPath ? { ...source, hasLocalPrompts: true } : source));
        } catch (promptExampleError) {
            setPromptExamplesError(promptExampleError instanceof Error ? promptExampleError.message : 'Prompt examples could not be saved.');
        } finally {
            setPromptExamplesSaving(false);
        }
    };

    const applyPromptExample = (example: LtxPromptExample) => {
        if (!selectedSegment) return;
        updateSegment(selectedSegment.id, { prompt: appendMissingTriggerWords(example.positive, activePromptExampleSource?.triggerWords) });
        setPromptExamplesOpen(false);
    };

    useEffect(() => {
        if (!audio) {
            setAudioUrl('');
            setWaveformPeaks([]);
            setPlayheadSeconds(0);
            setIsAudioPlaying(false);
            return;
        }
        const objectUrl = URL.createObjectURL(audio);
        let cancelled = false;
        setAudioUrl(objectUrl);
        setPlayheadSeconds(0);
        const decode = async () => {
            const context = new AudioContext();
            try {
                const buffer = await context.decodeAudioData(await audio.arrayBuffer());
                const channel = buffer.getChannelData(0);
                const barCount = 180;
                const blockSize = Math.max(1, Math.floor(channel.length / barCount));
                const peaks = Array.from({ length: barCount }, (_, index) => {
                    let peak = 0;
                    const end = Math.min(channel.length, (index + 1) * blockSize);
                    for (let sample = index * blockSize; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]));
                    return peak;
                });
                const maximum = Math.max(...peaks, 0.01);
                if (!cancelled) setWaveformPeaks(peaks.map((peak) => Math.max(0.08, peak / maximum)));
            } catch {
                if (!cancelled) setWaveformPeaks(Array.from({ length: 180 }, () => 0.15));
            } finally {
                void context.close();
            }
        };
        void decode();
        return () => {
            cancelled = true;
            URL.revokeObjectURL(objectUrl);
        };
    }, [audio]);

    useEffect(() => {
        if (!pendingTransfer) return;
        if (pendingTransfer.selectedCheckpoint || pendingTransfer.selectedLora) {
            if (pendingTransfer.selectedCheckpoint) setCheckpoint(pendingTransfer.selectedCheckpoint);
            if (pendingTransfer.selectedLora) {
                setLoras((current) => {
                    const next = [
                        ...current,
                        ...Array.from({ length: Math.max(0, 4 - current.length) }, () => ({ enabled: false, name: '', strength: 1 })),
                    ];
                    next[3] = { enabled: true, name: pendingTransfer.selectedLora!, strength: 1 };
                    return next;
                });
            }
            setSettingsReveal((count) => count + 1);
            setError('');
            dispatch(clearLtxTransfer());
            return;
        }
        if (pendingTransfer.directorOptions) {
            let cancelled = false;
            const restoreProject = async () => {
                const options = pendingTransfer.directorOptions!;
                const restoredSegments = await Promise.all(options.segments.map(async (segment, index) => {
                    const imageDataUrl = segment.sourceImage || (segment.hasSourceImage ? pendingTransfer.imageDataUrl : undefined);
                    const image = imageDataUrl ? await dataUrlToFile(imageDataUrl, `ltx-source-${index + 1}.jpg`) : null;
                    return {
                        id: crypto.randomUUID(),
                        image,
                        imageUrl: image ? URL.createObjectURL(image) : '',
                        prompt: segment.prompt,
                        ttsText: segment.ttsText,
                        durationSeconds: clampClipDuration(segment.durationSeconds),
                    };
                }));
                if (cancelled) {
                    restoredSegments.forEach((segment) => segment.imageUrl && URL.revokeObjectURL(segment.imageUrl));
                    return;
                }
                setSegments((current) => {
                    current.forEach((segment) => segment.imageUrl && URL.revokeObjectURL(segment.imageUrl));
                    return restoredSegments;
                });
                setSelectedId(restoredSegments[0]?.id || '');
                const restoredModelVersion = options.modelVersion || '2.3';
                const restoredProfile = LTX_MODEL_PROFILES[restoredModelVersion];
                setModelVersion(restoredModelVersion);
                setFrameRate(options.frameRate);
                setGuideStrength(options.guideStrength);
                setT2vOrientation(options.t2vOrientation ?? 'landscape');
                setImageScalePercent(options.imageScalePercent ?? 100);
                setVaeDecodeMode(options.vaeDecodeMode || 'tiled');
                setVaeTileSize(options.vaeTileSize ?? 256);
                setVaeOverlap(options.vaeOverlap ?? 64);
                setVaeTemporalSize(options.vaeTemporalSize ?? 64);
                setVaeTemporalOverlap(options.vaeTemporalOverlap ?? 4);
                setUseCacheDit(options.useCacheDit ?? true);
                setCacheDitWarmupSteps(options.cacheDitWarmupSteps ?? restoredProfile.cacheDitWarmupSteps);
                setCacheDitSkipInterval(options.cacheDitSkipInterval ?? restoredProfile.cacheDitSkipInterval);
                setCacheDitNoiseScale(options.cacheDitNoiseScale ?? 0.001);
                setCacheDitPrintSummary(options.cacheDitPrintSummary ?? true);
                setCheckpoint(options.checkpoint);
                setTextEncoder(options.textEncoder || restoredProfile.textEncoder);
                setVideoVae(options.videoVae || restoredProfile.videoVae);
                setAudioVae(options.audioVae || restoredProfile.audioVae);
                setLatentUpscaler(options.latentUpscaler || restoredProfile.latentUpscaler);
                setLoras([
                    ...options.loras.slice(0, 5).map((lora) => ({ enabled: true, ...lora })),
                    ...Array.from({ length: Math.max(0, 5 - options.loras.length) }, () => ({ enabled: false, name: '', strength: 1 })),
                ]);
                setAudio(null);
                setVideoUrl(pendingTransfer.videoDataUrl || '');
                setGenerationSnapshot(null);
                setSaveStatus(pendingTransfer.videoDataUrl ? 'saved' : 'idle');
                setError('');
                dispatch(clearLtxTransfer());
            };
            restoreProject().catch((restoreError) => {
                if (!cancelled) {
                    setError(restoreError instanceof Error ? restoreError.message : 'Could not restore the LTX Director project.');
                    dispatch(clearLtxTransfer());
                }
            });
            return () => { cancelled = true; };
        }
        if (pendingTransfer.audioDataUrl) {
            let cancelled = false;
            const restoreTtsResult = async () => {
                const transferredAudio = await dataUrlToFile(pendingTransfer.audioDataUrl!, pendingTransfer.audioName || 'tts-result.wav');
                const durationSeconds = await getAudioDuration(transferredAudio);
                if (cancelled) return;
                const transferredSegments = pendingTransfer.ttsSegments?.filter((segment) => segment.ttsText.trim()) || [];
                const characterCount = transferredSegments.reduce((total, segment) => total + segment.ttsText.length, 0);
                const minimumDuration = durationSeconds >= transferredSegments.length ? MIN_AUDIO_CLIP_DURATION : 0;
                const distributedDuration = Math.max(0, durationSeconds - minimumDuration * transferredSegments.length);
                const restoredSegments: DirectorSegment[] = transferredSegments.length
                    ? await Promise.all(transferredSegments.map(async (segment, index) => {
                        const image = segment.imageDataUrl ? await dataUrlToFile(segment.imageDataUrl, `tts-character-${index + 1}.jpg`) : null;
                        const weightedDuration = minimumDuration + distributedDuration * (segment.ttsText.length / Math.max(1, characterCount));
                        return {
                            id: crypto.randomUUID(),
                            image,
                            imageUrl: image ? URL.createObjectURL(image) : '',
                            prompt: includeTtsDialogue(stripTtsDialogue(segment.prompt), segment.ttsText),
                            ttsText: segment.ttsText,
                            durationSeconds: Math.round(weightedDuration * 10) / 10,
                        };
                    }))
                    : [{
                        id: pendingTransfer.id,
                        image: null,
                        imageUrl: '',
                        prompt: includeTtsDialogue(stripTtsDialogue(pendingTransfer.prompt || ''), pendingTransfer.ttsText),
                        ttsText: pendingTransfer.ttsText,
                        durationSeconds,
                    }];
                const durationDifference = Math.round((durationSeconds - restoredSegments.reduce((total, segment) => total + segment.durationSeconds, 0)) * 10) / 10;
                restoredSegments[restoredSegments.length - 1].durationSeconds += durationDifference;
                setSegments((current) => {
                    current.forEach((item) => item.imageUrl && URL.revokeObjectURL(item.imageUrl));
                    return restoredSegments;
                });
                setSelectedId(restoredSegments[0].id);
                setAudio(transferredAudio);
                setAudioTimelineLocked(true);
                setKeepTtsDialogue(true);
                setVideoUrl('');
                setGenerationSnapshot(null);
                setSaveStatus('idle');
                setError('');
                dispatch(clearLtxTransfer());
            };
            restoreTtsResult().catch((restoreError) => {
                if (!cancelled) {
                    setError(restoreError instanceof Error ? restoreError.message : 'Could not load the TTS result into LTX Director.');
                    dispatch(clearLtxTransfer());
                }
            });
            return () => { cancelled = true; };
        }
        if (!pendingTransfer.imageDataUrl) {
            const segment: DirectorSegment = {
                id: pendingTransfer.id,
                image: null,
                imageUrl: '',
                prompt: pendingTransfer.prompt || '',
                durationSeconds: pendingTransfer.promptDurationSeconds ?? 5,
            };
            setSegments((current) => current.some((item) => item.id === segment.id) ? current : [...current, segment]);
            setSelectedId(segment.id);
            dispatch(clearLtxTransfer());
            return;
        }
        let cancelled = false;
        dataUrlToFile(pendingTransfer.imageDataUrl, `ltx-source-${pendingTransfer.id}.png`)
            .then((image) => {
                if (cancelled) return;
                const segment: DirectorSegment = {
                    id: pendingTransfer.id,
                    image,
                    imageUrl: URL.createObjectURL(image),
                    prompt: pendingTransfer.prompt || '',
                    durationSeconds: pendingTransfer.promptDurationSeconds ?? 5,
                };
                setSegments((current) => current.some((item) => item.id === segment.id) ? current : [...current, segment]);
                setSelectedId(segment.id);
                dispatch(clearLtxTransfer());
            })
            .catch(cause => {
                if (!cancelled) {
                    setError(`Could not load the first-frame image into LTX Director: ${cause instanceof Error ? cause.message : String(cause)}`);
                    dispatch(clearLtxTransfer());
                }
            });
        return () => { cancelled = true; };
    }, [dispatch, pendingTransfer]);

    const addImageFiles = (files: File[]) => {
        if (!files.length) return;
        if (audioTimelineLocked && segments.length) {
            const selectedIndex = Math.max(0, segments.findIndex((segment) => segment.id === selectedSegment?.id));
            setSegments((current) => current.map((segment, index) => {
                const image = files[index - selectedIndex];
                if (!image || index < selectedIndex) return segment;
                if (segment.imageUrl) URL.revokeObjectURL(segment.imageUrl);
                return { ...segment, image, imageUrl: URL.createObjectURL(image) };
            }));
            if (imageInput.current) imageInput.current.value = '';
            return;
        }
        const additions = files.map((image) => ({
            id: crypto.randomUUID(), image, imageUrl: URL.createObjectURL(image), prompt: '', durationSeconds: 5,
        }));
        setSegments((current) => [...current, ...additions]);
        setSelectedId(additions[0].id);
        if (imageInput.current) imageInput.current.value = '';
    };

    const addImages = (files: FileList | null) => addImageFiles(files ? Array.from(files) : []);

    const selectLibraryImage = async (item: LibraryItem) => {
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error(`Could not read the selected image (${response.status}).`);
            const blob = await response.blob();
            const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
            const name = `${(item.name || 'library-image').replace(/\.[^/.]+$/, '')}.${extension}`;
            addImageFiles([new File([blob], name, { type: blob.type || `image/${extension}` })]);
            setError('');
        } catch (selectionError) {
            setError(selectionError instanceof Error ? selectionError.message : 'Could not load the selected library image.');
        }
    };

    const addPromptClip = () => {
        if (audioTimelineLocked && selectedSegment) {
            const segmentStart = segments.slice(0, segments.indexOf(selectedSegment)).reduce((total, segment) => total + segment.durationSeconds, 0);
            splitSelectedClip(segmentStart + selectedSegment.durationSeconds / 2);
            return;
        }
        const segment: DirectorSegment = {
            id: crypto.randomUUID(), image: null, imageUrl: '', prompt: '', durationSeconds: 5,
        };
        setSegments((current) => [...current, segment]);
        setSelectedId(segment.id);
    };

    const updateSegment = (id: string, changes: Partial<DirectorSegment>) => {
        setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, ...changes } : segment));
    };

    const beginResize = (event: React.PointerEvent, segment: DirectorSegment) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(segment.id);
        const startX = event.clientX;
        const startDuration = segment.durationSeconds;
        const segmentIndex = segments.findIndex((item) => item.id === segment.id);
        const nextSegment = segments[segmentIndex + 1];
        const nextStartDuration = nextSegment?.durationSeconds || 0;
        const resize = (pointerEvent: PointerEvent) => {
            if (audioTimelineLocked) {
                if (!nextSegment) return;
                const requested = Math.round((startDuration + (pointerEvent.clientX - startX) / 35) * 10) / 10;
                const durationSeconds = Math.max(MIN_AUDIO_CLIP_DURATION, Math.min(startDuration + nextStartDuration - MIN_AUDIO_CLIP_DURATION, requested));
                const combinedTranscript = [segment.ttsText, nextSegment.ttsText].filter(Boolean).join(' ');
                const [leftText, rightText] = splitTranscript(combinedTranscript, durationSeconds / (startDuration + nextStartDuration));
                setSegments((current) => current.map((item) => item.id === segment.id
                    ? { ...item, durationSeconds, ttsText: leftText, prompt: includeTtsDialogue(stripTtsDialogue(item.prompt), leftText) }
                    : item.id === nextSegment.id ? {
                        ...item,
                        durationSeconds: startDuration + nextStartDuration - durationSeconds,
                        ttsText: rightText,
                        prompt: includeTtsDialogue(stripTtsDialogue(item.prompt), rightText),
                    } : item));
                return;
            }
            const durationSeconds = clampClipDuration(Math.round((startDuration + (pointerEvent.clientX - startX) / 35) * 2) / 2);
            updateSegment(segment.id, { durationSeconds });
        };
        const finish = () => {
            document.removeEventListener('pointermove', resize);
            document.removeEventListener('pointerup', finish);
        };
        document.addEventListener('pointermove', resize);
        document.addEventListener('pointerup', finish);
    };

    const splitSelectedClip = (timelineTime = playheadSeconds) => {
        if (!selectedSegment) return;
        const selectedIndex = segments.findIndex((segment) => segment.id === selectedSegment.id);
        const segmentStart = segments.slice(0, selectedIndex).reduce((total, segment) => total + segment.durationSeconds, 0);
        const localTime = timelineTime - segmentStart;
        if (localTime < MIN_AUDIO_CLIP_DURATION || selectedSegment.durationSeconds - localTime < MIN_AUDIO_CLIP_DURATION) return;
        const leftDuration = Math.round(localTime * 10) / 10;
        const rightDuration = Math.round((selectedSegment.durationSeconds - leftDuration) * 10) / 10;
        const [leftText, rightText] = splitTranscript(selectedSegment.ttsText, leftDuration / selectedSegment.durationSeconds);
        const visualPrompt = stripTtsDialogue(selectedSegment.prompt);
        const rightSegment: DirectorSegment = {
            id: crypto.randomUUID(),
            image: null,
            imageUrl: '',
            prompt: includeTtsDialogue(visualPrompt, rightText),
            ttsText: rightText,
            durationSeconds: rightDuration,
        };
        setSegments((current) => current.flatMap((segment) => segment.id === selectedSegment.id
            ? [{ ...segment, prompt: includeTtsDialogue(visualPrompt, leftText), ttsText: leftText, durationSeconds: leftDuration }, rightSegment]
            : segment));
        setSelectedId(rightSegment.id);
    };

    const removeSegment = (id: string) => {
        const removed = segments.find((segment) => segment.id === id);
        if (removed?.imageUrl) URL.revokeObjectURL(removed.imageUrl);
        if (audioTimelineLocked && removed && segments.length > 1) {
            const removedIndex = segments.indexOf(removed);
            const targetIndex = removedIndex > 0 ? removedIndex - 1 : 1;
            const target = segments[targetIndex];
            const mergedText = removedIndex > 0
                ? [target.ttsText, removed.ttsText].filter(Boolean).join(' ')
                : [removed.ttsText, target.ttsText].filter(Boolean).join(' ');
            setSegments((current) => current
                .filter((segment) => segment.id !== id)
                .map((segment) => segment.id === target.id ? {
                    ...segment,
                    durationSeconds: segment.durationSeconds + removed.durationSeconds,
                    ttsText: mergedText || undefined,
                    prompt: includeTtsDialogue(stripTtsDialogue(segment.prompt), mergedText),
                } : segment));
            setSelectedId(target.id);
            return;
        }
        const remaining = segments.filter((segment) => segment.id !== id);
        setSegments(remaining);
        setSelectedId(remaining[0]?.id || '');
    };

    const handleAudioFile = async (file: File | null) => {
        setAudio(file);
        setAudioTimelineLocked(false);
    };

    const selectLibraryAudio = async (item: LibraryItem) => {
        try {
            const response = await fetch(normalizeAudioDataUrl(item.media));
            if (!response.ok) throw new Error(`Could not read the selected audio (${response.status}).`);
            const blob = await response.blob();
            const mimeType = getAudioMimeType(item.name || '', blob.type);
            const extension = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/flac' ? 'flac' : mimeType === 'audio/ogg' ? 'ogg' : mimeType === 'audio/mp4' ? 'm4a' : 'wav';
            const name = `${(item.name || 'library-audio').replace(/\.[^/.]+$/, '')}.${extension}`;
            await handleAudioFile(new File([blob], name, { type: mimeType }));
            setError('');
        } catch (selectionError) {
            setError(selectionError instanceof Error ? selectionError.message : 'Could not load the selected library audio.');
        }
    };

    const seekAudio = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!audioPlayer.current || !totalDuration) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const nextTime = Math.max(0, Math.min(totalDuration, ((event.clientX - bounds.left) / bounds.width) * totalDuration));
        audioPlayer.current.currentTime = nextTime;
        setPlayheadSeconds(nextTime);
        const index = segments.findIndex((segment, segmentIndex) => {
            const start = segments.slice(0, segmentIndex).reduce((sum, item) => sum + item.durationSeconds, 0);
            return nextTime >= start && nextTime <= start + segment.durationSeconds;
        });
        if (index >= 0) setSelectedId(segments[index].id);
    };

    const toggleAudioPlayback = () => {
        if (!audioPlayer.current) return;
        if (audioPlayer.current.paused) void audioPlayer.current.play();
        else audioPlayer.current.pause();
    };

    const updateLora = (index: number, changes: Partial<DirectorLora>) => {
        setLoras((current) => current.map((lora, loraIndex) => loraIndex === index ? { ...lora, ...changes } : lora));
    };

    const changeModelVersion = (nextVersion: LtxModelVersion) => {
        if (nextVersion === modelVersion) return;
        const profile = LTX_MODEL_PROFILES[nextVersion];
        setModelVersion(nextVersion);
        setCheckpoint(profile.checkpoint);
        setTextEncoder(profile.textEncoder);
        setVideoVae(profile.videoVae);
        setAudioVae(profile.audioVae);
        setLatentUpscaler(profile.latentUpscaler);
        setCacheDitWarmupSteps(profile.cacheDitWarmupSteps);
        setCacheDitSkipInterval(profile.cacheDitSkipInterval);
        setLoras(profile.loras.map((lora) => ({ ...lora })));
        setSettingsReveal((count) => count + 1);
        setError('');
    };

    const generateSegmentPrompt = async (segment: DirectorSegment) => {
        if (promptLoadingId) return;
        const segmentIndex = segments.findIndex((item) => item.id === segment.id);
        const previousPrompt = segmentIndex > 0 ? segments[segmentIndex - 1].prompt.trim() : '';
        const shouldContinue = segmentIndex > 0 && promptRelationship === 'continuation';
        if (shouldContinue && !previousPrompt) {
            setPromptError(`Generate or write the prompt for clip ${segmentIndex} before continuing its story.`);
            return;
        }
        setPromptLoadingId(segment.id);
        setPromptError('');
        try {
            const result = await generateLtxDirectorPrompt(
                segment.image,
                promptTheme,
                promptSubtheme,
                promptCameraStyle,
                promptAudioStyle,
                segment.durationSeconds,
                shouldContinue ? (useTtsAsPromptContext ? previousPrompt : stripTtsDialogue(previousPrompt)) : undefined,
                keepTtsDialogue ? segment.ttsText : undefined,
                useTtsAsPromptContext ? segment.ttsText : undefined,
            );
            updateSegment(segment.id, { prompt: result.text });
            if (result.usageMetadata) dispatch(addSessionTokenUsage(result.usageMetadata));
        } catch (promptGenerationError) {
            setPromptError(promptGenerationError instanceof Error ? promptGenerationError.message : 'Could not generate an LTX prompt.');
        } finally {
            setPromptLoadingId('');
        }
    };

    const generate = async () => {
        if (!segments.length || segments.some((segment) => !segment.prompt.trim()) || !isComfyUIConnected) return;
        setIsGenerating(true);
        setError('');
        setVideoUrl('');
        setGenerationSnapshot(null);
        setSaveStatus('idle');
        const preparedSegments = segments.map(({ image, prompt, ttsText, durationSeconds }) => ({
            image,
            ttsText,
            prompt: keepTtsDialogue ? includeTtsDialogue(prompt, ttsText) : prompt.trim(),
            durationSeconds,
        }));
        setSegments((current) => current.map((segment) => ({ ...segment, prompt: keepTtsDialogue ? includeTtsDialogue(segment.prompt, segment.ttsText) : segment.prompt })));
        const snapshot: DirectorGenerationSnapshot = {
            segments: preparedSegments,
            frameRate,
            guideStrength,
            t2vOrientation,
            imageScalePercent,
            vaeDecodeMode,
            vaeTileSize,
            vaeOverlap,
            vaeTemporalSize,
            vaeTemporalOverlap,
            useCacheDit,
            cacheDitWarmupSteps,
            cacheDitSkipInterval,
            cacheDitNoiseScale,
            cacheDitPrintSummary,
            modelVersion,
            checkpoint,
            textEncoder,
            videoVae,
            audioVae,
            latentUpscaler,
            loras: loras.filter((lora) => lora.enabled).map((lora) => ({ ...lora })),
            audioName: audio?.name,
        };
        try {
            const result = await generateLtxDirectorVideo(
                snapshot.segments,
                audio,
                {
                    modelVersion: snapshot.modelVersion,
                    t2vOrientation: snapshot.t2vOrientation,
                    frameRate: snapshot.frameRate,
                    guideStrength: snapshot.guideStrength,
                    imageScalePercent: snapshot.imageScalePercent,
                    vaeDecodeMode: snapshot.vaeDecodeMode,
                    vaeTileSize: snapshot.vaeTileSize,
                    vaeOverlap: snapshot.vaeOverlap,
                    vaeTemporalSize: snapshot.vaeTemporalSize,
                    vaeTemporalOverlap: snapshot.vaeTemporalOverlap,
                    useCacheDit: snapshot.useCacheDit,
                    cacheDitWarmupSteps: snapshot.cacheDitWarmupSteps,
                    cacheDitSkipInterval: snapshot.cacheDitSkipInterval,
                    cacheDitNoiseScale: snapshot.cacheDitNoiseScale,
                    cacheDitPrintSummary: snapshot.cacheDitPrintSummary,
                    checkpoint: snapshot.checkpoint,
                    textEncoder: snapshot.textEncoder,
                    videoVae: snapshot.videoVae,
                    audioVae: snapshot.audioVae,
                    latentUpscaler: snapshot.latentUpscaler,
                    loras: snapshot.loras,
                },
                (message, value) => { setProgressMessage(message); setProgress(value); },
            );
            setVideoUrl(result);
            setGenerationSnapshot(snapshot);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'LTX Director generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    const saveVideoToLibrary = async () => {
        if (!videoUrl || !generationSnapshot || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        setError('');
        try {
            const response = await fetch(videoUrl);
            if (!response.ok) throw new Error(`Could not read the generated video (${response.status}).`);
            const videoBlob = await response.blob();
            const videoFile = new File([videoBlob], 'ltx-director.mp4', { type: videoBlob.type || 'video/mp4' });
            const media = await fileToDataUrl(videoFile);
            const firstSourceImage = generationSnapshot.segments.find((segment) => segment.image)?.image || null;
            const sourceImage = firstSourceImage ? await fileToResizedDataUrl(firstSourceImage, 512) : undefined;
            const thumbnail = firstSourceImage
                ? await dataUrlToThumbnail(await fileToDataUrl(firstSourceImage), 256)
                : await videoToThumbnail(videoFile, 256).catch(() => createVideoPlaceholderThumbnail());
                const savedSegments = await Promise.all(generationSnapshot.segments.map(async ({ image, prompt, ttsText, durationSeconds }) => ({
                    prompt,
                    ttsText,
                    durationSeconds,
                    hasSourceImage: !!image,
                    sourceImage: image ? await fileToResizedDataUrl(image, 512) : undefined,
                })));
            const ltxDirectorOptions: LtxDirectorGenerationInfo = {
                segments: savedSegments,
                frameRate: generationSnapshot.frameRate,
                guideStrength: generationSnapshot.guideStrength,
                t2vOrientation: generationSnapshot.t2vOrientation,
                imageScalePercent: generationSnapshot.imageScalePercent,
                vaeDecodeMode: generationSnapshot.vaeDecodeMode,
                vaeTileSize: generationSnapshot.vaeTileSize,
                vaeOverlap: generationSnapshot.vaeOverlap,
                vaeTemporalSize: generationSnapshot.vaeTemporalSize,
                vaeTemporalOverlap: generationSnapshot.vaeTemporalOverlap,
                useCacheDit: generationSnapshot.useCacheDit,
                cacheDitWarmupSteps: generationSnapshot.cacheDitWarmupSteps,
                cacheDitSkipInterval: generationSnapshot.cacheDitSkipInterval,
                cacheDitNoiseScale: generationSnapshot.cacheDitNoiseScale,
                cacheDitPrintSummary: generationSnapshot.cacheDitPrintSummary,
                modelVersion: generationSnapshot.modelVersion,
                checkpoint: generationSnapshot.checkpoint,
                textEncoder: generationSnapshot.textEncoder,
                videoVae: generationSnapshot.videoVae,
                audioVae: generationSnapshot.audioVae,
                latentUpscaler: generationSnapshot.latentUpscaler,
                loras: generationSnapshot.loras.map(({ name, strength }) => ({ name, strength })),
                audioName: generationSnapshot.audioName,
            };
            const titlePrompt = generationSnapshot.segments[0]?.prompt.split(/\s+/).slice(0, 6).join(' ') || 'Untitled';
            const item: Omit<LibraryItem, 'id'> = {
                name: `LTX Director - ${titlePrompt}`,
                mediaType: 'video',
                media,
                thumbnail,
                startFrame: sourceImage,
                sourceImage,
                ltxDirectorOptions,
            };
            await dispatch(addToLibrary(item)).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Failed to save the LTX Director video.');
        }
    };

    const createDirectorOptions = async (): Promise<LtxDirectorGenerationInfo> => ({
        segments: await Promise.all(segments.map(async ({ image, prompt, ttsText, durationSeconds }) => ({
            prompt,
            ttsText,
            durationSeconds,
            hasSourceImage: Boolean(image),
            sourceImage: image ? await fileToResizedDataUrl(image, 512) : undefined,
        }))),
        frameRate,
        guideStrength,
        t2vOrientation,
        imageScalePercent,
        vaeDecodeMode,
        vaeTileSize,
        vaeOverlap,
        vaeTemporalSize,
        vaeTemporalOverlap,
        useCacheDit,
        cacheDitWarmupSteps,
        cacheDitSkipInterval,
        cacheDitNoiseScale,
        cacheDitPrintSummary,
        modelVersion,
        checkpoint,
        textEncoder,
        videoVae,
        audioVae,
        latentUpscaler,
        loras: loras.filter((lora) => lora.enabled && lora.name).map(({ name, strength }) => ({ name, strength })),
        audioName: audio?.name,
    });

    const savePreset = async (name: string) => {
        if (presetStatus === 'saving') return;
        setPresetStatus('saving');
        setError('');
        try {
            const firstSourceImage = segments.find((segment) => segment.image)?.image || null;
            let thumbnail = '';
            if (videoUrl) {
                const response = await fetch(videoUrl);
                if (response.ok) thumbnail = await videoToThumbnail(await response.blob(), 256).catch(() => '');
            }
            if (!thumbnail && firstSourceImage) thumbnail = await dataUrlToThumbnail(await fileToDataUrl(firstSourceImage), 256);
            if (!thumbnail) thumbnail = createVideoPlaceholderThumbnail();
            const ltxDirectorOptions = await createDirectorOptions();
            await dispatch(addToLibrary({
                mediaType: 'preset',
                name: `LTX Director - ${name}`,
                media: thumbnail,
                thumbnail,
                sourceImage: ltxDirectorOptions.segments.find((segment) => segment.sourceImage)?.sourceImage,
                ltxDirectorOptions,
            })).unwrap();
            setPresetStatus('saved');
            window.setTimeout(() => setPresetStatus('idle'), 2500);
        } catch (saveError) {
            setPresetStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Failed to save the LTX Director preset.');
        }
    };

    const loraOptions = [{ value: '', label: 'Select a LoRA...' }, ...familyFiles(loraModels, 'ltx-23', modelInventory).map((model) => ({ value: model, label: model }))];
    const modelSelect = (label: string, value: string, models: readonly string[], change: (value: string) => void) =>
        <Select variant="search" label={label} ariaLabel={`LTX Director ${label}`} value={value} options={models} onChange={change} />;

    return (
        <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-text-primary shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary bg-bg-tertiary px-4 py-3">
                <div><h2 className="text-lg font-bold">LTX Director</h2><p className="text-xs text-text-secondary">{segments.length} clips · {Number(totalDuration.toFixed(1))}s · LTX {modelVersion}</p></div>
                <div className="flex items-center gap-2">
                    <div className="flex h-9 rounded-md border border-border-primary bg-bg-primary p-0.5" aria-label="LTX model version">
                        {(['2.3', '2.5'] as const).map((version) => <button key={version} type="button" onClick={() => changeModelVersion(version)} aria-pressed={modelVersion === version} className={toggle(modelVersion === version)}>LTX {version}</button>)}
                    </div>
                    <span className={`h-2 w-2 rounded-full ${isComfyUIConnected ? 'bg-highlight-green' : 'bg-danger'}`} />
                    <span className="hidden text-xs text-text-secondary sm:inline">{isComfyUIConnected ? 'ComfyUI online' : 'ComfyUI offline'}</span>
                    <button onClick={() => setPresetSaveOpen(true)} disabled={presetStatus === 'saving'} className={`flex h-9 items-center gap-2 px-3 ${ghost} ${presetStatus === 'saved' ? '!border-highlight-green !text-highlight-green' : ''}`}>
                        {presetStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : presetStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}
                        {presetStatus === 'saving' ? 'Saving...' : presetStatus === 'saved' ? 'Preset saved' : 'Save preset'}
                    </button>
                    <button onClick={generate} disabled={!segments.length || segments.some((segment) => !segment.prompt.trim()) || !isComfyUIConnected || isGenerating} className={`flex h-9 items-center gap-2 px-4 text-sm ${solid}`}>
                        {isGenerating ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}Generate
                    </button>
                </div>
            </header>

            <div className="grid items-start gap-4 border-b border-border-primary p-4 lg:grid-cols-3">
                {/* Remounted open when a model version or a transferred LoRA changes these settings. */}
                <React.Fragment key={settingsReveal}>
                    <Accordion title="Models" defaultOpen={settingsReveal > 0}>
                        {modelSelect('LTX model · Safetensors / GGUF', checkpoint, familyFiles(checkpoints, 'ltx-23', modelInventory), setCheckpoint)}
                        {modelVersion === '2.5' ? modelSelect('Text encoder · single CLIP', textEncoder, textEncoderModels, setTextEncoder)
                            : dualTextEncoders?.map((encoder, index) => <div key={index}>{modelSelect(index === 0 ? 'Text encoder · dual CLIP 1' : 'Text projection · dual CLIP 2', encoder, textEncoderModels, (value) => {
                                const nextEncoders = [...dualTextEncoders];
                                nextEncoders[index] = value;
                                setTextEncoder(nextEncoders.join(' + '));
                            })}</div>)}
                        {modelSelect('Video VAE', videoVae, vaeModels, setVideoVae)}
                        {modelSelect('Audio VAE', audioVae, vaeModels, setAudioVae)}
                        {modelSelect('Latent upscaler', latentUpscaler, latentUpscalerModels, setLatentUpscaler)}
                    </Accordion>
                    <Accordion title="LoRAs" defaultOpen={settingsReveal > 0}>
                        {loras.map((lora, index) => <div key={index} className="min-w-0 space-y-2 border-b border-border-primary pb-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={lora.enabled} onChange={(event) => updateLora(index, { enabled: event.target.checked })} aria-label={`Enable LoRA ${index + 1}`} />LoRA {index + 1}</label>
                            <Select variant="search" ariaLabel={`LoRA ${index + 1}`} value={lora.name} disabled={!lora.enabled} options={loraOptions} onChange={(name) => updateLora(index, { name })} />
                            <NumberField slider label="Strength" ariaLabel={`LoRA ${index + 1} strength`} min={-10} max={10} step={0.5} value={lora.strength} disabled={!lora.enabled} onChange={(strength) => updateLora(index, { strength })} />
                        </div>)}
                        {promptExampleSources.length > 0 && <div className="grid gap-2">
                            {promptExampleSources.map((source) => <button key={source.modelPath} type="button" onClick={() => void openPromptExamples(source)} disabled={promptExamplesLoading} className={`inline-flex min-w-0 items-center justify-center gap-2 px-3 py-2 text-xs ${ghost}`}>
                                {promptExamplesLoading && activePromptExampleSource?.modelPath === source.modelPath && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                                <span className="truncate">{source.hasLocalPrompts ? 'Local prompts' : 'Find prompt examples'} · {source.modelName}</span>
                            </button>)}
                        </div>}
                    </Accordion>
                </React.Fragment>
                <Accordion title="Advanced">
                    <div className="flex items-center justify-between gap-3">
                        <span className={ui.label}>VAE decode</span>
                        <div className="flex h-8 rounded-md border border-border-primary bg-bg-primary p-0.5" role="group" aria-label="VAE decode mode">
                            {(['standard', 'tiled'] as const).map((mode) => <button key={mode} type="button" onClick={() => setVaeDecodeMode(mode)} aria-pressed={vaeDecodeMode === mode} className={`capitalize ${toggle(vaeDecodeMode === mode)}`}>{mode}</button>)}
                        </div>
                    </div>
                    {vaeDecodeMode === 'tiled' && <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Tile size" ariaLabel="LTX Director Tile size" min={64} max={4096} step={32} value={vaeTileSize} onChange={setVaeTileSize} />
                        <NumberField label="Overlap" ariaLabel="LTX Director Overlap" min={0} max={4096} step={32} value={vaeOverlap} onChange={setVaeOverlap} />
                        <NumberField label="Temporal size" ariaLabel="LTX Director Temporal size" min={8} max={4096} step={4} value={vaeTemporalSize} onChange={setVaeTemporalSize} />
                        <NumberField label="Temporal overlap" ariaLabel="LTX Director Temporal overlap" min={4} max={4096} step={4} value={vaeTemporalOverlap} onChange={setVaeTemporalOverlap} />
                    </div>}
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={useCacheDit} onChange={(event) => setUseCacheDit(event.target.checked)} />Enable CacheDiT LTX-2 Accelerator</label>
                    {useCacheDit && <>
                        <NumberField slider label="Warmup steps" ariaLabel="LTX Director Warmup steps" min={3} max={20} step={1} value={cacheDitWarmupSteps} onChange={setCacheDitWarmupSteps} />
                        <NumberField slider label="Skip interval" ariaLabel="LTX Director Skip interval" min={2} max={15} step={1} value={cacheDitSkipInterval} onChange={setCacheDitSkipInterval} />
                        <NumberField slider label="Noise scale" ariaLabel="LTX Director Noise scale" min={0} max={0.01} step={0.0001} value={cacheDitNoiseScale} onChange={setCacheDitNoiseScale} />
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={cacheDitPrintSummary} onChange={(event) => setCacheDitPrintSummary(event.target.checked)} />Print summary</label>
                        {!comfyUIObjectInfo?.CacheDiT_LTX2_Optimizer && <p className="text-xs text-highlight-yellow">Restart ComfyUI if the CacheDiT LTX-2 node is not loaded yet.</p>}
                    </>}
                </Accordion>
            </div>

            <div className="grid min-h-[620px] lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="min-w-0 border-b border-border-primary p-4 lg:border-b-0 lg:border-r">
                    <button onClick={() => imageInput.current?.click()} className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-border-primary bg-black hover:border-accent">
                        {selectedSegment?.imageUrl ? <img src={selectedSegment.imageUrl} alt="Selected clip" className="h-full w-full object-contain" /> : selectedSegment ? <span className="px-5 text-center text-xs text-zinc-400">Prompt-only clip<br /><span className="text-zinc-500">Click to assign a photo</span></span> : <span className="flex flex-col items-center gap-2 text-xs text-zinc-400"><UploadCloudIcon className="h-7 w-7" />Add photos or prompt</span>}
                    </button>
                    <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addImages(event.target.files)} />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <button onClick={() => imageInput.current?.click()} className={`py-2 ${ghost}`}>+ Photos</button>
                        <button onClick={() => setImageLibraryOpen(true)} title="Choose a photo from Library" className={`flex items-center justify-center gap-1 py-2 ${ghost}`}><LibraryIcon className="h-4 w-4" />Library</button>
                        <button onClick={addPromptClip} className={`py-2 ${ghost}`}>{audioTimelineLocked ? 'Split midpoint' : '+ Prompt clip'}</button>
                    </div>

                    <div className="mt-5 space-y-4">
                        <Select<number> label="Frame rate" ariaLabel="LTX Director Frame rate" value={frameRate} options={[24, 25, 30].map((value) => ({ value, label: `${value} fps` }))} onChange={setFrameRate} />
                        <NumberField slider label="Guide strength" ariaLabel="LTX Director Guide strength" min={0} max={2} step={0.05} value={guideStrength} onChange={setGuideStrength} />
                        {isTextToVideo && <div>
                            <span className={ui.label}>T2V orientation</span>
                            <div className="mt-1 grid grid-cols-2 rounded-md border border-border-primary bg-bg-primary p-1" role="group" aria-label="Text-to-video orientation">
                                {(['landscape', 'portrait'] as const).map((orientation) => <button key={orientation} type="button" onClick={() => setT2vOrientation(orientation)} aria-pressed={t2vOrientation === orientation} className={`h-8 capitalize ${toggle(t2vOrientation === orientation)}`}>{orientation}</button>)}
                            </div>
                        </div>}
                        <NumberField slider label="Output scale (%)" ariaLabel="LTX Director Output scale" min={25} max={100} step={5} value={imageScalePercent} onChange={setImageScalePercent} />
                        <div className="rounded-md border border-accent bg-bg-tertiary px-3 py-2" aria-live="polite">
                            <span className="block text-[10px] font-bold text-accent">FINAL OUTPUT RESOLUTION</span>
                            <strong className="mt-1 block text-lg">{outputResolution.width} × {outputResolution.height}</strong>
                            <span className="text-[10px] text-text-muted">{isTextToVideo ? `${t2vOrientation} T2V` : `source ${baseResolution.width} × ${baseResolution.height}`} · divisible by 32</span>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <button onClick={() => audioInput.current?.click()} className={`min-w-0 truncate rounded-md border px-3 py-2 text-left text-xs ${audio ? 'border-accent text-text-primary' : 'border-dashed border-border-primary text-text-secondary'}`}>{audio ? audio.name : '+ Optional soundtrack'}</button>
                            <button onClick={() => setAudioLibraryOpen(true)} title="Choose audio from Library" aria-label="Choose audio from Library" className={`flex h-full items-center justify-center px-3 ${ghost}`}><LibraryIcon className="h-4 w-4" /></button>
                        </div>
                        <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => void handleAudioFile(event.target.files?.[0] || null)} />
                    </div>
                </aside>

                <div className="min-w-0 bg-bg-primary">
                    <div className="flex min-h-[280px] items-center justify-center border-b border-border-primary bg-black p-4">
                        {videoUrl ? <video src={videoUrl} controls autoPlay className="max-h-[350px] max-w-full" /> : selectedSegment?.imageUrl ? <img src={selectedSegment.imageUrl} alt="Timeline preview" className="max-h-[330px] max-w-full object-contain" /> : selectedSegment ? <div className="max-w-md px-6 text-center"><div className="mb-3 text-xs font-bold tracking-wider text-accent">PROMPT-ONLY CLIP</div><p className="line-clamp-5 text-sm leading-6 text-zinc-400">{selectedSegment.prompt || 'Write the scene prompt below.'}</p></div> : <div className="text-sm text-zinc-500">ADD A PHOTO OR PROMPT CLIP TO START</div>}
                    </div>

                    <div className="overflow-x-auto p-4">
                        <div className="min-w-[680px]">
                            <div className="ml-20 flex justify-between border-b border-border-primary pb-1 text-[10px] text-text-muted"><span>0s</span><span>{Number((totalDuration / 2).toFixed(1))}s</span><span>{Number(totalDuration.toFixed(1))}s</span></div>
                            <div className="mt-2 grid grid-cols-[72px_1fr] gap-2">
                                <div className="flex items-center text-xs font-semibold text-text-secondary">VIDEO</div>
                                <div className={`flex h-24 overflow-hidden rounded bg-bg-tertiary p-1 ${audioTimelineLocked ? '' : 'gap-1'}`}>
                                    {segments.map((segment, index) => <button key={segment.id} onClick={() => setSelectedId(segment.id)} style={{ flexGrow: segment.durationSeconds, flexBasis: 0, minWidth: audioTimelineLocked ? 0 : 86 }} className={`group relative overflow-hidden rounded border-2 text-left ${selectedSegment?.id === segment.id ? 'border-accent' : 'border-border-primary'}`}>
                                        {segment.imageUrl ? <img src={segment.imageUrl} alt={`Clip ${index + 1}`} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-bg-secondary px-3 text-center text-[11px] font-semibold text-text-secondary">PROMPT<br />ONLY</span>}
                                        <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-2 py-1 text-[10px] text-white"><b>#{index + 1}</b><span>{segment.durationSeconds}s</span></span>
                                        {(!audioTimelineLocked || index < segments.length - 1) && <span onPointerDown={(event) => beginResize(event, segment)} title={audioTimelineLocked ? 'Drag boundary without changing audio length' : 'Drag to resize clip'} className="absolute inset-y-0 right-0 w-3 cursor-ew-resize border-l border-accent bg-accent opacity-40 hover:opacity-100" />}
                                    </button>)}
                                    {!audioTimelineLocked && <button onClick={() => imageInput.current?.click()} className="min-w-20 rounded border border-dashed border-border-primary text-xs text-text-muted hover:border-accent">+ Photo</button>}
                                    {!audioTimelineLocked && <button onClick={addPromptClip} className="min-w-20 rounded border border-dashed border-border-primary text-xs text-text-muted hover:border-accent">+ Prompt</button>}
                                </div>
                                <div className="flex items-center text-xs font-semibold text-text-secondary">AUDIO</div>
                                {audio && audioUrl ? <div className="relative h-16 overflow-hidden rounded border border-cyan-400/70 bg-[#07191c]">
                                    <audio ref={audioPlayer} src={audioUrl} onTimeUpdate={(event) => setPlayheadSeconds(event.currentTarget.currentTime)} onPlay={() => setIsAudioPlaying(true)} onPause={() => setIsAudioPlaying(false)} onEnded={() => setIsAudioPlaying(false)} />
                                    <div onClick={seekAudio} role="slider" aria-label="Audio playhead" aria-valuemin={0} aria-valuemax={totalDuration} aria-valuenow={playheadSeconds} tabIndex={0} className="absolute inset-0 flex cursor-crosshair items-center gap-px overflow-hidden px-1">
                                        {waveformPeaks.map((peak, index) => <span key={index} className="min-w-px flex-1 rounded-full bg-cyan-300/75" style={{ height: `${Math.max(3, peak * 48)}px` }} />)}
                                        {segments.slice(0, -1).map((_, index) => {
                                            const boundary = segments.slice(0, index + 1).reduce((sum, segment) => sum + segment.durationSeconds, 0);
                                            return <span key={index} className="pointer-events-none absolute inset-y-0 w-px bg-amber-300" style={{ left: `${(boundary / totalDuration) * 100}%` }} />;
                                        })}
                                        <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_5px_#fff]" style={{ left: `${Math.min(100, (playheadSeconds / totalDuration) * 100)}%` }} />
                                    </div>
                                    <button onClick={toggleAudioPlayback} title={isAudioPlaying ? 'Pause audio' : 'Play audio'} aria-label={isAudioPlaying ? 'Pause audio' : 'Play audio'} className="absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center border-r border-cyan-900 bg-[#07191c]/90 text-cyan-200 hover:bg-cyan-950">
                                        {isAudioPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
                                    </button>
                                    {audioTimelineLocked && <button onClick={() => splitSelectedClip()} disabled={!canSplitAtPlayhead} title="Split selected clip at playhead" className="absolute inset-y-0 right-0 z-10 border-l border-cyan-900 bg-[#07191c]/90 px-3 text-xs font-bold text-cyan-100 hover:bg-cyan-950 disabled:cursor-not-allowed disabled:opacity-40">Split at cursor</button>}
                                </div> : <button onClick={() => audioInput.current?.click()} className="h-10 rounded border border-dashed border-border-primary bg-bg-tertiary hover:border-accent"><span className="text-xs text-text-secondary">Optional soundtrack</span></button>}
                            </div>

                            {selectedSegment && <div className="mt-4 border-t border-border-primary pt-4">
                                <div className="mb-3 flex flex-wrap items-end gap-3">
                                    <NumberField slider className="min-w-64 flex-1" label={`Clip ${segments.indexOf(selectedSegment) + 1} duration (s)`} ariaLabel="LTX Director clip duration" min={audioTimelineLocked ? MIN_AUDIO_CLIP_DURATION : MIN_CLIP_DURATION} max={MAX_CLIP_DURATION} step={0.5} value={selectedSegment.durationSeconds} disabled={audioTimelineLocked} onChange={(durationSeconds) => updateSegment(selectedSegment.id, { durationSeconds })} />
                                    {audioTimelineLocked && <button onClick={() => splitSelectedClip(selectedStart + selectedSegment.durationSeconds / 2)} disabled={selectedSegment.durationSeconds < MIN_AUDIO_CLIP_DURATION * 2} className={`px-2 py-2 text-xs ${ghost}`}>Split midpoint</button>}
                                    <button onClick={() => removeSegment(selectedSegment.id)} className="rounded-md border border-danger px-2 py-2 text-xs text-danger hover:bg-danger-bg">Remove</button>
                                </div>
                                {audioTimelineLocked && <p className={`mb-3 ${ui.hint}`}>Drag the clip boundary in the timeline to change a duration: the total audio length is preserved.</p>}
                                {segments.indexOf(selectedSegment) > 0 && <div className="mb-3">
                                    <span className={ui.label}>Story relationship</span>
                                    <div role="group" aria-label="Prompt relationship" className="mt-1 grid max-w-md grid-cols-2 overflow-hidden rounded-md border border-border-primary bg-bg-tertiary p-1">
                                        <button onClick={() => setPromptRelationship('continuation')} aria-pressed={promptRelationship === 'continuation'} className={`h-8 ${toggle(promptRelationship === 'continuation')}`}>Continue previous</button>
                                        <button onClick={() => setPromptRelationship('new')} aria-pressed={promptRelationship === 'new'} className={`h-8 ${toggle(promptRelationship === 'new')}`}>New scene</button>
                                    </div>
                                </div>}
                                {selectedSegment.ttsText && <button onClick={() => setKeepTtsDialogue((current) => !current)} aria-pressed={keepTtsDialogue} className={`mb-3 flex w-full items-center justify-between gap-3 rounded-md border bg-bg-tertiary px-3 py-2 text-left ${keepTtsDialogue ? 'border-accent text-text-primary' : 'border-border-primary text-text-secondary'}`}>
                                    <span className="flex items-center gap-2 text-xs font-bold"><CheckIcon className={`h-4 w-4 ${keepTtsDialogue ? 'opacity-100' : 'opacity-20'}`} />Keep TTS dialogue</span>
                                    <span className="max-w-[65%] truncate text-[11px]">{selectedSegment.ttsText}</span>
                                </button>}
                                {selectedSegment.ttsText && <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-md border border-border-primary bg-bg-tertiary px-3 py-2">
                                    <input type="checkbox" checked={useTtsAsPromptContext} onChange={(event) => setUseTtsAsPromptContext(event.target.checked)} className="mt-0.5" />
                                    <span><span className="block text-xs font-bold">Use TTS script as scene context</span><span className="mt-0.5 block text-[11px] text-text-muted">Random prompts reflect subjects mentioned in the script.</span></span>
                                </label>}
                                <div className="mb-3 grid grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto_auto]">
                                    <Select<LtxPromptTheme> variant="search" label="Visual theme" ariaLabel="Prompt visual theme" value={promptTheme} options={LTX_PROMPT_THEMES} onChange={setPromptTheme} />
                                    <Select<LtxPromptSubtheme> variant="search" label="Sub-theme" ariaLabel="Prompt subtheme" value={promptSubtheme} options={LTX_PROMPT_SUBTHEMES} onChange={setPromptSubtheme} />
                                    <Select<LtxPromptCameraStyle> variant="search" label="Camera style" ariaLabel="Prompt camera style" value={promptCameraStyle} options={LTX_PROMPT_CAMERA_STYLES} onChange={setPromptCameraStyle} />
                                    <Select<LtxPromptAudioStyle> variant="search" label="Audio style" ariaLabel="Prompt audio style" value={promptAudioStyle} options={LTX_PROMPT_AUDIO_STYLES} onChange={setPromptAudioStyle} />
                                    <button onClick={() => generateSegmentPrompt(selectedSegment)} disabled={!!promptLoadingId} className={`flex h-10 items-center justify-center gap-2 px-3 text-xs sm:self-end ${solid}`}>
                                        {promptLoadingId === selectedSegment.id ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}
                                        {selectedSegment.prompt.trim() ? 'Regenerate Prompt' : 'Generate Prompt'}
                                    </button>
                                    <button onClick={() => generateSegmentPrompt(selectedSegment)} disabled={!!promptLoadingId} title="Roll another prompt" aria-label="Roll another prompt" className={`flex h-10 w-10 items-center justify-center sm:self-end ${ghost}`}>
                                        {promptLoadingId === selectedSegment.id ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DiceIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                                {promptError && <p className="mb-2 text-xs text-danger">{promptError}</p>}
                                <PromptBox label={`Clip ${segments.indexOf(selectedSegment) + 1} prompt`} ariaLabel="LTX Director clip prompt" rows={4} value={selectedSegment.prompt} onChange={(prompt) => updateSegment(selectedSegment.id, { prompt })} placeholder={`Prompt for clip ${segments.indexOf(selectedSegment) + 1}: camera, subject action, lighting and sound...`} />
                            </div>}
                        </div>
                    </div>

                    {(isGenerating || error || videoUrl) && <div className="border-t border-border-primary px-4 py-3">
                        {isGenerating && <><div className="mb-2 flex justify-between text-xs text-text-secondary"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></>}
                        {error && <p className="text-sm text-danger">{error}</p>}
                        {videoUrl && <div className="flex flex-wrap items-center gap-3">
                            <a href={videoUrl} download className={`inline-flex h-9 items-center gap-2 px-3 ${ghost}`}><DownloadIcon className="h-4 w-4" />Download video</a>
                            <button onClick={saveVideoToLibrary} disabled={saveStatus !== 'idle'} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-accent-text ${saveStatus === 'saved' ? 'bg-highlight-green' : 'bg-accent hover:bg-accent-hover'} disabled:cursor-default`}>
                                {saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}
                                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved to Library' : 'Save to Library'}
                            </button>
                        </div>}
                    </div>}
                </div>
            </div>
            <LibraryPickerModal
                isOpen={imageLibraryOpen}
                onClose={() => setImageLibraryOpen(false)}
                onSelectItem={(item) => void selectLibraryImage(item)}
                filter={['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'group-fusion', 'swap-anything', 'past-forward-photo']}
            />
            <LibraryPickerModal
                isOpen={audioLibraryOpen}
                onClose={() => setAudioLibraryOpen(false)}
                onSelectItem={(item) => void selectLibraryAudio(item)}
                filter={['audio-tts', 'tts-reference']}
            />
            <PresetSaveModal isOpen={presetSaveOpen} onClose={() => setPresetSaveOpen(false)} onSave={(name) => void savePreset(name)} initialName={`LTX ${modelVersion}`} />
            {promptExamplesOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPromptExamplesOpen(false)}>
                <div role="dialog" aria-modal="true" aria-label="LTX LoRA prompt examples" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border-primary bg-bg-secondary text-text-primary shadow-xl" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3 border-b border-border-primary p-4">
                        <div className="min-w-0"><h3 className="font-bold">LoRA prompt examples</h3><p className="truncate text-xs text-text-secondary">{activePromptExampleSource?.modelName}{promptExamplesStorage === 'sidecar' ? ' · Saved locally' : ''}</p></div>
                        <div className="flex items-center gap-2">{promptExamplesStorage === 'remote' && promptExamples.length > 0 && <button type="button" onClick={() => void savePromptExamples()} disabled={promptExamplesSaving} className={`px-3 py-1.5 text-xs ${ghost}`}>{promptExamplesSaving ? 'Saving...' : 'Save all locally'}</button>}<button type="button" onClick={() => setPromptExamplesOpen(false)} className="rounded p-2 text-text-secondary hover:bg-bg-tertiary" aria-label="Close prompt examples"><CloseIcon className="h-5 w-5" /></button></div>
                    </div>
                    <div className="min-h-32 divide-y divide-border-primary overflow-y-auto">
                        {promptExamplesLoading && <div className="grid min-h-32 place-items-center"><SpinnerIcon className="h-6 w-6 animate-spin text-accent" /></div>}
                        {promptExamplesError && <p className="p-4 text-sm text-danger">{promptExamplesError}</p>}
                        {!promptExamplesLoading && !promptExamplesError && promptExamples.length === 0 && <p className="p-4 text-sm text-text-secondary">No prompt examples were found for this LoRA.</p>}
                        {!promptExamplesLoading && promptExamples.map((example, index) => <div key={`${example.source}-${index}`} className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase text-text-muted">{example.source === 'archive' ? 'CivArchive' : example.source === 'huggingface' ? 'Hugging Face' : 'Civitai Blue / Red'}</span><button type="button" onClick={() => applyPromptExample(example)} disabled={!selectedSegment} className={`px-3 py-1.5 text-xs ${solid}`}>Use prompt</button></div><p className="whitespace-pre-wrap text-sm leading-6">{example.positive}</p>{example.negative && example.negative !== example.positive && <p className="whitespace-pre-wrap rounded bg-bg-tertiary p-2 text-xs text-text-secondary"><span className="font-bold">Negative: </span>{example.negative}</p>}</div>)}
                    </div>
                </div>
            </div>}
        </section>
    );
};