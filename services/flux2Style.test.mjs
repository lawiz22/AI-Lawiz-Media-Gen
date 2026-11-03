import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const galleryURL = compile(read('./styleGallery.ts')), civitaiURL = compile(read('./civitaiService.ts'));
const workflowURL = compile(read('./flux2EditWorkflow.ts').replace("from './styleGallery'", `from '${galleryURL}'`).replace("from './civitaiService'", `from '${civitaiURL}'`));
const api = await import(workflowURL);
const style = { id: 'test', model: 'FLUX2-9B', title: 'Ink', prompt: 'Ink drawing', trigger: 'INK_TRIGGER', lora: 'FLUX2-9B/ink.safetensors', strength: 0.6, settings: { steps: 12, cfg: 0, sampler: 'heun', megapixels: 2 }, notes: '' };
const options = { comfyFlux2EditUnet: 'flux2/flux2Klein9BInt8.safetensors', comfyFlux2EditPrompt: 'Keep the red coat', comfySeed: 42, comfyFlux2EditSteps: 4, comfyFlux2EditCfg: 1, comfyFlux2EditSampler: 'euler', comfyFlux2EditMegapixels: 1,
    comfyFlux2EditLora1Name: 'FLUX2-9B/details.safetensors', comfyFlux2EditLora1Strength: 0.2 };

