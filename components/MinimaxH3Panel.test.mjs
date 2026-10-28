import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('./MinimaxH3Panel.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('MinimaxH3Panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let prompt;
let fieldset;
let generateButton;
let savePromptButton;
let resetGuard;
let restart;
let intermediateButton;
let loraField;
let staleEventCondition;
const declarations = new Map();
const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
        && node.left.getText(tree) === 'execution.lastEventSeconds') staleEventCondition = node;
    if (ts.isVariableDeclaration(node)) declarations.set(node.name.getText(tree), node.initializer);
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'resetBlocked') resetGuard = node.initializer;
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'startFromScratch') restart = node.initializer;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const opening = ts.isJsxElement(node) ? node.openingElement : node;
        const tag = opening.tagName.getText(tree);
        if (tag === 'Choice' && opening.getText(tree).includes('`LoRA ${index + 1} file`')) loraField = node;
        if (tag === 'VideoPromptEditor' && opening.attributes.properties.some(attribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'label' && attribute.initializer?.getText(tree) === '"H3 video prompt"')) {
            prompt = node;
            let parent = node.parent;
            while (parent && !(ts.isJsxElement(parent) && parent.openingElement.tagName.getText(tree) === 'fieldset')) parent = parent.parent;
            fieldset = parent;
        }
        if (tag === 'button' && opening.attributes.properties.some(attribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onClick' && attribute.initializer?.expression?.getText(tree) === 'generate')) generateButton = node;
        if (tag === 'button' && opening.getText(tree).includes('void savePromptToLibrary()')) savePromptButton = node;
        if (tag === 'button' && opening.attributes.properties.some(attribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'aria-label' && attribute.initializer?.getText(tree) === '"Save intermediate videos"')) intermediateButton = node;
    }
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(prompt && fieldset && generateButton);
assert.ok(staleEventCondition);
test('intermediate saving is a real ON/OFF button outside every accordion', () => {
    assert.ok(intermediateButton);
    let parent = intermediateButton.parent;
    while (parent) {
        if (ts.isJsxElement(parent)) assert.notEqual(parent.openingElement.tagName.getText(tree), 'details');
        parent = parent.parent;
    }
    assert.match(intermediateButton.getText(tree), /aria-pressed/);
    assert.match(intermediateButton.getText(tree), /'ON' : 'OFF'/);
});
const disabled = node => (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties.find(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'disabled')?.initializer?.expression?.getText(tree) ?? 'false';
const loraChoice = source.match(/<Choice label=\{`LoRA \$\{index \+ 1\} file`\}[^]*?\/>/)?.[0];
const generationFinally = declarations.get('generate').body.statements.find(ts.isTryStatement).finallyBlock;
const require = createRequire(import.meta.url);
const { outputText } = ts.transpileModule(`
    import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
    const input = ${declarations.get('input').getText(tree)};
    const Field = ${declarations.get('Field').getText(tree)};
    export const TestChoice = ${declarations.get('Choice').getText(tree)};
    export const catalog = (info, h3Choices) => {
        const React = { useMemo: factory => factory() };
        return ${declarations.get('lists').getText(tree)};
    };
    export const finishGeneration = () => {
        const events = [];
        const controller = { current: {} };
        const setBusy = value => events.push(['busy', value]);
        const setCancelling = value => events.push(['cancelling', value]);
        const setPreview = value => events.push(['preview', value]);
        ${generationFinally.getText(tree)}
        return { events, controller: controller.current };
    };
    export const state = (ready, busy, copyingFrame, saveStatus, draft, hasPendingAudio = false, mappingError = '', videoInput = false, hasSourceVideo = false, savingPrompt = false) => ({
        promptDisabled: (${disabled(fieldset)}) || (${disabled(prompt)}),
        generateDisabled: (${disabled(generateButton)}),
        savePromptDisabled: (${disabled(savePromptButton)}),
        intermediateSavingDisabled: (${disabled(intermediateButton)}),
    });
    export const toggleIntermediate = (advancedSettings) => {
        let patch;
        const update = value => { patch = value; };
        (${intermediateButton.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onClick').initializer.expression.getText(tree)})();
        return patch.advanced;
    };
    export const showStaleEventWarning = seconds => {
        const execution = { lastEventSeconds: seconds };
        return ${staleEventCondition.getText(tree)};
    };
    export const reset = ({ ready = true, busy = false, checking = false, loading = false, copyingFrame = false, savingPrompt = false, saveStatus = 'idle', draft, result, confirm = true } = {}) => {
        const events = [];
        const window = { confirm: message => { events.push(['confirm', message]); return confirm; } };
        const onStartFromScratch = () => events.push(['reset-draft']);
        const setEditing = value => events.push(['editing', value]);
        const setPendingAudio = value => events.push(['pending-audio', value]);
        const setPreview = value => events.push(['preview', value]);
        const setResult = value => events.push(['result', value]);
        const setProgress = value => events.push(['progress', value]);
        const setSaveStatus = value => events.push(['save-status', value]);
        const setError = value => events.push(['error', value]);
        const setStatus = value => events.push(['status', value]);
        const resetBlocked = ${resetGuard.getText(tree)};
        (${restart.getText(tree)})();
        return events;
    };
`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
const { state, reset, toggleIntermediate, TestChoice, catalog, finishGeneration, showStaleEventWarning } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('missing job events warn only after two minutes', () => {
    for (const seconds of [0, 30, 72, 119]) assert.equal(showStaleEventWarning(seconds), false);
    for (const seconds of [120, 121, 180]) assert.equal(showStaleEventWarning(seconds), true);
});

test('all six LoRA slots use real dropdowns and preserve saved files missing from the current catalog', () => {
    assert.ok(loraChoice);
    assert.doesNotMatch(loraChoice, /editable|datalist/);
    const html = renderToStaticMarkup(React.createElement(TestChoice, { label: 'LoRA 1 file', value: 'saved.safetensors', choices: ['installed.safetensors'], onChange: () => {} }));
    assert.match(html, /<select[^>]*aria-label="LoRA 1 file"/);
    assert.match(html, /value="installed.safetensors"/);
    assert.match(html, /value="saved.safetensors" selected/);
    assert.doesNotMatch(html, /<input|<datalist/);
});

test('closed LoRA accordions and disabled chains/slots do not mount unused catalogs', () => {
    assert.ok(loraField);
    const guards = new Set();
    for (let parent = loraField.parent; parent; parent = parent.parent) {
        if (ts.isConditionalExpression(parent)) guards.add(parent.condition.getText(tree));
        if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) guards.add(parent.left.getText(tree));
    }
    for (const guard of ['loraOpen', 'options.useLoras', 'lora.enabled']) assert.ok(guards.has(guard), guard);
});
test('schema choice arrays are reused until the schema changes instead of rebuilding on prompt edits', () => {
    let reads = 0;
    const first = catalog({}, () => { reads++; return ['a.safetensors', 'b.safetensors']; });
    const names = first('LoraLoader', 'lora_name');
    assert.equal(first('LoraLoader', 'lora_name'), names);
    assert.equal(reads, 1);
    const second = catalog({}, () => ['new.safetensors']);
    assert.deepEqual(second('LoraLoader', 'lora_name'), ['new.safetensors']);
    const empty = catalog(null, () => []);
    assert.deepEqual(empty('missing', 'field', ['first fallback']), ['first fallback']);
    assert.deepEqual(empty('missing', 'field', ['second fallback']), ['second fallback']);
});

test('finishing any generation releases its animated preview and unlocks the panel without deleting the final output', () => {
    assert.deepEqual(finishGeneration(), { controller: null, events: [['busy', false], ['cancelling', false], ['preview', null]] });
    assert.doesNotMatch(generationFinally.getText(tree), /setResult|setExecution/);
});

test('saving button toggles legacy/on/off settings without resetting other options and remains usable during a render', () => {
    for (const flag of [undefined, true, false]) {
        const settings = { mode: 'ref2v', nodes: { decoder: { tile_size: 256 } }, saveIntermediateVideos: flag };
        const next = toggleIntermediate(settings);
        assert.equal(next.saveIntermediateVideos, flag === false);
        assert.equal(next.mode, settings.mode);
        assert.equal(next.nodes, settings.nodes);
        assert.equal(settings.saveIntermediateVideos, flag);
    }
    assert.equal(state(true, true, false, 'idle', { prompt: '' }).intermediateSavingDisabled, false);
    assert.equal(state(false, false, false, 'idle', { prompt: '' }).intermediateSavingDisabled, true);
});

test('plain prompts enable generation without any reference and missing prompts remain blocked', () => {
    assert.equal(state(true, false, false, 'idle', { prompt: 'A scene with sound.', references: [] }).generateDisabled, false);
    assert.equal(state(true, false, false, 'idle', undefined).generateDisabled, true);
    assert.equal(state(true, false, false, 'idle', { prompt: '  ', references: [] }).generateDisabled, true);
    assert.equal(state(true, false, false, 'idle', { prompt: 'A scene.', references: [] }, true).generateDisabled, true);
    assert.equal(state(true, false, false, 'idle', { prompt: 'Missing <Picture 1>', references: [] }, false, 'Missing reference').generateDisabled, true);
});

test('source-video finishing does not require a generation prompt but does require a source video', () => {
    assert.equal(state(true, false, false, 'idle', { prompt: '' }, false, '', true, true).generateDisabled, false);
    assert.equal(state(true, false, false, 'idle', { prompt: '' }, false, '', true, true).savePromptDisabled, false);
    assert.equal(state(true, false, false, 'idle', { prompt: '' }, false, '', true, false).generateDisabled, true);
    assert.equal(state(true, false, false, 'idle', { prompt: '' }, false, '', true, false).savePromptDisabled, true);
});

test('prompt stays editable during rendering, frame copying and Library saving', () => {
    for (const [busy, copyingFrame, saveStatus] of [[true, false, 'idle'], [false, true, 'idle'], [false, false, 'saving']]) {
        assert.equal(state(true, busy, copyingFrame, saveStatus, { prompt: 'Next clip', references: [] }).promptDisabled, false);
    }
    assert.equal(state(false, false, false, 'idle', undefined).promptDisabled, true, 'Restoration must finish before editing saved drafts.');
});

test('rendering panel does not embed a prompt generator or require its callbacks', () => {
    assert.doesNotMatch(source, /onOpenPromptGenerator|onRefreshPrompt|refreshPromptForPassage/);
});

test('starting from scratch clears transient state and warns about unsaved output without deleting Library data', () => {
    const events = reset({ draft: { prompt: 'Saved scene', references: [{}] }, result: { videoBlob: {} } });
    assert.match(events[0][1], /Unsaved local output will be lost.*Library items and ComfyUI files will not be deleted/);
    for (const expected of [['reset-draft'], ['editing', null], ['pending-audio', {}], ['preview', null], ['result', null], ['progress', 0], ['save-status', 'idle'], ['error', '']]) {
        assert.ok(events.some(event => JSON.stringify(event) === JSON.stringify(expected)), `Missing reset: ${JSON.stringify(expected)}`);
    }
    assert.match(events.at(-1)[1], /New H3 setup ready/);
    assert.equal(reset().some(([kind]) => kind === 'confirm'), false, 'An already-empty setup does not need a confirmation.');
});

test('declining a fresh start or attempting it during active operations does not clear the setup', () => {
    const declined = reset({ draft: { prompt: 'Keep this prompt' }, confirm: false });
    assert.deepEqual(declined.map(([kind]) => kind), ['confirm']);
    for (const flags of [{ ready: false }, { busy: true }, { checking: true }, { loading: true }, { copyingFrame: true }, { savingPrompt: true }, { saveStatus: 'saving' }]) {
        const events = reset(flags);
        assert.equal(events.length, 1);
        assert.equal(events[0][0], 'error');
        assert.match(events[0][1], /current operation/);
    }
});
