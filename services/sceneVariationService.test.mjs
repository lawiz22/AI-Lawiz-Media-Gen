import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const load = async (name) => {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const scene = await load('./sceneVariationService.ts');
const flux = await load('./flux2EditWorkflow.ts');
const segmentation = await load('./sceneMaskWorkflow.ts');
test('SAM3 receives a single category even when a description contains commas or detection-count syntax', () => {
    const description = 'a woman with short curly blonde hair wearing a purple and green patterned shirt, in the foreground left.';
    const graph = segmentation.buildSceneMaskWorkflow('source.png', 'sam3.safetensors', description);
    assert.equal(graph.text.inputs.text, 'a woman with short curly blonde hair wearing a purple and green patterned shirt in the foreground left.');
    assert.equal(description.split(',').filter(part => part.trim()).length, 2);
    assert.equal(graph.text.inputs.text.split(',').filter(part => part.trim()).length, 1);
    for (const input of ['(a man, on the right):2', 'a man, on the right: 3.0', 'a man,\n on the right', '(a man, on the right:2)']) {
        assert.equal(segmentation.buildSceneMaskWorkflow('source.png', 'sam3.safetensors', input).text.inputs.text, 'a man on the right');
    }
    assert.throws(() => segmentation.buildSceneMaskWorkflow('source.png', 'sam3.safetensors', '(), :2'), /describe/);
    assert.equal(graph.detect.inputs.individual_masks, true);
});
test('SAM3 segmentation uses individual masks at original resolution with compatible input checks', () => {
    const graph = segmentation.buildSceneMaskWorkflow('source.png', 'sam3.safetensors', 'person on the left');
    assert.equal(graph.detect.inputs.individual_masks, true);
    assert.deepEqual(graph.detect.inputs.image, ['source', 0]);
    assert.deepEqual(graph.text.inputs.clip, ['sam', 1]);
    assert.deepEqual(graph.raw_save.inputs.images, ['mask_image', 0]);
    assert.deepEqual(graph.save.inputs.images, ['expanded_image', 0]);
    assert.deepEqual(graph.grow.inputs.mask, ['detect', 0]);
    const info = Object.fromEntries(Object.values(graph).map(node => [node.class_type, { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ['ANY']])) } }]));
    info.CheckpointLoaderSimple.input.required.ckpt_name = ['COMBO', { options: ['sam3.safetensors'] }];
    assert.deepEqual(segmentation.sceneSegmentationErrors(info, 'sam3.safetensors'), []);
    delete info.SAM3_Detect.input.required.individual_masks;
    assert.match(segmentation.sceneSegmentationErrors(info, 'sam3.safetensors').join(), /individual_masks/);
    assert.match(segmentation.sceneSegmentationErrors(info, 'missing').join(), /checkpoint/);
});
const choices = (axis) => scene.SCENE_INTENSITIES.map(intensity => ({ label: `${intensity} ${axis}`, instruction: `${axis} ${intensity}`, intensity }));
const fixture = () => ({ environment: 'outdoor', location: 'Courtyard', anchors: ['Brick wall on left', 'Existing bench'],
    style: 'VHS, chroma bleed, soft detail', lighting: 'Overcast daylight', camera: 'Eye level', season: 'Summer', uncertainty: '',
    subjects: [{ id: 'person-1', description: 'Left, red shirt', faceVisible: true, pose: 'Standing', expression: 'Neutral', poses: choices('pose'), expressions: choices('expression') },
        { id: 'person-2', description: 'Right, blue shirt', faceVisible: false, pose: 'Seated', expression: 'Hidden', poses: choices('pose'), expressions: [] }],
    lightingChoices: choices('lighting'), cameraChoices: choices('camera'), seasonChoices: choices('season') });
const settings = scene.defaultSceneSettings();

test('dedicated appearance descriptions reach SAM only, with legacy fallback and validation', () => {
    const analysis = fixture();
    analysis.subjects[0].samDescription = 'person with short blond hair wearing a checked top and patterned cardigan on the left';
    analysis.subjects[1].samDescription = 'person with curly brown hair and a beard wearing a dark jacket and striped tie on the right';
    assert.deepEqual(scene.parseSceneAnalysis(JSON.stringify(analysis)), analysis);
    assert.ok(scene.SCENE_ANALYSIS_SCHEMA.properties.subjects.items.required.includes('samDescription'));
    const controls = scene.createSceneControls(analysis); controls.pose.enabled = true;
    const plan = scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32);
    assert.equal(plan.targets[0].prompt, analysis.subjects[0].samDescription);
    assert.equal(plan.targets[1].prompt, analysis.subjects[1].samDescription);
    const samGraph = segmentation.buildSceneMaskWorkflow('source.png', 'sam3.safetensors', plan.targets[0].prompt);
    assert.equal(samGraph.text.inputs.text, analysis.subjects[0].samDescription);
    for (const camera of [false, true]) {
        controls.camera.enabled = camera;
        const [job] = scene.buildSceneJobs(analysis, controls, 'moderate', 1, settings);
        assert.doesNotMatch(flux.buildFlux2EditWorkflow('source', [], job.options).prompt, /patterned cardigan|striped tie/);
    }
    controls.camera.enabled = false;
    const masks = { 'person-1': maskFixture([255, 0]), 'person-2': maskFixture([0, 255]) };
    const [masked] = scene.buildMaskedSceneJobs(analysis, controls, 'moderate', 1, settings, masks);
    for (const pass of masked.maskedPasses) assert.doesNotMatch(flux.buildMaskedFlux2EditWorkflow('source', 'mask', pass.options).prompt, /patterned cardigan|striped tie/);
    controls.pose.enabled = false; controls.expression.enabled = true;
    assert.equal(scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32).targets.at(-1).prompt, `face of the ${analysis.subjects[0].samDescription}`);
    delete analysis.subjects[0].samDescription;
    assert.equal(scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32).targets[0].prompt, `person ${analysis.subjects[0].description}`);
    analysis.subjects[0].samDescription = '   ';
    assert.equal(scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32).targets[0].prompt, `person ${analysis.subjects[0].description}`);
    for (const invalid of [42, null, 'a'.repeat(401)]) {
        analysis.subjects[0].samDescription = invalid;
        assert.throws(() => scene.parseSceneAnalysis(JSON.stringify(analysis)), /SAM description/);
    }
});