const constantsURL = compile(read('../constants.ts'));
const serviceSource = read('./comfyUIService.ts'), serviceTree = ts.createSourceFile('service.ts', serviceSource, ts.ScriptTarget.Latest, true);
let t2iCase;
const visit = node => {
    if (ts.isCaseClause(node) && node.expression.getText(serviceTree) === "'flux2-simple'") t2iCase = node.getText(serviceTree);
    ts.forEachChild(node, visit);
};
visit(serviceTree); assert.ok(t2iCase);
const { buildT2i } = await import(compile(`
    import { COMFYUI_FLUX2_SIMPLE_WORKFLOW_TEMPLATE, FLUX2_RESOLUTION_OPTIONS } from '${constantsURL}';
    import { flux2StyleOptions, defaultFlux2Clip } from '${workflowURL}';
    import { inferFlux2Variant } from '${civitaiURL}';
    import { applyFlux2StyleScheduler, normalizeStyleModel, validateStyleGallery } from '${galleryURL}';
    export const buildT2i = options => { let workflow; switch ('flux2-simple') { ${t2iCase} } return workflow; };
`));
const nineModel = 'flux2\\flux2Klein9BInt8_v10.safetensors', nineClip = 'qwen38BFluxKlein9BTE_38b.safetensors';
test('optional scheduler defaults preserve native FLUX2 graphs or force the style scheduler when enabled', () => {
    for (const mode of ['t2i', 'i2i']) {
        const prefix = mode === 't2i' ? 'comfyFlux2' : 'comfyFlux2Edit';
        const preset = { ...style, settings: { ...style.settings, scheduler: 'flux2' } };
        const values = { ...options, [`${prefix}Style`]: preset, [`${prefix}UseStyleSettings`]: true };
        const build = value => mode === 't2i' ? buildT2i(value) : api.buildFlux2EditWorkflow('source.png', [], value, value.comfyFlux2EditStyle).workflow;
        const graph = build(values), schedulers = Object.values(graph).filter(node => node.class_type === 'Flux2Scheduler');
        assert.equal(schedulers.length, 1); assert.equal(schedulers[0].inputs.steps, 12);
        assert.ok(!Object.values(graph).some(node => node.class_type === 'BasicScheduler'));
        const custom = { ...values, comfyFlux2EditUseCacheDit: true,
            [`${prefix}Style`]: { ...preset, settings: { ...preset.settings, scheduler: 'beta' } } };
        const forced = build(custom), schedulerId = mode === 't2i' ? '81' : 'scheduler';
        const guider = mode === 't2i' ? forced['82'] : forced.guider;
        assert.equal(forced[schedulerId].class_type, 'BasicScheduler');
        assert.deepEqual(forced[schedulerId].inputs, { model: guider.inputs.model, scheduler: 'beta', steps: 12, denoise: 1 });
        assert.ok(!Object.values(forced).some(node => node.class_type === 'Flux2Scheduler'));
        assert.equal(build({ ...custom, [`${prefix}UseStyleSettings`]: false })[schedulerId].class_type, 'Flux2Scheduler');
        const automatic = { ...preset, settings: { ...preset.settings } }; delete automatic.settings.scheduler;
        assert.equal(build({ ...values, [`${prefix}Style`]: automatic })[schedulerId].class_type, 'Flux2Scheduler');
    }
});
test('forced scheduler is supported with FLUX2 Klein 4B as well as 9B', () => {
    const preset = { ...style, model: 'FLUX2-4B', lora: '', settings: { scheduler: 'bong_tangent' } };
    const four = 'flux-2-klein-4b-Q4_K_M.gguf';
    const t2i = buildT2i({ comfyFlux2Unet: four, comfyFlux2Style: preset, comfyFlux2UseStyleSettings: true });
    const i2i = api.buildFlux2EditWorkflow('source.png', [], { comfyFlux2EditUnet: four, comfyFlux2EditUseStyleSettings: true }, preset).workflow;
    assert.equal(t2i['81'].inputs.scheduler, 'bong_tangent'); assert.equal(i2i.scheduler.inputs.scheduler, 'bong_tangent');
});
test('style changes remove old/new style duplicates but retain independent LoRAs and manual prompts in both modes', () => {
    const nextStyle = { ...style, id: 'paint', title: 'Paint', lora: 'FLUX2-9B/paint.safetensors', trigger: 'PAINT_TRIGGER', prompt: 'Oil painting' };
    for (const mode of ['t2i', 'i2i']) {
        const prefix = mode === 't2i' ? 'comfyFlux2' : 'comfyFlux2Edit';
        const before = {
            ...options, comfyFlux2Unet: nineModel, comfyFlux2Prompt: 'Keep the red coat',
            [`${prefix}Style`]: style,
            [`${prefix}Lora1Name`]: 'flux2-9b\\INK.safetensors',
            [`${prefix}Lora2Name`]: 'FLUX2-9B/details.safetensors',
        };
        const build = value => mode === 't2i' ? buildT2i(value) : api.buildFlux2EditWorkflow('source.png', [], value, value.comfyFlux2EditStyle).workflow;
        const first = build(before);
        assert.equal(first.style_lora.inputs.lora_name, style.lora);
        if (mode === 't2i') assert.equal(first['99'].inputs.lora_1.on, false);
        else assert.equal(first.lora_1, undefined);
        const removals = api.flux2StyleLoraRemovals(before, [style.lora, nextStyle.lora], mode);
        assert.deepEqual(removals, { [`${prefix}Lora1Name`]: '' });
        const after = { ...before, ...removals, [`${prefix}Style`]: nextStyle };
        const second = build(after);
        assert.equal(second.style_lora.inputs.lora_name, nextStyle.lora);
        const prompt = mode === 't2i' ? second['93'].inputs.text : second.prompt.inputs.text;
        assert.ok(prompt.startsWith('PAINT_TRIGGER\n')); assert.doesNotMatch(prompt, /INK_TRIGGER/);
        assert.equal(after[`${prefix}Prompt`], 'Keep the red coat');
        assert.equal(after[`${prefix}Lora2Name`], 'FLUX2-9B/details.safetensors');
        assert.equal(before[`${prefix}Lora1Name`], 'flux2-9b\\INK.safetensors');
        assert.equal(first.style_lora.inputs.lora_name, style.lora, 'previous workflow snapshot stays unchanged');
        const cleared = build({ ...after, ...api.flux2StyleLoraRemovals(after, [nextStyle.lora], mode), [`${prefix}Style`]: undefined });
        assert.equal(cleared.style_lora, undefined);
    }
});

