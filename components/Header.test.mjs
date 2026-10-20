import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const compile = source => {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const serviceUrl = compile(readFileSync(new URL('../services/comfyMemoryService.ts', import.meta.url), 'utf8'));
const controlsUrl = compile(`
    import React, { useState, useEffect, useRef } from '${reactUrl}';
    import { COMFY_MEMORY_ACTIONS, requestComfyMemoryRelease } from '${serviceUrl}';
    const CubeIcon = () => React.createElement('svg', { 'data-icon': 'model' });
    const TrashIcon = () => React.createElement('svg', { 'data-icon': 'cache' });
    const SpinnerIcon = () => null, CloseIcon = () => null;
    ${readFileSync(new URL('./ComfyMemoryActions.tsx', import.meta.url), 'utf8').replace(/^import .*;$/gm, '')}
`);
const headerSource = readFileSync(new URL('./Header.tsx', import.meta.url), 'utf8');
const iconNames = headerSource.match(/import \{ ([^}]+) \} from '\.\/icons'/)[1].split(',').map(name => name.trim());
const { Header } = await import(compile(`
    import React, { useState, useEffect, useRef } from '${reactUrl}';
    import { ComfyMemoryActions } from '${controlsUrl}';
    const Banner = () => null, Logo = () => null, SystemMetricsIndicators = () => null;
    const getTabAccentStyle = () => ({});
    ${iconNames.map(name => `const ${name} = () => null;`).join('\n')}
    ${headerSource.replace(/^import .*;$/gm, '')}
`));

const props = {
    theme: 'dark', projectName: 'Test project', currentUser: { name: 'Test user' }, provider: 'comfyui',
    activeTab: 'video', versionInfo: null, driveFolder: null, isDriveSyncing: false,
    isDriveConfigured: false, isOllamaConnected: false,
    sessionTokenUsage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
};

test('Header renders exactly two native memory controls only when ComfyUI is positively online', () => {
    for (const connected of [null, false, true]) {
        const html = renderToStaticMarkup(React.createElement(Header, { ...props, isComfyUIConnected: connected }));
        assert.equal(html.includes('aria-label="ComfyUI memory controls"'), connected === true);
        assert.equal(html.includes('aria-label="Clear VRAM / unload models"'), connected === true);
        assert.equal(html.includes('aria-label="Free model and node cache"'), connected === true);
        if (connected === true) {
            assert.equal((html.match(/aria-label="Clear VRAM \/ unload models"/g) || []).length, 1);
            assert.equal((html.match(/aria-label="Free model and node cache"/g) || []).length, 1);
            assert.match(html, /Keeps the node execution cache/);
            assert.match(html, /Does not delete model files/);
            assert.doesNotMatch(html, /request accepted/);
        }
    }
});

test('memory shortcuts sit below the right-hand actions, with distinct icons, hover explanations and no visible labels', () => {
    const html = renderToStaticMarkup(React.createElement(Header, { ...props, isComfyUIConnected: true }));
    const tree = ts.createSourceFile('Header.tsx', headerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let controls;
    const visit = node => {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'ComfyMemoryActions') controls = node;
        ts.forEachChild(node, visit);
    };
    visit(tree);
    let column = controls.parent;
    while (!ts.isJsxElement(column)) column = column.parent;
    assert.match(column.openingElement.getText(tree), /flex-col items-end/);
    assert.match(column.parent.openingElement.getText(tree), /ml-auto/);
    const mainRow = column.children.find(node => ts.isJsxElement(node));
    assert.match(mainRow.openingElement.getText(tree), /aria-label="Header actions"/);
    assert.ok(mainRow.end < controls.pos);
    for (let ancestor = column; ancestor; ancestor = ancestor.parent) {
        if (ts.isJsxElement(ancestor)) assert.doesNotMatch(ancestor.openingElement.getText(tree), /\bhidden\b/);
    }
    const modelButton = html.match(/<button[^>]*aria-label="Clear VRAM \/ unload models"[^>]*>[\s\S]*?<\/button>/)[0];
    const cacheButton = html.match(/<button[^>]*aria-label="Free model and node cache"[^>]*>[\s\S]*?<\/button>/)[0];
    for (const button of [modelButton, cacheButton]) {
        assert.equal(button.replace(/<[^>]*>/g, '').trim(), '');
        assert.match(button, /title="[^"]+/);
        assert.match(button, /aria-hidden="true"/);
        assert.match(button, /h-7 w-7/);
        assert.match(button, /focus-visible:ring-2/);
    }
    assert.match(modelButton, /data-icon="model"/);
    assert.match(cacheButton, /data-icon="cache"/);
});
