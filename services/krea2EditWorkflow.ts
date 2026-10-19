import { getQwen21Choices } from './qwen21Workflow';

export type Krea2EditTask = 'general' | 'identity';
export type Krea2EditRank = 'full' | 'r128' | 'r64';
export const KREA2_EDIT_POSITIONS = ['aligned (trained)', 'beside (right of target)', 'bag of features'] as const;
export type Krea2EditPosition = typeof KREA2_EDIT_POSITIONS[number];
export const KREA2_EDIT_ASPECTS = ['1:1', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '21:9'] as const;
export interface Krea2EditLora { name: string; enabled: boolean; strength: number }
export interface Krea2EditComposer {
    example: string; target: string; replacement: string; scene: string; pose: string; outfit: string; lighting: string; preserve: string; extra: string;
}
export interface Krea2EditSettings {
    task: Krea2EditTask; rank: Krea2EditRank; prompt: string; negativePrompt: string; composer: Krea2EditComposer;
    unet: string; weightDtype: string; clip: string; clipDevice: string; vae: string;
    secondImage: boolean; position: Krea2EditPosition; positionA: Krea2EditPosition; refBoost: number; refBoostA: number;
    fitMode: 'fit' | 'crop (legacy)'; groundingPx: number; systemPrompt: string;
    aspect: string; megapixels: number; multiple: number; batchSize: number; filenamePrefix: string;
    steps: number; cfg: number; sampler: string; scheduler: string; denoise: number; loras: Krea2EditLora[];
}
export type Krea2EditWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export type Krea2EditObjectInfo = Parameters<typeof getQwen21Choices>[0];

export const getKrea2EditCapabilities = (info: Krea2EditObjectInfo) => {
    const schema = info?.Krea2EditModelPatch?.input;
    const supports = (input: string): boolean => !!(schema?.required?.[input] || schema?.optional?.[input]);
    return { position: supports('ref_position'), positionA: supports('ref_position_a'), targetLatent: supports('target_latent') };
};

export const krea2EditLoraName = (task: Krea2EditTask, rank: Krea2EditRank, available: string[] = []): string => {
    const filename = `krea2_${task === 'identity' ? 'identity' : 'general'}_edit_v2${rank === 'full' ? '' : `_${rank}`}.safetensors`;
    return available.find(name => name.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === filename) || `KREA\\${filename}`;
};
export const defaultKrea2EditSettings = (available: string[] = []): Krea2EditSettings => ({
    task: 'general', rank: 'r64', prompt: '', negativePrompt: '',
    composer: { example: 'custom', target: '', replacement: '', scene: '', pose: '', outfit: '', lighting: '', preserve: '', extra: '' },
    unet: 'krea2_turbo_fp8_scaled.safetensors', weightDtype: 'default', clip: 'qwen3vl_4b_fp8_scaled.safetensors', clipDevice: 'default', vae: 'qwen_image_vae.safetensors',
    secondImage: false, position: 'aligned (trained)', positionA: 'aligned (trained)', refBoost: 4, refBoostA: 1,
    fitMode: 'fit', groundingPx: 768, systemPrompt: '', aspect: '3:4', megapixels: 1, multiple: 8, batchSize: 1, filenamePrefix: 'krea2_edit',
    steps: 8, cfg: 1, sampler: 'er_sde', scheduler: 'beta', denoise: 1,
    loras: [{ name: krea2EditLoraName('general', 'r64', available), enabled: true, strength: 1 },
        ...Array.from({ length: 3 }, () => ({ name: '', enabled: false, strength: 1 }))],
});
export const switchKrea2EditTask = (settings: Krea2EditSettings, task: Krea2EditTask, available: string[] = []): Krea2EditSettings => ({
    ...settings, task, refBoost: task === 'identity' ? 2 : 4, position: task === 'identity' ? 'beside (right of target)' : 'aligned (trained)',
    positionA: 'aligned (trained)', groundingPx: 768,
    loras: settings.loras.map((lora, index) => index === 0
        ? { name: krea2EditLoraName(task, settings.rank, available), enabled: true, strength: 1 }
        : /krea2_(?:identity|general)_edit_v2/i.test(lora.name) ? { ...lora, enabled: false } : lora),
});
export const krea2EditDimensions = (settings: Pick<Krea2EditSettings, 'aspect' | 'megapixels' | 'multiple'>): { width: number; height: number } => {
    if (!KREA2_EDIT_ASPECTS.some(aspect => aspect === settings.aspect) || ![8, 16, 32, 64].includes(settings.multiple)
        || !Number.isFinite(settings.megapixels) || settings.megapixels < 0.25 || settings.megapixels > 2) throw new Error('Choose a KREA2 edit aspect ratio, 0.25-2 MP and alignment of 8, 16, 32 or 64.');
    const [x, y] = settings.aspect.split(':').map(Number);
    const pixels = settings.megapixels * 1_000_000;
    return { width: Math.floor(Math.sqrt(pixels * x / y) / settings.multiple) * settings.multiple,
        height: Math.floor(Math.sqrt(pixels * y / x) / settings.multiple) * settings.multiple };
};

