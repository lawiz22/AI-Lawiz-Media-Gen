import type { GenerationOptions } from '../types';

export type SceneProvider = 'gemini' | 'mammouth' | 'ollama';
export type SceneIntensity = 'subtle' | 'moderate' | 'strong';
export type SceneAxis = 'pose' | 'expression' | 'lighting' | 'camera' | 'season';
const SCENE_POSTURES = ['standing', 'seated', 'kneeling', 'crouching', 'lying', 'other'] as const;
export interface SceneChoice { label: string; instruction: string; intensity: SceneIntensity; posture?: typeof SCENE_POSTURES[number] }
export interface SceneSubject {
    id: string;
    description: string;
    samDescription?: string;
    faceVisible: boolean;
    pose: string;
    expression: string;
    poses: SceneChoice[];
    expressions: SceneChoice[];
}
export interface SceneAnalysis {
    environment: 'indoor' | 'outdoor' | 'unknown';
    location: string;
    anchors: string[];
    style: string;
    lighting: string;
    camera: string;
    season: string;
    uncertainty: string;
    subjects: SceneSubject[];
    lightingChoices: SceneChoice[];
    cameraChoices: SceneChoice[];
    seasonChoices: SceneChoice[];
}
export interface SceneControl { enabled: boolean; value: string }
export type SceneControls = Record<string, SceneControl>;
export interface SceneJob {
    id: string;
    seed: number;
    prompt: string;
    changes: string[];
    options: GenerationOptions;
    targets?: Array<{ personId?: string; axis: SceneAxis; instruction: string }>;
    maskedPasses?: SceneMaskedPass[];
}
export interface SceneMask { file: File; width: number; height: number; pixels: Uint8Array; preview: string; automaticKey?: string }
export interface SceneMaskedPass { personId: string; mask: File; options: GenerationOptions }
export const SCENE_AXES: SceneAxis[] = ['pose', 'expression', 'lighting', 'camera', 'season'];
export const SCENE_INTENSITIES: SceneIntensity[] = ['subtle', 'moderate', 'strong'];
const textSchema = { type: 'string', minLength: 1, maxLength: 1600 };
const choiceSchema = {
    type: 'array', maxItems: 12,
    items: { type: 'object', additionalProperties: false, required: ['label', 'instruction', 'intensity'], properties: {
        label: { ...textSchema, maxLength: 120 }, instruction: textSchema,
        intensity: { type: 'string', enum: SCENE_INTENSITIES },
    } },
};
const poseChoiceSchema = {
    ...choiceSchema, maxItems: 24,
    items: { ...choiceSchema.items, properties: { ...choiceSchema.items.properties, posture: { type: 'string', enum: SCENE_POSTURES } } },
};
export const SCENE_ANALYSIS_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['environment', 'location', 'anchors', 'style', 'lighting', 'camera', 'season', 'uncertainty', 'subjects', 'lightingChoices', 'cameraChoices', 'seasonChoices'],
    properties: {
        environment: { type: 'string', enum: ['indoor', 'outdoor', 'unknown'] },
        location: textSchema, anchors: { type: 'array', minItems: 1, maxItems: 20, items: textSchema },
        style: textSchema, lighting: textSchema, camera: textSchema, season: textSchema,
        uncertainty: { type: 'string', maxLength: 1600 },
        subjects: { type: 'array', maxItems: 20, items: {
            type: 'object', additionalProperties: false,
            required: ['id', 'description', 'samDescription', 'faceVisible', 'pose', 'expression', 'poses', 'expressions'],
            properties: { id: { type: 'string', pattern: '^person-[0-9]+$' }, description: textSchema,
                samDescription: { ...textSchema, maxLength: 400 },
                faceVisible: { type: 'boolean' }, pose: textSchema, expression: textSchema,
                poses: poseChoiceSchema, expressions: choiceSchema },
        } },
        lightingChoices: choiceSchema, cameraChoices: choiceSchema, seasonChoices: choiceSchema,
    },
};

