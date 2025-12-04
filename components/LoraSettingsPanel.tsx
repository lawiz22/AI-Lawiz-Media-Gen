import React, { ChangeEvent, useMemo } from 'react';
import { GenerationOptions } from '../types';
import { NumberSlider, SelectInput, CheckboxSlider } from './InputComponents';

interface LoraSettingsPanelProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    isDisabled: boolean;
    availableLoras: string[];
}

export const LoraSettingsPanel: React.FC<LoraSettingsPanelProps> = ({
    options,
    updateOptions,
    isDisabled,
    availableLoras
}) => {
    const handleSliderChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(e.target.value) });
    };

    const handleOptionChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        updateOptions({ [field]: value });
    };

    // Filter LoRAs based on model type
    const filteredLoras = useMemo(() => {
        if (options.comfyModelType === 'sd1.5') {
            const lowerQuery = "sd 15";
            const altQuery = "sd15";
            const altQuery2 = "sd_15";
            return availableLoras.filter(lora => {
                const lowerName = lora.toLowerCase();
                return lowerName.includes(lowerQuery) || lowerName.includes(altQuery) || lowerName.includes(altQuery2);
            });
        } else if (options.comfyModelType === 'sdxl') {
            const lowerQuery = "sdxl";
            const altQuery = "xl";
            return availableLoras.filter(lora => {
                const lowerName = lora.toLowerCase();
                return lowerName.includes(lowerQuery) || lowerName.includes(altQuery);
            });
        } else if (options.comfyModelType === 'flux') {
            const lowerQuery = "flux";
            return availableLoras.filter(lora => {
                const lowerName = lora.toLowerCase();
                return lowerName.includes(lowerQuery);
            });
        } else if (options.comfyModelType === 'qwen-t2i-gguf') {
            const lowerQuery = "qwen";
            return availableLoras.filter(lora => {
                const lowerName = lora.toLowerCase();
                return lowerName.includes(lowerQuery);
            });
        } else if (options.comfyModelType === 'z-image') {
            const queries = ["z-image", "z_image", "zit"];
            return availableLoras.filter(lora => {
                const lowerName = lora.toLowerCase();
                return queries.some(q => lowerName.includes(q));
            });
        }
        return [];
    }, [availableLoras, options.comfyModelType]);

    const loraOptions = useMemo(() => {
        return [{ value: '', label: 'None' }, ...filteredLoras.map(l => ({ value: l, label: l }))];
    }, [filteredLoras]);

    if (options.comfyModelType !== 'sd1.5' && options.comfyModelType !== 'sdxl' && options.comfyModelType !== 'flux' && options.comfyModelType !== 'qwen-t2i-gguf' && options.comfyModelType !== 'z-image') {
        return null;
    }

    const isSdxl = options.comfyModelType === 'sdxl';
    const isFlux = options.comfyModelType === 'flux';
    const isQwen = options.comfyModelType === 'qwen-t2i-gguf';
    const isZImage = options.comfyModelType === 'z-image';

    let prefix = 'comfySd15';
    let title = 'LoRA Settings (SD 1.5)';

    if (isSdxl) {
        prefix = 'comfySdxl';
        title = 'LoRA Settings (SDXL)';
    } else if (isFlux) {
        prefix = 'comfyFlux';
        title = 'LoRA Settings (Flux)';
    } else if (isQwen) {
        prefix = 'comfyQwen';
        title = 'LoRA Settings (Qwen)';
    } else if (isZImage) {
        prefix = 'comfyZImage';
        title = 'LoRA Settings (Z-Image)';
    }

    return (
        <div className="bg-bg-secondary p-3 rounded-lg shadow-md border border-border-primary space-y-2">
            <h3 className="text-xs font-bold text-accent tracking-wider uppercase border-b border-accent/30 pb-1">{title}</h3>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!options[`${prefix}UseLora` as keyof GenerationOptions]}
                    onChange={handleOptionChange(`${prefix}UseLora` as keyof GenerationOptions)}
                    disabled={isDisabled}
                    className="rounded text-accent focus:ring-accent w-4 h-4"
                />
                <label className="text-xs font-medium text-text-secondary">Enable LoRAs</label>
            </div>

            {options[`${prefix}UseLora` as keyof GenerationOptions] && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {[1, 2, 3, 4].map(index => {
                        const nameField = `${prefix}Lora${index}Name` as keyof GenerationOptions;
                        const strengthField = `${prefix}Lora${index}Strength` as keyof GenerationOptions;

                        const currentName = options[nameField] as string || '';
                        const currentStrength = options[strengthField] as number || 1.0;

                        return (
                            <div key={index} className="p-1.5 bg-bg-tertiary rounded border border-border-primary/50 flex flex-col gap-0.5">
                                <SelectInput
                                    label={`LoRA ${index}`}
                                    value={currentName}
                                    onChange={handleOptionChange(nameField)}
                                    options={loraOptions}
                                    disabled={isDisabled}
                                    className="mb-0.5"
                                    selectClassName="py-0.5 text-[10px] h-6"
                                />
                                {currentName && (
                                    <NumberSlider
                                        label={`Str: ${currentStrength}`}
                                        value={currentStrength}
                                        onChange={handleSliderChange(strengthField)}
                                        min={0} max={2} step={0.1}
                                        disabled={isDisabled}
                                        className="scale-90 origin-left"
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
