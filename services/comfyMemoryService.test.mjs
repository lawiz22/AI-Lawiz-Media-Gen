import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./comfyMemoryService.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { requestComfyMemoryRelease } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
let configured;
let requests;
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFetch = globalThis.fetch;
test.beforeEach(() => {
    configured = 'http://localhost:8188';
    requests = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'comfyui_url' ? configured : null } });
    globalThis.fetch = async (url, options) => { requests.push({ url, options }); return new Response('', { status: 200 }); };
});
test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
});

test('Clear VRAM sends the native model-only command and accepts empty HTTP 200', async () => {
    await requestComfyMemoryRelease('unload-models', new AbortController().signal);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://localhost:8188/free');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(requests[0].options.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(requests[0].options.body), { unload_models: true });
});

test('Free model and node cache requests BOTH native flags, without queue/history/interrupt calls', async () => {
    await requestComfyMemoryRelease('free-caches', new AbortController().signal);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://localhost:8188/free');
    assert.deepEqual(JSON.parse(requests[0].options.body), { unload_models: true, free_memory: true });
});

test('preserves HTTPS and reverse-proxy prefixes and accepts a host without a scheme', async () => {
    for (const [input, expected] of [
        ['  https://comfy.example/proxy/comfy///  ', 'https://comfy.example/proxy/comfy/free'],
        ['127.0.0.1:8188/', 'http://127.0.0.1:8188/free'],
        ['localhost:8188', 'http://localhost:8188/free'],
    ]) {
        configured = input;
        await requestComfyMemoryRelease('unload-models', new AbortController().signal);
        assert.equal(requests.at(-1).url, expected);
    }
});

test('rejects missing, unsafe and malformed configuration before sending anything', async () => {
    for (const input of [null, '', ' ', 'file:///tmp/comfy', 'https://server?x=1', 'https://server/#x', 'https://user:password@server', 'http://']) {
        configured = input;
        await assert.rejects(requestComfyMemoryRelease('free-caches', new AbortController().signal));
    }
    assert.equal(requests.length, 0);
});

test('unknown actions are rejected rather than silently selecting a cleanup mode', async () => {
    await assert.rejects(requestComfyMemoryRelease('unknown', new AbortController().signal), /Unknown ComfyUI memory action/);
    assert.equal(requests.length, 0);
});

test('HTTP and network failures are surfaced, not reported as successful cleanup', async () => {
    globalThis.fetch = async () => new Response('Access denied', { status: 403 });
    await assert.rejects(requestComfyMemoryRelease('unload-models', new AbortController().signal), /HTTP 403.*Access denied/);
    globalThis.fetch = async () => { throw new Error('Network unavailable'); };
    await assert.rejects(requestComfyMemoryRelease('free-caches', new AbortController().signal), /Network unavailable/);
});

test('a reverse proxy HTML success page is not a native cleanup acknowledgement', async () => {
    globalThis.fetch = async () => new Response('<html>Login required</html>', { status: 200 });
    await assert.rejects(requestComfyMemoryRelease('free-caches', new AbortController().signal), /unexpected response/);
});

test('aborted requests never reach the server', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(requestComfyMemoryRelease('unload-models', controller.signal), { name: 'AbortError' });
    assert.equal(requests.length, 0);
});

test('in-flight cancellation and the 30-second timeout reach fetch and surface the error', async t => {
    const controller = new AbortController();
    globalThis.fetch = async (_url, options) => {
        controller.abort();
        options.signal.throwIfAborted();
    };
    await assert.rejects(requestComfyMemoryRelease('unload-models', controller.signal), { name: 'AbortError' });
    t.mock.method(AbortSignal, 'timeout', ms => {
        assert.equal(ms, 30000);
        return AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
    });
    globalThis.fetch = async (_url, options) => options.signal.throwIfAborted();
    await assert.rejects(requestComfyMemoryRelease('free-caches', new AbortController().signal), { name: 'TimeoutError' });
});
