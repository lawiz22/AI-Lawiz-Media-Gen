import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { JSONParser } from '@streamparser/json';
import * as zip from '@zip.js/zip.js';
import { createSHA256 } from 'hash-wasm';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import ts from 'typescript';

let moduleId = 0;
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const load = async (name, dependencies, prefix = '') => {
    const key = `__libraryTest${moduleId++}`;
    globalThis[key] = dependencies;
    const code = `const { ${Object.keys(dependencies).join(', ')} } = globalThis.${key};\n${prefix}\n`
        + source(name).replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\r?$/gm, '');
    const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const result = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    delete globalThis[key];
    return result;
};
const promptTree = ts.createSourceFile('videoPromptLibrary.ts', source('./videoPromptLibrary.ts'), ts.ScriptTarget.Latest, true);
const promptHelpers = promptTree.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(declaration => ['cloneVideoPromptLibraryOptions', 'setVideoPromptLibraryAsset'].includes(declaration.name.getText(promptTree))))
    .map(node => node.getText(promptTree)).join('\n');
const idb = await load('./idbLibraryService.ts', { openDB }, promptHelpers);
let activeHandle = null;
globalThis.window = { setTimeout, showDirectoryPicker: async () => activeHandle };
const folder = await load('./libraryService.ts', {
    idbService: idb, JSONParser, createSHA256, ...zip, configureZip: zip.configure,
    getActiveLibraryFolderHandle: async () => activeHandle,
    saveActiveLibraryFolderHandle: async handle => { activeHandle = handle; },
    ensureDirectoryPermission: async () => true,
    googleDriveService: {}, dataUrlToBlob: () => { throw new Error('Unexpected image conversion.'); },
    dataUrlToThumbnail: async () => '', generateTitleForImage: async () => 'Title', summarizePrompt: async () => 'Prompt',
    withLibraryStyleTags: item => item,
});
const backup = await load('./libraryBackupService.ts', idb);
const item = (id, mediaType = 'prompt', extra = {}) => ({ id, mediaType, media: `Prompt ${id}`, thumbnail: '', name: `Item ${id}`, ...extra });
const reset = async () => {
    await idb.getLibraryItems();
    const db = await openDB('ai-media-generator-library', 3);
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    for (const name of db.objectStoreNames) await tx.objectStore(name).clear();
    await tx.done; db.close();
    activeHandle = null;
};
const all = () => idb.getLibraryItems();
const jsonText = async items => {
    let json = '';
    for await (const chunk of backup.streamLibraryJson(items)) json += chunk;
    return json;
};

class Directory {
    constructor(name = 'Project') { this.name = name; this.files = new Map(); this.dirs = new Map(); this.writes = []; }
    async getDirectoryHandle(name, options = {}) {
        if (!this.dirs.has(name)) {
            if (!options.create) throw new DOMException('Missing directory', 'NotFoundError');
            this.dirs.set(name, new Directory(name));
        }
        return this.dirs.get(name);
    }
    async getFileHandle(name, options = {}) {
        if (!this.files.has(name)) {
            if (!options.create) throw new DOMException(`Missing ${name}`, 'NotFoundError');
            this.files.set(name, new Blob());
        }
        return {
            getFile: async () => this.files.get(name),
            createWritable: async () => {
                if (this.failWrite === name) throw new DOMException('Disk full', 'QuotaExceededError');
                const parts = [];
                return {
                    write: async value => { parts.push(value); },
                    close: async () => { this.files.set(name, new Blob(parts)); this.writes.push(name); },
                    abort: async () => {},
                };
            },
        };
    }
    async *values() { for (const name of this.files.keys()) yield { name, kind: 'file' }; }
    async removeEntry(name) { this.files.delete(name); }
}

test('staging never changes the active Library until an atomic commit; failed preparation leaves no partial import', async () => {
    await reset();
    await idb.saveToLibrary(item(1), true);
    const stage = await idb.createLibraryImportStage();
    await stage.add(item(2));
    assert.deepEqual((await all()).map(item => item.id), [1]);
    await assert.rejects(stage.add(item(2)), /Duplicate/);
    await stage.discard();
    assert.deepEqual((await all()).map(item => item.id), [1]);
});

