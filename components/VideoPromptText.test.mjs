import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./VideoPromptText.tsx', import.meta.url), 'utf8')
    .replace(/^import React.*;$/m, `import React, { useRef } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};`);
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
});
const { VideoPromptEditor, ColoredVideoPrompt, VideoReferenceToken } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('renderer editor retains a native editable textbox and shares colored reference tokens', () => {
    const text = 'A scene with <Picture 1>, <Picture 9>, <Video 2>, <Audio 3> and <Subject 1>.\nA new line.';
    const html = renderToStaticMarkup(React.createElement(VideoPromptEditor, { value: text, label: 'H3 video prompt', onChange: () => {} }));
    assert.match(html, /<textarea[^>]*aria-label="H3 video prompt"/);
    assert.match(html, /aria-hidden="true"[^>]*data-video-prompt-highlight/);
    for (const color of ['text-sky-300', 'text-fuchsia-300', 'text-amber-300', 'text-emerald-300']) assert.ok(html.includes(color));
    assert.ok(html.includes('A new line.'));
    assert.doesNotMatch(html, /disabled|contenteditable|dangerouslySetInnerHTML/i);
});

test('preview and editor escape arbitrary markup and use matching token colors', () => {
    const text = '<script>alert(1)</script> <Picture 2>';
    for (const Component of [VideoPromptEditor, ColoredVideoPrompt]) {
        const html = renderToStaticMarkup(React.createElement(Component, { value: text, text, label: 'Prompt', onChange: () => {} }));
        assert.ok(html.includes('text-teal-300'));
        assert.ok(html.includes('&lt;script&gt;'));
        assert.doesNotMatch(html, /<script>/);
    }
});

test('zero and oversized token numbers never crash any prompt display or produce invalid classes', () => {
    for (const kind of ['Picture', 'Video', 'Audio', 'Subject']) {
        for (const slot of ['0', '000', '9007199254740992', '9'.repeat(400)]) {
            const text = `<${kind} ${slot}>`;
            for (const Component of [VideoPromptEditor, ColoredVideoPrompt, VideoReferenceToken]) {
                const html = renderToStaticMarkup(React.createElement(Component, { value: text, text, label: 'Prompt', onChange: () => {} }));
                assert.doesNotMatch(html, /class="[^"]*(?:undefined|NaN)/);
                assert.ok(html.includes(`&lt;${kind} ${slot}&gt;`));
            }
        }
    }
});

test('pasting a long multimodal description with Subject 0 preserves its exact text', () => {
    const text = 'integrated_multimodal_description: [Shot 1] <Subject 0> stands facing a mirror. '
        + 'The camera moves through the room while the speaker talks. '.repeat(35)
        + '(S0) [English] "Ready?"\noverall_soundscape: Fabric rustling. non_diegetic_music: N/A';
    const html = renderToStaticMarkup(React.createElement(VideoPromptEditor, { value: text, label: 'H3 video prompt', onChange: () => {} }));
    const textarea = html.match(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/)?.[1];
    assert.equal(textarea, text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
    assert.match(html, /text-emerald-300/);
});
