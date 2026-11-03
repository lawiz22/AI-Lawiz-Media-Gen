import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const helpers = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
export const workflowURL = compile(source('./clothesSwitcherWorkflow.ts')
    .replace("import template from '../assets/clothesSwitcherWorkflow.json';", `const template = ${source('../assets/clothesSwitcherWorkflow.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`));
const api = await import(workflowURL);
test('default graph preserves all 29 updated source nodes, inputs, metadata and connections', () => {
    const settings = api.defaultClothesSwitcherSettings(), graph = api.buildClothesSwitcherWorkflow(settings, 'original.png');
    const expected = structuredClone(api.CLOTHES_SWITCHER_TEMPLATE); expected['139'].inputs.image = 'original.png';
    assert.equal(Object.keys(graph).length, 29); assert.deepEqual(graph, expected);
    assert.equal(settings.randomizeSeed, true);
    assert.deepEqual(graph['138'].inputs, { seed: 123247689436968, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        model: ['167', 0], positive: ['160', 0], negative: ['159', 0], latent_image: ['141', 0] });
    assert.deepEqual(graph['167'].inputs, { enable: true, model_type: 'Flux', warmup_steps: 0, skip_interval: 0, print_summary: true, model: ['166', 0] });
    assert.equal(graph['168'], undefined);
    assert.equal(graph['108'].inputs.text, ''); assert.equal(graph['109'].inputs.text, '');
    assert.equal(graph['106'].inputs.unet_name, 'flux2\\flux2Klein9BInt8_v10.safetensors');
    assert.equal(graph['107'].inputs.clip_name, 'qwen38BFluxKlein9BTE_38b.safetensors');
    assert.equal(graph['110'].inputs.vae_name, 'flux2-vae.safetensors');
    assert.deepEqual(graph['146'].inputs, { width: 1024, height: 1024, interpolation: 'lanczos', method: 'keep proportion', condition: 'always', multiple_of: 0, image: ['139', 0] });
    assert.equal(graph['148'].inputs.model, 'depth_anything_v2_vits_fp16.safetensors');
    assert.equal(graph['148'].inputs.precision, 'auto');
    assert.equal(graph['161'].inputs.low_threshold, 0.2); assert.equal(graph['161'].inputs.high_threshold, 0.7);
    assert.deepEqual(['144', '165', '166'].map(id => graph[id].inputs.strength_model), [1, 0.9, 0.8]);
    assert.equal(graph['9'].inputs.filename_prefix, 'Flux2-Klein-4b-base');
});
test('all 32 CacheDiT/LoRA activation combinations preserve ordered model links and prune inactive dependencies', () => {
    for (let mask = 0; mask < 32; mask++) {
        const settings = api.defaultClothesSwitcherSettings(); settings.nodes['168'].lora_name = 'fourth.safetensors';
        settings.nodes['167'].enable = !!(mask & 16);
        api.CLOTHES_SWITCHER_LORA_IDS.forEach((id, index) => { settings.loraEnabled[id] = !!(mask & (1 << index)); });
        const graph = api.buildClothesSwitcherWorkflow(settings, 'source.png');
        let parent = '106';
        for (const id of api.CLOTHES_SWITCHER_LORA_IDS) {
            if (settings.loraEnabled[id]) { assert.deepEqual(graph[id].inputs.model, [parent, 0]); parent = id; }
            else assert.equal(graph[id], undefined);
        }
        if (settings.nodes['167'].enable) { assert.deepEqual(graph['167'].inputs.model, [parent, 0]); parent = '167'; }
        else assert.equal(graph['167'], undefined);
        assert.deepEqual(graph['138'].inputs.model, [parent, 0]);
        assert.deepEqual(graph['150'].inputs.images, ['147', 0]); assert.deepEqual(graph['163'].inputs.images, ['161', 0]);
    }
});
test('disabled slots retain their selections but do not require missing LoRA files or CacheDiT nodes', () => {
    const settings = api.defaultClothesSwitcherSettings();
    settings.loraEnabled = Object.fromEntries(api.CLOTHES_SWITCHER_LORA_IDS.map(id => [id, false])); settings.nodes['167'].enable = false;
    const info = Object.fromEntries(Object.values(api.CLOTHES_SWITCHER_TEMPLATE).map(node => [node.class_type, { input: { required: {} } }]));
    delete info.CacheDiT_Model_Optimizer; delete info.LoraLoaderModelOnly;
    assert.doesNotThrow(() => api.buildClothesSwitcherWorkflow(settings, 'source.png', info));
    settings.loraEnabled['168'] = true;
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'source.png'), /Choose a model for enabled LoRA 4/);
});
test('legacy drafts/setups migrate without losing prior parameters and malformed modern settings remain errors', () => {
    const legacy = api.defaultClothesSwitcherSettings();
    delete legacy.version; delete legacy.loraEnabled; delete legacy.nodes['167']; delete legacy.nodes['168'];
    legacy.nodes['138'].seed = 99; legacy.nodes['108'].text = 'Existing prompt'; legacy.nodes['165'].strength_model = 0.4;
    const upgraded = api.upgradeClothesSwitcherSettings(legacy);
    assert.equal(upgraded.version, 2); assert.equal(upgraded.nodes['167'].enable, true);
    assert.equal(upgraded.loraEnabled['168'], false); assert.equal(upgraded.nodes['138'].seed, 99);
    assert.equal(upgraded.nodes['108'].text, 'Existing prompt'); assert.equal(upgraded.nodes['165'].strength_model, 0.4);
    assert.equal(legacy.version, undefined);
    delete upgraded.nodes['167'];
    assert.throws(() => api.upgradeClothesSwitcherSettings(upgraded), /Missing Clothes Switcher node/);
    const corrupt = api.defaultClothesSwitcherSettings(); delete corrupt.version;
    assert.throws(() => api.upgradeClothesSwitcherSettings(corrupt), /Invalid unversioned/);
});
test('named parameter presets round trip all switches and models without overwriting the current photo or positive prompt', () => {
    const settings = api.defaultClothesSwitcherSettings(); settings.nodes['108'].text = 'Do not store this prompt';
    settings.nodes['168'].lora_name = 'camera.safetensors'; settings.loraEnabled['168'] = true;
    settings.loraEnabled['165'] = false; settings.nodes['167'].warmup_steps = 3; settings.nodes['109'].text = 'bad jacket';
    const snapshot = api.clothesSwitcherParameterPreset(settings);
    assert.equal(snapshot.kind, 'parameters'); assert.equal(snapshot.input, undefined); assert.equal(snapshot.settings.nodes['108'].text, '');
    assert.equal(settings.nodes['108'].text, 'Do not store this prompt');
    const file = new File(['source'], 'current.png', { type: 'image/png' });
    const draft = { file, settings: api.defaultClothesSwitcherSettings() }; draft.settings.nodes['108'].text = 'Current jacket prompt';
    const restored = api.applyClothesSwitcherParameters(draft, snapshot.settings);
    assert.equal(restored.file, file); assert.equal(restored.settings.nodes['108'].text, 'Current jacket prompt');
    assert.equal(restored.settings.nodes['109'].text, 'bad jacket'); assert.equal(restored.settings.loraEnabled['165'], false);
    assert.equal(restored.settings.loraEnabled['168'], true); assert.equal(restored.settings.nodes['168'].lora_name, 'camera.safetensors');
    assert.equal(restored.settings.nodes['167'].warmup_steps, 3);
});
test('positive and negative conditioning retain original, depth and edge latents in order', () => {
    const graph = api.buildClothesSwitcherWorkflow(api.defaultClothesSwitcherSettings(), 'original.png');
    for (const [ids, prompt] of [[['140', '151', '160'], '108'], [['149', '156', '159'], '109']]) {
        assert.deepEqual(graph[ids[0]].inputs.conditioning, [prompt, 0]);
        assert.deepEqual(ids.map(id => graph[id].inputs.latent), [['141', 0], ['152', 0], ['162', 0]]);
        assert.deepEqual(graph[ids[1]].inputs.conditioning, [ids[0], 0]);
        assert.deepEqual(graph[ids[2]].inputs.conditioning, [ids[1], 0]);
    }
    assert.deepEqual(graph['150'].inputs.images, ['147', 0]); assert.deepEqual(graph['163'].inputs.images, ['161', 0]);
    assert.deepEqual(graph['154'].inputs.image_a, ['104', 0]); assert.deepEqual(graph['154'].inputs.image_b, ['139', 0]);
    assert.deepEqual(graph['154'].inputs.rgthree_comparer, { images: [] });
});
test('edits are verbatim and cannot mutate defaults or change reference links', () => {
    const settings = api.defaultClothesSwitcherSettings();
    settings.nodes['108'].text = 'Change only the jacket.\nKeep the rest.';
    settings.nodes['109'].text = 'different face'; settings.nodes['144'].strength_model = 0;
    const graph = api.buildClothesSwitcherWorkflow(settings, 'folder/upload.png');
    assert.equal(graph['108'].inputs.text, settings.nodes['108'].text); assert.equal(graph['144'].inputs.strength_model, 0);
    graph['106'].inputs.unet_name = 'edited';
    assert.equal(api.defaultClothesSwitcherSettings().nodes['108'].text, '');
    assert.notEqual(api.CLOTHES_SWITCHER_TEMPLATE['106'].inputs.unet_name, 'edited');
    settings.nodes['138'].model = ['106', 0];
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'original.png'), /Unknown Clothes Switcher setting/);
});
for (const [name, change] of [
    ['fractional steps', s => s.nodes['138'].steps = 1.5], ['unsafe seed', s => s.nodes['138'].seed = Number.MAX_SAFE_INTEGER + 1],
    ['negative CFG', s => s.nodes['138'].cfg = -1], ['invalid denoise', s => s.nodes['138'].denoise = 1.1],
    ['invalid resize', s => s.nodes['146'].width = 0], ['fractional alignment', s => s.nodes['146'].multiple_of = 0.5],
    ['inverted Canny', s => s.nodes['161'].low_threshold = 0.9], ['negative Canny', s => s.nodes['161'].low_threshold = -0.1],
    ['non-finite LoRA', s => s.nodes['165'].strength_model = NaN], ['wrong scalar type', s => s.nodes['138'].steps = '8'],
    ['missing node', s => delete s.nodes['148']], ['unknown node', s => s.nodes['999'] = {}],
    ['wrong CacheDiT flag type', s => s.nodes['167'].enable = 'false'], ['negative CacheDiT warmup', s => s.nodes['167'].warmup_steps = -1],
    ['fractional CacheDiT interval', s => s.nodes['167'].skip_interval = 0.5], ['wrong LoRA flag type', s => s.loraEnabled['168'] = 'true'],
]) test(`rejects ${name} before execution`, () => {
    const settings = api.defaultClothesSwitcherSettings(); change(settings);
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'original.png'));
});
test('requires a valid source photo but allows empty setup drafts and source prompts', () => {
    const settings = api.defaultClothesSwitcherSettings();
    assert.doesNotThrow(() => api.validateClothesSwitcherDraft({ settings }));
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, ''), /original photo/);
    for (const file of [new File([], 'empty.png', { type: 'image/png' }), new File(['video'], 'bad.mp4', { type: 'video/mp4' }), { name: 'fake.png' }]) {
        assert.throws(() => api.validateClothesSwitcherDraft({ settings, file }), /non-empty/);
    }
});
test('live readiness validates all source node classes, model choices and numeric limits', () => {
    const settings = api.defaultClothesSwitcherSettings();
    const info = Object.fromEntries(Object.values(api.CLOTHES_SWITCHER_TEMPLATE).map(node => [node.class_type, { input: { required: {} } }]));
    assert.doesNotThrow(() => api.buildClothesSwitcherWorkflow(settings, 'original.png', info));
    delete info['Image Comparer (rgthree)'];
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'original.png', info), /Image Comparer/);
    info['Image Comparer (rgthree)'] = {};
    info.UNETLoader.input.required.unet_name = [['different.safetensors']];
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'original.png', info), /unavailable/);
    info.UNETLoader.input.required.unet_name = [[settings.nodes['106'].unet_name]];
    info.KSampler.input.required.steps = ['INT', { min: 1, max: 4 }];
    assert.throws(() => api.buildClothesSwitcherWorkflow(settings, 'original.png', info), /outside/);
});
