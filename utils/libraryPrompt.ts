import type { LibraryItem } from '../types';

export const filterLibraryPrompts = (items: LibraryItem[], query: string): LibraryItem[] => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter(item => item.mediaType === 'prompt' && item.promptType !== 'wan-video' && item.media?.trim()
        && (!search || [item.name, item.media, ...(item.tags || [])].some(value => value?.toLocaleLowerCase().includes(search))));
};

export const getLibraryPromptPreview = (item: LibraryItem, items: LibraryItem[]) => {
    const linked = items.find(candidate => candidate.id === item.linkedResultId);
    if (linked?.thumbnail) return { src: linked.thumbnail };
    if (linked?.assetRefs?.media) return { ref: linked.assetRefs.media };
    if (linked?.media?.startsWith('data:image/')) return { src: linked.media };
    if (item.sourceImage) return { src: item.sourceImage };
    if (item.assetRefs?.sourceImage) return { ref: item.assetRefs.sourceImage };
    if (item.previewThumbnail) return { src: item.previewThumbnail };
    return null;
};
