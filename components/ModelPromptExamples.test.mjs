import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const civitaiURL = compile(read('../services/civitaiService.ts'));
const helperURL = compile(read('../services/modelPromptExamples.ts').replace("from './civitaiService'", `from '${civitaiURL}'`));
const helpers = await import(helperURL);
const galleryURL = compile(read('../services/styleGallery.ts'));
const item = { kind: 'lora', path: 'C:\\models\\loras\\H3\\film.safetensors', fileName: 'film.safetensors', relativePath: 'loras\\H3\\film.safetensors',
    modelName: '1920s', usageMetadata: { triggerWords: ['FILM'] } };
const other = { ...item, path: 'C:\\models\\loras\\H3\\other.safetensors', fileName: 'other.safetensors', relativePath: 'loras\\H3\\other.safetensors', modelName: 'Other' };
const inventory = { root: '', scannedAt: null, items: [item, other] };
const examples = [{ positive: 'A rainy street.', negative: 'Noise', source: 'civitai' }];
const tick = () => new Promise(resolve => setImmediate(resolve));
function desktop(t, electron) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electron } });
    t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : delete globalThis.window);
}
test('exact Library paths win and ambiguous basenames never bind to another LoRA', () => {
    const duplicate = { ...item, path: 'C:\\models\\loras\\Other\\film.safetensors', relativePath: 'loras\\Other\\film.safetensors' };
    const inv = { ...inventory, items: [duplicate, item] };
    assert.equal(helpers.promptExampleModel(inv, 'H3\\film.safetensors'), item);
    assert.equal(helpers.promptExampleModel(inv, '', item.path), item);
    assert.throws(() => helpers.promptExampleModel(inv, 'film.safetensors'), /Several Library LoRAs/);
    assert.equal(helpers.promptExampleModel(inv, 'H3\\film.safetensors', 'C:\\missing.safetensors'), undefined);
});
test('generation loads only bounded already-saved examples and never requests remote sources', async t => {
    const calls = [];
    desktop(t, {
        hasLocalModelPromptExamples: async path => { calls.push(['has', path]); return true; },
        getLocalModelPromptExamples: async request => { calls.push(['get', request]); return { examples: Array.from({ length: 5 }, () => ({ positive: 'x'.repeat(1600) })), storage: 'sidecar' }; },
    });
    const loaded = await helpers.localStylePromptExamples(inventory, 'H3\\film.safetensors');
    assert.equal(loaded.length, 3); assert.ok(loaded.every(text => text.length === 1500));
    assert.deepEqual(calls[1][1], { modelPath: item.path, provider: 'regular', sources: [] });
    calls.length = 0;
    window.electron.hasLocalModelPromptExamples = async () => false;
    assert.deepEqual(await helpers.localStylePromptExamples(inventory, 'H3\\film.safetensors'), []);
    assert.equal(calls.length, 0);
    window.electron.hasLocalModelPromptExamples = async () => { throw new Error('Disk unavailable'); };
    await assert.rejects(helpers.localStylePromptExamples(inventory, 'H3\\film.safetensors'), /Disk unavailable/);
});

