import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64')}`;
const helpers = compile(readFileSync(new URL('./minimaxH3Workflow.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
const promptHelpers = compile(readFileSync(new URL('./videoPromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
export const workflowURL = compile(readFileSync(new URL('./ltxAudioSyncWorkflow.ts', import.meta.url), 'utf8')
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`).replace("from './videoPromptService'", `from '${promptHelpers}'`));
const api = await import(workflowURL);
const { AUDIO_SYNC_TEMPLATE, applyAudioSyncPassage, audioSyncInputPrompt, audioSyncReference, defaultAudioSyncSettings, buildAudioSyncWorkflow, transferAudioSyncPrompt, validateAudioSyncDraft, audioSyncPromptText } = api;
const { audioLyricsSource } = await import(promptHelpers);
const files = { image: 'portrait.png', audio: 'song.wav' };
const settings = () => defaultAudioSyncSettings();
const image = new File(['image'], 'portrait.png', { type: 'image/png' });
const audio = new File(['audio'], 'song.wav', { type: 'audio/wav' });
const reference = (kind, file) => ({ id: kind, slot: 1, kind, file, original: file, note: '' });
const checkGraph = graph => {
    const visited = new Set(), visiting = new Set();
    const visit = key => {
        assert.ok(graph[key], `Missing dependency ${key}`);
        assert.ok(!visiting.has(key), `Cycle at ${key}`);
        if (visited.has(key)) return;
        visiting.add(key);
        for (const value of Object.values(graph[key].inputs)) if (Array.isArray(value)) visit(value[0]);
        visiting.delete(key); visited.add(key);
    };
    visit('75'); visit('398:381');
    assert.equal(visited.size, Object.keys(graph).length, 'No unused models or branches should be submitted');
};

test('source defaults retain both passes, source audio masking, tiled decode and fractional duration', () => {
    const options = settings(), graph = buildAudioSyncWorkflow(options, 'A singer performs.', files);
    assert.equal(options.enhancePrompt, true);
    assert.equal(options.textToVideo, false);
    assert.equal(options.nodes['398:384'].unet_name, 'ltx-2.5-22b-distilled-transformer-nvfp4.safetensors');
    assert.equal(options.nodes['403'].megapixels, 0.4);
    assert.equal(options.nodes['398:361'].value, 24);
    assert.equal(graph['398:362'].class_type, 'PrimitiveFloat');
    assert.equal(graph['398:362'].inputs.value, 13.2000732421875);
    assert.equal(graph['398:709'].inputs.value, graph['398:362'].inputs.value);
    assert.deepEqual(graph['398:377'].inputs.audio_latent, ['398:704', 0]);
    assert.deepEqual(graph['398:340'].inputs.audio_latent, ['398:704', 0]);
    assert.equal(graph['398:703'].inputs.value, 0);
    assert.deepEqual(graph['398:370'].inputs.audio, ['398:358', 0]);
    assert.equal(graph['398:374'].inputs.tile_size, 512);
    assert.equal(graph['398:338'].inputs.noise_seed, 42);
    assert.equal(graph['75'].class_type, 'SaveVideo');
    assert.deepEqual(graph['75'].inputs.video, ['398:370', 0]);
    checkGraph(graph);
});

test('writer-off uses the exact prompt and drops Qwen and switch nodes without changing saved options', () => {
    const options = settings(); options.enhancePrompt = false;
    const snapshot = structuredClone(options), prompt = '  Keep my words exactly.\nNo extra text.  ';
    const graph = buildAudioSyncWorkflow(options, prompt, files);
    assert.deepEqual(options, snapshot);
    assert.equal(graph['398:376'].inputs.value, prompt);
    assert.deepEqual(graph['398:364'].inputs.text, ['398:376', 0]);
    for (const key of ['398:380', '398:393', '398:382', '398:383']) assert.equal(graph[key], undefined);
    checkGraph(graph);
});

test('all image/text and Qwen combinations are reachable and use the same masked audio twice', () => {
    for (const textToVideo of [true, false]) for (const enhancePrompt of [true, false]) for (const withImage of [true, false]) {
        if (!textToVideo && !withImage) continue;
        const options = { ...settings(), textToVideo, enhancePrompt };
        const graph = buildAudioSyncWorkflow(options, 'A performer sings.', { audio: files.audio, ...(withImage ? { image: files.image } : {}) });
        checkGraph(graph);
        if (textToVideo) {
            assert.equal(graph['398:357'], undefined);
            assert.equal(graph['398:349'], undefined);
            assert.deepEqual(graph['398:377'].inputs.video_latent, ['398:356', 0]);
            assert.deepEqual(graph['398:340'].inputs.video_latent, ['398:348', 0]);
        }
        if (!withImage || textToVideo && !enhancePrompt) assert.equal(graph['395'], undefined);
        assert.deepEqual(graph['398:340'].inputs.audio_latent, ['398:704', 0]);
    }
});

test('every exposed literal reaches the intended node, with duration synchronized to trimming', () => {
    const options = settings();
    options.nodes['398:362'].value = 4.25;
    options.nodes['398:707'].start_index = 1.5;
    options.nodes['398:338'].noise_seed = 10;
    options.nodes['398:339'].noise_seed = 123;
    options.nodes['398:374'].tile_size = 256;
    options.nodes['398:393'].clip_name = 'alternate-writer.safetensors';
    const graph = buildAudioSyncWorkflow(options, 'Test', files);
    for (const [key, inputs] of Object.entries(options.nodes)) {
        if (!graph[key]) continue;
        for (const [name, value] of Object.entries(inputs)) assert.deepEqual(graph[key].inputs[name], value, `${key}.${name}`);
    }
    assert.equal(graph['398:709'].inputs.value, 4.25);
    assert.equal(graph['398:707'].inputs.start_index, 1.5);
});

test('GGUF diffusion and encoder select matching loaders without irrelevant parameters', () => {
    const options = settings();
    options.nodes['398:384'].unet_name = 'LTX-2.5-Distilled-Q4_K_M.gguf';
    options.nodes['398:387'].clip_name = 'gemma.gguf';
    const graph = buildAudioSyncWorkflow(options, 'Test', files);
    assert.equal(graph['398:384'].class_type, 'UnetLoaderGGUF');
    assert.equal(graph['398:384'].inputs.weight_dtype, undefined);
    assert.equal(graph['398:387'].class_type, 'CLIPLoaderGGUF');
    assert.equal(graph['398:387'].inputs.device, undefined);
});

test('four optional LoRAs chain in slot order and feed both passes without patching text encoders', () => {
    for (const textToVideo of [false, true]) for (const enhancePrompt of [false, true]) for (const gguf of [false, true]) {
        const options = { ...settings(), textToVideo, enhancePrompt };
        options.loras = ['camera', 'style', 'motion', 'detail'].map((name, index) => ({ enabled: true, name: `${name}.safetensors`, strength: [0.7, -0.5, 0, 1.2][index] }));
        if (gguf) options.nodes['398:384'].unet_name = 'ltx-2.5.gguf';
        const before = structuredClone(options);
        const graph = buildAudioSyncWorkflow(options, 'Test', textToVideo ? { audio: files.audio } : files);
        options.loras.forEach((lora, index) => {
            const node = graph[`audio-sync-lora-${index + 1}`];
            assert.equal(node.class_type, 'LoraLoaderModelOnly');
            assert.deepEqual(node.inputs, { model: index ? [`audio-sync-lora-${index}`, 0] : ['398:384', 0],
                lora_name: lora.name, strength_model: lora.strength });
        });
        for (const key of ['398:388', '398:391']) assert.deepEqual(graph[key].inputs.model, ['audio-sync-lora-4', 0]);
        assert.deepEqual(graph['398:364'].inputs.clip, ['398:387', 0]);
        assert.deepEqual(graph['398:373'].inputs.clip, ['398:387', 0]);
        if (enhancePrompt) assert.deepEqual(graph['398:380'].inputs.clip, ['398:393', 0]);
        assert.equal(graph['398:384'].class_type, gguf ? 'UnetLoaderGGUF' : 'UNETLoader');
        assert.deepEqual(options, before);
        checkGraph(graph);
    }
});

test('disabled and legacy LoRA settings keep the exact original graph; gaps bypass disabled loaders', () => {
    const options = settings(), baseline = buildAudioSyncWorkflow(options, 'Test', files);
    assert.equal(options.loras.length, 4);
    assert.ok(options.loras.every(lora => !lora.enabled && lora.name === '' && lora.strength === 1));
    options.loras[0].name = 'Retain while disabled.safetensors';
    assert.deepEqual(buildAudioSyncWorkflow(options, 'Test', files), baseline);
    options.loras[1] = { enabled: true, name: 'camera.safetensors', strength: 0.6 };
    options.loras[3] = { enabled: true, name: 'style.safetensors', strength: 1.1 };
    const graph = buildAudioSyncWorkflow(options, 'Test', files);
    assert.equal(graph['audio-sync-lora-1'], undefined);
    assert.equal(graph['audio-sync-lora-3'], undefined);
    assert.deepEqual(graph['audio-sync-lora-2'].inputs.model, ['398:384', 0]);
    assert.deepEqual(graph['audio-sync-lora-4'].inputs.model, ['audio-sync-lora-2', 0]);
    assert.deepEqual(graph['398:391'].inputs.model, ['audio-sync-lora-4', 0]);
    checkGraph(graph);
    delete options.loras;
    assert.deepEqual(buildAudioSyncWorkflow(options, 'Test', files), baseline);
    const fresh = settings();
    fresh.loras[0].enabled = true;
    assert.equal(fresh.loras[1].enabled, false);
    assert.equal(settings().loras[0].enabled, false);
});

test('LoRA validation enforces the four-slot limit, names and finite strength bounds', () => {
    for (const strength of [NaN, Infinity, -Infinity, -20.01, 20.01, '1']) {
        const options = settings(); options.loras[0] = { enabled: true, name: 'camera.safetensors', strength };
        assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files), /strength.*finite/);
    }
    const options = settings();
    options.loras.push({ enabled: false, name: '', strength: 1 });
    assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files), /at most four/);
    options.loras = [{ enabled: true, name: ' ', strength: 1 }];
    assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files), /Select a file.*LoRA 1/);
    options.loras = [null];
    assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files), /Invalid.*slot/);
    options.loras = {};
    assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files), /at most four/);
});

test('validation rejects missing inputs, unsafe seeds, invalid sigmas, tiles and duration', () => {
    for (const patch of [
        { '398:339': { noise_seed: Number.MAX_SAFE_INTEGER + 1 } },
        { '398:397': { sigmas: '1,,0' } }, { '398:396': { sigmas: '0,1,0' } },
        { '398:362': { value: -1 } }, { '398:361': { value: 23.5 } },
        { '398:374': { overlap: 512 } }, { '398:707': { start_index: -1 } },
    ]) {
        const options = settings();
        for (const [key, values] of Object.entries(patch)) Object.assign(options.nodes[key], values);
        assert.throws(() => buildAudioSyncWorkflow(options, 'Test', files));
    }
    assert.throws(() => buildAudioSyncWorkflow(settings(), '', files), /requires/);
    assert.throws(() => buildAudioSyncWorkflow(settings(), 'Test', { audio: 'song.wav' }), /first-frame/);
    assert.throws(() => validateAudioSyncDraft({ prompt: 'Test', image, audio, audioDuration: 2 }, settings()), /exceeds/);
    assert.throws(() => validateAudioSyncDraft({ prompt: 'Test', image, audio: null }, settings()), /soundtrack/);
});

test('generator transfer disables Qwen, resets the audio offset and retains models without mutating workspace settings', () => {
    const options = settings(); options.enhancePrompt = true; options.nodes['398:707'].start_index = 9; options.nodes['398:393'].clip_name = 'my-writer.safetensors';
    options.loras[0] = { enabled: true, name: 'camera.safetensors', strength: 0.65 };
    options.loras[3] = { enabled: false, name: 'style.safetensors', strength: 0.9 };
    const input = { result: 'A generated prompt.', template: 'generation', references: [reference('image', image), reference('audio', audio)],
        aspect: '9:16', duration: 7, audioSyncSettings: options, minimaxDrafts: { reference: { prompt: 'Other draft' } } };
    const snapshot = structuredClone(options), result = transferAudioSyncPrompt(input);
    assert.equal(result.draft.image, image); assert.equal(result.draft.audio, audio);
    assert.equal(result.settings.enhancePrompt, false);
    assert.equal(result.settings.nodes['398:707'].start_index, 0);
    assert.equal(result.settings.nodes['398:393'].clip_name, 'my-writer.safetensors');
    assert.equal(result.settings.nodes['398:362'].value, 7);
    assert.equal(result.settings.nodes['403'].aspect_ratio, '9:16 (Portrait Widescreen)');
    assert.deepEqual(result.settings.loras, options.loras);
    assert.notEqual(result.settings.loras, options.loras);
    assert.deepEqual(options, snapshot);
    assert.equal(input.minimaxDrafts.reference.prompt, 'Other draft');
    assert.throws(() => transferAudioSyncPrompt({ ...input, references: [reference('image', image), reference('image', image)] }), /one first-frame/);
    assert.throws(() => transferAudioSyncPrompt({ ...input, references: [reference('video', audio)] }), /without video/);
    assert.throws(() => transferAudioSyncPrompt({ ...input, template: 'replacement' }), /replacement/);
});

test('applied passages preserve the full original and reset server trimming so a WAV is not trimmed twice', () => {
    const source = { prompt: 'A speaker.', image, audio };
    const file = new File(['first'], 'first.wav', { type: 'audio/wav' });
    const first = applyAudioSyncPassage(source, settings(), file, { start: 5, end: 10 });
    assert.equal(first.draft.audio, file);
    assert.equal(first.draft.audioOriginal, audio);
    assert.equal(first.draft.audioDuration, 5);
    assert.equal(first.settings.nodes['398:707'].start_index, 0);
    assert.equal(first.settings.nodes['398:362'].value, 5);
    validateAudioSyncDraft(first.draft, first.settings);
    const nextFile = new File(['next'], 'next.wav', { type: 'audio/wav' });
    const next = applyAudioSyncPassage(first.draft, first.settings, nextFile, { start: 10, end: 15 });
    assert.equal(next.draft.audioOriginal, audio);
    assert.equal(next.draft.audio, nextFile);
    assert.deepEqual(next.draft.audioSelection, { start: 10, end: 15 });
    assert.equal(source.audioSelection, undefined);
    next.settings.nodes['398:707'].start_index = 10;
    assert.throws(() => validateAudioSyncDraft(next.draft, next.settings), /exceeds|synchronize/);
    assert.throws(() => applyAudioSyncPassage(source, settings(), file, { start: -1, end: 4 }), /valid/);
    assert.throws(() => applyAudioSyncPassage(source, settings(), file, { start: 5, end: 5 }), /valid/);
    assert.throws(() => validateAudioSyncDraft({ ...first.draft, audioOriginal: undefined }, first.settings), /missing its full original/);
    assert.throws(() => validateAudioSyncDraft({ ...first.draft, audioSelection: { start: NaN, end: 10 } }, first.settings), /invalid/);
});

test('lyrics are optional, separate from the prompt, passage-bound and never silently reused for Next', () => {
    const source = { prompt: '  A speaker.\nKeep the scene.  ', image, audio };
    assert.equal(audioSyncInputPrompt(source), source.prompt);
    const first = applyAudioSyncPassage(source, settings(), audio, { start: 0, end: 5 });
    first.draft.lyrics = { enabled: true, text: 'Testing one two.', source: audioLyricsSource(audioSyncReference(first.draft)) };
    const combined = audioSyncInputPrompt(first.draft);
    assert.ok(combined.startsWith(source.prompt));
    assert.ok(combined.includes('Testing one two.'));
    assert.ok(combined.includes('Do not translate, paraphrase'));
    assert.equal(first.draft.prompt, source.prompt);
    validateAudioSyncDraft(first.draft, first.settings);
    const next = applyAudioSyncPassage(first.draft, first.settings, audio, { start: 5, end: 10 });
    assert.throws(() => audioSyncInputPrompt(next.draft), /previous passage/);
    next.draft.lyrics.enabled = false;
    assert.equal(audioSyncInputPrompt(next.draft), source.prompt);
    assert.throws(() => audioSyncInputPrompt({ ...source, lyrics: { enabled: true, text: 'Words', source: '' } }), /Apply/);
});

test('generator transfer preserves passage provenance and independently switchable lyrics', () => {
    const audioRef = { ...reference('audio', audio), original: new File(['original'], 'original.wav', { type: 'audio/wav' }),
        audioSelection: { start: 5, end: 10 }, lyrics: { enabled: false, text: 'Keep for later', source: 'old' } };
    const result = transferAudioSyncPrompt({ result: 'Generated.', template: 'generation', references: [audioRef],
        aspect: '16:9', duration: 5 });
    assert.equal(result.draft.audioOriginal, audioRef.original);
    assert.deepEqual(result.draft.audioSelection, audioRef.audioSelection);
    assert.notEqual(result.draft.audioSelection, audioRef.audioSelection);
    assert.deepEqual(result.draft.lyrics, audioRef.lyrics);
    assert.notEqual(result.draft.lyrics, audioRef.lyrics);
    assert.equal(result.settings.enhancePrompt, false);
    assert.equal(result.draft.audioDuration, 5);
});

test('cached prompt display accepts supported ComfyUI text output forms without inventing enhanced text', () => {
    assert.equal(audioSyncPromptText({ text: ['Actual final prompt'] }), 'Actual final prompt');
    assert.equal(audioSyncPromptText({ string: 'Final' }), 'Final');
    assert.equal(audioSyncPromptText({ data: { image: 'ignored' } }), '');
});

test('optional reference export comparison preserves every source node and input except documented API adaptations', { skip: !process.env.LTX_AUDIO_SYNC_REFERENCE_API }, () => {
    const source = JSON.parse(readFileSync(process.env.LTX_AUDIO_SYNC_REFERENCE_API, 'utf8'));
    assert.deepEqual(Object.keys(AUDIO_SYNC_TEMPLATE).sort(), Object.keys(source).sort());
    for (const [key, spec] of Object.entries(source)) {
        const actual = structuredClone(AUDIO_SYNC_TEMPLATE[key]), expected = { class_type: spec.class_type, inputs: spec.inputs };
        if (key === '398:362') expected.class_type = 'PrimitiveFloat';
        if (key === '395') expected.inputs.image = '';
        if (key === '405') expected.inputs.audio = '';
        if (key === '398:376') expected.inputs.value = '';
        assert.deepEqual(actual, expected, `Source node ${key} differs`);
    }
});

test('optional live schemas accept every active source branch and manual prompt prunes writer dependencies', { skip: !process.env.COMFYUI_AUDIO_SYNC_LIVE_URL }, async () => {
    const base = process.env.COMFYUI_AUDIO_SYNC_LIVE_URL.replace(/\/+$/, '');
    const info = await (await fetch(`${base}/object_info`)).json();
    const { h3Choices } = await import(helpers);
    const loras = h3Choices(info, 'LoraLoaderModelOnly', 'lora_name');
    assert.ok(loras.length, 'Live LoRA validation requires an installed LoRA catalog');
    const name = loras.find(value => /ltx.*2[._-]?5/i.test(value)) || loras[0];
    for (const textToVideo of [false, true]) for (const enhancePrompt of [false, true]) {
        const options = { ...settings(), textToVideo, enhancePrompt };
        const graph = buildAudioSyncWorkflow(options, 'A performer sings.', textToVideo ? { audio: 'song.wav' } : files, info);
        checkGraph(graph);
        if (!enhancePrompt) {
            const withoutWriter = { ...info }; delete withoutWriter.TextGenerateLTX2Prompt;
            buildAudioSyncWorkflow(options, 'A performer sings.', textToVideo ? { audio: 'song.wav' } : files, withoutWriter);
        }
        options.loras = Array.from({ length: 4 }, () => ({ enabled: true, name, strength: 0.6 }));
        const withLoras = buildAudioSyncWorkflow(options, 'A performer sings.', textToVideo ? { audio: 'song.wav' } : files, info);
        checkGraph(withLoras);
        assert.deepEqual(withLoras['398:388'].inputs.model, ['audio-sync-lora-4', 0]);
        assert.deepEqual(withLoras['398:391'].inputs.model, ['audio-sync-lora-4', 0]);
    }
});
