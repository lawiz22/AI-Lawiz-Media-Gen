import type { MinimaxDraft } from './videoPromptService';
import { buildMinimaxH3Workflow, defaultMinimaxH3Options, planH3References, type H3Workflow, type MinimaxH3Options } from './minimaxH3Workflow';

export type AdvancedValue = string | number | boolean;
export type AdvancedVideoFinishing = 'latent' | 'ltx';
export interface AdvancedH3Settings {
    mode: 'fl2v' | 'ref2v';
    inputMode?: 'generate' | 'video';
    stageOrder?: 'latent-first' | 'ltx-first';
    sourceAudio?: boolean;
    latentUpscale: boolean;
    ltxRefine: boolean;
    ltxDecodeMode?: 'standard' | 'tiled';
    rtxUpscale: boolean;
    comfyAttention: boolean;
    ltxAttention: boolean;
    ltxLora: boolean;
    boost: boolean;
    vramClear: boolean;
    interpolation: boolean;
    saveIntermediateVideos?: boolean;
    imageNoise: Record<string, boolean>;
    randomizeImageNoise: Record<string, boolean>;
    nodes: Record<string, Record<string, AdvancedValue>>;
}
export const ADVANCED_LTX_DECODE_8GB = { tile_size: 256, overlap: 32, temporal_size: 16, temporal_overlap: 4 };
export const ADVANCED_LTX_DECODE_DIRECTOR = { tile_size: 256, overlap: 64, temporal_size: 64, temporal_overlap: 4 };
export const ADVANCED_NODE_SPECS: Array<{ id: string; title: string; classType: string; group: string; defaults: Record<string, AdvancedValue> }> = [
    { id: 'scheduler', title: 'Base scheduler', classType: 'BasicScheduler', group: 'base', defaults: { scheduler: 'beta', denoise: 1 } },
    { id: 'attention', title: 'Comfy attention', classType: 'ModelAttentionBackend', group: 'base', defaults: { attention: 'comfy kitchen attention' } },
    { id: 'sol', title: 'Boost / Sol attention', classType: 'SolAttnPatch', group: 'boost', defaults: { tau: 0.1, start_percent: 0.1, end_percent: 1, min_tokens: 4096, int8_qk: true, sink_conditioning: 'exact_kv_and_rows', morton: false, morton_curve: '3d', int8_pv: true, verbose: false, use_tma: false, dense_blocks: '' } },
    { id: 'shift', title: 'Boost / sigma shift', classType: 'MiniMaxH3SigmaShift', group: 'boost', defaults: { shift_video: 12, shift_audio: 3 } },
    { id: 'chunks', title: 'Boost / feed-forward chunks', classType: 'MiniMaxChunkFeedForward', group: 'boost', defaults: { chunks: 3, seq_threshold: 4096 } },
    { id: 'clear', title: 'VRAM clearing', classType: 'VRAM_Debug', group: 'base', defaults: { empty_cache: true, gc_collect: true, unload_all_models: true } },
    { id: 'latent', title: 'H3 latent upscaler / all resize modes', classType: 'MinimaxH3LatentUpscaler3D', group: 'latent', defaults: { model_name: 'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors', mode: 'scale by multiplier', 'mode.scale': 1.25, 'mode.width': 1280, 'mode.height': 704, 'mode.megapixels': 1, align: 32, enable_temporal_chunking: false, force_unload: false, device: 'cuda', precision: 'fp16' } },
    { id: 'latent-noise', title: 'H3 upscale sampling seed', classType: 'RandomNoise', group: 'latent', defaults: { noise_seed: 444 } },
    { id: 'latent-sampler', title: 'H3 upscale sampler', classType: 'KSamplerSelect', group: 'latent', defaults: { sampler_name: 'seeds_2' } },
    { id: 'latent-sigmas', title: 'H3 upscale sigmas', classType: 'ManualSigmas', group: 'latent', defaults: { sigmas: '0.9035, 0.6316, 0.3158, 0.0000' } },
    { id: 'interpolate', title: 'RIFE interpolation', classType: 'RIFEInterpolation', group: 'extras', defaults: { source_fps: 24, target_fps: 60, scale: 3, model_name: 'flownet.pkl', batch_size: 8, use_fp16: true } },
    { id: 'noise-1', title: 'Add noise to Image 1 / first frame', classType: 'ImageAddNoise', group: 'extras', defaults: { seed: 814209144390520, strength: 0.25 } },
    { id: 'noise-2', title: 'Add noise to Image 2 / last frame', classType: 'ImageAddNoise', group: 'extras', defaults: { seed: 22717960395916, strength: 0.15 } },
    { id: 'noise-3', title: 'Add noise to Image 3', classType: 'ImageAddNoise', group: 'extras', defaults: { seed: 200829064433857, strength: 0.5 } },
    { id: 'ltx-model', title: 'LTX diffusion model', classType: 'UNETLoader', group: 'ltx', defaults: { unet_name: 'ltx-2.5-22b-distilled-transformer-nvfp4.safetensors', weight_dtype: 'default' } },
    { id: 'ltx-clip', title: 'LTX text encoder', classType: 'CLIPLoader', group: 'ltx', defaults: { clip_name: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', type: 'ltxv', device: 'default' } },
    { id: 'ltx-vae', title: 'LTX video VAE', classType: 'VAELoader', group: 'ltx', defaults: { vae_name: 'ltx-2.5-video-vae-bf16.safetensors' } },
    { id: 'ltx-audio-vae', title: 'LTX audio VAE', classType: 'VAELoader', group: 'ltx', defaults: { vae_name: 'ltx-2.5-audio-vae-bf16.safetensors' } },
    { id: 'ltx-lora', title: 'LTX refine LoRA', classType: 'LoraLoaderModelOnly', group: 'ltx', defaults: { lora_name: 'LTX2_camera_control\\ltx-2.5-22b-ic-lora-refine-details-1.0.safetensors', strength_model: 0.6 } },
    { id: 'ltx-attention', title: 'LTX attention backend', classType: 'ModelAttentionBackend', group: 'ltx', defaults: { attention: 'comfy kitchen attention' } },
    { id: 'ltx-positive', title: 'LTX positive prompt', classType: 'CLIPTextEncode', group: 'ltx', defaults: { text: 'high quality 4k restoration, maintain faces' } },
    { id: 'ltx-negative', title: 'LTX negative prompt', classType: 'CLIPTextEncode', group: 'ltx', defaults: { text: 'pc game, console game, video game, cartoon, childish, ugly' } },
    { id: 'ltx-preprocess', title: 'LTX preprocessing', classType: 'LTXVPreprocess', group: 'ltx', defaults: { img_compression: 0 } },
    { id: 'ltx-first', title: 'LTX anchoring image batch', classType: 'ImageFromBatch', group: 'ltx', defaults: { batch_index: 0, length: 1 } },
    { id: 'ltx-upscale', title: 'LTX latent upscale model', classType: 'LatentUpscaleModelLoader', group: 'ltx', defaults: { model_name: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors' } },
    { id: 'ltx-anchor', title: 'LTX image conditioning', classType: 'LTXVImgToVideoInplace', group: 'ltx', defaults: { strength: 1, bypass: false } },
    { id: 'ltx-noise', title: 'LTX seed', classType: 'RandomNoise', group: 'ltx', defaults: { noise_seed: 42 } },
    { id: 'ltx-sigmas', title: 'LTX sigmas', classType: 'ManualSigmas', group: 'ltx', defaults: { sigmas: '0.5, 0.3, 0.1, 0.0' } },
    { id: 'ltx-sampler', title: 'LTX sampler', classType: 'KSamplerSelect', group: 'ltx', defaults: { sampler_name: 'lcm' } },
    { id: 'ltx-guider', title: 'LTX guidance', classType: 'CFGGuider', group: 'ltx', defaults: { cfg: 1 } },
    { id: 'ltx-decode', title: 'LTX tiled decode', classType: 'VAEDecodeTiled', group: 'ltx', defaults: { ...ADVANCED_LTX_DECODE_DIRECTOR } },
    { id: 'rtx', title: 'Final RTX upscaler / all resize modes', classType: 'RTXVideoSuperResolution', group: 'rtx', defaults: { resize_type: 'scale by multiplier', 'resize_type.scale': 2, 'resize_type.width': 1920, 'resize_type.height': 1080, quality: 'ULTRA' } },
];
export const defaultAdvancedH3Options = (): MinimaxH3Options => ({
    ...defaultMinimaxH3Options(), variant: 'advanced',
    videoVae: 'minimax_h3_video_vae_int8_convrot.safetensors', megapixels: 0.3, duration: 3,
    seed: 205835701017573, steps: 4, extendSigmas: false, refImageSize: 'match',
    previewQuality: 80, previewAllFrames: false, previewFrames: 1024, previewFps: 24,
    filenamePrefix: 'MrWeaz/%date:yyyy-MM-dd%/Advanced_', format: 'video/nvenc_h264-mp4',
    formatOptions: { pix_fmt: 'yuv420p', bitrate: 15, megabit: true, save_metadata: false },
    loras: [
        { enabled: false, name: 'H3\\fp100c_v1.safetensors', strength: 1 },
        { enabled: false, name: '', strength: 1 },
        { enabled: false, name: 'H3\\breastplayjiggle_h3_v2.safetensors', strength: 0.95 },
        { enabled: false, name: 'H3\\H3_VBVR_Pro_attn_only.safetensors', strength: 1 },
        { enabled: false, name: 'H3\\AmateurHour_H3_000017500.safetensors', strength: 1 },
        { enabled: false, name: '', strength: 1 },
    ],
    advanced: {
        mode: 'fl2v', inputMode: 'generate', stageOrder: 'ltx-first', sourceAudio: true,
        latentUpscale: true, ltxRefine: false, ltxDecodeMode: 'tiled', rtxUpscale: false,
        comfyAttention: true, ltxAttention: true, ltxLora: true, boost: false, vramClear: true, interpolation: false, saveIntermediateVideos: true,
        imageNoise: { '1': false, '2': false, '3': false },
        randomizeImageNoise: { '1': true, '2': true, '3': true },
        nodes: Object.fromEntries(ADVANCED_NODE_SPECS.map(spec => [spec.id, { ...spec.defaults }])),
    },
});
export const advancedParameterVisible = (parameters: Record<string, AdvancedValue>, name: string): boolean => {
    if (!name.includes('.')) return true;
    const [selector, field] = name.split('.');
    const mode = parameters[selector];
    return (mode === 'scale by multiplier' && field === 'scale') || (mode === 'target dimensions' && ['width', 'height'].includes(field)) || (mode === 'megapixels' && field === 'megapixels');
};
type Link = [string, number];
export const planAdvancedH3Input = (draft: MinimaxDraft, options: MinimaxH3Options): ReturnType<typeof planH3References> => {
    if (options.advanced?.inputMode !== 'video') return planH3References(draft, options);
    const source = draft.references[0];
    if (draft.references.length !== 1 || source?.kind !== 'video' || !source.file.size || !source.file.type.startsWith('video/')) {
        throw new Error('Video finishing requires exactly one source video. Choose a source video to replace the conditioning references.');
    }
    return { references: [source], mappings: [], prompt: options.advanced?.ltxRefine && !options.advanced.latentUpscale ? String(options.advanced.nodes['ltx-positive']?.text ?? '') : draft.prompt };
};
export const buildAdvancedH3Workflow = (draft: MinimaxDraft, options: MinimaxH3Options, uploads: Record<string, string>): H3Workflow => {
    const advanced = options.advanced;
    if (!advanced || !['fl2v', 'ref2v'].includes(advanced.mode)) throw new Error('Select Advanced FL2V or REF2V, or reset Advanced settings.');
    if (advanced.ltxDecodeMode !== undefined && !['standard', 'tiled'].includes(advanced.ltxDecodeMode)) throw new Error('Select Standard or Tiled LTX decode mode.');
    if (advanced.stageOrder !== undefined && !['latent-first', 'ltx-first'].includes(advanced.stageOrder)) throw new Error('Select a valid Advanced stage order.');
    if (advanced.inputMode !== undefined && !['generate', 'video'].includes(advanced.inputMode)) throw new Error('Select generation or source-video input.');
    const videoInput = advanced.inputMode === 'video';
    const ltxFirst = advanced.stageOrder === 'ltx-first';
    const lateLatent = ltxFirst && advanced.latentUpscale && advanced.ltxRefine;
    if (videoInput && !advanced.latentUpscale && !advanced.ltxRefine && !advanced.rtxUpscale && !advanced.interpolation) throw new Error('Enable at least one video finishing stage.');
    if (videoInput && options.forceOriginalAudio) throw new Error('Video finishing retains its source soundtrack directly. Disable the separate original WAV lock.');
    const limits = { image: 3, video: 1, audio: 2 };
    for (const kind of ['image', 'video', 'audio'] as const) if (draft.references.filter(ref => ref.kind === kind).length > limits[kind]) throw new Error(`Advanced supports at most ${limits[kind]} ${kind} references.`);
    if (options.forceOriginalAudio && advanced.interpolation) throw new Error('Disable interpolation for the original WAV lock, which requires native 24 FPS.');
    const plan = planAdvancedH3Input(draft, options);
    if (!videoInput && advanced.mode === 'fl2v' && plan.references.some(ref => ref.kind === 'image' ? ref.slot > 2 : ref.id !== options.originalAudioId)) {
        throw new Error('FL2V accepts Image 1 / first frame and Image 2 / last frame only. Switch to REF2V or disable the other references. A locked original soundtrack can still be used.');
    }
    const bootstrap = videoInput ? {
        ...defaultAdvancedH3Options(),
        ...(advanced.latentUpscale ? {
            model: options.model, weightDtype: options.weightDtype, clip: options.clip, clipDevice: options.clipDevice,
            videoVae: options.videoVae, audioVae: options.audioVae, conditionVideoVae: options.conditionVideoVae,
            useLoras: options.useLoras, useLoraClip: options.useLoraClip, loras: options.loras,
        } : {}),
        filenamePrefix: options.filenamePrefix, format: options.format, formatOptions: options.formatOptions,
        saveOutput: options.saveOutput, pingpong: options.pingpong, loopCount: options.loopCount,
        originalAudioId: undefined, forceOriginalAudio: false, generateAudio: false, conditionAudioVae: false,
        promptProvider: 'none' as const, references: {},
    } : options;
    const workflow = buildMinimaxH3Workflow(videoInput ? { ...draft, references: [], prompt: draft.prompt.trim() || 'High quality restoration, preserve the source video.' } : draft,
        { ...bootstrap, preview: false, extendSigmas: false }, uploads);
    const params = (id: string) => {
        const values = advanced.nodes[id];
        if (!values) throw new Error(`Missing Advanced settings: ${id}. Reset Advanced settings.`);
        for (const [name, value] of Object.entries(values)) if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid Advanced ${id}: ${name} must be finite.`);
        return Object.fromEntries(Object.entries(values).filter(([name]) => advancedParameterVisible(values, name)));
    };
    const add = (id: string, class_type: string, inputs: Record<string, unknown>): Link => {
        workflow[id] = { class_type, inputs }; return [id, 0];
    };
    const configured = (id: string, inputs: Record<string, unknown> = {}): Link => {
        const spec = ADVANCED_NODE_SPECS.find(spec => spec.id === id);
        if (!spec) throw new Error(`Unknown Advanced stage: ${id}.`);
        return add(`advanced-${id}`, spec.classType, { ...params(id), ...inputs });
    };
    const saveIntermediates = advanced.saveIntermediateVideos !== false;
    const output = { ...workflow['119'].inputs };
    const checkpoint = (stage: 'FirstPass' | 'LatentUpscale' | 'LTX', images: Link, audio: unknown, frameRate: number | Link, value: Link): Link => {
        if (!saveIntermediates) return value;
        const id = stage === 'FirstPass' ? 'first-pass' : stage === 'LatentUpscale' ? 'latent-upscale' : 'ltx';
        const save = add(`advanced-save-${id}`, 'VHS_VideoCombine', {
            ...output, images, ...(audio ? { audio } : {}), frame_rate: frameRate,
            filename_prefix: `${output.filename_prefix}${stage}_`,
        });
        add(`advanced-after-${id}`, 'ImpactExecutionOrderController', { signal: save, value });
        return [`advanced-after-${id}`, 1];
    };
    let model: Link = [bootstrap.useLoras && bootstrap.loras.some(lora => lora.enabled) ? '137' : '135', 0];
    if ((!videoInput || advanced.latentUpscale) && advanced.comfyAttention) model = configured('attention', { model });
    if ((!videoInput || advanced.latentUpscale) && advanced.boost) {
        model = configured('sol', { model });
        model = configured('shift', { model });
        model = configured('chunks', { model });
    }
    if (options.preview && (!videoInput || advanced.latentUpscale)) {
        for (const [name, value, min, max] of [
            ['resolution', options.previewMaxResolution, 0, 8192], ['quality', options.previewQuality, 30, 100],
            ['frames', options.previewFrames, 1, 1024], ['fps', options.previewFps, 1, 60],
        ] as const) if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid Advanced preview ${name}.`);
        if (options.previewAudio && !options.originalAudioId && !workflow['122']) add('122', 'VAELoader', { vae_name: options.audioVae });
        model = add('141', 'ModelPreviewOverrideKJ', {
        model, max_resolution: options.previewMaxResolution, jpeg_quality: options.previewQuality,
        suppress_default_preview: options.suppressDefaultPreview, preview_frames: options.previewAllFrames ? ['177', 1] : options.previewFrames,
        preview_fps: options.previewFps, tiny_vae: options.tinyVae,
        ...(options.previewUseVae ? { vae: ['121', 0] } : {}),
        ...(options.previewAudio && !options.originalAudioId ? { audio_vae: ['122', 0] } : {}),
        });
    }
    workflow['149'].inputs.model = model;
    if (!videoInput) workflow['190'] = { class_type: 'BasicScheduler', inputs: { ...params('scheduler'), model, steps: options.steps } };
    const imageLinks = new Map<number, Link>();
    for (const [index, ref] of plan.references.filter(ref => ref.kind === 'image').entries()) {
        let image: Link = ['185', index];
        if (advanced.imageNoise[String(ref.slot)]) image = configured(`noise-${ref.slot}`, { image });
        imageLinks.set(ref.slot, image);
        workflow['184'].inputs[`ref_images.ref_image_${index}`] = image;
    }
    for (const [slot, enabled] of Object.entries(advanced.imageNoise)) if (!videoInput && enabled && !imageLinks.has(Number(slot))) throw new Error(`Add noise to Image ${slot} requires that image to be enabled.`);
    if (!videoInput && advanced.mode === 'fl2v') workflow['184'] = { class_type: 'MiniMaxH3ImageToVideo', inputs: {
        clip: workflow['184'].inputs.clip, vae: ['121', 0], prompt: workflow['184'].inputs.prompt,
        width: ['115', 0], height: ['115', 1], length: ['177', 1],
        ...(imageLinks.has(1) ? { first_frame: imageLinks.get(1) } : {}),
        ...(imageLinks.has(2) ? { last_frame: imageLinks.get(2) } : {}),
    } };
    let samples: Link = ['153', 0];
    if (advanced.latentUpscale && !lateLatent && !videoInput) {
        if (saveIntermediates) {
            const firstImages = add('advanced-first-decode', 'VAEDecode', { samples, vae: ['121', 0] });
            const firstAudio = workflow['134'] ? add('advanced-first-audio', 'VAEDecodeAudio', { samples, vae: ['122', 0] }) : output.audio;
            samples = checkpoint('FirstPass', firstImages, firstAudio, options.frameRate, samples);
        }
        const separated = add('advanced-separate', 'LTXVSeparateAVLatent', { av_latent: samples });
        const latent = configured('latent', { latent: separated });
        const combined = add('advanced-concat', 'LTXVConcatAVLatent', { video_latent: latent, audio_latent: ['advanced-separate', 1] });
        const sigmas = configured('latent-sigmas');
        samples = add('advanced-latent-sample', 'SamplerCustomAdvanced', {
            noise: configured('latent-noise'), guider: ['149', 0], sampler: configured('latent-sampler'), sigmas, latent_image: combined,
        });
    }
    workflow['133'].inputs.samples = samples;
    if (workflow['134']) workflow['134'].inputs.samples = samples;
    let images: Link = ['133', 0];
    let audio = workflow['119'].inputs.audio;
    let fps: number | Link = 24;
    const upscaleImages = (pixels: Link): Link => {
        const size = add('advanced-h3-source-size', 'GetImageSize', { image: pixels });
        const encoded = add('advanced-h3-encode', 'VAEEncode', { pixels, vae: ['121', 0] });
        const conditioning = add('advanced-latent-conditioning', workflow['184'].class_type, {
            ...workflow['184'].inputs, width: size, height: [size[0], 1], length: [size[0], 2],
        });
        const av = add('advanced-latent-source-av', 'LTXVSeparateAVLatent', { av_latent: [conditioning[0], 1] });
        const latent = configured('latent', { latent: encoded });
        const combined = add('advanced-concat', 'LTXVConcatAVLatent', { video_latent: latent, audio_latent: [av[0], 1] });
        const guider = add('advanced-latent-guider', 'BasicGuider', { model, conditioning });
        const sampled = add('advanced-latent-sample', 'SamplerCustomAdvanced', {
            noise: configured('latent-noise'), guider, sampler: configured('latent-sampler'), sigmas: configured('latent-sigmas'), latent_image: combined,
        });
        return add('advanced-h3-decode', 'VAEDecode', { samples: sampled, vae: ['121', 0] });
    };
    if (videoInput) {
        const source = plan.references[0], uploaded = uploads[source.id];
        if (!uploaded) throw new Error('Upload the source video before building its finishing workflow.');
        const loaded = add('advanced-source-video', 'VHS_LoadVideo', { video: uploaded, force_rate: 0, custom_width: 0, custom_height: 0,
            frame_load_cap: 0, skip_first_frames: 0, select_every_nth: 1, format: 'None' });
        const info = add('advanced-source-info', 'VHS_VideoInfo', { video_info: [loaded[0], 3] });
        fps = [info[0], 5];
        const size = add('advanced-source-size', 'GetImageSize', { image: loaded });
        if (workflow['141'] && options.previewAllFrames) workflow['141'].inputs.preview_frames = [size[0], 2];
        const width = add('advanced-source-width', 'ComfyMathExpression', { expression: 'max(32, round(a / 32) * 32)', 'values.a': size });
        const height = add('advanced-source-height', 'ComfyMathExpression', { expression: 'max(32, round(a / 32) * 32)', 'values.a': [size[0], 1] });
        images = add('advanced-source-align', 'ImageScale', { image: loaded, upscale_method: 'bicubic', width: [width[0], 1], height: [height[0], 1], crop: 'disabled' });
        audio = advanced.sourceAudio === false ? undefined : [loaded[0], 2];
        if (advanced.latentUpscale && !lateLatent) images = upscaleImages(images);
    }
    const checkpointFps = () => videoInput || advanced.interpolation ? fps : options.frameRate;
    if (advanced.interpolation || advanced.ltxRefine || advanced.rtxUpscale) {
        if (!videoInput || (advanced.latentUpscale && !lateLatent)) {
            images = checkpoint(advanced.latentUpscale && !lateLatent ? 'LatentUpscale' : 'FirstPass', images, audio, videoInput ? fps : options.frameRate, images);
        }
    }
    if (advanced.interpolation) {
        images = configured('interpolate', { images, source_fps: fps });
        const target = advanced.nodes.interpolate?.target_fps;
        if (typeof target !== 'number' || !Number.isFinite(target) || target < 1 || target > 240) throw new Error('Invalid interpolation target FPS.');
        fps = target;
    }
    if (advanced.vramClear) {
        add('advanced-clear-before', 'VRAM_Debug', { ...params('clear'), image_pass: images });
        images = ['advanced-clear-before', 1];
    }
    if (advanced.ltxRefine) {
        const vae = configured('ltx-vae'), audioVae = configured('ltx-audio-vae');
        const clip = configured('ltx-clip');
        let ltxModel = configured('ltx-model');
        const loraName = advanced.nodes['ltx-lora']?.lora_name;
        if (advanced.ltxLora) {
            if (typeof loraName !== 'string' || !loraName.trim() || loraName === 'None') throw new Error('Select the enabled LTX refine LoRA, or disable it.');
            ltxModel = configured('ltx-lora', { model: ltxModel });
        }
        if (advanced.ltxAttention) ltxModel = configured('ltx-attention', { model: ltxModel });
        images = configured('ltx-preprocess', { image: images });
        const size = add('advanced-ltx-size', 'GetImageSize', { image: images });
        const positive = configured('ltx-positive', { clip }), negative = configured('ltx-negative', { clip });
        const conditioning = add('advanced-ltx-conditioning', 'LTXVConditioning', { positive, negative, frame_rate: fps });
        const encoded = add('advanced-ltx-encode', 'VAEEncode', { pixels: images, vae });
        const upscaled = add('advanced-ltx-upsample', 'LTXVLatentUpsampler', { samples: encoded, upscale_model: configured('ltx-upscale'), vae });
        const first = configured('ltx-first', { image: images });
        const anchored = configured('ltx-anchor', { vae, image: first, latent: upscaled });
        const emptyAudio = add('advanced-ltx-empty-audio', 'LTXVEmptyLatentAudio', { frames_number: [size[0], 2], frame_rate: fps, batch_size: 1, audio_vae: audioVae });
        const av = add('advanced-ltx-av', 'LTXVConcatAVLatent', { video_latent: anchored, audio_latent: emptyAudio });
        const guider = configured('ltx-guider', { model: ltxModel, positive: conditioning, negative: ['advanced-ltx-conditioning', 1] });
        const sampled = add('advanced-ltx-sample', 'SamplerCustomAdvanced', {
            noise: configured('ltx-noise'), guider, sampler: configured('ltx-sampler'), sigmas: configured('ltx-sigmas'), latent_image: av,
        });
        const video = add('advanced-ltx-separate', 'LTXVSeparateAVLatent', { av_latent: sampled });
        images = advanced.ltxDecodeMode === 'standard'
            ? add('advanced-ltx-decode', 'VAEDecode', { samples: video, vae })
            : configured('ltx-decode', { samples: video, vae });
        if (audio && !videoInput) {
            const encodedAudio = add('advanced-ltx-source-audio', 'LTXVAudioVAEEncode', { audio, audio_vae: audioVae });
            audio = add('advanced-ltx-source-audio-decode', 'LTXVAudioVAEDecode', { samples: encodedAudio, audio_vae: audioVae });
        }
        if (advanced.rtxUpscale || lateLatent) images = checkpoint('LTX', images, audio, checkpointFps(), images);
        if (advanced.vramClear) {
            add('advanced-clear-after', 'VRAM_Debug', { ...params('clear'), image_pass: images });
            images = ['advanced-clear-after', 1];
        }
        if (lateLatent) {
            images = upscaleImages(images);
            if (advanced.rtxUpscale) images = checkpoint('LatentUpscale', images, audio, checkpointFps(), images);
        }
    }
    // RTX always consumes the last active refinement stage, never the LTX input.
    if (advanced.rtxUpscale) images = configured('rtx', { images });
    const finalStage = advanced.rtxUpscale ? 'RTX' : lateLatent ? 'LatentUpscale' : advanced.ltxRefine ? 'LTX' : advanced.interpolation ? 'Interpolated' : advanced.latentUpscale ? 'LatentUpscale' : 'FirstPass';
    delete workflow['119'].inputs.audio;
    workflow['119'].inputs = {
        ...workflow['119'].inputs, images, ...(audio ? { audio } : {}), frame_rate: checkpointFps(),
        ...(saveIntermediates ? { filename_prefix: `${output.filename_prefix}Final_${finalStage}_` } : {}),
    };
    if (videoInput) {
        const reachable = new Set<string>();
        const visit = (id: string) => {
            if (reachable.has(id)) return;
            const node = workflow[id];
            if (!node) throw new Error(`Missing video finishing node: ${id}.`);
            reachable.add(id);
            for (const value of Object.values(node.inputs)) if (Array.isArray(value) && typeof value[0] === 'string') visit(value[0]);
        };
        visit('119');
        for (const id of Object.keys(workflow)) if (!reachable.has(id)) delete workflow[id];
    }
    return workflow;
};
