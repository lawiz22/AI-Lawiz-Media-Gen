

import { GoogleGenAI, Part, Type, Modality } from "@google/genai";
import type { GenerationOptions, IdentifiedClothing, IdentifiedObject, MannequinStyle, LogoThemeState, PaletteColor } from '../types';
import { fileToGenerativePart, fileToBase64, dataUrlToGenerativePart } from "../utils/imageUtils";
import { cropImageToAspectRatio } from '../utils/imageProcessing';
import { buildPromptSegments, decodePose, getRandomPose } from "../utils/promptBuilder";
import { MANNEQUIN_STYLE_REFERENCES } from '../assets/styleReferences';
import { POSES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generatePortraits = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
    clothingImage: File | null,
    backgroundImage: File | null,
    previewedBackgroundImage: string | null,
    previewedClothingImage: string | null
): Promise<{ images: string[]; finalPrompt: string | null }> => {
    if (options.geminiMode === 't2i') {
        if (!options.geminiPrompt) {
            throw new Error("A prompt is required for Text-to-Image generation.");
        }
        const model = options.geminiT2IModel || 'imagen-4.0-generate-001';
        updateProgress(`Generating with ${model}...`, 0.1);

        const response = await ai.models.generateImages({
            model,
            prompt: options.geminiPrompt,
            config: {
                numberOfImages: options.numImages,
                aspectRatio: options.aspectRatio,
                outputMimeType: 'image/jpeg'
            }
        });

        const images = response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
        return { images, finalPrompt: options.geminiPrompt };
    }

    // I2I Mode
    if (!sourceImage) throw new Error("A source image is required for Image-to-Image mode.");

    const allImages: string[] = [];
    let finalPrompt: string | null = null;
    const totalSteps = options.numImages;

    const sourcePart = await fileToGenerativePart(sourceImage);
    const parts: Part[] = [sourcePart];

    let bgPart: Part | null = null;
    if (options.background === 'image' && backgroundImage) {
        bgPart = await fileToGenerativePart(backgroundImage);
    } else if (options.background === 'prompt' && options.consistentBackground && previewedBackgroundImage) {
        const response = await fetch(previewedBackgroundImage);
        const blob = await response.blob();
        const file = new File([blob], "bg.jpeg", { type: "image/jpeg" });
        bgPart = await fileToGenerativePart(file);
    }
    if (bgPart) parts.push(bgPart);

    let clothingPart: Part | null = null;
    if (options.clothing === 'image' && clothingImage) {
        clothingPart = await fileToGenerativePart(clothingImage);
    } else if ((options.clothing === 'prompt' || options.clothing === 'random') && previewedClothingImage) {
        const response = await fetch(previewedClothingImage);
        const blob = await response.blob();
        const file = new File([blob], "clothing.jpeg", { type: "image/jpeg" });
        clothingPart = await fileToGenerativePart(file);
    }
    if (clothingPart) parts.push(clothingPart);

    const poses: string[] = [];
    if (options.poseMode !== 'library') {
        if (options.poseMode === 'random') {
            for (let i = 0; i < options.numImages; i++) {
                poses.push(decodePose(getRandomPose()));
            }
        } else if (options.poseMode === 'select' || options.poseMode === 'prompt') {
            const selectedPoses = options.poseSelection.map(p => POSES.includes(p) ? decodePose(p) : p);
            for (let i = 0; i < options.numImages; i++) {
                // Cycle through selected poses if there are fewer poses than requested images
                poses.push(selectedPoses[i % selectedPoses.length]);
            }
        }
    }


    for (let i = 0; i < options.numImages; i++) {
        updateProgress(`Generating image ${i + 1}/${options.numImages}...`, i / totalSteps);
        
        let pose: string | null = null;
        const currentParts: Part[] = [...parts]; 

        if (options.poseMode === 'library' && options.poseLibraryItems && options.poseLibraryItems.length > 0) {
            const poseItem = options.poseLibraryItems[i % options.poseLibraryItems.length];
            if (options.geminiPoseSource === 'json' && poseItem.poseJson) {
                currentParts.push({ text: `Use this exact OpenPose JSON data for the target pose:\n${poseItem.poseJson}` });
            } else { // Default to mannequin image
                currentParts.push(dataUrlToGenerativePart(poseItem.media));
            }
        } else {
            pose = poses[i];
        }

        const promptSegments = buildPromptSegments(options, pose, !!previewedClothingImage);
        const textPrompt = promptSegments.join('\n\n');
        if (!finalPrompt) finalPrompt = textPrompt;

        currentParts.push({ text: textPrompt });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: currentParts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imagePart?.inlineData) {
            allImages.push(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
        } else {
            console.warn(`Image ${i+1} generation did not return an image. Text response:`, response.text);
        }
    }
    return { images: allImages, finalPrompt };
};

