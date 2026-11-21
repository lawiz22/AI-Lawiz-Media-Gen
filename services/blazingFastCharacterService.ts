import { openDB } from 'idb';
import { jsonRequest, loadH3Catalog, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';
import { executeComfyGraph, comfyOutputImage, comfyOutputText, type GraphLive } from './comfyGraphExecution';
import { blazingOutputs, blazingPoseCount, BLAZING_TEMPLATE, buildBlazingWorkflow, validateBlazingDraft, type BlazingDraft } from './blazingFastCharacterWorkflow';
import type { GalleryStyle } from './styleGallery';

export interface BlazingResult {
    promptId: string; workflow: H3Workflow; draft: BlazingDraft; style?: GalleryStyle;
    identity: string; finalCaption: string;
    outcome: 'complete' | 'cancelled' | 'failed';
    images: { id: string; label: string; url: string; caption: string }[];
}
const database = () => openDB('lawiz-blazing-fast-character', 1, { upgrade(db) { db.createObjectStore('workspace'); } });
export const loadBlazingDraft = async (): Promise<BlazingDraft | undefined> => {
    const db = await database();
    try {
        const value = await db.get('workspace', 'draft');
        if (value !== undefined) validateBlazingDraft(value);
        return value;
    } finally { db.close(); }
};
export const saveBlazingDraft = async (draft: BlazingDraft): Promise<void> => {
    validateBlazingDraft(draft);
    const db = await database();
    try { await db.put('workspace', draft, 'draft'); } finally { db.close(); }
};
// Lists are served from the shared cache; force re-reads the server before validating or queueing.
export const loadBlazingObjectInfo = (signal?: AbortSignal, force = false): Promise<H3ObjectInfo> =>
    loadH3Catalog([...Object.values(BLAZING_TEMPLATE).map(node => node.class_type).filter(name => name !== 'CustomCombo'), 'LoraLoaderModelOnly', 'LoraLoader', 'BasicScheduler'], signal, force);
export const prepareBlazingWorkflow = async (draft: BlazingDraft, style: GalleryStyle | undefined, signal: AbortSignal): Promise<H3Workflow> => {
    validateBlazingDraft(draft); signal.throwIfAborted();
    if (!draft.file) throw new Error('Choose a character reference image.');
    const info = await loadBlazingObjectInfo(signal, true);
    signal.throwIfAborted();
    buildBlazingWorkflow(draft.settings, draft.file.name, style, info);
    const form = new FormData();
    form.append('image', draft.file, `blazing-${crypto.randomUUID()}-${draft.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    form.append('type', 'input'); form.append('overwrite', 'false');
    const uploaded = await jsonRequest(`${minimaxComfyURL()}/upload/image`, { method: 'POST', body: form, signal });
    if (!isRecord(uploaded) || typeof uploaded.name !== 'string' || !uploaded.name.trim()) throw new Error('ComfyUI did not return an uploaded image filename.');
    signal.throwIfAborted();
    const filename = `${typeof uploaded.subfolder === 'string' && uploaded.subfolder ? `${uploaded.subfolder}/` : ''}${uploaded.name}`;
    return buildBlazingWorkflow(draft.settings, filename, style, info);
};
export const collectBlazingResult = (promptId: string, workflow: H3Workflow, draft: BlazingDraft, outputs: Record<string, unknown>, style?: GalleryStyle, outcome: BlazingResult['outcome'] = 'complete'): BlazingResult => {
    const identity = comfyOutputText(outputs['358']) || comfyOutputText(outputs['445:357']);
    const finalCaption = comfyOutputText(outputs['771']) || comfyOutputText(outputs['757:752']);
    const hasCollage = blazingPoseCount(draft.settings) === 6;
    if (outcome === 'complete' && (!identity || hasCollage && !finalCaption)) throw new Error('Blazing Fast finished without its generated identity or final caption (358 / 771). Check TextGenerate and PreviewAny in ComfyUI.');
    const editPrompt = comfyOutputText(outputs['495']);
    const images = blazingOutputs(draft.settings).flatMap((output, index) => {
        const url = comfyOutputImage(outputs[output.id]);
        if (!url) {
            if (outcome === 'complete') throw new Error(`Blazing Fast finished without ${output.label} (node ${output.id}). The requested result is incomplete.`);
            return [];
        }
        const instruction = index === 0 ? editPrompt || String(workflow['554:546'].inputs.value) : index < 6 ? String(workflow[output.prompt].inputs.value) : '';
        const caption = [
            output.label, `Generation outcome: ${outcome}.`,
            identity ? `Identity (vision model):\n${identity}` : 'Identity description was not generated before execution stopped.',
            instruction ? `Generation instructions:\n${instruction}` : '',
            index === 7 ? 'Comparison layout: original reference on the left; generated six-pose sheet on the right.' : '',
            finalCaption ? `Generated six-pose reference description:\n${finalCaption}`
                : hasCollage ? 'Final collage caption unavailable: execution stopped before it was generated.'
                    : 'No collage or final collage caption: fewer than six poses requested.',
        ].filter(Boolean).join('\n\n');
        return [{ id: output.id, label: output.label, url, caption }];
    });
    return { promptId, workflow, draft, style, identity, finalCaption, images, outcome };
};
export const generateBlazingCharacter = async (
    draft: BlazingDraft, style: GalleryStyle | undefined, signal: AbortSignal,
    progress: (message: string, value: number) => void, onLive: (live: GraphLive) => void,
    onPartial?: (result: BlazingResult) => void,
): Promise<BlazingResult> => {
    const snapshot = structuredClone(draft), styleSnapshot = style ? structuredClone(style) : undefined;
    if (snapshot.settings.randomizeSeed) snapshot.settings.seed = Math.floor(Math.random() * 1e15);
    progress('Checking the supplied workflow, models and LoRAs...', 0.01);
    const workflow = await prepareBlazingWorkflow(snapshot, styleSnapshot, signal);
    let latest: GraphLive = { completedNodes: [], outputs: {} };
    try {
        const { promptId, outputs } = await executeComfyGraph(workflow, signal, live => { latest = live; onLive(live); }, progress);
        signal.throwIfAborted();
        return collectBlazingResult(promptId, workflow, snapshot, outputs, styleSnapshot);
    } catch (cause) {
        if (latest.promptId) {
            const partial = collectBlazingResult(latest.promptId, workflow, snapshot, latest.outputs, styleSnapshot,
                cause instanceof DOMException && cause.name === 'AbortError' ? 'cancelled' : 'failed');
            if (partial.images.length) onPartial?.(partial);
        }
        throw cause;
    }
};
