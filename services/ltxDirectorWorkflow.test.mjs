import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const transpile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = readFileSync(new URL('./ltxDirectorWorkflow.ts', import.meta.url), 'utf8');
const { getLtxDirectorModelLists, buildLtxDirectorModelNodes, splitLtxTextEncoders, LTX_DIRECTOR_WORKFLOW_TEMPLATE } =
    await import(`data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}`);

const node = (input, models) => ({ input: { required: { [input]: [models] } } });
const info = {
    CheckpointLoaderSimple: node('ckpt_name', ['custom\\checkpoint.safetensors']),
    UNETLoader: node('unet_name', ['custom\\diffusion.safetensors']),
    UnetLoaderGGUF: node('unet_name', ['custom\\model.GGUF', 'custom\\diffusion.safetensors']),
    CLIPLoader: node('clip_name', ['custom\\single.safetensors']),
    DualCLIPLoader: { input: { required: {
        clip_name1: [['custom\\encoder.safetensors']],
        clip_name2: [['custom\\projection.safetensors']],
    } } },
    CLIPLoaderGGUF: node('clip_name', ['custom\\encoder.gguf']),
    DualCLIPLoaderGGUF: node('clip_name1', ['custom\\encoder.gguf']),
};
const dualEncoder = 'custom\\encoder.safetensors + custom\\projection.safetensors';
const optionsFor = (modelVersion, checkpoint) => ({
    modelVersion, checkpoint,
    textEncoder: modelVersion === '2.3' ? dualEncoder : 'custom\\single.safetensors',
});

test('model lists merge all loaders without filtering filenames, folders or extensions', () => {
    const lists = getLtxDirectorModelLists(info);
    assert.deepEqual(lists.checkpoints, [
        'custom\\checkpoint.safetensors', 'custom\\diffusion.safetensors', 'custom\\model.GGUF',
    ]);
    assert.deepEqual(lists.textEncoders, [
        'custom\\single.safetensors', 'custom\\encoder.safetensors',
        'custom\\projection.safetensors', 'custom\\encoder.gguf',
    ]);
    assert.deepEqual(getLtxDirectorModelLists(null), { checkpoints: [], textEncoders: [] });
});

for (const version of ['2.3', '2.5']) {
    for (const [filename, loader, inputs] of [
        ['custom\\checkpoint.safetensors', 'CheckpointLoaderSimple', { ckpt_name: 'custom\\checkpoint.safetensors' }],
        ['custom\\diffusion.safetensors', 'UNETLoader', { unet_name: 'custom\\diffusion.safetensors', weight_dtype: 'default' }],
        ['custom\\model.GGUF', 'UnetLoaderGGUF', { unet_name: 'custom\\model.GGUF' }],
    ]) {
        test(`LTX ${version} loads ${filename} with ${loader}`, () => {
            const result = buildLtxDirectorModelNodes(optionsFor(version, filename), info);
            assert.deepEqual(result.model, { class_type: loader, inputs });
        });
    }
}

test('dual encoder selections survive serialization and replace both template encoders', () => {
    const options = JSON.parse(JSON.stringify(optionsFor('2.3', 'custom\\checkpoint.safetensors')));
    assert.deepEqual(splitLtxTextEncoders(options.textEncoder), ['custom\\encoder.safetensors', 'custom\\projection.safetensors']);
    assert.deepEqual(buildLtxDirectorModelNodes(options, info).clip, {
        class_type: 'DualCLIPLoader',
        inputs: { clip_name1: 'custom\\encoder.safetensors', clip_name2: 'custom\\projection.safetensors', type: 'ltxv', device: 'default' },
    });
    assert.throws(() => splitLtxTextEncoders('missing projection'), /Select both models/);
    assert.throws(() => splitLtxTextEncoders('encoder + '), /Select both models/);
});

test('GGUF text encoders use single or dual GGUF loaders', () => {
    for (const version of ['2.3', '2.5']) {
        const options = { ...optionsFor(version, 'custom\\model.GGUF'),
            textEncoder: version === '2.3' ? 'custom\\encoder.gguf + custom\\projection.safetensors' : 'custom\\encoder.gguf' };
        const clip = buildLtxDirectorModelNodes(options, info).clip;
        assert.equal(clip.class_type, version === '2.3' ? 'DualCLIPLoaderGGUF' : 'CLIPLoaderGGUF');
        assert.equal('device' in clip.inputs, false);
    }
});

test('missing loaders produce an explicit error', () => {
    const { UnetLoaderGGUF, ...withoutGguf } = info;
    assert.throws(() => buildLtxDirectorModelNodes(optionsFor('2.5', 'custom\\model.GGUF'), withoutGguf), /Missing ComfyUI nodes.*UnetLoaderGGUF/);
});

const serviceSource = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
const serviceAst = ts.createSourceFile('comfyUIService.ts', serviceSource, ts.ScriptTarget.Latest, true);
const generationDeclaration = serviceAst.statements.find(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
        declaration.name.getText(serviceAst) === 'generateLtxDirectorVideo'));
assert.ok(generationDeclaration, 'The production generation function must exist.');
const generationCode = transpile(generationDeclaration.getText(serviceAst)).replace(/^export /gm, '');
const createGenerate = new Function(
    'buildLtxDirectorModelNodes', 'LTX_DIRECTOR_WORKFLOW_TEMPLATE', 'getComfyUIObjectInfo',
    'calculateLtxResolution', 'LTX_T2V_RESOLUTIONS', 'executeWorkflow',
    `${generationCode}\nreturn generateLtxDirectorVideo;`,
);

for (const version of ['2.3', '2.5']) {
    test(`LTX ${version} submits the selected Safetensors model and encoders in the final workflow`, async () => {
        let submitted;
        const generate = createGenerate(
            buildLtxDirectorModelNodes, LTX_DIRECTOR_WORKFLOW_TEMPLATE, async () => info,
            (width, height) => ({ width, height }), { landscape: { width: 1024, height: 576 } },
            async workflow => { submitted = workflow; return { videoUrl: 'test-video.mp4' }; },
        );
        const options = { ...optionsFor(version, 'custom\\diffusion.safetensors'),
            t2vOrientation: 'landscape', frameRate: 24, guideStrength: 1, imageScalePercent: 100,
            videoVae: 'video.safetensors', audioVae: 'audio.safetensors', latentUpscaler: 'upscaler.safetensors',
            loras: [], useCacheDit: false, seed: 123, vaeDecodeMode: 'standard' };
        assert.equal(await generate([{ image: null, prompt: 'A landscape', durationSeconds: 5 }], null, options, () => {}), 'test-video.mp4');
        assert.equal(submitted['77'].class_type, 'UNETLoader');
        assert.equal(submitted['77'].inputs.unet_name, options.checkpoint);
        assert.equal(submitted['84'].class_type, version === '2.3' ? 'DualCLIPLoader' : 'CLIPLoader');
        assert.equal(submitted['84'].inputs[version === '2.3' ? 'clip_name1' : 'clip_name'],
            version === '2.3' ? 'custom\\encoder.safetensors' : options.textEncoder);
        if (version === '2.3') assert.equal(submitted['84'].inputs.clip_name2, 'custom\\projection.safetensors');
        assert.deepEqual(submitted['79'].inputs.model, ['77', 0]);
        assert.deepEqual(submitted['46'].inputs.clip, ['84', 0]);
    });
}
