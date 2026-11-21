import { openDB, DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { LibraryAssetRef, LibraryAssetRole, LibraryItem } from '../types';
import { cloneVideoPromptLibraryOptions, setVideoPromptLibraryAsset } from './videoPromptLibrary';

const DB_NAME = 'ai-media-generator-library';
const DB_VERSION = 3;
const STORE_NAME = 'library-items';
const ASSET_STORE_NAME = 'library-assets';
const PROJECT_STORE = 'library-project-state';
const STAGING_STORE = 'library-import-staging';
const RECOVERY_STORE = 'library-recovery';

export interface LibraryProjectBinding {
  handle: FileSystemDirectoryHandle | null;
  revision: string | null;
  dirty: boolean;
  generation?: number;
  projectKey?: string;
}

interface StagedLibraryItem {
  key: string;
  metadata: LibraryItem;
  assets: LibraryAssetRecord[];
}

interface LibraryRecovery {
  key: string;
  createdAt: string;
  items: LibraryItem[];
  assets: LibraryAssetRecord[];
  binding: LibraryProjectBinding;
}

const changeListeners = new Set<() => void>();
let projectTransition = false;
let projectEpoch = 0;
export const subscribeLibraryChanges = (listener: () => void): (() => void) => {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
};
const publishLibraryChange = () => { for (const listener of changeListeners) listener(); };
const assertLibraryWritable = (expectedEpoch = projectEpoch) => {
  if (projectTransition || expectedEpoch !== projectEpoch) throw new Error('A project is being opened or imported. Wait for it to finish before saving Library items.');
};
export const getLibraryProjectEpoch = () => projectEpoch;
export const assertLibraryProjectEpoch = assertLibraryWritable;
export const lockLibraryProject = (): (() => void) => {
  assertLibraryWritable();
  projectTransition = true;
  projectEpoch++;
  return () => { projectTransition = false; };
};

interface LibraryAssetRecord extends LibraryAssetRef {
  blob: Blob;
  sha256?: string;
}

interface MyDB extends DBSchema {
  [PROJECT_STORE]: { key: string; value: LibraryProjectBinding };
  [STAGING_STORE]: { key: string; value: StagedLibraryItem };
  [RECOVERY_STORE]: { key: string; value: LibraryRecovery };
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

const ASSET_FIELDS: LibraryAssetRole[] = ['media', 'sourceImage', 'startFrame', 'endFrame', 'skeletonImage', 'characterSceneImage', 'ltxAudioSyncAudio', 'ltxAudioSyncOriginalAudio', 'ltxRippleVideo'];
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
    qwen21MultiSources: item.qwen21MultiSources?.slice(),
    videoPromptOptions: cloneVideoPromptLibraryOptions(item.videoPromptOptions),
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
  for (const [index, source] of (metadata.qwen21MultiSources || []).entries()) {
    if (!source.startsWith('data:')) continue;
    const role = `qwen21MultiSource:${index}` as const;
    const blob = dataUrlToBlob(source);
    const id = createAssetId(metadata.id, role);
    const asset: LibraryAssetRecord = { id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size };
    assets.push(asset);
    metadata.assetRefs![role] = { id, mimeType: asset.mimeType, size: asset.size };
    metadata.qwen21MultiSources![index] = '';
  }
  for (const [index, ref] of (metadata.videoPromptOptions?.references || []).entries()) {
    for (const [prefix, file] of [['videoPromptReference', ref.file], ['videoPromptOriginal', ref.original]] as const) {
      if (!file?.data.startsWith('data:')) continue;
      const role = `${prefix}:${index}` as const;
      const blob = dataUrlToBlob(file.data);
      const id = createAssetId(metadata.id, role);
      const asset: LibraryAssetRecord = { id, blob, mimeType: blob.type || file.type, size: blob.size };
      assets.push(asset);
      metadata.assetRefs![role] = { id, mimeType: asset.mimeType, size: asset.size };
      setVideoPromptLibraryAsset(metadata, role, '');
    }
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
        if (oldVersion < 3) {
          db.createObjectStore(PROJECT_STORE);
          db.createObjectStore(STAGING_STORE, { keyPath: 'key' });
          db.createObjectStore(RECOVERY_STORE, { keyPath: 'key' });
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

const emptyBinding = (): LibraryProjectBinding => ({ handle: null, revision: null, dirty: true, projectKey: crypto.randomUUID() });
const markProjectDirty = async <Stores extends Array<StoreNames<MyDB>>>(tx: IDBPTransaction<MyDB, Stores, 'readwrite'>) => {
  const store = tx.objectStore(PROJECT_STORE);
  const binding = await store.get('active') || emptyBinding();
  await store.put({ ...binding, dirty: true, generation: (binding.generation || 0) + 1 }, 'active');
};
export const getLibraryProjectBinding = async (): Promise<LibraryProjectBinding | undefined> =>
  (await getDb()).get(PROJECT_STORE, 'active');
export const setLibraryProjectBinding = async (binding: LibraryProjectBinding): Promise<void> => {
  await (await getDb()).put(PROJECT_STORE, binding, 'active');
};
export const assertLibraryProjectUnchanged = async (projectKey: string | undefined): Promise<void> => {
  const current = await getLibraryProjectBinding();
  if (current?.projectKey !== projectKey) throw new Error('The active project changed while this Library save was preparing. Nothing was saved to the new project; save the result again deliberately.');
  assertLibraryWritable();
};
export const completeLibraryProjectSave = async (revision: string, generation: number): Promise<boolean> => {
  const tx = (await getDb()).transaction(PROJECT_STORE, 'readwrite');
  const binding = await tx.store.get('active');
  if (!binding?.handle) throw new Error('The active project changed while saving.');
  const dirty = (binding.generation || 0) !== generation;
  await tx.store.put({ ...binding, revision, dirty }, 'active');
  await tx.done;
  return !dirty;
};

export const setLibraryAssetValue = (item: LibraryItem, role: LibraryAssetRole, value: string): void => {
  if (!isLibraryAssetRole(role)) throw new Error(`Unsupported Library asset role: ${role}`);
  if (role.startsWith('videoPromptReference:') || role.startsWith('videoPromptOriginal:')) {
    setVideoPromptLibraryAsset(item, role, value);
  } else if (role.startsWith('qwen21MultiSource:')) {
    if (!item.qwen21MultiSources) throw new Error(`Missing source metadata for ${role}.`);
    item.qwen21MultiSources[Number(role.split(':')[1])] = value;
  } else if (role.startsWith('ltxSegmentSource:')) {
    const segment = item.ltxDirectorOptions?.segments[Number(role.split(':')[1])];
    if (!segment) throw new Error(`Missing segment metadata for ${role}.`);
    segment.sourceImage = value;
  } else {
    item[role] = value;
  }
};
export const isLibraryAssetRole = (role: string): role is LibraryAssetRole =>
  ASSET_FIELDS.includes(role as LibraryAssetRole) || /^(ltxSegmentSource|qwen21MultiSource|videoPromptReference|videoPromptOriginal):\d+$/.test(role);

export const createLibraryImportStage = async () => {
  const db = await getDb(), session = `${crypto.randomUUID()}:`;
  const seen = new Set<number>();
  const discard = async () => {
    const tx = db.transaction(STAGING_STORE, 'readwrite');
    let cursor = await tx.store.openCursor(IDBKeyRange.bound(session, `${session}\uffff`));
    while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
    await tx.done;
  };
  return {
    async add(item: LibraryItem, blobs: Partial<Record<LibraryAssetRole, Blob>> = {}, hashes: Partial<Record<LibraryAssetRole, string>> = {}) {
      if (!Number.isSafeInteger(item?.id) || typeof item.mediaType !== 'string' || typeof item.media !== 'string') throw new Error('Invalid Library item in import.');
      if (seen.has(item.id)) throw new Error(`Duplicate Library item ID ${item.id}.`);
      seen.add(item.id);
      const { assetRefs: _refs, ...portable } = item;
      const { metadata, assets } = externalizeItem(enforceRequiredSafetyRating(structuredClone(portable)));
      for (const role of Object.keys(_refs || {}) as LibraryAssetRole[]) {
        if (!blobs[role] && !metadata.assetRefs?.[role]) throw new Error(`The imported item "${item.name || item.id}" contains local asset references without their original media. Import a portable JSON backup or archive instead.`);
      }
      for (const [role, blob] of Object.entries(blobs) as [LibraryAssetRole, Blob][]) {
        const id = createAssetId(item.id, role);
        assets.push({ id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size, sha256: hashes[role] });
        metadata.assetRefs ||= {};
        metadata.assetRefs[role] = { id, mimeType: blob.type || 'application/octet-stream', size: blob.size };
        setLibraryAssetValue(metadata, role, '');
      }
      if (/"blob:[^"]*"/.test(JSON.stringify(metadata))) throw new Error(`The imported item "${item.name || item.id}" contains a temporary blob URL without original media.`);
      await db.put(STAGING_STORE, { key: `${session}${item.id}`, metadata, assets });
    },
    async commit(binding?: LibraryProjectBinding) {
      const staged = await db.getAll(STAGING_STORE, IDBKeyRange.bound(session, `${session}\uffff`));
      const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME, STAGING_STORE, RECOVERY_STORE, PROJECT_STORE], 'readwrite');
      const warnings: string[] = [];
      try {
        const current = await tx.objectStore(STORE_NAME).getAll();
        const currentBinding = await tx.objectStore(PROJECT_STORE).get('active') || emptyBinding();
        const recovery: LibraryRecovery = {
          key: 'previous', createdAt: new Date().toISOString(), items: current,
          assets: await tx.objectStore(ASSET_STORE_NAME).getAll(), binding: currentBinding,
        };
        await tx.objectStore(RECOVERY_STORE).put(recovery);
        if (binding && currentBinding.dirty && current.length) {
          await tx.objectStore(RECOVERY_STORE).put({ ...recovery, key: `project:${currentBinding.projectKey || 'local'}` });
        }
        if (binding) {
          await tx.objectStore(STORE_NAME).clear();
          await tx.objectStore(ASSET_STORE_NAME).clear();
        }
        const usedIds = new Set(binding ? [] : current.map(item => item.id));
        let nextId = [...current, ...staged.map(item => item.metadata)].reduce((max, item) => Math.max(max, item.id), Date.now());
        const remap = new Map<number, number>();
        for (const entry of staged) {
          const id = entry.metadata.id;
          if (usedIds.has(id)) {
            nextId++;
            if (!Number.isSafeInteger(nextId)) throw new Error('Cannot allocate a safe Library item ID.');
            remap.set(id, nextId);
          } else remap.set(id, id);
          usedIds.add(remap.get(id)!);
        }
        for (const entry of staged) {
          const metadata = { ...entry.metadata, id: remap.get(entry.metadata.id)! };
          if (metadata.linkedResultId !== undefined) {
            const linked = remap.get(metadata.linkedResultId);
            if (linked === undefined) warnings.push(`"${metadata.name || metadata.id}": linked result ${metadata.linkedResultId} was not in the source. Its link was removed to avoid pointing to an unrelated local item.`);
            metadata.linkedResultId = linked;
          }
          for (const asset of entry.assets) await tx.objectStore(ASSET_STORE_NAME).put(asset);
          await tx.objectStore(STORE_NAME).put(metadata);
          await tx.objectStore(STAGING_STORE).delete(entry.key);
        }
        await tx.objectStore(PROJECT_STORE).put(binding ? { ...binding, dirty: binding.dirty || warnings.length > 0, projectKey: crypto.randomUUID() }
          : { ...currentBinding, dirty: true, generation: (currentBinding.generation || 0) + 1 }, 'active');
        await tx.done;
      } catch (error) {
        try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
        await tx.done.catch(() => undefined);
        throw error;
      }
      for (const url of objectUrlCache.values()) URL.revokeObjectURL(url);
      objectUrlCache.clear();
      publishLibraryChange();
      return { imported: staged.length, warnings };
    },
    discard,
  };
};

export const getLibraryRecoveryEntries = async () =>
  (await (await getDb()).getAll(RECOVERY_STORE)).map(({ key, createdAt, items, binding }) =>
    ({ key, createdAt, count: items.length, projectName: binding.handle?.name || 'Local Library' }));
export const clearLibraryTrash = async (): Promise<void> => {
  const db = await getDb(), tx = db.transaction(RECOVERY_STORE, 'readwrite');
  let cursor = await tx.store.openCursor(IDBKeyRange.bound('trash:', 'trash:\uffff'));
  while (cursor) { await cursor.delete(); cursor = await cursor.continue(); }
  await tx.done;
};
export const deleteLibraryRecovery = async (key: string): Promise<void> => {
  await (await getDb()).delete(RECOVERY_STORE, key);
};
export const clearAbandonedLibraryImports = async (): Promise<void> => {
  await (await getDb()).clear(STAGING_STORE);
};

export const restoreLibraryRecovery = async (key: string, replace: boolean): Promise<string[]> => {
  const recovery = await (await getDb()).get(RECOVERY_STORE, key);
  if (!recovery) throw new Error('The recovery is no longer available.');
  const stage = await createLibraryImportStage();
  try {
    const byId = new Map(recovery.assets.map(asset => [asset.id, asset]));
    for (const item of recovery.items) {
      const blobs: Partial<Record<LibraryAssetRole, Blob>> = {};
      for (const [role, ref] of Object.entries(item.assetRefs || {}) as [LibraryAssetRole, LibraryAssetRef][]) {
        const asset = byId.get(ref.id);
        if (!asset) throw new Error(`Recovery asset ${ref.id} is missing.`);
        blobs[role] = asset.blob;
      }
      await stage.add(item, blobs);
    }
    const result = await stage.commit(replace ? { ...recovery.binding, dirty: true } : undefined);
    if (key !== 'previous') await (await getDb()).delete(RECOVERY_STORE, key);
    return result.warnings;
  } finally { await stage.discard(); }
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

const saveExternalizedItem = async (db: IDBPDatabase<MyDB>, item: LibraryItem, epoch = projectEpoch, insertOnly = false): Promise<LibraryItem> => {
  assertLibraryWritable(epoch);
  const existing = await db.get(STORE_NAME, item.id);
  const { metadata, assets } = externalizeItem(enforceRequiredSafetyRating(item));
  assertLibraryWritable(epoch);
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME, PROJECT_STORE], 'readwrite');
  for (const asset of assets) await tx.objectStore(ASSET_STORE_NAME).put(asset);
  if (insertOnly) await tx.objectStore(STORE_NAME).add(metadata);
  else await tx.objectStore(STORE_NAME).put(metadata);
  await markProjectDirty(tx);
  const retainedIds = new Set(Object.values(metadata.assetRefs || {}).map(ref => ref?.id).filter(Boolean));
  const staleRefs = Object.values(existing?.assetRefs || {}).filter(ref => ref && !retainedIds.has(ref.id));
  for (const ref of staleRefs) {
    await tx.objectStore(ASSET_STORE_NAME).delete(ref!.id);
  }
  await tx.done;
  for (const ref of staleRefs) revokeCachedAssetUrl(ref!.id);
  publishLibraryChange();
  return metadata;
};

export const saveLibraryItemWithBlobs = async (
  item: LibraryItem,
  blobs: Partial<Record<LibraryAssetRole, Blob>>,
  hashes: Partial<Record<LibraryAssetRole, string>> = {},
  epoch = projectEpoch,
  insertOnly = false,
): Promise<LibraryItem> => {
  assertLibraryWritable(epoch);
  const db = await getDb();
  const existing = await db.get(STORE_NAME, item.id);
  const metadata: LibraryItem = { ...enforceRequiredSafetyRating(item), assetRefs: { ...item.assetRefs }, qwen21MultiSources: item.qwen21MultiSources?.slice(), videoPromptOptions: cloneVideoPromptLibraryOptions(item.videoPromptOptions) };
  const records: LibraryAssetRecord[] = [];
  for (const [role, blob] of Object.entries(blobs) as [LibraryAssetRole, Blob][]) {
    if (!blob) continue;
    const id = createAssetId(item.id, role);
    const record: LibraryAssetRecord = { id, blob, mimeType: blob.type || 'application/octet-stream', size: blob.size, sha256: hashes[role] };
    records.push(record);
    metadata.assetRefs![role] = { id, mimeType: record.mimeType, size: record.size };
    if (role.startsWith('videoPromptReference:') || role.startsWith('videoPromptOriginal:')) {
      setVideoPromptLibraryAsset(metadata, role, '');
    } else if (role.startsWith('qwen21MultiSource:')) {
      if (metadata.qwen21MultiSources) metadata.qwen21MultiSources[Number(role.split(':')[1])] = '';
    } else if (role.startsWith('ltxSegmentSource:')) {
      const segmentIndex = Number(role.split(':')[1]);
      if (metadata.ltxDirectorOptions?.segments[segmentIndex]) metadata.ltxDirectorOptions.segments[segmentIndex].sourceImage = '';
    } else {
      metadata[role] = '';
    }
  }
  if (Object.keys(metadata.assetRefs || {}).length === 0) delete metadata.assetRefs;

  assertLibraryWritable(epoch);
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME, PROJECT_STORE], 'readwrite');
  for (const record of records) await tx.objectStore(ASSET_STORE_NAME).put(record);
  if (insertOnly) await tx.objectStore(STORE_NAME).add(metadata);
  else await tx.objectStore(STORE_NAME).put(metadata);
  const retainedIds = new Set(Object.values(metadata.assetRefs || {}).map(ref => ref?.id).filter(Boolean));
  for (const ref of Object.values(existing?.assetRefs || {})) {
    if (ref && !retainedIds.has(ref.id)) await tx.objectStore(ASSET_STORE_NAME).delete(ref.id);
  }
  await markProjectDirty(tx);
  await tx.done;
  for (const ref of Object.values(existing?.assetRefs || {})) {
    if (ref && !retainedIds.has(ref.id)) revokeCachedAssetUrl(ref.id);
  }
  publishLibraryChange();
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

