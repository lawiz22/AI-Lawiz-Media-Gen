import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const strip = text => text.replace(/import[\s\S]*?from\s+'[^']+';/g, '');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const apiURL = compile(['./styleGallery.ts', './h3StyleWorkflow.ts', './videoPromptService.ts', './minimaxH3Workflow.ts',
    './minimaxH3AdvancedWorkflow.ts', './minimaxH3UltrafastWorkflow.ts'].map(name => strip(read(name))).join('\n'));
const api = await import(apiURL);
const civitaiURL = compile(read('./civitaiService.ts'));
const libraryURL = compile(read('./styleLibrary.ts').replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './styleGallery'", `from '${apiURL}'`));
const library = await import(libraryURL);
const style = { id: 'h3-ink', model: 'H3', title: 'Ink', trigger: 'INK', prompt: 'Engraved film', lora: 'H3\\ink.safetensors',
    strength: 0.65, notes: 'Keep', settings: { steps: 8, cfg: 7, sampler: 'euler', scheduler: 'simple', megapixels: 3 } };
const paint = { ...style, id: 'h3-paint', title: 'Paint', trigger: 'PAINT', prompt: 'Oil brushwork', lora: 'paint.safetensors' };
const names = ['H3\\ink.safetensors', 'H3\\paint.safetensors', 'H3\\detail.safetensors'];
const inventory = { root: '', scannedAt: null, items: [] };
const input = (variant, references = []) => ({ id: 'test', workflow: variant, prompt: 'A rainy street.', references, aspect: '4:3', duration: 3, template: 'generation' });
const reference = kind => ({ id: kind, kind, slot: 1, note: '', file: new File(['reference'], `${kind}.test`, { type: `${kind}/test` }) });
const build = (options, draft = input(options.variant || 'reference')) =>
    api.buildH3RenderWorkflow(draft, options, Object.fromEntries(draft.references.map(ref => [ref.id, ref.file.name])));
const assertDAG = graph => {
    const active = new Set(), visited = new Set();
    const visit = id => {
        assert.ok(graph[id], `Missing node ${id}`);
        assert.ok(!active.has(id), `Cycle at ${id}`);
        if (visited.has(id)) return;
        active.add(id);
        for (const value of Object.values(graph[id].inputs)) if (Array.isArray(value)) visit(value[0]);
        active.delete(id); visited.add(id);
    };
    for (const id of Object.keys(graph)) visit(id);
};
const text = (graph, value) => {
    if (typeof value === 'string') return value;
    const node = graph[value[0]];
    if (node.class_type === 'MiniMaxH3ReferencePack') return 'REWRITTEN direction <Picture 1>.';
    if (node.class_type === 'PrimitiveStringMultiline') return node.inputs.value;
    assert.equal(node.class_type, 'StringConcatenate');
    return [text(graph, node.inputs.string_a), text(graph, node.inputs.string_b)].join(node.inputs.delimiter);
};
const styleLoaderInputs = (variant, model, clip, strength = style.strength) => variant === 'ultrafast'
    ? { model, clip, mode: 'minimax', stack_data: JSON.stringify([{ on: true, lora: style.lora, str: strength, v: 1, a: 1, t: 1 }]) }
    : { model, clip, lora_1: { on: true, lora: style.lora, strength } };
const renameStyleLoader = graph => Object.fromEntries(Object.entries(graph).map(([id, node]) => [
    id === 'style_lora' ? '137' : id,
    { ...node, inputs: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) =>
        [key, Array.isArray(value) && value[0] === 'style_lora' ? ['137', value[1]] : value])) },
]));

