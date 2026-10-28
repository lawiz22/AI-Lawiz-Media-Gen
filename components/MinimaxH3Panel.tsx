import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { buildMinimaxH3LibraryItem } from '../services/minimaxH3Library';
import { buildMinimaxH3PromptLibraryItem } from '../services/videoPromptLibrary';
import { VideoPromptEditor } from './VideoPromptText';
import { AdvancedH3Settings } from './AdvancedH3Settings';
import { planAdvancedH3Input } from '../services/minimaxH3AdvancedWorkflow';
import {
    H3_ASPECTS, h3Choices, h3FormatWidgets, h3FrameCount,
    h3ReferenceControl, h3Resolution, planH3References, replaceH3FirstPicture, validateMinimaxH3Readiness, withH3OriginalAudio,
    type H3FormatWidget, type H3ObjectInfo, type MinimaxH3Options,
} from '../services/minimaxH3Workflow';
import { buildH3RenderWorkflow, defaultH3WorkflowOptions, h3ReferenceLimits, h3WorkflowName, type H3RenderWorkflow } from '../services/minimaxH3UltrafastWorkflow';
import { generateMinimaxH3Video, loadH3ObjectInfo, type H3ExecutionProgress, type H3GenerationResult, type H3Preview } from '../services/minimaxH3Service';
import { referenceToken, type MinimaxDraft, type ReferenceKind, type VideoReference, type VideoPromptProvider } from '../services/videoPromptService';
import { VideoReferenceEditor, useMediaURL } from './VideoReferenceEditor';
import { H3AudioReference } from './H3AudioReference';
import { AudioPlayer } from './AudioPlayer';
import { AudioLyricsEditor, OriginalAudioSelector } from './VideoAudioControls';
import { extractLastVideoFrame } from '../services/videoFrameService';
import { VideoOutputFrames } from './VideoOutputFrames';

const input = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary focus:border-accent focus:outline-none';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const box = 'rounded-xl border border-border-primary bg-bg-secondary p-4';
const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) =>
    <label className="block min-w-0 text-xs text-text-secondary">{label}{children}{hint && <span className="mt-1 block text-[11px] text-text-muted">{hint}</span>}</label>;
const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) =>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet-400" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />{label}</label>;
const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; hint?: string }> = ({ label, value, onChange, min, max, step = 1, hint }) =>
    <Field label={label} hint={hint}><input type="number" aria-label={label} className={input} value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></Field>;
const Choice: React.FC<{ label: string; value: string; choices: string[]; onChange: (value: string) => void; editable?: boolean; id?: string }> = ({ label, value, choices, onChange, editable, id }) => {
    const entries = React.useMemo(() => choices.map(choice => <option key={choice} value={choice}>{choice}</option>), [choices]);
    return <Field label={label}>{editable ? <><input aria-label={label} className={input} value={value} list={id} onChange={event => onChange(event.target.value)} /><datalist id={id}>{entries}</datalist></>
        : <select aria-label={label} className={input} value={value} onChange={event => onChange(event.target.value)}>
            {!choices.includes(value) && <option value={value}>{value}</option>}
            {entries}
        </select>}</Field>;
};

