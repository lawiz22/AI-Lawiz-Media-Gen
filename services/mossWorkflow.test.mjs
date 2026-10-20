import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const qwenUrl = moduleUrl(readFileSync(new URL('./qwen21Workflow.ts', import.meta.url), 'utf8'));
const mossUrl = moduleUrl(readFileSync(new URL('./mossWorkflow.ts', import.meta.url), 'utf8').replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const { defaultMossSettings, buildMossWorkflow, validateMossReadiness, mossPreviewBlob, MOSS_RESOLUTIONS, mossOrientation, mossOrientationSize, mossRefineDimensions } = await import(mossUrl);
const seed = 1103816017183395;
const prompt = 'A mid-century living room on Kodachrome film';
const settings = () => defaultMossSettings();
const graph = () => buildMossWorkflow(settings(), prompt, seed);
test('MOSS Steps control supports 1-50 and sends 50 steps unchanged to the sampler', () => {
    const source = readFileSync(new URL('../components/MossSettingsPanel.tsx', import.meta.url), 'utf8');
    const tree = ts.createSourceFile('MossSettingsPanel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let control;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'number'
            && node.arguments[0]?.getText(tree) === "'Steps'") control = node;
        ts.forEachChild(node, visit);
    };
    visit(tree);
    assert.ok(control);
    assert.deepEqual(control.arguments.slice(1).map(argument => argument.getText(tree)), ["'steps'", '1', '50', '1']);
    assert.equal(buildMossWorkflow({ ...settings(), steps: 50 }, prompt, seed)['18'].inputs.steps, 50);
    assert.equal(settings().steps, 10);
});
const objectInfo = workflow => {
    const info = {};
    for (const node of Object.values(workflow)) {
        const required = info[node.class_type]?.input.required || {};
        for (const [key, value] of Object.entries(node.inputs)) if (typeof value === 'string') {
            required[key] = [[...new Set([...(required[key]?.[0] || []), value])]];
        }
        info[node.class_type] = { input: { required } };
    }
    info.LoraLoader = { input: { required: { lora_name: [[...settings().loras.map(lora => lora.name)]] } } };
    return info;
};

test('MOSS source graph preserves all nodes, source settings and latent output 3', () => {
    const workflow = graph();
    assert.equal(Object.keys(workflow).length, 11);
    assert.deepEqual(workflow['2'], { class_type: 'SkipLayerGuidanceDiTSimple', inputs: { double_layers: '', single_layers: '22', start_percent: 0, end_percent: 0.5, model: ['16', 0] } });
    assert.deepEqual(workflow['7'].inputs, { width: 1280, height: 848, batch_size: 1 });
    assert.deepEqual(workflow['9'].inputs, { samples: ['18', 3], vae: ['4', 0] });
    assert.deepEqual(workflow['10'].inputs, { filename_prefix: 'moss_image', images: ['9', 0] });
    assert.deepEqual(workflow['18'], { class_type: 'KSampler (Efficient)', inputs: {
        seed, steps: 10, cfg: 1.2, sampler_name: 'seeds_2', scheduler: 'beta57', denoise: 1,
        preview_method: 'auto', vae_decode: 'true', model: ['2', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], optional_vae: ['4', 0],
    } });
    assert.deepEqual(workflow['19'].inputs, { unet_name: 'mossImageINT8INT6_mossImageINT8.safetensors', weight_dtype: 'default' });
    assert.deepEqual(workflow['20'].inputs, { clip_name: 'qwen3.5_9b_int8_convrot.safetensors', type: 'moss_image', device: 'default' });
    assert.deepEqual(workflow['4'].inputs, { vae_name: 'flux2-vae.safetensors' });
    assert.equal(workflow['5'].inputs.text, prompt);
    assert.equal(workflow['6'].inputs.text, settings().negativePrompt);
    assert.deepEqual(settings().loras.map(lora => [lora.enabled, lora.strength]), [[false, 0.7], [true, 1], [true, 1], [false, 1]]);
    for (const [index, lora] of settings().loras.entries()) assert.deepEqual(workflow['16'].inputs[`lora_${index + 1}`], { on: lora.enabled, lora: lora.name, strength: lora.strength });
    for (const node of Object.values(workflow)) for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(workflow[value[0]], `Dangling link ${value}`);
    }
});

