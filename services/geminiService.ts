// Implemented Gemini API service to fix module resolution errors.
// Fix: Removed HarmCategory and HarmBlockThreshold as they are no longer used after removing safety settings.
import { GoogleGenAI, Modality, Part } from "@google/genai";
import type { GenerationOptions } from "../types";
import { fileToGenerativePart } from "../utils/imageUtils";
import { cropImageToAspectRatio } from "../utils/imageProcessing";
import { buildPromptSegments, decodePose, getRandomPose } from '../utils/promptBuilder';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// Fix: Removed the safetySettings constant as it's not a supported parameter
// in the Gemini API calls used in this file and was causing errors.

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

export const generatePromptFromImage = async (imageFile: File): Promise<string> => {
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

export const generateBackgroundImagePreview = async (
  prompt: string,
  aspectRatio: string
): Promise<string> => {
  if (!prompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }
  
  const fullPrompt = `A high-quality, photorealistic background image for a portrait photography session. The background should be: ${prompt}. Do not include any people or prominent figures. Focus on creating a beautiful and believable environment.`;

  try {
    // Fix: Removed the unsupported 'safetySettings' property from the generateImages call.
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
    // Fix: Removed the unsupported 'safetySettings' property from the generateContent call.
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview', 
        contents: {
            parts: [
                imagePart,
                { text: 'Upscale this image to a higher resolution, enhance its quality, sharpen details, and make it look photorealistic without altering the subject or style. Ensure the result is a tasteful and high-quality photograph.' },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts) {
        for (const part of result.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes: string = part.inlineData.data;
                return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
            }
        }
    }
    
    const textResponse = result.text?.trim();
    if (textResponse) {
        throw new Error(`AI returned text instead of an image: ${textResponse}`);
    }

    throw new Error('Image enhancement failed. No image was returned from the API. The request may have been blocked.');
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
  let posesAreEncoded = true; // Flag to check if poses need decoding

  if (options.poseMode === 'select' && options.poseSelection.length > 0) {
    selectedPoses = options.poseSelection;
  } else if (options.poseMode === 'prompt' && options.poseSelection.length > 0) {
    selectedPoses = options.poseSelection;
    posesAreEncoded = false; // Custom poses are plain text
  } else {
    // 'random' mode or fallback, get a unique set of random poses
    selectedPoses = Array.from({ length: options.numImages }, () => getRandomPose());
  }
  
  const totalImages = Math.min(options.numImages, selectedPoses.length);
  const generatedImages: string[] = [];

  for (let i = 0; i < totalImages; i++) {
    const progress = (i + 1) / totalImages;
    onProgress(`Generating image ${i + 1} of ${totalImages}...`, progress);

    const pose = posesAreEncoded ? decodePose(selectedPoses[i]) : selectedPoses[i];
    
    const parts: Part[] = [sourceImagePart];
    const promptSegments = buildPromptSegments(options, pose);
    
    // Handle clothing image part
    if (options.clothing === 'image' && clothingImagePart) {
        parts.push(clothingImagePart);
    }

    // Handle background image parts
    if (consistentBackgroundPart) {
        parts.push(consistentBackgroundPart);
    } else if (options.background === 'image' && backgroundImagePart) {
        parts.push(backgroundImagePart);
    }
    
    parts.push({ text: promptSegments.join(' ') });

    try {
        // Fix: Removed the unsupported 'safetySettings' property from the generateContent call.
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        
        let imageFound = false;
        if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts) {
            for (const part of result.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64ImageBytes: string = part.inlineData.data;
                    generatedImages.push(`data:${part.inlineData.mimeType};base64,${base64ImageBytes}`);
                    imageFound = true;
                    break; 
                }
            }
        }
        
        if (!imageFound) {
             const textResponse = result.text?.trim();
             if (textResponse) {
                throw new Error(`AI returned text instead of an image: ${textResponse}`);
             }
             throw new Error('Generation failed for one image: No image was returned. The request might have been blocked due to safety settings.');
        }

    } catch (error) {
        console.error(`Error generating image ${i + 1}:`, error);
        // Rethrow to be caught by the UI
        throw error;
    }
  }

  return generatedImages;
};