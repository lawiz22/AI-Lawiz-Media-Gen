// Krea 2 prompting guide adapted from rakshazi/krea2-prompting v1.5.1 (CC BY-SA 4.0); see LICENSING.md.

export const KREA2_PROMPTING_SOURCE = {
    title: 'krea2-prompting',
    author: 'rakshazi',
    version: '1.5.1',
    url: 'https://github.com/rakshazi/krea2-prompting',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    basis: 'buxinzi2233/krea2-prompting (MIT)',
    poses: '@Zuanfilm',
} as const;

export type Krea2Workflow = 'krea2-simple' | 'krea2-raw' | 'krea2-edit';
export type Krea2Aspect = '1:1' | '16:9' | '21:9' | '4:3' | '2:3' | '9:16';

export interface Krea2PromptDraft {
    idea: string;
    medium: string;
    subject: string;
    action: string;
    composition: string;
    environment: string;
    lighting: string;
    materials: string;
    mood: string;
    text: string;
    restrictions: string;
    style: string;
    pose: string;
    poseObject: string;
    poseKeyFieldsOnly: boolean;
    aspect: Krea2Aspect;
    prompt: string;
}

export const defaultKrea2PromptDraft = (): Krea2PromptDraft => ({
    idea: '', medium: '', subject: '', action: '', composition: '', environment: '', lighting: '', materials: '', mood: '', text: '', restrictions: '',
    style: '', pose: '', poseObject: '', poseKeyFieldsOnly: false, aspect: '2:3', prompt: '',
});

export const KREA2_TURBO_SETTINGS = { steps: 8, cfg: 1, sampler: 'euler', scheduler: 'beta', shift: 4 } as const;
export const KREA2_RAW_SETTINGS = { steps: 52, cfg: 3.5 } as const;

export const KREA2_ASPECTS: ReadonlyArray<{ id: Krea2Aspect; use: string; sizes: string }> = [
    { id: '1:1', use: 'Portrait, headshot, product', sizes: '1024x1024 or 1536x1536' },
    { id: '16:9', use: 'Cinematic landscape, hero', sizes: '1920x1080 or 2048x1152' },
    { id: '21:9', use: 'Panoramic tension', sizes: '2560x1080 or 3440x1440' },
    { id: '4:3', use: 'Broad action, environment', sizes: '1600x1200 or 2048x1536' },
    { id: '2:3', use: 'Vertical poster, wallpaper', sizes: '1536x2048 or 1440x2160' },
    { id: '9:16', use: 'Phone poster', sizes: '1080x1920 or 1440x2560' },
];

export const KREA2_VOCABULARY: ReadonlyArray<{ id: string; label: string; field: keyof Krea2PromptDraft; terms: readonly string[] }> = [
    { id: 'shot', label: 'Shot size', field: 'composition', terms: ['extreme close-up', 'close-up', 'portrait', 'three-quarter', 'half-body', 'full body', 'wide establishing shot'] },
    { id: 'angle', label: 'Angle', field: 'composition', terms: ['low angle', 'high angle', 'eye level', 'top-down', 'dutch tilt'] },
    { id: 'lens', label: 'Lens', field: 'composition', terms: ['35mm environmental', '50mm natural', '85mm portrait', 'f/1.4', 'f/2', 'shallow depth of field', 'deep focus', 'creamy bokeh', 'long-lens compression', 'macro'] },
    { id: 'light', label: 'Light', field: 'lighting', terms: ['soft diffused light', 'hard directional key light', 'golden hour', 'blue hour', 'overcast', 'rim light', 'backlight', 'side light', 'top light', 'practical light from a window', 'low-key', 'high-key', 'warm tungsten', 'cool daylight', 'soft overcast daylight, neutral white balance'] },
    { id: 'film', label: 'Film stock', field: 'medium', terms: ['shot on Kodak Portra 400', 'Kodak Gold', 'Fuji Pro 400H', 'Cinestill 800T', 'Ilford HP5', 'film grain'] },
    { id: 'texture', label: 'Texture', field: 'materials', terms: ['natural skin texture', 'visible pores', 'vellus hair', 'fabric weave', 'wet highlights', 'condensation', 'dust in the light beam', 'micro-reflections', 'wet pavement reflections', 'scuffed surfaces', 'worn edges', 'fingerprints on glass'] },
    { id: 'candid', label: 'Real camera', field: 'medium', terms: ['candid, in the moment', 'authentic skin texture', 'natural facial features', 'taken on a phone camera'] },
];

export const KREA2_COMPOSITION_MODULES: ReadonlyArray<{ name: string; text: string }> = [
    { name: 'Vanishing point', text: 'an empty road begins at bottom centre and leads to a distant central vanishing point, with tree lines, shadows, rails, and markings converging sharply' },
    { name: 'Four quadrants', text: 'four visual boundaries meet at the exact centre and divide the frame into distinct quadrants with different colour, texture, and light moods' },
    { name: 'Action perspective', text: 'an extreme low-angle wide-lens view places a huge foreshortened limb or object in the foreground while the face stays sharp near the upper third' },
    { name: 'C-shaped motion', text: 'a bright trail wraps from the lower-left foreground around the upper edge toward the right, creating a C-shaped motion path' },
    { name: 'Reflection symmetry', text: 'a centred figure or structure meets perfectly reflective water, mirroring sky and subject into symmetry' },
    { name: 'Typography layout', text: 'a single short word stretches across the background, partially occluded by the subject and integrated into a graphic poster' },
    { name: 'Hero quiet zone', text: 'generous empty sky in the left third left clear for overlaid title text' },
];

export const KREA2_RECIPES: ReadonlyArray<{ name: string; template: string; example: string }> = [
    { name: 'Portrait', template: 'A [shot size] portrait of [subject] in [wardrobe], [setting], [lighting], [lens feel], [skin/material detail], [colour grade], [crop].',
        example: 'A cinematic golden-hour portrait of a man in his forties, shot on 85mm f/1.4, soft warm rim lighting, shallow depth of field, creamy bokeh, editorial magazine styling, natural skin texture, natural colour grade, 4:5 crop' },
    { name: 'Product / still life', template: 'Name every surface: [product] on [material], [backdrop], [key light] with [rim/highlight], [crop].',
        example: 'A matte ceramic skincare jar on a sculpted stone plinth, continuous warm-grey sweep backdrop, soft directional key light with a gentle rim highlight, 4:3 hero crop' },
    { name: 'Landscape / environment', template: 'Establishing view of [place], [weather], [light path], [scale cue], [lens], [palette], [crop].',
        example: 'A towering rust-orange suspension bridge stretches across deep blue-green water beneath a bright sky, photographed from a low vantage point, long-lens compression, crisp midday light, 16:9' },
    { name: 'Architecture', template: 'Building type + materials + context + lighting + medium.',
        example: 'Modern residential house, white stucco facade, large glass windows, concrete base, surrounded by mature trees and green lawn, warm late-afternoon sunlight, architectural photography, photorealistic' },
    { name: 'Street / candid', template: 'Candid [medium] of [subject and action], [weather], [lens], [register], [palette], [light], [texture], [motion].',
        example: 'Candid street photograph of a courier walking through a rain-slicked city on an overcast day, 35mm f/2, documentary realism, muted desaturated tones, soft diffused light, wet pavement reflections, motion in the background crowd, film grain, photojournalistic composition' },
    { name: 'Editorial / landing-page hero', template: 'Reserve a quiet zone for the headline and set the crop up front.',
        example: 'A rain-slicked city alley at night, neon reflections on wet asphalt, low camera angle, cinematic wide shot, generous dark sky in the upper third left clear for a headline, 16:9' },
];

