import { getQwen21Choices } from './qwen21Workflow';

export interface MossLora { name: string; enabled: boolean; strength: number }
export interface MossSettings {
    unet: string; weightDtype: string; clip: string; clipType: string; clipDevice: string; vae: string;
    negativePrompt: string; width: number; height: number; batchSize: number; filenamePrefix: string;
    loras: MossLora[]; doubleLayers: string; singleLayers: string; startPercent: number; endPercent: number;
    steps: number; cfg: number; sampler: string; scheduler: string; denoise: number; previewMethod: string; vaeDecode: string;
    refineImage?: boolean; refineDenoise?: number;
}
export interface MossSourceImage { name: string; width: number; height: number }
type MossNode = { class_type: string; inputs: Record<string, unknown> };
export type MossWorkflow = Record<string, MossNode>;
export type MossOrientation = 'portrait' | 'landscape' | 'square';
export const MOSS_RESOLUTIONS: Record<MossOrientation, readonly (readonly [number, number])[]> = {
    portrait: [[512, 768], [640, 960], [768, 1024], [768, 1152], [848, 1280], [960, 1280], [720, 1280]],
    landscape: [[768, 512], [960, 640], [1024, 768], [1152, 768], [1280, 848], [1280, 960], [1280, 720]],
    square: [[512, 512], [768, 768], [1024, 1024], [1280, 1280]],
};
export const mossOrientation = (width: number, height: number): MossOrientation => width === height ? 'square' : width > height ? 'landscape' : 'portrait';
export const mossOrientationSize = (orientation: MossOrientation, width: number, height: number): readonly [number, number] => {
    const long = Math.max(width, height), short = Math.min(width, height);
    const match = MOSS_RESOLUTIONS[orientation].find(([w, h]) => orientation === 'square' ? w === long : Math.max(w, h) === long && Math.min(w, h) === short);
    return match || (orientation === 'square' ? [1024, 1024] : orientation === 'portrait' ? [848, 1280] : [1280, 848]);
};
export const mossRefineDimensions = (width: number, height: number): { width: number; height: number } => {
    if (![width, height].every(value => Number.isSafeInteger(value) && value >= 16)) throw new Error('MOSS refinement requires a source image at least 16 pixels wide and high.');
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const result = { width: Math.floor(width * scale / 16) * 16, height: Math.floor(height * scale / 16) * 16 };
    if (result.width < 16 || result.height < 16) throw new Error('The source image is too narrow to align to 16 pixels within the MOSS 1280 px limit.');
    return result;
};

export const defaultMossSettings = (): MossSettings => ({
    unet: 'mossImageINT8INT6_mossImageINT8.safetensors', weightDtype: 'default',
    clip: 'qwen3.5_9b_int8_convrot.safetensors', clipType: 'moss_image', clipDevice: 'default', vae: 'flux2-vae.safetensors',
    negativePrompt: 'worst quality, bad anatomy, watermark, jpeg artifact, deformed hands, extra fingers, cartoon, cgi, animation, 3d render, plastic, children',
    width: 1280, height: 848, batchSize: 1, filenamePrefix: 'moss_image',
    loras: [
        { name: 'moss\\lora_latest_8step_moss.safetensors', enabled: false, strength: 0.7 },
        { name: 'moss\\MOSS_Image_SFT_8_steps_dmd_v0.1.safetensors', enabled: true, strength: 1 },
        { name: 'moss\\Kodachrome1970s_000002000.safetensors', enabled: true, strength: 1 },
        { name: 'moss\\grainscape_moss.safetensors', enabled: false, strength: 1 },
    ],
    doubleLayers: '', singleLayers: '22', startPercent: 0, endPercent: 0.5,
    steps: 10, cfg: 1.2, sampler: 'seeds_2', scheduler: 'beta57', denoise: 1, previewMethod: 'auto', vaeDecode: 'true',
    refineImage: false, refineDenoise: 0.5,
});

