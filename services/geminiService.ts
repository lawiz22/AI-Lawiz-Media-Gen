import { GoogleGenAI, Modality, Part } from "@google/genai";
import { POSES } from '../constants';
import type { GenerationOptions } from '../types';
import { fileToGenerativePart } from '../utils/imageUtils';
import { cropImageToAspectRatio } from '../utils/imageProcessing';

const _k = process.env.API_KEY;

if (!_k) {
  throw new Error("API_KEY environment variable not set");
}

const _a = new GoogleGenAI({ apiKey: _k });

const getBackgroundInstruction = (_b: string, _customPrompt?: string): string => {
    switch (_b) {
        case 'prompt':
            return _customPrompt?.trim()
                ? `A background described as: "${_customPrompt.trim()}"`
                : 'A neutral, plain background.';
        case 'original':
            return `Seamlessly and photorealistically extend the background from the source image to fill the new frame. Analyze the existing lighting, textures, and style and expand upon it naturally. The result should look like the camera simply revealed more of the original scene.`;
        case 'natural studio':
            return 'A soft-focus, professional photography studio setting with natural, diffused light. This completely replaces the original background.';
        default: // black, white, gray, green screen
            return `A solid, flat, professional studio backdrop of ${_b} color. This completely replaces the original background.`;
    }
};

const getClothingRule = (options: GenerationOptions): string => {
    const { clothing, customClothingPrompt, randomizeClothing } = options;
    switch (clothing) {
        case 'image':
            return `**CLOTHING**: The SECOND image provided is a reference for clothing. You MUST dress the subject in the clothing shown in that second image. Adapt it to fit the subject's new pose naturally and photorealistically.`;
        case 'prompt':
            if (!customClothingPrompt?.trim()) {
                return `**CLOTHING**: The clothing MUST be identical to the clothing in the FIRST source image.`;
            }
            if (randomizeClothing) {
                return `**CLOTHING**: You MUST dress the subject in clothing that fits this description: "${customClothingPrompt.trim()}". IMPORTANT: For each new image you generate, you must create a *different variation* of this clothing. Interpret the prompt as a theme or style guide, and generate a unique but related outfit for every photo.`;
            }
            return `**CLOTHING**: You MUST dress the subject in the following clothing: "${customClothingPrompt.trim()}".`;
        case 'original':
        default:
            return `**CLOTHING**: The clothing MUST be identical to the clothing in the FIRST source image.`;
    }
};

