import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { uiModules } from './compileForTest.mjs';

const { Select, selectItems } = await import(uiModules.Select);
const { PromptBox, promptParts } = await import(uiModules.PromptBox);
const { Accordion } = await import(uiModules.Accordion);
const { SamplerFields, ModelFields, LoraSlots, SeedField, Button } = await import(uiModules.fields);
const { SettingsLayout } = await import(uiModules.SettingsLayout);
const render = (component, props, ...children) => renderToStaticMarkup(React.createElement(component, { onChange() {}, ...props }, ...children));
const count = (html, text) => html.split(text).length - 1;

test('a value missing from the options stays visible and is never replaced by the first option', () => {
    assert.deepEqual(selectItems(['a', 'b'], 'b'), [{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
    assert.deepEqual(selectItems(['a', 'b'], 'gone.safetensors')[0], { value: 'gone.safetensors', label: 'gone.safetensors (not listed)', disabled: false, missing: true });
    assert.deepEqual(selectItems(['a'], '', 'Select a model')[0], { value: '', label: 'Select a model', disabled: true, missing: true });
    assert.equal(selectItems([{ value: '', label: 'None' }, 'a'], '').length, 2);
    assert.equal(selectItems([{ value: 7, label: 'Seven' }], '7').length, 1);
    const html = render(Select, { label: 'Model', value: 'gone.safetensors', options: ['a.safetensors'] });
    assert.match(html, /<option value="gone\.safetensors" selected="">gone\.safetensors \(not listed\)<\/option><option value="a\.safetensors">/);
});

test('the native variant keeps the accessible name first and links its visible label', () => {
    const html = render(Select, { label: 'Sampler', value: 'euler', options: ['euler', { value: 'heun', label: 'Heun', disabled: true }], hint: 'Pick one', error: 'Unavailable' });
    assert.match(html, /<label for="([^"]+)" class="block text-sm font-medium text-text-secondary">Sampler<\/label><select aria-label="Sampler" id="\1"/);
    assert.match(html, /<option value="euler" selected="">euler<\/option><option value="heun" disabled="">Heun<\/option>/);
    assert.match(html, /Pick one/); assert.match(html, /role="alert"[^>]*>Unavailable/);
    assert.match(render(Select, { label: 'Sampler', ariaLabel: 'Outpaint sampler', value: 'euler', options: ['euler'], disabled: true }), /<select aria-label="Outpaint sampler"[^>]*disabled=""/);
});

test('the search variant renders a closed, named button and no list until it is opened', () => {
    const html = render(Select, { variant: 'search', label: 'LoRA', value: 'b', options: ['a', 'b'] });
    assert.match(html, /<button type="button" id="[^"]+" aria-label="LoRA" aria-haspopup="listbox" aria-expanded="false"/);
    assert.match(html, /<span class="truncate ">b<\/span>/);
    assert.equal(count(html, 'role="listbox"'), 0); assert.equal(count(html, 'role="option"'), 0);
    assert.match(render(Select, { variant: 'search', value: 'x', options: ['a'] }), /italic text-text-muted">x \(not listed\)/);
});

test('prompt roles are color coded with theme colors and expose a stable accessible name', () => {
    const edges = { positive: 'border-l-highlight-green', negative: 'border-l-danger', instruction: 'border-l-accent', readonly: 'border-dashed' };
    for (const [kind, edge] of Object.entries(edges)) assert.ok(render(PromptBox, { label: 'Prompt', value: 'text', kind }).includes(edge), kind);
    const html = render(PromptBox, { label: 'Positive prompt', ariaLabel: 'Outpaint prompt', value: 'a cat', copyable: true, clearable: true, hint: 'Sent verbatim' });
    assert.match(html, /<textarea id="[^"]+" aria-label="Outpaint prompt"/);
    assert.match(html, /aria-label="Copy Outpaint prompt"/); assert.match(html, /aria-label="Clear Outpaint prompt"/); assert.match(html, /Sent verbatim/);
    const fixed = render(PromptBox, { label: 'Final prompt', value: 'a cat', kind: 'readonly', clearable: true });
    assert.match(fixed, /readOnly=""/); assert.doesNotMatch(fixed, /Clear Final prompt/);
    assert.match(renderToStaticMarkup(React.createElement(PromptBox, { label: 'Preview', value: 'a cat' })), /readOnly=""/);
});

test('prompt syntax is colored behind the text without changing it', () => {
    const text = 'a (red coat:1.2) <lora:style:0.8> near <Picture 2>, __season__ {day|night} BREAK plain (note) <b>';
    const parts = promptParts(text);
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.deepEqual(parts.filter(part => part.className).map(part => part.text), ['(red coat:1.2)', '<lora:style:0.8>', '<Picture 2>', '__season__', '{day|night}', 'BREAK']);
    assert.equal(new Set(parts.filter(part => part.className).map(part => part.className)).size, 5);
    const html = render(PromptBox, { label: 'Prompt', value: text });
    assert.equal(count(html, 'data-prompt-highlight'), 1); assert.match(html, /text-transparent caret-accent/);
    assert.match(html, /<span class="rounded-sm bg-violet-500\/30">\(red coat:1\.2\)<\/span>/);
    const plain = render(PromptBox, { label: 'Notes', value: text, kind: 'neutral' });
    assert.equal(count(plain, 'data-prompt-highlight'), 0); assert.doesNotMatch(plain, /text-transparent/);
    const custom = render(PromptBox, { label: 'Prompt', value: 'x', highlight: value => [{ text: value, className: 'bg-custom' }] });
    assert.match(custom, /<span class="rounded-sm bg-custom">x<\/span>/);
});

test('accordion content is mounted only while open', () => {
    let built = 0;
    const closed = renderToStaticMarkup(React.createElement(Accordion, { title: 'Advanced' }, () => { built++; return 'inside'; }));
    assert.equal(built, 0); assert.doesNotMatch(closed, /inside/); assert.match(closed, /<details class="[^"]*"><summary/);
    const open = renderToStaticMarkup(React.createElement(Accordion, { title: 'Models', defaultOpen: true }, () => { built++; return 'inside'; }));
    assert.equal(built, 1); assert.match(open, /<details open=""/); assert.match(open, /inside/);
});

test('settings sections always appear in the order Models, LoRAs, Sampler, Advanced', () => {
    const html = renderToStaticMarkup(React.createElement(SettingsLayout, {
        label: 'Outpaint', disabled: true, advanced: 'advanced', sampler: 'sampler', loras: 'loras', models: 'models', top: 'top', actions: 'actions',
    }, 'main'));
    const order = ['top', '>Models<', '>LoRAs<', '>Sampler<', '>Advanced<', 'actions'].map(text => html.indexOf(text));
    assert.ok(order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1])), String(order));
    assert.match(html, /<aside aria-label="Outpaint options"/); assert.match(html, /<fieldset disabled=""/);
    assert.match(html, /aria-label="Outpaint prompt and results"[^>]*>main/);
    assert.equal(count(html, '<details'), 4);
    assert.equal(count(renderToStaticMarkup(React.createElement(SettingsLayout, { label: 'Outpaint', sampler: 'sampler' }, 'main')), '<details'), 1);
});

