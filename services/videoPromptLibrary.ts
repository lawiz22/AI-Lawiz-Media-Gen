import type { LibraryItem, LibraryAssetRef, LibraryAssetRole, VideoPromptLibraryFile, VideoPromptLibraryOptions } from '../types';
import { dataUrlToThumbnail } from '../utils/imageUtils';
import { DEFAULT_VIDEO_TEMPLATES, buildVideoPromptInstruction, captureVideoPromptInputs, loadVideoPromptDraft, validateVideoPromptOutput, type MinimaxDraft, type VideoPromptDraft, type VideoPromptInputs } from './videoPromptService';
import { defaultMinimaxH3Options, h3AspectFromPrompt, withH3OriginalAudio, type MinimaxH3Options } from './minimaxH3Workflow';

const serializeFile = (file: File): VideoPromptLibraryFile => ({
    name: file.name, type: file.type, lastModified: file.lastModified, data: '',
});

const buildPromptLibraryItem = async (
    text: string,
    inputs: VideoPromptInputs,
    provenance: VideoPromptLibraryOptions['provenance'] = 'generation',
    renderOptions?: MinimaxH3Options,
): Promise<Omit<LibraryItem, 'id'> & { assetBlobs: Partial<Record<LibraryAssetRole, Blob>> }> => {
    const videoFinishing = renderOptions?.variant === 'advanced' && renderOptions.advanced?.inputMode === 'video';
    if (!text.trim() && !videoFinishing) throw new Error('A video prompt is required before saving to Library.');
    const media = renderOptions ? text : validateVideoPromptOutput(text, inputs.template);
    const snapshot = captureVideoPromptInputs(inputs);
    const savedRenderOptions = renderOptions ? structuredClone(renderOptions) : undefined;
    const instruction = renderOptions ? '' : buildVideoPromptInstruction(snapshot);
    const references: VideoPromptLibraryOptions['references'] = [];
    const assetBlobs: Partial<Record<LibraryAssetRole, Blob>> = {};
    for (const [index, ref] of snapshot.references.entries()) {
        references.push({
            id: ref.id, kind: ref.kind, slot: ref.slot, note: ref.note,
            ...(ref.audioSelection ? { audioSelection: { ...ref.audioSelection } } : {}),
            ...(ref.lyrics ? { lyrics: { ...ref.lyrics } } : {}),
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
        name: `${renderOptions ? renderOptions.variant === 'advanced' ? 'MiniMax Advanced' : renderOptions.variant === 'ultrafast' ? 'Ultrafast' : 'Minimax REF2v H3' : 'Video Prompt'} - ${snapshot.idea.replace(/\s+/g, ' ').trim().slice(0, 80) || (videoFinishing ? 'Video finishing setup' : '')}`,
        tags: ['video-prompt', 'minimax-h3'],
        videoPromptOptions: { ...snapshot, references, version: 1, savedAt: new Date().toISOString(), provenance, instruction,
            ...(savedRenderOptions ? { renderOptions: savedRenderOptions } : {}) },
        assetBlobs,
    };
};

export const buildVideoPromptLibraryItem = (
    text: string, inputs: VideoPromptInputs, provenance: VideoPromptLibraryOptions['provenance'] = 'generation',
) => buildPromptLibraryItem(text, inputs, provenance);

export const buildMinimaxH3PromptLibraryItem = (
    draft: MinimaxDraft, options: MinimaxH3Options,
) => buildPromptLibraryItem(draft.prompt, {
    idea: draft.prompt, provider: 'openrouter',
    models: { openrouter: '', gemini: '', mammouth: '' },
    aspect: options.aspect.split(' ')[0], duration: options.duration,
    template: draft.template, templates: { ...DEFAULT_VIDEO_TEMPLATES }, workflow: options.variant ?? 'reference',
    references: draft.references, originalAudioId: options.originalAudioId, forceOriginalAudio: options.forceOriginalAudio,
}, 'current-setup', options);

export const isMinimaxH3PromptLibraryItem = (item: LibraryItem): boolean =>
    !!item.videoPromptOptions || (item.mediaType === 'prompt' && item.promptType === 'wan-video');

interface PromptRestoreContext {
    item: LibraryItem;
    readAsset: (ref: LibraryAssetRef) => Promise<Blob>;
    loadWorkspace?: () => Promise<VideoPromptDraft | undefined>;
    workspace?: Promise<VideoPromptDraft | undefined>;
    recovered: string[];
}

const restoreFile = async (file: VideoPromptLibraryFile, context?: PromptRestoreContext, role?: LibraryAssetRole, referenceId?: string): Promise<File> => {
    let failure: unknown;
    try {
        const asset = role && context?.item.assetRefs?.[role];
        let blob: Blob;
        if (asset && context) {
            blob = await context.readAsset(asset);
        } else {
            if (!file.data.startsWith('data:') && !file.data.startsWith('blob:')) throw new Error('No local media or binary asset was saved.');
            const response = await fetch(file.data);
            if (!response.ok) throw new Error(`Media request failed (${response.status}).`);
            blob = await response.blob();
        }
        if (!blob.size) throw new Error('The saved file is empty.');
        return new File([blob], file.name, { type: file.type || blob.type, lastModified: file.lastModified });
    } catch (cause) { failure = cause; }
    if (context && referenceId && (context.loadWorkspace || typeof indexedDB !== 'undefined')) {
        context.workspace ??= (context.loadWorkspace || loadVideoPromptDraft)();
        const workspace = await context.workspace;
        const candidates = [
            ...(workspace?.references || []), ...(workspace?.generatedInputs?.references || []),
            ...Object.values(workspace?.minimaxDrafts || {}).flatMap(draft => draft?.references || []),
        ];
        for (const ref of candidates) {
            if (ref.id !== referenceId) continue;
            const candidate = role?.startsWith('videoPromptOriginal:') ? ref.original : ref.file;
            if (candidate instanceof File && candidate.size && candidate.name === file.name && candidate.type === file.type && candidate.lastModified === file.lastModified) {
                context.recovered.push(file.name);
                return candidate;
            }
        }
    }
    throw new Error(`Could not restore saved reference "${file.name}" (${role || 'legacy image'}): ${failure instanceof Error ? failure.message : String(failure)}. Its old preview URL may have expired. Restore the reference from a Library backup or reattach the original file; the saved prompt was not changed.`, { cause: failure });
};

export const restoreVideoPromptLibraryItem = async (item: LibraryItem): Promise<{ inputs: VideoPromptInputs; result: string }> => {
    const options = item.videoPromptOptions;
    if (!options || options.version !== 1) throw new Error('Unsupported or missing Video Prompt Generator settings.');
    const references: VideoPromptInputs['references'] = [];
    for (const ref of options.references) {
        const file = await restoreFile(ref.file);
        const original = ref.original ? await restoreFile(ref.original) : file;
        references.push({
            id: ref.id, kind: ref.kind, slot: ref.slot, note: ref.note, file, original,
            ...(ref.audioSelection ? { audioSelection: { ...ref.audioSelection } } : {}),
            ...(ref.lyrics ? { lyrics: { ...ref.lyrics } } : {}),
        });
    }
    const inputs = captureVideoPromptInputs({ ...options, references });
    return { inputs, result: options.renderOptions ? item.media : validateVideoPromptOutput(item.media, options.template) };
};

export const restoreMinimaxH3PromptLibraryItem = async (
    item: LibraryItem,
    readAsset: (ref: LibraryAssetRef) => Promise<Blob> = async ref => (await import('./idbLibraryService')).getLibraryAssetBlob(ref),
    loadWorkspace?: () => Promise<VideoPromptDraft | undefined>,
): Promise<{
    draft: MinimaxDraft; options: MinimaxH3Options; warning?: string;
}> => {
    if (!isMinimaxH3PromptLibraryItem(item)) throw new Error('This Library item is not a saved video prompt.');
    if (!item.media.trim() && !(item.videoPromptOptions?.renderOptions?.variant === 'advanced' && item.videoPromptOptions.renderOptions.advanced?.inputMode === 'video')) throw new Error('The saved video prompt is empty. The Library item was not changed.');
    const saved = item.videoPromptOptions;
    if (saved && saved.version !== 1) throw new Error('Unsupported video prompt settings version. The Library item was not changed.');
    const context: PromptRestoreContext = { item, readAsset, loadWorkspace, recovered: [] };
    const references: MinimaxDraft['references'] = [];
    for (const [index, ref] of (saved?.references || []).entries()) {
        const file = await restoreFile(ref.file, context, `videoPromptReference:${index}`, ref.id);
        const original = ref.original ? await restoreFile(ref.original, context, `videoPromptOriginal:${index}`, ref.id) : file;
        references.push({ ...ref, file, original,
            ...(ref.audioSelection ? { audioSelection: { ...ref.audioSelection } } : {}),
            ...(ref.lyrics ? { lyrics: { ...ref.lyrics } } : {}),
        });
    }
    if (!saved) {
        const sources = [...new Set([item.sourceImage, item.startFrame, item.endFrame].filter((value): value is string => !!value))];
        for (const [index, source] of sources.entries()) {
            const role = source === item.sourceImage ? 'sourceImage' : source === item.startFrame ? 'startFrame' : 'endFrame';
            const file = await restoreFile({ name: `saved-reference-${index + 1}.png`, type: '', lastModified: item.id, data: source }, context, role);
            references.push({ id: crypto.randomUUID(), kind: 'image', slot: index + 1, note: '', file, original: file });
        }
    }
    const options = saved?.renderOptions ? structuredClone(saved.renderOptions) : {
        ...withH3OriginalAudio(defaultMinimaxH3Options(), saved?.originalAudioId, saved?.forceOriginalAudio ?? false),
        ...(saved ? { aspect: h3AspectFromPrompt(saved.aspect), duration: saved.duration } : {}),
    };
    const warnings = [
        ...(!saved?.renderOptions ? ['This older prompt has no saved H3 model/sampling settings. Default H3 settings were loaded; review them before rendering. All stored prompt references were retained. The original Library item was not changed.'] : []),
        ...(context.recovered.length ? [`Recovered expired reference URLs from matching original files in the saved video workspace: ${context.recovered.join(', ')}. Save this setup to Library to create a durable copy.`] : []),
    ];
    return {
        draft: { id: crypto.randomUUID(), workflow: options.variant ?? 'reference', prompt: item.media, references,
            aspect: options.aspect.split(' ')[0], duration: options.duration, template: saved?.template ?? 'generation' },
        options,
        ...(warnings.length ? { warning: warnings.join(' ') } : {}),
    };
};

export const cloneVideoPromptLibraryOptions = (options: VideoPromptLibraryOptions | undefined): VideoPromptLibraryOptions | undefined =>
    options ? { ...options, ...(options.renderOptions ? { renderOptions: structuredClone(options.renderOptions) } : {}), references: options.references.map(ref => ({
        ...ref, file: { ...ref.file }, original: ref.original ? { ...ref.original } : undefined,
        ...(ref.audioSelection ? { audioSelection: { ...ref.audioSelection } } : {}),
        ...(ref.lyrics ? { lyrics: { ...ref.lyrics } } : {}),
    })) } : undefined;

export const setVideoPromptLibraryAsset = (item: LibraryItem, role: string, data: string): void => {
    const match = /^(videoPromptReference|videoPromptOriginal):(\d+)$/.exec(role);
    if (!match) throw new Error(`Invalid video prompt asset role: ${role}.`);
    const ref = item.videoPromptOptions?.references[Number(match[2])];
    const file = match[1] === 'videoPromptOriginal' ? ref?.original : ref?.file;
    if (!file) throw new Error(`Video prompt asset metadata is missing for ${role}.`);
    file.data = data;
};