test('legacy folder selection migrates once and never overrides a subsequently activated project', async () => {
    await reset();
    const old = await openDB('lawiz-directory-handles', 1, { upgrade(db) { db.createObjectStore('handles'); } });
    await old.put('handles', { name: 'Legacy folder' }, 'active-library-folder'); old.close();
    const directory = await load('./directoryHandleService.ts', { openDB, ...idb });
    const handles = await Promise.all([directory.getActiveLibraryFolderHandle(), directory.getActiveLibraryFolderHandle()]);
    assert.ok(handles.every(handle => handle.name === 'Legacy folder'));
    const key = (await idb.getLibraryProjectBinding()).projectKey;
    await directory.getActiveLibraryFolderHandle();
    assert.equal((await idb.getLibraryProjectBinding()).projectKey, key);
    const stage = await idb.createLibraryImportStage();
    await stage.commit({ handle: { name: 'New project' }, revision: 'new', dirty: false });
    assert.equal((await directory.getActiveLibraryFolderHandle()).name, 'New project');
});

test('opening replaces rather than merges, commits folder identity together with content, and retains local recovery', async () => {
    await reset();
    await idb.saveToLibrary(item(1), true);
    const stage = await idb.createLibraryImportStage();
    await stage.add(item(2));
    await stage.commit({ handle: { name: 'Other project' }, revision: 'r2', dirty: false });
    assert.deepEqual((await all()).map(item => item.id), [2]);
    assert.equal((await idb.getLibraryProjectBinding()).handle.name, 'Other project');
    assert.equal((await idb.getLibraryProjectBinding()).dirty, false);
    await idb.restoreLibraryRecovery('previous', true);
    assert.deepEqual((await all()).map(item => item.id), [1]);
    assert.equal((await idb.getLibraryProjectBinding()).handle, null);
});

test('a quota failure at final activation rolls back items, media, recovery and folder identity together', async t => {
    await reset();
    await idb.saveToLibrary(item(1), true);
    await idb.setLibraryProjectBinding({ handle: { name: 'Original' }, revision: 'original', dirty: false });
    const stage = await idb.createLibraryImportStage();
    await stage.add(item(2));
    const nativePut = IDBObjectStore.prototype.put;
    t.mock.method(IDBObjectStore.prototype, 'put', function (value, ...args) {
        if (this.name === 'library-project-state') throw new DOMException('Disk full at activation', 'QuotaExceededError');
        return nativePut.call(this, value, ...args);
    });
    await assert.rejects(stage.commit({ handle: { name: 'New' }, revision: 'new', dirty: false }), /Disk full/);
    assert.deepEqual((await all()).map(item => item.id), [1]);
    assert.equal((await idb.getLibraryProjectBinding()).handle.name, 'Original');
    assert.equal((await idb.getLibraryRecoveryEntries()).length, 0);
    await stage.discard();
});

test('collision-safe imports retain existing bytes and remap links only to imported results', async () => {
    await reset();
    await idb.saveToLibrary(item(1), true, { media: new Blob(['original'], { type: 'video/mp4' }) });
    const stage = await idb.createLibraryImportStage();
    await stage.add(item(1, 'video', { media: '' }), { media: new Blob(['incoming'], { type: 'video/mp4' }) });
    await stage.add(item(2, 'prompt', { linkedResultId: 1 }));
    await stage.commit();
    const items = await all();
    assert.equal(items.length, 3);
    assert.equal(await (await idb.getLibraryAssetBlob(items.find(item => item.id === 1).assetRefs.media)).text(), 'original');
    const imported = items.find(item => item.mediaType === 'video');
    assert.notEqual(imported.id, 1);
    assert.equal(items.find(item => item.id === 2).linkedResultId, imported.id);
    assert.equal(await (await idb.getLibraryAssetBlob(imported.assetRefs.media)).text(), 'incoming');
});

test('deleted originals are recoverable and edits during saving remain dirty after completion', async () => {
    await reset();
    await idb.saveToLibrary(item(4, 'video', { media: '' }), true, { media: new Blob(['original video'], { type: 'video/mp4' }) });
    await idb.setLibraryProjectBinding({ handle: { name: 'Active' }, revision: 'r1', dirty: true, generation: 1 });
    await idb.deleteLibraryItems([4]);
    assert.equal((await all()).length, 0);
    const trash = (await idb.getLibraryRecoveryEntries()).find(entry => entry.key.startsWith('trash:'));
    await idb.restoreLibraryRecovery(trash.key, false);
    const restored = (await all())[0];
    assert.equal(await (await idb.getLibraryAssetBlob(restored.assetRefs.media)).text(), 'original video');
    const binding = await idb.getLibraryProjectBinding();
    await idb.updateLibraryItem(restored.id, { tags: ['new'] });
    assert.equal(await idb.completeLibraryProjectSave('r2', binding.generation), false);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, true);
    const latest = await idb.getLibraryProjectBinding();
    assert.equal(await idb.completeLibraryProjectSave('r3', latest.generation), true);
});

