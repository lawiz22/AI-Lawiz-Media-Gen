import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const helpers = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const promptHelpers = compile(source('./videoPromptService.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(source('./ltxAudioSyncWorkflow.ts').replace("from './minimaxH3Workflow'", `from '${helpers}'`).replace("from './videoPromptService'", `from '${promptHelpers}'`));
const h3ServiceURL = compile(`import { isRecord } from '${helpers}';\n` + source('./minimaxH3Service.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const api = await import(compile(source('./ltxAudioSyncService.ts')
    .replace("from './ltxAudioSyncWorkflow'", `from '${workflowURL}'`)
    .replace("from './minimaxH3Service'", `from '${h3ServiceURL}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`)));
const workflow = await import(workflowURL);

const draft = () => ({
    prompt: 'A singer performs in warm light.',
    image: new File(['image'], 'portrait.png', { type: 'image/png' }),
    audio: new File(['audio'], 'voice.wav', { type: 'audio/wav' }),
    audioDuration: 20,
});
const finalHistory = {
    outputs: { '75': { images: [{ filename: 'audio-sync.mp4', subfolder: 'video', type: 'output' }] }, '398:381': { text: ['Cached enhanced prompt.'] } },
    status: { completed: true, status_str: 'success' },
};
function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    let socket, queued;
    const requests = [], progress = [];
    const info = Object.fromEntries(Object.values(workflow.AUDIO_SYNC_TEMPLATE).map(spec => [spec.class_type, { input: { required: {} } }]));
    info.LoraLoaderModelOnly = { input: { required: { model: ['MODEL'], lora_name: [['camera.safetensors', 'style.safetensors', 'motion.safetensors', 'detail.safetensors']],
        strength_model: ['FLOAT', { min: -100, max: 100 }] } } };
    if (config.missingLora) delete info.LoraLoaderModelOnly;
    if (config.missingWriter) delete info.TextGenerateLTX2Prompt;
    class Socket {
        constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
        close() { this.closed = true; }
        emit(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
    }
    globalThis.WebSocket = Socket;
    globalThis.localStorage = { getItem: () => 'http://localhost:8188' };
    globalThis.fetch = async (url, init = {}) => {
        const path = new URL(url).pathname;
        requests.push({ path, init });
        const json = payload => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (path.startsWith('/object_info/')) {
            const name = decodeURIComponent(path.slice('/object_info/'.length));
            return json(info[name] ? { [name]: info[name] } : {});
        }
        if (path === '/upload/image') {
            if (config.uploadError) return new Response('Upload failed', { status: 500 });
            return json({ name: init.body.get('image').name, subfolder: 'audio-sync-input' });
        }
        if (path === '/prompt') {
            queued = JSON.parse(init.body);
            await config.onQueue?.();
            return json(config.queueResponse ?? { prompt_id: 'owned-audio-sync' });
        }
        if (path === '/history/owned-audio-sync') {
            socket.emit('executing', { prompt_id: 'foreign-job', node: '398:368' });
            socket.emit('progress', { prompt_id: 'foreign-job', value: 999, max: 999 });
            socket.emit('executing', { prompt_id: 'owned-audio-sync', node: '398:344' });
            socket.emit('progress', { prompt_id: 'owned-audio-sync', value: 2, max: 8 });
            return json({ 'owned-audio-sync': config.history || finalHistory });
        }
        if (path === '/api/jobs/owned-audio-sync/cancel') return config.cancelError
            ? new Response('Not supported', { status: 404 }) : json({ cancelled: true });
        throw new Error(`Unexpected request ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return {
        requests, progress, get queued() { return queued; }, get socket() { return socket; },
        run: (settings = workflow.defaultAudioSyncSettings(), signal = new AbortController().signal, input = draft()) =>
            api.generateAudioSyncVideo(input, settings, signal, (...args) => progress.push(args)),
    };
}

test('generation preflights before unique uploads and collects only SaveVideo 75 plus cached prompt text', async t => {
    const h = harness(t);
    const result = await h.run();
    assert.match(result.videoUrl, /filename=audio-sync.mp4/);
    assert.equal(result.promptId, 'owned-audio-sync');
    assert.equal(result.prompt, 'Cached enhanced prompt.');
    assert.equal(result.promptIsFinal, true);
    assert.match(h.queued.prompt['405'].inputs.audio, /^audio-sync-input\/ltx-audio-sync-/);
    assert.match(h.queued.prompt['395'].inputs.image, /^audio-sync-input\/ltx-audio-sync-/);
    assert.equal(h.queued.prompt['398:362'].class_type, 'PrimitiveFloat');
    const uploadIndex = h.requests.findIndex(request => request.path === '/upload/image');
    assert.ok(uploadIndex > 0);
    const uploads = h.requests.filter(request => request.path === '/upload/image');
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0].init.body.get('overwrite'), 'false');
    assert.ok(h.progress.some(([message]) => message.includes('First-pass sampling')));
    assert.ok(!h.progress.some(([message]) => message.includes('999')));
    assert.equal(h.socket.closed, true);
});

test('writer-off succeeds without writer nodes and retains the exact manual prompt as final', async t => {
    const h = harness(t, { missingWriter: true, history: { ...finalHistory, outputs: { '75': finalHistory.outputs['75'] } } });
    const settings = workflow.defaultAudioSyncSettings(); settings.enhancePrompt = false;
    const result = await h.run(settings);
    assert.equal(result.prompt, draft().prompt);
    assert.equal(result.promptIsFinal, true);
    assert.equal(h.queued.prompt['398:380'], undefined);
    assert.equal(h.queued.prompt['398:393'], undefined);
});

test('four selected LoRAs are preflighted and reach both sampling passes and the saved execution settings', async t => {
    const h = harness(t);
    const settings = workflow.defaultAudioSyncSettings();
    settings.loras = ['camera', 'style', 'motion', 'detail'].map((name, index) => ({ enabled: true, name: `${name}.safetensors`, strength: 0.5 + index * 0.1 }));
    const result = await h.run(settings);
    assert.ok(h.requests.some(request => request.path === '/object_info/LoraLoaderModelOnly'));
    for (let index = 0; index < 4; index++) assert.equal(h.queued.prompt[`audio-sync-lora-${index + 1}`].inputs.lora_name, settings.loras[index].name);
    assert.deepEqual(h.queued.prompt['398:388'].inputs.model, ['audio-sync-lora-4', 0]);
    assert.deepEqual(h.queued.prompt['398:391'].inputs.model, ['audio-sync-lora-4', 0]);
    assert.deepEqual(result.settings.loras, settings.loras);
    assert.notEqual(result.settings.loras, settings.loras);
});

test('unavailable enabled LoRAs or missing loader fail before uploads; disabled slots require neither', async t => {
    const h = harness(t, { missingLora: true });
    const settings = workflow.defaultAudioSyncSettings();
    settings.loras[0] = { enabled: true, name: 'camera.safetensors', strength: 0.8 };
    await assert.rejects(h.run(settings), /Missing ComfyUI nodes.*LoraLoaderModelOnly/);
    assert.equal(h.requests.some(request => request.path === '/upload/image' || request.path === '/prompt'), false);
    settings.loras[0].enabled = false;
    await h.run(settings);
    assert.equal(h.queued.prompt['audio-sync-lora-1'], undefined);
});

test('a missing selected LoRA file fails availability checks before uploads or queue submission', async t => {
    const h = harness(t), settings = workflow.defaultAudioSyncSettings();
    settings.loras[0] = { enabled: true, name: 'missing.safetensors', strength: 0.8 };
    await assert.rejects(h.run(settings), /missing.safetensors.*unavailable/);
    assert.equal(h.requests.some(request => request.path === '/upload/image' || request.path === '/prompt'), false);
});

test('only the applied WAV is uploaded and current optional words reach both preflight and the executed graph', async t => {
    const h = harness(t, { missingWriter: true, history: { ...finalHistory, outputs: { '75': finalHistory.outputs['75'] } } });
    const input = workflow.applyAudioSyncPassage(draft(), workflow.defaultAudioSyncSettings(),
        new File(['selected WAV'], 'selected.wav', { type: 'audio/wav' }), { start: 5, end: 10 });
    input.settings.enhancePrompt = false;
    const { audioLyricsSource } = await import(promptHelpers);
    input.draft.lyrics = { enabled: true, text: 'These are the current words.', source: audioLyricsSource(workflow.audioSyncReference(input.draft)) };
    const result = await h.run(input.settings, new AbortController().signal, input.draft);
    const uploads = h.requests.filter(request => request.path === '/upload/image').map(request => request.init.body.get('image'));
    assert.equal(uploads.length, 2);
    assert.equal(await uploads.find(file => file.type === 'audio/wav').text(), 'selected WAV');
    assert.ok(h.queued.prompt['398:376'].inputs.value.includes(input.draft.lyrics.text));
    assert.equal(h.queued.prompt['398:362'].inputs.value, 5);
    assert.equal(h.queued.prompt['398:707'].inputs.start_index, 0);
    assert.equal(result.prompt, workflow.audioSyncInputPrompt(input.draft));
    assert.equal(result.inputPrompt, result.prompt);
});

test('stale enabled words fail before any upload, schema request or queue submission', async t => {
    const h = harness(t);
    const input = workflow.applyAudioSyncPassage(draft(), workflow.defaultAudioSyncSettings(),
        new File(['selected'], 'selected.wav', { type: 'audio/wav' }), { start: 5, end: 10 });
    input.draft.lyrics = { enabled: true, text: 'Old words', source: 'another-passage' };
    await assert.rejects(h.run(input.settings, new AbortController().signal, input.draft), /previous passage/);
    assert.equal(h.requests.length, 0);
});

test('missing enhanced prompt is explicitly labeled input rather than claimed as final', async t => {
    const h = harness(t, { history: { ...finalHistory, outputs: { '75': finalHistory.outputs['75'] } } });
    const result = await h.run();
    assert.equal(result.prompt, draft().prompt);
    assert.equal(result.promptIsFinal, false);
});

test('missing active nodes fail before uploads or queue submission', async t => {
    const h = harness(t, { missingWriter: true });
    await assert.rejects(h.run(), /Missing ComfyUI nodes.*TextGenerateLTX2Prompt/);
    assert.equal(h.requests.some(request => request.path === '/upload/image' || request.path === '/prompt'), false);
});

test('upload and queue failures surface without reporting a successful output', async t => {
    const h = harness(t, { uploadError: true });
    await assert.rejects(h.run(), /HTTP 500/);
    assert.equal(h.queued, undefined);
});

test('cancellation racing submission waits for the owned prompt ID and never sends global interrupt', async t => {
    const abort = new AbortController();
    const h = harness(t, { onQueue: () => abort.abort() });
    await assert.rejects(h.run(workflow.defaultAudioSyncSettings(), abort.signal), { name: 'AbortError' });
    assert.equal(h.requests.filter(request => request.path.endsWith('/cancel')).length, 1);
    assert.equal(h.requests.at(-1).path, '/api/jobs/owned-audio-sync/cancel');
    assert.equal(h.requests.some(request => request.path === '/interrupt'), false);
    assert.equal(h.socket.closed, true);
});

test('unsupported targeted cancellation is explicit and does not interrupt other jobs', async t => {
    const abort = new AbortController();
    const h = harness(t, { onQueue: () => abort.abort(), cancelError: true });
    await assert.rejects(h.run(workflow.defaultAudioSyncSettings(), abort.signal), /Could not confirm cancellation.*No global interrupt/);
    assert.equal(h.requests.some(request => request.path === '/interrupt'), false);
});

test('cached successful history with no saved video and failed histories both report errors', async t => {
    const h = harness(t, { history: { status: { completed: true }, outputs: { '398:381': { text: ['Prompt only'] } } } });
    await assert.rejects(h.run(), /without a saved video/);
    assert.equal(h.socket.closed, true);
});

test('execution errors remain visible instead of returning partial or foreign videos', async t => {
    const h = harness(t, { history: { status: { completed: false, status_str: 'error', messages: ['CUDA out of memory'] }, outputs: { other: finalHistory.outputs['75'] } } });
    await assert.rejects(h.run(), /CUDA out of memory/);
});

test('export preparation uploads inputs but never queues a generation or opens a WebSocket', async t => {
    const h = harness(t);
    const graph = await api.prepareAudioSyncWorkflow(draft(), workflow.defaultAudioSyncSettings(), new AbortController().signal, () => {});
    assert.match(graph['405'].inputs.audio, /^audio-sync-input\//);
    assert.equal(h.queued, undefined);
    assert.equal(h.socket, undefined);
});
