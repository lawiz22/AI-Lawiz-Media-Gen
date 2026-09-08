import React, { ChangeEvent, useMemo, useState } from 'react';
import { GenerationOptions } from '../types';
import { NumberSlider, SelectInput, TextInput } from './InputComponents';

interface SamplerSettingsPanelProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    isDisabled: boolean;
    comfyUIObjectInfo: any;
}

const getModelListFromInfo = (widgetInfo: any): string[] => {
    if (Array.isArray(widgetInfo) && Array.isArray(widgetInfo[0])) {
        return widgetInfo[0] || [];
    }
    return [];
};

export const SamplerSettingsPanel: React.FC<SamplerSettingsPanelProps> = ({
    options,
    updateOptions,
    isDisabled,
    comfyUIObjectInfo
}) => {
    const [isOpen, setIsOpen] = useState(true);
    const handleSliderChange = (field: keyof GenerationOptions) => (event: ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(event.target.value) });
    };
    const handleOptionChange = (field: keyof GenerationOptions) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        updateOptions({ [field]: event.target.value });
    };

    const comfySamplers = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.KSampler?.input?.required?.sampler_name);
        return list.length ? list : getModelListFromInfo(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    }, [comfyUIObjectInfo]);
    const comfySchedulers = useMemo(() => {
        const list = getModelListFromInfo(comfyUIObjectInfo?.KSampler?.input?.required?.scheduler);
        return list.length ? list : getModelListFromInfo(comfyUIObjectInfo?.BasicScheduler?.input?.required?.scheduler);
    }, [comfyUIObjectInfo]);

    const modelType = options.comfyModelType;
    const supportedModels = ['sdxl', 'sd1.5', 'flux', 'qwen-t2i-gguf', 'qwen-edit', 'z-image', 'flux2-simple', 'krea2-simple', 'krea2-raw'];
    if (!modelType || !supportedModels.includes(modelType)) return null;

    const samplerOptions = Array.from(new Set([options.comfySampler, ...comfySamplers].filter(Boolean) as string[]));
    const schedulerOptions = Array.from(new Set([options.comfyScheduler, ...comfySchedulers].filter(Boolean) as string[]));
    const isKreaRaw = modelType === 'krea2-raw';

    return (
        <div className="rounded-lg border border-border-primary bg-bg-secondary p-4 shadow-md">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between border-b border-accent/30 pb-2 text-left text-md font-bold uppercase tracking-wider text-accent"
            >
                <span>Sampler Settings</span>
                <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && <div className="mt-4 space-y-4">
                {isKreaRaw ? (
                    <p className="text-xs text-text-secondary">RAW sampler stages use the fixed settings from the source workflow.</p>
                ) : <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <NumberSlider label={`Steps: ${options.comfySteps || 25}`} value={options.comfySteps || 25} onChange={handleSliderChange('comfySteps')} min={1} max={100} step={1} disabled={isDisabled} />
                        <NumberSlider label={`CFG Scale: ${options.comfyCfg || 7}`} value={options.comfyCfg || 7} onChange={handleSliderChange('comfyCfg')} min={1} max={20} step={0.5} disabled={isDisabled} />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={samplerOptions.map(value => ({ value, label: value }))} disabled={isDisabled} />
                        {modelType !== 'flux2-simple' && <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={schedulerOptions.map(value => ({ value, label: value }))} disabled={isDisabled} />}
                    </div>
                    {modelType === 'flux' && <NumberSlider label={`FLUX Guidance: ${options.comfyFluxGuidance || 2}`} value={options.comfyFluxGuidance || 2} onChange={handleSliderChange('comfyFluxGuidance')} min={0} max={10} step={0.1} disabled={isDisabled} />}
                </>}

                <div className="border-t border-border-primary/50 pt-2">
                    <h4 className="mb-2 text-md font-semibold text-text-secondary">Seed</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <SelectInput label="Control" value={options.comfySeedControl || 'randomize'} onChange={handleOptionChange('comfySeedControl')} options={[{ value: 'fixed', label: 'Fixed' }, { value: 'increment', label: 'Increment' }, { value: 'decrement', label: 'Decrement' }, { value: 'randomize', label: 'Randomize' }]} disabled={isDisabled} />
                        <TextInput label="Seed Value" value={options.comfySeed?.toString() || ''} onChange={event => updateOptions({ comfySeed: parseInt(event.target.value) || undefined })} placeholder="Random" disabled={isDisabled} />
                    </div>
                    {options.comfySeedControl === 'increment' && <NumberSlider label={`Increment By: ${options.comfySeedIncrement || 1}`} value={options.comfySeedIncrement || 1} onChange={handleSliderChange('comfySeedIncrement')} min={1} max={100} step={1} disabled={isDisabled} />}
                </div>
            </div>}
        </div>
    );
};
