import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const qwenUrl = moduleUrl(readFileSync(new URL('../services/qwen21Workflow.ts', import.meta.url), 'utf8'));
const { defaultQwen21Settings } = await import(qwenUrl);
const kreaUrl = moduleUrl(readFileSync(new URL('../services/krea2EditWorkflow.ts', import.meta.url), 'utf8').replace("from './qwen21Workflow'", `from '${qwenUrl}'`));
const { defaultKrea2EditSettings } = await import(kreaUrl);
const destinationSource = readFileSync(new URL('./promptDestination.ts', import.meta.url), 'utf8')
    .replace("from '../services/qwen21Workflow'", `from '${qwenUrl}'`)
    .replace("from '../services/krea2EditWorkflow'", `from '${kreaUrl}'`);
const { getImagePromptOnlyUpdate } = await import(moduleUrl(destinationSource));
const { filterLibraryPrompts, getLibraryPromptPreview } = await import(moduleUrl(readFileSync(new URL('./libraryPrompt.ts', import.meta.url), 'utf8')));
const prompt = '  A saved positive prompt.\nWith its original formatting.  ';
const base = { provider: 'comfyui', comfyModelType: 'sdxl', comfySteps: 27, comfyCfg: 4.2, comfyNegativePrompt: 'Keep this negative', comfySeed: 123, comfySampler: 'euler', comfyScheduler: 'normal', aspectRatio: '3:4', numImages: 2, comfyPrompt: 'old' };

test('Library prompt import updates only the active positive prompt for every standard Comfy image model', () => {
    for (const model of ['sd1.5', 'sdxl', 'flux', 'qwen-t2i-gguf', 'qwen-edit', 'z-image', 'moss-image', 'nunchaku-kontext-flux', 'nunchaku-flux-image', 'flux-krea', 'face-detailer-sd1.5']) {
        const options = { ...base, comfyModelType: model };
        const before = structuredClone(options);
        assert.deepEqual(getImagePromptOnlyUpdate(prompt, options, 't2i'), { comfyPrompt: prompt });
        assert.deepEqual(options, before);
    }
    for (const [model, key] of [['krea2-simple', 'comfyKreaPrompt'], ['krea2-raw', 'comfyKreaPrompt'], ['flux2-simple', 'comfyFlux2Prompt'], ['flux2-edit', 'comfyFlux2EditPrompt']]) {
        assert.deepEqual(getImagePromptOnlyUpdate(prompt, { ...base, comfyModelType: model }, 't2i'), { [key]: prompt });
    }
});

test('Qwen 2.1 prompt import retains every nested model, LoRA and sampler setting', () => {
    for (const [model, mode, key] of [['qwen21-t2i', 't2i', 'comfyQwen21T2i'], ['qwen21-turbo', 'turbo', 'comfyQwen21Turbo']]) {
        const nested = { ...defaultQwen21Settings(mode), steps: 37, negativePrompt: 'unchanged negative', sizeIndex: 2, loras: [{ name: 'custom', enabled: true, modelStrength: 0.3, clipStrength: 0.7 }] };
        const options = { ...base, comfyModelType: model, [key]: nested };
        const before = structuredClone(options);
        const update = getImagePromptOnlyUpdate(prompt, options, 't2i');
        assert.deepEqual(update, { [key]: { ...nested, prompt } });
        assert.deepEqual(options, before);
        assert.deepEqual(getImagePromptOnlyUpdate(prompt, { ...base, comfyModelType: model }, 't2i'), { [key]: { ...defaultQwen21Settings(mode), prompt } });
    }
});

test('KREA2 edit Library prompt import preserves task, composer, sources, LoRAs and sampling settings', () => {
    const nested = { ...defaultKrea2EditSettings(), task: 'identity', secondImage: true, refBoost: 2, steps: 20, cfg: 3 };
    const options = { ...base, comfyModelType: 'krea2-edit', comfyKrea2Edit: nested };
    const before = structuredClone(options);
    assert.deepEqual(getImagePromptOnlyUpdate(prompt, options, 'i2i'), { comfyKrea2Edit: { ...nested, prompt } });
    assert.deepEqual(options, before);
    assert.deepEqual(getImagePromptOnlyUpdate(prompt, { ...base, comfyModelType: 'krea2-edit' }, 'i2i'), { comfyKrea2Edit: { ...defaultKrea2EditSettings(), prompt } });
});

