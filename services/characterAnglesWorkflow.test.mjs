import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./characterAnglesWorkflow.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const character = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

test('Qwen 2.1 Create Character injects eight controlled prompts with up to four ordered image references', () => {
    const options = { comfyCharacterMode: 'qwen21-create', clothing: 'image', background: 'image' };
    const prompts = character.buildQwen21CharacterAnglePrompts(options, { source: 'source', clothing: 'outfit', background: 'room', pose: 'pose' });
    assert.equal(prompts.length, 8);
    for (const prompt of prompts) {
        for (let index = 1; index <= 4; index++) assert.ok(prompt.includes(`<image${index}>`));
        assert.ok(!prompt.includes('DWPose')); assert.ok(!prompt.includes('Picture 1')); assert.ok(prompt.includes('one person only'));
        assert.ok(prompt.includes('clothing reference <image2>')); assert.ok(prompt.includes('background reference <image3>'));
        assert.ok(prompt.includes('body pose from <image4>') || prompt.includes('instead of copying the pose reference <image4>')); assert.ok(prompt.includes('seamlessly'));
    }
    assert.ok(prompts[0].includes('Camera angle: close-up')); assert.ok(prompts[7].includes('Camera angle: 90 degrees left'));
    const filtered = { ...options, comfyCharacterAngleSettings: Object.fromEntries(character.CHARACTER_ANGLES.map(({id}, index) => [id, { enabled: index === 2, angle: 'back view', pose: 'sitting', expression: 'happy', prompt: 'Stale FLUX override' }])) };
    const selected = character.buildQwen21CharacterAnglePrompts(filtered, { source: 'source', pose: 'pose' });
    assert.equal(selected.length, 1); assert.ok(selected[0].includes('Camera angle: back view'));assert.ok(selected[0].includes('Pose: sitting'));assert.ok(selected[0].includes('Facial expression: happy'));assert.ok(selected[0].includes('instead of copying the pose reference <image2>'));assert.ok(!selected[0].includes('body pose from'));assert.ok(!selected[0].includes('<image3>'));assert.ok(!selected[0].includes('Stale FLUX override'));
    assert.equal(new Set(prompts).size,8);assert.ok(prompts[4].startsWith('Edit <image1>'));assert.ok(prompts[4].includes('Camera angle: aerial view'));assert.ok(!prompts[4].includes('strict visual reference'));assert.ok(!prompts[4].includes('one complete body'));
    const preserve=character.buildQwen21CharacterAnglePrompts({...filtered,comfyCharacterPreserveBackgroundPerspective:true},{source:'source'});
    assert.ok(preserve[0].includes('new perspective matching the requested camera angle'));assert.ok(preserve[0].includes('do not retain the original camera view'));
    assert.equal(character.buildQwen21CharacterAnglePrompts({ ...options, comfyCharacterAngleSettings: Object.fromEntries(character.CHARACTER_ANGLES.map(({id}) => [id, {enabled:false}])) }, {source:'source'}).length, 0);
});

