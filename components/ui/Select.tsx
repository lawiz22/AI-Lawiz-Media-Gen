import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ui } from './styles';

export interface SelectOption<T extends string | number = string> { value: T; label: string; disabled?: boolean }
export interface SelectProps<T extends string | number = string> {
    value: T;
    options: readonly (T | SelectOption<T>)[];
    onChange: (value: T, event?: ChangeEvent<HTMLSelectElement>) => void;
    /** native: short fixed lists. search: long lists such as models, LoRAs and samplers. */
    variant?: 'native' | 'search';
    label?: string;
    ariaLabel?: string;
    disabled?: boolean;
    /** Shown when the value is empty and is not one of the options. */
    placeholder?: string;
    hint?: React.ReactNode;
    error?: React.ReactNode;
    className?: string;
    controlClassName?: string;
    labelClassName?: string;
}
interface Item<T extends string | number> extends SelectOption<T> { missing?: boolean }
interface ControlProps<T extends string | number> {
    id: string; name?: string; items: Item<T>[]; value: T; disabled?: boolean; className: string;
    onChange: SelectProps<T>['onChange'];
}

const VISIBLE_ROWS = 8, OVERSCAN = 6;
const ACCENT_VARIABLES = ['--color-accent', '--color-accent-light', '--color-accent-lighter', '--color-accent-hover'];
const same = (left: string | number, right: string | number) => String(left) === String(right);

export const selectItems = <T extends string | number>(options: readonly (T | SelectOption<T>)[], value: T, placeholder = 'Select...'): Item<T>[] => {
    const items: Item<T>[] = options.map(option => typeof option === 'object' ? option : { value: option, label: String(option) });
    if (items.some(item => same(item.value, value))) return items;
    // A value missing from the list stays visible; the control never pretends the first option is selected.
    const blank = value === '' || value === 0;
    return [{ value, label: blank ? placeholder : `${value} (not listed)`, disabled: blank, missing: true }, ...items];
};

const NativeSelect = <T extends string | number>({ id, name, items, value, disabled, className, onChange }: ControlProps<T>) =>
    <select aria-label={name} id={id} value={String(value)} disabled={disabled} className={`block ${className}`}
        onChange={event => {
            const item = items.find(candidate => String(candidate.value) === event.target.value);
            if (item) onChange(item.value, event);
        }}>
        {items.map((item, index) => <option key={index} value={String(item.value)} disabled={item.disabled}>{item.label}</option>)}
    </select>;

