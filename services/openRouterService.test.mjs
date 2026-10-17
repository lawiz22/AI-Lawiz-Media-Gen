import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./openRouterService.ts', import.meta.url), 'utf8')
    .replace(/import \{ fileToResizedDataUrl, fileToDataUrl \} from .*;/, "const fileToResizedDataUrl = async () => 'data:image/jpeg;base64,TEST'; const fileToDataUrl = async file => `data:${file.type};base64,TEST`;");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const model = (id, vision = true, output = ['text']) => ({
    id, name: id, architecture: { input_modalities: vision ? ['text', 'image'] : ['text'], output_modalities: output },
});
const catalog = { data: [model('x-ai/grok-4.7'), model('text/model', false), model('image/model', true, ['image'])] };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

const comfySource = readFileSync(new URL('./comfyUIService.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('comfyUIService.ts', comfySource, ts.ScriptTarget.Latest, true);
const selectedHelpers = new Set([
    'getPromptStyleInstruction', 'generateCloudPromptText', 'generateComfyUIPromptFromSource',
    'extractBackgroundPromptFromImage', 'extractSubjectPromptFromImage', 'generateMagicalPromptSoup',
]);
const helperSource = tree.statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => selectedHelpers.has(declaration.name.getText(tree))))
    .map(statement => statement.getText(tree)).join('\n');
