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

const getCharacterResolution = (aspectRatio: string, megapixels: number) => {
    const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
    const ratio = ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 1;
    const totalPixels = Math.max(0.25, megapixels) * 1_000_000;
    return {
        width: Math.max(64, Math.round(Math.sqrt(totalPixels * ratio) / 16) * 16),
        height: Math.max(64, Math.round(Math.sqrt(totalPixels / ratio) / 16) * 16),
    };
};

const CHARACTER_IDENTITY_LOCK = [
    'Use the source person as an exact identity reference, not as inspiration.',
    'Keep the same facial anatomy and proportions: face shape, forehead, hairline, eyebrows, eye shape and spacing, nose shape, cheekbones, lips, jawline, chin, ears, skin tone, age, and distinctive marks.',
    'Do not beautify, idealize, average, redesign, or substitute the face, and do not change ethnicity, age, or gender presentation.',
    'A requested expression may move the facial muscles only; it must not alter the underlying facial structure or identity.',
].join(' ');

const buildSharedInstructions = (options: GenerationOptions): string => {
    const instructions = [CHARACTER_IDENTITY_LOCK, 'Preserve the body proportions and all other important visual details.'];

    if (options.clothing === 'original') instructions.push('Keep the original clothing unchanged.');
    else if (options.customClothingPrompt?.trim()) instructions.push(`Change the clothing to ${options.customClothingPrompt.trim()}.`);

    if (options.background === 'original') instructions.push('Keep the original background unchanged.');
    else if (options.background === 'black' || options.background === 'white' || options.background === 'gray' || options.background === 'green screen' || options.background === 'natural studio') {
        instructions.push(`Use a ${options.background} background.`);
    } else if (options.customBackground?.trim()) {
        instructions.push(`Change the background to ${options.customBackground.trim()}.`);
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
    const resolution = getCharacterResolution(options.aspectRatio || '1:1', options.comfyCharacterMegapixels ?? 1);
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
        'reference_scale': {
            inputs: {
                upscale_method: 'lanczos',
                megapixels: options.comfyCharacterMegapixels ?? 1,
                resolution_steps: 1,
                image: ['source', 1],
            },
            class_type: 'ImageScaleToTotalPixels',
            _meta: { title: 'Scale uncropped identity reference' },
        },
        'output_scale': {
            inputs: {
                upscale_method: 'lanczos',
                width: resolution.width,
                height: resolution.height,
                crop: 'center',
                image: ['source', 1],
            },
            class_type: 'ImageScale',
            _meta: { title: `Prepare ${options.aspectRatio || '1:1'} output canvas` },
        },
        'latent': {
            inputs: { pixels: ['output_scale', 0], vae: ['vae', 0] },
            class_type: 'VAEEncode',
            _meta: { title: 'Encode output canvas' },
        },
        'negative': {
            inputs: { prompt: '', clip: ['clip', 0], vae: ['vae', 0], image1: ['reference_scale', 0] },
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
            inputs: { prompt: prompts[index], clip: ['clip', 0], vae: ['vae', 0], image1: ['reference_scale', 0] },
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

interface Flux2CharacterReferences {
    source: string;
    clothing?: string;
    background?: string;
    pose?: string;
}

const buildFlux2CharacterPrompt = (
    options: GenerationOptions,
    angleId: string,
    references: Flux2CharacterReferences,
): string => {
    const angleSettings = {
        ...DEFAULT_CHARACTER_ANGLE_SETTINGS[angleId],
        ...options.comfyCharacterAngleSettings?.[angleId],
    };
    const angle = getCharacterInstructionValue(angleSettings.angle);
    const pose = getCharacterInstructionValue(angleSettings.pose);
    const expression = getCharacterInstructionValue(angleSettings.expression);
    const instructions = [
        'Using Picture 1 as the strict visual reference, create a new view of exactly one person: the same single subject shown in Picture 1.',
        'The final image must contain one person only, with one complete body, one head, and one face. Never duplicate, clone, merge, overlap, or fuse the subject with another person.',
        CHARACTER_IDENTITY_LOCK,
        'Preserve the exact body proportions, silhouette, hair, and distinctive details of the single subject.',
        references.clothing
            ? 'Use the clothing reference for the complete outfit, materials, colors, fit, accessories, and garment details.'
            : options.customClothingPrompt?.trim()
                ? `Dress the subject in ${options.customClothingPrompt.trim()}.`
                : 'Keep the original clothing unchanged.',
        references.background
            ? 'Place the subject in the background reference while matching its perspective, scale, lighting, and color.'
            : options.customBackground?.trim()
                ? `Use this background: ${options.customBackground.trim()}.`
                : options.background === 'original' || options.background === 'image'
                    ? 'Keep the original background.'
                    : `Use a ${options.background} background.`,
        references.pose
            ? 'Use the DWPose reference for body structure while applying the requested per-output camera angle and pose variation.'
            : '',
        angle ? `Camera angle: ${angle}.` : '',
        pose ? `Pose: ${pose}.` : '',
        expression ? `Facial expression: ${expression}.` : '',
        'Composition: show one clearly separated subject, centered in a single coherent photograph. Preserve identity and design consistency across the complete eight-view set. Produce a photorealistic, anatomically coherent result with no redesign, no extra people, no duplicate body parts, and no fused anatomy.',
    ];
    return instructions.filter(Boolean).join(' ');
};

export const buildFlux2CharacterAnglesWorkflow = (
    references: Flux2CharacterReferences,
    options: GenerationOptions,
): { workflow: Record<string, any>; prompts: string[]; seed: number } => {
    const enabledAngles = getEnabledCharacterAngles(options);
    if (enabledAngles.length === 0) throw new Error('Enable at least one character output before generating.');

    const seed = options.comfySeed ?? Math.floor(Math.random() * 1e15);
    const megapixels = options.comfyCharacterFlux2Megapixels ?? 1;
    const workflow: Record<string, any> = {
        source: { inputs: { image: references.source }, class_type: 'LoadImage', _meta: { title: 'Picture 1 - Subject' } },
        source_scale: { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image: ['source', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale subject reference' } },
        source_size: { inputs: { image: ['source_scale', 0] }, class_type: 'GetImageSize', _meta: { title: 'Subject output size' } },
        vae: { inputs: { vae_name: options.comfyCharacterFlux2Vae || 'flux2-vae.safetensors' }, class_type: 'VAELoader', _meta: { title: 'FLUX2 VAE' } },
        clip: { inputs: { clip_name: options.comfyCharacterFlux2Clip || 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, class_type: 'CLIPLoader', _meta: { title: 'FLUX2 CLIP' } },
        model: { inputs: { unet_name: options.comfyCharacterFlux2Unet || 'flux-2-klein-4b-Q4_K_M.gguf' }, class_type: 'UnetLoaderGGUF', _meta: { title: 'FLUX2 Klein model' } },
        source_latent: { inputs: { pixels: ['source_scale', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode subject reference' } },
    };

    let samplingModel: [string, number] = ['model', 0];
    if (options.comfyCharacterFlux2UseLoras) {
        const loras = [
            { name: options.comfyCharacterFlux2Lora1Name, strength: options.comfyCharacterFlux2Lora1Strength ?? 1 },
            { name: options.comfyCharacterFlux2Lora2Name, strength: options.comfyCharacterFlux2Lora2Strength ?? 1 },
        ];
        loras.forEach((lora, index) => {
            if (!lora.name?.trim()) return;
            const nodeId = `flux2_lora_${index + 1}`;
            workflow[nodeId] = {
                inputs: { lora_name: lora.name.trim(), strength_model: lora.strength, model: samplingModel },
                class_type: 'LoraLoaderModelOnly',
                _meta: { title: `FLUX2 Character LoRA ${index + 1}` },
            };
            samplingModel = [nodeId, 0];
        });
    }
    if (options.comfyCharacterFlux2UseCacheDit) {
        workflow.flux2_cache_dit = {
            inputs: {
                model: samplingModel,
                enable: true,
                model_type: options.comfyCharacterFlux2CacheDitModelType || 'Auto',
                warmup_steps: options.comfyCharacterFlux2CacheDitWarmupSteps ?? 3,
                skip_interval: options.comfyCharacterFlux2CacheDitSkipInterval ?? 2,
                print_summary: options.comfyCharacterFlux2CacheDitPrintSummary ?? true,
            },
            class_type: 'CacheDiT_Model_Optimizer',
            _meta: { title: 'FLUX2 Character CacheDiT' },
        };
        samplingModel = ['flux2_cache_dit', 0];
    }

    const referenceLatents: Array<[string, number]> = [['source_latent', 0]];
    const addImageReference = (id: string, imageName: string, title: string) => {
        workflow[`${id}_source`] = { inputs: { image: imageName }, class_type: 'LoadImage', _meta: { title } };
        workflow[`${id}_scale`] = { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image: [`${id}_source`, 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: `Scale ${title}` } };
        workflow[`${id}_latent`] = { inputs: { pixels: [`${id}_scale`, 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: `Encode ${title}` } };
        referenceLatents.push([`${id}_latent`, 0]);
    };

    if (references.clothing) addImageReference('clothing', references.clothing, 'Picture 2 - Clothing');
    if (references.background) addImageReference('background', references.background, 'Picture 3 - Background');
    if (references.pose) {
        workflow.pose_source = { inputs: { image: references.pose }, class_type: 'LoadImage', _meta: { title: 'Picture 4 - Pose' } };
        workflow.pose_dw = { inputs: { preprocessor: 'DWPreprocessor', resolution: 1024, image: ['pose_source', 0] }, class_type: 'AIO_Preprocessor', _meta: { title: 'DWPose structure' } };
        workflow.pose_scale = { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image: ['pose_dw', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale pose structure' } };
        workflow.pose_latent = { inputs: { pixels: ['pose_scale', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode pose structure' } };
        referenceLatents.push(['pose_latent', 0]);
    }

    const prompts = enabledAngles.map(({ id }) => buildFlux2CharacterPrompt(options, id, references));
    enabledAngles.forEach((angle, index) => {
        const prefix = `output_${index}`;
        workflow[`${prefix}_prompt`] = { inputs: { text: prompts[index], clip: ['clip', 0] }, class_type: 'CLIPTextEncode', _meta: { title: `Prompt ${angle.label}` } };
        workflow[`${prefix}_negative`] = { inputs: { conditioning: [`${prefix}_prompt`, 0] }, class_type: 'ConditioningZeroOut', _meta: { title: `Zero negative ${angle.label}` } };
        workflow[`${prefix}_negative_reference`] = { inputs: { conditioning: [`${prefix}_negative`, 0], latent: ['source_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: `${angle.label} negative subject reference` } };

        let positive: [string, number] = [`${prefix}_prompt`, 0];
        referenceLatents.forEach((latent, referenceIndex) => {
            const referenceId = `${prefix}_reference_${referenceIndex + 1}`;
            workflow[referenceId] = { inputs: { conditioning: positive, latent }, class_type: 'ReferenceLatent', _meta: { title: `${angle.label} reference ${referenceIndex + 1}` } };
            positive = [referenceId, 0];
        });

        workflow[`${prefix}_latent`] = { inputs: { width: ['source_size', 0], height: ['source_size', 1], batch_size: 1 }, class_type: 'EmptyFlux2LatentImage', _meta: { title: `Latent ${angle.label}` } };
        workflow[`${prefix}_noise`] = { inputs: { noise_seed: seed + index }, class_type: 'RandomNoise', _meta: { title: `Noise ${angle.label}` } };
        workflow[`${prefix}_sampler_select`] = { inputs: { sampler_name: options.comfyCharacterFlux2Sampler || 'euler' }, class_type: 'KSamplerSelect', _meta: { title: `Sampler ${angle.label}` } };
        workflow[`${prefix}_scheduler`] = { inputs: { steps: options.comfyCharacterFlux2Steps ?? 4, width: ['source_size', 0], height: ['source_size', 1] }, class_type: 'Flux2Scheduler', _meta: { title: `Schedule ${angle.label}` } };
        workflow[`${prefix}_guider`] = { inputs: { cfg: options.comfyCharacterFlux2Cfg ?? 1, model: samplingModel, positive, negative: [`${prefix}_negative_reference`, 0] }, class_type: 'CFGGuider', _meta: { title: `Guide ${angle.label}` } };
        workflow[`${prefix}_sample`] = { inputs: { noise: [`${prefix}_noise`, 0], guider: [`${prefix}_guider`, 0], sampler: [`${prefix}_sampler_select`, 0], sigmas: [`${prefix}_scheduler`, 0], latent_image: [`${prefix}_latent`, 0] }, class_type: 'SamplerCustomAdvanced', _meta: { title: `Sample ${angle.label}` } };
        workflow[`${prefix}_decode`] = { inputs: { samples: [`${prefix}_sample`, 0], vae: ['vae', 0] }, class_type: 'VAEDecode', _meta: { title: `Decode ${angle.label}` } };
        workflow[`save_${index}`] = { inputs: { filename_prefix: `Character/FLUX2/${angle.id}`, images: [`${prefix}_decode`, 0] }, class_type: 'SaveImage', _meta: { title: `Save Image - ${angle.label}` } };
    });

    return { workflow, prompts, seed };
};
