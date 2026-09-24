// Fix: Add a global declaration for window.showSaveFilePicker to resolve TypeScript errors.
declare global {
    interface Window {
        showSaveFilePicker: (options?: any) => Promise<any>;
        showOpenFilePicker: (options?: any) => Promise<any[]>;
        showDirectoryPicker: (options?: any) => Promise<any>;
    }
}

import type { LibraryItem } from '../types';
import { JSONParser } from '@streamparser/json';
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter, configure as configureZip } from '@zip.js/zip.js';
import { createSHA256 } from 'hash-wasm';
import type { LibraryAssetRole } from '../types';
import * as idbService from './idbLibraryService';
import { ensureDirectoryPermission, getActiveLibraryFolderHandle, saveActiveLibraryFolderHandle } from './directoryHandleService';
import { dataUrlToBlob, dataUrlToThumbnail } from '../utils/imageUtils';
import * as googleDriveService from './googleDriveService';
import { generateTitleForImage, summarizePrompt } from './geminiService';

// Electron cannot reliably resolve zip.js WASM from its generated data: worker URL.
configureZip({ useWebWorkers: false, useCompressionStream: true });

let driveService: typeof googleDriveService | null = null;

// Fix: Redefined types to match googleDriveService to resolve 'any' type issues.
type LibraryItemMetadata = Omit<LibraryItem, 'media' | 'thumbnail'> | LibraryItem;
type LibraryIndex = { version: number; items: Record<string, LibraryItemMetadata> };

const withoutLocalAssetRefs = (item: LibraryItem) => {
    const { assetRefs, ...portableItem } = item;
    return portableItem;
};

const getDriveSubfolder = (mediaType: LibraryItem['mediaType']) => {
    switch (mediaType) {
        case 'image': return 'images';
        case 'video': return 'videos';
        case 'audio-tts': return 'audio-tts';
        case 'tts-reference': return 'tts-references';
        case 'clothes': return 'clothes';
        case 'extracted-frame': return 'extracted-frames';
        case 'object': return 'objects';
        case 'pose': return 'poses';
        case 'font': return 'fonts';
        default: return 'misc';
    }
};

const uploadLibraryAssetsToDrive = async (item: LibraryItem) => {
    if (!driveService) throw new Error('Google Drive is not configured.');
    const driveAssetFileIds: Partial<Record<LibraryAssetRole, string>> = { ...item.driveAssetFileIds };
    const parentFolderId = await driveService.getOrCreateSubfolder(getDriveSubfolder(item.mediaType));
    for (const [role, ref] of Object.entries(item.assetRefs || {}) as [LibraryAssetRole, NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole]][]) {
        if (!ref || driveAssetFileIds[role]) continue;
        const blob = await idbService.getLibraryAssetBlob(ref);
        const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg').replace('x-wav', 'wav') || 'bin';
        const safeRole = role.replace(/[^a-zA-Z0-9_-]/g, '-');
        driveAssetFileIds[role] = await driveService.uploadMediaFile(blob, `${item.mediaType}_${item.id}_${safeRole}.${extension}`, parentFolderId);
    }
    return driveAssetFileIds;
};

export function setDriveService(service: typeof googleDriveService | null) {
    driveService = service;
}

export async function initializeDriveSync(onProgress: (message: string) => void) {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Cannot initialize sync: not connected to Google Drive.");
    }

    onProgress("Checking for existing library on Google Drive...");
    // Fix: Cast the return type to ensure `remoteIndex` is properly typed.
    const { index: remoteIndex, fileId } = await driveService.getLibraryIndex() as { index: LibraryIndex; fileId: string | null };

    if (fileId === null) {
        onProgress("No library found on Drive. Creating from local items...");
        await syncLibraryToDrive(onProgress);
    } else {
        onProgress("Library found on Drive. Merging with local library...");
        // Fix: Passed the correct object structure to `syncLibraryFromDrive`.
        await syncLibraryFromDrive(onProgress, { index: remoteIndex, fileId });
        await syncLibraryToDrive(onProgress);
    }

    onProgress("Initial sync process complete.");
}

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<LibraryItem> => {
    const itemToSave = { ...item };

    // If a name is missing for an image, video, or character, try to generate one.
    if (!itemToSave.name && (item.mediaType === 'image' || item.mediaType === 'video' || item.mediaType === 'character')) {
        try {
            const options = item.options;
            const prompt = options?.geminiPrompt || options?.comfyPrompt || options?.geminiVidPrompt || options?.comfyVidWanI2VPositivePrompt;

            let generatedName = '';
            if (item.mediaType === 'image' || item.mediaType === 'character') {
                // For ComfyUI or Gemini I2I, it's best to analyze the final image.
                if (options?.provider === 'comfyui' || (options?.provider === 'gemini' && options?.geminiMode === 'i2i')) {
                    generatedName = await generateTitleForImage(item.media);
                }
                // For Gemini T2I, a prompt must exist, so summarize it.
                else if (prompt) {
                    generatedName = await summarizePrompt(prompt);
                }
            } else if (item.mediaType === 'video') {
                // If a video prompt exists, it's the source of truth.
                if (prompt) {
                    generatedName = await summarizePrompt(prompt);
                }
                // If no prompt (e.g., Gemini Image-to-Video), but there's a start frame, analyze the image.
                else if (item.startFrame) {
                    generatedName = await generateTitleForImage(item.startFrame);
                }
            }
            // Use the generated name if successful, otherwise a fallback will be used.
            itemToSave.name = generatedName || `${item.mediaType.charAt(0).toUpperCase() + item.mediaType.slice(1)} Item ${Date.now()}`;
        } catch (e) {
            console.error("Failed to auto-generate title for library item, using default.", e);
            // Assign a default name on any failure to ensure the save operation can proceed.
            itemToSave.name = `${item.mediaType.charAt(0).toUpperCase() + item.mediaType.slice(1)} Item ${Date.now()}`;
        }
    }

    const newItem = await idbService.saveToLibrary(itemToSave);

    if (driveService?.isConnected()) {
        try {
            const { index, fileId: indexFileId } = await driveService.getLibraryIndex();

            if (newItem.mediaType === 'prompt' || newItem.mediaType === 'color-palette' || newItem.mediaType === 'preset') {
                index.items[newItem.id] = withoutLocalAssetRefs(newItem);
                await driveService.updateLibraryIndex(index, indexFileId);
                return newItem;
            }

            const driveAssetFileIds = await uploadLibraryAssetsToDrive(newItem);
            const driveFileId = driveAssetFileIds.media;
            await idbService.updateLibraryItem(newItem.id, { driveFileId, driveAssetFileIds });
            const { assetRefs, ...metadata } = newItem;
            index.items[newItem.id] = { ...metadata, driveFileId, driveAssetFileIds };

            await driveService.updateLibraryIndex(index, indexFileId);

        } catch (e: any) {
            console.error("Failed to sync to Google Drive, but item is saved locally.", e);
            throw new Error(`Item saved locally, but failed to sync to Google Drive: ${e.message}`);
        }
    }
    return newItem;
};

