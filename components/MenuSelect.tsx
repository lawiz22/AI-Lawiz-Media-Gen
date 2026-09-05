import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon } from './icons';

interface MenuSelectOption<T extends string | number> {
    value: T;
    label: string;
}

interface MenuSelectProps<T extends string | number> {
    value: T;
    options: readonly MenuSelectOption<T>[];
    onChange: (value: T) => void;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}

export const MenuSelect = <T extends string | number,>({ value, options, onChange, disabled = false, ariaLabel, className = '' }: MenuSelectProps<T>) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = options.find(option => option.value === value) || options[0];

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div ref={rootRef} className={`relative min-w-0 ${className}`}>
            <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)} className="w-full min-w-0 flex items-center justify-between gap-2 bg-bg-tertiary border border-border-primary rounded-md px-3 py-2 text-left text-sm text-text-primary disabled:opacity-50">
                <span className="truncate">{selected?.label || String(value)}</span>
                <span aria-hidden="true" className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {open && !disabled && <div role="listbox" aria-label={ariaLabel} className="absolute z-[80] left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-md border border-border-primary bg-bg-secondary shadow-xl">
                {options.map(option => <button key={String(option.value)} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); }} className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg-tertiary ${option.value === value ? 'text-accent font-semibold' : 'text-text-primary'}`}><span className="truncate">{option.label}</span>{option.value === value && <CheckIcon className="w-4 h-4 shrink-0" />}</button>)}
            </div>}
        </div>
    );
};