// Fix: Implemented the full ComfyUI service to resolve module errors.
// This service handles communication with a ComfyUI backend, including checking
// connection status, fetching server info, generating prompts via Gemini,
// and running portrait generation workflows.
import { GoogleGenAI, Type } from "@google/genai";
import type { GenerationOptions } from '../types';
import { fileToGenerativePart } from "../utils/imageUtils";
import { COMFYUI_SD15_WORKFLOW_TEMPLATE, COMFYUI_WORKFLOW_TEMPLATE, COMFYUI_WAN22_WORKFLOW_TEMPLATE, COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE, COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE, COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE } from '../constants';

// --- State Management ---
let objectInfoCache: any | null = null;
let isFetchingInfo = false;

// --- Helper Functions ---
const getComfyUIUrl = (): string => {
    const url = localStorage.getItem('comfyui_url');
    if (!url) throw new Error("ComfyUI URL not set. Please configure it in the settings.");
    return url.endsWith('/') ? url.slice(0, -1) : url;
};

const getClientId = (): string => {
    let clientId = sessionStorage.getItem('comfyui_client_id');
    if (!clientId) {
        clientId = Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('comfyui_client_id', clientId);
    }
    return clientId;
};

const fetchWithRetry = async (url: string, retries = 3, delay = 500): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return response;
            }
            console.warn(`Fetch attempt ${i + 1} failed with status: ${response.statusText}`);
        } catch (error) {
            console.warn(`Fetch attempt ${i + 1} failed with error:`, error);
        }
        if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Simple exponential backoff
        }
    }
    throw new Error(`Failed to fetch from ${url} after ${retries} attempts. Check server logs and CORS settings.`);
};

