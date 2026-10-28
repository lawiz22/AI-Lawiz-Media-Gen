import template from '../assets/mossPhotoWorkflow.json';
import type { MossWorkflow } from './mossWorkflow';
import { getQwen21Choices } from './qwen21Workflow';

export type PhotoValue = string | number | boolean;
export interface PhotoPromptRow { enabled: boolean; text: string }
export interface MossPhotoSettings {
    look: string; ownStyle: string; flash: boolean; ordinaryPeople: boolean; people: string;
    aiWriter: boolean; addLookText: boolean; primaryEnabled: boolean; combineIdeas: boolean;
    ideas: PhotoPromptRow[]; myPrompts: PhotoPromptRow[];
    ratio: string; sizeIndex: number; customRatio: [number, number]; customResolution: [number, number];
    focal: string; snapTo: number; swap: boolean; autoRatio: boolean; fisheye: string; lensDetail: string;
    batchSize: number; steps: number; negativePrompt: string; filenamePrefix: string;
    secondPass: boolean; faceFix: boolean; handFix: boolean; detail: boolean; jpeg: boolean;
    nodes: Record<string, Record<string, PhotoValue>>;
}
export const MOSS_PHOTO_LOOKS = [
    ['A', 'Clean (no look)'], ['F', 'Your own style'], ['B', '1970s Kodachrome'], ['C', 'Cheap iPhone'],
    ['D', 'Aerochrome (prompt)'], ['E', 'Aerochrome IR (experimental)'], ['G', 'Kodak Portra 400'],
    ['H', 'Kodak Tri-X 400 (black & white)'], ['I', 'CineStill 800T'], ['J', 'Polaroid (soft, no sharpening)'],
    ['K', 'LomoChrome Purple'],
] as const;
export const MOSS_PHOTO_RATIOS = ['1:1', '16:9', '9:16', '2:1', '3:2', '2:3', '4:3', '3:4', '4:5', '65:24', '3:1', 'Custom Ratio', 'Custom Resolution'];
export const MOSS_PHOTO_LONG_SIDES = [768, 1024, 1152, 1344, 1536, 1632, 1728, 1920, 2304, 2560];
export const MOSS_PHOTO_FOCALS = [
    ['Off', 'Off'], ['8mm', '8mm fisheye'], ['16mm', '16mm'], ['24mm', '24mm'], ['35mm', '35mm'],
    ['50mm', '50mm'], ['85mm', '85mm'], ['135mm', '135mm'], ['XPan', 'XPan 45mm (panoramic)'], ['Widelux', 'Widelux 26mm (swing lens)'],
] as const;
const source: MossWorkflow = template;
export const MOSS_PHOTO_NODE_SPECS = [
    ['160', 'models', 'Models, text encoder, VAE & LoRAs'],
    ['300:50', 'writer', 'AI prompt writer sampling'],
    ['300:15', 'sampler', 'Model sampling'], ['300:16', 'sampler', 'First pass sampling'],
    ['300:41', 'second', 'Second pass resize'], ['300:43', 'second', 'Second pass sampling'],
    ['122', 'face', 'Face detector'], ['123', 'face', 'Face fix'],
    ['356', 'hand', 'Hand detector'], ['357', 'hand', 'Hand fix'],
    ['125', 'detail', 'SeedVR2 diffusion model'], ['126', 'detail', 'SeedVR2 VAE'],
    ['127', 'detail', 'SeedVR2 upscale'], ['128', 'detail', 'Detail mix'],
    ['129', 'jpeg', 'JPEG crunch'], ['86', 'finish', 'Sharpen'], ['87', 'finish', 'Film grain'],
    ['300:104', 'ir', 'Infrared sampling'], ['300:107', 'ir', 'Aerochrome IR film'],
] .map(([id, group, title]) => ({
    id, group, title, classType: source[id].class_type,
    defaults: Object.fromEntries(Object.entries(source[id].inputs).filter((entry): entry is [string, PhotoValue] =>
        ['string', 'number', 'boolean'].includes(typeof entry[1]) && entry[0] !== 'switch')),
}));

export const defaultMossPhotoSettings = (): MossPhotoSettings => ({
    look: 'A', ownStyle: '', flash: false, ordinaryPeople: true, people: 'A',
    aiWriter: true, addLookText: true, primaryEnabled: true, combineIdeas: false, ideas: [],
    myPrompts: [{ enabled: true, text: '' }],
    ratio: '4:3', sizeIndex: 1, customRatio: [3, 2], customResolution: [1024, 1024],
    focal: 'Off', snapTo: 16, swap: false, autoRatio: false, fisheye: 'Full-frame', lensDetail: 'Full description',
    batchSize: 1, steps: 25, negativePrompt: String(source['110'].inputs.value), filenamePrefix: 'moss_photo',
    secondPass: false, faceFix: false, handFix: false, detail: false, jpeg: false,
    nodes: Object.fromEntries(MOSS_PHOTO_NODE_SPECS.map(spec => [spec.id, { ...spec.defaults }])),
});

