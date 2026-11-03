import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const helpers = compile(source('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const stylesURL = compile(source('./styleGallery.ts')), styles = await import(stylesURL);
const anglesURL = compile(source('./characterAnglesWorkflow.ts'));
const civitaiURL = compile(source('./civitaiService.ts'));
const workflowURL = compile(source('./blazingFastCharacterWorkflow.ts')
    .replace("import template from '../assets/blazingFastCharacterWorkflow.json';", `const template = ${source('../assets/blazingFastCharacterWorkflow.json')};`)
    .replace("from './characterAnglesWorkflow'", `from '${anglesURL}'`)
    .replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`).replace("from './styleGallery'", `from '${stylesURL}'`));
const workflow = await import(workflowURL);
const serviceHelpers = compile(`import { isRecord } from '${helpers}';\n` + source('./minimaxH3Service.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const moss = compile(source('./mossWorkflow.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const executionURL = compile(source('./comfyGraphExecution.ts').replace("from './minimaxH3Service'", `from '${serviceHelpers}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`).replace("from './mossWorkflow'", `from '${moss}'`));
const execution = await import(executionURL);
const dbURL = compile('export const openDB = (...args) => globalThis.blazingDB(...args);');
const api = await import(compile(source('./blazingFastCharacterService.ts').replace("from 'idb'", `from '${dbURL}'`)
    .replace("from './minimaxH3Service'", `from '${serviceHelpers}'`).replace("from './minimaxH3Workflow'", `from '${helpers}'`)
    .replace("from './comfyGraphExecution'", `from '${executionURL}'`).replace("from './blazingFastCharacterWorkflow'", `from '${workflowURL}'`)));
const libraryURL = compile(source('./blazingFastCharacterLibrary.ts')
    .replace("import JSZip from 'jszip';", 'const JSZip = class {};')
    .replace("import { readRenderedLibraryMedia } from './minimaxH3Library';", "const readRenderedLibraryMedia = async (url, blob) => ({ blob, thumbnail: 'thumbnail' });"));
const library = await import(libraryURL);
test('saved Blazing defaults keep automatic scheduling or force a scheduler for every active pose', () => {
    const style = { ...styles.defaultStyleGallery().styles[5], settings: { steps: 8, cfg: 0, sampler: 'heun', scheduler: 'flux2' } };
    const settings = { ...workflow.defaultBlazingSettings(), styleId: style.id, useStyleSettings: true };
    const graph = workflow.buildBlazingWorkflow(settings, 'source.png', style);
    const schedulers = Object.values(graph).filter(node => node.class_type === 'Flux2Scheduler');
    assert.ok(schedulers.length >= 6);
    for (const node of schedulers) assert.equal(node.inputs.steps, 8);
    for (const node of Object.values(graph).filter(node => node.class_type === 'KSamplerSelect')) assert.equal(node.inputs.sampler_name, 'heun');
    assert.ok(!Object.values(graph).some(node => node.class_type === 'BasicScheduler'));
    const custom = { ...style, settings: { ...style.settings, scheduler: 'bong_tangent' } };
    for (const poseCount of [1, 3, 6]) {
        const forced = workflow.buildBlazingWorkflow({ ...settings, poseCount }, 'source.png', custom);
        const schedulers = Object.entries(forced).filter(([, node]) => node.class_type === 'BasicScheduler');
        assert.equal(schedulers.length, poseCount);
        for (const [id, node] of schedulers) {
            const sample = Object.values(forced).find(value => value.class_type === 'SamplerCustomAdvanced' && value.inputs.sigmas[0] === id);
            assert.deepEqual(node.inputs, { model: forced[sample.inputs.guider[0]].inputs.model,
                steps: 8, scheduler: 'bong_tangent', denoise: 1 });
            assert.ok(forced[node.inputs.model[0]], 'pruning retains the exact sampling model dependency');
        }
        assert.ok(!Object.values(forced).some(node => node.class_type === 'Flux2Scheduler'));
    }
    const manual = workflow.buildBlazingWorkflow({ ...settings, useStyleSettings: false }, 'source.png', custom);
    assert.ok(!Object.values(manual).some(node => node.class_type === 'BasicScheduler'));
});
const draft = () => ({ settings: workflow.defaultBlazingSettings(), file: new File(['image'], 'character.png', { type: 'image/png' }) });
test('forced Blazing scheduler is checked against the live catalog before uploading', async t => {
    const h = harness(t), input = draft();
    const style = { ...styles.defaultStyleGallery().styles[5], settings: { scheduler: 'bong_tangent' } };
    input.settings.styleId = style.id;
    const graph = await api.prepareBlazingWorkflow(input, style, new AbortController().signal);
    assert.ok(h.requests.some(request => request.path === '/object_info/BasicScheduler'));
    assert.equal(Object.values(graph).filter(node => node.class_type === 'BasicScheduler').length, 6);
});
test('unavailable forced scheduler fails before upload or queue', async t => {
    const h = harness(t), input = draft();
    const style = { ...styles.defaultStyleGallery().styles[5], settings: { scheduler: 'not_installed' } };
    input.settings.styleId = style.id;
    await assert.rejects(api.prepareBlazingWorkflow(input, style, new AbortController().signal), /not_installed/);
    assert.ok(!h.requests.some(request => request.path === '/upload/image' || request.path === '/prompt'));
});
test('a missing BasicScheduler fails only when the style forces it', async t => {
    const h = harness(t, { missing: ['BasicScheduler'] }), input = draft();
    const style = { ...styles.defaultStyleGallery().styles[5], settings: { scheduler: 'beta' } };
    input.settings.styleId = style.id;
    await assert.rejects(api.prepareBlazingWorkflow(input, style, new AbortController().signal), /BasicScheduler/);
    assert.ok(!h.requests.some(request => request.path === '/upload/image'));
    input.settings.useStyleSettings = false;
    assert.ok(await api.prepareBlazingWorkflow(input, style, new AbortController().signal));
});
const image = filename => ({ images: [{ filename, type: 'output', subfolder: 'Blazing' }] });
const outputs = () => Object.fromEntries([
    ...workflow.BLAZING_OUTPUTS.map(output => [output.id, image(`${output.id}.png`)]),
    ['358', { text: ['Visible character identity'] }], ['495', { text: ['Actual initial edit prompt'] }],
    ['771', { text: ['Generated six-pose reference sheet description'] }],
]);
function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    const info = Object.fromEntries(Object.values(workflow.BLAZING_TEMPLATE).map(node => [node.class_type, { input: { required: {} } }]));
    info.BasicScheduler = { input: { required: { scheduler: [['beta', 'bong_tangent']] } } };
    info.LoraLoaderModelOnly = { input: { required: { lora_name: [['FLUX2\\moebius_klein_000007500.safetensors']] } } };
    for (const name of config.missing || []) delete info[name];
    let socket, queued;
    const requests = [], progress = [], live = [], partial = [];
    globalThis.WebSocket = class {
        constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
        close() { this.closed = true; }
        emit(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
    };
    globalThis.localStorage = { getItem: () => 'http://localhost:8188' };
    globalThis.fetch = async (url, init = {}) => {
        const path = new URL(url).pathname; requests.push({ path, init });
        const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
        if (path.startsWith('/object_info/')) {
            await config.onSchema?.();
            const name = decodeURIComponent(path.slice('/object_info/'.length));
            return json(info[name] ? { [name]: info[name] } : {});
        }
        if (path === '/upload/image') {
            await config.onUpload?.();
            if (config.uploadError) return new Response('Upload failed', { status: 500 });
            return json(config.uploadResponse ?? { name: init.body.get('image').name, subfolder: 'input' });
        }
        if (path === '/prompt') { queued = JSON.parse(init.body); await config.onQueue?.(socket); return json(config.queueResponse ?? { prompt_id: 'owned-blazing' }); }
        if (path === '/history/owned-blazing') {
            await config.onHistory?.(socket);
            if (config.historyError) return new Response('History unavailable', { status: 503 });
            return json({ 'owned-blazing': config.history ?? { outputs: outputs(), status: { completed: true, status_str: 'success' } } });
        }
        if (path === '/api/jobs/owned-blazing/cancel') {
            await config.onCancel?.(socket);
            return config.cancelError ? new Response('Unsupported', { status: 404 }) : json({ cancelled: true });
        }
        throw new Error(`Unexpected request ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return { requests, progress, live, partial, get queued() { return queued; }, get socket() { return socket; },
        run: (input = draft(), signal = new AbortController().signal, style) => api.generateBlazingCharacter(input, style, signal, (...args) => progress.push(args), value => live.push(value), value => partial.push(value)) };
}
test('gallery contains all 27 supplied filenames, exact known triggers and no invented sampling recommendations', () => {
    const gallery = styles.defaultStyleGallery();
    assert.equal(gallery.styles.length, 27); styles.validateStyleGallery(gallery);
    assert.equal(gallery.styles[3].trigger, 'M0dernPulpC0micInk');
    assert.equal(gallery.styles[5].prompt, 'Moebius');
    assert.equal(gallery.styles[5].trigger, '');
    assert.equal(gallery.styles[7].lora, 'myWmbStyle_v1');
    assert.equal(gallery.styles[10].lora, 'Phone_Photography_2025_KL_9B');
    assert.equal(gallery.styles[19].trigger, 'Dr4g0nB4ll ,1980s_style');
    assert.ok(gallery.styles[11].trigger.includes('Evgeny Migunov'));
    assert.ok(gallery.styles[11].prompt.includes('psychological caricature'));
    assert.ok(gallery.styles.every(style => Object.keys(style.settings).length === 0));
    assert.deepEqual(styles.parseStyleGallery(JSON.stringify(gallery)), gallery);
    assert.deepEqual(styles.parseStyleGallery('{"version":1,"styles":[]}').styles, []);
});
test('gallery supports prompt-only styles, rejects corrupted entries and persists edits/removals without reseeding', t => {
    const previous = { localStorage: globalThis.localStorage, window: globalThis.window };
    const saved = new Map(), events = [];
    globalThis.localStorage = { setItem: (key, value) => saved.set(key, value) };
    globalThis.window = { dispatchEvent: event => events.push(event.type) };
    t.after(() => Object.assign(globalThis, previous));
    const gallery = styles.defaultStyleGallery(); gallery.styles = [gallery.styles[0]];
    Object.assign(gallery.styles[0], { lora: '', prompt: 'A blue pencil drawing', settings: { steps: 8 } });
    styles.saveStyleGallery(gallery);
    assert.deepEqual(styles.parseStyleGallery(saved.get(styles.STYLE_GALLERY_KEY)), gallery);
    assert.deepEqual(events, [styles.STYLE_GALLERY_KEY]);
    assert.throws(() => styles.parseStyleGallery('{bad'), /JSON|property/);
    assert.throws(() => styles.validateStyleGallery({ version: 1, styles: [...gallery.styles, ...gallery.styles] }), /unique/);
    gallery.styles[0].settings.steps = 0; assert.throws(() => styles.saveStyleGallery(gallery), /steps/);
    styles.saveStyleGallery({ version: 1, styles: [] });
    assert.equal(styles.parseStyleGallery(saved.get(styles.STYLE_GALLERY_KEY)).styles.length, 0);
});
test('LoRA resolution respects full paths and never guesses ambiguous or missing files', () => {
    assert.equal(styles.resolveStyleLora('myWmbStyle_v1', ['FLUX2\\myWmbStyle_v1.safetensors']), 'FLUX2\\myWmbStyle_v1.safetensors');
    assert.equal(styles.resolveStyleLora('flux2/m.safetensors', ['FLUX2\\m.safetensors', 'Other\\m.safetensors']), 'FLUX2\\m.safetensors');
    assert.throws(() => styles.resolveStyleLora('m', ['A\\m.safetensors', 'B\\m.safetensors']), /Ambiguous/);
    assert.throws(() => styles.resolveStyleLora('not-installed', ['m.safetensors']), /Missing/);
});
test('default graph preserves source wiring while all six poses, background and style keep the reference', () => {
    const settings = workflow.defaultBlazingSettings(), graph = workflow.buildBlazingWorkflow(settings, 'new.png');
    const expected = structuredClone(workflow.BLAZING_TEMPLATE);
    expected['76'].inputs.image = 'new.png';
    expected['450'].inputs = { model: ['442:435', 0] };
    expected['554:544'] = { class_type: 'PrimitiveString', inputs: { value: 'Same Background' } };
    expected['554:545'] = { class_type: 'PrimitiveString', inputs: { value: 'Same Style' } };
    const prompts = workflow.blazingPrompts(settings);
    expected['445:360'].inputs.value = settings.identitySystem;
    expected['554:546'].inputs.value = prompts.initialExtra;
    for (const [index, output] of workflow.BLAZING_OUTPUTS.slice(1, 6).entries()) expected[output.prompt].inputs.value = prompts.views[index];
    assert.deepEqual(settings.poses, Array.from({ length: 6 }, () => ({ angle: '', pose: '', expression: '' })));
    assert.deepEqual(graph, expected);
    assert.equal(Object.values(graph).filter(node => node.class_type === 'SamplerCustomAdvanced').length, 6);
    assert.equal(Object.values(graph).filter(node => node.class_type === 'SaveImage').length, 8);
    for (const id of ['606:594', '628:614', '652:638', '676:662', '700:686']) assert.deepEqual(graph[id].inputs.image, ['532:476', 0]);
    assert.deepEqual(graph['757:752'].inputs.image, ['751', 0]);
    assert.deepEqual(graph['751'].inputs.anything, ['592', 0]);
    assert.deepEqual(graph['361'].inputs.image_1, ['76', 0]);
    assert.deepEqual(graph['361'].inputs.image_2, ['236', 0]);
    assert.equal(graph['234'].inputs.inputcount, 3); assert.equal(graph['235'].inputs.inputcount, 3);
});
test('randomized poses use existing presets and never change defaults implicitly', async t => {
    const angles = await import(anglesURL), originalRandom = Math.random;
    t.after(() => { Math.random = originalRandom; });
    const before = workflow.defaultBlazingSettings();
    for (const sample of [0, 0.5, 0.999999]) {
        Math.random = () => sample;
        const pose = workflow.randomBlazingPose();
        assert.ok(angles.CHARACTER_ANGLE_OPTIONS.includes(pose.angle));
        assert.ok(angles.CHARACTER_POSE_OPTIONS.includes(pose.pose));
        assert.ok([...angles.CHARACTER_EXPRESSION_OPTIONS, 'laughing'].includes(pose.expression));
        assert.ok(Object.values(pose).every(value => value && value !== angles.CHARACTER_NONE_VALUE));
    }
    assert.deepEqual(workflow.defaultBlazingSettings(), before);
    const text = workflow.blazingPoseText({ angle: 'front view', pose: '', expression: angles.CHARACTER_NONE_VALUE });
    assert.equal(text, 'Camera: front view.\nKeep the reference facial expression.\nKeep the reference pose and posture.');
});
for (let count = 1; count <= 5; count++) {
    test(`${count} poses prune unused samplers, collage, comparison and final-caption branches`, async t => {
        const input = draft(); input.settings.poseCount = count;
        const h = harness(t, { history: { outputs: {
            '358': { text: ['Identity'] },
            ...Object.fromEntries(workflow.BLAZING_OUTPUTS.slice(0, count).map(output => [output.id, image(`${output.id}.png`)])),
        }, status: { completed: true } } });
        const result = await h.run(input);
        assert.equal(result.outcome, 'complete'); assert.equal(result.images.length, count); assert.equal(result.finalCaption, '');
        assert.equal(Object.values(result.workflow).filter(node => node.class_type === 'SamplerCustomAdvanced').length, count);
        assert.equal(Object.values(result.workflow).filter(node => node.class_type === 'SaveImage').length, count);
        for (const id of ['592', '364', '771', '757:752', '234', '235', '236', '361']) assert.ok(!result.workflow[id], id);
        for (const node of Object.values(result.workflow)) {
            for (const value of Object.values(node.inputs)) {
                if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number') assert.ok(result.workflow[value[0]], `Missing link ${value[0]}`);
            }
        }
        assert.ok(result.images.every(output => output.caption.includes('fewer than six poses requested')));
    });
}
test('pose count defaults to six for old drafts and rejects values outside 1–6', () => {
    const settings = workflow.defaultBlazingSettings();
    assert.equal(workflow.blazingPoseCount(settings), 6);
    assert.equal(workflow.blazingOutputs(settings).length, 8);
    for (const poseCount of [0, 7, 1.5, NaN, '2', null]) assert.throws(() => workflow.validateBlazingSettings({ ...settings, poseCount }), /between 1 and 6/);
});
test('style strength override reaches the shared LoRA loader, including zero, without changing gallery defaults', () => {
    const settings = workflow.defaultBlazingSettings(), style = styles.defaultStyleGallery().styles[0];
    settings.styleId = style.id; style.strength = 0.8;
    const before = structuredClone(style);
    assert.equal(workflow.buildBlazingWorkflow(settings, 'image.png', style)['450'].inputs.lora_1.strength, 0.8);
    for (const strength of [0, 0.35, 1.25, -0.5]) {
        settings.styleLoraStrength = strength;
        assert.equal(workflow.buildBlazingWorkflow(settings, 'image.png', style)['450'].inputs.lora_1.strength, strength);
    }
    assert.deepEqual(style, before);
    for (const invalid of [NaN, Infinity, '1', null]) assert.throws(() => workflow.validateBlazingSettings({ ...settings, styleLoraStrength: invalid }), /strength must be finite/);
});
test('all six editable poses, style triggers, optional overrides and LoRAs reach actual graph inputs', () => {
    const settings = workflow.defaultBlazingSettings(), style = styles.defaultStyleGallery().styles[3];
    settings.styleId = style.id; style.settings = { steps: 9, cfg: 2, sampler: 'heun', megapixels: 0.5 };
    settings.prompt = 'Change the jacket'; settings.background = 'Blue background'; settings.seed = 42;
    settings.poses = settings.poses.map((_, index) => ({ angle: `angle${index}`, pose: `pose${index}`, expression: `expression${index}` }));
    settings.loras[2] = { enabled: true, name: 'extra.safetensors', strength: 0.6 };
    const before = structuredClone(settings), graph = workflow.buildBlazingWorkflow(settings, 'new.png', style);
    assert.deepEqual(settings, before);
    assert.equal(graph['426'].inputs.noise_seed, 42); assert.ok(graph['554:546'].inputs.value.includes('Camera: angle0.\nFacial expression: expression0.\nBody pose: pose0.'));
    assert.equal(graph['554:544'].inputs.value, 'Blue background'); assert.equal(graph['554:545'].inputs.value, 'Comic ink cartoon');
    for (const [index, output] of workflow.BLAZING_OUTPUTS.slice(1, 6).entries()) {
        assert.ok(graph[output.prompt].inputs.value.includes(`Camera: angle${index + 1}.\nFacial expression: expression${index + 1}.\nBody pose: pose${index + 1}.`));
        assert.ok(graph[output.prompt].inputs.value.startsWith(`${style.trigger}\n`));
    }
    assert.equal(graph['450'].inputs.lora_1.lora, style.lora);
    assert.equal(graph['450'].inputs.lora_2.lora, 'extra.safetensors'); assert.equal(graph['450'].inputs.lora_2.strength, 0.6);
    for (const node of Object.values(graph)) {
        if (node.class_type === 'Flux2Scheduler') assert.equal(node.inputs.steps, 9);
        if (node.class_type === 'CFGGuider') assert.equal(node.inputs.cfg, 2);
        if (node.class_type === 'ImageScaleToTotalPixels') assert.equal(node.inputs.megapixels, 0.5);
        if (node.class_type === 'KSamplerSelect') assert.equal(node.inputs.sampler_name, 'heun');
    }
    settings.useStyleSettings = false;
    assert.equal(workflow.buildBlazingWorkflow(settings, 'new.png', style)['532:481'].inputs.steps, 4);
    style.lora = ''; style.prompt = 'Prompt-only drawing';
    assert.equal(workflow.buildBlazingWorkflow(settings, 'new.png', style)['450'].inputs.lora_1.lora, 'extra.safetensors');
});
test('visible prompt preview exactly follows initial concatenation and subsequent pose instructions', () => {
    const settings = workflow.defaultBlazingSettings(), style = styles.defaultStyleGallery().styles[3];
    settings.styleId = style.id; settings.prompt = 'Add a red coat'; settings.background = 'Black Background';
    const graph = workflow.buildBlazingWorkflow(settings, 'test.png', style);
    const preview = workflow.blazingPrompts(settings, style, 'Visible identity');
    const evaluate = id => id === '445:357' ? 'Visible identity' : graph[id].class_type === 'StringConcatenate'
        ? evaluate(graph[id].inputs.string_a[0]) + graph[id].inputs.delimiter + evaluate(graph[id].inputs.string_b[0])
        : graph[id].inputs.value;
    assert.equal(preview.initial, evaluate('554:553'));
    assert.ok(preview.initial.startsWith(`${style.trigger}\n`));
    assert.ok(preview.initial.includes(settings.prompt));
    assert.ok(preview.initial.includes(style.trigger));
    workflow.BLAZING_OUTPUTS.slice(1, 6).forEach((output, index) => assert.equal(preview.views[index], graph[output.prompt].inputs.value));
});
test('all poses receive global edits and explicit pose/expression priority independently of rendering style', () => {
    const settings = workflow.defaultBlazingSettings();
    settings.prompt = 'Replace the jacket with a red coat';
    settings.poses[1] = { angle: 'aerial view', expression: 'surprised', pose: 'T-pose' };
    const style = styles.defaultStyleGallery().styles[3];
    settings.styleId = style.id;
    settings.identitySystem = String(workflow.BLAZING_TEMPLATE['445:360'].inputs.value);
    const graph = workflow.buildBlazingWorkflow(settings, 'source.png', style);
    assert.match(graph['445:360'].inputs.value, /Required identity scope/);
    assert.match(graph['445:360'].inputs.value, /Do not describe facial expression/);
    for (const text of [graph['554:546'].inputs.value, ...workflow.BLAZING_OUTPUTS.slice(1, 6).map(output => graph[output.prompt].inputs.value)]) {
        assert.ok(text.includes(settings.prompt));
        assert.match(text, /even when they differ from the reference or identity description/);
        assert.match(text, /style only for visual rendering/);
    }
    const second = graph['606:581'].inputs.value;
    assert.match(second, /Camera: aerial view/);
    assert.match(second, /Facial expression: surprised/);
    assert.match(second, /both arms extended straight sideways at shoulder height/);
    assert.match(second, /Show the entire body and both hands/);
    assert.ok(second.includes(style.trigger));
    assert.equal(graph['606:604'].inputs.cfg, settings.cfg);
    assert.equal(graph['532:481'].inputs.steps, settings.steps);
});
test('Blazing trigger-first preview matches runtime concatenation even for shortened runs and existing prompt triggers', () => {
    const style = styles.defaultStyleGallery().styles[3], settings = workflow.defaultBlazingSettings();
    settings.styleId = style.id;
    settings.prompt = `Add a red coat ${style.trigger}`;
    style.prompt = `${style.trigger}\nComic ink cartoon`;
    for (const poseCount of [1, 4, 6]) {
        settings.poseCount = poseCount;
        const graph = workflow.buildBlazingWorkflow(settings, 'source.png', style);
        const preview = workflow.blazingPrompts(settings, style, 'Visible identity');
        const evaluate = id => id === '445:357' ? 'Visible identity' : graph[id].class_type === 'StringConcatenate'
            ? evaluate(graph[id].inputs.string_a[0]) + graph[id].inputs.delimiter + evaluate(graph[id].inputs.string_b[0])
            : graph[id].inputs.value;
        assert.equal(evaluate('554:553'), preview.initial);
        for (const prompt of [preview.initial, ...workflow.BLAZING_OUTPUTS.slice(1, poseCount).map(output => graph[output.prompt].inputs.value)]) {
            assert.ok(prompt.startsWith(`${style.trigger}\n`));
            assert.equal(prompt.split(style.trigger).length - 1, 1);
            assert.match(prompt, /Add a red coat/);
        }
    }
    const noTrigger = workflow.buildBlazingWorkflow(settings, 'source.png', { ...style, trigger: '' });
    assert.equal(noTrigger.style_trigger, undefined);
    assert.equal(noTrigger.style_identity, undefined);
});
test('requires six poses, compatible selected styles, finite sampling and explicit LoRA selection', () => {
    const settings = workflow.defaultBlazingSettings();
    for (const count of [0, 5, 7]) assert.throws(() => workflow.buildBlazingWorkflow({ ...settings, poses: Array(count).fill(settings.poses[0]) }, 'image.png'), /six poses/);
    assert.throws(() => workflow.buildBlazingWorkflow({ ...settings, steps: NaN }, 'image.png'), /steps/);
    assert.throws(() => workflow.buildBlazingWorkflow({ ...settings, styleId: 'deleted' }, 'image.png'), /no longer exists/);
    const style = styles.defaultStyleGallery().styles[0]; style.model = 'LTX';
    assert.throws(() => workflow.buildBlazingWorkflow({ ...settings, styleId: style.id }, 'image.png', style), /compatible FLUX2-9B style/);
    settings.loras[0].enabled = true; assert.throws(() => workflow.buildBlazingWorkflow(settings, 'image.png'), /valid filename/);
});
test('queues one graph, uploads once and returns six poses plus collage/comparison with real captions', async t => {
    const h = harness(t), input = draft(); input.settings.randomizeSeed = false;
    const result = await h.run(input);
    assert.equal(result.images.length, 8);
    assert.equal(result.draft.settings.seed, 6969696969);
    assert.equal(h.requests.filter(request => request.path === '/prompt').length, 1);
    assert.equal(h.requests.filter(request => request.path === '/upload/image').length, 1);
    assert.match(result.workflow['76'].inputs.image, /^input\/blazing-/);
    assert.ok(result.images[0].caption.includes('Actual initial edit prompt'));
    for (const output of result.images) {
        assert.ok(output.caption.includes('Visible character identity'));
        assert.ok(output.caption.includes('Generated six-pose reference sheet description'));
        assert.equal(new URL(output.url).searchParams.get('filename'), `${output.id}.png`);
    }
    assert.ok(result.images[7].caption.includes('original reference on the left'));
    assert.equal(h.socket.closed, true);
});
test('random seed changes only the execution snapshot', async t => {
    const h = harness(t), input = draft(), before = structuredClone(input.settings);
    const result = await h.run(input); assert.deepEqual(input.settings, before);
    assert.ok(Number.isSafeInteger(result.draft.settings.seed));
    assert.equal(result.draft.settings.seed, h.queued.prompt['426'].inputs.noise_seed);
});
for (const missing of ['TextGenerate', 'ImageConcatMulti', 'easy cleanGpuUsed', 'Power Lora Loader (rgthree)']) {
    test(`missing ${missing} blocks upload and submission`, async t => {
        const h = harness(t, { missing: [missing] });
        await assert.rejects(h.run(), /Missing ComfyUI nodes/);
        assert.ok(!h.requests.some(request => ['/prompt', '/upload/image'].includes(request.path)));
    });
}
test('missing style LoRA fails before upload instead of falling back to plain generation', async t => {
    const h = harness(t), input = draft(), style = styles.defaultStyleGallery().styles[0];
    input.settings.styleId = style.id;
    await assert.rejects(h.run(input, new AbortController().signal, style), /Missing LoRA/);
    assert.ok(!h.requests.some(request => request.path === '/upload/image'));
});
test('live images, cache hits, sampling and caption stages ignore foreign jobs', async t => {
    const h = harness(t, { onQueue: socket => {
        socket.emit('executed', { prompt_id: 'foreign', node: '449', output: image('foreign.png') });
        socket.emit('executed', { prompt_id: 'owned-blazing', node: '449', output: image('early.png') });
        socket.emit('execution_cached', { prompt_id: 'owned-blazing', nodes: ['442:435', '442:436'] });
        socket.emit('executing', { prompt_id: 'owned-blazing', node: '606:605' });
        socket.emit('progress', { prompt_id: 'owned-blazing', value: 2, max: 4 });
        socket.emit('progress', { prompt_id: 'foreign', value: 999, max: 999 });
        socket.emit('executing', { prompt_id: 'owned-blazing', node: '757:752' });
    } });
    await h.run();
    assert.ok(h.live.some(value => value.outputs['449']?.images?.[0]?.filename === 'early.png'));
    assert.ok(!h.live.some(value => value.outputs['449']?.images?.[0]?.filename === 'foreign.png'));
    assert.ok(h.live.some(value => value.step === 2 && value.total === 4));
    assert.ok(!h.live.some(value => value.step === 999));
    assert.ok(h.live.some(value => value.completedNodes.includes('442:435')));
    assert.ok(h.live.some(value => value.node === '757:752'));
});
test('binary preview packets are accepted only during owned sampling', async t => {
    const packet = new ArrayBuffer(11), header = new DataView(packet); header.setUint32(0, 1); header.setUint32(4, 2);
    const h = harness(t, { onHistory: socket => {
        socket.emit('executing', { prompt_id: 'owned-blazing', node: '757:752' }); socket.onmessage({ data: packet });
        socket.emit('executing', { prompt_id: 'owned-blazing', node: '532:484' }); socket.onmessage({ data: packet });
        socket.emit('executing', { prompt_id: 'foreign', node: '532:484' }); socket.onmessage({ data: packet });
    } });
    await h.run(); assert.equal(new Set(h.live.filter(value => value.preview).map(value => value.preview)).size, 1);
    assert.equal(h.live.find(value => value.preview).preview.type, 'image/png');
});
for (const stage of ['schema', 'upload', 'queue', 'history']) {
    test(`Cancel during ${stage} never interrupts another job`, async t => {
        const abort = new AbortController(), config = { [`on${stage[0].toUpperCase()}${stage.slice(1)}`]: () => abort.abort() };
        const h = harness(t, config);
        await assert.rejects(h.run(draft(), abort.signal), error => error.name === 'AbortError');
        assert.ok(!h.requests.some(request => request.path === '/interrupt' || request.path === '/queue'));
        const cancellation = h.requests.filter(request => request.path === '/api/jobs/owned-blazing/cancel');
        assert.equal(cancellation.length, ['queue', 'history'].includes(stage) ? 1 : 0);
        if (stage === 'schema') assert.ok(!h.requests.some(request => request.path === '/upload/image'));
        if (stage === 'upload') assert.ok(!h.requests.some(request => request.path === '/prompt'));
    });
}
test('unsupported targeted cancellation reports the owned job and never sends global interrupt', async t => {
    const abort = new AbortController(), h = harness(t, { onQueue: () => abort.abort(), cancelError: true });
    await assert.rejects(h.run(draft(), abort.signal), /owned-blazing.*could not be confirmed.*No global interrupt/);
    assert.ok(!h.requests.some(request => request.path === '/interrupt'));
});
test('cancel recovers completed files from history even without live output messages', async t => {
    const abort = new AbortController();
    const config = { onHistory: () => abort.abort(), history: { status: { completed: false }, outputs: {} } };
    config.onCancel = () => { config.history = { status: { completed: false, status_str: 'error' }, outputs: {
        '449': image('first.png'), '629': image('third.png'), '358': { text: ['Original identity'] },
    } }; };
    const h = harness(t, config), input = draft(); input.settings.styleLoraStrength = 0.4;
    await assert.rejects(h.run(input, abort.signal), error => error.name === 'AbortError');
    assert.equal(h.partial.length, 1);
    const result = h.partial[0];
    assert.equal(result.outcome, 'cancelled'); assert.equal(result.promptId, 'owned-blazing');
    assert.deepEqual(result.images.map(output => output.id), ['449', '629']);
    assert.equal(result.finalCaption, '');
    assert.ok(result.images.every(output => output.caption.includes('execution stopped before it was generated')));
    assert.equal(result.draft.settings.seed, h.queued.prompt['426'].inputs.noise_seed);
    assert.equal(result.draft.settings.styleLoraStrength, 0.4);
    globalThis.fetch = async () => new Response(new Blob(['png'], { type: 'image/png' }));
    const { item } = await library.buildBlazingLibraryImage(result, '629');
    assert.equal(item.blazingFastOptions.outcome, 'cancelled');
    assert.equal(item.blazingFastOptions.outputId, '629');
    assert.equal(item.blazingFastOptions.finalCaption, '');
    assert.ok(library.buildBlazingLibraryCaption({ ...item, id: 123 }).media.includes('Generation outcome: cancelled.'));
    await assert.rejects(library.buildBlazingLibraryImage(result, '592'), /Unknown/);
});
test('history recovery failure is explicit but live completed files remain exportable', async t => {
    const abort = new AbortController(), config = { onHistory: () => abort.abort(), onQueue: socket => {
        socket.emit('executed', { prompt_id: 'foreign', node: '591', output: image('foreign.png') });
        socket.emit('executed', { prompt_id: 'owned-blazing', node: '449', output: image('completed.png') });
    }, onCancel: () => { config.historyError = true; } };
    const h = harness(t, config);
    await assert.rejects(h.run(draft(), abort.signal), /Output recovery failed.*History unavailable/);
    assert.equal(h.partial.length, 1);
    assert.deepEqual(h.partial[0].images.map(output => output.id), ['449']);
    assert.equal(h.partial[0].outcome, 'failed');
    assert.ok(h.socket.closed);
});
test('execution failure keeps actual completed images but still reports the failure', async t => {
    const h = harness(t, { history: { status: { status_str: 'error', messages: ['out of memory'] }, outputs: { '449': image('completed.png') } } });
    await assert.rejects(h.run(), /out of memory/);
    assert.equal(h.partial.length, 1); assert.equal(h.partial[0].images.length, 1);
    assert.equal(h.partial[0].outcome, 'failed');
});
for (const id of ['449', '701', '592', '364', '771', '358']) {
    test(`completed history missing required output ${id} is an explicit failure`, async t => {
        const data = outputs(); delete data[id];
        const h = harness(t, { history: { outputs: data, status: { completed: true } } });
        await assert.rejects(h.run(), /finished without/);
    });
}
test('history execution errors propagate without fabricated results', async t => {
    const h = harness(t, { history: { status: { status_str: 'error', messages: ['out of memory'] } } });
    await assert.rejects(h.run(), /out of memory/);
});
test('offline empty previews do not require a configured ComfyUI URL', () => {
    assert.equal(execution.comfyOutputImage(undefined), undefined);
    assert.equal(execution.comfyOutputImage({ images: [] }), undefined);
    assert.equal(execution.comfyOutputText({ text: ['one', 'two'] }), 'one\ntwo');
    assert.equal(execution.comfyOutputText({ text: [42] }), '');
});
test('all eight Library images retain original reference, exact graph, style snapshot and linked TXT metadata', async t => {
    const h = harness(t), input = draft(), style = styles.defaultStyleGallery().styles[5];
    input.settings.styleId = style.id; input.settings.styleLoraStrength = 0.35;
    const result = await h.run(input, new AbortController().signal, style);
    globalThis.fetch = async () => new Response(new Blob(['png'], { type: 'image/png' }));
    for (const [index, output] of result.images.entries()) {
        const { item } = await library.buildBlazingLibraryImage(result, output.id);
        assert.equal(item.mediaType, 'character'); assert.equal(item.assetBlobs.sourceImage.name, 'character.png');
        assert.equal(item.assetBlobs.media.type, 'image/png');
        assert.deepEqual(item.blazingFastOptions.workflow, result.workflow);
        assert.equal(item.blazingFastOptions.settings.styleLoraStrength, 0.35);
        assert.equal(item.blazingFastOptions.style.strength, 1);
        assert.equal(item.blazingFastOptions.caption, output.caption);
        const caption = library.buildBlazingLibraryCaption({ ...item, id: 100 + index });
        assert.equal(caption.linkedResultId, 100 + index); assert.equal(caption.media, output.caption);
        assert.equal(caption.mediaType, 'prompt');
    }
});
test('non-image output downloads and cancellation cannot produce successful Library items', async t => {
    const h = harness(t), result = await h.run();
    globalThis.fetch = async () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } });
    await assert.rejects(library.buildBlazingLibraryImage(result, '592'), /non-image/);
});
test('draft and source File persist; corrupted storage rejects rather than overwriting', async t => {
    const before = globalThis.blazingDB, data = new Map(); let closed = 0;
    globalThis.blazingDB = async () => ({ get: async (_, key) => data.get(key), put: async (_, value, key) => data.set(key, structuredClone(value)), close: () => closed++ });
    t.after(() => { globalThis.blazingDB = before; });
    const value = draft(); value.settings.prompt = 'Persistent editing prompt'; value.settings.styleLoraStrength = 0.65;
    await api.saveBlazingDraft(value);
    const restored = await api.loadBlazingDraft(); assert.deepEqual(restored.settings, value.settings); assert.equal(await restored.file.text(), 'image');
    data.set('draft', { settings: { version: 99 } });
    await assert.rejects(api.loadBlazingDraft(), /version/);
    assert.equal(closed, 3);
});
