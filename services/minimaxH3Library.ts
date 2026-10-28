import type { LibraryAssetRef, LibraryAssetRole, LibraryItem } from '../types';
import { defaultAdvancedH3Options, type AdvancedVideoFinishing } from './minimaxH3AdvancedWorkflow';
import type { MinimaxDraft } from './videoPromptService';
import { createVideoPlaceholderThumbnail, dataUrlToThumbnail, videoToThumbnail } from '../utils/imageUtils';
import type { H3GenerationResult } from './minimaxH3Service';

const OUTPUT_MIME_TYPES: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
    gif: 'image/gif', webp: 'image/webp', png: 'image/png',
};

export const restoreAdvancedVideoLibraryItem = async (
    item: LibraryItem,
    finishing: AdvancedVideoFinishing,
    readAsset: (ref: LibraryAssetRef) => Promise<Blob> = async ref => (await import('./idbLibraryService')).getLibraryAssetBlob(ref),
) => {
    if (item.mediaType !== 'video' || !['latent', 'ltx'].includes(finishing)) throw new Error('Choose a Library video and a valid finishing stage.');
    const asset = item.assetRefs?.media;
    let blob: Blob;
    if (asset) blob = await readAsset(asset);
    else {
        if (!item.media) throw new Error('This Library video has no saved media. Restore its original file before processing.');
        const response = await fetch(item.media, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`Could not restore the Library video (${response.status}). The original item was not changed.`);
        blob = await response.blob();
    }
    const reportedType = blob.type.split(';')[0].trim().toLowerCase();
    const storedType = asset?.mimeType?.split(';')[0].trim().toLowerCase();
    const mimeType = reportedType && reportedType !== 'application/octet-stream' ? reportedType
        : storedType?.startsWith('video/') ? storedType : OUTPUT_MIME_TYPES[item.minimaxH3Options?.filename?.split('.').pop()?.toLowerCase() || ''];
    if (!blob.size || !mimeType?.startsWith('video/')) throw new Error('The saved Library asset is not a non-empty video. No draft was replaced.');
    const extension = mimeType.includes('webm') ? 'webm' : mimeType.includes('matroska') ? 'mkv' : mimeType.includes('quicktime') ? 'mov' : 'mp4';
    const file = new File([blob], `library-${item.id}.${extension}`, { type: mimeType });
    const options = defaultAdvancedH3Options();
    if (!options.advanced) throw new Error('Advanced defaults are missing.');
    Object.assign(options.advanced, { inputMode: 'video', latentUpscale: finishing === 'latent', ltxRefine: finishing === 'ltx',
        rtxUpscale: false, interpolation: false, sourceAudio: true });
    options.preview = false;
    options.useLoras = false;
    options.generateAudio = false;
    options.filenamePrefix = 'MrWeaz/%date:yyyy-MM-dd%/Advanced_Finishing_';
    const draft: MinimaxDraft = { id: crypto.randomUUID(), workflow: 'advanced', template: 'generation', aspect: '4:3', duration: options.duration,
        prompt: 'High quality restoration, preserve the source video.',
        references: [{ id: crypto.randomUUID(), kind: 'video', slot: 1, note: item.name || 'Library source video', file, original: file }] };
    return { draft, options, warning: 'Source video loaded for finishing only. No H3 first pass will run. FPS and optional soundtrack come from the source; VAE processing may adjust frame count. The Library item was not changed.' };
};

export const readRenderedLibraryMedia = async (videoUrl: string, localBlob?: Blob): Promise<{
    blob: Blob; mediaType: 'video' | 'image'; thumbnail: string; warning?: string;
}> => {
    const filename = new URL(videoUrl).searchParams.get('filename') || '';
    let downloaded = localBlob;
    if (!downloaded) {
        const response = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`Could not read the H3 output (${response.status}). Check that its ComfyUI output file still exists.`);
        downloaded = await response.blob();
    }
    if (!downloaded.size) throw new Error('The H3 output file is empty. Nothing was saved.');
    const reportedType = downloaded.type.split(';')[0].trim().toLowerCase();
    const extension = filename.split('.').pop()?.toLowerCase() || '';
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
    return { blob, mediaType, thumbnail, warning };
};

export const buildMinimaxH3LibraryItem = async (
    result: H3GenerationResult,
): Promise<{ item: Omit<LibraryItem, 'id'> & { assetBlobs: Partial<Record<LibraryAssetRole, Blob>> }; warning?: string }> => {
    const snapshot = structuredClone({
        version: 1 as const, savedAt: new Date().toISOString(),
        promptId: result.promptId, prompt: result.prompt, promptIsFinal: result.promptIsFinal,
        seed: result.seed, options: result.options, workflow: result.workflow,
        filename: result.videoBlob ? 'minimax-h3-original-audio.mp4' : new URL(result.videoUrl).searchParams.get('filename') || '',
    });
    const { blob, mediaType, thumbnail, warning } = await readRenderedLibraryMedia(result.videoUrl, result.videoBlob);
    const title = snapshot.prompt.replace(/^[a-z_]+:\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 80) || snapshot.promptId;
    return {
        item: {
            name: `${result.options.variant === 'advanced' ? 'MiniMax Advanced' : result.options.variant === 'ultrafast' ? 'Ultrafast' : 'MiniMax H3'} - ${title}`, mediaType, media: '', thumbnail,
            tags: ['minimax-h3', result.options.advanced?.inputMode === 'video' ? 'video-finishing' : result.options.advanced?.mode === 'fl2v' ? 'fl2v' : 'ref2v', ...(result.options.variant ? [result.options.variant] : [])], minimaxH3Options: snapshot,
            assetBlobs: { media: blob },
        },
        warning,
    };
};
