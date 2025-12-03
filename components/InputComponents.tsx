import React, { ChangeEvent } from 'react';

export const SelectInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, options: { value: string, label: string }[], disabled?: boolean, className?: string, selectClassName?: string }> =
    ({ label, value, onChange, options, disabled, className, selectClassName }) => (
        <div className={className}>
            <label className="block text-sm font-medium text-text-secondary">{label}</label>
            <select value={value} onChange={onChange} disabled={disabled} className={`mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent ${selectClassName || ''}`}>
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>
    );

export const TextInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, placeholder?: string, disabled?: boolean, isTextArea?: boolean, rows?: number, tooltip?: string }> =
    ({ label, value, onChange, placeholder, disabled, isTextArea, rows = 3, tooltip }) => (
        <div className="relative">
            <label className="block text-sm font-medium text-text-secondary" title={tooltip}>{label}</label>
            {isTextArea ? (
                <textarea value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} rows={rows} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
            ) : (
                <input type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent disabled:opacity-50" />
            )}
        </div>
    );

export const CheckboxSlider: React.FC<{
    label: string;
    isChecked: boolean;
    onCheckboxChange: (e: ChangeEvent<HTMLInputElement>) => void;
    sliderValue: number;
    onSliderChange: (e: ChangeEvent<HTMLInputElement>) => void;
    min: number; max: number; step: number;
    disabled?: boolean;
    sliderLabel?: string;
}> = ({ label, isChecked, onCheckboxChange, sliderValue, onSliderChange, min, max, step, disabled, sliderLabel }) => (
    <div>
        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
            <input type="checkbox" checked={isChecked} onChange={onCheckboxChange} disabled={disabled} className="rounded text-accent focus:ring-accent" />
            {label} {isChecked && sliderLabel && `(${sliderValue})`}
        </label>
        {isChecked && (
            <>
                {sliderLabel && <label className="block text-xs font-medium text-text-muted mt-2">{sliderLabel}: {sliderValue}</label>}
                <input
                    type="range"
                    min={min} max={max} step={step}
                    value={sliderValue}
                    onChange={onSliderChange}
                    disabled={disabled}
                    className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                />
            </>
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
    className?: string
}> = ({ label, value, onChange, min, max, step, disabled, className }) => (
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
        </div>
    </div>
);
