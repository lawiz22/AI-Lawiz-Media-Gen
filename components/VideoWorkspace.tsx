import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import {
    DEFAULT_VIDEO_TEMPLATES, REFERENCE_LIMITS, VIDEO_WORKFLOWS, VIDEO_PROMPT_ASPECTS, generateVideoPrompt, addVideoReferences,
    loadVideoPromptDraft, saveVideoPromptDraft, referenceToken, validateVideoPromptOutput,
    captureVideoPromptInputs, type ReferenceKind, type VideoPromptDraft, type VideoPromptInputs, type VideoPromptProvider, type VideoReference, type VideoTemplate,
} from '../services/videoPromptService';
import { DEFAULT_OPENROUTER_MODEL, filterOpenRouterModels, getOpenRouterInputModalities, getOpenRouterModels, type OpenRouterModel } from '../services/openRouterService';
import { VideoReferenceEditor, useMediaURL } from './VideoReferenceEditor';
import { buildVideoPromptLibraryItem, restoreMinimaxH3PromptLibraryItem } from '../services/videoPromptLibrary';
import { MinimaxH3Panel } from './MinimaxH3Panel';
import { AudioLyricsEditor, OriginalAudioSelector } from './VideoAudioControls';
import { AudioPlayer } from './AudioPlayer';
import { H3AudioReference } from './H3AudioReference';
import { CharacterSwapPanel } from './CharacterSwapPanel';
import { defaultMinimaxH3Options, h3AspectFromPrompt, withH3OriginalAudio } from '../services/minimaxH3Workflow';
import { defaultH3WorkflowOptions, defaultUltrafastH3Options, h3WorkflowName, validateH3ReferenceLimits, type H3RenderWorkflow } from '../services/minimaxH3UltrafastWorkflow';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import { restoreAdvancedVideoLibraryItem } from '../services/minimaxH3Library';
import type { AdvancedVideoFinishing } from '../services/minimaxH3AdvancedWorkflow';
import { VideoReferenceToken as Token, ColoredVideoPrompt as ColoredPrompt } from './VideoPromptText';

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-primary px-3 py-2 text-sm font-medium transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40';
const input = 'w-full rounded-lg border border-border-primary bg-bg-primary p-2.5 text-sm text-text-primary focus:border-accent focus:outline-none';
const panel = 'rounded-2xl border border-border-primary bg-bg-secondary p-4 md:p-5';
const initialDraft = (): VideoPromptDraft => ({
    idea: '', provider: 'openrouter',
    models: { openrouter: DEFAULT_OPENROUTER_MODEL, gemini: 'gemini-2.5-flash', mammouth: 'gemini-2.5-flash' },
    aspect: '16:9', duration: 10, template: 'generation', templates: { ...DEFAULT_VIDEO_TEMPLATES },
    references: [], result: '', workflow: 'reference', minimaxDrafts: {},
});

const ReferenceCard: React.FC<{
    reference: VideoReference;
    disabled: boolean;
    onEdit: () => void;
    onRemove: () => void;
    onReset: () => void;
    onNote: (note: string) => void;
    onInsert: () => void;
}> = ({ reference, disabled, onEdit, onRemove, onReset, onNote, onInsert }) => {
    const url = useMediaURL(reference.file);
    return <article className="min-w-0 overflow-hidden rounded-xl border border-border-primary bg-bg-primary">
        <div className="flex items-center justify-between gap-1 p-2">
            <button type="button" title="Insert reference into your idea" disabled={disabled} onClick={onInsert}><Token text={referenceToken(reference)} /></button>
            <button type="button" aria-label={`Remove ${referenceToken(reference)}`} disabled={disabled} onClick={onRemove} className="rounded px-2 text-text-secondary hover:text-red-400">X</button>
        </div>
        <div className="flex h-36 items-center justify-center bg-black/40">
            {url && (reference.kind === 'image' ? <img src={url} alt={referenceToken(reference)} className="h-full w-full object-contain" />
                : reference.kind === 'video' ? <video src={url} controls preload="metadata" className="h-full w-full object-contain" />
                    : <AudioPlayer src={url} label={`Audio ${referenceToken(reference)}`} compact pauseWhenHidden />)}
        </div>
        <div className="space-y-2 p-2">
            <p title={reference.file.name} className="truncate text-xs text-text-secondary">{reference.file.name} · {(reference.file.size / 1024 / 1024).toFixed(2)} MB</p>
            <input aria-label={`Role of ${referenceToken(reference)}`} disabled={disabled} className={`${input} !p-2 !text-xs`} placeholder={reference.kind === 'image' ? 'Identity, wardrobe, decor...' : reference.kind === 'video' ? 'Motion, framing, source scene...' : 'Voice, dialogue, soundscape...'} value={reference.note} onChange={event => onNote(event.target.value)} />
            <div className="flex flex-wrap gap-1">
                {reference.kind !== 'audio' && <button type="button" disabled={disabled} onClick={onEdit} className={`${button} !px-2 !py-1 !text-xs`}>Crop / resize{reference.kind === 'video' ? ' / trim' : ''}</button>}
                {reference.file !== reference.original && <button type="button" disabled={disabled} onClick={onReset} className={`${button} !px-2 !py-1 !text-xs`}>Restore original</button>}
            </div>
        </div>
    </article>;
};