export const KREA2_TRAPS: ReadonlyArray<{ trap: string; fix: string }> = [
    { trap: 'Long text or a speech bubble with a sentence', fix: 'Ask for an empty bubble and typeset the line afterwards.' },
    { trap: 'Screens, dashboards, chat windows', fix: 'Ask for an empty screen spelled out as content, then paste a real screenshot.' },
    { trap: 'A hand gripping a detached object', fix: 'Use an open palm, a handle or a cuff, and name the contact and the five fingers.' },
    { trap: 'A figure behind a table, desk, counter or bench', fix: 'Delete the furniture; move its props into the hands or onto the floor.' },
    { trap: 'A staged prop that reads as anatomy', fix: 'Give it a distinct material and a visible gap from the body.' },
    { trap: 'A recurring character', fix: 'Write one identity block (hair, eyes, build, clothing colours, one countable mark) and reuse it verbatim.' },
    { trap: 'Two characters', fix: 'One side and one action each; composition order sets the frame share.' },
    { trap: 'Three or more figures', fix: 'Render them separately and composite.' },
    { trap: 'Skin comes back flushed or uneven', fix: 'Switch to soft overcast daylight with neutral white balance and anchor the tone to a named body part.' },
    { trap: 'A LoRA seems dead', fix: 'A/B it at ±3 or ±5 to find its direction, then settle back.' },
    { trap: 'Weights such as (word:1.5)', fix: 'They need Krea2PromptWeight (KJNodes) with both MODEL and CONDITIONING wired; the stock encoder breaks above about 1.2.' },
    { trap: 'Edits', fix: 'Use masked inpainting and describe the whole finished frame.' },
    { trap: 'A defect after one render', fix: 'Render four seeds: on three or four it is the prompt, on one or two it is the seed.' },
];

export const KREA2_NEGATIVE_FAMILIES: ReadonlyArray<{ name: string; text: string }> = [
    { name: 'General', text: 'low quality, blurry, pixelated, jpeg artifacts, muddy colours, flat lighting, bad composition, distorted perspective, watermark, logo, text' },
    { name: 'People', text: 'wrong character, wrong hair colour, wrong eye colour, distorted face, asymmetrical eyes, bad anatomy, extra fingers, missing fingers, broken hands, deformed limbs, cropped face' },
    { name: 'Realistic integration', text: 'cartoon background, fake compositing, mismatched lighting, wrong scale, floating character, no contact shadow, unrealistic perspective' },
    { name: 'Landscape', text: 'empty scene, no depth, weak vanishing point, distorted trees, warped buildings, bad horizon, overexposed sky, dull colours' },
    { name: 'Poster text', text: 'misspelled text, random letters, too much text, unreadable typography, extra words, paragraph text, watermark, logo' },
    { name: 'High saturation', text: 'dull colours, muted palette, low saturation, washed-out colours, gray colour grading, muddy colours' },
];

export const KREA2_STYLE_FORMULAS = [
    'Formula A: A <3 mood adjectives> <medium> style built on <linework>, <shading>, <proportion logic>, <atmosphere>, and <a summarising "X intensity that feels Y">. Influenced by: <tradition>, <technique>, <studio or school practice>, <method>.',
    'Formula B: <medium> aesthetics characterized by <trait>, <trait>, <trait>, <trait>, and <trait>, blending <A> with <B> through <mechanism>, <mechanism>, and <mechanism>, reminiscent of <Artist 1> and <Artist 2>, inspired by <Work 1> and <Work 2>.',
] as const;

export const KREA2_STYLE_PARAGRAPHS: Readonly<Record<string, string>> = {
    'Backlit Portraiture': 'luminous photographic aesthetics defined by strong backlighting, radiant edge illumination, subtle translucency effects, atmospheric depth, graceful tonal transitions, and a heightened sense of visual separation, creating elegant and emotionally evocative imagery through carefully controlled exposure, naturalistic light diffusion, and refined portrait craftsmanship, reminiscent of Peter Lindbergh and Paolo Roversi, inspired by Vogue editorials and In the Mood for Love.',
    'Cinematic Photography': 'A dramatically composed photographic style built on deliberate, film-like framing that favors wide aspect ratios and purposeful negative space, controlled color-grading logic that unifies highlight and shadow into a single cohesive mood, soft, motivated lighting sources that feel narratively justified rather than purely technical, a patient, unhurried compositional stillness charged with implied story beyond the frame, and a polished, narrative-driven visual gravitas rooted in feature-film visual-language tradition. Influenced by: Roger Deakins cinematography tradition, anamorphic-lens visual technique, narrative film-lighting practice, color-grading post-production method.',
    'Ghibli Style': 'A gentle, hand-painted animation illustration style built on soft watercolor-inspired shading that gives every plane a breathable, tender texture, meticulous naturalistic detail applied with unhurried patience, rounded, expressive proportions carrying quiet emotional sincerity, a hushed, wondrous stillness pervading even the most fantastical scenes, and a nostalgic, wholesome hand-crafted intensity that feels timeless and deeply human. Influenced by: Hayao Miyazaki, Studio Ghibli production technique, traditional cel-animation painting method, naturalist watercolor illustration tradition.',
    'Golden Hour Photography': 'A softly directional photographic style built on a low, raking angle of natural illumination that stretches long, gentle shadows across the frame, a diffused, glowing quality softened by increased atmospheric scattering at that time of day, a flattering, low-contrast luminosity that wraps gently around form rather than casting harsh definition, an unhurried, fleeting stillness carried through the brief window of ideal light, and a nostalgic, cinematic tenderness that feels naturally soft and effortlessly atmospheric. Influenced by: natural available-light photography tradition, magic-hour cinematography technique, outdoor portrait-lighting practice, documentary golden-hour shooting method.',
};

