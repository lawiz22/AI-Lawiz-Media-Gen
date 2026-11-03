import JSZip from 'jszip';
import type { LibraryItem } from '../types';
import { readRenderedLibraryMedia } from './minimaxH3Library';
import type { BlazingResult } from './blazingFastCharacterService';
import type { BlazingSnapshot } from './blazingFastCharacterWorkflow';

export const blazingImageBlob = async (url: string, signal?: AbortSignal): Promise<Blob> => {
    const timeout = AbortSignal.timeout(120000);
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error(`Cannot download Blazing Fast image (${response.status}).`);
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('image/')) throw new Error('ComfyUI returned an empty or non-image Blazing Fast output.');
    return blob;
};
export const buildBlazingLibraryImage = async (result: BlazingResult, outputId: string, signal?: AbortSignal) => {
    const output = result.images.find(image => image.id === outputId);
    if (!output) throw new Error(`Unknown Blazing Fast output ${outputId}.`);
    const blob = await blazingImageBlob(output.url, signal);
    const media = await readRenderedLibraryMedia(output.url, blob, 'Blazing Fast');
    signal?.throwIfAborted();
    const snapshot: BlazingSnapshot = {
        version: 1, settings: structuredClone(result.draft.settings), style: result.style ? structuredClone(result.style) : undefined,
        workflow: result.workflow, promptId: result.promptId, outputId, caption: output.caption, identity: result.identity, finalCaption: result.finalCaption, outcome: result.outcome,
    };
    const item: Omit<LibraryItem, 'id'> & { assetBlobs: { media: Blob; sourceImage?: Blob } } = {
        mediaType: 'character', name: `Blazing Fast - ${output.label}`, media: '', thumbnail: media.thumbnail,
        tags: ['blazing-fast-character', 'flux2', ...(result.style ? [result.style.title] : [])],
        blazingFastOptions: snapshot, assetBlobs: { media: blob, sourceImage: result.draft.file },
    };
    return { item, warning: media.warning };
};
export const buildBlazingLibraryCaption = (image: LibraryItem): Omit<LibraryItem, 'id'> => {
    if (!image.blazingFastOptions?.caption) throw new Error('The Blazing Fast image has no saved caption.');
    return { name: `${image.name} - caption`, mediaType: 'prompt', promptType: 'image',
        media: image.blazingFastOptions.caption, thumbnail: image.thumbnail, tags: image.tags,
        linkedResultId: image.id, blazingFastOptions: image.blazingFastOptions };
};
export const downloadBlazingBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const downloadBlazingBundle = async (outputs: { label: string; url: string; caption: string }[], signal?: AbortSignal): Promise<void> => {
    const zip = new JSZip();
    for (const output of outputs) {
        const blob = await blazingImageBlob(output.url, signal);
        const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
        const name = output.label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
        zip.file(`${name}.${extension}`, blob); zip.file(`${name}.txt`, output.caption);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    signal?.throwIfAborted(); downloadBlazingBlob(blob, 'blazing-fast-character.zip');
};
