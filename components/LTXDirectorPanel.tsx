import React, { useMemo, useRef, useState } from 'react';
import { DownloadIcon, GenerateIcon, SpinnerIcon, UploadCloudIcon } from './icons';
import { generateLtxDirectorVideo } from '../services/comfyUIService';

interface LTXDirectorPanelProps {
    isComfyUIConnected: boolean | null;
    comfyUIObjectInfo: any | null;
}

interface DirectorSegment {
    id: string;
    image: File;
    imageUrl: string;
    prompt: string;
    durationSeconds: number;
}

interface DirectorLora {
    enabled: boolean;
    name: string;
    strength: number;
}

const DEFAULT_CHECKPOINT = 'LTX2\\ltx-2.3-22b-dev-fp8.safetensors';
const DEFAULT_LORAS: DirectorLora[] = [
    { enabled: true, name: 'LTX2\\ltx-2-19b-distilled-lora_resized_dynamic_fro09_avg_rank_175_fp8.safetensors', strength: 0.5 },
    { enabled: true, name: 'LTX2\\LTX-2.3 Sulphur - Natural Sagging Breasts.safetensors', strength: 0.52 },
    { enabled: true, name: 'LTX2\\Shirt lift boob drop-v1.safetensors', strength: 0.66 },
];

const getModelList = (widgetInfo: any): string[] => Array.isArray(widgetInfo?.[0]) ? widgetInfo[0] : [];

