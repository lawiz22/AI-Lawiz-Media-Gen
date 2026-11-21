import { getComfyRelativePath, inferFlux2Variant, inventoryItemMatchesFamily, inventoryFlux2Variant, resolveComfyOption, type CivitaiFamily, type CivitaiInventory, type CivitaiInventoryItem } from './civitaiService';
import { isH3LoraPath, type GalleryStyle } from './styleGallery';

const normalize = (value: string) => value.trim().replace(/\\/g, '/').toLowerCase();
const basename = (value: string) => normalize(value).split('/').pop()!.replace(/\.safetensors$/, '');
export const styleModelFamily = (model: string): CivitaiFamily | undefined => ({
    flux2: 'flux2-9b', flux29b: 'flux2-9b', flux24b: 'flux2-4b', flux: 'flux', sdxl: 'sdxl', sd15: 'sd15', krea: 'krea2', krea2: 'krea2', qwen: 'qwen',
    qwenedit: 'qwen-edit', qwen21: 'qwen21', moss: 'moss', mossimage: 'moss', mossphoto: 'moss', h3: 'minimax-h3', minimaxh3: 'minimax-h3',
    minimax: 'minimax-h3', h3minimax: 'minimax-h3', hminimax: 'minimax-h3',
    zit: 'zit-base', zimage: 'zit-base', ltx2: 'ltx-23', ltx23: 'ltx-23',
} as Record<string, CivitaiFamily>)[model.toLowerCase().replace(/[^a-z0-9]/g, '')];
export const styleLibraryLoras = (inventory: CivitaiInventory, model: string): CivitaiInventoryItem[] => {
    const family = styleModelFamily(model);
    return inventory.items.filter(item => item.kind === 'lora' && (family ? inventoryItemMatchesFamily(item, family)
        : normalize(getComfyRelativePath(item)).split('/')[0] === normalize(model)));
};
export const styleInstalledLoras = (names: string[], model: string, inventory?: CivitaiInventory): string[] => {
    const family = styleModelFamily(model);
    const indexed = new Map(inventory?.items.filter(item => item.kind === 'lora').map(item => [normalize(getComfyRelativePath(item)), item]));
    return names.filter(name => {
        if (family === 'minimax-h3' && !isH3LoraPath(name)) return false;
        if (family === 'krea2' || family === 'moss' || family === 'minimax-h3') {
            const item = indexed.get(normalize(name));
            return item ? inventoryItemMatchesFamily(item, family) : family === 'moss' ? /^moss[\\/]/i.test(name)
                : family === 'minimax-h3' ? true : /^krea(?:[- _]?2)?[\\/]/i.test(name);
        }
        if (family === 'flux2-9b' || family === 'flux2-4b') {
            const item = indexed.get(normalize(name));
            if (!item && !/^flux2(?:[-_]?[49]b)?[\\/]/i.test(name)) return false;
            return inventoryFlux2Variant(item || { relativePath: `loras/${name}`, fileName: name }) === family;
        }
        return normalize(name).split('/')[0] === normalize(model);
    });
};
const FAMILY_NAMES: Partial<Record<CivitaiFamily, RegExp>> = {
    sd15: /sd[ _-]?1\.?5/i, sdxl: /xl/i, qwen: /qwen/i, 'qwen-edit': /qwen/i, qwen21: /qwen/i, krea2: /krea/i, moss: /moss/i,
    'zit-base': /z[-_ ]?image|zit/i, flux2: /flux[-_ .]?2|klein/i, 'ltx-23': /ltx/i, 'minimax-h3': /h3|minimax/i,
};
/** FLUX2 family of a UNET file: its 9B or 4B variant when the name tells, any FLUX2 otherwise. */
export const flux2Family = (unet: string | undefined): CivitaiFamily => inferFlux2Variant(unet || '') || 'flux2';
/** Files a workflow of this family can load, for its listbox: attributed by My Library or by file name. The whole list when none is attributed. */
export const familyFiles = (names: readonly string[], family: CivitaiFamily, inventory?: CivitaiInventory): string[] => {
    const indexed = new Map(inventory?.items.map(item => [normalize(getComfyRelativePath(item)), item]));
    const other = family === 'flux2-9b' ? 'flux2-4b' : family === 'flux2-4b' ? 'flux2-9b' : undefined;
    const base = other ? 'flux2' : family;
    const matches = names.filter(name => {
        const item = indexed.get(normalize(name));
        if (other && (item ? inventoryFlux2Variant(item) : inferFlux2Variant(name)) === other) return false;
        return (item && inventoryItemMatchesFamily(item, base)) || !!FAMILY_NAMES[base]?.test(name);
    });
    return matches.length ? matches : [...names];
};
export const matchStyleLibrary = (style: GalleryStyle, inventory: CivitaiInventory): { item?: CivitaiInventoryItem; warning: string } => {
    if (!style.lora) return { warning: '' };
    const candidates = styleLibraryLoras(inventory, style.model);
    let matches = style.libraryLink
        ? candidates.filter(item => normalize(item.path) === normalize(style.libraryLink!.path))
        : candidates.filter(item => normalize(getComfyRelativePath(item)) === normalize(style.lora));
    if (!matches.length && style.libraryLink?.sha256) matches = candidates.filter(item => normalize(item.sha256) === normalize(style.libraryLink!.sha256!));
    if (!matches.length && !style.libraryLink) matches = candidates.filter(item => basename(item.fileName) === basename(style.lora));
    if (matches.length === 1) return { item: matches[0], warning: '' };
    return { warning: matches.length > 1 ? 'Several library LoRAs match. Select the exact file to link it.'
        : style.libraryLink ? 'Linked LoRA is missing from My Library. Stored style values are kept.' : '' };
};
export const linkStyleLibrary = (style: GalleryStyle, item: CivitaiInventoryItem): GalleryStyle => ({
    ...style, title: style.title.trim() ? style.title : item.modelName || item.fileName.replace(/\.safetensors$/i, ''),
    lora: getComfyRelativePath(item), libraryLink: { path: item.path, ...(item.sha256 ? { sha256: item.sha256 } : {}) },
});
export const unusedStyleLoras = (names: string[], styles: GalleryStyle[], model: string, inventory: CivitaiInventory): string[] => {
    const used = new Set<string>();
    for (const style of styles) {
        if (!style.lora || (styleModelFamily(style.model) || normalize(style.model)) !== (styleModelFamily(model) || normalize(model))) continue;
        used.add(normalize(style.lora));
        const linked = matchStyleLibrary(style, inventory).item;
        if (linked) used.add(normalize(getComfyRelativePath(linked)));
        else if (!style.libraryLink && !/[\\/]/.test(style.lora)) {
            const matches = names.filter(name => basename(name) === basename(style.lora));
            if (matches.length === 1) used.add(normalize(matches[0]));
        }
    }
    return names.filter(name => !used.has(normalize(name)));
};
export const resolveLibraryStyle = (style: GalleryStyle, inventory: CivitaiInventory, samplers: string[] = []) => {
    const match = matchStyleLibrary(style, inventory);
    const usage = match.item?.usageMetadata;
    const settings = { ...style.settings };
    const filled: string[] = [], warnings = match.warning ? [match.warning] : [];
    let trigger = style.trigger;
    if (!trigger.trim() && usage?.triggerWords?.length) {
        trigger = usage.triggerWords.filter(word => word.trim()).join(', ');
        if (trigger) filled.push('trigger');
    }
    for (const key of ['steps', 'cfg'] as const) {
        const value = usage?.[key];
        if (settings[key] === undefined && value !== undefined) {
            if (Number.isFinite(value) && (key === 'steps' ? Number.isInteger(value) && value > 0 : value >= 0)) {
                settings[key] = value; filled.push(key);
            } else warnings.push(`Invalid library ${key}; it was not applied.`);
        }
    }
    if (!settings.sampler && usage?.sampler) {
        const sampler = resolveComfyOption(usage.sampler, samplers);
        if (sampler) { settings.sampler = sampler; filled.push('sampler'); }
        else warnings.push(`Library sampler "${usage.sampler}" is not available in the current ComfyUI catalog; it was not applied.`);
    }
    return { ...match, filled, warnings, style: { ...style, trigger, settings,
        ...(match.item ? { lora: getComfyRelativePath(match.item) } : {}) } };
};
