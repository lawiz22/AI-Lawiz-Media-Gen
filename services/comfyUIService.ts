

// Fix: Implemented the full comfyUIService.ts module to resolve all module-not-found errors.
import { GoogleGenAI } from "@google/genai";
import { fileToGenerativePart } from "../utils/imageUtils";
import type { GenerationOptions } from "../types";
import {
  COMFYUI_SD15_WORKFLOW_TEMPLATE,
  COMFYUI_WORKFLOW_TEMPLATE,
  COMFYUI_WAN22_WORKFLOW_TEMPLATE,
  COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE,
  COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE,
  COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE,
  COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE,
} from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Helper Functions ---
const getComfyUIUrl = (): string => {
    const url = localStorage.getItem('comfyui_url');
    if (url && url.endsWith('/')) {
        return url.slice(0, -1);
    }
    return url || '';
};

const getClientId = (): string => `lawiz-app-${Math.random().toString(36).substring(2, 15)}`;

// --- Gemini-based Prompt Generation ---

// Fix: Standardized 'wan2.2' model type string to align with GenerationOptions and fix type errors.
const getPromptStyleInstruction = (modelType: 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2'): string => {
    switch(modelType) {
        case 'sd1.5':
            return 'Your response MUST be a very simple, comma-separated list of keywords. Do not use sentences.';
        case 'flux':
            return 'Your response MUST be a single, detailed, artistic, and descriptive paragraph. Use rich vocabulary.';
        case 'gemini':
            return 'Your response MUST be a detailed, narrative paragraph written in natural language. Describe the scene as if you were writing a story or giving instructions to a human artist. Use full, descriptive sentences.';
        case 'wan2.2':
        case 'sdxl':
        default:
            return 'Your response MUST be a single, concise, natural language sentence.';
    }
};

// Fix: Added 'nunchaku-kontext-flux' to the modelType union to match the GenerationOptions type and resolve the TypeScript error.
export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea' | 'gemini'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    let instruction = '';
    switch(modelType) {
        case 'sd1.5':
            instruction = 'Describe this image in a very simple, comma-separated list of keywords suitable for an SD1.5 model. Focus on the main subject and key visual elements. Avoid complex sentences. Example: "a woman smiling, portrait, studio lighting, professional photo".';
            break;
        case 'gemini':
            instruction = 'You are a creative assistant. Describe this image in a detailed, narrative paragraph written in natural language, suitable for a Gemini image generation model. Describe the scene as if you were writing a story or giving instructions to a human artist. Use full, descriptive sentences focusing on mood, lighting, and composition.';
            break;
        case 'flux':
        case 'nunchaku-flux-image':
        case 'flux-krea':
             instruction = 'Describe this image in a very detailed, artistic, and descriptive paragraph suitable for a FLUX model. Capture the mood, lighting, composition, style, and intricate details of the subject and background. Use rich vocabulary. Aim for a single, well-crafted paragraph.';
            break;
        case 'sdxl':
        case 'wan2.2':
        default:
             instruction = 'Describe this image in a concise, natural language sentence suitable for an SDXL model. Focus on the subject, action, and setting. Example: "A photorealistic portrait of a woman with curly brown hair, smiling warmly in a softly lit cafe."';
            break;
    }

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.3 }
    });
    
    const text = result.text?.trim().replace(/['"`]/g, ''); // Remove quotes and backticks
    if (!text) throw new Error('AI failed to generate a prompt.');
    return text;
};

// Fix: Standardized 'wan2.2' model type string to align with GenerationOptions and fix type errors.
export const extractBackgroundPromptFromImage = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const styleInstruction = getPromptStyleInstruction(modelType);
    const instruction = `Analyze ONLY the background of this image, ignoring any people or foreground subjects. Describe the environment in detail. ${styleInstruction}`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.4 }
    });
    
    const text = result.text?.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a background prompt.');
    return text;
};