export const generatePortraitSeries = async (
  _f: File,
  _cf: File | null,
  _o: GenerationOptions,
  _p: (message: string, progress: number) => void
): Promise<string[]> => {
  const _r: string[] = [];
  const { numImages: _n, background: _b, aspectRatio: _ar, customBackground: _cb, consistentBackground: _cbg, clothing } = _o;
  
  _p("Cropping image to target ratio...", 0);
  const croppedSourceFile = await cropImageToAspectRatio(_f, _ar);
  
  _p("Preparing source image...", 0);
  const sourcePart = await fileToGenerativePart(croppedSourceFile);

  let clothingPart: Part | null = null;
  if (clothing === 'image' && _cf) {
    _p("Preparing clothing image...", 0);
    clothingPart = await fileToGenerativePart(_cf);
  }

  for (let i = 0; i < _n; i++) {
    const progress = (i + 1) / _n;
    _p(`Generating image ${i + 1} of ${_n}...`, progress);

    const _z = atob(POSES[i % POSES.length]);
    const _d: Part[] = [ sourcePart ];
    if (clothingPart) {
        _d.push(clothingPart);
    }
    
    const _backgroundInstruction = getBackgroundInstruction(_b, _cb);
    let backgroundRule: string;

    if (_cbg && _b === 'prompt' && _cb?.trim()) {
        backgroundRule = `
6.  **BACKGROUND**: Place the subject in a scene described as: ${_backgroundInstruction}.
7.  **SCENE DYNAMICS**: To make the photo series look more realistic and dynamic, you MUST render the background scene with subtle variations for each image. Introduce slight changes in camera angle, zoom, or depth of field (background blur). This will simulate a real photoshoot in a single, consistent location. Do not change the core elements of the background itself.`;
    } else {
        backgroundRule = `6.  **BACKGROUND**: Replace the background with: ${_backgroundInstruction}.`;
    }

    const clothingRule = getClothingRule(_o);

    const _t = `
**TASK**: You are a master portrait photographer. Your task is to generate a new photorealistic portrait based on the provided image(s).

**PRIMARY OBJECTIVE**: Create a new photo of the **exact same person** with a new pose, clothing, and background, following all rules with extreme precision.

**RULES**:
1.  **CRITICAL SUBJECT IDENTITY**: This is your highest priority. The person's face in the output image MUST be a perfect, identical match to the person in the FIRST source image.
    - Pay meticulous, pixel-level attention to their unique facial structure, eye shape and color, nose, and mouth.
    - The person in the output MUST be unmistakably the same individual, regardless of the new pose or distance from the camera.
    - DO NOT alter their core facial features, age, or ethnicity.
2.  ${clothingRule}
3.  **POSE**: Change the subject's pose to: "${_z}".
4.  **PHOTOREALISM & LIGHTING INTEGRATION**: This is critical for realism. The final image must look like it was taken with a single camera in a real location.
    - **AVOID THE "PHOTOSHOPPED" LOOK**: The subject must not look cut and pasted onto the background. Their lighting and shadows must blend seamlessly.
    - **MATCH LIGHTING PERFECTLY**: The lighting on the subject MUST be completely dictated by the new background environment. This includes:
        - **Direction & Source**: Light on the subject must come from the logical direction of the light source in the background (e.g., the sun, a window, a studio lamp).
        - **Color Temperature**: Match the warm (sunset) or cool (overcast day) tones of the ambient light.
        - **Quality**: Match the hardness or softness of the light. A bright sun creates hard-edged shadows; a cloudy sky creates soft, diffused shadows.
        - **Reflections**: The subject should pick up subtle bounce light and color reflections from their surroundings.
5.  **ASPECT RATIO**: The output image MUST perfectly match the aspect ratio of the FIRST source image you've been given. Do not add letterboxing or change the framing.
${backgroundRule}

Generate the image now. Do not output text.
`.trim();
    
    _d.push({ text: _t });
    
    try {
      const _e = await _a.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: _d },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });

      const _h = _e.candidates?.[0]?.content?.parts.find(_q => _q.inlineData);

      if (_h?.inlineData) {
        _r.push(`data:${_h.inlineData.mimeType};base64,${_h.inlineData.data}`);
      } else {
        console.warn(`No image part found in response for iteration ${i}.`, _e);
        const textResponse = _e.candidates?.[0]?.content?.parts.find(_q => _q.text);
        if (textResponse?.text) {
             throw new Error(`AI returned text instead of an image: "${textResponse.text}"`);
        }
      }
    } catch (error: any) {
      console.error(`Error generating image ${i + 1}:`, error);
      let _m = "An error occurred during generation.";
      if (error.message) _m = error.message;
      if (error.toString().includes("SAFETY")) {
        _m = `Generation for pose "${_z}" was blocked due to safety settings. Please try a different source image or options.`;
      }
      throw new Error(_m);
    }
  }

  return _r;
};

const dataUrlToGenerativePart = (imageDataUrl: string): Part => {
  const [header, base64Data] = imageDataUrl.split(',');
  if (!header || !base64Data) {
    throw new Error('Invalid data URL format.');
  }
  const mimeTypeMatch = header.match(/data:(.*);base64/);
  if (!mimeTypeMatch || !mimeTypeMatch[1]) {
    throw new Error('Could not extract MIME type from data URL.');
  }
  const mimeType = mimeTypeMatch[1];
  
  return {
    inlineData: {
      mimeType,
      data: base64Data,
    }
  };
};

export const enhanceImageResolution = async (
  imageDataUrl: string
): Promise<string> => {
    const prompt = "You are an expert photo editor. Your task is to upscale and enhance the provided image. Increase its resolution, clarity, and sharpness. Bring out fine details in the subject's face, clothing, and any background elements. You must preserve the subject's identity, expression, and the overall composition perfectly. Do not add, remove, or change any elements. The output must be a photorealistic, high-definition version of the input image.";
    
    const imagePart = dataUrlToGenerativePart(imageDataUrl);
    const textPart = { text: prompt };
    const requestParts: Part[] = [ imagePart, textPart ];

    try {
        const result = await _a.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: requestParts },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });

        const imageResponsePart = result.candidates?.[0]?.content?.parts.find(p => p.inlineData);

        if (imageResponsePart?.inlineData) {
            return `data:${imageResponsePart.inlineData.mimeType};base64,${imageResponsePart.inlineData.data}`;
        } else {
            console.warn(`No image part found in enhancement response.`, result);
            const textResponse = result.candidates?.[0]?.content?.parts.find(p => p.text);
            if (textResponse?.text) {
                throw new Error(`AI returned text instead of an enhanced image: "${textResponse.text}"`);
            }
            throw new Error('Failed to enhance image: AI did not return image data.');
        }
    } catch (error: any) {
        console.error('Error enhancing image:', error);
        let message = "An error occurred during image enhancement.";
        if (error.message) message = error.message;
        if (error.toString().includes("SAFETY")) {
          message = 'Image enhancement was blocked due to safety settings.';
        }
        throw new Error(message);
    }
};