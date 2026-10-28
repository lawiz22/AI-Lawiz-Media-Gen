import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const qwenUrl = moduleUrl(readFileSync(new URL('./qwen21Workflow.ts', import.meta.url), 'utf8'));
const template = JSON.parse(readFileSync(new URL('../assets/mossPhotoWorkflow.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('./mossPhotoWorkflow.ts', import.meta.url), 'utf8')
    .replace("import template from '../assets/mossPhotoWorkflow.json';", `const template = ${JSON.stringify(template)};`)
    .replace("from './qwen21Workflow'", `from '${qwenUrl}'`);
export const photoModuleUrl = moduleUrl(source);
const { defaultMossPhotoSettings, buildMossPhotoWorkflow, mossPhotoDimensions, mossPhotoPrompt, setMossPhotoSeed, validateMossPhotoReadiness, MOSS_PHOTO_LOOKS } = await import(photoModuleUrl);
const prompt = 'A mountain lake at sunrise';
const build = (patch = {}) => buildMossPhotoWorkflow({ ...defaultMossPhotoSettings(), ...patch }, prompt, 42);
const links = graph => {
    const visited = new Set(), visiting = new Set();
    const visit = id => {
        assert.ok(graph[id], `Missing ${id}`);
        assert.ok(!visiting.has(id), `Cycle at ${id}`);
        if (visited.has(id)) return;
        visiting.add(id);
        for (const value of Object.values(graph[id].inputs)) if (Array.isArray(value)) visit(value[0]);
        visiting.delete(id); visited.add(id);
    };
    visit('10');
    assert.equal(visited.size, Object.keys(graph).length, 'All submitted nodes must be reachable');
};
const literal = (graph, id, key) => {
    const value = graph[id].inputs[key];
    if (!Array.isArray(value)) return value;
    const node = graph[value[0]];
    if (node.class_type.startsWith('Primitive')) return node.inputs.value;
    if (node.class_type === 'Any Switch (rgthree)') return literal(graph, value[0], Object.keys(node.inputs)[0]);
    if (node.class_type === 'KreativeShowText') return literal(graph, value[0], 'source');
    if (node.class_type === 'GenTimerLap') return literal(graph, value[0], 'value');
    return value;
};
const infoFor = graph => {
    const info = {};
    for (const node of Object.values(graph)) {
        const required = info[node.class_type]?.input.required || {};
        for (const [key, value] of Object.entries(node.inputs)) {
            if (typeof value === 'string') required[key] = [[...new Set([...(required[key]?.[0] || []), value])]];
            else if (typeof value === 'number') required[key] = ['FLOAT', { min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }];
        }
        info[node.class_type] = { input: { required } };
    }
    return info;
};

test('PHOTO defaults match the supplied panels without embedding personal prompts', () => {
    const settings = defaultMossPhotoSettings(), graph = build();
    assert.deepEqual(mossPhotoDimensions(settings), { width: 1024, height: 768, ratio: '4:3' });
    assert.equal(settings.steps, 25);
    assert.equal(graph.photo_model.inputs.unet_name, 'dirtyMoss_bf16.safetensors');
    assert.equal(graph.photo_writer.inputs.clip_name, 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors');
    assert.equal(graph.photo_clip.inputs.clip_name, 'qwen3.5_9b_int8_convrot.safetensors');
    assert.equal(graph.photo_vae.inputs.vae_name, 'flux2-vae.safetensors');
    assert.equal(graph['300:72'].inputs.value, 25);
    assert.equal(graph['300:16'].inputs.cfg, 3);
    assert.deepEqual(graph['10'].inputs.images, ['87', 0]);
    assert.equal(graph['89'].inputs.value, prompt);
    assert.equal(graph['71'].inputs.value, 42);
    for (const id of ['123', '357', '125', '126', '127', '128', '129', '300:43', '300:107', '150', '160', '45']) assert.equal(graph[id], undefined, id);
    assert.equal(template['89'].inputs.prompt_data, '[{"enabled":true,"text":""}]');
    assert.equal(template['300:51'].inputs.text, '');
    links(graph);
});

test('all eleven looks, four people modes, AI modes and extras produce complete acyclic reachable graphs', () => {
    for (const [look] of MOSS_PHOTO_LOOKS) for (const people of ['A', 'B', 'C', 'D']) for (const aiWriter of [false, true]) for (const extras of [false, true]) {
        const graph = build({
            look, people, aiWriter, ownStyle: 'Vintage photo. Rich warm colours.',
            myPrompts: [{ enabled: true, text: prompt }],
            secondPass: extras, faceFix: extras, handFix: extras, detail: extras, jpeg: extras,
        });
        links(graph);
        assert.equal(!!graph['300:43'], extras);
        assert.equal(!!graph['123'], extras);
        assert.equal(!!graph['357'], extras);
        assert.equal(!!graph['127'], extras && look !== 'J');
        assert.equal(!!graph['300:107'], look === 'E');
        assert.equal(!!graph.photo_writer, aiWriter);
        assert.equal(!!graph['300:50'], aiWriter);
        assert.equal(!!graph['86'], look !== 'J');
        assert.equal(graph['87'].inputs.gray_scale, look === 'H');
        assert.equal(!!graph['129'], extras || look === 'C');
    }
});

test('look and people selections rewire the source primitives rather than cosmetic control nodes', () => {
    const descriptions = { A: '93', B: '60', C: '66', D: '91', E: '96', F: '171', G: '181', H: '183', I: '185', J: '187', K: '317' };
    for (const [look] of MOSS_PHOTO_LOOKS) {
        const graph = build({ look, ownStyle: 'Vintage photo. Warm colours.' });
        assert.deepEqual(graph['300:62'].inputs.string_a, [`300:${({ A: '94', B: '65', C: '67', D: '92', E: '95', F: '170', G: '180', H: '182', I: '184', J: '186', K: '316' })[look]}`, 0]);
        assert.deepEqual(graph['300:79'].inputs.string_b, [`300:${descriptions[look]}`, 0]);
    }
    const custom = build({ look: 'F', ownStyle: 'Vintage photo. Warm colours.' });
    assert.equal(custom['300:170'].inputs.value, 'Vintage photo.');
    assert.equal(custom['300:171'].inputs.value, 'Warm colours.');
    const graph = build({ flash: true, ordinaryPeople: false, people: 'D' });
    assert.equal(graph['300:191'].inputs.value, template['300:190'].inputs.value);
    assert.equal(graph['300:360'].inputs.value, '');
    assert.equal(graph['300:362'].inputs.value, '');
    assert.deepEqual(graph['300:363'].inputs.string_a, ['300:120', 0]);
    assert.deepEqual(graph['300:113'].inputs.string_b, ['300:121', 0]);
});

test('second pass, IR, face, hand and SeedVR2 run in the source order with source parameters', () => {
    const graph = build({ secondPass: true, look: 'E', faceFix: true, handFix: true, detail: true, jpeg: true, batchSize: 3, steps: 50 });
    assert.equal(graph['88'].inputs.batch_size, 3);
    assert.equal(graph['300:72'].inputs.value, 50);
    assert.deepEqual(graph['300:41'].inputs.image, ['300:17', 0]);
    assert.equal(graph['300:41'].inputs.scale_by, 1.5);
    assert.equal(graph['300:43'].inputs.steps, 8);
    assert.equal(graph['300:43'].inputs.denoise, 0.22);
    assert.deepEqual(graph['300:99'].inputs.image, ['300:44', 0]);
    assert.deepEqual(graph['123'].inputs.image, ['300:107', 0]);
    assert.deepEqual(graph['357'].inputs.image, ['123', 0]);
    assert.deepEqual(graph['127'].inputs.image, ['357', 0]);
    assert.deepEqual(graph['128'].inputs.original, ['357', 0]);
    assert.deepEqual(graph['86'].inputs.image, ['128', 0]);
    assert.deepEqual(graph['129'].inputs.image, ['87', 0]);
    assert.deepEqual(graph['10'].inputs.images, ['129', 0]);
    assert.equal(graph['300:43'].inputs.seed, 672391918528337);
    setMossPhotoSeed(graph, 100);
    assert.equal(literal(graph, '300:16', 'seed'), 100);
    assert.equal(literal(graph, '300:43', 'seed'), 672391918528337);
    assert.equal(literal(graph, '123', 'seed'), 100);
    assert.equal(literal(graph, '357', 'seed'), 100);
});

test('exact own prompt bypasses AI, look/lens/people positive additions and all writer dependencies', () => {
    const graph = build({ aiWriter: false, addLookText: false, primaryEnabled: false, myPrompts: [{ enabled: true, text: 'A lake, exactly as written.' }] });
    assert.equal(literal(graph, '300:4', 'text'), 'A lake, exactly as written.');
    assert.equal(graph.photo_writer, undefined);
    assert.equal(graph['88'] !== undefined, true);
    assert.equal(graph['300:50'], undefined);
    assert.equal(graph['300:360'], undefined);
    const withLook = build({ aiWriter: false, myPrompts: [{ enabled: true, text: 'A lake,' }] });
    assert.equal(withLook['337'].inputs.value, 'A lake.');
    assert.equal(mossPhotoPrompt({ ...defaultMossPhotoSettings(), combineIdeas: true, ideas: [{ enabled: true, text: 'Misty morning' }, { enabled: false, text: 'ignored' }] }, prompt), `${prompt}\n\nMisty morning`);
    assert.equal(mossPhotoPrompt({ ...defaultMossPhotoSettings(), primaryEnabled: false, ideas: [{ enabled: true, text: 'Other idea' }] }, ''), 'Other idea');
    assert.throws(() => build({ aiWriter: false }), /active MOSS PHOTO/);
});

test('resolution, custom sizes, focal auto-ratios, panorama locks, swap and Polaroid agree', () => {
    const dimensions = patch => mossPhotoDimensions({ ...defaultMossPhotoSettings(), ...patch });
    assert.deepEqual(dimensions({ sizeIndex: 9 }), { width: 2560, height: 1920, ratio: '4:3' });
    assert.deepEqual(dimensions({ swap: true }), { width: 768, height: 1024, ratio: '4:3' });
    assert.deepEqual(dimensions({ focal: '8mm', fisheye: 'Circular', autoRatio: true }), { width: 1024, height: 1024, ratio: '1:1' });
    assert.equal(dimensions({ focal: '85mm', autoRatio: true }).ratio, '4:5');
    assert.equal(dimensions({ focal: '135mm', autoRatio: true }).ratio, '2:3');
    assert.deepEqual(dimensions({ focal: 'XPan', swap: true }), { width: 1024, height: 384, ratio: '65:24' });
    assert.deepEqual(dimensions({ focal: 'Widelux', swap: true }), { width: 1024, height: 336, ratio: '3:1' });
    assert.deepEqual(dimensions({ ratio: 'Custom Resolution', customResolution: [1000, 770] }), { width: 1008, height: 768, ratio: 'Custom Resolution' });
    assert.deepEqual(dimensions({ ratio: 'Custom Ratio', customRatio: [5, 2] }), { width: 1024, height: 416, ratio: 'Custom Ratio' });
    for (const patch of [
        { ratio: 'Custom Ratio', customRatio: [100, 1] }, { ratio: 'Custom Ratio', customRatio: [1.5, 1] },
        { ratio: 'Custom Resolution', customResolution: [63, 512] }, { ratio: 'Custom Resolution', customResolution: [512.5, 512] },
    ]) assert.throws(() => dimensions(patch), /integers|1 and 99|64 and 8192/);
    const graph = build({ look: 'J', focal: 'XPan', autoRatio: true, detail: true });
    assert.equal(JSON.parse(graph['88'].inputs.ui_state).focal, 'Off');
    assert.equal(dimensions({ look: 'J', focal: 'XPan', autoRatio: true }).ratio, '4:3');
    assert.equal(graph['127'], undefined);
});

test('model/LoRA overrides and advanced parameters are submitted with independent strengths', () => {
    const settings = defaultMossPhotoSettings();
    settings.nodes['160'] = { ...settings.nodes['160'], model: 'moss/custom.safetensors', 'lora 1': 'moss/film.safetensors', 'lora 1 strength': -0.5, 'lora 2': 'moss/fast.safetensors', 'lora 2 strength': 0.8 };
    settings.nodes['123'].denoise = 0.33;
    const graph = buildMossPhotoWorkflow({ ...settings, faceFix: true }, prompt, 7);
    assert.equal(graph.photo_model.inputs.unet_name, 'moss/custom.safetensors');
    assert.deepEqual(graph.photo_lora_2.inputs.model, ['photo_lora_1', 0]);
    assert.equal(graph.photo_lora_1.inputs.strength_model, -0.5);
    assert.equal(graph.photo_lora_2.inputs.strength_model, 0.8);
    assert.deepEqual(graph['300:15'].inputs.model, ['photo_lora_2', 0]);
    assert.equal(graph['123'].inputs.denoise, 0.33);
    assert.notEqual(defaultMossPhotoSettings().nodes['160'].model, settings.nodes['160'].model);
});

test('preflight checks only active dependencies, model choices and numeric bounds', () => {
    const graph = build(), info = infoFor(graph);
    assert.doesNotThrow(() => validateMossPhotoReadiness(graph, info));
    delete info.TextGenerate;
    assert.throws(() => validateMossPhotoReadiness(graph, info), /TextGenerate/);
    const manual = build({ aiWriter: false, myPrompts: [{ enabled: true, text: prompt }] });
    assert.doesNotThrow(() => validateMossPhotoReadiness(manual, infoFor(manual)));
    const unavailable = infoFor(graph);
    unavailable.UNETLoader.input.required.unet_name = [['other-model']];
    assert.throws(() => validateMossPhotoReadiness(graph, unavailable), /Unavailable.*unet_name/);
    const invalid = infoFor(graph);
    invalid.KSampler.input.required.cfg = ['FLOAT', { min: 0, max: 2 }];
    assert.throws(() => validateMossPhotoReadiness(graph, invalid), /Out-of-range.*cfg/);
});

test('invalid input, hidden graph overrides and unsafe seeds fail explicitly', () => {
    for (const patch of [{ steps: 0 }, { steps: 51 }, { batchSize: 0 }, { batchSize: 65 }, { snapTo: 7 }, { look: 'X' }, { look: 'F' }, { people: 'X' }, { focal: '999mm' }, { sizeIndex: 10 }, { filenamePrefix: '' }, { ratio: 'Custom Ratio', customRatio: [0, 1] }]) assert.throws(() => build(patch), undefined, JSON.stringify(patch));
    for (const seed of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildMossPhotoWorkflow(defaultMossPhotoSettings(), prompt, seed), /seed/);
    const settings = defaultMossPhotoSettings();
    settings.nodes['300:16'].model = 'injected';
    assert.throws(() => buildMossPhotoWorkflow(settings, prompt, 1), /Invalid MOSS PHOTO/);
});

const serviceSource = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
const generateSource = serviceSource.slice(serviceSource.indexOf('export const generateComfyUIPortraits ='), serviceSource.indexOf('export const generateComfyUICharacterAngles ='));
const buildSource = serviceSource.slice(serviceSource.indexOf('const buildWorkflow = async'), serviceSource.indexOf("    if (options.comfyModelType === 'qwen21-character-scene')", serviceSource.indexOf('const buildWorkflow = async'))) + "throw new Error('Unsupported test workflow'); };";
const runner = await import(moduleUrl(`
    import { buildMossPhotoWorkflow, defaultMossPhotoSettings, mossPhotoPrompt, setMossPhotoSeed, validateMossPhotoReadiness } from '${photoModuleUrl}';
    export const calls = [];
    let info = {}, resultCount = 2;
    export const configure = (value, count = 2) => { info = value; resultCount = count; calls.length = 0; };
    const getComfyUIObjectInfo = async () => info;
    ${buildSource}
    export { buildWorkflow };
    const executeWorkflow = async (workflow, progress, longJob, count, outputNodes, nodeOutput, preview) => {
        calls.push({ workflow, longJob, count, outputNodes });
        progress('Sampling...', 0.5);
        preview?.(new Blob(['preview'], { type: 'image/png' }));
        nodeOutput?.('300:51', { text: ['Expanded lake prompt'] });
        return { images: Array.from({ length: resultCount }, (_, index) => 'image' + index) };
    };
    ${generateSource}
`));

test('PHOTO generation/export use the real service entry points, seed modes, batches, output filtering and previews', async t => {
    const photo = { ...defaultMossPhotoSettings(), batchSize: 2 };
    const options = { provider: 'comfyui', comfyModelType: 'moss-photo', comfyMossPhoto: photo, comfyPrompt: prompt, comfySeed: 4, comfySeedIncrement: 2, numImages: 3 };
    for (const [mode, expected] of [['fixed', [4, 4, 4]], ['increment', [4, 6, 8]], ['decrement', [4, 2, 0]], ['randomize', null]]) {
        runner.configure(infoFor(build({ batchSize: 2 })));
        const ready = [], progress = [], previews = [];
        const result = await runner.generateComfyUIPortraits(null, { ...options, comfySeedControl: mode }, () => {}, [],
            (index, image) => ready.push([index, image]), (index, message, value) => progress.push([index, value]), blob => previews.push(blob));
        const seeds = runner.calls.map(call => call.workflow['71'].inputs.value);
        if (expected) assert.deepEqual(seeds, expected);
        else assert.ok(seeds.every(value => Number.isSafeInteger(value) && value >= 0));
        assert.deepEqual(ready.map(([index]) => index), [0, 1, 2, 3, 4, 5]);
        assert.deepEqual([...new Set(progress.map(([index]) => index))], [0, 1, 2, 3, 4, 5]);
        assert.equal(result.images.length, 6);
        assert.equal(result.finalPrompt, 'Expanded lake prompt');
        assert.equal(previews.filter(value => value === null).length, 3);
        assert.equal(previews.filter(value => value instanceof Blob).length, 3);
        for (const call of runner.calls) {
            assert.equal(call.longJob, true);
            assert.equal(call.count, 2);
            assert.deepEqual(call.outputNodes, ['10']);
        }
    }
    assert.deepEqual(await runner.buildWorkflow(options, null), buildMossPhotoWorkflow(photo, prompt, 4));
    runner.configure({});
    await assert.rejects(() => runner.generateComfyUIPortraits(null, options, () => {}), /missing nodes/);
    assert.equal(runner.calls.length, 0);
    runner.configure(infoFor(build({ batchSize: 2 })), 1);
    t.mock.method(console, 'error', () => {});
    await assert.rejects(() => runner.generateComfyUIPortraits(null, options, () => {}), /returned 1\/2 saved images/);
});

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const panelSource = readFileSync(new URL('../components/MossPhotoSettingsPanel.tsx', import.meta.url), 'utf8')
    .replace("from 'react'", `from '${reactUrl}'`)
    .replace("from '../services/qwen21Workflow'", `from '${qwenUrl}'`)
    .replace("from '../services/mossPhotoWorkflow'", `from '${photoModuleUrl}'`);
const { MossPhotoSettingsPanel } = await import(moduleUrl(panelSource));
test('PHOTO renders conditional accordions, all requested controls, enabled LoRA strengths and generation lock', () => {
    const render = (patch = {}, disabled = false) => renderToStaticMarkup(React.createElement(MossPhotoSettingsPanel, {
        options: { comfyModelType: 'moss-photo', comfyPrompt: prompt, comfyMossPhoto: { ...defaultMossPhotoSettings(), ...patch } },
        updateOptions: () => {}, disabled,
    }));
    const initial = render();
    for (const label of ['MOSS PHOTO', 'Your idea', 'Image size + focal length', 'Models &amp; LoRAs', 'Sampling &amp; finishing', 'AI prompt writer', 'Add Idea Row']) assert.ok(initial.includes(label), label);
    assert.ok(!initial.includes('aria-label="Models, text encoder, VAE'));
    assert.ok(!initial.includes('Face fix parameters'));
    assert.ok(!initial.includes('SeedVR2 detail parameters'));
    const extras = render({ look: 'F', secondPass: true, faceFix: true, handFix: true, detail: true, jpeg: true, focal: '8mm' });
    for (const title of ['Your own style', 'Second pass parameters', 'Face fix parameters', 'Hand fix parameters', 'SeedVR2 detail parameters', 'JPEG crunch parameters']) assert.ok(extras.includes(title), title);
    const manual = render({ aiWriter: false });
    assert.ok(manual.includes('Your own prompt (no AI rewriting)'));
    assert.ok(!manual.includes('AI writer parameters'));
    assert.ok(!manual.includes('Models, text encoder, VAE &amp; LoRAs / prompt writer'));
    const polaroid = render({ look: 'J', detail: true });
    assert.ok(!polaroid.includes('SeedVR2 detail parameters'));
    assert.ok(!polaroid.includes('aria-label="Focal length"'));
    assert.ok(render({}, true).includes('<fieldset disabled=""'));
});

const mossUrl = moduleUrl(readFileSync(new URL('./mossWorkflow.ts', import.meta.url), 'utf8').replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const kreaUrl = moduleUrl(readFileSync(new URL('./krea2EditWorkflow.ts', import.meta.url), 'utf8').replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const anglesUrl = moduleUrl(readFileSync(new URL('./characterAnglesWorkflow.ts', import.meta.url), 'utf8'));
const sliceSource = readFileSync(new URL('../store/generationSlice.ts', import.meta.url), 'utf8')
    .replace("from '@reduxjs/toolkit'", `from '${pathToFileURL(require.resolve('@reduxjs/toolkit')).href}'`)
    .replace("from '../services/characterAnglesWorkflow'", `from '${anglesUrl}'`)
    .replace("from '../services/qwen21Workflow'", `from '${qwenUrl}'`)
    .replace("from '../services/mossWorkflow'", `from '${mossUrl}'`)
    .replace("from '../services/mossPhotoWorkflow'", `from '${photoModuleUrl}'`)
    .replace("from '../services/krea2EditWorkflow'", `from '${kreaUrl}'`);
const generation = await import(moduleUrl(sliceSource));
test('PHOTO state, prompt imports, readiness, presets and subtab switches preserve independent settings', () => {
    let state = generation.default(undefined, { type: 'init' });
    const app = { isComfyUIConnected: true, activeTab: 'image-generator' };
    const ready = () => generation.selectIsReadyToGenerate({ generation: state, app });
    state = generation.default(state, generation.switchComfyModelOptions({ comfyModelType: 'moss-photo', comfyPrompt: '' }));
    assert.equal(ready(), false);
    state = generation.default(state, generation.updateOptions({ comfyMossPhoto: {
        ...state.options.comfyMossPhoto, aiWriter: false, batchSize: 3,
        myPrompts: [{ enabled: false, text: 'Unused' }, { enabled: true, text: 'Original own prompt' }],
    } }));
    assert.equal(ready(), true);
    state = generation.default(state, generation.updateOptions({ comfyPrompt: 'Imported Library prompt' }));
    assert.equal(state.options.comfyMossPhoto.myPrompts[1].text, 'Imported Library prompt');
    assert.equal(state.options.comfyMossPhoto.batchSize, 3);
    const preset = structuredClone(state.options);
    state = generation.default(state, generation.switchComfyModelOptions({ comfyModelType: 'moss-image' }));
    assert.equal(state.options.comfyMoss.steps, 10);
    state = generation.default(state, generation.switchComfyModelOptions({ comfyModelType: 'moss-photo' }));
    assert.deepEqual(state.options.comfyMossPhoto, preset.comfyMossPhoto);
    state = generation.default(state, generation.setOptions(preset));
    assert.deepEqual(state.options.comfyMossPhoto, preset.comfyMossPhoto);
    state = generation.default(state, generation.updateOptions({ comfyMossPhoto: {
        ...state.options.comfyMossPhoto, aiWriter: true, primaryEnabled: false, ideas: [{ enabled: true, text: 'Another active idea' }],
    }, comfyPrompt: '' }));
    assert.equal(ready(), true);
    state = generation.default(state, generation.updateOptions({ comfyPrompt: 'Imported AI idea' }));
    assert.equal(state.options.comfyMossPhoto.primaryEnabled, true);
    assert.equal(state.options.comfyMossPhoto.ideas[0].enabled, false);
    assert.equal(ready(), true);
    assert.equal(generation.selectIsReadyToGenerate({ generation: state, app: { ...app, isComfyUIConnected: false } }), false);
});

test('PHOTO optional live preflight validates every look and all enabled extras against ComfyUI', { skip: !process.env.COMFYUI_PHOTO_LIVE_URL }, async () => {
    const response = await fetch(`${process.env.COMFYUI_PHOTO_LIVE_URL}/object_info`);
    assert.ok(response.ok);
    const info = await response.json();
    for (const [look] of MOSS_PHOTO_LOOKS) for (const aiWriter of [false, true]) {
        const graph = build({ look, aiWriter, ownStyle: 'Vintage photo.', myPrompts: [{ enabled: true, text: prompt }], secondPass: true, faceFix: true, handFix: true, detail: true, jpeg: true });
        validateMossPhotoReadiness(graph, info);
        for (const node of Object.values(graph)) for (const [key, schema] of Object.entries(info[node.class_type].input?.required || {})) {
            const config = Array.isArray(schema) ? schema[1] : undefined;
            if (!config?.defaultInput && !config?.forceInput && !config?.default && !schema[1]?.lazy) assert.ok(key in node.inputs, `${node.class_type}.${key} required input missing`);
        }
    }
});
