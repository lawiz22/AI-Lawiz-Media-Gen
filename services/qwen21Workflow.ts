export type Qwen21Mode = 't2i' | 'turbo';
export interface Qwen21Lora { name: string; enabled: boolean; modelStrength: number; clipStrength: number }
export interface Qwen21Settings {
    unet: string; clip: string; vae: string; prompt: string; negativePrompt: string;
    sizeIndex: number; orientation: 'landscape' | 'portrait'; loras: Qwen21Lora[];
    steps: number; cfg: number; sampler: string; scheduler: string; attention: string;
}
export const QWEN21_SIZES: Record<Qwen21Mode, readonly (readonly [number, number])[]> = {
    t2i: [[1024, 1024], [1152, 864], [1248, 832], [1376, 768], [1536, 1536]],
    turbo: [[1024, 1024], [1152, 864], [1248, 832], [1376, 768], [1920, 1088], [1536, 1536], [2560, 1440], [2048, 2048], [2400, 1792], [2528, 1696], [2752, 1536]],
};
export const defaultQwen21Settings = (mode: Qwen21Mode): Qwen21Settings => ({
    unet: 'qwen_image_2.1_int8_convrot.safetensors', clip: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors',
    prompt: '', negativePrompt: '', sizeIndex: 1, orientation: 'landscape', steps: mode === 'turbo' ? 6 : 25,
    cfg: 1, sampler: 'euler', scheduler: 'simple', attention: 'comfy kitchen attention',
    loras: Array.from({ length: 6 }, (_, index) => ({
        name: index === 0 ? mode === 'turbo' ? 'QWEN\\Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors' : 'qwen21\\p_qwen_image_2.1_8step_v0.1.safetensors'
            : index === 1 && mode === 'turbo' ? 'qwen21\\mvc5000_qwen21.safetensors' : '',
        enabled: mode === 'turbo' && index < 2, modelStrength: mode === 'turbo' && index === 1 ? 0.8 : 1, clipStrength: mode === 'turbo' && index === 1 ? 0.8 : 1,
    })),
});
export const qwen21Dimensions = (mode: Qwen21Mode, settings: Qwen21Settings): { width: number; height: number } => {
    const size = QWEN21_SIZES[mode][settings.sizeIndex];
    if (!Number.isInteger(settings.sizeIndex) || !size || !['landscape', 'portrait'].includes(settings.orientation)) throw new Error('Select a valid Qwen 2.1 size and orientation.');
    const [longSide, shortSide] = [Math.max(...size), Math.min(...size)];
    return settings.orientation === 'portrait' ? { width: shortSide, height: longSide } : { width: longSide, height: shortSide };
};
export const buildQwen21Workflow = (mode: Qwen21Mode, settings: Qwen21Settings, seed: number): Record<string, any> => {
    const { width, height } = qwen21Dimensions(mode, settings);
    if (!Number.isSafeInteger(seed) || seed < 0 || !settings.prompt.trim()) throw new Error('Enter a Qwen 2.1 prompt and a valid seed.');
    if (!Number.isInteger(settings.steps) || settings.steps < 1 || settings.steps > 100 || !Number.isFinite(settings.cfg) || settings.cfg < 0 || settings.cfg > 20) throw new Error('Invalid Qwen 2.1 sampling settings.');
    if (![settings.unet, settings.clip, settings.vae, settings.sampler, settings.scheduler, settings.attention].every(value => value.trim())) throw new Error('Complete Qwen 2.1 model and sampling settings.');
    if (settings.loras.length > 6 || settings.loras.some(lora => !Number.isFinite(lora.modelStrength) || !Number.isFinite(lora.clipStrength) || Math.abs(lora.modelStrength) > 10 || Math.abs(lora.clipStrength) > 10 || (lora.enabled && !lora.name.trim()))) throw new Error('Select up to six valid Qwen 2.1 LoRAs.');
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    const workflow: Record<string, any> = {
        '1': node('UNETLoader', { unet_name: settings.unet, weight_dtype: 'default' }),
        '2': node('CLIPLoader', { clip_name: settings.clip, type: 'qwen_image', device: 'default' }),
        '3': node('VAELoader', { vae_name: settings.vae }),
        '4': node('PixaromaSizes', { SizesState: JSON.stringify({ version: 1, sizes: QWEN21_SIZES[mode], selected: settings.sizeIndex, orientation: settings.orientation, snap: 32, accent: null, collapsed: false,
            starred: mode === 'turbo' ? ['2048x2048', '1792x2400', '1696x2528', '1536x2752'] : [], w: width, h: height }) }),
        '5': node('PixaromaPrompt', { PromptState: JSON.stringify({ text: settings.prompt, order: 'mine', sep: ', ' }) }),
        '6': node('PixaromaSeed', { SeedState: JSON.stringify({ runSeed: seed }), seed }),
        '7': node('TextEncodeQwenImage21', { prompt: ['5', 0], negative_prompt: settings.negativePrompt, resolution: 1024, clip: ['2', 0] }),
        '8': node('EmptyLatentImage', { width: ['4', 0], height: ['4', 1], batch_size: 1 }),
        '10': node('VAEDecode', { samples: [mode === 'turbo' ? '25' : '9', 0], vae: ['3', 0] }),
        '11': node('PixaromaPreview', { filename_prefix: 'img', save_mode: 'save', pixaroma_buttons: null, pixaroma_strip: null, image: ['10', 0], CivitaiMeta: '0' }),
        '17': node('ModelAttentionBackend', { attention: settings.attention, model: [mode === 'turbo' ? '19' : '18', 0] }),
        '18': node('PixaromaLoraLoader', { model: ['1', 0], LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: settings.loras.filter(lora => lora.name.trim()).map(lora => ({ name: lora.name, on: lora.enabled, sm: lora.modelStrength, sc: lora.clipStrength, triggers: [] })) }) }),
    };
    if (mode === 't2i') {
        workflow['9'] = node('KSampler', { seed: ['6', 0], steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler, denoise: 1,
            model: ['17', 0], positive: ['7', 0], negative: ['7', 1], latent_image: ['8', 0] });
    } else {
        workflow['19'] = node('ModelSamplingFlux', { max_shift: 0.69, base_shift: 0.5, width: ['4', 0], height: ['4', 1], model: ['18', 0] });
        workflow['20'] = node('RandomNoise', { noise_seed: ['6', 0] });
        workflow['21'] = node('KSamplerSelect', { sampler_name: settings.sampler });
        workflow['22'] = node('BasicScheduler', { scheduler: settings.scheduler, steps: settings.steps, denoise: 1, model: ['17', 0] });
        workflow['23'] = node('ExtendIntermediateSigmas', { steps: 3, start_at_sigma: -1, end_at_sigma: 0.95, spacing: 'linear', sigmas: ['22', 0] });
        workflow['24'] = node('BasicGuider', { model: ['17', 0], conditioning: ['7', 0] });
        workflow['25'] = node('SamplerCustomAdvanced', { noise: ['20', 0], guider: ['24', 0], sampler: ['21', 0], sigmas: ['23', 0], latent_image: ['8', 0] });
    }
    return workflow;
};
export const setQwen21WorkflowSeed = (workflow: Record<string, any>, seed: number): void => {
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Enter a valid Qwen 2.1 seed.');
    workflow['6'].inputs.seed = seed;
    workflow['6'].inputs.SeedState = JSON.stringify({ runSeed: seed });
};
export const getQwen21Choices = (info: any, node: string, input: string): string[] => {
    const widget = info?.[node]?.input?.required?.[input] || info?.[node]?.input?.optional?.[input];
    const choices = Array.isArray(widget?.[0]) ? widget[0] : widget?.[1]?.options;
    return Array.isArray(choices) ? choices.filter((value): value is string => typeof value === 'string') : [];
};
export const validateQwen21Readiness = (workflow: Record<string, any>, info: any, loraNodeId: string | null = '18'): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(name => !info?.[name]);
    if (missing.length) throw new Error(`Qwen Image 2.1 requires missing nodes: ${missing.join(', ')}. Update ComfyUI and install/update Pixaroma, then restart and reconnect.`);
    for (const node of Object.values(workflow)) for (const key of ['unet_name', 'clip_name', 'vae_name', 'attention', 'sampler_name', 'scheduler']) {
        if (typeof node.inputs[key] !== 'string') continue;
        if (!getQwen21Choices(info, node.class_type, key).includes(node.inputs[key])) throw new Error(`Unavailable ${node.class_type}.${key}: ${node.inputs[key]}`);
    }
    const loras = loraNodeId === null ? [] : JSON.parse(workflow[loraNodeId].inputs.LoraLoaderState).loras.filter((lora: any) => lora.on);
    if (loras.length) {
        const choices = [...getQwen21Choices(info, 'LoraLoaderModelOnly', 'lora_name'), ...getQwen21Choices(info, 'LoraLoader', 'lora_name')];
        for (const lora of loras) if (!choices.includes(lora.name)) throw new Error(`Unavailable Qwen 2.1 LoRA: ${lora.name}`);
    }
};

