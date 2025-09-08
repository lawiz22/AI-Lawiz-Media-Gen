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

const getBackgroundInstruction = (_b: string): string => {
    switch (_b) {
        case 'original':
            return `Seamlessly and photorealistically extend the background from the source image to fill the new frame. Analyze the existing lighting, textures, and style and expand upon it naturally. The result should look like the camera simply revealed more of the original scene.`;
        case 'natural studio':
            return 'A soft-focus, professional photography studio setting with natural, diffused light. This completely replaces the original background.';
        default: // black, white, gray, green screen
            return `A solid, flat, professional studio backdrop of ${_b} color. This completely replaces the original background.`;
    }
};

export const generatePortraitSeries = async (
  _f: File,
  _o: GenerationOptions,
  _p: (message: string, progress: number) => void
): Promise<string[]> => {
  const _r: string[] = [];
  const { numImages: _n, background: _b, aspectRatio: _ar } = _o;
  
  _p("Cropping image to target ratio...", 0);
  const croppedSourceFile = await cropImageToAspectRatio(_f, _ar);
  
  _p("Preparing source image...", 0);
  const sourcePart = await fileToGenerativePart(croppedSourceFile);
  
  for (let i = 0; i < _n; i++) {
    const progress = (i + 1) / _n;
    _p(`Generating image ${i + 1} of ${_n}...`, progress);

    const _z = atob(POSES[i % POSES.length]);
    const _backgroundInstruction = getBackgroundInstruction(_b);
    
    const _t = `
**TASK**: Generate a new photorealistic portrait based on the provided image.

**PRIMARY OBJECTIVE**: Create a new photo of the **exact same person** with a new pose and background.

**RULES**:
1.  **SUBJECT IDENTITY**: The person in the output image (face, hair, clothing) MUST be identical to the person in the source image. This is the most important rule.
2.  **PHOTOREALISM**: The final image must be a high-quality, realistic photograph.
3.  **ASPECT RATIO**: The output image MUST perfectly match the aspect ratio of the source image you've been given. Do not add letterboxing or change the framing.
4.  **POSE**: Change the subject's pose to: "${_z}".
5.  **BACKGROUND**: Replace the background with: "${_backgroundInstruction}".

Generate the image now. Do not output text.
`.trim();
    
    const _d = [ sourcePart, { text: _t } ];
    
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
