import React from 'react';
import { Select } from './ui/Select';

interface MenuSelectOption<T extends string | number> {
    value: T;
    label: string;
}

interface MenuSelectProps<T extends string | number> {
    value: T;
    options: readonly MenuSelectOption<T>[];
    onChange: (value: NoInfer<T>) => void;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}

export const MenuSelect = <T extends string | number,>({ value, options, onChange, disabled = false, ariaLabel, className = '' }: MenuSelectProps<T>) =>
    <Select variant="search" value={value} options={options} onChange={next => onChange(next)} disabled={disabled} ariaLabel={ariaLabel} className={`relative min-w-0 ${className}`} />;