export const LTXDirectorPanel: React.FC<LTXDirectorPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const imageInput = useRef<HTMLInputElement>(null);
    const audioInput = useRef<HTMLInputElement>(null);
    const [segments, setSegments] = useState<DirectorSegment[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [audio, setAudio] = useState<File | null>(null);
    const [frameRate, setFrameRate] = useState(24);
    const [guideStrength, setGuideStrength] = useState(1);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [checkpoint, setCheckpoint] = useState(DEFAULT_CHECKPOINT);
    const [loras, setLoras] = useState<DirectorLora[]>(DEFAULT_LORAS);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [videoUrl, setVideoUrl] = useState('');

    const selectedSegment = segments.find((segment) => segment.id === selectedId) || segments[0];
    const totalDuration = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
    const checkpoints = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name);
        return Array.from(new Set([DEFAULT_CHECKPOINT, ...models]));
    }, [comfyUIObjectInfo]);
    const loraModels = useMemo(() => {
        const models = getModelList(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name);
        return Array.from(new Set([...DEFAULT_LORAS.map((lora) => lora.name), ...models]));
    }, [comfyUIObjectInfo]);

    const addImages = (files: FileList | null) => {
        if (!files?.length) return;
        const additions = Array.from(files).map((image) => ({
            id: crypto.randomUUID(), image, imageUrl: URL.createObjectURL(image), prompt: '', durationSeconds: 5,
        }));
        setSegments((current) => [...current, ...additions]);
        setSelectedId(additions[0].id);
        if (imageInput.current) imageInput.current.value = '';
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
        const resize = (pointerEvent: PointerEvent) => {
            const durationSeconds = Math.min(20, Math.max(1, Math.round((startDuration + (pointerEvent.clientX - startX) / 35) * 2) / 2));
            updateSegment(segment.id, { durationSeconds });
        };
        const finish = () => {
            document.removeEventListener('pointermove', resize);
            document.removeEventListener('pointerup', finish);
        };
        document.addEventListener('pointermove', resize);
        document.addEventListener('pointerup', finish);
    };

    const removeSegment = (id: string) => {
        const removed = segments.find((segment) => segment.id === id);
        if (removed) URL.revokeObjectURL(removed.imageUrl);
        const remaining = segments.filter((segment) => segment.id !== id);
        setSegments(remaining);
        setSelectedId(remaining[0]?.id || '');
    };

    const updateLora = (index: number, changes: Partial<DirectorLora>) => {
        setLoras((current) => current.map((lora, loraIndex) => loraIndex === index ? { ...lora, ...changes } : lora));
    };

    const generate = async () => {
        if (!segments.length || segments.some((segment) => !segment.prompt.trim()) || !isComfyUIConnected) return;
        setIsGenerating(true);
        setError('');
        setVideoUrl('');
        try {
            const result = await generateLtxDirectorVideo(
                segments.map(({ image, prompt, durationSeconds }) => ({ image, prompt: prompt.trim(), durationSeconds })),
                audio,
                { frameRate, guideStrength, checkpoint, loras },
                (message, value) => { setProgressMessage(message); setProgress(value); },
            );
            setVideoUrl(result);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'LTX Director generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-zinc-700 bg-[#111214] text-zinc-100 shadow-2xl">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 bg-[#17181b] px-4 py-3">
                <div><h2 className="text-lg font-bold">LTX Director</h2><p className="text-xs text-zinc-400">{segments.length} clips · {totalDuration}s · LTX 2.3</p></div>
                <div className="flex items-center gap-2">
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
                    <label className="text-xs font-semibold text-zinc-400">LTX CHECKPOINT
                        <select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value)} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
                            {checkpoints.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </label>
                    <div className="grid gap-2">
                        {loras.map((lora, index) => <div key={index} className="grid grid-cols-[auto_1fr_80px] items-center gap-2">
                            <input type="checkbox" checked={lora.enabled} onChange={(event) => updateLora(index, { enabled: event.target.checked })} aria-label={`Enable LoRA ${index + 1}`} className="accent-amber-400" />
                            <select value={lora.name} disabled={!lora.enabled} onChange={(event) => updateLora(index, { name: event.target.value })} aria-label={`LoRA ${index + 1}`} className="min-w-0 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-2 text-xs text-zinc-100 disabled:opacity-40">
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
                        {selectedSegment ? <img src={selectedSegment.imageUrl} alt="Selected clip" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-xs text-zinc-400"><UploadCloudIcon className="h-7 w-7" />Add photos</span>}
                    </button>
                    <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addImages(event.target.files)} />
                    <button onClick={() => imageInput.current?.click()} className="mt-3 w-full rounded-md border border-zinc-600 py-2 text-sm font-semibold text-zinc-200 hover:border-amber-400">+ Add photos</button>

                    <div className="mt-5 space-y-4">
                        <label className="block text-xs font-semibold text-zinc-400">FRAME RATE
                            <select value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))} className="mt-2 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm"><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option></select>
                        </label>
                        <label className="block text-xs font-semibold text-zinc-400">GUIDE STRENGTH
                            <div className="mt-2 flex items-center gap-3"><input type="range" min="0" max="2" step="0.05" value={guideStrength} onChange={(event) => setGuideStrength(Number(event.target.value))} className="w-full accent-amber-400" /><span className="w-10 text-right text-sm">{guideStrength.toFixed(2)}</span></div>
                        </label>
                        <button onClick={() => audioInput.current?.click()} className={`w-full rounded-md border px-3 py-2 text-left text-xs ${audio ? 'border-cyan-400 text-cyan-200' : 'border-dashed border-zinc-600 text-zinc-400'}`}>{audio ? audio.name : '+ Optional soundtrack'}</button>
                        <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => setAudio(event.target.files?.[0] || null)} />
                    </div>
                </aside>

                <div className="min-w-0 bg-[#0d0e10]">
                    <div className="flex min-h-[280px] items-center justify-center border-b border-zinc-700 bg-black p-4">
                        {videoUrl ? <video src={videoUrl} controls autoPlay className="max-h-[350px] max-w-full" /> : selectedSegment ? <img src={selectedSegment.imageUrl} alt="Timeline preview" className="max-h-[330px] max-w-full object-contain" /> : <div className="text-sm text-zinc-600">ADD PHOTOS TO START</div>}
                    </div>

                    <div className="overflow-x-auto p-4">
                        <div className="min-w-[680px]">
                            <div className="ml-20 flex justify-between border-b border-zinc-700 pb-1 text-[10px] text-zinc-500"><span>0s</span><span>{Math.round(totalDuration / 2)}s</span><span>{totalDuration}s</span></div>
                            <div className="mt-2 grid grid-cols-[72px_1fr] gap-2">
                                <div className="flex items-center text-xs font-semibold text-zinc-400">VIDEO</div>
                                <div className="flex h-24 gap-1 overflow-hidden rounded bg-zinc-900 p-1">
                                    {segments.map((segment, index) => <button key={segment.id} onClick={() => setSelectedId(segment.id)} style={{ flexGrow: segment.durationSeconds, flexBasis: 0, minWidth: 86 }} className={`group relative overflow-hidden rounded border-2 text-left ${selectedSegment?.id === segment.id ? 'border-amber-400' : 'border-zinc-700'}`}>
                                        <img src={segment.imageUrl} alt={`Clip ${index + 1}`} className="h-full w-full object-cover" />
                                        <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-2 py-1 text-[10px]"><b>#{index + 1}</b><span>{segment.durationSeconds}s</span></span>
                                        <span onPointerDown={(event) => beginResize(event, segment)} title="Drag to resize clip" className="absolute inset-y-0 right-0 w-3 cursor-ew-resize border-l border-amber-200/80 bg-amber-400/30 opacity-70 hover:opacity-100" />
                                    </button>)}
                                    <button onClick={() => imageInput.current?.click()} className="min-w-20 rounded border border-dashed border-zinc-600 text-xs text-zinc-500">+ Photo</button>
                                </div>
                                <div className="flex items-center text-xs font-semibold text-zinc-400">AUDIO</div>
                                <button onClick={() => audioInput.current?.click()} className={`h-10 rounded border ${audio ? 'border-cyan-400/70 bg-cyan-400/10' : 'border-dashed border-zinc-600 bg-zinc-900'}`}><span className="text-xs text-zinc-400">{audio?.name || 'Optional soundtrack'}</span></button>
                            </div>

                            {selectedSegment && <div className="mt-4 border-t border-zinc-700 pt-4">
                                <div className="mb-3 flex items-center gap-3">
                                    <label className="flex flex-1 items-center gap-3 text-xs font-semibold text-zinc-400">CLIP {segments.indexOf(selectedSegment) + 1} DURATION
                                        <input type="range" min="1" max="20" step="0.5" value={selectedSegment.durationSeconds} onChange={(event) => updateSegment(selectedSegment.id, { durationSeconds: Number(event.target.value) })} className="min-w-24 flex-1 accent-amber-400" />
                                        <span className="w-9 text-right text-zinc-100">{selectedSegment.durationSeconds}s</span>
                                    </label>
                                    <button onClick={() => removeSegment(selectedSegment.id)} className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950">Remove</button>
                                </div>
                                <textarea value={selectedSegment.prompt} onChange={(event) => updateSegment(selectedSegment.id, { prompt: event.target.value })} rows={4} placeholder={`Prompt for clip ${segments.indexOf(selectedSegment) + 1}: camera, subject action, lighting and sound...`} className="w-full resize-y rounded border border-zinc-600 bg-[#181a1e] p-3 text-sm leading-6 outline-none focus:border-amber-400" />
                            </div>}
                        </div>
                    </div>

                    {(isGenerating || error || videoUrl) && <div className="border-t border-zinc-700 px-4 py-3">
                        {isGenerating && <><div className="mb-2 flex justify-between text-xs text-zinc-400"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-amber-400" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></>}
                        {error && <p className="text-sm text-red-400">{error}</p>}
                        {videoUrl && <a href={videoUrl} download className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300"><DownloadIcon className="h-4 w-4" />Download video</a>}
                    </div>}
                </div>
            </div>
        </section>
    );
};