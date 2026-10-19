import type { H3Node, H3ObjectInfo, H3Workflow } from './minimaxH3Workflow';
import { h3Input, isRecord, validateMinimaxH3Readiness } from './minimaxH3Workflow';

export interface CharacterSwapSettings {
    enableBirefnet: boolean;
    model: string;
    clip: string;
    videoVae: string;
    audioVae: string;
    vlmClip: string;
    characterLora: string;
    turboLora: string;
    upscaleLora: string;
    characterLoraStrength: number;
    turboLoraStrength: number;
    upscaleLoraStrength: number;
    seed: number;
    steps: number;
    cfg: number;
    sampler: string;
    shiftVideo: number;
    shiftAudio: number;
    attention: string;
    denoise?: number;
    /** Nonempty explicit override; otherwise use plan.global_prompt, then the supplied template. */
    prompt: string;
    /** @deprecated Compatibility only; plan.second_pass.enabled exclusively controls the branch. */
    secondPass: boolean;
    secondPassSteps: number;
    secondPassDenoise: number;
    upscaleModel: string;
    upscaleDevice: 'cuda' | 'cpu';
    upscalePrecision: 'fp16' | 'fp32' | 'bf16';
    comparison: boolean;
    comparisonHeight: number;
    crossfade: number;
    filenamePrefix: string;
    mp4Crf: number;
}

export const CHARACTER_SWAP_FALLBACK_PROMPT = "body_swap:  subject_definitions: <Subject 1> is the {details} shown in <Picture 1>, whose identity, face, head, hair or fur, skin, body shape, proportions and clothing define the character in the target video. The guide video provides the scene and the performance: its background, environment, lighting, camera, framing, body pose, hand and arm movement, head rotation, gaze direction, lip movement and facial expression, frame by frame; only {target} is replaced: their face, hair, body and clothing become <Subject 1>.  summary: [video generation + reference] Replace {target} in the guide video with <Subject 1>, keeping the scene, camera and the complete motion and performance of the guide video.  detailed_description: [Shot 1] <Subject 1> takes the exact place of {target} and moves with the same timing, body pose, gestures, head motion, gaze, speech and facial expressions, while keeping the complete look from <Picture 1>: head, face, skin, hair or fur, body shape and clothing stay stable in every frame, with no trace of the original subject's face, hair or clothing. The background, lighting, colors and camera of the guide video are preserved. Prevent identity drift, clothing changes, texture crawling and flicker.";

export const defaultCharacterSwapSettings = (): CharacterSwapSettings => ({
    enableBirefnet: true,
    model: 'h3ErosMax_beta5_fp8.safetensors',
    clip: 'minimaxH3_h3Comfy_nvfp4.safetensors',
    videoVae: 'minimax_h3_video_vae_int8_convrot.safetensors',
    audioVae: 'minimax_h3_audio_vae_fp32.safetensors',
    vlmClip: 'qwen3.5_9b_int8_convrot.safetensors',
    characterLora: 'H3\\minimax_h3_character_swap_v1.1_ref2va_fro.safetensors',
    turboLora: 'H3\\minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors',
    upscaleLora: 'H3\\minimax_h3_lms_v1.0_r64.safetensors',
    characterLoraStrength: 1, turboLoraStrength: 1, upscaleLoraStrength: 1,
    seed: 12347, steps: 4, cfg: 1, sampler: 'euler', shiftVideo: 12, shiftAudio: 3,
    attention: 'comfy kitchen attention', denoise: 1, prompt: '',
    secondPass: false, secondPassSteps: 4, secondPassDenoise: 0.35,
    upscaleModel: 'minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors',
    upscaleDevice: 'cuda', upscalePrecision: 'bf16',
    comparison: true, comparisonHeight: 1024, crossfade: 4,
    filenamePrefix: 'bfs_shot_loop', mp4Crf: 0,
});

