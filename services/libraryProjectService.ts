import { getActiveLibraryFolderHandle, ensureDirectoryPermission, hasDirectoryPermission } from './directoryHandleService';
import {
    clearAbandonedLibraryImports, completeLibraryProjectSave, createLibraryImportStage, getLibraryAssetBlob, getLibraryItems,
    getLibraryProjectBinding, lockLibraryProject, restoreLibraryRecovery, subscribeLibraryChanges,
} from './idbLibraryService';
import { exportLibraryFolder, getLibraryFolderSyncStatus, importLibraryFolder, readLibraryFolder } from './libraryService';
import type { LibraryAssetRef, LibraryAssetRole } from '../types';

export interface LibraryProjectStatus {
    /** paused: the folder must be reconnected by a user action; changes stay in the local Library meanwhile. */
    phase: 'local' | 'saved' | 'pending' | 'saving' | 'paused' | 'error' | 'busy';
    directoryName: string | null;
    message: string;
    lastSavedAt?: string;
}

let status: LibraryProjectStatus = { phase: 'local', directoryName: null, message: 'Saved locally. Create or open a project folder for automatic saving.' };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | undefined;
let busy = false, started = false, needsReview = false;
// The browser withdraws folder access on restart and only gives it back during a user action.
let awaitingAccess = false, reconnectTried = false;
const withProjectLock = <T>(operation: () => Promise<T>): Promise<T> =>
    typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('lawiz-library-project', operation) : operation();
const publish = (next: Partial<LibraryProjectStatus>) => {
    status = { ...status, ...next };
    for (const listener of listeners) listener();
};
export const getLibraryProjectStatus = () => status;
export const subscribeLibraryProject = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const failure = (error: unknown) => publish({
    phase: 'error', message: `${error instanceof Error ? error.message : String(error)} Changes are preserved locally. Use Save now to retry, or make a JSON backup.`,
});
const isAccessError = (error: unknown) => error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
const pause = () => {
    awaitingAccess = true; reconnectTried = false;
    clearTimeout(timer);
    publish({ phase: 'paused', message: 'The project folder must be reconnected after a restart. Changes are kept locally. Use Project > Save now to reconnect.' });
};
const schedule = () => {
    clearTimeout(timer);
    if (!busy && !needsReview && !awaitingAccess) timer = setTimeout(() => { void save(false, true).catch(failure); }, 1000);
};
const verifyProjectFolder = async (handle: FileSystemDirectoryHandle): Promise<void> => {
    const binding = await getLibraryProjectBinding();
    const remote = await readLibraryFolder(handle);
    if (binding?.revision && remote.revision !== binding.revision) throw new Error('The project folder changed outside this app. Open it again to review its contents before saving.');
    if (!binding?.revision) {
        if (remote.manifest) {
            const comparison = await getLibraryFolderSyncStatus(await getLibraryItems());
            needsReview = !!comparison?.pendingItemIds.length || !comparison?.canRead;
            if (needsReview) throw new Error('Your previously selected folder differs from the local Library. Open the folder to use its contents, or use Save now to confirm replacing its contents.');
            await completeLibraryProjectSave(remote.revision!, binding?.generation || 0);
        }
    }
    if ((await getLibraryProjectBinding())?.dirty) {
        publish({ phase: 'pending', message: 'Local changes waiting to save...' }); schedule();
    } else publish({ phase: 'saved', message: 'Saved in project folder', lastSavedAt: remote.manifest?.updatedAt });
};

/** Must run during a user action. Resolves false when access is still refused. */
export const reconnectLibraryProject = async (): Promise<boolean> => {
    if (!awaitingAccess) return true;
    const handle = await getActiveLibraryFolderHandle();
    if (handle && !await ensureDirectoryPermission(handle, 'readwrite').catch(() => false)) return false;
    awaitingAccess = false;
    if (handle) await verifyProjectFolder(handle);
    return true;
};

