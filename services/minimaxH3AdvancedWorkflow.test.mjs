import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = ['./videoPromptService.ts', './minimaxH3Workflow.ts', './minimaxH3AdvancedWorkflow.ts', './minimaxH3UltrafastWorkflow.ts', './minimaxH3Library.ts']
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const ref = (kind, slot) => ({ id: `${kind}-${slot}`, kind, slot, note: '', file: new File(['reference'], `${kind}-${slot}.test`, { type: `${kind}/test` }) });
const draft = (references = [], prompt = 'A quiet street with footsteps.') => ({ id: 'advanced', workflow: 'advanced', references, prompt, aspect: '4:3', duration: 3, template: 'generation' });
const build = (options = api.defaultAdvancedH3Options(), input = draft()) => api.buildH3RenderWorkflow(input, options, Object.fromEntries(input.references.map(ref => [ref.id, ref.file.name])));
const assertDAG = graph => {
    const active = new Set(), visited = new Set();
    const visit = id => {
        assert.ok(graph[id], `Dangling node ${id}`);
        assert.ok(!active.has(id), `Cycle at ${id}`);
        if (visited.has(id)) return;
        active.add(id);
        for (const value of Object.values(graph[id].inputs)) if (Array.isArray(value)) visit(value[0]);
        active.delete(id); visited.add(id);
    };
    for (const id of Object.keys(graph)) visit(id);
};

test('Advanced starts in FL2V with source sampling, latent upscale and all editable refine defaults', () => {
    const options = api.defaultAdvancedH3Options(), graph = build(options);
    assert.equal(options.advanced.mode, 'fl2v');
    assert.equal(options.advanced.stageOrder, 'ltx-first');
    assert.equal(options.steps, 4);
    assert.equal(options.sampler, 'seeds_2');
    assert.equal(options.seed, 205835701017573);
    assert.equal(options.previewFps, 24);
    assert.equal(options.previewFrames, 1024);
    assert.equal(graph['184'].class_type, 'MiniMaxH3ImageToVideo');
    assert.equal(graph['190'].class_type, 'BasicScheduler');
    assert.equal(graph['190'].inputs.scheduler, 'beta');
    assert.equal(graph['advanced-latent'].inputs['mode.scale'], 1.25);
    assert.equal(graph['advanced-latent'].inputs.enable_temporal_chunking, false);
    assert.equal(graph['advanced-latent-sigmas'].inputs.sigmas, '0.9035, 0.6316, 0.3158, 0.0000');
    assert.equal(options.advanced.nodes['ltx-sigmas'].sigmas, '0.5, 0.3, 0.1, 0.0');
    assert.equal(options.advanced.nodes['ltx-sampler'].sampler_name, 'lcm');
    assert.equal(options.advanced.nodes['ltx-model'].unet_name, 'ltx-2.5-22b-distilled-transformer-nvfp4.safetensors');
    assert.equal(options.advanced.nodes['ltx-lora'].strength_model, 0.6);
    assert.equal(options.advanced.nodes['ltx-lora'].lora_name, 'LTX2_camera_control\\ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors');
    assert.equal(graph['advanced-rtx'], undefined);
    assert.equal(graph['advanced-ltx-sample'], undefined);
    assert.equal(graph['185'], undefined);
    assert.equal(graph['119'].inputs.bitrate, 15);
    assert.equal(graph['119'].inputs.filename_prefix, `${api.resolveH3FilenamePrefix(options.filenamePrefix)}Final_LatentUpscale_`);
    assert.doesNotMatch(graph['119'].inputs.filename_prefix, /%date|:/);
    assert.equal(options.filenamePrefix, 'MrWeaz/%date:yyyy-MM-dd%/Advanced_');
    assert.deepEqual(options.advanced.nodes['ltx-decode'], { tile_size: 256, overlap: 64, temporal_size: 64, temporal_overlap: 4 });
    assertDAG(graph);
});

test('LTX refinement uses the default details LoRA but preserves a different user-selected LoRA', () => {
    const options = api.defaultAdvancedH3Options();
    options.advanced.ltxRefine = true;
    assert.equal(build(options)['advanced-ltx-lora'].inputs.lora_name, options.advanced.nodes['ltx-lora'].lora_name);
    options.advanced.nodes['ltx-lora'].lora_name = 'LTX2\\test-refine.safetensors';
    assert.equal(build(options)['advanced-ltx-lora'].inputs.lora_name, 'LTX2\\test-refine.safetensors');
    options.advanced.ltxLora = false;
    assert.equal(build(options)['advanced-ltx-lora'], undefined);
});

