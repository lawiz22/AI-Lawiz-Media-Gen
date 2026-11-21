import React, { useEffect, useState } from 'react';
import type { GalleryStyle } from '../services/styleGallery';
import { saveStyleSampling, type StyleSampling } from '../services/styleSampling';
import { useStyleGallery } from './useStyleGallery';

export const SaveStyleSamplingButton: React.FC<{
    style?: GalleryStyle;
    sampling: StyleSampling;
    disabled: boolean;
    onSaved?: (sampling: StyleSampling) => void;
}> = ({ style, sampling, disabled, onSaved }) => {
    const { gallery, error: galleryError } = useStyleGallery();
    const [error, setError] = useState(''), [status, setStatus] = useState('');
    useEffect(() => { setError(''); setStatus(''); }, [style?.id, sampling.steps, sampling.cfg, sampling.sampler, sampling.scheduler]);
    const save = () => {
        if (!style) { setError('Select a gallery style before saving sampling defaults.'); return; }
        let saved: GalleryStyle;
        try {
            saved = saveStyleSampling(style, sampling);
        } catch (cause) { setError(String(cause)); setStatus(''); return; }
        setError('');
        setStatus(`Defaults saved for "${saved.title}": ${sampling.steps} steps${sampling.cfg === undefined ? '' : ` · CFG ${sampling.cfg}`} · ${sampling.sampler} · ${sampling.scheduler === 'flux2' ? 'Flux2Scheduler (automatic)' : sampling.scheduler === 'h3-beta' ? 'H3 BetaSamplingScheduler (alpha / beta)' : sampling.scheduler}.`);
        try { onSaved?.(sampling); }
        catch (cause) { setError(`Defaults were saved, but refreshing the active generator failed: ${String(cause)}`); }
    };
    return <div className="space-y-2">
        <button type="button" disabled={disabled || !style || !gallery} onClick={save}
            title={style ? `Save the current editable sampling controls as "${style.title}" defaults. Prompt, LoRA, seed and resolution are kept.` : 'Select a style in the Style Gallery first.'}
            className="rounded-lg border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-bg-tertiary disabled:opacity-40">
            Save sampling as style default
        </button>
        {(error || galleryError) && <p role="alert" className="text-xs text-red-400">{error || galleryError}</p>}
        {status && <p role="status" className="text-xs text-accent">{status} Shared with the style manager and compatible generators.</p>}
    </div>;
};
