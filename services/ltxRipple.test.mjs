import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const template = JSON.parse(read('../assets/ltxRippleFFAFWorkflow.json'));
const helpersURL = compile(read('./minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
export const workflowURL = compile(read('./ltxRippleWorkflow.ts')
    .replace("import template from '../assets/ltxRippleFFAFWorkflow.json';", `const template = ${JSON.stringify(template)};`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`));
const workflow = await import(workflowURL);
const requestURL = compile(`import { isRecord } from '${helpersURL}';\n` + read('./minimaxH3Service.ts').replace(/import[\s\S]*?from\s+'[^']+';/g, ''));
const graphURL = compile(read('./comfyGraphExecution.ts')
    .replace("from './minimaxH3Service'", `from '${requestURL}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`)
    .replace("import { mossPreviewBlob } from './mossWorkflow';", 'const mossPreviewBlob = () => undefined;'));
const service = await import(compile(read('./ltxRippleService.ts')
    .replace("from './minimaxH3Service'", `from '${requestURL}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`)
    .replace("from './ltxRippleWorkflow'", `from '${workflowURL}'`)
    .replace("from './comfyGraphExecution'", `from '${graphURL}'`)));
const files = { image: 'edited.png', video: 'source.mp4' };
const draft = () => ({ ...workflow.defaultRippleDraft(),
    image: new File(['image'], files.image, { type: 'image/png', lastModified: 1 }),
    video: new File(['video'], files.video, { type: 'video/mp4', lastModified: 2 }),
});
const build = (settings = workflow.defaultRippleSettings(), info) => workflow.buildRippleWorkflow(settings, draft().prompt, files, info);

test('explicit extension retains the supplied API graph; extension is disabled by default', () => {
    const expected = structuredClone(template);
    for (const id of ['445', '815', '933', '935', '952']) delete expected[id];
    expected['1304'].inputs.image = files.image;
    expected['790'].inputs.video = files.video;
    const extended = workflow.defaultRippleSettings(); extended.allowExtraFrames = true;
    assert.deepEqual(build(extended), expected);
    const settings = workflow.defaultRippleSettings();
    assert.equal(settings.randomizeSeed, false);
    assert.equal(settings.allowExtraFrames, false);
    assert.equal(settings.nodes['1232'].seed, 132644);
    assert.equal(settings.nodes['937'].value, 217);
    assert.equal(settings.nodes['936'].value, 24);
    assert.equal(settings.nodes['1312'].strength_model, 1.35);
    assert.equal(settings.nodes['1319'].steps, 8);
    assert.equal(settings.nodes['1331'].megapixels, 0.4);
    assert.deepEqual(build()['425'].inputs.audio, ['790', 2]);
    assert.equal(build()['786'].inputs.audio, undefined);
    assert.equal(settings.loras.length, 4);
    assert.ok(settings.loras.every(lora => !lora.enabled));
    const graph = build();
    for (const node of Object.values(graph)) for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[value[0]], value[0]);
    }
});
test('every primitive option is exposed without exposing links, file names or disconnected placeholders', () => {
    const settings = workflow.defaultRippleSettings(), graph = build();
    for (const [id, node] of Object.entries(graph)) for (const [name, value] of Object.entries(node.inputs)) {
        if (id.startsWith('ripple_')) continue;
        if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
        if (['1304:image', '790:video', '814:text', '425:frame_rate', '780:frame_rate', '786:frame_rate'].includes(`${id}:${name}`)) continue;
        assert.equal(settings.nodes[id][name], value, `${id}:${name}`);
    }
    assert.equal(settings.nodes['933'], undefined);
    assert.equal(settings.nodes['814'].text, undefined);
    const changed = workflow.defaultRippleSettings();
    changed.nodes['936'].value = 30; changed.nodes['937'].value = 97;
    changed.nodes['790'].skip_first_frames = 12; changed.nodes['1319'].steps = 12;
    const result = build(changed);
    assert.ok(workflow.RIPPLE_OUTPUTS.every(({ id }) => result[id].inputs.frame_rate === 30));
    assert.equal(result['790'].inputs.skip_first_frames, 12);
    assert.equal(result['1319'].inputs.steps, 12);
});
test('five seconds at 24 FPS fits to 113 frames, never 217 or a rounded-up 121', () => {
    const settings = workflow.defaultRippleSettings();
    assert.equal(workflow.rippleSourceFrameLimit(settings, 5), 113);
    const fitted = workflow.fitRippleToSource(settings, 5, true);
    assert.equal(fitted.nodes['937'].value, 113);
    assert.ok(fitted.nodes['937'].value / fitted.nodes['936'].value <= 5);
    assert.equal(settings.nodes['937'].value, 217);
    fitted.nodes['937'].value = 97;
    assert.equal(workflow.fitRippleToSource(fitted, 5).nodes['937'].value, 97, 'Manual shortening survives');
    fitted.allowExtraFrames = true; fitted.nodes['937'].value = 217;
    assert.equal(workflow.fitRippleToSource(fitted, 5).nodes['937'].value, 217);
    fitted.allowExtraFrames = false;
    assert.equal(workflow.fitRippleToSource(fitted, 5).nodes['937'].value, 113, 'Disabling extension clamps immediately');
});
test('source limit accounts for FPS, skipped frames, stride and invalid/short passages', () => {
    const settings = workflow.defaultRippleSettings();
    settings.nodes['936'].value = 30;
    assert.equal(workflow.rippleSourceFrameLimit(settings, 5), 145);
    settings.nodes['790'].skip_first_frames = 10;
    settings.nodes['790'].select_every_nth = 2;
    assert.equal(workflow.rippleSourceFrameLimit(settings, 5), 65);
    settings.nodes['936'].value = 24;
    settings.nodes['790'].skip_first_frames = 103;
    assert.throws(() => workflow.rippleSourceFrameLimit(settings, 5), /too short/, '17 remaining frames at stride 2 yield 8, not 9');
    for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => workflow.rippleSourceFrameLimit(settings, duration));
});
test('safe graph caps video/audio latents and all source/comparison frames to the actual loaded count', () => {
    const settings = workflow.defaultRippleSettings();
    delete settings.allowExtraFrames;
    const graph = build(settings);
    assert.deepEqual(graph.ripple_frame_count.inputs['values.a'], ['790', 1]);
    assert.deepEqual(graph['567'].inputs.length, ['ripple_frame_count', 1]);
    assert.deepEqual(graph['1257'].inputs.frames_number, ['ripple_frame_count', 1]);
    assert.deepEqual(graph['1289'].inputs.stop, ['ripple_frame_count', 1]);
    assert.deepEqual(graph.ripple_source_frames.inputs.frames, ['790', 0]);
    assert.deepEqual(graph['782'].inputs.image, ['ripple_source_frames', 0]);
    assert.deepEqual(graph['780'].inputs.images, ['ripple_source_frames', 0]);
    const evaluate = new Function('a', 'floor', `return ${graph.ripple_frame_count.inputs.expression}`);
    for (const count of [9, 17, 119, 120, 121, 127, 128, 129, 217, 240, 1000]) {
        const aligned = evaluate(count, Math.floor);
        assert.ok(aligned <= count && count - aligned < 8);
        assert.equal((aligned - 1) % 8, 0);
    }
    assert.equal(evaluate(120, Math.floor), 113);
    assert.deepEqual(graph['790'].inputs.frame_load_cap, ['937', 0], 'Manual reductions still limit decoding');
});
test('four optional model-only LoRAs extend Ripple before all optimization and sampling consumers', () => {
    const settings = workflow.defaultRippleSettings();
    settings.loras = settings.loras.map((lora, index) => ({ ...lora, enabled: true, name: `LTX2/custom${index}.safetensors`, strength: index * 0.25 }));
    const graph = build(settings);
    for (let index = 0; index < 4; index++) {
        assert.deepEqual(graph[`ripple_lora_${index + 1}`].inputs.model, [index ? `ripple_lora_${index}` : '1312', 0]);
        assert.equal(graph[`ripple_lora_${index + 1}`].inputs.strength_model, index * 0.25);
    }
    assert.deepEqual(graph['1332'].inputs.model, ['ripple_lora_4', 0]);
    assert.deepEqual(graph['1320'].inputs.model, ['1332', 0]);
    assert.deepEqual(graph['1321'].inputs.model, ['1320', 0]);
    assert.deepEqual(graph['1267'].inputs.model, ['1321', 0]);
    assert.deepEqual(graph['1319'].inputs.model, ['1321', 0]);
    assert.equal(template['1332'].inputs.model[0], '1312');
});
test('invalid inputs and settings fail before rendering rather than silently changing the workflow', () => {
    for (const [id, name, value] of [['937', 'value', 216], ['936', 'value', 0], ['1232', 'seed', -1],
        ['1319', 'steps', 0], ['1319', 'denoise', 2], ['790', 'select_every_nth', 0], ['1267', 'cfg', NaN]]) {
        const settings = workflow.defaultRippleSettings(); settings.nodes[id][name] = value;
        assert.throws(() => build(settings));
    }
    const injected = workflow.defaultRippleSettings(); injected.nodes['1330'].image = 'rewire';
    assert.throws(() => build(injected), /Invalid Ripple setting/);
    const missing = workflow.defaultRippleSettings(); delete missing.nodes['1312'].strength_model;
    assert.throws(() => build(missing), /Missing Ripple setting/);
    assert.throws(() => workflow.validateRippleDraft({ ...draft(), image: null }), /first-frame image/);
    assert.throws(() => workflow.validateRippleDraft({ ...draft(), video: null }), /source video/);
    assert.throws(() => workflow.validateRippleDraft({ ...draft(), prompt: ' ' }), /editing prompt/);
});
test('saved setups snapshot original input identities, file timestamps and independent settings', () => {
    const settings = workflow.defaultRippleSettings(), input = { ...draft(), videoDuration: 5 };
    const setup = workflow.rippleSavedSetup(input, settings);
    assert.deepEqual(setup.image, { name: files.image, type: 'image/png', lastModified: 1 });
    assert.deepEqual(setup.video, { name: files.video, type: 'video/mp4', lastModified: 2 });
    assert.equal(setup.videoDuration, 5);
    assert.equal(setup.settings.allowExtraFrames, false);
    settings.nodes['1319'].steps = 99;
    assert.equal(setup.settings.nodes['1319'].steps, 8);
});
function harness(t, config = {}) {
    const previous = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket, localStorage: globalThis.localStorage };
    const requests = [], progress = [], live = [];
    let socket, queued;
    const info = Object.fromEntries(Object.values(build()).map(node => [node.class_type, { input: { required: {} } }]));
    info.LoraLoaderModelOnly.input.required.lora_name = [[template['1312'].inputs.lora_name, 'LTX2/custom.safetensors']];
    if (config.missing) delete info[config.missing];
    class Socket {
        constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
        close() { this.closed = true; }
        emit(type, data) { this.onmessage?.({ data: JSON.stringify({ type, data }) }); }
    }
    globalThis.WebSocket = Socket;
    globalThis.localStorage = { getItem: () => 'http://localhost:8188' };
    globalThis.fetch = async (url, init = {}) => {
        const path = new URL(url).pathname;
        requests.push({ path, init });
        const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
        if (path.startsWith('/object_info/')) {
            const name = decodeURIComponent(path.slice('/object_info/'.length));
            await config.onSchema?.();
            return json(info[name] ? { [name]: info[name] } : {});
        }
        if (path === '/upload/image') {
            await config.onUpload?.();
            if (config.uploadError) return new Response('Upload failed', { status: 500 });
            return json({ name: init.body.get('image').name, subfolder: 'ripple-input' });
        }
        if (path === '/prompt') { queued = JSON.parse(init.body); await config.onQueue?.(); return json({ prompt_id: 'ripple-owned' }); }
        if (path === '/history/ripple-owned') {
            socket.emit('executing', { prompt_id: 'foreign-job', node: '1269' });
            socket.emit('progress', { prompt_id: 'foreign-job', value: 999, max: 999 });
            socket.emit('executing', { prompt_id: 'ripple-owned', node: '1269' });
            socket.emit('progress', { prompt_id: 'ripple-owned', value: 2, max: 8 });
            const outputs = Object.fromEntries(workflow.RIPPLE_OUTPUTS.filter(output => output.id !== config.missingOutput)
                .map(output => [output.id, { gifs: [{ filename: `${output.id}.mp4`, subfolder: 'Ripple_Edit', type: 'output' }] }]));
            return json({ 'ripple-owned': { outputs, status: config.failure ? { status_str: 'error', messages: ['Sampler failed'] } : { completed: true } } });
        }
        if (path === '/api/jobs/ripple-owned/cancel') return config.cancelError ? new Response('unsupported', { status: 404 }) : json({ cancelled: true });
        throw new Error(`Unexpected request ${path}`);
    };
    t.after(() => Object.assign(globalThis, previous));
    return { requests, progress, live, get queued() { return queued; }, get socket() { return socket; },
        run: (settings = workflow.defaultRippleSettings(), signal = new AbortController().signal) =>
            service.generateRippleVideo(draft(), settings, signal, (...value) => progress.push(value), value => live.push(value)),
    };
}
test('generation preflights before uploading, queues one graph and collects all three exact output nodes', async t => {
    const h = harness(t), result = await h.run();
    assert.equal(result.promptId, 'ripple-owned');
    assert.equal(result.videos.length, 3);
    for (const output of result.videos) assert.match(output.url, new RegExp(`filename=${output.id}.mp4`));
    assert.equal(h.requests.filter(request => request.path === '/prompt').length, 1);
    const uploads = h.requests.filter(request => request.path === '/upload/image');
    assert.equal(uploads.length, 2);
    assert.ok(uploads.every(request => request.init.body.get('overwrite') === 'false'));
    assert.match(h.queued.prompt['1304'].inputs.image, /^ripple-input\/ltx-ripple-/);
    assert.match(h.queued.prompt['790'].inputs.video, /^ripple-input\/ltx-ripple-/);
    assert.equal(h.queued.prompt['814'].inputs.text, draft().prompt);
    assert.ok(h.progress.some(([message]) => message.includes('2/8')));
    assert.ok(!h.progress.some(([message]) => message.includes('999')));
    assert.equal(h.socket.closed, true);
});
for (const missing of ['LTXAddVideoICLoRAGuide', 'CacheDiT_LTX2_Optimizer', 'Frames Slice', 'LTX2MemoryEfficientSageAttentionPatch', 'ComfyMathExpression']) {
    test(`missing ${missing} blocks uploads and queueing`, async t => {
        const h = harness(t, { missing });
        await assert.rejects(h.run(), /Missing ComfyUI nodes/);
        assert.ok(!h.requests.some(request => ['/upload/image', '/prompt'].includes(request.path)));
    });
}
test('missing selected LoRA is explicit, with no upload or queued graph', async t => {
    const h = harness(t), settings = workflow.defaultRippleSettings();
    settings.loras[0] = { enabled: true, name: 'missing.safetensors', strength: 1 };
    await assert.rejects(h.run(settings), /unavailable/);
    assert.ok(!h.requests.some(request => request.path === '/upload/image'));
});
for (const id of ['425', '780', '786']) test(`missing output ${id} is not reported as success`, async t => {
    const h = harness(t, { missingOutput: id });
    await assert.rejects(h.run(), /completed without/);
    assert.equal(h.socket.closed, true);
});
for (const stage of ['Schema', 'Upload', 'Queue']) test(`cancel during ${stage} never interrupts a foreign job`, async t => {
    const abort = new AbortController(), h = harness(t, { [`on${stage}`]: () => abort.abort() });
    await assert.rejects(h.run(undefined, abort.signal));
    const cancelled = h.requests.filter(request => request.path.includes('/cancel'));
    assert.equal(cancelled.length, stage === 'Queue' ? 1 : 0);
    assert.ok(h.requests.every(request => !['/interrupt', '/queue'].includes(request.path)));
    if (stage === 'Queue') assert.equal(cancelled[0].path, '/api/jobs/ripple-owned/cancel');
});
test('failed sampling remains a failure, not empty successful outputs', async t => {
    const h = harness(t, { failure: true });
    await assert.rejects(h.run(), /Sampler failed/);
});
test('failed upload does not submit a workflow', async t => {
    const h = harness(t, { uploadError: true });
    await assert.rejects(h.run(), /Upload failed/);
    assert.ok(!h.requests.some(request => request.path === '/prompt'));
});
test('unsupported targeted cancellation is explicit and never falls back to global interrupt', async t => {
    const abort = new AbortController(), h = harness(t, { cancelError: true, onQueue: () => abort.abort() });
    await assert.rejects(h.run(undefined, abort.signal), /cancel|404|unsupported/i);
    assert.ok(!h.requests.some(request => request.path === '/interrupt'));
});
test('Library, Drive and workspace routing retain Ripple sources and do not route them into H3', () => {
    assert.match(read('./idbLibraryService.ts'), /const ASSET_FIELDS[^\n]*'ltxRippleVideo'/);
    assert.match(read('./videoPromptService.ts'), /rippleDraft\?:/);
    assert.equal((read('./libraryService.ts').match(/(?:newItem|itemMetadata)\.ltxRippleOptions/g) || []).length, 3);
    const app = read('../App.tsx'), workspace = read('../components/VideoWorkspace.tsx');
    assert.match(app, /item\.ltxRippleOptions[\s\S]*?setVideoPromptDestination\('ltx-ripple-ffaf'\)/);
    assert.match(workspace, /libraryWorkflow === 'ltx-ripple-ffaf'\) return/);
    assert.match(workspace, /libraryItem=\{libraryWorkflow === 'ltx-ripple-ffaf' \? libraryItem : null\}/);
});