export const bulkSaveToLibrary = async (items: LibraryItem[]): Promise<void> => {
    // This function will overwrite existing items with the same ID.
    await idbService.bulkSaveToLibrary(items);

    // Drive sync will be handled separately by the component calling syncLibraryToDrive
    // This keeps the service functions focused.
};

export interface LibraryImportProgress {
    bytesRead: number;
    totalBytes: number;
    importedCount: number;
    currentName?: string;
}

interface LibraryArchiveAsset {
    role: LibraryAssetRole;
    path: string;
    mimeType: string;
    size: number;
}

interface LibraryArchiveItem {
    metadata: LibraryItem;
    assets: LibraryArchiveAsset[];
}

interface LibraryArchiveManifest {
    format: 'lawiz-library';
    version: 1;
    createdAt: string;
    items: LibraryArchiveItem[];
}

interface LibraryFolderAsset extends LibraryArchiveAsset {
    sha256: string;
    sourceAssetId?: string;
}

interface LibraryFolderItem {
    metadata: LibraryItem;
    assets: LibraryFolderAsset[];
}

interface LibraryFolderManifest {
    format: 'lawiz-library-folder';
    version: 1;
    createdAt: string;
    updatedAt: string;
    items: LibraryFolderItem[];
}

export interface LibraryFolderSyncStatus {
    directoryName: string;
    pendingItemIds: number[];
    canRead: boolean;
}

export interface LibraryFolderProgress {
    completed: number;
    total: number;
    currentName?: string;
    stage: 'hashing' | 'writing' | 'importing';
}

type LibraryExportProgress = (progress: { completed: number; total: number; currentName?: string }) => void;

const addLocalItemToArchive = async (zipWriter: ZipWriter<unknown>, item: LibraryItem): Promise<LibraryArchiveItem> => {
    const { assetRefs, ...portableMetadata } = item;
    const archiveItem: LibraryArchiveItem = { metadata: portableMetadata as LibraryItem, assets: [] };
    for (const [role, ref] of Object.entries(assetRefs || {}) as [LibraryAssetRole, NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole]][]) {
        if (!ref) continue;
        const assetPath = `assets/${item.id}/${role}-${ref.id}`;
        const blob = await idbService.getLibraryAssetBlob(ref);
        await zipWriter.add(assetPath, new BlobReader(blob), { level: 0 });
        archiveItem.assets.push({ role, path: assetPath, mimeType: ref.mimeType, size: ref.size });
    }
    return archiveItem;
};

const getAssetExtension = (mimeType: string) => {
    const extensions: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
        'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
    };
    return extensions[mimeType] || 'bin';
};

const LIBRARY_FOLDER_CATEGORY_NAMES: Record<LibraryItem['mediaType'], string> = {
    image: 'Images', character: 'Characters', video: 'Videos', 'audio-tts': 'Audio TTS',
    'tts-reference': 'TTS References', logo: 'Logos', banner: 'Banners', 'album-cover': 'Album Covers',
    clothes: 'Clothes', hair: 'Hair', prompt: 'Prompts', 'extracted-frame': 'Extracted Frames',
    object: 'Objects', 'color-palette': 'Color Palettes', pose: 'Poses', font: 'Fonts',
    'group-fusion': 'Group Fusion', 'swap-anything': 'Swap Anything', 'past-forward-photo': 'Past Forward', preset: 'Presets',
};
const knownAssetHashes = new Map<string, string>();

const selectLibraryFolderHandle = async (mode: 'read' | 'readwrite', persist = true): Promise<FileSystemDirectoryHandle> => {
    const handle = await window.showDirectoryPicker({ mode });
    if (persist) await saveActiveLibraryFolderHandle(handle);
    return handle;
};

const getWritableLibraryFolderHandle = async (): Promise<FileSystemDirectoryHandle> => {
    const activeHandle = await getActiveLibraryFolderHandle();
    try {
        if (activeHandle && await ensureDirectoryPermission(activeHandle, 'readwrite')) return activeHandle;
    } catch {
        // The persisted handle may point to a moved or deleted directory.
    }
    return selectLibraryFolderHandle('readwrite');
};

export const getActiveLibraryFolderName = async (): Promise<string | null> =>
    (await getActiveLibraryFolderHandle())?.name || null;

