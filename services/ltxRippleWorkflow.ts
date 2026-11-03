import template from '../assets/ltxRippleFFAFWorkflow.json';
import { h3Resolution, validateMinimaxH3Readiness, type H3Lora, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';

export const RIPPLE_TEMPLATE: H3Workflow = template;
export const RIPPLE_OUTPUTS = [
    { id: '425', label: 'Edited video' },
    { id: '780', label: 'Source video' },
    { id: '786', label: 'Side-by-side comparison' },
] as const;
export type RippleValue = string | number | boolean;
export interface RippleSettings {
    version: 1;
    randomizeSeed: boolean;
    allowExtraFrames?: boolean;
    nodes: Record<string, Record<string, RippleValue>>;
    loras: H3Lora[];
}
export interface RippleDraft { prompt: string; image: File | null; video: File | null; videoDuration?: number }
interface SavedFile { name: string; type: string; lastModified: number }
export interface RippleSavedSetup {
    version: 1;
    prompt: string;
    settings: RippleSettings;
    image?: SavedFile;
    video?: SavedFile;
    videoDuration?: number;
    promptId?: string;
    workflow?: H3Workflow;
    outputId?: string;
}
const activeGraph = (graph: H3Workflow): H3Workflow => {
    const active = new Set<string>();
    const visit = (id: string) => {
        if (active.has(id)) return;
        if (!graph[id]) throw new Error(`LTX-Ripple-FFAF references missing node ${id}.`);
        active.add(id);
        for (const value of Object.values(graph[id].inputs)) {
            if (Array.isArray(value) && typeof value[0] === 'string') visit(value[0]);
        }
    };
    RIPPLE_OUTPUTS.forEach(output => visit(output.id));
    return Object.fromEntries(Object.entries(graph).filter(([id]) => active.has(id)));
};
export const defaultRippleDraft = (): RippleDraft => ({ prompt: String(template['814'].inputs.text), image: null, video: null });
export const defaultRippleSettings = (): RippleSettings => ({
    version: 1, randomizeSeed: false, allowExtraFrames: false,
    loras: Array.from({ length: 4 }, () => ({ enabled: false, name: '', strength: 1 })),
    nodes: Object.fromEntries(Object.entries(activeGraph(RIPPLE_TEMPLATE)).map(([id, node]) => [
        id, Object.fromEntries(Object.entries(node.inputs).filter((entry): entry is [string, RippleValue] => {
            const [name, value] = entry;
            return !['790:video', '1304:image', '814:text'].includes(`${id}:${name}`)
                && !(RIPPLE_OUTPUTS.some(output => output.id === id) && name === 'frame_rate')
                && ['string', 'number', 'boolean'].includes(typeof value);
        })),
    ])),
});
export const rippleNumber = (settings: RippleSettings, id: string, field: string): number => {
    const value = settings.nodes[id]?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${id} / ${field} setting.`);
    return value;
};
export const rippleResolution = (settings: RippleSettings) => h3Resolution({
    aspect: String(settings.nodes['1331']?.aspect_ratio), megapixels: rippleNumber(settings, '1331', 'megapixels'), multiple: rippleNumber(settings, '1331', 'multiple'),
});
export const rippleSourceFrameLimit = (settings: RippleSettings, duration: number): number => {
    const fps = rippleNumber(settings, '936', 'value');
    const skip = rippleNumber(settings, '790', 'skip_first_frames'), stride = rippleNumber(settings, '790', 'select_every_nth');
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(fps) || fps < 1
        || !Number.isInteger(skip) || skip < 0 || !Number.isInteger(stride) || stride < 1) throw new Error('Invalid source duration, FPS, frame skip or frame stride.');
    const available = Math.floor(Math.max(0, Math.floor(duration * fps + 1e-6) - skip) / stride);
    const aligned = Math.floor((available - 1) / 8) * 8 + 1;
    if (aligned < 9) throw new Error('The selected video passage is too short: at least 9 frames are required at the selected FPS/skip/stride.');
    return aligned;
};
export const fitRippleToSource = (settings: RippleSettings, duration: number, full = false): RippleSettings => {
    const limit = rippleSourceFrameLimit(settings, duration);
    const requested = rippleNumber(settings, '937', 'value');
    const frames = full ? limit : settings.allowExtraFrames ? requested : Math.min(requested, limit);
    return { ...settings, nodes: { ...settings.nodes, '937': { ...settings.nodes['937'], value: frames } } };
};
export const validateRippleDraft = (draft: RippleDraft) => {
    if (!draft.prompt.trim()) throw new Error('Enter the video editing prompt.');
    if (!draft.image?.size || !draft.image.type.startsWith('image/')) throw new Error('Choose a non-empty edited first-frame image.');
    if (!draft.video?.size || !draft.video.type.startsWith('video/')) throw new Error('Choose a non-empty source video.');
};
export const buildRippleWorkflow = (
    settings: RippleSettings, prompt: string, files: { image: string; video: string }, info?: H3ObjectInfo,
): H3Workflow => {
    if (settings.version !== 1) throw new Error('Unsupported LTX-Ripple-FFAF settings version.');
    if (settings.allowExtraFrames !== undefined && typeof settings.allowExtraFrames !== 'boolean') throw new Error('Allow extra frames must be enabled or disabled.');
    if (!prompt.trim() || !files.image.trim() || !files.video.trim()) throw new Error('Ripple requires an editing prompt, source video and edited first frame.');
    const graph = activeGraph(structuredClone(RIPPLE_TEMPLATE));
    const defaults = defaultRippleSettings();
    for (const [id, fields] of Object.entries(settings.nodes)) {
        for (const [name, value] of Object.entries(fields)) {
            const original = defaults.nodes[id]?.[name];
            if (original === undefined || typeof original !== typeof value || typeof value === 'number' && !Number.isFinite(value)) {
                throw new Error(`Invalid Ripple setting: ${id} / ${name}.`);
            }
            graph[id].inputs[name] = value;
        }
    }
    for (const [id, fields] of Object.entries(defaults.nodes)) {
        for (const name of Object.keys(fields)) if (settings.nodes[id]?.[name] === undefined) throw new Error(`Missing Ripple setting: ${id} / ${name}.`);
    }
    const frames = rippleNumber(settings, '937', 'value'), fps = rippleNumber(settings, '936', 'value');
    if (!Number.isInteger(frames) || frames < 9 || (frames - 1) % 8) throw new Error('LTX frame count must be 8n + 1 (at least 9).');
    if (!Number.isInteger(fps) || fps < 1) throw new Error('FPS must be a positive integer.');
    const seed = rippleNumber(settings, '1232', 'seed');
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Seed must be a non-negative safe integer.');
    if (!Number.isInteger(rippleNumber(settings, '1319', 'steps')) || rippleNumber(settings, '1319', 'steps') < 1) throw new Error('Steps must be a positive integer.');
    if (rippleNumber(settings, '1319', 'denoise') < 0 || rippleNumber(settings, '1319', 'denoise') > 1) throw new Error('Denoise must be between zero and one.');
    for (const field of ['skip_first_frames', 'select_every_nth']) {
        const value = rippleNumber(settings, '790', field);
        if (!Number.isInteger(value) || value < (field === 'select_every_nth' ? 1 : 0)) throw new Error(`Invalid video ${field}.`);
    }
    rippleResolution(settings);
    graph['1304'].inputs.image = files.image;
    graph['790'].inputs.video = files.video;
    graph['814'].inputs.text = prompt;
    if (!settings.allowExtraFrames) {
        graph.ripple_frame_count = { class_type: 'ComfyMathExpression', inputs: { expression: 'floor((a - 1) / 8) * 8 + 1', 'values.a': ['790', 1] } };
        graph.ripple_source_frames = { class_type: 'Frames Slice', inputs: { start: 0, stop: ['ripple_frame_count', 1], frames: ['790', 0] } };
        graph['567'].inputs.length = ['ripple_frame_count', 1];
        graph['1257'].inputs.frames_number = ['ripple_frame_count', 1];
        graph['1289'].inputs.stop = ['ripple_frame_count', 1];
        graph['782'].inputs.image = ['ripple_source_frames', 0];
        graph['780'].inputs.images = ['ripple_source_frames', 0];
    }
    for (const output of RIPPLE_OUTPUTS) {
        graph[output.id].inputs.frame_rate = fps;
    }
    if (!Array.isArray(settings.loras) || settings.loras.length !== 4) throw new Error('Ripple requires four optional LoRA slots.');
    let model: [string, number] = ['1312', 0];
    settings.loras.forEach((lora, index) => {
        if (!lora.enabled) return;
        if (!lora.name.trim() || !Number.isFinite(lora.strength)) throw new Error(`Choose a valid LoRA and strength for slot ${index + 1}.`);
        const id = `ripple_lora_${index + 1}`;
        graph[id] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: lora.name, strength_model: lora.strength } };
        model = [id, 0];
    });
    graph['1332'].inputs.model = model;
    if (info) validateMinimaxH3Readiness(graph, info);
    return graph;
};
export const rippleSavedSetup = (draft: RippleDraft, settings: RippleSettings): RippleSavedSetup => {
    const file = (value: File): SavedFile => ({ name: value.name, type: value.type, lastModified: value.lastModified });
    return { version: 1, prompt: draft.prompt, settings: structuredClone(settings), ...(draft.videoDuration !== undefined ? { videoDuration: draft.videoDuration } : {}),
        ...(draft.image ? { image: file(draft.image) } : {}), ...(draft.video ? { video: file(draft.video) } : {}) };
};