test('H3 aliases and Library metadata are retained while selectable files stay in the H3 folder', () => {
    for (const model of ['H3', 'h3', 'MiniMax', 'MiniMax-H3', 'H3 / MiniMax', 'H/minimax']) {
        assert.equal(api.normalizeStyleModel(model), 'H3');
        assert.equal(library.styleModelFamily(model), 'minimax-h3');
    }
    const item = { kind: 'lora', path: 'C:\\models\\custom.safetensors', relativePath: 'loras\\Custom\\custom.safetensors',
        fileName: 'custom.safetensors', userFamily: 'minimax-h3', sha256: 'hash',
        usageMetadata: { triggerWords: ['LIBRARY'], steps: 6, cfg: 2, sampler: 'Euler' } };
    const wrong = { ...item, path: 'C:\\models\\wrong.safetensors', relativePath: 'loras\\H3\\wrong.safetensors', userFamily: 'flux' };
    const inv = { ...inventory, items: [item, wrong] };
    assert.deepEqual(library.styleInstalledLoras([...names, 'MiniMax\\vhs.safetensors', 'Custom\\custom.safetensors', 'H3\\wrong.safetensors', 'flux2\\ink.safetensors'], 'H3', inv),
        names);
    const linked = library.linkStyleLibrary({ ...style, lora: '', trigger: '', settings: {} }, item);
    const resolved = library.resolveLibraryStyle(linked, inv, ['euler']);
    assert.equal(resolved.item, item);
    assert.equal(resolved.style.trigger, 'LIBRARY');
    assert.deepEqual(resolved.style.settings, { steps: 6, cfg: 2, sampler: 'euler' });
    assert.deepEqual(library.unusedStyleLoras(['Custom\\custom.safetensors', ...names], [linked], 'H3', inv), names);
});

