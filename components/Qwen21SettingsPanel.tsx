import React from 'react';
import type { GenerationOptions } from '../types';
import { defaultQwen21Settings, getQwen21Choices, QWEN21_SIZES, qwen21Dimensions } from '../services/qwen21Workflow';
import type { Qwen21Settings } from '../services/qwen21Workflow';
import { SelectInput, TextInput, NumberSlider } from './InputComponents';
import { ModelFields } from './ui/fields';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { ui } from './ui/styles';
import { Select } from './ui/Select';
import { ResetIcon } from './icons';

const NAME = 'Qwen 2.1';

export const Qwen21SettingsPanel: React.FC<{ options: GenerationOptions; updateOptions: (options: Partial<GenerationOptions>) => void; objectInfo: any; disabled: boolean; section?: 'main' | 'models' | 'prompt' | 'loras' | 'sampler' }> = ({ options, updateOptions, objectInfo, disabled, section = 'main' }) => {
    const mode = options.comfyModelType === 'qwen21-turbo' ? 'turbo' : 't2i';
    const key = mode === 'turbo' ? 'comfyQwen21Turbo' : 'comfyQwen21T2i';
    const settings = options[key] || defaultQwen21Settings(mode);
    const update = (change: Partial<Qwen21Settings>) => updateOptions({ [key]: { ...settings, ...change } });
    const choices = (node: string, input: string) => getQwen21Choices(objectInfo, node, input);
    const { inventory } = useModelInventory();
    const sizeOptions = QWEN21_SIZES[mode].map((_, sizeIndex) => {
        const { width, height } = qwen21Dimensions(mode, { ...settings, sizeIndex });
        return { value: String(sizeIndex), label: `${width} x ${height}` };
    });
    return <div className="space-y-6">
        {section === 'main' && <>
        <div className="flex items-center justify-between gap-3 border-b border-border-primary pb-2">
            <h3 className="text-base font-bold">Qwen Image 2.1 {mode === 'turbo' ? 'T2I (Turbo)' : 'T2I'}</h3>
            <button type="button" title="Restore workflow defaults" aria-label="Restore Qwen 2.1 workflow defaults" disabled={disabled} onClick={() => updateOptions({ [key]: { ...defaultQwen21Settings(mode), prompt: settings.prompt } })} className="rounded p-2 text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"><ResetIcon className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectInput label="Orientation" value={settings.orientation} options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} onChange={event => update({ orientation: event.target.value as Qwen21Settings['orientation'] })} disabled={disabled} />
            <SelectInput label="Size" value={String(settings.sizeIndex)} options={sizeOptions} onChange={event => update({ sizeIndex: Number(event.target.value) })} disabled={disabled} />
        </div>
        </>}
        {section === 'models' && <ModelFields name={NAME} disabled={disabled} onChange={(id, value) => update({ [id]: value })} fields={[
            { id: 'unet', label: 'Diffusion Model', value: settings.unet, choices: familyFiles(choices('UNETLoader', 'unet_name'), 'qwen21', inventory) },
            { id: 'clip', label: 'CLIP', value: settings.clip, choices: choices('CLIPLoader', 'clip_name') },
            { id: 'vae', label: 'VAE', value: settings.vae, choices: choices('VAELoader', 'vae_name') },
            { id: 'attention', label: 'Attention', value: settings.attention, choices: choices('ModelAttentionBackend', 'attention') },
        ]} />}
        {section === 'prompt' && <>
        <TextInput label="Positive Prompt" value={settings.prompt} onChange={event => update({ prompt: event.target.value })} disabled={disabled} isTextArea />
        {mode === 't2i' && <TextInput label="Negative Prompt" value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} disabled={disabled} isTextArea />}
        </>}
        {section === 'loras' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {settings.loras.map((lora, index) => <div key={index} className="space-y-3 border-b border-border-primary pb-3">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={lora.enabled} disabled={disabled} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, enabled: event.target.checked } : entry) })} className="h-4 w-4 accent-accent" />LoRA {index + 1}</label>
                <Select variant="search" label={`LoRA ${index + 1} Model`} ariaLabel={`${NAME} LoRA ${index + 1} Model`} value={lora.name} options={[{ value: '', label: 'None' }, ...familyFiles(choices(objectInfo?.LoraLoaderModelOnly ? 'LoraLoaderModelOnly' : 'LoraLoader', 'lora_name'), 'qwen21', inventory).map(value => ({ value, label: value }))]} onChange={name => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, name, enabled: !!name } : entry) })} disabled={disabled} />
                {lora.name && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <NumberSlider label={`LoRA ${index + 1} Model Strength`} value={lora.modelStrength} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, modelStrength: Number(event.target.value) } : entry) })} min={-10} max={10} step={0.05} disabled={disabled || !lora.enabled} allowDirectInput />
                    <NumberSlider label={`LoRA ${index + 1} CLIP Strength`} value={lora.clipStrength} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, clipStrength: Number(event.target.value) } : entry) })} min={-10} max={10} step={0.05} disabled={disabled || !lora.enabled} allowDirectInput />
                </div>}
            </div>)}
        </div>}
        {section === 'sampler' && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select variant="search" label="Sampler" ariaLabel={`${NAME} Sampler`} value={settings.sampler} options={choices('KSamplerSelect', 'sampler_name')} onChange={sampler => update({ sampler })} disabled={disabled} />
            <Select variant="search" label="Scheduler" ariaLabel={`${NAME} Scheduler`} value={settings.scheduler} options={choices('BasicScheduler', 'scheduler')} onChange={scheduler => update({ scheduler })} disabled={disabled} />
        </div>
        <NumberSlider label={mode === 'turbo' ? 'BasicScheduler Steps' : 'Steps'} value={settings.steps} min={1} max={100} step={1} onChange={event => update({ steps: Number(event.target.value) })} disabled={disabled} allowDirectInput />
        {mode === 't2i' && <NumberSlider label="CFG" value={settings.cfg} min={0} max={20} step={0.1} onChange={event => update({ cfg: Number(event.target.value) })} disabled={disabled} allowDirectInput />}
        <label className="block space-y-2 text-sm font-medium">Seed<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder="Random" value={options.comfySeed ?? ''} disabled={disabled} onChange={event => updateOptions({ comfySeed: event.target.value === '' ? undefined : Number(event.target.value) })} className={`block ${ui.control}`} /></label>
        <SelectInput label="Seed Control" value={options.comfySeedControl || 'randomize'} options={['randomize', 'fixed', 'increment', 'decrement'].map(value => ({ value, label: value }))} onChange={event => updateOptions({ comfySeedControl: event.target.value as GenerationOptions['comfySeedControl'] })} disabled={disabled} />
        {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && <NumberSlider label="Seed Increment" value={options.comfySeedIncrement || 1} min={1} max={100} step={1} onChange={event => updateOptions({ comfySeedIncrement: Number(event.target.value) })} disabled={disabled} allowDirectInput />}
        </>}
    </div>;
};