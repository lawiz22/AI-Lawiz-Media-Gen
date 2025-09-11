import type { GenerationOptions } from '../types';
import {
  POSES,
  CLOTHING_ADJECTIVES,
  CLOTHING_COLORS,
  CLOTHING_MATERIALS,
  CLOTHING_ITEMS,
  CLOTHING_DETAILS,
  BACKGROUND_LOCATIONS,
  BACKGROUND_STYLES,
  BACKGROUND_TIMES_OF_DAY,
  BACKGROUND_DETAILS,
  POSE_ACTIONS,
  POSE_MODIFIERS,
  POSE_DIRECTIONS,
  POSE_DETAILS,
  TEXT_OBJECT_PROMPTS,
} from '../constants';

// Helper to decode base64 poses
export const decodePose = (encoded: string): string => {
  try {
    // This will work in browser environments
    return atob(encoded);
  } catch (e) {
    console.error("Failed to decode pose:", e);
    // Fallback for non-browser env or error
    return "a standard pose";
  }
};

const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const getRandomPose = (): string => getRandom(POSES);

export const generateRandomClothingPrompt = (): string => {
    const adjective = getRandom(CLOTHING_ADJECTIVES);
    const color = getRandom(CLOTHING_COLORS);
    const material = getRandom(CLOTHING_MATERIALS);
    const item = getRandom(CLOTHING_ITEMS);
    const detail = getRandom(CLOTHING_DETAILS);

    const phraseStructures = [
      `a ${adjective} ${color} ${material} ${item}`,
      `a ${color} ${item} with ${detail}`,
      `a ${adjective} ${item} made of ${material}`,
      `a ${adjective} ${color} ${item} with ${detail}`,
    ];
    
    return getRandom(phraseStructures);
};

export const generateRandomBackgroundPrompt = (): string => {
    const location = getRandom(BACKGROUND_LOCATIONS);
    const style = getRandom(BACKGROUND_STYLES);
    const time = getRandom(BACKGROUND_TIMES_OF_DAY);
    const detail = getRandom(BACKGROUND_DETAILS);

    const phraseStructures = [
      `${location} ${time}`,
      `${location} ${style}`,
      `${location} ${time} ${style}`,
      `${location} ${time} with ${detail}`,
      `${location} ${style} with ${detail}`,
    ];
    
    return getRandom(phraseStructures);
};

export const generateRandomPosePrompts = (count: number): string[] => {
    const generatedPoses = new Set<string>();

    // Safety break to prevent infinite loops if combinations run out
    let attempts = 0;
    const maxAttempts = count * 10;

    while (generatedPoses.size < count && attempts < maxAttempts) {
        const action = getRandom(POSE_ACTIONS);
        const modifier = getRandom(POSE_MODIFIERS);
        const direction = getRandom(POSE_DIRECTIONS);
        const detail = getRandom(POSE_DETAILS);

        const structures = [
            `${action} ${modifier} ${direction}`,
            `${action} ${direction} ${detail}`,
            `${action} ${modifier} ${detail}`,
            `${modifier} ${action} ${direction}`,
            `${action} ${direction}`,
        ];
        
        const pose = getRandom(structures);
        generatedPoses.add(pose);
        attempts++;
    }

    return Array.from(generatedPoses);
};

export const getRandomTextObjectPrompt = (): string => getRandom(TEXT_OBJECT_PROMPTS);


export const buildPromptSegments = (options: GenerationOptions, pose: string, hasPreviewedClothing: boolean): string[] => {
    const promptSegments: string[] = [`Generate a high-quality, professional, and tasteful image. The subject is a person with the same face and features as in the reference image.`];
    
    promptSegments.push(`Pose: ${pose}`);

    // Clothing
    if (hasPreviewedClothing) {
        promptSegments.push(`Clothing: The person should be wearing an outfit identical to the one in the provided clothing preview image.`);
    } else if (options.clothing === 'image') {
        promptSegments.push(`Clothing: The person should be wearing an outfit identical to the one in the provided clothing image.`);
    } else if ((options.clothing === 'prompt' || options.clothing === 'random') && options.customClothingPrompt?.trim()) {
        const basePrompt = options.customClothingPrompt;
        if (options.clothingStyleConsistency === 'strict') {
            promptSegments.push(`Clothing: The person must be wearing this exact outfit in every detail: "${basePrompt}". The outfit should be identical across all images.`);
        } else {
            promptSegments.push(`Clothing: The person is wearing a variation of "${basePrompt}". Each image should show a different interpretation or style of this outfit. For example, if the prompt is 'a green dress', show different styles of green dresses.`);
        }
    } else { // 'original' or fallback
        promptSegments.push('Clothing: The person should wear the same outfit as in the reference image.');
    }

    // Background
    if (options.background === 'image' || (options.background === 'prompt' && options.consistentBackground)) {
        promptSegments.push(`Background: Place the person in a setting identical to the provided background image.`);
    } else if ((options.background === 'prompt' || options.background === 'random') && options.customBackground) {
        promptSegments.push(`Background: ${options.customBackground}`);
    } else if (options.background === 'original') {
        promptSegments.push('Background: Keep the original background from the reference image.');
    } else if (options.background !== 'image' && options.background !== 'prompt' && options.background !== 'random') {
        promptSegments.push(`Background: A solid ${options.background} studio background.`);
    } else {
        // Fallback for prompt modes with no text
        promptSegments.push('Background: Keep the original background from the reference image.');
    }


    // Text on Image
    if (options.addTextToImage && options.textOnImagePrompt?.trim() && options.textObjectPrompt?.trim()) {
        let textPrompt = options.textObjectPrompt;
        const userText = options.textOnImagePrompt;
        
        if (textPrompt.includes('%s')) {
            textPrompt = textPrompt.replace('%s', userText);
        } else {
            // If no placeholder, append the user text. Assume user knows what they are doing.
            textPrompt = `${textPrompt} ${userText}`;
        }
        
        promptSegments.push(`Text Element: The image must include ${textPrompt}. Make sure the text is clearly legible and integrated naturally into the scene.`);
    }
    
    // Style Directives
    if (options.imageStyle === 'photorealistic') {
        promptSegments.push(`Overall Style and Era: ${options.eraStyle}.`);
        promptSegments.push(`Photo Style: ${options.photoStyle}.`);
        promptSegments.push(`Artistic Style: Render the image in a photorealistic style.`);
        promptSegments.push("Ensure the final image is a high-quality, realistic photograph.");
    } else {
        // For non-photorealistic styles, we only want the artistic style itself.
        promptSegments.push(`Artistic Style: Render the image in a ${options.imageStyle} style.`);
        promptSegments.push(`Ensure the final result is a high-quality image in the specified artistic style.`);
    }

    return promptSegments;
};