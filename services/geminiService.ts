
// Implemented Gemini API service to fix module resolution errors.
// Fix: Removed HarmCategory and HarmBlockThreshold as they are no longer used after removing safety settings.
import { GoogleGenAI, Modality, Part, GenerateContentConfig } from "@google/genai";
import type { GenerationOptions } from "../types";
import { fileToGenerativePart, fileToBase64 } from "../utils/imageUtils";
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

export const generateClothingPreview = async (prompt: string, aspectRatio: string): Promise<string> => {
  if (!prompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }
  
  const fullPrompt = `A high-quality, photorealistic image of a single clothing item on a plain white background. The item is: ${prompt}. Do not include any person, mannequin, or body parts. The image should be a clean product shot of the clothing.`;

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
    console.error("Error generating clothing preview:", error);
    throw new Error(error.message || "Failed to generate clothing preview due to an unknown error.");
  }
};

export const generateBackgroundImagePreview = async (
  prompt: string,
  aspectRatio: string
): Promise<string> => {
  if (!prompt.trim()) {
    throw new Error("Prompt cannot be empty.");
  }
  
  const fullPrompt = `A high-quality, photorealistic background image for a photography session. The background should be: ${prompt}. Do not include any people or prominent figures. Focus on creating a beautiful and believable environment.`;

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

export const generateImagesFromPrompt = async (
  options: GenerationOptions,
  onProgress: (message: string, progress: number) => void
): Promise<{ images: string[], firstPrompt: string }> => {
  if (!options.geminiPrompt?.trim()) {
    throw new Error("Prompt cannot be empty for text-to-image generation.");
  }

  const styleSegments = [];
  if (options.imageStyle === 'photorealistic') {
    styleSegments.push(options.eraStyle, options.photoStyle, 'photorealistic style');
  } else {
    styleSegments.push(`in a ${options.imageStyle} style`);
  }

  let fullPrompt = `${options.geminiPrompt}. ${styleSegments.join(', ')}.`;

  if (options.addTextToImage && options.textOnImagePrompt?.trim() && options.textObjectPrompt?.trim()) {
      let textPrompt = options.textObjectPrompt.replace('%s', options.textOnImagePrompt);
      fullPrompt += ` The image must include ${textPrompt}.`;
  }

  const totalImages = options.numImages;
  const generatedImages: string[] = [];

  onProgress("Preparing for generation...", 0.1);

  for (let i = 0; i < totalImages; i++) {
    const progress = 0.1 + (i / totalImages) * 0.9;
    onProgress(`Generating image ${i + 1} of ${totalImages}...`, progress);

    try {
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: options.aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        generatedImages.push(`data:image/jpeg;base64,${base64ImageBytes}`);
      } else {
        throw new Error(`The AI did not return an image for iteration ${i + 1}.`);
      }
    } catch (error: any) {
      console.error(`Error generating image ${i + 1}:`, error);
      throw new Error(error.message || `Failed to generate image ${i + 1} due to an unknown error.`);
    }
  }

  onProgress("Finalizing results...", 0.99);
  return { images: generatedImages, firstPrompt: fullPrompt };
};