const SearchSelect = <T extends string | number>({ id, name, items, value, disabled, className, onChange }: ControlProps<T>) => {
    const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
    const [scroll, setScroll] = useState(0), [place, setPlace] = useState<React.CSSProperties>({});
    const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
    const filter = useRef<HTMLInputElement>(null), row = useRef(32);
    const listId = useId();
    const selected = items.find(item => same(item.value, value));
    const searchable = items.length > VISIBLE_ROWS;
    const shown = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return words.length ? items.filter(item => words.every(word => item.label.toLowerCase().includes(word))) : items;
    }, [items, query]);

    const show = () => {
        row.current = 2 * parseFloat(getComputedStyle(document.documentElement).fontSize) || 32;
        const index = Math.max(0, items.findIndex(item => same(item.value, value)));
        setQuery(''); setActive(index); setScroll(Math.max(0, (index - VISIBLE_ROWS + 1) * row.current)); setOpen(true);
    };
    const close = (refocus: boolean) => { setOpen(false); if (refocus) trigger.current?.focus(); };
    const choose = (item?: Item<T>) => {
        if (!item || item.disabled) return;
        // A fieldset disabled while the list is open must not accept a late click.
        if (trigger.current?.matches(':disabled')) { setOpen(false); return; }
        close(true);
        onChange(item.value);
    };
    const step = (delta: number) => {
        for (let index = active + delta; index >= 0 && index < shown.length; index += delta) if (!shown[index].disabled) return index;
        return active;
    };
    const keys = (event: React.KeyboardEvent) => {
        const last = shown.length - 1;
        if (event.key === 'ArrowDown') setActive(step(1));
        else if (event.key === 'ArrowUp') setActive(step(-1));
        else if (event.key === 'PageDown') setActive(Math.min(last, active + VISIBLE_ROWS));
        else if (event.key === 'PageUp') setActive(Math.max(0, active - VISIBLE_ROWS));
        else if (event.key === 'Home' && !searchable) setActive(0);
        else if (event.key === 'End' && !searchable) setActive(last);
        else if (event.key === 'Enter') choose(shown[active]);
        else if (event.key === 'Escape' || event.key === 'Tab') close(true);
        else return;
        event.preventDefault(); event.stopPropagation();
    };

    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const node = trigger.current;
            if (!node) return;
            const box = node.getBoundingClientRect(), computed = getComputedStyle(node);
            const height = Math.min(shown.length || 1, VISIBLE_ROWS) * row.current + (searchable ? row.current + 16 : 0) + 8;
            const below = window.innerHeight - box.bottom, above = below < height && box.top > below;
            const width = Math.max(box.width, 220);
            setPlace({
                left: Math.max(4, Math.min(box.left, window.innerWidth - width - 4)), width,
                ...(above ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }),
                // The list is rendered outside its tab, so it carries the tab's accent color with it.
                ...Object.fromEntries(ACCENT_VARIABLES.map(variable => [variable, computed.getPropertyValue(variable)])),
            });
        };
        const moved = (event: Event) => { if (!popup.current?.contains(event.target as Node)) update(); };
        update();
        window.addEventListener('resize', update); window.addEventListener('scroll', moved, true);
        return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', moved, true); };
    }, [open, shown.length, searchable]);
    useLayoutEffect(() => {
        const node = list.current;
        if (!open || !node) return;
        const start = active * row.current, end = start + row.current;
        if (start < node.scrollTop) node.scrollTop = start;
        else if (end > node.scrollTop + node.clientHeight) node.scrollTop = end - node.clientHeight;
    }, [open, active, shown]);
    useEffect(() => {
        if (!open) return;
        (filter.current ?? popup.current)?.focus();
        const outside = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!trigger.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside, true);
        return () => document.removeEventListener('pointerdown', outside, true);
    }, [open]);
    // A hidden tab runs effect cleanups: its list must not stay open over another tab.
    useEffect(() => () => setOpen(false), []);

    // A shorter filtered list can leave the remembered scroll position past its end.
    const first = Math.max(0, Math.min(Math.floor(scroll / row.current) - OVERSCAN, shown.length - VISIBLE_ROWS - OVERSCAN));
    const visible = shown.slice(first, first + VISIBLE_ROWS + 2 * OVERSCAN);
    return <>
        <button ref={trigger} type="button" id={id} aria-label={name} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
            disabled={disabled} className={`flex items-center justify-between gap-2 text-left ${className}`}
            onClick={() => open ? close(false) : show()}
            onKeyDown={event => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); show(); } }}>
            <span className={`truncate ${selected?.missing ? 'italic text-text-muted' : ''}`}>{selected?.label}</span>
            <span aria-hidden="true" className={`shrink-0 text-xs text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {open && !disabled && createPortal(<div ref={popup} tabIndex={-1} onKeyDown={keys} style={{ position: 'fixed', ...place }}
            className="z-[1000] overflow-hidden rounded-md border border-border-primary bg-bg-secondary text-sm text-text-primary shadow-xl focus:outline-none">
            {searchable && <div className="border-b border-border-primary p-1.5">
                <input ref={filter} type="text" value={query} placeholder="Type to filter..." autoComplete="off" spellCheck={false}
                    aria-label={`Filter ${name || 'options'}`} aria-controls={listId} aria-activedescendant={shown.length ? `${listId}-${active}` : undefined}
                    onChange={event => { setQuery(event.target.value); setActive(0); setScroll(0); }}
                    className="w-full rounded border border-border-primary bg-bg-tertiary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none" />
            </div>}
            <div ref={list} id={listId} role="listbox" aria-label={name} className="overflow-y-auto overscroll-contain" style={{ maxHeight: VISIBLE_ROWS * row.current }}
                onScroll={event => setScroll(event.currentTarget.scrollTop)}>
                {shown.length ? <div className="relative" style={{ height: shown.length * row.current }}>
                    {visible.map((item, offset) => {
                        const index = first + offset, current = same(item.value, value);
                        return <div key={index} id={`${listId}-${index}`} role="option" aria-selected={current} aria-disabled={item.disabled || undefined} title={item.label}
                            style={{ top: index * row.current, height: row.current }}
                            className={`absolute inset-x-0 flex items-center justify-between gap-2 px-3 ${item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${index === active ? 'bg-bg-tertiary' : ''} ${current ? 'font-semibold text-accent' : ''}`}
                            onMouseDown={event => event.preventDefault()} onMouseMove={() => { if (index !== active && !item.disabled) setActive(index); }} onClick={() => choose(item)}>
                            <span className="truncate">{item.label}</span>{current && <span aria-hidden="true" className="shrink-0">✓</span>}
                        </div>;
                    })}
                </div> : <p className="px-3 py-2 text-text-muted">No match</p>}
            </div>
        </div>, document.body)}
    </>;
};

/** The single listbox of the application. */
export const Select = <T extends string | number = string>({
    value, options, onChange, variant = 'native', label, ariaLabel, disabled, placeholder, hint, error, className, controlClassName = '', labelClassName,
}: SelectProps<T>) => {
    const id = useId();
    const items = useMemo(() => selectItems(options, value, placeholder), [options, value, placeholder]);
    const control: ControlProps<T> = {
        id, name: ariaLabel ?? label, items, value, disabled, onChange,
        className: `${label ? 'mt-1 ' : ''}${ui.control} ${controlClassName}`,
    };
    return <div className={className}>
        {label && <label htmlFor={id} className={labelClassName ?? ui.label}>{label}</label>}
        {variant === 'search' ? <SearchSelect {...control} /> : <NativeSelect {...control} />}
        {hint && <p className={ui.hint}>{hint}</p>}
        {error && <p role="alert" className={ui.error}>{error}</p>}
    </div>;
};