test('the default tiled preset matches LTX Director while low-VRAM remains a separate smaller-chunk choice', () => {
    const director = readFileSync(new URL('../components/LtxDirectorPanel.tsx', import.meta.url), 'utf8');
    for (const [key, state] of Object.entries({ tile_size: 'vaeTileSize', overlap: 'vaeOverlap', temporal_size: 'vaeTemporalSize', temporal_overlap: 'vaeTemporalOverlap' })) {
        const match = director.match(new RegExp(`\\[${state},[^\\n]*useState\\((\\d+)\\)`));
        assert.ok(match, state);
        assert.equal(api.ADVANCED_LTX_DECODE_DIRECTOR[key], Number(match[1]), key);
    }
    assert.ok(api.ADVANCED_LTX_DECODE_8GB.temporal_size < api.ADVANCED_LTX_DECODE_DIRECTOR.temporal_size);
});

test('legacy saves without an order retain the exact latent-first graph', () => {
    const options = api.defaultAdvancedH3Options();
    Object.assign(options.advanced, { ltxRefine: true, rtxUpscale: true });
    delete options.advanced.stageOrder;
    const legacy = build(options);
    options.advanced.stageOrder = 'latent-first';
    assert.deepEqual(build(options), legacy);
});

test('both orders and video finishing combinations form valid DAGs, with no first-pass sampler for videos', () => {
    const dependsOn = (graph, start, target, visited = new Set()) => {
        if (start === target) return true;
        if (visited.has(start)) return false;
        visited.add(start);
        return Object.values(graph[start].inputs).some(value => Array.isArray(value) && dependsOn(graph, value[0], target, visited));
    };
    for (const inputMode of ['generate', 'video']) for (const stageOrder of ['latent-first', 'ltx-first'])
        for (const latentUpscale of [false, true]) for (const ltxRefine of [false, true]) for (const rtxUpscale of [false, true])
            for (const vramClear of [false, true]) for (const interpolation of [false, true]) for (const saveIntermediateVideos of [false, true]) {
                const options = api.defaultAdvancedH3Options();
                options.preview = false;
                Object.assign(options.advanced, { inputMode, stageOrder, latentUpscale, ltxRefine, rtxUpscale, vramClear, interpolation, saveIntermediateVideos });
                const input = inputMode === 'video' ? draft([ref('video', 1)], '') : draft();
                if (inputMode === 'video' && !latentUpscale && !ltxRefine && !rtxUpscale && !interpolation) {
                    assert.throws(() => build(options, input), /at least one/);
                    continue;
                }
                const graph = build(options, input);
                assertDAG(graph);
                if (inputMode === 'video') {
                    assert.equal(graph['153'], undefined);
                    assert.equal(graph['185'], undefined);
                    assert.equal(graph['advanced-save-first-pass'], undefined);
                    assert.equal(graph['advanced-source-video'].inputs.force_rate, 0);
                    assert.deepEqual(graph['119'].inputs.frame_rate, interpolation ? options.advanced.nodes.interpolate.target_fps : ['advanced-source-info', 5]);
                    assert.deepEqual(graph['119'].inputs.audio, ['advanced-source-video', 2]);
                    if (!latentUpscale) for (const id of ['135', '127', '121', '141', 'advanced-latent-conditioning']) assert.equal(graph[id], undefined, id);
                }
                if (latentUpscale && ltxRefine) {
                    if (stageOrder === 'ltx-first') {
                        assert.ok(dependsOn(graph, 'advanced-h3-encode', 'advanced-ltx-decode'));
                        assert.ok(!dependsOn(graph, 'advanced-ltx-decode', 'advanced-latent-sample'));
                        assert.deepEqual(graph['advanced-latent'].inputs.latent, ['advanced-h3-encode', 0]);
                    } else assert.ok(dependsOn(graph, 'advanced-ltx-decode', 'advanced-latent-sample'));
                }
                if (rtxUpscale) {
                    assert.deepEqual(graph['119'].inputs.images, ['advanced-rtx', 0]);
                    if (latentUpscale) assert.ok(dependsOn(graph, 'advanced-rtx', 'advanced-latent-sample'));
                    if (ltxRefine) assert.ok(dependsOn(graph, 'advanced-rtx', 'advanced-ltx-decode'));
                }
                const saves = Object.keys(graph).filter(id => id.startsWith('advanced-save-'));
                if (!saveIntermediateVideos) assert.equal(saves.length, 0);
                if (saveIntermediateVideos && latentUpscale && ltxRefine) {
                    const first = stageOrder === 'ltx-first' ? 'advanced-save-ltx' : 'advanced-save-latent-upscale';
                    assert.ok(graph[first]);
                    const later = stageOrder === 'ltx-first' ? 'advanced-latent-sample' : 'advanced-ltx-sample';
                    assert.ok(dependsOn(graph, later, first), 'The earlier stage must save before the later sampler.');
                }
            }
});

