import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./videoMergeService.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source.replace(/^import .*;\r?$/gm, ''), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const harness = `
let testEncoder;
export const setTestEncoder = value => { testEncoder = value; };
const FFFSType = { WORKERFS: 'WORKERFS' };
const readVideoClipSource = async (_file, signal) => signal.throwIfAborted();
const withVideoEncoder = async (signal, task) => { signal.throwIfAborted(); return task(testEncoder, () => 'test encoder log'); };
`;
const service = await import(`data:text/javascript;base64,${Buffer.from(harness + outputText).toString('base64')}`);
const probe = (video = {}, audio = true) => ({
    streams: [
        { codec_type: 'video', width: 1920, height: 1080, duration: '4', avg_frame_rate: '24/1', sample_aspect_ratio: '1:1', ...video },
        ...(audio ? [{ codec_type: 'audio' }] : []),
    ],
});
const clip = (width = 1920, height = 1080, fps = 24, audio = true) => ({
    id: crypto.randomUUID(), file: new File(['video'], 'clip.mp4'),
    info: service.parseMergeVideoInfo(probe({ width, height, avg_frame_rate: `${fps}/1` }, audio)),
    start: 0, end: 4,
});

test('probing discovers actual FPS, dimensions, duration and optional audio', () => {
    assert.deepEqual(service.parseMergeVideoInfo(probe()), {
        videoStream: 0, width: 1920, height: 1080, displayWidth: 1920, displayHeight: 1080, duration: 4, fps: 24, hasAudio: true,
    });
    const data = probe({ duration: undefined, avg_frame_rate: '0/0', r_frame_rate: '30000/1001' }, false);
    data.format = { duration: '2.5' };
    const info = service.parseMergeVideoInfo(data);
    assert.equal(info.duration, 2.5);
    assert.equal(info.fps, 30000 / 1001);
    assert.equal(info.hasAudio, false);
});

test('rotation and anamorphic pixels are normalized only by reducing source dimensions', () => {
    const anamorphic = service.parseMergeVideoInfo(probe({ width: 1440, sample_aspect_ratio: '4:3' }));
    assert.equal(anamorphic.displayWidth, 1440);
    assert.equal(anamorphic.displayHeight, 810);
    const rotated = service.parseMergeVideoInfo(probe({ width: 1440, sample_aspect_ratio: '4:3', side_data_list: [{ rotation: -90 }] }));
    assert.equal(rotated.width, 1080);
    assert.equal(rotated.height, 1440);
    assert.equal(rotated.displayWidth, 810);
    assert.equal(rotated.displayHeight, 1440);
    const narrow = service.parseMergeVideoInfo(probe({ sample_aspect_ratio: '3:4' }));
    assert.equal(narrow.displayWidth, 1440);
    assert.equal(narrow.displayHeight, 1080);
});

test('invalid probe results and unsupported rotations fail explicitly', () => {
    for (const data of [null, {}, { streams: [] }, probe({ width: 0 }), probe({ duration: 'N/A' }),
        probe({ avg_frame_rate: '0/0' }), probe({ sample_aspect_ratio: '-1:1' }), probe({ side_data_list: [{ rotation: 45 }] })]) {
        assert.throws(() => service.parseMergeVideoInfo(data));
    }
    assert.throws(() => service.parseMergeVideoInfo({ ...probe(), error: { string: 'corrupt input' } }), /decoding error/);
});

test('attached cover art is not mistaken for the source video stream', () => {
    const data = probe();
    data.streams.unshift({ codec_type: 'video', width: 100, height: 100, disposition: { attached_pic: 1 } });
    assert.equal(service.parseMergeVideoInfo(data).width, 1920);
    const input = clip();
    input.info = service.parseMergeVideoInfo(data);
    assert.equal(input.info.videoStream, 1);
    assert(service.buildMergeClipArgs(input, service.planVideoMerge([input]), 0).includes('0:v:1'));
});

test('identical formats retain dimensions and do not require adaptation consent', () => {
    const plan = service.planVideoMerge([clip(), clip()]);
    assert.equal(plan.width, 1920);
    assert.equal(plan.height, 1080);
    assert.equal(plan.fps, 24);
    assert.equal(plan.duration, 8);
    assert.equal(plan.needsAdaptation, false);
});

test('mixed resolutions downscale to the smaller format and lowest FPS', () => {
    const plan = service.planVideoMerge([clip(1920, 1080, 60), clip(1280, 720, 24)]);
    assert.equal(plan.width, 1280);
    assert.equal(plan.height, 720);
    assert.equal(plan.fps, 24);
    assert.equal(plan.needsAdaptation, true);
    assert.deepEqual(plan.clips.map(item => [item.width, item.height]), [[1280, 720], [1280, 720]]);
});

test('landscape and portrait share a reduced first-clip canvas without cropping or upscaling', () => {
    const clips = [clip(1920, 1080), clip(1080, 1920)];
    const plan = service.planVideoMerge(clips);
    assert.equal(plan.width, 1080);
    assert.equal(plan.height, 606);
    assert.equal(plan.clips[1].width, 340);
    assert.equal(plan.clips[1].height, 606);
    for (const [index, part] of plan.clips.entries()) {
        assert(part.width <= clips[index].info.width);
        assert(part.height <= clips[index].info.height);
        assert(part.width <= plan.width && part.height <= plan.height);
        assert.equal(part.width % 2, 0);
        assert.equal(part.height % 2, 0);
    }
    const reversed = service.planVideoMerge([...clips].reverse());
    assert.equal(reversed.width, 606);
    assert.equal(reversed.height, 1080);
});