const objectValue = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scene analysis object.');
    return value as Record<string, unknown>;
};
const textValue = (value: unknown, field: string, empty = false, max = 1600): string => {
    if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) throw new Error(`Invalid analysis field: ${field}.`);
    return value.trim();
};
const arrayValue = (value: unknown, field: string, max: number): unknown[] => {
    if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid analysis list: ${field}.`);
    return value;
};
const readChoices = (value: unknown, poses = false): SceneChoice[] => {
    const choices = arrayValue(value, 'choices', poses ? 24 : 12).map(item => {
        const choice = objectValue(item);
        if (!SCENE_INTENSITIES.includes(choice.intensity as SceneIntensity)) throw new Error('Invalid variation intensity.');
        if (poses && choice.posture !== undefined && !SCENE_POSTURES.includes(choice.posture as typeof SCENE_POSTURES[number])) throw new Error('Invalid pose posture.');
        return { label: textValue(choice.label, 'label', false, 120), instruction: textValue(choice.instruction, 'instruction'), intensity: choice.intensity as SceneIntensity,
            ...(poses && choice.posture !== undefined ? { posture: choice.posture as typeof SCENE_POSTURES[number] } : {}) };
    });
    if (new Set(choices.map(choice => choice.instruction)).size !== choices.length) throw new Error('Analysis contains duplicate variation choices.');
    return choices;
};
export const parseSceneAnalysis = (text: string): SceneAnalysis => {
    const raw = objectValue(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
    if (!['indoor', 'outdoor', 'unknown'].includes(String(raw.environment))) throw new Error('Invalid environment classification.');
    const subjects = arrayValue(raw.subjects, 'subjects', 20).map(item => {
        const subject = objectValue(item);
        const id = textValue(subject.id, 'person ID');
        if (!/^person-[0-9]+$/.test(id) || typeof subject.faceVisible !== 'boolean') throw new Error('Invalid person identity or visibility.');
        return { id, description: textValue(subject.description, 'person description'), faceVisible: subject.faceVisible,
            ...(subject.samDescription !== undefined ? { samDescription: textValue(subject.samDescription, 'SAM description', true, 400) } : {}),
            pose: textValue(subject.pose, 'pose'), expression: textValue(subject.expression, 'expression'),
            poses: readChoices(subject.poses, true), expressions: readChoices(subject.expressions) };
    });
    if (new Set(subjects.map(subject => subject.id)).size !== subjects.length) throw new Error('Duplicate person IDs in analysis.');
    const anchors = arrayValue(raw.anchors, 'location anchors', 20).map(anchor => textValue(anchor, 'anchor'));
    if (!anchors.length) throw new Error('Analysis must describe at least one location anchor.');
    return { environment: raw.environment as SceneAnalysis['environment'], location: textValue(raw.location, 'location'), anchors,
        style: textValue(raw.style, 'style'), lighting: textValue(raw.lighting, 'lighting'), camera: textValue(raw.camera, 'camera'),
        season: textValue(raw.season, 'season'), uncertainty: textValue(raw.uncertainty, 'uncertainty', true), subjects,
        lightingChoices: readChoices(raw.lightingChoices), cameraChoices: readChoices(raw.cameraChoices), seasonChoices: readChoices(raw.seasonChoices) };
};

export const analyzeSceneImage = async (
    source: File, provider: SceneProvider, ollama: { url: string; model: string }, signal?: AbortSignal,
    onUsage?: (usage: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }) => void,
): Promise<SceneAnalysis> => {
    const instruction = `Analyze the supplied image faithfully. Return only JSON matching this schema: ${JSON.stringify(SCENE_ANALYSIS_SCHEMA)}.
Identify all individually distinguishable people by stable person-1, person-2 IDs, never real names. The description field is a short source-location lookup, ideally under 15 words: use original left/right, foreground/background and nearby objects, for example 'foreground left, in the round chair'. Do not catalogue clothing, garment patterns, colors, materials, shoes or accessories; Picture 1 supplies their exact appearance. Do not include actions, limb positions, gaze or held-object orientation; put these in pose. Count each real person once, not again for reflections, posters or photographs. Do not turn decorations or uncertain background shapes into people; report uncertain counts in uncertainty. Describe original body poses and facial expressions. If a face is hidden or too small, faceVisible=false and expressions=[]. Never invent people. Report crowds, uncertain details or occlusion in uncertainty. Unknown season is allowed as text. An interior with a window remains indoor; mixed or ambiguous environments are unknown.
SAM SEGMENTATION: also provide samDescription for every person. This is a separate English noun phrase for locating ONE existing person with SAM3, not editing them. Start with 'person' and put 2-3 distinctive, clearly visible appearance cues first (hair length/color, facial hair if visible, main garment type/color/pattern), then left/right position if useful. Aim for 12-30 words. Use cues that distinguish this person from the other people, not just 'left foreground' or a nearby mirror. Describe the whole visible person, not an isolated garment or just their face. Clothing observations are allowed ONLY in samDescription, never in description or variation instructions. Use only observed details: do not infer ethnicity, identity, unseen clothing, or desired changes. Avoid person-N references, pronouns, lists of other people, negative clauses and scene inventories. For example, 'person with short blond hair wearing a checked top and patterned cardigan on the left'. SAM3 consumes this field only; it must never describe a target outfit for FLUX2.
Describe the precise location and fixed architectural/object anchors and their spatial arrangement. Describe the original medium, texture, grain, compression, softness and rendering style including VHS or illustration, not an idealized replacement.
Keep clothing descriptions out of location, anchors and variation instructions as well. Each proposal must refer to its person ID and change only the selected attribute, never redesign, recolor, exchange or complete an outfit. Do not describe a desired outfit even when changing pose or viewing angle. Use the image itself for garment details. Background anchors must not recount people as additional scene objects.
POSE DIVERSITY: for each person, aim for 4 subtle, 6 moderate and 8 strong pose proposals when the visible scene permits, at most 24 in total. These pose counts override the two-choice rule for other axes below. Each pose must include its final support posture in posture: standing, seated, kneeling, crouching, lying or other. Do not fill a level with hand/arm variations of the same kneeling or seated stance. For moderate and strong, distribute proposals across several feasible support postures and body orientations. The original support posture is NOT locked when pose varies. If a person is kneeling or seated on an accessible floor and standing is physically plausible in the established space, include at least one explicit fully standing proposal at both moderate and strong levels: both feet on that same floor, knees off the floor, torso upright. Include other compatible postures rather than always keeping them on their knees. Specify the final posture, not merely an attempt or intention to rise. For subtle, keep changes small but distinct. Keep the person in the same area, with the same clothing and objects; do not invent a seat or support, assume a hidden floor, relocate the person or change the camera to fit a pose. Return fewer proposals when the framing, space or visible constraints make these transitions implausible; explain the limitation in uncertainty. Keep pose instructions concise and structurally distinct, not paraphrases.
Suggest concise context-specific variations, with two distinct choices per intensity subtle/moderate/strong for each applicable axis when feasible. Every proposal must create an observable change from this specific source within its framing, never an unchanged pose, invisible weight shift or vague intention. Subtle means a small but visible change. Moderate means an unmistakable change to visible limb placement, torso configuration or viewpoint. Strong means a substantial but physically plausible change while preserving the same scene. For pose proposals, specify a concrete target configuration for relevant visible joints and the direction of held objects; do not merely name a mood or an action. Do not propose changes only to knees or feet outside the frame. Poses must work with existing supports and props; no new furniture, objects, clothing or location. Expressions change only the face, not body pose. Camera proposals must specify a new position relative to the source and a viewing direction, with a visible perspective change: describe the camera height or lateral displacement and the resulting relative view of existing anchors. For moderate/strong, avoid vague words such as slightly; do not substitute cropping or zooming for moving the camera. Camera varies viewpoint only, never camera medium or style; avoid unseen reverse views. Lighting varies physical illumination only, never visual medium, film grain, expressions or color grading. Seasons vary only existing outdoor vegetation and surfaces, no geometry, wardrobe or time-of-day change. seasonChoices=[] unless outdoor. Empty proposals are valid when no safe visible change is possible. Each choice contains only its own axis instruction. All suggestions preserve identities, subject count, outfits, location, existing objects and visual style.`;
    let response: { text: string; usageMetadata?: any };
    if (provider === 'ollama') {
        const { analyzeStructuredImageWithOllama } = await import('./ollamaService');
        response = { text: await analyzeStructuredImageWithOllama(source, instruction, SCENE_ANALYSIS_SCHEMA, ollama.url, ollama.model, signal) };
    } else if (provider === 'gemini') {
        const { generateGeminiTextResult } = await import('./geminiService');
        response = await generateGeminiTextResult(instruction, [source]);
    } else {
        const { generateMammouthText } = await import('./mammouthService');
        response = await generateMammouthText(instruction, [source]);
    }
    if (response.usageMetadata) onUsage?.(response.usageMetadata);
    if (signal?.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
    return parseSceneAnalysis(response.text);
};

export const createSceneControls = (analysis?: SceneAnalysis): SceneControls => Object.fromEntries([
    ...SCENE_AXES.map(axis => [axis, { enabled: false, value: 'auto' }] as const),
    ...(analysis?.subjects || []).flatMap(subject => ['pose', 'expression'].map(axis => [`${axis}:${subject.id}`, { enabled: true, value: 'auto' }] as const)),
]);
export const sceneChoices = (analysis: SceneAnalysis, axis: SceneAxis, intensity: SceneIntensity, subject?: SceneSubject): SceneChoice[] => {
    const choices = axis === 'pose' ? subject?.poses || [] : axis === 'expression' ? (subject?.faceVisible ? subject.expressions : [])
        : axis === 'season' ? (analysis.environment === 'outdoor' ? analysis.seasonChoices : [])
        : axis === 'camera' ? analysis.cameraChoices : analysis.lightingChoices;
    return choices.filter(choice => choice.intensity === intensity);
};
export const randomSceneChoice = (choices: SceneChoice[], previous = '', random = Math.random): string => {
    const alternatives = choices.filter(choice => choice.instruction !== previous);
    const pool = alternatives.length ? alternatives : choices;
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].instruction : 'auto';
};

export const defaultSceneSettings = (initial: Partial<GenerationOptions> = {}): Partial<GenerationOptions> => ({
    comfyFlux2EditUnet: initial.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf',
    comfyFlux2EditClip: initial.comfyFlux2EditClip || 'qwen_3_4b.safetensors', comfyFlux2EditVae: initial.comfyFlux2EditVae || 'flux2-vae.safetensors',
    comfyFlux2EditSteps: 4, comfyFlux2EditCfg: 1, comfyFlux2EditSampler: 'euler', comfyFlux2EditMegapixels: 1,
    comfyFlux2EditLora1Name: '', comfyFlux2EditLora1Strength: 1, comfyFlux2EditLora2Name: '', comfyFlux2EditLora2Strength: 1,
    comfyFlux2EditUseCacheDit: false, comfyFlux2EditCacheDitModelType: 'Auto', comfyFlux2EditCacheDitWarmupSteps: 0, comfyFlux2EditCacheDitSkipInterval: 0,
});

export const buildSceneJobs = (
    analysis: SceneAnalysis, controls: SceneControls, intensity: SceneIntensity, count: number,
    settings: Partial<GenerationOptions>, random = Math.random,
): SceneJob[] => {
    parseSceneAnalysis(JSON.stringify(analysis));
    if (!SCENE_INTENSITIES.includes(intensity) || !Number.isInteger(count) || count < 1 || count > 8) throw new Error('Invalid batch settings.');
    const fields: Array<{ key: string; axis: SceneAxis; label: string; choices: SceneChoice[] }> = [
        ...analysis.subjects.flatMap(subject => (['pose', 'expression'] as const).map(axis => ({ key: `${axis}:${subject.id}`, axis,
            label: `${subject.id} (${subject.description}) ${axis}`, choices: sceneChoices(analysis, axis, intensity, subject) }))),
        ...(['lighting', 'camera', 'season'] as const).map(axis => ({ key: axis, axis, label: axis, choices: sceneChoices(analysis, axis, intensity) })),
    ];
    const active = fields.filter(field => controls[field.axis]?.enabled && controls[field.key]?.enabled && field.choices.length);
    if (!active.length) throw new Error('Enable at least one applicable variation.');
    for (const field of active) {
        if (controls[field.key].value !== 'auto' && !field.choices.some(choice => choice.instruction === controls[field.key].value)) throw new Error(`Choose a valid ${field.label} variation for this intensity.`);
    }
    const previous: Record<string, string> = {};
    const pools = active.map(field => controls[field.key].value === 'auto' ? field.choices : field.choices.filter(choice => choice.instruction === controls[field.key].value));
    const poseUses = active.map(() => new Map<string, number>());
    const postureUses = active.map(() => new Map<string, number>());
    const usedCombinations = new Set<string>();
    return Array.from({ length: count }, (_, index) => {
        const availablePools = pools.map((pool, fieldIndex) => {
            const field = active[fieldIndex];
            if (field.axis !== 'pose' || controls[field.key].value !== 'auto') return pool;
            const leastUsed = Math.min(...pool.map(choice => poseUses[fieldIndex].get(choice.instruction) || 0));
            return pool.filter(choice => (poseUses[fieldIndex].get(choice.instruction) || 0) === leastUsed);
        });
        const selections = availablePools.map((pool, fieldIndex) => {
            const field = active[fieldIndex];
            const leastUsedPosture = Math.min(...pool.map(choice => postureUses[fieldIndex].get(choice.posture || 'other') || 0));
            const preferred = field.axis === 'pose' && controls[field.key].value === 'auto'
                ? pool.filter(choice => (postureUses[fieldIndex].get(choice.posture || 'other') || 0) === leastUsedPosture) : pool;
            const selected = randomSceneChoice(preferred, previous[field.key], random);
            return pool.findIndex(choice => choice.instruction === selected);
        });
        const combinationKey = () => JSON.stringify(selections.map((selection, fieldIndex) => availablePools[fieldIndex][selection].instruction));
        for (let attempt = 0; usedCombinations.has(combinationKey()) && attempt < usedCombinations.size; attempt++) {
            for (let fieldIndex = selections.length - 1; fieldIndex >= 0; fieldIndex--) {
                selections[fieldIndex] = (selections[fieldIndex] + 1) % availablePools[fieldIndex].length;
                if (selections[fieldIndex] !== 0) break;
            }
        }
        usedCombinations.add(combinationKey());
        const resolved = active.map((field, fieldIndex) => {
            const selected = availablePools[fieldIndex][selections[fieldIndex]];
            const choice = selected.instruction;
            previous[field.key] = choice;
            if (field.axis === 'pose' && controls[field.key].value === 'auto') {
                poseUses[fieldIndex].set(choice, (poseUses[fieldIndex].get(choice) || 0) + 1);
                const posture = selected.posture || 'other';
                postureUses[fieldIndex].set(posture, (postureUses[fieldIndex].get(posture) || 0) + 1);
            }
            return { field, choice };
        });
        const changes = resolved.map(({ field, choice }) => `${field.label}: ${choice}`);
        const targets = resolved.map(({ field, choice }) => {
            const subjectId = field.key.split(':')[1];
            return `TARGET ${subjectId ? `${subjectId} ` : ''}${field.axis}: ${choice}`;
        });
        const cameraTarget = resolved.find(({ field }) => field.axis === 'camera');
        const locked = fields.filter(field => !active.includes(field)).map(field => {
            const subject = analysis.subjects.find(item => field.key.endsWith(`:${item.id}`));
            const original = subject ? subject[field.axis as 'pose' | 'expression'] : analysis[field.axis as 'lighting' | 'camera' | 'season'];
            return `UNCHANGED ${subject ? `${subject.id} ` : ''}${field.axis}: preserve the source ${field.axis}${cameraTarget ? '.' : ` (${original}).`}`;
        });
        const seed = settings.comfySeed === undefined ? Math.floor(random() * 1e15) : settings.comfySeed;
        if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Seed must be a non-negative safe integer.');
        const subjectLocks = [
            analysis.subjects.length
                ? `PEOPLE COUNT: exactly ${analysis.subjects.length} distinct people, the same source individuals (${analysis.subjects.map(subject => subject.id).join(', ')}). Each ID is one existing person to edit in place, never a new person to add. Never duplicate, clone, merge, replace or remove a person, or add people in the background, doorways or reflections. A pose change replaces that person's old pose; do not leave an old copy behind.`
                : 'PEOPLE COUNT: zero people. Keep this scene unoccupied; do not add people, faces or human silhouettes.',
            'Keep the original clothing unchanged. Picture 1 is the sole wardrobe reference for each person. Preserve the exact same garments, prints and pattern layout, colors, cut, fabric, footwear and accessories on their original wearer; never redesign, substitute or swap outfits between people. Only natural folds, perspective and illumination may change with the requested edits.',
        ];
        const prompt = (cameraTarget ? [
            analysis.subjects.length
                ? `Take the ${analysis.subjects.length === 1 ? 'person' : 'people'} from the input image, Picture 1, keep their exact identity, visible facial features, hairstyle, outfit and accessories, but change the camera angle: ${cameraTarget.choice}`
                : `Take the scene from the input image, Picture 1, keep its exact existing objects and surroundings, but change the camera angle: ${cameraTarget.choice}`,
            'Move the viewpoint, not just the subject. Show the existing surroundings from that new angle; their perspective and screen positions must change, not merely the crop.',
            ...subjectLocks,
            ...targets.filter((_, targetIndex) => resolved[targetIndex].field.axis !== 'camera'),
            ...(active.some(field => field.axis === 'pose') ? ['Apply each TARGET pose with visibly different limb positions and held-object directions within the output framing.'] : []),
            ...(analysis.subjects.length > 1 ? ['SOURCE SUBJECT LOOKUP ONLY: these descriptions locate existing people in Picture 1, not target outfits or poses. Picture 1 overrides any inaccurate description.', ...analysis.subjects.map(subject => `${subject.id}: ${subject.description}.`)] : []),
            'LOCKED LOCATION: use Picture 1 itself as the reference for the same physical place and objects, not a fixed output composition. Existing objects may occlude one another from the new viewpoint.',
            'NO ADDED OBJECTS: Picture 1 is the authority. Do not duplicate accessories or transfer them onto doors, walls or furniture. Bare surfaces stay bare. Do not invent decorations or unseen scene contents.',
            'LOCKED STYLE: use Picture 1 itself as the reference for the same visual medium, texture and color grading.',
            active.some(field => field.axis === 'lighting')
                ? 'Apply the separately requested lighting change, without changing the capture style.'
                : 'Same lighting and color grading as the original.',
            ...analysis.subjects.filter(subject => !subject.faceVisible).map(subject => `Keep ${subject.id}'s face hidden or covered as in Picture 1. Do not invent visible facial features.`),
            ...locked,
            'Preserve UNCHANGED poses in world space, not their original projection. Apply this camera view and all TARGET edits together. Keep the original aspect ratio.',
            ...(active.some(field => field.axis === 'season') ? ['Season changes affect existing vegetation and surfaces only, never geometry, buildings, wardrobe or time of day.'] : []),
        ] : [
            'Transform Picture 1 into one new image of the SAME physical scene. Implement every TARGET below together in the final image; these are required edits, not optional suggestions.',
            ...subjectLocks,
            ...targets,
            ...(active.some(field => field.axis === 'pose') ? ['For every TARGET pose, replace that person\'s original pose with the specified target configuration. Change the relevant visible joints, limb positions, torso orientation and held-object direction together as required by that target. The target must be visibly different from the source within the output framing; do not retain the source pose or substitute an invisible weight shift. Preserve body proportions and the identity of held objects, not their original orientation or grip when the target requires moving them.'] : []),
            `Requested variation amplitude: ${intensity}. This controls the extent of each required edit, never whether to perform it.`,
            ...(analysis.subjects.length > 1 ? ['SOURCE SUBJECT LOOKUP ONLY: these descriptions locate existing people in Picture 1, not target outfits or poses. Picture 1 overrides any inaccurate description.', ...analysis.subjects.map(subject => `${subject.id}: ${subject.description}.`)] : []),
            `LOCKED LOCATION: ${analysis.location}. Physical scene anchors: ${analysis.anchors.join('; ')}.`,
            'Preserve the actual architecture, object identities and their world-space arrangement. Source-relative left/right and visibility describe the reference, not a fixed output composition. A requested camera move may change their screen positions, apparent size and visibility; do not move the furniture to simulate a camera move or force every anchor to remain visible.',
            `LOCKED STYLE: ${analysis.style}. Preserve original grain, softness, noise, compression and capture/rendering medium. No restoration, sharpening, beautification or new aesthetic.`,
            'Preserve every existing person, identity, face structure, body proportions, hairstyle, garment and accessory; do not add or remove people or objects.',
            'NO ADDED OBJECTS: Picture 1 is the authority for what exists, not uncertain details in its text description. Preserve the count and placement of existing background items. Do not duplicate accessories or transfer them onto doors, walls or furniture. Bare surfaces stay bare; do not add hanging items, decorations or attachments. A new camera angle may reveal another view of established objects, not invent new contents or fill unseen areas with guessed props.',
            ...analysis.subjects.filter(subject => !subject.faceVisible).map(subject => `Keep ${subject.id}'s face hidden or covered as in Picture 1. Do not invent visible facial features.`),
            ...locked,
            'Disabled poses stay identical in world space even if viewpoint changes. Facial expressions never authorize body-pose changes. Lighting changes physical illumination only, not medium, texture, grading or expression. Camera changes viewpoint only, not capture style. Seasons affect existing vegetation and ground surfaces only, never geometry, buildings, wardrobe or time of day; preserve illumination unless lighting is explicitly enabled.',
            'Change only the TARGET attributes. Identity, physical-location and visual-medium preservation do not require keeping a pose or camera projection that a TARGET explicitly replaces. Do not invent supports, props, unseen rooms or a reverse-view environment. Keep the source aspect ratio.',
            'FINAL IMAGE REQUIREMENT: visibly realize all TARGET edits simultaneously while preserving every UNCHANGED attribute. A near-copy that omits a requested pose or camera transformation is not the requested result.',
        ]).join('\n');
        const options = { ...settings, provider: 'comfyui', comfyModelType: 'flux2-edit', numImages: 1, comfySeed: seed,
            comfyFlux2EditPrompt: prompt, comfyPrompt: '', comfyFlux2EditPreserveSourceStyle: true,
            comfyFlux2EditReferenceRoles: [], comfyFlux2EditReferenceDescriptions: [], comfyFlux2EditReinforceSourceIdentity: false } as GenerationOptions;
        return { id: `scene-${index}-${seed}`, seed, prompt, changes, options,
            targets: resolved.map(({ field, choice }) => ({ personId: field.key.split(':')[1], axis: field.axis, instruction: choice })) };
    });
};

