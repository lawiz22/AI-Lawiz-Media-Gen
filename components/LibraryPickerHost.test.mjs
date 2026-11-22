import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const slice = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(
    read('../store/appSlice.ts').replace("'@reduxjs/toolkit'", JSON.stringify(pathToFileURL(require.resolve('@reduxjs/toolkit')).href)),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
const reduce = (state, modal, isOpen) => slice.default(state, slice.setModalOpen({ modal, isOpen }));
const initial = slice.default(undefined, { type: 'test/init' });
const declared = read('../types.ts').match(/export type LibraryPicker =([\s\S]*?);/)[1].match(/'is\w+PickerOpen'/g).map(name => name.slice(1, -1));
const host = read('./LibraryPickerHost.tsx'), app = read('../App.tsx');

test('Library pickers share one slot and a late close never closes another picker', () => {
    assert.equal(initial.activePicker, null);
    let state = reduce(initial, 'isClothingPickerOpen', true);
    assert.equal(state.activePicker, 'isClothingPickerOpen');
    state = reduce(state, 'isPosePickerOpen', true);
    assert.equal(state.activePicker, 'isPosePickerOpen');
    assert.equal(reduce(state, 'isClothingPickerOpen', false).activePicker, 'isPosePickerOpen');
    assert.equal(reduce(state, 'isPosePickerOpen', false).activePicker, null);
    assert.equal(Object.keys(initial).filter(key => /PickerOpen$/.test(key)).length, 0);
});

test('the settings dialogs keep their own flags and do not disturb the open picker', () => {
    let state = reduce(initial, 'isMaskPickerOpen', true);
    for (const dialog of ['isSettingsModalOpen', 'isVisualSettingsModalOpen', 'isComfyUIHelperOpen', 'isOAuthHelperOpen']) {
        state = reduce(state, dialog, true);
        assert.equal(state[dialog], true, dialog);
        assert.equal(reduce(state, dialog, false)[dialog], false, dialog);
    }
    assert.equal(state.activePicker, 'isMaskPickerOpen');
    assert.equal(slice.default(state, slice.closeSettingsModal()).isSettingsModalOpen, false);
});

test('every declared picker has exactly one dialog in the host, and every opener names a declared picker', () => {
    assert.equal(declared.length, 31);
    assert.equal(new Set(declared).size, declared.length);
    const hosted = [...host.matchAll(/picker\('(is\w+PickerOpen)'\)/g)].map(match => match[1]);
    assert.deepEqual([...hosted].sort(), [...declared].sort());
    const openers = ['../App.tsx', './ImageGeneratorTab.tsx', './CharacterTab.tsx', './photoFusion/PhotoFusionPanel.tsx'].flatMap(file =>
        [...read(file).matchAll(/modal: '(is\w+Open)', isOpen: true/g)].map(match => match[1]));
    assert.ok(openers.length >= 25, `Found ${openers.length} openers`);
    for (const name of openers) assert.ok(declared.includes(name), `${name} is opened but has no dialog`);
    for (const name of declared) assert.ok(openers.includes(name), `${name} has a dialog but nothing opens it`);
});

test('reducers are pure: storage is written by the store middleware and the transfer id comes with the action', () => {
    const source = read('../store/appSlice.ts'), store = read('../store/store.ts');
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    for (const key of ["sessionStorage, 'currentUser'", "localStorage, 'projectName'", "localStorage, 'fontSize'", "localStorage, 'drive_folder'"]) assert.ok(store.includes(key), key);
    assert.match(store, /\.concat\(persistPreferences\)/);
    assert.equal(slice.default(initial, slice.setProjectName('Renamed')).projectName, 'Renamed');
    assert.equal(slice.default(initial, slice.setFontSize(16)).fontSize, 16);
    assert.deepEqual(slice.default(initial, slice.setDriveFolder({ id: 'f', name: 'Folder' })).driveFolder, { id: 'f', name: 'Folder' });
    const action = slice.queueLtxTransfer({ prompt: 'A slow pan' });
    assert.match(action.payload.id, /^[0-9a-f-]{36}$/);
    const first = slice.default(initial, action), second = slice.default(initial, action);
    assert.deepEqual(first.pendingLtxTransfer, { id: action.payload.id, prompt: 'A slow pan' });
    assert.deepEqual(second.pendingLtxTransfer, first.pendingLtxTransfer);
    assert.equal(first.activeTab, 'ltx-director');
    assert.notEqual(slice.queueLtxTransfer({ prompt: 'A slow pan' }).payload.id, action.payload.id);
});

test('App leaves the open picker to the host and keeps only the Upscale picker', () => {
    assert.equal(app.split('<LibraryPickerHost />').length - 1, 1);
    assert.equal(app.split('<LibraryPickerModal').length - 1, 1);
    assert.match(app, /<LibraryPickerModal isOpen=\{isUpscalePickerOpen\}/);
    assert.doesNotMatch(app, /\bis(?!Upscale)\w+PickerOpen\b(?!')/);
    assert.match(host, /useSelector\(\(state: RootState\) => state\.app\.activePicker\)/);
});
