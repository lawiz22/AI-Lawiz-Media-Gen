import { normalizeStyleModel, styleLoraMatches, validateStyleGallery, type GalleryStyle } from './styleGallery';

export interface MossStyleSettings {
    style?: GalleryStyle;
    styleStrength?: number;
    useStyleSettings?: boolean;
}

export const mossGalleryStyle = (settings: MossStyleSettings): GalleryStyle | undefined => {
    const style = settings.style;
    if (!style) return undefined;
    validateStyleGallery({ version: 1, styles: [style] });
    if (normalizeStyleModel(style.model) !== 'MOSS') throw new Error('Choose a MOSS style for MOSS Image / PHOTO.');
    const strength = settings.styleStrength ?? style.strength;
    if (!Number.isFinite(strength) || Math.abs(strength) > 10) throw new Error('MOSS style LoRA strength must be between -10 and 10.');
    return style;
};

export const mossStyleLoraMatches = styleLoraMatches;

export const mossStyleSampling = (settings: MossStyleSettings) => {
    const style = mossGalleryStyle(settings);
    if (!settings.useStyleSettings || !style) return {};
    const { steps, cfg, sampler, scheduler } = style.settings;
    return {
        ...(steps !== undefined ? { steps } : {}), ...(cfg !== undefined ? { cfg } : {}),
        ...(sampler !== undefined ? { sampler } : {}), ...(scheduler !== undefined ? { scheduler } : {}),
    };
};