export const sceneModelOptions = (info: any, node: string, input: string): string[] => {
    const definition = info?.[node]?.input?.required?.[input];
    const values = definition?.[0] === 'COMBO' ? definition?.[1]?.options : definition?.[0];
    return Array.isArray(values) ? values.filter(value => typeof value === 'string') : [];
};
export const sceneReadinessErrors = (info: any, settings: Partial<GenerationOptions>): string[] => {
    if (!info) return ['Connect ComfyUI and load its model inventory.'];
    const loader = settings.comfyFlux2EditUnet?.toLowerCase().endsWith('.gguf') ? 'UnetLoaderGGUF' : 'UNETLoader';
    const nodes = [loader, 'LoadImage', 'ImageScaleToTotalPixels', 'GetImageSize', 'VAEEncode', 'VAELoader', 'CLIPLoader', 'CLIPTextEncode', 'ConditioningZeroOut', 'ReferenceLatent', 'EmptyFlux2LatentImage', 'RandomNoise', 'KSamplerSelect', 'Flux2Scheduler', 'CFGGuider', 'SamplerCustomAdvanced', 'VAEDecode', 'SaveImage'];
    const loras = [settings.comfyFlux2EditLora1Name, settings.comfyFlux2EditLora2Name].filter(name => name?.trim() && name !== 'None');
    if (loras.length) nodes.push('LoraLoaderModelOnly');
    if (settings.comfyFlux2EditUseCacheDit) nodes.push('CacheDiT_Model_Optimizer');
    const errors = nodes.filter(node => !info[node]).map(node => `Missing node: ${node}`);
    for (const [node, input, value] of [
        [loader, 'unet_name', settings.comfyFlux2EditUnet], ['CLIPLoader', 'clip_name', settings.comfyFlux2EditClip],
        ['VAELoader', 'vae_name', settings.comfyFlux2EditVae], ['KSamplerSelect', 'sampler_name', settings.comfyFlux2EditSampler],
        ...loras.map(name => ['LoraLoaderModelOnly', 'lora_name', name]),
        ...(settings.comfyFlux2EditUseCacheDit ? [['CacheDiT_Model_Optimizer', 'model_type', settings.comfyFlux2EditCacheDitModelType]] : []),
    ]) {
        if (!value || !sceneModelOptions(info, node!, input!).includes(value)) errors.push(`Unavailable ${input}: ${value || '(none)'}`);
    }
    return errors;
};

