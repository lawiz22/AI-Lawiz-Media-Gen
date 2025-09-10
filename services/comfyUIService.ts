import type { GenerationOptions } from '../types';
import { COMFYUI_WORKFLOW_TEMPLATE } from '../constants';

const COMFYUI_URL_KEY = 'comfyui_url';

/**
 * Checks if a connection can be established with the ComfyUI server.
 */
export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`${url}/system_stats`, { mode: 'cors' });
    if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
    }
    await response.json(); // Ensure the body is valid JSON
    return { success: true };
  } catch (error: any) {
    console.error("ComfyUI connection check failed:", error);
    if (error.message.includes('Failed to fetch')) {
        return { success: false, error: 'Network error. Check CORS settings on your ComfyUI server and ensure the URL is correct.' };
    }
    return { success: false, error: error.message };
  }
};

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
 * Fetches available resources like checkpoints, samplers, or schedulers from ComfyUI.
 */
export const getComfyUIResource = async (resourceType: 'checkpoints' | 'samplers' | 'schedulers'): Promise<string[]> => {
    const url = localStorage.getItem(COMFYUI_URL_KEY);
    if (!url) throw new Error("ComfyUI URL not set.");
    
    try {
        const res = await fetchWithTimeout(`${url}/object_info`, { mode: 'cors' });
        if (!res.ok) {
            throw new Error(`Server responded with status: ${res.status}`);
        }
        const data = await res.json();
        
        switch (resourceType) {
            case 'checkpoints':
                return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
            case 'samplers':
                return data?.KSampler?.input?.required?.sampler_name?.[0] || [];
            case 'schedulers':
                return data?.KSampler?.input?.required?.scheduler?.[0] || [];
            default:
                return [];
        }
    } catch (e: any) {
        console.error(`Failed to fetch ComfyUI ${resourceType}:`, e);
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
    // Deep copy the template to avoid modifying the original constant
    const workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE));

    // 1. Remove IPAdapter related nodes
    delete workflow['10']; // Load Image
    delete workflow['12']; // IPAdapter Model Loader
    delete workflow['13']; // IPAdapter

    // 2. Find key nodes to rewire
    const checkPointLoaderNodeId = Object.keys(workflow).find(id => workflow[id].class_type === 'CheckpointLoaderSimple') || '4';
    const kSamplerNodeId = Object.keys(workflow).find(id => workflow[id].class_type === 'KSampler') || '3';
    const positivePromptNodeId = Object.keys(workflow).find(id => workflow[id].class_type === 'CLIPTextEncode' && workflow[id]._meta.title === 'Positive Prompt') || '6';
    const negativePromptNodeId = Object.keys(workflow).find(id => workflow[id].class_type === 'CLIPTextEncode' && workflow[id]._meta.title === 'Negative Prompt') || '7';

    // 3. Rewire nodes for a standard text-to-image workflow
    // The KSampler's model now comes directly from the checkpoint loader
    workflow[kSamplerNodeId].inputs.model = [ checkPointLoaderNodeId, 0 ];
    // The CLIPTextEncode nodes' clip now comes directly from the checkpoint loader
    workflow[positivePromptNodeId].inputs.clip = [ checkPointLoaderNodeId, 1 ];
    workflow[negativePromptNodeId].inputs.clip = [ checkPointLoaderNodeId, 1 ];
    
    // 4. Update node inputs with user options
    workflow[checkPointLoaderNodeId].inputs.ckpt_name = options.comfyModel;
    
    // Combine the main prompt with other style options for a richer result
    const fullPrompt = [
        `Style: ${options.photoStyle}, ${options.imageStyle}, ${options.eraStyle}.`,
        options.comfyPrompt,
    ].join(' ');
    workflow[positivePromptNodeId].inputs.text = fullPrompt;
    
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
    
    const emptyLatentNodeId = Object.keys(workflow).find(id => workflow[id].class_type === 'EmptyLatentImage') || '5';
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
            }, 180000); // 3 minute timeout

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