test('Library writes are explicitly blocked during a project transition', async () => {
    await reset();
    const unlock = idb.lockLibraryProject();
    await assert.rejects(idb.saveToLibrary(item(1), true), /project is being opened/);
    await assert.rejects(idb.deleteLibraryItems([1]), /project is being opened/);
    unlock();
    await idb.saveToLibrary(item(1), true);
    assert.equal((await all()).length, 1);
});

test('portable JSON round trip preserves binary bytes, nested original/edited references, settings, tags and thumbnails', async () => {
    await reset();
    const bytes = new Uint8Array(3 * 256 * 1024 + 7).map((_, index) => index % 251);
    const saved = await idb.saveToLibrary(item(7, 'prompt', {
        tags: ['favorite'], rating: 5, thumbnail: 'data:image/png;base64,AA==',
        videoPromptOptions: { version: 1, references: [{ id: 'ref', file: { name: 'edit.wav', data: '' }, original: { name: 'original.wav', data: '' } }], renderOptions: { variant: 'advanced', seed: 42, advanced: { stageOrder: 'ltx-first' } } },
        ltxDirectorOptions: { segments: [{ sourceImage: '' }] }, qwen21MultiSources: [''],
    }), true, {
        'videoPromptReference:0': new Blob([bytes], { type: 'audio/wav' }),
        'videoPromptOriginal:0': new Blob(['original'], { type: 'audio/wav' }),
        'ltxSegmentSource:0': new Blob(['frame'], { type: 'image/png' }),
        'qwen21MultiSource:0': new Blob(['source'], { type: 'image/png' }),
    });
    const exported = await jsonText([saved]);
    const portable = JSON.parse(exported)[0];
    assert.equal(portable.assetRefs, undefined);
    assert.ok(!exported.includes('blob:'));
    assert.deepEqual(new Uint8Array(await (await fetch(portable.videoPromptOptions.references[0].file.data)).arrayBuffer()), bytes);
    await folder.importLibraryJsonFile(new File([exported], 'library.json'));
    const imported = (await all()).find(item => item.id !== 7);
    assert.deepEqual(imported.tags, saved.tags);
    assert.equal(imported.rating, 5);
    assert.equal(imported.thumbnail, saved.thumbnail);
    assert.deepEqual(imported.videoPromptOptions.renderOptions, saved.videoPromptOptions.renderOptions);
    assert.equal(await (await idb.getLibraryAssetBlob(imported.assetRefs['videoPromptOriginal:0'])).text(), 'original');
    assert.equal(await (await idb.getLibraryAssetBlob(imported.assetRefs['ltxSegmentSource:0'])).text(), 'frame');
    assert.equal(await (await idb.getLibraryAssetBlob(imported.assetRefs['qwen21MultiSource:0'])).text(), 'source');
});

test('invalid or truncated JSON never commits an earlier valid item', async () => {
    await reset(); await idb.saveToLibrary(item(1), true);
    for (const invalid of [`[${JSON.stringify(item(2))},`, JSON.stringify([item(2), item(2)])]) {
        await assert.rejects(folder.importLibraryJsonFile(new File([invalid], 'bad.json')));
        assert.deepEqual((await all()).map(item => item.id), [1]);
    }
});

test('imports report missing historical linked results rather than linking to an unrelated local ID', async () => {
    await reset();
    await idb.saveToLibrary(item(99), true);
    const progress = [];
    await folder.importLibraryJsonFile(new File([JSON.stringify([item(1, 'prompt', { linkedResultId: 99 })])], 'old.json'), value => progress.push(value));
    assert.equal((await all()).find(item => item.id === 1).linkedResultId, undefined);
    assert.match(progress.at(-1).warnings[0], /linked result 99/);
});