export const generatePortraitSeries = async (
  sourceImage: File,
  clothingImage: File | null,
  backgroundImage: File | null,
  previewedBackground: string | null,
  previewedClothing: string | null,
  options: GenerationOptions,
  onProgress: (message: string, progress: number) => void
): Promise<{ images: string[], firstPrompt: string }> => {

  onProgress("Cropping source image...", 0.05);
  const croppedSourceImage = await cropImageToAspectRatio(sourceImage, options.aspectRatio);
  
  onProgress("Preparing image data...", 0.1);
  const sourceImagePart = await fileToGenerativePart(croppedSourceImage);
  
  const clothingImagePart = clothingImage ? await fileToGenerativePart(clothingImage) : null;
  const backgroundImagePart = backgroundImage ? await fileToGenerativePart(backgroundImage) : null;

  let consistentBackgroundPart: Part | null = null;
  if (options.background === 'prompt' && options.consistentBackground && previewedBackground) {
    consistentBackgroundPart = await dataUrlToGenerativePart(previewedBackground);
  }
  
  let consistentClothingPart: Part | null = null;
  if ((options.clothing === 'prompt' || options.clothing === 'random') && previewedClothing) {
    consistentClothingPart = await dataUrlToGenerativePart(previewedClothing);
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
  let firstPrompt: string | null = null;

  for (let i = 0; i < totalImages; i++) {
    const baseProgress = (i / totalImages) * 0.8 + 0.15; // Progress from 15% to 95%
    const pose = posesAreEncoded ? decodePose(selectedPoses[i]) : selectedPoses[i];
    
    onProgress(`Building prompt for image ${i + 1}...`, baseProgress);
    const parts: Part[] = [sourceImagePart];
    const promptSegments = buildPromptSegments(options, pose, !!consistentClothingPart);
    
    // Handle clothing image parts
    if (consistentClothingPart) {
        parts.push(consistentClothingPart);
    } else if (options.clothing === 'image' && clothingImagePart) {
        parts.push(clothingImagePart);
    }

    // Handle background image parts
    if (consistentBackgroundPart) {
        parts.push(consistentBackgroundPart);
    } else if (options.background === 'image' && backgroundImagePart) {
        parts.push(backgroundImagePart);
    }
    
    const finalPromptText = promptSegments.join(' ');
    parts.push({ text: finalPromptText });
    
    if (i === 0) {
      firstPrompt = finalPromptText;
    }

    try {
        onProgress(`Sending request for image ${i + 1}...`, baseProgress + (0.4 / totalImages));
        const genConfig: GenerateContentConfig = {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        };

        // Add temperature for non-photorealistic styles to control creativity
        if (options.imageStyle !== 'photorealistic' && options.creativity !== undefined) {
            genConfig.temperature = options.creativity;
        }

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: genConfig,
        });
        
        onProgress(`Processing response for image ${i + 1}...`, baseProgress + (0.8 / totalImages));
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

  onProgress("Finalizing results...", 0.98);
  return { images: generatedImages, firstPrompt: firstPrompt || "No prompt was generated." };
};

export const generateGeminiVideo = async (
  inputImage: File | null,
  options: GenerationOptions,
  onProgress: (message: string, progress: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    if (!options.geminiVidPrompt) {
        throw new Error("A text prompt is required for video generation.");
    }

    onProgress("Preparing video generation request...", 0.05);

    const videoRequest: any = {
        model: options.geminiVidModel || 'veo-2.0-generate-001',
        prompt: options.geminiVidPrompt,
        config: {
            numberOfVideos: 1,
        }
    };

    if (inputImage) {
        onProgress("Encoding input image...", 0.1);
        const imageBytes = await fileToBase64(inputImage);
        videoRequest.image = {
            imageBytes: imageBytes,
            mimeType: inputImage.type,
        };
    }

    onProgress("Sending request to Gemini VEO...", 0.15);
    let operation = await ai.models.generateVideos(videoRequest);
    onProgress("Video generation started. This may take a few minutes...", 0.2);

    const reassuringMessages = [
        "Analyzing prompt and image...",
        "Allocating creative resources...",
        "Composing initial video frames...",
        "Rendering motion vectors...",
        "Applying visual styles...",
        "Enhancing video details...",
        "Finalizing video output...",
        "Almost there, polishing the final cut...",
    ];
    let messageIndex = 0;
    const startTime = Date.now();
    
    // Polling loop
    while (!operation.done) {
        // Wait for 10 seconds before checking status again
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
        const progressMessage = reassuringMessages[messageIndex % reassuringMessages.length];
        const progressValue = 0.2 + (messageIndex / (reassuringMessages.length * 2)); // Simulate slow progress
        
        onProgress(`${progressMessage} (${elapsedMinutes} mins elapsed)`, Math.min(progressValue, 0.9));
        
        try {
            operation = await ai.operations.getVideosOperation({ operation: operation });
        } catch (e: any) {
             console.error("Error polling for video operation status:", e);
             throw new Error(`Failed to get video status: ${e.message}`);
        }
        messageIndex++;
    }

    // Handle potential errors after the operation is "done".
    if (operation.error) {
        const errorMessage = (operation.error as any).message || JSON.stringify(operation.error);
        console.error("Video generation operation failed with an error object:", operation.error);
        throw new Error(`Video generation failed: ${errorMessage}`);
    }

    // Fix: Removed check for non-existent 'state' property on the video object.
    // The logic now correctly verifies the presence of the download URI.
    const generatedVideo = operation.response?.generatedVideos?.[0];
    const downloadLink = generatedVideo?.video?.uri;

    // Check if a video download link was provided after the operation completed.
    if (!downloadLink) {
        console.error("Video generation operation completed but returned no video URI:", operation.response);
        throw new Error("Video generation finished, but no video was returned. This could be due to a content policy violation or an internal error.");
    }

    onProgress("Video processing complete. Downloading...", 0.95);
    
    // The response.body contains the MP4 bytes. You must append an API key when fetching from the download link.
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) {
        throw new Error(`Failed to download the generated video. Status: ${response.status}`);
    }

    const videoBlob = await response.blob();
    const videoUrl = URL.createObjectURL(videoBlob);
    
    onProgress("Video ready!", 1);

    return { videoUrl, finalPrompt: options.geminiVidPrompt };
};