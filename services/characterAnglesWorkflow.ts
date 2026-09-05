import type { GenerationOptions } from '../types';

export const CHARACTER_ANGLES = [
    { id: 'close_up', label: 'Close-up', instruction: 'Turn the camera to a close-up view.' },
    { id: 'wide_shot', label: 'Wide shot', instruction: 'Turn the camera to a wide-angle full-body view.' },
    { id: '45_right', label: '45° right', instruction: 'Rotate the camera 45 degrees to the right.' },
    { id: '90_right', label: '90° right', instruction: 'Rotate the camera 90 degrees to the right.' },
    { id: 'aerial_view', label: 'Aerial view', instruction: 'Turn the camera to an aerial view.' },
    { id: 'low_angle', label: 'Low angle', instruction: 'Turn the camera to a low-angle view.' },
    { id: '45_left', label: '45° left', instruction: 'Rotate the camera 45 degrees to the left.' },
    { id: '90_left', label: '90° left', instruction: 'Rotate the camera 90 degrees to the left.' },
] as const;

export const CHARACTER_NONE_VALUE = 'None (same as photo)';
export const CHARACTER_ANGLE_OPTIONS = [
    CHARACTER_NONE_VALUE, 'close-up', 'wide shot', 'front view', 'three-quarter view', '45 degrees right',
    '90 degrees right', 'aerial view', 'low angle', '45 degrees left', '90 degrees left', 'back view',
];
export const CHARACTER_POSE_OPTIONS = [
    CHARACTER_NONE_VALUE, 'standing naturally', 'arms relaxed along the body', 'T-pose', 'hands on hips',
    'hands on hips with legs apart', 'arms crossed', 'arms raised', 'sitting', 'walking', 'looking over the shoulder',
];
export const CHARACTER_EXPRESSION_OPTIONS = [
    CHARACTER_NONE_VALUE, 'neutral', 'happy', 'sad', 'angry', 'surprised', 'serious', 'confident',
    'relaxed', 'fearful', 'excited',
];

export const DEFAULT_CHARACTER_ANGLE_SETTINGS: Record<string, { enabled: boolean; angle: string; pose: string; expression: string }> = {
    close_up: { enabled: true, angle: 'close-up', pose: CHARACTER_NONE_VALUE, expression: 'neutral' },
    wide_shot: { enabled: true, angle: 'wide shot', pose: CHARACTER_NONE_VALUE, expression: 'angry' },
    '45_right': { enabled: true, angle: '45 degrees right', pose: 'T-pose', expression: CHARACTER_NONE_VALUE },
    '90_right': { enabled: true, angle: '90 degrees right', pose: 'arms relaxed along the body', expression: 'sad' },
    aerial_view: { enabled: true, angle: 'aerial view', pose: 'hands on hips with legs apart', expression: CHARACTER_NONE_VALUE },
    low_angle: { enabled: true, angle: 'low angle', pose: CHARACTER_NONE_VALUE, expression: 'surprised' },
    '45_left': { enabled: true, angle: '45 degrees left', pose: 'arms crossed', expression: 'serious' },
    '90_left': { enabled: true, angle: '90 degrees left', pose: 'arms raised', expression: CHARACTER_NONE_VALUE },
};

export const getEnabledCharacterAngles = (options: GenerationOptions) => CHARACTER_ANGLES.filter(({ id }) =>
    options.comfyCharacterAngleSettings?.[id]?.enabled !== false
);

const getCharacterInstructionValue = (value: string): string => {
    const trimmedValue = value.trim();
    return trimmedValue.toLowerCase() === 'none' || trimmedValue === CHARACTER_NONE_VALUE ? '' : trimmedValue;
};

const buildSharedInstructions = (options: GenerationOptions): string => {
    const instructions = ['Preserve the character identity, facial features, body proportions, and all important visual details.'];

    if (options.clothing === 'original') instructions.push('Keep the original clothing unchanged.');
    else if (options.customClothingPrompt?.trim()) instructions.push(`Change the clothing to ${options.customClothingPrompt.trim()}.`);

    if (options.background === 'original') instructions.push('Keep the original background unchanged.');
    else if (options.background === 'black' || options.background === 'white' || options.background === 'gray' || options.background === 'green screen' || options.background === 'natural studio') {
        instructions.push(`Use a ${options.background} background.`);
    } else if (options.customBackground?.trim()) {
        instructions.push(`Change the background to ${options.customBackground.trim()}.`);
    }

    if (options.imageStyle === 'photorealistic') {
        instructions.push(`Render as ${options.photoStyle}, ${options.eraStyle}.`);
    } else {
        instructions.push(`Render in ${options.imageStyle} style.`);
    }

    return instructions.join(' ');
};

export const buildCharacterAnglePrompts = (options: GenerationOptions): string[] => {
    const sharedInstructions = buildSharedInstructions(options);
    return getEnabledCharacterAngles(options).map(({ id }) => {
        const angleSettings = {
            ...DEFAULT_CHARACTER_ANGLE_SETTINGS[id],
            ...options.comfyCharacterAngleSettings?.[id],
        };
        const angle = getCharacterInstructionValue(angleSettings.angle);
        const pose = getCharacterInstructionValue(angleSettings.pose);
        const expression = getCharacterInstructionValue(angleSettings.expression);
        const angleInstruction = angle ? `Set the camera angle to ${angle}.` : '';
        const poseInstruction = pose ? `${pose}.` : '';
        const expressionInstruction = expression ? `Change their facial expression to ${expression}.` : '';
        return [angleInstruction, poseInstruction, expressionInstruction, sharedInstructions].filter(Boolean).join(' ');
    });
};

