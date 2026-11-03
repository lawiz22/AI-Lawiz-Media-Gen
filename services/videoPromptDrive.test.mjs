import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./libraryService.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('libraryService.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['withoutLocalAssetRefs', 'getDriveSubfolder', 'uploadLibraryAssetsToDrive', 'saveToLibrary', 'syncLibraryToDrive', 'syncLibraryFromDrive']);
const helpers = tree.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(tree))))
    .map(statement => statement.getText(tree)).join('\n');
const mocks = `
export let localItems = [];
export let remoteIndex = {version:1,items:{}};
export const uploads = [];
export const imports = [];
export const reset = () => { localItems = []; remoteIndex = {version:1,items:{}}; uploads.length = 0; imports.length = 0; };
export const clearRemote = () => { remoteIndex = {version:1,items:{}}; };
export const clearLocal = () => { localItems = []; };
const idbService = {
  saveToLibrary: async (item, useExisting, blobs = {}) => {
    const saved = {...item, id:item.id || 1234, assetRefs:Object.fromEntries(Object.entries(blobs).map(([role,blob])=>[role,{id:role,mimeType:blob.type,size:blob.size}]))};
    localItems.push(saved); return saved;
  },
  getLibraryItems: async () => localItems,
  getLibraryAssetBlob: async ref => new Blob(['reference'],{type:ref.mimeType}),
  updateLibraryItem: async (id,patch) => { Object.assign(localItems.find(item=>item.id===id),patch); },
  saveLibraryItemWithBlobs: async (item,blobs) => { imports.push({item,blobs}); },
};
const driveService = {
  isConnected: () => true,
  getOrCreateSubfolder: async () => 'misc',
  getLibraryIndex: async () => ({index:remoteIndex,fileId:'index'}),
  uploadMediaFile: async (blob,name) => { uploads.push({blob,name}); return 'drive-'+name; },
  updateLibraryIndex: async index => { remoteIndex = index; },
  downloadMediaFile: async () => new Blob(['reference'],{type:'video/mp4'}),
};
`;
const { outputText } = ts.transpileModule(mocks + helpers, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const item = {
    mediaType: 'prompt', name: 'Video Prompt test', media: 'generated prompt', thumbnail: 'thumbnail',
    videoPromptOptions: { version: 1, workflow: 'ultrafast', renderOptions: { variant: 'ultrafast', ultrafast: { spectrum: true, rtxUpscale: true, rtxScale: 2 }, seed: 12345, steps: 5, references: { picture: { enabled: false } } }, references: [{ file: { name: 'cropped.png', data: '' }, original: { name: 'source.png', data: '' } }] },
};
const blobs = {
    'videoPromptReference:0': new Blob(['edited'], { type: 'image/png' }),
    'videoPromptOriginal:0': new Blob(['original'], { type: 'image/png' }),
};

test('immediate Library saving uploads prompt reference binaries and retains inline text in Drive metadata', async () => {
    api.reset();
    const saved = await api.saveToLibrary(item, blobs);
    assert.equal(api.uploads.length, 2);
    assert.equal(Object.keys(saved.driveAssetFileIds).length, 2);
    const remote = api.remoteIndex.items[saved.id];
    assert.equal(remote.media, 'generated prompt');
    assert.equal(remote.thumbnail, 'thumbnail');
    assert.equal(remote.assetRefs, undefined);
    assert.deepEqual(remote.videoPromptOptions, item.videoPromptOptions);
    assert.equal(Object.keys(remote.driveAssetFileIds).length, 2);
});

test('bulk Drive backup and restore preserve video prompt references rather than treating them as text-only', async () => {
    api.reset();
    const saved = await api.saveToLibrary(item, blobs);
    api.clearRemote();
    const before = api.uploads.length;
    saved.driveAssetFileIds = undefined;
    await api.syncLibraryToDrive(() => {});
    assert.equal(api.uploads.length - before, 2);
    api.clearLocal();
    await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1);
    assert.equal(api.imports[0].item.media, 'generated prompt');
    assert.equal(api.imports[0].item.videoPromptOptions.references[0].file.name, 'cropped.png');
    assert.deepEqual(Object.keys(api.imports[0].blobs).sort(), ['videoPromptOriginal:0', 'videoPromptReference:0']);
});

