import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
const dataUrlToThumbnail = async () => 'data:image/png;base64,dGh1bWI=';
`;
const source = mocks + read('./videoPromptService.ts') + read('./minimaxH3Workflow.ts') + read('./minimaxH3AdvancedWorkflow.ts') + read('./minimaxH3UltrafastWorkflow.ts') + read('./videoPromptLibrary.ts') + read('./idbLibraryService.ts') + '\nexport { externalizeItem };';
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const result = 'integrated_multimodal_description: [Shot 1] <Picture 3> follows <Video 2>.\noverall_soundscape: <Audio 2>.\nnon_diegetic_music: None.';
const file = (name, type, content) => new File([content], name, { type, lastModified: 123456789 });
const inputs = () => {
    const image = file('cropped.png', 'image/png', 'edited image bytes');
    const video = file('trimmed.mp4', 'video/mp4', 'edited video bytes');
    const audio = file('voice.wav', 'audio/wav', 'voice bytes');
    return {
        idea: 'Follow the source motion with this character', provider: 'openrouter',
        models: { openrouter: 'x-ai/grok-4.7', gemini: 'custom-gemini', mammouth: 'custom-mammouth' },
        aspect: '9:16', duration: 12, template: 'generation',
        templates: { ...api.DEFAULT_VIDEO_TEMPLATES, generation: api.DEFAULT_VIDEO_TEMPLATES.generation + '\nWarm light.' },
        workflow: 'reference',
        references: [
            { id: 'v2', kind: 'video', slot: 2, note: 'Camera and motion', file: video, original: file('source.mp4', 'video/mp4', 'original video bytes') },
            { id: 'p3', kind: 'image', slot: 3, note: 'Character identity', file: image, original: file('source.png', 'image/png', 'original image bytes') },
            { id: 'a2', kind: 'audio', slot: 2, note: 'Voice', file: audio, original: audio },
        ],
        apiKey: 'must-not-be-saved',
        minimaxDrafts: { unrelated: true },
    };
};

test('Advanced Library snapshots round-trip both modes and every latent/refine/RTX option without credentials', async () => {
    for (const mode of ['fl2v', 'ref2v']) {
        const options = api.defaultAdvancedH3Options();
        Object.assign(options.advanced, { mode, ltxRefine: true, rtxUpscale: true, saveIntermediateVideos: mode === 'fl2v', ltxDecodeMode: mode === 'fl2v' ? 'tiled' : 'standard' });
        options.advanced.nodes.latent.mode = 'target dimensions';
        options.advanced.nodes.latent['mode.width'] = 1536;
        options.advanced.nodes['ltx-sigmas'].sigmas = '0.4, 0.2, 0.0';
        const image = file('first.png', 'image/png', 'first frame');
        const input = { id: 'advanced', workflow: 'advanced', prompt: 'First to last frame.', references: [{ id: 'first', kind: 'image', slot: 1, note: 'first frame', file: image, original: image }], aspect: '4:3', duration: 3, template: 'generation' };
        const saved = await hydratePrompt(await api.buildMinimaxH3PromptLibraryItem(input, options));
        const restored = await api.restoreMinimaxH3PromptLibraryItem(saved);
        assert.match(saved.name, /^MiniMax Advanced/);
        assert.equal(restored.draft.workflow, 'advanced');
        assert.deepEqual(restored.options.advanced, options.advanced);
        assert.equal(await restored.draft.references[0].file.text(), 'first frame');
        const cloned = api.cloneVideoPromptLibraryOptions(saved.videoPromptOptions);
        cloned.renderOptions.advanced.nodes.latent['mode.width'] = 512;
        assert.equal(saved.videoPromptOptions.renderOptions.advanced.nodes.latent['mode.width'], 1536);
        assert.doesNotMatch(JSON.stringify(saved.videoPromptOptions), /sk-or-|openrouter_api_key/);
    }
});

test('Advanced finishing setups preserve source binaries, stage order and soundtrack settings on reopening', async () => {
    const options = api.defaultAdvancedH3Options();
    Object.assign(options.advanced, { inputMode: 'video', stageOrder: 'ltx-first', latentUpscale: false, ltxRefine: true, sourceAudio: false });
    const video = file('source.webm', 'video/webm', 'persistent source video');
    const draft = { id: 'finish', workflow: 'advanced', prompt: '', references: [{ id: 'source', kind: 'video', slot: 1, note: '', file: video, original: video }], aspect: '4:3', duration: 3, template: 'generation' };
    const saved = await hydratePrompt(await api.buildMinimaxH3PromptLibraryItem(draft, options));
    const restored = await api.restoreMinimaxH3PromptLibraryItem(saved);
    assert.deepEqual(restored.options.advanced, options.advanced);
    assert.equal(await restored.draft.references[0].file.text(), 'persistent source video');
    assert.equal(restored.draft.references[0].file.type, 'video/webm');
    assert.equal(restored.draft.prompt, '');
});

test('Ultrafast prompt snapshots retain variant, six images, original binaries, accelerators and LoRAs', async () => {
    const options = api.defaultUltrafastH3Options();
    options.ultrafast.spectrum = true;
    options.ultrafast.rtxUpscale = true;
    options.loras[5] = { enabled: true, name: 'sixth.safetensors', strength: 0.8 };
    const references = Array.from({ length: 6 }, (_, index) => {
        const image = file(`ref-${index + 1}.png`, 'image/png', `image ${index}`);
        return { id: `ref-${index + 1}`, kind: 'image', slot: index + 1, note: 'Identity', file: image, original: image };
    });
    const draft = { id: 'ultra', workflow: 'ultrafast', prompt: 'Film <Picture 6>.', references, aspect: '4:3', duration: 2, template: 'generation' };
    const item = await hydratePrompt(await api.buildMinimaxH3PromptLibraryItem(draft, options));
    assert.match(item.name, /^Ultrafast/);
    assert.equal(item.videoPromptOptions.workflow, 'ultrafast');
    const restored = await api.restoreMinimaxH3PromptLibraryItem({ ...item, id: 512 });
    assert.equal(restored.draft.workflow, 'ultrafast');
    assert.equal(restored.options.variant, 'ultrafast');
    assert.equal(restored.options.ultrafast.spectrum, true);
    assert.equal(restored.options.ultrafast.rtxUpscale, true);
    assert.equal(restored.options.loras[5].name, 'sixth.safetensors');
    assert.equal(restored.draft.references.length, 6);
    assert.equal(await restored.draft.references[5].file.text(), 'image 5');
    const cloned = api.cloneVideoPromptLibraryOptions(item.videoPromptOptions);
    cloned.renderOptions.ultrafast.spectrum = false;
    assert.equal(item.videoPromptOptions.renderOptions.ultrafast.spectrum, true);
});

test('Library item includes generated text and every generation parameter without credentials or unrelated drafts', async () => {
    const original = inputs();
    const snapshot = api.captureVideoPromptInputs(original);
    original.idea = 'Changed after generation';
    original.models.openrouter = 'different/model';
    original.templates.generation = 'Different template';
    original.references[0].note = 'Changed role';
    const item = await api.buildVideoPromptLibraryItem(result, snapshot);
    assert.equal(item.mediaType, 'prompt');
    assert.equal(item.media, result);
    assert.ok(item.tags.includes('video-prompt'));
    const settings = item.videoPromptOptions;
    assert.equal(settings.idea, 'Follow the source motion with this character');
    assert.equal(settings.models.openrouter, 'x-ai/grok-4.7');
    assert.match(settings.templates.generation, /Warm light/);
    assert.equal(settings.aspect, '9:16');
    assert.equal(settings.duration, 12);
    assert.equal(settings.workflow, 'reference');
    assert.equal(settings.provenance, 'generation');
    assert.equal(settings.instruction, api.buildVideoPromptInstruction(snapshot));
    assert.deepEqual(settings.references.map(ref => [ref.kind, ref.slot, ref.note]), [
        ['video', 2, 'Camera and motion'], ['image', 3, 'Character identity'], ['audio', 2, 'Voice'],
    ]);
    assert.equal(settings.references[0].file.name, 'trimmed.mp4');
    assert.equal(settings.references[0].original.name, 'source.mp4');
    assert.equal(settings.references[0].file.lastModified, 123456789);
    assert.equal(settings.references[2].original, undefined, 'Unedited originals reuse the saved file.');
    assert.equal(item.assetBlobs['videoPromptReference:0'], snapshot.references[0].file);
    assert.equal(item.assetBlobs['videoPromptOriginal:0'], snapshot.references[0].original);
    assert.equal(settings.references[0].file.data, '', 'Large source files must not be base64 encoded into metadata.');
    assert.ok(!JSON.stringify(item).includes('must-not-be-saved'));
    assert.ok(!JSON.stringify(item).includes('minimaxDrafts'));
});

test('externalized binaries round-trip original and edited image/video/audio without mutating metadata', async () => {
    const original = inputs();
    const { assetBlobs, ...itemMetadata } = await api.buildVideoPromptLibraryItem(result, original);
    const item = { ...itemMetadata, id: 42 };
    for (const [role, blob] of Object.entries(assetBlobs)) {
        api.setVideoPromptLibraryAsset(item, role, `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    }
    const { metadata, assets } = api.externalizeItem(item);
    assert.equal(metadata.media, result, 'Prompt text remains inline.');
    assert.equal(assets.length, 5);
    assert.equal(metadata.videoPromptOptions.references[0].file.data, '');
    assert.ok(item.videoPromptOptions.references[0].file.data.startsWith('data:'));
    assert.equal(Object.keys(metadata.assetRefs).length, 5);
    const imported = { ...metadata, videoPromptOptions: api.cloneVideoPromptLibraryOptions(metadata.videoPromptOptions) };
    const urls = [];
    try {
        for (const [role, ref] of Object.entries(metadata.assetRefs)) {
            const asset = assets.find(candidate => candidate.id === ref.id);
            assert.equal(asset.blob.size, ref.size);
            const url = URL.createObjectURL(asset.blob);
            urls.push(url);
            api.setVideoPromptLibraryAsset(imported, role, url);
        }
        assert.equal(metadata.videoPromptOptions.references[0].file.data, '', 'Hydration must not mutate the Redux metadata.');
        const restored = await api.restoreVideoPromptLibraryItem(imported);
        assert.equal(restored.result, result);
        for (const [index, ref] of restored.inputs.references.entries()) {
            assert.equal(ref.slot, original.references[index].slot);
            assert.equal(ref.file.name, original.references[index].file.name);
            assert.equal(ref.file.type, original.references[index].file.type);
            assert.equal(ref.file.lastModified, original.references[index].file.lastModified);
            assert.equal(await ref.file.text(), await original.references[index].file.text());
            assert.equal(await ref.original.text(), await original.references[index].original.text());
        }
        assert.equal(restored.inputs.references[2].file, restored.inputs.references[2].original);
        assert.equal(api.buildVideoPromptInstruction(restored.inputs), item.videoPromptOptions.instruction);
    } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
});

