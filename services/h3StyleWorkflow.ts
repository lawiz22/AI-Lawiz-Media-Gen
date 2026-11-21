import type { H3Workflow, MinimaxH3Options } from './minimaxH3Workflow';
import { appendGalleryStylePrompt, normalizeStyleModel, removeGalleryStyleTrigger, styleLoraMatches, validateStyleGallery, type GalleryStyle } from './styleGallery';
import type { StyleSampling } from './styleSampling';

export interface H3StyleSettings {
    style?: GalleryStyle;
    styleStrength?: number;
    useStyleSettings?: boolean;
}

export const h3GalleryStyle = (options: H3StyleSettings): GalleryStyle | undefined => {
    const style = options.style;
    if (!style) return undefined;
    validateStyleGallery({ version: 1, styles: [style] });
    if (normalizeStyleModel(style.model) !== 'H3') throw new Error('Choose an H3 / MiniMax style for this workflow.');
    const strength = options.styleStrength ?? style.strength;
    if (!Number.isFinite(strength) || Math.abs(strength) > 20) throw new Error('H3 style LoRA strength must be between -20 and 20.');
    if (options.useStyleSettings && style.settings.steps !== undefined && style.settings.steps > 10000) throw new Error('H3 style steps must be between 1 and 10000.');
    return style;
};

export const h3StyleSampling = (options: MinimaxH3Options): StyleSampling => {
    const scheduler = options.variant === 'advanced' ? options.advanced?.nodes.scheduler?.scheduler
        : options.variant === 'ultrafast' ? options.ultrafast?.scheduler : options.useStyleSettings ? options.style?.settings.scheduler ?? 'h3-beta' : 'h3-beta';
    if (typeof scheduler !== 'string' || !scheduler.trim()) throw new Error('H3 scheduler settings are missing. Reset workflow settings.');
    return { steps: options.steps, sampler: options.sampler, scheduler };
};

export const h3StyleLoraRemovals = (options: MinimaxH3Options, selected?: GalleryStyle) => options.loras.map(lora =>
    styleLoraMatches(lora.name, [options.style?.lora || '', selected?.lora || '']) ? { ...lora, name: '', enabled: false } : lora);

export const applyH3GalleryStyle = (workflow: H3Workflow, options: MinimaxH3Options): void => {
    // A source-video pipeline without H3 latent refinement has no H3 model to style.
    if (!workflow['135']) return;
    const style = h3GalleryStyle(options);
    if (!style) return;
    if (style.lora) {
        const manualLoader = workflow['137'];
        // Keep the native LoRA stage order, including REF2V's preview-before-LoRA chain.
        const modelSource = manualLoader ? '137'
            : !options.variant && workflow['141'] ? '141' : '135';
        const clipSource = manualLoader && options.useLoraClip ? '137' : '127';
        if (!workflow[clipSource]) throw new Error('Cannot apply the H3 style: H3 CLIP loader is missing.');
        for (const node of Object.values(workflow)) {
            if (node.class_type === 'Power Lora Loader (rgthree)') {
                for (const [key, value] of Object.entries(node.inputs)) {
                    if (key.startsWith('lora_') && value && typeof value === 'object' && 'lora' in value
                        && typeof value.lora === 'string' && styleLoraMatches(value.lora, [style.lora])) delete node.inputs[key];
                }
            }
            if (node.class_type === 'LTX_lora_loader') {
                const stack: unknown = JSON.parse(String(node.inputs.stack_data));
                if (!Array.isArray(stack)) throw new Error('Invalid H3 LoRA stack.');
                node.inputs.stack_data = JSON.stringify(stack.filter(entry => {
                    if (!entry || typeof entry !== 'object' || typeof entry.lora !== 'string') throw new Error('Invalid H3 LoRA entry.');
                    return !styleLoraMatches(entry.lora, [style.lora]);
                }));
            }
            const model = node.inputs.model;
            if (Array.isArray(model) && model[0] === modelSource && model[1] === 0) node.inputs.model = ['style_lora', 0];
            const clip = node.inputs.clip;
            if (node !== manualLoader && Array.isArray(clip) && clip[0] === clipSource && clip[1] === (clipSource === '137' ? 1 : 0)) {
                node.inputs.clip = ['style_lora', 1];
            }
        }
        // The style always patches H3's text encoder, independently of the manual CLIP switch.
        const model = [modelSource, 0], clip = [clipSource, clipSource === '137' ? 1 : 0];
        const strength = options.styleStrength ?? style.strength;
        workflow.style_lora = options.variant === 'ultrafast'
            ? { class_type: 'LTX_lora_loader', inputs: { model, clip, mode: 'minimax',
                stack_data: JSON.stringify([{ on: true, lora: style.lora, str: strength, v: 1, a: 1, t: 1 }]),
            } }
            : { class_type: 'Power Lora Loader (rgthree)', inputs: {
                model, clip, lora_1: { on: true, lora: style.lora, strength },
            } };
    }
    const conditioning = Object.values(workflow).filter(node => ['MiniMaxH3ReferenceToVideo', 'MiniMaxH3ImageToVideo'].includes(node.class_type));
    if (!conditioning.length) throw new Error('Cannot apply the H3 style: H3 prompt conditioning is missing.');
    const base = conditioning[0].inputs.prompt;
    let prompt: unknown;
    if (typeof base === 'string') prompt = appendGalleryStylePrompt(base, style);
    else {
        if (!Array.isArray(base) || typeof base[0] !== 'string' || !workflow[base[0]]) throw new Error('Cannot apply the H3 style: invalid prompt connection.');
        // Compose after ReferencePack rewriting so it cannot discard the trigger.
        prompt = base;
        const addition = removeGalleryStyleTrigger(style.prompt.trim(), style.trigger);
        if (addition) {
            workflow.style_prompt_boosters = { class_type: 'PrimitiveStringMultiline', inputs: { value: addition } };
            workflow.style_prompt_body = { class_type: 'StringConcatenate', inputs: { string_a: prompt, string_b: ['style_prompt_boosters', 0], delimiter: '\n' } };
            prompt = ['style_prompt_body', 0];
        }
        if (style.trigger.trim()) {
            workflow.style_prompt_trigger = { class_type: 'PrimitiveStringMultiline', inputs: { value: style.trigger.trim() } };
            workflow.style_prompt = { class_type: 'StringConcatenate', inputs: { string_a: ['style_prompt_trigger', 0], string_b: prompt, delimiter: '\n' } };
            prompt = ['style_prompt', 0];
        }
    }
    for (const node of conditioning) node.inputs.prompt = prompt;
    if (workflow['186']) workflow['186'].inputs.source = prompt;
    if (options.useStyleSettings && workflow['190']) {
        const { steps, sampler, scheduler } = style.settings;
        if (steps !== undefined) workflow['190'].inputs.steps = steps;
        if (sampler !== undefined) {
            if (!workflow['150']) throw new Error('Cannot apply the H3 style: primary sampler is missing.');
            workflow['150'].inputs.sampler_name = sampler;
        }
        if (scheduler !== undefined) {
            const current = workflow['190'].inputs;
            workflow['190'] = scheduler === 'h3-beta'
                ? { class_type: 'BetaSamplingScheduler', inputs: { model: current.model, steps: current.steps, alpha: options.alpha, beta: options.beta } }
                : { class_type: 'BasicScheduler', inputs: { model: current.model, steps: current.steps, scheduler, denoise: current.denoise ?? 1 } };
        }
    }
};
