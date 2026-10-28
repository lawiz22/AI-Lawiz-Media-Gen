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
const archive = await import(compile(`${extract(archiveSource, archiveNames)}\nexport { ${archiveNames.join(',')} };`));
const inventoryNames = ['FOLDERS', 'itemMatchesFamily', 'inferItemFamily', 'getImageWorkflow', 'getCompatibleBaseModel', 'getComfyOptions'];
const inventory = await import(compile(`${extract(inventorySource, inventoryNames)}\nexport { ${inventoryNames.join(',')} };`));
const nativeNames = ['MODEL_SCAN_DIRECTORIES', 'MODEL_FOLDERS', 'MODEL_FAMILIES', 'SCAN_FAMILY_FOLDERS', 'inventoryItemMatchesSelection', 'inferModelFolder', 'inferDestinationFolder'];
const native = await import(compile(`${extract(nativeSource, nativeNames)}\nexport { ${nativeNames.join(',')} };`));
const qwenUrl = compile(read('./qwen21Workflow.ts'));
const mossUrl = compile(`import { getQwen21Choices } from '${qwenUrl}';\n${read('./mossWorkflow.ts').replace(/^import .*;$/gm, '')}`);
const photoUrl = compile(read('./mossPhotoWorkflow.ts')
    .replace("import template from '../assets/mossPhotoWorkflow.json';", `const template = ${read('../assets/mossPhotoWorkflow.json')};`)
    .replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const { defaultMossPhotoSettings } = await import(photoUrl);
const useModel = (await import(compile(`
    import { getComfyRelativePath, getRecommendedSettingUpdates, selectInventoryLora } from '${serviceUrl}';
    import { defaultMossSettings } from '${mossUrl}';
    import { defaultMossPhotoSettings, withMossPhotoPrompt } from '${photoUrl}';
    import { defaultQwen21Settings } from '${qwenUrl}';
    ${extract(inventorySource, inventoryNames)}
    export async function use(item, options = {}, provider = 'regular') {
        const actions = [], alerts = [];
        const store = { getState: () => ({ generation: { options }, app: { comfyUIObjectInfo: {} } }) };
        const dispatch = action => actions.push(action);
        const window = { alert: message => alerts.push(message) };
        const updateOptions = payload => ({ type: 'options', payload });
        const setGenerationMode = payload => ({ type: 'mode', payload });
        const setActiveTab = payload => ({ type: 'tab', payload });
        const queueLtxTransfer = payload => ({ type: 'ltx', payload });
        ${extract(inventorySource, ['useModel'])}
        await useModel();
        return { actions, alerts };
    }
`))).use;

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
`);
const optionsHelpers = await import(optionsHelpersUrl);

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
            const promptExamplesLoading = false, activePromptExampleSource = null;
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