test('nonportable JSON asset references and incomplete archive media fail without changing the Library', async () => {
    await reset(); await idb.saveToLibrary(item(1), true);
    await assert.rejects(folder.importLibraryJsonFile(new File([JSON.stringify([
        item(2, 'video', { media: '', assetRefs: { media: { id: 'foreign-local-id' } } }),
    ])], 'not-portable.json')), /local asset references/);
    assert.deepEqual((await all()).map(item => item.id), [1]);
});

test('legacy inline JSON remains importable and temporary preview URLs cannot become a backup', async () => {
    await reset();
    await folder.importLibraryJsonFile(new File([JSON.stringify([item(5, 'image', { media: 'data:image/png;base64,AQID', safetyRating: 'sfw' })])], 'old.json'));
    assert.equal(await (await idb.getLibraryAssetBlob((await all())[0].assetRefs.media)).size, 3);
    await assert.rejects(jsonText([item(6, 'video', { media: 'blob:expired' })]), /temporary blob URL/);
    await assert.rejects(jsonText([item(7, 'prompt', { videoPromptOptions: { references: [
        { file: { data: 'https://old-server/input.png' }, original: { data: '' } },
    ] } })]), /no portable original media/);
});

test('folder saves are incremental, preserve the previous manifest and reject external modifications', async () => {
    await reset();
    const directory = new Directory();
    const saved = await idb.saveToLibrary(item(10, 'video', { media: '' }), true, { media: new Blob(['video'], { type: 'video/mp4' }) });
    const first = await folder.exportLibraryFolder([saved], undefined, { handle: directory, expectedRevision: null });
    assert.equal(first.assetsWritten, 1);
    const second = await folder.exportLibraryFolder([saved], undefined, { handle: directory, expectedRevision: first.revision });
    assert.equal(second.assetsWritten, 0);
    assert.equal(second.assetsReused, 1);
    assert.ok(directory.files.has('manifest.previous.json'));
    const edited = JSON.parse(await directory.files.get('manifest.json').text());
    edited.items[0].metadata.name = 'Edited externally';
    directory.files.set('manifest.json', new Blob([JSON.stringify(edited)]));
    await assert.rejects(folder.exportLibraryFolder([saved], undefined, { handle: directory, expectedRevision: second.revision }), /changed outside/);
    assert.equal(JSON.parse(await directory.files.get('manifest.json').text()).items[0].metadata.name, 'Edited externally');
});

test('direct category import reads linked results and verifies bytes without changing the active project', async () => {
    await reset();
    const directory = new Directory('Source');
    const video = await idb.saveToLibrary(item(11, 'video', { media: '' }), true, { media: new Blob(['film'], { type: 'video/mp4' }) });
    await folder.exportLibraryFolder([video, item(12, 'prompt', { linkedResultId: 11 }), item(13, 'character', { media: 'data:image/png;base64,AA==' })], undefined, { handle: directory, expectedRevision: null });
    await reset();
    await idb.setLibraryProjectBinding({ handle: { name: 'Destination' }, revision: 'dest', dirty: false });
    await folder.importLibraryFolder(undefined, { handle: directory, categories: ['prompt'] });
    assert.equal((await all()).length, 2);
    assert.equal((await idb.getLibraryProjectBinding()).handle.name, 'Destination');
    assert.equal((await all()).find(item => item.mediaType === 'prompt').linkedResultId, 11);
    assert.equal(await (await idb.getLibraryAssetBlob((await all()).find(item => item.id === 11).assetRefs.media)).text(), 'film');
});

test('missing or same-size corrupted folder media leaves both the previous Library and project binding intact', async () => {
    await reset();
    const directory = new Directory('Source');
    const video = await idb.saveToLibrary(item(11, 'video', { media: '' }), true, { media: new Blob(['film'], { type: 'video/mp4' }) });
    await folder.exportLibraryFolder([video], undefined, { handle: directory, expectedRevision: null });
    await idb.setLibraryProjectBinding({ handle: { name: 'Destination' }, revision: 'dest', dirty: false });
    const videos = directory.dirs.get('Videos'), filename = [...videos.files.keys()][0];
    videos.files.set(filename, new Blob(['FAIL']));
    await assert.rejects(folder.importLibraryFolder(undefined, { handle: directory, replace: true }), /SHA-256/);
    assert.equal((await all())[0].id, 11);
    assert.equal((await idb.getLibraryProjectBinding()).handle.name, 'Destination');
    videos.files.delete(filename);
    await assert.rejects(folder.importLibraryFolder(undefined, { handle: directory, replace: true }), /Missing/);
    assert.equal((await idb.getLibraryProjectBinding()).handle.name, 'Destination');
});

