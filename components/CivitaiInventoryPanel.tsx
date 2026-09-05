import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { CIVITAI_FAMILIES, CivitaiFamily, CivitaiInventory, CivitaiInventoryItem, CivitaiModelFolder, CivitaiProvider, formatModelSize, getCivitaiModelUrl } from '../services/civitaiService';
import { queueLtxTransfer, setActiveTab } from '../store/appSlice';
import { setGenerationMode, updateOptions } from '../store/generationSlice';
import { store, type AppDispatch } from '../store/store';
import type { ComfyModelType, GenerationOptions } from '../types';
import { ImageIcon, SpinnerIcon } from './icons';
import { MenuSelect } from './MenuSelect';

interface ScanProgress { completed: number; total: number; fileName: string; stage: string; }
type ScanKind = 'all' | 'lora' | 'checkpoint' | 'diffusion';
type LocalKind = Exclude<ScanKind, 'all'>;
type InventoryFilter = 'all' | 'updates' | 'review';
type LibraryKind = 'all' | 'checkpoint' | 'lora';
type ToolResultFilter = 'all' | 'updates' | 'review' | 'found';

interface Props {
    view: 'library' | 'tools';
    inventory: CivitaiInventory;
    provider: CivitaiProvider;
    isScanning: boolean;
    isOrganizing: boolean;
    progress: ScanProgress | null;
    onScan: (options: { kind: ScanKind; family: CivitaiFamily }) => void;
    onOrganize: () => void;
    onInventoryChange: (inventory: CivitaiInventory) => void;
    onItemChange: (item: CivitaiInventoryItem) => void;
    onClassifyItem: (item: CivitaiInventoryItem, kind: LocalKind, folder: CivitaiModelFolder) => Promise<void>;
    onOpenItem: (item: CivitaiInventoryItem) => void;
    onUpdateItem: (item: CivitaiInventoryItem, mode: 'keep' | 'replace') => Promise<{ fileName: string; versionName: string }>;
    focusedItemPath: string | null;
    organizeMessage: string;
    localAccessAvailable: boolean;
}

const FOLDERS: Record<LocalKind, CivitaiModelFolder[]> = {
    lora: ['sd15', 'SDXL', 'Flux', 'QWEN', 'ZIT', 'LTX2', 'LTX2_camera_control'],
    checkpoint: ['SD1.5', 'SDXL', 'FLUX', 'flux-dev', 'LTX2'],
    diffusion: ['sd15', 'SDXL', 'Flux', 'QWEN', 'ZIT', 'LTX2', 'LTX2_camera_control'],
};

const getItemFolder = (item: CivitaiInventoryItem): CivitaiModelFolder => {
    const pathSegments = item.relativePath.replace(/\\/g, '/').split('/');
    return FOLDERS[item.kind].find(folder => pathSegments.some(segment => segment.toLowerCase() === folder.toLowerCase())) || FOLDERS[item.kind][0];
};

const getFolderLabel = (folder: CivitaiModelFolder) => folder === 'LTX2' ? 'LTX 2.3 (LTX2)' : folder;
const inferPreviewType = (url?: string | null): 'image' | 'video' => url && /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url) ? 'video' : 'image';
const getComfyRelativePath = (item: CivitaiInventoryItem) => item.relativePath.replace(/^[^\\/]+[\\/]/, '');
const isItemReviewed = (item: CivitaiInventoryItem) => item.userOwned || item.status === 'matched' || Boolean(item.archiveInfo);

const appendTriggerWords = (prompt: string, triggerWords: string[]) => {
    const currentPrompt = prompt.trim();
    const normalizedPrompt = currentPrompt.toLowerCase();
    const additions = triggerWords.filter(word => word.trim() && !normalizedPrompt.includes(word.trim().toLowerCase()));
    return additions.length ? `${currentPrompt}${currentPrompt ? ', ' : ''}${additions.join(', ')}` : currentPrompt;
};

const SAMPLER_OPTIONS = ['', 'euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast', 'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_3m_sde', 'ddim', 'uni_pc', 'uni_pc_bh2'];
const SCHEDULER_OPTIONS = ['', 'normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear_quadratic', 'kl_optimal'];

const getComfyOptions = (widgetInfo: unknown): string[] => Array.isArray(widgetInfo) && Array.isArray(widgetInfo[0]) ? widgetInfo[0] : [];

const getCompatibleBaseModel = (modelType: ComfyModelType, objectInfo: any): string | undefined => {
    if (modelType === 'qwen-t2i-gguf') {
        const models = [
            ...getComfyOptions(objectInfo?.UnetLoaderGGUF?.input?.required?.unet_name),
            ...getComfyOptions(objectInfo?.UnetLoaderGGUF?.input?.required?.gguf_name),
            ...getComfyOptions(objectInfo?.UNETLoader?.input?.required?.unet_name),
        ];
        return models.find(model => /qwen/i.test(model));
    }
    if (modelType === 'z-image') {
        return getComfyOptions(objectInfo?.UNETLoader?.input?.required?.unet_name).find(model => /z[-_ ]?image|\bzit\b/i.test(model));
    }
    const checkpoints = getComfyOptions(objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name);
    if (modelType === 'flux') return checkpoints.find(model => /flux/i.test(model));
    if (modelType === 'sdxl') return checkpoints.find(model => /sdxl|pony|illustrious|noobai/i.test(model));
    return checkpoints.find(model => /sd[._ -]?1[._ -]?5/i.test(model));
};

