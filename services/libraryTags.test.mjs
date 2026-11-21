import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const tagsSource = read('./libraryTags.ts').replace(/^import .*;\r?$/gm, '');
const api = await import(compile(tagsSource));
const style = title => ({ id: 'style-1', title, model: 'H3', prompt: 'Film aesthetic', trigger: '', lora: '', strength: 1, notes: '', settings: {} });
const item = patch => ({ mediaType: 'image', name: 'Styled output', media: '', thumbnail: 'thumbnail', ...patch });

test('every supported image workflow tags only its active gallery style, including prompt-only styles', () => {
    const options = {
        provider: 'comfyui',
        comfyFlux2Style: style('Flux T2I'), comfyFlux2EditStyle: style('Flux Edit'), comfyKreaStyle: style('Krea'),
        comfyMoss: { style: style('Moss Image') }, comfyMossPhoto: { style: style('Moss Photo') },
    };
    for (const [comfyModelType, tag] of [
        ['flux2-simple', 'flux t2i'], ['flux2-edit', 'flux edit'], ['krea2-simple', 'krea'],
        ['moss-image', 'moss image'], ['moss-photo', 'moss photo'],
    ]) {
        assert.deepEqual(api.withLibraryStyleTags(item({ options: { ...options, comfyModelType } })).tags, [tag]);
    }
    for (const patch of [{ provider: 'gemini' }, { provider: 'mammouth' }, { comfyModelType: 'qwen21-t2i' }, { comfyModelType: 'krea2-edit' }]) {
        const unstyled = item({ options: { ...options, comfyModelType: 'flux2-simple', ...patch } });
        assert.equal(api.withLibraryStyleTags(unstyled), unstyled);
    }
    const video = item({ mediaType: 'video', options: { ...options, comfyModelType: 'flux2-simple' } });
    assert.equal(api.withLibraryStyleTags(video), video, 'An inactive image style must not tag an unrelated video.');
    const character = item({ mediaType: 'character', options: { ...options, comfyModelType: 'flux2-simple', comfyCharacterMode: 'flux2' } });
    assert.equal(api.withLibraryStyleTags(character), character, 'Character angles use their own model settings, not the image workflow style.');
});

test('all H3 variants and image-format outputs receive the style name from the saved render snapshot', () => {
    for (const variant of ['reference', 'ultrafast', 'advanced']) {
        for (const mediaType of ['video', 'image']) {
            const original = item({ mediaType, tags: ['minimax-h3', variant], minimaxH3Options: {
                options: { variant, style: style('Phone Photography'), advanced: variant === 'advanced' ? { inputMode: 'generate' } : undefined },
            } });
            assert.deepEqual(api.withLibraryStyleTags(original).tags, ['minimax-h3', variant, 'phone photography']);
            assert.deepEqual(original.tags, ['minimax-h3', variant]);
        }
    }
    for (const latentUpscale of [false, true]) {
        const result = api.withLibraryStyleTags(item({ mediaType: 'video', minimaxH3Options: {
            options: { style: style('Film'), advanced: { inputMode: 'video', latentUpscale } },
        } }));
        assert.deepEqual(result.tags, latentUpscale ? ['film'] : undefined, 'Finishing without an H3 model must not claim an inactive H3 style.');
    }
});

test('Blazing styles, tag normalization and duplicate prevention preserve existing metadata and inputs', () => {
    const selected = style('  #Retro   VHS  ');
    const original = item({ mediaType: 'character', tags: ['favorite', 'blazing-fast-character'], blazingFastOptions: { style: selected } });
    const tagged = api.withLibraryStyleTags(original);
    assert.deepEqual(tagged.tags, ['favorite', 'blazing-fast-character', 'retro vhs']);
    assert.equal(tagged.blazingFastOptions, original.blazingFastOptions);
    assert.equal(selected.title, '  #Retro   VHS  ');
    assert.deepEqual(original.tags, ['favorite', 'blazing-fast-character']);
    assert.deepEqual(api.withLibraryStyleTags(tagged).tags, tagged.tags);
    const existing = api.withLibraryStyleTags({ ...original, tags: ['favorite', 'Retro VHS'] });
    assert.deepEqual(existing.tags, ['favorite', 'Retro VHS']);
    assert.equal(api.normalizeLibraryTag(' A '.repeat(60)).length, 48);
    assert.equal(api.normalizeLibraryTag('\u00c9T\u00c9  CIN\u00c9MA'), '\u00e9t\u00e9 cin\u00e9ma');
    const withoutStyle = item({ tags: ['manual'] });
    assert.equal(api.withLibraryStyleTags(withoutStyle), withoutStyle);
    for (const mediaType of ['preset', 'prompt', 'audio-tts']) {
        const other = { ...original, mediaType };
        assert.equal(api.withLibraryStyleTags(other), other);
    }
    assert.throws(() => api.withLibraryStyleTags({ ...original, blazingFastOptions: { style: style('###') } }), /selected style needs a non-empty name/);
});