// Fix: Standardized 'wan2.2' model type string to align with GenerationOptions and fix type errors.
export const extractSubjectPromptFromImage = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const styleInstruction = getPromptStyleInstruction(modelType);
    const instruction = `Analyze ONLY the main subject (person or object) of this image, ignoring the background. Describe the subject in detail, including appearance, clothing, and any defining features. ${styleInstruction}`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.4 }
    });
    
    const text = result.text?.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a subject prompt.');
    return text;
};

export const generateMagicalPromptSoup = async (
    fullPrompt: string,
    bgPrompt: string,
    subjectPrompt: string,
    // Fix: Standardized 'wan2.2' model type string to align with GenerationOptions and fix type errors.
    modelType: 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2',
    creativity: number
): Promise<{ text: string; source: number }[]> => {
    let instruction = `You are a creative assistant for generating image prompts. Combine the following elements into a new, cohesive, and imaginative prompt suitable for a '${modelType}' model.
    
    Creativity Level: ${creativity} (0 is a simple combination, 1 is a wild, artistic reinterpretation).

    **Elements to combine:**`;
    if (fullPrompt) instruction += `\n1. Full Scene Idea: "${fullPrompt}"`;
    if (bgPrompt) instruction += `\n2. Background Idea: "${bgPrompt}"`;
    if (subjectPrompt) instruction += `\n3. Subject Idea: "${subjectPrompt}"`;

    instruction += `\n\nYour task is to merge these ideas. You MUST respond with a valid JSON object containing a single key "prompt_parts", which is an array of objects. Each object in the array must have two keys: "text" (a small segment of the final prompt) and "source" (an integer: 0 for new/combined ideas, 1 for elements from the Full Scene, 2 for Background, 3 for Subject).
    
    Example response format:
    { "prompt_parts": [ {"text": "A beautiful portrait of", "source": 1}, {"text": "an astronaut", "source": 3}, {"text": "on a neon-lit alien world", "source": 2}, {"text": "in a impressionistic style", "source": 0} ] }
    `;
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: instruction }] },
        config: { 
            temperature: creativity,
            responseMimeType: 'application/json'
        },
    });

    try {
        const jsonText = result.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.prompt_parts && Array.isArray(parsed.prompt_parts)) {
            return parsed.prompt_parts;
        }
        throw new Error("Invalid JSON format from AI.");
    } catch (e) {
        console.error("Failed to parse prompt soup from AI:", result.text, e);
        throw new Error("AI returned an invalid response for the prompt soup.");
    }
};

// --- ComfyUI Connection & API ---

export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
  if (!url) return { success: false, error: 'URL is not provided.' };
  try {
    const response = await fetch(new URL('/system_stats', url));
    if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
    await response.json(); // Check if it's a valid JSON response
    return { success: true };
  } catch (error: any) {
    console.error('ComfyUI connection check failed:', error);
    return { success: false, error: error.message || 'Failed to connect. Check CORS settings and server URL.' };
  }
};

export const getComfyUIObjectInfo = async (): Promise<any> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const response = await fetch(`${url}/object_info`);
    if (!response.ok) throw new Error('Failed to fetch ComfyUI object info');
    return response.json();
};

