import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryAssetRole, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { getLibraryAssetBlob } from '../services/idbLibraryService';
import {
    AUDIO_SYNC_TEMPLATE, applyAudioSyncPassage, audioSyncInputPrompt, audioSyncReference, audioSyncNumber, audioSyncResolution, buildAudioSyncWorkflow, defaultAudioSyncLoras, defaultAudioSyncSettings, validateAudioSyncDraft,
    type AudioSyncDraft, type AudioSyncSavedSetup, type AudioSyncSettings,
} from '../services/ltxAudioSyncWorkflow';
import { generateAudioSyncVideo, loadAudioSyncObjectInfo, prepareAudioSyncWorkflow, readAudioSyncDuration, type AudioSyncResult } from '../services/ltxAudioSyncService';
import { h3Choices, h3Input, isRecord, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { readRenderedLibraryMedia } from '../services/minimaxH3Library';
import { createVideoPlaceholderThumbnail, dataUrlToThumbnail } from '../utils/imageUtils';
import { useMediaURL } from './VideoReferenceEditor';
import { LibraryPickerModal } from './LibraryPickerModal';
import { H3AudioReference } from './H3AudioReference';
import { AudioLyricsEditor } from './VideoAudioControls';
import type { VideoPromptProvider } from '../services/videoPromptService';
import { VideoOutputFrames } from './VideoOutputFrames';
import { Accordion } from './ui/Accordion';
import { NumberField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { ui } from './ui/styles';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm font-semibold hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed';
const input = `mt-1 block ${ui.control}`;
const emptyDraft = (): AudioSyncDraft => ({ prompt: '', image: null, audio: null });
const nodeTitles: Record<string, string> = {
    '403': 'Canvas', '398:384': 'Diffusion model', '398:387': 'Video text encoder', '398:385': 'Video VAE', '398:386': 'Audio VAE',
    '398:371': 'Latent 2x upscaler', '398:393': 'Qwen writer', '398:380': 'Qwen generation',
    '398:352': 'First-pass sampler', '398:397': 'First-pass sigmas', '398:388': 'First-pass guidance',
    '398:341': 'Second-pass sampler', '398:396': 'Second-pass sigmas', '398:391': 'Second-pass guidance', '398:338': 'Second-pass seed',
    '398:351': 'Source resize', '398:350': 'Source compression', '398:357': 'First-pass image strength', '398:349': 'Second-pass image strength',
    '398:374': 'Tiled VAE decode', '398:373': 'Negative prompt', '398:370': 'Video assembly', '75': 'Output',
};
const fieldTitles: Record<string, string> = {
    aspect_ratio: 'Aspect ratio', megapixels: 'Megapixels', multiple: 'Alignment', value: 'Value', unet_name: 'Model', weight_dtype: 'Weight dtype',
    clip_name: 'Encoder', type: 'Encoder type', device: 'Device', vae_name: 'VAE', model_name: 'Upscaler', text: 'Negative prompt',
    sigmas: 'Manual sigmas', sampler_name: 'Sampler', noise_seed: 'Seed', strength: 'Image strength', filename_prefix: 'Filename prefix',
};
const downloadJSON = (value: unknown, name: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const LTXAudioSyncPanel: React.FC<{
    draft?: AudioSyncDraft;
    settings?: AudioSyncSettings;
    ready: boolean;
    onDraftChange: (draft: AudioSyncDraft) => void;
    onSettingsChange: (settings: AudioSyncSettings) => void;
    libraryItem?: LibraryItem | null;
    onLibraryItemLoaded: () => void;
    lyricsProvider: VideoPromptProvider;
    lyricsModel: string;
    onLyricsSettingsChange: (provider: VideoPromptProvider, model?: string) => void;
}> = ({ draft: storedDraft, settings: storedSettings, ready, onDraftChange, onSettingsChange, libraryItem, onLibraryItemLoaded, lyricsProvider, lyricsModel, onLyricsSettingsChange }) => {
    const dispatch = useDispatch<AppDispatch>();
    const { inventory } = useModelInventory();
    const draft: AudioSyncDraft = storedDraft || emptyDraft();
    const settings: AudioSyncSettings = storedSettings || defaultAudioSyncSettings();
    const [info, setInfo] = useState<H3ObjectInfo | null>(null);
    const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [saving, setSaving] = useState(false);
    const [error, setError] = useState(''), [status, setStatus] = useState(''), [progress, setProgress] = useState(0);
    const [result, setResult] = useState<AudioSyncResult | null>(null);
    const [resultDraft, setResultDraft] = useState<AudioSyncDraft | null>(null);
    const [saved, setSaved] = useState(false), [cancelling, setCancelling] = useState(false);
    const [picker, setPicker] = useState<'image' | 'audio' | null>(null);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [audioPending, setAudioPending] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const libraryConfirmation = useRef<{ item: LibraryItem; approved: boolean } | null>(null);
    const latestDraft = useRef(draft), latestSettings = useRef(settings);
    latestDraft.current = draft; latestSettings.current = settings;
    const imageURL = useMediaURL(draft.image || undefined);
    const audioReference = audioSyncReference(draft);
    const blocked = !ready || busy || checking || saving || mediaLoading;
    useEffect(() => {
        const abort = new AbortController();
        loadAudioSyncObjectInfo(abort.signal).then(setInfo).catch(cause => {
            if (!abort.signal.aborted) setError(`Could not load Audio-Sync node/model lists: ${cause instanceof Error ? cause.message : String(cause)}. Use Check nodes and models to retry.`);
        });
        return () => abort.abort();
    }, []);
    useEffect(() => {
        if (!libraryItem) libraryConfirmation.current = null;
        if (!ready || !libraryItem?.ltxAudioSyncOptions || blocked) return;
        let cancelled = false;
        const restore = async () => {
            const snapshot = libraryItem.ltxAudioSyncOptions!;
            if (snapshot.version !== 1) throw new Error('Unsupported Audio-Sync setup version.');
            if (storedDraft) {
                if (libraryConfirmation.current?.item !== libraryItem) libraryConfirmation.current = { item: libraryItem,
                    approved: window.confirm('Replace only the LTX Audio-Sync prompt, inputs and settings with this Library setup?') };
                if (!libraryConfirmation.current.approved) return;
            }
            const read = async (role: LibraryAssetRole, file?: { name: string; type: string; lastModified?: number }): Promise<File | null> => {
                if (!file) return null;
                const ref = libraryItem.assetRefs?.[role];
                if (!ref) throw new Error(`The saved Audio-Sync setup is missing ${file.name}. No draft was replaced.`);
                const blob = await getLibraryAssetBlob(ref);
                return new File([blob], file.name, { type: file.type || blob.type, lastModified: file.lastModified });
            };
            const [image, audio, audioOriginal] = await Promise.all([read('sourceImage', snapshot.image), read('ltxAudioSyncAudio', snapshot.audio),
                read('ltxAudioSyncOriginalAudio', snapshot.audioOriginal)]);
            if (cancelled) return;
            setError('');
            onDraftChange({ prompt: snapshot.prompt, image, audio, ...(audioOriginal ? { audioOriginal } : {}),
                audioSelection: snapshot.audioSelection, lyrics: snapshot.lyrics }); onSettingsChange(structuredClone(snapshot.settings));
            setResult(null); setStatus('Audio-Sync setup and original inputs restored. The saved Library item was not changed.');
        };
        restore().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); })
            .finally(() => { if (!cancelled) onLibraryItemLoaded(); });
        return () => { cancelled = true; };
    }, [libraryItem, ready, blocked]);
    const setValue = (key: string, name: string, value: string | number | boolean) => {
        const current = latestSettings.current;
        onSettingsChange({ ...current, nodes: { ...current.nodes, [key]: { ...current.nodes[key], [name]: value } } });
    };
    const updateDraft = (patch: Partial<AudioSyncDraft>) => onDraftChange({ ...latestDraft.current, ...patch });
    const readDuration = async (): Promise<number> => {
        const audio = latestDraft.current.audio;
        if (!audio) throw new Error('Choose a soundtrack first.');
        const duration = await readAudioSyncDuration(audio);
        if (latestDraft.current.audio !== audio) throw new Error('The audio changed while reading its duration. Retry with the current file.');
        updateDraft({ audioDuration: duration });
        return duration;
    };
    const chooseFile = async (kind: 'image' | 'audio', file: File) => {
        if (!file.size || !file.type.startsWith(`${kind}/`)) throw new Error(`Choose a non-empty ${kind} file.`);
        if (kind === 'image') { updateDraft({ image: file }); return; }
        setMediaLoading(true);
        try {
            const duration = await readAudioSyncDuration(file);
            updateDraft({ audio: file, audioDuration: duration, audioOriginal: undefined, audioSelection: undefined, lyrics: undefined });
            onSettingsChange({ ...latestSettings.current, nodes: { ...latestSettings.current.nodes,
                '398:362': { value: duration }, '398:707': { ...latestSettings.current.nodes['398:707'], start_index: 0 } } });
        } finally { setMediaLoading(false); }
    };
    const reportError = (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause));
    const field = (key: string, name: string, value: string | number | boolean) => {
        const spec = AUDIO_SYNC_TEMPLATE[key], schema = h3Input(info, spec.class_type, name, settings.nodes[key]);
        const config = Array.isArray(schema) && isRecord(schema[1]) ? schema[1] : {};
        let choices = h3Choices(info, spec.class_type, name);
        if (name === 'unet_name') choices = [...new Set([...choices, ...h3Choices(info, 'UnetLoaderGGUF', 'unet_name')])];
        if (key === '398:387' && name === 'clip_name') choices = [...new Set([...choices, ...h3Choices(info, 'CLIPLoaderGGUF', 'clip_name')])];
        const label = fieldTitles[name] || name.replaceAll('_', ' ').replaceAll('.', ' / '), accessible = `${nodeTitles[key] || key}: ${label}`;
        return <div key={name} className="min-w-0">
            {typeof value === 'boolean' ? <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={value} onChange={event => setValue(key, name, event.target.checked)} />{label}</label>
                : choices.length || ['unet_name', 'clip_name', 'vae_name', 'model_name'].includes(name) ? <Select variant="search" label={label} ariaLabel={accessible} value={String(value)}
                    options={name === 'unet_name' ? familyFiles(choices, 'ltx-23', inventory) : choices} onChange={choice => setValue(key, name, choice)} />
                    : typeof value === 'number' ? <NumberField label={label} ariaLabel={accessible} value={value} onChange={number => setValue(key, name, number)}
                        min={typeof config.min === 'number' ? config.min : undefined} max={typeof config.max === 'number' ? Math.min(config.max, Number.MAX_SAFE_INTEGER) : undefined}
                        step={Array.isArray(schema) && schema[0] === 'INT' ? 1 : undefined} />
                        : key === '398:373' && name === 'text' ? <PromptBox kind="negative" label={label} ariaLabel={accessible} rows={4} value={value} onChange={next => setValue(key, name, next)} />
                        : <label className={ui.label}>{label}<textarea aria-label={accessible} rows={name === 'text' ? 4 : 2} className={input} value={value} onChange={event => setValue(key, name, event.target.value)} /></label>}
        </div>;
    };
    const nodeFields = (...keys: string[]) => keys.map(key => <div key={key} className="space-y-2">
        <h4 className="text-sm font-semibold text-amber-200">{nodeTitles[key] || key}</h4>
        <div className="grid gap-3 sm:grid-cols-2">{Object.entries(settings.nodes[key] || {}).map(([name, value]) => field(key, name, value))}</div>
    </div>);
    const run = async (action: 'check' | 'export' | 'generate') => {
        setError(''); setStatus(''); setProgress(0); setChecking(action !== 'generate'); setBusy(action === 'generate'); setCancelling(false);
        const abort = new AbortController(); controller.current = abort;
        try {
            if (audioPending) throw new Error('Apply the selected audio passage before checking, exporting or generating.');
            const duration = draft.audioDuration ?? await readDuration();
            const snapshotDraft = { ...latestDraft.current, audioDuration: duration };
            const snapshot = structuredClone(latestSettings.current);
            validateAudioSyncDraft(snapshotDraft, snapshot);
            if (action === 'generate' && snapshot.randomizeSeed) {
                snapshot.nodes['398:339'].noise_seed = Math.floor(Math.random() * 1e15); onSettingsChange(snapshot);
            }
            if (action === 'check') {
                const nodes = await loadAudioSyncObjectInfo(abort.signal, true); setInfo(nodes);
                buildAudioSyncWorkflow(snapshot, audioSyncInputPrompt(snapshotDraft), { image: snapshotDraft.image?.name, audio: snapshotDraft.audio!.name }, nodes);
                setStatus('Active nodes, installed models and parameters validated. No upload or generation was performed.');
            } else if (action === 'export') {
                const workflow = await prepareAudioSyncWorkflow(snapshotDraft, snapshot, abort.signal, (message, fraction) => { setStatus(message); setProgress(fraction); });
                downloadJSON(workflow, 'ltx-2.5-audio-sync-api.json'); setStatus('API workflow exported with uploaded input filenames. No generation was queued.');
            } else {
                const generated = await generateAudioSyncVideo(snapshotDraft, snapshot, abort.signal, (message, fraction) => { setStatus(message); setProgress(fraction); });
                setResult(generated); setResultDraft(snapshotDraft); setSaved(false);
            }
        } catch (cause) { reportError(cause); }
        finally { controller.current = null; setBusy(false); setChecking(false); setCancelling(false); }
    };
    const save = async (output: boolean) => {
        setError(''); setSaving(true);
        try {
            const source = output ? resultDraft : draft;
            if (!source || !source.prompt.trim() || output && !result) throw new Error('Enter a prompt before saving a setup, or generate a video before saving output.');
            const snapshot: AudioSyncSavedSetup = { version: 1, prompt: source.prompt, settings: structuredClone(output ? result!.settings : settings),
                ...(source.image ? { image: { name: source.image.name, type: source.image.type } } : {}),
                ...(source.audio ? { audio: { name: source.audio.name, type: source.audio.type, lastModified: source.audio.lastModified } } : {}),
                ...(source.audioOriginal ? { audioOriginal: { name: source.audioOriginal.name, type: source.audioOriginal.type, lastModified: source.audioOriginal.lastModified } } : {}),
                ...(source.audioSelection ? { audioSelection: { ...source.audioSelection } } : {}),
                ...(source.lyrics ? { lyrics: { ...source.lyrics } } : {}),
                ...(output && result ? { finalPrompt: result.prompt, promptIsFinal: result.promptIsFinal, promptId: result.promptId, workflow: result.workflow } : {}),
            };
            const assetBlobs: Partial<Record<LibraryAssetRole, Blob>> = {};
            if (source.image) assetBlobs.sourceImage = source.image;
            if (source.audio) assetBlobs.ltxAudioSyncAudio = source.audio;
            if (source.audioOriginal) assetBlobs.ltxAudioSyncOriginalAudio = source.audioOriginal;
            let thumbnail = createVideoPlaceholderThumbnail();
            if (source.image) {
                const url = URL.createObjectURL(source.image);
                try { thumbnail = await dataUrlToThumbnail(url, 256); } finally { URL.revokeObjectURL(url); }
            }
            let warning = '';
            if (output && result) {
                const media = await readRenderedLibraryMedia(result.videoUrl, undefined, 'LTX Audio-Sync');
                assetBlobs.media = media.blob; thumbnail = media.thumbnail; warning = media.warning || '';
            }
            await dispatch(addToLibrary({ mediaType: output ? 'video' : 'preset', media: output ? '' : JSON.stringify(snapshot.settings), thumbnail,
                name: `LTX 2.5 Audio-Sync - ${source.prompt.replace(/\s+/g, ' ').slice(0, 60)}`, tags: ['ltx-2.5', 'audio-sync'],
                ltxAudioSyncOptions: snapshot, assetBlobs })).unwrap();
            if (output) setSaved(true);
            setStatus(`${output ? 'Video' : 'Setup'} saved to Library with the original inputs and exact settings. ${warning}`);
        } catch (cause) { reportError(cause); }
        finally { setSaving(false); }
    };
    let dimensions = '';
    try { const size = audioSyncResolution(settings); dimensions = `${size.width} x ${size.height}`; }
    catch (cause) { dimensions = cause instanceof Error ? cause.message : String(cause); }

    return <section className="space-y-4 rounded-2xl border border-amber-400/40 bg-bg-secondary p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-bold text-amber-200">LTX 2.5 Audio-Sync</h2><p className="mt-1 text-sm text-text-secondary">First frame + soundtrack, two sampling passes and latent 2x upscale. Enter a prompt directly or send one from Video Prompt Generator.</p></div>
            <button type="button" className={`${button} text-red-300`} disabled={blocked} onClick={() => {
                if (!window.confirm('Reset only LTX Audio-Sync, including its inputs, prompt, settings and unsaved displayed output? Saved Library items and server files will not be deleted.')) return;
                onDraftChange(emptyDraft()); onSettingsChange(defaultAudioSyncSettings()); setResult(null); setResultDraft(null); setSaved(false); setAudioPending(false); setError(''); setStatus('');
            }}>Start from scratch</button>
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        {status && <p role="status" className="text-sm text-text-secondary">{status}</p>}
        <fieldset disabled={blocked} className="min-w-0 space-y-4 disabled:opacity-60">
            <PromptBox label="Video prompt" ariaLabel="LTX Audio-Sync video prompt" rows={6} value={draft.prompt} onChange={prompt => updateDraft({ prompt })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enhancePrompt} onChange={event => onSettingsChange({ ...settings, enhancePrompt: event.target.checked })} />Enable Qwen prompt enhancement</label>
            <p className="text-xs text-text-secondary">Video Prompt Generator transfers switch Qwen off automatically. You can re-enable it explicitly. Disabled means your prompt is sent unchanged and the Qwen model is not loaded. Optional enabled lyrics are appended separately.</p>
            {settings.enhancePrompt && <Accordion title="Qwen prompt enhancement">{() => nodeFields('398:393', '398:380')}</Accordion>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.textToVideo} onChange={event => onSettingsChange({ ...settings, textToVideo: event.target.checked })} />Text to video (no first-frame conditioning)</label>
            <div className="grid gap-4 md:grid-cols-2">
                {(['image', 'audio'] as const).map(kind => <div key={kind} className="min-w-0 space-y-2 rounded-xl border border-border-primary p-3">
                    <h3 className="font-semibold">{kind === 'image' ? `First frame${settings.textToVideo ? ' (optional Qwen reference)' : ' (required)'}` : 'Soundtrack (required)'}</h3>
                    <input type="file" aria-label={`LTX Audio-Sync ${kind}`} accept={`${kind}/*`} className="w-full text-xs" onChange={event => {
                        const file = event.target.files?.[0]; event.target.value = ''; if (file) void chooseFile(kind, file).catch(reportError);
                    }} />
                    <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setPicker(kind)}>Load from Library</button>
                        {draft[kind] && <button type="button" className={button} onClick={() => {
                            if (kind === 'audio') setAudioPending(false);
                            updateDraft({ [kind]: null, ...(kind === 'audio' ? { audioDuration: undefined, audioOriginal: undefined, audioSelection: undefined, lyrics: undefined } : {}) });
                        }}>Remove</button>}</div>
                    <p className="break-all text-xs text-text-secondary">{draft[kind]?.name || 'No file selected'}</p>
                    {kind === 'image' && imageURL && <img src={imageURL} alt="Audio-Sync first frame" className="max-h-64 w-full object-contain" />}
                </div>)}
            </div>
            {audioReference && <div className="min-w-0">
                <H3AudioReference reference={audioReference} videoDuration={audioSyncNumber(settings, 362)} target="Audio-Sync"
                    onPendingChange={pending => setAudioPending(pending)} onApply={(file, selection) => {
                        const applied = applyAudioSyncPassage(latestDraft.current, latestSettings.current, file, selection);
                        onDraftChange(applied.draft); onSettingsChange(applied.settings); setError('');
                        setStatus(`Audio-Sync uses ${selection.start.toFixed(3)} - ${selection.end.toFixed(3)} s. Only this WAV passage is sent; the original stays available for the next selection.`);
                    }} />
                <AudioLyricsEditor reference={audioReference} provider={lyricsProvider} model={lyricsModel}
                    onSettingsChange={onLyricsSettingsChange} passagePending={audioPending} requireAppliedPassage
                    onChange={lyrics => updateDraft({ lyrics })} />
                <p className="mt-2 text-xs text-text-secondary">Lyrics / spoken words are optional. Transcription runs only when requested and uses only the applied passage. A new passage makes old words stale; edit, confirm, transcribe again, or switch them off.</p>
                {draft.audioOriginal && <button type="button" className={`${button} mt-2`} onClick={() => void chooseFile('audio', draft.audioOriginal!).catch(reportError)}>Restore original audio</button>}
            </div>}
            {audioPending && <p role="status" className="text-xs text-amber-300">Apply the audio selection before checking, exporting, saving a setup or generating.</p>}
            <div className="grid gap-3 sm:grid-cols-3">
                <NumberField label="Duration (seconds)" ariaLabel="Audio-Sync duration" min={0.01} disabled={!!draft.audioSelection} value={audioSyncNumber(settings, 362)} onChange={value => setValue('398:362', 'value', value)} />
                <NumberField label="Audio start (seconds)" ariaLabel="Audio-Sync audio start" min={0} disabled={!!draft.audioSelection} value={audioSyncNumber(settings, 707, 'start_index')} onChange={value => setValue('398:707', 'start_index', value)} />
                <NumberField label="Frame rate" ariaLabel="Audio-Sync frame rate" min={1} step={1} value={audioSyncNumber(settings, 361)} onChange={value => setValue('398:361', 'value', value)} />
            </div>
            <button type="button" className={button} disabled={!!draft.audioSelection} onClick={() => {
                setMediaLoading(true); setError('');
                void readDuration().then(duration => {
                    const remaining = duration - audioSyncNumber(latestSettings.current, 707, 'start_index');
                    if (remaining <= 0) throw new Error('Audio start is beyond the soundtrack duration.');
                    setValue('398:362', 'value', remaining);
                }).catch(reportError).finally(() => setMediaLoading(false));
            }}>Use remaining audio duration</button>
            <p className="text-xs text-text-secondary">Apply a waveform passage to set the exact duration. Applied WAV files start at 0 to avoid trimming twice; change their range on the original waveform, or use Next for the following passage. Frame count follows duration x FPS + 1 and LTX latent alignment.</p>
            <Accordion title="Models">{() => <>{nodeFields('398:384', '398:387', '398:385', '398:386', '398:371')}<p className="text-xs text-text-secondary">The diffusion model list shows LTX files when some are recognized by name or by My Library, otherwise every installed file. Models must be compatible with LTX 2.5; GGUF switches to its matching loader. NVFP4 requires compatible GPU/runtime support.</p></>}</Accordion>
            <Accordion title="LoRAs - camera and style (up to 4)">{() => {
                const loras = settings.loras ?? defaultAudioSyncLoras();
                const choices = [{ value: '', label: 'Select a LoRA' }, ...familyFiles(h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), 'ltx-23', inventory).map(name => ({ value: name, label: name }))];
                return <>
                    <p className="text-xs text-text-secondary">Enable up to four installed LTX 2.5-compatible LoRAs. They are applied in slot order to the diffusion model in both passes, without modifying Qwen or the text encoder. Disabled slots keep their selections but are not loaded.</p>
                    {Array.from({ length: 4 }, (_, index) => {
                        const lora = loras[index] ?? defaultAudioSyncLoras()[index];
                        const patch = (value: Partial<typeof lora>) => {
                            const current = latestSettings.current;
                            const next = defaultAudioSyncLoras().map((initial, slot) => current.loras?.[slot] ?? initial);
                            next[index] = { ...next[index], ...value };
                            onSettingsChange({ ...current, loras: next });
                        };
                        return <div key={index} className="space-y-3 rounded-xl border border-border-primary p-3">
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Enable Audio-Sync LoRA ${index + 1}`} checked={lora.enabled}
                                onChange={event => patch({ enabled: event.target.checked })} />LoRA {index + 1}</label>
                            <Select variant="search" label="File" ariaLabel={`Audio-Sync LoRA ${index + 1} file`} disabled={!lora.enabled} value={lora.name} options={choices} onChange={name => patch({ name })} />
                            <NumberField slider label="Strength" ariaLabel={`Audio-Sync LoRA ${index + 1} strength`} disabled={!lora.enabled} min={-20} max={20} step={0.05} value={lora.strength} onChange={strength => patch({ strength })} />
                        </div>;
                    })}
                    <p className="text-xs text-text-secondary">The list shows LTX LoRAs when some are recognized by name or by My Library, otherwise every installed LoRA: select files compatible with your LTX 2.5 model and quantization. No files are downloaded automatically. With every slot disabled, the source model path is unchanged.</p>
                </>;
            }}</Accordion>
            <Accordion title="Resolution and image conditioning">{() => <>{nodeFields('403', '398:351', '398:350')}{!settings.textToVideo && nodeFields('398:357', '398:349')}</>}</Accordion>
            <Accordion title="Sampling - first and second pass">{() => nodeFields('398:352', '398:397', '398:388', '398:341', '398:396', '398:391', '398:338')}</Accordion>
            <Accordion title="Negative prompt, decode and output">{() => nodeFields('398:373', '398:374', '398:370', '75')}</Accordion>
            <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="First-pass seed" ariaLabel="Audio-Sync seed" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={audioSyncNumber(settings, 339, 'noise_seed')} onChange={value => setValue('398:339', 'noise_seed', value)} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.randomizeSeed} onChange={event => onSettingsChange({ ...settings, randomizeSeed: event.target.checked })} />Randomize first-pass seed</label>
            </div>
            <p className="text-sm text-amber-200">{dimensions} · {audioSyncNumber(settings, 362).toFixed(3)}s · {audioSyncNumber(settings, 361)} fps · {settings.enhancePrompt ? 'Qwen enhancement on' : 'Prompt unchanged'}</p>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={audioPending} onClick={() => void run('check')}>Check nodes and models</button>
                <button type="button" className={button} disabled={audioPending} onClick={() => void run('export')}>Export API workflow</button>
                <button type="button" className={button} disabled={audioPending} onClick={() => void save(false)}>Save setup to Library</button>
                <button type="button" className={`${button} border-accent bg-accent text-accent-text`} disabled={audioPending} onClick={() => void run('generate')}>Generate LTX 2.5 Audio-Sync</button>
            </div>
        </fieldset>
        {(busy || checking) && <div className="space-y-2"><progress className="w-full" max={1} value={progress} /><button type="button" className={`${button} text-red-300`} disabled={cancelling} onClick={() => { setCancelling(true); controller.current?.abort(); }}>{cancelling ? 'Cancelling safely...' : 'Cancel this operation'}</button></div>}
        {result && <div className="space-y-3">
            <VideoOutputFrames key={result.promptId} result={result} url={result.videoUrl} disabled={busy || checking} />
            <div className="flex flex-wrap gap-2"><a className={button} href={result.videoUrl} download>Download video</a><button type="button" className={button} disabled={blocked || saved} onClick={() => void save(true)}>{saved ? 'Saved to Library' : 'Save video to Library'}</button><button type="button" className={button} onClick={() => downloadJSON(result.workflow, 'ltx-audio-sync-executed-api.json')}>Export executed workflow</button></div>
            <details className="rounded-lg border border-border-primary p-3"><summary className="cursor-pointer">{result.promptIsFinal ? 'Final prompt used' : 'Input prompt (Qwen did not report its final text)'}</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{result.prompt}</p></details>
        </div>}
        {picker && <LibraryPickerModal isOpen onClose={() => setPicker(null)} filter={picker === 'image' ? ['image', 'character', 'extracted-frame'] : ['audio-tts', 'tts-reference']} onSelectItem={async item => {
            const response = await fetch(item.media); if (!response.ok) throw new Error(`Could not read Library media (${response.status}).`);
            const blob = await response.blob(); const file = new File([blob], `${item.name || `library-${item.id}`}.${picker === 'image' ? 'png' : 'wav'}`, { type: blob.type });
            await chooseFile(picker, file); setPicker(null);
        }} />}
    </section>;
};