test('no-upscale constraints hold across many sizes and pixel aspect ratios', () => {
    for (const [width, height, sar] of [[641, 359, '1:1'], [720, 576, '16:15'], [320, 240, '3:4'], [1080, 1920, '1:1']]) {
        const input = clip(width, height);
        input.info = service.parseMergeVideoInfo(probe({ width, height, sample_aspect_ratio: sar }));
        const clips = [clip(), input];
        const plan = service.planVideoMerge(clips);
        plan.clips.forEach((part, index) => {
            assert(part.width <= clips[index].info.width && part.height <= clips[index].info.height);
            assert(part.width <= clips[index].info.displayWidth && part.height <= clips[index].info.displayHeight);
        });
    }
});

test('selection boundaries, finite dimensions and at least one complete output frame are required', () => {
    assert.throws(() => service.planVideoMerge([]), /Add at least/);
    for (const change of [{ start: -1 }, { end: 5 }, { start: 2, end: 1 }, { end: NaN }, { end: 0.001 }]) {
        assert.throws(() => service.planVideoMerge([{ ...clip(), ...change }]));
    }
    const invalid = clip();
    invalid.info.displayWidth *= 2;
    assert.throws(() => service.planVideoMerge([invalid]), /valid source dimensions/);
    for (const videoStream of [-1, 0.5, NaN, undefined]) {
        const invalidStream = clip();
        invalidStream.info.videoStream = videoStream;
        assert.throws(() => service.planVideoMerge([invalidStream]), /video stream index/);
    }
    const trimmed = { ...clip(), start: 1.25, end: 2.01 };
    const plan = service.planVideoMerge([trimmed]);
    assert.equal(plan.clips[0].frames, 18);
    assert.equal(plan.duration, 0.75);
});

test('there is no fixed clip-count limit', () => {
    const plan = service.planVideoMerge(Array.from({ length: 200 }, () => clip(320, 240)));
    assert.equal(plan.clips.length, 200);
    assert.equal(plan.duration, 800);
});

test('encoding preserves audio, normalizes stereo and pads shorter audio to the selected duration', () => {
    const input = { ...clip(), start: 1, end: 3 };
    const plan = service.planVideoMerge([input]);
    const args = service.buildMergeClipArgs(input, plan, 0);
    assert.deepEqual(args.slice(0, 6), ['-ss', '1', '-i', '/source/input', '-t', '2']);
    assert(args.includes('0:a:0'));
    assert(args.includes('asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad'));
    assert(args.includes('libx264') && args.includes('aac'));
    assert(args[args.indexOf('-vf') + 1].includes('pad=1920:1080'));
    assert(args[args.indexOf('-vf') + 1].includes('min(iw,ih*dar)'), 'The actual decoder dimensions also bound scaling.');
    assert(args[args.indexOf('-vf') + 1].includes('min(iw/dar,ih)'), 'Neither decoded axis may be enlarged.');
    assert(!args.some(value => value.includes('crop=')));
});

test('silent sources receive a finite-duration silence track for compatible joins', () => {
    const input = clip(640, 360, 24, false);
    const args = service.buildMergeClipArgs(input, service.planVideoMerge([input]), 0);
    assert(args.includes('anullsrc=channel_layout=stereo:sample_rate=48000'));
    assert(args.includes('1:a:0'));
    assert.equal(args[args.indexOf('-t') + 1], '4');
});

test('the encoder rejects an upscale plan and adaptation cannot proceed without explicit consent', async () => {
    const input = clip(640, 360);
    const plan = service.planVideoMerge([input]);
    assert.throws(() => service.buildMergeClipArgs(input, { ...plan, clips: [{ ...plan.clips[0], width: 1280 }] }, 0), /upscale/);
    await assert.rejects(service.mergeVideoClips([clip(), input], false, new AbortController().signal, () => {}), /Confirm downscale/);
});

test('core 0.12.10 unset probe status requires fresh valid JSON, never stale output', async t => {
    const warnings = t.mock.method(console, 'warn', () => {});
    const outputNames = [];
    service.setTestEncoder({
        createDir: async () => true, mount: async () => true, unmount: async () => true,
        ffprobe: async args => { outputNames.push(args[args.indexOf('-o') + 1]); assert(args.includes('-show_error')); return -1; },
        readFile: async path => { assert.equal(path, outputNames.at(-1)); return JSON.stringify(probe()); },
        deleteFile: async () => true,
    });
    const clips = await service.inspectMergeVideos([clip().file, clip().file], new AbortController().signal, () => {});
    assert.equal(clips.length, 2);
    assert.equal(new Set(outputNames).size, 2);
    assert.equal(warnings.mock.callCount(), 2);
});

test('probe errors, missing JSON, invalid JSON, empty imports and cancellation fail explicitly', async () => {
    const fake = {
        createDir: async () => true, mount: async () => true, unmount: async () => true,
        ffprobe: async () => -1, deleteFile: async () => true,
    };
    for (const readFile of [
        async () => { throw new Error('File not found'); },
        async () => 'not JSON',
        async () => JSON.stringify({ ...probe(), error: { code: -1 } }),
    ]) {
        service.setTestEncoder({ ...fake, readFile });
        await assert.rejects(service.inspectMergeVideos([clip().file], new AbortController().signal, () => {}));
    }
    service.setTestEncoder({ ...fake, ffprobe: async () => 1 });
    await assert.rejects(service.inspectMergeVideos([clip().file], new AbortController().signal, () => {}), /Could not inspect video/);
    await assert.rejects(service.inspectMergeVideos([], new AbortController().signal, () => {}), /Select at least/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(service.inspectMergeVideos([clip().file], controller.signal, () => {}), { name: 'AbortError' });
});
