import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./CharacterSwapComparison.tsx', import.meta.url), 'utf8')
    .replace(/^import React.*;\r?$/m, `import React, { useEffect, useRef, useState } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};`)
    .replace(/^import .*characterSwapService.*;\r?$/m, `const swapVideoURL = (base, video) => base + '/view?' + new URLSearchParams(video);`);
const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
} }).outputText;
const { CharacterSwapComparison } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const result = { filename: 'result.mp4', subfolder: 'swap', type: 'output' };
const render = props => renderToStaticMarkup(React.createElement(CharacterSwapComparison, props));

test('partial assemblies never guess source alignment from the edited plan', () => {
    const html = render({ base: 'http://server', videos: [result], plan: { video: 'source.mp4', start_f: 120, fps: 24 } });
    assert.match(html, /Assembled result/);
    assert.match(html, /Source alignment cannot be verified/);
    assert.equal((html.match(/<video/g) || []).length, 1);
    assert.match(html, /aria-label="Before after comparison" disabled=""/);
    assert.match(html, /Download result/);
});
test('completed render uses its saved source and exposes native comparison export', () => {
    const html = render({
        base: 'http://server', videos: [result, { ...result, filename: 'compare.mp4' }],
        plan: { video: 'inputs/source.mp4', start_f: 120, fps: 24 }, sourceRangeVerified: true,
    });
    assert.equal((html.match(/<video/g) || []).length, 2);
    assert.match(html, /Before \/ after/);
    assert.match(html, /filename=source.mp4/);
    assert.match(html, /subfolder=inputs/);
    assert.match(html, /Download comparison video/);
    assert.doesNotMatch(html, /aria-label="Before after comparison" disabled/);
});
test('a native aligned guide is usable without guessing a source range', () => {
    const html = render({
        base: 'http://server', videos: [result, { ...result, filename: 'compare.mp4' }, { ...result, filename: 'guide.mp4' }],
        plan: { video: 'wrong-source.mp4' },
    });
    assert.equal((html.match(/<video/g) || []).length, 2);
    assert.match(html, /filename=guide.mp4/);
    assert.doesNotMatch(html, /filename=wrong-source.mp4/);
});