export const QWEN21_OUTPAINT_PROMPT = 'Outpaint the image: replace the solid gray areas with a seamless continuation of the scene, keeping the existing picture unchanged.';
export const QWEN21_OUTPAINT_RATIOS = ['1:1', '4:5', '3:2', '16:9', '9:16'];
export interface OutpaintLayout {
    top: number; bottom: number; left: number; right: number;
    canvasWidth: number; canvasHeight: number; renderWidth: number; renderHeight: number;
    axis: 'horizontal' | 'vertical' | null;
}
export interface Qwen21OutpaintOptions {
    unet: string; clip: string; vae: string; attention: string;
    mode: 'ratio' | 'sides'; ratio: string; anchor: string;
    top: number; bottom: number; left: number; right: number; limit: number;
    scene: string; seed: number; steps: number; cfg: number; sampler: string; scheduler: string;
    cacheDevice: string; cacheDtype: string; feather: number; colorMatch: number;
    outpaintLora: Qwen21Lora; extraLora: Qwen21Lora;
}
export const defaultQwen21OutpaintOptions = (): Qwen21OutpaintOptions => ({
    unet: 'qwen_image_2.1_int8_convrot.safetensors', clip: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors', attention: 'comfy kitchen attention',
    mode: 'ratio', ratio: '16:9', anchor: 'centre', top: 0, bottom: 0, left: 0, right: 0, limit: 2,
    scene: '', seed: 6759736751771108, steps: 25, cfg: 1, sampler: 'euler', scheduler: 'simple',
    cacheDevice: 'auto', cacheDtype: 'default', feather: 32, colorMatch: 100,
    outpaintLora: { name: 'QWEN\\qwen-image-2.1-outpaint-v2.safetensors', enabled: true, modelStrength: 1, clipStrength: 1 },
    extraLora: { name: '', enabled: false, modelStrength: 1, clipStrength: 1 },
});
export const qwen21OutpaintPrompt = (options: Qwen21OutpaintOptions): string => QWEN21_OUTPAINT_PROMPT + (options.scene.trim() ? ` Scene: ${options.scene.trim()}` : '');
export const qwen21OutpaintLayout = (width: number, height: number, options: Qwen21OutpaintOptions): OutpaintLayout => {
    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384)) throw new Error('Outpaint source dimensions must be between 1 and 16384 pixels.');
    let { top, bottom, left, right } = options;
    let axis: OutpaintLayout['axis'] = null;
    if (options.mode === 'ratio') {
        if (!QWEN21_OUTPAINT_RATIOS.includes(options.ratio)) throw new Error('Select a valid outpaint ratio.');
        const [ratioWidth, ratioHeight] = options.ratio.split(':').map(Number);
        const ratio = ratioWidth / ratioHeight;
        top = bottom = left = right = 0;
        if (Math.abs(ratio - width / height) >= 1e-6) {
            axis = ratio > width / height ? 'horizontal' : 'vertical';
            const extra = Math.max(0, Math.floor((axis === 'horizontal' ? height * ratio : width / ratio) + 0.5) - (axis === 'horizontal' ? width : height));
            const near = ['left', 'top'].includes(options.anchor) ? extra : ['right', 'bottom'].includes(options.anchor) ? 0 : Math.floor(extra / 2);
            if (axis === 'horizontal') { left = near; right = extra - near; }
            else { top = near; bottom = extra - near; }
        }
    }
    const fit = (first: number, second: number, dimension: number): [number, number] => {
        const room = 16384 - dimension;
        const total = first + second;
        if (total <= room) return [first, second];
        const start = Math.floor(first * room / total);
        return [start, room - start];
    };
    [left, right] = fit(left, right, width);
    [top, bottom] = fit(top, bottom, height);
    const canvasWidth = width + left + right;
    const canvasHeight = height + top + bottom;
    const scale = options.limit ? Math.min(8, Math.sqrt(options.limit * 1024 * 1024 / (Math.max(8, canvasWidth) * Math.max(8, canvasHeight)))) : 1;
    const snap = (dimension: number) => Math.max(8, Math.min(16384, Math.floor(dimension / 32) * 32));
    return { top, bottom, left, right, canvasWidth, canvasHeight, axis,
        renderWidth: snap(options.limit ? Math.floor(Math.max(8, canvasWidth) * scale + 0.5) : canvasWidth),
        renderHeight: snap(options.limit ? Math.floor(Math.max(8, canvasHeight) * scale + 0.5) : canvasHeight) };
};
export const buildQwen21OutpaintWorkflow = (image: string, options: Qwen21OutpaintOptions): Record<string, any> => {
    if (!image.trim()) throw new Error('Choose an image to outpaint.');
    if (!Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error('Enter a valid outpaint seed.');
    if (!['ratio', 'sides'].includes(options.mode) || !QWEN21_OUTPAINT_RATIOS.includes(options.ratio) || !['centre', 'left', 'right', 'top', 'middle', 'bottom'].includes(options.anchor)) throw new Error('Invalid outpaint extension settings.');
    if (![options.unet, options.clip, options.vae, options.attention, options.sampler, options.scheduler, options.cacheDevice, options.cacheDtype].every(value => value.trim())) throw new Error('Complete the outpaint model and sampling settings.');
    if (![0, 1, 1.5, 2].includes(options.limit) || [options.top, options.bottom, options.left, options.right].some(value => !Number.isInteger(value) || value < 0 || value > 8192)) throw new Error('Invalid outpaint padding or megapixel limit.');
    if (!Number.isInteger(options.steps) || options.steps < 1 || options.steps > 100 || !Number.isFinite(options.cfg) || options.cfg < 0 || options.cfg > 20 || !Number.isInteger(options.feather) || options.feather < 0 || options.feather > 256 || !Number.isFinite(options.colorMatch) || options.colorMatch < 0 || options.colorMatch > 100) throw new Error('Invalid outpaint sampling or stitch settings.');
    const loras = [options.outpaintLora, options.extraLora];
    if (loras.some(lora => (lora.enabled && !lora.name.trim()) || !Number.isFinite(lora.modelStrength) || !Number.isFinite(lora.clipStrength) || Math.abs(lora.modelStrength) > 10 || Math.abs(lora.clipStrength) > 10)) throw new Error('Select valid outpaint LoRAs and strengths.');
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    return {
        '1': node('UNETLoader', { unet_name: options.unet, weight_dtype: 'default' }),
        '2': node('CLIPLoader', { clip_name: options.clip, type: 'qwen_image', device: 'default' }),
        '3': node('VAELoader', { vae_name: options.vae }),
        '4': node('QwenImage21Cache', { device: options.cacheDevice, dtype: options.cacheDtype, model: ['25', 0] }),
        '5': node('PixaromaLoadImageMini', { image, LoadImageMiniState: JSON.stringify({ version: 1, mode: 'off', max_mp: 1, longest_side: 1024, scale_factor: 1, fit_w: 1024, fit_h: 1024, cover_w: 1024, cover_h: 1024, ratio_preset: '1:1', ratio_w: 1, ratio_h: 1, ratio_action: 'crop', pad_color: '#808080', pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0, crop_anchor: 'center', crop_scale: true, snap: 0, resample: 'auto', allow_upscale: true, orig_name: image }) }),
        '7': node('PixaromaPrompt', { PromptState: JSON.stringify({ text: qwen21OutpaintPrompt(options), order: 'mine', sep: ', ' }) }),
        '8': node('PixaromaSeed', { SeedState: JSON.stringify({ runSeed: options.seed }), seed: options.seed }),
        '9': node('TextEncodeQwenImage21', { prompt: ['7', 0], negative_prompt: '', resolution: 0, clip: ['2', 0], 'images.image_1': ['22', 0], vae: ['3', 0] }),
        '10': node('KSampler', { seed: ['8', 0], steps: options.steps, cfg: options.cfg, sampler_name: options.sampler, scheduler: options.scheduler, denoise: 1, model: ['21', 0], positive: ['9', 0], negative: ['9', 1], latent_image: ['9', 2] }),
        '11': node('VAEDecode', { samples: ['10', 0], vae: ['3', 0] }),
        '12': node('PixaromaPreview', { filename_prefix: 'img', save_mode: 'save', pixaroma_buttons: null, pixaroma_strip: null, image: ['24', 0], CivitaiMeta: '0' }),
        '13': node('PixaromaCompare', { image1: ['26', 0], image2: ['24', 0] }),
        '14': node('PixaromaRunTimer', {}),
        '21': node('ModelAttentionBackend', { attention: options.attention, model: ['4', 0] }),
        '22': node('PixaromaOutpaint', { image: ['5', 0], OutpaintState: JSON.stringify({ version: 1, mode: options.mode, ratio: options.ratio, anchor: options.anchor, top: options.top, bottom: options.bottom, left: options.left, right: options.right, limit: options.limit, color: '#808080', snap: 32, collapsed: false }) }),
        '23': node('SplitImageWithAlpha', { image: ['11', 0] }),
        '24': node('PixaromaOutpaintStitch', { feather: options.feather, color_match: options.colorMatch, image: ['23', 0], outpaint_info: ['22', 3] }),
        '25': node('PixaromaLoraLoader', { model: ['1', 0], LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: loras.filter(lora => lora.name.trim()).map(lora => ({ name: lora.name, on: lora.enabled, sm: lora.modelStrength, sc: lora.clipStrength, triggers: [] })) }) }),
        '26': node('ImageScale', { upscale_method: 'lanczos', width: ['27', 0], height: ['27', 1], crop: 'disabled', image: ['22', 0] }),
        '27': node('GetImageSize', { image: ['24', 0] }),
    };
};
export const validateQwen21OutpaintReadiness = (workflow: Record<string, any>, info: any): void => {
    validateQwen21Readiness(workflow, info, '25');
    for (const key of ['device', 'dtype']) if (!getQwen21Choices(info, 'QwenImage21Cache', key).includes(workflow['4'].inputs[key])) throw new Error(`Unavailable QwenImage21Cache.${key}: ${workflow['4'].inputs[key]}`);
};

