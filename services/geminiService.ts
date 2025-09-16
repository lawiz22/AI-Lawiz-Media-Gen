import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";
import { fileToGenerativePart, fileToBase64, dataUrlToFile } from '../utils/imageUtils';
// Fix: Import 'getRandomPose' to resolve reference error.
import { buildPromptSegments, decodePose, getRandomPose } from '../utils/promptBuilder';
import type { GenerationOptions, IdentifiedClothing, IdentifiedObject } from '../types';

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
             for (let i = 0; i < options.numImages; i++) {
                updateProgress(`Generating image ${i + 1}/${options.numImages}...`, (i + 1) / options.numImages);
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: t2iModel,
                    contents: { parts: [{ text: options.geminiPrompt! }] },
                    config: {
                        responseMimeType: 'image/jpeg'
                    }
                });
                const part = response.candidates?.[0]?.content?.parts[0];
                if (part?.inlineData?.data) {
                    allImages.push(`data:image/jpeg;base64,${part.inlineData.data}`);
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
    
    const sourceImagePart = await fileToGenerativePart(sourceImage);
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