import type { H3Workflow } from './minimaxH3Workflow';

export interface GalleryStyle {
    id: string;
    model: string;
    title: string;
    prompt: string;
    trigger: string;
    lora: string;
    strength: number;
    notes: string;
    settings: { steps?: number; cfg?: number; sampler?: string; scheduler?: string; megapixels?: number };
    libraryLink?: { path: string; sha256?: string };
}
export interface StyleGallery { version: 1; styles: GalleryStyle[] }
export const STYLE_GALLERY_KEY = 'lawiz-style-gallery-v1';
export const normalizeStyleModel = (model: string): string => {
    const normalized = model.trim().toUpperCase();
    if (normalized === 'FLUX2') return 'FLUX2-9B';
    if (/^KREA(?:[- _]?2)?$/.test(normalized)) return 'KREA2';
    if (/^MOSS(?:[- _]?(?:IMAGE|PHOTO))?$/.test(normalized)) return 'MOSS';
    if (['H3', 'MINIMAX', 'MINIMAXH3', 'H3MINIMAX', 'HMINIMAX'].includes(normalized.replace(/[^A-Z0-9]/g, ''))) return 'H3';
    return normalized;
};
export const styleLoraMatches = (name: string, names: string[]): boolean => {
    const normalize = (value: string) => value.trim().replace(/\\/g, '/').toLowerCase();
    return !!name.trim() && names.some(value => !!value.trim() && normalize(value) === normalize(name));
};
const entries: [string, string, string?][] = [
    ['Retro Ghibli style', 'retro_ghibli_style_klein9b.safetensors'],
    ['Art deco future', 'ArtDecoVintageFutureKlein9b_000003000.safetensors'],
    ['Manga', 'naoki_urasawa_klein9b.safetensors'],
    ['Comic ink cartoon', 'Cartoon_9b_A5SEN03VV0R9705B0RV7S5YB40.safetensors', 'M0dernPulpC0micInk'],
    ['Cartoon Hanna Barbera', 'Cowboy Bebop (Diff) 9b.safetensors'],
    ['Moebius', 'moebius_klein_000007500.safetensors'],
    ['Pencil Sketch', 'Pencil_Sketch_KL_9B.safetensors'],
    ['Where is Charlie style', 'myWmbStyle_v1'],
    ['50s sci fi', '1950s_scifi_flux2_klein_r64_100.safetensors'],
    ['Dario Argento style', 'Dario Argento movie theme for Klein.safetensors'],
    ['2000 photo photography', 'Phone_Photography_2025_KL_9B'],
    ['EVGENY MIGUNOV - BLACK & WHITE CHARACTER ILLUSTRATION', 'MIGUNOV_epoch_10.safetensors',
        'black and white illustration in the manner of Evgeny Migunov, Soviet book illustration pen and ink, expressive character portraiture'],
    ['Party time style', 'party_time_v2.1_klein9b.safetensors'],
    ['Samsung style cam', 'Samsung_fluxklein9b.safetensors'],
    ['Charcoal sketch', 'charcoal sketch 9b.safetensors'],
    ['Arthur de Pins style', 'Flux_dePins_c1-st5000.safetensors'],
    ['Disney Mid-Century Animation', 'DisneyMidCenturyKlein9b.safetensors'],
    ['Retro VHS', 'mvc5000_fluxklein9b.safetensors', 'mvc5000'],
    ['Comic book realism', 'ComicRealism01a_CE_FLUX2_Klein9b_AIT4k.safetensors', 'Comic book realism'],
    ['Dragonball Anime Style', 'MrWeaz_DragonBall_Style_v1.safetensors', 'Dr4g0nB4ll ,1980s_style'],
    ['Retro-Pop style', 'RetroPop01a_CE_FLUX2_Klein9b_AIT3k.safetensors', 'Retro pop style poster art.'],
    ['Goya Style - Dark Romantic Etching', 'Goya_Style_Klein.safetensors', 'G0ya_Style'],
    ['Greg Capullo Style', 'Greg Capullo.safetensors'],
    ['Japanese horror movie', 'japanese_horror_klein9b.safetensors'],
    ['50s Atompunk Thriller style', '50sAtompunkThrillerKlein9b_10000.safetensors', 'Movie still from 1950s Atompunk sci-fi thriller,'],
    ['Childish', 'Childish01_CE_FLUX2_Klein9b_AIT4k.safetensors', 'A childish crayon drawing'],
    ['Mega64 2004 videos', 'Mega64 (2004) (Diff).safetensors'],
];
export const defaultStyleGallery = (): StyleGallery => ({
    version: 1,
    styles: entries.map(([title, lora, trigger = ''], index) => ({
        id: `flux2-initial-${index + 1}`, model: 'FLUX2-9B', title, lora, trigger, strength: 1, settings: {},
        prompt: index === 11 ? 'grotesque facial emotion, precise ink hatching, psychological caricature, white paper background, monochrome tonal wash' : title,
        notes: 'User-provided filename. Select its installed ComfyUI path. No recommended sampling settings supplied.',
    })),
});
export function validateStyleGallery(value: unknown): asserts value is StyleGallery {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
        || !('styles' in value) || !Array.isArray(value.styles)) throw new Error('Invalid style gallery version or contents.');
    const ids = new Set<string>();
    for (const style of value.styles) {
        if (!style || typeof style !== 'object') throw new Error('Invalid style entry.');
        for (const field of ['id', 'model', 'title', 'prompt', 'trigger', 'lora', 'notes']) {
            if (typeof style[field] !== 'string') throw new Error(`Invalid style ${field}.`);
        }
        if (!style.id.trim() || !style.model.trim() || !style.title.trim() || ids.has(style.id)) throw new Error('Every style needs a unique ID, model and title.');
        if (![style.lora, style.trigger, style.prompt].some(value => value.trim())) throw new Error('A style needs a LoRA, a trigger or a prompt.');
        ids.add(style.id);
        if (typeof style.strength !== 'number' || !Number.isFinite(style.strength)) throw new Error('LoRA strength must be finite.');
        if (style.libraryLink !== undefined && (!style.libraryLink || typeof style.libraryLink.path !== 'string' || !style.libraryLink.path.trim()
            || style.libraryLink.sha256 !== undefined && typeof style.libraryLink.sha256 !== 'string')) throw new Error('Invalid style library link.');
        if (!style.settings || typeof style.settings !== 'object' || Array.isArray(style.settings)) throw new Error('Invalid style sampling settings.');
        for (const [key, setting] of Object.entries(style.settings)) {
            if (!['steps', 'cfg', 'sampler', 'scheduler', 'megapixels'].includes(key)) throw new Error(`Unsupported style setting: ${key}.`);
            if (key === 'sampler' || key === 'scheduler') {
                if (typeof setting !== 'string' || !setting.trim()) throw new Error(`${key} cannot be empty when specified.`);
            } else if (typeof setting !== 'number' || !Number.isFinite(setting)
                || (key === 'cfg' ? setting < 0 : setting <= 0) || key === 'steps' && !Number.isSafeInteger(setting)) {
                throw new Error(`Invalid style ${key}.`);
            }
        }
    }
}
export const parseStyleGallery = (raw: string | null): StyleGallery => {
    if (raw === null) return defaultStyleGallery();
    const value: unknown = JSON.parse(raw);
    validateStyleGallery(value);
    return { ...value, styles: value.styles.map(style => ({ ...style, model: normalizeStyleModel(style.model) })) };
};
export const saveStyleGallery = (gallery: StyleGallery): void => {
    validateStyleGallery(gallery);
    localStorage.setItem(STYLE_GALLERY_KEY, JSON.stringify({ ...gallery, styles: gallery.styles.map(style => ({ ...style, model: normalizeStyleModel(style.model) })) }));
    window.dispatchEvent(new Event(STYLE_GALLERY_KEY));
};
export const applyFlux2StyleScheduler = (workflow: H3Workflow, scheduler?: string): void => {
    if (scheduler === undefined || scheduler === 'flux2') return;
    if (!scheduler.trim()) throw new Error('Style scheduler cannot be empty when specified.');
    const isLink = (value: unknown): value is [string, number] => Array.isArray(value) && value.length === 2
        && typeof value[0] === 'string' && Number.isSafeInteger(value[1]) && value[1] >= 0;
    for (const [id, node] of Object.entries(workflow)) {
        if (node.class_type !== 'Flux2Scheduler') continue;
        const consumers = Object.values(workflow).filter(sample => sample.class_type === 'SamplerCustomAdvanced'
            && isLink(sample.inputs.sigmas) && sample.inputs.sigmas[0] === id);
        if (!consumers.length) throw new Error(`Cannot force style scheduler: ${id} has no sampler connection.`);
        const models = consumers.map(sample => {
            const guider = sample.inputs.guider;
            const model = isLink(guider) ? workflow[guider[0]]?.inputs.model : undefined;
            if (!isLink(model) || !workflow[model[0]]) throw new Error(`Cannot force style scheduler: ${id} has no valid sampling model.`);
            return model;
        });
        const model = models[0];
        if (models.some(value => value[0] !== model[0] || value[1] !== model[1])) {
            throw new Error(`Cannot force style scheduler: ${id} is shared by different sampling models.`);
        }
        node.class_type = 'BasicScheduler';
        node.inputs = { model: [model[0], model[1]], scheduler, steps: node.inputs.steps, denoise: 1 };
    }
};
export const resolveStyleLora = (name: string, available: string[]): string => {
    const normalized = (value: string) => value.replace(/\\/g, '/').toLowerCase();
    const exact = available.filter(value => normalized(value) === normalized(name));
    if (exact.length === 1) return exact[0];
    const basename = (value: string) => normalized(value).split('/').pop()!.replace(/\.safetensors$/, '');
    const matches = available.filter(value => basename(value) === basename(name));
    if (matches.length === 1) return matches[0];
    throw new Error(matches.length ? `Ambiguous LoRA "${name}". Select its full installed path in the style manager.` : `Missing LoRA "${name}". Install it or select its installed path in the style manager.`);
};
export const removeGalleryStyleTrigger = (prompt: string, trigger: string): string => {
    trigger = trigger.trim();
    if (!trigger) return prompt;
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return prompt.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'gi'), '').trim();
};
export const prependGalleryStyleTrigger = (prompt: string, trigger: string): string => {
    trigger = trigger.trim();
    if (!trigger) return prompt;
    const body = prompt.trimStart(), normalized = body.toLowerCase(), prefix = trigger.toLowerCase();
    if (normalized === prefix || normalized.startsWith(`${prefix}\n`) || normalized.startsWith(`${prefix}\r\n`)) return body;
    return [trigger, prompt].filter(Boolean).join('\n');
};
export const appendGalleryStylePrompt = (base: string, style: GalleryStyle): string => {
    base = removeGalleryStyleTrigger(base, style.trigger);
    const addition = removeGalleryStyleTrigger(style.prompt.trim(), style.trigger);
    const body = !addition || base.toLowerCase().includes(addition.toLowerCase()) ? base : [base, addition].filter(Boolean).join('\n');
    return prependGalleryStyleTrigger(body, style.trigger);
};