test('Ripple presets preserve edited first frame and source video through Drive backup/restore', async () => {
    api.reset();
    const snapshot = { version: 1, prompt: 'Propagate the edit', settings: { version: 1, nodes: { '1232': { seed: 132644 } }, loras: [] },
        image: { name: 'edited.png', type: 'image/png', lastModified: 1 }, video: { name: 'source.mp4', type: 'video/mp4', lastModified: 2 } };
    const assets = { sourceImage: new Blob(['image'], { type: 'image/png' }), ltxRippleVideo: new Blob(['video'], { type: 'video/mp4' }) };
    const saved = await api.saveToLibrary({ mediaType: 'preset', media: JSON.stringify(snapshot.settings), name: 'Ripple setup', thumbnail: 'thumbnail', ltxRippleOptions: snapshot }, assets);
    assert.equal(api.uploads.length, 2);
    assert.deepEqual(Object.keys(saved.driveAssetFileIds).sort(), ['ltxRippleVideo', 'sourceImage']);
    api.clearLocal();
    await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1);
    assert.deepEqual(api.imports[0].item.ltxRippleOptions, snapshot);
    assert.deepEqual(Object.keys(api.imports[0].blobs).sort(), ['ltxRippleVideo', 'sourceImage']);
});

test('Creation suite presets preserve original input binaries and exact snapshot across Drive backup/restore', async () => {
    api.reset();
    const metadata = { version: 1, settings: { sceneEnabled: true, swapEnabled: true, nodes: { '120': { seed: 43 } } },
        inputs: { sourceImage: { name: 'scene.png', type: 'image/png', lastModified: 101 }, startFrame: { name: 'base.png', type: 'image/png', lastModified: 102 },
            characterSceneImage: { name: 'face.png', type: 'image/png', lastModified: 103 } } };
    const setup = { mediaType: 'preset', media: JSON.stringify(metadata.settings), thumbnail: 'thumbnail', name: 'Creation suite setup', creationSuiteOptions: metadata };
    const assets = Object.fromEntries(['sourceImage', 'startFrame', 'characterSceneImage'].map(role => [role, new Blob([role], { type: 'image/png' })]));
    const saved = await api.saveToLibrary(setup, assets);
    assert.equal(api.uploads.length, 3); assert.deepEqual(api.remoteIndex.items[saved.id].creationSuiteOptions, metadata);
    assert.equal(api.remoteIndex.items[saved.id].assetRefs, undefined);
    api.clearLocal(); await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1); assert.deepEqual(api.imports[0].item.creationSuiteOptions, metadata);
    assert.deepEqual(Object.keys(api.imports[0].blobs).sort(), ['characterSceneImage', 'sourceImage', 'startFrame']);
    assert.equal(api.imports[0].item.creationSuiteOptions.inputs.sourceImage.lastModified, 101);
});

test('ordinary prompt items retain their existing text-only Drive path', async () => {
    api.reset();
    const ordinary = { mediaType: 'prompt', name: 'Plain prompt', media: 'text', thumbnail: 'thumbnail' };
    const saved = await api.saveToLibrary(ordinary);
    assert.equal(api.uploads.length, 0);
    assert.equal(api.remoteIndex.items[saved.id].media, 'text');
    api.clearLocal();
    await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 0);
    assert.equal(api.localItems[0].media, 'text');
});

