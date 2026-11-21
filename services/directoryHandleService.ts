import { openDB } from 'idb';
import { getLibraryProjectBinding, setLibraryProjectBinding } from './idbLibraryService';

declare global {
	type FileSystemPermissionMode = 'read' | 'readwrite';
	interface FileSystemHandlePermissionDescriptor { mode: FileSystemPermissionMode }
	interface FileSystemDirectoryHandle {
		queryPermission(options: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
		requestPermission(options: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
		values(): AsyncIterableIterator<FileSystemHandle>;
	}
}

const DB_NAME = 'lawiz-directory-handles';
const STORE_NAME = 'handles';
const ACTIVE_LIBRARY_FOLDER_KEY = 'active-library-folder';
let migration: Promise<FileSystemDirectoryHandle | null> | undefined;

const getDb = () => openDB(DB_NAME, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
	},
});

export const saveActiveLibraryFolderHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
	await setLibraryProjectBinding({ handle, revision: null, dirty: true, projectKey: crypto.randomUUID() });
};

export const getActiveLibraryFolderHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
	const binding = await getLibraryProjectBinding();
	if (binding) return binding.handle;
	if (!migration) migration = (async () => {
		const db = await getDb();
		const handle: FileSystemDirectoryHandle | null = (await db.get(STORE_NAME, ACTIVE_LIBRARY_FOLDER_KEY)) || null;
		const existing = await getLibraryProjectBinding();
		if (existing) return existing.handle;
		await setLibraryProjectBinding({ handle, revision: null, dirty: true, projectKey: crypto.randomUUID() });
		return handle;
	})();
	try { return await migration; }
	finally { migration = undefined; }
};

export const clearActiveLibraryFolderHandle = async (): Promise<void> => {
	await setLibraryProjectBinding({ handle: null, revision: null, dirty: true, projectKey: crypto.randomUUID() });
	const db = await getDb();
	await db.delete(STORE_NAME, ACTIVE_LIBRARY_FOLDER_KEY);
};

/** Asks without prompting, so it is safe outside a user action. */
export const hasDirectoryPermission = async (handle: FileSystemDirectoryHandle, mode: FileSystemPermissionMode): Promise<boolean> =>
	typeof handle.queryPermission !== 'function' || await handle.queryPermission({ mode }) === 'granted';

export const ensureDirectoryPermission = async (
	handle: FileSystemDirectoryHandle,
	mode: FileSystemPermissionMode,
): Promise<boolean> => {
	if (typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') return true;
	const options: FileSystemHandlePermissionDescriptor = { mode };
	if (await handle.queryPermission(options) === 'granted') return true;
	return await handle.requestPermission(options) === 'granted';
};
