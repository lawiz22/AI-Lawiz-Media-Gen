import type { CharacterSwapLibraryOptions, LibraryAssetRole, LibraryItem } from '../types';
import type { SwapProject, SwapResult, SwapVideo } from './characterSwapService';
import { swapJSON, swapRequest, swapVideoURL } from './characterSwapService';
import { isRecord } from './minimaxH3Workflow';
import { readRenderedLibraryMedia } from './minimaxH3Library';
import { readLibraryMediaFile } from './libraryMediaService';

export const swapResultSnapshot = (project: SwapProject): SwapResult => {
    if (!project.result?.videos.length) throw new Error('No Character Swap video is available to save.');
    const result = structuredClone(project.result);
    const job = project.job;
    const sameVideo = (a: SwapVideo, b: SwapVideo) => a.filename === b.filename && a.subfolder === b.subfolder && a.type === b.type;
    const matching = result.sourceRangeVerified === true && job?.state === 'completed' && job.base === result.base
        && job.videos?.some(video => sameVideo(video, result.videos[0]));
    if (matching) {
        result.workflow ??= structuredClone(job.workflow);
        result.settings ??= job.settings && structuredClone(job.settings);
        result.promptId ??= job.promptId;
    }
    return result;
};

export const buildCharacterSwapLibraryItem = async (
    result: SwapResult, index = 0,
): Promise<{ item: Omit<LibraryItem, 'id'> & { assetBlobs: Partial<Record<LibraryAssetRole, Blob>> }; warning?: string }> => {
    const video = result.videos[index];
    if (!video || (index !== 0 && index !== 1)) throw new Error('This Character Swap output is not available.');
    const metadata: CharacterSwapLibraryOptions = structuredClone({
        version: 1, savedAt: new Date().toISOString(), filename: video.filename,
        output: index === 1 ? 'comparison' : 'result', plan: result.plan,
        planIsExecutionSnapshot: result.sourceRangeVerified === true,
        settings: result.settings, workflow: result.workflow, promptId: result.promptId,
    });
    const { blob, mediaType, thumbnail, warning } = await readRenderedLibraryMedia(swapVideoURL(result.base, video));
    if (mediaType !== 'video') throw new Error('Character Swap did not return a video. The output was not added to Library.');
    return {
        item: {
            name: `Character Swap H3${index === 1 ? ' comparison' : ''} - ${video.filename}`,
            mediaType, media: '', thumbnail, tags: ['minimax-h3', 'character-swap', ...(index === 1 ? ['comparison'] : [])],
            characterSwapOptions: metadata, assetBlobs: { media: blob },
        },
        warning,
    };
};

export const swapLibraryFile = async (item: LibraryItem, kind: 'video' | 'image'): Promise<File> => {
    const file = await readLibraryMediaFile(item, [kind]);
    return new File([file], `lawiz-swap-${file.name}`, { type: file.type });
};

export const uploadSwapLibraryFile = async (
    base: string, file: File, onProgress: (fraction: number) => void,
): Promise<string> => {
    onProgress(0);
    let payload: unknown;
    if (file.size >= 32 * 1024 * 1024) {
        const id = crypto.randomUUID().replace(/-/g, '');
        const chunk = 8 * 1024 * 1024;
        for (let offset = 0; offset < file.size; offset += chunk) {
            const end = Math.min(file.size, offset + chunk);
            await swapRequest(base, `/bfs/upload/chunk?id=${id}&offset=${offset}`, { method: 'POST', body: file.slice(offset, end) });
            onProgress(end / file.size);
        }
        payload = await swapJSON(base, '/bfs/upload/finish', { id, name: file.name, size: file.size });
    } else {
        const body = new FormData();
        body.append('image', file); body.append('type', 'input');
        payload = await (await swapRequest(base, '/upload/image', { method: 'POST', body })).json();
    }
    if (!isRecord(payload) || payload.error || typeof payload.name !== 'string' || !payload.name.trim()) {
        throw new Error(`ComfyUI did not confirm the Library upload: ${JSON.stringify(payload).slice(0, 1000)}`);
    }
    onProgress(1);
    return typeof payload.subfolder === 'string' && payload.subfolder ? `${payload.subfolder}/${payload.name}` : payload.name;
};
