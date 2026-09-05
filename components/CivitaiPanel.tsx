import React, { useCallback, useEffect, useState } from 'react';
import {
    CIVITAI_FAMILIES,
    CIVITAI_SORTS,
    CivitaiDestination,
    CivitaiFamily,
    CivitaiFile,
    CivitaiInventory,
    CivitaiInventoryItem,
    CivitaiModel,
    CivitaiModelType,
    CivitaiModelVersion,
    CivitaiProvider,
    CivitaiSort,
    formatModelSize,
    getCivitaiAccountUrl,
    getCivitaiDestinationFolder,
    getCivitaiModelUrl,
    getDefaultDestination,
    getPreviewMedia,
    searchCivitaiModels,
} from '../services/civitaiService';
import { CloseIcon, DownloadIcon, SpinnerIcon } from './icons';
import { CivitaiInventoryPanel } from './CivitaiInventoryPanel';
import { ArchiveCivitPanel } from './ArchiveCivitPanel';
import { MenuSelect } from './MenuSelect';

interface DownloadState {
    id: string;
    fileName: string;
    receivedBytes: number;
    totalBytes: number;
    status: 'downloading' | 'complete' | 'error' | 'cancelled';
    message?: string;
}

const EMPTY_INVENTORY: CivitaiInventory = { scannedAt: null, root: '', items: [] };
const NSFW_QUERY = /\b(?:nsfw|nude|naked|porn|sex|erotic|hentai|xxx)\b/i;

const isNsfwModel = (model: CivitaiModel) => {
    const identity = [model.name, ...(model.tags || [])].join(' ');
    return model.nsfw === true || NSFW_QUERY.test(identity);
};

const getStoredKey = (provider: CivitaiProvider) => localStorage.getItem(`civitai_${provider}_api_key`) || '';

const getNextCursor = (metadata?: { nextCursor?: string; nextPage?: string }): string | undefined => {
    if (metadata?.nextCursor) return metadata.nextCursor;
    if (!metadata?.nextPage) return undefined;
    try {
        return new URL(metadata.nextPage).searchParams.get('cursor') || undefined;
    } catch {
        return undefined;
    }
};

