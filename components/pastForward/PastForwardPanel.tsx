import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store/store';
import { addToLibrary } from '../../store/librarySlice';
import { addSessionTokenUsage } from '../../store/appSlice';
import { updateOptions } from '../../store/generationSlice';
import { generateMammouthImage } from '../../services/mammouthService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../../services/mammouthService';
import { DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODELS, generatePortraits, getApiKey, getGeminiImageSizes, getGeminiModels, supportsGeminiThinkingLevel } from '../../services/geminiService';
import { generateComfyUIPastForwardImage, generateQwenPastForwardImage } from '../../services/pastForwardService';
import { createAlbumPage } from '../../utils/pastForwardAlbumUtils';
import { dataUrlToThumbnail, fileToDataUrl, limitImageFileSize } from '../../utils/imageUtils';
import type { LibraryItem, LibraryItemType } from '../../types';
import { 
    SaveIcon, SpinnerIcon, CheckIcon, DownloadIcon, RefreshIcon, 
    GenerateIcon, PastForwardIcon, LibraryIcon, DiceIcon
} from '../icons';
import { ImageUploader } from '../ImageUploader';
import { LibraryPickerModal } from '../LibraryPickerModal';
import { NumberSlider, SelectInput } from '../InputComponents';
import { SendToLTXButton } from '../SendToLTXButton';
import { CLOTHING_CATALOG, type ClothingAudience } from './clothingCatalog';
import { HISTORICAL_CAMEO_CATALOG, type HistoricalCameo } from './historicalCameoCatalog';

const DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];
const LIBRARY_IMAGE_TYPES: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'];
const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean))).map(value => ({ value, label: value }));
const QWEN_LIGHTNING_PRESETS = {
    4: 'QWEN\\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors',
    8: 'QWEN\\Qwen-Image-Lightning-8steps-V2.0.safetensors',
} as const;
const HAIRSTYLE_CATALOG: Record<string, Record<'woman' | 'man', string[]>> = {
    '1950s': {
        man: ['Pompadour', 'Ducktail', 'Crew Cut', 'Flat Top', 'Ivy League', 'Side Part', 'Slicked-Back Hair', 'Rockabilly Quiff', 'Short Caesar Cut', 'Conservative Taper'],
        woman: ['Poodle Cut', 'Pin Curls', 'Victory Rolls', 'Short Curly Bob', 'Bouffant', 'Pageboy Cut', 'Chignon', 'Italian Cut', 'Long Waves', 'High Ponytail'],
    },
    '1960s': {
        man: ['Mod Mop Top', 'Beatle Cut', 'Sideburns', 'Crew Cut', 'Textured Crop', 'Shaggy Hair', 'Slicked-Back Hair', 'Rockabilly Pompadour', 'Shoulder-Length Hair', 'Afro'],
        woman: ['Beehive', 'Bouffant', 'Pixie Cut', 'Flip Hairstyle', 'Long Straight Hair', 'Brigitte Bardot Hair', 'Half-Up Beehive', 'Twiggy Crop', 'Headband Hairstyle', 'Natural Afro'],
    },
    '1970s': {
        man: ['Shag Haircut', 'Afro', 'Long Layered Hair', 'Mullet', 'Feathered Hair', 'Shoulder-Length Waves', 'Sideburns', 'Disco Slick-Back', 'Pageboy Haircut', 'Punk Spiked Hair'],
        woman: ['Feathered Layers', 'Farrah Fawcett Hair', 'Long Straight Hair', 'Shag Cut', 'Afro', 'Bohemian Waves', 'Braided Hair', 'Curtain Bangs', 'Disco Curls', 'Punk Mohawk'],
    },
    '1980s': {
        man: ['Mullet', 'Jheri Curl', 'Flock of Seagulls Haircut', 'Flat Top', 'Mohawk', 'New Wave Hair', 'Slicked-Back Hair', 'Long Metal Hair', 'Rat Tail', 'High-Top Fade'],
        woman: ['Big Perm', 'Crimped Hair', 'Side Ponytail', 'Teased Hair', 'Feathered Bangs', 'High-Volume Bob', 'Asymmetrical Haircut', 'Spiral Perm', 'Banana Clip Hairstyle', 'Half-Up Hair with Scrunchie'],
    },
    '1990s': {
        man: ['Curtained Hair', 'Caesar Cut', 'Frosted Tips', 'Bowl Cut', 'Grunge Long Hair', 'Buzz Cut', 'Boyband Hair', 'Cornrows', 'Spiky Hair', 'High-Top Fade'],
        woman: ['Rachel Haircut', 'Butterfly Clips Hairstyle', 'Baby Braids', 'Crimped Hair', 'Choppy Bob', 'Layered Hair', 'High Ponytail', 'Space Buns', 'Two-Tone Hair', 'Straight Hair with Middle Part'],
    },
    '2000s': {
        man: ['Faux Hawk', 'Spiky Hair', 'Emo Fringe', 'Frosted Tips', 'Long Side-Swept Bangs', 'Buzz Cut', 'Caesar Cut', 'Cornrows', 'Mohawk', 'Surfer Hair'],
        woman: ['Side-Swept Bangs', 'Chunky Highlights', 'Straightened Hair', 'Scene Hair', 'Razor Cut Layers', 'Low Side Ponytail', 'Pigtails', 'Crimped Hair', 'Long Extensions', 'Pouf Hairstyle'],
    },
};

const DEFAULT_HAIRSTYLE_SELECTIONS = (gender: 'woman' | 'man') => Object.fromEntries(
    DECADES.map(decade => [decade, HAIRSTYLE_CATALOG[decade][gender][0]]),
);
type LocationAudience = 'male' | 'female' | 'both';
const LOCATION_CATALOG: Record<string, Record<LocationAudience, string[]>> = {
    '1950s': {
        male: ['Barbershop', 'Diner', 'Bowling Alley', 'Gas Station', 'Baseball Stadium', 'Boxing Gym', 'Pool Hall', 'Garage', 'Military Base', 'Factory'],
        female: ['Beauty Salon', 'Dress Shop', 'Department Store', 'Kitchen', 'Living Room', "Ladies' Tea Room", 'Sewing Room', 'Dance Studio', 'Garden', 'Office'],
        both: ['Drive-In Theater', 'Shopping Street', 'Beach', 'Park', 'Train Station', 'School', 'Church', 'Cinema', 'Restaurant', 'Downtown Street'],
    },
    '1960s': {
        male: ['Barbershop', 'Garage', 'Record Store', 'University Campus', 'Coffeehouse', 'Motorcycle Workshop', 'Military Base', 'Factory', 'Pool Hall', 'Music Club'],
        female: ['Beauty Salon', 'Fashion Boutique', 'Department Store', 'Makeup Studio', 'Office', 'Art School', 'Dance Studio', 'Mod Fashion Shop', 'Apartment', 'Flower Shop'],
        both: ['Beatnik Cafe', 'Rock Concert Venue', 'Beach', 'Park', 'Cinema', 'Shopping Mall', 'University Campus', 'Airport', 'Restaurant', 'Downtown Street'],
    },
    '1970s': {
        male: ['Record Store', 'Garage', 'Pool Hall', 'Disco Entrance', 'Skate Park', 'Motorcycle Garage', 'Concert Backstage', 'Factory', 'Sports Bar', 'Apartment Loft'],
        female: ['Beauty Salon', 'Fashion Boutique', 'Yoga Studio', 'Craft Shop', 'Dance Studio', "Women's Clothing Store", 'Bohemian Apartment', 'Office', 'Music Festival Tent', 'Health Food Store'],
        both: ['Disco Club', 'Rock Concert', 'Music Festival', 'Beach', 'Shopping Mall', 'Coffeehouse', 'Park', 'Cinema', 'Roller Rink', 'Suburban Living Room'],
    },
    '1980s': {
        male: ['Arcade', 'Barbershop', 'Skate Park', 'Garage', 'Rock Concert Backstage', 'Gym', 'Video Store', 'Sports Stadium', 'Nightclub', 'Recording Studio'],
        female: ['Beauty Salon', 'Fashion Boutique', 'Aerobics Studio', 'Shopping Mall', 'Office', 'Dance Studio', 'Makeup Counter', 'Bedroom', 'Video Store', 'Modeling Studio'],
        both: ['Shopping Mall', 'Arcade', 'Nightclub', 'Beach', 'Roller Rink', 'Cinema', 'Fast-Food Restaurant', 'House Party', 'Concert Venue', 'Downtown Street'],
    },
    '1990s': {
        male: ['Skate Park', 'Barbershop', 'Record Store', 'Video Game Store', 'Garage', 'Basketball Court', 'Music Store', 'Internet Cafe', 'Concert Backstage', 'Basement Hangout'],
        female: ['Beauty Salon', 'Shopping Mall', 'Fashion Boutique', 'Bedroom', 'Dance Studio', 'Coffeehouse', 'Makeup Store', 'Office', 'Thrift Store', 'Music Video Set'],
        both: ['Shopping Mall', 'High School Hallway', 'Coffeehouse', 'Cinema', 'Arcade', 'House Party', 'Beach', 'Concert Venue', 'Skate Park', 'Fast-Food Restaurant'],
    },
    '2000s': {
        male: ['Barbershop', 'Gaming Store', 'Skate Park', 'Recording Studio', 'Gym', 'Garage', 'Internet Cafe', 'Music Festival', 'Basketball Court', 'Bedroom'],
        female: ['Beauty Salon', 'Shopping Mall', 'Fashion Boutique', 'Bedroom', 'Dance Studio', 'Coffeehouse', 'Makeup Store', 'Nail Salon', 'Thrift Store', 'Photo Studio'],
        both: ['Shopping Mall', 'High School Hallway', 'Coffeehouse', 'Cinema', 'Nightclub', 'House Party', 'Beach', 'Concert Venue', 'Fast-Food Restaurant', 'Downtown Street'],
    },
};
const DEFAULT_LOCATION_SELECTIONS = (audience: LocationAudience) => Object.fromEntries(
    DECADES.map(decade => [decade, LOCATION_CATALOG[decade][audience][0]]),
);
const DEFAULT_CLOTHING_SELECTIONS = (audience: ClothingAudience) => Object.fromEntries(
    DECADES.map(decade => [decade, CLOTHING_CATALOG[decade][audience][0]]),
);
const PLAUSIBLE_HAIR_COLORS: Record<string, string[]> = {
    '1950s': ['natural black', 'dark brown', 'chestnut brown', 'auburn', 'warm blonde', 'platinum blonde', 'natural gray'],
    '1960s': ['natural black', 'dark brown', 'chestnut brown', 'auburn', 'honey blonde', 'platinum blonde', 'natural gray'],
    '1970s': ['natural black', 'dark brown', 'chestnut brown', 'copper auburn', 'honey blonde', 'sun-lightened blonde', 'natural gray'],
    '1980s': ['natural black', 'blue-black', 'dark brown', 'chestnut brown', 'copper red', 'golden blonde', 'platinum blonde'],
    '1990s': ['natural black', 'dark brown', 'chestnut brown', 'auburn', 'golden blonde', 'platinum blonde', 'natural-looking frosted highlights'],
    '2000s': ['natural black', 'dark brown', 'chestnut brown', 'copper auburn', 'golden blonde', 'platinum blonde', 'natural-looking chunky highlights'],
};
const PHOTO_TYPE_CATALOG: Record<string, string[]> = {
    '1950s': [
        'Black-and-white medium-format portrait, soft directional lighting, fine but visible silver-grain, high contrast, slightly faded paper print, small scratches and dust marks, imperfect darkroom exposure',
        '35mm black-and-white family snapshot, direct flash, hard shadows, moderate film grain, slightly soft focus, aged print edges and small crease marks',
        '1950s color 35mm Kodachrome street photograph, restrained saturated colors, warm reds, fine grain, subtle color fading, realistic sunlight, slight lens softness',
        'Black-and-white documentary photograph, 35mm film, deep shadows, strong contrast, visible grain, minor scratches, dust spots, old newspaper-print texture',
        'Medium-format black-and-white holiday photograph, gentle overexposure, soft highlights, fine grain, faded blacks, worn corners and light surface scratches',
    ],
    '1960s': [
        '35mm color slide-film photograph, vivid but natural colors, fine grain, crisp daylight, slightly warm Kodachrome tones, minor color shift from aging',
        'Black-and-white 35mm street photograph, high contrast, noticeable grain, sharp sunlight, deep blacks, small dust and scratch imperfections',
        '1960s color instant photograph, slightly muted colors, soft focus, uneven exposure, visible chemical development marks and pale border',
        '35mm fashion photograph, controlled flash, clean mid-century color palette, fine grain, slightly imperfect focus, subtle print fading and warm skin tones',
        '35mm concert photograph, low available light, heavy film grain, motion blur, underexposed shadows, bright stage highlights',
    ],
    '1970s': [
        '35mm color film snapshot, warm orange and yellow cast, visible medium grain, slightly faded colors, direct on-camera flash',
        'Polaroid SX-70 instant photograph, square frame, soft focus, muted warm colors, mild exposure inconsistency, creamy highlights, visible white border',
        '35mm disco photograph, direct flash, saturated reds and blues, moderate grain, slight motion blur, occasional lens flare',
        'Black-and-white 35mm documentary photograph, gritty high grain, strong contrast, imperfect exposure, scratched negative, rough printed-paper texture',
        '110 film vacation snapshot, small-format softness, strong color cast, noticeable grain, slightly blurred details, uneven flash, faded corners and light chemical stains',
    ],
    '1980s': [
        'Polaroid instant snapshot, square format, faded pastel colors, soft focus, uneven chemical development, slight yellowing, worn white border and fingerprints',
        '35mm color photograph with direct flash, cool highlights, moderate grain, hard shadows, slightly overexposed faces',
        '35mm high-ISO concert photograph, heavy visible grain, strong motion blur, deep black shadows, colored stage lights, imperfect autofocus',
        'Disposable-camera style 35mm photograph, harsh flash, saturated colors, red-eye, soft corners, slight overexposure and cheap-lab print texture',
        'Medium-format color-film portrait, smooth skin, controlled flash, fine grain, mild color fading, slightly glossy print surface',
    ],
    '1990s': [
        '35mm candid street photograph, natural daylight, moderate fine grain, realistic colors, slightly imperfect focus, minilab print texture',
        'Disposable-camera party snapshot, direct flash, strong red-eye, harsh shadows, saturated colors, noticeable grain, soft details and accidental finger obstruction',
        'Polaroid instant photograph, slightly faded colors, soft edges, mild chemical stains, white border, authentic bedroom-snapshot treatment',
        '35mm skateboarding photograph, fast shutter, visible grain, slight motion blur, bright daylight, authentic amateur film processing',
        'Early consumer digital-camera photograph, low resolution, visible pixelation, weak dynamic range, cool color cast, harsh built-in flash, red-eye and compression artifacts',
    ],
    '2000s': [
        'Early digital compact-camera photograph, harsh built-in flash, cool white balance, low dynamic range, slight pixel noise, red-eye, overexposed skin and compressed JPEG artifacts',
        '35mm color film photograph, fine grain, natural skin tones, slightly warm colors, minilab print border, mild fading and imperfect laboratory exposure',
        'Early-2000s nightclub digital photograph, direct flash, blown highlights, motion blur, strong red-eye, visible sensor noise',
        'Disposable-camera photograph, heavy flash, low detail, saturated colors, soft focus, rough drugstore print texture and faded edges',
        'Early digital fashion photograph, low-resolution CCD look, slight green or magenta color cast, sharp flash highlights, moderate pixel noise',
    ],
};
const SHOT_ANGLE_CATALOG = [
    'Full-body shot at eye level',
    'Three-quarter-body shot at eye level',
    'Medium shot at eye level',
    'Medium close-up at eye level',
    'Tight close-up at eye level',
    'Wide establishing shot',
    'Low-angle full-body shot',
    'Low-angle medium shot',
    'High-angle three-quarter-body shot',
    'Three-quarter profile medium shot',
    'Side-profile full-body shot',
    'Candid over-the-shoulder shot',
];
const DEFAULT_PHOTO_TYPE_SELECTIONS = () => Object.fromEntries(
    DECADES.map(decade => [decade, PHOTO_TYPE_CATALOG[decade][0]]),
);
const DEFAULT_SHOT_ANGLE_SELECTIONS = () => Object.fromEntries(
    DECADES.map(decade => [decade, SHOT_ANGLE_CATALOG[0]]),
);
const DEFAULT_HISTORICAL_CAMEO_SELECTIONS = () => Object.fromEntries(
    DECADES.map(decade => [decade, HISTORICAL_CAMEO_CATALOG[decade][0].year]),
);
const getHistoricalCameo = (decade: string, year?: number): HistoricalCameo =>
    HISTORICAL_CAMEO_CATALOG[decade].find(cameo => cameo.year === year) || HISTORICAL_CAMEO_CATALOG[decade][0];
