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

    // Filter LoRAs for SD 1.5 (case-insensitive "sd 15" check)
    const sd15Loras = useMemo(() => {
        const lowerQuery = "sd 15";
        const altQuery = "sd15";
        const altQuery2 = "sd_15";
        return availableLoras.filter(lora => {
            const lowerName = lora.toLowerCase();
            return lowerName.includes(lowerQuery) || lowerName.includes(altQuery) || lowerName.includes(altQuery2);
        });
    }, [availableLoras]);

    const loraOptions = useMemo(() => {
        return [{ value: '', label: 'None' }, ...sd15Loras.map(l => ({ value: l, label: l }))];
    }, [sd15Loras]);

    if (options.comfyModelType !== 'sd1.5') {
        return null;
    }

    return (
        <div className="bg-bg-secondary p-3 rounded-lg shadow-md border border-border-primary space-y-2">
            <h3 className="text-xs font-bold text-accent tracking-wider uppercase border-b border-accent/30 pb-1">LoRA Settings (SD 1.5)</h3>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!options.comfySd15UseLora}
                    onChange={handleOptionChange('comfySd15UseLora')}
                    disabled={isDisabled}
                    className="rounded text-accent focus:ring-accent w-4 h-4"
                />
                <label className="text-xs font-medium text-text-secondary">Enable LoRAs</label>
            </div>

            {options.comfySd15UseLora && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {[1, 2, 3, 4].map(index => {
                        const nameField = `comfySd15Lora${index}Name` as keyof GenerationOptions;
                        const strengthField = `comfySd15Lora${index}Strength` as keyof GenerationOptions;

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
