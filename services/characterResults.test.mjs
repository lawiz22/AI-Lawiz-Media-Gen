import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = source => {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const declaration = (source, name, filename = 'source.ts') => {
    const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const statement = tree.statements.find(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some(item => item.name.getText(tree) === name));
    assert.ok(statement, `Missing declaration: ${name}`);
    return statement.getText(tree);
};
const defaultsUrl = compile([
    declaration(read('./geminiService.ts'), 'DEFAULT_GEMINI_IMAGE_MODEL'),
    declaration(read('./mammouthService.ts'), 'DEFAULT_MAMMOUTH_IMAGE_MODEL'),
].join('\n'));
const defaults = await import(defaultsUrl);
const anglesUrl = compile(read('./characterAnglesWorkflow.ts'));
const angles = await import(anglesUrl);
const qwenUrl = compile(read('./qwen21Workflow.ts'));
const qwen = await import(qwenUrl);
const api = await import(compile(read('./characterResults.ts')
    .replace("'./characterAnglesWorkflow'", JSON.stringify(anglesUrl))
    .replace("'./qwen21Workflow'", JSON.stringify(qwenUrl))
    .replace("'./geminiService'", JSON.stringify(defaultsUrl))
    .replace("'./mammouthService'", JSON.stringify(defaultsUrl))));
const generation = await import(compile(read('../store/generationSlice.ts')
    .replace("'@reduxjs/toolkit'", JSON.stringify(pathToFileURL(require.resolve('@reduxjs/toolkit')).href))
    .replace("'../services/characterAnglesWorkflow'", JSON.stringify(anglesUrl))
    .replace("'../services/qwen21Workflow'", JSON.stringify(qwenUrl))));
const initial = generation.default(undefined, { type: 'test/init' });
const options = overrides => ({ ...initial.characterOptions, ...overrides });
const profiles = [
    options({ provider: 'gemini', geminiT2IModel: 'same-model' }),
    options({ provider: 'gemini', geminiT2IModel: 'other-model' }),
    options({ provider: 'mammouth', mammouthImageModel: 'same-model' }),
    options({ provider: 'mammouth', mammouthImageModel: 'other-model' }),
    options({ provider: 'comfyui', comfyCharacterMode: 'qwen' }),
    options({ provider: 'comfyui', comfyCharacterMode: 'flux2' }),
    options({ provider: 'comfyui', comfyCharacterMode: 'flux2', comfyCharacterFlux2Unet: 'other-unet.gguf' }),
    options({ provider: 'comfyui', comfyCharacterMode: 'qwen21-create' }),
    options({ provider: 'comfyui', comfyCharacterMode: 'qwen21-create', comfyQwen21CreateTurbo: true }),
    options({ provider: 'comfyui', comfyCharacterMode: 'qwen21-create', comfyQwen21Create: { ...qwen.defaultQwen21MultiOptions(), unet: 'other-qwen.safetensors' } }),
];

test('providers, cloud models, ComfyUI workflows, diffusion models and Turbo have distinct result keys', () => {
    assert.equal(new Set(profiles.map(api.getCharacterResultKey)).size, profiles.length);
});

test('implicit model defaults and explicitly selected defaults share their results', () => {
    for (const [base, explicit] of [
        [{ provider: 'gemini' }, { geminiT2IModel: defaults.DEFAULT_GEMINI_IMAGE_MODEL }],
        [{ provider: 'mammouth' }, { mammouthImageModel: defaults.DEFAULT_MAMMOUTH_IMAGE_MODEL }],
        [{ provider: 'comfyui' }, { comfyCharacterMode: 'qwen', comfyCharacterUnet: angles.DEFAULT_CHARACTER_UNET }],
        [{ provider: 'comfyui', comfyCharacterMode: 'flux2' }, { comfyCharacterFlux2Unet: angles.DEFAULT_CHARACTER_FLUX2_UNET }],
        [{ provider: 'comfyui', comfyCharacterMode: 'qwen21-create' }, { comfyQwen21Create: qwen.defaultQwen21MultiOptions() }],
    ]) {
        assert.equal(api.getCharacterResultKey(base), api.getCharacterResultKey({ ...base, ...explicit }));
    }
});

test('editing slots, seeds, references or unrelated providers does not hide the current result set', () => {
    for (const profile of profiles) {
        const edited = {
            ...profile, comfySeed: 987, background: 'prompt', customBackground: 'New background',
            comfyCharacterAngleSettings: { close_up: { enabled: true, angle: 'back view' } },
        };
        if (profile.provider !== 'gemini') edited.geminiT2IModel = 'unused-gemini';
        if (profile.provider !== 'mammouth') edited.mammouthImageModel = 'unused-mammouth';
        if (profile.comfyCharacterMode !== 'qwen21-create') edited.comfyQwen21CreateTurbo = true;
        assert.equal(api.getCharacterResultKey(profile), api.getCharacterResultKey(edited));
    }
});

test('stored images, partial results, prompts and saved indicators remain isolated when selections change', () => {
    let state = initial;
    for (const [index, profile] of profiles.entries()) {
        const key = api.getCharacterResultKey(profile);
        assert.equal(state.generatedContent[key], undefined);
        state = generation.default(state, generation.setGeneratedImages({ tabId: key, images: [{ src: `image-${index}`, seed: index + 20 }] }));
        state = generation.default(state, generation.setLastUsedPrompt({ tabId: key, prompt: `prompt-${index}` }));
        state = generation.default(state, generation.setImageSaveStatus({ tabId: key, index: 0, status: index % 2 ? 'saved' : 'idle' }));
    }
    for (const [index, profile] of [...profiles.entries()].reverse()) {
        const result = state.generatedContent[api.getCharacterResultKey(profile)];
        assert.equal(result.images[0].src, `image-${index}`);
        assert.equal(result.images[0].seed, index + 20);
        assert.equal(result.images[0].saved, index % 2 ? 'saved' : 'idle');
        assert.equal(result.lastUsedPrompt, `prompt-${index}`);
    }
    const key = api.getCharacterResultKey(profiles[0]);
    const otherResult = state.generatedContent[api.getCharacterResultKey(profiles[1])];
    state = generation.default(state, generation.setGeneratedImages({ tabId: key, images: [{ src: 'replacement' }] }));
    assert.equal(state.generatedContent[api.getCharacterResultKey(profiles[1])], otherResult);
    assert.equal(state.generatedContent[key].images[0].src, 'replacement');
    state = generation.default(state, generation.resetGenerationState());
    for (const profile of profiles) assert.equal(state.generatedContent[api.getCharacterResultKey(profile)], undefined);
});

test('generation snapshots retain original nested settings, identity file and character name', () => {
    const original = options({
        provider: 'gemini',
        comfyCharacterAngleSettings: { close_up: { enabled: true, angle: 'front view' } },
        comfyQwen21Create: qwen.defaultQwen21MultiOptions(),
    });
    const identity = new File(['original identity'], 'original.png', { type: 'image/png' });
    const snapshot = api.createCharacterResultSnapshot(original, identity, 'Alice');
    original.geminiT2IModel = 'changed-model';
    original.comfyCharacterAngleSettings.close_up.angle = 'back view';
    original.comfyQwen21Create.loras[0].name = 'changed-lora';
    assert.notEqual(snapshot.options.geminiT2IModel, 'changed-model');
    assert.equal(snapshot.options.comfyCharacterAngleSettings.close_up.angle, 'front view');
    assert.equal(snapshot.options.comfyQwen21Create.loras[0].name, '');
    assert.equal(snapshot.sourceImage, identity);
    assert.equal(snapshot.characterName, 'Alice');
});

const gridSource = read('../components/ImageGrid.tsx');
const gridTree = ts.createSourceFile('ImageGrid.tsx', gridSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const grid = gridTree.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(item => item.name.getText(gridTree) === 'ImageGrid'));
assert.ok(grid);
const gridBody = grid.declarationList.declarations[0].initializer.body;
const save = gridBody.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(item => item.name.getText(gridTree) === 'handleSaveToLibrary'));
assert.ok(save);
const saving = await import(compile(`
    ${declaration(gridSource, 'generateCharacterDescription', 'ImageGrid.tsx')}
    export const saveImage = async ({ options, sourceImage, characterName, contentKey, activeTab, images }) => {
        const actions = [];
        const items = [];
        const enhancedImages = {};
        const DEFAULT_MAMMOUTH_IMAGE_MODEL = 'unused-enhancement-model';
        const getImageDimensionsFromDataUrl = async () => ({ width: 640, height: 960 });
        const dataUrlToThumbnail = async src => 'thumbnail:' + src;
        const fileToResizedDataUrl = async (file, size) => 'source:' + file.name + ':' + size;
        const dataUrlToFile = async () => { throw new Error('Unexpected source conversion'); };
        const setImageSaveStatus = payload => ({ type: 'save/status', payload });
        const addToLibrary = item => ({ type: 'library/add', payload: item });
        const dispatch = action => {
            actions.push(action);
            return action.type === 'library/add' ? { unwrap: async () => { items.push(action.payload); } } : action;
        };
        ${save.getText(gridTree)}
        await handleSaveToLibrary(images[0].src, 0);
        return { actions, items };
    };
`));

