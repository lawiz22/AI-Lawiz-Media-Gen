import type { LibraryItem } from '../types';
import { getLibraryAssetBlob } from './idbLibraryService';

type MediaKind = 'image' | 'video' | 'audio';
const formats: Record<string, string> = {
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv',
    'video/x-msvideo': 'avi', 'video/mpeg': 'mpeg', 'video/x-m4v': 'm4v',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/tiff': 'tiff',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
    'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
};

export const readLibraryMediaFile = async (
    item: LibraryItem, kinds: readonly MediaKind[], signal: AbortSignal = AbortSignal.timeout(120000),
): Promise<File> => {
    signal.throwIfAborted();
    const asset = item.assetRefs?.media;
    let blob: Blob;
    if (asset) blob = await getLibraryAssetBlob(asset);
    else {
        if (!/^(blob:|data:)/.test(item.media)) throw new Error('This Library item has no local media. Restore its original file before importing.');
        const response = await fetch(item.media, { signal });
        if (!response.ok) throw new Error(`Cannot read Library media: HTTP ${response.status}.`);
        blob = await response.blob();
    }
    signal.throwIfAborted();
    if (!blob.size) throw new Error('The selected Library media is empty.');
    let mime = blob.type.split(';')[0].trim().toLowerCase();
    if (!mime || mime === 'application/octet-stream') {
        mime = asset?.mimeType?.split(';')[0].trim().toLowerCase() || '';
        if (!mime || mime === 'application/octet-stream') {
            const filename = item.characterSwapOptions?.filename || item.minimaxH3Options?.filename || item.name || '';
            const extension = filename.split('.').pop()?.toLowerCase();
            mime = Object.entries(formats).find(([type, ext]) => kinds.some(kind => type.startsWith(`${kind}/`))
                && (ext === extension || ext === 'jpg' && extension === 'jpeg'))?.[0] || '';
        }
    }
    const extension = formats[mime];
    if (!extension || !kinds.some(kind => mime.startsWith(`${kind}/`))) {
        throw new Error(`Select a supported ${kinds.join(' or ')} file from Library (received ${mime || 'unknown format'}).`);
    }
    return new File([blob], `library-${item.id}-${crypto.randomUUID()}.${extension}`, { type: mime });
};
