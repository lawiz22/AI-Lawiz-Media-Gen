import type { LibraryItem, LibraryAssetRole, VideoPromptLibraryFile, VideoPromptLibraryOptions } from '../types';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { buildVideoPromptInstruction, captureVideoPromptInputs, validateVideoPromptOutput, type VideoPromptInputs } from './videoPromptService';

const serializeFile = (file: File): VideoPromptLibraryFile => ({
    name: file.name, type: file.type, lastModified: file.lastModified, data: '',
});

export const buildVideoPromptLibraryItem = async (
    text: string,
    inputs: VideoPromptInputs,
    provenance: VideoPromptLibraryOptions['provenance'] = 'generation',
): Promise<Omit<LibraryItem, 'id'> & { assetBlobs: Partial<Record<LibraryAssetRole, Blob>> }> => {
    const media = validateVideoPromptOutput(text, inputs.template);
    const snapshot = captureVideoPromptInputs(inputs);
    const instruction = buildVideoPromptInstruction(snapshot);
    const references: VideoPromptLibraryOptions['references'] = [];
    const assetBlobs: Partial<Record<LibraryAssetRole, Blob>> = {};
    for (const [index, ref] of snapshot.references.entries()) {
        references.push({
            id: ref.id, kind: ref.kind, slot: ref.slot, note: ref.note,
            file: serializeFile(ref.file),
            original: ref.original !== ref.file ? serializeFile(ref.original) : undefined,
        });
        assetBlobs[`videoPromptReference:${index}`] = ref.file;
        if (ref.original !== ref.file) assetBlobs[`videoPromptOriginal:${index}`] = ref.original;
    }
    const firstImage = snapshot.references.find(ref => ref.kind === 'image');
    let thumbnail: string;
    if (firstImage) {
        const url = URL.createObjectURL(firstImage.file);
        try { thumbnail = await dataUrlToThumbnail(url, 256); }
        finally { URL.revokeObjectURL(url); }
    } else {
        thumbnail = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="20" fill="#111827"/><text x="24" y="100" fill="#7dd3fc" font-family="sans-serif" font-size="24">VIDEO PROMPT</text><text x="24" y="140" fill="#c4b5fd" font-family="monospace" font-size="20">[ Shot 1 ]</text></svg>')}`;
    }
    return {
        mediaType: 'prompt', promptType: 'wan-video', media, thumbnail,
        name: `Video Prompt - ${snapshot.idea.replace(/\s+/g, ' ').trim().slice(0, 80)}`,
        tags: ['video-prompt', 'minimax-h3'],
        videoPromptOptions: { ...snapshot, references, version: 1, savedAt: new Date().toISOString(), provenance, instruction },
        assetBlobs,
    };
};

const restoreFile = async (file: VideoPromptLibraryFile): Promise<File> => {
    if (!file.data.startsWith('data:') && !file.data.startsWith('blob:')) throw new Error(`Saved reference "${file.name}" has no local media. Restore its Library assets before loading.`);
    const response = await fetch(file.data);
    if (!response.ok) throw new Error(`Could not read saved reference "${file.name}" (${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error(`Saved reference "${file.name}" is empty.`);
    return new File([blob], file.name, { type: file.type || blob.type, lastModified: file.lastModified });
};

export const restoreVideoPromptLibraryItem = async (item: LibraryItem): Promise<{ inputs: VideoPromptInputs; result: string }> => {
    const options = item.videoPromptOptions;
    if (!options || options.version !== 1) throw new Error('Unsupported or missing Video Prompt Generator settings.');
    const references: VideoPromptInputs['references'] = [];
    for (const ref of options.references) {
        const file = await restoreFile(ref.file);
        const original = ref.original ? await restoreFile(ref.original) : file;
        references.push({ id: ref.id, kind: ref.kind, slot: ref.slot, note: ref.note, file, original });
    }
    const inputs = captureVideoPromptInputs({ ...options, references });
    return { inputs, result: validateVideoPromptOutput(item.media, options.template) };
};

export const cloneVideoPromptLibraryOptions = (options: VideoPromptLibraryOptions | undefined): VideoPromptLibraryOptions | undefined =>
    options ? { ...options, references: options.references.map(ref => ({
        ...ref, file: { ...ref.file }, original: ref.original ? { ...ref.original } : undefined,
    })) } : undefined;

export const setVideoPromptLibraryAsset = (item: LibraryItem, role: string, data: string): void => {
    const match = /^(videoPromptReference|videoPromptOriginal):(\d+)$/.exec(role);
    if (!match) throw new Error(`Invalid video prompt asset role: ${role}.`);
    const ref = item.videoPromptOptions?.references[Number(match[2])];
    const file = match[1] === 'videoPromptOriginal' ? ref?.original : ref?.file;
    if (!file) throw new Error(`Video prompt asset metadata is missing for ${role}.`);
    file.data = data;
};