export const KREA2_EDIT_EXAMPLES: Array<{ id: string; label: string; task: Krea2EditTask; target?: string; replacement?: string; second?: boolean; raw?: boolean }> = [
    { id: 'custom', label: 'Custom instruction', task: 'general' },
    { id: 'season', label: 'Change the season', task: 'general', replacement: 'winter, with fresh snow on the ground and bare trees' },
    { id: 'remove-person', label: 'Remove a person (Raw recommended)', task: 'general', target: 'the person on the left', raw: true },
    { id: 'remove-object', label: 'Remove an object (Raw recommended)', task: 'general', target: 'the parked car', raw: true },
    { id: 'recolor', label: 'Recolor an object', task: 'general', target: 'the car', replacement: 'matte forest green' },
    { id: 'background', label: 'Replace the background', task: 'general', replacement: 'a sunlit Mediterranean street' },
    { id: 'add-object', label: 'Add an object', task: 'general', replacement: 'a small vase of yellow flowers on the table' },
    { id: 'sign-text', label: 'Rewrite sign text', task: 'general', target: 'the shop sign', replacement: 'OPEN LATE' },
    { id: 'outfit', label: 'Change clothes', task: 'general', target: 'the person', replacement: 'a white linen shirt, dark blue jeans and brown leather boots; remove the original jacket' },
    { id: 'relight', label: 'Change the lighting', task: 'general', replacement: 'a magenta neon sign illuminating the left half of the face, with cool blue shadows on the right' },
    { id: 'restyle', label: 'Restyle the image', task: 'general', replacement: 'a detailed watercolor painting on textured paper' },
    { id: 'flat-lay', label: 'Turn an outfit into a flat lay', task: 'general', replacement: 'a clean overhead flat lay on a neutral beige surface, showing every garment and accessory separately' },
    { id: 'restage', label: 'Restage a person (one image)', task: 'identity', replacement: 'full body, sitting cross-legged on a log, wearing a red hiking jacket and muddy hiking boots' },
    { id: 'replace-identity', label: 'Replace identity (two images)', task: 'identity', target: 'the person in image 1', second: true },
    { id: 'person-into-scene', label: 'Put a person into a scene (two images)', task: 'identity', replacement: 'full body, walking along the path', second: true },
    { id: 'copy-outfit', label: 'Copy clothes from image 2', task: 'general', target: 'the person in image 1', second: true },
];
export const composeKrea2EditPrompt = (fields: Krea2EditComposer): string => {
    const target = fields.target.trim(), replacement = fields.replacement.trim();
    const preserved = [!fields.pose.trim() && 'position and pose', !fields.outfit.trim() && 'outfit', !fields.scene.trim() && 'scene'].filter(Boolean).join(', ');
    const preserveScene = [!fields.pose.trim() && 'pose', !fields.scene.trim() && 'environment'].filter(Boolean).join(' and ');
    let instruction: string;
    switch (fields.example) {
        case 'season': instruction = `Change the season in image 1 to ${replacement}.`; break;
        case 'remove-person':
        case 'remove-object': instruction = `Remove ${target} from image 1 and reconstruct the revealed background naturally. Do not replace it with another subject.`; break;
        case 'recolor': instruction = `Recolor ${target} in image 1 to ${replacement}, preserving its shape, material and reflections.`; break;
        case 'background': instruction = `Replace the background of image 1 with ${replacement}. Keep the main subject and match its lighting to the new environment.`; break;
        case 'add-object': instruction = `Add ${replacement} to image 1, with consistent perspective, scale, lighting and contact shadows.`; break;
        case 'sign-text': instruction = `Replace the text on ${target} in image 1 with "${replacement}". Preserve the sign's perspective and material.`; break;
        case 'outfit': instruction = `Change the outfit of ${target} in image 1 to ${replacement}. Preserve the person's facial identity.`; break;
        case 'relight': instruction = `Relight image 1 with ${replacement}. Keep the subject's identity${preserveScene ? ` and ${preserveScene}` : ''} unchanged.`; break;
        case 'restyle': instruction = `Restyle image 1 as ${replacement}, preserving its subjects${!fields.pose.trim() && !fields.scene.trim() ? ' and composition' : ''}.`; break;
        case 'flat-lay': instruction = `Transform the outfit visible in image 1 into ${replacement}. Remove the person; retain the original garment colors, cuts, materials and accessories.`; break;
        case 'restage': instruction = `Show the person from image 1 with the same facial identity: ${replacement}.`; break;
        case 'replace-identity': instruction = `Replace ${target} with the person from image 2. ${preserved ? `Preserve the original ${preserved} in image 1; ` : ''}Use the facial identity from image 2.`; break;
        case 'person-into-scene': instruction = `Place the person from image 2 into the scene in image 1: ${replacement}. Match the scene's perspective, scale, lighting and shadows.`; break;
        case 'copy-outfit': instruction = `Dress ${target} in the outfit from image 2. Preserve the facial identity${preserveScene ? ` and ${preserveScene}` : ''} from image 1; remove the original outfit.`; break;
        default: instruction = target ? `Edit ${target} in image 1${replacement ? `: ${replacement}` : '.'}` : replacement;
    }
    return [instruction, fields.scene.trim() && `Environment: ${fields.scene.trim()}.`,
        fields.pose.trim() && `Framing and pose: ${fields.pose.trim()}.`,
        fields.outfit.trim() && `Outfit: ${fields.outfit.trim()}.`,
        fields.lighting.trim() && `Lighting: ${fields.lighting.trim()}.`,
        fields.preserve.trim() && `Preserve ${fields.preserve.trim()}.`, fields.extra.trim()].filter(Boolean).join(' ');
};

