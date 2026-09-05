
const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');


const isDev = !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let store;
let mainWindow;
const activeModelDownloads = new Map();
const activePreviewLoads = new Map();
const previewQueue = [];
let activePreviewRequests = 0;
const pendingPreviewInventoryUpdates = new Map();
let previewInventoryFlushTimer;
const CIVITAI_HOSTS = new Set(['civitai.com', 'www.civitai.com', 'civitai.red', 'www.civitai.red']);
const MODEL_DESTINATIONS = {
    checkpoint: 'checkpoints',
    diffusion: 'diffusion_models',
    lora: 'loras',
};
const MODEL_SCAN_DIRECTORIES = [
    { kind: 'checkpoint', directory: 'checkpoints' },
    { kind: 'diffusion', directory: 'diffusion_models' },
    { kind: 'diffusion', directory: 'unet' },
    { kind: 'lora', directory: 'loras' },
];
const MODEL_FOLDERS = new Set(['sd15', 'SD1.5', 'SDXL', 'Flux', 'FLUX', 'flux-dev', 'QWEN', 'ZIT', 'LTX2', 'LTX2_camera_control']);
const LOCAL_MODEL_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin', '.gguf']);
const SCAN_FAMILY_FOLDERS = {
    lora: {
        sd15: ['sd15'], sdxl: ['SDXL'], flux: ['Flux'], qwen: ['QWEN'], 'qwen-edit': ['QWEN'],
        'zit-base': ['ZIT'], 'zit-turbo': ['ZIT'], 'ltx-23': ['LTX2', 'LTX2_camera_control'],
    },
    checkpoint: {
        sd15: ['SD1.5'], sdxl: ['SDXL'], flux: ['FLUX', 'flux-dev'], qwen: ['QWEN'], 'qwen-edit': ['QWEN'],
        'zit-base': ['ZIT'], 'zit-turbo': ['ZIT'], 'ltx-23': ['LTX2'],
    },
    diffusion: {
        sd15: ['sd15'], sdxl: ['SDXL'], flux: ['Flux'], qwen: ['QWEN'], 'qwen-edit': ['QWEN'],
        'zit-base': ['ZIT'], 'zit-turbo': ['ZIT'], 'ltx-23': ['LTX2', 'LTX2_camera_control'],
    },
};

function inventoryItemMatchesSelection(item, kind, family) {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (family === 'all') return true;
    const familyFolders = SCAN_FAMILY_FOLDERS[item.kind]?.[family] || [];
    const pathSegments = String(item.relativePath || '').replace(/\\/g, '/').toLowerCase().split('/');
    return familyFolders.some(folder => pathSegments.includes(folder.toLowerCase()));
}

function runQueuedPreviewTask(task) {
    return new Promise((resolve, reject) => {
        previewQueue.push({ task, resolve, reject });
        const drain = () => {
            while (activePreviewRequests < 3 && previewQueue.length > 0) {
                const queued = previewQueue.shift();
                activePreviewRequests += 1;
                Promise.resolve().then(queued.task).then(queued.resolve, queued.reject).finally(() => {
                    activePreviewRequests -= 1;
                    drain();
                });
            }
        };
        drain();
    });
}

function queuePreviewInventoryUpdate(modelPath, updates) {
    pendingPreviewInventoryUpdates.set(modelPath, { ...(pendingPreviewInventoryUpdates.get(modelPath) || {}), ...updates });
    if (previewInventoryFlushTimer) return;
    previewInventoryFlushTimer = setTimeout(() => {
        previewInventoryFlushTimer = undefined;
        const updatesByPath = new Map(pendingPreviewInventoryUpdates);
        pendingPreviewInventoryUpdates.clear();
        const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
        inventory.items = (inventory.items || []).map(item => updatesByPath.has(item.path) ? { ...item, ...updatesByPath.get(item.path) } : item);
        store.set('civitai_inventory', inventory);
    }, 300);
}

async function collectModelFiles(directory, kind, output) {
    if (!fs.existsSync(directory)) return;
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await collectModelFiles(entryPath, kind, output);
        else if (entry.isFile() && LOCAL_MODEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push({ path: entryPath, kind });
    }
}

async function buildFastLocalInventory(event) {
    const comfyUIRoot = store.get('comfyui_root', '');
    if (!comfyUIRoot) return { scannedAt: null, root: '', items: [] };
    const modelRoot = path.join(comfyUIRoot, 'models');
    const files = [];
    await Promise.all(MODEL_SCAN_DIRECTORIES.map(({ kind, directory }) => collectModelFiles(path.join(modelRoot, directory), kind, files)));
    files.sort((left, right) => left.path.localeCompare(right.path));
    const previousInventory = store.get('civitai_inventory', { items: [] });
    const previousItems = new Map((previousInventory.items || []).map(item => [item.path, item]));
    const hashCache = store.get('civitai_inventory_hash_cache', {});
    const items = [];
    for (let index = 0; index < files.length; index += 1) {
        const localFile = files[index];
        const stat = await fs.promises.stat(localFile.path);
        const previousItem = previousItems.get(localFile.path);
        const cachedHash = hashCache[localFile.path];
        const archiveSidecar = previousItem?.archiveInfo ? undefined : await readArchiveSidecar(localFile.path);
        const usageSidecar = previousItem?.usageMetadata ? undefined : await readUsageSidecar(localFile.path);
        items.push({
            ...(previousItem || {}),
            ...(archiveSidecar || {}),
            ...(usageSidecar || {}),
            path: localFile.path,
            relativePath: path.relative(modelRoot, localFile.path),
            fileName: path.basename(localFile.path),
            kind: localFile.kind,
            sizeBytes: stat.size,
            sha256: cachedHash?.size === stat.size && cachedHash?.mtimeMs === stat.mtimeMs ? cachedHash.sha256 : previousItem?.sha256 || '',
            previewPath: findModelPreviewPath(localFile.path),
            status: previousItem?.status || 'unmatched',
            hasUpdate: previousItem?.hasUpdate || false,
        });
        if (event && !event.sender.isDestroyed()) {
            event.sender.send('civitai-scan-progress', { completed: index + 1, total: files.length, fileName: path.basename(localFile.path), stage: 'Indexing local library' });
        }
    }
    const inventory = { scannedAt: new Date().toISOString(), root: comfyUIRoot, items };
    store.set('civitai_inventory', inventory);
    return inventory;
}

function findMetadataValue(value, acceptedKeys) {
    if (!value || typeof value !== 'object') return undefined;
    for (const [key, child] of Object.entries(value)) {
        if (acceptedKeys.has(key.toLowerCase()) && (typeof child === 'string' || typeof child === 'number')) return child;
    }
    for (const child of Object.values(value)) {
        const match = findMetadataValue(child, acceptedKeys);
        if (match !== undefined) return match;
    }
    return undefined;
}

async function readModelSidecar(filePath) {
    const extension = path.extname(filePath);
    const stem = filePath.slice(0, -extension.length);
    const candidates = [...new Set([
        `${filePath}.json`,
        `${stem}.json`,
        `${stem}.metadata.json`,
        `${filePath}.civitai.info`,
        `${stem}.civitai.info`,
    ])];
    for (const candidate of candidates) {
        try {
            const content = await fs.promises.readFile(candidate, 'utf8');
            const data = JSON.parse(content);
            const serialized = JSON.stringify(data);
            const modelUrlMatch = serialized.match(/\/models\/(\d+)/i);
            const versionUrlMatch = serialized.match(/modelVersionId[=\\"': ]+(\d+)/i);
            return {
                path: candidate,
                modelId: Number(findMetadataValue(data, new Set(['modelid', 'model_id']))) || Number(modelUrlMatch?.[1]) || undefined,
                versionId: Number(findMetadataValue(data, new Set(['modelversionid', 'model_version_id', 'versionid']))) || Number(versionUrlMatch?.[1]) || undefined,
                sha256: String(findMetadataValue(data, new Set(['sha256', 'hash'])) || '').replace(/^sha256:/i, '').trim().toUpperCase() || undefined,
            };
        } catch (error) {
            if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        }
    }
    return {};
}

function findModelPreviewPath(filePath) {
    const extension = path.extname(filePath);
    const stem = filePath.slice(0, -extension.length);
    return [
        `${stem}.preview.png`, `${stem}.preview.jpg`, `${stem}.preview.jpeg`, `${stem}.preview.webp`,
        `${stem}.png`, `${stem}.jpg`, `${stem}.jpeg`, `${stem}.webp`,
        `${stem}.archive.png`, `${stem}.archive.jpg`, `${stem}.archive.jpeg`, `${stem}.archive.webp`,
    ].find(candidate => fs.existsSync(candidate));
}

async function readArchiveSidecar(filePath) {
    const stem = filePath.slice(0, -path.extname(filePath).length);
    try {
        return JSON.parse(await fs.promises.readFile(`${stem}.archive.json`, 'utf8'));
    } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        return undefined;
    }
}

async function readUsageSidecar(filePath) {
    const stem = filePath.slice(0, -path.extname(filePath).length);
    try {
        return JSON.parse(await fs.promises.readFile(`${stem}.usage.json`, 'utf8'));
    } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        return undefined;
    }
}

