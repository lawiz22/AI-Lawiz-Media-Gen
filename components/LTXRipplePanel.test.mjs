import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { uiModules } from './ui/compileForTest.mjs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const reactURL = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const helpersURL = compile(read('../services/minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(read('../services/ltxRippleWorkflow.ts')
    .replace("import template from '../assets/ltxRippleFFAFWorkflow.json';", `const template = ${read('../assets/ltxRippleFFAFWorkflow.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`));
const workflow = await import(workflowURL);
const source = read('./LTXRipplePanel.tsx');
const component = await import(compile(`
    import React, { useEffect, useRef, useState } from '${reactURL}';
    import { defaultRippleDraft, defaultRippleSettings, fitRippleToSource, rippleSourceFrameLimit, rippleNumber, rippleResolution, RIPPLE_TEMPLATE } from '${workflowURL}';
    import { h3Choices, h3Input, isRecord } from '${helpersURL}';
    import { Accordion } from '${uiModules.Accordion}';
    import { Select } from '${uiModules.Select}';
    import { NumberField } from '${uiModules.fields}';
    import { PromptBox } from '${uiModules.PromptBox}';
    import { ui } from '${uiModules.styles}';
    const familyFiles = names => names, useModelInventory = () => ({ inventory: { items: [] } });
    const useDispatch = () => () => {}, useMediaURL = () => '';
    const LibraryPickerModal = () => null, VideoOutputFrames = () => null;
    ${source.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export { groups, Accordion };
`));
const render = ready => renderToStaticMarkup(React.createElement(component.LTXRipplePanel, {
    ready, onDraftChange() {}, onSettingsChange() {}, onLibraryItemLoaded() {},
}));
test('Ripple panel uses original defaults, independent video/image inputs and shared video actions', () => {
    const html = render(true);
    for (const label of ['LTX-Ripple-FFAF', 'Edited first frame (required)', 'Source video (required)', 'Ripple editing prompt',
        '864 x 480', '217 frames', '24 FPS', '132644', 'Generate LTX-Ripple-FFAF', 'Check nodes and models',
        'Export API workflow', 'Save setup to Library', 'Additional LoRAs (4 optional slots)', 'CacheDiT and attention optimizations']) assert.ok(html.includes(label), label);
    assert.ok(html.includes('Randomize seed'));
    assert.ok(!html.includes('<select'), 'Closed accordions must not construct large model/LoRA menus');
    assert.ok(html.includes('comparison is silent'));
    assert.ok(html.includes('prompt is sent unchanged'));
    assert.ok(!html.includes('Cancel this operation'), 'Cancel is displayed only for active operations');
});
test('all editable graph nodes have accordion controls or a dedicated seed control', () => {
    const covered = new Set(component.groups.flatMap(group => group.ids).concat(['1232']));
    for (const [id, fields] of Object.entries(workflow.defaultRippleSettings().nodes)) {
        if (Object.keys(fields).length) assert.ok(covered.has(id), `Missing UI fields for ${id}`);
    }
});
test('accordions are genuinely lazy and workspace loading locks editing', () => {
    let called = false;
    renderToStaticMarkup(React.createElement(component.Accordion, { title: 'LoRAs', children: () => { called = true; throw new Error('Must not construct model menus'); } }));
    assert.equal(called, false);
    assert.match(render(false), /<fieldset disabled=""/);
    assert.match(source, /Cancel this operation/);
    assert.ok(source.indexOf('</fieldset>') < source.indexOf('Cancel this operation'));
});
test('extension checkbox defaults off and source duration/limit are visible without opening advanced controls', () => {
    const input = { ...workflow.defaultRippleDraft(), video: new File(['video'], 'short.mp4', { type: 'video/mp4' }), videoDuration: 5 };
    const settings = workflow.fitRippleToSource(workflow.defaultRippleSettings(), 5, true);
    const html = renderToStaticMarkup(React.createElement(component.LTXRipplePanel, { ready: true, draft: input, settings, onDraftChange() {}, onSettingsChange() {}, onLibraryItemLoaded() {} }));
    assert.match(html, /aria-label="Allow extra frames" type="checkbox"/);
    assert.ok(!html.includes('checked=""'));
    assert.ok(html.includes('Source: 5.000s / up to 113 LTX frames'));
    assert.ok(html.includes('113 frames'));
    assert.ok(html.includes('extension requires this checkbox'));
});
const declaration = name => {
    const tree = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let result;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) result = `const ${name} = ${node.initializer.getText(tree)};`;
        ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(result, `Missing ${name}`); return result;
};
test('actual input handler blocks extension, permits shortening and refits FPS/skip/stride edits', async () => {
    const api = await import(compile(`
        import { fitRippleToSource, rippleSourceFrameLimit, rippleNumber } from '${workflowURL}';
        export const run = (settings, id, name, value) => {
            const latestSettings = { current: settings }, latestDraft = { current: { videoDuration: 5 } };
            const errors = [], updates = [], report = cause => errors.push(cause.message), onSettingsChange = value => updates.push(value), setError = () => {};
            ${declaration('setValue')}
            setValue(id, name, value);
            return { errors, updates };
        };
    `));
    const settings = workflow.fitRippleToSource(workflow.defaultRippleSettings(), 5, true);
    const denied = api.run(settings, '937', 'value', 217);
    assert.equal(denied.updates.length, 0);
    assert.match(denied.errors[0], /Enable Allow extra frames/);
    assert.equal(api.run(settings, '937', 'value', 97).updates[0].nodes['937'].value, 97);
    assert.equal(api.run(settings, '936', 'value', 30).updates[0].nodes['937'].value, 145);
    assert.equal(api.run(settings, '790', 'skip_first_frames', 24).updates[0].nodes['937'].value, 89);
    assert.equal(api.run(settings, '790', 'select_every_nth', 2).updates[0].nodes['937'].value, 57);
    settings.nodes['937'].value = 97;
    assert.equal(api.run(settings, '936', 'value', 30).updates[0].nodes['937'].value, 97);
    settings.allowExtraFrames = true;
    assert.equal(api.run(settings, '937', 'value', 217).updates[0].nodes['937'].value, 217);
});
test('actual metadata handler fits uploads, clamps legacy drafts and preserves shortened saved setups', async () => {
    const api = await import(compile(`
        import { fitRippleToSource } from '${workflowURL}';
        export const run = async (settings, upload, cachedDuration, stale = false) => {
            const video = new File(['video'], 'short.mp4', { type: 'video/mp4' });
            const draft = { video, videoDuration: cachedDuration }, abort = new AbortController();
            const latestDraft = { current: { ...draft } }, latestSettings = { current: settings }, newVideo = { current: upload ? video : null };
            let probeCount = 0, updatedDraft, updatedSettings;
            const readVideoDuration = async () => { probeCount++; if (stale) latestDraft.current.video = null; return 5; };
            const onDraftChange = value => { updatedDraft = value; }, onSettingsChange = value => { updatedSettings = value; };
            ${declaration('measure')}
            await measure();
            return { probeCount, updatedDraft, updatedSettings };
        };
    `));
    const settings = workflow.defaultRippleSettings();
    settings.nodes['937'].value = 97;
    const uploaded = await api.run(settings, true);
    assert.equal(uploaded.probeCount, 1);
    assert.equal(uploaded.updatedDraft.videoDuration, 5);
    assert.equal(uploaded.updatedSettings.nodes['937'].value, 113);
    const restored = await api.run(settings, false, 5);
    assert.equal(restored.probeCount, 0);
    assert.equal(restored.updatedSettings.nodes['937'].value, 97);
    const legacy = await api.run(workflow.defaultRippleSettings(), false);
    assert.equal(legacy.updatedSettings.nodes['937'].value, 113);
    const stale = await api.run(settings, true, undefined, true);
    assert.equal(stale.updatedDraft, undefined);
    assert.equal(stale.updatedSettings, undefined);
});
