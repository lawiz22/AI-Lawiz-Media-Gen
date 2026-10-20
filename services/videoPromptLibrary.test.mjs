import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
const dataUrlToThumbnail = async () => 'data:image/png;base64,dGh1bWI=';
`;
const source = mocks + read('./videoPromptService.ts') + read('./videoPromptLibrary.ts') + read('./idbLibraryService.ts') + '\nexport { externalizeItem };';
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
    await assert.rejects(api.restoreVideoPromptLibraryItem(metadata), /no local media/);
    await assert.rejects(api.restoreVideoPromptLibraryItem({ ...item, videoPromptOptions: { ...item.videoPromptOptions, version: 2 } }), /Unsupported/);
    assert.throws(() => api.setVideoPromptLibraryAsset(item, 'invalid', ''), /Invalid video prompt asset role/);
    assert.throws(() => api.setVideoPromptLibraryAsset(item, 'videoPromptReference:99', ''), /metadata is missing/);
});
