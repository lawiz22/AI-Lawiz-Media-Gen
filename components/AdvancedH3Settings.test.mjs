import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ['../services/videoPromptService.ts', '../services/minimaxH3Workflow.ts', '../services/minimaxH3AdvancedWorkflow.ts', './AdvancedH3Settings.tsx']
    .map(file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n');
const { outputText } = ts.transpileModule(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};\n${source}
export const render = (options, info = null, section = 'parameters') => <AdvancedH3Settings section={section} settings={options.advanced} options={options} info={info} onChange={() => {}} onOptionsChange={() => {}} />;`,
{ compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Advanced displays both modes and every requested switch with collapsible option groups', () => {
    const html = renderToStaticMarkup(api.render(api.defaultAdvancedH3Options(), null, 'switches'));
    assert.match(html, /value="fl2v" selected/);
    assert.match(html, /value="ref2v"/);
    for (const label of ['H3 latent upscale', 'LTX Refine', 'RTX upscaler', 'Turbo LoRA chain', 'ComfyAttn', 'Boost', 'VRAM Clear', 'Realtime preview', 'Interpolation', 'Add noise to Image 1', 'Add noise to Image 2', 'Add noise to Image 3']) assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, /Save intermediate videos/, 'Saving now has a dedicated always-visible button outside this accordion.');
    assert.equal((html.match(/<details/g) || []).length, 1);
});

test('only enabled stages expose options and all accordions are siblings, not nested', () => {
    const options = api.defaultAdvancedH3Options();
    let html = renderToStaticMarkup(api.render(options));
    assert.match(html, /H3 latent upscale · all options/);
    for (const label of ['LTX Refine · all options', 'RTX · final upscale options', 'Boost settings', 'Interpolation &amp; image noise']) assert.ok(!html.includes(label), label);
    Object.assign(options.advanced, { ltxRefine: true, rtxUpscale: true, boost: true, interpolation: true });
    html = renderToStaticMarkup(api.render(options));
    for (const label of ['LTX Refine · all options', 'RTX · final upscale options', 'Boost settings', 'Interpolation &amp; image noise']) assert.ok(html.includes(label), label);
    let depth = 0;
    for (const [tag] of html.matchAll(/<details\b|<\/details>/g)) {
        depth += tag.startsWith('</') ? -1 : 1;
        assert.ok(depth <= 1 && depth >= 0);
    }
    assert.equal(depth, 0);
    options.advanced.latentUpscale = false;
    assert.doesNotMatch(renderToStaticMarkup(api.render(options)), /H3 latent upscale · all options/);
});

test('closed advanced stages do not mount thousands of model options on every prompt keystroke', () => {
    const html = renderToStaticMarkup(api.render(api.defaultAdvancedH3Options(), { LoraLoaderModelOnly: { input: { required: { lora_name: [Array.from({ length: 2000 }, (_, i) => `test-lora-${i}`)] } } } }));
    assert.doesNotMatch(html, /test-lora-/);
    assert.doesNotMatch(html, /aria-label="LTX refine LoRA \/ lora_name"/);
});

test('new projects select LTX-first while old settings retain latent-first and source videos hide generation-only switches', () => {
    const options = api.defaultAdvancedH3Options();
    assert.match(renderToStaticMarkup(api.render(options, null, 'switches')), /value="ltx-first" selected/);
    delete options.advanced.stageOrder;
    assert.match(renderToStaticMarkup(api.render(options, null, 'switches')), /value="latent-first" selected/);
    Object.assign(options.advanced, { inputMode: 'video', latentUpscale: false, ltxRefine: true });
    const html = renderToStaticMarkup(api.render(options, null, 'switches'));
    assert.match(html, /value="video" selected/);
    for (const hidden of ['Turbo LoRA chain', 'Realtime preview', 'Add noise to Image', 'aria-label="Advanced mode"']) assert.ok(!html.includes(hidden), hidden);
    assert.match(html, /no H3 first pass/);
});
