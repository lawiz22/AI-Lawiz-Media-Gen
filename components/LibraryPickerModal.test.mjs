import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./LibraryPickerModal.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('LibraryPickerModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleSelect') handler = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(handler);
const { outputText } = ts.transpileModule(`
export const select = async (hydrateMedia, failImport = false) => {
    const calls = [];
    const multiSelect = false;
    const setIsResolving = value => calls.push(['resolving', value]);
    const setErrorMessage = value => calls.push(['error', value]);
    const hydrateLibraryItem = async () => { throw new Error('Unrelated reference asset is missing'); };
    const onSelectItem = async item => {
        calls.push(['selected', item.id]);
        if (failImport) throw new Error('Original media is missing');
    };
    const onClose = () => calls.push(['closed']);
    const handleSelect = ${handler};
    await handleSelect({ id: 123 });
    return calls;
};`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('primary-media consumers bypass unrelated broken assets while default pickers retain hydration', async () => {
    assert.match(source, /hydrateMedia = true/);
    const direct = await api.select(false);
    assert.ok(direct.some(([event, value]) => event === 'selected' && value === 123));
    assert.ok(direct.some(([event]) => event === 'closed'));
    const legacy = await api.select(true);
    assert.ok(legacy.some(([event, value]) => event === 'error' && value.includes('Unrelated reference')));
    assert.ok(!legacy.some(([event]) => event === 'closed'));
});

test('failed primary-media imports remain visible and never close as a success', async () => {
    const calls = await api.select(false, true);
    assert.ok(calls.some(([event, value]) => event === 'error' && value === 'Original media is missing'));
    assert.ok(!calls.some(([event]) => event === 'closed'));
    assert.deepEqual(calls.at(-1), ['resolving', false]);
});

test('Character Swap exposes separate Library video and photo selectors with the existing destination scope', () => {
    const panel = readFileSync(new URL('./CharacterSwapPanel.tsx', import.meta.url), 'utf8');
    for (const text of ['Choose video from Library', 'Choose photo 1 from Library', 'Choose photo 2 from Library', 'Library reference destination']) {
        assert.ok(panel.includes(text));
    }
    assert.match(panel, /<LibraryPickerModal isOpen hydrateMedia=\{false\}/);
    assert.match(panel, /libraryTarget\.kind === 'video' \? 'video' : imageLibraryTypes/);
});
