import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const componentSource = readFileSync(new URL('./AudioExtractorPanel.tsx', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const slice = readFileSync(new URL('../store/videoSlice.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('videoSlice.ts', slice, ts.ScriptTarget.Latest, true);
let reset;
const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'resetVideoUtilsState') reset = node.initializer.body;
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(reset);
const componentTree = ts.createSourceFile('AudioExtractorPanel.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveHandler;
const findSave = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(componentTree) === 'saveToLibrary') saveHandler = node.initializer.getText(componentTree);
    ts.forEachChild(node, findSave);
};
findSave(componentTree);
assert.ok(saveHandler);
const { outputText } = ts.transpileModule(`
import React, { useEffect, useMemo, useRef, useState } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
const useDispatch = () => () => { throw new Error('SSR must not save Library items'); };
${componentSource}
export const saveHarness = (file, persist) => {
    let result = file, saveState = null, error = '';
    const savePending = { current: false }, actions = [];
    const setSaveState = state => { saveState = state; };
    const setError = value => { error = value; };
    const addToLibrary = payload => payload;
    const dispatch = payload => { actions.push(payload); return { unwrap: () => persist(payload) }; };
    const save = ${saveHandler};
    return { save, actions, state: () => ({ saveState, error, pending: savePending.current }),
        replace: file => { result = file; }, isSaved: () => saveState?.file === result && saveState.status === 'saved' };
};
export const resetTools = state => {
    const initialVideoUtilsState = {};
    ${reset.getText(tree)}
    return state;
};`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Audio Extractor accepts both audio and video and explains local WAV extraction', () => {
    const html = renderToStaticMarkup(React.createElement(api.AudioExtractorPanel, { active: true }));
    assert.match(html, /aria-label="Audio extractor"/);
    assert.match(html, /accept="audio\/\*,video\/\*/);
    assert.match(html, /first audio track/);
    assert.match(html, /WAV PCM16/);
    assert.match(html, /Clear audio/);
    assert.match(html, /Choose audio\/video from Library/);
    assert.doesNotMatch(html, /Download WAV/, 'No downloadable result is shown before extraction.');
    assert.doesNotMatch(html, /Save to Library/, 'Only a finished WAV can be saved.');
});

test('Save to Library stores the exact extracted WAV as a durable audio reference, once per result', async () => {
    const file = new File([new Uint8Array([0, 2, 127, 255])], 'source-0.200-0.800.wav', { type: 'audio/wav' });
    const harness = api.saveHarness(file, async () => {});
    await harness.save();
    const [payload] = harness.actions;
    assert.equal(payload.name, 'source-0.200-0.800');
    assert.equal(payload.mediaType, 'tts-reference');
    assert.equal(payload.assetBlobs.media, file);
    assert.equal(payload.media, '', 'No ephemeral URL or base64 copy is persisted.');
    assert.match(payload.thumbnail, /^data:image\/svg\+xml;base64,/);
    assert.deepEqual(payload.tags, ['audio-extractor', 'wav']);
    assert.ok(harness.isSaved());
    await harness.save();
    assert.equal(harness.actions.length, 1);
});

test('failed Library saves show an error and can be retried without losing the extracted WAV', async () => {
    let attempts = 0;
    const file = new File(['WAV'], 'excerpt.wav', { type: 'audio/wav' });
    const harness = api.saveHarness(file, async () => { if (++attempts === 1) throw new Error('Storage full'); });
    await harness.save();
    assert.match(harness.state().error, /excerpt.wav.*Storage full/);
    assert.equal(harness.state().pending, false);
    assert.equal(harness.isSaved(), false);
    await harness.save();
    assert.equal(harness.state().error, '');
    assert.ok(harness.isSaved());
    assert.equal(harness.actions[1].assetBlobs.media, file);
});

test('pending saves reject double clicks and cannot mark a later extraction as saved', async () => {
    let finish;
    const first = new File(['first'], 'first.wav', { type: 'audio/wav' });
    const second = new File(['second'], 'second.wav', { type: 'audio/wav' });
    const harness = api.saveHarness(first, () => new Promise(resolve => { finish = resolve; }));
    const pending = harness.save();
    await harness.save();
    assert.equal(harness.actions.length, 1);
    harness.replace(second);
    finish();
    await pending;
    assert.equal(harness.isSaved(), false);
    assert.equal(harness.state().saveState.file, first);
    assert.equal(harness.state().pending, false);
    harness.replace(null);
    await harness.save();
    assert.equal(harness.actions.length, 1);
});

test('Library import reads only the selected original audio/video and participates in cancellation', () => {
    assert.match(componentSource, /hydrateMedia=\{false\} filter=\{\['video', 'audio-tts', 'tts-reference'\]\}/);
    assert.match(componentSource, /readLibraryMediaFile\(item, \['audio', 'video'\], signal\)/);
    assert.match(componentSource, /controller\.current\?\.abort\(\); setLibraryOpen\(false\)/);
    assert.ok(componentSource.indexOf('setLibraryOpen(false);') < componentSource.indexOf('await decodeMediaAudio('), 'Show decoding progress and Cancel outside the picker.');
});

test('Tools exposes Audio Extractor and reset remounts its workspace without changing generation state', () => {
    const tools = readFileSync(new URL('./VideoUtilsPanel.tsx', import.meta.url), 'utf8');
    assert.match(tools, /id: 'audio-extractor', label: 'Audio Extractor'/);
    assert.match(tools, /<AudioExtractorPanel key=\{audioExtractorResetVersion\} active=\{activeSubTab === 'audio-extractor'\}/);
    const state = { videoUtilsState: { old: true }, audioExtractorResetVersion: 0, videoMergeResetVersion: 0, referenceMakerResetVersion: 0, videoStartFrame: 'keep' };
    api.resetTools(state);
    assert.equal(state.audioExtractorResetVersion, 1);
    assert.equal(state.videoMergeResetVersion, 1);
    assert.equal(state.referenceMakerResetVersion, 1);
    assert.equal(state.videoStartFrame, 'keep');
});
