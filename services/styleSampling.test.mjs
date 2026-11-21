import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { uiModules, withUiKit } from '../components/ui/compileForTest.mjs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const galleryURL = compile(read('./styleGallery.ts')), galleryAPI = await import(galleryURL);
const samplingURL = compile(read('./styleSampling.ts').replace("from './styleGallery'", `from '${galleryURL}'`));
const api = await import(samplingURL);
const style = { id: 'saved-style', model: 'KREA2', title: 'VHS', prompt: 'Analog film', trigger: 'VHS',
    lora: 'KREA\\vhs.safetensors', strength: 0.65, notes: 'Keep these notes',
    settings: { steps: 4, cfg: 2, sampler: 'heun', megapixels: 2 },
    libraryLink: { path: 'C:\\models\\loras\\KREA\\vhs.safetensors', sha256: 'known-hash' } };
const sampling = { steps: 8, cfg: 1, sampler: 'euler', scheduler: 'bong_tangent' };
function storage(t, styles = [style]) {
    const names = ['localStorage', 'window', 'samplingGallery', 'samplingGalleryError'];
    const old = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    const values = new Map([[galleryAPI.STYLE_GALLERY_KEY, JSON.stringify({ version: 1, styles })]]), events = [];
    const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: event => events.push(event.type) } });
    globalThis.samplingGallery = { version: 1, styles }; globalThis.samplingGalleryError = '';
    t.after(() => { for (const [name, descriptor] of old) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    } });
    return { store, values, events, reload: () => galleryAPI.parseStyleGallery(store.getItem(galleryAPI.STYLE_GALLERY_KEY)) };
}
test('captures exactly the four editable KREA settings, including CFG zero', () => {
    assert.deepEqual(api.imageStyleSampling({ comfyModelType: 'krea2-simple', comfySteps: 8, comfyCfg: 1,
        comfySampler: 'euler', comfyScheduler: 'bong_tangent', comfySeed: 42, comfyKreaStyle: style }), sampling);
    assert.equal(api.imageStyleSampling({ comfyModelType: 'krea2-simple', comfyCfg: 0 }).cfg, 0);
    assert.deepEqual(api.imageStyleSampling({ comfyModelType: 'krea2-simple' }),
        { steps: 10, cfg: 1, sampler: 'er_sde', scheduler: 'beta' });
    assert.throws(() => api.imageStyleSampling({ comfyModelType: 'krea2-raw' }), /no gallery style/);
});
test('FLUX2 capture uses each mode controls and its actual automatic scheduler', () => {
    const options = { comfySteps: 8, comfyCfg: 0, comfySampler: 'heun', comfyScheduler: 'bong_tangent',
        comfyFlux2EditSteps: 12, comfyFlux2EditCfg: 2, comfyFlux2EditSampler: 'euler' };
    assert.deepEqual(api.imageStyleSampling({ ...options, comfyModelType: 'flux2-simple' }),
        { steps: 8, cfg: 0, sampler: 'heun', scheduler: 'flux2' });
    assert.deepEqual(api.imageStyleSampling({ ...options, comfyModelType: 'flux2-edit' }),
        { steps: 12, cfg: 2, sampler: 'euler', scheduler: 'flux2' });
    assert.equal(api.imageStyleSampling({ ...options, comfyModelType: 'flux2-simple', comfyFlux2Style: { ...style, settings: { scheduler: 'beta' } },
        comfyFlux2UseStyleSettings: true }).scheduler, 'beta');
    assert.equal(api.imageStyleSampling({ ...options, comfyModelType: 'flux2-edit', comfyFlux2EditStyle: { ...style, settings: { scheduler: 'bong_tangent' } },
        comfyFlux2EditUseStyleSettings: true }).scheduler, 'bong_tangent');
});
test('saves through reload/export and merges only four defaults into the latest gallery', t => {
    const latest = { ...style, title: 'Renamed VHS', prompt: 'Updated prompt', trigger: 'NEW_TRIGGER',
        lora: 'KREA\\new.safetensors', strength: 0.25, notes: 'Concurrent edit',
        libraryLink: { path: 'C:\\new.safetensors', sha256: 'new-hash' }, settings: { ...style.settings, megapixels: 3 } };
    const other = { ...style, id: 'other', title: 'Other' };
    const { reload, events } = storage(t, [latest, other]), before = structuredClone(style);
    const saved = api.saveStyleSampling(style, sampling);
    assert.deepEqual(saved, { ...latest, settings: { ...latest.settings, ...sampling } });
    assert.deepEqual(reload().styles, [saved, other]);
    assert.deepEqual(galleryAPI.parseStyleGallery(JSON.stringify(reload())), reload(), 'JSON import/export retains scheduler');
    assert.deepEqual(style, before, 'selected snapshot is immutable');
    assert.deepEqual(events, [galleryAPI.STYLE_GALLERY_KEY], 'notifies all gallery subscribers once');
});
test('version-one galleries without scheduler remain compatible', t => {
    const { reload } = storage(t);
    assert.deepEqual(reload().styles[0], style);
    assert.equal(reload().styles[0].settings.scheduler, undefined);
});
test('H3 saves its three supported sampling defaults without inventing or overwriting CFG', t => {
    const h3 = { ...style, model: 'MiniMax H3' }, { reload } = storage(t, [h3]);
    const supported = { steps: 9, sampler: 'seeds_2', scheduler: 'h3-beta' };
    const saved = api.saveStyleSampling(h3, supported);
    assert.deepEqual(saved.settings, { ...style.settings, ...supported });
    assert.deepEqual(reload().styles[0].settings, saved.settings);
    assert.equal(reload().styles[0].model, 'H3');
    assert.equal(saved.settings.cfg, 2);
});
test('invalid and incomplete sampling fails explicitly before storage is overwritten', t => {
    const { values, events } = storage(t), before = values.get(galleryAPI.STYLE_GALLERY_KEY);
    for (const invalid of [{ steps: 0 }, { steps: 1.5 }, { steps: NaN }, { cfg: -1 }, { cfg: Infinity },
        { sampler: '' }, { scheduler: '' }, { steps: undefined }, { cfg: undefined }, { sampler: undefined }, { scheduler: undefined }]) {
        assert.throws(() => api.saveStyleSampling(style, { ...sampling, ...invalid }), /Invalid|empty/);
        assert.equal(values.get(galleryAPI.STYLE_GALLERY_KEY), before);
    }
    assert.deepEqual(events, []);
});
test('missing styles, changed model and storage failure do not resurrect or overwrite styles', t => {
    const { store, values, events } = storage(t), before = values.get(galleryAPI.STYLE_GALLERY_KEY);
    assert.throws(() => api.saveStyleSampling({ ...style, id: 'deleted' }, sampling), /not in the style manager/);
    assert.throws(() => api.saveStyleSampling({ ...style, model: 'FLUX2-9B' }, sampling), /model changed/);
    store.setItem = () => { throw new Error('Storage quota exceeded'); };
    assert.throws(() => api.saveStyleSampling(style, sampling), /Storage quota exceeded/);
    assert.equal(values.get(galleryAPI.STYLE_GALLERY_KEY), before); assert.deepEqual(events, []);
});
test('FLUX2 saves its native scheduler, including legacy FLUX2 model aliases', t => {
    const flux = { ...style, model: 'FLUX2' }, { reload } = storage(t, [flux]);
    api.saveStyleSampling(flux, sampling);
    assert.equal(reload().styles[0].settings.scheduler, 'bong_tangent');
    api.saveStyleSampling(flux, { ...sampling, cfg: 0, scheduler: 'flux2' });
    assert.equal(reload().styles[0].model, 'FLUX2-9B');
    assert.deepEqual(reload().styles[0].settings, { ...style.settings, ...sampling, cfg: 0, scheduler: 'flux2' });
});
test('automatic scheduling is untouched and a forced scheduler validates its graph connections', () => {
    const graph = { model: { class_type: 'UNETLoader', inputs: {} },
        guider: { class_type: 'CFGGuider', inputs: { model: ['model', 0] } },
        scheduler: { class_type: 'Flux2Scheduler', inputs: { steps: 8, width: 1024, height: 1024 } },
        sample: { class_type: 'SamplerCustomAdvanced', inputs: { guider: ['guider', 0], sigmas: ['scheduler', 0] } } };
    const before = structuredClone(graph);
    galleryAPI.applyFlux2StyleScheduler(graph); assert.deepEqual(graph, before);
    galleryAPI.applyFlux2StyleScheduler(graph, 'flux2'); assert.deepEqual(graph, before);
    galleryAPI.applyFlux2StyleScheduler(graph, 'beta');
    assert.deepEqual(graph.scheduler, { class_type: 'BasicScheduler', inputs: { model: ['model', 0], scheduler: 'beta', steps: 8, denoise: 1 } });
    assert.deepEqual(graph.sample, before.sample); assert.deepEqual(graph.guider, before.guider);
    const broken = structuredClone(before); delete broken.sample;
    assert.throws(() => galleryAPI.applyFlux2StyleScheduler(broken, 'beta'), /no sampler connection/);
    broken.sample = before.sample; broken.guider.inputs.model = ['missing', 0];
    assert.throws(() => galleryAPI.applyFlux2StyleScheduler(broken, 'beta'), /no valid sampling model/);
    assert.throws(() => galleryAPI.applyFlux2StyleScheduler(before, ''), /cannot be empty/);
});

