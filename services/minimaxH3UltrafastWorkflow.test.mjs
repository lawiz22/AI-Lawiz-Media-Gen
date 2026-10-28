import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ['./videoPromptService.ts', './minimaxH3Workflow.ts', './minimaxH3UltrafastWorkflow.ts']
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const reference = (kind, slot) => ({ id: `${kind}-${slot}`, kind, slot, note: '',
    file: new File(['reference'], `${kind}-${slot}`, { type: `${kind}/test` }) });
const draft = (references = [], prompt = 'A quiet scene with footsteps.') => ({
    id: 'ultrafast-test', workflow: 'ultrafast', references, prompt, duration: 2, aspect: '4:3', template: 'generation',
});
const build = (options = api.defaultUltrafastH3Options(), input = draft()) => api.buildH3RenderWorkflow(input, options,
    Object.fromEntries(input.references.map(ref => [ref.id, ref.file.name])));

test('Ultrafast preserves the supplied five-step sigma-shift, attention, LoRA, preview and native output graph', () => {
    const options = api.defaultUltrafastH3Options(), graph = build(options);
    assert.equal(options.megapixels, 0.30000000000000004);
    assert.equal(options.duration, 2);
    assert.equal(graph['121'].inputs.vae_name, 'minimax_h3_video_vae_int8_convrot.safetensors');
    assert.equal(graph['184'].inputs.ref_image_size, 'match');
    assert.deepEqual(graph['190'], { class_type: 'BasicScheduler', inputs: {
        model: ['ultrafast-attention', 0], scheduler: 'beta', steps: 5, denoise: 1,
    } });
    assert.deepEqual(graph['ultrafast-shift'].inputs, { model: ['ultrafast-attention', 0], shift_video: 12, shift_audio: 3 });
    assert.deepEqual(graph['149'].inputs.model, ['ultrafast-shift', 0]);
    assert.equal(graph['ultrafast-attention'].inputs.attention, 'comfy kitchen attention');
    assert.deepEqual(graph['ultrafast-attention'].inputs.model, ['141', 0]);
    assert.deepEqual(graph['141'].inputs.model, ['137', 0]);
    assert.equal(graph['141'].inputs.jpeg_quality, 80);
    assert.equal(graph['141'].inputs.preview_frames, 500);
    assert.equal(graph['141'].inputs.preview_fps, 6);
    assert.deepEqual(graph['ultrafast-video'].inputs, { images: ['133', 0], fps: 24, bit_depth: 8, color_space: 'sRGB', codec: 'none', audio: ['134', 0] });
    assert.equal(graph['119'].class_type, 'SaveVideo');
    assert.equal(graph['119'].inputs.filename_prefix, 'video/H3');
    assert.equal(graph['119'].inputs.format, 'auto');
    assert.equal(graph['119'].inputs['format.codec'], 'auto');
    assert.ok(!Object.values(graph).some(node => ['BetaSamplingScheduler', 'ExtendIntermediateSigmas', 'VHS_VideoCombine', 'Power Lora Loader (rgthree)'].includes(node.class_type)));
    assert.equal(graph['185'], undefined, 'Plain prompts do not need the composer or ReferencePack.');
});

test('native Ultrafast saving retains the resolved date prefix instead of restoring its raw template', () => {
    const options = { ...api.defaultUltrafastH3Options(), filenamePrefix: 'video/%date:yyyy-MM-dd%/H3' };
    const graph = build(options);
    assert.equal(graph['119'].inputs.filename_prefix, api.resolveH3FilenamePrefix(options.filenamePrefix));
    assert.doesNotMatch(graph['119'].inputs.filename_prefix, /%date|:/);
    assert.equal(options.filenamePrefix, 'video/%date:yyyy-MM-dd%/H3');
});

test('every combination of Spectrum, realtime preview and RTX has real wiring or a complete bypass', () => {
    for (const spectrum of [false, true]) for (const preview of [false, true]) for (const rtxUpscale of [false, true]) {
        const options = api.defaultUltrafastH3Options();
        options.preview = preview;
        Object.assign(options.ultrafast, { spectrum, rtxUpscale });
        const graph = build(options);
        assert.equal(!!graph['ultrafast-spectrum'], spectrum);
        assert.equal(!!graph['141'], preview);
        assert.equal(!!graph['ultrafast-rtx'], rtxUpscale);
        assert.deepEqual(graph['149'].inputs.model, [spectrum ? 'ultrafast-spectrum' : 'ultrafast-shift', 0]);
        assert.deepEqual(graph['ultrafast-attention'].inputs.model, [preview ? '141' : '137', 0]);
        assert.deepEqual(graph['ultrafast-video'].inputs.images, [rtxUpscale ? 'ultrafast-rtx' : '133', 0]);
        if (rtxUpscale) assert.equal(graph['ultrafast-rtx'].inputs['resize_type.scale'], 2);
        for (const node of Object.values(graph)) for (const value of Object.values(node.inputs)) {
            if (Array.isArray(value)) assert.ok(graph[value[0]], `Dangling link ${value[0]}`);
        }
    }
});

