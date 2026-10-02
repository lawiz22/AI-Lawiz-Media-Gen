export interface SceneSegmentationTarget { id: string; prompt: string; padding: number }

export const buildSceneMaskWorkflow = (image: string, checkpoint: string, prompt: string, padding = 0): Record<string, any> => {
    const singlePrompt = prompt.replace(/[(),]/g, ' ').replace(/\s*:\s*[\d.]+\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!checkpoint.trim() || !singlePrompt) throw new Error('Select a SAM3 checkpoint and describe the person.');
    if (!Number.isInteger(padding) || padding < 0 || padding > 128) throw new Error('Invalid SAM3 mask padding.');
    return {
        source: { class_type: 'LoadImage', inputs: { image } },
        sam: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
        text: { class_type: 'CLIPTextEncode', inputs: { text: singlePrompt, clip: ['sam', 1] } },
        detect: { class_type: 'SAM3_Detect', inputs: { model: ['sam', 0], image: ['source', 0], conditioning: ['text', 0], threshold: 0.5, refine_iterations: 0, individual_masks: true } },
        mask_image: { class_type: 'MaskToImage', inputs: { mask: ['detect', 0] } },
        raw_save: { class_type: 'SaveImage', inputs: { images: ['mask_image', 0], filename_prefix: 'Scene_Variation_SAM3_Raw' } },
        grow: { class_type: 'GrowMask', inputs: { mask: ['detect', 0], expand: padding, tapered_corners: true } },
        expanded_image: { class_type: 'MaskToImage', inputs: { mask: ['grow', 0] } },
        save: { class_type: 'SaveImage', inputs: { images: ['expanded_image', 0], filename_prefix: 'Scene_Variation_SAM3' } },
    };
};

export const sceneSegmentationErrors = (info: any, checkpoint: string): string[] => {
    const workflow = buildSceneMaskWorkflow('source.png', checkpoint || '(none)', 'person');
    const errors: string[] = [];
    for (const node of Object.values(workflow)) {
        if (!info?.[node.class_type]) { errors.push(`Missing SAM3 node: ${node.class_type}`); continue; }
        const inputs = { ...info[node.class_type].input?.required, ...info[node.class_type].input?.optional };
        for (const key of Object.keys(node.inputs)) if (!(key in inputs)) errors.push(`Unsupported SAM3 input: ${node.class_type}.${key}`);
    }
    const definition = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
    const choices = definition?.[0] === 'COMBO' ? definition?.[1]?.options : definition?.[0];
    if (!checkpoint || !Array.isArray(choices) || !choices.includes(checkpoint)) errors.push(`Unavailable SAM3 checkpoint: ${checkpoint || '(none)'}`);
    return errors;
};