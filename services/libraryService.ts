// Fix: Add a global declaration for window.showSaveFilePicker to resolve TypeScript errors.
declare global {
  interface Window {
    showSaveFilePicker: (options?: any) => Promise<any>;
  }
}

import type { LibraryItem } from '../types';
import * as idbService from './idbLibraryService';
import { dataUrlToBlob, dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import * as googleDriveService from './googleDriveService';
import { generateTitleForImage, summarizePrompt } from './geminiService';

let driveService: typeof googleDriveService | null = null;

// Fix: Redefined types to match googleDriveService to resolve 'any' type issues.
type LibraryItemMetadata = Omit<LibraryItem, 'media' | 'thumbnail'> | LibraryItem;
type LibraryIndex = { version: number; items: Record<string, LibraryItemMetadata> };

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

      if (newItem.mediaType === 'prompt' || newItem.mediaType === 'color-palette') {
          index.items[newItem.id] = newItem;
          await driveService.updateLibraryIndex(index, indexFileId);
          return newItem;
      }

      const blob = await dataUrlToBlob(newItem.media);
      let subfolderName: string;
      switch (newItem.mediaType) {
        case 'image': subfolderName = 'images'; break;
        case 'video': subfolderName = 'videos'; break;
        case 'clothes': subfolderName = 'clothes'; break;
        case 'extracted-frame': subfolderName = 'extracted-frames'; break;
        case 'object': subfolderName = 'objects'; break;
        case 'pose': subfolderName = 'poses'; break;
        case 'font': subfolderName = 'fonts'; break;
        default: subfolderName = 'misc';
      }
      const parentFolderId = await driveService.getOrCreateSubfolder(subfolderName);
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
      const filename = `${newItem.mediaType}_${newItem.id}.${extension}`;

      const driveFileId = await driveService.uploadMediaFile(blob, filename, parentFolderId);
      
      await idbService.updateLibraryItem(newItem.id, { driveFileId });

      const { media, ...metadata } = newItem;
      index.items[newItem.id] = { ...metadata, driveFileId };
      
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
            if (itemMetadata.mediaType === 'prompt' || itemMetadata.mediaType === 'color-palette') {
                await idbService.saveToLibrary(itemMetadata as LibraryItem, true);
            } else if (itemMetadata.driveFileId) {
                const blob = await driveService.downloadMediaFile(itemMetadata.driveFileId);
                const media = await fileToDataUrl(new File([blob], "file", { type: blob.type }));
                
                let thumbnail: string;
                if (itemMetadata.mediaType === 'video' && itemMetadata.startFrame) {
                    thumbnail = await dataUrlToThumbnail(itemMetadata.startFrame, 256);
                } else if (itemMetadata.mediaType === 'video') {
                    // SVG placeholder for a video thumbnail if startFrame is missing
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#6b7280"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>`;
                    thumbnail = `data:image/svg+xml;base64,${btoa(svg)}`;
                } else {
                    thumbnail = await dataUrlToThumbnail(media, 256);
                }

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
            let currentDriveFileId = item.driveFileId;
            
            // If it's not text-based and doesn't have a driveFileId, it needs uploading.
            if (!isTextBased && !currentDriveFileId) {
                const blob = await dataUrlToBlob(item.media);
                let subfolderName: string;
                switch (item.mediaType) {
                    case 'image': subfolderName = 'images'; break;
                    case 'video': subfolderName = 'videos'; break;
                    case 'clothes': subfolderName = 'clothes'; break;
                    case 'extracted-frame': subfolderName = 'extracted-frames'; break;
                    case 'object': subfolderName = 'objects'; break;
                    case 'pose': subfolderName = 'poses'; break;
                    case 'font': subfolderName = 'fonts'; break;
                    default: subfolderName = 'misc';
                }
                const parentFolderId = await driveService.getOrCreateSubfolder(subfolderName);
                const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
                const filename = `${item.mediaType}_${item.id}.${extension}`;

                currentDriveFileId = await driveService.uploadMediaFile(blob, filename, parentFolderId);
                await idbService.updateLibraryItem(item.id, { driveFileId: currentDriveFileId });
            }
            
            // Add/update the item in the in-memory index.
            const { media, ...metadata } = item;
            updatedIndex.items[item.id] = { ...metadata, driveFileId: currentDriveFileId };

        } catch (e: any) {
            console.error(`Failed to sync item ${item.id} to Drive:`, e);
            uploadErrors.push(`- ${itemName}: ${e.message}`);
        }
    }

    if (indexNeedsUpdate) {
        onProgress("Finalizing by updating library index file...");
        try {
            await driveService.updateLibraryIndex(updatedIndex, initialFileId);
        } catch(e: any) {
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

export const exportLibraryAsJson = async (projectName: string): Promise<void> => {
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
        const sanitizedName = projectName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        a.download = `${sanitizedName || 'library'}_backup.json`;
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
    // This function now ONLY handles local deletion to ensure it is fast and reliable.
    // Syncing the deletion to Google Drive will be handled by the main `syncLibraryToDrive` function,
    // not by the immediate delete action.
    await idbService.deleteLibraryItem(id);
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