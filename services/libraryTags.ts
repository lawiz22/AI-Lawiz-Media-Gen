import type { GenerationOptions, LibraryItem } from '../types';
import type { GalleryStyle } from './styleGallery';

export const normalizeLibraryTag = (value: string): string =>
    value.trim().replace(/\s+/g, ' ').toLocaleLowerCase().slice(0, 48);

const galleryStyleTag = (style: GalleryStyle | undefined): string | undefined => {
    if (!style) return undefined;
    const tag = normalizeLibraryTag(style.title.trim().replace(/^#+\s*/, ''));
    if (!tag) throw new Error('Cannot save a style hashtag: the selected style needs a non-empty name.');
    return tag;
};

export const imageGalleryStyleTag = (options: GenerationOptions | undefined): string | undefined => {
    if (options?.provider !== 'comfyui') return undefined;
    switch (options.comfyModelType) {
        case 'flux2-simple': return galleryStyleTag(options.comfyFlux2Style);
        case 'flux2-edit': return galleryStyleTag(options.comfyFlux2EditStyle);
        case 'krea2-simple': return galleryStyleTag(options.comfyKreaStyle);
        case 'moss-image': return galleryStyleTag(options.comfyMoss?.style);
        case 'moss-photo': return galleryStyleTag(options.comfyMossPhoto?.style);
        default: return undefined;
    }
};

export const withLibraryStyleTags = <T extends Omit<LibraryItem, 'id'>>(item: T): T => {
    if (item.mediaType !== 'image' && item.mediaType !== 'character' && item.mediaType !== 'video') return item;
    const h3 = item.minimaxH3Options;
    const styleTags = [
        item.mediaType === 'image' ? imageGalleryStyleTag(item.options) : undefined,
        galleryStyleTag(h3 && (h3.options.advanced?.inputMode !== 'video' || h3.options.advanced.latentUpscale) ? h3.options.style : undefined),
        galleryStyleTag(item.blazingFastOptions?.style),
    ].filter((tag): tag is string => tag !== undefined);
    if (!styleTags.length) return item;
    const tags = [...(item.tags || [])];
    const existing = new Set(tags.map(normalizeLibraryTag));
    for (const tag of styleTags) {
        if (existing.has(tag)) continue;
        tags.push(tag);
        existing.add(tag);
    }
    return { ...item, tags };
};
