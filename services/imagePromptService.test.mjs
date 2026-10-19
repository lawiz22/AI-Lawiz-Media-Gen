import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./imagePromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const style = readFileSync(new URL('../utils/imagePromptStyle.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
export const calls = [];
export const decodes = [];
let response = 'A person wearing a blue coat, holding a sign reading "Hello".';
let failure;
let afterCall;
export const configure = (value = 'A faithful prompt', error, callback) => { response = value; failure = error; afterCall = callback; calls.length = 0; decodes.length = 0; };
const invoke = (provider, args) => { calls.push([provider, ...args]); if (failure) throw failure; afterCall?.(); return response; };
const generateOpenRouterText = async (...args) => invoke('openrouter', args);
const generateGeminiTextResult = async (...args) => ({text: invoke('gemini', args)});
const generateMammouthText = async (...args) => ({text: invoke('mammouth', args)});
const generateOllamaImagePrompt = async (...args) => invoke('ollama', args);
const getImageDimensionsFromFile = async image => { decodes.push(image); if (image.name === 'broken.png') throw new Error('Decode failed'); return {width:640,height:480}; };
`;
const { outputText } = ts.transpileModule(mocks + style + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const image = new File(['synthetic'], 'source.png', { type: 'image/png' });
const request = (patch = {}) => ({ image, format: 'moss-image', provider: 'gemini', model: 'chosen-vision-model', ...patch });

test('five image formats share established styles without changing existing workflow styles', () => {
    assert.deepEqual(api.IMAGE_PROMPT_FORMATS.map(entry => entry.value), ['sd1.5', 'sdxl', 'z-image', 'qwen21-t2i', 'moss-image']);
    assert.match(api.buildImagePromptInstruction('sd1.5'), /comma-separated.*keywords/);
    assert.match(api.buildImagePromptInstruction('sdxl'), /single, concise, natural language sentence/);
    for (const format of ['z-image', 'qwen21-t2i', 'moss-image']) assert.match(api.buildImagePromptInstruction(format), /single, detailed.*paragraph/);
    assert.match(api.buildImagePromptInstruction('qwen21-t2i'), /legible visible text in quotation marks/);
    for (const { value, label } of api.IMAGE_PROMPT_FORMATS) {
        const instruction = api.buildImagePromptInstruction(value);
        assert.ok(instruction.includes(`prompt for ${label}.`));
        assert.match(instruction, /positive prompt.*without.*negative prompt/);
        assert.match(instruction, /Write in English/);
        assert.match(instruction, /Do not invent hidden details/);
    }
    assert.match(api.getImagePromptStyleInstruction('flux2-simple'), /Subject:.*\nSetting:/);
    assert.match(api.getImagePromptStyleInstruction('gemini'), /600 to 900 words/);
    assert.match(api.getImagePromptStyleInstruction('flux'), /detailed.*paragraph/);
    assert.match(api.getImagePromptStyleInstruction('qwen-edit'), /concise/);
});

test('every service receives the same image and requested format, with per-request model overrides', async () => {
    for (const format of api.IMAGE_PROMPT_FORMATS.map(entry => entry.value)) {
        for (const provider of ['openrouter', 'gemini', 'mammouth', 'ollama']) {
            api.configure();
            const controller = new AbortController();
            const input = request({ provider, format, model: `  ${provider}-vision  `, ollamaUrl: 'http://localhost:1234', signal: controller.signal });
            assert.equal(await api.generateImagePrompt(input), 'A faithful prompt');
            assert.equal(api.calls.length, 1);
            assert.equal(api.decodes[0], image);
            const [actualProvider, ...args] = api.calls[0];
            assert.equal(actualProvider, provider);
            if (provider === 'ollama') {
                assert.equal(args[0], image);
                assert.equal(args[1], api.buildImagePromptInstruction(format));
                assert.equal(args[2], input.ollamaUrl);
                assert.equal(args[3], `${provider}-vision`);
                assert.equal(args[4], controller.signal);
            } else {
                assert.equal(args[0], api.buildImagePromptInstruction(format));
                assert.deepEqual(args[1], [image]);
                assert.equal(args[provider === 'gemini' ? 3 : 2], `${provider}-vision`);
            }
            assert.equal(input.model, `  ${provider}-vision  `);
            assert.equal(input.format, format);
        }
    }
});

test('invalid format, service, model, missing/empty/non-image files fail before any provider call', async () => {
    for (const patch of [
        { format: 'invalid' }, { provider: 'invalid' }, { model: ' ' }, { image: null },
        { image: new File([], 'empty.png', { type: 'image/png' }) },
        { image: new File(['text'], 'text.txt', { type: 'text/plain' }) },
    ]) {
        api.configure();
        await assert.rejects(api.generateImagePrompt(request(patch)));
        assert.equal(api.calls.length, 0);
        assert.equal(api.decodes.length, 0);
    }
    api.configure();
    await assert.rejects(api.generateImagePrompt(request({ image: new File(['bad'], 'broken.png', { type: 'image/png' }) })), /Could not decode/);
    assert.equal(api.calls.length, 0);
});

test('provider errors and empty output remain errors, without falling back to another service', async () => {
    for (const provider of ['openrouter', 'gemini', 'mammouth', 'ollama']) {
        const failure = new Error('Vision model unavailable or API key missing');
        api.configure('', failure);
        await assert.rejects(api.generateImagePrompt(request({ provider })), error => error === failure);
        assert.equal(api.calls.length, 1);
        api.configure('  ');
        await assert.rejects(api.generateImagePrompt(request({ provider })), /empty prompt/);
        assert.equal(api.calls.length, 1);
    }
});

test('output cleaning only unwraps Markdown fences and preserves quotes, apostrophes and prompt content', async () => {
    const value = 'A child\'s sign reads "Hello", with `code` below.';
    for (const response of [`  ${value}  `, `\`\`\`text\n${value}\n\`\`\``, `\`\`\`\n${value}\n\`\`\``]) {
        api.configure(response);
        assert.equal(await api.generateImagePrompt(request()), value);
    }
    api.configure('```\n\n```');
    await assert.rejects(api.generateImagePrompt(request()), /empty prompt/);
});

