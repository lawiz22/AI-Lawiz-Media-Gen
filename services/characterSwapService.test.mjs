import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const workflow = await import(compile(readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')));
globalThis.__swapIsRecord = workflow.isRecord;
globalThis.__swapStorage = new Map();
const service = await import(compile(`
const isRecord = globalThis.__swapIsRecord;
const openDB = async () => ({
    get: async (_store, key) => structuredClone(globalThis.__swapStorage.get(key)),
    put: async (_store, value, key) => { globalThis.__swapStorage.set(key, structuredClone(value)); },
    close: () => {},
});
${readFileSync(new URL('./characterSwapService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')}
`));
const planner = await import(compile(readFileSync(new URL('./characterSwapPlanner.ts', import.meta.url), 'utf8')));

test('new projects are low-VRAM, persistent and have no second pass', () => {
    const plan = service.initialSwapPlan();
    assert.equal(plan.run, 'recursive');
    assert.equal(plan.between_shots, 'free');
    assert.equal(plan.shot_cache, 'output');
    assert.equal(plan.shot_storage, 'lossless');
    assert.equal(plan.skip_fill, 'original');
    assert.equal(plan.unload_before_join, true);
    assert.equal(plan.second_pass.enabled, false);
});
test('native plan edits preserve individual shots and explicit second pass while keeping durable execution', () => {
    const normalized = service.normalizeSwapPlan({
        run: 'auto', shot_cache: 'temp', skip_fill: 'drop', second_pass: { enabled: true, scale: 1.5 },
        segs: [{ prompt: 'first', enabled: true }, { enabled: false }], global_ref: 'person.png',
    });
    assert.equal(normalized.run, 'recursive');
    assert.equal(normalized.shot_cache, 'output');
    assert.equal(normalized.skip_fill, 'original');
    assert.deepEqual(normalized.second_pass, { enabled: true, scale: 1.5 });
    assert.deepEqual(normalized.segs, [{ prompt: 'first', enabled: true }, { enabled: false }]);
    assert.equal(normalized.global_ref, 'person.png');
});
test('render readiness requires source, enabled shots and a usable character reference', () => {
    assert.throws(() => service.validateSwapPlan({}), /source video/);
    assert.throws(() => service.validateSwapPlan({ video: 'source.mp4', segs: [{ enabled: false }], global_ref: 'person.png' }), /Enable/);
    assert.throws(() => service.validateSwapPlan({ video: 'source.mp4', segs: [{ enabled: false, ref: 'ignored.png' }, {}] }), /character reference/);
    assert.doesNotThrow(() => service.validateSwapPlan({ video: 'source.mp4', global_ref: 'person.png' }));
    assert.doesNotThrow(() => service.validateSwapPlan({ video: 'source.mp4', segs: [{ ref: 'person.png' }, {}] }));
});
test('saved project restores its exact in-flight job and completed results', async () => {
    const project = {
        version: 1, plan: service.initialSwapPlan(), settings: {}, signatures: { 'source.mp4': 'model-a' },
        job: { state: 'running', clientId: 'owner', promptId: 'job-12', base: 'http://server', plan: { video: 'source.mp4' }, workflow: { '1283': {} } },
        result: { base: 'http://server', videos: [{ filename: 'previous.mp4', subfolder: '', type: 'output' }], plan: { video: 'previous.mp4' } },
    };
    await service.saveSwapProject(project);
    project.job.promptId = 'modified-after-save';
    const restored = await service.loadSwapProject();
    assert.equal(restored.job.promptId, 'job-12');
    assert.equal(restored.result.videos[0].filename, 'previous.mp4');
    assert.deepEqual(restored.signatures, { 'source.mp4': 'model-a' });
});
test('unsupported saved versions fail explicitly instead of discarding the project', async () => {
    globalThis.__swapStorage.set('current', { version: 99, plan: {} });
    await assert.rejects(service.loadSwapProject(), /invalid|unsupported/);
});
test('corrupt saved ownership cannot silently unlock an existing job', async () => {
    globalThis.__swapStorage.set('current', { version: 1, plan: {}, settings: {}, signatures: {}, job: { state: 'running' } });
    await assert.rejects(service.loadSwapProject(), /ownership/);
});
test('native join history returns result, comparison, then aligned source', () => {
    const videos = service.swapHistoryVideos({ outputs: { '1202': {
        images: ['result.mp4', 'comparison.mp4', 'guide.mp4'].map(filename => ({ filename, subfolder: 'swap' })),
    } } });
    assert.deepEqual(videos.map(v => v.filename), ['result.mp4', 'comparison.mp4', 'guide.mp4']);
    assert.equal(videos[0].type, 'output');
    assert.equal(service.swapHistoryVideos({ outputs: { '751': { gifs: [{ filename: 'wrong.mp4' }] } } }).length, 0);
    assert.match(service.swapVideoURL('http://server', { filename: 'shot & 1.mp4', subfolder: 'swap', type: 'output' }), /shot\+%26\+1.mp4/);
});
test('OOM errors pause explicitly without throwing away successful shots', () => {
    assert.match(service.swapHistoryError({ status: { status_str: 'error', messages: ['CUDA out of memory'] } }), /CUDA out of memory/);
    assert.equal(service.swapHistoryError({ status: { status_str: 'success' } }), undefined);
    assert.equal(service.isSwapJobActive({ state: 'submitting' }), true);
    assert.equal(service.isSwapJobActive({ state: 'running' }), true);
    assert.equal(service.isSwapJobActive({ state: 'failed' }), false);
});
test('queue ownership is based on the unique client ID, not another running job', () => {
    assert.equal(service.queueJobId({
        queue_running: [[0, 'other-id', {}, { client_id: 'other' }]],
        queue_pending: [[1, 'owned-id', {}, { client_id: 'mine' }]],
    }, 'mine'), 'owned-id');
    assert.equal(service.queueJobId({}, 'mine'), undefined);
});
test('uncertain submissions recover from queue/history without a second POST', async t => {
    const previous = globalThis.fetch;
    t.after(() => { globalThis.fetch = previous; });
    const requests = [];
    globalThis.fetch = async (url, init) => {
        requests.push([url, init.method]);
        return Response.json(String(url).endsWith('/queue') ? { queue_running: [], queue_pending: [] }
            : { recovered: { prompt: [0, 'recovered', {}, { client_id: 'mine' }] } });
    };
    assert.equal(await service.recoverSwapJob({ base: 'http://server', clientId: 'mine' }), 'recovered');
    assert.equal(requests.length, 2);
    assert.ok(requests.every(([_url, method]) => method !== 'POST'));
});
test('server errors and payload errors are not success-shaped fallbacks', async t => {
    const previous = globalThis.fetch;
    t.after(() => { globalThis.fetch = previous; });
    globalThis.fetch = async () => new Response('missing nodes', { status: 400 });
    await assert.rejects(service.swapJSON('http://server', '/prompt', {}), error =>
        error instanceof service.SwapHTTPError && error.status === 400 && /missing nodes/.test(error.message));
    globalThis.fetch = async () => Response.json({ error: 'no valid stored shots' });
    await assert.rejects(service.swapJSON('http://server', '/bfs/shotloop/combine', {}), /no valid stored shots/);
});

const nativeShape = [
    'import { app } from "../../scripts/app.js";',
    'import { api } from "../../scripts/api.js";',
    'import { createApp } from "./vendor/vue.esm-browser.prod.mjs";',
    'import { styles } from "./shotloop/styles.js";',
    'import { wheelToCanvas } from "./bfs_wheel.js";',
    'function Panel(io) { const sel = {}; const setVideo = () => {}; const setRef = () => {}; function refreshFiles() {} io.expose({}); return () => {}; }',
    'const guide = new URL("./docs/BFSShotPlanner.md", import.meta.url).href;',
    'app.registerExtension({ name: "BFSNodes.ShotPlanner" });',
].join('\n');
test('native planner adapter removes ComfyUI canvas coupling and resolves remote views', () => {
    for (const source of [nativeShape, nativeShape.replaceAll('\n', '\r\n')]) {
        const adapted = planner.adaptPlannerModule(source, 'http://server/extensions/bfsnodes/bfs_shot_loop.js', 'blob:bridge');
        assert.doesNotMatch(adapted, /registerExtension|scripts\/app.js|scripts\/api.js|bfs_wheel.js/);
        assert.match(adapted, /from "blob:bridge"/);
        assert.match(adapted, /http:\/\/server\/extensions\/bfsnodes\/shotloop\/styles.js/);
        assert.match(adapted, /export function mount/);
        assert.match(adapted, /http:\/\/server\/extensions\/bfsnodes\/docs\/BFSShotPlanner.md/);
    }
});
test('incompatible BFS versions fail before executing their module', () => {
    assert.throws(() => planner.adaptPlannerModule('export const changedAPI = 1;', 'http://server/native.js', 'blob:bridge'), /Unsupported/);
    assert.throws(() => planner.adaptPlannerModule(nativeShape.replace('const setRef =', 'const changedRef ='), 'http://server/native.js', 'blob:bridge'), /Unsupported BFS Library/);
});
test('Library bridge uses native source selection and exact global/shot reference setters without overwriting other shots', async () => {
    const source = `function Panel(io) {
        const plan = { video: "old.mp4", global_ref: "global.png", segs: [{prompt: "keep first"}, {prompt: "keep second"}] };
        const sel = {value: 1}; const segs = {get value() {return plan.segs;}};
        const setVideo = name => {plan.video = name; plan.segs = []; plan.mode = "single"; plan.end_f = 360;};
        const setRef = (target, field, name) => {if (target === "global") plan[field] = name; else plan.segs[target][field] = name;};
        function refreshFiles() {plan.refreshed = true;}
        io.expose({reload: () => {}});
        return plan;
    }
app.registerExtension({});`;
    const adapted = planner.adaptPlannerModule(source, 'http://server/native.js', 'blob:bridge');
    const module = await import(compile(`${adapted}\nexport { Panel };`));
    let handle;
    const plan = module.Panel({ expose: value => { handle = value; } });
    assert.equal(handle.selectedShot(), 1);
    handle.importMedia({ kind: 'reference', shot: 'global', field: 'ref2' }, 'library-global.png');
    handle.importMedia({ kind: 'reference', shot: 1, field: 'ref' }, 'library-shot.png');
    assert.equal(plan.global_ref, 'global.png');
    assert.equal(plan.global_ref2, 'library-global.png');
    assert.equal(plan.segs[0].prompt, 'keep first');
    assert.equal(plan.segs[0].ref, undefined);
    assert.equal(plan.segs[1].prompt, 'keep second');
    assert.equal(plan.segs[1].ref, 'library-shot.png');
    assert.throws(() => handle.importMedia({ kind: 'reference', shot: 4, field: 'ref' }, 'invalid.png'), /no longer exists/);
    handle.importMedia({ kind: 'video' }, 'library-source.mp4');
    assert.equal(plan.video, 'library-source.mp4');
    assert.equal(plan.mode, 'single');
    assert.equal(plan.end_f, 360);
    assert.equal(plan.global_ref, 'global.png');
    assert.deepEqual(plan.segs, []);
    assert.equal(handle.selectedShot(), null);
    assert.equal(plan.refreshed, true);
});