export const mossPhotoPrompt = (settings: MossPhotoSettings, primary: string): string => {
    const rows = settings.aiWriter ? [{ enabled: settings.primaryEnabled, text: primary }, ...settings.ideas] : settings.myPrompts;
    const texts = rows.filter(row => row.enabled).map(row => row.text.trim()).filter(Boolean);
    return (settings.aiWriter && settings.combineIdeas ? texts : texts.slice(0, 1)).join('\n\n');
};

export const withMossPhotoPrompt = (settings: MossPhotoSettings, prompt: string): MossPhotoSettings => {
    if (settings.aiWriter) return {
        ...settings, primaryEnabled: true,
        ideas: settings.ideas.map(row => ({ ...row, enabled: settings.combineIdeas && row.enabled })),
    };
    const active = Math.max(0, settings.myPrompts.findIndex(row => row.enabled));
    return {
        ...settings, myPrompts: settings.myPrompts.length
            ? settings.myPrompts.map((row, index) => index === active ? { enabled: true, text: prompt } : { ...row, enabled: false })
            : [{ enabled: true, text: prompt }],
    };
};

const snap = (value: number, grid: number) => Math.max(grid, Math.round(value / grid) * grid);
export const mossPhotoDimensions = (settings: MossPhotoSettings): { width: number; height: number; ratio: string } => {
    let ratio = settings.ratio;
    const focal = settings.look === 'J' ? 'Off' : settings.focal;
    if (focal === 'XPan') ratio = '65:24';
    else if (focal === 'Widelux') ratio = '3:1';
    else if (settings.autoRatio && focal !== 'Off') ratio = focal === '8mm' && settings.fisheye === 'Circular' ? '1:1' : focal === '85mm' ? '4:5' : focal === '135mm' ? '2:3' : '3:2';
    if (!MOSS_PHOTO_RATIOS.includes(ratio) || !Number.isInteger(settings.sizeIndex) || !MOSS_PHOTO_LONG_SIDES[settings.sizeIndex]
        || !Number.isInteger(settings.snapTo) || settings.snapTo < 8 || settings.snapTo > 64 || settings.snapTo % 8) throw new Error('Choose a valid MOSS PHOTO ratio, size and 8-64 pixel alignment.');
    const pair = ratio === 'Custom Resolution' ? settings.customResolution : ratio === 'Custom Ratio' ? settings.customRatio : ratio.split(':').map(Number);
    if (!pair.every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192)) throw new Error('MOSS PHOTO dimensions and ratio must be positive integers at most 8192.');
    if (ratio === 'Custom Ratio' && pair.some(value => value > 99)) throw new Error('MOSS PHOTO custom ratio terms must be between 1 and 99.');
    if (ratio === 'Custom Resolution' && pair.some(value => value < 64)) throw new Error('MOSS PHOTO custom resolution must be between 64 and 8192 pixels per side.');
    const scale = ratio === 'Custom Resolution' ? 1 : MOSS_PHOTO_LONG_SIDES[settings.sizeIndex] / Math.max(...pair);
    let [width, height] = pair.map(value => snap(value * scale, settings.snapTo));
    if (settings.swap && focal !== 'XPan' && focal !== 'Widelux') [width, height] = [height, width];
    if (width > 8192 || height > 8192) throw new Error('MOSS PHOTO dimensions cannot exceed 8192 pixels.');
    return { width, height, ratio };
};

