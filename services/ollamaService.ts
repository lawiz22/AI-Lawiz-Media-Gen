export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'huihui_ai/qwen3-vl-abliterated:8b';

export type OllamaPromptMode = 'image' | 'background' | 'subject';

export interface OllamaConnectionResult {
    success: boolean;
    message: string;
    models: string[];
}

export interface OllamaActivity {
    phase: 'loading' | 'thinking' | 'responding' | 'complete' | 'cancelled' | 'failed';
    thinking: string;
    response: string;
    promptTokens?: number;
    responseTokens?: number;
    tokensPerSecond?: number;
}

export type OllamaActivityCallback = (activity: OllamaActivity) => void;

const normalizeOllamaUrl = (url: string): string => {
    const trimmed = (url || DEFAULT_OLLAMA_URL).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const cleanResponse = (text: string): string => text
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const recoverStructuredResponse = (text: string): string => {
    const candidate = text
        .trim()
        .replace(/^<think>\s*/i, '')
        .replace(/\s*<\/think>$/i, '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    if (!candidate) return '';
    try {
        JSON.parse(candidate);
        return candidate;
    } catch {
        return '';
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(new Error('Could not read the source image.'));
    reader.readAsDataURL(blob);
});

const fileToOllamaImage = async (file: File): Promise<string> => {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error(`The source image '${file.name}' could not be decoded. Convert it to PNG or JPEG and try again.`);
    }

    try {
        if (!bitmap.width || !bitmap.height) throw new Error('Invalid image dimensions.');
        const maxDimension = 2048;
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not prepare the source image.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const jpeg = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the source image.')), 'image/jpeg', 0.92);
        });
        return blobToBase64(jpeg);
    } finally {
        bitmap.close();
    }
};

