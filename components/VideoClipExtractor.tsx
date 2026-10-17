import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { fileToDataUrl, videoToThumbnail } from '../utils/imageUtils';
import { canSaveVideoClip, extractVideoClip } from '../services/videoClipService';
import { FilmIcon, DownloadIcon, SaveIcon, SpinnerIcon, StartFrameIcon, EndFrameIcon, CheckIcon, LibraryIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ResizeIcon } from './icons';

interface VideoClipExtractorProps {
    videoFile: File | null;
    onOpenLibrary: () => void;
    renderUploader: (disabled: boolean) => React.ReactNode;
}

interface ClipResult {
    file: File;
    name: string;
    duration: number;
}

const describeError = (error: unknown): string => error instanceof Error ? error.message : String(error);
const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;

export const VideoClipExtractor: React.FC<VideoClipExtractorProps> = ({ videoFile, onOpenLibrary, renderUploader }) => {
    const dispatch = useDispatch<AppDispatch>();
    const videoRef = useRef<HTMLVideoElement>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const sourceVersion = useRef(0);
    const [sourceURL, setSourceURL] = useState<string | null>(null);
    const [resultURL, setResultURL] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [fps, setFps] = useState(24);
    const [reduceResolution, setReduceResolution] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ClipResult | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        sourceVersion.current++;
        const url = videoFile ? URL.createObjectURL(videoFile) : null;
        setSourceURL(url);
        setDuration(0);
        setCurrentTime(0);
        setStart(0);
        setEnd(0);
        setReduceResolution(false);
        setResult(null);
        setSaveStatus('idle');
        setBusy(false);
        setError(null);
        return () => {
            sourceVersion.current++;
            controllerRef.current?.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [videoFile]);

    useEffect(() => {
        const url = result ? URL.createObjectURL(result.file) : null;
        setResultURL(url);
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [result]);

    const validRange = Number.isFinite(start) && Number.isFinite(end) && duration > 0 && start >= 0 && end > start && end <= duration;
    const disabled = busy || saveStatus === 'saving';
    const seek = (time: number) => {
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = Math.max(0, Math.min(duration, time));
        }
    };
    const extract = async () => {
        if (!videoFile || !validRange || disabled) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        const version = sourceVersion.current;
        videoRef.current?.pause();
        setBusy(true);
        setProgress(0);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        try {
            const { file, duration: clipDuration } = await extractVideoClip(videoFile, { start, end, duration, reduceResolution }, controller.signal, setProgress);
            if (version !== sourceVersion.current) return;
            const base = videoFile.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
            const name = `${base}_${start.toFixed(3)}-${end.toFixed(3)}${reduceResolution ? '_50pct' : ''}.mp4`;
            setResult({ file: new File([file], name, { type: 'video/mp4' }), name, duration: clipDuration });
        } catch (cause) {
            if (version !== sourceVersion.current) return;
            if (controller.signal.aborted) setError('Video extraction cancelled.');
            else {
                console.error('Failed to extract video clip:', cause);
                setError(describeError(cause));
            }
        } finally {
            if (version === sourceVersion.current) {
                setBusy(false);
                controllerRef.current = null;
            }
        }
    };
    const save = async () => {
        if (!result || !canSaveVideoClip(result.duration) || saveStatus !== 'idle') return;
        const version = sourceVersion.current;
        setSaveStatus('saving');
        setError(null);
        try {
            const [media, thumbnail] = await Promise.all([fileToDataUrl(result.file), videoToThumbnail(result.file, 256)]);
            await dispatch(addToLibrary({ mediaType: 'video', name: result.name, media, thumbnail })).unwrap();
            if (version === sourceVersion.current) setSaveStatus('saved');
        } catch (cause) {
            console.error('Failed to save video clip:', cause);
            if (version === sourceVersion.current) {
                setError(`Could not save to Library: ${describeError(cause)}`);
                setSaveStatus('idle');
            }
        }
    };
    const inputClass = 'w-full bg-bg-primary p-2 rounded-md border border-border-primary text-sm';
    const buttonClass = 'flex items-center justify-center gap-2 p-3 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover disabled:opacity-50 disabled:cursor-not-allowed';

    return <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
        <div className="flex items-center gap-3 mb-4"><FilmIcon className="w-8 h-8 text-accent" /><h2 className="text-2xl font-bold text-accent">Video Extractor</h2></div>
        <p className="text-sm text-text-secondary mb-6">Extract a video segment as MP4 with its original audio. Processing stays on this device.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <fieldset disabled={disabled} className="flex-grow">{renderUploader(disabled)}</fieldset>
                    <button disabled={disabled} onClick={onOpenLibrary} className={`${buttonClass} self-center mt-8`} title="Select video from Library"><LibraryIcon className="w-6 h-6" /></button>
                </div>
                {sourceURL && <div className="space-y-4 pt-4">
                    <video ref={videoRef} src={sourceURL} controls className="w-full rounded-lg bg-black"
                        onLoadedMetadata={event => {
                            const length = event.currentTarget.duration;
                            if (!Number.isFinite(length) || length <= 0) {
                                setError('This video does not have a valid finite duration.');
                                return;
                            }
                            setDuration(length);
                            setEnd(length);
                        }}
                        onError={() => setError('Could not preview this video. Choose a supported MP4, MOV or WEBM file.')}
                        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)} />
                    <div className="flex items-center gap-2">
                        <button onClick={() => seek(currentTime - 1)} className={buttonClass} title="Seek 1 Second Backward"><ChevronDoubleLeftIcon className="w-5 h-5" /></button>
                        <button onClick={() => seek(currentTime - 1 / fps)} className={buttonClass} title="Previous Frame"><ChevronLeftIcon className="w-5 h-5" /></button>
                        <input aria-label="Video position" type="range" min={0} max={duration} step={0.001} value={currentTime} onChange={event => seek(Number(event.target.value))} className="w-full" />
                        <button onClick={() => seek(currentTime + 1 / fps)} className={buttonClass} title="Next Frame"><ChevronRightIcon className="w-5 h-5" /></button>
                        <button onClick={() => seek(currentTime + 1)} className={buttonClass} title="Seek 1 Second Forward"><ChevronDoubleRightIcon className="w-5 h-5" /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm text-text-secondary">
                        <span className="font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                        <label className="flex items-center gap-2">FPS:<input aria-label="Video frame rate" type="number" min={1} max={240} step="any" value={fps} onChange={event => { const value = Number(event.target.value); if (value >= 1 && value <= 240) setFps(value); }} className="w-20 bg-bg-primary p-1 rounded border border-border-primary" /></label>
                    </div>
                    <p className="text-xs text-text-muted">Set the source FPS for frame stepping. Variable-frame-rate videos use time-based boundaries.</p>
                    <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
                        <label className="space-y-2 text-sm">Start frame (seconds)<input type="number" aria-label="Start frame (seconds)" min={0} max={duration} step={0.001} value={Number.isFinite(start) ? start : ''} onChange={event => setStart(event.target.value === '' ? NaN : Number(event.target.value))} className={inputClass} />
                            <button type="button" onClick={() => setStart(videoRef.current?.currentTime ?? 0)} className={`${buttonClass} w-full`}><StartFrameIcon className="w-5 h-5" />Set start here</button>
                        </label>
                        <label className="space-y-2 text-sm">End frame (seconds)<input type="number" aria-label="End frame (seconds)" min={0} max={duration} step={0.001} value={Number.isFinite(end) ? end : ''} onChange={event => setEnd(event.target.value === '' ? NaN : Number(event.target.value))} className={inputClass} />
                            <button type="button" onClick={() => setEnd(videoRef.current?.currentTime ?? 0)} className={`${buttonClass} w-full`}><EndFrameIcon className="w-5 h-5" />Set end here</button>
                        </label>
                    </fieldset>
                    <button disabled={disabled} aria-pressed={reduceResolution} onClick={() => setReduceResolution(value => !value)} className={`${buttonClass} w-full ${reduceResolution ? 'text-accent border border-accent' : ''}`}><ResizeIcon className="w-5 h-5" />{reduceResolution ? 'Resolution: 50% (click to restore)' : 'Reduce resolution (50%)'}</button>
                    <p className="text-sm text-text-secondary">{validRange ? `Selected duration: ${formatTime(end - start)}` : 'End must be after start and within the video.'}</p>
                    <button disabled={!validRange || disabled} onClick={extract} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-accent text-accent-text font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                        {busy ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <FilmIcon className="w-5 h-5" />}{busy ? `Extracting MP4... ${Math.floor(progress)}%` : 'Extract MP4'}
                    </button>
                    {busy && <button onClick={() => controllerRef.current?.abort()} className={`${buttonClass} w-full`}>Cancel extraction</button>}
                </div>}
            </div>
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Extracted Video</h3>
                {result && resultURL ? <>
                    <video src={resultURL} controls className="w-full rounded-lg bg-black" />
                    <p className="text-sm text-text-secondary break-all">{result.name}</p>
                    <p className="text-sm text-text-secondary">MP4 duration: {formatTime(result.duration)}</p>
                    <div className="grid grid-cols-2 gap-4">
                        <a href={resultURL} download={result.name} className={buttonClass}><DownloadIcon className="w-5 h-5" />Download MP4</a>
                        <button onClick={save} disabled={!canSaveVideoClip(result.duration) || saveStatus !== 'idle'} className={buttonClass}>
                            {saveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Save to Library'}
                        </button>
                    </div>
                    {!canSaveVideoClip(result.duration) && <p className="text-sm text-text-secondary">Library saving is only available for clips shorter than 5 minutes. You can still download this MP4.</p>}
                </> : <div className="h-64 flex items-center justify-center rounded-lg bg-bg-tertiary/50 text-text-muted">Your extracted MP4 will appear here.</div>}
                <p className="text-xs text-text-muted">MP4 (H.264 / AAC). Half-resolution keeps the aspect ratio, rounded to even pixel dimensions. Long or large videos may take time and require substantial memory.</p>
            </div>
        </div>
        {error && <p role="alert" className="mt-4 text-red-400 whitespace-pre-wrap">{error}</p>}
    </div>;
};