const reducerTree = ts.createSourceFile('generationSlice.ts', read('../store/generationSlice.ts'), ts.ScriptTarget.Latest, true);
let imagesReducer;
const findReducer = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(reducerTree) === 'setGeneratedImages') imagesReducer = node.initializer;
    ts.forEachChild(node, findReducer);
};
findReducer(reducerTree);
assert.ok(imagesReducer);
const gridSource = read('../components/ImageGrid.tsx');
const gridTree = ts.createSourceFile('ImageGrid.tsx', gridSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveGrid;
const findSave = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(gridTree) === 'handleSaveToLibrary') saveGrid = node.initializer;
    ts.forEachChild(node, findSave);
};
findSave(gridTree);
assert.ok(saveGrid);
const libraryTree = ts.createSourceFile('LibraryPanel.tsx', read('../components/LibraryPanel.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let search;
const findSearch = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(libraryTree) === 'getLibrarySearchText') search = node.initializer;
    ts.forEachChild(node, findSearch);
};
findSearch(libraryTree);
assert.ok(search);
const integration = await import(compile(`${tagsSource}
export const reduceImages = ${imagesReducer.getText(reducerTree)};
export const searchText = ${search.getText(libraryTree)};
export const saveGrid = async (options, enhanced) => {
    let saved;
    const dispatch = action => {
        if (action.type === 'add') saved = action.payload;
        return { unwrap: async () => {} };
    };
    const setImageSaveStatus = payload => ({type:'status',payload});
    const addToLibrary = payload => ({type:'add',payload});
    const images = [{src:'original-image', seed:42}], enhancedImages = enhanced ? {0:'enhanced-image'} : {};
    const activeTab = 'image-generator', contentKey = 'image-generator', sourceImage = null, characterName = '';
    const getImageDimensionsFromDataUrl = async () => ({width:100,height:100});
    const dataUrlToThumbnail = async () => 'thumbnail';
    const dataUrlToFile = async () => new File(['source'],'source.png',{type:'image/png'});
    const fileToResizedDataUrl = async () => 'source-data';
    const DEFAULT_MAMMOUTH_IMAGE_MODEL = 'enhance-model';
    const generateCharacterDescription = () => 'character';
    await (${saveGrid.getText(gridTree)})(enhanced ? 'enhanced-image' : 'original-image', 0);
    if (!saved) throw new Error('Image save did not dispatch an item.');
    return saved;
};
`));

test('image generation snapshots keep the original style across progressive results and later control changes', () => {
    const first = { provider: 'comfyui', comfyModelType: 'flux2-simple', comfyFlux2Style: style('Original Film') };
    const state = { options: first, generatedContent: {} };
    integration.reduceImages(state, { payload: { tabId: 'image', images: [], options: first } });
    first.comfyFlux2Style.title = 'New Selection';
    state.options = { ...first, comfyFlux2Style: style('Different Style') };
    integration.reduceImages(state, { payload: { tabId: 'image', images: [{ src: 'first', seed: 1 }] } });
    integration.reduceImages(state, { payload: { tabId: 'image', images: [{ src: 'first', seed: 1 }, { src: 'second', seed: 2 }] } });
    assert.equal(state.generatedContent.image.options.comfyFlux2Style.title, 'Original Film');
    assert.equal(api.imageGalleryStyleTag(state.generatedContent.image.options), 'original film');
    integration.reduceImages(state, { payload: { tabId: 'other-tab', images: [], options: state.options } });
    assert.equal(api.imageGalleryStyleTag(state.generatedContent['other-tab'].options), 'different style');
    assert.equal(state.generatedContent.image.images.length, 2);
    integration.reduceImages(state, { payload: { tabId: 'image', images: [] } });
    assert.equal(state.generatedContent.image.options, undefined, 'Clearing without a snapshot must not retain old settings.');
    const app = read('../App.tsx');
    assert.match(app, /images: \[\], options: currentOptions/);
    assert.match(app, /content=\{generatedContent\[imageGeneratorContentKey\]\}/);
    assert.match(read('../components/ImageGeneratorTab.tsx'), /options=\{content\?\.options \?\? options\}/);
});

test('original and enhanced images retain their source style hashtag without changing enhancement settings', async () => {
    const options = { provider: 'comfyui', comfyModelType: 'flux2-simple', comfyFlux2Style: style('Retro Film') };
    for (const enhanced of [false, true]) {
        const saved = await integration.saveGrid(options, enhanced);
        assert.deepEqual(saved.tags, ['retro film']);
        assert.deepEqual(api.withLibraryStyleTags(saved).tags, ['retro film']);
        assert.equal(saved.options.provider, enhanced ? 'mammouth' : 'comfyui');
        if (enhanced) assert.equal(saved.options.comfyFlux2Style, undefined);
    }
    const unstyled = await integration.saveGrid({ provider: 'gemini', comfyFlux2Style: style('Inactive Film') }, false);
    assert.equal(unstyled.tags, undefined);
});

test('Library search supports hashtags as well as plain style names and retains existing searchable metadata', () => {
    const metadata = api.withLibraryStyleTags(item({
        options: { provider: 'comfyui', comfyModelType: 'flux2-simple', comfyFlux2Style: style('Retro VHS') },
        tags: ['favorite'], media: 'data:image/png;base64,private',
    }));
    const text = integration.searchText(metadata);
    assert.ok(text.includes('#retro vhs'));
    assert.ok(text.includes('retro vhs'));
    assert.ok(text.includes('#favorite'));
    assert.ok(text.includes('styled output'));
    assert.ok(!text.includes('data:image'));
});
