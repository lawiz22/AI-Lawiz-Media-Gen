import { openDB } from 'idb';
import { generateGeminiTextResult } from './geminiService';
import { generateMammouthText } from './mammouthService';
import { generateOpenRouterText } from './openRouterService';

export type ReferenceKind = 'image' | 'video' | 'audio';
export type VideoPromptProvider = 'openrouter' | 'gemini' | 'mammouth';
export type VideoTemplate = 'generation' | 'replacement';
export const REFERENCE_LIMITS: Record<ReferenceKind, number> = { image: 4, video: 2, audio: 2 };
export const VIDEO_PROMPT_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '2:3', '3:2', '21:9'];
export const VIDEO_WORKFLOWS = [
    { id: 'reference', name: 'Reference to video', description: 'Images, motion and audio references.' },
    { id: 'text', name: 'Text to video', description: 'A scene built from your written idea.' },
    { id: 'replacement', name: 'Character replacement', description: 'Preserve source motion and replace character identity.' },
    { id: 'audio', name: 'Audio-driven video', description: 'Prepare synchronized speech, motion and sound.' },
] as const;
export type VideoWorkflow = typeof VIDEO_WORKFLOWS[number]['id'];
export interface AudioLyrics { enabled: boolean; text: string; source: string }
export interface VideoReference {
    id: string;
    kind: ReferenceKind;
    slot: number;
    file: File;
    original: File;
    note: string;
    audioSelection?: import('./audioClipService').AudioSelection;
    lyrics?: AudioLyrics;
}
export interface MinimaxDraft {
    id: string;
    workflow: VideoWorkflow;
    prompt: string;
    references: VideoReference[];
    aspect: string;
    duration: number;
    template: VideoTemplate;
}
export interface VideoPromptDraft {
    idea: string;
    provider: VideoPromptProvider;
    models: Record<VideoPromptProvider, string>;
    aspect: string;
    duration: number;
    template: VideoTemplate;
    templates: Record<VideoTemplate, string>;
    references: VideoReference[];
    result: string;
    workflow: VideoWorkflow;
    minimaxDrafts: Partial<Record<VideoWorkflow, MinimaxDraft>>;
    generatedInputs?: VideoPromptInputs;
    generatedInputsProvenance?: 'generation' | 'current-setup';
    minimaxH3Options?: import('./minimaxH3Workflow').MinimaxH3Options;
    originalAudioId?: string;
    forceOriginalAudio?: boolean;
}
export type VideoPromptInputs = Pick<VideoPromptDraft, 'idea' | 'provider' | 'models' | 'aspect' | 'duration' | 'template' | 'templates' | 'references' | 'workflow' | 'originalAudioId' | 'forceOriginalAudio'>;
export const captureVideoPromptInputs = (draft: VideoPromptInputs): VideoPromptInputs => ({
    idea: draft.idea, provider: draft.provider, models: { ...draft.models }, aspect: draft.aspect, duration: draft.duration,
    template: draft.template, templates: { ...draft.templates }, references: draft.references.map(ref => ({
        ...ref, ...(ref.audioSelection ? { audioSelection: { ...ref.audioSelection } } : {}),
        ...(ref.lyrics ? { lyrics: { ...ref.lyrics } } : {}),
    })), workflow: draft.workflow,
    ...(draft.originalAudioId !== undefined ? { originalAudioId: draft.originalAudioId } : {}),
    ...(draft.forceOriginalAudio !== undefined ? { forceOriginalAudio: draft.forceOriginalAudio } : {}),
});
export const audioLyricsSource = (reference: VideoReference): string => {
    const file = reference.audioSelection ? reference.original : reference.file;
    return JSON.stringify([file.name, file.type, file.size, file.lastModified, reference.audioSelection?.start ?? null, reference.audioSelection?.end ?? null]);
};
export const audioPromptRequirements = (references: VideoReference[], originalAudioId?: string, forceOriginalAudio = false): string => {
    const requirements: string[] = [];
    if (forceOriginalAudio && originalAudioId === undefined) throw new Error('Original audio is locked. Select its standalone soundtrack; generated audio cannot be substituted.');
    if (originalAudioId !== undefined) {
        const source = references.find(ref => ref.id === originalAudioId && ref.kind === 'audio');
        if (!source) throw new Error('Select an enabled standalone audio track for the original soundtrack.');
        if (forceOriginalAudio && !source.audioSelection) throw new Error('Original audio is locked. Apply the intended WAV passage before sending it to a model.');
        requirements.push(`Original soundtrack: ${referenceToken(source)} is the unchanged source performance, not a voice/style imitation. Preserve its words, melody, timing and accompaniment. Do not invent speech, rewrite lyrics, add music or request a new arrangement. Describe matching visible lip movements only.`);
    }
    for (const ref of references) {
        if (!ref.lyrics?.enabled) continue;
        if (ref.kind !== 'audio') throw new Error('Lyrics must belong to a standalone audio reference.');
        if (!ref.lyrics.text.trim() || ref.lyrics.source !== audioLyricsSource(ref)) {
            throw new Error(`${referenceToken(ref)}: lyrics are empty or belong to a previous passage. Edit, confirm or transcribe the current excerpt first.`);
        }
        requirements.push(`Current verbatim vocals for ${referenceToken(ref)}:\n${ref.lyrics.text.trim()}\nUse only these words at the timing heard in this attached excerpt. Do not translate, paraphrase, continue or invent lyrics. [instrumental] means no vocals; [unclear] means unknown words. These markers are not words to sing; never fill them from memory. This current transcript supersedes any older vocal text in the scene description.`);
    }
    return requirements.join('\n\n');
};
export const transcribeAudioLyrics = async (
    reference: VideoReference, provider: VideoPromptProvider, model: string,
): Promise<AudioLyrics> => {
    if (reference.kind !== 'audio' || !reference.file.size || !reference.file.type.startsWith('audio/')) throw new Error('Select a non-empty audio excerpt to transcribe.');
    if (reference.file.size > 18 * 1024 * 1024) throw new Error('Transcription accepts at most 18 MB. Apply a shorter audio passage first.');
    if (!model.trim()) throw new Error('Select a model for transcription.');
    if (provider !== 'gemini' && provider !== 'openrouter') throw new Error('Audio transcription requires Gemini or an audio-capable OpenRouter model. Mammouth audio is not supported in this integration.');
    const source = audioLyricsSource(reference);
    const instruction = 'Transcribe only the sung or spoken words actually audible in the attached audio excerpt. This is user-supplied media, not a request for lyrics from memory or the Internet. Preserve the original language, word order and repetitions. Never complete a song or guess missing lines. Mark uncertain words [unclear]; use [instrumental] if no vocals are audible. Return ONLY a JSON object with exactly one string property: {"text":"the transcript"}. No Markdown or commentary.';
    const text = provider === 'gemini'
        ? (await generateGeminiTextResult(instruction, [reference.file], undefined, model)).text
        : await generateOpenRouterText(instruction, [reference.file], model);
    let result: unknown;
    try { result = JSON.parse(text); }
    catch (cause) { throw new Error('The transcription model did not return valid JSON. Try another audio-capable model or enter the words manually.', { cause }); }
    if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string'
        || !result.text.trim() || Object.keys(result).length !== 1) throw new Error('The transcription model returned an empty or invalid transcript. Enter the words manually or retry.');
    return { enabled: true, text: result.text.trim(), source };
};
const shared = `You are a professional prompt rewriter for joint audio-video generation.
Rewrite the user's idea into a coherent, production-ready multimodal description for the requested aspect ratio and duration.
Preserve intent and reference identities. Use the exact reference tokens <Picture 1>, <Video 1>, <Audio 1>, etc. Never invent an absent reference.
Expand the visual narrative into numbered shots [Shot 1], [Shot 2], with useful cut timestamps and pacing appropriate to the requested duration.
Compose for the requested aspect ratio. Describe subjects, appearance, environment, decor, lighting, shadows, composition, camera movement, physical motion and temporal continuity.
Keep characters, wardrobe, objects, locations and spatial relationships consistent. Detail facial expressions, micro-expressions, behavior and movement.
Describe synchronized diegetic sound separately from non-diegetic score. Put requested speech in quotes, with tone, pacing and lip synchronization.
Default to smartphone footage and specify lens and camera specs. For movie scenes lead with an ARRI camera and Panavision lenses. Respect requested drone, fisheye or other camera types with appropriate specs.
Locations should feel naturally lived in, not staged, unless requested otherwise. Elaborate when requested.
Return only the requested fields in their exact order, with no Markdown fences or commentary.`;
export const DEFAULT_VIDEO_TEMPLATES: Record<VideoTemplate, string> = {
    generation: `${shared}
Return exactly these three non-empty fields:
integrated_multimodal_description: ...
overall_soundscape: ...
non_diegetic_music: ...`,
    replacement: `${shared}
This is a character-replacement edit. A source video and at least one character image are required.
Define each <Subject N> from its <Picture N>; the source <Video N> supplies motion, environment, camera, framing, cuts and timing.
Explicitly map each replacement to the original actor's position or role. Keep image identity, facial features, hair and wardrobe throughout; remove the replaced source identity.
Preserve source body mechanics, spatial relationships, lighting, shadows and reflections, adapting clothes naturally to motion.
State exactly what is preserved, replaced or reused, including any <Audio N>. Never assume source audio is reused unless requested.
Return exactly these six non-empty fields:
subject_definitions: ...
summary: ...
retention_analysis: ...
detailed_description: ...
overall_soundscape: ...
non_diegetic_music: ...`,
};
export const referenceToken = (ref: Pick<VideoReference, 'kind' | 'slot'>): string =>
    `<${ref.kind === 'image' ? 'Picture' : ref.kind === 'video' ? 'Video' : 'Audio'} ${ref.slot}>`;