export const buildKrea2EditWorkflow = (settings: Krea2EditSettings, seed: number, source: string, second?: string, info?: Krea2EditObjectInfo): Krea2EditWorkflow => {
    const dimensions = krea2EditDimensions(settings);
    if (!source.trim() || (settings.secondImage && !second?.trim())) throw new Error('Choose image 1 and, when enabled, image 2 for KREA2 editing.');
    if (!settings.prompt.trim()) throw new Error('Enter a KREA2 edit instruction or choose a prompt example.');
    if (!settings.secondImage && /\bimage\s*2\b/i.test(settings.prompt)) throw new Error('This instruction uses image 2. Enable it and choose a second reference, or edit the prompt.');
    if (!['general', 'identity'].includes(settings.task) || !['full', 'r128', 'r64'].includes(settings.rank)
        || !KREA2_EDIT_POSITIONS.includes(settings.position) || !KREA2_EDIT_POSITIONS.includes(settings.positionA) || !['fit', 'crop (legacy)'].includes(settings.fitMode)) throw new Error('Invalid KREA2 edit task or reference settings.');
    if (![settings.unet, settings.weightDtype, settings.clip, settings.clipDevice, settings.vae, settings.filenamePrefix, settings.sampler, settings.scheduler].every(value => value.trim())) throw new Error('Complete the KREA2 edit model, sampler and output settings.');
    if (!Number.isSafeInteger(seed) || seed < 0 || !Number.isInteger(settings.steps) || settings.steps < 1 || settings.steps > 100
        || !Number.isFinite(settings.cfg) || settings.cfg < 0 || settings.cfg > 20
        || !Number.isFinite(settings.denoise) || settings.denoise < 0 || settings.denoise > 1
        || !Number.isInteger(settings.batchSize) || settings.batchSize < 1 || settings.batchSize > 8) throw new Error('Invalid KREA2 edit seed, sampling or batch settings.');
    if (![settings.refBoost, settings.refBoostA].every(value => Number.isFinite(value) && value >= 0 && value <= 1000)
        || !Number.isInteger(settings.groundingPx) || settings.groundingPx < 0 || settings.groundingPx > 4096) throw new Error('Invalid reference boost or grounding resolution.');
    if (!settings.loras.length || settings.loras.length > 4 || settings.loras.some(lora => !Number.isFinite(lora.strength) || Math.abs(lora.strength) > 10 || (lora.enabled && !lora.name.trim()))) throw new Error('KREA2 edit supports at most four separate LoRAs, with valid names and strengths between -10 and 10.');
    if (!settings.loras.some(lora => lora.enabled && lora.strength !== 0 && /krea2_(?:identity|general)_edit_v2(?:_r(?:64|128))?\.safetensors$/i.test(lora.name))) throw new Error('Enable a Krea 2 Identity Edit V2 or General Edit V2 LoRA for image-conditioned editing.');
    const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
    const workflow: Krea2EditWorkflow = {
        '55': node('UNETLoader', { unet_name: settings.unet, weight_dtype: settings.weightDtype }),
        '56': node('CLIPLoader', { clip_name: settings.clip, type: 'krea2', device: settings.clipDevice }),
        '57': node('VAELoader', { vae_name: settings.vae }),
        '72': node('LoadImage', { image: source }),
        '73': node('VAEEncode', { pixels: ['72', 0], vae: ['57', 0] }),
        '82': node('EmptySD3LatentImage', { ...dimensions, batch_size: settings.batchSize }),
        '84': node('Krea2EditGroundedEncode', { prompt: settings.prompt, grounding_px: settings.groundingPx, system_prompt: settings.systemPrompt, clip: ['56', 0], image: ['72', 0] }),
        '85': node('Krea2EditGroundedEncode', { prompt: settings.negativePrompt, grounding_px: settings.groundingPx, system_prompt: settings.systemPrompt, clip: ['56', 0], image: ['72', 0] }),
        '79': node('Krea2EditModelPatch', { ref_boost: settings.refBoost, ref_boost_a: settings.refBoostA, fit_mode: settings.fitMode,
            model: ['55', 0], source_latent: ['73', 0], vae: ['57', 0], source_image: ['72', 0] }),
        '53': node('KSampler', { seed, steps: settings.steps, cfg: settings.cfg, sampler_name: settings.sampler, scheduler: settings.scheduler, denoise: settings.denoise,
            model: ['79', 0], positive: ['84', 0], negative: ['85', 0], latent_image: ['82', 0] }),
        '54': node('VAEDecode', { samples: ['53', 0], vae: ['57', 0] }),
        '29': node('SaveImage', { filename_prefix: settings.filenamePrefix, images: ['54', 0] }),
    };
    const capabilities = info ? getKrea2EditCapabilities(info) : { position: true, positionA: true, targetLatent: true };
    if (capabilities.position) workflow['79'].inputs.ref_position = settings.position;
    if (capabilities.positionA) workflow['79'].inputs.ref_position_a = settings.positionA;
    if (capabilities.targetLatent) workflow['79'].inputs.target_latent = ['82', 0];
    let model: [string, number] = ['55', 0];
    settings.loras.forEach((lora, index) => {
        if (!lora.enabled || lora.strength === 0) return;
        const id = ['71', '113', '114', 'krea_lora_4'][index];
        workflow[id] = node('LoraLoaderModelOnly', { lora_name: lora.name, strength_model: lora.strength, model });
        model = [id, 0];
    });
    workflow['79'].inputs.model = model;
    if (settings.secondImage && second) {
        workflow['90'] = node('LoadImage', { image: second });
        workflow['krea_encode_b'] = node('VAEEncode', { pixels: ['90', 0], vae: ['57', 0] });
        workflow['79'].inputs.source_latent_b = ['krea_encode_b', 0];
        workflow['79'].inputs.source_image_b = ['90', 0];
        workflow['84'].inputs.image_b = ['90', 0];
        workflow['85'].inputs.image_b = ['90', 0];
    }
    return workflow;
};

