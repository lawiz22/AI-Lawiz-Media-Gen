import { getComfyRelativePath, type CivitaiInventory, type CivitaiInventoryItem } from './civitaiService';

export type ModelPromptExample = { positive: string; negative?: string; source: 'civitai' | 'archive' | 'huggingface' };
const normalize = (value: string) => value.trim().replace(/\\/g, '/').toLowerCase();
export const promptExampleModel = (inventory: CivitaiInventory, name: string, linkedPath?: string): CivitaiInventoryItem | undefined => {
    const items = inventory.items.filter(item => item.kind === 'lora');
    const exact = items.find(item => linkedPath ? normalize(item.path) === normalize(linkedPath)
        : normalize(getComfyRelativePath(item)) === normalize(name) || normalize(item.path) === normalize(name));
    if (exact || linkedPath || !name.trim()) return exact;
    const matches = items.filter(item => normalize(item.fileName) === normalize(name).split('/').pop());
    if (matches.length > 1) throw new Error('Several Library LoRAs have this filename. Select its exact installed path.');
    return matches[0];
};
export const localStylePromptExamples = async (inventory: CivitaiInventory, name: string, linkedPath?: string): Promise<string[]> => {
    if (!window.electron || !name.trim()) return [];
    const item = promptExampleModel(inventory, name, linkedPath);
    if (!item || !await window.electron.hasLocalModelPromptExamples(item.path)) return [];
    const result = await window.electron.getLocalModelPromptExamples({ modelPath: item.path, provider: 'regular', sources: [] });
    return result.examples.slice(0, 3).map(example => example.positive.slice(0, 1500));
};