test('disk-full failures never replace a valid project manifest', async () => {
    await reset();
    const directory = new Directory();
    const first = await folder.exportLibraryFolder([item(1)], undefined, { handle: directory, expectedRevision: null });
    const before = await directory.files.get('manifest.json').text();
    directory.failWrite = 'manifest.json';
    await assert.rejects(folder.exportLibraryFolder([item(2)], undefined, { handle: directory, expectedRevision: first.revision }), /Disk full/);
    assert.equal(await directory.files.get('manifest.json').text(), before);
});

test('a new empty project is valid, and cleanup protects both manifests and unrelated user files', async () => {
    await reset();
    const directory = new Directory();
    const empty = await folder.exportLibraryFolder([], undefined, { handle: directory, expectedRevision: null });
    assert.equal(JSON.parse(await directory.files.get('manifest.json').text()).items.length, 0);
    const saved = await idb.saveToLibrary(item(1, 'video', { media: '' }), true, { media: new Blob(['video'], { type: 'video/mp4' }) });
    const first = await folder.exportLibraryFolder([saved], undefined, { handle: directory, expectedRevision: empty.revision });
    await idb.deleteLibraryItems([saved.id]);
    const second = await folder.exportLibraryFolder(undefined, undefined, { handle: directory, expectedRevision: first.revision });
    activeHandle = directory;
    const videos = directory.dirs.get('Videos');
    videos.files.set('my-original.mp4', new Blob(['user file']));
    let plan = await folder.inspectLibraryFolderCleanup();
    assert.equal(plan.paths.length, 0, 'Previous manifest still protects the removed video.');
    await folder.exportLibraryFolder(undefined, undefined, { handle: directory, expectedRevision: second.revision });
    plan = await folder.inspectLibraryFolderCleanup();
    assert.equal(plan.paths.length, 1);
    assert.equal(await folder.cleanLibraryFolderMedia(plan), 1);
    assert.ok(videos.files.has('my-original.mp4'));
});

test('unsaved project recovery survives later imports in another project', async () => {
    await reset();
    await idb.saveToLibrary(item(1), true);
    await idb.setLibraryProjectBinding({ handle: { name: 'Unsaved A' }, revision: 'r1', dirty: true, projectKey: 'a' });
    const next = await idb.createLibraryImportStage();
    await next.add(item(2));
    await next.commit({ handle: { name: 'B' }, revision: 'r2', dirty: false });
    const imported = await idb.createLibraryImportStage();
    await imported.add(item(3));
    await imported.commit();
    assert.ok((await idb.getLibraryRecoveryEntries()).some(entry => entry.key === 'project:a'));
    await idb.restoreLibraryRecovery('project:a', true);
    assert.deepEqual((await all()).map(item => item.id), [1]);
});

test('multiple saves within the same millisecond never replace an existing Library item', async t => {
    await reset();
    t.mock.method(Date, 'now', () => 1000);
    const saved = await Promise.all(Array.from({ length: 20 }, (_, index) => idb.saveToLibrary(item(index))));
    assert.equal(new Set(saved.map(item => item.id)).size, 20);
    assert.equal((await all()).length, 20);
});

test('an older Library fetch cannot replace a newer project fetch in Redux', async () => {
    const slice = await load('../store/librarySlice.ts', {
        createAsyncThunk, createSlice, idb, libraryService: folder,
        createVideoPlaceholderThumbnail: () => '', videoToThumbnail: async () => '',
    });
    let state = slice.default(undefined, { type: 'init' });
    state = slice.default(state, slice.fetchLibrary.pending('old'));
    state = slice.default(state, slice.fetchLibrary.pending('new'));
    state = slice.default(state, slice.fetchLibrary.fulfilled([item(1)], 'old'));
    assert.equal(state.items.length, 0);
    state = slice.default(state, slice.fetchLibrary.fulfilled([item(2)], 'new'));
    assert.deepEqual(state.items.map(item => item.id), [2]);
});

