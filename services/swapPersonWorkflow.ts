import { buildSwapAnythingWorkflow, defaultSwapAnythingOptions, type SwapAnythingOptions } from './swapAnythingWorkflow';

export const personSwapPresets = [
    { id: 'face-hair', label: 'Face + donor hair', destination: 'face', donor: 'face and hair' },
    { id: 'face', label: 'Face only', destination: 'face', donor: 'face' },
    { id: 'head', label: 'Full head', destination: 'head, face, and hair', donor: 'head, face, and hair' },
    { id: 'hair', label: 'Hair only', destination: 'hair', donor: 'hair' },
    { id: 'person', label: 'Whole person', destination: '', donor: '' },
    { id: 'outfit', label: 'Outfit only', destination: 'outfit', donor: 'outfit' },
] as const;

export const personSwapTargets = (presetId: string, destinationPerson: string, donorPerson: string) => {
    const preset = personSwapPresets.find(item => item.id === presetId);
    if (!preset) throw new Error('Select a person swap preset.');
    return {
        destinationTarget: preset.destination ? `${destinationPerson}'s ${preset.destination}` : destinationPerson,
        donorTarget: preset.donor ? `${donorPerson}'s ${preset.donor}` : donorPerson,
    };
};

export const defaultQuickSwapPersonOptions = (): SwapAnythingOptions => ({
    ...defaultSwapAnythingOptions(), ...personSwapTargets('face-hair', 'the woman', 'the woman'),
});

export const buildQuickSwapPersonPrompt = (options: SwapAnythingOptions): string => {
    const prompt = buildSwapAnythingWorkflow('destination.png', 'donor.png', options).positive.inputs.text as string;
    if (options.prompt?.trim()) return prompt;
    return `${prompt} Preserve the destination person's original head-to-body proportions and head size relative to the neck and shoulders in Picture 1. Fit the donor face and head to the destination anatomy and camera perspective, not to their apparent size or camera distance in Picture 2. Do not enlarge the head or shrink the body.`;
};

export interface LanPaintPersonOptions {
    unet: string;
    clip: string;
    vae: string;
    loraName: string;
    loraStrength: number;
    megapixels: number;
    seed: number;
    steps: number;
    cfg: number;
    guidance: number;
    sampler: string;
    scheduler: string;
    denoise: number;
    lanPaintSteps: number;
    promptMode: string;
    cacheEnabled: boolean;
    preserveDestinationStyle?: boolean;
    prompt: string;
}

export const defaultLanPaintPersonOptions = (): LanPaintPersonOptions => ({
    unet: 'flux2\\moodyDesireMixFlux2_v30_pruned_fp8.safetensors',
    clip: 'qwen38BFluxKlein9BTE_38b.safetensors', vae: 'flux2-vae.safetensors',
    loraName: 'FLUX2\\bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors', loraStrength: 1,
    megapixels: 2, seed: 782879205881587, steps: 4, cfg: 1, guidance: 4,
    sampler: 'euler', scheduler: 'simple', denoise: 1, lanPaintSteps: 2, promptMode: 'Image First', cacheEnabled: true, preserveDestinationStyle: false,
    prompt: 'head_swap: Use image 1 as the base image, preserving its environment, background, camera perspective, framing, exposure, contrast, and lighting. Remove the head from image 1 and seamlessly replace it with the head from image 2.\nMatch the original head size, face-to-body ratio, neck thickness, shoulder alignment, and camera distance so proportions remain natural and unchanged.\n\nAdapt the inserted head to the lighting of image 1 by matching light direction, intensity, softness, color temperature, shadows, and highlights, with no independent relighting.\nPreserve the identity of image 2, including hair texture, eye color, nose structure, facial proportions, and skin details.\nMatch the pose and expression from image 1, including head tilt, rotation, eye direction, gaze, micro-expressions, and lip position.\nEnsure seamless neck and jaw blending, consistent skin tone, realistic shadow contact, natural skin texture, and uniform sharpness.\nPhotorealistic, high quality, sharp details, 4K.',
});

export const buildLanPaintPersonPrompt = (options: LanPaintPersonOptions): string => {
    if (!options.preserveDestinationStyle) return options.prompt;
    const prompt = options.prompt.replace(/Photorealistic,\s*high quality,\s*sharp details,\s*4K\.?/gi, '').trimEnd();
    const style = 'Image 1 is the sole reference for visual style and capture quality; image 2 supplies identity only, not its style or finish. Match image 1\'s visual medium, effective detail, softness, grain, noise, color response, compression and blur across the face, hair and neck. If VHS artifacts are present, preserve its chroma bleed, analog noise and interlacing; do not introduce artifacts absent from image 1. Do not sharpen, beautify, modernize, restore or add detail beyond the destination. These style requirements take precedence over conflicting finish instructions above.';
    return prompt.endsWith(style) ? prompt : `${prompt}\n${style}`;
};

