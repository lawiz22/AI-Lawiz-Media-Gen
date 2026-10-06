import React, { useState } from 'react';
import type { GenerationOptions } from '../types';
import { defaultQwen21Settings, getQwen21Choices, QWEN21_SIZES, qwen21Dimensions } from '../services/qwen21Workflow';
import type { Qwen21Settings } from '../services/qwen21Workflow';
import { SelectInput, TextInput, NumberSlider } from './InputComponents';
import { ResetIcon } from './icons';

export const Qwen21SettingsPanel: React.FC<{ options: GenerationOptions; updateOptions: (options: Partial<GenerationOptions>) => void; objectInfo: any; disabled: boolean; section?: 'main' | 'loras' | 'sampler' }> = ({ options, updateOptions, objectInfo, disabled, section = 'main' }) => {
    const [modelsOpen, setModelsOpen] = useState(false);
    const mode = options.comfyModelType === 'qwen21-turbo' ? 'turbo' : 't2i';
    const key = mode === 'turbo' ? 'comfyQwen21Turbo' : 'comfyQwen21T2i';
    const settings = options[key] || defaultQwen21Settings(mode);
    const update = (change: Partial<Qwen21Settings>) => updateOptions({ [key]: { ...settings, ...change } });
    const choices = (node: string, input: string, selected: string, empty = false) => {
        const available = getQwen21Choices(objectInfo, node, input);
        return [...new Set([...(empty ? [''] : []), selected, ...available])].map(value => ({ value, label: value || 'None' }));
    };
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
        <button type="button" onClick={() => setModelsOpen(open => !open)} aria-expanded={modelsOpen}
            className={`w-full rounded-md border px-4 py-2 text-sm font-bold transition-colors ${modelsOpen ? 'border-accent text-accent' : 'border-border-primary bg-bg-tertiary text-text-secondary hover:border-accent hover:text-text-primary'}`}>
            Models &amp; CLIP {modelsOpen ? '-' : '+'}
        </button>
        {modelsOpen && <div className="space-y-4 rounded-md border border-border-primary bg-bg-tertiary p-3">
            <SelectInput label="Diffusion Model" value={settings.unet} options={choices('UNETLoader', 'unet_name', settings.unet)} onChange={event => update({ unet: event.target.value })} disabled={disabled} />
            <SelectInput label="CLIP" value={settings.clip} options={choices('CLIPLoader', 'clip_name', settings.clip)} onChange={event => update({ clip: event.target.value })} disabled={disabled} />
            <SelectInput label="VAE" value={settings.vae} options={choices('VAELoader', 'vae_name', settings.vae)} onChange={event => update({ vae: event.target.value })} disabled={disabled} />
            <SelectInput label="Attention" value={settings.attention} options={choices('ModelAttentionBackend', 'attention', settings.attention)} onChange={event => update({ attention: event.target.value })} disabled={disabled} />
        </div>}
        <TextInput label="Positive Prompt" value={settings.prompt} onChange={event => update({ prompt: event.target.value })} disabled={disabled} isTextArea />
        {mode === 't2i' && <TextInput label="Negative Prompt" value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} disabled={disabled} isTextArea />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectInput label="Orientation" value={settings.orientation} options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} onChange={event => update({ orientation: event.target.value as Qwen21Settings['orientation'] })} disabled={disabled} />
            <SelectInput label="Size" value={String(settings.sizeIndex)} options={sizeOptions} onChange={event => update({ sizeIndex: Number(event.target.value) })} disabled={disabled} />
        </div>
        </>}
        {section === 'loras' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {settings.loras.map((lora, index) => <div key={index} className="space-y-3 border-b border-border-primary pb-3">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={lora.enabled} disabled={disabled} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, enabled: event.target.checked } : entry) })} className="h-4 w-4 accent-accent" />LoRA {index + 1}</label>
                <SelectInput label={`LoRA ${index + 1} Model`} value={lora.name} options={choices(objectInfo?.LoraLoaderModelOnly ? 'LoraLoaderModelOnly' : 'LoraLoader', 'lora_name', lora.name, true)} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, name: event.target.value, enabled: !!event.target.value } : entry) })} disabled={disabled} />
                {lora.name && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <NumberSlider label={`LoRA ${index + 1} Model Strength`} value={lora.modelStrength} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, modelStrength: Number(event.target.value) } : entry) })} min={-10} max={10} step={0.05} disabled={disabled || !lora.enabled} allowDirectInput />
                    <NumberSlider label={`LoRA ${index + 1} CLIP Strength`} value={lora.clipStrength} onChange={event => update({ loras: settings.loras.map((entry, position) => position === index ? { ...entry, clipStrength: Number(event.target.value) } : entry) })} min={-10} max={10} step={0.05} disabled={disabled || !lora.enabled} allowDirectInput />
                </div>}
            </div>)}
        </div>}
        {section === 'sampler' && <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectInput label="Sampler" value={settings.sampler} options={choices('KSamplerSelect', 'sampler_name', settings.sampler)} onChange={event => update({ sampler: event.target.value })} disabled={disabled} />
            <SelectInput label="Scheduler" value={settings.scheduler} options={choices('BasicScheduler', 'scheduler', settings.scheduler)} onChange={event => update({ scheduler: event.target.value })} disabled={disabled} />
        </div>
        <NumberSlider label={mode === 'turbo' ? 'BasicScheduler Steps' : 'Steps'} value={settings.steps} min={1} max={100} step={1} onChange={event => update({ steps: Number(event.target.value) })} disabled={disabled} allowDirectInput />
        {mode === 't2i' && <NumberSlider label="CFG" value={settings.cfg} min={0} max={20} step={0.1} onChange={event => update({ cfg: Number(event.target.value) })} disabled={disabled} allowDirectInput />}
        <label className="block space-y-2 text-sm font-medium">Seed<input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder="Random" value={options.comfySeed ?? ''} disabled={disabled} onChange={event => updateOptions({ comfySeed: event.target.value === '' ? undefined : Number(event.target.value) })} className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2" /></label>
        <SelectInput label="Seed Control" value={options.comfySeedControl || 'randomize'} options={['randomize', 'fixed', 'increment', 'decrement'].map(value => ({ value, label: value }))} onChange={event => updateOptions({ comfySeedControl: event.target.value as GenerationOptions['comfySeedControl'] })} disabled={disabled} />
        {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && <NumberSlider label="Seed Increment" value={options.comfySeedIncrement || 1} min={1} max={100} step={1} onChange={event => updateOptions({ comfySeedIncrement: Number(event.target.value) })} disabled={disabled} allowDirectInput />}
        </>}
    </div>;
};