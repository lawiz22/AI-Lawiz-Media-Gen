import { buildQwen21CharacterSheetWorkflow, defaultQwen21CharacterSheetOptions, defaultQwen21MultiOptions, getQwen21Choices, qwen21MultiDimensions, QWEN21_MULTI_SIZES, validateQwen21Readiness, type Qwen21Lora, type Qwen21MultiOptions } from './qwen21Workflow';

export interface CharacterScenePerson { id: string; description: string; pose: string; expression: string }
export interface CharacterSceneAnalysis { scene: string; style: string; lighting: string; character: string; uncertainty: string; people: CharacterScenePerson[]; placements: { label: string; instruction: string }[] }
export type CharacterSceneOptions = Omit<Qwen21MultiOptions, 'references' | 'referenceCount' | 'loras' | 'instruction'> & {
    mode: 'insert' | 'replace'; targetId: string; placement: string; refinement: string;
    lora: Qwen21Lora; extraLora: Qwen21Lora; characterMegapixels: number;
    analysis?: CharacterSceneAnalysis | null;
};
export const defaultCharacterSceneOptions = (): CharacterSceneOptions => {
    const { references, referenceCount, loras, instruction, ...common } = defaultQwen21MultiOptions();
    return { ...common, mode: 'replace', targetId: '', placement: '', refinement: '', sizeIndex: 1, orientation: 'landscape', referenceResolution: 0, seed: 1867249817168988,
        prompt: 'Put the man from <image2> to replace the man from <image1>,  Keep his face, hair and suit exactly as they are, and keep the style and its light and pose and face expression from <image1>. keep the style of <image1>. The man is normal size, not fat. Blend the man from <image2> into the image seamlessly',
        lora: { name: 'qwen21\\Fusion_2000.safetensors', enabled: true, modelStrength: 0.9, clipStrength: 0.9 }, extraLora: { name: '', enabled: false, modelStrength: 1, clipStrength: 1 }, characterMegapixels: 1 };
};
export const characterScenePrompt = (options: CharacterSceneOptions, analysis: CharacterSceneAnalysis | null): string => {
    if (!analysis) throw new Error('Analyze the scene and character first.');
    const target = analysis.people.find(person => person.id === options.targetId);
    if (options.mode === 'replace' && (!target || !target.description.trim())) throw new Error('Choose the person to replace from the analyzed scene.');
    if (options.manualPrompt) { if (!options.prompt.trim()) throw new Error('Enter a prompt.'); return options.prompt; }
    if (options.mode === 'replace') return [
        'Replace ONLY the person identified below in <image1> with the character from <image2>. This is a complete person replacement: change the target face, hair, outfit and visible body appearance to those of the reference character, rather than keeping the original person.',
        `Target locator in <image1> (identification only): "${target!.description}". This description selects the person to remove; it is not the desired appearance of the replacement.`,
        'Use <image2> as the sole reference for the replacement identity, facial features, hair, clothing and body proportions. Place that reference character at their original position in <image1>, at the same scene scale.',
        `Keep the original target pose (${target!.pose}) from <image1>. Apply the target expression (${target!.expression}) to the replacement face from <image2>, without retaining the original facial features.`,
        `Render the replacement in the scene visual style (${analysis.style}) and lighting (${analysis.lighting}) from <image1>.`,
        'Do not replace, remove or change any other person. Do not apply the face, hair or clothing from <image2> to anyone else in <image1>. Keep the existing background, objects and scene layout unchanged; keep the same number of people.',
        options.refinement,
        'Blend the character from <image2> into the image seamlessly, matching perspective, shadows, texture and grain.',
    ].filter(Boolean).join('\n');
    return ['Add the character from <image2> into the scene from <image1>. Keep all existing people in <image1> unchanged; do not replace, duplicate or remove them.',
        'Keep the character face, hair and clothing exactly as they are in <image2>. Keep the style and its light from <image1>. Keep the style of <image1>. Preserve the character existing body shape and proportions from <image2>, with a natural scale within the scene.',
        `Scene from <image1>: ${analysis.scene}.`,
        `Original visual style: ${analysis.style}. Original lighting: ${analysis.lighting}.`,
        analysis.character ? `Character from <image2>: ${analysis.character}.` : '',
        options.placement, options.refinement,
        'Blend the character from <image2> into the image seamlessly. Match the scene lighting, perspective, shadows, texture and grain while preserving the scene layout and all non-target subjects.',
    ].filter(Boolean).join('\n');
};
export const buildCharacterSceneWorkflow = (scene: string, character: string, options: CharacterSceneOptions): Record<string, any> => {
    if (!scene.trim() || !character.trim() || !options.prompt.trim()) throw new Error('Choose a scene, character and prompt.');
    if (!Number.isFinite(options.characterMegapixels) || options.characterMegapixels <= 0 || options.characterMegapixels > 16) throw new Error('Invalid character reference megapixels.');
    const dimensions = qwen21MultiDimensions(options);
    const base = buildQwen21CharacterSheetWorkflow(scene, { ...defaultQwen21CharacterSheetOptions(), ...options, sizeIndex: 0 });
    const loras = [options.lora, options.extraLora];
    for (const lora of loras) if (lora.enabled && (!lora.name.trim() || !Number.isFinite(lora.modelStrength) || !Number.isFinite(lora.clipStrength))) throw new Error('Choose valid Character in a Scene LoRAs and strengths.');
    const graph: Record<string, any> = Object.fromEntries(['1', '2', '3', '4', '5', '9', '11', '12', '13', '15', '18', '20', '21', '26'].map(id => [id, base[id]]));
    const node = (class_type: string, inputs: Record<string, any>) => ({ class_type, inputs });
    graph['4'].inputs.model = ['28', 0];
    const characterLoader = buildQwen21CharacterSheetWorkflow(character, { ...defaultQwen21CharacterSheetOptions(), seed: options.seed })['5'];
    characterLoader.inputs.LoadImageMiniState = JSON.stringify({ ...JSON.parse(characterLoader.inputs.LoadImageMiniState), mode: 'max_mp', max_mp: options.characterMegapixels });
    graph['6'] = characterLoader;
    graph['8'] = node('PixaromaPrompt', { PromptState: JSON.stringify({ text: options.prompt, order: 'mine', sep: ', ' }) });
    graph['10'] = node('TextEncodeQwenImage21', { prompt: ['8', 0], negative_prompt: options.negativePrompt, resolution: options.referenceResolution, clip: ['2', 0], 'images.image_1': ['19', 0], 'images.image_2': ['6', 0], vae: ['3', 0] });
    graph['14'] = node('PixaromaCompare', { image1: ['19', 0], image2: ['12', 0] });
    graph['16'] = node('PixaromaSizes', { SizesState: JSON.stringify({ version: 1, sizes: QWEN21_MULTI_SIZES, selected: options.sizeIndex, orientation: options.orientation, snap: 32, accent: null, collapsed: false, starred: ['2048x2048', '1792x2400', '1696x2528', '1536x2752'], w: dimensions.width, h: dimensions.height }) });
    graph['19'] = node('PixaromaResizeCrop', { width: ['27', 0], height: ['27', 1], image: ['5', 0] });
    graph['27'] = node('GetImageSize', { image: ['18', 0] });
    graph['28'] = node('PixaromaLoraLoader', { model: ['1', 0], LoraLoaderState: JSON.stringify({ version: 1, sep: ', ', cacheMode: 'last', loras: loras.filter(lora => lora.name.trim()).map(lora => ({ name: lora.name, on: lora.enabled, sm: lora.modelStrength, sc: lora.clipStrength, triggers: [] })) }) });
    return graph;
};
export const validateCharacterSceneReadiness = (graph: Record<string, any>, info: any): void => {
    validateQwen21Readiness(graph, info, '28');
    for (const [id, type, key] of [['1', 'UNETLoader', 'weight_dtype'], ['2', 'CLIPLoader', 'device'], ['4', 'QwenImage21Cache', 'device'], ['4', 'QwenImage21Cache', 'dtype'], ['18', 'ImageScaleToTotalPixels', 'upscale_method']]) {
        if (!getQwen21Choices(info, type, key).includes(graph[id].inputs[key])) throw new Error(`Unavailable ${type}.${key}: ${graph[id].inputs[key]}`);
    }
};
export const parseCharacterSceneAnalysis = (text: string): CharacterSceneAnalysis => {
    const raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const field = (value: unknown, label: string, allowEmpty = false): string => { if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > 1600) throw new Error(`Invalid scene analysis: ${label}.`); return value.trim(); };
    if (!Array.isArray(raw?.people) || raw.people.length > 20 || !Array.isArray(raw.placements) || raw.placements.length > 8) throw new Error('Invalid scene people or placements.');
    const ids = new Set<string>();
    const people = raw.people.map((person: any) => {
        const id = field(person?.id, 'person ID'); if (!/^person-[1-9]\d*$/.test(id) || ids.has(id)) throw new Error('Invalid or duplicate scene person ID.'); ids.add(id);
        return { id, description: field(person.description, 'person description'), pose: field(person.pose, 'person pose'), expression: field(person.expression, 'person expression') };
    });
    return { scene: field(raw.scene, 'scene'), style: field(raw.style, 'style'), lighting: field(raw.lighting, 'lighting'), character: field(raw.character, 'character', true), uncertainty: field(raw.uncertainty, 'uncertainty', true), people,
        placements: raw.placements.map((placement: any) => ({ label: field(placement?.label, 'placement label'), instruction: field(placement.instruction, 'placement instruction') })) };
};