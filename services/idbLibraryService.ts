import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { LibraryItem } from '../types';

const DB_NAME = 'ai-media-generator-library';
const DB_VERSION = 1;
const STORE_NAME = 'library-items';

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: LibraryItem;
    indexes: { 'mediaType': string };
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
      },
    });
  }
  return dbPromise;
};

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<void> => {
  const db = await getDb();
  const newItem: LibraryItem = {
    ...item,
    id: Date.now(),
  };
  await db.put(STORE_NAME, newItem);
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
