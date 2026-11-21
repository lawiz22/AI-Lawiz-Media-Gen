import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const civitaiURL = compile(read('./civitaiService.ts'));
const api = await import(compile(read('./styleLibrary.ts').replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './styleGallery'", `from '${compile(read('./styleGallery.ts'))}'`)));
const gallery = await import(compile(read('./styleGallery.ts')));
const item = (path = 'loras/FLUX2/style.safetensors', patch = {}) => ({
    path: `C:/ComfyUI/models/${path}`, relativePath: path, fileName: path.split('/').pop(), kind: 'lora',
    sha256: 'hash', sizeBytes: 1024, status: 'matched', hasUpdate: false, ...patch,
});
const inventory = (...items) => ({ root: 'C:/ComfyUI', scannedAt: '2026-11-01', items });
const style = (patch = {}) => ({
    id: 'test', title: 'My style', model: 'FLUX2-9B', lora: 'style.safetensors', strength: 0.7, trigger: '', prompt: 'A drawing',
    notes: '', settings: {}, ...patch,
});
test('listbox family filter keeps the family by name or My Library tag, drops the other FLUX2 variant and never empties a list', () => {
    const names = ['QWEN\\lightning-4steps.safetensors', 'FLUX2\\style-9b.safetensors', 'FLUX2\\style-4b.safetensors', 'FLUX2\\plain.safetensors', 'custom\\portrait.safetensors', 'SDXL\\detail-xl.safetensors'];
    assert.deepEqual(api.familyFiles(names, 'qwen-edit'), ['QWEN\\lightning-4steps.safetensors']);
    assert.deepEqual(api.familyFiles(names, 'sdxl'), ['SDXL\\detail-xl.safetensors']);
    assert.deepEqual(api.familyFiles(names, 'flux2'), ['FLUX2\\style-9b.safetensors', 'FLUX2\\style-4b.safetensors', 'FLUX2\\plain.safetensors']);
    assert.deepEqual(api.familyFiles(names, 'flux2-9b'), ['FLUX2\\style-9b.safetensors', 'FLUX2\\plain.safetensors']);
    assert.deepEqual(api.familyFiles(names, 'flux2-4b'), ['FLUX2\\style-4b.safetensors', 'FLUX2\\plain.safetensors']);
    const tagged = inventory(item('loras/custom/portrait.safetensors', { userFamily: 'qwen-edit' }));
    assert.deepEqual(api.familyFiles(names, 'qwen-edit', tagged), ['QWEN\\lightning-4steps.safetensors', 'custom\\portrait.safetensors']);
    assert.deepEqual(api.familyFiles(names, 'moss'), names, 'no MOSS file: the whole list stays available');
    assert.equal(api.flux2Family('flux2\\flux2Klein9BInt8_v10.safetensors'), 'flux2-9b');
    assert.equal(api.flux2Family('flux-2-klein-4b-Q4_K_M.gguf'), 'flux2-4b');
    assert.equal(api.flux2Family('custom-unet.safetensors'), 'flux2');
});
test('style triggers lead the prompt, move existing whole-token copies and never remove substrings or interpret regex syntax', () => {
    const selected = style({ trigger: 'INK_TRIGGER', prompt: 'Ink drawing' });
    for (const base of ['A portrait', 'A portrait INK_TRIGGER', 'ink_trigger\nA portrait INK_TRIGGER', 'A portrait INK_TRIGGER\nInk drawing']) {
        const prompt = gallery.appendGalleryStylePrompt(base, selected);
        assert.equal(prompt, 'INK_TRIGGER\nA portrait\nInk drawing');
        assert.equal(gallery.appendGalleryStylePrompt(prompt, selected), prompt);
    }
    assert.equal(gallery.appendGalleryStylePrompt('pink', style({ trigger: 'ink', prompt: '' })), 'ink\npink');
    assert.equal(gallery.appendGalleryStylePrompt('A portrait foo.bar (v2)+', style({ trigger: 'foo.bar (v2)+', prompt: '' })), 'foo.bar (v2)+\nA portrait');
    assert.equal(gallery.appendGalleryStylePrompt('A portrait', style({ trigger: '', prompt: 'Watercolor' })), 'A portrait\nWatercolor');
    assert.equal(gallery.prependGalleryStyleTrigger('A reference preserving identity', 'identity'), 'identity\nA reference preserving identity');
});
test('new-style choices exclude used LoRAs by exact path, unique filename and library link without crossing model families', () => {
    const used = item(), fresh = item('loras/FLUX2/fresh.safetensors');
    const names = ['flux2\\STYLE.safetensors', 'FLUX2/fresh.safetensors'];
    assert.deepEqual(api.unusedStyleLoras(names, [style()], 'FLUX2-9B', inventory(used, fresh)), [names[1]]);
    assert.deepEqual(api.unusedStyleLoras(names, [style({ model: 'FLUX2', lora: 'FLUX2/style.safetensors' })], 'FLUX2-9B', inventory()), [names[1]]);
    assert.deepEqual(api.unusedStyleLoras(names, [style({ model: 'FLUX2-4B' })], 'FLUX2-9B', inventory(used)), names);
    const renamed = item('loras/FLUX2/renamed.safetensors');
    const linked = api.linkStyleLibrary(style(), used);
    assert.deepEqual(api.unusedStyleLoras(['FLUX2/renamed.safetensors', names[1]], [linked], 'FLUX2-9B', inventory(renamed)), [names[1]]);
    assert.deepEqual(api.unusedStyleLoras(names, [style({ lora: '' })], 'FLUX2-9B', inventory(used)), names);
    const ambiguous = ['FLUX2/a/style.safetensors', 'FLUX2/b/style.safetensors'];
    assert.deepEqual(api.unusedStyleLoras(ambiguous, [style()], 'FLUX2-9B', inventory()), ambiguous);
    const panel = read('../components/StyleGalleryPanel.tsx');
    assert.ok(panel.includes('!gallery?.styles.some(style => style.id === editing.id)'));
    assert.equal(panel.match(/unusedStyleLoras\(/g).length, 2, 'both selectors filter new styles only');
});
test('legacy style migration preserves IDs, links, manual settings and prompts across import/export', () => {
    const legacy = style({ model: 'FLUX2', libraryLink: { path: 'C:/models/FLUX2/style.safetensors', sha256: 'hash' }, settings: { cfg: 0, steps: 8 } });
    const result = gallery.parseStyleGallery(JSON.stringify({ version: 1, styles: [legacy] }));
    assert.deepEqual(result.styles[0], { ...legacy, model: 'FLUX2-9B' });
    assert.deepEqual(gallery.parseStyleGallery(JSON.stringify(result)), result);
    assert.ok(gallery.defaultStyleGallery().styles.every(style => style.model === 'FLUX2-9B'));
});
test('style LoRA selectors and automatic links separate 9B and 4B including explicit library metadata', () => {
    const nine = item(), four = item('loras/FLUX2/unknown.safetensors', { userFamily: 'flux2-4b' });
    const other = item('loras/SDXL/flux2_9b.safetensors');
    const items = inventory(nine, four, other);
    assert.deepEqual(api.styleLibraryLoras(items, 'FLUX2-9B'), [nine]);
    assert.deepEqual(api.styleLibraryLoras(items, 'FLUX2-4B'), [four]);
    const names = ['FLUX2/style.safetensors', 'FLUX2/unknown.safetensors', 'FLUX2-4B/klein4b.safetensors', 'SDXL/flux2_9b.safetensors'];
    assert.deepEqual(api.styleInstalledLoras(names, 'FLUX2-4B', items), names.slice(1, 3));
    assert.deepEqual(api.styleInstalledLoras(names, 'FLUX2-9B', items), names.slice(0, 1));
    assert.equal(api.matchStyleLibrary(style({ lora: 'unknown.safetensors' }), items).item, undefined);
});
test('automatic matching uses the model family and exact path or unique filename, never an ambiguous guess', () => {
    const flux = item(), sdxl = item('loras/SDXL/style.safetensors', { sha256: 'other' });
    assert.deepEqual(api.styleLibraryLoras(inventory(flux, sdxl), 'FLUX2'), [flux]);
    assert.equal(api.matchStyleLibrary(style(), inventory(flux, sdxl)).item, flux);
    assert.equal(api.matchStyleLibrary(style({ lora: 'style' }), inventory(flux)).item, flux);
    assert.equal(api.resolveLibraryStyle(style(), inventory(flux, sdxl)).style.lora, 'FLUX2/style.safetensors');
    const duplicate = item('loras/FLUX2/nested/style.safetensors', { sha256: 'duplicate' });
    assert.ok(api.matchStyleLibrary(style(), inventory(flux, duplicate)).warning.includes('Several'));
    assert.equal(api.matchStyleLibrary(style({ lora: 'FLUX2/nested/style.safetensors' }), inventory(flux, duplicate)).item, duplicate);
});
test('link persists stable identity, preserves manual fields and follows a uniquely moved file by hash', () => {
    const selected = item(), before = style({ trigger: 'manual', settings: { steps: 8 } });
    const linked = api.linkStyleLibrary(before, selected);
    assert.equal(linked.title, before.title); assert.equal(linked.trigger, 'manual'); assert.equal(linked.strength, 0.7);
    assert.deepEqual(linked.settings, { steps: 8 });
    assert.equal(linked.lora, 'FLUX2/style.safetensors'); assert.equal(linked.libraryLink.path, selected.path);
    gallery.validateStyleGallery({ version: 1, styles: [linked] });
    assert.deepEqual(gallery.parseStyleGallery(JSON.stringify({ version: 1, styles: [linked] })).styles[0], linked);
    const moved = item('loras/FLUX2/renamed.safetensors');
    assert.equal(api.resolveLibraryStyle(linked, inventory(moved)).style.lora, 'FLUX2/renamed.safetensors');
    assert.ok(api.matchStyleLibrary(linked, inventory()).warning.includes('missing'));
    assert.equal(api.matchStyleLibrary(linked, inventory(item('loras/FLUX2/a.safetensors'), moved)).item, undefined);
});
test('only missing supported fields are filled; manual zero, triggers, strength and prompts win', () => {
    const selected = item(undefined, { usageMetadata: {
        triggerWords: ['library trigger'], steps: 12, cfg: 0, sampler: 'DPM++ 2M Karras', scheduler: 'karras', guidance: 4,
        source: 'manual', updatedAt: 'now',
    } });
    const manual = style({ settings: { steps: 5, cfg: 2 }, trigger: 'manual trigger' });
    const before = structuredClone(manual);
    const result = api.resolveLibraryStyle(manual, inventory(selected), ['euler', 'dpmpp_2m']);
    assert.deepEqual(manual, before);
    assert.equal(result.style.trigger, 'manual trigger'); assert.equal(result.style.strength, 0.7);
    assert.equal(result.style.prompt, 'A drawing');
    assert.deepEqual(result.style.settings, { steps: 5, cfg: 2, sampler: 'dpmpp_2m' });
    assert.deepEqual(result.filled, ['sampler']);
    const empty = api.resolveLibraryStyle(style(), inventory(selected), ['dpmpp_2m']);
    assert.equal(empty.style.trigger, 'library trigger');
    assert.deepEqual(empty.style.settings, { steps: 12, cfg: 0, sampler: 'dpmpp_2m' });
    assert.deepEqual(api.resolveLibraryStyle(style({ settings: { cfg: 0, sampler: 'heun' } }), inventory(selected)).style.settings, { cfg: 0, sampler: 'heun', steps: 12 });
});
test('missing and invalid metadata never create invented settings or erase the stored style', () => {
    assert.deepEqual(api.resolveLibraryStyle(style(), inventory()).style, style());
    const result = api.resolveLibraryStyle(style(), inventory(item(undefined, { usageMetadata: { steps: 1.5, cfg: -1, sampler: 'not installed' } })), ['euler']);
    assert.deepEqual(result.style.settings, {}); assert.equal(result.warnings.length, 3);
    assert.equal(api.matchStyleLibrary(style({ lora: '' }), inventory(item())).item, undefined);
});
const reactURL = compile('export const useEffect = () => {}; export const useSyncExternalStore = (_, read) => read();');
const hook = await import(compile(read('../components/useModelInventory.ts').replace("from 'react'", `from '${reactURL}'`)));
test('inventory consumers share one metadata read, updates and errors without rescanning models', async t => {
    const previous = globalThis.window; let reads = 0, finish;
    globalThis.window = { electron: { getCivitaiInventory: () => { reads++; return new Promise(resolve => { finish = resolve; }); } } };
    t.after(() => { globalThis.window = previous; });
    const a = hook.refreshModelInventory(), b = hook.refreshModelInventory();
    assert.equal(a, b); assert.equal(reads, 1);
    const newer = inventory(item());
    hook.setModelInventory(newer); finish(inventory()); await a;
    assert.equal(hook.useModelInventory().inventory, newer);
    globalThis.window.electron.getCivitaiInventory = async () => { throw Error('unavailable'); };
    await hook.refreshModelInventory();
    assert.match(hook.useModelInventory().error, /unavailable/);
    assert.equal(hook.useModelInventory().inventory, newer);
});
test('showing a tab again does not re-read an inventory that is already loaded', async t => {
    const eagerReactURL = compile('export const useEffect = effect => { effect(); }; export const useSyncExternalStore = (_, read) => read();');
    const eager = await import(compile(read('../components/useModelInventory.ts').replace("from 'react'", `from '${eagerReactURL}'`)));
    const previous = globalThis.window; let reads = 0;
    globalThis.window = { electron: { getCivitaiInventory: async () => { reads++; return inventory(item()); } } };
    t.after(() => { globalThis.window = previous; });
    eager.useModelInventory(); eager.useModelInventory();
    await eager.refreshModelInventory();
    assert.equal(reads, 1);
    eager.useModelInventory();
    assert.equal(reads, 1); assert.equal(eager.useModelInventory().loading, false);
    await eager.refreshModelInventory();
    assert.equal(reads, 2);
});
