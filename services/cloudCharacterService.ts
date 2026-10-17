import type { GenerationOptions } from '../types';
import { buildQwen21CharacterAnglePrompts, getEnabledCharacterAngles } from './characterAnglesWorkflow';
import { generatePortraits } from './geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, generateMammouthImage } from './mammouthService';

type CharacterImage = Awaited<ReturnType<typeof generatePortraits>>['images'][number];

export const generateCloudCharacterAngles = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
    clothingImage: File | null,
    backgroundImage: File | null,
    poseImage: File | null,
    onOutputProgress: (index: number, message: string, value: number) => void = () => undefined,
    onOutputReady: (index: number, image: CharacterImage, prompt: string) => void = () => undefined,
): Promise<{ images: CharacterImage[]; finalPrompt: string }> => {
    if (options.provider !== 'gemini' && options.provider !== 'mammouth') throw new Error('Select Gemini or Mammouth for cloud character generation.');
    if (!sourceImage) throw new Error('A source image is required for character generation.');
    const angles = getEnabledCharacterAngles(options);
    if (angles.length === 0) throw new Error('Enable at least one character output before generating.');

    const clothing = options.clothing === 'image' ? clothingImage : null;
    const background = options.background === 'image' && !options.comfyCharacterPreserveBackgroundPerspective ? backgroundImage : null;
    const files = [sourceImage, clothing, background, poseImage].filter((file): file is File => file !== null);
    const roles = ['character identity', clothing ? 'clothing' : '', background ? 'background' : '', poseImage ? 'pose' : ''].filter(Boolean);
    const referenceLegend = `Reference images in attachment order: ${roles.map((role, index) => `<image${index + 1}> is the ${role} reference`).join('; ')}.`;
    const prompts = buildQwen21CharacterAnglePrompts(options, {
        source: 'source',
        clothing: clothing ? 'clothing' : undefined,
        background: background ? 'background' : undefined,
        pose: poseImage ? 'pose' : undefined,
    }).map(prompt => `${referenceLegend}\n\n${prompt}`);
    const images: CharacterImage[] = [];

    for (let index = 0; index < angles.length; index += 1) {
        const angle = angles[index];
        const label = options.comfyCharacterAngleSettings?.[angle.id]?.angle?.trim() || angle.label;
        const progress = (message: string, value: number) => {
            onOutputProgress(index, message, value);
            updateProgress(`${label}: ${message}`, (index + value) / angles.length);
        };
        progress(`Starting ${label}...`, 0);
        let image: CharacterImage | undefined;
        if (options.provider === 'gemini') {
            const result = await generatePortraits(sourceImage, {
                ...options,
                numImages: 1,
                geminiMode: 'i2i',
                geminiI2iMode: 'compose',
                geminiComposePrompt: prompts[index],
            }, progress, null, null, null, null, null, files.slice(1));
            image = result.images[0];
        } else {
            const result = await generateMammouthImage(prompts[index], files, options.aspectRatio, options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL);
            if (result.images[0]) image = { src: result.images[0], usageMetadata: result.usageMetadata };
        }
        if (!image) throw new Error(`${options.provider === 'gemini' ? 'Gemini' : 'Mammouth'} returned no image for ${label}.`);
        images.push(image);
        progress(`${label} complete`, 1);
        onOutputReady(index, image, prompts[index]);
    }
    return { images, finalPrompt: prompts.join('\n\n') };
};
