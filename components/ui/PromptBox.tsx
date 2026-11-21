import React, { useId, useRef, useState, type ChangeEvent } from 'react';
import { ui } from './styles';

export type PromptKind = 'positive' | 'negative' | 'instruction' | 'readonly' | 'neutral';
export interface PromptPart { text: string; className?: string }
export interface PromptBoxProps {
    label: string;
    value: string;
    /** Omit for a read-only prompt. The event is absent when the value comes from Clear. */
    onChange?: (value: string, event?: ChangeEvent<HTMLTextAreaElement>) => void;
    /** Color code of the prompt's role; neutral keeps a plain text area. */
    kind?: PromptKind;
    ariaLabel?: string;
    rows?: number;
    placeholder?: string;
    disabled?: boolean;
    /** Colors prompt syntax behind the text. Pass a function for workflow-specific tokens. */
    highlight?: boolean | ((text: string) => PromptPart[]);
    copyable?: boolean;
    clearable?: boolean;
    /** Extra buttons shown beside the label, e.g. Library. */
    actions?: React.ReactNode;
    hint?: React.ReactNode;
    title?: string;
    className?: string;
}

const KINDS: Record<PromptKind, { edge: string; dot: string }> = {
    positive: { edge: 'border-l-4 border-l-highlight-green', dot: 'bg-highlight-green' },
    negative: { edge: 'border-l-4 border-l-danger', dot: 'bg-danger' },
    instruction: { edge: 'border-l-4 border-l-accent', dot: 'bg-accent' },
    readonly: { edge: 'border-dashed', dot: '' },
    neutral: { edge: '', dot: '' },
};
// Both layers must wrap identically, so they share every class that affects text layout.
const TEXT = 'whitespace-pre-wrap break-words p-2 text-sm leading-6';
const TOOL = 'rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40';
const TOKENS = /(<lora:[^<>\n]+>|<(?:Picture|Video|Audio|Subject)\s+\d+>|\([^()\n]+:-?\d*\.?\d+\)|__[\w-]+__|\{[^{}\n]*\|[^{}\n]*\}|\bBREAK\b)/g;
// Background tints only: the text keeps the theme color, so tokens stay readable in every theme.
const tokenClass = (token: string) => token.startsWith('<lora:') ? 'bg-amber-500/30'
    : token.startsWith('<') ? 'bg-sky-500/30'
    : token.startsWith('(') ? 'bg-violet-500/30'
    : token === 'BREAK' ? 'bg-zinc-500/40' : 'bg-teal-500/30';

/** LoRA tags, reference tokens, weights, wildcards and BREAK. */
export const promptParts = (text: string): PromptPart[] =>
    text.split(TOKENS).map((part, index) => index % 2 ? { text: part, className: tokenClass(part) } : { text: part });

/** The single prompt field of the application: role color, syntax coloring and a stable accessible name. */
export const PromptBox: React.FC<PromptBoxProps> = ({
    label, value, onChange, kind = 'positive', ariaLabel, rows = 4, placeholder, disabled, highlight = kind !== 'neutral',
    copyable, clearable, actions, hint, title, className,
}) => {
    const id = useId(), layer = useRef<HTMLDivElement>(null);
    const [copyState, setCopyState] = useState('');
    const style = KINDS[kind], readOnly = kind === 'readonly' || !onChange;
    const parts = highlight ? (typeof highlight === 'function' ? highlight : promptParts)(value) : null;
    const copy = () => navigator.clipboard.writeText(value).then(() => 'Copied', () => 'Copy failed').then(state => {
        setCopyState(state); setTimeout(() => setCopyState(''), 1500);
    });
    return <div className={className}>
        <div className="flex min-w-0 items-center justify-between gap-2">
            <label htmlFor={id} title={title} className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
                {style.dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />}
                <span className="truncate">{label}</span>
            </label>
            {(actions || copyable || clearable) && <div className="flex shrink-0 items-center gap-1">
                {actions}
                {copyable && <button type="button" className={TOOL} disabled={!value} aria-label={`Copy ${ariaLabel ?? label}`} onClick={() => void copy()}>{copyState || 'Copy'}</button>}
                {clearable && !readOnly && <button type="button" className={TOOL} disabled={disabled || !value} aria-label={`Clear ${ariaLabel ?? label}`} onClick={() => onChange?.('')}>Clear</button>}
            </div>}
        </div>
        <div className={`relative mt-1 rounded-md border border-border-primary bg-bg-tertiary focus-within:ring-1 focus-within:ring-accent ${style.edge} ${disabled ? 'opacity-50' : ''}`}>
            {parts && <div ref={layer} aria-hidden="true" data-prompt-highlight className={`pointer-events-none absolute inset-0 overflow-hidden text-text-primary ${TEXT}`} style={{ scrollbarGutter: 'stable' }}>
                {parts.map((part, index) => part.className ? <span key={index} className={`rounded-sm ${part.className}`}>{part.text}</span> : <React.Fragment key={index}>{part.text}</React.Fragment>)}
                {'\n'}
            </div>}
            <textarea id={id} aria-label={ariaLabel ?? label} value={value} rows={rows} placeholder={placeholder} disabled={disabled} readOnly={readOnly} spellCheck={!parts}
                className={`relative block w-full resize-y rounded-md border-0 bg-transparent placeholder:text-text-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed ${parts ? 'text-transparent caret-accent' : 'text-text-primary'} ${TEXT}`}
                style={{ scrollbarGutter: 'stable' }}
                onChange={event => onChange?.(event.target.value, event)}
                onScroll={event => {
                    if (!layer.current) return;
                    layer.current.scrollTop = event.currentTarget.scrollTop; layer.current.scrollLeft = event.currentTarget.scrollLeft;
                }} />
        </div>
        {hint && <p className={ui.hint}>{hint}</p>}
    </div>;
};