for (const variant of ['reference', 'ultrafast', 'advanced']) {
    test(`${variant}: gallery model and CLIP chains exactly match manual LoRA + patched CLIP`, () => {
        for (const preview of [false, true]) for (const useLoraClip of [false, true]) {
            const options = { ...api.defaultH3WorkflowOptions(variant), preview, style, loras: [], useLoras: false, useLoraClip };
            if (options.advanced) options.advanced.boost = true;
            if (options.ultrafast) options.ultrafast.spectrum = true;
            const gallery = build(options);
            const manual = build({ ...options, style: { ...style, lora: '' }, useLoras: true, useLoraClip: true,
                loras: [{ enabled: true, name: style.lora, strength: style.strength }] });
            assert.deepEqual(renameStyleLoader(gallery), manual, 'same seed, prompts, loaders, conditioning, patches and sampling');
            assertDAG(gallery);
        }
    });
    test(`${variant}: independent style loader, trigger-first prompt, no accumulation and no input mutation`, () => {
        const options = { ...api.defaultH3WorkflowOptions(variant), style, useLoras: false }, before = structuredClone(options);
        const graph = build(options);
        assert.equal(graph.style_lora.class_type, variant === 'ultrafast' ? 'LTX_lora_loader' : 'Power Lora Loader (rgthree)');
        assert.deepEqual(graph.style_lora.inputs, styleLoaderInputs(variant, [variant === 'reference' && options.preview ? '141' : '135', 0], ['127', 0]));
        assert.deepEqual(graph['184'].inputs.clip, ['style_lora', 1]);
        assert.equal(text(graph, graph['184'].inputs.prompt), 'INK\nA rainy street.\nEngraved film');
        assert.equal(text(graph, graph['186'].inputs.source), 'INK\nA rainy street.\nEngraved film');
        assert.deepEqual(options, before);
        assert.deepEqual(build(options), graph, 'building repeatedly never accumulates style text');
        const changed = build({ ...options, style: { ...paint, lora: 'H3\\paint.safetensors' } });
        assert.equal(changed['184'].inputs.prompt, 'PAINT\nA rainy street.\nOil brushwork');
        const cleared = build({ ...options, style: undefined });
        assert.equal(cleared.style_lora, undefined);
        assert.equal(cleared['184'].inputs.prompt, 'A rainy street.');
        assert.equal(graph['190'].inputs.steps, options.steps, 'sampling remains opt-in');
        assertDAG(graph);
    });
    test(`${variant}: additional LoRA CLIP remains opt-in upstream of the independent gallery patch`, () => {
        for (const useLoraClip of [false, true]) {
            const options = { ...api.defaultH3WorkflowOptions(variant), style, useLoras: true, useLoraClip,
                loras: [{ enabled: true, name: 'H3\\detail.safetensors', strength: 0.4 }] };
            const graph = build(options);
            assert.deepEqual(graph.style_lora.inputs, styleLoaderInputs(variant, ['137', 0], [useLoraClip ? '137' : '127', useLoraClip ? 1 : 0]));
            assert.deepEqual(graph['184'].inputs.clip, ['style_lora', 1]);
            assert.deepEqual(graph['137'].inputs.clip, variant === 'ultrafast' && !useLoraClip ? undefined : ['127', 0]);
            assertDAG(graph);
        }
    });
    test(`${variant}: style trigger wraps final rewritten/reference prompt, preserving ReferencePack controls`, () => {
        const options = { ...api.defaultH3WorkflowOptions(variant), style, promptProvider: 'local', apiBase: 'http://localhost:1234', localModelSlug: 'writer' };
        if (options.advanced) options.advanced.mode = 'ref2v';
        const draft = { ...input(variant, [reference('image')]), prompt: 'Follow <Picture 1>.' };
        const graph = build(options, draft);
        assert.equal(graph['185'].inputs.direction, draft.prompt);
        assert.equal(graph['185'].inputs.prompt_provider, 'local');
        assert.equal(text(graph, graph['184'].inputs.prompt), 'INK\nREWRITTEN direction <Picture 1>.\nEngraved film');
        assert.deepEqual(graph['186'].inputs.source, graph['184'].inputs.prompt);
        assertDAG(graph);
    });
    test(`${variant}: six independent slots stay available and exact duplicate style paths are removed`, () => {
        const options = { ...api.defaultH3WorkflowOptions(variant), style, styleStrength: 0, useLoras: true, useLoraClip: true };
        options.loras = options.loras.map((lora, index) => ({ ...lora, name: index ? 'H3\\detail.safetensors' : 'h3/INK.safetensors', enabled: index < 2 }));
        const graph = build(options);
        assert.deepEqual(graph.style_lora.inputs, styleLoaderInputs(variant, ['137', 0], ['137', 1], 0));
        if (variant === 'ultrafast') {
            const stack = JSON.parse(graph['137'].inputs.stack_data);
            assert.ok(!stack.some(entry => /ink/i.test(entry.lora)));
            assert.equal(stack.find(entry => entry.on).lora, 'H3\\detail.safetensors');
        } else {
            assert.equal(graph['137'].inputs.lora_1, undefined);
            assert.equal(graph['137'].inputs.lora_2.lora, 'H3\\detail.safetensors');
        }
        assert.deepEqual(graph['184'].inputs.clip, ['style_lora', 1]);
        assert.equal(options.loras.length, 6);
        assert.equal(options.loras[0].name, 'h3/INK.safetensors', 'builder does not edit saved options');
        assertDAG(graph);
    });
    test(`${variant}: sampling overrides affect first pass only; CFG, size, timing and finishing stay untouched`, () => {
        const raw = api.defaultH3WorkflowOptions(variant), baseline = build(raw);
        const graph = build({ ...raw, style, useStyleSettings: true });
        assert.equal(graph['190'].class_type, 'BasicScheduler');
        assert.equal(graph['190'].inputs.steps, 8);
        assert.equal(graph['190'].inputs.scheduler, 'simple');
        assert.equal(graph['150'].inputs.sampler_name, 'euler');
        assert.equal(graph['149'].class_type, 'BasicGuider');
        assert.equal(graph['149'].inputs.cfg, undefined);
        for (const id of ['115', '132', '177', '189', 'advanced-latent-sampler', 'advanced-latent-sigmas', 'advanced-ltx-sampler',
            'advanced-ltx-guider', 'advanced-ltx-sigmas', 'ultrafast-shift']) assert.deepEqual(graph[id], baseline[id], `${id} kept`);
        const automatic = build({ ...raw, style: { ...style, settings: { steps: 9 } }, useStyleSettings: true });
        assert.equal(automatic['190'].class_type, baseline['190'].class_type);
        assert.equal(automatic['190'].inputs.steps, 9);
        const beta = build({ ...raw, style: { ...style, settings: { scheduler: 'h3-beta' } }, useStyleSettings: true });
        assert.equal(beta['190'].class_type, 'BetaSamplingScheduler');
        assert.equal(beta['190'].inputs.alpha, raw.alpha);
        assert.equal(beta['190'].inputs.beta, raw.beta);
        assertDAG(graph);
    });
    test(`${variant}: prompt-only, trigger-only and LoRA-only styles need no unnecessary prompt nodes`, () => {
        for (const parts of [{ lora: '', trigger: '', prompt: 'Ink film' }, { lora: '', trigger: 'INK', prompt: '' }, { trigger: '', prompt: '' }]) {
            const options = { ...api.defaultH3WorkflowOptions(variant), style: { ...style, ...parts } };
            const graph = build(options, input(variant, [reference('image')]));
            const final = text(graph, graph['184'].inputs.prompt);
            assert.ok(!final.startsWith('\n') && !final.endsWith('\n'));
            if (parts.trigger) assert.ok(final.startsWith('INK\n'));
            if (parts.lora === '') assert.equal(graph.style_lora, undefined);
            assertDAG(graph);
        }
    });
}

