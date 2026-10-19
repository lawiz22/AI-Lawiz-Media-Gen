import React, { useEffect, useRef, useState } from 'react';
import { swapVideoURL, type SwapPlan, type SwapVideo } from '../services/characterSwapService';

export const CharacterSwapComparison: React.FC<{
    base: string; videos: SwapVideo[]; plan: SwapPlan; sourceRangeVerified?: boolean;
}> = ({ base, videos, plan, sourceRangeVerified = false }) => {
    const target = useRef<HTMLVideoElement>(null);
    const guide = useRef<HTMLVideoElement>(null);
    const [wipe, setWipe] = useState(50);
    const [error, setError] = useState('');
    const [aspect, setAspect] = useState('16 / 9');
    const result = videos[0];
    const source = videos[2] ? swapVideoURL(base, videos[2])
        : sourceRangeVerified && typeof plan.video === 'string' && plan.video ? swapVideoURL(base, {
            filename: plan.video.split('/').pop() || plan.video,
            subfolder: plan.video.includes('/') ? plan.video.slice(0, plan.video.lastIndexOf('/')) : '', type: 'input',
        }) : '';
    const offset = videos[2] ? 0 : typeof plan.start_f === 'number' && typeof plan.fps === 'number'
        ? plan.start_f / plan.fps : typeof plan.start_s === 'number' ? plan.start_s : 0;
    useEffect(() => {
        setError('');
        let frame = 0;
        const sync = () => {
            const a = target.current, b = guide.current;
            if (a && b && b.readyState >= 1) {
                const time = a.currentTime + offset;
                if (Math.abs(b.currentTime - time) > 0.08) b.currentTime = time;
                b.playbackRate = a.playbackRate;
            }
            frame = requestAnimationFrame(sync);
        };
        frame = requestAnimationFrame(sync);
        return () => { cancelAnimationFrame(frame); guide.current?.pause(); };
    }, [source, result?.filename, offset]);
    const playGuide = () => {
        const a = target.current, b = guide.current;
        if (!a || !b) return;
        b.currentTime = a.currentTime + offset;
        b.playbackRate = a.playbackRate;
        void b.play().catch(cause => {
            a.pause();
            setError(`Could not synchronize the source video: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
    };
    if (!result) return null;
    return <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary p-4">
        <h3 className="font-semibold">{source ? 'Before / after · synchronized comparison' : 'Assembled result'}</h3>
        <p className="text-xs text-text-secondary">{source ? 'Left: original. Right: result. Use the result player to play, seek or change speed.'
            : 'BFS partial assembly uses its last executed timeline, which this endpoint does not return. Source alignment cannot be verified; the wipe is unavailable rather than showing the wrong frames.'}</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="relative overflow-hidden rounded-lg bg-black" style={{ aspectRatio: aspect }}>
            <video key={swapVideoURL(base, result)} ref={target} src={swapVideoURL(base, result)} controls preload="metadata"
                className="absolute inset-0 h-full w-full object-contain"
                onLoadedMetadata={event => { const v = event.currentTarget; if (v.videoWidth && v.videoHeight) setAspect(`${v.videoWidth} / ${v.videoHeight}`); }}
                onPause={() => guide.current?.pause()} onWaiting={() => guide.current?.pause()} onEnded={() => guide.current?.pause()}
                onPlaying={playGuide} onError={() => setError('The result video could not be loaded. Check that its file still exists on ComfyUI.')} />
            {source && <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - wipe}% 40px 0)` }}>
                <video key={source} ref={guide} src={source} muted playsInline preload="metadata" className="h-full w-full object-contain"
                    onError={() => setError('The comparison source could not be loaded. Check the ComfyUI input/output file.')} />
            </div>}
            {source && <div className="pointer-events-none absolute bottom-12 top-0 border-l-2 border-white" style={{ left: `${wipe}%` }} />}
        </div>
        <label className="flex items-center gap-3 text-sm">Original / result
            <input aria-label="Before after comparison" disabled={!source} className="flex-1" type="range" min="0" max="100" value={wipe} onChange={event => setWipe(Number(event.target.value))} />
            <span>{wipe}%</span>
        </label>
        <div className="flex flex-wrap gap-4 text-sm text-accent">
            <a href={swapVideoURL(base, result)} target="_blank" rel="noopener noreferrer" download={result.filename}>Download result</a>
            {videos[1] && <a href={swapVideoURL(base, videos[1])} target="_blank" rel="noopener noreferrer" download={videos[1].filename}>Download comparison video</a>}
        </div>
    </section>;
};
