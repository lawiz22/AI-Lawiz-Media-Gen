import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch } from '../store/store';
import { fileToDataUrl, fileToResizedDataUrl } from '../utils/imageUtils';
import { AudioPlayer } from './AudioPlayer';
import { CheckIcon, DownloadIcon, MicrophoneIcon, PhotographIcon, RefreshIcon, SaveIcon, SpinnerIcon, VolumeIcon } from './icons';

type RecordingSource = 'microphone' | 'system' | 'mixed';

const createVoiceThumbnail = () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#101416"/><circle cx="128" cy="112" r="58" fill="#22d3ee"/><path d="M128 65a22 22 0 0 0-22 22v48a22 22 0 0 0 44 0V87a22 22 0 0 0-22-22Zm-48 64v8a48 48 0 0 0 96 0v-8h-12v8a36 36 0 0 1-72 0v-8H80Zm42 56v18H97v12h62v-12h-25v-18h-12Z" fill="#101416"/><text x="128" y="240" text-anchor="middle" fill="#fafafa" font-family="sans-serif" font-size="17" font-weight="700">VOICE REF</text></svg>';
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

const convertToWav = async (blob: Blob) => {
    const context = new AudioContext();
    try {
        const buffer = await context.decodeAudioData(await blob.arrayBuffer());
        const channelCount = buffer.numberOfChannels;
        const dataLength = buffer.length * channelCount * 2;
        const output = new ArrayBuffer(44 + dataLength);
        const view = new DataView(output);
        const writeText = (offset: number, text: string) => Array.from(text).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
        writeText(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeText(8, 'WAVE');
        writeText(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * channelCount * 2, true);
        view.setUint16(32, channelCount * 2, true);
        view.setUint16(34, 16, true);
        writeText(36, 'data');
        view.setUint32(40, dataLength, true);
        const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
        let offset = 44;
        for (let frame = 0; frame < buffer.length; frame += 1) {
            for (let channel = 0; channel < channelCount; channel += 1) {
                const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }
        return new Blob([output], { type: 'audio/wav' });
    } finally {
        await context.close();
    }
};

export const VoiceRecorderPanel: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const recorderRef = useRef<MediaRecorder | null>(null);
    const sourceStreamsRef = useRef<MediaStream[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const timerRef = useRef<number | null>(null);
    const analyserFrameRef = useRef<number | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<RecordingSource>('microphone');
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [microphoneId, setMicrophoneId] = useState('');
    const [isLoadingDevices, setIsLoadingDevices] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [level, setLevel] = useState(0);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [recordingUrl, setRecordingUrl] = useState('');
    const [referenceName, setReferenceName] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [error, setError] = useState('');

    const stopSourceStreams = () => {
        sourceStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
        sourceStreamsRef.current = [];
        if (audioContextRef.current) void audioContextRef.current.close();
        audioContextRef.current = null;
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        if (analyserFrameRef.current !== null) window.cancelAnimationFrame(analyserFrameRef.current);
        analyserFrameRef.current = null;
        setLevel(0);
    };

    useEffect(() => {
        void navigator.mediaDevices?.enumerateDevices().then((devices) => {
            const inputs = devices.filter((device) => device.kind === 'audioinput');
            setMicrophones(inputs);
            setMicrophoneId((current) => current || inputs[0]?.deviceId || '');
        });
        const mediaDevices = navigator.mediaDevices;
        const refresh = () => void mediaDevices.enumerateDevices().then((devices) => setMicrophones(devices.filter((device) => device.kind === 'audioinput')));
        mediaDevices?.addEventListener('devicechange', refresh);
        return () => {
            mediaDevices?.removeEventListener('devicechange', refresh);
            recorderRef.current?.state === 'recording' && recorderRef.current.stop();
            stopSourceStreams();
        };
    }, []);

    useEffect(() => {
        if (!recordingBlob) {
            setRecordingUrl('');
            return;
        }
        const url = URL.createObjectURL(recordingBlob);
        setRecordingUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [recordingBlob]);

    const refreshMicrophones = async () => {
        setIsLoadingDevices(true);
        setError('');
        try {
            const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            permissionStream.getTracks().forEach((track) => track.stop());
            const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
            setMicrophones(inputs);
            setMicrophoneId((current) => inputs.some((device) => device.deviceId === current) ? current : inputs[0]?.deviceId || '');
        } catch (deviceError) {
            setError(deviceError instanceof Error ? deviceError.message : 'Microphone access was denied.');
        } finally {
            setIsLoadingDevices(false);
        }
    };

    const getMicrophoneStream = () => navigator.mediaDevices.getUserMedia({
        audio: {
            deviceId: microphoneId ? { exact: microphoneId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        },
    });

    const getSystemStream = async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (stream.getAudioTracks().length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('No computer audio was shared. Enable Share audio in the screen or browser-tab picker.');
        }
        return stream;
    };

    const startMeter = (stream: MediaStream) => {
        const context = audioContextRef.current || new AudioContext();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const update = () => {
            analyser.getByteFrequencyData(samples);
            setLevel(samples.reduce((sum, sample) => sum + sample, 0) / samples.length / 255);
            analyserFrameRef.current = window.requestAnimationFrame(update);
        };
        update();
    };

    const startRecording = async () => {
        if (isRecording || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') return;
        setError('');
        setRecordingBlob(null);
        setSaveStatus('idle');
        setElapsedSeconds(0);
        try {
            const microphoneStream = source !== 'system' ? await getMicrophoneStream() : null;
            const systemStream = source !== 'microphone' ? await getSystemStream() : null;
            const sources = [microphoneStream, systemStream].filter((stream): stream is MediaStream => Boolean(stream));
            sourceStreamsRef.current = sources;
            let recordingStream: MediaStream;
            if (sources.length === 1) {
                recordingStream = new MediaStream(sources[0].getAudioTracks());
            } else {
                const context = new AudioContext();
                audioContextRef.current = context;
                const destination = context.createMediaStreamDestination();
                sources.forEach((stream) => context.createMediaStreamSource(stream).connect(destination));
                recordingStream = destination.stream;
            }
            startMeter(recordingStream);
            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType, audioBitsPerSecond: 192000 } : undefined);
            const chunks: BlobPart[] = [];
            recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
            recorder.onstop = async () => {
                const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                if (blob.size > 0) {
                    try {
                        setRecordingBlob(await convertToWav(blob));
                    } catch {
                        setRecordingBlob(blob);
                        setError('The recording was kept in its original format because WAV conversion failed.');
                    }
                }
                setIsRecording(false);
                stopSourceStreams();
            };
            sources.flatMap((stream) => stream.getTracks()).forEach((track) => {
                track.onended = () => recorder.state === 'recording' && recorder.stop();
            });
            recorderRef.current = recorder;
            recorder.start(250);
            setIsRecording(true);
            timerRef.current = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
        } catch (recordingError) {
            stopSourceStreams();
            setError(recordingError instanceof Error ? recordingError.message : 'Could not start audio recording.');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    };

    const selectThumbnail = async (file: File | null) => {
        if (!file) return;
        try {
            setThumbnail(await fileToResizedDataUrl(file, 512));
            setSaveStatus('idle');
        } catch {
            setError('Could not read the reference photo.');
        }
    };

    const saveReference = async () => {
        const name = referenceName.trim();
        if (!recordingBlob || !name || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        setError('');
        try {
            const extension = recordingBlob.type.includes('wav') ? 'wav' : recordingBlob.type.includes('ogg') ? 'ogg' : 'webm';
            const media = await fileToDataUrl(new File([recordingBlob], `${name}.${extension}`, { type: recordingBlob.type }));
            await dispatch(addToLibrary({ name, mediaType: 'tts-reference', media, thumbnail: thumbnail || createVoiceThumbnail() })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save the voice reference.');
        }
    };

    const sourceOptions: Array<{ id: RecordingSource; label: string; detail: string }> = [
        { id: 'microphone', label: 'Microphone', detail: 'Selected input only' },
        { id: 'system', label: 'Computer audio', detail: 'Browser, player or desktop sound' },
        { id: 'mixed', label: 'Mic + computer', detail: 'Mix both sources' },
    ];

    return <section className="overflow-hidden rounded-lg border border-border-primary bg-bg-primary/50">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary p-5">
            <div><h2 className="flex items-center gap-2 text-xl font-bold text-accent"><MicrophoneIcon className="h-6 w-6" />Voice Recorder</h2><p className="mt-1 text-xs text-text-muted">Record a microphone, computer audio, or both as a reusable TTS voice reference.</p></div>
            <div className={`rounded-full px-3 py-1 text-xs font-bold ${isRecording ? 'bg-red-500/15 text-red-400' : 'bg-bg-tertiary text-text-muted'}`}>{isRecording ? `REC ${formatDuration(elapsedSeconds)}` : 'READY'}</div>
        </header>
        <div className="grid gap-6 p-5 lg:grid-cols-[340px_1fr]">
            <aside className="space-y-5">
                <div><span className="mb-2 block text-xs font-bold uppercase text-text-secondary">Recording source</span><div className="grid gap-2">{sourceOptions.map((option) => <button key={option.id} onClick={() => setSource(option.id)} disabled={isRecording} className={`flex items-center justify-between rounded-md border p-3 text-left ${source === option.id ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-secondary hover:border-accent'} disabled:opacity-50`}><span><strong className="block text-sm text-text-primary">{option.label}</strong><span className="text-xs text-text-muted">{option.detail}</span></span>{option.id === 'microphone' ? <MicrophoneIcon className="h-5 w-5 text-accent" /> : <VolumeIcon className="h-5 w-5 text-accent" />}</button>)}</div></div>
                {source !== 'system' && <label className="block text-xs font-bold uppercase text-text-secondary">Microphone<div className="mt-2 flex gap-2"><select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)} disabled={isRecording} className="min-w-0 flex-1 rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-sm normal-case text-text-primary"><option value="">System default</option>{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select><button onClick={() => void refreshMicrophones()} disabled={isRecording || isLoadingDevices} title="Refresh microphones and request access" className="rounded-md border border-border-primary p-2 text-accent hover:border-accent disabled:opacity-50">{isLoadingDevices ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <RefreshIcon className="h-5 w-5" />}</button></div></label>}
                {source !== 'microphone' && <p className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-200">When prompted, choose the screen or browser tab that is playing audio and enable audio sharing. In the desktop app, the main display’s system audio is captured directly.</p>}
            </aside>
            <div className="space-y-5">
                <div className="rounded-md border border-border-primary bg-bg-secondary p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold uppercase text-text-secondary">Input level</span><span className="font-mono text-sm text-text-primary">{formatDuration(elapsedSeconds)}</span></div><div className="h-12 overflow-hidden rounded bg-bg-primary p-1"><div className={`h-full rounded transition-[width] duration-75 ${level > 0.8 ? 'bg-red-400' : level > 0.45 ? 'bg-amber-400' : 'bg-cyan-400'}`} style={{ width: `${Math.max(isRecording ? 2 : 0, Math.min(100, level * 180))}%` }} /></div><button onClick={isRecording ? stopRecording : () => void startRecording()} className={`mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-md text-sm font-bold ${isRecording ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}><span className={isRecording ? 'h-4 w-4 rounded-sm bg-white' : 'h-4 w-4 rounded-full border-4 border-current'} />{isRecording ? 'Stop recording' : 'Start recording'}</button></div>
                {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                {recordingUrl && <div className="space-y-4 border-t border-border-primary pt-5"><AudioPlayer src={recordingUrl} label="Recorded voice" detail={`${sourceOptions.find((option) => option.id === source)?.label} · ${formatDuration(elapsedSeconds)}`} /><div className="grid gap-4 md:grid-cols-[1fr_180px]"><label className="text-xs font-bold uppercase text-text-secondary">Reference name<input value={referenceName} onChange={(event) => { setReferenceName(event.target.value); setSaveStatus('idle'); }} placeholder="Example: Karen Lawiz" className="mt-2 h-10 w-full rounded-md border border-border-primary bg-bg-secondary px-3 text-sm font-normal normal-case text-text-primary outline-none focus:border-accent" /></label><div><span className="text-xs font-bold uppercase text-text-secondary">Optional photo</span><button onClick={() => photoInputRef.current?.click()} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-bg-secondary text-xs font-bold text-text-secondary hover:border-accent"><PhotographIcon className="h-4 w-4" />{thumbnail ? 'Change photo' : 'Add photo'}</button><input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void selectThumbnail(event.target.files?.[0] || null)} /></div></div>{thumbnail && <img src={thumbnail} alt="Voice reference" className="h-24 w-24 rounded-md border border-border-primary object-cover" />}<div className="flex flex-wrap gap-2"><a href={recordingUrl} download={`${referenceName.trim() || 'voice-recording'}.${recordingBlob?.type.includes('wav') ? 'wav' : recordingBlob?.type.includes('ogg') ? 'ogg' : 'webm'}`} className="inline-flex h-10 items-center gap-2 rounded-md border border-border-primary px-4 text-sm font-semibold text-accent hover:border-accent"><DownloadIcon className="h-4 w-4" />Download</a><button onClick={() => void saveReference()} disabled={!referenceName.trim() || saveStatus !== 'idle'} className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-bold ${saveStatus === 'saved' ? 'bg-green-500 text-black' : 'bg-accent text-accent-text hover:bg-accent-hover'} disabled:cursor-not-allowed disabled:opacity-50`}>{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved to Library' : 'Save as voice reference'}</button></div></div>}
            </div>
        </div>
    </section>;
};