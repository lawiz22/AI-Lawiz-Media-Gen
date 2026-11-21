import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = (source, jsx = ts.JsxEmit.None) => {
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx } });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const extract = (source, names) => {
    const tree = ts.createSourceFile('catalog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Map();
    const visit = node => {
        if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
            found.set(node.name.getText(tree), `const ${node.name.getText(tree)} = ${node.initializer.getText(tree)};`);
        }
        if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.set(node.name.text, node.getText(tree));
        ts.forEachChild(node, visit);
    };
    visit(tree);
    return names.map(name => { assert.ok(found.has(name), `Missing actual declaration: ${name}`); return found.get(name); }).join('\n');
};
const serviceUrl = compile(read('./civitaiService.ts'));
const service = await import(serviceUrl);
const archiveSource = read('../components/ArchiveCivitPanel.tsx');
const inventorySource = read('../components/CivitaiInventoryPanel.tsx');
const nativeSource = read('../electron/main.cjs');
const archiveNames = ['FAMILY_OPTIONS', 'inferArchiveFamily', 'getArchiveDestination', 'getArchiveFolder'];
const archive = await import(compile(`import { inferFlux2Variant } from '${serviceUrl}';\n${extract(archiveSource, archiveNames)}\nexport { ${archiveNames.join(',')} };`));
const inventoryNames = ['FOLDERS', 'itemMatchesFamily', 'inferItemFamily', 'getImageWorkflow', 'getCompatibleBaseModel', 'getComfyOptions', 'getFlux2UseDefaults'];
const inventory = await import(compile(`import { inventoryItemMatchesFamily, inventoryFlux2Variant, inferFlux2Variant } from '${serviceUrl}';\n${extract(inventorySource, inventoryNames)}\nexport { ${inventoryNames.join(',')} };`));
test('focused models obey filters and inventory updates do not reset a chosen family', async () => {
    const tree = ts.createSourceFile('panel.tsx', inventorySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let focusEffect;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
            && node.arguments[0]?.getText(tree).includes('lastFocus.current = { path:')) focusEffect = node.getText(tree);
        ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(focusEffect);
    const api = await import(compile(`
        import { inventoryItemMatchesFamily } from '${serviceUrl}';
        ${extract(inventorySource, ['itemMatchesFamily', 'isItemReviewed'])}
        export const run = (items, focusedItemPath, lastFocus, focusRequestId = 1) => {
            const inventory = { items }, libraryFamily = 'flux2', libraryKind = 'lora', normalizedQuery = '', filter = 'all', provider = 'regular', view = 'library';
            let resets = 0;
            const setQuery = () => {}, setLibraryFamily = () => resets++, setLibraryKind = () => {}, setFilter = () => {}, setDisplayLimit = () => {};
            const useMemo = fn => fn(), useEffect = fn => fn();
            ${extract(inventorySource, ['visibleItems'])}
            ${focusEffect};
            return { visibleItems, resets };
        };
    `));
    const flux = { path: 'flux', relativePath: 'loras/FLUX2/test.safetensors', kind: 'lora' };
    const other = { path: 'other', relativePath: 'loras/SDXL/flux2_style.safetensors', fileName: 'flux2_style.safetensors', kind: 'lora' };
    const lastFocus = { current: null };
    assert.deepEqual(api.run([flux, other], 'other', lastFocus).visibleItems, [flux]);
    assert.equal(api.run([{ ...flux }, { ...other }], 'other', lastFocus).resets, 0);
    assert.equal(api.run([flux, other], 'other', lastFocus, 2).resets, 1);
    assert.equal(service.inventoryItemMatchesFamily({ ...flux, relativePath: 'FLUX2/test.safetensors' }, 'flux2'), true);
    assert.equal(service.inventoryItemMatchesFamily({ ...flux, userFamily: 'sdxl' }, 'flux2'), false);
});
const nativeNames = ['MODEL_SCAN_DIRECTORIES', 'MODEL_FOLDERS', 'MODEL_FAMILIES', 'SCAN_FAMILY_FOLDERS', 'inferFlux2Variant', 'inventoryFlux2Variant', 'inventoryItemMatchesSelection', 'inferModelFolder', 'inferDestinationFolder'];
const native = await import(compile(`${extract(nativeSource, nativeNames)}\nexport { ${nativeNames.join(',')} };`));
test('download indexing reads only one model and retains other entries and concurrent manual edits', async () => {
    const path = createRequire(import.meta.url)('node:path');
    const root = path.resolve('test-comfy-root'), target = path.join(root, 'models', 'loras', 'FLUX2', 'new.safetensors');
    const other = { path: path.join(root, 'models', 'loras', 'SDXL', 'old.safetensors'), usageMetadata: { source: 'manual', steps: 17 }, userFamily: 'sdxl' };
    const previous = { path: target, installedVersionId: 1, usageMetadata: { source: 'manual', cfg: 2 } };
    const saved = new Map([
        ['comfyui_root', root], ['civitai_inventory', { items: [other, previous] }],
        ['civitai_inventory_hash_cache', {}],
    ]);
    const reads = [], hashes = [];
    const api = await import(compile(`
        export const run = async (deps, request) => {
            const { path, store, fs, hashFile, fetchCivitaiJson, assertLocalModelPath } = deps;
            const MODEL_SCAN_DIRECTORIES = [{ kind: 'lora', directory: 'loras' }], SCAN_FAMILY_FOLDERS = {};
            const collectModelFiles = () => { throw new Error('Must never enumerate a directory after download'); };
            const readArchiveSidecar = async () => undefined, readHuggingFaceSidecar = readArchiveSidecar, readUsageSidecar = readArchiveSidecar;
            const readModelSidecar = async () => ({ versionId: 2 }), findModelPreviewPath = () => undefined;
            const getLatestCompatibleVersion = model => model.modelVersions[0], getCivitaiPreviewMedia = () => undefined;
            const getCivitaiContentSafety = () => 'sfw';
            const scan = ${extract(nativeSource, ['scanCivitaiLibrary'])};
            return scan({ sender: { isDestroyed: () => true } }, request);
        };
    `));
    const deps = {
        path, store: { get: (key, fallback) => saved.get(key) ?? fallback, set: (key, value) => saved.set(key, value) },
        fs: { promises: { stat: async file => { reads.push(file); return { size: 23, mtimeMs: 42 }; } } },
        assertLocalModelPath: value => { assert.equal(value, target); return { resolvedPath: value }; },
        hashFile: async file => {
            hashes.push(file);
            saved.set('civitai_inventory', { items: [{ ...other, userFamily: 'flux' }, { ...previous, usageMetadata: { source: 'manual', cfg: 4 } }] });
            saved.set('civitai_inventory_hash_cache', { unrelated: { sha256: 'KEEP' } });
            return 'NEW';
        },
        fetchCivitaiJson: async (_provider, url) => url.includes('model-versions')
            ? { id: 2, modelId: 10, name: 'v2', files: [] }
            : { id: 10, modelVersions: [{ id: 2 }] },
    };
    const result = await api.run(deps, { provider: 'regular', modelPath: target, kind: 'all', family: 'all' });
    assert.deepEqual(reads, [target]);
    assert.deepEqual(hashes, [target]);
    assert.equal(result.items.length, 2);
    assert.equal(result.items.find(item => item.path === other.path).userFamily, 'flux');
    assert.deepEqual(result.items.find(item => item.path === other.path).usageMetadata, other.usageMetadata);
    const indexed = result.items.find(item => item.path === target);
    assert.equal(indexed.installedVersionId, 2);
    assert.equal(indexed.usageMetadata.cfg, 4);
    assert.equal(saved.get('civitai_inventory_hash_cache').unrelated.sha256, 'KEEP');
});
test('Civitai, Archive and update completion index the saved path and open My Library without scanning', async () => {
    const source = read('../components/CivitaiPanel.tsx');
    const code = extract(source, ['startDownload', 'completeArchiveDownload', 'updateInventoryItem']);
    assert.ok(!code.includes('scanCivitaiLibrary'));
    assert.ok(!code.includes('setIsScanning'));
    const api = await import(compile(`
        export const run = async (kind, electron, onOpen) => {
            const window = { electron }, crypto = { randomUUID: () => 'download' }, useCallback = fn => fn;
            const comfyUIRoot = 'root', provider = 'regular', family = 'all';
            const getCivitaiDestinationFolder = () => 'flux2-9b';
            let inventory = { items: [] }, errors = [];
            const setDownload = () => {}, setInventory = value => { inventory = typeof value === 'function' ? value(inventory) : value; };
            const setError = message => errors.push(message), setActiveSection = () => {};
            const openInventoryItem = item => onOpen(item);
            const enrichDownloadedItem = async item => { onOpen('enrich'); return { ...item, usageMetadata: { steps: 4 } }; };
            ${code}
            if (kind === 'civitai') await startDownload({ id: 1 }, { id: 2, name: 'v1' }, { name: 'new', sizeKB: 2, downloadUrl: 'url' }, 'lora');
            else if (kind === 'archive') await completeArchiveDownload('new');
            else await updateInventoryItem({ path: 'old', kind: 'lora' }, 'keep');
            return { inventory, errors };
        };
    `));
    for (const kind of ['civitai', 'archive', 'update']) {
        const events = [], requests = [], item = { path: 'new', contentSafety: 'nsfw' };
        const electron = {
            downloadCivitaiModel: async () => ({ path: 'new' }),
            updateCivitaiModel: async () => ({ path: 'new' }),
            indexCivitaiModel: async request => { requests.push(request); return { items: [item] }; },
            scanCivitaiLibrary: () => { throw new Error('No automatic scan'); },
        };
        const result = await api.run(kind, electron, value => events.push(value));
        assert.deepEqual(requests, [{ provider: 'regular', modelPath: 'new' }]);
        assert.equal(events[0], item);
        assert.deepEqual(result.errors, []);
        if (kind !== 'update') {
            assert.equal(events[1], 'enrich');
            assert.equal(result.inventory.items[0].usageMetadata.steps, 4);
        }
    }
    for (const kind of ['civitai', 'archive']) {
        const result = await api.run(kind, { downloadCivitaiModel: async () => ({ path: 'new' }) }, () => assert.fail('No indexed card exists yet'));
        assert.match(result.errors[0], /Restart the Electron desktop app/);
    }
});
test('download Archive enrichment persists into the latest inventory, retaining concurrent edits', async () => {
    const api = await import(compile(`
        export const run = async (deps) => {
            const { store, fetch } = deps;
            const assertLocalModelPath = () => ({ resolvedPath: 'new' });
            let handler;
            const ipcMain = { handle: (_channel, fn) => { handler = fn; } };
            ${nativeSource.slice(nativeSource.indexOf("ipcMain.handle('fetch-local-model-archive'"), nativeSource.indexOf("ipcMain.handle('fetch-local-model-hugging-face'"))}
            return handler({}, { modelPath: 'new' });
        };
    `));
    const target = { path: 'new', sha256: 'a'.repeat(64), usageMetadata: { source: 'manual', steps: 8 } };
    let inventory = { items: [target, { path: 'other', userFamily: 'sdxl' }] };
    const result = await api.run({
        store: { get: () => inventory, set: (_key, value) => { inventory = value; } },
        fetch: async () => {
            inventory = { items: [{ ...target, usageMetadata: { source: 'manual', steps: 17 } }, { path: 'other', userFamily: 'flux2-9b' }, { path: 'added' }] };
            return { status: 404 };
        },
    });
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].usageMetadata.steps, 17);
    assert.equal(result.items[1].userFamily, 'flux2-9b');
    assert.equal(result.items[0].archiveLookupStatus, 'unmatched');
});
test('automatic usage enrichment fills missing recommendations without overwriting manual settings', async () => {
    const path = createRequire(import.meta.url)('node:path');
    const current = { path: 'new.safetensors', usageMetadata: { source: 'manual', steps: 17, triggerWords: ['mine'] } };
    let inventory = { items: [current] }, sidecar;
    const api = await import(compile(`
        export const run = async (path, store, fs) => {
            ${extract(nativeSource, ['saveUsageMetadata'])}
            return saveUsageMetadata('new.safetensors', { source: 'civitai', steps: 4, sampler: 'euler', triggerWords: ['remote'] }, true);
        };
    `));
    const updated = await api.run(path, { get: () => inventory, set: (_key, value) => { inventory = value; } },
        { promises: { writeFile: async (_file, content) => { sidecar = JSON.parse(content); } } });
    assert.deepEqual(updated.usageMetadata, { source: 'manual', steps: 17, sampler: 'euler', triggerWords: ['mine'] });
    assert.deepEqual(sidecar.usageMetadata, updated.usageMetadata);
    assert.match(read('../electron/preload.cjs'), /indexCivitaiModel:.*index-civitai-model/);
});
test('FLUX2 family classification agrees across desktop, library filters and download destinations', () => {
    const cases = [
        [{ relativePath: 'loras/FLUX2/style.safetensors' }, 'flux2-9b'],
        [{ relativePath: 'loras/FLUX2/klein4b.safetensors' }, 'flux2-4b'],
        [{ relativePath: 'loras/flux2-4b/style.safetensors' }, 'flux2-4b'],
        [{ relativePath: 'loras/FLUX2/style.safetensors', baseModel: 'Flux.2 Klein 4B', modelName: 'Style for 4B and 9B' }, 'flux2-4b'],
        [{ relativePath: 'loras/FLUX2/style.safetensors', userFamily: 'flux2-4b' }, 'flux2-4b'],
        [{ relativePath: 'loras/FLUX2/style.safetensors', userFamily: 'sdxl' }, undefined],
        [{ relativePath: 'loras/SDXL/flux2_9b.safetensors' }, undefined],
        [{ relativePath: 'loras/FLUX2/style_4b_9b.safetensors' }, undefined],
        [{ relativePath: 'diffusion_models/flux2/flux2DevFP8.gguf', kind: 'diffusion' }, undefined],
    ];
    for (const [patch, expected] of cases) {
        const item = { kind: 'lora', ...patch };
        assert.equal(service.inventoryFlux2Variant(item), expected);
        assert.equal(native.inventoryFlux2Variant(item), expected);
        if (expected) {
            assert.equal(service.inventoryItemMatchesFamily(item, 'flux2'), true);
            assert.equal(native.inventoryItemMatchesSelection(item, 'all', 'flux2'), true);
        }
        for (const family of ['flux2-9b', 'flux2-4b']) {
            assert.equal(service.inventoryItemMatchesFamily(item, family), expected === family);
            assert.equal(native.inventoryItemMatchesSelection(item, 'lora', family), expected === family);
        }
    }
    for (const size of ['4B', '9B']) {
        const family = `flux2-${size.toLowerCase()}`, model = { name: 'Style for FLUX2 4B and 9B', type: 'LORA' }, version = { name: 'v1', baseModel: `Flux.2 Klein ${size}` };
        assert.equal(service.getCivitaiModelFolder(model, version, 'all'), family);
        assert.equal(native.inferModelFolder(model, version), family);
        assert.equal(archive.inferArchiveFamily(version.baseModel, model.name), family);
        assert.equal(archive.getArchiveFolder(family, 'lora', ''), family);
        assert.ok(native.MODEL_FOLDERS.has(family));
        assert.ok(native.MODEL_FAMILIES.has(family));
    }
});
const qwenUrl = compile(read('./qwen21Workflow.ts'));
const mossGalleryUrl = compile(read('./styleGallery.ts'));
const mossStyleUrl = compile(read('./mossStyleWorkflow.ts').replace("from './styleGallery'", `from '${mossGalleryUrl}'`));
const mossUrl = compile(`import { getQwen21Choices } from '${qwenUrl}';\n${read('./mossWorkflow.ts').replace(/^import .*;$/gm, '')}`);
const photoUrl = compile(read('./mossPhotoWorkflow.ts')
    .replace("import template from '../assets/mossPhotoWorkflow.json';", `const template = ${read('../assets/mossPhotoWorkflow.json')};`)
    .replace("from './qwen21Workflow'", `from '${qwenUrl}'`).replace("from './mossStyleWorkflow'", `from '${mossStyleUrl}'`));