export const chooseLibraryFolder = async (): Promise<string> => {
    if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Library Folder requires the desktop app or a Chromium browser with folder access.');
    }
    return (await selectLibraryFolderHandle('readwrite')).name;
};

const getPortableMetadata = (item: LibraryItem): LibraryItem => {
    const { assetRefs: _assetRefs, ...portableMetadata } = item;
    return portableMetadata as LibraryItem;
};

const hashBlob = async (blob: Blob): Promise<string> => {
    const hasher = await createSHA256();
    hasher.init();
    const reader = blob.stream().getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        hasher.update(value);
    }
    return hasher.digest('hex');
};

const getAssetSha256 = async (ref: NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole], blob?: Blob): Promise<string> => {
    const memoryHash = knownAssetHashes.get(ref.id);
    if (memoryHash) return memoryHash;
    const storedHash = await idbService.getLibraryAssetHash(ref);
    if (storedHash) {
        knownAssetHashes.set(ref.id, storedHash);
        return storedHash;
    }
    const sha256 = await hashBlob(blob || await idbService.getLibraryAssetBlob(ref));
    knownAssetHashes.set(ref.id, sha256);
    await idbService.saveLibraryAssetHash(ref, sha256);
    return sha256;
};

const readDirectoryJson = async <T>(directoryHandle: any, filename: string): Promise<T | undefined> => {
    try {
        const handle = await directoryHandle.getFileHandle(filename);
        const file = await handle.getFile();
        return JSON.parse(await file.text()) as T;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
        throw error;
    }
};

const writeDirectoryText = async (directoryHandle: any, filename: string, content: string): Promise<void> => {
    const handle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    try {
        await writable.write(content);
        await writable.close();
    } catch (error) {
        await writable.abort?.().catch(() => undefined);
        throw error;
    }
};

const getFolderAssetFile = async (directoryHandle: any, path: string): Promise<File> => {
    const parts = path.split('/').filter(Boolean);
    if (parts.some(part => part === '.' || part === '..')) throw new Error(`Invalid Library Folder asset path: ${path}`);
    const filename = parts.pop();
    if (!filename) throw new Error(`Invalid Library Folder asset path: ${path}`);
    let currentHandle = directoryHandle;
    for (const part of parts) currentHandle = await currentHandle.getDirectoryHandle(part);
    return (await currentHandle.getFileHandle(filename)).getFile();
};

const validateFolderManifest = (manifest: LibraryFolderManifest | undefined): LibraryFolderManifest | undefined => {
    if (!manifest) return undefined;
    if (manifest.format !== 'lawiz-library-folder' || manifest.version !== 1 || !Array.isArray(manifest.items)) {
        throw new Error('Unsupported LAWIZ Library Folder format.');
    }
    return manifest;
};

const structurallyMatchesFolderItem = (item: LibraryItem, folderItem: LibraryFolderItem): boolean => {
    if (JSON.stringify(getPortableMetadata(item)) !== JSON.stringify(folderItem.metadata)) return false;
    const localAssets = Object.entries(item.assetRefs || {}) as [LibraryAssetRole, NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole]][];
    if (localAssets.length !== folderItem.assets.length) return false;
    const folderAssetsByRole = new Map(folderItem.assets.map(asset => [asset.role, asset]));
    return localAssets.every(([role, ref]) => {
        const folderAsset = folderAssetsByRole.get(role);
        return !!ref && !!folderAsset && folderAsset.size === ref.size && folderAsset.mimeType === ref.mimeType;
    });
};

const contentMatchesFolderItem = async (item: LibraryItem, folderItem: LibraryFolderItem): Promise<boolean> => {
    if (!structurallyMatchesFolderItem(item, folderItem)) return false;
    const folderAssetsByRole = new Map(folderItem.assets.map(asset => [asset.role, asset]));
    for (const [role, ref] of Object.entries(item.assetRefs || {}) as [LibraryAssetRole, NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole]][]) {
        if (!ref) continue;
        const folderAsset = folderAssetsByRole.get(role)!;
        if (folderAsset.sourceAssetId === ref.id) continue;
        if (await getAssetSha256(ref) !== folderAsset.sha256) return false;
    }
    return true;
};

export const getLibraryFolderSyncStatus = async (items: LibraryItem[], verifyAssetContent = true): Promise<LibraryFolderSyncStatus | null> => {
    const directoryHandle = await getActiveLibraryFolderHandle();
    if (!directoryHandle) return null;
    try {
        if (typeof directoryHandle.queryPermission === 'function') {
            const permission = await directoryHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') return { directoryName: directoryHandle.name, pendingItemIds: [], canRead: false };
        }
        const manifest = validateFolderManifest(await readDirectoryJson<LibraryFolderManifest>(directoryHandle, 'manifest.json'));
        if (!manifest) return { directoryName: directoryHandle.name, pendingItemIds: items.map(item => item.id), canRead: true };
        const manifestById = new Map(manifest.items.map(item => [item.metadata.id, item]));
        const pendingItemIds: number[] = [];
        const localItemIds = new Set(items.map(item => item.id));

        for (const item of items) {
            const folderItem = manifestById.get(item.id);
            if (!folderItem || !structurallyMatchesFolderItem(item, folderItem)) {
                pendingItemIds.push(item.id);
            } else if (verifyAssetContent && !await contentMatchesFolderItem(item, folderItem)) pendingItemIds.push(item.id);
        }
        for (const folderItem of manifest.items) {
            if (!localItemIds.has(folderItem.metadata.id)) pendingItemIds.push(folderItem.metadata.id);
        }
        return { directoryName: directoryHandle.name, pendingItemIds, canRead: true };
    } catch {
        return { directoryName: directoryHandle.name, pendingItemIds: [], canRead: false };
    }
};