export const KREA2_STYLE_FAMILIES: ReadonlyArray<{ family: string; names: readonly string[] }> = [
    { family: 'Anime & Manga', names: ['Anime Style', 'Ghibli Style', '70s Anime', 'Manga Style', 'Akira Style', 'Akira Toriyama Style', 'Atsushi Ohkubo Style', 'Attack on Titan Style', 'Chainsaw Man Style', 'Jujutsu Kaisen Style', 'My Hero Academia Style', 'Berserk Manga Style', 'Bleach Style', 'Frieren Style', 'Boichi Style', 'Cinematic Anime', 'Classic Shojo Illustration', 'Euromanga Style', 'Watercolor Anime Illustration', 'Granblue Fantasy Pin-Up Style', 'Katsuya Terada Style', 'Manhwa Ultradetailed Art', 'Murata Hyperrealism', 'MidJourney Niji-Inspired Digital Illustration', 'Solo Leveling Art', 'Pony 2.5D Realism', 'Pony/Illustrious Checkpoint Style', 'Yoshitaka Amano Style', 'Yoshitaka Amano Fine Art', 'Death Note Style', "JoJo's Bizarre Adventure Style", 'One Piece Style', 'Sailor Moon Style', 'Chibi Anime', 'Anime Key Visual', 'Junji Ito Style', 'Anime Illustration', 'Ultradetailed Manga Illustration', 'Polished Ultrarealistic Anime Pin-Up', 'Thin Delicate Outline Romantic Anime-Photographic Hybrid', 'Cel Shading'] },
    { family: 'Cartoon & Western Animation', names: ['Cartoon Style', 'Invader Zim Style', 'Nickelodeon Animation Style', 'Rick and Morty Style', 'Simpsons Style', 'South Park Style', 'Steven Universe Style', 'Adventure Time Style', 'Hanna-Barbera Style', 'Family Guy Style', 'Modern Cartoon', 'Rubber Hose Cartoon', 'Disney Ultradetailed Illustration', 'Classic Disney Feature Animation', 'Cyberpunk', 'Bruce Timm Noir', 'Arcane Animation Still', 'Toon Shader'] },
    { family: 'Comics & Graphic Novel', names: ['Comics Style', 'Alex Ross Style', 'Alternative Comics Style', 'Amanda Conner Illustration', 'American Comic Realism', 'Comic Européen Prestige', 'American Pulp Illustration', 'Frank Miller Style', 'Bengal Illustration', 'Crosshatched Graphic Novel', 'Graphic Novel', 'Franco-Belgian Ultradetailed Comics', 'Bande Dessinée (Hergé/Goscinny Tradition)', 'Frank Cho Style', 'Enki Bilal-Inspired Comic and Digital Painting', 'Hellboy Style', 'Archie Comics Style', 'Mark Brooks / Manapul Style', 'Marvel Comics Style', 'Marvel Cover Art', 'Milo Manara Style', 'Psychological Thriller Pulp Digital Painting', 'DC Comics Style', 'Zenescope Illustration', 'Ryan Benjamin Style', 'Travis Charest Style', 'Adi Granov Style', 'Bold Contour Style', 'Clean Line Art', 'Moebius-Inspired Illustration', 'Vintage Comics'] },
    { family: 'Drawing, Sketch & Ink', names: ['Drawing', 'Caricature', 'Charcoal Rendering', 'Hyperrealistic Colored-Pen Sketch', 'Jarek Kubicki Style', 'Playful Hand-Drawn Illustration', 'Chinese Ink Drawing', 'Sketch', 'Beatrix Potter Style', "Children's Book Drawing", "Vintage Children's Book Drawing", 'Gris Grimly Style', 'Tim Burton Style', 'Fashion Sketch', 'Loose Crosshatched Character Sketch', 'Wojak/Meme-Sketch Style', 'Ink Pen Drawing', 'Etching', 'Technical Drawing', 'Conté Pastel', 'Crayola Colored-Book Style', 'Bookplate Illustration', 'Boulet Graphic Illustration', 'Collector Storybook Illustration', 'Saul Steinbeck Art', 'Whimsical Illustration', 'Doodle', 'Very Simplistic Doodle'] },
    { family: 'Photography', names: ['Photography', '35mm Photography', 'Adobe Lightroom Masterpiece', 'Analog Photography', 'Annie Leibovitz Portraiture', 'Atmospheric Matte Painting', 'Backlit Portraiture', 'Black And White Documentary', 'Bleach Bypass Photography', 'Blue Hour Cinema', 'Butterfly Lighting', 'Candid Photography', 'Cinematic Photography', 'Commercial Beauty Photography', 'Editorial Photography', 'Cross Process Photography', 'Cross-Processed Film Photography', 'Cyberpunk Photography', 'Fish-Eye Photography', 'Surveillance Camera Photo', 'Direct-Flash Photography', 'Dutch Angle Photography', 'Full Body Photo', 'GQ Photoshoot', 'HDR Photography', 'High-Key Lighting Photography', 'Hitchcockian Photo', 'Film Noir', 'Instagram Model Glamour Photography', 'Art Photography', 'Kodachrome', 'National Geographic Photography', 'Motion Blur Photography', 'Natural Lighting Photography', 'Neon Photography', 'Low-Key Photography', 'Night Photography', 'Peter Lindbergh-inspired photography style', 'Photoshoot', 'Hyper Synthwave', 'Selfie Photo', 'Sin City Photography', 'Soft Beauty-Dish Portrait Rendering', 'Streamer Glam Selfie Realism', 'Supermodel Photoshoot', 'LinkedIn Pro Portrait', 'Sitcom Still', 'Rembrandt-Inspired Photography', 'Stranger Things-Inspired Art', 'Vogue Magazine', 'Golden Hour Photography', 'Cinematic Tron'] },
    { family: 'Graphic Design, Flat & Vector', names: ['Design', 'Butcher Billy Style', 'Corporate Memphis', '8-Bit Style', 'Kintsugi-Inspired Digital Art', 'Soviet Propaganda Poster', 'Minecraft Style', 'Funko Pop Style', 'Hyper-Stylized Illustration', 'Graphic Flat-Vector Travel Poster Illustration', 'Ornamental Patterns Hyperrealism Portrait', 'Flat Illustration', 'Vector Art', 'Bauhaus', 'Poster Art', 'Minimalist Line Art', 'Minimalism', 'Gradients', 'Origami'] },
    { family: '3D, Craft & Physical Media', names: ['3D Render', 'Pixar Animation', 'Cinematic Final Fantasy 3D Render', 'Marble Sculpture', 'Playful Retro Pop', 'Low Poly', 'LEGO Minifigure', 'Paper Cutout', 'Collage', 'Claymation', 'Mixed Media', 'Wallace and Gromit Style', 'Muppets Style', 'Zelda Wind Waker Style', 'PS1 Graphics', 'Woodcut', 'Contemporary Lithography', 'Variable-Size Ben-Day Dots Illustration', 'Contemporary Ukiyo-E', 'Mosaic Art', 'Stained Glass Flat Art', 'Isometric 3D Graphic', 'Quilling'] },
    { family: 'Digital Painting & Concept Art', names: ['Digital Painting', 'Castlevania Concept Art', 'Sakimichan Style', 'Scribble Fine Art', 'Gris Grimly-Inspired Hyperrealism', 'Absolute Painterly Style', 'Artgerm Style', 'ArtStation Masterpiece', 'Bastien Lecouffe-Deharme Fantasy', 'Bernie Wrightson Gothic', 'Blacklight Style', 'X-Ray Style', 'Brassaï Night Photography', 'Character Design Illustration', 'Charlie Bowater Style', 'Contemporary Fantasy Art', 'Cosmic Horror Illustration', 'Contemporary Commercial Illustration', 'Editorial Illustration', 'Cover Art', 'Interplay of Shadow and Light', 'Kekai Kotaki Style', 'Robin Eley Style', 'Dark Fantasy Illustration', 'GTA V Polished Cover Art', 'Expressive Character Illustration', 'Splatterpunk Horror Illustration', 'James Jean Style', 'Victo Ngai Style', 'Kay Nielsen Style', 'Hyper-Stylized Digital Painting', 'Movie Digital Art', 'RossDraws Style', 'Loish Ultrarealism'] },
    { family: 'Painting & Fine Art', names: ['Painting', 'Abstract Expressionism', 'Academic Precision Realism', 'Acrylic Dreamscape', 'Adventure Illustration', 'Agnes Cecile Style', 'Airbrush Fantasy', 'Van Gogh Style', 'Monet Style', 'Wet-on-Wet Watercolor Ink Painting', 'Alphonse Mucha Masterwork', 'Anato Finnstark Style', 'Rembrandt Painting', 'Art Deco Gold Highlights', 'Ashley Wood Illustration', 'Tenebrism', 'Chiaroscuro', 'Bill Sienkiewicz Expressionism', 'Graffiti Painting', 'Boris Vallejo Style', 'Brushwork Emphasis', 'Pin-Up', '2020s Pin-Up', 'Hyperrealism', 'Ultrarealism', 'Casey Baugh Style', 'Commercial Illustration', 'Giallo Poster Art', 'Grindhouse Poster Illustration', 'Cubism', 'Carne Griffiths Style', 'Jackson Pollock Style', 'Watercolor Painting', 'Contemporary Oil Painting', 'Pop Art', 'Thick Brushstrokes Painting', 'Impasto'] },
];

