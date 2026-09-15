import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch } from '../store/store';
import type { IndexTtsGenerationInfo, LibraryItem } from '../types';
import {
    CHATTERBOX_LANGUAGES,
    generateChatterboxTts,
    generateIndexTts,
    getTtsReferenceVoices,
    INDEX_TTS_EMOTIONS,
    INDEX_TTS_LANGUAGES,
    type ChatterboxTtsReference,
    type IndexTtsEmotion,
    type IndexTtsEmotionVector,
    type IndexTtsOptions,
    type TtsReferenceVoice,
} from '../services/comfyUIService';
import { fileToDataUrl, fileToResizedDataUrl, getAudioMimeType } from '../utils/imageUtils';
import { AudioPlayer } from './AudioPlayer';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CheckIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, MicrophoneIcon, PhotographIcon, SaveIcon, SpinnerIcon, TrashIcon, UploadCloudIcon } from './icons';
import { generateTtsConversationLine, generateTtsDialogue, TTS_DIALOGUE_THEMES, type TtsDialogueTheme } from '../services/ttsDialogueService';

type VoiceSource = 'suite' | 'upload' | 'library';
type LineEmotionMode = 'character' | 'manual' | 'qwen';

interface AdvancedCharacter {
    id: string;
    name: string;
    voiceSource: VoiceSource;
    suiteVoice: string;
    referenceFile: File | null;
    referenceName: string;
    thumbnail: string;
    emotions: IndexTtsEmotionVector;
}

interface DialogueLine {
    id: string;
    characterId: string;
    text: string;
    emotionMode: LineEmotionMode;
    emotionPrompt: string;
    emotions: IndexTtsEmotionVector;
}

interface TtsAdvancedPanelProps {
    isComfyUIConnected: boolean | null;
}

const DEFAULT_EMOTIONS: IndexTtsEmotionVector = {
    Happy: 0.5,
    Angry: 0,
    Sad: 0,
    Surprised: 0,
    Afraid: 0,
    Disgusted: 0,
    Calm: 0.7,
    Melancholic: 0,
};

const DEFAULT_ENGINE: Omit<IndexTtsOptions, 'emotionMode' | 'emotionPrompt' | 'emotions'> = {
    modelPath: 'IndexTTS-2',
    language: 'English',
    device: 'auto',
    emotionAlpha: 0.7,
    temperature: 0.8,
    topP: 0.8,
    topK: 30,
    repetitionPenalty: 9.5,
    numBeams: 3,
    durationFactor: 1,
    seed: 1552347959,
    intervalSilence: 200,
    enableChunking: true,
    maxCharsPerChunk: 400,
};

const createCharacter = (index: number): AdvancedCharacter => ({
    id: crypto.randomUUID(),
    name: `Character ${index}`,
    voiceSource: 'suite',
    suiteVoice: '',
    referenceFile: null,
    referenceName: '',
    thumbnail: '',
    emotions: { ...DEFAULT_EMOTIONS },
});

const createLine = (characterId: string): DialogueLine => ({
    id: crypto.randomUUID(),
    characterId,
    text: '',
    emotionMode: 'character',
    emotionPrompt: 'Infer the natural emotion for this dialogue',
    emotions: { ...DEFAULT_EMOTIONS },
});

const hasExplicitCharacterName = (name: string) => Boolean(name.trim()) && !/^Character \d+$/.test(name.trim());

const clampEmotion = (value: number) => Math.min(1, Math.max(0, value));

const EMOTION_COLORS: Record<IndexTtsEmotion, string> = {
    Happy: '#facc15',
    Angry: '#f97316',
    Sad: '#3b82f6',
    Surprised: '#ec4899',
    Afraid: '#a78bfa',
    Disgusted: '#fb923c',
    Calm: '#22d3ee',
    Melancholic: '#93c5fd',
};