const ModelCard: React.FC<{
    model: CivitaiModel;
    provider: CivitaiProvider;
    family: CivitaiFamily;
    inventoryItems: CivitaiInventoryItem[];
    download: DownloadState | null;
    onDownload: (model: CivitaiModel, version: CivitaiModelVersion, file: CivitaiFile, destination: CivitaiDestination) => void;
    onCancel: () => void;
}> = ({ model, provider, family, inventoryItems, download, onDownload, onCancel }) => {
    const versions = model.modelVersions.filter(version => version.files?.length);
    const ownedItems = inventoryItems.filter(item => item.modelId === model.id);
    const updateItem = ownedItems.find(item => item.hasUpdate);
    const preferredVersionId = updateItem?.latestVersionId;
    const [versionId, setVersionId] = useState(() => versions.some(version => version.id === preferredVersionId) ? preferredVersionId || 0 : versions[0]?.id || 0);
    const selectedVersion = versions.find(version => version.id === versionId) || versions[0];
    const downloadableFiles = selectedVersion?.files.filter(file => file.downloadUrl && file.type !== 'Config') || [];
    const primaryFile = downloadableFiles.find(file => file.primary) || downloadableFiles[0];
    const [fileId, setFileId] = useState(primaryFile?.id || 0);
    const selectedFile = downloadableFiles.find(file => file.id === fileId) || primaryFile;
    const [destination, setDestination] = useState<CivitaiDestination>(() => getDefaultDestination(model, selectedVersion, family));
    const modelFolder = getCivitaiDestinationFolder(model, selectedVersion, family, destination);
    const preview = getPreviewMedia(model);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const isActive = download?.status === 'downloading' && download.fileName === selectedFile?.name;
    const progress = download?.totalBytes ? Math.min(100, Math.round(download.receivedBytes / download.totalBytes * 100)) : 0;

    const changeVersion = (id: number) => {
        setVersionId(id);
        const nextVersion = versions.find(version => version.id === id);
        const nextFiles = nextVersion?.files.filter(file => file.downloadUrl && file.type !== 'Config') || [];
        setFileId((nextFiles.find(file => file.primary) || nextFiles[0])?.id || 0);
        if (nextVersion) setDestination(getDefaultDestination(model, nextVersion, family));
    };

    return (
        <article className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden flex flex-col min-w-0">
            <div className="aspect-[16/10] bg-bg-tertiary overflow-hidden relative">
                {preview?.type === 'video' ? (
                    videoPlaying ? <video src={preview.url} muted loop controls autoPlay playsInline preload="metadata" className="w-full h-full object-cover" /> : <button type="button" onClick={() => setVideoPlaying(true)} className="w-full h-full grid place-items-center text-sm font-bold text-white bg-black/60 hover:bg-black/50">Play video</button>
                ) : preview ? (
                    <img src={preview.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full grid place-items-center text-text-muted text-sm">No preview</div>
                )}
                <span className={`absolute left-3 top-3 px-2 py-1 text-[11px] font-bold rounded ${model.type.toUpperCase() === 'LORA' ? 'bg-amber-500 text-black' : 'bg-black/75 text-white'}`}>
                    {model.type}
                </span>
                {ownedItems.length > 0 && (
                    <span className={`absolute right-3 top-3 px-2 py-1 text-[11px] font-bold rounded text-black ${updateItem ? 'bg-amber-400' : 'bg-emerald-400'}`}>
                        {updateItem ? 'Update available' : 'Owned'}
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="min-w-0">
                    <a href={getCivitaiModelUrl(provider, model.id)} target="_blank" rel="noreferrer" className="font-bold text-text-primary hover:underline line-clamp-2">
                        {model.name}
                    </a>
                    <p className="text-xs text-text-muted mt-1">
                        {model.creator?.username || 'Unknown creator'} · {(model.stats?.downloadCount || 0).toLocaleString()} downloads
                    </p>
                </div>

                <label className="text-xs text-text-secondary">
                    Version
                    <MenuSelect value={selectedVersion?.id || 0} onChange={changeVersion} ariaLabel="Model version" className="mt-1" options={versions.map(version => ({ value: version.id, label: `${version.name} · ${version.baseModel}` }))} />
                </label>

                <label className="text-xs text-text-secondary">
                    File
                    <MenuSelect value={selectedFile?.id || 0} onChange={setFileId} ariaLabel="Model file" className="mt-1" options={downloadableFiles.map(file => ({ value: file.id, label: `${file.name} · ${formatModelSize(file.sizeKB)}` }))} />
                </label>

                <label className="text-xs text-text-secondary">
                    ComfyUI destination
                    <MenuSelect value={destination} onChange={setDestination} ariaLabel="ComfyUI destination" className="mt-1" options={[{ value: 'checkpoint', label: `models/checkpoints/${modelFolder}` }, { value: 'diffusion', label: `models/diffusion_models/${modelFolder}` }, { value: 'lora', label: `models/loras/${modelFolder}` }]} />
                </label>

                {selectedFile && (
                    <div className="text-[11px] text-text-muted flex flex-wrap gap-x-3 gap-y-1">
                        <span>{formatModelSize(selectedFile.sizeKB)}</span>
                        <span>{selectedFile.metadata?.format || selectedFile.type}</span>
                        {selectedFile.virusScanResult && <span>Virus scan: {selectedFile.virusScanResult}</span>}
                    </div>
                )}

                {download && download.fileName === selectedFile?.name && (
                    <div className="space-y-1" aria-live="polite">
                        <div className="h-1.5 bg-bg-tertiary rounded overflow-hidden">
                            <div className={`h-full transition-all ${download.status === 'error' ? 'bg-red-500' : download.status === 'complete' ? 'bg-emerald-500' : provider === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: download.status === 'complete' ? '100%' : download.totalBytes ? `${progress}%` : '30%' }} />
                        </div>
                        <p className={`text-xs ${download.status === 'error' ? 'text-red-400' : 'text-text-secondary'}`}>
                            {download.message || (download.totalBytes ? `${progress}%` : formatModelSize(download.receivedBytes / 1024))}
                        </p>
                    </div>
                )}

                <div className="mt-auto flex gap-2">
                    <button
                        onClick={() => selectedVersion && selectedFile && onDownload(model, selectedVersion, selectedFile, destination)}
                        disabled={!selectedFile || isActive}
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold text-white disabled:opacity-50 ${provider === 'red' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                    >
                        {isActive ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
                        {isActive ? 'Downloading' : 'Download'}
                    </button>
                    {isActive && (
                        <button onClick={onCancel} className="p-2 border border-red-500 text-red-400 rounded-md hover:bg-red-500/10" title="Cancel download" aria-label="Cancel download">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
};

export const CivitaiPanel: React.FC = React.memo(() => {
    const localAccessAvailable = Boolean(window.electron);
    const [activeSection, setActiveSection] = useState<'catalog' | 'library' | 'archive' | 'tools'>('library');
    const [provider, setProvider] = useState<CivitaiProvider>('regular');
    const [keys, setKeys] = useState<Record<CivitaiProvider, string>>({ regular: '', red: '' });
    const [comfyUIRoot, setComfyUIRoot] = useState('');
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<CivitaiFamily>('all');
    const [modelType, setModelType] = useState<'all' | CivitaiModelType>('all');
    const [sort, setSort] = useState<CivitaiSort>('Highest Rated');
    const [models, setModels] = useState<CivitaiModel[]>([]);
    const [nextCursor, setNextCursor] = useState<string>();
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');
    const [settingsMessage, setSettingsMessage] = useState('');
    const [download, setDownload] = useState<DownloadState | null>(null);
    const [inventory, setInventory] = useState<CivitaiInventory>(EMPTY_INVENTORY);
    const [isScanning, setIsScanning] = useState(false);
    const [isOrganizing, setIsOrganizing] = useState(false);
    const [organizeMessage, setOrganizeMessage] = useState('');
    const [scanProgress, setScanProgress] = useState<{ completed: number; total: number; fileName: string; stage: string } | null>(null);
    const [focusedInventoryPath, setFocusedInventoryPath] = useState<string | null>(null);
    const [classificationStatus, setClassificationStatus] = useState<{ phase: 'working' | 'updating' | 'complete' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (window.electron) {
            window.electron.getCivitaiSettings().then(settings => {
                setKeys({ regular: settings.regularApiKey || '', red: settings.redApiKey || '' });
                setComfyUIRoot(settings.comfyUIRoot || '');
            });
            window.electron.getCivitaiInventory().then(setInventory);
        } else {
            setKeys({ regular: getStoredKey('regular'), red: getStoredKey('red') });
        }
    }, []);

    useEffect(() => {
        if (!window.electron) return;
        return window.electron.onCivitaiDownloadProgress(progress => {
            setDownload(current => current?.id === progress.downloadId ? { ...current, receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes } : current);
        });
    }, []);

    useEffect(() => {
        if (!window.electron) return;
        return window.electron.onCivitaiScanProgress(setScanProgress);
    }, []);

    const saveKeys = async () => {
        if (window.electron) {
            await Promise.all([
                window.electron.setCivitaiApiKey('regular', keys.regular),
                window.electron.setCivitaiApiKey('red', keys.red),
            ]);
        } else {
            localStorage.setItem('civitai_regular_api_key', keys.regular.trim());
            localStorage.setItem('civitai_red_api_key', keys.red.trim());
        }
        setSettingsMessage('API keys saved locally.');
    };

    const selectRoot = async () => {
        const selected = await window.electron?.selectComfyUIRoot();
        if (selected) {
            setComfyUIRoot(selected);
            setInventory(EMPTY_INVENTORY);
        }
    };

    const scanLibrary = async (options: { kind: 'all' | 'lora' | 'checkpoint' | 'diffusion'; family: CivitaiFamily }) => {
        if (!window.electron) {
            setError('Local inventory scanning is available in the Electron app.');
            return;
        }
        setIsScanning(true);
        setError('');
        setScanProgress(null);
        try {
            setInventory(await window.electron.scanCivitaiLibrary({ provider: 'regular', ...options }));
        } catch (scanError) {
            setError(scanError instanceof Error ? scanError.message : 'Local model scan failed.');
        } finally {
            setIsScanning(false);
        }
    };

    const organizeModelRoot = async () => {
        if (!window.electron) {
            setError('Root model classification is available in the Electron app.');
            return;
        }
        if (!window.confirm('Identify and classify recognized files placed directly in models/loras and models/checkpoints? Unknown files and conflicts will remain untouched.')) return;
        setIsOrganizing(true);
        setError('');
        setOrganizeMessage('');
        setScanProgress(null);
        try {
            const result = await window.electron.classifyCivitaiModelRoot('regular');
            setOrganizeMessage(`${result.moved} moved · ${result.unmatched} unmatched · ${result.conflicts} conflicts · ${result.errors} errors. Refreshing library...`);
            const refreshedInventory = await window.electron.scanCivitaiLibrary({ provider: 'regular', kind: 'all', family: 'all' });
            setInventory(refreshedInventory);
            setOrganizeMessage(`${result.moved} moved · ${result.unmatched} unmatched · ${result.conflicts} conflicts · ${result.errors} errors. Library refreshed.`);
        } catch (organizeError) {
            setError(organizeError instanceof Error ? organizeError.message : 'Model root classification failed.');
        } finally {
            setIsOrganizing(false);
        }
    };

    const search = async (append = false) => {
        setIsSearching(true);
        setError('');
        try {
            const searchProvider: CivitaiProvider = NSFW_QUERY.test(query) ? 'red' : provider;
            if (searchProvider !== provider) setProvider(searchProvider);
            const result = await searchCivitaiModels({ provider: searchProvider, apiKey: keys[searchProvider], query, family, modelType, sort, cursor: append ? nextCursor : undefined });
            const filteredItems = result.items.filter(model => searchProvider === 'red' ? isNsfwModel(model) : !isNsfwModel(model));
            setModels(current => append ? [...current, ...filteredItems] : filteredItems);
            setNextCursor(getNextCursor(result.metadata));
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : 'Search failed.');
            if (!append) setModels([]);
        } finally {
            setIsSearching(false);
        }
    };

    const startDownload = async (model: CivitaiModel, version: CivitaiModelVersion, file: CivitaiFile, destination: CivitaiDestination) => {
        const downloadId = crypto.randomUUID();
        setDownload({ id: downloadId, fileName: file.name, receivedBytes: 0, totalBytes: file.sizeKB * 1024, status: 'downloading' });
        try {
            if (window.electron) {
                if (!comfyUIRoot) throw new Error('Select your ComfyUI folder first.');
                const modelFolder = getCivitaiDestinationFolder(model, version, family, destination);
                const result = await window.electron.downloadCivitaiModel({
                    downloadId,
                    provider,
                    url: file.downloadUrl,
                    fileName: file.name,
                    destination,
                    modelFolder,
                    modelId: model.id,
                    modelVersionId: version.id,
                    versionName: version.name,
                });
                setDownload(current => current?.id === downloadId ? { ...current, status: 'complete', receivedBytes: result.receivedBytes, message: `Saved to ${result.path}` } : current);
            } else {
                const url = new URL(file.downloadUrl);
                if (keys[provider]) url.searchParams.set('token', keys[provider]);
                const anchor = document.createElement('a');
                anchor.href = url.toString();
                anchor.download = file.name;
                anchor.click();
                setDownload(current => current?.id === downloadId ? { ...current, status: 'complete', message: 'Download opened in your browser.' } : current);
            }
        } catch (downloadError) {
            const message = downloadError instanceof Error ? downloadError.message : 'Download failed.';
            setDownload(current => current?.id === downloadId ? { ...current, status: message.toLowerCase().includes('cancel') ? 'cancelled' : 'error', message } : current);
        }
    };

    const cancelDownload = async () => {
        if (!download || download.status !== 'downloading') return;
        await window.electron?.cancelCivitaiDownload(download.id);
    };

    const openInventoryItem = useCallback((item: CivitaiInventoryItem) => {
        setProvider((item.safetyOverride || item.contentSafety) === 'nsfw' ? 'red' : 'regular');
        setFocusedInventoryPath(item.path);
        setActiveSection('library');
    }, []);

    const replaceInventoryItem = useCallback((updatedItem: CivitaiInventoryItem) => {
        setInventory(current => ({
            ...current,
            items: current.items.map(item => item.path === updatedItem.path ? updatedItem : item),
        }));
    }, []);

    const classifyInventoryItem = useCallback(async (item: CivitaiInventoryItem, kind: CivitaiDestination, folder: import('../services/civitaiService').CivitaiModelFolder) => {
        if (!window.electron) throw new Error('Model classification requires the Electron desktop app.');
        setClassificationStatus({ phase: 'working', message: `Classifying ${item.fileName}...` });
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        try {
            const updatedItem = await window.electron.reclassifyLocalModel({ modelPath: item.path, kind, folder });
            setClassificationStatus({ phase: 'updating', message: 'Updating this model in the library...' });
            setInventory(current => ({
                ...current,
                items: current.items.map(candidate => candidate.path === item.path ? updatedItem : candidate),
            }));
            requestAnimationFrame(() => requestAnimationFrame(() => {
                setClassificationStatus({ phase: 'complete', message: 'Model classified. Library controls are ready.' });
                window.setTimeout(() => setClassificationStatus(null), 4000);
            }));
        } catch (classificationError) {
            const message = classificationError instanceof Error ? classificationError.message : 'Model classification failed.';
            setClassificationStatus({ phase: 'error', message });
            throw classificationError;
        }
    }, []);

    const updateInventoryItem = useCallback(async (item: CivitaiInventoryItem, mode: 'keep' | 'replace') => {
        if (!window.electron) throw new Error('Model updates require the Electron desktop app.');
        const downloadId = crypto.randomUUID();
        const result = await window.electron.updateCivitaiModel({ downloadId, provider, modelPath: item.path, mode });
        setIsScanning(true);
        setScanProgress(null);
        try {
            setInventory(await window.electron.scanCivitaiLibrary({ provider, kind: item.kind, family: 'all' }));
        } finally {
            setIsScanning(false);
        }
        return result;
    }, [provider]);

    const providerColor = provider === 'red' ? 'red' : 'blue';

    return (
        <div className="space-y-6 pb-10">
            <header className="border-b border-border-primary pb-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${provider === 'red' ? 'text-red-400' : 'text-blue-400'}`}>Model depot</p>
                    <h1 className="text-3xl font-bold text-text-primary mt-1">Models/LoRAs</h1>
                    <p className="text-sm text-text-secondary mt-2">Checkpoints and LoRAs for SD 1.5, SDXL, Qwen, Qwen Edit, ZIT, and LTX 2.3.</p>
                </div>
                <div className="inline-flex self-start bg-bg-tertiary border border-border-primary rounded-lg p-1" aria-label="Civitai service">
                    <button onClick={() => { setProvider('regular'); setModels([]); setNextCursor(undefined); }} className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${provider === 'regular' ? 'bg-blue-600 text-white' : 'text-text-secondary hover:text-blue-400'}`}>Blue · SFW</button>
                    <button onClick={() => { setProvider('red'); setModels([]); setNextCursor(undefined); }} className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${provider === 'red' ? 'bg-red-600 text-white' : 'text-text-secondary hover:text-red-400'}`}>Red · NSFW</button>
                </div>
            </header>

            <nav className="grid grid-cols-2 md:grid-cols-4 border-b border-border-primary" aria-label="Models and LoRAs sections">
                <button onClick={() => setActiveSection('library')} className={`py-3 text-sm font-bold border-b-2 ${activeSection === 'library' ? 'border-amber-400 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>My Library</button>
                <button onClick={() => setActiveSection('catalog')} className={`py-3 text-sm font-bold border-b-2 ${activeSection === 'catalog' ? 'border-blue-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>Civitai</button>
                <button onClick={() => setActiveSection('archive')} className={`py-3 text-sm font-bold border-b-2 ${activeSection === 'archive' ? 'border-emerald-500 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>ArchiveCivit</button>
                <button onClick={() => setActiveSection('tools')} className={`py-3 text-sm font-bold border-b-2 ${activeSection === 'tools' ? 'border-sky-400 text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>Library Tools</button>
            </nav>

            {classificationStatus && <div aria-live="polite" className={`flex items-center gap-2 border rounded-md px-4 py-3 text-sm font-semibold ${classificationStatus.phase === 'error' ? 'border-red-500/50 bg-red-500/10 text-red-300' : classificationStatus.phase === 'complete' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-sky-500/50 bg-sky-500/10 text-sky-300'}`}>{(classificationStatus.phase === 'working' || classificationStatus.phase === 'updating') && <SpinnerIcon className="w-4 h-4 animate-spin shrink-0" />}<span>{classificationStatus.message}</span></div>}

            {activeSection === 'catalog' && <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 border-b border-border-primary pb-6">
                {(['regular', 'red'] as CivitaiProvider[]).map(keyProvider => (
                    <label key={keyProvider} className="text-sm text-text-secondary">
                        <span className={`font-bold ${keyProvider === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{keyProvider === 'red' ? 'civitai.red' : 'civitai.com'} API key</span>
                        <div className="flex gap-2 mt-2">
                            <input type="password" value={keys[keyProvider]} onChange={event => setKeys(current => ({ ...current, [keyProvider]: event.target.value }))} placeholder="Optional for search, required by some downloads" className="min-w-0 flex-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-text-primary" />
                            <a href={getCivitaiAccountUrl(keyProvider)} target="_blank" rel="noreferrer" className={`px-3 py-2 border rounded-md font-medium ${keyProvider === 'red' ? 'border-red-500/60 text-red-400' : 'border-blue-500/60 text-blue-400'}`}>Get key</a>
                        </div>
                    </label>
                ))}
                <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
                    <button onClick={saveKeys} className="px-4 py-2 bg-bg-tertiary hover:bg-bg-tertiary-hover border border-border-primary rounded-md text-sm font-bold text-text-primary">Save API keys</button>
                    {settingsMessage && <span className="text-xs text-emerald-400">{settingsMessage}</span>}
                </div>
                <div className="lg:col-span-2">
                    <span className="block text-sm font-bold text-text-primary mb-2">ComfyUI destination</span>
                    <div className="flex flex-col md:flex-row gap-2">
                        <div className="min-w-0 flex-1 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-sm text-text-secondary break-all" title={comfyUIRoot}>
                            {comfyUIRoot || (localAccessAvailable ? 'No ComfyUI folder selected' : 'Browser mode: local ComfyUI destination unavailable')}
                        </div>
                        {localAccessAvailable && <button onClick={selectRoot} className="shrink-0 px-4 py-2 bg-bg-tertiary hover:bg-bg-tertiary-hover border border-border-primary rounded-md text-sm font-bold text-text-primary">{comfyUIRoot ? 'Change folder' : 'Select folder'}</button>}
                    </div>
                    {comfyUIRoot && <p className="text-xs text-text-muted mt-2">Models are organized inside {comfyUIRoot}\models.</p>}
                </div>
            </section>}

            {error && <div className="border border-red-500/50 bg-red-500/10 text-red-300 rounded-md px-4 py-3 text-sm">{error}</div>}

            {(activeSection === 'library' || activeSection === 'tools') && <CivitaiInventoryPanel view={activeSection} inventory={inventory} provider={provider} isScanning={isScanning} isOrganizing={isOrganizing} progress={scanProgress} onScan={scanLibrary} onOrganize={organizeModelRoot} onInventoryChange={setInventory} onItemChange={replaceInventoryItem} onClassifyItem={classifyInventoryItem} onOpenItem={openInventoryItem} onUpdateItem={updateInventoryItem} focusedItemPath={focusedInventoryPath} organizeMessage={organizeMessage} localAccessAvailable={localAccessAvailable} />}

            {activeSection === 'archive' && <ArchiveCivitPanel />}

            {activeSection === 'catalog' && <><section className={`border-l-4 pl-4 ${providerColor === 'red' ? 'border-red-500' : 'border-blue-500'}`}>
                <form onSubmit={event => { event.preventDefault(); search(false); }} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search models, creators, or tags" className="bg-bg-tertiary border border-border-primary rounded-md px-3 py-2.5 text-text-primary" />
                    <MenuSelect value={family} onChange={setFamily} ariaLabel="Civitai family" options={CIVITAI_FAMILIES.map(item => ({ value: item.id, label: item.label }))} />
                    <MenuSelect value={modelType} onChange={setModelType} ariaLabel="Civitai model type" options={[{ value: 'all', label: 'Checkpoints + LoRAs' }, { value: 'Checkpoint', label: 'Checkpoints' }, { value: 'LORA', label: 'LoRAs' }]} />
                    <MenuSelect value={sort} onChange={setSort} ariaLabel="Sort models" options={CIVITAI_SORTS.map(item => ({ value: item.value, label: item.label }))} />
                    <button type="submit" disabled={isSearching} className={`px-5 py-2.5 rounded-md text-white font-bold disabled:opacity-60 md:col-span-2 ${provider === 'red' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{isSearching ? 'Searching…' : 'Search'}</button>
                </form>
            </section>

            {models.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {models.map(model => <ModelCard key={model.id} model={model} provider={provider} family={family} inventoryItems={inventory.items} download={download} onDownload={startDownload} onCancel={cancelDownload} />)}
                </div>
            ) : !isSearching && !error ? (
                <div className="py-16 text-center border-y border-border-primary">
                    <p className="text-text-secondary">Choose a family or enter a search, then search {provider === 'red' ? 'civitai.red' : 'civitai.com'}.</p>
                </div>
            ) : null}

            {nextCursor && <div className="flex justify-center"><button onClick={() => search(true)} disabled={isSearching} className="px-5 py-2 border border-border-primary rounded-md text-text-primary hover:bg-bg-tertiary disabled:opacity-50">Load more</button></div>}</>}
        </div>
    );
});
