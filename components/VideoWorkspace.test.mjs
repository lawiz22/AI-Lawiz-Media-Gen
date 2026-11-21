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
let topNavigation;
let groupNavigation;
let groups;
let importLibraryReference;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'videoToolGroups') groups = node.initializer;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'nav') {
        if (node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
            && attribute.name.getText(tree) === 'aria-label' && attribute.initializer?.getText(tree) === '"Video tools"')) topNavigation = node;
        if (node.getText(tree).includes('videoToolGroups[group].map')) groupNavigation = node;
    }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'LibraryPickerModal') {
        importLibraryReference = node.attributes.properties.find(attribute => ts.isJsxAttribute(attribute)
            && attribute.name.getText(tree) === 'onSelectItem')?.initializer?.expression;
    }
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
        && node.arguments[0]?.getText(tree).includes('restoreMinimaxH3PromptLibraryItem(libraryItem')
        && node.arguments[0]?.getText(tree).includes('validateH3ReferenceLimits(restored)')) libraryEffect = node.arguments[0];
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(select, 'OpenRouter must use a native, unfiltered-by-current-value dropdown');
assert.ok(catalogEffect, 'OpenRouter catalog must load automatically with cancellation');
assert.equal(calculations.length, names.size);
assert.ok(transfer && audioSettingsChange);
assert.ok(topNavigation && groupNavigation && groups && importLibraryReference);
const audioWorkflowUrl = compile(['../services/styleGallery.ts', '../services/h3StyleWorkflow.ts', '../services/videoPromptService.ts', '../services/minimaxH3Workflow.ts', '../services/minimaxH3AdvancedWorkflow.ts', '../services/minimaxH3UltrafastWorkflow.ts']
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '')).join('\n'));
const syncWorkflowUrl = compile(readFileSync(new URL('../services/ltxAudioSyncWorkflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
const component = await import(compile(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
    import { transferAudioSyncPrompt, defaultAudioSyncSettings } from ${JSON.stringify(syncWorkflowUrl)};
    import { filterOpenRouterModels, getOpenRouterInputModalities } from ${JSON.stringify(serviceUrl)};
    import { defaultMinimaxH3Options, defaultUltrafastH3Options, defaultH3WorkflowOptions, h3WorkflowName, validateH3ReferenceLimits, withH3OriginalAudio, validateVideoPromptOutput, h3AspectFromPrompt, h3StyleLoraRemovals, videoPromptFamily, videoPromptMode, ltxVideoPromptText, addVideoReferences } from ${JSON.stringify(audioWorkflowUrl)};
    export { defaultMinimaxH3Options, defaultUltrafastH3Options, withH3OriginalAudio, defaultAudioSyncSettings };
    const videoToolGroups = ${groups.getText(tree)};
    export const renderNavigation = (group, tab) => {
        const button = 'button', chooseTab = () => {};
        const lastLtxTab = { current: 'ltx' }, lastH3Tab = { current: 'minimax' };
        return <>${topNavigation.getText(tree)}{group !== 'prompt' && ${groupNavigation.getText(tree)}}</>;
    };
    export const importReference = async (draft, kind, readLibraryMediaFile) => {
        let result = draft;
        const referencePicker = kind, latestDraft = { current: draft };
        const update = patch => { result = { ...result, ...patch }; }, setNotice = () => {};
        await (${importLibraryReference.getText(tree)})({ id: 42 });
        return result;
    };
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
    export const transferAudioDraft = async draft => {
        let result, error;
        const window = { confirm: () => true }, hasPendingAudio = false;
        const setTransferring = () => {};
        const fileToDataUrl = async file => 'data:' + file.type;
        const queueLtxTransfer = payload => ({ type: 'ltx-transfer', payload });
        const dispatch = action => { result = action; };
        const update = patch => { result = { ...draft, ...patch }; };
        const setError = value => { error = value; };
        const setNotice = () => {}, setSelectedWorkflow = () => {}, chooseTab = () => {};
        await (${transfer.getText(tree)})();
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

test('Video navigation shows exactly three main tabs and only the selected family subtools', () => {
    const prompt = renderToStaticMarkup(component.renderNavigation('prompt', 'prompt'));
    assert.equal((prompt.match(/<button/g) || []).length, 3);
    assert.ok(prompt.indexOf('Video Prompt Generator') < prompt.indexOf('>LTX<'));
    assert.ok(prompt.indexOf('>LTX<') < prompt.indexOf('>H3<'));
    const ltx = renderToStaticMarkup(component.renderNavigation('ltx', 'ltx-ripple-ffaf'));
    assert.equal((ltx.match(/<button/g) || []).length, 6);
    assert.match(ltx, /aria-label="LTX tools"/);
    for (const name of ['LTX Director', 'LTX-Ripple-FFAF', 'LTX 2.5 Audio-Sync']) assert.ok(ltx.includes(name));
    assert.doesNotMatch(ltx, /Minimax REF2v|Character Swap/);
    const h3 = renderToStaticMarkup(component.renderNavigation('h3', 'advanced'));
    assert.equal((h3.match(/<button/g) || []).length, 7);
    for (const name of ['Minimax REF2v H3', 'Ultrafast', 'MiniMax Advanced', 'Character Swap H3']) assert.ok(h3.includes(name));
    assert.doesNotMatch(h3, /LTX Director|LTX-Ripple-FFAF/);
});

test('Library imports use durable media and reject overflow inside the picker callback before updating the draft', async () => {
    const image = new File(['image'], 'library.png', { type: 'image/png' });
    const original = { references: [], idea: 'Keep idea', minimaxDrafts: { reference: { prompt: 'Keep H3' } } };
    const imported = await component.importReference(original, 'image', async (item, kinds) => {
        assert.equal(item.id, 42);
        assert.deepEqual(kinds, ['image']);
        return image;
    });
    assert.equal(imported.references[0].file, image);
    assert.equal(imported.references[0].original, image);
    assert.equal(imported.references[0].slot, 1);
    assert.equal(imported.minimaxDrafts, original.minimaxDrafts);
    assert.equal(original.references.length, 0);
    const full = { ...original, references: Array.from({ length: 6 }, (_, index) => ({ ...imported.references[0], slot: index + 1 })) };
    await assert.rejects(component.importReference(full, 'image', async () => image), /Only 0 image slot/);
    assert.equal(full.references.length, 6);
    await assert.rejects(component.importReference(original, 'image', async () => { throw new Error('Missing durable media'); }), /Missing durable media/);
    assert.equal(original.references.length, 0);
});
test('Audio-Sync transfer disables Qwen while preserving model choices and all H3 settings', async () => {
    const sync = component.defaultAudioSyncSettings();
    sync.enhancePrompt = true;
    sync.nodes['398:393'].clip_name = 'selected-writer.safetensors';
    const current = { workflow: 'ltx-audio-sync', template: 'generation', aspect: '9:16', duration: 4, references: [],
        result: 'integrated_multimodal_description: A performer.\noverall_soundscape: Singing.\nnon_diegetic_music: None.',
        audioSyncSettings: sync, minimaxDrafts: { reference: { prompt: 'Keep H3' } }, minimaxH3Options: component.defaultMinimaxH3Options() };
    const transferred = await component.transferAudioDraft(current);
    assert.equal(transferred.audioSyncDraft.prompt, current.result);
    assert.equal(transferred.audioSyncDraft.audio, null);
    assert.equal(transferred.audioSyncSettings.enhancePrompt, false);
    assert.equal(transferred.audioSyncSettings.nodes['398:393'].clip_name, 'selected-writer.safetensors');
    assert.equal(transferred.minimaxDrafts, current.minimaxDrafts);
    assert.equal(transferred.minimaxH3Options, current.minimaxH3Options);
});

test('Advanced transfers, cross-variant Library loads and reset keep the other workflow drafts intact', async () => {
    const current = { idea: 'scene', workflow: 'advanced', template: 'generation', aspect: '4:3', duration: 3, references: [],
        result: 'integrated_multimodal_description: [Shot 1] A quiet street.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.',
        minimaxDrafts: { reference: { prompt: 'Keep normal' }, ultrafast: { prompt: 'Keep fast' } },
        minimaxH3Options: component.defaultMinimaxH3Options(), ultrafastH3Options: component.defaultUltrafastH3Options() };
    const transferred = await component.transferAudioDraft(current);
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

test('composer transfers target Ultrafast without changing the normal H3 draft or settings', async () => {
    const normal = { prompt: 'Keep normal' }, normalOptions = component.defaultMinimaxH3Options();
    const value = { idea: 'scene', workflow: 'ultrafast', template: 'generation', aspect: '4:3', duration: 2,
        references: [], result: 'integrated_multimodal_description: [Shot 1] A scene.\noverall_soundscape: Quiet.\nnon_diegetic_music: None.',
        minimaxDrafts: { reference: normal }, minimaxH3Options: normalOptions };
    const transferred = await component.transferAudioDraft(value);
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

test('styled composer transfers match wording and LoRA across every H3 destination, clearing old managed contributions', async () => {
    const style = { id: 'film', model: 'H3', title: '1920s', trigger: 'FILM', prompt: 'Aged film', lora: 'H3\\film.safetensors',
        strength: 0.6, notes: '', settings: {} };
    const result = 'integrated_multimodal_description: FILM [Shot 1] A scene.\noverall_soundscape: Quiet.\nnon_diegetic_music: None.';
    for (const workflow of ['reference', 'ultrafast', 'advanced']) {
        const key = workflow === 'advanced' ? 'advancedH3Options' : workflow === 'ultrafast' ? 'ultrafastH3Options' : 'minimaxH3Options';
        const previous = { ...component.defaultMinimaxH3Options(), style: { ...style, id: 'old', lora: 'H3\\old.safetensors' }, styleStrength: 1.5, useStyleSettings: true };
        previous.loras[0] = { enabled: true, name: style.lora, strength: 1 };
        previous.loras[1] = { enabled: true, name: 'H3\\detail.safetensors', strength: 0.2 };
        const draft = { workflow, style, generatedInputs: { workflow, references: [], style: structuredClone(style) }, result, template: 'generation', references: [],
            aspect: '4:3', duration: 3, minimaxDrafts: {}, [key]: previous };
        const transferred = await component.transferAudioDraft(draft);
        assert.deepEqual(transferred[key].style, style);
        assert.notEqual(transferred[key].style, style);
        assert.equal(transferred[key].styleStrength, undefined);
        assert.equal(transferred[key].useStyleSettings, true);
        assert.equal(transferred[key].loras[0].enabled, false);
        assert.deepEqual(transferred[key].loras[1], previous.loras[1]);
        assert.equal(transferred.minimaxDrafts[workflow].prompt, result);
        await assert.rejects(component.transferAudioDraft({ ...draft, style: { ...style, id: 'changed' } }), /changed since/);
        await assert.rejects(component.transferAudioDraft({ ...draft, style: undefined }), /changed since/);
        const cleared = await component.transferAudioDraft({ ...draft, style: undefined, generatedInputs: { ...draft.generatedInputs, style: undefined } });
        assert.equal(cleared[key].style, undefined);
        assert.equal(previous.style.id, 'old');
    }
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

test('H3 audio edits stay independent; explicit transfer copies the composer soundtrack only', async () => {
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
        const transferred = await component.transferAudioDraft(source);
        assert.equal(transferred.minimaxH3Options.originalAudioId, 'audio-1');
        assert.equal(transferred.minimaxH3Options.forceOriginalAudio, true);
        assert.deepEqual(transferred.minimaxDrafts.reference.references[0].audioSelection, { start: 4, end: 8 });
    }
    const unlocked = component.changeAudioOptions(synced, component.withH3OriginalAudio(options, undefined, false));
    assert.equal(unlocked.originalAudioId, 'audio-1', 'Editing H3 must not mutate the generator.');
    assert.equal(unlocked.forceOriginalAudio, true);
    assert.equal(unlocked.minimaxH3Options.originalAudioId, undefined);
    assert.equal((await component.transferAudioDraft(unlocked)).minimaxH3Options.originalAudioId, 'audio-1', 'An explicit replacement copies the generator selection.');
    const plain = await component.transferAudioDraft({ ...value, originalAudioId: undefined, forceOriginalAudio: false, references: [] });
    assert.equal(plain.minimaxH3Options.originalAudioId, undefined, 'A transfer without audio cannot retain a missing source from the old H3 draft.');
    assert.equal(plain.minimaxH3Options.forceOriginalAudio, false);
});

test('LTX transfers strip the application envelope, preserve independent drafts and reject unsupported inputs', async () => {
    const image = new File(['image'], 'first.png', { type: 'image/png' }), video = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const picture = { id: 'p1', kind: 'image', slot: 1, file: image, original: image };
    const source = { id: 'v1', kind: 'video', slot: 1, file: video, original: video };
    const result = 'integrated_multimodal_description: A person walks.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.';
    const base = { targetFamily: 'ltx', promptMode: 'i2v', workflow: 'ltx-audio-sync', references: [picture],
        result, template: 'generation', duration: 4, aspect: '9:16', minimaxDrafts: { reference: { prompt: 'Keep H3' } } };
    const sync = await component.transferAudioDraft(base);
    assert.equal(sync.audioSyncDraft.prompt, 'A person walks.\n\nFootsteps.\n\nNone.');
    assert.equal(sync.audioSyncDraft.image, image);
    assert.equal(sync.audioSyncSettings.textToVideo, false);
    assert.equal(sync.minimaxDrafts, base.minimaxDrafts);
    const renamed = await component.transferAudioDraft({ ...base, promptMode: 'fi2v', generatedInputs: { ...base } });
    assert.equal(renamed.audioSyncDraft.image, image);
    assert.equal(renamed.audioSyncSettings.textToVideo, false);
    assert.equal((await component.transferAudioDraft({ ...base, promptMode: 't2v', references: [] })).audioSyncSettings.textToVideo, true);
    const ripple = await component.transferAudioDraft({ ...base, promptMode: 'v2v', workflow: 'ltx-ripple-ffaf', references: [picture, source] });
    assert.equal(ripple.rippleDraft.image, image);
    assert.equal(ripple.rippleDraft.video, video);
    assert.equal(ripple.rippleDraft.prompt, sync.audioSyncDraft.prompt);
    const director = await component.transferAudioDraft({ ...base, workflow: 'ltx-director' });
    assert.equal(director.payload.prompt, sync.audioSyncDraft.prompt);
    assert.equal(director.payload.promptDurationSeconds, 4);
    assert.equal(director.payload.imageDataUrl, 'data:image/png');
    await assert.rejects(component.transferAudioDraft({ ...base, workflow: 'ltx-director', references: [picture, source] }), /no references|No references/i);
    await assert.rejects(component.transferAudioDraft({ ...base, workflow: 'ltx-director', duration: 16 }), /3-15 seconds/);
    await assert.rejects(component.transferAudioDraft({ ...base, workflow: 'ltx-ripple-ffaf' }), /one edited first-frame/);
    await assert.rejects(component.transferAudioDraft({ ...base, generatedInputs: { ...base, targetFamily: 'h3' } }), /target model or generation mode changed/);
    await assert.rejects(component.transferAudioDraft({ ...base, generatedInputs: { ...base, promptMode: 't2v' } }), /target model or generation mode changed/);
    for (const workflow of ['ltx-director', 'ltx-audio-sync', 'ltx-ripple-ffaf']) {
        await assert.rejects(component.transferAudioDraft({ ...base, promptMode: 'ref2v', workflow }), /references were not converted to starting frames/);
    }
});

test('REF2V H3 transfers retain reference roles and select Advanced reference conditioning, never first-frame mode', async () => {
    const file = new File(['image'], 'identity.png', { type: 'image/png' });
    const picture = { id: 'p1', kind: 'image', slot: 1, file, original: file, note: 'Identity only' };
    const base = { targetFamily: 'h3', promptMode: 'ref2v', references: [picture], aspect: '4:3', duration: 4,
        result: 'integrated_multimodal_description: A new scene with <Picture 1> identity.\noverall_soundscape: Quiet.\nnon_diegetic_music: None.',
        template: 'generation', minimaxDrafts: {} };
    for (const workflow of ['reference', 'ultrafast', 'advanced']) {
        const originalSettings = { mode: 'fl2v', inputMode: 'video', ltxRefine: true };
        const transferred = await component.transferAudioDraft({ ...base, workflow, advancedH3Options: {
            ...component.defaultMinimaxH3Options(), advanced: originalSettings,
        } });
        assert.equal(transferred.minimaxDrafts[workflow].prompt, base.result);
        assert.equal(transferred.minimaxDrafts[workflow].references[0].note, 'Identity only');
        if (workflow === 'advanced') {
            assert.equal(transferred.advancedH3Options.advanced.mode, 'ref2v');
            assert.equal(transferred.advancedH3Options.advanced.inputMode, 'generate');
            assert.equal(transferred.advancedH3Options.advanced.ltxRefine, true);
            assert.equal(originalSettings.mode, 'fl2v');
            assert.equal(originalSettings.inputMode, 'video');
        }
    }
    await assert.rejects(component.transferAudioDraft({ ...base, workflow: 'reference',
        generatedInputs: { ...base, promptMode: 'fi2v' } }), /target model or generation mode changed/);
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
