export type CivitaiProvider = 'regular' | 'red';
export type CivitaiModelType = 'Checkpoint' | 'LORA';
export type CivitaiFamily = 'all' | 'sd15' | 'sdxl' | 'flux' | 'qwen' | 'qwen-edit' | 'zit-base' | 'zit-turbo' | 'ltx-23';
export type CivitaiDestination = 'checkpoint' | 'diffusion' | 'lora';
export type CivitaiModelFolder = 'sd15' | 'SD1.5' | 'SDXL' | 'Flux' | 'FLUX' | 'flux-dev' | 'QWEN' | 'ZIT' | 'LTX2' | 'LTX2_camera_control';
export type CivitaiSort = 'Highest Rated' | 'Most Downloaded' | 'Most Liked' | 'Newest' | 'Most Images';

export interface CivitaiFile {
    id: number;
    name: string;
    sizeKB: number;
    type: string;
    primary?: boolean;
    downloadUrl: string;
    pickleScanResult?: string;
    virusScanResult?: string;
    metadata?: { format?: string; size?: string; fp?: string };
    hashes?: { SHA256?: string };
}

export interface CivitaiModelVersion {
    id: number;
    name: string;
    baseModel: string;
    baseModelType?: string;
    publishedAt?: string;
    trainedWords?: string[];
    files: CivitaiFile[];
    images?: Array<{ url: string; type?: string; nsfwLevel?: number }>;
    downloadUrl: string;
}

export interface CivitaiModel {
    id: number;
    name: string;
    type: string;
    description?: string;
    creator?: { username?: string; image?: string };
    tags?: string[];
    nsfw?: boolean;
    nsfwLevel?: number;
    stats?: { downloadCount?: number; thumbsUpCount?: number };
    modelVersions: CivitaiModelVersion[];
}

export interface CivitaiSearchResult {
    items: CivitaiModel[];
    metadata?: { nextPage?: string; nextCursor?: string; totalItems?: number };
}

export interface CivitaiUsageMetadata {
    triggerWords?: string[];
    sampler?: string;
    scheduler?: string;
    steps?: number;
    cfg?: number;
    guidance?: number;
    source: 'civitai' | 'archive' | 'manual';
    updatedAt: string;
}

export interface CivitaiInventoryItem {
    path: string;
    relativePath: string;
    fileName: string;
    kind: CivitaiDestination;
    sizeBytes: number;
    sha256: string;
    sidecarPath?: string;
    previewPath?: string;
    civitaiPreviewUrl?: string;
    civitaiPreviewType?: 'image' | 'video';
    previewError?: string;
    civitaiCheckedAt?: string;
    previewCheckedAt?: string;
    contentSafety?: 'sfw' | 'nsfw';
    safetyOverride?: 'sfw' | 'nsfw';
    safetyCheckedAt?: string;
    archiveMirrorUrl?: string;
    userOwned?: boolean;
    usageMetadata?: CivitaiUsageMetadata;
    archiveInfo?: {
        title: string;
        creator?: string;
        modelType?: string;
        baseModel?: string;
        versionName?: string;
        downloads?: number;
        nsfw?: boolean;
        description?: string;
        tags?: string[];
        mirrorCount: number;
        mirrors: Array<{ source: string; fileName: string; url: string }>;
        fetchedAt: string;
    };
    status: 'matched' | 'partial' | 'unmatched' | 'error';
    error?: string;
    modelId?: number;
    modelName?: string;
    modelType?: string;
    installedVersionId?: number;
    installedVersionName?: string;
    installedPublishedAt?: string;
    latestVersionId?: number;
    latestVersionName?: string;
    latestPublishedAt?: string;
    hasUpdate: boolean;
}

export interface CivitaiInventory {
    scannedAt: string | null;
    root: string;
    items: CivitaiInventoryItem[];
}

const PROVIDER_ORIGINS: Record<CivitaiProvider, string> = {
    regular: 'https://civitai.com',
    red: 'https://civitai.red',
};

export const CIVITAI_FAMILIES: Array<{ id: CivitaiFamily; label: string; query: string; baseModel?: string }> = [
    { id: 'all', label: 'All families', query: '' },
    { id: 'sd15', label: 'SD 1.5', query: '', baseModel: 'SD 1.5' },
    { id: 'sdxl', label: 'SDXL', query: '', baseModel: 'SDXL 1.0' },
    { id: 'flux', label: 'FLUX', query: 'Flux' },
    { id: 'qwen', label: 'Qwen', query: 'Qwen Image' },
    { id: 'qwen-edit', label: 'Qwen Edit', query: 'Qwen Image Edit' },
    { id: 'zit-base', label: 'ZIT Base', query: 'Z-Image Base' },
    { id: 'zit-turbo', label: 'ZIT Turbo', query: 'Z-Image Turbo' },
    { id: 'ltx-23', label: 'LTX 2.3', query: 'LTX 2.3' },
];

export const CIVITAI_SORTS: Array<{ value: CivitaiSort; label: string }> = [
    { value: 'Highest Rated', label: 'Highest Rated' },
    { value: 'Most Downloaded', label: 'Most Downloaded' },
    { value: 'Most Liked', label: 'Most Liked' },
    { value: 'Newest', label: 'Newest' },
    { value: 'Most Images', label: 'Most Images' },
];

export const getCivitaiOrigin = (provider: CivitaiProvider) => PROVIDER_ORIGINS[provider];

