import React, { ChangeEvent, useEffect, useId, useState } from 'react';
import { Select } from './ui/Select';
import { PromptBox, type PromptKind } from './ui/PromptBox';
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
    const id = useId();
    const [customValue, setCustomValue] = useState<string | undefined>();
    const isCustom = customValue === value || (value !== '' && !options.includes(value));

    return <div className="min-w-0">
        <label htmlFor={id} className="block text-xs font-semibold text-text-secondary">{label}</label>
        <select
            id={id}
            aria-label={ariaLabel}
            value={isCustom ? '__custom__' : value}
            onChange={event => {
                if (event.target.value === '__custom__') setCustomValue(value);
                else {
                    setCustomValue(undefined);
                    onChange(event.target.value);
                }
            }}
            disabled={disabled}
            className="mt-1.5 block w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-sm text-text-primary focus:border-accent focus:ring-accent disabled:opacity-50"
        >
            <option value="">{emptyLabel}</option>
            {options.map(option => <option key={option} value={option}>{option}</option>)}
            <option value="__custom__">Custom...</option>
        </select>
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
            className="mt-2 block w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-3 text-sm text-text-primary focus:border-accent focus:ring-accent disabled:opacity-50"
        />}
    </div>;
};

export const EditableNumberInput: React.FC<{
    value: number;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    ariaLabel: string;
    className?: string;
}> = ({ value, onChange, min, max, step, disabled, ariaLabel, className }) => {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => setDraft(String(value)), [value]);

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const parsed = Number(nextDraft);
        if (nextDraft === '' || nextDraft === '-' || !Number.isFinite(parsed) || parsed < min || parsed > max) return;
        onChange(event);
    };

    const restoreValidValue = () => {
        const parsed = Number(draft);
        if (draft === '' || draft === '-' || !Number.isFinite(parsed) || parsed < min || parsed > max) {
            setDraft(String(value));
        }
    };

    return <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={handleChange}
        onBlur={restoreValidValue}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className || 'w-20 rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:ring-accent disabled:opacity-50'}
    />;
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
}> = ({ label, isChecked, onCheckboxChange, sliderValue, onSliderChange, min, max, step, disabled, sliderLabel, allowDirectInput = false }) => (
    <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
            <input type="checkbox" checked={isChecked} onChange={onCheckboxChange} disabled={disabled} className="rounded text-accent focus:ring-accent" />
            {label} {isChecked && sliderLabel && `(${sliderValue})`}
        </label>
        {isChecked && (
            <div className="mt-2 flex items-center gap-2">
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={sliderValue}
                    onChange={onSliderChange}
                    disabled={disabled}
                    aria-label={sliderLabel || `${label} value`}
                    className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                />
                {allowDirectInput && <EditableNumberInput
                    value={sliderValue}
                    onChange={onSliderChange}
                    min={min} max={max} step={step}
                    disabled={disabled}
                    ariaLabel={`${sliderLabel || label} numeric value`}
                />}
            </div>
        )}
    </div>
);

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
}> = ({ label, value, onChange, min, max, step, disabled, className, allowDirectInput = false }) => (
    <div className={className}>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                disabled={disabled}
                className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
            />
            {allowDirectInput && <EditableNumberInput
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                disabled={disabled}
                ariaLabel={`${label} numeric value`}
            />}
        </div>
    </div>
);
