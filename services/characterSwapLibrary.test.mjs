import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const stores = new Map();
const store = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
        get: async id => structuredClone(entries.get(id)),
        put: async value => entries.set(value.id, structuredClone(value)),
        delete: async id => entries.delete(id),
    };
};
const openDB = async () => ({
    get: async (name, id) => store(name).get(id),
    transaction: () => ({ objectStore: store, done: Promise.resolve() }),
});
const videoToThumbnail = async () => 'data:image/jpeg;base64,dGh1bWI=';
const dataUrlToThumbnail = async () => 'data:image/jpeg;base64,dGh1bWI=';
const createVideoPlaceholderThumbnail = () => 'data:image/svg+xml;base64,cGxhY2Vob2xkZXI=';
const referenceToken = ref => \`<Picture \${ref.slot}>\`;
const cloneVideoPromptLibraryOptions = value => value;
`;
const source = mocks + read('./characterSwapService.ts') + read('./minimaxH3Library.ts')
    + read('./idbLibraryService.ts') + read('./libraryMediaService.ts') + read('./characterSwapLibrary.ts');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const bytes = new Uint8Array([0, 2, 127, 255]);
const nativeFetch = globalThis.fetch;
const result = () => ({
    base: 'http://localhost:8188', sourceRangeVerified: true,
    videos: ['result.mp4', 'comparison.mp4'].map(filename => ({ filename, subfolder: 'swap', type: 'output' })),
    plan: { video: 'source.mp4', global_ref: 'person.png', segs: [{ prompt: 'original' }] },
    settings: { seed: 12347, model: 'render-model' },
    workflow: { '14': { class_type: 'SamplerCustomAdvanced', inputs: { seed: 12347 } } }, promptId: 'own-prompt',
});
const mockFetch = (t, handler) => {
    globalThis.fetch = handler;
    t.after(() => { globalThis.fetch = nativeFetch; });
};
test('Library stores original output bytes and immutable render snapshots, independently of ComfyUI', async t => {
    const original = result();
    mockFetch(t, async url => {
        assert.match(String(url), /filename=result.mp4/);
        original.settings.seed = 999;
        original.plan.segs[0].prompt = 'edited during download';
        original.workflow['14'].inputs.seed = 999;
        return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    });
    const { item: { assetBlobs, ...item } } = await api.buildCharacterSwapLibraryItem(original);
    assert.equal(item.media, '');
    assert.equal(item.mediaType, 'video');
    assert.equal(item.characterSwapOptions.settings.seed, 12347);
    assert.equal(item.characterSwapOptions.workflow['14'].inputs.seed, 12347);
    assert.equal(item.characterSwapOptions.plan.segs[0].prompt, 'original');
    assert.equal(item.characterSwapOptions.planIsExecutionSnapshot, true);
    const stored = await api.saveLibraryItemWithBlobs({ ...item, id: 125 }, assetBlobs);
    globalThis.fetch = async () => { throw new Error('ComfyUI is offline'); };
    assert.deepEqual(stored.characterSwapOptions, item.characterSwapOptions);
    const blob = await api.getLibraryAssetBlob(stored.assetRefs.media);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    const file = await api.swapLibraryFile(stored, 'video');
    assert.equal(file.type, 'video/mp4');
    assert.match(file.name, /^lawiz-swap-library-.+\.mp4$/);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
});
test('comparison videos are independently savable with comparison metadata', async t => {
    mockFetch(t, async url => {
        assert.match(String(url), /filename=comparison.mp4/);
        return new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } });
    });
    const { item } = await api.buildCharacterSwapLibraryItem(result(), 1);
    assert.equal(item.characterSwapOptions.output, 'comparison');
    assert.equal(item.characterSwapOptions.filename, 'comparison.mp4');
    assert.ok(item.tags.includes('comparison'));
    await assert.rejects(api.buildCharacterSwapLibraryItem(result(), 2), /not available/);
});
test('older completed results recover only their matching job graph, never current settings or a foreign job', () => {
    const old = result();
    delete old.settings; delete old.workflow; delete old.promptId;
    const project = {
        result: old, settings: { seed: 999 },
        job: { ...result(), state: 'completed', workflow: result().workflow, videos: result().videos },
    };
    delete project.job.settings;
    const recovered = api.swapResultSnapshot(project);
    assert.equal(recovered.workflow['14'].inputs.seed, 12347);
    assert.equal(recovered.settings, undefined);
    project.job.videos[0].filename = 'different.mp4';
    assert.equal(api.swapResultSnapshot(project).workflow, undefined);
});
test('partial assemblies and old results without snapshots remain savable without invented execution metadata', async t => {
    mockFetch(t, async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }));
    const partial = { base: result().base, videos: [result().videos[0]], plan: { video: 'current-setup.mp4' }, sourceRangeVerified: false };
    const { item } = await api.buildCharacterSwapLibraryItem(partial);
    assert.equal(item.characterSwapOptions.planIsExecutionSnapshot, false);
    assert.equal(item.characterSwapOptions.settings, undefined);
    assert.equal(item.characterSwapOptions.workflow, undefined);
});
test('empty, missing, non-video and failed downloads fail explicitly, without success-shaped Library items', async t => {
    for (const response of [
        new Response('not found', { status: 404 }), new Response(new Uint8Array()),
        new Response('error', { headers: { 'Content-Type': 'text/html' } }),
        new Response(bytes, { headers: { 'Content-Type': 'image/png' } }),
    ]) {
        mockFetch(t, async () => response);
        await assert.rejects(api.buildCharacterSwapLibraryItem(result()), /404|empty|not return a video/);
    }
});
test('legacy inline references import their original bytes, with unique filenames and strict media-kind validation', async () => {
    const image = { mediaType: 'character', name: 'portrait', media: 'data:image/png;base64,AAJ//w==' };
    const first = await api.swapLibraryFile(image, 'image');
    const second = await api.swapLibraryFile(image, 'image');
    assert.equal(first.type, 'image/png');
    assert.notEqual(first.name, second.name);
    assert.deepEqual(new Uint8Array(await first.arrayBuffer()), bytes);
    await assert.rejects(api.swapLibraryFile(image, 'video'), /supported video/);
    await assert.rejects(api.swapLibraryFile({ media: 'https://example.com/not-local' }, 'image'), /no local media/);
    await assert.rejects(api.swapLibraryFile({ media: 'data:image/png;base64,' }, 'image'), /empty/);
    await assert.rejects(api.swapLibraryFile({ assetRefs: { media: { id: 'missing' } } }, 'image'), /missing/);
});
test('small Library imports use multipart upload, preserve server subfolders and require confirmation', async t => {
    const file = new File([bytes], 'unique.png', { type: 'image/png' });
    const progress = [];
    mockFetch(t, async (url, init) => {
        assert.equal(String(url), 'http://server/upload/image');
        assert.equal(init.method, 'POST');
        assert.equal(init.body.get('image').name, file.name);
        assert.equal(init.body.get('type'), 'input');
        return Response.json({ name: 'unique.png', subfolder: 'library' });
    });
    assert.equal(await api.uploadSwapLibraryFile('http://server', file, value => progress.push(value)), 'library/unique.png');
    assert.deepEqual(progress, [0, 1]);
    globalThis.fetch = async () => Response.json({ error: 'upload rejected' });
    await assert.rejects(api.uploadSwapLibraryFile('http://server', file, () => {}), /upload rejected/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(api.uploadSwapLibraryFile('http://server', file, () => {}), /did not confirm/);
    globalThis.fetch = async () => new Response('too large', { status: 413 });
    await assert.rejects(api.uploadSwapLibraryFile('http://server', file, () => {}), /HTTP 413/);
});
test('large Library videos upload in bounded chunks with byte-based progress, then finalize once', async t => {
    const size = 32 * 1024 * 1024 + 3;
    const file = new File([new Uint8Array(size)], 'unique.mp4', { type: 'video/mp4' });
    const chunks = [], progress = [];
    let finalized = 0;
    mockFetch(t, async (url, init) => {
        const request = new URL(url);
        if (request.pathname === '/bfs/upload/chunk') {
            assert.ok(init.body.size <= 8 * 1024 * 1024);
            chunks.push({ offset: Number(request.searchParams.get('offset')), size: init.body.size, id: request.searchParams.get('id') });
            return Response.json({ ok: true });
        }
        assert.equal(request.pathname, '/bfs/upload/finish');
        const body = JSON.parse(init.body);
        assert.equal(body.size, file.size);
        assert.equal(body.name, file.name);
        assert.equal(body.id, chunks[0].id);
        finalized++;
        return Response.json({ name: file.name });
    });
    assert.equal(await api.uploadSwapLibraryFile('http://server', file, value => progress.push(value)), file.name);
    assert.equal(chunks.length, 5);
    assert.deepEqual(chunks.map(chunk => chunk.offset), [0, 8388608, 16777216, 25165824, 33554432]);
    assert.equal(chunks.reduce((sum, chunk) => sum + chunk.size, 0), size);
    assert.equal(finalized, 1);
    assert.equal(progress[1], 8388608 / size);
    assert.equal(progress.at(-1), 1);
});
