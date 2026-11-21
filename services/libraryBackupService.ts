import type { LibraryAssetRef, LibraryAssetRole, LibraryItem } from '../types';
import { getLibraryAssetBlob, getLibraryItems, isLibraryAssetRole, setLibraryAssetValue } from './idbLibraryService';

const encodeBase64 = (bytes: Uint8Array): string => {
    let text = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(text);
};

export async function* streamLibraryJson(
    items: LibraryItem[], onProgress?: (completed: number, total: number) => void,
): AsyncGenerator<string> {
    yield '[';
    for (const [index, item] of items.entries()) {
        if (!['prompt', 'preset', 'color-palette'].includes(item.mediaType) && !item.assetRefs?.media && !item.media.startsWith('data:') && !item.media.startsWith('blob:')) {
            throw new Error(`"${item.name || item.id}" has no original local media. Save its original file before creating a portable backup.`);
        }
        const { assetRefs, ...metadata } = structuredClone(item);
        const placeholders = new Map<string, LibraryAssetRef>();
        for (const [role, ref] of Object.entries(assetRefs || {}) as [LibraryAssetRole, LibraryAssetRef][]) {
            const token = `LAWIZ_ASSET_${crypto.randomUUID()}`;
            placeholders.set(token, ref);
            setLibraryAssetValue(metadata, role, token);
        }
        const checkMedia = (value: string | undefined, label: string, required = false) => {
            if (!value && !required) return;
            if (!value || (!value.startsWith('data:') && !placeholders.has(value))) {
                throw new Error(`"${item.name || item.id}": ${label} has no portable original media. Restore or save its original file before backup.`);
            }
        };
        for (const [field, value] of Object.entries(metadata)) {
            if (isLibraryAssetRole(field) && field !== 'media' && typeof value === 'string') checkMedia(value, field);
        }
        metadata.videoPromptOptions?.references.forEach((reference, position) => {
            checkMedia(reference.file.data, `reference ${position + 1}`, true);
            if (reference.original) checkMedia(reference.original.data, `original reference ${position + 1}`, true);
        });
        metadata.qwen21MultiSources?.forEach((value, position) => checkMedia(value, `source ${position + 1}`, true));
        metadata.ltxDirectorOptions?.segments.forEach((segment, position) => checkMedia(segment.sourceImage, `segment ${position + 1}`));
        const json = JSON.stringify(metadata);
        if (/"blob:[^"]*"/.test(json)) throw new Error(`"${item.name || item.id}" still contains a temporary blob URL. Its original media must be saved locally before backup.`);
        if (index) yield ',';
        let offset = 0;
        const tokens = /"LAWIZ_ASSET_[a-f0-9-]+"/g;
        for (const match of json.matchAll(tokens)) {
            yield json.slice(offset, match.index);
            const ref = placeholders.get(match[0].slice(1, -1));
            if (!ref) throw new Error('Invalid asset placeholder in Library backup.');
            const blob = await getLibraryAssetBlob(ref);
            const mime = blob.type || ref.mimeType;
            if (!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[^\r\n]*)?$/.test(mime)) throw new Error(`Invalid MIME type in "${item.name || item.id}".`);
            yield JSON.stringify(`data:${mime};base64,`).slice(0, -1);
            const chunkSize = 3 * 256 * 1024;
            for (let start = 0; start < blob.size; start += chunkSize) {
                yield encodeBase64(new Uint8Array(await blob.slice(start, start + chunkSize).arrayBuffer()));
            }
            yield '"';
            offset = match.index! + match[0].length;
        }
        yield json.slice(offset);
        onProgress?.(index + 1, items.length);
    }
    yield ']';
}

export const exportLibraryJson = async (
    projectName: string, selectedItems?: LibraryItem[], onProgress?: (completed: number, total: number) => void,
): Promise<void> => {
    const items = selectedItems ?? await getLibraryItems();
    if (!items.length) throw new Error('There are no Library items to back up.');
    const filename = `${projectName.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Library'}_${new Date().toISOString().slice(0, 10)}_library.json`;
    if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Library JSON backup', accept: { 'application/json': ['.json'] } }] });
        const writer: FileSystemWritableFileStream = await handle.createWritable();
        try {
            for await (const chunk of streamLibraryJson(items, onProgress)) await writer.write(chunk);
            await writer.close();
        } catch (error) {
            await writer.abort().catch(abortError => console.error('Could not abort the incomplete Library backup.', abortError));
            throw error;
        }
    } else {
        const chunks: BlobPart[] = [];
        for await (const chunk of streamLibraryJson(items, onProgress)) chunks.push(chunk);
        const url = URL.createObjectURL(new Blob(chunks, { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
};