export const testOllamaConnection = async (url: string): Promise<OllamaConnectionResult> => {
    try {
        const response = await fetch(`${normalizeOllamaUrl(url)}/api/tags`, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const models = Array.isArray(data?.models)
            ? data.models.map((model: any) => model?.name).filter((name: unknown): name is string => typeof name === 'string')
            : [];
        return { success: true, message: `Connected. ${models.length} model${models.length === 1 ? '' : 's'} available.`, models };
    } catch (error: any) {
        return {
            success: false,
            message: `Could not connect to Ollama at ${normalizeOllamaUrl(url)}. ${error?.message || ''}`.trim(),
            models: [],
        };
    }
};

const chatWithOllama = async (url: string, model: string, content: string, image?: File, format?: object, temperature = 0.35, onActivity?: OllamaActivityCallback, signal?: AbortSignal): Promise<string> => {
    if (!model.trim()) throw new Error('Select an Ollama model.');
    onActivity?.({ phase: 'loading', thinking: '', response: '' });
    let images: string[] | undefined;
    try {
        images = image ? [await fileToOllamaImage(image)] : undefined;
    } catch (error) {
        onActivity?.({ phase: 'failed', thinking: '', response: '' });
        throw error;
    }
    const directAnswerInstruction = format
        ? 'Return only the requested valid JSON. Do not explain your reasoning and never output <think> tags.'
        : 'Return only the final image-generation prompt. Do not explain your reasoning and never output <think> tags.';
    const userContent = /qwen3/i.test(model) ? `${content}\n/no_think` : content;
    const response = await fetch(`${normalizeOllamaUrl(url)}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: true,
            think: false,
            ...(format ? { format } : {}),
            messages: [
                { role: 'system', content: directAnswerInstruction },
                { role: 'user', content: userContent, ...(images ? { images } : {}) },
            ],
            options: {
                temperature,
                num_ctx: image ? 16384 : 8192,
                num_predict: image ? 2048 : 2048,
            },
        }),
    });
    if (!response.ok) {
        const detail = await response.text();
        onActivity?.({ phase: 'failed', thinking: '', response: '' });
        if (response.status === 400 && /failed to load image|does not support images/i.test(detail)) {
            throw new Error(`Ollama could not process the image with '${model}'. Select an installed vision model (for example Qwen VL, Gemma 3, or LLaVA) and try again.`);
        }
        throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    if (!response.body) throw new Error('Ollama did not return a response stream.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let thinking = '';
    let responseText = '';
    let doneReason = '';
    let finalActivity: OllamaActivity = { phase: 'loading', thinking: '', response: '' };

    const processLine = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        doneReason = data?.done_reason || doneReason;
        thinking += data?.message?.thinking || '';
        responseText += data?.message?.content || '';
        const evalDuration = Number(data?.eval_duration || 0);
        const responseTokens = Number(data?.eval_count || 0) || undefined;
        finalActivity = {
            phase: data?.done ? 'complete' : responseText ? 'responding' : thinking ? 'thinking' : 'loading',
            thinking,
            response: responseText,
            promptTokens: Number(data?.prompt_eval_count || 0) || undefined,
            responseTokens,
            tokensPerSecond: data?.done && responseTokens && evalDuration
                ? responseTokens / (evalDuration / 1_000_000_000)
                : undefined,
        };
        onActivity?.(finalActivity);
    };

    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(processLine);
        if (done) break;
    }
    processLine(buffer);
    const text = cleanResponse(responseText) || (format ? recoverStructuredResponse(thinking) : '');
    if (!responseText && text) {
        finalActivity = { ...finalActivity, phase: 'complete', response: text };
        onActivity?.(finalActivity);
    }
    if (!text && doneReason === 'length') {
        onActivity?.({ ...finalActivity, phase: 'failed' });
        throw new Error('Ollama used the entire output limit for reasoning without producing a final prompt. Try again or choose a less reasoning-heavy model.');
    }
    if (!text) {
        onActivity?.({ ...finalActivity, phase: 'failed' });
        throw new Error('Ollama returned no final prompt. Try again or choose another model.');
    }
    return text;
};

const getStyleInstruction = (modelType: string): string => {
    if (modelType === 'sd1.5') return 'Return only a simple comma-separated keyword list.';
    if (modelType === 'gemini') return 'Return one exhaustive natural-language image description with rich visual detail.';
    if (modelType === 'flux2-simple') return 'Return exactly five labeled lines: Subject, Setting, Details, Lighting, Atmosphere.';
    if (modelType === 'flux') return 'Return one detailed artistic and descriptive paragraph.';
    return 'Return one concise natural-language sentence.';
};

export const generateOllamaPromptFromImage = async (
    sourceImage: File,
    mode: OllamaPromptMode,
    modelType: string,
    url: string,
    model: string,
    onActivity?: OllamaActivityCallback,
    signal?: AbortSignal,
): Promise<string> => {
    const focus = mode === 'background'
        ? 'Analyze only the background and environment. Completely ignore people, animals, foreground objects, clothing, faces, and poses.'
        : mode === 'subject'
            ? 'Analyze only the main person, animal, or object. Completely ignore the background and environment.'
            : 'Analyze the complete image faithfully.';
    return chatWithOllama(
        url,
        model,
        `${focus} Write the result as a production-ready image-generation prompt. ${getStyleInstruction(modelType)} Start directly with the prompt, without commentary or quotation marks.`,
        sourceImage,
        undefined,
        0.35,
        onActivity,
        signal,
    );
};

export const identifyClothingWithOllama = async (
    sourceImage: File,
    url: string,
    model: string,
    onActivity?: OllamaActivityCallback,
    signal?: AbortSignal,
): Promise<Array<{ itemName: string; description: string }>> => {
    const schema = {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                itemName: { type: 'string' },
                description: { type: 'string' },
            },
            required: ['itemName', 'description'],
        },
    };
    const text = await chatWithOllama(
        url,
        model,
        'Create an exhaustive head-to-toe inventory of every separately removable wardrobe item visible in the image. Include main garments and layers, footwear (a matching pair is one item), belts, hats, gloves, scarves, bags, jewelry such as necklaces, earrings and bracelets, watches, eyewear, and hair accessories. A jumpsuit or dress is one garment, but do not stop after finding it: inspect the head, neck, ears, wrists, waist, hands, and feet for accessories. Include partially occluded items when they are identifiable. Never merge an accessory into a garment. Exclude the person, hair, body, and background. Return one array entry per item with a short itemName and a detailed description of color, material, pattern, construction, shape, and distinctive details.',
        sourceImage,
        schema,
        0.2,
        onActivity,
        signal,
    );
    const items = JSON.parse(text);
    if (!Array.isArray(items)) throw new Error('Ollama returned an invalid clothing list.');
    return items;
};

export const identifyObjectsWithOllama = async (
    sourceImage: File,
    maxObjects: number,
    hints: string,
    url: string,
    model: string,
    onActivity?: OllamaActivityCallback,
    signal?: AbortSignal,
): Promise<Array<{ name: string; description: string }>> => {
    const schema = {
        type: 'array',
        maxItems: maxObjects,
        items: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
            },
            required: ['name', 'description'],
        },
    };
    const focus = hints.trim() ? ` Prioritize objects matching this focus: ${hints.trim()}.` : '';
    const text = await chatWithOllama(
        url,
        model,
        `Identify up to ${maxObjects} distinct, physically separate objects visible in this image.${focus} Inspect the entire frame, including foreground, background, surfaces, hands, and partially occluded areas. Rank objects by visual importance and relevance to the requested focus. Do not include people, body parts, clothing, footwear, jewelry, or the background itself. Never merge separate objects into one entry. Return one array entry per object with a concise name and a detailed description of its color, material, shape, construction, condition, markings, and distinctive features.`,
        sourceImage,
        schema,
        0.2,
        onActivity,
        signal,
    );
    const objects = JSON.parse(text);
    if (!Array.isArray(objects)) throw new Error('Ollama returned an invalid object list.');
    return objects.slice(0, maxObjects);
};

export const generateOllamaPromptSoup = async (
    fullPrompt: string,
    backgroundPrompt: string,
    subjectPrompt: string,
    modelType: string,
    creativity: number,
    url: string,
    model: string,
    onActivity?: OllamaActivityCallback,
    signal?: AbortSignal,
): Promise<Array<{ text: string; source: number }>> => {
    const promptPartsSchema = {
        type: 'object',
        properties: {
            prompt_parts: {
                type: 'array',
                minItems: 2,
                maxItems: 8,
                items: {
                    type: 'object',
                    properties: {
                        text: { type: 'string' },
                        source: { type: 'integer', minimum: 0, maximum: 3 },
                    },
                    required: ['text', 'source'],
                },
            },
        },
        required: ['prompt_parts'],
    };
    const creativeDirection = creativity >= 0.8
        ? 'Radically reinterpret the ingredients. Invent an unexpected story, action, composition, visual metaphor, and interaction between subject and environment. Preserve only a few recognizable anchors from each source.'
        : creativity >= 0.5
            ? 'Transform and recombine the ingredients into a fresh scene with a new action, composition, atmosphere, and visual logic.'
            : 'Create a coherent new scene that stays recognizable but still integrates the ingredients rather than listing them.';
    const text = await chatWithOllama(url, model, `You are an inventive art director creating one original image concept from three reference descriptions.

CREATIVE INTENSITY: ${creativity} / 1. ${creativeDirection}

NON-NEGOTIABLE RULES:
- Produce only ONE unified final image prompt. It must read as if conceived from scratch.
- Never quote, summarize, restate, enumerate, or append the source descriptions.
- Never write "combine", "blend", "featuring elements of", "the background is", or instructions to another model.
- Do not make one paragraph per source. Every output segment must already fuse or transform ideas.
- Resolve contradictions creatively. Convert graphic/textual motifs into props, architecture, lighting, action, or composition when useful.
- Add meaningful new creative decisions proportional to the intensity: narrative event, pose/action, camera viewpoint, lighting, atmosphere, and surprising relationships.
- Keep only details that support the new concept. Omit source trivia, prices, issue numbers, and incidental text unless transformed into an intentional visual device.

REFERENCE 1 — OVERALL IMAGE:
${fullPrompt || '(none)'}

REFERENCE 2 — ENVIRONMENT:
${backgroundPrompt || '(none)'}

REFERENCE 3 — SUBJECT:
${subjectPrompt || '(none)'}

FINAL OUTPUT STYLE:
${getStyleInstruction(modelType)}

Return only valid JSON containing 2 to 8 short prompt_parts. Joined in order, their text must form the single final prompt, never the source material followed by a conclusion. Assign source 1, 2, or 3 only when a transformed segment is primarily inspired by that reference; assign source 0 to newly invented or inseparably fused material. Source attribution controls display color and does not permit copying.`, undefined, promptPartsSchema, 0.45 + creativity * 0.65, onActivity, signal);
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed?.prompt_parts)) throw new Error('Missing prompt_parts');
        return parsed.prompt_parts
            .filter((part: any) => typeof part?.text === 'string' && typeof part?.source === 'number')
            .map((part: { text: string; source: number }) => ({
                ...part,
                text: part.text.replace(/^\s*\d+[.)]\s*/, '').trim(),
            }))
            .filter((part: { text: string }) => Boolean(part.text));
    } catch {
        throw new Error('Ollama returned an invalid response for Magic Soup. Try again or choose another model.');
    }
};