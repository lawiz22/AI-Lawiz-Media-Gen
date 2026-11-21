import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./comfyCatalog.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const catalog = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { loadComfyCatalog, loadComfyNodes, invalidateComfyCatalog, cachedComfyCatalog, subscribeComfyCatalog, comfyChoices, comfyWidgetChoices } = catalog;

const BASE = 'http://comfy.test';
const originalFetch = globalThis.fetch;
let requests, payloads, gate, status;
const node = (...loras) => ({ input: { required: { lora_name: [loras] } } });
test.beforeEach(() => {
    invalidateComfyCatalog();
    requests = []; gate = undefined; status = 200;
    payloads = { LoraLoader: node('a.safetensors'), KSampler: { input: { required: { sampler_name: ['COMBO', { options: ['euler', 'er_sde'] }] } } } };
    globalThis.fetch = async url => {
        requests.push(String(url));
        if (gate) await gate;
        if (status !== 200) return new Response('boom', { status });
        const route = new URL(url).pathname;
        const name = route.startsWith('/object_info/') ? decodeURIComponent(route.slice('/object_info/'.length)) : undefined;
        const body = name === undefined ? payloads : payloads[name] ? { [name]: payloads[name] } : {};
        return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'text/plain' } });
    };
});
test.after(() => { globalThis.fetch = originalFetch; });

test('concurrent callers share one catalog request and later callers reuse the cache', async () => {
    const [first, second] = await Promise.all([loadComfyCatalog(BASE), loadComfyCatalog(BASE)]);
    assert.equal(first, second);
    assert.equal(await loadComfyCatalog(BASE), first);
    assert.equal(cachedComfyCatalog(BASE), first);
    assert.deepEqual(requests, [`${BASE}/object_info`]);
});

test('a text/plain body is accepted', async () => {
    assert.deepEqual(Object.keys(await loadComfyCatalog(BASE)), ['LoraLoader', 'KSampler']);
});

