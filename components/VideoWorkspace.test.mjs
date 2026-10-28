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
const names = new Set(['selectedModel', 'requiredInputs', 'compatibleModels', 'filteredModels', 'unsupportedInputs', 'modelOptions']);
const calculations = [];
let select;
let catalogEffect;
let transfer;
let audioSettingsChange;
let generate;
let libraryEffect;
let resetDraft;
let resetUltrafastDraft;
let resetAdvancedDraft;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'transfer') transfer = node.initializer;
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'generate') generate = node.initializer;
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'MinimaxH3Panel') {
        const variant = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'variant')?.initializer?.getText(tree);
        const reset = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onStartFromScratch')?.initializer?.expression;
        if (variant === '"ultrafast"') resetUltrafastDraft = reset;
        else if (variant === '"advanced"') resetAdvancedDraft = reset;
        else {
            audioSettingsChange = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onOptionsChange')?.initializer?.expression;
            resetDraft = reset;
        }
    }
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(tree)))) calculations.push(node.getText(tree));
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'select'
        && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
            && attribute.name.getText(tree) === 'aria-label' && attribute.initializer?.getText(tree) === '"OpenRouter model"')) select = node;
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
        && node.arguments[0]?.getText(tree).includes('getOpenRouterModels(controller.signal)')) catalogEffect = node.arguments[0];
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
        && node.arguments[0]?.getText(tree).includes('restoreMinimaxH3PromptLibraryItem(libraryItem')) libraryEffect = node.arguments[0];
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(select, 'OpenRouter must use a native, unfiltered-by-current-value dropdown');
assert.ok(catalogEffect, 'OpenRouter catalog must load automatically with cancellation');
assert.equal(calculations.length, names.size);
assert.ok(transfer && audioSettingsChange);
const audioWorkflowUrl = compile(['../services/videoPromptService.ts', '../services/minimaxH3Workflow.ts', '../services/minimaxH3AdvancedWorkflow.ts', '../services/minimaxH3UltrafastWorkflow.ts']
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n'));
const component = await import(compile(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
    import { filterOpenRouterModels, getOpenRouterInputModalities } from ${JSON.stringify(serviceUrl)};
    import { defaultMinimaxH3Options, defaultUltrafastH3Options, defaultH3WorkflowOptions, h3WorkflowName, validateH3ReferenceLimits, withH3OriginalAudio, validateVideoPromptOutput, h3AspectFromPrompt } from ${JSON.stringify(audioWorkflowUrl)};
    export { defaultMinimaxH3Options, defaultUltrafastH3Options, withH3OriginalAudio };
    export const changeAudioOptions = (draft, options) => {
        let result;
        const setDraft = action => { result = action(draft); };
        (${audioSettingsChange.getText(tree)})(options);
        return result;
    };
    export const resetRenderDraft = draft => {
        const libraryItem = null, onLibraryItemLoaded = () => {};
        const setError = () => {}, setNotice = () => {};
        let result = draft;
        const setDraft = action => { result = action(result); };
        (${resetDraft.getText(tree)})();
        return result;
    };
    export const resetUltrafast = draft => {
        const libraryItem = null, onLibraryItemLoaded = () => {};
        const setError = () => {}, setNotice = () => {};
        let result = draft;
        const setDraft = action => { result = action(result); };
        (${resetUltrafastDraft.getText(tree)})();
        return result;
    };
    export const resetAdvanced = draft => {
        const libraryItem = null, onLibraryItemLoaded = () => {}, setError = () => {}, setNotice = () => {};
        let result = draft;
        const setDraft = action => { result = action(result); };
        (${resetAdvancedDraft.getText(tree)})();
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
    export const runGeneration = (generateVideoPrompt, savePromptToLibrary) => {
        const events = [], draft = {}, hasPendingAudio = false;
        const captureVideoPromptInputs = value => value;
        const setError = value => events.push(['error', value]);
        const setNotice = () => {}, setLibrarySaved = () => {}, setEditOutput = () => {};
        const setBusy = value => events.push(['busy', value]);
        const update = value => events.push(['update', value]);
        return { events, done: (${generate.getText(tree)})() };
    };
    export const loadRenderPrompt = (draft, restoreMinimaxH3PromptLibraryItem, confirm = true, libraryWorkflow = 'reference', libraryFinishing = undefined) => {
        const restoreAdvancedVideoLibraryItem = restoreMinimaxH3PromptLibraryItem;
        const events = [], libraryItem = { id: 42 }, ready = true, openDirector = false;
        const latestDraft = { current: draft }, window = { confirm: () => confirm };
        const getLibraryAssetBlob = async () => { throw new Error('Unexpected asset read'); };
        let current = draft;
        const setDraft = action => { current = action(current); };
        const setTab = value => events.push(['tab', value]);
        const setError = value => events.push(['error', value]);
        const setNotice = value => events.push(['notice', value]);
        const onLeaveDirector = () => {}, onLibraryItemLoaded = () => events.push(['loaded']);
        const cleanup = (${libraryEffect.getText(tree)})();
        return { events, cleanup, get draft() { return current; } };
    };
    const Picker = ({ models, selected, references, modelSearch, loadingModels }) => {
        const draft = { models: { openrouter: selected }, references: references.map(kind => ({ kind })) };
        const input = '';
        const update = () => {};
        ${calculations.join('\n')}
        return ${select.getText(tree)};
    };
    export const renderPicker = (models, selected, references = [], modelSearch = '', loadingModels = false) =>
        <Picker models={models} selected={selected} references={references} modelSearch={modelSearch} loadingModels={loadingModels} />;
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

test('Advanced transfers, cross-variant Library loads and reset keep the other workflow drafts intact', async () => {
    const current = { idea: 'scene', workflow: 'advanced', template: 'generation', aspect: '4:3', duration: 3, references: [],
        result: 'integrated_multimodal_description: [Shot 1] A quiet street.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.',
        minimaxDrafts: { reference: { prompt: 'Keep normal' }, ultrafast: { prompt: 'Keep fast' } },
        minimaxH3Options: component.defaultMinimaxH3Options(), ultrafastH3Options: component.defaultUltrafastH3Options() };
    const transferred = component.transferAudioDraft(current);
    assert.equal(transferred.advancedH3Options.advanced.mode, 'fl2v');
    assert.equal(transferred.minimaxDrafts.advanced.workflow, 'advanced');
    assert.equal(transferred.minimaxDrafts.reference, current.minimaxDrafts.reference);
    assert.equal(transferred.minimaxDrafts.ultrafast, current.minimaxDrafts.ultrafast);
    const reset = component.resetAdvanced(transferred);
    assert.equal(reset.minimaxDrafts.advanced, undefined);
    assert.equal(reset.advancedH3Options.advanced.mode, 'fl2v');
    assert.equal(reset.minimaxDrafts.reference, current.minimaxDrafts.reference);
    const loaded = component.loadRenderPrompt(current, async () => ({ draft: { id: 'saved', workflow: 'reference', prompt: 'Old prompt', references: [], template: 'generation' },
        options: current.minimaxH3Options }), true, 'advanced');
    await tick();
    assert.equal(loaded.events[0][1], 'advanced');
    assert.equal(loaded.draft.advancedH3Options.variant, 'advanced');
    assert.equal(loaded.draft.minimaxDrafts.reference, current.minimaxDrafts.reference);
});

test('composer transfers target Ultrafast without changing the normal H3 draft or settings', () => {
    const normal = { prompt: 'Keep normal' }, normalOptions = component.defaultMinimaxH3Options();
    const value = { idea: 'scene', workflow: 'ultrafast', template: 'generation', aspect: '4:3', duration: 2,
        references: [], result: 'integrated_multimodal_description: [Shot 1] A scene.\noverall_soundscape: Quiet.\nnon_diegetic_music: None.',
        minimaxDrafts: { reference: normal }, minimaxH3Options: normalOptions };
    const transferred = component.transferAudioDraft(value);
    assert.equal(transferred.minimaxDrafts.ultrafast.workflow, 'ultrafast');
    assert.equal(transferred.ultrafastH3Options.variant, 'ultrafast');
    assert.equal(transferred.ultrafastH3Options.steps, 5);
    assert.equal(transferred.minimaxDrafts.reference, normal);
    assert.equal(transferred.minimaxH3Options, normalOptions);
    const reset = component.resetUltrafast(transferred);
    assert.equal(reset.minimaxDrafts.ultrafast, undefined);
    assert.equal(reset.minimaxDrafts.reference, normal);
    assert.equal(reset.minimaxH3Options, normalOptions);
    assert.deepEqual(reset.ultrafastH3Options, component.defaultUltrafastH3Options());
});

test('Library destination override loads old prompts into Ultrafast using its defaults without overwriting normal H3', async () => {
    const normal = { prompt: 'Keep normal' }, normalOptions = component.defaultMinimaxH3Options();
    const source = { draft: { id: 'old', workflow: 'reference', prompt: 'Old saved prompt', references: [], aspect: '16:9', duration: 4, template: 'generation' },
        options: { ...normalOptions, aspect: '16:9 (Widescreen)', duration: 4, references: { source: { enabled: false, useSoundtrack: false } } } };
    const current = { minimaxDrafts: { reference: normal }, minimaxH3Options: normalOptions };
    const loaded = component.loadRenderPrompt(current, async () => source, true, 'ultrafast');
    await tick();
    assert.equal(loaded.events[0][1], 'ultrafast');
    assert.equal(loaded.draft.minimaxDrafts.ultrafast.prompt, source.draft.prompt);
    assert.equal(loaded.draft.ultrafastH3Options.variant, 'ultrafast');
    assert.equal(loaded.draft.ultrafastH3Options.steps, 5);
    assert.equal(loaded.draft.ultrafastH3Options.duration, 4);
    assert.deepEqual(loaded.draft.ultrafastH3Options.references, source.options.references);
    assert.notEqual(loaded.draft.ultrafastH3Options.references, source.options.references);
    assert.equal(loaded.draft.minimaxDrafts.reference, normal);
    assert.equal(loaded.draft.minimaxH3Options, normalOptions);
});

test('H3 audio edits stay independent; explicit transfer copies the composer soundtrack only', () => {
    const options = component.withH3OriginalAudio(component.defaultMinimaxH3Options(), 'audio-1', true);
    const value = {
        idea: 'singer', workflow: 'reference', template: 'generation', aspect: '4:3', duration: 4,
        references: [{ id: 'audio-1', kind: 'audio', slot: 1, audioSelection: { start: 4, end: 8 } }],
        result: 'integrated_multimodal_description: [Shot 1] A singer.\\noverall_soundscape: Original track.\\nnon_diegetic_music: None.'.replaceAll('\\n', '\n'),
        minimaxDrafts: {}, minimaxH3Options: options, originalAudioId: 'audio-1', forceOriginalAudio: true,
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
    assert.equal(unlocked.originalAudioId, 'audio-1', 'Editing H3 must not mutate the generator.');
    assert.equal(unlocked.forceOriginalAudio, true);
    assert.equal(unlocked.minimaxH3Options.originalAudioId, undefined);
    assert.equal(component.transferAudioDraft(unlocked).minimaxH3Options.originalAudioId, 'audio-1', 'An explicit replacement copies the generator selection.');
    const plain = component.transferAudioDraft({ ...value, originalAudioId: undefined, forceOriginalAudio: false, references: [] });
    assert.equal(plain.minimaxH3Options.originalAudioId, undefined, 'A transfer without audio cannot retain a missing source from the old H3 draft.');
    assert.equal(plain.minimaxH3Options.forceOriginalAudio, false);
});

test('initializing H3 does not inherit or clear the independent composer soundtrack', () => {
    const value = { originalAudioId: 'library-audio', forceOriginalAudio: true };
    const updated = component.changeAudioOptions(value, component.defaultMinimaxH3Options());
    assert.equal(updated.originalAudioId, 'library-audio');
    assert.equal(updated.minimaxH3Options.originalAudioId, undefined);
    assert.ok(!updated.minimaxH3Options.forceOriginalAudio);
});

test('fresh-start reset clears the persisted H3 draft and settings without touching the composer or legacy drafts', () => {
    const original = {
        idea: 'Independent idea', result: 'Independent prompt', references: [{ id: 'composer-image' }],
        originalAudioId: 'composer-audio', forceOriginalAudio: true,
        minimaxDrafts: { reference: { prompt: 'Clear this scene', references: [{}] }, audio: { prompt: 'Keep legacy draft' } },
        minimaxH3Options: { seed: 123, originalAudioId: 'h3-audio', forceOriginalAudio: true },
        minimaxLyricsSettings: { provider: 'gemini', model: 'custom' },
    };
    const fresh = component.resetRenderDraft(original);
    assert.equal(fresh.minimaxDrafts.reference, undefined);
    assert.deepEqual(fresh.minimaxH3Options, component.defaultMinimaxH3Options());
    assert.equal(fresh.minimaxLyricsSettings, undefined);
    assert.equal(fresh.idea, original.idea);
    assert.equal(fresh.result, original.result);
    assert.equal(fresh.references, original.references);
    assert.equal(fresh.originalAudioId, 'composer-audio');
    assert.equal(fresh.forceOriginalAudio, true);
    assert.equal(fresh.minimaxDrafts.audio, original.minimaxDrafts.audio);
    assert.equal(original.minimaxDrafts.reference.prompt, 'Clear this scene');
});

test('prompt generation releases editing before a slow Library save completes and reports save failures', async () => {
    let finishSave;
    let saveStarted = false;
    const save = new Promise((resolve, reject) => { finishSave = reject; });
    const run = component.runGeneration(async () => 'generated prompt', () => { saveStarted = true; return save; });
    await tick();
    assert.equal(saveStarted, true);
    assert.deepEqual(run.events.filter(([kind]) => kind === 'busy'), [['busy', true], ['busy', false]]);
    assert.equal(run.events.find(([kind]) => kind === 'update')[1].result, 'generated prompt');
    finishSave(new Error('Storage unavailable'));
    await run.done;
    assert.match(run.events.at(-1)[1], /Prompt generated, but Library saving failed.*Storage unavailable/);
});

test('Library prompts open in the H3 renderer without replacing the independent prompt generator', async () => {
    const original = { idea: 'Composer idea', result: 'Composer output', provider: 'gemini', minimaxDrafts: { audio: { prompt: 'Legacy reserved draft' } } };
    const reference = { workflow: 'reference', prompt: 'Saved scene', references: [{ id: 'picture', kind: 'image', slot: 1 }] };
    const options = { seed: 12345 };
    const run = component.loadRenderPrompt(original, async () => ({ draft: reference, options, warning: 'Older settings use defaults.' }));
    await tick();
    assert.equal(run.draft.idea, original.idea);
    assert.equal(run.draft.result, original.result);
    assert.equal(run.draft.provider, 'gemini');
    assert.deepEqual(run.draft.minimaxDrafts.reference, reference);
    assert.deepEqual(run.draft.minimaxDrafts.audio, original.minimaxDrafts.audio);
    assert.deepEqual(run.draft.minimaxH3Options, options);
    assert.ok(run.events.some(([kind, value]) => kind === 'tab' && value === 'minimax'));
    assert.match(run.events.filter(([kind]) => kind === 'notice').at(-1)[1], /Older settings use defaults/);
    assert.equal(run.events.at(-1)[0], 'loaded');
});

test('Library video finishing opens Advanced and preserves the independent composer and other renderers', async () => {
    const original = { idea: 'Composer idea', result: 'Composer output', minimaxDrafts: { reference: { prompt: 'Keep H3' }, ultrafast: { prompt: 'Keep Ultrafast' } } };
    for (const stage of ['latent', 'ltx']) {
        const draft = { workflow: 'advanced', prompt: 'Restore this clip', references: [{ id: 'source', kind: 'video', slot: 1 }] };
        const options = { variant: 'advanced', advanced: { inputMode: 'video', latentUpscale: stage === 'latent', ltxRefine: stage === 'ltx' } };
        const run = component.loadRenderPrompt(original, async (_item, finishing) => {
            assert.equal(finishing, stage);
            return { draft, options, warning: 'No H3 first pass.' };
        }, true, 'advanced', stage);
        await tick();
        assert.equal(run.draft.idea, original.idea);
        assert.equal(run.draft.result, original.result);
        assert.deepEqual(run.draft.minimaxDrafts.reference, original.minimaxDrafts.reference);
        assert.deepEqual(run.draft.minimaxDrafts.ultrafast, original.minimaxDrafts.ultrafast);
        assert.deepEqual(run.draft.minimaxDrafts.advanced, draft);
        assert.deepEqual(run.draft.advancedH3Options, options);
        assert.ok(run.events.some(([kind, value]) => kind === 'tab' && value === 'advanced'));
        assert.match(run.events.filter(([kind]) => kind === 'notice').at(-1)[1], /No H3 first pass/);
    }
});

test('declined or failed Library loads never overwrite the current generation setup', async () => {
    const original = { minimaxDrafts: { reference: { prompt: 'Current unsaved scene' } } };
    const declined = component.loadRenderPrompt(original, async () => ({ draft: { prompt: 'Saved scene', references: [] }, options: {} }), false);
    await tick();
    assert.equal(declined.draft, original);
    assert.equal(declined.events[0][0], 'tab');
    assert.equal(declined.events[0][1], 'minimax');
    assert.equal(declined.events.at(-1)[0], 'loaded');
    const failed = component.loadRenderPrompt(original, async () => { throw new Error('Missing saved reference'); });
    await tick();
    assert.equal(failed.draft, original);
    assert.deepEqual(failed.events[0], ['tab', 'minimax'], 'A failed reference load must never leave the user in Video Prompt Generator.');
    assert.match(failed.events.filter(([kind]) => kind === 'error').at(-1)[1], /Missing saved reference/);
    const cancelled = component.loadRenderPrompt(original, async () => ({ draft: { prompt: 'Saved scene' }, options: {} }));
    cancelled.cleanup();
    await tick();
    assert.equal(cancelled.draft, original);
    assert.ok(!cancelled.events.some(([kind]) => kind === 'loaded'));
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
