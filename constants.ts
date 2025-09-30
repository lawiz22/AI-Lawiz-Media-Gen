// Fix: Import Banner type definitions to resolve type errors.
import type { BannerAspectRatio, BannerStyle, BannerLogoPlacement } from '../types';

// Fix: Removed circular dependency by defining MAX_IMAGES constant directly.
export const MAX_IMAGES = 12;

// Obfuscated poses to protect intellectual property
export const POSES = [
  "QSBwcm9mZXNzaW9uYWwgaGVhZHNob3QsIGZhY2luZyBmb3J3YXJkLCB3aXRoIGEgZ2VudGxlIHNtaWxlLg==",
  "VGhyZWUtcXVhcnRlciBwcm9maWxlLCBsb29raW5nIHRob3VnaHRmdWxseSBvdmVyIHRoZSBsZWZ0IHNob3VsZGVyIHRvd2FyZHMgdGhlIGNhbWVyYS4=",
  "QSBjYW5kaWQgc2hvdCwgc3ViamVjdCBsYXVnaGluZywgaGVhZCB0aWx0ZWQgc2xpZhtseSBibmFjay4=",
  "UHJvZmlsZSB2aWV3LCBsb29raW5nIGF3YXkgZnJvbSB0aGUgY2FtZXJhIGludG8gdGhlIGRpc3RhbmNlLCBzZXJlbmUgZXhwcmVzc2lvbi4=",
  "QXJtcyByYWlzZWQgb3ZlcmhlYWQsIGhhbmRzIGZvcm1pbmcgYSBjcmVhdGl2ZSBzaGFwZSwgbG9va2luZyBkaXJlY3RseSBhdCB0aGUgY2FtZXJhIHdpdGggY29uZmlkZW5jZS4=",
  "TGVhbmluZyBmb3J3YXJkIG9uIGEgdGFibGUsIGhhbmRzIGNsYXNwZWQsIG1ha2luZyBkaXJlY3QgZXllIGNvbnRhY3Qgd2l0aCB0aGUgY2FtZXJhLg==",
  "QSBzaG90IGZyb20gdGhlIGJhY2ssIHNob3dpbmcgdGhlIGhhaXJzdHlsZSBhbmQgc2hvdWxkZXXIgcG9zdHVyZSwgaGVhZCBzbGlnaHRseSB0dXJuZWQu",
  "TG93LWFuZ2xlIHNob3QsIHN1YmplY3QgbG9va2luZyB1cCBhbmQgYXdheSwgY3JlYXRpbmcgYSBzZW5zZSBvZiBhc3BpcmF0aW9uLg==",
  "THlpbmcgb24gdGhlaXIgc2lkZSBvbiBhIGZsYXQgc3VyZmFjZSwgcHJvcHBpbmcgdGhlaXIgaGVhZCB1cCB3aXRoIG9uZSBoYW5kLCBzbWlsaW5nIGF0IHRoZSBjYW1lcmEu",
  "QSBkeW5hbWljIHBvc2UsIG1pZC1tb3Rpb24sIHBlcmhhcHMgdHVybmluZyB0b3dhcmRzIHRoZSBjYW1lcmEgcXVpY2tseS4=",
  "U2VhdGVkIGNvbWZvcnRhYmx5IGluIGEgY2hhaXIsIHJlbGF4ZWQgcG9zdHVyZSwgbG9va2luZyBkaXJlY3RseSBhdCB0aGUgY2FtZXJhLg==",
  "QSBjbG9zZS11cCBzaG90IGZvY3VzaW5nIG9uIHRoZSBmYWNlLCB3aXRoIG9uZSBoYW5kIGdlbnRseSB0b3VjaGluZyB0aGUgY2hlZWsgb3IgY2hpbi4=",
  "QSBwb3dlciBwb3NlLCBzdGFuZGluZyB3aXRoIGhhbmRzIG9uIGhpcHMsIGxvb2tpbmcgc3Ryb25nIGFuZCBjb25maWRlbnQu"
];

export const PRESET_POSES = [
    { label: "Professional Headshot", value: POSES[0] },
    { label: "Thoughtful 3/4 Profile", value: POSES[1] },
    { label: "Candid Laughter", value: POSES[2] },
    { label: "Serene Profile View", value: POSES[3] },
    { label: "Creative Arms Overhead", value: POSES[4] },
    { label: "Leaning In (Focused)", value: POSES[5] },
    { label: "Over the Shoulder", value: POSES[6] },
    { label: "Aspirational Low-Angle", value: POSES[7] },
    { label: "Relaxed Side-Lying", value: POSES[8] },
    { label: "Dynamic Mid-Motion", value: POSES[9] },
    { label: "Comfortably Seated", value: POSES[10] },
    { label: "Gentle Close-Up", value: POSES[11] },
    { label: "Confident Power Pose", value: POSES[12] },
];

export const BACKGROUND_OPTIONS = [
    { value: 'black', label: 'Black' },
    { value: 'white', label: 'White' },
    { value: 'gray', label: 'Gray' },
    { value: 'green screen', label: 'Green Screen' },
    { value: 'natural studio', label: 'Natural Studio' },
    { value: 'original', label: 'Original' },
    { value: 'random', label: 'Random Prompt' },
    { value: 'prompt', label: 'Custom Prompt' },
    { value: 'image', label: 'Upload Image' },
];

export const ASPECT_RATIO_OPTIONS = [
    { value: '1:1', label: '1:1 (Square)' },
    { value: '3:4', label: '3:4 (Portrait)' },
    { value: '4:3', label: '4:3 (Landscape)' },
    { value: '9:16', label: '9:16 (Tall)' },
    { value: '16:9', label: '16:9 (Widescreen)' },
];

export const BANNER_ASPECT_RATIO_OPTIONS: { value: BannerAspectRatio; label: string }[] = [
    { value: '4:1', label: '4:1 (Ultra-Wide Horizontal)' },
    { value: '2:1', label: '2:1 (Wide Horizontal)' },
    { value: '16:9', label: '16:9 (Standard Widescreen)' },
    { value: '1.91:1', label: '1.91:1 (Social Feed)' },
    { value: '1:1', label: '1:1 (Square)' },
    { value: '9:16', label: '9:16 (Tall Vertical)' },
    { value: '1:2', label: '1:2 (Narrow Vertical)' },
    { value: '1:4', label: '1:4 (Skyscraper Vertical)' },
];

