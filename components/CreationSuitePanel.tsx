import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryAssetRole, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { setLoadingState } from '../store/generationSlice';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import { readRenderedLibraryMedia } from '../services/minimaxH3Library';
import { h3Choices, h3Input, isRecord, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import {
    buildCreationSuiteWorkflow, creationSuitePrompt, CREATION_SUITE_BYPASS, CREATION_SUITE_HELPERS,
    CREATION_SUITE_INPUTS, CREATION_SUITE_TEMPLATE, defaultCreationSuiteSettings, validateCreationSuiteDraft, validateCreationSuiteSettings,
    type CreationSuiteDraft, type CreationSuiteInput, type CreationSuiteSettings, type CreationSuiteSnapshot, type CreationSuiteValue,
} from '../services/creationSuiteWorkflow';
import { emptyCreationSuiteLive, generateCreationSuite, loadCreationSuiteDraft, loadCreationSuiteObjectInfo, prepareCreationSuiteWorkflow, saveCreationSuiteDraft, type CreationSuiteResult } from '../services/creationSuiteService';
import { createVideoPlaceholderThumbnail } from '../utils/imageUtils';
import { useMediaURL } from './VideoReferenceEditor';
import { useDraftAutosave } from './useDraftAutosave';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CreationSuiteResult as CreationSuiteResultImage } from './CreationSuiteResult';
import { CreationSuiteLivePreview } from './CreationSuiteLivePreview';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const input = 'mt-1 w-full min-w-0 rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary';
const initial = (): CreationSuiteDraft => ({ settings: defaultCreationSuiteSettings(), files: {} });
const Accordion: React.FC<{ title: string; children: () => React.ReactNode }> = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return <details className="rounded-xl border border-border-primary p-4" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-semibold">{title}</summary>{open && <div className="mt-4 space-y-4">{children()}</div>}
    </details>;
};
const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const titles: Record<string, string> = {
    '1': 'MOSS diffusion', '5': 'MOSS text / vision encoder', '6': 'MOSS VAE', '10': 'Scene sampler', '14': 'Scene resolution',
    '22': 'Modern opener', '23': 'Modern closing block', '25': 'Cheap phone opener', '26': 'Cheap phone closing block',
    '30': 'Vision conditioning', '12': 'Scene output', '101': 'Qwen diffusion', '102': 'Qwen encoder', '103': 'Qwen VAE',
    '110': 'Swap conditioning', '115': 'Swap resolution', '120': 'Swap sampler', '131': 'Swap output',
};
export const CreationSuitePanel: React.FC<{
    isComfyUIConnected: boolean | null;
    onModelChange: (model: string) => void;
    pendingPreset?: LibraryItem | null;
    onPresetLoaded?: () => void;
}> = ({ isComfyUIConnected, onModelChange, pendingPreset, onPresetLoaded }) => {
    const dispatch = useDispatch<AppDispatch>();
    const globalBusy = useSelector((state: RootState) => state.generation.isLoading);
    const [draft, setDraft] = useState<CreationSuiteDraft>(initial);
    const [ready, setReady] = useState(false), [running, setRunning] = useState(false), [checking, setChecking] = useState(false), [saving, setSaving] = useState(false);
    const [error, setError] = useState(''), [storageError, setStorageError] = useState(''), [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0), [cancelling, setCancelling] = useState(false);
    const [live, setLive] = useState(emptyCreationSuiteLive);
    const [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [picker, setPicker] = useState<CreationSuiteInput | 'preset' | null>(null);
    const [helper, setHelper] = useState<string | null>(null);
    const [result, setResult] = useState<CreationSuiteResult | null>(null), [resultDraft, setResultDraft] = useState<CreationSuiteDraft | null>(null);
    const latest = useRef(draft); latest.current = draft;
    const loaded = useRef(false), saves = useRef<Promise<void>>(Promise.resolve());
    const controller = useRef<AbortController | null>(null);
    const settings = draft.settings;
    const locked = !ready || running || checking || saving || globalBusy;
    const errorText = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        loadCreationSuiteDraft().then(value => { if (value) setDraft(value); setReady(true); })
            .catch(cause => setStorageError(`Could not restore Creation suite. Saving is disabled to protect the existing draft. ${errorText(cause)}`));
    }, []);
    useDraftAutosave(draft, ready, snapshot => {
        saves.current = saves.current.then(() => saveCreationSuiteDraft(snapshot)).then(() => setStorageError(''))
            .catch(cause => setStorageError(`Could not save Creation suite locally: ${errorText(cause)}`));
    });
    useEffect(() => {
        const abort = new AbortController();
        loadCreationSuiteObjectInfo(abort.signal).then(setInfo).catch(cause => {
            if (!abort.signal.aborted) setError(`Could not load Creation suite models/nodes. Use Check active workflow to retry. ${errorText(cause)}`);
        });
        return () => abort.abort();
    }, []);
    useEffect(() => { onModelChange(`Creation suite: ${settings.sceneEnabled ? settings.nodes['1'].unet_name : ''}${settings.sceneEnabled && settings.swapEnabled ? ' + ' : ''}${settings.swapEnabled ? settings.nodes['101'].unet_name : ''}`); },
        [settings.sceneEnabled, settings.swapEnabled, settings.nodes['1'].unet_name, settings.nodes['101'].unet_name, onModelChange]);
    const restore = async (item: LibraryItem) => {
        const snapshot = item.creationSuiteOptions;
        if (!snapshot || snapshot.version !== 1) throw new Error('Choose a supported Creation suite setup or image.');
        validateCreationSuiteSettings(snapshot.settings);
        if (!window.confirm('Replace only Creation suite settings and inputs with this Library setup? Other Scene Variation tabs will not change.')) return;
        const files: CreationSuiteDraft['files'] = {};
        for (const { role } of CREATION_SUITE_INPUTS) {
            const descriptor = snapshot.inputs[role];
            if (!descriptor) continue;
            const ref = item.assetRefs?.[role];
            if (!ref) throw new Error(`The setup is missing ${descriptor.name}. No draft was replaced.`);
            const blob = await getLibraryAssetBlob(ref);
            files[role] = new File([blob], descriptor.name, { type: descriptor.type || blob.type, lastModified: descriptor.lastModified });
        }
        setDraft(current => ({ ...current, settings: structuredClone(snapshot.settings), files })); setResult(null); setResultDraft(null); setLive(emptyCreationSuiteLive());
        setStatus('Creation suite setup and original inputs restored. The Library item was not changed.'); setError('');
    };
    const loadingPreset = useRef<number | null>(null);
    useEffect(() => {
        if (!pendingPreset) { loadingPreset.current = null; return; }
        if (!pendingPreset.creationSuiteOptions || locked || loadingPreset.current === pendingPreset.id) return;
        loadingPreset.current = pendingPreset.id;
        void restore(pendingPreset).catch(cause => setError(errorText(cause))).finally(() => onPresetLoaded?.());
    }, [pendingPreset, locked]);
    const update = (patch: Partial<CreationSuiteSettings>) => setDraft(current => ({ ...current, settings: { ...current.settings, ...patch } }));
    const setValue = (key: string, name: string, value: CreationSuiteValue) => setDraft(current => ({ ...current, settings: {
        ...current.settings, nodes: { ...current.settings.nodes, [key]: { ...current.settings.nodes[key], [name]: value } },
    } }));
    const setFile = (role: CreationSuiteInput, file?: File) => {
        if (file && (!file.size || !file.type.startsWith('image/'))) { setError('Choose a non-empty image file.'); return; }
        setDraft(current => {
            const files = { ...current.files };
            if (file) files[role] = file; else delete files[role];
            return { ...current, files };
        });
    };
    const fields = (key: string, omit: string[] = []) => <div key={key} className="space-y-2">
        <h4 className="text-sm font-semibold text-lime-200">{titles[key] || CREATION_SUITE_BYPASS[key]?.title || key}</h4>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(settings.nodes[key] || {}).filter(([name]) => !omit.includes(name)).map(([name, value]) => {
            const schema = h3Input(info, CREATION_SUITE_TEMPLATE[key].class_type, name, settings.nodes[key]);
            const choices = h3Choices(info, CREATION_SUITE_TEMPLATE[key].class_type, name);
            const config = Array.isArray(schema) && isRecord(schema[1]) ? schema[1] : {};
            const label = `${titles[key] || CREATION_SUITE_BYPASS[key]?.title || key}: ${name.replaceAll('_', ' ')}`;
            return <label key={name} className="min-w-0 text-xs text-text-secondary">{name.replaceAll('_', ' ')}
                {typeof value === 'boolean' ? <input aria-label={label} type="checkbox" className="ml-2" checked={value} onChange={event => setValue(key, name, event.target.checked)} />
                    : choices.length || ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'tiny_vae'].includes(name) ? <select aria-label={label} className={input} value={String(value)} onChange={event => setValue(key, name, event.target.value)}>
                        {!choices.includes(String(value)) && <option value={String(value)}>{String(value) || 'Select a file'} (current / not listed)</option>}
                        {choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                    </select> : typeof value === 'number' ? <input aria-label={label} className={input} type="number" value={value}
                        min={typeof config.min === 'number' ? config.min : undefined} max={typeof config.max === 'number' ? Math.min(config.max, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER}
                        step={Array.isArray(schema) && schema[0] === 'INT' ? 1 : 'any'} onChange={event => setValue(key, name, Number(event.target.value))} />
                        : <textarea aria-label={label} className={input} rows={name.includes('prompt') || name.startsWith('string_') ? 4 : 2} value={value} onChange={event => setValue(key, name, event.target.value)} />}
            </label>;
        })}</div>
    </div>;
    const optional = (key: string) => <div key={key} className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!settings.bypass[key]} onChange={event => update({ bypass: { ...settings.bypass, [key]: !event.target.checked } })} />Enable {CREATION_SUITE_BYPASS[key].title}</label>
        {!settings.bypass[key] && fields(key)}
    </div>;
    const check = async () => {
        setChecking(true); setError(''); setStatus('');
        try {
            const current: CreationSuiteDraft = latest.current;
            validateCreationSuiteDraft(current);
            const nodes = await loadCreationSuiteObjectInfo(undefined, true); setInfo(nodes);
            buildCreationSuiteWorkflow(current.settings, Object.fromEntries(Object.entries(current.files).filter(([, file]) => !!file).map(([role, file]) => [role, file.name])), nodes);
            setStatus('Active Creation suite nodes, models and parameters validated. No upload or job was queued.');
        } catch (cause) { setError(errorText(cause)); } finally { setChecking(false); }
    };
    const run = async (exportOnly: boolean) => {
        setError(''); setStatus(''); setProgress(0); setRunning(true); setCancelling(false);
        if (!exportOnly) setLive(emptyCreationSuiteLive());
        const abort = new AbortController(); controller.current = abort;
        const snapshot = { settings: structuredClone(latest.current.settings), files: { ...latest.current.files } };
        dispatch(setLoadingState({ isLoading: true, owner: 'creation-suite' }));
        try {
            if (exportOnly) {
                const workflow = await prepareCreationSuiteWorkflow(snapshot, abort.signal);
                download(new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' }), 'creation-suite-api.json');
                setStatus('Creation suite API exported with uploaded inputs. No job was queued.');
            } else {
                const generated = await generateCreationSuite(snapshot, abort.signal, (message, value) => { setStatus(message); setProgress(value); }, setLive);
                setResult(generated); setResultDraft({ ...snapshot, settings: generated.settings });
                setDraft(current => ({ ...current, settings: { ...current.settings, nodes: { ...current.settings.nodes,
                    '10': { ...current.settings.nodes['10'], seed: generated.settings.nodes['10'].seed },
                    '120': { ...current.settings.nodes['120'], seed: generated.settings.nodes['120'].seed } } } }));
            }
        } catch (cause) { setError(errorText(cause)); }
        finally { controller.current = null; setRunning(false); setCancelling(false); dispatch(setLoadingState({ isLoading: false, owner: 'creation-suite' })); }
    };
    const save = async (output?: 'scene' | 'swap') => {
        setSaving(true); setError(''); setStatus('');
        try {
            const source = output ? resultDraft : latest.current;
            if (!source) throw new Error('Generate an image before saving this result.');
            const inputs: CreationSuiteSnapshot['inputs'] = {}, assetBlobs: Partial<Record<LibraryAssetRole, Blob>> = {};
            for (const { role } of CREATION_SUITE_INPUTS) {
                const file = source.files[role];
                if (file) { assetBlobs[role] = file; inputs[role] = { name: file.name, type: file.type, lastModified: file.lastModified }; }
            }
            const metadata: CreationSuiteSnapshot = { version: 1, settings: structuredClone(source.settings), inputs,
                ...(output && result ? { output, workflow: result.workflow, promptId: result.promptId } : {}) };
            let thumbnail = createVideoPlaceholderThumbnail(), warning = '';
            if (output && result) {
                const url = output === 'scene' ? result.sceneUrl : result.swapUrl;
                if (!url) throw new Error('This pipeline has no completed output.');
                const media = await readRenderedLibraryMedia(url, undefined, 'Creation suite');
                if (media.mediaType !== 'image') throw new Error('Creation suite returned a non-image output.');
                assetBlobs.media = media.blob; thumbnail = media.thumbnail;
                warning = media.warning || '';
            }
            await dispatch(addToLibrary({ mediaType: output ? 'image' : 'preset', media: output ? '' : JSON.stringify(metadata.settings), thumbnail,
                name: `Creation suite - ${output || 'setup'}`, tags: ['creation-suite', 'moss', 'qwen-2.1'], creationSuiteOptions: metadata, assetBlobs })).unwrap();
            setStatus(`Creation suite ${output || 'setup'} saved to Library with settings and original inputs.${warning ? ` ${warning}` : ''}`);
            return true;
        } catch (cause) { setError(errorText(cause)); return false; } finally { setSaving(false); }
    };
    const baseURL = useMediaURL(resultDraft?.files.startFrame);
    const activeHelper = CREATION_SUITE_HELPERS.find(note => note.id === helper);
    return <section className="min-w-0 space-y-5 rounded-2xl border border-lime-300/30 bg-bg-secondary p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-lime-200">Creation suite</h2>
            <p className="mt-1 text-sm text-text-secondary">Scene Creation (MOSS), then Swap face-Change expression (Qwen 2.1). Enable either pipeline or both.</p></div>
            <button type="button" className={button} disabled={locked} onClick={() => {
                if (!window.confirm('Reset only Creation suite to the supplied workflow defaults and clear its inputs and displayed results?')) return;
                setDraft(initial()); setResult(null); setResultDraft(null); setLive(emptyCreationSuiteLive()); setError(''); setStatus('');
            }}>Start from scratch</button></div>
        {error && <p role="alert" className="whitespace-pre-wrap rounded-lg border border-red-400/40 p-3 text-sm text-red-300">{error}</p>}
        {storageError && <p role="alert" className="text-sm text-red-300">{storageError}</p>}
        {status && <p role="status" className="text-sm text-text-secondary">{status}</p>}
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <aside aria-label="Creation suite options" className="order-2 min-w-0 space-y-4 lg:order-1">
        <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
            <legend className="mb-3 font-bold">Workflow options</legend>
            <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={settings.sceneEnabled} onChange={event => update({ sceneEnabled: event.target.checked })} />Enable Scene Creation</label>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={settings.swapEnabled} onChange={event => update({ swapEnabled: event.target.checked })} />Enable Swap face-Change expression</label>
            </div>
            <p className="text-xs text-text-secondary">{settings.sceneEnabled && settings.swapEnabled ? 'Both enabled: the decoded MOSS image becomes Qwen image 1 directly. The scene and final swap are both saved by ComfyUI; no intermediate re-upload.' : settings.sceneEnabled ? 'Scene Creation only: Qwen models and face inputs are omitted.' : settings.swapEnabled ? 'Swap only: choose a base photo and a face/head source. MOSS is not loaded.' : 'Enable at least one pipeline.'}</p>
            {settings.sceneEnabled && <div className="min-w-0 space-y-4 rounded-xl border border-lime-300/20 p-3">
                <h3 className="font-bold text-lime-200">Scene Creation settings</h3>
                <label className="block text-sm">Phone style<select aria-label="Scene phone style" className={input} value={settings.modernStyle ? 'modern' : 'cheap'} onChange={event => update({ modernStyle: event.target.value === 'modern' })}><option value="modern">Modern iPhone</option><option value="cheap">Cheap phone</option></select></label>
                {!settings.modernStyle && <label className="block text-sm">Scene word<input aria-label="Cheap phone scene word" className={input} value={String(settings.nodes['21'].value)} onChange={event => setValue('21', 'value', event.target.value)} /></label>}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.useReference} onChange={event => update({ useReference: event.target.checked })} />Use scene reference image</label>
                <Accordion title="Scene models and resolution">{() => <>{['1', '5', '6', '14'].map(key => fields(key))}</>}</Accordion>
                <Accordion title="Scene sampling and vision conditioning">{() => <>{fields('10')}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSceneSeed} onChange={event => update({ randomizeSceneSeed: event.target.checked })} />Randomize Scene seed</label>{fields('30')}</>}</Accordion>
                <Accordion title="Scene acceleration, preview and output">{() => <>{['3', '4', '33'].map(optional)}{fields('12')}</>}</Accordion>
                <Accordion title="Phone prompt builder">{() => <>{['22', '23', '25', '26'].map(key => fields(key))}</>}</Accordion>
            </div>}
            {settings.swapEnabled && <div className="min-w-0 space-y-4 rounded-xl border border-cyan-300/20 p-3">
                <h3 className="font-bold text-cyan-200">Swap face / expression settings</h3>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.useSelectedSize} onChange={event => update({ useSelectedSize: event.target.checked })} />Use swap Resolution Selector (off = match image 1)</label>
                <Accordion title="Swap models, LoRAs and acceleration">{() => <>{['101', '102', '103'].map(key => fields(key))}{['104', '105', '106', '107', '108', '141'].map(optional)}</>}</Accordion>
                <Accordion title="Swap sampling, negative prompt and output">{() => <>{fields('120')}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSwapSeed} onChange={event => update({ randomizeSwapSeed: event.target.checked })} />Randomize Swap seed</label>
                    {fields('110', ['prompt'])}{settings.useSelectedSize && fields('115')}{fields('131')}</>}</Accordion>
            </div>}
            <div className="space-y-4">{CREATION_SUITE_INPUTS.filter(({ role }) => role === 'sourceImage' ? settings.sceneEnabled && settings.useReference : role === 'startFrame' ? settings.swapEnabled && !settings.sceneEnabled : settings.swapEnabled).map(({ role, title }) => <CreationInput key={role} role={role} title={title} file={draft.files[role]} onChange={file => setFile(role, file)} onLibrary={() => setPicker(role)} />)}</div>
            <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void check()}>Check active workflow</button>
                <button type="button" className={button} onClick={() => void run(true)}>Export API workflow</button><button type="button" className={button} onClick={() => void save()}>Save setup to Library</button>
                <button type="button" className={button} onClick={() => setPicker('preset')}>Load setup from Library</button></div>
        </fieldset>
        <Accordion title="Workflow helpers - original notes">{() => <><p className="text-xs text-text-secondary">Verbatim source notes and examples. They never replace your prompts or settings automatically; some examples describe older values.</p><div className="flex flex-wrap gap-2">
            {CREATION_SUITE_HELPERS.map(note => <button key={note.id} type="button" className={button} onClick={() => setHelper(note.id)}>{note.title}</button>)}
        </div></>}</Accordion>
        </aside>
        <div aria-label="Creation suite prompts and generation" className="order-1 min-w-0 space-y-4 lg:order-2">
        <fieldset disabled={locked} className="min-w-0 space-y-4 disabled:opacity-60">
            <legend className="mb-3 font-bold">Prompts and generation</legend>
            {settings.sceneEnabled && <div className="space-y-3 rounded-xl border border-lime-300/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-lime-200">1. Scene Creation</h3>
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setHelper('18')}>Modern iPhone helper</button><button type="button" className={button} onClick={() => setHelper('19')}>Cheap phone helper</button></div></div>
                <label className="block text-sm">Your subject / scene prompt<textarea aria-label="Scene Creation prompt" className={input} rows={5} value={String(settings.nodes['20'].value)} onChange={event => setValue('20', 'value', event.target.value)} /></label>
                <details><summary className="cursor-pointer text-xs text-text-secondary">Assembled scene prompt</summary><textarea aria-label="Assembled scene prompt" readOnly className={input} rows={6} value={creationSuitePrompt(settings)} /></details>
            </div>}
            {settings.swapEnabled && <div className="space-y-3 rounded-xl border border-cyan-300/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-cyan-200">2. Swap face-Change expression</h3><button type="button" className={button} onClick={() => setHelper('223')}>Head swap helper</button></div>
                <label className="block text-sm">Head swap / expression prompt<textarea aria-label="Swap face expression prompt" className={input} rows={7} value={String(settings.nodes['110'].prompt)} onChange={event => setValue('110', 'prompt', event.target.value)} /></label>
                <p className="text-xs text-text-secondary">Keep the head_swap training caption. Use the HEAD SWAP helper for expression/pose edits and negative-prompt conflicts. Image 1 is the base; image 2 supplies the face/head.</p>
            </div>}
            <button type="button" className={`${button} w-full border-lime-300/50 bg-lime-300/10 py-3 text-lime-200`} disabled={!isComfyUIConnected || !settings.sceneEnabled && !settings.swapEnabled} onClick={() => void run(false)}>Generate Creation suite</button>
        </fieldset>
        {running && <div className="space-y-2"><progress aria-label="Creation suite progress" className="w-full" max={1} value={progress} /><button type="button" className={button} disabled={cancelling} onClick={() => { setCancelling(true); controller.current?.abort(); }}>Cancel this job</button><p className="text-xs text-text-secondary">Cancels only this job, without interrupting other workflows.</p></div>}
        <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!ready} checked={draft.showPreview ?? true} onChange={event => setDraft(current => ({ ...current, showPreview: event.target.checked }))} />Show live preview</label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!ready} checked={draft.showCharts ?? true} onChange={event => setDraft(current => ({ ...current, showCharts: event.target.checked }))} />Show sampling charts</label>
        </div>
        <CreationSuiteLivePreview live={live} showPreview={draft.showPreview ?? true} showCharts={draft.showCharts ?? true} running={running} />
        {result && <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Results</h3>
                <button type="button" className={`${button} shrink-0 text-xs`} onClick={() => download(new Blob([JSON.stringify(result.workflow, null, 2)], { type: 'application/json' }), 'creation-suite-executed-api.json')}>Export executed API</button>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
            {([['scene', result.sceneUrl], ['swap', result.swapUrl]] as const).filter(([, url]) => !!url).map(([stage, url]) => <div key={`${result.promptId}:${stage}`} className="min-w-0 space-y-3 rounded-xl border border-border-primary p-3">
                <h3 className="font-semibold">{stage === 'scene' ? 'Scene Creation result' : 'Swap face-Change expression result'}</h3>
                {url && <CreationSuiteResultImage src={url} alt={`${stage} output`} title={stage === 'scene' ? 'Scene Creation result' : 'Swap face-Change expression result'} busy={locked} onDownload={() => {
                    void readRenderedLibraryMedia(url, undefined, 'Creation suite').then(media => download(media.blob, `creation-suite-${stage}.png`)).catch(cause => setError(errorText(cause)));
                }} onSave={() => save(stage)} />}
                {stage === 'swap' && !result.sceneUrl && baseURL && <details><summary className="cursor-pointer text-sm">Original base photo</summary><img src={baseURL} alt="Original swap base" className="mt-2 max-h-80 w-full object-contain" /></details>}
            </div>)}
            </div>
        </div>}
        </div>
        </div>
        {activeHelper && <div role="dialog" aria-modal="true" aria-label={activeHelper.title} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" onKeyDown={event => { if (event.key === 'Escape') setHelper(null); }}>
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 rounded-xl border border-border-primary bg-bg-primary p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{activeHelper.title}</h3><div className="flex gap-2"><button type="button" className={button} onClick={() => {
                    void navigator.clipboard.writeText(activeHelper.text).then(() => setStatus('Helper text copied. Your prompts were not changed.')).catch(cause => setError(`Could not copy helper: ${errorText(cause)}`));
                }}>Copy helper text</button><button type="button" className={button} autoFocus onClick={() => setHelper(null)}>Close helper</button></div></div>
                <pre className="min-h-0 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{activeHelper.text}</pre>
            </div>
        </div>}
        {picker && <LibraryPickerModal isOpen onClose={() => setPicker(null)} filter={picker === 'preset' ? ['preset', 'image'] : ['image', 'character', 'extracted-frame']} hydrateMedia={false} onSelectItem={async item => {
            try {
                if (picker === 'preset') await restore(item);
                else {
                    const ref = item.assetRefs?.media;
                    let blob: Blob;
                    if (ref) blob = await getLibraryAssetBlob(ref);
                    else { const response = await fetch(item.media); if (!response.ok) throw new Error(`Could not read the Library image (${response.status}).`); blob = await response.blob(); }
                    if (!blob.size || !blob.type.startsWith('image/')) throw new Error('The Library item does not contain a valid image.');
                    setFile(picker, new File([blob], `library-${item.id}.png`, { type: blob.type }));
                }
                setPicker(null);
            } catch (cause) { setError(errorText(cause)); }
        }} />}
    </section>;
};
const CreationInput: React.FC<{ role: CreationSuiteInput; title: string; file?: File; onChange: (file?: File) => void; onLibrary: () => void }> = ({ role, title, file, onChange, onLibrary }) => {
    const url = useMediaURL(file);
    return <div className="min-w-0 space-y-2 rounded-xl border border-border-primary p-3"><h4 className="font-semibold">{title}</h4>
        <input id={`creation-suite-${role}`} aria-label={`Creation suite ${title}`} type="file" accept="image/*" className="w-full text-xs" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) onChange(selected); }} />
        <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={onLibrary}>Load image from Library</button>{file && <button type="button" className={button} onClick={() => onChange()}>Remove image</button>}</div>
        <p className="break-all text-xs text-text-secondary">{file?.name || 'No image selected'}</p>{url && <img src={url} alt={title} className="max-h-64 w-full object-contain" />}
    </div>;
};
