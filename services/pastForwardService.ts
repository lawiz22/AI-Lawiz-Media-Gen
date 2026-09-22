import type { GenerationOptions } from '../types';
import { generateComfyUIPortraits } from './comfyUIService';

const imageSourceToDataUrl = async (source: string): Promise<string> => {
    if (source.startsWith('data:')) return source;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Unable to download the Past Forward image (${response.status}).`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const buildFlux2PastForwardPrompt = (prompt: string, allowAdditionalPeople: boolean): string => [
    'Edit Picture 1 directly. Preserve the source face and identity exactly, following the explicit source identity and face-surface requirements in the editing instructions.',
        prompt,
        'FINAL SOURCE CHECK: Do not reconstruct, reinterpret, beautify, age, or replace the face. Preserve the exact source face and all explicitly locked identity details.',
        allowAdditionalPeople
            ? 'The source person must remain the clearly recognizable principal subject. Supporting people may appear naturally in the historical scene, but they must not resemble or duplicate the source person.'
            : 'Show only the source person and no additional people.',
    ].join(' ');

export const generateComfyUIPastForwardImage = async (
    sourceFile: File,
    prompt: string,
    options: GenerationOptions,
    reinforceSourceIdentity = true,
    requirePhotorealism = true,
    allowAdditionalPeople = false,
    updateProgress: (message: string, value: number) => void = () => undefined,
): Promise<string> => {
    const result = await generateComfyUIPortraits(sourceFile, {
        ...options,
        provider: 'comfyui',
        comfyModelType: 'flux2-edit',
        comfyFlux2EditPrompt: buildFlux2PastForwardPrompt(prompt, allowAdditionalPeople),
        comfyFlux2EditReferenceRoles: [],
        comfyFlux2EditReferenceDescriptions: [],
        comfyFlux2EditReferenceLibraryPrompts: [],
        comfyFlux2EditReinforceSourceIdentity: reinforceSourceIdentity,
        comfyFlux2EditIdentityReferenceWeight: reinforceSourceIdentity ? (options.comfyFlux2EditIdentityReferenceWeight ?? 3) : 1,
        comfyFlux2EditRequirePhotorealism: requirePhotorealism,
        numImages: 1,
    }, updateProgress);
    const image = result.images[0];
    if (!image) throw new Error('ComfyUI completed without returning a Past Forward image.');
    return imageSourceToDataUrl(image.src);
};

export const generateQwenPastForwardImage = async (
    sourceFile: File,
    prompt: string,
    options: GenerationOptions,
    allowAdditionalPeople = false,
    updateProgress: (message: string, value: number) => void = () => undefined,
): Promise<string> => {
    const result = await generateComfyUIPortraits(sourceFile, {
        ...options,
        provider: 'comfyui',
        comfyModelType: 'qwen-edit',
        comfyPrompt: buildFlux2PastForwardPrompt(prompt, allowAdditionalPeople),
        comfyNegativePrompt: '',
        comfySteps: options.pastForwardQwenSteps ?? 8,
        comfyCfg: options.pastForwardQwenCfg ?? 1,
        comfySampler: options.pastForwardQwenSampler || 'euler_ancestral',
        comfyScheduler: options.pastForwardQwenScheduler || 'beta57',
        numImages: 1,
    }, updateProgress);
    const image = result.images[0];
    if (!image) throw new Error('Qwen Edit completed without returning a Past Forward image.');
    return imageSourceToDataUrl(image.src);
};