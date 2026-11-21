import React from 'react';
import type { GenerationOptions } from '../types';
import { defaultMossSettings, MOSS_RESOLUTIONS, mossOrientation, mossOrientationSize, mossRefineDimensions, type MossOrientation, type MossSettings } from '../services/mossWorkflow';
import { getQwen21Choices } from '../services/qwen21Workflow';
import { getImageDimensionsFromFile } from '../utils/imageUtils';
import { NumberSlider, TextInput } from './InputComponents';
import { Select } from './ui/Select';
import { ui } from './ui/styles';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { ImageUploader } from './ImageUploader';
import { ImagePromptButton } from './ImagePromptModal';
import { ImageStyleControl } from './ImageStyleControl';

export const MossSettingsPanel: React.FC<{
    options: GenerationOptions; updateOptions: (change: Partial<GenerationOptions>) => void;
    objectInfo?: Parameters<typeof getQwen21Choices>[0]; availableLoras?: string[]; disabled: boolean;
    section?: 'main' | 'models' | 'prompt' | 'advanced' | 'loras' | 'sampler';
    sourceFile?: File | null; onSourceFileChange?: (file: File | null) => void; onOpenSourceLibrary?: () => void;
}> = ({ options, updateOptions, objectInfo, availableLoras = [], disabled, section = 'main', sourceFile, onSourceFileChange, onOpenSourceLibrary }) => {
    const settings = options.comfyMoss || defaultMossSettings();
    const [sourceSize, setSourceSize] = React.useState<{ width: number; height: number } | null>(null);
    const [sourceError, setSourceError] = React.useState('');
    React.useEffect(() => {
        let active = true;
        setSourceSize(null); setSourceError('');
        if (section === 'main' && settings.refineImage && sourceFile) {
            getImageDimensionsFromFile(sourceFile).then(size => {
                const output = mossRefineDimensions(size.width, size.height);
                if (active) setSourceSize(output);
            }).catch(failure => { if (active) setSourceError(failure instanceof Error ? failure.message : 'Could not decode the source image. Choose a valid PNG, JPG or WEBP image.'); });
        }
        return () => { active = false; };
    }, [section, settings.refineImage, sourceFile]);
    const orientation = mossOrientation(settings.width, settings.height);
    const resolution = `${settings.width}x${settings.height}`;
    const hasResolution = MOSS_RESOLUTIONS[orientation].some(([width, height]) => `${width}x${height}` === resolution);
    const update = (change: Partial<MossSettings>) => updateOptions({ comfyMoss: { ...settings, ...change } });
    const { inventory } = useModelInventory();
    const select = (label: string, key: keyof MossSettings, node: string, input: string, extra: string[] = []) =>
        <Select variant="search" label={label} ariaLabel={`MOSS ${label}`} value={String(settings[key])} options={[...new Set([...extra, ...(key === 'unet' ? familyFiles(getQwen21Choices(objectInfo, node, input), 'moss', inventory) : getQwen21Choices(objectInfo, node, input))])]}
            onChange={value => update({ [key]: value })} disabled={disabled} />;
    const number = (label: string, key: 'batchSize' | 'steps' | 'cfg' | 'denoise' | 'refineDenoise' | 'startPercent' | 'endPercent', min: number, max: number, step: number) =>
        <NumberSlider label={label} value={settings[key] ?? 0.5} min={min} max={max} step={step} allowDirectInput onChange={event => update({ [key]: Number(event.target.value) })} disabled={disabled} />;
    const checkbox = (label: string, checked: boolean, onChange: (checked: boolean) => void) =>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} className="h-4 w-4 accent-accent" />{label}</label>;
    return <div className="space-y-4">
        {section === 'main' && <>
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-accent">MOSS Image 1.0</h3>
                <button type="button" disabled={disabled} onClick={() => updateOptions({ comfyMoss: defaultMossSettings() })} className="text-sm text-text-secondary hover:text-accent disabled:opacity-50">Restore workflow defaults</button>
            </div>
        </>}
        {section === 'models' && <>
                {select('Diffusion Model', 'unet', 'UNETLoader', 'unet_name')}
                {select('Weight dtype', 'weightDtype', 'UNETLoader', 'weight_dtype')}
                {select('CLIP / Text Encoder', 'clip', 'CLIPLoader', 'clip_name')}
                {select('CLIP Type', 'clipType', 'CLIPLoader', 'type')}
                {select('CLIP Device', 'clipDevice', 'CLIPLoader', 'device')}
                {select('VAE', 'vae', 'VAELoader', 'vae_name')}
        </>}
        {section === 'prompt' && <>
            <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={event => updateOptions({ comfyPrompt: event.target.value })} isTextArea disabled={disabled} />
            <ImageStyleControl mode="moss-image" options={options} updateOptions={updateOptions} info={objectInfo || {}} disabled={disabled} />
            <TextInput label="Negative Prompt" value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} isTextArea disabled={disabled} />
        </>}
        {section === 'main' && <>
            {checkbox('Refine Image (Image-to-Image)', !!settings.refineImage, refineImage => update({ refineImage }))}
            {settings.refineImage ? <div className="space-y-3 rounded-md border border-border-primary p-3">
                {onOpenSourceLibrary && <button type="button" disabled={disabled} onClick={onOpenSourceLibrary} className="text-sm text-accent disabled:opacity-50">Load Source Image from Library</button>}
                {onSourceFileChange && <ImageUploader id="moss-refine-source" label="MOSS Source Image" sourceFile={sourceFile} onImageUpload={onSourceFileChange} disabled={disabled} />}
                <ImagePromptButton image={sourceFile} disabled={disabled} defaultFormat="moss-image" onUsePrompt={comfyPrompt => updateOptions({ comfyPrompt })} />
                {sourceFile && onSourceFileChange && <button type="button" disabled={disabled} onClick={() => onSourceFileChange(null)} className="text-sm text-danger disabled:opacity-50">Remove Source Image</button>}
                {!sourceFile && <p className="text-xs text-warning">Choose an image to refine before generating.</p>}
                {sourceSize && <output aria-label="MOSS refinement output size" className="block text-sm text-accent">{sourceSize.width} x {sourceSize.height}</output>}
                {sourceError && <p role="alert" className="text-xs text-danger">{sourceError}</p>}
                {number('Refine denoise', 'refineDenoise', 0, 1, 0.01)}
                <p className="text-xs text-text-secondary">Lower denoise keeps more of the source; higher denoise changes it more. Source proportions are retained with 16-pixel alignment, without upscaling, up to 1280 px per side. The empty latent and preset resolution are not used.</p>
            </div> : <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select<MossOrientation> label="Orientation" ariaLabel="MOSS Orientation" value={orientation} disabled={disabled} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }, { value: 'square', label: 'Square' }]} onChange={value => {
                    const [width, height] = mossOrientationSize(value, settings.width, settings.height);
                    update({ width, height });
                }} />
                <Select label="Resolution" ariaLabel="MOSS Resolution" value={hasResolution ? resolution : ''} placeholder="Choose a valid resolution" disabled={disabled}
                    options={MOSS_RESOLUTIONS[orientation].map(([width, height]) => ({ value: `${width}x${height}`, label: `${width} x ${height}` }))} onChange={value => {
                    const [width, height] = value.split('x').map(Number);
                    update({ width, height });
                }} />
            </div>
            <p className="text-xs text-text-secondary">Maximum 1280 px per side. All sizes are aligned to 16 pixels.</p>
            {!hasResolution && <p role="alert" className="text-xs text-warning">Saved size: {settings.width} x {settings.height}. Select a supported resolution before generating.</p>}
            </>}
            {number('Batch size (per generation)', 'batchSize', 1, 64, 1)}
        </>}
        {section === 'advanced' && <>
            <TextInput label="Filename prefix" value={settings.filenamePrefix} onChange={event => update({ filenamePrefix: event.target.value })} disabled={disabled} />
            <h4 className="text-sm font-bold text-text-secondary">Skip Layer Guidance (SLG)</h4>
                <TextInput label="Double layers (comma-separated)" value={settings.doubleLayers} onChange={event => update({ doubleLayers: event.target.value })} disabled={disabled} />
                <TextInput label="Single layers (comma-separated)" value={settings.singleLayers} onChange={event => update({ singleLayers: event.target.value })} disabled={disabled} />
                {number('Start percent', 'startPercent', 0, 1, 0.01)}{number('End percent', 'endPercent', 0, 1, 0.01)}
        </>}
        {section === 'loras' && <>
            {settings.loras.map((lora, index) => {
                const updateLora = (change: Partial<typeof lora>) => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, ...change } : entry) });
                return <div key={index} className="space-y-3 border-b border-border-primary pb-3">
                    {checkbox(`LoRA ${index + 1}`, lora.enabled, enabled => updateLora({ enabled }))}
                    <Select variant="search" label={`LoRA ${index + 1} Model`} ariaLabel={`MOSS LoRA ${index + 1} Model`} value={lora.name} options={[{ value: '', label: 'None' }, ...familyFiles(availableLoras, 'moss', inventory).map(value => ({ value, label: value }))]} onChange={name => updateLora({ name, enabled: !!name })} disabled={disabled} />
                    <NumberSlider label="Strength" value={lora.strength} min={-10} max={10} step={0.05} allowDirectInput onChange={event => updateLora({ strength: Number(event.target.value) })} disabled={disabled || !lora.enabled} />
                    <button type="button" disabled={disabled} onClick={() => update({ loras: settings.loras.filter((_, position) => position !== index) })} className="text-sm text-danger disabled:opacity-50">Remove LoRA {index + 1}</button>
                </div>;
            })}
            <button type="button" disabled={disabled} onClick={() => update({ loras: [...settings.loras, { name: '', enabled: false, strength: 1 }] })} className="text-sm text-accent disabled:opacity-50">Add LoRA</button>
        </>}
        {section === 'sampler' && <>
            {number('Steps', 'steps', 1, 50, 1)}{number('CFG', 'cfg', 0, 5, 0.1)}
            {select('Sampler', 'sampler', 'KSampler (Efficient)', 'sampler_name')}
            {select('Scheduler', 'scheduler', 'KSampler (Efficient)', 'scheduler')}
            {settings.refineImage ? number('Refine denoise', 'refineDenoise', 0, 1, 0.01) : number('Denoise', 'denoise', 0, 1, 0.01)}
            {select('Preview method', 'previewMethod', 'KSampler (Efficient)', 'preview_method')}
            {select('Sampler VAE decode', 'vaeDecode', 'KSampler (Efficient)', 'vae_decode')}
            <p className="text-xs text-text-secondary">Live preview appears when ComfyUI sends compatible preview frames. The final image is always decoded by the source workflow's VAE Decode node.</p>
            <label className="block space-y-2 text-sm font-medium">Seed<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder="Random" value={options.comfySeed ?? ''} disabled={disabled} onChange={event => updateOptions({ comfySeed: event.target.value === '' ? undefined : Number(event.target.value) })} className={`block ${ui.control}`} /></label>
            <Select<string> label="Seed Control" ariaLabel="MOSS Seed Control" value={options.comfySeedControl || 'randomize'} options={['randomize', 'fixed', 'increment', 'decrement']} onChange={value => updateOptions({ comfySeedControl: value as GenerationOptions['comfySeedControl'] })} disabled={disabled} />
            {options.comfySeedControl === 'increment' && <NumberSlider label="Increment by" value={options.comfySeedIncrement ?? 1} min={1} max={100} step={1} allowDirectInput onChange={event => updateOptions({ comfySeedIncrement: Number(event.target.value) })} disabled={disabled} />}
        </>}
    </div>;
};

export const MossGenerationPreview: React.FC<{ image: Blob }> = ({ image }) => {
    const [src, setSrc] = React.useState('');
    React.useEffect(() => {
        const url = URL.createObjectURL(image);
        setSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [image]);
    return src ? <figure className="rounded-lg border border-border-primary bg-bg-secondary p-3"><img src={src} alt="MOSS live generation preview" className="max-h-96 w-full rounded object-contain" /><figcaption className="mt-2 text-center text-xs text-text-secondary">MOSS - Live preview</figcaption></figure> : null;
};
