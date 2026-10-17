import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => {
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const characterUrl = compile(readFileSync(new URL('./characterAnglesWorkflow.ts', import.meta.url), 'utf8'));
const character = await import(characterUrl);
const geminiSource = readFileSync(new URL('./geminiService.ts', import.meta.url), 'utf8');
const geminiTree = ts.createSourceFile('geminiService.ts', geminiSource, ts.ScriptTarget.Latest, true);
const portraitDeclaration = geminiTree.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => declaration.name.getText(geminiTree) === 'generatePortraits'));
assert.ok(portraitDeclaration);
const providersUrl = compile(`
    export const calls = [];
    export const failures = { at: -1, empty: false };
    export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
    export const DEFAULT_MAMMOUTH_IMAGE_MODEL = 'mammouth-default';
    const Modality = { IMAGE: 'IMAGE' };
    const ThinkingLevel = { HIGH: 'HIGH', MINIMAL: 'MINIMAL' };
    const getGeminiAspectRatios = () => ['1:1', '16:9'];
    const getGeminiImageSizes = () => ['1K', '2K'];
    const supportsGeminiThinkingLevel = () => true;
    const fileToGenerativePart = async file => ({ inlineData: { mimeType: file.type, data: file.name } });
    const getApiErrorDetails = error => ({ message: error.message });
    const ai = { models: { generateContent: async request => {
        const index = calls.length;
        calls.push({ provider: 'gemini', request });
        if (index === failures.at) throw new Error('Synthetic provider failure');
        return failures.empty ? { candidates: [] } : {
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'result-' + index } }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
        };
    } } };
    ${portraitDeclaration.getText(geminiTree)}
    export const generateMammouthImage = async (prompt, inputs, aspectRatio, model) => {
        const index = calls.length;
        calls.push({ provider: 'mammouth', prompt, inputs, aspectRatio, model });
        if (index === failures.at) throw new Error('Synthetic provider failure');
        return { images: failures.empty ? [] : ['data:image/png;base64,result-' + index], usageMetadata: { totalTokenCount: 30 } };
    };
`);
const providers = await import(providersUrl);
const source = readFileSync(new URL('./cloudCharacterService.ts', import.meta.url), 'utf8')
    .replace("'./characterAnglesWorkflow'", JSON.stringify(characterUrl))
    .replace("'./geminiService'", JSON.stringify(providersUrl))
    .replace("'./mammouthService'", JSON.stringify(providersUrl));
const api = await import(compile(source));
const file = name => new File(['synthetic'], name, { type: 'image/png' });
const identity = file('identity.png');
const outfit = file('outfit.png');
const room = file('room.png');
const pose = file('pose.png');
const options = provider => ({
    provider, aspectRatio: '16:9', numImages: 2, background: 'image', clothing: 'image',
    geminiT2IModel: 'gemini-selected-image', geminiImageSize: '2K', geminiThinkingLevel: 'high',
    mammouthImageModel: 'mammouth-selected-image', comfyCharacterMode: 'flux2',
});
const promptOf = call => call.provider === 'gemini'
    ? call.request.contents.parts.find(part => part.text).text
    : call.prompt;
const filesOf = call => call.provider === 'gemini'
    ? call.request.contents.parts.filter(part => part.inlineData).map(part => part.inlineData.data)
    : call.inputs.map(input => input.name);
const sparse = () => Object.fromEntries(character.CHARACTER_ANGLES.map(({ id }, index) => [id, {
    enabled: index === 2 || index === 7, angle: index === 2 ? 'back view' : 'custom close-up',
    pose: 'sitting', expression: 'happy', prompt: 'Stale FLUX2 full prompt',
}]));

