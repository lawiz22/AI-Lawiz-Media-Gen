import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeStyleModel, type GalleryStyle } from '../services/styleGallery';
import { matchStyleLibrary } from '../services/styleLibrary';
import type { CivitaiInventory, CivitaiInventoryItem } from '../services/civitaiService';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm hover:bg-bg-tertiary disabled:opacity-40';
const input = 'rounded-lg border border-border-primary bg-bg-primary p-2 text-sm';
export const StyleModal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
    const ref = useRef<HTMLDialogElement>(null), heading = useId();
    useEffect(() => {
        const dialog = ref.current;
        const previousFocus = document.activeElement;
        dialog?.showModal();
        return () => { dialog?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
    }, []);
    return createPortal(<dialog ref={ref} aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        onClick={event => { if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        } }}
        className="fixed max-h-[90vh] w-[min(1100px,94vw)] max-w-none rounded-2xl border border-border-primary bg-bg-secondary p-0 text-text-primary shadow-2xl backdrop:bg-black/70">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border-primary bg-bg-secondary p-4">
            <h3 id={heading} className="text-lg font-bold">{title}</h3><button type="button" className={button} onClick={onClose} aria-label="Close dialog">Close</button>
        </header>
        <div className="p-4">{children}</div>
    </dialog>, document.body);
};

