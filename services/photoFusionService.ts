import { limitImageFilesTotalSize } from '../utils/imageUtils';
import type { GenerationOptions } from '../types';
import type { FusionEngine } from '../photoFusion/scenes';
import { generatePortraits } from './geminiService';
import { generateMammouthImage } from './mammouthService';
import { generateComfyUIPortraits } from './comfyUIService';

export interface FusionRequest {
    engine: FusionEngine;
    subjects: File[];
    backdrop: File | null;
    /** Full prompt for the cloud engines and FLUX2. */
    prompt: string;
    /** Scene paragraph alone, for the shorter Qwen prompt. */
    scene: string;
    /** Per-person notes, '' when nothing was asked for that person. */
    notes: string[];
    options: GenerationOptions;
}

export interface FusionOutput {
    dataUrl: string;
    seed?: number;
    usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

type Progress = (message: string, value: number) => void;

/** Input limits of each engine: subjects, and subjects plus background. */
export const FUSION_LIMITS: Record<FusionEngine, { subjects: number; total: number }> = {
    comfyui: { subjects: 4, total: 5 }, qwen: { subjects: 3, total: 3 }, gemini: { subjects: 4, total: 5 }, mammouth: { subjects: 4, total: 5 },
};

export const fusionInputProblem = (engine: FusionEngine, subjects: number, hasBackdrop: boolean) => {
    const limit = FUSION_LIMITS[engine];
    if (subjects < 2) return 'Add at least two people.';
    if (subjects > limit.subjects) return `This engine takes at most ${limit.subjects} people.`;
    if (subjects + (hasBackdrop ? 1 : 0) > limit.total) return `QWEN-Edit takes at most ${limit.total} images in total: remove the background or one person.`;
    return '';
};

const toDataUrl = async (source: string) => {
    if (source.startsWith('data:')) return source;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not download the generated image (HTTP ${response.status}).`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result)));
        reader.addEventListener('error', () => reject(reader.error));
        reader.readAsDataURL(blob);
    });
};

const fluxPrompt = ({ prompt, subjects }: FusionRequest) => {
    const count = subjects.length;
    return [
        `Exactly ${count} people appear, Person 1 to Person ${count}, each taken from their own reference picture; Picture 1 is Person 1.`,
        'Add nobody else: no bystanders, crowds, reflections or portraits of people. Never drop, repeat, merge or blend anyone.',
        "Use every face as a strict identity reference: keep head and face shape, hairline, brows, eyes, nose, lips, jaw, ears, skin tone, age and marks. Do not beautify or redesign a face; an expression moves the muscles only.",
        `Scene: ${prompt}`,
        `Check before finishing: ${count} people, each one exactly once, and no other human figure.`,
    ].join(' ');
};

const runComfy = async (request: FusionRequest, onProgress: Progress): Promise<FusionOutput> => {
    const [first, ...others] = request.subjects;
    const references = [...others, ...(request.backdrop ? [request.backdrop] : [])];
    const options: GenerationOptions = request.engine === 'qwen' ? {
        ...request.options, provider: 'comfyui', comfyModelType: 'qwen-edit', numImages: 1, comfyNegativePrompt: '',
        comfyPrompt: [
            `One photorealistic group photo with exactly ${request.subjects.length} people and nobody else.`,
            ...request.subjects.map((_, index) => `Person ${index + 1} is the person in Picture ${index + 1}${request.notes[index] ? ` and ${request.notes[index]}` : ''}.`),
            request.backdrop ? `Picture ${request.subjects.length + 1} is only the background; take no person from it.` : '',
            'Keep each face, age, skin tone, hair and body; keep everyone distinct, with nobody missing, repeated, merged or swapped.',
            request.scene,
        ].filter(Boolean).join(' '),
        comfySteps: request.options.photoFusionQwenSteps ?? 8,
        comfyCfg: request.options.photoFusionQwenCfg ?? 1,
        comfySampler: request.options.photoFusionQwenSampler || 'euler_ancestral',
        comfyScheduler: request.options.photoFusionQwenScheduler || 'beta57',
    } : {
        ...request.options, provider: 'comfyui', comfyModelType: 'flux2-edit', numImages: 1,
        comfyFlux2EditPrompt: fluxPrompt(request),
        comfyFlux2EditReferenceRoles: [...others.map(() => 'identity' as const), ...(request.backdrop ? ['background' as const] : [])],
        comfyFlux2EditReferenceDescriptions: [
            ...others.map((_, index) => `Only identity reference for Person ${index + 2}: include this person once, keep the exact face and keep them apart from the others${request.notes[index + 1] ? `; this person ${request.notes[index + 1]}` : ''}.`),
            ...(request.backdrop ? ['Use this image as the whole background.'] : []),
        ],
    };
    const result = await generateComfyUIPortraits(first, options, onProgress, references);
    const image = result.images[0];
    if (!image) throw new Error('ComfyUI finished without returning an image.');
    return { dataUrl: await toDataUrl(image.src), seed: image.seed };
};

const runCloud = async (request: FusionRequest, onProgress: Progress): Promise<FusionOutput> => {
    const files = [...request.subjects, ...(request.backdrop ? [request.backdrop] : [])];
    try {
        if (request.engine === 'mammouth') {
            onProgress('Preparing images...', 0.05);
            const limited = await limitImageFilesTotalSize(files);
            onProgress('Waiting for Mammouth...', 0.2);
            const result = await generateMammouthImage(request.prompt, limited, '3:2', request.options.mammouthImageModel);
            return { dataUrl: await toDataUrl(result.images[0]), usage: result.usageMetadata };
        }
        const [first, ...references] = files;
        const result = await generatePortraits(first, {
            ...request.options, provider: 'gemini', geminiMode: 'i2i', geminiI2iMode: 'compose', geminiComposePrompt: request.prompt, aspectRatio: '3:2', numImages: 1,
        }, onProgress, null, null, null, null, null, references);
        const image = result.images[0];
        if (!image) throw new Error('Gemini finished without returning an image.');
        return { dataUrl: await toDataUrl(image.src), usage: image.usageMetadata };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/SAFETY|blocked/.test(message)) throw new Error('The service refused this request (safety filter). Try other photos or a calmer scene.');
        throw new Error(`${request.engine === 'mammouth' ? 'Mammouth' : 'Gemini'}: ${message}`);
    }
};

export const runPhotoFusion = (request: FusionRequest, onProgress: Progress): Promise<FusionOutput> => {
    const problem = fusionInputProblem(request.engine, request.subjects.length, !!request.backdrop);
    if (problem) return Promise.reject(new Error(problem));
    return request.engine === 'comfyui' || request.engine === 'qwen' ? runComfy(request, onProgress) : runCloud(request, onProgress);
};