test('Clothes Switcher presets retain the source photo and exact settings through Drive save, backup and restore', async () => {
    api.reset();
    const metadata = { version: 1, settings: { randomizeSeed: false, nodes: { '138': { seed: 123247689436968 }, '108': { text: 'Change the jacket' } } },
        input: { name: 'original.png', type: 'image/png', lastModified: 123 } };
    const setup = { mediaType: 'preset', media: JSON.stringify(metadata.settings), thumbnail: 'thumbnail', name: 'Clothes Switcher setup', clothesSwitcherOptions: metadata };
    const saved = await api.saveToLibrary(setup, { sourceImage: new Blob(['source'], { type: 'image/png' }) });
    assert.equal(api.uploads.length, 1); assert.deepEqual(api.remoteIndex.items[saved.id].clothesSwitcherOptions, metadata);
    assert.equal(api.remoteIndex.items[saved.id].assetRefs, undefined);
    api.clearRemote(); saved.driveAssetFileIds = undefined;
    await api.syncLibraryToDrive(() => {});
    assert.equal(api.uploads.length, 2);
    api.clearLocal(); await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1);
    assert.deepEqual(api.imports[0].item.clothesSwitcherOptions, metadata);
    assert.deepEqual(Object.keys(api.imports[0].blobs), ['sourceImage']);
});

test('named Clothes Switcher parameter presets sync four LoRA switches and CacheDiT without attaching an input photo', async () => {
    api.reset();
    const metadata = { version: 1, kind: 'parameters', settings: { version: 2, randomizeSeed: false,
        loraEnabled: { '144': true, '165': false, '166': true, '168': true },
        nodes: { '167': { enable: true, model_type: 'Flux', warmup_steps: 3, skip_interval: 2, print_summary: true },
            '168': { lora_name: 'fourth.safetensors', strength_model: 0.6 } } } };
    const saved = await api.saveToLibrary({ mediaType: 'preset', media: '', thumbnail: '', name: 'CLOTHES-SWITCHER_FLUX2_Param_Test', clothesSwitcherOptions: metadata });
    assert.equal(api.uploads.length, 0); assert.deepEqual(api.remoteIndex.items[saved.id].clothesSwitcherOptions, metadata);
    api.clearLocal(); await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1); assert.deepEqual(api.imports[0].item.clothesSwitcherOptions, metadata);
    assert.deepEqual(api.imports[0].blobs, {});
});

test('Audio-Sync setup presets upload and restore both input binaries with their workflow metadata', async () => {
    api.reset();
    const setup = { mediaType: 'preset', name: 'LTX Audio-Sync setup', media: '{"settings":true}', thumbnail: 'thumbnail',
        ltxAudioSyncOptions: { version: 1, prompt: 'A singer performs.', settings: { enhancePrompt: false,
            loras: [{ enabled: true, name: 'camera.safetensors', strength: 0.65 }, { enabled: false, name: 'style.safetensors', strength: 0.9 }] },
            audio: { name: 'voice.wav', type: 'audio/wav' } } };
    setup.ltxAudioSyncOptions.audioOriginal = { name: 'original.wav', type: 'audio/wav', lastModified: 123 };
    setup.ltxAudioSyncOptions.audioSelection = { start: 5, end: 10 };
    setup.ltxAudioSyncOptions.lyrics = { enabled: false, text: 'Words', source: 'previous' };
    const assets = { sourceImage: new Blob(['image'], { type: 'image/png' }), ltxAudioSyncAudio: new Blob(['voice'], { type: 'audio/wav' }),
        ltxAudioSyncOriginalAudio: new Blob(['original'], { type: 'audio/wav' }) };
    const saved = await api.saveToLibrary(setup, assets);
    assert.equal(api.uploads.length, 3);
    assert.deepEqual(Object.keys(saved.driveAssetFileIds).sort(), ['ltxAudioSyncAudio', 'ltxAudioSyncOriginalAudio', 'sourceImage']);
    assert.deepEqual(api.remoteIndex.items[saved.id].ltxAudioSyncOptions, setup.ltxAudioSyncOptions);
    assert.equal(api.remoteIndex.items[saved.id].assetRefs, undefined);
    api.clearLocal();
    await api.syncLibraryFromDrive(() => {});
    assert.equal(api.imports.length, 1);
    assert.deepEqual(Object.keys(api.imports[0].blobs).sort(), ['ltxAudioSyncAudio', 'ltxAudioSyncOriginalAudio', 'sourceImage']);
    assert.equal(api.imports[0].item.ltxAudioSyncOptions.settings.enhancePrompt, false);
    assert.deepEqual(api.imports[0].item.ltxAudioSyncOptions.settings.loras, setup.ltxAudioSyncOptions.settings.loras);
});