const writeFolderAsset = async (directoryHandle: any, path: string, blob: Blob): Promise<void> => {
    const parts = path.split('/').filter(Boolean);
    const filename = parts.pop();
    if (!filename) throw new Error(`Invalid Library Folder asset path: ${path}`);
    let currentHandle = directoryHandle;
    for (const part of parts) currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
    const fileHandle = await currentHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
        await writable.write(blob);
        await writable.close();
    } catch (error) {
        await writable.abort?.().catch(() => undefined);
        throw error;
    }
};

const removeFolderAsset = async (directoryHandle: any, path: string): Promise<void> => {
    const parts = path.split('/').filter(Boolean);
    const filename = parts.pop();
    if (!filename) return;
    let currentHandle = directoryHandle;
    for (const part of parts) currentHandle = await currentHandle.getDirectoryHandle(part);
    await currentHandle.removeEntry(filename);
};

export interface LibraryFolderExportResult {
    directoryName: string;
    added: number;
    replaced: number;
    removed: number;
    assetsWritten: number;
    assetsReused: number;
}

export const exportLibraryFolder = async (
    selectedItems?: LibraryItem[],
    onProgress?: (progress: LibraryFolderProgress) => void,
): Promise<LibraryFolderExportResult> => {
    if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Library Folder requires the desktop app or a Chromium browser with folder access.');
    }
    const isFullSync = selectedItems === undefined;
    const items = selectedItems ?? await idbService.getLibraryItems();
    if (!isFullSync && items.length === 0) throw new Error('There are no Library items to export.');
    const directoryHandle = await getWritableLibraryFolderHandle();
    const existingManifest = validateFolderManifest(await readDirectoryJson<LibraryFolderManifest>(directoryHandle, 'manifest.json'));
    const existingById = new Map(existingManifest?.items.map(item => [item.metadata.id, item]) || []);
    const assetsByCategoryHash = new Map<string, LibraryFolderAsset>();
    for (const item of existingManifest?.items || []) {
        const category = LIBRARY_FOLDER_CATEGORY_NAMES[item.metadata.mediaType];
        for (const asset of item.assets) {
            if (asset.path.startsWith(`${category}/`)) assetsByCategoryHash.set(`${category}:${asset.sha256}`, asset);
        }
    }

    const replacementIds = new Set(items.map(item => item.id));
    const removed = isFullSync
        ? (existingManifest?.items || []).filter(item => !replacementIds.has(item.metadata.id)).length
        : 0;
    const nextItems = isFullSync
        ? []
        : (existingManifest?.items || []).filter(item => !replacementIds.has(item.metadata.id));
    const itemsToWrite: LibraryItem[] = [];
    let assetsWritten = 0;
    let assetsReused = 0;
    let added = 0;
    let replaced = 0;

    for (const item of items) {
        const existingItem = existingById.get(item.id);
        if (existingItem && await contentMatchesFolderItem(item, existingItem)) {
            nextItems.push(existingItem);
            assetsReused += existingItem.assets.length;
            continue;
        }
        itemsToWrite.push(item);
        if (existingItem) replaced += 1;
        else added += 1;
    }

    for (let index = 0; index < itemsToWrite.length; index += 1) {
        const item = itemsToWrite[index];
        const { assetRefs } = item;
        const portableMetadata = getPortableMetadata(item);
        const folderItem: LibraryFolderItem = { metadata: portableMetadata as LibraryItem, assets: [] };

        for (const [role, ref] of Object.entries(assetRefs || {}) as [LibraryAssetRole, NonNullable<LibraryItem['assetRefs']>[LibraryAssetRole]][]) {
            if (!ref) continue;
            onProgress?.({ completed: index, total: itemsToWrite.length, currentName: item.name, stage: 'hashing' });
            const blob = await idbService.getLibraryAssetBlob(ref);
            const sha256 = await getAssetSha256(ref, blob);
            const category = LIBRARY_FOLDER_CATEGORY_NAMES[item.mediaType];
            const knownAsset = assetsByCategoryHash.get(`${category}:${sha256}`);
            if (knownAsset) {
                folderItem.assets.push({ ...knownAsset, role, mimeType: ref.mimeType, size: ref.size, sourceAssetId: ref.id });
                assetsReused += 1;
                continue;
            }

            const path = `${category}/${sha256}.${getAssetExtension(ref.mimeType)}`;
            onProgress?.({ completed: index, total: itemsToWrite.length, currentName: item.name, stage: 'writing' });
            await writeFolderAsset(directoryHandle, path, blob);
            const folderAsset: LibraryFolderAsset = { role, path, mimeType: ref.mimeType, size: ref.size, sha256, sourceAssetId: ref.id };
            folderItem.assets.push(folderAsset);
            assetsByCategoryHash.set(`${category}:${sha256}`, folderAsset);
            assetsWritten += 1;
        }
        nextItems.push(folderItem);
        onProgress?.({ completed: index + 1, total: itemsToWrite.length, currentName: item.name, stage: 'writing' });
    }

    const now = new Date().toISOString();
    const manifest: LibraryFolderManifest = {
        format: 'lawiz-library-folder',
        version: 1,
        createdAt: existingManifest?.createdAt || now,
        updatedAt: now,
        items: nextItems,
    };
    await writeDirectoryText(directoryHandle, 'manifest.json', JSON.stringify(manifest, null, 2));
    const retainedPaths = new Set(manifest.items.flatMap(item => item.assets.map(asset => asset.path)));
    const obsoletePaths = new Set((existingManifest?.items || []).flatMap(item => item.assets.map(asset => asset.path)).filter(path => !retainedPaths.has(path)));
    await Promise.allSettled([...obsoletePaths].map(path => removeFolderAsset(directoryHandle, path)));
    return {
        directoryName: directoryHandle.name,
        added,
        replaced,
        removed,
        assetsWritten,
        assetsReused,
    };
};