const uploadImage = async (file: File): Promise<{ name: string; subfolder: string; type: string }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('overwrite', 'true');
    const response = await fetch(`${url}/upload/image`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Failed to upload image: ${response.statusText}`);
    return response.json();
};

const queuePrompt = async (prompt: any, clientId: string): Promise<string> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const response = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: clientId }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`Error from ComfyUI: ${data.error.type} - ${JSON.stringify(data.error.details || data.error.message)}`);
    return data.prompt_id;
};

const executeWorkflow = async (
    workflow: any,
    onProgress: (message: string, value: number) => void
): Promise<{ images: string[], videoUrl: string | null }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error("ComfyUI URL not set");
    const clientId = getClientId();
    const wsProtocol = url.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${url.replace(/^https?:\/\//, '')}/ws?clientId=${clientId}`;

    return new Promise((resolve, reject) => {
        onProgress("Connecting to ComfyUI...", 0.1);
        const ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
            try {
                onProgress("Queueing prompt...", 0.2);
                await queuePrompt(workflow, clientId);
            } catch (err) {
                reject(err);
                ws.close();
            }
        };

        ws.onmessage = async (event) => {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'status':
                    const queueRemaining = data.data.status.exec_info.queue_remaining;
                    onProgress(queueRemaining > 0 ? `In queue... position ${queueRemaining}` : "Preparing to generate...", 0.25);
                    break;
                case 'progress':
                    const { value, max } = data.data;
                    onProgress(`Sampling...`, 0.3 + (value / max) * 0.6);
                    break;
                case 'executed':
                    onProgress("Fetching results...", 0.95);
                    const promptId = data.data.prompt_id;
                    try {
                        const historyRes = await fetch(`${url}/history/${promptId}`);
                         if (!historyRes.ok) {
                           throw new Error(`Failed to fetch history for prompt ${promptId}: ${historyRes.statusText}`);
                        }
                        const historyData = await historyRes.json();
                        const history = historyData[promptId];
                        
                        if (!history || !history.outputs) {
                            throw new Error(`No outputs found in history for prompt ${promptId}.`);
                        }
                        
                        const outputs = history.outputs;
                        const imageOutputs = [];
                        let videoUrl = null;

                        // Robustly search for the video URL first, as custom nodes can have varied output formats.
                        for (const nodeId in outputs) {
                            const nodeOutput = outputs[nodeId];
                            let videoList = [];

                            // Check common custom node output formats for video
                            if (nodeOutput.ui && Array.isArray(nodeOutput.ui.videos)) videoList = nodeOutput.ui.videos;
                            else if (Array.isArray(nodeOutput.videos)) videoList = nodeOutput.videos;
                            else if (Array.isArray(nodeOutput.gifs)) videoList = nodeOutput.gifs; // Some nodes output MP4s here
                            else if (Array.isArray(nodeOutput.files)) videoList = nodeOutput.files;

                            if (videoList.length > 0) {
                                const videoFile = videoList[0];
                                // Ensure all necessary properties exist before constructing the URL
                                if (videoFile.filename && videoFile.type) {
                                    videoUrl = `${url}/view?filename=${encodeURIComponent(videoFile.filename)}&subfolder=${encodeURIComponent(videoFile.subfolder || '')}&type=${videoFile.type}`;
                                    break; // Found the video, no need to search further
                                }
                            }
                        }

                        // Then, process all image outputs (standard format)
                        for (const nodeId in outputs) {
                            if (outputs[nodeId].images) {
                                for (const image of outputs[nodeId].images) {
                                    // Check if this image is actually the video we might have missed, but don't re-assign if already found.
                                    const isVideoFile = image.format?.startsWith('video/') || image.filename?.endsWith('.mp4');
                                    
                                    if (isVideoFile && !videoUrl) {
                                         videoUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type}`;
                                    } else if (!isVideoFile) {
                                        const fileUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type}`;
                                        const imageRes = await fetch(fileUrl);
                                        const blob = await imageRes.blob();
                                        const dataUrl = await new Promise<string>(res => {
                                            const reader = new FileReader();
                                            reader.onload = () => res(reader.result as string);
                                            reader.readAsDataURL(blob);
                                        });
                                        imageOutputs.push(dataUrl);
                                    }
                                }
                            }
                        }
                        
                        resolve({ images: imageOutputs, videoUrl });
                    } catch (err) {
                        reject(err);
                    } finally {
                        ws.close();
                    }
                    break;
                 case 'execution_error':
                    reject(new Error(`ComfyUI execution error: ${JSON.stringify(data.data)}`));
                    ws.close();
                    break;
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
            reject(new Error("WebSocket connection failed. Ensure the ComfyUI server is running and accessible."));
            ws.close();
        };
    });
};