const numberSetting = (name: string, value: number, min: number, max: number, integer = false): void => {
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
        throw new Error(`Character swap: invalid ${name} (${min}–${max}${integer ? ', integer' : ''}).`);
    }
};

/**
 * The host owns native planner segmentation, recursive/free mode and output storage.
 * BFS caches are per source video, not per project: mark affected shots redo when model/settings change.
 * Join writes full-quality MP4s; 751 displays its file path, never re-encodes its RAM-budgeted IMAGE output.
 */
export const buildCharacterSwapWorkflow = (plan: Record<string, unknown>, settings: CharacterSwapSettings): H3Workflow => {
    if (!isRecord(plan) || typeof plan.video !== 'string' || !plan.video.trim()) {
        throw new Error('Character swap requires a source video in plan.video.');
    }
    for (const key of ['model', 'clip', 'videoVae', 'audioVae', 'vlmClip', 'characterLora', 'turboLora'] as const) {
        if (typeof settings[key] !== 'string' || !settings[key].trim()) throw new Error(`Character swap requires ${key}; no model fallback is performed.`);
    }
    numberSetting('seed', settings.seed, 0, Number.MAX_SAFE_INTEGER, true);
    numberSetting('steps', settings.steps, 1, 10000, true);
    numberSetting('cfg', settings.cfg, 0, 100);
    numberSetting('video sigma shift', settings.shiftVideo, 0, 1000);
    numberSetting('audio sigma shift', settings.shiftAudio, 0, 1000);
    const denoise = settings.denoise ?? 1;
    numberSetting('denoise', denoise, 0, 1);
    numberSetting('character LoRA strength', settings.characterLoraStrength, -100, 100);
    numberSetting('turbo LoRA strength', settings.turboLoraStrength, -100, 100);
    numberSetting('crossfade', settings.crossfade, 0, 24, true);
    numberSetting('comparison height', settings.comparisonHeight, 0, 4096, true);
    numberSetting('MP4 CRF', settings.mp4Crf, 0, 51, true);
    if (typeof settings.filenamePrefix !== 'string' || !settings.filenamePrefix.trim()) throw new Error('Character swap requires an output filename prefix.');
    if (typeof settings.sampler !== 'string' || !settings.sampler.trim()) throw new Error('Character swap requires a sampler.');
    if (typeof settings.attention !== 'string' || !settings.attention.trim()) throw new Error('Character swap requires an attention backend.');
    if (typeof settings.prompt !== 'string') throw new Error('Character swap prompt must be a string.');
    const prompt = settings.prompt.trim() ? settings.prompt
        : typeof plan.global_prompt === 'string' && plan.global_prompt.trim() ? plan.global_prompt : CHARACTER_SWAP_FALLBACK_PROMPT;
    const secondPass = isRecord(plan.second_pass) ? plan.second_pass : {};
    const enableSecondPass = secondPass.enabled === true;
    const nativePlan = { ...plan, global_prompt: prompt, second_pass: { ...secondPass, enabled: enableSecondPass } };
    const workflow: H3Workflow = {};
    const add = (id: string, class_type: string, inputs: H3Node['inputs']) => { workflow[id] = { class_type, inputs }; };
    add('1', 'CLIPLoader', { clip_name: settings.clip, type: 'minimax', device: 'default' });
    add('2', 'UNETLoader', { unet_name: settings.model, weight_dtype: 'default' });
    add('3', 'VAELoader', { vae_name: settings.videoVae });
    add('29', 'VAELoader', { vae_name: settings.audioVae });
    add('85', 'CLIPLoader', { clip_name: settings.vlmClip, type: 'minimax', device: 'default' });
    add('9', 'MiniMaxH3SigmaShift', { shift_video: settings.shiftVideo, shift_audio: settings.shiftAudio, model: ['2', 0] });
    add('58', 'ModelAttentionBackend', { attention: settings.attention, model: ['9', 0] });
    add('1267', 'LoraLoaderModelOnly', { lora_name: settings.characterLora, strength_model: settings.characterLoraStrength, model: ['58', 0] });
    add('64', 'LoraLoaderModelOnly', { lora_name: settings.turboLora, strength_model: settings.turboLoraStrength, model: ['1267', 0] });
    add('1151', 'PrimitiveStringMultiline', { value: prompt });
    add('1283', 'BFSShotPlanner', { plan: JSON.stringify(nativePlan), prompt: ['1151', 0], vlm: ['85', 0] });
    if (settings.enableBirefnet) {
        add('1037', 'BFSShotUnpack', { shot: ['1283', 0] });
        add('1022', 'BiRefNetRMBG', {
            model: 'BiRefNet-general', mask_blur: 0, mask_offset: 0, invert_output: false,
            refine_foreground: false, background: 'Color', background_color: '#808080', image: ['1037', 1],
        });
        add('1031', 'ResizeImageMaskNode', {
            resize_type: 'scale total pixels', 'resize_type.megapixels': 1, scale_method: 'lanczos', input: ['1022', 0],
        });
        add('1038', 'BFSShotRepack', { shot: ['1037', 10], ref_image: ['1031', 0] });
    }
    const shot = settings.enableBirefnet ? '1038' : '1283';
    add('1177', 'BFSShotH3ConditioningSimple', {
        guide_mode: 'aligned guide (Add Guide)', use_ref_2: false, ref_image_size: 'match',
        with_audio: true, inpaint: 'per shot (planner)', source_blur: 'off', source_blur_strength: 1,
        source_blur_segmenter: 'SAM 3.1', source_blur_effect: 'blur',
        shot: [shot, 0], clip: ['1', 0], vae: ['3', 0], audio_vae: ['29', 0], vlm: ['85', 0],
    });
    add('11', 'CFGGuider', { cfg: settings.cfg, model: ['64', 0], positive: ['1177', 0], negative: ['1177', 0] });
    add('13', 'RandomNoise', { noise_seed: settings.seed });
    add('15', 'KSamplerSelect', { sampler_name: settings.sampler });
    add('181', 'BasicScheduler', { scheduler: 'simple', steps: settings.steps, denoise, model: ['64', 0] });
    add('14', 'SamplerCustomAdvanced', {
        noise: ['13', 0], guider: ['11', 0], sampler: ['15', 0], sigmas: ['181', 0], latent_image: ['1177', 1],
    });
    if (enableSecondPass) {
        for (const key of ['upscaleLora', 'upscaleModel'] as const) {
            if (typeof settings[key] !== 'string' || !settings[key].trim()) throw new Error(`Character swap second pass requires ${key}; no model fallback is performed.`);
        }
        numberSetting('second pass steps', settings.secondPassSteps, 1, 10000, true);
        numberSetting('second pass denoise', settings.secondPassDenoise, 0.001, 1);
        numberSetting('upscale LoRA strength', settings.upscaleLoraStrength, -100, 100);
        add('1281', 'LoraLoaderModelOnly', { lora_name: settings.upscaleLora, strength_model: settings.upscaleLoraStrength, model: ['64', 0] });
        add('1284', 'MMH3LatentUpscaleWithModelParams', {
            model_name: settings.upscaleModel, width: ['1283', 11], height: ['1283', 12],
            device: settings.upscaleDevice, precision: settings.upscalePrecision,
        });
        add('1285', 'BasicScheduler', { scheduler: 'simple', steps: settings.secondPassSteps, denoise: settings.secondPassDenoise, model: ['1281', 0] });
        // This native H3 node performs learned video-latent upscale, preserves audio,
        // resizes aligned conditioning, then runs a real second diffusion sampler.
        add('1286', 'MMH3UltimateUpscale', {
            model: ['1281', 0], conditioning: ['1177', 0], negative: ['1177', 0], latent: ['14', 1],
            noise: ['13', 0], sampler: ['15', 0], sigmas: ['1285', 0], cfg: settings.cfg, latent_upscale_param: ['1284', 0],
        });
    }
    add('22', 'LTXVSeparateAVLatent', { av_latent: [enableSecondPass ? '1286' : '14', 0] });
    add('45', 'VAEDecode', { samples: ['22', 0], vae: ['3', 0] });
    add('1202', 'BFSShotJoin', {
        crossfade: settings.crossfade, comparison: settings.comparison, label: '', comparison_height: settings.comparisonHeight,
        edge_hardness: 0, match_colors: 0, match_region: 'around the subject (swap)', seamless_edges: true,
        paste_new_outline: true, comparison_mask: true, keep_colors: false, keep_colors_strength: 1,
        save_to: 'mp4 file (long videos, low memory)', filename_prefix: settings.filenamePrefix, mp4_crf: settings.mp4Crf,
        images: ['45', 0], shots: [shot, 0], audio: ['1283', 5], timeline: ['1283', 7],
    });
    // Join is NOT an OUTPUT_NODE on the installed backend. A STRING sink triggers
    // it without VHS re-encoding a potentially downscaled, full-video IMAGE batch.
    add('751', 'Display Any (rgthree)', { source: ['1202', 4] });
    return workflow;
};

