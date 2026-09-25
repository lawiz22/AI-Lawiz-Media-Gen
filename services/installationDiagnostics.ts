import { testGeminiConnection } from './geminiService';
import { isConnected as isGoogleDriveConnected } from './googleDriveService';
import { testMammouthConnection } from './mammouthService';
import { testOllamaConnection } from './ollamaService';

export type DiagnosticStatus = 'ready' | 'warning' | 'missing';

export interface BackendDiagnostic {
    id: 'gemini' | 'mammouth' | 'comfyui' | 'ollama' | 'drive';
    name: string;
    configured: boolean;
    connected: boolean;
    message: string;
    version?: string;
    models: string[];
}

export interface ComfyModelInventory {
    checkpoints: string[];
    diffusionModels: string[];
    textEncoders: string[];
    vaes: string[];
    loras: string[];
    upscaleModels: string[];
    latentUpscaleModels: string[];
    seedVrDitModels: string[];
    seedVrVaeModels: string[];
    seedVrModels: string[];
}

export interface NodeDiagnostic {
    name: string;
    pack: string;
    installed: boolean;
    native: boolean;
}

export interface FeatureDiagnostic {
    group: string;
    name: string;
    detail: string;
    status: DiagnosticStatus;
    requirements: Array<{ label: string; met: boolean; optional?: boolean }>;
}

export interface InstallationReport {
    checkedAt: string;
    backends: BackendDiagnostic[];
    comfy: {
        version?: string;
        managerVersion?: string;
        pythonVersion?: string;
        pytorchVersion?: string;
        device?: string;
        objectInfo: Record<string, any>;
        inventory: ComfyModelInventory;
        nodes: NodeDiagnostic[];
    };
    features: FeatureDiagnostic[];
}

const NATIVE_NODES = [
    'AddTextPrefix', 'BasicGuider', 'BasicScheduler', 'CFGGuider', 'CFGNorm', 'CheckpointLoaderSimple',
    'CLIPLoader', 'CLIPTextEncode', 'CLIPVisionEncode', 'CLIPVisionLoader', 'ConditioningZeroOut', 'CreateVideo',
    'DualCLIPLoader', 'EmptyFlux2LatentImage', 'EmptyHunyuanLatentVideo', 'EmptyLatentImage', 'EmptySD3LatentImage',
    'FluxGuidance', 'FluxKontextImageScale', 'Flux2Scheduler', 'GetImageSize', 'ImageScaleBy',
    'ImageScaleToTotalPixels', 'ImageUpscaleWithModel', 'KSampler', 'KSamplerAdvanced', 'KSamplerSelect',
    'LatentUpscaleModelLoader', 'LoadAudio', 'LoadImage', 'LoraLoader', 'LoraLoaderModelOnly', 'LTXVAudioVAEDecode',
    'LTXVConcatAVLatent', 'LTXVConditioning', 'LTXVCropGuides', 'LTXVLatentUpsampler', 'LTXVSeparateAVLatent',
    'MaskToImage', 'ModelSamplingAuraFlow', 'ModelSamplingFlux', 'ModelSamplingSD3', 'PreviewImage', 'RandomNoise',
    'ReferenceLatent', 'SAM3_Detect', 'SamplerCustomAdvanced', 'SaveAudio', 'SaveImage', 'SaveVideo', 'GrowMask',
    'TextEncodeQwenImageEditPlus', 'UNETLoader', 'UpscaleModelLoader', 'VAEDecode', 'VAEEncode', 'VAELoader',
    'WanFirstLastFrameToVideo', 'WanImageToVideo',
] as const;

