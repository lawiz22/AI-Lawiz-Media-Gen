import { openDB } from 'idb';

const DB_NAME = 'lawiz-directory-handles';
const STORE_NAME = 'handles';
const ACTIVE_LIBRARY_FOLDER_KEY = 'active-library-folder';
let activeLibraryFolderHandle: FileSystemDirectoryHandle | null = null;

const getDb = () => openDB(DB_NAME, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
	},
});

export const saveActiveLibraryFolderHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
	activeLibraryFolderHandle = handle;
	const db = await getDb();
	try {
		await db.put(STORE_NAME, handle, ACTIVE_LIBRARY_FOLDER_KEY);
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'DataCloneError')) throw error;
	}
};

export const getActiveLibraryFolderHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
	if (activeLibraryFolderHandle) return activeLibraryFolderHandle;
	const db = await getDb();
	activeLibraryFolderHandle = (await db.get(STORE_NAME, ACTIVE_LIBRARY_FOLDER_KEY)) || null;
	return activeLibraryFolderHandle;
};

export const clearActiveLibraryFolderHandle = async (): Promise<void> => {
	activeLibraryFolderHandle = null;
	const db = await getDb();
	await db.delete(STORE_NAME, ACTIVE_LIBRARY_FOLDER_KEY);
};

export const ensureDirectoryPermission = async (
	handle: FileSystemDirectoryHandle,
	mode: FileSystemPermissionMode,
): Promise<boolean> => {
	if (typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') return true;
	const options: FileSystemHandlePermissionDescriptor = { mode };
	if (await handle.queryPermission(options) === 'granted') return true;
	return await handle.requestPermission(options) === 'granted';
};
