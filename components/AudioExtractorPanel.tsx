import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch } from '../store/store';
import { audioSelectionFrames, type AudioSelection } from '../services/audioClipService';
import { buildAudioWaveform, decodeMediaAudio, exportAudioExcerpt } from '../services/audioExtractorService';
import { readLibraryMediaFile } from '../services/libraryMediaService';
import { LibraryPickerModal } from './LibraryPickerModal';

const button = 'rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm hover:bg-bg-tertiary-hover disabled:opacity-40 disabled:cursor-not-allowed';
const field = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm';
const clock = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(3).padStart(6, '0')}`;
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const wavThumbnail = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#101416"/><path d="M48 112v32m20-56v80m20-112v144m20-104v64m20-128v192m20-144v96m20-128v160m20-112v64m20-48v32" stroke="#22d3ee" stroke-width="9" stroke-linecap="round"/><text x="128" y="242" text-anchor="middle" fill="#fafafa" font-family="sans-serif" font-size="20">WAV</text></svg>')}`;

export const AudioExtractorPanel: React.FC<{ active: boolean }> = ({ active }) => {
    const dispatch = useDispatch<AppDispatch>();
    const [file, setFile] = useState<File | null>(null);
    const [audio, setAudio] = useState<AudioBuffer | null>(null);
    const [selection, setSelection] = useState<AudioSelection>({ start: 0, end: 0 });
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState(0);
    const [peaks, setPeaks] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [position, setPosition] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [result, setResult] = useState<File | null>(null);
    const [resultURL, setResultURL] = useState('');
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [saveState, setSaveState] = useState<{ file: File; status: 'saving' | 'saved' } | null>(null);
    const savePending = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const context = useRef<AudioContext | null>(null);
    const source = useRef<AudioBufferSourceNode | null>(null);
    const resultAudio = useRef<HTMLAudioElement | null>(null);
    const playback = useRef({ start: 0, time: 0, end: 0 });
    const playRevision = useRef(0);
    const drag = useRef<{ start: number; x: number; mode: 'start' | 'end' | 'range'; moved: boolean } | null>(null);
    const duration = audio ? audio.length / audio.sampleRate : 0;
    const span = duration / zoom;
    const visibleStart = Math.max(0, Math.min(offset, duration - span));
    const visibleEnd = visibleStart + span;
    const validation = useMemo(() => {
        if (!audio) return '';
        try { audioSelectionFrames(audio, selection); return ''; }
        catch (cause) { return message(cause); }
    }, [audio, selection]);
    const stop = (pauseResult = true) => {
        playRevision.current++;
        if (pauseResult) resultAudio.current?.pause();
        if (source.current) {
            const state = playback.current;
            setPosition(Math.min(state.end, state.start + (context.current?.currentTime ?? state.time) - state.time));
            source.current.onended = null;
            source.current.stop(); source.current.disconnect(); source.current = null;
        }
        setPlaying(false);
    };
    useEffect(() => {
        if (!active) stop();
    }, [active]);
    useEffect(() => () => {
        playRevision.current++;
        controller.current?.abort();
        resultAudio.current?.pause();
        if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); }
        void context.current?.close().catch(cause => console.warn('Could not close audio extractor playback.', cause));
    }, []);
    useEffect(() => {
        const url = result ? URL.createObjectURL(result) : '';
        setResultURL(url);
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [result]);
    useEffect(() => {
        if (saveState?.status === 'saved' && saveState.file !== result) setSaveState(null);
    }, [result, saveState]);
    useEffect(() => {
        if (!audio) { setPeaks([]); return; }
        const abort = new AbortController();
        setPeaks([]);
        void buildAudioWaveform(audio, { start: visibleStart, end: visibleEnd }, abort.signal).then(values => {
            if (!abort.signal.aborted) setPeaks(values);
        }).catch(cause => {
            if (!abort.signal.aborted) setError(`Cannot draw waveform: ${message(cause)}`);
        });
        return () => abort.abort();
    }, [audio, visibleStart, visibleEnd]);
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        const tick = () => {
            const state = playback.current;
            setPosition(Math.min(state.end, state.start + (context.current?.currentTime ?? state.time) - state.time));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing]);

    const load = async (input: File | ((signal: AbortSignal) => Promise<File>)) => {
        if (controller.current) {
            if (typeof input === 'function') throw new Error('Wait for the current audio operation to finish before importing from Library.');
            return;
        }
        stop(); setError(''); setStatus('Reading audio/video source...');
        const abort = new AbortController(); controller.current = abort; setBusy(true);
        try {
            const selected = typeof input === 'function' ? await input(abort.signal) : input;
            abort.signal.throwIfAborted();
            setLibraryOpen(false);
            setFile(selected); setAudio(null); setResult(null); setPosition(0); setZoom(1); setOffset(0);
            const decoded = await decodeMediaAudio(selected, abort.signal, setStatus);
            if (abort.signal.aborted) return;
            setAudio(decoded); setSelection({ start: 0, end: decoded.length / decoded.sampleRate });
            setStatus('Audio ready. Drag on the waveform to select an excerpt, or enter start/end seconds.');
        } catch (cause) {
            setStatus(''); setError(abort.signal.aborted ? 'Audio loading cancelled. Select the file again to retry.' : message(cause));
            if (typeof input === 'function') throw cause;
        }
        finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
    };
    const change = (next: AudioSelection) => { stop(); setSelection(next); setResult(null); setError(''); };
    const play = async (selected: boolean) => {
        if (!audio || validation) return;
        stop(); setError('');
        const revision = playRevision.current;
        try {
            const ctx = context.current ?? new AudioContext(); context.current = ctx;
            await ctx.resume();
            if (revision !== playRevision.current) return;
            const start = selected ? selection.start : position >= duration ? 0 : position;
            const end = selected ? selection.end : duration;
            const node = ctx.createBufferSource(); node.buffer = audio; node.connect(ctx.destination);
            node.onended = () => { node.disconnect(); source.current = null; setPlaying(false); setPosition(end); };
            playback.current = { start, time: ctx.currentTime, end };
            node.start(0, start, end - start); source.current = node;
            setPosition(start); setPlaying(true);
        } catch (cause) { setError(`Cannot play audio: ${message(cause)}`); }
    };
    const extract = async () => {
        if (!audio || !file || controller.current) return;
        stop(); setError(''); setResult(null); setBusy(true); setStatus('Encoding selected WAV samples locally...');
        const abort = new AbortController(); controller.current = abort;
        try {
            const output = await exportAudioExcerpt(audio, selection, file.name, abort.signal);
            setResult(output); setStatus('Excerpt ready. Download the WAV below; the source file was not changed.');
        } catch (cause) { setStatus(''); setError(abort.signal.aborted ? 'WAV extraction cancelled.' : message(cause)); }
        finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
    };
    const saveToLibrary = async () => {
        if (!result || savePending.current || saveState?.file === result && saveState.status === 'saved') return;
        const snapshot = result;
        savePending.current = true;
        setSaveState({ file: snapshot, status: 'saving' }); setError('');
        try {
            await dispatch(addToLibrary({
                name: snapshot.name.replace(/\.wav$/i, ''), mediaType: 'tts-reference', media: '',
                thumbnail: wavThumbnail, tags: ['audio-extractor', 'wav'], assetBlobs: { media: snapshot },
            })).unwrap();
            setSaveState({ file: snapshot, status: 'saved' });
        } catch (cause) {
            setSaveState(null); setError(`Could not save ${snapshot.name} to Library: ${message(cause)}`);
        } finally { savePending.current = false; }
    };
    const pointerTime = (event: React.PointerEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.max(visibleStart, Math.min(visibleEnd, visibleStart + (event.clientX - rect.left) / rect.width * span));
    };
    const wavePath = useMemo(() => {
        const maximum = Math.max(0.001, ...peaks);
        return peaks.map((peak, index) => {
            const x = (index + 0.5) / peaks.length * 1000, height = Math.max(0.7, peak / maximum * 60);
            return `M${x.toFixed(2)},${80 - height}V${80 + height}`;
        }).join('');
    }, [peaks]);
    const x = (time: number) => (time - visibleStart) / span * 1000;
    return <section aria-label="Audio extractor" className="space-y-5 text-text-primary">
        <header><h2 className="text-xl font-bold">Audio Extractor</h2><p className="mt-1 text-sm text-text-secondary">Extract a video's soundtrack or cut an existing audio file. Local processing, no upload or ComfyUI required.</p></header>
        <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm">Audio or video file<input aria-label="Audio or video file" type="file" accept="audio/*,video/*,.mkv,.mov,.flac,.m4a,.ogg,.aac" disabled={busy} className={field} onChange={event => {
                const input = event.target.files?.[0]; event.target.value = ''; if (input) void load(input);
            }} /></label>
            <button type="button" className={button} disabled={busy} onClick={() => setLibraryOpen(true)}>Choose audio/video from Library</button>
            <button type="button" className={button} disabled={busy} onClick={() => { stop(); setFile(null); setAudio(null); setResult(null); setError(''); setStatus(''); setPosition(0); }}>Clear audio</button>
            {busy && <button type="button" className={button} onClick={() => controller.current?.abort()}>Cancel audio operation</button>}
        </div>
        <p className="text-xs text-text-muted">The first audio track is used. WAV PCM16 export, with decoded sample rate/channels. Full-track decoding uses memory; very long sources may exceed browser limits. Unsupported codecs and videos without audio report an error.</p>
        {file && <p className="break-all text-sm">{file.name}{audio ? ` · ${clock(duration)} · ${audio.sampleRate} Hz · ${audio.numberOfChannels} channel(s)` : ''}</p>}
        {status && <p role="status" className="text-sm text-cyan-300">{status}</p>}
        {error && <p role="alert" className="rounded-lg bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {audio && <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={button} disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 2))}>Zoom out</button>
                <button type="button" className={button} disabled={zoom >= 64} onClick={() => setZoom(value => Math.min(64, value * 2))}>Zoom in</button>
                <button type="button" className={button} onClick={() => { setZoom(1); setOffset(0); }}>Fit full track</button>
                <button type="button" className={button} disabled={!!validation} onClick={() => { setZoom(Math.max(1, Math.min(64, duration / (selection.end - selection.start)))); setOffset(selection.start); }}>Zoom to selection</button>
                <span className="text-xs text-text-secondary">{zoom.toFixed(1)}x · {clock(visibleStart)} - {clock(visibleEnd)}</span>
            </div>
            <svg aria-label="Audio waveform" role="img" viewBox="0 0 1000 160" preserveAspectRatio="none" className="h-48 w-full touch-none rounded-xl border border-cyan-400/30 bg-bg-primary select-none"
                onPointerDown={event => {
                    const time = pointerTime(event), tolerance = span * 12 / event.currentTarget.getBoundingClientRect().width;
                    drag.current = { start: time, x: event.clientX, moved: false, mode: Math.abs(time - selection.start) <= tolerance ? 'start' : Math.abs(time - selection.end) <= tolerance ? 'end' : 'range' };
                    stop(); event.currentTarget.setPointerCapture(event.pointerId);
                }} onPointerMove={event => {
                    const state = drag.current;
                    if (!state) return;
                    if (Math.abs(event.clientX - state.x) > 2) state.moved = true;
                    if (!state.moved) return;
                    const time = pointerTime(event), sample = 1 / audio.sampleRate;
                    if (state.mode === 'start') change({ start: Math.min(time, selection.end - sample), end: selection.end });
                    else if (state.mode === 'end') change({ start: selection.start, end: Math.max(time, selection.start + sample) });
                    else if (Math.abs(time - state.start) >= sample) change({ start: Math.min(time, state.start), end: Math.max(time, state.start) });
                }} onPointerUp={event => {
                    if (drag.current && !drag.current.moved) setPosition(pointerTime(event));
                    drag.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }} onPointerCancel={() => { drag.current = null; }}>
                <title>Audio waveform. Drag to select; drag selection boundaries to resize; click to position playback.</title>
                <path d={wavePath} stroke="#22d3ee" strokeWidth="1" />
                {!validation && <><rect x={Math.max(0, x(selection.start))} y="0" width={Math.max(0, Math.min(1000, x(selection.end)) - Math.max(0, x(selection.start)))} height="160" fill="#22d3ee" opacity="0.15" />
                    <path d={`M${x(selection.start)},0V160M${x(selection.end)},0V160`} stroke="#fbbf24" strokeWidth="3" /></>}
                <path d={`M${x(position)},0V160`} stroke="#f87171" strokeWidth="2" />
            </svg>
            {!peaks.length && <p className="text-xs text-text-muted">Drawing waveform...</p>}
            <label className="block text-sm">Visible window start (s)<input aria-label="Visible window start (s)" type="range" className="mt-2 w-full accent-cyan-400" min="0" max={Math.max(0, duration - span)} step="any" value={visibleStart} disabled={zoom === 1} onChange={event => setOffset(Number(event.target.value))} /></label>
            <p className="text-xs text-text-secondary">Drag to select a passage. Drag yellow boundaries to resize it. Click to move the red playhead, or use the numeric fields below.</p>
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">Start (s)<input aria-label="Audio start (s)" className={field} type="number" min="0" max={duration} step="0.001" value={selection.start} onChange={event => change({ ...selection, start: Number(event.target.value) })} /></label>
                <label className="text-sm">End (s)<input aria-label="Audio end (s)" className={field} type="number" min="0" max={duration} step="0.001" value={selection.end} onChange={event => change({ ...selection, end: Number(event.target.value) })} /></label>
                <div className="text-sm">Selected duration<p className="mt-3 font-mono">{validation ? '--' : clock(selection.end - selection.start)}</p></div>
            </div>
            {validation && <p role="alert" className="text-sm text-danger">{validation}</p>}
            <label className="block text-sm">Playhead: {clock(position)}<input aria-label="Audio playhead (s)" type="range" min="0" max={duration} step="any" value={position} className="mt-2 w-full accent-cyan-400" onChange={event => { stop(); setPosition(Number(event.target.value)); }} /></label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={!!validation} onClick={() => { if (playing) stop(); else void play(false); }}>{playing ? 'Pause audio' : 'Play audio'}</button>
                <button type="button" className={button} disabled={!!validation} onClick={() => void play(true)}>Play selection</button>
                <button type="button" className={button} onClick={() => change({ ...selection, start: position })}>Set start at playhead</button>
                <button type="button" className={button} onClick={() => change({ ...selection, end: position })}>Set end at playhead</button>
                <button type="button" className={button} onClick={() => change({ start: 0, end: duration })}>Select full track</button>
                <button type="button" className={`${button} border-cyan-400/50 text-cyan-300`} disabled={!!validation} onClick={() => void extract()}>Extract WAV</button>
            </div>
        </fieldset>}
        {result && resultURL && <div className="space-y-3 rounded-xl border border-cyan-400/40 bg-bg-primary p-4">
            <p className="break-all text-sm">{result.name}</p>
            <audio ref={resultAudio} controls src={resultURL} preload="metadata" aria-label="Extracted audio preview" className="w-full" onPlay={() => stop(false)} />
            <div className="flex flex-wrap gap-2">
                <a className={`${button} inline-block text-cyan-300`} href={resultURL} download={result.name}>Download WAV</a>
                <button type="button" className={`${button} border-cyan-400/50 text-cyan-300`}
                    disabled={saveState?.status === 'saving' || saveState?.file === result && saveState.status === 'saved'}
                    onClick={() => void saveToLibrary()}>
                    {saveState?.status === 'saving' ? 'Saving...' : saveState?.file === result && saveState.status === 'saved' ? 'Saved to Library' : 'Save to Library'}
                </button>
            </div>
        </div>}
        {libraryOpen && <LibraryPickerModal isOpen hydrateMedia={false} filter={['video', 'audio-tts', 'tts-reference']}
            onClose={() => { controller.current?.abort(); setLibraryOpen(false); }}
            onSelectItem={item => load(signal => readLibraryMediaFile(item, ['audio', 'video'], signal))} />}
    </section>;
};
