import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mp4 = Uint8Array.from([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]);
const state = { code: 0, output: mp4, mounted: true, calls: 0 };
globalThis.__audioMux = state;
const source = `
const state = globalThis.__audioMux;
const FFFSType = { WORKERFS: 'WORKERFS' };
const withVideoEncoder = async (signal, task) => task({
    createDir: async () => {},
    mount: async (type, options) => { state.sources = options.blobs; return state.mounted; },
    exec: async args => { state.calls++; state.args = args; return state.code; },
    readFile: async () => state.output,
}, () => 'mux diagnostic');
` + read('./audioClipService.ts') + read('./videoAudioService.ts');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
delete globalThis.__audioMux;
const video = new File(['server video WITH wrong generated sound'], 'server.mp4', { type: 'video/mp4' });
const wav = () => new File([api.encodeAudioWav({
    sampleRate: 16000, numberOfChannels: 1, length: 8 * 16000, getChannelData: () => new Float32Array(8 * 16000),
}, { start: 4, end: 8 })], 'passage-4-8.wav', { type: 'audio/wav' });

test('force mux maps only server video plus selected WAV, copies video and bounds output to the WAV samples', async () => {
    const audio = wav();
    const result = await api.forceOriginalVideoAudio(video, audio, 4, new AbortController().signal);
    assert.deepEqual(state.sources.map(source => source.data), [video, audio]);
    assert.deepEqual(state.args.filter((arg, i, args) => args[i - 1] === '-map'), ['0:v:0', '1:a:0']);
    assert.equal(state.args[state.args.indexOf('-c:v') + 1], 'copy');
    assert.equal(state.args[state.args.indexOf('-t') + 1], '4');
    assert.ok(!state.args.includes('-shortest'), 'Do not cut the WAV short if the server video has fractional frame rounding.');
    assert.equal(result.type, 'video/mp4');
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), mp4);
});

test('invalid WAV, mismatched passage, mount/encoder/output errors and abort cannot fall back to server sound', async () => {
    const signal = new AbortController().signal;
    const before = state.calls;
    await assert.rejects(api.forceOriginalVideoAudio(video, new File(['bad'], 'bad.wav'), 4, signal), /PCM16/);
    await assert.rejects(api.forceOriginalVideoAudio(video, wav(), 3, signal), /duration/);
    assert.equal(state.calls, before);
    state.mounted = false;
    await assert.rejects(api.forceOriginalVideoAudio(video, wav(), 4, signal), /mount/);
    state.mounted = true; state.code = 1;
    await assert.rejects(api.forceOriginalVideoAudio(video, wav(), 4, signal), /mux diagnostic/);
    state.code = 0; state.output = new Uint8Array([1]);
    await assert.rejects(api.forceOriginalVideoAudio(video, wav(), 4, signal), /No generated-audio fallback/);
    state.output = mp4;
    const abort = new AbortController(); abort.abort();
    await assert.rejects(api.forceOriginalVideoAudio(video, wav(), 4, abort.signal), { name: 'AbortError' });
    for (const value of [0, NaN, Infinity, 61]) assert.throws(() => api.buildOriginalAudioArgs(value), /duration/);
});