for (const provider of ['gemini', 'mammouth', 'comfyui']) {
    test(`${provider}: Library saves the original Character settings/source/seed and updates only its own result key`, async () => {
        const original = options({ provider, geminiMode: 't2i', comfyModelType: 'sdxl' });
        const snapshot = api.createCharacterResultSnapshot(original,
            new File(['identity'], `${provider}-identity.png`, { type: 'image/png' }), 'Alice');
        const key = api.getCharacterResultKey(original);
        const { actions, items } = await saving.saveImage({
            ...snapshot, contentKey: key, activeTab: 'character-generator',
            images: [{ src: `${provider}-result`, seed: 1234, saved: 'idle' }],
        });
        assert.deepEqual(actions.filter(action => action.type === 'save/status').map(action => action.payload), [
            { tabId: key, index: 0, status: 'saving' },
            { tabId: key, index: 0, status: 'saved' },
        ]);
        assert.equal(items.length, 1);
        assert.equal(items[0].mediaType, 'character');
        assert.equal(items[0].media, `${provider}-result`);
        assert.match(items[0].name, /^Alice:/);
        assert.equal(items[0].sourceImage, `source:${provider}-identity.png:512`);
        assert.equal(items[0].options.provider, provider);
        assert.equal(items[0].options.comfySeed, 1234);
        assert.equal(items[0].options.comfySeedControl, 'fixed');
        assert.equal(items[0].options.width, 640);
        assert.equal(snapshot.options.comfySeed, original.comfySeed);
    });
}

