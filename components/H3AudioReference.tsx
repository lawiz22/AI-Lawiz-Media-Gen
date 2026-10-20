import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { audioSelectionFrames, audioWaveformPeaks, encodeAudioWav, nextAudioSelection, type AudioSelection } from '../services/audioClipService';
import { referenceToken, type VideoReference } from '../services/videoPromptService';
import { useMediaURL } from './VideoReferenceEditor';
import { PauseIcon, PlayIcon, VolumeIcon } from './icons';

const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border-primary bg-bg-secondary px-3 py-2 text-xs font-semibold transition-colors hover:border-violet-400/50 hover:bg-violet-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40';
const input = 'mt-2 w-full rounded-xl border border-border-primary bg-bg-primary px-3 py-2 font-mono text-sm text-text-primary focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400';
const time = (value: number) => Number.isFinite(value) ? value.toFixed(3) : '--';
const clock = (value: number) => {
    const ticks = Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
    return `${Math.floor(ticks / 6000)}:${(Math.floor(ticks / 100) % 60).toString().padStart(2, '0')}.${(ticks % 100).toString().padStart(2, '0')}`;
};

export const H3AudioReference: React.FC<{
    reference: VideoReference;
    videoDuration: number;
    onApply: (file: File, selection: AudioSelection) => void;
    target?: 'H3' | 'prompt';
    onPendingChange?: (pending: boolean) => void;
}> = ({ reference, videoDuration, onApply, target = 'H3', onPendingChange }) => {
    const url = useMediaURL(reference.original);
    const audioRef = useRef<HTMLAudioElement>(null);
    const previewing = useRef(false);
    const drag = useRef<{ time: number; x: number; moved: boolean } | null>(null);
    const defaults = useRef(videoDuration);
    defaults.current = videoDuration;
    const [decoded, setDecoded] = useState<AudioBuffer | null>(null);
    const [peaks, setPeaks] = useState<number[]>([]);
    const [selection, setSelection] = useState<AudioSelection>({ start: 0, end: 0 });
    const [position, setPosition] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [mediaDuration, setMediaDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const clipId = useId();
    const duration = decoded ? decoded.length / decoded.sampleRate : 0;
    const total = duration || mediaDuration;
    const label = referenceToken(reference);
    let valid = false;
    if (decoded) {
        try { audioSelectionFrames(decoded, selection); valid = true; }
        catch { /* The range inputs remain editable until a valid interval is selected. */ }
    }
    const applied = !!reference.audioSelection && selection.start === reference.audioSelection.start && selection.end === reference.audioSelection.end;
    useEffect(() => {
        onPendingChange?.(loading || (!!decoded && !applied && (selection.start !== 0 || selection.end !== duration)));
    }, [loading, decoded, applied, selection.start, selection.end, duration, onPendingChange]);
    const stop = () => { previewing.current = false; audioRef.current?.pause(); };

    useEffect(() => {
        let active = true;
        const audio = audioRef.current;
        setDecoded(null); setPeaks([]); setError(''); setLoading(true); setMediaDuration(0); setPosition(0); setPlaying(false);
        const decode = async () => {
            const context = new AudioContext();
            try {
                const buffer = await context.decodeAudioData(await reference.original.arrayBuffer());
                const waveform = audioWaveformPeaks(buffer, 180);
                if (active) { setDecoded(buffer); setPeaks(waveform); }
            } finally { await context.close(); }
        };
        void decode().catch(cause => {
            if (active) setError(`Cannot decode the original audio: ${cause instanceof Error ? cause.message : String(cause)}`);
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; previewing.current = false; audio?.pause(); };
    }, [reference.original]);

    useEffect(() => {
        if (!decoded) return;
        setSelection(reference.audioSelection || { start: 0, end: Math.min(duration, Math.max(0.01, defaults.current)) });
        previewing.current = false; audioRef.current?.pause();
    }, [decoded, reference.audioSelection, duration]);

    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        const tick = () => {
            const audio = audioRef.current;
            if (audio && previewing.current && audio.currentTime >= selection.end) {
                audio.pause(); audio.currentTime = selection.end; previewing.current = false;
            }
            if (audio && !audio.paused) setPosition(audio.currentTime);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [selection.end, playing]);

    const change = (next: AudioSelection) => { stop(); setSelection(next); setError(''); };
    const apply = (next: AudioSelection) => {
        if (!decoded) return;
        setError('');
        try {
            if (next.end - next.start > (target === 'H3' ? 60 : 120)) throw new Error(`${target === 'H3' ? 'H3 supports at most 60' : 'Prompt generation supports at most 120'} seconds per passage. Select a shorter excerpt.`);
            if (target === 'prompt' && next.end - next.start < 1) throw new Error('Prompt generation requires at least one second per passage.');
            const file = new File([encodeAudioWav(decoded, next)], `${reference.original.name.replace(/\.[^.]+$/, '')}-${time(next.start)}-${time(next.end)}.wav`, { type: 'audio/wav' });
            stop(); onApply(file, next); setSelection(next);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const play = async () => {
        if (!audioRef.current || !valid) return;
        try {
            audioRef.current.currentTime = selection.start;
            previewing.current = true;
            await audioRef.current.play();
        } catch (cause) { previewing.current = false; setError(`Cannot play this selection: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    const toggleOriginal = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (!audio.paused) { stop(); return; }
        try {
            previewing.current = false;
            await audio.play();
        } catch (cause) { setError(`Cannot play the original audio: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    const seek = (value: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        previewing.current = false;
        audio.currentTime = value;
        setPosition(value);
    };
    const pointerTime = (event: React.PointerEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
    };
    const path = useMemo(() => {
        const maximum = Math.max(0.001, ...peaks);
        return peaks.map((peak, index) => {
            const x = (index + 0.5) * 1000 / peaks.length, height = Math.max(1, peak / maximum * 34);
            return `M${x.toFixed(2)},${(50 - height).toFixed(2)}V${(50 + height).toFixed(2)}`;
        }).join('');
    }, [peaks]);
    return <div className="mt-3 overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-400/5 via-bg-primary to-bg-secondary p-3 shadow-lg sm:p-4">
        <audio ref={audioRef} src={url || undefined} preload="metadata" aria-label={`Original audio ${label}`} className="hidden"
            onLoadedMetadata={event => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
            onDurationChange={event => setMediaDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
            onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => { previewing.current = false; setPlaying(false); }}
            onEnded={() => { previewing.current = false; setPlaying(false); }}
            onError={() => setError('The original audio cannot be played in this browser.')} />
        <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
            <button type="button" aria-label={`${playing ? 'Pause' : 'Play'} original ${label}`} disabled={!url || !mediaDuration} onClick={() => void toggleOriginal()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-400 text-slate-950 shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:opacity-40">
                {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Original track</p>
                <p title={reference.original.name} className="mt-1 truncate text-sm font-semibold text-text-primary">{reference.original.name}</p>
            </div>
            <span className="rounded-lg border border-border-primary bg-bg-primary px-2 py-1 font-mono text-xs tabular-nums text-text-secondary">{clock(position)} <span className="text-text-muted">/ {clock(total)}</span></span>
        </div>
        {loading && <p role="status" className="animate-pulse rounded-xl bg-violet-400/5 p-6 text-center text-xs text-violet-300">Building waveform...</p>}
        {!!decoded && <div className="overflow-hidden rounded-xl border border-border-primary bg-bg-primary">
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`Waveform ${label}`}
                className="block h-28 w-full touch-none cursor-crosshair"
                onPointerDown={event => { stop(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { time: pointerTime(event), x: event.clientX, moved: false }; }}
                onPointerMove={event => {
                    if (!drag.current) return;
                    if (Math.abs(event.clientX - drag.current.x) > 3) drag.current.moved = true;
                    if (drag.current.moved) {
                        const at = pointerTime(event);
                        change({ start: Math.min(drag.current.time, at), end: Math.max(drag.current.time, at) });
                    }
                }}
                onPointerUp={event => {
                    if (drag.current && !drag.current.moved && audioRef.current) {
                        audioRef.current.currentTime = pointerTime(event); setPosition(pointerTime(event));
                    }
                    drag.current = null;
                }} onPointerCancel={() => { drag.current = null; }}>
                <defs><clipPath id={clipId}><rect x={valid ? selection.start / duration * 1000 : 0} width={valid ? (selection.end - selection.start) / duration * 1000 : 0} y="0" height="100" /></clipPath></defs>
                {[0.25, 0.5, 0.75].map(tick => <line key={tick} x1={tick * 1000} x2={tick * 1000} y1="0" y2="100" stroke="currentColor" opacity="0.06" />)}
                <line x1="0" x2="1000" y1="50" y2="50" stroke="currentColor" opacity="0.08" />
                {valid && <rect x={selection.start / duration * 1000} width={(selection.end - selection.start) / duration * 1000} y="0" height="100" fill="#a78bfa" opacity="0.12" />}
                <path d={path} stroke="#64748b" strokeWidth="2.8" strokeLinecap="round" />
                <path d={path} stroke="#c4b5fd" strokeWidth="2.8" strokeLinecap="round" clipPath={`url(#${clipId})`} />
                {valid && [selection.start, selection.end].map((edge, index) => <line key={index} x1={edge / duration * 1000} x2={edge / duration * 1000} y1="0" y2="100" stroke="#a78bfa" strokeWidth="1.5" />)}
                <line x1={position / duration * 1000} x2={position / duration * 1000} y1="0" y2="100" stroke="#f1f5f9" strokeWidth="1.5" />
            </svg>
            <div className="flex justify-between border-t border-border-primary px-2 py-1.5 font-mono text-[10px] text-text-muted">{[0, 0.25, 0.5, 0.75, 1].map(tick => <span key={tick}>{clock(duration * tick)}</span>)}</div>
        </div>}
        <div className="mt-3 flex items-center gap-3">
            <input aria-label={`Seek original ${label}`} type="range" min={0} max={total} step="0.01" value={Math.min(position, total)} disabled={!mediaDuration}
                onChange={event => seek(Number(event.target.value))} className="h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400" />
            <div className="flex shrink-0 items-center gap-2 text-text-muted"><VolumeIcon className="h-4 w-4" />
                <input aria-label={`Volume original ${label}`} type="range" min={0} max={1} step="0.05" value={volume} onChange={event => {
                    const value = Number(event.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value;
                }} className="h-1.5 w-16 cursor-pointer accent-violet-400 sm:w-20" />
            </div>
        </div>
        {!!decoded && <div className="mt-4 space-y-3 border-t border-border-primary pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Passage selection</p>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${applied ? 'border-violet-400/30 bg-violet-400/10 text-violet-300' : 'border-border-primary text-text-secondary'}`}>{applied ? 'Applied' : 'Not applied'}</span>
            </div>
            <p className="text-[11px] text-text-muted">Drag on the waveform to select. Click to position the playhead.</p>
            <div className="grid grid-cols-2 gap-3">
                {(['start', 'end'] as const).map(edge => <label key={edge} className="min-w-0 rounded-xl border border-border-primary bg-bg-secondary p-2 text-[11px] font-semibold text-text-secondary">{edge === 'start' ? 'Start' : 'End'} <span className="font-normal text-text-muted">/ seconds</span>
                    <input type="number" aria-label={`${label} audio ${edge}`} className={input} min={0} max={duration} step="0.01"
                        value={Number.isFinite(selection[edge]) ? selection[edge] : ''} onChange={event => change({ ...selection, [edge]: event.currentTarget.valueAsNumber })} />
                    <button type="button" className="mt-2 text-[11px] font-medium text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:underline" onClick={() => change({ ...selection, [edge]: Math.min(duration, audioRef.current?.currentTime || 0) })}>Set {edge} here</button>
                </label>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={button} disabled={!valid} onClick={() => void play()}><PlayIcon className="h-3.5 w-3.5" />Play selection</button>
                <button type="button" className={button} onClick={stop}><PauseIcon className="h-3.5 w-3.5" />Pause</button>
                {valid && <span className="ml-auto font-mono text-xs text-violet-300">{time(selection.end - selection.start)} s</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button type="button" className={`${button} !border-violet-400/30 !bg-violet-400/15 text-violet-200 hover:!bg-violet-400/25`} disabled={!valid} onClick={() => apply(selection)}>Apply passage + {target} duration</button>
                <button type="button" className={`${button} text-violet-300`} disabled={!valid || selection.end >= duration} onClick={() => {
                    try { const next = nextAudioSelection(selection, duration); if (next) apply(next); }
                    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
                }}>Next {valid ? Number((selection.end - selection.start).toFixed(3)) : '--'} s</button>
            </div>
            <p className="text-[11px] leading-relaxed text-text-muted">{valid ? `${time(selection.start)} - ${time(selection.end)} s. ${applied ? 'Applied to generation.' : 'Not applied yet.'}` : 'Choose a valid start/end within the recording.'} Apply/Next exports a WAV excerpt and matches {target} duration. Only this file is sent to the encoder/model, not the full original. The last passage never loops{target === 'H3' ? '; native frame rounding still applies' : ''}.</p>
            {reference.audioSelection && !applied && <p className="text-[11px] text-amber-300">Generation still uses {time(reference.audioSelection.start)} - {time(reference.audioSelection.end)} s until you apply this selection.</p>}
        </div>}
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-2 text-xs text-red-300">{error}</p>}
    </div>;
};
