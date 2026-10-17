import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import ReactCrop from 'react-image-crop';
import type { AppDispatch } from '../store/store';
import type { LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { drawReferenceSheet, initialReferenceCrop, MAX_REFERENCE_PHOTOS, referenceAspect, REFERENCE_RATIOS, type ReferenceCrop, type ReferenceRatio, type ReferenceSheetSettings } from '../utils/referenceSheet';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, LibraryIcon, SaveIcon, SpinnerIcon, ResetIcon } from './icons';

interface ReferencePhoto {
    id: string;
    name: string;
    image: HTMLImageElement;
    ratio: ReferenceRatio;
    crop: ReferenceCrop;
}

const defaults: ReferenceSheetSettings = { columns: 0, gap: 0, megapixels: 2, background: '#ffffff' };
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

const loadPhoto = async (file: File): Promise<ReferencePhoto> => {
    if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" is not an image.`);
    const src = await fileToDataUrl(file);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            image.onload = null;
            image.onerror = null;
            reject(new Error(`Timed out loading "${file.name}".`));
        }, 30000);
        image.onload = () => { clearTimeout(timeout); resolve(); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error(`Could not decode "${file.name}". Use PNG, JPEG or WEBP.`)); };
        image.src = src;
    });
    return {
        id: crypto.randomUUID(), name: file.name, image, ratio: 'original',
        crop: initialReferenceCrop('original', image.naturalWidth, image.naturalHeight),
    };
};

