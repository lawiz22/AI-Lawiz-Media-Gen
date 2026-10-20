import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
export let thumbnailFailure = false;
export const setThumbnailFailure = value => { thumbnailFailure = value; };
export const thumbnailCalls = [];
const videoToThumbnail = async blob => {
    thumbnailCalls.push(blob);
    if (thumbnailFailure) throw new Error('Unsupported codec');
    return 'data:image/jpeg;base64,dGh1bWI=';
};
const dataUrlToThumbnail = async url => {
    thumbnailCalls.push(url);
    if (thumbnailFailure) throw new Error('Unsupported image');
    return 'data:image/jpeg;base64,dGh1bWI=';
};
const createVideoPlaceholderThumbnail = () => 'data:image/svg+xml;base64,cGxhY2Vob2xkZXI=';
const cloneVideoPromptLibraryOptions = value => value;
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
`;
const source = mocks + read('./videoPromptService.ts') + read('./minimaxH3Workflow.ts') + read('./minimaxH3Library.ts') + read('./idbLibraryService.ts');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const nativeFetch = globalThis.fetch;
const result = () => ({
    videoUrl: 'http://127.0.0.1:8188/view?filename=H3%20test.mp4&type=temp',
    promptId: 'job-1', prompt: 'integrated_multimodal_description: [Shot 1] A bird.', promptIsFinal: true, seed: 42,
    options: { ...api.defaultMinimaxH3Options(), seed: 42 },
    workflow: { '185': { class_type: 'MiniMaxH3ReferencePack', inputs: { direction: 'A bird.', openrouter_api_key: '' } } },
});
const mockFetch = (t, handler) => {
    const previous = globalThis.fetch;
    globalThis.fetch = handler;
    t.after(() => { globalThis.fetch = previous; api.setThumbnailFailure(false); });
};

test('Library saves the locally locked MP4 instead of fetching the server soundtrack', async t => {
    mockFetch(t, () => { throw new Error('Must not download uncorrected server media'); });
    const rendered = result();
    rendered.videoBlob = new Blob(['locked local bytes'], { type: 'video/mp4' });
    rendered.options.forceOriginalAudio = true;
    const { item } = await api.buildMinimaxH3LibraryItem(rendered);
    assert.equal(await item.assetBlobs.media.text(), 'locked local bytes');
    assert.equal(item.minimaxH3Options.options.forceOriginalAudio, true);
    assert.equal(item.minimaxH3Options.filename, 'minimax-h3-original-audio.mp4');
});
const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);

test('saves original video bytes as a Library Blob with prompt, actual seed, options and executed graph', async t => {
    const original = result();
    mockFetch(t, async (url, init) => {
        assert.equal(url, original.videoUrl);
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } });
    });
    const { item, warning } = await api.buildMinimaxH3LibraryItem(original);
    assert.equal(warning, undefined);
    assert.equal(item.mediaType, 'video');
    assert.equal(item.media, '', 'A temporary server URL must never become the saved media.');
    assert.equal(item.assetBlobs.media.type, 'video/mp4');
    assert.deepEqual(new Uint8Array(await item.assetBlobs.media.arrayBuffer()), bytes);
    assert.match(item.thumbnail, /^data:image\/jpeg/);
    assert.equal(item.name, 'MiniMax H3 - [Shot 1] A bird.');
    assert.deepEqual(item.tags, ['minimax-h3', 'ref2v']);
    assert.equal(item.minimaxH3Options.filename, 'H3 test.mp4');
    assert.equal(item.minimaxH3Options.seed, 42);
    assert.deepEqual(item.minimaxH3Options.options, original.options);
    assert.deepEqual(item.minimaxH3Options.workflow, original.workflow);
    assert.ok(!JSON.stringify(item).includes('127.0.0.1'));
    assert.equal(item.minimaxH3Options.videoUrl, undefined);
});

test('saving snapshots the completed result before downloading, not settings edited while saving', async t => {
    const original = result();
    mockFetch(t, async () => {
        original.options.model = 'changed-after-render';
        original.options.loras[0].strength = -1;
        original.workflow['185'].inputs.direction = 'changed';
        original.prompt = 'different prompt';
        return new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } });
    });
    const { item } = await api.buildMinimaxH3LibraryItem(original);
    assert.equal(item.minimaxH3Options.options.model, api.defaultMinimaxH3Options().model);
    assert.equal(item.minimaxH3Options.options.loras[0].strength, 1);
    assert.equal(item.minimaxH3Options.workflow['185'].inputs.direction, 'A bird.');
    assert.equal(item.minimaxH3Options.prompt, result().prompt);
});

test('Blob-backed Library storage round-trips offline without base64 conversion or the source server', async t => {
    mockFetch(t, async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }));
    const { item: { assetBlobs, ...metadata } } = await api.buildMinimaxH3LibraryItem(result());
    const stored = await api.saveLibraryItemWithBlobs({ ...metadata, id: 123 }, assetBlobs);
    globalThis.fetch = async () => { throw new Error('ComfyUI is offline'); };
    const blob = await api.getLibraryAssetBlob(stored.assetRefs.media);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    assert.equal(stored.assetRefs.media.size, bytes.length);
    assert.equal(stored.assetRefs.media.mimeType, 'video/mp4');
    assert.equal(stored.media, '');
    assert.deepEqual(stored.minimaxH3Options, metadata.minimaxH3Options);
});

test('generic binary responses retain their format-specific MIME type, including MKV and MOV', async t => {
    mockFetch(t, async () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
    for (const [extension, type] of [['mp4', 'video/mp4'], ['webm', 'video/webm'], ['mkv', 'video/x-matroska'], ['mov', 'video/quicktime']]) {
        const { item } = await api.buildMinimaxH3LibraryItem({ ...result(), videoUrl: `http://localhost/view?filename=clip.${extension}` });
        assert.equal(item.assetBlobs.media.type, type);
        assert.equal(item.mediaType, 'video');
    }
});

