import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { LibraryAssetRef, LibraryAssetRole, LibraryItem } from '../types';

const DB_NAME = 'ai-media-generator-library';
const DB_VERSION = 2;
const STORE_NAME = 'library-items';
const ASSET_STORE_NAME = 'library-assets';

interface LibraryAssetRecord extends LibraryAssetRef {
  blob: Blob;
  sha256?: string;
}

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: number;
    value: LibraryItem;
    indexes: { 'mediaType': string; 'driveFileId': string };
  };
  [ASSET_STORE_NAME]: {
    key: string;
    value: LibraryAssetRecord;
  };
}

const ASSET_FIELDS: LibraryAssetRole[] = ['media', 'sourceImage', 'startFrame', 'endFrame', 'skeletonImage'];
const INLINE_MEDIA_TYPES = new Set(['prompt', 'color-palette', 'preset']);
export const ALWAYS_SFW_LIBRARY_TYPES = new Set<LibraryItem['mediaType']>(['color-palette', 'font']);
const objectUrlCache = new Map<string, string>();

export const requiresSfwLibraryRating = (mediaType: LibraryItem['mediaType']): boolean =>
  ALWAYS_SFW_LIBRARY_TYPES.has(mediaType);

const enforceRequiredSafetyRating = (item: LibraryItem): LibraryItem =>
  requiresSfwLibraryRating(item.mediaType) && item.safetyRating !== 'sfw'
    ? { ...item, safetyRating: 'sfw' }
    : item;

const revokeCachedAssetUrl = (assetId: string) => {
  const objectUrl = objectUrlCache.get(assetId);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrlCache.delete(assetId);
};

