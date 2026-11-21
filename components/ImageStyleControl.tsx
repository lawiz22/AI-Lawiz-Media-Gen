import React, { useMemo, useState } from 'react';
import type { GenerationOptions } from '../types';
import { useStyleGallery } from './useStyleGallery';
import { useModelInventory } from './useModelInventory';
import { StylePicker } from './StyleBrowser';
import { inferFlux2Variant } from '../services/civitaiService';
import { resolveLibraryStyle, styleInstalledLoras } from '../services/styleLibrary';
import { appendGalleryStylePrompt, resolveStyleLora, type GalleryStyle } from '../services/styleGallery';
import { flux2StyleLoraRemovals, flux2StyleOptions } from '../services/flux2EditWorkflow';
import { krea2StyleLoraRemovals, krea2StyleOptions } from '../services/krea2StyleWorkflow';
import { h3Choices, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { SaveStyleSamplingButton } from './SaveStyleSamplingButton';
import { imageStyleSampling } from '../services/styleSampling';
import { defaultMossSettings } from '../services/mossWorkflow';
import { defaultMossPhotoSettings, mossPhotoPrompt, mossPhotoSampling } from '../services/mossPhotoWorkflow';
import { mossGalleryStyle, mossStyleLoraMatches, type MossStyleSettings } from '../services/mossStyleWorkflow';
import { NumberField } from './ui/fields';
import { ui } from './ui/styles';

interface ImageStyleControlProps {
    options: GenerationOptions;
    updateOptions: (patch: Partial<GenerationOptions>) => void;
    info: H3ObjectInfo;
    disabled: boolean;
    mode?: 'i2i' | 't2i' | 'krea2-simple' | 'moss-image' | 'moss-photo';
    showSamplingControl?: boolean;
}
export const ImageStyleControl = ({ options, updateOptions, info, disabled, mode = 'i2i', showSamplingControl = true }: ImageStyleControlProps) => {
    const { gallery, error: galleryError } = useStyleGallery();
    const { inventory, loading, error: inventoryError } = useModelInventory();
    const [error, setError] = useState(''), [notice, setNotice] = useState('');
    const isKrea = mode === 'krea2-simple';
    const isMoss = mode === 'moss-image' || mode === 'moss-photo';
    const moss = mode === 'moss-image' ? options.comfyMoss || defaultMossSettings()
        : mode === 'moss-photo' ? options.comfyMossPhoto || defaultMossPhotoSettings() : undefined;
    const changeMoss = (patch: Partial<MossStyleSettings>) => mode === 'moss-photo'
        ? updateOptions({ comfyMossPhoto: { ...(options.comfyMossPhoto || defaultMossPhotoSettings()), ...patch } })
        : updateOptions({ comfyMoss: { ...(options.comfyMoss || defaultMossSettings()), ...patch } });
    const styleKey = isKrea ? 'comfyKreaStyle' : mode === 't2i' ? 'comfyFlux2Style' : 'comfyFlux2EditStyle';
    const strengthKey = isKrea ? 'comfyKreaStyleStrength' : mode === 't2i' ? 'comfyFlux2StyleStrength' : 'comfyFlux2EditStyleStrength';
    const samplingKey = isKrea ? 'comfyKreaUseStyleSettings' : mode === 't2i' ? 'comfyFlux2UseStyleSettings' : 'comfyFlux2EditUseStyleSettings';
    const family = isMoss ? 'moss' : isKrea ? 'krea2' : inferFlux2Variant((mode === 't2i' ? options.comfyFlux2Unet : options.comfyFlux2EditUnet) || 'flux2\\flux2Klein9BInt8_v10.safetensors');
    const model = family?.toUpperCase() || 'FLUX2 (unknown variant)';
    const style = isMoss ? moss?.style : options[styleKey];
    const strength = moss ? moss.styleStrength : options[strengthKey];
    const useSampling = moss ? moss.useStyleSettings : options[samplingKey];
    const styles = useMemo(() => style && !gallery?.styles.some(value => value.id === style.id) ? [...(gallery?.styles || []), style] : gallery?.styles || [], [gallery, style]);
    const preview = useMemo(() => {
        try {
            if (moss) {
                mossGalleryStyle(moss);
                const photo = options.comfyMossPhoto || defaultMossPhotoSettings(), image = options.comfyMoss || defaultMossSettings();
                const base = mode === 'moss-photo' ? mossPhotoPrompt(photo, options.comfyPrompt || '') : options.comfyPrompt || '';
                return { prompt: style ? appendGalleryStylePrompt(base, style) : base, error: '',
                    sampling: mode === 'moss-photo' ? mossPhotoSampling(photo) : { steps: image.steps, cfg: image.cfg, sampler: image.sampler, scheduler: image.scheduler } };
            }
            const resolved = mode === 'krea2-simple' ? krea2StyleOptions(options, style) : flux2StyleOptions(options, style, mode === 't2i' ? 't2i' : 'i2i');
            return { prompt: isKrea ? resolved.comfyKreaPrompt : mode === 't2i' ? resolved.comfyFlux2Prompt : resolved.comfyFlux2EditPrompt, error: '', sampling: undefined };
        }
        catch (cause) { return { prompt: '', error: String(cause), sampling: undefined }; }
    }, [options, style, mode]);
    const select = (selected: GalleryStyle | null) => {
        try {
            let resolved: GalleryStyle | undefined;
            let messages = '';
            if (selected) {
                const result = resolveLibraryStyle(selected, inventory, h3Choices(info, isMoss ? mode === 'moss-photo' ? 'KSampler' : 'KSampler (Efficient)' : isKrea ? 'KSampler' : 'KSamplerSelect', 'sampler_name'));
                resolved = result.style;
                if (resolved.lora) resolved = { ...resolved, lora: resolveStyleLora(resolved.lora,
                    styleInstalledLoras(h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), model, inventory)) };
                if (isMoss) mossGalleryStyle({ style: resolved });
                else if (mode === 'krea2-simple') krea2StyleOptions({ ...options, [strengthKey]: undefined }, resolved);
                else flux2StyleOptions({ ...options, [strengthKey]: undefined }, resolved, mode === 't2i' ? 't2i' : 'i2i');
                messages = [...(result.filled.length ? [`From My Library: ${result.filled.join(', ')}`] : []), ...result.warnings].join(' · ');
            }
            const managedLoras = [style?.lora || '', resolved?.lora || ''];
            if (isMoss) {
                if (mode === 'moss-image') {
                    const settings = options.comfyMoss || defaultMossSettings();
                    updateOptions({ comfyMoss: { ...settings, style: resolved, styleStrength: undefined,
                        loras: settings.loras.map(lora => mossStyleLoraMatches(lora.name, managedLoras) ? { ...lora, name: '', enabled: false } : lora) } });
                } else {
                    const settings = options.comfyMossPhoto || defaultMossPhotoSettings(), models = { ...settings.nodes['160'] };
                    for (let index = 1; index <= 4; index++) {
                        const name = models[`lora ${index}`];
                        if (typeof name === 'string' && mossStyleLoraMatches(name, managedLoras)) models[`lora ${index}`] = 'None';
                    }
                    updateOptions({ comfyMossPhoto: { ...settings, style: resolved, styleStrength: undefined, nodes: { ...settings.nodes, '160': models } } });
                }
                setError(''); setNotice(messages);
                return true;
            }
            const removals = mode === 'krea2-simple' ? krea2StyleLoraRemovals(options, managedLoras) : flux2StyleLoraRemovals(options, managedLoras, mode === 't2i' ? 't2i' : 'i2i');
            if (Object.keys(removals).length) messages = [messages, 'Removed the gallery style from duplicate additional LoRA slots. Other LoRAs are kept.'].filter(Boolean).join(' · ');
            updateOptions({ [styleKey]: resolved, [strengthKey]: undefined, ...removals });
            setError(''); setNotice(messages);
            return true;
        } catch (cause) { setError(String(cause)); return false; }
    };
    return <section className="space-y-3 rounded-lg border border-border-primary p-3">
        <h4 className="font-semibold">Style Gallery · {model}</h4>
        {!family && <p role="status" className="text-sm text-amber-400">Select an identifiable FLUX2 Klein 9B or 4B model to use gallery styles.</p>}
        <StylePicker styles={styles} inventory={inventory} model={model} selectedId={style?.id} selectedStyle={style} onSelect={select} error={error} disabled={disabled || loading} />
        {(error || preview.error || galleryError || inventoryError) && <p role="alert" className="text-sm text-danger">{error || preview.error || galleryError || inventoryError}</p>}
        {notice && <p role="status" className="text-xs text-accent">{notice}</p>}
        {style && <>
            <p role="status" className="break-all text-xs text-accent">Next generation: {style.title} · {style.lora || 'Prompt only'}</p>
            {style.lora && <div className={isKrea || isMoss ? 'space-y-3 rounded-md border border-accent bg-bg-tertiary p-3' : ''}>
                {(isKrea || isMoss) && <label className="block text-sm font-medium">Style LoRA (gallery)<input aria-label="Active style LoRA" readOnly value={style.lora} title={style.lora} className={`mt-1 block ${ui.control}`} /></label>}
                <NumberField className="w-40" label="Style LoRA strength" ariaLabel="Style LoRA strength" step={0.05} value={strength ?? style.strength} disabled={disabled} onChange={value => isMoss ? changeMoss({ styleStrength: value }) : updateOptions({ [strengthKey]: value })} />
                {(isKrea || isMoss) && <p role="status" className="text-xs text-accent">{(strength ?? style.strength) === 0 ? 'Strength 0: the style LoRA has no effect.' : 'Style LoRA active for the next generation, independently of the additional LoRA switch.'} Additional LoRAs stack with this style and can change its visual effect.</p>}
            </div>}
            {showSamplingControl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!useSampling} disabled={disabled} onChange={event => isMoss ? changeMoss({ useStyleSettings: event.target.checked }) : updateOptions({ [samplingKey]: event.target.checked })} />Apply style sampling overrides</label>}
            {useSampling && <p className="text-xs text-accent">{Object.entries(style.settings).filter(([key]) => !isMoss || key !== 'megapixels').map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No style overrides; generator settings are kept.'}</p>}
            {(mode === 'i2i' || preview.sampling) && <SaveStyleSamplingButton style={style} sampling={preview.sampling || imageStyleSampling({ ...options, comfyModelType: 'flux2-edit' })} disabled={disabled}
                onSaved={sampling => isMoss ? changeMoss({ style: { ...style, settings: { ...style.settings, ...sampling } } }) : updateOptions({ [styleKey]: { ...style, settings: { ...style.settings, ...sampling } } })} />}
            {isMoss && <p className="text-xs text-accent">{mode === 'moss-photo' ? 'Adds to your PHOTO look, own style, lens and AI writer output; it does not replace them. The preview below shows your idea plus gallery style; the workflow adds the photo look and lens text.' : 'Adds to your prompt and existing LoRA stack.'} Style sampling does not change image size or refinement denoise.</p>}
            <p className="text-xs text-text-muted">Changing style applies to the next generation, not to images already generated. Your prompt and unrelated additional LoRAs are kept. Style instructions written directly in your prompt remain active.</p>
            <details><summary className="cursor-pointer text-sm">Prompt with style applied</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{preview.prompt}</pre></details>
        </>}
    </section>;
};
