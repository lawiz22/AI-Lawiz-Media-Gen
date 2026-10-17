export const MAX_REFERENCE_PHOTOS = 9;
export const REFERENCE_RATIOS = ['original', 'free', '1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'] as const;
export type ReferenceRatio = typeof REFERENCE_RATIOS[number];

export interface ReferenceCrop {
    unit: '%';
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ReferenceSource {
    width: number;
    height: number;
    crop: ReferenceCrop;
}

export interface ReferenceSheetSettings {
    columns: number;
    gap: number;
    megapixels: number;
    background: string;
}

export const referenceAspect = (ratio: ReferenceRatio, width: number, height: number): number | undefined => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid reference image dimensions.');
    if (ratio === 'free') return undefined;
    if (ratio === 'original') return width / height;
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h || !Number.isFinite(w / h)) throw new Error('Invalid reference aspect ratio.');
    return w / h;
};

export const initialReferenceCrop = (ratio: ReferenceRatio, width: number, height: number): ReferenceCrop => {
    const aspect = referenceAspect(ratio, width, height) ?? width / height;
    const sourceAspect = width / height;
    const cropWidth = aspect < sourceAspect ? aspect / sourceAspect * 100 : 100;
    const cropHeight = aspect > sourceAspect ? sourceAspect / aspect * 100 : 100;
    return { unit: '%', x: (100 - cropWidth) / 2, y: (100 - cropHeight) / 2, width: cropWidth, height: cropHeight };
};

export const referenceCropPixels = ({ width, height, crop }: ReferenceSource) => {
    if (![width, height, crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
        || width <= 0 || height <= 0 || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0
        || crop.x + crop.width > 100.000001 || crop.y + crop.height > 100.000001) {
        throw new Error('Choose a non-empty crop within each reference photo.');
    }
    return { x: width * crop.x / 100, y: height * crop.y / 100, width: width * crop.width / 100, height: height * crop.height / 100 };
};

export const layoutReferenceSheet = (sources: ReferenceSource[], settings: ReferenceSheetSettings) => {
    if (sources.length < 1 || sources.length > MAX_REFERENCE_PHOTOS) throw new Error(`Reference Maker requires 1 to ${MAX_REFERENCE_PHOTOS} photos.`);
    if (!Number.isInteger(settings.columns) || settings.columns < 0 || settings.columns > MAX_REFERENCE_PHOTOS
        || !Number.isFinite(settings.gap) || settings.gap < 0 || settings.gap > 100
        || !Number.isFinite(settings.megapixels) || settings.megapixels < 0.25 || settings.megapixels > 8
        || !/^#[0-9a-f]{6}$/i.test(settings.background)) throw new Error('Invalid reference sheet settings.');
    const crops = sources.map(referenceCropPixels);
    const columns = Math.min(sources.length, settings.columns || Math.ceil(Math.sqrt(sources.length)));
    const rows = Math.ceil(sources.length / columns);
    const aspects = crops.map(crop => crop.width / crop.height);
    const widestRow = Math.max(...Array.from({ length: rows }, (_, row) =>
        aspects.slice(row * columns, (row + 1) * columns).reduce((sum, aspect) => sum + aspect, 0)));
    // A fixed row height preserves every photo's crop ratio without stretching or additional cropping.
    const baseHeight = 600;
    const baseWidth = widestRow * baseHeight + (columns - 1) * settings.gap;
    const baseTotalHeight = rows * baseHeight + (rows - 1) * settings.gap;
    const scale = Math.min(
        Math.sqrt(settings.megapixels * 1_000_000 / (baseWidth * baseTotalHeight)),
        8192 / baseWidth,
        8192 / baseTotalHeight,
    );
    const width = Math.max(1, Math.floor(baseWidth * scale));
    const height = Math.max(1, Math.floor(baseTotalHeight * scale));
    const tiles = crops.map((crop, index) => {
        const row = Math.floor(index / columns);
        const rowStart = row * columns;
        const rowAspects = aspects.slice(rowStart, rowStart + columns);
        const rowWidth = rowAspects.reduce((sum, aspect) => sum + aspect * baseHeight, 0) + (rowAspects.length - 1) * settings.gap;
        const prior = aspects.slice(rowStart, index).reduce((sum, aspect) => sum + aspect * baseHeight + settings.gap, 0);
        return {
            source: crop,
            x: (Math.max(0, (baseWidth - rowWidth) / 2) + prior) * scale,
            y: row * (baseHeight + settings.gap) * scale,
            width: aspects[index] * baseHeight * scale,
            height: baseHeight * scale,
        };
    });
    return { width, height, columns, rows, tiles };
};

export const drawReferenceSheet = (
    canvas: HTMLCanvasElement,
    images: { image: HTMLImageElement; crop: ReferenceCrop }[],
    settings: ReferenceSheetSettings,
) => {
    const layout = layoutReferenceSheet(images.map(({ image, crop }) => ({
        width: image.naturalWidth, height: image.naturalHeight, crop,
    })), settings);
    canvas.width = layout.width;
    canvas.height = layout.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create the reference sheet canvas.');
    context.fillStyle = settings.background;
    context.fillRect(0, 0, layout.width, layout.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    layout.tiles.forEach((tile, index) => {
        const source = tile.source;
        context.drawImage(images[index].image, source.x, source.y, source.width, source.height, tile.x, tile.y, tile.width, tile.height);
    });
    return layout;
};
