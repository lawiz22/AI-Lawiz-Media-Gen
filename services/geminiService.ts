import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { fileToGenerativePart, fileToBase64, dataUrlToFile } from '../utils/imageUtils';
// Fix: Import 'getRandomPose' to resolve reference error.
import { buildPromptSegments, decodePose, getRandomPose } from '../utils/promptBuilder';
import { cropImageToAspectRatio } from '../utils/imageProcessing';
import type { GenerationOptions, IdentifiedClothing, IdentifiedObject, LogoThemeState, PaletteColor } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generatePortraits = async (
    sourceImage: File | null, 
    options: GenerationOptions, 
    updateProgress: (message: string, value: number) => void,
    clothingImage: File | null,
    backgroundImage: File | null,
    previewedBackgroundImage: string | null,
    previewedClothingImage: string | null
): Promise<{ images: string[], finalPrompt: string | null }> => {

    // --- TEXT-TO-IMAGE MODE ---
    if (options.geminiMode === 't2i') {
        updateProgress("Generating text-to-image...", 0.1);
        const t2iModel = options.geminiT2IModel || 'imagen-4.0-generate-001';
        
        if (t2iModel === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: t2iModel,
                prompt: options.geminiPrompt!,
                config: {
                    numberOfImages: options.numImages,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: options.aspectRatio,
                },
            });
            updateProgress("Finalizing images...", 0.9);
            const imageUrls = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
            return { images: imageUrls, finalPrompt: options.geminiPrompt || null };
        } else { // gemini-2.5-flash-image-preview
             const allImages = [];
             const finalPromptForModel = `Generate a single, high-quality image based on this description: ${options.geminiPrompt!}`;
             for (let i = 0; i < options.numImages; i++) {
                updateProgress(`Generating image ${i + 1}/${options.numImages}...`, (i + 1) / options.numImages);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: t2iModel,
                    contents: { parts: [{ text: finalPromptForModel }] },
                    config: {
                        responseModalities: [Modality.IMAGE, Modality.TEXT]
                    }
                });
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData?.data) {
                    allImages.push(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
                }
             }
             updateProgress("Finalizing images...", 0.9);
             return { images: allImages, finalPrompt: options.geminiPrompt || null };
        }
    }

    // --- IMAGE-TO-IMAGE MODE ---
    if (!sourceImage) {
        throw new Error("Source image is required for image-to-image generation.");
    }
    
    updateProgress("Preparing source images...", 0.05);
    
    // The gemini-2.5-flash-image-preview model inherits the aspect ratio from the source image.
    // To enforce the user's selection, we must pre-crop the source image before sending it.
    const croppedSourceImage = await cropImageToAspectRatio(sourceImage, options.aspectRatio);

    const sourceImagePart = await fileToGenerativePart(croppedSourceImage);
    const clothingImagePart = clothingImage ? await fileToGenerativePart(clothingImage) : null;
    let backgroundImagePart = backgroundImage ? await fileToGenerativePart(backgroundImage) : null;

    if (previewedBackgroundImage && options.consistentBackground) {
        const bgFile = await dataUrlToFile(previewedBackgroundImage, 'background.jpeg');
        backgroundImagePart = await fileToGenerativePart(bgFile);
    }

    const previewedClothingFile = previewedClothingImage ? await dataUrlToFile(previewedClothingImage, 'clothing.jpeg') : null;
    const previewedClothingImagePart = previewedClothingFile ? await fileToGenerativePart(previewedClothingFile) : null;

    let posePrompts = options.poseSelection.map(decodePose);
    if (options.poseMode === 'random') {
        const randomPoses = new Set<string>();
        while(randomPoses.size < options.numImages) {
            randomPoses.add(decodePose(getRandomPose()));
        }
        posePrompts = Array.from(randomPoses);
    }
    
    const allImages = [];
    const promptsUsed: string[] = [];

    for (let i = 0; i < Math.min(options.numImages, posePrompts.length); i++) {
        const pose = posePrompts[i];
        updateProgress(`Generating image ${i + 1}/${options.numImages} with pose: "${pose.substring(0, 30)}..."`, (i + 1) / options.numImages);
        
        const promptSegments = buildPromptSegments(options, pose, !!previewedClothingImagePart);
        const finalPrompt = promptSegments.join('\n\n');
        promptsUsed.push(finalPrompt);

        const contents: any = { parts: [sourceImagePart] };

        if (previewedClothingImagePart) {
            contents.parts.push({text: 'Use this image as the exclusive reference for the subject\'s clothing:'}, previewedClothingImagePart);
        } else if (clothingImagePart && options.clothing === 'image') {
            contents.parts.push({text: 'Use this image as the exclusive reference for the subject\'s clothing:'}, clothingImagePart);
        }

        if (backgroundImagePart && (options.background === 'image' || options.consistentBackground)) {
             contents.parts.push({text: 'Use this image as the exclusive reference for the background:'}, backgroundImagePart);
        }
        
        contents.parts.push({text: finalPrompt});

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents,
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT]
            }
        });

        const part = response.candidates?.[0]?.content?.parts[0];
        if (part?.inlineData?.data) {
            allImages.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
        }
    }
    
    updateProgress("Finalizing images...", 0.95);
    return { images: allImages, finalPrompt: promptsUsed[0] || null };
};