export const getCivitaiAccountUrl = (provider: CivitaiProvider) => `${PROVIDER_ORIGINS[provider]}/user/account`;

export const getCivitaiModelUrl = (provider: CivitaiProvider, modelId: number) => `${PROVIDER_ORIGINS[provider]}/models/${modelId}`;

export const getDefaultDestination = (model: CivitaiModel, version: CivitaiModelVersion, family: CivitaiFamily): CivitaiDestination => {
    if (model.type.toUpperCase() === 'LORA') return 'lora';
    const modelFolder = getCivitaiModelFolder(model, version, family);
    if (modelFolder === 'Flux' || modelFolder === 'QWEN' || modelFolder === 'ZIT' || modelFolder === 'LTX2' || modelFolder === 'LTX2_camera_control') {
        return 'diffusion';
    }
    return 'checkpoint';
};

export const getCivitaiModelFolder = (model: CivitaiModel, version: CivitaiModelVersion, family: CivitaiFamily): CivitaiModelFolder => {
    const versionIdentity = `${version.baseModel || ''} ${version.baseModelType || ''} ${version.name}`.toLowerCase();
    if (/qwen/.test(versionIdentity)) return 'QWEN';
    if (/z[- ]?image|\bzit\b/.test(versionIdentity)) return 'ZIT';
    if (/\bltx/.test(versionIdentity) && /camera[ _-]*control|control[ _-]*camera/.test(versionIdentity)) return 'LTX2_camera_control';
    if (/\bltx/.test(versionIdentity)) return 'LTX2';
    if (/\bflux/.test(versionIdentity)) return 'Flux';
    if (/sdxl|pony|illustrious|noobai/.test(versionIdentity)) return 'SDXL';
    const fallbackIdentity = `${family === 'all' ? '' : family} ${model.name}`.toLowerCase();
    if (/qwen/.test(fallbackIdentity)) return 'QWEN';
    if (/z[- ]?image|\bzit\b/.test(fallbackIdentity)) return 'ZIT';
    if (/\bltx/.test(fallbackIdentity)) return 'LTX2';
    if (/\bflux/.test(fallbackIdentity)) return 'Flux';
    if (/sdxl|pony|illustrious|noobai/.test(fallbackIdentity)) return 'SDXL';
    return 'sd15';
};

export const getCivitaiDestinationFolder = (model: CivitaiModel, version: CivitaiModelVersion, family: CivitaiFamily, destination: CivitaiDestination): CivitaiModelFolder => {
    const familyFolder = getCivitaiModelFolder(model, version, family);
    if (destination !== 'checkpoint') return familyFolder;
    if (familyFolder === 'sd15') return 'SD1.5';
    if (familyFolder === 'Flux') {
        const identity = `${version.baseModel || ''} ${version.name} ${model.name}`.toLowerCase();
        return /flux(?:\.?1)?[ _-]*dev|flux-dev/.test(identity) ? 'flux-dev' : 'FLUX';
    }
    return familyFolder;
};

export const getPreviewMedia = (model: CivitaiModel): { url: string; type: 'image' | 'video' } | null => {
    const media = model.modelVersions.flatMap(version => version.images || []);
    const selected = media.find(item => item.type !== 'video') || media.find(item => item.type === 'video');
    if (!selected) return null;
    const type = selected.type === 'video' ? 'video' : 'image';
    return { url: type === 'image' ? selected.url.replace('/original=true/', '/width=640,optimized=true/') : selected.url, type };
};

export const formatModelSize = (sizeKB: number): string => {
    if (!Number.isFinite(sizeKB) || sizeKB <= 0) return 'Unknown size';
    if (sizeKB >= 1024 * 1024) return `${(sizeKB / 1024 / 1024).toFixed(2)} GB`;
    return `${(sizeKB / 1024).toFixed(1)} MB`;
};

export async function searchCivitaiModels(options: {
    provider: CivitaiProvider;
    apiKey?: string;
    query: string;
    family: CivitaiFamily;
    modelType: 'all' | CivitaiModelType;
    sort: CivitaiSort;
    cursor?: string;
}): Promise<CivitaiSearchResult> {
    const family = CIVITAI_FAMILIES.find(item => item.id === options.family) || CIVITAI_FAMILIES[0];
    const searchText = [family.query, options.query.trim()].filter(Boolean).join(' ');
    const params = new URLSearchParams({ limit: '24', sort: options.sort, period: 'AllTime' });
    if (searchText) params.set('query', searchText);
    if (family.baseModel) params.append('baseModels', family.baseModel);
    if (options.modelType !== 'all') params.append('types', options.modelType);
    if (options.cursor) params.set('cursor', options.cursor);

    const response = await fetch(`${PROVIDER_ORIGINS[options.provider]}/api/v1/models?${params}`, {
        headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {},
    });
    if (!response.ok) {
        throw new Error(`Civitai search failed (${response.status} ${response.statusText}).`);
    }
    return response.json();
}

export async function getCivitaiModelsByIds(provider: CivitaiProvider, apiKey: string, modelIds: number[]): Promise<CivitaiModel[]> {
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    const models: CivitaiModel[] = [];
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < modelIds.length) {
            const modelId = modelIds[nextIndex];
            nextIndex += 1;
            const response = await fetch(`${PROVIDER_ORIGINS[provider]}/api/v1/models/${modelId}`, { headers });
            if (response.ok) models.push(await response.json() as CivitaiModel);
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, modelIds.length) }, worker));
    return models;
}