export const validateCharacterSwapWorkflow = (workflow: H3Workflow, info: H3ObjectInfo): void => {
    validateMinimaxH3Readiness(workflow, info);
    const visiting = new Set<string>(), visited = new Set<string>();
    const walk = (id: string): void => {
        if (visiting.has(id)) throw new Error(`Character swap workflow has a cycle at node ${id}.`);
        if (visited.has(id)) return;
        const node = workflow[id];
        if (!node) throw new Error(`Character swap workflow references missing node ${id}.`);
        visiting.add(id);
        for (const [name, value] of Object.entries(node.inputs)) {
            if (!Array.isArray(value)) continue;
            if (value.length !== 2 || typeof value[0] !== 'string' || !Number.isInteger(value[1]) || Number(value[1]) < 0) {
                throw new Error(`Character swap: invalid link ${id}.${name}.`);
            }
            walk(value[0]);
            const upstream = workflow[value[0]];
            const upstreamInfo = info[upstream.class_type] as H3ObjectInfo[string] & { output?: string[] };
            if (upstreamInfo.output && Number(value[1]) >= upstreamInfo.output.length) throw new Error(`Character swap: invalid output ${value[0]}:${value[1]}.`);
            const schema = h3Input(info, node.class_type, name);
            const outputType = upstreamInfo.output?.[Number(value[1])];
            if (Array.isArray(schema) && typeof schema[0] === 'string' && outputType && schema[0] !== '*' && outputType !== '*'
                && !schema[0].startsWith('COMFY_') && !outputType.startsWith('COMFY_')
                && !schema[0].split(',').includes(outputType)) throw new Error(`Character swap: incompatible link ${id}.${name}: ${outputType} → ${schema[0]}.`);
        }
        for (const [name, schema] of Object.entries(info[node.class_type]?.input?.required ?? {})) {
            if (!(name in node.inputs)) throw new Error(`Character swap: ${node.class_type} is missing required input ${name}.`);
            if (!Array.isArray(schema) || schema[0] !== 'COMFY_DYNAMICCOMBO_V3' || !isRecord(schema[1])) continue;
            const options = schema[1].options;
            const selected = Array.isArray(options) ? options.find(option => isRecord(option) && option.key === node.inputs[name]) : undefined;
            if (!isRecord(selected)) throw new Error(`Character swap: invalid ${node.class_type}.${name}.`);
            const inputs = isRecord(selected.inputs) && isRecord(selected.inputs.required) ? selected.inputs.required : {};
            for (const field of Object.keys(inputs)) if (!(`${name}.${field}` in node.inputs)) throw new Error(`Character swap: missing ${node.class_type}.${name}.${field}.`);
        }
        visiting.delete(id);
        visited.add(id);
    };
    if (workflow['751']) walk('751');
    for (const id of Object.keys(workflow)) walk(id);
};
