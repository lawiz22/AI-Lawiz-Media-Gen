import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const withoutImports = source => source.replace(/^import [\s\S]*?;\r?$/gm, '');

const scenes = await import(compile(read('../photoFusion/scenes.ts')));
const calls = [];
globalThis.__fusionCalls = calls;
const service = await import(compile(`
    const calls = globalThis.__fusionCalls;
    const limitImageFilesTotalSize = async files => files;
    const generatePortraits = async (first, options, progress, a, b, c, d, e, references) => {
        calls.push({ via: 'gemini', first, options, references });
        if (options.geminiComposePrompt.includes('BLOCK')) throw new Error('Response blocked: SAFETY');
        return { images: [{ src: 'data:image/png;base64,R0VN', usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 } }] };
    };
    const generateMammouthImage = async (prompt, files, ratio, model) => { calls.push({ via: 'mammouth', prompt, files, ratio, model }); return { images: ['data:image/jpeg;base64,TUFN'] }; };
    const generateComfyUIPortraits = async (first, options, progress, references) => { calls.push({ via: 'comfy', first, options, references }); return { images: [{ src: 'data:image/png;base64,Q09NRlk=', seed: 7 }] }; };
    ${withoutImports(read('./photoFusionService.ts'))}
`));

const people = (...expressions) => expressions.map(expression => ({ expression }));
const file = name => ({ name, type: 'image/png' });
const request = patch => ({ engine: 'comfyui', subjects: [file('a'), file('b')], backdrop: null, prompt: 'PROMPT', scene: 'SCENE', notes: ['', ''], options: {}, ...patch });

test('the prompt names the exact head count and keeps people as photographed unless asked', () => {
    const scene = scenes.findScene('line-up');
    const plain = scenes.buildFusionPrompt(scene, people('as-is', 'as-is', 'as-is'), 'high', false);
    assert.match(plain, /exactly 3 people/);
    assert.match(plain, /Keep every person as they look in their photo/);
    assert.match(plain, /Setting: a neutral seamless backdrop\./);
    const asked = scenes.buildFusionPrompt(scene, [{ expression: 'laughing' }, { expression: 'as-is', knownAs: ' Ada Lovelace ' }], 'max', false);
    assert.match(asked, /Person 1 shows laughing freely\./);
    assert.match(asked, /Person 2 is Ada Lovelace, and that well-known face must stay recognisable\./);
    assert.match(asked, /override any mood/);
    assert.match(asked, /photorealistic, tack-sharp/);
});

test('a background replaces the setting, except in scenes that keep their own', () => {
    const overhead = scenes.describeScene(scenes.findScene('picnic-overhead'), 'standard', true);
    assert.match(overhead, /Use the supplied background image as the setting\. Re-project/);
    assert.doesNotMatch(overhead, /short summer grass/);
    const poster = scenes.describeScene(scenes.findScene('film-poster'), 'standard', true);
    assert.match(poster, /Setting: a dark, textured void/);
    assert.equal(scenes.usesBackdrop(scenes.findScene('film-poster'), true), false);
});

test('scene and engine limits', () => {
    assert.equal(scenes.sceneFits(scenes.findScene('cheek-kiss'), 2), true);
    assert.equal(scenes.sceneFits(scenes.findScene('cheek-kiss'), 3), false);
    assert.equal(scenes.findScene('unknown').id, scenes.FUSION_SCENES[0].id);
    assert.equal(new Set(scenes.FUSION_SCENES.map(scene => scene.id)).size, scenes.FUSION_SCENES.length);
    assert.match(service.fusionInputProblem('comfyui', 1, false), /at least two/);
    assert.match(service.fusionInputProblem('gemini', 5, false), /at most 4/);
    assert.equal(service.fusionInputProblem('comfyui', 4, true), '');
    assert.equal(service.fusionInputProblem('qwen', 3, false), '');
    assert.match(service.fusionInputProblem('qwen', 3, true), /at most 3 images/);
});

test('FLUX2 sends Picture 1 as the source and every other person, then the background, as references', async () => {
    calls.length = 0;
    const backdrop = file('bg');
    const output = await service.runPhotoFusion(request({ subjects: [file('a'), file('b'), file('c')], backdrop, notes: ['', 'shows a soft smile', ''] }), () => {});
    const [call] = calls;
    assert.equal(call.first.name, 'a');
    assert.deepEqual(call.references.map(item => item.name), ['b', 'c', 'bg']);
    assert.equal(call.options.comfyModelType, 'flux2-edit');
    assert.deepEqual(call.options.comfyFlux2EditReferenceRoles, ['identity', 'identity', 'background']);
    assert.match(call.options.comfyFlux2EditReferenceDescriptions[0], /Person 2.*this person shows a soft smile/);
    assert.match(call.options.comfyFlux2EditPrompt, /Exactly 3 people.*Scene: PROMPT/s);
    assert.deepEqual(output, { dataUrl: 'data:image/png;base64,Q09NRlk=', seed: 7 });
});

test('Qwen gets a short prompt with one line per picture and its own sampler defaults', async () => {
    calls.length = 0;
    await service.runPhotoFusion(request({ engine: 'qwen', backdrop: file('bg'), notes: ['is Ada', ''] }), () => {});
    const { options } = calls[0];
    assert.equal(options.comfyModelType, 'qwen-edit');
    assert.match(options.comfyPrompt, /Person 1 is the person in Picture 1 and is Ada\. Person 2 is the person in Picture 2\. Picture 3 is only the background/);
    assert.match(options.comfyPrompt, /SCENE$/);
    assert.deepEqual([options.comfySteps, options.comfyCfg, options.comfySampler, options.comfyScheduler], [8, 1, 'euler_ancestral', 'beta57']);
});

test('cloud engines compose all pictures; a refused request gets a readable message; bad input never reaches an engine', async () => {
    calls.length = 0;
    const gemini = await service.runPhotoFusion(request({ engine: 'gemini', backdrop: file('bg') }), () => {});
    assert.equal(calls[0].options.geminiI2iMode, 'compose');
    assert.deepEqual(calls[0].references.map(item => item.name), ['b', 'bg']);
    assert.equal(gemini.usage.totalTokenCount, 3);
    const mammouth = await service.runPhotoFusion(request({ engine: 'mammouth', options: { mammouthImageModel: 'model-x' } }), () => {});
    assert.deepEqual([calls[1].files.length, calls[1].model, mammouth.dataUrl], [2, 'model-x', 'data:image/jpeg;base64,TUFN']);
    await assert.rejects(service.runPhotoFusion(request({ engine: 'gemini', prompt: 'BLOCK' }), () => {}), /safety filter/);
    calls.length = 0;
    await assert.rejects(service.runPhotoFusion(request({ subjects: [file('a')] }), () => {}), /at least two/);
    assert.equal(calls.length, 0);
});
