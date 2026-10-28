import type { MinimaxDraft, VideoWorkflow } from './videoPromptService';
import { buildMinimaxH3Workflow, defaultMinimaxH3Options, type H3Workflow, type MinimaxH3Options } from './minimaxH3Workflow';
import { buildAdvancedH3Workflow, defaultAdvancedH3Options } from './minimaxH3AdvancedWorkflow';

export type H3RenderWorkflow = 'reference' | 'ultrafast' | 'advanced';
export const h3WorkflowName = (workflow: H3RenderWorkflow): string => workflow === 'advanced' ? 'MiniMax Advanced' : workflow === 'ultrafast' ? 'Ultrafast' : 'Minimax REF2v H3';
export const h3ReferenceLimits = (workflow: VideoWorkflow) => workflow === 'advanced' ? { image: 3, video: 1, audio: 2 } : workflow === 'ultrafast'
    ? { image: 6, video: 2, audio: 2 }
    : { image: 9, video: 3, audio: 3 };
export const validateH3ReferenceLimits = (draft: MinimaxDraft): void => {
    const limits = h3ReferenceLimits(draft.workflow);
    for (const kind of ['image', 'video', 'audio'] as const) {
        if (draft.references.filter(ref => ref.kind === kind).length > limits[kind]) {
            throw new Error(`${h3WorkflowName(draft.workflow === 'advanced' ? 'advanced' : draft.workflow === 'ultrafast' ? 'ultrafast' : 'reference')} supports at most ${limits[kind]} ${kind} references. Remove extra references before transferring or generating.`);
        }
    }
};
export const defaultUltrafastH3Options = (): MinimaxH3Options => ({
    ...defaultMinimaxH3Options(),
    variant: 'ultrafast',
    videoVae: 'minimax_h3_video_vae_int8_convrot.safetensors',
    megapixels: 0.30000000000000004, duration: 2, seed: 829374351962794,
    steps: 5, extendSigmas: false, refImageSize: 'match',
    previewQuality: 80, previewAllFrames: false, previewFrames: 500, previewFps: 6,
    filenamePrefix: 'video/H3',
    loras: Array.from({ length: 6 }, (_, index) => ({
        enabled: false, strength: 1,
        name: index < 2 ? 'H3\\minimax-h3-digicam.safetensors' : index === 2 ? 'H3\\H3_VBVR_Pro_attn_only.safetensors' : '',
    })),
    ultrafast: {
        spectrum: false, rtxUpscale: false, rtxScale: 2, rtxQuality: 'ULTRA',
        shiftVideo: 12, shiftAudio: 3, attention: 'comfy kitchen attention', scheduler: 'beta', denoise: 1,
    },
});
export const defaultH3WorkflowOptions = (workflow: H3RenderWorkflow): MinimaxH3Options =>
    workflow === 'advanced' ? defaultAdvancedH3Options() : workflow === 'ultrafast' ? defaultUltrafastH3Options() : defaultMinimaxH3Options();