function normalizeTriggerWords(value) {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : [];
    return [...new Set(values.map(word => String(word).trim()).filter(Boolean))].slice(0, 50);
}

function findTriggerWords(value, results = []) {
    if (!value || typeof value !== 'object') return results;
    const acceptedKeys = new Set(['trainedwords', 'trained_words', 'triggerwords', 'trigger_words', 'activationtext', 'activation_text']);
    for (const [key, child] of Object.entries(value)) {
        if (acceptedKeys.has(key.toLowerCase())) results.push(...normalizeTriggerWords(child));
        if (child && typeof child === 'object') findTriggerWords(child, results);
    }
    return results;
}

function findRecommendedSettings(value) {
    const candidates = [];
    const visit = current => {
        if (!current || typeof current !== 'object') return;
        const entries = Object.fromEntries(Object.entries(current).map(([key, child]) => [key.toLowerCase().replace(/[ _-]/g, ''), child]));
        const sampler = entries.samplername ?? entries.sampler;
        const scheduler = entries.scheduler ?? entries.scheduletype ?? entries.schedule;
        const steps = Number(entries.steps);
        const cfg = Number(entries.cfgscale ?? entries.cfg);
        const guidance = Number(entries.guidance);
        const candidate = {
            sampler: typeof sampler === 'string' ? sampler.trim() : undefined,
            scheduler: typeof scheduler === 'string' ? scheduler.trim() : undefined,
            steps: Number.isFinite(steps) && steps > 0 ? steps : undefined,
            cfg: Number.isFinite(cfg) && cfg > 0 ? cfg : undefined,
            guidance: Number.isFinite(guidance) && guidance > 0 ? guidance : undefined,
        };
        const score = Object.values(candidate).filter(item => item !== undefined).length;
        if (score >= 2) candidates.push({ candidate, score });
        for (const child of Object.values(current)) if (child && typeof child === 'object') visit(child);
    };
    visit(value);
    const grouped = new Map();
    for (const { candidate, score } of candidates) {
        const key = JSON.stringify(candidate);
        const existing = grouped.get(key);
        grouped.set(key, { candidate, score, count: (existing?.count || 0) + 1 });
    }
    return [...grouped.values()]
        .sort((left, right) => right.count - left.count || right.score - left.score)[0]?.candidate;
}

function collectPromptExamples(value, source) {
    const examples = [];
    const visit = current => {
        if (!current || typeof current !== 'object') return;
        const entries = Object.fromEntries(Object.entries(current).map(([key, child]) => [key.toLowerCase().replace(/[ _-]/g, ''), child]));
        const positive = entries.positiveprompt ?? entries.prompt;
        const negative = entries.negativeprompt;
        if (typeof positive === 'string' && positive.trim().length >= 3) {
            examples.push({
                positive: positive.trim().slice(0, 12000),
                negative: typeof negative === 'string' && negative.trim() ? negative.trim().slice(0, 12000) : undefined,
                source,
            });
        }
        for (const child of Object.values(current)) if (child && typeof child === 'object') visit(child);
    };
    visit(value);
    return [...new Map(examples.map(example => [`${example.positive}\n${example.negative || ''}`, example])).values()].slice(0, 20);
}

function collectArchiveUsageExamples(value) {
    const descriptions = [];
    const visit = current => {
        if (!current || typeof current !== 'object') return;
        for (const [key, child] of Object.entries(current)) {
            if (key.toLowerCase() === 'description' && typeof child === 'string') descriptions.push(child);
            else if (child && typeof child === 'object') visit(child);
        }
    };
    visit(value);
    const examples = [];
    for (const description of descriptions) {
        const usageList = description.match(/<p[^>]*>\s*Usage:\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i)?.[1];
        if (!usageList) continue;
        for (const match of usageList.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
            const positive = stripArchiveHtml(match[1]);
            if (positive.length >= 3) examples.push({ positive, source: 'archive' });
        }
    }
    return examples;
}

function getWorkflowPromptExample(workflow) {
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const links = Array.isArray(workflow?.links) ? workflow.links : [];
    const positiveCandidates = [];
    const negativeCandidates = [];
    for (const node of nodes) {
        if (!/cliptextencode/i.test(String(node?.type || ''))) continue;
        const text = (Array.isArray(node.widgets_values) ? node.widgets_values : [])
            .filter(value => typeof value === 'string' && value.trim().length >= 3)
            .sort((left, right) => right.length - left.length)[0];
        if (!text) continue;
        const linkedInputNames = links
            .filter(link => Array.isArray(link) && link[1] === node.id)
            .map(link => nodesById.get(link[3])?.inputs?.[link[4]]?.name)
            .filter(Boolean)
            .join(' ');
        const identity = `${node.title || ''} ${node.properties?.['Node name for S&R'] || ''} ${linkedInputNames}`;
        if (/negative/i.test(identity)) negativeCandidates.push(text.trim());
        else positiveCandidates.push(text.trim());
    }
    positiveCandidates.sort((left, right) => right.length - left.length);
    negativeCandidates.sort((left, right) => right.length - left.length);
    return positiveCandidates[0] ? { positive: positiveCandidates[0], negative: negativeCandidates[0], source: 'archive' } : undefined;
}

function getWorkflowRecommendedSettings(workflow) {
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
    const settings = {};
    const kSampler = nodes.find(node => node?.type === 'KSampler');
    if (Array.isArray(kSampler?.widgets_values)) {
        const [, , steps, cfg, sampler, scheduler] = kSampler.widgets_values;
        if (Number(steps) > 0) settings.steps = Number(steps);
        if (Number(cfg) > 0) settings.cfg = Number(cfg);
        if (typeof sampler === 'string') settings.sampler = sampler;
        if (typeof scheduler === 'string') settings.scheduler = scheduler;
    }
    const advancedSampler = nodes.find(node => node?.type === 'KSamplerAdvanced');
    if (Array.isArray(advancedSampler?.widgets_values)) {
        const [, , , steps, cfg, sampler, scheduler] = advancedSampler.widgets_values;
        if (Number(steps) > 0) settings.steps ??= Number(steps);
        if (Number(cfg) > 0) settings.cfg ??= Number(cfg);
        if (typeof sampler === 'string') settings.sampler ??= sampler;
        if (typeof scheduler === 'string') settings.scheduler ??= scheduler;
    }
    const samplerSelect = nodes.find(node => node?.type === 'KSamplerSelect');
    if (typeof samplerSelect?.widgets_values?.[0] === 'string') settings.sampler ??= samplerSelect.widgets_values[0];
    const basicScheduler = nodes.find(node => node?.type === 'BasicScheduler');
    if (Array.isArray(basicScheduler?.widgets_values)) {
        const [scheduler, steps] = basicScheduler.widgets_values;
        if (typeof scheduler === 'string') settings.scheduler ??= scheduler;
        if (Number(steps) > 0) settings.steps ??= Number(steps);
    }
    const fluxTextEncoder = nodes.find(node => node?.type === 'CLIPTextEncodeFlux');
    if (Array.isArray(fluxTextEncoder?.widgets_values)) {
        const guidance = fluxTextEncoder.widgets_values.findLast(value => Number.isFinite(Number(value)));
        if (Number(guidance) > 0) settings.guidance = Number(guidance);
    }
    return Object.keys(settings).length >= 2 ? settings : undefined;
}

async function fetchArchiveGalleryWorkflows(value, limit = 20) {
    const postIds = [];
    const visit = current => {
        if (!current || typeof current !== 'object') return;
        for (const child of Object.values(current)) {
            if (typeof child === 'string') {
                const match = child.match(/^https:\/\/genur\.art\/posts\/(\d+)/i);
                if (match) postIds.push(match[1]);
            } else if (child && typeof child === 'object') visit(child);
        }
    };
    visit(value);
    const uniqueIds = [...new Set(postIds)].slice(0, limit);
    const workflows = [];
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < uniqueIds.length) {
            const postId = uniqueIds[nextIndex];
            nextIndex += 1;
            try {
                const response = await fetch(`https://genur.art/api/posts/${postId}/workflow?download=1`, { redirect: 'follow' });
                if (!response.ok) continue;
                workflows.push(await response.json());
            } catch {
                // Some archived gallery entries do not retain their workflow.
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, uniqueIds.length) }, worker));
    return workflows;
}

async function fetchArchiveGalleryExamples(value) {
    const workflows = await fetchArchiveGalleryWorkflows(value);
    return workflows.map(getWorkflowPromptExample).filter(Boolean);
}

async function saveUsageMetadata(resolvedPath, usageMetadata) {
    const stem = resolvedPath.slice(0, -path.extname(resolvedPath).length);
    await fs.promises.writeFile(`${stem}.usage.json`, JSON.stringify({ usageMetadata }, null, 2), 'utf8');
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    let updatedItem;
    inventory.items = (inventory.items || []).map(item => {
        if (item.path !== resolvedPath) return item;
        updatedItem = { ...item, usageMetadata };
        return updatedItem;
    });
    if (!updatedItem) throw new Error('Model is missing from the local inventory.');
    store.set('civitai_inventory', inventory);
    return updatedItem;
}

