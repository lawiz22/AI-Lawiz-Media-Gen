import React, { useEffect, useMemo, useState } from 'react';
import { defaultStyleGallery, isH3LoraPath, normalizeStyleModel, parseStyleGallery, saveStyleGallery, type GalleryStyle } from '../services/styleGallery';
import { h3Choices, h3LoraChoices, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { loadH3Catalog } from '../services/minimaxH3Service';
import { useStyleGallery } from './useStyleGallery';
import { useModelInventory } from './useModelInventory';
import { PresetTextInput, SelectInput } from './InputComponents';
import { linkStyleLibrary, matchStyleLibrary, resolveLibraryStyle, styleInstalledLoras, styleLibraryLoras, styleModelFamily, unusedStyleLoras } from '../services/styleLibrary';
import { getComfyRelativePath } from '../services/civitaiService';
import { StyleBrowser, StyleLibraryPreview, StyleModal } from './StyleBrowser';

const input = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm hover:bg-bg-tertiary disabled:opacity-40';
export const StyleGalleryPanel: React.FC<{ isComfyUIConnected: boolean | null; onOpenLibrary?: (path: string) => void }> = ({ isComfyUIConnected, onOpenLibrary }) => {
    const { gallery, error: storageError } = useStyleGallery();
    const { inventory, error: inventoryError, loading: inventoryLoading, refresh: refreshInventory } = useModelInventory();
    const [libraryQuery, setLibraryQuery] = useState('');
    const [model, setModel] = useState('FLUX2-9B');
    const [editing, setEditing] = useState<GalleryStyle | null>(null), [error, setError] = useState(''), [status, setStatus] = useState('');
    const [info, setInfo] = useState<H3ObjectInfo>({});
    const refresh = async (signal?: AbortSignal, force = false) => {
        const nodes = await loadH3Catalog(['LoraLoaderModelOnly', 'KSamplerSelect', 'BasicScheduler'], signal, force);
        if (!signal?.aborted) setInfo(nodes);
    };
    useEffect(() => {
        if (!isComfyUIConnected) return;
        const abort = new AbortController();
        void refresh(abort.signal).catch(cause => { if (!abort.signal.aborted) setError(String(cause)); });
        return () => abort.abort();
    }, [isComfyUIConnected]);
    const creating = !!editing && !gallery?.styles.some(style => style.id === editing.id);
    const loras = useMemo(() => {
        const family = editing?.model || model;
        const names = styleInstalledLoras(normalizeStyleModel(family) === 'H3' ? h3LoraChoices(info)
            : h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), family, inventory);
        return creating ? unusedStyleLoras(names, gallery?.styles || [], editing?.model || model, inventory) : names;
    }, [info, editing?.model, model, inventory, creating, gallery]);
    const samplers = useMemo(() => h3Choices(info, 'KSamplerSelect', 'sampler_name'), [info]);
    const schedulers = useMemo(() => h3Choices(info, 'BasicScheduler', 'scheduler'), [info]);
    const libraryLoras = useMemo(() => {
        const family = editing?.model || model;
        const items = styleLibraryLoras(inventory, family).filter(item => normalizeStyleModel(family) !== 'H3' || isH3LoraPath(getComfyRelativePath(item)));
        const available = new Set(creating ? unusedStyleLoras(items.map(getComfyRelativePath), gallery?.styles || [], editing?.model || model, inventory) : items.map(getComfyRelativePath));
        return items.filter(item => available.has(getComfyRelativePath(item))
            && `${item.fileName} ${item.modelName || ''} ${item.relativePath}`.toLowerCase().includes(libraryQuery.toLowerCase()));
    }, [inventory, editing?.model, model, libraryQuery, creating, gallery]);
    const linked = editing ? resolveLibraryStyle(editing, inventory, samplers) : undefined;
    const models = [...new Set(['FLUX2-9B', 'FLUX2-4B', 'KREA2', 'MOSS', 'H3', ...(gallery?.styles.map(style => style.model) || [])])];
    const update = (patch: Partial<GalleryStyle>) => setEditing(current => current ? { ...current, ...patch } : null);
    const save = () => {
        if (!gallery || !editing) return;
        try {
            const style = { ...editing, title: editing.title.trim(), model: normalizeStyleModel(editing.model), lora: editing.lora.trim() };
            saveStyleGallery({ version: 1, styles: [...gallery.styles.filter(value => value.id !== style.id), style] });
            setModel(style.model); setEditing(null); setError(''); setStatus('Style saved. It is immediately available to compatible generators.');
        } catch (cause) { setError(String(cause)); }
    };
    const download = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(gallery, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'lawiz-style-gallery.json'; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <section className="space-y-5 rounded-2xl border border-border-primary bg-bg-secondary p-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-2xl font-bold text-accent">Gestionnaire de styles</h2>
                <p className="text-sm text-text-secondary">Style Gallery · one selector per model · LoRA or prompt-only styles</p></div>
            <div className="flex flex-wrap gap-2">
                <button className={button} disabled={!gallery} onClick={() => { setError(''); setLibraryQuery(''); setEditing({ id: crypto.randomUUID(), model: model || 'FLUX2-9B', title: '', prompt: '', trigger: '', lora: '', strength: 1, notes: '', settings: {} }); }}>+ New style</button>
                <button className={button} disabled={!gallery} onClick={download}>Export JSON</button>
                <label className={`${button} cursor-pointer`}>Import JSON<input type="file" accept=".json,application/json" className="hidden" onChange={event => {
                    const file = event.target.files?.[0]; event.target.value = '';
                    if (file) void file.text().then(raw => {
                        const imported = parseStyleGallery(raw);
                        if (!window.confirm('Replace the style gallery with this file? Export your current gallery first if needed.')) return;
                        saveStyleGallery(imported); setEditing(null); setError(''); setStatus(`Imported ${imported.styles.length} styles.`);
                    }).catch(cause => setError(String(cause)));
                }} /></label>
                <button className={button} disabled={!isComfyUIConnected} onClick={() => void refresh(undefined, true).then(() => setError('')).catch(cause => setError(String(cause)))}>Refresh LoRAs</button>
                <button className={button} disabled={inventoryLoading} onClick={() => void refreshInventory()}>Refresh My Library</button>
                <button className={button} disabled={!gallery || !inventory.items.length || !!editing} title="Close the editor before linking all saved styles" onClick={() => {
                    if (!gallery) return;
                    try {
                        let count = 0;
                        const styles = gallery.styles.map(style => {
                            const match = matchStyleLibrary(style, inventory);
                            if (!match.item) return style;
                            count++; return linkStyleLibrary(style, match.item);
                        });
                        saveStyleGallery({ version: 1, styles });
                        setStatus(`Linked ${count} styles to My Library. Manual settings were preserved; ambiguous or missing matches were skipped.`);
                    } catch (cause) { setError(String(cause)); }
                }}>Link matching styles</button>
            </div>
        </header>
        {(storageError || inventoryError || error) && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-red-400">{storageError || inventoryError || error}</p>}
        {!window.electron && <p className="text-sm text-text-muted">My Library links use the Electron desktop inventory. Installed ComfyUI LoRAs and manual styles remain available here.</p>}
        {status && <p role="status" className="text-sm text-accent">{status}</p>}
        <div className="flex flex-wrap gap-3">
            <select aria-label="Style model filter" className={`${input} !w-auto`} value={model} onChange={event => setModel(event.target.value)}><option value="">All models</option>{models.map(name => <option key={name}>{name}</option>)}</select>
        </div>
        {gallery && <StyleBrowser styles={gallery.styles} inventory={inventory} model={model} onSelect={style => { setEditing(structuredClone(style)); setError(''); setLibraryQuery(''); }} />}
        {editing && <StyleModal title="Edit style" onClose={() => setEditing(null)}>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); save(); }}>
                {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                <div className="grid items-start gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                <aside className="min-w-0 space-y-4 md:sticky md:top-20" aria-label="Style preview and library link">
                    <div className="rounded-xl border border-border-primary bg-bg-primary/40 p-3">
                        <StyleLibraryPreview item={linked?.item} height={360} fit="contain" />
                        <h4 className="break-words text-lg font-semibold">{linked?.item?.modelName || editing.title || 'New style'}</h4>
                        <p className="mt-1 text-sm text-accent">{normalizeStyleModel(editing.model)}</p>
                        <p className="mt-2 break-all text-xs leading-relaxed text-text-secondary">{linked?.item?.relativePath || editing.lora || 'Prompt-only style - no linked LoRA'}</p>
                        {linked?.item && <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" className={button} onClick={() => setEditing(linkStyleLibrary(editing, linked.item!))}>{editing.libraryLink ? 'Refresh library link' : 'Link this LoRA'}</button>
                            <button type="button" className={button} disabled={!onOpenLibrary} onClick={() => { setEditing(null); onOpenLibrary?.(linked.item!.path); }}>Open in My Library</button>
                        </div>}
                    </div>
                    <div className="space-y-3 rounded-xl border border-border-primary p-4">
                        <h4 className="font-semibold">Library recommendations</h4>
                        <p className="text-sm leading-relaxed text-text-secondary">Only missing trigger, steps, CFG and sampler values are filled. Your manual settings and LoRA strength are kept.</p>
                        <dl className="space-y-2 text-sm">
                            <div><dt className="text-text-muted">Trigger</dt><dd className="break-words">{linked?.item?.usageMetadata?.triggerWords?.join(', ') || 'Not provided'}</dd></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><dt className="text-text-muted">Steps</dt><dd>{linked?.item?.usageMetadata?.steps ?? 'Not provided'}</dd></div>
                                <div><dt className="text-text-muted">CFG</dt><dd>{linked?.item?.usageMetadata?.cfg ?? 'Not provided'}</dd></div>
                            </div>
                            <div><dt className="text-text-muted">Sampler</dt><dd>{linked?.item?.usageMetadata?.sampler || 'Not provided'}</dd></div>
                        </dl>
                        {linked?.item?.usageMetadata && <details><summary className="cursor-pointer text-xs text-text-muted">Technical metadata</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(linked.item.usageMetadata, null, 2)}</pre></details>}
                        {linked?.warnings.map(message => <p key={message} role="status" className="text-sm text-amber-400">{message}</p>)}
                    </div>
                </aside>
                <div className="min-w-0 space-y-5">
                <section className="space-y-4 rounded-xl border border-border-primary p-4">
                <h4 className="font-semibold text-accent">Style identity</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Title<input required className={input} value={editing.title} onChange={event => update({ title: event.target.value })} /></label>
                    <label className="text-sm">Model<input required list="style-models" className={input} value={editing.model} onChange={event => update({ model: event.target.value, libraryLink: undefined, lora: '' })} /></label>
                </div>
                </section>
                <div className="space-y-3 rounded-lg border border-border-primary p-3">
                    <h4 className="font-semibold">LoRA from My Library</h4>
                    {creating && <p className="text-xs text-text-secondary">LoRAs already used by a saved style for this model are hidden from both selectors.</p>}
                    <input aria-label="Search library LoRAs" className={input} placeholder="Search indexed LoRAs..." value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} />
                    <SelectInput label="Choose library LoRA" value="" disabled={!libraryLoras.length}
                        options={[{ value: '', label: `Choose a LoRA (${libraryLoras.length} matches)` }, ...libraryLoras.map(item => ({ value: item.path, label: `${item.modelName || item.fileName} — ${getComfyRelativePath(item)}` }))]}
                        onChange={event => {
                            const item = libraryLoras.find(value => value.path === event.target.value);
                            if (item) setEditing(linkStyleLibrary(editing, item));
                        }} />
                <PresetTextInput label="Installed LoRA path" ariaLabel="Style LoRA path" emptyLabel="Prompt only — no LoRA" options={loras} value={editing.lora}
                    onChange={lora => update({ lora, libraryLink: undefined })} />
                <label className="block text-sm">LoRA strength<input type="number" step="0.05" required className={input} value={editing.strength} onChange={event => update({ strength: event.target.valueAsNumber })} /></label>
                </div>
                <section className="space-y-4 rounded-xl border border-border-primary p-4">
                <h4 className="font-semibold text-accent">Prompt & triggers</h4>
                <label className="block text-sm">Trigger<textarea rows={3} className={input} placeholder={linked?.style.trigger ? `My Library: ${linked.style.trigger}` : ''} value={editing.trigger} onChange={event => update({ trigger: event.target.value })} /></label>
                <label className="block text-sm">Style prompt / boosters<textarea rows={4} className={input} value={editing.prompt} onChange={event => update({ prompt: event.target.value })} /></label>
                <p className="text-xs text-text-muted">Style triggers are placed first in the actual generation prompt. Style prompt / boosters follow your instructions. Blank sampling fields keep the generator settings. No unverified “best settings” are prefilled.</p>
                </section>
                <section className="space-y-4 rounded-xl border border-border-primary p-4">
                <h4 className="font-semibold text-accent">Optional generation settings</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    {(['steps', 'cfg', 'megapixels'] as const).map(key => <label key={key} className="text-sm">{{ steps: 'Steps', cfg: 'CFG', megapixels: 'Megapixels' }[key]}<input className={input} type="number" step={key === 'steps' ? 1 : 'any'} placeholder={linked?.style.settings[key] !== undefined ? `My Library: ${linked.style.settings[key]}` : 'Generator setting'} value={editing.settings[key] ?? ''} onChange={event => {
                        const settings = { ...editing.settings };
                        if (!event.target.value) delete settings[key];
                        else settings[key] = event.target.valueAsNumber;
                        update({ settings });
                    }} /></label>)}
                    <PresetTextInput label="Sampler" ariaLabel="Style sampler" emptyLabel={linked?.style.settings.sampler ? `My Library: ${linked.style.settings.sampler}` : 'Generator setting'} options={samplers} value={editing.settings.sampler || ''} onChange={sampler => {
                        const settings = { ...editing.settings }; if (sampler) settings.sampler = sampler; else delete settings.sampler; update({ settings });
                    }} />
                    <PresetTextInput label="Scheduler" ariaLabel="Style scheduler" emptyLabel="Keep workflow scheduler"
                        options={['flux2-9b', 'flux2-4b'].includes(styleModelFamily(editing.model) || '') ? ['flux2', ...schedulers]
                            : styleModelFamily(editing.model) === 'minimax-h3' ? ['h3-beta', ...schedulers] : schedulers}
                        value={editing.settings.scheduler || ''}
                        onChange={scheduler => { const settings = { ...editing.settings }; if (scheduler) settings.scheduler = scheduler; else delete settings.scheduler; update({ settings }); }} />
                </div>
                <p className="text-xs text-text-secondary">Optional: leave Scheduler empty to keep the workflow's scheduler. With style sampling overrides enabled, a selected scheduler is forced. FLUX2: flux2 keeps the automatic scheduler; other choices use BasicScheduler with full denoise.</p>
                {styleModelFamily(editing.model) === 'minimax-h3' && <p className="text-xs text-accent">H3 / MiniMax: h3-beta uses BetaSamplingScheduler with the workflow alpha / beta; other schedulers use BasicScheduler. CFG and megapixels are not applied. Style sampling affects the first pass only, not latent / LTX finishing.</p>}
                <p className="text-xs text-accent">From My Library: {linked?.filled.join(', ') || 'no missing fields filled'}</p>
                </section>
                <label className="block text-sm">Notes<textarea className={input} value={editing.notes} onChange={event => update({ notes: event.target.value })} /></label>
                </div>
                </div>
                <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border-primary bg-bg-secondary py-4">
                    <button type="submit" className={`${button} bg-accent text-accent-text`} disabled={!gallery}>Save style</button>
                    <button type="button" className={button} onClick={() => setEditing(null)}>Close</button>
                    <button type="button" className={button} onClick={() => update({ id: crypto.randomUUID(), title: `${editing.title} (copy)` })}>Duplicate</button>
                    {gallery?.styles.some(style => style.id === editing.id) && <button type="button" className={`${button} text-red-400`} onClick={() => {
                        if (!window.confirm(`Delete "${editing.title}"?`)) return;
                        try { saveStyleGallery({ version: 1, styles: gallery.styles.filter(style => style.id !== editing.id) }); setEditing(null); }
                        catch (cause) { setError(String(cause)); }
                    }}>Delete</button>}
                </div>
            </form>
        </StyleModal>}
        <datalist id="style-models">{models.map(name => <option key={name} value={name} />)}</datalist>
        {gallery?.styles.length === 0 && <button className={button} onClick={() => { try { saveStyleGallery(defaultStyleGallery()); } catch (cause) { setError(String(cause)); } }}>Add the initial 27 FLUX2-9B styles</button>}
    </section>;
};
