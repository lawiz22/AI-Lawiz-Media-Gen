import React, { useMemo, useState } from 'react';
import { h3Choices, type H3ObjectInfo, type MinimaxH3Options } from '../services/minimaxH3Workflow';
import { h3GalleryStyle, h3StyleLoraRemovals, h3StyleSampling } from '../services/h3StyleWorkflow';
import { appendGalleryStylePrompt, resolveStyleLora, type GalleryStyle } from '../services/styleGallery';
import { resolveLibraryStyle, styleInstalledLoras } from '../services/styleLibrary';
import { useStyleGallery } from './useStyleGallery';
import { useModelInventory } from './useModelInventory';
import { StylePicker } from './StyleBrowser';
import { SaveStyleSamplingButton } from './SaveStyleSamplingButton';

export const H3StyleControl: React.FC<{
    options: MinimaxH3Options;
    onChange: (patch: Partial<MinimaxH3Options>) => void;
    info: H3ObjectInfo | null;
    prompt: string;
    disabled: boolean;
}> = ({ options, onChange, info, prompt, disabled }) => {
    const { gallery, error: galleryError } = useStyleGallery();
    const { inventory, loading, error: inventoryError } = useModelInventory();
    const [error, setError] = useState(''), [notice, setNotice] = useState('');
    const { style } = options;
    const primarySampling = !(options.variant === 'advanced' && options.advanced?.inputMode === 'video');
    const styles = useMemo(() => style && !gallery?.styles.some(value => value.id === style.id)
        ? [...(gallery?.styles || []), style] : gallery?.styles || [], [gallery, style]);
    const preview = useMemo(() => {
        try {
            h3GalleryStyle(options);
            return { prompt: style ? appendGalleryStylePrompt(prompt, style) : prompt, sampling: h3StyleSampling(options), error: '' };
        } catch (cause) { return { prompt: '', sampling: undefined, error: String(cause) }; }
    }, [options, prompt]);
    const select = (selected: GalleryStyle | null) => {
        try {
            let resolved: GalleryStyle | undefined;
            let messages = '';
            if (selected) {
                const result = resolveLibraryStyle(selected, inventory, h3Choices(info, 'KSamplerSelect', 'sampler_name'));
                resolved = result.style;
                if (resolved.lora) {
                    const names = [...new Set([...h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), ...h3Choices(info, 'LoraLoader', 'lora_name')])];
                    resolved = { ...resolved, lora: resolveStyleLora(resolved.lora, styleInstalledLoras(names, 'H3', inventory)) };
                }
                h3GalleryStyle({ ...options, style: resolved, styleStrength: undefined });
                messages = [...(result.filled.length ? [`From My Library: ${result.filled.join(', ')}`] : []), ...result.warnings].join(' · ');
            }
            onChange({ style: resolved, styleStrength: undefined, loras: h3StyleLoraRemovals(options, resolved) });
            setError(''); setNotice(messages);
            return true;
        } catch (cause) { setError(String(cause)); return false; }
    };
    return <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary p-4">
        <h4 className="font-semibold">Style Gallery · H3 / MiniMax</h4>
        <StylePicker styles={styles} inventory={inventory} model="H3" selectedId={style?.id} selectedStyle={style}
            onSelect={select} error={error} disabled={disabled || loading} />
        {(error || preview.error || galleryError || inventoryError) && <p role="alert" className="text-sm text-red-400">{error || preview.error || galleryError || inventoryError}</p>}
        {notice && <p role="status" className="text-xs text-accent">{notice}</p>}
        {style && <>
            <p role="status" className="break-all text-xs text-accent">Next generation: {style.title} · {style.lora || 'Prompt only'}</p>
            {style.lora && <div className="space-y-3 rounded-lg border border-accent/40 bg-bg-tertiary p-3">
                <label className="block text-sm">Style LoRA (gallery)<input aria-label="Active style LoRA" readOnly value={style.lora} className="mt-1 w-full rounded border border-border-primary bg-bg-primary p-2 text-sm" /></label>
                <label className="block text-sm">Style LoRA strength<input aria-label="Style LoRA strength" type="number" min={-20} max={20} step="0.05"
                    className="ml-2 w-24 rounded border border-border-primary bg-bg-primary p-2" value={options.styleStrength ?? style.strength} disabled={disabled}
                    onChange={event => onChange({ styleStrength: event.target.valueAsNumber })} /></label>
                <p role="status" className="text-xs text-accent">{(options.styleStrength ?? style.strength) === 0 ? 'Strength 0: the style LoRA has no effect.' : 'Style LoRA active independently of the additional LoRA switch.'} Your six additional slots are kept; the same style LoRA is not loaded twice.</p>
            </div>}
            {primarySampling && <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!options.useStyleSettings} disabled={disabled}
                    onChange={event => onChange({ useStyleSettings: event.target.checked })} />Apply style sampling overrides</label>
                {options.useStyleSettings && <p className="text-xs text-accent">{Object.entries(style.settings).filter(([key]) => ['steps', 'sampler', 'scheduler'].includes(key))
                    .map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No style sampling overrides; workflow settings are kept.'}</p>}
                {preview.sampling && <SaveStyleSamplingButton style={style} sampling={preview.sampling} disabled={disabled}
                    onSaved={sampling => onChange({ style: { ...style, settings: { ...style.settings, ...sampling } } })} />}
            </>}
            <p className="text-xs text-text-muted">Trigger first, after any ReferencePack prompt rewriting. Your original prompt and references are kept. H3 uses BasicGuider without editable CFG: style CFG and megapixels are not applied. Sampling overrides affect the H3 first pass only; duration, sigma extension and latent / LTX finishing settings are kept.</p>
            {!primarySampling && <p role="status" className="text-xs text-accent">Source-video mode: style applies to H3 latent refinement only. No H3 first pass or style sampling override.</p>}
            <details><summary className="cursor-pointer text-sm">Prompt with style applied</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{preview.prompt}</pre></details>
        </>}
    </section>;
};