const buildHistoricalCameoPrompt = (cameo: HistoricalCameo) =>
    `Insert the person from the source photo naturally into this specific ${cameo.year} historical event: ${cameo.event}. REQUIRED CAMEO ROLE: ${cameo.cameoIdea}. Recompose the entire image around that exact event and role: give the person a believable visible action, three-quarter or profile body position, event-appropriate expression, completely new period wardrobe, documentary camera angle, lighting, and scale. Preserve the person's recognizable facial identity, skin tone, and apparent age. The result must look like an authentic photograph taken during the event, not a centered portrait, selfie, modern portrait with a replaced background, or reenactment. The original shirt and source background must not remain visible. Include historically appropriate supporting people without duplicating the source person.`;
const buildHistoricalCameoFluxPrompt = (cameo: HistoricalCameo) =>
    `Reimagine the entire source photograph as a newly captured documentary photograph at this exact ${cameo.year} historical event: ${cameo.event}. The source person must participate naturally in this exact cameo role: ${cameo.cameoIdea}. Treat the selected event, year, venue, crowd, activity, and cameo role as mandatory; do not substitute a generic scene or another event. Replace the source room, shirt, clothing, pose, expression, crop, framing, camera angle, lighting, props, and composition. Show the subject actively performing the stated role in a waist-up, three-quarter, or wider environmental composition; do not make a centered front-facing head-and-shoulders portrait. Integrate the person at a believable scale and depth within the action, looking toward the task or another participant instead of staring into the camera. Preserve the person's recognizable face shape, eyes, nose, mouth, skin tone, and apparent age. Supporting people must be varied period-appropriate individuals and must not duplicate the source face. Match the event's documentary lens, film grain, color response, shadows, perspective, and ambient light across the entire image. Photorealistic historical documentary photograph, not a selfie, studio portrait, costume portrait, backdrop replacement, collage, or modern reenactment.`;