const save = async (acceptLegacyFolder: boolean, automatic: boolean): Promise<void> => {
    clearTimeout(timer);
    if (busy) throw new Error('Wait for the current Library operation to finish.');
    if (saving) { await saving; return save(acceptLegacyFolder, automatic); }
    if (awaitingAccess) {
        if (automatic) return;
        try {
            if (!await reconnectLibraryProject()) throw new Error('Permission to save the project folder was denied.');
        } catch (error) { failure(error); throw error; }
        clearTimeout(timer);
    }
    if (needsReview && !acceptLegacyFolder) throw new Error('The existing folder needs review. Open it as a project, or explicitly save the local Library into it.');
    saving = withProjectLock(async () => {
        await getActiveLibraryFolderHandle();
        const binding = await getLibraryProjectBinding();
        if (!binding?.handle) throw new Error('No project folder is open. Create a project to enable automatic saving.');
        // An automatic save cannot prompt: without access it waits for the next user action.
        if (automatic && !await hasDirectoryPermission(binding.handle, 'readwrite')) { pause(); return; }
        if (!automatic && !await ensureDirectoryPermission(binding.handle, 'readwrite')) throw new Error('Permission to save the project folder was denied.');
        if (!binding.dirty && (await readLibraryFolder(binding.handle)).revision === binding.revision) {
            publish({ phase: 'saved', directoryName: binding.handle.name, message: 'Saved in project folder' });
            return;
        }
        publish({ phase: 'saving', directoryName: binding.handle.name, message: 'Saving project folder...' });
        const expectedRevision = needsReview ? (await readLibraryFolder(binding.handle)).revision : binding.revision;
        const generation = binding.generation || 0;
        const result = await exportLibraryFolder(undefined, undefined, { handle: binding.handle, expectedRevision });
        const clean = await completeLibraryProjectSave(result.revision, generation);
        needsReview = false;
        publish({ phase: clean ? 'saved' : 'pending', message: clean ? 'Saved in project folder' : 'New changes waiting to save...', lastSavedAt: new Date().toISOString() });
        if (!clean) schedule();
    });
    try { await saving; }
    catch (error) {
        if (automatic && isAccessError(error)) { pause(); return; }
        failure(error); throw error;
    }
    finally { saving = undefined; }
};
export const saveLibraryProjectNow = (acceptLegacyFolder = false): Promise<void> => save(acceptLegacyFolder, false);

export const runLibraryProjectOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (busy) throw new Error('Another Library operation is already running.');
    busy = true;
    clearTimeout(timer);
    const previousPhase = status.phase;
    publish({ phase: 'busy', message: 'Preparing Library operation...' });
    let unlock: (() => void) | undefined;
    try {
        if (saving) await saving;
        return await withProjectLock(async () => {
            unlock = lockLibraryProject();
            return operation();
        });
    } finally {
        unlock?.();
        busy = false;
        try {
            const binding = await getLibraryProjectBinding();
            if (binding?.handle && awaitingAccess) pause();
            else publish({ directoryName: binding?.handle?.name || null,
                phase: !binding?.handle ? 'local' : binding.dirty ? 'pending' : 'saved',
                message: !binding?.handle ? 'Saved locally. No project folder open.' : binding.dirty ? 'Changes waiting to save...' : 'Saved in project folder',
                lastSavedAt: undefined });
            if (binding?.dirty && binding.handle) schedule();
        } catch (error) { publish({ phase: previousPhase }); failure(error); }
    }
};

export const openLibraryProject = async (handle: FileSystemDirectoryHandle, keepLocalRecovery = false): Promise<string[]> => {
    if (!await ensureDirectoryPermission(handle, 'readwrite')) throw new Error('Permission to open this project for automatic saving was denied. The current project has not changed.');
    if (!keepLocalRecovery && (await getLibraryProjectBinding())?.dirty && status.directoryName) await saveLibraryProjectNow();
    return runLibraryProjectOperation(async () => {
        const result = await importLibraryFolder(undefined, { handle, replace: true });
        needsReview = false; awaitingAccess = false;
        return result.warnings;
    });
};

