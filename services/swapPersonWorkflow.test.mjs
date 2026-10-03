import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = name => ts.transpileModule(readFileSync(new URL(name, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const module = await import(url(compile('./swapPersonWorkflow.ts').replace("'./swapAnythingWorkflow'", JSON.stringify(url(compile('./swapAnythingWorkflow.ts'))))));
const anything = await import(url(compile('./swapAnythingWorkflow.ts')));
const service = await import(url(compile('./swapPersonService.ts').replace("'./sceneVariationService'", JSON.stringify(url(compile('./sceneVariationService.ts'))))));
const scene = await import(url(compile('./sceneVariationService.ts')));
const maskPlanner = await import(url(compile('./swapPersonService.ts').replace("'./sceneVariationService'", JSON.stringify(url(`
    export * from '${url(compile('./sceneVariationService.ts'))}';
    import { sceneAutomaticMaskTargets } from '${url(compile('./sceneVariationService.ts'))}';
    export const generateAutomaticSceneMasks = async (image, scene, controls, intensity, checkpoint, padding, progress, stopped, area, region, partPrompts) => {
        const plan = sceneAutomaticMaskTargets(scene, controls, intensity, padding, region, partPrompts);
        return Object.fromEntries(plan.selected.map(person => [person.id, { plan, area, region, padding }]));
    }`)))));
const options = () => ({ ...module.defaultSwapPersonOptions(), destinationTarget: 'left person', donorTarget: 'only person', destinationStyle: 'VHS with soft edges and chroma bleed', seed: 123 });

test('quick person interface uses identical Swap Anything defaults and the user-validated face/hair graph', () => {
    const defaults = anything.defaultSwapAnythingOptions();
    const quick = module.defaultQuickSwapPersonOptions();
    assert.deepEqual(quick, { ...defaults, destinationTarget: "the woman's face", donorTarget: "the woman's face and hair" });
    const workflow = anything.buildSwapAnythingWorkflow('destination', 'donor', { ...quick, seed: 123 });
    assert.deepEqual(workflow, anything.buildSwapAnythingWorkflow('destination', 'donor', { ...defaults, destinationTarget: "the woman's face", donorTarget: "the woman's face and hair", seed: 123 }));
    assert.deepEqual(workflow.save.inputs.images, ['decode', 0]);
    assert.equal(workflow.composite, undefined);
    assert.equal(workflow.masked_latent, undefined);
    assert.equal(workflow.sampler_select.inputs.sampler_name, 'ddim');
    assert.equal(workflow.destination_mask.inputs.expand, 2);
    assert.deepEqual(module.personSwapTargets('face', 'the man on the left', 'the woman'), { destinationTarget: "the man on the left's face", donorTarget: "the woman's face" });
    for (const preset of module.personSwapPresets) assert.ok(module.personSwapTargets(preset.id, 'the person', 'the person').destinationTarget);
});

test('quick person default prompt anchors head scale to the destination without changing the engine or custom prompts', () => {
    const settings = { ...module.defaultQuickSwapPersonOptions(), seed: 123 };
    const baseline = anything.buildSwapAnythingWorkflow('destination', 'donor', settings);
    const prompt = module.buildQuickSwapPersonPrompt(settings);
    assert.ok(prompt.startsWith(baseline.positive.inputs.text));
    assert.match(prompt, /original head-to-body proportions and head size relative to the neck and shoulders in Picture 1/);
    assert.match(prompt, /destination anatomy and camera perspective, not to their apparent size or camera distance in Picture 2/);
    assert.match(prompt, /Do not enlarge the head or shrink the body/);
    assert.doesNotMatch(baseline.positive.inputs.text, /head-to-body/);
    const workflow = anything.buildSwapAnythingWorkflow('destination', 'donor', { ...settings, prompt });
    baseline.positive.inputs.text = prompt;
    assert.deepEqual(workflow, baseline);
    assert.equal(module.buildQuickSwapPersonPrompt({ ...settings, prompt: ' \n ' }), prompt);
    assert.equal(module.buildQuickSwapPersonPrompt({ ...settings, prompt: '  Custom editing instructions.  ' }), 'Custom editing instructions.');
    assert.equal(module.buildQuickSwapPersonPrompt({ ...settings, prompt }), prompt);
});

test('LanPaint keeps the supplied reference parameters and downsizes both references before VAE encoding', () => {
    const settings = module.defaultLanPaintPersonOptions();
    const graph = module.buildLanPaintPersonWorkflow('destination.jpg', 'donor.png', settings);
    assert.equal(settings.megapixels, 2);
    assert.equal(settings.seed, 782879205881587);
    assert.equal(graph['126'].inputs.unet_name, 'flux2\\moodyDesireMixFlux2_v30_pruned_fp8.safetensors');
    assert.equal(graph['161'].inputs.lora_name, 'FLUX2\\bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors');
    assert.equal(graph['146'].inputs.clip_name, 'qwen38BFluxKlein9BTE_38b.safetensors');
    assert.equal(graph['135'].inputs.value, 2);
    for (const id of ['115', '120']) {
        assert.equal(graph[id].class_type, 'ImageScaleToTotalPixels');
        assert.equal(graph[id].inputs.upscale_method, 'lanczos');
        assert.deepEqual(graph[id].inputs.megapixels, ['135', 0]);
    }
    assert.deepEqual(graph['125'].inputs.pixels, ['115', 0]);
    assert.deepEqual(graph['119'].inputs.pixels, ['120', 0]);
    assert.deepEqual(graph['150'].inputs.pixels, ['149', 0]);
    assert.deepEqual(graph['149'].inputs.width, graph['163'].inputs.width);
    assert.deepEqual(graph['149'].inputs.height, graph['163'].inputs.height);
    assert.deepEqual(graph['148'].inputs.image, ['147', 0]);
    assert.deepEqual(graph['156'].inputs, {
        seed: 782879205881587, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        LanPaint_NumSteps: 2, LanPaint_PromptMode: 'Image First', Inpainting_mode: '\uD83D\uDDBC\uFE0F Image Inpainting',
        LanPaint_Info: 'LanPaint KSampler. For more info, visit https://github.com/scraed/LanPaint. If you find it useful, please give a star \u2B50\uFE0F!',
        'More Info, Bug Report, Star on GitHub \u2B50': 'lanpaint_star_button',
        model: ['165', 0], positive: ['100', 0], negative: ['136', 0], latent_image: ['163', 0],
    });
    assert.deepEqual(graph['165'].inputs, { enable: true, model_type: 'Flux', warmup_steps: 0, skip_interval: 0, print_summary: true, model: ['161', 0] });
    assert.equal(graph['100'].inputs.guidance, 4);
    assert.deepEqual(graph['9'].inputs.images, ['104', 0]);
    assert.match(graph['107'].inputs.text, /^head_swap:/);
    assert.match(graph['107'].inputs.text, /Match the original head size, face-to-body ratio/);
    assert.ok(graph['107'].inputs.text.endsWith('Photorealistic, high quality, sharp details, 4K.'));
    assert.equal(Object.values(graph).some(node => /SAM3|Mask|Composite/.test(node.class_type)), false);
    for (const node of Object.values(graph)) for (const value of Object.values(node.inputs)) if (Array.isArray(value)) assert.ok(graph[value[0]]);
    const alternative = module.buildLanPaintPersonWorkflow('dest', 'donor', { ...settings, megapixels: 1, unet: 'klein.gguf', loraName: '', cacheEnabled: false, prompt: 'Custom prompt' });
    assert.equal(alternative['135'].inputs.value, 1);
    assert.equal(alternative['126'].class_type, 'UnetLoaderGGUF');
    assert.equal(alternative['161'], undefined); assert.equal(alternative['165'], undefined);
    assert.deepEqual(alternative['156'].inputs.model, ['126', 0]);
    assert.equal(alternative['107'].inputs.text, 'Custom prompt');
});

test('LanPaint style toggle preserves destination capture quality without altering the original prompt or other graph nodes', () => {
    const settings = module.defaultLanPaintPersonOptions();
    assert.equal(settings.preserveDestinationStyle, false);
    const original = module.buildLanPaintPersonWorkflow('dest', 'donor', settings);
    const enabled = module.buildLanPaintPersonWorkflow('dest', 'donor', { ...settings, preserveDestinationStyle: true });
    const prompt = enabled['107'].inputs.text;
    assert.match(prompt, /^head_swap:/);
    assert.match(prompt, /Match the original head size, face-to-body ratio/);
    assert.match(prompt, /Image 1 is the sole reference for visual style/);
    assert.match(prompt, /If VHS artifacts are present/);
    assert.match(prompt, /chroma bleed, analog noise and interlacing/);
    assert.match(prompt, /do not introduce artifacts absent from image 1/);
    assert.doesNotMatch(prompt, /Photorealistic, high quality, sharp details, 4K/);
    assert.equal(settings.prompt, original['107'].inputs.text);
    assert.equal(module.buildLanPaintPersonPrompt({ ...settings, preserveDestinationStyle: undefined }), settings.prompt);
    assert.equal(module.buildLanPaintPersonPrompt({ ...settings, preserveDestinationStyle: false }), settings.prompt);
    original['107'].inputs.text = prompt;
    assert.deepEqual(enabled, original);
    assert.equal(module.buildLanPaintPersonPrompt({ ...settings, preserveDestinationStyle: true, prompt }), prompt);
    const custom = { ...settings, prompt: 'Keep the drawing style and original pose.', preserveDestinationStyle: true };
    assert.ok(module.buildLanPaintPersonPrompt(custom).startsWith(custom.prompt));
    assert.equal(module.buildLanPaintPersonPrompt({ ...custom, preserveDestinationStyle: false }), custom.prompt);
});

test('LanPaint rejects invalid settings and missing nodes or models before uploads', () => {
    const settings = module.defaultLanPaintPersonOptions();
    for (const change of [{ megapixels: 0 }, { megapixels: Infinity }, { seed: -1 }, { steps: 0 }, { lanPaintSteps: 0 }, { cfg: NaN }, { denoise: 2 }, { prompt: ' ' }]) {
        assert.throws(() => module.buildLanPaintPersonWorkflow('dest', 'donor', { ...settings, ...change }));
    }
    const workflow = module.buildLanPaintPersonWorkflow('dest', 'donor', settings);
    assert.throws(() => module.validateLanPaintPersonWorkflow(workflow, {}), /LanPaint_KSampler/);
    const info = Object.fromEntries(Object.values(workflow).map(node => [node.class_type, { input: { required: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) => [key, [[value]]])) } }]));
    module.validateLanPaintPersonWorkflow(workflow, info);
    info.UNETLoader.input.required.unet_name = [[]];
    assert.throws(() => module.validateLanPaintPersonWorkflow(workflow, info), /Unavailable UNETLoader.unet_name/);
});

