import type { MinimaxDraft, VideoReference } from './videoPromptService';
import { audioPromptRequirements, referenceToken } from './videoPromptService';

export interface H3NodeInfo {
    input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
}
export type H3ObjectInfo = Record<string, H3NodeInfo>;
export interface H3Node { class_type: string; inputs: Record<string, unknown> }
export type H3Workflow = Record<string, H3Node>;
export interface H3Lora { enabled: boolean; name: string; strength: number }
export interface H3ReferenceControl { enabled: boolean; useSoundtrack: boolean }
export interface MinimaxH3Options {
    model: string;
    weightDtype: string;
    clip: string;
    clipDevice: string;
    videoVae: string;
    audioVae: string;
    conditionVideoVae: boolean;
    conditionAudioVae: boolean;
    aspect: string;
    megapixels: number;
    multiple: number;
    duration: number;
    seed: number;
    randomizeSeed: boolean;
    sampler: string;
    steps: number;
    alpha: number;
    beta: number;
    extendSigmas: boolean;
    intermediateSteps: number;
    startSigma: number;
    endSigma: number;
    spacing: string;
    refImageSize: string;
    maxReferenceEdge: number;
    useLoras: boolean;
    loras: H3Lora[];
    useLoraClip: boolean;
    preview: boolean;
    previewMaxResolution: number;
    previewQuality: number;
    suppressDefaultPreview: boolean;
    previewAllFrames: boolean;
    previewFrames: number;
    previewFps: number;
    tinyVae: string;
    previewUseVae: boolean;
    previewAudio: boolean;
    generateAudio: boolean;
    originalAudioId?: string;
    forceOriginalAudio?: boolean;
    frameRate: number;
    loopCount: number;
    filenamePrefix: string;
    format: string;
    formatOptions: Record<string, string | number | boolean>;
    pingpong: boolean;
    saveOutput: boolean;
    displayPrompt: boolean;
    promptProvider: 'none' | 'openrouter' | 'local';
    systemPrompt: string;
    openrouterModel: string;
    reasoningEffort: string;
    apiBase: string;
    localModelSlug: string;
    jobType: string;
    references: Record<string, H3ReferenceControl>;
}
export const H3_ASPECTS = ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)'];
export const withH3OriginalAudio = (options: MinimaxH3Options, originalAudioId: string | undefined, forceOriginalAudio: boolean): MinimaxH3Options => ({
    ...options, originalAudioId, forceOriginalAudio,
    ...(forceOriginalAudio ? {
        format: 'video/h264-mp4', frameRate: 24, pingpong: false, loopCount: 0,
        formatOptions: { ...(options.format === 'video/h264-mp4' ? options.formatOptions : defaultMinimaxH3Options().formatOptions), trim_to_audio: true },
    } : {}),
});
export const defaultMinimaxH3Options = (): MinimaxH3Options => ({
    model: 'h3ErosMax_beta5_fp8.safetensors', weightDtype: 'default',
    clip: 'minimaxH3_h3Comfy_nvfp4.safetensors', clipDevice: 'default',
    videoVae: 'minimax_h3_video_vae_fp16.safetensors', audioVae: 'minimax_h3_audio_vae_fp32.safetensors',
    conditionVideoVae: true, conditionAudioVae: true,
    aspect: '4:3 (Standard)', megapixels: 0.4, multiple: 32, duration: 3,
    seed: 703673408085144, randomizeSeed: true, sampler: 'seeds_2', steps: 4, alpha: 0.6, beta: 0.6,
    extendSigmas: true, intermediateSteps: 2, startSigma: 0.8, endSigma: 0, spacing: 'linear',
    refImageSize: 'max', maxReferenceEdge: 2048,
    useLoras: true, useLoraClip: false,
    loras: [
        { enabled: false, name: 'H3\\H3_VBVR_Pro_attn_only.safetensors', strength: 1 },
        { enabled: false, name: 'HMNSFW_AIO_V2.safetensors', strength: 0.4 },
        { enabled: false, name: 'HMBreasts_085e0750_e40.safetensors', strength: 0.75 },
        { enabled: false, name: 'hmcumshot3_minimax-h3_epoch15.safetensors', strength: 1 },
        { enabled: false, name: 'hmcumshot3_minimax-h3_epoch35.safetensors', strength: 0.5 },
        { enabled: false, name: 'hmcumshot3_minimax-h3_epoch50.safetensors', strength: 0.6 },
    ],
    preview: true, previewMaxResolution: 1024, previewQuality: 92, suppressDefaultPreview: true,
    previewAllFrames: true, previewFrames: 24, previewFps: 5, tinyVae: 'taeh3.safetensors',
    previewUseVae: false, previewAudio: false,
    generateAudio: true, frameRate: 24, loopCount: 0, filenamePrefix: 'AnimateDiff',
    format: 'video/h264-mp4', formatOptions: { pix_fmt: 'yuv420p', crf: 12, save_metadata: false, trim_to_audio: false },
    pingpong: false, saveOutput: true, displayPrompt: true,
    promptProvider: 'none', systemPrompt: '', openrouterModel: 'google/gemini-3-flash-preview',
    reasoningEffort: 'none', apiBase: '', localModelSlug: '', jobType: 'auto', references: {},
});