export const buildCharacterAnglesWorkflow = (
    uploadedImageName: string,
    options: GenerationOptions,
): { workflow: Record<string, any>; prompts: string[]; seed: number } => {
    const enabledAngles = getEnabledCharacterAngles(options);
    if (enabledAngles.length === 0) {
        throw new Error('Enable at least one character output before generating.');
    }
    const prompts = buildCharacterAnglePrompts(options);
    const seed = options.comfySeed ?? Math.floor(Math.random() * 1e15);
    const useAdditionalLora = !!options.comfyCharacterUseAdditionalLora && !!options.comfyCharacterAdditionalLora?.trim();
    const samplingModel = useAdditionalLora ? ['additional_lora', 0] : ['angles_lora', 0];
    const workflow: Record<string, any> = {
        'source': {
            inputs: { image: uploadedImageName, emoji_in_readable_text: false },
            class_type: 'SimpleReadableMetadataSG',
            _meta: { title: 'Character source image' },
        },
        'vae': {
            inputs: { vae_name: options.comfyCharacterVae || 'qwen_image_vae.safetensors' },
            class_type: 'VAELoader',
            _meta: { title: 'Character VAE' },
        },
        'clip': {
            inputs: { clip_name: options.comfyCharacterClip || 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' },
            class_type: 'CLIPLoader',
            _meta: { title: 'Character CLIP' },
        },
        'unet': {
            inputs: { unet_name: options.comfyCharacterUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', weight_dtype: 'default' },
            class_type: 'UNETLoader',
            _meta: { title: 'Character diffusion model' },
        },
        'lightning_lora': {
            inputs: {
                lora_name: options.comfyCharacterLightningLora || 'QWEN\\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors',
                strength_model: options.comfyCharacterLightningStrength ?? 1,
                model: ['unet', 0],
            },
            class_type: 'LoraLoaderModelOnly',
            _meta: { title: 'Qwen Edit Lightning LoRA' },
        },
        'angles_lora': {
            inputs: {
                lora_name: options.comfyCharacterAnglesLora || 'QWEN\\Qwen-Edit-2509-Multiple-angles.safetensors',
                strength_model: options.comfyCharacterAnglesStrength ?? 1,
                model: ['lightning_lora', 0],
            },
            class_type: 'LoraLoaderModelOnly',
            _meta: { title: 'Qwen Multiple Angles LoRA' },
        },
        'sampling': {
            inputs: { shift: options.comfyCharacterShift ?? 3, model: samplingModel },
            class_type: 'ModelSamplingAuraFlow',
            _meta: { title: 'Character sampling shift' },
        },
        'cfg_norm': {
            inputs: { strength: 1, pre_cfg: false, model: ['sampling', 0] },
            class_type: 'CFGNorm',
            _meta: { title: 'Character CFG normalization' },
        },
        'scale': {
            inputs: {
                upscale_method: 'nearest-exact',
                megapixels: options.comfyCharacterMegapixels ?? 1,
                resolution_steps: 1,
                image: ['source', 1],
            },
            class_type: 'ImageScaleToTotalPixels',
            _meta: { title: 'Scale character source' },
        },
        'latent': {
            inputs: { pixels: ['scale', 0], vae: ['vae', 0] },
            class_type: 'VAEEncode',
            _meta: { title: 'Encode character source' },
        },
        'negative': {
            inputs: { prompt: '', clip: ['clip', 0], vae: ['vae', 0], image1: ['scale', 0] },
            class_type: 'TextEncodeQwenImageEditPlus',
            _meta: { title: 'Character negative prompt' },
        },
    };

    if (useAdditionalLora) {
        workflow['additional_lora'] = {
            inputs: {
                lora_name: options.comfyCharacterAdditionalLora!.trim(),
                strength_model: options.comfyCharacterAdditionalLoraStrength ?? 1,
                model: ['angles_lora', 0],
            },
            class_type: 'LoraLoaderModelOnly',
            _meta: { title: 'Additional Character LoRA' },
        };
    }

    enabledAngles.forEach((angle, index) => {
        const positiveId = `positive_${index}`;
        const samplerId = `sampler_${index}`;
        const decodeId = `decode_${index}`;
        workflow[positiveId] = {
            inputs: { prompt: prompts[index], clip: ['clip', 0], vae: ['vae', 0], image1: ['scale', 0] },
            class_type: 'TextEncodeQwenImageEditPlus',
            _meta: { title: `Prompt ${angle.label}` },
        };
        workflow[samplerId] = {
            inputs: {
                seed: seed + index,
                steps: options.comfyCharacterSteps ?? 4,
                cfg: options.comfyCharacterCfg ?? 1,
                sampler_name: options.comfyCharacterSampler || 'euler',
                scheduler: options.comfyCharacterScheduler || 'simple',
                denoise: 1,
                model: ['cfg_norm', 0],
                positive: [positiveId, 0],
                negative: ['negative', 0],
                latent_image: ['latent', 0],
            },
            class_type: 'KSampler',
            _meta: { title: `KSampler ${angle.label}` },
        };
        workflow[decodeId] = {
            inputs: { samples: [samplerId, 0], vae: ['vae', 0] },
            class_type: 'VAEDecode',
            _meta: { title: `Decode ${angle.label}` },
        };
        workflow[`save_${index}`] = {
            inputs: { filename_prefix: `Character/${angle.id}`, images: [decodeId, 0] },
            class_type: 'SaveImage',
            _meta: { title: `Save Image - ${angle.label}` },
        };
    });

    return { workflow, prompts, seed };
};
