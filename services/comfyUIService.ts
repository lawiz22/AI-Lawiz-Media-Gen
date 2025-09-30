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
  COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE,
  COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE,
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

const sanitizeFilename = (filename: string): string => {
  if (!filename) return "image.png";

  const extensionMatch = filename.match(/\.[0-9a-z]+$/i);
  const extension = extensionMatch ? extensionMatch[0] : '.png';
  let baseName = extension ? filename.substring(0, filename.length - extension.length) : filename;

  // Replace invalid characters and multiple spaces/underscores
  baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');

  const maxLength = 100 - extension.length;
  if (baseName.length > maxLength) {
    baseName = baseName.substring(0, maxLength);
  }
  
  return baseName + extension;
}

// --- Module state for cancellation ---
let currentExecution: { clientId: string; ws: WebSocket } | null = null;

export const cancelComfyUIExecution = async (): Promise<void> => {
    if (!currentExecution) {
        console.warn("No ComfyUI execution to cancel.");
        return;
    }
    const url = getComfyUIUrl();
    if (!url) return;

    try {
        // ComfyUI's interrupt endpoint does not require a body.
        await fetch(`${url}/interrupt`, { method: 'POST' });
        console.log("ComfyUI execution interrupt requested.");
        
        if (currentExecution.ws.readyState === WebSocket.OPEN) {
             currentExecution.ws.close();
        }
    } catch (e) {
        console.error("Failed to send interrupt request to ComfyUI:", e);
    } finally {
        currentExecution = null;
    }
};

// --- Gemini-based Prompt Generation ---
type ComfyPromptModelType = 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea' | 'face-detailer-sd1.5';

const getPromptStyleInstruction = (modelType: ComfyPromptModelType): string => {
    switch(modelType) {
        case 'sd1.5':
        case 'face-detailer-sd1.5':
            return 'Your response MUST be a very simple, comma-separated list of keywords. Do not use sentences.';
        case 'flux':
        case 'nunchaku-flux-image':
        case 'flux-krea':
            return 'Your response MUST be a single, detailed, artistic, and descriptive paragraph. Use rich vocabulary.';
        case 'gemini':
            return 'Your response MUST be a detailed, narrative paragraph written in a natural language. Describe the scene as if you were writing a story or giving instructions to a human artist. Use full, descriptive sentences.';
        case 'wan2.2':
        case 'sdxl':
        case 'nunchaku-kontext-flux': // I2I prompt is often best as a sentence
        default:
            return 'Your response MUST be a single, concise, natural language sentence.';
    }
};

export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const instruction = getPromptStyleInstruction(modelType) + ' Start the prompt directly without any preamble.';

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.3 }
    });
    
    const text = result.text?.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a prompt.');
    return text;
};

