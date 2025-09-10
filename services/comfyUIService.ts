import type { GenerationOptions } from '../types';
import { COMFYUI_WORKFLOW_TEMPLATE } from '../constants';
import { fileToGenerativePart } from '../utils/imageUtils';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const COMFYUI_URL_KEY = 'comfyui_url';

/**
 * A wrapper around fetch that adds a timeout.
 */
const fetchWithTimeout = async (resource: RequestInfo, options?: RequestInit, timeout = 8000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  
  clearTimeout(id);
  return response;
};


/**
 * Checks if a connection can be established with the ComfyUI server.
 */
export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
  const cleanUrl = url.replace(/\/+$/, '');
  try {
    // Use a short timeout for the connection check
    const response = await fetchWithTimeout(`${cleanUrl}/queue`, { mode: 'cors' }, 5000); // 5 second timeout
    if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
    }
    const data = await response.json();
    if (typeof data.queue_running === 'undefined') {
        throw new Error('Invalid response. Is this a ComfyUI server?');
    }
    return { success: true };
  } catch (error: any) {
    console.error("ComfyUI connection check failed:", error);
    if (error.name === 'AbortError') {
        return { success: false, error: 'Connection timed out. The server might be slow or unreachable.' };
    }
    if (error.message.includes('Failed to fetch')) {
        return { success: false, error: 'Network error. Is the server running? Check URL and ensure ComfyUI has CORS enabled (use --enable-cors flag).' };
    }
    return { success: false, error: error.message };
  }
};


/**
 * Fetches the entire object_info payload from ComfyUI, which contains
 * information about all available nodes, models, etc.
 */
export const getComfyUIObjectInfo = async (): Promise<any> => {
    const url = localStorage.getItem(COMFYUI_URL_KEY);
    if (!url) throw new Error("ComfyUI URL not set.");
    
    try {
        const res = await fetchWithTimeout(`${url}/object_info`, { mode: 'cors' });
        if (!res.ok) {
            throw new Error(`Server responded with status: ${res.status}`);
        }
        return await res.json();
    } catch (e: any) {
        console.error(`Failed to fetch ComfyUI object info:`, e);
        if (e.name === 'AbortError') {
            throw new Error('Request to ComfyUI server timed out.');
        }
        // Re-throw so the UI can catch it.
        throw e;
    }
};

const queueComfyUIPrompt = async (prompt: object, serverUrl: string, clientId: string): Promise<{ prompt_id: string }> => {
    const response = await fetch(`${serverUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: clientId }),
        mode: 'cors',
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to queue prompt in ComfyUI: ${errorText}`);
    }
    return await response.json();
};

/**
 * Generates a ComfyUI API workflow JSON for text-to-image.
 */
