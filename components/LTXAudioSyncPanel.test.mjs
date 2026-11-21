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
const reactURL = pathToFileURL(require.resolve('react')).href;
const workflowURL = compile(readFileSync(new URL('../services/ltxAudioSyncWorkflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
const helpersURL = compile(readFileSync(new URL('../services/minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
const componentSource = readFileSync(new URL('./LTXAudioSyncPanel.tsx', import.meta.url), 'utf8');
const component = await import(compile(`
    import React, { useEffect, useRef, useState } from '${reactURL}';
    import { AUDIO_SYNC_TEMPLATE, defaultAudioSyncLoras, defaultAudioSyncSettings, audioSyncNumber, audioSyncReference } from '${workflowURL}';
    import { h3Resolution } from '${helpersURL}';
    import { Accordion } from '${uiModules.Accordion}';
    import { Select } from '${uiModules.Select}';
    import { NumberField } from '${uiModules.fields}';
    import { PromptBox } from '${uiModules.PromptBox}';
    import { ui } from '${uiModules.styles}';
    const familyFiles = names => names, useModelInventory = () => ({ inventory: { items: [] } });
    const audioSyncResolution = settings => h3Resolution({aspect:settings.nodes['403'].aspect_ratio, megapixels:settings.nodes['403'].megapixels, multiple:settings.nodes['403'].multiple});
    const useDispatch = () => () => {}, useMediaURL = () => '';
    const H3AudioReference = () => React.createElement('div', null, 'Shared waveform editor');
    const AudioLyricsEditor = () => React.createElement('div', null, 'Shared optional lyrics editor');
    const LibraryPickerModal = () => null, VideoOutputFrames = () => null;
    ${componentSource.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export { Accordion };
`));
const workflow = await import(workflowURL);
const render = (settings, ready = true, draft) => renderToStaticMarkup(React.createElement(component.LTXAudioSyncPanel, {
    settings, ready, draft, lyricsProvider: 'gemini', lyricsModel: 'gemini-2.5-flash', onLyricsSettingsChange() {},
    onDraftChange() {}, onSettingsChange() {}, onLibraryItemLoaded() {},
}));

test('Audio-Sync default panel exposes source controls, independent Qwen toggle and collapsed advanced groups', () => {
    const html = render(workflow.defaultAudioSyncSettings());
    for (const label of ['LTX 2.5 Audio-Sync', 'Enable Qwen prompt enhancement', 'Qwen prompt enhancement', 'Models',
        'LoRAs - camera and style (up to 4)', 'Resolution and image conditioning', 'Sampling - first and second pass', 'Negative prompt, decode and output',
        'Check nodes and models', 'Export API workflow', 'Save setup to Library', 'Generate LTX 2.5 Audio-Sync']) assert.ok(html.includes(label), label);
    assert.ok(html.includes('736 x 576'));
    assert.ok(!html.includes('<select'), 'Closed accordions must not construct model menus');
});

test('disabled Qwen removes its accordion and explicitly describes verbatim prompting', () => {
    const settings = workflow.defaultAudioSyncSettings(); settings.enhancePrompt = false;
    const html = render(settings);
    assert.ok(!html.includes('>Qwen prompt enhancement</summary>'));
    assert.ok(html.includes('Prompt unchanged'));
    assert.ok(html.includes('the Qwen model is not loaded'));
});

test('text-to-video makes the first frame optional without making the soundtrack optional', () => {
    const settings = workflow.defaultAudioSyncSettings(); settings.textToVideo = true;
    const html = render(settings);
    assert.ok(html.includes('First frame (optional Qwen reference)'));
    assert.ok(html.includes('Soundtrack (required)'));
});

test('advanced accordions are truly lazy, including construction of option lists', () => {
    let called = false;
    const html = renderToStaticMarkup(React.createElement(component.Accordion, { title: 'Test models', children: () => { called = true; throw new Error('Must not construct hidden model choices'); } }));
    assert.equal(called, false);
    assert.ok(html.includes('Test models'));
});

test('loading saved workspace disables edits and rendering until its settings and files are ready', () => {
    assert.match(render(workflow.defaultAudioSyncSettings(), false), /<fieldset disabled=""/);
});

test('soundtracks expose the same passage and optional lyrics editors as H3, with locked double-trim controls', () => {
    const draft = { prompt: 'A speaker.', audio: new File(['audio'], 'voice.wav', { type: 'audio/wav' }), image: null,
        audioSelection: { start: 5, end: 10 } };
    const html = render(workflow.defaultAudioSyncSettings(), true, draft);
    assert.ok(html.includes('Shared waveform editor'));
    assert.ok(html.includes('Shared optional lyrics editor'));
    assert.ok(html.includes('Lyrics / spoken words are optional'));
    assert.match(html, /aria-label="Audio-Sync audio start"[^>]*disabled=""/);
    assert.match(html, /aria-label="Audio-Sync duration"[^>]*disabled=""/);
    assert.ok(html.includes('transfers switch Qwen off automatically'));
});