function stripArchiveHtml(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ').trim();
}

async function cacheArchivePreview(filePath, imageUrl) {
    if (!imageUrl) return undefined;
    const parsedUrl = new URL(imageUrl);
    if (parsedUrl.protocol !== 'https:') throw new Error('CivArchive image must use HTTPS.');
    const response = await fetch(parsedUrl, { redirect: 'follow' });
    if (!response.ok) throw new Error(`CivArchive image failed (${response.status} ${response.statusText}).`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[contentType];
    if (!extension) throw new Error(`Unsupported CivArchive image type: ${contentType || 'unknown'}.`);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > 15 * 1024 * 1024) throw new Error('CivArchive image is larger than 15 MB.');
    const stem = filePath.slice(0, -path.extname(filePath).length);
    const destinationPath = `${stem}.archive${extension}`;
    await Promise.all(['.png', '.jpg', '.jpeg', '.webp'].filter(candidate => candidate !== extension).map(candidate => fs.promises.rm(`${stem}.archive${candidate}`, { force: true })));
    await fs.promises.writeFile(`${destinationPath}.part`, content);
    await fs.promises.rename(`${destinationPath}.part`, destinationPath);
    return destinationPath;
}

function assertLocalModelPath(filePath) {
    const comfyUIRoot = store.get('comfyui_root', '');
    if (!comfyUIRoot) throw new Error('Select your ComfyUI folder first.');
    const modelRoot = path.resolve(comfyUIRoot, 'models');
    const resolvedPath = path.resolve(String(filePath || ''));
    const relative = path.relative(modelRoot, resolvedPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !LOCAL_MODEL_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
        throw new Error('Invalid local model path.');
    }
    return { modelRoot, resolvedPath };
}

async function previewToDataUrl(previewPath) {
    if (!previewPath || !fs.existsSync(previewPath)) return null;
    try {
        const stat = await fs.promises.stat(previewPath);
        const cacheKey = crypto.createHash('sha1').update(`${previewPath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
        const cacheDirectory = path.join(app.getPath('userData'), 'model-preview-thumbnails');
        const thumbnailPath = path.join(cacheDirectory, `${cacheKey}.jpg`);
        if (!fs.existsSync(thumbnailPath)) {
            const sourceImage = nativeImage.createFromPath(previewPath);
            const sourceSize = sourceImage.getSize();
            if (sourceImage.isEmpty() || !sourceSize.width || !sourceSize.height) return pathToFileURL(previewPath).href;
            const scale = Math.min(1, 320 / Math.max(sourceSize.width, sourceSize.height));
            const thumbnail = scale < 1 ? sourceImage.resize({
                width: Math.max(1, Math.round(sourceSize.width * scale)),
                height: Math.max(1, Math.round(sourceSize.height * scale)),
                quality: 'good',
            }) : sourceImage;
            await fs.promises.mkdir(cacheDirectory, { recursive: true });
            const partialPath = `${thumbnailPath}.part`;
            await fs.promises.writeFile(partialPath, thumbnail.toJPEG(82));
            await fs.promises.rename(partialPath, thumbnailPath);
        }
        return pathToFileURL(thumbnailPath).href;
    } catch {
        return pathToFileURL(previewPath).href;
    }
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const input = fs.createReadStream(filePath);
        input.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => resolve(hash.digest('hex').toUpperCase()));
    });
}

async function fetchCivitaiJson(provider, endpoint) {
    const origin = provider === 'red' ? 'https://civitai.red' : 'https://civitai.com';
    const apiKey = store.get(`civitai_${provider}_api_key`, '');
    const response = await fetch(`${origin}${endpoint}`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
    if (!response.ok) {
        const error = new Error(`Civitai lookup failed (${response.status} ${response.statusText}).`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

function getLatestCompatibleVersion(model, installedVersion) {
    const compatible = (model.modelVersions || []).filter(version => !installedVersion.baseModel || version.baseModel === installedVersion.baseModel);
    return compatible.reduce((latest, version) => {
        const versionDate = Date.parse(version.publishedAt || version.createdAt || '') || 0;
        const latestDate = Date.parse(latest?.publishedAt || latest?.createdAt || '') || 0;
        return !latest || versionDate > latestDate ? version : latest;
    }, undefined);
}

function getCivitaiPreviewMedia(installedVersion, model) {
    const versions = [
        installedVersion,
        ...(model?.modelVersions || []).filter(version => version.id !== installedVersion?.id),
    ];
    for (const version of versions) {
        const media = version?.images || [];
        const selected = media.find(candidate => candidate?.url && candidate.type !== 'video') || media.find(candidate => candidate?.url && candidate.type === 'video');
        if (selected) return { url: selected.url, type: selected.type === 'video' ? 'video' : 'image' };
    }
    return undefined;
}

function getCivitaiContentSafety(model) {
    const explicitIdentity = [model?.name, ...(model?.tags || [])].join(' ');
    return model?.nsfw === true || /\b(?:nsfw|nude|naked|porn|sex|erotic|hentai|xxx)\b/i.test(explicitIdentity) ? 'nsfw' : 'sfw';
}

async function cacheCivitaiPreview(filePath, previewUrl) {
    if (!previewUrl) return undefined;
    const parsedUrl = new URL(previewUrl);
    if (parsedUrl.protocol !== 'https:') return undefined;
    const optimizedUrl = previewUrl.replace('/original=true/', '/width=450/');
    const response = await fetch(optimizedUrl, { redirect: 'follow' });
    if (!response.ok) throw new Error(`Civitai preview failed (${response.status} ${response.statusText}).`);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const previewExtension = extensions[contentType];
    if (!previewExtension) throw new Error(`Unsupported Civitai preview type: ${contentType || 'unknown'}.`);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > 15 * 1024 * 1024) throw new Error('Civitai preview is larger than 15 MB.');
    const stem = filePath.slice(0, -path.extname(filePath).length);
    const destinationPath = `${stem}.preview${previewExtension}`;
    const partialPath = `${destinationPath}.part`;
    await fs.promises.writeFile(partialPath, content);
    await fs.promises.rename(partialPath, destinationPath);
    return destinationPath;
}

function inferModelFolder(model, version) {
    const identity = `${version?.baseModel || ''} ${version?.name || ''} ${model?.name || ''}`.toLowerCase();
    if (/qwen/.test(identity)) return 'QWEN';
    if (/z[- ]?image|\bzit\b/.test(identity)) return 'ZIT';
    if (/\bltx/.test(identity) && /camera[ _-]*control|control[ _-]*camera/.test(identity)) return 'LTX2_camera_control';
    if (/\bltx/.test(identity)) return 'LTX2';
    if (/\bflux/.test(identity)) return 'Flux';
    if (/sdxl|pony|illustrious|noobai/.test(identity)) return 'SDXL';
    return 'sd15';
}

function inferDestinationFolder(model, version, category) {
    const folder = inferModelFolder(model, version);
    if (category !== 'checkpoints') return folder;
    if (folder === 'sd15') return 'SD1.5';
    if (folder === 'Flux') {
        const identity = `${version?.baseModel || ''} ${version?.name || ''} ${model?.name || ''}`.toLowerCase();
        return /flux(?:\.?1)?[ _-]*dev|flux-dev/.test(identity) ? 'flux-dev' : 'FLUX';
    }
    return folder;
}

async function identifyLocalModel(provider, filePath, sha256, modelCache) {
    const sidecar = await readModelSidecar(filePath);
    const lookupHash = sha256 || sidecar.sha256;
    let version;
    if (sidecar.versionId) {
        try {
            const candidate = await fetchCivitaiJson(provider, `/api/v1/model-versions/${sidecar.versionId}`);
            const hashes = (candidate.files || []).map(file => file.hashes?.SHA256?.toUpperCase()).filter(Boolean);
            if (!sha256 || hashes.length === 0 || hashes.includes(sha256)) version = candidate;
        } catch (error) {
            if (error.status !== 404) throw error;
        }
    }
    if (!version && lookupHash) {
        try {
            version = await fetchCivitaiJson(provider, `/api/v1/model-versions/by-hash/${lookupHash}`);
        } catch (error) {
            if (error.status !== 404) throw error;
        }
    }
    const modelId = version?.modelId || sidecar.modelId;
    if (!modelId || !version) return null;
    if (!modelCache.has(modelId)) modelCache.set(modelId, await fetchCivitaiJson(provider, `/api/v1/models/${modelId}`));
    return { model: modelCache.get(modelId), version, sidecarPath: sidecar.path, sha256: lookupHash };
}

async function moveModelCompanions(sourcePath, destinationPath) {
    const sourceExtension = path.extname(sourcePath);
    const destinationExtension = path.extname(destinationPath);
    const sourceStem = sourcePath.slice(0, -sourceExtension.length);
    const destinationStem = destinationPath.slice(0, -destinationExtension.length);
    const companions = [
        [sourcePath, destinationPath],
        [`${sourcePath}.json`, `${destinationPath}.json`],
        [`${sourceStem}.json`, `${destinationStem}.json`],
        [`${sourcePath}.civitai.info`, `${destinationPath}.civitai.info`],
        [`${sourceStem}.civitai.info`, `${destinationStem}.civitai.info`],
        [`${sourceStem}.preview.png`, `${destinationStem}.preview.png`],
        [`${sourceStem}.preview.jpg`, `${destinationStem}.preview.jpg`],
        [`${sourceStem}.preview.jpeg`, `${destinationStem}.preview.jpeg`],
        [`${sourceStem}.preview.webp`, `${destinationStem}.preview.webp`],
        [`${sourceStem}.png`, `${destinationStem}.png`],
        [`${sourceStem}.jpg`, `${destinationStem}.jpg`],
        [`${sourceStem}.jpeg`, `${destinationStem}.jpeg`],
        [`${sourceStem}.webp`, `${destinationStem}.webp`],
        [`${sourceStem}.archive.json`, `${destinationStem}.archive.json`],
        [`${sourceStem}.archive.png`, `${destinationStem}.archive.png`],
        [`${sourceStem}.archive.jpg`, `${destinationStem}.archive.jpg`],
        [`${sourceStem}.archive.jpeg`, `${destinationStem}.archive.jpeg`],
        [`${sourceStem}.archive.webp`, `${destinationStem}.archive.webp`],
        [`${sourceStem}.usage.json`, `${destinationStem}.usage.json`],
    ];
    const existingCompanions = companions.filter(([source]) => fs.existsSync(source));
    const collision = existingCompanions.find(([, destination]) => fs.existsSync(destination));
    if (collision) throw new Error(`Destination already exists: ${collision[1]}`);
    for (const [source, destination] of existingCompanions) {
        await fs.promises.rename(source, destination);
    }
}

async function initStore() {
    const { default: Store } = await import('electron-store');
    store = new Store();
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false,
        },
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.webContents.on('did-finish-load', () => {
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Global Error Handlers
process.on('uncaughtException', (error) => {
    dialog.showErrorBox('Critical Error', `A critical error occurred:\n${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    dialog.showErrorBox('Critical Error', `An unhandled rejection occurred:\n${reason}`);
});

if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });
}