export const importLibraryFolder = async (
    onProgress?: (progress: LibraryFolderProgress) => void,
): Promise<{ imported: number; directoryName: string }> => {
    if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Library Folder requires the desktop app or a Chromium browser with folder access.');
    }
    const directoryHandle = await selectLibraryFolderHandle('read', false);
    const manifest = validateFolderManifest(await readDirectoryJson<LibraryFolderManifest>(directoryHandle, 'manifest.json'));
    if (!manifest) throw new Error('This folder does not contain a Library Folder manifest.json.');
    if (manifest.items.length === 0) throw new Error('The Library Folder contains no items.');
    await saveActiveLibraryFolderHandle(directoryHandle);

    for (let index = 0; index < manifest.items.length; index += 1) {
        const folderItem = manifest.items[index];
        if (!folderItem.metadata || !Number.isFinite(folderItem.metadata.id) || !Array.isArray(folderItem.assets)) {
            throw new Error(`Invalid Library Folder item at position ${index + 1}.`);
        }
        const blobs: Partial<Record<LibraryAssetRole, Blob>> = {};
        const hashes: Partial<Record<LibraryAssetRole, string>> = {};
        for (const asset of folderItem.assets) {
            const file = await getFolderAssetFile(directoryHandle, asset.path);
            if (file.size !== asset.size) throw new Error(`Library Folder asset has an unexpected size: ${asset.path}`);
            blobs[asset.role] = file.type === asset.mimeType ? file : file.slice(0, file.size, asset.mimeType);
            hashes[asset.role] = asset.sha256;
        }
        const { assetRefs: _assetRefs, ...metadata } = folderItem.metadata;
        const savedItem = await idbService.saveLibraryItemWithBlobs(metadata as LibraryItem, blobs, hashes);
        for (const asset of folderItem.assets) {
            const ref = savedItem.assetRefs?.[asset.role];
            if (ref) knownAssetHashes.set(ref.id, asset.sha256);
        }
        onProgress?.({ completed: index + 1, total: manifest.items.length, currentName: metadata.name, stage: 'importing' });
    }
    return { imported: manifest.items.length, directoryName: directoryHandle.name };
};

export const importLibraryJsonFile = async (
    file: File,
    onProgress?: (progress: LibraryImportProgress) => void,
): Promise<number> => {
    const reader = file.stream().getReader();
    const parser = new JSONParser({ paths: ['$.*'], keepStack: false, stringBufferSize: 64 * 1024 });
    const seenIds = new Set<number>();
    let bytesRead = 0;
    let importedCount = 0;
    let pendingWrite = Promise.resolve();
    let parserError: Error | null = null;

    parser.onError = error => { parserError = error; };
    parser.onValue = ({ value }) => {
        const item = value as unknown as LibraryItem;
        if (!item || typeof item !== 'object' || !Number.isFinite(item.id) || typeof item.mediaType !== 'string' || typeof item.media !== 'string') {
            parserError = new Error(`Invalid Library item at position ${importedCount + 1}.`);
            return;
        }
        if (seenIds.has(item.id)) {
            parserError = new Error(`Duplicate Library item ID ${item.id}.`);
            return;
        }
        seenIds.add(item.id);
        pendingWrite = pendingWrite.then(async () => {
            await idbService.saveToLibrary(item, true);
            importedCount += 1;
            onProgress?.({ bytesRead, totalBytes: file.size, importedCount, currentName: item.name });
        });
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesRead += value.byteLength;
            parser.write(value);
            if (parserError) throw parserError;
            await pendingWrite;
            onProgress?.({ bytesRead, totalBytes: file.size, importedCount });
        }
        if (!parser.isEnded) parser.end();
        if (parserError) throw parserError;
        await pendingWrite;
        if (importedCount === 0) throw new Error('The Library backup contains no items.');
        return importedCount;
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
};