export const KREA2_POSE_FIELDS = ['leg_position', 'arm_position', 'hand_position', 'torso_orientation', 'head_orientation', 'weight_distribution', 'center_of_gravity', 'muscle_tension', 'movement_quality', 'balance', 'silhouette'] as const;
/** The four fields the guide keeps when a prompt must stay short. */
export const KREA2_POSE_KEY_FIELDS: ReadonlyArray<typeof KREA2_POSE_FIELDS[number]> = ['silhouette', 'weight_distribution', 'torso_orientation', 'movement_quality'];

export interface Krea2Pose { id: number; name: string; group: string; fields: readonly string[] }

const STANDING = 'Fundamental standing', MOVING = 'Locomotion & transitional', FORCE = 'Object interaction & force';
export const KREA2_POSES: readonly Krea2Pose[] = [
    { id: 1, name: 'Standing Neutral', group: STANDING, fields: ['Feet parallel at shoulder width, knees naturally extended with a slight relaxed bend.', 'Arms resting comfortably alongside the torso with relaxed shoulders.', 'Fingers naturally curved with palms facing inward toward the thighs.', 'Fully upright with a neutral spine, open chest, and level shoulders.', 'Head centered above the spine with the chin parallel to the ground.', 'Evenly distributed between both legs.', 'Centered between both feet.', 'Minimal activation maintaining comfortable posture.', 'Still, relaxed, balanced, and natural.', 'Highly stable with symmetrical support.', 'Vertical, symmetrical, clean body outline.'] },
    { id: 2, name: 'Contrapposto', group: STANDING, fields: ['One leg bears most of the body weight while the opposite leg relaxes with a slightly bent knee.', "Arms hang naturally with slight asymmetry following the body's weight shift.", 'Relaxed fingers with one hand often slightly closer to the hip.', 'Spine forms a gentle S-curve with hips and shoulders counterbalancing each other.', 'Head aligned naturally with a subtle relaxed tilt.', 'Approximately 80% on the supporting leg.', 'Positioned above the supporting foot.', 'Moderate in the supporting leg, minimal elsewhere.', 'Elegant, effortless, relaxed, and classical.', 'Stable despite asymmetrical stance.', 'Flowing S-shaped silhouette emphasizing natural body curves.'] },
    { id: 3, name: 'Power Stance', group: STANDING, fields: ['Feet shoulder-width apart with knees extended but not locked.', 'Arms relaxed beside the body or elbows bent outward when hands rest on the hips.', 'Relaxed open hands or firmly placed on the hips.', 'Chest expanded, shoulders back, spine elongated and upright.', 'Chin slightly elevated with the head centered.', 'Evenly shared between both legs.', 'Low and centered between the feet.', 'Moderate activation throughout the entire body.', 'Controlled, grounded, deliberate, and confident.', 'Extremely stable.', 'Broad triangular silhouette emphasizing shoulders and chest.'] },
    { id: 4, name: 'Attention Stance', group: STANDING, fields: ['Feet together with knees fully extended and aligned.', 'Arms straight alongside the torso without movement.', 'Fingers fully extended and aligned with the thighs.', 'Perfectly vertical with military posture.', 'Straight ahead with chin level.', 'Equal across both feet.', 'Perfectly centered.', 'High postural control throughout the body.', 'Completely still and disciplined.', 'Maximum static stability.', 'Rigid, vertical, symmetrical profile.'] },
    { id: 5, name: 'Relaxed Standing', group: STANDING, fields: ['One knee slightly relaxed with weight shifted naturally onto one leg.', 'Arms hanging loosely with relaxed shoulders.', 'Loose fingers with natural curvature.', 'Upright with slight natural relaxation of the spine.', 'Neutral with occasional subtle tilt.', 'Primarily on one leg while the other remains relaxed.', 'Shifted toward the supporting leg.', 'Low overall muscle engagement.', 'Casual, effortless, and comfortable.', 'Stable with slight asymmetry.', 'Soft asymmetrical outline.'] },
    { id: 6, name: 'Hands in Pockets', group: STANDING, fields: ['Feet comfortably apart with one leg often carrying more weight.', 'Elbows bent naturally with forearms inside pockets.', 'One or both hands inserted into pockets.', 'Upright with relaxed shoulders and chest.', 'Neutral or slightly tilted.', 'Usually favors one leg.', 'Shifted toward the supporting hip.', 'Very low.', 'Casual, relaxed, effortless.', 'Stable.', 'Relaxed silhouette with softened arm definition.'] },
    { id: 7, name: 'Crossed Arms', group: STANDING, fields: ['Stable standing stance with feet shoulder-width apart.', 'Both forearms crossed firmly across the chest.', 'Hands resting beneath the opposite upper arm.', 'Upright with shoulders slightly rounded forward.', 'Chin level or slightly raised.', 'Balanced or slightly shifted onto one leg.', 'Centered through the torso.', 'Moderate in the shoulders and forearms.', 'Controlled and reserved.', 'Stable.', 'Compact upper-body silhouette emphasizing the crossed arms.'] },
    { id: 8, name: 'Hands on Hips', group: STANDING, fields: ['Feet shoulder-width apart with knees relaxed.', 'Elbows bent outward symmetrically.', 'Palms resting firmly on the hips.', 'Chest expanded with shoulders open.', 'Facing forward with chin slightly elevated.', 'Evenly balanced.', 'Centered over both feet.', 'Moderate core engagement.', 'Assertive, controlled, and stable.', 'Very stable.', 'Wide silhouette emphasizing elbows and shoulders.'] },
    { id: 9, name: 'One Hand on Hip', group: STANDING, fields: ['Weight primarily on one leg with the opposite hip slightly elevated.', 'One elbow bent outward while the opposite arm hangs naturally.', 'One hand resting on the hip, the other relaxed.', 'Slight asymmetrical torso curve following the hip shift.', 'Slight tilt toward or away from the supporting side.', 'Mostly on one leg.', 'Above the supporting foot.', 'Moderate in the supporting leg and core.', 'Elegant, fashionable, relaxed.', 'Stable with asymmetrical posture.', 'Dynamic editorial silhouette emphasizing hip line.'] },
    { id: 10, name: 'Arms Behind Back', group: STANDING, fields: ['Feet comfortably apart with knees relaxed.', 'Both arms positioned behind the torso with elbows naturally bent.', 'Hands clasped together or one hand holding the opposite wrist.', 'Upright with an open chest and shoulders gently pulled back.', 'Neutral with calm forward gaze.', 'Evenly balanced across both legs.', 'Centered over both feet.', 'Low to moderate around the shoulders.', 'Calm, composed, deliberate.', 'Stable.', 'Clean frontal silhouette with concealed arm profile.'] },
    { id: 11, name: 'Walking Forward', group: MOVING, fields: ['One leg stepping forward while the trailing leg pushes off the ground, knees moving naturally through the gait cycle.', 'Arms swing naturally opposite to the legs with relaxed shoulders.', 'Fingers loosely extended with relaxed natural curvature.', 'Upright with a slight forward inclination following the direction of travel.', 'Head facing forward with chin level and eyes directed toward the destination.', 'Constantly transferring from the rear leg to the leading leg.', 'Moving forward between the feet during each step.', 'Moderate activation in the legs and core with relaxed upper body.', 'Smooth, rhythmic, purposeful, and continuous.', 'Dynamic balance maintained throughout each stride.', 'Strong forward-leading silhouette emphasizing motion.'] },
    { id: 12, name: 'Walking Away', group: MOVING, fields: ['One leg advancing while viewed from behind, natural stride length maintained.', 'Arms swing freely in opposition to the legs.', 'Hands relaxed with fingers naturally curved.', 'Upright with subtle forward momentum.', 'Facing away from the viewer with neck naturally aligned.', 'Continuously shifting between each supporting foot.', 'Progressively moving forward with each stride.', 'Moderate lower-body activation with relaxed shoulders.', 'Natural, fluid, and continuous.', 'Stable dynamic gait.', 'Tapered silhouette emphasizing distance and departure.'] },
    { id: 13, name: 'Running Sprint', group: MOVING, fields: ['One leg drives forward while the opposite extends explosively behind the body.', 'Elbows bent approximately ninety degrees with powerful forward and backward drive.', 'Hands relaxed with lightly curled fingers.', 'Leaning forward aggressively from the ankles with stable core engagement.', 'Facing directly toward the running direction with chin neutral.', 'Supported by a single foot during each ground contact.', 'Positioned ahead of the supporting foot to maximize acceleration.', 'Very high throughout the lower body and core.', 'Explosive, rapid, aggressive, and powerful.', 'Dynamic athletic balance.', 'Elongated forward-leaning silhouette emphasizing speed.'] },
    { id: 14, name: 'Jogging', group: MOVING, fields: ['Moderate stride length with relaxed knee lift and soft foot placement.', 'Elbows bent comfortably with relaxed rhythmic swing.', 'Loose hands without gripping tension.', 'Upright with slight forward inclination.', 'Neutral with steady forward gaze.', 'Smooth transfer between each step.', 'Stable and continuously moving forward.', 'Moderate lower-body activation with relaxed upper body.', 'Smooth, rhythmic, sustainable, and relaxed.', 'Stable during continuous movement.', 'Balanced athletic silhouette with flowing motion.'] },
    { id: 15, name: 'Striding Confidently', group: MOVING, fields: ['Long deliberate steps with full extension of each stride.', 'Natural arm swing synchronized with confident gait.', 'Relaxed hands with controlled movement.', 'Chest open with upright spine and shoulders back.', 'Chin slightly elevated with direct forward gaze.', 'Firm transfer onto each leading foot.', 'Stable and confidently projected forward.', 'Moderate overall body activation emphasizing posture.', 'Deliberate, elegant, powerful, and controlled.', 'Highly stable while moving.', 'Tall, commanding silhouette with extended stride.'] },
    { id: 16, name: 'Crouching', group: MOVING, fields: ['Deep knee flexion with feet planted firmly beneath the body.', 'Arms positioned naturally in front or beside the knees for balance.', 'Hands open and ready for support if needed.', 'Leaning slightly forward while maintaining spinal alignment.', 'Looking forward or slightly upward depending on the objective.', 'Evenly shared across both feet.', 'Lowered close to the ground between the feet.', 'Moderate to high activation in the legs and core.', 'Controlled, cautious, ready for movement.', 'Stable low center of gravity.', 'Compact low-profile silhouette.'] },
    { id: 17, name: 'Deep Squat', group: MOVING, fields: ['Knees fully flexed with hips lowered below knee level and feet flat.', 'Arms resting naturally or extended slightly forward for balance.', 'Relaxed open hands.', 'Slight forward inclination with neutral spine maintained.', 'Facing forward with relaxed neck.', 'Evenly distributed through both feet.', 'Very low and centered.', 'High lower-body activation with stable core.', 'Stable, grounded, controlled.', 'Excellent low-position stability.', 'Compact symmetrical silhouette close to the ground.'] },
    { id: 18, name: 'Kneeling One Knee', group: MOVING, fields: ['One knee resting on the ground while the opposite foot remains planted with the knee bent.', 'Arms relaxed beside the torso or resting naturally on the raised thigh.', 'Relaxed open hands.', 'Upright with open chest and straight spine.', 'Facing forward or slightly upward.', 'Shared between the grounded knee and planted foot.', 'Low and centered between both support points.', 'Moderate activation maintaining stability.', 'Calm, respectful, and controlled.', 'Stable with three points of support.', 'Strong asymmetrical silhouette emphasizing humility or readiness.'] },
    { id: 19, name: 'Kneeling Both Knees', group: MOVING, fields: ['Both knees resting on the ground with lower legs aligned beneath the body.', 'Arms relaxed beside the torso or resting on the thighs.', 'Hands resting naturally on the thighs or joined together.', 'Upright with relaxed shoulders and neutral spine.', 'Neutral or slightly lowered.', 'Evenly distributed across both knees and lower legs.', 'Centered directly above the knees.', 'Low to moderate postural activation.', 'Still, composed, and balanced.', 'Highly stable.', 'Symmetrical vertical silhouette supported by both knees.'] },
    { id: 20, name: 'Sitting Upright', group: MOVING, fields: ['Both feet flat on the floor with knees bent approximately ninety degrees.', 'Arms resting comfortably beside the torso or on the thighs.', 'Hands relaxed on the lap or thighs.', 'Straight spine with open chest and neutral shoulders.', 'Head centered with chin level.', 'Evenly distributed across the sitting bones.', 'Centered over the pelvis.', 'Low to moderate core activation maintaining posture.', 'Still, attentive, and composed.', 'Stable seated posture.', 'Clean vertical seated silhouette emphasizing posture.'] },
    { id: 41, name: 'Pointing', group: FORCE, fields: ['Feet shoulder-width apart with knees naturally relaxed.', 'One arm fully extended toward the target while the opposite arm remains relaxed beside the body.', 'Index finger extended with remaining fingers gently curled.', 'Slightly rotated toward the pointing direction with an upright spine.', 'Eyes aligned with the pointing direction.', 'Slightly shifted toward the leading side.', 'Centered with a subtle directional shift.', 'Moderate activation through the extended arm and core.', 'Intentional, direct, and assertive.', 'Stable.', 'Strong directional silhouette emphasizing the extended arm.'] },
    { id: 42, name: 'Reaching Forward', group: FORCE, fields: ['Feet staggered naturally with one foot slightly ahead.', 'One or both arms extended toward an object beyond immediate reach.', 'Fingers fully extended and slightly separated in preparation to grasp.', 'Torso leaning forward from the hips while maintaining spinal alignment.', 'Eyes fixed on the target.', 'Shifted toward the front foot.', 'Projected forward beyond the pelvis.', 'Moderate activation through shoulders, core, and legs.', 'Purposeful, controlled, and exploratory.', 'Stable with forward reach.', 'Elongated forward-reaching silhouette.'] },
    { id: 43, name: 'Reaching Upward', group: FORCE, fields: ['Feet shoulder-width apart with knees softly extended.', 'One or both arms fully extended overhead.', 'Fingers reaching upward with maximum extension.', 'Spine elongated vertically with chest lifted.', 'Looking upward toward the reaching hand.', 'Balanced over both feet.', 'Slightly elevated through full-body extension.', 'Moderate activation throughout the body.', 'Aspirational, elongated, and graceful.', 'Stable.', 'Tall vertical silhouette emphasizing upward movement.'] },
    { id: 44, name: 'Reaching Sideways', group: FORCE, fields: ['Feet wider than shoulder width for stability.', 'One arm fully extended laterally while the opposite remains relaxed.', 'Open hand with naturally extended fingers.', 'Slight lateral rotation or side bend.', 'Eyes following the reaching hand.', 'Shifted toward the supporting leg.', 'Laterally displaced while remaining balanced.', 'Moderate activation through the side body and shoulders.', 'Fluid, exploratory, and expansive.', 'Stable.', 'Wide asymmetrical silhouette emphasizing horizontal reach.'] },
    { id: 45, name: 'Holding Object', group: FORCE, fields: ['Stable stance with feet shoulder-width apart.', 'Arms bent comfortably while supporting the object close to the torso.', 'Hands securely wrapped around the object.', 'Upright with slight stabilization from the core.', 'Neutral or focused on the object.', 'Evenly balanced unless compensating for object weight.', "Centered close to the body's midline.", 'Moderate depending on object weight.', 'Controlled, careful, and steady.', 'Stable.', 'Compact silhouette centered around the object.'] },
    { id: 46, name: 'Carrying Over Shoulder', group: FORCE, fields: ['Stable walking or standing stance.', 'One arm supports the object over the shoulder while the opposite arm balances naturally.', 'Firm grip securing the object.', 'Slight lean opposite the carried load.', 'Neutral with forward gaze.', 'Shifted slightly toward the supporting side.', 'Offset toward the load.', 'Moderate to high in shoulders, back, and legs.', 'Strong, deliberate, and efficient.', 'Stable despite asymmetrical load.', 'Asymmetrical silhouette emphasizing the elevated object.'] },
    { id: 47, name: 'Carrying in Arms', group: FORCE, fields: ['Stable stance with feet comfortably apart.', 'Both arms wrapped securely around the carried object.', "Hands supporting the object's weight from below and the sides.", 'Upright with slight backward compensation.', 'Looking forward or toward the carried subject.', 'Evenly distributed with slight backward compensation.', 'Shifted toward the carried load.', 'Moderate activation through arms, shoulders, and core.', 'Careful, protective, and controlled.', 'Stable.', 'Rounded silhouette centered around the carried object.'] },
    { id: 48, name: 'Lifting', group: FORCE, fields: ['Feet shoulder-width apart with knees bent and hips lowered.', 'Arms extended downward before initiating the lift.', 'Secure grip around the object.', 'Neutral spine with forward hip hinge.', 'Looking slightly forward to maintain spinal alignment.', 'Even across both feet.', 'Low and centered beneath the load.', 'High activation throughout the legs, core, and back.', 'Powerful, controlled, and coordinated.', 'Stable lifting posture.', 'Compact, grounded silhouette emphasizing strength.'] },
    { id: 49, name: 'Pushing', group: FORCE, fields: ['One foot positioned forward with knees slightly bent.', 'Both arms extended toward the object with elbows nearly straight.', 'Palms pressing firmly against the object.', 'Leaning forward from the ankles with strong core engagement.', 'Eyes directed toward the object being pushed.', 'Primarily over the front foot.', 'Shifted forward beyond the pelvis.', 'High activation through the entire body.', 'Forceful, deliberate, and sustained.', 'Stable through staggered stance.', 'Forward-driving silhouette emphasizing exertion.'] },
    { id: 50, name: 'Pulling', group: FORCE, fields: ['One foot positioned behind the other for leverage.', 'Elbows bent while drawing the object toward the torso.', 'Firm gripping position.', 'Slight backward lean with engaged core.', 'Looking toward the object being pulled.', 'Shifted toward the rear supporting leg.', 'Positioned behind the object to maximize leverage.', 'High activation in arms, back, and legs.', 'Powerful, controlled, and resistant.', 'Stable through rear-weighted stance.', 'Dynamic backward-leaning silhouette emphasizing pulling force.'] },
];