export const generateWanVideoPromptFromImage = async (sourceImage: File): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const instruction = `Analyze this image. Describe the main subject and its environment in a concise, cinematic phrase suitable for a text-to-video prompt. For example: "A lion running across the savannah" or "A cyberpunk woman with neon hair in a rainy neon-lit alley". Respond with only the descriptive phrase.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.3 }
    });

    const text = result.text?.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a video prompt from the image.');
    return text;
};


export const extractBackgroundPromptFromImage = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
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

export const extractSubjectPromptFromImage = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
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
    modelType: ComfyPromptModelType,
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

    const fileBuffer = await file.arrayBuffer();
    const originalFilename = file.name || "image.png";
    const sanitizedFilename = sanitizeFilename(originalFilename);
    const normalizedFile = new File([fileBuffer], sanitizedFilename, { type: file.type });
    
    const formData = new FormData();
    formData.append('image', normalizedFile); 
    formData.append('overwrite', 'true');

    const response = await fetch(`${url}/upload/image`, {
        method: 'POST',
        body: formData,
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("ComfyUI image upload failed. Server response:", errorText);
        throw new Error(`Failed to upload image to ComfyUI: ${response.statusText}`);
    }
    
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
    onProgress: (message: string, value: number) => void,
    isLongJob: boolean = false
): Promise<{ images: string[], videoUrl: string | null }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error("ComfyUI URL not set");
    const clientId = getClientId();
    const wsProtocol = url.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${url.replace(/^https?:\/\//, '')}/ws?clientId=${clientId}`;

    return new Promise((resolve, reject) => {
        onProgress("Connecting to ComfyUI...", 0.1);
        const ws = new WebSocket(wsUrl);
        currentExecution = { clientId, ws };

        const cleanup = () => {
            if (currentExecution && currentExecution.clientId === clientId) {
                currentExecution = null;
            }
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };

        ws.onopen = async () => {
            try {
                onProgress("Queueing prompt...", 0.2);
                await queuePrompt(workflow, clientId);
            } catch (err) {
                reject(err);
                cleanup();
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

                    const retries = isLongJob ? 150 : 15;
                    const delay = 3000;

                    const fetchHistoryWithRetries = async (retries: number, delay: number): Promise<any> => {
                        for (let i = 0; i < retries; i++) {
                            try {
                                const historyRes = await fetch(`${url}/history/${promptId}`);
                                if (!historyRes.ok) throw new Error(`Failed to fetch history (attempt ${i + 1}): ${historyRes.statusText}`);
                                const historyData = await historyRes.json();
                                const history = historyData[promptId];
                                if (history && history.outputs) return history;
                                onProgress(`Waiting for outputs from server... (${i + 1}/${retries})`, 0.96);
                            } catch (e) {
                                console.warn(`History fetch attempt ${i + 1} failed`, e);
                            }
                            if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
                        }
                        throw new Error(`No outputs found in history for prompt ${promptId} after ${retries} attempts.`);
                    };

                    try {
                        const history = await fetchHistoryWithRetries(retries, delay);
                        const outputs = history.outputs;
                        const imageOutputs = [];
                        let videoUrl = null;

                        for (const nodeId in outputs) {
                            const nodeOutput = outputs[nodeId];
                            let videoList = [];
                            if (nodeOutput.ui && Array.isArray(nodeOutput.ui.videos)) videoList = nodeOutput.ui.videos;
                            else if (Array.isArray(nodeOutput.videos)) videoList = nodeOutput.videos;
                            else if (Array.isArray(nodeOutput.gifs)) videoList = nodeOutput.gifs;
                            else if (Array.isArray(nodeOutput.files)) videoList = nodeOutput.files;
                            if (videoList.length > 0) {
                                const videoFile = videoList[0];
                                if (videoFile.filename && videoFile.type) {
                                    videoUrl = `${url}/view?filename=${encodeURIComponent(videoFile.filename)}&subfolder=${encodeURIComponent(videoFile.subfolder || '')}&type=${videoFile.type}`;
                                    break;
                                }
                            }
                        }

                        for (const nodeId in outputs) {
                            if (outputs[nodeId].images) {
                                for (const image of outputs[nodeId].images) {
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
                        cleanup();
                    }
                    break;
                case 'execution_interrupted':
                    reject(new Error('Operation was cancelled by the user.'));
                    cleanup();
                    break;
                 case 'execution_error':
                    reject(new Error(`ComfyUI execution error: ${JSON.stringify(data.data)}`));
                    cleanup();
                    break;
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
            reject(new Error("WebSocket connection failed. Ensure the ComfyUI server is running and accessible."));
            cleanup();
        };

        ws.onclose = () => {
            cleanup();
        };
    });
};

const buildWorkflow = async (options: GenerationOptions, sourceFile: File | null): Promise<any> => {
    let workflow;

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
        case 'face-detailer-sd1.5': workflow = JSON.parse(JSON.stringify(COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE)); break;
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
    
    const posPromptKey = findNodeKey(workflow, "Positive Prompt", 'title');
    if (posPromptKey) workflow[posPromptKey].inputs.text = options.comfyPrompt || '';
    
    const negPromptKey = findNodeKey(workflow, "Negative Prompt", 'title');
    if (negPromptKey) workflow[negPromptKey].inputs.text = options.comfyNegativePrompt || '';

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
            if (aspect >= 1) {
                width = baseSize;
                height = Math.round(baseSize / aspect / 8) * 8;
            } else {
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
        workflow["38"].inputs.unet_name = options.comfyWanHighNoiseModel;
        workflow["39"].inputs.unet_name = options.comfyWanLowNoiseModel;
        workflow["22"].inputs.clip_name = options.comfyWanClipModel;
        if (options.comfyWanClipModel?.toLowerCase().endsWith('.gguf')) {
            workflow["22"].class_type = 'CLIPLoaderGGUF';
            workflow["22"]._meta.title = 'CLIPLoaderGGUF';
        } else {
            workflow["22"].class_type = 'CLIPLoader';
            workflow["22"]._meta.title = 'CLIP Loader';
        }
        workflow["8"].inputs.vae_name = options.comfyWanVaeModel;

        const [w, h] = options.aspectRatio.split(':').map(Number);
        const aspect = w/h;
        const baseSize = 1024;
        let width, height;
        if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
        else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
        workflow["5"].inputs.width = width;
        workflow["5"].inputs.height = height;

        const sampler1 = workflow["35"];
        const sampler2 = workflow["36"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfySteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfySampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyScheduler;
        sampler2.inputs.start_at_step = options.comfyWanRefinerStartStep;
        sampler1.inputs.end_at_step = options.comfyWanRefinerStartStep;

        if(!options.comfyWanUseFusionXLora) { delete workflow["30"]; delete workflow["43"]; workflow["29"].inputs.model = ["38", 0]; workflow["29"].inputs.clip = ["22", 0]; workflow["44"].inputs.model = ["39", 0]; }
        if(!options.comfyWanUseLightningLora) { delete workflow["29"]; delete workflow["44"]; workflow["14"].inputs.model = options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]; workflow["14"].inputs.clip = options.comfyWanUseFusionXLora ? ["30", 1] : ["22", 0]; workflow["45"].inputs.model = options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]; }
        if(!options.comfyWanUseStockPhotoLora) { delete workflow["14"]; delete workflow["45"]; sampler1.inputs.model = options.comfyWanUseLightningLora ? ["29", 0] : (options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]); sampler2.inputs.model = options.comfyWanUseLightningLora ? ["44", 0] : (options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]); }
    }
    else if (options.comfyModelType === 'nunchaku-kontext-flux') {
        if (sourceFile) { workflow["99"].inputs.image = (await uploadImage(sourceFile)).name; }
        workflow["22"].inputs.model_path = options.comfyNunchakuModel;
        workflow["1"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["2"].inputs.clip_name1 = options.comfyNunchakuClipL;
        workflow["2"].inputs.clip_name2 = options.comfyNunchakuT5XXL;
        const ksampler = workflow["20"];
        ksampler.inputs.steps = options.comfySteps; ksampler.inputs.cfg = options.comfyCfg; ksampler.inputs.sampler_name = options.comfySampler; ksampler.inputs.scheduler = options.comfyScheduler;
        workflow["12"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["22"].inputs.cache_threshold = options.comfyNunchakuCacheThreshold ?? 0.12;
        workflow["22"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["22"].inputs.attention = options.comfyNunchakuAttention;
        
        let lastLoraNode = "22";
        if(options.comfyNunchakuUseTurboLora) { workflow["26"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "26"; } else { delete workflow["26"]; }
        if(options.comfyNunchakuUseNudifyLora) { workflow["27"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "27"; } else { delete workflow["27"]; }
        if(options.comfyNunchakuUseDetailLora) { workflow["28"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "28"; } else { delete workflow["28"]; }
        ksampler.inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'nunchaku-flux-image') {
        workflow["45"].inputs.model_path = options.comfyNunchakuModel;
        workflow["10"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["44"].inputs.text_encoder1 = options.comfyNunchakuClipL;
        workflow["44"].inputs.text_encoder2 = options.comfyNunchakuT5XXL;
        workflow["17"].inputs.steps = options.comfySteps;
        workflow["16"].inputs.sampler_name = options.comfySampler;
        workflow["17"].inputs.scheduler = options.comfyScheduler;
        workflow["26"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["30"].inputs.base_shift = options.comfyNunchakuBaseShift;
        workflow["30"].inputs.max_shift = options.comfyNunchakuMaxShift;
        workflow["45"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["45"].inputs.attention = options.comfyNunchakuAttention;
        workflow["45"].inputs.cache_threshold = options.comfyNunchakuCacheThreshold ?? 0;

        const latentKey = findNodeKey(workflow, "EmptySD3LatentImage", 'class_type');
        if (latentKey) {
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const aspect = w/h;
            const baseSize = 768; 
            let width, height;
            if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
            else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
            workflow[latentKey].inputs.width = width; workflow[latentKey].inputs.height = height;
            const modelSamplingKey = findNodeKey(workflow, "ModelSamplingFlux", "class_type");
            if(modelSamplingKey) { workflow[modelSamplingKey].inputs.width = width; workflow[modelSamplingKey].inputs.height = height; }
        }
        
        let lastLoraNode = "45";
        if (options.comfyNunchakuUseTurboLora) { workflow["46"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "46"; } else { delete workflow["46"]; }
        if (options.comfyNunchakuUseNudifyLora) { workflow["48"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "48"; } else { delete workflow["48"]; }
        if (options.comfyNunchakuUseDetailLora) { workflow["47"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "47"; } else { delete workflow["47"]; }
        workflow["30"].inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'flux-krea') {
        workflow["186"].inputs.unet_name = options.comfyFluxKreaModel;
        workflow["26"].inputs.clip_name2 = options.comfyFluxKreaClipT5;
        workflow["26"].inputs.clip_name1 = options.comfyFluxKreaClipL;
        workflow["27"].inputs.vae_name = options.comfyFluxKreaVae;
        workflow["163"].inputs.steps = options.comfySteps;
        workflow["163"].inputs.sampler_name = options.comfySampler;
        workflow["163"].inputs.scheduler = options.comfyScheduler;
        const latentKey = findNodeKey(workflow, "EmptySD3LatentImage", 'class_type');
        if (latentKey) {
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const aspect = w / h;
            const baseSize = 1024;
            let width, height;
            if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
            else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
            workflow[latentKey].inputs.width = width;
            workflow[latentKey].inputs.height = height;
        }

        const loraLoader = workflow["191"];
        loraLoader.widgets_values[2].on = options.useP1x4r0maWomanLora;
        loraLoader.widgets_values[3].on = options.useNippleDiffusionLora;
        loraLoader.widgets_values[4].on = options.usePussyDiffusionLora;
        
        if (!options.comfyFluxKreaUseUpscaler) {
             workflow["51"].mode = workflow["100"].mode = workflow["102"].mode = workflow["110"].mode = workflow["111"].mode = workflow["170"].mode = 4;
        }
    } else if (options.comfyModelType === 'face-detailer-sd1.5') {
        workflow = JSON.parse(JSON.stringify(COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE));
        if (sourceFile) {
            workflow["72"].inputs.image = (await uploadImage(sourceFile)).name;
        }
        // Fix: Correctly modify the 'inputs' object for each node, not a non-existent 'widgets_values' array.
        workflow["4"].inputs.ckpt_name = options.comfyModel;
        workflow["53"].inputs.model_name = options.comfyDetailerBboxModel;
        workflow["16"].inputs.model_name = options.comfyDetailerSamModel;
        workflow["5"].inputs.text = options.comfyPrompt;
        workflow["6"].inputs.text = options.comfyNegativePrompt;
        
        const detailerNodeInputs = workflow["51"].inputs;
        detailerNodeInputs.steps = options.comfyDetailerSteps;
        detailerNodeInputs.cfg = options.comfyDetailerCfg;
        detailerNodeInputs.sampler_name = options.comfyDetailerSampler;
        detailerNodeInputs.scheduler = options.comfyDetailerScheduler;
        detailerNodeInputs.denoise = options.comfyDetailerDenoise;
        detailerNodeInputs.feather = options.comfyDetailerFeather;
        detailerNodeInputs.bbox_threshold = options.comfyDetailerBboxThreshold;
        detailerNodeInputs.bbox_dilation = options.comfyDetailerBboxDilation;
        detailerNodeInputs.bbox_crop_factor = options.comfyDetailerBboxCropFactor;
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

    const isLongJob = ['flux-krea', 'nunchaku-kontext-flux', 'face-detailer-sd1.5'].includes(options.comfyModelType!);
    const numImages = options.comfyModelType === 'face-detailer-sd1.5' ? 1 : options.numImages;

    let currentSeed = options.comfySeed ?? Math.floor(Math.random() * 1e15);

    for (let i = 0; i < numImages; i++) {
        const currentWorkflow = JSON.parse(JSON.stringify(baseWorkflow));
        
        const samplerKey = Object.keys(currentWorkflow).find(k => currentWorkflow[k].class_type.toLowerCase().startsWith('ksampler'));
        if (samplerKey) {
            currentWorkflow[samplerKey].inputs.seed = currentSeed;
            
            const seedControl = options.comfyModelType === 'sd1.5' ? (options.comfySeedControl || 'randomize') : 'randomize';
            const seedIncrement = options.comfySeedIncrement || 1;

            switch (seedControl) {
                case 'increment':
                    currentSeed += seedIncrement;
                    break;
                case 'decrement':
                    currentSeed -= seedIncrement;
                    break;
                case 'randomize':
                    currentSeed = Math.floor(Math.random() * 1e15);
                    break;
                case 'fixed':
                default:
                    // Seed remains unchanged
                    break;
            }
        }

        const progressWrapper = (message: string, value: number) => {
            const overallProgress = (i + value) / numImages;
            updateProgress(`Image ${i + 1}/${numImages}: ${message}`, overallProgress);
        };
        
        try {
            const result = await executeWorkflow(currentWorkflow, progressWrapper, isLongJob);
            allImages.push(...result.images);
        } catch (error) {
            console.error(`Error generating image ${i + 1}:`, error);
            throw error;
        }
    }
    
    return { images: allImages, finalPrompt: options.comfyPrompt || '' };
};

export const generateComfyUIVideo = async (
    startFrame: File | null,
    endFrame: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    let workflow;
    let finalPrompt = '';

    if (options.comfyVidModelType === 'wan-t2v') {
        workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE));
        finalPrompt = options.comfyVidWanT2VPositivePrompt || '';
        
        workflow["6"].inputs.text = options.comfyVidWanT2VPositivePrompt;
        workflow["7"].inputs.text = options.comfyVidWanT2VNegativePrompt;
        
        // Models
        workflow["105"].inputs.unet_name = options.comfyVidWanT2VHighNoiseModel;
        workflow["106"].inputs.unet_name = options.comfyVidWanT2VLowNoiseModel;
        workflow["107"].inputs.clip_name = options.comfyVidWanT2VClipModel;
        workflow["39"].inputs.vae_name = options.comfyVidWanT2VVaeModel;
        
        // Latent
        const latentNode = workflow["117"];
        latentNode.inputs.width = options.comfyVidWanT2VWidth;
        latentNode.inputs.height = options.comfyVidWanT2VHeight;
        latentNode.inputs.length = options.comfyVidWanT2VFrameCount;

        // Samplers
        const sampler1 = workflow["101"];
        const sampler2 = workflow["102"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfyVidWanT2VSteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyVidWanT2VCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfyVidWanT2VSampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyVidWanT2VScheduler;
        sampler1.inputs.end_at_step = options.comfyVidWanT2VRefinerStartStep;
        sampler2.inputs.start_at_step = options.comfyVidWanT2VRefinerStartStep;
        sampler1.inputs.noise_seed = options.comfyVidWanT2VNoiseSeed ?? Math.floor(Math.random() * 1e15);
        sampler1.inputs.control_after_generate = options.comfyVidWanT2VSeedControl || 'randomize';
        
        // LoRA Chaining
        let highNoiseModelInput: [string, number] = ["105", 0];
        let lowNoiseModelInput: [string, number] = ["106", 0];

        if (options.comfyVidWanT2VUseOptionalLora && options.comfyVidWanT2VOptionalLoraName) {
            workflow["optional_lora_high"] = { inputs: { lora_name: options.comfyVidWanT2VOptionalLoraName, strength_model: options.comfyVidWanT2VOptionalLoraStrength, model: highNoiseModelInput }, class_type: "LoraLoaderModelOnly" };
            workflow["optional_lora_low"] = { inputs: { lora_name: options.comfyVidWanT2VOptionalLoraName, strength_model: options.comfyVidWanT2VOptionalLoraStrength, model: lowNoiseModelInput }, class_type: "LoraLoaderModelOnly" };
            highNoiseModelInput = ["optional_lora_high", 0];
            lowNoiseModelInput = ["optional_lora_low", 0];
        }

        if (options.comfyVidWanT2VUseLightningLora) {
            workflow["94"].inputs.model = highNoiseModelInput;
            workflow["94"].inputs.lora_name = options.comfyVidWanT2VLightningLoraHigh;
            workflow["94"].inputs.strength_model = options.comfyVidWanT2VLightningLoraStrengthHigh;
            workflow["95"].inputs.model = lowNoiseModelInput;
            workflow["95"].inputs.lora_name = options.comfyVidWanT2VLightningLoraLow;
            workflow["95"].inputs.strength_model = options.comfyVidWanT2VLightningLoraStrengthLow;
        } else {
            delete workflow["94"];
            delete workflow["95"];
            workflow["79"].inputs.model = highNoiseModelInput;
            workflow["93"].inputs.model = lowNoiseModelInput;
        }

        // Post-processing
        workflow["111"].inputs.frame_rate = options.comfyVidWanT2VFrameRate;
        workflow["111"].inputs.format = options.comfyVidWanT2VVideoFormat;
        if (options.comfyVidWanT2VUseFilmGrain) {
            workflow["114"].inputs.grain_intensity = options.comfyVidWanT2VFilmGrainIntensity;
            workflow["114"].inputs.saturation_mix = options.comfyVidWanT2VFilmGrainSaturation;
        } else {
            delete workflow["114"];
            workflow["111"].inputs.images = ["8", 0];
        }
    } else { // Existing I2V logic
        if (!startFrame) throw new Error("A start frame is required for Image-to-Video generation.");
        workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE));
        finalPrompt = options.comfyVidWanI2VPositivePrompt || '';

        updateProgress("Uploading start frame...", 0.05);
        const startFrameInfo = await uploadImage(startFrame);
        
        workflow["52"].inputs.image = startFrameInfo.name;
        workflow["105"].inputs.unet_name = options.comfyVidWanI2VHighNoiseModel;
        workflow["106"].inputs.unet_name = options.comfyVidWanI2VLowNoiseModel;
        workflow["107"].inputs.clip_name = options.comfyVidWanI2VClipModel;
        workflow["39"].inputs.vae_name = options.comfyVidWanI2VVaeModel;
        workflow["49"].inputs.clip_name = options.comfyVidWanI2VClipVisionModel;
        workflow["112"].inputs.string = options.comfyVidWanI2VPositivePrompt;
        workflow["7"].inputs.text = options.comfyVidWanI2VNegativePrompt;
        
        const mainNode = workflow["83"];
        mainNode.inputs.length = options.comfyVidWanI2VFrameCount;
        mainNode.inputs.width = options.comfyVidWanI2VWidth;
        mainNode.inputs.height = options.comfyVidWanI2VHeight;
        
        const useEndFrame = endFrame && options.comfyVidWanI2VUseEndFrame;
        if (useEndFrame) {
            updateProgress("Uploading end frame...", 0.1);
            const endFrameInfo = await uploadImage(endFrame);
            workflow["72"].inputs.image = endFrameInfo.name;
        } else {
            delete workflow["72"];
            delete workflow["87"];
            delete mainNode.inputs.end_image;
            delete mainNode.inputs.clip_vision_end_image;
        }

        const sampler1 = workflow["101"];
        const sampler2 = workflow["102"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfyVidWanI2VSteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyVidWanI2VCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfyVidWanI2VSampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyVidWanI2VScheduler;
        sampler1.inputs.end_at_step = options.comfyVidWanI2VRefinerStartStep;
        sampler2.inputs.start_at_step = options.comfyVidWanI2VRefinerStartStep;
        sampler1.inputs.noise_seed = options.comfyVidWanI2VNoiseSeed ?? Math.floor(Math.random() * 1e15);
        sampler1.inputs.control_after_generate = options.comfyVidWanI2VSeedControl || 'randomize';

        if (options.comfyVidWanI2VUseLightningLora) {
            workflow["94"].inputs.lora_name = options.comfyVidWanI2VHighNoiseLora;
            workflow["94"].inputs.strength_model = options.comfyVidWanI2VHighNoiseLoraStrength;
            workflow["95"].inputs.lora_name = options.comfyVidWanI2VLowNoiseLora;
            workflow["95"].inputs.strength_model = options.comfyVidWanI2VLowNoiseLoraStrength;
        } else {
            delete workflow["94"];
            delete workflow["95"];
            workflow["79"].inputs.model = ["105", 0];
            workflow["93"].inputs.model = ["106", 0];
        }
        
        workflow["111"].inputs.frame_rate = options.comfyVidWanI2VFrameRate;
        workflow["111"].inputs.format = options.comfyVidWanI2VVideoFormat;
        
        if (options.comfyVidWanI2VUseFilmGrain) {
            workflow["114"].inputs.grain_intensity = options.comfyVidWanI2VFilmGrainIntensity;
            workflow["114"].inputs.saturation_mix = options.comfyVidWanI2VFilmGrainSize; 
        } else {
            delete workflow["114"];
            workflow["111"].inputs.images = ["8", 0]; 
        }
    }

    // --- Execution ---
    const { videoUrl } = await executeWorkflow(workflow, updateProgress, true);
    if (!videoUrl) throw new Error("Generation finished, but no video file was found.");
    
    return { videoUrl, finalPrompt };
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