const createAssetId = (itemId: number, role: LibraryAssetRole) =>
  `${itemId}-${role}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const dataUrlToBlob = (dataUrl: string): Blob => {
  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex < 0) throw new Error('Invalid Library media data URL.');
  const header = dataUrl.slice(0, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';
  if (!header.includes(';base64')) return new Blob([decodeURIComponent(payload)], { type: mimeType });

  const chunks: Uint8Array[] = [];
  const encodedChunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < payload.length; offset += encodedChunkSize) {
    const decodedChunk = atob(payload.slice(offset, offset + encodedChunkSize));
    const bytes = new Uint8Array(decodedChunk.length);
    for (let index = 0; index < decodedChunk.length; index += 1) bytes[index] = decodedChunk.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: mimeType });
};

const externalizeItem = (item: LibraryItem): { metadata: LibraryItem; assets: LibraryAssetRecord[] } => {
  const metadata: LibraryItem = {
    ...item,
    assetRefs: { ...item.assetRefs },
    ltxDirectorOptions: item.ltxDirectorOptions ? {
      ...item.ltxDirectorOptions,
      segments: item.ltxDirectorOptions.segments.map(segment => ({ ...segment })),
    } : undefined,
  };
  const assets: LibraryAssetRecord[] = [];
  for (const role of ASSET_FIELDS) {
    const value = metadata[role];
    if (typeof value !== 'string' || !value.startsWith('data:')) continue;
    if (role === 'media' && INLINE_MEDIA_TYPES.has(metadata.mediaType)) continue;
    const blob = dataUrlToBlob(value);
    const id = createAssetId(metadata.id, role);
    const asset: LibraryAssetRecord = { id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size };
    assets.push(asset);
    metadata.assetRefs![role] = { id, mimeType: asset.mimeType, size: asset.size };
    metadata[role] = '';
  }
  for (let index = 0; index < (metadata.ltxDirectorOptions?.segments.length || 0); index += 1) {
    const segment = metadata.ltxDirectorOptions!.segments[index];
    if (!segment.sourceImage?.startsWith('data:')) continue;
    const role = `ltxSegmentSource:${index}` as const;
    const blob = dataUrlToBlob(segment.sourceImage);
    const id = createAssetId(metadata.id, role);
    const asset: LibraryAssetRecord = { id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size };
    assets.push(asset);
    metadata.assetRefs![role] = { id, mimeType: asset.mimeType, size: asset.size };
    segment.sourceImage = '';
  }
  if (Object.keys(metadata.assetRefs || {}).length === 0) delete metadata.assetRefs;
  return { metadata, assets };
};

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

const getDb = (): Promise<IDBPDatabase<MyDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('mediaType', 'mediaType');
          store.createIndex('driveFileId', 'driveFileId', { unique: false });
        }
        if (oldVersion < 2) {
          db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
        }
      },
      terminated() {
        // This is called if the connection is terminated abnormally.
        // We null out the dbPromise so a new connection will be opened on the next call.
        dbPromise = null;
        console.error('The IndexedDB connection was terminated unexpectedly. A new connection will be attempted on the next operation.');
      },
      blocked(currentVersion, blockedVersion) {
        console.warn(`Library database upgrade from version ${currentVersion} to ${blockedVersion} is waiting for another application window to close its connection.`);
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        dbPromise = null;
      }
    });
  }
  return dbPromise;
};

const migrateLegacyItems = async (db: IDBPDatabase<MyDB>): Promise<void> => {
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  const itemStore = tx.objectStore(STORE_NAME);
  const assetStore = tx.objectStore(ASSET_STORE_NAME);
  let cursor = await itemStore.openCursor();
  while (cursor) {
    const { metadata, assets } = externalizeItem(cursor.value);
    if (assets.length > 0) {
      for (const asset of assets) await assetStore.put(asset);
      await cursor.update(metadata);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};

const saveExternalizedItem = async (db: IDBPDatabase<MyDB>, item: LibraryItem): Promise<LibraryItem> => {
  const existing = await db.get(STORE_NAME, item.id);
  const { metadata, assets } = externalizeItem(enforceRequiredSafetyRating(item));
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  for (const asset of assets) await tx.objectStore(ASSET_STORE_NAME).put(asset);
  await tx.objectStore(STORE_NAME).put(metadata);
  await tx.done;

  const retainedIds = new Set(Object.values(metadata.assetRefs || {}).map(ref => ref?.id).filter(Boolean));
  const staleRefs = Object.values(existing?.assetRefs || {}).filter(ref => ref && !retainedIds.has(ref.id));
  for (const ref of staleRefs) {
    await db.delete(ASSET_STORE_NAME, ref!.id);
    revokeCachedAssetUrl(ref!.id);
  }
  return metadata;
};

export const saveLibraryItemWithBlobs = async (
  item: LibraryItem,
  blobs: Partial<Record<LibraryAssetRole, Blob>>,
  hashes: Partial<Record<LibraryAssetRole, string>> = {},
): Promise<LibraryItem> => {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, item.id);
  const metadata: LibraryItem = { ...enforceRequiredSafetyRating(item), assetRefs: { ...item.assetRefs } };
  const records: LibraryAssetRecord[] = [];
  for (const [role, blob] of Object.entries(blobs) as [LibraryAssetRole, Blob][]) {
    if (!blob) continue;
    const id = createAssetId(item.id, role);
    const record: LibraryAssetRecord = { id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size, sha256: hashes[role] };
    records.push(record);
    metadata.assetRefs![role] = { id, mimeType: record.mimeType, size: record.size };
    if (role.startsWith('ltxSegmentSource:')) {
      const segmentIndex = Number(role.split(':')[1]);
      if (metadata.ltxDirectorOptions?.segments[segmentIndex]) metadata.ltxDirectorOptions.segments[segmentIndex].sourceImage = '';
    } else {
      metadata[role] = '';
    }
  }
  if (Object.keys(metadata.assetRefs || {}).length === 0) delete metadata.assetRefs;

  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  for (const record of records) await tx.objectStore(ASSET_STORE_NAME).put(record);
  await tx.objectStore(STORE_NAME).put(metadata);
  const retainedIds = new Set(Object.values(metadata.assetRefs || {}).map(ref => ref?.id).filter(Boolean));
  for (const ref of Object.values(existing?.assetRefs || {})) {
    if (ref && !retainedIds.has(ref.id)) await tx.objectStore(ASSET_STORE_NAME).delete(ref.id);
  }
  await tx.done;
  for (const ref of Object.values(existing?.assetRefs || {})) {
    if (ref && !retainedIds.has(ref.id)) revokeCachedAssetUrl(ref.id);
  }
  return metadata;
};

export const getLibraryAssetBlob = async (ref: LibraryAssetRef): Promise<Blob> => {
  const db = await getDb();
  const asset = await db.get(ASSET_STORE_NAME, ref.id);
  if (!asset) throw new Error(`Library asset ${ref.id} is missing.`);
  return asset.blob;
};

export const getLibraryAssetHash = async (ref: LibraryAssetRef): Promise<string | undefined> => {
  const db = await getDb();
  return (await db.get(ASSET_STORE_NAME, ref.id))?.sha256;
};

export const saveLibraryAssetHash = async (ref: LibraryAssetRef, sha256: string): Promise<void> => {
  const db = await getDb();
  const asset = await db.get(ASSET_STORE_NAME, ref.id);
  if (!asset || asset.sha256 === sha256) return;
  await db.put(ASSET_STORE_NAME, { ...asset, sha256 });
};

export const createLibraryAssetObjectUrl = async (ref: LibraryAssetRef): Promise<string> =>
  URL.createObjectURL(await getLibraryAssetBlob(ref));

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
  return saveExternalizedItem(db, newItem);
};

export const updateLibraryItem = async (id: number, propsToUpdate: Partial<LibraryItem>): Promise<void> => {
    const db = await getDb();
    const item = await db.get(STORE_NAME, id);
    if (item) {
        const updatedItem = { ...item, ...propsToUpdate };
        for (const role of ASSET_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(propsToUpdate, role)) continue;
          const value = propsToUpdate[role];
          if (typeof value === 'string' && value.startsWith('data:')) continue;
          if (updatedItem.assetRefs) delete updatedItem.assetRefs[role];
        }
        await saveExternalizedItem(db, updatedItem);
    }
};

export const updateLibraryItems = async (updates: Array<{ id: number; changes: Partial<LibraryItem> }>): Promise<void> => {
  if (updates.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const { id, changes } of updates) {
    const item = await store.get(id);
    if (item) await store.put(enforceRequiredSafetyRating({ ...item, ...changes }));
  }
  await tx.done;
};

export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  const db = await getDb();
  await migrateLegacyItems(db);
  const items = await db.getAll(STORE_NAME);
  const normalizedItems = items.map(enforceRequiredSafetyRating);
  await Promise.all(normalizedItems
    .filter((item, index) => item !== items[index])
    .map(item => db.put(STORE_NAME, item)));
  return normalizedItems.sort((a, b) => b.id - a.id); // Sort by most recent
};

export const getItemById = async (id: number): Promise<LibraryItem | undefined> => {
    const db = await getDb();
    return db.get(STORE_NAME, id);
};

export const hydrateLibraryItem = async (item: LibraryItem): Promise<LibraryItem> => {
  if (!item.assetRefs) return { ...item };
  const db = await getDb();
  const hydrated: LibraryItem = {
    ...item,
    ltxDirectorOptions: item.ltxDirectorOptions ? {
      ...item.ltxDirectorOptions,
      segments: item.ltxDirectorOptions.segments.map(segment => ({ ...segment })),
    } : undefined,
  };
  for (const [role, ref] of Object.entries(item.assetRefs) as [LibraryAssetRole, LibraryAssetRef][]) {
    let objectUrl = objectUrlCache.get(ref.id);
    if (!objectUrl) {
      const asset = await db.get(ASSET_STORE_NAME, ref.id);
      if (!asset) throw new Error(`Library asset ${ref.id} is missing.`);
      objectUrl = URL.createObjectURL(asset.blob);
      objectUrlCache.set(ref.id, objectUrl);
    }
    if (role.startsWith('ltxSegmentSource:')) {
      const segmentIndex = Number(role.split(':')[1]);
      if (hydrated.ltxDirectorOptions?.segments[segmentIndex]) hydrated.ltxDirectorOptions.segments[segmentIndex].sourceImage = objectUrl;
    } else {
      hydrated[role] = objectUrl;
    }
  }
  return hydrated;
};

export const deleteLibraryItem = async (id: number): Promise<void> => {
  const db = await getDb();
  const item = await db.get(STORE_NAME, id);
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).delete(id);
  for (const ref of Object.values(item?.assetRefs || {})) {
    if (!ref) continue;
    await tx.objectStore(ASSET_STORE_NAME).delete(ref.id);
    revokeCachedAssetUrl(ref.id);
  }
  await tx.done;
};

export const deleteLibraryItems = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  const itemStore = tx.objectStore(STORE_NAME);
  const assetStore = tx.objectStore(ASSET_STORE_NAME);
  const deletedAssetIds: string[] = [];
  for (const id of ids) {
    const item = await itemStore.get(id);
    for (const ref of Object.values(item?.assetRefs || {})) {
      if (!ref) continue;
      await assetStore.delete(ref.id);
      deletedAssetIds.push(ref.id);
    }
    await itemStore.delete(id);
  }
  await tx.done;
  deletedAssetIds.forEach(revokeCachedAssetUrl);
};

export const clearLibrary = async (): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME], 'readwrite');
  await Promise.all([tx.objectStore(STORE_NAME).clear(), tx.objectStore(ASSET_STORE_NAME).clear()]);
  await tx.done;
  for (const objectUrl of objectUrlCache.values()) URL.revokeObjectURL(objectUrl);
  objectUrlCache.clear();
};

export const bulkSaveToLibrary = async (items: LibraryItem[]): Promise<void> => {
    const db = await getDb();
  for (const item of items) await saveExternalizedItem(db, item);
};