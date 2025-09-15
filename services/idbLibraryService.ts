import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { LibraryItem } from '../types';

const DB_NAME = 'ai-media-generator-library';
const DB_VERSION = 1;
const STORE_NAME = 'library-items';

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: LibraryItem;
    indexes: { 'mediaType': string; 'driveFileId': string };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('mediaType', 'mediaType');
        store.createIndex('driveFileId', 'driveFileId', { unique: false });
      },
    });
  }
  return dbPromise;
};

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'> | LibraryItem, useExistingId = false): Promise<LibraryItem> => {
  const db = await getDb();
  let newItem: LibraryItem;
  if (useExistingId && 'id' in item) {
    newItem = item as LibraryItem;
  } else {
    newItem = {
      ...item,
      id: Date.now(),
    };
  }
  await db.put(STORE_NAME, newItem);
  return newItem;
};

export const updateLibraryItem = async (id: number, propsToUpdate: Partial<LibraryItem>): Promise<void> => {
    const db = await getDb();
    const item = await db.get(STORE_NAME, id);
    if (item) {
        const updatedItem = { ...item, ...propsToUpdate };
        await db.put(STORE_NAME, updatedItem);
    }
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  const db = await getDb();
  const items = await db.getAll(STORE_NAME);
  return items.sort((a, b) => b.id - a.id); // Sort by most recent
};

export const deleteLibraryItem = async (id: number): Promise<void> => {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
};

export const clearLibrary = async (): Promise<void> => {
  const db = await getDb();
  await db.clear(STORE_NAME);
};