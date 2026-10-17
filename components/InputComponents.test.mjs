import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./InputComponents.tsx', import.meta.url), 'utf8')
    .replace("'react'", JSON.stringify(pathToFileURL(require.resolve('react')).href));
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
});
const { PresetTextInput } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const options = ['None (same as photo)', 'close-up', 'front view', 'back view'];
const render = (value, disabled = false) => renderToStaticMarkup(React.createElement(PresetTextInput, {
    label: 'Camera Angle', ariaLabel: 'Camera Angle for Output 1', value, options, onChange: () => {}, disabled,
}));

test('preset selectors expose all options even when a populated value is selected', () => {
    const html = render('close-up');
    assert.match(html, /<select[^>]*aria-label="Camera Angle for Output 1"/);
    assert.match(html, /<option value="close-up" selected="">/);
    for (const option of options) assert.ok(html.includes(`value="${option}"`));
    assert.match(html, /<option value="">Default \(nothing\)<\/option>/);
    assert.match(html, /<option value="__custom__">Custom\.\.\.<\/option>/);
    assert.doesNotMatch(html, /<datalist|list=/);
    assert.doesNotMatch(html, /<input/);
});

test('existing custom instructions remain editable alongside the complete preset list', () => {
    const html = render('orbit 135 degrees');
    assert.match(html, /<option value="__custom__" selected="">/);
    assert.match(html, /aria-label="Custom Camera Angle for Output 1"/);
    assert.match(html, /value="orbit 135 degrees"/);
    for (const option of options) assert.ok(html.includes(`value="${option}"`));
});

test('empty and same-as-photo values remain distinct supported choices', () => {
    assert.match(render(''), /<option value="" selected="">Default \(nothing\)/);
    assert.match(render('None (same as photo)'), /<option value="None \(same as photo\)" selected="">/);
});

test('disabled custom controls disable both the preset selector and the text input', () => {
    assert.equal((render('custom view', true).match(/disabled=""/g) || []).length, 2);
    assert.equal((render('close-up', true).match(/disabled=""/g) || []).length, 1);
});
