import type { LibraryItem } from '../types';
import * as idbService from './idbLibraryService';
import { dataUrlToBlob, dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import * as googleDriveService from './googleDriveService';

let driveService: typeof googleDriveService | null = null;

export function setDriveService(service: typeof googleDriveService | null) {
    driveService = service;
}

export async function initializeDriveSync(onProgress: (message: string) => void) {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Cannot initialize sync: not connected to Google Drive.");
    }
    
    onProgress("Checking for existing library on Google Drive...");
    const { fileId } = await driveService.getLibraryIndex();

    if (fileId === null) {
        onProgress("No library found on Drive. Creating from local items...");
        await syncLibraryToDrive(onProgress);
    } else {
        onProgress("Library found on Drive. Merging with local library...");
        await syncLibraryFromDrive(onProgress);
        await syncLibraryToDrive(onProgress);
    }
    
    onProgress("Initial sync process complete.");
}

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<void> => {
  const newItem = await idbService.saveToLibrary(item);

  if (driveService?.isConnected()) {
    try {
      const { index, fileId: indexFileId } = await driveService.getLibraryIndex();

      if (newItem.mediaType === 'prompt') {
          index.items[newItem.id] = newItem;
          await driveService.updateLibraryIndex(index, indexFileId);
          return;
      }

      const blob = await dataUrlToBlob(newItem.media);
      let subfolderName: string;
      switch (newItem.mediaType) {
        case 'image': subfolderName = 'images'; break;
        case 'video': subfolderName = 'videos'; break;
        case 'clothes': subfolderName = 'clothes'; break;
        default: subfolderName = 'misc';
      }
      const parentFolderId = await driveService.getOrCreateSubfolder(subfolderName);
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
      const filename = `${newItem.mediaType}_${newItem.id}.${extension}`;

      const driveFileId = await driveService.uploadMediaFile(blob, filename, parentFolderId);
      
      await idbService.updateLibraryItem(newItem.id, { driveFileId });

      const { media, thumbnail, ...metadata } = newItem;
      index.items[newItem.id] = { ...metadata, driveFileId };
      
      await driveService.updateLibraryIndex(index, indexFileId);

    } catch (e) {
      console.error("Failed to sync to Google Drive, but item is saved locally.", e);
    }
  }
};


export const syncLibraryFromDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Fetching library index from Google Drive...");
    const { index: remoteIndex } = await driveService.getLibraryIndex();
    if (!remoteIndex || !remoteIndex.items) {
        onProgress("Remote library is empty or invalid.");
        return;
    }
    const remoteItems = Object.values(remoteIndex.items);
    
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
            if (itemMetadata.mediaType === 'prompt') {
                await idbService.saveToLibrary(itemMetadata as LibraryItem, true);
            } else if (itemMetadata.driveFileId) {
                const blob = await driveService.downloadMediaFile(itemMetadata.driveFileId);
                const media = await fileToDataUrl(new File([blob], "file", { type: blob.type }));
                const thumbnail = await dataUrlToThumbnail(media, 256);

                const newItem: LibraryItem = {
                    ...(itemMetadata as Omit<LibraryItem, 'media' | 'thumbnail'>),
                    media,
                    thumbnail,
                };
                await idbService.saveToLibrary(newItem, true);
            }
        } catch (e) {
            console.error(`Failed to download or save file for item ${itemMetadata.id}`, e);
        }
    }
    onProgress("Sync from Drive complete!");
};