export const generateSceneVariation = async (source: File, job: SceneJob, progress: (message: string, value: number) => void) => {
    const { generateComfyUIPortraits, generateComfyUIMaskedEdit, getComfyUIObjectInfo } = await import('./comfyUIService');
    const info = await getComfyUIObjectInfo();
    const errors = job.maskedPasses ? sceneMaskedReadinessErrors(info, job.options) : sceneReadinessErrors(info, job.options);
    if (errors.length) throw new Error(errors.join('\n'));
    if (job.maskedPasses) {
        const passes = job.maskedPasses;
        const result = await runMaskedScenePasses(source, passes, async (current, pass, index) => {
            const generated = await generateComfyUIMaskedEdit(current, pass.mask, pass.options,
                (message, value) => progress(`${pass.personId} (${index + 1}/${passes.length}): ${message}`, (index + value) / passes.length));
            const response = await fetch(generated.src);
            if (!response.ok) throw new Error('Unable to load the masked pass result.');
            const blob = await response.blob();
            return { image: new File([blob], `scene-masked-${job.seed}-${index}.png`, { type: blob.type || 'image/png' }), prompt: generated.prompt };
        });
        const { fileToDataUrl } = await import('../utils/imageUtils');
        return { src: await fileToDataUrl(result.image), seed: job.seed, prompt: result.prompt };
    }
    const result = await generateComfyUIPortraits(source, job.options, progress);
    if (!result.images[0]) throw new Error('FLUX2 returned no image.');
    return { ...result.images[0], prompt: result.finalPrompt };
};

