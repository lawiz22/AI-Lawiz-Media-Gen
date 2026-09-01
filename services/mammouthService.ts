import type { GenerationOptions } from '../types';
import { fileToDataUrl } from '../utils/imageUtils';
import { buildPromptSegments, decodePose, getRandomPose } from '../utils/promptBuilder';

const MAMMOUTH_API_BASE = 'https://api.mammouth.ai/v1';
const MAMMOUTH_PUBLIC_MODELS_URL = 'https://api.mammouth.ai/public/models';

export const DEFAULT_MAMMOUTH_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const MAMMOUTH_IMAGE_MODELS = [
    DEFAULT_MAMMOUTH_IMAGE_MODEL,
    'gpt-image-2',
    'gemini-3.1-flash-lite-image',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
];

let currentApiKey = '';

export interface MammouthUsage {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
}

export const updateMammouthApiKey = (key: string) => {
    currentApiKey = key.trim();
};

export const getMammouthApiKey = () => currentApiKey;

const getHeaders = () => {
    if (!currentApiKey) {
        throw new Error('Mammouth API key is not configured. Add it in Connection Settings.');
    }
    return {
        Authorization: `Bearer ${currentApiKey}`,
        'Content-Type': 'application/json',
    };
};

const readError = async (response: Response) => {
    const text = await response.text();
    try {
        const payload = JSON.parse(text);
        return payload.error?.message || payload.message || text;
    } catch {
        return text || response.statusText;
    }
};

export const testMammouthConnection = async (key: string): Promise<{ success: boolean; message: string }> => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return { success: false, message: 'Enter a Mammouth API key.' };

    try {
        const response = await fetch(`${MAMMOUTH_API_BASE}/models`, {
            headers: { Authorization: `Bearer ${trimmedKey}` },
        });
        if (!response.ok) {
            return { success: false, message: `Connection failed (${response.status}): ${await readError(response)}` };
        }
        return { success: true, message: 'Connection successful.' };
    } catch (error: any) {
        return { success: false, message: error?.message || 'Unable to reach Mammouth API.' };
    }
};

export const getMammouthImageModels = async (): Promise<string[]> => {
    try {
        const response = await fetch(MAMMOUTH_PUBLIC_MODELS_URL);
        if (!response.ok) throw new Error(`Model list failed (${response.status}).`);
        const payload = await response.json();
        const remoteModels = (payload.data || [])
            .map((model: any) => String(model.id || ''))
            .filter((id: string) => id.includes('image'));
        return Array.from(new Set([...MAMMOUTH_IMAGE_MODELS, ...remoteModels])).sort();
    } catch (error) {
        console.warn('Unable to refresh Mammouth image models:', error);
        return [...MAMMOUTH_IMAGE_MODELS].sort();
    }
};

const toUsageMetadata = (usage: any): MammouthUsage | undefined => {
    if (!usage) return undefined;
    return {
        promptTokenCount: usage.prompt_tokens || 0,
        candidatesTokenCount: usage.completion_tokens || 0,
        totalTokenCount: usage.total_tokens || 0,
    };
};

