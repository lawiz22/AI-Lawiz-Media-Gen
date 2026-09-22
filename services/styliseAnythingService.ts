import type { GenerationOptions } from '../types';
import { generateComfyUIPortraits } from './comfyUIService';
import type { PhotographicPreset } from '../components/styliseAnything/photographicPresets';

export const buildStyliseAnythingPrompt = (preset: PhotographicPreset, additionalInstructions: string, preserveComposition: boolean): string => [
    'Edit Picture 1 directly as the sole source image.',
    preserveComposition
        ? 'Preserve every depicted person, face, body, object, garment, text element, environment, pose, action, camera viewpoint, crop, framing, and spatial arrangement. Change only the photographic capture and reproduction treatment.'
        : 'Preserve all recognizable subjects and objects while allowing a natural recomposition appropriate to the selected photographic treatment.',
    `ERA: ${preset.era}.`,
    `PHOTO TYPE: ${preset.photoType}.`,
    `CAMERA TYPE: ${preset.cameraType}.`,
    `FILM OR MEDIA: ${preset.filmOrMedia}.`,
    `VISUAL STYLE: ${preset.visualStyle}.`,
    'Make the entire image look genuinely captured with this exact period camera and medium, including authentic optics, focus behavior, exposure, grain or sensor texture, color response, dynamic range, flash behavior, print or media artifacts, and age characteristics.',
    additionalInstructions.trim() ? `ADDITIONAL INSTRUCTIONS: ${additionalInstructions.trim()}` : '',
    'Return one coherent photographic image, not a collage, comparison, mockup, camera illustration, framed UI, or text description.',
].filter(Boolean).join(' ');

export const generateStyliseAnythingImage = async (
    sourceFile: File,
    preset: PhotographicPreset,
    additionalInstructions: string,
    preserveComposition: boolean,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
): Promise<string> => {
    const result = await generateComfyUIPortraits(sourceFile, {
        ...options,
        provider: 'comfyui',
        comfyModelType: 'flux2-edit',
        comfyFlux2EditPrompt: buildStyliseAnythingPrompt(preset, additionalInstructions, preserveComposition),
        comfyFlux2EditReferenceRoles: [],
        comfyFlux2EditReferenceDescriptions: [],
        comfyFlux2EditReferenceLibraryPrompts: [],
        comfyFlux2EditReinforceSourceIdentity: false,
        comfyFlux2EditRequirePhotorealism: true,
        numImages: 1,
    }, updateProgress);
    const image = result.images[0]?.src;
    if (!image) throw new Error('ComfyUI completed without returning a Stylise Anything image.');
    if (image.startsWith('data:')) return image;
    const response = await fetch(image);
    if (!response.ok) throw new Error(`Unable to load the generated image (${response.status}).`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
