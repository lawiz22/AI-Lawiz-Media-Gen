import React, { useEffect, useMemo, useState } from 'react';
import type { CivitaiDestination, CivitaiFamily, CivitaiInventoryItem, CivitaiModelFolder } from '../services/civitaiService';
import { formatModelSize } from '../services/civitaiService';
import { MenuSelect } from './MenuSelect';
import { CheckIcon, DownloadIcon, ImageIcon, LibraryIcon, SpinnerIcon } from './icons';

const FAMILY_OPTIONS = [
    { value: 'all', label: 'All families' },
    { value: 'SD 1.5', label: 'Stable Diffusion 1.5' },
    { value: 'SDXL 1.0', label: 'SDXL 1.0' },
    { value: 'Pony', label: 'Pony' },
    { value: 'Illustrious', label: 'Illustrious' },
    { value: 'NoobAI', label: 'NoobAI' },
    { value: 'Flux.1 D', label: 'FLUX.1 Dev' },
    { value: 'Flux.1 Krea', label: 'FLUX.1 Krea' },
    { value: 'Krea 2', label: 'KREA 2' },
    { value: 'Flux.2 D', label: 'FLUX.2 Dev' },
    { value: 'Flux.2 Klein 4B', label: 'FLUX.2 Klein 4B' },
    { value: 'Flux.2 Klein 4B-base', label: 'FLUX.2 Klein 4B Base' },
    { value: 'Flux.2 Klein 9B', label: 'FLUX.2 Klein 9B' },
    { value: 'Flux.2 Klein 9B-base', label: 'FLUX.2 Klein 9B Base' },
    { value: 'Qwen', label: 'Qwen' },
    { value: 'Qwen 2', label: 'Qwen 2' },
    { value: 'Qwen 3', label: 'Qwen 3' },
    { value: 'ZImageBase', label: 'Z-Image Base' },
    { value: 'ZImageTurbo', label: 'Z-Image Turbo' },
    { value: 'LTXV 2.3', label: 'LTX Video 2.3' },
] as const;

const MODEL_TYPE_OPTIONS = [
    { value: 'all', label: 'All model types' },
    { value: 'Checkpoint', label: 'Checkpoint' },
    { value: 'LORA', label: 'LoRA' },
    { value: 'LoCon', label: 'LoCon' },
    { value: 'DoRA', label: 'DoRA' },
    { value: 'UNet', label: 'UNet' },
    { value: 'VAE', label: 'VAE' },
    { value: 'TextEncoder', label: 'Text encoder' },
    { value: 'CLIP', label: 'CLIP' },
    { value: 'Controlnet', label: 'ControlNet' },
    { value: 'Upscaler', label: 'Upscaler' },
    { value: 'TextualInversion', label: 'Textual inversion' },
    { value: 'MotionModule', label: 'Motion module' },
    { value: 'Workflows', label: 'Workflow' },
    { value: 'ComfyWorkflows', label: 'ComfyUI workflow' },
    { value: 'Other', label: 'Other' },
] as const;

const RESULT_TYPE_OPTIONS = [
    { value: 'all', label: 'All result types' },
    { value: 'version', label: 'Model versions' },
    { value: 'file', label: 'Files' },
    { value: 'user', label: 'Creators' },
    { value: 'article', label: 'Articles' },
] as const;

const PLATFORM_OPTIONS = [
    { value: 'all', label: 'All platforms' },
    { value: 'civitai', label: 'CivitAI' },
    { value: 'huggingface', label: 'Hugging Face' },
    { value: 'tensorart', label: 'TensorArt' },
    { value: 'tensorhub', label: 'TensorHub' },
    { value: 'seaart', label: 'SeaArt' },
    { value: 'shakker', label: 'Shakker' },
    { value: 'pixai', label: 'PixAI' },
    { value: 'tungsten', label: 'Tungsten' },
    { value: 'civision', label: 'Civision' },
    { value: 'yodayo', label: 'Yodayo' },
    { value: 'moescape', label: 'Moescape' },
] as const;

const SORT_OPTIONS = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'top', label: 'Most downloaded' },
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'deleted_newest', label: 'Recently deleted' },
    { value: 'deleted_oldest', label: 'Oldest deleted' },
] as const;

