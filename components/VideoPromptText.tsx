import React, { useRef } from 'react';

const colors: Record<string, string[]> = {
    Picture: ['border-sky-400/50 bg-sky-400/10 text-sky-300', 'border-teal-400/50 bg-teal-400/10 text-teal-300', 'border-pink-400/50 bg-pink-400/10 text-pink-300', 'border-lime-400/50 bg-lime-400/10 text-lime-300'],
    Video: ['border-violet-400/50 bg-violet-400/10 text-violet-300', 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300'],
    Audio: ['border-amber-400/50 bg-amber-400/10 text-amber-300', 'border-orange-400/50 bg-orange-400/10 text-orange-300'],
    Subject: ['border-emerald-400/50 bg-emerald-400/10 text-emerald-300', 'border-green-400/50 bg-green-400/10 text-green-300'],
};
const tokenClass = (text: string) => {
    const kind = text.match(/Picture|Video|Audio|Subject/)?.[0] || 'Subject';
    const slot = Number(text.match(/\d+/)?.[0] || 1);
    const palette = colors[kind];
    const index = Number.isSafeInteger(slot) && slot > 0 ? (slot - 1) % palette.length : 0;
    return palette[index];
};
const isToken = (text: string) => /^<(?:Picture|Video|Audio|Subject)\s+\d+>$/.test(text);
const parts = (text: string) => text.split(/(<(?:Picture|Video|Audio|Subject)\s+\d+>)/g);

export const VideoReferenceToken: React.FC<{ text: string }> = ({ text }) =>
    <span className={`inline rounded border px-1 py-0.5 font-mono text-xs ${tokenClass(text)}`}>{text}</span>;

export const ColoredVideoPrompt: React.FC<{ text: string }> = ({ text }) => <div className="whitespace-pre-wrap break-words font-mono text-sm leading-7">
    {parts(text).map((part, index) => isToken(part) ? <VideoReferenceToken key={index} text={part} /> : <React.Fragment key={index}>{part}</React.Fragment>)}
</div>;

export const VideoPromptEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder?: string;
}> = ({ value, onChange, label, placeholder }) => {
    const highlight = useRef<HTMLDivElement>(null);
    const textLayout = 'whitespace-pre-wrap break-words border p-2 font-mono text-xs leading-6';
    return <div className="relative mt-1 rounded-lg bg-bg-primary">
        <div ref={highlight} aria-hidden="true" data-video-prompt-highlight className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg border-transparent text-text-primary ${textLayout}`} style={{ scrollbarGutter: 'stable' }}>
            {parts(value).map((part, index) => isToken(part)
                ? <span key={index} className={tokenClass(part).split(' ').filter(style => !style.startsWith('border-')).join(' ')}>{part}</span>
                : <React.Fragment key={index}>{part}</React.Fragment>)}
            {'\n'}
        </div>
        <textarea aria-label={label} value={value} placeholder={placeholder} spellCheck={false}
            className={`relative block min-h-48 w-full resize-y rounded-lg border-border-primary bg-transparent text-transparent caret-accent placeholder:text-text-muted focus:border-accent focus:outline-none ${textLayout}`}
            style={{ scrollbarGutter: 'stable' }}
            onChange={event => onChange(event.target.value)}
            onScroll={event => {
                if (highlight.current) {
                    highlight.current.scrollTop = event.currentTarget.scrollTop;
                    highlight.current.scrollLeft = event.currentTarget.scrollLeft;
                }
            }} />
    </div>;
};