test('person swap preserves original pixels outside a validated mask and extracts only the masked donor', () => {
    const { workflow, prompt } = module.buildSwapPersonWorkflow('dest.png', 'donor.png', 'dest-mask.png', 'donor-mask.png', options());
    assert.equal(workflow.model.class_type, 'UNETLoader');
    assert.equal(workflow.model.inputs.unet_name, 'flux2\\flux2Klein9BInt8_v10.safetensors');
    assert.equal(workflow.clip.inputs.clip_name, 'qwen38BFluxKlein9BTE_38b.safetensors');
    assert.equal(workflow.sam, undefined);
    assert.equal(Object.values(workflow).some(node => node.class_type === 'SAM3_Detect'), false);
    assert.deepEqual(workflow.donor_detect.inputs, { image: ['donor_mask_source', 0], channel: 'red' });
    assert.equal(workflow.donor_background.class_type, 'EmptyImage');
    assert.deepEqual(workflow.donor_background.inputs.width, ['donor_size', 0]);
    assert.deepEqual(workflow.donor_isolated.inputs, { destination: ['donor_background', 0], source: ['donor', 0], mask: ['donor_detect', 0], x: 0, y: 0, resize_source: false });
    assert.deepEqual(workflow.donor_cut.inputs.image, ['donor_isolated', 0]);
    assert.deepEqual(workflow.donor_rgb.inputs.images, ['donor_cut', 0]);
    assert.deepEqual(workflow.sample.inputs.latent_image, ['masked_latent', 0]);
    assert.deepEqual(workflow.masked_latent.inputs.mask, ['destination_mask', 0]);
    assert.deepEqual(workflow.composite.inputs.destination, ['destination', 0]);
    assert.deepEqual(workflow.composite.inputs.mask, ['destination_original_mask', 0]);
    assert.deepEqual(workflow.result_scale.inputs.width, ['original_size', 0]);
    assert.deepEqual(workflow.save.inputs.images, ['composite', 0]);
    for (const node of Object.values(workflow)) {
        for (const value of Object.values(node.inputs)) {
            if (Array.isArray(value) && typeof value[0] === 'string') assert.ok(workflow[value[0]], `Missing graph reference ${value[0]}`);
        }
    }
    assert.equal(workflow.positive.inputs.text, prompt);
    assert.match(prompt, /ONLY reference for visual medium/);
    assert.match(prompt, /same VHS frame/);
    assert.match(prompt, /Do not restore, beautify, sharpen/);
});

