import type { LibraryItem, DriveFolder } from '../types';
import * as idbService from './idbLibraryService';
import { dataUrlToBlob, dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import * as googleDriveService from './googleDriveService';

let driveService: typeof googleDriveService | null = null;

export function setDriveService(service: typeof googleDriveService | null) {
    driveService = service;
}

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<void> => {
  const newItem = await idbService.saveToLibrary(item);

  if (driveService?.isConnected()) {
      try {
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
          
          // Update the central library.json index
          const { index, fileId } = await driveService.getLibraryIndex();
          const { media, thumbnail, ...metadata } = newItem;
          index.items[newItem.id] = { ...metadata, driveFileId };
          await driveService.updateLibraryIndex(index, fileId);

      } catch (e) {
          console.error("Failed to upload to Google Drive, but item is saved locally.", e);
      }
  }
};

export const syncLibraryFromDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Fetching library index from Google Drive...");
    const { index: remoteIndex } = await driveService.getLibraryIndex();
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
        if (!itemMetadata.driveFileId) continue;

        onProgress(`Downloading "${itemMetadata.name || itemMetadata.mediaType}" (${i + 1}/${missingItems.length})...`);
        try {
            const blob = await driveService.downloadMediaFile(itemMetadata.driveFileId);
            const media = await fileToDataUrl(new File([blob], "file"));
            const thumbnail = await dataUrlToThumbnail(media, 256);

            const newItem: LibraryItem = {
                ...(itemMetadata as LibraryItem), // Trusting the structure from Drive
                media,
                thumbnail,
            };
            await idbService.saveToLibrary(newItem, true);
        } catch (e) {
            console.error(`Failed to download or save file for item ${itemMetadata.id}`, e);
        }
    }
    onProgress("Sync complete!");
};

export const syncLibraryToDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Checking for local items to upload...");
    const localItems = await idbService.getLibraryItems();
    const itemsToUpload = localItems.filter(item => !item.driveFileId);

    if (itemsToUpload.length === 0) {
        onProgress("All local items are already synced to Drive.");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return;
    }

    onProgress(`Uploading ${itemsToUpload.length} unsynced item(s)... This may take a while.`);
    const uploadErrors: string[] = [];
    
    // Fetch the index once at the beginning
    const { index, fileId: initialFileId } = await driveService.getLibraryIndex();
    let currentFileId = initialFileId;

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

            // Add the new item to the in-memory index
            const { media, thumbnail, ...metadata } = item;
            index.items[item.id] = { ...metadata, driveFileId };
            
        } catch (e: any) {
            console.error(`Failed to upload item ${item.id} to Drive:`, e);
            uploadErrors.push(`- ${itemName}: ${e.message}`);
        }
    }

    onProgress("Finalizing by updating library index file...");
    try {
        await driveService.updateLibraryIndex(index, currentFileId);
    } catch(e: any) {
        uploadErrors.push(`- CRITICAL: Failed to update library.json index file. Some uploads may appear missing until next sync. Error: ${e.message}`);
    }
    
    if (uploadErrors.length > 0) {
        onProgress("Upload sync complete with some errors.");
        throw new Error(`The following items failed to upload:\n${uploadErrors.join('\n')}`);
    } else {
        onProgress("Upload sync complete!");
    }
};


export const getLibraryItems = async (): Promise<LibraryItem[]> => {
  return idbService.getLibraryItems();
};

export const deleteLibraryItem = async (id: number): Promise<void> => {
  // First, delete from local DB
  const itemToDelete = await idbService.getItemById(id);
  await idbService.deleteLibraryItem(id);

  // Then, if synced, remove from Drive
  if (driveService?.isConnected() && itemToDelete?.driveFileId) {
      // This is a "soft delete" for simplicity. The file remains in Drive but is removed from the index.
      // A full implementation would also delete the media file itself.
      try {
          const { index, fileId } = await driveService.getLibraryIndex();
          if (index.items[id]) {
              delete index.items[id];
              await driveService.updateLibraryIndex(index, fileId);
          }
      } catch (e) {
           console.error(`Failed to remove item ${id} from Google Drive index. It may reappear on next sync.`, e);
      }
  }
};

export const clearLibrary = async (): Promise<void> => {
    await idbService.clearLibrary();
    // Also clear the remote index if connected
    if (driveService?.isConnected()) {
        try {
            const { fileId } = await driveService.getLibraryIndex();
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

  let dataUrl: string;
  let extension: string;

  switch (item.mediaType) {
    case 'video':
      dataUrl = item.media;
      extension = 'mp4';
      break;
    case 'clothes':
      try {
        const parsed = JSON.parse(item.media);
        dataUrl = parsed.laidOutImage || parsed.foldedImage;
      } catch (e) {
        dataUrl = item.media;
      }
      extension = 'png';
      break;
    case 'image':
    default:
      dataUrl = item.media;
      extension = 'jpeg';
      break;
  }

  if (!dataUrl) {
    throw new Error('No media data found for this item.');
  }

  const blob = await dataUrlToBlob(dataUrl);

  const suggestedName = `lawiz_ai_${item.mediaType}_${item.id}.${extension}`;

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: `${item.mediaType.charAt(0).toUpperCase() + item.mediaType.slice(1)} File`,
        accept: { [blob.type]: [`.${extension}`] },
      }],
    });
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