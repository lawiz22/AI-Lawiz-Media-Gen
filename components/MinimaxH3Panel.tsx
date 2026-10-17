import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import { buildMinimaxH3LibraryItem } from '../services/minimaxH3Library';
import {
    H3_ASPECTS, buildMinimaxH3Workflow, defaultMinimaxH3Options, h3Choices, h3FormatWidgets, h3FrameCount,
    h3ReferenceControl, h3Resolution, planH3References, validateMinimaxH3Readiness,
    type H3FormatWidget, type H3ObjectInfo, type MinimaxH3Options,
} from '../services/minimaxH3Workflow';
import { generateMinimaxH3Video, loadH3ObjectInfo, type H3GenerationResult, type H3Preview } from '../services/minimaxH3Service';
import { referenceToken, type MinimaxDraft, type ReferenceKind, type VideoReference } from '../services/videoPromptService';
import { VideoReferenceEditor, useMediaURL } from './VideoReferenceEditor';

const input = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary focus:border-accent focus:outline-none';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const box = 'rounded-xl border border-border-primary bg-bg-secondary p-4';
const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) =>
    <label className="block min-w-0 text-xs text-text-secondary">{label}{children}{hint && <span className="mt-1 block text-[11px] text-text-muted">{hint}</span>}</label>;
const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) =>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet-400" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />{label}</label>;
const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; hint?: string }> = ({ label, value, onChange, min, max, step = 1, hint }) =>
    <Field label={label} hint={hint}><input type="number" aria-label={label} className={input} value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} /></Field>;