export const ReferenceMakerPanel: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [settings, setSettings] = useState<ReferenceSheetSettings>(defaults);
    const [name, setName] = useState('Reference Sheet');
    const [importing, setImporting] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [layout, setLayout] = useState<ReturnType<typeof drawReferenceSheet> | null>(null);
    const [renderedRevision, setRenderedRevision] = useState<object | null>(null);
    const revision = useMemo(() => ({}), [photos, settings]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mounted = useRef(false);
    const importVersion = useRef(0);
    const importPending = useRef(false);
    const selected = photos.find(photo => photo.id === selectedId) || photos[0];
    const busy = importing || saveStatus === 'saving';
    const ready = photos.length > 0 && renderedRevision === revision && !previewError;
    const filename = `${name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Reference Sheet'}.png`;

    useEffect(() => {
        mounted.current = true;
        setImporting(false);
        return () => { mounted.current = false; importVersion.current++; importPending.current = false; };
    }, []);

    useEffect(() => {
        setSaveStatus('idle');
        setPreviewError(null);
        if (!photos.length) {
            setLayout(null);
            setRenderedRevision(null);
            return;
        }
        const frame = requestAnimationFrame(() => {
            try {
                if (!canvasRef.current) throw new Error('Reference preview is unavailable.');
                setLayout(drawReferenceSheet(canvasRef.current, photos, settings));
                setRenderedRevision(revision);
            } catch (cause) {
                console.error('Could not compose reference sheet:', cause);
                setPreviewError(errorMessage(cause));
                setRenderedRevision(null);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [photos, settings, revision]);

    const addFiles = async (inputFiles: File[] | (() => Promise<File[]>)) => {
        if (importPending.current || saveStatus === 'saving' || (Array.isArray(inputFiles) && !inputFiles.length)) return;
        if (Array.isArray(inputFiles) && photos.length + inputFiles.length > MAX_REFERENCE_PHOTOS) {
            setError(`You can add at most ${MAX_REFERENCE_PHOTOS} photos. ${MAX_REFERENCE_PHOTOS - photos.length} slot(s) remain; select fewer images.`);
            return;
        }
        importPending.current = true;
        const version = ++importVersion.current;
        setImporting(true);
        setError(null);
        try {
            const files = Array.isArray(inputFiles) ? inputFiles : await inputFiles();
            if (!mounted.current || version !== importVersion.current) return;
            if (!files.length || photos.length + files.length > MAX_REFERENCE_PHOTOS) throw new Error(`Select 1 to ${MAX_REFERENCE_PHOTOS - photos.length} more photos.`);
            const loaded = await Promise.allSettled(files.map(loadPhoto));
            const failures = loaded.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length) throw new Error(failures.map(item => errorMessage(item.reason)).join('\n'));
            if (!mounted.current || version !== importVersion.current) return;
            const added = loaded.filter((item): item is PromiseFulfilledResult<ReferencePhoto> => item.status === 'fulfilled').map(item => item.value);
            setPhotos(current => [...current, ...added]);
            setSelectedId(added[0].id);
        } catch (cause) {
            console.error('Could not import reference photos:', cause);
            if (mounted.current && version === importVersion.current) setError(errorMessage(cause));
        } finally {
            if (mounted.current && version === importVersion.current) {
                importPending.current = false;
                setImporting(false);
            }
        }
    };
    const addLibrary = async (items: LibraryItem[]) => {
        if (photos.length + items.length > MAX_REFERENCE_PHOTOS) {
            setError(`Select at most ${MAX_REFERENCE_PHOTOS - photos.length} more Library images.`);
            return;
        }
        await addFiles(() => Promise.all(items.map(async item => {
                const response = await fetch(item.media);
                if (!response.ok) throw new Error(`Could not read "${item.name || 'Library image'}" (${response.status}).`);
                const blob = await response.blob();
                return new File([blob], item.name || `Library image ${item.id}`, { type: blob.type });
            })));
    };
    const updatePhoto = (updates: Partial<ReferencePhoto>) => {
        if (!selected || busy) return;
        setPhotos(current => current.map(photo => photo.id === selected.id ? { ...photo, ...updates } : photo));
        setError(null);
    };
    const changeRatio = (ratio: ReferenceRatio) => {
        if (!selected) return;
        updatePhoto({
            ratio,
            crop: ratio === 'free' ? selected.crop : initialReferenceCrop(ratio, selected.image.naturalWidth, selected.image.naturalHeight),
        });
    };
    const move = (direction: -1 | 1) => {
        if (!selected || busy) return;
        const index = photos.findIndex(photo => photo.id === selected.id);
        const target = index + direction;
        if (target < 0 || target >= photos.length) return;
        const reordered = [...photos];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        setPhotos(reordered);
    };
    const duplicate = () => {
        if (!selected || busy || photos.length >= MAX_REFERENCE_PHOTOS) return;
        const copy = { ...selected, id: crypto.randomUUID(), crop: { ...selected.crop } };
        const index = photos.findIndex(photo => photo.id === selected.id);
        setPhotos([...photos.slice(0, index + 1), copy, ...photos.slice(index + 1)]);
        setSelectedId(copy.id);
    };
    const reset = () => {
        importVersion.current++;
        importPending.current = false;
        setImporting(false);
        setPhotos([]);
        setSelectedId(null);
        setSettings(defaults);
        setName('Reference Sheet');
        setError(null);
        setLibraryOpen(false);
    };
    const exportImage = () => {
        if (!ready || !canvasRef.current) throw new Error('Wait for the current reference sheet preview to finish.');
        const media = canvasRef.current.toDataURL('image/png');
        if (!media.startsWith('data:image/png;base64,')) throw new Error('Could not encode the reference sheet PNG.');
        return media;
    };
    const download = () => {
        try {
            const link = document.createElement('a');
            link.href = exportImage();
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (cause) {
            console.error('Could not download reference sheet:', cause);
            setError(errorMessage(cause));
        }
    };
    const save = async () => {
        if (!ready || busy || saveStatus === 'saved') return;
        setSaveStatus('saving');
        setError(null);
        try {
            const media = exportImage();
            await dispatch(addToLibrary({
                mediaType: 'image', name: name.trim() || 'Reference Sheet', media,
                thumbnail: await dataUrlToThumbnail(media, 256),
            })).unwrap();
            if (mounted.current) setSaveStatus('saved');
        } catch (cause) {
            console.error('Could not save reference sheet:', cause);
            if (mounted.current) {
                setError(`Could not save to Library: ${errorMessage(cause)}`);
                setSaveStatus('idle');
            }
        }
    };
    const button = 'flex items-center justify-center gap-2 rounded-lg bg-bg-tertiary px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary-hover disabled:cursor-not-allowed disabled:opacity-50';
    const input = 'w-full rounded-md border border-border-primary bg-bg-primary p-2 text-sm';

    return <section className="rounded-lg border-l-4 border-accent bg-bg-primary/50 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-2xl font-bold text-accent">Reference Maker</h2><p className="mt-1 text-sm text-text-secondary">Compose up to {MAX_REFERENCE_PHOTOS} photos locally. Each photo has its own aspect ratio and movable crop. The preview updates automatically.</p></div>
            <button type="button" onClick={reset} disabled={saveStatus === 'saving'} className={button}><ResetIcon className="h-4 w-4" />Reset Reference Maker</button>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <fieldset disabled={busy} className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <label className={`${button} ${busy || photos.length >= MAX_REFERENCE_PHOTOS ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                        Add photos ({photos.length}/{MAX_REFERENCE_PHOTOS})
                        <input aria-label="Add reference photos" type="file" multiple accept="image/png,image/jpeg,image/webp,image/*" disabled={busy || photos.length >= MAX_REFERENCE_PHOTOS} className="sr-only"
                            onChange={event => { const files = Array.from<File>(event.currentTarget.files || []); event.currentTarget.value = ''; void addFiles(files); }} />
                    </label>
                    <button type="button" onClick={() => setLibraryOpen(true)} disabled={busy || photos.length >= MAX_REFERENCE_PHOTOS} className={button}><LibraryIcon className="h-4 w-4" />From Library</button>
                    {importing && <span role="status" className="flex items-center gap-2 text-sm"><SpinnerIcon className="h-4 w-4 animate-spin" />Loading photos...</span>}
                </div>
                {!!photos.length && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Reference photos in sheet order">
                    {photos.map((photo, index) => <button type="button" key={photo.id} aria-label={`Select reference photo ${index + 1}`} aria-pressed={selected?.id === photo.id} onClick={() => setSelectedId(photo.id)}
                        className={`relative h-20 w-20 shrink-0 overflow-hidden rounded border-2 ${selected?.id === photo.id ? 'border-accent' : 'border-border-primary'}`} title={photo.name}>
                        <img src={photo.image.src} alt={photo.name} className="h-full w-full object-contain bg-black/40" />
                        <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-xs text-white">{index + 1}</span>
                    </button>)}
                </div>}
                {selected && <>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="min-w-[150px] flex-1 text-sm text-text-secondary">Photo aspect ratio
                            <select aria-label="Photo aspect ratio" value={selected.ratio} onChange={event => changeRatio(event.target.value as ReferenceRatio)} className={`${input} mt-1`}>
                                {REFERENCE_RATIOS.map(ratio => <option key={ratio} value={ratio}>{ratio === 'original' ? 'Original ratio' : ratio === 'free' ? 'Free crop' : ratio}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={() => updatePhoto({ crop: initialReferenceCrop(selected.ratio, selected.image.naturalWidth, selected.image.naturalHeight) })} className={`${button} mt-5`}>Reset crop</button>
                    </div>
                    <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-black/30 p-2" aria-label="Photo crop editor">
                        <ReactCrop key={selected.id} crop={selected.crop} aspect={referenceAspect(selected.ratio, selected.image.naturalWidth, selected.image.naturalHeight)}
                            minWidth={1} minHeight={1} keepSelection disabled={busy}
                            onChange={(_, crop) => { if (crop.width > 0 && crop.height > 0) updatePhoto({ crop }); }}>
                            <img src={selected.image.src} alt={`Crop ${selected.name}`} draggable={false} className="block max-h-[420px] max-w-full object-contain" />
                        </ReactCrop>
                    </div>
                    <p className="break-all text-xs text-text-muted">{selected.name} — {selected.image.naturalWidth} x {selected.image.naturalHeight}. Drag inside to move the crop; drag handles to resize. Choose Free crop to unlock the ratio.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => move(-1)} disabled={photos[0].id === selected.id} className={button} title="Move photo earlier"><ChevronLeftIcon className="h-4 w-4" />Earlier</button>
                        <button type="button" onClick={() => move(1)} disabled={photos[photos.length - 1].id === selected.id} className={button} title="Move photo later">Later<ChevronRightIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={duplicate} disabled={photos.length >= MAX_REFERENCE_PHOTOS} className={button}>Duplicate</button>
                        <button type="button" onClick={() => { const remaining = photos.filter(photo => photo.id !== selected.id); setPhotos(remaining); setSelectedId(remaining[0]?.id || null); }} className={button}>Remove photo</button>
                    </div>
                </>}
                <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm text-text-secondary">Columns<select aria-label="Reference sheet columns" value={settings.columns} onChange={event => setSettings(current => ({ ...current, columns: Number(event.target.value) }))} className={input}>
                        <option value={0}>Auto</option>{Array.from({ length: MAX_REFERENCE_PHOTOS }, (_, i) => i + 1).map(count => <option key={count} value={count}>{count}</option>)}
                    </select></label>
                    <label className="space-y-1 text-sm text-text-secondary">Output resolution<select aria-label="Reference sheet resolution" value={settings.megapixels} onChange={event => setSettings(current => ({ ...current, megapixels: Number(event.target.value) }))} className={input}>
                        {[0.5, 1, 2, 4, 8].map(mp => <option key={mp} value={mp}>{mp} MP maximum</option>)}
                    </select></label>
                    <label className="space-y-1 text-sm text-text-secondary">Spacing: {settings.gap}<input aria-label="Reference sheet spacing" type="range" min={0} max={100} step={1} value={settings.gap} onChange={event => setSettings(current => ({ ...current, gap: Number(event.target.value) }))} className="w-full" /></label>
                    <label className="space-y-1 text-sm text-text-secondary">Background<input aria-label="Reference sheet background" type="color" value={settings.background} onChange={event => setSettings(current => ({ ...current, background: event.target.value }))} className="h-10 w-full rounded border border-border-primary bg-bg-primary" /></label>
                </div>
            </fieldset>
            <div className="min-w-0 space-y-4">
                <h3 className="text-lg font-semibold text-text-primary">Live Reference Sheet</h3>
                <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg border border-border-primary bg-black/20 p-2">
                    <canvas ref={canvasRef} aria-label="Reference sheet preview" className={`h-auto max-h-[650px] max-w-full object-contain ${photos.length ? 'block' : 'hidden'}`} />
                    {!photos.length && <p className="p-8 text-center text-text-muted">Add photos to see your reference sheet here.</p>}
                </div>
                <p role="status" className="text-xs text-text-secondary">{layout && photos.length ? `${photos.length} photos · ${layout.width} x ${layout.height} · ${(layout.width * layout.height / 1_000_000).toFixed(2)} MP · ${layout.columns} columns / ${layout.rows} rows${ready ? '' : ' · Updating...'}` : 'No photos loaded.'}</p>
                <p className="text-xs text-text-muted">The sheet preserves each crop without stretching. Photos share a row height; incomplete rows are centered. Spacing scales with output resolution. Maximum canvas dimension: 8192 pixels.</p>
                <label className="block text-sm text-text-secondary">Reference sheet name<input aria-label="Reference sheet name" type="text" value={name} disabled={busy} onChange={event => { setName(event.target.value); setSaveStatus('idle'); }} className={`${input} mt-1`} /></label>
                <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={download} disabled={!ready || busy} className={button}><DownloadIcon className="h-5 w-5" />Download PNG</button>
                    <button type="button" onClick={save} disabled={!ready || busy || saveStatus === 'saved'} className={button}>
                        {saveStatus === 'saving' ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-5 w-5" /> : <SaveIcon className="h-5 w-5" />}
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save to Library'}
                    </button>
                </div>
            </div>
        </div>
        {(error || previewError) && <p role="alert" className="mt-4 whitespace-pre-wrap text-sm text-danger">{error || previewError}</p>}
        {libraryOpen && <LibraryPickerModal isOpen onClose={() => setLibraryOpen(false)} onSelectItem={item => { setLibraryOpen(false); void addLibrary([item]); }}
            multiSelect onSelectMultiple={items => { setLibraryOpen(false); void addLibrary(items); }}
            filter={['image', 'character', 'extracted-frame', 'clothes', 'hair', 'object', 'pose', 'logo', 'banner', 'album-cover', 'font', 'group-fusion', 'swap-anything', 'past-forward-photo']} />}
    </section>;
};
