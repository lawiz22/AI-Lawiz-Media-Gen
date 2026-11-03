import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.cjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const handlers = new Map();
let reader;
for (const node of tree.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'readPromptSidecar') reader = node.getText(tree);
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(tree) === 'ipcMain.handle') {
        const [name, callback] = node.expression.arguments;
        if (ts.isStringLiteral(name) && ['get-local-model-prompt-examples', 'has-local-model-prompt-examples', 'save-local-model-prompt-examples'].includes(name.text)) handlers.set(name.text, callback.getText(tree));
    }
}
assert.ok(reader && handlers.size === 3);

test('existing Electron handlers persist and reopen actual H3 prompt sidecars without online lookup', async t => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lawiz-h3-sidecar-'));
    const modelPath = path.join(directory, 'film.safetensors'), sidecarPath = path.join(directory, 'film.prompts.json');
    t.after(async () => {
        for (const file of [modelPath, sidecarPath, `${sidecarPath}.tmp`]) await fs.promises.rm(file, { force: true });
        await fs.promises.rmdir(directory);
    });
    await fs.promises.writeFile(modelPath, 'inert fixture');
    const api = new Function('fs', 'path', 'assertLocalModelPath', `${reader};return {
        get:${handlers.get('get-local-model-prompt-examples')},
        has:${handlers.get('has-local-model-prompt-examples')},
        save:${handlers.get('save-local-model-prompt-examples')}
    };`)(fs, path, input => {
        assert.equal(input, modelPath);
        return { resolvedPath: modelPath };
    });
    assert.equal(await api.has(null, modelPath), false);
    const examples = [{ positive: 'FILM A 1920s street with film grain.', negative: 'Modern cars', source: 'huggingface' },
        { positive: 'FILM Hand-cranked monochrome footage.', source: 'archive' }];
    const saved = await api.save(null, { modelPath, examples });
    assert.equal(saved.path, sidecarPath);
    assert.equal(saved.count, 2);
    assert.equal((await fs.promises.readFile(modelPath, 'utf8')), 'inert fixture', 'the model file is never rewritten');
    const disk = JSON.parse(await fs.promises.readFile(sidecarPath, 'utf8'));
    assert.deepEqual(disk.prompts, examples);
    assert.equal(await api.has(null, modelPath), true);
    const reopened = await api.get(null, { modelPath, provider: 'regular', sources: [] });
    assert.equal(reopened.storage, 'sidecar');
    assert.deepEqual(JSON.parse(JSON.stringify(reopened.examples)), examples);
});
