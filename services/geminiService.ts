import { GoogleGenAI, Part, Type, Modality } from "@google/genai";
import type { GenerationOptions, IdentifiedClothing, IdentifiedObject, MannequinStyle, LogoThemeState, PaletteColor, ExtractorState } from '../types';
import { fileToGenerativePart, fileToBase64, dataUrlToGenerativePart, createBlankImageFile, letterboxImage, dataUrlToFile, fileToDataUrl } from "../utils/imageUtils";
import { cropImageToAspectRatio } from '../utils/imageProcessing';
import { buildPromptSegments, decodePose, getRandomPose } from "../utils/promptBuilder";
import { POSES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generatePortraits = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
    clothingImage: File | null,
    backgroundImage: File | null,
    previewedBackgroundImage: string | null,
    previewedClothingImage: string | null,
    maskImage: File | null,
    elementImages: File[]
): Promise<{ images: { src: string; usageMetadata?: any }[], finalPrompt: string | null }> => {
    updateProgress("Preparing generation...", 0.1);

    let model = options.geminiT2IModel || 'imagen-4.0-generate-001';
    const parts: Part[] = [];

    // T2I Mode
    if (options.geminiMode === 't2i') {
        if (!options.geminiPrompt) throw new Error("Prompt is required for Text-to-Image generation.");
        parts.push({ text: options.geminiPrompt });
    } 
    // I2I / Edit Mode
    else {
        model = 'gemini-2.5-flash-image'; // Force Flash Image for I2I/editing
        if (!sourceImage) throw new Error("Source image is required for Image-to-Image generation.");
        
        parts.push(await fileToGenerativePart(sourceImage));

        if (options.geminiI2iMode === 'inpaint') {
             if (maskImage) {
                 parts.push(await fileToGenerativePart(maskImage));
             }
             let instruction = "";
             if (options.geminiInpaintTask === 'remove') instruction = "Remove the masked area.";
             else if (options.geminiInpaintTask === 'replace') instruction = `Replace the masked area with: ${options.geminiInpaintTargetPrompt}`;
             else if (options.geminiInpaintTask === 'changeColor') instruction = `Change the color of the masked object to: ${options.geminiInpaintTargetPrompt}`;
             else instruction = options.geminiInpaintCustomPrompt || "Edit the image.";
             parts.push({ text: instruction });

        } else if (options.geminiI2iMode === 'compose') {
             for (const elem of elementImages) {
                 parts.push(await fileToGenerativePart(elem));
             }
             parts.push({ text: options.geminiComposePrompt || "Compose these images together." });
        } else {
             // General Edit
             parts.push({ text: options.geminiGeneralEditPrompt || "Edit this image." });
        }
    }

    updateProgress("Sending request to Gemini...", 0.3);

    const response = await ai.models.generateContent({
        model: model,
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
            numberOfGeneratedImages: options.numImages,
            aspectRatio: options.aspectRatio,
        },
    });

    const images = [];
    if (response.candidates) {
         for (const candidate of response.candidates) {
             if (candidate.content?.parts) {
                 for (const part of candidate.content.parts) {
                     if (part.inlineData) {
                         images.push({
                             src: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                             usageMetadata: response.usageMetadata
                         });
                     }
                 }
             }
         }
    }
    
    if (images.length === 0) throw new Error("No images generated.");

    return { images, finalPrompt: options.geminiPrompt || options.geminiGeneralEditPrompt || "Generated Image" };
};

export const generateGeminiVideo = async (
    options: GenerationOptions,
    startFrame: File | null,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    updateProgress("Initializing video generation...", 0.1);
    
    let operation;
    
    if (startFrame) {
        const imageBase64 = await fileToBase64(startFrame);
        operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-preview-01',
            prompt: options.geminiVidPrompt || "A video.",
            image: {
                imageBytes: imageBase64,
                mimeType: startFrame.type
            },
            config: {
                numberOfVideos: 1,
            }
        });
    } else {
        operation = await ai.models.generateVideos({
             model: 'veo-2.0-generate-preview-01',
             prompt: options.geminiVidPrompt || "A video.",
             config: { numberOfVideos: 1 }
        });
    }

    updateProgress("Generating video (this may take a while)...", 0.2);

    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
        updateProgress("Still processing...", 0.5);
    }
    
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Video generation failed.");
    
    const videoRes = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const videoBlob = await videoRes.blob();
    const videoUrl = URL.createObjectURL(videoBlob);
    
    return { videoUrl, finalPrompt: options.geminiVidPrompt || '' };
};