const require = createRequire(import.meta.url), reactURL = pathToFileURL(require.resolve('react')).href;
const hookURL = compile('export const useStyleGallery = () => ({ gallery: globalThis.samplingGallery, error: globalThis.samplingGalleryError });');
const buttonSource = read('../components/SaveStyleSamplingButton.tsx');
const buttonURL = compile(buttonSource.replace("from 'react'", `from '${reactURL}'`)
    .replace("from '../services/styleSampling'", `from '${samplingURL}'`).replace("from './useStyleGallery'", `from '${hookURL}'`));
const { SaveStyleSamplingButton } = await import(buttonURL);
const markup = props => renderToStaticMarkup(React.createElement(SaveStyleSamplingButton, { style, sampling, disabled: false, ...props }));
test('actual save button is disabled without a style, while busy, or when gallery cannot load', t => {
    storage(t);
    assert.doesNotMatch(markup(), /<button[^>]*\sdisabled=/);
    assert.match(markup({ style: undefined }), /<button[^>]*\sdisabled=/);
    assert.match(markup({ disabled: true }), /<button[^>]*\sdisabled=/);
    globalThis.samplingGallery = null; globalThis.samplingGalleryError = 'Invalid gallery contents';
    assert.match(markup(), /<button[^>]*\sdisabled=/); assert.match(markup(), /role="alert"[^>]*>Invalid gallery contents/);
});
const tree = ts.createSourceFile('button.tsx', buttonSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let saveHandler;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'save') saveHandler = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
};
visit(tree); assert.ok(saveHandler);
const { click } = await import(compile(`import { saveStyleSampling } from '${samplingURL}';
    export const click = (style, sampling, onSaved) => {
        let error = '', status = '';
        const setError = value => error = value, setStatus = value => status = value;
        const save = ${saveHandler}; save(); return {error, status};
    };`));
