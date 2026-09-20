import type { Flux2ReferenceRole, GenerationOptions } from '../types';

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
            return `Apply the body pose and structure from Picture ${pictureNumber} while preserving the identity and appearance from Picture 1.${suffix}`;
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
): string => [
    'Synthesize one final coherent image using Picture 1 as the primary source. Preserve the main subject identity and defining features from Picture 1 unless explicitly instructed otherwise.',
    ...references.map((reference, index) => roleInstruction(reference, index + 2)),
    basePrompt.trim() ? `Additional editing instructions: ${basePrompt.trim()}` : '',
    'Produce a photorealistic, anatomically coherent result with consistent perspective, scale, lighting, shadows, and color integration.',
].filter(Boolean).join(' ');

export const buildFlux2EditWorkflow = (
    sourceImageName: string,
    references: Flux2EditReference[],
    options: GenerationOptions,
): { workflow: Record<string, any>; prompt: string; seed: number } => {
    const megapixels = options.comfyFlux2EditMegapixels ?? 1;
    const seed = options.comfySeed ?? Math.floor(Math.random() * 1e15);
    const prompt = buildFlux2EditPrompt(options.comfyFlux2EditPrompt || options.comfyPrompt || '', references);
    const workflow: Record<string, any> = {
        source: { inputs: { image: sourceImageName }, class_type: 'LoadImage', _meta: { title: 'Picture 1 - Source' } },
        source_scale: { inputs: { upscale_method: 'nearest-exact', megapixels, resolution_steps: 1, image: ['source', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale source image' } },
        source_size: { inputs: { image: ['source_scale', 0] }, class_type: 'GetImageSize', _meta: { title: 'Output size' } },
        source_latent: { inputs: { pixels: ['source_scale', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode Picture 1' } },
        vae: { inputs: { vae_name: options.comfyFlux2EditVae || 'flux2-vae.safetensors' }, class_type: 'VAELoader', _meta: { title: 'FLUX2 VAE' } },
        clip: { inputs: { clip_name: options.comfyFlux2EditClip || 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, class_type: 'CLIPLoader', _meta: { title: 'FLUX2 CLIP' } },
        model: { inputs: { unet_name: options.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf' }, class_type: 'UnetLoaderGGUF', _meta: { title: 'FLUX2 Klein model' } },
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

    return { workflow, prompt, seed };
};