export const generateGeminiVideo = async (
    options: GenerationOptions,
    startFrame: File | null,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    if (!options.geminiVidPrompt) {
        throw new Error("Prompt is required for Gemini video generation.");
    }
    updateProgress("Starting video generation...", 0.05);

    let operation;
    if (startFrame) {
        const imageBase64 = await fileToBase64(startFrame);
        operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: options.geminiVidPrompt,
            image: {
                imageBytes: imageBase64,
                mimeType: startFrame.type,
            },
            config: {
                numberOfVideos: 1
            }
        });
    } else {
        operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: options.geminiVidPrompt,
            config: {
                numberOfVideos: 1
            }
        });
    }

    let progress = 0.1;
    while (!operation.done) {
        updateProgress("Video is processing on Google's servers...", progress);
        await new Promise(resolve => setTimeout(resolve, 10000));
        progress = Math.min(0.9, progress + 0.05);
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    
    updateProgress("Fetching video link...", 0.95);
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error("Video generation completed, but no download link was returned.");
    }
    
    // Per guidelines, API key must be appended to the download URI to fetch the video bytes.
    const finalUrl = `${downloadLink}&key=${process.env.API_KEY}`;
    
    return { videoUrl: finalUrl, finalPrompt: options.geminiVidPrompt };
};

export const generateCharacterNameForImage = async (imageDataUrl: string): Promise<string> => {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const file = new File([blob], "character.jpeg", { type: "image/jpeg" });
    const imagePart = await fileToGenerativePart(file);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                imagePart,
                { text: 'Analyze the person in this image. Suggest a cool, fitting, and unique fantasy or sci-fi name for them as a character. Respond with only the name and nothing else.' }
            ]
        },
        config: {
            temperature: 0.8,
        }
    });

    const name = result.text?.trim();
    if (!name) {
        throw new Error("AI failed to generate a character name.");
    }
    return name.replace(/["'*]/g, ''); // Clean up quotes
};

export const generateBackgroundImagePreview = async (prompt: string, aspectRatio: GenerationOptions['aspectRatio']): Promise<string> => {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A beautiful, high-quality background image with no people or subjects. The scene is: ${prompt}`,
        config: {
            numberOfImages: 1,
            aspectRatio,
            outputMimeType: 'image/jpeg'
        }
    });
    const imageBytes = response.generatedImages[0]?.image?.imageBytes;
    if (!imageBytes) {
        throw new Error("Failed to generate background preview.");
    }
    return `data:image/jpeg;base64,${imageBytes}`;
};

export const generateClothingPreview = async (prompt: string, aspectRatio: GenerationOptions['aspectRatio']): Promise<string> => {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A professional, e-commerce style product shot of a single clothing item on a plain white background. The item is: ${prompt}`,
        config: {
            numberOfImages: 1,
            aspectRatio,
            outputMimeType: 'image/jpeg'
        }
    });
    const imageBytes = response.generatedImages[0]?.image?.imageBytes;
    if (!imageBytes) {
        throw new Error("Failed to generate clothing preview.");
    }
    return `data:image/jpeg;base64,${imageBytes}`;
};

