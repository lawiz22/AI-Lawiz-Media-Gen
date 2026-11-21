import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { uiModules } from '../components/ui/compileForTest.mjs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const galleryURL = compile(read('./styleGallery.ts'));
const mossStyleURL = compile(read('./mossStyleWorkflow.ts').replace("from './styleGallery'", `from '${galleryURL}'`));
const qwenURL = compile(read('./qwen21Workflow.ts')), civitaiURL = compile(read('./civitaiService.ts'));
const libraryURL = compile(read('./styleLibrary.ts').replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './styleGallery'", `from '${galleryURL}'`));
const mossURL = compile(read('./mossWorkflow.ts').replace("from './qwen21Workflow'", `from '${qwenURL}'`)
    .replace("from './styleGallery'", `from '${galleryURL}'`).replace("from './mossStyleWorkflow'", `from '${mossStyleURL}'`));
const photoURL = compile(read('./mossPhotoWorkflow.ts')
    .replace("import template from '../assets/mossPhotoWorkflow.json';", `const template = ${read('../assets/mossPhotoWorkflow.json')};`)
    .replace("from './qwen21Workflow'", `from '${qwenURL}'`).replace("from './mossStyleWorkflow'", `from '${mossStyleURL}'`));
const { defaultMossSettings } = await import(mossURL), { defaultMossPhotoSettings } = await import(photoURL);
const gallery = await import(galleryURL), library = await import(libraryURL);
const require = createRequire(import.meta.url), reactURL = pathToFileURL(require.resolve('react')).href;
const style = { id: 'moss-ink', model: 'MOSS', title: 'Ink', prompt: 'Ink image', trigger: 'INK', lora: 'moss\\ink.safetensors',
    strength: 0.65, settings: { steps: 8, cfg: 0, sampler: 'euler', scheduler: 'beta' }, notes: 'Keep notes' };
const paint = { ...style, id: 'moss-paint', title: 'Paint', prompt: 'Oil paint', trigger: 'PAINT', lora: 'paint.safetensors' };
const names = ['moss\\ink.safetensors', 'moss\\paint.safetensors', 'moss\\detail.safetensors'];
const inventory = { root: '', scannedAt: null, items: [] };
const control = await import(compile(`
    import React from '${reactURL}';
    import {appendGalleryStylePrompt, resolveStyleLora} from '${galleryURL}';
    import {resolveLibraryStyle, styleInstalledLoras} from '${libraryURL}';
    import {mossGalleryStyle, mossStyleLoraMatches} from '${mossStyleURL}';
    import {defaultMossSettings} from '${mossURL}';
    import {defaultMossPhotoSettings, mossPhotoPrompt, mossPhotoSampling} from '${photoURL}';
    import {NumberField} from '${uiModules.fields}';
    import {ui} from '${uiModules.styles}';
    export let picker, saveButton;
    const useState = value => [value, () => {}], useMemo = fn => fn();
    const inventory = ${JSON.stringify(inventory)}, names = ${JSON.stringify(names)};
    const useModelInventory = () => ({inventory,loading:false,error:''});
    const useStyleGallery = () => ({gallery:{version:1,styles:[${JSON.stringify(style)},${JSON.stringify(paint)}]},error:''});
    const h3Choices = (_info, cls) => cls === 'LoraLoaderModelOnly' ? names : ['euler','heun'];
    const StylePicker = props => {picker=props; return React.createElement('button', {disabled:props.disabled}, 'Choose style');};
    const SaveStyleSamplingButton = props => {saveButton=props; return React.createElement('button', {disabled:props.disabled}, 'Save sampling as style default');};
    ${read('../components/ImageStyleControl.tsx').replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`));
const render = (mode, settings, disabled = false) => {
    const key = mode === 'moss-photo' ? 'comfyMossPhoto' : 'comfyMoss', patches = [];
    const options = { comfyModelType: mode, comfyPrompt: 'Red coat', [key]: settings, comfySeed: 42 };
    const html = renderToStaticMarkup(React.createElement(control.ImageStyleControl, { mode, options,
        updateOptions: patch => patches.push(patch), info: {}, disabled }));
    return { html, patches, options, key };
};
test('MOSS styles share model aliases, filtered installed LoRAs and My Library links without unfiltered scanning', () => {
    for (const model of ['MOSS', 'moss', 'MOSS Image', 'moss-photo']) assert.equal(gallery.normalizeStyleModel(model), 'MOSS');
    const item = { kind: 'lora', path: 'C:\\models\\style.safetensors', relativePath: 'loras\\Custom\\style.safetensors',
        fileName: 'style.safetensors', userFamily: 'moss', sha256: 'hash', usageMetadata: { triggerWords: ['LIBRARY'], steps: 8, cfg: 0, sampler: 'Euler' } };
    const wrong = { ...item, path: 'C:\\models\\wrong.safetensors', relativePath: 'loras\\moss\\wrong.safetensors', userFamily: 'flux' };
    const inv = { ...inventory, items: [item, wrong] };
    assert.deepEqual(library.styleInstalledLoras(['MOSS\\ink.safetensors', 'KREA\\other.safetensors', 'Custom\\style.safetensors', 'moss\\wrong.safetensors'], 'MOSS', inv),
        ['MOSS\\ink.safetensors', 'Custom\\style.safetensors']);
    const linked = library.linkStyleLibrary({ ...style, lora: '', trigger: '', settings: {} }, item);
    const resolved = library.resolveLibraryStyle(linked, inv, ['euler']);
    assert.equal(resolved.item, item); assert.equal(resolved.style.trigger, 'LIBRARY');
    assert.deepEqual(resolved.style.settings, { steps: 8, cfg: 0, sampler: 'euler' });
    assert.ok(read('../components/StyleGalleryPanel.tsx').includes("'KREA2', 'MOSS'"));
});
test('actual MOSS Image selector applies/clears styles without changing prompts, models, seed or independent LoRAs', () => {
    const settings = { ...defaultMossSettings(), style, styleStrength: 1.5,
        loras: [{ enabled: true, name: style.lora, strength: 0.4 }, { enabled: true, name: names[2], strength: 0.3 }] };
    const before = structuredClone(settings), result = render('moss-image', settings);
    assert.ok(result.html.includes('Style Gallery · MOSS'));
    assert.ok(result.html.includes('Active style LoRA')); assert.ok(result.html.includes('value="1.5"'));
    assert.equal(control.picker.model, 'MOSS'); assert.equal(control.picker.onSelect(paint), true);
    const next = result.patches[0].comfyMoss;
    assert.equal(next.style.lora, names[1]); assert.equal(next.styleStrength, undefined);
    assert.deepEqual(next.loras[0], { enabled: false, name: '', strength: 0.4 }); assert.deepEqual(next.loras[1], settings.loras[1]);
    assert.deepEqual(settings, before); assert.deepEqual(Object.keys(result.patches[0]), ['comfyMoss']);
    const cleared = render('moss-image', next);
    assert.equal(control.picker.onSelect(null), true);
    assert.equal(cleared.patches[0].comfyMoss.style, undefined);
    assert.deepEqual(cleared.patches[0].comfyMoss.loras[1], settings.loras[1]);
});
test('actual PHOTO selector and sampling-save callback preserve Look, ownStyle, lens, extra settings and other LoRAs', () => {
    const settings = { ...defaultMossPhotoSettings(), style, look: 'F', ownStyle: 'Vintage warmth', focal: '85mm', secondPass: true };
    settings.nodes['160'] = { ...settings.nodes['160'], 'lora 1': style.lora, 'lora 2': names[2], 'lora 2 strength': 0.4 };
    const before = structuredClone(settings), result = render('moss-photo', settings);
    assert.ok(result.html.includes('does not replace them')); assert.ok(result.html.includes('INK'));
    assert.equal(control.picker.onSelect(paint), true);
    const next = result.patches[0].comfyMossPhoto;
    assert.equal(next.nodes['160']['lora 1'], 'None');
    assert.equal(next.nodes['160']['lora 2'], names[2]); assert.equal(next.style.lora, names[1]);
    for (const key of ['look', 'ownStyle', 'focal', 'secondPass', 'steps', 'ratio', 'ideas', 'myPrompts']) assert.deepEqual(next[key], settings[key]);
    render('moss-photo', settings);
    assert.deepEqual(control.saveButton.sampling, { steps: 25, cfg: 3, sampler: 'er_sde', scheduler: 'simple' });
    const sampling = { steps: 12, cfg: 0, sampler: 'euler', scheduler: 'bong_tangent' }, saved = render('moss-photo', settings);
    control.saveButton.onSaved(sampling);
    assert.deepEqual(saved.patches[0].comfyMossPhoto, { ...settings, style: { ...style, settings: { ...style.settings, ...sampling } } });
    assert.deepEqual(settings, before);
    const locked = render('moss-photo', settings, true);
    assert.ok(locked.html.includes('disabled=""')); assert.equal(control.picker.disabled, true); assert.equal(control.saveButton.disabled, true);
});
test('missing/incompatible MOSS selections fail without changing settings', () => {
    const result = render('moss-image', defaultMossSettings());
    assert.equal(control.picker.onSelect({ ...paint, model: 'FLUX2-9B' }), false);
    assert.equal(control.picker.onSelect({ ...paint, lora: 'missing.safetensors' }), false);
    assert.deepEqual(result.patches, []);
});