test('cloud Character uses the Qwen Create Character eight-slot controls', async t => {
    t.beforeEach(() => {
        providers.calls.length = 0;
        providers.failures.at = -1;
        providers.failures.empty = false;
    });
    for (const provider of ['gemini', 'mammouth']) {
        await t.test(`${provider}: all eight slots submit separate images with four correctly ordered references`, async () => {
            const ready = [];
            const progress = [];
            const result = await api.generateCloudCharacterAngles(identity, options(provider),
                (_message, value) => progress.push(value), outfit, room, pose,
                () => {}, (index, image, prompt) => ready.push({ index, image, prompt }));
            assert.equal(result.images.length, 8);
            assert.equal(providers.calls.length, 8);
            assert.deepEqual(ready.map(item => item.index), [0, 1, 2, 3, 4, 5, 6, 7]);
            assert.equal(progress.at(-1), 1);
            assert.ok(progress.every(value => value >= 0 && value <= 1));
            assert.equal(new Set(providers.calls.map(promptOf)).size, 8);
            for (const call of providers.calls) {
                assert.deepEqual(filesOf(call), ['identity.png', 'outfit.png', 'room.png', 'pose.png']);
                const prompt = promptOf(call);
                assert.match(prompt, /<image1> is the character identity reference/);
                assert.match(prompt, /clothing reference <image2>/);
                assert.match(prompt, /background reference <image3>/);
                assert.match(prompt, /pose.*<image4>/);
                assert.match(prompt, /one person only/);
                assert.doesNotMatch(prompt, /Stale FLUX2|DWPose/);
                if (provider === 'gemini') {
                    assert.equal(call.request.model, 'gemini-selected-image');
                    assert.deepEqual(call.request.config.imageConfig, { aspectRatio: '16:9', imageSize: '2K' });
                    assert.equal(call.request.config.thinkingConfig.thinkingLevel, 'HIGH');
                } else {
                    assert.equal(call.model, 'mammouth-selected-image');
                    assert.equal(call.aspectRatio, '16:9');
                }
            }
            assert.equal(result.finalPrompt, ready.map(item => item.prompt).join('\n\n'));
            assert.equal(result.images[0].usageMetadata.totalTokenCount, 30);
        });
        await t.test(`${provider}: sparse enabled slots use their customized angle, pose and expression`, async () => {
            const result = await api.generateCloudCharacterAngles(identity, {
                ...options(provider), comfyCharacterAngleSettings: sparse(),
            }, () => {}, null, null, pose);
            assert.equal(result.images.length, 2);
            assert.match(promptOf(providers.calls[0]), /Camera angle: back view/);
            assert.match(promptOf(providers.calls[1]), /Camera angle: custom close-up/);
            for (const call of providers.calls) {
                assert.deepEqual(filesOf(call), ['identity.png', 'pose.png']);
                assert.match(promptOf(call), /Pose: sitting/);
                assert.match(promptOf(call), /Facial expression: happy/);
                assert.match(promptOf(call), /instead of copying the pose reference <image2>/);
                assert.doesNotMatch(promptOf(call), /Stale FLUX2|<image3>/);
            }
        });
        await t.test(`${provider}: green screen ignores stale background settings and uploads`, async () => {
            await api.generateCloudCharacterAngles(identity, {
                ...options(provider), background: 'green screen', customBackground: 'stale room', comfyCharacterPreserveBackgroundPerspective: true,
            }, () => {}, outfit, room, null);
            for (const call of providers.calls) {
                assert.deepEqual(filesOf(call), ['identity.png', 'outfit.png']);
                assert.match(promptOf(call), /uniform chroma-key green \(#00FF00\)/);
                assert.doesNotMatch(promptOf(call), /stale room|background reference|Preserve the original background/);
            }
        });
        await t.test(`${provider}: original background perspective takes priority over a background reference`, async () => {
            await api.generateCloudCharacterAngles(identity, {
                ...options(provider), comfyCharacterPreserveBackgroundPerspective: true,
            }, () => {}, null, room, null);
            assert.deepEqual(filesOf(providers.calls[0]), ['identity.png']);
            assert.match(promptOf(providers.calls[0]), /new perspective matching the requested camera angle/);
        });
        await t.test(`${provider}: custom outfit/background prompts exclude inactive reference files`, async () => {
            await api.generateCloudCharacterAngles(identity, {
                ...options(provider), clothing: 'prompt', customClothingPrompt: 'a blue coat',
                background: 'prompt', customBackground: 'a mountain landscape',
            }, () => {}, outfit, room, null);
            for (const call of providers.calls) {
                assert.deepEqual(filesOf(call), ['identity.png']);
                assert.match(promptOf(call), /Dress the person in a blue coat/);
                assert.match(promptOf(call), /Use this background: a mountain landscape/);
            }
        });
        await t.test(`${provider}: failure stops remaining requests while retaining completed callbacks`, async () => {
            providers.failures.at = 1;
            const completed = [];
            await assert.rejects(api.generateCloudCharacterAngles(identity, options(provider), () => {},
                null, null, null, () => {}, index => completed.push(index)), /Synthetic provider failure/);
            assert.equal(providers.calls.length, 2);
            assert.deepEqual(completed, [0]);
        });
        await t.test(`${provider}: empty responses surface an error rather than a saved success`, async () => {
            providers.failures.empty = true;
            await assert.rejects(api.generateCloudCharacterAngles(identity, options(provider), () => {},
                null, null, null), /no generation result|returned no image/);
            assert.equal(providers.calls.length, 1);
        });
    }
    await t.test('no source, no enabled output or unsupported provider is rejected before network work', async () => {
        const disabled = Object.fromEntries(character.CHARACTER_ANGLES.map(({ id }) => [id, { enabled: false }]));
        await assert.rejects(api.generateCloudCharacterAngles(null, options('gemini'), () => {}, null, null, null), /source image/);
        await assert.rejects(api.generateCloudCharacterAngles(identity, { ...options('gemini'), comfyCharacterAngleSettings: disabled }, () => {}, null, null, null), /at least one character output/);
        await assert.rejects(api.generateCloudCharacterAngles(identity, options('comfyui'), () => {}, null, null, null), /Select Gemini or Mammouth/);
        assert.equal(providers.calls.length, 0);
    });
});

const sliceSource = readFileSync(new URL('../store/generationSlice.ts', import.meta.url), 'utf8');
const sliceTree = ts.createSourceFile('generationSlice.ts', sliceSource, ts.ScriptTarget.Latest, true);
const selector = sliceTree.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => declaration.name.getText(sliceTree) === 'selectIsReadyToGenerate');
const readyApi = await import(compile(`
    import { getEnabledCharacterAngles } from '${characterUrl}';
    export const ready = ${selector.initializer.arguments[1].getText(sliceTree)};
`));
test('Character readiness uses enabled slots, not stale cloud image-count or pose-library controls', () => {
    const disabled = Object.fromEntries(character.CHARACTER_ANGLES.map(({ id }) => [id, { enabled: false }]));
    for (const provider of ['gemini', 'mammouth', 'comfyui']) {
        const generation = {
            isLoading: false, sourceImage: identity, options: {}, characterOptions: {
                ...options(provider), geminiMode: 't2i', geminiPrompt: '', poseMode: 'library', poseLibraryItems: [],
            },
        };
        const app = { activeTab: 'character-generator', isMammouthConnected: true, isComfyUIConnected: true };
        assert.equal(readyApi.ready(generation, app), true);
        assert.equal(readyApi.ready({ ...generation, characterOptions: { ...generation.characterOptions, comfyCharacterAngleSettings: disabled } }, app), false);
        assert.equal(readyApi.ready({ ...generation, sourceImage: null }, app), false);
        assert.equal(readyApi.ready({ ...generation, isLoading: true }, app), false);
        if (provider === 'mammouth') assert.equal(readyApi.ready(generation, { ...app, isMammouthConnected: false }), false);
    }
});
