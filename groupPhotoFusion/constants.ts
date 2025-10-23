import { Pose, Persona, Quality } from './types';

const getQualityModifier = (quality: Quality): string => {
    switch (quality) {
        case 'Standard': return 'a good quality photograph';
        case 'High': return 'a detailed, high-resolution photograph';
        case 'Ultra High': return 'an ultra-realistic, professional, 8k photograph with sharp focus';
    }
};

const getPersonaPrompt = (personaDescriptions: string[]): string => {
    if (personaDescriptions.every(p => !p)) return 'Create a group photo with the people from the uploaded images.';

    const numberedDescriptions = personaDescriptions
        .map((desc, i) => desc ? `Person ${i+1}: ${desc}` : `Person ${i+1}: as they appear in their photo.`)
        .join('\n');
    
    return `Create a group photo featuring the people from the uploaded images, with the following character interpretations:\n${numberedDescriptions}`;
};

export const POSES: Pose[] = [
    {
        id: 'casual-hangout',
        title: 'Casual Hangout',
        description: 'A relaxed and friendly group pose, perfect for friends.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: They are all hanging out together, smiling and laughing. 
Pose: Arrange them in a natural, casual group pose. They should look like they are enjoying each other's company. Some could be sitting, some standing, some with arms around each other.
Style: The image should be ${getQualityModifier(quality)}, with natural lighting.
${hasBg ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A neutral, out-of-focus background like a cozy living room or a park.'}
Final Image: The final image should be a single, cohesive photograph.
`   },
    {
        id: 'professional-team',
        title: 'Professional Team',
        description: 'A confident and modern corporate headshot style.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: This is a professional team photo for a modern company.
Pose: Arrange them in a confident, professional group pose. They should be looking towards the camera with friendly but professional expressions.
Style: ${getQualityModifier(quality)}, with clean, bright studio lighting.
${hasBg ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A clean, minimalist office setting or a solid light gray background.'}
Final Image: The final image should be a single, cohesive photograph suitable for a company website.
`   },
    {
        id: 'album-cover',
        title: 'Band Album Cover',
        description: 'A stylish and edgy pose suitable for a music group.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: This is a photo for a cool, modern indie band's album cover.
Pose: Arrange them in a stylish, slightly moody group pose. They can be looking in different directions, some serious, some smirking. Avoid cheesy smiles.
Style: ${getQualityModifier(quality)}, with dramatic, high-contrast lighting. The style should be slightly grainy, like a film photograph.
${hasBg ? 'Background: Place them seamlessly into the provided background image.' : 'Background: An urban setting at night, like a graffiti-covered brick wall or a deserted street.'}
Final Image: The final image should be a single, cohesive photograph with a strong artistic direction.
`   },
    {
        id: 'cinematic-portrait',
        title: 'Cinematic Portrait',
        description: 'Dramatic, movie-poster style. Ignores custom backgrounds.',
        getPrompt: (personas, quality) => `
${getPersonaPrompt(personas)}
Scenario: Create a dramatic, cinematic group portrait, like a movie poster.
Pose: The characters are posed heroically, looking determined. They are grouped closely together, looking out in slightly different directions.
Style: ${getQualityModifier(quality)}. The lighting should be highly dramatic, with strong key lights and deep shadows (chiaroscuro). Add a subtle atmospheric effect like smoke or dust motes.
Background: A dark, abstract, and textured background. IMPORTANT: Do not use any custom background image that might have been provided.
Final Image: The final image should be a single, cohesive, and epic cinematic composition.
`   },
    {
        id: 'professional-bw',
        title: 'Classic B&W',
        description: 'Timeless black and white portrait. Ignores custom backgrounds.',
        getPrompt: (personas, quality) => `
${getPersonaPrompt(personas)}
Scenario: Create a timeless, classic group portrait.
Pose: Arrange them in a simple, elegant pose. They should be close together, looking at the camera with gentle, calm expressions.
Style: ${getQualityModifier(quality)}. The final image MUST be in black and white, with rich contrast and a full range of tones from pure white to deep black.
Background: A simple, plain, dark gray studio background. IMPORTANT: Do not use any custom background image that might have been provided.
Final Image: The final image should be a single, cohesive, and elegant black and white photograph.
`   },
    {
        id: 'kissing-booth',
        title: 'Kissing Booth',
        description: 'A fun, playful pose for exactly two people.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: Create a fun and playful photo of two people.
Pose: One person is giving the other a playful kiss on the cheek. Both should be smiling or laughing.
Style: The image should be ${getQualityModifier(quality)}, with warm, happy lighting.
${hasBg ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A fun, bright setting like a carnival, a park, or a colorful wall.'}
Final Image: The final image should be a single, cohesive, and heartwarming photograph.
`
    },
    {
        id: 'photo-booth',
        title: 'Photo Booth',
        description: 'A 3x3 grid of photo strips with different fun poses and expressions.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: The people are in a photo booth, taking a series of fun, spontaneous pictures.
Pose: Create a series of fun, studio-style poses and expressions. Each person should have a different expression in each strip, such as laughing, making a silly face, winking, or looking surprised.
Style: The image should be ${getQualityModifier(quality)}, with a consistent light source, like a camera flash in a dark room. The overall image should have a slight blur effect to mimic a real photo strip.
${hasBg ? 'Background: Place them seamlessly into the provided background image. This background should be visible behind the subjects in each photo strip.' : 'Background: The background behind the subjects in each photo strip must be a simple white curtain.'}
Final Image: The final image must be a 3x3 grid of photo strips.
`
    },
    {
        id: 'lying-down',
        title: 'Cloud Gazing',
        description: 'A cozy, top-down view of friends lying on a blanket and looking up.',
        getPrompt: (personas, quality, hasBg) => `
${getPersonaPrompt(personas)}
Scenario: A cozy, top-down view of friends lying on a blanket and looking up, as if watching clouds or stars.
Pose: They are lying on their backs on a large blanket, side-by-side and close together in a comfortable state.
Style: The image should be ${getQualityModifier(quality)}. The camera angle must be directly from above (a top-down perspective).
${hasBg ? "Background: Place them seamlessly into the provided background image. Crucially, you MUST adjust the background's perspective to a matching top-down view (e.g., if it's a forest, show the forest floor from above)." : 'Background: A cozy, dimly lit room floor or a soft grassy field.'}
Final Image: The final image should be a single, cohesive photograph from a top-down perspective.
`
    },
    {
        id: 'candid-moment',
        title: 'Candid Moment',
        description: 'A natural, unposed interaction, as if caught in the moment.',
        getPrompt: (personaDescriptions, quality, hasBackground) => `
    ${getPersonaPrompt(personaDescriptions)}
    Scenario: Subjects should be laughing or talking, not looking at the camera.
    Pose: Arrange them interacting naturally with each other, as if caught in a candid moment.
    Style: The image should be ${getQualityModifier(quality)}, with soft, natural lighting.
    ${hasBackground ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A bright, out-of-focus setting like a cafe or park during the day.'}
    Final Image: The final image should be a single, cohesive photograph.
    `
    },
    {
        id: 'nightclub-photo',
        title: 'Atmospheric Photo',
        description: 'A spontaneous photo taken in a dark, atmospheric setting.',
        getPrompt: (personaDescriptions, quality, hasBackground) => `
    ${getPersonaPrompt(personaDescriptions)}
    Scenario: The lighting on the subjects must be dim and moody, consistent with the environment. Crucially, they should appear illuminated only by the ambient light of the dark setting, avoiding any bright, artificial lighting directly on them.
    Pose: Arrange them in a spontaneous, atmospheric photo taken without a flash.
    Style: The image should be ${getQualityModifier(quality)}.
    ${hasBackground ? 'Background: Place them seamlessly into the provided background image. The background lighting should match this dim, moody, and atmospheric style.' : 'Background: The setting should be a dark, atmospheric place like a lounge or cafe at night.'}
    Final Image: The final image should be a single, cohesive photograph.
    `
    },
    {
        id: 'hug-pose',
        title: 'Reunion Hug',
        description: 'An emotional scene of friends reuniting with a warm hug.',
        getPrompt: (personaDescriptions, quality, hasBackground) => `
${getPersonaPrompt(personaDescriptions)}
Scenario: This should be a close up photo. Their expressions should be joyous and genuine.
Pose: Arrange them in a warm, emotional group hug, as if reuniting after a long time.
Style: The image should be ${getQualityModifier(quality)}, with soft, emotional lighting.
${hasBackground ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A neutral, slightly blurred background that doesn\'t distract from the subjects, like an airport terminal or a front porch.'}
Final Image: The final image should be a single, cohesive photograph that captures a feeling of joy and connection.
`
    },
    {
        id: 'intimate-scene',
        title: 'Quiet Moment',
        description: 'A close, personal moment capturing a deep, friendly connection.',
        getPrompt: (personaDescriptions, quality, hasBackground) => `
${getPersonaPrompt(personaDescriptions)}
Scenario: Arrange the subjects close together in a comfortable, relaxed way. Their interaction should feel genuine, not posed for the camera.
Pose: They are sitting closely together, sharing a quiet, friendly moment. They are looking at each other with warm, platonic affection.
Style: The image should be ${getQualityModifier(quality)}, with soft, intimate lighting, perhaps from a window or a lamp.
${hasBackground ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A cozy, intimate setting like a quiet cafe corner, a sofa by a fireplace, or a bench in a park at dusk.'}
Final Image: The final image should be a single, cohesive photograph that feels personal and captures a deep, friendly connection.
`
    },
    {
        id: 'group-photo',
        title: 'Classic Group Photo',
        description: 'A standard pose where everyone is looking at the camera, smiling.',
        getPrompt: (personaDescriptions, quality, hasBackground) => `
${getPersonaPrompt(personaDescriptions)}
Scenario: Arrange all subjects in a standard group photo layout.
Pose: A classic group photo layout, smiling and looking at the camera.
Style: The image should be ${getQualityModifier(quality)}, with balanced, pleasant lighting.
${hasBackground ? 'Background: Place them seamlessly into the provided background image.' : 'Background: A simple studio backdrop or a pleasant, slightly out-of-focus outdoor scene.'}
Final Image: The final image should be a single, cohesive photograph.
`
    },
];

export const PERSONAS: Persona[] = [
    {
        id: 'default',
        name: 'As is',
        description: '',
        type: 'default',
    },
    {
        id: 'female-fantasy-elf',
        name: 'Fantasy Elf',
        description: 'is a beautiful fantasy elf with long, flowing silver hair, pointed ears, and intricate elven armor.',
        type: 'female',
    },
    {
        id: 'female-cyberpunk-hacker',
        name: 'Cyberpunk Hacker',
        description: 'is a cyberpunk hacker with neon-pink hair, cybernetic glowing tattoos, and futuristic street wear.',
        type: 'female',
    },
    {
        id: 'female-victorian-lady',
        name: 'Victorian Lady',
        description: 'is an elegant Victorian lady wearing a detailed gown with a corset, an elaborate hat, and a sophisticated expression.',
        type: 'female',
    },
    {
        id: 'male-space-marine',
        name: 'Space Marine',
        description: 'is a rugged space marine in heavy, battle-worn power armor, holding a futuristic rifle.',
        type: 'male',
    },
    {
        id: 'male-film-noir-detective',
        name: 'Film Noir Detective',
        description: 'is a 1940s film noir detective wearing a fedora and trench coat, shrouded in shadows and smoke.',
        type: 'male',
    },
    {
        id: 'male-viking-warrior',
        name: 'Viking Warrior',
        description: 'is a fierce Viking warrior with a long braided beard, face paint, and wearing leather and fur armor.',
        type: 'male',
    },
     {
        id: 'female-triangle-pear',
        name: 'Triangle (Pear)',
        description: 'Narrow shoulders, small bust, wide hips and thighs, fuller lower body.',
        type: 'female',
    },
    {
        id: 'female-inverted-triangle',
        name: 'Inverted Triangle',
        description: 'Broad shoulders, fuller chest, narrow waist, slim hips and legs.',
        type: 'female',
    },
    {
        id: 'female-rectangle',
        name: 'Rectangle',
        description: 'Straight torso, even proportions, minimal waist curve, balanced bust and hips.',
        type: 'female',
    },
    {
        id: 'female-oval-apple',
        name: 'Oval (Apple)',
        description: 'Full midsection, soft waist, narrower hips, rounded body shape.',
        type: 'female',
    },
    {
        id: 'female-hourglass',
        name: 'Hourglass',
        description: 'Narrow waist, balanced bust and hips, curvy proportions.',
        type: 'female',
    },
    {
        id: 'female-triangle-alternate',
        name: 'Triangle (alternate)',
        description: 'Small upper body, large hips and thighs, strong lower frame.',
        type: 'female',
    },
    {
        id: 'female-voluptuous-hourglass',
        name: 'Voluptuous (Thick Hourglass)',
        description: 'Large chest and hips, thick thighs, soft belly, strong curves, athletic-to-plus build.',
        type: 'female',
    },
    {
        id: 'male-ectomorph',
        name: 'Ectomorph',
        description: 'Lean and slender, long limbs, narrow shoulders, low muscle mass.',
        type: 'male',
    },
    {
        id: 'male-mesomorph',
        name: 'Mesomorph',
        description: 'Athletic build, broad shoulders, narrow waist, defined muscles.',
        type: 'male',
    },
    {
        id: 'male-endomorph',
        name: 'Endomorph',
        description: 'Rounder body, wider waist and hips, soft muscle definition.',
        type: 'male',
    }
];