import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = `const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
${readFileSync(new URL('./characterSwapProgress.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')}`;
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const job = {
    clientId: 'lawiz-own-job', promptId: 'own-prompt', state: 'running', base: 'http://localhost:8188',
    workflow: {
        '14': { class_type: 'SamplerCustomAdvanced', inputs: {} },
        '1286': { class_type: 'MMH3UltimateUpscale', inputs: {} },
        '20': { class_type: 'VAEDecode', inputs: {} },
    },
};
const reduce = (state, type, data) => api.reduceSwapProgress(state, type, data, job, 'source-run');
test('measured steps belong only to the owned prompt, not another ComfyUI render', () => {
    let progress = api.initialSwapProgress();
    assert.equal(reduce(progress, 'progress', { prompt_id: 'foreign', node: '14', value: 3, max: 4 }), progress);
    progress = reduce(progress, 'executing', { prompt_id: job.promptId, node: '14' });
    assert.equal(progress.label, 'SamplerCustomAdvanced');
    assert.equal(progress.max, undefined);
    progress = reduce(progress, 'progress', { prompt_id: job.promptId, node: '14', value: 2, max: 4 });
    assert.equal(progress.value / progress.max * 100, 50);
    assert.equal(progress.sampling, true);
    assert.equal(reduce(progress, 'progress', { prompt_id: job.promptId, value: 1, max: 0 }).max, 4);
    assert.equal(reduce(progress, 'progress', { prompt_id: job.promptId, value: NaN, max: Infinity }).value, 2);
});
test('recursive display IDs and the enabled second pass retain accurate node and step information', () => {
    const progress = reduce(api.initialSwapProgress(), 'progress_state', {
        prompt_id: job.promptId, nodes: {
            previous: { state: 'finished', node_id: '14', value: 4, max: 4 },
            recursive: { state: 'running', node_id: '1202.0.1.14', display_node_id: '14', value: 1, max: 4 },
        },
    });
    test('default node 0/1 is unmeasured and recursive clones do not inherit a previous sampler percentage', () => {
        const empty = reduce(api.initialSwapProgress(), 'progress_state', {
            prompt_id: job.promptId, nodes: { load: { state: 'running', display_node_id: '20', node_id: '20', value: 0, max: 1 } },
        });
        assert.equal(empty.max, undefined);
        const completedPass = reduce(empty, 'progress_state', {
            prompt_id: job.promptId, nodes: { pass: { state: 'running', display_node_id: '14', node_id: 'first.14', value: 4, max: 4 } },
        });
        const nextPass = reduce(completedPass, 'progress_state', {
            prompt_id: job.promptId, nodes: { pass: { state: 'running', display_node_id: '14', node_id: 'next.14', value: 0, max: 1 } },
        });
        assert.equal(nextPass.label, 'SamplerCustomAdvanced');
        assert.equal(nextPass.max, undefined);
        assert.equal(nextPass.value, undefined);
    });
    assert.equal(progress.node, '14');
    assert.equal(progress.value, 1);
    const second = reduce(progress, 'progress_state', {
        prompt_id: job.promptId, nodes: {
            recursive: { state: 'finished', display_node_id: '14', value: 4, max: 4 },
            upscale: { state: 'running', display_node_id: '1286', value: 2, max: 8 },
        },
    });
    assert.equal(second.label, 'MMH3UltimateUpscale');
    assert.equal(second.sampling, true);
    assert.equal(second.value / second.max, 0.25);
});
test('sampling completion is not file completion; decode and assembly reset the measured bar', () => {
    const sampled = reduce(api.initialSwapProgress(), 'progress', { prompt_id: job.promptId, node: '14', value: 4, max: 4 });
    const decoding = reduce(sampled, 'executing', { prompt_id: job.promptId, node: '20' });
    assert.equal(decoding.label, 'VAEDecode');
    assert.equal(decoding.max, undefined);
    assert.equal(decoding.sampling, false);
    assert.equal(reduce(decoding, 'bfs-shotloop-progress', { run_id: 'other-source', done: 5, count: 5 }), decoding);
    const assembled = reduce(decoding, 'bfs-shotloop-progress', { run_id: 'source-run', done: 5, count: 5 });
    assert.equal(assembled.done, 5);
    assert.equal(assembled.total, 5);
    assert.equal(assembled.label, 'Assembling final video');
    assert.equal(assembled.max, undefined);
    assert.equal(reduce(assembled, 'executing', { prompt_id: job.promptId, node: null }).label, 'Finishing output files');
});
test('saved shots cannot regress due to a late cache-poll response, and next-shot progress starts unmeasured', () => {
    let progress = reduce(api.initialSwapProgress(), 'bfs-shotloop-progress', { run_id: 'source-run', done: 2, count: 5 });
    progress = reduce(progress, 'progress', { prompt_id: job.promptId, node: '14', value: 2, max: 4 });
    progress = reduce(progress, 'bfs-shotloop-next', { run_id: 'source-run', done: 3, count: 5 });
    assert.equal(progress.label, 'Preparing next shot');
    assert.equal(progress.max, undefined);
    progress = reduce(progress, 'bfs-shotloop-cache', { run_id: 'source-run', done: 2, count: 5 });
    assert.equal(progress.done, 3);
});
test('historical cached counts do not announce assembly or mask invalidated shots in the current execution', () => {
    let progress = reduce(api.initialSwapProgress(), 'executing', { prompt_id: job.promptId, node: '14' });
    progress = reduce(progress, 'bfs-shotloop-cache', { run_id: 'source-run', done: 5, count: 5 });
    assert.equal(progress.label, 'SamplerCustomAdvanced');
    assert.equal(progress.countsAreLive, false);
    progress = reduce(progress, 'bfs-shotloop-progress', { run_id: 'source-run', done: 1, count: 5 });
    assert.equal(progress.done, 1);
    assert.equal(progress.countsAreLive, true);
    assert.equal(progress.label, 'Preparing next shot');
});
test('owned socket reconnect handshakes without prompt ID recover the active node but foreign IDs never do', () => {
    const progress = reduce(api.initialSwapProgress(), 'executing', { node: '14' });
    assert.equal(progress.node, '14');
    assert.equal(reduce(progress, 'executing', { prompt_id: 'foreign', node: '20' }), progress);
    assert.equal(reduce(progress, 'progress_state', { prompt_id: 'foreign', nodes: { x: { state: 'running', display_node_id: '20' } } }), progress);
});
test('socket uses persisted client ID, reconnects with the same ID, ignores previews and surfaces malformed messages', async t => {
    const instances = [];
    const scheduled = new Map();
    class Socket {
        constructor(url) { this.url = String(url); instances.push(this); }
        close() { this.closed = true; }
    }
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => { scheduled.set(delay, callback); return 1; });
    const oldSocket = globalThis.WebSocket;
    globalThis.WebSocket = Socket;
    t.after(() => { globalThis.WebSocket = oldSocket; });
    const events = [], errors = [], connections = [];
    const connection = api.connectSwapProgress(job, (...args) => events.push(args), value => connections.push(value), error => errors.push(error));
    t.after(() => connection.close());
    assert.match(instances[0].url, /ws:\/\/localhost:8188\/ws\?clientId=lawiz-own-job/);
    instances[0].onopen();
    await connection.ready;
    instances[0].onmessage({ data: new Uint8Array([1, 2]) });
    instances[0].onmessage({ data: JSON.stringify({ type: 'progress', data: { value: 2, max: 4 } }) });
    instances[0].onmessage({ data: 'broken json' });
    assert.equal(events.length, 1);
    assert.match(errors[0].message, /Invalid render progress message/);
    instances[0].onclose();
    scheduled.get(3000)();
    assert.equal(instances[1].url, instances[0].url);
    instances[1].onopen();
    assert.deepEqual(connections, [true, false, true]);
    connection.close();
    assert.equal(instances[1].closed, true);
    scheduled.get(3000)();
    assert.equal(instances.length, 2);
});
test('initial socket failure rejects readiness explicitly while allowing later reconnection for polling fallback', async t => {
    const instances = [], scheduled = new Map(), connections = [];
    class Socket {
        constructor(url) { this.url = String(url); instances.push(this); }
        close() {}
    }
    t.mock.method(globalThis, 'setTimeout', (callback, delay) => { scheduled.set(delay, callback); return 1; });
    const oldSocket = globalThis.WebSocket;
    globalThis.WebSocket = Socket;
    t.after(() => { globalThis.WebSocket = oldSocket; });
    const connection = api.connectSwapProgress(job, () => {}, value => connections.push(value), error => assert.fail(error.message));
    t.after(() => connection.close());
    instances[0].onerror();
    await assert.rejects(connection.ready, /step progress is unavailable/);
    instances[0].onclose();
    scheduled.get(3000)();
    instances[1].onopen();
    assert.deepEqual(connections, [false, false, true]);
    assert.equal(instances[0].url, instances[1].url);
});