export const generateCharacterNameForImage = async (imageDataUrl: string): Promise<{ name: string, usageMetadata?: any }> => {
    const part = dataUrlToGenerativePart(imageDataUrl);
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [part, { text: "Generate a creative and fitting name for the character in this image. Return ONLY the name." }] }
    });
    return { name: result.text?.trim() || "Character", usageMetadata: result.usageMetadata };
};

export const generateBackgroundImagePreview = async (prompt: string, aspectRatio: string): Promise<string> => {
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Generate a high-quality background image: ${prompt}` }] },
        config: { 
            responseModalities: [Modality.IMAGE],
            aspectRatio: aspectRatio
        }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("No image returned");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const generateClothingPreview = async (prompt: string, aspectRatio: string): Promise<string> => {
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Generate a high-quality image of this clothing item laid out flat: ${prompt}` }] },
        config: { 
             responseModalities: [Modality.IMAGE],
             aspectRatio: aspectRatio
        }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("No image returned");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const generateMaskForImage = async (image: File, subject: 'person' | 'clothing'): Promise<string> => {
    const part = await fileToGenerativePart(image);
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [part, { text: `Generate a black and white mask image where the ${subject} is white and everything else is black. Precise edges.` }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("No mask returned");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const enhanceImageResolution = async (dataUrl: string): Promise<{ enhancedSrc: string, usageMetadata?: any }> => {
     const part = dataUrlToGenerativePart(dataUrl);
     const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [part, { text: "Enhance this image. Improve resolution, clarity, and lighting while maintaining the original content." }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Enhancement failed");
    return { enhancedSrc: `data:${img.mimeType};base64,${img.data}`, usageMetadata: result.usageMetadata };
};

export const identifyClothing = async (imageFile: File): Promise<IdentifiedClothing[]> => {
     const part = await fileToGenerativePart(imageFile);
     const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [part, { text: "Identify the clothing items in this image. Return a JSON array where each item has 'itemName' and 'description'." }] },
        config: { responseMimeType: 'application/json' }
     });
     return JSON.parse(result.text || "[]");
};

export const generateClothingImage = async (description: string, folded: boolean): Promise<string> => {
    const prompt = folded 
        ? `Generate a neatly folded image of: ${description}. Plain background.`
        : `Generate a flat lay image of: ${description}. Plain white background.`;
        
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Generation failed");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const identifyObjects = async (imageFile: File, max: number, hints: string): Promise<IdentifiedObject[]> => {
     const part = await fileToGenerativePart(imageFile);
     const prompt = `Identify up to ${max} main objects in this image. ${hints ? `Focus on: ${hints}.` : ''} Return a JSON array with 'name' and 'description' for each.`;
     const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [part, { text: prompt }] },
        config: { responseMimeType: 'application/json' }
     });
     return JSON.parse(result.text || "[]");
};