export const buildLanPaintPersonWorkflow = (destination: string, donor: string, options: LanPaintPersonOptions): Record<string, any> => {
    if (!Number.isFinite(options.megapixels) || options.megapixels < 0.25 || options.megapixels > 4
        || !Number.isSafeInteger(options.seed) || options.seed < 0
        || !Number.isInteger(options.steps) || options.steps < 1 || options.steps > 100
        || !Number.isFinite(options.cfg) || options.cfg < 0 || options.cfg > 20
        || !Number.isFinite(options.guidance) || options.guidance < 0 || options.guidance > 20
        || !Number.isFinite(options.denoise) || options.denoise < 0 || options.denoise > 1
        || !Number.isInteger(options.lanPaintSteps) || options.lanPaintSteps < 1 || options.lanPaintSteps > 100
        || !Number.isFinite(options.loraStrength) || options.loraStrength < 0 || options.loraStrength > 2) throw new Error('Invalid LanPaint settings or seed.');
    if (![options.unet, options.clip, options.vae, options.sampler, options.scheduler, options.promptMode, options.prompt].every(value => value.trim())) throw new Error('Complete the LanPaint model, sampling and prompt settings.');
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    const workflow: Record<string, any> = {
        '9': node('SaveImage', { filename_prefix: 'face_swap_bulk/Flux2_dev', images: ['104', 0] }),
        '100': node('FluxGuidance', { guidance: options.guidance, conditioning: ['118', 0] }),
        '102': node('VAELoader', { vae_name: options.vae }),
        '104': node('VAEDecode', { samples: ['156', 0], vae: ['102', 0] }),
        '107': node('CLIPTextEncode', { text: buildLanPaintPersonPrompt(options), clip: ['146', 0] }),
        '112': node('ReferenceLatent', { conditioning: ['107', 0], latent: ['150', 0] }),
        '115': node('ImageScaleToTotalPixels', { upscale_method: 'lanczos', megapixels: ['135', 0], resolution_steps: 1, image: ['164', 0] }),
        '118': node('ReferenceLatent', { conditioning: ['112', 0], latent: ['119', 0] }),
        '119': node('VAEEncode', { pixels: ['120', 0], vae: ['102', 0] }),
        '120': node('ImageScaleToTotalPixels', { upscale_method: 'lanczos', megapixels: ['135', 0], resolution_steps: 1, image: ['121', 0] }),
        '121': node('LoadImage', { image: donor }),
        '125': node('VAEEncode', { pixels: ['115', 0], vae: ['102', 0] }),
        '126': options.unet.toLowerCase().endsWith('.gguf') ? node('UnetLoaderGGUF', { unet_name: options.unet }) : node('UNETLoader', { unet_name: options.unet, weight_dtype: 'default' }),
        '135': node('PrimitiveFloat', { value: options.megapixels }),
        '136': node('ConditioningZeroOut', { conditioning: ['107', 0] }),
        '146': node('CLIPLoader', { clip_name: options.clip, type: 'flux2', device: 'default' }),
        '147': node('VAEDecode', { samples: ['125', 0], vae: ['102', 0] }),
        '148': node('GetImageSize', { image: ['147', 0] }),
        '149': node('ImageScale', { upscale_method: 'lanczos', width: ['148', 0], height: ['148', 1], crop: 'center', image: ['164', 0] }),
        '150': node('VAEEncode', { pixels: ['149', 0], vae: ['102', 0] }),
        '156': node('LanPaint_KSampler', {
            seed: options.seed, steps: options.steps, cfg: options.cfg, sampler_name: options.sampler, scheduler: options.scheduler, denoise: options.denoise,
            LanPaint_NumSteps: options.lanPaintSteps, LanPaint_PromptMode: options.promptMode,
            LanPaint_Info: 'LanPaint KSampler. For more info, visit https://github.com/scraed/LanPaint. If you find it useful, please give a star \u2B50\uFE0F!',
            'More Info, Bug Report, Star on GitHub \u2B50': 'lanpaint_star_button',
            Inpainting_mode: '\uD83D\uDDBC\uFE0F Image Inpainting', model: ['126', 0], positive: ['100', 0], negative: ['136', 0], latent_image: ['163', 0],
        }),
        '163': node('EmptyFlux2LatentImage', { width: ['148', 0], height: ['148', 1], batch_size: 1 }),
        '164': node('LoadImage', { image: destination }),
    };
    if (options.loraName.trim()) {
        workflow['161'] = node('LoraLoaderModelOnly', { lora_name: options.loraName, strength_model: options.loraStrength, model: ['126', 0] });
        workflow['156'].inputs.model = ['161', 0];
    }
    if (options.cacheEnabled) {
        workflow['165'] = node('CacheDiT_Model_Optimizer', { enable: true, model_type: 'Flux', warmup_steps: 0, skip_interval: 0, print_summary: true, model: workflow['156'].inputs.model });
        workflow['156'].inputs.model = ['165', 0];
    }
    return workflow;
};