const getArchiveName = (projectName: string, selected: boolean) => {
    const sanitizedName = projectName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${sanitizedName || 'library'}_${selected ? 'selected' : 'backup'}.lawiz-library`;
};

export const exportLibraryArchive = async (
    projectName: string,
    selectedItems?: LibraryItem[],
    onProgress?: LibraryExportProgress,
): Promise<void> => {
    const items = selectedItems || await idbService.getLibraryItems();
    if (items.length === 0) throw new Error('There are no Library items to export.');
    const filename = getArchiveName(projectName, !!selectedItems);
    let blobWriter: BlobWriter | undefined;
    let zipWriter: ZipWriter<unknown>;

    if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
            suggestedName: filename,
        });
        zipWriter = new ZipWriter(await handle.createWritable(), { zip64: true });
    } else {
        blobWriter = new BlobWriter('application/zip');
        zipWriter = new ZipWriter(blobWriter, { zip64: true });
    }

    const manifest: LibraryArchiveManifest = { format: 'lawiz-library', version: 1, createdAt: new Date().toISOString(), items: [] };
    try {
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            manifest.items.push(await addLocalItemToArchive(zipWriter, item));
            onProgress?.({ completed: index + 1, total: items.length, currentName: item.name });
        }
        await zipWriter.add('manifest.json', new TextReader(JSON.stringify(manifest)));
        await zipWriter.close();
        if (blobWriter) {
            const blob = await blobWriter.getData();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
    } catch (error) {
        await zipWriter.close().catch(() => undefined);
        throw error;
    }
};

export const addToExistingLibraryArchive = async (
    selectedItems?: LibraryItem[],
    onProgress?: LibraryExportProgress,
): Promise<{ added: number; retained: number }> => {
    if (typeof window.showOpenFilePicker !== 'function') {
        throw new Error('Adding to an existing archive requires the desktop app or a Chromium browser with file access.');
    }
    const items = selectedItems || await idbService.getLibraryItems();
    if (items.length === 0) throw new Error('There are no Library items to add.');

    const [handle] = await window.showOpenFilePicker({
        multiple: false,
    });
    const file = await handle.getFile();
    if (!file.name.toLowerCase().endsWith('.lawiz-library')) {
        throw new Error('Please select a .lawiz-library archive.');
    }
    const retained = await mergeItemsIntoArchiveHandle(handle, file, items, onProgress);
    return { added: items.length, retained };
};

const mergeItemsIntoArchiveHandle = async (
    handle: any,
    file: File,
    items: LibraryItem[],
    onProgress?: LibraryExportProgress,
): Promise<number> => {
    const zipReader = new ZipReader(new BlobReader(file));
    let writable: any;
    try {
        const entries = await zipReader.getEntries();
        const manifestEntry = entries.find(entry => entry.filename === 'manifest.json');
        if (!manifestEntry?.getData) throw new Error('This is not a valid LAWIZ Library backup.');
        const existingManifest = JSON.parse(await manifestEntry.getData(new TextWriter())) as LibraryArchiveManifest;
        if (existingManifest.format !== 'lawiz-library' || existingManifest.version !== 1 || !Array.isArray(existingManifest.items)) {
            throw new Error('Unsupported LAWIZ Library backup format.');
        }

        const replacementIds = new Set(items.map(item => item.id));
        const retainedItems = existingManifest.items.filter(item => !replacementIds.has(item.metadata.id));
        const entriesByPath = new Map(entries.map(entry => [entry.filename, entry]));
        writable = await handle.createWritable();
        const zipWriter = new ZipWriter(writable, { zip64: true });
        const manifest: LibraryArchiveManifest = {
            format: 'lawiz-library',
            version: 1,
            createdAt: new Date().toISOString(),
            items: [...retainedItems],
        };
        const total = retainedItems.length + items.length;
        let completed = 0;

        for (const archiveItem of retainedItems) {
            for (const asset of archiveItem.assets) {
                const entry = entriesByPath.get(asset.path);
                if (!entry?.getData) throw new Error(`Existing backup asset is missing: ${asset.path}`);
                const stream = new TransformStream<Uint8Array, Uint8Array>();
                await Promise.all([
                    entry.getData(stream.writable),
                    zipWriter.add(asset.path, stream.readable, { level: 0 }),
                ]);
            }
            completed += 1;
            onProgress?.({ completed, total, currentName: archiveItem.metadata.name });
        }
        for (const item of items) {
            manifest.items.push(await addLocalItemToArchive(zipWriter, item));
            completed += 1;
            onProgress?.({ completed, total, currentName: item.name });
        }
        await zipWriter.add('manifest.json', new TextReader(JSON.stringify(manifest)));
        await zipWriter.close();
        writable = undefined;
        return retainedItems.length;
    } catch (error) {
        await writable?.abort?.().catch(() => undefined);
        throw error;
    } finally {
        await zipReader.close();
    }
};

const writeItemsToArchiveHandle = async (
    handle: any,
    items: LibraryItem[],
    onProgress?: LibraryExportProgress,
): Promise<void> => {
    let writable: any;
    try {
        writable = await handle.createWritable();
        const zipWriter = new ZipWriter(writable, { zip64: true });
        const manifest: LibraryArchiveManifest = { format: 'lawiz-library', version: 1, createdAt: new Date().toISOString(), items: [] };
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            manifest.items.push(await addLocalItemToArchive(zipWriter, item));
            onProgress?.({ completed: index + 1, total: items.length, currentName: item.name });
        }
        await zipWriter.add('manifest.json', new TextReader(JSON.stringify(manifest)));
        await zipWriter.close();
        writable = undefined;
    } catch (error) {
        await writable?.abort?.().catch(() => undefined);
        throw error;
    }
};

const CATEGORY_ARCHIVE_NAMES: Record<LibraryItem['mediaType'], string> = {
    image: 'Image',
    character: 'Character',
    video: 'Video',
    'audio-tts': 'Audio_TTS',
    'tts-reference': 'TTS_Reference',
    logo: 'Logo',
    banner: 'Banner',
    'album-cover': 'Album_Cover',
    clothes: 'Clothes',
    hair: 'Hair',
    prompt: 'Prompt',
    'extracted-frame': 'Frame',
    object: 'Object',
    'color-palette': 'Palette',
    pose: 'Pose',
    font: 'Font',
    'group-fusion': 'Photo_Fusion',
    'swap-anything': 'Swap_Anything',
    'past-forward-photo': 'Past_Forward',
    preset: 'Preset',
};

export interface LibraryCategoryExportProgress {
    completedCategories: number;
    totalCategories: number;
    currentCategory: string;
    currentItem?: string;
}

export const exportLibraryArchivesByCategory = async (
    onProgress?: (progress: LibraryCategoryExportProgress) => void,
): Promise<{ created: number; updated: number; exportedItems: number }> => {
    if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Category export requires the desktop app or a Chromium browser with folder access.');
    }
    const items = await idbService.getLibraryItems();
    if (items.length === 0) throw new Error('There are no Library items to export.');
    const groups = [...new Map(items.map(item => [item.mediaType, [] as LibraryItem[]])).entries()];
    for (const item of items) groups.find(([mediaType]) => mediaType === item.mediaType)![1].push(item);

    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    let created = 0;
    let updated = 0;
    let exportedItems = 0;
    for (let index = 0; index < groups.length; index += 1) {
        const [mediaType, categoryItems] = groups[index];
        const categoryName = CATEGORY_ARCHIVE_NAMES[mediaType];
        const filename = `LMG_${categoryName}_1.lawiz-library`;
        let fileHandle: any;
        let existingFile: File | undefined;
        try {
            fileHandle = await directoryHandle.getFileHandle(filename);
            existingFile = await fileHandle.getFile();
        } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
            fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        }
        const reportProgress: LibraryExportProgress = progress => onProgress?.({
            completedCategories: index + 1,
            totalCategories: groups.length,
            currentCategory: categoryName,
            currentItem: progress.currentName,
        });
        if (existingFile && existingFile.size > 0) {
            await mergeItemsIntoArchiveHandle(fileHandle, existingFile, categoryItems, reportProgress);
            updated += 1;
        } else {
            await writeItemsToArchiveHandle(fileHandle, categoryItems, reportProgress);
            created += 1;
        }
        exportedItems += categoryItems.length;
        onProgress?.({ completedCategories: index + 1, totalCategories: groups.length, currentCategory: categoryName });
    }
    return { created, updated, exportedItems };
};

export const importLibraryArchive = async (
    file: File,
    onProgress?: (progress: LibraryImportProgress) => void,
): Promise<number> => {
    const zipReader = new ZipReader(new BlobReader(file));
    try {
        const entries = await zipReader.getEntries();
        const manifestEntry = entries.find(entry => entry.filename === 'manifest.json');
        if (!manifestEntry?.getData) throw new Error('This is not a valid LAWIZ Library backup.');
        const manifest = JSON.parse(await manifestEntry.getData(new TextWriter())) as LibraryArchiveManifest;
        if (manifest.format !== 'lawiz-library' || manifest.version !== 1 || !Array.isArray(manifest.items)) {
            throw new Error('Unsupported LAWIZ Library backup format.');
        }
        const entriesByPath = new Map(entries.map(entry => [entry.filename, entry]));
        let importedCount = 0;
        for (const archiveItem of manifest.items) {
            const blobs: Partial<Record<LibraryAssetRole, Blob>> = {};
            for (const asset of archiveItem.assets) {
                const entry = entriesByPath.get(asset.path);
                if (!entry?.getData) throw new Error(`Backup asset is missing: ${asset.path}`);
                const blob = await entry.getData(new BlobWriter(asset.mimeType));
                blobs[asset.role] = blob;
            }
            await idbService.saveLibraryItemWithBlobs(archiveItem.metadata, blobs);
            importedCount += 1;
            onProgress?.({ bytesRead: importedCount, totalBytes: manifest.items.length, importedCount, currentName: archiveItem.metadata.name });
        }
        return importedCount;
    } finally {
        await zipReader.close();
    }
};

export const fetchLibrary = idbService.getLibraryItems;
export const hydrateLibraryItem = idbService.hydrateLibraryItem;
export const createLibraryAssetObjectUrl = idbService.createLibraryAssetObjectUrl;

export const syncLibraryFromDrive = async (onProgress: (message: string) => void, remoteIndexData?: { index: LibraryIndex, fileId: string | null }): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Fetching library index from Google Drive...");
    const { index: remoteIndex } = remoteIndexData || await driveService.getLibraryIndex() as { index: LibraryIndex, fileId: string | null };

    if (!remoteIndex || !remoteIndex.items) {
        onProgress("Remote library is empty or invalid.");
        return;
    }
    // Fix: Cast the items from the remote index to the correct type to resolve property access errors.
    const remoteItems = Object.values(remoteIndex.items) as LibraryItemMetadata[];

    onProgress(`Found ${remoteItems.length} items in Drive index. Checking against local library...`);
    const localItems = await idbService.getLibraryItems();
    const localIds = new Set(localItems.map(item => item.id));

    const missingItems = remoteItems.filter(item => item.id && !localIds.has(item.id));

    if (missingItems.length === 0) {
        onProgress("Local library is already up to date.");
        return;
    }

    onProgress(`Downloading ${missingItems.length} new item(s)...`);
    for (let i = 0; i < missingItems.length; i++) {
        const itemMetadata = missingItems[i];
        onProgress(`Processing "${itemMetadata.name || itemMetadata.mediaType}" (${i + 1}/${missingItems.length})...`);
        try {
            if (itemMetadata.mediaType === 'prompt' || itemMetadata.mediaType === 'color-palette' || itemMetadata.mediaType === 'preset') {
                await idbService.saveToLibrary(itemMetadata as LibraryItem, true);
            } else if (itemMetadata.driveAssetFileIds || itemMetadata.driveFileId) {
                const remoteAssetIds: Partial<Record<LibraryAssetRole, string>> = {
                    ...(itemMetadata.driveAssetFileIds || {}),
                    ...(!itemMetadata.driveAssetFileIds?.media && itemMetadata.driveFileId ? { media: itemMetadata.driveFileId } : {}),
                };
                const blobs: Partial<Record<LibraryAssetRole, Blob>> = {};
                for (const [role, fileId] of Object.entries(remoteAssetIds) as [LibraryAssetRole, string][]) {
                    blobs[role] = await driveService.downloadMediaFile(fileId);
                }

                let thumbnail: string;
                if (itemMetadata.mediaType === 'video' && itemMetadata.startFrame) {
                    thumbnail = await dataUrlToThumbnail(itemMetadata.startFrame, 256);
                } else if (itemMetadata.mediaType === 'video') {
                    // SVG placeholder for a video thumbnail if startFrame is missing
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#6b7280"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>`;
                    thumbnail = `data:image/svg+xml;base64,${btoa(svg)}`;
                } else if ((itemMetadata.mediaType === 'audio-tts' || itemMetadata.mediaType === 'tts-reference') && itemMetadata.thumbnail) {
                    thumbnail = itemMetadata.thumbnail;
                } else {
                    const mediaBlob = blobs.media;
                    if (!mediaBlob) throw new Error('The main media asset is missing from Google Drive.');
                    const mediaUrl = URL.createObjectURL(mediaBlob);
                    try {
                        thumbnail = await dataUrlToThumbnail(mediaUrl, 256);
                    } finally {
                        URL.revokeObjectURL(mediaUrl);
                    }
                }

                const newItem: LibraryItem = {
                    ...(itemMetadata as Omit<LibraryItem, 'media' | 'thumbnail'>),
                    media: '',
                    thumbnail,
                };
                delete newItem.assetRefs;
                await idbService.saveLibraryItemWithBlobs(newItem, blobs);
            }
        } catch (e) {
            console.error(`Failed to download or save file for item ${itemMetadata.id}`, e);
        }
    }
};