test('Gemini and Mammouth prompt import targets T2I and active I2I fields without changing modes or tasks', () => {
    for (const provider of ['gemini', 'mammouth']) {
        for (const [mode, extra, key] of [
            ['t2i', {}, 'geminiPrompt'],
            ['i2i', { geminiI2iMode: 'general' }, 'geminiGeneralEditPrompt'],
            ['i2i', { geminiI2iMode: 'compose' }, 'geminiComposePrompt'],
            ['i2i', { geminiI2iMode: 'inpaint', geminiInpaintTask: 'custom' }, 'geminiInpaintCustomPrompt'],
            ['i2i', { geminiI2iMode: 'inpaint', geminiInpaintTask: 'replace' }, 'geminiInpaintTargetPrompt'],
            ['i2i', { geminiI2iMode: 'inpaint', geminiInpaintTask: 'changeColor' }, 'geminiInpaintTargetPrompt'],
        ]) assert.deepEqual(getImagePromptOnlyUpdate(prompt, { ...base, provider, ...extra }, mode), { [key]: prompt });
        assert.throws(() => getImagePromptOnlyUpdate(prompt, { ...base, provider, geminiI2iMode: 'inpaint', geminiInpaintTask: 'remove' }, 'i2i'), /Choose a Custom Prompt/);
    }
    assert.throws(() => getImagePromptOnlyUpdate('  ', base, 't2i'), /empty/);
});

test('Library prompt list filters text entries and searches names, prompts and tags without exposing settings', () => {
    const items = [
        { id: 1, mediaType: 'prompt', name: 'Forest', media: 'Pine trees in sunlight', tags: ['nature'] },
        { id: 2, mediaType: 'prompt', promptType: 'soup', media: 'Portrait on film' },
        { id: 3, mediaType: 'image', media: 'data:image/png;base64,png' },
        { id: 4, mediaType: 'preset', media: '{"settings":true}' },
        { id: 5, mediaType: 'prompt', promptType: 'wan-video', media: 'Video' },
        { id: 6, mediaType: 'prompt', media: ' ' },
    ];
    assert.deepEqual(filterLibraryPrompts(items, '').map(item => item.id), [1, 2]);
    for (const query of [' FOREST ', 'SUNLIGHT', 'Nature']) assert.deepEqual(filterLibraryPrompts(items, query).map(item => item.id), [1]);
    assert.deepEqual(filterLibraryPrompts(items, 'portrait').map(item => item.id), [2]);
    assert.deepEqual(filterLibraryPrompts(items, 'absent'), []);
});

test('hover preview uses linked result, lazy stored source, inline source or generated thumbnail without hydrating settings', () => {
    const ref = { id: 'source-asset', itemId: 1, role: 'sourceImage', mimeType: 'image/png', size: 2 };
    const item = { id: 1, mediaType: 'prompt', media: prompt, sourceImage: 'data:image/png;base64,source', previewThumbnail: 'generated' };
    assert.deepEqual(getLibraryPromptPreview(item, []), { src: item.sourceImage });
    assert.deepEqual(getLibraryPromptPreview({ ...item, linkedResultId: 2 }, [{ id: 2, thumbnail: 'linked-thumbnail' }]), { src: 'linked-thumbnail' });
    assert.deepEqual(getLibraryPromptPreview({ ...item, sourceImage: '', assetRefs: { sourceImage: ref } }, []), { ref });
    assert.deepEqual(getLibraryPromptPreview({ ...item, sourceImage: '' }, []), { src: 'generated' });
    assert.deepEqual(getLibraryPromptPreview({ ...item, linkedResultId: 2 }, [{ id: 2, assetRefs: { media: ref } }]), { ref });
    assert.equal(getLibraryPromptPreview({ id: 3, mediaType: 'prompt', media: prompt }, []), null);
});