test('MOSS preserves the supplied API workflow except the intentional 1280 px resolution cap', { skip: !process.env.MOSS_WORKFLOW_REFERENCE }, () => {
    const reference = JSON.parse(readFileSync(process.env.MOSS_WORKFLOW_REFERENCE, 'utf8'));
    const actual = buildMossWorkflow(settings(), reference['5'].inputs.text, reference['18'].inputs.seed);
    reference['7'].inputs.width = 1280;
    reference['7'].inputs.height = 848;
    const normalize = workflow => Object.fromEntries(Object.entries(workflow).map(([id, node]) => [id, { class_type: node.class_type, inputs: node.inputs }]));
    assert.deepEqual(normalize(actual), normalize(reference));
});

test('every MOSS setting is wired; extra/removed/disabled LoRAs retain independent strengths', () => {
    const changed = { ...settings(), unet: 'other', weightDtype: 'fp8_e4m3fn', clip: 'encoder', clipType: 'moss_image', clipDevice: 'cpu', vae: 'vae',
        negativePrompt: '', width: 848, height: 1280, batchSize: 3, filenamePrefix: 'folder/custom',
        doubleLayers: '0, 1', singleLayers: '', startPercent: 0.1, endPercent: 0.8,
        steps: 42, cfg: 0, sampler: 'euler', scheduler: 'simple', denoise: 0, previewMethod: 'none', vaeDecode: 'false',
        loras: [{ name: '', enabled: false, strength: 1 }, { name: 'extra', enabled: true, strength: -0.5 }, { name: 'off', enabled: false, strength: 2 }],
    };
    const workflow = buildMossWorkflow(changed, prompt, 0);
    const mappings = {
        unet: ['19', 'unet_name'], weightDtype: ['19', 'weight_dtype'], clip: ['20', 'clip_name'], clipType: ['20', 'type'], clipDevice: ['20', 'device'], vae: ['4', 'vae_name'],
        negativePrompt: ['6', 'text'], width: ['7', 'width'], height: ['7', 'height'], batchSize: ['7', 'batch_size'], filenamePrefix: ['10', 'filename_prefix'],
        doubleLayers: ['2', 'double_layers'], singleLayers: ['2', 'single_layers'], startPercent: ['2', 'start_percent'], endPercent: ['2', 'end_percent'],
        steps: ['18', 'steps'], cfg: ['18', 'cfg'], sampler: ['18', 'sampler_name'], scheduler: ['18', 'scheduler'], denoise: ['18', 'denoise'], previewMethod: ['18', 'preview_method'], vaeDecode: ['18', 'vae_decode'],
    };
    for (const [key, [id, input]] of Object.entries(mappings)) assert.equal(workflow[id].inputs[input], changed[key], key);
    assert.equal(workflow['18'].inputs.seed, 0);
    assert.equal(workflow['16'].inputs.lora_1, undefined);
    assert.deepEqual(workflow['16'].inputs.lora_2, { on: true, lora: 'extra', strength: -0.5 });
    assert.deepEqual(workflow['16'].inputs.lora_3, { on: false, lora: 'off', strength: 2 });
    const fresh = settings();
    fresh.loras[0].name = 'changed';
    assert.notEqual(settings().loras[0].name, 'changed');
});