export const syncLibraryToDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Checking for local items to upload...");
    const localItems = await idbService.getLibraryItems();
    const { index: remoteIndex, fileId: initialFileId } = await driveService.getLibraryIndex();

    // An item needs to be synced to remote if it exists locally but not in the remote index.
    // This covers brand new items and items from a previously failed sync.
    const itemsToSyncToRemote = localItems.filter(item => !remoteIndex.items[item.id]);

    if (itemsToSyncToRemote.length === 0) {
        onProgress("All local items are already in the Drive index.");
        return;
    }

    onProgress(`Found ${itemsToSyncToRemote.length} local items to sync to Drive...`);
    let indexNeedsUpdate = false;
    const uploadErrors: string[] = [];
    const updatedIndex = { ...remoteIndex }; // Work on a copy

    for (let i = 0; i < itemsToSyncToRemote.length; i++) {
        const item = itemsToSyncToRemote[i];
        const itemName = item.name || `${item.mediaType} #${item.id}`;
        onProgress(`Syncing "${itemName}" (${i + 1}/${itemsToSyncToRemote.length})...`);
        indexNeedsUpdate = true;

        try {
            const isTextBased = ['prompt', 'color-palette'].includes(item.mediaType);
            let driveAssetFileIds = { ...item.driveAssetFileIds };

            if (!isTextBased) {
                driveAssetFileIds = await uploadLibraryAssetsToDrive({ ...item, driveAssetFileIds });
                await idbService.updateLibraryItem(item.id, { driveFileId: driveAssetFileIds.media, driveAssetFileIds });
            }

            const { assetRefs, ...metadata } = item;
            updatedIndex.items[item.id] = { ...metadata, driveFileId: driveAssetFileIds.media, driveAssetFileIds };

        } catch (e: any) {
            console.error(`Failed to sync item ${item.id} to Drive:`, e);
            uploadErrors.push(`- ${itemName}: ${e.message}`);
        }
    }

    if (indexNeedsUpdate) {
        onProgress("Finalizing by updating library index file...");
        try {
            await driveService.updateLibraryIndex(updatedIndex, initialFileId);
        } catch (e: any) {
            uploadErrors.push(`- CRITICAL: Failed to update library.json. Error: ${e.message}`);
        }
    }

    if (uploadErrors.length > 0) {
        onProgress("Upload sync complete with some errors.");
        throw new Error(`The following items failed to sync:\n${uploadErrors.join('\n')}`);
    } else {
        onProgress("Sync to Drive complete!");
    }
};

