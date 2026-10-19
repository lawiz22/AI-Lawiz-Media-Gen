import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LibraryItem } from '../types';
import { createLibraryAssetObjectUrl, getLibraryItems } from '../services/libraryService';
import { filterLibraryPrompts, getLibraryPromptPreview } from '../utils/libraryPrompt';
import { CloseIcon, LibraryIcon, SpinnerIcon } from './icons';

export const LibraryPromptButton: React.FC<{ onSelectPrompt: (prompt: string) => void; disabled: boolean; title?: string }> = ({ onSelectPrompt, disabled, title }) => {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const close = () => { setOpen(false); trigger.current?.focus(); };
    return <>
        <button ref={trigger} type="button" disabled={disabled} title={title || 'Copy a saved Library prompt without changing settings'} onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-3 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50">
            <LibraryIcon className="h-4 w-4" />Import Library Prompt
        </button>
        {open && createPortal(<LibraryPromptPicker onClose={close} onSelectPrompt={onSelectPrompt} disabled={disabled} />, document.body)}
    </>;
};

const LibraryPromptPicker: React.FC<{ onClose: () => void; onSelectPrompt: (prompt: string) => void; disabled: boolean }> = ({ onClose, onSelectPrompt, disabled }) => {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [preview, setPreview] = useState('');
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [reload, setReload] = useState(0);
    const search = useRef<HTMLInputElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        getLibraryItems().then(result => { if (active) setItems(result); })
            .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load Library prompts.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [reload]);
    useEffect(() => { search.current?.focus(); }, []);
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
            if (event.key === 'Tab') {
                const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
                if (!controls?.length) return;
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);
    const filtered = useMemo(() => filterLibraryPrompts(items, query), [items, query]);
    const hovered = filtered.find(item => item.id === hoveredId);
    useEffect(() => {
        let active = true;
        let objectUrl = '';
        setPreview(''); setPreviewError(''); setPreviewLoading(false);
        const source = hovered ? getLibraryPromptPreview(hovered, items) : null;
        if (source?.src) setPreview(source.src);
        else if (source?.ref) {
            setPreviewLoading(true);
            createLibraryAssetObjectUrl(source.ref).then(url => {
                if (!active) { URL.revokeObjectURL(url); return; }
                objectUrl = url; setPreview(url);
            }).catch(failure => {
                console.warn('Could not load Library prompt preview.', failure);
                if (active) setPreviewError(failure instanceof Error ? failure.message : 'Could not load preview.');
            }).finally(() => { if (active) setPreviewLoading(false); });
        }
        return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [hovered, items]);
    const select = (item: LibraryItem) => {
        if (disabled) return;
        try { onSelectPrompt(item.media); onClose(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not import the selected prompt.'); }
    };
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="library-prompt-picker-title" onClick={onClose}>
        <div ref={dialog} className="flex h-[85vh] max-h-[760px] w-full max-w-5xl flex-col rounded-2xl border border-border-primary bg-bg-secondary p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="library-prompt-picker-title" className="text-lg font-bold text-accent">Import Library Prompt</h2>
                <button type="button" aria-label="Close prompt library" onClick={onClose} className="rounded p-2 text-text-secondary hover:bg-bg-tertiary"><CloseIcon className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-text-secondary">Hover or focus a prompt to preview its image. Click to replace only the positive prompt. Models, negative prompts and generation settings stay unchanged.</p>
            <input ref={search} aria-label="Search Library prompts" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search prompts, names or tags..." className="mb-4 w-full rounded-md border border-border-primary bg-bg-tertiary p-3 text-sm" />
            {error && <div role="alert" className="mb-3 text-sm text-danger">{error}<button type="button" onClick={() => setReload(value => value + 1)} className="ml-3 underline">Reload Library</button></div>}
            {loading ? <div role="status" className="flex justify-center p-8"><SpinnerIcon className="h-6 w-6 animate-spin" /><span className="sr-only">Loading Library prompts</span></div> : <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:grid-rows-[minmax(0,1fr)]">
                <div className="space-y-2 md:min-h-0 md:overflow-y-auto" aria-label="Library prompts">
                    {!filtered.length && <p className="p-4 text-sm text-text-secondary">{query ? 'No matching prompts.' : 'No saved image prompts in the Library yet.'}</p>}
                    {filtered.map(item => <button key={item.id} type="button" disabled={disabled} onMouseEnter={() => setHoveredId(item.id)} onFocus={() => setHoveredId(item.id)} onClick={() => select(item)}
                        className={`block w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${hoveredId === item.id ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary hover:border-accent'}`}>
                        <span className="block text-sm font-semibold">{item.name || 'Untitled prompt'}</span>
                        <span className="mt-1 block line-clamp-3 whitespace-pre-wrap break-words text-xs text-text-secondary">{item.media}</span>
                    </button>)}
                </div>
                <aside className="min-w-0 rounded-lg border border-border-primary bg-bg-tertiary p-3 md:overflow-y-auto" aria-label="Prompt image preview">
                    {previewLoading ? <p role="status" className="text-sm text-text-secondary">Loading preview...</p>
                        : previewError ? <p role="alert" className="text-sm text-warning">{previewError}</p>
                            : preview ? <img src={preview} alt={`Preview of ${hovered?.name || 'Library prompt'}`} onError={() => setPreviewError('Could not display this prompt preview.')} className="max-h-80 w-full rounded object-contain" />
                                : <p className="p-4 text-center text-sm text-text-secondary">{hovered ? 'No image is associated with this prompt.' : 'Hover a prompt to see its image.'}</p>}
                    {hovered && <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-xs text-text-secondary">{hovered.media}</p>}
                </aside>
            </div>}
        </div>
    </div>;
};
