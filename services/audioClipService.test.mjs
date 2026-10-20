import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./audioClipService.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const audio = (channels = [[0, 0.25, -0.5, 1, -1, 0.5, 0, -0.25]], sampleRate = 4) => ({
    length: channels[0].length, sampleRate, numberOfChannels: channels.length,
    getChannelData: index => Float32Array.from(channels[index]),
});

test('WAV excerpt has exact sample boundaries, PCM16 header and interleaved stereo', async () => {
    const source = audio([[0, 0.25, -0.5, 1, -1, 0.5, 0, -0.25], [0, -0.25, 0.5, -1, 1, -0.5, 0, 0.25]]);
    const blob = api.encodeAudioWav(source, { start: 0.5, end: 1.25 });
    const buffer = await blob.arrayBuffer(), header = new DataView(buffer);
    assert.equal(blob.type, 'audio/wav');
    assert.equal(buffer.byteLength, 44 + 3 * 2 * 2);
    assert.equal(Buffer.from(buffer).subarray(0, 4).toString(), 'RIFF');
    assert.equal(Buffer.from(buffer).subarray(8, 16).toString(), 'WAVEfmt ');
    assert.equal(header.getUint16(20, true), 1);
    assert.equal(header.getUint16(22, true), 2);
    assert.equal(header.getUint32(24, true), 4);
    assert.equal(header.getUint32(28, true), 16);
    assert.equal(header.getUint16(32, true), 4);
    assert.equal(header.getUint16(34, true), 16);
    assert.equal(header.getUint32(40, true), 12);
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => header.getInt16(44 + i * 2, true)), [-16384, 16383, 32767, -32768, -32768, 32767]);
});

test('default full recording keeps all mono samples and clamps PCM overflows', async () => {
    const buffer = await api.encodeAudioWav(audio([[2, -2, 0, 0.5]])).arrayBuffer();
    const view = new DataView(buffer);
    assert.equal(buffer.byteLength, 52);
    assert.equal(view.getUint16(22, true), 1);
    assert.deepEqual(Array.from({ length: 4 }, (_, i) => view.getInt16(44 + i * 2, true)), [32767, -32768, 0, 16383]);
});

test('consecutive fractional selections share a boundary without duplicate or skipped samples', () => {
    const source = audio([Array.from({ length: 44100 * 10 }, () => 0)], 44100);
    const first = { start: 0.12345, end: 3.12345 };
    const second = api.nextAudioSelection(first, 10);
    const a = api.audioSelectionFrames(source, first), b = api.audioSelectionFrames(source, second);
    assert.equal(second.start, first.end);
    assert.equal(a.last, b.first);
    assert.equal(a.last - a.first, 132300);
    assert.equal(b.last - b.first, 132300);
    assert.deepEqual(api.nextAudioSelection({ start: 6, end: 9 }, 10), { start: 9, end: 10 });
    assert.equal(api.nextAudioSelection({ start: 9, end: 10 }, 10), null);
});

test('invalid selections and malformed decoded audio fail explicitly', () => {
    for (const range of [{ start: -1, end: 1 }, { start: 0, end: 3 }, { start: 1, end: 1 }, { start: NaN, end: 1 }, { start: 0, end: Infinity }, { start: 0, end: 0.001 }]) {
        assert.throws(() => api.encodeAudioWav(audio(), range));
        if (range.end !== 0.001) assert.throws(() => api.nextAudioSelection(range, 2));
    }
    assert.throws(() => api.encodeAudioWav({ ...audio(), sampleRate: 0 }), /metadata/);
    assert.throws(() => api.encodeAudioWav(audio([[0, NaN]])), /invalid sample/);
    assert.throws(() => api.encodeAudioWav(audio([[0, 1], [0]])), /inconsistent/);
});

test('waveform includes quiet gaps and peaks from every channel without omitting tail samples', () => {
    assert.deepEqual(api.audioWaveformPeaks(audio([[0, 0, 0.5, -0.75, 0], [0, 0, 0, 0, -1]]), 3), [0, 0.5, 1]);
    assert.deepEqual(api.audioWaveformPeaks(audio([[0, 0]]), 640), [0, 0]);
    assert.throws(() => api.audioWaveformPeaks(audio(), 0), /resolution/);
    assert.throws(() => api.audioWaveformPeaks(audio([[NaN]])), /invalid sample/);
});
