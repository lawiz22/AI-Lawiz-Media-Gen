import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const qwenUrl = moduleUrl(readFileSync(new URL('./qwen21Workflow.ts', import.meta.url), 'utf8'));
const kreaUrl = moduleUrl(readFileSync(new URL('./krea2EditWorkflow.ts', import.meta.url), 'utf8').replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const api = await import(kreaUrl);
const settings = patch => ({ ...api.defaultKrea2EditSettings(), prompt: 'Recolor the car to forest green.', ...patch });
const graph = patch => api.buildKrea2EditWorkflow(settings(patch), 42, 'source.png', 'person.png');
const objectInfo = workflow => {
    const info = {};
    for (const node of Object.values(workflow)) {
        const required = info[node.class_type]?.input.required || {};
        for (const [key, value] of Object.entries(node.inputs)) {
            if (typeof value === 'string') required[key] = [[...new Set([...(required[key]?.[0] || []), value])]];
            else required[key] = ['ANY'];
        }
        info[node.class_type] = { input: { required } };
    }
    return info;
};

test('KREA2 edit defaults are General/r64/Turbo with image 2 off and four independent LoRA slots', () => {
    const value = api.defaultKrea2EditSettings();
    assert.equal(value.task, 'general');
    assert.equal(value.rank, 'r64');
    assert.equal(value.secondImage, false);
    assert.equal(value.steps, 8);
    assert.equal(value.cfg, 1);
    assert.equal(value.refBoost, 4);
    assert.equal(value.groundingPx, 768);
    assert.equal(value.loras.length, 4);
    assert.equal(value.loras.filter(lora => lora.enabled).length, 1);
    assert.equal(value.vae, 'qwen_image_vae.safetensors');
    const workflow = graph();
    assert.equal(workflow['71'].class_type, 'LoraLoaderModelOnly');
    assert.deepEqual(workflow['79'].inputs.model, ['71', 0]);
    assert.ok(!Object.values(workflow).some(node => /Power|CLIPTextEncode|ResolutionSelector/.test(node.class_type)));
    assert.equal(workflow['90'], undefined);
    assert.equal(workflow['79'].inputs.source_image_b, undefined);
    assert.equal(workflow['84'].inputs.image_b, undefined);
    assert.equal(workflow['85'].inputs.image_b, undefined);
});

test('two-reference conditioning preserves source order, shared VAE, grounded negative and pre-encoding target', () => {
    const value = settings({ secondImage: true, position: 'beside (right of target)', positionA: 'aligned (trained)', refBoost: 2, refBoostA: 1.3 });
    const workflow = api.buildKrea2EditWorkflow(value, 17, 'scene.png', 'person.png');
    assert.deepEqual(workflow['79'].inputs.source_latent, ['73', 0]);
    assert.deepEqual(workflow['79'].inputs.source_latent_b, ['krea_encode_b', 0]);
    assert.deepEqual(workflow['79'].inputs.source_image, ['72', 0]);
    assert.deepEqual(workflow['79'].inputs.source_image_b, ['90', 0]);
    assert.deepEqual(workflow['79'].inputs.target_latent, workflow['53'].inputs.latent_image);
    assert.deepEqual(workflow['53'].inputs.model, ['79', 0]);
    assert.deepEqual(workflow['54'].inputs.samples, ['53', 0]);
    for (const id of ['73', 'krea_encode_b', '79', '54']) assert.deepEqual(workflow[id].inputs.vae, ['57', 0]);
    for (const id of ['84', '85']) {
        assert.equal(workflow[id].class_type, 'Krea2EditGroundedEncode');
        assert.deepEqual(workflow[id].inputs.image, ['72', 0]);
        assert.deepEqual(workflow[id].inputs.image_b, ['90', 0]);
        assert.equal(workflow[id].inputs.grounding_px, 768);
    }
    assert.equal(workflow['85'].inputs.prompt, '');
    assert.equal(workflow['79'].inputs.ref_position, value.position);
    assert.equal(workflow['79'].inputs.ref_position_a, value.positionA);
    assert.equal(workflow['79'].inputs.ref_boost, 2);
    assert.equal(workflow['79'].inputs.ref_boost_a, 1.3);
});

test('four separate model-only LoRAs form an ordered chain; disabled/zero entries are bypassed without CLIP edits', () => {
    const loras = settings().loras.map((entry, index) => ({ ...entry, enabled: true, name: index ? `KREA/extra${index}.safetensors` : entry.name, strength: index ? 0.3 * index : 1 }));
    const workflow = graph({ loras });
    let previous = '55';
    for (const [index, id] of ['71', '113', '114', 'krea_lora_4'].entries()) {
        assert.deepEqual(workflow[id].inputs.model, [previous, 0]);
        assert.equal(workflow[id].inputs.strength_model, loras[index].strength);
        assert.equal(workflow[id].inputs.lora_name, loras[index].name);
        assert.equal(workflow[id].inputs.clip, undefined);
        previous = id;
    }
    assert.deepEqual(workflow['79'].inputs.model, ['krea_lora_4', 0]);
    loras[1].enabled = false;
    loras[2].strength = 0;
    const skipped = graph({ loras });
    assert.equal(skipped['113'], undefined);
    assert.equal(skipped['114'], undefined);
    assert.deepEqual(skipped.krea_lora_4.inputs.model, ['71', 0]);
    assert.deepEqual(skipped['84'].inputs.clip, ['56', 0]);
});

test('task/rank changes choose installed full/r128/r64 weights, preserve custom settings and do not enable image 2', () => {
    for (const rank of ['full', 'r128', 'r64']) {
        const selected = `my/krea/krea2_identity_edit_v2${rank === 'full' ? '' : '_' + rank}.safetensors`;
        const value = settings({ rank });
        value.loras[1] = { name: 'KREA/krea2_general_edit_v2.safetensors', enabled: true, strength: 0.6 };
        value.loras[2] = { name: 'custom.safetensors', enabled: true, strength: 0.4 };
        const before = structuredClone(value);
        const identity = api.switchKrea2EditTask(value, 'identity', [selected]);
        assert.equal(identity.loras[0].name, selected);
        assert.equal(identity.loras[0].strength, 1);
        assert.equal(identity.loras[1].enabled, false);
        assert.deepEqual(identity.loras[2], value.loras[2]);
        assert.equal(identity.position, 'beside (right of target)');
        assert.equal(identity.refBoost, 2);
        assert.equal(identity.secondImage, false);
        assert.equal(identity.prompt, value.prompt);
        assert.deepEqual(value, before);
        const general = api.switchKrea2EditTask(identity, 'general');
        assert.equal(general.refBoost, 4);
        assert.equal(general.position, 'aligned (trained)');
    }
});

test('all output aspect/MP/alignment choices stay within exactly 2,000,000 pixels', () => {
    for (const aspect of api.KREA2_EDIT_ASPECTS) for (const megapixels of [0.25, 0.5, 1, 1.5, 2]) for (const multiple of [8, 16, 32, 64]) {
        const { width, height } = api.krea2EditDimensions({ aspect, megapixels, multiple });
        assert.equal(width % multiple, 0);
        assert.equal(height % multiple, 0);
        assert.ok(width > 0 && height > 0 && width * height <= megapixels * 1_000_000);
        assert.ok(width * height <= 2_000_000);
    }
    for (const patch of [{ megapixels: 2.01 }, { megapixels: NaN }, { aspect: 'custom' }, { multiple: 7 }]) {
        assert.throws(() => api.krea2EditDimensions(settings(patch)), /Choose a KREA2 edit/);
    }
});

test('every example composes concrete prompts; extra fields progressively add framing, clothes, light and preservation', () => {
    for (const example of api.KREA2_EDIT_EXAMPLES.filter(entry => entry.id !== 'custom')) {
        const composer = { ...settings().composer, example: example.id, target: example.target || '', replacement: example.replacement || '' };
        const prompt = api.composeKrea2EditPrompt(composer);
        assert.ok(prompt.length > 30);
        assert.equal(/image 2/i.test(prompt), !!example.second);
        const value = settings({ prompt, secondImage: !!example.second });
        assert.doesNotThrow(() => api.buildKrea2EditWorkflow(value, 1, 'source', 'second'));
        if (example.second) assert.throws(() => graph({ prompt }), /instruction uses image 2/);
    }
    const composer = { ...settings().composer, example: 'restage', replacement: 'full body, in hiking boots', outfit: 'only a white tank top, remove the coat', lighting: 'pink neon on the left half of the face', preserve: 'facial identity', extra: 'triggerword' };
    const result = api.composeKrea2EditPrompt(composer);
    for (const text of ['full body', 'hiking boots', 'remove the coat', 'left half of the face', 'facial identity', 'triggerword']) assert.ok(result.includes(text));
    assert.equal(api.composeKrea2EditPrompt({ ...settings().composer, replacement: 'My custom prompt' }), 'My custom prompt');
    const overridden = api.composeKrea2EditPrompt({ ...settings().composer, example: 'replace-identity', target: 'the person in image 1',
        pose: 'full body, seated on a bench', outfit: 'a yellow raincoat; remove the original jacket', scene: 'a snowy park' });
    assert.doesNotMatch(overridden, /Preserve the original/);
    for (const text of ['Use the facial identity from image 2', 'yellow raincoat', 'snowy park', 'full body']) assert.ok(overridden.includes(text));
    assert.match(api.composeKrea2EditPrompt({ ...settings().composer, target: 'the parked car', replacement: 'remove it' }), /Edit the parked car in image 1: remove it/);
});

test('invalid inputs and missing task LoRAs fail explicitly without accepting an unusable workflow', () => {
    for (const patch of [
        { prompt: '' }, { task: 'wrong' }, { rank: 'r32' }, { position: 'left' }, { positionA: 'right' }, { fitMode: 'stretch' },
        { steps: 0 }, { steps: 8.5 }, { cfg: NaN }, { denoise: 1.1 }, { refBoost: -1 }, { refBoostA: Infinity },
        { groundingPx: 4097 }, { batchSize: 0 }, { batchSize: 9 }, { unet: '' }, { sampler: '' },
        { loras: [] }, { loras: Array(5).fill(settings().loras[0]) }, { loras: [{ name: 'not-edit.safetensors', enabled: true, strength: 1 }] },
    ]) assert.throws(() => graph(patch));
    assert.throws(() => api.buildKrea2EditWorkflow(settings(), -1, 'source'));
    assert.throws(() => api.buildKrea2EditWorkflow(settings(), 0, ''));
    assert.throws(() => api.buildKrea2EditWorkflow(settings({ secondImage: true }), 0, 'source'));
    const zero = graph({ cfg: 0, denoise: 0, refBoost: 0, groundingPx: 0 });
    assert.equal(zero['53'].inputs.cfg, 0);
    assert.equal(zero['53'].inputs.denoise, 0);
    assert.equal(zero['84'].inputs.grounding_px, 0);
});

test('preflight checks actual V2 schema and enum/model choices, not just the presence of custom node names', () => {
    const workflow = graph({ secondImage: true });
    assert.doesNotThrow(() => api.validateKrea2EditReadiness(workflow, objectInfo(workflow)));
    for (const node of ['Krea2EditModelPatch', 'Krea2EditGroundedEncode', 'LoraLoaderModelOnly']) {
        const info = objectInfo(workflow);
        delete info[node];
        assert.throws(() => api.validateKrea2EditReadiness(workflow, info), /missing nodes/);
    }
    for (const [node, input] of [['Krea2EditModelPatch', 'ref_position'], ['Krea2EditModelPatch', 'target_latent'], ['Krea2EditModelPatch', 'source_image_b'], ['Krea2EditGroundedEncode', 'image_b'], ['Krea2EditGroundedEncode', 'grounding_px']]) {
        const info = objectInfo(workflow);
        delete info[node].input.required[input];
        assert.throws(() => api.validateKrea2EditReadiness(workflow, info), /Update ComfyUI-Krea2Edit/);
    }
    for (const [node, input] of [['CLIPLoader', 'type'], ['UNETLoader', 'unet_name'], ['VAELoader', 'vae_name'], ['LoraLoaderModelOnly', 'lora_name'], ['KSampler', 'sampler_name'], ['Krea2EditModelPatch', 'ref_position']]) {
        const info = objectInfo(workflow);
        info[node].input.required[input] = [['unavailable']];
        assert.throws(() => api.validateKrea2EditReadiness(workflow, info), /Unavailable KREA2 edit/);
    }
});

test('native image-conditioning schemas work without optional placement/pre-encoding enhancements', () => {
    const enhancements = ['ref_position', 'ref_position_a', 'target_latent'];
    for (const secondImage of [false, true]) for (let mask = 0; mask < 8; mask++) {
        const info = objectInfo(graph({ secondImage }));
        const patch = info.Krea2EditModelPatch.input;
        patch.optional = {};
        for (const input of Object.keys(patch.required)) {
            if (['model', 'source_latent'].includes(input)) continue;
            patch.optional[input] = patch.required[input];
            delete patch.required[input];
        }
        enhancements.forEach((input, index) => { if (mask & (1 << index)) delete patch.optional[input]; });
        const workflow = api.buildKrea2EditWorkflow(settings({ secondImage }), 42, 'source.png', 'person.png', info);
        assert.doesNotThrow(() => api.validateKrea2EditReadiness(workflow, info));
        enhancements.forEach((input, index) => assert.equal(input in workflow['79'].inputs, !(mask & (1 << index))));
        assert.deepEqual(api.getKrea2EditCapabilities(info), {
            position: !(mask & 1), positionA: !(mask & 2), targetLatent: !(mask & 4),
        });
        assert.deepEqual(workflow['79'].inputs.source_latent, ['73', 0]);
        assert.deepEqual(workflow['79'].inputs.source_image, ['72', 0]);
        assert.deepEqual(workflow['79'].inputs.vae, ['57', 0]);
        assert.deepEqual(workflow['84'].inputs.image, ['72', 0]);
        assert.deepEqual(workflow['85'].inputs.image, ['72', 0]);
        if (secondImage) {
            assert.deepEqual(workflow['79'].inputs.source_latent_b, ['krea_encode_b', 0]);
            assert.deepEqual(workflow['79'].inputs.source_image_b, ['90', 0]);
            assert.deepEqual(workflow['84'].inputs.image_b, ['90', 0]);
            assert.deepEqual(workflow['85'].inputs.image_b, ['90', 0]);
        }
        delete patch.optional.source_image;
        assert.throws(() => api.validateKrea2EditReadiness(workflow, info), /input "source_image" is unavailable/);
    }
});

test('supplied API graph retains its connected conditioning/sampling path, with documented resolution and placement upgrades', { skip: !process.env.KREA2_EDIT_REFERENCE }, () => {
    const source = JSON.parse(readFileSync(process.env.KREA2_EDIT_REFERENCE, 'utf8'));
    const value = settings({ task: 'identity', prompt: source['84'].inputs.prompt, negativePrompt: source['85'].inputs.prompt, secondImage: true, refBoost: 4, filenamePrefix: source['29'].inputs.filename_prefix,
        loras: ['71', '113', '114'].map(id => ({ name: source[id].inputs.lora_name, enabled: true, strength: source[id].inputs.strength_model })) });
    const workflow = api.buildKrea2EditWorkflow(value, source['53'].inputs.seed, source['72'].inputs.image, source['90'].inputs.image);
    for (const id of ['29', '53', '54', '55', '56', '57', '71', '72', '73', '84', '85', '90', '113', '114']) {
        assert.equal(workflow[id].class_type, source[id].class_type);
        assert.deepEqual(workflow[id].inputs, source[id].inputs);
    }
    for (const [key, input] of Object.entries(source['79'].inputs)) assert.deepEqual(workflow['79'].inputs[key], input);
    assert.equal(workflow['111'], undefined);
    assert.equal(workflow['83'], undefined);
    assert.equal(workflow['82'].inputs.batch_size, source['82'].inputs.batch_size);
    assert.ok(workflow['82'].inputs.width * workflow['82'].inputs.height <= 1_000_000);
});

const serviceSource = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
const start = serviceSource.indexOf('const buildWorkflow = async');
const buildSource = serviceSource.slice(start, serviceSource.indexOf("    if (options.comfyModelType === 'moss-image')", start)) + "throw new Error('Unsupported test model'); };";
const generateSource = serviceSource.slice(serviceSource.indexOf('export const generateComfyUIPortraits ='), serviceSource.indexOf('export const generateComfyUICharacterAngles ='));
const runner = await import(moduleUrl(`
import { buildKrea2EditWorkflow, defaultKrea2EditSettings, validateKrea2EditReadiness } from '${kreaUrl}';
export const uploads = [], decodes = [], calls = [];
let info = {}, count = 1;
export const configure = (value, resultCount = 1) => { info=value;count=resultCount;uploads.length=decodes.length=calls.length=0; };
const getComfyUIObjectInfo = async () => info;
const getImageDimensionsFromFile = async file => {decodes.push(file);if(file.name==='broken.png')throw new Error('Decode failure');return {width:640,height:480};};
const uploadImage = async file => {uploads.push(file);if(file.name==='upload-error.png')throw new Error('Upload failure');return {name:'uploaded_'+file.name,subfolder:'refs'};};
${buildSource}
export { buildWorkflow };
const executeWorkflow = async (...args) => {calls.push(args);args[1]('Sampling',0.5);return {images:Array.from({length:count},(_,index)=>'result_'+index)};};
${generateSource}
`));
const file = (name = 'source.png') => new File(['synthetic'], name, { type: 'image/png' });
const options = patch => ({ provider: 'comfyui', comfyModelType: 'krea2-edit', comfyKrea2Edit: settings(), comfySeed: 42, comfySeedControl: 'fixed', numImages: 1, ...patch });

test('generation/export source preparation uploads enabled inputs once, preserves subfolders and ignores disabled image 2 completely', async () => {
    const source = file(), second = file('person.png');
    runner.configure(objectInfo(graph()));
    const single = await runner.buildWorkflow(options(), source, [file('broken.png')]);
    assert.deepEqual(runner.decodes, [source]);
    assert.deepEqual(runner.uploads, [source]);
    assert.equal(single['72'].inputs.image, 'refs/uploaded_source.png');
    assert.equal(single['90'], undefined);
    const value = settings({ secondImage: true });
    runner.configure(objectInfo(graph({ secondImage: true })));
    const double = await runner.buildWorkflow(options({ comfyKrea2Edit: value }), source, [second]);
    assert.deepEqual(runner.decodes, [source, second]);
    assert.deepEqual(runner.uploads, [source, second]);
    assert.equal(double['90'].inputs.image, 'refs/uploaded_person.png');
});

test('generation/export omit unavailable enhancements before validation and after uploading references', async () => {
    for (const secondImage of [false, true]) {
        const info = objectInfo(graph({ secondImage }));
        for (const input of ['ref_position', 'ref_position_a', 'target_latent']) delete info.Krea2EditModelPatch.input.required[input];
        runner.configure(info);
        const workflow = await runner.buildWorkflow(options({ comfyKrea2Edit: settings({ secondImage }) }), file(), [file('person.png')]);
        for (const input of ['ref_position', 'ref_position_a', 'target_latent']) assert.equal(input in workflow['79'].inputs, false);
        assert.doesNotThrow(() => api.validateKrea2EditReadiness(workflow, info));
        assert.equal(workflow['72'].inputs.image, 'refs/uploaded_source.png');
        assert.equal(runner.uploads.length, secondImage ? 2 : 1);
        if (secondImage) assert.equal(workflow['90'].inputs.image, 'refs/uploaded_person.png');
    }
});

test('decode/schema/model failures happen before upload; missing references and upload errors are surfaced', async () => {
    const source = file();
    for (const [input, refs, value, info] of [
        [null, [], settings(), {}], [file('broken.png'), [], settings(), {}],
        [source, [], settings({ secondImage: true }), {}],
        [source, [file('broken.png')], settings({ secondImage: true }), {}],
        [source, [], settings(), {}],
    ]) {
        runner.configure(info);
        await assert.rejects(runner.buildWorkflow(options({ comfyKrea2Edit: value }), input, refs));
        assert.equal(runner.uploads.length, 0);
    }
    runner.configure(objectInfo(graph()));
    await assert.rejects(runner.buildWorkflow(options(), file('upload-error.png')), /Upload failure/);
});

test('seed progression, batches, final prompt, output filtering and progress stay consistent across executions', async () => {
    for (const [control, seeds] of [['fixed', [42, 42]], ['increment', [42, 45]], ['decrement', [42, 39]]]) {
        const value = settings({ batchSize: 2, secondImage: true });
        runner.configure(objectInfo(graph({ batchSize: 2, secondImage: true })), 2);
        const ready = [], progress = [];
        const result = await runner.generateComfyUIPortraits(file(), options({ comfyKrea2Edit: value, numImages: 2, comfySeedControl: control, comfySeedIncrement: 3 }), () => {}, [file('person.png')], (index, image) => ready.push([index, image]), (index, message, value) => progress.push([index, message, value]));
        assert.deepEqual(runner.calls.map(call => call[0]['53'].inputs.seed), seeds);
        assert.ok(runner.calls.every(call => call[2] === true && call[3] === 2 && JSON.stringify(call[4]) === '["29"]'));
        assert.equal(result.images.length, 4);
        assert.equal(result.finalPrompt, value.prompt);
        assert.equal(runner.uploads.length, 2);
        assert.deepEqual(ready.map(entry => entry[0]), [0, 1, 2, 3]);
        assert.ok(progress.some(entry => entry[0] === 3 && entry[2] === 1));
    }
    runner.configure(objectInfo(graph()), 0);
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
        await assert.rejects(runner.generateComfyUIPortraits(file(), options(), () => {}), /returned 0\/1 saved images/);
        assert.equal(errors.length, 1);
    } finally {
        console.error = originalError;
    }
});
