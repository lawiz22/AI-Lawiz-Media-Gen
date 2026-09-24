export interface SwapAnythingOptions {
    destinationTarget: string;
    donorTarget: string;
    prompt?: string;
    unet: string;
    clip: string;
    vae: string;
    samCheckpoint: string;
    megapixels: number;
    donorMegapixels: number;
    samThreshold: number;
    samRefineIterations: number;
    maskGrow: number;
    steps: number;
    cfg: number;
    sampler: string;
    seed: number;
    lora1Name?: string;
    lora1Strength: number;
    lora2Name?: string;
    lora2Strength: number;
}

export const buildSwapAnythingWorkflow = (
    destinationImage: string,
    donorImage: string,
    options: SwapAnythingOptions,
): Record<string, any> => {
    const destinationTarget = options.destinationTarget.trim();
    const donorTarget = options.donorTarget.trim();
    if (!destinationTarget || !donorTarget) throw new Error('Describe both the destination area and the donor element.');

    const editPrompt = options.prompt?.trim() ||
        `Replace only the ${destinationTarget} in Picture 1 with the ${donorTarget} extracted from Picture 2. Preserve every unmasked part of Picture 1, including its composition, background, lighting, perspective, and subject identity. Integrate the replacement naturally with clean boundaries, correct scale, and coherent anatomy. Do not add, duplicate, merge, or remove any other subject or object.`;
    const modelLoader = options.unet.toLowerCase().endsWith('.gguf')
        ? { inputs: { unet_name: options.unet }, class_type: 'UnetLoaderGGUF', _meta: { title: 'FLUX2 model (GGUF)' } }
        : { inputs: { unet_name: options.unet, weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'FLUX2 model' } };

    const workflow: Record<string, any> = {
        destination: { inputs: { image: destinationImage }, class_type: 'LoadImage', _meta: { title: 'Picture 1 - Destination' } },
        destination_scale: { inputs: { upscale_method: 'nearest-exact', megapixels: options.megapixels, resolution_steps: 1, image: ['destination', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale destination' } },
        destination_size: { inputs: { image: ['destination_scale', 0] }, class_type: 'GetImageSize', _meta: { title: 'Destination output size' } },
        donor: { inputs: { image: donorImage }, class_type: 'LoadImage', _meta: { title: 'Picture 2 - Donor' } },
        sam: { inputs: { ckpt_name: options.samCheckpoint }, class_type: 'CheckpointLoaderSimple', _meta: { title: 'SAM3.1 checkpoint' } },
        destination_sam_prompt: { inputs: { text: destinationTarget, clip: ['sam', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'Destination SAM prompt' } },
        destination_detect: { inputs: { threshold: options.samThreshold, refine_iterations: options.samRefineIterations, individual_masks: false, model: ['sam', 0], image: ['destination_scale', 0], conditioning: ['destination_sam_prompt', 0] }, class_type: 'SAM3_Detect', _meta: { title: 'Detect destination area' } },
        destination_mask: { inputs: { expand: options.maskGrow, tapered_corners: true, mask: ['destination_detect', 0] }, class_type: 'GrowMask', _meta: { title: 'Grow destination mask' } },
        destination_marked: { inputs: { color: '0, 255, 60', device: 'gpu', image: ['destination_scale', 0], mask: ['destination_mask', 0] }, class_type: 'DrawMaskOnImage', _meta: { title: 'Mark destination area' } },
        donor_sam_prompt: { inputs: { text: donorTarget, clip: ['sam', 1] }, class_type: 'CLIPTextEncode', _meta: { title: 'Donor SAM prompt' } },
        donor_detect: { inputs: { threshold: options.samThreshold, refine_iterations: options.samRefineIterations, individual_masks: false, model: ['sam', 0], image: ['donor', 0], conditioning: ['donor_sam_prompt', 0] }, class_type: 'SAM3_Detect', _meta: { title: 'Detect donor element' } },
        donor_mask_image: { inputs: { mask: ['donor_detect', 0] }, class_type: 'MaskToImage', _meta: { title: 'Convert donor mask' } },
        donor_cut: { inputs: { force_resize_width: 0, force_resize_height: 0, image: ['donor', 0], mask: ['donor_mask_image', 0] }, class_type: 'Cut By Mask', _meta: { title: 'Extract donor element' } },
        donor_rgb: { inputs: { images: ['donor_cut', 0] }, class_type: 'Image to RGB [RvTools]', _meta: { title: 'Normalize donor image' } },
        donor_scale: { inputs: { upscale_method: 'nearest-exact', megapixels: options.donorMegapixels, resolution_steps: 1, image: ['donor_rgb', 0] }, class_type: 'ImageScaleToTotalPixels', _meta: { title: 'Scale donor element' } },
        vae: { inputs: { vae_name: options.vae }, class_type: 'VAELoader', _meta: { title: 'FLUX2 VAE' } },
        clip: { inputs: { clip_name: options.clip, type: 'flux2', device: 'default' }, class_type: 'CLIPLoader', _meta: { title: 'FLUX2 CLIP' } },
        model: modelLoader,
        destination_latent: { inputs: { pixels: ['destination_marked', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode marked destination' } },
        donor_latent: { inputs: { pixels: ['donor_scale', 0], vae: ['vae', 0] }, class_type: 'VAEEncode', _meta: { title: 'Encode donor element' } },
        positive: { inputs: { text: editPrompt, clip: ['clip', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Editing instructions' } },
        negative: { inputs: { text: '', clip: ['clip', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Negative prompt' } },
    };

    let samplingModel: [string, number] = ['model', 0];
    let samplingClip: [string, number] = ['clip', 0];
    [
        { name: options.lora1Name, strength: options.lora1Strength },
        { name: options.lora2Name, strength: options.lora2Strength },
    ].forEach((lora, index) => {
        if (!lora.name?.trim()) return;
        const nodeId = `lora_${index + 1}`;
        workflow[nodeId] = { inputs: { lora_name: lora.name.trim(), strength_model: lora.strength, strength_clip: lora.strength, model: samplingModel, clip: samplingClip }, class_type: 'LoraLoader', _meta: { title: `Optional LoRA ${index + 1}` } };
        samplingModel = [nodeId, 0];
        samplingClip = [nodeId, 1];
        workflow.positive.inputs.clip = samplingClip;
        workflow.negative.inputs.clip = samplingClip;
    });

    workflow.positive_destination = { inputs: { conditioning: ['positive', 0], latent: ['destination_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: 'Positive destination reference' } };
    workflow.positive_donor = { inputs: { conditioning: ['positive_destination', 0], latent: ['donor_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: 'Positive donor reference' } };
    workflow.negative_destination = { inputs: { conditioning: ['negative', 0], latent: ['destination_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: 'Negative destination reference' } };
    workflow.negative_donor = { inputs: { conditioning: ['negative_destination', 0], latent: ['donor_latent', 0] }, class_type: 'ReferenceLatent', _meta: { title: 'Negative donor reference' } };
    workflow.output_latent = { inputs: { width: ['destination_size', 0], height: ['destination_size', 1], batch_size: 1 }, class_type: 'EmptyFlux2LatentImage', _meta: { title: 'Destination-sized latent' } };
    workflow.noise = { inputs: { noise_seed: options.seed }, class_type: 'RandomNoise', _meta: { title: 'Noise' } };
    workflow.sampler_select = { inputs: { sampler_name: options.sampler }, class_type: 'KSamplerSelect', _meta: { title: 'Sampler' } };
    workflow.scheduler = { inputs: { steps: options.steps, width: ['destination_size', 0], height: ['destination_size', 1] }, class_type: 'Flux2Scheduler', _meta: { title: 'FLUX2 scheduler' } };
    workflow.guider = { inputs: { cfg: options.cfg, model: samplingModel, positive: ['positive_donor', 0], negative: ['negative_donor', 0] }, class_type: 'CFGGuider', _meta: { title: 'CFG guider' } };
    workflow.sample = { inputs: { noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_select', 0], sigmas: ['scheduler', 0], latent_image: ['output_latent', 0] }, class_type: 'SamplerCustomAdvanced', _meta: { title: 'Sample replacement' } };
    workflow.decode = { inputs: { samples: ['sample', 0], vae: ['vae', 0] }, class_type: 'VAEDecode', _meta: { title: 'Decode result' } };
    workflow.save = { inputs: { filename_prefix: 'Fun/Swap-Anything', images: ['decode', 0] }, class_type: 'SaveImage', _meta: { title: 'Save Swap Anything result' } };

    return workflow;
};