let lastAllocatedId = 0;
export const saveToLibrary = async (item: Omit<LibraryItem, 'id'> | LibraryItem, useExistingId = false, blobs?: Partial<Record<LibraryAssetRole, Blob>>): Promise<LibraryItem> => {
  const epoch = projectEpoch;
  const db = await getDb();
  let newItem: LibraryItem;
  if (useExistingId && 'id' in item) {
    newItem = item as LibraryItem;
  } else {
    let id: number;
    do { id = lastAllocatedId = Math.max(Date.now(), lastAllocatedId + 1); } while (await db.get(STORE_NAME, id));
    newItem = {
      ...item,
      id,
    };
  }
  return blobs ? saveLibraryItemWithBlobs(newItem, blobs, {}, epoch, !useExistingId) : saveExternalizedItem(db, newItem, epoch, !useExistingId);
};

export const updateLibraryItem = async (id: number, propsToUpdate: Partial<LibraryItem>): Promise<void> => {
    const epoch = projectEpoch;
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
        await saveExternalizedItem(db, updatedItem, epoch);
    }
};

export const updateLibraryItems = async (updates: Array<{ id: number; changes: Partial<LibraryItem> }>): Promise<void> => {
  const epoch = projectEpoch;
  assertLibraryWritable();
  if (updates.length === 0) return;
  const db = await getDb();
  assertLibraryWritable(epoch);
  const tx = db.transaction([STORE_NAME, PROJECT_STORE], 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const { id, changes } of updates) {
    const item = await store.get(id);
    if (item) await store.put(enforceRequiredSafetyRating({ ...item, ...changes }));
  }
  await markProjectDirty(tx);
  await tx.done;
  publishLibraryChange();
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
    qwen21MultiSources: item.qwen21MultiSources?.slice(),
    videoPromptOptions: cloneVideoPromptLibraryOptions(item.videoPromptOptions),
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
    if (role.startsWith('videoPromptReference:') || role.startsWith('videoPromptOriginal:')) {
      setVideoPromptLibraryAsset(hydrated, role, objectUrl);
    } else if (role.startsWith('qwen21MultiSource:')) {
      if (hydrated.qwen21MultiSources) hydrated.qwen21MultiSources[Number(role.split(':')[1])] = objectUrl;
    } else if (role.startsWith('ltxSegmentSource:')) {
      const segmentIndex = Number(role.split(':')[1]);
      if (hydrated.ltxDirectorOptions?.segments[segmentIndex]) hydrated.ltxDirectorOptions.segments[segmentIndex].sourceImage = objectUrl;
    } else {
      hydrated[role] = objectUrl;
    }
  }
  return hydrated;
};