export const BANNER_STYLE_OPTIONS: { id: BannerStyle; label: string; description: string }[] = [
    { id: 'none', label: 'None (Prompt Only)', description: 'Relies purely on your prompt for styling.' },
    { id: 'corporate-clean', label: 'Corporate Clean', description: 'Professional, sharp lines, simple typography.' },
    { id: 'gaming-energetic', label: 'Gaming / Energetic', description: 'Dynamic, bold colors, action-oriented.' },
    { id: 'artistic-brush', label: 'Artistic / Brush', description: 'Painterly, abstract, expressive feel.' },
    { id: 'minimalist-type', label: 'Minimalist', description: 'Lots of negative space, focus on typography.' },
    { id: 'vintage-retro', label: 'Vintage / Retro', description: 'Old-school textures, fonts, and color schemes.' },
    { id: 'tech-glow', label: 'Tech / Glow', description: 'Dark background, neon lights, futuristic.' },
    { id: 'cinematic-photo', label: 'Cinematic', description: 'Photorealistic with dramatic lighting.' },
    { id: 'promotional-sale', label: 'Promotional / Sale', description: 'Bright, attention-grabbing, clear call-to-action.' },
    { id: 'watercolor-wash', label: 'Watercolor Wash', description: 'Soft, blended colors with a gentle, artistic feel.' },
    { id: 'collage', label: 'Photo Collage', description: 'A mix of different images, textures, and typography.' },
];

export const BANNER_LOGO_PLACEMENT_OPTIONS: { id: BannerLogoPlacement; label: string }[] = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-center', label: 'Top Center' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'middle-left', label: 'Middle Left' },
    { id: 'middle-center', label: 'Middle Center' },
    { id: 'middle-right', label: 'Middle Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-center', label: 'Bottom Center' },
    { id: 'bottom-right', label: 'Bottom Right' },
    { id: 'no-logo', label: 'No Logo' },
];

export const PHOTO_STYLE_OPTIONS = [
    { value: 'professional photoshoot', label: 'Professional Photoshoot' },
    { value: '35mm analog', label: '35mm Analog Film' },
    { value: 'polaroid', label: 'Old Polaroid' },
    { value: 'candid', label: 'Candid Photo' },
    { value: 'smartphone', label: 'Smartphone Photo' },
];

export const IMAGE_STYLE_OPTIONS = [
    { value: 'photorealistic', label: 'Photorealistic' },
    { value: 'cartoon', label: 'Cartoon' },
    { value: 'comic book style', label: 'Comic Book' },
    { value: 'anime', label: 'Anime / Manga' },
    { value: 'oil painting', label: 'Oil Painting' },
    { value: 'watercolor painting', label: 'Watercolor' },
    { value: 'impressionism', label: 'Impressionism' },
    { value: 'charcoal sketch', label: 'Charcoal Sketch' },
    { value: 'cubism', label: 'Cubism' },
    { value: 'surrealism', label: 'Surrealism' },
    { value: 'pixel art', label: 'Pixel Art' },
];

export const ERA_STYLE_OPTIONS = [
    { value: 'a modern digital photograph', label: 'Modern Digital' },
    { value: 'a 1990s magazine ad', label: '1990s Magazine Ad' },
    { value: 'a 1970s film look', label: '1970s Film Look' },
    { value: 'a high-contrast film noir style photograph', label: 'Film Noir (B&W)' },
    { value: 'a classical Dutch Master painting', label: 'Dutch Master Painting' },
    { value: 'a high-fashion Vogue magazine shot', label: 'Vogue Fashion Shot' },
];

export const CAMERA_MOVES = [
    { value: '', label: 'None' },
    { value: 'a smooth horizontal pan from left to right, revealing the scene', label: 'Pan (Reveal)' },
    { value: 'a slow vertical tilt upwards, starting from the ground and ending on the subject\'s face', label: 'Tilt (Upwards)' },
    { value: 'a steady tracking shot, the camera moves alongside the subject', label: 'Tracking / Dolly' },
    { value: 'a slow, dramatic push-in, moving closer to the subject to heighten emotion', label: 'Push-in (Dramatic)' },
    { value: 'a gradual pull-out, starting on a detail and revealing the wider environment', label: 'Pull-out (Reveal)' },
    { value: 'an epic crane shot, starting at eye-level and rising high above the scene', label: 'Crane Shot (Epic)' },
    { value: 'The camera orbits the subject in a smooth 180-degree arc, showcasing them from multiple angles', label: 'Orbit (Arc)' },
    { value: 'From the subject\'s point of view (POV), showing the world through their eyes', label: 'POV (First Person)' },
    { value: 'an over-the-shoulder shot, looking past one subject to focus on another', label: 'Over-the-Shoulder' },
    { value: 'a smooth steadicam shot, following the subject with a fluid, handheld feel', label: 'Steadicam (Following)' },
    { value: 'The action unfolds in cinematic slow motion, emphasizing every detail', label: 'Slow Motion' },
    { value: 'a dramatic time-lapse, showing the passage of time in the environment', label: 'Time-lapse' },
    { value: 'a rack focus shot, where the focus shifts from a foreground object to the subject in the background', label: 'Rack Focus (Shift)' },
    { value: 'a dramatic dolly zoom, the camera moves in while zooming out, creating a vertigo effect on the background', label: 'Dolly Zoom (Vertigo)' },
    { value: 'a sweeping jib shot, moving the camera in a fluid arc both horizontally and vertically', label: 'Jib Shot (Arc)' },
    { value: 'a Dutch angle shot, with the camera tilted to create a sense of unease or dynamism', label: 'Dutch Angle (Tilted)' },
    { value: 'a close-up on the face, with dramatic focus', label: 'Close-up (Face)'},
    { value: 'a wide shot showing the full environment and subject', label: 'Wide Shot (Full Scene)'},
];

