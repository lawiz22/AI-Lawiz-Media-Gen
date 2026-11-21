import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = (source, jsx = ts.JsxEmit.None) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx },
}).outputText).toString('base64')}`;
const galleryURL = compile(read('./styleGallery.ts')), civitaiURL = compile(read('./civitaiService.ts'));
const workflowURL = compile(read('./krea2StyleWorkflow.ts').replace("from './styleGallery'", `from '${galleryURL}'`));
const libraryURL = compile(read('./styleLibrary.ts').replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './styleGallery'", `from '${galleryURL}'`));
const api = await import(workflowURL), library = await import(libraryURL), gallery = await import(galleryURL);
const source = read('./comfyUIService.ts'), tree = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);
const cases = new Map();
const visit = node => {
    if (ts.isCaseClause(node) && ["'krea2-simple'", "'krea2-raw'"].includes(node.expression.getText(tree))) cases.set(node.expression.text, node.getText(tree));
    ts.forEachChild(node, visit);
};
visit(tree);
assert.equal(cases.size, 2);
const constantsURL = compile(read('../constants.ts'));
const { build } = await import(compile(`
    import { COMFYUI_KREA2_SIMPLE_WORKFLOW_TEMPLATE, COMFYUI_KREA2_RAW_WORKFLOW_TEMPLATE, KREA2_RESOLUTION_OPTIONS, KREA2_RAW_RESOLUTION_OPTIONS } from '${constantsURL}';
    import { KREA_SIMPLE_DEFAULT_LORAS, krea2StyleOptions } from '${workflowURL}';
    export const build = options => { let workflow; switch (options.comfyModelType || 'krea2-simple') { ${[...cases.values()].join('\n')} } return workflow; };
`));
const style = { id: 'krea-ink', model: 'KREA2', title: 'Ink', prompt: 'Ink illustration', trigger: 'KREA_INK', lora: 'KREA/ink.safetensors',
    strength: 0.65, settings: { steps: 12, cfg: 0, sampler: 'heun', scheduler: 'bong_tangent', megapixels: 2 }, notes: '' };
const options = { comfyModelType: 'krea2-simple', comfyKreaPrompt: 'A red coat', comfyKreaNegativePrompt: 'blur', comfySeed: 42,
    comfySteps: 10, comfyCfg: 1, comfySampler: 'er_sde', comfyScheduler: 'beta', comfyKreaResolution: '832x1216' };
const item = (name, patch = {}) => ({ path: `C:/models/loras/${name}`, relativePath: `loras/${name}`, fileName: name.split('/').pop(),
    kind: 'lora', sha256: name, status: 'matched', ...patch });
const controlSource = read('../components/ImageStyleControl.tsx');
const controlTree = ts.createSourceFile('control.tsx', controlSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let selectHandler;
const findSelect = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(controlTree) === 'select') selectHandler = node.initializer.getText(controlTree);
    ts.forEachChild(node, findSelect);
};
findSelect(controlTree);
assert.ok(selectHandler);
const { selectStyle } = await import(compile(`
    import { resolveLibraryStyle, styleInstalledLoras } from '${libraryURL}';
    import { resolveStyleLora } from '${galleryURL}';
    import { krea2StyleOptions, krea2StyleLoraRemovals } from '${workflowURL}';
    export const selectStyle = (options, selected, inventory, names) => {
        const mode = 'krea2-simple', isKrea = true, isMoss = false, model = 'KREA2', style = options.comfyKreaStyle;
        const styleKey = 'comfyKreaStyle', strengthKey = 'comfyKreaStyleStrength', info = {};
        const errors = [], notices = [], patches = [];
        const h3Choices = (_info, cls) => cls === 'KSampler' ? ['euler', 'heun'] : names;
        const setError = value => errors.push(value), setNotice = value => notices.push(value), updateOptions = value => patches.push(value);
        const select = ${selectHandler};
        return { success: select(selected), patches, errors, notices };
    };
