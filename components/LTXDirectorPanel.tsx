import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CheckIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, PauseIcon, PlayIcon, SaveIcon, SpinnerIcon, UploadCloudIcon } from './icons';
import { generateLtxDirectorPrompt, generateLtxDirectorVideo, LTX_PROMPT_AUDIO_STYLES, LTX_PROMPT_SUBTHEMES, LTX_PROMPT_THEMES, type LtxPromptAudioStyle, type LtxPromptSubtheme, type LtxPromptTheme } from '../services/comfyUIService';
import { addSessionTokenUsage, clearLtxTransfer } from '../store/appSlice';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LtxDirectorGenerationInfo } from '../types';
import { createVideoPlaceholderThumbnail, dataUrlToFile, dataUrlToThumbnail, fileToDataUrl, fileToResizedDataUrl, getAudioMimeType, normalizeAudioDataUrl, videoToThumbnail } from '../utils/imageUtils';
import { LibraryPickerModal } from './LibraryPickerModal';

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

interface DirectorGenerationSnapshot {
    segments: {
        image: File | null;
        prompt: string;
        ttsText?: string;
        durationSeconds: number;
    }[];
    frameRate: number;
    guideStrength: number;
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
    loras: DirectorLora[];
}

const LTX_MODEL_PROFILES: Record<LtxModelVersion, LtxModelProfile> = {
    '2.3': {
        checkpoint: 'LTX2\\sulphur2Base_distilled.safetensors',
        textEncoder: 'gemma312BAbliterated_v10aExperimental.safetensors + ltx-2.3_text_projection_bf16.safetensors',
        videoVae: 'LTX23_video_vae_bf16.safetensors',
        audioVae: 'LTX23_audio_vae_bf16.safetensors',
        latentUpscaler: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
        loras: [
            { enabled: true, name: 'LTX2\\ltx-2-19b-distilled-lora_resized_dynamic_fro09_avg_rank_175_fp8.safetensors', strength: 0.5 },
            { enabled: true, name: 'LTX2\\LTX2.3_Crisp_Enhance.safetensors', strength: 0.7 },
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
    const dialogue = ttsText?.trim().replace(/"/g, "'");
    if (!dialogue) return prompt;
    const speakingCue = `The visible character speaks clearly and naturally, saying: "${dialogue}"`;
    return prompt.includes(speakingCue) ? prompt : `${prompt.trim()} ${speakingCue}`.trim();
};
const stripTtsDialogue = (prompt: string): string => prompt
    .replace(/The (?:visible )?character speaks clearly and naturally, saying: ["“][\s\S]*?["”]\.?/gi, '')
    .trim();
const splitTranscript = (text: string | undefined, ratio: number): [string | undefined, string | undefined] => {
    const transcript = text?.trim();
    if (!transcript) return [undefined, undefined];
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
    return [transcript.slice(0, boundary).trim(), transcript.slice(boundary).trim()];
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

const getModelList = (widgetInfo: any): string[] => Array.isArray(widgetInfo?.[0]) ? widgetInfo[0] : [];

export const LTXDirectorPanel: React.FC<LTXDirectorPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const pendingTransfer = useSelector((state: RootState) => state.app.pendingLtxTransfer);
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
    const [imageScalePercent, setImageScalePercent] = useState(100);
    const [vaeDecodeMode, setVaeDecodeMode] = useState<'standard' | 'tiled'>('tiled');
    const [vaeTileSize, setVaeTileSize] = useState(256);
    const [vaeOverlap, setVaeOverlap] = useState(64);
    const [vaeTemporalSize, setVaeTemporalSize] = useState(64);
    const [vaeTemporalOverlap, setVaeTemporalOverlap] = useState(4);
    const [useCacheDit, setUseCacheDit] = useState(true);
    const [cacheDitWarmupSteps, setCacheDitWarmupSteps] = useState(8);
    const [cacheDitSkipInterval, setCacheDitSkipInterval] = useState(3);
    const [cacheDitNoiseScale, setCacheDitNoiseScale] = useState(0.001);
    const [cacheDitPrintSummary, setCacheDitPrintSummary] = useState(true);
    const [advancedOpen, setAdvancedOpen] = useState(false);
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
    const [promptTheme, setPromptTheme] = useState<LtxPromptTheme>('surprise');
    const [promptSubtheme, setPromptSubtheme] = useState<LtxPromptSubtheme>('surprise');
    const [promptAudioStyle, setPromptAudioStyle] = useState<LtxPromptAudioStyle>('natural');
    const [promptRelationship, setPromptRelationship] = useState<'continuation' | 'new'>('continuation');
    const [keepTtsDialogue, setKeepTtsDialogue] = useState(true);
    const [useTtsAsPromptContext, setUseTtsAsPromptContext] = useState(true);
    const [promptLoadingId, setPromptLoadingId] = useState('');
    const [promptError, setPromptError] = useState('');

    const selectedSegment = segments.find((segment) => segment.id === selectedId) || segments[0];
    const totalDuration = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
    const selectedIndex = selectedSegment ? segments.indexOf(selectedSegment) : -1;
    const selectedStart = selectedIndex > 0 ? segments.slice(0, selectedIndex).reduce((total, segment) => total + segment.durationSeconds, 0) : 0;
    const canSplitAtPlayhead = Boolean(selectedSegment
        && playheadSeconds - selectedStart >= MIN_AUDIO_CLIP_DURATION
        && selectedStart + selectedSegment.durationSeconds - playheadSeconds >= MIN_AUDIO_CLIP_DURATION);
    const checkpoints = useMemo(() => {
        const models = modelVersion === '2.5'
            ? getModelList(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name)
            : getModelList(comfyUIObjectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name);
        return Array.from(new Set([checkpoint, LTX_MODEL_PROFILES[modelVersion].checkpoint, ...models].filter(Boolean)));
    }, [checkpoint, comfyUIObjectInfo, modelVersion]);
    const textEncoderModels = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
        return Array.from(new Set([textEncoder, ...models].filter(Boolean)));
    }, [comfyUIObjectInfo, textEncoder]);
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
        ]));
    }, [comfyUIObjectInfo, loras]);

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
                setLoras((current) => [
                    { enabled: true, name: pendingTransfer.selectedLora!, strength: 1 },
                    ...current.slice(1),
                ]);
            }
            setAdvancedOpen(true);
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
                setImageScalePercent(options.imageScalePercent ?? 100);
                setVaeDecodeMode(options.vaeDecodeMode || 'tiled');
                setVaeTileSize(options.vaeTileSize ?? 256);
                setVaeOverlap(options.vaeOverlap ?? 64);
                setVaeTemporalSize(options.vaeTemporalSize ?? 64);
                setVaeTemporalOverlap(options.vaeTemporalOverlap ?? 4);
                setUseCacheDit(options.useCacheDit ?? true);
                setCacheDitWarmupSteps(options.cacheDitWarmupSteps ?? 8);
                setCacheDitSkipInterval(options.cacheDitSkipInterval ?? 3);
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
                const prompt = includeTtsDialogue(stripTtsDialogue(pendingTransfer.prompt || ''), pendingTransfer.ttsText);
                const segment: DirectorSegment = {
                    id: pendingTransfer.id,
                    image: null,
                    imageUrl: '',
                    prompt,
                    ttsText: pendingTransfer.ttsText,
                    durationSeconds,
                };
                setSegments((current) => {
                    current.forEach((item) => item.imageUrl && URL.revokeObjectURL(item.imageUrl));
                    return [segment];
                });
                setSelectedId(segment.id);
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
                durationSeconds: 5,
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
                    durationSeconds: 5,
                };
                setSegments((current) => current.some((item) => item.id === segment.id) ? current : [...current, segment]);
                setSelectedId(segment.id);
                dispatch(clearLtxTransfer());
            })
            .catch(() => dispatch(clearLtxTransfer()));
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
        setLoras(profile.loras.map((lora) => ({ ...lora })));
        setAdvancedOpen(true);
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

    return (
        <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-zinc-700 bg-[#111214] text-zinc-100 shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 bg-[#17181b] px-4 py-3">
                <div><h2 className="text-lg font-bold">LTX Director</h2><p className="text-xs text-zinc-400">{segments.length} clips · {Number(totalDuration.toFixed(1))}s · LTX {modelVersion}</p></div>
                <div className="flex items-center gap-2">
                    <div className="flex h-9 rounded-md border border-zinc-600 bg-zinc-900 p-0.5" aria-label="LTX model version">
                        {(['2.3', '2.5'] as const).map((version) => <button key={version} type="button" onClick={() => changeModelVersion(version)} aria-pressed={modelVersion === version} className={`rounded px-3 text-xs font-bold transition-colors ${modelVersion === version ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>LTX {version}</button>)}
                    </div>
                    <span className={`h-2 w-2 rounded-full ${isComfyUIConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="hidden text-xs text-zinc-400 sm:inline">{isComfyUIConnected ? 'ComfyUI online' : 'ComfyUI offline'}</span>
                    <button onClick={() => setAdvancedOpen((open) => !open)} className={`h-9 rounded-md border px-3 text-sm font-semibold ${advancedOpen ? 'border-amber-400 text-amber-300' : 'border-zinc-600 text-zinc-300 hover:border-zinc-400'}`}>Advanced</button>
                    <button onClick={generate} disabled={!segments.length || segments.some((segment) => !segment.prompt.trim()) || !isComfyUIConnected || isGenerating} className="flex h-9 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
                        {isGenerating ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}Generate
                    </button>
                </div>
            </header>

            {advancedOpen && <div className="border-b border-zinc-700 bg-[#191a1e] p-4">
                <div className="grid gap-4 lg:grid-cols-[1.3fr_2fr]">
                    <div className="grid content-start gap-3">
                    <label className="text-xs font-semibold text-zinc-400">{modelVersion === '2.5' ? 'DIFFUSION MODEL · GGUF' : 'LTX CHECKPOINT'}
                        <select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                            {checkpoints.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </label>
                    {modelVersion === '2.5' ? <label className="text-xs font-semibold text-zinc-400">TEXT ENCODER · SINGLE CLIP
                        <select value={textEncoder} onChange={(event) => setTextEncoder(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                            {textEncoderModels.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </label> : <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400"><span className="font-semibold">TEXT ENCODERS · DUAL CLIP</span><p className="mt-1 break-all text-zinc-300">{textEncoder}</p></div>}
                    <label className="text-xs font-semibold text-zinc-400">VIDEO VAE
                        <select value={videoVae} onChange={(event) => setVideoVae(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">{vaeModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
                    </label>
                    <label className="text-xs font-semibold text-zinc-400">AUDIO VAE
                        <select value={audioVae} onChange={(event) => setAudioVae(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">{vaeModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
                    </label>
                    <label className="text-xs font-semibold text-zinc-400">LATENT UPSCALER
                        <select value={latentUpscaler} onChange={(event) => setLatentUpscaler(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">{latentUpscalerModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
                    </label>
                    <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-zinc-400">VAE DECODE</span>
                            <div className="flex h-8 rounded-md border border-zinc-600 bg-zinc-950 p-0.5" role="group" aria-label="VAE decode mode">
                                {(['standard', 'tiled'] as const).map((mode) => <button key={mode} type="button" onClick={() => setVaeDecodeMode(mode)} aria-pressed={vaeDecodeMode === mode} className={`rounded px-3 text-xs font-semibold capitalize ${vaeDecodeMode === mode ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>{mode}</button>)}
                            </div>
                        </div>
                        {vaeDecodeMode === 'tiled' && <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] font-semibold text-zinc-500">TILE SIZE<input type="number" min="64" max="4096" step="32" value={vaeTileSize} onChange={(event) => setVaeTileSize(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="text-[10px] font-semibold text-zinc-500">OVERLAP<input type="number" min="0" max="4096" step="32" value={vaeOverlap} onChange={(event) => setVaeOverlap(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="text-[10px] font-semibold text-zinc-500">TEMPORAL SIZE<input type="number" min="8" max="4096" step="4" value={vaeTemporalSize} onChange={(event) => setVaeTemporalSize(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="text-[10px] font-semibold text-zinc-500">TEMPORAL OVERLAP<input type="number" min="4" max="4096" step="4" value={vaeTemporalOverlap} onChange={(event) => setVaeTemporalOverlap(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                        </div>}
                    </div>
                    <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-300"><input type="checkbox" checked={useCacheDit} onChange={(event) => setUseCacheDit(event.target.checked)} className="accent-amber-400" />Enable CacheDiT LTX-2 Accelerator</label>
                        {useCacheDit && <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className="text-[10px] font-semibold text-zinc-500">WARMUP STEPS<input type="number" min="3" max="20" step="1" value={cacheDitWarmupSteps} onChange={(event) => setCacheDitWarmupSteps(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="text-[10px] font-semibold text-zinc-500">SKIP INTERVAL<input type="number" min="2" max="15" step="1" value={cacheDitSkipInterval} onChange={(event) => setCacheDitSkipInterval(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="text-[10px] font-semibold text-zinc-500">NOISE SCALE<input type="number" min="0" max="0.01" step="0.0001" value={cacheDitNoiseScale} onChange={(event) => setCacheDitNoiseScale(Number(event.target.value))} className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100" /></label>
                            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-xs font-semibold text-zinc-400"><input type="checkbox" checked={cacheDitPrintSummary} onChange={(event) => setCacheDitPrintSummary(event.target.checked)} className="accent-amber-400" />Print summary</label>
                            {!comfyUIObjectInfo?.CacheDiT_LTX2_Optimizer && <p className="text-[11px] text-amber-300 col-span-2">Restart ComfyUI if the CacheDiT LTX-2 node is not loaded yet.</p>}
                        </div>}
                    </div>
                    </div>
                    <div className="grid gap-2">
                        {loras.map((lora, index) => <div key={index} className="grid grid-cols-[auto_1fr_80px] items-center gap-2">
                            <input type="checkbox" checked={lora.enabled} onChange={(event) => updateLora(index, { enabled: event.target.checked })} aria-label={`Enable LoRA ${index + 1}`} className="accent-amber-400" />
                            <select value={lora.name} disabled={!lora.enabled} onChange={(event) => updateLora(index, { name: event.target.value })} aria-label={`LoRA ${index + 1}`} className="min-w-0 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-2 text-xs text-zinc-100 disabled:opacity-40">
                                <option value="">Select a LoRA...</option>
                                {loraModels.map((model) => <option key={model} value={model}>{model}</option>)}
                            </select>
                            <input type="number" min="-2" max="2" step="0.05" value={lora.strength} disabled={!lora.enabled} onChange={(event) => updateLora(index, { strength: Number(event.target.value) })} aria-label={`LoRA ${index + 1} strength`} className="rounded-md border border-zinc-600 bg-zinc-900 px-2 py-2 text-xs disabled:opacity-40" />
                        </div>)}
                    </div>
                </div>
            </div>}

            <div className="grid min-h-[620px] lg:grid-cols-[280px_1fr]">
                <aside className="border-b border-zinc-700 bg-[#151619] p-4 lg:border-b-0 lg:border-r">
                    <button onClick={() => imageInput.current?.click()} className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-zinc-600 bg-black hover:border-amber-400">
                        {selectedSegment?.imageUrl ? <img src={selectedSegment.imageUrl} alt="Selected clip" className="h-full w-full object-contain" /> : selectedSegment ? <span className="px-5 text-center text-xs text-zinc-400">Prompt-only clip<br /><span className="text-zinc-600">Click to assign a photo</span></span> : <span className="flex flex-col items-center gap-2 text-xs text-zinc-400"><UploadCloudIcon className="h-7 w-7" />Add photos or prompt</span>}
                    </button>
                    <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addImages(event.target.files)} />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <button onClick={() => imageInput.current?.click()} className="rounded-md border border-zinc-600 py-2 text-sm font-semibold text-zinc-200 hover:border-amber-400">+ Photos</button>
                        <button onClick={() => setImageLibraryOpen(true)} title="Choose a photo from Library" className="flex items-center justify-center gap-1 rounded-md border border-zinc-600 py-2 text-sm font-semibold text-zinc-200 hover:border-amber-400"><LibraryIcon className="h-4 w-4" />Library</button>
                        <button onClick={addPromptClip} className="rounded-md border border-zinc-600 py-2 text-sm font-semibold text-zinc-200 hover:border-amber-400">{audioTimelineLocked ? 'Split midpoint' : '+ Prompt clip'}</button>
                    </div>

                    <div className="mt-5 space-y-4">
                        <label className="block text-xs font-semibold text-zinc-400">FRAME RATE
                            <select value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm"><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option></select>
                        </label>
                        <label className="block text-xs font-semibold text-zinc-400">GUIDE STRENGTH
                            <div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="2" step="0.05" value={guideStrength} onChange={(event) => setGuideStrength(Number(event.target.value))} className="w-full accent-amber-400" /><span className="w-10 text-right text-sm">{guideStrength.toFixed(2)}</span></div>
                        </label>
                        <label className="block text-xs font-semibold text-zinc-400">IMAGE SCALE
                            <div className="mt-2 flex items-center gap-3"><input type="range" min="25" max="100" step="5" value={imageScalePercent} onChange={(event) => setImageScalePercent(Number(event.target.value))} className="w-full accent-amber-400" /><span className="w-10 text-right text-sm">{imageScalePercent}%</span></div>
                        </label>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <button onClick={() => audioInput.current?.click()} className={`min-w-0 truncate rounded-md border px-3 py-2 text-left text-xs ${audio ? 'border-cyan-400 text-cyan-200' : 'border-dashed border-zinc-600 text-zinc-400'}`}>{audio ? audio.name : '+ Optional soundtrack'}</button>
                            <button onClick={() => setAudioLibraryOpen(true)} title="Choose audio from Library" aria-label="Choose audio from Library" className="flex h-full items-center justify-center rounded-md border border-zinc-600 px-3 text-zinc-300 hover:border-cyan-400 hover:text-cyan-200"><LibraryIcon className="h-4 w-4" /></button>
                        </div>
                        <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => void handleAudioFile(event.target.files?.[0] || null)} />
                    </div>
                </aside>

                <div className="min-w-0 bg-[#0d0e10]">
                    <div className="flex min-h-[280px] items-center justify-center border-b border-zinc-700 bg-black p-4">
                        {videoUrl ? <video src={videoUrl} controls autoPlay className="max-h-[350px] max-w-full" /> : selectedSegment?.imageUrl ? <img src={selectedSegment.imageUrl} alt="Timeline preview" className="max-h-[330px] max-w-full object-contain" /> : selectedSegment ? <div className="max-w-md px-6 text-center"><div className="mb-3 text-xs font-bold tracking-wider text-amber-300">PROMPT-ONLY CLIP</div><p className="line-clamp-5 text-sm leading-6 text-zinc-400">{selectedSegment.prompt || 'Write the scene prompt below.'}</p></div> : <div className="text-sm text-zinc-600">ADD A PHOTO OR PROMPT CLIP TO START</div>}
                    </div>

                    <div className="overflow-x-auto p-4">
                        <div className="min-w-[680px]">
                            <div className="ml-20 flex justify-between border-b border-zinc-700 pb-1 text-[10px] text-zinc-500"><span>0s</span><span>{Number((totalDuration / 2).toFixed(1))}s</span><span>{Number(totalDuration.toFixed(1))}s</span></div>
                            <div className="mt-2 grid grid-cols-[72px_1fr] gap-2">
                                <div className="flex items-center text-xs font-semibold text-zinc-400">VIDEO</div>
                                <div className={`flex h-24 overflow-hidden rounded bg-zinc-900 p-1 ${audioTimelineLocked ? '' : 'gap-1'}`}>
                                    {segments.map((segment, index) => <button key={segment.id} onClick={() => setSelectedId(segment.id)} style={{ flexGrow: segment.durationSeconds, flexBasis: 0, minWidth: audioTimelineLocked ? 0 : 86 }} className={`group relative overflow-hidden rounded border-2 text-left ${selectedSegment?.id === segment.id ? 'border-amber-400' : 'border-zinc-700'}`}>
                                        {segment.imageUrl ? <img src={segment.imageUrl} alt={`Clip ${index + 1}`} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center bg-zinc-800 px-3 text-center text-[11px] font-semibold text-zinc-300">PROMPT<br />ONLY</span>}
                                        <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-2 py-1 text-[10px]"><b>#{index + 1}</b><span>{segment.durationSeconds}s</span></span>
                                        {(!audioTimelineLocked || index < segments.length - 1) && <span onPointerDown={(event) => beginResize(event, segment)} title={audioTimelineLocked ? 'Drag boundary without changing audio length' : 'Drag to resize clip'} className="absolute inset-y-0 right-0 w-3 cursor-ew-resize border-l border-amber-200/80 bg-amber-400/30 opacity-70 hover:opacity-100" />}
                                    </button>)}
                                    {!audioTimelineLocked && <button onClick={() => imageInput.current?.click()} className="min-w-20 rounded border border-dashed border-zinc-600 text-xs text-zinc-500">+ Photo</button>}
                                    {!audioTimelineLocked && <button onClick={addPromptClip} className="min-w-20 rounded border border-dashed border-zinc-600 text-xs text-zinc-500">+ Prompt</button>}
                                </div>
                                <div className="flex items-center text-xs font-semibold text-zinc-400">AUDIO</div>
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
                                </div> : <button onClick={() => audioInput.current?.click()} className="h-10 rounded border border-dashed border-zinc-600 bg-zinc-900"><span className="text-xs text-zinc-400">Optional soundtrack</span></button>}
                            </div>

                            {selectedSegment && <div className="mt-4 border-t border-zinc-700 pt-4">
                                <div className="mb-3 flex items-center gap-3">
                                    <label className="flex flex-1 items-center gap-3 text-xs font-semibold text-zinc-400">CLIP {segments.indexOf(selectedSegment) + 1} DURATION
                                        <input type="range" min={audioTimelineLocked ? MIN_AUDIO_CLIP_DURATION : MIN_CLIP_DURATION} max={MAX_CLIP_DURATION} step="0.5" value={selectedSegment.durationSeconds} disabled={audioTimelineLocked} onChange={(event) => updateSegment(selectedSegment.id, { durationSeconds: Number(event.target.value) })} title={audioTimelineLocked ? 'Drag the clip boundary in the timeline to preserve total audio duration' : 'Clip duration'} className="min-w-24 flex-1 accent-amber-400 disabled:opacity-35" />
                                        <span className="w-9 text-right text-zinc-100">{selectedSegment.durationSeconds}s</span>
                                    </label>
                                    {audioTimelineLocked && <button onClick={() => splitSelectedClip(selectedStart + selectedSegment.durationSeconds / 2)} disabled={selectedSegment.durationSeconds < MIN_AUDIO_CLIP_DURATION * 2} className="rounded border border-cyan-800 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-950 disabled:opacity-30">Split midpoint</button>}
                                    <button onClick={() => removeSegment(selectedSegment.id)} className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950">Remove</button>
                                </div>
                                {segments.indexOf(selectedSegment) > 0 && <div className="mb-3">
                                    <div className="mb-1 text-[10px] font-bold text-zinc-500">STORY RELATIONSHIP</div>
                                    <div role="group" aria-label="Prompt relationship" className="grid max-w-md grid-cols-2 overflow-hidden rounded-md border border-zinc-600 bg-zinc-900 p-1">
                                        <button onClick={() => setPromptRelationship('continuation')} aria-pressed={promptRelationship === 'continuation'} className={`h-8 rounded text-xs font-semibold ${promptRelationship === 'continuation' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>Continue previous</button>
                                        <button onClick={() => setPromptRelationship('new')} aria-pressed={promptRelationship === 'new'} className={`h-8 rounded text-xs font-semibold ${promptRelationship === 'new' ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>New scene</button>
                                    </div>
                                </div>}
                                {selectedSegment.ttsText && <button onClick={() => setKeepTtsDialogue((current) => !current)} aria-pressed={keepTtsDialogue} className={`mb-3 flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left ${keepTtsDialogue ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-200' : 'border-zinc-600 bg-zinc-900 text-zinc-400'}`}>
                                    <span className="flex items-center gap-2 text-xs font-bold"><CheckIcon className={`h-4 w-4 ${keepTtsDialogue ? 'opacity-100' : 'opacity-20'}`} />Keep TTS dialogue</span>
                                    <span className="max-w-[65%] truncate text-[11px]">{selectedSegment.ttsText}</span>
                                </button>}
                                {selectedSegment.ttsText && <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-zinc-300 hover:border-zinc-500">
                                    <input type="checkbox" checked={useTtsAsPromptContext} onChange={(event) => setUseTtsAsPromptContext(event.target.checked)} className="mt-0.5 accent-cyan-400" />
                                    <span><span className="block text-xs font-bold">Use TTS script as scene context</span><span className="mt-0.5 block text-[11px] text-zinc-500">Random prompts reflect subjects mentioned in the script.</span></span>
                                </label>}
                                <div className="mb-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(140px,1fr)_minmax(130px,1fr)_minmax(160px,1fr)_auto_auto]">
                                    <label className="text-[10px] font-bold text-zinc-500">VISUAL THEME
                                        <select value={promptTheme} onChange={(event) => setPromptTheme(event.target.value as LtxPromptTheme)} aria-label="Prompt visual theme" className="mt-1 h-9 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-100">
                                            {LTX_PROMPT_THEMES.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-[10px] font-bold text-zinc-500">SUB-THEME
                                        <select value={promptSubtheme} onChange={(event) => setPromptSubtheme(event.target.value as LtxPromptSubtheme)} aria-label="Prompt subtheme" className="mt-1 h-9 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-100">
                                            {LTX_PROMPT_SUBTHEMES.map((subtheme) => <option key={subtheme.value} value={subtheme.value}>{subtheme.label}</option>)}
                                        </select>
                                    </label>
                                    <label className="text-[10px] font-bold text-zinc-500">AUDIO STYLE
                                        <select value={promptAudioStyle} onChange={(event) => setPromptAudioStyle(event.target.value as LtxPromptAudioStyle)} aria-label="Prompt audio style" className="mt-1 h-9 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 text-xs text-zinc-100">
                                            {LTX_PROMPT_AUDIO_STYLES.map((audioStyle) => <option key={audioStyle.value} value={audioStyle.value}>{audioStyle.label}</option>)}
                                        </select>
                                    </label>
                                    <button onClick={() => generateSegmentPrompt(selectedSegment)} disabled={!!promptLoadingId} className="flex h-9 items-center justify-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-50 sm:self-end">
                                        {promptLoadingId === selectedSegment.id ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}
                                        {selectedSegment.prompt.trim() ? 'Regenerate Prompt' : 'Generate Prompt'}
                                    </button>
                                    <button onClick={() => generateSegmentPrompt(selectedSegment)} disabled={!!promptLoadingId} title="Roll another prompt" aria-label="Roll another prompt" className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-600 text-amber-300 hover:border-amber-400 disabled:opacity-50 sm:self-end">
                                        {promptLoadingId === selectedSegment.id ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DiceIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                                {promptError && <p className="mb-2 text-xs text-red-400">{promptError}</p>}
                                <textarea value={selectedSegment.prompt} onChange={(event) => updateSegment(selectedSegment.id, { prompt: event.target.value })} rows={4} placeholder={`Prompt for clip ${segments.indexOf(selectedSegment) + 1}: camera, subject action, lighting and sound...`} className="w-full resize-y rounded border border-zinc-600 bg-[#181a1e] p-3 text-sm leading-6 outline-none focus:border-amber-400" />
                            </div>}
                        </div>
                    </div>

                    {(isGenerating || error || videoUrl) && <div className="border-t border-zinc-700 px-4 py-3">
                        {isGenerating && <><div className="mb-2 flex justify-between text-xs text-zinc-400"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-amber-400" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></>}
                        {error && <p className="text-sm text-red-400">{error}</p>}
                        {videoUrl && <div className="flex flex-wrap items-center gap-3">
                            <a href={videoUrl} download className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-600 px-3 text-sm font-semibold text-amber-300 hover:border-amber-400"><DownloadIcon className="h-4 w-4" />Download video</a>
                            <button onClick={saveVideoToLibrary} disabled={saveStatus !== 'idle'} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold ${saveStatus === 'saved' ? 'bg-emerald-500 text-zinc-950' : 'bg-amber-400 text-zinc-950 hover:bg-amber-300'} disabled:cursor-default`}>
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
                filter={['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'group-fusion', 'past-forward-photo']}
            />
            <LibraryPickerModal
                isOpen={audioLibraryOpen}
                onClose={() => setAudioLibraryOpen(false)}
                onSelectItem={(item) => void selectLibraryAudio(item)}
                filter={['audio-tts', 'tts-reference']}
            />
        </section>
    );
};