test('a video thumbnail that cannot be rebuilt is attempted once, not on every Library refresh', async t => {
    await reset();
    await idb.saveToLibrary(item(1, 'video', { media: 'data:video/mp4;base64,AAAA', thumbnail: '', ltxDirectorOptions: { segments: [] } }), true);
    await idb.saveToLibrary(item(2, 'video', { media: 'data:video/mp4;base64,BBBB', thumbnail: '', ltxDirectorOptions: { segments: [] } }), true);
    const attempts = [];
    t.mock.method(console, 'warn', () => {});
    const slice = await load('../store/librarySlice.ts', {
        createAsyncThunk, createSlice, idb, libraryService: folder, createVideoPlaceholderThumbnail: () => 'placeholder',
        videoToThumbnail: async media => { attempts.push(media); if (media.endsWith('AAAA')) throw new Error('Cannot decode'); return 'data:image/png;base64,thumb'; },
    });
    const fetch = () => slice.fetchLibrary()(() => {}, () => ({}), undefined);
    const first = await fetch();
    assert.equal(first.payload.find(entry => entry.id === 2).thumbnail, 'data:image/png;base64,thumb');
    assert.equal(attempts.length, 2);
    const second = await fetch();
    assert.equal(second.payload.length, 2);
    assert.equal(attempts.length, 2);
});

test('category selection detects source changes before importing anything', async () => {
    await reset();
    const directory = new Directory();
    await folder.exportLibraryFolder([item(2)], undefined, { handle: directory, expectedRevision: null });
    await assert.rejects(folder.importLibraryFolder(undefined, { handle: directory, categories: ['prompt'], expectedRevision: 'stale' }), /changed since category selection/);
    assert.equal((await all()).length, 0);
});

test('legacy binary archives remain importable with original media and no ID-based overwrite', async () => {
    await reset(); await idb.saveToLibrary(item(1), true);
    const writer = new zip.BlobWriter('application/zip'), archive = new zip.ZipWriter(writer);
    await archive.add('assets/video', new zip.BlobReader(new Blob(['archive video'])), { level: 0 });
    await archive.add('manifest.json', new zip.TextReader(JSON.stringify({
        format: 'lawiz-library', version: 1, createdAt: new Date().toISOString(),
        items: [{ metadata: item(1, 'video', { media: '' }), assets: [{ role: 'media', path: 'assets/video', mimeType: 'video/mp4', size: 13 }] }],
    })));
    await archive.close();
    await folder.importLibraryArchive(new File([await writer.getData()], 'old.lawiz-library'));
    assert.equal((await all()).length, 2);
    const imported = (await all()).find(item => item.mediaType === 'video');
    assert.equal(await (await idb.getLibraryAssetBlob(imported.assetRefs.media)).text(), 'archive video');
});

test('centralized saving serializes requests, preserves concurrent edits, and reports errors without success', async () => {
    await reset();
    await idb.setLibraryProjectBinding({ handle: { name: 'Active' }, revision: 'r1', dirty: true, generation: 1 });
    let writes = 0, release;
    const savingStarted = new Promise(resolve => { release = resolve; });
    let continueSaving;
    const paused = new Promise(resolve => { continueSaving = resolve; });
    const sync = await load('./libraryProjectService.ts', {
        ...idb, getActiveLibraryFolderHandle: async () => (await idb.getLibraryProjectBinding())?.handle,
        ensureDirectoryPermission: async () => true, hasDirectoryPermission: async () => true, readLibraryFolder: async () => ({ revision: 'r1' }),
        getLibraryFolderSyncStatus: async () => null, importLibraryFolder: folder.importLibraryFolder,
        exportLibraryFolder: async () => { writes++; if (writes === 1) { release(); await paused; } return { revision: `r${writes + 1}` }; },
    });
    const saving = sync.saveLibraryProjectNow();
    await savingStarted;
    await idb.saveToLibrary(item(1), true);
    continueSaving();
    await saving;
    assert.equal((await idb.getLibraryProjectBinding()).dirty, true);
    assert.equal(sync.getLibraryProjectStatus().phase, 'pending');
    await sync.saveLibraryProjectNow();
    assert.equal(writes, 2);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, false);
    assert.equal(sync.getLibraryProjectStatus().phase, 'saved');
});