const buildTxt2ImgWorkflow = (options: GenerationOptions, seed: number): object => {
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE));

    // 1. Remove IPAdapter related nodes as we are doing Txt2Img
    delete workflow['10']; // Load Image
    delete workflow['12']; // IPAdapter Model Loader
    delete workflow['13']; // IPAdapter

    // 2. Find key node IDs from the template
    const checkPointLoaderNodeId = '4';
    const kSamplerNodeId = '3';
    const positivePromptNodeId = '6';
    const negativePromptNodeId = '7';
    const emptyLatentNodeId = '5';
    
    // 3. UNIVERSAL FIX: Re-wire the CLIP inputs for both encoders to the main checkpoint loader.
    // This is necessary because the original template routes them through the IPAdapter, which we have deleted.
    workflow[positivePromptNodeId].inputs.clip = [ checkPointLoaderNodeId, 1 ];
    workflow[negativePromptNodeId].inputs.clip = [ checkPointLoaderNodeId, 1 ];

    // 4. Combine prompts
    const fullPrompt = [
        `Style: ${options.photoStyle}, ${options.imageStyle}, ${options.eraStyle}.`,
        options.comfyPrompt,
    ].join(' ');

    // 5. Configure nodes based on Model Architecture (SDXL vs FLUX)
    if (options.comfyModelType === 'flux') {
        // --- FLUX WORKFLOW ---
        if (!options.comfyFluxNodeName) {
            throw new Error('FLUX model was selected, but a compatible guidance node was not found or specified.');
        }
        const guidanceNodeId = '14'; // Assign a new, unused ID

        // 5a. Add the FLUX Guidance node.
        workflow[guidanceNodeId] = {
            "inputs": {
                "conditioning": [positivePromptNodeId, 0],
                "guidance": options.comfyFluxGuidance,
            },
            "class_type": options.comfyFluxNodeName,
            "_meta": { "title": "FLUX Guidance" }
        };
        
        // 5b. Set prompt text. CLIP inputs are now wired correctly.
        workflow[positivePromptNodeId].inputs.text = fullPrompt;
        workflow[negativePromptNodeId].inputs.text = ""; // Flux doesn't use a negative prompt

        // 5c. Rewire the KSampler for FLUX.
        workflow[kSamplerNodeId].inputs.model = [checkPointLoaderNodeId, 0];
        workflow[kSamplerNodeId].inputs.positive = [guidanceNodeId, 0];
        workflow[kSamplerNodeId].inputs.negative = [negativePromptNodeId, 0];
        
    } else {
        // --- SDXL WORKFLOW (Default) ---
        // 5a. Wire KSampler model input directly to the loader
        workflow[kSamplerNodeId].inputs.model = [ checkPointLoaderNodeId, 0 ];
        
        // 5b. Wire text encoders to the KSampler's positive/negative inputs
        workflow[kSamplerNodeId].inputs.positive = [ positivePromptNodeId, 0 ];
        workflow[kSamplerNodeId].inputs.negative = [ negativePromptNodeId, 0 ];
        
        // 5c. Set prompt text. CLIP inputs are now wired correctly.
        workflow[positivePromptNodeId].inputs.text = fullPrompt;
    }
    
    // 6. Apply shared settings
    workflow[checkPointLoaderNodeId].inputs.ckpt_name = options.comfyModel;
    
    const [width, height] = options.aspectRatio.split(':').map(Number);
    const baseDimension = 1024;
    let finalWidth = baseDimension;
    let finalHeight = baseDimension;
    const ratio = width / height;

    if (ratio > 1) { // Landscape
        finalHeight = Math.round(baseDimension / ratio);
    } else { // Portrait or Square
        finalWidth = Math.round(baseDimension * ratio);
    }
    
    // ComfyUI requires dimensions to be multiples of 8.
    finalWidth = Math.round(finalWidth / 8) * 8;
    finalHeight = Math.round(finalHeight / 8) * 8;
    
    workflow[emptyLatentNodeId].inputs.width = finalWidth;
    workflow[emptyLatentNodeId].inputs.height = finalHeight;

    const kSampler = workflow[kSamplerNodeId].inputs;
    kSampler.seed = seed;
    kSampler.steps = options.comfySteps;
    kSampler.cfg = options.comfyCfg;
    kSampler.sampler_name = options.comfySampler;
    kSampler.scheduler = options.comfyScheduler;
    
    return workflow;
};

export const generateComfyUIPromptFromSource = async (imageFile: File): Promise<string> => {
    try {
        const imagePart = await fileToGenerativePart(imageFile);
        const prompt = `Analyze this image. Generate a detailed, descriptive prompt for an AI image generator that captures the entire scene. Describe the person's appearance (facial features, hair, expression), their clothing, the background environment, the lighting, and the overall mood. The goal is a comprehensive prompt to recreate the whole picture. Start the prompt with "A photorealistic portrait of...".`;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [imagePart, { text: prompt }],
            },
        });

        const text = result.text.trim();

        if (!text) {
            throw new Error('The AI did not return a description.');
        }

        return text;

    } catch (error: any) {
        console.error("Error generating prompt from image:", error);
        throw new Error(error.message || "Failed to generate a prompt from the image.");
    }
};