export const enhanceImageResolution = async (imageDataUrl: string): Promise<string> => {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const file = new File([blob], "enhance.jpeg", { type: "image/jpeg" });
    const imagePart = await fileToGenerativePart(file);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                imagePart,
                { text: "Enhance this image. Increase the resolution, sharpness, and detail. Correct any small imperfections. Do not change the content or composition of the image. The output must be a higher quality version of the input." }
            ]
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (outputPart?.inlineData) {
        return `data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`;
    } else {
        throw new Error("Image enhancement failed to return an image.");
    }
};

export const identifyClothing = async (sourceFile: File, details: string, excludeAccessories: boolean): Promise<IdentifiedClothing[]> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    let prompt = `Analyze the image and identify all distinct clothing items worn by the person. ${details ? `Focus on: ${details}.` : ''} ${excludeAccessories ? 'Exclude accessories like hats, glasses, jewelry, and bags.' : ''} Describe each item briefly. Respond with a JSON array of objects, where each object has "itemName" (e.g., "Blue Denim Jacket") and "description" keys.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        itemName: { type: Type.STRING },
                        description: { type: Type.STRING }
                    },
                    required: ["itemName", "description"]
                }
            }
        }
    });

    try {
        const jsonText = result.text.trim();
        const items = JSON.parse(jsonText);
        if (!Array.isArray(items)) throw new Error("AI did not return an array.");
        return items;
    } catch (e) {
        console.error("Failed to parse clothing identification from AI:", result.text, e);
        throw new Error("AI returned an invalid response for clothing identification.");
    }
};

export const generateClothingImage = async (sourceFile: File, itemName: string, style: 'laid out' | 'folded'): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    const prompt = `From the source image, extract the "${itemName}". Generate a new, photorealistic image of ONLY this item. The item should be ${style} flat on a clean, plain white background, as if for an e-commerce product listing. Remove the person and any other background elements.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (outputPart?.inlineData) {
        return `data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`;
    } else {
        throw new Error(`Failed to generate '${style}' image for ${itemName}.`);
    }
};

export const identifyObjects = async (sourceFile: File, maxObjects: number, hints: string): Promise<IdentifiedObject[]> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    let prompt = `Analyze the image and identify up to ${maxObjects} distinct, individual objects. ${hints ? `Give priority to objects related to: ${hints}.` : ''} For each object, provide a short name and a one-sentence description. Respond with a JSON array of objects, where each object has "name" and "description" keys.`;
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING }
                    },
                    required: ["name", "description"]
                }
            }
        }
    });

    try {
        const items = JSON.parse(result.text.trim());
        if (!Array.isArray(items)) throw new Error("AI did not return an array.");
        return items;
    } catch (e) {
        console.error("Failed to parse object identification from AI:", result.text, e);
        throw new Error("AI returned an invalid response for object identification.");
    }
};

export const generateObjectImage = async (sourceFile: File, objectName: string): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    const prompt = `From the source image, find the object described as "${objectName}". Generate a new, photorealistic image of ONLY this object on a clean, plain white background, suitable for a product listing. Remove all other objects, people, and background elements.`;
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (outputPart?.inlineData) {
        return `data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`;
    } else {
        throw new Error(`Failed to generate image for ${objectName}.`);
    }
};

export const generatePoseDescription = async (sourceFile: File, poseJson: object): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    const textPart = `Analyze the pose of the person in the image. Briefly describe it in a dynamic and descriptive way, like "A confident power pose, looking directly at the camera." The pose data is: ${JSON.stringify(poseJson)}. Respond with only the description text.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: textPart }] },
    });
    
    const description = result.text?.trim().replace(/["']/g, '');
    if (!description) throw new Error("Failed to generate pose description.");
    return description;
};

export const generatePoseMannequin = async (
    sourceFile: File, // This is the POSE file
    style: MannequinStyle,
    referenceFile: File | null // This is the custom STYLE file
): Promise<{ image: string; prompt: string }> => {
    const posePart = await fileToGenerativePart(sourceFile);
    let stylePart: Part;
    
    const prompt = `You are a "Pose Transfer AI". Your task is to apply the exact pose from the second image (the POSE SOURCE) to the mannequin model from the first image (the STYLE REFERENCE).

