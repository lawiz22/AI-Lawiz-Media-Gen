import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const bridge = readFileSync(new URL('./videoPromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const { outputText } = ts.transpileModule(bridge + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
export const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
export const ref = (kind, slot) => ({
    id: `${kind}-${slot}`, kind, slot, note: '',
    file: new File(['reference'], `${kind}-${slot}.${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}`, { type: `${kind}/${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}` }),
});
export const draft = (references = [ref('image', 1)]) => ({
    id: 'draft', workflow: 'reference', prompt: 'A scene with <Picture 1>.', references, aspect: '4:3', duration: 3, template: 'generation',
});
const build = (options = api.defaultMinimaxH3Options(), input = draft()) =>
    api.buildMinimaxH3Workflow(input, options, Object.fromEntries(input.references.map(ref => [ref.id, ref.file.name])));

test('filename dates expand locally before VHS saving without changing saved prefixes', () => {
    const prefix = 'MrWeaz/%date:yyyy-MM-dd%/Advanced_';
    assert.equal(api.resolveH3FilenamePrefix(prefix, new Date(2026, 0, 2, 23, 59)), 'MrWeaz/2026-01-02/Advanced_');
    assert.equal(api.resolveH3FilenamePrefix('%date:yyyy-MM-dd%\\%date:yyyy-MM-dd%\\clip', new Date(2026, 9, 21)), '2026-10-21\\2026-10-21\\clip');
    assert.equal(api.resolveH3FilenamePrefix('video/H3'), 'video/H3');
    const options = { ...api.defaultMinimaxH3Options(), filenamePrefix: prefix };
    assert.equal(build(options)['119'].inputs.filename_prefix, api.resolveH3FilenamePrefix(prefix));
    assert.equal(options.filenamePrefix, prefix);
    for (const invalid of ['%date:yyyy/MM/dd%/clip', '%date:yyyy-MM-dd/clip']) {
        assert.throws(() => build({ ...options, filenamePrefix: invalid }), /Unsupported filename date template/);
    }
});

test('uploaded VHS source filenames bypass stale file catalogs without bypassing format validation', () => {
    const graph = { source: { class_type: 'VHS_LoadVideo', inputs: { video: 'new-upload.mp4', format: 'None' } } };
    const info = { VHS_LoadVideo: { input: { required: { video: [['old-file.mp4']] }, optional: { format: [['None', 'LTXV']] } } } };
    assert.doesNotThrow(() => api.validateMinimaxH3Readiness(graph, info));
    graph.source.inputs.format = 'invalid';
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /format/);
});

test('plain prompts need no references or prompt generator and retain generated output audio', () => {
    const input = { ...draft([]), prompt: 'A rainy street. Footsteps and quiet dialogue.' };
    const graph = build(undefined, input);
    assert.equal(graph['185'], undefined, 'Plain prompting bypasses ReferencePack and any LLM request.');
    assert.equal(graph['184'].inputs.prompt, input.prompt);
    assert.equal(graph['186'].inputs.source, input.prompt);
    assert.deepEqual(graph['119'].inputs.audio, ['134', 0]);
    assert.ok(!Object.keys(graph['184'].inputs).some(key => key.startsWith('ref_') && key !== 'ref_image_size'));
    for (const node of Object.values(graph)) for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[value[0]], `Missing node ${value[0]}`);
    }
    assert.throws(() => build(undefined, { ...input, prompt: '' }), /prompt is required/);
    assert.throws(() => build(undefined, { ...input, prompt: 'Use <Picture 1>.' }), /disabled or missing/);
    const disabled = { ...api.defaultMinimaxH3Options(), references: { 'image-1': { enabled: false } } };
    assert.equal(build(disabled, { ...input, references: [ref('image', 1)] })['184'].inputs.prompt, input.prompt);
});

test('audio-only prompts wire standalone audio without any image or video input', () => {
    const graph = build(undefined, { ...draft([ref('audio', 2)]), prompt: 'A person dances to <Audio 2>.' });
    assert.equal(graph['185'].inputs.direction, 'A person dances to <Audio 1>.');
    assert.deepEqual(graph['184'].inputs['ref_audios.ref_audio_0'], ['185', 15]);
    assert.ok(!Object.keys(graph['184'].inputs).some(key => key.startsWith('ref_images.') || key.startsWith('ref_videos.')));
    assert.deepEqual(graph['119'].inputs.audio, ['134', 0]);
});