test('real click handler persists the exact values, reports success and refreshes the active snapshot', t => {
    const { reload } = storage(t); let updated;
    const result = click(style, sampling, value => updated = value);
    assert.equal(result.error, ''); assert.match(result.status, /8 steps.*CFG 1.*euler.*bong_tangent/);
    assert.deepEqual(updated, sampling); assert.deepEqual(reload().styles[0].settings, { ...style.settings, ...sampling });
});
test('real click handler reports failures and does not refresh a snapshot after a failed write', t => {
    const { store } = storage(t); let called = false;
    store.setItem = () => { throw new Error('Storage quota exceeded'); };
    const result = click(style, sampling, () => called = true);
    assert.match(result.error, /Storage quota exceeded/); assert.equal(result.status, ''); assert.equal(called, false);
});
test('a failed snapshot callback does not misreport a successful gallery write', t => {
    const { reload } = storage(t);
    const result = click(style, sampling, () => { throw new Error('Update failed'); });
    assert.match(result.error, /Defaults were saved.*refreshing the active generator failed.*Update failed/);
    assert.match(result.status, /Defaults saved/);
    assert.deepEqual(reload().styles[0].settings, { ...style.settings, ...sampling });
});
const inputsURL = compile(withUiKit(read('../components/InputComponents.tsx')));
const panelSource = read('../components/SamplerSettingsPanel.tsx');
const { SamplerSettingsPanel } = await import(compile(`
    import React, {useMemo, useState} from '${reactURL}';
    import {NumberSlider, SelectInput, TextInput} from '${inputsURL}';
    import {Accordion} from '${uiModules.Accordion}';
    import {Select} from '${uiModules.Select}';
    import {SaveStyleSamplingButton} from '${buttonURL}';
    import {imageStyleSampling} from '${samplingURL}';
    const Qwen21SettingsPanel = () => null, MossSettingsPanel = () => null, Krea2EditSettingsPanel = () => null;
    ${panelSource.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`));