test('animated/image outputs use the image Library category and release the thumbnail URL', async t => {
    mockFetch(t, async () => new Response(bytes, { headers: { 'Content-Type': 'image/webp' } }));
    const { item } = await api.buildMinimaxH3LibraryItem({ ...result(), videoUrl: 'http://localhost/view?filename=clip.webp' });
    assert.equal(item.mediaType, 'image');
    assert.equal(item.assetBlobs.media.type, 'image/webp');
    const thumbnailUrl = api.thumbnailCalls.at(-1);
    assert.ok(thumbnailUrl.startsWith('blob:'));
    await assert.rejects(nativeFetch(thumbnailUrl), /fetch failed/);
});

test('unsupported thumbnail codecs produce an explicit warning while preserving the original file', async t => {
    mockFetch(t, async () => new Response(bytes, { headers: { 'Content-Type': 'video/x-matroska' } }));
    api.setThumbnailFailure(true);
    const previous = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    t.after(() => { console.warn = previous; });
    const { item, warning } = await api.buildMinimaxH3LibraryItem(result());
    assert.match(warning, /thumbnail.*could not be extracted/i);
    assert.equal(warnings.length, 1);
    assert.match(item.thumbnail, /^data:image\/svg/);
    assert.deepEqual(new Uint8Array(await item.assetBlobs.media.arrayBuffer()), bytes);
});

test('HTTP errors, empty output, error pages and unidentifiable binary data fail explicitly', async t => {
    const cases = [
        [() => new Response('Missing', { status: 404 }), /404/],
        [() => new Response(new Uint8Array()), /empty/],
        [() => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }), /not return a video or image/],
        [() => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }), /not return a video or image/],
    ];
    mockFetch(t, async () => new Response(bytes));
    for (const [response, expected] of cases) {
        globalThis.fetch = async () => response();
        await assert.rejects(api.buildMinimaxH3LibraryItem({ ...result(), videoUrl: 'http://localhost/view?filename=unknown.bin' }), expected);
    }
});
