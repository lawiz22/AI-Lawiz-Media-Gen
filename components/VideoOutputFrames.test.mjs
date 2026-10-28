import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./VideoOutputFrames.tsx', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const tree = ts.createSourceFile('VideoOutputFrames.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let capture;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'capture') capture = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(capture);
const { outputText } = ts.transpileModule(`
import React, { useEffect, useRef, useState } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
const useDispatch = () => () => {};
${source}
export const harness = (target = null, fail = false, playerTime = target) => {
    let seconds = target, error = '', working = false, saved;
    const calls = [], actions = [], downloads = [];
    const result = { videoBlob: new Blob(['corrected video'], { type: 'video/mp4' }), videoUrl: 'http://localhost:8188/view?filename=output.mp4' };
    const blocked = false, controller = { current: null }, source = { current: null }, frame = { current: null };
    const video = { current: { currentTime: playerTime, pause: () => {} } };
    const setSeconds = value => { seconds = value; };
    const setError = value => { error = value; };
    const setWorking = value => { working = value; };
    const setSaved = value => { saved = value; };
    const extractVideoFrame = async (file, time, signal) => {
        calls.push({ file, time });
        if (fail) throw new Error('Decoder unavailable');
        signal.throwIfAborted();
        return new File(['original PNG bytes'], time === null ? 'last-frame.png' : 'selected-frame.png', { type: 'image/png' });
    };
    const fileToDataUrl = async () => 'data:image/png;base64,UE5H';
    const dataUrlToThumbnail = async (data, size) => { if (size !== 512) throw Error('Wrong thumbnail size'); return data; };
    const addToLibrary = payload => payload;
    const dispatch = payload => { actions.push(payload); return { unwrap: async () => {} }; };
    const window = { location: { href: 'http://localhost:3000/' }, setTimeout: callback => callback() };
    const document = { createElement: () => {
        const anchor = { click: () => downloads.push(anchor.download) }; return anchor;
    } };
    const save = ${capture};
    return { save, calls, actions, downloads, result, state: () => ({ error, working, saved, seconds }) };
};`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('output player exposes a frame selector, last-frame shortcut, download and Library save by default', () => {
    const html = renderToStaticMarkup(React.createElement(api.VideoOutputFrames, {
        result: { videoUrl: 'http://localhost:8188/view?filename=test.mp4' }, url: 'blob:video', disabled: false,
    }));
    assert.match(html, /Output frame position \(s\)/);
    assert.match(html, />Last frame</);
    assert.match(html, />Save last frame</);
    assert.match(html, /Save last frame to Library/);
    assert.match(html, /Last frame selected/);
    assert.match(source, /'Save this frame'/);
    assert.match(source, /'Save this frame to Library'/);
});

test('frame downloads and Library saves share the original full-resolution PNG, not a preview screenshot', async () => {
    const harness = api.harness();
    await harness.save(false);
    await harness.save(true);
    assert.deepEqual(harness.downloads, ['last-frame.png']);
    assert.equal(harness.calls.length, 1, 'Reuse an already decoded frame.');
    assert.equal(harness.calls[0].time, null);
    assert.equal(await harness.calls[0].file.text(), 'corrected video');
    assert.equal(harness.actions[0].mediaType, 'extracted-frame');
    assert.equal(await harness.actions[0].assetBlobs.media.text(), 'original PNG bytes');
    assert.equal(harness.actions[0].media, '');
    assert.ok(harness.actions[0].tags.includes('last-frame'));
    assert.equal(harness.state().saved, null);
});

test('selected-frame save snapshots the current player position even between timeupdate events', async () => {
    const harness = api.harness(0.5, false, 0.625);
    await harness.save(true);
    assert.equal(harness.calls[0].time, 0.625);
    assert.equal(harness.state().seconds, 0.625);
    assert.equal(harness.state().saved, 0.625);
    assert.ok(harness.actions[0].tags.includes('time-0.625s'));
});

test('decoder errors are visible, clear working state and never create a Library image', async () => {
    const harness = api.harness(null, true);
    await harness.save(true);
    assert.match(harness.state().error, /Decoder unavailable/);
    assert.equal(harness.state().working, false);
    assert.equal(harness.actions.length, 0);
});

test('the shared normal, Ultrafast and Advanced result surface uses the new player and retains copy-to-Picture-1', () => {
    const panel = readFileSync(new URL('./MinimaxH3Panel.tsx', import.meta.url), 'utf8');
    assert.match(panel, /<VideoOutputFrames key=\{result.promptId\} result=\{result\} url=\{resultUrl\}/);
    assert.match(panel, /Copy last frame to Picture 1/);
});
