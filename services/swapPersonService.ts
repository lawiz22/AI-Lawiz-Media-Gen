import { createSceneControls, generateAutomaticSceneMasks, type SceneAnalysis, type SceneMask, type SceneProvider } from './sceneVariationService';

export interface SwapPersonAnalysis {
    style: string;
    uncertainty: string;
    people: Array<{ id: string; description: string; samDescription: string }>;
}

const text = { type: 'string', maxLength: 1200 };
const analysisSchema = {
    type: 'object', additionalProperties: false, required: ['style', 'uncertainty', 'people'],
    properties: {
        style: text, uncertainty: text,
        people: { type: 'array', maxItems: 12, items: {
            type: 'object', additionalProperties: false, required: ['id', 'description', 'samDescription'],
            properties: { id: { type: 'string' }, description: text, samDescription: text },
        } },
    },
};

export const parseSwapPersonAnalysis = (response: string): SwapPersonAnalysis => {
    const raw = JSON.parse(response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const validText = (value: unknown, empty = false): value is string => typeof value === 'string' && value.length <= 1200 && (empty || !!value.trim());
    if (!raw || !validText(raw.style) || !validText(raw.uncertainty, true) || !Array.isArray(raw.people) || raw.people.length > 12) throw new Error('Invalid person analysis. Analyze the image again.');
    const ids = new Set<string>();
    const people = raw.people.map((person: any) => {
        if (!person || typeof person.id !== 'string' || !/^person-[1-9]\d*$/.test(person.id) || ids.has(person.id)
            || !validText(person.description) || person.description.length > 300 || !validText(person.samDescription) || person.samDescription.length > 400) throw new Error('Invalid or duplicate person in analysis.');
        ids.add(person.id);
        return { id: person.id, description: person.description.trim(), samDescription: person.samDescription.trim() };
    });
    return { style: raw.style.trim(), uncertainty: raw.uncertainty.trim(), people };
};

export const analyzeSwapPersonImage = async (
    image: File, provider: SceneProvider, ollama: { url: string; model: string }, signal: AbortSignal,
    usage: (value: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number }) => void,
): Promise<SwapPersonAnalysis> => {
    const instruction = `Analyze this image for a person replacement tool. Return only JSON matching ${JSON.stringify(analysisSchema)}.
Identify every individually distinguishable real person with unique person-1, person-2 IDs. Do not count reflections, posters, photographs, mannequins or decorations as extra people. Return people=[] if nobody can be identified reliably. If a crowd cannot be separated, report uncertainty; do not invent a precise inventory.
description: a short spatial description for a human to choose this person, such as 'left foreground beside the chair'. samDescription: a separate English noun phrase starting with 'person', with 2-3 visible hair/clothing cues and position for SAM3 to isolate ONE whole visible person. No comma-separated lists, negative clauses, other people or editing requests. Never infer names, gender identity, ethnicity, religion or other sensitive traits; selection uses position and visible clothing, not inferred gender.
style: describe only the observed capture medium and rendering, resolution, softness, grain, noise, compression, chroma bleed, motion blur, interlacing, color cast and lighting. Mention VHS only if supported by visible evidence; illustration stays illustration. Do not invent or beautify details. uncertainty: state limitations, occlusions, ambiguous people or uncertain capture properties. Do not propose a new style, scene, pose or clothing.`;
    let response: { text: string; usageMetadata?: any };
    if (provider === 'ollama') {
        const { analyzeStructuredImageWithOllama } = await import('./ollamaService');
        response = { text: await analyzeStructuredImageWithOllama(image, instruction, analysisSchema, ollama.url, ollama.model, signal) };
    } else if (provider === 'gemini') {
        const { generateGeminiTextResult } = await import('./geminiService');
        response = await generateGeminiTextResult(instruction, [image]);
    } else {
        const { generateMammouthText } = await import('./mammouthService');
        response = await generateMammouthText(instruction, [image]);
    }
    if (response.usageMetadata) usage(response.usageMetadata);
    if (signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
    return parseSwapPersonAnalysis(response.text);
};

export type SwapPersonPartPrompts = Record<'hair' | 'face' | 'clothing', string>;

export const defaultSwapPersonPartPrompts = (analysis: SwapPersonAnalysis, personId: string): SwapPersonPartPrompts => {
    const person = analysis.people.find(item => item.id === personId);
    if (!person) throw new Error('Select a person before calculating the mask.');
    const position = analysis.people.length > 1 ? ` of the person ${person.description}` : '';
    return { hair: `hair${position}`, face: `face${position}`, clothing: `clothing${position}` };
};

export const calculateSwapPersonMask = async (
    image: File, analysis: SwapPersonAnalysis, personId: string, checkpoint: string, padding: number, expand: boolean,
    progress: (message: string, value: number) => void, stopped: () => boolean,
    region: 'body' | 'head' | 'face' = 'body',
    partPrompts?: SwapPersonPartPrompts,
): Promise<SceneMask> => {
    if (!analysis.people.some(person => person.id === personId)) throw new Error('Select a person before calculating the mask.');
    const overrides: Record<string, string> = {};
    if (region !== 'body') {
        const prompts = partPrompts ?? defaultSwapPersonPartPrompts(analysis, personId);
        for (const part of region === 'head' ? ['hair', 'face', 'clothing'] as const : ['face', 'clothing'] as const) {
            const prompt = prompts[part];
            if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 400) throw new Error(`Enter a ${part} SAM prompt (1-400 characters).`);
            overrides[`${part}:${personId}`] = prompt.trim();
        }
    }
    const scene: SceneAnalysis = {
        environment: 'unknown', location: 'Source image', anchors: ['Source image'], style: analysis.style,
        lighting: 'Source lighting', camera: 'Source camera', season: 'Unknown', uncertainty: analysis.uncertainty,
        lightingChoices: [], cameraChoices: [], seasonChoices: [],
        subjects: analysis.people.map(person => ({ ...person, faceVisible: false, pose: 'Source pose', expression: 'Source expression',
            poses: [{ label: 'Person replacement region', instruction: 'Keep the source pose.', intensity: 'subtle' }], expressions: [] })),
    };
    const controls = createSceneControls(scene);
    controls.pose.enabled = true;
    for (const person of scene.subjects) controls[`pose:${person.id}`].enabled = person.id === personId;
    const masks = await generateAutomaticSceneMasks(image, scene, controls, 'subtle', checkpoint, padding, progress, stopped, expand && region === 'body' ? 'movement' : 'silhouette', region, overrides);
    return masks[personId];
};