test('ordinary text-to-image Library saves still omit source images', async () => {
    const { items } = await saving.saveImage({
        options: options({ provider: 'comfyui', comfyModelType: 'sdxl' }),
        sourceImage: new File(['unused'], 'unused.png'), contentKey: 'image-generator:sdxl',
        activeTab: 'image-generator:sdxl', images: [{ src: 'image-result', saved: 'idle' }],
    });
    assert.equal(items[0].mediaType, 'image');
    assert.equal(items[0].sourceImage, undefined);
});

test('shared Character layout places results between Generate and cancellation, with slots last', () => {
    const source = read('../App.tsx');
    const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let slots;
    const visit = node => {
        if (ts.isJsxSelfClosingElement(node) && node.attributes.properties.some(attribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'data-character-outputs')) slots = node;
        ts.forEachChild(node, visit);
    };
    visit(tree);
    assert.ok(slots, 'Character slots portal must exist');
    const column = slots.parent;
    assert.ok(ts.isJsxElement(column));
    const children = column.children.filter(node => !ts.isJsxText(node) || node.text.trim());
    const generate = children.findIndex(node => node.getText(tree).includes('<ActionControlPanel'));
    const results = children.findIndex(node => node.getText(tree).includes('<ImageGrid'));
    const cancel = children.findIndex(node => node.getText(tree).includes('onClick={handleCancelCharacterGeneration}'));
    assert.ok(generate >= 0 && results > generate && cancel > results);
    assert.equal(children.at(-1), slots, 'Slots must follow results and cancellation at the bottom');
});
