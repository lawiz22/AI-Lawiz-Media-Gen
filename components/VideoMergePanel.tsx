import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import type { LibraryItem } from '../types';
import { videoToThumbnail } from '../utils/imageUtils';
import { inspectMergeVideos, mergeVideoClips, planVideoMerge, type MergeClip, type MergeProgress } from '../services/videoMergeService';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EndFrameIcon, FilmIcon, LibraryIcon, ResetIcon, SaveIcon, SpinnerIcon, StartFrameIcon } from './icons';

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const time = (value: number) => `${Math.floor(value / 60)}:${(value % 60).toFixed(3).padStart(6, '0')}`;
const button = 'flex items-center justify-center gap-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover p-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
const input = 'w-full bg-bg-primary p-2 rounded-md border border-border-primary text-sm';

export const VideoMergePanel: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const [clips, setClips] = useState<MergeClip[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [sourceURL, setSourceURL] = useState<string | null>(null);
    const [resultURL, setResultURL] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [name, setName] = useState('Merged video');
    const [allowAdaptation, setAllowAdaptation] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<MergeProgress>({ percent: 0, stage: '' });
    const [error, setError] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [result, setResult] = useState<{ file: File; duration: number } | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const controller = useRef<AbortController | null>(null);
    const revision = useRef(0);
    const interrupted = useRef(false);
    const video = useRef<HTMLVideoElement>(null);
    const playingSelection = useRef(false);
    const selected = clips.find(clip => clip.id === selectedId) ?? clips[0];
    const disabled = busy || saveStatus === 'saving';
    const planning = useMemo(() => {
        if (!clips.length) return { plan: null, error: null };
        try { return { plan: planVideoMerge(clips), error: null }; }
        catch (cause) { return { plan: null, error: message(cause) }; }
    }, [clips]);

    useEffect(() => {
        setBusy(false);
        if (interrupted.current) {
            setError('The video operation was cancelled when this workspace was hidden. Your clips are preserved; you can retry.');
            interrupted.current = false;
        }
        return () => {
            interrupted.current = controller.current !== null;
            if (controller.current) revision.current++;
            controller.current?.abort();
            controller.current = null;
        };
    }, []);

    useEffect(() => {
        const url = selected ? URL.createObjectURL(selected.file) : null;
        setSourceURL(url);
        setCurrentTime(0);
        setPreviewError(null);
        playingSelection.current = false;
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [selected?.file]);

    useEffect(() => {
        playingSelection.current = false;
        video.current?.pause();
        if (video.current && selected && Number.isFinite(selected.start) && selected.start >= 0
            && selected.start <= selected.info.duration && video.current.readyState > 0) video.current.currentTime = selected.start;
    }, [selected?.id]);

    useEffect(() => {
        const url = result ? URL.createObjectURL(result.file) : null;
        setResultURL(url);
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [result]);

    const changeClips = (next: MergeClip[]) => {
        setClips(next);
        setAllowAdaptation(false);
        setResult(null);
        setSaveStatus('idle');
        setError(null);
    };
    const addClips = async (source: File[] | ((signal: AbortSignal) => Promise<File[]>)) => {
        if (controller.current || saveStatus === 'saving' || (Array.isArray(source) && !source.length)) return;
        const abort = new AbortController();
        controller.current = abort;
        const version = ++revision.current;
        setBusy(true);
        setError(null);
        setProgress({ percent: 0, stage: 'Loading local video inspector...' });
        try {
            const files = Array.isArray(source) ? source : await source(abort.signal);
            if (!files.length) throw new Error('Select at least one video.');
            const loaded = await inspectMergeVideos(files, abort.signal, setProgress);
            if (version !== revision.current) return;
            changeClips([...clips, ...loaded]);
            setSelectedId(loaded[0].id);
        } catch (cause) {
            if (version !== revision.current) return;
            if (!abort.signal.aborted) console.error('Could not import merge videos:', cause);
            setError(abort.signal.aborted ? 'Video import cancelled. Existing clips are preserved.' : message(cause));
        } finally {
            if (version === revision.current) { controller.current = null; setBusy(false); }
        }
    };
    const addLibrary = (items: LibraryItem[]) => {
        setLibraryOpen(false);
        void addClips(async signal => {
            const files: File[] = [];
            for (const item of items) {
                const response = await fetch(item.media, { signal });
                if (!response.ok) throw new Error(`Could not read Library video "${item.name}" (${response.status}).`);
                const blob = await response.blob();
                if (!blob.size || (blob.type && !blob.type.startsWith('video/') && blob.type !== 'application/octet-stream')) {
                    throw new Error(`"${item.name}" does not contain readable video media.`);
                }
                files.push(new File([blob], item.name || `Library video ${item.id}`, { type: blob.type }));
            }
            return files;
        });
    };
    const seek = (value: number) => {
        if (!video.current || !selected) return;
        playingSelection.current = false;
        video.current.pause();
        video.current.currentTime = Math.max(0, Math.min(selected.info.duration, value));
    };
    const changeRange = (field: 'start' | 'end', value: number) => {
        if (selected) changeClips(clips.map(clip => clip.id === selected.id ? { ...clip, [field]: value } : clip));
    };
    const reorder = (index: number, offset: number) => {
        const next = [...clips];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        changeClips(next);
    };
    const merge = async () => {
        if (!planning.plan || controller.current || disabled) return;
        const abort = new AbortController();
        controller.current = abort;
        const version = ++revision.current;
        video.current?.pause();
        setBusy(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        try {
            const merged = await mergeVideoClips(clips, allowAdaptation, abort.signal, setProgress);
            if (version !== revision.current) return;
            const filename = `${name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.mp4$/i, '') || 'Merged video'}.mp4`;
            setResult({ file: new File([merged.file], filename, { type: 'video/mp4' }), duration: merged.duration });
        } catch (cause) {
            if (version !== revision.current) return;
            if (!abort.signal.aborted) console.error('Video merge failed:', cause);
            setError(abort.signal.aborted ? 'Video merge cancelled. Your clips and selections are preserved.' : message(cause));
        } finally {
            if (version === revision.current) { controller.current = null; setBusy(false); }
        }
    };
    const save = async () => {
        if (!result || disabled || saveStatus !== 'idle') return;
        const version = revision.current;
        setSaveStatus('saving');
        setError(null);
        try {
            const thumbnail = await videoToThumbnail(result.file, 256);
            await dispatch(addToLibrary({
                mediaType: 'video', name: result.file.name, media: '', thumbnail, assetBlobs: { media: result.file },
            })).unwrap();
            if (version === revision.current) setSaveStatus('saved');
        } catch (cause) {
            console.error('Could not save merged video:', cause);
            if (version === revision.current) {
                setSaveStatus('idle');
                setError(`Could not save to Library: ${message(cause)}`);
            }
        }
    };

    return <section className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent space-y-5">
        <div className="flex items-center gap-3"><FilmIcon className="w-8 h-8 text-accent" /><h2 className="text-2xl font-bold text-accent">Merge Video</h2></div>
        <p className="text-sm text-text-secondary">Trim, duplicate and reorder clips, then join them locally. Original audio is kept; clips without audio receive silence. Never upscale or stretch: different proportions use black bars.</p>
        <div className="flex flex-wrap gap-3">
            <label className={`${button} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                <FilmIcon className="w-5 h-5" />Upload videos
                <input aria-label="Upload videos to merge" type="file" accept="video/*,.mkv,.mov,.webm,.mp4" multiple disabled={disabled} className="hidden"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from<File>(event.currentTarget.files ?? []); event.currentTarget.value = ''; void addClips(files); }} />
            </label>
            <button className={button} disabled={disabled} onClick={() => setLibraryOpen(true)}><LibraryIcon className="w-5 h-5" />From Library</button>
            <button className={button} disabled={disabled || !clips.length} onClick={() => { changeClips([]); setSelectedId(''); setName('Merged video'); }}><ResetIcon className="w-5 h-5" />Reset Merge Video</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-3">
                <h3 className="font-semibold">Clip order ({clips.length})</h3>
                {!clips.length && <p className="text-text-muted text-sm">Add videos from your computer or Library. There is no fixed clip-count limit; available memory limits export size.</p>}
                <ol className="space-y-2 max-h-[34rem] overflow-y-auto">
                    {clips.map((clip, index) => <li key={clip.id} className={`border rounded-lg p-3 space-y-2 ${selected?.id === clip.id ? 'border-accent bg-bg-tertiary' : 'border-border-primary'}`}>
                        <button disabled={disabled} className="text-left w-full break-all" onClick={() => setSelectedId(clip.id)}>
                            <span className="font-semibold">{index + 1}. {clip.file.name}</span>
                            <span className="block text-xs text-text-secondary">{clip.info.width} x {clip.info.height} / {clip.info.fps.toFixed(3)} FPS / {clip.info.hasAudio ? 'Audio' : 'Silent'} / {time(clip.start)} - {time(clip.end)}</span>
                        </button>
                        <div className="flex flex-wrap gap-2">
                            <button aria-label={`Move clip ${index + 1} earlier`} className={button} disabled={disabled || index === 0} onClick={() => reorder(index, -1)}>Move up</button>
                            <button aria-label={`Move clip ${index + 1} later`} className={button} disabled={disabled || index === clips.length - 1} onClick={() => reorder(index, 1)}>Move down</button>
                            <button className={button} disabled={disabled} onClick={() => {
                                const copy = { ...clip, id: crypto.randomUUID() };
                                changeClips([...clips.slice(0, index + 1), copy, ...clips.slice(index + 1)]);
                                setSelectedId(copy.id);
                            }}>Duplicate</button>
                            <button aria-label={`Remove clip ${index + 1}`} className={button} disabled={disabled} onClick={() => changeClips(clips.filter(item => item.id !== clip.id))}>Remove</button>
                        </div>
                    </li>)}
                </ol>
            </div>
            <div className="space-y-3">
                {selected && sourceURL ? <>
                    <h3 className="font-semibold">Selected clip: {selected.file.name}</h3>
                    <video ref={video} src={sourceURL} controls className="w-full max-h-80 rounded-lg bg-black"
                        onLoadedMetadata={event => {
                            if (Number.isFinite(selected.start) && selected.start >= 0 && selected.start <= selected.info.duration) event.currentTarget.currentTime = selected.start;
                        }}
                        onTimeUpdate={event => {
                            setCurrentTime(event.currentTarget.currentTime);
                            if (playingSelection.current && event.currentTarget.currentTime >= selected.end) {
                                event.currentTarget.pause();
                                playingSelection.current = false;
                            }
                        }}
                        onError={() => setPreviewError('This browser cannot preview the selected video. Try an H.264 MP4 source; the local encoder may still be able to process it.')} />
                    {previewError && <p role="alert" className="text-sm text-red-400">{previewError}</p>}
                    <fieldset disabled={disabled} className="space-y-3">
                        <div className="flex gap-2 items-center">
                            <button aria-label="Previous frame" className={button} onClick={() => seek(currentTime - 1 / selected.info.fps)}><ChevronLeftIcon className="w-4 h-4" /></button>
                            <input aria-label="Merge clip position" type="range" min={0} max={selected.info.duration} step={0.001} value={currentTime} onChange={event => seek(Number(event.target.value))} className="w-full" />
                            <button aria-label="Next frame" className={button} onClick={() => seek(currentTime + 1 / selected.info.fps)}><ChevronRightIcon className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs font-mono">{time(currentTime)} / {time(selected.info.duration)}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm space-y-2">Start (seconds)<input aria-label="Merge clip start" type="number" min={0} max={selected.info.duration} step={0.001} value={Number.isFinite(selected.start) ? selected.start : ''} className={input}
                                onChange={event => changeRange('start', event.target.value === '' ? NaN : Number(event.target.value))} />
                                <button className={`${button} w-full`} onClick={() => changeRange('start', Math.min(selected.info.duration, video.current?.currentTime ?? 0))}><StartFrameIcon className="w-4 h-4" />Set start here</button>
                            </label>
                            <label className="text-sm space-y-2">End (seconds)<input aria-label="Merge clip end" type="number" min={0} max={selected.info.duration} step={0.001} value={Number.isFinite(selected.end) ? selected.end : ''} className={input}
                                onChange={event => changeRange('end', event.target.value === '' ? NaN : Number(event.target.value))} />
                                <button className={`${button} w-full`} onClick={() => changeRange('end', Math.min(selected.info.duration, video.current?.currentTime ?? 0))}><EndFrameIcon className="w-4 h-4" />Set end here</button>
                            </label>
                        </div>
                        <button className={`${button} w-full`} disabled={!Number.isFinite(selected.start) || !Number.isFinite(selected.end) || selected.start < 0 || selected.end > selected.info.duration || selected.end <= selected.start} onClick={() => {
                            if (!video.current) return;
                            video.current.currentTime = selected.start;
                            playingSelection.current = true;
                            void video.current.play().catch(cause => { console.error('Could not play selected clip:', cause); setPreviewError(message(cause)); });
                        }}>Play selection</button>
                    </fieldset>
                    <p className="text-xs text-text-muted">Duplicate a clip to use several different passages from the same source. Frame stepping uses the detected average FPS; variable-frame-rate boundaries remain time-based.</p>
                </> : <div className="h-64 flex items-center justify-center rounded-lg bg-bg-tertiary text-text-muted">Select a clip to preview and trim it.</div>}
            </div>
        </div>
        {planning.error && <p role="alert" className="text-sm text-red-400">{planning.error}</p>}
        {planning.plan && <div className="rounded-lg border border-border-primary p-4 space-y-3">
            <p className="font-semibold">Output: {planning.plan.width} x {planning.plan.height} / {planning.plan.fps.toFixed(3)} FPS / approximately {time(planning.plan.duration)}</p>
            <p className="text-sm text-text-secondary">MP4 H.264 / AAC stereo 48 kHz. Uses the first clip's proportions, reduced to fit every source, and the lowest source frame rate. Cuts are aligned down to complete output frames.</p>
            {planning.plan.needsAdaptation && <label className="flex gap-3 text-sm items-start">
                <input type="checkbox" aria-label="Allow downscale and letterbox adaptation" checked={allowAdaptation} disabled={disabled} onChange={event => setAllowAdaptation(event.target.checked)} className="mt-1" />
                <span>These clips do not share the same format. I agree to downscale/adapt them to the output above, with black bars where needed. Nothing will be upscaled or cropped.</span>
            </label>}
        </div>}
        <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm flex-grow space-y-2">Output name<input aria-label="Merged video name" value={name} disabled={disabled} onChange={event => setName(event.target.value)} className={input} /></label>
            <button className={`${button} bg-accent text-accent-text font-bold`} disabled={disabled || !planning.plan || (planning.plan.needsAdaptation && !allowAdaptation)} onClick={() => void merge()}><FilmIcon className="w-5 h-5" />Merge videos</button>
        </div>
        {busy && <div role="status" className="space-y-2">
            <p className="flex items-center gap-2 text-sm"><SpinnerIcon className="w-5 h-5 animate-spin" />{progress.stage} {Math.floor(progress.percent)}%</p>
            <progress aria-label="Video merge progress" value={progress.percent} max={100} className="w-full accent-accent" />
            <button className={button} onClick={() => controller.current?.abort()}>Cancel operation</button>
        </div>}
        {result && resultURL && <div className="space-y-3 border-t border-border-primary pt-5">
            <h3 className="font-semibold">Merged video</h3>
            <video src={resultURL} controls className="w-full max-h-96 rounded-lg bg-black" />
            <p className="text-sm text-text-secondary">{result.file.name} / {time(result.duration)}</p>
            <div className="flex flex-wrap gap-3">
                <a className={button} href={resultURL} download={result.file.name}><DownloadIcon className="w-5 h-5" />Download MP4</a>
                <button className={button} disabled={disabled || saveStatus !== 'idle'} onClick={() => void save()}>
                    {saveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save to Library'}
                </button>
            </div>
        </div>}
        {error && <p role="alert" className="text-red-400 text-sm whitespace-pre-wrap">{error}</p>}
        <p className="text-xs text-text-muted">No media upload, ComfyUI or GPU required. Clips are encoded one at a time; large exports still require browser memory and must remain below the encoder's 2 GB file limit. Work in progress survives tool switches, not app restarts.</p>
        {libraryOpen && <LibraryPickerModal isOpen onClose={() => setLibraryOpen(false)} filter="video" multiSelect
            onSelectItem={item => addLibrary([item])} onSelectMultiple={addLibrary} />}
    </section>;
};
