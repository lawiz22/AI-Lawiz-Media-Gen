import { useMemo, useSyncExternalStore } from 'react';
import { parseStyleGallery, STYLE_GALLERY_KEY } from '../services/styleGallery';

const subscribe = (listener: () => void) => {
    const storage = (event: StorageEvent) => { if (event.key === STYLE_GALLERY_KEY || event.key === null) listener(); };
    window.addEventListener(STYLE_GALLERY_KEY, listener);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(STYLE_GALLERY_KEY, listener); window.removeEventListener('storage', storage); };
};
const snapshot = (): string | null => {
    try { return localStorage.getItem(STYLE_GALLERY_KEY); }
    catch (error) { return JSON.stringify({ storageError: String(error) }); }
};
export const useStyleGallery = () => {
    const raw = useSyncExternalStore(subscribe, snapshot);
    return useMemo(() => {
        try { return { gallery: parseStyleGallery(raw), error: '' }; }
        catch (error) { return { gallery: null, error: `Cannot read the style gallery. Stored data was not overwritten. ${String(error)}` }; }
    }, [raw]);
};
