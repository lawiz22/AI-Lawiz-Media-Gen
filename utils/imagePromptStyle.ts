import type { ComfyModelType } from '../types';

export const getImagePromptStyleInstruction = (modelType: ComfyModelType | 'gemini'): string => {
    switch (modelType) {
        case 'sd1.5':
        case 'face-detailer-sd1.5':
            return 'Your response MUST be a very simple, comma-separated list of keywords. Do not use sentences.';
        case 'flux':
        case 'nunchaku-flux-image':
        case 'flux-krea':
        case 'qwen-t2i-gguf':
        case 'qwen21-t2i':
        case 'qwen21-turbo':
        case 'moss-image':
        case 'z-image':
        case 'krea2-simple':
        case 'krea2-raw':
            return 'Your response MUST be a single, detailed, artistic, and descriptive paragraph. Use rich vocabulary.';
        case 'flux2-simple':
            return `Your response MUST follow this exact five-segment FLUX.2 [klein] structure, with one labeled line per segment:
Subject: identify the main subject precisely.
Setting: describe where the scene takes place and the spatial composition.
Details: specify concrete visual features, materials, clothing, textures, objects, and actions.
Lighting: explain the light sources, direction, quality, color, shadows, and reflections.
Atmosphere: describe the mood, emotional tone, weather, depth, and overall visual feeling.
Do not add any preamble, conclusion, markdown bullets, or extra sections.`;
        case 'gemini':
            return 'Write an exceptionally long and exhaustive narrative image description of approximately 600 to 900 words. Use flowing natural-language prose and complete sentences. Describe composition, subjects, identities, expressions, poses, clothing, materials, environment, foreground, background, spatial relationships, lighting, color, textures, camera perspective, lens behavior, atmosphere, mood, and every meaningful visible detail. Remain faithful to the source or supplied ideas, avoid repetition, and do not use headings, lists, preambles, or conclusions.';
        default:
            return 'Your response MUST be a single, concise, natural language sentence.';
    }
};