export const validateLanPaintPersonWorkflow = (workflow: Record<string, any>, info: any): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(name => !info?.[name]);
    if (missing.length) throw new Error(`LanPaint mode requires missing ComfyUI nodes: ${missing.join(', ')}. Install LanPaint (https://github.com/scraed/LanPaint) and the listed dependencies, then restart ComfyUI and reconnect.`);
    for (const node of Object.values(workflow)) {
        const inputs = { ...info[node.class_type].input?.required, ...info[node.class_type].input?.optional };
        for (const key of ['unet_name', 'clip_name', 'vae_name', 'lora_name', 'sampler_name', 'scheduler', 'LanPaint_PromptMode', 'Inpainting_mode']) {
            if (!(key in node.inputs)) continue;
            const choices = inputs[key]?.[0];
            if (!Array.isArray(choices) || !choices.includes(node.inputs[key])) throw new Error(`Unavailable ${node.class_type}.${key}: ${node.inputs[key]}. Check the installed models or update LanPaint.`);
        }
    }
};

export interface SwapPersonOptions extends SwapAnythingOptions {
    identityRegion?: 'head' | 'face';
    identityMaskGrow?: number;
    appearance: 'destination' | 'donor';
    outfit: 'destination' | 'donor';
    destinationStyle: string;
}

export const defaultSwapPersonOptions = (): SwapPersonOptions => ({
    destinationTarget: '', donorTarget: '', destinationStyle: '', appearance: 'destination', outfit: 'destination', identityRegion: 'head', identityMaskGrow: 0,
    unet: 'flux2\\flux2Klein9BInt8_v10.safetensors', clip: 'qwen38BFluxKlein9BTE_38b.safetensors', vae: 'flux2-vae.safetensors',
    samCheckpoint: 'sam3.1_multiplex_fp16.safetensors', megapixels: 1, donorMegapixels: 1.5,
    samThreshold: 0.5, samRefineIterations: 2, maskGrow: 8, steps: 4, cfg: 1, sampler: 'euler', seed: -1,
    lora1Name: '', lora1Strength: 1, lora2Name: '', lora2Strength: 1,
});

export const swapPersonRegion = (options: SwapPersonOptions): 'body' | 'head' | 'face' => {
    if (options.identityRegion !== undefined && !['head', 'face'].includes(options.identityRegion)) throw new Error('Invalid identity region.');
    return options.outfit === 'donor' ? 'body' : options.identityRegion || 'head';
};

export const buildSwapPersonPrompt = (options: SwapPersonOptions): string => {
    if (!['destination', 'donor'].includes(options.appearance) || !['destination', 'donor'].includes(options.outfit)) throw new Error('Invalid person replacement mode.');
    if (!options.destinationTarget.trim() || !options.donorTarget.trim()) throw new Error('Select a person in both images.');
    if (!options.destinationStyle.trim()) throw new Error('Analyze or describe the destination visual style.');
    const region = swapPersonRegion(options);
    return [
        region === 'body'
            ? 'Replace exactly the selected person in the marked region of Picture 1 with the person extracted from Picture 2. This is a person replacement, not a face blend or an additional person.'
            : region === 'head'
                ? 'Replace only the selected head, including hair, in Picture 1 with the head extracted from Picture 2. Keep the destination body, neck, outfit and pose unchanged. Fit the head to the original head position, scale and orientation.'
                : 'Replace only the selected face in Picture 1 with the face extracted from Picture 2. Preserve the destination hair, hairstyle, hairline, head outline, ears, neck, body and outfit. Fit the donor facial identity to the original face position and orientation. Do not transfer donor scalp hair.',
        `Take the donor identity from Picture 2: facial anatomy${region === 'face' ? '' : ', hair'} and recognizable personal features. Transfer body proportions and clothing only as specified below. Do not retain the replaced face or blend the two identities. Remove all green selection markings.`,
        region !== 'body' || options.appearance === 'destination'
            ? 'Fit the donor identity naturally to the destination person\'s existing body proportions and silhouette. Preserve the destination body pose, position and support contacts. Do not reinterpret the donor face to resemble the replaced person.'
            : 'Use the donor\'s visible body proportions and gender presentation as well as their identity. A different gender presentation is allowed: do not force the donor to match the replaced person. Adapt the donor anatomy naturally to the destination pose, position, scale and support contacts.',
        options.outfit === 'destination'
            ? 'Retain the destination person\'s original garments, colors, patterns and accessories, fitted naturally to the replacement. Do not copy the donor outfit.'
            : 'Use the visible donor outfit and accessories, adapted to the destination pose and lighting. Do not import the donor background or other people.',
        'Preserve the destination camera angle, framing, aspect ratio, occlusions, lighting direction, shadows, physical location, objects and every other person. The total number of people must not change.',
        'Picture 1 is the ONLY reference for visual medium and capture quality. Picture 2 is NOT a style, lighting, sharpness or camera reference.',
        `Destination capture observations (apply only when consistent with Picture 1): ${options.destinationStyle.trim()}`,
        'Render the replacement at the SAME effective resolution, softness, grain, noise, compression, color response, chroma bleed, motion blur and interlacing as its immediate surroundings in Picture 1. If Picture 1 is a VHS frame, the replacement must look recorded in that same VHS frame, not like a sharp modern portrait pasted on it. Match these artifacts across skin, hair, clothing and boundaries. If it is an illustration, preserve that illustration technique instead.',
        'Do not restore, beautify, sharpen, upscale, modernize, relight or clean up Picture 1. No studio finish, extra detail, smooth skin or crisp edges absent from the destination. Integrate the replacement into the same captured moment.',
    ].join('\n');
};