test('Library video actions read durable source media and enable only the requested stage', async () => {
    for (const stage of ['latent', 'ltx']) {
        const item = { id: 42, name: 'Saved source', mediaType: 'video', media: 'blob:expired',
            assetRefs: { media: { id: 'source', mimeType: 'video/webm', size: 5 } } };
        const before = structuredClone(item);
        let reads = 0;
        const { draft: input, options } = await api.restoreAdvancedVideoLibraryItem(item, stage, async asset => {
            reads++; assert.equal(asset.id, 'source'); return new Blob(['video'], { type: 'video/webm' });
        });
        assert.equal(reads, 1);
        assert.deepEqual(item, before);
        assert.equal(options.advanced.inputMode, 'video');
        assert.equal(options.advanced.latentUpscale, stage === 'latent');
        assert.equal(options.advanced.ltxRefine, stage === 'ltx');
        assert.equal(options.advanced.rtxUpscale, false);
        assert.equal(input.references[0].file.type, 'video/webm');
        Object.assign(options, { steps: NaN, duration: NaN, frameRate: NaN, seed: NaN });
        const graph = build(options, input);
        assertDAG(graph);
        assert.equal(graph['153'], undefined);
        if (stage === 'ltx') {
            Object.assign(options, { model: '', clip: '', videoVae: '', audioVae: '', steps: NaN });
            assertDAG(build(options, input));
        }
    }
    await assert.rejects(api.restoreAdvancedVideoLibraryItem({ mediaType: 'video', media: '' }, 'ltx'), /no saved media/);
    await assert.rejects(api.restoreAdvancedVideoLibraryItem({ mediaType: 'image' }, 'ltx'), /Library video/);
    await assert.rejects(api.restoreAdvancedVideoLibraryItem({ mediaType: 'video', assetRefs: { media: {} } }, 'ltx', async () => new Blob(['x'], { type: 'text/html' })), /not a non-empty video/);
    const generic = { id: 7, mediaType: 'video', minimaxH3Options: { filename: 'source.webm' }, assetRefs: { media: { mimeType: 'application/octet-stream' } } };
    const recovered = await api.restoreAdvancedVideoLibraryItem(generic, 'ltx', async () => new Blob(['video'], { type: 'application/octet-stream' }));
    assert.equal(recovered.draft.references[0].file.type, 'video/webm');
});

test('standard and tiled LTX decode preserve downstream saving and standard omits tile inputs', () => {
    for (const saveIntermediateVideos of [false, true]) for (const ltxDecodeMode of ['standard', 'tiled']) {
        const options = api.defaultAdvancedH3Options();
        Object.assign(options.advanced, { ltxRefine: true, rtxUpscale: true, saveIntermediateVideos, ltxDecodeMode });
        const graph = build(options);
        assertDAG(graph);
        const decode = graph['advanced-ltx-decode'];
        assert.equal(decode.class_type, ltxDecodeMode === 'standard' ? 'VAEDecode' : 'VAEDecodeTiled');
        assert.deepEqual(decode.inputs.samples, ['advanced-ltx-separate', 0]);
        assert.deepEqual(decode.inputs.vae, ['advanced-ltx-vae', 0]);
        assert.equal(decode.inputs.tile_size, ltxDecodeMode === 'standard' ? undefined : 256);
        if (ltxDecodeMode === 'standard') assert.deepEqual(Object.keys(decode.inputs).sort(), ['samples', 'vae']);
        assert.deepEqual(graph['119'].inputs.images, ['advanced-rtx', 0]);
    }
    const options = api.defaultAdvancedH3Options();
    options.advanced.ltxDecodeMode = 'invalid';
    assert.throws(() => build(options), /Select Standard or Tiled/);
    delete options.advanced.ltxDecodeMode;
    options.advanced.ltxRefine = true;
    assert.equal(build(options)['advanced-ltx-decode'].class_type, 'VAEDecodeTiled');
});

