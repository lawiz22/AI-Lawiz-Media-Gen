import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./videoPromptService.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '');
const mocks = `
export const calls = [];
let response = 'integrated_multimodal_description: [Shot 1] A scene.\\noverall_soundscape: Footsteps.\\nnon_diegetic_music: None.';
export const setResponse = text => { response = text; };
const generateGeminiTextResult = async (...args) => { calls.push(['gemini', ...args]); return { text: response }; };
const generateMammouthText = async (...args) => { calls.push(['mammouth', ...args]); return { text: response }; };
const generateOpenRouterText = async (...args) => { calls.push(['openrouter', ...args]); return response; };
`;
const { outputText } = ts.transpileModule(mocks + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const file = kind => new File(['test'], `ref.${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}`, { type: `${kind}/${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'wav'}` });
const ref = (kind, slot = 1) => { const input = file(kind); return { id: `${kind}-${slot}`, kind, slot, file: input, original: input, note: 'Identity reference' }; };
const draft = (patch = {}) => ({
    idea: 'Two people walking', provider: 'openrouter', models: { openrouter: 'x-ai/grok-4.7', gemini: 'gemini-custom', mammouth: 'mammouth-custom' },
    aspect: '9:16', duration: 10, template: 'generation', templates: { ...api.DEFAULT_VIDEO_TEMPLATES },
    references: [], result: '', workflow: 'reference', minimaxDrafts: {}, ...patch,
});
const generated = 'integrated_multimodal_description: [Shot 1] A scene.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.';
const replacement = 'subject_definitions: <Subject 1> from <Picture 1>.\nsummary: A replacement.\nretention_analysis: Motion preserved.\ndetailed_description: [Shot 1] Walk.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.';

test('transcription sends only the applied excerpt, respects provider/model and rejects malformed answers', async () => {
    const audio = ref('audio');
    audio.file = new File(['selected passage'], 'passage.wav', { type: 'audio/wav' });
    audio.audioSelection = { start: 4, end: 7 };
    api.setResponse('{"text":"one two three"}');
    try {
        for (const provider of ['gemini', 'openrouter']) {
            const start = api.calls.length;
            const lyrics = await api.transcribeAudioLyrics(audio, provider, 'audio-model');
            assert.deepEqual(lyrics, { enabled: true, text: 'one two three', source: api.audioLyricsSource(audio) });
            const call = api.calls[start];
            assert.equal(call[0], provider);
            assert.deepEqual(call[2], [audio.file]);
            assert.ok(!call[2].includes(audio.original));
            assert.equal(call.at(-1), 'audio-model');
            assert.match(call[1], /Never complete a song/);
        }
        const start = api.calls.length;
        for (const [input, provider, model] of [[ref('image'), 'gemini', 'model'], [audio, 'mammouth', 'model'], [audio, 'gemini', ' '],
            [{ ...audio, file: new File([], 'empty.wav', { type: 'audio/wav' }) }, 'gemini', 'model'],
            [{ ...audio, file: new File([new Uint8Array(18 * 1024 * 1024 + 1)], 'big.wav', { type: 'audio/wav' }) }, 'gemini', 'model']]) {
            await assert.rejects(api.transcribeAudioLyrics(input, provider, model));
        }
        assert.equal(api.calls.length, start, 'Invalid requests do not call a provider.');
        for (const text of ['not JSON', '```json\n{"text":"wrong"}\n```', '{"text":""}', '{"text":7}', '[]', 'null', '{"text":"word","extra":"field"}']) {
            api.setResponse(text);
            await assert.rejects(api.transcribeAudioLyrics(audio, 'gemini', 'model'), /JSON|transcript/);
        }
        api.setResponse('{"text":"[instrumental]"}');
        assert.equal((await api.transcribeAudioLyrics(audio, 'gemini', 'model')).text, '[instrumental]');
    } finally { api.setResponse(generated); }
});

test('lyrics fingerprints survive reapplying an excerpt but change with the source/range; snapshots isolate lyrics', () => {
    const audio = ref('audio');
    audio.audioSelection = { start: 0, end: 3 };
    audio.lyrics = { enabled: true, text: 'one two three', source: api.audioLyricsSource(audio) };
    const originalAudioId = audio.id;
    const snapshot = api.captureVideoPromptInputs(draft({ references: [audio], originalAudioId }));
    const instruction = api.buildVideoPromptInstruction(snapshot);
    assert.match(instruction, /unchanged source performance/);
    assert.match(instruction, /one two three/);
    const source = api.audioLyricsSource(audio);
    audio.file = new File(['newly exported same passage'], 'regenerated-passage.wav', { type: 'audio/wav', lastModified: Date.now() + 100 });
    assert.equal(api.audioLyricsSource(audio), source);
    audio.lyrics.text = 'changed by user';
    assert.equal(snapshot.references[0].lyrics.text, 'one two three');
    assert.equal(snapshot.originalAudioId, audio.id);
    audio.audioSelection = { start: 3, end: 6 };
    assert.notEqual(api.audioLyricsSource(audio), source);
    assert.throws(() => api.audioPromptRequirements([audio], originalAudioId), /previous passage/);
    audio.lyrics.enabled = false;
    assert.doesNotThrow(() => api.audioPromptRequirements([audio], originalAudioId));
    assert.throws(() => api.audioPromptRequirements([], originalAudioId), /Select an enabled/);
    audio.audioSelection = undefined;
    assert.notEqual(api.audioLyricsSource(audio), source);
});

test('imports accept exactly 4 images, 2 videos, 2 audio; overflow and mixed types are atomic', () => {
    let refs = [];
    for (const [kind, limit] of Object.entries(api.REFERENCE_LIMITS)) {
        refs = api.addVideoReferences(refs, kind, Array.from({ length: limit }, () => file(kind)));
        assert.throws(() => api.addVideoReferences(refs, kind, [file(kind)]), /Nothing was imported/);
    }
    assert.equal(refs.length, 8);
    api.validateVideoReferences(refs);
    assert.throws(() => api.addVideoReferences([], 'image', [file('image'), file('video')]), /Nothing was imported/);
    assert.throws(() => api.addVideoReferences([], 'image', [new File([], 'empty.png', { type: 'image/png' })]), /non-empty/);
});

test('reference slots stay stable after removal; new imports fill holes without renumbering', () => {
    const refs = api.addVideoReferences([], 'image', [file('image'), file('image'), file('image')]);
    const remaining = refs.filter(item => item.slot !== 2);
    const next = api.addVideoReferences(remaining, 'image', [file('image')]);
    assert.deepEqual(next.map(item => item.slot), [1, 3, 2]);
    assert.equal(next[1].id, refs[2].id);
    assert.equal(api.referenceToken(next[1]), '<Picture 3>');
    assert.equal(api.referenceToken(ref('video', 2)), '<Video 2>');
    assert.equal(api.referenceToken(ref('audio', 2)), '<Audio 2>');
});

test('instructions retain edited templates, actual file order, roles, requested ratio and duration', () => {
    const refs = [ref('video', 2), ref('image', 3), ref('audio')];
    const value = api.buildVideoPromptInstruction(draft({ references: refs, templates: { generation: 'Custom template', replacement: 'Replace' } }));
    assert.match(value, /^Custom template/);
    assert.match(value, /9:16, 10 seconds/);
    assert.ok(value.indexOf('<Video 2>') < value.indexOf('<Picture 3>'));
    assert.ok(value.indexOf('<Picture 3>') < value.indexOf('<Audio 1>'));
    assert.match(value, /Role: Identity reference/);
    assert.match(value, /Two people walking/);
});

test('all eight H3 aspect ratios survive the prompt generator instruction boundary', () => {
    for (const aspect of api.VIDEO_PROMPT_ASPECTS) {
        assert.ok(api.buildVideoPromptInstruction(draft({ aspect })).includes(`Requested output: ${aspect},`));
    }
    assert.ok(api.VIDEO_PROMPT_ASPECTS.includes('2:3'));
    assert.ok(api.VIDEO_PROMPT_ASPECTS.includes('3:2'));
});

test('replacement requires a video plus character image; invalid input is explicit', () => {
    for (const references of [[], [ref('image')], [ref('video')]]) {
        assert.throws(() => api.buildVideoPromptInstruction(draft({ template: 'replacement', references })), /requires at least/);
    }
    assert.doesNotThrow(() => api.buildVideoPromptInstruction(draft({ template: 'replacement', references: [ref('video'), ref('image')] })));
    for (const duration of [0, 121, NaN, Infinity]) assert.throws(() => api.buildVideoPromptInstruction(draft({ duration })), /Duration/);
    for (const duration of [1, 120]) assert.doesNotThrow(() => api.buildVideoPromptInstruction(draft({ duration })));
    assert.throws(() => api.buildVideoPromptInstruction(draft({ idea: ' ' })), /idea first/);
    assert.throws(() => api.buildVideoPromptInstruction(draft({ aspect: 'invalid' })), /aspect ratio/);
    assert.throws(() => api.buildVideoPromptInstruction(draft({ idea: 'Use <Picture 3>', references: [ref('image')] })), /reference is missing/);
    assert.throws(() => api.validateVideoReferences([ref('image'), ref('image')]), /duplicate reference/);
    const large = ref('video');
    large.file = new File([new Uint8Array(18 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' });
    assert.throws(() => api.validateVideoReferences([large]), /18 MB/);
});

test('both output contracts reject missing, empty, reordered, extra and fenced fields', () => {
    assert.equal(api.validateVideoPromptOutput(`  ${generated}  `, 'generation'), generated);
    assert.equal(api.validateVideoPromptOutput(replacement, 'replacement'), replacement);
    for (const value of ['', 'explanation\n' + generated, '```\n' + generated + '\n```',
        generated.replace('overall_soundscape: Footsteps.', 'overall_soundscape: '),
        generated.replace('overall_soundscape:', 'extra:'),
        generated + '\nextra: something',
        generated.replace('overall_soundscape: Footsteps.\nnon_diegetic_music: None.', 'non_diegetic_music: None.\noverall_soundscape: Footsteps.')]) {
        assert.throws(() => api.validateVideoPromptOutput(value, 'generation'), /required non-empty fields/);
    }
    assert.throws(() => api.validateVideoPromptOutput(generated, 'replacement'), /required non-empty fields/);
});

test('providers receive selected model and edited media without changing global defaults', async () => {
    const refs = [ref('image')];
    refs[0].file = new File(['edited'], 'cropped.png', { type: 'image/png' });
    for (const provider of ['openrouter', 'gemini', 'mammouth']) {
        const value = draft({ provider, references: refs });
        assert.equal(await api.generateVideoPrompt(value), generated);
        const call = api.calls.at(-1);
        assert.equal(call[0], provider);
        assert.equal(call[2][0], refs[0].file);
        assert.notEqual(call[2][0], refs[0].original);
        assert.equal(call[provider === 'gemini' ? 4 : 3], value.models[provider]);
    }
    await api.generateVideoPrompt(draft({ provider: 'gemini', references: [ref('video'), ref('audio')] }));
    assert.deepEqual(api.calls.at(-1)[2].map(input => input.type), ['video/mp4', 'audio/wav']);
    const callCount = api.calls.length;
    await assert.rejects(api.generateVideoPrompt(draft({ provider: 'mammouth', references: [ref('audio')] })), /image references only/);
    assert.equal(api.calls.length, callCount);
    await assert.rejects(api.generateVideoPrompt(draft({ models: { openrouter: '' } })), /model ID/);
    api.setResponse('partial response');
    await assert.rejects(api.generateVideoPrompt(draft()), /required non-empty fields/);
    api.setResponse(generated);
});

test('workflow preparation slots have distinct stable identifiers', () => {
    assert.deepEqual(api.VIDEO_WORKFLOWS.map(item => item.id), ['reference', 'text', 'replacement', 'audio']);
});