export const buildUltrafastH3Workflow = (draft: MinimaxDraft, options: MinimaxH3Options, uploads: Record<string, string>): H3Workflow => {
    validateH3ReferenceLimits({ ...draft, workflow: 'ultrafast' });
    const settings = options.ultrafast;
    if (!settings) throw new Error('Ultrafast settings are missing. Reset settings before generating.');
    if (!options.saveOutput || options.pingpong || options.loopCount !== 0) throw new Error('Ultrafast uses native SaveVideo output without ping-pong or loops. Reset output settings.');
    if (options.originalAudioId !== undefined && !options.forceOriginalAudio) throw new Error('Enable the original WAV lock to preserve an exact original soundtrack in Ultrafast.');
    const numeric = (name: string, value: number, min: number, max: number) => {
        if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected a number between ${min} and ${max}.`);
    };
    numeric('video sigma shift', settings.shiftVideo, 0.01, 100);
    numeric('audio sigma shift', settings.shiftAudio, 0.01, 100);
    numeric('denoise', settings.denoise, 0, 1);
    if (!settings.scheduler.trim() || !settings.attention.trim()) throw new Error('Select an Ultrafast scheduler and attention backend.');
    // Reuse the validated multimodal input adapter and stable monitor/output IDs.
    const workflow = buildMinimaxH3Workflow(draft, { ...options, useLoras: false, extendSigmas: false }, uploads);
    let model: [string, number] = ['135', 0];
    if (options.useLoras) {
        for (const [index, lora] of options.loras.entries()) if (lora.enabled) {
            if (!lora.name.trim() || lora.name === 'None') throw new Error(`Select a file for enabled LoRA ${index + 1}.`);
            numeric('LoRA strength', lora.strength, -20, 20);
        }
        workflow['137'] = { class_type: 'LTX_lora_loader', inputs: {
            model, mode: 'minimax',
            stack_data: JSON.stringify(options.loras.map(lora => ({ on: lora.enabled, lora: lora.name || 'None', str: lora.strength, v: 1, a: 1, t: 1 }))),
            ...(options.useLoraClip ? { clip: ['127', 0] } : {}),
        } };
        model = ['137', 0];
        if (options.useLoraClip) workflow['184'].inputs.clip = ['137', 1];
    }
    if (options.preview) {
        workflow['141'].inputs.model = model;
        model = ['141', 0];
    }
    workflow['ultrafast-attention'] = { class_type: 'ModelAttentionBackend', inputs: { model, attention: settings.attention } };
    workflow['190'] = { class_type: 'BasicScheduler', inputs: { model: ['ultrafast-attention', 0], scheduler: settings.scheduler, steps: options.steps, denoise: settings.denoise } };
    workflow['ultrafast-shift'] = { class_type: 'MiniMaxH3SigmaShift', inputs: { model: ['ultrafast-attention', 0], shift_video: settings.shiftVideo, shift_audio: settings.shiftAudio } };
    model = ['ultrafast-shift', 0];
    if (settings.spectrum) {
        workflow['ultrafast-spectrum'] = { class_type: 'SpectrumApplyMiniMaxH3', inputs: {
            model, enabled: true, blend_weight: 0.5, degree: 1, ridge_lambda: 0.1,
            window_size: 2, flex_window: 0.75, warmup_steps: 1, tail_actual_steps: 1, max_history: 8, debug: false,
        } };
        model = ['ultrafast-spectrum', 0];
    }
    workflow['149'].inputs.model = model;
    let images: [string, number] = ['133', 0];
    if (settings.rtxUpscale) {
        numeric('RTX scale', settings.rtxScale, 1, 4);
        if (!['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].includes(settings.rtxQuality)) throw new Error('Invalid RTX upscaler quality.');
        workflow['ultrafast-rtx'] = { class_type: 'RTXVideoSuperResolution', inputs: {
            images, resize_type: 'scale by multiplier', 'resize_type.scale': settings.rtxScale, quality: settings.rtxQuality,
        } };
        images = ['ultrafast-rtx', 0];
    }
    const { audio, filename_prefix: filenamePrefix } = workflow['119'].inputs;
    workflow['ultrafast-video'] = { class_type: 'CreateVideo', inputs: {
        images, fps: options.frameRate, bit_depth: 8, color_space: 'sRGB', codec: 'none',
        ...(audio ? { audio } : {}),
    } };
    workflow['119'] = { class_type: 'SaveVideo', inputs: {
        video: ['ultrafast-video', 0], filename_prefix: filenamePrefix, format: 'auto', 'format.codec': 'auto', codec: 'auto',
    } };
    return workflow;
};
export const buildH3RenderWorkflow = (draft: MinimaxDraft, options: MinimaxH3Options, uploads: Record<string, string>): H3Workflow => {
    const variant = options.variant ?? 'reference';
    const destination = draft.workflow === 'advanced' || draft.workflow === 'ultrafast' ? draft.workflow : 'reference';
    if (variant !== destination) throw new Error('The draft and H3 workflow settings do not match. Reset settings in the destination workflow.');
    if (variant === 'advanced') return buildAdvancedH3Workflow(draft, options, uploads);
    return options.variant === 'ultrafast' ? buildUltrafastH3Workflow(draft, options, uploads) : buildMinimaxH3Workflow(draft, options, uploads);
};