test('permission failures are explicit, preserve dirty changes and never call the folder writer', async () => {
    await reset();
    await idb.setLibraryProjectBinding({ handle: { name: 'Active' }, revision: 'r1', dirty: true });
    let writes = 0;
    const sync = await load('./libraryProjectService.ts', {
        ...idb, getActiveLibraryFolderHandle: async () => (await idb.getLibraryProjectBinding())?.handle,
        ensureDirectoryPermission: async () => false, hasDirectoryPermission: async () => false, readLibraryFolder: async () => ({ revision: 'r1' }),
        getLibraryFolderSyncStatus: async () => null, importLibraryFolder: folder.importLibraryFolder,
        exportLibraryFolder: async () => { writes++; },
    });
    await assert.rejects(sync.saveLibraryProjectNow(), /Permission/);
    assert.equal(writes, 0);
    assert.equal(sync.getLibraryProjectStatus().phase, 'error');
    assert.match(sync.getLibraryProjectStatus().message, /preserved locally/);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, true);
});

test('global autosave runs without a mounted Library panel and closing guards pending changes', async t => {
    await reset();
    await idb.setLibraryProjectBinding({ handle: { name: 'Active' }, revision: 'r1', dirty: false, generation: 1 });
    const events = new EventTarget();
    const previousWindow = globalThis.window;
    globalThis.window = events;
    let scheduled, writes = 0;
    const nativeSet = globalThis.setTimeout;
    t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
        if (ms === 1000) { scheduled = callback; return -1; }
        return nativeSet(callback, ms, ...args);
    });
    const sync = await load('./libraryProjectService.ts', {
        ...idb, getActiveLibraryFolderHandle: async () => (await idb.getLibraryProjectBinding())?.handle,
        ensureDirectoryPermission: async () => true, hasDirectoryPermission: async () => true,
        readLibraryFolder: async () => ({ revision: (await idb.getLibraryProjectBinding()).revision }),
        getLibraryFolderSyncStatus: async () => null, importLibraryFolder: folder.importLibraryFolder,
        exportLibraryFolder: async () => { writes++; return { revision: `r${writes + 1}` }; },
    });
    const waitForPhase = phase => new Promise(resolve => {
        if (sync.getLibraryProjectStatus().phase === phase) { resolve(); return; }
        const unsubscribe = sync.subscribeLibraryProject(() => {
            if (sync.getLibraryProjectStatus().phase === phase) { unsubscribe(); resolve(); }
        });
    });
    const stop = sync.startLibraryProjectSync();
    t.after(() => { stop(); globalThis.window = previousWindow; });
    await waitForPhase('saved');
    await idb.saveToLibrary(item(1), true);
    assert.equal(sync.getLibraryProjectStatus().phase, 'pending');
    const pendingClose = new Event('beforeunload', { cancelable: true });
    events.dispatchEvent(pendingClose);
    assert.equal(pendingClose.defaultPrevented, true);
    scheduled();
    await waitForPhase('saved');
    assert.equal(writes, 1);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, false);
    const cleanClose = new Event('beforeunload', { cancelable: true });
    events.dispatchEvent(cleanClose);
    assert.equal(cleanClose.defaultPrevented, false);
});

// Folder access is withdrawn when the app restarts and can only be given back during a user action.
const restarted = async (t, { desktop = false, readFails = false, changedOutside = false } = {}) => {
    await reset();
    await idb.setLibraryProjectBinding({ handle: { name: 'Active' }, revision: 'r1', dirty: false, generation: 1 });
    const events = new EventTarget(), previousWindow = globalThis.window, nativeSet = globalThis.setTimeout;
    if (desktop) events.electron = {};
    globalThis.window = events;
    const probe = { granted: false, requests: 0, reads: 0, writes: 0, scheduled: undefined };
    t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => {
        if (ms === 1000) { probe.scheduled = callback; return -1; }
        return nativeSet(callback, ms, ...args);
    });
    const sync = await load('./libraryProjectService.ts', {
        ...idb, getActiveLibraryFolderHandle: async () => (await idb.getLibraryProjectBinding())?.handle,
        hasDirectoryPermission: async () => probe.granted || readFails,
        ensureDirectoryPermission: async () => { probe.requests++; if (probe.refuse) throw new DOMException('User activation is required', 'SecurityError'); probe.granted = true; return true; },
        readLibraryFolder: async () => {
            probe.reads++;
            if (!probe.granted) throw new DOMException("Failed to execute 'getFileHandle' on 'FileSystemDirectoryHandle'", 'NotAllowedError');
            return { revision: changedOutside ? 'other' : (await idb.getLibraryProjectBinding()).revision };
        },
        getLibraryFolderSyncStatus: async () => null, importLibraryFolder: folder.importLibraryFolder,
        exportLibraryFolder: async () => { probe.writes++; return { revision: `r${probe.writes + 1}` }; },
    });
    const phase = name => new Promise(resolve => {
        if (sync.getLibraryProjectStatus().phase === name) { resolve(); return; }
        const unsubscribe = sync.subscribeLibraryProject(() => {
            if (sync.getLibraryProjectStatus().phase === name) { unsubscribe(); resolve(); }
        });
    });
    const stop = sync.startLibraryProjectSync();
    t.after(() => { stop(); globalThis.window = previousWindow; });
    await phase('paused');
    return { sync, probe, events, phase };
};