test('six images, two videos and two standalone audios retain native conditioning sockets and soundtrack numbering', () => {
    const refs = [ ...Array.from({ length: 6 }, (_, index) => reference('image', index + 1)),
        reference('video', 1), reference('video', 2), reference('audio', 1), reference('audio', 2) ];
    const graph = build(undefined, draft(refs, 'Use <Picture 6>, <Video 2> and <Audio 2>.'));
    assert.deepEqual(graph['184'].inputs['ref_images.ref_image_5'], ['185', 5]);
    assert.deepEqual(graph['184'].inputs['ref_videos.ref_video_1'], ['185', 10]);
    assert.deepEqual(graph['184'].inputs['ref_audios.ref_audio_1'], ['185', 16]);
    assert.match(graph['185'].inputs.direction, /<Audio 4>/);
    for (const kind of ['image', 'video', 'audio']) {
        assert.throws(() => build(undefined, draft([...refs, reference(kind, kind === 'image' ? 7 : 3)])), /supports at most/);
    }
    assert.throws(() => build(undefined, draft([], 'Use <Picture 1>.')), /disabled or missing/);
    const audioOnly = build(undefined, draft([reference('audio', 2)], 'Dance to <Audio 2>.'));
    assert.deepEqual(audioOnly['184'].inputs['ref_audios.ref_audio_0'], ['185', 15]);
    assert.match(audioOnly['185'].inputs.direction, /<Audio 1>/);
});

test('six LTX LoRAs use the source stack format; disabled LoRA chain is bypassed and catalog validation is explicit', () => {
    const options = api.defaultUltrafastH3Options();
    options.loras = options.loras.map((_, index) => ({ enabled: true, name: `lora-${index}.safetensors`, strength: 0.5 }));
    options.useLoraClip = true;
    const graph = build(options), stack = JSON.parse(graph['137'].inputs.stack_data);
    assert.equal(stack.length, 6);
    assert.deepEqual(stack[5], { on: true, lora: 'lora-5.safetensors', str: 0.5, v: 1, a: 1, t: 1 });
    assert.deepEqual(graph['184'].inputs.clip, ['137', 1]);
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
    info.LoraLoader = { input: { required: { lora_name: [options.loras.map(lora => lora.name)] } } };
    api.validateMinimaxH3Readiness(graph, info);
    info.LoraLoader.input.required.lora_name = [[]];
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /LoRA .*not available/);
    options.useLoras = false;
    const bypass = build(options);
    assert.equal(bypass['137'], undefined);
    assert.deepEqual(bypass['141'].inputs.model, ['135', 0]);
    options.loras.push({ enabled: false, name: '', strength: 1 });
    assert.throws(() => build(options), /six LoRAs/);
});

test('generated-audio bypass and invalid Ultrafast settings never silently use a different workflow', () => {
    const options = api.defaultUltrafastH3Options();
    options.generateAudio = false;
    const graph = build(options);
    assert.equal(graph['134'], undefined);
    assert.equal(graph['ultrafast-video'].inputs.audio, undefined);
    assert.throws(() => build({ ...options, ultrafast: undefined }), /settings are missing/);
    assert.throws(() => build({ ...options, saveOutput: false }), /native SaveVideo/);
    assert.throws(() => build({ ...options, ultrafast: { ...options.ultrafast, shiftVideo: NaN } }), /sigma shift/);
    assert.throws(() => build({ ...options, ultrafast: { ...options.ultrafast, rtxUpscale: true, rtxScale: 5 } }), /RTX scale/);
    const normal = api.buildH3RenderWorkflow({ ...draft(), workflow: 'reference' }, api.defaultMinimaxH3Options(), {});
    assert.equal(normal['119'].class_type, 'VHS_VideoCombine');
    assert.equal(normal['190'].class_type, 'BetaSamplingScheduler');
});