export const sceneMaskPixels = (data: Uint8ClampedArray, width: number, height: number): Uint8Array => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_000_000 || data.length !== width * height * 4) throw new Error('Invalid mask dimensions (maximum 16 megapixels).');
    const pixels = new Uint8Array(width * height);
    let editable = 0;
    for (let index = 0; index < pixels.length; index++) {
        const offset = index * 4;
        if (data[offset + 3] !== 255 || data[offset] !== data[offset + 1] || data[offset] !== data[offset + 2]) throw new Error('Use an opaque grayscale mask: white edits, black protects.');
        pixels[index] = data[offset];
        if (pixels[index] > 0) editable++;
    }
    if (!editable) throw new Error('The mask has no editable pixels.');
    if (editable === pixels.length) throw new Error('The mask must include black protected pixels.');
    return pixels;
};

export const readSceneMask = async (file: File, source: File): Promise<SceneMask> => {
    const original = await createImageBitmap(source);
    try {
        const mask = await createImageBitmap(file);
        try {
            if (mask.width !== original.width || mask.height !== original.height) throw new Error(`Mask must match the source: ${original.width} x ${original.height}.`);
            if (mask.width * mask.height > 16_000_000) throw new Error('Mask exceeds 16 megapixels.');
            const canvas = document.createElement('canvas'); canvas.width = mask.width; canvas.height = mask.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Image canvas unavailable.');
            context.drawImage(mask, 0, 0);
            const pixels = sceneMaskPixels(context.getImageData(0, 0, mask.width, mask.height).data, mask.width, mask.height);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to encode mask.')), 'image/png'));
            context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(original, 0, 0);
            const overlay = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let index = 0; index < pixels.length; index++) {
                const opacity = pixels[index] / 255 * 0.55;
                overlay.data[index * 4] = overlay.data[index * 4] * (1 - opacity) + 240 * opacity;
                overlay.data[index * 4 + 1] *= 1 - opacity;
                overlay.data[index * 4 + 2] = overlay.data[index * 4 + 2] * (1 - opacity) + 170 * opacity;
            }
            context.putImageData(overlay, 0, 0);
            return { file: new File([blob], 'scene-mask.png', { type: 'image/png' }), width: mask.width, height: mask.height, pixels, preview: canvas.toDataURL('image/jpeg', 0.8) };
        } finally { mask.close(); }
    } finally { original.close(); }
};

