import type { Flux2ReferenceRole, GenerationOptions } from '../types';
import { appendGalleryStylePrompt, applyFlux2StyleScheduler, normalizeStyleModel, prependGalleryStyleTrigger, removeGalleryStyleTrigger, validateStyleGallery, type GalleryStyle } from './styleGallery';
import { inferFlux2Variant } from './civitaiService';

export const defaultFlux2Clip = (model: string, mode: 't2i' | 'i2i' = 'i2i'): string =>
    inferFlux2Variant(model) === 'flux2-4b'
        ? mode === 't2i' ? 'qwen3vl_4b_fp8_scaled.safetensors' : 'qwen_3_4b.safetensors'
        : 'qwen38BFluxKlein9BTE_38b.safetensors';

export const flux2StyleLoraRemovals = (options: GenerationOptions, loras: string[], mode: 't2i' | 'i2i'): Partial<GenerationOptions> => {
    const normalize = (name: string) => name.trim().replace(/\\/g, '/').toLowerCase();
    const managed = new Set(loras.filter(Boolean).map(normalize));
    const patch: Partial<GenerationOptions> = {};
    for (let index = 1; index <= (mode === 't2i' ? 6 : 2); index++) {
        const key = `${mode === 't2i' ? 'comfyFlux2' : 'comfyFlux2Edit'}Lora${index}Name` as keyof GenerationOptions;
        const name = options[key];
        if (typeof name === 'string' && managed.has(normalize(name))) Object.assign(patch, { [key]: '' });
    }
    return patch;
};

export const flux2StyleOptions = (options: GenerationOptions, style?: GalleryStyle, mode: 'i2i' | 't2i' = 'i2i'): GenerationOptions => {
    if (!style) return options;
    validateStyleGallery({ version: 1, styles: [style] });
    const model = inferFlux2Variant((mode === 't2i' ? options.comfyFlux2Unet : options.comfyFlux2EditUnet) || 'flux2\\flux2Klein9BInt8_v10.safetensors')?.toUpperCase();
    if (!model || normalizeStyleModel(style.model) !== model) throw new Error(`Choose a ${model || 'compatible FLUX2'} style for this model; 9B and 4B LoRAs are not interchangeable.`);
    const loraModel = inferFlux2Variant(`FLUX2 ${style.lora}`)?.toUpperCase();
    if (loraModel && loraModel !== model) throw new Error(`The style LoRA is for ${loraModel}, not ${model}.`);
    const strength = mode === 't2i' ? options.comfyFlux2StyleStrength : options.comfyFlux2EditStyleStrength;
    if (strength !== undefined && !Number.isFinite(strength)) throw new Error('Style LoRA strength must be finite.');
    options = { ...options, ...flux2StyleLoraRemovals(options, [style.lora], mode) };
    const appendStyle = (base: string) => appendGalleryStylePrompt(base, style);
    if (mode === 't2i') {
        const result = { ...options, comfyFlux2Prompt: appendStyle(options.comfyFlux2Prompt || '') };
        if (options.comfyFlux2UseStyleSettings) {
            if (style.settings.steps !== undefined) result.comfySteps = style.settings.steps;
            if (style.settings.cfg !== undefined) result.comfyCfg = style.settings.cfg;
            if (style.settings.sampler !== undefined) result.comfySampler = style.settings.sampler;
        }
        return result;
    }
    const result = { ...options,
        comfyFlux2EditPrompt: appendStyle(options.comfyFlux2EditPrompt || options.comfyPrompt || ''),
        comfyFlux2EditRequirePhotorealism: false, comfyFlux2EditPreserveSourceStyle: false,
    };
    if (options.comfyFlux2EditUseStyleSettings) {
        if (style.settings.steps !== undefined) result.comfyFlux2EditSteps = style.settings.steps;
        if (style.settings.cfg !== undefined) result.comfyFlux2EditCfg = style.settings.cfg;
        if (style.settings.sampler !== undefined) result.comfyFlux2EditSampler = style.settings.sampler;
        if (style.settings.megapixels !== undefined) result.comfyFlux2EditMegapixels = style.settings.megapixels;
    }
    return result;
};

export interface Flux2EditReference {
    imageName: string;
    role: Flux2ReferenceRole;
    description: string;
}

