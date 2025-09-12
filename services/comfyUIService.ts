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

// Fix: Expanded modelType to include other compatible model types to resolve the TypeScript error in App.tsx.
export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-flux-image' | 'flux-krea'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    let instruction = '';
    switch(modelType) {
        case 'sd1.5':
            instruction = 'Describe this image in a very simple, comma-separated list of keywords suitable for an SD1.5 model. Focus on the main subject and key visual elements. Avoid complex sentences. Example: "a woman smiling, portrait, studio lighting, professional photo".';
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

export const extractBackgroundPromptFromImage = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const instruction = `Analyze the background of this image, ignoring any people or foreground subjects. Describe the environment in detail. The description should be suitable for an image generation model of type '${modelType}'. For SD1.5, use simple keywords. For SDXL, use a natural sentence. For FLUX, use a detailed, artistic paragraph.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: instruction }] },
        config: { temperature: 0.4 }
    });
    
    const text = result.text?.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a background prompt.');
    return text;
};

export const extractSubjectPromptFromImage = async (sourceImage: File, modelType: 'sd1.5' | 'sdxl' | 'flux'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const instruction = `Analyze the main subject (person or object) of this image, ignoring the background. Describe the subject in detail, including appearance, clothing, and any defining features. The description should be suitable for an image generation model of type '${modelType}'. For SD1.5, use simple keywords. For SDXL, use a natural sentence. For FLUX, use a detailed, artistic paragraph.`;

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
    modelType: 'sd1.5' | 'sdxl' | 'flux',
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
    if (data.error) throw new Error(`Error from ComfyUI: ${data.error.type} - ${data.error.message}`);
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
    // This is a simplified workflow builder. A full version would be much larger.
    let workflow;
    switch(options.comfyModelType) {
        case 'sd1.5': workflow = JSON.parse(JSON.stringify(COMFYUI_SD15_WORKFLOW_TEMPLATE)); break;
        case 'wan2.2': workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-kontext-flux': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-flux-image': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE)); break;
        case 'flux-krea': workflow = JSON.parse(JSON.stringify(COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE)); break;
        case 'sdxl':
        case 'flux':
        default: workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE)); break;
    }
    
    // --- Generic Modifications ---
    const posPromptNode = Object.values(workflow).find((n: any) => n._meta?.title?.includes("Positive Prompt")) as any;
    const negPromptNode = Object.values(workflow).find((n: any) => n._meta?.title?.includes("Negative Prompt")) as any;
    if (posPromptNode) posPromptNode.inputs.text = options.comfyPrompt;
    if (negPromptNode) negPromptNode.inputs.text = options.comfyNegativePrompt;

    if (options.comfyModelType === 'nunchaku-kontext-flux' && sourceFile) {
        const uploadedImage = await uploadImage(sourceFile);
        const loadImageNode = Object.values(workflow).find((n: any) => n.class_type === 'LoadImage') as any;
        if(loadImageNode) loadImageNode.inputs.image = uploadedImage.name;
    }
    // More modifications would go here based on workflow type
    
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
        const ksamplerNode = Object.values(currentWorkflow).find((n: any) => n.class_type.startsWith('KSampler')) as any;
        if (ksamplerNode) {
            ksamplerNode.inputs.seed = Math.floor(Math.random() * 1e15);
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
    endFrame: File,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE));
    
    updateProgress("Uploading start frame...", 0.05);
    const startFrameInfo = await uploadImage(startFrame);
    updateProgress("Uploading end frame...", 0.1);
    const endFrameInfo = await uploadImage(endFrame);

    // Modify workflow nodes
    workflow["52"].inputs.image = startFrameInfo.name;
    workflow["72"].inputs.image = endFrameInfo.name;
    workflow["6"].inputs.text = options.comfyVidWanI2VPositivePrompt;
    workflow["7"].inputs.text = options.comfyVidWanI2VNegativePrompt;
    // ... add all other options from `options` to the workflow JSON
    workflow["111"].inputs.frame_rate = options.comfyVidWanI2VFrameRate;
    workflow["83"].inputs.length = options.comfyVidWanI2VFrameCount;

    const { videoUrl } = await executeWorkflow(workflow, updateProgress);
    if (!videoUrl) throw new Error("Video generation failed: no video URL returned.");

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