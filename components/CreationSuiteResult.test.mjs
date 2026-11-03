import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const reactURL = pathToFileURL(require.resolve('react')).href;
const source = readFileSync(new URL('./CreationSuiteResult.tsx', import.meta.url), 'utf8');
const code = `
    import React, { useEffect, useRef, useState } from '${reactURL}';
    const Icon = () => React.createElement('svg', { 'aria-hidden': true });
    const CheckIcon = Icon, CloseIcon = Icon, DownloadIcon = Icon, SaveIcon = Icon, SpinnerIcon = Icon, ZoomIcon = Icon;
    const SendToLTXButton = () => React.createElement('button', { 'aria-label': 'Send image to LTX Director' });
    ${source.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`;
const { outputText } = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const { CreationSuiteResult } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const render = (busy = false) => renderToStaticMarkup(React.createElement(CreationSuiteResult, {
    src: 'result.png', title: 'Scene Creation result', alt: 'scene output', busy, onDownload() {}, onSave: async () => true,
}));
test('result actions overlay the photo at the top-right with zoom, download, Library and LTX controls', () => {
    const html = render();
    assert.ok(html.includes('absolute right-2 top-2'));
    for (const label of ['Open Scene Creation result', 'Zoom Scene Creation result', 'Download Scene Creation result', 'Save Scene Creation result to Library', 'Send image to LTX Director']) assert.ok(html.includes(label), label);
    assert.ok(html.includes('cursor-zoom-in')); assert.ok(!html.includes('role="dialog"'));
});
test('hover actions also reveal on keyboard focus and remain visible on touch devices', () => {
    const html = render();
    for (const style of ['md:group-hover:opacity-100', 'md:group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100']) assert.ok(html.includes(style), style);
});
test('busy results prevent save/download/transfers without blocking image inspection', () => {
    const html = render(true);
    assert.match(html, /aria-label="Download Scene Creation result" disabled=""/);
    assert.match(html, /aria-label="Save Scene Creation result to Library" disabled=""/);
    assert.ok(!html.includes('Send image to LTX Director'));
    assert.match(html, /aria-label="Zoom Scene Creation result"><svg/);
});
