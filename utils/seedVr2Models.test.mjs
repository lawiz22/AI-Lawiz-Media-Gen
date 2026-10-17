import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./seedVr2Models.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { getSeedVr2Models, selectSeedVr2Model } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('lists all server models in server order without adding hardcoded defaults', () => {
    const info = {
        SeedVR2LoadDiTModel: { input: { required: { model: [['3b_fp8.safetensors', '7b_fp8.safetensors', '3b_fp8.safetensors']] } } },
        SeedVR2LoadVAEModel: { input: { required: { model: [['vae_bf16.safetensors', 'vae_fp16.safetensors']] } } },
    };
    assert.deepEqual(getSeedVr2Models(info), {
        ditModels: ['3b_fp8.safetensors', '7b_fp8.safetensors'],
        vaeModels: ['vae_bf16.safetensors', 'vae_fp16.safetensors'],
    });
});

test('selects the first available model by default and replaces missing selections', () => {
    const models = ['3b_fp8.safetensors', '7b_fp8.safetensors'];
    assert.equal(selectSeedVr2Model(models, ''), models[0]);
    assert.equal(selectSeedVr2Model(models, 'seedvr2_ema_7b_fp16.safetensors'), models[0]);
    assert.equal(selectSeedVr2Model(models, models[1]), models[1]);
    assert.equal(selectSeedVr2Model(['new.safetensors'], models[1]), 'new.safetensors');
    assert.equal(selectSeedVr2Model([], models[1]), '');
});

test('supports COMBO options and optional model inputs while excluding invalid choices', () => {
    assert.deepEqual(getSeedVr2Models({
        SeedVR2LoadDiTModel: { input: { required: { model: ['COMBO', { options: ['first.gguf', null, 12, '', ' ', 'second.safetensors'] }] } } },
        SeedVR2LoadVAEModel: { input: { optional: { model: [['vae.safetensors']] } } },
    }), { ditModels: ['first.gguf', 'second.safetensors'], vaeModels: ['vae.safetensors'] });
});

test('missing nodes, empty lists and malformed widgets never fabricate a model', () => {
    for (const info of [null, undefined, {}, {
        SeedVR2LoadDiTModel: { input: { required: { model: [[]] } } },
        SeedVR2LoadVAEModel: { input: { required: { model: 'invalid' } } },
    }]) {
        assert.deepEqual(getSeedVr2Models(info), { ditModels: [], vaeModels: [] });
    }
});

const serviceSource = readFileSync(new URL('../services/comfyUIService.ts', import.meta.url), 'utf8');
const serviceAst = ts.createSourceFile('comfyUIService.ts', serviceSource, ts.ScriptTarget.Latest, true);
const generationStatement = serviceAst.statements.find(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
        declaration.name.getText(serviceAst) === 'generateSeedVr2Upscale'));
assert.ok(generationStatement);
const { outputText: generationCode } = ts.transpileModule(generationStatement.getText(serviceAst).replace(/^export /, ''), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});

const createGenerator = (objectInfo, onUpload, onWorkflow) => new Function(
    'getSeedVr2Models', 'selectSeedVr2Model', 'getComfyUIUrl', 'fetch', 'uploadImage', 'executeWorkflow',
    `${generationCode}\nreturn generateSeedVr2Upscale;`,
)(
    getSeedVr2Models, selectSeedVr2Model, () => 'http://localhost:8188',
    async () => ({ ok: true, json: async () => objectInfo }),
    async () => { onUpload(); return { name: 'source.png' }; },
    async workflow => { onWorkflow(workflow); return { images: ['result.png'] }; },
);

const generationInfo = {
    SeedVR2LoadDiTModel: { input: { required: { model: [['first.gguf', 'second.safetensors']] } } },
    SeedVR2LoadVAEModel: { input: { required: { model: [['first_vae.safetensors', 'second_vae.safetensors']] } } },
    SeedVR2VideoUpscaler: {},
};

test('generation uses first available models for empty or removed selections and preserves valid choices', async () => {
    for (const [ditModel, vaeModel, expectedDit, expectedVae] of [
        ['', '', 'first.gguf', 'first_vae.safetensors'],
        ['seedvr2_ema_7b_fp16.safetensors', 'removed_vae', 'first.gguf', 'first_vae.safetensors'],
        ['second.safetensors', 'second_vae.safetensors', 'second.safetensors', 'second_vae.safetensors'],
    ]) {
        let uploaded = false;
        const generate = createGenerator(generationInfo, () => { uploaded = true; }, workflow => {
            assert.equal(workflow['20'].inputs.model, expectedDit);
            assert.equal(workflow['29'].inputs.model, expectedVae);
        });
        assert.equal(await generate({}, { ditModel, vaeModel, resolution: 2180 }, () => {}), 'result.png');
        assert.equal(uploaded, true);
    }
});

test('generation fails explicitly before upload when either model list is empty', async () => {
    for (const node of ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel']) {
        const generate = createGenerator(
            { ...generationInfo, [node]: { input: { required: { model: [[]] } } } },
            () => assert.fail('Must not upload without available models'),
            () => assert.fail('Must not submit without available models'),
        );
        await assert.rejects(generate({}, { ditModel: '', vaeModel: '', resolution: 2180 }, () => {}), /No SeedVR2 (DiT|VAE) models/);
    }
});
