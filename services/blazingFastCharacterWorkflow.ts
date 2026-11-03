import template from '../assets/blazingFastCharacterWorkflow.json';
import { h3Choices, isRecord, validateMinimaxH3Readiness, type H3ObjectInfo, type H3Workflow, type H3Lora } from './minimaxH3Workflow';
import { applyFlux2StyleScheduler, normalizeStyleModel, prependGalleryStyleTrigger, removeGalleryStyleTrigger, resolveStyleLora, validateStyleGallery, type GalleryStyle } from './styleGallery';
import { inferFlux2Variant } from './civitaiService';
import { CHARACTER_ANGLE_OPTIONS, CHARACTER_POSE_OPTIONS, CHARACTER_EXPRESSION_OPTIONS, CHARACTER_NONE_VALUE } from './characterAnglesWorkflow';

export const BLAZING_TEMPLATE: H3Workflow = template;
const identityScope = 'Describe stable visible identity only: subject type, apparent age, skin tone, facial structure, eye color, hair and distinctive markings. Clothing may be described briefly. Do not describe facial expression, emotion, gaze, camera angle, framing, body pose, hand position, held objects, background, lighting or artistic style. These are controlled separately by editing instructions. Output one concise English description, without commentary.';
export const BLAZING_OUTPUTS = [
    { id: '449', label: '01 - Initial edit', decode: '532:476', sampler: '532:484', prompt: '' },
    { id: '591', label: '02 - Pose 2', decode: '606:593', sampler: '606:605', prompt: '606:581' },
    { id: '629', label: '03 - Pose 3', decode: '628:608', sampler: '628:621', prompt: '628:607' },
    { id: '653', label: '04 - Pose 4', decode: '652:632', sampler: '652:645', prompt: '652:631' },
    { id: '677', label: '05 - Pose 5', decode: '676:656', sampler: '676:669', prompt: '676:655' },
    { id: '701', label: '06 - Pose 6', decode: '700:680', sampler: '700:693', prompt: '700:679' },
    { id: '592', label: '07 - Six-pose collage', decode: '236', sampler: '', prompt: '' },
    { id: '364', label: '08 - Original vs collage', decode: '361', sampler: '', prompt: '' },
] as const;
export interface BlazingPose { angle: string; pose: string; expression: string }
export interface BlazingSettings {
    version: 1;
    model: string; clip: string; vae: string; vision: string;
    seed: number; randomizeSeed: boolean; steps: number; cfg: number; sampler: string; megapixels: number;
    prompt: string; background: string; styleId: string; useStyleSettings: boolean;
    styleLoraStrength?: number;
    poseCount?: number;
    poses: BlazingPose[];
    loras: H3Lora[];
    identitySystem: string; captionSystem: string;
    identityTokens: number; captionTokens: number;
}
export interface BlazingDraft { settings: BlazingSettings; file?: File }
export interface BlazingSnapshot {
    version: 1; settings: BlazingSettings; style?: GalleryStyle; workflow: H3Workflow; promptId: string;
    outputId: string; caption: string; identity: string; finalCaption: string;
    outcome?: 'complete' | 'cancelled' | 'failed';
}
export const blazingPoseCount = (settings: BlazingSettings): number => settings.poseCount ?? 6;
export const blazingOutputs = (settings: BlazingSettings) => BLAZING_OUTPUTS.slice(0, blazingPoseCount(settings) === 6 ? 8 : blazingPoseCount(settings));
export const defaultBlazingSettings = (): BlazingSettings => ({
    version: 1, model: String(template['442:435'].inputs.unet_name), clip: String(template['442:434'].inputs.clip_name),
    vae: String(template['442:436'].inputs.vae_name), vision: String(template['442:437'].inputs.clip_name),
    seed: 6969696969, randomizeSeed: true, steps: 4, cfg: 1, sampler: 'euler', megapixels: 1,
    prompt: '', background: 'Same Background', styleId: '', useStyleSettings: true,
    poses: Array.from({ length: 6 }, () => ({ angle: '', pose: '', expression: '' })),
    loras: Array.from({ length: 4 }, () => ({ enabled: false, name: '', strength: 1 })),
    identitySystem: identityScope, captionSystem: String(template['757:753'].inputs.value),
    identityTokens: 512, captionTokens: 2048,
});
export function validateBlazingSettings(value: unknown): asserts value is BlazingSettings {
    if (!isRecord(value) || value.version !== 1) throw new Error('Invalid Blazing Fast settings version.');
    const defaults = defaultBlazingSettings();
    if (value.poseCount !== undefined && (!Number.isInteger(value.poseCount) || Number(value.poseCount) < 1 || Number(value.poseCount) > 6)) throw new Error('Choose between 1 and 6 Blazing Fast poses.');
    if (value.styleLoraStrength !== undefined && (typeof value.styleLoraStrength !== 'number' || !Number.isFinite(value.styleLoraStrength))) throw new Error('Style LoRA strength must be finite.');
    for (const [key, initial] of Object.entries(defaults)) {
        if (Array.isArray(initial)) continue;
        if (typeof value[key] !== typeof initial || typeof value[key] === 'number' && !Number.isFinite(value[key])) throw new Error(`Invalid Blazing Fast ${key}.`);
    }
    for (const key of ['model', 'clip', 'vae', 'vision', 'sampler', 'identitySystem', 'captionSystem']) {
        if (!String(value[key]).trim()) throw new Error(`Blazing Fast ${key} cannot be empty.`);
    }
    for (const key of ['steps', 'identityTokens', 'captionTokens']) {
        if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 1) throw new Error(`Blazing Fast ${key} must be a positive integer.`);
    }
    if (!Number.isSafeInteger(value.seed) || Number(value.seed) < 0 || Number(value.cfg) < 0 || Number(value.megapixels) <= 0) throw new Error('Invalid Blazing Fast seed, CFG or resolution.');
    if (!Array.isArray(value.poses) || value.poses.length !== 6) throw new Error('Blazing Fast requires exactly six poses.');
    for (const pose of value.poses) {
        if (!isRecord(pose) || ['angle', 'pose', 'expression'].some(key => typeof pose[key] !== 'string')) throw new Error('Invalid Blazing Fast pose.');
    }
    if (!Array.isArray(value.loras) || value.loras.length !== 4) throw new Error('Blazing Fast requires four additional LoRA slots.');
    for (const lora of value.loras) {
        if (!isRecord(lora) || typeof lora.enabled !== 'boolean' || typeof lora.name !== 'string'
            || typeof lora.strength !== 'number' || !Number.isFinite(lora.strength) || lora.enabled && !lora.name.trim()) throw new Error('Choose a valid filename and strength for each enabled LoRA.');
    }
}
export function validateBlazingDraft(value: unknown): asserts value is BlazingDraft {
    if (!isRecord(value)) throw new Error('Invalid Blazing Fast draft.');
    validateBlazingSettings(value.settings);
    if (value.file !== undefined && (!(value.file instanceof File) || !value.file.size || !value.file.type.startsWith('image/'))) throw new Error('Choose a non-empty character image.');
}
export const randomBlazingPose = (): BlazingPose => {
    const pick = (values: readonly string[]) => {
        const choices = values.filter(value => value !== CHARACTER_NONE_VALUE);
        return choices[Math.floor(Math.random() * choices.length)];
    };
    return { angle: pick(CHARACTER_ANGLE_OPTIONS), pose: pick(CHARACTER_POSE_OPTIONS), expression: pick([...CHARACTER_EXPRESSION_OPTIONS, 'laughing']) };
};
export const blazingPoseText = (pose: BlazingPose): string => [
    [pose.angle, 'Camera', 'Keep the reference camera angle and framing'],
    [pose.expression, 'Facial expression', 'Keep the reference facial expression'],
    [pose.pose, 'Body pose', 'Keep the reference pose and posture'],
].map(([value, label, unchanged]) => {
    if (!value.trim() || value === CHARACTER_NONE_VALUE) return `${unchanged}.`;
    const detail = /^(t[- ]?pose)$/i.test(value.trim())
        ? 'Stand upright with both arms extended straight sideways at shoulder height, elbows straight, forming a horizontal T. Show the entire body and both hands.'
        : value.trim();
    return `${label}: ${detail}${detail.endsWith('.') ? '' : '.'}`;
}).join('\n');
export const blazingPrompts = (settings: BlazingSettings, style?: GalleryStyle, identity = '[Identity description will be generated from the reference image]') => {
    const background = settings.background.trim() || 'Same Background';
    const styleText = style ? [style.trigger, style.prompt].filter(value => value.trim()).join('\n') : '';
    const trigger = style?.trigger.trim() || '';
    const styleInstruction = removeGalleryStyleTrigger(style?.prompt.trim() || '', trigger) || (style ? 'Keep the selected LoRA style' : 'Same Style');
    const requestedEdits = removeGalleryStyleTrigger(settings.prompt.trim(), trigger);
    const instructions = (pose: BlazingPose) => [
        'Edit the reference image into one image of the same character. Preserve recognizable facial identity and distinguishing features.',
        requestedEdits ? `Requested edits for every output: ${requestedEdits}` : '',
        blazingPoseText(pose),
        'Apply the requested camera, body pose and facial expression even when they differ from the reference or identity description. Reposition hands and held objects as needed for the requested pose. Keep unspecified attributes unchanged.',
        style ? 'Use the selected style only for visual rendering. It must not override the requested action, camera angle or facial expression.' : '',
    ].filter(Boolean).join('\n');
    const initialExtra = instructions(settings.poses[0]);
    return {
        background, styleText, styleInstruction, initialExtra,
        initial: [trigger, [identity, String(BLAZING_TEMPLATE['554:549'].inputs.value), background,
            String(BLAZING_TEMPLATE['554:550'].inputs.value), styleInstruction, initialExtra].join(' ')].filter(Boolean).join('\n'),
        views: settings.poses.slice(1).map(pose => prependGalleryStyleTrigger([instructions(pose), `Background: ${background}`, `Rendering style: ${styleInstruction}`].filter(Boolean).join('\n'), style?.trigger || '')),
    };
};
export const buildBlazingWorkflow = (settings: BlazingSettings, filename: string, style?: GalleryStyle, info?: H3ObjectInfo): H3Workflow => {
    validateBlazingSettings(settings);
    if (!filename.trim()) throw new Error('Choose a source character image.');
    if (settings.styleId && (!style || style.id !== settings.styleId)) throw new Error('The selected style no longer exists. Choose another style or Same Style.');
    if (!settings.styleId && style) throw new Error('Unexpected style without a selected style ID.');
    if (style) {
        validateStyleGallery({ version: 1, styles: [style] });
        const family = inferFlux2Variant(settings.model)?.toUpperCase();
        if (normalizeStyleModel(style.model) !== family) throw new Error(`Blazing Fast requires a compatible ${family || 'FLUX2'} style.`);
    }
    const sampling = { steps: settings.steps, cfg: settings.cfg, sampler: settings.sampler, megapixels: settings.megapixels,
        ...(settings.useStyleSettings ? style?.settings : {}) };
    const graph = structuredClone(BLAZING_TEMPLATE), prompts = blazingPrompts(settings, style);
    graph['76'].inputs.image = filename;
    graph['442:435'].inputs.unet_name = settings.model;
    graph['442:434'].inputs.clip_name = settings.clip;
    graph['442:436'].inputs.vae_name = settings.vae;
    graph['442:437'].inputs.clip_name = settings.vision;
    graph['426'].inputs.noise_seed = settings.seed;
    graph['445:360'].inputs.value = settings.identitySystem === identityScope ? identityScope : `${settings.identitySystem}\n\nRequired identity scope (takes priority over conflicting description requests):\n${identityScope}`;
    graph['757:753'].inputs.value = settings.captionSystem;
    graph['445:357'].inputs.max_length = settings.identityTokens;
    graph['757:752'].inputs.max_length = settings.captionTokens;
    // Keep the supplied concatenation graph, replacing only its fixed style/background menus.
    graph['554:544'] = { class_type: 'PrimitiveString', inputs: { value: prompts.background } };
    graph['554:545'] = { class_type: 'PrimitiveString', inputs: { value: prompts.styleInstruction } };
    graph['554:546'].inputs.value = prompts.initialExtra;
    if (style?.trigger.trim()) {
        graph.style_trigger = { class_type: 'PrimitiveString', inputs: { value: style.trigger.trim() } };
        graph.style_identity = { class_type: 'StringConcatenate', inputs: { string_a: ['style_trigger', 0], string_b: ['445:357', 0], delimiter: '\n' } };
        graph['554:547'].inputs.string_a = ['style_identity', 0];
    }
    BLAZING_OUTPUTS.slice(1, 6).forEach((output, index) => {
        graph[output.prompt].inputs.value = prompts.views[index];
    });
    for (const node of Object.values(graph)) {
        if (node.class_type === 'Flux2Scheduler') node.inputs.steps = sampling.steps;
        if (node.class_type === 'CFGGuider') node.inputs.cfg = sampling.cfg;
        if (node.class_type === 'KSamplerSelect') node.inputs.sampler_name = sampling.sampler;
        if (node.class_type === 'ImageScaleToTotalPixels') node.inputs.megapixels = sampling.megapixels;
    }
    const family = inferFlux2Variant(settings.model)?.toUpperCase();
    const available = info ? [...new Set([...h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'), ...h3Choices(info, 'LoraLoader', 'lora_name')])] : undefined;
    const loras = [...(style?.lora ? [{ enabled: true, name: style.lora, strength: settings.styleLoraStrength ?? style.strength }] : []), ...settings.loras.filter(lora => lora.enabled)];
    graph['450'].inputs = { model: ['442:435', 0] };
    loras.forEach((lora, index) => {
        const name = available ? resolveStyleLora(lora.name, available) : lora.name;
        const variant = inferFlux2Variant(`FLUX2 ${name}`)?.toUpperCase();
        if (variant && variant !== family) throw new Error(`LoRA "${lora.name}" is not compatible with ${family}.`);
        graph['450'].inputs[`lora_${index + 1}`] = { on: true, lora: name, strength: lora.strength };
    });
    applyFlux2StyleScheduler(graph, sampling.scheduler);
    if (blazingPoseCount(settings) < 6) {
        const needed = new Set<string>();
        const visit = (id: string) => {
            if (needed.has(id)) return;
            if (!graph[id]) throw new Error(`Missing Blazing Fast workflow link ${id}.`);
            needed.add(id);
            for (const value of Object.values(graph[id].inputs)) {
                if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number') visit(value[0]);
            }
        };
        for (const output of blazingOutputs(settings)) visit(output.id);
        visit('358'); visit('495');
        for (const id of Object.keys(graph)) if (!needed.has(id)) delete graph[id];
    }
    if (info) validateMinimaxH3Readiness(graph, info);
    return graph;
};