export const QWEN21_CHARACTER_SIZES = [[1248, 832], [1376, 768], [1728, 1152], [1920, 1088], [2560, 1440], [2528, 1696], [2752, 1536]] as const;
export interface Qwen21CharacterSheetOptions {
    unet: string; clip: string; vae: string; weightDtype: string; clipDevice: string;
    cacheDevice: string; cacheDtype: string; attention: string;
    sizeIndex: number; orientation: 'landscape' | 'portrait'; seed: number;
    steps: number; cfg: number; sampler: string; scheduler: string; denoise: number;
    negativePrompt: string; referenceResolution: number; referenceUpscale: string; resolutionSteps: number;
    texts: [string, string, string, string]; separator: 'newline' | 'comma' | 'space' | 'none' | 'custom'; customSeparator: string; skipEmpty: boolean;
}
export const defaultQwen21CharacterSheetOptions = (): Qwen21CharacterSheetOptions => ({
    unet: 'qwen_image_2.1_int8_convrot.safetensors', clip: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors',
    weightDtype: 'default', clipDevice: 'default', cacheDevice: 'auto', cacheDtype: 'default', attention: 'comfy kitchen attention',
    sizeIndex: 3, orientation: 'landscape', seed: 7568800134548917, steps: 25, cfg: 1, sampler: 'euler', scheduler: 'simple', denoise: 1,
    negativePrompt: '', referenceResolution: 0, referenceUpscale: 'nearest-exact', resolutionSteps: 32,
    texts: [
        'A character sheet of the character from <image1>, full body from head to feet, standing in a relaxed neutral pose, lit brightly and evenly.',
        'Three views side by side in one row, all at the same size, from left to right: front view facing the viewer, side view in profile facing right, back view seen from behind.',
        'Keep the same face, hairstyle, clothing, colors, proportions and art style as in <image1>.',
        'Plain solid white background.',
    ], separator: 'newline', customSeparator: '', skipEmpty: true,
});
export const qwen21CharacterDimensions = (options: Qwen21CharacterSheetOptions) => {
    const size = QWEN21_CHARACTER_SIZES[options.sizeIndex];
    if (!Number.isInteger(options.sizeIndex) || !size || !['landscape', 'portrait'].includes(options.orientation)) throw new Error('Select a valid Character Sheet size and orientation.');
    return options.orientation === 'portrait' ? { width: size[1], height: size[0] } : { width: size[0], height: size[1] };
};
export const qwen21CharacterPrompt = (options: Qwen21CharacterSheetOptions): string => (options.skipEmpty ? options.texts.filter(text => text.trim()) : options.texts).join(options.separator === 'custom' ? options.customSeparator : ({ newline: '\n', comma: ', ', space: ' ', none: '' })[options.separator]);
export const buildQwen21CharacterSheetWorkflow = (image: string, options: Qwen21CharacterSheetOptions): Record<string, any> => {
    const { width, height } = qwen21CharacterDimensions(options);
    if (!image.trim() || !Number.isSafeInteger(options.seed) || options.seed < 0) throw new Error('Choose a character image and a valid seed.');
    if (options.texts.length !== 4 || !options.texts.every(text => typeof text === 'string') || !qwen21CharacterPrompt(options).trim() || !['newline', 'comma', 'space', 'none', 'custom'].includes(options.separator)) throw new Error('Enter a valid Character Sheet prompt.');
    if (!Number.isInteger(options.steps) || options.steps < 1 || options.steps > 100 || !Number.isFinite(options.cfg) || options.cfg < 0 || options.cfg > 20 || !Number.isFinite(options.denoise) || options.denoise < 0 || options.denoise > 1) throw new Error('Invalid Character Sheet sampling settings.');
    if (!Number.isInteger(options.referenceResolution) || options.referenceResolution < 0 || options.referenceResolution > 4096 || !Number.isInteger(options.resolutionSteps) || options.resolutionSteps < 1 || options.resolutionSteps > 256) throw new Error('Invalid Character Sheet reference resolution.');
    if (![options.unet, options.clip, options.vae, options.weightDtype, options.clipDevice, options.cacheDevice, options.cacheDtype, options.attention, options.sampler, options.scheduler, options.referenceUpscale].every(value => value.trim())) throw new Error('Complete Character Sheet model and sampling settings.');
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    return {
        '1': node('UNETLoader', { unet_name: options.unet, weight_dtype: options.weightDtype }),
        '2': node('CLIPLoader', { clip_name: options.clip, type: 'qwen_image', device: options.clipDevice }),
        '3': node('VAELoader', { vae_name: options.vae }),
        '4': node('QwenImage21Cache', { device: options.cacheDevice, dtype: options.cacheDtype, model: ['1', 0] }),
        '5': node('PixaromaLoadImageMini', { image, LoadImageMiniState: JSON.stringify({ version: 1, mode: 'off', max_mp: 1, longest_side: 1024, scale_factor: 1, fit_w: 1024, fit_h: 1024, cover_w: 1024, cover_h: 1024, ratio_preset: '1:1', ratio_w: 1, ratio_h: 1, ratio_action: 'crop', pad_color: '#808080', pad_top: 0, pad_bottom: 0, pad_left: 0, pad_right: 0, crop_anchor: 'center', crop_scale: true, snap: 0, resample: 'auto', allow_upscale: true, orig_name: image }) }),
        '9': node('PixaromaSeed', { SeedState: JSON.stringify({ runSeed: options.seed }), seed: options.seed }),
        '10': node('TextEncodeQwenImage21', { prompt: ['27', 0], negative_prompt: options.negativePrompt, resolution: options.referenceResolution, clip: ['2', 0], 'images.image_1': ['19', 0], vae: ['3', 0] }),
        '11': node('KSampler', { seed: ['9', 0], steps: options.steps, cfg: options.cfg, sampler_name: options.sampler, scheduler: options.scheduler, denoise: options.denoise, model: ['26', 0], positive: ['10', 0], negative: ['10', 1], latent_image: ['20', 0] }),
        '12': node('VAEDecode', { samples: ['11', 0], vae: ['3', 0] }),
        '13': node('PixaromaPreview', { filename_prefix: 'img', save_mode: 'save', pixaroma_buttons: null, pixaroma_strip: null, image: ['12', 0], CivitaiMeta: '0' }),
        '15': node('PixaromaRunTimer', {}),
        '16': node('PixaromaSizes', { SizesState: JSON.stringify({ version: 1, sizes: QWEN21_CHARACTER_SIZES, selected: options.sizeIndex, orientation: options.orientation, snap: 32, accent: null, collapsed: false, starred: ['1696x2528', '1536x2752'], w: width, h: height }) }),
        '18': node('ImageScaleToTotalPixels', { upscale_method: options.referenceUpscale, megapixels: ['21', 0], resolution_steps: options.resolutionSteps, image: ['5', 0] }),
        '19': node('PixaromaResizeCrop', { width: ['28', 0], height: ['28', 1], image: ['5', 0] }),
        '20': node('EmptyLatentImage', { width: ['16', 0], height: ['16', 1], batch_size: 1 }),
        '21': node('ComfyMathExpression', { expression: 'a * b / (1024 * 1024)', 'values.a': ['16', 0], 'values.b': ['16', 1] }),
        '26': node('ModelAttentionBackend', { attention: options.attention, model: ['4', 0] }),
        '27': node('PixaromaTextJoinFour', { text_1: options.texts[0], text_2: options.texts[1], text_3: options.texts[2], text_4: options.texts[3], JoinState: JSON.stringify({ sep: options.separator, customSep: options.customSeparator, skipEmpty: options.skipEmpty }) }),
        '28': node('GetImageSize', { image: ['18', 0] }),
    };
};
export const validateQwen21CharacterReadiness = (workflow: Record<string, any>, info: any): void => {
    validateQwen21Readiness(workflow, info, null);
    for (const [id, keys] of [['1', ['weight_dtype']], ['2', ['device']], ['4', ['device', 'dtype']], ['18', ['upscale_method']]] as const) {
        for (const key of keys) if (!getQwen21Choices(info, workflow[id].class_type, key).includes(workflow[id].inputs[key])) throw new Error(`Unavailable ${workflow[id].class_type}.${key}: ${workflow[id].inputs[key]}`);
    }
};
export const characterSheetCropRects = (width: number, height: number, cuts: number[]) => {
    if (![width, height].every(value => Number.isInteger(value) && value > 0) || cuts.length > 7 || cuts.some((cut, index) => !Number.isFinite(cut) || cut <= (index ? cuts[index - 1] : 0) || cut >= 1)) throw new Error('Choose increasing view boundaries inside the sheet.');
    const edges = [0, ...cuts.map(cut => Math.round(width * cut)), width];
    if (edges.some((edge, index) => index > 0 && edge <= edges[index - 1])) throw new Error('A view must be at least one pixel wide.');
    return edges.slice(1).map((right, index) => ({ x: edges[index], y: 0, width: right - edges[index], height }));
};