test('sampler, model, LoRA and seed fields carry the workflow name and only show what is provided', () => {
    const sampler = render(SamplerFields, { name: 'Outpaint', value: { sampler: 'euler', steps: 8, cfg: 1 }, samplers: ['euler'] });
    for (const label of ['Outpaint Sampler', 'Outpaint Steps', 'Outpaint CFG']) assert.ok(sampler.includes(`aria-label="${label}"`), label);
    for (const label of ['Scheduler', 'Denoise']) assert.ok(!sampler.includes(label), label);
    assert.ok(sampler.indexOf('Outpaint Sampler') < sampler.indexOf('Outpaint Steps') && sampler.indexOf('Outpaint Steps') < sampler.indexOf('Outpaint CFG'));
    // Bounded settings keep a slider beside the manual field; the field keeps the plain accessible name.
    assert.match(sampler, /<input type="range" aria-label="Outpaint Steps slider" min="1" max="200" step="1"[^>]*value="8"/);
    assert.match(sampler, /aria-label="Outpaint Steps" type="number" min="1" max="200" step="1"[^>]*value="8"/);
    assert.equal(count(sampler, 'type="range"'), 2);
    const models = render(ModelFields, { name: 'Outpaint', fields: [{ id: 'unet', label: 'Diffusion model', value: '', choices: ['a'] }, { id: 'vae', label: 'VAE', value: 'v', choices: ['v'] }] });
    assert.match(models, /aria-label="Outpaint Diffusion model"[^>]*>.*Select a model/); assert.match(models, /aria-label="Outpaint VAE"/);
    const loras = render(LoraSlots, { name: 'Outpaint', choices: ['a.safetensors'], slots: [{ enabled: true, name: 'a.safetensors', strength: 0.8 }, { enabled: false, name: '', strength: 1 }] });
    assert.equal(count(loras, 'type="checkbox"'), 2);
    assert.match(loras, /aria-label="Outpaint LoRA 1 file"/); assert.match(loras, /aria-label="Outpaint LoRA 1 strength"[^>]*value="0\.8"/);
    assert.match(loras, /type="range" aria-label="Outpaint LoRA 1 strength slider"/);
    assert.doesNotMatch(loras, /Outpaint LoRA 2 file/);
    const seed = render(SeedField, { name: 'Outpaint', value: 42, randomize: true, onRandomizeChange() {} });
    assert.match(seed, /aria-label="Outpaint Seed"[^>]*value="42"/); assert.match(seed, /aria-label="Outpaint Random seed"/); assert.match(seed, /aria-label="Outpaint Randomize seed"[^>]*checked=""/);
    assert.equal(count(seed, 'type="range"'), 0);
    assert.doesNotMatch(render(SeedField, { value: 42 }), /Randomize seed/);
    assert.match(renderToStaticMarkup(React.createElement(Button, { variant: 'primary' }, 'Generate')), /<button type="button" class="[^"]*bg-accent text-accent-text/);
});