const WORKFLOW_DEFAULT_SETTINGS: Partial<Record<ComfyModelType, Pick<GenerationOptions, 'comfySteps' | 'comfyCfg' | 'comfySampler' | 'comfyScheduler' | 'comfyFluxGuidance'>>> = {
    'sd1.5': { comfySteps: 25, comfyCfg: 7, comfySampler: 'euler', comfyScheduler: 'normal' },
    sdxl: { comfySteps: 25, comfyCfg: 5.5, comfySampler: 'euler', comfyScheduler: 'normal' },
    flux: { comfySteps: 10, comfyCfg: 1, comfySampler: 'euler', comfyScheduler: 'simple', comfyFluxGuidance: 3.5 },
    'qwen-t2i-gguf': { comfySteps: 4, comfyCfg: 1, comfySampler: 'euler_ancestral', comfyScheduler: 'beta57' },
    'z-image': { comfySteps: 8, comfyCfg: 1, comfySampler: 'euler', comfyScheduler: 'simple' },
};

const normalizeComfyOption = (value: string) => value.toLowerCase()
    .replace(/\+\+/g, 'pp')
    .replace(/\+/g, 'p')
    .replace(/ancestral/g, 'a')
    .replace(/[^a-z0-9]/g, '');

const resolveComfyOption = (recommendation: string | undefined, options: string[]) => {
    if (!recommendation) return undefined;
    const normalizedRecommendation = normalizeComfyOption(recommendation);
    return [...options]
        .sort((left, right) => normalizeComfyOption(right).length - normalizeComfyOption(left).length)
        .find(option => normalizedRecommendation.includes(normalizeComfyOption(option)));
};

const getRecommendedSettingUpdates = (modelType: ComfyModelType, usageMetadata: CivitaiInventoryItem['usageMetadata'], objectInfo: any): Partial<GenerationOptions> => {
    const defaults = WORKFLOW_DEFAULT_SETTINGS[modelType] || {};
    const samplerOptions = getComfyOptions(objectInfo?.KSampler?.input?.required?.sampler_name);
    const schedulerOptions = getComfyOptions(objectInfo?.KSampler?.input?.required?.scheduler);
    const sampler = resolveComfyOption(usageMetadata?.sampler, samplerOptions) || usageMetadata?.sampler || defaults.comfySampler;
    const scheduler = resolveComfyOption(usageMetadata?.scheduler, schedulerOptions)
        || resolveComfyOption(usageMetadata?.sampler, schedulerOptions)
        || usageMetadata?.scheduler
        || defaults.comfyScheduler;
    return {
        ...defaults,
        ...(usageMetadata?.steps ? { comfySteps: usageMetadata.steps } : {}),
        ...(usageMetadata?.cfg ? { comfyCfg: usageMetadata.cfg } : {}),
        ...(modelType === 'flux' && usageMetadata?.guidance ? { comfyFluxGuidance: usageMetadata.guidance } : {}),
        ...(sampler ? { comfySampler: sampler } : {}),
        ...(scheduler ? { comfyScheduler: scheduler } : {}),
    };
};

const getImageWorkflow = (item: CivitaiInventoryItem): { modelType: ComfyModelType; loraPrefix: string; checkpointField: keyof GenerationOptions } => {
    const identity = [
        item.archiveInfo?.baseModel,
        item.installedVersionName,
        item.modelName,
        item.relativePath,
    ].filter(Boolean).join(' ').replace(/\\/g, '/').toLowerCase();
    if (/\bflux(?:[ ._-]?1)?\b/.test(identity)) return { modelType: 'flux', loraPrefix: 'comfyFlux', checkpointField: 'comfyModel' };
    if (/\bqwen\b/.test(identity)) return { modelType: 'qwen-t2i-gguf', loraPrefix: 'comfyQwen', checkpointField: 'comfyQwenUnet' };
    if (/z[-_ ]?image|\bzit\b/.test(identity)) return { modelType: 'z-image', loraPrefix: 'comfyZImage', checkpointField: 'comfyZImageUnet' };
    if (/\bsdxl\b|stable diffusion xl|\bpony\b|\billustrious\b|\bnoobai\b/.test(identity)) return { modelType: 'sdxl', loraPrefix: 'comfySdxl', checkpointField: 'comfyModel' };
    return { modelType: 'sd1.5', loraPrefix: 'comfySd15', checkpointField: 'comfyModel' };
};

const itemMatchesFamily = (item: CivitaiInventoryItem, family: CivitaiFamily) => {
    if (family === 'all') return true;
    const normalizedPath = item.relativePath.replace(/\\/g, '/').toLowerCase();
    const folders: Record<Exclude<CivitaiFamily, 'all'>, string[]> = {
        sd15: ['/sd15/', '/sd1.5/'],
        sdxl: ['/sdxl/'],
        flux: ['/flux/', '/flux-dev/'],
        qwen: ['/qwen/'],
        'qwen-edit': ['/qwen/'],
        'zit-base': ['/zit/'],
        'zit-turbo': ['/zit/'],
        'ltx-23': ['/ltx2/', '/ltx2_camera_control/'],
    };
    return folders[family].some(folder => normalizedPath.includes(folder));
};