const require = createRequire(import.meta.url), reactURL = pathToFileURL(require.resolve('react')).href;
const ui = await import(compile(`
    import RealReact from '${reactURL}';
    import { promptExampleModel } from '${helperURL}';
    import { prependGalleryStyleTrigger, removeGalleryStyleTrigger } from '${galleryURL}';
    export let button, dialog;
    const React = {...RealReact,createElement:(tag,props,...children)=>{
        if(tag==='button' && children.some(child=>child==='Find prompt examples'||child==='Local prompts'))button={...props,children};
        return RealReact.createElement(tag,props,...children);
    }};
    const cells=[],pending=[];
    let cursor=0;
    const useState=initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];};
    const useRef=initial=>{const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];};
    const useEffect=(fn,deps)=>{const i=cursor++,old=cells[i];if(!old||deps.some((dep,n)=>dep!==old.deps[n])){old?.cleanup?.();cells[i]={deps};pending.push(()=>{cells[i].cleanup=fn();});}};
    const inventory=${JSON.stringify(inventory)};
    const useModelInventory=()=>({inventory,error:''});
    const StyleModal=props=>React.createElement('section',null,props.children);
    ${read('./ModelPromptExamples.tsx').replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
    export const begin=()=>{cursor=0;button=undefined;dialog=undefined;};
    export const flush=()=>{while(pending.length)pending.shift()();};
    export const reset=()=>{for(const cell of cells)cell?.cleanup?.();cells.length=0;pending.length=0;};
`));
// Capture the real dialog callbacks from the element tree without replacing its behavior.
function render(props) {
    ui.begin();
    const element = ui.ModelPromptExamplesButton(props);
    const children = Array.isArray(element?.props.children) ? element.props.children : [];
    const dialog = children.find(child => child?.type === ui.ModelPromptExamplesDialog)?.props;
    const html = renderToStaticMarkup(element);
    ui.flush();
    return { html, dialog, button: ui.button };
}
test('H3 buttons fetch, save locally, reopen local copies and apply only positive text with leading triggers', async t => {
    const calls = [], used = [];
    let saved = false;
    desktop(t, {
        hasLocalModelPromptExamples: async () => saved,
        getLocalModelPromptExamples: async request => { calls.push(['get', request]); return { examples, storage: saved ? 'sidecar' : 'remote' }; },
        saveLocalModelPromptExamples: async request => { calls.push(['save', request]); saved = true; return { path: 'sidecar', count: 1 }; },
    });
    ui.reset(); t.after(ui.reset);
    const props = { name: 'H3\\film.safetensors', disabled: false, onUsePrompt: text => used.push(text) };
    render(props); await tick();
    const first = render(props);
    assert.match(first.html, /Find prompt examples/);
    await first.button.onClick(); await tick();
    const opened = render(props);
    assert.equal(opened.dialog.storage, 'remote');
    await opened.dialog.onSave(); await tick();
    const local = render(props);
    assert.equal(local.dialog.storage, 'sidecar');
    assert.deepEqual(calls[1], ['save', { modelPath: item.path, examples }]);
    local.dialog.onUse(examples[0]);
    assert.deepEqual(used, ['FILM\nA rainy street.']);
    const closed = render(props);
    assert.match(closed.html, /Local prompts/);
    await closed.button.onClick(); await tick();
    assert.equal(render(props).dialog.storage, 'sidecar');
    assert.deepEqual(calls.at(-1)[1].sources, ['civitai', 'archive', 'huggingface']);
    assert.equal(calls.at(-1)[1].modelPath, item.path);
});
test('changing LoRA invalidates old requests and never offers another file examples or late save feedback', async t => {
    let resolve;
    desktop(t, { hasLocalModelPromptExamples: async () => false,
        getLocalModelPromptExamples: () => new Promise(done => { resolve = done; }) });
    ui.reset(); t.after(ui.reset);
    const props = { name: 'H3\\film.safetensors', disabled: false, onUsePrompt: () => {} };
    render(props); await tick(); render(props).button.onClick(); await tick();
    const otherProps = { ...props, name: 'H3\\other.safetensors' };
    render(otherProps); await tick();
    resolve({ examples, storage: 'remote' }); await tick();
    const changed = render(otherProps);
    assert.equal(changed.dialog, undefined);
    assert.doesNotMatch(changed.html, /A rainy street/);
    assert.match(changed.html, /Other/);
    assert.equal(render({ ...otherProps, disabled: true }).button.disabled, true);
});
test('save failures remain explicit and preserve remote state for retry', async t => {
    desktop(t, { hasLocalModelPromptExamples: async () => false,
        getLocalModelPromptExamples: async () => ({ examples, storage: 'remote' }),
        saveLocalModelPromptExamples: async () => { throw new Error('Disk full'); } });
    ui.reset(); t.after(ui.reset);
    const props = { name: 'H3\\film.safetensors', disabled: false, onUsePrompt: () => {} };
    render(props); await tick(); render(props).button.onClick(); await tick();
    render(props).dialog.onSave(); await tick();
    const failed = render(props);
    assert.match(failed.dialog.error, /Disk full/);
    assert.equal(failed.dialog.storage, 'remote');
    assert.equal(failed.dialog.saving, false);
});