const { defaultMossPhotoSettings } = await import(photoUrl);
const useModel = (await import(compile(`
    import { getComfyRelativePath, getRecommendedSettingUpdates, selectInventoryLora, inventoryItemMatchesFamily, inventoryFlux2Variant, inferFlux2Variant } from '${serviceUrl}';
    import { defaultMossSettings } from '${mossUrl}';
    import { defaultMossPhotoSettings, withMossPhotoPrompt } from '${photoUrl}';
    import { defaultQwen21Settings } from '${qwenUrl}';
    ${extract(inventorySource, inventoryNames)}
    export async function use(item, options = {}, provider = 'regular', objectInfo = {}, destination = 't2i') {
        const actions = [], alerts = [];
        const store = { getState: () => ({ generation: { options }, app: { comfyUIObjectInfo: objectInfo } }) };
        const dispatch = action => actions.push(action);
        const window = { alert: message => alerts.push(message) };
        const updateOptions = payload => ({ type: 'options', payload });
        const setGenerationMode = payload => ({ type: 'mode', payload });
        const setActiveTab = payload => ({ type: 'tab', payload });
        const queueLtxTransfer = payload => ({ type: 'ltx', payload });
        const setUseDestinationOpen = () => {};
        ${extract(inventorySource, ['useModel'])}
        await useModel(destination);
        return { actions, alerts };
    }
`))).use;
test('USE selects the matching FLUX2 base and resets previous LoRAs', async () => {
    const info = { UNETLoader: { input: { required: { unet_name: [['flux2/flux2DevFP8.gguf', 'flux2/klein9b.safetensors', 'flux2/klein4b.safetensors']] } } } };
    assert.equal(inventory.getCompatibleBaseModel('flux2-simple', info, 'flux2-4b'), 'flux2/klein4b.safetensors');
    assert.equal(inventory.getCompatibleBaseModel('flux2-simple', info, 'flux2-9b'), 'flux2/klein9b.safetensors');
    const item = { kind: 'lora', path: 'C:/models/loras/flux2-4b/style.safetensors', relativePath: 'loras/flux2-4b/style.safetensors', fileName: 'style.safetensors', userFamily: 'flux2-4b' };
    const result = await useModel(item, { comfyFlux2Unet: 'flux2/klein9b.safetensors', comfyFlux2Lora2Name: 'FLUX2/old.safetensors' }, 'regular', info);
    const options = result.actions.find(action => action.type === 'options').payload;
    assert.equal(options.comfyFlux2Unet, 'flux2/klein4b.safetensors');
    assert.equal(options.comfyFlux2Lora2Name, '');
    assert.deepEqual(result.alerts, []);
});