const FLUX_DECADE_REIMAGININGS: Record<string, Record<'woman' | 'man', string>> = {
    '1950s': {
        woman: 'Choose a varied authentic feminine 1950s blouse, cardigan, day dress, accessories, grooming, location, and black-and-white or early color photographic treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic 1950s masculine clothing such as a collared shirt or tailored jacket, plus period accessories, grooming, location, and black-and-white or early color photographic treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
    '1960s': {
        woman: 'Choose a varied authentic feminine 1960s shift dress, blouse, cardigan, accessories, grooming, location, and warm saturated film treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic 1960s masculine clothing such as a narrow-collar shirt or slim-cut jacket, plus period accessories, grooming, location, and warm saturated film treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
    '1970s': {
        woman: 'Choose a varied authentic feminine 1970s wide-collar blouse, knit top, flowing earth-toned dress, accessories, grooming, location, and warm grainy film treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic 1970s masculine clothing such as a wide-collar shirt or casual jacket, plus period accessories, grooming, location, and warm grainy film treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
    '1980s': {
        woman: 'Choose a varied authentic feminine 1980s blouse, dress, colorful jacket, accessories, makeup, location, and punchy flash-lit analog photographic treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic 1980s masculine clothing such as a polo, denim, or statement jacket, plus period accessories, grooming, location, and punchy flash-lit analog photographic treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
    '1990s': {
        woman: 'Choose a varied authentic feminine 1990s casual top, cardigan, relaxed jacket, accessories, grooming, location, and natural consumer-film color and grain. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic 1990s masculine clothing such as a T-shirt, overshirt, or casual jacket, plus period accessories, grooming, location, and consumer-film color and grain. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
    '2000s': {
        woman: 'Choose a varied authentic early-2000s feminine top, cardigan, casual jacket, accessories, grooming, location, and crisp early-digital-camera treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
        man: 'Choose varied authentic early-2000s masculine clothing such as a fitted shirt or layered jacket, plus period accessories, grooming, location, and crisp early-digital-camera treatment. Do not choose or alter the hairstyle beyond the separate selected-hairstyle instruction',
    },
};
const QWEN_DECADE_REIMAGININGS: Record<string, Record<'woman' | 'man', string>> = {
    '1950s': { woman: 'a varied authentic feminine blouse, cardigan, or day dress, period accessories and location, black-and-white or early color film', man: 'varied authentic masculine clothing such as a collared shirt or tailored jacket, period accessories and location, black-and-white or early color film' },
    '1960s': { woman: 'a varied authentic feminine shift dress, blouse, or fitted cardigan, period accessories and location, warm saturated film', man: 'varied authentic masculine clothing such as a narrow-collar shirt or slim jacket, period accessories and location, warm saturated film' },
    '1970s': { woman: 'a varied authentic feminine wide-collar blouse, knit top, or flowing dress, period accessories and location, warm grainy film', man: 'varied authentic masculine clothing such as a wide-collar shirt or casual jacket, period accessories and location, warm grainy film' },
    '1980s': { woman: 'a varied authentic feminine blouse, dress, or colorful jacket, period accessories, makeup and location, bright flash-lit analog film', man: 'varied authentic masculine clothing such as a polo, denim, or statement jacket, period accessories and location, bright flash-lit analog film' },
    '1990s': { woman: 'a varied authentic feminine casual top, cardigan, or relaxed jacket, period accessories and location, natural consumer film', man: 'varied authentic masculine clothing such as a T-shirt, overshirt, or casual jacket, period accessories and location, natural consumer film' },
    '2000s': { woman: 'a varied authentic feminine fitted top, cardigan, or casual jacket, period accessories and location, crisp early-digital photography', man: 'varied authentic masculine clothing such as a fitted shirt or layered jacket, period accessories and location, crisp early-digital photography' },
};
const SUPERHERO_COMIC_STYLES: Record<string, string> = {
    '1950s': 'a 1950s Golden Age comic cover with bold hand-drawn ink outlines, simple heroic anatomy, limited CMYK colors, aged paper, and visible halftone dots',
    '1960s': 'a 1960s Silver Age comic panel with clean expressive inks, flat bright primary colors, dramatic action lines, caption boxes, and Ben-Day dots',
    '1970s': 'a 1970s Bronze Age comic illustration with detailed linework, natural heroic proportions, muted printed colors, textured shadows, and vintage newsprint grain',
    '1980s': 'a 1980s comic-book splash page with muscular heroic anatomy, dynamic foreshortening, heavy black inks, saturated colors, and dramatic cross-hatching',
    '1990s': 'a 1990s extreme-action comic cover with energetic angular linework, exaggerated perspective, dense cross-hatching, vivid colors, and explosive graphic composition',
    '2000s': 'a polished 2000s digital comic cover with crisp ink lines, cinematic panel composition, rich cel shading, controlled highlights, and modern printed-comic color',
};
const REIMAGINE_SCENE_PROMPT = 'Create a completely new scene and composition that is not based on the source room, background, pose, crop, framing, or camera angle. Place the same recognizable subject in a different era-appropriate environment with a new natural pose, new body positioning, new camera viewpoint, new lighting, and new composition. Preserve only the subject identity and defining facial features from the source.';

const THEMES: Record<string, { title: string, description: string, prompt: (decade: string) => string, fluxPrompt: (decade: string, reimagineScene?: boolean) => string }> = {
    'decades': {
        title: 'Through the Decades',
        description: 'The original experience. See yourself reimagined in the style of past decades.',
        prompt: (decade: string) => `Reimagine the person in this photo in the style of the ${decade}. This includes clothing, hairstyle, photo quality, and the overall aesthetic of that decade. The output must be a photorealistic image showing the person clearly.`,
        fluxPrompt: (decade: string, reimagineScene = false) => `Restyle the source person as the same individual photographed in the ${decade}. Preserve the exact recognizable facial identity, face shape, eyes, nose, mouth, jawline, skin tone, apparent age, and body proportions. ${reimagineScene ? 'Preserve identity only, not composition. Use a new natural activity, pose, body orientation, subject placement, viewpoint, and framing appropriate to the selected location. Do not reuse the source pose, front-facing alignment, horizon placement, or portrait framing. Use documentary deep focus with readable foreground, middle ground, and background detail, approximately f/8. No shallow depth of field, portrait-mode blur, generic bokeh, empty backdrop, isolated headshot, or centered passport-style composition.' : 'Preserve the source expression, pose, camera angle, crop, and subject placement, but replace the background completely with the selected location.'} Preserve facial hair only when visibly present; otherwise keep the face clean-shaven. Change the hairstyle, wardrobe, grooming, lighting response, color treatment, film grain, and photographic medium enough to make the decade immediately clear. Adapt period hair and clothing naturally to the same subject rather than replacing them with a different person. Render the subject and selected environment as one photograph with consistent perspective, ambient light, shadows, and film response. Photorealistic authentic period photograph, not a face replacement, gender transformation, costume caricature, cross-gender styling, or newly invented subject.`,
    },
    'hairstyles': {
        title: 'Hairstyle Time Machine',
        description: 'Try on the most popular hairstyles from each decade.',
        prompt: (decade: string) => `Reimagine the person in this photo with a popular hairstyle from the ${decade}. The output must be a photorealistic image showing the person clearly, focusing on the hair.`,
        fluxPrompt: () => `Replace the current hairstyle completely with the selected period hairstyle. Make the new hair visibly different from the source, with believable roots, hairline, strand detail, texture, volume, and lighting. Keep the face, facial hair, skin, expression, clothing, body, pose, camera framing, and background exactly unchanged. The eyes and surrounding skin must remain fully visible and unobstructed. Do not add or retain eyeglasses, sunglasses, reading glasses, transparent lenses, frames, monocles, goggles, or any accessory around the eyes, regardless of decade styling. Photorealistic professional hairstyle edit, not a wig, illustration, or beauty-filtered face.`,
    },
    'fantasy': {
        title: 'Fantasy You',
        description: 'Create a fantasy version of yourself through the ages.',
        prompt: (decade: string) => `Create a fantasy version of the person in this photo, with attire and setting inspired by fantasy art trends of the ${decade}. The output must be a photorealistic image.`,
        fluxPrompt: (decade: string) => `Reimagine the source person as a complete photorealistic fantasy character inspired by fantasy art from the ${decade}. Create entirely new era-inspired fantasy attire, hairstyle, accessories, props, environment, atmosphere, lighting, pose, body positioning, framing, and camera angle. Do not reuse the source room, clothing, pose, crop, or composition. Preserve the person's recognizable facial identity, facial anatomy, skin tone, apparent age, eyewear if present, and facial hair if present. The result must look like a newly photographed cinematic fantasy scene, not a filtered source photo.`,
    },
    'superhero': {
        title: 'Superhero Saga',
        description: 'Design a superhero version of you from different comic book eras.',
        prompt: (decade: string) => `Reimagine the source person as a completely original super-powered comic protagonist in ${SUPERHERO_COMIC_STYLES[decade]}. Invent a distinctive costume led by emerald, gold, ivory, magenta, silver, or black, with asymmetric panels, an abstract geometric non-letter emblem, original powers, action pose, camera angle, city environment, and complete comic-book composition. Make the design unique to this subject rather than resembling an established character or franchise. Preserve the person's recognizable facial identity, body proportions, apparent age, and skin tone. Inspect the source eyes: when the source has no eyewear, draw bare, fully visible eyes with no glasses, frames, lenses, goggles, mask, visor, or eye accessory. The output must be a hand-drawn comic-book illustration, not a photograph, not photorealistic, and not a person wearing a costume in a photo.`,
        fluxPrompt: (decade: string) => `Reimagine the source person as a completely original super-powered comic protagonist in ${SUPERHERO_COMIC_STYLES[decade]}. Invent a distinctive costume led by emerald, gold, ivory, magenta, silver, or black, with an asymmetric silhouette, layered armor or fabric panels, an abstract geometric non-letter emblem, original powers, action pose, body positioning, dramatic camera angle, city environment, lighting, and complete comic-cover composition. Make the design unique to this subject rather than resembling an established character or franchise. Do not reuse the source room, clothing, pose, crop, or photographic rendering. Preserve the person's recognizable face shape, eyes, nose, mouth, skin tone, apparent age, and body proportions, translated into illustrated linework. Inspect Picture 1 carefully: if the source has bare eyes, keep both eyes fully visible and unobstructed with no glasses, frames, lenses, goggles, eye mask, visor, or eye accessory; preserve eyewear only when it is visibly present in Picture 1. Render every element as a cohesive hand-drawn comic-book illustration. Absolutely no photography, photorealism, live-action appearance, realistic skin texture, or cosplay photograph.`,
    },
    'historical': {
        title: 'Historical Cameo',
        description: 'Place yourself in famous historical events or scenes.',
        prompt: (decade: string) => buildHistoricalCameoPrompt(getHistoricalCameo(decade)),
        fluxPrompt: (decade: string) => buildHistoricalCameoFluxPrompt(getHistoricalCameo(decade)),
    },
};

type ImageStatus = 'idle' | 'pending' | 'done' | 'error';

interface GeneratedImage {
    status: ImageStatus;
    url?: string;
    error?: string;
}

interface DecadeProgress {
    value: number;
    message: string;
}

const PastForwardPanel: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const generationOptions = useSelector((state: RootState) => state.generation.options);
    const { isComfyUIConnected, isMammouthConnected, comfyUIObjectInfo } = useSelector((state: RootState) => state.app);
    
    // State
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
    const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
    const [generationProgress, setGenerationProgress] = useState<Record<string, DecadeProgress>>({});
    const [generationDecades, setGenerationDecades] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState<boolean>(false);
    const [selectedTheme, setSelectedTheme] = useState<string>('decades');
    const [subjectGender, setSubjectGender] = useState<'woman' | 'man' | null>(null);
    const [sourceWearsGlasses, setSourceWearsGlasses] = useState(false);
    const [sourceHasFacialHair, setSourceHasFacialHair] = useState(false);
    const [selectedHairstyles, setSelectedHairstyles] = useState<Record<'woman' | 'man', Record<string, string>>>(() => ({
        woman: DEFAULT_HAIRSTYLE_SELECTIONS('woman'),
        man: DEFAULT_HAIRSTYLE_SELECTIONS('man'),
    }));
    const [selectedLocations, setSelectedLocations] = useState<Record<LocationAudience, Record<string, string>>>(() => ({
        male: DEFAULT_LOCATION_SELECTIONS('male'),
        female: DEFAULT_LOCATION_SELECTIONS('female'),
        both: DEFAULT_LOCATION_SELECTIONS('both'),
    }));
    const [selectedClothing, setSelectedClothing] = useState<Record<ClothingAudience, Record<string, string>>>(() => ({
        male: DEFAULT_CLOTHING_SELECTIONS('male'),
        female: DEFAULT_CLOTHING_SELECTIONS('female'),
        both: DEFAULT_CLOTHING_SELECTIONS('both'),
    }));
    const [varyHairColor, setVaryHairColor] = useState(false);
    const [selectedPhotoTypes, setSelectedPhotoTypes] = useState<Record<string, string>>(DEFAULT_PHOTO_TYPE_SELECTIONS);
    const [selectedShotAngles, setSelectedShotAngles] = useState<Record<string, string>>(DEFAULT_SHOT_ANGLE_SELECTIONS);
    const [selectedHistoricalCameos, setSelectedHistoricalCameos] = useState<Record<string, number>>(DEFAULT_HISTORICAL_CAMEO_SELECTIONS);
    const [reimagineScene, setReimagineScene] = useState(false);
    const [selectedDecades, setSelectedDecades] = useState<string[]>([...DECADES]);
    const [saveStatuses, setSaveStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
    const [albumSaveStatus, setAlbumSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const provider = generationOptions.pastForwardProvider || 'comfyui';
    const isCloudProvider = provider === 'gemini' || provider === 'mammouth';
    const requiresSubjectGender = selectedTheme === 'historical' || selectedTheme === 'superhero' || (selectedTheme === 'hairstyles' && !isCloudProvider);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [themesOpen, setThemesOpen] = useState(true);
    const [hairstylesOpen, setHairstylesOpen] = useState(true);
    const [locationsOpen, setLocationsOpen] = useState(true);
    const [clothingOpen, setClothingOpen] = useState(true);
    const [photoTypesOpen, setPhotoTypesOpen] = useState(true);
    const [shotAnglesOpen, setShotAnglesOpen] = useState(true);
    const [historicalCameosOpen, setHistoricalCameosOpen] = useState(true);
    const [zoomedImage, setZoomedImage] = useState<{ url: string; decade: string } | null>(null);
    const [mammouthModels, setMammouthModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
    const [isLoadingMammouthModels, setIsLoadingMammouthModels] = useState(false);
    const [geminiModels, setGeminiModels] = useState<string[]>([...GEMINI_IMAGE_MODELS]);
    const [isLoadingGeminiModels, setIsLoadingGeminiModels] = useState(false);

    const models = getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name);
    const qwenModels = getOptions(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name);
    const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
    const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
    const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    const qwenLoras = getOptions(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name);
    const cacheDitModels = getOptions(comfyUIObjectInfo?.CacheDiT_Model_Optimizer?.input?.required?.model_type);
    const fluxRequiredNodes = ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'];
    const qwenRequiredNodes = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow', 'CFGNorm', 'TextEncodeQwenImageEditPlus', 'ImageScaleToTotalPixels'];
    const requiredNodes = provider === 'qwen' ? qwenRequiredNodes : fluxRequiredNodes;
    const missingNodes = isCloudProvider || !comfyUIObjectInfo ? [] : requiredNodes.filter(node => !comfyUIObjectInfo[node]);
    if (provider === 'comfyui' && generationOptions.comfyFlux2EditUseCacheDit && comfyUIObjectInfo && !comfyUIObjectInfo.CacheDiT_Model_Optimizer) missingNodes.push('CacheDiT_Model_Optimizer');

    useEffect(() => {
        if (provider !== 'mammouth') return;
        setIsLoadingMammouthModels(true);
        getMammouthImageModels()
            .then(models => setMammouthModels(models.length > 0 ? models : [...MAMMOUTH_IMAGE_MODELS].sort()))
            .finally(() => setIsLoadingMammouthModels(false));
    }, [provider]);

    useEffect(() => {
        if (provider !== 'gemini') return;
        setIsLoadingGeminiModels(true);
        getGeminiModels()
            .then(models => setGeminiModels(Array.from(new Set([...GEMINI_IMAGE_MODELS, ...models]))))
            .finally(() => setIsLoadingGeminiModels(false));
    }, [provider]);

    useEffect(() => {
        if (!zoomedImage) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setZoomedImage(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoomedImage]);

    // Initialize empty state for grid
    useEffect(() => {
        const initialImages: Record<string, GeneratedImage> = {};
        DECADES.forEach(decade => {
            initialImages[decade] = { status: 'idle' };
        });
        setGeneratedImages(initialImages);
    }, []);

    const handleImageUpload = async (file: File | null) => {
        setUploadedFile(file);
        if (file) {
            try {
                const base64 = await fileToDataUrl(file);
                setUploadedImageBase64(base64);
                // Reset results when new image is uploaded
                const initialImages: Record<string, GeneratedImage> = {};
                DECADES.forEach(decade => {
                    initialImages[decade] = { status: 'idle' };
                });
                setGeneratedImages(initialImages);
                setGenerationProgress({});
                setGenerationDecades([]);
                setSaveStatuses({});
                setAlbumSaveStatus('idle');
            } catch (e) {
                console.error("Error reading file:", e);
            }
        } else {
            setUploadedImageBase64(null);
        }
    };

    const handleLibrarySelect = async (item: LibraryItem) => {
        const response = await fetch(item.media);
        if (!response.ok) throw new Error(`Unable to load Library image (${response.status}).`);
        const blob = await response.blob();
        const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
        await handleImageUpload(new File([blob], `past-forward-${item.id}.${extension}`, { type: blob.type }));
    };

    const generatePastForwardImage = async (prompt: string, fluxPrompt: string, decade: string): Promise<string> => {
        if (!uploadedFile || !uploadedImageBase64) throw new Error('Select a source photo first.');
        if (requiresSubjectGender && !subjectGender) throw new Error('Select Woman or Man for the subject identity.');
        const subjectIdentityPrompt = !subjectGender
            ? ''
            : subjectGender === 'woman'
                ? selectedTheme === 'superhero'
                    ? 'Picture 1 contains one adult woman. The principal protagonist must be this same recognizable woman, with her female sex, feminine facial structure, anatomy, body proportions, hair, and gender presentation preserved. Depict one original comic-book heroine with a clearly feminine face, natural jawline, body shape, and silhouette. Give her an original asymmetric costume led by emerald, gold, ivory, magenta, silver, or black, with an abstract geometric non-letter emblem and powers unique to her. Inspect her eyes in Picture 1: if they are bare, keep both eyes bare, fully visible, and unobstructed without glasses, frames, lenses, goggles, mask, visor, or eye accessory.'
                    : 'Picture 1 contains one adult woman. The principal subject in the output must be this same recognizable woman. Preserve her female sex, feminine facial structure, natural jawline, anatomy, body proportions, hairline, and feminine gender presentation exactly in every scene.'
                : selectedTheme === 'superhero'
                    ? 'The source subject is a man. Preserve his male sex and masculine gender presentation. Transform this same recognizable man into an original comic-book hero with masculine facial structure, anatomy, body proportions, hair, styling, and costume. Do not depict a woman or feminine anatomy.'
                    : 'Picture 1 contains one adult man. The principal subject in the output must be this same recognizable man. Preserve his male sex, masculine facial structure, natural jawline, anatomy, body proportions, hairline, grooming, and masculine gender presentation exactly in every scene.';
        const locationAudience: LocationAudience = subjectGender === 'woman' ? 'female' : subjectGender === 'man' ? 'male' : 'both';
        const selectedLocation = selectedLocations[locationAudience][decade];
        const selectedOutfit = selectedClothing[locationAudience][decade];
        const selectedHistoricalCameo = getHistoricalCameo(decade, selectedHistoricalCameos[decade]);
        const effectivePrompt = selectedTheme === 'historical' ? buildHistoricalCameoPrompt(selectedHistoricalCameo) : prompt;
        const effectiveFluxPrompt = selectedTheme === 'historical' ? buildHistoricalCameoFluxPrompt(selectedHistoricalCameo) : fluxPrompt;
        const eyewearPrompt = sourceWearsGlasses
            ? 'SOURCE FACE ACCESSORY: Copy the exact physical prescription glasses from Picture 1 unchanged, including frame silhouette, lens shape and size, rim thickness, frame color and material, bridge shape and width, temples, fit, tilt, position on the nose, distance from the eyes, and lens reflections. Do not redesign, modernize, vintage-style, resize, recolor, remove, or replace this pair.'
            : 'SOURCE FACE: Keep both eyes completely bare, clearly visible, and unobstructed. Keep the entire face and surrounding skin free of accessories.';
        const facialHairPrompt = sourceHasFacialHair
            ? 'SOURCE FACIAL-HAIR STATUS: PRESENT. Preserve the exact beard, moustache, goatee, or stubble visible in Picture 1, including its coverage, outline, length, density, texture, color, connections, and boundaries. A clean-shaven result is invalid.'
            : 'SOURCE FACE SURFACE: Keep the upper lip, cheeks, chin, jaw, sideburn area, and neck as smooth continuous bare skin exactly matching Picture 1.';
        const facialIdentityPrompt = `FINAL IDENTITY REQUIREMENT, OVERRIDING ALL STYLE, WARDROBE, ERA, LOCATION, EVENT, AND CAMERA INSTRUCTIONS: Copy the face from Picture 1 without redesigning it. Preserve the exact skull and face shape, forehead height, hairline, eyebrow shape and spacing, eye shape and spacing, eyelids, nose bridge and tip, nostril width, cheekbone structure, mouth width, lip shape, philtrum, jawline, chin, ears, skin texture, natural asymmetry, apparent age, and distinctive marks. Keep the original geometric distances and proportions between all facial landmarks. ${eyewearPrompt} ${facialHairPrompt} Do not beautify, smooth, idealize, masculinize, feminize, age, de-age, or substitute the face.`;
        const selectedLocationPrompt = `FINAL LOCATION REQUIREMENT, OVERRIDING THE SOURCE BACKGROUND, PHOTO TYPE, SHOT, AND ALL EARLIER SCENE TEXT: The entire setting must be a clearly recognizable ${decade} ${selectedLocation}, never the room or environment visible in Picture 1 and never another venue. Replace 100 percent of the visible source background, including walls, floor, ceiling, windows, furniture, fixtures, equipment, objects, signs, reflections, and distant areas. Fill all visible background space with a coherent, period-correct ${selectedLocation}. Show multiple unmistakable visual identifiers of this exact place through its layout, architecture, furniture, equipment, objects, readable or recognizable signage, materials, lighting, and natural background activity. The subject must be physically inside and interacting naturally with this location, with matching perspective, scale, contact shadows, and ambient light. Even in a close shot, retain enough environmental detail to identify the ${selectedLocation}. A result that preserves the source room, uses a generic room, substitutes another venue, or only suggests the location through clothing is invalid.`;
        const selectedClothingPrompt = `FINAL WARDROBE REQUIREMENT: Dress the subject in exactly this selected ${decade} outfit: ${selectedOutfit.replace(/sunglasses/gi, 'period-appropriate summer accessories')}. Replace all source clothing. Preserve the named garment types, silhouette, layers, fit, materials, and non-facial accessories. Clothing instructions never authorize adding or changing anything on the face. Do not substitute a different outfit or mix in clothing from another decade.`;
        const selectedCameraPrompt = reimagineScene
            ? `FINAL SHOT AND ANGLE REQUIREMENT: Compose exactly a ${selectedShotAngles[decade]}. This selection controls only subject distance, body coverage, camera height, viewpoint, angle, crop, and framing. It is mandatory. Build a genuinely new photograph rather than a background replacement. Change the source pose, gesture, head direction, torso orientation, body placement, camera distance, camera height, viewing angle, crop, framing, and composition. At least the subject's pose, body orientation, camera angle, and framing must all be visibly different from Picture 1. Do not preserve or closely imitate the source seated or standing posture, centered placement, eye-level viewpoint, head-and-shoulders crop, or background layout. Keep only identity, facial traits, explicitly selected face accessories, and facial hair from the source.`
            : '';
        const selectedPhotoStylePrompt = reimagineScene
            ? `FINAL PHOTO TYPE REQUIREMENT: Render the output as a ${selectedPhotoTypes[decade]}. This selection controls only photographic medium, camera technology, film or sensor response, grain, color treatment, lighting character, exposure imperfections, print texture, and aging artifacts. Do not infer the shot size, crop, pose, or camera angle from this description; those are controlled exclusively by the separate Shot & Angle requirement. Do not use a clean modern digital look unless the selected type specifically describes one.`
            : '';
        const selectedHairColor = PLAUSIBLE_HAIR_COLORS[decade][Math.floor(Math.random() * PLAUSIBLE_HAIR_COLORS[decade].length)];
        const hairColorPrompt = varyHairColor
            ? `HAIR COLOR: Change the scalp hair to exactly ${selectedHairColor}, a historically plausible ${decade} color. Use a natural believable dye or highlight treatment for that era. No green, blue, purple, pink, rainbow, neon, or fantasy hair colors. Do not recolor the beard, moustache, eyebrows, or eyelashes.`
            : 'HAIR COLOR LOCK: Preserve the exact natural scalp-hair color from Picture 1, including its highlights and gray distribution. Do not recolor the hair.';
        const selectedStylePrompt = selectedTheme === 'decades'
            ? [
                subjectGender
                ? `SELECTED HAIRSTYLE: ${selectedHairstyles[subjectGender][decade]}. Replace the source hairstyle completely with this one exact authentic ${decade} hairstyle for a ${subjectGender}. Reproduce its defining silhouette, hairline, part, length, volume, texture, strand direction, curls or waves, fringe or bangs, and styling construction. Do not blend it with another hairstyle or retain the source haircut. OTHER ERA STYLING: ${FLUX_DECADE_REIMAGININGS[decade][subjectGender]}.`
                : `Choose an authentic ${decade} hairstyle, clothing, accessories, and grooming appropriate to the source subject without changing their gender presentation.`,
                `SELECTED LOCATION: Place the subject clearly inside or immediately at a ${decade} ${selectedLocation}. Replace the source background with a complete, recognizable, era-authentic ${selectedLocation} environment containing appropriate architecture, furniture, objects, signage, materials, colors, and ambient lighting. The selected location is mandatory and must not be substituted with another place.`,
            ].join(' ')
            : subjectGender && selectedTheme === 'hairstyles'
                ? `SELECTED HAIRSTYLE: ${selectedHairstyles[subjectGender][decade]}. Apply this one exact named hairstyle, interpreted authentically for the ${decade} and for a ${subjectGender}. Do not blend it with another hairstyle or keep the source haircut. Preserve the source person's natural hair color unless the selected hairstyle specifically requires a color treatment.`
                : '';
        const finalPrompt = [selectedTheme === 'superhero' ? subjectIdentityPrompt : '', effectivePrompt, reimagineScene && selectedTheme !== 'historical' ? REIMAGINE_SCENE_PROMPT : ''].filter(Boolean).join(' ');
        const usesHairControls = selectedTheme === 'decades' || selectedTheme === 'hairstyles';
        const usesIdentityControls = usesHairControls || selectedTheme === 'historical';
        const finalFluxPrompt = [subjectIdentityPrompt, selectedStylePrompt, effectiveFluxPrompt, usesHairControls ? hairColorPrompt : '', selectedTheme === 'decades' ? selectedClothingPrompt : '', selectedTheme === 'decades' || selectedTheme === 'historical' ? selectedCameraPrompt : '', selectedTheme === 'decades' || selectedTheme === 'historical' ? selectedPhotoStylePrompt : '', reimagineScene && selectedTheme !== 'decades' && selectedTheme !== 'historical' ? REIMAGINE_SCENE_PROMPT : '', selectedTheme === 'historical' ? subjectIdentityPrompt : '', usesIdentityControls ? facialIdentityPrompt : '', selectedTheme === 'decades' ? selectedLocationPrompt : ''].filter(Boolean).join(' ');
        if (isCloudProvider) {
            const cloudLabel = provider === 'gemini' ? 'Gemini' : 'Mammouth';
            setGenerationProgress(current => ({ ...current, [decade]: { value: 0.1, message: `Generating ${decade} with ${cloudLabel}...` } }));
            const cloudPrompt = selectedTheme === 'historical' ? finalFluxPrompt : finalPrompt;
            const cloudSource = await limitImageFileSize(uploadedFile);
            if (provider === 'gemini') {
                const result = await generatePortraits(
                    cloudSource,
                    {
                        ...generationOptions,
                        provider: 'gemini',
                        geminiMode: 'i2i',
                        geminiI2iMode: 'general',
                        geminiGeneralEditPrompt: cloudPrompt,
                        aspectRatio: '3:4',
                        numImages: 1,
                    },
                    (message, value) => setGenerationProgress(current => ({ ...current, [decade]: { value, message } })),
                    null,
                    null,
                    null,
                    null,
                    null,
                    [],
                );
                const image = result.images[0];
                if (image?.usageMetadata) dispatch(addSessionTokenUsage(image.usageMetadata));
                if (!image) throw new Error('Gemini completed without returning a Past Forward image.');
                return image.src;
            }
            const result = await generateMammouthImage(cloudPrompt, [cloudSource], '3:4', generationOptions.mammouthImageModel);
            if (result.usageMetadata) dispatch(addSessionTokenUsage(result.usageMetadata));
            if (!result.images[0]) throw new Error('Mammouth completed without returning a Past Forward image.');
            return result.images[0];
        }
        if (provider === 'qwen') {
            const qwenPrompt = selectedTheme === 'decades'
                ? subjectGender === 'woman'
                    ? `Edit Picture 1. The subject is a woman. Keep her female, feminine, and recognizable, with the same exact face, age, skin tone, and feminine body. Replace her source hairstyle, clothing, and background. Give her one exact authentic ${decade} ${selectedHairstyles.woman[decade]}; reproduce that named hairstyle's defining construction without blending it with another cut. Preserve her natural hair color unless that style specifically requires color treatment. Freely choose varied era-appropriate clothing, accessories, and photographic treatment from: ${QWEN_DECADE_REIMAGININGS[decade].woman}. Place her clearly inside or immediately at a recognizable, fully detailed ${decade} ${selectedLocation}; this location is mandatory. No man, male anatomy, masculine face, menswear, or masculine styling. ${reimagineScene ? 'Use a completely new natural pose, camera angle, and framing.' : 'Keep the original pose and framing.'} Photorealistic.`
                    : subjectGender === 'man'
                        ? `Edit Picture 1. The subject is a man. Keep him male, masculine, and recognizable, with the same exact face, age, skin tone, and masculine body. Replace his source hairstyle, clothing, and background. Give him one exact authentic ${decade} ${selectedHairstyles.man[decade]}; reproduce that named hairstyle's defining construction without blending it with another cut. Preserve his natural hair color unless that style specifically requires color treatment. Freely choose varied era-appropriate clothing, accessories, and photographic treatment from: ${QWEN_DECADE_REIMAGININGS[decade].man}. Place him clearly inside or immediately at a recognizable, fully detailed ${decade} ${selectedLocation}; this location is mandatory. No woman, female anatomy, feminine face, breasts, makeup, dress, skirt, blouse, or feminine styling. ${reimagineScene ? 'Use a completely new natural pose, camera angle, and framing.' : 'Keep the original pose and framing.'} Photorealistic.`
                        : `Edit Picture 1 while preserving the same recognizable subject, exact face, age, skin tone, anatomy, and gender presentation. Replace the source hairstyle, clothing, and background with authentic ${decade} styling. Choose varied period-appropriate hair, clothing, accessories, and photographic treatment. Place the subject clearly inside or immediately at a recognizable, fully detailed ${decade} ${selectedLocation}; this location is mandatory. ${reimagineScene ? 'Use a completely new natural pose, camera angle, and framing.' : 'Keep the original pose and framing.'} Photorealistic.`
                : selectedTheme === 'hairstyles'
                    ? subjectGender === 'woman'
                        ? `Edit only the hair in Picture 1. The subject is a woman; keep her female, feminine, and recognizable. Replace the source hairstyle completely with one exact authentic ${decade} ${selectedHairstyles.woman[decade]}. Reproduce the defining silhouette, hairline, part, length, volume, texture, strand direction, curls or waves, bangs, and styling construction of that named hairstyle. Do not blend it with another hairstyle or retain the source haircut. Preserve her natural hair color unless the named style specifically requires a color treatment. Preserve her exact face, feminine features, body, skin, expression, existing eyewear state, clothing, pose, framing, lighting, and background pixel-faithfully. Photorealistic professional hair edit.`
                        : `Edit only the hair in Picture 1. The subject is a man; keep him male, masculine, and recognizable. Replace the source hairstyle completely with one exact authentic ${decade} ${selectedHairstyles.man[decade]}. Reproduce the defining silhouette, hairline, part, length, volume, texture, strand direction, curls or waves, fringe, and styling construction of that named hairstyle. Do not blend it with another hairstyle or retain the source haircut. Preserve his natural hair color unless the named style specifically requires a color treatment. Preserve his exact face, masculine features, body, skin, expression, facial hair, existing eyewear state, clothing, pose, framing, lighting, and background pixel-faithfully. Photorealistic professional hair edit.`
                : selectedTheme === 'superhero'
                    ? subjectGender === 'woman'
                        ? `Edit Picture 1. The subject is one adult woman. Keep her female, feminine, and recognizable. Transform this same woman into a completely original comic-book heroine in ${SUPERHERO_COMIC_STYLES[decade]}. Preserve her face, age, skin tone, natural jawline, and feminine body proportions. Create an asymmetric costume led by emerald, gold, ivory, magenta, silver, or black, with an abstract geometric non-letter emblem, original powers, action pose, and city cover unique to her. When Picture 1 has bare eyes, keep both eyes fully visible without glasses, frames, lenses, goggles, mask, visor, or eye accessory. Hand-drawn comic illustration only.`
                        : `Edit Picture 1. The subject is a man. Keep him male, masculine, and recognizable. Transform him into an original comic-book hero in ${SUPERHERO_COMIC_STYLES[decade]}. Preserve his face, age, skin tone, and masculine body proportions. Create a unique costume, emblem, powers, action pose, and city cover without copying an existing hero. Hand-drawn comic illustration only.`
                    : finalFluxPrompt;
            const finalQwenPrompt = selectedTheme === 'decades'
                ? `${qwenPrompt} ${hairColorPrompt} ${selectedClothingPrompt} ${selectedCameraPrompt} ${selectedPhotoStylePrompt} ${facialIdentityPrompt} ${selectedLocationPrompt}`
                : selectedTheme === 'hairstyles'
                    ? `${qwenPrompt} ${hairColorPrompt} ${facialIdentityPrompt}`
                    : qwenPrompt;
            return generateQwenPastForwardImage(
                uploadedFile,
                finalQwenPrompt,
                generationOptions,
                selectedTheme === 'historical',
                (message, value) => setGenerationProgress(current => ({ ...current, [decade]: { value, message } })),
            );
        }
        const fluxGenerationOptions = (reimagineScene && selectedTheme === 'decades') || selectedTheme === 'historical'
            ? { ...generationOptions, comfyFlux2EditIdentityReferenceWeight: generationOptions.pastForwardReimagineIdentityWeight ?? 2 }
            : generationOptions;
        return generateComfyUIPastForwardImage(
            uploadedFile,
            finalFluxPrompt,
            fluxGenerationOptions,
            selectedTheme === 'decades' || selectedTheme === 'historical' || (!reimagineScene && selectedTheme !== 'hairstyles' && selectedTheme !== 'fantasy' && selectedTheme !== 'superhero'),
            selectedTheme !== 'superhero',
            selectedTheme === 'historical',
            (message, value) => setGenerationProgress(current => ({ ...current, [decade]: { value, message } })),
        );
    };

    const toggleDecade = (decade: string) => {
        if (isGenerating) return;
        setSelectedDecades(current => DECADES.filter(item => item === decade ? !current.includes(item) : current.includes(item)));
        setAlbumSaveStatus('idle');
    };

    const randomizeHairstyles = () => {
        if (!subjectGender || isGenerating) return;
        setSelectedHairstyles(current => {
            const currentGenderSelections = current[subjectGender];
            const randomized = Object.fromEntries(DECADES.map(decade => {
                const alternatives = HAIRSTYLE_CATALOG[decade][subjectGender].filter(hairstyle => hairstyle !== currentGenderSelections[decade]);
                return [decade, alternatives[Math.floor(Math.random() * alternatives.length)] || currentGenderSelections[decade]];
            }));
            return { ...current, [subjectGender]: randomized };
        });
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const randomizeLocations = () => {
        if (isGenerating) return;
        const audience: LocationAudience = subjectGender === 'woman' ? 'female' : subjectGender === 'man' ? 'male' : 'both';
        setSelectedLocations(current => {
            const currentAudienceSelections = current[audience];
            const randomized = Object.fromEntries(DECADES.map(decade => {
                const alternatives = LOCATION_CATALOG[decade][audience].filter(location => location !== currentAudienceSelections[decade]);
                return [decade, alternatives[Math.floor(Math.random() * alternatives.length)] || currentAudienceSelections[decade]];
            }));
            return { ...current, [audience]: randomized };
        });
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const randomizeClothing = () => {
        if (isGenerating) return;
        const audience: ClothingAudience = subjectGender === 'woman' ? 'female' : subjectGender === 'man' ? 'male' : 'both';
        setSelectedClothing(current => {
            const currentAudienceSelections = current[audience];
            const randomized = Object.fromEntries(DECADES.map(decade => {
                const alternatives = CLOTHING_CATALOG[decade][audience].filter(outfit => outfit !== currentAudienceSelections[decade]);
                return [decade, alternatives[Math.floor(Math.random() * alternatives.length)] || currentAudienceSelections[decade]];
            }));
            return { ...current, [audience]: randomized };
        });
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const randomizePhotoTypes = () => {
        if (isGenerating) return;
        setSelectedPhotoTypes(current => Object.fromEntries(DECADES.map(decade => {
            const alternatives = PHOTO_TYPE_CATALOG[decade].filter(style => style !== current[decade]);
            return [decade, alternatives[Math.floor(Math.random() * alternatives.length)] || current[decade]];
        })));
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const randomizeShotAngles = () => {
        if (isGenerating) return;
        setSelectedShotAngles(current => Object.fromEntries(DECADES.map(decade => {
            const alternatives = SHOT_ANGLE_CATALOG.filter(angle => angle !== current[decade]);
            return [decade, alternatives[Math.floor(Math.random() * alternatives.length)] || current[decade]];
        })));
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const randomizeHistoricalCameos = () => {
        if (isGenerating) return;
        setSelectedHistoricalCameos(current => Object.fromEntries(DECADES.map(decade => {
            const alternatives = HISTORICAL_CAMEO_CATALOG[decade].filter(cameo => cameo.year !== current[decade]);
            const selected = alternatives[Math.floor(Math.random() * alternatives.length)] || getHistoricalCameo(decade, current[decade]);
            return [decade, selected.year];
        })));
        setSaveStatuses({});
        setAlbumSaveStatus('idle');
    };

    const handleGenerateClick = async () => {
        if (!uploadedImageBase64 || selectedDecades.length === 0) return;
        if (requiresSubjectGender && !subjectGender) return;

        const activeDecades = [...selectedDecades];
        setIsGenerating(true);
        setGenerationDecades(activeDecades);
        setGenerationProgress(Object.fromEntries(activeDecades.map(decade => [decade, { value: 0, message: 'Queued' }])));
        
        setGeneratedImages(prev => {
            const next = { ...prev };
            activeDecades.forEach(decade => next[decade] = { status: 'pending' });
            return next;
        });

        const concurrencyLimit = 2;
        const decadesQueue = [...activeDecades];

        const processDecade = async (decade: string) => {
            try {
                setGenerationProgress(current => ({ ...current, [decade]: { value: 0.02, message: `Starting ${decade}...` } }));
                const prompt = THEMES[selectedTheme].prompt(decade);
                const resultUrl = await generatePastForwardImage(prompt, THEMES[selectedTheme].fluxPrompt(decade, reimagineScene), decade);
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'done', url: resultUrl },
                }));
                setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} complete` } }));
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
                setGeneratedImages(prev => ({
                    ...prev,
                    [decade]: { status: 'error', error: errorMessage },
                }));
                setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} failed` } }));
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(async () => {
            while (decadesQueue.length > 0) {
                const decade = decadesQueue.shift();
                if (decade) {
                    await processDecade(decade);
                }
            }
        });

        await Promise.all(workers);
        setIsGenerating(false);
    };

    const handleRegenerateDecade = async (decade: string) => {
        if (!uploadedImageBase64) return;
        if (requiresSubjectGender && !subjectGender) return;
        if (!selectedDecades.includes(decade)) return;
        if (generatedImages[decade]?.status === 'pending') return;
        
        setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        
        setGeneratedImages(prev => ({
            ...prev,
            [decade]: { status: 'pending' },
        }));
        setGenerationDecades(current => current.includes(decade) ? current : [...current, decade]);
        setGenerationProgress(current => ({ ...current, [decade]: { value: 0.02, message: `Starting ${decade}...` } }));

        try {
            const prompt = THEMES[selectedTheme].prompt(decade);
            const resultUrl = await generatePastForwardImage(prompt, THEMES[selectedTheme].fluxPrompt(decade, reimagineScene), decade);
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'done', url: resultUrl },
            }));
            setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} complete` } }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
            setGeneratedImages(prev => ({
                ...prev,
                [decade]: { status: 'error', error: errorMessage },
            }));
            setGenerationProgress(current => ({ ...current, [decade]: { value: 1, message: `${decade} failed` } }));
        }
    };

    const handleSaveIndividualImage = async (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status !== 'done' || !image.url || !uploadedImageBase64) return;

        setSaveStatuses(prev => ({ ...prev, [decade]: 'saving' }));
        try {
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward - ${decade} (${THEMES[selectedTheme].title})`,
                media: image.url,
                thumbnail: await dataUrlToThumbnail(image.url, 256),
                sourceImage: uploadedImageBase64
            };
            await dispatch(addToLibrary(item)).unwrap();
            setSaveStatuses(prev => ({ ...prev, [decade]: 'saved' }));
        } catch (err) {
            console.error("Failed to save image:", err);
            setSaveStatuses(prev => ({ ...prev, [decade]: 'idle' }));
        }
    };

    const handleDownloadIndividualImage = (decade: string) => {
        const image = generatedImages[decade];
        if (image?.status === 'done' && image.url) {
            const link = document.createElement('a');
            link.href = image.url;
            link.download = `past-forward-${decade}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const getCompletedImages = () => {
        return (Object.entries(generatedImages) as [string, GeneratedImage][])
            .filter(([decade, image]) => selectedDecades.includes(decade) && image.status === 'done' && image.url)
            .reduce((acc, [decade, image]) => {
                acc[decade] = image.url!;
                return acc;
            }, {} as Record<string, string>);
    };

    const handleDownloadAlbum = async () => {
        const imageData = getCompletedImages();
        if (selectedDecades.length === 0 || Object.keys(imageData).length < selectedDecades.length) {
            alert("Please wait for all selected decades to finish generating.");
            return;
        }

        setIsCreatingAlbum(true);
        try {
            const albumDataUrl = await createAlbumPage(imageData);
            const link = document.createElement('a');
            link.href = albumDataUrl;
            link.download = 'past-forward-album.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Album error:", error);
            alert("Error creating album.");
        } finally {
            setIsCreatingAlbum(false);
        }
    };

    const handleSaveAlbum = async () => {
        const imageData = getCompletedImages();
        if (selectedDecades.length === 0 || Object.keys(imageData).length < selectedDecades.length) {
            alert("Please wait for all selected decades to finish generating.");
            return;
        }

        setAlbumSaveStatus('saving');
        try {
            const albumDataUrl = await createAlbumPage(imageData);
            const item = {
                mediaType: 'past-forward-photo' as const,
                name: `Past Forward Album (${THEMES[selectedTheme].title})`,
                media: albumDataUrl,
                thumbnail: await dataUrlToThumbnail(albumDataUrl, 256),
                sourceImage: uploadedImageBase64!
            };
            await dispatch(addToLibrary(item)).unwrap();
            setAlbumSaveStatus('saved');
        } catch (error) {
            console.error("Album save error:", error);
            setAlbumSaveStatus('idle');
        }
    };

    const providerReady = provider === 'gemini'
        ? !!getApiKey()
        : provider === 'mammouth'
            ? !!isMammouthConnected
        : !!isComfyUIConnected && missingNodes.length === 0;
    const isReadyToGenerate = !!uploadedImageBase64 && !!uploadedFile && selectedDecades.length > 0 && providerReady && !isGenerating && (!requiresSubjectGender || !!subjectGender);
    const hasResults = selectedDecades.some(decade => generatedImages[decade]?.status === 'done');
    const selectedResultsComplete = selectedDecades.length > 0 && selectedDecades.every(decade => generatedImages[decade]?.status === 'done');
    const runningDecades = generationDecades.filter(decade => generatedImages[decade]?.status === 'pending');
    const failedDecades = generationDecades.filter(decade => generatedImages[decade]?.status === 'error');
    const completedGenerationCount = generationDecades.filter(decade => generatedImages[decade]?.status === 'done' || generatedImages[decade]?.status === 'error').length;
    const overallProgress = generationDecades.length > 0
        ? generationDecades.reduce((total, decade) => total + (generationProgress[decade]?.value || 0), 0) / generationDecades.length
        : 0;
    const activeQwenLoraName = (generationOptions.comfyQwenEditLora1Name || '').toLowerCase();
    const qwenLightningPreset = activeQwenLoraName.includes('lightning') && activeQwenLoraName.includes('4step') && generationOptions.pastForwardQwenSteps === 4
        ? 4
        : activeQwenLoraName.includes('lightning') && activeQwenLoraName.includes('8step') && generationOptions.pastForwardQwenSteps === 8
            ? 8
            : null;
    const selectQwenLightningPreset = (steps: 4 | 8) => {
        const installedLora = qwenLoras.find(name => {
            const normalizedName = name.toLowerCase();
            return normalizedName.includes('qwen') && normalizedName.includes('lightning') && normalizedName.includes(`${steps}step`);
        });
        dispatch(updateOptions({
            comfyQwenEditUseLora: true,
            comfyQwenEditLora1Name: installedLora || QWEN_LIGHTNING_PRESETS[steps],
            comfyQwenEditLora1Strength: 1,
            pastForwardQwenSteps: steps,
        }));
    };
    const providerLabel = provider === 'comfyui' ? 'FLUX2' : provider === 'qwen' ? 'QWEN-Edit' : provider === 'gemini' ? 'Gemini' : 'Mammouth';

    return (
        <div className="space-y-6">
            {zoomedImage && <div className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${zoomedImage.decade} full-size result`} onClick={() => setZoomedImage(null)}>
                <img src={zoomedImage.url} alt={`Past Forward ${zoomedImage.decade} full-size result`} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" onClick={event => event.stopPropagation()} />
            </div>}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-primary bg-bg-secondary p-3">
                <span className="text-sm font-semibold text-text-secondary">Past Forward engine</span>
                <div className="flex gap-1 rounded-md bg-bg-tertiary p-1">
                    <button type="button" onClick={() => dispatch(updateOptions({ pastForwardProvider: 'comfyui' }))} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'comfyui' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>FLUX2</button>
                    <button type="button" onClick={() => dispatch(updateOptions({ pastForwardProvider: 'qwen' }))} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'qwen' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>QWEN-Edit</button>
                    <button type="button" onClick={() => dispatch(updateOptions({ pastForwardProvider: 'gemini' }))} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'gemini' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Gemini</button>
                    <button type="button" onClick={() => dispatch(updateOptions({ pastForwardProvider: 'mammouth' }))} disabled={isGenerating} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'mammouth' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Mammouth</button>
                </div>
                {provider === 'gemini' && <div className="grid min-w-[240px] flex-1 gap-2 sm:grid-cols-3">
                    <div className="relative sm:col-span-2">
                        <select value={generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL} onChange={(event) => dispatch(updateOptions({ geminiT2IModel: event.target.value }))} disabled={isGenerating || isLoadingGeminiModels} className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2 pr-8 text-sm" aria-label="Gemini image model">
                            {geminiModels.map(model => <option key={model} value={model}>{model}</option>)}
                        </select>
                        {isLoadingGeminiModels && <SpinnerIcon className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-text-muted" />}
                    </div>
                    <select value={generationOptions.geminiImageSize || '1K'} onChange={(event) => dispatch(updateOptions({ geminiImageSize: event.target.value as typeof generationOptions.geminiImageSize }))} disabled={isGenerating} className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" aria-label="Gemini image size">
                        {getGeminiImageSizes(generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL).map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                    {supportsGeminiThinkingLevel(generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) && <select value={generationOptions.geminiThinkingLevel || 'minimal'} onChange={(event) => dispatch(updateOptions({ geminiThinkingLevel: event.target.value as typeof generationOptions.geminiThinkingLevel }))} disabled={isGenerating} className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm sm:col-span-3" aria-label="Gemini thinking level">
                        <option value="minimal">Minimal thinking</option>
                        <option value="high">High thinking</option>
                    </select>}
                </div>}
                {provider === 'mammouth' && <div className="relative min-w-[240px] flex-1">
                    <select value={generationOptions.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} onChange={(event) => dispatch(updateOptions({ mammouthImageModel: event.target.value }))} disabled={isGenerating || isLoadingMammouthModels} className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2 pr-8 text-sm" aria-label="Mammouth image model">
                        {mammouthModels.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                    {isLoadingMammouthModels && <SpinnerIcon className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-text-muted" />}
                </div>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* LEFT COLUMN: Controls */}
            <div className="lg:col-span-1 space-y-8">
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <PastForwardIcon className="w-8 h-8 text-accent" />
                        <h2 className="text-xl font-bold text-accent">1. Source & Theme</h2>
                    </div>

                    <div className="space-y-6">
                        <ImageUploader 
                            label="Upload Source Photo" 
                            id="past-forward-upload"
                            onImageUpload={handleImageUpload}
                            sourceFile={uploadedFile}
                        />
                        <button type="button" onClick={() => setIsLibraryOpen(true)} disabled={isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50">
                            <LibraryIcon className="h-4 w-4" /> Choose from Library
                        </button>

                        {provider === 'comfyui' && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <button type="button" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:text-accent" aria-expanded={advancedOpen}>
                                <span>FLUX2 Advanced Settings</span><span>{advancedOpen ? '−' : '+'}</span>
                            </button>
                            {advancedOpen && <div className="space-y-4 border-t border-border-primary p-4">
                                <SelectInput label="FLUX2 Model" value={generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditUnet: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf', models)} disabled={isGenerating} />
                                <SelectInput label="CLIP" value={generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditClip: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors', clips)} disabled={isGenerating} />
                                <SelectInput label="VAE" value={generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditVae: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors', vaes)} disabled={isGenerating} />
                                <SelectInput label="Sampler" value={generationOptions.comfyFlux2EditSampler || 'euler'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditSampler: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditSampler || 'euler', samplers)} disabled={isGenerating} />
                                <NumberSlider label={`Source Megapixels: ${generationOptions.comfyFlux2EditMegapixels ?? 1}`} value={generationOptions.comfyFlux2EditMegapixels ?? 1} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditMegapixels: Number(event.target.value) }))} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`Identity Reference Weight: ${generationOptions.comfyFlux2EditIdentityReferenceWeight ?? 3}`} value={generationOptions.comfyFlux2EditIdentityReferenceWeight ?? 3} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditIdentityReferenceWeight: Number(event.target.value) }))} min={1} max={4} step={1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`Reimagine Identity Weight: ${generationOptions.pastForwardReimagineIdentityWeight ?? 2}`} value={generationOptions.pastForwardReimagineIdentityWeight ?? 2} onChange={(event) => dispatch(updateOptions({ pastForwardReimagineIdentityWeight: Number(event.target.value) }))} min={1} max={4} step={1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`Steps: ${generationOptions.comfyFlux2EditSteps ?? 4}`} value={generationOptions.comfyFlux2EditSteps ?? 4} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditSteps: Number(event.target.value) }))} min={1} max={40} step={1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`CFG: ${generationOptions.comfyFlux2EditCfg ?? 1}`} value={generationOptions.comfyFlux2EditCfg ?? 1} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCfg: Number(event.target.value) }))} min={0.1} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={!!generationOptions.comfyFlux2EditUseCacheDit} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditUseCacheDit: event.target.checked }))} disabled={isGenerating} className="rounded text-accent focus:ring-accent" />Enable CacheDiT Accelerator</label>
                                {generationOptions.comfyFlux2EditUseCacheDit && <div className="space-y-4">
                                    <SelectInput label="CacheDiT Model Type" value={generationOptions.comfyFlux2EditCacheDitModelType || 'Auto'} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitModelType: event.target.value }))} options={withCurrent(generationOptions.comfyFlux2EditCacheDitModelType || 'Auto', cacheDitModels)} disabled={isGenerating} />
                                    <NumberSlider label={`Warmup: ${generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitWarmupSteps: Number(event.target.value) }))} min={0} max={20} step={1} disabled={isGenerating} allowDirectInput />
                                    <NumberSlider label={`Skip: ${generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0} onChange={(event) => dispatch(updateOptions({ comfyFlux2EditCacheDitSkipInterval: Number(event.target.value) }))} min={0} max={10} step={1} disabled={isGenerating} allowDirectInput />
                                </div>}
                            </div>}
                        </div>}

                        {provider === 'qwen' && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <button type="button" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:text-accent" aria-expanded={advancedOpen}>
                                <span>QWEN-Edit Advanced Settings</span><span>{advancedOpen ? '−' : '+'}</span>
                            </button>
                            {advancedOpen && <div className="space-y-4 border-t border-border-primary p-4">
                                <div className="space-y-2">
                                    <span className="block text-sm font-medium text-text-secondary">Lightning preset</span>
                                    <div className="grid grid-cols-2 gap-1 rounded-md bg-bg-tertiary p-1">
                                        {([4, 8] as const).map(steps => <button key={steps} type="button" onClick={() => selectQwenLightningPreset(steps)} disabled={isGenerating} className={`rounded px-3 py-2 text-xs font-bold transition-colors ${qwenLightningPreset === steps ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>{steps}-step</button>)}
                                    </div>
                                    <p className="text-xs text-text-muted">Changes the Lightning LoRA and sampling steps together.</p>
                                </div>
                                <SelectInput label="Qwen Edit Model" value={generationOptions.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyQwenEditUnet: event.target.value }))} options={withCurrent(generationOptions.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', qwenModels)} disabled={isGenerating} />
                                <SelectInput label="CLIP" value={generationOptions.comfyQwenEditClip || 'qwen_2.5_vl_7b_fp8_scaled.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyQwenEditClip: event.target.value }))} options={withCurrent(generationOptions.comfyQwenEditClip || 'qwen_2.5_vl_7b_fp8_scaled.safetensors', clips)} disabled={isGenerating} />
                                <SelectInput label="VAE" value={generationOptions.comfyQwenEditVae || 'qwen_image_vae.safetensors'} onChange={(event) => dispatch(updateOptions({ comfyQwenEditVae: event.target.value }))} options={withCurrent(generationOptions.comfyQwenEditVae || 'qwen_image_vae.safetensors', vaes)} disabled={isGenerating} />
                                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={generationOptions.comfyQwenEditUseLora !== false} onChange={(event) => dispatch(updateOptions({ comfyQwenEditUseLora: event.target.checked }))} disabled={isGenerating} className="rounded text-accent focus:ring-accent" />Enable Lightning LoRA</label>
                                {generationOptions.comfyQwenEditUseLora !== false && <>
                                    <SelectInput label="Lightning LoRA" value={generationOptions.comfyQwenEditLora1Name || QWEN_LIGHTNING_PRESETS[8]} onChange={(event) => dispatch(updateOptions({ comfyQwenEditLora1Name: event.target.value }))} options={withCurrent(generationOptions.comfyQwenEditLora1Name || QWEN_LIGHTNING_PRESETS[8], qwenLoras)} disabled={isGenerating} />
                                    <NumberSlider label={`LoRA Strength: ${generationOptions.comfyQwenEditLora1Strength ?? 1}`} value={generationOptions.comfyQwenEditLora1Strength ?? 1} onChange={(event) => dispatch(updateOptions({ comfyQwenEditLora1Strength: Number(event.target.value) }))} min={0} max={2} step={0.05} disabled={isGenerating} allowDirectInput />
                                </>}
                                <SelectInput label="Sampler" value={generationOptions.pastForwardQwenSampler || 'euler_ancestral'} onChange={(event) => dispatch(updateOptions({ pastForwardQwenSampler: event.target.value }))} options={withCurrent(generationOptions.pastForwardQwenSampler || 'euler_ancestral', samplers)} disabled={isGenerating} />
                                <SelectInput label="Scheduler" value={generationOptions.pastForwardQwenScheduler || 'beta57'} onChange={(event) => dispatch(updateOptions({ pastForwardQwenScheduler: event.target.value }))} options={withCurrent(generationOptions.pastForwardQwenScheduler || 'beta57', getOptions(comfyUIObjectInfo?.KSampler?.input?.required?.scheduler))} disabled={isGenerating} />
                                <NumberSlider label={`Source Megapixels: ${generationOptions.comfyQwenEditMegapixels ?? 1}`} value={generationOptions.comfyQwenEditMegapixels ?? 1} onChange={(event) => dispatch(updateOptions({ comfyQwenEditMegapixels: Number(event.target.value) }))} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`AuraFlow Shift: ${generationOptions.comfyQwenEditShift ?? 2.5}`} value={generationOptions.comfyQwenEditShift ?? 2.5} onChange={(event) => dispatch(updateOptions({ comfyQwenEditShift: Number(event.target.value) }))} min={0} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`Steps: ${generationOptions.pastForwardQwenSteps ?? 8}`} value={generationOptions.pastForwardQwenSteps ?? 8} onChange={(event) => dispatch(updateOptions({ pastForwardQwenSteps: Number(event.target.value) }))} min={1} max={40} step={1} disabled={isGenerating} allowDirectInput />
                                <NumberSlider label={`CFG: ${generationOptions.pastForwardQwenCfg ?? 1}`} value={generationOptions.pastForwardQwenCfg ?? 1} onChange={(event) => dispatch(updateOptions({ pastForwardQwenCfg: Number(event.target.value) }))} min={0.1} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                            </div>}
                        </div>}

                        <div className="rounded-md border border-border-primary bg-bg-primary">
                            <button
                                type="button"
                                onClick={() => setThemesOpen(open => !open)}
                                className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:text-accent"
                                aria-expanded={themesOpen}
                                aria-controls="past-forward-themes"
                            >
                                <span>Select Journey Theme</span>
                                <span aria-hidden="true">{themesOpen ? '−' : '+'}</span>
                            </button>
                            {themesOpen && <div id="past-forward-themes" className="grid grid-cols-1 gap-2 border-t border-border-primary p-3">
                                {Object.entries(THEMES).map(([key, theme]) => (
                                    <button
                                        key={key}
                                        onClick={() => setSelectedTheme(key)}
                                        disabled={isGenerating}
                                        className={`p-3 rounded-lg text-left transition-all duration-200 border ${
                                            selectedTheme === key 
                                                ? 'bg-accent/10 border-accent shadow-sm' 
                                                : 'bg-bg-tertiary border-transparent hover:bg-bg-tertiary-hover'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`font-bold text-sm ${selectedTheme === key ? 'text-accent' : 'text-text-primary'}`}>
                                                {theme.title}
                                            </span>
                                            {selectedTheme === key && <CheckIcon className="w-4 h-4 text-accent" />}
                                        </div>
                                        <p className="text-xs text-text-muted mt-1 line-clamp-2">
                                            {theme.description}
                                        </p>
                                    </button>
                                ))}
                            </div>}
                        </div>

                        {(requiresSubjectGender || (selectedTheme === 'decades' && !isCloudProvider)) && <div>
                            <label className="mb-2 block text-sm font-medium text-text-secondary">
                                Subject Identity{selectedTheme === 'decades' && !requiresSubjectGender ? ' (optional)' : ''}
                            </label>
                            <div className="grid grid-cols-2 gap-2 rounded-md border border-border-primary bg-bg-tertiary p-1">
                                {(['woman', 'man'] as const).map(gender => <button
                                    key={gender}
                                    type="button"
                                    onClick={() => setSubjectGender(current => selectedTheme === 'decades' && current === gender ? null : gender)}
                                    disabled={isGenerating}
                                    className={`rounded px-3 py-2 text-sm font-bold transition-colors ${subjectGender === gender ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}
                                >
                                    {gender === 'woman' ? 'Woman' : 'Man'}
                                </button>)}
                            </div>
                        </div>}

                        {((selectedTheme === 'decades' && !isCloudProvider) || selectedTheme === 'historical') && <div className="grid gap-2 sm:grid-cols-2">
                            <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${sourceWearsGlasses ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'hover:border-accent'}`}>
                                <input
                                    type="checkbox"
                                    checked={sourceWearsGlasses}
                                    onChange={(event) => { setSourceWearsGlasses(event.target.checked); setSaveStatuses({}); setAlbumSaveStatus('idle'); }}
                                    disabled={isGenerating}
                                    className="rounded border-border-primary text-accent focus:ring-accent"
                                />
                                <span className="text-sm font-semibold text-text-secondary">Source wears glasses</span>
                            </label>
                            <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${sourceHasFacialHair ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'hover:border-accent'}`}>
                                <input
                                    type="checkbox"
                                    checked={sourceHasFacialHair}
                                    onChange={(event) => { setSourceHasFacialHair(event.target.checked); setSaveStatuses({}); setAlbumSaveStatus('idle'); }}
                                    disabled={isGenerating}
                                    className="rounded border-border-primary text-accent focus:ring-accent"
                                />
                                <span className="text-sm font-semibold text-text-secondary">Source has beard or moustache</span>
                            </label>
                        </div>}

                        {(selectedTheme === 'hairstyles' || selectedTheme === 'decades') && !isCloudProvider && subjectGender && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <div className="flex items-center gap-2 px-4 py-2">
                                <button
                                    type="button"
                                    onClick={() => setHairstylesOpen(open => !open)}
                                    className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                    aria-expanded={hairstylesOpen}
                                    aria-controls="past-forward-hairstyles"
                                >
                                    <span>Hairstyle by Decade</span>
                                    <span aria-hidden="true">{hairstylesOpen ? '−' : '+'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={randomizeHairstyles}
                                    disabled={isGenerating}
                                    title="Randomize all hairstyles"
                                    aria-label="Randomize all hairstyles"
                                    className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <DiceIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {hairstylesOpen && <div id="past-forward-hairstyles" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                <label className="mb-3 flex cursor-pointer items-center gap-2 rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-xs font-semibold text-text-secondary">
                                    <input
                                        type="checkbox"
                                        checked={varyHairColor}
                                        onChange={(event) => { setVaryHairColor(event.target.checked); setSaveStatuses({}); setAlbumSaveStatus('idle'); }}
                                        disabled={isGenerating}
                                        className="rounded border-border-primary text-accent focus:ring-accent"
                                    />
                                    Vary hair color with era-plausible colors
                                </label>
                                {DECADES.map(decade => <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                    <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                    <select
                                        value={selectedHairstyles[subjectGender][decade]}
                                        onChange={(event) => {
                                            const hairstyle = event.target.value;
                                            setSelectedHairstyles(current => ({
                                                ...current,
                                                [subjectGender]: { ...current[subjectGender], [decade]: hairstyle },
                                            }));
                                            setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                            setAlbumSaveStatus('idle');
                                        }}
                                        disabled={isGenerating}
                                        className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                        aria-label={`${decade} ${subjectGender} hairstyle`}
                                    >
                                        {HAIRSTYLE_CATALOG[decade][subjectGender].map(hairstyle => <option key={hairstyle} value={hairstyle}>{hairstyle}</option>)}
                                    </select>
                                </label>)}
                            </div>}
                        </div>}

                        {selectedTheme === 'historical' && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <div className="flex items-center gap-2 px-4 py-2">
                                <button
                                    type="button"
                                    onClick={() => setHistoricalCameosOpen(open => !open)}
                                    className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                    aria-expanded={historicalCameosOpen}
                                    aria-controls="past-forward-historical-cameos"
                                >
                                    <span>Historical Event by Decade</span>
                                    <span aria-hidden="true">{historicalCameosOpen ? '−' : '+'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={randomizeHistoricalCameos}
                                    disabled={isGenerating}
                                    title="Randomize all historical events"
                                    aria-label="Randomize all historical events"
                                    className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <DiceIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {historicalCameosOpen && <div id="past-forward-historical-cameos" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                {DECADES.map(decade => <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                    <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                    <select
                                        value={selectedHistoricalCameos[decade]}
                                        onChange={(event) => {
                                            setSelectedHistoricalCameos(current => ({ ...current, [decade]: Number(event.target.value) }));
                                            setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                            setAlbumSaveStatus('idle');
                                        }}
                                        disabled={isGenerating}
                                        className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                        aria-label={`${decade} historical event`}
                                    >
                                        {HISTORICAL_CAMEO_CATALOG[decade].map(cameo => <option key={cameo.year} value={cameo.year}>{cameo.year} · {cameo.event}</option>)}
                                    </select>
                                </label>)}
                            </div>}
                        </div>}

                        {selectedTheme === 'decades' && !isCloudProvider && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <div className="flex items-center gap-2 px-4 py-2">
                                <button
                                    type="button"
                                    onClick={() => setClothingOpen(open => !open)}
                                    className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                    aria-expanded={clothingOpen}
                                    aria-controls="past-forward-clothing"
                                >
                                    <span>Clothing by Decade · {subjectGender === 'woman' ? 'Woman' : subjectGender === 'man' ? 'Man' : 'Both'}</span>
                                    <span aria-hidden="true">{clothingOpen ? '−' : '+'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={randomizeClothing}
                                    disabled={isGenerating}
                                    title="Randomize all clothing"
                                    aria-label="Randomize all clothing"
                                    className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <DiceIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {clothingOpen && <div id="past-forward-clothing" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                {DECADES.map(decade => {
                                    const audience: ClothingAudience = subjectGender === 'woman' ? 'female' : subjectGender === 'man' ? 'male' : 'both';
                                    return <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                        <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                        <select
                                            value={selectedClothing[audience][decade]}
                                            onChange={(event) => {
                                                const outfit = event.target.value;
                                                setSelectedClothing(current => ({
                                                    ...current,
                                                    [audience]: { ...current[audience], [decade]: outfit },
                                                }));
                                                setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                                setAlbumSaveStatus('idle');
                                            }}
                                            disabled={isGenerating}
                                            className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                            aria-label={`${decade} ${audience} clothing`}
                                        >
                                            {CLOTHING_CATALOG[decade][audience].map(outfit => <option key={outfit} value={outfit}>{outfit}</option>)}
                                        </select>
                                    </label>;
                                })}
                            </div>}
                        </div>}

                        {selectedTheme === 'decades' && !isCloudProvider && <div className="rounded-md border border-border-primary bg-bg-primary">
                            <div className="flex items-center gap-2 px-4 py-2">
                                <button
                                    type="button"
                                    onClick={() => setLocationsOpen(open => !open)}
                                    className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                    aria-expanded={locationsOpen}
                                    aria-controls="past-forward-locations"
                                >
                                    <span>Location by Decade · {subjectGender === 'woman' ? 'Woman' : subjectGender === 'man' ? 'Man' : 'Both'}</span>
                                    <span aria-hidden="true">{locationsOpen ? '−' : '+'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={randomizeLocations}
                                    disabled={isGenerating}
                                    title="Randomize all locations"
                                    aria-label="Randomize all locations"
                                    className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <DiceIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {locationsOpen && <div id="past-forward-locations" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                {DECADES.map(decade => {
                                    const audience: LocationAudience = subjectGender === 'woman' ? 'female' : subjectGender === 'man' ? 'male' : 'both';
                                    return <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                        <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                        <select
                                            value={selectedLocations[audience][decade]}
                                            onChange={(event) => {
                                                const location = event.target.value;
                                                setSelectedLocations(current => ({
                                                    ...current,
                                                    [audience]: { ...current[audience], [decade]: location },
                                                }));
                                                setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                                setAlbumSaveStatus('idle');
                                            }}
                                            disabled={isGenerating}
                                            className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                            aria-label={`${decade} ${audience} location`}
                                        >
                                            {LOCATION_CATALOG[decade][audience].map(location => <option key={location} value={location}>{location}</option>)}
                                        </select>
                                    </label>;
                                })}
                            </div>}
                        </div>}

                        <label className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${reimagineScene ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-accent'}`}>
                            <input type="checkbox" checked={reimagineScene} onChange={(event) => { setReimagineScene(event.target.checked); setAlbumSaveStatus('idle'); }} disabled={isGenerating} className="mt-0.5 rounded border-border-primary text-accent focus:ring-accent" />
                            <span>
                                <span className={`block text-sm font-bold ${reimagineScene ? 'text-accent' : 'text-text-primary'}`}>Reimagine the scene</span>
                                <span className="mt-1 block text-xs text-text-muted">Create a new background, pose, framing, camera angle, lighting, and composition.</span>
                            </span>
                        </label>

                        {(selectedTheme === 'decades' || selectedTheme === 'historical') && !isCloudProvider && reimagineScene && <>
                            <div className="rounded-md border border-border-primary bg-bg-primary">
                                <div className="flex items-center gap-2 px-4 py-2">
                                    <button
                                        type="button"
                                        onClick={() => setPhotoTypesOpen(open => !open)}
                                        className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                        aria-expanded={photoTypesOpen}
                                        aria-controls="past-forward-photo-types"
                                    >
                                        <span>Photo Type by Decade</span>
                                        <span aria-hidden="true">{photoTypesOpen ? '−' : '+'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={randomizePhotoTypes}
                                        disabled={isGenerating}
                                        title="Randomize all photo types"
                                        aria-label="Randomize all photo types"
                                        className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <DiceIcon className="h-4 w-4" />
                                    </button>
                                </div>
                                {photoTypesOpen && <div id="past-forward-photo-types" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                    {DECADES.map(decade => <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                        <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                        <select
                                            value={selectedPhotoTypes[decade]}
                                            onChange={(event) => {
                                                setSelectedPhotoTypes(current => ({ ...current, [decade]: event.target.value }));
                                                setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                                setAlbumSaveStatus('idle');
                                            }}
                                            disabled={isGenerating}
                                            className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                            aria-label={`${decade} photo type`}
                                        >
                                            {PHOTO_TYPE_CATALOG[decade].map(photoType => <option key={photoType} value={photoType}>{photoType}</option>)}
                                        </select>
                                    </label>)}
                                </div>}
                            </div>

                            <div className="rounded-md border border-border-primary bg-bg-primary">
                                <div className="flex items-center gap-2 px-4 py-2">
                                    <button
                                        type="button"
                                        onClick={() => setShotAnglesOpen(open => !open)}
                                        className="flex min-w-0 flex-1 items-center justify-between py-1 text-left text-sm font-bold text-text-secondary hover:text-accent"
                                        aria-expanded={shotAnglesOpen}
                                        aria-controls="past-forward-shot-angles"
                                    >
                                        <span>Shot &amp; Angle by Decade</span>
                                        <span aria-hidden="true">{shotAnglesOpen ? '−' : '+'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={randomizeShotAngles}
                                        disabled={isGenerating}
                                        title="Randomize all shots and angles"
                                        aria-label="Randomize all shots and angles"
                                        className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <DiceIcon className="h-4 w-4" />
                                    </button>
                                </div>
                                {shotAnglesOpen && <div id="past-forward-shot-angles" className="space-y-2 border-t border-border-primary bg-bg-tertiary p-3">
                                    {DECADES.map(decade => <label key={decade} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2">
                                        <span className="text-xs font-bold text-text-secondary">{decade}</span>
                                        <select
                                            value={selectedShotAngles[decade]}
                                            onChange={(event) => {
                                                setSelectedShotAngles(current => ({ ...current, [decade]: event.target.value }));
                                                setSaveStatuses(current => ({ ...current, [decade]: 'idle' }));
                                                setAlbumSaveStatus('idle');
                                            }}
                                            disabled={isGenerating}
                                            className="min-w-0 rounded-md border border-border-primary bg-bg-primary px-2 py-2 text-xs text-text-primary focus:border-accent focus:ring-accent disabled:opacity-60"
                                            aria-label={`${decade} shot and angle`}
                                        >
                                            {SHOT_ANGLE_CATALOG.map(shotAngle => <option key={shotAngle} value={shotAngle}>{shotAngle}</option>)}
                                        </select>
                                    </label>)}
                                </div>}
                            </div>
                        </>}

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="text-sm font-medium text-text-secondary">Select Decades ({selectedDecades.length}/{DECADES.length})</label>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => { setSelectedDecades([...DECADES]); setAlbumSaveStatus('idle'); }} disabled={isGenerating || selectedDecades.length === DECADES.length} className="rounded px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40">Select All</button>
                                    <button type="button" onClick={() => { setSelectedDecades([]); setAlbumSaveStatus('idle'); }} disabled={isGenerating || selectedDecades.length === 0} className="rounded px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40">Deselect All</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {DECADES.map(decade => {
                                    const isSelected = selectedDecades.includes(decade);
                                    return <label key={decade} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${isSelected ? 'border-accent bg-accent/10 text-accent' : 'border-border-primary bg-bg-tertiary text-text-muted'} ${isGenerating ? 'cursor-not-allowed opacity-60' : 'hover:border-accent'}`}>
                                        <input type="checkbox" checked={isSelected} onChange={() => toggleDecade(decade)} disabled={isGenerating} className="rounded border-border-primary text-accent focus:ring-accent" />
                                        {decade}
                                    </label>;
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    {provider === 'comfyui' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use FLUX2 Past Forward.</p>}
                    {provider === 'qwen' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use QWEN-Edit Past Forward.</p>}
                    {provider === 'gemini' && !getApiKey() && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Configure Gemini to use Gemini Past Forward.</p>}
                    {provider === 'mammouth' && !isMammouthConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect Mammouth to use Mammouth Past Forward.</p>}
                    {!isCloudProvider && missingNodes.length > 0 && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
                    <button 
                        onClick={handleGenerateClick}
                        disabled={!isReadyToGenerate}
                        style={isReadyToGenerate ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                        className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                    >
                        {isGenerating ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}
                        {isGenerating ? 'Travelling Through Time...' : selectedDecades.length === 0 ? 'Select at least one decade' : requiresSubjectGender && !subjectGender ? 'Select Woman or Man' : `Generate ${selectedDecades.length} with ${providerLabel}`}
                    </button>
                </div>
            </div>

            {/* RIGHT COLUMN: Results */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                        <h2 className="text-xl font-bold text-accent">2. Time Travel Results</h2>
                        {hasResults && (
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleDownloadAlbum}
                                    disabled={isCreatingAlbum || !selectedResultsComplete}
                                    className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                                >
                                    {isCreatingAlbum ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <DownloadIcon className="w-4 h-4"/>}
                                    Download Album
                                </button>
                                <button 
                                    onClick={handleSaveAlbum}
                                    disabled={albumSaveStatus !== 'idle' || !selectedResultsComplete}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                                        albumSaveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover'
                                    }`}
                                >
                                    {albumSaveStatus === 'saving' ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : albumSaveStatus === 'saved' ? <CheckIcon className="w-4 h-4"/> : <SaveIcon className="w-4 h-4"/>}
                                    {albumSaveStatus === 'saved' ? 'Saved' : 'Save Album'}
                                </button>
                            </div>
                        )}
                    </div>

                    {generationDecades.length > 0 && <div className="mb-6 space-y-3 rounded-md border border-border-primary bg-bg-primary p-4">
                        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                            <span className="text-text-primary">Generation progress</span>
                            <span className="text-text-secondary">{completedGenerationCount}/{generationDecades.length}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary" role="progressbar" aria-label="Past Forward generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overallProgress * 100)}>
                            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round(overallProgress * 100)}%` }} />
                        </div>
                        {runningDecades.length > 0 && <p className="text-xs text-text-secondary">In progress: <span className="font-bold text-accent">{runningDecades.join(', ')}</span></p>}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {generationDecades.map(decade => {
                                const progress = generationProgress[decade] || { value: 0, message: 'Queued' };
                                return <div key={decade} className="rounded border border-border-primary bg-bg-secondary px-3 py-2">
                                    <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-bold text-text-primary">{decade}</span><span className="text-text-muted">{Math.round(progress.value * 100)}%</span></div>
                                    <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary"><div className={`h-full transition-all duration-300 ${generatedImages[decade]?.status === 'error' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.round(progress.value * 100)}%` }} /></div>
                                    <p className="mt-1 truncate text-[11px] text-text-muted" title={progress.message}>{progress.message}</p>
                                </div>;
                            })}
                        </div>
                        {failedDecades.length > 0 && <div className="rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">
                            <p className="font-bold">Generation errors</p>
                            {failedDecades.map(decade => <p key={decade} className="mt-1"><span className="font-semibold">{decade}:</span> {generatedImages[decade]?.error}</p>)}
                        </div>}
                    </div>}

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {DECADES.map(decade => {
                            const image = generatedImages[decade];
                            const status = image?.status || 'idle';
                            const savedStatus = saveStatuses[decade] || 'idle';
                            const isSelected = selectedDecades.includes(decade);

                            return (
                                <div
                                    key={decade}
                                    className={`group relative aspect-[3/4] overflow-hidden rounded-lg border bg-bg-tertiary shadow-md transition-opacity ${status === 'done' && image.url ? 'cursor-zoom-in' : ''} ${isSelected ? 'border-accent/50' : 'border-border-primary/30 opacity-45'}`}
                                    onClick={() => { if (status === 'done' && image.url) setZoomedImage({ url: image.url, decade }); }}
                                    onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && status === 'done' && image.url) setZoomedImage({ url: image.url, decade }); }}
                                    role={status === 'done' && image.url ? 'button' : undefined}
                                    tabIndex={status === 'done' && image.url ? 0 : undefined}
                                    aria-label={status === 'done' && image.url ? `View ${decade} result full size` : undefined}
                                >
                                    <span className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">{isSelected ? 'Active' : 'Inactive'}</span>
                                    {/* Card Content */}
                                    {status === 'idle' && (
                                        <div className="flex flex-col items-center justify-center h-full text-text-muted p-4 text-center">
                                            <PastForwardIcon className="w-12 h-12 opacity-20 mb-2" />
                                            <span className="text-lg font-bold opacity-40">{decade}</span>
                                        </div>
                                    )}
                                    
                                    {status === 'pending' && (
                                        <div className="flex flex-col items-center justify-center h-full bg-black/20">
                                            <SpinnerIcon className="w-8 h-8 text-accent animate-spin mb-2" />
                                            <span className="text-xs text-accent font-semibold animate-pulse">{generationProgress[decade]?.message || `Generating ${decade}...`}</span>
                                            <div className="mt-3 h-1.5 w-3/4 overflow-hidden rounded-full bg-bg-primary"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round((generationProgress[decade]?.value || 0) * 100)}%` }} /></div>
                                        </div>
                                    )}

                                    {status === 'error' && (
                                        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                                            <p className="text-danger font-bold text-sm">Generation Failed</p>
                                            <p className="text-xs text-danger/70 mt-1">{image.error}</p>
                                            <button 
                                                onClick={() => handleRegenerateDecade(decade)}
                                                className="mt-3 p-2 bg-bg-primary rounded-full hover:bg-accent hover:text-accent-text transition-colors"
                                            >
                                                <RefreshIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}

                                    {status === 'done' && image.url && (
                                        <>
                                            <img src={image.url} alt={decade} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            
                                            {/* Label Badge */}
                                            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                                                {decade}
                                            </div>

                                            {/* Hover Actions */}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleDownloadIndividualImage(decade); }}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Download"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleSaveIndividualImage(decade); }}
                                                    disabled={savedStatus !== 'idle'}
                                                    className={`p-2 rounded-full transition-colors shadow-lg ${
                                                        savedStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text'
                                                    }`}
                                                    title="Save to Library"
                                                >
                                                    {savedStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : savedStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                                </button>
                                                <button
                                                    onClick={(event) => { event.stopPropagation(); handleRegenerateDecade(decade); }}
                                                    className="p-2 rounded-full bg-bg-tertiary text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg"
                                                    title="Regenerate"
                                                >
                                                    <RefreshIcon className="w-5 h-5" />
                                                </button>
                                                <SendToLTXButton imageDataUrl={image.url} prompt={selectedTheme === 'historical' ? buildHistoricalCameoPrompt(getHistoricalCameo(decade, selectedHistoricalCameos[decade])) : THEMES[selectedTheme].prompt(decade)} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            </div>
            <LibraryPickerModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onSelectItem={handleLibrarySelect} filter={LIBRARY_IMAGE_TYPES} />
        </div>
    );
};

export default PastForwardPanel;
