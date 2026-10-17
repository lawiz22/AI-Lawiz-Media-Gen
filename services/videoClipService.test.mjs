import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./videoClipService.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replace(/^import .*;\r?$/gm, ''), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const service = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const options = { start: 1.25, end: 3.5, duration: 10, reduceResolution: false };

test('MP4 extraction re-encodes the selected interval with optional source audio', () => {
    const args = service.buildVideoClipArgs(options);
    assert.deepEqual(args.slice(0, 6), ['-ss', '1.25', '-i', '/source/input', '-t', '2.25']);
    assert.deepEqual(args.slice(6, 10), ['-map', '0:v:0', '-map', '0:a:0?']);
    assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
    assert.equal(args[args.indexOf('-c:a') + 1], 'aac');
    assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
    assert.equal(args[args.indexOf('-movflags') + 1], '+faststart');
    assert.equal(args.at(-1), 'clip.mp4');
    assert.ok(!args.includes('copy'));
});

test('normal and half-resolution filters use quoted expressions and even dimensions', () => {
    const normal = service.buildVideoClipArgs(options);
    const half = service.buildVideoClipArgs({ ...options, reduceResolution: true });
    assert.equal(normal[normal.indexOf('-vf') + 1], "scale='max(2,trunc(iw/2)*2)':'max(2,trunc(ih/2)*2)'");
    assert.equal(half[half.indexOf('-vf') + 1], "scale='max(2,trunc(iw/4)*2)':'max(2,trunc(ih/4)*2)'");
    assert.ok(!half.some(arg => arg.includes('setsar=1')), 'Keep the source display aspect ratio.');
});

test('spatial crop exports the chosen pixel dimensions and square pixels', () => {
    const edit = { x: 10, y: 20, width: 50, height: 60, outputWidth: 1280, outputHeight: 720 };
    assert.equal(service.buildSpatialVideoFilter(edit), 'crop=iw*50/100:ih*60/100:iw*10/100:ih*20/100,scale=1280:720,setsar=1');
    for (const change of [{ x: -1 }, { y: 50 }, { width: 0 }, { height: NaN }, { outputWidth: 1279 }, { outputHeight: 4098 }, { outputWidth: 0 }]) {
        assert.throws(() => service.buildSpatialVideoFilter({ ...edit, ...change }), /Invalid video crop/);
    }
});

test('invalid, empty, reversed and out-of-bounds intervals are rejected', () => {
    for (const change of [
        { start: -1 }, { start: NaN }, { start: Infinity },
        { end: 1.25 }, { end: 1 }, { end: 10.001 }, { end: NaN },
        { duration: 0 }, { duration: -1 }, { duration: Infinity },
    ]) {
        assert.throws(() => service.buildVideoClipArgs({ ...options, ...change }), /valid start and end frame/);
    }
    assert.doesNotThrow(() => service.buildVideoClipArgs({ ...options, start: 0, end: 10 }));
});

test('Library saving requires strictly less than 300 seconds', () => {
    for (const duration of [0.001, 2, 299, 299.999]) assert.equal(service.canSaveVideoClip(duration), true);
    for (const duration of [0, -1, NaN, Infinity, 300, 300.001, 600]) assert.equal(service.canSaveVideoClip(duration), false);
    assert.doesNotThrow(() => service.buildVideoClipArgs({ ...options, start: 0, end: 600, duration: 600 }));
});

test('source probing accepts a readable video before loading the encoder', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'video.mp4');
    await service.readVideoClipSource(file, new AbortController().signal);
});

test('sources over 2 GB are probed in bounded chunks without whole-file reads', async () => {
    const size = 3 * 1024 ** 3;
    const reads = [];
    const file = {
        name: 'large.mkv', size,
        arrayBuffer: async () => { throw new Error('Whole-file reads must not occur.'); },
        slice: (start, end) => {
            reads.push([start, end]);
            return { arrayBuffer: async () => new ArrayBuffer(end - start) };
        },
    };
    await service.readVideoClipSource(file, new AbortController().signal);
    assert.deepEqual(reads, [[0, 65536], [size - 65536, size]]);
});

test('unreadable sources report the source stage and retain the original error', async () => {
    const cause = new DOMException('The requested file could not be read.', 'NotReadableError');
    const file = { name: 'video.mp4', size: 3, slice: () => ({ arrayBuffer: async () => { throw cause; } }) };
    await assert.rejects(service.readVideoClipSource(file, new AbortController().signal), error => {
        assert.match(error.message, /Could not read source video "video.mp4"/);
        assert.match(error.message, /Select the file again using Upload Video/);
        assert.equal(error.cause, cause);
        return true;
    });
});

test('an inaccessible end of a source is reported before encoding', async () => {
    let slices = 0;
    const file = {
        name: 'video.mkv', size: 1024 ** 3,
        slice: () => ({ arrayBuffer: async () => {
            if (++slices === 2) throw new DOMException('Unreadable tail.', 'NotReadableError');
            return new ArrayBuffer(65536);
        } }),
    };
    await assert.rejects(service.readVideoClipSource(file, new AbortController().signal), /Unreadable tail/);
});

test('empty sources fail explicitly and cancellation remains an AbortError', async () => {
    await assert.rejects(service.readVideoClipSource(new File([], 'empty.mp4'), new AbortController().signal), /selected video is empty/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(service.readVideoClipSource(new File(['data'], 'video.mp4'), controller.signal), { name: 'AbortError' });
});