const Choice: React.FC<{ label: string; value: string; choices: string[]; onChange: (value: string) => void; editable?: boolean; id?: string }> = ({ label, value, choices, onChange, editable, id }) =>
    <Field label={label}>{editable ? <><input aria-label={label} className={input} value={value} list={id} onChange={event => onChange(event.target.value)} /><datalist id={id}>{choices.map(choice => <option key={choice} value={choice} />)}</datalist></>
        : <select aria-label={label} className={input} value={value} onChange={event => onChange(event.target.value)}>
            {!choices.includes(value) && <option value={value}>{value}</option>}
            {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
        </select>}</Field>;

export const MinimaxH3Panel: React.FC<{
    draft: MinimaxDraft | undefined;
    onDraftChange: (draft: MinimaxDraft) => void;
    options: MinimaxH3Options | undefined;
    onOptionsChange: (options: MinimaxH3Options) => void;
    ready: boolean;
    onOpenPromptGenerator: () => void;
    onClearDraft: () => void;
}> = ({ draft, onDraftChange, options: savedOptions, onOptionsChange, ready, onOpenPromptGenerator, onClearDraft }) => {
    const dispatch = useDispatch<AppDispatch>();
    const options = savedOptions || defaultMinimaxH3Options();
    const [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [preview, setPreview] = useState<H3Preview | null>(null);
    const [result, setResult] = useState<H3GenerationResult | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [editing, setEditing] = useState<VideoReference | null>(null);
    const [checking, setChecking] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const refreshController = useRef<AbortController | null>(null);
    const defaultsApplied = useRef(false);

    useEffect(() => {
        if (!ready || defaultsApplied.current) return;
        defaultsApplied.current = true;
        if (!savedOptions) onOptionsChange(defaultMinimaxH3Options());
    }, [ready, savedOptions, onOptionsChange]);
    useEffect(() => () => { refreshController.current?.abort(); }, []);
    const update = (patch: Partial<MinimaxH3Options>) => onOptionsChange({ ...options, ...patch });
    const refresh = async () => {
        refreshController.current?.abort();
        const abort = new AbortController(); refreshController.current = abort;
        setLoading(true); setError('');
        try { setInfo(await loadH3ObjectInfo(abort.signal)); }
        catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (refreshController.current === abort) setLoading(false); }
    };
    const patchDraft = (patch: Partial<MinimaxDraft>) => onDraftChange({
        ...(draft || { id: crypto.randomUUID(), workflow: 'reference', prompt: '', references: [], aspect: options.aspect.split(' ')[0], duration: options.duration, template: 'generation' }),
        ...patch,
    });
    const patchReference = (ref: VideoReference, patch: Partial<VideoReference>) => patchDraft({ references: draft!.references.map(item => item.id === ref.id ? { ...item, ...patch } : item) });
    const addFiles = (kind: ReferenceKind, files: File[]) => {
        setError('');
        try {
            const refs = draft?.references || [];
            const used = new Set(refs.filter(ref => ref.kind === kind).map(ref => ref.slot));
            const max = kind === 'image' ? 9 : 3;
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
    try { const count = h3FrameCount(options.duration); frames = `${count} frames · ${(count / 24).toFixed(2)}s at native 24 fps`; }
    catch (cause) { frames = cause instanceof Error ? cause.message : String(cause); }
    if (draft?.references.length) {
        try { mapping = planH3References(draft, options); }
        catch (cause) { mappingError = cause instanceof Error ? cause.message : String(cause); }
    }
    const placeholders = () => Object.fromEntries((draft?.references || []).map(ref => [ref.id, ref.file.name]));
    const check = async () => {
        if (!draft) { setError('Prepare a prompt and references first.'); return; }
        setChecking(true); setError('');
        try {
            const nodes = await loadH3ObjectInfo(); setInfo(nodes);
            validateMinimaxH3Readiness(buildMinimaxH3Workflow(draft, options, placeholders()), nodes);
            setStatus('Nodes, model names and active workflow options validated. No upload or generation was performed.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setChecking(false); }
    };
    const generate = async () => {
        if (!draft) { setError('Prepare a prompt and references first.'); return; }
        const resolved = { ...options, loras: options.loras.map(lora => ({ ...lora })), references: { ...options.references }, formatOptions: { ...options.formatOptions },
            seed: options.randomizeSeed ? Math.floor(Math.random() * 1e15) : options.seed };
        update({ seed: resolved.seed });
        setError(''); setBusy(true); setCancelling(false); setPreview(null); setProgress(0);
        const abort = new AbortController(); controller.current = abort;
        try {
            const generated = await generateMinimaxH3Video({ ...draft, references: draft.references.map(ref => ({ ...ref })) }, resolved, abort.signal,
                (message, fraction) => { setStatus(message); setProgress(fraction); }, setPreview);
            setResult(generated);
            setSaveStatus('idle');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { controller.current = null; setBusy(false); setCancelling(false); }
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
    const download = (content: string, name: string, mime: string) => {
        const url = URL.createObjectURL(new Blob([content], { type: mime }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const exportWorkflow = () => {
        setError('');
        try {
            if (!draft) throw new Error('Prepare a prompt and references first.');
            download(JSON.stringify(buildMinimaxH3Workflow(draft, options, placeholders()), null, 2), 'minimax-h3-ref2v-api.json', 'application/json');
            setStatus('Exported with original local filenames and no API key. Upload the reference files into ComfyUI input before external execution.');
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const lists = (node: string, field: string, fallback: string[] = []) => {
        const choices = h3Choices(info, node, field);
        return choices.length ? choices : fallback;
    };
    const loraNames = Array.from(new Set([...lists('LoraLoader', 'lora_name'), ...lists('LoraLoaderModelOnly', 'lora_name')]));
    const changeFormat = (format: string) => {
        const formatOptions: MinimaxH3Options['formatOptions'] = {};
        for (const widget of h3FormatWidgets(info, format)) {
            const value = widget.config?.default ?? (Array.isArray(widget.type) ? widget.type[0] : widget.type === 'BOOLEAN' ? false : widget.type === 'STRING' ? '' : 0);
            if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') formatOptions[widget.name] = value;
        }
        update({ format, formatOptions });
    };
    const formatWidgets = h3FormatWidgets(info, options.format);
    const widgets: H3FormatWidget[] = info ? formatWidgets : options.format === 'video/h264-mp4' ? [
        { name: 'pix_fmt', type: ['yuv420p', 'yuv420p10le'] }, { name: 'crf', type: 'INT', config: { min: 0, max: 100, default: 12 } },
        { name: 'save_metadata', type: 'BOOLEAN' }, { name: 'trim_to_audio', type: 'BOOLEAN' },
    ] : [];

    return <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-xl font-bold text-violet-300">MiniMax H3 · REF2V</h3><p className="mt-1 text-xs text-text-secondary">Your 00-rEF2V graph · reference conditioning, not first/last-frame interpolation</p></div>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={!ready || busy || loading} onClick={refresh}>{loading ? 'Refreshing...' : 'Refresh nodes / models'}</button>
                <button type="button" className={button} disabled={!ready || busy} onClick={() => { if (window.confirm('Restore all H3 workflow settings to the supplied defaults? Prompt and media will be retained.')) onOptionsChange(defaultMinimaxH3Options()); }}>Reset settings</button>
            </div>
        </div>
        {!info && <p className="rounded-lg border border-sky-400/30 p-3 text-xs text-sky-200">Refresh nodes / models to load your installed files and format options, or use Check workflow. Generation always validates the live ComfyUI schema before uploading.</p>}
        {error && <p role="alert" className="whitespace-pre-wrap rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
        {status && <p role="status" className="text-xs text-text-secondary">{status}</p>}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,1fr)]">
            <fieldset disabled={!ready || busy} className="min-w-0 space-y-4 disabled:opacity-60">
                <section className={`${box} space-y-3`}>
                    <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">Prompt & references</h4><button type="button" className={button} onClick={() => { setError(''); try { onOpenPromptGenerator(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>Video Prompt Generator</button></div>
                    <textarea aria-label="H3 video prompt" className={`${input} min-h-48 font-mono !text-xs`} value={draft?.prompt || ''} placeholder="Send your production prompt from Video Prompt Generator, or paste it here..." onChange={event => patchDraft({ prompt: event.target.value })} />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={button} disabled={!draft?.prompt} onClick={async () => { try { await navigator.clipboard.writeText(draft!.prompt); setStatus('Prompt copied.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>Copy prompt</button>
                        <button type="button" className={button} disabled={!draft?.prompt} onClick={() => download(draft!.prompt, 'minimax-h3-ref2v-prompt.txt', 'text/plain')}>Export prompt .txt</button>
                        <button type="button" className={button} disabled={!draft} onClick={() => { if (window.confirm('Delete this REF2V draft and its references? H3 settings and completed output will be retained.')) onClearDraft(); }}>Delete draft</button>
                    </div>
                    <p className="text-xs text-text-secondary">Reference numbers are remapped together when needed. Video soundtracks consume Audio numbers before standalone audio, exactly as H3 expects.</p>
                    <div className="flex flex-wrap gap-2">{(['image', 'video', 'audio'] as const).map(kind => <label key={kind} className={`${button} cursor-pointer`}>+ {kind}<input type="file" multiple accept={`${kind}/*`} aria-label={`H3 upload ${kind}`} className="sr-only" onChange={(event: { currentTarget: HTMLInputElement }) => { const files = Array.from(event.currentTarget.files || []); if (files.length) addFiles(kind, files); event.currentTarget.value = ''; }} /></label>)}</div>
                    <p className="text-xs text-text-muted">Native workflow limits: 9 pictures, 3 videos, 3 standalone audios. The linked prompt generator currently imports 4 / 2 / 2.</p>
                    <div className="grid gap-3 sm:grid-cols-2">{draft?.references.map(ref => {
                        const control = h3ReferenceControl(options, ref);
                        return <div key={ref.id} className="min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <Toggle label={referenceToken(ref)} checked={control.enabled} onChange={enabled => update({ references: { ...options.references, [ref.id]: { ...control, enabled } } })} />
                                <button type="button" className="text-xs text-red-300" onClick={() => { if (window.confirm(`Remove ${referenceToken(ref)}? Update the prompt if it mentions this reference.`)) patchDraft({ references: draft.references.filter(item => item.id !== ref.id) }); }}>Remove</button>
                            </div>
                            <H3Media reference={ref} />
                            {ref.kind === 'video' && <div className="mt-2"><Toggle label="Use source soundtrack" checked={control.useSoundtrack} onChange={useSoundtrack => update({ references: { ...options.references, [ref.id]: { ...control, useSoundtrack } } })} /></div>}
                            <input aria-label={`H3 role ${referenceToken(ref)}`} className={`${input} !text-xs`} value={ref.note} placeholder="Reference role" onChange={event => patchReference(ref, { note: event.target.value })} />
                            {ref.kind !== 'audio' && <button type="button" className={`${button} mt-2 !py-1 !text-xs`} onClick={() => setEditing(ref)}>Crop / resize{ref.kind === 'video' ? ' / trim' : ''}</button>}
                            {ref.file !== ref.original && <button type="button" className={`${button} ml-1 mt-2 !py-1 !text-xs`} onClick={() => patchReference(ref, { file: ref.original })}>Restore original</button>}
                        </div>;
                    })}</div>
                    {mapping && <div className="space-y-1 text-xs text-text-secondary">{mapping.mappings.map(item => <p key={item.from}>{item.from} → {item.to}</p>)}<p>Video soundtrack presence is verified on the server before final token mapping. Silent videos do not consume an Audio number.</p></div>}
                    {mappingError && <p role="alert" className="text-xs text-amber-300">{mappingError}</p>}
                </section>
                <details className={box} open><summary className="cursor-pointer font-semibold">Models & conditioning</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Choice label="Diffusion model" value={options.model} choices={lists('UNETLoader', 'unet_name')} onChange={model => update({ model })} />
                    <Choice label="Weight dtype" value={options.weightDtype} choices={lists('UNETLoader', 'weight_dtype', ['default', 'fp8_e4m3fn', 'fp8_e4m3fn_fast', 'fp8_e5m2'])} onChange={weightDtype => update({ weightDtype })} />
                    <Choice label="Text encoder (MiniMax)" value={options.clip} choices={lists('CLIPLoader', 'clip_name')} onChange={clip => update({ clip })} />
                    <Choice label="CLIP device" value={options.clipDevice} choices={lists('CLIPLoader', 'device', ['default', 'cpu'])} onChange={clipDevice => update({ clipDevice })} />
                    <Choice label="Video VAE" value={options.videoVae} choices={lists('VAELoader', 'vae_name')} onChange={videoVae => update({ videoVae })} />
                    <Choice label="Audio VAE" value={options.audioVae} choices={lists('VAELoader', 'vae_name')} onChange={audioVae => update({ audioVae })} />
                    <Toggle label="Video VAE reference conditioning" checked={options.conditionVideoVae} onChange={conditionVideoVae => update({ conditionVideoVae })} />
                    <Toggle label="Audio VAE reference conditioning" checked={options.conditionAudioVae} onChange={conditionAudioVae => update({ conditionAudioVae })} />
                    <p className="col-span-full text-xs text-text-muted">Disabling a reference VAE keeps text-encoder conditioning. Output video VAE remains required for decoding.</p>
                </div></details>
                <details className={box} open><summary className="cursor-pointer font-semibold">Resolution & sampling</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Choice label="H3 aspect ratio" value={options.aspect} choices={H3_ASPECTS} onChange={aspect => update({ aspect })} />
                    <NumberField label="Megapixels" value={options.megapixels} min={0.1} max={16} step={0.1} onChange={megapixels => update({ megapixels })} />
                    <NumberField label="Resolution multiple" value={options.multiple} min={8} max={128} step={4} onChange={multiple => update({ multiple })} hint="H3 requires resulting dimensions divisible by 32." />
                    <NumberField label="H3 duration (seconds)" value={options.duration} min={0.25} max={60} step={0.25} onChange={duration => update({ duration })} hint={frames} />
                    <p className="col-span-full text-xs text-violet-300">{dimensions}. Native timing is 24 fps; changing output FPS changes playback duration.</p>
                    <NumberField label="H3 seed" value={options.seed} min={0} max={Number.MAX_SAFE_INTEGER} onChange={seed => update({ seed })} />
                    <Toggle label="Random seed each generation" checked={options.randomizeSeed} onChange={randomizeSeed => update({ randomizeSeed })} />
                    <Choice label="H3 sampler" value={options.sampler} choices={lists('KSamplerSelect', 'sampler_name', ['seeds_2', 'seeds_3', 'euler', 'heun'])} onChange={sampler => update({ sampler })} />
                    <NumberField label="Beta scheduler steps" value={options.steps} min={1} max={10000} onChange={steps => update({ steps })} />
                    <NumberField label="Scheduler alpha" value={options.alpha} min={0} max={50} step={0.01} onChange={alpha => update({ alpha })} />
                    <NumberField label="Scheduler beta" value={options.beta} min={0} max={50} step={0.01} onChange={beta => update({ beta })} />
                </div><div className="mt-4 space-y-3"><Toggle label="Extend intermediate sigmas" checked={options.extendSigmas} onChange={extendSigmas => update({ extendSigmas })} />
                    <fieldset disabled={!options.extendSigmas} className="grid gap-3 sm:grid-cols-2 disabled:opacity-40">
                        <NumberField label="Intermediate sigma steps" value={options.intermediateSteps} min={1} max={100} onChange={intermediateSteps => update({ intermediateSteps })} />
                        <Choice label="Sigma spacing" value={options.spacing} choices={lists('ExtendIntermediateSigmas', 'spacing', ['linear', 'cosine', 'sine'])} onChange={spacing => update({ spacing })} />
                        <NumberField label="Start at sigma" value={options.startSigma} min={-1} max={20000} step={0.01} onChange={startSigma => update({ startSigma })} />
                        <NumberField label="End at sigma" value={options.endSigma} min={0} max={20000} step={0.01} onChange={endSigma => update({ endSigma })} />
                    </fieldset>
                </div></details>
                <details className={box} open><summary className="cursor-pointer font-semibold">LoRAs · six slots</summary><div className="mt-3 space-y-3">
                    <Toggle label="Enable LoRA chain" checked={options.useLoras} onChange={useLoras => update({ useLoras })} />
                    <Toggle label="Use LoRA-patched CLIP" checked={options.useLoraClip} onChange={useLoraClip => update({ useLoraClip })} />
                    <p className="text-xs text-text-muted">The supplied graph patches the model only at conditioning time. Patched CLIP is an explicit opt-in; all six slots start disabled.</p>
                    <fieldset disabled={!options.useLoras} className="space-y-3 disabled:opacity-40">{options.loras.map((lora, index) => {
                        const patch = (value: Partial<typeof lora>) => update({ loras: options.loras.map((item, i) => i === index ? { ...item, ...value } : item) });
                        return <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_90px] items-end gap-2">
                            <Toggle label={`${index + 1}`} checked={lora.enabled} onChange={enabled => patch({ enabled })} />
                            <Choice label={`LoRA ${index + 1} file`} value={lora.name} choices={loraNames} editable id={`h3-lora-${index}`} onChange={name => patch({ name })} />
                            <NumberField label={`Strength ${index + 1}`} value={lora.strength} min={-20} max={20} step={0.05} onChange={strength => patch({ strength })} />
                        </div>;
                    })}</fieldset>
                </div></details>
                <details className={box}><summary className="cursor-pointer font-semibold">References manager & optional prompt rewrite</summary><div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Choice label="Reference image size" value={options.refImageSize} choices={lists('MiniMaxH3ReferenceToVideo', 'ref_image_size', ['match', 'max'])} onChange={refImageSize => update({ refImageSize })} />
                        <NumberField label="Maximum reference edge" value={options.maxReferenceEdge} min={0} max={8192} step={64} onChange={maxReferenceEdge => update({ maxReferenceEdge })} hint="0 disables the long-edge cap. max is slower than match." />
                        <Choice label="ReferencePack prompt provider" value={options.promptProvider} choices={['none', 'openrouter', 'local']} onChange={value => update({ promptProvider: value as MinimaxH3Options['promptProvider'] })} />
                        <Choice label="ReferencePack job type" value={options.jobType} choices={['auto', 'standard', 'replacement']} onChange={jobType => update({ jobType })} />
                    </div>
                    <p className="text-xs text-text-secondary">Default none sends the Video Prompt Generator output verbatim, with only reference-token remapping. Optional rewriting runs on the ComfyUI server, not the app. It can incur an additional API charge.</p>
                    {options.promptProvider === 'openrouter' && <>
                        <p className="text-xs text-amber-300">Requires OPENROUTER_API_KEY or LLM_KEY in the ComfyUI server environment. No API key is embedded in submitted/exported workflows.</p>
                        <Choice label="ReferencePack OpenRouter model" value={options.openrouterModel} choices={lists('MiniMaxH3ReferencePack', 'openrouter_model')} editable id="h3-refpack-models" onChange={openrouterModel => update({ openrouterModel })} />
                        <Choice label="Reasoning effort" value={options.reasoningEffort} choices={['none', 'low', 'medium', 'high']} onChange={reasoningEffort => update({ reasoningEffort })} />
                    </>}
                    {options.promptProvider === 'local' && <div className="space-y-3">
                        <Field label="Local API base"><input aria-label="Local API base" className={input} value={options.apiBase} placeholder="http://localhost:11434/v1" onChange={event => update({ apiBase: event.target.value })} /></Field>
                        <Field label="Local model ID"><input aria-label="Local model ID" className={input} value={options.localModelSlug} onChange={event => update({ localModelSlug: event.target.value })} /></Field>
                        <p className="text-xs text-amber-300">This node sends video as still frames and does not send audio to local prompt models.</p>
                    </div>}
                    <Field label="ReferencePack system prompt"><textarea aria-label="ReferencePack system prompt" className={`${input} min-h-32`} value={options.systemPrompt} onChange={event => update({ systemPrompt: event.target.value })} /></Field>
                    <Toggle label="Display generated prompt node" checked={options.displayPrompt} onChange={displayPrompt => update({ displayPrompt })} />
                </div></details>
                <details className={box}><summary className="cursor-pointer font-semibold">Live preview · KJ WebSocket</summary><div className="mt-3 space-y-3">
                    <Toggle label="Enable live preview" checked={options.preview} onChange={preview => update({ preview })} />
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
                            <Toggle label="Include audio in preview" checked={options.previewAudio} onChange={previewAudio => update({ previewAudio })} />
                        </div>
                        <p className="text-xs text-text-muted">KJ emits JPEG, animated WebP or MP4 over the API. Tiny VAE takes priority over full VAE. Audio/full-frame previews increase decoding cost. No preview is required for a successful generation.</p>
                    </fieldset>
                </div></details>
                <details className={box} open><summary className="cursor-pointer font-semibold">Output & audio</summary><div className="mt-3 space-y-3">
                    <Toggle label="Generate output audio" checked={options.generateAudio} onChange={generateAudio => update({ generateAudio })} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <NumberField label="Output FPS" value={options.frameRate} min={1} max={240} onChange={frameRate => update({ frameRate })} />
                        <NumberField label="Loop count" value={options.loopCount} min={0} max={100} onChange={loopCount => update({ loopCount })} />
                        <Choice label="Output format" value={options.format} choices={lists('VHS_VideoCombine', 'format', ['video/h264-mp4'])} onChange={changeFormat} />
                        <Field label="Filename prefix"><input aria-label="Filename prefix" className={input} value={options.filenamePrefix} onChange={event => update({ filenamePrefix: event.target.value })} /></Field>
                        {widgets.map(widget => {
                            const value = options.formatOptions[widget.name] ?? widget.config?.default ?? (Array.isArray(widget.type) ? widget.type[0] : widget.type === 'BOOLEAN' ? false : 0);
                            const set = (next: string | number | boolean) => update({ formatOptions: { ...options.formatOptions, [widget.name]: next } });
                            if (Array.isArray(widget.type)) return <Choice key={widget.name} label={widget.name} value={String(value)} choices={widget.type} onChange={set} />;
                            if (widget.type === 'BOOLEAN') return <Toggle key={widget.name} label={widget.name} checked={Boolean(value)} onChange={set} />;
                            if (widget.type === 'INT' || widget.type === 'FLOAT') return <NumberField key={widget.name} label={widget.name} value={Number(value)} min={Number(widget.config?.min ?? 0)} max={Number(widget.config?.max ?? 10000)} step={widget.type === 'INT' ? 1 : 0.01} onChange={set} />;
                            return <Field key={widget.name} label={widget.name}><input className={input} value={String(value)} onChange={event => set(event.target.value)} /></Field>;
                        })}
                        <Toggle label="Ping-pong playback" checked={options.pingpong} onChange={pingpong => update({ pingpong })} />
                        <Toggle label="Save output on ComfyUI" checked={options.saveOutput} onChange={saveOutput => update({ saveOutput })} />
                    </div>
                    <p className="text-xs text-text-muted">Save output off writes temporary server output, still viewable/downloadable. Disable generated audio to omit VAEDecodeAudio and the final audio connection.</p>
                </div></details>
            </fieldset>
            <aside className="min-w-0 space-y-4 self-start xl:sticky xl:top-16">
                <section className={`${box} space-y-3`}>
                    <h4 className="font-semibold">Live generation</h4>
                    {preview ? <>
                        {preview.mime === 'video/mp4' ? <video key={`${preview.step}-${preview.url.length}`} src={preview.url} autoPlay loop muted controls className="max-h-80 w-full rounded-lg bg-black" /> : <img src={preview.url} alt="H3 live sampling preview" className="max-h-80 w-full rounded-lg bg-black object-contain" />}
                        <p className="text-xs text-text-secondary">Preview step {preview.step}/{preview.total} · {preview.mime}</p>
                    </> : <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border-primary p-4 text-center text-sm text-text-secondary">{busy ? options.preview ? 'Waiting for KJ preview frames...' : 'Live preview disabled.' : 'Animated previews appear during sampling, when emitted by KJ.'}</div>}
                    {busy && <progress aria-label="H3 generation progress" value={progress} max={1} className="h-2 w-full accent-violet-400" />}
                    {busy ? <button type="button" disabled={cancelling} className={`${button} w-full border-red-400/50 text-red-300`} onClick={() => { setCancelling(true); controller.current?.abort(); }}>{cancelling ? 'Cancelling safely...' : 'Cancel H3 generation'}</button>
                        : <button type="button" className={`${button} w-full border-violet-400 bg-violet-400/15 !py-3 text-violet-200`} disabled={!ready || saveStatus === 'saving' || !draft?.prompt.trim() || !draft.references.length || !!mappingError} onClick={generate}>Generate REF2V video</button>}
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!ready || busy || checking} onClick={check}>{checking ? 'Checking...' : 'Check workflow'}</button><button type="button" className={button} disabled={!draft || busy} onClick={exportWorkflow}>Export API workflow</button></div>
                    <p className="text-xs text-text-muted">Generation uploads enabled edited references to your ComfyUI server. Model/GPU cost and memory depend on resolution, length, reference size and preview settings.</p>
                </section>
                {result && <section className={`${box} space-y-3`}>
                    <h4 className="font-semibold">Last completed output</h4>
                    {result.options.format.startsWith('image/') || /(?:png|gif)$/.test(result.options.format)
                        ? <img src={result.videoUrl} alt="H3 generated output" className="w-full rounded-lg bg-black" />
                        : <video src={result.videoUrl} controls className="w-full rounded-lg bg-black" />}
                    <p className="break-all text-xs text-text-secondary">Seed {result.seed} · Prompt {result.promptId}</p>
                    <button type="button" className={`${button} w-full border-violet-400 bg-violet-400/15 text-violet-200`} disabled={busy || saveStatus !== 'idle'} onClick={saveOutputToLibrary}>
                        {saveStatus === 'saving' ? 'Saving to Library...' : saveStatus === 'saved' ? 'Saved to Library' : 'Save to Library'}
                    </button>
                    <p className="text-xs text-text-muted">Copies this output into your Library, including its prompt, seed, settings and executed workflow. It remains available without the ComfyUI output file.</p>
                    <a href={result.videoUrl} download className={`${button} inline-block`} target="_blank" rel="noreferrer">Open / download output</a>
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
    return <div>
        {url && (reference.kind === 'image' ? <img src={url} alt={`H3 ${referenceToken(reference)}`} className="h-28 w-full object-contain" /> : reference.kind === 'video'
            ? <video src={url} controls preload="metadata" className="h-28 w-full" /> : <audio src={url} controls className="w-full" />)}
        <p title={reference.file.name} className="mt-1 truncate text-[11px] text-text-secondary">{reference.file.name}</p>
    </div>;
};
