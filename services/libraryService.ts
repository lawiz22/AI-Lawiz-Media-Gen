import type { LibraryItem, DriveFolder } from '../types';
import * as idbService from './idbLibraryService';
import { dataUrlToBlob, dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import * as googleDriveService from './googleDriveService';

let driveService: typeof googleDriveService | null = null;

export function setDriveService(service: typeof googleDriveService | null) {
    driveService = service;
}

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<void> => {
  // Always save to local DB first and get the new item with its ID
  const newItem = await idbService.saveToLibrary(item);

  // If Drive is connected, upload the file and update the local record with the Drive File ID
  if (driveService?.isConnected()) {
      try {
          const driveFileId = await driveService.uploadFile(newItem);
          if (driveFileId) {
              await idbService.updateLibraryItem(newItem.id, { driveFileId });
          }
      } catch (e) {
          console.error("Failed to upload to Google Drive, but saved locally.", e);
          // Optionally, you could add a flag to the item indicating it needs to be synced later.
      }
  }
};

export const syncLibraryFromDrive = async (onProgress: (message: string) => void): Promise<void> => {
    if (!driveService || !driveService.isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    onProgress("Fetching file list from Google Drive...");
    const driveFiles = await driveService.listFiles();
    onProgress(`Found ${driveFiles.length} files in Drive. Checking against local library...`);
    const localItems = await idbService.getLibraryItems();
    const localDriveIds = new Set(localItems.map(item => item.driveFileId).filter(Boolean));

    const missingFiles = driveFiles.filter(file => file.id && !localDriveIds.has(file.id));

    if (missingFiles.length === 0) {
        onProgress("Local library is already up to date.");
        return;
    }

    onProgress(`Downloading ${missingFiles.length} new items...`);
    for (let i = 0; i < missingFiles.length; i++) {
        const file = missingFiles[i];
        if (!file.id) continue;

        onProgress(`Downloading "${file.name}" (${i + 1}/${missingFiles.length})...`);
        try {
            const { metadata, blob } = await driveService.downloadFile(file.id);
            if (metadata && blob) {
                const media = await fileToDataUrl(new File([blob], file.name!));
                const thumbnail = await dataUrlToThumbnail(media, 256);

                const newItem: LibraryItem = {
                    ...metadata,
                    media,
                    thumbnail,
                    driveFileId: file.id,
                };
                await idbService.saveToLibrary(newItem, true); // Save with existing ID
            }
        } catch (e) {
            console.error(`Failed to download or save file ${file.name} (ID: ${file.id})`, e);
            // Continue to the next file
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

    onProgress(`Found ${itemsToUpload.length} item(s) to upload...`);
    const uploadErrors: string[] = [];

    for (let i = 0; i < itemsToUpload.length; i++) {
        const item = itemsToUpload[i];
        const itemName = item.name || `${item.mediaType} #${item.id}`;
        onProgress(`Uploading "${itemName}" (${i + 1}/${itemsToUpload.length})...`);
        try {
            const driveFileId = await driveService.uploadFile(item);
            if (driveFileId) {
                await idbService.updateLibraryItem(item.id, { driveFileId });
            }
        } catch (e: any) {
            console.error(`Failed to upload item ${item.id} to Drive:`, e);
            uploadErrors.push(`- ${itemName}: ${e.message}`);
        }
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
  return idbService.deleteLibraryItem(id);
};

export const clearLibrary = async (): Promise<void> => {
  return idbService.clearLibrary();
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
    // AbortError is thrown when the user cancels the file picker.
    // We can safely ignore this.
    if (error.name !== 'AbortError') {
      console.error('Error saving file:', error);
      throw error;
    }
  }
};