const PERIOD_OPTIONS = [
    { value: 'all', label: 'All time' },
    { value: 'week', label: 'Past week' },
    { value: 'month', label: 'Past month' },
    { value: 'quarter', label: 'Past quarter' },
    { value: 'half', label: 'Past 6 months' },
    { value: 'year', label: 'Past year' },
] as const;

const RATING_OPTIONS = [
    { value: 'all', label: 'All ratings' },
    { value: 'safe', label: 'Safe only' },
    { value: 'explicit', label: 'Explicit only' },
] as const;

const STATUS_OPTIONS = [
    { value: 'all', label: 'Any availability' },
    { value: 'available', label: 'Available' },
    { value: 'deleted', label: 'Deleted / archived' },
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]['value'];

type ArchiveSearchResult = Awaited<ReturnType<NonNullable<typeof window.electron>['searchCivitaiArchive']>>;
type ArchiveSearchItem = ArchiveSearchResult['items'][number];
type ArchiveDetails = Awaited<ReturnType<NonNullable<typeof window.electron>['getCivitaiArchiveDetails']>>;
type ArchiveFamily = Exclude<CivitaiFamily, 'all'>;
type ArchiveDownloadState = { id: string; fileName: string; receivedBytes: number; totalBytes: number; status: 'downloading' | 'complete' | 'error'; message?: string };

const inferArchiveFamily = (baseModel: string, name: string): ArchiveFamily => {
    const identity = `${baseModel} ${name}`.toLowerCase();
    if (/flux[- ._]?2|klein/.test(identity)) return 'flux2';
    if (/krea[- ._]?2/.test(identity)) return 'krea2';
    if (/qwen.*edit|edit.*qwen/.test(identity)) return 'qwen-edit';
    if (/\bqwen\b/.test(identity)) return 'qwen';
    if (/z[-_ ]?image.*turbo|turbo.*z[-_ ]?image/.test(identity)) return 'zit-turbo';
    if (/z[-_ ]?image|\bzit\b/.test(identity)) return 'zit-base';
    if (/\bltx/.test(identity)) return 'ltx-23';
    if (/\bflux(?:[ ._-]?1)?\b/.test(identity)) return 'flux';
    if (/sdxl|pony|illustrious|noobai/.test(identity)) return 'sdxl';
    return 'sd15';
};

const getArchiveDestination = (modelType: string, family: ArchiveFamily): CivitaiDestination => {
    if (/lora|locon|dora/i.test(modelType)) return 'lora';
    return ['flux', 'flux2', 'krea2', 'qwen', 'qwen-edit', 'zit-base', 'zit-turbo', 'ltx-23'].includes(family) ? 'diffusion' : 'checkpoint';
};

const getArchiveFolder = (family: ArchiveFamily, destination: CivitaiDestination, identity: string): CivitaiModelFolder => {
    if (family === 'sd15') return destination === 'checkpoint' ? 'SD1.5' : 'sd15';
    if (family === 'sdxl') return 'SDXL';
    if (family === 'flux') return destination === 'checkpoint' ? (/dev/i.test(identity) ? 'flux-dev' : 'FLUX') : 'Flux';
    if (family === 'flux2') return 'flux2';
    if (family === 'krea2') return 'krea';
    if (family === 'qwen' || family === 'qwen-edit') return 'QWEN';
    if (family === 'zit-base' || family === 'zit-turbo') return 'ZIT';
    return /camera[ _-]*control|control[ _-]*camera/i.test(identity) ? 'LTX2_camera_control' : 'LTX2';
};

const normalizeFileName = (value: string) => {
    try {
        return decodeURIComponent(value).replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    } catch {
        return value.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    }
};

const findOwnedArchiveItem = (item: ArchiveSearchItem, inventoryItems: CivitaiInventoryItem[]) => {
    const sha256 = item.sha256?.toUpperCase();
    if (sha256) {
        const hashMatch = inventoryItems.find(candidate => candidate.sha256?.toUpperCase() === sha256);
        if (hashMatch) return hashMatch;
    }
    return item.versionId == null ? undefined : inventoryItems.find(candidate =>
        candidate.installedVersionId != null
        && String(candidate.installedVersionId) === String(item.versionId));
};

