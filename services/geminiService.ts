import { GoogleGenAI, Modality } from "@google/genai";
import { POSES } from '../constants';
import type { GenerationOptions } from '../types';
import { fileToGenerativePart } from '../utils/imageUtils';

const _k = process.env.API_KEY;

if (!_k) {
  throw new Error("API_KEY environment variable not set");
}

const _a = new GoogleGenAI({ apiKey: _k });

const _g = (_b: string) => {
    const p1 = "The final image should be a photorealistic, authentic, candid snapshot photo, with HDR lighting and professional color grading like post-processing in Lightroom. Ensure maximum detail and realism.";
    let p2 = `The background should be a solid ${_b} color, creating a professional studio portrait look.`;
    if (_b === 'original') p2 = 'Preserve the original background from the source image perfectly.';
    else if (_b === 'natural studio') p2 = 'The background should be a soft-focus, professional photography studio setting with natural, diffused light.';
    return [p1, p2].join(' ');
};

export const generatePortraitSeries = async (
  _f: File,
  _o: GenerationOptions,
  _p: (progress: number) => void
): Promise<string[]> => {
  const _r: string[] = [];
  const { numImages: _n, background: _b } = _o;
  const _s = await fileToGenerativePart(_f);

  for (let i = 0; i < _n; i++) {
    _p(i + 1);

    const _z = atob(POSES[i % POSES.length]);
    const _c = _g(_b);
    
    const _t = [
        "Generate a new photorealistic portrait of the same person from the provided source image.",
        `**New Pose and Composition:** The person must be in the following pose: "${_z}".`,
        "**Maintain Identity:** It is absolutely crucial to maintain the person's exact identity, facial features, ethnicity, hairstyle, and clothing from the source image. Do not change the person.",
        `**Final Image Style:** ${_c}`
    ].join('\n');
    
    const _d = [ { inlineData: _s }, { text: _t } ];
    
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