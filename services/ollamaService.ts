export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'huihui_ai/qwen3-vl-abliterated:8b';

export type OllamaPromptMode = 'image' | 'background' | 'subject';

export interface OllamaConnectionResult {
    success: boolean;
    message: string;
    models: string[];
}

const normalizeOllamaUrl = (url: string): string => {
    const trimmed = (url || DEFAULT_OLLAMA_URL).trim().replace(/\/+$/, '');
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const cleanResponse = (text: string): string => text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(new Error('Could not read the source image.'));
    reader.readAsDataURL(file);
});

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

const chatWithOllama = async (url: string, model: string, content: string, image?: File, format?: object, temperature = 0.35): Promise<string> => {
    if (!model.trim()) throw new Error('Select an Ollama model.');
    const images = image ? [await fileToBase64(image)] : undefined;
    const response = await fetch(`${normalizeOllamaUrl(url)}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            think: false,
            ...(format ? { format } : {}),
            messages: [{ role: 'user', content, ...(images ? { images } : {}) }],
            options: {
                temperature,
                num_ctx: image ? 16384 : 8192,
                num_predict: image ? 1024 : 2048,
            },
        }),
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Ollama returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await response.json();
    const text = cleanResponse(data?.message?.content || data?.message?.thinking || '');
    if (!text) throw new Error('Ollama returned an empty response.');
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
    );
};

export const generateOllamaPromptSoup = async (
    fullPrompt: string,
    backgroundPrompt: string,
    subjectPrompt: string,
    modelType: string,
    creativity: number,
    url: string,
    model: string,
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

Return only valid JSON containing 2 to 8 short prompt_parts. Joined in order, their text must form the single final prompt, never the source material followed by a conclusion. Assign source 1, 2, or 3 only when a transformed segment is primarily inspired by that reference; assign source 0 to newly invented or inseparably fused material. Source attribution controls display color and does not permit copying.`, undefined, promptPartsSchema, 0.45 + creativity * 0.65);
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