export const generateComfyUIPortraits = async (
  options: GenerationOptions,
  onProgress: (message: string, progress: number) => void
): Promise<string[]> => {
    const url = localStorage.getItem(COMFYUI_URL_KEY);
    if (!url) {
        throw new Error('ComfyUI server URL is not set. Please configure it in the connection settings.');
    }
    if (!options.comfyPrompt?.trim()) {
        throw new Error('ComfyUI prompt cannot be empty.');
    }

    onProgress("Connecting to ComfyUI...", 0);
    const connection = await checkConnection(url);
    if (!connection.success) {
        throw new Error(`ComfyUI connection failed: ${connection.error}`);
    }

    onProgress("Preparing generation...", 0.05);
    
    const clientId = `${Date.now()}-${Math.random()}`;
    const generatedImages: string[] = [];
    const totalImages = options.numImages;

    for (let i = 0; i < totalImages; i++) {
        const progressStart = (i / totalImages) * 0.95 + 0.05; 
        const progressEnd = ((i + 1) / totalImages) * 0.95 + 0.05;
        onProgress(`Queuing image ${i + 1}/${totalImages}...`, progressStart);

        const workflow = buildTxt2ImgWorkflow(options, Math.floor(Math.random() * 1e15));
        const queueResponse = await queueComfyUIPrompt(workflow, url, clientId);
        const promptId = queueResponse.prompt_id;

        const finalImageBlob = await new Promise<Blob>((resolve, reject) => {
            const wsUrl = `ws://${url.split('//')[1]}/ws?clientId=${clientId}`;
            const socket = new WebSocket(wsUrl);

            const timeout = setTimeout(() => {
                socket.close();
                reject(new Error('ComfyUI generation timed out.'));
            }, 600000); // 10 minute timeout

            socket.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'progress' && msg.data.prompt_id === promptId) {
                        const { value, max } = msg.data;
                        const stepProgress = value / max;
                        const overallProgress = progressStart + stepProgress * (progressEnd - progressStart);
                        onProgress(`Sampling image ${i + 1} (${value}/${max})...`, overallProgress);
                    } else if (msg.type === 'executed' && msg.data.prompt_id === promptId) {
                        const previewNodeId = Object.keys(workflow).find(key => (workflow as any)[key].class_type === 'PreviewImage');
                        if (previewNodeId && msg.data.node === previewNodeId) {
                          const outputs = msg.data.output;
                          if (outputs.images && outputs.images.length > 0) {
                              const imageInfo = outputs.images[0];
                              onProgress(`Downloading image ${i + 1}...`, progressEnd);
                              
                              const imageUrl = `${url}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${imageInfo.type}`;
                              const imageResponse = await fetch(imageUrl, { mode: 'cors' });
                              
                              if (!imageResponse.ok) {
                                  throw new Error(`Failed to fetch generated image. Status: ${imageResponse.status}`);
                              }
                              const imageBlob = await imageResponse.blob();
                              resolve(imageBlob);
                              socket.close();
                              clearTimeout(timeout);
                          }
                        }
                    }
                } catch(e) {
                    reject(e);
                    socket.close();
                    clearTimeout(timeout);
                }
            };
            
            socket.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('ComfyUI WebSocket connection error.'));
            };
            socket.onclose = () => clearTimeout(timeout);
        });
        
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(finalImageBlob);
        });
        generatedImages.push(dataUrl);
    }
    
    return generatedImages;
};


/**
 * Triggers a browser download for a JSON object.
 */
const downloadJson = (jsonData: object, filename: string) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(jsonData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};


/**
 * Main function to generate and download the ComfyUI workflow.
 */
export const exportComfyUIWorkflow = (options: GenerationOptions) => {
    if (!options.comfyPrompt?.trim()) {
      throw new Error("Cannot export workflow with an empty prompt.");
    }
    const seed = Math.floor(Math.random() * 1e15); // Use a random seed for export
    const workflowJson = buildTxt2ImgWorkflow(options, seed);
    downloadJson(workflowJson, 'workflow.json');
};