export const VideoWorkspace: React.FC<{
    director: React.ReactNode;
    openDirector: boolean;
    onLeaveDirector: () => void;
    onResetDirector: () => void;
    libraryItem: LibraryItem | null;
    libraryWorkflow?: H3RenderWorkflow;
    libraryFinishing?: AdvancedVideoFinishing;
    onLibraryItemLoaded: () => void;
}> = ({ director, openDirector, onLeaveDirector, onResetDirector, libraryItem, libraryWorkflow: requestedWorkflow, libraryFinishing, onLibraryItemLoaded }) => {
    const dispatch: AppDispatch = useDispatch();
    const libraryWorkflow: H3RenderWorkflow = requestedWorkflow ?? 'reference';
    const [tab, setTab] = useState<'prompt' | 'ltx' | 'minimax' | 'ultrafast' | 'advanced' | 'character-swap'>('prompt');
    const [swapOpened, setSwapOpened] = useState(false);
    const [draft, setDraft] = useState<VideoPromptDraft>(initialDraft);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [storageError, setStorageError] = useState('');
    const [saved, setSaved] = useState(false);
    const [notice, setNotice] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [editing, setEditing] = useState<VideoReference | null>(null);
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelError, setModelError] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [modelRefresh, setModelRefresh] = useState(0);
    const [editOutput, setEditOutput] = useState(false);
    const [librarySaving, setLibrarySaving] = useState(false);
    const [librarySaved, setLibrarySaved] = useState(false);
    const [pendingAudio, setPendingAudio] = useState<Record<string, boolean>>({});
    const hasPendingAudio = draft.references.some(ref => ref.kind === 'audio' && pendingAudio[ref.id]);
    const ideaRef = useRef<HTMLTextAreaElement>(null);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const loaded = useRef(false);
    const persistenceVersion = useRef(0);
    const latestDraft = useRef(draft);
    latestDraft.current = draft;

    useEffect(() => { if (openDirector) setTab('ltx'); }, [openDirector]);
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        loadVideoPromptDraft().then(value => {
            if (value) setDraft({ ...value, workflow: value.workflow === 'advanced' || value.workflow === 'ultrafast' ? value.workflow : 'reference', minimaxLyricsSettings: value.minimaxLyricsSettings ?? { provider: value.provider, model: value.models[value.provider] } });
            setReady(true);
        }).catch(cause => {
            setStorageError(`Could not restore the video workspace: ${cause instanceof Error ? cause.message : String(cause)}. Reload to retry; saving is disabled to protect the existing draft.`);
        });
    }, []);
    useEffect(() => {
        if (!ready || draft.provider !== 'openrouter') return;
        const controller = new AbortController();
        setModelError(''); setLoadingModels(true);
        getOpenRouterModels(controller.signal).then(value => {
            if (!controller.signal.aborted) setModels(value);
        }).catch(cause => {
            if (!controller.signal.aborted) setModelError(cause instanceof Error ? cause.message : String(cause));
        }).finally(() => { if (!controller.signal.aborted) setLoadingModels(false); });
        return () => controller.abort();
    }, [ready, draft.provider, modelRefresh]);
    useEffect(() => {
        if (!ready) return;
        setSaved(false);
        const version = ++persistenceVersion.current;
        const timer = setTimeout(() => {
            saveQueue.current = saveQueue.current.then(async () => {
                if (version !== persistenceVersion.current) return;
                await saveVideoPromptDraft(draft);
                if (version === persistenceVersion.current) { setSaved(true); setStorageError(''); }
            }).catch(cause => {
                setStorageError(`Draft could not be saved: ${cause instanceof Error ? cause.message : String(cause)}`);
            });
        }, 400);
        return () => clearTimeout(timer);
    }, [draft, ready]);

    useEffect(() => {
        if (!libraryItem) return;
        setTab(libraryWorkflow === 'reference' ? 'minimax' : libraryWorkflow);
        if (openDirector) onLeaveDirector();
        if (!ready) return;
        setError('');
        const name = h3WorkflowName(libraryWorkflow);
        setNotice(`Loading ${libraryFinishing ? 'source video and finishing settings' : 'saved prompt and references'} into ${name}...`);
        let cancelled = false;
        const restore = libraryFinishing ? restoreAdvancedVideoLibraryItem(libraryItem, libraryFinishing, getLibraryAssetBlob)
            : restoreMinimaxH3PromptLibraryItem(libraryItem, getLibraryAssetBlob);
        restore.then(({ draft: reference, options, warning }) => {
            if (cancelled) return;
            const restored = { ...reference, workflow: libraryWorkflow };
            validateH3ReferenceLimits(restored);
            const sameWorkflow = (options.variant ?? 'reference') === libraryWorkflow;
            const renderOptions = sameWorkflow ? options : withH3OriginalAudio({
                ...defaultH3WorkflowOptions(libraryWorkflow), aspect: options.aspect, duration: options.duration,
                references: structuredClone(options.references),
            }, options.originalAudioId, options.forceOriginalAudio ?? false);
            if (latestDraft.current.minimaxDrafts[libraryWorkflow] && !window.confirm(`Load this ${libraryFinishing ? 'source video and finishing setup' : 'saved prompt and references'} into ${name}? This replaces only that workflow's draft, not the Library item or Video Prompt Generator.`)) {
                onLibraryItemLoaded();
                return;
            }
            setDraft(current => ({ ...current, minimaxDrafts: { ...current.minimaxDrafts, [libraryWorkflow]: restored },
                ...(libraryWorkflow === 'advanced' ? { advancedH3Options: renderOptions } : libraryWorkflow === 'ultrafast' ? { ultrafastH3Options: renderOptions } : { minimaxH3Options: renderOptions }),
            }));
            setError('');
            setNotice(`${libraryFinishing ? 'Source video and finishing setup' : 'Prompt and original/edited references'} loaded into ${name}. ${sameWorkflow ? warning || 'Saved H3 settings restored.' : `Destination workflow defaults loaded; prompt, references, aspect, duration and soundtrack selection retained. ${warning || ''}`} The Library item was not changed.`);
            onLibraryItemLoaded();
        }).catch(cause => {
            if (cancelled) return;
            setNotice('');
            setError(`Could not restore Library ${libraryFinishing ? 'video' : 'prompt'}: ${cause instanceof Error ? cause.message : String(cause)}`);
            onLibraryItemLoaded();
        });
        return () => { cancelled = true; };
    }, [libraryItem, libraryWorkflow, libraryFinishing, ready, onLibraryItemLoaded, openDirector, onLeaveDirector]);

    const update = (patch: Partial<VideoPromptDraft>) => setDraft(current => ({ ...current, ...patch }));
    const changeSoundtrack = (originalAudioId: string | undefined, forceOriginalAudio: boolean) => update({ originalAudioId, forceOriginalAudio });
    const chooseTab = (next: typeof tab) => { setTab(next); if (next === 'character-swap') setSwapOpened(true); if (next !== 'ltx' && openDirector) onLeaveDirector(); };
    const changeReference = (id: string, patch: Partial<VideoReference>) => setDraft(current => ({
        ...current, references: current.references.map(ref => ref.id === id ? { ...ref, ...patch } : ref),
    }));
    const insertToken = (ref: VideoReference) => {
        const field = ideaRef.current;
        const start = field?.selectionStart ?? draft.idea.length;
        const end = field?.selectionEnd ?? start;
        const text = `${referenceToken(ref)} `;
        update({ idea: `${draft.idea.slice(0, start)}${text}${draft.idea.slice(end)}` });
        requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + text.length, start + text.length); });
    };
    const importFiles = (kind: ReferenceKind, files: File[]) => {
        setError(''); setNotice('');
        if (!files.length) return;
        try { update({ references: addVideoReferences(draft.references, kind, files) }); }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const savePromptToLibrary = async (text: string, inputs: VideoPromptInputs, fromGeneration: boolean) => {
        setLibrarySaving(true); setLibrarySaved(false);
        try {
            const item = await buildVideoPromptLibraryItem(text, inputs, fromGeneration ? 'generation' : 'current-setup');
            await dispatch(addToLibrary(item)).unwrap();
            setLibrarySaved(latestDraft.current.result === text);
            setNotice('Saved to Library > Prompts with the idea, provider/model, templates, settings and all original/edited references.');
        } finally { setLibrarySaving(false); }
    };
    const generate = async () => {
        setError(''); setNotice(''); setBusy(true); setLibrarySaved(false);
        let generated: { text: string; inputs: VideoPromptInputs } | undefined;
        try {
            const inputs = captureVideoPromptInputs(draft);
            if (hasPendingAudio) throw new Error('Apply the audio selection first. The full song or an older excerpt will not be sent to the prompt model.');
            const result = await generateVideoPrompt(draft);
            update({ result, generatedInputs: inputs, generatedInputsProvenance: 'generation' });
            setEditOutput(false);
            generated = { text: result, inputs };
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setBusy(false); }
        if (generated) {
            try { await savePromptToLibrary(generated.text, generated.inputs, true); }
            catch (cause) { setError(`Prompt generated, but Library saving failed: ${cause instanceof Error ? cause.message : String(cause)}. Use Save to Library to retry.`); }
        }
    };
    const saveCurrentPrompt = async () => {
        setError(''); setNotice('');
        try { await savePromptToLibrary(draft.result, draft.generatedInputs || captureVideoPromptInputs(draft), !!draft.generatedInputs && draft.generatedInputsProvenance !== 'current-setup'); }
        catch (cause) { setError(`Could not save prompt to Library: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    const transfer = () => {
        setError(''); setNotice('');
        try {
            const prompt = validateVideoPromptOutput(draft.result, draft.template);
            if (hasPendingAudio) throw new Error('Apply the audio selection before transferring it to H3.');
            const destination = draft.workflow === 'advanced' || draft.workflow === 'ultrafast' ? draft.workflow : 'reference';
            const reference = {
                id: crypto.randomUUID(), workflow: destination, prompt,
                references: draft.references.map(ref => ({ ...ref })), aspect: draft.aspect, duration: draft.duration, template: draft.template,
            } as const;
            validateH3ReferenceLimits(reference);
            const previous = draft.minimaxDrafts[destination];
            if (previous && !window.confirm('Replace the existing draft for this Minimax workflow?')) return;
            const options = {
                ...withH3OriginalAudio((destination === 'advanced' ? draft.advancedH3Options : destination === 'ultrafast' ? draft.ultrafastH3Options : draft.minimaxH3Options) || defaultH3WorkflowOptions(destination), draft.originalAudioId, draft.forceOriginalAudio ?? false),
                aspect: h3AspectFromPrompt(draft.aspect), duration: draft.duration,
            };
            update({ minimaxDrafts: { ...draft.minimaxDrafts, [destination]: reference },
                ...(destination === 'advanced' ? { advancedH3Options: options } : destination === 'ultrafast' ? { ultrafastH3Options: options } : { minimaxH3Options: options }),
            });
            chooseTab(destination === 'reference' ? 'minimax' : destination);
            setNotice(`Prompt and edited references transferred to ${h3WorkflowName(destination)}. Subsequent edits in the generator do not change that workflow.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    const copy = async (text: string) => {
        setError('');
        try { await navigator.clipboard.writeText(text); setNotice('Prompt copied.'); }
        catch (cause) { setError(`Could not copy: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    const download = (text: string, filename: string) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const count = (kind: ReferenceKind) => draft.references.filter(ref => ref.kind === kind).length;
    const selectedModel = models.find(model => model.id === draft.models.openrouter);
    const requiredInputs = React.useMemo(() => [...new Set<ReferenceKind>(draft.references.map((reference: VideoReference) => reference.kind))], [draft.references]);
    const compatibleModels = React.useMemo(() => filterOpenRouterModels(models, requiredInputs), [models, requiredInputs]);
    const filteredModels = React.useMemo(() => filterOpenRouterModels(compatibleModels, [], modelSearch), [compatibleModels, modelSearch]);
    const modelOptions = React.useMemo(() => filteredModels.map(model => <option key={model.id} value={model.id}>{model.name} [{getOpenRouterInputModalities(model).join(' + ')}] ({model.id})</option>), [filteredModels]);
    const unsupportedInputs = selectedModel ? requiredInputs.filter(kind => !getOpenRouterInputModalities(selectedModel).includes(kind)) : [];
    const openRouterModelBlocked = draft.provider === 'openrouter' && (loadingModels || !selectedModel || unsupportedInputs.length > 0);

    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="Video tools">
                {([
                    { id: 'prompt', label: 'Video Prompt Generator', color: 'border-sky-400/60 text-sky-300', active: 'bg-sky-400/15' },
                    { id: 'ltx', label: 'LTX Director', color: 'border-amber-400/60 text-amber-300', active: 'bg-amber-400/15' },
                    { id: 'minimax', label: 'Minimax REF2v H3', color: 'border-violet-400/60 text-violet-300', active: 'bg-violet-400/15' },
                    { id: 'ultrafast', label: 'Ultrafast', color: 'border-emerald-400/60 text-emerald-300', active: 'bg-emerald-400/15' },
                    { id: 'advanced', label: 'MiniMax Advanced', color: 'border-cyan-400/60 text-cyan-300', active: 'bg-cyan-400/15' },
                    { id: 'character-swap', label: 'Character Swap H3', color: 'border-rose-400/60 text-rose-300', active: 'bg-rose-400/15' },
                ] as const).map(item =>
                    <button key={item.id} type="button" onClick={() => chooseTab(item.id)} aria-pressed={tab === item.id} className={`${button} ${item.color} ${tab === item.id ? item.active : ''}`}>{item.label}</button>)}
            </nav>
            <span role="status" className="text-xs text-text-secondary">{!ready ? 'Loading saved workspace...' : saved ? 'Saved locally · media included' : 'Saving workspace...'}</span>
        </div>
        {storageError && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{storageError}
            {ready && <button type="button" className={`${button} ml-3`} onClick={() => setDraft(current => ({ ...current }))}>Retry saving</button>}
        </div>}
        {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-300">{notice}</p>}

        <div hidden={tab !== 'character-swap'}>{swapOpened && <CharacterSwapPanel />}</div>
        <React.Activity mode={tab === 'ltx' ? 'visible' : 'hidden'}>
            {!openDirector && <div className="mb-3 flex justify-end"><button type="button" className={`${button} text-red-300`} onClick={onResetDirector}>Reset LTX Director</button></div>}
            {director}
        </React.Activity>
        <React.Activity mode={tab === 'prompt' ? 'visible' : 'hidden'}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,1fr)]">
                <div className="min-w-0 space-y-4">
                    <section className={`${panel} bg-gradient-to-br from-sky-400/10 via-bg-secondary to-violet-400/10`}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div><p className="mb-1 text-xs uppercase tracking-widest text-accent">Video · Creative workspace</p><h2 className="text-xl font-bold">Video Prompt Generator</h2><p className="mt-1 text-sm text-text-secondary">An independent prompt tool. Compose, copy or send your prompt to an available video workflow.</p></div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={!ready || busy} className={button} onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen}>Templates</button>
                                <button type="button" disabled={!ready || busy || librarySaving} className={`${button} text-red-300`} onClick={() => {
                                    if (window.confirm('Clear the current idea, references and generated prompt? Templates, provider settings and Minimax drafts will be kept.')) {
                                        update({ idea: '', references: [], result: '', generatedInputs: undefined, generatedInputsProvenance: undefined }); setLibrarySaved(false);
                                    }
                                }}>Clear</button>
                            </div>
                        </div>
                        <fieldset disabled={!ready || busy} className="space-y-4 disabled:opacity-50">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1 text-sm">Provider<select className={input} value={draft.provider} onChange={event => update({ provider: event.target.value as VideoPromptProvider })}>
                                    <option value="openrouter">OpenRouter</option><option value="gemini">Gemini</option><option value="mammouth">Mammouth</option>
                                </select></label>
                                {draft.provider === 'openrouter' ? <div className="min-w-0 space-y-2">
                                    <label className="block space-y-1 text-sm">Search OpenRouter models<input type="search" className={input} value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Name, model ID or input type (video, audio...)" /></label>
                                    <label className="block space-y-1 text-sm">Model<select aria-label="OpenRouter model" aria-describedby="video-openrouter-model-help" className={input} disabled={loadingModels} value={draft.models.openrouter} onChange={event => update({ models: { ...draft.models, openrouter: event.target.value } })}>
                                        {!filteredModels.some(model => model.id === draft.models.openrouter) && <option value={draft.models.openrouter} disabled={models.length > 0 && (!selectedModel || unsupportedInputs.length > 0)}>
                                            {selectedModel ? `${selectedModel.name} [${getOpenRouterInputModalities(selectedModel).join(' + ')}] (${selectedModel.id})` : draft.models.openrouter || 'Select a model'} {models.length && !selectedModel ? '(unavailable)' : '(current selection)'}
                                        </option>}
                                        {modelOptions}
                                    </select></label>
                                </div> : <label className="space-y-1 text-sm">Model ID<input className={input} list={`video-${draft.provider}-models`} value={draft.models[draft.provider]} onChange={event => update({ models: { ...draft.models, [draft.provider]: event.target.value } })} placeholder="Provider model ID" /></label>}
                            </div>
                            <datalist id="video-gemini-models"><option value="gemini-2.5-flash" /><option value="gemini-2.5-pro" /></datalist>
                            <datalist id="video-mammouth-models"><option value="gemini-2.5-flash" /><option value="gemini-2.5-pro" /></datalist>
                            <div className="space-y-2 text-xs text-text-secondary">
                                <p>Uses API keys from Connection Settings. Gemini/Mammouth model IDs are editable; availability and access depend on your account.</p>
                                {draft.provider === 'openrouter' && <><button type="button" disabled={loadingModels} onClick={() => setModelRefresh(current => current + 1)} className={`${button} !py-1 !text-xs`}>{loadingModels ? 'Loading...' : 'Refresh OpenRouter models'}</button>
                                    <p id="video-openrouter-model-help">Models load automatically. Only models supporting every attached reference type are listed. Search by name, ID or input type without erasing your selection.</p>
                                    {models.length > 0 && <p role="status">{filteredModels.length} matching models; {compatibleModels.length} of {models.length} support the required input types.</p>}
                                    {selectedModel && <p>Supported inputs: {getOpenRouterInputModalities(selectedModel).join(', ')}</p>}
                                    {unsupportedInputs.length > 0 && <p role="alert" className="text-amber-300">Selected model cannot read {unsupportedInputs.join(' + ')} references. Choose a compatible model from the list; your selection will not be changed automatically.</p>}
                                    {!loadingModels && models.length > 0 && !selectedModel && <p role="alert" className="text-amber-300">The selected model is not in the current catalog. Choose an available OpenRouter model.</p>}
                                    {models.length > 0 && filteredModels.length === 0 && <p role="status">No matching models. Clear the search, adjust the references or choose another provider.</p>}
                                    {modelError && <p role="alert" className="text-red-400">{modelError}</p>}
                                    <p>Video/audio require a compatible model. Audio: WAV or MP3.</p></>}
                                {draft.provider === 'gemini' && <p>Images, video and audio are sent as native media to Gemini.</p>}
                                {draft.provider === 'mammouth' && <p className="text-amber-300">Mammouth: image references only in this integration. Choose Gemini or a compatible OpenRouter model for video/audio.</p>}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <label className="space-y-1 text-sm">Canvas<select className={input} value={draft.template} onChange={event => update({ template: event.target.value as VideoTemplate })}><option value="generation">Audio + video generation</option><option value="replacement">Character replacement</option></select></label>
                                <label className="space-y-1 text-sm">Aspect ratio<select className={input} value={draft.aspect} onChange={event => update({ aspect: event.target.value })}>{VIDEO_PROMPT_ASPECTS.map(value => <option key={value}>{value}</option>)}</select></label>
                                <label className="space-y-1 text-sm">Duration (seconds)<input type="number" min={1} max={120} step={1} className={input} value={draft.duration} onChange={event => update({ duration: Number(event.target.value) })} /></label>
                            </div>
                            <label className="block space-y-2 text-sm font-medium">Your idea<textarea ref={ideaRef} className={`${input} min-h-40 resize-y`} placeholder="Describe the scene, action, dialogue and sound. Click a reference badge to insert its token..." value={draft.idea} onChange={event => update({ idea: event.target.value })} /></label>
                            <div className="flex flex-wrap gap-2">{draft.references.map(ref => <button type="button" key={ref.id} onClick={() => insertToken(ref)}><Token text={referenceToken(ref)} /></button>)}</div>
                            <OriginalAudioSelector references={draft.references} value={draft.originalAudioId} forced={draft.forceOriginalAudio}
                                onChange={originalAudioId => changeSoundtrack(originalAudioId, originalAudioId !== undefined)} onForceChange={(forced, originalAudioId) => changeSoundtrack(originalAudioId, forced)} />
                            {draft.template === 'replacement' && <p className="text-xs text-violet-300">Requires a source video and at least one character image. Use each reference's Role field to map identities and actors.</p>}
                        </fieldset>
                    </section>
                    {settingsOpen && <section className={panel}>
                        <h3 className="mb-2 font-semibold">Editable prompt templates</h3>
                        <p className="mb-3 text-xs text-text-secondary">Saved in this local workspace. Keep the listed output field names and order; the response validator uses that contract.</p>
                        <fieldset disabled={!ready || busy} className="space-y-3">
                            {(['generation', 'replacement'] as const).map(key => <label key={key} className="block space-y-2 text-sm">{key === 'generation' ? 'Audio + video generation' : 'Character replacement'}
                                <textarea aria-label={key === 'generation' ? 'Audio + video generation template' : 'Character replacement template'} className={`${input} min-h-64 font-mono !text-xs`} value={draft.templates[key]} onChange={event => update({ templates: { ...draft.templates, [key]: event.target.value } })} />
                                <button type="button" className={`${button} !text-xs`} onClick={() => { if (window.confirm('Restore this default template?')) update({ templates: { ...draft.templates, [key]: DEFAULT_VIDEO_TEMPLATES[key] } }); }}>Restore default</button>
                            </label>)}
                        </fieldset>
                    </section>}
                    <section className={`${panel} space-y-5`}>
                        <div><h3 className="font-semibold">Reference studio</h3><p className="mt-1 text-xs text-text-secondary">4 images · 2 videos · 2 audio files. Numbers remain stable when a reference is removed. Crop and resize apply to the files actually sent.</p></div>
                        {(['image', 'video', 'audio'] as const).map(kind => <div key={kind} className="space-y-3" onDragOver={event => event.preventDefault()} onDrop={event => {
                            event.preventDefault(); if (ready && !busy) importFiles(kind, Array.from(event.dataTransfer.files));
                        }}>
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-medium capitalize">{kind === 'image' ? 'Pictures' : `${kind}s`} <span className="ml-1 text-xs text-text-secondary">{count(kind)}/{REFERENCE_LIMITS[kind]}</span></h4>
                                <label className={`${button} !py-1.5 !text-xs ${!ready || busy || count(kind) >= REFERENCE_LIMITS[kind] ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
                                    + Add {kind}<input aria-label={`Upload ${kind} references`} type="file" className="sr-only" accept={`${kind}/*`} multiple disabled={!ready || busy || count(kind) >= REFERENCE_LIMITS[kind]} onChange={event => {
                                        importFiles(kind, Array.from(event.target.files || [])); event.target.value = '';
                                    }} />
                                </label>
                            </div>
                            {count(kind) ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{draft.references.filter(ref => ref.kind === kind).map(ref =>
                                <div key={ref.id} className={ref.kind === 'audio' ? 'sm:col-span-2' : ''}><ReferenceCard reference={ref} disabled={busy || !ready} onEdit={() => setEditing(ref)} onNote={note => changeReference(ref.id, { note })} onInsert={() => insertToken(ref)}
                                    onRemove={() => {
                                        const token = referenceToken(ref);
                                        if ((draft.idea.includes(token) || draft.result.includes(token)) && !window.confirm(`${token} is mentioned in your idea or output. Remove it anyway? Update those references before generating again.`)) return;
                                        update({ references: draft.references.filter(item => item.id !== ref.id) });
                                    }}
                                    onReset={() => changeReference(ref.id, { file: ref.original, audioSelection: undefined })} />
                                    {ref.kind === 'audio' && <fieldset disabled={!ready || busy}>
                                        <H3AudioReference reference={ref} videoDuration={draft.duration} target="prompt"
                                            onPendingChange={pending => setPendingAudio(current => current[ref.id] === pending ? current : { ...current, [ref.id]: pending })}
                                            onApply={(file, audioSelection) => {
                                                setError('');
                                                setDraft(current => ({ ...current, duration: audioSelection.end - audioSelection.start,
                                                    references: current.references.map(item => item.id === ref.id ? { ...item, file, audioSelection } : item) }));
                                                setNotice(`${referenceToken(ref)}: only ${audioSelection.start.toFixed(3)} - ${audioSelection.end.toFixed(3)} s will be sent. The full original stays local. Generate the prompt for this passage before transferring.`);
                                            }} />
                                        <AudioLyricsEditor reference={ref} provider={draft.provider} model={draft.models[draft.provider]} passagePending={!!pendingAudio[ref.id]} requireAppliedPassage={draft.forceOriginalAudio && draft.originalAudioId === ref.id} onChange={lyrics => changeReference(ref.id, { lyrics })} />
                                    </fieldset>}
                                </div>)}</div>
                                : <div className="rounded-xl border border-dashed border-border-primary p-5 text-center text-xs text-text-secondary">Drop {kind} files here or use Add {kind}.</div>}
                        </div>)}
                        <p className="text-xs text-text-secondary">Generation sends your idea, selected template, reference notes and edited media to the chosen provider. Maximum 18 MB total media per request; originals stay local. Provider usage may be billed.</p>
                        {hasPendingAudio && <p role="alert" className="text-xs text-amber-300">Apply the audio selection first. Only an applied excerpt will be sent, not an older/full track.</p>}
                        <button type="button" className={`${button} w-full border-accent bg-accent/15 !py-3 text-accent`} disabled={!ready || busy || librarySaving || hasPendingAudio || !draft.idea.trim() || openRouterModelBlocked} onClick={generate}>{busy ? 'Composing your video prompt...' : 'Generate video prompt'}</button>
                        <p className="text-xs text-text-secondary">Successful generations are automatically saved to Library &gt; Prompts with the exact generation setup and all references.</p>
                    </section>
                </div>
                <section className={`${panel} min-w-0 self-start xl:sticky xl:top-16`}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Production prompt</h3>
                        <button type="button" className={`${button} !py-1 !text-xs`} disabled={!draft.result || busy} onClick={() => setEditOutput(value => !value)}>{editOutput ? 'Color preview' : 'Edit text'}</button>
                    </div>
                    {!draft.result ? <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-primary p-6 text-center">
                        <span className="text-3xl text-accent">[ Shot 1 ]</span><p className="text-sm text-text-secondary">Your shot plan, soundscape and music will appear here with colored reference tokens.</p>
                    </div> : editOutput
                        ? <textarea aria-label="Generated video prompt" className={`${input} min-h-96 font-mono`} disabled={busy} value={draft.result} onChange={event => { update({ result: event.target.value }); setLibrarySaved(false); }} />
                        : <div className="max-h-[65vh] overflow-y-auto rounded-xl bg-bg-primary p-4"><ColoredPrompt text={draft.result} /></div>}
                    <div className="my-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={!draft.result} onClick={() => copy(draft.result)}>Copy</button><button type="button" className={button} disabled={!draft.result} onClick={() => download(draft.result, 'video-prompt.txt')}>Export .txt</button></div>
                    <div className="mb-4 space-y-2">
                        <button type="button" className={`${button} border-sky-400/50 text-sky-300`} disabled={!draft.result || busy || librarySaving || !ready} onClick={saveCurrentPrompt}>{librarySaving ? 'Saving to Library...' : librarySaved ? 'Saved to Library · Save another copy' : 'Save to Library'}</button>
                        <p className="text-xs text-text-secondary">Includes originals and edited media, reference roles, idea, model and editable canvases. Edits to the output can be saved as a new Library item. Older prompts without a generation snapshot save the current setup.</p>
                    </div>
                    <div className="space-y-3 border-t border-border-primary pt-4">
                        <label className="block space-y-1 text-sm">Send prompt to workflow<select className={input} disabled={busy || !ready} value={draft.workflow} onChange={event => update({ workflow: event.target.value === 'advanced' ? 'advanced' : event.target.value === 'ultrafast' ? 'ultrafast' : 'reference' })}>{VIDEO_WORKFLOWS.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
                        <button type="button" className={`${button} w-full ${draft.workflow === 'advanced' ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : draft.workflow === 'ultrafast' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-violet-400/50 bg-violet-400/10 text-violet-300'}`} disabled={!draft.result || busy || !ready || hasPendingAudio} onClick={transfer}>Send to {h3WorkflowName(draft.workflow === 'advanced' || draft.workflow === 'ultrafast' ? draft.workflow : 'reference')}</button>
                        <p className="text-xs text-text-secondary">Copies the prompt, optional references, aspect ratio, duration and soundtrack selection. Each workflow keeps its own draft and settings. In Advanced, select REF2V for multimodal references or FL2V for first/last frames.</p>
                    </div>
                </section>
            </div>
        </React.Activity>
        <React.Activity mode={tab === 'minimax' ? 'visible' : 'hidden'}>
                    <MinimaxH3Panel
                        draft={draft.minimaxDrafts.reference}
                        onDraftChange={reference => setDraft(current => ({ ...current, minimaxDrafts: { ...current.minimaxDrafts, reference } }))}
                        options={draft.minimaxH3Options}
                        onOptionsChange={options => setDraft(current => ({ ...current, minimaxH3Options: options }))}
                        ready={ready}
                        lyricsProvider={draft.minimaxLyricsSettings?.provider ?? 'openrouter'}
                        lyricsModel={draft.minimaxLyricsSettings?.model ?? DEFAULT_OPENROUTER_MODEL}
                        onLyricsSettingsChange={(provider, model) => update({ minimaxLyricsSettings: { provider, model: model ?? (provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : 'gemini-2.5-flash') } })}
                        onClearDraft={() => { const next = { ...draft.minimaxDrafts }; delete next.reference; update({ minimaxDrafts: next }); }}
                        onStartFromScratch={() => {
                            if (libraryItem && libraryWorkflow === 'reference') onLibraryItemLoaded();
                            setError('');
                            setNotice('');
                            setDraft(current => {
                                const minimaxDrafts = { ...current.minimaxDrafts };
                                delete minimaxDrafts.reference;
                                return { ...current, minimaxDrafts, minimaxH3Options: defaultMinimaxH3Options(), minimaxLyricsSettings: undefined };
                            });
                        }}
                    />
        </React.Activity>
        <React.Activity mode={tab === 'ultrafast' ? 'visible' : 'hidden'}>
            <MinimaxH3Panel variant="ultrafast"
                draft={draft.minimaxDrafts.ultrafast}
                onDraftChange={ultrafast => setDraft(current => ({ ...current, minimaxDrafts: { ...current.minimaxDrafts, ultrafast } }))}
                options={draft.ultrafastH3Options}
                onOptionsChange={options => setDraft(current => ({ ...current, ultrafastH3Options: options }))}
                ready={ready}
                lyricsProvider={draft.ultrafastLyricsSettings?.provider ?? 'openrouter'}
                lyricsModel={draft.ultrafastLyricsSettings?.model ?? DEFAULT_OPENROUTER_MODEL}
                onLyricsSettingsChange={(provider, model) => update({ ultrafastLyricsSettings: { provider, model: model ?? (provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : 'gemini-2.5-flash') } })}
                onClearDraft={() => setDraft(current => {
                    const minimaxDrafts = { ...current.minimaxDrafts }; delete minimaxDrafts.ultrafast;
                    return { ...current, minimaxDrafts };
                })}
                onStartFromScratch={() => {
                    if (libraryItem && libraryWorkflow === 'ultrafast') onLibraryItemLoaded();
                    setError(''); setNotice('');
                    setDraft(current => {
                        const minimaxDrafts = { ...current.minimaxDrafts }; delete minimaxDrafts.ultrafast;
                        return { ...current, minimaxDrafts, ultrafastH3Options: defaultUltrafastH3Options(), ultrafastLyricsSettings: undefined };
                    });
                }}
            />
        </React.Activity>
        <React.Activity mode={tab === 'advanced' ? 'visible' : 'hidden'}>
            <MinimaxH3Panel variant="advanced"
                draft={draft.minimaxDrafts.advanced}
                onDraftChange={advanced => setDraft(current => ({ ...current, minimaxDrafts: { ...current.minimaxDrafts, advanced } }))}
                options={draft.advancedH3Options}
                onOptionsChange={options => setDraft(current => ({ ...current, advancedH3Options: options }))}
                ready={ready}
                lyricsProvider={draft.advancedLyricsSettings?.provider ?? 'openrouter'}
                lyricsModel={draft.advancedLyricsSettings?.model ?? DEFAULT_OPENROUTER_MODEL}
                onLyricsSettingsChange={(provider, model) => update({ advancedLyricsSettings: { provider, model: model ?? (provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : 'gemini-2.5-flash') } })}
                onClearDraft={() => setDraft(current => {
                    const minimaxDrafts = { ...current.minimaxDrafts }; delete minimaxDrafts.advanced;
                    return { ...current, minimaxDrafts };
                })}
                onStartFromScratch={() => {
                    if (libraryItem && libraryWorkflow === 'advanced') onLibraryItemLoaded();
                    setError(''); setNotice('');
                    setDraft(current => {
                        const minimaxDrafts = { ...current.minimaxDrafts }; delete minimaxDrafts.advanced;
                        return { ...current, minimaxDrafts, advancedH3Options: defaultH3WorkflowOptions('advanced'), advancedLyricsSettings: undefined };
                    });
                }}
            />
        </React.Activity>
        {editing && <VideoReferenceEditor key={editing.id} reference={editing} onClose={() => setEditing(null)} onSave={file => { changeReference(editing.id, { file }); setEditing(null); }} />}
    </div>;
};
