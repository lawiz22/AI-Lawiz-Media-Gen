import React, { useEffect, useId, useState } from 'react';
import { Select } from './Select';
import { ui } from './styles';

type Range = { min?: number; max?: number; step?: number };
// Every tab stays mounted, so accessible names carry the workflow name to remain unique.
const named = (name: string | undefined, label: string) => name ? `${name} ${label}` : label;

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof ui.buttons }> =
    ({ variant = 'secondary', type = 'button', className = '', ...props }) => <button type={type} className={`${ui.buttons[variant]} ${className}`} {...props} />;

export const NumberField: React.FC<Range & {
    label: string; value: number; onChange: (value: number) => void; ariaLabel?: string; disabled?: boolean; className?: string;
    /** Adds a slider beside the field; needs min and max. */
    slider?: boolean;
}> = ({ label, value, onChange, ariaLabel, min, max, step, disabled, className, slider }) => {
    const id = useId(), [draft, setDraft] = useState(String(value));
    useEffect(() => setDraft(String(value)), [value]);
    const valid = (text: string) => {
        const number = Number(text);
        return text.trim() !== '' && Number.isFinite(number) && (min === undefined || number >= min) && (max === undefined || number <= max);
    };
    const field = <input id={id} aria-label={ariaLabel} type="number" min={min} max={max} step={step ?? 'any'} value={draft} disabled={disabled} className={`block ${ui.control}`}
        onChange={event => { setDraft(event.target.value); if (valid(event.target.value)) onChange(Number(event.target.value)); }}
        onBlur={() => { if (!valid(draft)) setDraft(String(value)); }}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
    return <div className={className}>
        <label htmlFor={id} className={ui.label}>{label}</label>
        {slider ? <div className="mt-1 flex items-center gap-2">
            <input type="range" aria-label={`${ariaLabel ?? label} slider`} min={min} max={max} step={step ?? 'any'} value={value} disabled={disabled}
                className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg border border-border-primary bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
                onChange={event => onChange(Number(event.target.value))} />
            <div className="w-24 shrink-0">{field}</div>
        </div> : <div className="mt-1">{field}</div>}
    </div>;
};

export const SeedField: React.FC<{
    value: number; onChange: (value: number) => void;
    /** Shows the "new seed for every run" switch when provided. */
    randomize?: boolean; onRandomizeChange?: (value: boolean) => void;
    max?: number; name?: string; disabled?: boolean; className?: string;
}> = ({ value, onChange, randomize, onRandomizeChange, max = Number.MAX_SAFE_INTEGER, name, disabled, className }) => <div className={className}>
    <div className="flex items-end gap-2">
        <NumberField label="Seed" ariaLabel={named(name, 'Seed')} value={value} onChange={onChange} min={0} max={max} step={1} disabled={disabled} className="min-w-0 flex-1" />
        <Button aria-label={named(name, 'Random seed')} disabled={disabled} onClick={() => onChange(Math.floor(Math.random() * Math.min(max, 1e15)))}>Random</Button>
    </div>
    {onRandomizeChange && <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" aria-label={named(name, 'Randomize seed')} checked={!!randomize} disabled={disabled} onChange={event => onRandomizeChange(event.target.checked)} />
        New seed for every run
    </label>}
</div>;

export interface SamplerValues { sampler?: string; scheduler?: string; steps?: number; cfg?: number; denoise?: number }
/** Sampler block: only the keys present in value are shown, always in the same order. */
export const SamplerFields: React.FC<{
    value: SamplerValues; onChange: (patch: SamplerValues) => void;
    samplers?: readonly string[]; schedulers?: readonly string[];
    limits?: Partial<Record<'steps' | 'cfg' | 'denoise', Range>>;
    name?: string; disabled?: boolean; className?: string;
}> = ({ value, onChange, samplers = [], schedulers = [], limits, name, disabled, className = '' }) => <div className={`grid gap-3 sm:grid-cols-2 ${className}`}>
    {value.sampler !== undefined && <Select variant="search" label="Sampler" ariaLabel={named(name, 'Sampler')} value={value.sampler} options={samplers} disabled={disabled} onChange={sampler => onChange({ sampler })} />}
    {value.scheduler !== undefined && <Select variant="search" label="Scheduler" ariaLabel={named(name, 'Scheduler')} value={value.scheduler} options={schedulers} disabled={disabled} onChange={scheduler => onChange({ scheduler })} />}
    {value.steps !== undefined && <NumberField slider className="sm:col-span-2" label="Steps" ariaLabel={named(name, 'Steps')} value={value.steps} min={1} max={200} step={1} {...limits?.steps} disabled={disabled} onChange={steps => onChange({ steps })} />}
    {value.cfg !== undefined && <NumberField slider className="sm:col-span-2" label="CFG" ariaLabel={named(name, 'CFG')} value={value.cfg} min={0} max={30} step={0.1} {...limits?.cfg} disabled={disabled} onChange={cfg => onChange({ cfg })} />}
    {value.denoise !== undefined && <NumberField slider className="sm:col-span-2" label="Denoise" ariaLabel={named(name, 'Denoise')} value={value.denoise} min={0} max={1} step={0.01} {...limits?.denoise} disabled={disabled} onChange={denoise => onChange({ denoise })} />}
</div>;

export interface ModelField { id: string; label: string; value: string; choices: readonly string[] }
/** Model, text encoder and VAE pickers, one searchable list each. */
export const ModelFields: React.FC<{
    fields: readonly ModelField[]; onChange: (id: string, value: string) => void; name?: string; disabled?: boolean; className?: string;
}> = ({ fields, onChange, name, disabled, className = '' }) => <div className={`space-y-3 ${className}`}>
    {fields.map(field => <div key={field.id}><Select variant="search" label={field.label} ariaLabel={named(name, field.label)} value={field.value} options={field.choices}
        placeholder="Select a model" disabled={disabled} onChange={value => onChange(field.id, value)} /></div>)}
</div>;

export interface LoraSlot { enabled: boolean; name: string; strength: number }
export const LoraSlots: React.FC<{
    slots: readonly LoraSlot[]; choices: readonly string[]; onChange: (index: number, patch: Partial<LoraSlot>) => void;
    strength?: Range; name?: string; disabled?: boolean; className?: string;
}> = ({ slots, choices, onChange, strength, name, disabled, className = '' }) => {
    const options = [{ value: '', label: 'None' }, ...choices.map(choice => ({ value: choice, label: choice }))];
    return <div className={`space-y-3 ${className}`}>
        {slots.map((slot, index) => {
            const title = `LoRA ${index + 1}`;
            return <div key={index} className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                    <input type="checkbox" aria-label={named(name, `Enable ${title}`)} checked={slot.enabled} disabled={disabled} onChange={event => onChange(index, { enabled: event.target.checked })} />
                    {title}
                </label>
                {slot.enabled && <div className="space-y-2">
                    <Select variant="search" ariaLabel={named(name, `${title} file`)} value={slot.name} options={options} disabled={disabled} onChange={value => onChange(index, { name: value })} />
                    <NumberField slider label="Strength" ariaLabel={named(name, `${title} strength`)} value={slot.strength} min={-4} max={4} step={0.05} {...strength} disabled={disabled} onChange={value => onChange(index, { strength: value })} />
                </div>}
            </div>;
        })}
    </div>;
};