test('Advanced source-video styles only H3 latent conditioning, never LTX or nonexistent primary sampling', () => {
    const options = api.defaultAdvancedH3Options();
    Object.assign(options.advanced, { inputMode: 'video', stageOrder: 'ltx-first', latentUpscale: true, ltxRefine: true, sourceAudio: false });
    const draft = input('advanced', [reference('video')]);
    const baseline = build(options, draft);
    const graph = build({ ...options, style, useStyleSettings: true }, draft);
    assert.equal(graph['190'], undefined);
    assert.equal(graph['150'], undefined);
    assert.ok(graph.style_lora);
    assert.equal(graph['advanced-latent-conditioning'].inputs.prompt, 'INK\nA rainy street.\nEngraved film');
    for (const [id, node] of Object.entries(baseline)) if (id.startsWith('advanced-ltx')) assert.deepEqual(graph[id], node);
    assertDAG(graph);
    options.advanced.latentUpscale = false;
    const noH3 = build({ ...options, style, useStyleSettings: true }, draft);
    assert.equal(noH3.style_lora, undefined);
    assert.deepEqual(noH3, build(options, draft));
});
test('Advanced source-video gallery matches manual model/CLIP patches for both refinement orders', () => {
    for (const stageOrder of ['latent-first', 'ltx-first']) for (const useLoraClip of [false, true]) {
        const options = { ...api.defaultAdvancedH3Options(), style, loras: [], useLoras: false, useLoraClip };
        Object.assign(options.advanced, { inputMode: 'video', stageOrder, latentUpscale: true, ltxRefine: true, sourceAudio: false, boost: true });
        const draft = input('advanced', [reference('video')]);
        const gallery = build(options, draft);
        const manual = build({ ...options, style: { ...style, lora: '' }, useLoras: true, useLoraClip: true,
            loras: [{ enabled: true, name: style.lora, strength: style.strength }] }, draft);
        assert.deepEqual(renameStyleLoader(gallery), manual);
        assert.deepEqual(gallery['advanced-latent-conditioning'].inputs.clip, ['style_lora', 1]);
        assertDAG(gallery);
    }
});