export const QWEN21_REMOVE_BACKGROUND_PROMPT = 'Remove the background, and output a PNG image';
export type Qwen21RemoveBackgroundOptions = Omit<Qwen21CharacterSheetOptions, 'sizeIndex' | 'orientation' | 'texts' | 'separator' | 'customSeparator' | 'skipEmpty'> & { prompt: string; megapixels: number };
export const defaultQwen21RemoveBackgroundOptions = (): Qwen21RemoveBackgroundOptions => {
    const { sizeIndex, orientation, texts, separator, customSeparator, skipEmpty, ...common } = defaultQwen21CharacterSheetOptions();
    return { ...common, seed: 1275457835744847, prompt: QWEN21_REMOVE_BACKGROUND_PROMPT, megapixels: 1 };
};
export const buildQwen21RemoveBackgroundWorkflow = (image: string, options: Qwen21RemoveBackgroundOptions): Record<string, any> => {
    if (!options.prompt.trim()) throw new Error('Enter a Remove Background prompt.');
    if (!Number.isFinite(options.megapixels) || options.megapixels < 0.01 || options.megapixels > 16) throw new Error('Select an output size between 0.01 and 16 MP.');
    const base = buildQwen21CharacterSheetWorkflow(image, { ...defaultQwen21CharacterSheetOptions(), ...options });
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    return {
        ...Object.fromEntries(['1', '2', '3', '4', '5'].map(id => [id, base[id]])),
        '6': node('PixaromaDropdown', { DropdownState: JSON.stringify({ version: 1, type: 'float', value: String(options.megapixels) }) }),
        '7': node('PixaromaPrompt', { PromptState: JSON.stringify({ text: options.prompt, order: 'mine', sep: ', ' }) }),
        '8': node('PixaromaSeed', { SeedState: JSON.stringify({ runSeed: options.seed }), seed: options.seed }),
        '9': node('TextEncodeQwenImage21', { prompt: ['7', 0], negative_prompt: options.negativePrompt, resolution: options.referenceResolution, clip: ['2', 0], 'images.image_1': ['16', 0], vae: ['3', 0] }),
        '10': node('KSampler', { seed: ['8', 0], steps: options.steps, cfg: options.cfg, sampler_name: options.sampler, scheduler: options.scheduler, denoise: options.denoise, model: ['21', 0], positive: ['9', 0], negative: ['9', 1], latent_image: ['9', 2] }),
        '11': node('VAEDecode', { samples: ['10', 0], vae: ['3', 0] }),
        '12': node('PixaromaPreview', { filename_prefix: 'img', save_mode: 'save', pixaroma_buttons: null, pixaroma_strip: null, image: ['11', 0], CivitaiMeta: '0' }),
        '13': node('PixaromaCompare', { image1: ['16', 0], image2: ['11', 0] }),
        '14': node('PixaromaRunTimer', {}),
        '15': node('ImageScaleToTotalPixels', { upscale_method: options.referenceUpscale, megapixels: ['6', 0], resolution_steps: options.resolutionSteps, image: ['5', 0] }),
        '16': node('PixaromaResizeCrop', { width: ['22', 0], height: ['22', 1], image: ['5', 0] }),
        '21': node('ModelAttentionBackend', { attention: options.attention, model: ['4', 0] }),
        '22': node('GetImageSize', { image: ['15', 0] }),
    };
};
export const validateQwen21RemoveBackgroundReadiness = (workflow: Record<string, any>, info: any): void => {
    validateQwen21Readiness(workflow, info, null);
    for (const [id, keys] of [['1', ['weight_dtype']], ['2', ['device']], ['4', ['device', 'dtype']], ['15', ['upscale_method']]] as const) {
        for (const key of keys) if (!getQwen21Choices(info, workflow[id].class_type, key).includes(workflow[id].inputs[key])) throw new Error(`Unavailable ${workflow[id].class_type}.${key}: ${workflow[id].inputs[key]}`);
    }
};