export const createLibraryProject = async (handle: FileSystemDirectoryHandle, keepLocalRecovery = false): Promise<string[]> => {
    if (!await ensureDirectoryPermission(handle, 'readwrite')) throw new Error('Permission to create the project was denied. The current project has not changed.');
    if (!keepLocalRecovery && (await getLibraryProjectBinding())?.dirty && status.directoryName) await saveLibraryProjectNow();
    return runLibraryProjectOperation(async () => {
        for await (const _entry of handle.values()) throw new Error('Choose an empty folder for a new project. Use Open project for an existing project.');
        const oldBinding = await getLibraryProjectBinding();
        const items = oldBinding?.handle ? [] : await getLibraryItems();
        const result = await exportLibraryFolder(items, undefined, { handle, expectedRevision: null });
        const stage = await createLibraryImportStage();
        try {
            for (const item of items) {
                const blobs: Partial<Record<LibraryAssetRole, Blob>> = {};
                for (const [role, ref] of Object.entries(item.assetRefs || {}) as [LibraryAssetRole, LibraryAssetRef][]) blobs[role] = await getLibraryAssetBlob(ref);
                await stage.add(item, blobs);
            }
            const committed = await stage.commit({ handle, revision: result.revision, dirty: false });
            needsReview = false; awaitingAccess = false;
            return committed.warnings;
        } finally { await stage.discard(); }
    });
};

export const recoverLibraryProject = async (key: string, replace: boolean, keepLocalRecovery = false): Promise<string[]> => {
    if (replace && !keepLocalRecovery && (await getLibraryProjectBinding())?.dirty && status.directoryName) await saveLibraryProjectNow();
    return runLibraryProjectOperation(async () => {
        const warnings = await restoreLibraryRecovery(key, replace);
        needsReview = false;
        return warnings;
    });
};
export const restorePreviousLibraryFolder = async (): Promise<string[]> => {
    return runLibraryProjectOperation(async () => {
        const binding = await getLibraryProjectBinding();
        if (!binding?.handle) throw new Error('No project folder is open.');
        if (!await ensureDirectoryPermission(binding.handle, 'read')) throw new Error('Permission to read the project folder was denied.');
        const result = await importLibraryFolder(undefined, { handle: binding.handle, previousManifest: true, replace: true });
        needsReview = false;
        return result.warnings;
    });
};

let stopSync = () => {};
export const startLibraryProjectSync = (): (() => void) => {
    if (started) return stopSync;
    started = true;
    const unsubscribe = subscribeLibraryChanges(() => {
        if (busy || awaitingAccess) return;
        publish({ phase: status.directoryName ? 'pending' : 'local', message: status.directoryName ? 'Changes waiting to save...' : 'Saved locally. No project folder open.' });
        if (status.directoryName) schedule();
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
        if (['pending', 'saving', 'error', 'busy'].includes(status.phase)) { event.preventDefault(); event.returnValue = ''; }
    };
    // The desktop app grants folder access without a prompt, so the first click or key reconnects silently.
    const reconnect = () => {
        if (!awaitingAccess || reconnectTried) return;
        reconnectTried = true;
        void reconnectLibraryProject().catch(failure);
    };
    window.addEventListener('beforeunload', beforeUnload);
    if (window.electron) { window.addEventListener('click', reconnect, true); window.addEventListener('keydown', reconnect, true); }
    stopSync = () => {
        started = false; clearTimeout(timer); unsubscribe(); window.removeEventListener('beforeunload', beforeUnload);
        window.removeEventListener('click', reconnect, true); window.removeEventListener('keydown', reconnect, true);
    };
    void (async () => {
        await withProjectLock(clearAbandonedLibraryImports);
        const handle = await getActiveLibraryFolderHandle();
        if (!handle) return;
        publish({ directoryName: handle.name });
        if (!await hasDirectoryPermission(handle, 'readwrite')) { pause(); return; }
        await verifyProjectFolder(handle);
    })().catch(error => { if (isAccessError(error)) pause(); else failure(error); });
    return stopSync;
};