type Link = [string, number];
const isLink = (value: unknown): value is Link => Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]);
export const buildMossPhotoWorkflow = (settings: MossPhotoSettings, primary: string, seed: number): MossWorkflow => {
    const prompt = mossPhotoPrompt(settings, primary);
    if (!prompt || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Enter an active MOSS PHOTO idea (or your own prompt) and a valid non-negative seed.');
    mossPhotoDimensions(settings);
    if (!MOSS_PHOTO_LOOKS.some(([id]) => id === settings.look) || !['A', 'B', 'C', 'D'].includes(settings.people)
        || !MOSS_PHOTO_FOCALS.some(([id]) => id === settings.focal)
        || !['Full-frame', 'Circular'].includes(settings.fisheye) || !['Full description', 'Short tag'].includes(settings.lensDetail)) throw new Error('Choose valid MOSS PHOTO look, people and lens options.');
    if (!Number.isInteger(settings.batchSize) || settings.batchSize < 1 || settings.batchSize > 64
        || !Number.isInteger(settings.steps) || settings.steps < 1 || settings.steps > 50
        || !settings.filenamePrefix.trim()) throw new Error('MOSS PHOTO requires 1-50 steps, batch size 1-64 and an output prefix.');
    if (settings.look === 'F' && !settings.ownStyle.trim()) throw new Error('Enter your own style or choose another MOSS PHOTO look.');
    const workflow: MossWorkflow = structuredClone(source);
    for (const spec of MOSS_PHOTO_NODE_SPECS) {
        const values = settings.nodes[spec.id];
        if (!values) throw new Error(`Missing MOSS PHOTO ${spec.title} settings. Restore workflow defaults.`);
        for (const [key, value] of Object.entries(values)) {
            if (!(key in spec.defaults) || typeof value !== typeof spec.defaults[key]
                || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Invalid MOSS PHOTO ${spec.title}.${key}.`);
        }
        Object.assign(workflow[spec.id].inputs, spec.defaults, values);
    }
    const put = (id: string, inputs: Record<string, unknown>) => Object.assign(workflow[id].inputs, inputs);
    const aliases: Record<string, Link> = {};
    const alias = (id: string, target: string, output = 0) => { aliases[id] = [target, output]; };
    const text = (id: string, value: string) => { workflow[id] = { class_type: 'PrimitiveStringMultiline', inputs: { value } }; };
    workflow['71'] = { class_type: 'PrimitiveInt', inputs: { value: seed } };
    text('89', prompt);
    put('88', {
        ui_state: JSON.stringify({ ratio: settings.ratio, size_index: settings.sizeIndex, custom_ratio: settings.customRatio, custom_res: settings.customResolution, focal: settings.look === 'J' ? 'Off' : settings.focal }),
        batch_size: settings.batchSize, snap_to: settings.snapTo, swap_w_h: settings.swap,
        auto_ratio: settings.autoRatio, fisheye_type: settings.fisheye, lens_detail: settings.lensDetail,
    });
    text('110', settings.negativePrompt);
    put('300:72', { value: settings.steps });
    // The exported API only contains the selected switch inputs; restore the normal workflow's branches.
    const looks: Record<string, [string, string]> = {
        A: ['94', '93'], B: ['65', '60'], C: ['67', '66'], D: ['92', '91'], E: ['95', '96'],
        F: ['170', '171'], G: ['180', '181'], H: ['182', '183'], I: ['184', '185'], J: ['186', '187'], K: ['316', '317'],
    };
    const [prefix, description] = looks[settings.look];
    alias('300:69', `300:${prefix}`); alias('300:68', `300:${description}`);
    const style = settings.ownStyle.trim();
    const split = style.match(/^(.*?[.!?])\s+([\s\S]+)$/);
    text('300:170', split ? split[1] : style); text('300:171', split ? split[2] : style);
    const people: Record<string, [string, string]> = { A: ['114', '115'], B: ['116', '117'], C: ['118', '119'], D: ['120', '121'] };
    alias('300:111', `300:${people[settings.people][0]}`); alias('300:112', `300:${people[settings.people][1]}`);
    text('300:191', settings.flash ? String(source['300:190'].inputs.value) : '');
    text('300:360', settings.ordinaryPeople ? String(source['300:364'].inputs.value) : '');
    text('300:362', settings.ordinaryPeople ? String(source['300:365'].inputs.value) : '');
    text('300:193', settings.look === 'J' ? 'white border, white frame, instant film frame, margin, framed print, photo of a photo' : '');
    const lookRules: Array<[string, string, string]> = [
        ['306', 'H', '302'], ['308', 'H', '303'], ['319', 'D', '318'], ['322', 'K', '321'],
        ['325', 'D', '324'], ['328', 'K', '327'], ['331', 'G', '330'], ['339', 'I', '338'],
        ['342', 'I', '341'], ['345', 'B', '344'], ['348', 'B', '347'], ['351', 'J', '350'], ['354', 'J', '353'],
    ];
    for (const [id, look, on] of lookRules) alias(`300:${id}`, `300:${settings.look === look ? on : '304'}`);
    alias('300:305', settings.look === 'H' ? '300:301' : '300:50');
    const ownPrompt = settings.addLookText && !/[.!?]$/.test(prompt) ? `${prompt.replace(/[,;:\s]+$/, '')}.` : prompt;
    text('337', settings.aiWriter ? '' : ownPrompt);
    if (!settings.aiWriter) {
        alias('300:333', '300:304');
        alias('300:334', '337');
        if (!settings.addLookText) alias('300:336', '337');
        else alias('300:336', '300:335');
    } else alias('300:336', '300:335');
    alias('300:75', settings.secondPass ? '300:44' : '300:17');
    alias('300:108', settings.look === 'E' ? '300:107' : '300:75');
    alias('124', settings.faceFix ? '123' : '300:108');
    alias('358', settings.handFix ? '357' : '124');
    if (settings.detail && settings.look !== 'J') put('128', { switch: true });
    else alias('128', '358');
    alias('311', '128');
    if (settings.look === 'J') alias('86', '311');
    put('87', { gray_scale: settings.look === 'H' });
    if (settings.jpeg || settings.look === 'C') put('129', { switch: settings.jpeg });
    else alias('129', '87');

    // Split the source's combined loader so disabled AI writing does not load its model.
    const models = workflow['160'].inputs;
    workflow.photo_model = { class_type: 'UNETLoader', inputs: { unet_name: models.model, weight_dtype: models['model weights'] } };
    workflow.photo_clip = { class_type: 'CLIPLoader', inputs: { clip_name: models['text encoder'], type: models['text encoder type'], device: 'default' } };
    workflow.photo_vae = { class_type: 'VAELoader', inputs: { vae_name: models.vae } };
    workflow.photo_writer = { class_type: 'CLIPLoader', inputs: { clip_name: models['prompt writer'], type: models['prompt writer type'], device: 'default' } };
    let modelLink: Link = ['photo_model', 0];
    for (let index = 1; index <= 4; index++) {
        const name = models[`lora ${index}`], strength = models[`lora ${index} strength`];
        if (typeof name !== 'string' || typeof strength !== 'number' || Math.abs(strength) > 4) throw new Error('MOSS PHOTO LoRA strengths must be between -4 and 4.');
        if (!name || name === 'None' || strength === 0) continue;
        const id = `photo_lora_${index}`;
        workflow[id] = { class_type: 'LoraLoaderModelOnly', inputs: { model: modelLink, lora_name: name, strength_model: strength } };
        modelLink = [id, 0];
    }
    const modelOutputs: Link[] = [modelLink, ['photo_clip', 0], ['photo_vae', 0], ['photo_writer', 0]];
    const resolve = (link: Link, seen = new Set<string>()): Link => {
        if (seen.has(link[0])) throw new Error('MOSS PHOTO contains a cyclic switch.');
        seen.add(link[0]);
        const target = link[0] === '160' ? modelOutputs[link[1]] : aliases[link[0]];
        return target ? resolve(target, seen) : link;
    };
    workflow['10'] = { class_type: 'SaveImage', inputs: { images: ['129', 0], filename_prefix: settings.filenamePrefix } };
    for (const node of Object.values(workflow)) for (const [key, value] of Object.entries(node.inputs)) if (isLink(value)) node.inputs[key] = resolve(value);
    const active: MossWorkflow = {};
    const visit = (id: string) => {
        if (active[id]) return;
        const node = workflow[id];
        if (!node) throw new Error(`MOSS PHOTO has a missing node: ${id}.`);
        active[id] = node;
        for (const value of Object.values(node.inputs)) if (isLink(value)) visit(value[0]);
    };
    visit('10');
    return active;
};

export const setMossPhotoSeed = (workflow: MossWorkflow, seed: number): void => {
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('MOSS PHOTO seed is outside the safe integer range.');
    workflow['71'].inputs.value = seed;
};

export const validateMossPhotoReadiness = (workflow: MossWorkflow, info: Parameters<typeof getQwen21Choices>[0]): void => {
    const missing = [...new Set(Object.values(workflow).map(node => node.class_type))].filter(name => !info?.[name]);
    if (missing.length) throw new Error(`MOSS PHOTO requires missing nodes: ${missing.join(', ')}. Install the supplied workflow's custom nodes, restart ComfyUI and reconnect.`);
    for (const node of Object.values(workflow)) {
        const schema = { ...info[node.class_type]?.input?.required, ...info[node.class_type]?.input?.optional };
        for (const [key, value] of Object.entries(node.inputs)) {
            if (isLink(value)) continue;
            const entry = schema[key];
            if (!Array.isArray(entry)) continue;
            if (Array.isArray(entry[0]) && !entry[0].includes(value)) throw new Error(`Unavailable MOSS PHOTO ${node.class_type}.${key}: ${String(value)}`);
            const bounds = entry[1];
            if (typeof value === 'number' && bounds && typeof bounds === 'object'
                && (('min' in bounds && typeof bounds.min === 'number' && value < bounds.min)
                    || ('max' in bounds && typeof bounds.max === 'number' && value > bounds.max)
                    || (entry[0] === 'INT' && !Number.isInteger(value)))) throw new Error(`Out-of-range MOSS PHOTO ${node.class_type}.${key}: ${value}`);
        }
    }
};