app.whenReady().then(async () => {
    if (!hasSingleInstanceLock) return;
    try {
        await initStore();
        createWindow();
    } catch (error) {
        dialog.showErrorBox('Startup Error', `Failed to initialize application: ${error.message}`);
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('get-api-key', () => {
    return store.get('gemini_api_key');
});

ipcMain.handle('set-api-key', (event, key) => {
    store.set('gemini_api_key', key);
    return true;
});

ipcMain.handle('get-mammouth-api-key', () => {
    return store.get('mammouth_api_key');
});

ipcMain.handle('set-mammouth-api-key', (event, key) => {
    store.set('mammouth_api_key', key);
    return true;
});

ipcMain.handle('get-civitai-settings', () => ({
    regularApiKey: store.get('civitai_regular_api_key', ''),
    redApiKey: store.get('civitai_red_api_key', ''),
    comfyUIRoot: store.get('comfyui_root', ''),
}));

ipcMain.handle('set-civitai-api-key', (event, provider, key) => {
    if (provider !== 'regular' && provider !== 'red') {
        throw new Error('Unknown Civitai provider.');
    }
    store.set(`civitai_${provider}_api_key`, String(key || '').trim());
    return true;
});

ipcMain.handle('select-comfyui-root', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Select the ComfyUI folder',
        properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selectedPath = result.filePaths[0];
    store.set('comfyui_root', selectedPath);
    store.delete('civitai_inventory');
    return selectedPath;
});

ipcMain.handle('get-civitai-inventory', async event => {
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    return inventory.items?.length ? inventory : buildFastLocalInventory(event);
});

ipcMain.handle('scan-civitai-library', async (event, request) => {
    const provider = typeof request === 'string' ? request : request?.provider;
    const scanKind = typeof request === 'string' ? 'all' : request?.kind || 'all';
    const scanFamily = typeof request === 'string' ? 'all' : request?.family || 'all';
    if (provider !== 'regular' && provider !== 'red') throw new Error('Unknown Civitai provider.');
    if (!['all', 'lora', 'checkpoint', 'diffusion'].includes(scanKind)) throw new Error('Unknown model scan category.');
    if (scanFamily !== 'all' && !Object.values(SCAN_FAMILY_FOLDERS).some(folders => folders[scanFamily])) throw new Error('Unknown model scan family.');
    const comfyUIRoot = store.get('comfyui_root', '');
    if (!comfyUIRoot) throw new Error('Select your ComfyUI folder before scanning.');

    const modelRoot = path.join(comfyUIRoot, 'models');
    const files = [];
    const categoryRoots = MODEL_SCAN_DIRECTORIES.filter(category => scanKind === 'all' || category.kind === scanKind);
    const scanRoots = categoryRoots.flatMap(category => {
        const familyFolders = scanFamily === 'all' ? [null] : SCAN_FAMILY_FOLDERS[category.kind][scanFamily] || [];
        return familyFolders.map(folder => ({
            kind: category.kind,
            directory: folder ? path.join(modelRoot, category.directory, folder) : path.join(modelRoot, category.directory),
        }));
    });
    await Promise.all(scanRoots.map(root => collectModelFiles(root.directory, root.kind, files)));
    files.sort((left, right) => left.path.localeCompare(right.path));

    const previousCache = store.get('civitai_inventory_hash_cache', {});
    const previousInventory = store.get('civitai_inventory', { items: [] });
    const previousItems = new Map((previousInventory.items || []).map(item => [item.path, item]));
    const nextCache = { ...previousCache };
    const modelCache = new Map();
    const scannedItems = [];
    const sendProgress = (completed, fileName, stage) => {
        if (!event.sender.isDestroyed()) event.sender.send('civitai-scan-progress', { completed, total: files.length, fileName, stage });
    };

    for (let index = 0; index < files.length; index += 1) {
        const localFile = files[index];
        const fileName = path.basename(localFile.path);
        sendProgress(index, fileName, 'Reading local metadata');
        const stat = await fs.promises.stat(localFile.path);
        const cached = previousCache[localFile.path];
        const previousItem = previousItems.get(localFile.path);
        const usageSidecar = previousItem?.usageMetadata ? undefined : await readUsageSidecar(localFile.path);
        const unchanged = Boolean(previousItem && cached?.size === stat.size && cached?.mtimeMs === stat.mtimeMs && cached.sha256);
        const localPreviewPath = findModelPreviewPath(localFile.path);
        const lastCheckedAt = Date.parse(previousItem?.civitaiCheckedAt || '') || 0;
        const previewCheckedAt = Date.parse(previousItem?.previewCheckedAt || '') || 0;
        const requiresCivitaiRefresh = !lastCheckedAt || Date.now() - lastCheckedAt >= 24 * 60 * 60 * 1000;
        const requiresPreviewBackfill = ['matched', 'partial'].includes(previousItem?.status) && !localPreviewPath && (!previewCheckedAt || (previousItem.civitaiPreviewUrl && Date.now() - previewCheckedAt >= 24 * 60 * 60 * 1000));
        if (unchanged && !requiresCivitaiRefresh && !requiresPreviewBackfill) {
            scannedItems.push({ ...previousItem, previewPath: localPreviewPath });
            sendProgress(index + 1, fileName, 'Cached');
            continue;
        }
        let sha256 = cached?.size === stat.size && cached?.mtimeMs === stat.mtimeMs ? cached.sha256 : '';
        if (!sha256) {
            sendProgress(index, fileName, 'Calculating SHA-256');
            sha256 = await hashFile(localFile.path);
        }
        nextCache[localFile.path] = { size: stat.size, mtimeMs: stat.mtimeMs, sha256 };
        const sidecar = unchanged ? {
            path: previousItem.sidecarPath,
            modelId: previousItem.modelId,
            versionId: previousItem.installedVersionId,
        } : await readModelSidecar(localFile.path);
        const item = {
            ...(previousItem || {}),
            ...(usageSidecar || {}),
            path: localFile.path,
            relativePath: path.relative(modelRoot, localFile.path),
            fileName,
            kind: localFile.kind,
            sizeBytes: stat.size,
            sha256,
            sidecarPath: sidecar.path,
            previewPath: localPreviewPath,
            status: previousItem?.userOwned ? 'matched' : 'unmatched',
            hasUpdate: false,
        };

        sendProgress(index, fileName, 'Checking Civitai');
        try {
            let installedVersion;
            if (sidecar.versionId) {
                try {
                    const metadataVersion = await fetchCivitaiJson(provider, `/api/v1/model-versions/${sidecar.versionId}`);
                    const metadataHashes = (metadataVersion.files || []).map(file => file.hashes?.SHA256?.toUpperCase()).filter(Boolean);
                    if (metadataHashes.length === 0 || metadataHashes.includes(sha256)) installedVersion = metadataVersion;
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
            }
            if (!installedVersion) {
                try {
                    installedVersion = await fetchCivitaiJson(provider, `/api/v1/model-versions/by-hash/${sha256}`);
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
            }

            const modelId = installedVersion?.modelId || sidecar.modelId;
            let model;
            if (modelId) {
                if (!modelCache.has(modelId)) modelCache.set(modelId, await fetchCivitaiJson(provider, `/api/v1/models/${modelId}`));
                model = modelCache.get(modelId);
            }
            if (installedVersion && model) {
                const latestVersion = getLatestCompatibleVersion(model, installedVersion);
                const installedDate = Date.parse(installedVersion.publishedAt || installedVersion.createdAt || '') || 0;
                const latestDate = Date.parse(latestVersion?.publishedAt || latestVersion?.createdAt || '') || 0;
                const civitaiPreview = getCivitaiPreviewMedia(installedVersion, model);
                const civitaiPreviewUrl = civitaiPreview?.url;
                const civitaiPreviewType = civitaiPreview?.type;
                item.previewCheckedAt = new Date().toISOString();
                if (!item.previewPath && civitaiPreviewUrl && civitaiPreviewType === 'image') {
                    sendProgress(index, fileName, 'Caching Civitai preview');
                    try {
                        item.previewPath = await cacheCivitaiPreview(localFile.path, civitaiPreviewUrl);
                    } catch (previewError) {
                        item.previewError = previewError instanceof Error ? previewError.message : String(previewError);
                    }
                }
                Object.assign(item, {
                    status: 'matched',
                    modelId: model.id,
                    modelName: model.name,
                    modelType: model.type,
                    contentSafety: getCivitaiContentSafety(model),
                    safetyCheckedAt: new Date().toISOString(),
                    civitaiPreviewUrl,
                    civitaiPreviewType,
                    civitaiCheckedAt: new Date().toISOString(),
                    installedVersionId: installedVersion.id,
                    installedVersionName: installedVersion.name,
                    installedPublishedAt: installedVersion.publishedAt,
                    latestVersionId: latestVersion?.id,
                    latestVersionName: latestVersion?.name,
                    latestPublishedAt: latestVersion?.publishedAt,
                    hasUpdate: Boolean(latestVersion && latestVersion.id !== installedVersion.id && latestDate > installedDate),
                });
            } else if (model) {
                const civitaiPreview = getCivitaiPreviewMedia(undefined, model);
                const civitaiPreviewUrl = civitaiPreview?.url;
                const civitaiPreviewType = civitaiPreview?.type;
                item.previewCheckedAt = new Date().toISOString();
                if (!item.previewPath && civitaiPreviewUrl && civitaiPreviewType === 'image') {
                    sendProgress(index, fileName, 'Caching Civitai preview');
                    try {
                        item.previewPath = await cacheCivitaiPreview(localFile.path, civitaiPreviewUrl);
                    } catch (previewError) {
                        item.previewError = previewError instanceof Error ? previewError.message : String(previewError);
                    }
                }
                Object.assign(item, {
                    status: 'partial',
                    modelId: model.id,
                    modelName: model.name,
                    modelType: model.type,
                    contentSafety: getCivitaiContentSafety(model),
                    safetyCheckedAt: new Date().toISOString(),
                    civitaiPreviewUrl,
                    civitaiPreviewType,
                    civitaiCheckedAt: new Date().toISOString(),
                });
            } else {
                item.civitaiCheckedAt = new Date().toISOString();
            }
        } catch (error) {
            if (!previousItem) item.status = 'error';
            item.error = error instanceof Error ? error.message : String(error);
        }
        scannedItems.push(item);
        sendProgress(index + 1, fileName, 'Complete');
    }

    const isInScannedRoot = itemPath => scanRoots.some(root => {
        const relative = path.relative(root.directory, itemPath);
        return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    const retainedItems = (previousInventory.items || []).filter(item => !isInScannedRoot(item.path));
    const inventory = { scannedAt: new Date().toISOString(), root: comfyUIRoot, items: [...retainedItems, ...scannedItems] };
    store.set('civitai_inventory_hash_cache', nextCache);
    store.set('civitai_inventory', inventory);
    return inventory;
});

ipcMain.handle('refresh-civitai-library-safety', async (event, request = {}) => {
    const kind = request?.kind || 'all';
    const family = request?.family || 'all';
    if (!['all', 'lora', 'checkpoint', 'diffusion'].includes(kind)) throw new Error('Unknown model safety category.');
    if (family !== 'all' && !Object.values(SCAN_FAMILY_FOLDERS).some(folders => folders[family])) throw new Error('Unknown model safety family.');
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    const now = Date.now();
    const modelIds = [...new Set((inventory.items || [])
        .filter(item => inventoryItemMatchesSelection(item, kind, family)
            && item.modelId
            && !item.safetyOverride
            && (!item.safetyCheckedAt || now - (Date.parse(item.safetyCheckedAt) || 0) >= 24 * 60 * 60 * 1000))
        .map(item => item.modelId))];
    const safetyByModel = new Map();
    let nextIndex = 0;
    let completed = 0;
    const sendProgress = (modelId, stage) => {
        if (!event.sender.isDestroyed()) event.sender.send('civitai-safety-progress', { completed, total: modelIds.length, modelId, stage });
    };
    sendProgress(undefined, modelIds.length ? 'Starting safety check' : 'Safety information is current');
    const worker = async () => {
        while (nextIndex < modelIds.length) {
            const modelId = modelIds[nextIndex];
            nextIndex += 1;
            sendProgress(modelId, 'Checking Civitai safety');
            try {
                const model = await fetchCivitaiJson('regular', `/api/v1/models/${modelId}`);
                safetyByModel.set(modelId, getCivitaiContentSafety(model));
            } catch {
                safetyByModel.set(modelId, undefined);
            } finally {
                completed += 1;
                sendProgress(modelId, 'Safety check complete');
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, modelIds.length) }, worker));
    const checkedAt = new Date().toISOString();
    inventory.items = (inventory.items || []).map(item => safetyByModel.has(item.modelId) && safetyByModel.get(item.modelId) ? {
        ...item,
        contentSafety: safetyByModel.get(item.modelId),
        safetyCheckedAt: checkedAt,
    } : item);
    store.set('civitai_inventory', inventory);
    return inventory;
});

ipcMain.handle('set-local-model-safety', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const safety = request?.safety;
    if (safety !== null && safety !== 'sfw' && safety !== 'nsfw') throw new Error('Unsupported safety classification.');
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    inventory.items = (inventory.items || []).map(item => item.path === resolvedPath ? {
        ...item,
        safetyOverride: safety || undefined,
    } : item);
    store.set('civitai_inventory', inventory);
    return inventory;
});

ipcMain.handle('set-local-model-archive-link', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const rawUrl = String(request?.url || '').trim();
    let archiveMirrorUrl;
    if (rawUrl) {
        const parsedUrl = new URL(rawUrl);
        if (parsedUrl.protocol !== 'https:') throw new Error('Archive mirror links must use HTTPS.');
        archiveMirrorUrl = parsedUrl.toString();
    }
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    inventory.items = (inventory.items || []).map(item => item.path === resolvedPath ? { ...item, archiveMirrorUrl } : item);
    store.set('civitai_inventory', inventory);
    return inventory;
});

ipcMain.handle('fetch-local-model-archive', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    const item = (inventory.items || []).find(candidate => candidate.path === resolvedPath);
    if (!item) throw new Error('Model is not present in the local inventory.');

    let sha256 = String(item.sha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
        sha256 = (await hashFile(resolvedPath)).toLowerCase();
        const stat = await fs.promises.stat(resolvedPath);
        const hashCache = store.get('civitai_inventory_hash_cache', {});
        hashCache[resolvedPath] = { size: stat.size, mtimeMs: stat.mtimeMs, sha256: sha256.toUpperCase() };
        store.set('civitai_inventory_hash_cache', hashCache);
    }
    const archiveMirrorUrl = `https://civitaiarchive.com/sha256/${sha256}`;
    const response = await fetch(archiveMirrorUrl, { redirect: 'follow' });
    if (!response.ok) throw new Error(`CivArchive lookup failed (${response.status} ${response.statusText}).`);
    const html = await response.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) throw new Error('CivArchive returned no structured metadata.');
    const pageProps = JSON.parse(nextDataMatch[1])?.props?.pageProps;
    const model = pageProps?.models?.[0];
    if (!model) throw new Error('CivArchive has no model information for this SHA-256.');
    const version = model.version || model.versions?.[0];
    const allMirrors = [...(pageProps.files || []), ...(version?.files || []).flatMap(file => file.mirrors || [])];
    const uniqueMirrors = [...new Map(allMirrors.filter(mirror => mirror?.url).map(mirror => {
        const url = String(mirror.url).startsWith('/') ? `https://civitaiarchive.com${mirror.url}` : String(mirror.url);
        return [url, { source: mirror.source || 'unknown', fileName: mirror.filename || mirror.name || item.fileName, url }];
    })).values()];
    const imageUrl = model.images?.[0]?.image_url || model.images?.[0]?.url || version?.images?.[0]?.image_url || version?.images?.[0]?.url;
    const archiveInfo = {
        title: model.name || item.fileName,
        creator: model.username || model.creator_username || model.creator_name,
        modelType: model.type,
        baseModel: version?.base_model,
        versionName: version?.name,
        downloads: Number(model.download_count ?? version?.download_count) || 0,
        nsfw: Boolean(model.is_nsfw ?? version?.is_nsfw),
        description: stripArchiveHtml(model.description || version?.description).slice(0, 1200),
        tags: Array.isArray(model.tags) ? model.tags.slice(0, 20) : [],
        mirrorCount: uniqueMirrors.length,
        mirrors: uniqueMirrors.slice(0, 20),
        fetchedAt: new Date().toISOString(),
    };
    const currentPreviewPath = item.previewPath || findModelPreviewPath(resolvedPath);
    const archivePreviewPath = imageUrl ? await cacheArchivePreview(resolvedPath, imageUrl) : undefined;
    const sidecarData = {
        archiveMirrorUrl,
        archiveInfo,
        previewPath: currentPreviewPath || archivePreviewPath,
        sha256: sha256.toUpperCase(),
        modelName: item.modelName || archiveInfo.title,
        modelType: item.modelType || archiveInfo.modelType,
        installedVersionName: item.installedVersionName || archiveInfo.versionName,
        contentSafety: item.contentSafety || (archiveInfo.nsfw ? 'nsfw' : 'sfw'),
        safetyCheckedAt: item.safetyCheckedAt || archiveInfo.fetchedAt,
        status: 'matched',
    };
    const stem = resolvedPath.slice(0, -path.extname(resolvedPath).length);
    await fs.promises.writeFile(`${stem}.archive.json`, JSON.stringify(sidecarData, null, 2), 'utf8');
    inventory.items = (inventory.items || []).map(candidate => candidate.path === resolvedPath ? { ...candidate, ...sidecarData } : candidate);
    store.set('civitai_inventory', inventory);
    return inventory;
});

ipcMain.handle('classify-civitai-model-root', async (event, provider) => {
    if (provider !== 'regular' && provider !== 'red') throw new Error('Unknown Civitai provider.');
    const comfyUIRoot = store.get('comfyui_root', '');
    if (!comfyUIRoot) throw new Error('Select your ComfyUI folder before classifying models.');
    const modelRoot = path.join(comfyUIRoot, 'models');
    const classificationRoots = [
        { category: 'loras', kind: 'lora', directory: path.join(modelRoot, 'loras') },
        { category: 'checkpoints', kind: 'checkpoint', directory: path.join(modelRoot, 'checkpoints') },
    ];
    const rootFiles = [];
    for (const root of classificationRoots) {
        if (!fs.existsSync(root.directory)) continue;
        const entries = await fs.promises.readdir(root.directory, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && LOCAL_MODEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                rootFiles.push({ ...root, path: path.join(root.directory, entry.name) });
            }
        }
    }
    const previousCache = store.get('civitai_inventory_hash_cache', {});
    const modelCache = new Map();
    const results = [];

    for (let index = 0; index < rootFiles.length; index += 1) {
        const sourceFile = rootFiles[index];
        const sourcePath = sourceFile.path;
        const fileName = path.basename(sourcePath);
        const sendProgress = stage => {
            if (!event.sender.isDestroyed()) event.sender.send('civitai-scan-progress', { completed: index, total: rootFiles.length, fileName, stage });
        };
        try {
            const stat = await fs.promises.stat(sourcePath);
            const cached = previousCache[sourcePath];
            sendProgress('Identifying root model');
            let sha256 = cached?.size === stat.size && cached?.mtimeMs === stat.mtimeMs ? cached.sha256 : '';
            let identified = await identifyLocalModel(provider, sourcePath, sha256 || undefined, modelCache);
            if (!identified) {
                sendProgress('Calculating SHA-256');
                sha256 = await hashFile(sourcePath);
                identified = await identifyLocalModel(provider, sourcePath, sha256, modelCache);
            }
            if (!identified) {
                results.push({ fileName, status: 'unmatched' });
                continue;
            }
            const folder = inferDestinationFolder(identified.model, identified.version, sourceFile.category);
            const modelType = String(identified.model.type || '').toUpperCase();
            const typeMatchesRoot = sourceFile.kind === 'lora' ? /LORA|LOCON|DORA/.test(modelType) : /CHECKPOINT/.test(modelType);
            if (!typeMatchesRoot) {
                results.push({ fileName, status: 'unmatched' });
                continue;
            }
            const destinationDirectory = path.join(sourceFile.directory, folder);
            const destinationPath = path.join(destinationDirectory, fileName);
            if (fs.existsSync(destinationPath)) {
                results.push({ fileName, status: 'conflict', destination: path.relative(modelRoot, destinationPath) });
                continue;
            }
            sendProgress('Moving model and metadata');
            await fs.promises.mkdir(destinationDirectory, { recursive: true });
            await moveModelCompanions(sourcePath, destinationPath);
            const destinationStat = await fs.promises.stat(destinationPath);
            previousCache[destinationPath] = { size: destinationStat.size, mtimeMs: destinationStat.mtimeMs, sha256: sha256 || identified.sha256 };
            delete previousCache[sourcePath];
            results.push({ fileName, status: 'moved', destination: path.relative(modelRoot, destinationPath), modelName: identified.model.name });
        } catch (error) {
            results.push({ fileName, status: 'error', error: error instanceof Error ? error.message : String(error) });
        } finally {
            if (!event.sender.isDestroyed()) event.sender.send('civitai-scan-progress', { completed: index + 1, total: rootFiles.length, fileName, stage: 'Complete' });
        }
    }

    store.set('civitai_inventory_hash_cache', previousCache);
    return {
        total: rootFiles.length,
        moved: results.filter(result => result.status === 'moved').length,
        unmatched: results.filter(result => result.status === 'unmatched').length,
        conflicts: results.filter(result => result.status === 'conflict').length,
        errors: results.filter(result => result.status === 'error').length,
        results,
    };
});

