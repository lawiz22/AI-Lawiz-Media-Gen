import type { LibraryItem } from '../types';
import * as idbService from './idbLibraryService';
import { dataUrlToBlob } from '../utils/imageUtils';

// This service now acts as a direct interface to the IndexedDB service.
// The file system logic has been removed to simplify the architecture and
// resolve issues with the File System Access API in sandboxed environments.

export const saveToLibrary = async (item: Omit<LibraryItem, 'id'>): Promise<void> => {
  return idbService.saveToLibrary(item);
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