test('donor identity is always used with independent anatomy and outfit choices, without gender gating', () => {
    const defaults = module.buildSwapPersonPrompt(options());
    assert.match(defaults, /donor identity/);
    assert.match(defaults, /existing body proportions and silhouette/);
    assert.match(defaults, /Retain the destination person's original garments/);
    const changed = module.buildSwapPersonPrompt({ ...options(), appearance: 'donor', outfit: 'donor' });
    assert.match(changed, /different gender presentation is allowed/);
    assert.match(changed, /Use the visible donor outfit/);
    assert.doesNotMatch(changed, /existing body proportions and silhouette|Retain the destination person's original garments/);
    assert.throws(() => module.buildSwapPersonPrompt({ ...options(), destinationTarget: '' }), /Select a person/);
    assert.throws(() => module.buildSwapPersonPrompt({ ...options(), destinationStyle: '' }), /visual style/);
});

test('analysis accepts explicit people and style, rejects ambiguous schema and strips unrelated fields', async () => {
    const raw = { style: 'VHS frame', uncertainty: '', people: [{ id: 'person-1', description: 'left foreground', samDescription: 'person with short hair wearing a red jacket on the left', gender: 'unrequested' }] };
    const parsed = service.parseSwapPersonAnalysis(`\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``);
    assert.equal(parsed.people[0].gender, undefined);
    assert.equal(parsed.style, 'VHS frame');
    for (const mutate of [value => value.people.push(value.people[0]), value => value.people[0].id = 'wrong', value => value.style = '', value => value.people[0].samDescription = '', value => value.people = Array(13).fill(value.people[0])]) {
        const invalid = structuredClone(raw); mutate(invalid);
        assert.throws(() => service.parseSwapPersonAnalysis(JSON.stringify(invalid)));
    }
    assert.deepEqual(service.parseSwapPersonAnalysis(JSON.stringify({ ...raw, people: [] })).people, []);
    await assert.rejects(service.calculateSwapPersonMask({}, parsed, 'missing', 'sam.safetensors', 0, false, () => {}, () => false), /Select a person/);
});

test('invalid sampling values are rejected before workflow submission', () => {
    for (const patch of [{ seed: NaN }, { seed: -1 }, { seed: 1.2 }, { steps: 0 }, { cfg: Infinity }, { megapixels: 0 }, { donorMegapixels: 8 }]) {
        assert.throws(() => module.buildSwapPersonWorkflow('source', 'donor', 'mask', 'donor-mask', { ...options(), ...patch }), /Invalid FLUX2/);
    }
    const gguf = module.buildSwapPersonWorkflow('source', 'donor', 'mask', 'donor-mask', { ...options(), unet: 'klein.gguf' }).workflow;
    assert.equal(gguf.model.class_type, 'UnetLoaderGGUF');
});

test('outfit preservation limits both references to head or face and keeps hair in face mode', () => {
    assert.equal(module.defaultSwapPersonOptions().maskGrow, 8);
    assert.equal(module.swapPersonRegion(options()), 'head');
    assert.equal(module.swapPersonRegion({ ...options(), identityRegion: 'face' }), 'face');
    assert.equal(module.swapPersonRegion({ ...options(), identityRegion: 'face', outfit: 'donor' }), 'body');
    const head = module.buildSwapPersonPrompt({ ...options(), appearance: 'donor' });
    assert.match(head, /Replace only the selected head, including hair/);
    assert.doesNotMatch(head, /Use the donor's visible body proportions/);
    const face = module.buildSwapPersonPrompt({ ...options(), identityRegion: 'face' });
    assert.match(face, /Replace only the selected face/);
    assert.match(face, /Preserve the destination hair, hairstyle, hairline/);
    assert.doesNotMatch(face, /facial anatomy, hair/);
});

test('SAM plans head and face for the selected person, forwards margin and never expands partial body boxes', async () => {
    const analysis = { style: 'photo', uncertainty: '', people: [
        { id: 'person-1', description: 'left', samDescription: 'person in red on the left' },
        { id: 'person-2', description: 'right', samDescription: 'person in blue on the right' },
    ] };
    for (const region of ['body', 'head', 'face']) {
        for (const selected of ['person-1', 'person-2']) {
            const result = await maskPlanner.calculateSwapPersonMask({}, analysis, selected, 'sam', 8, true, () => {}, () => false, region);
            const partial = region !== 'body';
            assert.equal(result.area, partial ? 'silhouette' : 'movement');
            assert.equal(result.padding, 8);
            assert.equal(result.plan.targets.length, region === 'head' ? 5 : partial ? 4 : 2);
            assert.deepEqual(result.plan.selected.map(person => person.id), [selected]);
            assert.equal(result.plan.selected[0].faceOnly, partial);
            assert.equal(result.plan.targets.find(target => target.id === `body:${selected}`).padding, partial ? 0 : 8);
            if (partial) {
                assert.ok(result.plan.targets.every(target => target.padding === 0));
                assert.equal(result.plan.targets[2].prompt, `${region === 'head' ? 'hair' : 'face'} of the person ${analysis.people.find(person => person.id === selected).description}`);
                if (region === 'head') assert.equal(result.plan.targets[3].prompt, `face of the person ${analysis.people.find(person => person.id === selected).description}`);
                assert.equal(result.plan.targets.at(-1).id, `clothing:${selected}`);
            }
        }
    }
});

test('head mask includes an independently detected face when SAM returns hair only, without editing clothes', () => {
    const mask = rows => ({ width: 4, height: 12, pixels: Uint8Array.from({ length: 48 }, (_, index) => rows.includes(Math.floor(index / 4)) ? 255 : 0) });
    const body = mask([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const hair = mask([1, 2]);
    const face = mask([3, 4]);
    const combined = scene.combineSceneHeadMasks(body, hair, face);
    assert.equal(combined.pixels[4], 255);
    assert.equal(combined.pixels[12], 255);
    assert.equal(combined.pixels[28], 0);
    assert.equal(hair.pixels[12], 0);
    assert.throws(() => scene.combineSceneHeadMasks(body, body, face), /no rectangular replacement mask/);
    assert.throws(() => scene.combineSceneHeadMasks(body, hair, mask([11])), /no face inside/);
    assert.throws(() => scene.combineSceneHeadMasks(body, { ...hair, width: 8 }, face), /dimensions/);
    const portrait = mask([1, 2, 3, 4]);
    assert.doesNotThrow(() => scene.combineSceneHeadMasks(portrait, portrait, face));
});

test('partial mask margin grows pixels without wrapping rows and bystander isolation still applies', () => {
    const mask = { width: 5, height: 5, pixels: new Uint8Array(25) };
    mask.pixels[12] = 255;
    assert.deepEqual(scene.growSceneMaskPixels(mask, 0), mask.pixels);
    const grown = scene.growSceneMaskPixels(mask, 1);
    assert.equal(grown.filter(Boolean).length, 9);
    assert.equal(grown[6], 255);
    assert.equal(grown[0], 0);
    assert.equal(mask.pixels.filter(Boolean).length, 1);
    const own = { ...mask, pixels: new Uint8Array(25).fill(255) };
    own.pixels[13] = 0;
    const other = { ...mask, pixels: new Uint8Array(25) }; other.pixels[13] = 255;
    const isolated = scene.isolateAutomaticSceneMasks({ own, other }, { own: { ...mask, pixels: grown } }, ['own']);
    assert.equal(isolated.own[13], 0);
    assert.equal(isolated.own[6], 255);
    assert.throws(() => scene.growSceneMaskPixels(mask, -1), /Mask margin/);
});

test('hair and face union preserves long uneven strands below the chin without filling clothing between them', () => {
    const body = { width: 8, height: 16, pixels: new Uint8Array(128).fill(255) };
    const hair = { ...body, pixels: new Uint8Array(128) };
    const face = { ...body, pixels: new Uint8Array(128) };
    for (let row = 1; row <= 12; row++) hair.pixels[row * 8 + 1] = 255;
    for (let row = 1; row <= 10; row++) hair.pixels[row * 8 + 6] = 255;
    hair.pixels.fill(255, 8 + 1, 8 + 7);
    for (let row = 2; row <= 4; row++) face.pixels.fill(255, row * 8 + 2, row * 8 + 6);
    const merged = scene.combineSceneHeadMasks(body, hair, face);
    assert.equal(merged.pixels[12 * 8 + 1], 255);
    assert.equal(merged.pixels[10 * 8 + 6], 255);
    assert.equal(merged.pixels[11 * 8 + 6], 0);
    assert.equal(merged.pixels[8 * 8 + 4], 0);
    assert.equal(merged.pixels[3 * 8 + 4], 255);
    assert.equal(merged.warning, undefined);
});

test('clothing is protected even when head detection includes the shirt and margin grows into it', () => {
    const body = { width: 8, height: 16, pixels: new Uint8Array(128).fill(255) };
    const face = { ...body, pixels: new Uint8Array(128) };
    face.pixels.fill(255, 8, 32);
    const clothing = { ...body, pixels: new Uint8Array(128) };
    clothing.pixels.fill(255, 40);
    const protectedHair = scene.protectSceneClothing(body, clothing);
    const combined = scene.combineSceneHeadMasks(body, protectedHair, face);
    const padded = { ...combined, pixels: scene.growSceneMaskPixels(combined, 8) };
    assert.equal(padded.pixels[80], 255);
    const final = scene.protectSceneClothing(padded, clothing);
    assert.equal(final.pixels[80], 0);
    assert.equal(final.pixels[16], 255);
    assert.throws(() => scene.protectSceneClothing(body, body), /Clothing SAM prompt/);
    assert.throws(() => scene.protectSceneClothing(body, { ...clothing, width: 4 }), /dimensions/);
});

test('single-person SAM part prompts are short and overrides never alter whole-body selection', async () => {
    const analysis = { style: 'photo', uncertainty: '', people: [{ id: 'person-1', description: 'center', samDescription: 'person with brown hair wearing a purple shirt' }] };
    assert.deepEqual(service.defaultSwapPersonPartPrompts(analysis, 'person-1'), { hair: 'hair', face: 'face', clothing: 'clothing' });
    const prompts = { hair: 'long brown hair', face: 'face', clothing: 'purple shirt' };
    const result = await maskPlanner.calculateSwapPersonMask({}, analysis, 'person-1', 'sam', 0, false, () => {}, () => false, 'head', prompts);
    assert.deepEqual(result.plan.targets.map(target => target.prompt), [analysis.people[0].samDescription, 'long brown hair', 'face', 'purple shirt']);
    await assert.rejects(maskPlanner.calculateSwapPersonMask({}, analysis, 'person-1', 'sam', 0, false, () => {}, () => false, 'head', { ...prompts, clothing: '' }), /clothing SAM prompt/);
});