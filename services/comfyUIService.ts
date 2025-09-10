// Fix: Implemented the full ComfyUI service to resolve module errors.
// This service handles communication with a ComfyUI backend, including checking
// connection status, fetching server info, generating prompts via Gemini,
// and running portrait generation workflows.
import { GoogleGenAI } from "@google/genai";
import type { GenerationOptions } from '../types';
import { fileToGenerativePart } from "../utils/imageUtils";
import { COMFYUI_WORKFLOW_TEMPLATE } from '../constants';

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

// --- API Functions ---
export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
    if (!url) return { success: false, error: 'URL is not provided.' };
    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        // ComfyUI root might not return OK, but it should be reachable.
        // A better check might be /system_stats
        await fetch(`${url.endsWith('/') ? url.slice(0, -1) : url}/system_stats`);
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Could not connect. Check server status and CORS settings.' };
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

const buildWorkflow = (options: GenerationOptions): any => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE));
    const checkPointLoader = workflow['4'];
    const positivePrompt = workflow['6'];
    const negativePrompt = workflow['7'];
    const kSampler = workflow['3'];
    const emptyLatent = workflow['5'];

    checkPointLoader.inputs.ckpt_name = options.comfyModel!;
    positivePrompt.inputs.text = options.comfyPrompt!;
    negativePrompt.inputs.text = "blurry, low quality, bad anatomy, worst quality, jpeg artifacts, ugly, deformed, disfigured, text, watermark, signature";
    kSampler.inputs.steps = options.comfySteps!;
    kSampler.inputs.cfg = options.comfyCfg!;
    kSampler.inputs.sampler_name = options.comfySampler!;
    kSampler.inputs.scheduler = options.comfyScheduler!;
    kSampler.inputs.seed = Math.floor(Math.random() * 1_000_000_000);

    const [w, h] = options.aspectRatio.split(':').map(Number);
    const baseRes = 1024;
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

    return workflow;
};

// --- Exported Service Functions ---
export const exportComfyUIWorkflow = (options: GenerationOptions): void => {
    const workflow = buildWorkflow(options);
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

export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: 'sdxl' | 'flux'): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const imagePart = await fileToGenerativePart(sourceImage);
    const basePrompt = "Analyze this image of a person and generate a descriptive text prompt for a text-to-image AI model. Focus on subject, expression, clothing, and background style.";
    
    const systemInstruction = modelType === 'flux'
        ? "You are a prompt generator for the FLUX.1 image model. Create a highly detailed, narrative prompt. Do not use commas; instead, use natural language conjunctions like 'and', 'with', 'wearing a'. Describe the scene, mood, and lighting in a conversational style."
        : "You are a prompt generator for the SDXL image model. Create a concise, keyword-driven prompt under 75 words. Use comma-separated keywords and phrases. Prioritize key elements: subject, clothing, action, setting, and style. Be direct and specific.";

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

export const generateComfyUIPortraits = async (
    options: GenerationOptions,
    onProgress: (message: string, progress: number) => void
): Promise<{ images: string[], finalPrompt: string }> => {
    const clientId = getClientId();
    const baseUrl = getComfyUIUrl();

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${new URL(baseUrl).host}/ws?clientId=${clientId}`);
        
        const queuedPromptIds = new Set<string>();
        const executedPromptIds = new Set<string>();
        const imageMetadata: any[] = [];
        const totalImagesToGenerate = options.numImages;
        let isCompleted = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

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
                onProgress("Fetching final images...", 0.98);
                try {
                    const imageDataUrls = await Promise.all(
                        imageMetadata.map(img => getImageAsDataUrl(img.filename, img.subfolder, img.type))
                    );
                    cleanupAndEnd('resolve', { images: imageDataUrls, finalPrompt: options.comfyPrompt! });
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
            try {
                onProgress(`Queuing ${totalImagesToGenerate} images...`, 0.10);
                for (let i = 0; i < totalImagesToGenerate; i++) {
                    const workflow = buildWorkflow(options);
                    // Use a different seed for each image
                    workflow[Object.keys(workflow).find(k => workflow[k].class_type.includes('Sampler'))!].inputs.seed = Math.floor(Math.random() * 1_000_000_000);
                    const response = await queuePrompt(workflow);
                    if (response.prompt_id) {
                        queuedPromptIds.add(response.prompt_id);
                    } else {
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

                switch (data.type) {
                    case 'progress': {
                        const { value, max } = data.data;
                        const executedCount = executedPromptIds.size;
                        const currentProgress = value / max;
                        const progressPercentage = 0.15 + (0.80 * ((executedCount + currentProgress) / totalImagesToGenerate));
                        onProgress(`Generating image ${executedCount + 1}...`, Math.min(progressPercentage, 0.95));
                        break;
                    }
                    case 'executing': {
                        const promptId = data.data.prompt_id;
                        if (queuedPromptIds.has(promptId)) {
                             const executedCount = executedPromptIds.size;
                             const progress = 0.15 + (0.80 * (executedCount / totalImagesToGenerate));
                             onProgress(`Generating image ${executedCount + 1}...`, Math.min(progress, 0.95));
                        }
                        break;
                    }
                    case 'executed': {
                        const promptId = data.data.prompt_id;
                        if (executedPromptIds.has(promptId)) break; 

                        // The final image data comes from the PreviewImage node, which is '9'
                        if (queuedPromptIds.has(promptId) && data.data.node === '9') {
                            executedPromptIds.add(promptId);
                            if (data.data.output.images) {
                                imageMetadata.push(...data.data.output.images);
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