const roleInstruction = (reference: Flux2EditReference, pictureNumber: number): string => {
    const detail = reference.description.trim();
    const suffix = detail ? ` The reference specifically shows ${detail}.` : '';
    switch (reference.role) {
        case 'identity':
            return `Use Picture ${pictureNumber} as an exact identity reference, not as inspiration. Preserve this person's face shape, forehead, hairline, eyebrows, eye shape and spacing, nose, cheekbones, lips, jawline, chin, ears, skin tone, apparent age, ethnicity, distinctive marks, hair, and body proportions. Do not beautify, idealize, average, redesign, or substitute this face. Keep this person distinct from every other subject.${suffix}`;
        case 'outfit':
            return `Use Picture ${pictureNumber} for the subject's complete outfit, preserving its colors, materials, fit, accessories, and garment details.${suffix}`;
        case 'background':
            return `Use Picture ${pictureNumber} for the scene background, matching its environment, perspective, lighting, and colors.${suffix}`;
        case 'pose':
            return `Use Picture ${pictureNumber} strictly as the authoritative structural pose reference. Match its body orientation, balance and weight-bearing leg, head direction, torso bend and rotation, shoulder and hip angles, and the articulation and placement of both arms, hands, legs, and feet. Do not simplify it into a neutral standing pose and do not copy appearance from this pose guide; preserve the intended subject appearance from Picture 1 and the editing instructions.${suffix}`;
        case 'style':
            return `Apply the visual style from Picture ${pictureNumber} without copying its subject identity.${suffix}`;
        case 'custom':
        default:
            return detail
                ? `Use Picture ${pictureNumber} as follows: ${detail}.`
                : `Use Picture ${pictureNumber} as an additional visual reference where appropriate.`;
    }
};

export const buildFlux2EditPrompt = (
    basePrompt: string,
    references: Flux2EditReference[],
    requirePhotorealism = true,
    preserveSourceStyle = false,
    styleApplied = false,
    styleTrigger = '',
): string => {
    const trigger = styleTrigger.trim();
    const instructions = removeGalleryStyleTrigger(basePrompt, trigger).trim();
    return prependGalleryStyleTrigger([
    'Synthesize one final coherent image using Picture 1 as the primary source. Preserve the main subject identity and defining features from Picture 1 unless explicitly instructed otherwise.',
    ...references.map((reference, index) => roleInstruction(reference, index + 2)),
    instructions ? `Additional editing instructions: ${instructions}` : '',
    styleApplied
        ? 'Produce a coherent result in the requested visual style, with consistent anatomy, perspective, scale and lighting.'
        : preserveSourceStyle
        ? 'Preserve the source visual medium and capture treatment exactly: grain, noise, softness, compression, color response, artifacts and rendering technique. Do not beautify, restore, sharpen, modernize or restyle the image. VHS stays VHS; illustration stays illustration. Change only explicitly enabled scene attributes.'
        : requirePhotorealism
        ? 'Produce a photorealistic, anatomically coherent result with consistent perspective, scale, lighting, shadows, and color integration.'
        : 'Produce a polished, anatomically coherent result with consistent perspective, scale, lighting, shadows, and color integration in the requested non-photographic visual medium.',
    ].filter(Boolean).join(' '), trigger);
};