const EmotionRadar: React.FC<{
    values: IndexTtsEmotionVector;
    onChange: (values: IndexTtsEmotionVector) => void;
}> = ({ values, onChange }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [activeEmotion, setActiveEmotion] = useState<IndexTtsEmotion | null>(null);
    const center = 120;
    const radius = 72;
    const points = INDEX_TTS_EMOTIONS.map((emotion, index) => {
        const angle = (Math.PI * 2 * index) / INDEX_TTS_EMOTIONS.length - Math.PI / 2;
        return {
            emotion,
            axisX: center + Math.cos(angle) * radius,
            axisY: center + Math.sin(angle) * radius,
            valueX: center + Math.cos(angle) * radius * clampEmotion(values[emotion]),
            valueY: center + Math.sin(angle) * radius * clampEmotion(values[emotion]),
            labelX: center + Math.cos(angle) * (radius + 24),
            labelY: center + Math.sin(angle) * (radius + 24),
        };
    });
    const rings = [0.25, 0.5, 0.75, 1].map((scale) => points.map((point) => (
        `${center + (point.axisX - center) * scale},${center + (point.axisY - center) * scale}`
    )).join(' '));

    const setEmotionFromPointer = (clientX: number, clientY: number, emotion: IndexTtsEmotion) => {
        const bounds = svgRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const pointerX = (clientX - bounds.left) * 240 / bounds.width - center;
        const pointerY = (clientY - bounds.top) * 240 / bounds.height - center;
        const index = INDEX_TTS_EMOTIONS.indexOf(emotion);
        const angle = (Math.PI * 2 * index) / INDEX_TTS_EMOTIONS.length - Math.PI / 2;
        const projectedDistance = pointerX * Math.cos(angle) + pointerY * Math.sin(angle);
        onChange({ ...values, [emotion]: Math.round(clampEmotion(projectedDistance / radius) * 100) / 100 });
    };

    const beginDrag = (event: React.PointerEvent<SVGLineElement | SVGCircleElement>, emotion: IndexTtsEmotion) => {
        event.preventDefault();
        setActiveEmotion(emotion);
        svgRef.current?.setPointerCapture(event.pointerId);
        setEmotionFromPointer(event.clientX, event.clientY, emotion);
    };

    return <svg ref={svgRef} viewBox="0 0 240 240" role="img" aria-label="Interactive emotion radar" className="mx-auto aspect-square w-full max-w-64 touch-none select-none" onPointerMove={(event) => activeEmotion && setEmotionFromPointer(event.clientX, event.clientY, activeEmotion)} onPointerUp={(event) => { setActiveEmotion(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => setActiveEmotion(null)}>
        {rings.map((ring, index) => <polygon key={index} points={ring} fill="none" stroke="currentColor" className="text-border-primary" strokeWidth="1" />)}
        {points.map((point) => <line key={point.emotion} x1={center} y1={center} x2={point.axisX} y2={point.axisY} stroke="currentColor" className="text-border-primary" strokeWidth="1" />)}
        <polygon points={points.map((point) => `${point.valueX},${point.valueY}`).join(' ')} fill="rgb(251 191 36 / 0.16)" stroke="rgb(161 161 170)" strokeWidth="1.5" />
        {points.map((point) => <React.Fragment key={point.emotion}>
            <line x1={center} y1={center} x2={point.valueX} y2={point.valueY} stroke={EMOTION_COLORS[point.emotion]} strokeWidth="2" />
            <line x1={center} y1={center} x2={point.axisX} y2={point.axisY} stroke="transparent" strokeWidth="18" className="cursor-pointer" onPointerDown={(event) => beginDrag(event, point.emotion)} />
            <circle cx={point.valueX} cy={point.valueY} r={activeEmotion === point.emotion ? 6 : 4.5} fill={EMOTION_COLORS[point.emotion]} stroke="#18181b" strokeWidth="2" className="cursor-grab" onPointerDown={(event) => beginDrag(event, point.emotion)} />
            <text x={point.labelX} y={point.labelY} textAnchor="middle" dominantBaseline="middle" fill={EMOTION_COLORS[point.emotion]} className="pointer-events-none text-[9px] font-semibold">{point.emotion}</text>
        </React.Fragment>)}
    </svg>;
};

const EmotionEditor: React.FC<{
    values: IndexTtsEmotionVector;
    onChange: (values: IndexTtsEmotionVector) => void;
}> = ({ values, onChange }) => <div>
    <EmotionRadar values={values} onChange={onChange} />
    <p className="mt-1 text-center text-[10px] text-text-muted">Drag a colored point or click its axis.</p>
    <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {INDEX_TTS_EMOTIONS.map((emotion) => <label key={emotion} className="text-[11px] font-semibold text-text-secondary">
            <span className="flex justify-between"><span style={{ color: EMOTION_COLORS[emotion] }}>{emotion}</span><span style={{ color: EMOTION_COLORS[emotion] }}>{values[emotion].toFixed(2)}</span></span>
            <input type="range" min="0" max="1" step="0.01" value={values[emotion]} onChange={(event) => onChange({ ...values, [emotion]: Number(event.target.value) })} style={{ accentColor: EMOTION_COLORS[emotion] }} className="mt-1 w-full" />
        </label>)}
    </div>
</div>;

const writeAscii = (view: DataView, offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
};

const audioBufferToWav = (buffers: AudioBuffer[], pauseMs: number) => {
    const sampleRate = buffers[0].sampleRate;
    const channels = Math.max(...buffers.map((buffer) => buffer.numberOfChannels));
    const pauseFrames = Math.round(sampleRate * pauseMs / 1000);
    const totalFrames = buffers.reduce((total, buffer) => total + buffer.length, 0) + pauseFrames * Math.max(0, buffers.length - 1);
    const output = new ArrayBuffer(44 + totalFrames * channels * 2);
    const view = new DataView(output);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, output.byteLength - 8, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, totalFrames * channels * 2, true);
    let frameOffset = 0;
    buffers.forEach((buffer, bufferIndex) => {
        for (let frame = 0; frame < buffer.length; frame += 1) {
            for (let channel = 0; channel < channels; channel += 1) {
                const samples = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
                const sample = Math.min(1, Math.max(-1, samples[frame] || 0));
                view.setInt16(44 + (frameOffset * channels + channel) * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            }
            frameOffset += 1;
        }
        if (bufferIndex < buffers.length - 1) frameOffset += pauseFrames;
    });
    return new Blob([output], { type: 'audio/wav' });
};

const mergeAudioUrls = async (urls: string[], pauseMs: number) => {
    if (urls.length === 1) return fetch(urls[0]).then((response) => response.blob());
    const context = new AudioContext();
    try {
        const buffers = await Promise.all(urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not read generated audio (${response.status}).`);
            return context.decodeAudioData(await response.arrayBuffer());
        }));
        const sampleRate = buffers[0].sampleRate;
        if (buffers.some((buffer) => buffer.sampleRate !== sampleRate)) throw new Error('Generated lines use incompatible sample rates.');
        return audioBufferToWav(buffers, pauseMs);
    } finally {
        await context.close();
    }
};

const createAudioThumbnail = () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#111318"/><circle cx="128" cy="112" r="58" fill="#fbbf24"/><path d="M128 65a22 22 0 0 0-22 22v48a22 22 0 0 0 44 0V87a22 22 0 0 0-22-22Zm-48 64v8a48 48 0 0 0 96 0v-8h-12v8a36 36 0 0 1-72 0v-8H80Zm42 56v18h-25v12h62v-12h-25v-18h-12Z" fill="#111318"/><text x="128" y="240" text-anchor="middle" fill="#fafafa" font-family="sans-serif" font-size="18" font-weight="700">INDEX TTS</text></svg>';
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const createCharacterThumbnailCollage = async (thumbnails: string[]) => {
    const sources = thumbnails.filter(Boolean).slice(0, 4);
    if (sources.length === 0) return createAudioThumbnail();
    if (sources.length === 1) return sources[0];
    const images = await Promise.all(sources.map((source) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not compose the character thumbnails.'));
        image.src = source;
    })));
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return sources[0];
    context.fillStyle = '#111318';
    context.fillRect(0, 0, 512, 512);
    const layouts = images.length === 2
        ? [[0, 0, 256, 512], [256, 0, 256, 512]]
        : images.length === 3
            ? [[0, 0, 256, 512], [256, 0, 256, 256], [256, 256, 256, 256]]
            : [[0, 0, 256, 256], [256, 0, 256, 256], [0, 256, 256, 256], [256, 256, 256, 256]];
    images.forEach((image, index) => {
        const [x, y, width, height] = layouts[index];
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const sourceWidth = width / scale;
        const sourceHeight = height / scale;
        context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
    });
    return canvas.toDataURL('image/jpeg', 0.9);
};

const VoiceFilePreview: React.FC<{ file: File }> = ({ file }) => {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const nextUrl = URL.createObjectURL(file);
        setUrl(nextUrl);
        return () => URL.revokeObjectURL(nextUrl);
    }, [file]);
    return url ? <AudioPlayer src={url} label="Voice reference" detail={file.name} compact /> : null;
};

export const TtsAdvancedPanel: React.FC<TtsAdvancedPanelProps> = ({ isComfyUIConnected }) => {
    const dispatch: AppDispatch = useDispatch();
    const firstCharacter = useRef(createCharacter(1)).current;
    const uploadInput = useRef<HTMLInputElement>(null);
    const thumbnailInput = useRef<HTMLInputElement>(null);
    const [mode, setMode] = useState<'solo' | 'dialogue'>('solo');
    const [characters, setCharacters] = useState<AdvancedCharacter[]>([firstCharacter]);
    const [lines, setLines] = useState<DialogueLine[]>([createLine(firstCharacter.id)]);
    const [selectedCharacterId, setSelectedCharacterId] = useState(firstCharacter.id);
    const [selectedLineId, setSelectedLineId] = useState(lines[0].id);
    const [voiceTargetId, setVoiceTargetId] = useState(firstCharacter.id);
    const [thumbnailTargetId, setThumbnailTargetId] = useState(firstCharacter.id);
    const [referenceSaveStatuses, setReferenceSaveStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [suiteVoices, setSuiteVoices] = useState<TtsReferenceVoice[]>([]);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [engine, setEngine] = useState(DEFAULT_ENGINE);
    const [pauseMs, setPauseMs] = useState(300);
    const [dialogueTheme, setDialogueTheme] = useState<TtsDialogueTheme>('surprise');
    const [dialogueDuration, setDialogueDuration] = useState(8);
    const [conversationDirection, setConversationDirection] = useState<'continue' | 'new-topic'>('continue');
    const [isGeneratingDialogue, setIsGeneratingDialogue] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [generationSnapshot, setGenerationSnapshot] = useState<IndexTtsGenerationInfo | null>(null);

    const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) || characters[0];
    const selectedLine = lines.find((line) => line.id === selectedLineId) || lines[0];
    const usesIndexTtsLanguage = INDEX_TTS_LANGUAGES.includes(engine.language as typeof INDEX_TTS_LANGUAGES[number]);

    useEffect(() => {
        if (!isComfyUIConnected) return;
        let disposed = false;
        getTtsReferenceVoices().then((voices) => {
            if (disposed) return;
            setSuiteVoices(voices);
            setCharacters((current) => current.map((character) => character.suiteVoice ? character : { ...character, suiteVoice: voices[0]?.value || '' }));
        }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load installed voices.'));
        return () => { disposed = true; };
    }, [isComfyUIConnected]);

    useEffect(() => () => {
        if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    }, [audioUrl]);

    const updateCharacter = (id: string, changes: Partial<AdvancedCharacter>) => {
        setCharacters((current) => current.map((character) => character.id === id ? { ...character, ...changes } : character));
        setReferenceSaveStatuses((current) => ({ ...current, [id]: 'idle' }));
        setSaveStatus('idle');
    };

    const updateLine = (id: string, changes: Partial<DialogueLine>) => {
        setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
        setSaveStatus('idle');
    };

    const selectLanguage = (language: string) => {
        setEngine((current) => ({ ...current, language }));
        if (!INDEX_TTS_LANGUAGES.includes(language as typeof INDEX_TTS_LANGUAGES[number])) {
            setLines((current) => current.map((line) => line.emotionMode === 'qwen' ? { ...line, emotionMode: 'character' } : line));
        }
    };

    const addCharacter = () => {
        const character = { ...createCharacter(characters.length + 1), suiteVoice: suiteVoices[0]?.value || '' };
        setCharacters((current) => [...current, character]);
        setSelectedCharacterId(character.id);
        if (mode === 'dialogue') {
            const line = createLine(character.id);
            setLines((current) => [...current, line]);
            setSelectedLineId(line.id);
        }
    };

    const removeCharacter = (id: string) => {
        if (characters.length === 1) return;
        const remaining = characters.filter((character) => character.id !== id);
        setCharacters(remaining);
        setLines((current) => current.map((line) => line.characterId === id ? { ...line, characterId: remaining[0].id } : line));
        setSelectedCharacterId(remaining[0].id);
    };

    const addLine = () => {
        const line = createLine(selectedCharacter?.id || characters[0].id);
        setLines((current) => [...current, line]);
        setSelectedLineId(line.id);
    };

    const removeLine = (id: string) => {
        if (lines.length === 1) return;
        const remaining = lines.filter((line) => line.id !== id);
        setLines(remaining);
        if (selectedLineId === id) setSelectedLineId(remaining[0].id);
    };

    const moveLine = (id: string, direction: -1 | 1) => {
        setLines((current) => {
            const index = current.findIndex((line) => line.id === id);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const beginUpload = (characterId: string) => {
        setVoiceTargetId(characterId);
        uploadInput.current?.click();
    };

    const beginThumbnailUpload = (characterId: string) => {
        setThumbnailTargetId(characterId);
        thumbnailInput.current?.click();
    };

    const selectUploadedVoice = (file: File | null) => {
        if (!file) return;
        updateCharacter(voiceTargetId, { voiceSource: 'upload', referenceFile: file, referenceName: file.name, thumbnail: '' });
        if (uploadInput.current) uploadInput.current.value = '';
    };

    const selectReferenceThumbnail = async (file: File | null) => {
        if (!file) return;
        try {
            updateCharacter(thumbnailTargetId, { thumbnail: await fileToResizedDataUrl(file, 512) });
        } catch {
            setError('Could not read the reference thumbnail.');
        }
        if (thumbnailInput.current) thumbnailInput.current.value = '';
    };

    const saveReferenceToLibrary = async (character: AdvancedCharacter) => {
        if (!character.referenceFile || character.voiceSource !== 'upload' || referenceSaveStatuses[character.id] === 'saving') return;
        const referenceName = character.name.trim();
        if (!hasExplicitCharacterName(referenceName)) {
            setError('Enter a character name before saving this voice reference.');
            return;
        }
        setReferenceSaveStatuses((current) => ({ ...current, [character.id]: 'saving' }));
        setError('');
        try {
            await dispatch(addToLibrary({
                name: referenceName,
                mediaType: 'tts-reference',
                media: await fileToDataUrl(character.referenceFile),
                thumbnail: character.thumbnail || createAudioThumbnail(),
            })).unwrap();
            setReferenceSaveStatuses((current) => ({ ...current, [character.id]: 'saved' }));
        } catch (saveError) {
            setReferenceSaveStatuses((current) => ({ ...current, [character.id]: 'idle' }));
            setError(saveError instanceof Error ? saveError.message : 'Could not save the voice reference.');
        }
    };

    const selectLibraryVoice = async (item: LibraryItem) => {
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error(`Could not read library voice (${response.status}).`);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1]?.replace('mpeg', 'mp3').replace('x-wav', 'wav') || 'wav';
            updateCharacter(voiceTargetId, {
                voiceSource: 'library',
                referenceFile: new File([blob], `${item.name || 'library-voice'}.${extension}`, { type: getAudioMimeType(item.name || '', blob.type) }),
                referenceName: item.name || 'Library voice',
                thumbnail: item.thumbnail || '',
            });
            setError('');
        } catch (selectionError) {
            setError(selectionError instanceof Error ? selectionError.message : 'Could not load the library voice.');
        }
    };

    const getReference = (character: AdvancedCharacter): ChatterboxTtsReference | null => {
        if (character.voiceSource === 'suite') return character.suiteVoice ? { type: 'suite', voice: character.suiteVoice } : null;
        return character.referenceFile ? { type: 'upload', file: character.referenceFile } : null;
    };

    const activeLines = mode === 'solo' ? lines.slice(0, 1) : lines;
    const canGenerate = Boolean(isComfyUIConnected) && activeLines.every((line) => {
        const character = characters.find((item) => item.id === line.characterId);
        return line.text.trim() && character && getReference(character);
    });

    const generateRandomDialogue = async () => {
        if (!selectedLine || isGeneratingDialogue) return;
        setIsGeneratingDialogue(true);
        setError('');
        try {
            if (mode === 'solo') {
                const result = await generateTtsDialogue(dialogueTheme, dialogueDuration, engine.language as typeof CHATTERBOX_LANGUAGES[number]);
                updateLine(activeLines[0].id, { text: result.text });
                return;
            }
            const selectedIndex = lines.findIndex((line) => line.id === selectedLine.id);
            const character = characters.find((item) => item.id === selectedLine.characterId) || selectedCharacter;
            const previousLines = lines.slice(0, Math.max(0, selectedIndex)).map((line) => ({
                characterName: characters.find((item) => item.id === line.characterId)?.name || 'Character',
                text: line.text,
            }));
            const result = await generateTtsConversationLine(
                dialogueTheme,
                dialogueDuration,
                engine.language as typeof CHATTERBOX_LANGUAGES[number],
                character?.name || 'Character',
                previousLines,
                conversationDirection,
            );
            updateLine(selectedLine.id, { text: result.text });
        } catch (dialogueError) {
            setError(dialogueError instanceof Error ? dialogueError.message : 'Could not generate random dialogue.');
        } finally {
            setIsGeneratingDialogue(false);
        }
    };

    const generate = async () => {
        if (!canGenerate || isGenerating) return;
        setIsGenerating(true);
        setError('');
        setSaveStatus('idle');
        setGenerationSnapshot(null);
        if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
        setAudioUrl('');
        setAudioBlob(null);
        try {
            const urls: string[] = [];
            for (let index = 0; index < activeLines.length; index += 1) {
                const line = activeLines[index];
                const character = characters.find((item) => item.id === line.characterId)!;
                const reference = getReference(character)!;
                const emotions = line.emotionMode === 'manual' ? line.emotions : character.emotions;
                const updateLineProgress = (message: string, value: number) => {
                    setProgressMessage(`${character.name} · line ${index + 1}/${activeLines.length} · ${message}`);
                    setProgress((index + value) / activeLines.length);
                };
                const url = usesIndexTtsLanguage
                    ? await generateIndexTts(line.text, reference, {
                        ...engine,
                        emotionMode: line.emotionMode === 'qwen' ? 'qwen' : 'manual',
                        emotionPrompt: line.emotionPrompt,
                        emotions,
                    }, updateLineProgress)
                    : await generateChatterboxTts(line.text, reference, {
                        language: engine.language as typeof CHATTERBOX_LANGUAGES[number],
                        device: engine.device,
                        exaggeration: engine.emotionAlpha,
                        temperature: engine.temperature,
                        cfgWeight: 0.5,
                        seed: engine.seed,
                        audioPromptPath: '',
                        enableChunking: engine.enableChunking,
                        maxCharsPerChunk: engine.maxCharsPerChunk,
                        chunkCombinationMethod: 'auto',
                        silenceBetweenChunksMs: engine.intervalSilence,
                        filenamePrefix: 'audio/TTS-Advanced-Multilingual',
                    }, updateLineProgress);
                urls.push(url);
            }
            setProgressMessage('Assembling dialogue...');
            const blob = await mergeAudioUrls(urls, pauseMs);
            const url = URL.createObjectURL(blob);
            setAudioBlob(blob);
            setAudioUrl(url);
            setProgress(1);
            setProgressMessage('IndexTTS audio ready.');
            setGenerationSnapshot({
                mode,
                engine: usesIndexTtsLanguage ? 'index-tts' : 'chatterbox-multilingual',
                modelPath: engine.modelPath,
                language: engine.language,
                pauseMs,
                characters: characters.map((character) => ({
                    id: character.id,
                    name: character.name,
                    referenceAudioName: character.voiceSource === 'suite'
                        ? suiteVoices.find((voice) => voice.value === character.suiteVoice)?.label || character.suiteVoice
                        : character.referenceName,
                    referenceSource: character.voiceSource,
                    thumbnail: character.thumbnail || undefined,
                    emotions: { ...character.emotions },
                })),
                lines: activeLines.map((line) => ({
                    characterId: line.characterId,
                    text: line.text.trim(),
                    emotionMode: line.emotionMode === 'character' ? 'manual' : line.emotionMode,
                    emotionPrompt: line.emotionPrompt,
                    emotions: line.emotionMode === 'manual' ? { ...line.emotions } : undefined,
                })),
            });
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'IndexTTS generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    const saveToLibrary = async () => {
        if (!audioBlob || !generationSnapshot || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        try {
            const media = await fileToDataUrl(new File([audioBlob], 'index-tts-advanced.wav', { type: 'audio/wav' }));
            const firstText = generationSnapshot.lines[0]?.text.split(/\s+/).slice(0, 6).join(' ') || 'Dialogue';
            const thumbnail = await createCharacterThumbnailCollage(generationSnapshot.characters.map((character) => character.thumbnail || ''));
            await dispatch(addToLibrary({
                name: `IndexTTS - ${firstText}${generationSnapshot.lines[0]?.text.split(/\s+/).length > 6 ? '...' : ''}`,
                mediaType: 'audio-tts',
                media,
                thumbnail,
                indexTtsOptions: generationSnapshot,
            })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save IndexTTS audio.');
        }
    };

    const lineEmotionValues = selectedLine?.emotionMode === 'manual' ? selectedLine.emotions : selectedCharacter?.emotions || DEFAULT_EMOTIONS;

    return <>
        <section className="overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-lg">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
                <div><h2 className="flex items-center gap-2 text-xl font-bold text-accent"><MicrophoneIcon className="h-6 w-6" />TTS Advanced</h2><p className="mt-1 text-xs text-text-muted">IndexTTS emotions · 23-language ChatterBox fallback · solo and dialogue</p></div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isComfyUIConnected ? 'bg-green-500/15 text-green-400' : 'bg-danger-bg text-danger'}`}>ComfyUI {isComfyUIConnected ? 'connected' : 'offline'}</div>
            </header>

            <div className="border-b border-border-primary p-4">
                <div className="mx-auto grid max-w-sm grid-cols-2 rounded-md border border-border-primary bg-bg-primary p-1">
                    {(['solo', 'dialogue'] as const).map((nextMode) => <button key={nextMode} onClick={() => setMode(nextMode)} className={`h-9 rounded text-sm font-bold capitalize ${mode === nextMode ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'}`}>{nextMode}</button>)}
                </div>
            </div>

            <div className="grid xl:grid-cols-[280px_minmax(360px,1fr)_380px]">
                <aside className="border-b border-border-primary p-4 xl:border-b-0 xl:border-r">
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold uppercase text-text-secondary">Characters</h3>{mode === 'dialogue' && <button onClick={addCharacter} className="rounded border border-accent px-2 py-1 text-xs font-bold text-accent">+ Add</button>}</div>
                    <div className="space-y-3">
                        {(mode === 'solo' ? characters.slice(0, 1) : characters).map((character, index) => <article key={character.id} onClick={() => setSelectedCharacterId(character.id)} className={`rounded-md border p-3 ${selectedCharacter?.id === character.id ? 'border-accent bg-accent/5' : 'border-border-primary bg-bg-primary'}`}>
                            <div className="flex items-center gap-2">
                                {character.thumbnail ? <img src={character.thumbnail} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded bg-bg-tertiary"><MicrophoneIcon className="h-4 w-4 text-accent" /></div>}
                                <input value={character.name} onChange={(event) => updateCharacter(character.id, { name: event.target.value })} onClick={(event) => event.stopPropagation()} aria-label={`Character ${index + 1} name`} className="min-w-0 flex-1 border-b border-border-primary bg-transparent py-1 text-sm font-bold outline-none focus:border-accent" />
                                {mode === 'dialogue' && characters.length > 1 && <button onClick={(event) => { event.stopPropagation(); removeCharacter(character.id); }} title="Remove character" aria-label="Remove character" className="p-1 text-danger"><TrashIcon className="h-4 w-4" /></button>}
                            </div>
                            <div className="mt-3 grid grid-cols-3 rounded border border-border-primary p-1">
                                <button onClick={() => updateCharacter(character.id, { voiceSource: 'suite' })} className={`h-7 rounded text-[10px] font-bold ${character.voiceSource === 'suite' ? 'bg-accent text-accent-text' : 'text-text-muted'}`}>Installed</button>
                                <button onClick={() => { setVoiceTargetId(character.id); setLibraryOpen(true); }} className={`h-7 rounded text-[10px] font-bold ${character.voiceSource === 'library' ? 'bg-accent text-accent-text' : 'text-text-muted'}`}>Library</button>
                                <button onClick={() => beginUpload(character.id)} className={`h-7 rounded text-[10px] font-bold ${character.voiceSource === 'upload' ? 'bg-accent text-accent-text' : 'text-text-muted'}`}>Upload</button>
                            </div>
                            {character.voiceSource === 'suite' && <select value={character.suiteVoice} onChange={(event) => updateCharacter(character.id, { suiteVoice: event.target.value })} className="mt-2 h-9 w-full rounded border border-border-primary bg-bg-tertiary px-2 text-xs"><option value="">Choose installed voice</option>{suiteVoices.map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}</select>}
                            {character.voiceSource === 'library' && <button onClick={() => { setVoiceTargetId(character.id); setLibraryOpen(true); }} className="mt-2 w-full truncate rounded border border-border-primary px-2 py-2 text-xs text-text-secondary"><LibraryIcon className="mr-1 inline h-3.5 w-3.5" />{character.referenceName || 'Choose Library voice'}</button>}
                            {character.voiceSource === 'upload' && <div className="mt-2 space-y-2">
                                <button onClick={() => beginUpload(character.id)} className="flex min-h-16 w-full items-center justify-center gap-2 rounded border border-dashed border-border-primary bg-bg-tertiary px-2 text-xs text-text-secondary hover:border-accent"><UploadCloudIcon className="h-4 w-4 flex-none" /><span className="min-w-0 truncate">{character.referenceFile?.name || 'Choose voice audio'}</span></button>
                                {character.referenceFile && <VoiceFilePreview file={character.referenceFile} />}
                                {character.referenceFile && <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => beginThumbnailUpload(character.id)} className="flex h-9 items-center justify-center gap-1 rounded border border-border-primary text-[10px] font-bold text-text-secondary hover:border-accent"><PhotographIcon className="h-3.5 w-3.5" />{character.thumbnail ? 'Change photo' : 'Add photo'}</button>
                                    <button onClick={() => saveReferenceToLibrary(character)} disabled={!hasExplicitCharacterName(character.name) || referenceSaveStatuses[character.id] === 'saving' || referenceSaveStatuses[character.id] === 'saved'} title={!hasExplicitCharacterName(character.name) ? 'Enter a custom character name first' : undefined} className={`flex h-9 items-center justify-center gap-1 rounded text-[10px] font-bold ${referenceSaveStatuses[character.id] === 'saved' ? 'bg-green-500 text-black' : 'bg-accent text-accent-text'} disabled:cursor-not-allowed disabled:opacity-45`}>{referenceSaveStatuses[character.id] === 'saving' ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : referenceSaveStatuses[character.id] === 'saved' ? <CheckIcon className="h-3.5 w-3.5" /> : <SaveIcon className="h-3.5 w-3.5" />}{referenceSaveStatuses[character.id] === 'saving' ? 'Saving...' : referenceSaveStatuses[character.id] === 'saved' ? 'Saved' : 'Save reference'}</button>
                                </div>}
                            </div>}
                        </article>)}
                    </div>
                    <input ref={uploadInput} type="file" accept="audio/*" className="hidden" onChange={(event) => selectUploadedVoice(event.target.files?.[0] || null)} />
                    <input ref={thumbnailInput} type="file" accept="image/*" className="hidden" onChange={(event) => void selectReferenceThumbnail(event.target.files?.[0] || null)} />

                    <button onClick={() => setAdvancedOpen((open) => !open)} className="mt-4 flex w-full items-center justify-between rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-xs font-bold text-text-secondary"><span>Engine settings</span><span>{advancedOpen ? '−' : '+'}</span></button>
                    {advancedOpen && <div className="mt-2 space-y-3 rounded-md border border-border-primary bg-bg-primary p-3">
                        <label className="block text-[10px] font-bold text-text-secondary">MODEL<input value={engine.modelPath} onChange={(event) => setEngine((current) => ({ ...current, modelPath: event.target.value }))} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-xs" /></label>
                        <p className="rounded bg-bg-tertiary p-2 text-[10px] leading-4 text-text-muted">{usesIndexTtsLanguage ? 'IndexTTS 2.5 · full emotion radar and Auto Qwen' : 'ChatterBox multilingual · voice cloning and dialogue; detailed IndexTTS emotions are unavailable'}</p>
                        <label className="block text-[10px] font-bold text-text-secondary">TEMPERATURE <span className="float-right text-accent">{engine.temperature.toFixed(2)}</span><input type="range" min="0.1" max="1.5" step="0.05" value={engine.temperature} onChange={(event) => setEngine((current) => ({ ...current, temperature: Number(event.target.value) }))} className="mt-1 w-full accent-accent" /></label>
                        <label className="block text-[10px] font-bold text-text-secondary">EMOTION STRENGTH <span className="float-right text-accent">{engine.emotionAlpha.toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" value={engine.emotionAlpha} onChange={(event) => setEngine((current) => ({ ...current, emotionAlpha: Number(event.target.value) }))} className="mt-1 w-full accent-accent" /></label>
                        <label className="block text-[10px] font-bold text-text-secondary">SPEED <span className="float-right text-accent">{engine.durationFactor.toFixed(2)}×</span><input type="range" min="0.5" max="1.5" step="0.05" value={engine.durationFactor} onChange={(event) => setEngine((current) => ({ ...current, durationFactor: Number(event.target.value) }))} className="mt-1 w-full accent-accent" /></label>
                        <label className="block text-[10px] font-bold text-text-secondary">SEED<div className="mt-1 flex gap-2"><input type="number" value={engine.seed} onChange={(event) => setEngine((current) => ({ ...current, seed: Number(event.target.value) }))} className="min-w-0 flex-1 rounded border border-border-primary bg-bg-tertiary p-2 text-xs" /><button onClick={() => setEngine((current) => ({ ...current, seed: Math.floor(Math.random() * 2147483647) }))} title="Random seed" aria-label="Random seed" className="rounded border border-border-primary p-2 text-accent"><DiceIcon className="h-4 w-4" /></button></div></label>
                    </div>}
                </aside>

                <main className="border-b border-border-primary p-4 xl:border-b-0 xl:border-r">
                    <div className="mb-4 grid gap-2 rounded-md border border-border-primary bg-bg-primary p-3 sm:grid-cols-3">
                        <label className="text-[10px] font-bold uppercase text-text-secondary">Language
                            <select value={engine.language} onChange={(event) => selectLanguage(event.target.value)} className="mt-1 block h-9 w-full rounded border border-border-primary bg-bg-tertiary px-2 text-xs font-medium normal-case text-text-primary">
                                {CHATTERBOX_LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                            </select>
                        </label>
                        <label className="text-[10px] font-bold uppercase text-text-secondary">Dialogue style
                            <select value={dialogueTheme} onChange={(event) => setDialogueTheme(event.target.value as TtsDialogueTheme)} className="mt-1 block h-9 w-full rounded border border-border-primary bg-bg-tertiary px-2 text-xs font-medium normal-case text-text-primary">
                                {TTS_DIALOGUE_THEMES.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[10px] font-bold uppercase text-text-secondary">Target time
                            <select value={dialogueDuration} onChange={(event) => setDialogueDuration(Number(event.target.value))} className="mt-1 block h-9 w-full rounded border border-border-primary bg-bg-tertiary px-2 text-xs font-medium normal-case text-text-primary">
                                {Array.from({ length: 13 }, (_, index) => index + 3).map((seconds) => <option key={seconds} value={seconds}>{seconds} sec</option>)}
                            </select>
                        </label>
                        {mode === 'dialogue' && <div className="grid grid-cols-2 rounded border border-border-primary bg-bg-tertiary p-1 sm:col-span-3" role="group" aria-label="Conversation direction">
                            <button onClick={() => setConversationDirection('continue')} aria-pressed={conversationDirection === 'continue'} className={`h-8 rounded text-[10px] font-bold ${conversationDirection === 'continue' ? 'bg-cyan-500 text-zinc-950' : 'text-cyan-300 hover:bg-cyan-500/10'}`}>Continue conversation</button>
                            <button onClick={() => setConversationDirection('new-topic')} aria-pressed={conversationDirection === 'new-topic'} className={`h-8 rounded text-[10px] font-bold ${conversationDirection === 'new-topic' ? 'bg-fuchsia-500 text-white' : 'text-fuchsia-300 hover:bg-fuchsia-500/10'}`}>Change subject</button>
                        </div>}
                        <button onClick={generateRandomDialogue} disabled={isGeneratingDialogue || !selectedLine} className="flex h-10 items-center justify-center gap-2 rounded bg-amber-400 text-xs font-bold text-zinc-950 hover:bg-amber-300 disabled:opacity-40 sm:col-span-3">
                            {isGeneratingDialogue ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DiceIcon className="h-4 w-4" />}{isGeneratingDialogue ? 'Writing...' : mode === 'solo' ? 'Random Dialogue' : 'Generate selected line'}
                        </button>
                    </div>
                    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-bold uppercase text-text-secondary">{mode === 'solo' ? 'Text to speak' : 'Dialogue lines'}</h3><p className="mt-1 text-[11px] text-text-muted">Select a line to control its emotion.</p></div>{mode === 'dialogue' && <button onClick={addLine} className="rounded border border-accent px-3 py-2 text-xs font-bold text-accent">+ Add line</button>}</div>
                    <div className="space-y-3">
                        {activeLines.map((line, index) => {
                            const lineCharacter = characters.find((character) => character.id === line.characterId);
                            return <article key={line.id} onClick={() => { setSelectedLineId(line.id); setSelectedCharacterId(line.characterId); }} className={`rounded-md border p-3 ${selectedLine?.id === line.id ? 'border-accent bg-accent/5' : 'border-border-primary bg-bg-primary'}`}>
                            <div className="mb-2 flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded bg-bg-tertiary text-xs font-bold text-accent">{index + 1}</span>
                                {lineCharacter?.thumbnail ? <img src={lineCharacter.thumbnail} alt={`${lineCharacter.name} thumbnail`} className={`h-8 w-8 flex-none rounded object-cover ring-1 ${selectedLine?.id === line.id ? 'ring-accent' : 'ring-border-primary'}`} /> : <span title={`${lineCharacter?.name || 'Character'} has no thumbnail`} className={`flex h-8 w-8 flex-none items-center justify-center rounded bg-bg-tertiary ring-1 ${selectedLine?.id === line.id ? 'ring-accent' : 'ring-border-primary'}`}><MicrophoneIcon className="h-3.5 w-3.5 text-text-muted" /></span>}
                                {mode === 'dialogue' && <select value={line.characterId} onChange={(event) => { updateLine(line.id, { characterId: event.target.value }); setSelectedCharacterId(event.target.value); }} className="min-w-0 flex-1 rounded border border-border-primary bg-bg-tertiary px-2 py-1 text-xs font-bold">{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}
                                {line.emotionMode === 'qwen' && <span className="rounded bg-cyan-500/15 px-2 py-1 text-[9px] font-bold text-cyan-300">AUTO</span>}
                                {line.emotionMode === 'manual' && <span className="rounded bg-amber-500/15 px-2 py-1 text-[9px] font-bold text-amber-300">CUSTOM</span>}
                                {mode === 'dialogue' && <><button onClick={() => moveLine(line.id, -1)} disabled={index === 0} title="Move line up" className="h-7 w-7 rounded border border-border-primary text-xs disabled:opacity-30">↑</button><button onClick={() => moveLine(line.id, 1)} disabled={index === activeLines.length - 1} title="Move line down" className="h-7 w-7 rounded border border-border-primary text-xs disabled:opacity-30">↓</button>{lines.length > 1 && <button onClick={() => removeLine(line.id)} title="Remove line" aria-label="Remove line" className="p-1 text-danger"><TrashIcon className="h-4 w-4" /></button>}</>}
                            </div>
                            <textarea value={line.text} onChange={(event) => updateLine(line.id, { text: event.target.value })} rows={mode === 'solo' ? 9 : 3} placeholder={mode === 'solo' ? 'Write what the voice should say...' : 'Write this character’s line...'} className="w-full resize-y rounded border border-border-primary bg-bg-tertiary p-3 text-sm leading-6 outline-none focus:border-accent" />
                        </article>})}
                    </div>
                    {mode === 'dialogue' && <label className="mt-4 block text-xs font-bold text-text-secondary">PAUSE BETWEEN LINES <span className="float-right text-accent">{pauseMs} ms</span><input type="range" min="0" max="2000" step="50" value={pauseMs} onChange={(event) => setPauseMs(Number(event.target.value))} className="mt-2 w-full accent-accent" /></label>}
                    <button onClick={generate} disabled={!canGenerate || isGenerating} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent font-bold text-accent-text hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Generating IndexTTS...' : mode === 'solo' ? 'Generate voice' : `Generate ${activeLines.length}-line dialogue`}</button>
                    {isGenerating && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-primary"><div className="h-full bg-accent" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></div>}
                    {error && <p className="mt-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                    {audioUrl && <div className="mt-5 border-t border-border-primary pt-5"><AudioPlayer src={audioUrl} label="IndexTTS result" detail={mode === 'dialogue' ? `${activeLines.length} dialogue lines` : selectedCharacter?.name} /><div className="mt-3 flex gap-2"><a href={audioUrl} download="index-tts-advanced.wav" className="flex h-10 items-center gap-2 rounded border border-border-primary px-4 text-sm font-bold text-accent"><DownloadIcon className="h-4 w-4" />Download</a><button onClick={saveToLibrary} disabled={saveStatus !== 'idle'} className={`flex h-10 items-center gap-2 rounded px-4 text-sm font-bold ${saveStatus === 'saved' ? 'bg-green-500 text-black' : 'bg-accent text-accent-text'} disabled:cursor-default`}>{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div></div>}
                </main>

                <aside className="p-4">
                    <h3 className="text-xs font-bold uppercase text-text-secondary">Emotion control</h3>
                    <p className="mt-1 text-[11px] text-text-muted">Editing {selectedLine ? `line ${activeLines.findIndex((line) => line.id === selectedLine.id) + 1}` : selectedCharacter?.name}</p>
                    {selectedLine && <div className="mt-3 grid grid-cols-3 rounded-md border border-border-primary bg-bg-primary p-1">
                        {(['character', 'qwen', 'manual'] as const).map((emotionMode) => <button key={emotionMode} onClick={() => updateLine(selectedLine.id, { emotionMode })} disabled={!usesIndexTtsLanguage && emotionMode !== 'character'} className={`h-8 rounded text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-30 ${selectedLine.emotionMode === emotionMode ? 'bg-accent text-accent-text' : 'text-text-muted'}`}>{emotionMode === 'character' ? 'Character' : emotionMode === 'qwen' ? 'Auto Qwen' : 'Custom'}</button>)}
                    </div>}
                    {!usesIndexTtsLanguage ? <div className="mt-4 rounded-md border border-border-primary bg-bg-primary p-4"><p className="text-sm font-bold text-text-primary">Multilingual voice mode</p><p className="mt-1 text-xs leading-5 text-text-muted">{engine.language} is generated by ChatterBox because the installed IndexTTS node only accepts English, Chinese, Japanese, Spanish and Arabic. Voice cloning, multiple characters and dialogue mixing remain available.</p></div> : selectedLine?.emotionMode === 'qwen' ? <div className="mt-4 rounded-md border border-cyan-500/30 bg-cyan-500/5 p-4"><p className="text-sm font-bold text-cyan-300">Automatic text emotion</p><p className="mt-1 text-xs leading-5 text-text-muted">Qwen interprets this line and directs IndexTTS automatically.</p><label className="mt-3 block text-[10px] font-bold text-text-secondary">DIRECTION<input value={selectedLine.emotionPrompt} onChange={(event) => updateLine(selectedLine.id, { emotionPrompt: event.target.value })} className="mt-1 w-full rounded border border-border-primary bg-bg-tertiary p-2 text-xs" /></label></div> : <div className="mt-3"><EmotionEditor values={lineEmotionValues} onChange={(emotions) => selectedLine?.emotionMode === 'manual' ? updateLine(selectedLine.id, { emotions }) : selectedCharacter && updateCharacter(selectedCharacter.id, { emotions })} /><p className="mt-3 text-center text-[10px] text-text-muted">{selectedLine?.emotionMode === 'manual' ? 'Custom values for this line' : `Default emotion for ${selectedCharacter?.name}`}</p></div>}
                </aside>
            </div>
        </section>
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={selectLibraryVoice} filter={['tts-reference', 'audio-tts']} />
    </>;
};