export const validateSceneMasks = (ids: string[], masks: Record<string, SceneMask>): void => {
    let occupied: Uint8Array | undefined;
    let width = 0; let height = 0;
    for (const id of ids) {
        const mask = masks[id];
        if (!mask) throw new Error(`Import a mask for ${id}.`);
        if (!occupied) { width = mask.width; height = mask.height; occupied = new Uint8Array(width * height); }
        if (mask.width !== width || mask.height !== height || mask.pixels.length !== occupied.length) throw new Error('All masks must match the source dimensions.');
        for (let index = 0; index < occupied.length; index++) {
            if (mask.pixels[index] > 0) {
                if (occupied[index]) throw new Error(`Masks overlap at ${id}. Protect other people's regions with black pixels.`);
                occupied[index] = 1;
            }
        }
    }
};

export const sceneMaskedReadinessErrors = (info: any, settings: Partial<GenerationOptions>): string[] => {
    const errors = sceneReadinessErrors(info, settings);
    for (const [node, inputs] of Object.entries({
        ImageScale: ['image', 'width', 'height', 'upscale_method', 'crop'], ImageToMask: ['image', 'channel'],
        SetLatentNoiseMask: ['samples', 'mask'], ImageCompositeMasked: ['destination', 'source', 'mask', 'x', 'y', 'resize_source'],
    })) {
        if (!info?.[node]) { errors.push(`Missing masked node: ${node}`); continue; }
        const sockets = { ...info[node].input?.required, ...info[node].input?.optional };
        for (const input of inputs) if (!(input in sockets)) errors.push(`Missing masked input: ${node}.${input}`);
    }
    for (const [node, input, value] of [['ImageToMask', 'channel', 'red'], ['ImageScale', 'upscale_method', 'nearest-exact'], ['ImageScale', 'upscale_method', 'bicubic'], ['ImageScale', 'crop', 'disabled']]) {
        if (info?.[node] && !sceneModelOptions(info, node, input).includes(value)) errors.push(`Unavailable masked option: ${node}.${input} = ${value}`);
    }
    return errors;
};