test('masked workflow restricts sampling and composites over the unchanged source; Global stays untouched', () => {
    const global = flux.buildFlux2EditWorkflow('original.png', [], settings).workflow;
    const masked = flux.buildMaskedFlux2EditWorkflow('current.png', 'mask.png', settings).workflow;
    assert.equal(masked.source.inputs.image, 'current.png');
    assert.equal(masked.edit_mask_image.inputs.image, 'mask.png');
    assert.equal(masked.edit_mask.inputs.channel, 'red');
    assert.equal(masked.edit_mask_scale.inputs.upscale_method, 'nearest-exact');
    assert.deepEqual(masked.edit_mask_scale.inputs.width, ['source_size', 0]);
    assert.deepEqual(masked.masked_latent.inputs, { samples: ['source_latent', 0], mask: ['edit_mask', 0] });
    assert.deepEqual(masked.sample.inputs.latent_image, ['masked_latent', 0]);
    assert.deepEqual(masked.masked_composite.inputs.destination, ['source', 0]);
    assert.deepEqual(masked.masked_composite.inputs.source, ['output_scale', 0]);
    assert.deepEqual(masked.masked_composite.inputs.mask, ['output_mask', 0]);
    assert.deepEqual(masked.output_mask.inputs.image, ['edit_mask_image', 0]);
    assert.deepEqual(masked.output_scale.inputs.width, ['original_size', 0]);
    assert.deepEqual(masked.save.inputs.images, ['masked_composite', 0]);
    assert.deepEqual(global.sample.inputs.latent_image, ['latent', 0]);
    assert.deepEqual(global.save.inputs.images, ['decode', 0]);
    assert.equal(global.masked_composite, undefined);
    assert.throws(() => flux.buildMaskedFlux2EditWorkflow('source.png', '', settings), /mask/);
});