export const getLibraryItems = idbService.getLibraryItems;
export const updateLibraryItem = idbService.updateLibraryItem;
export const updateLibraryItems = idbService.updateLibraryItems;

export const deleteLibraryItem = async (id: number): Promise<void> => {
    // This function now ONLY handles local deletion to ensure it is fast and reliable.
    // Syncing the deletion to Google Drive will be handled by the main `syncLibraryToDrive` function,
    // not by the immediate delete action.
    await idbService.deleteLibraryItem(id);
};

export const deleteLibraryItems = async (ids: number[]): Promise<void> => {
    await idbService.deleteLibraryItems(ids);
};


export const clearLibrary = async (): Promise<void> => {
    await idbService.clearLibrary();
    if (driveService?.isConnected()) {
        try {
            const { fileId } = await driveService.getLibraryIndex();
            await driveService.updateLibraryIndex({ version: 1, items: {} }, fileId);
        } catch (e: any) {
            console.error("Failed to clear remote library index.", e);
            throw new Error(`Local library cleared, but failed to clear remote index: ${e.message}`);
        }
    }
};

export const saveLibraryItemToDisk = async (item: LibraryItem): Promise<void> => {
    if (!window.showSaveFilePicker) {
        throw new Error('Your browser does not support the File System Access API.');
    }
    let blob: Blob;
    let extension: string;
    switch (item.mediaType) {
        case 'video': blob = await dataUrlToBlob(item.media); extension = 'mp4'; break;
        case 'clothes':
            let clothesDataUrl = item.media.startsWith('{') ? JSON.parse(item.media).laidOutImage : item.media;
            blob = await dataUrlToBlob(clothesDataUrl);
            extension = 'png';
            break;
        case 'prompt': blob = new Blob([item.media], { type: 'text/plain' }); extension = 'txt'; break;
        case 'image': default: blob = await dataUrlToBlob(item.media); extension = 'jpeg'; break;
    }
    const suggestedName = `lawiz_ai_${item.name || item.mediaType}_${item.id}.${extension}`;
    try {
        const handle = await window.showSaveFilePicker({ suggestedName });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error('Error saving file:', error);
            throw error;
        }
    }
};