export const generateLogos = async (state: LogoThemeState): Promise<string[]> => {
    const { logoPrompt, brandName, slogan, logoStyle, referenceItems, selectedPalette, numLogos, backgroundColor } = state;

    if (!logoPrompt?.trim() && !brandName?.trim() && (!referenceItems || referenceItems.length === 0)) {
        throw new Error("Please provide a prompt, brand name, or at least one reference image.");
    }

    const promptSegments = ["Your task is to generate a professional, clean, and modern logo."];
    
    // Style
    promptSegments.push(`The logo style must be: ${logoStyle}.`);

    // Core Concept
    if (logoPrompt) {
        promptSegments.push(`The core concept of the logo is: "${logoPrompt}".`);
    }

    // Text
    if (brandName) {
        promptSegments.push(`The logo must incorporate the brand name "${brandName}". The text should be clear, legible, and well-integrated into the design.`);
    }
    if (slogan) {
        promptSegments.push(`If appropriate for the style, include the slogan: "${slogan}".`);
    }

    // Color Palette
    if (selectedPalette) {
        try {
            const palette: PaletteColor[] = JSON.parse(selectedPalette.media);
            const hexCodes = palette.map(p => p.hex).join(', ');
            promptSegments.push(`Strictly use the following color palette: ${hexCodes}. You may use shades and tints, but do not introduce new hues.`);
        } catch (e) { console.error("Could not parse color palette for prompt."); }
    }

    // Background
    promptSegments.push(`The logo must be generated on a ${backgroundColor} background. If transparent, ensure the output is a clean PNG with an alpha channel.`);
    
    // Final instructions
    promptSegments.push("The final design should be simple, memorable, and scalable (vector-like). Avoid overly complex details or photorealism.");

    const finalPrompt = promptSegments.join('\n');
    const contents: any = { parts: [{ text: finalPrompt }] };

    // Reference Images
    if (referenceItems && referenceItems.length > 0) {
        contents.parts.unshift({ text: "Use the following images as visual inspiration for the logo's style, shapes, or concepts. Combine elements from them into a new, unique design:" });
        for (const item of referenceItems) {
            const file = await dataUrlToFile(item.media, item.name || 'reference');
            const imagePart = await fileToGenerativePart(file);
            contents.parts.push(imagePart);
        }
    }

    const allLogos: string[] = [];
    for (let i = 0; i < (numLogos || 1); i++) {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents,
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            }
        });

        // The model can return multiple parts (e.g., text commentary and an image).
        // Find the first part that contains image data.
        const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        
        if (imagePart?.inlineData?.data) {
            allLogos.push(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
        }
    }

    if (allLogos.length === 0) {
        throw new Error("The AI failed to generate any logos. It's possible the prompt was too restrictive or resulted in a safety block. Please try adjusting your prompt.");
    }

    return allLogos;
};


export const generateGeminiVideo = async (
    options: GenerationOptions,
    startFrame: File | null,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    if (!options.geminiVidPrompt?.trim()) {
        throw new Error("A prompt is required for Gemini video generation.");
    }

    const model = options.geminiVidModel || 'veo-2.0-generate-001';
    
    const requestPayload: any = {
        model,
        prompt: options.geminiVidPrompt,
        config: {
            numberOfVideos: 1
        }
    };

    if (startFrame) {
        updateProgress("Preparing input image...", 0.05);
        requestPayload.image = {
            imageBytes: await fileToBase64(startFrame),
            mimeType: startFrame.type,
        };
    }

    updateProgress("Sending request to Gemini...", 0.1);
    let operation = await ai.models.generateVideos(requestPayload);

    updateProgress("Video generation started. This may take several minutes...", 0.2);
    
    const pollingInterval = 10000; // 10 seconds
    const maxAttempts = 60; // 10 minutes timeout
    let attempt = 0;

    while (!operation.done && attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
        attempt++;
        const progress = 0.2 + (attempt / maxAttempts) * 0.7; // Progress from 20% to 90%
        updateProgress(`Processing video... (Attempt ${attempt}/${maxAttempts})`, progress);
        try {
            operation = await ai.operations.getVideosOperation({ operation });
        } catch (e: any) {
            console.warn(`Polling attempt ${attempt} failed, retrying... Error:`, e.message);
        }
    }

    if (!operation.done) {
        throw new Error("Video generation timed out after 10 minutes.");
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        const opError = (operation as any).error;
        if (opError) {
             throw new Error(`Video generation failed with an error: ${opError.message} (Code: ${opError.code})`);
        }
        throw new Error("Video generation completed, but no download link was returned.");
    }

    updateProgress("Downloading generated video...", 0.95);
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    if (!response.ok) {
        throw new Error(`Failed to download video file. Status: ${response.statusText}`);
    }

    const videoBlob = await response.blob();
    const videoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(videoBlob);
    });

    return { videoUrl: videoDataUrl, finalPrompt: options.geminiVidPrompt };
};