test('all 128 mode/stage/checkpoint combinations save only active stages and end at the final active stage', () => {
    for (const mode of ['fl2v', 'ref2v']) for (const latentUpscale of [false, true]) for (const ltxRefine of [false, true])
        for (const rtxUpscale of [false, true]) for (const vramClear of [false, true]) for (const interpolation of [false, true]) for (const saveIntermediateVideos of [false, true]) {
            const options = api.defaultAdvancedH3Options();
            Object.assign(options.advanced, { stageOrder: 'latent-first', mode, latentUpscale, ltxRefine, rtxUpscale, vramClear, interpolation, saveIntermediateVideos });
            const graph = build(options);
            assertDAG(graph);
            assert.equal(!!graph['advanced-latent'], latentUpscale);
            assert.equal(!!graph['advanced-ltx-sample'], ltxRefine);
            assert.equal(!!graph['advanced-rtx'], rtxUpscale);
            assert.equal(!!graph['advanced-clear-before'], vramClear);
            assert.equal(!!graph['advanced-interpolate'], interpolation);
            const checkpointImages = saveIntermediateVideos && (interpolation || ltxRefine || rtxUpscale)
                ? [`advanced-after-${latentUpscale ? 'latent-upscale' : 'first-pass'}`, 1] : ['133', 0];
            const beforeRefine = vramClear ? ['advanced-clear-before', 1] : interpolation ? ['advanced-interpolate', 0] : checkpointImages;
            const ltxImages = saveIntermediateVideos && rtxUpscale ? ['advanced-after-ltx', 1] : ['advanced-ltx-decode', 0];
            const refined = ltxRefine ? vramClear ? ['advanced-clear-after', 1] : ltxImages : beforeRefine;
            assert.deepEqual(graph['119'].inputs.images, rtxUpscale ? ['advanced-rtx', 0] : refined);
            if (rtxUpscale) assert.deepEqual(graph['advanced-rtx'].inputs.images, refined);
            if (ltxRefine) {
                assert.deepEqual(graph['advanced-ltx-preprocess'].inputs.image, beforeRefine, 'RTX must never feed refine.');
                assert.deepEqual(graph['advanced-ltx-empty-audio'].inputs.frames_number, ['advanced-ltx-size', 2]);
                assert.equal(graph['advanced-ltx-conditioning'].inputs.frame_rate, interpolation ? 60 : 24);
                if (vramClear) assert.deepEqual(graph['advanced-clear-after'].inputs.image_pass, ltxImages, 'Cleanup follows real images, including an enabled checkpoint barrier.');
            }
            assert.equal(graph['119'].inputs.frame_rate, interpolation ? 60 : 24);
            const checkpoints = saveIntermediateVideos ? Number(latentUpscale) + Number(interpolation || ltxRefine || rtxUpscale) + Number(ltxRefine && rtxUpscale) : 0;
            assert.equal(Object.values(graph).filter(node => node.class_type === 'VHS_VideoCombine').length, 1 + checkpoints);
            assert.equal(Object.values(graph).filter(node => node.class_type === 'ImpactExecutionOrderController').length, checkpoints);
            for (const [id, node] of Object.entries(graph).filter(([, node]) => node.class_type === 'VHS_VideoCombine')) {
                assert.equal(node.inputs.save_output, true);
                assert.doesNotMatch(node.inputs.filename_prefix, /%date|:/);
                assert.equal(node.inputs.format, options.format);
                if (id !== '119') {
                    const stage = id.replace('advanced-save-', '');
                    assert.deepEqual(graph[`advanced-after-${stage}`].inputs.signal, [id, 0], 'Advancing must depend on the completed save.');
                }
            }
            assert.deepEqual(graph['133'].inputs.samples, latentUpscale ? ['advanced-latent-sample', 0] : ['153', 0]);
            assert.deepEqual(graph['134'].inputs.samples, graph['133'].inputs.samples);
        }
});

