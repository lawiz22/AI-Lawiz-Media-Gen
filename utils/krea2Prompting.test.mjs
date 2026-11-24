import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./krea2Prompting.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const krea = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const draft = (change = {}) => ({ ...krea.defaultKrea2PromptDraft(), ...change });

test('the sentence frame keeps the guide order and skips empty fields', () => {
    const prompt = krea.buildKrea2Prompt(draft({
        medium: 'editorial fashion photograph', subject: 'a woman with short copper hair', action: 'glancing over her shoulder',
        composition: 'a three-quarter shot at eye level, 85mm portrait', environment: 'a rainy street at dusk',
        lighting: 'a warm shop window on the left.', materials: 'wet cobblestones and wool fibres', mood: 'quiet', text: 'CAFÉ',
    }));
    assert.equal(prompt, 'An editorial fashion photograph of a woman with short copper hair, glancing over her shoulder, set in a rainy street at dusk. '
        + 'The composition uses a three-quarter shot at eye level, 85mm portrait. Lit by a warm shop window on the left. '
        + 'Wet cobblestones and wool fibres stay visible, creating a quiet atmosphere. The only readable text in the image is "CAFÉ", appearing exactly once.');
    assert.equal(krea.buildKrea2Prompt(draft({ subject: 'a lighthouse' })), 'A lighthouse.');
    assert.equal(krea.buildKrea2Prompt(draft()), '');
});

test('pose and style blocks follow the prose, with the held object renamed', () => {
    const prompt = krea.buildKrea2Prompt(draft({ subject: 'a farmer', pose: 'Carrying Over Shoulder', poseObject: 'goat', style: 'Golden Hour Photography' }));
    const [prose, pose, style] = prompt.split('\n\n');
    assert.equal(prose, 'A farmer.');
    assert.match(pose, /^Pose: Carrying Over Shoulder\nleg_position: /);
    assert.match(pose, /arm_position: One arm supports the goat over the shoulder/);
    assert.match(pose, /silhouette: Asymmetrical silhouette emphasizing the elevated goat\./);
    assert.equal(pose.split('\n').length, 12);
    assert.match(style, /^Style: A softly directional photographic style/);
    const short = krea.formatKrea2Pose(krea.findKrea2Pose('Contrapposto'), '', true).split('\n');
    assert.deepEqual(short.map(line => line.split(':')[0]), ['Pose', 'torso_orientation', 'weight_distribution', 'movement_quality', 'silhouette']);
    assert.equal(krea.krea2StyleBlock('Bauhaus'), 'Style: Bauhaus.');
});

test('the references ship complete and without the adult material', () => {
    assert.equal(krea.KREA2_POSES.length, 30);
    assert.ok(krea.KREA2_POSES.every(pose => pose.fields.length === krea.KREA2_POSE_FIELDS.length && pose.fields.every(field => /\.$/.test(field))));
    const names = krea.KREA2_STYLE_FAMILIES.flatMap(family => family.names);
    assert.equal(new Set(names).size, names.length, 'no duplicate style names');
    assert.equal(names.length, 283);
    assert.ok(!names.some(name => /shindol|playboy|maxim/i.test(name)));
    assert.ok(Object.keys(krea.KREA2_STYLE_PARAGRAPHS).every(name => names.includes(name)));
    assert.deepEqual(krea.KREA2_ASPECTS.map(aspect => aspect.id), ['1:1', '16:9', '21:9', '4:3', '2:3', '9:16']);
});

test('checks flag the guide rules and stay quiet on clean prose', () => {
    const ids = (text, settings) => krea.checkKrea2Prompt(text, settings).map(check => check.id);
    assert.deepEqual(ids(''), []);
    const clean = 'A candid street photograph of a courier walking through a rain-slicked city on an overcast day. The composition uses a 35mm lens at eye level with the courier on the left third. Soft diffused light reflects on wet pavement, and film grain gives the frame a documentary feel.';
    assert.deepEqual(ids(clean, { cfg: 1 }), []);
    assert.ok(ids('masterpiece, best quality, 8k portrait of a woman').includes('quality-stack'));
    assert.ok(ids(`${clean} There is no fog.`).includes('negation'));
    assert.ok(ids(`${clean} (fog:4)`).includes('weight-range'));
    assert.ok(ids(`${clean} ((fog:1.2))`).includes('weight-nested'));
    assert.ok(ids(`${clean} A sign reads "WELCOME TO THE BEST CAFE IN TOWN".`).includes('long-text'));
    assert.ok(ids(`${clean} A sign reads "OPEN".`).includes('text-count'));
    assert.ok(!ids(`${clean} Exactly one sign reads "OPEN".`).includes('text-count'));
    assert.ok(ids(`${clean} A baker stands behind the wooden counter.`).includes('furniture'));
    assert.ok(ids('girl, red hair, smile, park, sunny, trees, bench, dress, shoes, bag, birds, clouds').includes('tag-list'));
    assert.ok(ids(clean, { cfg: 0 }).includes('cfg-zero'));
    assert.ok(ids(clean, { cfg: 2 }).includes('cfg-high'));
    assert.ok(ids(clean, { cfg: 1, negativePrompt: 'blurry' }).includes('negative-dead'));
    assert.ok(ids('A cat.').includes('short'));
});

test('guide settings pick the closest resolution and leave RAW sampling alone', () => {
    const list = [{ value: '832x1216', width: 832, height: 1216 }, { value: '1024x1024', width: 1024, height: 1024 }, { value: '1216x832', width: 1216, height: 832 }, { value: '1280x1280', width: 1280, height: 1280 }];
    assert.equal(krea.closestKrea2Resolution('1:1', list), '1024x1024');
    assert.equal(krea.closestKrea2Resolution('16:9', list), '1216x832');
    assert.equal(krea.closestKrea2Resolution('9:16', list), '832x1216');
    assert.deepEqual(krea.krea2SkillSettings('krea2-simple', '2:3', list), { comfySteps: 8, comfyCfg: 1, comfySampler: 'euler', comfyScheduler: 'beta', comfyKreaResolution: '832x1216' });
    assert.deepEqual(krea.krea2SkillSettings('krea2-raw', '1:1', list), { comfyKreaResolution: '1024x1024' });
    assert.deepEqual(krea.krea2SkillSettings('krea2-edit', '21:9', list), { edit: { steps: 8, cfg: 1, sampler: 'euler', scheduler: 'beta', aspect: '21:9' } });
});

test('the writer instruction carries the brief and choices, and its output is cleaned', () => {
    const instruction = krea.krea2WriterInstruction(draft({ idea: 'a fox in snow', lighting: 'blue hour', style: 'Ghibli Style', aspect: '16:9' }), 'krea2-edit', true);
    assert.match(instruction, /^You write prompts for Krea 2/);
    assert.match(instruction, /Brief: a fox in snow/);
    assert.match(instruction, /Light and colour: blue hour/);
    assert.match(instruction, /"Ghibli Style" is appended/);
    assert.match(instruction, /image 1/);
    assert.match(instruction, /attached reference image/);
    assert.match(instruction, /Frame for 16:9/);
    assert.doesNotMatch(krea.krea2WriterInstruction(draft({ idea: 'x' }), 'krea2-simple', false), /image 1|attached reference/);
    assert.equal(krea.cleanKrea2WriterOutput('```\n**Positive Prompt:** "A fox in snow."\n```'), 'A fox in snow.');
});
