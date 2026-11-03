import { executeComfyGraph, type GraphLive } from './comfyGraphExecution';
import { h3VideoFromHistory, jsonRequest, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';
import { RIPPLE_OUTPUTS, buildRippleWorkflow, defaultRippleDraft, defaultRippleSettings, type RippleDraft, type RippleSettings, validateRippleDraft } from './ltxRippleWorkflow';

export interface RippleResult {
    promptId: string;
    workflow: H3Workflow;
    settings: RippleSettings;
    draft: RippleDraft;
    videos: { id: string; label: string; url: string }[];
}
export const loadRippleObjectInfo = async (signal?: AbortSignal): Promise<H3ObjectInfo> => {
    const graph = buildRippleWorkflow(defaultRippleSettings(), defaultRippleDraft().prompt, { image: 'check.png', video: 'check.mp4' });
    const classes = [...new Set(Object.values(graph).map(node => node.class_type))];
    const schemas = await Promise.all(classes.map(async name => {
        const result = await jsonRequest(`${minimaxComfyURL()}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(result)) throw new Error(`Invalid ComfyUI schema for ${name}.`);
        return result;
    }));
    const info: H3ObjectInfo = {};
    for (const schema of schemas) for (const [name, spec] of Object.entries(schema)) if (isRecord(spec)) info[name] = spec;
    return info;
};
const uploadRippleInput = async (file: File, signal: AbortSignal): Promise<string> => {
    const form = new FormData();
    form.append('image', file, `ltx-ripple-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    form.append('type', 'input'); form.append('overwrite', 'false');
    const response = await jsonRequest(`${minimaxComfyURL()}/upload/image`, { method: 'POST', body: form, signal });
    if (!isRecord(response) || typeof response.name !== 'string' || !response.name.trim()) throw new Error(`ComfyUI did not return an uploaded filename for ${file.name}.`);
    return `${typeof response.subfolder === 'string' && response.subfolder ? `${response.subfolder}/` : ''}${response.name}`;
};
export const prepareRippleWorkflow = async (
    draft: RippleDraft, settings: RippleSettings, signal: AbortSignal, progress: (message: string, value: number) => void,
): Promise<H3Workflow> => {
    signal.throwIfAborted(); validateRippleDraft(draft);
    progress('Checking Ripple nodes, models and settings...', 0.01);
    const info = await loadRippleObjectInfo(signal);
    buildRippleWorkflow(settings, draft.prompt, { image: draft.image!.name, video: draft.video!.name }, info);
    progress('Uploading source video and edited first frame...', 0.03);
    const [image, video] = await Promise.all([uploadRippleInput(draft.image!, signal), uploadRippleInput(draft.video!, signal)]);
    signal.throwIfAborted();
    return buildRippleWorkflow(settings, draft.prompt, { image, video }, info);
};
export const generateRippleVideo = async (
    draft: RippleDraft, settings: RippleSettings, signal: AbortSignal,
    progress: (message: string, value: number) => void, onLive: (live: GraphLive) => void,
): Promise<RippleResult> => {
    const snapshot = structuredClone(settings), source = { ...draft };
    const workflow = await prepareRippleWorkflow(source, snapshot, signal, progress);
    const result = await executeComfyGraph(workflow, signal, onLive, progress);
    const videos = RIPPLE_OUTPUTS.map(output => {
        const url = h3VideoFromHistory({ outputs: result.outputs }, minimaxComfyURL(), output.id);
        if (!url) throw new Error(`Ripple completed without ${output.label}. Check ComfyUI output ${output.id}.`);
        return { ...output, url };
    });
    progress('LTX-Ripple-FFAF complete.', 1);
    return { ...result, workflow, settings: snapshot, draft: source, videos };
};