export const WAN_VIDEO_PROMPT_BLOCKS = {
  fantasy: {
    subjects: ['A knight in shining armor', 'A sorceress with glowing runes', 'A dragon with massive wings', 'A ghostly warrior with a flaming sword'],
    environments: ['in a misty enchanted forest', 'on top of a crumbling castle tower', 'inside a glowing crystal cave', 'in a battlefield under a blood-red moon'],
    styles: ['epic cinematic lighting', 'dark and gothic atmosphere', 'high fantasy illustration style', 'painterly oil-painting look'],
  },
  'sci-fi': {
    subjects: ['A cyberpunk woman with neon hair', 'A giant mech robot with glowing eyes', 'A hacker wearing a glowing VR visor', 'A spaceship shaped like a blade'],
    environments: ['in a rainy neon-lit alley', 'on a futuristic rooftop at night', 'inside a high-tech control room', 'hovering above a desert planet with two suns'],
    styles: ['cinematic 4K, lens flare', 'neon glow, vaporwave colors', 'ultra-realistic sci-fi look', 'animated anime cyberpunk style'],
  },
  nature: {
    subjects: ['A lion running across the savannah', 'A flock of birds flying in formation', 'A surfer riding a massive wave', 'A lone explorer climbing a snowy mountain'],
    environments: ['at sunrise with golden light', 'in a storm with heavy rain', 'underwater with glowing coral', 'on a windy desert dune'],
    styles: ['documentary realism', 'cinematic time-lapse', 'National Geographic style', 'dreamlike pastel color grading'],
  },
  artistic: {
    subjects: ['A giant floating jellyfish', 'A ballerina made of glass', 'A fox painted in watercolor style', 'A shadow figure glowing with light'],
    environments: ['in a dreamlike void of pastel clouds', 'on a rooftop above a glowing city', 'inside a swirling galaxy', 'in a landscape melting like paint'],
    styles: ['surreal dreamlike visuals', 'watercolor painting', 'VHS retro glitch', 'trippy kaleidoscope effect'],
  },
};

export const WAN_T2V_ASPECT_RATIO_OPTIONS = [
    { value: '856x480', label: 'Landscape (SD - 856x480)' },
    { value: '1280x720', label: 'Landscape (HD - 1280x720)' },
    { value: '480x856', label: 'Portrait (SD - 480x856)' },
    { value: '720x1280', label: 'Portrait (HD - 720x1280)' },
];

// --- For Clothing Randomization ---
export const CLOTHING_ADJECTIVES = ['stylish', 'elegant', 'casual', 'formal', 'vintage', 'modern', 'cozy', 'rugged', 'chic', 'minimalist', 'bohemian', 'vibrant', 'dark', 'lightweight', 'tailored'];
export const CLOTHING_COLORS = ['black', 'white', 'charcoal gray', 'navy blue', 'khaki', 'olive green', 'burgundy', 'crimson red', 'pastel pink', 'sky blue', 'sunflower yellow', 'cream', 'beige', 'forest green'];
export const CLOTHING_MATERIALS = ['leather', 'denim', 'cotton', 'silk', 'wool', 'linen', 'suede', 'corduroy', 'velvet', 'cashmere', 'twill', 'fleece'];
export const CLOTHING_ITEMS = ['jacket', 'blouse', 't-shirt', 'sweater', 'trench coat', 'dress shirt', 'hoodie', 'blazer', 'vest', 'cardigan', 'polo shirt', 'button-up shirt'];
export const CLOTHING_DETAILS = ['subtle embroidery', 'gold buttons', 'a high collar', 'rolled-up sleeves', 'a unique pattern', 'distressed details', 'a cinched waist', 'puffy sleeves', 'a simple logo', 'contrast stitching'];

// --- For Background Randomization ---
export const BACKGROUND_LOCATIONS = ['a futuristic city', 'a serene forest', 'a sun-drenched beach', 'a minimalist studio', 'a grand ballroom', 'a neon-lit alley', 'a cozy library', 'a mountain peak', 'a rustic barn', 'an abandoned warehouse', 'a rooftop garden'];
export const BACKGROUND_STYLES = ['with cinematic lighting', 'with soft, diffused light', 'in a hyperrealistic style', 'with a bokeh effect', 'in a moody, dramatic atmosphere', 'with vibrant, saturated colors', 'in a black and white film noir style', 'with a dreamy, ethereal glow'];
export const BACKGROUND_TIMES_OF_DAY = ['at sunrise', 'during the golden hour', 'at midnight', 'on an overcast day', 'at high noon', 'during a thunderstorm'];
export const BACKGROUND_DETAILS = ['with subtle fog', 'with light rays streaming through', 'with reflections on wet pavement', 'with floating particles of dust', 'with a clean, uncluttered look', 'with intricate architectural details'];

// --- For Pose Randomization ---
export const POSE_ACTIONS = ['standing', 'sitting', 'leaning', 'looking', 'reaching', 'holding', 'walking', 'turning', 'crouching', 'jumping'];
export const POSE_MODIFIERS = ['confidently', 'thoughtfully', 'playfully', 'serenely', 'dramatically', 'casually', 'elegantly', 'powerfully', 'gently', 'energetically'];
export const POSE_DIRECTIONS = ['towards the camera', 'away from the camera', 'over the shoulder', 'to the side', 'upwards', 'downwards', 'with head tilted'];
export const POSE_DETAILS = ['with arms crossed', 'with hands on hips', 'with one hand on their chin', 'with a slight smile', 'with a neutral expression', 'in mid-stride', 'with hands in pockets', 'tucking hair behind an ear'];

// --- For Text on Image Randomization ---
export const TEXT_OBJECT_PROMPTS = [
    "a sign in the background that reads '%s'",
    "a t-shirt with the text '%s' printed on the front",
    "a coffee mug held by the person with '%s' written on it",
    "a neon sign glowing in the background that says '%s'",
    "a book with the title '%s' on the cover",
    "graffiti on a wall behind the person that says '%s'",
    "a handheld banner that reads '%s'",
    "a newspaper with the headline '%s'",
];

