import { useEffect, useRef } from 'react';

// Saves the latest draft once edits pause; a pending save is flushed when the tab is hidden or removed.
export const useDraftAutosave = <T>(draft: T, ready: boolean, save: (draft: T) => void, delay = 400) => {
    const state = useRef<{ timer?: ReturnType<typeof setTimeout>; pending?: { draft: T }; saved?: T; save: (draft: T) => void }>({ save });
    state.current.save = save;
    const flush = useRef(() => {
        const current = state.current, pending = current.pending;
        clearTimeout(current.timer); current.timer = undefined; current.pending = undefined;
        if (pending) { current.saved = pending.draft; current.save(pending.draft); }
    }).current;
    useEffect(() => {
        const current = state.current;
        if (!ready || current.saved === draft) return;
        current.pending = { draft };
        clearTimeout(current.timer);
        current.timer = setTimeout(flush, delay);
    }, [draft, ready]);
    useEffect(() => flush, []);
};