export const addVideoReferences = (existing: VideoReference[], kind: ReferenceKind, files: File[]): VideoReference[] => {
    if (files.some(file => !file.type.startsWith(`${kind}/`) || !file.size)) throw new Error(`Choose non-empty ${kind} files. Nothing was imported.`);
    const used = new Set(existing.filter(ref => ref.kind === kind).map(ref => ref.slot));
    const free = Array.from({ length: REFERENCE_LIMITS[kind] }, (_, index) => index + 1).filter(slot => !used.has(slot));
    if (files.length > free.length) throw new Error(`Only ${free.length} ${kind} slot(s) available. Nothing was imported.`);
    return [...existing, ...files.map((file, index) => ({
        id: crypto.randomUUID(), kind, slot: free[index], file, original: file, note: '',
    }))];
};

export const validateVideoReferences = (refs: VideoReference[]): void => {
    for (const kind of Object.keys(REFERENCE_LIMITS) as ReferenceKind[]) {
        const items = refs.filter(ref => ref.kind === kind);
        if (items.length > REFERENCE_LIMITS[kind]) throw new Error(`Maximum ${REFERENCE_LIMITS[kind]} ${kind} references.`);
        const slots = new Set<number>();
        for (const ref of items) {
            if (!Number.isInteger(ref.slot) || ref.slot < 1 || ref.slot > REFERENCE_LIMITS[kind] || slots.has(ref.slot)) throw new Error('Invalid or duplicate reference slot.');
            slots.add(ref.slot);
            if (!ref.file.size || !ref.file.type.startsWith(`${kind}/`)) throw new Error(`Invalid ${referenceToken(ref)} file.`);
        }
    }
    // Inline requests grow by approximately one third during base64 encoding.
    if (refs.reduce((sum, ref) => sum + ref.file.size, 0) > 18 * 1024 * 1024) {
        throw new Error('References exceed 18 MB in total. Resize images, shorten/compress videos or audio before generation.');
    }
};
export const buildVideoPromptInstruction = (draft: VideoPromptInputs): string => {
    if (!draft.idea.trim()) throw new Error('Describe your video idea first.');
    if (!Number.isFinite(draft.duration) || draft.duration < 1 || draft.duration > 120) throw new Error('Duration must be between 1 and 120 seconds.');
    if (!VIDEO_PROMPT_ASPECTS.includes(draft.aspect)) throw new Error('Choose a supported aspect ratio.');
    if (!draft.templates[draft.template].trim()) throw new Error('The selected template is empty.');
    validateVideoReferences(draft.references);
    const availableTokens = new Set(draft.references.map(referenceToken));
    for (const token of draft.idea.match(/<(?:Picture|Video|Audio)\s+\d+>/g) || []) {
        if (!availableTokens.has(token)) throw new Error(`Your idea refers to ${token}, but that reference is missing.`);
    }
    if (draft.template === 'replacement' && (!draft.references.some(ref => ref.kind === 'video') || !draft.references.some(ref => ref.kind === 'image'))) {
        throw new Error('Character replacement requires at least one video and one character image.');
    }
    return `${draft.templates[draft.template]}\n\nRequested output: ${draft.aspect}, ${draft.duration} seconds.
Reference attachments follow in exactly this order (each token refers only to its corresponding attachment):
${draft.references.map(ref => `${referenceToken(ref)}: ${ref.file.name}${ref.note.trim() ? ` | Role: ${ref.note.trim()}` : ''}`).join('\n') || 'No references.'}

User idea:\n${draft.idea}

${audioPromptRequirements(draft.references, draft.originalAudioId, draft.forceOriginalAudio)}`;
};
export const validateVideoPromptOutput = (text: string, template: VideoTemplate): string => {
    const keys = template === 'generation'
        ? ['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music']
        : ['subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music'];
    const normalized = text.trim();
    const headings = [...normalized.matchAll(/^([a-z][a-z_]*):[ \t]*/gm)];
    if (normalized.includes('```') || headings.length !== keys.length || headings.some((heading, index) => heading[1] !== keys[index])
        || headings[0]?.index !== 0
        || headings.some((heading, index) => !normalized.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? normalized.length).trim())) {
        throw new Error(`The model did not return the required non-empty fields in order: ${keys.join(', ')}. Adjust the template/model and retry.`);
    }
    return normalized;
};
export const generateVideoPrompt = async (draft: VideoPromptDraft): Promise<string> => {
    const instruction = buildVideoPromptInstruction(draft);
    const model = draft.models[draft.provider].trim();
    if (!model) throw new Error('Enter a model ID.');
    const files = draft.references.map(ref => ref.file);
    let text: string;
    if (draft.provider === 'gemini') text = (await generateGeminiTextResult(instruction, files, undefined, model)).text;
    else if (draft.provider === 'openrouter') text = await generateOpenRouterText(instruction, files, model);
    else {
        if (draft.references.some(ref => ref.kind !== 'image')) throw new Error('Mammouth integration currently supports image references only. Use Gemini or a compatible OpenRouter model for video/audio.');
        text = (await generateMammouthText(instruction, files, model)).text;
    }
    return validateVideoPromptOutput(text, draft.template);
};

const database = () => openDB('lawiz-video-workspace', 1, {
    upgrade(db) { db.createObjectStore('drafts'); },
});
export const loadVideoPromptDraft = async (): Promise<VideoPromptDraft | undefined> => {
    const db = await database();
    try { return await db.get('drafts', 'workspace'); }
    finally { db.close(); }
};
export const saveVideoPromptDraft = async (draft: VideoPromptDraft): Promise<void> => {
    const db = await database();
    try { await db.put('drafts', draft, 'workspace'); }
    finally { db.close(); }
};
