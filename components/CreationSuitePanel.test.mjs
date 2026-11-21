import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { uiModules } from './ui/compileForTest.mjs';
const require = createRequire(import.meta.url);
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const reactURL = pathToFileURL(require.resolve('react')).href;
const helpersURL = compile(source('../services/minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const workflowURL = compile(source('../services/creationSuiteWorkflow.ts')
    .replace("import template from '../assets/creationSuiteWorkflow.json';", `const template = ${source('../assets/creationSuiteWorkflow.json')};`)
    .replace("import helpers from '../assets/creationSuiteHelpers.json';", `const helpers = ${source('../assets/creationSuiteHelpers.json')};`)
    .replace("from './minimaxH3Workflow'", `from '${helpersURL}'`));
const componentSource = source('./CreationSuitePanel.tsx');
const liveURL = compile(`import React from '${reactURL}';const useMediaURL = () => '';
    ${source('./CreationSuiteLivePreview.tsx').replace(/import[\s\S]*?from\s+'[^']+';/g, '')}`);
const liveComponent = await import(liveURL);
const component = await import(compile(`
    import React, { useEffect, useRef, useState } from '${reactURL}';
    import { defaultCreationSuiteSettings, creationSuitePrompt, CREATION_SUITE_HELPERS, CREATION_SUITE_INPUTS } from '${workflowURL}';
    import { CreationSuiteLivePreview } from '${liveURL}';
    import { Accordion } from '${uiModules.Accordion}';
    import { Select } from '${uiModules.Select}';
    import { NumberField } from '${uiModules.fields}';
    import { PromptBox } from '${uiModules.PromptBox}';
    import { ui } from '${uiModules.styles}';
    const familyFiles = names => names, useModelInventory = () => ({ inventory: { items: [] } });
    const emptyCreationSuiteLive = () => ({ phase: 'queued', nodes: [], sigmas: [], deltas: [], stepTimes: [] });
    const useDispatch = () => () => {}, useSelector = () => false, useMediaURL = () => '', useDraftAutosave = () => {};
    const LibraryPickerModal = () => null, CreationSuiteResultImage = () => null;
    ${componentSource.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export { Accordion };
`));
const render = () => renderToStaticMarkup(React.createElement(component.CreationSuitePanel, { isComfyUIConnected: true, onModelChange() {} }));
test('Creation suite exposes both source pipelines, prompts and direct original helper buttons', () => {
    const html = render();
    for (const text of ['Creation suite', 'Enable Scene Creation', 'Enable Swap face-Change expression', 'Modern iPhone helper', 'Cheap phone helper', 'Head swap helper',
        'Scene Creation prompt', 'Swap face expression prompt', 'Check active workflow', 'Export API workflow', 'Save setup to Library', 'Load setup from Library', 'Generate Creation suite']) assert.ok(html.includes(text), text);
    assert.ok(html.includes('wearing a camo cap')); assert.ok(!html.includes('22-year-old'));
    assert.ok(html.includes('decoded MOSS image becomes Qwen image 1'));
    assert.ok(!html.includes('Creation suite Swap base image')); assert.ok(html.includes('Creation suite Face / head source'));
});
test('advanced groups stay collapsed without constructing installed model menus', () => {
    const html = render();
    for (const text of ['Scene models and resolution', 'Scene sampling and vision conditioning', 'Scene acceleration, preview and output', 'Swap models, LoRAs and acceleration', 'Swap sampling, negative prompt and output']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('aria-label="MOSS diffusion: unet name"'));
    let called = false;
    renderToStaticMarkup(React.createElement(component.Accordion, { title: 'Models', children: () => { called = true; throw new Error('Hidden choices must not render'); } }));
    assert.equal(called, false);
});
test('draft hydration locks editing until local settings and files are loaded', () => {
    assert.match(render(), /<fieldset disabled=""/);
});
test('options and prompts use separate responsive columns with generation and preview on the right', () => {
    const html = render();
    const options = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
    const right = html.slice(html.indexOf('aria-label="Creation suite prompts and generation"'));
    assert.ok(html.includes('lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]'));
    assert.ok(options.includes('Scene models and resolution')); assert.ok(!options.includes('aria-label="Scene Creation prompt"'));
    for (const text of ['Scene Creation prompt', 'Swap face expression prompt', 'Generate Creation suite', 'Show live preview', 'Show sampling charts', 'Creation suite live monitor']) assert.ok(right.includes(text), text);
});
test('live monitor plots real telemetry and identifies the active workflow node', () => {
    const live = { phase: 'running', nodeId: '10', nodes: [{ id: '10', title: 'Scene sampler', classType: 'KSampler', state: 'running' }],
        step: 2, total: 50, averageStepMs: 3990, width: 436, height: 768, sigmas: [{ step: 0, value: 1 }, { step: 1, value: 0.5 }, { step: 2, value: 0 }],
        deltas: [{ step: 1, value: 0.2 }, { step: 2, value: 0.117 }], stepTimes: [{ step: 1, value: 3 }, { step: 2, value: 7.16 }] };
    const html = renderToStaticMarkup(React.createElement(liveComponent.CreationSuiteLivePreview, { live, showPreview: true, showCharts: true, running: true }));
    for (const text of ['Node 10 - Scene sampler', '2 / 50 steps', '3.99 s/step', '0.000 / 0.117', '7.16 s', 'Sigma and delta over sampling steps', 'Step time in seconds over sampling steps', 'KSampler']) assert.ok(html.includes(text), text);
    const hidden = renderToStaticMarkup(React.createElement(liveComponent.CreationSuiteLivePreview, { live, showPreview: false, showCharts: false, running: true }));
    assert.ok(!hidden.includes('<svg')); assert.ok(!hidden.includes('Live images will appear'));
    assert.ok(hidden.includes('Node 10 - Scene sampler'));
});