test('a restart without folder access pauses saving quietly instead of reporting an error', async t => {
    const { sync, probe, events } = await restarted(t);
    assert.equal(probe.reads, 0);
    assert.equal(probe.requests, 0);
    assert.equal(sync.getLibraryProjectStatus().directoryName, 'Active');
    assert.match(sync.getLibraryProjectStatus().message, /reconnected after a restart.*kept locally/);
    assert.doesNotMatch(sync.getLibraryProjectStatus().message, /getFileHandle|Failed/);
    await idb.saveToLibrary(item(1), true);
    assert.equal(sync.getLibraryProjectStatus().phase, 'paused');
    assert.equal(probe.scheduled, undefined);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, true);
    const close = new Event('beforeunload', { cancelable: true });
    events.dispatchEvent(close);
    assert.equal(close.defaultPrevented, false);
    events.dispatchEvent(new Event('click'));
    assert.equal(probe.requests, 0);
});

test('a folder that reports access but refuses the read is paused too', async t => {
    const { sync, probe } = await restarted(t, { readFails: true });
    assert.equal(probe.reads, 1);
    assert.equal(sync.getLibraryProjectStatus().phase, 'paused');
});

test('Save now reconnects the folder during the user action, then saves the waiting changes', async t => {
    const { sync, probe } = await restarted(t);
    await idb.saveToLibrary(item(1), true);
    await sync.saveLibraryProjectNow(true);
    assert.equal(probe.requests >= 1, true);
    assert.equal(probe.writes, 1);
    assert.equal(sync.getLibraryProjectStatus().phase, 'saved');
    assert.equal((await idb.getLibraryProjectBinding()).dirty, false);
    await idb.saveToLibrary(item(2), true);
    assert.equal(sync.getLibraryProjectStatus().phase, 'pending');
    assert.equal(typeof probe.scheduled, 'function');
});

test('the desktop app reconnects on the first click and saves without any message', async t => {
    const { sync, probe, events, phase } = await restarted(t, { desktop: true });
    await idb.saveToLibrary(item(1), true);
    events.dispatchEvent(new Event('click'));
    await phase('pending');
    assert.equal(probe.requests, 1);
    probe.scheduled();
    await phase('saved');
    assert.equal(probe.writes, 1);
    events.dispatchEvent(new Event('click')); events.dispatchEvent(new Event('keydown'));
    assert.equal(probe.requests, 1);
});

test('a refused reconnection stays paused, is tried once, and Save now reports it explicitly', async t => {
    const { sync, probe, events } = await restarted(t, { desktop: true });
    probe.refuse = true;
    events.dispatchEvent(new Event('click'));
    await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    events.dispatchEvent(new Event('click'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(probe.requests, 1);
    assert.equal(sync.getLibraryProjectStatus().phase, 'paused');
    await assert.rejects(sync.saveLibraryProjectNow(true), /Permission to save the project folder was denied/);
    assert.equal(sync.getLibraryProjectStatus().phase, 'error');
    assert.equal(probe.writes, 0);
});

test('reconnecting still refuses a folder that changed outside the app', async t => {
    const { sync, probe } = await restarted(t, { changedOutside: true });
    await assert.rejects(sync.saveLibraryProjectNow(), /changed outside this app/);
    assert.equal(sync.getLibraryProjectStatus().phase, 'error');
    assert.equal(probe.writes, 0);
});

test('an automatic save that loses folder access pauses instead of failing', async t => {
    const { sync, probe, phase } = await restarted(t);
    await sync.saveLibraryProjectNow();
    await idb.saveToLibrary(item(1), true);
    await phase('pending');
    probe.granted = false;
    probe.scheduled();
    await phase('paused');
    assert.equal(probe.writes, 0);
    assert.equal((await idb.getLibraryProjectBinding()).dirty, true);
});