export const buildMossWorkflow = (settings: MossSettings, prompt: string, seed: number, source?: MossSourceImage): MossWorkflow => {
    const denoise = settings.refineImage ? settings.refineDenoise ?? 0.5 : settings.denoise;
    if (settings.refineImage && !source?.name.trim()) throw new Error('Choose a source image to refine with MOSS, or disable Refine Image.');
    if (!prompt.trim() || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Enter a MOSS prompt and a valid non-negative seed.');
    if (![settings.unet, settings.weightDtype, settings.clip, settings.clipType, settings.clipDevice, settings.vae, settings.filenamePrefix,
        settings.sampler, settings.scheduler, settings.previewMethod, settings.vaeDecode].every(value => value.trim())) throw new Error('Complete the MOSS model, sampling and output settings.');
    if ((!settings.refineImage && ![settings.width, settings.height].every(value => Number.isInteger(value) && value >= 16 && value <= 1280 && value % 16 === 0))
        || !Number.isInteger(settings.batchSize) || settings.batchSize < 1 || settings.batchSize > 64) throw new Error('Choose valid MOSS dimensions: multiples of 16, up to 1280 px per side. Batch size must be 1-64.');
    if (!Number.isInteger(settings.steps) || settings.steps < 1 || settings.steps > 10000
        || !Number.isFinite(settings.cfg) || settings.cfg < 0 || settings.cfg > 100
        || !Number.isFinite(denoise) || denoise < 0 || denoise > 1) throw new Error('Invalid MOSS sampling settings.');
    if (![settings.startPercent, settings.endPercent].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
        || settings.startPercent > settings.endPercent
        || ![settings.doubleLayers, settings.singleLayers].every(value => /^\s*(?:\d+(?:\s*,\s*\d+)*)?\s*$/.test(value))) throw new Error('MOSS SLG requires comma-separated layer numbers and an ordered range from 0 to 1.');
    if (settings.loras.some(lora => !Number.isFinite(lora.strength) || Math.abs(lora.strength) > 10 || (lora.enabled && !lora.name.trim()))) throw new Error('Select valid MOSS LoRAs with strengths between -10 and 10.');
    const node = (class_type: string, inputs: Record<string, unknown>): MossNode => ({ class_type, inputs });
    const loraInputs: Record<string, unknown> = {
        PowerLoraLoaderHeaderWidget: { type: 'PowerLoraLoaderHeaderWidget' }, model: ['19', 0],
    };
    settings.loras.forEach((lora, index) => {
        if (lora.name.trim()) loraInputs[`lora_${index + 1}`] = { on: lora.enabled, lora: lora.name, strength: lora.strength };
    });
    loraInputs['➕ Add Lora'] = '';
    const workflow: MossWorkflow = {
        '2': node('SkipLayerGuidanceDiTSimple', { double_layers: settings.doubleLayers, single_layers: settings.singleLayers, start_percent: settings.startPercent, end_percent: settings.endPercent, model: ['16', 0] }),
        '4': node('VAELoader', { vae_name: settings.vae }),
        '5': node('CLIPTextEncode', { text: prompt, clip: ['20', 0] }),
        '6': node('CLIPTextEncode', { text: settings.negativePrompt, clip: ['20', 0] }),
        '7': node('EmptyFlux2LatentImage', { width: settings.width, height: settings.height, batch_size: settings.batchSize }),
        '9': node('VAEDecode', { samples: ['18', 3], vae: ['4', 0] }),
        '10': node('SaveImage', { filename_prefix: settings.filenamePrefix, images: ['9', 0] }),
        '16': node('Power Lora Loader (rgthree)', loraInputs),
        '18': node('KSampler (Efficient)', { seed, steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler,
            denoise, preview_method: settings.previewMethod, vae_decode: settings.vaeDecode,
            model: ['2', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], optional_vae: ['4', 0] }),
        '19': node('UNETLoader', { unet_name: settings.unet, weight_dtype: settings.weightDtype }),
        '20': node('CLIPLoader', { clip_name: settings.clip, type: settings.clipType, device: settings.clipDevice }),
    };
    if (settings.refineImage && source) {
        const dimensions = mossRefineDimensions(source.width, source.height);
        workflow['moss_input'] = node('LoadImage', { image: source.name });
        workflow['moss_resize'] = node('ImageScale', { image: ['moss_input', 0], upscale_method: 'bicubic', ...dimensions, crop: 'disabled' });
        workflow['7'] = node('VAEEncode', { pixels: ['moss_resize', 0], vae: ['4', 0] });
        if (settings.batchSize > 1) {
            workflow['moss_batch'] = node('RepeatLatentBatch', { samples: ['7', 0], amount: settings.batchSize });
            workflow['18'].inputs.latent_image = ['moss_batch', 0];
        }
    }
    return workflow;
};

export const validateMossReadiness = (workflow: MossWorkflow, info: Parameters<typeof getQwen21Choices>[0]): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(name => !info?.[name]);
    if (missing.length) throw new Error(`MOSS requires missing nodes: ${missing.join(', ')}. Update ComfyUI and install the source workflow's custom nodes, then restart and reconnect.`);
    for (const node of Object.values(workflow)) {
        for (const key of ['unet_name', 'weight_dtype', 'clip_name', 'type', 'device', 'vae_name', 'sampler_name', 'scheduler', 'preview_method', 'vae_decode', 'upscale_method', 'crop']) {
            const value = node.inputs[key];
            if (typeof value === 'string' && !getQwen21Choices(info, node.class_type, key).includes(value)) throw new Error(`Unavailable MOSS ${node.class_type}.${key}: ${value}`);
        }
    }
    const availableLoras = [...getQwen21Choices(info, 'LoraLoaderModelOnly', 'lora_name'), ...getQwen21Choices(info, 'LoraLoader', 'lora_name')];
    for (const input of Object.values(workflow['16'].inputs)) {
        if (typeof input === 'object' && input !== null && 'on' in input && input.on && 'lora' in input && !availableLoras.includes(String(input.lora))) throw new Error(`Unavailable MOSS LoRA: ${input.lora}`);
    }
};

export const mossPreviewBlob = (data: ArrayBuffer): Blob | null => {
    if (data.byteLength <= 8) return null;
    const header = new DataView(data);
    if (header.getUint32(0) !== 1) return null;
    const format = header.getUint32(4);
    if (format !== 1 && format !== 2) return null;
    return new Blob([data.slice(8)], { type: format === 2 ? 'image/png' : 'image/jpeg' });
};
