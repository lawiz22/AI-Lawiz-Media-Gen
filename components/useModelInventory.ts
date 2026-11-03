import { useEffect, useSyncExternalStore } from 'react';
import type { CivitaiInventory } from '../services/civitaiService';

const empty: CivitaiInventory = { root: '', scannedAt: null, items: [] };
let state = { inventory: empty, error: '', loading: false };
let request: Promise<void> | undefined;
let revision = 0;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => state;
export const setModelInventory = (value: CivitaiInventory | ((current: CivitaiInventory) => CivitaiInventory)) => {
    revision++;
    state = { inventory: typeof value === 'function' ? value(state.inventory) : value, error: '', loading: false };
    publish();
};
export const refreshModelInventory = (): Promise<void> => {
    if (request) return request;
    if (!window.electron) return Promise.resolve();
    const started = revision;
    state = { ...state, loading: true }; publish();
    request = window.electron.getCivitaiInventory().then(inventory => {
        if (revision === started) setModelInventory(inventory);
    }).catch(cause => {
        if (revision === started) { state = { ...state, error: `Cannot read My Library: ${String(cause)}`, loading: false }; publish(); }
    }).finally(() => { request = undefined; });
    return request;
};
export const useModelInventory = () => {
    const value = useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => { void refreshModelInventory(); }, []);
    return { ...value, setInventory: setModelInventory, refresh: refreshModelInventory };
};