export type Qwen21EditMode = 'consistency' | 'turbo';
export type Qwen21EditOptions = Qwen21RemoveBackgroundOptions & { lora: Qwen21Lora; extraLoras?: Qwen21Lora[]; maxShift: number; baseShift: number; intermediateSteps: number; startSigma: number; endSigma: number; spacing: string };
export const defaultQwen21EditOptions = (mode: Qwen21EditMode): Qwen21EditOptions => ({
    ...defaultQwen21RemoveBackgroundOptions(),
    seed: mode === 'turbo' ? 593536510562657 : 8748880931647526,
    prompt: mode === 'turbo' ? 'Turn this summer photo into a snowy winter evening. Cover the roof, the terrace, the wall tops and the plants with fresh snow, make the sky a deep evening blue, and add warm yellow light glowing in the window. ' : 'make her shirt red',
    steps: mode === 'turbo' ? 4 : 25,
    lora: { name: mode === 'turbo' ? 'QWEN\\Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors' : 'QWEN\\qwen-image-2.1-consistency.safetensors', enabled: true, modelStrength: 1, clipStrength: 1 },
    extraLoras: Array.from({ length: 4 }, () => ({ name: '', enabled: false, modelStrength: 1, clipStrength: 1 })),
    maxShift: 0.69, baseShift: 0.5, intermediateSteps: 3, startSigma: -1, endSigma: 0.95, spacing: 'linear',
});
export const buildQwen21EditWorkflow = (image: string, options: Qwen21EditOptions, mode: Qwen21EditMode): Record<string, any> => {
    const graph = buildQwen21RemoveBackgroundWorkflow(image, options);
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    const extras = options.extraLoras || [];
    if (extras.length > 4) throw new Error('Choose at most four additional edit LoRAs.');
    const loras = [options.lora, ...extras];
    for (const lora of loras) if (lora.enabled && (!lora.name.trim() || ![lora.modelStrength, lora.clipStrength].every(Number.isFinite))) throw new Error('Choose a valid edit LoRA and strengths.');
    graph['23'] = graph['22'];
    graph['16'].inputs.width = ['23', 0]; graph['16'].inputs.height = ['23', 1];
    graph['22'] = node('PixaromaLoraLoader', { model: ['1', 0], LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: loras.filter((lora, index) => index === 0 || lora.name.trim()).map(lora => ({ name: lora.name, on: lora.enabled, sm: lora.modelStrength, sc: lora.clipStrength, triggers: [] })) }) });
    graph['4'].inputs.model = [mode === 'turbo' ? '24' : '22', 0];
    if (mode === 'turbo') {
        delete graph['10'];
        graph['11'].inputs.samples = ['30', 0];
        graph['24'] = node('ModelSamplingFlux', { max_shift: options.maxShift, base_shift: options.baseShift, width: ['23', 0], height: ['23', 1], model: ['22', 0] });
        graph['25'] = node('RandomNoise', { noise_seed: ['8', 0] });
        graph['26'] = node('KSamplerSelect', { sampler_name: options.sampler });
        graph['27'] = node('BasicScheduler', { scheduler: options.scheduler, steps: options.steps, denoise: options.denoise, model: ['21', 0] });
        graph['28'] = node('ExtendIntermediateSigmas', { steps: options.intermediateSteps, start_at_sigma: options.startSigma, end_at_sigma: options.endSigma, spacing: options.spacing, sigmas: ['27', 0] });
        graph['29'] = node('BasicGuider', { model: ['21', 0], conditioning: ['9', 0] });
        graph['30'] = node('SamplerCustomAdvanced', { noise: ['25', 0], guider: ['29', 0], sampler: ['26', 0], sigmas: ['28', 0], latent_image: ['9', 2] });
    }
    return graph;
};
export const validateQwen21EditReadiness = (graph: Record<string, any>, info: any): void => {
    validateQwen21RemoveBackgroundReadiness(graph, info);
    validateQwen21Readiness(graph, info, '22');
    if (graph['28'] && !getQwen21Choices(info, 'ExtendIntermediateSigmas', 'spacing').includes(graph['28'].inputs.spacing)) throw new Error('Unavailable ExtendIntermediateSigmas.spacing');
};

