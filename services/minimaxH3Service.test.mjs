import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = code => import(`data:text/javascript;base64,${Buffer.from(compile(code)).toString('base64')}`);
const workflowSource = readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const workflow = await load(readFileSync(new URL('./videoPromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '') + workflowSource);
globalThis.__h3Test = workflow;
const serviceSource = readFileSync(new URL('./minimaxH3Service.ts', import.meta.url), 'utf8').replace(/import[\s\S]*?from\s+'[^']+';/g, '');
const api = await load(`
const { buildMinimaxH3Workflow, h3ReferenceControl, isRecord, planH3References, validateMinimaxH3Readiness } = globalThis.__h3Test;
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
    const requests = [], progress = [], previews = [];
    let socket, queued;
    const options = workflow.defaultMinimaxH3Options();
    const graph = workflow.buildMinimaxH3Workflow(input(), options, { 'image-1': 'image.png' });
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
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
        requests, progress, previews, options,
        get queued() { return queued; }, get socket() { return socket; },
        run: (draft = input(), controller = new AbortController()) => api.generateMinimaxH3Video(draft, options, controller.signal, (...args) => progress.push(args), preview => previews.push(preview)),
    };
}

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