export const buildMaskedSceneJobs = (
    analysis: SceneAnalysis, controls: SceneControls, intensity: SceneIntensity, count: number,
    settings: Partial<GenerationOptions>, masks: Record<string, SceneMask>, random = Math.random,
): SceneJob[] => {
    if (['camera', 'lighting', 'season'].some(axis => controls[axis]?.enabled)) throw new Error('Camera, lighting and season require Global mode.');
    const jobs = buildSceneJobs(analysis, controls, intensity, count, settings, random);
    const ids = analysis.subjects.filter(subject => jobs[0].targets?.some(target => target.personId === subject.id)).map(subject => subject.id);
    validateSceneMasks(ids, masks);
    return jobs.map(job => {
        const maskedPasses = ids.map(personId => {
            const subject = analysis.subjects.find(person => person.id === personId)!;
            const targets = job.targets!.filter(target => target.personId === personId);
            const prompt = [
                `Edit only the existing person ${personId} inside the supplied edit region of Picture 1. Source lookup: ${subject.description}. This identifies an existing person, not a person to add.`,
                ...targets.map(target => `TARGET ${target.axis}: ${target.instruction}`),
                `Keep exactly ${analysis.subjects.length} original people. Replace the target person's old pose, leaving no copy behind; reconstruct only the background vacated within the mask. Do not duplicate people or objects.`,
                'Keep the original clothing unchanged. Preserve this person\'s exact face, identity, hair, body proportions, outfit, pattern layout, footwear and accessories from the image.',
                ...(['pose', 'expression'] as const).filter(axis => !targets.some(target => target.axis === axis)).map(axis => `Keep this person's ${axis} unchanged.`),
                ...(!subject.faceVisible ? ['Keep this face hidden or covered; do not invent facial features.'] : []),
                'Keep every other person unchanged. Keep the camera, lighting, season and original visual medium, grain and color grading. Do not add props or change the room. Return one coherent image.',
            ].join('\n');
            return { personId, mask: masks[personId].file, options: { ...job.options, comfyFlux2EditPrompt: prompt } };
        });
        return { ...job, maskedPasses, prompt: maskedPasses.map(pass => `${pass.personId}:\n${pass.options.comfyFlux2EditPrompt}`).join('\n\n') };
    });
};

export const runMaskedScenePasses = async <Image>(
    source: Image, passes: SceneMaskedPass[], execute: (image: Image, pass: SceneMaskedPass, index: number) => Promise<{ image: Image; prompt: string }>,
): Promise<{ image: Image; prompt: string }> => {
    if (!passes.length) throw new Error('Select at least one masked person.');
    let image = source;
    const prompts: string[] = [];
    for (let index = 0; index < passes.length; index++) {
        const result = await execute(image, passes[index], index);
        image = result.image;
        prompts.push(`${passes[index].personId} / seed ${passes[index].options.comfySeed}\n${result.prompt}`);
    }
    return { image, prompt: prompts.join('\n\n') };
};

export const runSceneBatch = async <Result>(
    source: File, jobs: SceneJob[], stopped: () => boolean,
    execute: (source: File, job: SceneJob) => Promise<Result>,
    onResult: (job: SceneJob, result: Result) => void,
): Promise<void> => {
    for (const job of jobs) {
        if (stopped()) break;
        const result = await execute(source, job);
        onResult(job, result);
    }
};

export const sceneAutomaticMaskTargets = (analysis: SceneAnalysis, controls: SceneControls, intensity: SceneIntensity, padding: number) => {
    parseSceneAnalysis(JSON.stringify(analysis));
    const selected = analysis.subjects.flatMap(subject => {
        const pose = controls.pose?.enabled && controls[`pose:${subject.id}`]?.enabled && sceneChoices(analysis, 'pose', intensity, subject).length > 0;
        const expression = controls.expression?.enabled && controls[`expression:${subject.id}`]?.enabled && sceneChoices(analysis, 'expression', intensity, subject).length > 0;
        return pose || expression ? [{ id: subject.id, faceOnly: !pose, description: subject.samDescription?.trim() || `person ${subject.description}` }] : [];
    });
    if (!selected.length) throw new Error('Enable at least one person pose or expression.');
    const targets = [
        ...analysis.subjects.map(subject => ({ id: `body:${subject.id}`, prompt: subject.samDescription?.trim() || `person ${subject.description}`, padding: selected.some(item => item.id === subject.id && !item.faceOnly) ? padding : 0 })),
        ...selected.filter(item => item.faceOnly).map(item => ({ id: `face:${item.id}`, prompt: `face of the ${item.description}`, padding: 0 })),
    ];
    return { selected, targets };
};