export const findKrea2Pose = (name: string): Krea2Pose | undefined => KREA2_POSES.find(pose => pose.name === name);

/** The pose block in the guide's 11-field format, with the held object renamed when given. */
export const formatKrea2Pose = (pose: Krea2Pose, object = '', keyFieldsOnly = false): string => {
    const noun = object.trim();
    const rename = (text: string) => noun ? text.replace(/\bthe ((?:carried |elevated )?)object\b/g, `the $1${noun}`) : text;
    const lines = KREA2_POSE_FIELDS.map((field, index) => ({ field, text: pose.fields[index] }))
        .filter(({ field }) => !keyFieldsOnly || KREA2_POSE_KEY_FIELDS.includes(field))
        .map(({ field, text }) => `${field}: ${rename(text)}`);
    return [`Pose: ${pose.name}`, ...lines].join('\n');
};

const clause = (text: string) => text.trim().replace(/[\s.;,]+$/, '');
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const article = (word: string) => /^(?:[aeio]|u(?!ni|se|sa|ro))/i.test(word) ? 'An' : 'A';

/** The style block: a full paragraph when the guide ships one, otherwise the style name. */
export const krea2StyleBlock = (name: string): string => {
    const style = name.trim();
    if (!style) return '';
    return `Style: ${KREA2_STYLE_PARAGRAPHS[style] || `${style}.`}`;
};