`));

test('KREA2 category normalizes aliases without adding invented presets or changing existing styles', () => {
    for (const model of ['KREA', 'krea2', 'KREA-2', 'KREA_2']) assert.equal(gallery.normalizeStyleModel(model), 'KREA2');
    const result = gallery.parseStyleGallery(JSON.stringify({ version: 1, styles: [{ ...style, model: 'KREA' }] }));
    assert.deepEqual(result.styles, [style]);
    assert.equal(gallery.defaultStyleGallery().styles.length, 27);
    assert.ok(gallery.defaultStyleGallery().styles.every(value => value.model === 'FLUX2-9B'));
    assert.match(read('../components/StyleGalleryPanel.tsx'), /'FLUX2-9B', 'FLUX2-4B', 'KREA2'/);
});

test('installed and library KREA2 choices respect folders, metadata and manual classifications', () => {
    const ink = item('KREA/ink.safetensors'), otherFolder = item('custom/metadata.safetensors', { baseModel: 'Krea 2' });
    const classified = item('custom/selected.safetensors', { userFamily: 'krea2' });
    const wrong = item('KREA/not-compatible.safetensors', { userFamily: 'flux2-9b' });
    const inv = { items: [ink, otherFolder, classified, wrong, item('FLUX2/flux.safetensors')] };
    const names = ['KREA/ink.safetensors', 'krea2\\new.safetensors', 'KREA-2/new.safetensors', 'custom/metadata.safetensors', 'custom/selected.safetensors',
        'KREA/not-compatible.safetensors', 'FLUX2/flux.safetensors', 'other/unknown.safetensors'];
    assert.deepEqual(library.styleInstalledLoras(names, 'KREA2', inv), names.slice(0, 5));
    assert.deepEqual(library.styleLibraryLoras(inv, 'KREA2'), [ink, otherFolder, classified]);
    assert.deepEqual(library.styleLibraryLoras({ items: [item('KREA2/ink.safetensors')] }, 'KREA2').length, 1);
    assert.equal(library.matchStyleLibrary({ ...style, lora: 'ink.safetensors' }, inv).item, ink);
    assert.equal(library.matchStyleLibrary({ ...style, model: 'FLUX2-9B' }, inv).item, undefined);
});

test('KREA2 links, inherited recommendations and used-LoRA exclusions reuse My Library without overwriting manual fields', () => {
    const ink = item('KREA/ink.safetensors', { usageMetadata: { triggerWords: ['LIBRARY_INK'], steps: 8, cfg: 1, sampler: 'Euler' }, previewPath: 'preview.png' });
    const inv = { items: [ink] }, selected = { ...style, lora: 'ink.safetensors', trigger: '', settings: {} };
    const linked = library.linkStyleLibrary(selected, ink);
    const resolved = library.resolveLibraryStyle(linked, inv, ['euler']);
    assert.equal(resolved.item, ink);
    assert.equal(resolved.style.trigger, 'LIBRARY_INK');
    assert.deepEqual(resolved.style.settings, { steps: 8, cfg: 1, sampler: 'euler' });
    assert.equal(resolved.style.strength, style.strength);
    assert.equal(library.resolveLibraryStyle(style, inv, ['euler']).style.trigger, style.trigger);
    assert.deepEqual(library.resolveLibraryStyle(style, inv, ['euler']).style.settings, style.settings);
    assert.deepEqual(library.unusedStyleLoras(['KREA/ink.safetensors', 'KREA/new.safetensors'], [linked], 'KREA2', inv), ['KREA/new.safetensors']);
    const saved = gallery.parseStyleGallery(JSON.stringify({ version: 1, styles: [linked] })).styles[0];
    assert.deepEqual(saved, linked);
});

test('Simple KREA applies one style before six independent additional LoRAs and returns the actual styled prompt', () => {
    const input = { ...options, comfyKreaStyle: style, comfyKreaStyleStrength: 0, comfyKreaUseStyleSettings: true,
        ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`comfyKreaLora${index + 1}Name`, `KREA/detail-${index}.safetensors`])) };
    const original = structuredClone(input), graph = build(input);
    assert.deepEqual(input, original);
    assert.deepEqual(graph.style_lora.inputs.model, ['106:1', 0]);
    assert.deepEqual(graph['57'].inputs.model, ['style_lora', 0]);
    assert.deepEqual(graph['57'].inputs.clip, ['106:13', 0]);
    assert.deepEqual(graph['2'].inputs.model, ['57', 0]);
    assert.equal(graph.style_lora.inputs.strength_model, 0);
    for (let index = 1; index <= 6; index++) assert.equal(graph['57'].inputs[`lora_${index}`].lora, `KREA/detail-${index - 1}.safetensors`);
    assert.equal(graph['104'].inputs.text, 'KREA_INK\nA red coat\nInk illustration');
    assert.equal(graph['17'].inputs.text, 'blur');
    assert.equal(graph['2'].inputs.steps, 12); assert.equal(graph['2'].inputs.cfg, 0);
    assert.equal(graph['2'].inputs.sampler_name, 'heun'); assert.equal(graph['2'].inputs.scheduler, 'bong_tangent');
    const { width, height } = graph['106:10'].inputs;
    assert.equal(width % 16, 0); assert.equal(height % 16, 0);
    assert.ok(Math.abs(width * height / 2_000_000 - 1) < 0.02);
    assert.ok(Math.abs(width / height - 832 / 1216) < 0.01);
    assert.match(source, /baseWorkflow\["104"\]\?\.inputs\?\.text/);
});

test('switching and clearing styles remove stale prompts and duplicate explicit/implicit LoRAs without mutation', () => {
    const next = { ...style, id: 'paint', prompt: 'Oil painting', trigger: 'PAINT', lora: 'KREA/paint.safetensors' };
    const first = { ...options, comfyKreaStyle: style, comfyKreaLora3Name: 'krea\\INK.safetensors', comfyKreaLora4Name: 'KREA/details.safetensors' };
    assert.equal(build(first)['57'].inputs.lora_3.on, false);
    const second = { ...first, ...api.krea2StyleLoraRemovals(first, [style.lora, next.lora]), comfyKreaStyle: next };
    const graph = build(second);
    assert.ok(graph['104'].inputs.text.startsWith('PAINT\n')); assert.doesNotMatch(graph['104'].inputs.text, /KREA_INK/);
    assert.equal(second.comfyKreaPrompt, 'A red coat'); assert.equal(first.comfyKreaLora3Name, 'krea\\INK.safetensors');
    assert.equal(graph['57'].inputs.lora_4.lora, 'KREA/details.safetensors');
    assert.equal(graph['57'].inputs.lora_1.on, false); assert.equal(graph['57'].inputs.lora_2.on, true);
    const implicit = { ...style, lora: api.KREA_SIMPLE_DEFAULT_LORAS[1].name };
    assert.equal(build({ ...options, comfyKreaStyle: implicit })['57'].inputs.lora_2.on, false);
    const cleared = build({ ...second, comfyKreaStyle: undefined });
    assert.equal(cleared.style_lora, undefined); assert.equal(cleared['104'].inputs.text, 'A red coat');
    assert.equal(build({ ...options, comfyKreaStyle: style, comfyKreaUseLora: false }).style_lora.inputs.lora_name, style.lora);
});

test('actual shared picker resolves KREA2 library metadata, resets strength, removes duplicates and reports missing LoRAs', () => {
    const ink = item('KREA/ink.safetensors', { usageMetadata: { triggerWords: ['LIBRARY_INK'], steps: 8, cfg: 0, sampler: 'Euler' } });
    const inv = { items: [ink] }, selected = { ...style, lora: 'ink.safetensors', trigger: '', settings: {} };
    const before = { ...options, comfyKreaStyleStrength: 1.5, comfyKreaLora3Name: 'krea\\ink.safetensors' };
    const result = selectStyle(before, selected, inv, ['KREA/ink.safetensors']);
    assert.equal(result.success, true);
    assert.equal(result.patches.length, 1);
    assert.equal(result.patches[0].comfyKreaStyleStrength, undefined);
    assert.equal(result.patches[0].comfyKreaLora3Name, '');
    assert.equal(result.patches[0].comfyKreaStyle.trigger, 'LIBRARY_INK');
    assert.deepEqual(result.patches[0].comfyKreaStyle.settings, { steps: 8, cfg: 0, sampler: 'euler' });
    assert.match(result.notices[0], /From My Library/);
    assert.equal(before.comfyKreaStyleStrength, 1.5);
    const clear = selectStyle({ ...before, ...result.patches[0] }, null, inv, []);
    assert.equal(clear.success, true);
    assert.equal(clear.patches[0].comfyKreaStyle, undefined);
    const missing = selectStyle(before, selected, inv, []);
    assert.equal(missing.success, false); assert.deepEqual(missing.patches, []);
    assert.match(missing.errors[0], /Missing LoRA/);
    const incompatible = selectStyle(before, { ...style, model: 'FLUX2-9B', lora: '' }, inv, []);
    assert.equal(incompatible.success, false); assert.match(incompatible.errors[0], /not interchangeable/);
});

test('no-style, prompt-only and opt-in settings preserve defaults; incompatible or invalid styles fail', () => {
    const plain = build(options);
    assert.equal(plain.style_lora, undefined); assert.equal(plain['2'].inputs.steps, 10);
    assert.equal(plain['106:1'].inputs.unet_name, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(plain['57'].inputs.lora_1.on, false); assert.equal(plain['57'].inputs.lora_1.lora, '');
    assert.equal(plain['57'].inputs.lora_2.on, true);
    const styled = build({ ...options, comfyKreaStyle: style });
    assert.equal(styled['2'].inputs.cfg, 1); assert.equal(styled['106:10'].inputs.width, 832);
    assert.equal(styled['2'].inputs.scheduler, 'beta', 'style scheduler is opt-in');
    const promptOnly = build({ ...options, comfyKreaStyle: { ...style, lora: '' }, comfyKreaPrompt: 'A red coat KREA_INK' });
    assert.equal(promptOnly.style_lora, undefined);
    assert.equal(promptOnly['104'].inputs.text, 'KREA_INK\nA red coat\nInk illustration');
    assert.throws(() => build({ ...options, comfyKreaStyle: { ...style, model: 'FLUX2-9B' } }), /not interchangeable/);
    assert.throws(() => build({ ...options, comfyKreaStyle: style, comfyKreaStyleStrength: NaN }), /finite/);
});

test('RAW ignores Simple KREA style settings and only Simple mounts the shared style picker', () => {
    const raw = { ...options, comfyModelType: 'krea2-raw' };
    assert.deepEqual(build({ ...raw, comfyKreaStyle: style, comfyKreaStyleStrength: 2, comfyKreaUseStyleSettings: true }), build(raw));
    const panel = read('../components/OptionsPanel.tsx');
    assert.doesNotMatch(panel, /modelType === 'krea2-simple' && <ImageStyleControl/);
    assert.match(panel, /checked=\{!!options\.comfyKreaUseStyleSettings\}/);
    assert.match(read('../components/LoraSettingsPanel.tsx'), /options\.comfyModelType === 'krea2-simple' && <ImageStyleControl[^>]+showSamplingControl=\{false\}/);
    assert.doesNotMatch(panel, /modelType === 'krea2-(?:raw|edit)' && <ImageStyleControl/);
    for (const file of ['../App.tsx', '../store/generationSlice.ts', '../components/CivitaiInventoryPanel.tsx']) {
        assert.match(read(file), /comfyKreaStyle: undefined/);
        assert.match(read(file), /comfyKreaUseStyleSettings: false/);
    }
    assert.match(read('../store/generationSlice.ts'), /activeOptions\.comfyKreaStyle\?\.lora && !app\.comfyUIObjectInfo\?\.LoraLoaderModelOnly/);
});

const require = createRequire(import.meta.url);
const reactURL = pathToFileURL(require.resolve('react')).href;
const { default: React } = await import(reactURL);
const controlURL = compile(`
    import React, { useMemo, useState } from '${reactURL}';
    import { krea2StyleOptions, krea2StyleLoraRemovals } from '${workflowURL}';
    const useStyleGallery = () => ({ gallery: { styles: [] }, error: '' });
    const useModelInventory = () => ({ inventory: { items: [] }, loading: false, error: '' });
    const StylePicker = () => React.createElement('button', {}, 'Choose KREA2 style');
    ${controlSource.replace(/^import .*;\r?$/gm, '')}