test('full checkpoint saves use the correct pass/audio/FPS and are dependencies of later stages', () => {
    const options = api.defaultAdvancedH3Options();
    Object.assign(options.advanced, { stageOrder: 'latent-first', ltxRefine: true, rtxUpscale: true, interpolation: true });
    const graph = build(options);
    assert.deepEqual(graph['advanced-first-decode'].inputs.samples, ['153', 0]);
    assert.deepEqual(graph['advanced-first-audio'].inputs.samples, ['153', 0]);
    assert.deepEqual(graph['advanced-save-first-pass'].inputs.images, ['advanced-first-decode', 0]);
    assert.deepEqual(graph['advanced-save-first-pass'].inputs.audio, ['advanced-first-audio', 0]);
    assert.deepEqual(graph['advanced-separate'].inputs.av_latent, ['advanced-after-first-pass', 1]);
    assert.deepEqual(graph['advanced-save-latent-upscale'].inputs.images, ['133', 0]);
    assert.deepEqual(graph['advanced-save-latent-upscale'].inputs.audio, ['134', 0]);
    assert.deepEqual(graph['advanced-interpolate'].inputs.images, ['advanced-after-latent-upscale', 1]);
    assert.deepEqual(graph['advanced-save-ltx'].inputs.images, ['advanced-ltx-decode', 0]);
    assert.deepEqual(graph['advanced-save-ltx'].inputs.audio, ['advanced-ltx-source-audio-decode', 0]);
    assert.equal(graph['advanced-save-first-pass'].inputs.frame_rate, 24);
    assert.equal(graph['advanced-save-latent-upscale'].inputs.frame_rate, 24);
    assert.equal(graph['advanced-save-ltx'].inputs.frame_rate, 60);
    assert.equal(graph['119'].inputs.frame_rate, 60);
    assert.match(graph['119'].inputs.filename_prefix, /Final_RTX_$/);
    options.advanced.saveIntermediateVideos = false;
    const finalOnly = build(options);
    assert.equal(finalOnly['advanced-first-decode'], undefined);
    assert.equal(finalOnly['advanced-first-audio'], undefined);
    assert.equal(finalOnly['119'].inputs.filename_prefix, api.resolveH3FilenamePrefix(options.filenamePrefix));
    const silent = build({ ...options, generateAudio: false, advanced: { ...options.advanced, saveIntermediateVideos: true } });
    for (const node of Object.values(silent).filter(node => node.class_type === 'VHS_VideoCombine')) assert.equal(node.inputs.audio, undefined);
    const legacy = api.defaultAdvancedH3Options();
    delete legacy.advanced.saveIntermediateVideos;
    assert.ok(build(legacy)['advanced-save-first-pass'], 'Existing drafts get the new default without destructive migration.');
});

test('original soundtrack checkpoints retain the selected source and obey the global permanent/temporary output switch', () => {
    const audio = { ...ref('audio', 1), audioSelection: { start: 0, end: 3 } };
    const options = api.withH3OriginalAudio(api.defaultAdvancedH3Options(), audio.id, true);
    Object.assign(options.advanced, { stageOrder: 'latent-first', ltxRefine: true, rtxUpscale: true });
    const graph = build(options, draft([audio]));
    assert.equal(graph['advanced-first-audio'], undefined);
    assert.deepEqual(graph['advanced-save-first-pass'].inputs.audio, ['185', 15]);
    assert.deepEqual(graph['advanced-save-latent-upscale'].inputs.audio, ['185', 15]);
    assert.deepEqual(graph['advanced-ltx-source-audio'].inputs.audio, ['185', 15]);
    for (const node of Object.values(graph).filter(node => node.class_type === 'VHS_VideoCombine')) assert.equal(node.inputs.trim_to_audio, true);
    options.saveOutput = false;
    const temporary = build(options, draft([audio]));
    for (const node of Object.values(temporary).filter(node => node.class_type === 'VHS_VideoCombine')) assert.equal(node.inputs.save_output, false);
});

test('first/last frame slots stay stable and unsupported FL2V references are never silently dropped', () => {
    const options = api.defaultAdvancedH3Options();
    const images = [ref('image', 1), ref('image', 2)];
    const graph = build(options, draft(images, 'Between <Picture 1> and <Picture 2>.'));
    assert.deepEqual(graph['184'].inputs.first_frame, ['185', 0]);
    assert.deepEqual(graph['184'].inputs.last_frame, ['185', 1]);
    options.references['image-1'] = { enabled: false, useSoundtrack: false };
    const last = build(options, draft(images));
    assert.equal(last['184'].inputs.first_frame, undefined);
    assert.deepEqual(last['184'].inputs.last_frame, ['185', 0]);
    assert.throws(() => build(options, draft([ref('image', 3)])), /Switch to REF2V/);
    assert.throws(() => build(options, draft([ref('video', 1)])), /Switch to REF2V/);
    options.advanced.mode = 'ref2v';
    const refs = [ref('image', 1), ref('image', 2), ref('image', 3), ref('video', 1), ref('audio', 1), ref('audio', 2)];
    const reference = build(options, draft(refs, 'Film <Picture 3> with <Audio 2>.'));
    assert.equal(reference['184'].class_type, 'MiniMaxH3ReferenceToVideo');
    assert.deepEqual(reference['184'].inputs['ref_audios.ref_audio_1'], ['185', 16]);
    for (const kind of ['image', 'video', 'audio']) assert.throws(() => build(options, draft([...refs, ref(kind, kind === 'image' ? 4 : kind === 'video' ? 2 : 3)])), /supports at most/);
});

