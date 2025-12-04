import React, { ChangeEvent, useMemo } from 'react';
import { GenerationOptions } from '../types';
import { NumberSlider, SelectInput, TextInput } from './InputComponents';

interface SamplerSettingsPanelProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    isDisabled: boolean;
    comfyUIObjectInfo: any;
}

// Helper function to safely extract model lists from ComfyUI's object_info
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
    const handleSliderChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(e.target.value) });
    };

    const handleOptionChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        updateOptions({ [field]: e.target.value });
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

    // Only show for SDXL, SD1.5, FLUX
    if (modelType !== 'sdxl' && modelType !== 'sd1.5' && modelType !== 'flux') {
        return null;
    }

    return (
        <div className="bg-bg-secondary p-4 rounded-lg shadow-md border border-border-primary space-y-4">
            <h3 className="text-md font-bold text-accent tracking-wider uppercase border-b border-accent/30 pb-2">Sampler Settings</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberSlider
                    label={`Steps: ${options.comfySteps || 25}`}
                    value={options.comfySteps || 25}
                    onChange={handleSliderChange('comfySteps')}
                    min={5} max={100} step={1}
                    disabled={isDisabled}
                />
                <NumberSlider
                    label={`CFG Scale: ${options.comfyCfg || 7}`}
                    value={options.comfyCfg || 7}
                    onChange={handleSliderChange('comfyCfg')}
                    min={1} max={20} step={0.5}
                    disabled={isDisabled}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectInput
                    label="Sampler"
                    value={options.comfySampler || ''}
                    onChange={handleOptionChange('comfySampler')}
                    options={comfySamplers.map(s => ({ value: s, label: s }))}
                    disabled={isDisabled}
                />
                <SelectInput
                    label="Scheduler"
                    value={options.comfyScheduler || ''}
                    onChange={handleOptionChange('comfyScheduler')}
                    options={comfySchedulers.map(s => ({ value: s, label: s }))}
                    disabled={isDisabled}
                />
            </div>

            {modelType === 'flux' && (
                <NumberSlider
                    label={`FLUX Guidance: ${options.comfyFluxGuidance || 2.0}`}
                    value={options.comfyFluxGuidance || 2.0}
                    onChange={handleSliderChange('comfyFluxGuidance')}
                    min={0} max={10} step={0.1}
                    disabled={isDisabled}
                />
            )}

            {(modelType === 'sd1.5' || modelType === 'sdxl' || modelType === 'flux') && (
                <div className="pt-2 border-t border-border-primary/50">
                    <h4 className="text-md font-semibold text-text-secondary mb-2">Seed</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <SelectInput
                            label="Control"
                            value={options.comfySeedControl || 'randomize'}
                            onChange={handleOptionChange('comfySeedControl')}
                            options={[{ value: 'fixed', label: 'Fixed' }, { value: 'increment', label: 'Increment' }, { value: 'decrement', label: 'Decrement' }, { value: 'randomize', label: 'Randomize' }]}
                            disabled={isDisabled}
                        />
                        <TextInput
                            label="Seed Value"
                            value={options.comfySeed?.toString() || ''}
                            onChange={(e) => updateOptions({ comfySeed: parseInt(e.target.value) || undefined })}
                            placeholder="Random"
                            disabled={isDisabled}
                        />
                    </div>
                    {options.comfySeedControl === 'increment' && (
                        <NumberSlider
                            label={`Increment By: ${options.comfySeedIncrement || 1}`}
                            value={options.comfySeedIncrement || 1}
                            onChange={handleSliderChange('comfySeedIncrement')}
                            min={1} max={100} step={1}
                            disabled={isDisabled}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