test('i2i keeps the editing prompt on the left and style, references and LoRAs on the right', () => {
    const text = read('../components/OptionsPanel.tsx');
    const tree = ts.createSourceFile('options.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let workspace;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'flux2EditWorkspace') workspace = node.initializer.getText(tree);
        ts.forEachChild(node, visit);
    };
    visit(tree);
    for (const control of ['ImageStyleControl', 'ImageUploader', 'Flux2ReferenceManager', 'Additional LoRAs']) assert.ok(workspace.includes(control), control);
    assert.ok(!workspace.includes('Additional Editing Instructions'), 'editing prompt is outside the right portal');
    assert.ok(!workspace.includes('renderPromptExampleButtons'), 'prompt examples stay beside the editing prompt');
    assert.match(text, /modelType === 'flux2-edit' \? <>\s*\{renderPromptExampleButtons\(\)\}\s*<TextInput label="Additional Editing Instructions" value=\{options\.comfyFlux2EditPrompt \|\| ''\} onChange=\{handleOptionChange\('comfyFlux2EditPrompt'\)\}/);
    assert.ok(!workspace.includes('flux2EditAdvancedOpen'), 'LoRAs are not hidden in Advanced');
    assert.ok(text.includes('createPortal(flux2EditWorkspace, flux2EditWorkspaceContainer)'));
    const app = read('../App.tsx');
    assert.ok(app.includes('flux2EditWorkspaceContainer={flux2EditWorkspaceContainer}'));
    assert.ok(app.includes('data-flux2-edit-workspace="true"'));
});
test('t2i and i2i default graphs use Klein 9B and its paired CLIP, while explicit 4B/custom settings remain usable', () => {
    const t2i = buildT2i({}), i2i = api.buildFlux2EditWorkflow('source.png', [], {}).workflow;
    assert.equal(t2i['94'].inputs.unet_name, nineModel); assert.equal(t2i['94'].class_type, 'UNETLoader');
    assert.equal(t2i['94'].inputs.weight_dtype, 'default');
    assert.equal(t2i['91'].inputs.clip_name, nineClip);
    assert.equal(i2i.model.inputs.unet_name, nineModel); assert.equal(i2i.model.class_type, 'UNETLoader');
    assert.equal(i2i.clip.inputs.clip_name, nineClip);
    const four = 'flux-2-klein-4b-Q4_K_M.gguf';
    assert.equal(buildT2i({ comfyFlux2Unet: four })['91'].inputs.clip_name, 'qwen3vl_4b_fp8_scaled.safetensors');
    assert.equal(api.buildFlux2EditWorkflow('s.png', [], { comfyFlux2EditUnet: four }).workflow.clip.inputs.clip_name, 'qwen_3_4b.safetensors');
    assert.equal(api.buildFlux2EditWorkflow('s.png', [], { comfyFlux2EditUnet: four, comfyFlux2EditClip: 'custom.safetensors' }).workflow.clip.inputs.clip_name, 'custom.safetensors');
    assert.doesNotThrow(() => buildT2i({ comfyFlux2Style: style }));
});
test('initial state, global reset and image workflow resets declare the same 9B pair', async () => {
    const text = read('../store/generationSlice.ts'), tree = ts.createSourceFile('slice.ts', text, ts.ScriptTarget.Latest, true);
    const fields = ['comfyFlux2Unet', 'comfyFlux2Clip', 'comfyFlux2EditUnet', 'comfyFlux2EditClip'];
    for (const name of ['initialOptions', 'resetDefaults']) {
        let value;
        const visit = node => {
            if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) value = node.initializer;
            ts.forEachChild(node, visit);
        };
        visit(tree); assert.ok(value);
        const source = value.properties.filter(property => fields.includes(property.name?.getText(tree))).map(property => property.getText(tree)).join(',');
        const { defaults } = await import(compile(`export const defaults = { ${source} };`));
        assert.deepEqual(defaults, { comfyFlux2Unet: nineModel, comfyFlux2Clip: nineClip, comfyFlux2EditUnet: nineModel, comfyFlux2EditClip: nineClip });
    }
    const app = read('../App.tsx');
    for (const field of fields) assert.ok(app.includes(`${field}: '${field.endsWith('Unet') ? nineModel.replaceAll('\\', '\\\\') : nineClip}'`));
});
test('catalog initialization prefers 9B, repairs old default CLIPs and preserves custom CLIP/VAE selections', async () => {
    const text = read('../components/OptionsPanel.tsx'), tree = ts.createSourceFile('options.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = {};
    const visit = node => {
        if (ts.isVariableDeclaration(node) && ['selectedModel', 'applyModelDefaults'].includes(node.name.getText(tree)) && !declarations[node.name.getText(tree)]) declarations[node.name.getText(tree)] = node.getText(tree);
        ts.forEachChild(node, visit);
    };
    visit(tree);
    const { apply } = await import(compile(`
        import { inferFlux2Variant } from '${civitaiURL}';
        const defaultFlux2Clip = ${api.defaultFlux2Clip.toString()};
        export async function apply(modelType, configuredModel, candidates, options) {
            const field = modelType === 'flux2-simple' ? 'comfyFlux2Unet' : 'comfyFlux2EditUnet';
            const ${declarations.selectedModel};
            const cancelled = false, window = {};
            let updates = {};
            const updateOptions = value => { updates = value; };
            const ${declarations.applyModelDefaults};
            await applyModelDefaults();
            return { selectedModel, updates };
        }
    `));
    for (const [mode, prefix] of [['flux2-simple', 'comfyFlux2'], ['flux2-edit', 'comfyFlux2Edit']]) {
        const result = await apply(mode, '', ['flux2/flux2Dev.gguf', nineModel], {});
        assert.equal(result.selectedModel, nineModel);
        assert.equal(result.updates[`${prefix}Clip`], nineClip);
        const repaired = await apply(mode, nineModel, [nineModel], { [`${prefix}Clip`]: 'qwen_3_4b.safetensors' });
        assert.equal(repaired.updates[`${prefix}Clip`], nineClip);
        const custom = await apply(mode, nineModel, [nineModel], { [`${prefix}Clip`]: 'custom.safetensors', [`${prefix}Vae`]: 'custom-vae.safetensors' });
        assert.deepEqual(custom.updates, {});
        const four = 'flux-2-klein-4b-Q4_K_M.gguf';
        const compatible = await apply(mode, four, [nineModel, four], { [`${prefix}Clip`]: nineClip });
        assert.equal(compatible.selectedModel, four);
        assert.equal(compatible.updates[`${prefix}Clip`], mode === 'flux2-simple' ? 'qwen3vl_4b_fp8_scaled.safetensors' : 'qwen_3_4b.safetensors');
    }
});
test('t2i graph applies an independent style before all six additional slots and saves the enriched prompt', () => {
    const input = { comfyFlux2Unet: options.comfyFlux2EditUnet, comfyFlux2Prompt: 'A portrait INK_TRIGGER', comfyFlux2NegativePrompt: 'blur',
        comfySeed: 42, comfyFlux2Style: style, comfyFlux2StyleStrength: 0, comfyFlux2UseStyleSettings: true, comfyFlux2Resolution: '832x1216',
        ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`comfyFlux2Lora${index + 1}Name`, `detail-${index}.safetensors`])) };
    const before = structuredClone(input);
    const graph = buildT2i(input);
    assert.deepEqual(input, before);
    assert.deepEqual(graph.style_lora.inputs.model, ['94', 0]); assert.deepEqual(graph['99'].inputs.model, ['style_lora', 0]);
    assert.equal(graph.style_lora.inputs.strength_model, 0);
    for (let i = 1; i <= 6; i++) assert.equal(graph['99'].inputs[`lora_${i}`].lora, `detail-${i - 1}.safetensors`);
    assert.equal(graph['93'].inputs.text, 'INK_TRIGGER\nA portrait\nInk drawing');
    assert.equal(graph['86'].inputs.text, 'blur'); assert.equal(graph['81'].inputs.steps, 12);
    assert.equal(graph['82'].inputs.cfg, 0); assert.equal(graph['80'].inputs.sampler_name, 'heun');
    const width = graph['87'].inputs.value, height = graph['88'].inputs.value;
    assert.equal(width % 16, 0); assert.equal(height % 16, 0);
    assert.ok(Math.abs(width * height / 2_000_000 - 1) < 0.02);
    assert.ok(Math.abs(width / height - 832 / 1216) < 0.01);
    const plain = buildT2i({ ...input, comfyFlux2Style: undefined, comfyFlux2EditStyle: style });
    assert.equal(plain.style_lora, undefined); assert.deepEqual(plain['99'].inputs.model, ['94', 0]);
    assert.equal(plain['93'].inputs.text, input.comfyFlux2Prompt);
    assert.equal(plain['87'].inputs.value, 832); assert.equal(plain['88'].inputs.value, 1216);
    assert.throws(() => buildT2i({ ...input, comfyFlux2Unet: 'flux2-klein-4b.gguf' }), /9B and 4B/);
    assert.match(serviceSource, /baseWorkflow\["93"\]\?\.inputs\?\.text/);
});