const buildWorkflow = async (options: GenerationOptions, sourceFile: File | null): Promise<any> => {
    let workflow;

    // --- Helper to find node by various criteria ---
    const findNodeKey = (wf: any, identifier: string, by: 'title' | 'class_type' | 'key') => {
        return Object.keys(wf).find(k => {
            const node = wf[k];
            if (by === 'title') return node._meta?.title?.toLowerCase().includes(identifier.toLowerCase());
            if (by === 'class_type') return node.class_type.toLowerCase().startsWith(identifier.toLowerCase());
            if (by === 'key') return k === identifier;
            return false;
        });
    };

    switch(options.comfyModelType) {
        case 'sd1.5': workflow = JSON.parse(JSON.stringify(COMFYUI_SD15_WORKFLOW_TEMPLATE)); break;
        case 'wan2.2': workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-kontext-flux': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-flux-image': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE)); break;
        case 'flux-krea': workflow = JSON.parse(JSON.stringify(COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE)); break;
        case 'flux': {
            workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE));
            const ksamplerKey = findNodeKey(workflow, "KSampler", 'class_type');
            const posPromptKey = findNodeKey(workflow, "Positive Prompt", 'title');
            if (ksamplerKey && posPromptKey) {
                const fluxGuidanceNode = {
                    "inputs": {
                        "guidance": options.comfyFluxGuidance || 3.5,
                        "conditioning": [ posPromptKey, 0 ]
                    },
                    "class_type": "FluxGuidance",
                    "_meta": { "title": "FluxGuidance" }
                };
                workflow["flux_guidance_node"] = fluxGuidanceNode;
                workflow[ksamplerKey].inputs.positive = [ "flux_guidance_node", 0 ];
            }
            break;
        }
        case 'sdxl':
        default: workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE)); break;
    }
    
    // --- Prompts (Common to most workflows) ---
    const posPromptKey = findNodeKey(workflow, "Positive Prompt", 'title');
    if (posPromptKey) workflow[posPromptKey].inputs.text = options.comfyPrompt || '';
    
    const negPromptKey = findNodeKey(workflow, "Negative Prompt", 'title');
    if (negPromptKey) workflow[negPromptKey].inputs.text = options.comfyNegativePrompt || '';


    // --- Apply Options Based on Workflow Type ---

    if (['sd1.5', 'sdxl', 'flux'].includes(options.comfyModelType!)) {
        const ckptLoaderKey = findNodeKey(workflow, "CheckpointLoaderSimple", 'class_type');
        if (ckptLoaderKey) workflow[ckptLoaderKey].inputs.ckpt_name = options.comfyModel;

        const ksamplerKey = findNodeKey(workflow, "KSampler", 'class_type');
        if (ksamplerKey) {
            const ksampler = workflow[ksamplerKey];
            ksampler.inputs.steps = options.comfySteps;
            ksampler.inputs.cfg = options.comfyCfg;
            ksampler.inputs.sampler_name = options.comfySampler;
            ksampler.inputs.scheduler = options.comfyScheduler;
        }

        const latentKey = findNodeKey(workflow, "EmptyLatentImage", 'class_type');
        if (latentKey) {
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const isSD15 = options.comfyModelType === 'sd1.5';
            const baseSize = isSD15 ? 512 : 1024;
            const aspect = w / h;

            let width, height;
            if (aspect >= 1) { // Landscape or square
                width = baseSize;
                height = Math.round(baseSize / aspect / 8) * 8;
            } else { // Portrait
                height = baseSize;
                width = Math.round(baseSize * aspect / 8) * 8;
            }
            workflow[latentKey].inputs.width = width;
            workflow[latentKey].inputs.height = height;
        }

        if (options.comfyModelType === 'sdxl' && options.comfySdxlUseLora && options.comfySdxlLoraName && ckptLoaderKey) {
            const loraLoaderNode = {
                "inputs": {
                    "lora_name": options.comfySdxlLoraName,
                    "strength_model": options.comfySdxlLoraStrength,
                    "strength_clip": options.comfySdxlLoraStrength,
                    "model": [ckptLoaderKey, 0],
                    "clip": [ckptLoaderKey, 1]
                },
                "class_type": "LoraLoader",
            };
            const loraKey = "lora_loader";
            workflow[loraKey] = loraLoaderNode;

            const ksamplerKey = findNodeKey(workflow, "KSampler", 'class_type');
            if (ksamplerKey) workflow[ksamplerKey].inputs.model = [loraKey, 0];
            if (posPromptKey) workflow[posPromptKey].inputs.clip = [loraKey, 1];
            if (negPromptKey) workflow[negPromptKey].inputs.clip = [loraKey, 1];
        }
    }
    else if (options.comfyModelType === 'wan2.2') {
        // Models
        workflow["38"].inputs.unet_name = options.comfyWanHighNoiseModel; // High noise
        workflow["39"].inputs.unet_name = options.comfyWanLowNoiseModel; // Low noise
        workflow["22"].inputs.clip_name = options.comfyWanClipModel;
        if (options.comfyWanClipModel?.toLowerCase().endsWith('.gguf')) {
            workflow["22"].class_type = 'CLIPLoaderGGUF';
            workflow["22"]._meta.title = 'CLIPLoaderGGUF';
        } else {
            workflow["22"].class_type = 'CLIPLoader';
            workflow["22"]._meta.title = 'CLIP Loader';
        }
        workflow["8"].inputs.vae_name = options.comfyWanVaeModel;

        // Latent
        const [w, h] = options.aspectRatio.split(':').map(Number);
        const latentNode = workflow["5"];
        latentNode.inputs.width = w > h ? 1280 : 720;
        latentNode.inputs.height = w > h ? 720 : 1280;

        // Samplers
        const sampler1 = workflow["35"];
        const sampler2 = workflow["36"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfySteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfySampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyScheduler;
        sampler2.inputs.start_at_step = options.comfyWanRefinerStartStep;
        sampler1.inputs.end_at_step = options.comfyWanRefinerStartStep;

        // LoRAs
        if(options.comfyWanUseFusionXLora) {
            workflow["30"].inputs.lora_name = options.comfyWanFusionXLoraName;
            workflow["30"].inputs.strength_model = workflow["30"].inputs.strength_clip = options.comfyWanFusionXLoraStrength;
            workflow["43"].inputs.lora_name = options.comfyWanFusionXLoraName;
            workflow["43"].inputs.strength_model = options.comfyWanFusionXLoraStrength;
        } else {
             workflow["29"].inputs.model = ["38", 0]; // Bypass FusionX for high noise
             workflow["29"].inputs.clip = ["22", 0];
             workflow["44"].inputs.model = ["39", 0]; // Bypass FusionX for low noise
             delete workflow["30"];
             delete workflow["43"];
        }

        if(options.comfyWanUseLightningLora) {
            workflow["29"].inputs.lora_name = options.comfyWanLightningLoraNameHigh;
            workflow["29"].inputs.strength_model = workflow["29"].inputs.strength_clip = options.comfyWanLightningLoraStrength;
            workflow["44"].inputs.lora_name = options.comfyWanLightningLoraNameLow;
            workflow["44"].inputs.strength_model = options.comfyWanLightningLoraStrength;
        } else {
            workflow["14"].inputs.model = options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]; // Bypass Lightning for high noise
            workflow["14"].inputs.clip = options.comfyWanUseFusionXLora ? ["30", 1] : ["22", 0];
            workflow["45"].inputs.model = options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]; // Bypass Lightning for low noise
            delete workflow["29"];
            delete workflow["44"];
        }

        if(options.comfyWanUseStockPhotoLora) {
            workflow["14"].inputs.lora_name = options.comfyWanStockPhotoLoraNameHigh;
            workflow["14"].inputs.strength_model = workflow["14"].inputs.strength_clip = options.comfyWanStockPhotoLoraStrength;
            workflow["45"].inputs.lora_name = options.comfyWanStockPhotoLoraNameLow;
            workflow["45"].inputs.strength_model = options.comfyWanStockPhotoLoraStrength;
        } else {
             sampler1.inputs.model = options.comfyWanUseLightningLora ? ["29", 0] : (options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]);
             sampler2.inputs.model = options.comfyWanUseLightningLora ? ["44", 0] : (options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]);
             delete workflow["14"];
             delete workflow["45"];
        }
    }
    else if (options.comfyModelType === 'nunchaku-kontext-flux') {
        if (sourceFile) {
            const uploadedImage = await uploadImage(sourceFile);
            workflow["99"].inputs.image = uploadedImage.name;
        }
        // Models
        workflow["22"].inputs.model_path = options.comfyNunchakuModel;
        workflow["1"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["2"].inputs.clip_name1 = options.comfyNunchakuClipL;
        workflow["2"].inputs.clip_name2 = options.comfyNunchakuT5XXL;
        // Sampler
        const ksampler = workflow["20"];
        ksampler.inputs.steps = options.comfySteps;
        ksampler.inputs.cfg = options.comfyCfg;
        ksampler.inputs.sampler_name = options.comfySampler;
        ksampler.inputs.scheduler = options.comfyScheduler;
        // Params
        workflow["12"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["22"].inputs.cache_threshold = options.comfyNunchakuCacheThreshold;
        workflow["22"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["22"].inputs.attention = options.comfyNunchakuAttention;
        // LoRAs
        let lastLoraNode = "22";
        if(options.comfyNunchakuUseTurboLora) {
            workflow["26"].inputs.lora_name = options.comfyNunchakuTurboLoraName;
            workflow["26"].inputs.lora_strength = options.comfyNunchakuTurboLoraStrength;
            workflow["26"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "26";
        } else { delete workflow["26"]; }

        if(options.comfyNunchakuUseNudifyLora) {
            workflow["27"].inputs.lora_name = options.comfyNunchakuNudifyLoraName;
            workflow["27"].inputs.lora_strength = options.comfyNunchakuNudifyLoraStrength;
            workflow["27"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "27";
        } else { delete workflow["27"]; }

        if(options.comfyNunchakuUseDetailLora) {
            workflow["28"].inputs.lora_name = options.comfyNunchakuDetailLoraName;
            workflow["28"].inputs.lora_strength = options.comfyNunchakuDetailLoraStrength;
            workflow["28"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "28";
        } else { delete workflow["28"]; }
        ksampler.inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'nunchaku-flux-image') {
        // Models
        workflow["45"].inputs.model_path = options.comfyNunchakuModel;
        workflow["10"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["44"].inputs.text_encoder1 = options.comfyNunchakuClipL;
        workflow["44"].inputs.text_encoder2 = options.comfyNunchakuT5XXL;
        // Sampler
        workflow["17"].inputs.steps = options.comfySteps;
        workflow["16"].inputs.sampler_name = options.comfySampler;
        workflow["17"].inputs.scheduler = options.comfyScheduler;
        // Params
        workflow["26"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["30"].inputs.base_shift = options.comfyNunchakuBaseShift;
        workflow["30"].inputs.max_shift = options.comfyNunchakuMaxShift;
        workflow["45"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["45"].inputs.attention = options.comfyNunchakuAttention;
        
        // LoRAs
        let lastLoraNode = "45";
        if (options.comfyNunchakuUseTurboLora) {
            workflow["46"].inputs.lora_name = options.comfyNunchakuTurboLoraName;
            workflow["46"].inputs.lora_strength = options.comfyNunchakuTurboLoraStrength;
            workflow["46"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "46";
        } else { delete workflow["46"]; }

        if (options.comfyNunchakuUseNudifyLora) {
            workflow["48"].inputs.lora_name = options.comfyNunchakuNudifyLoraName;
            workflow["48"].inputs.lora_strength = options.comfyNunchakuNudifyLoraStrength;
            workflow["48"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "48";
        } else { delete workflow["48"]; }

        if (options.comfyNunchakuUseDetailLora) {
            workflow["47"].inputs.lora_name = options.comfyNunchakuDetailLoraName;
            workflow["47"].inputs.lora_strength = options.comfyNunchakuDetailLoraStrength;
            workflow["47"].inputs.model = [lastLoraNode, 0];
            lastLoraNode = "47";
        } else { delete workflow["47"]; }
        workflow["30"].inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'flux-krea') {
        // Models
        workflow["186"].inputs.unet_name = options.comfyFluxKreaModel;
        workflow["26"].inputs.clip_name2 = options.comfyFluxKreaClipT5;
        workflow["26"].inputs.clip_name1 = options.comfyFluxKreaClipL;
        workflow["27"].inputs.vae_name = options.comfyFluxKreaVae;
        
        // Sampler
        workflow["163"].inputs.steps = options.comfySteps;
        workflow["163"].inputs.sampler_name = options.comfySampler;
        workflow["163"].inputs.scheduler = options.comfyScheduler;

        // LoRAs
        const loraLoader = workflow["191"];
        loraLoader.widgets_values[2].on = options.useP1x4r0maWomanLora;
        loraLoader.widgets_values[2].lora = options.p1x4r0maWomanLoraName;
        loraLoader.widgets_values[2].strength = options.p1x4r0maWomanLoraStrength;
        
        loraLoader.widgets_values[3].on = options.useNippleDiffusionLora;
        loraLoader.widgets_values[3].lora = options.nippleDiffusionLoraName;
        loraLoader.widgets_values[3].strength = options.nippleDiffusionLoraStrength;
        
        loraLoader.widgets_values[4].on = options.usePussyDiffusionLora;
        loraLoader.widgets_values[4].lora = options.pussyDiffusionLoraName;
        loraLoader.widgets_values[4].strength = options.pussyDiffusionLoraStrength;

        // Upscaler
        if (options.comfyFluxKreaUseUpscaler) {
            workflow["101"].inputs.model_name = options.comfyFluxKreaUpscaleModel;
            workflow["51"].inputs.steps = options.comfyFluxKreaUpscalerSteps;
            workflow["51"].inputs.denoise = options.comfyFluxKreaDenoise;
        } else {
            // Disable upscaling nodes by setting their mode to "Never"
             workflow["51"].mode = 4;
             workflow["100"].mode = 4;
             workflow["102"].mode = 4;
             workflow["110"].mode = 4;
             workflow["111"].mode = 4;
             workflow["170"].mode = 4;
        }
    }

    return workflow;
};

export const generateComfyUIPortraits = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void
): Promise<{ images: string[]; finalPrompt: string }> => {
    const allImages: string[] = [];
    const baseWorkflow = await buildWorkflow(options, sourceImage);

    for (let i = 0; i < options.numImages; i++) {
        const currentWorkflow = JSON.parse(JSON.stringify(baseWorkflow));
        
        // Find any ksampler-like node to randomize seed
        const samplerKey = Object.keys(currentWorkflow).find(k => currentWorkflow[k].class_type.toLowerCase().startsWith('ksampler'));
        if (samplerKey) {
            currentWorkflow[samplerKey].inputs.seed = Math.floor(Math.random() * 1e15);
        }

        const progressWrapper = (message: string, value: number) => {
            const overallProgress = (i + value) / options.numImages;
            updateProgress(`Image ${i + 1}/${options.numImages}: ${message}`, overallProgress);
        };
        
        try {
            const result = await executeWorkflow(currentWorkflow, progressWrapper);
            allImages.push(...result.images);
        } catch (error) {
            console.error(`Error generating image ${i + 1}:`, error);
            throw error; // Propagate error to UI
        }
    }
    
    return { images: allImages, finalPrompt: options.comfyPrompt || '' };
};

export const generateComfyUIVideo = async (
    startFrame: File,
    endFrame: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE));
    
    const effectiveEndFrame = (endFrame && options.comfyVidWanI2VUseEndFrame) ? endFrame : startFrame;
    
    updateProgress("Uploading start frame...", 0.05);
    const startFrameInfo = await uploadImage(startFrame);
    updateProgress("Uploading end frame...", 0.1);
    const endFrameInfo = await uploadImage(effectiveEndFrame);
    
    // 1. Loaders
    workflow["105"].inputs.unet_name = options.comfyVidWanI2VHighNoiseModel;
    workflow["106"].inputs.unet_name = options.comfyVidWanI2VLowNoiseModel;
    workflow["107"].inputs.clip_name = options.comfyVidWanI2VClipModel;
    workflow["39"].inputs.vae_name = options.comfyVidWanI2VVaeModel;
    workflow["49"].inputs.clip_name = options.comfyVidWanI2VClipVisionModel;

    // 2. Main Video Node
    const mainVideoNode = workflow["83"];
    mainVideoNode.inputs.length = options.comfyVidWanI2VFrameCount;
    mainVideoNode.inputs.width = options.comfyVidWanI2VWidth;
    mainVideoNode.inputs.height = options.comfyVidWanI2VHeight;
    // Add new strength parameter
    if (options.comfyVidWanI2VUseEndFrame) {
        mainVideoNode.inputs.end_frame_strength = options.comfyVidWanI2VEndFrameStrength;
    } else {
        mainVideoNode.inputs.end_frame_strength = 0;
    }
    
    // 3. Image Loaders
    workflow["52"].inputs.image = startFrameInfo.name;
    workflow["72"].inputs.image = endFrameInfo.name;

    // 4. Prompts
    workflow["6"].inputs.text = options.comfyVidWanI2VPositivePrompt;
    workflow["7"].inputs.text = options.comfyVidWanI2VNegativePrompt;

    // 5. KSamplers
    const highNoiseSampler = workflow["101"];
    const lowNoiseSampler = workflow["102"];
    highNoiseSampler.inputs.steps = lowNoiseSampler.inputs.steps = options.comfyVidWanI2VSteps;
    highNoiseSampler.inputs.cfg = lowNoiseSampler.inputs.cfg = options.comfyVidWanI2VCfg;
    highNoiseSampler.inputs.sampler_name = lowNoiseSampler.inputs.sampler_name = options.comfyVidWanI2VSampler;
    highNoiseSampler.inputs.scheduler = lowNoiseSampler.inputs.scheduler = options.comfyVidWanI2VScheduler;
    highNoiseSampler.inputs.end_at_step = options.comfyVidWanI2VRefinerStartStep;
    lowNoiseSampler.inputs.start_at_step = options.comfyVidWanI2VRefinerStartStep;

    // 6. Lightning LoRAs (Conditional)
    if (options.comfyVidWanI2VUseLightningLora) {
        const highNoiseLora = workflow["94"];
        const lowNoiseLora = workflow["95"];
        highNoiseLora.inputs.lora_name = options.comfyVidWanI2VHighNoiseLora;
        highNoiseLora.inputs.strength_model = options.comfyVidWanI2VHighNoiseLoraStrength;
        lowNoiseLora.inputs.lora_name = options.comfyVidWanI2VLowNoiseLora;
        lowNoiseLora.inputs.strength_model = options.comfyVidWanI2VLowNoiseLoraStrength;
    } else {
        workflow["79"].inputs.model = ["105", 0];
        workflow["93"].inputs.model = ["106", 0];
        delete workflow["94"];
        delete workflow["95"];
    }
    
    // 7. Post-processing (Conditional)
    const videoCombineNode = workflow["111"];
    videoCombineNode.inputs.frame_rate = options.comfyVidWanI2VFrameRate;
    videoCombineNode.inputs.format = options.comfyVidWanI2VVideoFormat;
    
    if (options.comfyVidWanI2VUseFilmGrain) {
        const filmGrainNode = workflow["114"];
        filmGrainNode.inputs.grain_intensity = options.comfyVidWanI2VFilmGrainIntensity;
        filmGrainNode.inputs.saturation_mix = options.comfyVidWanI2VFilmGrainSize; 
    } else {
        videoCombineNode.inputs.images = ["8", 0]; 
        delete workflow["114"];
    }
    
    const { videoUrl } = await executeWorkflow(workflow, updateProgress);
    if (!videoUrl) {
        throw new Error("Generation finished, but no video file was found in the output.");
    }
    
    return { videoUrl, finalPrompt: options.comfyVidWanI2VPositivePrompt || '' };
};

export const exportComfyUIWorkflow = async (options: GenerationOptions, sourceFile: File | null): Promise<void> => {
    const workflow = await buildWorkflow(options, sourceFile);
    const jsonString = JSON.stringify({ prompt: workflow }, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui_workflow_${options.comfyModelType}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