export const enhanceImageResolution = async (imageDataUrl: string): Promise<string> => {
    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.match(/data:(.*);/)?.[1] || 'image/jpeg';

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                {
                    inlineData: { data: base64Data, mimeType: mimeType },
                },
                {
                    text: 'Enhance the resolution and quality of this image, making it sharper and more detailed without changing the content.',
                },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    throw new Error('Image enhancement failed to return an image.');
};

export const identifyClothing = async (sourceImage: File, details: string, excludeAccessories: boolean): Promise<IdentifiedClothing[]> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    let prompt = `Analyze the image and identify all distinct articles of clothing worn by the person.`;
    if (excludeAccessories) {
        prompt += ' Exclude accessories like jewelry, hats, glasses, and bags.';
    }
    if (details) {
        prompt += ` Pay special attention to: "${details}".`;
    }
    prompt += ' For each item, provide a short, descriptive name and a brief description.';

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                itemName: { type: Type.STRING, description: 'A short, descriptive name for the clothing item (e.g., "Blue Denim Jacket").' },
                                description: { type: Type.STRING, description: 'A brief description of the clothing item.' },
                            },
                        },
                    },
                },
            },
        },
    });

    try {
        const json = JSON.parse(response.text);
        return json.items || [];
    } catch (e) {
        console.error("Failed to parse clothing identification from AI:", response.text, e);
        throw new Error("The AI returned an invalid response. Please try again.");
    }
};

export const generateClothingImage = async (sourceImage: File, itemName: string, style: 'laid out' | 'folded'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const prompt = `From the reference image, isolate the "${itemName}". Generate a new, photorealistic image of just this item on a plain, solid white background, as if for an e-commerce product listing. The item should be ${style} neatly.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error(`Failed to generate a '${style}' image for ${itemName}.`);
};

export const identifyObjects = async (sourceImage: File, maxObjects: number, hints: string): Promise<IdentifiedObject[]> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    let prompt = `Analyze the image and identify up to ${maxObjects} distinct, prominent objects.`;
    if (hints) {
        prompt += ` Prioritize or pay special attention to objects related to: "${hints}".`;
    }
    prompt += ' For each object, provide its name and a brief description.';

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    objects: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING, description: 'The name of the identified object.' },
                                description: { type: Type.STRING, description: 'A brief description of the object.' },
                            },
                        },
                    },
                },
            },
        },
    });

    try {
        const json = JSON.parse(response.text);
        return json.objects || [];
    } catch (e) {
        console.error("Failed to parse object identification from AI:", response.text, e);
        throw new Error("The AI returned an invalid response. Please try again.");
    }
};

export const generateObjectImage = async (sourceImage: File, objectName: string): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceImage);
    const prompt = `From the reference image, your task is to precisely isolate the object named "${objectName}".
Generate a new, photorealistic image of *only* this object, placed on a plain, solid white background.

**Crucial requirements:**
-   **Faithful Reproduction:** The generated object MUST be a faithful, photorealistic cutout of the original. Strictly preserve its exact shape, colors, textures, lighting, and any defining details like logos or text.
-   **No Alterations:** Do NOT alter, enhance, or 'improve' the object itself. The goal is an accurate extraction.
-   **Clean Background:** The background must be a completely uniform, neutral white, suitable for an e-commerce listing. Do not add any new shadows.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error(`Failed to generate an image for ${objectName}.`);
};

export const generateBackgroundImagePreview = async (prompt: string, aspectRatio: string): Promise<string> => {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A high-quality, photorealistic background image of: ${prompt}`,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio,
        },
    });
    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const generateClothingPreview = async (prompt: string, aspectRatio: string): Promise<string> => {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A high-quality, photorealistic image of a piece of clothing on a plain white background, laid out flat. The clothing is: ${prompt}`,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
        },
    });
    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};

export const generateTitleForImage = async (imageDataUrl: string): Promise<string> => {
    const base64Data = imageDataUrl.split(',')[1];
    const mimeType = imageDataUrl.match(/data:(.*);/)?.[1] || 'image/jpeg';
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType } };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: 'Generate a short, descriptive, and appealing title for this image, no more than 6-8 words long. The title should be suitable for a gallery. Do not use quotes.' }] },
        config: { temperature: 0.4 },
    });

    return response.text.trim().replace(/["']/g, ""); // Remove quotes
};

export const summarizePrompt = async (prompt: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize the following creative prompt into a short, descriptive title of no more than 6-8 words. The title should capture the essence of the prompt. Do not use quotes. Prompt: "${prompt}"`,
        config: { temperature: 0.3 },
    });
    return response.text.trim().replace(/["']/g, "");
};

export const generateThumbnailForPrompt = async (prompt: string): Promise<string> => {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `An abstract, visually appealing conceptual image representing the following creative idea: ${prompt}`,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: '1:1',
        },
    });
    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;
};