export const deleteLibraryItem = async (id: number): Promise<void> => {
  await deleteLibraryItems([id]);
};

export const deleteLibraryItems = async (ids: number[]): Promise<void> => {
  const epoch = projectEpoch;
  assertLibraryWritable();
  if (ids.length === 0) return;
  const db = await getDb();
  assertLibraryWritable(epoch);
  const tx = db.transaction([STORE_NAME, ASSET_STORE_NAME, RECOVERY_STORE, PROJECT_STORE], 'readwrite');
  const itemStore = tx.objectStore(STORE_NAME);
  const assetStore = tx.objectStore(ASSET_STORE_NAME);
  const deletedAssetIds: string[] = [];
  const binding = await tx.objectStore(PROJECT_STORE).get('active') || { handle: null, revision: null, dirty: true };
  for (const id of ids) {
    const item = await itemStore.get(id);
    if (!item) continue;
    const assets: LibraryAssetRecord[] = [];
    for (const ref of Object.values(item?.assetRefs || {})) {
      if (!ref) continue;
      const asset = await assetStore.get(ref.id);
      if (!asset) { tx.abort(); throw new Error(`Library asset ${ref.id} is missing; deletion was cancelled.`); }
      assets.push(asset);
      await assetStore.delete(ref.id);
      deletedAssetIds.push(ref.id);
    }
    await tx.objectStore(RECOVERY_STORE).put({ key: `trash:${id}:${crypto.randomUUID()}`, createdAt: new Date().toISOString(), items: [item], assets, binding });
    await itemStore.delete(id);
  }
  await markProjectDirty(tx);
  await tx.done;
  deletedAssetIds.forEach(revokeCachedAssetUrl);
  publishLibraryChange();
};

export const clearLibrary = async (): Promise<void> => {
  await deleteLibraryItems((await getLibraryItems()).map(item => item.id));
};

export const bulkSaveToLibrary = async (items: LibraryItem[]): Promise<void> => {
  const epoch = projectEpoch;
    const db = await getDb();
  for (const item of items) await saveExternalizedItem(db, item, epoch);
};