const CUSTOM_NODE_PACKS: Record<string, readonly string[]> = {
    'ComfyUI-GGUF': ['CLIPLoaderGGUF', 'DualCLIPLoaderGGUF', 'UnetLoaderGGUF'],
    'ComfyUI-MultiGPU': ['CLIPLoaderMultiGPU'],
    'ComfyUI-SeedVR2 Video Upscaler': ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'],
    'ComfyUI-Easy-Use': ['easy cleanGpuUsed', 'easy clearCacheAll', 'easy showAnything'],
    'ComfyUI-Florence2 / pysssss': ['DownloadAndLoadFlorence2Model', 'Florence2Run', 'ShowText|pysssss'],
    'Z-Image Progressive Locked Upscale': ['ZImageTurboProgressiveLockedUpscale'],
    'ComfyUI-KJNodes': ['DrawMaskOnImage', 'LTX2SamplingPreviewOverride', 'PathchSageAttentionKJ', 'StringConstantMultiline', 'VAELoaderKJ'],
    'WhatDreamsCost-ComfyUI': ['LTXDirector', 'LTXDirectorGuide'],
    'ComfyUI-VideoHelperSuite': ['VHS_VideoCombine'],
    'ComfyUI Impact Pack': ['FaceDetailer', 'SAMLoader'],
    'ComfyUI Impact Subpack': ['UltralyticsDetectorProvider'],
    'rgthree-comfy': ['Power Lora Loader (rgthree)'],
    'ControlAltAI Nodes': ['FluxResolutionNode'],
    'VRGameDevGirl Custom Nodes': ['FastFilmGrain'],
    'Simple Readable Metadata-SG': ['SimpleReadableMetadataSG'],
    'TTS Audio Suite': ['ChatterBoxOfficial23LangEngineNode', 'UnifiedTTSTextNode', 'IndexTTSEngineNode', 'IndexTTSEmotionOptionsNode', 'QwenEmotionNode'],
    'ComfyUI ChatterBox Voice': ['ChatterBoxVoiceTTS'],
    'comfy-image-saver / ComfyLiterals': ['String Literal'],
    'ComfyUI ControlNet Aux': ['AIO_Preprocessor'],
    'ComfyUI-CacheDiT': ['CacheDiT_Model_Optimizer'],
    'Masquerade Nodes': ['Cut By Mask'],
    'ComfyUI-RvTools v2': ['Image to RGB [RvTools]'],
} as const;

const getChoices = (value: any): string[] => {
    const choices = Array.isArray(value) && Array.isArray(value[0])
        ? value[0]
        : Array.isArray(value?.[1]?.options)
            ? value[1].options
            : [];
    return choices.filter((choice: unknown): choice is string => typeof choice === 'string');
};

const unique = (...lists: string[][]): string[] => Array.from(new Set(lists.flat())).sort((a, b) => a.localeCompare(b));

const buildInventory = (objectInfo: Record<string, any>): ComfyModelInventory => {
    const seedVrDitModels = getChoices(objectInfo.SeedVR2LoadDiTModel?.input?.required?.model);
    const seedVrVaeModels = getChoices(objectInfo.SeedVR2LoadVAEModel?.input?.required?.model);
    return {
    checkpoints: getChoices(objectInfo.CheckpointLoaderSimple?.input?.required?.ckpt_name),
    diffusionModels: unique(
        getChoices(objectInfo.UNETLoader?.input?.required?.unet_name),
        getChoices(objectInfo.UnetLoaderGGUF?.input?.required?.unet_name),
        getChoices(objectInfo.UnetLoaderGGUF?.input?.required?.gguf_name),
        getChoices(objectInfo.NunchakuFluxDiTLoader?.input?.required?.model_path),
    ),
    textEncoders: unique(
        getChoices(objectInfo.CLIPLoader?.input?.required?.clip_name),
        getChoices(objectInfo.CLIPLoaderGGUF?.input?.required?.clip_name),
        getChoices(objectInfo.DualCLIPLoader?.input?.required?.clip_name1),
        getChoices(objectInfo.DualCLIPLoader?.input?.required?.clip_name2),
    ),
    vaes: unique(
        getChoices(objectInfo.VAELoader?.input?.required?.vae_name),
        getChoices(objectInfo.VAELoaderKJ?.input?.required?.vae_name),
    ),
    loras: unique(
        getChoices(objectInfo.LoraLoader?.input?.required?.lora_name),
        getChoices(objectInfo.LoraLoaderModelOnly?.input?.required?.lora_name),
    ),
    upscaleModels: getChoices(objectInfo.UpscaleModelLoader?.input?.required?.model_name),
    latentUpscaleModels: getChoices(objectInfo.LatentUpscaleModelLoader?.input?.required?.model_name),
    seedVrDitModels,
    seedVrVaeModels,
    seedVrModels: unique(seedVrDitModels, seedVrVaeModels),
    };
};

