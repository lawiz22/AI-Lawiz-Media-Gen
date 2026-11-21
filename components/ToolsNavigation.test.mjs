import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const app = read('../App.tsx'), tools = read('./VideoUtilsPanel.tsx');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const declaration = (text, name) => {
    const tree = ts.createSourceFile('source.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) found = `const ${node.getText(tree)};`;
        ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(found, `Missing ${name}`); return found;
};
const reactURL = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const navigation = await import(compile(`import React from '${reactURL}';
    ${declaration(tools, 'SubTabs')}
    ${declaration(tools, 'subTabs')}
    export { SubTabs, subTabs };
`));
test('Tools includes Outpaint and Upscale alongside every existing utility', () => {
    assert.deepEqual(navigation.subTabs.map(tab => tab.id), ['frames', 'clips', 'audio-extractor', 'merge', 'reference-maker', 'colors', 'resize-crop', 'outpaint', 'upscale', 'voice-recorder']);
    for (const activeTab of ['outpaint', 'upscale']) {
        const html = renderToStaticMarkup(React.createElement(navigation.SubTabs, { tabs: navigation.subTabs, activeTab, onTabClick() {} }));
        assert.ok(html.includes('role="tablist" aria-label="Tools"'));
        assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
        assert.match(html, new RegExp(`aria-selected="true"[^>]*>${activeTab === 'outpaint' ? 'Outpaint' : 'Upscale'}</button>`));
    }
});
test('moved panels exist once under Tools; Upscale retains both existing child workflows', () => {
    const start = app.indexOf("<TabActivity mode={activeTab === 'video-utils'");
    const end = app.indexOf("<TabActivity mode={activeTab === 'video' ||", start);
    assert.ok(start > 0 && end > start);
    const workspace = app.slice(start, end);
    for (const [id, component] of [['outpaint', 'OutpaintPanel'], ['upscale', 'UpscalePanel']]) {
        assert.ok(!app.includes(`{ id: '${id}', label:`), `${id} must not be a root tab`);
        assert.equal((app.match(new RegExp(`<${component}\\b`, 'g')) || []).length, 1);
        assert.ok(workspace.includes(`activeVideoUtilsSubTab === '${id}' ? 'visible' : 'hidden'`));
        assert.ok(workspace.includes(`<${component}`));
    }
    const upscale = read('./UpscalePanel.tsx');
    assert.ok(upscale.includes('Upscale SeedVR2')); assert.ok(upscale.includes('Z-Image Creative Upscale'));
    assert.ok(!app.includes("setActiveTab('upscale')"));
    assert.ok(!app.includes("activeTab === 'outpaint'"));
});
const actions = await import(compile(`
    export const setup = (activeVideoUtilsSubTab) => {
        const activeTab = 'video-utils', calls = [];
        let sourceFile = 'existing', versions = {};
        const dispatch = action => calls.push(action), useCallback = fn => fn;
        const setActiveTab = id => ({ type: 'root', id }), setActiveVideoUtilsSubTab = id => ({ type: 'tool', id });
        const resetVideoUtilsState = () => ({ type: 'reset-legacy' });
        const setUpscaleSourceFile = file => { sourceFile = file; };
        const setPanelResetVersions = fn => { versions = fn(versions); };
        ${declaration(app, 'activePanelResetKey')}
        ${declaration(app, 'handleSendToUpscale')}
        ${declaration(app, 'handleActivePanelReset')}
        return { send: handleSendToUpscale, reset: handleActivePanelReset, calls, source: () => sourceFile, versions: () => versions };
    };
`));
test('image/Library transfers select Tools > Upscale and retain the uploaded source', async t => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(new Blob(['reference'], { type: 'image/png' }));
    t.after(() => { globalThis.fetch = original; });
    const state = actions.setup('frames');
    await state.send('data:image/png;base64,abc', 'reference.png');
    assert.deepEqual(state.calls, [{ type: 'tool', id: 'upscale' }, { type: 'root', id: 'video-utils' }]);
    assert.equal(state.source().name, 'reference.png'); assert.equal(await state.source().text(), 'reference');
});
test('Reset targets only the active image tool and preserves legacy utility reset behavior', () => {
    for (const active of ['outpaint', 'upscale', 'frames']) {
        const state = actions.setup(active); state.reset();
        assert.deepEqual(state.versions(), { [active === 'frames' ? 'video-utils' : active]: 1 });
        assert.equal(state.source(), active === 'upscale' ? null : 'existing');
        assert.deepEqual(state.calls, active === 'frames' ? [{ type: 'reset-legacy' }] : []);
    }
});
