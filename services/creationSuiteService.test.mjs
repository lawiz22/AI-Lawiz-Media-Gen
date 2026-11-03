import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const helpersURL = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(source('./creationSuiteWorkflow.ts')
    .replace("import template from '../assets/creationSuiteWorkflow.json';", `const template = ${source('../assets/creationSuiteWorkflow.json')};`)
    .replace("import helpers from '../assets/creationSuiteHelpers.json';", `const helpers = ${source('../assets/creationSuiteHelpers.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`));
const workflow = await import(workflowURL);
const serviceHelpers = compile(`import { isRecord } from '${helpersURL}';\n` + source('./minimaxH3Service.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const storage = compile(`export const openDB = (...args) => globalThis.creationSuiteDB(...args);`);
const moss = compile(source('./mossWorkflow.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const api = await import(compile(source('./creationSuiteService.ts')
    .replace("from './mossWorkflow'", `from '${moss}'`)
    .replace("from 'idb'", `from '${storage}'`).replace("from './creationSuiteWorkflow'", `from '${workflowURL}'`)
    .replace("from './minimaxH3Service'", `from '${serviceHelpers}'`).replace("from './minimaxH3Workflow'", `from '${helpersURL}'`)));
const draft = () => ({ settings: workflow.defaultCreationSuiteSettings(), files: Object.fromEntries(workflow.CREATION_SUITE_INPUTS.map(({ role }) => [role, new File(['image'], `${role}.png`, { type: 'image/png' })])) });
const completed = { outputs: { '12': { images: [{ filename: 'scene.png' }] }, '131': { images: [{ filename: 'swap.png' }] } }, status: { completed: true, status_str: 'success' } };
function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    const info = Object.fromEntries(Object.values(workflow.CREATION_SUITE_TEMPLATE).map(spec => [spec.class_type, { input: { required: {} } }]));
    for (const key of config.missing || []) delete info[key];
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
            return json({ name: init.body.get('image').name, subfolder: 'creation-input' });
        }
        if (path === '/prompt') { queued = JSON.parse(init.body); await config.onQueue?.(socket); return json(config.queueResponse ?? { prompt_id: 'owned-creation' }); }
        if (path === '/history/owned-creation') {
            socket.emit('progress', { prompt_id: 'foreign-job', value: 999, max: 999 });
            socket.emit('executing', { prompt_id: 'owned-creation', node: '120' });
            socket.emit('progress', { prompt_id: 'owned-creation', value: 2, max: 20 });
            await config.onHistory?.(socket);
            return json({ 'owned-creation': config.history || completed });
        }
        if (path === '/api/jobs/owned-creation/cancel') return config.cancelError ? new Response('Not supported', { status: 404 }) : json({ cancelled: true });
        throw new Error(`Unexpected request ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return { requests, progress, live, get queued() { return queued; }, get socket() { return socket; },
        run: (input = draft(), signal = new AbortController().signal) => api.generateCreationSuite(input, signal, (...args) => progress.push(args), value => live.push(value)) };
}
test('KJ live events expose real preview, sigma/delta/time and owned workflow node states', async t => {
    const h = harness(t, { onHistory: socket => {
        socket.emit('executing', { prompt_id: 'owned-creation', node: '10' });
        socket.emit('execution_cached', { prompt_id: 'owned-creation', nodes: ['1', '5'] });
        socket.emit('kj_preview_override', { node_id: '33', step: 2, total: 50, sigmas: [1, 0.5, 0], delta: 0.117,
            step_ms: 7160, avg_step_ms: 3990, w: 436, h: 768, image: btoa('preview'), mime: 'image/jpeg' });
    } });
    await h.run();
    assert.equal(h.socket.binaryType, 'arraybuffer');
    const sample = h.live.find(value => value.preview);
    assert.equal(await sample.preview.text(), 'preview'); assert.equal(sample.preview.type, 'image/jpeg');
    assert.equal(sample.nodeId, '10'); assert.equal(sample.previewNodeId, '33'); assert.equal(sample.step, 2);
    assert.deepEqual(sample.deltas, [{ step: 2, value: 0.117 }]); assert.deepEqual(sample.stepTimes, [{ step: 2, value: 7.16 }]);
    assert.equal(sample.averageStepMs, 3990); assert.equal(sample.sigmas.length, 3);
    assert.equal(h.live.at(-1).phase, 'complete'); assert.equal(h.live.at(-1).nodes.find(node => node.id === '1').state, 'cached');
    assert.ok(h.live.every(value => value.nodes.every(node => !node.title.includes('\u23f1'))), 'Saved workflow timing annotations must not look like live timings');
});
test('native binary previews reuse the MOSS decoder and reject foreign execution frames', async t => {
    const packet = new ArrayBuffer(11), header = new DataView(packet); header.setUint32(0, 1); header.setUint32(4, 2);
    const h = harness(t, { onHistory: socket => {
        socket.emit('executing', { prompt_id: 'owned-creation', node: '10' });
        socket.onmessage({ data: packet });
        socket.emit('executing', { prompt_id: 'foreign-job', node: '10' });
        socket.onmessage({ data: packet });
        socket.emit('kj_preview_override', { node_id: '33', step: 99, image: btoa('FOREIGN') });
        socket.emit('kj_preview_override', { prompt_id: 'foreign-job', node_id: '33', step: 99, image: btoa('FOREIGN') });
    } });
    await h.run();
    const frames = h.live.filter(value => value.preview);
    assert.ok(frames.length); assert.ok(frames.every(value => value.preview.type === 'image/png' && value.preview.size === 3));
    assert.ok(!h.live.some(value => value.step === 99));
});
test('scalar sigma telemetry works without an initial sigma schedule and malformed previews are reported', async t => {
    const h = harness(t, { onHistory: socket => {
        socket.emit('kj_preview_override', { node_id: '141', step: 1, total: 20, sigma: 0.5, delta: 0.1, step_ms: 3000 });
        socket.emit('kj_preview_override', { node_id: '141', step: 2, total: 20, image: 'invalid base64!' });
    } });
    await h.run();
    assert.deepEqual(h.live.find(value => value.sigmas.length)?.sigmas, [{ step: 1, value: 0.5 }]);
    assert.ok(h.progress.some(([text]) => text.includes('Invalid live progress message')));
    assert.ok(h.live.every(value => !value.preview));
});
test('live events arriving during submission are replayed only after obtaining the owned prompt ID', async t => {
    const h = harness(t, { onQueue: socket => {
        socket.emit('executing', { prompt_id: 'owned-creation', node: '10' });
        socket.emit('kj_preview_override', { node_id: '33', step: 1, total: 50, delta: 0.2, image: btoa('early') });
    } });
    await h.run(); assert.ok(h.live.some(value => value.previewNodeId === '33' && value.step === 1));
});
test('second sampler resets the previous stage curves and progress advances within each pipeline', async t => {
    const h = harness(t, { onHistory: socket => {
        socket.emit('executing', { prompt_id: 'owned-creation', node: '10' });
        socket.emit('kj_preview_override', { node_id: '33', step: 20, total: 50, delta: 0.2, step_ms: 1000 });
        socket.emit('progress', { prompt_id: 'owned-creation', value: 40, max: 50 });
        socket.emit('executing', { prompt_id: 'owned-creation', node: '120' });
        socket.emit('kj_preview_override', { node_id: '141', step: 1, total: 20, delta: 0.1, step_ms: 2000 });
        socket.emit('progress', { prompt_id: 'owned-creation', value: 15, max: 20 });
    } });
    await h.run();
    assert.deepEqual(h.live.find(value => value.nodeId === '120' && value.deltas.length)?.deltas, [{ step: 1, value: 0.1 }]);
    assert.ok(h.progress.some(([text, value]) => text.includes('40/50') && value > 0.4));
    assert.ok(h.progress.some(([text, value]) => text.includes('15/20') && value > 0.8 && value < 1));
});
test('preflight precedes unique non-overwriting uploads; chain uploads only two reachable images', async t => {
    const h = harness(t), input = draft(), old = structuredClone(input.settings), result = await h.run(input);
    assert.match(result.sceneUrl, /filename=scene.png/); assert.match(result.swapUrl, /filename=swap.png/);
    assert.equal(result.settings.nodes['120'].seed, 43); assert.deepEqual(input.settings, old);
    assert.equal(h.queued.prompt['111'], undefined);
    assert.deepEqual(h.queued.prompt['110'].inputs['images.image_1'], ['11', 0]);
    const uploads = h.requests.filter(request => request.path === '/upload/image');
    assert.equal(uploads.length, 2);
    for (const upload of uploads) {
        assert.equal(upload.init.body.get('overwrite'), 'false');
        assert.match(upload.init.body.get('image').name, /^creation-suite-/);
    }
    assert.ok(h.progress.some(([message]) => message.includes('Swap face-Change expression')));
    assert.ok(!h.progress.some(([message]) => message.includes('999'))); assert.equal(h.socket.closed, true);
});
test('export uploads inputs but never opens a socket or queues a job', async t => {
    const h = harness(t), graph = await api.prepareCreationSuiteWorkflow(draft(), new AbortController().signal);
    assert.match(graph['112'].inputs.image, /^creation-input\/creation-suite-/);
    assert.equal(h.socket, undefined); assert.equal(h.requests.some(request => request.path === '/prompt'), false);
});
test('scene only without reference requires no uploads or Qwen nodes', async t => {
    const h = harness(t, { missing: ['TextEncodeQwenImage21'], history: { ...completed, outputs: { '12': completed.outputs['12'] } } });
    const input = draft(); input.settings.swapEnabled = false; input.settings.useReference = false; input.files = {};
    const result = await h.run(input);
    assert.ok(result.sceneUrl); assert.equal(result.swapUrl, undefined);
    assert.equal(h.requests.some(request => request.path === '/upload/image'), false);
});
test('swap only retains fixed seed and base plus donor, not MOSS dependency', async t => {
    const h = harness(t, { missing: ['SpectrumMOSSImageManual'], history: { ...completed, outputs: { '131': completed.outputs['131'] } } });
    const input = draft(); input.settings.sceneEnabled = false;
    const result = await h.run(input);
    assert.equal(result.sceneUrl, undefined); assert.ok(result.swapUrl);
    assert.equal(result.settings.nodes['120'].seed, 43);
    assert.equal(h.requests.filter(request => request.path === '/upload/image').length, 2);
});
test('missing active nodes fail before uploads or queue', async t => {
    const h = harness(t, { missing: ['SpectrumMOSSImageManual'] });
    await assert.rejects(h.run(), /Missing ComfyUI nodes.*SpectrumMOSSImageManual/);
    assert.equal(h.requests.some(request => ['/upload/image', '/prompt'].includes(request.path)), false);
});
test('upload failures do not queue a render', async t => {
    const h = harness(t, { uploadError: true });
    await assert.rejects(h.run(), /Upload failed|500/); assert.equal(h.queued, undefined);
});
test('completed history must contain every enabled non-empty output', async t => {
    const h = harness(t, { history: { ...completed, outputs: { '12': completed.outputs['12'], '131': { images: [{ filename: '' }] } } } });
    await assert.rejects(h.run(), /without all enabled pipeline outputs/); assert.equal(h.socket.closed, true);
});
test('execution errors are surfaced and do not interrupt unrelated jobs', async t => {
    const h = harness(t, { history: { status: { status_str: 'error', messages: ['CUDA failure'] } } });
    await assert.rejects(h.run(), /CUDA failure/);
    assert.equal(h.live.at(-1).phase, 'failed');
    assert.equal(h.requests.some(request => request.path.includes('/cancel') || request.path === '/interrupt'), false);
});
test('cancel during submission obtains owned ID before targeted cancellation', async t => {
    const abort = new AbortController(), h = harness(t, { onQueue: () => abort.abort() });
    await assert.rejects(h.run(draft(), abort.signal), /abort/i);
    assert.ok(h.requests.some(request => request.path === '/api/jobs/owned-creation/cancel'));
    assert.equal(h.requests.some(request => request.path === '/interrupt'), false); assert.equal(h.socket.closed, true);
});
test('unsupported targeted cancellation reports uncertainty without a global interrupt', async t => {
    const abort = new AbortController(), h = harness(t, { onQueue: () => abort.abort(), cancelError: true });
    await assert.rejects(h.run(draft(), abort.signal), /Could not confirm cancellation.*No global interrupt/);
    assert.equal(h.requests.some(request => request.path === '/interrupt'), false);
});
test('already aborted run does not upload or queue', async t => {
    const h = harness(t), abort = new AbortController(); abort.abort();
    await assert.rejects(h.run(draft(), abort.signal), /abort/i); assert.equal(h.requests.length, 0);
});
test('draft storage round trips settings and File metadata and closes on success/failure', async t => {
    const previous = globalThis.creationSuiteDB, input = draft();
    input.showPreview = false; input.showCharts = false;
    let stored, closed = 0;
    globalThis.creationSuiteDB = async (name, version) => {
        assert.equal(name, 'lawiz-creation-suite'); assert.equal(version, 1);
        return { put: async (store, value, key) => { assert.equal(store, 'drafts'); assert.equal(key, 'workspace'); stored = value; }, get: async () => stored, close: () => closed++ };
    };
    t.after(() => { globalThis.creationSuiteDB = previous; });
    await api.saveCreationSuiteDraft(input); const restored = await api.loadCreationSuiteDraft();
    assert.deepEqual(restored.settings, input.settings); assert.equal(restored.files.sourceImage.lastModified, input.files.sourceImage.lastModified);
    assert.equal(restored.showPreview, false); assert.equal(restored.showCharts, false);
    assert.equal(closed, 2);
    globalThis.creationSuiteDB = async () => ({ get: async () => { throw new Error('Storage unavailable'); }, close: () => closed++ });
    await assert.rejects(api.loadCreationSuiteDraft(), /Storage unavailable/); assert.equal(closed, 3);
});
