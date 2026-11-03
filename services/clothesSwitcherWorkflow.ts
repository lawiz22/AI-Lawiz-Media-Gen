import template from '../assets/clothesSwitcherWorkflow.json';
import { isRecord, validateMinimaxH3Readiness, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';

export type ClothesSwitcherValue = string | number | boolean;
export interface ClothesSwitcherSettings {
    version: 2;
    randomizeSeed: boolean;
    loraEnabled: Record<string, boolean>;
    nodes: Record<string, Record<string, ClothesSwitcherValue>>;
}
export interface ClothesSwitcherDraft { settings: ClothesSwitcherSettings; file?: File }
export interface ClothesSwitcherSnapshot {
    version: 1;
    kind?: 'parameters';
    settings: ClothesSwitcherSettings;
    input?: { name: string; type: string; lastModified: number };
    output?: 'result';
    workflow?: H3Workflow;
    promptId?: string;
}
export const CLOTHES_SWITCHER_TEMPLATE: H3Workflow = template;
export const CLOTHES_SWITCHER_LORA_IDS = ['144', '165', '166', '168'] as const;
export const CLOTHES_SWITCHER_CONTROLS: H3Workflow = {
    ...CLOTHES_SWITCHER_TEMPLATE,
    '168': { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: '', strength_model: 1, model: ['166', 0] } },
};
export const defaultClothesSwitcherSettings = (): ClothesSwitcherSettings => ({
    version: 2,
    randomizeSeed: true,
    loraEnabled: Object.fromEntries(CLOTHES_SWITCHER_LORA_IDS.map((id, index) => [id, index < 3])),
    nodes: Object.fromEntries(Object.entries(CLOTHES_SWITCHER_CONTROLS).filter(([id]) => id !== '139').map(([id, node]) => [
        id, Object.fromEntries(Object.entries(node.inputs).filter((entry): entry is [string, ClothesSwitcherValue] =>
            ['string', 'number', 'boolean'].includes(typeof entry[1]))),
    ])),
});
export function validateClothesSwitcherSettings(value: unknown): asserts value is ClothesSwitcherSettings {
    if (!isRecord(value) || value.version !== 2 || typeof value.randomizeSeed !== 'boolean' || !isRecord(value.nodes) || !isRecord(value.loraEnabled)) throw new Error('Invalid Clothes Switcher settings.');
    const defaults = defaultClothesSwitcherSettings();
    for (const id of Object.keys(value.loraEnabled)) if (!CLOTHES_SWITCHER_LORA_IDS.some(key => key === id)) throw new Error(`Unknown Clothes Switcher LoRA ${id}.`);
    for (const id of CLOTHES_SWITCHER_LORA_IDS) if (typeof value.loraEnabled[id] !== 'boolean') throw new Error(`Invalid Clothes Switcher LoRA switch ${id}.`);
    for (const id of Object.keys(value.nodes)) if (!(id in defaults.nodes)) throw new Error(`Unknown Clothes Switcher node ${id}.`);
    for (const [id, inputs] of Object.entries(defaults.nodes)) {
        const values = value.nodes[id];
        if (!isRecord(values)) throw new Error(`Missing Clothes Switcher node ${id}.`);
        for (const name of Object.keys(values)) if (!(name in inputs)) throw new Error(`Unknown Clothes Switcher setting ${id}.${name}.`);
        for (const [name, initial] of Object.entries(inputs)) {
            const current = values[name];
            if (typeof current !== typeof initial || typeof current === 'number' && !Number.isFinite(current)) throw new Error(`Invalid Clothes Switcher setting ${id}.${name}.`);
        }
    }
    const sampler = value.nodes['138'], resize = value.nodes['146'], canny = value.nodes['161'];
    if (!isRecord(sampler) || !isRecord(resize) || !isRecord(canny)) throw new Error('Missing Clothes Switcher sampling or preprocessing settings.');
    if (!Number.isSafeInteger(sampler.seed) || Number(sampler.seed) < 0) throw new Error('Use a non-negative safe integer seed.');
    if (!Number.isSafeInteger(sampler.steps) || Number(sampler.steps) < 1 || Number(sampler.cfg) < 0
        || Number(sampler.denoise) < 0 || Number(sampler.denoise) > 1) throw new Error('Use valid Clothes Switcher steps, CFG and denoise.');
    for (const name of ['width', 'height']) if (!Number.isSafeInteger(resize[name]) || Number(resize[name]) < 1) throw new Error('Use positive integer resize dimensions.');
    if (!Number.isSafeInteger(resize.multiple_of) || Number(resize.multiple_of) < 0) throw new Error('Resize alignment must be a non-negative integer.');
    if (Number(canny.low_threshold) < 0 || Number(canny.high_threshold) > 1 || Number(canny.low_threshold) > Number(canny.high_threshold)) throw new Error('Canny thresholds must satisfy 0 <= low <= high <= 1.');
    const cache = value.nodes['167'];
    if (!isRecord(cache) || !Number.isInteger(cache.warmup_steps) || Number(cache.warmup_steps) < 0
        || !Number.isInteger(cache.skip_interval) || Number(cache.skip_interval) < 0) throw new Error('CacheDiT warmup and skip interval must be non-negative integers.');
}
export const upgradeClothesSwitcherSettings = (value: unknown): ClothesSwitcherSettings => {
    if (!isRecord(value) || !isRecord(value.nodes)) throw new Error('Invalid Clothes Switcher settings.');
    let upgraded = value;
    if (value.version === undefined) {
        if (value.loraEnabled !== undefined || value.nodes['167'] !== undefined || value.nodes['168'] !== undefined) throw new Error('Invalid unversioned Clothes Switcher settings.');
        const defaults = defaultClothesSwitcherSettings();
        upgraded = { ...structuredClone(value), version: 2, loraEnabled: defaults.loraEnabled,
            nodes: { ...structuredClone(value.nodes), '167': defaults.nodes['167'], '168': defaults.nodes['168'] } };
    }
    validateClothesSwitcherSettings(upgraded);
    return structuredClone(upgraded);
};
export const clothesSwitcherParameterPreset = (settings: ClothesSwitcherSettings): ClothesSwitcherSnapshot => {
    validateClothesSwitcherSettings(settings);
    const parameters = structuredClone(settings);
    parameters.nodes['108'].text = '';
    return { version: 1, kind: 'parameters', settings: parameters };
};
export const applyClothesSwitcherParameters = (draft: ClothesSwitcherDraft, settings: unknown): ClothesSwitcherDraft => {
    const parameters = upgradeClothesSwitcherSettings(settings);
    parameters.nodes['108'].text = draft.settings.nodes['108'].text;
    return { ...draft, settings: parameters };
};
export function validateClothesSwitcherDraft(value: unknown): asserts value is ClothesSwitcherDraft {
    if (!isRecord(value)) throw new Error('Invalid Clothes Switcher draft.');
    validateClothesSwitcherSettings(value.settings);
    if (value.file !== undefined && (!(value.file instanceof File) || !value.file.size || !value.file.type.startsWith('image/'))) throw new Error('Choose a non-empty Clothes Switcher image.');
}
export const buildClothesSwitcherWorkflow = (settings: ClothesSwitcherSettings, image: string, info?: H3ObjectInfo): H3Workflow => {
    validateClothesSwitcherSettings(settings);
    if (!image.trim()) throw new Error('Choose the original photo for Clothes Switcher.');
    const graph = structuredClone(CLOTHES_SWITCHER_CONTROLS);
    for (const [id, inputs] of Object.entries(settings.nodes)) Object.assign(graph[id].inputs, inputs);
    graph['139'].inputs.image = image;
    let model: [string, number] = ['106', 0];
    for (const id of CLOTHES_SWITCHER_LORA_IDS) {
        if (!settings.loraEnabled[id]) { delete graph[id]; continue; }
        if (!String(graph[id].inputs.lora_name).trim()) throw new Error(`Choose a model for enabled LoRA ${CLOTHES_SWITCHER_LORA_IDS.indexOf(id) + 1}.`);
        graph[id].inputs.model = model; model = [id, 0];
    }
    if (graph['167'].inputs.enable) { graph['167'].inputs.model = model; model = ['167', 0]; }
    else delete graph['167'];
    graph['138'].inputs.model = model;
    if (info) validateMinimaxH3Readiness(graph, info);
    return graph;
};
