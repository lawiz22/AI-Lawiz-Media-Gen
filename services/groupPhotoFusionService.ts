import { fileToBase64, fileToGenerativePart, limitImageFilesTotalSize } from '../utils/imageUtils';
import { GenerateContentResponse } from "@google/genai";
import { GeneratePhotoResult } from '../groupPhotoFusion/types';
import type { GenerationOptions, Provider } from '../types';

import { getGenAIInstance } from "./geminiService";
import { generateMammouthImage } from './mammouthService';
import { generateComfyUIPortraits } from './comfyUIService';

// Remove local initialization
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error("Failed to read file as data URL."));
        return;
      }
      const dataUrl = reader.result as string;
      const base64String = dataUrl.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });

  const base64String = await base64EncodedDataPromise;
  return {
    inlineData: {
      data: base64String,
      mimeType: file.type,
    },
  };
};

const imageSourceToBase64 = async (source: string) => {
  if (source.startsWith('data:')) return source.split(',')[1];
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to download generated image (${response.status}).`);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1];
};

const compactQwenScenePrompt = (prompt: string): string => {
  const normalizedPrompt = prompt.replace(/\r/g, '').trim();
  const readSection = (label: string, nextLabels: string[]) => {
    const end = nextLabels.length ? `(?=\\n(?:${nextLabels.join('|')}):|$)` : '$';
    return normalizedPrompt.match(new RegExp(`${label}:\\s*([\\s\\S]*?)${end}`, 'i'))?.[1]?.replace(/\s+/g, ' ').trim() || '';
  };
  const scenario = readSection('Scenario', ['Pose', 'Style', 'Background', 'Final Image']);
  const pose = readSection('Pose', ['Style', 'Background', 'Final Image']);
  const style = readSection('Style', ['Background', 'Final Image']);
  const background = readSection('Background', ['Final Image']);
  return [scenario, pose, style, background].filter(Boolean).join(' ');
};

export const generateComfyUIGroupPhoto = async (
  subjectFiles: File[],
  backgroundFile: File | null,
  prompt: string,
  personaDescriptions: string[],
  options: GenerationOptions,
  updateProgress: (message: string, value: number) => void,
): Promise<GeneratePhotoResult> => {
  if (subjectFiles.length < 2 || subjectFiles.length > 4) {
    throw new Error('Please provide 2 to 4 subject images.');
  }

  const subjectCount = subjectFiles.length;
  const identityLock = [
    `The final image must contain exactly ${subjectCount} people: Person 1 through Person ${subjectCount}, one person from each identity reference.`,
    'Do not add background people, bystanders, crowds, reflections of people, portraits of people, or any other human figure.',
    'Do not omit, duplicate, clone, merge, or blend any person. Each referenced identity must appear exactly once and remain clearly distinct.',
    'Treat every source face as an exact identity reference, not as inspiration. Keep each person\'s face shape, forehead, hairline, eyebrows, eye shape and spacing, nose, cheekbones, lips, jawline, chin, ears, skin tone, apparent age, ethnicity, and distinctive marks.',
    'Do not beautify, idealize, average, redesign, or substitute any face. Expressions may change only the facial muscles, never the underlying facial anatomy or identity.',
  ].join(' ');
  const referenceImages = [...subjectFiles.slice(1), ...(backgroundFile ? [backgroundFile] : [])];
  const roles = [
    ...subjectFiles.slice(1).map(() => 'identity' as const),
    ...(backgroundFile ? ['background' as const] : []),
  ];
  const descriptions = [
    ...subjectFiles.slice(1).map((_, index) => {
      const personNumber = index + 2;
      const persona = personaDescriptions[personNumber - 1]?.trim();
      return `This is the only identity reference for Person ${personNumber}. Include this person exactly once, preserve their precise facial identity, and keep them distinct from every other subject${persona ? `; portray them as follows: ${persona}` : ''}.`;
    }),
    ...(backgroundFile ? ['Use this image as the complete scene background.'] : []),
  ];
  const flux2Options: GenerationOptions = {
    ...options,
    provider: 'comfyui',
    comfyModelType: 'flux2-edit',
    comfyFlux2EditPrompt: `${identityLock} Picture 1 is the only identity reference for Person 1; include this person exactly once. Scene instructions: ${prompt} Apply the scene instructions only to Person 1 through Person ${subjectCount}; they do not authorize additional people. Final composition check: show exactly ${subjectCount} people, with every referenced person appearing once and no other human figures anywhere in the image.`,
    comfyFlux2EditReferenceRoles: roles,
    comfyFlux2EditReferenceDescriptions: descriptions,
    numImages: 1,
  };
  const result = await generateComfyUIPortraits(subjectFiles[0], flux2Options, updateProgress, referenceImages);
  const image = result.images[0];
  if (!image) throw new Error('ComfyUI completed without returning a Photo Fusion image.');
  return {
    imageBase64: await imageSourceToBase64(image.src),
    responseText: result.finalPrompt,
    seed: image.seed,
  };
};

export const generateQwenGroupPhoto = async (
  subjectFiles: File[],
  backgroundFile: File | null,
  prompt: string,
  personaDescriptions: string[],
  options: GenerationOptions,
  updateProgress: (message: string, value: number) => void,
): Promise<GeneratePhotoResult> => {
  const totalInputs = subjectFiles.length + (backgroundFile ? 1 : 0);
  if (subjectFiles.length < 2 || subjectFiles.length > 3 || totalInputs > 3) {
    throw new Error('Qwen Edit supports 2 to 3 people, or 2 people with one background image.');
  }

  const subjectCount = subjectFiles.length;
  const people = subjectFiles.map((_, index) => {
    const persona = personaDescriptions[index]?.trim();
    return `Person ${index + 1} must be the exact person from Picture ${index + 1}${persona ? `, portrayed as ${persona}` : ''}.`;
  }).join(' ');
  const backgroundInstruction = backgroundFile
    ? `Picture ${subjectCount + 1} is the background only; do not copy any person from it.`
    : '';
  const compactScenePrompt = compactQwenScenePrompt(prompt);
  const qwenPrompt = [
    `Create one cohesive photorealistic group photo with exactly ${subjectCount} people and no additional people.`,
    people,
    'Preserve each face, age, skin tone, hair, and body. Keep every identity distinct. Do not omit, duplicate, merge, or swap anyone.',
    backgroundInstruction,
    compactScenePrompt,
  ].filter(Boolean).join(' ');
  const referenceImages = [...subjectFiles.slice(1), ...(backgroundFile ? [backgroundFile] : [])];
  const result = await generateComfyUIPortraits(subjectFiles[0], {
    ...options,
    provider: 'comfyui',
    comfyModelType: 'qwen-edit',
    comfyPrompt: qwenPrompt,
    comfyNegativePrompt: '',
    comfySteps: options.photoFusionQwenSteps ?? 8,
    comfyCfg: options.photoFusionQwenCfg ?? 1,
    comfySampler: options.photoFusionQwenSampler || 'euler_ancestral',
    comfyScheduler: options.photoFusionQwenScheduler || 'beta57',
    numImages: 1,
  }, updateProgress, referenceImages);
  const image = result.images[0];
  if (!image) throw new Error('Qwen Edit completed without returning a Photo Fusion image.');
  return {
    imageBase64: await imageSourceToBase64(image.src),
    responseText: qwenPrompt,
    seed: image.seed,
  };
};

export const generateGroupPhoto = async (
  files: File[],
  prompt: string,
  provider: Provider = 'gemini',
  mammouthModel?: string,
  updateProgress: (message: string, value: number) => void = () => undefined,
): Promise<GeneratePhotoResult> => {
  if (files.length < 2 || files.length > 5) {
    throw new Error("Please provide 2 to 4 subject images, with an optional background.");
  }

  try {
    if (provider === 'mammouth') {
      updateProgress('Preparing source images...', 0.05);
      const mammouthFiles = await limitImageFilesTotalSize(files);
      updateProgress('Sending request to Mammouth...', 0.2);
      const result = await generateMammouthImage(prompt, mammouthFiles, '3:2', mammouthModel);
      updateProgress('Mammouth response received', 0.95);
      return {
        imageBase64: await imageSourceToBase64(result.images[0]),
        responseText: `Generated by Mammouth using ${mammouthModel || 'the default image model'}.`,
        usageMetadata: result.usageMetadata,
      };
    }

    const imageParts = await Promise.all(files.map(fileToGenerativePart));
    const textPart = { text: prompt };

    const response: GenerateContentResponse = await getGenAIInstance().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [...imageParts, textPart],
      },
      config: {
        temperature: 0.3,
      },
    });

    const usageMetadata = response.usageMetadata;

    if (!response.candidates || response.candidates.length === 0) {
      if (response.promptFeedback?.blockReason) {
        throw new Error(`Request was blocked due to ${response.promptFeedback.blockReason}.`);
      }
      throw new Error("The model did not return any content. This could be due to a safety filter.");
    }

    const candidate = response.candidates[0];
    let responseText = "No text response from model.";

    if (candidate.content && candidate.content.parts) {
      const imagePart = candidate.content.parts.find(part => part.inlineData);
      const textPart = candidate.content.parts.find(part => part.text);

      if (textPart && textPart.text) {
        responseText = textPart.text;
      }

      if (imagePart && imagePart.inlineData) {
        return {
          imageBase64: imagePart.inlineData.data,
          responseText: responseText,
          usageMetadata: {
            promptTokenCount: usageMetadata?.promptTokenCount || 0,
            candidatesTokenCount: usageMetadata?.candidatesTokenCount || 0,
            totalTokenCount: usageMetadata?.totalTokenCount || 0,
          },
        };
      }
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Image generation failed. Reason: ${candidate.finishReason}.`);
    }

    throw new Error("No image was generated. The model may have refused the request.");

  } catch (error) {
    console.error(`Image generation failed:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('SAFETY') || errorMessage.includes('blocked')) {
      throw new Error("Image generation failed due to safety filters. Please try different images or a less sensitive scenario.");
    }
    throw new Error(`Gemini API Error: ${errorMessage}`);
  }
};