test('aborted work cannot start a provider request or return a stale result', async () => {
    const controller = new AbortController();
    controller.abort();
    api.configure();
    await assert.rejects(api.generateImagePrompt(request({ signal: controller.signal })), { name: 'AbortError' });
    assert.equal(api.calls.length, 0);
    assert.equal(api.decodes.length, 0);
    const late = new AbortController();
    api.configure('Stale output', undefined, () => late.abort());
    await assert.rejects(api.generateImagePrompt(request({ signal: late.signal })), { name: 'AbortError' });
    assert.equal(api.calls.length, 1);
});

test('the Ollama entry point forwards custom format instructions through the existing vision transport', async () => {
    const ollama = readFileSync(new URL('./ollamaService.ts', import.meta.url), 'utf8');
    const tree = ts.createSourceFile('ollamaService.ts', ollama, ts.ScriptTarget.Latest, true);
    const wrapper = tree.statements.find(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some(declaration => declaration.name.getText(tree) === 'generateOllamaImagePrompt')).getText(tree);
    const { outputText } = ts.transpileModule(`export let args; const chatWithOllama = (...values) => {args=values;return Promise.resolve('Local prompt');};${wrapper}`, { compilerOptions: { module: ts.ModuleKind.ESNext } });
    const transport = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
    const signal = new AbortController().signal;
    assert.equal(await transport.generateOllamaImagePrompt(image, 'Custom MOSS instruction', 'http://localhost:11434', 'local-vision', signal), 'Local prompt');
    assert.deepEqual(transport.args, ['http://localhost:11434', 'local-vision', 'Custom MOSS instruction', image, undefined, 0.35, undefined, signal]);
});