export const h3Input = (info: H3ObjectInfo | null | undefined, node: string, name: string): unknown =>
    info?.[node]?.input?.required?.[name] ?? info?.[node]?.input?.optional?.[name];
export const h3Choices = (info: H3ObjectInfo | null | undefined, node: string, name: string): string[] => {
    const input = h3Input(info, node, name);
    if (!Array.isArray(input)) return [];
    const values = Array.isArray(input[0]) ? input[0] : typeof input[1] === 'object' && input[1] !== null && 'options' in input[1] ? input[1].options : [];
    return Array.isArray(values) ? values.filter((item): item is string => typeof item === 'string') : [];
};
export interface H3FormatWidget { name: string; type: string | string[]; config?: Record<string, unknown> }
export const h3FormatWidgets = (info: H3ObjectInfo | null | undefined, format: string): H3FormatWidget[] => {
    const input = h3Input(info, 'VHS_VideoCombine', 'format');
    if (!Array.isArray(input) || !isRecord(input[1]) || !isRecord(input[1].formats)) return [];
    const widgets = input[1].formats[format];
    if (!Array.isArray(widgets)) return [];
    return widgets.filter((widget): widget is [string, string | string[], Record<string, unknown>?] =>
        Array.isArray(widget) && typeof widget[0] === 'string' && (typeof widget[1] === 'string' || Array.isArray(widget[1])))
        .map(([name, type, config]) => ({ name, type, config: isRecord(config) ? config : undefined }));
};
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const pythonRound = (value: number) => {
    const floor = Math.floor(value);
    return value - floor === 0.5 ? floor + floor % 2 : Math.round(value);
};
export const h3Resolution = (options: Pick<MinimaxH3Options, 'aspect' | 'megapixels' | 'multiple'>) => {
    const match = /^(\d+):(\d+)/.exec(options.aspect);
    if (!match || !Number.isFinite(options.megapixels) || options.megapixels < 0.1 || options.megapixels > 16
        || !Number.isInteger(options.multiple) || options.multiple < 8 || options.multiple > 128 || options.multiple % 4) {
        throw new Error('Invalid H3 resolution settings.');
    }
    const w = Number(match[1]), h = Number(match[2]);
    const scale = Math.sqrt(options.megapixels * 1024 * 1024 / (w * h));
    return { width: pythonRound(w * scale / options.multiple) * options.multiple, height: pythonRound(h * scale / options.multiple) * options.multiple };
};
export const h3FrameCount = (seconds: number, coverAudio = false): number => {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) throw new Error('H3 duration must be greater than 0 and at most 60 seconds.');
    const base = Math.max(5, coverAudio ? Math.ceil(seconds * 24) : pythonRound(seconds * 24));
    return base + ((5 - base % 17) + 17) % 17;
};
export const h3AspectFromPrompt = (aspect: string): string => H3_ASPECTS.find(value => value.startsWith(`${aspect} `)) || aspect;
export const h3ReferenceControl = (options: MinimaxH3Options, ref: VideoReference): H3ReferenceControl =>
    options.references[ref.id] || { enabled: true, useSoundtrack: true };