CRITICAL INSTRUCTIONS:
- The final image must contain ONLY the mannequin from the first image, but redrawn in the new pose.
- The new pose must EXACTLY match the pose of the person in the second image.
- IGNORE the person, clothing, hair, and background from the second image. Only copy the pose.
- The background of the final image must be solid white.
- Output only the final image.`;

    if (style === 'custom-reference' && referenceFile) {
        // Crop the user-provided reference to 1:1 to ensure consistency for the AI
        const croppedRefFile = await cropImageToAspectRatio(referenceFile, '1:1');
        stylePart = await fileToGenerativePart(croppedRefFile);
    } else {
        const styleRefKey = style as Exclude<MannequinStyle, 'custom-reference'>;
        const styleReferenceDataUrl = MANNEQUIN_STYLE_REFERENCES[styleRefKey];
        // Convert the static data URL reference to the format the API needs
        stylePart = dataUrlToGenerativePart(styleReferenceDataUrl);
    }

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { 
            parts: [
                stylePart,    // STYLE REFERENCE is FIRST
                posePart,     // POSE SOURCE is SECOND
                { text: prompt }
            ] 
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (outputPart?.inlineData) {
        return {
            image: `data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`,
            prompt: prompt
        };
    } else {
        console.error("Pose generation failed. AI Response:", result.text);
        throw new Error(`Failed to generate mannequin in style '${style}'. The AI did not return an image.`);
    }
};

export const generateFontChart = async (sourceFile: File): Promise<string> => {
    const imagePart = await fileToGenerativePart(sourceFile);
    const prompt = `Analyze the font style from the provided image. Generate a new image that is a comprehensive alphabet chart of that exact font style.
The chart must include:
- Uppercase letters (A-Z)
- Lowercase letters (a-z)
- Numbers (0-9)

The background must be a clean, solid white. The output must be a single, high-quality PNG image showing only the alphabet chart. Do not include any other text, explanations, or elements.`;

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    
    const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (outputPart?.inlineData) {
        return `data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`;
    } else {
        console.error("Font chart generation failed. AI Response:", result.text);
        throw new Error(`Failed to generate font chart. The AI did not return an image.`);
    }
};

export const generateTitleForImage = async (imageDataUrl: string): Promise<string> => {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    const file = new File([blob], "image.jpeg", { type: "image/jpeg" });
    const imagePart = await fileToGenerativePart(file);

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                imagePart,
                { text: 'Analyze this image. Create a short, descriptive title for it, like for a piece of art in a gallery. Respond with only the title.' }
            ]
        },
    });

    const title = result.text?.trim().replace(/["']/g, '');
    if (!title) return `Untitled Image ${Date.now()}`;
    return title;
};

export const summarizePrompt = async (prompt: string): Promise<string> => {
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize this image generation prompt into a short, descriptive title of 5-7 words. Here is the prompt: "${prompt}"`,
    });
    
    const summary = result.text?.trim().replace(/["']/g, '');
    if (!summary) return prompt.substring(0, 40) + '...';
    return summary;
};

export const generateLogos = async (state: LogoThemeState): Promise<string[]> => {
    let prompt = `Generate a logo based on the following specifications. The output must be a high-resolution image with a clean background.\n`;
    if (state.brandName) prompt += `- Brand Name: ${state.brandName}\n`;
    if (state.slogan) prompt += `- Slogan: ${state.slogan}\n`;
    if (state.logoPrompt) prompt += `- Core Concept: ${state.logoPrompt}\n`;
    if (state.logoStyle) prompt += `- Style: ${state.logoStyle}\n`;
    if (state.backgroundColor) prompt += `- Background: ${state.backgroundColor === 'transparent' ? 'transparent PNG' : `solid ${state.backgroundColor}`}\n`;

    if (state.fontReferenceImage || state.selectedFont) {
        prompt += `- Font Style: Use the exact font style shown in the provided font reference image for all text.\n`;
    }

    if (state.selectedPalette) {
        const palette = JSON.parse(state.selectedPalette.media) as PaletteColor[];
        const hexCodes = palette.map((c: any) => c.hex).join(', ');
        prompt += `- Color Palette: Strictly use these colors: ${hexCodes}\n`;
    }

    const usesMultiModal = (state.referenceItems && state.referenceItems.length > 0) || state.fontReferenceImage || state.selectedFont;

    if (usesMultiModal) {
        const parts: Part[] = [{ text: prompt }];

        if (state.fontReferenceImage) {
            parts.push(await fileToGenerativePart(state.fontReferenceImage));
        } else if (state.selectedFont) {
            const fontResponse = await fetch(state.selectedFont.media);
            const fontBlob = await fontResponse.blob();
            const fontFile = new File([fontBlob], "font_ref.png", { type: fontBlob.type });
            parts.push(await fileToGenerativePart(fontFile));
        }
        
        if (state.referenceItems) {
            for (const item of state.referenceItems) {
                const refResponse = await fetch(item.media);
                const refBlob = await refResponse.blob();
                const refFile = new File([refBlob], "ref.jpeg", { type: "image/jpeg" });
                parts.push(await fileToGenerativePart(refFile));
            }
        }
        
        const allImages: string[] = [];
        for (let i = 0; i < (state.numLogos || 1); i++) {
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts },
                config: { responseModalities: [Modality.IMAGE] }
            });
            const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (outputPart?.inlineData) {
                allImages.push(`data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`);
            }
        }
        return allImages;
    } else {
        const result = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: state.numLogos || 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/png'
            }
        });
        return result.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
    }
};