test('wrong families, strengths, invalid stacks, unavailable LoRAs/schedulers and missing native nodes fail explicitly', () => {
    const options = api.defaultMinimaxH3Options();
    assert.throws(() => build({ ...options, style: { ...style, model: 'MOSS' } }), /H3 \/ MiniMax/);
    for (const strength of [NaN, Infinity, -21, 21]) assert.throws(() => build({ ...options, style, styleStrength: strength }), /strength/);
    assert.throws(() => build({ ...options, style: { ...style, settings: { steps: 10001 } }, useStyleSettings: true }), /steps/);
    const graph = build({ ...options, style, useStyleSettings: true });
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
    info.LoraLoaderModelOnly = { input: { required: { lora_name: [['H3\\missing.safetensors']] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /not available.*LoRA catalog/);
    info.LoraLoaderModelOnly.input.required.lora_name = [[style.lora]];
    info.BasicScheduler = { input: { required: { scheduler: ['COMBO', { options: ['beta'] }] } } };
    assert.throws(() => api.validateMinimaxH3Readiness(graph, info), /unavailable.*scheduler/);
    const referenced = build({ ...options, style }, input('reference', [reference('image')]));
    assert.throws(() => api.validateMinimaxH3Readiness(referenced, { ...info, StringConcatenate: undefined }), /Missing ComfyUI nodes.*StringConcatenate/);
    assert.throws(() => api.applyH3GalleryStyle({ ...graph, bad: { class_type: 'LTX_lora_loader', inputs: { stack_data: '{}' } } }, { ...options, style }), /Invalid H3 LoRA stack/);
});

const require = createRequire(import.meta.url), reactURL = pathToFileURL(require.resolve('react')).href;
const control = await import(compile(`
    import React from '${reactURL}';
    import { h3Choices, h3LoraCatalog, h3LoraChoices, h3GalleryStyle, h3StyleLoraRemovals, h3StyleSampling, appendGalleryStylePrompt,
        isH3LoraPath, resolveStyleLora, styleLoraMatches } from '${apiURL}';
    import { resolveLibraryStyle, styleInstalledLoras } from '${libraryURL}';
    export let picker, saveButton;
    export const stateWrites = [];
    const useState = value => [value, next => stateWrites.push(next)], useMemo = fn => fn();
    const useStyleGallery = () => ({gallery:{version:1,styles:[${JSON.stringify(style)},${JSON.stringify(paint)}]},error:''});
    const useModelInventory = () => ({inventory:${JSON.stringify(inventory)},loading:false,error:''});
    const StylePicker = props => {picker=props; return React.createElement('button', {disabled:props.disabled}, 'Choose style');};
    const SaveStyleSamplingButton = props => {saveButton=props; return React.createElement('button', {disabled:props.disabled}, 'Save sampling as style default');};
    ${strip(read('../components/H3StyleControl.tsx'))}
`));
const render = (options, disabled = false, installedNames = names) => {
    const patches = [];
    control.stateWrites.length = 0;
    const info = { LoraLoaderModelOnly: { input: { required: { lora_name: [installedNames] } } },
        KSamplerSelect: { input: { required: { sampler_name: [['euler', 'heun']] } } } };
    const html = renderToStaticMarkup(React.createElement(control.H3StyleControl, { options, info, prompt: 'A rainy street.',
        disabled, onChange: patch => patches.push(patch) }));
    return { html, patches };
};
test('H3 styles retain exact installed saved paths outside the H3 dropdown folder without a false missing-LoRA error', () => {
    const reported = 'moss\\MOSS_Something_feels_off__Ambiance_LoRA_by_FoS.safetensors';
    for (const variant of ['reference', 'ultrafast', 'advanced']) {
        const selected = { ...style, lora: reported };
        const options = { ...api.defaultH3WorkflowOptions(variant), useLoras: false, useLoraClip: false };
        const installed = [...names, reported];
        const { patches } = render(options, false, installed);
        assert.equal(control.picker.onSelect(selected), true, 'existence must be checked against the actual catalog, not the dropdown filter');
        assert.equal(patches[0].style.lora, reported);
        assert.match(control.stateWrites.at(-1), /installed saved LoRA path outside the H3 folder/);
        const graph = build({ ...options, ...patches[0] });
        assert.deepEqual(graph['184'].inputs.clip, ['style_lora', 1]);
        const lora = variant === 'ultrafast' ? JSON.parse(graph.style_lora.inputs.stack_data)[0].lora : graph.style_lora.inputs.lora_1.lora;
        assert.equal(lora, reported);
        const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, {}]));
        info.LoraLoaderModelOnly = { input: { required: { lora_name: [installed] } } };
        assert.deepEqual(api.h3LoraChoices(info), names, 'the visible choices remain H3-only');
        api.validateMinimaxH3Readiness(graph, info);
        assertDAG(graph);
    }
});
test('H3 saved paths moved into H3 resolve to the installed path; absent or ambiguous files still fail explicitly', () => {
    const reported = 'moss\\MOSS_Something_feels_off__Ambiance_LoRA_by_FoS.safetensors';
    const moved = reported.replace('moss\\', 'H3\\');
    const options = api.defaultAdvancedH3Options(), selected = { ...style, lora: reported };
    const { patches } = render(options, false, [moved]);
    assert.equal(control.picker.onSelect(selected), true);
    assert.equal(patches[0].style.lora, moved);
    render(options, false, names);
    assert.equal(control.picker.onSelect(selected), false);
    assert.match(control.stateWrites.at(-1), /Missing LoRA/);
    render(options, false, [moved, moved.replace('H3\\', 'H3\\nested\\')]);
    assert.equal(control.picker.onSelect(selected), false);
    assert.match(control.stateWrites.at(-1), /Ambiguous LoRA/);
});
test('all three UI modes select/clear gallery snapshots without changing prompt, sampling or unrelated slots', () => {
    for (const variant of ['reference', 'ultrafast', 'advanced']) {
        const options = { ...api.defaultH3WorkflowOptions(variant), style };
        options.loras[0] = { enabled: true, name: style.lora, strength: 1 };
        options.loras[1] = { enabled: true, name: 'H3\\detail.safetensors', strength: 0.2 };
        const before = structuredClone(options), { html, patches } = render(options);
        assert.match(html, /Active style LoRA/);
        assert.match(html, /Apply style sampling overrides/);
        assert.match(html, /without editable CFG/);
        assert.equal(control.picker.model, 'H3');
        assert.equal(control.picker.onSelect(paint), true);
        assert.equal(patches[0].style.lora, 'H3\\paint.safetensors');
        assert.equal(patches[0].styleStrength, undefined);
        assert.equal(patches[0].loras[0].enabled, false);
        assert.deepEqual(patches[0].loras[1], options.loras[1]);
        assert.ok(!('useStyleSettings' in patches[0]));
        assert.ok(!('steps' in patches[0]));
        assert.deepEqual(options, before);
        assert.equal(control.picker.onSelect(null), true);
        assert.equal(patches[1].style, undefined);
        render(options, true);
        assert.equal(control.picker.disabled, true);
        assert.equal(control.saveButton.disabled, true);
    }
});
test('UI saves actual editable H3 controls without CFG, refreshing only the active style snapshot', () => {
    for (const variant of ['reference', 'ultrafast', 'advanced']) {
        const options = { ...api.defaultH3WorkflowOptions(variant), style, steps: 12, sampler: 'heun', useStyleSettings: true };
        const { patches } = render(options), expected = { steps: 12, sampler: 'heun',
            scheduler: variant === 'reference' ? 'simple' : 'beta' };
        assert.deepEqual(control.saveButton.sampling, expected);
        control.saveButton.onSaved(expected);
        assert.deepEqual(patches, [{ style: { ...style, settings: { ...style.settings, ...expected } } }]);
        assert.equal(patches[0].style.settings.cfg, 7);
        assert.equal(patches[0].style.settings.megapixels, 3);
    }
});
test('UI exposes selection errors, generation locks and source-video sampling limits', () => {
    const options = { ...api.defaultAdvancedH3Options(), style };
    render(options);
    assert.equal(control.picker.onSelect({ ...style, model: 'MOSS' }), false);
    assert.match(control.stateWrites.at(-1), /H3 \/ MiniMax/);
    options.advanced.inputMode = 'video';
    const { html } = render(options);
    assert.match(html, /Source-video mode/);
    assert.doesNotMatch(html, /Save sampling as style default|Apply style sampling overrides/);
    assert.deepEqual(JSON.parse(JSON.stringify(options)).style, style, 'persistent workflow settings retain complete style snapshot');
    const panel = read('../components/MinimaxH3Panel.tsx');
    assert.match(panel, /h3Needed \? <H3StyleControl/);
    assert.doesNotMatch(read('../components/CharacterSwapPanel.tsx'), /H3StyleControl|StylePicker/);
});