export const replaceH3FirstPicture = (references: VideoReference[], file: File): VideoReference[] => {
    if (!file.size || file.type !== 'image/png') throw new Error('The last frame must be a non-empty PNG image.');
    const existing = references.find(ref => ref.kind === 'image' && ref.slot === 1);
    return existing ? references.map(ref => ref.id === existing.id ? { ...ref, file } : ref) : [
        ...references, { id: crypto.randomUUID(), kind: 'image', slot: 1, file, original: file, note: '' },
    ];
};

export interface H3ReferencePlan {
    references: VideoReference[];
    prompt: string;
    mappings: Array<{ from: string; to: string }>;
}
export const planH3References = (draft: MinimaxDraft, options: MinimaxH3Options): H3ReferencePlan => {
    const references = draft.references.filter(ref => h3ReferenceControl(options, ref).enabled)
        .sort((a, b) => ['image', 'video', 'audio'].indexOf(a.kind) - ['image', 'video', 'audio'].indexOf(b.kind) || a.slot - b.slot);
    if (!references.length) throw new Error('REF2V needs at least one enabled reference.');
    const mappings: H3ReferencePlan['mappings'] = [];
    let audioOffset = 0;
    for (const kind of ['image', 'video', 'audio'] as const) {
        const refs = references.filter(ref => ref.kind === kind);
        if (refs.length > (kind === 'image' ? 9 : 3)) throw new Error(`Too many H3 ${kind} references.`);
        refs.forEach((ref, index) => {
            const to = `<${kind === 'image' ? 'Picture' : kind === 'video' ? 'Video' : 'Audio'} ${kind === 'audio' ? audioOffset + index + 1 : index + 1}>`;
            mappings.push({ from: referenceToken(ref), to });
            if (kind === 'video' && h3ReferenceControl(options, ref).useSoundtrack) audioOffset++;
        });
    }
    const map = new Map(mappings.map(item => [item.from, item.to]));
    const prompt = draft.prompt.replace(/<(?:Picture|Video|Audio)\s+\d+>/g, token => {
        const mapped = map.get(token);
        if (!mapped) throw new Error(`The prompt uses ${token}, but its reference is disabled or missing. Edit the prompt or enable the reference.`);
        return mapped;
    });
    const requirements = audioPromptRequirements(references, options.originalAudioId, options.forceOriginalAudio);
    return { references, mappings, prompt: requirements ? `${prompt}\n\n${requirements.replace(/<(?:Picture|Video|Audio)\s+\d+>/g, token => map.get(token) || token)}` : prompt };
};

