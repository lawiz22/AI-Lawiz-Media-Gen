import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = source => {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const h3Source = readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const h3Url = transpile(h3Source);
const source = readFileSync(new URL('./characterSwapWorkflow.ts', import.meta.url), 'utf8')
    .replace(/^import type .*;\r?$/gm, '')
    .replace("from './minimaxH3Workflow'", `from '${h3Url}'`);
const api = await import(transpile(source));
const settings = () => api.defaultCharacterSwapSettings();
const plan = () => ({
    video: 'uploaded-guide.mp4', global_ref: 'uploaded-character.png', global_prompt: '',
    run: 'recursive', between_shots: 'free', shot_cache: 'output', shot_storage: 'lossless',
    second_pass: { enabled: false, mode: 'scale', scale: 1.25, width: 1280, height: 704, align: 32 },
    segs: [{ enabled: true, prompt: 'Specific shot override', chain: 'none' }],
});
const build = (overrides = {}, input = plan()) => api.buildCharacterSwapWorkflow(input, { ...settings(), ...overrides });
const links = graph => Object.values(graph).flatMap(node => Object.values(node.inputs).filter(Array.isArray));

test('source model defaults, two-LoRA order and H3 sampling links match the supplied graph', () => {
    const s = settings(), g = build();
    assert.equal(g['2'].inputs.unet_name, 'h3ErosMax_beta5_fp8.safetensors');
    assert.equal(g['1'].inputs.clip_name, 'minimaxH3_h3Comfy_nvfp4.safetensors');
    assert.equal(g['3'].inputs.vae_name, 'minimax_h3_video_vae_int8_convrot.safetensors');
    assert.equal(g['29'].inputs.vae_name, 'minimax_h3_audio_vae_fp32.safetensors');
    assert.equal(g['85'].inputs.clip_name, 'qwen3.5_9b_int8_convrot.safetensors');
    assert.deepEqual(g['9'].inputs, { model: ['2', 0], shift_video: 12, shift_audio: 3 });
    assert.deepEqual(g['58'].inputs, { attention: 'comfy kitchen attention', model: ['9', 0] });
    assert.deepEqual(g['1267'].inputs, { lora_name: s.characterLora, strength_model: 1, model: ['58', 0] });
    assert.deepEqual(g['64'].inputs, { lora_name: s.turboLora, strength_model: 1, model: ['1267', 0] });
    assert.equal(g['13'].inputs.noise_seed, 12347);
    assert.deepEqual(g['181'].inputs, { scheduler: 'simple', steps: 4, denoise: 1, model: ['64', 0] });
    assert.equal(g['15'].inputs.sampler_name, 'euler');
    assert.equal(g['11'].inputs.cfg, 1);
    assert.deepEqual(g['14'].inputs.latent_image, ['1177', 1]);
    assert.deepEqual(g['22'].inputs.av_latent, ['14', 0]);
    assert.deepEqual(g['45'].inputs.samples, ['22', 0]);
    assert.deepEqual(g['1283'].inputs.vlm, ['85', 0], 'Initialize the native planner VLM, not only conditioning.');
});

test('join streams full quality files and 751 is a file-path output sink, not a second encoder', () => {
    const g = build();
    assert.equal(g['1202'].inputs.save_to, 'mp4 file (long videos, low memory)');
    assert.equal(g['1202'].inputs.comparison, true);
    assert.equal(g['1202'].inputs.mp4_crf, 0);
    assert.deepEqual(g['1202'].inputs.audio, ['1283', 5]);
    assert.deepEqual(g['1202'].inputs.timeline, ['1283', 7]);
    assert.equal(g['751'].class_type, 'Display Any (rgthree)');
    assert.deepEqual(g['751'].inputs.source, ['1202', 4]);
    assert.ok(!Object.values(g).some(node => /BFSVideoCompare|VHS_VideoCombine/.test(node.class_type)));
    assert.ok(!Object.values(g).some(node => node.class_type.includes('Upscale')));
    assert.ok(!JSON.stringify(g).includes(settings().upscaleLora));
    for (const id of ['412', '1270', '1271', '1281', '1284', '1285', '1286']) assert.equal(g[id], undefined);
});

test('every generated node is reachable from the output and every link exists', () => {
    for (const secondPass of [false, true]) for (const enableBirefnet of [false, true]) {
        const p = plan();
        p.second_pass.enabled = secondPass;
        const g = build({ enableBirefnet }, p);
        const seen = new Set();
        const walk = id => {
            assert.ok(g[id], `Missing ${id}`);
            if (seen.has(id)) return;
            seen.add(id);
            Object.values(g[id].inputs).filter(Array.isArray).forEach(([parent]) => walk(parent));
        };
        walk('751');
        assert.equal(seen.size, Object.keys(g).length);
        assert.ok(links(g).every(([id, index]) => g[id] && Number.isInteger(index)));
    }
});

test('BiRefNet is default-on and disabling it prunes unpack, background removal, resize and repack', () => {
    const g = build(), off = build({ enableBirefnet: false });
    assert.deepEqual(g['1022'].inputs.image, ['1037', 1]);
    assert.equal(g['1022'].inputs.background_color, '#808080');
    assert.deepEqual(g['1038'].inputs.ref_image, ['1031', 0]);
    assert.deepEqual(g['1177'].inputs.shot, ['1038', 0]);
    for (const id of ['1037', '1022', '1031', '1038']) assert.equal(off[id], undefined);
    assert.deepEqual(off['1177'].inputs.shot, ['1283', 0]);
    assert.deepEqual(off['1202'].inputs.shots, ['1283', 0]);
});

test('fallback source 1151 is effective, explicit/global prompts win, and native host plan stays immutable', () => {
    const p = plan(), before = structuredClone(p);
    const g = build({}, p), native = JSON.parse(g['1283'].inputs.plan);
    assert.deepEqual(g['1283'].inputs.prompt, ['1151', 0]);
    assert.equal(g['1151'].inputs.value, api.CHARACTER_SWAP_FALLBACK_PROMPT);
    assert.equal(native.global_prompt, api.CHARACTER_SWAP_FALLBACK_PROMPT);
    assert.equal(build({}, { ...p, global_prompt: ' User global prompt ' })['1151'].inputs.value, ' User global prompt ');
    assert.equal(build({ prompt: 'Explicit override' }, { ...p, global_prompt: 'Global' })['1151'].inputs.value, 'Explicit override');
    assert.equal(build({ prompt: '  ' })['1151'].inputs.value, api.CHARACTER_SWAP_FALLBACK_PROMPT);
    assert.equal(native.run, 'recursive');
    assert.equal(native.between_shots, 'free');
    assert.equal(native.shot_cache, 'output');
    assert.deepEqual(native.segs, p.segs);
    assert.deepEqual(p, before);
    assert.ok(!JSON.stringify(g).includes('mondo'));
});

test('second pass creates a learned latent upscale plus real H3 sampler before decoding', () => {
    const p = plan();
    p.second_pass.enabled = true;
    const g = build({}, p);
    assert.equal(JSON.parse(g['1283'].inputs.plan).second_pass.enabled, true);
    assert.equal(g['1284'].class_type, 'MMH3LatentUpscaleWithModelParams');
    assert.deepEqual(g['1284'].inputs.width, ['1283', 11]);
    assert.deepEqual(g['1284'].inputs.height, ['1283', 12]);
    assert.equal(g['1284'].inputs.model_name, settings().upscaleModel);
    assert.equal(g['1286'].class_type, 'MMH3UltimateUpscale');
    assert.deepEqual(g['1286'].inputs.latent, ['14', 1], 'Refine the clean first-pass output.');
    assert.deepEqual(g['1286'].inputs.latent_upscale_param, ['1284', 0]);
    assert.deepEqual(g['1286'].inputs.model, ['1281', 0]);
    assert.deepEqual(g['1286'].inputs.conditioning, ['1177', 0]);
    assert.deepEqual(g['1286'].inputs.sigmas, ['1285', 0]);
    assert.deepEqual(g['1281'].inputs.model, ['64', 0]);
    assert.equal(g['1281'].inputs.lora_name, settings().upscaleLora);
    assert.deepEqual(g['22'].inputs.av_latent, ['1286', 0]);
    assert.equal(g['1285'].inputs.denoise, 0.35);
    const fromNativePlan = build({}, { ...plan(), second_pass: { enabled: true } });
    assert.equal(JSON.parse(fromNativePlan['1283'].inputs.plan).second_pass.enabled, true);
    assert.equal(fromNativePlan['1286'].class_type, 'MMH3UltimateUpscale');
});

test('native planner second-pass checkbox is authoritative over deprecated settings activation', () => {
    for (const second_pass of [{ enabled: false }, {}, undefined, { enabled: 'true' }]) {
        const p = { ...plan(), second_pass };
        const before = structuredClone(p);
        const g = build({ secondPass: true }, p);
        assert.equal(JSON.parse(g['1283'].inputs.plan).second_pass.enabled, false);
        for (const id of ['1281', '1284', '1285', '1286']) assert.equal(g[id], undefined);
        assert.deepEqual(g['22'].inputs.av_latent, ['14', 0]);
        assert.ok(!JSON.stringify(g).includes(settings().upscaleLora));
        assert.deepEqual(p, before);
    }
    const g = build({ secondPass: false }, { ...plan(), second_pass: { enabled: true } });
    assert.ok(g['1286'], 'The native checkbox enables refinement even when the deprecated setting is false.');
});

test('all model overrides are explicit and invalid settings never select silent substitutes', () => {
    const g = build({ model: 'chosen.safetensors', seed: 2, steps: 6, cfg: 1.5, denoise: 0.8, comparison: false });
    assert.equal(g['2'].inputs.unet_name, 'chosen.safetensors');
    assert.equal(g['181'].inputs.steps, 6);
    assert.equal(g['181'].inputs.denoise, 0.8);
    assert.equal(g['1202'].inputs.comparison, false);
    assert.equal(build({ denoise: undefined })['181'].inputs.denoise, 1);
    for (const [key, value] of [['model', ''], ['videoVae', ''], ['steps', 0], ['steps', 1.2], ['seed', NaN], ['cfg', Infinity], ['denoise', 2], ['mp4Crf', -1]]) {
        assert.throws(() => build({ [key]: value }), /requires|invalid/);
    }
    assert.throws(() => build({ upscaleModel: '' }, { ...plan(), second_pass: { enabled: true } }), /requires upscaleModel/);
    assert.throws(() => build({}, { video: '' }), /source video/);
    assert.notEqual(settings(), settings());
});

const fakeInfo = g => Object.fromEntries(Object.values(g).map(node => [node.class_type, { input: { required: {} } }]));
test('readiness rejects missing nodes/models, required inputs, invalid links, output slots and cycles', () => {
    const g = build();
    api.validateCharacterSwapWorkflow(g, fakeInfo(g));
    assert.throws(() => api.validateCharacterSwapWorkflow(g, {}), /Missing ComfyUI nodes/);
    const info = fakeInfo(g);
    info.UNETLoader.input.required.unet_name = [['other.safetensors']];
    assert.throws(() => api.validateCharacterSwapWorkflow(g, info), /unavailable.*unet_name/);
    const required = fakeInfo(g);
    required.CFGGuider.input.required.missing = ['MODEL'];
    assert.throws(() => api.validateCharacterSwapWorkflow(g, required), /missing required input/);
    const broken = structuredClone(g);
    broken['751'].inputs.source = ['missing', 0];
    assert.throws(() => api.validateCharacterSwapWorkflow(broken, fakeInfo(g)), /missing node/);
    const cyclic = structuredClone(g);
    cyclic['2'].inputs.model = ['58', 0];
    assert.throws(() => api.validateCharacterSwapWorkflow(cyclic, fakeInfo(g)), /cycle/);
    const outputInfo = fakeInfo(g);
    outputInfo.BFSShotJoin.output = ['IMAGE'];
    assert.throws(() => api.validateCharacterSwapWorkflow(g, outputInfo), /invalid output/);
});

test('live schema/readiness and guarded /prompt validation without queuing any GPU execution', {
    skip: process.env.CHARACTER_SWAP_LIVE !== '1',
}, async () => {
    const base = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
    const response = await fetch(`${base}/object_info`);
    assert.ok(response.ok);
    const info = await response.json();
    for (const secondPass of [false, true]) {
        const p = plan();
        p.second_pass.enabled = secondPass;
        const g = build({}, p);
        api.validateCharacterSwapWorkflow(g, info);
        assert.equal(info[g['751'].class_type].output_node, true);
        assert.equal(info.BFSShotJoin.output_node, false);
        // /prompt has no dry-run API. An absent required sink input is a fail-closed
        // guard: Comfy validates its entire connected image graph, but cannot queue it.
        assert.ok(info.VHS_VideoCombine.input.required.frame_rate);
        g['751'] = {
            class_type: 'VHS_VideoCombine', inputs: {
                images: ['1202', 0], loop_count: 0, filename_prefix: 'NEVER_EXECUTE_VALIDATION',
                format: 'video/h264-mp4', pix_fmt: 'yuv420p', crf: 14, save_metadata: false,
                trim_to_audio: false, pingpong: false, save_output: true,
            },
        };
        const validation = await fetch(`${base}/prompt`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g }),
        });
        const result = await validation.json();
        assert.equal(validation.status, 400, JSON.stringify(result));
        assert.equal(result.prompt_id, undefined, 'Validation must never be queued.');
        assert.deepEqual(Object.keys(result.node_errors), ['751'], JSON.stringify(result));
        assert.ok(result.node_errors['751'].errors.every(error =>
            error.type === 'required_input_missing' && error.extra_info.input_name === 'frame_rate'), JSON.stringify(result));
    }
});
