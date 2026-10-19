import { generateGeminiTextResult } from './geminiService';
import { generateMammouthText } from './mammouthService';
import { generateOpenRouterText } from './openRouterService';
import { generateOllamaImagePrompt } from './ollamaService';
import { getImagePromptStyleInstruction } from '../utils/imagePromptStyle';
import { getImageDimensionsFromFile } from '../utils/imageUtils';

export const IMAGE_PROMPT_FORMATS = [
    { value: 'sd1.5', label: 'SD 1.5' },
    { value: 'sdxl', label: 'SDXL' },
    { value: 'z-image', label: 'Z-Image' },
    { value: 'qwen21-t2i', label: 'Qwen 2.1' },
    { value: 'moss-image', label: 'MOSS' },
] as const;
export type ImagePromptFormat = typeof IMAGE_PROMPT_FORMATS[number]['value'];
export type ImagePromptProvider = 'openrouter' | 'gemini' | 'mammouth' | 'ollama';
export interface ImagePromptRequest {
    image: File;
    format: ImagePromptFormat;
    provider: ImagePromptProvider;
    model: string;
    ollamaUrl?: string;
    signal?: AbortSignal;
}

export const buildImagePromptInstruction = (format: ImagePromptFormat): string => {
    const selected = IMAGE_PROMPT_FORMATS.find(entry => entry.value === format);
    if (!selected) throw new Error('Choose a supported image prompt format.');
    return `Analyze the supplied image faithfully and write a positive image-generation prompt for ${selected.label}.
Describe the visible subject, pose, clothing, environment, composition, lighting, colors, textures and visual style. Do not invent hidden details or identify real people.
${getImagePromptStyleInstruction(format)}
${format === 'qwen21-t2i' ? 'State spatial relationships precisely and reproduce legible visible text in quotation marks.' : 'Keep the description grounded in visible details.'}
Write in English. Return only the positive prompt, without a heading, explanation, Markdown fences, negative prompt or generation settings. Do not include sampler, steps, CFG, seed, model names, LoRA tags or SD weighting syntax.`;
};

export const generateImagePrompt = async (request: ImagePromptRequest): Promise<string> => {
    const { image, format, provider, model, signal } = request;
    const instruction = buildImagePromptInstruction(format);
    if (!['openrouter', 'gemini', 'mammouth', 'ollama'].includes(provider)) throw new Error('Choose a supported analysis service.');
    if (!image || !image.size || !image.type.startsWith('image/')) throw new Error('Choose a non-empty source image.');
    if (!model.trim()) throw new Error('Choose an analysis model.');
    signal?.throwIfAborted();
    try {
        await getImageDimensionsFromFile(image);
    } catch {
        throw new Error('Could not decode the source image. Choose a valid PNG, JPG or WEBP image.');
    }
    signal?.throwIfAborted();
    let result: string;
    switch (provider) {
        case 'openrouter':
            result = await generateOpenRouterText(instruction, [image], model.trim());
            break;
        case 'gemini':
            result = (await generateGeminiTextResult(instruction, [image], undefined, model.trim())).text;
            break;
        case 'mammouth':
            result = (await generateMammouthText(instruction, [image], model.trim())).text;
            break;
        case 'ollama':
            result = await generateOllamaImagePrompt(image, instruction, request.ollamaUrl || '', model.trim(), signal);
            break;
    }
    signal?.throwIfAborted();
    const prompt = result.trim().replace(/^```(?:text|plaintext)?\s*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
    if (!prompt) throw new Error('The analysis service returned an empty prompt. Try again or choose another vision model.');
    return prompt;
};