export type ScenePoseMaskArea = 'silhouette' | 'movement';

const scenePoseMovementPixels = (body: SceneMask, candidate: SceneMask, intensity: SceneIntensity): Uint8Array => {
    const { width, height } = body;
    let left = width, right = -1, top = height, bottom = -1;
    for (let index = 0; index < body.pixels.length; index++) {
        if (!body.pixels[index]) continue;
        const column = index % width;
        const row = Math.floor(index / width);
        left = Math.min(left, column); right = Math.max(right, column);
        top = Math.min(top, row); bottom = Math.max(bottom, row);
    }
    const ratio = { subtle: 0.1, moderate: 0.2, strong: 0.35 }[intensity];
    const horizontalMargin = Math.ceil((right - left + 1) * ratio);
    const verticalMargin = Math.ceil((bottom - top + 1) * ratio);
    const startColumn = Math.max(0, left - horizontalMargin);
    const endColumn = Math.min(width, right + horizontalMargin + 1);
    const startRow = Math.max(0, top - verticalMargin);
    const endRow = Math.min(height, bottom + verticalMargin + 1);
    const pixels = candidate.pixels.slice();
    for (let row = startRow; row < endRow; row++) pixels.fill(255, row * width + startColumn, row * width + endColumn);
    return pixels;
};

export const isolateAutomaticSceneMasks = (
    bodies: Record<string, SceneMask>, candidates: Record<string, SceneMask>, faceOnly: string[],
    poseArea: ScenePoseMaskArea = 'silhouette', intensity: SceneIntensity = 'moderate',
): Record<string, Uint8Array> => {
    const ids = Object.keys(bodies);
    if (!ids.length) throw new Error('SAM3 detected no people.');
    validateSceneMasks(ids, bodies);
    const { width, height } = bodies[ids[0]];
    const owners = new Uint8Array(width * height);
    ids.forEach((id, owner) => { bodies[id].pixels.forEach((value, index) => { if (value) owners[index] = owner + 1; }); });
    const occupancy = new Uint8Array(owners.length);
    const result: Record<string, Uint8Array> = {};
    for (const [id, candidate] of Object.entries(candidates)) {
        const owner = ids.indexOf(id) + 1;
        if (!owner || candidate.width !== width || candidate.height !== height || candidate.pixels.length !== owners.length) throw new Error('SAM3 mask dimensions or person identity mismatch.');
        const restrictToBody = faceOnly.includes(id);
        const pixels = !restrictToBody && poseArea === 'movement'
            ? scenePoseMovementPixels(bodies[id], candidate, intensity) : candidate.pixels.slice();
        for (let index = 0; index < pixels.length; index++) {
            if ((owners[index] && owners[index] !== owner) || (restrictToBody && owners[index] !== owner)) pixels[index] = 0;
            if (pixels[index]) occupancy[index]++;
        }
        result[id] = pixels;
    }
    for (const [id, pixels] of Object.entries(result)) {
        let editable = 0;
        for (let index = 0; index < pixels.length; index++) {
            if (occupancy[index] > 1) pixels[index] = 0;
            if (pixels[index]) editable++;
        }
        if (!editable) throw new Error(`SAM3 found no isolated editable region for ${id}. Refine the description and calculate again.`);
    }
    return result;
};

export const generateAutomaticSceneMasks = async (
    source: File, analysis: SceneAnalysis, controls: SceneControls, intensity: SceneIntensity, checkpoint: string, padding: number,
    progress: (message: string, value: number) => void, stopped: () => boolean,
    poseArea: ScenePoseMaskArea = 'movement',
): Promise<Record<string, SceneMask>> => {
    const { selected, targets } = sceneAutomaticMaskTargets(analysis, controls, intensity, padding);
    const bitmap = await createImageBitmap(source);
    const { width, height } = bitmap; bitmap.close();
    if (width * height > 16_000_000) throw new Error('Source exceeds the 16 megapixel mask limit.');
    const { generateComfyUISceneMasks } = await import('./comfyUIService');
    const generated = await generateComfyUISceneMasks(source, checkpoint, targets, progress, stopped);
    const load = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Unable to retrieve the SAM3 mask.');
        return readSceneMask(new File([await response.blob()], 'sam3-mask.png', { type: 'image/png' }), source);
    };
    const bodies: Record<string, SceneMask> = {};
    const candidates: Record<string, SceneMask> = {};
    for (const result of generated) {
        if (stopped()) throw new DOMException('Mask calculation stopped.', 'AbortError');
        const [kind, id] = result.id.split(':');
        const subject = selected.find(item => item.id === id);
        if (kind === 'body') {
            bodies[id] = await load(result.raw);
            if (subject && !subject.faceOnly) candidates[id] = await load(result.expanded);
        } else candidates[id] = await load(result.raw);
    }
    if (Object.keys(bodies).length !== analysis.subjects.length || selected.some(subject => !candidates[subject.id])) throw new Error('SAM3 returned incomplete person masks.');
    const isolated = isolateAutomaticSceneMasks(bodies, candidates, selected.filter(item => item.faceOnly).map(item => item.id), poseArea, intensity);
    const masks: Record<string, SceneMask> = {};
    for (const [id, pixels] of Object.entries(isolated)) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image canvas unavailable.');
        const image = context.createImageData(width, height);
        pixels.forEach((value, index) => { const offset = index * 4; image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255; });
        context.putImageData(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to encode SAM3 mask.')), 'image/png'));
        masks[id] = await readSceneMask(new File([blob], `sam3-${id}.png`, { type: 'image/png' }), source);
    }
    validateSceneMasks(selected.map(item => item.id), masks);
    return masks;
};