export const buildSwapPersonWorkflow = (
    destination: string, donor: string, destinationMask: string, donorMask: string, options: SwapPersonOptions,
): { workflow: Record<string, any>; prompt: string } => {
    if (!Number.isInteger(options.steps) || options.steps < 1 || options.steps > 40
        || !Number.isFinite(options.cfg) || options.cfg < 0.1 || options.cfg > 10
        || !Number.isFinite(options.megapixels) || options.megapixels < 0.25 || options.megapixels > 4
        || !Number.isFinite(options.donorMegapixels) || options.donorMegapixels < 0.25 || options.donorMegapixels > 4
        || !Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error('Invalid FLUX2 sampling settings or seed.');
    const prompt = buildSwapPersonPrompt(options);
    const workflow = buildSwapAnythingWorkflow(destination, donor, { ...options, prompt });
    for (const id of ['sam', 'destination_sam_prompt', 'destination_detect', 'donor_sam_prompt']) delete workflow[id];
    workflow.destination_mask_source = { class_type: 'LoadImage', inputs: { image: destinationMask } };
    workflow.destination_original_mask = { class_type: 'ImageToMask', inputs: { image: ['destination_mask_source', 0], channel: 'red' } };
    workflow.destination_mask_scale = { class_type: 'ImageScale', inputs: { image: ['destination_mask_source', 0], upscale_method: 'nearest-exact', width: ['destination_size', 0], height: ['destination_size', 1], crop: 'disabled' } };
    workflow.destination_mask = { class_type: 'ImageToMask', inputs: { image: ['destination_mask_scale', 0], channel: 'red' } };
    workflow.donor_mask_source = { class_type: 'LoadImage', inputs: { image: donorMask } };
    workflow.donor_detect = { class_type: 'ImageToMask', inputs: { image: ['donor_mask_source', 0], channel: 'red' } };
    workflow.donor_size = { class_type: 'GetImageSize', inputs: { image: ['donor', 0] } };
    workflow.donor_background = { class_type: 'EmptyImage', inputs: { width: ['donor_size', 0], height: ['donor_size', 1], batch_size: 1, color: 8421504 } };
    workflow.donor_isolated = { class_type: 'ImageCompositeMasked', inputs: { destination: ['donor_background', 0], source: ['donor', 0], mask: ['donor_detect', 0], x: 0, y: 0, resize_source: false } };
    workflow.donor_cut.inputs.image = ['donor_isolated', 0];
    workflow.masked_latent = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['output_latent', 0], mask: ['destination_mask', 0] } };
    workflow.sample.inputs.latent_image = ['masked_latent', 0];
    workflow.original_size = { class_type: 'GetImageSize', inputs: { image: ['destination', 0] } };
    workflow.result_scale = { class_type: 'ImageScale', inputs: { image: ['decode', 0], upscale_method: 'bicubic', width: ['original_size', 0], height: ['original_size', 1], crop: 'disabled' } };
    workflow.composite = { class_type: 'ImageCompositeMasked', inputs: { destination: ['destination', 0], source: ['result_scale', 0], mask: ['destination_original_mask', 0], x: 0, y: 0, resize_source: false } };
    workflow.save.inputs = { filename_prefix: 'Fun/Swap-a-Person', images: ['composite', 0] };
    return { workflow, prompt };
};