ipcMain.handle('get-local-model-preview', async (event, modelPath, metadata) => {
    const { resolvedPath } = assertLocalModelPath(modelPath);
    if (activePreviewLoads.has(resolvedPath)) return activePreviewLoads.get(resolvedPath);

    const loadPreview = runQueuedPreviewTask(async () => {
        const localPreviewPath = findModelPreviewPath(resolvedPath);
        if (localPreviewPath) return { url: await previewToDataUrl(localPreviewPath), type: 'image' };
        try {
            const versionId = Number(metadata?.versionId) || undefined;
            const modelId = Number(metadata?.modelId) || undefined;
            let version;
            let model;
            if (versionId) version = await fetchCivitaiJson('regular', `/api/v1/model-versions/${versionId}`);
            let previewMedia = getCivitaiPreviewMedia(version, undefined);
            if (!previewMedia && modelId) {
                model = await fetchCivitaiJson('regular', `/api/v1/models/${modelId}`);
                previewMedia = getCivitaiPreviewMedia(version, model);
            }
            const previewPath = previewMedia?.type === 'image' ? await cacheCivitaiPreview(resolvedPath, previewMedia.url) : undefined;
            queuePreviewInventoryUpdate(resolvedPath, {
                previewPath,
                civitaiPreviewUrl: previewMedia?.url,
                civitaiPreviewType: previewMedia?.type,
                previewCheckedAt: new Date().toISOString(),
                previewError: undefined,
            });
            if (previewPath) return { url: await previewToDataUrl(previewPath), type: 'image' };
            return previewMedia || null;
        } catch (error) {
            queuePreviewInventoryUpdate(resolvedPath, {
                previewCheckedAt: new Date().toISOString(),
                previewError: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    });
    activePreviewLoads.set(resolvedPath, loadPreview);
    try {
        return await loadPreview;
    } finally {
        activePreviewLoads.delete(resolvedPath);
    }
});

ipcMain.handle('select-local-model-preview', async (event, modelPath) => {
    const { resolvedPath } = assertLocalModelPath(modelPath);
    const result = await dialog.showOpenDialog({
        title: 'Choose a model preview image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const sourcePath = result.filePaths[0];
    const extension = path.extname(sourcePath).toLowerCase();
    const stem = resolvedPath.slice(0, -path.extname(resolvedPath).length);
    const destinationPath = `${stem}.preview${extension}`;
    for (const oldPreview of [`${stem}.preview.png`, `${stem}.preview.jpg`, `${stem}.preview.jpeg`, `${stem}.preview.webp`]) {
        if (oldPreview !== destinationPath) await fs.promises.rm(oldPreview, { force: true });
    }
    await fs.promises.copyFile(sourcePath, destinationPath);
    const inventory = store.get('civitai_inventory', { items: [] });
    inventory.items = (inventory.items || []).map(item => item.path === resolvedPath ? { ...item, previewPath: destinationPath } : item);
    store.set('civitai_inventory', inventory);
    return previewToDataUrl(destinationPath);
});

ipcMain.handle('reclassify-local-model', async (event, request) => {
    const { modelRoot, resolvedPath } = assertLocalModelPath(request?.modelPath);
    const category = MODEL_DESTINATIONS[request?.kind];
    if (!category || !MODEL_FOLDERS.has(request?.folder)) throw new Error('Unsupported model destination.');
    const destinationDirectory = path.join(modelRoot, category, request.folder);
    const destinationPath = path.join(destinationDirectory, path.basename(resolvedPath));
    if (destinationPath !== resolvedPath) {
        await fs.promises.mkdir(destinationDirectory, { recursive: true });
        await moveModelCompanions(resolvedPath, destinationPath);
    }
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    let updatedItem;
    inventory.items = (inventory.items || []).map(item => {
        if (item.path !== resolvedPath) return item;
        updatedItem = {
            ...item,
            path: destinationPath,
            relativePath: path.relative(modelRoot, destinationPath),
            kind: request.kind,
            previewPath: findModelPreviewPath(destinationPath),
            status: 'matched',
            userOwned: true,
        };
        return updatedItem;
    });
    if (!updatedItem) throw new Error('Model is missing from the local inventory.');
    store.set('civitai_inventory', inventory);
    return updatedItem;
});

ipcMain.handle('set-local-model-usage-metadata', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const triggerWords = normalizeTriggerWords(request?.triggerWords);
    const steps = Number(request?.steps);
    const cfg = Number(request?.cfg);
    const guidance = Number(request?.guidance);
    const values = {
        triggerWords: triggerWords.length ? triggerWords : undefined,
        sampler: String(request?.sampler || '').trim() || undefined,
        scheduler: String(request?.scheduler || '').trim() || undefined,
        steps: Number.isFinite(steps) && steps > 0 ? steps : undefined,
        cfg: Number.isFinite(cfg) && cfg > 0 ? cfg : undefined,
        guidance: Number.isFinite(guidance) && guidance > 0 ? guidance : undefined,
    };
    const usageMetadata = Object.values(values).some(value => value !== undefined) ? {
        ...values,
        source: 'manual',
        updatedAt: new Date().toISOString(),
    } : undefined;
    return saveUsageMetadata(resolvedPath, usageMetadata);
});

ipcMain.handle('fetch-local-model-usage-metadata', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const { source, provider } = request || {};
    if (source !== 'civitai' && source !== 'archive') throw new Error('Unknown metadata source.');
    if (provider !== 'regular' && provider !== 'red') throw new Error('Unknown Civitai provider.');
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    const item = (inventory.items || []).find(candidate => candidate.path === resolvedPath);
    if (!item) throw new Error('Model is missing from the local inventory.');

    let metadataSource;
    let galleryWorkflows = [];
    if (source === 'civitai') {
        let version;
        if (item.installedVersionId) {
            try {
                version = await fetchCivitaiJson(provider, `/api/v1/model-versions/${item.installedVersionId}`);
            } catch (error) {
                if (error.status !== 404) throw error;
            }
        }
        if (!version) {
            const sha256 = item.sha256 || await hashFile(resolvedPath);
            version = await fetchCivitaiJson(provider, `/api/v1/model-versions/by-hash/${sha256}`);
        }
        let model;
        const modelId = version?.modelId || item.modelId;
        if (modelId) model = await fetchCivitaiJson(provider, `/api/v1/models/${modelId}`);
        let images = [];
        if (version?.id) {
            try {
                const imageResult = await fetchCivitaiJson(provider, `/api/v1/images?modelVersionId=${version.id}&limit=100&sort=Most%20Reactions&period=AllTime`);
                images = imageResult?.items || [];
            } catch {
                // Model and version metadata may still contain usable recommendations.
            }
        }
        metadataSource = { version, model, images };
    } else {
        const sha256 = String(item.sha256 || await hashFile(resolvedPath)).toLowerCase();
        const response = await fetch(`https://civitaiarchive.com/sha256/${sha256}`, { redirect: 'follow' });
        if (!response.ok) throw new Error(`CivArchive lookup failed (${response.status} ${response.statusText}).`);
        const html = await response.text();
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
        if (!nextDataMatch) throw new Error('CivArchive returned no structured metadata.');
        const pageProps = JSON.parse(nextDataMatch[1])?.props?.pageProps;
        const archiveSources = [pageProps];
        const archiveModel = Array.isArray(pageProps?.models) ? pageProps.models[0] : undefined;
        const modelId = archiveModel?.id;
        const versionId = archiveModel?.version?.id || archiveModel?.versions?.[0]?.id;
        if (modelId) {
            const modelUrl = new URL(`/models/${modelId}`, 'https://civitaiarchive.com');
            if (versionId) modelUrl.searchParams.set('modelVersionId', versionId);
            const modelResponse = await fetch(modelUrl, { redirect: 'follow' });
            if (modelResponse.ok) {
                const modelHtml = await modelResponse.text();
                const modelDataMatch = modelHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
                if (modelDataMatch) archiveSources.push(JSON.parse(modelDataMatch[1])?.props?.pageProps);
            }
        }
        galleryWorkflows = await fetchArchiveGalleryWorkflows(archiveSources, 6);
        metadataSource = archiveSources;
    }

    const existing = item.usageMetadata || {};
    const directWords = normalizeTriggerWords(metadataSource?.version?.trainedWords);
    const triggerWords = normalizeTriggerWords(directWords.length ? directWords : findTriggerWords(metadataSource));
    const settings = findRecommendedSettings(metadataSource)
        || galleryWorkflows.map(getWorkflowRecommendedSettings).find(Boolean);
    if (item.kind === 'lora' && !triggerWords.length && !settings) {
        throw new Error(`No trigger words or recommended settings were found on ${source === 'archive' ? 'CivArchive' : 'Civitai'}.`);
    }
    if (item.kind !== 'lora' && !settings) {
        throw new Error(`No recommended generation settings were found on ${source === 'archive' ? 'CivArchive' : 'Civitai'}.`);
    }
    const usageMetadata = {
        ...existing,
        ...(triggerWords.length ? { triggerWords } : {}),
        ...(settings || {}),
        source,
        updatedAt: new Date().toISOString(),
    };
    return saveUsageMetadata(resolvedPath, usageMetadata);
});

ipcMain.handle('get-local-model-prompt-examples', async (event, request) => {
    const { resolvedPath } = assertLocalModelPath(request?.modelPath);
    const provider = request?.provider;
    if (provider !== 'regular' && provider !== 'red') throw new Error('Unknown Civitai provider.');
    const requestedSources = [...new Set(Array.isArray(request?.sources) ? request.sources : [])]
        .filter(source => source === 'civitai' || source === 'archive');
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    const item = (inventory.items || []).find(candidate => candidate.path === resolvedPath);
    if (!item) throw new Error('Model is missing from the local inventory.');

    const examples = [];
    const failures = [];
    if (requestedSources.includes('civitai')) {
        try {
            let version;
            if (item.installedVersionId) {
                try {
                    version = await fetchCivitaiJson(provider, `/api/v1/model-versions/${item.installedVersionId}`);
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
            }
            if (!version) version = await fetchCivitaiJson(provider, `/api/v1/model-versions/by-hash/${item.sha256 || await hashFile(resolvedPath)}`);
            let model;
            const modelId = version?.modelId || item.modelId;
            if (modelId) model = await fetchCivitaiJson(provider, `/api/v1/models/${modelId}`);
            let images = [];
            if (version?.id) {
                try {
                    const imageResult = await fetchCivitaiJson(provider, `/api/v1/images?modelVersionId=${version.id}&limit=100&sort=Most%20Reactions&period=AllTime`);
                    images = imageResult?.items || [];
                } catch (error) {
                    failures.push(error instanceof Error ? error.message : 'Civitai image lookup failed.');
                }
            }
            examples.push(...collectPromptExamples({ version, model, images }, 'civitai'));
        } catch (error) {
            failures.push(error instanceof Error ? error.message : 'Civitai lookup failed.');
        }
    }
    if (requestedSources.includes('archive')) {
        try {
            const sha256 = String(item.sha256 || await hashFile(resolvedPath)).toLowerCase();
            const response = await fetch(`https://civitaiarchive.com/sha256/${sha256}`, { redirect: 'follow' });
            if (!response.ok) throw new Error(`CivArchive lookup failed (${response.status} ${response.statusText}).`);
            const html = await response.text();
            const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
            if (!nextDataMatch) throw new Error('CivArchive returned no structured metadata.');
            const pageProps = JSON.parse(nextDataMatch[1])?.props?.pageProps;
            const archiveSources = [pageProps];
            const archiveModel = Array.isArray(pageProps?.models) ? pageProps.models[0] : undefined;
            const modelId = archiveModel?.id;
            const versionId = archiveModel?.version?.id || archiveModel?.versions?.[0]?.id;
            if (modelId) {
                const modelUrl = new URL(`/models/${modelId}`, 'https://civitaiarchive.com');
                if (versionId) modelUrl.searchParams.set('modelVersionId', versionId);
                const modelResponse = await fetch(modelUrl, { redirect: 'follow' });
                if (modelResponse.ok) {
                    const modelHtml = await modelResponse.text();
                    const modelDataMatch = modelHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
                    if (modelDataMatch) archiveSources.push(JSON.parse(modelDataMatch[1])?.props?.pageProps);
                }
            }
            for (const archiveSource of archiveSources) {
                examples.push(...await fetchArchiveGalleryExamples(archiveSource));
                examples.push(...collectPromptExamples(archiveSource, 'archive'));
                examples.push(...collectArchiveUsageExamples(archiveSource));
            }
        } catch (error) {
            failures.push(error instanceof Error ? error.message : 'CivArchive lookup failed.');
        }
    }
    const uniqueExamples = [...new Map(examples.map(example => [`${example.positive}\n${example.negative || ''}`, example])).values()].slice(0, 20);
    if (!uniqueExamples.length) throw new Error(failures[0] || 'No prompt examples were found for this model.');
    return uniqueExamples;
});

ipcMain.handle('download-civitai-model', async (event, request) => {
    const { downloadId, provider, url, fileName, destination, modelFolder } = request || {};
    if (!downloadId || activeModelDownloads.has(downloadId)) {
        throw new Error('Invalid or duplicate download ID.');
    }
    if (provider !== 'regular' && provider !== 'red') {
        throw new Error('Unknown Civitai provider.');
    }

    const parsedUrl = new URL(url);
    const expectedHost = provider === 'red' ? 'civitai.red' : 'civitai.com';
    if (parsedUrl.protocol !== 'https:' || !CIVITAI_HOSTS.has(parsedUrl.hostname) || !parsedUrl.hostname.endsWith(expectedHost)) {
        throw new Error('The download URL does not match the selected Civitai provider.');
    }
    if (!MODEL_DESTINATIONS[destination]) {
        throw new Error('Unsupported ComfyUI model destination.');
    }
    if (!MODEL_FOLDERS.has(modelFolder)) {
        throw new Error('Unsupported ComfyUI model folder.');
    }

    const comfyUIRoot = store.get('comfyui_root', '');
    if (!comfyUIRoot) throw new Error('Select your ComfyUI folder before downloading.');

    const safeFileName = path.basename(String(fileName || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
        throw new Error('Invalid model filename.');
    }

    const destinationDirectory = path.join(comfyUIRoot, 'models', MODEL_DESTINATIONS[destination], modelFolder);
    const finalPath = path.join(destinationDirectory, safeFileName);
    const partialPath = `${finalPath}.part`;
    const controller = new AbortController();
    activeModelDownloads.set(downloadId, controller);

    try {
        await fs.promises.mkdir(destinationDirectory, { recursive: true });
        const apiKey = store.get(`civitai_${provider}_api_key`, '');
        const response = await fetch(parsedUrl, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            redirect: 'follow',
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            throw new Error(`Civitai download failed (${response.status} ${response.statusText}).`);
        }

        const totalBytes = Number(response.headers.get('content-length')) || 0;
        let receivedBytes = 0;
        const output = fs.createWriteStream(partialPath);
        try {
            for await (const chunk of response.body) {
                if (!output.write(chunk)) {
                    await new Promise(resolve => output.once('drain', resolve));
                }
                receivedBytes += chunk.length;
                event.sender.send('civitai-download-progress', { downloadId, receivedBytes, totalBytes });
            }
            await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()));
        } catch (error) {
            output.destroy();
            throw error;
        }

        await fs.promises.rm(finalPath, { force: true });
        await fs.promises.rename(partialPath, finalPath);
        return { path: finalPath, receivedBytes };
    } catch (error) {
        await fs.promises.rm(partialPath, { force: true }).catch(() => {});
        if (error?.name === 'AbortError') throw new Error('Download cancelled.');
        throw error;
    } finally {
        activeModelDownloads.delete(downloadId);
    }
});

ipcMain.handle('update-civitai-model', async (event, request) => {
    const { downloadId, provider, modelPath, mode } = request || {};
    if (!downloadId || activeModelDownloads.has(downloadId)) throw new Error('Invalid or duplicate download ID.');
    if (provider !== 'regular' && provider !== 'red') throw new Error('Unknown Civitai provider.');
    if (mode !== 'keep' && mode !== 'replace') throw new Error('Unknown update mode.');

    const { resolvedPath } = assertLocalModelPath(modelPath);
    const inventory = store.get('civitai_inventory', { scannedAt: null, root: '', items: [] });
    const item = (inventory.items || []).find(candidate => path.resolve(candidate.path) === resolvedPath);
    if (!item?.modelId || !item.latestVersionId || !item.hasUpdate) throw new Error('No Civitai update is available for this model.');

    const version = await fetchCivitaiJson(provider, `/api/v1/model-versions/${item.latestVersionId}`);
    const files = (version.files || []).filter(file => file.downloadUrl && file.type !== 'Config' && LOCAL_MODEL_EXTENSIONS.has(path.extname(file.name || '').toLowerCase()));
    const updateFile = files.find(file => file.primary) || files[0];
    if (!updateFile) throw new Error('The latest version has no supported model file.');

    const parsedUrl = new URL(updateFile.downloadUrl);
    const expectedHost = provider === 'red' ? 'civitai.red' : 'civitai.com';
    if (parsedUrl.protocol !== 'https:' || !CIVITAI_HOSTS.has(parsedUrl.hostname) || !parsedUrl.hostname.endsWith(expectedHost)) {
        throw new Error('The update URL does not match the selected Civitai provider.');
    }

    const safeFileName = path.basename(String(updateFile.name || '')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    let finalPath = resolvedPath;
    if (mode === 'keep') {
        finalPath = path.join(path.dirname(resolvedPath), safeFileName);
        if (finalPath.toLowerCase() === resolvedPath.toLowerCase() || fs.existsSync(finalPath)) {
            const extension = path.extname(safeFileName) || path.extname(resolvedPath);
            const stem = path.basename(safeFileName, extension);
            const versionLabel = String(version.name || version.id).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
            finalPath = path.join(path.dirname(resolvedPath), `${stem}-${versionLabel}${extension}`);
            let suffix = 2;
            while (fs.existsSync(finalPath)) {
                finalPath = path.join(path.dirname(resolvedPath), `${stem}-${versionLabel}-${suffix}${extension}`);
                suffix += 1;
            }
        }
    }

    const partialPath = `${finalPath}.${downloadId}.part`;
    const backupPath = `${resolvedPath}.${downloadId}.backup`;
    const controller = new AbortController();
    activeModelDownloads.set(downloadId, controller);
    try {
        const apiKey = store.get(`civitai_${provider}_api_key`, '');
        const response = await fetch(parsedUrl, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            redirect: 'follow',
            signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Civitai update failed (${response.status} ${response.statusText}).`);

        const totalBytes = Number(response.headers.get('content-length')) || 0;
        let receivedBytes = 0;
        const output = fs.createWriteStream(partialPath);
        try {
            for await (const chunk of response.body) {
                if (!output.write(chunk)) await new Promise(resolve => output.once('drain', resolve));
                receivedBytes += chunk.length;
                event.sender.send('civitai-download-progress', { downloadId, receivedBytes, totalBytes });
            }
            await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()));
        } catch (error) {
            output.destroy();
            throw error;
        }

        if (mode === 'replace') {
            await fs.promises.rm(backupPath, { force: true });
            await fs.promises.rename(resolvedPath, backupPath);
            try {
                await fs.promises.rename(partialPath, resolvedPath);
                await fs.promises.rm(backupPath, { force: true });
            } catch (error) {
                if (fs.existsSync(backupPath)) await fs.promises.rename(backupPath, resolvedPath);
                throw error;
            }
        } else {
            await fs.promises.rename(partialPath, finalPath);
        }

        await fs.promises.writeFile(`${finalPath}.civitai.info`, JSON.stringify({ modelId: item.modelId, modelVersionId: version.id }, null, 2));
        const hashCache = store.get('civitai_inventory_hash_cache', {});
        delete hashCache[resolvedPath];
        delete hashCache[finalPath];
        store.set('civitai_inventory_hash_cache', hashCache);
        return { path: finalPath, fileName: path.basename(finalPath), receivedBytes, versionName: version.name || String(version.id) };
    } catch (error) {
        await fs.promises.rm(partialPath, { force: true }).catch(() => {});
        if (fs.existsSync(backupPath) && !fs.existsSync(resolvedPath)) await fs.promises.rename(backupPath, resolvedPath).catch(() => {});
        if (error?.name === 'AbortError') throw new Error('Update cancelled.');
        throw error;
    } finally {
        activeModelDownloads.delete(downloadId);
    }
});

ipcMain.handle('cancel-civitai-download', (event, downloadId) => {
    const controller = activeModelDownloads.get(downloadId);
    if (!controller) return false;
    controller.abort();
    return true;
});

