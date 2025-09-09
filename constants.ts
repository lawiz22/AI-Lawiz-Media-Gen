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

// --- For Clothing Randomization ---
export const CLOTHING_ADJECTIVES = ['stylish', 'elegant', 'casual', 'formal', 'vintage', 'modern', 'cozy', 'rugged', 'chic', 'minimalist', 'bohemian', 'vibrant', 'dark', 'lightweight', 'tailored'];
export const CLOTHING_COLORS = ['black', 'white', 'charcoal gray', 'navy blue', 'khaki', 'olive green', 'burgundy', 'crimson red', 'pastel pink', 'sky blue', 'sunflower yellow', 'cream', 'beige', 'forest green'];
export const CLOTHING_MATERIALS = ['leather', 'denim', 'cotton', 'silk', 'wool', 'linen', 'suede', 'corduroy', 'velvet', 'cashmere', 'twill', 'fleece'];
export const CLOTHING_ITEMS = ['jacket', 'blouse', 't-shirt', 'sweater', 'trench coat', 'dress shirt', 'hoodie', 'blazer', 'vest', 'cardigan', 'polo shirt', 'button-up shirt'];
export const CLOTHING_DETAILS = ['subtle embroidery', 'gold buttons', 'a high collar', 'rolled-up sleeves', 'a unique pattern', 'distressed details', 'a cinched waist', 'puffy sleeves', 'a simple logo', 'contrast stitching'];