/** Pose, style, text and restriction blocks appended after the prose of a prompt. */
export const krea2PromptBlocks = (draft: Pick<Krea2PromptDraft, 'pose' | 'poseObject' | 'poseKeyFieldsOnly' | 'style'>): string[] => {
    const pose = findKrea2Pose(draft.pose);
    return [pose ? formatKrea2Pose(pose, draft.poseObject, draft.poseKeyFieldsOnly) : '', krea2StyleBlock(draft.style)].filter(Boolean);
};

/** Builds the prompt with the guide's sentence frame; empty fields are left out. */
export const buildKrea2Prompt = (draft: Krea2PromptDraft): string => {
    const medium = clause(draft.medium), subject = clause(draft.subject), action = clause(draft.action), environment = clause(draft.environment);
    const opening = [
        subject ? `${medium ? `${article(medium)} ${medium} of` : ''} ${subject}`.trim() : medium ? capital(medium) : '',
        action, environment ? `set in ${environment}` : '',
    ].filter(Boolean).join(', ');
    const materials = clause(draft.materials), mood = clause(draft.mood), text = draft.text.trim().replace(/^"|"$/g, '');
    const sentences = [
        opening && `${capital(opening)}.`,
        clause(draft.composition) && `The composition uses ${clause(draft.composition)}.`,
        clause(draft.lighting) && `Lit by ${clause(draft.lighting)}.`,
        materials ? `${capital(materials)} stay visible${mood ? `, creating a ${mood} atmosphere` : ''}.` : mood ? `The atmosphere is ${mood}.` : '',
        text && `The only readable text in the image is "${text}", appearing exactly once.`,
        clause(draft.restrictions) && `${capital(clause(draft.restrictions))}.`,
    ].filter(Boolean);
    return [sentences.join(' '), ...krea2PromptBlocks(draft)].filter(Boolean).join('\n\n');
};

