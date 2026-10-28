import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const state = { code: 0, output: png, mounted: true, args: [], calls: 0 };
globalThis.__frameTest = state;
const source = `
const state = globalThis.__frameTest;
const FFFSType = { WORKERFS: 'WORKERFS' };
const readVideoClipSource = async (file, signal) => { signal.throwIfAborted(); if (!file.size) throw new Error('Empty source'); };
const withVideoEncoder = async (signal, task) => task({
    createDir: async () => {},
    mount: async (type, options) => { state.source = options.blobs[0].data; return state.mounted; },
    exec: async args => { state.calls++; state.args = args; return state.code; },
    readFile: async () => state.output,
}, () => 'decoder diagnostic');
` + readFileSync(new URL('./videoFrameService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
delete globalThis.__frameTest;
const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

test('last-frame decoding reads through EOF without frame drops, approximate seeks, reverse buffering or scaling', () => {
    const args = api.buildLastVideoFrameArgs();
    assert.equal(args[args.indexOf('-map') + 1], '0:v:0');
    assert.equal(args[args.indexOf('-vsync') + 1], '0');
    assert.equal(args[args.indexOf('-update') + 1], '1');
    assert.equal(args.at(-1), 'last-frame.png');
    for (const option of ['-ss', '-sseof', '-frames:v', '-vf', '-r', '-t']) assert(!args.includes(option));
});

test('a verified PNG becomes a full-resolution reference File from the mounted source', async () => {
    const result = await api.extractLastVideoFrame(file, new AbortController().signal);
    assert.equal(state.source, file);
    assert.equal(result.name, 'clip-last-frame.png');
    assert.equal(result.type, 'image/png');
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), png);
});

test('selected frames use the last presentation timestamp at or before the cursor without scaling or FPS conversion', async () => {
    const args = api.buildVideoFrameArgs(0.51);
    assert.equal(args[args.indexOf('-vf') + 1], 'select=lte(t\\,0.51)');
    assert.equal(args[args.indexOf('-vsync') + 1], '0');
    assert.ok(!args.includes('-ss'), 'Seeking to the next frame would not match the displayed frame.');
    assert.ok(!args.includes('-r'));
    const result = await api.extractVideoFrame(file, 0.51, new AbortController().signal);
    assert.equal(result.name, 'clip-frame-0.510s.png');
    assert.equal(result.type, 'image/png');
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), png);
    assert.deepEqual(api.buildVideoFrameArgs(null), api.buildLastVideoFrameArgs());
    for (const seconds of [-1, NaN, Infinity]) {
        await assert.rejects(api.extractVideoFrame(file, seconds, new AbortController().signal), /finite, non-negative/);
    }
});

test('mount failures, decoder failures, invalid output and abort never produce a reference', async () => {
    state.mounted = false;
    await assert.rejects(api.extractLastVideoFrame(file, new AbortController().signal), /mount/);
    state.mounted = true; state.code = 1;
    await assert.rejects(api.extractLastVideoFrame(file, new AbortController().signal), /decoder diagnostic/);
    state.code = 0; state.output = new Uint8Array([0, 1]);
    await assert.rejects(api.extractLastVideoFrame(file, new AbortController().signal), /decodable/);
    state.output = png;
    const abort = new AbortController(); abort.abort();
    await assert.rejects(api.extractLastVideoFrame(file, abort.signal), { name: 'AbortError' });
});