test('i2i style reaches the exact prompt and model chain without replacing manual prompt, references or additional LoRAs', () => {
    const original = structuredClone(options), originalStyle = structuredClone(style);
    const result = api.buildFlux2EditWorkflow('source.png', [{ imageName: 'pose.png', role: 'pose', description: 'Standing' }], options, style);
    assert.match(result.prompt, /Keep the red coat/); assert.match(result.prompt, /INK_TRIGGER/); assert.match(result.prompt, /Ink drawing/);
    assert.match(result.prompt, /Picture 2/); assert.doesNotMatch(result.prompt, /photorealistic|non-photographic/);
    assert.equal(result.workflow.prompt.inputs.text, result.prompt);
    assert.ok(result.prompt.startsWith('INK_TRIGGER\nSynthesize'));
    assert.equal(result.prompt.split('INK_TRIGGER').length - 1, 1);
    const commonTrigger = api.buildFlux2EditWorkflow('source.png', [{ imageName: 'identity.png', role: 'identity', description: '' }], options, { ...style, trigger: 'identity' });
    assert.ok(commonTrigger.prompt.startsWith('identity\n'));
    assert.match(commonTrigger.prompt, /exact identity reference/);
    assert.equal(result.workflow.style_lora.inputs.lora_name, style.lora);
    assert.equal(result.workflow.style_lora.inputs.strength_model, 0.6);
    assert.deepEqual(result.workflow.lora_1.inputs.model, ['style_lora', 0]);
    assert.deepEqual(result.workflow.guider.inputs.model, ['lora_1', 0]);
    assert.equal(result.workflow.scheduler.inputs.steps, 4);
    assert.deepEqual(options, original); assert.deepEqual(style, originalStyle);
});
test('sampling overrides are optional, zero strength/CFG work, and no-style workflows remain unchanged', () => {
    const result = api.buildFlux2EditWorkflow('source.png', [], { ...options, comfyFlux2EditUseStyleSettings: true, comfyFlux2EditStyleStrength: 0 }, style);
    assert.equal(result.workflow.style_lora.inputs.strength_model, 0);
    assert.equal(result.workflow.scheduler.inputs.steps, 12);
    assert.equal(result.workflow.guider.inputs.cfg, 0);
    assert.equal(result.workflow.sampler_select.inputs.sampler_name, 'heun');
    assert.equal(result.workflow.source_scale.inputs.megapixels, 2);
    const plain = api.buildFlux2EditWorkflow('source.png', [], options);
    const otherTool = api.buildFlux2EditWorkflow('source.png', [], { ...options, comfyFlux2EditStyle: style });
    assert.deepEqual(plain, otherTool);
    assert.equal(plain.workflow.style_lora, undefined); assert.match(plain.prompt, /photorealistic/);
    const promptOnly = api.buildFlux2EditWorkflow('source.png', [], options, { ...style, lora: '' });
    assert.equal(promptOnly.workflow.style_lora, undefined); assert.match(promptOnly.prompt, /INK_TRIGGER/);
});
test('incompatible styles and explicit additional LoRAs fail before a graph can be queued', () => {
    const four = { ...options, comfyFlux2EditUnet: 'flux-2-klein-4b.gguf', comfyFlux2EditLora1Name: '' };
    assert.throws(() => api.buildFlux2EditWorkflow('source.png', [], four, style), /9B and 4B/);
    const fourStyle = { ...style, model: 'FLUX2-4B', lora: 'FLUX2-4B/ink.safetensors' };
    assert.equal(api.buildFlux2EditWorkflow('source.png', [], four, fourStyle).workflow.style_lora.inputs.lora_name, fourStyle.lora);
    assert.throws(() => api.buildFlux2EditWorkflow('source.png', [], { ...four, comfyFlux2EditLora1Name: options.comfyFlux2EditLora1Name }), /incompatible/);
    assert.throws(() => api.buildFlux2EditWorkflow('source.png', [], options, { ...style, lora: fourStyle.lora }), /not FLUX2-9B/);
    assert.throws(() => api.buildFlux2EditWorkflow('source.png', [], { ...options, comfyFlux2EditStyleStrength: NaN }, style), /finite/);
    assert.throws(() => api.buildFlux2EditWorkflow('source.png', [], { ...options, comfyFlux2EditUnet: 'flux2/flux2DevFP8.gguf' }, style), /compatible FLUX2/);
});
test('image generator applies style snapshots explicitly, includes them in readiness, and clears them on reset', () => {
    assert.match(read('./comfyUIService.ts'), /buildFlux2EditWorkflow\(sourceUpload.name, references, options, options.comfyFlux2EditStyle\)/);
    const reducer = read('../store/generationSlice.ts'), app = read('../App.tsx');
    assert.match(reducer, /activeOptions\.comfyFlux2EditStyle\?\.title/);
    for (const source of [reducer, app]) assert.match(source, /comfyFlux2EditStyle: undefined/);
    assert.match(reducer, /action.payload.comfyFlux2EditUnet \?\? nextOptions.comfyFlux2EditUnet/);
});
