import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./libraryMediaService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const { outputText } = ts.transpileModule(`
const assets = new Map();
export const setAsset = (id, blob) => assets.set(id, blob);
const getLibraryAssetBlob = async ref => {
    if (!assets.has(ref.id)) throw new Error('Library asset missing.');
    return assets.get(ref.id);
};
${source}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const bytes = new Uint8Array([0, 42, 127, 255]);
const kinds = ['audio', 'video'];

test('durable audio/video and Character Swap photos use original bytes, not expired previews or unrelated assets', async () => {
    for (const mime of ['audio/wav', 'audio/mpeg', 'audio/webm;codecs=opus', 'video/mp4', 'image/png']) {
        api.setAsset(mime, new Blob([bytes], { type: mime }));
        const item = { id: 123, name: 'saved media', media: 'blob:expired', assetRefs: {
            media: { id: mime, mimeType: mime }, reference1: { id: 'missing-unrelated-reference' },
        } };
        const file = await api.readLibraryMediaFile(item, [mime.startsWith('image') ? 'image' : mime.startsWith('audio') ? 'audio' : 'video']);
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
        assert.equal(file.type, mime.split(';')[0]);
    }
});

test('generic Blob types recover their original format from durable metadata or a known filename', async () => {
    api.setAsset('generic', new Blob([bytes], { type: 'application/octet-stream' }));
    const file = await api.readLibraryMediaFile({ id: 1, name: 'no extension', assetRefs: {
        media: { id: 'generic', mimeType: 'video/mp4' },
    } }, ['video']);
    assert.equal(file.type, 'video/mp4');
    assert.match(file.name, /\.mp4$/);
    const audio = await api.readLibraryMediaFile({ id: 2, name: 'excerpt.flac', assetRefs: { media: { id: 'generic' } } }, kinds);
    assert.equal(audio.type, 'audio/flac');
    await assert.rejects(api.readLibraryMediaFile({ assetRefs: { media: { id: 'generic', mimeType: 'video/mp4' } } }, ['image']), /supported image/);
});

test('older inline Library audio/video stays usable without modifying the saved item', async () => {
    for (const mime of ['audio/wav', 'video/webm']) {
        const item = { id: 2, media: `data:${mime};base64,ACp//w==` };
        const original = structuredClone(item);
        const file = await api.readLibraryMediaFile(item, kinds);
        assert.equal(file.type, mime);
        assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
        assert.deepEqual(item, original);
    }
});

test('missing, empty, remote and wrong-kind Library media fail explicitly', async () => {
    await assert.rejects(api.readLibraryMediaFile({ assetRefs: { media: { id: 'missing' } } }, kinds), /missing/);
    await assert.rejects(api.readLibraryMediaFile({ media: 'data:audio/wav;base64,' }, kinds), /empty/);
    await assert.rejects(api.readLibraryMediaFile({ media: 'https://example.com/file.mp4' }, kinds), /no local media/);
    await assert.rejects(api.readLibraryMediaFile({ media: 'data:image/png;base64,AA==' }, kinds), /supported audio or video/);
});

test('cancelled Library reads cannot start decoding a stale source', async () => {
    api.setAsset('cancel', new Blob([bytes], { type: 'audio/wav' }));
    const abort = new AbortController();
    const pending = api.readLibraryMediaFile({ assetRefs: { media: { id: 'cancel' } } }, kinds, abort.signal);
    abort.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
    await assert.rejects(api.readLibraryMediaFile({ media: 'data:audio/wav;base64,AA==' }, kinds, abort.signal), error => error.name === 'AbortError');
});
