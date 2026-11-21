import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { queueLtxTransfer } from '../store/appSlice';
import { fileToDataUrl } from '../utils/imageUtils';
import { readLibraryMediaFile } from '../services/libraryMediaService';
import { LibraryPickerModal } from './LibraryPickerModal';
import {
    DEFAULT_VIDEO_TEMPLATES, DEFAULT_LTX_VIDEO_TEMPLATES, REFERENCE_LIMITS, VIDEO_WORKFLOWS, VIDEO_PROMPT_ASPECTS, generateVideoPrompt, addVideoReferences,
    videoPromptFamily, videoPromptMode, videoPromptTemplates, ltxVideoPromptText, type VideoPromptFamily, type VideoPromptMode,
    loadVideoPromptDraft, saveVideoPromptDraft, referenceToken, validateVideoPromptOutput,
    captureVideoPromptInputs, type ReferenceKind, type VideoPromptDraft, type VideoPromptInputs, type VideoPromptProvider, type VideoReference, type VideoTemplate,
} from '../services/videoPromptService';
import { DEFAULT_OPENROUTER_MODEL, filterOpenRouterModels, getOpenRouterInputModalities, getOpenRouterModels, type OpenRouterModel } from '../services/openRouterService';
import { VideoReferenceEditor, useMediaURL } from './VideoReferenceEditor';
import { buildVideoPromptLibraryItem, restoreMinimaxH3PromptLibraryItem } from '../services/videoPromptLibrary';
import { MinimaxH3Panel } from './MinimaxH3Panel';
import { LTXAudioSyncPanel } from './LTXAudioSyncPanel';
import { LTXRipplePanel } from './LTXRipplePanel';
import { transferAudioSyncPrompt } from '../services/ltxAudioSyncWorkflow';
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
import { VideoPromptStyleControl } from './VideoPromptStyleControl';
import { useModelInventory } from './useModelInventory';
import { localStylePromptExamples } from '../services/modelPromptExamples';
import { h3StyleLoraRemovals } from '../services/h3StyleWorkflow';
import { NumberField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { ui } from './ui/styles';

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border-primary px-3 py-2 text-sm font-medium transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40';
const input = `block ${ui.control}`;
const panel = 'rounded-2xl border border-border-primary bg-bg-secondary p-4 md:p-5';
const videoToolGroups = {
    ltx: [
        { id: 'ltx', label: 'LTX Director' },
        { id: 'ltx-ripple-ffaf', label: 'LTX-Ripple-FFAF' },
        { id: 'ltx-audio-sync', label: 'LTX 2.5 Audio-Sync' },
    ],
    h3: [
        { id: 'minimax', label: 'Minimax REF2v H3' },
        { id: 'ultrafast', label: 'Ultrafast' },
        { id: 'advanced', label: 'MiniMax Advanced' },
        { id: 'character-swap', label: 'Character Swap H3' },
    ],
} as const;
const initialDraft = (): VideoPromptDraft => ({
    targetFamily: 'h3', promptMode: 't2v', ltxTemplates: { ...DEFAULT_LTX_VIDEO_TEMPLATES },
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
            <button type="button" aria-label={`Remove ${referenceToken(reference)}`} disabled={disabled} onClick={onRemove} className="rounded px-2 text-text-secondary hover:text-danger">X</button>
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
    libraryWorkflow?: H3RenderWorkflow | 'ltx-audio-sync' | 'ltx-ripple-ffaf';
    libraryFinishing?: AdvancedVideoFinishing;
    onLibraryItemLoaded: () => void;
}> = ({ director, openDirector, onLeaveDirector, onResetDirector, libraryItem, libraryWorkflow: requestedWorkflow, libraryFinishing, onLibraryItemLoaded }) => {
    const dispatch: AppDispatch = useDispatch();
    const { inventory: styleInventory } = useModelInventory();
    const libraryWorkflow = requestedWorkflow ?? 'reference';
    const [tab, setTab] = useState<'prompt' | 'ltx' | 'ltx-audio-sync' | 'ltx-ripple-ffaf' | 'minimax' | 'ultrafast' | 'advanced' | 'character-swap'>('prompt');
    const [rippleOpened, setRippleOpened] = useState(false);
    const [audioSyncOpened, setAudioSyncOpened] = useState(false);
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
    const [referencePicker, setReferencePicker] = useState<ReferenceKind | null>(null);
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelError, setModelError] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [modelRefresh, setModelRefresh] = useState(0);
    const [editOutput, setEditOutput] = useState(false);
    const [librarySaving, setLibrarySaving] = useState(false);
    const [librarySaved, setLibrarySaved] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [pendingAudio, setPendingAudio] = useState<Record<string, boolean>>({});
    const hasPendingAudio = draft.references.some(ref => ref.kind === 'audio' && pendingAudio[ref.id]);
    const ideaRef = useRef<HTMLTextAreaElement>(null);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const loaded = useRef(false);
    const persistenceVersion = useRef(0);
    const latestDraft = useRef(draft);
    latestDraft.current = draft;
    const lastLtxTab = useRef<(typeof videoToolGroups.ltx)[number]['id']>('ltx');
    const lastH3Tab = useRef<(typeof videoToolGroups.h3)[number]['id']>('minimax');
    const group = tab === 'prompt' ? 'prompt' : tab === 'ltx' || tab.startsWith('ltx-') ? 'ltx' : 'h3';
    useEffect(() => {
        const ltx = videoToolGroups.ltx.find(item => item.id === tab);
        const h3 = videoToolGroups.h3.find(item => item.id === tab);
        if (ltx) lastLtxTab.current = ltx.id;
        if (h3) lastH3Tab.current = h3.id;
    }, [tab]);

    useEffect(() => { if (openDirector) setTab('ltx'); }, [openDirector]);
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        loadVideoPromptDraft().then(value => {
            if (value) setDraft({ ...value, workflow: VIDEO_WORKFLOWS.some(workflow => workflow.id === value.workflow) ? value.workflow : 'reference', minimaxLyricsSettings: value.minimaxLyricsSettings ?? { provider: value.provider, model: value.models[value.provider] } });
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
        if (!libraryItem || libraryWorkflow === 'ltx-audio-sync' || libraryWorkflow === 'ltx-ripple-ffaf') return;
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
                style: options.style ? structuredClone(options.style) : undefined, styleStrength: options.styleStrength,
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

    useEffect(() => {
        if (!libraryItem || libraryWorkflow !== 'ltx-audio-sync') return;
        setAudioSyncOpened(true); setTab('ltx-audio-sync');
        if (openDirector) onLeaveDirector();
        if (!ready || libraryItem.ltxAudioSyncOptions) return;
        let cancelled = false;
        restoreMinimaxH3PromptLibraryItem(libraryItem, getLibraryAssetBlob).then(({ draft: reference }) => {
            if (cancelled) return;
            if (latestDraft.current.audioSyncDraft && !window.confirm('Replace the LTX Audio-Sync draft with this saved prompt and its references? Models will be kept and Qwen enhancement switched off.')) return;
            const transferred = transferAudioSyncPrompt({ ...latestDraft.current, result: reference.prompt, references: reference.references,
                aspect: reference.aspect, duration: reference.duration, template: reference.template });
            setDraft(current => ({ ...current, audioSyncDraft: transferred.draft, audioSyncSettings: transferred.settings }));
            setNotice(transferred.notice);
        }).catch(cause => { if (!cancelled) setError(`Could not restore Audio-Sync prompt: ${cause instanceof Error ? cause.message : String(cause)}`); })
            .finally(() => { if (!cancelled) onLibraryItemLoaded(); });
        return () => { cancelled = true; };
    }, [libraryItem, libraryWorkflow, ready, openDirector, onLeaveDirector, onLibraryItemLoaded]);

    useEffect(() => {
        if (!libraryItem || libraryWorkflow !== 'ltx-ripple-ffaf') return;
        setRippleOpened(true); setTab('ltx-ripple-ffaf');
        if (openDirector) onLeaveDirector();
    }, [libraryItem, libraryWorkflow, openDirector, onLeaveDirector]);

    const update = (patch: Partial<VideoPromptDraft>) => setDraft(current => ({ ...current, ...patch }));
    const family = videoPromptFamily(draft);
    const mode = videoPromptMode(draft);
    const templates = videoPromptTemplates(draft);
    const destinations = VIDEO_WORKFLOWS.filter(workflow => (workflow.id.startsWith('ltx-') ? 'ltx' : 'h3') === family
        && (family !== 'ltx' || (mode === 'v2v' ? workflow.id === 'ltx-ripple-ffaf' : workflow.id !== 'ltx-ripple-ffaf')));
    const changeTarget = (targetFamily: VideoPromptFamily, promptMode: VideoPromptMode) => {
        const workflow = targetFamily === 'h3'
            ? family === 'h3' ? draft.workflow : 'reference'
            : promptMode === 'v2v' ? 'ltx-ripple-ffaf'
                : family === 'ltx' && draft.workflow !== 'ltx-ripple-ffaf' ? draft.workflow : 'ltx-audio-sync';
        update({ targetFamily, promptMode, workflow });
    };
    const changeTemplates = (next: Record<VideoTemplate, string>) => update(family === 'ltx' ? { ltxTemplates: next } : { templates: next });
    const changeSoundtrack = (originalAudioId: string | undefined, forceOriginalAudio: boolean) => update({ originalAudioId, forceOriginalAudio });
    const chooseTab = (next: typeof tab) => { setTab(next); if (next === 'ltx-ripple-ffaf') setRippleOpened(true); if (next === 'ltx-audio-sync') setAudioSyncOpened(true); if (next === 'character-swap') setSwapOpened(true); if (next !== 'ltx' && openDirector) onLeaveDirector(); };
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
            inputs.styleExamples = inputs.style && videoPromptFamily(inputs) === 'h3'
                ? await localStylePromptExamples(styleInventory, inputs.style.lora, inputs.style.libraryLink?.path) : undefined;
            const result = await generateVideoPrompt({ ...draft, ...inputs });
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
    const transfer = async () => {
        setTransferring(true);
        setError(''); setNotice('');
        try {
            const prompt = validateVideoPromptOutput(draft.result, draft.template);
            if (hasPendingAudio) throw new Error('Apply the audio selection before transferring it to the video workflow.');
            if (draft.generatedInputs && (videoPromptFamily(draft.generatedInputs) !== videoPromptFamily(draft)
                || videoPromptMode(draft.generatedInputs) !== videoPromptMode(draft))) {
                throw new Error('The target model or generation mode changed. Generate the prompt again before transferring it.');
            }
            if (videoPromptMode(draft) === 'ref2v' && draft.workflow.startsWith('ltx-')) {
                throw new Error('The connected LTX workflows do not support REF2V reference conditioning. Copy/export the prompt, or choose H3 and regenerate. FI2V is a separate first-frame mode; references were not converted to starting frames.');
            }
            const ltxPrompt = draft.targetFamily === 'ltx' ? ltxVideoPromptText(prompt, draft.template) : prompt;
            if (draft.workflow === 'ltx-director') {
                if (draft.template !== 'generation' || draft.references.some(ref => ref.kind !== 'image') || draft.references.length > 1) {
                    throw new Error('LTX Director transfer accepts text or one first-frame image. Use Audio-Sync for a soundtrack or Ripple for a source video; no references were discarded.');
                }
                if (draft.duration < 3 || draft.duration > 15) throw new Error('LTX Director segments support 3-15 seconds. Adjust the duration and regenerate the prompt.');
                const image = draft.references[0]?.file;
                const imageDataUrl = image ? await fileToDataUrl(image) : undefined;
                dispatch(queueLtxTransfer({ prompt: ltxPrompt, imageDataUrl, promptDurationSeconds: draft.duration }));
                chooseTab('ltx');
                setNotice('Prompt and first-frame image sent to a new LTX Director segment. Existing segments and model settings are retained.');
                return;
            }
            if (draft.workflow === 'ltx-ripple-ffaf') {
                const images = draft.references.filter(ref => ref.kind === 'image'), videos = draft.references.filter(ref => ref.kind === 'video');
                if (images.length !== 1 || videos.length !== 1 || draft.references.some(ref => ref.kind === 'audio')) {
                    throw new Error('LTX Ripple requires one edited first-frame image and one source video, without audio references. No references were discarded.');
                }
                if (draft.rippleDraft && !window.confirm('Replace the LTX Ripple prompt and references? Model and render settings will be retained.')) return;
                update({ rippleDraft: { prompt: ltxPrompt, image: images[0].file, video: videos[0].file } });
                chooseTab('ltx-ripple-ffaf');
                setNotice('Prompt and edited image/video references copied to LTX Ripple. Source timing and render settings remain controlled in Ripple.');
                return;
            }
            if (draft.workflow === 'ltx-audio-sync') {
                if (draft.audioSyncDraft && !window.confirm('Replace the existing LTX Audio-Sync draft? Models will be kept and Qwen enhancement switched off.')) return;
                const transferred = transferAudioSyncPrompt({ ...draft, result: ltxPrompt });
                if (draft.promptMode) transferred.settings.textToVideo = draft.promptMode === 't2v';
                update({ audioSyncDraft: transferred.draft, audioSyncSettings: transferred.settings });
                chooseTab('ltx-audio-sync'); setNotice(transferred.notice); return;
            }
            if (draft.generatedInputs && JSON.stringify(draft.generatedInputs.style || null) !== JSON.stringify(draft.style || null)) {
                throw new Error('The selected style changed since this prompt was generated. Generate it again before sending, so the wording and H3 LoRA stay matched.');
            }
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
            if (draft.promptMode === 'ref2v' && destination === 'advanced' && options.advanced) {
                options.advanced = { ...options.advanced, mode: 'ref2v', inputMode: 'generate' };
            }
            const style = draft.generatedInputs?.style || draft.style;
            options.loras = h3StyleLoraRemovals(options, style);
            options.style = style ? structuredClone(style) : undefined;
            options.styleStrength = undefined;
            update({ minimaxDrafts: { ...draft.minimaxDrafts, [destination]: reference },
                ...(destination === 'advanced' ? { advancedH3Options: options } : destination === 'ultrafast' ? { ultrafastH3Options: options } : { minimaxH3Options: options }),
            });
            chooseTab(destination === 'reference' ? 'minimax' : destination);
            setNotice(`Prompt and edited references transferred to ${h3WorkflowName(destination)}. Subsequent edits in the generator do not change that workflow.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { setTransferring(false); }
    };
    const copy = async (text: string) => {
        setError('');
        try {
            const inputs = draft.generatedInputs ?? draft;
            await navigator.clipboard.writeText(videoPromptFamily(inputs) === 'ltx' ? ltxVideoPromptText(text, inputs.template) : text);
            setNotice('Prompt copied.');
        }
        catch (cause) { setError(`Could not copy: ${cause instanceof Error ? cause.message : String(cause)}`); }
    };
    const download = (text: string, filename: string) => {
        const inputs = draft.generatedInputs ?? draft;
        let exported: string;
        try { exported = videoPromptFamily(inputs) === 'ltx' ? ltxVideoPromptText(text, inputs.template) : text; }
        catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
        const url = URL.createObjectURL(new Blob([exported], { type: 'text/plain;charset=utf-8' }));
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
                <button type="button" onClick={() => chooseTab('prompt')} aria-pressed={group === 'prompt'} className={`${button} border-sky-400/60 text-sky-300 ${group === 'prompt' ? 'bg-sky-400/15' : ''}`}>Video Prompt Generator</button>
                <button type="button" onClick={() => chooseTab(lastLtxTab.current)} aria-pressed={group === 'ltx'} className={`${button} border-amber-400/60 text-amber-300 ${group === 'ltx' ? 'bg-amber-400/15' : ''}`}>LTX</button>
                <button type="button" onClick={() => chooseTab(lastH3Tab.current)} aria-pressed={group === 'h3'} className={`${button} border-violet-400/60 text-violet-300 ${group === 'h3' ? 'bg-violet-400/15' : ''}`}>H3</button>
            </nav>
            <span role="status" className="text-xs text-text-secondary">{!ready ? 'Loading saved workspace...' : saved ? 'Saved locally · media included' : 'Saving workspace...'}</span>
        </div>
        {group !== 'prompt' && <nav className="flex flex-wrap gap-2 rounded-xl border border-border-primary bg-bg-secondary p-2" aria-label={`${group.toUpperCase()} tools`}>
            {videoToolGroups[group].map(item => <button key={item.id} type="button" onClick={() => chooseTab(item.id)} aria-pressed={tab === item.id}
                className={`${button} ${tab === item.id ? group === 'ltx' ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-violet-400/60 bg-violet-400/15 text-violet-300' : 'text-text-secondary'}`}>{item.label}</button>)}
        </nav>}
        {storageError && <div role="alert" className="rounded-xl border border-danger bg-danger-bg p-3 text-sm text-danger">{storageError}
            {ready && <button type="button" className={`${button} ml-3`} onClick={() => setDraft(current => ({ ...current }))}>Retry saving</button>}
        </div>}
        {error && <p role="alert" className="rounded-xl border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-emerald-300">{notice}</p>}

        <div hidden={tab !== 'character-swap'}>{swapOpened && <CharacterSwapPanel />}</div>
        <React.Activity mode={tab === 'ltx-ripple-ffaf' ? 'visible' : 'hidden'}>{rippleOpened && <LTXRipplePanel
            draft={draft.rippleDraft} settings={draft.rippleSettings} ready={ready}
            onDraftChange={rippleDraft => setDraft(current => ({ ...current, rippleDraft }))}
            onSettingsChange={rippleSettings => setDraft(current => ({ ...current, rippleSettings }))}
            libraryItem={libraryWorkflow === 'ltx-ripple-ffaf' ? libraryItem : null}
            onLibraryItemLoaded={onLibraryItemLoaded}
        />}</React.Activity>
        <React.Activity mode={tab === 'ltx-audio-sync' ? 'visible' : 'hidden'}>{audioSyncOpened && <LTXAudioSyncPanel
            draft={draft.audioSyncDraft} settings={draft.audioSyncSettings} ready={ready}
            lyricsProvider={draft.audioSyncLyricsSettings?.provider ?? 'openrouter'}
            lyricsModel={draft.audioSyncLyricsSettings?.model ?? DEFAULT_OPENROUTER_MODEL}
            onLyricsSettingsChange={(provider, model) => setDraft(current => ({ ...current, audioSyncLyricsSettings: { provider, model: model ?? (provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : 'gemini-2.5-flash') } }))}
            onDraftChange={audioSyncDraft => setDraft(current => ({ ...current, audioSyncDraft }))}
            onSettingsChange={audioSyncSettings => setDraft(current => ({ ...current, audioSyncSettings }))}
            libraryItem={libraryWorkflow === 'ltx-audio-sync' ? libraryItem : null}
            onLibraryItemLoaded={onLibraryItemLoaded}
        />}</React.Activity>
        <React.Activity mode={tab === 'ltx' ? 'visible' : 'hidden'}>
            {!openDirector && <div className="mb-3 flex justify-end"><button type="button" className={`${button} text-danger`} onClick={onResetDirector}>Reset LTX Director</button></div>}
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
                                        update({ idea: '', references: [], result: '', style: undefined, styleExamples: undefined, generatedInputs: undefined, generatedInputsProvenance: undefined }); setLibrarySaved(false);
                                    }
                                }}>Clear</button>
                            </div>
                        </div>
                        <fieldset disabled={!ready || busy || transferring} className="space-y-4 disabled:opacity-50">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Select<VideoPromptFamily> label="Target video model" ariaLabel="Target video model" value={family} options={[{ value: 'h3', label: 'H3 / MiniMax' }, { value: 'ltx', label: 'LTX 2 / LTX 2.5' }]} onChange={value => changeTarget(value, mode)} />
                                <Select<VideoPromptMode> label="Generation mode" ariaLabel="Generation mode" value={mode} onChange={value => changeTarget(family, value)}
                                    options={[{ value: 't2v', label: 'T2V - Text to video' }, { value: 'fi2v', label: 'FI2V - First image to video' }, { value: 'ref2v', label: 'REF2V - References to video' }, { value: 'v2v', label: 'V2V - Video to video' }]} />
                            </div>
                            <p className="text-xs text-text-secondary">{mode === 'ref2v'
                                ? 'REF2V uses references for identity, appearance, style or other assigned roles in a new scene. No reference is imposed as the first frame; pose and framing come from your idea.'
                                : mode === 'fi2v' ? 'FI2V explicitly uses the first attached image as the starting frame and describes motion from that image.'
                                    : family === 'ltx' ? 'LTX uses chronological natural prose, with an original scene in T2V and explicit retained/edited content in V2V. H3 templates and styles are kept separately.'
                                        : 'H3 keeps its existing structured multimodal format and styles. T2V establishes a new scene; V2V edits a source video. Use REF2V for independent references, or FI2V for a starting image.'}</p>
                            {family === 'ltx' && mode === 'ref2v' && <p role="status" className="text-xs text-amber-300">You can compose and copy/export a reference-aware LTX prompt, but the connected LTX renderers only support first-frame/source-video conditioning. REF2V transfer is unavailable; references will not silently become starting frames.</p>}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Select<VideoPromptProvider> label="Provider" ariaLabel="Video prompt provider" value={draft.provider} options={[{ value: 'openrouter', label: 'OpenRouter' }, { value: 'gemini', label: 'Gemini' }, { value: 'mammouth', label: 'Mammouth' }]} onChange={provider => update({ provider })} />
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
                                    {modelError && <p role="alert" className="text-danger">{modelError}</p>}
                                    <p>Video/audio require a compatible model. Audio: WAV or MP3.</p></>}
                                {draft.provider === 'gemini' && <p>Images, video and audio are sent as native media to Gemini.</p>}
                                {draft.provider === 'mammouth' && <p className="text-amber-300">Mammouth: image references only in this integration. Choose Gemini or a compatible OpenRouter model for video/audio.</p>}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Select<VideoTemplate> label="Canvas" ariaLabel="Video prompt canvas" value={draft.template} options={[{ value: 'generation', label: 'Audio + video generation' }, { value: 'replacement', label: 'Character replacement' }]} onChange={template => update({ template })} />
                                <Select label="Aspect ratio" ariaLabel="Video prompt aspect ratio" value={draft.aspect} options={VIDEO_PROMPT_ASPECTS} onChange={aspect => update({ aspect })} />
                                <NumberField slider className="sm:col-span-3" label="Duration (seconds)" ariaLabel="Video prompt duration" min={1} max={120} step={1} value={draft.duration} onChange={duration => update({ duration })} />
                            </div>
                            <PromptBox inputRef={ideaRef} label="Your idea" ariaLabel="Video idea" rows={7} placeholder="Describe the scene, action, dialogue and sound. Click a reference badge to insert its token..." value={draft.idea} onChange={idea => update({ idea })} />
                            <VideoPromptStyleControl style={draft.style} disabled={!ready || busy} active={family === 'h3'}
                                onSelect={style => update({ style, styleExamples: undefined })}
                                onUsePrompt={idea => update({ idea })} />
                            <div className="flex flex-wrap gap-2">{draft.references.map(ref => <button type="button" key={ref.id} onClick={() => insertToken(ref)}><Token text={referenceToken(ref)} /></button>)}</div>
                            <OriginalAudioSelector references={draft.references} value={draft.originalAudioId} forced={draft.forceOriginalAudio}
                                onChange={originalAudioId => changeSoundtrack(originalAudioId, originalAudioId !== undefined)} onForceChange={(forced, originalAudioId) => changeSoundtrack(originalAudioId, forced)} />
                            {draft.template === 'replacement' && <p className="text-xs text-violet-300">Requires a source video and at least one character image. Use each reference's Role field to map identities and actors.</p>}
                        </fieldset>
                    </section>
                    {settingsOpen && <section className={panel}>
                        <h3 className="mb-2 font-semibold">Editable prompt templates - {family === 'ltx' ? 'LTX' : 'H3'}</h3>
                        <p className="mb-3 text-xs text-text-secondary">Saved in this local workspace. Keep the listed output field names and order; the response validator uses that contract.</p>
                        <fieldset disabled={!ready || busy} className="space-y-3">
                            {(['generation', 'replacement'] as const).map(key => <div key={key}><PromptBox kind="instruction" highlight={false} rows={14}
                                label={key === 'generation' ? 'Audio + video generation' : 'Character replacement'} ariaLabel={key === 'generation' ? 'Audio + video generation template' : 'Character replacement template'}
                                value={templates[key]} onChange={text => changeTemplates({ ...templates, [key]: text })}
                                actions={<button type="button" className={`${button} !py-1 !text-xs`} onClick={() => { if (window.confirm('Restore this default template?')) changeTemplates({ ...templates, [key]: (family === 'ltx' ? DEFAULT_LTX_VIDEO_TEMPLATES : DEFAULT_VIDEO_TEMPLATES)[key] }); }}>Restore default</button>} /></div>)}
                        </fieldset>
                    </section>}
                    <section className={`${panel} space-y-5`}>
                        <div><h3 className="font-semibold">Reference studio</h3><p className="mt-1 text-xs text-text-secondary">6 images · 2 videos · 2 audio files. Numbers remain stable when a reference is removed. Crop and resize apply to the files actually sent.</p></div>
                        {(['image', 'video', 'audio'] as const).map(kind => <div key={kind} className="space-y-3" onDragOver={event => event.preventDefault()} onDrop={event => {
                            event.preventDefault(); if (ready && !busy) importFiles(kind, Array.from(event.dataTransfer.files));
                        }}>
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-medium capitalize">{kind === 'image' ? 'Pictures' : `${kind}s`} <span className="ml-1 text-xs text-text-secondary">{count(kind)}/{REFERENCE_LIMITS[kind]}</span></h4>
                                <div className="flex flex-wrap gap-2">
                                <button type="button" className={`${button} !py-1.5 !text-xs`} disabled={!ready || busy || count(kind) >= REFERENCE_LIMITS[kind]} onClick={() => setReferencePicker(kind)}>Library</button>
                                <label className={`${button} !py-1.5 !text-xs ${!ready || busy || count(kind) >= REFERENCE_LIMITS[kind] ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}>
                                    + Add {kind}<input aria-label={`Upload ${kind} references`} type="file" className="sr-only" accept={`${kind}/*`} multiple disabled={!ready || busy || count(kind) >= REFERENCE_LIMITS[kind]} onChange={event => {
                                        importFiles(kind, Array.from(event.target.files || [])); event.target.value = '';
                                    }} />
                                </label>
                                </div>
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
                        <button type="button" className={`${button} w-full border-accent bg-accent !py-3 text-accent-text`} disabled={!ready || busy || librarySaving || hasPendingAudio || !draft.idea.trim() || openRouterModelBlocked} onClick={generate}>{busy ? 'Composing your video prompt...' : 'Generate video prompt'}</button>
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
                        ? <PromptBox label="Prompt text" ariaLabel="Generated video prompt" rows={18} disabled={busy} value={draft.result} onChange={result => { update({ result }); setLibrarySaved(false); }} />
                        : <div className="max-h-[65vh] overflow-y-auto rounded-xl bg-bg-primary p-4"><ColoredPrompt text={draft.result} /></div>}
                    <div className="my-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={!draft.result} onClick={() => copy(draft.result)}>Copy</button><button type="button" className={button} disabled={!draft.result} onClick={() => download(draft.result, 'video-prompt.txt')}>Export .txt</button></div>
                    <div className="mb-4 space-y-2">
                        <button type="button" className={`${button} border-sky-400/50 text-sky-300`} disabled={!draft.result || busy || librarySaving || !ready} onClick={saveCurrentPrompt}>{librarySaving ? 'Saving to Library...' : librarySaved ? 'Saved to Library · Save another copy' : 'Save to Library'}</button>
                        <p className="text-xs text-text-secondary">Includes originals and edited media, reference roles, idea, model and editable canvases. Edits to the output can be saved as a new Library item. Older prompts without a generation snapshot save the current setup.</p>
                    </div>
                    <div className="space-y-3 border-t border-border-primary pt-4">
                        <Select label="Send prompt to workflow" ariaLabel="Send prompt to workflow" disabled={busy || !ready} value={draft.workflow} options={destinations.map(workflow => ({ value: workflow.id, label: workflow.name }))}
                            onChange={id => { const workflow = destinations.find(item => item.id === id); if (workflow) update({ workflow: workflow.id }); }} />
                        <button type="button" className={`${button} w-full ${family === 'ltx' ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : draft.workflow === 'advanced' ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300' : draft.workflow === 'ultrafast' ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-violet-400/50 bg-violet-400/10 text-violet-300'}`} disabled={!draft.result || busy || transferring || !ready || hasPendingAudio || family === 'ltx' && mode === 'ref2v'} onClick={() => void transfer()}>Send to {VIDEO_WORKFLOWS.find(workflow => workflow.id === draft.workflow)?.name ?? 'Minimax REF2v H3'}</button>
                        <p className="text-xs text-text-secondary">Copies the prompt, references, aspect ratio and duration into an independent draft. LTX Audio-Sync accepts one image and one audio (no video references), keeps model settings and switches Qwen enhancement off. You can explicitly re-enable it afterward. In Advanced, select REF2V for multimodal references or FL2V for first/last frames.</p>
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
        {referencePicker && <LibraryPickerModal isOpen hydrateMedia={false} onClose={() => setReferencePicker(null)}
            filter={referencePicker === 'image' ? ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'hair', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo']
                : referencePicker === 'video' ? ['video'] : ['audio-tts', 'tts-reference']}
            onSelectItem={async item => {
                const kind = referencePicker;
                const file = await readLibraryMediaFile(item, [kind]);
                const references = addVideoReferences(latestDraft.current.references, kind, [file]);
                update({ references });
                setNotice(`Library ${kind} imported as an independent reference. The Library item was not changed.`);
            }} />}
    </div>;
};