const bridgeSource = `
const calls = [];
let forcedResponse = null;
export const setForcedResponse = value => { forcedResponse = value; };
const generateOpenRouterText = async (instruction, inputs) => {
    calls.push({ provider: 'openrouter', instruction, inputs });
    if (forcedResponse !== null) return forcedResponse;
    return instruction.includes('"prompt_parts"') ? JSON.stringify({prompt_parts:[{text:'Subject: a person\\n',source:1},{text:'Setting: a forest\\n',source:2},{text:'Details: a coat\\n',source:3},{text:'Lighting: sunlight\\n',source:0},{text:'Atmosphere: serene\\n',source:0}]}) : 'Detailed prompt';
};
const generateGeminiText = async () => { calls.push({provider:'gemini'}); return 'Gemini prompt'; };
const generateMammouthText = async () => { calls.push({provider:'mammouth'}); return {text:'Mammouth prompt'}; };
export { calls };
`;
const helpers = ts.transpileModule(bridgeSource + helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const promptApi = await import(`data:text/javascript;base64,${Buffer.from(helpers.outputText).toString('base64')}`);

test('all four Prompt tools route OpenRouter through the existing style and Soup instructions', async () => {
    const file = new File(['synthetic'], 'source.jpg');
    await promptApi.generateComfyUIPromptFromSource(file, 'sd1.5', 'openrouter');
    await promptApi.extractBackgroundPromptFromImage(file, 'flux2-simple', 'openrouter');
    await promptApi.extractSubjectPromptFromImage(file, 'gemini', 'openrouter');
    const parts = await promptApi.generateMagicalPromptSoup([
        { source: 1, label: 'Main 1', text: 'a person' },
        { source: 2, label: 'Background 1', text: 'a forest' },
        { source: 3, label: 'Subject 1', text: 'a coat' },
    ], 'flux2-simple', 0.7, 'openrouter');
    assert.deepEqual(promptApi.calls.map(call => call.provider), ['openrouter', 'openrouter', 'openrouter', 'openrouter']);
    assert.match(promptApi.calls[0].instruction, /comma-separated/);
    assert.match(promptApi.calls[1].instruction, /ONLY the background/);
    assert.match(promptApi.calls[1].instruction, /Subject:.*\nSetting:/);
    assert.match(promptApi.calls[2].instruction, /ONLY the main subject/);
    assert.match(promptApi.calls[2].instruction, /600 to 900 words/);
    assert.equal(promptApi.calls[0].inputs[0], file);
    assert.equal(promptApi.calls[3].inputs.length, 0);
    assert.match(promptApi.calls[3].instruction, /Creativity Level: 0.7/);
    assert.match(promptApi.calls[3].instruction, /Source 2.*Background 1/);
    assert.match(promptApi.calls[3].instruction, /exactly five objects/);
    assert.deepEqual(parts.map(part => part.source), [1, 2, 3, 0, 0]);
    await promptApi.generateComfyUIPromptFromSource(file, 'sdxl', 'gemini');
    await promptApi.generateComfyUIPromptFromSource(file, 'sdxl', 'mammouth');
    assert.deepEqual(promptApi.calls.slice(-2).map(call => call.provider), ['gemini', 'mammouth']);
});

test('OpenRouter Soup rejects malformed parts, unknown sources and broken FLUX2 segments', async () => {
    const ingredients = [{ source: 1, label: 'Main', text: 'a person' }];
    const originalError = console.error;
    console.error = () => {};
    try {
        for (const parts of [[], [{ text: '', source: 1 }], [{ text: 'scene', source: 999 }], [{ text: 'scene', source: '1' }], [null]]) {
            promptApi.setForcedResponse(JSON.stringify({ prompt_parts: parts }));
            await assert.rejects(promptApi.generateMagicalPromptSoup(ingredients, 'sdxl', 0.7, 'openrouter'), /invalid response/);
        }
        promptApi.setForcedResponse(JSON.stringify({ prompt_parts: [{ text: 'Subject: a person', source: 1 }] }));
        await assert.rejects(promptApi.generateMagicalPromptSoup(ingredients, 'flux2-simple', 0.7, 'openrouter'), /invalid response/);
    } finally {
        promptApi.setForcedResponse(null);
        console.error = originalError;
    }
});

test('OpenRouter credentials, catalog, vision and response validation', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; api.updateOpenRouterSettings({ apiKey: '', model: api.DEFAULT_OPENROUTER_MODEL }); });
    await t.test('default model is the verified Grok 4.7 ID; settings are trimmed and copied', () => {
        assert.equal(api.DEFAULT_OPENROUTER_MODEL, 'x-ai/grok-4.7');
        api.updateOpenRouterSettings({ apiKey: ' test-key ', model: '' });
        const value = api.getOpenRouterSettings();
        assert.deepEqual(value, { apiKey: 'test-key', model: 'x-ai/grok-4.7' });
        value.apiKey = 'changed';
        assert.equal(api.getOpenRouterSettings().apiKey, 'test-key');
    });
    await t.test('catalog includes text models and marks vision support, excluding image-only outputs', async () => {
        globalThis.fetch = async () => json(catalog);
        const models = await api.getOpenRouterModels();
        assert.equal(models.length, 2);
        assert.equal(models.find(m => m.id === 'x-ai/grok-4.7').supportsImages, true);
        assert.equal(models.find(m => m.id === 'text/model').supportsImages, false);
        globalThis.fetch = async () => json({ data: [] });
        await assert.rejects(api.getOpenRouterModels(), /compatible text models/);
    });
    await t.test('model selection filters all reference types and searches beyond the currently selected Grok model', async () => {
        const mediaModels = [
            { id: 'x-ai/grok-4.7', name: 'Grok 4.7', architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: ['text'] } },
            { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', architecture: { input_modalities: ['text', 'image', 'video', 'audio'], output_modalities: ['text'] } },
            { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro', architecture: { input_modalities: ['text', 'image', 'video', 'audio'], output_modalities: ['text'] } },
            { id: 'video/reader', name: 'Video reader', architecture: { input_modalities: ['text', 'video'], output_modalities: ['text'] } },
            model('text/model', false),
        ];
        globalThis.fetch = async () => json({ data: mediaModels });
        const models = await api.getOpenRouterModels();
        assert.equal(models.length, 5);
        assert.deepEqual(api.getOpenRouterInputModalities(models.find(item => item.id === 'google/gemini-2.5-flash')), ['text', 'image', 'video', 'audio']);
        const ids = values => values.map(value => value.id).sort();
        assert.deepEqual(ids(api.filterOpenRouterModels(models, ['video'])), ['google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'video/reader']);
        assert.deepEqual(ids(api.filterOpenRouterModels(models, ['image', 'video', 'audio'])), ['google/gemini-2.5-flash', 'google/gemini-2.5-pro']);
        assert.deepEqual(ids(api.filterOpenRouterModels(models, [], ' VIDEO ')), ['google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'video/reader']);
        assert.deepEqual(ids(api.filterOpenRouterModels(models, ['video'], 'google/')), ['google/gemini-2.5-flash', 'google/gemini-2.5-pro']);
        assert.deepEqual(ids(api.filterOpenRouterModels(models, ['video'], 'Gemini 2.5 Flash')), ['google/gemini-2.5-flash']);
        assert.deepEqual(api.filterOpenRouterModels(models, ['video'], 'Grok'), []);
        assert.deepEqual(api.filterOpenRouterModels(models, [], 'missing model'), []);
        assert.equal(api.filterOpenRouterModels(models).length, models.length);
        assert.equal(api.getOpenRouterSettings().model, 'x-ai/grok-4.7');
        assert.equal(models.length, 5, 'Filtering must not mutate the loaded catalog');
        const legacyVision = { id: 'legacy/vision', name: 'Legacy vision', supportsImages: true };
        const legacyText = { id: 'legacy/text', name: 'Legacy text', supportsImages: false };
        assert.deepEqual(api.getOpenRouterInputModalities(legacyVision), ['text', 'image']);
        assert.deepEqual(api.getOpenRouterInputModalities(legacyText), ['text']);
        assert.deepEqual(api.filterOpenRouterModels([legacyVision, legacyText], ['image']), [legacyVision]);
        assert.deepEqual(api.filterOpenRouterModels([legacyVision, legacyText], ['video']), []);
    });
    await t.test('Test checks authenticated /key and catalog without a paid completion', async () => {
        const calls = [];
        globalThis.fetch = async (url, init) => {
            calls.push(url);
            if (url.endsWith('/key')) {
                assert.equal(init.headers.Authorization, 'Bearer test-key');
                return json({ data: { label: 'test' } });
            }
            return json(catalog);
        };
        const result = await api.testOpenRouterConnection('test-key', 'x-ai/grok-4.7');
        assert.equal(result.success, true);
        assert.deepEqual(calls, ['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models']);
        assert.match(result.message, /No paid generation/);
    });
    await t.test('image requests send the selected model, instruction and image as chat content', async () => {
        globalThis.fetch = async (url, init) => {
            if (url.endsWith('/models')) return json(catalog);
            assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
            assert.equal(init.method, 'POST');
            assert.equal(init.headers.Authorization, 'Bearer test-key');
            const body = JSON.parse(init.body);
            assert.equal(body.model, 'x-ai/grok-4.7');
            assert.equal(body.stream, false);
            assert.deepEqual(body.messages[0].content, [
                { type: 'text', text: 'Describe the background' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,TEST' } },
            ]);
            return json({ choices: [{ message: { content: ' A detailed scene. ' }, finish_reason: 'stop' }] });
        };
        assert.equal(await api.generateOpenRouterText('Describe the background', [new File(['image'], 'source.jpg', { type: 'image/jpeg' })]), 'A detailed scene.');
    });
    await t.test('text-only models work for Soup but reject image requests before completion', async () => {
        api.updateOpenRouterSettings({ apiKey: 'test-key', model: 'text/model' });
        let completions = 0;
        globalThis.fetch = async (url, init) => {
            if (url.endsWith('/models')) return json(catalog);
            completions++;
            assert.equal(JSON.parse(init.body).messages[0].content.length, 1);
            return json({ choices: [{ message: { content: '{"prompt_parts":[{"text":"Scene","source":1}]}' } }] });
        };
        await assert.rejects(api.generateOpenRouterText('Analyze', [new File(['image'], 'source.jpg', { type: 'image/jpeg' })]), /does not support images/);
        assert.equal(completions, 0);
        assert.match(await api.generateOpenRouterText('Make Soup'), /prompt_parts/);
        api.updateOpenRouterSettings({ apiKey: 'test-key', model: 'x-ai/grok-4.7' });
    });
    await t.test('missing keys, missing models and API errors are explicit', async () => {
        api.updateOpenRouterSettings({ apiKey: '', model: 'x-ai/grok-4.7' });
        await assert.rejects(api.generateOpenRouterText('Analyze'), /API key is not configured/);
        api.updateOpenRouterSettings({ apiKey: 'test-key', model: 'missing/model' });
        globalThis.fetch = async () => json(catalog);
        await assert.rejects(api.generateOpenRouterText('Analyze'), /unavailable/);
        api.updateOpenRouterSettings({ apiKey: 'test-key', model: 'x-ai/grok-4.7' });
        for (const status of [401, 402, 429, 500]) {
            globalThis.fetch = async () => json({ error: { message: 'API rejected request' } }, status);
            await assert.rejects(api.generateOpenRouterText('Analyze'), new RegExp(`\\(${status}\\).*API rejected`));
            assert.equal((await api.testOpenRouterConnection('test-key', 'x-ai/grok-4.7')).success, false);
        }
    });
    await t.test('video/audio use native content parts with per-request model override and capability checks', async () => {
        let completions = 0;
        const mediaModel = {
            id: 'media/model', name: 'Media model',
            architecture: { input_modalities: ['text', 'image', 'video', 'audio'], output_modalities: ['text'] },
        };
        const video = new File(['video'], 'source.mp4', { type: 'video/mp4' });
        const audio = new File(['audio'], 'voice.wav', { type: 'audio/wav' });
        globalThis.fetch = async (url, init) => {
            if (url.endsWith('/models')) return json({ data: [...catalog.data, mediaModel] });
            completions++;
            const body = JSON.parse(init.body);
            assert.equal(body.model, 'media/model');
            assert.deepEqual(body.messages[0].content, [
                { type: 'text', text: 'Rewrite' },
                { type: 'video_url', video_url: { url: 'data:video/mp4;base64,TEST' } },
                { type: 'input_audio', input_audio: { data: 'TEST', format: 'wav' } },
            ]);
            return json({ choices: [{ message: { content: 'Scene' }, finish_reason: 'stop' }] });
        };
        assert.equal(await api.generateOpenRouterText('Rewrite', [video, audio], 'media/model'), 'Scene');
        assert.equal(api.getOpenRouterSettings().model, 'x-ai/grok-4.7');
        await assert.rejects(api.generateOpenRouterText('Rewrite', [video]), /does not support video/);
        await assert.rejects(api.generateOpenRouterText('Rewrite', [audio]), /does not support audio/);
        await assert.rejects(api.generateOpenRouterText('Rewrite', [new File(['audio'], 'voice.ogg', { type: 'audio/ogg' })], 'media/model'), /WAV or MP3/);
        assert.equal(completions, 1);
    });
    await t.test('empty, truncated, blocked and malformed responses cannot become saved prompts', async () => {
        for (const [response, expected] of [
            [{ choices: [] }, /no completion/],
            [{ choices: [{ message: { content: '' } }] }, /empty prompt/],
            [{ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }, /truncated/],
            [{ choices: [{ message: { content: null }, finish_reason: 'content_filter' }] }, /blocked/],
            [{ error: { message: 'Provider failed' } }, /Provider failed/],
        ]) {
            globalThis.fetch = async url => url.endsWith('/models') ? json(catalog) : json(response);
            await assert.rejects(api.generateOpenRouterText('Analyze'), expected);
        }
        globalThis.fetch = async () => new Response('bad gateway', { status: 502 });
        await assert.rejects(api.getOpenRouterModels(), /non-JSON.*502/);
    });
    await t.test('multipart text response is normalized without reasoning content', async () => {
        globalThis.fetch = async url => url.endsWith('/models') ? json(catalog) : json({
            choices: [{ message: { content: [{ type: 'text', text: 'A scene' }, { type: 'reasoning', text: 'private' }, { type: 'text', text: 'in sunlight' }] } }],
        });
        assert.equal(await api.generateOpenRouterText('Analyze'), 'A scene\nin sunlight');
    });
});