const uploadImage = async (imageFile: File): Promise<{ name: string, subfolder: string, type: string }> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('overwrite', 'true'); // Overwrite if file with same name exists

    const baseUrl = getComfyUIUrl();
    const response = await fetch(`${baseUrl}/upload/image`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload image: ${response.statusText} - ${errorText}`);
    }

    return await response.json();
};

// --- API Functions ---
export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
    if (!url || !url.startsWith('http')) {
        return { success: false, error: 'A valid URL (http://... or https://...) is not provided.' };
    }
    try {
        const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const statsUrl = `${cleanUrl}/system_stats`;
        const response = await fetch(statsUrl, { 
            method: 'GET', 
            mode: 'cors' 
        });
        if (!response.ok) {
             const errorText = await response.text().catch(() => 'Could not read error response.');
             const corsError = "If you see a 'Failed to fetch' or CORS error, you must start ComfyUI with the '--enable-cors' flag.";
             throw new Error(`Server responded with status: ${response.statusText} (${response.status}). ${errorText.includes('Not Found') ? '' : corsError}`);
        }
        await response.json(); // Ensure the body is valid JSON as expected.
        return { success: true };
    } catch (error: any) {
        console.error("ComfyUI connection check failed:", error);
        const corsError = "If you see a 'Failed to fetch' or CORS error, you must start ComfyUI with the '--enable-cors' flag.";
        const finalMessage = error.message.includes('--enable-cors') ? error.message : `${error.message}. ${corsError}`;
        return { success: false, error: `Connection failed: ${finalMessage}. Check URL and server status.` };
    }
};

export const getComfyUIObjectInfo = async (): Promise<any> => {
    if (objectInfoCache) return objectInfoCache;
    if (isFetchingInfo) { // Prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 200));
        return getComfyUIObjectInfo();
    }
    isFetchingInfo = true;

    try {
        const baseUrl = getComfyUIUrl();
        const response = await fetch(`${baseUrl}/object_info`);
        if (!response.ok) throw new Error(`Failed to fetch object info: ${response.statusText}`);
        const data = await response.json();
        objectInfoCache = data;
        return data;
    } catch (error) {
        console.error("Error fetching ComfyUI object info:", error);
        objectInfoCache = {}; // Cache error state to prevent retries
        throw error;
    } finally {
        isFetchingInfo = false;
    }
};

const queuePrompt = async (prompt: object): Promise<any> => {
    const baseUrl = getComfyUIUrl();
    const response = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: getClientId() }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }
    return await response.json();
};

const getImageAsDataUrl = async (filename: string, subfolder: string, type: string): Promise<string> => {
    const baseUrl = getComfyUIUrl();
    const url = new URL(`${baseUrl}/view`);
    url.searchParams.append('filename', filename);
    url.searchParams.append('subfolder', subfolder);
    url.searchParams.append('type', type);
    
    // Use the new resilient fetch function
    const response = await fetchWithRetry(url.toString());
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const buildWan22Workflow = (options: GenerationOptions): any => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_WORKFLOW_TEMPLATE));

    // --- Positive & Negative Prompts (Node 3, 4) ---
    let finalPositivePrompt = options.comfyPrompt || '';
    if (options.addTextToImage && options.textOnImagePrompt?.trim() && options.textObjectPrompt?.trim()) {
        let textInstruction = options.textObjectPrompt;
        const userText = options.textOnImagePrompt;
        if (textInstruction.includes('%s')) {
            textInstruction = textInstruction.replace('%s', `'${userText}'`);
        } else {
            textInstruction = `${textInstruction} with the text '${userText}'`;
        }
        finalPositivePrompt = `The image must include ${textInstruction}, clearly legible. ${finalPositivePrompt}`;
    }
    workflow['3'].inputs.text = finalPositivePrompt;
    workflow['4'].inputs.text = options.comfyNegativePrompt || 'blurry, low quality';

    // --- Latent Image Size (Node 5) ---
    const [w, h] = options.aspectRatio.split(':').map(Number);
    const baseRes = w > h ? 1280 : 720;
    workflow['5'].inputs.width = w > h ? baseRes : Math.round(baseRes * (w / h));
    workflow['5'].inputs.height = h >= w ? baseRes : Math.round(baseRes * (h / w));
    workflow['5'].inputs.width = Math.round(workflow['5'].inputs.width / 8) * 8;
    workflow['5'].inputs.height = Math.round(workflow['5'].inputs.height / 8) * 8;
    
    // --- Core Models (Nodes 38, 39, 22, 8) ---
    workflow['38'].inputs.unet_name = options.comfyWanHighNoiseModel || 'Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf';
    workflow['39'].inputs.unet_name = options.comfyWanLowNoiseModel || 'Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf';
    workflow['22'].inputs.clip_name = options.comfyWanClipModel || 'umt5_xxl_fp8_e4m3fn_scaled.safetensors';
    workflow['8'].inputs.vae_name = options.comfyWanVaeModel || 'wan_2.1_vae.safetensors';

    // --- Samplers (Nodes 35, 36) ---
    const samplerSettings = {
        steps: options.comfySteps || 6,
        cfg: options.comfyCfg || 1.0,
        sampler_name: options.comfySampler || 'res_2s',
        scheduler: options.comfyScheduler || 'bong_tangent',
    };
    const refinerStart = Math.min(options.comfyWanRefinerStartStep || 3, samplerSettings.steps - 1);
    
    Object.assign(workflow['35'].inputs, samplerSettings, { end_at_step: refinerStart });
    Object.assign(workflow['36'].inputs, samplerSettings, { start_at_step: refinerStart, end_at_step: samplerSettings.steps });

    // --- LoRAs (Nodes 30, 29, 14 for High; 43, 44, 45 for Low) ---
    const fusionXStrength = options.comfyWanUseFusionXLora ? options.comfyWanFusionXLoraStrength : 0.0;
    workflow['30'].inputs.lora_name = options.comfyWanFusionXLoraName || 'Wan2.1_T2V_14B_FusionX_LoRA.safetensors';
    workflow['30'].inputs.strength_model = fusionXStrength;
    workflow['30'].inputs.strength_clip = fusionXStrength;
    workflow['43'].inputs.lora_name = options.comfyWanFusionXLoraName || 'Wan2.1_T2V_14B_FusionX_LoRA.safetensors';
    workflow['43'].inputs.strength_model = fusionXStrength;

    const lightningStrength = options.comfyWanUseLightningLora ? options.comfyWanLightningLoraStrength : 0.0;
    workflow['29'].inputs.lora_name = options.comfyWanLightningLoraNameHigh || 'Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors';
    workflow['29'].inputs.strength_model = lightningStrength;
    workflow['29'].inputs.strength_clip = lightningStrength;
    workflow['44'].inputs.lora_name = options.comfyWanLightningLoraNameLow || 'Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors';
    workflow['44'].inputs.strength_model = lightningStrength;
    
    const stockStrength = options.comfyWanUseStockPhotoLora ? options.comfyWanStockPhotoLoraStrength : 0.0;
    workflow['14'].inputs.lora_name = options.comfyWanStockPhotoLoraNameHigh || 'stock_photography_wan22_HIGH_v1.safetensors';
    workflow['14'].inputs.strength_model = stockStrength;
    workflow['14'].inputs.strength_clip = stockStrength;
    workflow['45'].inputs.lora_name = options.comfyWanStockPhotoLoraNameLow || 'stock_photography_wan22_LOW_v1.safetensors';
    workflow['45'].inputs.strength_model = stockStrength;

    return workflow;
};

const buildNunchakuWorkflow = (options: GenerationOptions, sourceImageFilename: string): any => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE));

    // Models
    const nunchakuLoader = workflow["22"].inputs;
    nunchakuLoader.model_path = options.comfyNunchakuModel;
    nunchakuLoader.cache_threshold = options.comfyNunchakuCacheThreshold;
    nunchakuLoader.cpu_offload = options.comfyNunchakuCpuOffload;
    nunchakuLoader.attention = options.comfyNunchakuAttention;

    workflow["2"].inputs.clip_name1 = options.comfyNunchakuClipL;
    workflow["2"].inputs.clip_name2 = options.comfyNunchakuT5XXL;
    workflow["1"].inputs.vae_name = options.comfyNunchakuVae;

    // Source Image
    workflow["99"].inputs.image = sourceImageFilename;

    // Prompt
    workflow["25"].inputs.text = options.comfyPrompt;
    workflow["3"].inputs.text = options.comfyNegativePrompt || '';

    // Parameters
    workflow["20"].inputs.steps = options.comfySteps;
    workflow["20"].inputs.cfg = options.comfyCfg;
    workflow["20"].inputs.sampler_name = options.comfySampler;
    workflow["20"].inputs.scheduler = options.comfyScheduler;
    workflow["12"].inputs.guidance = options.comfyFluxGuidanceKontext;

    // Dynamic LoRA Chaining
    let currentModelNode = "22"; // Start with the base model loader
    
    // Turbo LoRA (Node 26)
    if (options.comfyNunchakuUseTurboLora) {
        workflow["26"].inputs.model = [currentModelNode, 0];
        workflow["26"].inputs.lora_name = options.comfyNunchakuTurboLoraName;
        workflow["26"].inputs.lora_strength = options.comfyNunchakuTurboLoraStrength;
        currentModelNode = "26";
    } else {
        workflow["26"].inputs.model = [currentModelNode, 0];
        workflow["26"].inputs.lora_strength = 0;
        currentModelNode = "26";
    }

    // Nudify LoRA (Node 27)
    if (options.comfyNunchakuUseNudifyLora) {
        workflow["27"].inputs.model = [currentModelNode, 0];
        workflow["27"].inputs.lora_name = options.comfyNunchakuNudifyLoraName;
        workflow["27"].inputs.lora_strength = options.comfyNunchakuNudifyLoraStrength;
        currentModelNode = "27";
    } else {
        workflow["27"].inputs.model = [currentModelNode, 0];
        workflow["27"].inputs.lora_strength = 0;
        currentModelNode = "27";
    }
    
    // Detail LoRA (Node 28)
    if (options.comfyNunchakuUseDetailLora) {
        workflow["28"].inputs.model = [currentModelNode, 0];
        workflow["28"].inputs.lora_name = options.comfyNunchakuDetailLoraName;
        workflow["28"].inputs.lora_strength = options.comfyNunchakuDetailLoraStrength;
        currentModelNode = "28";
    } else {
        workflow["28"].inputs.model = [currentModelNode, 0];
        workflow["28"].inputs.lora_strength = 0;
        currentModelNode = "28";
    }

    // Connect the final node in the model chain to the KSampler
    workflow["20"].inputs.model = [currentModelNode, 0];

    return workflow;
};

const buildNunchakuFluxImageWorkflow = (options: GenerationOptions): any => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE));

    // --- Positive Prompt (Node 6) ---
    workflow['6'].inputs.text = options.comfyPrompt || '';

    // --- Models (Nodes 45, 44, 10) ---
    workflow['45'].inputs.model_path = options.comfyNunchakuModel;
    workflow['45'].inputs.attention = options.comfyNunchakuAttention;
    workflow['45'].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
    workflow['44'].inputs.text_encoder1 = options.comfyNunchakuClipL;
    workflow['44'].inputs.text_encoder2 = options.comfyNunchakuT5XXL;
    workflow['10'].inputs.vae_name = options.comfyNunchakuVae;
    
    // --- LoRAs (Nodes 46, 48, 47) ---
    workflow['46'].inputs.lora_name = options.comfyNunchakuTurboLoraName;
    workflow['46'].inputs.lora_strength = options.comfyNunchakuUseTurboLora ? options.comfyNunchakuTurboLoraStrength : 0.0;
    
    workflow['48'].inputs.lora_name = options.comfyNunchakuNudifyLoraName;
    workflow['48'].inputs.lora_strength = options.comfyNunchakuUseNudifyLora ? options.comfyNunchakuNudifyLoraStrength : 0.0;

    workflow['47'].inputs.lora_name = options.comfyNunchakuDetailLoraName;
    workflow['47'].inputs.lora_strength = options.comfyNunchakuUseDetailLora ? options.comfyNunchakuDetailLoraStrength : 0.0;

    // --- Sampler Parameters ---
    workflow['25'].inputs.noise_seed = Math.floor(Math.random() * 1_000_000_000);
    workflow['17'].inputs.steps = options.comfySteps;
    workflow['17'].inputs.scheduler = options.comfyScheduler;
    workflow['16'].inputs.sampler_name = options.comfySampler;
    workflow['26'].inputs.guidance = options.comfyFluxGuidanceKontext;

    // --- ModelSamplingFlux Parameters (Node 30) ---
    workflow['30'].inputs.base_shift = options.comfyNunchakuBaseShift;
    workflow['30'].inputs.max_shift = options.comfyNunchakuMaxShift;

    // --- Latent Image Size (Nodes 27, 30) ---
    const [w, h] = options.aspectRatio.split(':').map(Number);
    const baseRes = 768; // Based on original workflow
    const width = w > h ? baseRes : Math.round(baseRes * (w / h));
    const height = h >= w ? baseRes : Math.round(baseRes * (h / w));
    const finalWidth = Math.round(width / 8) * 8;
    const finalHeight = Math.round(height / 8) * 8;
    
    workflow['27'].inputs.width = finalWidth;
    workflow['27'].inputs.height = finalHeight;
    workflow['30'].inputs.width = finalWidth;
    workflow['30'].inputs.height = finalHeight;
    
    return workflow;
};

const buildFluxKreaWorkflow = (options: GenerationOptions): any => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE));

    // Models
    workflow["186"].inputs.unet_name = options.comfyFluxKreaModel;
    workflow["26"].inputs.clip_name2 = options.comfyFluxKreaClipT5;
    workflow["26"].inputs.clip_name1 = options.comfyFluxKreaClipL;
    workflow["27"].inputs.vae_name = options.comfyFluxKreaVae;
    workflow["101"].inputs.model_name = options.comfyFluxKreaUpscaleModel;

    // Prompt
    workflow["6"].inputs.text = options.comfyPrompt || '';

    // Resolution
    const [wRatio, hRatio] = options.aspectRatio.split(':').map(Number);
    const megapixels = 1.0;
    // Calculate resolution maintaining aspect ratio, aiming for ~1 megapixel total.
    // Ensure final dimensions are divisible by 64 for compatibility.
    const height = Math.round(Math.sqrt(megapixels * 1024 * 1024 / (wRatio / hRatio)) / 64) * 64;
    const width = Math.round(height * (wRatio / hRatio) / 64) * 64;
    workflow["162"].inputs.width = width;
    workflow["162"].inputs.height = height;

    // Parameters
    workflow["163"].inputs.steps = options.comfySteps;

    // LoRAs
    const powerLoraNode = workflow["191"];
    powerLoraNode.widgets_values[2].on = !!options.useP1x4r0maWomanLora;
    powerLoraNode.widgets_values[2].strength = options.p1x4r0maWomanLoraStrength;
    powerLoraNode.widgets_values[2].lora = options.p1x4r0maWomanLoraName;

    powerLoraNode.widgets_values[3].on = !!options.useNippleDiffusionLora;
    powerLoraNode.widgets_values[3].strength = options.nippleDiffusionLoraStrength;
    powerLoraNode.widgets_values[3].lora = options.nippleDiffusionLoraName;
    
    powerLoraNode.widgets_values[4].on = !!options.usePussyDiffusionLora;
    powerLoraNode.widgets_values[4].strength = options.pussyDiffusionLoraStrength;
    powerLoraNode.widgets_values[4].lora = options.pussyDiffusionLoraName;
    
    // Upscaler Toggle Logic
    const upscalerNodeIds = ["51", "100", "101", "102", "110", "111", "170"];
    if (options.comfyFluxKreaUseUpscaler) {
        // Enable upscaler path
        for (const id of upscalerNodeIds) {
            if (workflow[id]) workflow[id].mode = 0; // Set to "Always"
        }
        workflow["171"].mode = 2; // Mute original save
        
        // Set upscaler parameters
        workflow["51"].inputs.steps = options.comfyFluxKreaUpscalerSteps;
        workflow["51"].inputs.denoise = options.comfyFluxKreaDenoise;
    } else {
        // Disable upscaler path
        for (const id of upscalerNodeIds) {
            if (workflow[id]) workflow[id].mode = 2; // Set to "Muted"
        }
        workflow["171"].mode = 0; // Enable original save
    }

    return workflow;
};


const buildWorkflow = (options: GenerationOptions, sourceImageFilename?: string | null): any => {
    if (options.comfyModelType === 'wan2.2') {
        return buildWan22Workflow(options);
    }
    if (options.comfyModelType === 'nunchaku-kontext-flux') {
        if (!sourceImageFilename) throw new Error("Nunchaku workflow requires a source image filename.");
        return buildNunchakuWorkflow(options, sourceImageFilename);
    }
    if (options.comfyModelType === 'nunchaku-flux-image') {
        return buildNunchakuFluxImageWorkflow(options);
    }
    if (options.comfyModelType === 'flux-krea') {
        return buildFluxKreaWorkflow(options);
    }

    const template = options.comfyModelType === 'sd1.5' 
        ? COMFYUI_SD15_WORKFLOW_TEMPLATE 
        : COMFYUI_WORKFLOW_TEMPLATE; // Default to SDXL
    const workflow = JSON.parse(JSON.stringify(template));

    const checkPointLoader = workflow['4'];
    const positivePrompt = workflow['6'];
    const negativePrompt = workflow['7'];
    const kSampler = workflow['3'];
    const emptyLatent = workflow['5'];

    checkPointLoader.inputs.ckpt_name = options.comfyModel!;

    // Build the positive prompt, including text overlay if needed
    let finalPositivePrompt = options.comfyPrompt!;
    if (options.addTextToImage && options.textOnImagePrompt?.trim() && options.textObjectPrompt?.trim()) {
        let textInstruction = options.textObjectPrompt;
        const userText = options.textOnImagePrompt;

        if (textInstruction.includes('%s')) {
            textInstruction = textInstruction.replace('%s', `'${userText}'`);
        } else {
            textInstruction = `${textInstruction} with the text '${userText}'`;
        }
        
        finalPositivePrompt = `The image must include ${textInstruction}, clearly legible. ${finalPositivePrompt}`;
    }
    positivePrompt.inputs.text = finalPositivePrompt;
    
    negativePrompt.inputs.text = options.comfyNegativePrompt?.trim() 
        ? options.comfyNegativePrompt 
        : "blurry, low quality, bad anatomy, worst quality, jpeg artifacts, ugly, deformed, disfigured, text, watermark, signature";
    kSampler.inputs.steps = options.comfySteps!;
    kSampler.inputs.cfg = options.comfyCfg!;
    kSampler.inputs.sampler_name = options.comfySampler!;
    kSampler.inputs.scheduler = options.comfyScheduler!;
    kSampler.inputs.seed = Math.floor(Math.random() * 1_000_000_000);

    const [w, h] = options.aspectRatio.split(':').map(Number);
    const baseRes = options.comfyModelType === 'sd1.5' ? 512 : 1024;
    emptyLatent.inputs.width = w > h ? baseRes : Math.round(baseRes * (w / h));
    emptyLatent.inputs.height = h >= w ? baseRes : Math.round(baseRes * (h / w));
    emptyLatent.inputs.width = Math.round(emptyLatent.inputs.width / 8) * 8;
    emptyLatent.inputs.height = Math.round(emptyLatent.inputs.height / 8) * 8;
    
    if (options.comfyModelType === 'flux' && options.comfyFluxNodeName) {
        delete workflow['3']; // Delete KSampler
        workflow['20'] = {
            inputs: {
                guidance: options.comfyFluxGuidance,
                model: ["4", 0],
                positive: ["6", 0],
                negative: ["7", 0],
                latent: ["5", 0]
            },
            class_type: options.comfyFluxNodeName,
            _meta: { title: "FLUX Guidance Sampler" }
        };
        workflow['8'].inputs.samples = ["20", 0];
    }
    
    // --- LORA INJECTION ---
    if (options.comfySdxlUseLora && options.comfySdxlLoraName) {
        // 1. Create the LoRA Loader node
        workflow['10'] = {
            "inputs": {
                "lora_name": options.comfySdxlLoraName,
                "strength_model": options.comfySdxlLoraStrength,
                "strength_clip": options.comfySdxlLoraStrength,
                "model": ["4", 0], // Output of CheckpointLoader
                "clip": ["4", 1]  // Output of CheckpointLoader
            },
            "class_type": "LoraLoader",
            "_meta": { "title": "LoRA Loader" }
        };

        // 2. Re-wire the KSampler to use the LoRA's model output
        if (workflow['3']) { // Standard KSampler
            workflow['3'].inputs.model = ["10", 0];
        } else if (workflow['20']) { // FLUX Sampler
             workflow['20'].inputs.model = ["10", 0];
        }

        // 3. Re-wire the prompt encoders to use the LoRA's clip output
        workflow['6'].inputs.clip = ["10", 1];
        workflow['7'].inputs.clip = ["10", 1];
    }


    return workflow;
};

// --- Exported Service Functions ---
export const exportComfyUIWorkflow = (options: GenerationOptions, sourceImage?: File | null): void => {
    let imageName = "source_image.png";
    if (sourceImage) {
        imageName = sourceImage.name;
    }
    const workflow = buildWorkflow(options, imageName);
    const jsonString = JSON.stringify(workflow, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: GenerationOptions['comfyModelType']): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const imagePart = await fileToGenerativePart(sourceImage);
    const basePrompt = "Analyze this image of a person and generate a descriptive text prompt for a text-to-image AI model. Focus on subject, expression, clothing, and background style.";
    
    let systemInstruction;
    if (modelType === 'flux' || modelType === 'nunchaku-kontext-flux' || modelType === 'nunchaku-flux-image' || modelType === 'flux-krea') {
        systemInstruction = "You are a prompt generator for the FLUX.1 image model. Create a highly detailed, narrative prompt. Do not use commas; instead, use natural language conjunctions like 'and', 'with', 'wearing a'. Describe the scene, mood, and lighting in a conversational style.";
    } else if (modelType === 'wan2.2') {
         systemInstruction = "You are a prompt generator for the WAN 2.2 image model. Create a detailed, artistic prompt focusing on atmosphere, color, and emotional tone. Describe the subject's appearance, clothing, and the environment with rich, evocative language. Mention camera angles and lighting styles like 'cinematic lighting' or 'soft focus'.";
    } else if (modelType === 'sd1.5') {
        systemInstruction = "You are a prompt generator for Stable Diffusion 1.5. Describe the image using very simple, direct, comma-separated keywords. Be extremely concise and focus only on the most basic elements of the subject and scene.";
    } else { // 'sdxl'
        systemInstruction = "You are a prompt generator for the Stable Diffusion (SDXL) image model. Create a concise, keyword-driven prompt under 75 words. Use comma-separated keywords and phrases. Prioritize key elements: subject, clothing, action, setting, and style. Be direct and specific.";
    }

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: basePrompt }] },
            config: {
                systemInstruction: systemInstruction,
            },
        });

        const text = result.text.trim();
        if (!text) throw new Error("The AI did not return a prompt. The image might be unsupported.");
        return text;
    } catch (error: any) {
        console.error("Error generating ComfyUI prompt:", error);
        throw new Error(error.message || "Failed to generate prompt from image.");
    }
};

export const extractBackgroundPromptFromImage = async (
  sourceImage: File,
  modelType: 'sd1.5' | 'sdxl' | 'flux'
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const imagePart = await fileToGenerativePart(sourceImage);
    const basePrompt = "Analyze this image and generate a descriptive text prompt for a text-to-image AI model. Focus exclusively on the background, describing the environment, lighting, and mood. Ignore any people, characters, or foreground objects completely.";
    
    let systemInstruction;
    if (modelType === 'flux') {
        systemInstruction = "You are a prompt generator for the FLUX.1 image model. Describe only the background of the image in a highly detailed, narrative style. Do not use commas; use natural conjunctions. Focus on scene, mood, and lighting in a conversational tone.";
    } else if (modelType === 'sdxl') {
        systemInstruction = "You are a prompt generator for the Stable Diffusion (SDXL) image model. Describe only the background of the image using concise, comma-separated keywords and phrases. Keep the prompt under 75 words and focus on key background elements.";
    } else { // 'sd1.5'
        systemInstruction = "You are a prompt generator for Stable Diffusion 1.5. Describe only the background of the image using very simple, direct, comma-separated keywords. Be extremely concise and prioritize basic elements.";
    }

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: basePrompt }] },
            config: {
                systemInstruction: systemInstruction,
            },
        });

        const text = result.text.trim();
        if (!text) throw new Error("The AI did not return a prompt. The image might be unsupported.");
        return text;
    } catch (error: any) {
        console.error("Error extracting background prompt:", error);
        throw new Error(error.message || "Failed to extract background prompt from image.");
    }
};

export const extractSubjectPromptFromImage = async (
  sourceImage: File,
  modelType: 'sd1.5' | 'sdxl' | 'flux'
): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const imagePart = await fileToGenerativePart(sourceImage);
    const basePrompt = "Analyze this image and generate a descriptive text prompt for a text-to-image AI model. Focus exclusively on the main subject(s) (people, animals, objects). Describe their appearance, clothing, pose, expression, and any objects they are interacting with. Completely ignore the background and environment.";
    
    let systemInstruction;
    if (modelType === 'flux') {
        systemInstruction = "You are a prompt generator for the FLUX.1 image model. Describe only the main subject(s) of the image in a highly detailed, narrative style. Do not use commas; use natural conjunctions. Focus on their appearance, clothing, pose, and expression.";
    } else if (modelType === 'sdxl') {
        systemInstruction = "You are a prompt generator for the Stable Diffusion (SDXL) image model. Describe only the main subject(s) of the image using concise, comma-separated keywords and phrases. Keep the prompt under 75 words and focus on key details like clothing, pose, and appearance.";
    } else { // 'sd1.5'
        systemInstruction = "You are a prompt generator for Stable Diffusion 1.5. Describe only the main subject(s) of the image using very simple, direct, comma-separated keywords. Be extremely concise and prioritize basic elements like clothing type and main action.";
    }

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: basePrompt }] },
            config: {
                systemInstruction: systemInstruction,
            },
        });

        const text = result.text.trim();
        if (!text) throw new Error("The AI did not return a prompt. The image might be unsupported.");
        return text;
    } catch (error: any) {
        console.error("Error extracting subject prompt:", error);
        throw new Error(error.message || "Failed to extract subject prompt from image.");
    }
};

export const generateMagicalPromptSoup = async (
  fullPrompt: string,
  backgroundPrompt: string,
  subjectPrompt: string,
  modelType: 'sd1.5' | 'sdxl' | 'flux',
  creativity: number // 0 to 1
): Promise<{ text: string, source: number }[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const availablePrompts = [
        fullPrompt && `1. Full Scene Prompt: "${fullPrompt}"`,
        backgroundPrompt && `2. Background-Only Prompt: "${backgroundPrompt}"`,
        subjectPrompt && `3. Subject-Only Prompt: "${subjectPrompt}"`
    ].filter(Boolean).join('\n');

    if (!availablePrompts) {
        throw new Error("At least one source prompt must be generated to create a soup.");
    }

    const basePrompt = `
      You are an expert prompt creator for generative AI art models. Your task is to create a "Magical Prompt Soup".
      This means you will take elements from the provided source prompts and creatively mash them up into a single, new, and highly imaginative prompt.
      The creativity level is ${creativity} (0 is faithful, 1 is wild).

      **Your output MUST be a JSON array of objects, each with a "text" segment and its "source" number.**

      **RULES FOR SOURCE ATTRIBUTION (VERY IMPORTANT):**
      1.  **Tag Faithfully:** If a text segment is taken directly from or is a clear paraphrase of a source prompt, you MUST tag it with the correct source number.
          - \`source: 1\`: From the "Full Scene Prompt".
          - \`source: 2\`: From the "Background-Only Prompt".
          - \`source: 3\`: From the "Subject-Only Prompt".
      2.  **Use \`source: 0\` Sparingly:** Only use \`source: 0\` for completely new creative additions, simple connecting words (like 'and', 'with', 'in a style of'), or concepts that are a true fusion of multiple sources and cannot be attributed to a single one. **Do not default to \`source: 0\` for paraphrased content.**
      3.  **Break It Down:** Break the final prompt down into many small, meaningful phrases for the 'text' values. This ensures accurate color-coding.
      4.  **Coherency:** When all 'text' values are joined with a single space, they must form a coherent and grammatically correct final prompt.

      **EXAMPLE:**
      - Source 2: "a sunlit forest"
      - Source 3: "a woman in a red dress"
      - Good JSON Output:
        [
          {"text": "a woman in a red dress", "source": 3},
          {"text": "in a", "source": 0},
          {"text": "sun-drenched forest", "source": 2}
        ]
      - Bad JSON Output (loses color):
        [
          {"text": "a woman in a red dress in a sun-drenched forest", "source": 0}
        ]


      Here are your source prompts:
      ${availablePrompts}
    `;

    let systemInstruction;
    if (modelType === 'flux') {
        systemInstruction = "You are a prompt generator for the FLUX.1 image model. Create a highly detailed, narrative prompt soup. Do not use commas; use natural language conjunctions. The final prompt should be a single, flowing paragraph. Ensure your output is a valid JSON array as instructed.";
    } else if (modelType === 'sdxl') {
        systemInstruction = "You are a prompt generator for the Stable Diffusion (SDXL) image model. Create a concise, keyword-driven prompt soup under 75 words, using comma-separated phrases. Combine elements from the source prompts into a fresh set of keywords. Ensure your output is a valid JSON array as instructed.";
    } else { // 'sd1.5'
        systemInstruction = "You are a prompt generator for Stable Diffusion 1.5. Create a very simple, direct, comma-separated keyword prompt soup. Be extremely concise. Combine only the most impactful keywords. Ensure your output is a valid JSON array as instructed.";
    }
    
    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
            text: {
                type: Type.STRING,
                description: 'A segment of the generated prompt.',
            },
            source: {
                type: Type.INTEGER,
                description: 'The source of inspiration for this text segment. Use 1 for the Full Scene Prompt, 2 for the Background-Only Prompt, 3 for the Subject-Only Prompt, and 0 for newly generated or heavily mixed content.',
            },
            },
            required: ['text', 'source'],
        },
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: basePrompt }] },
            config: {
                systemInstruction: systemInstruction,
                temperature: creativity,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const jsonStr = response.text.trim();
        if (!jsonStr) throw new Error("The AI did not return a prompt. Try adjusting creativity or source prompts.");
        
        const parsedJson = JSON.parse(jsonStr);
        // Basic validation
        if (!Array.isArray(parsedJson) || (parsedJson.length > 0 && (typeof parsedJson[0].text === 'undefined' || typeof parsedJson[0].source === 'undefined'))) {
            throw new Error("AI returned an invalid JSON structure.");
        }

        return parsedJson;

    } catch (error: any) {
        console.error("Error generating prompt soup:", error);
        throw new Error(error.message || "Failed to generate Magical Prompt Soup.");
    }
};