`, ts.JsxEmit.React);
const { ImageStyleControl } = await import(controlURL);
const loraPanelURL = compile(`
    import React, { useMemo, useState } from '${reactURL}';
    import { ImageStyleControl } from '${controlURL}';
    const SelectInput = ({ label, value }) => React.createElement('label', {}, label, React.createElement('input', { value, readOnly: true }));
    const NumberSlider = ({ label, value }) => React.createElement('label', {}, label, React.createElement('input', { value, readOnly: true }));
    ${read('../components/LoraSettingsPanel.tsx').replace(/^import .*;\r?$/gm, '')}
`, ts.JsxEmit.React);
const { LoraSettingsPanel } = await import(loraPanelURL);
test('right-hand KREA LoRA panel visibly lists style path and effective strength even with additional LoRAs off', () => {
    const html = renderToStaticMarkup(React.createElement(LoraSettingsPanel, {
        options: { ...options, comfyKreaStyle: style, comfyKreaStyleStrength: 1.25, comfyKreaUseLora: false },
        updateOptions: () => {}, isDisabled: false, availableLoras: [], comfyUIObjectInfo: {},
    }));
    assert.ok(html.includes('Style LoRA (gallery)'));
    assert.ok(html.includes('aria-label="Active style LoRA"'));
    assert.ok(html.includes(style.lora)); assert.ok(html.includes('value="1.25"'));
    assert.ok(html.includes('Enable additional LoRAs'));
    assert.ok(!html.includes('Apply style sampling overrides'));
    assert.ok(!html.includes('krea2_turbo_lora_rank_64_bf16'));
    const zero = renderToStaticMarkup(React.createElement(ImageStyleControl, {
        options: { ...options, comfyKreaStyle: style, comfyKreaStyleStrength: 0 }, mode: 'krea2-simple',
        info: {}, updateOptions: () => {}, disabled: false, showSamplingControl: false,
    }));
    assert.ok(zero.includes('Strength 0: the style LoRA has no effect.'));
});

const sliceText = read('../store/generationSlice.ts');
const sliceTree = ts.createSourceFile('slice.ts', sliceText, ts.ScriptTarget.Latest, true);
let switchReducer, resetReducer, turboFields, initialKreaFields;
const findState = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sliceTree) === 'switchComfyModelOptions') switchReducer = node.initializer.getText(sliceTree);
    if (ts.isPropertyAssignment(node) && node.name.getText(sliceTree) === 'resetGenerationState') resetReducer = node.initializer.getText(sliceTree);
    if (ts.isVariableDeclaration(node) && node.name.getText(sliceTree) === 'KREA_TURBO_LORA_FIELDS') turboFields = node.initializer.getText(sliceTree);
    if (ts.isVariableDeclaration(node) && node.name.getText(sliceTree) === 'initialOptions') {
        initialKreaFields = node.initializer.properties.filter(property =>
            /^comfyKrea(?:Unet|Lora\d(?:Name|Strength))$/.test(property.name?.getText(sliceTree) || '')).map(property => property.getText(sliceTree)).join(',');
    }
    ts.forEachChild(node, findState);
};
findState(sliceTree);
assert.ok(switchReducer && resetReducer && turboFields && initialKreaFields);
const stateAPI = await import(compile(`
    const KREA_TURBO_LORA_FIELDS = ${turboFields};
    export const defaults = { ${initialKreaFields} };
    const initialOptions = { comfyNegativePrompt: '' };
    const defaultQwen21Settings = () => ({});
    export const switchModel = ${switchReducer};
    export const reset = ${resetReducer};
