const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('OpenRouter IPC persists, restores and clears the key and default model', () => {
    const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
    const start = main.indexOf("ipcMain.handle('get-openrouter-settings'");
    const end = main.indexOf('const systemMetricsMonitor', start);
    assert.ok(start > 0 && end > start);
    const handlers = new Map();
    const values = new Map();
    const context = {
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        store: {
            get: (name, defaultValue) => values.has(name) ? values.get(name) : defaultValue,
            set: settings => Object.entries(settings).forEach(([name, value]) => values.set(name, value)),
        },
    };
    vm.runInNewContext(main.slice(start, end), context);
    const get = () => JSON.parse(JSON.stringify(handlers.get('get-openrouter-settings')()));
    const set = settings => handlers.get('set-openrouter-settings')(null, settings);
    assert.deepEqual(get(), { apiKey: '', model: 'x-ai/grok-4.7' });
    assert.equal(set({ apiKey: ' synthetic-key ', model: ' x-ai/grok-4.7 ' }), true);
    assert.deepEqual(get(), { apiKey: 'synthetic-key', model: 'x-ai/grok-4.7' });
    assert.equal(set({ apiKey: '', model: 'text/model' }), true);
    assert.deepEqual(get(), { apiKey: '', model: 'text/model' });
    for (const invalid of [null, {}, { apiKey: 123, model: 'text/model' }, { apiKey: '', model: '' }]) {
        assert.throws(() => set(invalid), /Invalid OpenRouter settings/);
    }
    assert.deepEqual(get(), { apiKey: '', model: 'text/model' });
});