test('Boost, Turbo chain, preview and per-image noise create real nodes and complete bypasses', () => {
    const options = api.defaultAdvancedH3Options();
    options.advanced.boost = true;
    options.loras[0].enabled = true;
    options.advanced.imageNoise['1'] = true;
    const graph = build(options, draft([ref('image', 1)]));
    assert.deepEqual(graph['advanced-attention'].inputs.model, ['137', 0]);
    assert.deepEqual(graph['advanced-sol'].inputs.model, ['advanced-attention', 0]);
    assert.deepEqual(graph['141'].inputs.model, ['advanced-chunks', 0]);
    assert.deepEqual(graph['184'].inputs.first_frame, ['advanced-noise-1', 0]);
    assert.equal(graph['advanced-noise-1'].inputs.strength, 0.25);
    assertDAG(graph);
    options.useLoras = false; options.preview = false; options.advanced.comfyAttention = false; options.advanced.boost = false; options.advanced.imageNoise['1'] = false;
    const bypass = build(options);
    for (const id of ['137', '141', 'advanced-attention', 'advanced-sol', 'advanced-shift', 'advanced-chunks', 'advanced-noise-1']) assert.equal(bypass[id], undefined);
    assert.deepEqual(bypass['149'].inputs.model, ['135', 0]);
    options.advanced.imageNoise['3'] = true;
    assert.throws(() => build(options), /Image 3 requires/);
});

test('all latent and RTX resize modes use only their selected dynamic parameters', () => {
    for (const mode of ['scale by multiplier', 'target dimensions', 'megapixels']) {
        const options = api.defaultAdvancedH3Options();
        options.advanced.nodes.latent.mode = mode;
        options.advanced.rtxUpscale = true;
        options.advanced.nodes.rtx.resize_type = 'target dimensions';
        const graph = build(options);
        assert.equal(graph['advanced-latent'].inputs['mode.scale'] !== undefined, mode === 'scale by multiplier');
        assert.equal(graph['advanced-latent'].inputs['mode.width'] !== undefined, mode === 'target dimensions');
        assert.equal(graph['advanced-latent'].inputs['mode.megapixels'] !== undefined, mode === 'megapixels');
        assert.equal(graph['advanced-rtx'].inputs['resize_type.scale'], undefined);
        assert.equal(graph['advanced-rtx'].inputs['resize_type.width'], 1920);
    }
});

test('silent refine omits audio connections and rejects invalid settings without a fallback', () => {
    const options = api.defaultAdvancedH3Options();
    options.advanced.ltxRefine = true; options.generateAudio = false;
    const graph = build(options);
    assert.equal(graph['134'], undefined);
    assert.equal(graph['119'].inputs.audio, undefined);
    assert.equal(graph['advanced-ltx-source-audio'], undefined);
    assertDAG(graph);
    options.advanced.nodes.latent['mode.scale'] = NaN;
    assert.throws(() => build(options), /must be finite/);
    assert.throws(() => build({ ...options, advanced: undefined }), /reset Advanced/);
});

test('dynamic schema validation covers resize branches, numeric bounds and native codec choices', () => {
    const info = { Resize: { input: { required: { mode: ['COMFY_DYNAMICCOMBO_V3', { options: [
        { key: 'scale', inputs: { required: { scale: ['FLOAT', { min: 1, max: 4 }] } } },
    ] }] } } } };
    const workflow = value => ({ resize: { class_type: 'Resize', inputs: { mode: 'scale', 'mode.scale': value } } });
    assert.deepEqual(api.h3Choices(info, 'Resize', 'mode'), ['scale']);
    api.validateMinimaxH3Readiness(workflow(2), info);
    assert.throws(() => api.validateMinimaxH3Readiness(workflow(5), info), /outside.*limits/);
    assert.throws(() => api.validateMinimaxH3Readiness({ resize: { class_type: 'Resize', inputs: { mode: 'unknown' } } }, info), /unavailable/);
});