`));
test('Simple initial defaults and actual subtab switches use Turbo without reintroducing distillation; RAW keeps its defaults', () => {
    assert.equal(stateAPI.defaults.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(stateAPI.defaults.comfyKreaLora1Name, '');
    const state = { options: { ...options, ...stateAPI.defaults }, comfyOptionsByModel: {}, comfyDefaultOptionsByModel: {} };
    stateAPI.switchModel(state, { payload: { comfyModelType: 'krea2-raw' } });
    assert.equal(state.options.comfyKreaUnet, 'krea2_raw_fp8_scaled.safetensors');
    assert.equal(state.options.comfyKreaLora1Name, 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors');
    assert.equal(state.options.comfyKreaLora1Strength, 0.6);
    stateAPI.switchModel(state, { payload: { comfyModelType: 'krea2-simple' } });
    assert.equal(state.options.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(state.options.comfyKreaLora1Name, '');
    state.options.comfyKreaUnet = 'custom-krea-turbo.safetensors';
    stateAPI.switchModel(state, { payload: { comfyModelType: 'krea2-raw' } });
    stateAPI.switchModel(state, { payload: { comfyModelType: 'krea2-simple' } });
    assert.equal(state.options.comfyKreaUnet, 'custom-krea-turbo.safetensors', 'an explicit saved model is preserved');
    const legacy = { options: { ...options, comfyKreaUnet: 'krea2_raw_fp8_scaled.safetensors',
        comfyKreaLora1Name: 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors', comfyKreaLora3Name: 'KREA/details.safetensors' },
        comfyOptionsByModel: {}, comfyDefaultOptionsByModel: {} };
    stateAPI.reset(legacy);
    assert.equal(legacy.options.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(legacy.options.comfyKreaLora1Name, '');
    assert.equal(legacy.options.comfyKreaLora3Name, 'KREA/details.safetensors');
});

test('Simple workflow template and prompt imports share Turbo defaults without disturbing RAW template', async () => {
    const constants = await import(constantsURL);
    assert.equal(constants.COMFYUI_KREA2_SIMPLE_WORKFLOW_TEMPLATE['106:1'].inputs.unet_name, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(constants.COMFYUI_KREA2_SIMPLE_WORKFLOW_TEMPLATE['57'].inputs.lora_1.on, false);
    assert.equal(constants.COMFYUI_KREA2_RAW_WORKFLOW_TEMPLATE['316'].inputs.unet_name, 'krea2_raw_fp8_scaled.safetensors');
    const destination = await import(compile(read('../utils/promptDestination.ts').replace(/^import .*;\r?$/gm, '')));
    const imported = destination.getPromptDestinationOptions('A portrait', 'krea2-simple');
    assert.equal(imported.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(imported.comfyKreaLora1Name, '');
    const app = read('../App.tsx'), appTree = ts.createSourceFile('app.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let appDefaults;
    const findDefaults = node => {
        if (ts.isIfStatement(node) && node.expression.getText(appTree) === "newOpts.comfyModelType === 'krea2-simple'") {
            const findCall = child => {
                if (ts.isCallExpression(child) && child.expression.getText(appTree) === 'applyDefaultsIfMissing') appDefaults = child.arguments[0].getText(appTree);
                ts.forEachChild(child, findCall);
            };
            findCall(node.thenStatement);
        }
        ts.forEachChild(node, findDefaults);
    };
    findDefaults(appTree); assert.ok(appDefaults);
    const { defaults } = await import(compile(`export const defaults = ${appDefaults};`));
    assert.equal(defaults.comfyKreaUnet, 'krea2_turbo_fp8_scaled.safetensors');
    assert.equal(defaults.comfyKreaLora1Name, '');
});

test('catalog repairs a missing Simple model to installed Turbo without importing metadata over manual sampling', async () => {
    const text = read('../components/OptionsPanel.tsx'), tree = ts.createSourceFile('options.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = {};
    const visit = node => {
        if (ts.isVariableDeclaration(node) && ['selectedModel', 'applyModelDefaults'].includes(node.name.getText(tree)) && !declarations[node.name.getText(tree)]) {
            declarations[node.name.getText(tree)] = node.getText(tree);
        }
        ts.forEachChild(node, visit);
    };
    visit(tree);
    const { apply } = await import(compile(`
        export async function apply(configuredModel, candidates) {
            const modelType = 'krea2-simple', field = 'comfyKreaUnet', options = { comfyKreaUnet: configuredModel, comfySteps: 7 };
            const ${declarations.selectedModel};
            const cancelled = false;
            let updates = {}, reads = 0;
            const window = { electron: { getCivitaiInventory: async () => { reads++; return { items: [] }; } } };
            const updateOptions = value => { updates = value; };
            const ${declarations.applyModelDefaults};
            await applyModelDefaults();
            return { selectedModel, updates, reads };
        }
    `));
    const turbo = 'krea2_turbo_fp8_scaled.safetensors';
    const repaired = await apply('krea2_raw_fp8_scaled.safetensors', [turbo]);
    assert.equal(repaired.selectedModel, turbo);
    assert.deepEqual(repaired.updates, { comfyKreaUnet: turbo });
    assert.equal(repaired.reads, 0);
    const custom = await apply('custom-krea-turbo.safetensors', [turbo, 'custom-krea-turbo.safetensors']);
    assert.equal(custom.selectedModel, 'custom-krea-turbo.safetensors');
    assert.deepEqual(custom.updates, {});
});
