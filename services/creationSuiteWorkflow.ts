import template from '../assets/creationSuiteWorkflow.json';
import helpers from '../assets/creationSuiteHelpers.json';
import { h3Resolution, isRecord, validateMinimaxH3Readiness, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';

export type CreationSuiteValue = string | number | boolean;
export type CreationSuiteInput = 'sourceImage' | 'startFrame' | 'characterSceneImage';
export interface CreationSuiteSettings {
    sceneEnabled: boolean;
    swapEnabled: boolean;
    useReference: boolean;
    modernStyle: boolean;
    useSelectedSize: boolean;
    randomizeSceneSeed: boolean;
    randomizeSwapSeed: boolean;
    bypass: Record<string, boolean>;
    nodes: Record<string, Record<string, CreationSuiteValue>>;
}
export interface CreationSuiteDraft {
    settings: CreationSuiteSettings;
    files: Partial<Record<CreationSuiteInput, File>>;
    showPreview?: boolean;
    showCharts?: boolean;
}
export interface CreationSuiteSnapshot {
    version: 1;
    settings: CreationSuiteSettings;
    inputs: Partial<Record<CreationSuiteInput, { name: string; type: string; lastModified: number }>>;
    workflow?: H3Workflow;
    promptId?: string;
    output?: 'scene' | 'swap';
}
export const CREATION_SUITE_TEMPLATE: H3Workflow = template;
export const CREATION_SUITE_HELPERS = helpers;
export const CREATION_SUITE_INPUTS: { role: CreationSuiteInput; title: string }[] = [
    { role: 'sourceImage', title: 'Scene reference' }, { role: 'startFrame', title: 'Swap base image' },
    { role: 'characterSceneImage', title: 'Face / head source' },
];
export const CREATION_SUITE_BYPASS: Record<string, { title: string; parent: string }> = {
    '3': { title: 'Spectrum MOSS acceleration', parent: '1' }, '4': { title: 'Skip-layer guidance', parent: '3' },
    '33': { title: 'MOSS model preview', parent: '4' }, '104': { title: 'Sage attention', parent: '101' },
    '105': { title: 'BFS head LoRA', parent: '104' }, '106': { title: '8-step LoRA', parent: '105' },
    '107': { title: 'Rescale CFG', parent: '106' }, '108': { title: 'Qwen cache', parent: '107' },
    '141': { title: 'Qwen model preview', parent: '108' },
};
const hidden = new Set(['31', '111', '112', '27', '34', '117']);
export const defaultCreationSuiteSettings = (): CreationSuiteSettings => ({
    sceneEnabled: true, swapEnabled: true, useReference: true, modernStyle: true, useSelectedSize: true,
    randomizeSceneSeed: true, randomizeSwapSeed: false,
    bypass: Object.fromEntries(Object.keys(CREATION_SUITE_BYPASS).map(key => [key, false])),
    nodes: Object.fromEntries(Object.entries(CREATION_SUITE_TEMPLATE).filter(([key]) => !hidden.has(key)).map(([key, spec]) => [
        key, Object.fromEntries(Object.entries(spec.inputs).filter((entry): entry is [string, CreationSuiteValue] =>
            ['string', 'number', 'boolean'].includes(typeof entry[1]))),
    ])),
});
export function validateCreationSuiteSettings(value: unknown): asserts value is CreationSuiteSettings {
    const defaults = defaultCreationSuiteSettings();
    if (!isRecord(value) || !isRecord(value.nodes) || !isRecord(value.bypass)) throw new Error('Invalid Creation suite settings.');
    for (const key of ['sceneEnabled', 'swapEnabled', 'useReference', 'modernStyle', 'useSelectedSize', 'randomizeSceneSeed', 'randomizeSwapSeed']) {
        if (typeof value[key] !== 'boolean') throw new Error(`Invalid Creation suite setting ${key}.`);
    }
    for (const [key, inputs] of Object.entries(defaults.nodes)) {
        const values = value.nodes[key];
        if (!isRecord(values)) throw new Error(`Missing Creation suite settings for node ${key}.`);
        for (const [name, initial] of Object.entries(inputs)) {
            const current = values[name];
            if (typeof current !== typeof initial || typeof current === 'number' && !Number.isFinite(current)) throw new Error(`Invalid Creation suite setting ${key}.${name}.`);
        }
    }
    for (const key of Object.keys(defaults.bypass)) if (typeof value.bypass[key] !== 'boolean') throw new Error(`Invalid Creation suite bypass ${key}.`);
}
export const creationSuitePrompt = (settings: CreationSuiteSettings): string => {
    const values = settings.nodes;
    const first = settings.modernStyle ? '22' : '25', last = settings.modernStyle ? '23' : '26';
    const text = `${values[first].string_a}${values[first].delimiter}${values['20'].value}${values[last].delimiter}${values[last].string_b}`;
    return settings.modernStyle ? text : text.replaceAll(String(values['24'].find), String(values['21'].value));
};
export const creationSuiteDimensions = (settings: CreationSuiteSettings, stage: 'scene' | 'swap') => {
    const values = settings.nodes[stage === 'scene' ? '14' : '115'];
    if (typeof values.aspect_ratio !== 'string' || typeof values.megapixels !== 'number' || typeof values.multiple !== 'number') throw new Error('Complete the Creation suite resolution settings.');
    return h3Resolution({ aspect: values.aspect_ratio, megapixels: values.megapixels, multiple: values.multiple });
};
const isLink = (value: unknown): value is [string, number] => Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]);
export const buildCreationSuiteWorkflow = (
    settings: CreationSuiteSettings, files: Partial<Record<CreationSuiteInput, string>>, info?: H3ObjectInfo,
): H3Workflow => {
    validateCreationSuiteSettings(settings);
    if (!settings.sceneEnabled && !settings.swapEnabled) throw new Error('Enable Scene Creation, Swap face-Change expression, or both.');
    if (settings.sceneEnabled && !String(settings.nodes['20']?.value || '').trim()) throw new Error('Enter the Scene Creation prompt.');
    if (settings.swapEnabled && !String(settings.nodes['110']?.prompt || '').trim()) throw new Error('Enter the head swap / expression prompt.');
    if (settings.sceneEnabled && settings.useReference && !files.sourceImage) throw new Error('Choose a Scene reference or disable reference conditioning.');
    if (settings.swapEnabled && !files.characterSceneImage) throw new Error('Choose the Face / head source for the swap.');
    if (settings.swapEnabled && !settings.sceneEnabled && !files.startFrame) throw new Error('Choose a Swap base image when Scene Creation is disabled.');
    const graph = structuredClone(CREATION_SUITE_TEMPLATE), defaults = defaultCreationSuiteSettings();
    for (const [key, inputs] of Object.entries(settings.nodes)) {
        if (!defaults.nodes[key]) throw new Error(`Unknown Creation suite node ${key}.`);
        for (const [name, value] of Object.entries(inputs)) {
            const initial = defaults.nodes[key][name];
            if (initial === undefined || typeof initial !== typeof value || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid Creation suite setting ${key}.${name}.`);
            graph[key].inputs[name] = value;
        }
    }
    for (const [key, bypass] of Object.entries(settings.bypass)) if (!CREATION_SUITE_BYPASS[key] || typeof bypass !== 'boolean') throw new Error(`Invalid Creation suite bypass ${key}.`);
    for (const [enabled, sampler, stage] of [[settings.sceneEnabled, '10', 'scene'], [settings.swapEnabled, '120', 'swap']] as const) {
        if (!enabled) continue;
        const values = graph[sampler].inputs;
        if (!Number.isSafeInteger(values.seed) || Number(values.seed) < 0) throw new Error('Creation suite seeds must be non-negative safe integers.');
        if (!Number.isInteger(values.steps) || Number(values.steps) < 1 || Number(values.cfg) < 0
            || Number(values.denoise) < 0 || Number(values.denoise) > 1) throw new Error('Use valid sampler steps, CFG and denoise.');
        if (stage === 'scene' || settings.useSelectedSize) creationSuiteDimensions(settings, stage);
    }
    graph['31'].inputs.image = files.sourceImage || '';
    graph['111'].inputs.image = files.startFrame || '';
    graph['112'].inputs.image = files.characterSceneImage || '';
    const styled: [string, number] = [settings.modernStyle ? '23' : '24', 0];
    graph['30'].inputs.prompt = styled; graph['28'].inputs.source = styled;
    if (settings.useReference) graph['30'].inputs.image = ['31', 0];
    else delete graph['30'].inputs.image;
    if (settings.sceneEnabled && settings.swapEnabled) {
        graph['110'].inputs['images.image_1'] = ['11', 0];
        graph['224'].inputs.image_a = ['11', 0];
    }
    graph['120'].inputs.latent_image = settings.useSelectedSize ? ['116', 0] : ['110', 2];
    const resolveModel = (link: [string, number]): [string, number] => {
        let [key, output] = link;
        while (settings.bypass[key]) { key = CREATION_SUITE_BYPASS[key].parent; output = 0; }
        return [key, output];
    };
    for (const spec of Object.values(graph)) for (const [name, input] of Object.entries(spec.inputs)) if (isLink(input)) spec.inputs[name] = resolveModel(input);
    const needed = new Set<string>(), visiting = new Set<string>();
    const visit = (key: string) => {
        if (visiting.has(key)) throw new Error(`Cyclic Creation suite link ${key}.`);
        if (needed.has(key)) return;
        if (!graph[key]) throw new Error(`Missing Creation suite node ${key}.`);
        visiting.add(key);
        for (const input of Object.values(graph[key].inputs)) if (isLink(input)) visit(input[0]);
        visiting.delete(key); needed.add(key);
    };
    if (settings.sceneEnabled) { visit('12'); visit('28'); }
    if (settings.swapEnabled) { visit('131'); visit('224'); }
    const active = Object.fromEntries(Object.entries(graph).filter(([key]) => needed.has(key)));
    if (info) validateMinimaxH3Readiness(active, info);
    return active;
};
export const validateCreationSuiteDraft = (draft: CreationSuiteDraft): void => {
    for (const { role, title } of CREATION_SUITE_INPUTS) {
        const active = role === 'sourceImage' ? draft.settings.sceneEnabled && draft.settings.useReference
            : role === 'startFrame' ? draft.settings.swapEnabled && !draft.settings.sceneEnabled : draft.settings.swapEnabled;
        if (active && (!draft.files[role]?.size || !draft.files[role]?.type.startsWith('image/'))) throw new Error(`Choose a non-empty image for ${title}.`);
    }
    buildCreationSuiteWorkflow(draft.settings, Object.fromEntries(Object.entries(draft.files).filter(([, file]) => !!file).map(([role, file]) => [role, file.name])));
};