export const generateObjectImage = async (description: string): Promise<string> => {
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Generate a high quality image of: ${description}. Isolated on white background.` }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Generation failed");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const generatePoseDescription = async (image: File, poseData: any): Promise<string> => {
    const part = await fileToGenerativePart(image);
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [part, { text: "Describe the pose of the person in this image in detail for a text-to-image prompt." }] }
    });
    return result.text || "A person posing.";
};

export const generatePoseMannequin = async (
    sourceFile: File,
    style: MannequinStyle,
    referenceFile: File | null,
    promptHint: string = ""
): Promise<{ image: string; prompt: string }> => {
    const posePart = await fileToGenerativePart(sourceFile);
    const parts: Part[] = [];
    let prompt = "";

    if (referenceFile) {
        const stylePart = await fileToGenerativePart(referenceFile);
        parts.push(stylePart);
        parts.push(posePart);
        prompt = `Create a full-body image of the character from the first image, performing the EXACT pose from the second image. Plain background. ${promptHint}`;
    } else {
        parts.push(posePart);
        prompt = `Create a full-body image of a mannequin performing the EXACT pose from the image. Style: ${promptHint || 'White modern mannequin'}. Plain background.`;
    }
    
    parts.push({ text: prompt });
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE] }
    });

    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Generation failed");
    return { image: `data:${img.mimeType};base64,${img.data}`, prompt };
};

export const generateFontChart = async (fontFile: File): Promise<string> => {
    const part = await fileToGenerativePart(fontFile);
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [part, { text: "Generate a font chart (A-Z, 0-9) using the style of the text in this image. White background." }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Generation failed");
    return `data:${img.mimeType};base64,${img.data}`;
};

export const generateTitleForImage = async (media: string): Promise<string> => {
    if (media.startsWith('data:')) {
        const part = dataUrlToGenerativePart(media);
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [part, { text: "Generate a short, 3-5 word title for this image." }] }
        });
        return result.text?.trim() || "Untitled Image";
    }
    return "Untitled";
};

export const summarizePrompt = async (prompt: string): Promise<string> => {
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: `Summarize this prompt into a 3-5 word title: ${prompt}` }] }
    });
    return result.text?.trim() || "Untitled Prompt";
};

export const generateLogos = async (state: LogoThemeState): Promise<string[]> => {
    const prompt = `Generate a ${state.logoStyle} logo for brand "${state.brandName}". ${state.slogan ? `Slogan: "${state.slogan}".` : ''} ${state.logoPrompt} Background: ${state.backgroundColor}.`;
    const parts: Part[] = [{ text: prompt }];
    
    if (state.referenceItems) {
        for (const item of state.referenceItems) {
            parts.push(dataUrlToGenerativePart(item.media).inlineData as any);
        }
    }
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { 
            responseModalities: [Modality.IMAGE],
            numberOfGeneratedImages: state.numLogos
        }
    });
    
    const images: string[] = [];
     if (result.candidates) {
         for (const candidate of result.candidates) {
             if (candidate.content?.parts) {
                 for (const part of candidate.content.parts) {
                     if (part.inlineData) {
                         images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                     }
                 }
             }
         }
    }
    return images;
};

export const generateBanners = async (state: LogoThemeState): Promise<string[]> => {
    const prompt = `Generate a ${state.bannerStyle} banner. Title: "${state.bannerTitle}". ${state.bannerPrompt}. Aspect Ratio: ${state.bannerAspectRatio}.`;
    const parts: Part[] = [{ text: prompt }];
     const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE], numberOfGeneratedImages: state.numBanners, aspectRatio: state.bannerAspectRatio === '16:9' ? '16:9' : undefined }
    });
     const images: string[] = [];
     if (result.candidates) {
         for (const candidate of result.candidates) {
             if (candidate.content?.parts) {
                 for (const part of candidate.content.parts) {
                     if (part.inlineData) {
                         images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                     }
                 }
             }
         }
    }
    return images;
};

export const generateAlbumCovers = async (state: LogoThemeState): Promise<string[]> => {
    const prompt = `Generate a ${state.musicStyle} album cover. Artist: "${state.artistName}", Album: "${state.albumTitle}". Era: ${state.albumEra}. ${state.albumPrompt}`;
    const parts: Part[] = [{ text: prompt }];
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE], numberOfGeneratedImages: state.numAlbumCovers, aspectRatio: '1:1' }
    });
     const images: string[] = [];
     if (result.candidates) {
         for (const candidate of result.candidates) {
             if (candidate.content?.parts) {
                 for (const part of candidate.content.parts) {
                     if (part.inlineData) {
                         images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                     }
                 }
             }
         }
    }
    return images;
};

export const generateDecadeImage = async (image: string, prompt: string): Promise<string> => {
    const part = dataUrlToGenerativePart(image);
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [part, { text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] }
    });
    const img = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!img) throw new Error("Generation failed");
    return `data:${img.mimeType};base64,${img.data}`;
};
