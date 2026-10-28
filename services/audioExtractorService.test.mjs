import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const state = { code: 0, mounted: true, output: new Uint8Array(64), closes: 0 };
globalThis.__audioExtractorTest = state;
const source = `
const state = globalThis.__audioExtractorTest;
const FFFSType = { WORKERFS: 'WORKERFS' };
const withVideoEncoder = async (signal, task) => task({
    createDir: async () => {},
    mount: async (type, options) => { state.input = options.blobs[0].data; return state.mounted; },
    exec: async args => { state.args = args; return state.code; },
    readFile: async () => state.output,
}, () => 'decoder diagnostic');
class AudioContext {
    async decodeAudioData() { return state.audio; }
    async close() { state.closes++; }
}
` + ['audioClipService.ts', 'audioExtractorService.ts'].map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
delete globalThis.__audioExtractorTest;
const audio = (length = 200000) => {
    const channels = [Float32Array.from({ length }, (_, i) => Math.sin(i / 100)), Float32Array.from({ length }, (_, i) => Math.cos(i / 100))];
    return { length, sampleRate: 44100, numberOfChannels: 2, getChannelData: index => channels[index] };
};
const signal = () => new AbortController().signal;

test('audio and video sources use a strict first-audio-track map without reading the entire original into memory', async () => {
    state.audio = audio(100);
    for (const type of ['audio/wav', 'video/mp4', 'video/x-matroska']) {
        const file = new File(['source'], 'source', { type });
        const decoded = await api.decodeMediaAudio(file, signal(), () => {});
        assert.equal(decoded, state.audio);
        assert.equal(state.input, file);
        assert.equal(state.args[state.args.indexOf('-map') + 1], '0:a:0');
        assert.ok(state.args.includes('-vn'));
        assert.equal(state.args[state.args.indexOf('-c:a') + 1], 'pcm_s16le');
    }
    assert.equal(state.closes, 3);
});

test('empty sources, missing soundtracks, mount errors, empty decoder output and abort fail explicitly', async () => {
    const file = new File(['source'], 'silent.mp4');
    await assert.rejects(api.decodeMediaAudio(new File([], 'empty.mp4'), signal(), () => {}), /non-empty/);
    state.code = 1;
    await assert.rejects(api.decodeMediaAudio(file, signal(), () => {}), /no audio track.*decoder diagnostic/);
    state.code = 0; state.mounted = false;
    await assert.rejects(api.decodeMediaAudio(file, signal(), () => {}), /read the selected/);
    state.mounted = true; state.output = new Uint8Array(0);
    await assert.rejects(api.decodeMediaAudio(file, signal(), () => {}), /no usable audio/);
    state.output = new Uint8Array(64);
    const abort = new AbortController(); abort.abort();
    await assert.rejects(api.decodeMediaAudio(file, abort.signal, () => {}), { name: 'AbortError' });
});

test('chunked export matches the existing sample-exact PCM16 encoder byte for byte across chunk boundaries', async () => {
    const input = audio(), selection = { start: 0.12345, end: 4.12345 };
    const file = await api.exportAudioExcerpt(input, selection, 'original.mp4', signal());
    assert.equal(file.name, 'original-0.123-4.123.wav');
    assert.equal(file.type, 'audio/wav');
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await api.encodeAudioWav(input, selection).arrayBuffer()));
    const view = new DataView(await file.arrayBuffer());
    assert.equal(view.getUint32(40, true), 176400 * 2 * 2);
    await assert.rejects(api.exportAudioExcerpt(input, { start: 2, end: 1 }, 'bad', signal()), /start and end/);
});

test('zoomed waveform reads only the selected range and preserves every channel peak', async () => {
    const input = { sampleRate: 4, length: 8, numberOfChannels: 2, getChannelData: i => Float32Array.from(i ? [1, 1, 0.3, -0.8, 0, 0, 1, 1] : [1, 1, 0.1, 0.5, 0.2, -0.4, 1, 1]) };
    assert.deepEqual(await api.buildAudioWaveform(input, { start: 0.5, end: 1.5 }, signal(), 4), Array.from(Float32Array.from([0.3, 0.8, 0.2, 0.4])));
});

test('long waveform scans and WAV encoding can be cancelled between responsive chunks', async () => {
    for (const operation of ['export', 'waveform']) {
        const abort = new AbortController(), input = audio();
        const promise = operation === 'export' ? api.exportAudioExcerpt(input, { start: 0, end: 4 }, 'source', abort.signal)
            : api.buildAudioWaveform(input, { start: 0, end: 4 }, abort.signal);
        abort.abort();
        await assert.rejects(promise, { name: 'AbortError' });
    }
});