test('maxAgeMs decides between the cache and the server', async () => {
    await loadComfyCatalog(BASE);
    await loadComfyCatalog(BASE, { maxAgeMs: 60000 });
    assert.equal(requests.length, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    await loadComfyCatalog(BASE, { maxAgeMs: 0 });
    assert.equal(requests.length, 2);
});

test('an unchanged catalog keeps its identity and notifies nobody; a changed one notifies once', async () => {
    const notified = [];
    const unsubscribe = subscribeComfyCatalog(base => notified.push(base));
    const first = await loadComfyCatalog(BASE);
    assert.deepEqual(notified, [BASE]);
    assert.equal(await loadComfyCatalog(BASE, { force: true }), first);
    assert.deepEqual(notified, [BASE]);
    payloads.LoraLoader = node('a.safetensors', 'new.safetensors');
    const changed = await loadComfyCatalog(BASE, { force: true });
    assert.notEqual(changed, first);
    assert.deepEqual(comfyChoices(changed, 'LoraLoader', 'lora_name'), ['a.safetensors', 'new.safetensors']);
    assert.deepEqual(notified, [BASE, BASE]);
    unsubscribe();
    payloads.LoraLoader = node('other.safetensors');
    await loadComfyCatalog(BASE, { force: true });
    assert.equal(notified.length, 2);
});

test('force reuses a request that is already in flight', async () => {
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const pending = [loadComfyCatalog(BASE), loadComfyCatalog(BASE, { force: true }), loadComfyCatalog(BASE, { maxAgeMs: 0 })];
    release();
    await Promise.all(pending);
    assert.equal(requests.length, 1);
});

test('a failed request is reported and never cached', async () => {
    status = 500;
    await assert.rejects(loadComfyCatalog(BASE), /Failed to fetch ComfyUI object info \(HTTP 500\)/);
    assert.equal(cachedComfyCatalog(BASE), undefined);
    status = 200;
    assert.ok((await loadComfyCatalog(BASE)).LoraLoader);
    assert.equal(requests.length, 2);
});

test('an aborted caller stops waiting without cancelling the request shared with others', async () => {
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const controller = new AbortController();
    const leaving = loadComfyCatalog(BASE, { signal: controller.signal });
    const staying = loadComfyCatalog(BASE);
    controller.abort(new Error('left the tab'));
    await assert.rejects(leaving, /left the tab/);
    release();
    assert.ok((await staying).KSampler);
    assert.equal(requests.length, 1);
    await assert.rejects(loadComfyCatalog(BASE, { signal: controller.signal }), /left the tab/);
});

test('node schemas are requested once each, deduplicated, and uninstalled nodes are absent', async () => {
    const [first, second] = await Promise.all([
        loadComfyNodes(BASE, ['LoraLoader', 'Missing Node', 'LoraLoader']),
        loadComfyNodes(BASE, ['LoraLoader', 'KSampler']),
    ]);
    assert.deepEqual(Object.keys(first), ['LoraLoader']);
    assert.deepEqual(Object.keys(second), ['LoraLoader', 'KSampler']);
    assert.equal(first.LoraLoader, second.LoraLoader);
    assert.deepEqual(requests.sort(), [`${BASE}/object_info/KSampler`, `${BASE}/object_info/LoraLoader`, `${BASE}/object_info/Missing%20Node`]);
    await loadComfyNodes(BASE, ['LoraLoader', 'Missing Node', 'KSampler']);
    assert.equal(requests.length, 3);
});

test('node schemas come from the complete catalog when it is loaded, and force asks the server again', async () => {
    const full = await loadComfyCatalog(BASE);
    const nodes = await loadComfyNodes(BASE, ['LoraLoader', 'Missing Node']);
    assert.equal(nodes.LoraLoader, full.LoraLoader);
    assert.deepEqual(Object.keys(nodes), ['LoraLoader']);
    assert.equal(requests.length, 1);
    payloads.LoraLoader = node('fresh.safetensors');
    const forced = await loadComfyNodes(BASE, ['LoraLoader'], { force: true });
    assert.deepEqual(comfyChoices(forced, 'LoraLoader', 'lora_name'), ['fresh.safetensors']);
    assert.equal(requests.length, 2);
    await new Promise(resolve => setTimeout(resolve, 5));
    const recent = await loadComfyNodes(BASE, ['LoraLoader', 'KSampler'], { maxAgeMs: 60000 });
    assert.deepEqual(comfyChoices(recent, 'LoraLoader', 'lora_name'), ['fresh.safetensors'], 'the newer single-node answer wins over the older complete catalog');
    assert.equal(recent.KSampler, full.KSampler);
    assert.equal(requests.length, 2);
    await loadComfyCatalog(BASE, { force: true });
    assert.deepEqual(comfyChoices(await loadComfyNodes(BASE, ['LoraLoader']), 'LoraLoader', 'lora_name'), ['fresh.safetensors']);
    assert.equal(requests.length, 3);
});

test('a failed node request is not cached and an aborted wait leaves the shared request running', async () => {
    status = 404;
    await assert.rejects(loadComfyNodes(BASE, ['LoraLoader']), /HTTP 404/);
    status = 200;
    let release;
    gate = new Promise(resolve => { release = resolve; });
    const controller = new AbortController();
    const leaving = loadComfyNodes(BASE, ['LoraLoader'], { signal: controller.signal });
    const staying = loadComfyNodes(BASE, ['LoraLoader']);
    controller.abort(new Error('left the tab'));
    await assert.rejects(leaving, /left the tab/);
    release();
    assert.ok((await staying).LoraLoader);
    assert.equal(requests.length, 2);
});

test('servers are cached separately and invalidation targets one server or all', async () => {
    const other = 'http://other.test:8188';
    await loadComfyCatalog(BASE); await loadComfyCatalog(other);
    assert.equal(requests.length, 2);
    invalidateComfyCatalog(BASE);
    assert.equal(cachedComfyCatalog(BASE), undefined);
    assert.ok(cachedComfyCatalog(other));
    await loadComfyCatalog(BASE); await loadComfyCatalog(other);
    assert.equal(requests.length, 3);
    invalidateComfyCatalog();
    assert.equal(cachedComfyCatalog(other), undefined);
});

test('choices are read from both ComfyUI encodings, optional inputs and keyed options', () => {
    const info = {
        Legacy: { input: { required: { name: [['a', 'b', 7]] } } },
        Combo: { input: { required: { name: ['COMBO', { options: ['c', 'd'] }] }, optional: { extra: [['e']] } } },
        Dynamic: { input: { required: { mode: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'scale' }, { key: 'target' }, { label: 'no key' }] }] } } },
        Number: { input: { required: { steps: ['INT', { default: 4 }] } } },
    };
    assert.deepEqual(comfyChoices(info, 'Legacy', 'name'), ['a', 'b']);
    assert.deepEqual(comfyChoices(info, 'Combo', 'name'), ['c', 'd']);
    assert.deepEqual(comfyChoices(info, 'Combo', 'extra'), ['e']);
    assert.deepEqual(comfyChoices(info, 'Dynamic', 'mode'), ['scale', 'target']);
    assert.deepEqual(comfyChoices(info, 'Number', 'steps'), []);
    assert.deepEqual(comfyChoices(info, 'Absent', 'name'), []);
    assert.deepEqual(comfyChoices(null, 'Legacy', 'name'), []);
    assert.deepEqual(comfyWidgetChoices(undefined), []);
});

test('TTS voices use the shared cache: one request for both panels, both encodings, explicit failures', async () => {
    const service = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
    const tree = ts.createSourceFile('comfyUIService.ts', service, ts.ScriptTarget.Latest, true);
    const code = tree.statements.filter(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
        ['formatTtsVoiceLabel', 'getTtsReferenceVoices'].includes(declaration.name.getText(tree)))).map(statement => statement.getText(tree).replace(/^export /, '')).join('\n');
    const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const voices = new Function('getComfyUIUrl', 'loadComfyNodes', 'comfyInput', 'comfyWidgetChoices', `${compiled}\nreturn getTtsReferenceVoices;`)(
        () => BASE, loadComfyNodes, catalog.comfyInput, comfyWidgetChoices);
    payloads.UnifiedTTSTextNode = { input: { required: { narrator_voice: [['none', 'voices/Anna_fr.wav']] } } };
    const [first, second] = await Promise.all([voices(), voices()]);
    assert.deepEqual(first, [{ value: 'voices/Anna_fr.wav', label: 'Anna fr' }]);
    assert.deepEqual(second, first);
    assert.deepEqual(await voices(), first);
    assert.deepEqual(requests, [`${BASE}/object_info/UnifiedTTSTextNode`]);
    invalidateComfyCatalog();
    payloads.UnifiedTTSTextNode = { input: { required: { narrator_voice: ['COMBO', { options: ['none', 'Bob.wav'] }] } } };
    assert.deepEqual(await voices(), [{ value: 'Bob.wav', label: 'Bob' }]);
    invalidateComfyCatalog();
    delete payloads.UnifiedTTSTextNode;
    await assert.rejects(voices(), /did not return a voice list/);
    invalidateComfyCatalog();
    status = 503;
    await assert.rejects(voices(), /Could not load TTS Audio Suite voices/);
});