export interface Krea2Check { id: string; level: 'warning' | 'tip'; message: string }

const QUALITY_STACK = /\b(?:8k|4k|uhd|masterpiece|best quality|high quality|ultra[- ]?detailed|hyper[- ]?detailed|highly detailed|ultra[- ]?realistic|trending on artstation|award[- ]winning)\b/gi;
const NEGATION = /\b(?:no|not|without|never|don't|do not|avoid)\s+[\w-]+/gi;

/** Checks a prompt against the guide's every-prompt rules. */
export const checkKrea2Prompt = (prompt: string, settings: { cfg?: number; negativePrompt?: string } = {}): Krea2Check[] => {
    const text = prompt.trim();
    const checks: Krea2Check[] = [];
    const add = (id: string, level: Krea2Check['level'], message: string) => checks.push({ id, level, message });
    if (settings.cfg !== undefined) {
        if (settings.cfg <= 0) add('cfg-zero', 'warning', 'CFG 0 in a standard KSampler gives noise or a washed-out image; use 1.0.');
        else if (settings.cfg > 1.5) add('cfg-high', 'warning', `CFG ${settings.cfg} oversaturates Turbo; use 1.0 (RAW uses 3.5).`);
        if (settings.cfg <= 1 && settings.negativePrompt?.trim()) add('negative-dead', 'tip', 'At CFG 1.0 the negative prompt has no effect; describe the positive target instead.');
    }
    if (!text) return checks;
    const words = text.split(/\s+/).filter(Boolean).length;
    const quality = [...new Set((text.match(QUALITY_STACK) || []).map(term => term.toLowerCase()))];
    if (quality.length) add('quality-stack', 'warning', `Cut quality-stack words (${quality.join(', ')}); name the camera, light and materials instead.`);
    const negations = [...new Set((text.match(NEGATION) || []).map(term => term.toLowerCase()))];
    if (negations.length) add('negation', 'tip', `Negations do nothing at CFG 1.0 (${negations.slice(0, 3).join(', ')}${negations.length > 3 ? ', ...' : ''}); say what is there instead.`);
    const weights = [...text.matchAll(/\(([^()]*):\s*(-?\d+(?:\.\d+)?)\s*\)/g)];
    if (weights.length) {
        add('weights', 'tip', 'Weights need Krea2PromptWeight (KJNodes) with both outputs wired; the stock encoder breaks above about 1.2.');
        if (weights.some(match => Number(match[2]) > 3 || Number(match[2]) < -5)) add('weight-range', 'warning', 'Keep weights between -5 and 3; above 3 breaks the render.');
        if (weights.length > 5) add('weight-count', 'tip', 'Three to five weighted terms is already a lot.');
    }
    if (/\([^()]*\(/.test(text)) add('weight-nested', 'warning', 'Weights do not nest; one level of parentheses only.');
    const quoted = [...text.matchAll(/"([^"]+)"/g)].map(match => match[1].trim());
    if (quoted.some(entry => entry.split(/\s+/).length > 5)) add('long-text', 'warning', 'Rendered text over five words fails; keep it short or typeset it afterwards.');
    if (quoted.length && !/\b(?:exactly one|only|single)\b/i.test(text)) add('text-count', 'tip', 'Count each label ("exactly one"), or it can come back twice.');
    if (/\bspeech bubbles?\b|\bdialogue balloons?\b/i.test(text)) add('bubble', 'tip', 'Ask for the speech bubble empty and set the line afterwards.');
    if (/\b(?:screen|monitor|dashboard|app interface|chat window|terminal window)\b/i.test(text)) add('screen', 'tip', 'Generated screens invent text; ask for an empty screen and paste a real screenshot.');
    if (/\b(?:behind|at) (?:a|the|his|her|their) (?:\w+ )?(?:table|desk|counter|bench|workbench|bar)\b/i.test(text)) add('furniture', 'warning', 'Figures behind a table, desk, counter or bench fuse with it; delete the furniture and hand-hold the props.');
    if (/\b(?:holding|holds|grips|gripping|clutching)\b/i.test(text) && !/\b(?:palm|handle|fingers|grip around|thumb)\b/i.test(text)) add('hands', 'tip', 'Name the contact: an open palm, a handle or a cuff, and five fingers.');
    if (/\b(?:three|four|five|six|several|many|a group of|a crowd of)\s+(?:\w+\s)?(?:people|persons|women|men|characters|figures|friends|girls|boys)\b/i.test(text)) add('figures', 'tip', 'Three or more figures dilute attention at 8 steps; render them separately and composite.');
    if (/^(?:in this image|this image|the image)\b/i.test(text)) add('meta-opener', 'tip', 'Start with the subject or medium, not "In this image".');
    const segments = text.split(',').map(part => part.trim()).filter(Boolean);
    const sentences = (text.match(/[.!?](?:\s|$)/g) || []).length;
    if (segments.length >= 10 && words / segments.length < 3.5 && sentences <= 1) add('tag-list', 'warning', 'This reads like a tag list; the Qwen3-VL encoder wants prose sentences.');
    if (words < 25) add('short', 'tip', 'Short prompts leave Krea to improvise; add composition, light and materials.');
    return checks;
};

export interface Krea2SettingsPatch {
    comfySteps?: number; comfyCfg?: number; comfySampler?: string; comfyScheduler?: string; comfyKreaResolution?: string;
    edit?: { steps: number; cfg: number; sampler: string; scheduler: string; aspect: Krea2Aspect };
}

/** The resolution whose ratio is closest to the aspect; the first such entry on ties. */
export const closestKrea2Resolution = (aspect: Krea2Aspect, options: ReadonlyArray<{ value: string; width: number; height: number }>): string | undefined => {
    const [x, y] = aspect.split(':').map(Number);
    const distance = (option: { width: number; height: number }) => Math.abs(Math.log((option.width / option.height) / (x / y)));
    return options.reduce<{ value: string; width: number; height: number } | undefined>((best, option) => !best || distance(option) < distance(best) - 1e-9 ? option : best, undefined)?.value;
};

/** The guide's Turbo settings for a workflow; RAW receives only the resolution. */
export const krea2SkillSettings = (workflow: Krea2Workflow, aspect: Krea2Aspect, resolutions: ReadonlyArray<{ value: string; width: number; height: number }>): Krea2SettingsPatch => {
    const { steps, cfg, sampler, scheduler } = KREA2_TURBO_SETTINGS;
    if (workflow === 'krea2-edit') return { edit: { steps, cfg, sampler, scheduler, aspect } };
    const resolution = closestKrea2Resolution(aspect, resolutions);
    const sized = resolution ? { comfyKreaResolution: resolution } : {};
    return workflow === 'krea2-raw' ? sized : { comfySteps: steps, comfyCfg: cfg, comfySampler: sampler, comfyScheduler: scheduler, ...sized };
};

export const KREA2_WRITER_RULES = `You write prompts for Krea 2, whose text encoder is Qwen3-VL and which runs as Turbo at 8 steps and CFG 1.0.
- Write natural prose sentences, never a tag list. Word order is emphasis: open with the medium and the subject.
- Order: medium; subject and identity; appearance, pose, action and expression; composition and camera (one shot size, one angle, one lens); environment and spatial relations; light source, direction and quality, and colour; materials and micro-detail; mood; restrictions.
- Realism comes from camera, lens, light and named materials. Never use quality words such as 8k, masterpiece, best quality, ultra detailed or trending on artstation.
- State what is present. Negations do nothing at CFG 1.0, so describe the positive target instead.
- Text to render goes in double quotes, five words or fewer, on a flat surface facing the camera, counted ("exactly one").
- Count anything that must appear once. Dress characters from top to bottom and name the lower garment.
- Emphasis comes from words; do not write weights such as (word:1.5).
- Name the hand contact (open palm, handle, grip, five fingers) instead of a bare "holding".
- Never place a figure behind a table, desk, counter or bench; put props in the hands or on the floor.
- One action per zone. Two characters get one side and one action each. Avoid three or more figures.
- Speech bubbles and screens must be requested empty.
Return only the final prompt: one to three paragraphs of prose, 80 to 220 words, without a title, list, quotation marks around it, settings or commentary.`;

const FIELD_LABELS: Array<[keyof Krea2PromptDraft, string]> = [
    ['medium', 'Medium'], ['subject', 'Subject'], ['action', 'Appearance, pose and action'], ['composition', 'Composition and camera'],
    ['environment', 'Environment'], ['lighting', 'Light and colour'], ['materials', 'Materials and micro-detail'], ['mood', 'Mood'],
    ['text', 'Exact text to render'], ['restrictions', 'Restrictions'],
];

/** The instruction sent to a language model; the pose and style blocks are appended afterwards. */
export const krea2WriterInstruction = (draft: Krea2PromptDraft, workflow: Krea2Workflow, hasImage: boolean): string => {
    const fields = FIELD_LABELS.map(([key, label]) => [label, String(draft[key]).trim()]).filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
    const aspect = KREA2_ASPECTS.find(entry => entry.id === draft.aspect);
    return [
        KREA2_WRITER_RULES,
        workflow === 'krea2-edit' ? 'This prompt drives an image edit: describe the whole finished frame and refer to the person or scene as "image 1" (and "image 2" when a second reference is used).' : '',
        hasImage ? 'Analyse the attached reference image and record only visible facts: subject, count, composition, camera and lens feel, light direction and quality, palette, materials, medium and mood. Write a faithful prompt that reproduces them without inventing objects, then apply the requested changes, if any.' : '',
        aspect ? `Frame for ${aspect.id} (${aspect.use.toLowerCase()}).` : '',
        draft.idea.trim() ? `Brief: ${draft.idea.trim()}` : '',
        fields.length ? `Keep these choices:\n${fields.join('\n')}` : '',
        draft.style.trim() ? `The style block "${draft.style.trim()}" is appended after your text; do not name another style.` : '',
        draft.pose.trim() ? `A detailed "${draft.pose.trim()}" pose block is appended after your text; keep your pose wording consistent with it.` : '',
    ].filter(Boolean).join('\n\n');
};

/** Removes headings, fences and wrapping quotes that language models add around a prompt. */
export const cleanKrea2WriterOutput = (text: string): string => text.trim()
    .replace(/^```[a-z]*\s*|\s*```$/gi, '')
    .replace(/^\**\s*(?:positive prompt|prompt|krea ?2 prompt)\s*:?\s*\**\s*/i, '')
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim();