test('FLUX2 USE chooses t2i/i2i for 4B/9B and resets destination settings before applying recommendations', async () => {
    const models = ['flux2\\klein9b.safetensors', 'flux2\\klein4b.safetensors'];
    const info = { UNETLoader: { input: { required: { unet_name: [models] } } }, KSamplerSelect: { input: { required: { sampler_name: [['euler', 'heun']] } } } };
    for (const size of ['4b', '9b']) for (const mode of ['t2i', 'i2i']) for (const kind of ['lora', 'diffusion']) {
        const family = `flux2-${size}`, prefix = mode === 't2i' ? 'comfyFlux2' : 'comfyFlux2Edit';
        const selected = {
            kind, path: `C:\\models\\${kind === 'lora' ? 'loras' : 'diffusion_models'}\\flux2\\${kind === 'lora' ? 'style' : `klein${size}`}.safetensors`,
            relativePath: `${kind === 'lora' ? 'loras' : 'diffusion_models'}\\flux2\\${kind === 'lora' ? 'style' : `klein${size}`}.safetensors`,
            fileName: `${kind === 'lora' ? 'style' : `klein${size}`}.safetensors`,
            userFamily: family, usageMetadata: { triggerWords: ['NEW_TRIGGER'], steps: 8, cfg: 0, sampler: 'heun' },
        };
        const before = { comfyModelType: 'sdxl', numImages: 4, comfySeed: 12, comfySeedControl: 'fixed',
            [prefix + 'Style']: { id: 'old' }, [prefix + 'StyleStrength']: 0.3,
            [mode === 't2i' ? 'comfyFlux2UseStyleSettings' : 'comfyFlux2EditUseStyleSettings']: true,
            [prefix + 'Lora1Name']: 'old.safetensors', [prefix + 'Lora2Name']: 'another.safetensors',
            comfyFlux2EditUseCacheDit: true, comfyFlux2EditPreserveSourceStyle: true,
            comfyFlux2EditReferenceRoles: ['identity', 'pose'], comfyFlux2EditReferenceDescriptions: ['person', 'jump'],
        };
        const result = await useModel(selected, before, 'red', info, mode);
        const updates = result.actions.find(action => action.type === 'options').payload;
        assert.equal(updates.comfyModelType, mode === 't2i' ? 'flux2-simple' : 'flux2-edit');
        assert.equal(updates[prefix + 'Unet'], `flux2\\klein${size}.safetensors`);
        assert.equal(updates[prefix + 'Clip'], size === '9b' ? 'qwen38BFluxKlein9BTE_38b.safetensors'
            : mode === 't2i' ? 'qwen3vl_4b_fp8_scaled.safetensors' : 'qwen_3_4b.safetensors');
        assert.equal(updates[prefix + 'Style'], undefined);
        assert.ok(Object.hasOwn(updates, prefix + 'Style'), 'patch explicitly clears existing style');
        assert.equal(updates[mode === 't2i' ? 'comfyFlux2UseStyleSettings' : 'comfyFlux2EditUseStyleSettings'], false);
        assert.equal(updates[prefix + 'Lora2Name'], '');
        assert.equal(updates[prefix + 'Lora1Name'], kind === 'lora' ? 'flux2\\style.safetensors' : '');
        assert.equal(updates[prefix + 'Prompt'], kind === 'lora' ? 'NEW_TRIGGER' : '');
        const samplingPrefix = mode === 't2i' ? 'comfy' : 'comfyFlux2Edit';
        assert.equal(updates[samplingPrefix + 'Steps'], 8);
        assert.equal(updates[samplingPrefix + 'Cfg'], 0);
        assert.equal(updates[samplingPrefix + 'Sampler'], 'heun');
        assert.equal(updates.numImages, 1); assert.equal(updates.comfySeed, undefined);
        assert.equal(updates.comfyPromptExampleSource.modelPath, selected.path);
        assert.equal(updates.comfyPromptExampleSource.provider, 'red');
        assert.equal(result.actions.find(action => action.type === 'mode').payload, mode);
        assert.equal(updates.comfyFlux2EditReferenceRoles, undefined, 'reference roles are not reset');
        assert.equal(updates.comfyFlux2EditReferenceDescriptions, undefined);
        if (mode === 'i2i') {
            assert.equal(updates.comfyFlux2EditUseCacheDit, false);
            assert.equal(updates.comfyFlux2EditPreserveSourceStyle, false);
        }
        assert.deepEqual(result.alerts, []);
    }
    const defaults = service.getRecommendedSettingUpdates('flux2-edit', undefined, info);
    assert.deepEqual(defaults, { comfyFlux2EditSteps: 4, comfyFlux2EditCfg: 1, comfyFlux2EditSampler: 'euler' });
    assert.ok(inventorySource.includes("useModel('t2i')")); assert.ok(inventorySource.includes("useModel('i2i')"));
});

