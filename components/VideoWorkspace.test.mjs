import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = (source, jsx = ts.JsxEmit.None) => {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx },
    });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const serviceUrl = compile(readFileSync(new URL('../services/openRouterService.ts', import.meta.url), 'utf8')
    .replace(/^import .*imageUtils.*;$/m, ''));
const source = readFileSync(new URL('./VideoWorkspace.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('VideoWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['selectedModel', 'requiredInputs', 'compatibleModels', 'filteredModels', 'unsupportedInputs']);
const calculations = [];
let select;
let catalogEffect;
let transfer;
let audioSettingsChange;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'transfer') transfer = node.initializer;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'MinimaxH3Panel') {
        audioSettingsChange = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onOptionsChange')?.initializer?.expression;
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(tree)))) calculations.push(node.getText(tree));
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'select'
        && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
            && attribute.name.getText(tree) === 'aria-label' && attribute.initializer?.getText(tree) === '"OpenRouter model"')) select = node;
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
        && node.arguments[0]?.getText(tree).includes('getOpenRouterModels(controller.signal)')) catalogEffect = node.arguments[0];
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(select, 'OpenRouter must use a native, unfiltered-by-current-value dropdown');
assert.ok(catalogEffect, 'OpenRouter catalog must load automatically with cancellation');
assert.equal(calculations.length, names.size);
assert.ok(transfer && audioSettingsChange);
const audioWorkflowUrl = compile(['../services/videoPromptService.ts', '../services/minimaxH3Workflow.ts']
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n'));
const component = await import(compile(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
    import { filterOpenRouterModels, getOpenRouterInputModalities } from ${JSON.stringify(serviceUrl)};
    import { defaultMinimaxH3Options, withH3OriginalAudio, validateVideoPromptOutput, h3AspectFromPrompt } from ${JSON.stringify(audioWorkflowUrl)};
    export { defaultMinimaxH3Options, withH3OriginalAudio };
    export const changeAudioOptions = (draft, options) => {
        let result;
        const setDraft = action => { result = action(draft); };
        (${audioSettingsChange.getText(tree)})(options);
        return result;
    };
    export const transferAudioDraft = draft => {
        let result, error;
        const window = { confirm: () => true }, hasPendingAudio = false;
        const update = patch => { result = { ...draft, ...patch }; };
        const setError = value => { error = value; };
        const setNotice = () => {}, setSelectedWorkflow = () => {}, chooseTab = () => {};
        (${transfer.getText(tree)})();
        if (error) throw new Error(error);
        return result;
    };
    export const renderPicker = (models, selected, references = [], modelSearch = '', loadingModels = false) => {
        const draft = { models: { openrouter: selected }, references: references.map(kind => ({ kind })) };
        const input = '';
        const update = () => {};
        ${calculations.join('\n')}
        return ${select.getText(tree)};
    };
    export const loadCatalog = (getOpenRouterModels, ready = true, provider = 'openrouter') => {
        const draft = { provider };
        const events = [];
        const setModels = value => events.push(['models', value]);
        const setModelError = value => events.push(['error', value]);
        const setLoadingModels = value => events.push(['loading', value]);
        const effect = ${catalogEffect.getText(tree)};
        return { events, cleanup: effect() };
    };
`, ts.JsxEmit.React));

const models = [
    { id: 'x-ai/grok-4.7', name: 'Grok 4.7', supportsImages: true, inputModalities: ['text', 'image', 'file'] },
    { id: 'google/gemini-flash', name: 'Google: Gemini Flash', supportsImages: true, inputModalities: ['text', 'image', 'video', 'audio'] },
    { id: 'google/gemini-pro', name: 'Google: Gemini Pro', supportsImages: true, inputModalities: ['text', 'image', 'video', 'audio'] },
    { id: 'video/reader', name: 'Video reader', supportsImages: false, inputModalities: ['text', 'video'] },
];
const render = (...args) => renderToStaticMarkup(component.renderPicker(...args));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('H3 audio updates synchronize the composer; a transfer cannot reset the locked source to generated sound', () => {
    const options = component.withH3OriginalAudio(component.defaultMinimaxH3Options(), 'audio-1', true);
    const value = {
        idea: 'singer', workflow: 'reference', template: 'generation', aspect: '4:3', duration: 4,
        references: [{ id: 'audio-1', kind: 'audio', slot: 1, audioSelection: { start: 4, end: 8 } }],
        result: 'integrated_multimodal_description: [Shot 1] A singer.\\noverall_soundscape: Original track.\\nnon_diegetic_music: None.'.replaceAll('\\n', '\n'),
        minimaxDrafts: {}, minimaxH3Options: options,
    };
    const synced = component.changeAudioOptions(value, options);
    assert.equal(synced.originalAudioId, 'audio-1');
    assert.equal(synced.forceOriginalAudio, true);
    for (const source of [value, synced]) {
        const transferred = component.transferAudioDraft(source);
        assert.equal(transferred.minimaxH3Options.originalAudioId, 'audio-1');
        assert.equal(transferred.minimaxH3Options.forceOriginalAudio, true);
        assert.deepEqual(transferred.minimaxDrafts.reference.references[0].audioSelection, { start: 4, end: 8 });
    }
    const unlocked = component.changeAudioOptions(synced, component.withH3OriginalAudio(options, undefined, false));
    assert.equal(component.transferAudioDraft(unlocked).minimaxH3Options.originalAudioId, undefined);
    assert.equal(component.transferAudioDraft(unlocked).minimaxH3Options.forceOriginalAudio, false);
});

test('initializing H3 defaults does not clear an original-audio lock restored into the prompt composer', () => {
    const value = { originalAudioId: 'library-audio', forceOriginalAudio: true };
    const updated = component.changeAudioOptions(value, component.defaultMinimaxH3Options());
    assert.equal(updated.originalAudioId, 'library-audio');
    assert.equal(updated.minimaxH3Options.originalAudioId, 'library-audio');
    assert.equal(updated.minimaxH3Options.forceOriginalAudio, true);
});

test('a populated Grok selection still exposes several other OpenRouter models', () => {
    const html = render(models, 'x-ai/grok-4.7');
    assert.match(html, /<select[^>]*aria-label="OpenRouter model"/);
    assert.match(html, /value="x-ai\/grok-4.7" selected=""/);
    assert.match(html, /value="google\/gemini-flash"/);
    assert.match(html, /value="google\/gemini-pro"/);
    assert.match(html, /text \+ image \+ video \+ audio/);
});

test('video references keep incompatible Grok visible but disabled, without silently selecting another model', () => {
    const html = render(models, 'x-ai/grok-4.7', ['video']);
    assert.match(html, /value="x-ai\/grok-4.7" disabled="" selected=""/);
    assert.match(html, /value="google\/gemini-flash"/);
    assert.match(html, /value="google\/gemini-pro"/);
    assert.match(html, /value="video\/reader"/);
    assert.equal((html.match(/selected=""/g) || []).length, 1);
});

test('combined image/video/audio references and search expose only matching compatible alternatives', () => {
    const html = render(models, 'x-ai/grok-4.7', ['image', 'video', 'audio'], 'FLASH');
    assert.match(html, /value="google\/gemini-flash"/);
    assert.doesNotMatch(html, /value="google\/gemini-pro"|value="video\/reader"/);
    assert.match(html, /value="x-ai\/grok-4.7" disabled="" selected=""/);
    const selected = render(models, 'google/gemini-flash', ['video']);
    assert.equal((selected.match(/value="google\/gemini-flash"/g) || []).length, 1);
    assert.match(selected, /value="google\/gemini-flash" selected=""/);
});

test('searching does not erase the selected model, including empty results or unavailable saved IDs', () => {
    assert.match(render(models, 'google/gemini-flash', ['video'], 'no match'), /value="google\/gemini-flash" selected=""/);
    assert.match(render(models, 'removed/model'), /value="removed\/model" disabled="" selected="">removed\/model \(unavailable\)/);
    assert.match(render([], 'x-ai/grok-4.7', [], '', true), /<select[^>]*disabled=""/);
});

test('catalog loads automatically, skips inactive providers, and reports errors for retry', async () => {
    let calls = 0;
    const load = component.loadCatalog(async signal => { calls++; assert.ok(signal instanceof AbortSignal); return models; });
    await tick();
    assert.equal(calls, 1);
    assert.deepEqual(load.events, [['error', ''], ['loading', true], ['models', models], ['loading', false]]);
    load.cleanup();
    for (const [ready, provider] of [[false, 'openrouter'], [true, 'gemini'], [true, 'mammouth']]) {
        const inactive = component.loadCatalog(async () => { throw new Error('Must not fetch'); }, ready, provider);
        assert.deepEqual(inactive.events, []);
        assert.equal(inactive.cleanup, undefined);
    }
    const failed = component.loadCatalog(async () => { throw new Error('Catalog offline'); });
    await tick();
    assert.deepEqual(failed.events, [['error', ''], ['loading', true], ['error', 'Catalog offline'], ['loading', false]]);
    failed.cleanup();
});

test('aborted catalog requests cannot overwrite a newer provider or refresh', async () => {
    let resolve;
    let signal;
    const load = component.loadCatalog(value => { signal = value; return new Promise(done => { resolve = done; }); });
    load.cleanup();
    assert.equal(signal.aborted, true);
    resolve(models);
    await tick();
    assert.deepEqual(load.events, [['error', ''], ['loading', true]]);
});