export const buildMinimaxH3Workflow = (
    draft: MinimaxDraft,
    options: MinimaxH3Options,
    uploads: Record<string, string>,
): H3Workflow => {
    if (!draft.prompt.trim()) throw new Error('A video prompt is required.');
    const frames = h3FrameCount(options.duration, options.originalAudioId !== undefined);
    const resolution = h3Resolution(options);
    if (resolution.width < 32 || resolution.height < 32 || resolution.width % 32 || resolution.height % 32) throw new Error('H3 dimensions must be multiples of 32. Select a compatible resolution multiple.');
    const plan = planH3References(draft, options);
    const originalAudioIndex = options.originalAudioId === undefined ? -1 : plan.references.filter(ref => ref.kind === 'audio').findIndex(ref => ref.id === options.originalAudioId);
    const preserveAudio = originalAudioIndex >= 0;
    const decodeAudio = options.generateAudio && !preserveAudio;
    const previewAudio = options.previewAudio && !preserveAudio;
    if (preserveAudio) {
        const source = plan.references.find(ref => ref.id === options.originalAudioId)!;
        if (!source.audioSelection) throw new Error('Apply an audio passage before choosing its original soundtrack, so audio/video timing can be checked.');
        if (!Number.isFinite(source.audioSelection.start) || !Number.isFinite(source.audioSelection.end) || source.audioSelection.start < 0 || source.audioSelection.end <= source.audioSelection.start) throw new Error('The original audio passage has invalid boundaries. Apply a valid passage again.');
        if (Math.abs(source.audioSelection.end - source.audioSelection.start - options.duration) > 0.001) throw new Error('H3 duration must match the applied original audio passage. Apply the passage again.');
        if (options.format !== 'video/h264-mp4' || options.frameRate !== 24 || options.pingpong || options.loopCount !== 0) {
            throw new Error('Original soundtrack requires H.264 MP4, native 24 FPS, no ping-pong and no loops.');
        }
    }
    const number = (name: string, value: number, min: number, max: number, integer = false) => {
        if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error(`Invalid ${name}: expected ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
    };
    number('seed', options.seed, 0, Number.MAX_SAFE_INTEGER, true);
    number('steps', options.steps, 1, 10000, true);
    number('alpha', options.alpha, 0, 50); number('beta', options.beta, 0, 50);
    number('reference edge', options.maxReferenceEdge, 0, 8192, true);
    number('frame rate', options.frameRate, 1, 240); number('loop count', options.loopCount, 0, 100, true);
    if (!options.filenamePrefix.trim() || !options.format.trim()) throw new Error('Output format and filename prefix are required.');
    if (!['none', 'local', 'openrouter'].includes(options.promptProvider) || !['auto', 'standard', 'replacement'].includes(options.jobType)
        || !['none', 'low', 'medium', 'high'].includes(options.reasoningEffort) || !['linear', 'cosine', 'sine'].includes(options.spacing)
        || !['max', 'match'].includes(options.refImageSize)) throw new Error('Invalid H3 reference or sampling selection.');
    if (options.promptProvider === 'local' && (!/^https?:\/\//.test(options.apiBase) || !options.localModelSlug.trim())) throw new Error('Local prompt rewriting needs an HTTP API base and a model ID.');
    if (options.loras.length > 6) throw new Error('Maximum six LoRAs in this workflow.');
    for (const [name, value] of [
        ['Model', options.model], ['CLIP', options.clip], ['Video VAE', options.videoVae],
        ...(decodeAudio || options.conditionAudioVae || (options.preview && previewAudio) ? [['Audio VAE', options.audioVae]] : []),
    ]) if (!value.trim()) throw new Error(`${name} is missing a filename.`);
    const workflow: H3Workflow = {};
    const add = (id: string, class_type: string, inputs: H3Node['inputs']) => { workflow[id] = { class_type, inputs }; };
    add('115', 'ResolutionSelector', { aspect_ratio: options.aspect, megapixels: options.megapixels, multiple: options.multiple });
    add('132', 'PrimitiveFloat', { value: options.duration });
    add('177', 'ComfyMathExpression', { expression: preserveAudio ? String(frames) : 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17', 'values.a': ['132', 0] });
    add('135', 'UNETLoader', { unet_name: options.model, weight_dtype: options.weightDtype });
    add('127', 'CLIPLoader', { clip_name: options.clip, type: 'minimax', device: options.clipDevice });
    add('121', 'VAELoader', { vae_name: options.videoVae });
    if (decodeAudio || options.conditionAudioVae || (options.preview && previewAudio)) add('122', 'VAELoader', { vae_name: options.audioVae });
    let model: [string, number] = ['135', 0];
    if (options.preview) {
        number('preview resolution', options.previewMaxResolution, 0, 8192, true);
        number('preview quality', options.previewQuality, 30, 100, true);
        number('preview frames', options.previewAllFrames ? frames : options.previewFrames, 1, 1024, true);
        number('preview fps', options.previewFps, 1, 60, true);
        add('141', 'ModelPreviewOverrideKJ', {
            model, max_resolution: options.previewMaxResolution, jpeg_quality: options.previewQuality,
            suppress_default_preview: options.suppressDefaultPreview,
            preview_frames: options.previewAllFrames ? ['177', 1] : options.previewFrames,
            preview_fps: options.previewFps, tiny_vae: options.tinyVae,
            ...(options.previewUseVae ? { vae: ['121', 0] } : {}),
            ...(previewAudio ? { audio_vae: ['122', 0] } : {}),
        });
        model = ['141', 0];
    }
    let clip: [string, number] = ['127', 0];
    const loras = options.useLoras ? options.loras.filter(lora => lora.enabled) : [];
    if (loras.length) {
        const loader: H3Node['inputs'] = { model, clip };
        loras.forEach((lora, index) => {
            if (!lora.name.trim()) throw new Error(`Select a file for enabled LoRA ${index + 1}.`);
            number('LoRA strength', lora.strength, -20, 20);
            loader[`lora_${index + 1}`] = { on: true, lora: lora.name, strength: lora.strength };
        });
        add('137', 'Power Lora Loader (rgthree)', loader);
        model = ['137', 0];
        if (options.useLoraClip) clip = ['137', 1];
    }
    const references = plan.references.map(ref => {
        const file = uploads[ref.id];
        if (!file) throw new Error(`Missing uploaded file for ${referenceToken(ref)}.`);
        return { kind: ref.kind, file, ...(ref.kind === 'video' ? { use_soundtrack: h3ReferenceControl(options, ref).useSoundtrack } : {}) };
    });
    add('185', 'MiniMaxH3ReferencePack', {
        direction: plan.prompt, references_json: JSON.stringify({ references }),
        system_prompt: options.systemPrompt, prompt_provider: options.promptProvider,
        // The node uses the ComfyUI server environment for hosted credentials.
        openrouter_api_key: '', openrouter_model: options.openrouterModel, reasoning_effort: options.reasoningEffort,
        api_base: options.apiBase, local_model_slug: options.localModelSlug, job_type: options.jobType,
        width: ['115', 0], height: ['115', 1], length_seconds: ['132', 0], max_reference_edge: options.maxReferenceEdge,
    });
    const refInputs: H3Node['inputs'] = {
        prompt: ['185', 18], clip, width: ['115', 0], height: ['115', 1], length: ['177', 1], ref_image_size: options.refImageSize,
        ...(options.conditionVideoVae ? { vae: ['121', 0] } : {}),
        ...(options.conditionAudioVae ? { audio_vae: ['122', 0] } : {}),
    };
    const counts = { image: 0, video: 0, audio: 0 };
    for (const ref of plan.references) {
        const index = counts[ref.kind]++;
        if (ref.kind === 'image') refInputs[`ref_images.ref_image_${index}`] = ['185', index];
        if (ref.kind === 'video') {
            refInputs[`ref_videos.ref_video_${index}`] = ['185', 9 + index];
            if (h3ReferenceControl(options, ref).useSoundtrack) refInputs[`ref_video_audios.ref_video_audio_${index}`] = ['185', 12 + index];
        }
        if (ref.kind === 'audio') refInputs[`ref_audios.ref_audio_${index}`] = ['185', 15 + index];
    }
    add('184', 'MiniMaxH3ReferenceToVideo', refInputs);
    add('149', 'BasicGuider', { model, conditioning: ['184', 0] });
    add('150', 'KSamplerSelect', { sampler_name: options.sampler });
    add('154', 'RandomNoise', { noise_seed: options.seed });
    add('190', 'BetaSamplingScheduler', { model, steps: options.steps, alpha: options.alpha, beta: options.beta });
    if (options.extendSigmas) {
        number('intermediate steps', options.intermediateSteps, 1, 100, true);
        number('start sigma', options.startSigma, -1, 20000); number('end sigma', options.endSigma, 0, 20000);
        add('189', 'ExtendIntermediateSigmas', { sigmas: ['190', 0], steps: options.intermediateSteps, start_at_sigma: options.startSigma, end_at_sigma: options.endSigma, spacing: options.spacing });
    }
    add('153', 'SamplerCustomAdvanced', { noise: ['154', 0], guider: ['149', 0], sampler: ['150', 0], sigmas: [options.extendSigmas ? '189' : '190', 0], latent_image: ['184', 1] });
    add('133', 'VAEDecode', { samples: ['153', 0], vae: ['121', 0] });
    if (decodeAudio) add('134', 'VAEDecodeAudio', { samples: ['153', 0], vae: ['122', 0] });
    add('119', 'VHS_VideoCombine', {
        ...options.formatOptions, ...(preserveAudio ? { trim_to_audio: true } : {}),
        images: ['133', 0], ...(preserveAudio ? { audio: ['185', 15 + originalAudioIndex] } : decodeAudio ? { audio: ['134', 0] } : {}),
        frame_rate: options.frameRate, loop_count: options.loopCount, filename_prefix: options.filenamePrefix, format: options.format,
        pingpong: options.pingpong, save_output: options.saveOutput,
    });
    if (options.displayPrompt) add('186', 'Display Any (rgthree)', { output: '', source: ['185', 18] });
    return workflow;
};

export const validateMinimaxH3Readiness = (workflow: H3Workflow, info: H3ObjectInfo): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(name => !info[name]);
    if (missing.length) throw new Error(`Missing ComfyUI nodes: ${missing.join(', ')}. Install/update them and restart ComfyUI.`);
    for (const node of Object.values(workflow)) {
        for (const [name, value] of Object.entries(node.inputs)) {
            if (Array.isArray(value)) continue;
            const choices = h3Choices(info, node.class_type, name);
            const schema = h3Input(info, node.class_type, name);
            const isCombo = Array.isArray(schema) && (Array.isArray(schema[0]) || schema[0] === 'COMBO');
            if (isCombo && typeof value === 'string' && !choices.includes(value)) throw new Error(`${node.class_type}: "${value}" is unavailable for ${name}. Refresh the node/model lists.`);
            if (typeof value === 'number' && Array.isArray(schema) && isRecord(schema[1])) {
                const config = schema[1];
                if ((typeof config.min === 'number' && value < config.min) || (typeof config.max === 'number' && value > config.max)
                    || (schema[0] === 'INT' && !Number.isInteger(value))) throw new Error(`${node.class_type}: ${name} is outside the installed node's limits.`);
            }
        }
        if (node.class_type === 'VHS_VideoCombine') {
            for (const widget of h3FormatWidgets(info, String(node.inputs.format))) {
                const value = node.inputs[widget.name];
                if (value === undefined) throw new Error(`Output format requires ${widget.name}. Select the format again to load its defaults.`);
                if (Array.isArray(widget.type) && !widget.type.includes(String(value))) throw new Error(`Invalid ${widget.name} for ${String(node.inputs.format)}.`);
                if (widget.type === 'BOOLEAN' && typeof value !== 'boolean') throw new Error(`${widget.name} must be enabled or disabled.`);
                if ((widget.type === 'INT' || widget.type === 'FLOAT') && (typeof value !== 'number' || !Number.isFinite(value)
                    || (widget.type === 'INT' && !Number.isInteger(value)) || (typeof widget.config?.min === 'number' && value < widget.config.min)
                    || (typeof widget.config?.max === 'number' && value > widget.config.max))) throw new Error(`Invalid ${widget.name} output setting.`);
            }
        }
        if (node.class_type === 'Power Lora Loader (rgthree)') {
            const available = h3Choices(info, 'LoraLoader', 'lora_name').concat(h3Choices(info, 'LoraLoaderModelOnly', 'lora_name'));
            for (const [name, value] of Object.entries(node.inputs)) {
                if (name.startsWith('lora_') && isRecord(value) && !available.includes(String(value.lora))) throw new Error(`LoRA "${value.lora}" is not available in the ComfyUI LoRA catalog.`);
            }
        }
    }
};