export const QWEN21_MULTI_SIZES = [[1024, 1024], [1152, 864], [1248, 832], [1376, 768], [1536, 1536], [2048, 2048], [2400, 1792], [2528, 1696], [2752, 1536]] as const;
export type Qwen21ReferenceRole = 'identity' | 'object' | 'background' | 'outfit' | 'pose' | 'style' | 'custom';
export interface Qwen21ReferenceInteraction { id: string; label: string; instruction: string }
export interface Qwen21MultiReference { role: Qwen21ReferenceRole; description: string; refinement: string; interactionId?: string; interactionChoices?: Qwen21ReferenceInteraction[] }
export const qwen21ReferenceInteractions = (reference: Qwen21MultiReference, index: number): Qwen21ReferenceInteraction[] => {
    if (index === 0) return [];
    const choices: Partial<Record<Qwen21ReferenceRole, [string, string, string][]>> = {
        object: [
            ['hold-one', 'Hold in one hand', 'MAIN_PERSON holds the object from REFERENCE_IMAGE naturally in one hand, with anatomically correct contact and realistic scale.'],
            ['hold-two', 'Hold with both hands', 'MAIN_PERSON holds the object from REFERENCE_IMAGE in both hands, with anatomically correct contact and realistic scale.'],
            ['present', 'Show the object to the camera', 'MAIN_PERSON presents the object from REFERENCE_IMAGE toward the camera, keeping their face visible.'],
            ['beside-object', 'Place the object beside the person', 'Place the object from REFERENCE_IMAGE beside MAIN_PERSON, at a realistic scale.'],
        ],
        outfit: [
            ['natural-fit', 'Wear / natural body fit', 'Dress MAIN_PERSON in the clothing from REFERENCE_IMAGE, tailoring its drape and fit to their existing body shape.'],
            ['fitted', 'Wear / fitted to body contours', 'Dress MAIN_PERSON in the clothing from REFERENCE_IMAGE fitted closely to their existing body contours, with believable fabric tension, seams and folds.'],
            ['relaxed-fit', 'Wear / relaxed fit', 'Dress MAIN_PERSON in the clothing from REFERENCE_IMAGE with a relaxed fit and realistic drape around their existing body shape.'],
        ],
        background: [
            ['stand-in-scene', 'Stand in the scene', 'Place MAIN_PERSON standing naturally within the environment from REFERENCE_IMAGE, grounded on a visible compatible floor or ground surface.'],
        ],
        identity: [
            ['beside', 'Side by side', 'Place the additional person from REFERENCE_IMAGE beside MAIN_PERSON, with both identities distinct.'],
            ['left', 'Additional person on the left', 'Place the additional person from REFERENCE_IMAGE to the left of MAIN_PERSON in the final image.'],
            ['right', 'Additional person on the right', 'Place the additional person from REFERENCE_IMAGE to the right of MAIN_PERSON in the final image.'],
            ['behind', 'Additional person slightly behind', 'Place the additional person from REFERENCE_IMAGE slightly behind MAIN_PERSON, keeping both faces visible.'],
            ['face-each-other', 'Face each other', 'MAIN_PERSON and the additional person from REFERENCE_IMAGE face each other naturally.'],
            ['hold-hands', 'Hold hands', 'MAIN_PERSON and the additional person from REFERENCE_IMAGE hold hands naturally, with anatomically correct hands and distinct bodies.'],
            ['side-hug', 'Friendly side hug', 'MAIN_PERSON and the additional person from REFERENCE_IMAGE share a friendly side hug, preserving both identities and distinct bodies.'],
        ],
    };
    return [...(choices[reference.role] || []).map(([id, label, instruction]) => ({ id, label, instruction })), ...(reference.interactionChoices || [])];
};
export type Qwen21MultiOptions = Omit<Qwen21CharacterSheetOptions, 'texts' | 'separator' | 'customSeparator' | 'skipEmpty'> & {
    prompt: string; instruction: string; manualPrompt: boolean; referenceCount: number; references: Qwen21MultiReference[]; loras: Qwen21Lora[];
    preserveSourceAspectRatio?: boolean;
    analysisProvider: 'gemini' | 'mammouth' | 'ollama'; geminiModel: string; mammouthModel: string; ollamaUrl: string; ollamaModel: string;
};
export const defaultQwen21MultiOptions = (): Qwen21MultiOptions => {
    const { texts, separator, customSeparator, skipEmpty, ...common } = defaultQwen21CharacterSheetOptions();
    return { ...common, sizeIndex: 0, orientation: 'portrait', seed: 7825849512900650, referenceResolution: 1024,
        prompt: 'Photo of the woman from <image1> sitting on the yellow chair in <image3> and holding the hand mixer  from <image2>, smiling at the camera. Keep the room from <image3> exactly the same with no changes. Keep the womain face, hair, exactly as in <image1>. Keep the hand mixer shape and green motif  exactly as in <image2>. Match the lighting, scale and perspective of the room for a realistic result.',
        instruction: '', manualPrompt: false, referenceCount: 3,
        references: (['identity', 'object', 'background', 'custom'] as const).map(role => ({ role, description: '', refinement: '' })),
        loras: Array.from({ length: 4 }, () => ({ name: '', enabled: false, modelStrength: 1, clipStrength: 1 })),
        analysisProvider: 'mammouth', geminiModel: 'gemini-2.5-flash', mammouthModel: '', ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: '',
    };
};
export const qwen21MultiDimensions = (options: Pick<Qwen21MultiOptions, 'sizeIndex' | 'orientation'>) => {
    const size = QWEN21_MULTI_SIZES[options.sizeIndex];
    if (!Number.isInteger(options.sizeIndex) || !size || !['landscape', 'portrait'].includes(options.orientation)) throw new Error('Select a valid multi-image size and orientation.');
    return options.orientation === 'portrait' ? { width: size[1], height: size[0] } : { width: size[0], height: size[1] };
};
export const qwen21MultiPrompt = (options: Qwen21MultiOptions): string => {
    const blend = options.references.slice(1, options.referenceCount).some(reference => reference.role === 'background') ? 'Blend the person into the background image seamlessly.' : '';
    if (options.manualPrompt) return blend && options.prompt.trim() && !options.prompt.toLowerCase().includes(blend.toLowerCase()) ? `${options.prompt.trimEnd()}\n${blend}` : options.prompt;
    const directions: Record<Qwen21ReferenceRole, string> = {
        identity: 'Include the additional person from TAG. Preserve their own face, hair and defining physical features separately from the main person in <image1>. Do not merge, swap or duplicate their identities.',
        object: 'Include the object from TAG. Preserve its shape, colors, material and visible details.',
        background: 'Use the environment from TAG as the scene. Preserve its layout and important background details.',
        outfit: 'Dress the main person from <image1> in the clothing from TAG. Preserve the garments, colors, fabrics and patterns, not the reference person identity. Fit the garments to the existing body shape and contours of the person from <image1>, with realistic drape, seams and folds; never reshape their body to fit the clothing.',
        pose: 'Use only the body pose from TAG, not its identity, clothing or background.',
        style: 'Use only the visual style from TAG, not its subject or composition.',
        custom: 'Use the specified elements from TAG.',
    };
    return ['Create one coherent image using the following references.', ...options.references.slice(0, options.referenceCount).map((reference, index) => {
        const tag = `<image${index + 1}>`;
        const direction = index === 0 ? 'The person from <image1> is the main person. Preserve their face, hair, defining physical features and existing body shape.' : directions[reference.role].replaceAll('TAG', tag);
        const interaction = qwen21ReferenceInteractions(reference, index).find(choice => choice.id === reference.interactionId);
        return [direction, reference.description.trim() ? `Visible reference details for ${tag}: ${reference.description.trim()}` : '', interaction ? interaction.instruction.replaceAll('MAIN_PERSON', 'the main person from <image1>').replaceAll('REFERENCE_IMAGE', tag) : '', reference.refinement.trim() ? `Instructions for ${tag}: ${reference.refinement.trim()}` : ''].filter(Boolean).join(' ');
    }), options.instruction.trim(), 'Match lighting, scale and perspective for a coherent result. Keep each reference role distinct.', blend].filter(Boolean).join('\n');
};
export const buildQwen21MultiWorkflow = (images: string[], options: Qwen21MultiOptions): Record<string, any> => {
    if (images.length < 1 || images.length > 4 || images.some(image => !image.trim())) throw new Error('Choose between one and four reference images.');
    const { width, height } = qwen21MultiDimensions(options);
    const base = buildQwen21CharacterSheetWorkflow(images[0], { ...defaultQwen21CharacterSheetOptions(), ...options, sizeIndex: 0 });
    if (!options.prompt.trim()) throw new Error('Enter a multi-image prompt.');
    if (options.loras.length > 4) throw new Error('Choose at most four multi-image LoRAs.');
    for (const lora of options.loras) if (lora.enabled && (!lora.name.trim() || ![lora.modelStrength, lora.clipStrength].every(Number.isFinite))) throw new Error('Choose a valid multi-image LoRA and strengths.');
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    const graph: Record<string, any> = {
        ...Object.fromEntries(['1', '2', '3', '4'].map(id => [id, base[id]])),
        '8': node('PixaromaPrompt', { PromptState: JSON.stringify({ text: options.prompt, order: 'mine', sep: ', ' }) }),
        '9': base['9'],
        '10': node('TextEncodeQwenImage21', { prompt: ['8', 0], negative_prompt: options.negativePrompt, resolution: options.referenceResolution, clip: ['2', 0], vae: ['3', 0] }),
        '11': node('KSampler', { seed: ['9', 0], steps: options.steps, cfg: options.cfg, sampler_name: options.sampler, scheduler: options.scheduler, denoise: options.denoise, model: ['23', 0], positive: ['10', 0], negative: ['10', 1], latent_image: ['18', 0] }),
        '12': base['12'], '13': base['13'], '15': base['15'],
        '17': node('PixaromaSizes', { SizesState: JSON.stringify({ version: 1, sizes: QWEN21_MULTI_SIZES, selected: options.sizeIndex, orientation: options.orientation, snap: 32, accent: null, collapsed: false, starred: ['2048x2048', '1792x2400', '1696x2528', '1536x2752'], w: width, h: height }) }),
        '18': node('EmptyLatentImage', { width: ['17', 0], height: ['17', 1], batch_size: 1 }),
        '23': node('ModelAttentionBackend', { attention: options.attention, model: ['4', 0] }),
    };
    images.forEach((image, index) => {
        const id = ['5', '6', '16', '24'][index];
        graph[id] = buildQwen21CharacterSheetWorkflow(image, { ...defaultQwen21CharacterSheetOptions(), seed: options.seed })['5'];
        graph['10'].inputs[`images.image_${index + 1}`] = [id, 0];
    });
    if (options.preserveSourceAspectRatio) {
        graph['34'] = node('ComfyMathExpression', { expression: 'a * b / (1024 * 1024)', 'values.a': ['17', 0], 'values.b': ['17', 1] });
        graph['35'] = node('ImageScaleToTotalPixels', { upscale_method: options.referenceUpscale, megapixels: ['34', 0], resolution_steps: options.resolutionSteps, image: ['5', 0] });
        graph['36'] = node('GetImageSize', { image: ['35', 0] });
        graph['37'] = node('GetImageSize', { image: ['5', 0] });
        graph['18'].inputs.width = ['36', 0];
        graph['18'].inputs.height = ['36', 1];
        // Undo only latent-grid rounding; the reference image is never cropped.
        graph['38'] = node('ImageScale', { image: ['12', 0], upscale_method: 'lanczos', width: ['37', 0], height: ['37', 1], crop: 'disabled' });
        graph['13'].inputs.image = ['38', 0];
    }
    if (options.loras.some(lora => lora.name.trim())) {
        graph['25'] = node('PixaromaLoraLoader', { model: ['1', 0], LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: options.loras.filter(lora => lora.name.trim()).map(lora => ({ name: lora.name, on: lora.enabled, sm: lora.modelStrength, sc: lora.clipStrength, triggers: [] })) }) });
        graph['4'].inputs.model = ['25', 0];
    }
    return graph;
};
export const buildQwen21CreateCharacterWorkflow = (images: string[], options: Qwen21MultiOptions, turbo = false): Record<string, any> => {
    if (!turbo) return buildQwen21MultiWorkflow(images, options);
    const native = defaultQwen21EditOptions('turbo');
    const graph = buildQwen21MultiWorkflow(images, { ...options, steps: native.steps, cfg: native.cfg, denoise: native.denoise, sampler: native.sampler, scheduler: native.scheduler, loras: options.loras.filter(lora => lora.name !== native.lora.name) });
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    graph['26'] = node('PixaromaLoraLoader', { model: graph['4'].inputs.model, LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: [{ name: native.lora.name, on: true, sm: native.lora.modelStrength, sc: native.lora.clipStrength, triggers: [] }] }) });
    graph['27'] = node('ModelSamplingFlux', { max_shift: native.maxShift, base_shift: native.baseShift, width: graph['18'].inputs.width, height: graph['18'].inputs.height, model: ['26', 0] });
    graph['4'].inputs.model = ['27', 0];
    graph['28'] = node('RandomNoise', { noise_seed: ['9', 0] });
    graph['29'] = node('KSamplerSelect', { sampler_name: native.sampler });
    graph['30'] = node('BasicScheduler', { scheduler: native.scheduler, steps: native.steps, denoise: native.denoise, model: ['23', 0] });
    graph['31'] = node('ExtendIntermediateSigmas', { steps: native.intermediateSteps, start_at_sigma: native.startSigma, end_at_sigma: native.endSigma, spacing: native.spacing, sigmas: ['30', 0] });
    graph['32'] = node('BasicGuider', { model: ['23', 0], conditioning: ['10', 0] });
    graph['33'] = node('SamplerCustomAdvanced', { noise: ['28', 0], guider: ['32', 0], sampler: ['29', 0], sigmas: ['31', 0], latent_image: ['18', 0] });
    graph['12'].inputs.samples = ['33', 0];
    delete graph['11'];
    return graph;
};
export const validateQwen21CreateCharacterReadiness = (graph: Record<string, any>, info: any): void => {
    validateQwen21MultiReadiness(graph, info);
    if (graph['26']) {
        validateQwen21Readiness(graph, info, '26');
        if (!getQwen21Choices(info, 'ExtendIntermediateSigmas', 'spacing').includes(graph['31'].inputs.spacing)) throw new Error('Unavailable ExtendIntermediateSigmas.spacing');
    }
};
export const validateQwen21MultiReadiness = (graph: Record<string, any>, info: any): void => {
    validateQwen21Readiness(graph, info, graph['25'] ? '25' : null);
    for (const [id, keys] of [['1', ['weight_dtype']], ['2', ['device']], ['4', ['device', 'dtype']]] as const) for (const key of keys) {
        if (!getQwen21Choices(info, graph[id].class_type, key).includes(graph[id].inputs[key])) throw new Error(`Unavailable ${graph[id].class_type}.${key}: ${graph[id].inputs[key]}`);
    }
    const inputs = info?.TextEncodeQwenImage21?.input;
    if (graph['35'] && !getQwen21Choices(info, 'ImageScaleToTotalPixels', 'upscale_method').includes(graph['35'].inputs.upscale_method)) throw new Error(`Unavailable ImageScaleToTotalPixels.upscale_method: ${graph['35'].inputs.upscale_method}`);
    if (graph['38']) for (const key of ['upscale_method', 'crop']) {
        if (!getQwen21Choices(info, 'ImageScale', key).includes(graph['38'].inputs[key])) throw new Error(`Unavailable ImageScale.${key}: ${graph['38'].inputs[key]}`);
    }
    const dynamicNames = (inputs?.required?.images || inputs?.optional?.images)?.[1]?.template?.names;
    if (graph['10'].inputs['images.image_4'] && !inputs?.optional?.['images.image_4'] && !inputs?.required?.['images.image_4'] && !dynamicNames?.includes('image_4')) throw new Error('Update ComfyUI: TextEncodeQwenImage21 must support images.image_4.');
};