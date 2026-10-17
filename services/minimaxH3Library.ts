import type { LibraryAssetRole, LibraryItem } from '../types';
import { createVideoPlaceholderThumbnail, dataUrlToThumbnail, videoToThumbnail } from '../utils/imageUtils';
import type { H3GenerationResult } from './minimaxH3Service';

const OUTPUT_MIME_TYPES: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
    gif: 'image/gif', webp: 'image/webp', png: 'image/png',
};

export const buildMinimaxH3LibraryItem = async (
    result: H3GenerationResult,
): Promise<{ item: Omit<LibraryItem, 'id'> & { assetBlobs: Partial<Record<LibraryAssetRole, Blob>> }; warning?: string }> => {
    const snapshot = structuredClone({
        version: 1 as const, savedAt: new Date().toISOString(),
        promptId: result.promptId, prompt: result.prompt, promptIsFinal: result.promptIsFinal,
        seed: result.seed, options: result.options, workflow: result.workflow,
        filename: new URL(result.videoUrl).searchParams.get('filename') || '',
    });
    const response = await fetch(result.videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Could not read the H3 output (${response.status}). Check that its ComfyUI output file still exists.`);
    const downloaded = await response.blob();
    if (!downloaded.size) throw new Error('The H3 output file is empty. Nothing was saved.');
    const reportedType = downloaded.type.split(';')[0].trim().toLowerCase();
    const extension = snapshot.filename.split('.').pop()?.toLowerCase() || '';
    const mimeType = !reportedType || reportedType === 'application/octet-stream' ? OUTPUT_MIME_TYPES[extension] : reportedType;
    if (!mimeType || (!mimeType.startsWith('video/') && !mimeType.startsWith('image/'))) throw new Error(`The server did not return a video or image output (${reportedType || 'unknown type'}). Nothing was saved.`);
    const mediaType = mimeType.startsWith('image/') ? 'image' : 'video';
    const blob = downloaded.type === mimeType ? downloaded : new Blob([downloaded], { type: mimeType });
    let thumbnail: string;
    let warning: string | undefined;
    try {
        if (mediaType === 'video') thumbnail = await videoToThumbnail(blob, 256);
        else {
            const url = URL.createObjectURL(blob);
            try { thumbnail = await dataUrlToThumbnail(url, 256); }
            finally { URL.revokeObjectURL(url); }
        }
    } catch (cause) {
        console.warn('H3 output thumbnail could not be extracted; retaining the original output with a placeholder.', cause);
        thumbnail = createVideoPlaceholderThumbnail();
        warning = 'A thumbnail could not be extracted for this codec. The original output file was saved with a placeholder.';
    }
    const title = snapshot.prompt.replace(/^[a-z_]+:\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 80) || snapshot.promptId;
    return {
        item: {
            name: `MiniMax H3 - ${title}`, mediaType, media: '', thumbnail,
            tags: ['minimax-h3', 'ref2v'], minimaxH3Options: snapshot,
            assetBlobs: { media: blob },
        },
        warning,
    };
};