export const generateBanners = async (state: LogoThemeState): Promise<string[]> => {
    let prompt = `Generate a banner image. The output must be a high-resolution image.\n`;
    if (state.bannerTitle) prompt += `- Text on Banner: "${state.bannerTitle}"\n`;
    if (state.bannerPrompt) prompt += `- Core Concept: ${state.bannerPrompt}\n`;
    if (state.bannerStyle) prompt += `- Style: ${state.bannerStyle}\n`;
    if (state.bannerFontReferenceImage || state.bannerSelectedFont) {
        prompt += `- Font Style: Use the exact font style shown in the provided font reference image for all text.\n`;
    }
    if (state.bannerLogoPlacement && state.bannerLogoPlacement !== 'no-logo') prompt += `- Logo Placement: ${state.bannerLogoPlacement}\n`;
    
    if (state.bannerSelectedPalette) {
        const palette = JSON.parse(state.bannerSelectedPalette.media) as PaletteColor[];
        const hexCodes = palette.map((c: any) => c.hex).join(', ');
        prompt += `- Color Palette: Strictly use these colors: ${hexCodes}\n`;
    }
    
    const hasReferences = (state.bannerReferenceItems && state.bannerReferenceItems.length > 0) || state.bannerSelectedLogo || state.bannerFontReferenceImage || state.bannerSelectedFont;

    if (hasReferences) {
        const parts: Part[] = [{ text: prompt }];
        if (state.bannerSelectedLogo) {
            const logoResponse = await fetch(state.bannerSelectedLogo.media);
            const logoBlob = await logoResponse.blob();
            const logoFile = new File([logoBlob], "logo.png", { type: "image/png" });
            parts.push({ text: "Use this logo in the banner:" });
            parts.push(await fileToGenerativePart(logoFile));
        }
        if (state.bannerFontReferenceImage) {
            parts.push(await fileToGenerativePart(state.bannerFontReferenceImage));
        } else if (state.bannerSelectedFont) {
            const fontResponse = await fetch(state.bannerSelectedFont.media);
            const fontBlob = await fontResponse.blob();
            const fontFile = new File([fontBlob], "font_ref.png", { type: fontBlob.type });
            parts.push(await fileToGenerativePart(fontFile));
        }
        if (state.bannerReferenceItems) {
            for (const item of state.bannerReferenceItems) {
                const refResponse = await fetch(item.media);
                const refBlob = await refResponse.blob();
                const refFile = new File([refBlob], "ref.jpeg", { type: "image/jpeg" });
                parts.push(await fileToGenerativePart(refFile));
            }
        }
        
        const allImages: string[] = [];
        for (let i = 0; i < (state.numBanners || 1); i++) {
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts },
                config: { responseModalities: [Modality.IMAGE] }
            });
            const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (outputPart?.inlineData) {
                allImages.push(`data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`);
            }
        }
        return allImages;
    } else {
        const result = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: state.numBanners || 1,
                aspectRatio: state.bannerAspectRatio,
                outputMimeType: 'image/png'
            }
        });
        return result.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
    }
};

