import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = code => import(`data:text/javascript;base64,${Buffer.from(compile(code)).toString('base64')}`);
const workflowSource = readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const workflow = await load(readFileSync(new URL('./videoPromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '') + workflowSource
    + readFileSync(new URL('./minimaxH3AdvancedWorkflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')
    + readFileSync(new URL('./minimaxH3UltrafastWorkflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
globalThis.__h3Test = workflow;
const serviceSource = readFileSync(new URL('./minimaxH3Service.ts', import.meta.url), 'utf8').replace(/import[\s\S]*?from\s+'[^']+';/g, '');
const api = await load(`
const { buildH3RenderWorkflow, ADVANCED_NODE_SPECS, planAdvancedH3Input, h3ReferenceControl, isRecord, planH3References, validateMinimaxH3Readiness } = globalThis.__h3Test;
export const muxCalls = [];
export let muxFailure = false;
export const setMuxFailure = value => { muxFailure = value; };
const forceOriginalVideoAudio = async (video, audio, duration, signal) => {
    signal.throwIfAborted(); muxCalls.push({ video, audio, duration });
    if (muxFailure) throw new Error('Audio lock failed. No generated-audio fallback was used.');
    return new File(['locally locked soundtrack'], 'locked.mp4', { type: 'video/mp4' });
};
` + serviceSource);
delete globalThis.__h3Test;
const reference = (kind, slot) => ({
    id: `${kind}-${slot}`, kind, slot, note: '',
    file: new File(['sample'], `${kind}.${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}`, { type: `${kind}/${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}` }),
});
const input = (refs = [reference('image', 1)]) => ({ id: 'test', workflow: 'reference', prompt: 'Film <Picture 1>.', references: refs, duration: 3, aspect: '4:3', template: 'generation' });
const finalHistory = { outputs: { '119': { gifs: [{ filename: 'H3_0001.mp4', subfolder: 'video', type: 'output' }] }, '186': { text: ['final prompt'] } }, status: { status_str: 'success', completed: true } };

function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    const requests = [], progress = [], previews = [], execution = [];
    let socket, queued;
    const options = config.advanced ? workflow.defaultAdvancedH3Options() : config.ultrafast ? workflow.defaultUltrafastH3Options() : workflow.defaultMinimaxH3Options();
    if (config.advanced) Object.assign(options.advanced, { stageOrder: 'latent-first' }, config.stages);
    if (config.accelerators) Object.assign(options.ultrafast, config.accelerators);
    const fixture = config.stages?.inputMode === 'video' ? { ...input([reference('video', 1)]), prompt: '' } : input();
    const graph = workflow.buildH3RenderWorkflow({ ...fixture, workflow: config.advanced ? 'advanced' : config.ultrafast ? 'ultrafast' : 'reference' }, options, { 'image-1': 'image.png', 'video-1': 'video.mp4' });
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
    if (config.omitReferencePack) delete info.MiniMaxH3ReferencePack;
    class Socket {
        constructor(url) { this.url = String(url); socket = this; queueMicrotask(() => this.onopen?.()); }
        close() { this.closed = true; this.onclose?.(); }
        emit(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
    }
    globalThis.WebSocket = Socket;
    globalThis.localStorage = { getItem: () => config.url || 'http://localhost:8188/' };
    globalThis.fetch = async (url, init = {}) => {
        const parsed = new URL(url), path = parsed.pathname;
        requests.push({ path, init, url: String(url) });
        const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (path.startsWith('/object_info/')) {
            const name = decodeURIComponent(path.slice('/object_info/'.length));
            return json(info[name] ? { [name]: info[name] } : {});
        }
        if (path === '/upload/image') return json({ name: init.body.get('image').name, subfolder: 'h3-input' });
        if (path === '/minimax_refpack/probe') return json(config.probe ?? { has_audio: false });
        if (path === '/prompt') {
            queued = JSON.parse(init.body);
            await config.onQueue?.(socket);
            return json(config.queueResponse ?? { prompt_id: 'owned-h3' });
        }
        if (path === '/history/owned-h3') {
            socket.emit('progress', { prompt_id: 'another-client', value: 5, max: 5 });
            socket.emit('progress', { prompt_id: 'owned-h3', value: 2, max: 4 });
            socket.emit('kj_preview_override', { node_id: '141', image: 'YWJj', mime: 'video/mp4', step: 2, total: 4 });
            return json(config.history ? await config.history(socket) : { 'owned-h3': finalHistory });
        }
        if (path === '/api/jobs/owned-h3/cancel') return config.cancelStatus ? new Response('Targeted cancellation unavailable', { status: config.cancelStatus }) : json({ cancelled: true });
        if (path === '/view') return new Response('server video with generated sound', { status: config.downloadStatus || 200, headers: { 'Content-Type': 'video/mp4' } });
        throw new Error(`Unexpected request: ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return {
        requests, progress, previews, execution, options,
        get queued() { return queued; }, get socket() { return socket; },
        run: (draft = input(), controller = new AbortController()) => api.generateMinimaxH3Video(draft, options, controller.signal, (...args) => progress.push(args), preview => previews.push(preview), value => execution.push(value)),
    };
}

test('Advanced waits for the final RTX output and retains the actual executed FL2V/refine graph', async t => {
    const h = harness(t, { advanced: true, stages: { ltxRefine: true, rtxUpscale: true },
        history: () => ({ 'owned-h3': { ...finalHistory, outputs: { '119': { gifs: [{ filename: 'Advanced_RTX.mp4', type: 'output' }] } } } }) });
    const result = await h.run({ ...input([]), workflow: 'advanced', prompt: 'A quiet street with footsteps.' });
    assert.deepEqual(h.queued.prompt['119'].inputs.images, ['advanced-rtx', 0]);
    assert.deepEqual(h.queued.prompt['advanced-rtx'].inputs.images, ['advanced-clear-after', 1]);
    assert.deepEqual(h.queued.prompt['advanced-clear-after'].inputs.image_pass, ['advanced-after-ltx', 1]);
    assert.equal(result.options.variant, 'advanced');
    assert.equal(result.options.advanced.mode, 'fl2v');
    assert.equal(result.workflow['184'].class_type, 'MiniMaxH3ImageToVideo');
    assert.match(result.videoUrl, /Advanced_RTX.mp4/);
    assert.equal(h.socket.closed, true);
});

test('checkpoint outputs never finish the job early and remain accessible when LTX fails later', async t => {
    const h = harness(t, { advanced: true, stages: { ltxRefine: true, rtxUpscale: true }, history: socket => {
        socket.emit('executed', { prompt_id: 'another-client', node: 'advanced-save-ltx', output: { gifs: [{ filename: 'foreign.mp4' }] } });
        for (const [node, filename] of [['advanced-save-first-pass', 'FirstPass.mp4'], ['advanced-save-latent-upscale', 'LatentUpscale.mp4']]) {
            socket.emit('executed', { prompt_id: 'owned-h3', node, output: { gifs: [{ filename, subfolder: 'MrWeaz/2026-10-21', type: 'output' }] } });
        }
        socket.emit('execution_error', { prompt_id: 'owned-h3', node_type: 'VAEDecodeTiled', exception_message: 'test LTX failure' });
        return {};
    } });
    await assert.rejects(h.run({ ...input([]), workflow: 'advanced', prompt: 'A quiet street.' }), /test LTX failure/);
    const videos = h.execution.at(-1).videos;
    assert.equal(videos.length, 2);
    assert.deepEqual(videos.map(video => video.label), ['First pass', 'Latent upscale']);
    assert.ok(videos.every(video => /type=output/.test(video.videoUrl)));
    assert.ok(!h.progress.some(([text]) => text === 'H3 video ready.'));
    assert.equal(h.socket.closed, true);
});

test('completed history recovers cached intermediate links while keeping output 119 as the final result', async t => {
    const h = harness(t, { advanced: true, history: () => ({ 'owned-h3': { ...finalHistory, outputs: {
        ...finalHistory.outputs, 'advanced-save-first-pass': { gifs: [{ filename: 'cached_FirstPass.mp4', type: 'output' }] },
    } } }) });
    const result = await h.run({ ...input([]), workflow: 'advanced', prompt: 'A quiet street.' });
    assert.match(result.videoUrl, /H3_0001.mp4/);
    assert.equal(result.stageVideos.length, 1);
    assert.match(result.stageVideos[0].videoUrl, /cached_FirstPass.mp4/);
});

test('Advanced tracks each sampling/decode/save stage, cached nodes and local progress without reusing H3 steps', async t => {
    const h = harness(t, { advanced: true, stages: { ltxRefine: true, rtxUpscale: true }, history: socket => {
        socket.emit('executing', { prompt_id: 'another-client', node: 'advanced-rtx' });
        socket.emit('execution_cached', { prompt_id: 'owned-h3', nodes: ['135', '121', 'not-in-graph'] });
        socket.emit('executing', { prompt_id: 'owned-h3', node: '153' });
        socket.emit('progress', { prompt_id: 'owned-h3', node: '153', value: 4, max: 4 });
        socket.emit('executing', { prompt_id: 'owned-h3', node: 'advanced-latent-sample' });
        socket.emit('progress', { prompt_id: 'owned-h3', node: 'advanced-latent-sample', value: 1, max: 3 });
        socket.emit('executing', { prompt_id: 'owned-h3', node: 'advanced-ltx-sample' });
        socket.emit('progress', { prompt_id: 'owned-h3', node: 'advanced-ltx-sample', value: 2, max: 3 });
        socket.emit('executing', { prompt_id: 'owned-h3', node: 'advanced-ltx-decode' });
        socket.emit('progress', { prompt_id: 'another-client', node: 'advanced-ltx-decode', value: 999, max: 999 });
        socket.emit('progress', { prompt_id: 'owned-h3', node: 'advanced-ltx-decode', value: 1, max: 12 });
        socket.emit('progress_state', { prompt_id: 'another-client', nodes: { 'advanced-ltx-decode': { state: 'running', value: 888, max: 888 } } });
        socket.emit('progress_state', { prompt_id: 'owned-h3', nodes: { 'advanced-ltx-sample': { state: 'finished', value: 3, max: 3 }, 'advanced-ltx-decode': { state: 'running', value: 2, max: 12 } } });
        socket.emit('executing', { prompt_id: 'owned-h3', node: 'advanced-rtx' });
        socket.emit('executing', { prompt_id: 'owned-h3', node: '119' });
        return { 'owned-h3': finalHistory };
    } });
    await h.run({ ...input([]), workflow: 'advanced', prompt: 'A quiet street.' });
    const atDecode = h.execution.find(value => value.currentNode === 'advanced-ltx-decode');
    assert.equal(atDecode.step, undefined, 'Entering decode clears the previous sampler step count.');
    assert.equal(atDecode.totalSteps, undefined, 'Decode is indeterminate until real tile progress arrives.');
    const tiles = h.execution.find(value => value.currentNode === 'advanced-ltx-decode' && value.step === 1);
    assert.equal(tiles.totalSteps, 12);
    assert.equal(tiles.nodes.find(node => node.id === 'advanced-ltx-decode').label, 'LTX Refine · tiled video decode');
    assert.equal(tiles.nodes.find(node => node.id === '135').state, 'cached');
    assert.equal(tiles.nodes.find(node => node.id === '153').state, 'complete');
    assert.ok(!tiles.nodes.some(node => node.id === 'not-in-graph'));
    assert.ok(h.progress.some(([message]) => message === 'LTX Refine · sampling: 2/3'));
    assert.ok(h.progress.some(([message]) => message === 'LTX Refine · tiled video decode: 2/12'));
    assert.ok(h.progress.some(([message]) => message.includes('Final video · encoding and saving')));
    assert.ok(!h.progress.some(([message]) => message.includes('999')));
    assert.ok(!h.progress.some(([message]) => message.includes('888')));
    assert.ok(h.execution.every(value => value.elapsedSeconds >= 0 && value.nodeSeconds >= 0));
    assert.equal(h.execution.at(-1).currentNode, undefined);
    assert.equal(h.execution.at(-1).nodes.find(node => node.id === '119').state, 'complete');
});

test('Ultrafast monitors native SaveVideo output and realtime preview through the shared owned-job pipeline', async t => {
    const h = harness(t, { ultrafast: true, accelerators: { spectrum: true, rtxUpscale: true },
        history: () => ({ 'owned-h3': { ...finalHistory, outputs: { '119': { images: [{ filename: 'ultra.mp4', subfolder: 'video', type: 'output' }] } } } }) });
    const result = await h.run({ ...input([]), workflow: 'ultrafast', prompt: 'A quiet scene with sound.' });
    assert.equal(h.queued.prompt['119'].class_type, 'SaveVideo');
    assert.equal(h.queued.prompt['190'].class_type, 'BasicScheduler');
    assert.equal(h.queued.prompt['ultrafast-spectrum'].class_type, 'SpectrumApplyMiniMaxH3');
    assert.equal(h.queued.prompt['ultrafast-rtx'].class_type, 'RTXVideoSuperResolution');
    assert.equal(h.requests.filter(request => request.path === '/upload/image').length, 0);
    assert.equal(result.options.variant, 'ultrafast');
    assert.match(result.videoUrl, /filename=ultra.mp4/);
    assert.equal(h.previews.length, 1);
    assert.equal(h.socket.closed, true);
});

test('Library finishing uploads only the source video, skips H3 first pass and handles silent soundtracks explicitly', async t => {
    for (const stage of ['latent', 'ltx']) for (const hasAudio of [false, true]) await t.test(`${stage} / soundtrack ${hasAudio}`, async t => {
        const h = harness(t, { advanced: true, omitReferencePack: true, probe: { has_audio: hasAudio }, stages: {
            inputMode: 'video', stageOrder: 'ltx-first', latentUpscale: stage === 'latent', ltxRefine: stage === 'ltx', sourceAudio: true,
        } });
        const result = await h.run({ ...input([reference('video', 1)]), workflow: 'advanced', prompt: '' });
        assert.equal(h.requests.filter(r => r.path === '/upload/image').length, 1);
        assert.equal(h.requests.filter(r => r.path === '/minimax_refpack/probe').length, 1);
        assert.equal(h.queued.prompt['153'], undefined);
        assert.equal(h.queued.prompt['185'], undefined);
        assert.match(h.queued.prompt['advanced-source-video'].inputs.video, /h3-input\/lawiz-h3-/);
        assert.equal(result.options.advanced.sourceAudio, hasAudio);
        assert.equal(h.options.advanced.sourceAudio, true, 'The submitted options must not mutate the editable draft.');
        assert.deepEqual(h.queued.prompt['119'].inputs.audio, hasAudio ? ['advanced-source-video', 2] : undefined);
        assert.deepEqual(h.queued.prompt['119'].inputs.frame_rate, ['advanced-source-info', 5]);
        if (stage === 'ltx') {
            assert.equal(h.queued.prompt['135'], undefined);
            assert.equal(h.queued.prompt['121'], undefined);
        }
        assert.equal(result.promptIsFinal, true);
    });
});

test('video finishing skips soundtrack probing when disabled and rejects failed probes before queueing', async t => {
    for (const sourceAudio of [false, true]) await t.test(`soundtrack ${sourceAudio}`, async t => {
        const h = harness(t, { advanced: true, probe: { has_audio: 'invalid' }, stages: { inputMode: 'video', latentUpscale: false, ltxRefine: true, sourceAudio } });
        const job = h.run({ ...input([reference('video', 1)]), workflow: 'advanced', prompt: '' });
        if (sourceAudio) {
            await assert.rejects(job, /probe|audio/i);
            assert.equal(h.queued, undefined);
        } else {
            await job;
            assert.equal(h.requests.filter(r => r.path === '/minimax_refpack/probe').length, 0);
            assert.equal(h.queued.prompt['119'].inputs.audio, undefined);
        }
    });
});

test('Ultrafast stops history polling and execution heartbeat after completion or failure', async t => {
    for (const fail of [false, true]) await t.test(fail ? 'failure' : 'completion', async t => {
        const h = harness(t, { ultrafast: true, history: fail ? socket => {
            socket.emit('execution_error', { prompt_id: 'owned-h3', node_type: 'VAEDecode', exception_message: 'mock decode failure' });
            return {};
        } : undefined });
        const nativeSet = globalThis.setInterval, nativeClear = globalThis.clearInterval;
        const active = new Set();
        let created = 0;
        globalThis.setInterval = (...args) => { const timer = nativeSet(...args); active.add(timer); created++; return timer; };
        globalThis.clearInterval = timer => { active.delete(timer); nativeClear(timer); };
        try {
            const run = h.run({ ...input([]), workflow: 'ultrafast', prompt: 'A quiet scene.' });
            if (fail) await assert.rejects(run, /mock decode failure/);
            else await run;
            assert.equal(created, 2, 'The execution heartbeat and history polling were both started.');
            assert.equal(active.size, 0, 'Neither background interval survives settlement.');
            assert.equal(h.socket.closed, true);
        } finally {
            for (const timer of active) nativeClear(timer);
            globalThis.setInterval = nativeSet;
            globalThis.clearInterval = nativeClear;
        }
    });
});

test('a plain prompt queues successfully with no media uploads or ReferencePack links', async t => {
    const h = harness(t, { omitReferencePack: true, history: () => ({ 'owned-h3': { ...finalHistory, outputs: { '119': finalHistory.outputs['119'] } } }) });
    const draft = { ...input([]), prompt: 'A rainy street with footsteps.' };
    const result = await h.run(draft);
    assert.equal(h.requests.filter(request => request.path === '/upload/image').length, 0);
    assert.equal(h.queued.prompt['185'], undefined);
    assert.equal(h.queued.prompt['184'].inputs.prompt, draft.prompt);
    assert.equal(result.prompt, draft.prompt);
    assert.equal(result.promptIsFinal, true);
    assert.equal(h.socket.closed, true);
});

test('references still require ReferencePack and fail before any upload when it is missing', async t => {
    const h = harness(t, { omitReferencePack: true });
    await assert.rejects(h.run(), /Missing ComfyUI nodes: MiniMaxH3ReferencePack/);
    assert.equal(h.requests.filter(request => request.path === '/upload/image' || request.path === '/prompt').length, 0);
});

test('forced original survives two four-second clips and a last-frame reference; only current WAV reaches the final mux', async t => {
    const h = harness(t);
    const audio = { ...reference('audio', 1), original: new File(['FULL EIGHT SECOND SONG'], 'song.wav', { type: 'audio/wav' }), audioSelection: { start: 0, end: 4 } };
    const value = input([reference('image', 1), audio]);
    Object.assign(h.options, { originalAudioId: audio.id, forceOriginalAudio: true, duration: 4 });
    const start = api.muxCalls.length;
    const first = await h.run(value);
    assert.ok(first.videoBlob);
    assert.equal(api.muxCalls[start].audio, audio.file);
    value.references = workflow.replaceH3FirstPicture(value.references, new File(['frame'], 'last.png', { type: 'image/png' }));
    const next = { ...audio, file: new File(['SECOND FOUR SECOND WAV'], 'song-4-8.wav', { type: 'audio/wav' }), audioSelection: { start: 4, end: 8 } };
    value.references = value.references.map(ref => ref.id === audio.id ? next : ref);
    const second = await h.run(value);
    assert.equal(second.options.forceOriginalAudio, true);
    assert.equal(second.options.originalAudioId, audio.id);
    assert.equal(api.muxCalls[start + 1].audio, next.file);
    assert.notEqual(api.muxCalls[start + 1].audio, audio.original);
    assert.deepEqual(h.queued.prompt['119'].inputs.audio, ['185', 15]);
    assert.equal(h.queued.prompt['134'], undefined);
    assert.equal(await second.videoBlob.text(), 'locally locked soundtrack');
});

test('locked mode rejects missing source before uploads and mux errors never return an uncorrected result', async t => {
    const h = harness(t);
    h.options.forceOriginalAudio = true;
    await assert.rejects(h.run(), /locked/);
    assert.ok(!h.requests.some(request => request.path === '/prompt' || request.path === '/upload/image'));
    const audio = { ...reference('audio', 1), audioSelection: { start: 0, end: 3 } };
    h.options.originalAudioId = audio.id;
    api.setMuxFailure(true);
    try { await assert.rejects(h.run(input([reference('image', 1), audio])), /No generated-audio fallback/); }
    finally { api.setMuxFailure(false); }
});

test('preview parser accepts only node 141 image/WebP/MP4 messages, including no-image sigma initialization', () => {
    for (const mime of ['image/jpeg', 'image/webp', 'video/mp4']) assert.equal(api.parseH3Preview('kj_preview_override', { node_id: 141, image: 'YWJj', mime }).mime, mime);
    assert.equal(api.parseH3Preview('other', { node_id: 141, image: 'YWJj' }), null);
    assert.equal(api.parseH3Preview('kj_preview_override', { node_id: 99, image: 'YWJj' }), null);
    assert.equal(api.parseH3Preview('kj_preview_override', { node_id: 141, sigmas: [1, 0] }), null);
    assert.equal(api.parseH3Preview('kj_preview_override', { node_id: 141, image: 'YWJj', mime: 'text/html' }), null);
});

test('history supports VHS output variants and temporary output URLs with encoded names', () => {
    for (const key of ['gifs', 'videos', 'images', 'files']) {
        const url = api.h3VideoFromHistory({ outputs: { '119': { [key]: [{ filename: 'a b.mp4', subfolder: 'foo', type: 'temp' }] } } }, 'https://server');
        assert.equal(new URL(url).searchParams.get('filename'), 'a b.mp4');
        assert.equal(new URL(url).searchParams.get('type'), 'temp');
    }
    assert.equal(api.h3VideoFromHistory({ outputs: { '186': {} } }, 'http://server'), null);
});

test('queue uses unique client/media names, accepts cached history, filters other clients and receives animated preview', async t => {
    const h = harness(t);
    const result = await h.run();
    assert.equal(h.requests.filter(request => request.path.startsWith('/object_info/')).length, 22);
    assert.equal(h.requests.some(request => request.path === '/object_info'), false);
    assert.equal(h.requests.filter(request => request.path === '/upload/image').length, 1);
    const upload = h.requests.find(request => request.path === '/upload/image').init.body;
    assert.match(upload.get('image').name, /^lawiz-h3-.*\.png$/);
    assert.equal(upload.get('overwrite'), 'false');
    assert.equal(await upload.get('image').text(), 'sample');
    assert.equal(new URL(h.socket.url).searchParams.get('clientId'), h.queued.client_id);
    assert.match(h.queued.client_id, /^lawiz-h3-/);
    assert.equal(h.queued.prompt['185'].inputs.openrouter_api_key, '');
    assert.equal(result.promptId, 'owned-h3');
    assert.equal(result.prompt, 'final prompt');
    assert.equal(result.promptIsFinal, true);
    assert.match(result.videoUrl, /\/view\?/);
    assert.equal(h.previews[0].mime, 'video/mp4');
    assert.equal(h.progress.some(([text]) => text.includes('5/5')), false);
    assert.ok(h.socket.closed);
});

test('generation uploads the applied audio excerpt, never the preserved original recording', async t => {
    const h = harness(t);
    const audio = reference('audio', 1);
    audio.file = new File(['selected PCM samples'], 'song-3.000-6.000.wav', { type: 'audio/wav' });
    audio.original = new File(['full original song'], 'song.wav', { type: 'audio/wav' });
    audio.audioSelection = { start: 3, end: 6 };
    const draft = input([reference('image', 1), audio]);
    draft.prompt = 'Film <Picture 1> singing <Audio 1>.';
    h.options.duration = 3;
    const result = await h.run(draft);
    const uploads = h.requests.filter(request => request.path === '/upload/image');
    assert.equal(uploads.length, 2);
    assert.equal(await uploads[1].init.body.get('image').text(), 'selected PCM samples');
    assert.equal(await audio.original.text(), 'full original song');
    assert.equal(h.queued.prompt['132'].inputs.value, 3);
    assert.equal(result.options.duration, 3);
});

test('silent video probe prevents wrong standalone Audio labels while keeping source options unchanged', async t => {
    const h = harness(t);
    const draft = input([reference('image', 1), reference('video', 1), reference('audio', 1)]);
    draft.prompt = 'Film <Picture 1> using <Video 1> and <Audio 1>.';
    const result = await h.run(draft);
    assert.equal(h.requests.filter(request => request.path === '/minimax_refpack/probe').length, 1);
    assert.equal(h.queued.prompt['185'].inputs.direction, draft.prompt);
    assert.equal(h.queued.prompt['184'].inputs['ref_video_audios.ref_video_audio_0'], undefined);
    assert.equal(result.options.references['video-1'].useSoundtrack, false);
    assert.deepEqual(h.options.references, {});
});

test('video with soundtrack shifts standalone Audio labels exactly once', async t => {
    const h = harness(t, { probe: { has_audio: true } });
    const draft = input([reference('image', 1), reference('video', 1), reference('audio', 1)]);
    draft.prompt += ' Listen to <Audio 1>.';
    await h.run(draft);
    assert.ok(h.queued.prompt['185'].inputs.direction.includes('<Audio 2>'));
    assert.deepEqual(h.queued.prompt['184'].inputs['ref_video_audios.ref_video_audio_0'], ['185', 12]);
});

test('invalid server probe explicitly fails before queueing instead of guessing Audio numbering', async t => {
    const h = harness(t, { probe: {} });
    await assert.rejects(h.run(input([reference('image', 1), reference('video', 1)])), /soundtrack availability/);
    assert.equal(h.requests.some(request => request.path === '/prompt'), false);
});

test('server rewriting without a display output is labeled submitted, never falsely labeled as the final prompt', async t => {
    const h = harness(t, { history: () => ({ 'owned-h3': { ...finalHistory, outputs: { '119': finalHistory.outputs['119'] } } }) });
    h.options.promptProvider = 'openrouter';
    h.options.displayPrompt = false;
    const result = await h.run();
    assert.equal(result.prompt, input().prompt);
    assert.equal(result.promptIsFinal, false);
});

test('cancellation targets only the owned job atomically, without a global interrupt or queue operation', async t => {
    const controller = new AbortController();
    const h = harness(t, { history: () => { controller.abort(); return {}; } });
    await assert.rejects(h.run(input(), controller), error => error.name === 'AbortError');
    assert.equal(h.requests.filter(request => request.path === '/api/jobs/owned-h3/cancel' && request.init.method === 'POST').length, 1);
    assert.equal(h.requests.some(request => request.path === '/interrupt' || request.path === '/queue'), false);
    assert.ok(h.socket.closed);
    assert.equal(h.progress.some(([text]) => text === 'H3 video ready.'), false);
});

test('cancellation racing with submission waits for its prompt ID before calling the atomic cancel endpoint', async t => {
    const controller = new AbortController();
    const h = harness(t, { onQueue: () => controller.abort() });
    await assert.rejects(h.run(input(), controller), error => error.name === 'AbortError');
    assert.ok(h.requests.some(request => request.path === '/api/jobs/owned-h3/cancel'));
    assert.ok(h.progress.some(([text]) => text.includes('Waiting for prompt ID')));
});

test('unsupported targeted cancellation fails explicitly and never falls back to global interrupt', async t => {
    const controller = new AbortController();
    const h = harness(t, { history: () => { controller.abort(); return {}; }, cancelStatus: 404 });
    await assert.rejects(h.run(input(), controller), /Cancellation failed; check ComfyUI/);
    assert.equal(h.requests.some(request => request.path === '/interrupt' || request.path === '/queue'), false);
});

test('execution failures and completed jobs without output reject instead of returning success', async t => {
    const h = harness(t, { history: () => ({ 'owned-h3': { status: { status_str: 'error', messages: ['out of memory'] } } }) });
    await assert.rejects(h.run(), /out of memory/);
});

test('completed jobs without output reject instead of returning success', async t => {
    const h = harness(t, { history: () => ({ 'owned-h3': { outputs: {}, status: { completed: true } } }) });
    await assert.rejects(h.run(), /without a video/);
});

test('node validation precedes uploads and malformed queue responses are shown', async t => {
    const h = harness(t, { queueResponse: { error: 'invalid graph' } });
    h.options.model = '';
    await assert.rejects(h.run(), /missing a filename/);
    assert.equal(h.requests.some(request => request.path === '/upload/image'), false);
    h.options.model = workflow.defaultMinimaxH3Options().model;
    await assert.rejects(h.run(), /invalid graph/);
});

test('ComfyUI base URLs preserve HTTPS and reject unsupported schemes or ambiguous suffixes', t => {
    harness(t);
    globalThis.localStorage = { getItem: () => 'HTTPS://example.test/comfy/' };
    assert.equal(api.minimaxComfyURL(), 'https://example.test/comfy');
    globalThis.localStorage = { getItem: () => 'localhost:8188' };
    assert.equal(api.minimaxComfyURL(), 'http://localhost:8188');
    globalThis.localStorage = { getItem: () => 'ftp://localhost' };
    assert.throws(api.minimaxComfyURL, /HTTP or HTTPS/);
    globalThis.localStorage = { getItem: () => 'http://localhost?x=1' };
    assert.throws(api.minimaxComfyURL, /base URL/);
});
