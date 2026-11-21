import React, { ChangeEvent, useMemo } from 'react';
import { GenerationOptions } from '../types';
import { NumberSlider } from './InputComponents';
import { Accordion } from './ui/Accordion';
import { Select } from './ui/Select';
import { familyFiles, flux2Family } from '../services/styleLibrary';
import type { CivitaiFamily } from '../services/civitaiService';
import { useModelInventory } from './useModelInventory';
import { Qwen21SettingsPanel } from './Qwen21SettingsPanel';
import { MossSettingsPanel } from './MossSettingsPanel';
import { Krea2EditSettingsPanel } from './Krea2EditSettingsPanel';
import { ImageStyleControl } from './ImageStyleControl';
import type { H3ObjectInfo } from '../services/minimaxH3Workflow';

interface LoraSettingsPanelProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    isDisabled: boolean;
    availableLoras: string[];
    comfyUIObjectInfo?: H3ObjectInfo | null;
}

export const LoraSettingsPanel: React.FC<LoraSettingsPanelProps> = ({
    options,
    updateOptions,
    isDisabled,
    availableLoras,
    comfyUIObjectInfo
}) => {
    const handleSliderChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement>) => {
        updateOptions({ [field]: parseFloat(e.target.value) });
    };

    const setOption = (field: keyof GenerationOptions, value: string | boolean) => {
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
    const handleOptionChange = (field: keyof GenerationOptions) => (e: ChangeEvent<HTMLInputElement>) => setOption(field, e.target.type === 'checkbox' ? e.target.checked : e.target.value);

    const { inventory } = useModelInventory();
    const filteredLoras = useMemo(() => {
        const family = ({
            'sd1.5': 'sd15', sdxl: 'sdxl', 'qwen-t2i-gguf': 'qwen', 'qwen-edit': 'qwen-edit', 'z-image': 'zit-base',
            'flux2-simple': flux2Family(options.comfyFlux2Unet), 'krea2-simple': 'krea2', 'krea2-raw': 'krea2',
        } as Partial<Record<string, CivitaiFamily>>)[options.comfyModelType || ''];
        return family ? familyFiles(availableLoras, family, inventory) : [];
    }, [availableLoras, inventory, options.comfyModelType, options.comfyFlux2Unet]);

    const loraSlotCount = options.comfyModelType === 'qwen-edit' ? 5 : options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw' || options.comfyModelType === 'flux2-simple' ? 6 : 4;
    const loraOptions = useMemo(() => {
        const configured = Array.from({ length: loraSlotCount }, (_, index) => {
            const prefix = options.comfyModelType === 'sd1.5' ? 'comfySd15'
                : options.comfyModelType === 'sdxl' ? 'comfySdxl'
                    : options.comfyModelType === 'qwen-edit' ? 'comfyQwenEdit'
                        : options.comfyModelType === 'qwen-t2i-gguf' ? 'comfyQwen'
                            : options.comfyModelType === 'z-image' ? 'comfyZImage'
                                : options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw' ? 'comfyKrea'
                                    : options.comfyModelType === 'flux2-simple' ? 'comfyFlux2'
                                        : '';
            return prefix ? options[`${prefix}Lora${index + 1}Name` as keyof GenerationOptions] as string : '';
        });
        const values = Array.from(new Set([...configured, ...filteredLoras].filter(Boolean)));
        return [{ value: '', label: 'None' }, ...values.map(lora => ({ value: lora, label: lora }))];
    }, [filteredLoras, loraSlotCount, options]);

    const isQwen21 = options.comfyModelType === 'qwen21-t2i' || options.comfyModelType === 'qwen21-turbo';
    if (options.comfyModelType === 'krea2-edit') return <Accordion title="LoRAs" defaultOpen>
        <Krea2EditSettingsPanel section="loras" options={options} updateOptions={updateOptions} availableLoras={availableLoras} disabled={isDisabled} />
    </Accordion>;
    if (options.comfyModelType === 'moss-image') return <Accordion title="LoRAs" defaultOpen>
        <MossSettingsPanel section="loras" options={options} updateOptions={updateOptions} availableLoras={availableLoras} disabled={isDisabled} />
    </Accordion>;
    if (!isQwen21 && options.comfyModelType !== 'sd1.5' && options.comfyModelType !== 'sdxl' && options.comfyModelType !== 'qwen-t2i-gguf' && options.comfyModelType !== 'qwen-edit' && options.comfyModelType !== 'z-image' && options.comfyModelType !== 'flux2-simple' && options.comfyModelType !== 'krea2-simple' && options.comfyModelType !== 'krea2-raw') {
        return null;
    }

    const isSdxl = options.comfyModelType === 'sdxl';
    const isQwen = options.comfyModelType === 'qwen-t2i-gguf';
    const isQwenEdit = options.comfyModelType === 'qwen-edit';
    const isZImage = options.comfyModelType === 'z-image';
    const isFlux2 = options.comfyModelType === 'flux2-simple';
    const isKrea = options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw';

    let prefix = 'comfySd15';

    if (isSdxl) {
        prefix = 'comfySdxl';
    } else if (isQwenEdit) {
        prefix = 'comfyQwenEdit';
    } else if (isQwen) {
        prefix = 'comfyQwen';
    } else if (isZImage) {
        prefix = 'comfyZImage';
    } else if (isFlux2) {
        prefix = 'comfyFlux2';
    } else if (isKrea) {
        prefix = 'comfyKrea';
    }

    return (
        <Accordion title="LoRAs" defaultOpen>
            {options.comfyModelType === 'krea2-simple' && <ImageStyleControl options={options} updateOptions={updateOptions} info={comfyUIObjectInfo || {}} disabled={isDisabled} mode="krea2-simple" showSamplingControl={false} />}
            {isQwen21 ? <Qwen21SettingsPanel section="loras" options={options} updateOptions={updateOptions} disabled={isDisabled}
                objectInfo={{ LoraLoaderModelOnly: { input: { required: { lora_name: [availableLoras] } } } }} /> : <>
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!options[`${prefix}UseLora` as keyof GenerationOptions]}
                    aria-label={options.comfyModelType === 'krea2-simple' ? 'Enable additional LoRAs' : 'Enable LoRAs'}
                    onChange={handleOptionChange(`${prefix}UseLora` as keyof GenerationOptions)}
                    disabled={isDisabled}
                    className="rounded text-accent focus:ring-accent w-4 h-4"
                />
                <label className="text-sm font-medium text-text-secondary">{options.comfyModelType === 'krea2-simple' ? 'Enable additional LoRAs' : 'Enable LoRAs'}</label>
            </div>

            {options[`${prefix}UseLora` as keyof GenerationOptions] && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {Array.from({ length: loraSlotCount }, (_, index) => index + 1).map(index => {
                        const nameField = `${prefix}Lora${index}Name` as keyof GenerationOptions;
                        const strengthField = `${prefix}Lora${index}Strength` as keyof GenerationOptions;

                        const currentName = options[nameField] as string || '';
                        const currentStrength = options[strengthField] as number | undefined ?? 1.0;

                        return (
                            <div key={index} className="flex flex-col gap-3 rounded-md border border-border-primary bg-bg-tertiary p-3">
                                <Select
                                    variant="search"
                                    label={`LoRA ${index}`}
                                    ariaLabel={`Image LoRA ${index}`}
                                    value={currentName}
                                    onChange={value => setOption(nameField, value)}
                                    options={loraOptions}
                                    disabled={isDisabled}
                                />
                                {currentName && (
                                    <NumberSlider
                                        label="Strength"
                                        value={currentStrength}
                                        onChange={handleSliderChange(strengthField)}
                                        min={-10} max={10} step={0.5}
                                        disabled={isDisabled}
                                        allowDirectInput
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            </>}
        </Accordion>
    );
};
