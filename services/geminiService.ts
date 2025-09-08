// Implemented Gemini API service to fix module resolution errors.
import { GoogleGenAI, Modality, Part } from "@google/genai";
import type { GenerationOptions } from "../types";
import { fileToGenerativePart } from "../utils/imageUtils";
import { cropImageToAspectRatio } from "../utils/imageProcessing";
import { POSES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// Helper to decode base64 poses
const decodePose = (encoded: string): string => {
  try {
    // This will work in browser environments
    return atob(encoded);
  } catch (e) {
    console.error("Failed to decode pose:", e);
    // Fallback for non-browser env or error
    return "a standard portrait pose";
  }
};

const dataUrlToGenerativePart = async (dataUrl: string): Promise<Part> => {
    const [header, base64Data] = dataUrl.split(',');
    if (!header || !base64Data) {
        throw new Error('Invalid data URL format');
    }
    const mimeMatch = header.match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) {
        throw new Error('Could not extract MIME type from data URL');
    }
    const mimeType = mimeMatch[1];
    return {
        inlineData: {
            mimeType: mimeType,
            data: base64Data,
        },
    };
};

export const generateBackgroundImagePreview = async (
  prompt: string,
  aspectRatio: string
): Promise<string> => {
  if (!prompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }
  
  const fullPrompt = `A high-quality, photorealistic background image for a portrait photography session. The background should be: ${prompt}. Do not include any people or prominent figures. Focus on creating a beautiful and believable environment.`;

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: fullPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    } else {
      throw new Error("The AI did not return an image. Please try a different prompt.");
    }
  } catch (error: any) {
    console.error("Error generating background preview:", error);
    // Re-throw a more user-friendly error message
    throw new Error(error.message || "Failed to generate background preview due to an unknown error.");
  }
};

export const enhanceImageResolution = async (base64ImageData: string): Promise<string> => {
    const imagePart = await dataUrlToGenerativePart(base64ImageData);
    
    // The model for image editing.
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview', 
        contents: {
            parts: [
                imagePart,
                { text: 'Upscale this image to a higher resolution, enhance its quality, sharpen details, and make it look photorealistic without altering the subject or style.' },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    
    const textResponse = result.text.trim();
    if (textResponse) {
        throw new Error(`AI returned text instead of an image: ${textResponse}`);
    }

    throw new Error('Image enhancement failed. No image was returned from the API.');
};


export const generatePortraitSeries = async (
  sourceImage: File,
  clothingImage: File | null,
  backgroundImage: File | null,
  previewedBackground: string | null,
  options: GenerationOptions,
  onProgress: (message: string, progress: number) => void
): Promise<string[]> => {

  onProgress("Preparing images...", 0.05);
  const croppedSourceImage = await cropImageToAspectRatio(sourceImage, options.aspectRatio);
  const sourceImagePart = await fileToGenerativePart(croppedSourceImage);
  
  const clothingImagePart = clothingImage ? await fileToGenerativePart(clothingImage) : null;
  const backgroundImagePart = backgroundImage ? await fileToGenerativePart(backgroundImage) : null;

  let consistentBackgroundPart: Part | null = null;
  if (options.background === 'prompt' && options.consistentBackground && previewedBackground) {
    consistentBackgroundPart = await dataUrlToGenerativePart(previewedBackground);
  }

  let selectedPoses: string[];
  if (options.poseMode === 'select' && options.poseSelection.length > 0) {
    selectedPoses = options.poseSelection;
  } else {
    // Randomly select `numImages` poses from the full list
    selectedPoses = [...POSES].sort(() => 0.5 - Math.random()).slice(0, options.numImages);
  }
  
  const totalImages = Math.min(options.numImages, selectedPoses.length);
  const generatedImages: string[] = [];

  for (let i = 0; i < totalImages; i++) {
    const progress = (i + 1) / totalImages;
    onProgress(`Generating image ${i + 1} of ${totalImages}...`, progress);

    const pose = decodePose(selectedPoses[i]);
    
    const parts: Part[] = [sourceImagePart];
    const promptSegments: string[] = [`A person with the same face and features as in the reference image.`];
    
    promptSegments.push(`Pose: ${pose}`);

    // Clothing
    if (options.clothing === 'image' && clothingImagePart) {
        parts.push(clothingImagePart);
        promptSegments.push(`Clothing: The person should be wearing an outfit identical to the one in the provided clothing image.`);
    } else if (options.clothing === 'prompt' && options.customClothingPrompt) {
        promptSegments.push(`Clothing: ${options.customClothingPrompt}`);
    } else { // 'original'
        promptSegments.push('Clothing: The person should wear the same outfit as in the reference image.');
    }

    // Background
    if (consistentBackgroundPart) {
        parts.push(consistentBackgroundPart);
        promptSegments.push(`Background: Place the person in a setting identical to the provided background image.`);
    } else if (options.background === 'image' && backgroundImagePart) {
        parts.push(backgroundImagePart);
        promptSegments.push(`Background: Place the person in a setting identical to the provided background image.`);
    } else if (options.background === 'prompt' && options.customBackground) {
        promptSegments.push(`Background: ${options.customBackground}`);
    } else if (options.background !== 'original') {
        promptSegments.push(`Background: A solid ${options.background} studio background.`);
    } else {
        promptSegments.push('Background: Keep the original background from the reference image.');
    }

    promptSegments.push(`Photo Style: ${options.photoStyle}.`);
    promptSegments.push("Ensure the final image is a high-quality, realistic photograph.");
    
    parts.push({ text: promptSegments.join(' ') });

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        let imageFound = false;
        for (const part of result.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes: string = part.inlineData.data;
                generatedImages.push(`data:${part.inlineData.mimeType};base64,${base64ImageBytes}`);
                imageFound = true;
                break; 
            }
        }
        
        if (!imageFound) {
             const textResponse = result.text.trim();
             if (textResponse) {
                throw new Error(`AI returned text instead of an image: ${textResponse}`);
             }
             throw new Error('Generation failed for one image: No image was returned from the API.');
        }

    } catch (error) {
        console.error(`Error generating image ${i + 1}:`, error);
        // Rethrow to be caught by the UI
        throw error;
    }
  }

  return generatedImages;
};