import { openDB } from 'idb';
import { jsonRequest, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';
import { mossPreviewBlob } from './mossWorkflow';
import { buildClothesSwitcherWorkflow, CLOTHES_SWITCHER_TEMPLATE, upgradeClothesSwitcherSettings, validateClothesSwitcherDraft, type ClothesSwitcherDraft, type ClothesSwitcherSettings } from './clothesSwitcherWorkflow';

export interface ClothesSwitcherLive {
    depthUrl?: string;
    cannyUrl?: string;
    preview?: Blob;
    node?: string;
    step?: number;
    total?: number;
}
export interface ClothesSwitcherResult {
    url: string;
    depthUrl: string;
    cannyUrl: string;
    promptId: string;
    workflow: H3Workflow;
    settings: ClothesSwitcherSettings;
}
const database = () => openDB('lawiz-clothes-switcher', 1, { upgrade(db) { db.createObjectStore('drafts'); } });
export const loadClothesSwitcherDraft = async (): Promise<ClothesSwitcherDraft | undefined> => {
    const db = await database();
    try {
        let draft = await db.get('drafts', 'workspace');
        if (draft !== undefined) {
            if (!isRecord(draft)) throw new Error('Invalid stored Clothes Switcher draft.');
            draft = { ...draft, settings: upgradeClothesSwitcherSettings(draft.settings) };
            validateClothesSwitcherDraft(draft);
        }
        return draft;
    } finally { db.close(); }
};
export const saveClothesSwitcherDraft = async (draft: ClothesSwitcherDraft): Promise<void> => {
    validateClothesSwitcherDraft(draft);
    const db = await database();
    try { await db.put('drafts', draft, 'workspace'); } finally { db.close(); }
};
export const loadClothesSwitcherObjectInfo = async (signal?: AbortSignal): Promise<H3ObjectInfo> => {
    const schemas = await Promise.all([...new Set(Object.values(CLOTHES_SWITCHER_TEMPLATE).map(node => node.class_type))].map(async name => {
        const schema = await jsonRequest(`${minimaxComfyURL()}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(schema)) throw new Error(`Invalid Clothes Switcher schema for ${name}.`);
        return schema;
    }));
    return Object.assign({}, ...schemas);
};
export const prepareClothesSwitcherWorkflow = async (draft: ClothesSwitcherDraft, signal: AbortSignal): Promise<H3Workflow> => {
    validateClothesSwitcherDraft(draft); signal.throwIfAborted();
    if (!draft.file) throw new Error('Choose the original photo for Clothes Switcher.');
    const info = await loadClothesSwitcherObjectInfo(signal);
    buildClothesSwitcherWorkflow(draft.settings, draft.file.name, info);
    const form = new FormData();
    form.append('image', draft.file, `clothes-switcher-${crypto.randomUUID()}-${draft.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    form.append('type', 'input'); form.append('overwrite', 'false');
    const uploaded = await jsonRequest(`${minimaxComfyURL()}/upload/image`, { method: 'POST', body: form, signal });
    if (!isRecord(uploaded) || typeof uploaded.name !== 'string' || !uploaded.name.trim()) throw new Error('ComfyUI did not return the uploaded Clothes Switcher filename.');
    signal.throwIfAborted();
    const filename = `${typeof uploaded.subfolder === 'string' && uploaded.subfolder ? `${uploaded.subfolder}/` : ''}${uploaded.name}`;
    return buildClothesSwitcherWorkflow(draft.settings, filename, info);
};
export const clothesSwitcherImageURL = (output: unknown, base: string): string | undefined => {
    if (!isRecord(output) || !Array.isArray(output.images) || !isRecord(output.images[0])) return;
    const image = output.images[0];
    if (typeof image.filename !== 'string' || !image.filename.trim()) return;
    return `${base}/view?${new URLSearchParams({ filename: image.filename, subfolder: typeof image.subfolder === 'string' ? image.subfolder : '', type: typeof image.type === 'string' ? image.type : 'output' })}`;
};
const pause = (signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
export const generateClothesSwitcher = async (
    draft: ClothesSwitcherDraft, signal: AbortSignal, progress: (message: string, value: number) => void,
    onLive: (value: ClothesSwitcherLive) => void,
): Promise<ClothesSwitcherResult> => {
    const settings = structuredClone(draft.settings);
    if (settings.randomizeSeed) settings.nodes['138'].seed = Math.floor(Math.random() * 1e15);
    progress('Checking Clothes Switcher nodes, models and input...', 0.01);
    const workflow = await prepareClothesSwitcherWorkflow({ ...draft, settings }, signal);
    const base = minimaxComfyURL(), client = `lawiz-clothes-switcher-${crypto.randomUUID()}`;
    const url = new URL(`${base}/ws`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('clientId', client);
    const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    let promptId = '', completed = false, ownsExecution = false, message = 'Waiting for ComfyUI', fraction = 0.05;
    const live: ClothesSwitcherLive = {}, pending: string[] = [];
    const publish = () => onLive({ ...live });
    const outputs = (value: Record<string, unknown>) => {
        const depth = clothesSwitcherImageURL(value['150'], base), canny = clothesSwitcherImageURL(value['163'], base);
        if (depth) live.depthUrl = depth;
        if (canny) live.cannyUrl = canny;
        publish();
    };
    const handle = (payload: unknown) => {
        if (signal.aborted) return;
        if (payload instanceof ArrayBuffer) {
            if (!promptId || !ownsExecution || live.node !== '138') return;
            const preview = mossPreviewBlob(payload);
            if (preview) { live.preview = preview; publish(); }
            return;
        }
        if (typeof payload !== 'string') return;
        if (!promptId) { pending.push(payload); if (pending.length > 64) pending.shift(); return; }
        try {
            const event: unknown = JSON.parse(payload);
            if (!isRecord(event) || !isRecord(event.data)) return;
            const data = event.data;
            if (event.type === 'execution_start' || event.type === 'executing') ownsExecution = data.prompt_id === promptId;
            if (data.prompt_id !== promptId) return;
            if (event.type === 'executing') {
                live.node = data.node == null ? undefined : String(data.node);
                if (!live.node) ownsExecution = false;
                message = live.node && workflow[live.node] ? `Clothes Switcher: ${workflow[live.node].class_type} (node ${live.node})` : 'Finishing Clothes Switcher...';
            }
            if (event.type === 'executed' && data.node != null) outputs({ [String(data.node)]: data.output });
            if (event.type === 'progress' && typeof data.value === 'number' && Number.isFinite(data.value)
                && typeof data.max === 'number' && Number.isFinite(data.max) && data.max > 0) {
                live.step = data.value; live.total = data.max;
                fraction = 0.1 + Math.max(0, Math.min(1, data.value / data.max)) * 0.8;
            }
            if (['execution_success', 'execution_error', 'execution_interrupted'].includes(String(event.type))) ownsExecution = false;
            progress(message, fraction); publish();
        } catch (cause) { progress(`Invalid Clothes Switcher live message; monitoring history: ${cause instanceof Error ? cause.message : String(cause)}`, fraction); }
    };
    ws.onmessage = event => handle(event.data);
    try {
        await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer); signal.removeEventListener('abort', abort); ws.onopen = null; ws.onerror = null; ws.onclose = null;
                if (error) reject(error); else resolve();
            };
            const abort = () => finish(new DOMException('Clothes Switcher cancelled.', 'AbortError'));
            const timer = setTimeout(() => finish(new Error('Timed out connecting to ComfyUI. No job was queued.')), 30000);
            ws.onopen = () => finish();
            ws.onerror = ws.onclose = () => finish(new Error('Could not connect to ComfyUI. No job was queued.'));
            if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
        ws.onerror = ws.onclose = () => { if (!completed && !signal.aborted) progress('Live previews disconnected; monitoring Clothes Switcher history...', fraction); };
        signal.throwIfAborted();
        // Keep the owned ID even when cancellation arrives during submission.
        const queued = await jsonRequest(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: client }) });
        if (!isRecord(queued) || typeof queued.prompt_id !== 'string' || !queued.prompt_id) throw new Error(`ComfyUI rejected Clothes Switcher: ${JSON.stringify(queued).slice(0, 1800)}`);
        promptId = queued.prompt_id;
        for (const payload of pending) handle(payload);
        pending.length = 0;
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (true) {
            signal.throwIfAborted();
            const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`, { signal });
            const history = isRecord(payload) ? payload[promptId] : undefined;
            if (isRecord(history)) {
                const status = isRecord(history.status) ? history.status : {};
                if (status.status_str === 'error') throw new Error(`Clothes Switcher failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                if (isRecord(history.outputs)) {
                    outputs(history.outputs);
                    const resultURL = clothesSwitcherImageURL(history.outputs['9'], base);
                    if (status.completed && resultURL && live.depthUrl && live.cannyUrl) {
                        completed = true; live.node = undefined; publish(); progress('Clothes Switcher ready.', 1);
                        return { url: resultURL, depthUrl: live.depthUrl, cannyUrl: live.cannyUrl, promptId, workflow, settings };
                    }
                }
                if (status.completed) throw new Error('Clothes Switcher completed without its result and both previews (9 / 150 / 163). Check ComfyUI logs.');
            }
            if (Date.now() > deadline) throw new Error('Clothes Switcher monitoring timed out after two hours. Check the ComfyUI queue before retrying.');
            await pause(signal);
        }
    } catch (cause) {
        if (signal.aborted && promptId && !completed) {
            try {
                const cancelled = await jsonRequest(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST' });
                if (!isRecord(cancelled) || cancelled.cancelled !== true) throw new Error('The server did not confirm targeted cancellation.');
            } catch (error) { throw new Error(`Could not confirm cancellation of Clothes Switcher job ${promptId}. No global interrupt was sent. ${error instanceof Error ? error.message : String(error)}`, { cause }); }
        }
        throw cause;
    } finally { ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); }
};
