
import { GoogleGenAI, Part, Type, Modality, GenerateContentResponse } from "@google/genai";
import type { GenerationOptions, IdentifiedClothing, IdentifiedObject, MannequinStyle, LogoThemeState, PaletteColor, ExtractorState } from '../types';
import { fileToGenerativePart, fileToBase64, dataUrlToGenerativePart, createBlankImageFile, letterboxImage, dataUrlToFile, fileToDataUrl } from "../utils/imageUtils";
import { cropImageToAspectRatio } from '../utils/imageProcessing';
import { buildPromptSegments, decodePose, getRandomPose } from "../utils/promptBuilder";
import { POSES } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGeminiModels = async (): Promise<string[]> => {
    // Safety check: if no API key, don't even try to fetch, just return empty to use defaults.
    if (!process.env.API_KEY) return [];

    try {
        // Direct fetch to the Gemini API listing endpoint since SDK might not expose it directly or fully.
        // We use a short timeout to prevent hanging if the network is slow/blocked.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`Failed to fetch models list: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        if (!data.models) return [];
        
        // Filter relevant models (gemini and imagen) and remove the 'models/' prefix
        return data.models
            .map((m: any) => m.name.replace('models/', ''))
            .filter((name: string) => {
                const lowerName = name.toLowerCase();
                // Filter out deprecated 1.0 and 1.5 models as per guidelines, but keep newer ones
                if (lowerName.includes('1.0') || lowerName.includes('1.5')) return false;
                return lowerName.includes('gemini') || lowerName.includes('imagen') || lowerName.includes('veo');
            });
    } catch (e) {
        console.error("Failed to fetch Gemini models list (using defaults):", e);
        // Return a safe empty array so the UI can fallback to input/default
        return [];
    }
};

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

    let model = options.geminiT2IModel || 'gemini-2.5-flash-image';
    
    // Common helper to execute single request
    const executeGeneration = async (modelToUse: string, requestParts: Part[], imageCount: number, retry = true): Promise<GenerateContentResponse> => {
        try {
            const response = await ai.models.generateContent({
                model: modelToUse,
                contents: { parts: requestParts },
                config: {
                    responseModalities: [Modality.IMAGE],
                    numberOfGeneratedImages: imageCount,
                    aspectRatio: options.aspectRatio,
                },
            });
            return response;
        } catch (e: any) {
            // Explicitly check for the "Failed to call the Gemini API" generic message and treat it as retryable.
            const errorMessage = e.message || '';
            const isRetryable = errorMessage.includes('429') || 
                                errorMessage.includes('503') || 
                                errorMessage.includes('404') || 
                                errorMessage.includes('403') ||
                                errorMessage.includes('Failed to call the Gemini API');
            
            if (retry && isRetryable) {
                console.warn(`API call failed. Retrying... Error: ${errorMessage}`);
                // Backoff slightly before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                if (modelToUse !== 'gemini-2.5-flash-image') {
                    updateProgress("Primary model failed. Retrying with Gemini Flash...", 0.4);
                    return executeGeneration('gemini-2.5-flash-image', requestParts, imageCount, false);
                } else {
                    return executeGeneration('gemini-2.5-flash-image', requestParts, imageCount, false);
                }
            }
            if (errorMessage.includes('403') || (e.status === 403)) {
                 throw new Error(`Permission denied for model '${modelToUse}'. Try selecting 'gemini-2.5-flash-image'.`);
            }
            throw e;
        }
    };

    // --- IMAGEN MODEL PATH ---
    if (model.toLowerCase().includes('imagen')) {
        if (options.geminiMode !== 't2i') {
            throw new Error("Imagen models currently only support Text-to-Image (T2I) mode.");
        }
        updateProgress("Sending request to Imagen...", 0.3);
        try {
            const response = await ai.models.generateImages({
                model: model,
                prompt: options.geminiPrompt || "A generated image",
                config: {
                    numberOfImages: Math.min(Math.max(1, options.numImages), 4), 
                    aspectRatio: options.aspectRatio as any, 
                },
            });
            const images = [];
            if (response.generatedImages) {
                for (const genImg of response.generatedImages) {
                    if (genImg.image?.imageBytes) {
                        images.push({
                            src: `data:image/png;base64,${genImg.image.imageBytes}`,
                            usageMetadata: undefined 
                        });
                    }
                }
            }
            if (images.length === 0) throw new Error("No images generated by Imagen.");
            return { images, finalPrompt: options.geminiPrompt || "Generated Image" };
        } catch (err: any) {
             // Catch specific generic errors for Imagen too
             if (err.message?.includes('Failed to call the Gemini API')) {
                 throw new Error("The Imagen model is currently unavailable or overloaded. Please try again later or switch to a different model.");
             }
             throw err;
        }
    }

    // --- GEMINI MODEL PATH ---
    // Ensure numImages is at least 1. For Character Gen, this should come from options.numImages (default 4).
    const targetImageCount = Math.min(Math.max(1, options.numImages), 4);
    let collectedCandidates: any[] = [];
    let finalUsageMetadata: any = undefined;
    let finalPrompt = "Generated Image";

    // Detect if this is a specialized character generation or a standard I2I task
    const isCharacterGeneration = options.geminiI2iMode === 'character';

    try {
        // Standard T2I or General I2I (Single Prompt/Instruction applied to all outputs)
        if (!isCharacterGeneration && (options.geminiMode === 't2i' || (options.geminiI2iMode === 'general' || options.geminiI2iMode === 'inpaint' || options.geminiI2iMode === 'compose'))) {
            const parts: Part[] = [];
            if (options.geminiMode === 't2i') {
                if (!options.geminiPrompt) throw new Error("Prompt is required for Text-to-Image generation.");
                parts.push({ text: options.geminiPrompt });
                finalPrompt = options.geminiPrompt;
            } else {
                if (!model.includes('gemini')) model = 'gemini-2.5-flash-image';
                if (!sourceImage) throw new Error("Source image is required.");
                parts.push(await fileToGenerativePart(sourceImage));

                if (options.geminiI2iMode === 'inpaint') {
                    if (maskImage) parts.push(await fileToGenerativePart(maskImage));
                    let instruction = "";
                    if (options.geminiInpaintTask === 'remove') instruction = "Remove the masked area.";
                    else if (options.geminiInpaintTask === 'replace') instruction = `Replace the masked area with: ${options.geminiInpaintTargetPrompt}`;
                    else if (options.geminiInpaintTask === 'changeColor') instruction = `Change the color of the masked object to: ${options.geminiInpaintTargetPrompt}`;
                    else instruction = options.geminiInpaintCustomPrompt || "Edit the image.";
                    parts.push({ text: instruction });
                    finalPrompt = instruction;
                } else if (options.geminiI2iMode === 'compose') {
                    for (const elem of elementImages) parts.push(await fileToGenerativePart(elem));
                    parts.push({ text: options.geminiComposePrompt || "Compose these images together." });
                    finalPrompt = options.geminiComposePrompt || "Image Composition";
                } else { // General
                    parts.push({ text: options.geminiGeneralEditPrompt || "Edit image" });
                    finalPrompt = options.geminiGeneralEditPrompt || "Edit image";
                }
            }

            updateProgress(`Generating with ${model}...`, 0.3);
            
            // Parallel requests for T2I/General to handle image count if > 1
            if (targetImageCount > 1) {
                updateProgress(`Executing ${targetImageCount} requests...`, 0.4);
                const promises = Array.from({ length: targetImageCount }).map(async (_, index) => {
                    // Stagger requests to avoid 429 errors
                    await new Promise(resolve => setTimeout(resolve, index * 1500)); 
                    return executeGeneration(model, parts, 1).then(res => ({ status: 'fulfilled' as const, value: res })).catch(err => ({ status: 'rejected' as const, reason: err }));
                });
                const results = await Promise.all(promises);
                for (const res of results) {
                    if (res.status === 'fulfilled') {
                        if (res.value.candidates) collectedCandidates.push(...res.value.candidates);
                        if (res.value.usageMetadata) finalUsageMetadata = res.value.usageMetadata;
                    }
                }
            } else {
                const response = await executeGeneration(model, parts, targetImageCount);
                if (response.candidates) collectedCandidates = response.candidates;
                finalUsageMetadata = response.usageMetadata;
            }

        } else {
            // --- CHARACTER GENERATOR LOGIC (Per-Image Variation) ---
            
            if (!model.includes('gemini')) model = 'gemini-2.5-flash-image';
            if (!sourceImage) throw new Error("Source image is required for character generation.");
            
            const sourcePart = await fileToGenerativePart(sourceImage);
            const clothingPart = clothingImage ? await fileToGenerativePart(clothingImage) : (previewedClothingImage ? dataUrlToGenerativePart(previewedClothingImage) : null);
            const bgPart = backgroundImage ? await fileToGenerativePart(backgroundImage) : (previewedBackgroundImage ? dataUrlToGenerativePart(previewedBackgroundImage) : null);
            const poseLibraryPart = (options.poseMode === 'library' && options.poseLibraryItems?.[0]?.media) ? dataUrlToGenerativePart(options.poseLibraryItems[0].media) : null;

            updateProgress(`Generating ${targetImageCount} character variations...`, 0.3);
            
            // To get varied results in Character Generator, we MUST send separate requests
            // each with a slightly different prompt (pose).
            const promises = Array.from({ length: targetImageCount }).map(async (_, index) => {
                // Significant stagger delay to prevent 429 Rate Limit errors on parallel complex requests
                await new Promise(resolve => setTimeout(resolve, index * 2000));
                
                // Determine Pose for this iteration
                let poseToUse = "Use the pose from the provided reference image.";
                if (options.poseMode === 'random') {
                    poseToUse = decodePose(getRandomPose());
                } else if (options.poseMode === 'select') {
                    if (options.poseSelection.length > 0) {
                        const rawPose = options.poseSelection[index % options.poseSelection.length];
                        poseToUse = decodePose(rawPose);
                    } else {
                        poseToUse = decodePose(getRandomPose()); // Fallback
                    }
                } else if (options.poseMode === 'prompt') {
                     if (options.poseSelection.length > 0) {
                        poseToUse = options.poseSelection[index % options.poseSelection.length];
                    } else {
                        poseToUse = "A standard portrait pose";
                    }
                }

                const promptSegments = buildPromptSegments(options, poseToUse, !!previewedClothingImage);
                const fullPrompt = promptSegments.join(" ");
                if (index === 0) finalPrompt = fullPrompt; // Return the first prompt as reference

                const currentParts: Part[] = [sourcePart, { text: fullPrompt }];
                if (clothingPart) currentParts.push(clothingPart);
                if (bgPart) currentParts.push(bgPart);
                if (poseLibraryPart) currentParts.push(poseLibraryPart);

                return executeGeneration(model, currentParts, 1)
                    .then(res => ({ status: 'fulfilled' as const, value: res }))
                    .catch(err => ({ status: 'rejected' as const, reason: err }));
            });

            const results = await Promise.all(promises);
            for (const res of results) {
                if (res.status === 'fulfilled') {
                    if (res.value.candidates) collectedCandidates.push(...res.value.candidates);
                    if (res.value.usageMetadata) finalUsageMetadata = res.value.usageMetadata;
                } else {
                    console.warn("One of the parallel variations failed:", res.reason);
                }
            }
        }
    } catch (err: any) {
        // Catch top-level generation errors (like if single request failed)
        // and re-throw with a cleaner message if it's the generic one.
        if (err.message?.includes('Failed to call the Gemini API')) {
            throw new Error("The AI service is temporarily unavailable due to high load. Please wait a moment and try again.");
        }
        throw err;
    }

    const images = [];
    const errors = [];

    for (const candidate of collectedCandidates) {
        let candidateHasImage = false;
        if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    images.push({
                        src: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                        usageMetadata: finalUsageMetadata
                    });
                    candidateHasImage = true;
                }
            }
            if (!candidateHasImage) {
                for (const part of candidate.content.parts) {
                    if (part.text) errors.push(part.text);
                }
            }
        }
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            if (candidate.finishReason === 'SAFETY') errors.push("Image blocked by safety filters.");
            else if (candidate.finishReason === 'RECITATION') errors.push("Image blocked due to copyright check.");
            else if (!candidateHasImage) errors.push(`Generation stopped: ${candidate.finishReason}`);
        }
    }
    
    if (images.length === 0) {
        // If parallel requests failed partially, we might still want to show what succeeded or errors
        // But if absolutely nothing came back:
        if (errors.length > 0) {
             const uniqueErrors = [...new Set(errors)];
             throw new Error(`Generation failed: ${uniqueErrors.join(' ')}`);
        }
        // If collectedCandidates is empty because all promises rejected:
        if (collectedCandidates.length === 0) {
             throw new Error("All generation requests failed due to high server load. Please try again in a few moments.");
        }
        throw new Error("No images generated. The model may have refused the request.");
    }

    return { images, finalPrompt };
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
            parts.push(dataUrlToGenerativePart(item.media));
        }
    }
    
    if (state.fontReferenceImage) {
        const fontPart = await fileToGenerativePart(state.fontReferenceImage);
        parts.push(fontPart);
        parts.push({ text: "Use the font style from this image." });
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
    const prompt = `Generate a ${state.bannerStyle} banner for "${state.bannerTitle}". Aspect Ratio: ${state.bannerAspectRatio}. Logo Placement: ${state.bannerLogoPlacement}. ${state.bannerPrompt}`;
    const parts: Part[] = [{ text: prompt }];

    if (state.bannerReferenceItems) {
        for (const item of state.bannerReferenceItems) {
            parts.push(dataUrlToGenerativePart(item.media));
        }
    }
    
    if (state.bannerSelectedLogo) {
         parts.push(dataUrlToGenerativePart(state.bannerSelectedLogo.media));
         parts.push({ text: "Include this logo in the banner." });
    }

    if (state.bannerFontReferenceImage) {
        const fontPart = await fileToGenerativePart(state.bannerFontReferenceImage);
        parts.push(fontPart);
        parts.push({ text: "Use the font style from this image." });
    }

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
            numberOfGeneratedImages: state.numBanners,
            aspectRatio: state.bannerAspectRatio === '16:9' || state.bannerAspectRatio === '1:1' ? state.bannerAspectRatio : undefined
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

export const generateAlbumCovers = async (state: LogoThemeState): Promise<string[]> => {
    const prompt = `Generate an album cover for "${state.albumTitle}" by "${state.artistName}". Style: ${state.musicStyle === 'other' ? state.customMusicStyle : state.musicStyle}. Era: ${state.albumEra}. Format: ${state.albumMediaType}. ${state.addVinylWear ? 'Add vinyl wear/texture.' : ''} ${state.albumPrompt}`;
    const parts: Part[] = [{ text: prompt }];

    if (state.albumReferenceItems) {
        for (const item of state.albumReferenceItems) {
            parts.push(dataUrlToGenerativePart(item.media));
        }
    }
    
    if (state.albumSelectedLogo) {
         parts.push(dataUrlToGenerativePart(state.albumSelectedLogo.media));
         parts.push({ text: "Include this logo/symbol on the cover." });
    }

    if (state.albumFontReferenceImage) {
        const fontPart = await fileToGenerativePart(state.albumFontReferenceImage);
        parts.push(fontPart);
        parts.push({ text: "Use the font style from this image." });
    }

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
            numberOfGeneratedImages: state.numAlbumCovers,
            aspectRatio: '1:1'
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

export const generateDecadeImage = async (uploadedImage: string, prompt: string): Promise<string> => {
    const parts: Part[] = [
        dataUrlToGenerativePart(uploadedImage),
        { text: prompt }
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
            numberOfGeneratedImages: 1
        }
    });

    if (result.candidates && result.candidates[0]?.content?.parts) {
        const part = result.candidates[0].content.parts.find(p => p.inlineData);
        if (part && part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("Failed to generate image.");
};
