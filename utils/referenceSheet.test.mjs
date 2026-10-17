import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./referenceSheet.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const sheet = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const settings = { columns: 0, gap: 0, megapixels: 2, background: '#ffffff' };
const photo = (width = 1920, height = 1080, ratio = 'original') => ({
    width, height, crop: sheet.initialReferenceCrop(ratio, width, height),
});
const near = (actual, expected, epsilon = 0.00001) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('each ratio creates a centered crop contained in its source', () => {
    for (const [width, height] of [[1920, 1080], [800, 1600], [1000, 1000]]) {
        for (const ratio of sheet.REFERENCE_RATIOS) {
            const crop = sheet.initialReferenceCrop(ratio, width, height);
            const pixels = sheet.referenceCropPixels({ width, height, crop });
            near(pixels.x + pixels.width / 2, width / 2);
            near(pixels.y + pixels.height / 2, height / 2);
            near(pixels.width / pixels.height, sheet.referenceAspect(ratio, width, height) ?? width / height);
            assert.ok(crop.width > 0 && crop.width <= 100 && crop.height > 0 && crop.height <= 100);
        }
    }
    assert.equal(sheet.referenceAspect('free', 1920, 1080), undefined);
    assert.throws(() => sheet.referenceAspect('original', 0, 10), /dimensions/);
});

test('four 16:9 photos form the screenshot-style 2 by 2 sheet without gaps or extra cropping', () => {
    const layout = sheet.layoutReferenceSheet(Array.from({ length: 4 }, () => photo()), settings);
    assert.equal(layout.columns, 2);
    assert.equal(layout.rows, 2);
    near(layout.tiles[1].x, layout.tiles[0].width);
    near(layout.tiles[2].y, layout.tiles[0].height);
    layout.tiles.forEach(tile => {
        near(tile.width / tile.height, 16 / 9);
        assert.deepEqual(tile.source, { x: 0, y: 0, width: 1920, height: 1080 });
    });
    assert.ok(layout.width * layout.height <= 2_000_000);
    assert.ok(layout.width * layout.height > 1_995_000);
});

test('1 to 9 photos render once in order, including incomplete centered rows', () => {
    assert.equal(sheet.MAX_REFERENCE_PHOTOS, 9);
    for (let count = 1; count <= 9; count++) {
        const layout = sheet.layoutReferenceSheet(Array.from({ length: count }, (_, i) => photo(600 + 50 * i, 700)), { ...settings, gap: 12 });
        assert.equal(layout.tiles.length, count);
        assert.equal(layout.columns, Math.ceil(Math.sqrt(count)));
        for (const tile of layout.tiles) {
            assert.ok(tile.x >= 0 && tile.y >= 0);
            assert.ok(tile.x + tile.width <= layout.width + 1);
            assert.ok(tile.y + tile.height <= layout.height + 1);
            near(tile.width / tile.height, tile.source.width / tile.source.height);
        }
        assert.ok(layout.width * layout.height <= 2_000_000);
    }
    const layout = sheet.layoutReferenceSheet([photo(), photo(), photo()], { ...settings, columns: 2 });
    near(layout.tiles[2].x, layout.tiles[0].width / 2);
});

test('nine photos form a complete automatic 3 by 3 sheet and support nine manual columns', () => {
    const photos = Array.from({ length: 9 }, () => photo());
    const layout = sheet.layoutReferenceSheet(photos, settings);
    assert.equal(layout.columns, 3);
    assert.equal(layout.rows, 3);
    assert.equal(layout.tiles.length, 9);
    near(layout.tiles[8].x, layout.tiles[0].width * 2);
    near(layout.tiles[8].y, layout.tiles[0].height * 2);
    const manual = sheet.layoutReferenceSheet(photos, { ...settings, columns: 9 });
    assert.equal(manual.columns, 9);
    assert.equal(manual.rows, 1);
});

test('free crops preserve the user-selected bounds and aspect, not the original ratio', () => {
    const crop = { unit: '%', x: 10, y: 20, width: 25, height: 50 };
    const layout = sheet.layoutReferenceSheet([{ width: 1600, height: 1000, crop }, photo(1000, 1000)], settings);
    assert.deepEqual(layout.tiles[0].source, { x: 160, y: 200, width: 400, height: 500 });
    near(layout.tiles[0].width / layout.tiles[0].height, 0.8);
    near(layout.tiles[0].height, layout.tiles[1].height);
});

test('all output resolutions stay under the megapixel and canvas dimension limits', () => {
    for (const megapixels of [0.5, 1, 2, 4, 8]) {
        for (const columns of [0, 1, 2, 3, 8, 9]) {
            const layout = sheet.layoutReferenceSheet(Array.from({ length: 9 }, () => photo(10000, 1)), { ...settings, megapixels, columns, gap: 100 });
            assert.ok(layout.width <= 8192 && layout.height <= 8192);
            assert.ok(layout.width * layout.height <= megapixels * 1_000_000);
        }
    }
});

test('empty, oversized, invalid-crop and invalid-setting inputs fail explicitly', () => {
    assert.throws(() => sheet.layoutReferenceSheet([], settings), /1 to 9/);
    assert.throws(() => sheet.layoutReferenceSheet(Array.from({ length: 10 }, () => photo()), settings), /1 to 9/);
    for (const crop of [
        { x: 0, y: 0, width: 0, height: 100 },
        { x: 50, y: 0, width: 60, height: 100 },
        { x: -1, y: 0, width: 100, height: 100 },
        { x: 0, y: NaN, width: 100, height: 100 },
    ]) assert.throws(() => sheet.referenceCropPixels({ width: 100, height: 100, crop }), /non-empty crop/);
    for (const change of [{ megapixels: 0 }, { megapixels: 9 }, { columns: -1 }, { columns: 1.5 }, { columns: 10 }, { gap: 101 }, { background: 'bad' }]) {
        assert.throws(() => sheet.layoutReferenceSheet([photo()], { ...settings, ...change }), /settings/);
    }
});

test('renderer draws the background and selected source crops into the computed output', () => {
    const calls = [];
    const context = { fillRect: (...args) => calls.push(['fill', ...args]), drawImage: (...args) => calls.push(['draw', ...args]) };
    const canvas = { getContext: () => context };
    const image = { naturalWidth: 1600, naturalHeight: 1000 };
    const crop = { unit: '%', x: 10, y: 20, width: 25, height: 50 };
    const layout = sheet.drawReferenceSheet(canvas, [{ image, crop }], settings);
    assert.equal(canvas.width, layout.width);
    assert.equal(canvas.height, layout.height);
    assert.equal(context.fillStyle, '#ffffff');
    assert.deepEqual(calls[0], ['fill', 0, 0, layout.width, layout.height]);
    assert.deepEqual(calls[1].slice(0, 6), ['draw', image, 160, 200, 400, 500]);
    assert.equal(context.imageSmoothingQuality, 'high');
    assert.throws(() => sheet.drawReferenceSheet({ getContext: () => null }, [{ image, crop }], settings), /canvas/);
});
