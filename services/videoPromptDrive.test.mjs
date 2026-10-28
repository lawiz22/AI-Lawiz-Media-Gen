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