// --- ComfyUI Workflow Template (SD 1.5) ---
export const COMFYUI_SD15_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 8565685,
      "steps": 20,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": [ "4", 0 ],
      "positive": [ "6", 0 ],
      "negative": [ "7", 0 ],
      "latent_image": [ "5", 0 ]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "4": {
    "inputs": { "ckpt_name": "v1-5-pruned-emaonly.safetensors" },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "5": {
    "inputs": { "width": 512, "height": 512, "batch_size": 1 },
    "class_type": "EmptyLatentImage",
    "_meta": { "title": "Empty Latent Image" }
  },
  "6": {
    "inputs": {
      "text": "A photorealistic image of a person",
      "clip": [ "4", 1 ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "7": {
    "inputs": {
      "text": "blurry, bad quality, low-res, ugly, deformed, disfigured",
      "clip": [ "4", 1 ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "8": {
    "inputs": { "samples": [ "3", 0 ], "vae": [ "4", 2 ] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": { "images": [ "8", 0 ] },
    "class_type": "PreviewImage",
    "_meta": { "title": "Preview Image" }
  }
};


// --- ComfyUI Workflow Template (SDXL) ---
export const COMFYUI_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 8565685,
      "steps": 25,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": [ "4", 0 ],
      "positive": [ "6", 0 ],
      "negative": [ "7", 0 ],
      "latent_image": [ "5", 0 ]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "4": {
    "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "5": {
    "inputs": { "width": 1024, "height": 1024, "batch_size": 1 },
    "class_type": "EmptyLatentImage",
    "_meta": { "title": "Empty Latent Image" }
  },
  "6": {
    "inputs": {
      "text": "A photorealistic image of a person",
      "clip": [ "4", 1 ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "7": {
    "inputs": {
      "text": "blurry, bad quality, low-res, ugly, deformed, disfigured",
      "clip": [ "4", 1 ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "8": {
    "inputs": { "samples": [ "3", 0 ], "vae": [ "4", 2 ] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": { "images": [ "8", 0 ] },
    "class_type": "PreviewImage",
    "_meta": { "title": "Preview Image" }
  }
};

// --- ComfyUI WAN 2.2 Workflow ---
export const COMFYUI_WAN22_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": { "text": "positive prompt here", "clip": ["14", 1] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "4": {
    "inputs": { "text": "negative prompt here", "clip": ["14", 1] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "5": {
    "inputs": { "width": 1280, "height": 720, "batch_size": 1, "length": 1 },
    "class_type": "EmptyHunyuanLatentVideo",
    "_meta": { "title": "Empty Latent" }
  },
  "8": {
    "inputs": { "vae_name": "wan_2.1_vae.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "VAE Loader" }
  },
  "9": {
    "inputs": { "samples": ["36", 0], "vae": ["8", 0] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "10": {
    "inputs": { "filename_prefix": "ComfyUI", "images": ["9", 0] },
    "class_type": "SaveImage",
    "_meta": { "title": "Save Image" }
  },
  "14": {
    "inputs": { "lora_name": "stock_photography_wan22_HIGH_v1.safetensors", "strength_model": 1.5, "strength_clip": 1.5, "model": ["29", 0], "clip": ["29", 1] },
    "class_type": "LoraLoader",
    "_meta": { "title": "Stock LoRA (High)" }
  },
  "22": {
    "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan" },
    "class_type": "CLIPLoader",
    "_meta": { "title": "CLIP Loader" }
  },
  "29": {
    "inputs": { "lora_name": "Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors", "strength_model": 0.6, "strength_clip": 0.6, "model": ["30", 0], "clip": ["30", 1] },
    "class_type": "LoraLoader",
    "_meta": { "title": "Lightning LoRA (High)" }
  },
  "30": {
    "inputs": { "lora_name": "Wan2.1_T2V_14B_FusionX_LoRA.safetensors", "strength_model": 0.8, "strength_clip": 0.8, "model": ["38", 0], "clip": ["22", 0] },
    "class_type": "LoraLoader",
    "_meta": { "title": "FusionX LoRA" }
  },
  "35": {
    "inputs": { "add_noise": "enable", "noise_seed": 123, "control_after_generate": "randomize", "steps": 6, "cfg": 1, "sampler_name": "res_2s", "scheduler": "bong_tangent", "start_at_step": 0, "end_at_step": 3, "return_with_leftover_noise": "disable", "model": ["14", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0] },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler Pass 1 (High)" }
  },
  "36": {
    "inputs": { "add_noise": "enable", "noise_seed": 123, "control_after_generate": "fixed", "steps": 6, "cfg": 1, "sampler_name": "res_2s", "scheduler": "bong_tangent", "start_at_step": 3, "end_at_step": 6, "return_with_leftover_noise": "disable", "model": ["45", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["35", 0] },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "KSampler Pass 2 (Low)" }
  },
  "38": {
    "inputs": { "unet_name": "Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf" },
    "class_type": "UnetLoaderGGUF",
    "_meta": { "title": "Unet GGUF (High)" }
  },
  "39": {
    "inputs": { "unet_name": "Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf" },
    "class_type": "UnetLoaderGGUF",
    "_meta": { "title": "Unet GGUF (Low)" }
  },
  "43": {
    "inputs": { "lora_name": "Wan2.1_T2V_14B_FusionX_LoRA.safetensors", "strength_model": 0.8, "model": ["39", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "FusionX LoRA (Low)" }
  },
  "44": {
    "inputs": { "lora_name": "Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors", "strength_model": 0.6, "model": ["43", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "Lightning LoRA (Low)" }
  },
  "45": {
    "inputs": { "lora_name": "stock_photography_wan22_LOW_v1.safetensors", "strength_model": 1.5, "model": ["44", 0] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "Stock LoRA (Low)" }
  }
};

// --- ComfyUI Nunchaku Kontext Flux Workflow ---
export const COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE = {
    "1": {
        "inputs": { "vae_name": "ae.safetensors" },
        "class_type": "VAELoader",
        "_meta": { "title": "VAELoader" }
    },
    "2": {
        "inputs": {
            "clip_name1": "ViT-L-14-TEXT-detail-improved-hiT-GmP-TE-only-HF.safetensors",
            "clip_name2": "t5xxl_fp8_e4m3fn_scaled.safetensors",
            "type": "flux",
            "behavior": "default"
        },
        "class_type": "DualCLIPLoader",
        "_meta": { "title": "DualCLIPLoader" }
    },
    "3": {
        "inputs": {
            "text": "",
            "clip": ["2", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Negative Prompt" }
    },
    "5": {
        "inputs": { "filename_prefix": "ComfyUI_Nunchaku", "images": ["7", 0] },
        "class_type": "SaveImage",
        "_meta": { "title": "Save Image" }
    },
    "7": {
        "inputs": { "samples": ["20", 0], "vae": ["1", 0] },
        "class_type": "VAEDecode",
        "_meta": { "title": "VAEDecode" }
    },
    "8": {
        "inputs": { "pixels": ["9", 0], "vae": ["1", 0] },
        "class_type": "VAEEncode",
        "_meta": { "title": "VAEEncode" }
    },
    "9": {
        "inputs": { "image": ["99", 0] },
        "class_type": "FluxKontextImageScale",
        "_meta": { "title": "FluxKontextImageScale" }
    },
    "12": {
        "inputs": { "guidance": 2.5, "conditioning": ["17", 0] },
        "class_type": "FluxGuidance",
        "_meta": { "title": "FluxGuidance" }
    },
    "17": {
        "inputs": { "conditioning": ["25", 0], "latent": ["8", 0] },
        "class_type": "ReferenceLatent",
        "_meta": { "title": "ReferenceLatent" }
    },
    "20": {
        "inputs": {
            "seed": 123,
            "control_after_generate": "randomize",
            "steps": 10,
            "cfg": 1,
            "sampler_name": "euler",
            "scheduler": "simple",
            "denoise": 1,
            "model": ["28", 0],
            "positive": ["12", 0],
            "negative": ["3", 0],
            "latent_image": ["8", 0]
        },
        "class_type": "KSampler",
        "_meta": { "title": "KSampler" }
    },
    "22": {
        "inputs": {
            "model_path": "svdq-int4_r32-flux.1-kontext-dev.safetensors",
            "turbo": 0,
            "precision": "nunchaku-fp16",
            "cache_threshold": 0.12,
            "device_id": 0,
            "data_type": "bfloat16",
            "cpu_offload": "enable",
            "attention": "nunchaku-fp16"
        },
        "class_type": "NunchakuFluxDiTLoader",
        "_meta": { "title": "NunchakuFluxDiTLoader" }
    },
    "25": {
        "inputs": {
            "text": "change the shirt to be red",
            "clip": ["2", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": { "title": "Positive Prompt" }
    },
    "26": {
        "inputs": {
            "lora_name": "flux-turbo.safetensors",
            "lora_strength": 1,
            "model": ["22", 0]
        },
        "class_type": "NunchakuFluxLoraLoader",
        "_meta": { "title": "Turbo LoRA" }
    },
    "27": {
        "inputs": {
            "lora_name": "JD3s_Nudify_Kontext.safetensors",
            "lora_strength": 1,
            "model": ["26", 0]
        },
        "class_type": "NunchakuFluxLoraLoader",
        "_meta": { "title": "Nudify LoRA" }
    },
    "28": {
        "inputs": {
            "lora_name": "flux_nipples_saggy_breasts.safetensors",
            "lora_strength": 1,
            "model": ["27", 0]
        },
        "class_type": "NunchakuFluxLoraLoader",
        "_meta": { "title": "Detail LoRA" }
    },
    "99": {
        "inputs": { "image": "source_image.png", "upload": "image" },
        "class_type": "LoadImage",
        "_meta": { "title": "Load Source Image" }
    }
};

// --- ComfyUI Nunchaku Flux Image Workflow ---
export const COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE = {
  "6": {
    "inputs": { "text": "a prompt", "clip": ["44", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "8": {
    "inputs": { "samples": ["13", 0], "vae": ["10", 0] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAEDecode" }
  },
  "10": {
    "inputs": { "vae_name": "ae.safetensors" },
    "class_type": "VAELoader",
    "_meta": { "title": "VAELoader" }
  },
  "13": {
    "inputs": { "noise": ["25", 0], "guider": ["22", 0], "sampler": ["16", 0], "sigmas": ["17", 0], "latent_image": ["27", 0] },
    "class_type": "SamplerCustomAdvanced",
    "_meta": { "title": "SamplerCustomAdvanced" }
  },
  "16": {
    "inputs": { "sampler_name": "res_2s" },
    "class_type": "KSamplerSelect",
    "_meta": { "title": "KSamplerSelect" }
  },
  "17": {
    "inputs": { "scheduler": "bong_tangent", "steps": 10, "end_step": 1, "model": ["30", 0], "denoise": 1 },
    "class_type": "BasicScheduler",
    "_meta": { "title": "BasicScheduler" }
  },
  "22": {
    "inputs": { "conditioning": ["26", 0], "model": ["30", 0] },
    "class_type": "BasicGuider",
    "_meta": { "title": "BasicGuider" }
  },
  "25": {
    "inputs": { "noise_seed": 50998438702246, "control_after_generate": "randomize" },
    "class_type": "RandomNoise",
    "_meta": { "title": "RandomNoise" }
  },
  "26": {
    "inputs": { "guidance": 3.5, "conditioning": ["6", 0] },
    "class_type": "FluxGuidance",
    "_meta": { "title": "FluxGuidance" }
  },
  "27": {
    "inputs": { "width": 768, "height": 768, "batch_size": 1 },
    "class_type": "EmptySD3LatentImage",
    "_meta": { "title": "EmptySD3LatentImage" }
  },
  "30": {
    "inputs": { "base_shift": 1.0, "max_shift": 1.15, "gamma": 0.5, "width": 768, "height": 768, "model": ["47", 0] },
    "class_type": "ModelSamplingFlux",
    "_meta": { "title": "ModelSamplingFlux" }
  },
  "44": {
    "inputs": {
      "behavior": "disable",
      "text_encoder1": "clip_l.safetensors",
      "text_encoder2": "t5xxl_fp16.safetensors",
      "text_projection_path": "none",
      "model_type": "flux",
      "t5_min_length": 512,
      "use_4bit_t5": "disable",
      "int4_model": "none"
    },
    "class_type": "NunchakuTextEncoderLoader",
    "_meta": { "title": "NunchakuTextEncoderLoader" }
  },
  "45": {
    "inputs": { "attention": "nunchaku-fp16", "cache_threshold": 0, "cpu_offload": "enable", "data_type": "bfloat16", "device_id": 0, "model_path": "svdq-int4_r32-flux.1-kontext-dev.safetensors", "precision": "nunchaku-fp16", "turbo": 0 },
    "class_type": "NunchakuFluxDiTLoader",
    "_meta": { "title": "NunchakuFluxDiTLoader" }
  },
  "46": {
    "inputs": { "lora_name": "flux-turbo.safetensors", "lora_strength": 1, "model": ["45", 0] },
    "class_type": "NunchakuFluxLoraLoader",
    "_meta": { "title": "Turbo LoRA" }
  },
  "47": {
    "inputs": { "lora_name": "flux_nipples_saggy_breasts.safetensors", "lora_strength": 1, "model": ["48", 0] },
    "class_type": "NunchakuFluxLoraLoader",
    "_meta": { "title": "Detail LoRA" }
  },
  "48": {
    "inputs": { "lora_name": "JD3s_Nudify_Kontext.safetensors", "lora_strength": 1.12, "model": ["46", 0] },
    "class_type": "NunchakuFluxLoraLoader",
    "_meta": { "title": "Nudify LoRA" }
  },
  "99": {
    "inputs": { "images": ["8", 0] },
    "class_type": "PreviewImage",
    "_meta": { "title": "Preview Image" }
  }
};

// --- ComfyUI Flux Krea Workflow ---
export const COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE = {
  "6": {
    "inputs": {
      "text": "a young woman",
      "clip": [
        "191",
        1
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "26": {
    "inputs": {
      "clip_name2": "t5-v1_1-xxl-encoder-Q5_K_M.gguf",
      "clip_name1": "clip_l.safetensors",
      "type": "flux"
    },
    "class_type": "DualCLIPLoaderGGUF"
  },
  "27": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader"
  },
  "51": {
    "inputs": {
      "seed": 712880534045960,
      "steps": 10,
      "cfg": 1,
      "sampler_name": "dpmpp_2m",
      "scheduler": "karras",
      "denoise": 0.8,
      "model": [
        "191",
        0
      ],
      "positive": [
        "217",
        0
      ],
      "negative": [
        "187",
        0
      ],
      "latent_image": [
        "110",
        0
      ]
    },
    "class_type": "KSampler",
    "mode": 2
  },
  "100": {
    "inputs": {
      "upscale_model": [
        "101",
        0
      ],
      "image": [
        "164",
        0
      ]
    },
    "class_type": "ImageUpscaleWithModel",
    "mode": 2
  },
  "101": {
    "inputs": {
      "model_name": "4x_NMKD-Siax_200k.pth"
    },
    "class_type": "UpscaleModelLoader",
    "mode": 2
  },
  "102": {
    "inputs": {
      "scale_by": 0.5,
      "upscale_method": "lanczos",
      "image": [
        "100",
        0
      ]
    },
    "class_type": "ImageScaleBy",
    "mode": 2
  },
  "110": {
    "inputs": {
      "pixels": [
        "102",
        0
      ],
      "vae": [
        "27",
        0
      ]
    },
    "class_type": "VAEEncode",
    "mode": 2
  },
  "111": {
    "inputs": {
      "samples": [
        "51",
        0
      ],
      "vae": [
        "27",
        0
      ]
    },
    "class_type": "VAEDecode",
    "mode": 2
  },
  "162": {
    "inputs": {
      "width": 896,
      "height": 1216,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage"
  },
  "163": {
    "inputs": {
      "seed": 5000,
      "steps": 20,
      "cfg": 1,
      "sampler_name": "res_2s",
      "scheduler": "bong_tangent",
      "denoise": 1,
      "model": [
        "191",
        0
      ],
      "positive": [
        "218",
        0
      ],
      "negative": [
        "187",
        0
      ],
      "latent_image": [
        "162",
        0
      ]
    },
    "class_type": "KSampler"
  },
  "164": {
    "inputs": {
      "samples": [
        "163",
        0
      ],
      "vae": [
        "27",
        0
      ]
    },
    "class_type": "VAEDecode"
  },
  "170": {
    "inputs": {
      "filename_prefix": "UP",
      "images": [
        "111",
        0
      ]
    },
    "class_type": "SaveImage",
    "title": "Save Image UPSCALED",
    "mode": 2
  },
  "171": {
    "inputs": {
      "filename_prefix": "img",
      "images": [
        "164",
        0
      ]
    },
    "class_type": "SaveImage",
    "title": "Save Image Original"
  },
  "186": {
    "inputs": {
      "unet_name": "flux1-krea-dev-Q5_K_M.gguf"
    },
    "class_type": "UnetLoaderGGUF"
  },
  "187": {
    "inputs": {
      "conditioning": [
        "6",
        0
      ]
    },
    "class_type": "ConditioningZeroOut"
  },
  "191": {
    "inputs": {
      "model": [
        "186",
        0
      ],
      "clip": [
        "26",
        0
      ]
    },
    "class_type": "Power Lora Loader (rgthree)",
    "properties": {
      "Show Strengths": "Single Strength"
    },
    "widgets_values": [
      {},
      {
        "type": "PowerLoraLoaderHeaderWidget"
      },
      {
        "on": false,
        "lora": "p1x4r0ma_woman.safetensors",
        "strength": 0.9
      },
      {
        "on": true,
        "lora": "nipplediffusion-saggy-f1.safetensors",
        "strength": 1
      },
      {
        "on": false,
        "lora": "pussydiffusion-f1.safetensors",
        "strength": 1
      },
      {},
      ""
    ]
  },
  "217": {
    "inputs": {
      "guidance": 3.5,
      "conditioning": [
        "6",
        0
      ]
    },
    "class_type": "FluxGuidance"
  },
  "218": {
    "inputs": {
      "guidance": 3.5,
      "conditioning": [
        "6",
        0
      ]
    },
    "class_type": "FluxGuidance"
  }
};

// --- ComfyUI WAN 2.2 Image-to-Video (First/Last Frame) Workflow ---
export const COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE = {
  "6": { "inputs": { "text": ["112", 0], "clip": [ "107", 0 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
  "7": { "inputs": { "text": "negative prompt", "clip": [ "107", 0 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative Prompt)" } },
  "8": { "inputs": { "samples": [ "102", 0 ], "vae": [ "39", 0 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAEDecode" } },
  "39": { "inputs": { "vae_name": "wan_2.1_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "VAELoader" } },
  "49": { "inputs": { "clip_name": "clip_vision_h.safetensors" }, "class_type": "CLIPVisionLoader", "_meta": { "title": "CLIPVisionLoader" } },
  "51": { "inputs": { "crop": "none", "clip_vision": [ "49", 0 ], "image": [ "52", 0 ] }, "class_type": "CLIPVisionEncode", "_meta": { "title": "CLIPVisionEncode" } },
  "52": { "inputs": { "image": "start_image.png", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load Start Image" } },
  "72": { "inputs": { "image": "end_image.png", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load End Image" } },
  "79": { "inputs": { "shift": 8, "model": [ "94", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModelSamplingSD3" } },
  "83": { "inputs": { "width": 848, "height": 560, "length": 65, "batch_size": 1, "positive": [ "6", 0 ], "negative": [ "7", 0 ], "vae": [ "39", 0 ], "clip_vision_start_image": [ "51", 0 ], "clip_vision_end_image": [ "87", 0 ], "start_image": [ "52", 0 ], "end_image": [ "72", 0 ] }, "class_type": "WanFirstLastFrameToVideo", "_meta": { "title": "WanFirstLastFrameToVideo" } },
  "87": { "inputs": { "crop": "none", "clip_vision": [ "49", 0 ], "image": [ "72", 0 ] }, "class_type": "CLIPVisionEncode", "_meta": { "title": "CLIPVisionEncode" } },
  "93": { "inputs": { "shift": 8, "model": [ "95", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModelSamplingSD3" } },
  "94": { "inputs": { "lora_name": "Wan2.2-Lightning_I2V-A14B-4steps-lora_HIGH_fp16.safetensors", "strength_model": 2, "model": [ "105", 0 ] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoraLoaderModelOnly" } },
  "95": { "inputs": { "lora_name": "Wan2.2-Lightning_I2V-A14B-4steps-lora_LOW_fp16.safetensors", "strength_model": 1, "model": [ "106", 0 ] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoraLoaderModelOnly" } },
  "96": { "inputs": { "sage_attention": "auto", "model": [ "79", 0 ] }, "class_type": "PathchSageAttentionKJ", "_meta": { "title": "PathchSageAttentionKJ" } },
  "98": { "inputs": { "sage_attention": "auto", "model": [ "93", 0 ] }, "class_type": "PathchSageAttentionKJ", "_meta": { "title": "PathchSageAttentionKJ" } },
  "101": { "inputs": { "add_noise": "enable", "noise_seed": 395665879778624, "control_after_generate": "randomize", "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 3, "return_with_leftover_noise": "enable", "model": [ "96", 0 ], "positive": [ "83", 0 ], "negative": [ "83", 1 ], "latent_image": [ "83", 2 ] }, "class_type": "KSamplerAdvanced", "_meta": { "title": "High Noise - KSampler (Advanced)" } },
  "102": { "inputs": { "add_noise": "disable", "noise_seed": 0, "control_after_generate": "fixed", "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 3, "end_at_step": 10000, "return_with_leftover_noise": "disable", "model": [ "98", 0 ], "positive": [ "83", 0 ], "negative": [ "83", 1 ], "latent_image": [ "101", 0 ] }, "class_type": "KSamplerAdvanced", "_meta": { "title": "Low Noise - KSampler (Advanced)" } },
  "105": { "inputs": { "unet_name": "Wan2.2-I2V-A14B-HighNoise-Q5_K_M.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "UnetLoaderGGUF" } },
  "106": { "inputs": { "unet_name": "Wan2.2-I2V-A14B-LowNoise-Q5_K_M.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "UnetLoaderGGUF" } },
  "107": { "inputs": { "clip_name": "umt5-xxl-encoder-Q5_K_M.gguf", "type": "wan" }, "class_type": "CLIPLoaderGGUF", "_meta": { "title": "CLIPLoaderGGUF" } },
  "111": { "inputs": { "frame_rate": 24, "loop_count": 0, "filename_prefix": "GeneratedVideo_", "format": "video/nvenc_h264-mp4", "pix_fmt": "yuv420p", "bitrate": 10, "megabit": true, "save_metadata": true, "pingpong": false, "save_output": true, "images": [ "114", 0 ] }, "class_type": "VHS_VideoCombine", "_meta": { "title": "Video Final" } },
  "112": { "inputs": { "string": "positive prompt", "strip_newlines": true }, "class_type": "StringConstantMultiline", "_meta": { "title": "Prompt Action" }},
  "114": { "inputs": { "grain_intensity": 0.02, "saturation_mix": 0.3, "images": [ "8", 0 ] }, "class_type": "FastFilmGrain", "_meta": { "title": "FastFilmGrain" } }
};

// --- ComfyUI WAN 2.2 Text-to-Video Workflow ---
export const COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE = {
  "6": {
    "inputs": { "text": "A confident woman with red hair in a vibrant patterned dress against a plain green background., at sunrise with golden light, a steady tracking shot, the camera moves alongside the subject", "clip": [ "107", 0 ] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
  },
  "7": {
    "inputs": { "text": "blurry, low quality, pixelated, distorted, out of frame, cropped, watermark, text, bad anatomy, disfigured, mutated, extra limbs, extra arms, extra legs, extra fingers, fused fingers, deformed hands, disconnected limbs, broken body, twisted posture, bad face, deformed face, asymmetrical face, mutated eyes, long neck, short limbs, unnatural body, flickering, jitter, duplicated body, ghosting, static pose, unnatural movement, stiff animation, camera shake, distorted perspective, ugly, poorly drawn, cartoon, 3d render, cgi", "clip": [ "107", 0 ] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
  },
  "8": { "inputs": { "samples": [ "102", 0 ], "vae": [ "39", 0 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "39": { "inputs": { "vae_name": "wan_2.1_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Charger VAE" } },
  "79": { "inputs": { "shift": 8, "model": [ "94", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModèleÉchantillonnageSD3" } },
  "93": { "inputs": { "shift": 8, "model": [ "95", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModèleÉchantillonnageSD3" } },
  "94": {
    "inputs": { "lora_name": "Wan2.2-Lightning_T2V-A14B-4steps-lora_HIGH_fp16.safetensors", "strength_model": 2.0, "model": [ "105", 0 ] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "LoraLoaderModelOnly" }
  },
  "95": {
    "inputs": { "lora_name": "Wan2.2-Lightning_T2V-A14B-4steps-lora_LOW_fp16.safetensors", "strength_model": 1, "model": [ "106", 0 ] },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "LoraLoaderModelOnly" }
  },
  "96": { "inputs": { "sage_attention": "auto", "model": [ "79", 0 ] }, "class_type": "PathchSageAttentionKJ", "_meta": { "title": "Patch Sage Attention KJ" } },
  "98": { "inputs": { "sage_attention": "auto", "model": [ "93", 0 ] }, "class_type": "PathchSageAttentionKJ", "_meta": { "title": "Patch Sage Attention KJ" } },
  "101": {
    "inputs": { "add_noise": "enable", "noise_seed": 1115662785009348, "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 3, "return_with_leftover_noise": "enable", "model": [ "96", 0 ], "positive": [ "117", 0 ], "negative": [ "117", 1 ], "latent_image": [ "117", 2 ] },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "High Noise - KSampler (Advanced)" }
  },
  "102": {
    "inputs": { "add_noise": "disable", "noise_seed": 0, "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 3, "end_at_step": 10000, "return_with_leftover_noise": "disable", "model": [ "98", 0 ], "positive": [ "6", 0 ], "negative": [ "7", 0 ], "latent_image": [ "101", 0 ] },
    "class_type": "KSamplerAdvanced",
    "_meta": { "title": "Low Noise - KSampler (Advanced)" }
  },
  "105": { "inputs": { "unet_name": "Wan2.2-T2V-A14B-HighNoise-Q5_K_M.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "Unet Loader (GGUF)" } },
  "106": { "inputs": { "unet_name": "Wan2.2-T2V-A14B-LowNoise-Q5_K_M.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "Unet Loader (GGUF)" } },
  "107": { "inputs": { "clip_name": "umt5-xxl-encoder-Q5_K_M.gguf", "type": "wan" }, "class_type": "CLIPLoaderGGUF", "_meta": { "title": "CLIPLoader (GGUF)" } },
  "111": {
    "inputs": { "frame_rate": 17.599853515625, "loop_count": 0, "filename_prefix": "WAN/2025-09-30/131656_", "format": "video/nvenc_h264-mp4", "pix_fmt": "yuv420p", "bitrate": 10, "megabit": true, "save_metadata": true, "pingpong": false, "save_output": true, "images": [ "114", 0 ] },
    "class_type": "VHS_VideoCombine",
    "_meta": { "title": "Video Final" }
  },
  "114": {
    "inputs": { "grain_intensity": 0.02, "saturation_mix": 0.3, "images": [ "8", 0 ] },
    "class_type": "FastFilmGrain",
    "_meta": { "title": "🎞️ Fast Film Grain" }
  },
  "117": {
    "inputs": { "width": 736, "height": 416, "length": 57, "batch_size": 1, "positive": [ "6", 0 ], "negative": [ "7", 0 ], "vae": [ "39", 0 ] },
    "class_type": "WanImageToVideo",
    "_meta": { "title": "WanImageVersVidéo" }
  }
};


// --- ComfyUI Face Detailer Workflow (SD 1.5) ---
export const COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE = {
  "4": { "inputs": { "ckpt_name": "epicphotogasm_ultimateFidelity.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } },
  "5": { "inputs": { "text": "Positive prompt here", "clip": [ "4", 1 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive" } },
  "6": { "inputs": { "text": "Negative prompt here", "clip": [ "4", 1 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative" } },
  "16": { "inputs": { "model_name": "sam_vit_b_01ec64.pth", "device_mode": "AUTO" }, "class_type": "SAMLoader", "_meta": { "title": "SAMLoader" } },
  "17": { "inputs": { "mask": [ "51", 3 ] }, "class_type": "MaskToImage", "_meta": { "title": "MaskToImage" } },
  "51": { "inputs": {
      "guide_size": 360, "guide_size_for": "BBOX", "max_size": 512, "seed": 0, "steps": 20, "cfg": 8, "sampler_name": "euler", "scheduler": "normal",
      "denoise": 0.5, "feather": 5, "noise_mask": true, "force_inpaint": false, "wildcard": "", "cycle": 1,
      "bbox_threshold": 0.93, "bbox_dilation": 0, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_threshold": 0.93,
      "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "sam_mask_hint_oversize": 10, "sam_dilation": 0, "drop_size": 10,
      "image": [ "72", 0 ], "model": [ "4", 0 ], "clip": [ "4", 1 ], "vae": [ "4", 2 ], "positive": [ "5", 0 ], "negative": [ "6", 0 ],
      "bbox_detector": [ "53", 0 ], "sam_model_opt": [ "16", 0 ]
    }, "class_type": "FaceDetailer", "_meta": { "title": "FaceDetailer" } },
  "53": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider", "_meta": { "title": "UltralyticsDetectorProvider" } },
  "63": { "inputs": { "filename_prefix": "Mask", "images": [ "17", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Mask" } },
  "64": { "inputs": { "filename_prefix": "CroppedEnhanced", "images": [ "51", 2 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Cropped Enhanced" } },
  "65": { "inputs": { "filename_prefix": "CroppedRefined", "images": [ "51", 1 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Cropped Refined" } },
  "66": { "inputs": { "filename_prefix": "FinalImage", "images": [ "51", 0 ] }, "class_type": "SaveImage", "_meta": { "title": "Save Final Image" } },
  "72": { "inputs": { "image": "source_image.png", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } }
};