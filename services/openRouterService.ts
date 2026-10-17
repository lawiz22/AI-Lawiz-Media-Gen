import { fileToResizedDataUrl, fileToDataUrl } from '../utils/imageUtils';

const API_BASE = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_MODEL = 'x-ai/grok-4.7';

export interface OpenRouterSettings {
    apiKey: string;
    model: string;
}

export interface OpenRouterModel {
    id: string;
    name: string;
    supportsImages: boolean;
    inputModalities?: string[];
}

export const getOpenRouterInputModalities = (model: OpenRouterModel): readonly string[] =>
    model.inputModalities ?? (model.supportsImages ? ['text', 'image'] : ['text']);

export const filterOpenRouterModels = (
    models: readonly OpenRouterModel[], requiredInputs: readonly string[] = [], query = '',
): OpenRouterModel[] => {
    const search = query.trim().toLowerCase();
    return models.filter(model => {
        const inputs = getOpenRouterInputModalities(model);
        return requiredInputs.every(kind => inputs.includes(kind))
            && (!search || `${model.name} ${model.id} ${inputs.join(' ')}`.toLowerCase().includes(search));
    });
};

let settings: OpenRouterSettings = { apiKey: '', model: DEFAULT_OPENROUTER_MODEL };
export const updateOpenRouterSettings = (next: OpenRouterSettings) => {
    settings = { apiKey: next.apiKey.trim(), model: next.model.trim() || DEFAULT_OPENROUTER_MODEL };
};
export const getOpenRouterSettings = (): OpenRouterSettings => ({ ...settings });

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const messageFrom = (payload: unknown): string | undefined => {
    if (!record(payload)) return;
    if (record(payload.error) && typeof payload.error.message === 'string') return payload.error.message;
    if (typeof payload.message === 'string') return payload.message;
};

const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(120000) });
    const text = await response.text();
    let payload: unknown;
    try {
        payload = JSON.parse(text);
    } catch {
        throw new Error(`OpenRouter returned a non-JSON response (${response.status}).`);
    }
    if (!response.ok || (record(payload) && payload.error)) {
        throw new Error(`OpenRouter request failed (${response.status}): ${messageFrom(payload) || response.statusText}`);
    }
    return payload;
};

const headers = (key: string): Record<string, string> => {
    if (!key.trim()) throw new Error('OpenRouter API key is not configured. Add it in Connection Settings.');
    return {
        Authorization: `Bearer ${key.trim()}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Title': "LAWIZ'S Media Generator",
    };
};

export const getOpenRouterModels = async (signal?: AbortSignal): Promise<OpenRouterModel[]> => {
    const payload = await request('/models', { signal });
    if (!record(payload) || !Array.isArray(payload.data)) throw new Error('OpenRouter returned an invalid model catalog.');
    const models: OpenRouterModel[] = [];
    for (const item of payload.data) {
        if (!record(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !record(item.architecture)) continue;
        const inputs = item.architecture.input_modalities;
        const outputs = item.architecture.output_modalities;
        if (!Array.isArray(inputs) || !inputs.includes('text') || !Array.isArray(outputs) || !outputs.includes('text')) continue;
        models.push({ id: item.id, name: item.name, supportsImages: inputs.includes('image'), inputModalities: inputs.filter((value): value is string => typeof value === 'string') });
    }
    if (!models.length) throw new Error('OpenRouter did not return any compatible text models.');
    return models.sort((a, b) => a.name.localeCompare(b.name));
};

export const testOpenRouterConnection = async (apiKey: string, model: string, signal?: AbortSignal): Promise<{ success: boolean; message: string; models?: OpenRouterModel[] }> => {
    try {
        const payload = await request('/key', { headers: headers(apiKey), signal });
        if (!record(payload) || !record(payload.data)) throw new Error('OpenRouter returned an invalid key verification response.');
        const models = await getOpenRouterModels(signal);
        const selected = models.find(item => item.id === model);
        if (!selected) throw new Error(`Model "${model}" is not available in the OpenRouter catalog.`);
        return {
            success: true,
            message: `API key verified. ${selected.name} supports ${selected.supportsImages ? 'text and image analysis' : 'text only (Magic Soup); choose a vision model for image analysis'}. No paid generation was performed; generation still requires sufficient credits and model access.`,
            models,
        };
    } catch (cause) {
        return { success: false, message: cause instanceof Error ? cause.message : String(cause) };
    }
};

export const generateOpenRouterText = async (instruction: string, inputs: File[] = [], modelOverride?: string): Promise<string> => {
    const { apiKey, model: defaultModel } = getOpenRouterSettings();
    const model = modelOverride?.trim() || defaultModel;
    const auth = headers(apiKey);
    if (!instruction.trim()) throw new Error('An instruction is required for OpenRouter.');
    const models = await getOpenRouterModels();
    const selected = models.find(item => item.id === model);
    if (!selected) throw new Error(`OpenRouter model "${model}" is unavailable. Select another available model.`);
    const requestContent: Array<Record<string, unknown>> = [{ type: 'text', text: instruction }];
    for (const file of inputs) {
        const modality = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : '';
        if (!modality) throw new Error(`Unsupported reference type: ${file.type}.`);
        if (!getOpenRouterInputModalities(selected).includes(modality)) {
            throw new Error(`OpenRouter model "${model}" does not support ${modality === 'image' ? 'images' : modality} references. Choose a compatible model.`);
        }
        if (modality === 'image') requestContent.push({ type: 'image_url', image_url: { url: await fileToResizedDataUrl(file, 1536) } });
        else if (modality === 'video') requestContent.push({ type: 'video_url', video_url: { url: await fileToDataUrl(file) } });
        else {
            const format = file.type === 'audio/wav' || file.type === 'audio/x-wav' ? 'wav' : file.type === 'audio/mpeg' ? 'mp3' : '';
            if (!format) throw new Error('OpenRouter audio references must be WAV or MP3. Convert this audio or use Gemini.');
            requestContent.push({ type: 'input_audio', input_audio: { data: (await fileToDataUrl(file)).split(',')[1], format } });
        }
    }
    const payload = await request('/chat/completions', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
            model,
            stream: false,
            max_tokens: 8192,
            messages: [{
                role: 'user',
                content: requestContent,
            }],
        }),
    });
    if (!record(payload) || !Array.isArray(payload.choices) || !record(payload.choices[0])) throw new Error('OpenRouter returned no completion.');
    const choice = payload.choices[0];
    if (choice.finish_reason === 'length') throw new Error('OpenRouter truncated the response at the token limit. No partial prompt was accepted.');
    if (choice.finish_reason === 'content_filter') throw new Error('OpenRouter blocked this request through its content filter.');
    if (!record(choice.message)) throw new Error('OpenRouter returned no assistant message.');
    const content = choice.message.content;
    const text = typeof content === 'string' ? content.trim() : Array.isArray(content)
        ? content.filter(record).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n').trim()
        : '';
    if (!text) throw new Error('OpenRouter returned an empty prompt.');
    return text;
};