test('Qwen Create Character green screen overrides stale custom and preserve-background settings in every output', () => {
    const options = { background: 'green screen', customBackground: 'a furnished office', comfyCharacterPreserveBackgroundPerspective: true };
    const prompts = character.buildQwen21CharacterAnglePrompts(options, { source: 'source', background: 'room' });
    assert.equal(prompts.length, 8);
    for (const prompt of prompts) {
        assert.match(prompt, /solid, uniform chroma-key green \(#00FF00\)/);
        assert.match(prompt, /Remove all scenery, furniture, objects and floor details/);
        assert.doesNotMatch(prompt, /furnished office|Preserve the original background|background reference|Blend the person/);
    }
    const white = character.buildQwen21CharacterAnglePrompts({ background: 'white', customBackground: 'a furnished office' }, { source: 'source' });
    assert.match(white[0], /Use a white background/);
    assert.doesNotMatch(white[0], /furnished office/);
});

test('FLUX2 Character sends an explicit workflow prompt unchanged through the reference graph', () => {
    const prompt = 'Using the input image as the strict visual reference, create a 45-degree front three-quarter view of the same subject.\n\nPreserve the same pose and expression.\n\nCamera angle: front three-quarter view, approximately 45 degrees, eye-level.';
    const options = {
        comfySeed: 1037377806030922,
        comfyCharacterFlux2Unet: 'flux-2-klein-4b-Q4_K_M.gguf', comfyCharacterFlux2Clip: 'qwen_3_4b.safetensors',
        comfyCharacterAngleSettings: Object.fromEntries(character.CHARACTER_ANGLES.map(({ id }, index) => [id, {
            enabled: index === 0, angle: 'front three-quarter view', pose: character.CHARACTER_NONE_VALUE,
            expression: character.CHARACTER_NONE_VALUE, prompt,
        }])),
    };
    const { workflow, prompts } = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, options);
    assert.deepEqual(workflow.model.inputs, { unet_name: 'flux-2-klein-4b-Q4_K_M.gguf' });
    assert.equal(workflow.model.class_type, 'UnetLoaderGGUF');
    assert.deepEqual(workflow.clip.inputs, { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' });
    assert.equal(workflow.vae.inputs.vae_name, 'flux2-vae.safetensors');
    assert.deepEqual(workflow.source_scale.inputs, { upscale_method: 'nearest-exact', megapixels: 1, resolution_steps: 1, image: ['source', 0] });
    assert.deepEqual(workflow.source_latent.inputs, { pixels: ['source_scale', 0], vae: ['vae', 0] });
    assert.deepEqual(workflow.output_0_reference_1.inputs, { conditioning: ['output_0_prompt', 0], latent: ['source_latent', 0] });
    assert.deepEqual(workflow.output_0_negative.inputs, { conditioning: ['output_0_prompt', 0] });
    assert.deepEqual(workflow.output_0_negative_reference.inputs, { conditioning: ['output_0_negative', 0], latent: ['source_latent', 0] });
    assert.deepEqual(workflow.output_0_guider.inputs, { cfg: 1, model: ['model', 0], positive: ['output_0_reference_1', 0], negative: ['output_0_negative_reference', 0] });
    assert.deepEqual(workflow.output_0_scheduler.inputs, { steps: 4, width: ['source_size', 0], height: ['source_size', 1] });
    assert.deepEqual(workflow.output_0_latent.inputs, { width: ['source_size', 0], height: ['source_size', 1], batch_size: 1 });
    assert.equal(workflow.output_0_sampler_select.inputs.sampler_name, 'euler');
    assert.equal(workflow.output_0_noise.inputs.noise_seed, options.comfySeed);
    assert.equal(workflow.output_0_sample.class_type, 'SamplerCustomAdvanced');
    assert.equal(workflow.flux2_lora_1, undefined);
    assert.equal(workflow.flux2_cache_dit, undefined);
    assert.equal(workflow.output_0_prompt.inputs.text, prompt);
    assert.deepEqual(prompts, [prompt]);
});

test('reference preset supplies six complete views and an editable disabled close-up template', () => {
    const preset = character.createFlux2CharacterReferencePreset();
    assert.equal(preset.comfyCharacterMode, 'flux2');
    assert.equal(preset.comfyCharacterFlux2UseLoras, false);
    assert.equal(preset.comfyCharacterFlux2UseCacheDit, false);
    const settings = Object.values(preset.comfyCharacterAngleSettings);
    assert.equal(settings.filter(setting => setting.prompt).length, 7);
    assert.ok(settings.every(setting => setting.pose === character.CHARACTER_NONE_VALUE && setting.expression === character.CHARACTER_NONE_VALUE));
    const { workflow, prompts } = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, preset);
    assert.deepEqual(workflow.model.inputs, { unet_name: 'flux2\\flux2Klein9BInt8_v10.safetensors', weight_dtype: 'default' });
    assert.equal(workflow.model.class_type, 'UNETLoader');
    assert.equal(workflow.clip.inputs.clip_name, 'qwen38BFluxKlein9BTE_38b.safetensors');
    const defaults = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, { comfyCharacterAngleSettings: preset.comfyCharacterAngleSettings }).workflow;
    assert.deepEqual(defaults.model, workflow.model);
    assert.deepEqual(defaults.clip, workflow.clip);
    assert.equal(prompts.length, 6);
    assert.deepEqual(prompts, settings.slice(0, 6).map(setting => setting.prompt));
    assert.deepEqual(character.getEnabledCharacterAngles(preset).map(angle => angle.label), settings.slice(0, 6).map(setting => setting.angle));
    assert.equal(workflow.output_5_reference_1.inputs.latent[0], 'source_latent');
    settings[6].enabled = true;
    assert.throws(() => character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, preset), /bracketed close-up/);
    settings[6].prompt = settings[6].prompt.replace('[front close-up / side close-up / three-quarter close-up]', 'front close-up').replace('[FACE / HANDS / WHEELS / SURFACE DETAIL / PROP DETAIL / TEXTURE AREA]', 'FACE');
    assert.equal(character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, preset).prompts.length, 7);
    assert.equal(character.createFlux2CharacterReferencePreset().comfyCharacterAngleSettings['45_left'].enabled, false);
});

