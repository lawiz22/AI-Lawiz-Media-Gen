
// Fix: Import Banner type definitions to resolve type errors.
import type { BannerAspectRatio, BannerStyle, BannerLogoPlacement } from './types';

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
  "QSBwb3dlciBwb3NlLCBzdGFuZGluZyB3aXRoIGhhbmRzIG9uIGhpcHMsIGxvb2tpbmcgc3Ryb25nIGFuZCBjb25maWRlbnQu",
  // New poses added below
  "U3RhbmRpbmcgcmVsYXhlZCB3aXRoIG9uZSBoYW5kIGluIHBvY2tldCwgdGhlIG90aGVyIGhhbmcgYnkgdGhlIHNpZGUsIGxvb2tpbmcgY2FzdWFsbHkgYXQgdGhlIGNhbWVyYS4=",
  "U2VhdGVkIG9uIHRoZSBmbG9vciwgbGVncyBjcm9zc2VkLCBoYW5kcyByZXN0aW5nIG9uIGtuZWVzLCB3aXRoIGEgcGVhY2VmdWwgZXhwcmVzc2lvbi4=",
  "V2Fsa2luZyBhd2F5IGZyb20gdGhlIGNhbWVyYSwgdHVybmluZyBoZWFkIGJhY2sgdG8gc21pbGUgb3ZlciB0aGUgc2hvdWxkZXIu",
  "QSBwbGF5ZnVsIHBvc2UsIHBlZWtpbmcgZnJvbSBiZWhpbmQgYSB3YWxsIG9yIG9iamVjdCwgd2l0aCBhIG1pc2NoaWV2b3VzIGdyaW4u",
  "U3RhbmRpbmcgd2l0aCBhcm1zIGNyb3NzZWQsIGxlYW5pbmcgYmFjayBhZ2FpbnN0IGEgd2FsbCwgbG9va2luZyBjb29sIGFuZCBjb21wb3NlZC4=",
  "SG9sZGluZyBhIGN1cCBvZiBjb2ZmZWUgd2l0aCBib3RoIGhhbmRzLCBibG93aW5nIHN0ZWFtIGF3YXksIGxvb2tpbmcgY296eS4=",
  "QWRqdXN0aW5nIGdsYXNzZXMgb3IgYSBoYXQsIGxvb2tpbmcgaW50ZWxsZWN0dWFsIGFuZCBmb2N1c2VkLg==",
  "U2l0dGluZyBiYWNrd2FyZHMgb24gYSBjaGFpciwgcmVzdGluZyBjaGluIG9uIGFybXMgZm9sZGVkIG92ZXIgdGhlIGNoYWlyIGJhY2su",
  "QSBjbG9zZS11cCBvZiB0aGUgZmFjZSwgbG9va2luZyB1cCB0b3dhcmRzIHRoZSBza3kgd2l0aCBleWVzIGNsb3NlZCwgc29ha2luZyBpbiBzdW5saWdodC4=",
  "SnVtcGluZyBpbiB0aGUgYWlyIHdpdGggYXJtcyBhbmQgbGVncyBzcHJlYWQsIGZ1bGwgb2YgZW5lcmd5IGFuZCBqb3ku",
  // New poses (Added per request)
  "U3RhbmRpbmcgd2l0aCBvbmUgbGVnIHNsaWdodGx5IGZvcndhcmQsIGhhbmRzIGluIGJhY2sgcG9ja2V0cywgbG9va2luZyBvdmVyIHNob3VsZGVyLg==",
  "U2l0dGluZyBvbiBhIHN0b29sLCBvbmUgbGVnIGV4dGVuZGVkLCBoYW5kcyByZXN0aW5nIG9uIHRoZSBvdGhlciBrbmVlLCBzbWlsaW5nLg==",
  "V2Fsa2luZyB0b3dhcmRzIHRoZSBjYW1lcmEsIHJ1bm5pbmcgZmluZ2VycyB0aHJvdWdoIGhhaXIsIGxvb2tpbmcgY2FuZGlkLg==",
  "TGVhbmluZyBhZ2FpbnN0IGEgd2FsbCB3aXRoIG9uZSBzaG91bGRlciwgYXJtcyByZWxheGVkLCBsb29raW5nIGRvd24gdGhvdWdodGZ1bGx5Lg==",
  "Q3JvdWNoaW5nIGRvd24sIGVsbm93cyByZXN0aW5nIG9uIGtuZWVzLCBoYW5kcyBjbGFzcGVkLCBsb29raW5nIGludGVuc2VseSBhdCB0aGUgY2FtZXJhLg==",
  "U3RhbmRpbmcgcHJvZmlsZSwgaGVhZCB0dXJuZWQgdG93YXJkcyBjYW1lcmEsIG9uZSBoYW5kIG9uIGNoaW4sIHRoaW5raW5nLg==",
  "U2l0dGluZyBjcm9zcy1sZWdnZWQsIGhvbGRpbmcgYSBib29rIG9wZW4sIGxvb2tpbmcgdXAgYXMgaWYgaW50ZXJydXB0ZWQu",
  "U3RhbmRpbmcgd2l0aCBhcm1zIG9wZW4gd2lkZSwgbG9va2luZyB1cCBhdCB0aGUgc2t5LCBleHByZXNzaW9uIG9mIGZyZWVkb20u",
  "TG9va2luZyBvdmVyIHN1bmdsYXNzZXMsIGhlYWQgdGlsdGVkIGRvd24sIGxvb2tpbmcgY29vbCBhbmQgbXlzdGVyaW91cy4=",
  "SG9sZGluZyBhIGphY2tldCBvdmVyIG9uZSBzaG91bGRlciwgd2Fsa2luZyBhd2F5IGJ1dCBsb29raW5nIGJhY2su"
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
  { value: '1:1', label: '1:1 (Perfect Square)' },
  { value: '2:3', label: '2:3 (Classic Portrait)' },
  { value: '3:4', label: '3:4 (Golden Ratio)' },
  { value: '3:5', label: '3:5 (Elegant Vertical)' },
  { value: '4:5', label: '4:5 (Artistic Frame)' },
  { value: '5:7', label: '5:7 (Balanced Portrait)' },
  { value: '5:8', label: '5:8 (Tall Portrait)' },
  { value: '7:9', label: '7:9 (Modern Portrait)' },
  { value: '9:16', label: '9:16 (Slim Vertical)' },
  { value: '9:19', label: '9:19 (Tall Slim)' },
  { value: '9:21', label: '9:21 (Ultra Tall)' },
  { value: '9:32', label: '9:32 (Skyline)' },
  { value: '3:2', label: '3:2 (Golden Landscape)' },
  { value: '4:3', label: '4:3 (Classic Landscape)' },
  { value: '5:3', label: '5:3 (Wide Horizon)' },
  { value: '5:4', label: '5:4 (Balanced Frame)' },
  { value: '7:5', label: '7:5 (Elegant Landscape)' },
  { value: '8:5', label: '8:5 (Cinematic View)' },
  { value: '9:7', label: '9:7 (Artful Horizon)' },
  { value: '16:9', label: '16:9 (Panorama)' },
  { value: '19:9', label: '19:9 (Cinematic Ultrawide)' },
  { value: '21:9', label: '21:9 (Epic Ultrawide)' },
  { value: '32:9', label: '32:9 (Extreme Ultrawide)' },
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
  { value: 'a close-up on the face, with dramatic focus', label: 'Close-up (Face)' },
  { value: 'a wide shot showing the full environment and subject', label: 'Wide Shot (Full Scene)' },
  { value: 'Tracking shot across the disco dance floor', label: 'Tracking (Disco Floor)' },
  { value: 'Slow dolly-in on the singer under a spotlight', label: 'Dolly-in (Spotlight)' },
  { value: 'Wide shot of dancers moving in sync under the mirror ball', label: 'Wide Shot (Mirror Ball)' },
  { value: 'Orbit shot around a funky guitarist on stage', label: 'Orbit (Stage)' },
  { value: 'Crane shot lifting above the dance crowd', label: 'Crane Shot (Crowd)' },
  { value: 'POV shot gliding through the roller disco', label: 'POV (Roller Disco)' },
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
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
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
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "7": {
    "inputs": {
      "text": "blurry, bad quality, low-res, ugly, deformed, disfigured",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "8": {
    "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": { "images": ["8", 0] },
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
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
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
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Positive Prompt" }
  },
  "7": {
    "inputs": {
      "text": "blurry, bad quality, low-res, ugly, deformed, disfigured",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "Negative Prompt" }
  },
  "8": {
    "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": { "images": ["8", 0] },
    "class_type": "PreviewImage",
    "_meta": { "title": "Preview Image" }
  }
};

// Saved items may still name these workflows; they stay viewable but can no longer be generated.
export const REMOVED_IMAGE_WORKFLOWS: Record<string, string> = {
  'flux': 'FLUX 1', 'flux-krea': 'FLUX Krea', 'nunchaku-kontext-flux': 'Nunchaku Kontext', 'nunchaku-flux-image': 'Nunchaku FLUX', 'wan2.2': 'WAN 2.2 image',
};
export const removedImageWorkflowMessage = (modelType?: string): string | null => modelType && REMOVED_IMAGE_WORKFLOWS[modelType]
  ? `The ${REMOVED_IMAGE_WORKFLOWS[modelType]} workflow was removed from this application. Saved items that use it stay available in the Library, but they can no longer be loaded into the Image Generator.`
  : null;

// --- ComfyUI Face Detailer Workflow (SD 1.5) ---
export const COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE = {
  "4": { "inputs": { "ckpt_name": "epicphotogasm_ultimateFidelity.safetensors" }, "class_type": "CheckpointLoaderSimple", "_meta": { "title": "Load Checkpoint" } },
  "5": { "inputs": { "text": "Positive prompt here", "clip": ["4", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive" } },
  "6": { "inputs": { "text": "Negative prompt here", "clip": ["4", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative" } },
  "16": { "inputs": { "model_name": "sam_vit_b_01ec64.pth", "device_mode": "AUTO" }, "class_type": "SAMLoader", "_meta": { "title": "SAMLoader" } },
  "17": { "inputs": { "mask": ["51", 3] }, "class_type": "MaskToImage", "_meta": { "title": "MaskToImage" } },
  "51": {
    "inputs": {
      "guide_size": 360, "guide_size_for": "BBOX", "max_size": 512, "seed": 0, "steps": 20, "cfg": 8, "sampler_name": "euler", "scheduler": "normal",
      "denoise": 0.5, "feather": 5, "noise_mask": true, "force_inpaint": false, "wildcard": "", "cycle": 1,
      "bbox_threshold": 0.93, "bbox_dilation": 0, "bbox_crop_factor": 3.0, "sam_detection_hint": "center-1", "sam_threshold": 0.93,
      "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7, "sam_mask_hint_use_negative": "False", "sam_mask_hint_oversize": 10, "sam_dilation": 0, "drop_size": 10,
      "image": ["72", 0], "model": ["4", 0], "clip": ["4", 1], "vae": ["4", 2], "positive": ["5", 0], "negative": ["6", 0],
      "bbox_detector": ["53", 0], "sam_model_opt": ["16", 0]
    }, "class_type": "FaceDetailer", "_meta": { "title": "FaceDetailer" }
  },
  "53": { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider", "_meta": { "title": "UltralyticsDetectorProvider" } },
  "63": { "inputs": { "filename_prefix": "Mask", "images": ["17", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Mask" } },
  "64": { "inputs": { "filename_prefix": "CroppedEnhanced", "images": ["51", 2] }, "class_type": "SaveImage", "_meta": { "title": "Save Cropped Enhanced" } },
  "65": { "inputs": { "filename_prefix": "CroppedRefined", "images": ["51", 1] }, "class_type": "SaveImage", "_meta": { "title": "Save Cropped Refined" } },
  "66": { "inputs": { "filename_prefix": "FinalImage", "images": ["51", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Final Image" } },
  "72": { "inputs": { "image": "source_image.png", "upload": "image" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } }
};

// --- ComfyUI Qwen T2I GGUF Workflow ---
export const COMFYUI_QWEN_T2I_GGUF_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 123456789, "steps": 4, "cfg": 1, "sampler_name": "dpmpp_2s_ancestral", "scheduler": "karras", "denoise": 1,
      "model": ["66", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["87", 0]
    },
    "class_type": "KSampler", "_meta": { "title": "KSampler" }
  },
  "6": { "inputs": { "text": "positive prompt", "clip": ["81", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive)" } },
  "7": { "inputs": { "text": "negative prompt", "clip": ["81", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative)" } },
  "8": { "inputs": { "samples": ["3", 0], "vae": ["39", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "39": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "VAE Loader" } },
  "66": { "inputs": { "shift": 2.5, "model": ["lora_4_node", 0] }, "class_type": "ModelSamplingAuraFlow", "_meta": { "title": "ModelSamplingAuraFlow" } },
  "74": { "inputs": { "lora_name": "Qwen-Image-Lightning-4steps-V1.0.safetensors", "strength_model": 1.0, "model": ["80", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA Loader 1" } },
  "75": { "inputs": { "lora_name": "Qwen-NSFW-Beta5.safetensors", "strength_model": 0.86, "model": ["74", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA Loader 2" } },
  "80": { "inputs": { "unet_name": "Qwen_Image-Q3_K_S.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "UnetLoaderGGUF" } },
  "81": { "inputs": { "clip_name": "Qwen2.5-VL-7B-Instruct-Q3_K_S.gguf", "type": "qwen_image" }, "class_type": "CLIPLoaderGGUF", "_meta": { "title": "CLIPLoaderGGUF" } },
  "82": { "inputs": { "lora_name": "Qwen-Image_SmartphoneSnapshotPhotoReality_v4_by-AI_Characters_TRIGGER$amateur photo$.safetensors", "strength_model": 1.0, "model": ["75", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA Loader 3" } },
  "86": {
    "inputs": { "megapixel": "1.0", "aspect_ratio": "1:1 (Perfect Square)", "divisible_by": "64", "custom_ratio": false, "custom_aspect_ratio": "1:1" },
    "class_type": "FluxResolutionNode", "_meta": { "title": "Flux Resolution Calc" }
  },
  "87": {
    "inputs": { "width": ["86", 0], "height": ["86", 1], "batch_size": 1 },
    "class_type": "EmptySD3LatentImage", "_meta": { "title": "EmptySD3LatentImage" }
  },
  "lora_4_node": { "inputs": { "lora_name": "", "strength_model": 1.0, "model": ["82", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA Loader 4" } },
  "99": { "inputs": { "images": ["8", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview Image" } }
};

export const KREA2_RESOLUTION_OPTIONS = [
  { value: '832x1216', label: 'Portrait Standard · 832×1216', width: 832, height: 1216 },
  { value: '1040x1520', label: 'Portrait HD · 1040×1520', width: 1040, height: 1520 },
  { value: '896x1152', label: 'Portrait Wide Standard · 896×1152', width: 896, height: 1152 },
  { value: '1120x1440', label: 'Portrait Wide HD · 1120×1440', width: 1120, height: 1440 },
  { value: '1024x1024', label: 'Square Standard · 1024×1024', width: 1024, height: 1024 },
  { value: '1280x1280', label: 'Square HD · 1280×1280', width: 1280, height: 1280 },
  { value: '1216x832', label: 'Landscape Standard · 1216×832', width: 1216, height: 832 },
  { value: '1520x1040', label: 'Landscape HD · 1520×1040', width: 1520, height: 1040 },
  { value: '1152x896', label: 'Landscape Wide Standard · 1152×896', width: 1152, height: 896 },
  { value: '1440x1120', label: 'Landscape Wide HD · 1440×1120', width: 1440, height: 1120 },
] as const;

export const KREA2_RAW_RESOLUTION_OPTIONS = [
  { value: '960x1440', label: 'Portrait · 960×1440', width: 960, height: 1440 },
  { value: '1120x1680', label: 'Portrait HD · 1120×1680', width: 1120, height: 1680 },
  { value: '912x1216', label: 'Portrait 3:4 · 912×1216', width: 912, height: 1216 },
  { value: '1200x1600', label: 'Portrait 3:4 HD · 1200×1600', width: 1200, height: 1600 },
  { value: '1440x1920', label: 'Portrait 3:4 Ultra · 1440×1920', width: 1440, height: 1920 },
  { value: '1280x1920', label: 'Portrait 2:3 · 1280×1920', width: 1280, height: 1920 },
  { value: '1088x1920', label: 'Portrait Tall · 1088×1920', width: 1088, height: 1920 },
  { value: '832x1248', label: 'Portrait Compact · 832×1248', width: 832, height: 1248 },
  { value: '864x1536', label: 'Portrait 9:16 · 864×1536', width: 864, height: 1536 },
  { value: '720x1280', label: 'Portrait 9:16 Compact · 720×1280', width: 720, height: 1280 },
  { value: '832x1040', label: 'Portrait 4:5 · 832×1040', width: 832, height: 1040 },
  { value: '1152x1440', label: 'Portrait 4:5 HD · 1152×1440', width: 1152, height: 1440 },
  { value: '1536x1920', label: 'Portrait 4:5 Ultra · 1536×1920', width: 1536, height: 1920 },
  { value: '1040x1040', label: 'Square · 1040×1040', width: 1040, height: 1040 },
  { value: '1440x1440', label: 'Square HD · 1440×1440', width: 1440, height: 1440 },
  { value: '1680x1680', label: 'Square Ultra · 1680×1680', width: 1680, height: 1680 },
  { value: '1680x1120', label: 'Landscape 3:2 · 1680×1120', width: 1680, height: 1120 },
  { value: '1440x960', label: 'Landscape 3:2 Compact · 1440×960', width: 1440, height: 960 },
  { value: '1600x1200', label: 'Landscape 4:3 · 1600×1200', width: 1600, height: 1200 },
  { value: '1536x864', label: 'Landscape 16:9 · 1536×864', width: 1536, height: 864 },
  { value: '1280x720', label: 'Landscape 16:9 Compact · 1280×720', width: 1280, height: 720 },
  { value: '1248x832', label: 'Landscape Compact · 1248×832', width: 1248, height: 832 },
  { value: '1216x912', label: 'Landscape 4:3 Compact · 1216×912', width: 1216, height: 912 },
  { value: '1920x1536', label: 'Landscape 5:4 Ultra · 1920×1536', width: 1920, height: 1536 },
  { value: '1440x1152', label: 'Landscape 5:4 · 1440×1152', width: 1440, height: 1152 },
  { value: '1040x832', label: 'Landscape 5:4 Compact · 1040×832', width: 1040, height: 832 },
  { value: '1920x1088', label: 'Widescreen · 1920×1088', width: 1920, height: 1088 },
  { value: '1920x1280', label: 'Landscape 3:2 Ultra · 1920×1280', width: 1920, height: 1280 },
  { value: '1920x1440', label: 'Landscape 4:3 Ultra · 1920×1440', width: 1920, height: 1440 },
] as const;

export const FLUX2_RESOLUTION_OPTIONS = [
  { value: '1024x1024', label: 'Square · 1024×1024', width: 1024, height: 1024 },
  { value: '1440x1440', label: 'Square HD · 1440×1440', width: 1440, height: 1440 },
  { value: '1024x1536', label: 'Portrait Classic · 1024×1536', width: 1024, height: 1536 },
  { value: '1280x1920', label: 'Portrait Classic HD · 1280×1920', width: 1280, height: 1920 },
  { value: '896x1120', label: 'Portrait Web · 896×1120', width: 896, height: 1120 },
  { value: '1080x1920', label: 'Portrait Tall · 1080×1920', width: 1080, height: 1920 },
  { value: '896x1600', label: 'Portrait Tall · 896×1600', width: 896, height: 1600 },
  { value: '720x1280', label: 'Portrait Tall · 720×1280', width: 720, height: 1280 },
  { value: '832x1216', label: 'Portrait CivitAI · 832×1216', width: 832, height: 1216 },
  { value: '1216x832', label: 'Wide Photo CivitAI · 1216×832', width: 1216, height: 832 },
  { value: '1536x1024', label: 'Wide Photo · 1536×1024', width: 1536, height: 1024 },
  { value: '1920x1080', label: 'Widescreen · 1920×1080', width: 1920, height: 1080 },
  { value: '1600x900', label: 'Widescreen · 1600×900', width: 1600, height: 900 },
  { value: '1280x720', label: 'Widescreen · 1280×720', width: 1280, height: 720 },
] as const;

export const COMFYUI_FLUX2_SIMPLE_WORKFLOW_TEMPLATE = {
  "80": { "inputs": { "sampler_name": "euler" }, "class_type": "KSamplerSelect", "_meta": { "title": "KSamplerSelect" } },
  "81": { "inputs": { "steps": 10, "width": ["87", 0], "height": ["88", 0] }, "class_type": "Flux2Scheduler", "_meta": { "title": "Flux2Scheduler" } },
  "82": { "inputs": { "cfg": 1, "model": ["99", 0], "positive": ["93", 0], "negative": ["86", 0] }, "class_type": "CFGGuider", "_meta": { "title": "GuideCFG" } },
  "83": { "inputs": { "noise": ["89", 0], "guider": ["82", 0], "sampler": ["80", 0], "sigmas": ["81", 0], "latent_image": ["85", 0] }, "class_type": "SamplerCustomAdvanced", "_meta": { "title": "SamplerCustomAdvanced" } },
  "84": { "inputs": { "samples": ["83", 0], "vae": ["92", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "85": { "inputs": { "width": ["87", 0], "height": ["88", 0], "batch_size": 1 }, "class_type": "EmptyFlux2LatentImage", "_meta": { "title": "Empty Flux2 Latent Image" } },
  "86": { "inputs": { "text": "", "clip": ["99", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative Prompt" } },
  "87": { "inputs": { "value": 832 }, "class_type": "PrimitiveInt", "_meta": { "title": "Width" } },
  "88": { "inputs": { "value": 1216 }, "class_type": "PrimitiveInt", "_meta": { "title": "Height" } },
  "89": { "inputs": { "noise_seed": 1001869159528562 }, "class_type": "RandomNoise", "_meta": { "title": "Random Noise" } },
  "91": { "inputs": { "clip_name": "qwen38BFluxKlein9BTE_38b.safetensors", "type": "flux2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
  "92": { "inputs": { "vae_name": "flux2-vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "93": { "inputs": { "text": "", "clip": ["99", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive Prompt" } },
  "94": { "inputs": { "unet_name": "flux2\\flux2Klein9BInt8_v10.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "96": { "inputs": { "filename_prefix": "Flux2/Imagen", "images": ["84", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "99": { "inputs": { "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" }, "lora_1": { "on": false, "lora": "", "strength": 1 }, "lora_2": { "on": false, "lora": "", "strength": 1 }, "lora_3": { "on": false, "lora": "", "strength": 1 }, "lora_4": { "on": false, "lora": "", "strength": 1 }, "lora_5": { "on": false, "lora": "", "strength": 1 }, "lora_6": { "on": false, "lora": "", "strength": 1 }, "➕ Add Lora": "", "model": ["94", 0], "clip": ["91", 0] }, "class_type": "Power Lora Loader (rgthree)", "_meta": { "title": "Power Lora Loader (rgthree)" } }
};

export const COMFYUI_KREA2_SIMPLE_WORKFLOW_TEMPLATE = {
  "2": { "inputs": { "seed": 1028201299316842, "steps": 10, "cfg": 1, "sampler_name": "er_sde", "scheduler": "beta", "denoise": 1, "model": ["57", 0], "positive": ["104", 0], "negative": ["17", 0], "latent_image": ["106:10", 0] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "3": { "inputs": { "samples": ["2", 0], "vae": ["106:4", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "17": { "inputs": { "text": "", "clip": ["57", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative Prompt" } },
  "33": { "inputs": { "filename_prefix": "Krea2/Imagen", "images": ["3", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "57": { "inputs": { "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" }, "lora_1": { "on": false, "lora": "", "strength": 1 }, "lora_2": { "on": true, "lora": "KREA\\snofs_krea_v1_nostrip.safetensors", "strength": 1 }, "➕ Add Lora": "", "model": ["106:1", 0], "clip": ["106:13", 0] }, "class_type": "Power Lora Loader (rgthree)", "_meta": { "title": "Power Lora Loader (rgthree)" } },
  "104": { "inputs": { "text": "", "clip": ["57", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive Prompt" } },
  "106:4": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "106:10": { "inputs": { "width": 832, "height": 1216, "batch_size": 1 }, "class_type": "EmptyLatentImage", "_meta": { "title": "Empty Latent Image" } },
  "106:13": { "inputs": { "clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
  "106:1": { "inputs": { "unet_name": "krea2_turbo_fp8_scaled.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } }
};

export const COMFYUI_KREA2_RAW_WORKFLOW_TEMPLATE = {
  "6": { "inputs": { "text": ["48", 0], "clip": ["317", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Prompt)" } },
  "8": { "inputs": { "samples": ["274", 0], "vae": ["210", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "48": { "inputs": { "value": "" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Positive" } },
  "210": { "inputs": { "vae_name": "Wan2.1_VAE.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "213": { "inputs": { "filename_prefix": "Krea2_RAW/Imagen", "images": ["8", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "265": { "inputs": { "eta": 0.5, "sampler_name": "exponential/res_2s", "scheduler": "beta", "steps": 6, "steps_to_run": -1, "denoise": 1, "cfg": ["282", 0], "seed": ["276", 0], "sampler_mode": "standard", "bongmath": true, "model": ["315", 0], "positive": ["6", 0], "negative": ["272", 0], "latent_image": ["303", 0] }, "class_type": "ClownsharKSampler_Beta", "_meta": { "title": "ClownsharKSampler Stage 1" } },
  "271": { "inputs": { "value": "" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Negative" } },
  "272": { "inputs": { "text": ["271", 0], "clip": ["317", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative)" } },
  "274": { "inputs": { "eta": 0.5, "sampler_name": "multistep/deis_3m", "scheduler": "bong_tangent", "steps": 2, "steps_to_run": -1, "denoise": 0.2, "cfg": ["282", 0], "seed": ["276", 0], "sampler_mode": "standard", "bongmath": true, "model": ["315", 0], "positive": ["6", 0], "negative": ["272", 0], "latent_image": ["265", 0] }, "class_type": "ClownsharKSampler_Beta", "_meta": { "title": "ClownsharKSampler Stage 2" } },
  "276": { "inputs": { "seed": -1 }, "class_type": "Seed (rgthree)", "_meta": { "title": "Seed (rgthree)" } },
  "282": { "inputs": { "value": 1 }, "class_type": "PrimitiveFloat", "_meta": { "title": "CFG" } },
  "303": { "inputs": { "width": 1920, "height": 1088, "batch_size": 1 }, "class_type": "EmptyLatentImage", "_meta": { "title": "Empty Latent Image" } },
  "315": { "inputs": { "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" }, "lora_1": { "on": true, "lora": "KREA\\krea2_turbo_lora_rank_64_bf16.safetensors", "strength": 0.6 }, "lora_2": { "on": true, "lora": "KREA\\snofs_krea_v1_nostrip.safetensors", "strength": 1 }, "lora_3": { "on": false, "lora": "None", "strength": 1 }, "lora_4": { "on": false, "lora": "None", "strength": 1 }, "lora_5": { "on": false, "lora": "None", "strength": 1 }, "lora_6": { "on": false, "lora": "None", "strength": 1.5 }, "➕ Add Lora": "", "model": ["316", 0], "clip": ["317", 0] }, "class_type": "Power Lora Loader (rgthree)", "_meta": { "title": "Power Lora Loader (rgthree)" } },
  "316": { "inputs": { "unet_name": "krea2_raw_fp8_scaled.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "317": { "inputs": { "clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
};

export const COMFYUI_QWEN_EDIT_WORKFLOW_TEMPLATE = {
  "3": { "inputs": { "seed": 123, "steps": 8, "cfg": 1, "sampler_name": "euler_ancestral", "scheduler": "beta57", "denoise": 1, "model": ["75", 0], "positive": ["111", 0], "negative": ["110", 0], "latent_image": ["88", 0] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "8": { "inputs": { "samples": ["3", 0], "vae": ["39", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "37": { "inputs": { "unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "39": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "66": { "inputs": { "shift": 2.5, "model": ["37", 0] }, "class_type": "ModelSamplingAuraFlow", "_meta": { "title": "ModelSamplingAuraFlow" } },
  "75": { "inputs": { "strength": 1, "pre_cfg": false, "model": ["66", 0] }, "class_type": "CFGNorm", "_meta": { "title": "CFGNorm" } },
  "78": { "inputs": { "image": "source_image.png" }, "class_type": "LoadImage", "_meta": { "title": "Source Image 1" } },
  "88": { "inputs": { "pixels": ["93", 0], "vae": ["39", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE Encode" } },
  "93": { "inputs": { "upscale_method": "lanczos", "megapixels": 1, "resolution_steps": 1, "image": ["78", 0] }, "class_type": "ImageScaleToTotalPixels", "_meta": { "title": "Scale Source Image" } },
  "110": { "inputs": { "prompt": "", "clip": ["116", 0], "vae": ["39", 0], "image1": ["93", 0] }, "class_type": "TextEncodeQwenImageEditPlus", "_meta": { "title": "Negative Prompt" } },
  "111": { "inputs": { "prompt": "", "clip": ["116", 0], "vae": ["39", 0], "image1": ["93", 0] }, "class_type": "TextEncodeQwenImageEditPlus", "_meta": { "title": "Positive Prompt" } },
  "116": { "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
  "128": { "inputs": { "filename_prefix": "Qwen_Edit", "images": ["8", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } }
};

export const COMFYUI_QWEN_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 1079817570796892,
      "steps": 4,
      "cfg": 1,
      "sampler_name": "er_sde",
      "scheduler": "beta57",
      "denoise": 1,
      "model": [
        "66",
        0
      ],
      "positive": [
        "6",
        0
      ],
      "negative": [
        "7",
        0
      ],
      "latent_image": [
        "58",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "KSampler"
    }
  },
  "6": {
    "inputs": {
      "text": "positive prompt",
      "clip": [
        "80",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Positive Prompt)"
    }
  },
  "7": {
    "inputs": {
      "text": "",
      "clip": [
        "80",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Negative Prompt)"
    }
  },
  "8": {
    "inputs": {
      "samples": [
        "3",
        0
      ],
      "vae": [
        "39",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE Decode"
    }
  },
  "39": {
    "inputs": {
      "vae_name": "qwen_image_vae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "Charger VAE"
    }
  },
  "58": {
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": {
      "title": "EmptySD3LatentImage"
    }
  },
  "66": {
    "inputs": {
      "shift": 2.5,
      "model": [
        "197",
        0
      ]
    },
    "class_type": "ModelSamplingAuraFlow",
    "_meta": {
      "title": "ModelSamplingAuraFlow"
    }
  },
  "75": {
    "inputs": {
      "lora_name": "qwen_kathlv2.safetensors",
      "strength_model": 1,
      "model": [
        "196",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "LoraLoaderModelOnly"
    }
  },
  "80": {
    "inputs": {
      "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
      "type": "qwen_image",
      "device": "cuda:0"
    },
    "class_type": "CLIPLoaderMultiGPU",
    "_meta": {
      "title": "CLIPLoaderMultiGPU"
    }
  },
  "195": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": [
        "8",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Enregistrer Image"
    }
  },
  "196": {
    "inputs": {
      "lora_name": "Qwen-Image-Lightning-4steps-V2.0.safetensors",
      "strength_model": 0.9,
      "model": [
        "201",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "LoraLoaderModelOnly"
    }
  },
  "197": {
    "inputs": {
      "lora_name": "analogcore2000s_qwen.safetensors",
      "strength_model": 0.8,
      "model": [
        "202",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "LoraLoaderModelOnly"
    }
  },
  "201": {
    "inputs": {
      "unet_name": "qwen-image-Q6_K.gguf"
    },
    "class_type": "UnetLoaderGGUF",
    "_meta": {
      "title": "Unet Loader (GGUF)"
    }
  },
  "202": {
    "inputs": {
      "lora_name": "qwen_karenne.safetensors",
      "strength_model": 0.59,
      "model": [
        "75",
        0
      ]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": {
      "title": "LoraLoaderModelOnly"
    }
  }
};

export const COMFYUI_Z_IMAGE_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 241352804545044,
      "steps": 8,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "denoise": 1,
      "model": [
        "11",
        0
      ],
      "positive": [
        "6",
        0
      ],
      "negative": [
        "7",
        0
      ],
      "latent_image": [
        "13",
        0
      ]
    },
    "class_type": "KSampler",
    "_meta": {
      "title": "KSampler"
    }
  },
  "6": {
    "inputs": {
      "text": "Positive Prompt",
      "clip": [
        "32",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Positive Prompt)"
    }
  },
  "7": {
    "inputs": {
      "text": "Negative Prompt",
      "clip": [
        "32",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP Text Encode (Negative Prompt)"
    }
  },
  "8": {
    "inputs": {
      "samples": [
        "3",
        0
      ],
      "vae": [
        "17",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE Decode"
    }
  },
  "9": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": [
        "8",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "Enregistrer Image"
    }
  },
  "11": {
    "inputs": {
      "shift": 3,
      "model": [
        "28",
        0
      ]
    },
    "class_type": "ModelSamplingAuraFlow",
    "_meta": {
      "title": "ModelSamplingAuraFlow"
    }
  },
  "13": {
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    },
    "class_type": "EmptySD3LatentImage",
    "_meta": {
      "title": "EmptySD3LatentImage"
    }
  },
  "16": {
    "inputs": {
      "unet_name": "z_image_turbo_bf16.safetensors",
      "weight_dtype": "fp8_e4m3fn"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "Charger Modèle Diffusion"
    }
  },
  "17": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "Charger VAE"
    }
  },
  "28": {
    "inputs": {
      "sage_attention": "auto",
      "allow_compile": false,
      "model": [
        "16",
        0
      ]
    },
    "class_type": "PathchSageAttentionKJ",
    "_meta": {
      "title": "Patch Sage Attention KJ"
    }
  },
  "32": {
    "inputs": {
      "clip_name": "Qwen3-4B-UD-Q8_K_XL.gguf",
      "type": "lumina2"
    },
    "class_type": "CLIPLoaderGGUF",
    "_meta": {
      "title": "CLIPLoader (GGUF)"
    }
  },
  "46": {
    "inputs": {
      "image": "example.jpg"
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "Charger Image"
    }
  },
  "47": {
    "inputs": {
      "pixels": [
        "46",
        0
      ],
      "vae": [
        "17",
        0
      ]
    },
    "class_type": "VAEEncode",
    "_meta": {
      "title": "VAE Encode"
    }
  }
};