const maskFixture = (values) => ({ file: new File(['mask'], 'mask.png', { type: 'image/png' }), width: values.length, height: 1, pixels: Uint8Array.from(values), preview: '' });
test('mask validation rejects empty, full, transparent, colored and overlapping regions', () => {
    const rgba = values => Uint8ClampedArray.from(values.flatMap(value => [value, value, value, 255]));
    assert.deepEqual([...scene.sceneMaskPixels(rgba([0, 128, 255]), 3, 1)], [0, 128, 255]);
    assert.throws(() => scene.sceneMaskPixels(rgba([0, 0]), 2, 1), /no editable/);
    assert.throws(() => scene.sceneMaskPixels(rgba([255, 255]), 2, 1), /protected/);
    assert.throws(() => scene.sceneMaskPixels(Uint8ClampedArray.from([255, 0, 0, 255]), 1, 1), /grayscale/);
    assert.throws(() => scene.sceneMaskPixels(Uint8ClampedArray.from([0, 0, 0, 0]), 1, 1), /opaque/);
    assert.throws(() => scene.sceneMaskPixels(rgba([0, 255]), 3, 1), /dimensions/);
    const masks = { 'person-1': maskFixture([0, 255, 0]), 'person-2': maskFixture([255, 0, 0]) };
    assert.doesNotThrow(() => scene.validateSceneMasks(Object.keys(masks), masks));
    assert.throws(() => scene.validateSceneMasks(['missing'], masks), /Import a mask/);
    masks['person-2'] = maskFixture([0, 1, 0]);
    assert.throws(() => scene.validateSceneMasks(Object.keys(masks), masks), /overlap/);
    masks['person-2'] = maskFixture([255, 0]);
    assert.throws(() => scene.validateSceneMasks(Object.keys(masks), masks), /dimensions/);
});
test('masked jobs isolate each person, retain choices and snapshot masks and settings', () => {
    const analysis = fixture(); const controls = scene.createSceneControls(analysis);
    controls.pose.enabled = true; controls.expression.enabled = true;
    const masks = { 'person-1': maskFixture([255, 0, 0]), 'person-2': maskFixture([0, 255, 0]) };
    const localSettings = { ...settings, comfySeed: 55 };
    const jobs = scene.buildMaskedSceneJobs(analysis, controls, 'moderate', 2, localSettings, masks, () => 0);
    assert.equal(jobs[0].maskedPasses.length, 2);
    const [first, second] = jobs[0].maskedPasses;
    assert.match(first.options.comfyFlux2EditPrompt, /TARGET pose: pose moderate/);
    assert.match(first.options.comfyFlux2EditPrompt, /TARGET expression: expression moderate/);
    assert.doesNotMatch(first.options.comfyFlux2EditPrompt, /Right, blue shirt/);
    assert.doesNotMatch(second.options.comfyFlux2EditPrompt, /TARGET expression/);
    assert.match(second.options.comfyFlux2EditPrompt, /Keep this face hidden/);
    assert.match(first.options.comfyFlux2EditPrompt, /Keep exactly 2 original people/);
    assert.match(first.options.comfyFlux2EditPrompt, /original clothing unchanged/);
    const originalMask = masks['person-1'].file;
    masks['person-1'] = maskFixture([0, 0, 255]); localSettings.comfySeed = 88;
    assert.equal(first.mask, originalMask); assert.equal(first.options.comfySeed, 55);
    const graph = flux.buildMaskedFlux2EditWorkflow('current.png', 'mask.png', first.options).workflow;
    assert.match(graph.prompt.inputs.text, /TARGET pose: pose moderate/);
    controls.camera.enabled = true;
    assert.throws(() => scene.buildMaskedSceneJobs(analysis, controls, 'moderate', 1, settings, masks), /Global/);
    controls.camera.enabled = false; controls['pose:person-2'].enabled = false;
    assert.equal(scene.buildMaskedSceneJobs(analysis, controls, 'moderate', 1, settings, { 'person-1': masks['person-1'] })[0].maskedPasses.length, 1);
});
test('masked passes chain within a variation, reset each variation, and do not expose partial successes', async () => {
    const passes = [{ personId: 'person-1', options: { comfySeed: 1 } }, { personId: 'person-2', options: { comfySeed: 1 } }];
    const inputs = [];
    const execute = async (image, pass) => { inputs.push(image); return { image: image + ':' + pass.personId, prompt: pass.personId }; };
    for (let index = 0; index < 2; index++) {
        const result = await scene.runMaskedScenePasses('original', passes, execute);
        assert.equal(result.image, 'original:person-1:person-2'); assert.match(result.prompt, /person-2 \/ seed 1/);
    }
    assert.deepEqual(inputs, ['original', 'original:person-1', 'original', 'original:person-1']);
    await assert.rejects(scene.runMaskedScenePasses('original', passes, async (image, pass, index) => { if (index === 1) throw new Error('pass failed'); return { image: 'partial', prompt: 'first' }; }), /pass failed/);
    await assert.rejects(scene.runMaskedScenePasses('original', [], execute), /Select/);
});
test('masked readiness checks actual sockets and options without changing Global requirements', () => {
    const info = {};
    for (const node of Object.values(flux.buildMaskedFlux2EditWorkflow('source', 'mask', settings).workflow)) {
        info[node.class_type] = { input: { required: Object.fromEntries(Object.keys(node.inputs).map(key => [key, ['ANY']])) } };
    }
    info.UnetLoaderGGUF.input.required.unet_name = [[settings.comfyFlux2EditUnet]];
    info.CLIPLoader.input.required.clip_name = [[settings.comfyFlux2EditClip]];
    info.VAELoader.input.required.vae_name = [[settings.comfyFlux2EditVae]];
    info.KSamplerSelect.input.required.sampler_name = [['euler']];
    info.ImageScale.input.required.upscale_method = ['COMBO', { options: ['nearest-exact', 'bicubic'] }];
    info.ImageScale.input.required.crop = [['disabled']];
    info.ImageToMask.input.required.channel = [['red']];
    info.ImageCompositeMasked.input.optional = { mask: info.ImageCompositeMasked.input.required.mask };
    delete info.ImageCompositeMasked.input.required.mask;
    assert.deepEqual(scene.sceneMaskedReadinessErrors(info, settings), []);
    delete info.ImageCompositeMasked.input.optional.mask;
    assert.ok(scene.sceneMaskedReadinessErrors(info, settings).some(value => value.includes('ImageCompositeMasked.mask')));
    assert.deepEqual(scene.sceneReadinessErrors(info, settings), []);
});