export const validateKrea2EditReadiness = (workflow: Krea2EditWorkflow, info: Krea2EditObjectInfo): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(type => !info?.[type]);
    if (missing.length) throw new Error(`KREA2 edit missing nodes: ${missing.join(', ')}. Install ComfyUI-Krea2Edit v2.0.0+ and restart ComfyUI.`);
    const patch = info?.Krea2EditModelPatch?.input;
    const encoder = info?.Krea2EditGroundedEncode?.input;
    for (const [input, schema] of [
        ...['vae', 'source_image', 'ref_boost', 'ref_boost_a', 'fit_mode'].map(input => [input, patch] as const),
        ...['ref_position', 'ref_position_a', 'target_latent'].filter(input => input in workflow['79'].inputs).map(input => [input, patch] as const),
        ...['grounding_px', 'system_prompt', 'image'].map(input => [input, encoder] as const),
        ...(workflow['90'] ? [['source_image_b', patch], ['source_latent_b', patch], ['image_b', encoder]] as const : []),
    ]) {
        if (!schema?.required?.[input] && !schema?.optional?.[input]) throw new Error(`KREA2 edit input "${input}" is unavailable. Update ComfyUI-Krea2Edit to v2.0.0+; stock or old nodes cannot preserve this conditioning.`);
    }
    const selections: Record<string, string[]> = {
        UNETLoader: ['unet_name', 'weight_dtype'], CLIPLoader: ['clip_name', 'type', 'device'], VAELoader: ['vae_name'],
        LoraLoaderModelOnly: ['lora_name'], KSampler: ['sampler_name', 'scheduler'], Krea2EditModelPatch: ['fit_mode', 'ref_position', 'ref_position_a'],
    };
    for (const node of Object.values(workflow)) for (const input of selections[node.class_type] || []) {
        if (!(input in node.inputs)) continue;
        const choices = getQwen21Choices(info, node.class_type, input);
        if (!choices.includes(String(node.inputs[input]))) throw new Error(`Unavailable KREA2 edit ${input}: ${node.inputs[input]}. Select an installed model or supported option.`);
    }
};