test('library cards read and dispatch through the mounted Redux Provider, not an imported store', async () => {
    const resolve = name => pathToFileURL(createRequire(import.meta.url).resolve(name)).href;
    const { probe } = await import(compile(`
        import React from '${resolve('react')}';
        import { Provider, useStore, useDispatch } from '${resolve('react-redux')}';
        export function probe(providerStore, capture) {
            const Card = () => {
                ${extract(inventorySource, ['dispatch', 'store'])}
                capture({ store, dispatch });
                return null;
            };
            return React.createElement(Provider, { store: providerStore }, React.createElement(Card));
        }
    `));
    const state = { app: { comfyUIObjectInfo: { UNETLoader: {} } } };
    const providerStore = { getState: () => state, dispatch: action => action, subscribe: () => () => {} };
    let captured;
    renderToStaticMarkup(probe(providerStore, value => { captured = value; }));
    assert.equal(captured.store, providerStore);
    assert.equal(captured.dispatch, providerStore.dispatch);
    assert.equal(captured.store.getState(), state);
});

test('USE accepts the installed Klein 9B INT8 model but still blocks a missing or incompatible base', async () => {
    const model = 'flux2\\flux2Klein9BInt8_v10.safetensors';
    const item = {
        kind: 'lora', path: 'C:\\models\\loras\\flux2\\1950s_scifi_flux2_klein_r64_100.safetensors',
        relativePath: 'loras\\flux2\\1950s_scifi_flux2_klein_r64_100.safetensors',
        fileName: '1950s_scifi_flux2_klein_r64_100.safetensors',
        baseModel: 'Flux.2 Klein 9B Base v1.0', userFamily: 'flux2-9b',
    };
    const catalog = models => ({ UNETLoader: { input: { required: { unet_name: [models] } } } });
    const result = await useModel(item, {}, 'regular', catalog(['flux-2-klein-4b-fp8.safetensors', model]));
    const options = result.actions.find(action => action.type === 'options').payload;
    assert.equal(options.comfyFlux2Unet, model);
    assert.equal(options.comfyFlux2Clip, 'qwen38BFluxKlein9BTE_38b.safetensors');
    assert.equal(options.comfyFlux2Lora1Name, 'flux2\\1950s_scifi_flux2_klein_r64_100.safetensors');
    assert.deepEqual(result.alerts, []);
    for (const models of [[], ['flux-2-klein-4b-fp8.safetensors', 'flux2\\flux2DevFP8GGUF_ggufQ2K.gguf']]) {
        const blocked = await useModel(item, {}, 'regular', catalog(models));
        assert.deepEqual(blocked.actions, []);
        assert.match(blocked.alerts[0], /No installed FLUX2-9B base model/);
    }
});

const families = [
    { id: 'qwen21', baseModels: ['Qwen 2.1'], folder: 'qwen21', file: 'qwen_image_2.1_int8.safetensors' },
    { id: 'moss', baseModels: ['MOSS Image', 'MOSS Image Base'], folder: 'moss', file: 'mossImageINT8.safetensors' },
    { id: 'minimax-h3', baseModels: ['MiniMax H3'], folder: 'H3', file: 'h3ErosMax_fp8.safetensors' },
];
const model = { id: 1, name: 'A model with no family in its title', type: 'Checkpoint', modelVersions: [] };
const version = baseModel => ({ id: 2, name: 'Release', baseModel, files: [], downloadUrl: '' });
const item = (family, overrides = {}) => ({
    path: `C:\\ComfyUI\\models\\diffusion_models\\${family.folder}\\${family.file}`,
    relativePath: `diffusion_models\\${family.folder}\\${family.file}`,
    kind: 'diffusion', fileName: family.file, ...overrides,
});

test('Blue and Red send actual base-model filters for all three new families and preserve query/type/pagination', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const urls = [];
    globalThis.fetch = async (url, options) => {
        urls.push({ url: new URL(url), options });
        return new Response(JSON.stringify({ items: [model] }), { status: 200 });
    };
    for (const provider of ['regular', 'red']) for (const family of families) {
        assert.ok(service.CIVITAI_FAMILIES.some(option => option.id === family.id));
        await service.searchCivitaiModels({ provider, family: family.id, modelType: 'LORA', query: 'portrait', sort: 'Newest', cursor: 'next' });
        const request = urls.at(-1);
        assert.equal(request.url.origin, provider === 'red' ? 'https://civitai.red' : 'https://civitai.com');
        assert.deepEqual(request.url.searchParams.getAll('baseModels'), family.baseModels);
        assert.equal(request.url.searchParams.get('query'), 'portrait');
        assert.equal(request.url.searchParams.get('types'), 'LORA');
        assert.equal(request.url.searchParams.get('cursor'), 'next');
    }
    assert.equal(urls.length, 6);
});

test('CivArchive exposes the exact upstream names, including both MOSS variants', () => {
    for (const family of families) for (const baseModel of family.baseModels) {
        assert.ok(archive.FAMILY_OPTIONS.some(option => option.value === baseModel));
        assert.equal(archive.inferArchiveFamily(baseModel, 'Untitled model'), family.id);
        assert.equal(archive.getArchiveDestination('Checkpoint', family.id), 'diffusion');
        for (const type of ['LORA', 'LoCon', 'DoRA']) assert.equal(archive.getArchiveDestination(type, family.id), 'lora');
        for (const destination of ['checkpoint', 'diffusion', 'lora']) assert.equal(archive.getArchiveFolder(family.id, destination, ''), family.folder);
    }
});

test('CivArchive search forwards the selected family unchanged alongside the other filters', async () => {
    const run = (await import(compile(`
        export async function run(selectedFamily) {
            let request;
            const window = { electron: { searchCivitaiArchive: async value => { request = value; return { items: [] }; } } };
            const query = ' portrait ', family = selectedFamily, modelType = 'LORA', resultType = 'version';
            const platform = 'civitai', sort = 'newest', period = 'all', rating = 'safe', status = 'available';
            const setIsSearching = () => {}, setError = message => { if (message) throw new Error(message); }, setResult = () => {};
            ${extract(archiveSource, ['search'])}
            await search(3);
            return request;
        }
    `))).run;
    for (const family of families) for (const baseModel of family.baseModels) {
        const request = await run(baseModel);
        assert.equal(request.base_model, baseModel);
        assert.equal(request.q, 'portrait');
        assert.equal(request.type, 'LORA');
        assert.equal(request.page, 3);
        assert.equal(request.platform, 'civitai');
    }
});

test('Blue/Red downloads and native organization agree on folders and never default new families to SD 1.5', () => {
    for (const family of families) for (const baseModel of family.baseModels) {
        const selected = version(baseModel);
        assert.equal(service.getDefaultDestination(model, selected, family.id), 'diffusion');
        assert.equal(service.getDefaultDestination({ ...model, type: 'LORA' }, selected, family.id), 'lora');
        assert.equal(service.getCivitaiModelFolder(model, selected, 'all'), family.folder);
        assert.equal(service.getCivitaiModelFolder(model, undefined, family.id), family.folder);
        assert.equal(native.inferModelFolder(model, selected), family.folder);
        for (const destination of ['checkpoint', 'diffusion', 'lora']) {
            assert.equal(service.getCivitaiDestinationFolder(model, selected, family.id, destination), family.folder);
            assert.equal(native.inferDestinationFolder(model, selected, destination === 'checkpoint' ? 'checkpoints' : destination), family.folder);
        }
        assert.ok(native.MODEL_FAMILIES.has(family.id));
        assert.ok(native.MODEL_FOLDERS.has(family.folder));
        for (const kind of ['checkpoint', 'diffusion', 'lora']) {
            assert.ok(native.SCAN_FAMILY_FOLDERS[kind][family.id].includes(family.folder));
            assert.ok(inventory.FOLDERS[kind].includes(family.folder));
        }
    }
});

