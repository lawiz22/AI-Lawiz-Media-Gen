import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = source => {
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const routerSource = readFileSync(new URL('./openRouterService.ts', import.meta.url), 'utf8')
    .replace(/^import .* from '\.\.\/utils\/imageUtils';$/m, '');
const routerUrl = moduleUrl(routerSource);
const router = await import(routerUrl);
const source = readFileSync(new URL('./installationDiagnostics.ts', import.meta.url), 'utf8')
    .replace(/^import .* from '\.\/openRouterService';$/m, `import { getOpenRouterSettings, testOpenRouterConnection } from '${routerUrl}';`)
    .replace(/^import .* from '(?!data:)[^']+';$/gm, '');
const diagnostics = await import(moduleUrl(`
    export const providers = {
        gemini: { success: false, message: 'Gemini offline.', models: [] },
        mammouth: { success: false, message: 'Mammouth offline.' },
        ollama: { success: false, message: 'Ollama offline.', models: [] },
    };
    const testGeminiConnection = async () => providers.gemini;
    const testMammouthConnection = async () => providers.mammouth;
    const testOllamaConnection = async () => providers.ollama;
    const isGoogleDriveConnected = () => false;
    const getSeedVr2Models = () => ({ ditModels: [], vaeModels: [] });
    ${source}
`));
const options = { geminiConfigured: false, mammouthKey: '', ollamaUrl: '' };
const selectedModel = router.DEFAULT_OPENROUTER_MODEL;
const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status });
const model = (id, supportsImages) => ({
    id, name: id, architecture: {
        input_modalities: supportsImages ? ['text', 'image'] : ['text'],
        output_modalities: ['text'],
    },
});
const visualFeatures = ['Prompt from Image', 'Extract Background', 'Subject / Object'];
const textFeatures = ['Magical Prompt Soup', 'Video Prompt Generator'];
const backend = report => report.backends.find(item => item.id === 'openrouter');
const feature = (report, name) => {
    const found = report.features.find(item => item.name === name);
    assert.ok(found, `Missing feature ${name}`);
    return found;
};

