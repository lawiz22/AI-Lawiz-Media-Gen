import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

export const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
export const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
export const helpersURL = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
export const workflowURL = compile(source('./creationSuiteWorkflow.ts')
    .replace("import template from '../assets/creationSuiteWorkflow.json';", `const template = ${source('../assets/creationSuiteWorkflow.json')};`)
    .replace("import helpers from '../assets/creationSuiteHelpers.json';", `const helpers = ${source('../assets/creationSuiteHelpers.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`));
export const api = await import(workflowURL);
const { defaultCreationSuiteSettings: defaults, buildCreationSuiteWorkflow: build, CREATION_SUITE_TEMPLATE: template } = api;
const files = { sourceImage: 'reference.png', startFrame: 'base.png', characterSceneImage: 'face.png' };
const reachable = graph => {
    const seen = new Set(), visiting = new Set();
    const visit = key => {
        assert.ok(graph[key], `Missing dependency ${key}`);
        assert.ok(!visiting.has(key), `Cycle at ${key}`);
        if (seen.has(key)) return;
        visiting.add(key);
        for (const value of Object.values(graph[key].inputs)) if (Array.isArray(value)) visit(value[0]);
        visiting.delete(key); seen.add(key);
    };
    for (const key of ['12', '28', '131', '224']) if (graph[key]) visit(key);
    assert.equal(seen.size, Object.keys(graph).length, 'Inactive nodes must be pruned');
};

