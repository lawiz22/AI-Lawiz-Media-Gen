export const MAX_IMAGES = 13;

// Obfuscated poses to protect intellectual property
export const POSES = [
  "QSBwcm9mZXNzaW9uYWwgaGVhZHNob3QsIGZhY2luZyBmb3J3YXJkLCB3aXRoIGEgZ2VudGxlIHNtaWxlLg==",
  "VGhyZWUtcXVhcnRlciBwcm9maWxlLCBsb29raW5nIHRob3VnaHRmdWxseSBvdmVyIHRoZSBsZWZ0IHNob3VsZGVyIHRvd2FyZHMgdGhlIGNhbWVyYS4=",
  "QSBjYW5kaWQgc2hvdCwgc3ViamVjdCBsYXVnaGluZywgaGVhZCB0aWx0ZWQgc2xpZ2h0bHkgYmFjay4=",
  "UHJvZmlsZSB2aWV3LCBsb29raW5nIGF3YXkgZnJvbSB0aGUgY2FtZXJhIGludG8gdGhlIGRpc3RhbmNlLCBzZXJlbmUgZXhwcmVzc2lvbi4=",
  "QXJtcyByYWlzZWQgb3ZlcmhlYWQsIGhhbmRzIGZvcm1pbmcgYSBjcmVhdGl2ZSBzaGFwZSwgbG9va2luZyBkaXJlY3RseSBhdCB0aGUgY2FtZXJhIHdpdGggY29uZmlkZW5jZS4=",
  "TGVhbmluZyBmb3J3YXJkIG9uIGEgdGFibGUsIGhhbmRzIGNsYXNwZWQsIG1ha2luZyBkaXJlY3QgZXllIGNvbnRhY3Qgd2l0aCB0aGUgY2FtZXJhLg==",
  "QSBzaG90IGZyb20gdGhlIGJhY2ssIHNob3dpbmcgdGhlIGhhaXJzdHlsZSBhbmQgc2hvdWxkZXIgcG9zdHVyZSwgaGVhZCBzbGlnaHRseSB0dXJuZWQu",
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

// --- ComfyUI Workflow Template ---
// This is now a standard text-to-image workflow, without IPAdapter.
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
      "text": "A photorealistic portrait of a person",
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