test('explicit lock configures native original output without overwriting other settings and never tolerates missing audio', () => {
    const original = { ...api.defaultMinimaxH3Options(), format: 'image/gif', frameRate: 30, pingpong: true, loopCount: 2 };
    const locked = api.withH3OriginalAudio(original, 'audio-1', true);
    assert.equal(locked.forceOriginalAudio, true);
    assert.equal(locked.format, 'video/h264-mp4');
    assert.equal(locked.frameRate, 24);
    assert.equal(locked.pingpong, false);
    assert.equal(locked.loopCount, 0);
    assert.equal(locked.formatOptions.trim_to_audio, true);
    assert.equal(locked.steps, original.steps);
    assert.equal(original.format, 'image/gif');
    assert.throws(() => build({ ...locked, originalAudioId: undefined }), /locked/);
    const unlocked = api.withH3OriginalAudio(locked, undefined, false);
    assert.deepEqual(build(unlocked)['119'].inputs.audio, ['134', 0]);
});

test('original track bypasses generated audio and uses the standalone socket, not its soundtrack-offset token', () => {
    const first = ref('audio', 1);
    const selected = { ...ref('audio', 3), audioSelection: { start: 4, end: 7 } };
    const input = { ...draft([ref('video', 1), selected, first]), prompt: 'Follow <Video 1> singing to <Audio 3>.' };
    const options = { ...api.defaultMinimaxH3Options(), originalAudioId: selected.id, previewAudio: true, conditionAudioVae: false, audioVae: '' };
    const graph = build(options, input);
    assert.deepEqual(graph['119'].inputs.audio, ['185', 16], 'Second enabled standalone audio is socket 16, although its compact token is Audio 3.');
    assert.equal(graph['119'].inputs.trim_to_audio, true);
    assert.equal(graph['134'], undefined);
    assert.equal(graph['122'], undefined);
    assert.equal(graph['141'].inputs.audio_vae, undefined, 'Generated preview sound is also bypassed.');
    assert.match(graph['185'].inputs.direction, /<Audio 3>/);
    options.references[first.id] = { enabled: false, useSoundtrack: false };
    const compact = build(options, input);
    assert.deepEqual(compact['119'].inputs.audio, ['185', 15]);
    assert.match(compact['185'].inputs.direction, /<Audio 2>/);
    assert.equal(input.prompt, 'Follow <Video 1> singing to <Audio 3>.');
});

test('original track rejects missing/disabled sources, unapplied passages, timing and unsupported output changes', () => {
    const audio = { ...ref('audio', 1), audioSelection: { start: 4, end: 7 } };
    const input = { ...draft([audio, ref('image', 1)]), prompt: 'A singer <Picture 1>.' };
    const options = { ...api.defaultMinimaxH3Options(), originalAudioId: audio.id };
    for (const originalAudioId of ['', 'missing', 'image-1']) assert.throws(() => build({ ...options, originalAudioId }, input), /audio/i);
    assert.throws(() => build({ ...options, references: { [audio.id]: { enabled: false, useSoundtrack: false } } }, input), /audio/i);
    assert.throws(() => build(options, { ...input, references: [{ ...audio, audioSelection: undefined }, ref('image', 1)] }), /Apply an audio passage/);
    assert.throws(() => build({ ...options, duration: 4 }, input), /duration must match/);
    for (const audioSelection of [{ start: NaN, end: 3 }, { start: 2, end: 1 }, { start: -1, end: 2 }]) {
        assert.throws(() => build(options, { ...input, references: [{ ...audio, audioSelection }, ref('image', 1)] }), /boundaries/);
    }
    for (const patch of [{ format: 'image/gif' }, { frameRate: 30 }, { pingpong: true }, { loopCount: 1 }]) {
        assert.throws(() => build({ ...options, ...patch }, input), /H.264 MP4/);
    }
    assert.deepEqual(build({ ...options, generateAudio: false }, input)['119'].inputs.audio, ['185', 15]);
});