test('OpenRouter installation diagnostics', async t => {
    const originals = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage };
    t.beforeEach(() => {
        globalThis.window = { setTimeout, clearTimeout };
        globalThis.localStorage = { getItem: () => null };
        globalThis.fetch = async url => { throw new Error(`Unexpected request: ${url}`); };
        router.updateOpenRouterSettings({ apiKey: '', model: selectedModel });
    });
    t.afterEach(() => {
        router.updateOpenRouterSettings({ apiKey: '', model: selectedModel });
        globalThis.fetch = originals.fetch;
        if (originals.window === undefined) delete globalThis.window;
        else globalThis.window = originals.window;
        if (originals.localStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originals.localStorage;
    });

    await t.test('an unconfigured key appears without making an OpenRouter request', async () => {
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.deepEqual(report.backends.map(item => item.id), ['gemini', 'mammouth', 'openrouter', 'comfyui', 'ollama', 'drive']);
        assert.equal(backend(report).configured, false);
        assert.equal(backend(report).connected, false);
        assert.match(backend(report).message, /API key is not configured/);
        assert.deepEqual(backend(report).models, []);
        for (const name of [...visualFeatures, ...textFeatures]) assert.notEqual(feature(report, name).status, 'ready');
    });

    await t.test('a vision model enables all supported prompt paths with only two free checks', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: selectedModel });
        const calls = [];
        globalThis.fetch = async (url, init) => {
            calls.push(url);
            assert.ok(init.signal instanceof AbortSignal);
            assert.notEqual(init.method, 'POST');
            if (url.endsWith('/key')) {
                assert.equal(init.headers.Authorization, 'Bearer synthetic-diagnostic-key');
                return json({ data: { label: 'Synthetic test key' } });
            }
            assert.ok(url.endsWith('/models'));
            return json({ data: [model(selectedModel, true), model('text/model', false)] });
        };
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.deepEqual(calls, ['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models']);
        assert.equal(backend(report).configured, true);
        assert.equal(backend(report).connected, true);
        assert.equal(backend(report).supportsImages, true);
        assert.deepEqual(backend(report).models, ['text/model', selectedModel]);
        assert.match(backend(report).message, /No paid generation/);
        assert.ok(!JSON.stringify(report).includes('synthetic-diagnostic-key'));
        for (const name of [...visualFeatures, ...textFeatures]) assert.equal(feature(report, name).status, 'ready');
        assert.ok(feature(report, 'Prompt from Image').requirements.some(item => item.label.includes('OpenRouter') && item.met));
    });

    await t.test('text-only selection stays connected without falsely enabling image analysis', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: 'text/model' });
        globalThis.fetch = async url => url.endsWith('/key')
            ? json({ data: {} })
            : json({ data: [model(selectedModel, true), model('text/model', false)] });
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(backend(report).connected, true);
        assert.equal(backend(report).supportsImages, false);
        assert.match(backend(report).message, /text only/);
        for (const name of textFeatures) assert.equal(feature(report, name).status, 'ready');
        for (const name of visualFeatures) {
            assert.notEqual(feature(report, name).status, 'ready');
            assert.ok(feature(report, name).requirements.some(item => item.label.includes('vision-capable selected model') && !item.met));
        }
    });

    await t.test('an authentication failure is reported and never marks OpenRouter ready', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-invalid-key', model: selectedModel });
        globalThis.fetch = async url => {
            assert.ok(url.endsWith('/key'));
            return json({ error: { message: 'Invalid API key' } }, 401);
        };
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(backend(report).configured, true);
        assert.equal(backend(report).connected, false);
        assert.match(backend(report).message, /401.*Invalid API key/);
        assert.deepEqual(backend(report).models, []);
        for (const name of [...visualFeatures, ...textFeatures]) assert.notEqual(feature(report, name).status, 'ready');
    });

    await t.test('an unavailable selected model is surfaced instead of a successful connection', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: 'missing/model' });
        globalThis.fetch = async url => url.endsWith('/key')
            ? json({ data: {} })
            : json({ data: [model(selectedModel, true)] });
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(backend(report).connected, false);
        assert.match(backend(report).message, /missing\/model.*not available/);
    });

    await t.test('network errors remain visible in the backend report', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: selectedModel });
        globalThis.fetch = async () => { throw new Error('Synthetic network failure'); };
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(backend(report).connected, false);
        assert.equal(backend(report).message, 'Synthetic network failure');
    });

    await t.test('the diagnostics timeout aborts OpenRouter and reports the failure', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: selectedModel });
        globalThis.window = {
            setTimeout: callback => { queueMicrotask(callback); return 0; },
            clearTimeout: () => {},
        };
        globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
            if (init.signal.aborted) reject(init.signal.reason);
            else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        });
        const report = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(backend(report).connected, false);
        assert.match(backend(report).message, /abort/i);
    });

    await t.test('other connected providers still enable visual features with text-only OpenRouter', async () => {
        router.updateOpenRouterSettings({ apiKey: 'synthetic-diagnostic-key', model: 'text/model' });
        globalThis.fetch = async url => url.endsWith('/key')
            ? json({ data: {} })
            : json({ data: [model('text/model', false)] });
        diagnostics.providers.gemini = { success: true, message: 'Gemini connected.', models: ['gemini-model'] };
        try {
            const report = await diagnostics.runInstallationDiagnostics({ ...options, geminiConfigured: true });
            for (const name of visualFeatures) assert.equal(feature(report, name).status, 'ready');
            assert.equal(report.backends.find(item => item.id === 'gemini').connected, true);
            assert.equal(backend(report).supportsImages, false);
        } finally {
            diagnostics.providers.gemini = { success: false, message: 'Gemini offline.', models: [] };
        }
    });

    await t.test('ComfyUI success and failure messages remain accurate with six backends', async () => {
        globalThis.localStorage = { getItem: key => key === 'comfyui_url' ? 'http://comfy.test:8188' : null };
        globalThis.fetch = async url => {
            if (url.endsWith('/system_stats')) return json({ system: { comfyui_version: 'test-version' } });
            if (url.endsWith('/object_info')) return json({});
            return json({ version: 'test-manager' });
        };
        const connected = await diagnostics.runInstallationDiagnostics(options);
        const comfy = connected.backends.find(item => item.id === 'comfyui');
        assert.equal(comfy.connected, true);
        assert.equal(comfy.message, 'Server, system stats and object inventory are accessible.');
        assert.equal(comfy.version, 'test-version');
        assert.equal(connected.backends.length, 6);
        globalThis.fetch = async () => { throw new Error('Synthetic ComfyUI failure'); };
        const failed = await diagnostics.runInstallationDiagnostics(options);
        assert.equal(failed.backends.find(item => item.id === 'comfyui').connected, false);
        assert.equal(failed.backends.find(item => item.id === 'comfyui').message, 'Synthetic ComfyUI failure');
    });
});