export const StyleLibraryPreview: React.FC<{ item?: CivitaiInventoryItem; height?: number; fit?: 'cover' | 'contain' }> = ({ item, height = 160, fit = 'cover' }) => {
    const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null), [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setError('');
        setPreview(item?.civitaiPreviewUrl ? { url: item.civitaiPreviewUrl, type: item.civitaiPreviewType || (/\.(mp4|webm)(?:[?#]|$)/i.test(item.civitaiPreviewUrl) ? 'video' : 'image') } : null);
        if (item?.previewPath && window.electron) {
            void window.electron.getLocalModelPreview(item.path).then(value => { if (active && value) setPreview(value); })
                .catch(cause => { if (active) setError(`Cannot load library preview: ${String(cause)}`); });
        }
        return () => { active = false; };
    }, [item?.path, item?.previewPath, item?.civitaiPreviewUrl, item?.civitaiPreviewType]);
    return <div className="mb-3">
        {preview?.type === 'image' && !error
            ? <img src={preview.url} alt={`Library preview: ${item?.modelName || item?.fileName}`} loading="lazy" style={{ height, objectFit: fit }} className="w-full rounded-lg bg-bg-primary" onError={() => setError('Library preview unavailable.')} />
            : <div style={{ height }} className="flex items-center justify-center rounded-lg bg-bg-tertiary p-3 text-center text-xs text-text-muted">{preview?.type === 'video' ? 'Video preview in My Library' : 'No preview'}</div>}
        {error && <p role="status" className="break-words text-xs text-amber-400">{error}</p>}
    </div>;
};

const sizes = { small: { width: 140, height: 96, label: 'Petit' }, medium: { width: 210, height: 160, label: 'Moyen' }, large: { width: 300, height: 240, label: 'Gros' } };
type CardSize = keyof typeof sizes;
const preferenceKey = 'lawiz-style-display-v1';
const initialDisplay = (): { size: CardSize; perPage: number; error: string } => {
    try {
        const raw = localStorage.getItem(preferenceKey);
        if (!raw) return { size: 'medium', perPage: 24, error: '' };
        const value = JSON.parse(raw);
        if (!value || !Object.hasOwn(sizes, value.size) || ![12, 24, 48, 96].includes(value.perPage)) throw new Error('Invalid style display preferences.');
        return { size: value.size, perPage: value.perPage, error: '' };
    } catch (cause) { return { size: 'medium', perPage: 24, error: `Cannot restore style display preferences: ${String(cause)}` }; }
};

export const StyleBrowser: React.FC<{
    styles: GalleryStyle[]; inventory: CivitaiInventory; model: string; selectedId?: string; onSelect: (style: GalleryStyle) => void;
}> = ({ styles, inventory, model, selectedId, onSelect }) => {
    const [query, setQuery] = useState(''), [page, setPage] = useState(1);
    const [display, setDisplay] = useState(initialDisplay);
    const changeDisplay = (patch: Partial<Pick<typeof display, 'size' | 'perPage'>>) => {
        const next = { ...display, ...patch, error: '' };
        try { localStorage.setItem(preferenceKey, JSON.stringify({ size: next.size, perPage: next.perPage })); }
        catch (cause) { next.error = `Cannot save style display preferences: ${String(cause)}`; }
        setDisplay(next); setPage(1);
    };
    const filtered = useMemo(() => styles.filter(style => (!model || normalizeStyleModel(style.model) === normalizeStyleModel(model))
        && `${style.title} ${style.trigger} ${style.lora} ${style.notes}`.toLowerCase().includes(query.trim().toLowerCase())), [styles, model, query]);
    const pages = Math.max(1, Math.ceil(filtered.length / display.perPage)), current = Math.min(page, pages);
    const start = (current - 1) * display.perPage;
    const visible = useMemo(() => filtered.slice(start, start + display.perPage).map(style => ({ style, item: matchStyleLibrary(style, inventory).item })), [filtered, start, display.perPage, inventory]);
    useEffect(() => { setPage(1); }, [model, query]);
    const pagination = (placement: string) => <nav aria-label={`Style pages ${placement}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{filtered.length ? start + 1 : 0}–{Math.min(start + display.perPage, filtered.length)} / {filtered.length} styles</span>
        <div className="flex flex-wrap items-center gap-2">
            <label>Per page <select aria-label={`Styles per page ${placement}`} className={input} value={display.perPage} onChange={event => changeDisplay({ perPage: Number(event.target.value) })}>{[12, 24, 48, 96].map(count => <option key={count}>{count}</option>)}</select></label>
            <button type="button" className={button} disabled={current === 1} onClick={() => setPage(1)} aria-label={`First style page ${placement}`}>«</button>
            <button type="button" className={button} disabled={current === 1} onClick={() => setPage(current - 1)} aria-label={`Previous style page ${placement}`}>‹</button>
            <label>Page <select aria-label={`Style page ${placement}`} className={input} value={current} onChange={event => setPage(Number(event.target.value))}>{Array.from({ length: pages }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select> / {pages}</label>
            <button type="button" className={button} disabled={current === pages} onClick={() => setPage(current + 1)} aria-label={`Next style page ${placement}`}>›</button>
            <button type="button" className={button} disabled={current === pages} onClick={() => setPage(pages)} aria-label={`Last style page ${placement}`}>»</button>
        </div>
    </nav>;
    return <div className="space-y-4">
        {display.error && <p role="alert" className="text-sm text-red-400">{display.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
            <input aria-label="Search styles" className={`${input} min-w-0 flex-1`} placeholder="Search styles, triggers or LoRAs..." value={query} onChange={event => setQuery(event.target.value)} />
            <div role="group" aria-label="Style card size" className="flex gap-1">{(Object.keys(sizes) as CardSize[]).map(size =>
                <button type="button" key={size} aria-pressed={display.size === size} onClick={() => changeDisplay({ size })} className={`${button} ${display.size === size ? 'border-accent text-accent' : ''}`}>{sizes[size].label}</button>)}</div>
        </div>
        {pagination('top')}
        <div className="grid items-start gap-3" data-style-grid={display.size} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${sizes[display.size].width}px), 1fr))` }}>
            {visible.map(({ style, item }) => <button type="button" key={style.id} aria-pressed={selectedId === style.id} aria-label={style.title} onClick={() => onSelect(style)}
                className={`min-w-0 rounded-xl border bg-bg-primary p-3 text-left hover:border-accent ${selectedId === style.id ? 'border-accent ring-1 ring-accent' : 'border-border-primary'}`}>
                <StyleLibraryPreview item={item} height={sizes[display.size].height} />
                <h4 className="break-words font-semibold">{style.title}</h4>
                <p className="mt-1 text-xs text-accent">{normalizeStyleModel(style.model)}</p>
                {display.size !== 'small' && <><p className="mt-2 truncate text-xs text-text-secondary">{style.lora || 'Prompt only · no LoRA'}</p>
                    <p className="mt-1 text-xs text-text-muted">{item ? 'My Library' : style.trigger ? 'Trigger configured' : 'Custom style'}</p></>}
            </button>)}
        </div>
        {!filtered.length && <p className="p-6 text-center text-text-muted">No styles match this model or search.</p>}
        {pagination('bottom')}
    </div>;
};

export const StylePicker: React.FC<{
    styles: GalleryStyle[]; inventory: CivitaiInventory; model: string; selectedId?: string; selectedStyle?: GalleryStyle; disabled?: boolean; error?: string; onSelect: (style: GalleryStyle | null) => void | boolean;
}> = ({ styles, inventory, model, selectedId, selectedStyle, disabled, error, onSelect }) => {
    const [open, setOpen] = useState(false);
    const selected = selectedStyle || styles.find(style => style.id === selectedId);
    const compatible = selected && normalizeStyleModel(selected.model) === normalizeStyleModel(model);
    return <div className="space-y-2">
        <button type="button" className={`${button} w-full text-left`} disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog">
            Choose style · {model}{selectedId ? ` · ${compatible ? selected.title : 'Missing or incompatible style'}` : ' · No style'}
        </button>
        {selectedId && !compatible && <p role="alert" className="text-sm text-amber-400">Select a compatible {model} style or remove the saved selection.</p>}
        {open && <StyleModal title={`Choose style · ${model}`} onClose={() => setOpen(false)}>
            {error && <p role="alert" className="mb-4 text-sm text-red-400">{error}</p>}
            <button type="button" className={`${button} mb-4`} onClick={() => { if (onSelect(null) !== false) setOpen(false); }}>No style · keep generator instructions</button>
            <StyleBrowser styles={styles} inventory={inventory} model={model} selectedId={selectedId} onSelect={style => { if (onSelect(style) !== false) setOpen(false); }} />
        </StyleModal>}
    </div>;
};