export const generateAlbumCovers = async (state: LogoThemeState): Promise<string[]> => {
    let prompt = `Generate a 1:1 square album cover. The output must be a high-resolution image.\n`;
    if (state.artistName) prompt += `- Artist Name: "${state.artistName}"\n`;
    if (state.albumTitle) prompt += `- Album Title: "${state.albumTitle}"\n`;
    if (state.albumPrompt) prompt += `- Core Concept: ${state.albumPrompt}\n`;
    const musicStyle = state.musicStyle === 'other' ? state.customMusicStyle : state.musicStyle;
    if (musicStyle) prompt += `- Music Style: ${musicStyle}\n`;
    if (state.albumEra) prompt += `- Era: ${state.albumEra}\n`;
    if (state.albumMediaType) prompt += `- Media Type Style: Emulate a ${state.albumMediaType} cover.\n`;
    if (state.addVinylWear) prompt += `- Effects: Add realistic vinyl record sleeve wear and tear (scratches, ring wear).\n`;
    if (state.albumFontReferenceImage || state.albumSelectedFont) {
        prompt += `- Font Style: Use the exact font style shown in the provided font reference image for all text.\n`;
    }

    if (state.albumSelectedPalette) {
        const palette = JSON.parse(state.albumSelectedPalette.media) as PaletteColor[];
        const hexCodes = palette.map((c: any) => c.hex).join(', ');
        prompt += `- Color Palette: Strictly use these colors: ${hexCodes}\n`;
    }

    const hasReferences = (state.albumReferenceItems && state.albumReferenceItems.length > 0) || state.albumSelectedLogo || state.albumFontReferenceImage || state.albumSelectedFont;

    if (hasReferences) {
        const parts: Part[] = [{ text: prompt }];
        if (state.albumSelectedLogo) {
            const logoResponse = await fetch(state.albumSelectedLogo.media);
            const logoBlob = await logoResponse.blob();
            const logoFile = new File([logoBlob], "logo.png", { type: "image/png" });
            parts.push({ text: "Use this logo in the album cover:" });
            parts.push(await fileToGenerativePart(logoFile));
        }
        if (state.albumFontReferenceImage) {
            parts.push(await fileToGenerativePart(state.albumFontReferenceImage));
        } else if (state.albumSelectedFont) {
            const fontResponse = await fetch(state.albumSelectedFont.media);
            const fontBlob = await fontResponse.blob();
            const fontFile = new File([fontBlob], "font_ref.png", { type: fontBlob.type });
            parts.push(await fileToGenerativePart(fontFile));
        }
        if (state.albumReferenceItems) {
            for (const item of state.albumReferenceItems) {
                const refResponse = await fetch(item.media);
                const refBlob = await refResponse.blob();
                const refFile = new File([refBlob], "ref.jpeg", { type: "image/jpeg" });
                parts.push(await fileToGenerativePart(refFile));
            }
        }
        
        const allImages: string[] = [];
        for (let i = 0; i < (state.numAlbumCovers || 1); i++) {
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts },
                config: { responseModalities: [Modality.IMAGE] }
            });
            const outputPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (outputPart?.inlineData) {
                allImages.push(`data:${outputPart.inlineData.mimeType};base64,${outputPart.inlineData.data}`);
            }
        }
        return allImages;
    } else {
        const result = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: state.numAlbumCovers || 1,
                aspectRatio: '1:1',
                outputMimeType: 'image/png'
            }
        });
        return result.generatedImages.map(img => `data:image/png;base64,${img.image.imageBytes}`);
    }
};