test('current reviewed lyrics remap once; advancing a passage blocks reuse until reviewed', () => {
    const audio = { ...ref('audio', 3), audioSelection: { start: 0, end: 3 } };
    audio.original = audio.file;
    audio.lyrics = { enabled: true, text: 'one two three', source: api.audioLyricsSource(audio) };
    const input = { ...draft([audio]), prompt: 'Singer follows <Audio 3>.' };
    const options = api.defaultMinimaxH3Options();
    const graph = build(options, input);
    assert.match(graph['185'].inputs.direction, /one two three/);
    assert.ok(!graph['185'].inputs.direction.includes('<Audio 3>'), 'Both scene and appended requirements use the compact token.');
    audio.audioSelection = { start: 3, end: 6 };
    assert.throws(() => build(options, input), /previous|stale|passage/i);
    audio.lyrics = { ...audio.lyrics, source: api.audioLyricsSource(audio) };
    assert.doesNotThrow(() => build(options, input));
    audio.lyrics.enabled = false; audio.audioSelection = { start: 6, end: 9 };
    assert.doesNotThrow(() => build(options, input));
});

test('original mode covers the full audio before trimming, even just above a native frame-grid boundary', () => {
    const seconds = 73.2 / 24;
    assert.equal(api.h3FrameCount(seconds), 73, 'Legacy nearest-frame behavior is preserved.');
    assert.equal(api.h3FrameCount(seconds, true), 90);
    const audio = { ...ref('audio', 1), audioSelection: { start: 0, end: seconds } };
    const options = { ...api.defaultMinimaxH3Options(), duration: seconds, originalAudioId: audio.id };
    const graph = build(options, { ...draft([audio]), prompt: 'A singer.' });
    assert.equal(graph['177'].inputs.expression, '90');
    assert.ok(Number(graph['177'].inputs.expression) / 24 >= seconds);
    assert.deepEqual(graph['184'].inputs.length, ['177', 1]);
});

test('last frame replaces only Picture 1, retaining its identity, role and restorable original', () => {
    const first = ref('image', 1);
    first.original = first.file; first.note = 'Keep the same singer';
    const others = [ref('image', 2), ref('audio', 1)];
    const frame = new File(['frame PNG'], 'last.png', { type: 'image/png' });
    const replaced = api.replaceH3FirstPicture([first, ...others], frame);
    assert.equal(replaced[0].id, first.id);
    assert.equal(replaced[0].note, first.note);
    assert.equal(replaced[0].file, frame);
    assert.equal(replaced[0].original, first.original);
    assert.equal(first.file, first.original, 'The existing draft is not mutated.');
    assert.equal(replaced[1], others[0]);
    assert.equal(replaced[2], others[1]);
    const created = api.replaceH3FirstPicture(others, frame);
    assert.equal(created.length, 3);
    assert.equal(created[2].kind, 'image');
    assert.equal(created[2].slot, 1);
    assert.equal(created[2].original, frame);
    assert.throws(() => api.replaceH3FirstPicture(others, new File([], 'empty.png', { type: 'image/png' })), /non-empty PNG/);
});

