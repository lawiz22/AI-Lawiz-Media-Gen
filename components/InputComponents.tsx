import React, { ChangeEvent, useId, useState } from 'react';
import { Select } from './ui/Select';
import { PromptBox, type PromptKind } from './ui/PromptBox';
import { NumberField } from './ui/fields';
import { ui } from './ui/styles';

export const PresetTextInput: React.FC<{
    label: string;
    ariaLabel: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
    disabled?: boolean;
    emptyLabel?: string;
}> = ({ label, ariaLabel, value, options, onChange, disabled, emptyLabel = 'Default (nothing)' }) => {
    const [customValue, setCustomValue] = useState<string | undefined>();
    const isCustom = customValue === value || (value !== '' && !options.includes(value));

    return <div className="min-w-0">
        <Select<string> label={label} ariaLabel={ariaLabel} value={isCustom ? '__custom__' : value} disabled={disabled}
            options={[{ value: '', label: emptyLabel }, ...options.map(option => ({ value: option, label: option })), { value: '__custom__', label: 'Custom...' }]}
            onChange={next => {
                if (next === '__custom__') setCustomValue(value);
                else {
                    setCustomValue(undefined);
                    onChange(next);
                }
            }} />
        {isCustom && <input
            type="text"
            aria-label={`Custom ${ariaLabel}`}
            value={value}
            onChange={event => {
                setCustomValue(event.target.value);
                onChange(event.target.value);
            }}
            placeholder={`Enter a custom ${label.toLowerCase()}`}
            disabled={disabled}
            className={`mt-2 block ${ui.control}`}
        />}
    </div>;
};

export const SelectInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, options: { value: string, label: string, disabled?: boolean }[], disabled?: boolean, className?: string, selectClassName?: string }> =
    ({ label, value, onChange, options, disabled, className, selectClassName }) =>
        <Select label={label} value={value} options={options} disabled={disabled} className={className} controlClassName={selectClassName}
            onChange={(_, event) => { if (event) onChange(event); }} />;

const promptKind = (label: string): PromptKind => /negative/i.test(label) ? 'negative' : /prompt|positive/i.test(label) ? 'positive' : /instruction/i.test(label) ? 'instruction' : 'neutral';

export const TextInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, placeholder?: string, disabled?: boolean, isTextArea?: boolean, rows?: number, tooltip?: string }> =
    ({ label, value, onChange, placeholder, disabled, isTextArea, rows = 3, tooltip }) => {
        const id = useId();
        if (isTextArea) return <PromptBox className="relative" label={label} title={tooltip} kind={promptKind(label)} highlight={false} value={value} rows={rows}
            placeholder={placeholder} disabled={disabled} onChange={(_, event) => { if (event) onChange(event); }} />;
        return <div className="relative">
            <label htmlFor={id} className={ui.label} title={tooltip}>{label}</label>
            <input id={id} type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className={`mt-1 block ${ui.control}`} />
        </div>;
    };

export const CheckboxSlider: React.FC<{
    label: string;
    isChecked: boolean;
    onCheckboxChange: (e: ChangeEvent<HTMLInputElement>) => void;
    sliderValue: number;
    onSliderChange: (e: ChangeEvent<HTMLInputElement>) => void;
    min: number; max: number; step: number;
    disabled?: boolean;
    sliderLabel?: string;
    allowDirectInput?: boolean;
}> = ({ label, isChecked, onCheckboxChange, sliderValue, onSliderChange, min, max, step, disabled, sliderLabel }) => (
    <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
            <input type="checkbox" checked={isChecked} onChange={onCheckboxChange} disabled={disabled} className="rounded text-accent focus:ring-accent" />
            {label}
        </label>
        {isChecked && <NumberField slider className="mt-2" label={sliderLabel || `${label} value`} value={sliderValue} min={min} max={max} step={step} disabled={disabled}
            onChange={(_, event) => { if (event) onSliderChange(event); }} />}
    </div>
);

// Older callers put the value in the label; the field beside the slider shows it now.
const withoutValue = (label: string, value: number) => label.endsWith(`: ${value}`) ? label.slice(0, -`: ${value}`.length) : label;

export const NumberSlider: React.FC<{
    label: string,
    value: number,
    onChange: (e: ChangeEvent<HTMLInputElement>) => void,
    min: number,
    max: number,
    step: number,
    disabled?: boolean,
    className?: string,
    allowDirectInput?: boolean
}> = ({ label, value, onChange, min, max, step, disabled, className }) =>
    <NumberField slider className={className} label={withoutValue(label, value)} value={value} min={min} max={max} step={step} disabled={disabled}
        onChange={(_, event) => { if (event) onChange(event); }} />;
