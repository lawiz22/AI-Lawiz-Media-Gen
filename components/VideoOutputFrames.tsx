import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import type { H3GenerationResult } from '../services/minimaxH3Service';
import { extractVideoFrame } from '../services/videoFrameService';
import { fileToDataUrl, dataUrlToThumbnail } from '../utils/imageUtils';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';

export const VideoOutputFrames: React.FC<{ result: H3GenerationResult; url: string | undefined; disabled: boolean }> = ({ result, url, disabled }) => {
    const dispatch = useDispatch<AppDispatch>();
    const video = useRef<HTMLVideoElement | null>(null);
    const [seconds, setSeconds] = useState<number | null>(null);
    const [duration, setDuration] = useState(0);
    const [seeking, setSeeking] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState<number | null | undefined>(undefined);
    const controller = useRef<AbortController | null>(null);
    const source = useRef<File | null>(null);
    const frame = useRef<{ seconds: number | null; file: File } | null>(null);
    useEffect(() => {
        const player = video.current;
        return () => { controller.current?.abort(); player?.pause(); };
    }, []);
    const atLast = seconds === null;
    const blocked = disabled || working || seeking || !url;
    const selectTime = (player: HTMLVideoElement) => {
        setSeconds(player.ended || player.currentTime >= player.duration ? null : player.currentTime);
    };
    const capture = async (library: boolean) => {
        if (controller.current || blocked) return;
        const abort = new AbortController(); controller.current = abort;
        video.current?.pause();
        const selected = seconds === null ? null : video.current?.currentTime ?? seconds;
        setSeconds(selected);
        setWorking(true); setError('');
        try {
            if (!source.current) {
                let blob = result.videoBlob;
                if (!blob) {
                    const response = await fetch(result.videoUrl, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]) });
                    if (!response.ok) throw new Error(`Could not read the rendered output (${response.status}).`);
                    blob = await response.blob();
                }
                abort.signal.throwIfAborted();
                if (!blob.size) throw new Error('The rendered output is empty.');
                const name = new URL(result.videoUrl, window.location.href).searchParams.get('filename') || 'h3-output.mp4';
                source.current = new File([blob], name, { type: blob.type || 'video/mp4' });
            }
            if (!frame.current || frame.current.seconds !== selected) {
                frame.current = { seconds: selected, file: await extractVideoFrame(source.current, selected, abort.signal) };
            }
            abort.signal.throwIfAborted();
            const output = frame.current.file;
            if (library) {
                const thumbnail = await dataUrlToThumbnail(await fileToDataUrl(output), 512);
                abort.signal.throwIfAborted();
                await dispatch(addToLibrary({
                    name: output.name.replace(/\.png$/i, ''), mediaType: 'extracted-frame', media: '',
                    thumbnail, tags: ['video-frame', selected === null ? 'last-frame' : `time-${selected.toFixed(3)}s`],
                    assetBlobs: { media: output },
                })).unwrap();
                setSaved(selected);
            } else {
                const downloadUrl = URL.createObjectURL(output);
                const anchor = document.createElement('a'); anchor.href = downloadUrl; anchor.download = output.name; anchor.click();
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            }
        } catch (cause) {
            setError(abort.signal.aborted ? 'Frame extraction cancelled.' : `Could not save the video frame: ${cause instanceof Error ? cause.message : String(cause)}`);
        } finally { controller.current = null; setWorking(false); }
    };
    return <div className="space-y-3">
        <video ref={video} src={url || undefined} controls preload="metadata" className="w-full rounded-lg bg-black"
            onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
            onSeeking={event => { setSeeking(true); selectTime(event.currentTarget); }}
            onSeeked={event => { setSeeking(false); selectTime(event.currentTarget); }}
            onPlay={event => selectTime(event.currentTarget)}
            onTimeUpdate={event => { if (!event.currentTarget.paused) selectTime(event.currentTarget); }}
            onEnded={() => setSeconds(null)} />
        <label className="block text-xs text-text-secondary">Frame selector (s)
            <input aria-label="Output frame position (s)" className="mt-2 w-full" type="range" min="0" max={duration} step="any"
                value={seconds ?? duration} disabled={disabled || working || !duration} onChange={event => {
                    const time = Number(event.target.value);
                    if (video.current) { video.current.pause(); video.current.currentTime = time; }
                    setSeconds(time >= duration ? null : time);
                }} />
        </label>
        <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={disabled || working} onClick={() => {
                if (video.current && duration) { video.current.pause(); video.current.currentTime = duration; }
                setSeconds(null);
            }}>Last frame</button>
            <button type="button" className={button} disabled={blocked} onClick={() => void capture(false)}>{atLast ? 'Save last frame' : 'Save this frame'}</button>
            <button type="button" className={button} disabled={blocked || saved === seconds} onClick={() => void capture(true)}>
                {saved === seconds ? 'Frame saved to Library' : atLast ? 'Save last frame to Library' : 'Save this frame to Library'}
            </button>
            {working && <button type="button" className={button} onClick={() => controller.current?.abort()}>Cancel frame extraction</button>}
        </div>
        <p className="text-xs text-text-muted">{atLast ? 'Last frame selected.' : `Selected position: ${seconds.toFixed(3)} s.`} Scrub the video or frame selector to choose another frame. PNG export uses the original resolution; last-frame extraction decodes through the end of the video.</p>
        {working && <p role="status" className="text-xs text-cyan-300">Decoding the selected frame / saving PNG...</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>;
};
