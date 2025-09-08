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
**TASK**: Generate a new photorealistic portrait based on the provided image(s).

**PRIMARY OBJECTIVE**: Create a new photo of the **exact same person** with a new pose, clothing, and background, following all rules.

**RULES**:
1.  **SUBJECT IDENTITY**: The person's face and hair in the output image MUST be identical to the person in the FIRST source image. This is the most important rule.
2.  ${clothingRule}
3.  **POSE**: Change the subject's pose to: "${_z}".
4.  **PHOTOREALISM**: The final image must be a high-quality, realistic photograph. The lighting on the subject must match the lighting of the new background.
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