test('analysis validates required fields, IDs, visibility and candidates', () => {
    assert.deepEqual(scene.parseSceneAnalysis(JSON.stringify(fixture())), fixture());
    for (const mutate of [value => delete value.style, value => value.subjects.push(value.subjects[0]),
        value => value.subjects[0].faceVisible = 'true', value => value.cameraChoices[0].intensity = 'wild',
        value => value.anchors = [], value => value.environment = 'mixed']) {
        const value = fixture(); mutate(value);
        assert.throws(() => scene.parseSceneAnalysis(JSON.stringify(value)));
    }
    assert.throws(() => scene.parseSceneAnalysis('not json'));
});
test('all axes start disabled and cannot generate', () => {
    assert.throws(() => scene.buildSceneJobs(fixture(), scene.createSceneControls(fixture()), 'moderate', 4, settings), /Enable/);
});
test('each enabled axis changes only itself and keeps disabled axes explicit', () => {
    for (const axis of scene.SCENE_AXES) {
        const controls = scene.createSceneControls(fixture()); controls[axis].enabled = true;
        const [job] = scene.buildSceneJobs(fixture(), controls, 'moderate', 1, settings, () => 0);
        assert.ok(job.changes.every(change => change.includes(axis)));
        assert.match(job.prompt, axis === 'camera' ? /LOCKED LOCATION: use Picture 1 itself/ : /LOCKED LOCATION: Courtyard/);
        assert.match(job.prompt, axis === 'camera' ? /LOCKED STYLE: use Picture 1 itself/ : /LOCKED STYLE: VHS/);
        assert.equal(job.options.comfyFlux2EditPreserveSourceStyle, true);
        for (const other of scene.SCENE_AXES.filter(value => value !== axis)) assert.ok(job.prompt.includes(`preserve the source ${other}`));
    }
});
test('person controls, no face, no people, indoor and unknown are gated', () => {
    const analysis = fixture(); const controls = scene.createSceneControls(analysis);
    controls.expression.enabled = true;
    assert.equal(scene.buildSceneJobs(analysis, controls, 'strong', 1, settings)[0].changes.length, 1);
    controls['expression:person-1'].enabled = false;
    assert.throws(() => scene.buildSceneJobs(analysis, controls, 'strong', 1, settings), /Enable/);
    analysis.subjects = [];
    assert.throws(() => scene.buildSceneJobs(analysis, controls, 'strong', 1, settings), /Enable/);
    controls.season.enabled = true;
    for (const environment of ['indoor', 'unknown']) {
        analysis.environment = environment;
        assert.throws(() => scene.buildSceneJobs(analysis, controls, 'strong', 1, settings), /Enable/);
    }
});
test('pose and camera targets override source actions without locking background projection', () => {
    const analysis = fixture();
    analysis.subjects[0].description = 'Left person in red, holding a toy with raised arms';
    analysis.subjects[0].poses[1].instruction = 'Lower both forearms and point the held toy toward the floor.';
    analysis.cameraChoices[1].instruction = 'View from a lower camera position looking upward.';
    const controls = scene.createSceneControls(analysis);
    controls.pose.enabled = true; controls.camera.enabled = true;
    controls['pose:person-1'].value = analysis.subjects[0].poses[1].instruction;
    controls['pose:person-2'].enabled = false;
    controls.camera.value = analysis.cameraChoices[1].instruction;
    const [job] = scene.buildSceneJobs(analysis, controls, 'moderate', 1, settings);
    assert.match(job.prompt, /TARGET person-1 pose: Lower both forearms/);
    assert.match(job.prompt, /change the camera angle: View from a lower camera position/);
    assert.ok(job.prompt.indexOf('TARGET person-1 pose:') < job.prompt.indexOf('SOURCE SUBJECT LOOKUP ONLY:'));
    assert.doesNotMatch(job.prompt, /Keep person-1:|UNCHANGED person-1 \(/);
    assert.match(job.prompt, /visibly different limb positions and held-object directions within the output framing/);
    assert.match(job.prompt, /^Take the people from the input image/);
    assert.match(job.prompt, /but change the camera angle: View from a lower camera position looking upward/);
    assert.match(job.prompt, /not a fixed output composition/);
    assert.match(job.prompt, /UNCHANGED person-2 pose: preserve the source pose/);
    assert.match(job.prompt, /Keep person-2's face hidden or covered/);
    assert.match(job.prompt, /Apply this camera view and all TARGET edits together/);
});
test('camera prompt excludes unreliable scene inventory and reaches CLIP without changing model settings', () => {
    const analysis = fixture();
    analysis.subjects = [analysis.subjects[1]];
    analysis.location = 'Room with two light-colored gloves hanging from doorframe.';
    analysis.anchors = ['two light-colored gloves hanging from doorframe'];
    analysis.style = 'Inventoried sharp mid-ground and even lighting';
    const instruction = 'Lower the camera to knee height, looking sharply upwards at the subject.';
    analysis.cameraChoices[1].instruction = instruction;
    const controls = scene.createSceneControls(analysis); controls.camera.enabled = true;
    const [job] = scene.buildSceneJobs(analysis, controls, 'moderate', 1, { ...settings, comfySeed: 6779937593374 });
    const { workflow } = flux.buildFlux2EditWorkflow('source.png', [], job.options);
    const encoded = workflow.prompt.inputs.text;
    assert.doesNotMatch(encoded, /light-colored gloves|hanging from doorframe|Inventoried sharp/);
    assert.equal(encoded.split(instruction).length - 1, 1);
    assert.ok(encoded.split(/\s+/).length < 600);
    assert.equal(workflow.noise.inputs.noise_seed, 6779937593374);
    assert.equal(workflow.scheduler.inputs.steps, settings.comfyFlux2EditSteps);
    assert.equal(workflow.guider.inputs.cfg, settings.comfyFlux2EditCfg);
    assert.deepEqual(workflow.positive_reference_1.inputs.latent, ['source_latent', 0]);
    assert.equal(workflow.positive_reference_2, undefined);
});
test('direct camera wording respects lighting switches, source subjects and no-added-object constraints', () => {
    const analysis = fixture();
    analysis.subjects = [analysis.subjects[1]];
    analysis.cameraChoices[1].instruction = 'Use a low-angle shot looking up at the person.';
    const controls = scene.createSceneControls(analysis); controls.camera.enabled = true;
    const promptFor = () => scene.buildSceneJobs(analysis, controls, 'moderate', 1, settings)[0].prompt;
    const cameraOnly = promptFor();
    assert.match(cameraOnly, /^Take the person from the input image/);
    assert.match(cameraOnly, /but change the camera angle: Use a low-angle shot looking up at the person/);
    assert.match(cameraOnly, /Same lighting and color grading as the original/);
    assert.match(cameraOnly, /UNCHANGED person-2 pose: preserve the source pose/);
    assert.match(cameraOnly, /Keep person-2's face hidden or covered/);
    assert.match(cameraOnly, /NO ADDED OBJECTS: Picture 1 is the authority/);
    assert.match(cameraOnly, /Do not duplicate accessories or transfer them onto doors, walls or furniture/);
    assert.match(cameraOnly, /Bare surfaces stay bare/);
    assert.doesNotMatch(cameraOnly, /sky|building tops|woman|imposing/);
    controls.lighting.enabled = true;
    assert.doesNotMatch(promptFor(), /Same lighting and color grading as the original/);
    assert.match(promptFor(), /Apply the separately requested lighting change/);
    controls.camera.enabled = false;
    assert.doesNotMatch(promptFor(), /Take the person from the input image|but change the camera angle/);
    assert.match(promptFor(), /NO ADDED OBJECTS/);
    controls.camera.enabled = true;
    analysis.subjects = [];
    analysis.cameraChoices[1].instruction = 'Use a lower view of the courtyard.';
    assert.match(promptFor(), /^Take the scene from the input image/);
});
test('wardrobe and exact population are locked in encoded camera and non-camera workflows', () => {
    for (const camera of [false, true]) {
        for (const count of [0, 1, 4]) {
            const analysis = fixture();
            analysis.subjects = Array.from({ length: count }, (_, index) => ({ ...fixture().subjects[0], id: `person-${index + 1}`, description: `Source position ${index + 1}`, faceVisible: index !== 0 }));
            if (count === 1) analysis.subjects[0].description = 'Unreliable elaborate garment pattern description';
            const controls = scene.createSceneControls(analysis);
            controls[camera ? 'camera' : 'lighting'].enabled = true;
            if (count) controls.pose.enabled = true;
            const [job] = scene.buildSceneJobs(analysis, controls, 'moderate', 1, settings);
            const encoded = flux.buildFlux2EditWorkflow('original.png', [], job.options).workflow.prompt.inputs.text;
            assert.match(encoded, /Keep the original clothing unchanged/);
            assert.match(encoded, /Picture 1 is the sole wardrobe reference for each person/);
            assert.match(encoded, /prints and pattern layout, colors, cut, fabric, footwear and accessories on their original wearer/);
            assert.match(encoded, /never redesign, substitute or swap outfits between people/);
            if (count) {
                assert.ok(encoded.includes(`PEOPLE COUNT: exactly ${count} distinct people`));
                assert.match(encoded, /Each ID is one existing person to edit in place, never a new person to add/);
                assert.match(encoded, /do not leave an old copy behind/);
                assert.match(encoded, /Keep person-1's face hidden or covered/);
                assert.match(encoded, /TARGET person-1 pose:/);
            } else {
                assert.match(encoded, /PEOPLE COUNT: zero people/);
                assert.doesNotMatch(encoded, /TARGET person-\d/);
            }
            if (count === 1) assert.doesNotMatch(encoded, /Unreliable elaborate garment pattern description/);
            if (count === 4) {
                assert.match(encoded, /person-1, person-2, person-3, person-4/);
                assert.match(encoded, /not target outfits or poses/);
                assert.match(encoded, /person-4: Source position 4/);
            }
            assert.equal(job.options.comfyFlux2EditReinforceSourceIdentity, false);
        }
    }
});
test('intensity, fixed choices, Auto variation and immutable snapshots', () => {
    const analysis = fixture(); const controls = scene.createSceneControls(analysis); controls.camera.enabled = true;
    analysis.cameraChoices.push({ label: 'Other moderate camera', instruction: 'camera moderate alternative', intensity: 'moderate' });
    for (const intensity of scene.SCENE_INTENSITIES) assert.ok(scene.sceneChoices(analysis, 'camera', intensity).every(choice => choice.intensity === intensity));
    controls.camera.value = 'camera strong';
    assert.throws(() => scene.buildSceneJobs(analysis, controls, 'subtle', 1, settings), /valid/);
    controls.camera.value = 'auto';
    const jobs = scene.buildSceneJobs(analysis, controls, 'moderate', 4, { ...settings, comfySeed: 42 }, () => 0);
    assert.notDeepEqual(jobs[0].changes, jobs[1].changes);
    assert.ok(jobs.every(job => job.seed === 42 && job.options.numImages === 1));
    const prompt = jobs[0].prompt; analysis.location = 'Changed'; controls.camera.enabled = false;
    assert.equal(jobs[0].prompt, prompt);
    assert.match(prompt, /UNCHANGED season: preserve the source season/);
    assert.equal(scene.randomSceneChoice(choices('camera'), 'camera subtle', () => 0), 'camera moderate');
});
test('Auto exhausts distinct combinations before repeating and never changes manual choices', () => {
    const analysis = fixture();
    analysis.subjects[0].poses.push({ label: 'Other pose', instruction: 'pose moderate alternative', intensity: 'moderate' });
    analysis.cameraChoices.push({ label: 'Other camera', instruction: 'camera moderate alternative', intensity: 'moderate' });
    const controls = scene.createSceneControls(analysis);
    controls.pose.enabled = true; controls.camera.enabled = true;
    controls['pose:person-2'].enabled = false;
    const jobs = scene.buildSceneJobs(analysis, controls, 'moderate', 8, settings, () => 0);
    assert.equal(new Set(jobs.slice(0, 4).map(job => JSON.stringify(job.changes))).size, 4);
    assert.ok(jobs.every(job => job.changes.every(change => !change.includes('subtle') && !change.includes('strong'))));
    let draw = 0;
    const varying = scene.buildSceneJobs(analysis, controls, 'moderate', 4, settings, () => ++draw % 2 ? 0.9 : 0.1);
    assert.equal(new Set(varying.map(job => JSON.stringify(job.changes))).size, 4);
    controls['pose:person-1'].value = 'pose moderate';
    controls.camera.value = 'camera moderate';
    const fixed = scene.buildSceneJobs(analysis, controls, 'moderate', 4, settings, () => 0);
    assert.equal(new Set(fixed.map(job => JSON.stringify(job.changes))).size, 1);
    assert.equal(fixed[0].changes.length, 2);
});
test('workflow preserves style and legacy behavior, chains LoRAs before CacheDiT', () => {
    assert.match(flux.buildFlux2EditPrompt('', []), /photorealistic/);
    assert.match(flux.buildFlux2EditPrompt('', [], false), /polished/);
    for (const model of ['flux2.gguf', 'flux2.safetensors']) {
        const { workflow, prompt } = flux.buildFlux2EditWorkflow('original.png', [], { ...settings,
            comfyFlux2EditUnet: model, comfyFlux2EditPreserveSourceStyle: true,
            comfyFlux2EditLora1Name: 'first', comfyFlux2EditLora2Name: 'second', comfyFlux2EditUseCacheDit: true });
        assert.doesNotMatch(prompt, /photorealistic|polished/);
        assert.match(prompt, /VHS stays VHS/);
        assert.equal(workflow.model.class_type, model.endsWith('.gguf') ? 'UnetLoaderGGUF' : 'UNETLoader');
        assert.deepEqual(workflow.lora_1.inputs.model, ['model', 0]);
        assert.deepEqual(workflow.lora_2.inputs.model, ['lora_1', 0]);
        assert.deepEqual(workflow.cache_dit.inputs.model, ['lora_2', 0]);
        assert.equal(workflow.source.inputs.image, 'original.png');
    }
    const { workflow } = flux.buildFlux2EditWorkflow('original.png', [], { ...settings, comfyFlux2EditLora1Name: 'None' });
    assert.equal(workflow.lora_1, undefined);
});
test('readiness checks loader inventory and every generated node', () => {
    const { workflow } = flux.buildFlux2EditWorkflow('original.png', [], settings);
    const info = Object.fromEntries(Object.values(workflow).map(node => [node.class_type, { input: { required: {} } }]));
    for (const [node, field, value] of [['UnetLoaderGGUF', 'unet_name', settings.comfyFlux2EditUnet], ['CLIPLoader', 'clip_name', settings.comfyFlux2EditClip],
        ['VAELoader', 'vae_name', settings.comfyFlux2EditVae], ['KSamplerSelect', 'sampler_name', settings.comfyFlux2EditSampler]]) info[node].input.required[field] = [[value]];
    assert.deepEqual(scene.sceneReadinessErrors(info, settings), []);
    assert.deepEqual(scene.sceneReadinessErrors(info, { ...settings, comfyFlux2EditLora1Name: 'None' }), []);
    info.KSamplerSelect.input.required.sampler_name = ['COMBO', { options: ['euler', 'heun'] }];
    assert.deepEqual(scene.sceneModelOptions(info, 'KSamplerSelect', 'sampler_name'), ['euler', 'heun']);
    assert.deepEqual(scene.sceneReadinessErrors(info, settings), []);
    assert.ok(scene.sceneReadinessErrors(info, { ...settings, comfyFlux2EditSampler: 'not-installed' }).includes('Unavailable sampler_name: not-installed'));
    info.KSamplerSelect.input.required.sampler_name = ['COMBO', {}];
    assert.deepEqual(scene.sceneModelOptions(info, 'KSamplerSelect', 'sampler_name'), []);
    assert.ok(scene.sceneReadinessErrors(info, settings).includes('Unavailable sampler_name: euler'));
    delete info.GetImageSize;
    assert.ok(scene.sceneReadinessErrors(info, settings).some(error => error.includes('GetImageSize')));
    assert.ok(scene.sceneReadinessErrors(info, { ...settings, comfyFlux2EditLora1Name: 'missing' }).some(error => error.includes('LoraLoaderModelOnly')));
});
test('batch uses original source sequentially and safe stop retains completed result', async () => {
    const source = { name: 'original.png' }; let stop = false; const completed = []; let calls = 0;
    const controls = scene.createSceneControls(fixture()); controls.pose.enabled = true;
    const jobs = scene.buildSceneJobs(fixture(), controls, 'moderate', 4, settings);
    await scene.runSceneBatch(source, jobs, () => stop, async (image) => { assert.equal(image, source); calls++; stop = true; return 'image'; }, (job, result) => completed.push(result));
    assert.equal(calls, 1); assert.equal(completed.length, 1);
    calls = 0; completed.length = 0;
    await assert.rejects(scene.runSceneBatch(source, jobs, () => false, async (image) => {
        assert.equal(image, source); calls++; if (calls === 2) throw new Error('failed'); return 'image';
    }, (job, result) => completed.push(result)), /failed/);
    assert.equal(calls, 2); assert.equal(completed.length, 1);
});
test('pose analysis accepts a larger typed posture bank without expanding other axes', () => {
    const analysis = fixture();
    analysis.subjects[0].poses = Array.from({ length: 24 }, (_, index) => ({ label: `Pose ${index}`, instruction: `Distinct pose ${index}`, intensity: 'moderate', posture: 'standing' }));
    assert.equal(scene.parseSceneAnalysis(JSON.stringify(analysis)).subjects[0].poses.length, 24);
    assert.equal(scene.parseSceneAnalysis(JSON.stringify(analysis)).subjects[0].poses[0].posture, 'standing');
    analysis.subjects[0].poses[0].posture = 'invented';
    assert.throws(() => scene.parseSceneAnalysis(JSON.stringify(analysis)), /posture/);
    delete analysis.subjects[0].poses[0].posture;
    assert.equal(scene.parseSceneAnalysis(JSON.stringify(analysis)).subjects[0].poses[0].posture, undefined);
    analysis.cameraChoices = analysis.subjects[0].poses.slice(0, 13);
    assert.throws(() => scene.parseSceneAnalysis(JSON.stringify(analysis)), /list/);
    analysis.cameraChoices = choices('camera');
    analysis.subjects[0].poses.push({ label: 'Excess', instruction: 'Excess pose', intensity: 'moderate' });
    assert.throws(() => scene.parseSceneAnalysis(JSON.stringify(analysis)), /list/);
});
test('Auto poses exhaust the pose bank and prefer different postures independently of other axes', () => {
    const analysis = fixture();
    const postures = ['kneeling', 'kneeling', 'kneeling', 'kneeling', 'kneeling', 'kneeling', 'standing', 'seated'];
    analysis.subjects[0].poses = postures.map((posture, index) => ({ label: `Pose ${index}`, instruction: `${posture} pose ${index}`, intensity: 'moderate', posture }));
    const controls = scene.createSceneControls(analysis);
    controls.pose.enabled = true; controls.camera.enabled = true; controls.expression.enabled = true;
    controls['pose:person-2'].enabled = false;
    const jobs = scene.buildSceneJobs(analysis, controls, 'moderate', 8, settings, () => 0);
    const poses = jobs.map(job => job.changes.find(change => change.startsWith('person-1') && change.includes(') pose:')));
    assert.equal(new Set(poses).size, 8);
    assert.match(poses[0], /kneeling pose/);
    assert.match(poses[1], /standing pose/);
    assert.match(poses[2], /seated pose/);
    const legacy = structuredClone(analysis);
    legacy.subjects[0].poses.forEach(choice => delete choice.posture);
    const legacyJobs = scene.buildSceneJobs(legacy, controls, 'moderate', 8, settings, () => 0);
    assert.equal(new Set(legacyJobs.map(job => job.changes.find(change => change.includes(') pose:')))).size, 8);
    controls['pose:person-1'].value = 'kneeling pose 0';
    const fixed = scene.buildSceneJobs(analysis, controls, 'moderate', 4, settings, () => 0);
    assert.ok(fixed.every(job => job.changes.find(change => change.includes(') pose:')).endsWith('kneeling pose 0')));
});
test('Auto pose use is per person and repeats only after exhausting a small bank', () => {
    const analysis = fixture();
    analysis.subjects.forEach(subject => { subject.poses = ['standing', 'seated', 'kneeling'].map(posture => ({ label: posture, instruction: `${subject.id} ${posture}`, intensity: 'moderate', posture })); });
    const controls = scene.createSceneControls(analysis); controls.pose.enabled = true;
    const jobs = scene.buildSceneJobs(analysis, controls, 'moderate', 8, settings, () => 0);
    for (const subject of analysis.subjects) {
        const poses = jobs.map(job => job.changes.find(change => change.startsWith(subject.id)));
        assert.equal(new Set(poses.slice(0, 3)).size, 3);
        assert.equal(new Set(poses.slice(3, 6)).size, 3);
    }
    controls['pose:person-2'].enabled = false;
    const disabled = scene.buildSceneJobs(analysis, controls, 'moderate', 4, settings, () => 0);
    assert.ok(disabled.every(job => job.changes.length === 1 && job.prompt.includes('UNCHANGED person-2 pose')));
});
test('automatic masks protect unselected bodies and remove shared expansion without losing target bodies', () => {
    const bodies = { 'person-1': maskFixture([255, 0, 0, 0, 0]), 'person-2': maskFixture([0, 0, 0, 255, 0]) };
    const candidates = { 'person-1': maskFixture([255, 255, 255, 255, 0]), 'person-2': maskFixture([0, 0, 255, 255, 255]) };
    const isolated = scene.isolateAutomaticSceneMasks(bodies, candidates, []);
    assert.deepEqual([...isolated['person-1']], [255, 255, 0, 0, 0]);
    assert.deepEqual([...isolated['person-2']], [0, 0, 0, 255, 255]);
    const single = scene.isolateAutomaticSceneMasks(bodies, { 'person-1': candidates['person-1'] }, []);
    assert.equal(single['person-1'][3], 0);
    const face = scene.isolateAutomaticSceneMasks(bodies, { 'person-1': candidates['person-1'] }, ['person-1']);
    assert.deepEqual([...face['person-1']], [255, 0, 0, 0, 0]);
    assert.throws(() => scene.isolateAutomaticSceneMasks(bodies, { 'person-1': maskFixture([0, 0, 0, 255, 0]) }, ['person-1']), /no isolated/);
    assert.equal(candidates['person-1'].pixels[3], 255);
});
test('movement areas open space for poses, scale with amplitude and preserve mask protections', () => {
    const width = 40, height = 30;
    const rectangle = (left, top, right, bottom) => {
        const pixels = new Uint8Array(width * height);
        for (let row = top; row <= bottom; row++) pixels.fill(255, row * width + left, row * width + right + 1);
        return { ...maskFixture([...pixels]), width, height };
    };
    const body = rectangle(10, 5, 19, 24);
    body.pixels[12 * width + 15] = 0;
    const other = rectangle(22, 10, 27, 24);
    const bodies = { target: body, other };
    const candidates = { target: body };
    const result = intensity => scene.isolateAutomaticSceneMasks(bodies, candidates, [], 'movement', intensity).target;
    const subtle = result('subtle'), moderate = result('moderate'), strong = result('strong');
    assert.equal(moderate[12 * width + 15], 255);
    assert.equal(moderate[15 * width + 8], 255);
    assert.equal(subtle[15 * width + 8], 0);
    assert.equal(strong[15 * width + 6], 255);
    assert.equal(strong[15 * width + 22], 0);
    assert.equal(moderate[0], 0);
    assert.deepEqual(scene.isolateAutomaticSceneMasks(bodies, candidates, [], 'silhouette').target, body.pixels);
    assert.deepEqual(scene.isolateAutomaticSceneMasks(bodies, candidates, ['target'], 'movement', 'strong').target, body.pixels);
    const expanded = rectangle(5, 4, 19, 25);
    assert.equal(scene.isolateAutomaticSceneMasks(bodies, { target: expanded }, [], 'movement').target[15 * width + 5], 255);
    const both = scene.isolateAutomaticSceneMasks(bodies, { target: body, other }, [], 'movement', 'strong');
    assert.equal(both.target[15 * width + 20], 0);
    assert.equal(both.other[15 * width + 20], 0);
    assert.equal(both.target[15 * width + 19], 255);
    assert.equal(both.other[15 * width + 22], 255);
    assert.equal(body.pixels[12 * width + 15], 0);
    const edge = rectangle(0, 0, 3, 4);
    const clipped = scene.isolateAutomaticSceneMasks({ edge }, { edge }, [], 'movement', 'strong').edge;
    assert.equal(clipped.length, width * height);
    assert.equal(clipped[0], 255);
    assert.equal(clipped[width - 1], 0);
});

test('automatic segmentation plans protect every body and use faces only for expression-only targets', () => {
    const analysis = fixture(); const controls = scene.createSceneControls(analysis);
    controls.expression.enabled = true;
    const plan = scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32);
    assert.deepEqual(plan.selected.map(item => item.id), ['person-1']);
    assert.deepEqual(plan.targets.map(item => item.id), ['body:person-1', 'body:person-2', 'face:person-1']);
    assert.ok(plan.targets.every(item => item.padding === 0));
    controls.pose.enabled = true;
    const poses = scene.sceneAutomaticMaskTargets(analysis, controls, 'moderate', 32);
    assert.equal(poses.targets.length, 2);
    assert.ok(poses.targets.every(item => item.padding === 32));
});