const LocalModelCard: React.FC<{ item: CivitaiInventoryItem; provider: CivitaiProvider; focused: boolean; onInventoryChange: (inventory: CivitaiInventory) => void; onItemChange: (item: CivitaiInventoryItem) => void; onClassify: (item: CivitaiInventoryItem, kind: LocalKind, folder: CivitaiModelFolder) => Promise<void>; onUpdate: (item: CivitaiInventoryItem, mode: 'keep' | 'replace') => Promise<{ fileName: string; versionName: string }> }> = React.memo(({ item, provider, focused, onInventoryChange, onItemChange, onClassify, onUpdate }) => {
    const dispatch: AppDispatch = useDispatch();
    const [preview, setPreview] = useState<string | null>(item.previewPath ? null : item.civitaiPreviewUrl || null);
    const [previewType, setPreviewType] = useState<'image' | 'video'>(item.civitaiPreviewType || inferPreviewType(item.civitaiPreviewUrl));
    const [videoPlaying, setVideoPlaying] = useState(false);
    const [kind, setKind] = useState<LocalKind>(item.kind);
    const [folder, setFolder] = useState<CivitaiModelFolder>(() => getItemFolder(item));
    const [safety, setSafety] = useState<'auto' | 'sfw' | 'nsfw'>(item.safetyOverride || 'auto');
    const [busy, setBusy] = useState(false);
    const [archiveError, setArchiveError] = useState('');
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
    const [updateMessage, setUpdateMessage] = useState('');
    const [updateError, setUpdateError] = useState('');
    const [usageEditorOpen, setUsageEditorOpen] = useState(false);
    const [usageBusy, setUsageBusy] = useState(false);
    const [usageError, setUsageError] = useState('');
    const [triggerWords, setTriggerWords] = useState(() => item.usageMetadata?.triggerWords?.join(', ') || '');
    const [sampler, setSampler] = useState(item.usageMetadata?.sampler || '');
    const [scheduler, setScheduler] = useState(item.usageMetadata?.scheduler || '');
    const [steps, setSteps] = useState(item.usageMetadata?.steps?.toString() || '');
    const [cfg, setCfg] = useState(item.usageMetadata?.cfg?.toString() || '');
    const [guidance, setGuidance] = useState(item.usageMetadata?.guidance?.toString() || '');

    useEffect(() => {
        setTriggerWords(item.usageMetadata?.triggerWords?.join(', ') || '');
        setSampler(item.usageMetadata?.sampler || '');
        setScheduler(item.usageMetadata?.scheduler || '');
        setSteps(item.usageMetadata?.steps?.toString() || '');
        setCfg(item.usageMetadata?.cfg?.toString() || '');
        setGuidance(item.usageMetadata?.guidance?.toString() || '');
    }, [item.usageMetadata?.updatedAt]);

    useEffect(() => {
        if (item.civitaiPreviewUrl && (item.civitaiPreviewType === 'video' || inferPreviewType(item.civitaiPreviewUrl) === 'video')) {
            setPreview(item.civitaiPreviewUrl);
            setPreviewType('video');
            setVideoPlaying(false);
            return;
        }
        window.electron?.getLocalModelPreview(item.path, { modelId: item.modelId, versionId: item.installedVersionId })
            .then(localPreview => {
                setPreview(localPreview?.url || item.civitaiPreviewUrl || null);
                setPreviewType(localPreview?.type || item.civitaiPreviewType || inferPreviewType(item.civitaiPreviewUrl));
            })
            .catch(() => setPreview(item.civitaiPreviewUrl || null));
    }, [item.path, item.previewPath, item.modelId, item.installedVersionId, item.civitaiPreviewUrl, item.civitaiPreviewType]);

    const choosePreview = async () => {
        setBusy(true);
        try {
            const selected = await window.electron?.selectLocalModelPreview(item.path);
            if (selected) { setPreview(selected); setPreviewType('image'); }
        } finally { setBusy(false); }
    };

    const classifyAsOwned = async () => {
        const category = kind === 'lora' ? 'loras' : kind === 'checkpoint' ? 'checkpoints' : 'diffusion_models';
        const destination = `models/${category}/${folder}`;
        if (!window.confirm(`Classify ${item.fileName} as your model in ${destination}? A photo is optional.`)) return;
        setBusy(true);
        try {
            await onClassify(item, kind, folder);
        } finally { setBusy(false); }
    };

    const applySafety = async () => {
        setBusy(true);
        try {
            const updated = await window.electron?.setLocalModelSafety({ modelPath: item.path, safety: safety === 'auto' ? null : safety });
            if (updated) onInventoryChange(updated);
        } finally { setBusy(false); }
    };

    const fetchArchiveInfo = async () => {
        setBusy(true);
        setArchiveError('');
        try {
            const updated = await window.electron?.fetchLocalModelArchive({ modelPath: item.path });
            if (updated) onInventoryChange(updated);
        } catch (error) {
            setArchiveError(error instanceof Error ? error.message : 'CivArchive lookup failed.');
        } finally { setBusy(false); }
    };

    const fetchUsageMetadata = async (source: 'civitai' | 'archive') => {
        setUsageBusy(true);
        setUsageError('');
        try {
            const updated = await window.electron?.fetchLocalModelUsageMetadata({ modelPath: item.path, provider, source });
            if (updated) onItemChange(updated);
        } catch (error) {
            setUsageError(error instanceof Error ? error.message : 'Usage metadata lookup failed.');
        } finally {
            setUsageBusy(false);
        }
    };

    const saveUsageMetadata = async (clear = false) => {
        setUsageBusy(true);
        setUsageError('');
        try {
            const updated = await window.electron?.setLocalModelUsageMetadata({
                modelPath: item.path,
                triggerWords: clear ? [] : triggerWords.split(/[,\n]/),
                sampler: clear ? '' : sampler,
                scheduler: clear ? '' : scheduler,
                steps: clear || !steps ? undefined : Number(steps),
                cfg: clear || !cfg ? undefined : Number(cfg),
                guidance: clear || !guidance ? undefined : Number(guidance),
            });
            if (updated) onItemChange(updated);
            if (!clear) setUsageEditorOpen(false);
        } catch (error) {
            setUsageError(error instanceof Error ? error.message : 'Usage metadata could not be saved.');
        } finally {
            setUsageBusy(false);
        }
    };

    const useModel = async () => {
        const modelPath = getComfyRelativePath(item);
        if (itemMatchesFamily(item, 'ltx-23')) {
            dispatch(queueLtxTransfer(item.kind === 'lora' ? { selectedLora: modelPath } : { selectedCheckpoint: modelPath }));
            return;
        }
        const exampleSources: Array<'civitai' | 'archive'> = [
            'civitai',
            ...(item.archiveMirrorUrl ? ['archive' as const] : []),
        ];
        let selectedItem = item;
        const workflow = getImageWorkflow(item);
        const hasRecommendedSettings = Boolean(item.usageMetadata?.sampler
            && item.usageMetadata?.steps
            && (workflow.modelType === 'flux' ? item.usageMetadata?.guidance : item.usageMetadata?.cfg));
        if (item.kind === 'lora' && !hasRecommendedSettings && window.electron) {
            setUsageBusy(true);
            const preferredSources = item.usageMetadata?.source === 'archive'
                ? ['archive' as const, 'civitai' as const]
                : ['civitai' as const, 'archive' as const];
            for (const source of preferredSources.filter(candidate => exampleSources.includes(candidate))) {
                try {
                    const updated = await window.electron.fetchLocalModelUsageMetadata({ modelPath: item.path, provider, source });
                    selectedItem = updated;
                    onItemChange(updated);
                    if (updated.usageMetadata?.sampler || updated.usageMetadata?.steps) break;
                } catch {
                    // USE still applies clean family defaults when remote metadata is unavailable.
                }
            }
            setUsageBusy(false);
        }
        const currentState = store.getState();
        const generationOptions = currentState.generation.options;
        const recommendedSettings = getRecommendedSettingUpdates(workflow.modelType, selectedItem.usageMetadata, currentState.app.comfyUIObjectInfo);
        const updates: Partial<GenerationOptions> = {
            provider: 'comfyui',
            comfyModelType: workflow.modelType,
            ...recommendedSettings,
            comfyPromptExampleSource: exampleSources.length ? {
                modelPath: item.path,
                modelName: item.modelName || item.fileName,
                provider,
                sources: exampleSources,
            } : undefined,
        };
        if (item.kind === 'lora') {
            const savedTriggers = selectedItem.usageMetadata?.triggerWords || [];
            const compatibleBaseModel = getCompatibleBaseModel(workflow.modelType, currentState.app.comfyUIObjectInfo);
            Object.assign(updates, {
                [`${workflow.loraPrefix}UseLora`]: true,
                [`${workflow.loraPrefix}Lora1Name`]: modelPath,
                [`${workflow.loraPrefix}Lora1Strength`]: 1,
                ...(compatibleBaseModel ? { [workflow.checkpointField]: compatibleBaseModel } : {}),
                ...(savedTriggers.length ? { comfyPrompt: appendTriggerWords(generationOptions.comfyPrompt || '', savedTriggers) } : {}),
            });
        } else {
            Object.assign(updates, {
                [workflow.checkpointField]: modelPath,
            });
        }
        dispatch(updateOptions(updates));
        dispatch(setGenerationMode('t2i'));
        dispatch(setActiveTab('image-generator'));
    };

    const updateModel = async (mode: 'keep' | 'replace') => {
        setUpdateDialogOpen(false);
        setBusy(true);
        setUpdateError('');
        setUpdateMessage('Downloading update...');
        try {
            const result = await onUpdate(item, mode);
            setUpdateMessage(`${result.versionName} installed as ${result.fileName}.`);
        } catch (error) {
            setUpdateMessage('');
            setUpdateError(error instanceof Error ? error.message : 'Model update failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <article data-model-path={item.path} tabIndex={-1} className={`border bg-bg-secondary rounded-lg grid grid-cols-[104px_minmax(0,1fr)] min-h-40 outline-none ${focused ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-border-primary'}`}>
            <div className="bg-bg-tertiary relative overflow-hidden rounded-l-lg">
                {previewType === 'video' && preview ? videoPlaying ? <video src={preview} muted loop controls autoPlay playsInline preload="metadata" className="w-full h-full object-cover" /> : <button type="button" onClick={() => setVideoPlaying(true)} className="w-full h-full grid place-items-center text-xs font-bold text-white bg-black/60 hover:bg-black/50">Play video</button> : preview ? <img src={preview} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="h-full grid place-items-center text-text-muted"><ImageIcon className="w-7 h-7" /></div>}
                <button onClick={choosePreview} disabled={busy} className="absolute bottom-1.5 left-1.5 right-1.5 bg-black/75 text-white rounded px-2 py-1 text-[10px] font-bold disabled:opacity-50">{preview ? 'Change photo' : 'Add photo'}</button>
            </div>
            <div className="p-3 min-w-0 space-y-2">
                <div className="flex gap-2 justify-between">
                    <div className="min-w-0"><p className="font-bold text-sm text-text-primary truncate" title={item.fileName}>{item.modelName || item.fileName}</p><p className="text-[11px] text-text-muted truncate" title={item.relativePath}>{item.relativePath}</p></div>
                    <div className="shrink-0 flex items-start gap-1">{item.kind !== 'diffusion' && <button type="button" onClick={useModel} disabled={usageBusy} className="px-2 py-1 rounded bg-accent text-accent-text text-[10px] font-bold disabled:opacity-50">{usageBusy ? 'LOADING...' : 'USE'}</button>}{item.hasUpdate && <button type="button" onClick={() => setUpdateDialogOpen(true)} disabled={busy} className="px-2 py-1 rounded bg-amber-400 text-black text-[10px] font-bold disabled:opacity-50">UPDATE</button>}<span className={`h-fit px-2 py-1 rounded text-[10px] font-bold ${item.hasUpdate ? 'bg-amber-400/20 text-amber-400' : isItemReviewed(item) ? 'bg-emerald-500 text-black' : 'bg-bg-tertiary text-text-secondary'}`}>{item.hasUpdate ? 'Update' : item.userOwned ? 'My model' : isItemReviewed(item) ? 'Verified' : 'Review'}</span></div>
                </div>
                <p className="text-[11px] text-text-muted">{formatModelSize(item.sizeBytes / 1024)} · {item.installedVersionName || 'Local/custom model'}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {item.modelId && <a href={getCivitaiModelUrl(provider, item.modelId)} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">Open Civitai record</a>}
                    <button onClick={fetchArchiveInfo} disabled={busy} className="text-xs text-amber-400 hover:underline disabled:opacity-50">{busy ? item.sha256 ? 'Fetching CivArchive...' : 'Hashing, then fetching...' : item.archiveInfo ? 'Refresh CivArchive' : 'Fetch CivArchive'}</button>
                    {item.archiveMirrorUrl && <a href={item.archiveMirrorUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">Open CivArchive link</a>}
                </div>
                {item.archiveInfo && <div className="border-l-2 border-emerald-500 pl-2 text-[11px] text-text-secondary space-y-0.5"><p className="font-semibold text-text-primary">{item.archiveInfo.title}{item.archiveInfo.versionName ? ` · ${item.archiveInfo.versionName}` : ''}</p><p>{[item.archiveInfo.creator && `by ${item.archiveInfo.creator}`, item.archiveInfo.modelType, item.archiveInfo.baseModel, `${item.archiveInfo.downloads || 0} downloads`, `${item.archiveInfo.mirrorCount} mirrors`, item.archiveInfo.nsfw ? 'NSFW' : 'SFW'].filter(Boolean).join(' · ')}</p>{item.archiveInfo.description && <p className="line-clamp-2" title={item.archiveInfo.description}>{item.archiveInfo.description}</p>}</div>}
                {item.archiveInfo?.mirrors.length ? <div className="flex flex-wrap gap-x-2 gap-y-1">{item.archiveInfo.mirrors.slice(0, 3).map(mirror => <a key={mirror.url} href={mirror.url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-400 hover:underline">{mirror.source}</a>)}</div> : null}
                {archiveError && <p className="text-[11px] text-red-400">{archiveError}</p>}
                <div className="border-l-2 border-blue-500 pl-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-text-primary">{item.kind === 'lora' ? 'Trigger words' : 'Recommended settings'}</p><button type="button" onClick={() => setUsageEditorOpen(current => !current)} className="text-[11px] text-blue-400 hover:underline">{usageEditorOpen ? 'Close' : 'Edit'}</button></div>
                    {item.kind === 'lora' ? item.usageMetadata?.triggerWords?.length ? <div className="flex flex-wrap gap-1">{item.usageMetadata.triggerWords.map(word => <span key={word} className="px-1.5 py-0.5 rounded bg-bg-tertiary text-[10px] text-text-secondary">{word}</span>)}</div> : <p className="text-[11px] text-text-muted">No trigger words saved.</p> : null}
                    {item.usageMetadata && [item.usageMetadata.sampler, item.usageMetadata.scheduler, item.usageMetadata.steps && `${item.usageMetadata.steps} steps`, item.usageMetadata.cfg && `CFG ${item.usageMetadata.cfg}`, item.usageMetadata.guidance && `Guidance ${item.usageMetadata.guidance}`].filter(Boolean).length ? <p className="text-[11px] text-text-secondary">{[item.usageMetadata.sampler, item.usageMetadata.scheduler, item.usageMetadata.steps && `${item.usageMetadata.steps} steps`, item.usageMetadata.cfg && `CFG ${item.usageMetadata.cfg}`, item.usageMetadata.guidance && `Guidance ${item.usageMetadata.guidance}`].filter(Boolean).join(' · ')}</p> : item.kind !== 'lora' ? <p className="text-[11px] text-text-muted">No recommended settings saved.</p> : null}
                    <div className="flex flex-wrap gap-x-3 gap-y-1"><button type="button" onClick={() => fetchUsageMetadata('civitai')} disabled={usageBusy} className="text-[11px] text-blue-400 hover:underline disabled:opacity-50">Find on Civitai</button><button type="button" onClick={() => fetchUsageMetadata('archive')} disabled={usageBusy} className="text-[11px] text-emerald-400 hover:underline disabled:opacity-50">Find on CivArchive</button>{item.usageMetadata && <span className="text-[10px] text-text-muted">Source: {item.usageMetadata.source}</span>}</div>
                    {usageEditorOpen && <div className="space-y-1.5 pt-1">{item.kind === 'lora' && <textarea value={triggerWords} onChange={event => setTriggerWords(event.target.value)} rows={2} placeholder="trigger one, trigger two" className="w-full resize-y bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 text-xs text-text-primary" />}<div className="grid grid-cols-2 gap-1.5"><MenuSelect value={sampler} onChange={setSampler} ariaLabel="Recommended sampler" options={[...new Set([sampler, ...SAMPLER_OPTIONS])].map(value => ({ value, label: value || 'Sampler: Not set' }))} /><MenuSelect value={scheduler} onChange={setScheduler} ariaLabel="Recommended scheduler" options={[...new Set([scheduler, ...SCHEDULER_OPTIONS])].map(value => ({ value, label: value || 'Scheduler: Not set' }))} /><input type="number" min="1" step="1" value={steps} onChange={event => setSteps(event.target.value)} placeholder="Steps" className="min-w-0 bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 text-xs text-text-primary" /><input type="number" min="0.1" step="0.1" value={cfg} onChange={event => setCfg(event.target.value)} placeholder="CFG" className="min-w-0 bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 text-xs text-text-primary" />{getImageWorkflow(item).modelType === 'flux' && <input type="number" min="0.1" step="0.1" value={guidance} onChange={event => setGuidance(event.target.value)} placeholder="Guidance" className="min-w-0 bg-bg-tertiary border border-border-primary rounded px-2 py-1.5 text-xs text-text-primary" />}</div><div className="flex gap-1.5"><button type="button" onClick={() => saveUsageMetadata()} disabled={usageBusy} className="flex-1 rounded bg-blue-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">Save</button><button type="button" onClick={() => saveUsageMetadata(true)} disabled={usageBusy} className="rounded border border-border-primary px-2 py-1.5 text-[11px] text-text-secondary disabled:opacity-50">Clear</button></div></div>}
                    {usageError && <p className="text-[11px] text-red-400">{usageError}</p>}
                </div>
                {item.hasUpdate && <p className="text-xs font-semibold text-amber-400">New version: {item.latestVersionName}</p>}
                {updateMessage && <p className="text-[11px] text-emerald-400">{updateMessage}</p>}
                {updateError && <p className="text-[11px] text-red-400">{updateError}</p>}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                    <MenuSelect value={safety} onChange={setSafety} ariaLabel="Model safety" options={[{ value: 'auto', label: 'Safety: Auto' }, { value: 'sfw', label: 'Blue · SFW' }, { value: 'nsfw', label: 'Red · NSFW' }]} />
                    <button onClick={applySafety} disabled={busy} className={`px-3 rounded text-xs font-bold border disabled:opacity-50 ${safety === 'nsfw' ? 'border-red-500 text-red-400' : 'border-blue-500 text-blue-400'}`}>Apply</button>
                </div>
                {!isItemReviewed(item) && <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <MenuSelect value={kind} onChange={next => { setKind(next); setFolder(FOLDERS[next][0]); }} ariaLabel="Model type" options={[{ value: 'lora', label: 'LoRA' }, { value: 'checkpoint', label: 'Checkpoint' }, { value: 'diffusion', label: 'Diffusion' }]} />
                    <MenuSelect value={folder} onChange={setFolder} ariaLabel="Model folder" options={FOLDERS[kind].map(value => ({ value, label: getFolderLabel(value) }))} />
                    <button onClick={classifyAsOwned} disabled={busy} className="col-span-2 border border-amber-500/60 text-amber-400 rounded py-1.5 text-xs font-bold hover:bg-amber-500/10 disabled:opacity-50">Classify as my model</button>
                </div>}
            </div>
            {updateDialogOpen && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setUpdateDialogOpen(false)}><div className="w-full max-w-lg bg-bg-secondary border border-border-primary rounded-lg p-5 shadow-xl" onClick={event => event.stopPropagation()}><h3 className="text-lg font-bold text-text-primary">Update {item.modelName || item.fileName}</h3><p className="text-sm text-text-secondary mt-2">Install {item.latestVersionName || 'the latest version'}. Do you want to keep the old model as a separate file, or replace it?</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5"><button type="button" onClick={() => setUpdateDialogOpen(false)} className="px-3 py-2 rounded border border-border-primary text-text-secondary font-bold">Cancel</button><button type="button" onClick={() => updateModel('keep')} className="px-3 py-2 rounded border border-emerald-500 text-emerald-400 font-bold">Keep old</button><button type="button" onClick={() => updateModel('replace')} className="px-3 py-2 rounded bg-amber-400 text-black font-bold">Replace old</button></div></div></div>}
        </article>
    );
});

export const CivitaiInventoryPanel: React.FC<Props> = ({ view, inventory, provider, isScanning, isOrganizing, progress, onScan, onOrganize, onInventoryChange, onItemChange, onClassifyItem, onOpenItem, onUpdateItem, focusedItemPath, organizeMessage, localAccessAvailable }) => {
    const [scanKind, setScanKind] = useState<ScanKind>('all');
    const [scanFamily, setScanFamily] = useState<CivitaiFamily>('all');
    const [filter, setFilter] = useState<InventoryFilter>('all');
    const [query, setQuery] = useState('');
    const [libraryFamily, setLibraryFamily] = useState<CivitaiFamily>('all');
    const [libraryKind, setLibraryKind] = useState<LibraryKind>('all');
    const [toolResultFilter, setToolResultFilter] = useState<ToolResultFilter>('all');
    const [isCheckingSafety, setIsCheckingSafety] = useState(false);
    const [safetyProgress, setSafetyProgress] = useState<{ completed: number; total: number; modelId?: number; stage: string } | null>(null);
    const [displayLimit, setDisplayLimit] = useState(40);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleItems = useMemo(() => inventory.items.filter(item => {
        if (filter === 'updates' && !item.hasUpdate) return false;
        if (filter === 'review' && isItemReviewed(item)) return false;
        const effectiveSafety = item.safetyOverride || item.contentSafety;
        if (provider === 'red' ? effectiveSafety !== 'nsfw' : effectiveSafety === 'nsfw') return false;
        if (libraryKind !== 'all' && item.kind !== libraryKind) return false;
        if (!itemMatchesFamily(item, libraryFamily)) return false;
        return !normalizedQuery || [item.fileName, item.modelName, item.relativePath, item.installedVersionName].filter(Boolean).some(value => String(value).toLowerCase().includes(normalizedQuery));
    }), [filter, inventory.items, libraryFamily, libraryKind, normalizedQuery, provider]);
    const displayedItems = visibleItems.slice(0, displayLimit);
    const matchedCount = inventory.items.filter(isItemReviewed).length;
    const checkpointCount = inventory.items.filter(item => item.kind === 'checkpoint').length;
    const loraCount = inventory.items.filter(item => item.kind === 'lora').length;
    const updateCount = inventory.items.filter(item => item.hasUpdate).length;
    const progressPercent = progress?.total ? Math.round(progress.completed / progress.total * 100) : 0;
    const scanResults = inventory.items.filter(item => {
        if (scanKind !== 'all' && item.kind !== scanKind) return false;
        if (!itemMatchesFamily(item, scanFamily)) return false;
        if (toolResultFilter === 'updates') return item.hasUpdate;
        if (toolResultFilter === 'review') return !isItemReviewed(item);
        if (toolResultFilter === 'found') return isItemReviewed(item) && !item.hasUpdate;
        return true;
    });
    const displayedScanResults = scanResults.slice(0, displayLimit);

    useEffect(() => {
        if (!window.electron) return;
        return window.electron.onCivitaiSafetyProgress(setSafetyProgress);
    }, []);

    useEffect(() => {
        setDisplayLimit(40);
    }, [filter, libraryFamily, libraryKind, normalizedQuery, provider, scanFamily, scanKind, toolResultFilter]);

    useEffect(() => {
        if (view !== 'library' || !focusedItemPath) return;
        const item = inventory.items.find(candidate => candidate.path === focusedItemPath);
        if (!item) return;
        setQuery(item.relativePath);
        setLibraryFamily('all');
        setLibraryKind('all');
        setFilter(item.hasUpdate ? 'updates' : isItemReviewed(item) ? 'all' : 'review');
        setDisplayLimit(40);
    }, [focusedItemPath, inventory.items, view]);

    useEffect(() => {
        if (view !== 'library' || !focusedItemPath) return;
        const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
            const element = Array.from(document.querySelectorAll<HTMLElement>('[data-model-path]')).find(candidate => candidate.dataset.modelPath === focusedItemPath);
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element?.focus({ preventScroll: true });
        }));
        return () => cancelAnimationFrame(frame);
    }, [displayedItems, focusedItemPath, view]);

    const refreshSafety = async () => {
        setIsCheckingSafety(true);
        setSafetyProgress(null);
        try {
            const refreshed = await window.electron?.refreshCivitaiLibrarySafety({ kind: libraryKind, family: libraryFamily });
            if (refreshed) onInventoryChange(refreshed);
        } finally {
            setIsCheckingSafety(false);
        }
    };

    if (view === 'tools') return <div className="space-y-5">
        <section className="border border-border-primary rounded-lg p-4 space-y-4">
            <div><h2 className="text-lg font-bold text-text-primary">Library tools</h2><p className="text-xs text-text-muted mt-1">Scan selected folders or classify loose LoRAs and checkpoints.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-[180px_180px_auto] gap-2">
                <MenuSelect value={scanFamily} onChange={setScanFamily} disabled={!localAccessAvailable || isScanning || isOrganizing} ariaLabel="Scan family" options={CIVITAI_FAMILIES.map(item => ({ value: item.id, label: item.label }))} />
                <MenuSelect value={scanKind} onChange={setScanKind} disabled={!localAccessAvailable || isScanning || isOrganizing} ariaLabel="Scan model type" options={[{ value: 'all', label: 'All model types' }, { value: 'checkpoint', label: 'Checkpoints only' }, { value: 'lora', label: 'LoRAs only' }, { value: 'diffusion', label: 'Diffusion only' }]} />
                <button onClick={() => onScan({ kind: scanKind, family: scanFamily })} disabled={!localAccessAvailable || isScanning || isOrganizing} className={`px-4 py-2 rounded-md text-sm font-bold text-white disabled:opacity-50 ${provider === 'red' ? 'bg-red-600' : 'bg-blue-600'}`}>{isScanning ? 'Scanning selection' : 'Scan selection'}</button>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-3 pt-3 border-t border-border-primary"><button onClick={onOrganize} disabled={!localAccessAvailable || isScanning || isOrganizing} className="px-4 py-2 rounded-md border border-amber-500/70 text-amber-400 text-sm font-bold disabled:opacity-50">{isOrganizing ? 'Classifying root files' : 'Classify loose files'}</button><p className="text-xs text-text-muted">Scans direct files in models/loras and models/checkpoints.</p></div>
            {!localAccessAvailable && <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/40 rounded px-3 py-2">Local library tools require the Electron desktop app.</p>}
            {organizeMessage && <p className="text-xs font-semibold text-amber-400">{organizeMessage}</p>}
            {(isScanning || isOrganizing) && progress && <div className="space-y-1"><div className="h-2 bg-bg-tertiary rounded overflow-hidden"><div className={`h-full ${provider === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }} /></div><p className="text-xs text-text-secondary truncate">{progress.completed}/{progress.total} · {progress.stage} · {progress.fileName}</p></div>}
        </section>
        <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
                <div><h2 className="text-lg font-bold text-text-primary">Scan results</h2><p className="text-xs text-text-muted mt-1">Models found by the current scan selection are automatically available in My Library.</p></div>
                <p className="text-sm font-bold text-text-secondary">{scanResults.length} found</p>
            </div>
            <MenuSelect value={toolResultFilter} onChange={setToolResultFilter} ariaLabel="Scan result filter" className="w-full sm:w-56" options={[{ value: 'all', label: 'All results' }, { value: 'updates', label: 'Updates' }, { value: 'review', label: 'To review' }, { value: 'found', label: 'Found' }]} />
            {inventory.scannedAt && <p className="text-xs text-text-muted">Last scan {new Date(inventory.scannedAt).toLocaleString()}</p>}
            <div className="border border-border-primary rounded-lg divide-y divide-border-primary overflow-hidden">
                {displayedScanResults.map(item => <div key={item.path} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 px-3 py-2 bg-bg-secondary"><div className="min-w-0"><p className="text-sm font-semibold text-text-primary truncate" title={item.fileName}>{item.modelName || item.fileName}</p><p className="text-[11px] text-text-muted truncate" title={item.relativePath}>{item.relativePath}</p></div><span className={`self-center px-2 py-1 rounded text-[10px] font-bold ${item.hasUpdate ? 'bg-amber-400 text-black' : isItemReviewed(item) ? 'bg-emerald-500 text-black' : 'bg-bg-tertiary text-text-secondary'}`}>{item.hasUpdate ? 'Update' : isItemReviewed(item) ? 'Found' : 'To review'}</span><button type="button" onClick={() => onOpenItem(item)} className="self-center px-2 py-1 rounded border border-border-primary text-xs font-bold text-text-primary hover:bg-bg-tertiary">{item.hasUpdate ? 'Open update' : isItemReviewed(item) ? 'Open' : 'Review'}</button></div>)}
                {scanResults.length === 0 && <div className="px-4 py-12 text-center text-text-muted">{inventory.scannedAt ? 'No models found for this selection.' : 'Run a scan to see its results here.'}</div>}
            </div>
            {displayedScanResults.length < scanResults.length && <button type="button" onClick={() => setDisplayLimit(current => current + 40)} className="w-full border border-border-primary rounded-md py-2.5 text-sm font-bold text-text-secondary hover:bg-bg-tertiary">Show 40 more results</button>}
        </section>
    </div>;

    return <div className="space-y-5">
        <section className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><div><strong className="block text-xl">{inventory.items.length}</strong><span className="text-xs text-text-muted">Models</span></div><div><strong className="block text-xl text-blue-400">{checkpointCount}</strong><span className="text-xs text-text-muted">Checkpoints</span></div><div><strong className="block text-xl text-emerald-400">{loraCount}</strong><span className="text-xs text-text-muted">LoRAs</span></div><div><strong className="block text-xl text-amber-400">{updateCount}</strong><span className="text-xs text-text-muted">Updates</span></div><div><strong className="block text-xl text-text-secondary">{inventory.items.length - matchedCount}</strong><span className="text-xs text-text-muted">To review</span></div></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter my models, files, or versions" className="md:col-span-2 xl:col-span-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2.5 text-text-primary" />
                <MenuSelect value={libraryFamily} onChange={setLibraryFamily} ariaLabel="Library family" options={CIVITAI_FAMILIES.map(item => ({ value: item.id, label: item.label }))} />
                <MenuSelect value={libraryKind} onChange={setLibraryKind} ariaLabel="Library model type" options={[{ value: 'all', label: 'Checkpoints + LoRAs' }, { value: 'checkpoint', label: 'Checkpoints only' }, { value: 'lora', label: 'LoRAs only' }]} />
                <MenuSelect value={filter} onChange={setFilter} ariaLabel="Library status filter" options={[{ value: 'all', label: 'All my library' }, { value: 'updates', label: 'Updates only' }, { value: 'review', label: 'To review' }]} />
                <button type="button" onClick={refreshSafety} disabled={isCheckingSafety || !localAccessAvailable || inventory.items.length === 0} className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-white font-bold disabled:opacity-50 ${provider === 'red' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{isCheckingSafety && <SpinnerIcon className="w-4 h-4 animate-spin" />}{isCheckingSafety ? 'Refreshing safety' : 'Refresh safety'}</button>
            </div>
            <p className="text-xs text-text-muted">{displayedItems.length} shown · {visibleItems.length} match · {inventory.items.length} total{inventory.scannedAt ? ` · Last scan ${new Date(inventory.scannedAt).toLocaleString()}` : ''}</p>
            {safetyProgress && <div className="space-y-1" aria-live="polite"><div className="h-2 bg-bg-tertiary rounded overflow-hidden"><div className={`h-full ${provider === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${safetyProgress.total ? Math.round(safetyProgress.completed / safetyProgress.total * 100) : 100}%` }} /></div><p className="text-xs text-text-secondary">{safetyProgress.completed}/{safetyProgress.total} · {safetyProgress.stage}{safetyProgress.modelId ? ` · Model ${safetyProgress.modelId}` : ''}</p></div>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{displayedItems.map(item => <LocalModelCard key={item.path} item={item} provider={provider} focused={item.path === focusedItemPath} onInventoryChange={onInventoryChange} onItemChange={onItemChange} onClassify={onClassifyItem} onUpdate={onUpdateItem} />)}</div>
            {displayedItems.length < visibleItems.length && <button type="button" onClick={() => setDisplayLimit(current => current + 40)} className="w-full border border-border-primary rounded-md py-2.5 text-sm font-bold text-text-secondary hover:bg-bg-tertiary">Show 40 more</button>}
            {visibleItems.length === 0 && <div className="py-12 border-y border-border-primary text-center text-text-muted">{inventory.items.length === 0 ? 'No inventory yet. Run a scan from Library Tools.' : 'No local models match these filters.'}</div>}
        </section>
    </div>;
};