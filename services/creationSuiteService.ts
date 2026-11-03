import { openDB } from 'idb';
import { jsonRequest, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';
import { mossPreviewBlob } from './mossWorkflow';
import { buildCreationSuiteWorkflow, creationSuitePrompt, CREATION_SUITE_TEMPLATE, validateCreationSuiteDraft, validateCreationSuiteSettings, type CreationSuiteDraft, type CreationSuiteInput, type CreationSuiteSettings } from './creationSuiteWorkflow';

export interface CreationSuiteResult {
    sceneUrl?: string;
    swapUrl?: string;
    promptId: string;
    settings: CreationSuiteSettings;
    workflow: H3Workflow;
    scenePrompt: string;
}
export interface CreationSuiteSample { step: number; value: number }
export interface CreationSuiteLive {
    phase: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
    nodeId?: string;
    nodes: { id: string; title: string; classType: string; state: 'pending' | 'running' | 'done' | 'cached' | 'failed' | 'cancelled' }[];
    preview?: Blob;
    previewNodeId?: string;
    step?: number;
    total?: number;
    width?: number;
    height?: number;
    averageStepMs?: number;
    sigmas: CreationSuiteSample[];
    deltas: CreationSuiteSample[];
    stepTimes: CreationSuiteSample[];
}
export const emptyCreationSuiteLive = (): CreationSuiteLive => ({ phase: 'queued', nodes: [], sigmas: [], deltas: [], stepTimes: [] });
const database = () => openDB('lawiz-creation-suite', 1, { upgrade(db) { db.createObjectStore('drafts'); } });
export const loadCreationSuiteDraft = async (): Promise<CreationSuiteDraft | undefined> => {
    const db = await database();
    try {
        const draft = await db.get('drafts', 'workspace');
        if (draft !== undefined) {
            if (!isRecord(draft) || !isRecord(draft.files)) throw new Error('Invalid stored Creation suite draft.');
            validateCreationSuiteSettings(draft.settings);
            for (const key of ['showPreview', 'showCharts']) if (draft[key] !== undefined && typeof draft[key] !== 'boolean') throw new Error(`Invalid stored Creation suite display option ${key}.`);
            for (const file of Object.values(draft.files)) if (file !== undefined && !(file instanceof File)) throw new Error('Invalid stored Creation suite image.');
        }
        return draft;
    } finally { db.close(); }
};
export const saveCreationSuiteDraft = async (draft: CreationSuiteDraft): Promise<void> => {
    const db = await database();
    try { await db.put('drafts', draft, 'workspace'); } finally { db.close(); }
};
export const loadCreationSuiteObjectInfo = async (signal?: AbortSignal): Promise<H3ObjectInfo> => {
    const base = minimaxComfyURL();
    const schemas = await Promise.all([...new Set(Object.values(CREATION_SUITE_TEMPLATE).map(spec => spec.class_type))].map(async name => {
        const result = await jsonRequest(`${base}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(result)) throw new Error(`Invalid Creation suite schema for ${name}.`);
        return result;
    }));
    return Object.assign({}, ...schemas);
};
export const prepareCreationSuiteWorkflow = async (draft: CreationSuiteDraft, signal: AbortSignal): Promise<H3Workflow> => {
    validateCreationSuiteDraft(draft); signal.throwIfAborted();
    const info = await loadCreationSuiteObjectInfo(signal);
    const placeholders = Object.fromEntries(Object.entries(draft.files).filter(([, file]) => !!file).map(([role, file]) => [role, file.name]));
    const active = buildCreationSuiteWorkflow(draft.settings, placeholders, info);
    const files: Partial<Record<CreationSuiteInput, string>> = {};
    for (const [role, node] of [['sourceImage', '31'], ['startFrame', '111'], ['characterSceneImage', '112']] as const) {
        if (!active[node]) continue;
        const file = draft.files[role]!;
        const form = new FormData();
        form.append('image', file, `creation-suite-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
        form.append('type', 'input'); form.append('overwrite', 'false');
        const result = await jsonRequest(`${minimaxComfyURL()}/upload/image`, { method: 'POST', body: form, signal });
        if (!isRecord(result) || typeof result.name !== 'string' || !result.name) throw new Error(`ComfyUI did not return an uploaded filename for ${role}.`);
        files[role] = `${typeof result.subfolder === 'string' && result.subfolder ? `${result.subfolder}/` : ''}${result.name}`;
    }
    signal.throwIfAborted();
    return buildCreationSuiteWorkflow(draft.settings, files, info);
};
const imageURL = (output: unknown, base: string): string | undefined => {
    if (!isRecord(output) || !Array.isArray(output.images) || !isRecord(output.images[0]) || typeof output.images[0].filename !== 'string' || !output.images[0].filename.trim()) return;
    const file = output.images[0];
    return `${base}/view?${new URLSearchParams({ filename: String(file.filename), subfolder: typeof file.subfolder === 'string' ? file.subfolder : '', type: typeof file.type === 'string' ? file.type : 'output' })}`;
};
const pause = (signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
export const generateCreationSuite = async (
    draft: CreationSuiteDraft, signal: AbortSignal, progress: (message: string, value: number) => void,
    onLive?: (live: CreationSuiteLive) => void,
): Promise<CreationSuiteResult> => {
    const settings = structuredClone(draft.settings);
    if (settings.sceneEnabled && settings.randomizeSceneSeed) settings.nodes['10'].seed = Math.floor(Math.random() * 1e15);
    if (settings.swapEnabled && settings.randomizeSwapSeed) settings.nodes['120'].seed = Math.floor(Math.random() * 1e15);
    progress('Checking Creation suite nodes, models and inputs...', 0.01);
    const workflow = await prepareCreationSuiteWorkflow({ ...draft, settings }, signal);
    const base = minimaxComfyURL(), client = `lawiz-creation-suite-${crypto.randomUUID()}`;
    const url = new URL(`${base}/ws`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('clientId', client);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    let promptId = '', completed = false, stage = 'Waiting for ComfyUI', fraction = 0.1;
    let ownsExecution = false, live = emptyCreationSuiteLive();
    live.nodes = Object.entries(workflow).map(([id, spec]) => ({
        id, title: ('_meta' in spec && isRecord(spec._meta) && typeof spec._meta.title === 'string' ? spec._meta.title : spec.class_type).replace(/\s*\u23f1.*$/u, ''),
        classType: spec.class_type, state: 'pending',
    }));
    const publish = () => onLive?.({ ...live, nodes: live.nodes.map(node => ({ ...node })) });
    const pendingMessages: string[] = [];
    const sample = (series: CreationSuiteSample[], step: number, value: number) =>
        [...series.filter(point => point.step !== step), { step, value }].sort((a, b) => a.step - b.step).slice(-256);
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    const handleMessage = (payload: unknown) => {
        if (signal.aborted) return;
        if (payload instanceof ArrayBuffer) {
            if (!promptId || !ownsExecution || !live.nodeId || !onLive) return;
            const preview = mossPreviewBlob(payload);
            if (preview) { live.preview = preview; live.previewNodeId = live.nodeId; publish(); }
            return;
        }
        if (typeof payload !== 'string') return;
        if (!promptId) { pendingMessages.push(payload); if (pendingMessages.length > 64) pendingMessages.shift(); return; }
        try {
            const message: unknown = JSON.parse(payload);
            if (!isRecord(message) || !isRecord(message.data)) return;
            const data = message.data;
            if (message.type === 'kj_preview_override') {
                const nodeId = String(data.node_id);
                if (!onLive || !workflow[nodeId] || workflow[nodeId].class_type !== 'ModelPreviewOverrideKJ'
                    || (typeof data.prompt_id === 'string' ? data.prompt_id !== promptId : !ownsExecution || !live.nodeId
                        || (Number(nodeId) < 100) !== (Number(live.nodeId) < 100))) return;
                if (finite(data.step) && data.step >= 0) live.step = data.step;
                if (finite(data.total) && data.total > 0) live.total = data.total;
                if (Array.isArray(data.sigmas) && data.sigmas.every(finite)) {
                    live.sigmas = data.sigmas.map((value, step) => ({ step, value }));
                }
                if (finite(data.sigma) && live.step !== undefined) {
                    live.sigmas = [...live.sigmas.filter(point => point.step !== live.step), { step: live.step, value: data.sigma }].sort((a, b) => a.step - b.step);
                }
                if (finite(data.delta) && live.step !== undefined) live.deltas = sample(live.deltas, live.step, data.delta);
                if (finite(data.step_ms) && data.step_ms >= 0 && live.step !== undefined) live.stepTimes = sample(live.stepTimes, live.step, data.step_ms / 1000);
                if (finite(data.avg_step_ms) && data.avg_step_ms >= 0) live.averageStepMs = data.avg_step_ms;
                if (finite(data.w) && data.w > 0) live.width = data.w;
                if (finite(data.h) && data.h > 0) live.height = data.h;
                if (typeof data.image === 'string') {
                    const mime = typeof data.mime === 'string' ? data.mime : 'image/jpeg';
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error(`Unsupported live preview format: ${mime}`);
                    live.preview = new Blob([Uint8Array.from(atob(data.image), character => character.charCodeAt(0))], { type: mime });
                    live.previewNodeId = nodeId;
                }
                publish(); return;
            }
            if (message.type === 'executing' || message.type === 'execution_start') ownsExecution = data.prompt_id === promptId;
            if (data.prompt_id !== promptId) return;
            if (message.type === 'executing') {
                const nodeId = data.node == null ? undefined : String(data.node);
                if (live.nodeId) live.nodes = live.nodes.map(node => node.id === live.nodeId && node.state === 'running' ? { ...node, state: 'done' } : node);
                if (nodeId && workflow[nodeId]) {
                    if (workflow[nodeId].class_type === 'KSampler' && nodeId !== live.nodeId) {
                        live = { ...live, preview: undefined, previewNodeId: undefined, step: undefined, total: undefined,
                            width: undefined, height: undefined, averageStepMs: undefined, sigmas: [], deltas: [], stepTimes: [] };
                    }
                    live.nodeId = nodeId; live.phase = 'running';
                    live.nodes = live.nodes.map(node => node.id === nodeId ? { ...node, state: 'running' } : node);
                    stage = `${Number(nodeId) < 100 ? 'Scene Creation' : 'Swap face-Change expression'}: ${workflow[nodeId].class_type}`;
                    fraction = Number(nodeId) >= 100 && settings.sceneEnabled ? 0.6 : 0.15;
                } else { live.nodeId = undefined; ownsExecution = false; }
            }
            if (message.type === 'execution_cached' && Array.isArray(data.nodes)) {
                const cached = data.nodes;
                live.nodes = live.nodes.map(node => cached.includes(node.id) ? { ...node, state: 'cached' } : node);
            }
            if (message.type === 'executed' && data.node != null) live.nodes = live.nodes.map(node => node.id === String(data.node) ? { ...node, state: 'done' } : node);
            if (message.type === 'execution_success' || message.type === 'execution_error' || message.type === 'execution_interrupted') ownsExecution = false;
            if (message.type === 'progress' && finite(data.value) && finite(data.max) && data.max > 0) {
                live.step = data.value; live.total = data.max;
                const withinStage = Math.max(0, Math.min(1, data.value / data.max));
                fraction = settings.sceneEnabled && settings.swapEnabled ? (Number(live.nodeId) >= 100 ? 0.55 : 0.1) + withinStage * 0.4 : 0.1 + withinStage * 0.8;
                progress(`${stage} (${data.value}/${data.max})`, fraction);
            } else progress(stage, fraction);
            publish();
        } catch (cause) { progress(`Invalid live progress message; monitoring history: ${cause instanceof Error ? cause.message : String(cause)}`, fraction); }
    };
    ws.onmessage = event => handleMessage(event.data);
    publish();
    try {
        await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer); signal.removeEventListener('abort', abort); ws.onopen = null; ws.onerror = null;
                if (error) reject(error); else resolve();
            };
            const abort = () => finish(new DOMException('Creation suite cancelled.', 'AbortError'));
            const timer = setTimeout(() => finish(new Error('Timed out connecting to ComfyUI. No job was queued.')), 30000);
            ws.onopen = () => finish(); ws.onerror = () => finish(new Error('Could not connect to ComfyUI. No job was queued.'));
            if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
        ws.onerror = () => progress('Live progress failed; monitoring Creation suite history...', fraction);
        ws.onclose = () => { if (!completed && !signal.aborted) progress('Live progress disconnected; monitoring Creation suite history...', fraction); };
        signal.throwIfAborted();
        // Obtain the owned ID even if cancellation arrives while submission is in flight.
        const queued = await jsonRequest(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: client }) });
        if (!isRecord(queued) || typeof queued.prompt_id !== 'string' || !queued.prompt_id) throw new Error(`ComfyUI rejected Creation suite: ${JSON.stringify(queued).slice(0, 1800)}`);
        promptId = queued.prompt_id;
        for (const message of pendingMessages) handleMessage(message);
        pendingMessages.length = 0;
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (true) {
            signal.throwIfAborted();
            const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`, { signal });
            const history = isRecord(payload) ? payload[promptId] : undefined;
            if (isRecord(history)) {
                const status = isRecord(history.status) ? history.status : {};
                if (status.status_str === 'error') throw new Error(`Creation suite failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                if (isRecord(history.outputs)) {
                    const sceneUrl = imageURL(history.outputs['12'], base), swapUrl = imageURL(history.outputs['131'], base);
                    if ((!settings.sceneEnabled || sceneUrl) && (!settings.swapEnabled || swapUrl)) {
                        live.phase = 'complete'; live.nodeId = undefined; ownsExecution = false;
                        if (status.completed) live.nodes = live.nodes.map(node => node.state === 'cached' ? node : { ...node, state: 'done' });
                        publish();
                        completed = true; progress('Creation suite ready.', 1);
                        return { sceneUrl, swapUrl, promptId, settings, workflow, scenePrompt: creationSuitePrompt(settings) };
                    }
                }
                if (status.completed) throw new Error('Creation suite completed without all enabled pipeline outputs (12 / 131). Check ComfyUI logs.');
            }
            if (Date.now() > deadline) throw new Error('Creation suite monitoring timed out after two hours. Check the ComfyUI queue before retrying.');
            await pause(signal);
        }
    } catch (cause) {
        live.phase = signal.aborted ? 'cancelled' : 'failed';
        const state = live.phase;
        live.nodes = live.nodes.map(node => node.state === 'running' ? { ...node, state } : node);
        live.nodeId = undefined; ownsExecution = false; publish();
        if (signal.aborted && promptId && !completed) {
            try {
                const result = await jsonRequest(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST' });
                if (!isRecord(result) || result.cancelled !== true) throw new Error('The server did not confirm targeted cancellation.');
            } catch (error) { throw new Error(`Could not confirm cancellation of Creation suite job ${promptId}. No global interrupt was sent. ${error instanceof Error ? error.message : String(error)}`, { cause }); }
        }
        throw cause;
    } finally { ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); }
};