test('local inventory categories and safety selections recognize folders, metadata and legacy QWEN 2.1 names', () => {
    for (const family of families) {
        const selected = item(family);
        assert.equal(inventory.inferItemFamily(selected), family.id);
        assert.equal(inventory.itemMatchesFamily(selected, family.id), true);
        assert.equal(native.inventoryItemMatchesSelection(selected, 'all', family.id), true);
        assert.equal(native.inventoryItemMatchesSelection(selected, 'lora', family.id), false);
        const rootFile = item(family, { relativePath: `diffusion_models/${family.file}` });
        assert.equal(inventory.itemMatchesFamily(rootFile, family.id), true);
        assert.equal(native.inventoryItemMatchesSelection(rootFile, 'all', family.id), true);
    }
    const legacy = item(families[0], { relativePath: 'loras/QWEN/qwen_image_2.1_viggle.safetensors', kind: 'lora' });
    assert.equal(inventory.itemMatchesFamily(legacy, 'qwen21'), true);
    assert.equal(native.inventoryItemMatchesSelection(legacy, 'lora', 'qwen21'), true);
    const olderQwen = { ...legacy, fileName: 'Qwen-Image-Lightning.safetensors', relativePath: 'loras/QWEN/Qwen-Image-Lightning.safetensors' };
    assert.equal(inventory.itemMatchesFamily(olderQwen, 'qwen21'), false);
    assert.equal(native.inventoryItemMatchesSelection(olderQwen, 'all', 'qwen21'), false);
    const overridden = { ...legacy, userFamily: 'sdxl' };
    assert.equal(inventory.itemMatchesFamily(overridden, 'qwen21'), false);
    assert.equal(native.inventoryItemMatchesSelection(overridden, 'all', 'qwen21'), false);
});

test('USE selects Qwen 2.1 / MOSS workflows and preserves their other settings', async () => {
    const moss = await useModel(item(families[1]), { comfyMoss: { unet: 'old', steps: 17, loras: [] } });
    assert.deepEqual(moss.alerts, []);
    assert.equal(moss.actions[0].payload.comfyModelType, 'moss-image');
    assert.equal(moss.actions[0].payload.comfyMoss.unet, `moss\\${families[1].file}`);
    assert.equal(moss.actions[0].payload.comfyMoss.steps, 17);
    const qwen = await useModel(item(families[0]), { comfyModelType: 'qwen21-turbo', comfyQwen21Turbo: { unet: 'old', steps: 6, loras: [] } });
    assert.equal(qwen.actions[0].payload.comfyModelType, 'qwen21-turbo');
    assert.equal(qwen.actions[0].payload.comfyQwen21Turbo.steps, 6);
    assert.equal(qwen.actions[0].payload.comfyQwen21Turbo.unet, `qwen21\\${families[0].file}`);
    const initialized = await useModel(item(families[0]));
    assert.equal(initialized.actions[0].payload.comfyModelType, 'qwen21-t2i');
    assert.equal(initialized.actions[0].payload.comfyQwen21T2i.loras.length, 6);
    for (const result of [moss, qwen, initialized]) {
        assert.deepEqual(result.actions.slice(-2), [{ type: 'mode', payload: 't2i' }, { type: 'tab', payload: 'image-generator' }]);
    }
});

test('USE adds new LoRAs without replacing active slots, and surfaces a full-slot error without dispatching', async () => {
    for (const family of families.slice(0, 2)) {
        const selected = item(family, { kind: 'lora', relativePath: `loras/${family.folder}/new.safetensors`, usageMetadata: { triggerWords: ['portrait'] } });
        const field = family.id === 'moss' ? 'comfyMoss' : 'comfyQwen21T2i';
        const loras = [{ name: 'keep.safetensors', enabled: true, strength: 0.7 }, { name: '', enabled: false, strength: 1 }];
        const result = await useModel(selected, { [field]: { unet: 'keep-base', loras } });
        const settings = result.actions[0].payload[field];
        assert.equal(settings.unet, 'keep-base');
        assert.deepEqual(settings.loras[0], loras[0]);
        assert.equal(settings.loras[1].name, `${family.folder}/new.safetensors`);
        assert.equal(settings.loras[1].enabled, true);
        assert.equal(loras[1].enabled, false);
        const full = await useModel(selected, { [field]: { unet: 'keep-base', loras: [loras[0]] } });
        assert.equal(full.actions.length, 0);
        assert.match(full.alerts[0], /All LoRA slots are enabled/);
    }
    assert.deepEqual(service.selectInventoryLora([{ name: 'MOSS\\SAME.safetensors', enabled: true }], 'moss/same.safetensors'), [{ name: 'moss/same.safetensors', enabled: true }]);
});

test('PHOTO inventory USE retains its subtab, model/sampler settings, four LoRA slots and own-prompt imports', async () => {
    const photo = { ...defaultMossPhotoSettings(), aiWriter: false, steps: 37 };
    const options = { comfyModelType: 'moss-photo', comfyMossPhoto: photo };
    const model = await useModel(item(families[1]), options);
    assert.deepEqual(model.alerts, []);
    assert.equal(model.actions[0].payload.comfyModelType, 'moss-photo');
    assert.equal(model.actions[0].payload.comfyMossPhoto.steps, 37);
    assert.equal(model.actions[0].payload.comfyMossPhoto.nodes['160'].model, `moss\\${families[1].file}`);
    const selected = item(families[1], { kind: 'lora', relativePath: 'loras/moss/new.safetensors', usageMetadata: { triggerWords: ['landscape'] } });
    const lora = await useModel(selected, options);
    assert.equal(lora.actions[0].payload.comfyModelType, 'moss-photo');
    assert.equal(lora.actions[0].payload.comfyMossPhoto.nodes['160']['lora 1'], 'moss/new.safetensors');
    assert.equal(lora.actions[0].payload.comfyMossPhoto.myPrompts[0].text, 'landscape');
    assert.equal(photo.nodes['160']['lora 1'], 'None');
    const full = structuredClone(photo);
    for (let index = 1; index <= 4; index++) full.nodes['160'][`lora ${index}`] = `old-${index}`;
    const rejected = await useModel(selected, { ...options, comfyMossPhoto: full });
    assert.equal(rejected.actions.length, 0);
    assert.match(rejected.alerts[0], /four MOSS PHOTO LoRA slots|All LoRA slots/);
});

test('MiniMax H3 USE never dispatches an SD image workflow', async () => {
    for (const kind of ['diffusion', 'lora']) {
        const result = await useModel(item(families[2], { kind }));
        assert.equal(result.actions.length, 0);
        assert.match(result.alerts[0], /Video > Minimax REF2v H3/);
    }
});

test('FLUX 1 models have no image workflow any more: USE explains it and never falls back to SD 1.5', async () => {
    const base = { kind: 'lora', path: 'C:/models/loras/x/style.safetensors', relativePath: 'loras/custom/style.safetensors', fileName: 'style.safetensors' };
    for (const flux1 of [{ ...base, userFamily: 'flux' }, { ...base, relativePath: 'loras/Flux/style.safetensors' }, { ...base, kind: 'checkpoint', relativePath: 'checkpoints/flux-dev/base.safetensors' }, { ...base, modelName: 'Flux.1 D portrait' }]) {
        assert.equal(inventory.getImageWorkflow(flux1), null);
        const result = await useModel(flux1, { comfyModelType: 'sdxl' });
        assert.deepEqual(result.actions, []);
        assert.match(result.alerts[0], /FLUX 1 workflow was removed/);
    }
    assert.equal(inventory.getImageWorkflow({ ...base, userFamily: 'flux2' }).modelType, 'flux2-simple');
    assert.equal(inventory.getImageWorkflow({ ...base, relativePath: 'loras/SDXL/style.safetensors' }).modelType, 'sdxl');
    assert.equal(inventory.inferItemFamily({ ...base, modelName: 'Flux.1 D portrait' }), 'flux');
    assert.equal(service.getRecommendedSettingUpdates('sdxl', { guidance: 3.5, cfg: 6 }, {}).comfyFluxGuidance, undefined);
});

test('existing SD, FLUX, Qwen, ZIT and LTX folder routing stays intact', async () => {
    for (const [baseModel, folder] of [['SD 1.5', 'sd15'], ['SDXL 1.0', 'SDXL'], ['Flux.1 D', 'Flux'], ['Flux.2 D', 'flux2'], ['Krea 2', 'krea'], ['Qwen', 'QWEN'], ['ZImageTurbo', 'ZIT'], ['LTXV 2.3', 'LTX2']]) {
        assert.equal(service.getCivitaiModelFolder(model, version(baseModel), 'all'), folder);
        assert.equal(native.inferModelFolder(model, version(baseModel)), folder);
    }
    const sd = await useModel({ kind: 'checkpoint', relativePath: 'checkpoints/SD1.5/base.safetensors', fileName: 'base.safetensors' });
    assert.equal(sd.actions[0].payload.comfyModelType, 'sd1.5');
    const ltx = await useModel({ kind: 'lora', relativePath: 'loras/LTX2/camera.safetensors', fileName: 'camera.safetensors' });
    assert.deepEqual(ltx.actions, [{ type: 'ltx', payload: { selectedLora: 'LTX2/camera.safetensors' } }]);
});