test('literal defaults match every editable source value and source seeds/samplers remain exact', () => {
    const settings = defaults();
    for (const [key, values] of Object.entries(settings.nodes)) for (const [name, value] of Object.entries(values)) assert.deepEqual(value, template[key].inputs[name], `${key}.${name}`);
    assert.deepEqual(settings.nodes['10'], { seed: 500697199210746, steps: 50, cfg: 3, sampler_name: 'dpmpp_2m_sde', scheduler: 'sgm_uniform', denoise: 1 });
    assert.deepEqual(settings.nodes['120'], { seed: 43, steps: 20, cfg: 3, sampler_name: 'res_multistep', scheduler: 'sgm_uniform', denoise: 1 });
    assert.equal(settings.randomizeSceneSeed, true); assert.equal(settings.randomizeSwapSeed, false);
    assert.equal(settings.useSelectedSize, true); assert.equal(settings.modernStyle, true);
    assert.equal(settings.nodes['105'].strength_model, 0.9); assert.equal(settings.nodes['106'].strength_model, 1);
    for (const key of ['31', '111', '112']) assert.equal(template[key].inputs.image, '');
    assert.match(settings.nodes['22'].string_a, /42-year-old/);
});
test('all eight verbatim helpers remain separate from actual prompts', () => {
    assert.deepEqual(api.CREATION_SUITE_HELPERS.map(note => note.id).sort(), ['13', '17', '18', '19', '223', '29', '32', '140'].sort());
    const cheap = api.CREATION_SUITE_HELPERS.find(note => note.id === '19');
    assert.match(cheap.text, /22-year-old/); assert.match(cheap.text, /HOW TO BUILD A PROMPT/);
    assert.match(api.creationSuitePrompt(defaults()), /42-year-old/);
});
test('chained pipeline wires decoded MOSS directly into Qwen and comparison, retaining both saves', () => {
    const settings = defaults(), before = structuredClone(settings), graph = build(settings, files);
    assert.deepEqual(graph['110'].inputs['images.image_1'], ['11', 0]);
    assert.deepEqual(graph['224'].inputs.image_a, ['11', 0]);
    assert.deepEqual(graph['224'].inputs.image_b, ['131', 0]);
    assert.equal(graph['111'], undefined); assert.equal(graph['12'].class_type, 'SaveImage'); assert.equal(graph['131'].class_type, 'SaveImage');
    assert.deepEqual(settings, before); reachable(graph);
});
for (const sceneEnabled of [false, true]) for (const swapEnabled of [false, true]) for (const useReference of [false, true]) for (const modernStyle of [false, true]) for (const useSelectedSize of [false, true]) {
    if (!sceneEnabled && !swapEnabled) continue;
    test(`independent branches scene=${sceneEnabled} swap=${swapEnabled} reference=${useReference} modern=${modernStyle} size=${useSelectedSize}`, () => {
        const settings = { ...defaults(), sceneEnabled, swapEnabled, useReference, modernStyle, useSelectedSize };
        const graph = build(settings, files); reachable(graph);
        assert.equal(!!graph['1'], sceneEnabled); assert.equal(!!graph['101'], swapEnabled);
        assert.equal(!!graph['31'], sceneEnabled && useReference);
        assert.equal(!!graph['111'], swapEnabled && !sceneEnabled);
        assert.equal(!!graph['112'], swapEnabled);
        if (sceneEnabled) {
            assert.deepEqual(graph['30'].inputs.prompt, [modernStyle ? '23' : '24', 0]);
            assert.equal(!!graph['25'], !modernStyle); assert.equal(!!graph['22'], modernStyle);
            assert.deepEqual(graph['30'].inputs.image, useReference ? ['31', 0] : undefined);
        }
        if (swapEnabled) {
            assert.deepEqual(graph['120'].inputs.latent_image, useSelectedSize ? ['116', 0] : ['110', 2]);
            assert.equal(!!graph['115'], useSelectedSize);
            if (!sceneEnabled) assert.deepEqual(graph['110'].inputs['images.image_1'], ['111', 0]);
        }
    });
}
test('optional model stages can all be bypassed without leaving stale links or unused models', () => {
    const settings = defaults();
    for (const key of Object.keys(settings.bypass)) settings.bypass[key] = true;
    const graph = build(settings, files); reachable(graph);
    assert.deepEqual(graph['10'].inputs.model, ['1', 0]); assert.deepEqual(graph['120'].inputs.model, ['101', 0]);
    for (const key of Object.keys(settings.bypass)) assert.equal(graph[key], undefined);
});
test('single bypass keeps remaining LoRA chain and settings', () => {
    const settings = defaults(); settings.bypass['105'] = true;
    const graph = build(settings, files);
    assert.equal(graph['105'], undefined); assert.deepEqual(graph['106'].inputs.model, ['104', 0]);
    assert.equal(graph['106'].inputs.strength_model, 1); reachable(graph);
});
test('cheap prompt preview honors editable delimiters, scene word and replace token', () => {
    const settings = defaults(); settings.modernStyle = false;
    settings.nodes['24'].find = 'TOKEN'; settings.nodes['26'].string_b = 'closing TOKEN';
    settings.nodes['25'].delimiter = '|'; settings.nodes['26'].delimiter = '/';
    assert.equal(api.creationSuitePrompt(settings), `${settings.nodes['25'].string_a}|${settings.nodes['20'].value}/closing beach-day`);
});
test('missing inputs, inactive pipelines, bad settings and invalid sampler ranges are explicit errors', () => {
    assert.throws(() => build({ ...defaults(), sceneEnabled: false, swapEnabled: false }, files), /Enable Scene Creation/);
    assert.throws(() => build(defaults(), {}), /Scene reference/);
    assert.throws(() => build({ ...defaults(), sceneEnabled: false }, {}), /Face \/ head/);
    assert.throws(() => build({ ...defaults(), sceneEnabled: false }, { characterSceneImage: 'face.png' }), /Swap base/);
    for (const [name, value] of [['seed', -1], ['steps', 0], ['denoise', 2], ['cfg', NaN]]) {
        const settings = defaults(); settings.nodes['10'][name] = value;
        assert.throws(() => build(settings, files), /Invalid|valid|seeds/);
    }
    const settings = defaults(); settings.nodes['1'].unet_name = 10;
    assert.throws(() => build(settings, files), /Invalid Creation suite setting/);
});
test('image validation only requires active inputs and accepts removed inactive file keys', () => {
    const image = new File(['image'], 'face.png', { type: 'image/png' });
    const draft = { settings: { ...defaults(), sceneEnabled: false }, files: { sourceImage: undefined, startFrame: image, characterSceneImage: image } };
    api.validateCreationSuiteDraft(draft);
    draft.files.characterSceneImage = new File([], 'empty.png', { type: 'image/png' });
    assert.throws(() => api.validateCreationSuiteDraft(draft), /non-empty image/);
});
test('malformed stored settings are rejected instead of partially defaulting or crashing the UI', () => {
    for (const value of [null, {}, { ...defaults(), nodes: {} }, { ...defaults(), sceneEnabled: 'yes' }]) {
        assert.throws(() => api.validateCreationSuiteSettings(value), /Invalid|Missing Creation suite/);
    }
});