test('MOSS rejects invalid dimensions, batches, seeds, sampling, SLG and active LoRAs', () => {
    for (const change of [
        { width: 1295 }, { height: 0 }, { width: 1296 }, { height: 1296 }, { width: 16385 }, { batchSize: 0 }, { batchSize: 65 }, { batchSize: 1.5 },
        { steps: 0 }, { steps: 1.5 }, { cfg: NaN }, { cfg: -1 }, { denoise: 1.1 },
        { startPercent: 0.6, endPercent: 0.5 }, { endPercent: 2 }, { singleLayers: '-1' }, { doubleLayers: 'abc' },
        { unet: '' }, { filenamePrefix: ' ' }, { loras: [{ name: '', enabled: true, strength: 1 }] },
        { loras: [{ name: 'bad', enabled: true, strength: Infinity }] },
    ]) assert.throws(() => buildMossWorkflow({ ...settings(), ...change }, prompt, seed), undefined, JSON.stringify(change));
    for (const invalid of [-1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildMossWorkflow(settings(), prompt, invalid), /seed/);
    assert.throws(() => buildMossWorkflow(settings(), ' ', seed), /prompt/);
});

test('MOSS portrait, landscape and square presets are valid, reversible and capped at exactly 1280', () => {
    for (const [orientation, sizes] of Object.entries(MOSS_RESOLUTIONS)) {
        assert.equal(Math.max(...sizes.flat()), 1280);
        for (const [width, height] of sizes) {
            assert.ok(width <= 1280 && height <= 1280);
            assert.equal(width % 16, 0); assert.equal(height % 16, 0);
            assert.equal(mossOrientation(width, height), orientation);
            assert.doesNotThrow(() => buildMossWorkflow({ ...settings(), width, height }, prompt, seed));
            assert.deepEqual(mossOrientationSize(orientation, width, height), [width, height]);
            if (orientation !== 'square') {
                const opposite = orientation === 'portrait' ? 'landscape' : 'portrait';
                assert.deepEqual(mossOrientationSize(opposite, width, height), [height, width]);
                assert.deepEqual(mossOrientationSize(orientation, height, width), [width, height]);
            }
        }
    }
    for (const orientation of ['portrait', 'landscape', 'square']) {
        const [width, height] = mossOrientationSize(orientation, 1296, 864);
        assert.ok(width <= 1280 && height <= 1280);
        assert.equal(mossOrientation(width, height), orientation);
    }
    assert.deepEqual(mossOrientationSize('square', 1280, 848), [1280, 1280]);
});

test('MOSS readiness validates all nodes, model/enum choices and only enabled LoRAs', () => {
    const workflow = graph();
    const info = objectInfo(workflow);
    assert.doesNotThrow(() => validateMossReadiness(workflow, info));
    delete info['KSampler (Efficient)'];
    assert.throws(() => validateMossReadiness(workflow, info), /missing nodes.*KSampler \(Efficient\)/);
    for (const [node, input] of [['CLIPLoader', 'type'], ['UNETLoader', 'unet_name'], ['VAELoader', 'vae_name'], ['KSampler (Efficient)', 'sampler_name'], ['KSampler (Efficient)', 'scheduler'], ['KSampler (Efficient)', 'preview_method']]) {
        const info = objectInfo(workflow);
        info[node].input.required[input] = [['unavailable']];
        assert.throws(() => validateMossReadiness(workflow, info), /Unavailable MOSS/);
    }
    const enabledOnly = objectInfo(workflow);
    enabledOnly.LoraLoader.input.required.lora_name = [[settings().loras.filter(lora => lora.enabled).map(lora => lora.name)].flat()];
    assert.doesNotThrow(() => validateMossReadiness(workflow, enabledOnly));
    enabledOnly.LoraLoader.input.required.lora_name = [[]];
    assert.throws(() => validateMossReadiness(workflow, enabledOnly), /Unavailable MOSS LoRA/);
});

test('MOSS preview decodes standard PNG/JPEG frames and ignores unsupported frames', async () => {
    for (const [format, mime] of [[1, 'image/jpeg'], [2, 'image/png']]) {
        const frame = new ArrayBuffer(11);
        const header = new DataView(frame);
        header.setUint32(0, 1);
        header.setUint32(4, format);
        new Uint8Array(frame).set([1, 2, 3], 8);
        const blob = mossPreviewBlob(frame);
        assert.equal(blob.type, mime);
        assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
    }
    assert.equal(mossPreviewBlob(new ArrayBuffer(4)), null);
    assert.equal(mossPreviewBlob(new ArrayBuffer(8)), null);
    assert.equal(mossPreviewBlob(new ArrayBuffer(10)), null);
    const unsupported = new ArrayBuffer(10);
    new DataView(unsupported).setUint32(0, 1);
    new DataView(unsupported).setUint32(4, 3);
    assert.equal(mossPreviewBlob(unsupported), null);
});

const serviceSource = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
const generateSource = serviceSource.slice(serviceSource.indexOf('export const generateComfyUIPortraits ='), serviceSource.indexOf('export const generateComfyUICharacterAngles ='));
const mossBuildSource = serviceSource.slice(serviceSource.indexOf('const buildWorkflow = async'), serviceSource.indexOf("    if (options.comfyModelType === 'qwen21-character-scene')", serviceSource.indexOf('const buildWorkflow = async'))) + "throw new Error('Only MOSS is supported by this test harness.'); };";
const runner = await import(moduleUrl(`
    import { buildMossWorkflow, defaultMossSettings, validateMossReadiness } from '${mossUrl}';
    export const calls = [];
    export const uploads = [];
    export const decodes = [];
    export let info = {};
    export let resultCount = 2;
    export const configure = (value, count = 2) => { info = value; resultCount = count; calls.length = 0; uploads.length = 0; decodes.length = 0; };
    const getImageDimensionsFromFile = async file => { decodes.push(file); if (file.decodeError) throw new Error('Invalid image'); return file.dimensions; };
    const uploadImage = async file => { uploads.push(file); if (file.uploadError) throw new Error('Image upload failed'); return { name: 'uploaded-source.png', subfolder: 'moss-tests', type: 'input' }; };
    const getComfyUIObjectInfo = async () => info;
    ${mossBuildSource}
    export { buildWorkflow };
    const executeWorkflow = async (workflow, progress, longJob, count, outputNodes, onNodeOutput, preview) => {
        calls.push({ workflow, longJob, count, outputNodes });
        progress('Sampling...', 0.5);
        preview?.(new Blob(['preview'], { type: 'image/png' }));
        return { images: Array.from({ length: resultCount }, (_, index) => 'image' + index) };
    };
    ${generateSource}
`));

test('MOSS refinement sizes preserve source scale, align to 16 and never exceed 1280 or upscale', () => {
    for (const [width, height, expected] of [
        [640, 480, { width: 640, height: 480 }], [3840, 2160, { width: 1280, height: 720 }],
        [1080, 1920, { width: 720, height: 1280 }], [1200, 800, { width: 1200, height: 800 }],
        [1296, 864, { width: 1280, height: 848 }], [300, 450, { width: 288, height: 448 }],
    ]) {
        const dimensions = mossRefineDimensions(width, height);
        assert.deepEqual(dimensions, expected);
        assert.ok(dimensions.width <= width && dimensions.height <= height);
        assert.ok(Math.max(dimensions.width, dimensions.height) <= 1280);
        const scale = Math.min(1, 1280 / Math.max(width, height));
        assert.ok(Math.abs(dimensions.width - width * scale) < 16 && Math.abs(dimensions.height - height * scale) < 16);
    }
    for (const [width, height] of [[0, 480], [640, 15], [NaN, 32], [32.5, 32], [100000, 16]]) assert.throws(() => mossRefineDimensions(width, height));
});

test('MOSS refinement uses the source VAE latent, independent denoise and optional repeated batches instead of an empty latent', () => {
    const source = { name: 'source.png', width: 1920, height: 1080 };
    for (const batchSize of [1, 3]) for (const refineDenoise of [0, 0.35, 1, undefined]) {
        const options = { ...settings(), refineImage: true, refineDenoise, batchSize, width: 9999, height: 1 };
        const workflow = buildMossWorkflow(options, prompt, seed, source);
        assert.equal(Object.values(workflow).some(node => node.class_type === 'EmptyFlux2LatentImage'), false);
        assert.deepEqual(workflow['moss_input'], { class_type: 'LoadImage', inputs: { image: 'source.png' } });
        assert.deepEqual(workflow['moss_resize'].inputs, { image: ['moss_input', 0], upscale_method: 'bicubic', width: 1280, height: 720, crop: 'disabled' });
        assert.deepEqual(workflow['7'], { class_type: 'VAEEncode', inputs: { pixels: ['moss_resize', 0], vae: ['4', 0] } });
        assert.equal(workflow['18'].inputs.denoise, refineDenoise ?? 0.5);
        assert.deepEqual(workflow['9'].inputs, { samples: ['18', 3], vae: ['4', 0] });
        assert.deepEqual(workflow['18'].inputs.latent_image, batchSize === 1 ? ['7', 0] : ['moss_batch', 0]);
        if (batchSize > 1) assert.deepEqual(workflow['moss_batch'], { class_type: 'RepeatLatentBatch', inputs: { samples: ['7', 0], amount: 3 } });
        else assert.equal(workflow['moss_batch'], undefined);
        assert.doesNotThrow(() => validateMossReadiness(workflow, objectInfo(workflow)));
    }
    assert.deepEqual(buildMossWorkflow(settings(), prompt, seed, source), graph(), 'disabled refinement must ignore an uploaded source');
    assert.throws(() => buildMossWorkflow({ ...settings(), refineImage: true }, prompt, seed), /Choose a source/);
    for (const refineDenoise of [-0.01, 1.01, NaN]) assert.throws(() => buildMossWorkflow({ ...settings(), refineImage: true, refineDenoise }, prompt, seed, source), /sampling settings/);
});

test('MOSS source preparation validates before upload, propagates errors, and uses the uploaded filename for generation and export', async () => {
    const source = { name: 'local.png', type: 'image/png', dimensions: { width: 640, height: 480 } };
    const options = { provider: 'comfyui', comfyModelType: 'moss-image', comfyPrompt: prompt, comfySeed: seed, comfyMoss: { ...settings(), refineImage: true, refineDenoise: 0.25, batchSize: 2 }, numImages: 2 };
    const workflow = buildMossWorkflow(options.comfyMoss, prompt, seed, { name: source.name, ...source.dimensions });
    runner.configure(objectInfo(workflow));
    const prepared = await runner.buildWorkflow(options, source);
    assert.deepEqual(prepared['moss_input'].inputs, { image: 'moss-tests/uploaded-source.png' });
    assert.equal(prepared['18'].inputs.denoise, 0.25);
    assert.equal(runner.uploads.length, 1);
    assert.equal(runner.decodes.length, 1);
    runner.configure(objectInfo(workflow));
    const result = await runner.generateComfyUIPortraits(source, options, () => {});
    assert.equal(result.images.length, 4);
    assert.equal(runner.uploads.length, 1, 'upload once, reuse for every generation');
    for (const call of runner.calls) {
        assert.equal(call.workflow['moss_input'].inputs.image, 'moss-tests/uploaded-source.png');
        assert.equal(call.count, 2);
        assert.deepEqual(call.outputNodes, ['10']);
    }
    for (const missing of ['VAEEncode', 'ImageScale', 'RepeatLatentBatch', 'LoadImage']) {
        const info = objectInfo(workflow); delete info[missing];
        runner.configure(info);
        await assert.rejects(() => runner.buildWorkflow(options, source), /missing nodes/);
        assert.equal(runner.uploads.length, 0);
    }
    runner.configure(objectInfo(workflow));
    await assert.rejects(() => runner.buildWorkflow(options, null), /Choose a source image/);
    await assert.rejects(() => runner.buildWorkflow(options, { ...source, type: 'text/plain' }), /Choose a source image/);
    await assert.rejects(() => runner.buildWorkflow(options, { ...source, decodeError: true }), /Could not decode/);
    assert.equal(runner.uploads.length, 0);
    await assert.rejects(() => runner.buildWorkflow(options, { ...source, uploadError: true }), /upload failed/);
    runner.configure(objectInfo(graph()));
    await runner.buildWorkflow({ ...options, comfyMoss: settings() }, source);
    assert.equal(runner.uploads.length, 0);
    assert.equal(runner.decodes.length, 0);
});

test('MOSS generation honors seed controls, batch output/progress, saved-output filtering and optional previews', async t => {
    const options = { provider: 'comfyui', comfyModelType: 'moss-image', comfyMoss: { ...settings(), batchSize: 2 }, comfyPrompt: prompt, comfySeed: 4, comfySeedIncrement: 2, numImages: 3 };
    for (const [control, expected] of [['fixed', [4, 4, 4]], ['increment', [4, 6, 8]], ['decrement', [4, 2, 0]], ['randomize', null]]) {
        runner.configure(objectInfo(graph()));
        const ready = [], progress = [], previews = [];
        const result = await runner.generateComfyUIPortraits(null, { ...options, comfySeedControl: control }, () => {}, [], (index, image) => ready.push([index, image]), (index, message, value) => progress.push([index, value]), blob => previews.push(blob));
        const seeds = runner.calls.map(call => call.workflow['18'].inputs.seed);
        if (expected) assert.deepEqual(seeds, expected);
        else assert.ok(seeds.every(value => Number.isSafeInteger(value) && value >= 0));
        assert.equal(result.images.length, 6);
        assert.equal(result.finalPrompt, prompt);
        assert.deepEqual(ready.map(([index]) => index), [0, 1, 2, 3, 4, 5]);
        assert.deepEqual([...new Set(progress.map(([index]) => index))], [0, 1, 2, 3, 4, 5]);
        assert.equal(previews.filter(value => value === null).length, 3);
        assert.equal(previews.filter(value => value instanceof Blob).length, 3);
        for (const call of runner.calls) {
            assert.equal(call.longJob, true);
            assert.equal(call.count, 2);
            assert.deepEqual(call.outputNodes, ['10']);
        }
    }
    runner.configure(objectInfo(graph()));
    await assert.doesNotReject(() => runner.generateComfyUIPortraits(null, options, () => {}));
    runner.configure({}, 2);
    await assert.rejects(() => runner.generateComfyUIPortraits(null, options, () => {}), /missing nodes/);
    assert.equal(runner.calls.length, 0);
    runner.configure(objectInfo(graph()), 1);
    t.mock.method(console, 'error', () => {});
    await assert.rejects(() => runner.generateComfyUIPortraits(null, options, () => {}), /returned 1\/2 saved images/);
});
