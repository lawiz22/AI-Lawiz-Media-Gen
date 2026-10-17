import type { GenerationOptions } from '../types';
import { DEFAULT_CHARACTER_FLUX2_UNET, DEFAULT_CHARACTER_UNET } from './characterAnglesWorkflow';
import { DEFAULT_GEMINI_IMAGE_MODEL } from './geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL } from './mammouthService';
import { defaultQwen21MultiOptions } from './qwen21Workflow';

export interface CharacterResultSnapshot {
    options: GenerationOptions;
    sourceImage: File | null;
    characterName: string;
}

export const getCharacterResultKey = (options: GenerationOptions): string => {
    let context: string[];
    if (options.provider === 'gemini') {
        context = ['gemini', options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL];
    } else if (options.provider === 'mammouth') {
        context = ['mammouth', options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL];
    } else {
        const workflow = options.comfyCharacterMode || 'qwen';
        const model = workflow === 'flux2'
            ? options.comfyCharacterFlux2Unet || DEFAULT_CHARACTER_FLUX2_UNET
            : workflow === 'qwen21-create'
                ? options.comfyQwen21Create?.unet || defaultQwen21MultiOptions().unet
                : options.comfyCharacterUnet || DEFAULT_CHARACTER_UNET;
        context = ['comfyui', workflow, model, workflow === 'qwen21-create' && options.comfyQwen21CreateTurbo ? 'turbo' : 'standard'];
    }
    return `character-generator:${JSON.stringify(context)}`;
};

export const createCharacterResultSnapshot = (
    options: GenerationOptions, sourceImage: File | null, characterName: string,
): CharacterResultSnapshot => ({
    options: structuredClone(options),
    sourceImage,
    characterName,
});
