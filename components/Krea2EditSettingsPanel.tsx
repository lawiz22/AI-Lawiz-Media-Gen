import React, { useId, useState } from 'react';
import type { GenerationOptions } from '../types';
import {
    composeKrea2EditPrompt, defaultKrea2EditSettings, KREA2_EDIT_ASPECTS, KREA2_EDIT_EXAMPLES, KREA2_EDIT_POSITIONS,
    getKrea2EditCapabilities, krea2EditDimensions, krea2EditLoraName, switchKrea2EditTask, type Krea2EditComposer, type Krea2EditObjectInfo, type Krea2EditSettings,
} from '../services/krea2EditWorkflow';
import { getQwen21Choices } from '../services/qwen21Workflow';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider, SelectInput, TextInput } from './InputComponents';

export const Krea2EditSettingsPanel: React.FC<{
    options: GenerationOptions; updateOptions: (change: Partial<GenerationOptions>) => void; disabled: boolean;
    objectInfo?: Krea2EditObjectInfo; availableLoras?: string[]; section?: 'main' | 'loras' | 'sampler';
    sourceFile?: File | null; secondFile?: File | null; onSourceChange?: (file: File | null) => void; onSecondChange?: (file: File | null) => void;
}> = ({ options, updateOptions, disabled, objectInfo, availableLoras = [], section = 'main', sourceFile, secondFile, onSourceChange, onSecondChange }) => {
    const [libraryTarget, setLibraryTarget] = useState<1 | 2 | null>(null);
    const instanceId = useId();
    const loras = [...new Set([...availableLoras, ...getQwen21Choices(objectInfo, 'LoraLoaderModelOnly', 'lora_name')])];
    const settings = options.comfyKrea2Edit || defaultKrea2EditSettings(loras);
    const capabilities = getKrea2EditCapabilities(objectInfo);
    const update = (change: Partial<Krea2EditSettings>) => updateOptions({ comfyKrea2Edit: { ...settings, ...change } });
    const updateComposer = (change: Partial<Krea2EditComposer>) => {
        const composer = { ...settings.composer, ...change };
        update({ composer, prompt: composeKrea2EditPrompt(composer) });
    };
    const number = (label: string, key: 'refBoost' | 'refBoostA' | 'groundingPx' | 'megapixels' | 'batchSize' | 'steps' | 'cfg' | 'denoise', min: number, max: number, step: number) =>
        <NumberSlider label={label} value={settings[key]} min={min} max={max} step={step} allowDirectInput disabled={disabled} onChange={event => update({ [key]: Number(event.target.value) })} />;
    const select = (label: string, key: 'unet' | 'weightDtype' | 'clip' | 'clipDevice' | 'vae' | 'sampler' | 'scheduler' | 'fitMode', node: string, input: string, extra: string[] = []) =>
        <SelectInput label={label} value={settings[key]} options={[...new Set([settings[key], ...extra, ...getQwen21Choices(objectInfo, node, input)])].map(value => ({ value, label: value }))} disabled={disabled} onChange={event => update({ [key]: event.target.value })} />;
    const example = KREA2_EDIT_EXAMPLES.find(entry => entry.id === settings.composer.example);
    let dimensions: { width: number; height: number } | undefined;
    let dimensionError = '';
    try { dimensions = krea2EditDimensions(settings); }
    catch (failure) { dimensionError = failure instanceof Error ? failure.message : 'Invalid KREA2 edit output dimensions.'; }
    const activeEditLoras = settings.loras.filter(lora => lora.enabled && lora.strength !== 0 && /krea2_(?:identity|general)_edit_v2/i.test(lora.name));
    const mixedTaskLoras = activeEditLoras.some(lora => /identity_edit/i.test(lora.name)) && activeEditLoras.some(lora => /general_edit/i.test(lora.name));
    return <div className="space-y-4">
        {section === 'main' && <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-accent">KREA2 Edit V2</h3>
                <button type="button" disabled={disabled} onClick={() => updateOptions({ comfyKrea2Edit: defaultKrea2EditSettings(loras) })} className="text-sm text-text-secondary hover:text-accent disabled:opacity-50">Restore edit defaults</button>
            </div>
            <div role="group" aria-label="KREA2 edit task" className="flex gap-2">
                {(['general', 'identity'] as const).map(task => <button key={task} type="button" disabled={disabled} aria-pressed={settings.task === task} onClick={() => updateOptions({ comfyKrea2Edit: switchKrea2EditTask(settings, task, loras) })} className={`flex-1 rounded-md border px-3 py-2 text-sm font-bold disabled:opacity-50 ${settings.task === task ? 'border-accent bg-accent text-accent-text' : 'border-border-primary text-text-secondary'}`}>{task === 'general' ? 'General Edit' : 'Identity'}</button>)}
            </div>
            <p className="text-xs text-text-secondary">Switching task replaces LoRA 1, applies the recommended reference boost/placement and disables other task LoRAs. Other custom LoRAs and the prompt stay unchanged.</p>
            <div className="space-y-3 rounded-md border border-border-primary p-3">
                <ImageUploader id={`krea2-edit-${instanceId}-image-1`} label={settings.secondImage ? 'Image 1 - scene / image to edit' : 'Image 1 - source photo'} sourceFile={sourceFile} onImageUpload={file => onSourceChange?.(file)} disabled={disabled || !onSourceChange} />
                <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={disabled || !onSourceChange} onClick={() => setLibraryTarget(1)} className="text-sm text-accent disabled:opacity-50">Image 1 from Library</button>
                    {sourceFile && <button type="button" disabled={disabled} onClick={() => onSourceChange?.(null)} className="text-sm text-danger disabled:opacity-50">Remove image 1</button>}
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.secondImage} disabled={disabled} onChange={event => update({ secondImage: event.target.checked })} />Enable image 2</label>
                <p className="text-xs text-text-secondary">Off by default. A disabled image 2 is never decoded, uploaded or connected, even if a previous reference remains selected.</p>
                {settings.secondImage && <>
                    <ImageUploader id={`krea2-edit-${instanceId}-image-2`} label="Image 2 - person / secondary reference" sourceFile={secondFile} onImageUpload={file => onSecondChange?.(file)} disabled={disabled || !onSecondChange} />
                    <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled || !onSecondChange} onClick={() => setLibraryTarget(2)} className="text-sm text-accent disabled:opacity-50">Image 2 from Library</button>
                        {secondFile && <button type="button" disabled={disabled} onClick={() => onSecondChange?.(null)} className="text-sm text-danger disabled:opacity-50">Remove image 2</button>}</div>
                    <p className="text-xs text-text-secondary">For identity replacement: scene in image 1, person in image 2. When placement controls are supported, use scene aligned and person beside.</p>
                </>}
                {settings.secondImage && <label className="block text-sm text-text-secondary">Image 1 placement (scene)
                    <select value={settings.positionA} disabled={disabled || !capabilities.positionA} onChange={event => update({ positionA: event.target.value as Krea2EditSettings['positionA'] })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">{capabilities.positionA ? KREA2_EDIT_POSITIONS.map(value => <option key={value} value={value}>{value}</option>) : <option value={settings.positionA}>Automatic (installed node)</option>}</select>
                </label>}
                <label className="block text-sm text-text-secondary">{settings.secondImage ? 'Image 2 placement (person)' : 'Image 1 placement'}
                    <select value={settings.position} disabled={disabled || !capabilities.position} onChange={event => update({ position: event.target.value as Krea2EditSettings['position'] })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">{capabilities.position ? KREA2_EDIT_POSITIONS.map(value => <option key={value} value={value}>{value}</option>) : <option value={settings.position}>Automatic (installed node)</option>}</select>
                </label>
                {objectInfo?.Krea2EditModelPatch && (!capabilities.position || (settings.secondImage && !capabilities.positionA)) && <p role="status" className="text-xs text-warning">Your installed ComfyUI-Krea2Edit does not expose these placement controls. Disabled controls use the node's native layout, not the saved placement setting. Image editing remains available. Update the nodes and restart ComfyUI to choose aligned/beside placement.</p>}
                {number(settings.secondImage ? 'Image 2 reference boost' : 'Reference boost', 'refBoost', 0, 10, 0.1)}
                {settings.secondImage && number('Image 1 reference boost', 'refBoostA', 0, 10, 0.1)}
                {select('Reference fit', 'fitMode', 'Krea2EditModelPatch', 'fit_mode', ['fit', 'crop (legacy)'])}
            </div>
            <details open className="rounded-md border border-border-primary p-3"><summary className="cursor-pointer text-sm font-bold">Prompt builder &amp; replacement examples</summary><div className="mt-3 space-y-3">
                <label className="block text-sm text-text-secondary">Edit example
                    <select value={settings.composer.example} disabled={disabled} onChange={event => {
                        const selected = KREA2_EDIT_EXAMPLES.find(entry => entry.id === event.target.value);
                        if (!selected) return;
                        const next = selected.id === 'custom' ? settings : switchKrea2EditTask(settings, selected.task, loras);
                        const composer: Krea2EditComposer = { ...defaultKrea2EditSettings().composer, example: selected.id, target: selected.target || '', replacement: selected.replacement || '' };
                        updateOptions({ comfyKrea2Edit: { ...next, composer, prompt: selected.id === 'custom' ? settings.prompt : composeKrea2EditPrompt(composer) } });
                    }} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">
                        {KREA2_EDIT_EXAMPLES.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                </label>
                {example?.second && !settings.secondImage && <p role="alert" className="text-xs text-warning">This example needs image 2. Enable it above and choose the reference; it is not enabled automatically.</p>}
                {example?.raw && <p className="text-xs text-warning">Removal works best with Raw, 20 steps and CFG 3. Apply those settings in Sampler Settings.</p>}
                {(['target', 'replacement', 'scene', 'pose', 'outfit', 'lighting', 'preserve', 'extra'] as const).map(key => <TextInput key={key}
                    label={{ target: 'Subject / target to replace or remove', replacement: 'Instruction / replacement / new text', scene: 'New scene / environment', pose: 'Pose / framing (specify full body, crop or visible footwear)', outfit: 'Outfit (concrete garments; say what must be removed)', lighting: 'Lighting (where the light lands)', preserve: 'What must stay unchanged', extra: 'Additional instructions / LoRA trigger words' }[key]}
                    value={settings.composer[key]} disabled={disabled} onChange={event => updateComposer({ [key]: event.target.value })} />)}
                <p className="text-xs text-text-secondary">These fields rebuild the prompt as you type. The final prompt below is also editable; changing a builder field rebuilds it again. Examples can switch task/LoRA but never enable image 2.</p>
            </div></details>
            <TextInput label="Positive edit instruction" value={settings.prompt} disabled={disabled} isTextArea rows={6} onChange={event => update({ prompt: event.target.value })} />
            <TextInput label="Negative prompt (leave empty for trained unconditional)" value={settings.negativePrompt} disabled={disabled} isTextArea onChange={event => update({ negativePrompt: event.target.value })} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm text-text-secondary">Output aspect ratio<select value={settings.aspect} disabled={disabled} onChange={event => update({ aspect: event.target.value })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">{KREA2_EDIT_ASPECTS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="block text-sm text-text-secondary">Pixel alignment<select value={settings.multiple} disabled={disabled} onChange={event => update({ multiple: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">{[8, 16, 32, 64].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            </div>
            {number('Output megapixels', 'megapixels', 0.25, 2, 0.25)}
            {dimensions ? <output aria-label="KREA2 edit output size" className="block text-sm text-accent">{dimensions.width} x {dimensions.height} (maximum 2 MP)</output> : <p role="alert" className="text-sm text-danger">{dimensionError}</p>}
            {number('Batch size (per generation)', 'batchSize', 1, 8, 1)}
            <details className="rounded-md border border-border-primary p-3"><summary className="cursor-pointer text-sm font-bold">Models &amp; grounded encoding</summary><div className="mt-3 space-y-3">
                {select('Diffusion model', 'unet', 'UNETLoader', 'unet_name')}
                {select('Weight dtype', 'weightDtype', 'UNETLoader', 'weight_dtype')}
                {select('Qwen3-VL CLIP (type krea2)', 'clip', 'CLIPLoader', 'clip_name')}
                {select('CLIP device', 'clipDevice', 'CLIPLoader', 'device')}
                {select('VAE', 'vae', 'VAELoader', 'vae_name')}
                {number('Grounding resolution (0 = native)', 'groundingPx', 0, 4096, 64)}
                <TextInput label="Grounding system prompt (empty = training default)" value={settings.systemPrompt} disabled={disabled} isTextArea onChange={event => update({ systemPrompt: event.target.value })} />
                <TextInput label="Output filename prefix" value={settings.filenamePrefix} disabled={disabled} onChange={event => update({ filenamePrefix: event.target.value })} />
                <p className="text-xs text-text-secondary">768 is recommended. Lower grounding resolution can strengthen scene edits; higher values can improve likeness. Both positive and negative encoders receive the same enabled images.</p>
            </div></details>
            <p className="text-xs text-warning">Requires ComfyUI-Krea2Edit v2.0.0+. Identity Edit is not a general remover/recolorer. Use a single task LoRA at 1.0; if deliberately combining both, start near 0.6 each.</p>
            <p className="text-xs text-text-secondary">Edit LoRAs: personal/non-commercial use; commercial use needs the author's license. <a href="https://huggingface.co/conradlocke/krea2-identity-edit" target="_blank" rel="noreferrer" className="text-accent underline">Model license and terms</a></p>
            <LibraryPickerModal isOpen={libraryTarget !== null} onClose={() => setLibraryTarget(null)} filter={['image', 'character', 'extracted-frame', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo']}
                onSelectItem={async item => {
                    const response = await fetch(item.media);
                    if (!response.ok) throw new Error('Could not load the KREA2 reference from the Library.');
                    const blob = await response.blob();
                    if (!blob.type.startsWith('image/')) throw new Error('Choose a Library image for KREA2 editing.');
                    const file = new File([blob], `krea2_image_${libraryTarget}.png`, { type: blob.type });
                    if (libraryTarget === 1) onSourceChange?.(file);
                    else onSecondChange?.(file);
                }} />
        </>}
        {section === 'loras' && <>
            <label className="block text-sm text-text-secondary">Task LoRA size
                <select value={settings.rank} disabled={disabled} onChange={event => {
                    const rank = event.target.value as Krea2EditSettings['rank'];
                    update({ rank, loras: settings.loras.map((lora, index) => index === 0 ? { ...lora, name: krea2EditLoraName(settings.task, rank, loras), enabled: true } : lora) });
                }} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2"><option value="full">Full</option><option value="r128">r128 - low VRAM (~0.9 GB)</option><option value="r64">r64 - low VRAM (~0.46 GB)</option></select>
            </label>
            <p className="text-xs text-text-secondary">Up to four independent LoraLoaderModelOnly nodes in order, before the edit patch. No Power LoRA. Slot 1 is the task LoRA; slots 2-4 are optional.</p>
            {settings.loras.map((lora, index) => <div key={index} className="space-y-3 rounded-md border border-border-primary p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={lora.enabled} disabled={disabled} onChange={event => update({ loras: settings.loras.map((entry, slot) => slot === index ? { ...entry, enabled: event.target.checked } : entry) })} />LoRA {index + 1}{index === 0 ? ' - task' : ''}</label>
                <label className="block text-sm text-text-secondary">LoRA {index + 1} model<select value={lora.name} disabled={disabled} onChange={event => update({ loras: settings.loras.map((entry, slot) => slot === index ? { ...entry, name: event.target.value, enabled: !!event.target.value } : entry) })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">
                    <option value="">None</option>{[...new Set([lora.name, ...loras].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}
                </select></label>
                <NumberSlider label={`LoRA ${index + 1} strength`} value={lora.strength} min={-2} max={2} step={0.05} allowDirectInput disabled={disabled || !lora.enabled} onChange={event => update({ loras: settings.loras.map((entry, slot) => slot === index ? { ...entry, strength: Number(event.target.value) } : entry) })} />
            </div>)}
            {mixedTaskLoras && <p role="alert" className="text-sm text-warning">Both task LoRAs are enabled. Loading both at 1.0 can break the image; reduce each to about 0.6 or disable one.</p>}
        </>}
        {section === 'sampler' && <>
            <div className="flex flex-wrap gap-2">{(['turbo', 'raw'] as const).map(mode => <button key={mode} type="button" disabled={disabled} onClick={() => update({ unet: `krea2_${mode}_fp8_scaled.safetensors`, steps: mode === 'raw' ? 20 : 8, cfg: mode === 'raw' ? 3 : 1 })} className="rounded-md border border-border-primary px-3 py-2 text-sm text-accent disabled:opacity-50">{mode === 'raw' ? 'Raw - removals (20 steps / CFG 3)' : 'Turbo - fast (8 steps / CFG 1)'}</button>)}</div>
            {number('Steps', 'steps', 1, 30, 1)}{number('CFG', 'cfg', 0, 5, 0.1)}
            {select('Sampler', 'sampler', 'KSampler', 'sampler_name')}{select('Scheduler', 'scheduler', 'KSampler', 'scheduler')}
            {number('Denoise', 'denoise', 0, 1, 0.01)}
            <p className="text-xs text-text-secondary">Sampling starts from an empty target latent, as in the supplied workflow. The edit patch supplies source conditioning; denoise is the sampler's control, not a source-VAE latent blend.</p>
            <label className="block text-sm text-text-secondary">Seed (empty = random)<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={options.comfySeed ?? ''} disabled={disabled} onChange={event => updateOptions({ comfySeed: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2" /></label>
            <label className="block text-sm text-text-secondary">Seed control<select value={options.comfySeedControl || 'randomize'} disabled={disabled} onChange={event => updateOptions({ comfySeedControl: event.target.value as GenerationOptions['comfySeedControl'] })} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2">{['randomize', 'fixed', 'increment', 'decrement'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && <NumberSlider label="Seed change amount" value={options.comfySeedIncrement ?? 1} min={1} max={100} step={1} allowDirectInput disabled={disabled} onChange={event => updateOptions({ comfySeedIncrement: Number(event.target.value) })} />}
        </>}
    </div>;
};