export const MinimaxH3Panel: React.FC<{
    variant?: H3RenderWorkflow;
    draft: MinimaxDraft | undefined;
    onDraftChange: (draft: MinimaxDraft) => void;
    options: MinimaxH3Options | undefined;
    onOptionsChange: (options: MinimaxH3Options) => void;
    ready: boolean;
    onClearDraft: () => void;
    onStartFromScratch: () => void;
    lyricsProvider: VideoPromptProvider;
    lyricsModel: string;
    onLyricsSettingsChange: (provider: VideoPromptProvider, model?: string) => void;
}> = ({ variant: requestedVariant, draft, onDraftChange, options: savedOptions, onOptionsChange, ready, onClearDraft, onStartFromScratch, lyricsProvider, lyricsModel, onLyricsSettingsChange }) => {
    const dispatch = useDispatch<AppDispatch>();
    const variant: H3RenderWorkflow = requestedVariant ?? 'reference';
    const options = savedOptions || defaultH3WorkflowOptions(variant);
    const ultrafast = variant === 'ultrafast';
    const advanced = variant === 'advanced';
    const advancedSettings = options.advanced;
    const videoInput = advanced && advancedSettings?.inputMode === 'video';
    const h3Needed = !videoInput || !!advancedSettings?.latentUpscale;
    const hasSourceVideo = draft?.references.length === 1 && draft.references[0].kind === 'video';
    const name = h3WorkflowName(variant);
    const limits = h3ReferenceLimits(variant);
    const accent = advanced ? 'border-cyan-400/50 text-cyan-200' : ultrafast ? 'border-emerald-400/50 text-emerald-200' : 'border-violet-400/50 text-violet-200';
    const acceleration = options.ultrafast;
    const [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [execution, setExecution] = useState<H3ExecutionProgress | null>(null);
    const [preview, setPreview] = useState<H3Preview | null>(null);
    const [result, setResult] = useState<H3GenerationResult | null>(null);
    const localResultUrl = useMediaURL(result?.videoBlob);
    const resultUrl = result?.videoBlob ? localResultUrl : result?.videoUrl;
    const [pendingAudio, setPendingAudio] = useState<Record<string, boolean>>({});
    const hasPendingAudio = !!draft?.references.some(ref => ref.kind === 'audio' && h3ReferenceControl(options, ref).enabled && pendingAudio[ref.id]);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [editing, setEditing] = useState<VideoReference | null>(null);
    const [checking, setChecking] = useState(false);
    const [copyingFrame, setCopyingFrame] = useState(false);
    const [loraOpen, setLoraOpen] = useState(!advanced);
    const controller = useRef<AbortController | null>(null);
    const frameController = useRef<AbortController | null>(null);
    const latestDraft = useRef(draft);
    const latestOptions = useRef(options);
    latestDraft.current = draft;
    latestOptions.current = options;
    const refreshController = useRef<AbortController | null>(null);
    const defaultsApplied = useRef(false);
    const resetBlocked = !ready || busy || checking || loading || copyingFrame || savingPrompt || saveStatus === 'saving';
    const startFromScratch = () => {
        if (resetBlocked) {
            setError('Wait for the current operation to finish, or cancel the active generation, before starting from scratch.');
            return;
        }
        if ((draft?.prompt || draft?.references.length || result) && !window.confirm('Start from scratch? Clear the current prompt, references, H3 settings and displayed output. Unsaved local output will be lost. Saved Library items and ComfyUI files will not be deleted.')) return;
        onStartFromScratch();
        setEditing(null);
        setPendingAudio({});
        setPreview(null);
        setResult(null);
        setProgress(0);
        setSaveStatus('idle');
        setError('');
        setStatus('New H3 setup ready. Prompt and references cleared; default settings restored. Library items were not changed.');
    };

    useEffect(() => {
        if (!ready || defaultsApplied.current) return;
        defaultsApplied.current = true;
        if (!savedOptions) onOptionsChange(defaultH3WorkflowOptions(variant));
    }, [ready, savedOptions, onOptionsChange, variant]);
    useEffect(() => {
        return () => { refreshController.current?.abort(); frameController.current?.abort(); };
    }, []);
    const update = (patch: Partial<MinimaxH3Options>) => onOptionsChange({ ...options, ...patch });
    const updateAcceleration = (patch: Partial<NonNullable<MinimaxH3Options['ultrafast']>>) => {
        if (!acceleration) { setError('Ultrafast settings are missing. Reset settings before editing accelerators.'); return; }
        update({ ultrafast: { ...acceleration, ...patch } });
    };
    const refresh = async () => {
        refreshController.current?.abort();
        const abort = new AbortController(); refreshController.current = abort;
        setLoading(true); setError('');
        try { setInfo(await loadH3ObjectInfo(abort.signal, variant)); }
        catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (refreshController.current === abort) setLoading(false); }
    };
    useEffect(() => {
        if (!ready) return;
        void refresh();
        return () => refreshController.current?.abort();
    }, [variant, ready]);
    const patchDraft = (patch: Partial<MinimaxDraft>) => onDraftChange({
        ...(latestDraft.current || { id: crypto.randomUUID(), workflow: variant, prompt: '', references: [], aspect: options.aspect.split(' ')[0], duration: options.duration, template: 'generation' }),
        ...patch,
    });
    const patchReference = (ref: VideoReference, patch: Partial<VideoReference>) => patchDraft({ references: draft!.references.map(item => item.id === ref.id ? { ...item, ...patch } : item) });
    const addFiles = (kind: ReferenceKind, files: File[]) => {
        setError('');
        try {
            const refs = draft?.references || [];
            const used = new Set(refs.filter(ref => ref.kind === kind).map(ref => ref.slot));
            const max = limits[kind];
            const free = Array.from({ length: max }, (_, i) => i + 1).filter(slot => !used.has(slot));
            if (files.length > free.length) throw new Error(`H3 accepts at most ${max} ${kind} references.`);
            if (files.some(file => !file.size || !file.type.startsWith(`${kind}/`))) throw new Error(`Select non-empty ${kind} files.`);
            patchDraft({ references: [...refs, ...files.map((file, i) => ({ id: crypto.randomUUID(), kind, slot: free[i], note: '', file, original: file }))] });
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    let dimensions = '';
    let frames = '';
    let mapping: ReturnType<typeof planH3References> | null = null;
    let mappingError = '';
    try { const size = h3Resolution(options); dimensions = `${size.width} x ${size.height}`; }
    catch (cause) { dimensions = cause instanceof Error ? cause.message : String(cause); }
    try { const count = h3FrameCount(options.duration, options.originalAudioId !== undefined); frames = `${count} frames · ${(count / 24).toFixed(2)}s at native 24 fps`; }
    catch (cause) { frames = cause instanceof Error ? cause.message : String(cause); }
    if (draft?.references.length) {
        try { mapping = advanced ? planAdvancedH3Input(draft, options) : planH3References(draft, options); }
        catch (cause) { mappingError = cause instanceof Error ? cause.message : String(cause); }
    }
    const placeholders = () => Object.fromEntries((draft?.references || []).map(ref => [ref.id, ref.file.name]));
    const check = async () => {
        if (!draft) { setError('Enter a video prompt first. References are optional.'); return; }
        setChecking(true); setError('');
        try {
            const nodes = await loadH3ObjectInfo(undefined, variant); setInfo(nodes);
            validateMinimaxH3Readiness(buildH3RenderWorkflow(draft, options, placeholders()), nodes);
            setStatus('Nodes, model names and active workflow options validated. No upload or generation was performed.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setChecking(false); }
    };
    const generate = async () => {
        if (!draft) { setError('Enter a video prompt first. References are optional.'); return; }
        if (hasPendingAudio) { setError('Apply the audio selection before generating. The full original or an older passage will not be substituted.'); return; }
        const resolved: MinimaxH3Options = { ...structuredClone(options),
            seed: options.randomizeSeed ? Math.floor(Math.random() * 1e15) : options.seed };
        if (resolved.advanced) for (const slot of ['1', '2', '3']) {
            if (resolved.advanced.imageNoise[slot] && resolved.advanced.randomizeImageNoise[slot]) resolved.advanced.nodes[`noise-${slot}`].seed = Math.floor(Math.random() * 1e15);
        }
        update({ seed: resolved.seed, ...(resolved.advanced ? { advanced: resolved.advanced } : {}) });
        setError(''); setBusy(true); setCancelling(false); setPreview(null); setProgress(0); setExecution(null);
        const abort = new AbortController(); controller.current = abort;
        try {
            const generated = await generateMinimaxH3Video({ ...draft, references: draft.references.map(ref => ({ ...ref })) }, resolved, abort.signal,
                (message, fraction) => { setStatus(message); setProgress(fraction); }, setPreview, setExecution);
            setResult(generated);
            setSaveStatus('idle');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { controller.current = null; setBusy(false); setCancelling(false); setPreview(null); }
    };
    const saveOutputToLibrary = async () => {
        if (!result || saveStatus !== 'idle') return;
        setSaveStatus('saving'); setError('');
        try {
            const { item, warning } = await buildMinimaxH3LibraryItem(result);
            await dispatch(addToLibrary(item)).unwrap();
            setSaveStatus('saved');
            setStatus(`Saved to Library. ${warning || 'The output file and exact generation settings are stored locally.'}`);
        } catch (cause) {
            setSaveStatus('idle');
            setError(`Could not save the H3 output to Library: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
    };
    const savePromptToLibrary = async () => {
        if (savingPrompt) return;
        setSavingPrompt(true); setError('');
        try {
            if (!draft || (!draft.prompt.trim() && !(videoInput && hasSourceVideo))) throw new Error(videoInput ? 'Choose a source video before saving.' : 'Enter a video prompt before saving.');
            if (hasPendingAudio) throw new Error('Apply the audio selection before saving the generation setup.');
            const item = await buildMinimaxH3PromptLibraryItem(draft, options);
            await dispatch(addToLibrary(item)).unwrap();
            setStatus(`Prompt, H3 settings and all original/edited references saved to Library > Prompts. Open in ${name} to rerun this setup. Existing Library items were not changed.`);
        } catch (cause) {
            setError(`Could not save the generation setup: ${cause instanceof Error ? cause.message : String(cause)}`);
        } finally { setSavingPrompt(false); }
    };
    const copyLastFrame = async () => {
        if (!result || copyingFrame || busy) return;
        const abort = new AbortController(); frameController.current = abort;
        setCopyingFrame(true); setError(''); setStatus('Decoding the output to copy its exact last video frame...');
        try {
            let blob = result.videoBlob;
            if (!blob) {
                const response = await fetch(result.videoUrl, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]) });
                if (!response.ok) throw new Error(`Could not read the rendered output (${response.status}).`);
                blob = await response.blob();
            }
            if (!blob.size) throw new Error('The rendered output is empty.');
            const name = new URL(result.videoUrl, window.location.href).searchParams.get('filename') || 'h3-output.mp4';
            const frame = await extractLastVideoFrame(new File([blob], name, { type: blob.type || 'video/mp4' }), abort.signal);
            abort.signal.throwIfAborted();
            const current = latestDraft.current;
            if (!current) throw new Error('The REF2V draft was removed. Nothing was replaced.');
            const references = replaceH3FirstPicture(current.references, frame);
            const picture = references.find(ref => ref.kind === 'image' && ref.slot === 1)!;
            onDraftChange({ ...current, references });
            const currentOptions = latestOptions.current;
            onOptionsChange({ ...currentOptions, references: { ...currentOptions.references, [picture.id]: { ...h3ReferenceControl(currentOptions, picture), enabled: true } } });
            setStatus('Last video frame copied to Picture 1 and enabled for the next clip. An existing original picture is retained for Restore original.');
        } catch (cause) {
            setStatus('');
            setError(abort.signal.aborted ? 'Last-frame copy cancelled. Picture 1 was not changed.' : cause instanceof Error ? cause.message : String(cause));
        } finally { frameController.current = null; setCopyingFrame(false); }
    };
    const download = (content: string, name: string, mime: string) => {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const exportWorkflow = () => {
        setError('');
        try {
            if (!draft) throw new Error('Enter a video prompt first. References are optional.');
            download(JSON.stringify(buildH3RenderWorkflow(draft, options, placeholders()), null, 2), advanced ? 'minimax-h3-advanced-api.json' : ultrafast ? 'minimax-h3-ultrafast-api.json' : 'minimax-h3-ref2v-api.json', 'application/json');
            setStatus('Exported with original local filenames and no API key. Upload the reference files into ComfyUI input before external execution.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const lists = React.useMemo(() => {
        const cache = new Map<string, string[]>();
        return (node: string, field: string, fallback: string[] = []) => {
            const key = `${node}:${field}`;
            let choices = cache.get(key);
            if (!choices) { choices = h3Choices(info, node, field); cache.set(key, choices); }
            return choices.length ? choices : fallback;
        };
    }, [info]);
    const loraNames = React.useMemo(() => Array.from(new Set([...lists('LoraLoader', 'lora_name'), ...lists('LoraLoaderModelOnly', 'lora_name')])), [lists]);
    const changeFormat = (format: string) => {
        const formatOptions: MinimaxH3Options['formatOptions'] = {};
        for (const widget of h3FormatWidgets(info, format)) {
            const value = widget.config?.default ?? (Array.isArray(widget.type) ? widget.type[0] : widget.type === 'BOOLEAN' ? false : widget.type === 'STRING' ? '' : 0);
            if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') formatOptions[widget.name] = value;
        }
        update({ format, formatOptions });
    };
    const formatWidgets = h3FormatWidgets(info, options.format);
    const widgets: H3FormatWidget[] = ultrafast ? [] : info ? formatWidgets : options.format === 'video/h264-mp4' ? [
        { name: 'pix_fmt', type: ['yuv420p', 'yuv420p10le'] }, { name: 'crf', type: 'INT', config: { min: 0, max: 100, default: 12 } },
        { name: 'save_metadata', type: 'BOOLEAN' }, { name: 'trim_to_audio', type: 'BOOLEAN' },
    ] : [];

    const promptSection = <fieldset disabled={!ready} className={`min-w-0 space-y-3 disabled:opacity-60 ${box} ${advanced ? 'border-cyan-400/60 bg-cyan-400/5' : ''}`}>
        <legend className={`px-2 text-lg font-bold ${advanced ? 'text-cyan-200' : ''}`}>{videoInput ? 'Source video & finishing' : 'Prompt & references'}</legend>
        {videoInput && advancedSettings && <section aria-label="Finishing source video" className="space-y-3 rounded-lg border border-cyan-400/50 p-3">
            <h4 className="font-semibold text-cyan-200">Existing video · no H3 first pass</h4>
            <label className={`${button} inline-block cursor-pointer`}>Choose / replace source video<input type="file" accept="video/*" aria-label="Advanced source video" className="sr-only" onChange={event => {
                const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                if (!file) return;
                if (!file.size || !file.type.startsWith('video/')) { setError('Choose a non-empty video file.'); return; }
                setError('');
                patchDraft({ references: [{ id: crypto.randomUUID(), kind: 'video', slot: 1, note: 'Finishing source', file, original: file }] });
                update({ references: {}, originalAudioId: undefined, forceOriginalAudio: false });
            }} /></label>
            {hasSourceVideo && draft && <H3Media reference={draft.references[0]} />}
            <Toggle label="Keep source video soundtrack" checked={advancedSettings.sourceAudio !== false} onChange={sourceAudio => update({ advanced: { ...advancedSettings, sourceAudio } })} />
            <p className="text-xs text-text-muted">The complete source clip is processed at its loaded FPS, unless interpolation is enabled. Dimensions are rounded to multiples of 32. VAE temporal compression can adjust frame count. Large clips can exceed available RAM/VRAM; trim them before loading if needed.</p>
        </section>}
        {videoInput && advancedSettings?.ltxRefine && !advancedSettings.latentUpscale
            ? <VideoPromptEditor label="LTX refine prompt" value={String(advancedSettings.nodes['ltx-positive']?.text ?? '')} onChange={text => update({ advanced: { ...advancedSettings, nodes: { ...advancedSettings.nodes, 'ltx-positive': { ...advancedSettings.nodes['ltx-positive'], text } } } })} />
            : <VideoPromptEditor label="H3 video prompt" value={draft?.prompt || ''} placeholder="Describe the scene, action, dialogue and sound, or paste any prompt here..." onChange={prompt => patchDraft({ prompt })} />}
        <p className="text-[11px] text-text-muted">{busy ? 'Rendering the submitted snapshot. You can edit the next prompt while this generation finishes.' : videoInput ? 'Only enabled finishing stages run. H3 latent upscale uses the optional H3 prompt; LTX has its own positive/negative prompts under LTX Refine.' : 'Start here: write a prompt, then add optional references. No prompt generator is required.'}</p>
        {!videoInput && <OriginalAudioSelector references={draft?.references.filter(ref => h3ReferenceControl(options, ref).enabled) || []} value={options.originalAudioId} forced={options.forceOriginalAudio}
            onChange={originalAudioId => onOptionsChange(withH3OriginalAudio(options, originalAudioId, originalAudioId !== undefined))}
            onForceChange={(forced, originalAudioId) => onOptionsChange(withH3OriginalAudio(options, originalAudioId, forced))} />}
        <div className="flex flex-wrap gap-2">
            <button type="button" className={`${button} ${accent}`} disabled={savingPrompt || (!draft?.prompt.trim() && !(videoInput && hasSourceVideo)) || hasPendingAudio} onClick={() => void savePromptToLibrary()}>{savingPrompt ? 'Saving prompt and references...' : 'Save prompt to Library'}</button>
            <button type="button" className={button} disabled={!draft?.prompt} onClick={async () => { try { await navigator.clipboard.writeText(draft!.prompt); setStatus('Prompt copied.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>Copy prompt</button>
            <button type="button" className={button} disabled={!draft?.prompt} onClick={() => download(draft!.prompt, 'minimax-h3-ref2v-prompt.txt', 'text/plain')}>Export prompt .txt</button>
            <button type="button" className={button} disabled={!draft} onClick={() => { if (window.confirm('Delete this H3 draft and its references? Settings and completed output will be retained.')) onClearDraft(); }}>Delete draft</button>
        </div>
        <p className="text-xs text-text-muted">Save the prompt, settings and original/edited reference files without rendering.</p>
        {!videoInput && <>{advanced && options.advanced?.mode === 'fl2v' ? <p className="text-sm text-cyan-200">Picture 1 = first frame · Picture 2 = last frame. Either is optional. Use REF2V for other conditioning references.</p>
            : <p className="text-xs text-text-secondary">Reference numbers are remapped when needed. Video soundtracks consume Audio numbers before standalone audio.</p>}
        <div className="flex flex-wrap gap-2">{(['image', 'video', 'audio'] as const).map(kind => <label key={kind} className={`${button} cursor-pointer`}>+ {kind}<input type="file" multiple accept={`${kind}/*`} aria-label={`H3 upload ${kind}`} className="sr-only" onChange={(event: { currentTarget: HTMLInputElement }) => { const files = Array.from(event.currentTarget.files || []); if (files.length) addFiles(kind, files); event.currentTarget.value = ''; }} /></label>)}</div>
        <p className="text-xs text-text-muted">Up to {limits.image} pictures, {limits.video} videos and {limits.audio} standalone audios.</p>
        <div className="grid gap-3 sm:grid-cols-2">{draft?.references.map(ref => {
            const control = h3ReferenceControl(options, ref);
            return <div key={ref.id} className={`min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2 ${ref.kind === 'audio' ? 'sm:col-span-2' : ''}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <Toggle label={referenceToken(ref)} checked={control.enabled} onChange={enabled => update({ references: { ...options.references, [ref.id]: { ...control, enabled } } })} />
                    <button type="button" className="text-xs text-red-300" onClick={() => { if (window.confirm(`Remove ${referenceToken(ref)}? Update the prompt if it mentions this reference.`)) patchDraft({ references: draft.references.filter(item => item.id !== ref.id) }); }}>Remove</button>
                </div>
                <H3Media reference={ref} />
                {ref.kind === 'audio' && <H3AudioReference reference={ref} videoDuration={options.duration}
                    onPendingChange={pending => setPendingAudio(current => current[ref.id] === pending ? current : { ...current, [ref.id]: pending })} onApply={(file, audioSelection) => {
                    setError('');
                    const duration = audioSelection.end - audioSelection.start;
                    patchDraft({ duration, references: draft.references.map(item => item.id === ref.id ? { ...item, file, audioSelection } : item) });
                    update({ duration });
                    setStatus(`${referenceToken(ref)} uses ${audioSelection.start.toFixed(3)} - ${audioSelection.end.toFixed(3)} s. H3 duration set to ${duration.toFixed(3)} s (native frame rounding applies).`);
                }} />}
                {ref.kind === 'audio' && <AudioLyricsEditor reference={ref} provider={lyricsProvider} model={lyricsModel} onSettingsChange={onLyricsSettingsChange} passagePending={!!pendingAudio[ref.id]} requireAppliedPassage={options.forceOriginalAudio && options.originalAudioId === ref.id} onChange={lyrics => patchReference(ref, { lyrics })} />}
                {ref.kind === 'video' && <div className="mt-2"><Toggle label="Use source soundtrack" checked={control.useSoundtrack} onChange={useSoundtrack => update({ references: { ...options.references, [ref.id]: { ...control, useSoundtrack } } })} /></div>}
                <input aria-label={`H3 role ${referenceToken(ref)}`} className={`${input} !text-xs`} value={ref.note} placeholder="Reference role" onChange={event => patchReference(ref, { note: event.target.value })} />
                {ref.kind !== 'audio' && <button type="button" className={`${button} mt-2 !py-1 !text-xs`} onClick={() => setEditing(ref)}>Crop / resize{ref.kind === 'video' ? ' / trim' : ''}</button>}
                {ref.file !== ref.original && <button type="button" className={`${button} ml-1 mt-2 !py-1 !text-xs`} onClick={() => patchReference(ref, { file: ref.original, audioSelection: undefined })}>Restore original</button>}
            </div>;
        })}</div>
        {mapping && (!advanced || options.advanced?.mode === 'ref2v') && <div className="space-y-1 text-xs text-text-secondary">{mapping.mappings.map(item => <p key={item.from}>{item.from} → {item.to}</p>)}<p>Video soundtrack presence is verified before final token mapping.</p></div>}</>}
        {mappingError && <p role="alert" className="text-xs text-amber-300">{mappingError}</p>}
    </fieldset>;
    return <div className={`min-w-0 space-y-4 rounded-xl border-t-2 pt-3 ${advanced ? 'border-cyan-400' : ultrafast ? 'border-emerald-400' : 'border-violet-400'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className={`text-xl font-bold ${advanced ? 'text-cyan-300' : ultrafast ? 'text-emerald-300' : 'text-violet-300'}`}>{name}</h3><p className="mt-1 text-xs text-text-secondary">{videoInput ? 'Finish a source video with the enabled stages. No H3 first-pass generation.' : 'Write or paste a prompt. Image, video and audio references are optional.'}</p></div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={!ready || busy || loading} onClick={refresh}>{loading ? 'Refreshing...' : 'Refresh nodes / models'}</button>
                <button type="button" className={button} disabled={resetBlocked} title="Restore settings while keeping the current prompt, references and output" onClick={() => { if (window.confirm(`Restore all ${name} workflow settings to the supplied defaults? Prompt and media will be retained.`)) onOptionsChange(defaultH3WorkflowOptions(variant)); }}>Reset settings only</button>
                <button type="button" className={`${button} border-red-400/40 text-red-300`} disabled={resetBlocked} onClick={startFromScratch}>Start from scratch</button>
            </div>
        </div>
        {advanced && advancedSettings && <section aria-label="Video saving" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-cyan-400/60 bg-cyan-400/10 p-4">
            <div className="min-w-0 flex-1">
                <h4 className="font-bold text-cyan-200">Video saving</h4>
                <p className="mt-1 text-sm text-text-secondary">{advancedSettings.saveIntermediateVideos !== false ? 'ON · Save every active stage: FirstPass, LatentUpscale, LTX and final RTX.' : 'OFF · Save the final video only. No extra first-pass decode.'}</p>
                <p className="mt-1 text-xs text-text-muted">{busy ? 'Changes apply to the next generation, not the running job.' : 'Intermediate saves add decoding, encoding, memory and disk use. Disabled stages are skipped.'}</p>
                {!options.saveOutput && <p className="mt-1 text-xs text-amber-300">Save output on ComfyUI is OFF: files will be temporary. Enable it under Output & audio to keep them.</p>}
            </div>
            <button type="button" aria-label="Save intermediate videos" aria-pressed={advancedSettings.saveIntermediateVideos !== false} disabled={!ready}
                onClick={() => update({ advanced: { ...advancedSettings, saveIntermediateVideos: advancedSettings.saveIntermediateVideos === false } })}
                className={`${button} min-h-12 border-cyan-400 px-5 ${advancedSettings.saveIntermediateVideos !== false ? 'bg-cyan-400 font-bold text-black' : 'bg-bg-primary text-cyan-200'}`}>
                Save intermediate videos · {advancedSettings.saveIntermediateVideos !== false ? 'ON' : 'OFF'}
            </button>
        </section>}
        {!info && <p className="rounded-lg border border-sky-400/30 p-3 text-xs text-sky-200">Refresh nodes / models to load your installed files and format options, or use Check workflow. Generation always validates the live ComfyUI schema before uploading.</p>}
        {error && <p role="alert" className="whitespace-pre-wrap rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
        {status && <p role="status" className="text-xs text-text-secondary">{status}</p>}
        {advanced && options.advanced && <fieldset disabled={!ready}><AdvancedH3Settings section="switches" settings={options.advanced} options={options} info={info} onChange={value => update({ advanced: value })} onOptionsChange={update} /></fieldset>}
        <div className={`grid gap-4 ${advanced ? 'lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.3fr)]' : 'xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)]'}`}>
            <fieldset disabled={!ready} aria-label="Workflow settings" className={`min-w-0 space-y-4 disabled:opacity-60 ${advanced ? 'order-last lg:order-first' : ''}`}>
                {advanced && options.advanced && <AdvancedH3Settings settings={options.advanced} options={options} info={info} onChange={value => update({ advanced: value })} onOptionsChange={update} />}
                {!advanced && promptSection}
                {ultrafast && acceleration && <section className={`${box} space-y-3 border-emerald-400/30`}>
                    <h4 className="font-semibold text-emerald-300">Ultrafast accelerators</h4>
                    <Toggle label="Spectrum" checked={acceleration.spectrum} onChange={spectrum => updateAcceleration({ spectrum })} />
                    <Toggle label="Realtime preview" checked={options.preview} onChange={preview => update({ preview })} />
                    <Toggle label="RTX upscaler" checked={acceleration.rtxUpscale} onChange={rtxUpscale => updateAcceleration({ rtxUpscale })} />
                    {acceleration.rtxUpscale && <div className="grid gap-3 sm:grid-cols-2">
                        <NumberField label="RTX scale" value={acceleration.rtxScale} min={1} max={4} step={0.25} onChange={rtxScale => updateAcceleration({ rtxScale })} />
                        <Choice label="RTX quality" value={acceleration.rtxQuality} choices={['LOW', 'MEDIUM', 'HIGH', 'ULTRA']} onChange={rtxQuality => updateAcceleration({ rtxQuality })} />
                    </div>}
                    <p className="text-xs text-text-muted">Spectrum and RTX are optional additions, off by default. RTX runs after decoding and requires a compatible NVIDIA GPU. Disabled accelerators are removed from the submitted graph.</p>
                </section>}
                {h3Needed && <details className={box} open={!advanced}><summary className="cursor-pointer font-semibold">Models & conditioning</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Choice label="Diffusion model" value={options.model} choices={lists('UNETLoader', 'unet_name')} onChange={model => update({ model })} />
                    <Choice label="Weight dtype" value={options.weightDtype} choices={lists('UNETLoader', 'weight_dtype', ['default', 'fp8_e4m3fn', 'fp8_e4m3fn_fast', 'fp8_e5m2'])} onChange={weightDtype => update({ weightDtype })} />
                    <Choice label="Text encoder (MiniMax)" value={options.clip} choices={lists('CLIPLoader', 'clip_name')} onChange={clip => update({ clip })} />
                    <Choice label="CLIP device" value={options.clipDevice} choices={lists('CLIPLoader', 'device', ['default', 'cpu'])} onChange={clipDevice => update({ clipDevice })} />
                    <Choice label="Video VAE" value={options.videoVae} choices={lists('VAELoader', 'vae_name')} onChange={videoVae => update({ videoVae })} />
                    <Choice label="Audio VAE" value={options.audioVae} choices={lists('VAELoader', 'vae_name')} onChange={audioVae => update({ audioVae })} />
                    {(!advanced || options.advanced?.mode === 'ref2v') && <>
                        <Toggle label="Video VAE reference conditioning" checked={options.conditionVideoVae} onChange={conditionVideoVae => update({ conditionVideoVae })} />
                        <Toggle label="Audio VAE reference conditioning" checked={options.conditionAudioVae} onChange={conditionAudioVae => update({ conditionAudioVae })} />
                        <p className="col-span-full text-xs text-text-muted">Disabling a reference VAE keeps text-encoder conditioning. Output video VAE remains required for decoding.</p>
                    </>}
                </div></details>}
                {!videoInput && <details className={box} open={!advanced}><summary className="cursor-pointer font-semibold">Resolution & sampling</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Choice label="H3 aspect ratio" value={options.aspect} choices={H3_ASPECTS} onChange={aspect => update({ aspect })} />
                    <NumberField label="Megapixels" value={options.megapixels} min={0.1} max={16} step={0.1} onChange={megapixels => update({ megapixels })} />
                    <NumberField label="Resolution multiple" value={options.multiple} min={8} max={128} step={4} onChange={multiple => update({ multiple })} hint="H3 requires resulting dimensions divisible by 32." />
                    <NumberField label="H3 duration (seconds)" value={options.duration} min={0.25} max={60} step={0.25} onChange={duration => update({ duration })} hint={frames} />
                    <p className="col-span-full text-xs text-violet-300">{dimensions}. Native timing is 24 fps; changing output FPS changes playback duration.</p>
                    <NumberField label="H3 seed" value={options.seed} min={0} max={Number.MAX_SAFE_INTEGER} onChange={seed => update({ seed })} />
                    <Toggle label="Random seed each generation" checked={options.randomizeSeed} onChange={randomizeSeed => update({ randomizeSeed })} />
                    <Choice label="H3 sampler" value={options.sampler} choices={lists('KSamplerSelect', 'sampler_name', ['seeds_2', 'seeds_3', 'euler', 'heun'])} onChange={sampler => update({ sampler })} />
                    <NumberField label="Beta scheduler steps" value={options.steps} min={1} max={10000} onChange={steps => update({ steps })} />
                    {!ultrafast && !advanced && <>
                        <NumberField label="Scheduler alpha" value={options.alpha} min={0} max={50} step={0.01} onChange={alpha => update({ alpha })} />
                        <NumberField label="Scheduler beta" value={options.beta} min={0} max={50} step={0.01} onChange={beta => update({ beta })} />
                    </>}
                    {ultrafast && acceleration && <>
                        <Choice label="Ultrafast scheduler" value={acceleration.scheduler} choices={lists('BasicScheduler', 'scheduler', ['beta'])} onChange={scheduler => updateAcceleration({ scheduler })} />
                        <NumberField label="Denoise" value={acceleration.denoise} min={0} max={1} step={0.01} onChange={denoise => updateAcceleration({ denoise })} />
                        <NumberField label="Video sigma shift" value={acceleration.shiftVideo} min={0.01} max={100} step={0.01} onChange={shiftVideo => updateAcceleration({ shiftVideo })} />
                        <NumberField label="Audio sigma shift" value={acceleration.shiftAudio} min={0.01} max={100} step={0.01} onChange={shiftAudio => updateAcceleration({ shiftAudio })} />
                        <Choice label="Attention backend" value={acceleration.attention} choices={lists('ModelAttentionBackend', 'attention', ['comfy kitchen attention', 'pytorch attention'])} onChange={attention => updateAcceleration({ attention })} />
                    </>}
                </div>{!ultrafast && !advanced && <div className="mt-4 space-y-3"><Toggle label="Extend intermediate sigmas" checked={options.extendSigmas} onChange={extendSigmas => update({ extendSigmas })} />
                    <fieldset disabled={!options.extendSigmas} className="grid gap-3 sm:grid-cols-2 disabled:opacity-40">
                        <NumberField label="Intermediate sigma steps" value={options.intermediateSteps} min={1} max={100} onChange={intermediateSteps => update({ intermediateSteps })} />
                        <Choice label="Sigma spacing" value={options.spacing} choices={lists('ExtendIntermediateSigmas', 'spacing', ['linear', 'cosine', 'sine'])} onChange={spacing => update({ spacing })} />
                        <NumberField label="Start at sigma" value={options.startSigma} min={-1} max={20000} step={0.01} onChange={startSigma => update({ startSigma })} />
                        <NumberField label="End at sigma" value={options.endSigma} min={0} max={20000} step={0.01} onChange={endSigma => update({ endSigma })} />
                    </fieldset>
                </div>}</details>}
                {h3Needed && (!advanced || options.useLoras) && <details className={box} open={loraOpen} onToggle={event => setLoraOpen(event.currentTarget.open)}><summary className="cursor-pointer font-semibold">{advanced ? 'Turbo LoRA / extra LoRAs · six slots' : 'LoRAs · six slots'}</summary>{loraOpen && <div className="mt-3 space-y-3">
                    {!advanced && <Toggle label="Enable LoRA chain" checked={options.useLoras} onChange={useLoras => update({ useLoras })} />}
                    <Toggle label="Use LoRA-patched CLIP" checked={options.useLoraClip} onChange={useLoraClip => update({ useLoraClip })} />
                    <p className="text-xs text-text-muted">The supplied graph patches the model only at conditioning time. Patched CLIP is an explicit opt-in; all six slots start disabled.</p>
                    {options.useLoras ? <fieldset className="space-y-3">{options.loras.map((lora, index) => {
                        const patch = (value: Partial<typeof lora>) => update({ loras: options.loras.map((item, i) => i === index ? { ...item, ...value } : item) });
                        return <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_90px] items-end gap-2">
                            <Toggle label={`${index + 1}`} checked={lora.enabled} onChange={enabled => patch({ enabled })} />
                            {lora.enabled ? <>
                                <Choice label={`LoRA ${index + 1} file`} value={lora.name} choices={loraNames} onChange={name => patch({ name })} />
                                <NumberField label={`Strength ${index + 1}`} value={lora.strength} min={-20} max={20} step={0.05} onChange={strength => patch({ strength })} />
                            </> : <p className="col-span-2 text-xs text-text-muted">Disabled · enable this slot to select its LoRA.</p>}
                        </div>;
                    })}</fieldset> : <p className="text-xs text-text-muted">Enable the LoRA chain, then enable a slot to choose its file and strength. Saved selections are retained while disabled.</p>}
                </div>}</details>}
                {!videoInput && <details className={box}><summary className="cursor-pointer font-semibold">References manager & optional prompt rewrite</summary><div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Choice label="Reference image size" value={options.refImageSize} choices={lists('MiniMaxH3ReferenceToVideo', 'ref_image_size', ['match', 'max'])} onChange={refImageSize => update({ refImageSize })} />
                        <NumberField label="Maximum reference edge" value={options.maxReferenceEdge} min={0} max={8192} step={64} onChange={maxReferenceEdge => update({ maxReferenceEdge })} hint="0 disables the long-edge cap. max is slower than match." />
                        <Choice label="ReferencePack prompt provider" value={options.promptProvider} choices={['none', 'openrouter', 'local']} onChange={value => update({ promptProvider: value as MinimaxH3Options['promptProvider'] })} />
                        <Choice label="ReferencePack job type" value={options.jobType} choices={['auto', 'standard', 'replacement']} onChange={jobType => update({ jobType })} />
                    </div>
                    <p className="text-xs text-text-secondary">Default none sends your prompt verbatim, with only reference-token remapping. Optional rewriting runs on the ComfyUI server, not the app. It can incur an additional API charge.</p>
                    {options.promptProvider === 'openrouter' && <>
                        <p className="text-xs text-amber-300">Requires OPENROUTER_API_KEY or LLM_KEY in the ComfyUI server environment. No API key is embedded in submitted/exported workflows.</p>
                        <Choice label="ReferencePack OpenRouter model" value={options.openrouterModel} choices={lists('MiniMaxH3ReferencePack', 'openrouter_model')} editable={!advanced} id={`h3-${variant}-refpack-models`} onChange={openrouterModel => update({ openrouterModel })} />
                        <Choice label="Reasoning effort" value={options.reasoningEffort} choices={['none', 'low', 'medium', 'high']} onChange={reasoningEffort => update({ reasoningEffort })} />
                    </>}
                    {options.promptProvider === 'local' && <div className="space-y-3">
                        <Field label="Local API base"><input aria-label="Local API base" className={input} value={options.apiBase} placeholder="http://localhost:11434/v1" onChange={event => update({ apiBase: event.target.value })} /></Field>
                        <Field label="Local model ID"><input aria-label="Local model ID" className={input} value={options.localModelSlug} onChange={event => update({ localModelSlug: event.target.value })} /></Field>
                        <p className="text-xs text-amber-300">This node sends video as still frames and does not send audio to local prompt models.</p>
                    </div>}
                    <Field label="ReferencePack system prompt"><textarea aria-label="ReferencePack system prompt" className={`${input} min-h-32`} value={options.systemPrompt} onChange={event => update({ systemPrompt: event.target.value })} /></Field>
                    <Toggle label="Display generated prompt node" checked={options.displayPrompt} onChange={displayPrompt => update({ displayPrompt })} />
                </div></details>}
                {h3Needed && (!advanced || options.preview) && <details className={box}><summary className="cursor-pointer font-semibold">Live preview · KJ WebSocket</summary><div className="mt-3 space-y-3">
                    {!advanced && <Toggle label="Enable live preview" checked={options.preview} onChange={preview => update({ preview })} />}
                    <fieldset disabled={!options.preview} className="space-y-3 disabled:opacity-40">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <NumberField label="Preview max resolution" value={options.previewMaxResolution} min={0} max={8192} step={8} onChange={previewMaxResolution => update({ previewMaxResolution })} hint="0 = full sampler resolution" />
                            <NumberField label="Preview JPEG quality" value={options.previewQuality} min={30} max={100} onChange={previewQuality => update({ previewQuality })} />
                            <Toggle label="Suppress standard preview" checked={options.suppressDefaultPreview} onChange={suppressDefaultPreview => update({ suppressDefaultPreview })} />
                            <Toggle label="Preview all video frames" checked={options.previewAllFrames} onChange={previewAllFrames => update({ previewAllFrames })} />
                            <NumberField label="Preview frames" value={options.previewFrames} min={1} max={1024} onChange={previewFrames => update({ previewFrames, previewAllFrames: false })} />
                            <NumberField label="Preview FPS" value={options.previewFps} min={1} max={60} onChange={previewFps => update({ previewFps })} hint="Ignored by KJ when audio preview is enabled." />
                            <Choice label="Preview tiny VAE" value={options.tinyVae} choices={lists('ModelPreviewOverrideKJ', 'tiny_vae', ['none', 'taeh3.safetensors'])} onChange={tinyVae => update({ tinyVae })} />
                            <Toggle label="Use full video VAE in preview" checked={options.previewUseVae} onChange={previewUseVae => update({ previewUseVae })} />
                            <Toggle label="Include audio in preview" checked={options.originalAudioId === undefined && options.previewAudio} disabled={options.originalAudioId !== undefined} onChange={previewAudio => update({ previewAudio })} />
                        </div>
                        <p className="text-xs text-text-muted">KJ emits JPEG, animated WebP or MP4 over the API. Tiny VAE takes priority over full VAE. Audio/full-frame previews increase decoding cost. No preview is required for a successful generation.</p>
                    </fieldset>
                </div></details>}
                <details className={box} open={!advanced}><summary className="cursor-pointer font-semibold">Output & audio</summary><div className="mt-3 space-y-3">
                    <Toggle label="Generate output audio" checked={options.originalAudioId === undefined && options.generateAudio} disabled={options.originalAudioId !== undefined} onChange={generateAudio => update({ generateAudio })} />
                    {options.originalAudioId !== undefined && <p className="text-xs text-violet-300">Original soundtrack is active: generated audio is not decoded or mixed into the result. trim_to_audio is forced on. H3 reference conditioning still guides generated visuals; it does not hard-lock the mouth to the recording.</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {videoInput ? <p className="text-xs text-cyan-200">Output FPS follows the loaded video, or interpolation target FPS when enabled.</p> : <NumberField label="Output FPS" value={options.frameRate} min={1} max={ultrafast ? 120 : 240} onChange={frameRate => update({ frameRate })} />}
                        {!ultrafast && <NumberField label="Loop count" value={options.loopCount} min={0} max={100} onChange={loopCount => update({ loopCount })} />}
                        {!ultrafast && <Choice label="Output format" value={options.format} choices={lists('VHS_VideoCombine', 'format', ['video/h264-mp4'])} onChange={changeFormat} />}
                        <Field label="Filename prefix" hint="Optional %date:yyyy-MM-dd% is replaced with the local date before sending to ComfyUI."><input aria-label="Filename prefix" className={input} value={options.filenamePrefix} onChange={event => update({ filenamePrefix: event.target.value })} /></Field>
                        {widgets.map(widget => {
                            if (widget.name === 'trim_to_audio' && options.originalAudioId !== undefined) return <Toggle key={widget.name} label="trim_to_audio (original soundtrack)" checked disabled onChange={() => {}} />;
                            const value = options.formatOptions[widget.name] ?? widget.config?.default ?? (Array.isArray(widget.type) ? widget.type[0] : widget.type === 'BOOLEAN' ? false : 0);
                            const set = (next: string | number | boolean) => update({ formatOptions: { ...options.formatOptions, [widget.name]: next } });
                            if (Array.isArray(widget.type)) return <Choice key={widget.name} label={widget.name} value={String(value)} choices={widget.type} onChange={set} />;
                            if (widget.type === 'BOOLEAN') return <Toggle key={widget.name} label={widget.name} checked={Boolean(value)} onChange={set} />;
                            if (widget.type === 'INT' || widget.type === 'FLOAT') return <NumberField key={widget.name} label={widget.name} value={Number(value)} min={Number(widget.config?.min ?? 0)} max={Number(widget.config?.max ?? 10000)} step={widget.type === 'INT' ? 1 : 0.01} onChange={set} />;
                            return <Field key={widget.name} label={widget.name}><input className={input} value={String(value)} onChange={event => set(event.target.value)} /></Field>;
                        })}
                        {!ultrafast && <Toggle label="Ping-pong playback" checked={options.pingpong} onChange={pingpong => update({ pingpong })} />}
                        {!ultrafast && <Toggle label="Save output on ComfyUI" checked={options.saveOutput} onChange={saveOutput => update({ saveOutput })} />}
                    </div>
                    <p className="text-xs text-text-muted">{ultrafast ? 'Native CreateVideo / SaveVideo output uses automatic MP4 encoding and saves on ComfyUI. No VHS loop or encoding settings are applied.' : 'Save output off writes temporary server output, still viewable/downloadable.'} Disable generated audio to omit VAEDecodeAudio and the final audio connection.</p>
                </div></details>
            </fieldset>
            <aside aria-label="Prompt and generation" className={`min-w-0 space-y-4 self-start ${advanced ? 'order-first lg:order-last' : 'xl:sticky xl:top-16'}`}>
                {advanced && promptSection}
                <section className={`${box} space-y-3`}>
                    <h4 className="font-semibold">Live generation</h4>
                    {busy && execution && <div className="space-y-2 rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-3" aria-label="Execution details">
                        <p className="text-sm font-semibold text-cyan-200">{execution.nodes.find(node => node.id === execution.currentNode)?.label ?? 'Waiting for the next ComfyUI stage'}</p>
                        <p className="text-xs text-text-secondary">Total {execution.elapsedSeconds}s · This stage {execution.nodeSeconds}s · Last job event {execution.lastEventSeconds}s ago</p>
                        <progress aria-label="Current stage progress" max={execution.totalSteps ?? 1} value={execution.totalSteps ? execution.step : undefined} className="h-2 w-full accent-cyan-400" />
                        <p className="text-xs text-text-muted">{execution.totalSteps ? `${execution.step}/${execution.totalSteps} units reported by ComfyUI` : 'ComfyUI has not reported a step count for this stage. Duration is shown; no percentage is guessed.'}</p>
                        <p className="text-xs text-text-secondary">{execution.nodes.filter(node => node.state !== 'running').length}/{execution.totalNodes} nodes completed or cached · Node count is not a time estimate.</p>
                        <ol aria-label="Execution stages" className="max-h-40 space-y-1 overflow-y-auto text-xs">{execution.nodes.map(node => <li key={node.id} className={node.state === 'running' ? 'text-cyan-200' : 'text-text-secondary'}>{node.state === 'running' ? 'Running' : node.state === 'cached' ? 'Cached' : 'Done'} · {node.label}</li>)}</ol>
                        {execution.lastEventSeconds >= 120 && <p className="text-xs text-amber-300">No new job event for {execution.lastEventSeconds}s. The socket has not reported a disconnect; this does not prove the GPU is progressing. Check ComfyUI logs/GPU activity if it persists.</p>}
                    </div>}
                    {!!execution?.videos?.length && <section className="space-y-2 rounded-lg border border-cyan-400/40 p-3" aria-label="Saved intermediate videos">
                        <h5 className="text-sm font-semibold text-cyan-200">Saved intermediate videos</h5>
                        <p className="text-xs text-text-muted">Already written by ComfyUI; available even if a later stage fails. Save output off uses temporary server files. The Library button below saves the final output only.</p>
                        <ul className="space-y-2 text-sm">{execution.videos.map(video => <li key={video.nodeId}><a href={video.videoUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Open / download · {video.label}</a></li>)}</ul>
                    </section>}
                    {(options.preview || preview) && (preview ? <>
                        {preview.mime === 'video/mp4' ? <video key={`${preview.step}-${preview.url.length}`} src={preview.url} autoPlay loop muted controls className="max-h-80 w-full rounded-lg bg-black" /> : <img src={preview.url} alt="H3 live sampling preview" className="max-h-80 w-full rounded-lg bg-black object-contain" />}
                        <p className="text-xs text-text-secondary">Preview step {preview.step}/{preview.total} · {preview.mime}</p>
                    </> : <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border-primary p-4 text-center text-sm text-text-secondary">{busy ? 'Waiting for KJ preview frames...' : 'Animated previews appear during sampling, when emitted by KJ.'}</div>)}
                    {busy && <progress aria-label="H3 generation progress" value={progress} max={1} className="h-2 w-full accent-violet-400" />}
                    {busy ? <button type="button" disabled={cancelling} className={`${button} w-full border-red-400/50 text-red-300`} onClick={() => { setCancelling(true); controller.current?.abort(); }}>{cancelling ? 'Cancelling safely...' : 'Cancel H3 generation'}</button>
                        : <button type="button" className={`${button} w-full ${accent} ${advanced ? 'bg-cyan-400/15' : ultrafast ? 'bg-emerald-400/15' : 'bg-violet-400/15'} !py-3`} disabled={!ready || copyingFrame || hasPendingAudio || saveStatus === 'saving' || (videoInput ? !hasSourceVideo : !draft?.prompt.trim()) || !!mappingError} onClick={generate}>{videoInput ? 'Process source video' : `Generate ${advanced ? options.advanced?.mode === 'fl2v' ? 'FL2V' : 'Advanced REF2V' : ultrafast ? 'Ultrafast' : 'REF2V'} video`}</button>}
                    {hasPendingAudio && <p role="alert" className="text-xs text-amber-300">Apply the audio selection first. No older/full track will be submitted instead.</p>}
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!ready || busy || copyingFrame || checking} onClick={check}>{checking ? 'Checking...' : 'Check workflow'}</button><button type="button" className={button} disabled={!draft || busy || copyingFrame} onClick={exportWorkflow}>Export API workflow</button></div>
                    <p className="text-xs text-text-muted">Generation uploads enabled edited references to your ComfyUI server. Model/GPU cost and memory depend on resolution, length, reference size and preview settings.</p>
                </section>
                {result && <section className={`${box} space-y-3`}>
                    <h4 className="font-semibold">Last completed output</h4>
                    {result.options.format.startsWith('image/') || /(?:png|gif)$/.test(result.options.format)
                        ? <img src={resultUrl} alt="H3 generated output" className="w-full rounded-lg bg-black" />
                        : <VideoOutputFrames key={result.promptId} result={result} url={resultUrl} disabled={busy || copyingFrame} />}
                    {result.videoBlob && <p className="text-xs text-violet-300">Original WAV locked locally. This player, download, Library save and last-frame extraction use the corrected MP4, not the server soundtrack.</p>}
                    <p className="break-all text-xs text-text-secondary">Seed {result.seed} · Prompt {result.promptId}</p>
                    {!videoInput && result.options.format.startsWith('video/') && <button type="button" className={`${button} w-full`} disabled={!ready || busy || copyingFrame || !draft} onClick={() => void copyLastFrame()}>
                        {copyingFrame ? 'Copying last frame...' : 'Copy last frame to Picture 1'}
                    </button>}
                    {!videoInput && result.options.format.startsWith('video/') && <p className="text-xs text-text-muted">Uses the exact last decoded video frame at full resolution. This prepares a reference for the next clip; REF2V does not guarantee seamless first-frame matching.</p>}
                    <button type="button" className={`${button} w-full border-violet-400 bg-violet-400/15 text-violet-200`} disabled={busy || saveStatus !== 'idle'} onClick={saveOutputToLibrary}>
                        {saveStatus === 'saving' ? 'Saving to Library...' : saveStatus === 'saved' ? 'Saved to Library' : 'Save to Library'}
                    </button>
                    <p className="text-xs text-text-muted">Copies this output into your Library, including its prompt, seed, settings and executed workflow. It remains available without the ComfyUI output file.</p>
                    <a href={resultUrl} download={result.videoBlob ? 'minimax-h3-original-audio.mp4' : true} className={`${button} inline-block`} target="_blank" rel="noreferrer">Open / download output</a>
                    <p className="text-xs text-text-muted">Browser playback depends on the selected container/codec. Image-sequence formats remain in the server output folder; this link opens the returned file.</p>
                    <button type="button" className={`${button} ml-2`} onClick={() => download(JSON.stringify(result.workflow, null, 2), 'minimax-h3-executed-workflow.json', 'application/json')}>Executed workflow</button>
                    <details><summary className="cursor-pointer text-sm">{result.promptIsFinal ? 'Executed prompt' : 'Submitted prompt (server rewrite not returned)'}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{result.prompt}</pre></details>
                </section>}
            </aside>
        </div>
        {editing && <VideoReferenceEditor key={editing.id} reference={editing} onClose={() => setEditing(null)} onSave={file => { patchReference(editing, { file }); setEditing(null); }} />}
    </div>;
};

const H3Media: React.FC<{ reference: VideoReference }> = ({ reference }) => {
    const url = useMediaURL(reference.file);
    if (reference.kind === 'audio') return url ? <AudioPlayer src={url} label={`Generation audio ${referenceToken(reference)}`} detail={reference.file.name} compact pauseWhenHidden /> : null;
    return <div>
        {url && (reference.kind === 'image' ? <img src={url} alt={`H3 ${referenceToken(reference)}`} className="h-28 w-full object-contain" />
            : <video src={url} controls preload="metadata" className="h-28 w-full" />)}
        <p title={reference.file.name} className="mt-1 truncate text-[11px] text-text-secondary">{reference.file.name}</p>
    </div>;
};