test('audio selection timestamps and original song survive snapshots and Library round-trip', async () => {
    const original = inputs();
    original.references[2].original = file('song.wav', 'audio/wav', 'full song');
    original.references[2].audioSelection = { start: 3, end: 6 };
    original.references[2].lyrics = { enabled: true, text: 'one two three', source: api.audioLyricsSource(original.references[2]) };
    original.originalAudioId = original.references[2].id;
    original.forceOriginalAudio = true;
    const snapshot = api.captureVideoPromptInputs(original);
    original.references[2].audioSelection.start = 0;
    original.references[2].lyrics.text = 'later edited words';
    assert.deepEqual(snapshot.references[2].audioSelection, { start: 3, end: 6 });
    const { assetBlobs, ...metadata } = await api.buildVideoPromptLibraryItem(result, snapshot);
    const item = { ...metadata, id: 45 };
    for (const [role, blob] of Object.entries(assetBlobs)) {
        api.setVideoPromptLibraryAsset(item, role, `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    }
    const restored = await api.restoreVideoPromptLibraryItem(item);
    assert.deepEqual(restored.inputs.references[2].audioSelection, { start: 3, end: 6 });
    assert.equal(await restored.inputs.references[2].original.text(), 'full song');
    assert.equal(await restored.inputs.references[2].file.text(), 'voice bytes');
    assert.equal(restored.inputs.originalAudioId, 'a2');
    assert.equal(restored.inputs.forceOriginalAudio, true);
    assert.equal(restored.inputs.references[2].lyrics.text, 'one two three');
    assert.equal(restored.inputs.references[2].lyrics.source, api.audioLyricsSource(restored.inputs.references[2]));
    assert.match(api.buildVideoPromptInstruction(restored.inputs), /one two three/);
    const cloned = api.cloneVideoPromptLibraryOptions(item.videoPromptOptions);
    cloned.references[2].audioSelection.end = 9;
    cloned.references[2].lyrics.text = 'edited clone';
    assert.equal(item.videoPromptOptions.references[2].audioSelection.end, 6);
    assert.equal(item.videoPromptOptions.references[2].lyrics.text, 'one two three');
});

test('text-only prompts have a thumbnail, preserve explicit legacy provenance and validate output before saving', async () => {
    const item = await api.buildVideoPromptLibraryItem(result, { ...inputs(), references: [] }, 'current-setup');
    assert.match(item.thumbnail, /^data:image\/svg\+xml;base64,/);
    assert.equal(item.videoPromptOptions.provenance, 'current-setup');
    const restored = await api.restoreVideoPromptLibraryItem({ ...item, id: 43 });
    assert.equal(restored.inputs.references.length, 0);
    await assert.rejects(api.buildVideoPromptLibraryItem('partial response', inputs()), /required non-empty fields/);
});

test('missing media, invalid asset roles and incompatible saved versions fail explicitly', async () => {
    const item = { ...await api.buildVideoPromptLibraryItem(result, inputs()), id: 44 };
    const { metadata } = api.externalizeItem(item);
    await assert.rejects(api.restoreVideoPromptLibraryItem(metadata), /No local media/);
    await assert.rejects(api.restoreVideoPromptLibraryItem({ ...item, videoPromptOptions: { ...item.videoPromptOptions, version: 2 } }), /Unsupported/);
    assert.throws(() => api.setVideoPromptLibraryAsset(item, 'invalid', ''), /Invalid video prompt asset role/);
    assert.throws(() => api.setVideoPromptLibraryAsset(item, 'videoPromptReference:99', ''), /metadata is missing/);
});

const hydratePrompt = async saved => {
    const { assetBlobs, ...metadata } = saved;
    const item = { ...metadata, id: 46 };
    for (const [role, blob] of Object.entries(assetBlobs)) {
        api.setVideoPromptLibraryAsset(item, role, `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    }
    return item;
};

test('legacy generator prompts reopen directly as H3 drafts without rewriting or mutating saved text/media', async () => {
    const original = inputs();
    const item = await hydratePrompt(await api.buildVideoPromptLibraryItem(result, original));
    const before = JSON.stringify(item);
    const restored = await api.restoreMinimaxH3PromptLibraryItem(item);
    assert.equal(restored.draft.prompt, result);
    assert.equal(restored.draft.workflow, 'reference');
    assert.equal(restored.options.aspect, api.h3AspectFromPrompt(original.aspect));
    assert.equal(restored.options.duration, 12);
    assert.match(restored.warning, /Default H3 settings/);
    for (const [index, reference] of restored.draft.references.entries()) {
        assert.equal(reference.slot, original.references[index].slot);
        assert.equal(await reference.file.text(), await original.references[index].file.text());
        assert.equal(await reference.original.text(), await original.references[index].original.text());
    }
    assert.equal(JSON.stringify(item), before, 'Compatibility loading must never migrate or overwrite Library data.');
});

test('H3 prompt snapshots preserve free-form prompts, full reference limits and exact generation settings through asset storage', async () => {
    const original = inputs();
    original.references[1].slot = 9;
    const draft = { id: 'h3-draft', workflow: 'reference', prompt: 'A plain shot of <Picture 9> with sound.', references: original.references, template: 'generation' };
    const options = { ...api.defaultMinimaxH3Options(), seed: 987654321, duration: 4, steps: 21, references: { v2: { enabled: false, useSoundtrack: false } } };
    const item = await hydratePrompt(await api.buildMinimaxH3PromptLibraryItem(draft, options));
    options.steps = 99;
    const { metadata, assets } = api.externalizeItem(item);
    assert.equal(assets.length, 5);
    assert.equal(metadata.videoPromptOptions.renderOptions.steps, 21);
    const imported = { ...metadata, videoPromptOptions: api.cloneVideoPromptLibraryOptions(metadata.videoPromptOptions) };
    for (const [role, assetRef] of Object.entries(metadata.assetRefs)) {
        const blob = assets.find(candidate => candidate.id === assetRef.id).blob;
        api.setVideoPromptLibraryAsset(imported, role, `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`);
    }
    const restored = await api.restoreMinimaxH3PromptLibraryItem(imported, async ref => assets.find(asset => asset.id === ref.id).blob);
    assert.equal(restored.draft.prompt, draft.prompt, 'No LLM output-field contract is required for a render prompt.');
    assert.equal(restored.draft.references[1].slot, 9);
    assert.equal(restored.options.seed, 987654321);
    assert.equal(restored.options.duration, 4);
    assert.equal(restored.options.steps, 21);
    assert.equal(restored.options.references.v2.enabled, false);
    assert.equal(restored.warning, undefined);
    imported.videoPromptOptions.renderOptions.references.v2.enabled = true;
    assert.equal(metadata.videoPromptOptions.renderOptions.references.v2.enabled, false);
    assert.equal(restored.options.references.v2.enabled, false);
});

test('bare legacy video prompts restore saved source/frame images without modifying the Library item', async () => {
    const sourceImage = 'data:image/png;base64,b2xkIHJlZmVyZW5jZQ==';
    const endFrame = 'data:image/png;base64,ZW5kIGZyYW1l';
    const item = { id: 47, mediaType: 'prompt', promptType: 'wan-video', media: 'My old manually written scene.', sourceImage, startFrame: sourceImage, endFrame };
    const before = JSON.stringify(item);
    assert.equal(api.isMinimaxH3PromptLibraryItem(item), true);
    const restored = await api.restoreMinimaxH3PromptLibraryItem(item);
    assert.equal(restored.draft.prompt, item.media);
    assert.equal(restored.draft.references.length, 2, 'Distinct stored images are retained, duplicate source/start frames are not repeated.');
    assert.equal(await restored.draft.references[0].file.text(), 'old reference');
    assert.equal(await restored.draft.references[1].file.text(), 'end frame');
    assert.equal(JSON.stringify(item), before);
    assert.equal(api.isMinimaxH3PromptLibraryItem({ mediaType: 'prompt', promptType: 'soup' }), false);
    assert.equal(api.isMinimaxH3PromptLibraryItem({ mediaType: 'image' }), false);
});

test('legacy recovery preserves original audio selection/lyrics and reports missing assets instead of dropping them', async () => {
    const original = inputs();
    const audio = original.references[2];
    audio.audioSelection = { start: 3, end: 6 };
    audio.lyrics = { enabled: true, text: 'one two three', source: api.audioLyricsSource(audio) };
    original.originalAudioId = audio.id;
    original.forceOriginalAudio = true;
    const item = await hydratePrompt(await api.buildVideoPromptLibraryItem(result, original));
    const restored = await api.restoreMinimaxH3PromptLibraryItem(item);
    assert.equal(restored.options.originalAudioId, audio.id);
    assert.equal(restored.options.forceOriginalAudio, true);
    assert.deepEqual(restored.draft.references[2].audioSelection, { start: 3, end: 6 });
    assert.deepEqual(restored.draft.references[2].lyrics, audio.lyrics);
    item.videoPromptOptions.references[0].file.data = '';
    await assert.rejects(api.restoreMinimaxH3PromptLibraryItem(item), /No local media/);
    await assert.rejects(api.restoreMinimaxH3PromptLibraryItem({ ...item, videoPromptOptions: { ...item.videoPromptOptions, version: 2 } }), /Unsupported/);
    await assert.rejects(api.buildMinimaxH3PromptLibraryItem({ ...restored.draft, prompt: ' ' }, restored.options), /prompt is required/);
});

test('expired blob preview URLs are never fetched when durable reference assets exist', async () => {
    const original = inputs();
    const { assetBlobs, ...metadata } = await api.buildVideoPromptLibraryItem(result, original);
    const item = { ...metadata, id: 48, assetRefs: {} };
    for (const [role, blob] of Object.entries(assetBlobs)) {
        item.assetRefs[role] = { id: role, size: blob.size, mimeType: blob.type };
        api.setVideoPromptLibraryAsset(item, role, 'blob:http://previous-session/expired-preview');
    }
    const reads = [];
    const restored = await api.restoreMinimaxH3PromptLibraryItem(item, async ref => {
        reads.push(ref.id);
        return assetBlobs[ref.id];
    });
    assert.equal(reads.length, 5);
    for (const [index, ref] of restored.draft.references.entries()) {
        assert.equal(await ref.file.text(), await original.references[index].file.text());
        assert.equal(await ref.original.text(), await original.references[index].original.text());
    }
    assert.equal(item.videoPromptOptions.references[0].file.data, 'blob:http://previous-session/expired-preview');
});

test('expired legacy references recover only exact reference identities/files from the persistent workspace', async () => {
    const original = inputs();
    const saved = await api.buildVideoPromptLibraryItem(result, original);
    const item = { ...saved, id: 49 };
    for (const role of Object.keys(saved.assetBlobs)) api.setVideoPromptLibraryAsset(item, role, 'blob:http://previous-session/expired');
    const before = JSON.stringify(item);
    let loads = 0;
    const restored = await api.restoreMinimaxH3PromptLibraryItem(item, async () => { throw new Error('No asset should be read'); }, async () => {
        loads++;
        return { references: [], minimaxDrafts: { reference: { references: original.references } } };
    });
    assert.equal(loads, 1, 'Recovery must load the persisted workspace only once.');
    assert.equal(restored.draft.references[0].file, original.references[0].file);
    assert.equal(restored.draft.references[0].original, original.references[0].original);
    assert.match(restored.warning, /Recovered expired reference URLs/);
    assert.equal(JSON.stringify(item), before);
    await assert.rejects(api.restoreMinimaxH3PromptLibraryItem(item, async () => {}, async () => ({
        references: original.references.map(ref => ({ ...ref, id: `different-${ref.id}` })),
    })), /Could not restore saved reference "trimmed.mp4".*videoPromptReference:0/);
});

test('missing durable binaries report the exact reference and keep the saved prompt intact', async () => {
    const saved = await api.buildVideoPromptLibraryItem(result, inputs());
    const item = { ...saved, id: 50, assetRefs: { 'videoPromptReference:0': { id: 'missing-asset' } } };
    const before = JSON.stringify(item);
    await assert.rejects(api.restoreMinimaxH3PromptLibraryItem(item, async () => { throw new Error('Library binary is missing'); }, async () => undefined),
        /trimmed.mp4.*videoPromptReference:0.*Library binary is missing/);
    assert.equal(JSON.stringify(item), before);
});
