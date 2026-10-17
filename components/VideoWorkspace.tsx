import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import {
    DEFAULT_VIDEO_TEMPLATES, REFERENCE_LIMITS, VIDEO_WORKFLOWS, VIDEO_PROMPT_ASPECTS, generateVideoPrompt, addVideoReferences,
    loadVideoPromptDraft, saveVideoPromptDraft, referenceToken, validateVideoPromptOutput, validateVideoReferences,
    captureVideoPromptInputs, type ReferenceKind, type VideoPromptDraft, type VideoPromptInputs, type VideoPromptProvider, type VideoReference, type VideoTemplate, type VideoWorkflow,
} from '../services/videoPromptService';
import { DEFAULT_OPENROUTER_MODEL, filterOpenRouterModels, getOpenRouterInputModalities, getOpenRouterModels, type OpenRouterModel } from '../services/openRouterService';
import { VideoReferenceEditor, useMediaURL } from './VideoReferenceEditor';
import { buildVideoPromptLibraryItem, restoreVideoPromptLibraryItem } from '../services/videoPromptLibrary';
import { MinimaxH3Panel } from './MinimaxH3Panel';
import { defaultMinimaxH3Options, h3AspectFromPrompt } from '../services/minimaxH3Workflow';

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-primary px-3 py-2 text-sm font-medium transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40';
const input = 'w-full rounded-lg border border-border-primary bg-bg-primary p-2.5 text-sm text-text-primary focus:border-accent focus:outline-none';
const panel = 'rounded-2xl border border-border-primary bg-bg-secondary p-4 md:p-5';
const colors: Record<string, string[]> = {
    Picture: ['border-sky-400/50 bg-sky-400/10 text-sky-300', 'border-teal-400/50 bg-teal-400/10 text-teal-300', 'border-pink-400/50 bg-pink-400/10 text-pink-300', 'border-lime-400/50 bg-lime-400/10 text-lime-300'],
    Video: ['border-violet-400/50 bg-violet-400/10 text-violet-300', 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300'],
    Audio: ['border-amber-400/50 bg-amber-400/10 text-amber-300', 'border-orange-400/50 bg-orange-400/10 text-orange-300'],
    Subject: ['border-emerald-400/50 bg-emerald-400/10 text-emerald-300', 'border-green-400/50 bg-green-400/10 text-green-300'],
};
const tokenClass = (text: string) => {
    const kind = text.match(/Picture|Video|Audio|Subject/)?.[0] || 'Subject';
    const slot = Number(text.match(/\d+/)?.[0] || 1);
    return colors[kind][(slot - 1) % colors[kind].length];
};
const Token: React.FC<{ text: string }> = ({ text }) => <span className={`inline rounded border px-1 py-0.5 font-mono text-xs ${tokenClass(text)}`}>{text}</span>;
const ColoredPrompt: React.FC<{ text: string }> = ({ text }) => <div className="whitespace-pre-wrap break-words font-mono text-sm leading-7">
    {text.split(/(<(?:Picture|Video|Audio|Subject)\s+\d+>)/g).map((part, index) =>
        /^<(?:Picture|Video|Audio|Subject)\s+\d+>$/.test(part) ? <Token key={index} text={part} /> : <React.Fragment key={index}>{part}</React.Fragment>)}
</div>;
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
                    : <audio src={url} controls preload="metadata" className="w-full px-2" />)}
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
    onLibraryItemLoaded: () => void;
}> = ({ director, openDirector, onLeaveDirector, onResetDirector, libraryItem, onLibraryItemLoaded }) => {
    const dispatch: AppDispatch = useDispatch();
    const [tab, setTab] = useState<'prompt' | 'ltx' | 'minimax'>('prompt');
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
    const [selectedWorkflow, setSelectedWorkflow] = useState<VideoWorkflow>('reference');
    const [editOutput, setEditOutput] = useState(false);
    const [librarySaving, setLibrarySaving] = useState(false);
    const [librarySaved, setLibrarySaved] = useState(false);
    const ideaRef = useRef<HTMLTextAreaElement>(null);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const loaded = useRef(false);
    const persistenceVersion = useRef(0);

    useEffect(() => { if (openDirector) setTab('ltx'); }, [openDirector]);
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        loadVideoPromptDraft().then(value => {
            if (value) setDraft(value);
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
        saveQueue.current = saveQueue.current.then(async () => {
            if (version !== persistenceVersion.current) return;
            await saveVideoPromptDraft(draft);
            if (version === persistenceVersion.current) { setSaved(true); setStorageError(''); }
        }).catch(cause => {
            setStorageError(`Draft could not be saved: ${cause instanceof Error ? cause.message : String(cause)}`);
        });
    }, [draft, ready]);

    useEffect(() => {
        if (!libraryItem || !ready || busy || librarySaving) return;
        let cancelled = false;
        restoreVideoPromptLibraryItem(libraryItem).then(({ inputs, result }) => {
            if (cancelled) return;
            setDraft(current => ({ ...current, ...inputs, result, generatedInputs: captureVideoPromptInputs(inputs), generatedInputsProvenance: libraryItem.videoPromptOptions!.provenance }));
            setTab('prompt');
            setEditOutput(false);
            setLibrarySaved(true);
            setError('');
            setNotice('Video prompt restored from Library with its settings and original/edited references.');
            onLibraryItemLoaded();
        }).catch(cause => {
            if (cancelled) return;
            setError(`Could not restore Library prompt: ${cause instanceof Error ? cause.message : String(cause)}`);
            onLibraryItemLoaded();
        });
        return () => { cancelled = true; };
    }, [libraryItem, ready, busy, librarySaving, onLibraryItemLoaded]);

    const update = (patch: Partial<VideoPromptDraft>) => setDraft(current => ({ ...current, ...patch }));
    const chooseTab = (next: typeof tab) => { setTab(next); if (next !== 'ltx' && openDirector) onLeaveDirector(); };
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
            setLibrarySaved(true);
            setNotice('Saved to Library > Prompts with the idea, provider/model, templates, settings and all original/edited references.');
        } finally { setLibrarySaving(false); }
    };
    const generate = async () => {
        setError(''); setNotice(''); setBusy(true); setLibrarySaved(false);
        try {
            const inputs = captureVideoPromptInputs(draft);
            const result = await generateVideoPrompt(draft);
            update({ result, generatedInputs: inputs, generatedInputsProvenance: 'generation' });
            setEditOutput(false);
            try { await savePromptToLibrary(result, inputs, true); }
            catch (cause) { setError(`Prompt generated, but Library saving failed: ${cause instanceof Error ? cause.message : String(cause)}. Use Save to Library to retry.`); }
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setBusy(false); }
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
            if (draft.workflow === 'replacement' && (!draft.references.some(ref => ref.kind === 'image') || !draft.references.some(ref => ref.kind === 'video'))) {
                throw new Error('Character replacement needs one video and at least one character picture.');
            }
            const previous = draft.minimaxDrafts[draft.workflow];
            if (previous && !window.confirm('Replace the existing draft for this Minimax workflow?')) return;
            update({ minimaxDrafts: { ...draft.minimaxDrafts, [draft.workflow]: {
                id: crypto.randomUUID(), workflow: draft.workflow, prompt,
                references: draft.references.map(ref => ({ ...ref })), aspect: draft.aspect, duration: draft.duration, template: draft.template,
            } }, ...(draft.workflow === 'reference' ? { minimaxH3Options: {
                ...(draft.minimaxH3Options || defaultMinimaxH3Options()), aspect: h3AspectFromPrompt(draft.aspect), duration: draft.duration,
            } } : {}) });
            setSelectedWorkflow(draft.workflow);
            chooseTab('minimax');
            setNotice('Prompt and edited references transferred to the Minimax H3 workflow draft.');
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
    const activeMinimax = draft.minimaxDrafts[selectedWorkflow];
    const count = (kind: ReferenceKind) => draft.references.filter(ref => ref.kind === kind).length;
    const selectedModel = models.find(model => model.id === draft.models.openrouter);
    const requiredInputs = [...new Set<ReferenceKind>(draft.references.map((reference: VideoReference) => reference.kind))];
    const compatibleModels = filterOpenRouterModels(models, requiredInputs);
    const filteredModels = filterOpenRouterModels(compatibleModels, [], modelSearch);
    const unsupportedInputs = selectedModel ? requiredInputs.filter(kind => !getOpenRouterInputModalities(selectedModel).includes(kind)) : [];
    const openRouterModelBlocked = draft.provider === 'openrouter' && (loadingModels || !selectedModel || unsupportedInputs.length > 0);

    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="Video tools">
                {([{ id: 'prompt', label: 'Video Prompt Generator' }, { id: 'ltx', label: 'LTX Director' }, { id: 'minimax', label: 'Minimax H3' }] as const).map(item =>
                    <button key={item.id} type="button" onClick={() => chooseTab(item.id)} aria-pressed={tab === item.id} className={`${button} ${tab === item.id ? 'border-accent bg-accent/15 text-accent' : 'text-text-secondary'}`}>{item.label}</button>)}
            </nav>
            <span role="status" className="text-xs text-text-secondary">{!ready ? 'Loading saved workspace...' : saved ? 'Saved locally · media included' : 'Saving workspace...'}</span>
        </div>
        {storageError && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{storageError}
            {ready && <button type="button" className={`${button} ml-3`} onClick={() => setDraft(current => ({ ...current }))}>Retry saving</button>}
        </div>}
        {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-300">{notice}</p>}

        <React.Activity mode={tab === 'ltx' ? 'visible' : 'hidden'}>
            {!openDirector && <div className="mb-3 flex justify-end"><button type="button" className={`${button} text-red-300`} onClick={onResetDirector}>Reset LTX Director</button></div>}
            {director}
        </React.Activity>
        <React.Activity mode={tab === 'prompt' ? 'visible' : 'hidden'}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,1fr)]">
                <div className="min-w-0 space-y-4">
                    <section className={`${panel} bg-gradient-to-br from-sky-400/10 via-bg-secondary to-violet-400/10`}>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div><p className="mb-1 text-xs uppercase tracking-widest text-accent">Minimax H3 · Creative workspace</p><h2 className="text-xl font-bold">Video Prompt Generator</h2><p className="mt-1 text-sm text-text-secondary">Your idea, references and sound, composed into one production-ready prompt.</p></div>
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
                                        {filteredModels.map(model => <option key={model.id} value={model.id}>{model.name} [{getOpenRouterInputModalities(model).join(' + ')}] ({model.id})</option>)}
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
                                <ReferenceCard key={ref.id} reference={ref} disabled={busy || !ready} onEdit={() => setEditing(ref)} onNote={note => changeReference(ref.id, { note })} onInsert={() => insertToken(ref)}
                                    onRemove={() => {
                                        const token = referenceToken(ref);
                                        if ((draft.idea.includes(token) || draft.result.includes(token)) && !window.confirm(`${token} is mentioned in your idea or output. Remove it anyway? Update those references before generating again.`)) return;
                                        update({ references: draft.references.filter(item => item.id !== ref.id) });
                                    }}
                                    onReset={() => changeReference(ref.id, { file: ref.original })} />)}</div>
                                : <div className="rounded-xl border border-dashed border-border-primary p-5 text-center text-xs text-text-secondary">Drop {kind} files here or use Add {kind}.</div>}
                        </div>)}
                        <p className="text-xs text-text-secondary">Generation sends your idea, selected template, reference notes and edited media to the chosen provider. Maximum 18 MB total media per request; originals stay local. Provider usage may be billed.</p>
                        <button type="button" className={`${button} w-full border-accent bg-accent/15 !py-3 text-accent`} disabled={!ready || busy || librarySaving || !draft.idea.trim() || openRouterModelBlocked} onClick={generate}>{busy ? 'Composing and saving your video prompt...' : 'Generate video prompt'}</button>
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
                        ? <textarea aria-label="Generated video prompt" className={`${input} min-h-96 font-mono`} disabled={busy || librarySaving} value={draft.result} onChange={event => { update({ result: event.target.value }); setLibrarySaved(false); }} />
                        : <div className="max-h-[65vh] overflow-y-auto rounded-xl bg-bg-primary p-4"><ColoredPrompt text={draft.result} /></div>}
                    <div className="my-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={!draft.result} onClick={() => copy(draft.result)}>Copy</button><button type="button" className={button} disabled={!draft.result} onClick={() => download(draft.result, 'video-prompt.txt')}>Export .txt</button></div>
                    <div className="mb-4 space-y-2">
                        <button type="button" className={`${button} border-sky-400/50 text-sky-300`} disabled={!draft.result || busy || librarySaving || !ready} onClick={saveCurrentPrompt}>{librarySaving ? 'Saving to Library...' : librarySaved ? 'Saved to Library · Save another copy' : 'Save to Library'}</button>
                        <p className="text-xs text-text-secondary">Includes originals and edited media, reference roles, idea, model and editable canvases. Edits to the output can be saved as a new Library item. Older prompts without a generation snapshot save the current setup.</p>
                    </div>
                    <div className="space-y-3 border-t border-border-primary pt-4">
                        <label className="block space-y-1 text-sm">Minimax H3 destination<select className={input} disabled={busy || !ready} value={draft.workflow} onChange={event => update({ workflow: event.target.value as VideoWorkflow })}>{VIDEO_WORKFLOWS.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
                        <button type="button" className={`${button} w-full border-violet-400/50 bg-violet-400/10 text-violet-300`} disabled={!draft.result || busy || !ready} onClick={transfer}>Send to Minimax H3 draft</button>
                        <p className="text-xs text-text-secondary">Reference to video opens the connected H3 REF2V workflow with your prompt, edited references, aspect ratio and duration. Other workflow slots remain in preparation. No new LTX prompt link yet.</p>
                    </div>
                </section>
            </div>
        </React.Activity>
        <React.Activity mode={tab === 'minimax' ? 'visible' : 'hidden'}>
            <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
                <aside className={`${panel} space-y-3`}>
                    <div><h2 className="text-xl font-bold">Minimax H3</h2><p className="mt-1 text-xs text-text-secondary">REF2V connected · more workflows soon</p></div>
                    {VIDEO_WORKFLOWS.map(workflow => <button type="button" key={workflow.id} onClick={() => setSelectedWorkflow(workflow.id)} aria-pressed={selectedWorkflow === workflow.id} className={`w-full rounded-xl border p-3 text-left ${selectedWorkflow === workflow.id ? 'border-violet-400 bg-violet-400/10' : 'border-border-primary'}`}>
                        <span className="text-sm font-semibold">{workflow.name}{draft.minimaxDrafts[workflow.id] ? ' · Draft' : ''}</span><span className="mt-1 block text-xs text-text-secondary">{workflow.description}</span>
                    </button>)}
                </aside>
                <div className="min-w-0">
                <React.Activity mode={selectedWorkflow === 'reference' ? 'visible' : 'hidden'}>
                    <MinimaxH3Panel
                        draft={draft.minimaxDrafts.reference}
                        onDraftChange={reference => update({ minimaxDrafts: { ...draft.minimaxDrafts, reference } })}
                        options={draft.minimaxH3Options}
                        onOptionsChange={minimaxH3Options => update({ minimaxH3Options })}
                        ready={ready}
                        onOpenPromptGenerator={() => {
                            if (busy || librarySaving) throw new Error('Wait for the prompt generator or Library save to finish first.');
                            const reference = draft.minimaxDrafts.reference;
                            if (reference) {
                                if (reference.references.some(ref => ref.slot > REFERENCE_LIMITS[ref.kind])) throw new Error('The prompt generator supports Picture 1-4, Video 1-2 and Audio 1-2. Remove higher reference slots before reopening this draft there.');
                                validateVideoReferences(reference.references);
                                if ((draft.minimaxH3Options?.duration ?? reference.duration) < 1) throw new Error('The prompt generator requires at least one second. Increase the H3 duration before reopening this draft there.');
                                if (!window.confirm('Load this REF2V draft into the prompt generator? This replaces its current idea, references and output.')) return;
                                update({
                                    result: reference.prompt, idea: reference.prompt, references: reference.references.map(ref => ({ ...ref })), workflow: 'reference',
                                    aspect: draft.minimaxH3Options?.aspect.split(' ')[0] || reference.aspect,
                                    duration: draft.minimaxH3Options?.duration ?? reference.duration, template: reference.template,
                                    generatedInputs: undefined, generatedInputsProvenance: undefined,
                                });
                                setLibrarySaved(false);
                            } else update({ workflow: 'reference' });
                            chooseTab('prompt');
                        }}
                        onClearDraft={() => { const next = { ...draft.minimaxDrafts }; delete next.reference; update({ minimaxDrafts: next }); }}
                    />
                </React.Activity>
                {selectedWorkflow !== 'reference' && <section className={`${panel} min-w-0 space-y-4`}>
                    <h3 className="font-semibold">{VIDEO_WORKFLOWS.find(workflow => workflow.id === selectedWorkflow)?.name}</h3>
                    <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">This additional workflow is still in preparation. The supplied REF2V workflow is available under Reference to video.</p>
                    {activeMinimax ? <>
                        <p className="text-sm text-text-secondary">{activeMinimax.aspect} · {activeMinimax.duration}s · {activeMinimax.references.length} references</p>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{activeMinimax.references.map(ref => <MinimaxReference key={ref.id} reference={ref} />)}</div>
                        <div className="max-h-[55vh] overflow-y-auto rounded-xl bg-bg-primary p-4"><ColoredPrompt text={activeMinimax.prompt} /></div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={button} onClick={() => copy(activeMinimax.prompt)}>Copy prompt</button>
                            <button type="button" className={button} onClick={() => download(activeMinimax.prompt, `minimax-h3-${selectedWorkflow}.txt`)}>Export .txt</button>
                            <button type="button" disabled={busy || librarySaving} className={button} onClick={() => {
                                if (!window.confirm('Load this workflow draft into the prompt generator? This replaces its current idea, references and output.')) return;
                                update({ references: activeMinimax.references.map(ref => ({ ...ref })), result: activeMinimax.prompt, idea: activeMinimax.prompt, generatedInputs: undefined, generatedInputsProvenance: undefined,
                                    aspect: activeMinimax.aspect, duration: activeMinimax.duration, workflow: activeMinimax.workflow,
                                    template: activeMinimax.template });
                                setLibrarySaved(false);
                                chooseTab('prompt');
                            }}>Edit in prompt generator</button>
                            <button type="button" disabled={busy} className={`${button} text-red-300`} onClick={() => {
                                if (!window.confirm('Delete this Minimax workflow draft?')) return;
                                const next = { ...draft.minimaxDrafts }; delete next[selectedWorkflow]; update({ minimaxDrafts: next });
                            }}>Delete draft</button>
                        </div>
                    </> : <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-sm text-text-secondary">No draft yet. Generate a prompt, choose this workflow and send it here.<div className="mt-4"><button type="button" disabled={!ready || busy} className={button} onClick={() => { update({ workflow: selectedWorkflow, template: selectedWorkflow === 'replacement' ? 'replacement' : 'generation' }); chooseTab('prompt'); }}>Prepare this workflow</button></div></div>}
                </section>}
                </div>
            </div>
        </React.Activity>
        {editing && <VideoReferenceEditor key={editing.id} reference={editing} onClose={() => setEditing(null)} onSave={file => { changeReference(editing.id, { file }); setEditing(null); }} />}
    </div>;
};

const MinimaxReference: React.FC<{ reference: VideoReference }> = ({ reference }) => {
    const url = useMediaURL(reference.file);
    return <div className="space-y-2 rounded-xl border border-border-primary bg-bg-primary p-2">
        <Token text={referenceToken(reference)} />
        {url && (reference.kind === 'image' ? <img src={url} alt={referenceToken(reference)} className="h-32 w-full object-contain" />
            : reference.kind === 'video' ? <video src={url} controls preload="metadata" className="h-32 w-full" />
                : <audio src={url} controls className="w-full" />)}
        <p className="truncate text-xs text-text-secondary" title={reference.file.name}>{reference.file.name}</p>
        {reference.note && <p className="text-xs text-text-secondary">{reference.note}</p>}
    </div>;
};