export const generateComfyUIPortraits = async (
    sourceImage: File | null,
    options: GenerationOptions,
    onProgress: (message: string, progress: number) => void
): Promise<{ images: string[], finalPrompt: string }> => {
    const clientId = getClientId();
    const baseUrl = getComfyUIUrl();

    return new Promise((resolve, reject) => {
        onProgress("Establishing WebSocket connection...", 0.01);
        const url = new URL(baseUrl);
        const wsProtocol = url.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${wsProtocol}://${url.host}/ws?clientId=${clientId}`);
        
        const queuedPromptIds = new Set<string>();
        const executedPromptIds = new Set<string>();
        const imageMetadata: any[] = [];
        const totalImagesToGenerate = options.numImages;
        let isCompleted = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let finalPromptForDisplay: string | null = null; // Variable to store the final prompt

        const cleanupAndEnd = (action: 'resolve' | 'reject', data: any) => {
            if (isCompleted) return;
            isCompleted = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            if (action === 'resolve') {
                resolve(data);
            } else {
                console.error("ComfyUI generation failed:", data);
                reject(data instanceof Error ? data : new Error(String(data)));
            }
        };
        
        const checkCompletion = async () => {
            if (queuedPromptIds.size > 0 && executedPromptIds.size === queuedPromptIds.size) {
                 if (imageMetadata.length === 0) {
                    cleanupAndEnd('reject', new Error("Generation finished, but no images were produced. Check the ComfyUI console for errors, such as missing models."));
                    return;
                }
                onProgress("All generations complete. Downloading results...", 0.98);
                try {
                    const imageDataUrls = await Promise.all(
                        imageMetadata.map(img => getImageAsDataUrl(img.filename, img.subfolder, img.type))
                    );
                    cleanupAndEnd('resolve', { images: imageDataUrls, finalPrompt: finalPromptForDisplay || options.comfyPrompt! });
                } catch(e) {
                    cleanupAndEnd('reject', e as Error);
                }
            }
        };

        ws.onclose = (event) => {
            if (!isCompleted) {
                let reason = `WebSocket closed unexpectedly (Code: ${event.code}).`;
                if (event.code === 1006) {
                    reason += " This may happen if the ComfyUI server is stopped or crashes. Please check the server console.";
                }
                cleanupAndEnd('reject', new Error(reason));
            }
        };

        ws.onerror = () => cleanupAndEnd('reject', new Error("WebSocket connection failed. Ensure your ComfyUI server is running and accessible."));
        
        ws.onopen = async () => {
            let uploadedImageName: string | null = null;
            
            try {
                if (options.comfyModelType === 'nunchaku-kontext-flux') {
                    if (!sourceImage) {
                        return cleanupAndEnd('reject', new Error('Nunchaku Kontext Flux requires a source image.'));
                    }
                    onProgress('Uploading source image...', 0.05);
                    const uploadResponse = await uploadImage(sourceImage);
                    uploadedImageName = uploadResponse.name;
                }

                onProgress(`Queueing ${totalImagesToGenerate} images...`, 0.10);
                for (let i = 0; i < totalImagesToGenerate; i++) {
                    const workflow = buildWorkflow(options, uploadedImageName);
                    
                    if (i === 0) {
                        const positivePromptNodeKey = Object.keys(workflow).find(k => workflow[k]._meta?.title?.toLowerCase().includes("positive prompt"));
                        if (positivePromptNodeKey) {
                            finalPromptForDisplay = workflow[positivePromptNodeKey].inputs.text;
                        } else {
                            finalPromptForDisplay = options.comfyPrompt!;
                        }
                    }

                    // Use a different seed for each image
                    const samplerNodeKeys = Object.keys(workflow).filter(k => workflow[k].class_type.includes('Sampler') || workflow[k].class_type.includes('Noise'));
                    samplerNodeKeys.forEach(key => {
                        if (workflow[key].inputs.seed !== undefined) {
                            workflow[key].inputs.seed = Math.floor(Math.random() * 1_000_000_000);
                        }
                        if (workflow[key].inputs.noise_seed !== undefined) {
                            workflow[key].inputs.noise_seed = Math.floor(Math.random() * 1_000_000_000);
                        }
                    });
                    
                    const response = await queuePrompt(workflow);
                    if (response.prompt_id) {
                        queuedPromptIds.add(response.prompt_id);
                    } else if (response.error) {
                        throw new Error(`ComfyUI error: ${response.error.type} - ${response.error.message}`);
                    }
                     else {
                        throw new Error("Failed to get prompt_id from queue response.");
                    }
                }
                onProgress("Waiting for generation to start...", 0.15);
                
                timeoutId = setTimeout(() => {
                    cleanupAndEnd('reject', new Error("Generation timed out. The ComfyUI server didn't start processing the request. Please restart ComfyUI and check its console for any errors."));
                }, 45000);

            } catch (error) {
                cleanupAndEnd('reject', error as Error);
            }
        };

        ws.onmessage = (event) => {
            try {
                if (typeof event.data !== 'string') return;
                const data = JSON.parse(event.data);
                
                if (timeoutId && ['progress', 'executing', 'executed', 'execution_error'].includes(data.type)) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                const executedCount = executedPromptIds.size;
                switch (data.type) {
                    case 'progress': {
                        const { value, max } = data.data;
                        const currentProgress = value / max;
                        const progressPercentage = 0.15 + (0.80 * ((executedCount + currentProgress) / totalImagesToGenerate));
                        onProgress(`Image ${executedCount + 1}: Sampling step ${value}/${max}`, Math.min(progressPercentage, 0.95));
                        break;
                    }
                    case 'executing': {
                        const promptId = data.data.prompt_id;
                        if (queuedPromptIds.has(promptId)) {
                             const progress = 0.15 + (0.80 * (executedCount / totalImagesToGenerate));
                             onProgress(`Image ${executedCount + 1}: Starting generation...`, Math.min(progress, 0.95));
                        }
                        break;
                    }
                    case 'executed': {
                        const promptId = data.data.prompt_id;
                        if (executedPromptIds.has(promptId)) break; 
                        
                        if (queuedPromptIds.has(promptId) && data.data.output.images) {
                            executedPromptIds.add(promptId);
                            imageMetadata.push(...data.data.output.images);
                            const newExecutedCount = executedPromptIds.size;
                            if (newExecutedCount < totalImagesToGenerate) {
                                const progress = 0.15 + (0.80 * (newExecutedCount / totalImagesToGenerate));
                                onProgress(`Image ${newExecutedCount} complete. Waiting for next...`, progress);
                            }
                            checkCompletion();
                        }
                        break;
                    }
                    case 'execution_error': {
                         const promptId = data.data.prompt_id;
                         if (queuedPromptIds.has(promptId)) {
                            const message = data.data.exception_message;
                            cleanupAndEnd('reject', new Error(`Execution error for prompt ${promptId}: ${message}`));
                         }
                         break;
                    }
                }
            } catch (e) {
                cleanupAndEnd('reject', e as Error);
            }
        };
    });
};