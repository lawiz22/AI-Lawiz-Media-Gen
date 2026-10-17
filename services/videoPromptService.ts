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
export interface VideoReference {
    id: string;
    kind: ReferenceKind;
    slot: number;
    file: File;
    original: File;
    note: string;
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
}
export type VideoPromptInputs = Pick<VideoPromptDraft, 'idea' | 'provider' | 'models' | 'aspect' | 'duration' | 'template' | 'templates' | 'references' | 'workflow'>;
export const captureVideoPromptInputs = (draft: VideoPromptInputs): VideoPromptInputs => ({
    idea: draft.idea, provider: draft.provider, models: { ...draft.models }, aspect: draft.aspect, duration: draft.duration,
    template: draft.template, templates: { ...draft.templates }, references: draft.references.map(ref => ({ ...ref })), workflow: draft.workflow,
});
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

User idea:\n${draft.idea}`;
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