export const buildFlux2EditWorkflow = (
    sourceImageName: string,
    references: Flux2EditReference[],
    options: GenerationOptions,
    style?: GalleryStyle,
): { workflow: Record<string, any>; prompt: string; seed: number } => {
    options = flux2StyleOptions(options, style);
    const megapixels = options.comfyFlux2EditMegapixels ?? 1;
    const seed = options.comfySeed ?? Math.floor(Math.random() * 1e15);
    const prompt = buildFlux2EditPrompt(options.comfyFlux2EditPrompt || options.comfyPrompt || '', references, options.comfyFlux2EditRequirePhotorealism !== false, options.comfyFlux2EditPreserveSourceStyle === true, !!style, style?.trigger);
    const modelName = options.comfyFlux2EditUnet || 'flux2\\flux2Klein9BInt8_v10.safetensors';
    const modelLoader = modelName.toLowerCase().endsWith('.gguf')
        ? { inputs: { unet_name: modelName }, class_type: 'UnetLoaderGGUF', _meta: { title: 'FLUX2 Klein model (GGUF)' } }
        : { inputs: { unet_name: modelName, weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'FLUX2 Klein model' } };
    const workflow: Record<string, any> = {
        source: { inputs: { image: sourceImageName }, class_type: 'LoadImage', _meta: { title: 'Picture 1 - Source' } },
        source_scale: { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image: ['source', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale source image' } },
        source_size: { inputs: { image: ['source_scale', 0] }, class_type: 'GetImageSize', _meta: { title: 'Output size' } },
        source_latent: { inputs: { pixels: ['source_scale', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode Picture 1' } },
        vae: { inputs: { vae_name: options.comfyFlux2EditVae || 'flux2-vae.safetensors' }, class_type: 'VAELoader', _meta: { title: 'FLUX2 VAE' } },
        clip: { inputs: { clip_name: options.comfyFlux2EditClip || defaultFlux2Clip(modelName), type: 'flux2', device: 'default' }, class_type: 'CLIPLoader', _meta: { title: 'FLUX2 CLIP' } },
        model: modelLoader,
        prompt: { inputs: { text: prompt, clip: ['clip', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Editing instructions' } },
        negative: { inputs: { conditioning: ['prompt', 0] }, class_type: 'ConditioningZeroOut', _meta: { title: 'Zero negative' } },
        negative_reference: { inputs: { conditioning: ['negative', 0], latent: ['source_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: 'Negative source reference' } },
        latent: { inputs: { width: ['source_size', 0], height: ['source_size', 1], batch_size: 1 }, class_type: 'EmptyFlux2LatentImage', _meta: { title: 'Output latent' } },
        noise: { inputs: { noise_seed: seed }, class_type: 'RandomNoise', _meta: { title: 'Noise' } },
        sampler_select: { inputs: { sampler_name: options.comfyFlux2EditSampler || 'euler' }, class_type: 'KSamplerSelect', _meta: { title: 'Sampler' } },
        scheduler: { inputs: { steps: options.comfyFlux2EditSteps ?? 4, width: ['source_size', 0], height: ['source_size', 1] }, class_type: 'Flux2Scheduler', _meta: { title: 'FLUX2 scheduler' } },
    };

    let positive: [string, number] = ['prompt', 0];
    const allLatents: Array<[string, number]> = [['source_latent', 0]];
    if (options.comfyFlux2EditReinforceSourceIdentity) {
        const identityReferenceWeight = Math.max(1, Math.min(4, Math.round(options.comfyFlux2EditIdentityReferenceWeight ?? 2)));
        while (allLatents.length < identityReferenceWeight) allLatents.push(['source_latent', 0]);
    }
    references.forEach((reference, index) => {
        const id = `reference_${index + 2}`;
        workflow[`${id}_source`] = { inputs: { image: reference.imageName }, class_type: 'LoadImage', _meta: { title: `Picture ${index + 2} - ${reference.role}` } };
        let image: [string, number] = [`${id}_source`, 0];
        if (reference.role === 'pose') {
            workflow[`${id}_pose`] = { inputs: { preprocessor: 'DWPreprocessor', resolution: 1024, image }, class_type: 'AIO_Preprocessor', _meta: { title: `Picture ${index + 2} - DWPose` } };
            image = [`${id}_pose`, 0];
        }
        workflow[`${id}_scale`] = { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image }, class_type: 'ImageScaleToTotalPixels', _meta: { title: `Scale Picture ${index + 2}` } };
        workflow[`${id}_latent`] = { inputs: { pixels: [`${id}_scale`, 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: `Encode Picture ${index + 2}` } };
        allLatents.push([`${id}_latent`, 0]);
    });
    allLatents.forEach((latent, index) => {
        const id = `positive_reference_${index + 1}`;
        workflow[id] = { inputs: { conditioning: positive, latent }, class_type: 'ReferenceLatent', _meta: { title: `Positive reference ${index + 1}` } };
        positive = [id, 0];
    });

    let model: [string, number] = ['model', 0];
    if (style?.lora) {
        workflow.style_lora = { class_type: 'LoraLoaderModelOnly', inputs: {
            lora_name: style.lora, strength_model: options.comfyFlux2EditStyleStrength ?? style.strength, model,
        }, _meta: { title: `Style: ${style.title}` } };
        model = ['style_lora', 0];
    }
    for (let index = 1; index <= 2; index++) {
        const name = options[`comfyFlux2EditLora${index}Name` as keyof GenerationOptions] as string | undefined;
        if (!name?.trim() || name === 'None') continue;
        const variant = inferFlux2Variant(`FLUX2 ${name}`);
        if (variant && variant !== inferFlux2Variant(modelName)) throw new Error(`Additional LoRA "${name}" is incompatible with the selected FLUX2 model.`);
        const strength = options[`comfyFlux2EditLora${index}Strength` as keyof GenerationOptions] as number | undefined;
        const nodeId = `lora_${index}`;
        workflow[nodeId] = {
            inputs: {
                lora_name: name,
                strength_model: strength ?? 1,
                model,
            },
            class_type: 'LoraLoaderModelOnly',
            _meta: { title: `FLUX2 Additional LoRA ${index}` },
        };
        model = [nodeId, 0];
    }
    if (options.comfyFlux2EditUseCacheDit) {
        workflow.cache_dit = {
            inputs: {
                enable: true,
                model_type: options.comfyFlux2EditCacheDitModelType || 'Auto',
                warmup_steps: options.comfyFlux2EditCacheDitWarmupSteps ?? 0,
                skip_interval: options.comfyFlux2EditCacheDitSkipInterval ?? 0,
                print_summary: true,
                model,
            },
            class_type: 'CacheDiT_Model_Optimizer',
            _meta: { title: 'FLUX2 CacheDiT' },
        };
        model = ['cache_dit', 0];
    }

    workflow.guider = { inputs: { cfg: options.comfyFlux2EditCfg ?? 1, model, positive, negative: ['negative_reference', 0] }, class_type: 'CFGGuider', _meta: { title: 'CFG guider' } };
    workflow.sample = { inputs: { noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_select', 0], sigmas: ['scheduler', 0], latent_image: ['latent', 0] }, class_type: 'SamplerCustomAdvanced', _meta: { title: 'Sample' } };
    workflow.decode = { inputs: { samples: ['sample', 0], vae: ['vae', 0] }, class_type: 'VAEDecode', _meta: { title: 'Decode' } };
    workflow.save = { inputs: { filename_prefix: 'FLUX2_Edit', images: ['decode', 0] }, class_type: 'SaveImage', _meta: { title: 'Save Image' } };

    applyFlux2StyleScheduler(workflow, options.comfyFlux2EditUseStyleSettings ? style?.settings.scheduler : undefined);
    return { workflow, prompt, seed };
};

export const buildMaskedFlux2EditWorkflow = (
    sourceImageName: string, maskImageName: string, options: GenerationOptions,
): { workflow: Record<string, any>; prompt: string; seed: number } => {
    if (!maskImageName.trim()) throw new Error('A mask image is required.');
    const result = buildFlux2EditWorkflow(sourceImageName, [], options);
    const { workflow } = result;
    workflow.source_scale.inputs.resolution_steps = 16;
    workflow.edit_mask_image = { class_type: 'LoadImage', inputs: { image: maskImageName } };
    workflow.edit_mask_scale = { class_type: 'ImageScale', inputs: {
        image: ['edit_mask_image', 0], upscale_method: 'nearest-exact',
        width: ['source_size', 0], height: ['source_size', 1], crop: 'disabled',
    } };
    workflow.edit_mask = { class_type: 'ImageToMask', inputs: { image: ['edit_mask_scale', 0], channel: 'red' } };
    workflow.masked_latent = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['source_latent', 0], mask: ['edit_mask', 0] } };
    workflow.sample.inputs.latent_image = ['masked_latent', 0];
    workflow.original_size = { class_type: 'GetImageSize', inputs: { image: ['source', 0] } };
    workflow.output_mask = { class_type: 'ImageToMask', inputs: { image: ['edit_mask_image', 0], channel: 'red' } };
    workflow.output_scale = { class_type: 'ImageScale', inputs: {
        image: ['decode', 0], upscale_method: 'bicubic', width: ['original_size', 0], height: ['original_size', 1], crop: 'disabled',
    } };
    workflow.masked_composite = { class_type: 'ImageCompositeMasked', inputs: {
        destination: ['source', 0], source: ['output_scale', 0], mask: ['output_mask', 0], x: 0, y: 0, resize_source: false,
    } };
    workflow.save.inputs.images = ['masked_composite', 0];
    workflow.save.inputs.filename_prefix = 'Scene_Variation_Masked';
    return result;
};