import type { GenerationOptions } from '../types';
import { normalizeStyleModel, parseStyleGallery, saveStyleGallery, STYLE_GALLERY_KEY, type GalleryStyle } from './styleGallery';

export interface StyleSampling {
    steps: number;
    cfg?: number;
    sampler: string;
    scheduler: string;
}

export const imageStyleSampling = (options: GenerationOptions): StyleSampling => {
    if (options.comfyModelType === 'flux2-edit') return {
        steps: options.comfyFlux2EditSteps ?? 4, cfg: options.comfyFlux2EditCfg ?? 1,
        sampler: options.comfyFlux2EditSampler || 'euler',
        scheduler: options.comfyFlux2EditUseStyleSettings ? options.comfyFlux2EditStyle?.settings.scheduler ?? 'flux2' : 'flux2',
    };
    if (options.comfyModelType === 'flux2-simple') return {
        steps: options.comfySteps ?? 10, cfg: options.comfyCfg ?? 1,
        sampler: options.comfySampler || 'euler',
        scheduler: options.comfyFlux2UseStyleSettings ? options.comfyFlux2Style?.settings.scheduler ?? 'flux2' : 'flux2',
    };
    if (options.comfyModelType === 'krea2-simple') return {
        steps: options.comfySteps ?? 10, cfg: options.comfyCfg ?? 1,
        sampler: options.comfySampler || 'er_sde', scheduler: options.comfyScheduler || 'beta',
    };
    throw new Error('This workflow has no gallery style sampling preset.');
};

export const saveStyleSampling = (selected: GalleryStyle, sampling: StyleSampling): GalleryStyle => {
    const gallery = parseStyleGallery(localStorage.getItem(STYLE_GALLERY_KEY));
    const current = gallery.styles.find(style => style.id === selected.id);
    if (!current) throw new Error('This style is not in the style manager. Save or restore the style there before saving its sampling defaults.');
    if (normalizeStyleModel(current.model) !== normalizeStyleModel(selected.model)) throw new Error('The style model changed. Select the style again before saving sampling defaults.');
    const settings = { ...current.settings, steps: sampling.steps,
        ...(sampling.cfg === undefined && normalizeStyleModel(selected.model) === 'H3' ? {} : { cfg: sampling.cfg }),
        sampler: sampling.sampler, scheduler: sampling.scheduler };
    const updated = { ...current, settings };
    saveStyleGallery({ ...gallery, styles: gallery.styles.map(style => style.id === updated.id ? updated : style) });
    return updated;
};