test('background perspective toggle replaces background instructions without mutating stored prompts', () => {
    const preset = character.createFlux2CharacterReferencePreset();
    const original = structuredClone(preset);
    const enabled = { ...preset, comfyCharacterPreserveBackgroundPerspective: true };
    const { workflow, prompts } = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png', background: 'other.png' }, enabled);
    for (const prompt of prompts) {
        assert.match(prompt, /Background: Preserve the original background with a new perspective matching the requested camera angle/);
        assert.doesNotMatch(prompt, /Background: plain/);
        assert.equal(prompt.split('Background:').length, 2);
    }
    assert.equal(workflow.background_source, undefined);
    assert.deepEqual(preset, original);
    assert.deepEqual(character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, preset).prompts, Object.values(original.comfyCharacterAngleSettings).slice(0, 6).map(setting => setting.prompt));
    const id = character.CHARACTER_ANGLES[0].id;
    for (const text of ['Preserve the exact background.\nCamera angle: side view.', 'Keep the original background unchanged.\nBackground: plain neutral background.\nCamera angle: side view.', 'Camera angle: side view.']) {
        enabled.comfyCharacterAngleSettings[id].prompt = text;
        const prompt = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, enabled).prompts[0];
        assert.equal(prompt.split('Background:').length, 2);
        assert.match(prompt, /Camera angle: side view/);
        assert.doesNotMatch(prompt, /Preserve the exact background|Keep the original background unchanged|Background: plain/);
    }
    enabled.comfyCharacterAngleSettings[id].prompt = undefined;
    enabled.customBackground = 'a different planet';
    const prompt = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png', background: 'other.png' }, enabled).prompts[0];
    assert.match(prompt, /Background: Preserve the original background/);
    assert.doesNotMatch(prompt, /different planet|background reference/);
});

test('structured Character prompts remain available and Qwen ignores FLUX2 full prompts', () => {
    const preset = character.createFlux2CharacterReferencePreset();
    const id = character.CHARACTER_ANGLES[0].id;
    const structured = { ...preset, comfyCharacterAngleSettings: { ...preset.comfyCharacterAngleSettings, [id]: { ...preset.comfyCharacterAngleSettings[id], prompt: undefined } } };
    assert.match(character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, structured).prompts[0], /Camera angle: front three-quarter view\./);
    assert.match(character.buildCharacterAnglePrompts(preset)[0], /^Set the camera angle to front three-quarter view\./);
    const withReferences = character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png', clothing: 'clothes.png', background: 'background.png', pose: 'pose.png' }, preset).workflow;
    assert.deepEqual(withReferences.output_0_reference_4.inputs.latent, ['pose_latent', 0]);
    structured.comfyCharacterAngleSettings[id].prompt = '';
    assert.throws(() => character.buildFlux2CharacterAnglesWorkflow({ source: 'source.png' }, structured), /Enter a full FLUX2 prompt/);
});