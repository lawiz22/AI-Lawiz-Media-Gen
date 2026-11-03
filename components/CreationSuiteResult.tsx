import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, DownloadIcon, SaveIcon, SpinnerIcon, ZoomIcon } from './icons';
import { SendToLTXButton } from './SendToLTXButton';

const action = 'rounded-full bg-bg-secondary/90 p-2 text-text-primary shadow-lg transition-colors hover:bg-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40';
export const CreationSuiteResult: React.FC<{
    src: string;
    title: string;
    alt: string;
    busy: boolean;
    onDownload: () => void;
    onSave: () => Promise<boolean>;
}> = ({ src, title, alt, busy, onDownload, onSave }) => {
    const [open, setOpen] = useState(false), [actualSize, setActualSize] = useState(false);
    const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
    const closeButton = useRef<HTMLButtonElement | null>(null), modal = useRef<HTMLDivElement | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const openImage = () => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setActualSize(false); setOpen(true);
    };
    useEffect(() => {
        if (!open) return;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButton.current?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
            if (event.key !== 'Tab') return;
            const buttons = modal.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            if (!buttons?.length) return;
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => {
            document.removeEventListener('keydown', keydown);
            document.body.style.overflow = overflow;
            returnFocus.current?.focus();
        };
    }, [open]);
    const save = async () => {
        setSaving(true);
        try { if (await onSave()) setSaved(true); }
        finally { setSaving(false); }
    };
    return <>
        <div className="group relative overflow-hidden rounded-lg bg-bg-primary">
            <button type="button" className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Open ${title}`} onClick={openImage}>
                <img src={src} alt={alt} className="max-h-[720px] w-full object-contain" />
            </button>
            <div role="group" aria-label={`${title} image actions`} className="absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1.5 rounded-full bg-black/30 p-1 opacity-100 backdrop-blur-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                <button type="button" className={action} title="Open image" aria-label={`Zoom ${title}`} onClick={openImage}><ZoomIcon className="h-5 w-5" /></button>
                <button type="button" className={action} title="Download image" aria-label={`Download ${title}`} disabled={busy} onClick={onDownload}><DownloadIcon className="h-5 w-5" /></button>
                <button type="button" className={action} title={saved ? 'Saved to Library' : 'Save to Library'} aria-label={`${saved ? 'Saved' : 'Save'} ${title} to Library`} disabled={busy || saving || saved} onClick={() => void save()}>
                    {saving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : saved ? <CheckIcon className="h-5 w-5" /> : <SaveIcon className="h-5 w-5" />}
                </button>
                {!busy && <SendToLTXButton imageDataUrl={src} className={action} />}
            </div>
        </div>
        {open && <div ref={modal} role="dialog" aria-modal="true" aria-label={`${title} image viewer`} className="fixed inset-0 z-[100] flex flex-col bg-black/95" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 p-3 text-white">
                <h3 className="text-sm font-semibold">{title}</h3>
                <div className="flex items-center gap-2">
                    <button type="button" aria-pressed={!actualSize} className={`rounded-md px-3 py-2 text-sm ${!actualSize ? 'bg-accent text-accent-text' : 'bg-white/10 hover:bg-white/20'}`} onClick={() => setActualSize(false)}>Fit</button>
                    <button type="button" aria-pressed={actualSize} className={`rounded-md px-3 py-2 text-sm ${actualSize ? 'bg-accent text-accent-text' : 'bg-white/10 hover:bg-white/20'}`} onClick={() => setActualSize(true)}>100%</button>
                    <button ref={closeButton} type="button" className="rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close image viewer" title="Close image viewer" onClick={() => setOpen(false)}><CloseIcon className="h-5 w-5" /></button>
                </div>
            </div>
            <div className={`min-h-0 flex-1 overflow-auto p-4 ${actualSize ? '' : 'flex items-center justify-center'}`} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
                <img src={src} alt={`${title} full-size`} className={actualSize ? 'mx-auto block h-auto w-auto max-w-none' : 'max-h-full max-w-full object-contain'} />
            </div>
        </div>}
    </>;
};
