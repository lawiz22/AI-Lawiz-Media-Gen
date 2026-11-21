import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryAssetRole, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import { readRenderedLibraryMedia } from '../services/minimaxH3Library';
import { h3Choices, h3Input, isRecord, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { buildRippleWorkflow, defaultRippleDraft, defaultRippleSettings, fitRippleToSource, rippleSourceFrameLimit, rippleNumber, rippleResolution, rippleSavedSetup, validateRippleDraft,
    RIPPLE_TEMPLATE, type RippleDraft, type RippleSettings, type RippleValue } from '../services/ltxRippleWorkflow';
import { generateRippleVideo, loadRippleObjectInfo, prepareRippleWorkflow, type RippleResult } from '../services/ltxRippleService';
import type { GraphLive } from '../services/comfyGraphExecution';
import { createVideoPlaceholderThumbnail } from '../utils/imageUtils';
import { useMediaURL } from './VideoReferenceEditor';
import { LibraryPickerModal } from './LibraryPickerModal';
import { VideoOutputFrames } from './VideoOutputFrames';
import { readVideoDuration } from '../services/videoClipService';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const input = 'mt-1 w-full min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary';
export const RippleAccordion: React.FC<{ title: string; children: () => React.ReactNode }> = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return <details className="rounded-xl border border-border-primary p-3" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{title}</summary>{open && <div className="mt-3 space-y-4">{children()}</div>}
    </details>;
};
const groups = [
    { title: 'Resolution, frame count and FPS', ids: ['1331', '937', '936'] },
    { title: 'Models and required Ripple LoRA', ids: ['821', '1318', '822', '448', '1312'] },
    { title: 'Sampling and negative prompt', ids: ['1265', '1319', '1267', '388'] },
    { title: 'Video loading and image resizing', ids: ['790', '782', '1294', '1289'] },
    { title: 'FFAF conditioning and audio latent', ids: ['1330', '567', '1257'] },
    { title: 'CacheDiT and attention optimizations', ids: ['1332', '1320', '1321'] },
    { title: 'Tiled decode and video outputs', ids: ['1333', '425', '780', '786'] },
    { title: 'Comparison layout and labels', ids: ['783', '1305', '1306'] },
];
const nodeTitles: Record<string, string> = {
    '1331': 'Canvas', '937': 'Frame count (8n + 1)', '936': 'FPS', '821': 'Diffusion model', '1318': 'Text encoder',
    '822': 'Video VAE', '448': 'Audio VAE', '1312': 'Required Ripple LoRA', '1265': 'Sampler', '1319': 'Scheduler',
    '1267': 'CFG', '388': 'Negative prompt', '790': 'Source video loading', '782': 'Source resize', '1294': 'Edited frame resize',
    '1289': 'Conditioning frames', '1330': 'First Frame All Frames guide', '567': 'Video latent', '1257': 'Audio latent',
    '1332': 'CacheDiT', '1320': 'Sage attention', '1321': 'Memory-efficient attention', '1333': 'Decode',
    '425': 'Edited video output', '780': 'Source video output', '786': 'Comparison output', '783': 'Comparison layout',
    '1305': 'Source label', '1306': 'Edited label', '1232': 'Seed',
};
const exportJSON = (value: unknown, name: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const LTXRipplePanel: React.FC<{
    draft?: RippleDraft; settings?: RippleSettings; ready: boolean;
    onDraftChange: (draft: RippleDraft) => void; onSettingsChange: (settings: RippleSettings) => void;
    libraryItem?: LibraryItem | null; onLibraryItemLoaded: () => void;
}> = ({ draft: storedDraft, settings: storedSettings, ready, onDraftChange, onSettingsChange, libraryItem, onLibraryItemLoaded }) => {
    const dispatch = useDispatch<AppDispatch>();
    const draft: RippleDraft = storedDraft || defaultRippleDraft(), settings: RippleSettings = storedSettings || defaultRippleSettings();
    const latestDraft = useRef(draft), latestSettings = useRef(settings);
    latestDraft.current = draft; latestSettings.current = settings;
    const [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [restoring, setRestoring] = useState(false);
    const [videoLoading, setVideoLoading] = useState(false);
    const [error, setError] = useState(''), [status, setStatus] = useState(''), [progress, setProgress] = useState(0);
    const [result, setResult] = useState<RippleResult | null>(null), [savedIds, setSavedIds] = useState<string[]>([]);
    const [live, setLive] = useState<GraphLive>({ completedNodes: [], outputs: {} });
    const [picker, setPicker] = useState<'image' | 'video' | null>(null), [cancelling, setCancelling] = useState(false);
    const controller = useRef<AbortController | null>(null), restoration = useRef<LibraryItem | null>(null);
    const newVideo = useRef<File | null>(null);
    const imageURL = useMediaURL(draft.image || undefined), videoURL = useMediaURL(draft.video || undefined);
    const previewURL = useMediaURL(live.preview);
    const blocked = !ready || busy || saving || restoring || videoLoading;
    const report = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
    useEffect(() => {
        const abort = new AbortController();
        loadRippleObjectInfo(abort.signal).then(setInfo).catch(cause => { if (!abort.signal.aborted) report(`Could not load Ripple node/model lists: ${String(cause)}. Use Check nodes and models to retry.`); });
        return () => abort.abort();
    }, []);
    useEffect(() => {
        const video = draft.video;
        if (!ready || !video) { setVideoLoading(false); return; }
        const abort = new AbortController();
        setVideoLoading(true);
        const measure = async () => {
            const duration = draft.videoDuration ?? await readVideoDuration(video, abort.signal);
            abort.signal.throwIfAborted();
            if (latestDraft.current.video !== video) return;
            const fitted = fitRippleToSource(latestSettings.current, duration, newVideo.current === video);
            newVideo.current = null;
            onDraftChange({ ...latestDraft.current, videoDuration: duration });
            onSettingsChange(fitted);
        };
        void measure().catch(cause => { if (!abort.signal.aborted) report(cause); }).finally(() => {
            if (!abort.signal.aborted) setVideoLoading(false);
        });
        return () => abort.abort();
    }, [ready, draft.video]);
    useEffect(() => {
        if (!libraryItem) { restoration.current = null; return; }
        if (!ready || !libraryItem?.ltxRippleOptions || restoration.current === libraryItem || busy || saving) return;
        const setup = libraryItem.ltxRippleOptions;
        if (storedDraft && !window.confirm('Replace only the LTX-Ripple-FFAF inputs, prompt and settings with this Library setup?')) {
            restoration.current = libraryItem; onLibraryItemLoaded(); return;
        }
        restoration.current = libraryItem; setRestoring(true); setError('');
        const restore = async () => {
            if (setup.version !== 1) throw new Error('Unsupported Ripple Library setup version.');
            buildRippleWorkflow(setup.settings, setup.prompt, { image: 'check.png', video: 'check.mp4' });
            const read = async (role: LibraryAssetRole, file: typeof setup.image): Promise<File | null> => {
                if (!file) return null;
                const ref = libraryItem.assetRefs?.[role];
                if (!ref) throw new Error(`Missing saved Ripple input: ${file.name}. No draft was replaced.`);
                const blob = await getLibraryAssetBlob(ref);
                return new File([blob], file.name, { type: file.type || blob.type, lastModified: file.lastModified });
            };
            const [image, video] = await Promise.all([read('sourceImage', setup.image), read('ltxRippleVideo', setup.video)]);
            if (restoration.current !== libraryItem) return;
            onDraftChange({ prompt: setup.prompt, image, video, videoDuration: setup.videoDuration }); onSettingsChange(structuredClone(setup.settings));
            setStatus('Ripple setup restored with its original inputs.'); setResult(null); setSavedIds([]);
        };
        void restore().catch(cause => { if (restoration.current === libraryItem) report(cause); }).finally(() => {
            if (restoration.current === libraryItem) { setRestoring(false); onLibraryItemLoaded(); }
        });
    }, [ready, libraryItem, busy, saving, onLibraryItemLoaded]);
    const setValue = (id: string, name: string, value: RippleValue) => {
        const current = latestSettings.current;
        let next = { ...current, nodes: { ...current.nodes, [id]: { ...current.nodes[id], [name]: value } } };
        try {
            const duration = latestDraft.current.videoDuration;
            if (duration !== undefined) {
                if (id === '937' && !current.allowExtraFrames && Number(value) > rippleSourceFrameLimit(next, duration)) {
                    throw new Error('Frame count cannot exceed the source video. Enable Allow extra frames to extend it.');
                }
                if (id === '936' || id === '790' && ['skip_first_frames', 'select_every_nth'].includes(name)) {
                    const wasFull = rippleNumber(current, '937', 'value') === rippleSourceFrameLimit(current, duration);
                    next = fitRippleToSource(next, duration, wasFull && !next.allowExtraFrames);
                }
            }
            onSettingsChange(next);
            setError('');
        } catch (cause) { report(cause); }
    };
    const updateDraft = (patch: Partial<RippleDraft>) => onDraftChange({ ...latestDraft.current, ...patch });
    const chooseFile = (kind: 'image' | 'video', file: File) => {
        if (!file.size || !file.type.startsWith(`${kind}/`)) throw new Error(`Choose a non-empty ${kind} file.`);
        setError('');
        if (kind === 'video') newVideo.current = file;
        updateDraft({ [kind]: file, ...(kind === 'video' ? { videoDuration: undefined } : {}) });
    };
    const field = (id: string, name: string, value: RippleValue) => {
        const type = RIPPLE_TEMPLATE[id].class_type, schema = h3Input(info, type, name, settings.nodes[id]);
        const config = Array.isArray(schema) && isRecord(schema[1]) ? schema[1] : {};
        const choices = h3Choices(info, type, name), label = `${nodeTitles[id] || id}: ${name.replaceAll('_', ' ')}`;
        return <label key={name} className="block min-w-0 text-xs text-text-secondary">{name.replaceAll('_', ' ')}
            {typeof value === 'boolean' ? <input aria-label={label} type="checkbox" className="ml-2" checked={value} onChange={event => setValue(id, name, event.target.checked)} />
                : choices.length || ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'sampler_name', 'scheduler'].includes(name) ? <select aria-label={label} className={input} value={String(value)} onChange={event => setValue(id, name, event.target.value)}>
                    {!choices.includes(String(value)) && <option value={String(value)}>{String(value)} (current / not listed)</option>}
                    {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                </select>
                    : typeof value === 'number' ? <input aria-label={label} className={input} type="number" step={id === '937' ? 8 : Array.isArray(schema) && schema[0] === 'INT' ? 1 : 'any'}
                        min={id === '937' ? 9 : typeof config.min === 'number' ? config.min : undefined}
                        max={id === '937' && !settings.allowExtraFrames ? sourceLimit
                            : typeof config.max === 'number' ? Math.min(config.max, Number.MAX_SAFE_INTEGER) : undefined}
                        value={value} onChange={event => {
                            if (!Number.isFinite(event.target.valueAsNumber)) { setError(`Enter a finite number for ${label}.`); return; }
                            setValue(id, name, event.target.valueAsNumber);
                        }} />
                        : <textarea aria-label={label} rows={name === 'text' ? 3 : 1} className={input} value={value} onChange={event => setValue(id, name, event.target.value)} />}
        </label>;
    };
    const run = async (action: 'check' | 'export' | 'generate') => {
        if (controller.current) return;
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setError(''); setStatus(''); setProgress(0); setCancelling(false);
        const source = { ...latestDraft.current }, snapshot = structuredClone(latestSettings.current);
        try {
            validateRippleDraft(source);
            if (source.videoDuration === undefined && !snapshot.allowExtraFrames) throw new Error('Read the source video duration before generating. Remove and select the video again if metadata could not be read.');
            if (!snapshot.allowExtraFrames && source.videoDuration !== undefined && rippleNumber(snapshot, '937', 'value') > rippleSourceFrameLimit(snapshot, source.videoDuration)) {
                throw new Error('Frame count exceeds the source video. Reduce it or explicitly enable Allow extra frames.');
            }
            if (action === 'generate' && snapshot.randomizeSeed) {
                snapshot.nodes['1232'].seed = Math.floor(Math.random() * 1e15); onSettingsChange(snapshot);
            }
            if (action === 'check') {
                const schemas = await loadRippleObjectInfo(abort.signal, true); setInfo(schemas);
                buildRippleWorkflow(snapshot, source.prompt, { image: source.image!.name, video: source.video!.name }, schemas);
                setStatus('Ripple nodes, models and settings validated. No upload or generation performed.');
            } else if (action === 'export') {
                const graph = await prepareRippleWorkflow(source, snapshot, abort.signal, (message, value) => { setStatus(message); setProgress(value); });
                exportJSON(graph, 'ltx-ripple-ffaf-api.json'); setStatus('API workflow exported with uploaded inputs. No job queued.');
            } else {
                setLive({ completedNodes: [], outputs: {} });
                const generated = await generateRippleVideo(source, snapshot, abort.signal, (message, value) => { setStatus(message); setProgress(value); }, setLive);
                setResult(generated); setSavedIds([]);
            }
        } catch (cause) {
            if (abort.signal.aborted) { setStatus('Ripple operation cancelled.'); if (cause instanceof Error && cause.message !== 'This operation was aborted') report(cause); }
            else report(cause);
        } finally { controller.current = null; setBusy(false); setCancelling(false); }
    };
    const save = async (outputId?: string) => {
        setSaving(true); setError('');
        try {
            const source = outputId ? result?.draft : draft, config = outputId ? result?.settings : settings;
            if (!source || !config) throw new Error('Generate a video before saving output.');
            const setup = rippleSavedSetup(source, config);
            buildRippleWorkflow(config, source.prompt, { image: 'check.png', video: 'check.mp4' });
            const assets: Partial<Record<LibraryAssetRole, Blob>> = {};
            if (source.image) assets.sourceImage = source.image;
            if (source.video) assets.ltxRippleVideo = source.video;
            let thumbnail = createVideoPlaceholderThumbnail(), warning = '';
            let mediaType: 'preset' | 'video' | 'image' = outputId ? 'video' : 'preset';
            if (outputId) {
                const output = result?.videos.find(video => video.id === outputId);
                if (!output || !result) throw new Error('This Ripple output is unavailable.');
                const media = await readRenderedLibraryMedia(output.url, undefined, 'LTX-Ripple-FFAF');
                assets.media = media.blob; thumbnail = media.thumbnail; warning = media.warning || ''; mediaType = media.mediaType;
                Object.assign(setup, { promptId: result.promptId, workflow: result.workflow, outputId });
            }
            await dispatch(addToLibrary({ mediaType, media: outputId ? '' : JSON.stringify(config),
                name: `LTX-Ripple-FFAF - ${outputId ? result?.videos.find(video => video.id === outputId)?.label : 'Setup'}`,
                thumbnail, tags: ['ltx-2.5', 'ripple', 'ffaf'], ltxRippleOptions: setup, assetBlobs: assets })).unwrap();
            if (outputId) setSavedIds(current => [...current, outputId]);
            setStatus(`Saved to Library with original source inputs and exact settings. ${warning}`);
        } catch (cause) { report(cause); } finally { setSaving(false); }
    };
    const loras = h3Choices(info, 'LoraLoaderModelOnly', 'lora_name');
    let sourceLimit: number | undefined, sourceLimitError = '';
    if (draft.videoDuration !== undefined) {
        try { sourceLimit = rippleSourceFrameLimit(settings, draft.videoDuration); }
        catch (cause) { sourceLimitError = cause instanceof Error ? cause.message : String(cause); }
    }
    let dimensions = '';
    try { const size = rippleResolution(settings); dimensions = `${size.width} x ${size.height}`; }
    catch (cause) { dimensions = String(cause); }
    return <section className="space-y-4 rounded-2xl border border-teal-400/40 bg-bg-secondary p-4 md:p-5">
        <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold text-teal-200">LTX-Ripple-FFAF</h2>
            <p className="mt-1 text-sm text-text-secondary">First Frame All Frames: propagate an edited first frame through the source video. Original audio is reused in the edited video; the comparison is silent, as in the supplied workflow.</p></div>
            <button type="button" className={`${button} text-red-300`} disabled={blocked} onClick={() => {
                if (!window.confirm('Reset only LTX-Ripple-FFAF inputs, prompt, settings and displayed outputs? Library and ComfyUI files will remain untouched.')) return;
                onDraftChange(defaultRippleDraft()); onSettingsChange(defaultRippleSettings()); setResult(null); setSavedIds([]); setError(''); setStatus(''); setLive({ completedNodes: [], outputs: {} });
            }}>Start from scratch</button></header>
        {error && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-300">{error}</p>}
        {status && <p role="status" className="text-sm text-text-secondary">{status}</p>}
        <fieldset disabled={blocked} className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] disabled:opacity-60">
            <div className="min-w-0 space-y-3">
                <div className="space-y-2 rounded-xl border border-border-primary p-3">
                    <label className="flex items-center gap-2 text-sm"><input aria-label="Allow extra frames" type="checkbox" checked={settings.allowExtraFrames === true} onChange={event => {
                        const next = { ...latestSettings.current, allowExtraFrames: event.target.checked };
                        try { onSettingsChange(draft.videoDuration === undefined ? next : fitRippleToSource(next, draft.videoDuration)); setError(''); }
                        catch (cause) { report(cause); }
                    }} />Allow extra frames (extend beyond source video)</label>
                    <p className="text-xs text-text-secondary">{videoLoading ? 'Reading source video duration...' : draft.videoDuration !== undefined
                        ? `Source: ${draft.videoDuration.toFixed(3)}s${sourceLimit !== undefined ? ` / up to ${sourceLimit} LTX frames with current loading settings` : ''}. Frame count is aligned down to 8n + 1. You can shorten it; extension requires this checkbox.`
                        : 'Upload a video to adapt the frame count automatically. Extension is off by default.'}</p>
                    {sourceLimitError && <p role="alert" className="text-sm text-red-300">{sourceLimitError}</p>}
                </div>
                {groups.map(group => <RippleAccordion key={group.title} title={group.title}>{() => group.ids.map(id => <div key={id}><h4 className="mb-2 text-sm text-teal-200">{nodeTitles[id]}</h4>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{Object.entries<RippleValue>(settings.nodes[id] || {}).map(([name, value]) => field(id, name, value))}</div></div>)}</RippleAccordion>)}
                <details className="rounded-xl border border-border-primary p-3" open><summary className="cursor-pointer font-semibold">Seed</summary>
                    <div className="mt-3">{field('1232', 'seed', settings.nodes['1232'].seed)}</div>
                    <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSeed} onChange={event => onSettingsChange({ ...latestSettings.current, randomizeSeed: event.target.checked })} />Randomize seed</label>
                </details>
            </div>
            <div className="min-w-0 space-y-4">
                <label className="block text-sm">Editing prompt<textarea aria-label="Ripple editing prompt" rows={6} className={input} value={draft.prompt} onChange={event => updateDraft({ prompt: event.target.value })} /></label>
                <p className="text-xs text-text-secondary">The prompt is sent unchanged. Supply the already edited first frame and its original source video; this workflow does not create that first-frame edit.</p>
                {(['image', 'video'] as const).map(kind => <div key={kind} className="space-y-2 rounded-xl border border-border-primary p-3">
                    <h3 className="font-semibold">{kind === 'image' ? 'Edited first frame (required)' : 'Source video (required)'}</h3>
                    <input type="file" aria-label={`Ripple ${kind}`} accept={`${kind}/*`} className="w-full text-xs" onChange={event => {
                        const file = event.target.files?.[0]; event.target.value = ''; if (file) try { chooseFile(kind, file); } catch (cause) { report(cause); }
                    }} />
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setPicker(kind)}>Load {kind} from Library</button>
                        {draft[kind] && <button type="button" className={button} onClick={() => updateDraft({ [kind]: null, ...(kind === 'video' ? { videoDuration: undefined } : {}) })}>Remove {kind}</button>}</div>
                    <p className="break-all text-xs text-text-secondary">{draft[kind]?.name}</p>
                    {kind === 'image' && imageURL && <img src={imageURL} alt="Ripple edited first frame" className="max-h-64 w-full object-contain" />}
                    {kind === 'video' && videoURL && <video src={videoURL} controls preload="metadata" className="max-h-64 w-full" />}
                </div>)}
                <RippleAccordion title="Additional LoRAs (4 optional slots)">{() => <>
                    <p className="mt-2 text-xs text-text-secondary">Added after the required Ripple LoRA, before CacheDiT and attention patches. Use LTX 2.5-compatible LoRAs only.</p>
                    <div className="mt-3 space-y-3">{settings.loras.map((lora, index) => {
                        const update = (patch: Partial<typeof lora>) => onSettingsChange({ ...latestSettings.current, loras: latestSettings.current.loras.map((value, slot) => slot === index ? { ...value, ...patch } : value) });
                        return <div key={index} className="space-y-2 rounded-lg border border-border-primary p-2">
                            <label className="flex gap-2 text-sm"><input type="checkbox" checked={lora.enabled} onChange={event => update({ enabled: event.target.checked })} />LoRA {index + 1}</label>
                            <select aria-label={`Ripple additional LoRA ${index + 1}`} className={input} value={lora.name} onChange={event => update({ name: event.target.value })}>
                                <option value="">Select a LoRA...</option>{lora.name && !loras.includes(lora.name) && <option value={lora.name}>{lora.name} (not listed)</option>}
                                {loras.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                            <label className="block text-xs">Strength<input aria-label={`Ripple LoRA ${index + 1} strength`} type="number" step="0.05" className={input} value={lora.strength} onChange={event => update({ strength: event.target.valueAsNumber })} /></label>
                        </div>;
                    })}</div>
                </>}</RippleAccordion>
            </div>
            <div className="space-y-3 xl:col-span-2"><p className="text-sm text-teal-200">{dimensions} · {rippleNumber(settings, '937', 'value')} frames · {rippleNumber(settings, '936', 'value')} FPS · {(rippleNumber(settings, '937', 'value') / rippleNumber(settings, '936', 'value')).toFixed(2)}s</p>
                <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void run('check')}>Check nodes and models</button>
                    <button type="button" className={button} onClick={() => void run('export')}>Export API workflow</button>
                    <button type="button" className={button} onClick={() => void save()}>Save setup to Library</button>
                    <button type="button" className={`${button} border-teal-400/50 bg-teal-400/15 text-teal-200`} onClick={() => void run('generate')}>Generate LTX-Ripple-FFAF</button></div>
            </div>
        </fieldset>
        {busy && <div className="space-y-2"><progress className="w-full" max={1} value={progress} /><p className="text-xs">{live.node ? `Node ${live.node}` : 'Preparing / waiting'}{live.total ? ` - ${live.step ?? 0}/${live.total} steps` : ''}</p>
            <button type="button" className={`${button} text-red-300`} disabled={cancelling} onClick={() => { setCancelling(true); controller.current?.abort(); }}>{cancelling ? 'Cancelling safely...' : 'Cancel this operation'}</button></div>}
        {previewURL && <img src={previewURL} alt="Ripple live preview" className="max-h-80 w-full object-contain" />}
        {result && <div className="space-y-4">{result.videos.map(output => <article key={`${result.promptId}-${output.id}`} className="space-y-3 rounded-xl border border-border-primary p-3">
            <h3 className="font-semibold">{output.label}</h3>{String(result.workflow[output.id].inputs.format).startsWith('image/')
                ? <img src={output.url} alt={output.label} className="max-h-[480px] w-full object-contain" />
                : <VideoOutputFrames result={{ videoUrl: output.url }} url={output.url} disabled={busy || saving} />}
            <div className="flex flex-wrap gap-2"><a className={button} href={output.url} download target="_blank" rel="noreferrer">Open / download {output.label}</a>
                <button type="button" className={button} disabled={blocked || savedIds.includes(output.id)} onClick={() => void save(output.id)}>{savedIds.includes(output.id) ? 'Saved to Library' : `Save ${output.label} to Library`}</button></div>
        </article>)}<button type="button" className={button} onClick={() => exportJSON(result.workflow, 'ltx-ripple-ffaf-executed-api.json')}>Export executed workflow</button></div>}
        {picker && <LibraryPickerModal isOpen onClose={() => setPicker(null)} filter={picker === 'image' ? ['image', 'character', 'extracted-frame'] : ['video']} onSelectItem={async item => {
            const response = await fetch(item.media); if (!response.ok) throw new Error(`Cannot read Library media (${response.status}).`);
            const blob = await response.blob();
            chooseFile(picker, new File([blob], `${item.name || `library-${item.id}`}.${picker === 'image' ? 'png' : 'mp4'}`, { type: blob.type }));
            setPicker(null);
        }} />}
    </section>;
};
