import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./H3AudioReference.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('H3AudioReference.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let apply;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'apply') apply = node.initializer;
    ts.forEachChild(node, visit);
};
visit(tree);
const { outputText } = ts.transpileModule(`
    import React, { useEffect, useId, useMemo, useRef, useState } from '${pathToFileURL(require.resolve('react')).href}';
    const useMediaURL = () => 'blob:original';
    const referenceToken = () => '[audio1]';
    const PauseIcon = () => null, PlayIcon = () => null, VolumeIcon = () => null;
    ${source.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export const applyPassage = (target, next) => {
        let error = '', output;
        const decoded = {}, reference = {original:{name:'source.wav'}};
        const setError = value => {error = value;}, stop = () => {}, setSelection = () => {};
        const encodeAudioWav = () => new Uint8Array([1,2,3]);
        const onApply = (file, selection) => {output = {file, selection};};
        (${apply.getText(tree)})(next);
        return {error, output};
    };
`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('shared waveform exposes seek controls in five-second increments for Audio-Sync and H3', () => {
    const original = new File(['audio'], 'original.wav', { type: 'audio/wav' });
    const html = renderToStaticMarkup(React.createElement(api.H3AudioReference, {
        reference: { id: 'audio', kind: 'audio', slot: 1, file: original, original, note: '' },
        videoDuration: 5, target: 'Audio-Sync', onApply() {},
    }));
    assert.ok(html.includes('Back 5 seconds [audio1]'));
    assert.ok(html.includes('Forward 5 seconds [audio1]'));
    assert.ok(html.includes('Seek original [audio1]'));
    assert.ok(html.includes('Volume original [audio1]'));
});

test('Audio-Sync does not inherit H3 or prompt-provider passage duration caps', () => {
    assert.match(api.applyPassage('H3', { start: 0, end: 61 }).error, /at most 60/);
    assert.match(api.applyPassage('prompt', { start: 0, end: 121 }).error, /at most 120/);
    const result = api.applyPassage('Audio-Sync', { start: 5, end: 130 });
    assert.equal(result.error, '');
    assert.equal(result.output.file.type, 'audio/wav');
    assert.deepEqual(result.output.selection, { start: 5, end: 130 });
    assert.match(api.applyPassage('prompt', { start: 0, end: 0.5 }).error, /at least one second/);
});
