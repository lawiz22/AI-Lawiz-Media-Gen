import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { uiModules } from './ui/compileForTest.mjs';

const require = createRequire(import.meta.url), source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const reactURL = pathToFileURL(require.resolve('react')).href;
const helpers = compile(source('../services/minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(source('../services/clothesSwitcherWorkflow.ts')
    .replace("import template from '../assets/clothesSwitcherWorkflow.json';", `const template = ${source('../assets/clothesSwitcherWorkflow.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`));
const componentSource = source('./ClothesSwitcherPanel.tsx');
const component = await import(compile(`
    import React, { useEffect, useRef, useState } from '${reactURL}';
    import { defaultClothesSwitcherSettings } from '${workflowURL}';
    import { Accordion } from '${uiModules.Accordion}';
    import { Select } from '${uiModules.Select}';
    import { NumberField } from '${uiModules.fields}';
    import { PromptBox } from '${uiModules.PromptBox}';
    import { ui } from '${uiModules.styles}';
    const familyFiles = names => names, flux2Family = () => 'flux2', useModelInventory = () => ({ inventory: { items: [] } });
    const useDispatch = () => () => {}, useSelector = selector => selector({generation:{isLoading:false},library:{items:[]}}), useMediaURL = () => '', useUnmountCleanup = () => () => {}, useDraftAutosave = () => {};
    const LibraryPickerModal = () => null, ResultImage = () => null, PresetSaveModal = () => null, ConfirmationModal = () => null, SaveIcon = () => null, TrashIcon = () => null;
    ${componentSource.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export { Accordion };
`));
const render = () => renderToStaticMarkup(React.createElement(component.ClothesSwitcherPanel, { isComfyUIConnected: true, onModelChange() {} }));
test('Clothes Switcher puts photo/options left and verbatim prompt/generation/previews right', () => {
    const html = render(), left = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    const right = html.slice(html.indexOf('aria-label="Clothes Switcher prompt and generation"'));
    assert.ok(html.includes('lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]'));
    for (const text of ['Original photo', 'Models and encoders', 'LoRAs - up to four', 'CacheDiT acceleration', 'Sampling and seed', 'Resize, Depth Anything V2 and Canny', 'Negative prompt and output',
        'Check workflow', 'Export API workflow', 'Save setup to Library', 'Load setup from Library']) assert.ok(left.includes(text), text);
    for (const text of ['Clothes Switcher prompt', 'Generate Clothes Switcher', 'Depth Anything V2 - depth map', 'Canny - edge map']) assert.ok(right.includes(text), text);
    assert.ok(!left.includes('aria-label="Clothes Switcher prompt"'));
    assert.match(html, /<textarea[^>]*aria-label="Clothes Switcher prompt"[^>]*><\/textarea>/);
});
test('header exposes the Image Generator-style named parameter preset manager', () => {
    const html = render();
    assert.ok(html.includes('aria-label="Clothes Switcher preset"')); assert.ok(html.includes('Load Preset...'));
    assert.ok(html.includes('aria-label="Save Clothes Switcher preset"'));
    assert.ok(componentSource.includes('<PresetSaveModal')); assert.ok(componentSource.includes('<ConfirmationModal'));
    assert.ok(componentSource.includes('deleteFromLibrary(Number(selectedPresetId))'));
    assert.ok(componentSource.includes("item.clothesSwitcherOptions?.kind === 'parameters'"));
});
test('hydration locks inputs and all advanced menus are lazy/collapsed', () => {
    const html = render(); assert.match(html, /<fieldset disabled=""/);
    assert.ok(!html.includes('aria-label="Diffusion model: unet name"'));
    let called = false;
    renderToStaticMarkup(React.createElement(component.Accordion, { title: 'Models', children: () => { called = true; throw new Error('Hidden menu rendered'); } }));
    assert.equal(called, false);
});
test('both previews show their actual node outputs independently', () => {
    const html = renderToStaticMarkup(React.createElement(component.ClothesSwitcherPreviews, { live: { depthUrl: 'depth.png', cannyUrl: 'edges.png' } }));
    assert.match(html, /src="depth.png" alt="Depth Anything V2 - depth map"/);
    assert.match(html, /src="edges.png" alt="Canny - edge map"/);
    assert.ok(!html.includes('Appears when'));
    const partial = renderToStaticMarkup(React.createElement(component.ClothesSwitcherPreviews, { live: { depthUrl: 'early-depth.png' } }));
    assert.ok(partial.includes('early-depth.png')); assert.ok(partial.includes('Appears when'));
});
test('final comparison uses the original photo and output with an accessible wipe control', () => {
    const html = renderToStaticMarkup(React.createElement(component.ClothesSwitcherComparison, { before: 'original.png', after: 'result.png' }));
    assert.match(html, /src="result.png" alt="Comparison result"/);
    assert.match(html, /src="original.png" alt="Comparison original"/);
    assert.ok(html.includes('clip-path:inset(0 50% 0 0)'));
    assert.ok(html.includes('aria-label="Clothes Switcher before after comparison"')); assert.ok(html.includes('value="50"'));
    assert.ok(html.includes('object-contain')); assert.ok(!html.includes('object-cover'));
});
test('workspace keeps Clothes Switcher separate and routes its Library snapshots away from legacy variation', () => {
    const workspace = source('./SceneVariationWorkspace.tsx'), app = source('../App.tsx'), library = source('./LibraryPanel.tsx');
    assert.ok(workspace.includes("'clothes-switcher'")); assert.ok(workspace.includes('props.pendingPreset.clothesSwitcherOptions'));
    assert.match(workspace, /pendingPreset=\{props.pendingPreset\?\.creationSuiteOptions \|\| props.pendingPreset\?\.clothesSwitcherOptions \? null/);
    assert.ok(app.includes('item.creationSuiteOptions || item.clothesSwitcherOptions'));
    assert.ok(library.includes("'Open in Clothes Switcher'"));
    assert.ok(componentSource.includes('useMediaURL(resultDraft?.file)'), 'comparison must never silently use the current edited input');
});
