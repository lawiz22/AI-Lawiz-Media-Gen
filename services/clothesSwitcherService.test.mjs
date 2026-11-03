import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const helpers = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(source('./clothesSwitcherWorkflow.ts')
    .replace("import template from '../assets/clothesSwitcherWorkflow.json';", `const template = ${source('../assets/clothesSwitcherWorkflow.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`));
const workflow = await import(workflowURL);
const serviceHelpers = compile(`import { isRecord } from '${helpers}';\n` + source('./minimaxH3Service.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const storage = compile('export const openDB = (...args) => globalThis.clothesSwitcherDB(...args);');
const moss = compile(source('./mossWorkflow.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const api = await import(compile(source('./clothesSwitcherService.ts')
    .replace("from 'idb'", `from '${storage}'`).replace("from './clothesSwitcherWorkflow'", `from '${workflowURL}'`)
    .replace("from './minimaxH3Service'", `from '${serviceHelpers}'`).replace("from './minimaxH3Workflow'", `from '${helpers}'`)
    .replace("from './mossWorkflow'", `from '${moss}'`)));
const draft = () => ({ settings: workflow.defaultClothesSwitcherSettings(), file: new File(['image'], 'source.png', { type: 'image/png', lastModified: 101 }) });
const image = (filename, type = 'temp') => ({ images: [{ filename, type, subfolder: 'clothes' }] });
const completed = { outputs: { '9': image('result.png', 'output'), '150': image('depth.png'), '163': image('canny.png') }, status: { completed: true, status_str: 'success' } };
function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    const info = Object.fromEntries(Object.values(workflow.CLOTHES_SWITCHER_TEMPLATE).map(node => [node.class_type, { input: { required: {} } }]));
    for (const name of config.missing || []) delete info[name];
    let socket, queued;
    const requests = [], progress = [], live = [];
    globalThis.WebSocket = class {
        constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
        close() { this.closed = true; }
        emit(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
    };
    globalThis.localStorage = { getItem: () => 'http://localhost:8188' };
    globalThis.fetch = async (url, init = {}) => {
        const path = new URL(url).pathname; requests.push({ path, init });
        const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
        if (path.startsWith('/object_info/')) {
            const name = decodeURIComponent(path.slice('/object_info/'.length));
            return json(info[name] ? { [name]: info[name] } : {});
        }
        if (path === '/upload/image') {
            if (config.uploadError) return new Response('Upload failed', { status: 500 });
            return json(config.uploadResponse ?? { name: init.body.get('image').name, subfolder: 'input' });
        }
        if (path === '/prompt') { queued = JSON.parse(init.body); await config.onQueue?.(socket); return json(config.queueResponse ?? { prompt_id: 'owned-clothes' }); }
        if (path === '/history/owned-clothes') { await config.onHistory?.(socket); return json({ 'owned-clothes': config.history ?? completed }); }
        if (path === '/api/jobs/owned-clothes/cancel') return config.cancelError ? new Response('Unsupported', { status: 404 }) : json({ cancelled: true });
        throw new Error(`Unexpected request ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return { requests, progress, live, get queued() { return queued; }, get socket() { return socket; },
        run: (input = draft(), signal = new AbortController().signal) => api.generateClothesSwitcher(input, signal, (...args) => progress.push(args), value => live.push(value)) };
}
test('queues the exact workflow once with a unique source upload and all three image outputs', async t => {
    const h = harness(t), input = draft(); input.settings.randomizeSeed = false;
    const result = await h.run(input);
    assert.equal(result.settings.nodes['138'].seed, 123247689436968); assert.equal(h.queued.prompt['138'].inputs.seed, 123247689436968);
    assert.equal(Object.keys(h.queued.prompt).length, 29); assert.ok(h.queued.client_id.startsWith('lawiz-clothes-switcher-'));
    const upload = h.requests.find(r => r.path === '/upload/image');
    assert.equal(upload.init.body.get('overwrite'), 'false'); assert.match(upload.init.body.get('image').name, /^clothes-switcher-/);
    assert.match(result.workflow['139'].inputs.image, /^input\/clothes-switcher-/);
    for (const [key, file] of [['url', 'result.png'], ['depthUrl', 'depth.png'], ['cannyUrl', 'canny.png']]) assert.equal(new URL(result[key]).searchParams.get('filename'), file);
    assert.equal(h.requests.filter(r => r.path === '/prompt').length, 1); assert.equal(h.socket.closed, true);
});
test('randomizes only the execution snapshot and records the actual seed', async t => {
    const h = harness(t), input = draft(), initial = structuredClone(input.settings);
    const result = await h.run(input);
    assert.deepEqual(input.settings, initial); assert.ok(Number.isSafeInteger(result.settings.nodes['138'].seed));
    assert.equal(result.settings.nodes['138'].seed, h.queued.prompt['138'].inputs.seed);
});
test('publishes both node previews before history and ignores foreign outputs/progress', async t => {
    const h = harness(t, { onQueue: socket => {
        socket.emit('executed', { prompt_id: 'foreign', node: '150', output: image('foreign.png') });
        socket.emit('executed', { prompt_id: 'owned-clothes', node: '150', output: image('early-depth.png') });
        socket.emit('executed', { prompt_id: 'owned-clothes', node: '163', output: image('early-canny.png') });
        socket.emit('executing', { prompt_id: 'owned-clothes', node: '138' });
        socket.emit('progress', { prompt_id: 'owned-clothes', value: 2, max: 8 });
        socket.emit('progress', { prompt_id: 'foreign', value: 999, max: 999 });
    } });
    await h.run();
    assert.ok(h.live.some(v => v.depthUrl?.includes('early-depth.png') && v.cannyUrl?.includes('early-canny.png')));
    assert.ok(h.live.some(v => v.step === 2 && v.total === 8)); assert.ok(!h.live.some(v => v.step === 999));
    assert.ok(!h.live.some(v => v.depthUrl?.includes('foreign.png')));
});
test('native sampling frames are scoped to this job and its sampler', async t => {
    const packet = new ArrayBuffer(11); const header = new DataView(packet); header.setUint32(0, 1); header.setUint32(4, 2);
    const h = harness(t, { onHistory: socket => {
        socket.emit('executing', { prompt_id: 'owned-clothes', node: '147' }); socket.onmessage({ data: packet });
        socket.emit('executing', { prompt_id: 'owned-clothes', node: '138' }); socket.onmessage({ data: packet });
        socket.emit('executing', { prompt_id: 'foreign', node: '138' }); socket.onmessage({ data: packet });
    } });
    await h.run();
    const preview = h.live.find(v => v.preview)?.preview; assert.equal(preview.type, 'image/png'); assert.equal(preview.size, 3);
});
for (const missing of ['DepthAnything_V2', 'Canny', 'Image Comparer (rgthree)', 'LoraLoaderModelOnly', 'CacheDiT_Model_Optimizer']) {
    test(`missing ${missing} blocks uploads and queueing`, async t => {
        const h = harness(t, { missing: [missing] }); await assert.rejects(h.run(), /Missing ComfyUI nodes/);
        assert.ok(!h.requests.some(r => r.path === '/upload/image' || r.path === '/prompt'));
    });
}
test('disabled CacheDiT and LoRAs do not block preparation when their node packages are absent', async t => {
    const h = harness(t, { missing: ['CacheDiT_Model_Optimizer', 'LoraLoaderModelOnly'] });
    const input = draft(); input.settings.nodes['167'].enable = false;
    for (const id of workflow.CLOTHES_SWITCHER_LORA_IDS) input.settings.loraEnabled[id] = false;
    await h.run(input);
    assert.deepEqual(h.queued.prompt['138'].inputs.model, ['106', 0]);
    assert.ok(!h.queued.prompt['167']); assert.ok(!h.queued.prompt['144']);
});
for (const config of [{ uploadError: true }, { uploadResponse: {} }, { queueResponse: { node_errors: { '138': 'bad' } } }]) {
    test(`reports upload/submission failures: ${JSON.stringify(config)}`, async t => {
        const h = harness(t, config); await assert.rejects(h.run());
        assert.equal(h.requests.filter(r => r.path === '/prompt').length, config.queueResponse ? 1 : 0);
        if (h.socket) assert.equal(h.socket.closed, true);
    });
}
test('a completed workflow missing either preview is an explicit failure, not a success-shaped fallback', async t => {
    const h = harness(t, { history: { ...completed, outputs: { '9': image('result.png'), '150': image('depth.png') } } });
    await assert.rejects(h.run(), /both previews/);
});
test('ComfyUI execution errors are surfaced and socket is closed', async t => {
    const h = harness(t, { history: { status: { status_str: 'error', messages: ['missing model'] } } });
    await assert.rejects(h.run(), /missing model/); assert.equal(h.socket.closed, true);
});
test('cancellation during submission obtains the owned ID and never sends global interrupt', async t => {
    const abort = new AbortController(), h = harness(t, { onQueue: () => abort.abort() });
    await assert.rejects(h.run(draft(), abort.signal));
    assert.equal(h.requests.filter(r => r.path === '/api/jobs/owned-clothes/cancel').length, 1);
    assert.ok(!h.requests.some(r => r.path === '/interrupt')); assert.equal(h.socket.closed, true);
});
test('cancellation failure is explicit', async t => {
    const abort = new AbortController(), h = harness(t, { onQueue: () => abort.abort(), cancelError: true });
    await assert.rejects(h.run(draft(), abort.signal), /Could not confirm cancellation.*No global interrupt/);
});
test('pre-aborted requests do not upload, queue or open a socket', async t => {
    const abort = new AbortController(); abort.abort(); const h = harness(t);
    await assert.rejects(h.run(draft(), abort.signal)); assert.equal(h.requests.length, 0); assert.equal(h.socket, undefined);
});
test('local draft storage round trips the actual File and protects invalid drafts', async t => {
    const prior = globalThis.clothesSwitcherDB; let stored, closed = 0;
    globalThis.clothesSwitcherDB = async () => ({ get: async () => stored, put: async (_, value) => { stored = value; }, close: () => { closed++; } });
    t.after(() => { globalThis.clothesSwitcherDB = prior; });
    const input = draft(); await api.saveClothesSwitcherDraft(input);
    const restored = await api.loadClothesSwitcherDraft();
    assert.equal(await restored.file.text(), 'image'); assert.equal(restored.file.lastModified, 101);
    assert.equal(closed, 2);
    const legacy = structuredClone(input.settings);
    delete legacy.version; delete legacy.loraEnabled; delete legacy.nodes['167']; delete legacy.nodes['168'];
    legacy.nodes['108'].text = 'Existing clothing prompt'; legacy.nodes['138'].seed = 123;
    stored = { file: input.file, settings: legacy };
    const migrated = await api.loadClothesSwitcherDraft();
    assert.equal(migrated.settings.version, 2); assert.equal(migrated.settings.nodes['167'].enable, true);
    assert.equal(migrated.settings.nodes['108'].text, 'Existing clothing prompt'); assert.equal(migrated.settings.nodes['138'].seed, 123);
    assert.equal(migrated.file.lastModified, 101); assert.equal(migrated.settings.loraEnabled['168'], false);
    stored = { settings: {} };
    await assert.rejects(api.loadClothesSwitcherDraft(), /Invalid Clothes Switcher/); assert.equal(closed, 4);
});