const nativeTree = ts.createSourceFile('main.cjs', nativeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let scanHandler;
const findScanHandler = node => {
    if (ts.isCallExpression(node) && node.expression.getText(nativeTree) === 'ipcMain.handle'
        && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'scan-civitai-library') {
        scanHandler = node.arguments[1].getText(nativeTree);
    }
    ts.forEachChild(node, findScanHandler);
};
findScanHandler(nativeTree);
assert.ok(scanHandler, 'Missing actual scan IPC handler');
const scanHarnessUrl = compile(`
    import nodePath from 'node:path';
    const path = nodePath.win32;
    ${extract(nativeSource, ['MODEL_SCAN_DIRECTORIES', 'SCAN_FAMILY_FOLDERS'])}
    export function createHarness() {
        const root = 'C:\\\\isolated-catalog-test\\\\ComfyUI';
        const state = new Map([['comfyui_root', root]]);
        const roots = [];
        const store = { get: (key, fallback) => state.has(key) ? state.get(key) : fallback, set: (key, value) => state.set(key, value) };
        const collectModelFiles = async (directory, kind) => { roots.push({ directory, kind }); };
        ${extract(nativeSource, ['scanCivitaiLibrary'])}
        const scan = ${scanHandler};
        return { scan, roots, root, state };
    }
`);
const { createHarness } = await import(scanHarnessUrl);

test('the actual scan IPC handler accepts each new family for every model kind and both providers', async () => {
    for (const family of families) for (const kind of ['all', 'lora', 'checkpoint', 'diffusion']) for (const provider of ['regular', 'red']) {
        const harness = createHarness();
        const result = await harness.scan({}, { provider, kind, family: family.id });
        assert.equal(result.root, harness.root);
        assert.deepEqual(result.items, []);
        assert.ok(Number.isFinite(Date.parse(result.scannedAt)));
        assert.ok(harness.roots.length > 0);
        for (const scanned of harness.roots) {
            if (kind !== 'all') assert.equal(scanned.kind, kind);
            const folder = scanned.directory.split('\\').at(-1);
            assert.ok(native.SCAN_FAMILY_FOLDERS[scanned.kind][family.id].includes(folder));
            assert.ok(scanned.directory.startsWith(`${harness.root}\\models\\`));
        }
        assert.equal(harness.state.get('civitai_inventory'), result);
    }
    const harness = createHarness();
    await assert.rejects(harness.scan({}, { provider: 'regular', kind: 'all', family: 'unknown' }), /Unknown model scan family/);
    assert.equal(harness.roots.length, 0);
    assert.equal(harness.state.has('civitai_inventory'), false);
});

test('Library Tools calls the real scan handler, and stale desktop errors explicitly request a full restart', async () => {
    const { run } = await import(compile(`
        import { createHarness } from '${scanHarnessUrl}';
        export async function run(family, stale = false) {
            const harness = createHarness(), requests = [], busy = [], errors = [], results = [];
            const window = { electron: { scanCivitaiLibrary: async request => {
                requests.push(request);
                if (stale) throw new Error("Error invoking remote method 'scan-civitai-library': Error: Unknown model scan family.");
                return harness.scan({}, request);
            } } };
            const setIsScanning = value => busy.push(value), setError = value => errors.push(value);
            const setScanProgress = () => {}, setInventory = value => results.push(value);
            ${extract(read('../components/CivitaiPanel.tsx'), ['scanLibrary'])}
            await scanLibrary({ kind: 'all', family });
            return { requests, busy, errors, results };
        }
    `));
    for (const family of families) {
        const result = await run(family.id);
        assert.deepEqual(result.requests, [{ provider: 'regular', kind: 'all', family: family.id }]);
        assert.deepEqual(result.busy, [true, false]);
        assert.deepEqual(result.errors, ['']);
        assert.equal(result.results.length, 1);
    }
    const stale = await run('moss', true);
    assert.equal(stale.results.length, 0);
    assert.deepEqual(stale.busy, [true, false]);
    assert.match(stale.errors.at(-1), /Unknown model scan family/);
    assert.match(stale.errors.at(-1), /Fully quit and restart the Electron desktop app/);
    assert.match(stale.errors.at(-1), /Refreshing this page is not enough/);
});

test('USE carries model/LoRA prompt-example metadata for MOSS and Qwen 2.1 on Blue and Red', async () => {
    for (const family of families.slice(0, 2)) for (const kind of ['diffusion', 'lora']) for (const provider of ['regular', 'red']) {
        const selected = item(family, { kind, modelName: 'Selected model', archiveMirrorUrl: 'https://civitaiarchive.com/model/123', usageMetadata: { triggerWords: ['portrait'] } });
        const result = await useModel(selected, {}, provider);
        assert.deepEqual(result.actions[0].payload.comfyPromptExampleSource, {
            modelPath: selected.path, modelName: 'Selected model', provider,
            sources: ['civitai', 'archive'], triggerWords: kind === 'lora' ? ['portrait'] : [],
        });
    }
});

const optionsSource = read('../components/OptionsPanel.tsx');
const kreaUrl = compile(`import { getQwen21Choices } from '${qwenUrl}';\n${read('./krea2EditWorkflow.ts').replace(/^import .*;$/gm, '')}`);
const destinationUrl = compile(read('../utils/promptDestination.ts')
    .replace("'../services/qwen21Workflow'", `'${qwenUrl}'`)
    .replace("'../services/krea2EditWorkflow'", `'${kreaUrl}'`));
const optionsHelpersUrl = compile(`
    import { findInventoryModel } from '${serviceUrl}';
    import { defaultQwen21Settings } from '${qwenUrl}';
    import { defaultMossSettings } from '${mossUrl}';
    import { defaultMossPhotoSettings } from '${photoUrl}';
    import { getImagePromptOnlyUpdate } from '${destinationUrl}';
    ${extract(optionsSource, ['getSelectedLoraNames', 'appendMissingTriggerWords'])}
    export { getSelectedLoraNames };
    export async function sourcesFor(options, inventory, cached = []) {
        const active = true;
        const styleInventory = inventory;
        const selectedLoraNames = getSelectedLoraNames(options);
        let result;
        const setPromptExampleSources = value => { result = value; };
        const window = { electron: {
            hasLocalModelPromptExamples: async path => cached.includes(path),
            getCivitaiInventory: async () => inventory,
        } };
        ${extract(optionsSource, ['loadSources'])}
        await loadSources();
        return result;
    }
    export function apply(options, example, triggerWords = []) {
        let result, open;
        const generationMode = 't2i', activePromptExampleSource = { triggerWords };
        const updateOptions = value => { result = value; };
        const setPromptExamplesOpen = value => { open = value; };
        ${extract(optionsSource, ['applyPromptExample'])}
        applyPromptExample(example);
        return { result, open };
    }
    export function promptRequests() {
        const state = {}, pending = [], promptExampleRequest = { current: 0 };
        const window = { electron: { getLocalModelPromptExamples: request => new Promise(resolve => pending.push({ request, resolve })) } };
        const setActivePromptExampleSource = value => { state.source = value; };
        const setPromptExamplesOpen = value => { state.open = value; };
        const setPromptExamplesLoading = value => { state.loading = value; };
        const setPromptExamplesError = value => { state.error = value; };
        const setPromptExamples = value => { state.examples = value; };
        const setPromptExamplesStorage = value => { state.storage = value; };
        ${extract(optionsSource, ['openPromptExamples'])}
        return { state, pending, open: openPromptExamples, invalidate: () => promptExampleRequest.current++ };
    }
`);
const optionsHelpers = await import(optionsHelpersUrl);

test('FLUX2 local prompt discovery includes the style LoRA in both modes and deduplicates additional slots', async () => {
    const lora = { path: 'C:/models/loras/FLUX2/ink.safetensors', relativePath: 'loras/FLUX2/ink.safetensors', fileName: 'ink.safetensors', kind: 'lora', modelName: 'Ink style', usageMetadata: { triggerWords: ['INK'] } };
    for (const [modelType, prefix] of [['flux2-simple', 'comfyFlux2'], ['flux2-edit', 'comfyFlux2Edit']]) {
        const options = { comfyModelType: modelType, [`${prefix}Style`]: { lora: 'FLUX2/ink.safetensors' }, [`${prefix}Lora1Name`]: 'FLUX2/ink.safetensors' };
        assert.deepEqual(optionsHelpers.getSelectedLoraNames(options), ['FLUX2/ink.safetensors']);
        const found = await optionsHelpers.sourcesFor(options, { items: [lora] }, [lora.path]);
        assert.equal(found.length, 1); assert.equal(found[0].hasLocalPrompts, true);
        assert.equal(found[0].modelName, 'Ink style');
        const remote = await optionsHelpers.sourcesFor(options, { items: [lora] });
        assert.equal(remote.length, 1);
        assert.equal(remote[0].hasLocalPrompts, false);
        assert.deepEqual(remote[0].sources, ['civitai']);
        const applied = optionsHelpers.apply(options, { positive: 'A red coat', negative: 'blur', source: 'civitai' }, ['INK']);
        assert.equal(applied.result[`${prefix}Prompt`], 'A red coat, INK');
        assert.equal(applied.result.comfyPrompt, undefined);
        assert.equal(applied.result[`${prefix}Style`], undefined);
    }
    assert.deepEqual(optionsHelpers.getSelectedLoraNames({ comfyModelType: 'flux2-simple', comfyFlux2UseLora: false, comfyFlux2Style: { lora: 'style' }, comfyFlux2Lora1Name: 'disabled' }), ['style']);
});

test('KREA2 USE respects shared family matching and clears the Simple style before applying Library recommendations', async () => {
    for (const patch of [
        { relativePath: 'loras/KREA/ink.safetensors' },
        { relativePath: 'loras/KREA2/ink.safetensors' },
        { relativePath: 'loras/custom/ink.safetensors', baseModel: 'Krea 2' },
        { relativePath: 'loras/custom/ink.safetensors', userFamily: 'krea2' },
    ]) {
        const selected = { path: 'C:/models/loras/ink.safetensors', fileName: 'ink.safetensors', kind: 'lora',
            usageMetadata: { triggerWords: ['INK'], steps: 8, cfg: 2, sampler: 'Euler' }, ...patch };
        assert.equal(inventory.getImageWorkflow(selected).modelType, 'krea2-simple');
        const result = await useModel(selected, { comfyModelType: 'krea2-simple', comfyKreaStyle: { title: 'Old style' }, comfyKreaUseStyleSettings: true });
        const updates = result.actions[0].payload;
        assert.equal(updates.comfyKreaStyle, undefined);
        assert.equal(updates.comfyKreaUseStyleSettings, false);
        assert.equal(updates.comfyKreaStyleStrength, undefined);
        assert.equal(updates.comfyKreaPrompt, 'INK');
        assert.equal(updates.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
        assert.equal(updates.comfySteps, 8);
        assert.equal(updates.comfyKreaLora1Name, service.getComfyRelativePath(selected));
    }
});

test('Simple KREA prompt examples follow current style and retain active extras/base sources without touching RAW', async () => {
    const old = { kind: 'lora', path: 'C:/models/loras/KREA/old.safetensors', relativePath: 'loras/KREA/old.safetensors', fileName: 'old.safetensors' };
    const current = { ...old, path: 'C:/models/loras/KREA/ink.safetensors', relativePath: 'loras/KREA/ink.safetensors', fileName: 'ink.safetensors', modelName: 'Krea ink' };
    const base = { kind: 'diffusion', path: 'C:/models/diffusion_models/krea2.safetensors', relativePath: 'diffusion_models/krea2.safetensors', fileName: 'krea2.safetensors' };
    const inventory = { items: [old, current, base] };
    const options = { comfyModelType: 'krea2-simple', comfyKreaStyle: { lora: 'KREA/ink.safetensors' }, comfyKreaLora1Name: 'KREA/ink.safetensors',
        comfyPromptExampleSource: { modelPath: old.path, modelName: 'Old', sources: ['civitai'] } };
    assert.deepEqual(optionsHelpers.getSelectedLoraNames(options), ['KREA/ink.safetensors']);
    const sources = await optionsHelpers.sourcesFor(options, inventory, [current.path, old.path]);
    assert.deepEqual(sources.map(value => value.modelPath), [current.path]);
    assert.equal(sources[0].hasLocalPrompts, true);
    const remote = await optionsHelpers.sourcesFor(options, inventory);
    assert.equal(remote[0].hasLocalPrompts, false);
    const cleared = await optionsHelpers.sourcesFor({ ...options, comfyKreaStyle: undefined, comfyKreaLora1Name: '' }, inventory);
    assert.deepEqual(cleared, []);
    assert.deepEqual(optionsHelpers.getSelectedLoraNames({ ...options, comfyKreaUseLora: false }), ['KREA/ink.safetensors']);
    const baseSources = await optionsHelpers.sourcesFor({ ...options, comfyKreaUnet: 'krea2.safetensors',
        comfyPromptExampleSource: { modelPath: base.path, modelName: 'Krea base', sources: ['civitai'] } }, inventory);
    assert.deepEqual(baseSources.map(value => value.modelPath), [base.path, current.path]);
    assert.deepEqual(optionsHelpers.getSelectedLoraNames({ comfyModelType: 'krea2-raw', comfyKreaStyle: options.comfyKreaStyle }), []);
});

test('FLUX2 prompt sources follow the current style, retain active extras/base models and offer remote examples', async () => {
    const old = { kind: 'lora', path: 'C:\\models\\loras\\FLUX2\\scifi.safetensors', relativePath: 'loras/FLUX2/scifi.safetensors', fileName: 'scifi.safetensors', modelName: '1950s SciFi' };
    const current = { ...old, path: 'C:\\models\\loras\\FLUX2\\ghibli.safetensors', relativePath: 'loras/FLUX2/ghibli.safetensors', fileName: 'ghibli.safetensors', modelName: 'Retro Ghibli', archiveMirrorUrl: 'https://civitaiarchive.com/model/1', usageMetadata: { triggerWords: ['ghibli'] } };
    const base = { kind: 'diffusion', path: 'C:\\models\\diffusion_models\\flux2\\klein9b.safetensors', relativePath: 'diffusion_models/flux2/klein9b.safetensors', fileName: 'klein9b.safetensors' };
    const inventory = { items: [old, current, base] };
    const source = { modelPath: old.path, modelName: old.modelName, provider: 'red', sources: ['civitai'] };
    for (const [modelType, prefix] of [['flux2-simple', 'comfyFlux2'], ['flux2-edit', 'comfyFlux2Edit']]) {
        const options = { comfyModelType: modelType, comfyPromptExampleSource: source, [`${prefix}Style`]: { lora: 'flux2\\ghibli.safetensors' } };
        const result = await optionsHelpers.sourcesFor(options, inventory, [old.path]);
        assert.deepEqual(result.map(value => value.modelName), ['Retro Ghibli']);
        assert.equal(result[0].hasLocalPrompts, false);
        assert.equal(result[0].provider, 'red');
        assert.deepEqual(result[0].sources, ['civitai', 'archive']);
        assert.deepEqual(result[0].triggerWords, ['ghibli']);
        const extra = await optionsHelpers.sourcesFor({ ...options, [`${prefix}Lora1Name`]: 'FLUX2/scifi.safetensors' }, inventory, [old.path]);
        assert.equal(extra.length, 2, 'old source remains only when its LoRA is still active');
        const removed = await optionsHelpers.sourcesFor({ ...options, [`${prefix}Style`]: undefined }, inventory, [old.path]);
        assert.deepEqual(removed, []);
        const selectedBase = await optionsHelpers.sourcesFor({ ...options, [`${prefix}Unet`]: 'flux2/klein9b.safetensors', comfyPromptExampleSource: { ...source, modelPath: base.path } }, inventory);
        assert.equal(selectedBase[0].modelPath, base.path);
        assert.equal(selectedBase.length, 2);
    }
});

test('late prompt requests cannot replace examples from the newly selected source', async () => {
    const harness = optionsHelpers.promptRequests();
    const old = { modelPath: 'old', modelName: 'Old', provider: 'regular', sources: ['civitai'] };
    const current = { modelPath: 'new', modelName: 'New', provider: 'red', sources: ['civitai', 'archive'] };
    const first = harness.open(old);
    const second = harness.open(current);
    harness.pending[0].resolve({ examples: [{ positive: 'old' }], storage: 'sidecar' });
    await first;
    assert.equal(harness.state.source, current);
    assert.deepEqual(harness.state.examples, []);
    assert.equal(harness.state.loading, true);
    harness.pending[1].resolve({ examples: [{ positive: 'new' }], storage: 'remote' });
    await second;
    assert.deepEqual(harness.state.examples, [{ positive: 'new' }]);
    assert.equal(harness.state.loading, false);
    assert.deepEqual(harness.pending[1].request, { modelPath: 'new', provider: 'red', sources: ['civitai', 'archive'] });
    const third = harness.open(old);
    harness.invalidate();
    harness.pending[2].resolve({ examples: [{ positive: 'obsolete' }], storage: 'remote' });
    await third;
    assert.deepEqual(harness.state.examples, []);
    assert.ok(optionsSource.includes('{activePromptExampleSource?.modelName}'));
});

test('prompt-example discovery reads only enabled LoRAs from MOSS and both Qwen 2.1 modes', async () => {
    const loras = [{ name: 'enabled.safetensors', enabled: true }, { name: 'disabled.safetensors', enabled: false }, { name: '', enabled: true }];
    for (const [modelType, field] of [['moss-image', 'comfyMoss'], ['qwen21-t2i', 'comfyQwen21T2i'], ['qwen21-turbo', 'comfyQwen21Turbo']]) {
        assert.deepEqual(optionsHelpers.getSelectedLoraNames({ comfyModelType: modelType, [field]: { loras } }), ['enabled.safetensors']);
    }
    assert.ok(optionsHelpers.getSelectedLoraNames({ comfyModelType: 'moss-image' }).length > 0);
    assert.ok(optionsHelpers.getSelectedLoraNames({ comfyModelType: 'qwen21-turbo' }).length > 0);
    assert.deepEqual(optionsHelpers.getSelectedLoraNames({ comfyModelType: 'sdxl', comfySdxlLora1Name: 'legacy.safetensors' }), ['legacy.safetensors']);
    const selected = item(families[0], { modelName: 'Qwen source', archiveMirrorUrl: 'https://civitaiarchive.com/model/1' });
    const used = await useModel(selected, {}, 'red');
    const options = used.actions[0].payload;
    const localLora = { ...selected, path: 'C:\\ComfyUI\\models\\loras\\qwen21\\local.safetensors', relativePath: 'loras/qwen21/local.safetensors', fileName: 'local.safetensors', kind: 'lora' };
    options.comfyQwen21T2i.loras = [{ name: 'qwen21/local.safetensors', enabled: true }, { name: 'qwen21/disabled.safetensors', enabled: false }];
    const discovered = await optionsHelpers.sourcesFor(options, { items: [localLora] }, [localLora.path]);
    assert.equal(discovered[0].modelPath, selected.path);
    assert.equal(discovered[0].hasLocalPrompts, false);
    assert.equal(discovered[0].provider, 'red');
    assert.deepEqual(discovered[0].sources, ['civitai', 'archive']);
    assert.equal(discovered[1].modelPath, localLora.path);
    assert.equal(discovered[1].hasLocalPrompts, true);
    assert.equal(discovered.length, 2);
});

test('the actual MOSS and Qwen rendering branches include remote and local prompt-example buttons', async () => {
    const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
    const { render } = await import(compile(`
        import React from '${reactUrl}';
        export function render(modelType, promptExampleSources, isDisabled = false) {
            const options = { comfyModelType: modelType }, activeTab = 'image-generator';
            const promptExamplesLoading = false, activePromptExampleSource = null, promptExamplesError = '', promptExamplesOpen = false;
            const openPromptExamples = () => {}, updateOptions = () => {};
            const comfyUIObjectInfo = {}, sourceImage = null, onSourceImageChange = () => {}, onOpenSourceLibrary = () => {};
            const MossSettingsPanel = () => React.createElement('div', null, 'MOSS settings');
            const Qwen21SettingsPanel = () => React.createElement('div', null, 'Qwen settings');
            ${extract(optionsSource, ['renderPromptExampleButtons', 'renderComfyUIOptions'])}
            return renderComfyUIOptions();
        }
    `, ts.JsxEmit.React));
    const sources = [{ modelPath: 'remote', modelName: 'Remote model', hasLocalPrompts: false }, { modelPath: 'local', modelName: 'Saved LoRA', hasLocalPrompts: true }];
    for (const modelType of ['moss-image', 'qwen21-t2i', 'qwen21-turbo']) {
        const html = renderToStaticMarkup(render(modelType, sources));
        assert.match(html, /Find prompt examples/);
        assert.match(html, /Local prompts/);
        assert.match(html, /Remote model/);
        assert.match(html, /Saved LoRA/);
        assert.equal((html.match(/<button/g) || []).length, 2);
        assert.doesNotMatch(renderToStaticMarkup(render(modelType, [])), /Find prompt examples/);
        assert.match(renderToStaticMarkup(render(modelType, sources, true)), /disabled=""/);
    }
});

test('Use prompt targets the correct nested workflow fields without changing models, LoRAs or sampler settings', () => {
    for (const [modelType, field] of [['moss-image', 'comfyMoss'], ['qwen21-t2i', 'comfyQwen21T2i'], ['qwen21-turbo', 'comfyQwen21Turbo']]) {
        const settings = { unet: 'keep-base', steps: 13, loras: [{ name: 'keep-lora', enabled: true }], prompt: 'old', negativePrompt: 'old negative' };
        const options = { provider: 'comfyui', comfyModelType: modelType, [field]: settings };
        const applied = optionsHelpers.apply(options, { positive: 'A landscape', negative: 'watermark' }, ['keyword']);
        assert.equal(applied.open, false);
        assert.equal(modelType === 'moss-image' ? applied.result.comfyPrompt : applied.result[field].prompt, 'A landscape, keyword');
        assert.equal(applied.result[field].negativePrompt, 'watermark');
        assert.equal(applied.result[field].unet, 'keep-base');
        assert.equal(applied.result[field].steps, 13);
        assert.deepEqual(applied.result[field].loras, settings.loras);
        assert.equal(settings.prompt, 'old');
        assert.equal(optionsHelpers.apply(options, { positive: 'A landscape' }).result[field].negativePrompt, '');
        assert.equal(optionsHelpers.apply(options, { positive: 'same', negative: 'same' }).result[field].negativePrompt, '');
        const initialized = optionsHelpers.apply({ provider: 'comfyui', comfyModelType: modelType }, { positive: 'A landscape' });
        assert.ok(initialized.result[field].unet);
        assert.ok(initialized.result[field].loras.length > 0);
    }
    for (const [modelType, positiveField, negativeField] of [['krea2-simple', 'comfyKreaPrompt', 'comfyKreaNegativePrompt'], ['flux2-simple', 'comfyFlux2Prompt', 'comfyFlux2NegativePrompt'], ['sd1.5', 'comfyPrompt', 'comfyNegativePrompt']]) {
        const applied = optionsHelpers.apply({ provider: 'comfyui', comfyModelType: modelType }, { positive: 'keyword portrait', negative: 'watermark' }, ['keyword']);
        assert.equal(applied.result[positiveField], 'keyword portrait');
        assert.equal(applied.result[negativeField], 'watermark');
    }
});