const normalizeComfyUrl = (value: string): string => {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
};

const fetchJson = async (url: string, signal: AbortSignal): Promise<any> => {
    const response = await fetch(url, { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
};

const readManagerVersion = async (baseUrl: string, signal: AbortSignal): Promise<string | undefined> => {
    for (const path of ['/manager/version', '/manager/get_version']) {
        try {
            const response = await fetch(`${baseUrl}${path}`, { signal, cache: 'no-cache' });
            if (!response.ok) continue;
            const text = await response.text();
            try {
                const payload = JSON.parse(text);
                const version = payload?.version || payload?.manager_version || payload?.data?.version;
                if (version) return String(version);
            } catch {
                if (text.trim()) return text.trim().replace(/^v/i, '');
            }
        } catch {
            // Older Manager releases do not expose a version endpoint.
        }
    }
    return undefined;
};

const includesModel = (models: string[], pattern: RegExp): boolean => models.some(model => pattern.test(model));

interface FeatureSpec {
    group: string;
    name: string;
    detail: string;
    backend?: BackendDiagnostic['id'];
    backends?: BackendDiagnostic['id'][];
    nodes?: string[];
    models?: Array<{ label: string; source: keyof ComfyModelInventory; pattern?: RegExp }>;
    local?: 'browser' | 'electron' | 'electron-comfy-root' | 'drive';
    paths?: Array<{
        label: string;
        backend?: BackendDiagnostic['id'];
        nodes?: string[];
        models?: Array<{ label: string; source: keyof ComfyModelInventory; pattern?: RegExp }>;
    }>;
}

const FEATURE_SPECS: FeatureSpec[] = [
    { group: 'Image Generation', name: 'Gemini image generation', detail: 'T2I, I2I, compose, inpaint and image editing.', backend: 'gemini' },
    { group: 'Image Generation', name: 'Mammouth image generation', detail: 'Cloud image models exposed by Mammouth.', backend: 'mammouth' },
    { group: 'Image Generation', name: 'SD 1.5', detail: 'Text-to-image and refine.', backend: 'comfyui', nodes: ['CheckpointLoaderSimple'], models: [{ label: 'SD 1.5 checkpoint', source: 'checkpoints', pattern: /sd.?1[._ -]?5|v1[._ -]?5|realistic.?vision|deliberate/i }] },
    { group: 'Image Generation', name: 'SD 1.5 Face Detailer', detail: 'Image-to-image face detection and detail pass.', backend: 'comfyui', nodes: ['FaceDetailer', 'SAMLoader', 'UltralyticsDetectorProvider'], models: [{ label: 'SD 1.5 checkpoint', source: 'checkpoints', pattern: /sd.?1[._ -]?5|v1[._ -]?5|realistic.?vision|deliberate/i }] },
    { group: 'Image Generation', name: 'SDXL', detail: 'SDXL text-to-image and refine.', backend: 'comfyui', nodes: ['CheckpointLoaderSimple'], models: [{ label: 'SDXL checkpoint', source: 'checkpoints', pattern: /sdxl|pony|illustrious|noobai|juggernaut.?xl/i }] },
    { group: 'Image Generation', name: 'FLUX', detail: 'Standard FLUX workflow.', backend: 'comfyui', nodes: ['DualCLIPLoader', 'UNETLoader'], models: [{ label: 'FLUX model', source: 'diffusionModels', pattern: /flux(?!2)/i }] },
    { group: 'Image Generation', name: 'Qwen Image T2I', detail: 'Qwen Image GGUF text-to-image.', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoaderGGUF', 'FluxResolutionNode'], models: [{ label: 'Qwen Image model', source: 'diffusionModels', pattern: /qwen.?image/i }] },
    { group: 'Image Generation', name: 'Qwen Image Edit', detail: 'Qwen reference-image editing.', backend: 'comfyui', nodes: ['TextEncodeQwenImageEditPlus'], models: [{ label: 'Qwen Edit model', source: 'diffusionModels', pattern: /qwen.*edit|qwen_image_edit/i }] },
    { group: 'Image Generation', name: 'Z-Image', detail: 'Z-Image generation with optional CacheDiT.', backend: 'comfyui', nodes: ['ModelSamplingAuraFlow'], models: [{ label: 'Z-Image model', source: 'diffusionModels', pattern: /z.?image|z_image/i }] },
    { group: 'Image Generation', name: 'FLUX2 T2I', detail: 'FLUX2 simple text-to-image.', backend: 'comfyui', nodes: ['EmptyFlux2LatentImage', 'Flux2Scheduler', 'ReferenceLatent'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'Image Generation', name: 'FLUX2 Edit', detail: 'FLUX2 multi-reference editing and optional DWPose.', backend: 'comfyui', nodes: ['EmptyFlux2LatentImage', 'Flux2Scheduler', 'ReferenceLatent'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'Image Generation', name: 'KREA2 Simple / RAW', detail: 'KREA2 generation variants.', backend: 'comfyui', nodes: ['Power Lora Loader (rgthree)'], models: [{ label: 'KREA2 model', source: 'diffusionModels', pattern: /krea.?2/i }] },
    { group: 'Character', name: 'Character via Gemini', detail: 'Multi-output cloud character generation.', backend: 'gemini' },
    { group: 'Character', name: 'Character via Mammouth', detail: 'Multi-angle cloud character generation.', backend: 'mammouth' },
    { group: 'Character', name: 'Qwen Character Angles', detail: 'Qwen multi-angle workflow.', backend: 'comfyui', nodes: ['SimpleReadableMetadataSG', 'TextEncodeQwenImageEditPlus'], models: [{ label: 'Qwen Edit model', source: 'diffusionModels', pattern: /qwen.*edit|qwen_image_edit/i }] },
    { group: 'Character', name: 'FLUX2 Character Angles', detail: 'FLUX2 character references and angles.', backend: 'comfyui', nodes: ['EmptyFlux2LatentImage', 'Flux2Scheduler', 'ReferenceLatent'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'LTX Director', name: 'LTX 2.3 Director', detail: 'Timeline video, audio, guides and latent upscaling.', backend: 'comfyui', nodes: ['LTXDirector', 'LTXDirectorGuide', 'LTX2SamplingPreviewOverride', 'VAELoaderKJ', 'LTXVAudioVAEDecode', 'LTXVConcatAVLatent', 'LTXVConditioning', 'LTXVCropGuides', 'LTXVLatentUpsampler', 'LTXVSeparateAVLatent', 'LatentUpscaleModelLoader'], models: [{ label: 'LTX 2.3 checkpoint', source: 'checkpoints', pattern: /ltx.?2[._ -]?3/i }, { label: 'LTX 2.3 video VAE', source: 'vaes', pattern: /ltx.?23.*video/i }, { label: 'LTX 2.3 audio VAE', source: 'vaes', pattern: /ltx.?23.*audio/i }, { label: 'Gemma text encoder', source: 'textEncoders', pattern: /gemma/i }, { label: 'LTX 2.3 text projection', source: 'textEncoders', pattern: /ltx.?2[._ -]?3.*text.*projection/i }, { label: 'LTX 2.3 spatial upscaler', source: 'latentUpscaleModels', pattern: /ltx.?2[._ -]?3.*spatial.*upscal/i }, { label: 'LTX distilled LoRA', source: 'loras', pattern: /ltx.?2.*distill/i }] },
    { group: 'Text to Speech', name: 'ChatterBox Voice Clone', detail: 'Voice cloning from an audio reference.', backend: 'comfyui', nodes: ['ChatterBoxVoiceTTS', 'String Literal'] },
    { group: 'Text to Speech', name: 'ChatterBox Multilingual', detail: '23-language TTS and dialogue fallback.', backend: 'comfyui', nodes: ['ChatterBoxOfficial23LangEngineNode', 'UnifiedTTSTextNode'] },
    { group: 'Text to Speech', name: 'IndexTTS Advanced', detail: 'IndexTTS 2.5 emotions, solo voice and dialogue.', backend: 'comfyui', nodes: ['IndexTTSEngineNode', 'IndexTTSEmotionOptionsNode', 'UnifiedTTSTextNode'] },
    { group: 'Text to Speech', name: 'IndexTTS Auto Qwen Emotion', detail: 'Automatic emotion instructions generated by Qwen.', backend: 'comfyui', nodes: ['IndexTTSEngineNode', 'IndexTTSEmotionOptionsNode', 'UnifiedTTSTextNode', 'QwenEmotionNode'] },
    { group: 'Prompt', name: 'Prompt from Image', detail: 'Mammouth, Ollama or ComfyUI Florence2 analysis.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'Ollama path', backend: 'ollama' },
        { label: 'Florence2 path', backend: 'comfyui', nodes: ['Florence2Run', 'DownloadAndLoadFlorence2Model', 'ShowText|pysssss'] },
    ] },
    { group: 'Prompt', name: 'Extract Background', detail: 'Visual background analysis through Mammouth or Ollama.', backends: ['mammouth', 'ollama'] },
    { group: 'Prompt', name: 'Subject / Object', detail: 'Visual subject analysis through Mammouth or Ollama.', backends: ['mammouth', 'ollama'] },
    { group: 'Prompt', name: 'Magical Prompt Soup', detail: 'Prompt mixing through Mammouth or Ollama.', backends: ['mammouth', 'ollama'] },
    { group: 'Extractor', name: 'Clothes Analysis', detail: 'Identify garments through Mammouth or Ollama.', backends: ['mammouth', 'ollama'] },
    { group: 'Extractor', name: 'Clothes Generation', detail: 'Lay out clothes through Mammouth or FLUX2.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'FLUX2 path', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    ] },
    { group: 'Extractor', name: 'Hair', detail: 'Generate isolated hair through Mammouth or FLUX2.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'FLUX2 path', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    ] },
    { group: 'Extractor', name: 'Objects Analysis', detail: 'Identify objects through Mammouth or Ollama.', backends: ['mammouth', 'ollama'] },
    { group: 'Extractor', name: 'Objects Generation', detail: 'Isolate objects through Mammouth or FLUX2.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'FLUX2 path', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    ] },
    { group: 'Extractor', name: 'Poses', detail: 'MediaPipe pose extraction in the browser.', local: 'browser' },
    { group: 'Extractor', name: 'Pose Mannequin Generation', detail: 'Generate mannequin references through Mammouth or FLUX2.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'FLUX2 path', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    ] },
    { group: 'Extractor', name: 'Font', detail: 'Font chart generation through Mammouth or FLUX2.', paths: [
        { label: 'Mammouth path', backend: 'mammouth' },
        { label: 'FLUX2 path', backend: 'comfyui', nodes: ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    ] },
    { group: 'Fun', name: 'Photo Fusion via Mammouth', detail: 'Cloud group photo fusion.', backend: 'mammouth' },
    { group: 'Fun', name: 'Photo Fusion via FLUX2', detail: 'Local multi-reference photo fusion.', backend: 'comfyui', nodes: ['ReferenceLatent', 'Flux2Scheduler'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'Fun', name: 'Photo Fusion via QWEN-Edit', detail: 'Local Qwen multi-person composition.', backend: 'comfyui', nodes: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow', 'CFGNorm', 'TextEncodeQwenImageEditPlus', 'ImageScaleToTotalPixels'], models: [{ label: 'Qwen Edit model', source: 'diffusionModels', pattern: /qwen.*edit|qwen_image_edit/i }] },
    { group: 'Fun', name: 'Past Forward via Mammouth', detail: 'Cloud past/future transformation.', backend: 'mammouth' },
    { group: 'Fun', name: 'Past Forward via FLUX2 / Qwen', detail: 'Local transformation workflows.', backend: 'comfyui', nodes: ['ReferenceLatent'], models: [{ label: 'FLUX2 or Qwen model', source: 'diffusionModels', pattern: /flux.?2|klein|qwen.*edit/i }] },
    { group: 'Fun', name: 'Swap Anything', detail: 'SAM3 selection and FLUX2 replacement.', backend: 'comfyui', nodes: ['SAM3_Detect', 'DrawMaskOnImage', 'Cut By Mask', 'Image to RGB [RvTools]', 'GrowMask'], models: [{ label: 'SAM3 checkpoint', source: 'checkpoints', pattern: /sam3/i }, { label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'Fun', name: 'Stylise Anything', detail: 'FLUX2 style transfer.', backend: 'comfyui', nodes: ['ReferenceLatent', 'Flux2Scheduler'], models: [{ label: 'FLUX2 model', source: 'diffusionModels', pattern: /flux.?2|klein/i }] },
    { group: 'Logo & Design', name: 'Logo Generator', detail: 'Gemini or Mammouth logo generation.', backends: ['gemini', 'mammouth'] },
    { group: 'Logo & Design', name: 'Banner Generator', detail: 'Gemini or Mammouth banner generation.', backends: ['gemini', 'mammouth'] },
    { group: 'Logo & Design', name: 'Album Cover Generator', detail: 'Gemini or Mammouth cover generation.', backends: ['gemini', 'mammouth'] },
    { group: 'Tools', name: 'Frame Extractor', detail: 'Browser video frame extraction.', local: 'browser' },
    { group: 'Tools', name: 'Color Palette Extractor', detail: 'Browser image palette analysis.', local: 'browser' },
    { group: 'Tools', name: 'Resize & Crop', detail: 'Browser canvas image processing.', local: 'browser' },
    { group: 'Tools', name: 'Voice Recorder', detail: 'Browser microphone recording.', local: 'browser' },
    { group: 'Upscale', name: 'SeedVR2 Upscale', detail: 'Image/video upscale through SeedVR2.', backend: 'comfyui', nodes: ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'], models: [{ label: 'SeedVR2 DiT model', source: 'seedVrDitModels' }, { label: 'SeedVR2 VAE model', source: 'seedVrVaeModels' }] },
    { group: 'Upscale', name: 'Z-Image Creative Upscale', detail: 'Florence2 captioning and progressive creative upscale.', backend: 'comfyui', nodes: ['UNETLoader', 'VAELoader', 'CLIPLoaderGGUF', 'Florence2Run', 'DownloadAndLoadFlorence2Model', 'AddTextPrefix', 'easy showAnything', 'ZImageTurboProgressiveLockedUpscale', 'UpscaleModelLoader'], models: [{ label: 'Z-Image model', source: 'diffusionModels', pattern: /z.?image|z_image/i }, { label: 'Qwen text encoder', source: 'textEncoders', pattern: /qwen/i }, { label: 'VAE', source: 'vaes' }, { label: 'Upscale model', source: 'upscaleModels' }] },
    { group: 'Models / LoRAs', name: 'My Library', detail: 'Scan and open local ComfyUI models.', local: 'electron-comfy-root' },
    { group: 'Models / LoRAs', name: 'Civitai Catalog', detail: 'Search and download Civitai models.', local: 'browser' },
    { group: 'Models / LoRAs', name: 'ArchiveCivit', detail: 'Archive model discovery and downloads.', local: 'electron-comfy-root' },
    { group: 'Models / LoRAs', name: 'Library Tools', detail: 'Classify and organize local model files.', local: 'electron-comfy-root' },
    { group: 'Library', name: 'Local Media Library', detail: 'IndexedDB library, tags and metadata.', local: 'browser' },
    { group: 'Library', name: 'Google Drive Sync', detail: 'OAuth-backed library synchronization.', local: 'drive' },
];

const buildFeatures = (
    backends: BackendDiagnostic[],
    objectInfo: Record<string, any>,
    inventory: ComfyModelInventory,
    context: { comfyRootConfigured: boolean },
): FeatureDiagnostic[] => FEATURE_SPECS.map(spec => {
    const requirements: FeatureDiagnostic['requirements'] = [];
    const addPathRequirements = (path: NonNullable<FeatureSpec['paths']>[number]) => {
        const pathRequirements: FeatureDiagnostic['requirements'] = [];
        const backend = path.backend ? backends.find(candidate => candidate.id === path.backend) : undefined;
        if (path.backend) pathRequirements.push({ label: `${path.label}: ${backend?.name || path.backend} connection`, met: Boolean(backend?.connected) });
        for (const node of path.nodes || []) pathRequirements.push({ label: `${path.label}: Node ${node}`, met: Boolean(objectInfo[node]) });
        for (const model of path.models || []) {
            const candidates = inventory[model.source];
            pathRequirements.push({ label: `${path.label}: ${model.label}`, met: model.pattern ? includesModel(candidates, model.pattern) : candidates.length > 0 });
        }
        requirements.push(...pathRequirements);
        return pathRequirements.every(requirement => requirement.met || requirement.optional);
    };
    const completedPaths = spec.paths?.map(addPathRequirements);
    if (spec.backend) {
        const backend = backends.find(candidate => candidate.id === spec.backend);
        requirements.push({ label: `${backend?.name || spec.backend} connection`, met: Boolean(backend?.connected) });
    }
    if (spec.backends) {
        const alternatives = spec.backends.map(id => backends.find(candidate => candidate.id === id)).filter(Boolean) as BackendDiagnostic[];
        requirements.push({ label: alternatives.map(backend => backend.name).join(' or '), met: alternatives.some(backend => backend.connected) });
    }
    for (const node of spec.nodes || []) requirements.push({ label: `Node: ${node}`, met: Boolean(objectInfo[node]) });
    for (const model of spec.models || []) {
        const candidates = inventory[model.source];
        requirements.push({ label: model.label, met: model.pattern ? includesModel(candidates, model.pattern) : candidates.length > 0 });
    }
    if (spec.local === 'browser') requirements.push({ label: 'Built into the application', met: true });
    if (spec.local === 'electron') requirements.push({ label: 'Electron local-file access', met: Boolean(window.electron) });
    if (spec.local === 'electron-comfy-root') requirements.push({ label: 'Electron access and a selected ComfyUI folder', met: Boolean(window.electron) && context.comfyRootConfigured });
    if (spec.local === 'drive') requirements.push({ label: 'Active Google Drive OAuth session and folder', met: isGoogleDriveConnected() });
    const metCount = requirements.filter(requirement => requirement.met || requirement.optional).length;
    const status: DiagnosticStatus = completedPaths
        ? completedPaths.some(Boolean) ? 'ready' : metCount > 0 ? 'warning' : 'missing'
        : metCount === requirements.length ? 'ready' : metCount > 0 ? 'warning' : 'missing';
    return { group: spec.group, name: spec.name, detail: spec.detail, status, requirements };
});

export const runInstallationDiagnostics = async (options: {
    geminiConfigured: boolean;
    mammouthKey: string;
    ollamaUrl: string;
}): Promise<InstallationReport> => {
    const comfyUrl = normalizeComfyUrl(localStorage.getItem('comfyui_url') || '');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    const comfyPromise = comfyUrl
        ? Promise.all([
            fetchJson(`${comfyUrl}/system_stats`, controller.signal),
            fetchJson(`${comfyUrl}/object_info`, controller.signal),
            readManagerVersion(comfyUrl, controller.signal),
        ]).then(([stats, objectInfo, managerVersion]) => ({ success: true as const, stats, objectInfo, managerVersion }))
            .catch((error: any) => ({ success: false as const, error: error?.message || 'Unable to reach ComfyUI.', stats: null, objectInfo: {}, managerVersion: undefined }))
        : Promise.resolve({ success: false as const, error: 'ComfyUI URL is not configured.', stats: null, objectInfo: {}, managerVersion: undefined });

    const drivePromise = (async () => {
        if (!localStorage.getItem('google_client_id')) return { success: false, message: 'Google Client ID is not configured.' };
        if (!localStorage.getItem('google_drive_api_key')) return { success: false, message: 'Google Drive API Key is not configured.' };
        if (!isGoogleDriveConnected()) return { success: false, message: 'No active OAuth session and Drive folder.' };
        const accessToken = window.gapi?.client?.getToken()?.access_token;
        if (!accessToken) return { success: false, message: 'The Google Drive OAuth token is unavailable.' };
        try {
            const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: controller.signal,
                cache: 'no-cache',
            });
            if (!response.ok) return { success: false, message: `Google Drive API returned HTTP ${response.status}. Reconnect your account.` };
            return { success: true, message: 'OAuth session, Drive folder and API access are active.' };
        } catch (error) {
            return { success: false, message: error instanceof Error ? error.message : 'Unable to reach Google Drive.' };
        }
    })();

    const comfyRootPromise = Promise.resolve(window.electron?.getCivitaiSettings?.())
        .then(settings => Boolean(settings?.comfyUIRoot))
        .catch(() => false);
    const [gemini, mammouth, ollama, comfy, comfyRootConfigured, drive] = await Promise.all([
        testGeminiConnection(),
        testMammouthConnection(options.mammouthKey),
        testOllamaConnection(options.ollamaUrl),
        comfyPromise,
        comfyRootPromise,
        drivePromise,
    ]).finally(() => window.clearTimeout(timeoutId));

    const system = comfy.stats?.system || {};
    const objectInfo = comfy.objectInfo || {};
    const inventory = buildInventory(objectInfo);
    const comfyVersion = system.comfyui_version || system.version || comfy.stats?.comfyui_version;
    const backends: BackendDiagnostic[] = [
        { id: 'gemini', name: 'Gemini', configured: options.geminiConfigured, connected: gemini.success, message: gemini.message, models: gemini.models },
        { id: 'mammouth', name: 'Mammouth', configured: Boolean(options.mammouthKey.trim()), connected: mammouth.success, message: mammouth.message, models: [] },
        { id: 'comfyui', name: 'ComfyUI', configured: Boolean(comfyUrl), connected: comfy.success, message: comfy.success ? 'Server, system stats and object inventory are accessible.' : comfy.error, version: comfyVersion, models: unique(inventory.checkpoints, inventory.diffusionModels) },
        { id: 'ollama', name: 'Ollama', configured: Boolean(options.ollamaUrl.trim()), connected: ollama.success, message: ollama.message, models: ollama.models },
        { id: 'drive', name: 'Google Drive', configured: Boolean(localStorage.getItem('google_client_id') && localStorage.getItem('google_drive_api_key')), connected: drive.success, message: drive.message, models: [] },
    ];
    const nodes: NodeDiagnostic[] = [
        ...NATIVE_NODES.map(name => ({ name, pack: 'ComfyUI core / comfy_extras', installed: Boolean(objectInfo[name]), native: true })),
        ...Object.entries(CUSTOM_NODE_PACKS).flatMap(([pack, names]) => names.map(name => ({ name, pack, installed: Boolean(objectInfo[name]), native: false }))),
    ];

    return {
        checkedAt: new Date().toISOString(),
        backends,
        comfy: {
            version: comfyVersion,
            managerVersion: comfy.managerVersion,
            pythonVersion: system.python_version,
            pytorchVersion: system.pytorch_version,
            device: comfy.stats?.devices?.[0]?.name,
            objectInfo,
            inventory,
            nodes,
        },
        features: buildFeatures(backends, objectInfo, inventory, { comfyRootConfigured }),
    };
};