const findOwnedArchiveFile = (details: ArchiveDetails, file: ArchiveDetails['files'][number], inventoryItems: CivitaiInventoryItem[]) => {
    const sha256 = file.sha256?.toUpperCase();
    if (sha256) {
        const hashMatch = inventoryItems.find(candidate => candidate.sha256?.toUpperCase() === sha256);
        if (hashMatch) return hashMatch;
    }
    const fileNames = new Set([file.name, ...file.mirrors.map(mirror => mirror.fileName)].map(normalizeFileName).filter(Boolean));
    return inventoryItems.find(candidate => candidate.installedVersionId === details.versionId
        && (fileNames.has(normalizeFileName(candidate.fileName))
            || Boolean(candidate.archiveInfo?.mirrors.some(mirror => fileNames.has(normalizeFileName(mirror.fileName))))));
};

const ArchiveModelCard: React.FC<{
    item: ArchiveSearchItem;
    inventoryItems: CivitaiInventoryItem[];
    download: ArchiveDownloadState | null;
    onDownload: (item: ArchiveSearchItem, details: ArchiveDetails, file: ArchiveDetails['files'][number], mirror: ArchiveDetails['files'][number]['mirrors'][number], destination: CivitaiDestination, folder: CivitaiModelFolder, family: ArchiveFamily) => void;
    onOpenOwned: (item: CivitaiInventoryItem) => void;
}> = ({ item, inventoryItems, download, onDownload, onOpenOwned }) => {
    const [details, setDetails] = useState<ArchiveDetails | null>(null);
    const [detailError, setDetailError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fileId, setFileId] = useState('');
    const [mirrorUrl, setMirrorUrl] = useState('');
    const family = inferArchiveFamily(details?.baseModel || item.baseModel || '', details?.modelName || item.name);
    const [destination, setDestination] = useState<CivitaiDestination>(() => getArchiveDestination(item.type || '', family));
    const selectedFile = details?.files.find(file => file.id === fileId) || details?.files.find(file => file.primary) || details?.files[0];
    const selectedMirror = selectedFile?.mirrors.find(mirror => mirror.url === mirrorUrl) || selectedFile?.mirrors[0];
    const folder = getArchiveFolder(family, destination, `${details?.baseModel || item.baseModel || ''} ${details?.versionName || ''} ${item.name}`);
    const ownedItem = details && selectedFile
        ? findOwnedArchiveFile(details, selectedFile, inventoryItems)
        : findOwnedArchiveItem(item, inventoryItems);
    const active = download?.status === 'downloading' && download.fileName === selectedMirror?.fileName;
    const progress = download?.totalBytes ? Math.min(100, Math.round(download.receivedBytes / download.totalBytes * 100)) : 0;

    const loadDetails = async (url = item.url, versionId?: string) => {
        setLoading(true);
        setDetailError('');
        try {
            if (!window.electron) throw new Error('Download options require the Electron desktop app.');
            const next = await window.electron.getCivitaiArchiveDetails({ url, versionId });
            setDetails(next);
            const primary = next.files.find(file => file.primary) || next.files[0];
            setFileId(primary?.id || '');
            setMirrorUrl(primary?.mirrors[0]?.url || '');
            const nextFamily = inferArchiveFamily(next.baseModel, next.modelName);
            setDestination(getArchiveDestination(next.modelType, nextFamily));
        } catch (error) {
            setDetailError(error instanceof Error ? error.message : 'Download options could not be loaded.');
        } finally {
            setLoading(false);
        }
    };

    const changeVersion = (versionId: string) => {
        const version = details?.versions.find(candidate => candidate.id === versionId);
        if (version) loadDetails(version.url, version.id);
    };

    const changeFile = (nextFileId: string) => {
        setFileId(nextFileId);
        setMirrorUrl(details?.files.find(file => file.id === nextFileId)?.mirrors[0]?.url || '');
    };

    return (
        <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-primary bg-bg-secondary">
            <div className="relative aspect-[16/10] overflow-hidden bg-bg-tertiary">
                {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-text-muted"><ImageIcon className="h-8 w-8" /></div>}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                    {item.type && <span className="rounded bg-black/80 px-2 py-1 text-[10px] font-bold text-white">{item.type}</span>}
                    {item.deleted && <span className="rounded bg-amber-400 px-2 py-1 text-[10px] font-bold text-black">DELETED</span>}
                    {item.nsfw && <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">NSFW</span>}
                </div>
                {ownedItem && <span className="absolute right-3 top-3 rounded bg-emerald-400 px-2 py-1 text-[10px] font-bold text-black">OWNED</span>}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                    <a href={item.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-bold text-text-primary hover:underline">{item.name}</a>
                    <p className="mt-1 text-xs text-text-muted">{[details?.baseModel || item.baseModel, item.username && `by ${item.username}`].filter(Boolean).join(' · ') || 'Archive result'}</p>
                    <p className="mt-1 text-[11px] text-text-muted">{(item.platform || item.kind || 'CivArchive').toUpperCase()} · {item.downloadCount.toLocaleString()} downloads</p>
                </div>

                {ownedItem && <button type="button" onClick={() => onOpenOwned(ownedItem)} className="inline-flex w-full items-center justify-center gap-2 rounded-md border-2 border-emerald-300 bg-emerald-400 px-3 py-3 text-sm font-black text-black hover:bg-emerald-300"><CheckIcon className="h-5 w-5" />ALREADY IN MY LIBRARY<LibraryIcon className="h-5 w-5" /></button>}

                {!details && <button type="button" onClick={() => loadDetails()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-500 px-3 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">{loading && <SpinnerIcon className="h-4 w-4 animate-spin" />}{loading ? 'Loading options...' : 'Download options'}</button>}
                {detailError && <p className="text-xs text-red-400">{detailError}</p>}

                {details && <div className="space-y-3">
                    {details.versions.length > 1 && <label className="block text-xs text-text-secondary">Version<MenuSelect value={String(details.versionId || details.versions[0]?.id || '')} options={details.versions.map(version => ({ value: version.id, label: version.name }))} onChange={changeVersion} ariaLabel="Archive model version" className="mt-1" /></label>}
                    <label className="block text-xs text-text-secondary">File<MenuSelect value={selectedFile?.id || ''} options={details.files.map(file => ({ value: file.id, label: `${file.name} · ${formatModelSize(file.sizeKB)}` }))} onChange={changeFile} ariaLabel="Archive model file" className="mt-1" /></label>
                    {selectedFile && <label className="block text-xs text-text-secondary">Source<MenuSelect value={selectedMirror?.url || ''} options={selectedFile.mirrors.map(mirror => ({ value: mirror.url, label: `${mirror.source} · ${mirror.fileName}` }))} onChange={setMirrorUrl} ariaLabel="Archive download source" className="mt-1" /></label>}
                    <label className="block text-xs text-text-secondary">ComfyUI destination<MenuSelect value={destination} options={[{ value: 'checkpoint', label: `models/checkpoints/${getArchiveFolder(family, 'checkpoint', item.name)}` }, { value: 'diffusion', label: `models/diffusion_models/${getArchiveFolder(family, 'diffusion', item.name)}` }, { value: 'lora', label: `models/loras/${getArchiveFolder(family, 'lora', item.name)}` }]} onChange={setDestination} ariaLabel="Archive ComfyUI destination" className="mt-1" /></label>
                    {selectedFile && <p className="text-[11px] text-text-muted">{formatModelSize(selectedFile.sizeKB)} · {selectedFile.type} · {selectedFile.sha256 ? 'SHA-256 verified' : 'No archive hash'}</p>}
                    {download && download.fileName === selectedMirror?.fileName && <div className="space-y-1" aria-live="polite"><div className="h-1.5 overflow-hidden rounded bg-bg-tertiary"><div className={`h-full ${download.status === 'error' ? 'bg-red-500' : download.status === 'complete' ? 'bg-emerald-500' : 'bg-emerald-500'}`} style={{ width: download.status === 'complete' ? '100%' : download.totalBytes ? `${progress}%` : '30%' }} /></div><p className={`text-xs ${download.status === 'error' ? 'text-red-400' : 'text-text-secondary'}`}>{download.message || (download.totalBytes ? `${progress}%` : formatModelSize(download.receivedBytes / 1024))}</p></div>}
                    <button type="button" disabled={!selectedFile || !selectedMirror || active || Boolean(ownedItem)} onClick={() => selectedFile && selectedMirror && onDownload(item, details, selectedFile, selectedMirror, destination, folder, family)} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{active ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}{active ? 'Downloading...' : ownedItem ? 'Already installed' : 'Download'}</button>
                </div>}
            </div>
        </article>
    );
};

interface ArchiveCivitPanelProps {
    inventoryItems: CivitaiInventoryItem[];
    comfyUIRoot: string;
    onOpenOwned: (item: CivitaiInventoryItem) => void;
    onDownloadComplete: (path: string, destination: CivitaiDestination, family: CivitaiFamily) => Promise<void>;
}

export const ArchiveCivitPanel: React.FC<ArchiveCivitPanelProps> = ({ inventoryItems, comfyUIRoot, onOpenOwned, onDownloadComplete }) => {
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<OptionValue<typeof FAMILY_OPTIONS>>('all');
    const [modelType, setModelType] = useState<OptionValue<typeof MODEL_TYPE_OPTIONS>>('all');
    const [resultType, setResultType] = useState<OptionValue<typeof RESULT_TYPE_OPTIONS>>('all');
    const [platform, setPlatform] = useState<OptionValue<typeof PLATFORM_OPTIONS>>('all');
    const [sort, setSort] = useState<OptionValue<typeof SORT_OPTIONS>>('relevance');
    const [period, setPeriod] = useState<OptionValue<typeof PERIOD_OPTIONS>>('all');
    const [rating, setRating] = useState<OptionValue<typeof RATING_OPTIONS>>('all');
    const [status, setStatus] = useState<OptionValue<typeof STATUS_OPTIONS>>('all');
    const [hideOwned, setHideOwned] = useState(false);
    const [result, setResult] = useState<ArchiveSearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [download, setDownload] = useState<ArchiveDownloadState | null>(null);

    useEffect(() => {
        if (!window.electron) return;
        return window.electron.onCivitaiDownloadProgress(progress => {
            setDownload(current => current?.id === progress.downloadId ? { ...current, receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes || current.totalBytes } : current);
        });
    }, []);

    const search = async (page = 1) => {
        setIsSearching(true);
        setError('');
        try {
            if (!window.electron) throw new Error('CivArchive integrated results require the Electron desktop app.');
            setResult(await window.electron.searchCivitaiArchive({
                q: query.trim(),
                type: modelType,
                base_model: family,
                kind: resultType,
                platform,
                sort,
                period,
                rating,
                platform_status: status,
                page,
            }));
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : 'CivArchive search failed.');
            setResult(null);
        } finally {
            setIsSearching(false);
        }
    };

    const startDownload = async (item: ArchiveSearchItem, details: ArchiveDetails, file: ArchiveDetails['files'][number], mirror: ArchiveDetails['files'][number]['mirrors'][number], destination: CivitaiDestination, modelFolder: CivitaiModelFolder, archiveFamily: ArchiveFamily) => {
        const downloadId = crypto.randomUUID();
        setDownload({ id: downloadId, fileName: mirror.fileName, receivedBytes: 0, totalBytes: file.sizeKB * 1024, status: 'downloading' });
        try {
            if (!window.electron) throw new Error('CivArchive downloads require the Electron desktop app.');
            if (!comfyUIRoot) throw new Error('Select your ComfyUI folder in the Civitai tab first.');
            const saved = await window.electron.downloadCivitaiArchiveModel({
                downloadId,
                url: mirror.url,
                source: mirror.source,
                fileName: mirror.fileName,
                destination,
                modelFolder,
                sha256: file.sha256,
                archiveUrl: item.url,
                modelName: details.modelName,
                modelType: details.modelType,
                modelId: details.modelId,
                versionId: details.versionId,
                baseModel: details.baseModel,
                versionName: details.versionName,
                nsfw: item.nsfw,
                family: archiveFamily,
            });
            setDownload(current => current?.id === downloadId ? { ...current, status: 'complete', receivedBytes: saved.receivedBytes, message: `Saved to ${saved.path}` } : current);
            await onDownloadComplete(saved.path, destination, archiveFamily);
        } catch (downloadError) {
            const message = downloadError instanceof Error ? downloadError.message : 'CivArchive download failed.';
            setDownload(current => current?.id === downloadId ? { ...current, status: 'error', message } : current);
        }
    };

    const resetFilters = () => {
        setFamily('all');
        setModelType('all');
        setResultType('all');
        setPlatform('all');
        setSort('relevance');
        setPeriod('all');
        setRating('all');
        setStatus('all');
        setHideOwned(false);
    };

    const visibleItems = useMemo(
        () => result?.items.filter(item => !hideOwned || !findOwnedArchiveItem(item, inventoryItems)) || [],
        [hideOwned, inventoryItems, result],
    );
    const hiddenOwnedCount = (result?.items.length || 0) - visibleItems.length;

    return (
        <section className="space-y-5">
            <div className="border-l-4 border-emerald-500 pl-4">
                <h2 className="text-xl font-bold text-text-primary">ArchiveCivit</h2>
                <p className="text-sm text-text-secondary mt-1">Search archived models and mirrors by filename, model name, SHA-256, or Civitai link.</p>
            </div>
            <form onSubmit={event => { event.preventDefault(); search(1); }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filename, model name, SHA-256, or Civitai URL" className="bg-bg-tertiary border border-border-primary rounded-md px-3 py-2.5 text-text-primary" />
                    <button type="submit" disabled={isSearching} className="px-5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50">{isSearching ? 'Searching...' : 'Search ArchiveCivit'}</button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MenuSelect value={family} options={FAMILY_OPTIONS} onChange={setFamily} ariaLabel="Model family" />
                    <MenuSelect value={modelType} options={MODEL_TYPE_OPTIONS} onChange={setModelType} ariaLabel="Model type" />
                    <MenuSelect value={resultType} options={RESULT_TYPE_OPTIONS} onChange={setResultType} ariaLabel="Result type" />
                    <MenuSelect value={platform} options={PLATFORM_OPTIONS} onChange={setPlatform} ariaLabel="Platform" />
                    <MenuSelect value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Sort results" />
                    <MenuSelect value={period} options={PERIOD_OPTIONS} onChange={setPeriod} ariaLabel="Time period" />
                    <MenuSelect value={rating} options={RATING_OPTIONS} onChange={setRating} ariaLabel="Content rating" />
                    <MenuSelect value={status} options={STATUS_OPTIONS} onChange={setStatus} ariaLabel="Availability" />
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-secondary">
                        <input type="checkbox" checked={hideOwned} onChange={event => setHideOwned(event.target.checked)} className="h-4 w-4 accent-emerald-500" />
                        Hide models already owned{hiddenOwnedCount > 0 ? ` (${hiddenOwnedCount})` : ''}
                    </label>
                    <button type="button" onClick={resetFilters} className="shrink-0 px-3 py-1.5 rounded-md border border-border-primary hover:bg-bg-tertiary text-text-secondary">Reset filters</button>
                </div>
            </form>
            {error && <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
            {isSearching ? <div className="grid min-h-64 place-items-center border-y border-border-primary"><div className="flex items-center gap-3 text-text-secondary"><SpinnerIcon className="h-6 w-6 animate-spin" /><span>Searching CivArchive...</span></div></div>
                : result && visibleItems.length > 0 ? <>
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-text-primary">{result.total.toLocaleString()} results{hiddenOwnedCount > 0 ? ` · ${hiddenOwnedCount} owned hidden on this page` : ''}</p><p className="text-xs text-text-muted">Page {result.page} of {Math.max(1, Math.ceil(result.total / 50))}</p></div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {visibleItems.map(item => <ArchiveModelCard key={item.id} item={item} inventoryItems={inventoryItems} download={download} onDownload={startDownload} onOpenOwned={onOpenOwned} />)}
                    </div>
                    <div className="flex items-center justify-center gap-3">
                        <button type="button" onClick={() => search(result.page - 1)} disabled={result.page <= 1 || isSearching} className="rounded-md border border-border-primary px-4 py-2 text-sm font-bold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40">Previous</button>
                        <button type="button" onClick={() => search(result.page + 1)} disabled={result.page >= Math.ceil(result.total / 50) || isSearching} className="rounded-md border border-border-primary px-4 py-2 text-sm font-bold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40">Next</button>
                    </div>
                </> : result ? <div className="border-y border-border-primary py-12 text-center text-sm text-text-muted">{hideOwned && result.items.length > 0 ? 'All results on this page are already in your library.' : 'No matching result found.'}</div>
                    : <div className="border-y border-border-primary py-12 text-center text-sm text-text-muted">Choose filters and search to browse CivArchive models directly on this page.</div>}
        </section>
    );
};