test('supplied REF2V settings and wiring are preserved without copied credentials or local example media', () => {
    const options = api.defaultMinimaxH3Options();
    const graph = build(options);
    assert.deepEqual(graph['115'].inputs, { aspect_ratio: '4:3 (Standard)', megapixels: 0.4, multiple: 32 });
    assert.equal(graph['132'].inputs.value, 3);
    assert.equal(graph['135'].inputs.unet_name, 'h3ErosMax_beta5_fp8.safetensors');
    assert.equal(graph['127'].inputs.type, 'minimax');
    assert.equal(graph['121'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors');
    assert.equal(graph['122'].inputs.vae_name, 'minimax_h3_audio_vae_fp32.safetensors');
    assert.equal(graph['150'].inputs.sampler_name, 'seeds_2');
    assert.deepEqual(graph['190'].inputs, { model: ['141', 0], steps: 4, alpha: 0.6, beta: 0.6 });
    assert.deepEqual(graph['189'].inputs, { sigmas: ['190', 0], steps: 2, start_at_sigma: 0.8, end_at_sigma: 0, spacing: 'linear' });
    assert.deepEqual(graph['153'].inputs.latent_image, ['184', 1]);
    assert.deepEqual(graph['184'].inputs.clip, ['127', 0]);
    assert.deepEqual(graph['184'].inputs.prompt, ['185', 18]);
    assert.deepEqual(graph['133'].inputs.samples, ['153', 0]);
    assert.deepEqual(graph['134'].inputs.samples, ['153', 0]);
    assert.equal(graph['119'].inputs.crf, 12);
    assert.equal(graph['119'].inputs.save_metadata, false);
    assert.equal(graph['119'].inputs.save_output, true);
    assert.deepEqual(graph['141'].inputs.preview_frames, ['177', 1]);
    assert.equal(graph['141'].inputs.tiny_vae, 'taeh3.safetensors');
    assert.equal(graph['185'].inputs.prompt_provider, 'none');
    assert.equal(graph['185'].inputs.openrouter_api_key, '');
    assert.ok(!JSON.stringify(graph).includes('sk-or-'));
    assert.ok(!JSON.stringify(graph).includes('Reference Sheet.png'));
    assert.equal(options.loras.length, 6);
    assert.ok(options.loras.every(lora => !lora.enabled));
    assert.equal(graph['137'], undefined, 'An all-disabled LoRA loader is safely bypassed.');
});

test('resolution matches installed ResolutionSelector binary megapixels and Python banker rounding', () => {
    assert.deepEqual(api.h3Resolution({ aspect: '4:3 (Standard)', megapixels: 0.4, multiple: 32 }), { width: 736, height: 576 });
    assert.deepEqual(api.h3Resolution({ aspect: '1:1 (Square)', megapixels: 1, multiple: 32 }), { width: 1024, height: 1024 });
    assert.equal(api.h3FrameCount(3), 73);
    assert.equal(api.h3FrameCount(10), 243);
    assert.equal(api.h3FrameCount(5 / 24), 5);
    for (const seconds of [0, NaN, Infinity, 60.1]) assert.throws(() => api.h3FrameCount(seconds), /duration/);
    assert.throws(() => api.h3Resolution({ aspect: 'invalid', megapixels: 1, multiple: 32 }), /resolution/);
});

test('stable generator tokens remap in one pass to compact H3 slots with video soundtrack audio offsets', () => {
    const references = [ref('audio', 2), ref('image', 4), ref('video', 2), ref('image', 2), ref('video', 1)];
    const input = { ...draft(references), prompt: '<Picture 2> + <Picture 4> follow <Video 2> and <Video 1> with <Audio 2>.' };
    const options = api.defaultMinimaxH3Options();
    options.references['video-2'] = { enabled: true, useSoundtrack: false };
    const plan = api.planH3References(input, options);
    assert.deepEqual(plan.references.map(item => item.id), ['image-2', 'image-4', 'video-1', 'video-2', 'audio-2']);
    assert.equal(plan.prompt, '<Picture 1> + <Picture 2> follow <Video 2> and <Video 1> with <Audio 2>.');
    const graph = build(options, input);
    const refs = JSON.parse(graph['185'].inputs.references_json).references;
    assert.equal(refs[2].use_soundtrack, true);
    assert.equal(refs[3].use_soundtrack, false);
    assert.deepEqual(graph['184'].inputs['ref_images.ref_image_1'], ['185', 1]);
    assert.deepEqual(graph['184'].inputs['ref_videos.ref_video_1'], ['185', 10]);
    assert.deepEqual(graph['184'].inputs['ref_video_audios.ref_video_audio_0'], ['185', 12]);
    assert.equal(graph['184'].inputs['ref_video_audios.ref_video_audio_1'], undefined);
    assert.deepEqual(graph['184'].inputs['ref_audios.ref_audio_0'], ['185', 15]);
    assert.equal(input.prompt.includes('<Picture 4>'), true, 'The source prompt must not be mutated.');
    options.references['image-4'] = { enabled: false, useSoundtrack: false };
    assert.throws(() => api.planH3References(input, options), /disabled or missing/);
});

test('each optional branch is actually bypassed and output audio can be removed independently of references', () => {
    const options = { ...api.defaultMinimaxH3Options(), preview: false, extendSigmas: false, generateAudio: false, conditionAudioVae: false, conditionVideoVae: false, displayPrompt: false, useLoras: false };
    const graph = build(options);
    for (const id of ['141', '137', '189', '134', '122', '186']) assert.equal(graph[id], undefined);
    assert.deepEqual(graph['149'].inputs.model, ['135', 0]);
    assert.deepEqual(graph['153'].inputs.sigmas, ['190', 0]);
    assert.equal(graph['119'].inputs.audio, undefined);
    assert.equal(graph['184'].inputs.audio_vae, undefined);
    assert.equal(graph['184'].inputs.vae, undefined);
    assert.ok(graph['121'], 'Output decoding still requires the video VAE.');
    const preview = build({ ...options, preview: true, previewAllFrames: false, previewFrames: 12, previewAudio: true, previewUseVae: true });
    assert.equal(preview['141'].inputs.preview_frames, 12);
    assert.deepEqual(preview['141'].inputs.audio_vae, ['122', 0]);
    assert.deepEqual(preview['141'].inputs.vae, ['121', 0]);
    assert.ok(preview['122']);
});

test('six LoRAs preserve order/strength and patched CLIP is opt-in, while disabled slots are omitted', () => {
    const options = api.defaultMinimaxH3Options();
    options.loras = Array.from({ length: 6 }, (_, i) => ({ enabled: true, name: `lora-${i}.safetensors`, strength: i / 10 }));
    const graph = build(options);
    assert.equal(Object.keys(graph['137'].inputs).filter(name => name.startsWith('lora_')).length, 6);
    assert.deepEqual(graph['137'].inputs.lora_6, { on: true, lora: 'lora-5.safetensors', strength: 0.5 });
    assert.deepEqual(graph['190'].inputs.model, ['137', 0]);
    assert.deepEqual(graph['184'].inputs.clip, ['127', 0]);
    assert.deepEqual(build({ ...options, useLoraClip: true })['184'].inputs.clip, ['137', 1]);
    options.loras[0].enabled = false;
    assert.equal(build(options)['137'].inputs.lora_1.lora, 'lora-1.safetensors');
    assert.equal(build(options)['137'].inputs.lora_6, undefined);
    assert.throws(() => build({ ...options, loras: [...options.loras, options.loras[0]] }), /six LoRAs/);
    assert.throws(() => build({ ...options, loras: [{ enabled: true, name: '', strength: 1 }] }), /Select a file/);
});

test('old and V3 node schemas expose models and all format-dependent output widgets', () => {
    const info = {
        UNETLoader: { input: { required: { unet_name: [['a.safetensors', 'b.safetensors']] } } },
        ModelPreviewOverrideKJ: { input: { optional: { tiny_vae: ['COMBO', { options: ['none', 'taeh3.safetensors'] }] } } },
        VHS_VideoCombine: { input: { required: { format: [['video/h264-mp4'], { formats: { 'video/h264-mp4': [['pix_fmt', ['yuv420p']], ['crf', 'INT', { default: 12, min: 0, max: 100 }], ['save_metadata', 'BOOLEAN', { default: true }]] } }] } } },
    };
    assert.deepEqual(api.h3Choices(info, 'UNETLoader', 'unet_name'), ['a.safetensors', 'b.safetensors']);
    assert.deepEqual(api.h3Choices(info, 'ModelPreviewOverrideKJ', 'tiny_vae'), ['none', 'taeh3.safetensors']);
    assert.deepEqual(api.h3FormatWidgets(info, 'video/h264-mp4').map(widget => widget.name), ['pix_fmt', 'crf', 'save_metadata']);
    assert.deepEqual(api.h3FormatWidgets(null, 'none'), []);
});

test('readiness rejects missing optional nodes only when enabled and invalid file/format/numeric selections', () => {
    const options = api.defaultMinimaxH3Options();
    const graph = build(options);
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
    assert.doesNotThrow(() => api.validateMinimaxH3Readiness(graph, info));
    delete info.ModelPreviewOverrideKJ;
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /Missing ComfyUI nodes/);
    assert.doesNotThrow(() => api.validateMinimaxH3Readiness(build({ ...options, preview: false }), info));
    info.ModelPreviewOverrideKJ = {};
    info.UNETLoader = { input: { required: { unet_name: [['other.safetensors']] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /unavailable/);
    info.UNETLoader = { input: { required: { unet_name: [[]] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /unavailable/);
    info.UNETLoader = {};
    const loraOptions = { ...options, loras: [{ enabled: true, name: 'missing.safetensors', strength: 1 }] };
    info['Power Lora Loader (rgthree)'] = {};
    info.LoraLoader = { input: { required: { lora_name: [[]] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(build(loraOptions), info), /LoRA.*not available/);
    info.VHS_VideoCombine = { input: { required: { format: [['video/h264-mp4'], { formats: { 'video/h264-mp4': [['crf', 'INT', { min: 0, max: 100 }]] } }] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(build({ ...options, formatOptions: { crf: 101 } }), info), /Invalid crf/);
    for (const patch of [{ seed: -1 }, { steps: 0 }, { alpha: NaN }, { maxReferenceEdge: Infinity }, { frameRate: 0 }, { previewQuality: 10 }]) assert.throws(() => build({ ...options, ...patch }), /Invalid/);
    assert.throws(() => build({ ...options, promptProvider: 'local' }), /API base/);
    assert.throws(() => api.buildMinimaxH3Workflow(draft(), options, {}), /Missing uploaded file/);
});