export const syncLibraryToDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Checking for local items to upload...");
    const localItems = await idbService.getLibraryItems();
    const { index, fileId: initialFileId } = await driveService.getLibraryIndex();

    const itemsToUpload = localItems.filter(item => !item.driveFileId && item.mediaType !== 'prompt');
    const promptsToSync = localItems.filter(item => item.mediaType === 'prompt' && !index.items[item.id]);

    if (itemsToUpload.length === 0 && promptsToSync.length === 0) {
        onProgress("All local items are already synced to Drive.");
        return;
    }

    let indexNeedsUpdate = false;
    const uploadErrors: string[] = [];

    if (itemsToUpload.length > 0) {
        indexNeedsUpdate = true;
        onProgress(`Uploading ${itemsToUpload.length} unsynced media file(s)... This may take a while.`);
        for (let i = 0; i < itemsToUpload.length; i++) {
            const item = itemsToUpload[i];
            const itemName = item.name || `${item.mediaType} #${item.id}`;
            onProgress(`Uploading "${itemName}" (${i + 1}/${itemsToUpload.length})...`);
            try {
                const blob = await dataUrlToBlob(item.media);
                let subfolderName: string;
                switch (item.mediaType) {
                    case 'image': subfolderName = 'images'; break;
                    case 'video': subfolderName = 'videos'; break;
                    case 'clothes': subfolderName = 'clothes'; break;
                    default: subfolderName = 'misc';
                }
                const parentFolderId = await driveService.getOrCreateSubfolder(subfolderName);
                const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
                const filename = `${item.mediaType}_${item.id}.${extension}`;

                const driveFileId = await driveService.uploadMediaFile(blob, filename, parentFolderId);
                await idbService.updateLibraryItem(item.id, { driveFileId });
                const { media, thumbnail, ...metadata } = item;
                index.items[item.id] = { ...metadata, driveFileId };
            } catch (e: any) {
                console.error(`Failed to upload item ${item.id} to Drive:`, e);
                uploadErrors.push(`- ${itemName}: ${e.message}`);
            }
        }
    }
    
    if (promptsToSync.length > 0) {
        indexNeedsUpdate = true;
        onProgress(`Syncing metadata for ${promptsToSync.length} new prompt(s)...`);
        promptsToSync.forEach(item => {
            index.items[item.id] = item;
        });
    }

    if (indexNeedsUpdate) {
        onProgress("Finalizing by updating library index file...");
        try {
            await driveService.updateLibraryIndex(index, initialFileId);
        } catch(e: any) {
            uploadErrors.push(`- CRITICAL: Failed to update library.json. Error: ${e.message}`);
        }
    }
    
    if (uploadErrors.length > 0) {
        onProgress("Upload sync complete with some errors.");
        throw new Error(`The following items failed to upload:\n${uploadErrors.join('\n')}`);
    } else {
        onProgress("Upload to Drive complete!");
    }
};

export const exportLibraryAsJson = async (): Promise<void> => {
    try {
        const items = await idbService.getLibraryItems();
        if (items.length === 0) {
            alert("Your library is empty. There is nothing to export.");
            return;
        }
        const jsonString = JSON.stringify(items, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'library_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Failed to export library:", error);
        alert("An error occurred while exporting the library.");
    }
};

export const getLibraryItems = idbService.getLibraryItems;
export const updateLibraryItem = idbService.updateLibraryItem;

export const deleteLibraryItem = async (id: number): Promise<void> => {
  const itemToDelete = await idbService.getItemById(id);
  await idbService.deleteLibraryItem(id);

  if (driveService?.isConnected() && itemToDelete) {
      try {
          const { index, fileId } = await driveService.getLibraryIndex();
          if (index.items[id]) {
              delete index.items[id];
              // Note: This does not delete the actual file from Drive to prevent accidental data loss.
              // It just removes the item from the library's index.
              await driveService.updateLibraryIndex(index, fileId);
          }
      } catch (e) {
           console.error(`Failed to remove item ${id} from Google Drive index. It may reappear on next sync.`, e);
      }
  }
};

export const clearLibrary = async (): Promise<void> => {
    await idbService.clearLibrary();
    if (driveService?.isConnected()) {
        try {
            const { fileId } = await driveService.getLibraryIndex();
            // Note: This does not delete media files, only the index.
            await driveService.updateLibraryIndex({ version: 1, items: {} }, fileId);
        } catch (e) {
            console.error("Failed to clear remote library index.", e);
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