test('KREA and FLUX2 Simple render one button beside controls with matching fallback values', t => {
    storage(t);
    for (const model of ['krea2-simple', 'flux2-simple']) {
        const html = renderToStaticMarkup(React.createElement(SamplerSettingsPanel, { options: { comfyModelType: model,
            comfyKreaStyle: style, comfyFlux2Style: { ...style, model: 'FLUX2-9B' } },
            updateOptions() {}, isDisabled: false, comfyUIObjectInfo: {} }));
        assert.equal(html.split('Save sampling as style default').length - 1, 1);
        assert.match(html, /aria-label="Steps slider"[^>]* value="10"/); assert.match(html, /aria-label="CFG Scale slider"[^>]* value="1"/);
        assert.match(html, model === 'krea2-simple' ? />beta<\/span>/ : /Flux2Scheduler \(automatic\)/);
        assert.ok(html.indexOf('Scheduler') < html.indexOf('Save sampling as style default'));
    }
    const raw = renderToStaticMarkup(React.createElement(SamplerSettingsPanel, { options: { comfyModelType: 'krea2-raw' },
        updateOptions() {}, isDisabled: false, comfyUIObjectInfo: {} }));
    assert.doesNotMatch(raw, /Save sampling as style default/);
});
test('all image save callbacks merge sampling only and do not toggle style overrides', () => {
    for (const name of ['../components/SamplerSettingsPanel.tsx', '../components/ImageStyleControl.tsx']) {
        const text = read(name), tree = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const callbacks = [];
        const visit = node => {
            if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onSaved') callbacks.push(node.initializer.expression.getText(tree));
            ts.forEachChild(node, visit);
        };
        visit(tree); assert.equal(callbacks.length, 1);
        const callback = callbacks[0], updates = [];
        const invoke = new Function('updateOptions', 'style', 'options', 'modelType', 'styleKey', `const isMoss = false; return (${callback});`);
        for (const [modelType, styleKey] of [['krea2-simple', 'comfyKreaStyle'], ['flux2-simple', 'comfyFlux2Style'], ['flux2-edit', 'comfyFlux2EditStyle']]) {
            if (name.includes('SamplerSettings') && modelType === 'flux2-edit') continue;
            const options = { [styleKey]: style };
            invoke(value => updates.push(value), style, options, modelType, styleKey)(sampling);
            assert.deepEqual(updates.pop(), { [styleKey]: { ...style, settings: { ...style.settings, ...sampling } } });
        }
    }
});
const { ImageStyleControl } = await import(compile(`
    import React, {useMemo, useState} from '${reactURL}';
    import {useStyleGallery} from '${hookURL}';
    import {SaveStyleSamplingButton} from '${buttonURL}';
    import {imageStyleSampling} from '${samplingURL}';
    import {NumberField} from '${uiModules.fields}';
    import {ui} from '${uiModules.styles}';
    const useModelInventory = () => ({inventory:{root:'',scannedAt:null,items:[]},loading:false,error:''});
    const inferFlux2Variant = () => 'flux2-9b', StylePicker = () => null;
    const flux2StyleOptions = options => options, krea2StyleOptions = options => options;
    ${read('../components/ImageStyleControl.tsx').replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`));
test('FLUX2 Edit shows one save button and other style selectors avoid duplicate buttons', t => {
    storage(t);
    const options = { comfyKreaStyle: style, comfyFlux2Style: { ...style, model: 'FLUX2-9B' },
        comfyFlux2EditStyle: { ...style, model: 'FLUX2-9B' }, comfyFlux2EditSteps: 8, comfyFlux2EditCfg: 0 };
    for (const mode of ['i2i', 't2i', 'krea2-simple']) {
        const html = renderToStaticMarkup(React.createElement(ImageStyleControl, { options, mode, updateOptions() {}, info: {}, disabled: false }));
        assert.equal(html.split('Save sampling as style default').length - 1, mode === 'i2i' ? 1 : 0);
    }
});
