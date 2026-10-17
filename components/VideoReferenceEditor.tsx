import React, { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { extractVideoClip } from '../services/videoClipService';
import { referenceToken, type VideoReference } from '../services/videoPromptService';

export const useMediaURL = (file: File): string => {
    const [url, setURL] = useState('');
    useEffect(() => {
        const next = URL.createObjectURL(file);
        setURL(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return url;
};
const fullCrop: PercentCrop = { unit: '%', x: 0, y: 0, width: 100, height: 100 };
const input = 'w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-text-primary';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm hover:bg-bg-tertiary disabled:opacity-40';
const even = (value: number) => Math.max(2, Math.min(4096, Math.round(value / 2) * 2));

export const VideoReferenceEditor: React.FC<{
    reference: VideoReference;
    onSave: (file: File) => void;
    onClose: () => void;
}> = ({ reference, onSave, onClose }) => {
    const url = useMediaURL(reference.file);
    const imageRef = useRef<HTMLImageElement>(null);
    const controller = useRef<AbortController | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [crop, setCrop] = useState<PercentCrop>(fullCrop);
    const [ratio, setRatio] = useState('free');
    const [width, setWidth] = useState(1280);
    const [height, setHeight] = useState(720);
    const [lockRatio, setLockRatio] = useState(true);
    const [duration, setDuration] = useState(0);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const isVideo = reference.kind === 'video';
    const aspect = ratio === 'free' ? undefined : Number(ratio.split(':')[0]) / Number(ratio.split(':')[1]);
    const cropAspect = size.width * crop.width / (size.height * crop.height);

    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (busy) return;
        const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, [busy, onClose]);

    const initialize = (w: number, h: number) => {
        if (!w || !h) { setError('Could not read media dimensions.'); return; }
        setSize({ width: w, height: h });
        const outputWidth = even(Math.min(w, 1920));
        setWidth(outputWidth);
        setHeight(even(outputWidth * h / w));
    };
    const changeCrop = (next: PercentCrop) => {
        if (next.width <= 0 || next.height <= 0) return;
        setCrop(next);
        if (lockRatio) setHeight(even(width * size.height * next.height / (size.width * next.width)));
    };
    const changeRatio = (value: string) => {
        setRatio(value);
        changeCrop(value === 'free' ? fullCrop : centerCrop(makeAspectCrop(
            { unit: '%', width: 100 }, Number(value.split(':')[0]) / Number(value.split(':')[1]), size.width, size.height,
        ), size.width, size.height));
    };
    const save = async () => {
        setError('');
        if (!size.width || !size.height || ![width, height].every(value => Number.isInteger(value) && value >= 2 && value <= 4096 && value % 2 === 0)) {
            setError('Use even output dimensions between 2 and 4096 pixels.'); return;
        }
        setBusy(true);
        const abort = new AbortController();
        controller.current = abort;
        try {
            let file: File;
            if (isVideo) {
                const result = await extractVideoClip(reference.file, {
                    start, end, duration, reduceResolution: false,
                    spatialEdit: { x: crop.x, y: crop.y, width: crop.width, height: crop.height, outputWidth: width, outputHeight: height },
                }, abort.signal, setProgress);
                file = new File([result.file], `${reference.file.name.replace(/\.[^.]+$/, '')}-edited.mp4`, { type: 'video/mp4' });
            } else {
                if (!imageRef.current) throw new Error('Image is not ready.');
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Canvas is not available.');
                context.drawImage(imageRef.current,
                    size.width * crop.x / 100, size.height * crop.y / 100,
                    size.width * crop.width / 100, size.height * crop.height / 100,
                    0, 0, width, height);
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
                    value => value ? resolve(value) : reject(new Error('Could not export the image.')), 'image/png',
                ));
                abort.signal.throwIfAborted();
                file = new File([blob], `${reference.file.name.replace(/\.[^.]+$/, '')}-edited.png`, { type: 'image/png' });
            }
            onSave(file);
        } catch (cause) {
            setError(abort.signal.aborted ? 'Edit cancelled. Original reference retained.' : cause instanceof Error ? cause.message : String(cause));
        } finally {
            controller.current = null;
            setBusy(false);
        }
    };
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="video-ref-editor-title" className="max-h-[94vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-2xl border border-border-primary bg-bg-secondary p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
                <div><h2 id="video-ref-editor-title" className="text-lg font-bold">Edit {referenceToken(reference)}</h2><p className="break-all text-xs text-text-secondary">{reference.file.name}</p></div>
                <button autoFocus type="button" disabled={busy} className={button} onClick={onClose}>Close</button>
            </div>
            <div className="flex min-h-48 justify-center overflow-hidden rounded-xl bg-black/60 p-2">
                {url && <ReactCrop crop={crop} aspect={aspect} onChange={(_, next) => changeCrop(next)} keepSelection disabled={busy || !size.width} minWidth={2} minHeight={2}>
                    {isVideo
                        ? <video src={url} controls preload="metadata" className="block max-h-[48vh] max-w-full" onLoadedMetadata={event => {
                            const video = event.currentTarget;
                            initialize(video.videoWidth, video.videoHeight);
                            if (!Number.isFinite(video.duration) || video.duration <= 0) setError('Invalid video duration.');
                            else { setDuration(video.duration); setEnd(video.duration); }
                        }} onError={() => setError('Cannot decode this video. Try an MP4 (H.264).')} />
                        : <img ref={imageRef} src={url} draggable={false} alt="Reference crop preview" className="block max-h-[48vh] max-w-full" onLoad={event => initialize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onError={() => setError('Cannot decode this image.')} />}
                </ReactCrop>}
            </div>
            <p className="text-xs text-text-secondary">Drag the handles to crop, or drag inside to reposition. Video edits export a real MP4 with the original audio; encoding runs locally.</p>
            <fieldset disabled={busy || !size.width} className="space-y-3 disabled:opacity-50">
                <div className="flex flex-wrap gap-2">{['free', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map(value =>
                    <button key={value} type="button" className={`${button} ${ratio === value ? 'border-accent text-accent' : ''}`} onClick={() => changeRatio(value)} aria-pressed={ratio === value}>{value === 'free' ? 'Free' : value}</button>)}
                    <button type="button" className={button} onClick={() => { setRatio('free'); changeCrop(fullCrop); }}>Clear crop</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">Width (px)<input aria-label="Output width" type="number" min={2} max={4096} step={2} className={input} value={width} onChange={event => {
                        const value = Number(event.target.value); setWidth(value); if (lockRatio) setHeight(even(value / cropAspect));
                    }} /></label>
                    <label className="text-sm">Height (px)<input aria-label="Output height" type="number" min={2} max={4096} step={2} className={input} value={height} onChange={event => {
                        const value = Number(event.target.value); setHeight(value); if (lockRatio) setWidth(even(value * cropAspect));
                    }} /></label>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lockRatio} onChange={event => {
                    setLockRatio(event.target.checked); if (event.target.checked) setHeight(even(width / cropAspect));
                }} />Preserve cropped aspect ratio (uncheck to stretch)</label>
                {isVideo && <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">Start (seconds)<input aria-label="Video trim start" type="number" min={0} max={duration} step={0.01} value={start} onChange={event => setStart(Number(event.target.value))} className={input} /></label>
                    <label className="text-sm">End (seconds)<input aria-label="Video trim end" type="number" min={0} max={duration} step={0.01} value={end} onChange={event => setEnd(Number(event.target.value))} className={input} /></label>
                </div>}
            </fieldset>
            {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
                {busy ? <button type="button" className={button} onClick={() => controller.current?.abort()}>Cancel encoding ({Math.round(progress)}%)</button>
                    : <><button type="button" className={button} onClick={onClose}>Cancel</button><button type="button" disabled={!size.width} className={`${button} bg-accent/15 text-accent`} onClick={save}>Apply crop & resize</button></>}
            </div>
        </section>
    </div>;
};