const collectImageSources = (payload: any): string[] => {
    const sources = new Set<string>();
    const addSource = (value: unknown, mimeType = 'image/png') => {
        if (typeof value !== 'string' || !value) return;
        if (value.startsWith('data:image/') || /^https?:\/\//i.test(value)) {
            sources.add(value);
        } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100) {
            sources.add(`data:${mimeType};base64,${value.replace(/\s/g, '')}`);
        }
    };

    const inspect = (value: any) => {
        if (!value) return;
        if (typeof value === 'string') {
            const markdownImages = value.matchAll(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/gi);
            for (const match of markdownImages) addSource(match[1]);
            const embeddedSources = value.matchAll(/(data:image\/[^\s"'<>]+|https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?)/gi);
            for (const match of embeddedSources) addSource(match[1]);
            addSource(value.trim());
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(inspect);
            return;
        }
        addSource(value.url);
        addSource(value.b64_json || value.base64 || value.data, value.mime_type || value.mimeType);
        addSource(value.image_url?.url || value.image_url);
        addSource(value.image?.url || value.image);
        inspect(value.output);
        inspect(value.result);
        inspect(value.response);
        inspect(value.attachments);
        inspect(value.content);
        inspect(value.images);
        inspect(value.data);
    };

    inspect(payload?.choices?.map((choice: any) => choice.message));
    inspect(payload?.choices?.map((choice: any) => choice.delta));
    inspect(payload?.output);
    inspect(payload?.result);
    inspect(payload?.response);
    inspect(payload?.data);
    inspect(payload?.images);
    return Array.from(sources);
};

const createPrompt = (options: GenerationOptions, poseIndex: number) => {
    if (options.geminiMode === 't2i') return options.geminiPrompt?.trim() || '';
    if (options.geminiI2iMode === 'inpaint') {
        if (options.geminiInpaintTask === 'remove') return 'Remove the masked area and preserve everything else.';
        if (options.geminiInpaintTask === 'replace') return `Replace the masked area with: ${options.geminiInpaintTargetPrompt}`;
        if (options.geminiInpaintTask === 'changeColor') return `Change only the masked object color to: ${options.geminiInpaintTargetPrompt}`;
        return options.geminiInpaintCustomPrompt || 'Edit only the masked area.';
    }
    if (options.geminiI2iMode === 'compose') return options.geminiComposePrompt || 'Compose these images together.';
    if (options.geminiI2iMode === 'character') {
        let pose = 'Use the pose from the reference image.';
        if (options.poseMode === 'random') pose = decodePose(getRandomPose());
        if ((options.poseMode === 'select' || options.poseMode === 'prompt') && options.poseSelection.length > 0) {
            pose = options.poseSelection[poseIndex % options.poseSelection.length];
            if (options.poseMode === 'select') pose = decodePose(pose);
        }
        return buildPromptSegments(options, pose, false).join(' ');
    }
    return options.geminiGeneralEditPrompt || 'Edit the image according to the instructions.';
};

const makeImageContent = async (prompt: string, inputs: (File | string)[]) => {
    const content: any[] = [{ type: 'text', text: prompt }];
    for (const input of inputs) {
        const url = typeof input === 'string' ? input : await fileToDataUrl(input);
        content.push({ type: 'image_url', image_url: { url } });
    }
    return content;
};

export const generateMammouthImage = async (
    prompt: string,
    inputs: (File | string)[] = [],
    aspectRatio = '1:1',
    model = DEFAULT_MAMMOUTH_IMAGE_MODEL,
): Promise<{ images: string[]; usageMetadata?: MammouthUsage }> => {
    const content = inputs.length > 0
        ? await makeImageContent(`${prompt} --ar ${aspectRatio}`, inputs)
        : `${prompt} --ar ${aspectRatio}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(`${MAMMOUTH_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
        });
        if (!response.ok) {
            throw new Error(`Mammouth API error (${response.status}): ${await readError(response)}`);
        }
        const payload = await response.json();
        const images = collectImageSources(payload);
        if (images.length > 0) {
            return { images, usageMetadata: toUsageMetadata(payload.usage) };
        }
        if (attempt === 0) console.warn(`Mammouth returned an empty image response for ${model}; retrying once.`);
    }
    throw new Error(`Mammouth returned no readable image after two attempts with ${model}. Please retry; the provider may be temporarily unavailable.`);
};

export const generateMammouthText = async (
    prompt: string,
    inputs: (File | string)[] = [],
    model = 'gemini-2.5-flash',
): Promise<{ text: string; usageMetadata?: MammouthUsage }> => {
    const content = inputs.length > 0 ? await makeImageContent(prompt, inputs) : prompt;
    const response = await fetch(`${MAMMOUTH_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
    });
    if (!response.ok) {
        throw new Error(`Mammouth API error (${response.status}): ${await readError(response)}`);
    }
    const payload = await response.json();
    const rawContent = payload?.choices?.[0]?.message?.content;
    const text = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
            ? rawContent.map((part: any) => part.text || '').join('')
            : '';
    if (!text.trim()) throw new Error('Mammouth returned no text response.');
    return { text: text.trim(), usageMetadata: toUsageMetadata(payload.usage) };
};

export const generateMammouthImages = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
    clothingImage: File | null,
    backgroundImage: File | null,
    maskImage: File | null,
    elementImages: File[],
): Promise<{ images: { src: string; usageMetadata?: MammouthUsage }[]; finalPrompt: string }> => {
    const model = options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL;
    const count = Math.min(Math.max(options.numImages || 1, 1), 4);
    const images: { src: string; usageMetadata?: MammouthUsage }[] = [];
    let finalPrompt = '';

    for (let index = 0; index < count; index++) {
        const prompt = createPrompt(options, index);
        if (!prompt) throw new Error('A prompt is required for Mammouth image generation.');
        if (options.geminiMode === 'i2i' && !sourceImage) throw new Error('A source image is required for Mammouth image editing.');
        finalPrompt ||= prompt;

        const files = [sourceImage, maskImage, clothingImage, backgroundImage, ...elementImages].filter((file): file is File => !!file);
        updateProgress(`Mammouth: generating image ${index + 1} of ${count} with ${model}...`, 0.25 + (index / count) * 0.65);
        const result = await generateMammouthImage(prompt, files, options.aspectRatio, model);
        images.push(...result.images.map(src => ({ src, usageMetadata: result.usageMetadata })));
    }

    return { images, finalPrompt };
};
