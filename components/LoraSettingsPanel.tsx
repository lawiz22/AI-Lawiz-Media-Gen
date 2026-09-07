import React, { ChangeEvent, useMemo, useState } from 'react';
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
    const [isOpen, setIsOpen] = useState(true);
    const handleSliderChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(e.target.value) });
    };

    const handleOptionChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        if (options.comfyModelType === 'qwen-t2i-gguf' && field === 'comfyQwenUseLora') {
            updateOptions({ comfyQwenUseLora: Boolean(value), comfySteps: 4, comfyCfg: 1 });
            return;
        }
        if (options.comfyModelType === 'qwen-t2i-gguf' && field === 'comfyQwenLora1Name') {
            const loraName = String(value);
            updateOptions({ comfyQwenLora1Name: loraName, comfySteps: 4, comfyCfg: 1 });
            return;
        }
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
        } else if (options.comfyModelType === 'qwen-t2i-gguf' || options.comfyModelType === 'qwen-edit') {
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
        } else if (options.comfyModelType === 'flux2-simple') {
            const queries = ['flux2', 'flux-2', 'klein'];
            return availableLoras.filter(lora => queries.some(query => lora.toLowerCase().includes(query)));
        } else if (options.comfyModelType === 'krea2-simple') {
            return availableLoras.filter(lora => lora.toLowerCase().includes('krea'));
        }
        return [];
    }, [availableLoras, options.comfyModelType]);

    const loraSlotCount = options.comfyModelType === 'qwen-edit' ? 5 : options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'flux2-simple' ? 6 : 4;
    const loraOptions = useMemo(() => {
        const configured = Array.from({ length: loraSlotCount }, (_, index) => {
            const prefix = options.comfyModelType === 'sd1.5' ? 'comfySd15'
                : options.comfyModelType === 'sdxl' ? 'comfySdxl'
                    : options.comfyModelType === 'flux' ? 'comfyFlux'
                        : options.comfyModelType === 'qwen-edit' ? 'comfyQwenEdit'
                            : options.comfyModelType === 'qwen-t2i-gguf' ? 'comfyQwen'
                                : options.comfyModelType === 'z-image' ? 'comfyZImage'
                                    : options.comfyModelType === 'krea2-simple' ? 'comfyKrea'
                                        : options.comfyModelType === 'flux2-simple' ? 'comfyFlux2'
                                            : '';
            return prefix ? options[`${prefix}Lora${index + 1}Name` as keyof GenerationOptions] as string : '';
        });
        const values = Array.from(new Set([...configured, ...filteredLoras].filter(Boolean)));
        return [{ value: '', label: 'None' }, ...values.map(lora => ({ value: lora, label: lora }))];
    }, [filteredLoras, loraSlotCount, options]);

    if (options.comfyModelType !== 'sd1.5' && options.comfyModelType !== 'sdxl' && options.comfyModelType !== 'flux' && options.comfyModelType !== 'qwen-t2i-gguf' && options.comfyModelType !== 'qwen-edit' && options.comfyModelType !== 'z-image' && options.comfyModelType !== 'flux2-simple' && options.comfyModelType !== 'krea2-simple') {
        return null;
    }

    const isSdxl = options.comfyModelType === 'sdxl';
    const isFlux = options.comfyModelType === 'flux';
    const isQwen = options.comfyModelType === 'qwen-t2i-gguf';
    const isQwenEdit = options.comfyModelType === 'qwen-edit';
    const isZImage = options.comfyModelType === 'z-image';
    const isFlux2 = options.comfyModelType === 'flux2-simple';
    const isKrea = options.comfyModelType === 'krea2-simple';

    let prefix = 'comfySd15';
    let title = 'LoRA Settings (SD 1.5)';

    if (isSdxl) {
        prefix = 'comfySdxl';
        title = 'LoRA Settings (SDXL)';
    } else if (isFlux) {
        prefix = 'comfyFlux';
        title = 'LoRA Settings (Flux)';
    } else if (isQwenEdit) {
        prefix = 'comfyQwenEdit';
        title = 'LoRA Settings (Qwen Edit)';
    } else if (isQwen) {
        prefix = 'comfyQwen';
        title = 'LoRA Settings (Qwen)';
    } else if (isZImage) {
        prefix = 'comfyZImage';
        title = 'LoRA Settings (Z-Image)';
    } else if (isFlux2) {
        prefix = 'comfyFlux2';
        title = 'LoRA Settings (FLUX2 Simple)';
    } else if (isKrea) {
        prefix = 'comfyKrea';
        title = 'LoRA Settings (KREA2 Simple)';
    }

    return (
        <div className="rounded-lg border border-border-primary bg-bg-secondary p-4 shadow-md">
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between border-b border-accent/30 pb-2 text-left text-md font-bold uppercase tracking-wider text-accent"
            >
                <span>{title}</span>
                <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!options[`${prefix}UseLora` as keyof GenerationOptions]}
                    onChange={handleOptionChange(`${prefix}UseLora` as keyof GenerationOptions)}
                    disabled={isDisabled}
                    className="rounded text-accent focus:ring-accent w-4 h-4"
                />
                <label className="text-sm font-medium text-text-secondary">Enable LoRAs</label>
            </div>

            {options[`${prefix}UseLora` as keyof GenerationOptions] && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: loraSlotCount }, (_, index) => index + 1).map(index => {
                        const nameField = `${prefix}Lora${index}Name` as keyof GenerationOptions;
                        const strengthField = `${prefix}Lora${index}Strength` as keyof GenerationOptions;

                        const currentName = options[nameField] as string || '';
                        const currentStrength = options[strengthField] as number || 1.0;

                        return (
                            <div key={index} className="flex flex-col gap-3 rounded-md border border-border-primary/50 bg-bg-tertiary p-3">
                                <SelectInput
                                    label={`LoRA ${index}`}
                                    value={currentName}
                                    onChange={handleOptionChange(nameField)}
                                    options={loraOptions}
                                    disabled={isDisabled}
                                />
                                {currentName && (
                                    <NumberSlider
                                        label={`Str: ${currentStrength}`}
                                        value={currentStrength}
                                        onChange={handleSliderChange(strengthField)}
                                        min={0} max={2} step={0.1}
                                        disabled={isDisabled}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            </div>}
        </div>
    );
};
