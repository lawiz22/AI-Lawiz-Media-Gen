import type { GenerationOptions } from '../types';
import { appendGalleryStylePrompt, normalizeStyleModel, validateStyleGallery, type GalleryStyle } from './styleGallery';

export const KREA_SIMPLE_DEFAULT_LORAS = [
    { name: '', strength: 1 },
    { name: 'KREA\\snofs_krea_v1_nostrip.safetensors', strength: 1 },
];

export const krea2StyleLoraRemovals = (options: GenerationOptions, loras: string[]): Partial<GenerationOptions> => {
    const normalize = (name: string) => name.trim().replace(/\\/g, '/').toLowerCase();
    const managed = new Set(loras.filter(Boolean).map(normalize));
    const patch: Partial<GenerationOptions> = {};
    for (let index = 1; index <= 6; index++) {
        const key = `comfyKreaLora${index}Name` as keyof GenerationOptions;
        const name = options[key] ?? KREA_SIMPLE_DEFAULT_LORAS[index - 1]?.name;
        if (typeof name === 'string' && managed.has(normalize(name))) Object.assign(patch, { [key]: '' });
    }
    return patch;
};

export const krea2StyleOptions = (options: GenerationOptions, style?: GalleryStyle): GenerationOptions => {
    if (!style) return options;
    validateStyleGallery({ version: 1, styles: [style] });
    if (normalizeStyleModel(style.model) !== 'KREA2') throw new Error('Choose a KREA2 style; FLUX2 and KREA2 LoRAs are not interchangeable.');
    if (options.comfyKreaStyleStrength !== undefined && !Number.isFinite(options.comfyKreaStyleStrength)) throw new Error('Style LoRA strength must be finite.');
    return {
        ...options,
        ...krea2StyleLoraRemovals(options, [style.lora]),
        comfyKreaPrompt: appendGalleryStylePrompt(options.comfyKreaPrompt || '', style),
        ...(options.comfyKreaUseStyleSettings ? {
            ...(style.settings.steps !== undefined ? { comfySteps: style.settings.steps } : {}),
            ...(style.settings.cfg !== undefined ? { comfyCfg: style.settings.cfg } : {}),
            ...(style.settings.sampler !== undefined ? { comfySampler: style.settings.sampler } : {}),
            ...(style.settings.scheduler !== undefined ? { comfyScheduler: style.settings.scheduler } : {}),
        } : {}),
    };
};
