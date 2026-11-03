import { jsonRequest, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3Workflow } from './minimaxH3Workflow';
import { mossPreviewBlob } from './mossWorkflow';

export interface GraphLive {
    promptId?: string;
    node?: string; step?: number; total?: number; preview?: Blob;
    completedNodes: string[]; outputs: Record<string, unknown>;
}
export const comfyOutputImage = (output: unknown, base?: string): string | undefined => {
    if (!isRecord(output) || !Array.isArray(output.images) || !isRecord(output.images[0])) return;
    const image = output.images[0];
    if (typeof image.filename !== 'string' || !image.filename.trim()) return;
    return `${base ?? minimaxComfyURL()}/view?${new URLSearchParams({ filename: image.filename, subfolder: typeof image.subfolder === 'string' ? image.subfolder : '', type: typeof image.type === 'string' ? image.type : 'output' })}`;
};
export const comfyOutputText = (output: unknown): string => {
    if (!isRecord(output)) return '';
    for (const key of ['text', 'string', 'value']) {
        const text = output[key];
        if (typeof text === 'string' && text.trim()) return text.trim();
        if (Array.isArray(text) && text.every(entry => typeof entry === 'string') && text.join('').trim()) return text.join('\n').trim();
    }
    return '';
};
const pause = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});
export const executeComfyGraph = async (
    workflow: H3Workflow, signal: AbortSignal, onLive: (live: GraphLive) => void,
    progress: (message: string, value: number) => void,
): Promise<{ promptId: string; outputs: Record<string, unknown> }> => {
    signal.throwIfAborted();
    const base = minimaxComfyURL(), client = `lawiz-graph-${crypto.randomUUID()}`, url = new URL(`${base}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('clientId', client);
    const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    const live: GraphLive = { completedNodes: [], outputs: {} }, done = new Set<string>(), pending: string[] = [];
    let promptId = '', complete = false, owned = false, failure = '', fraction = 0.05;
    const publish = () => { live.completedNodes = [...done]; onLive({ ...live, outputs: { ...live.outputs } }); };
    const handle = (payload: unknown) => {
        if (payload instanceof ArrayBuffer) {
            if (signal.aborted || !owned || !live.node || workflow[live.node]?.class_type !== 'SamplerCustomAdvanced') return;
            const preview = mossPreviewBlob(payload);
            if (preview) { live.preview = preview; publish(); }
            return;
        }
        if (typeof payload !== 'string') return;
        if (!promptId) { pending.push(payload); return; }
        let event: unknown;
        try { event = JSON.parse(payload); }
        catch (cause) { progress(`Invalid ComfyUI live message; monitoring history. ${String(cause)}`, fraction); return; }
        if (!isRecord(event) || !isRecord(event.data)) return;
        const data = event.data;
        if (event.type === 'execution_start' || event.type === 'executing') owned = data.prompt_id === promptId;
        if (data.prompt_id !== promptId) return;
        if (event.type === 'executing') {
            if (live.node) done.add(live.node);
            live.node = data.node == null ? undefined : String(data.node);
            live.step = undefined; live.total = undefined; live.preview = undefined;
            if (!live.node) owned = false;
        }
        if (event.type === 'execution_cached' && Array.isArray(data.nodes)) data.nodes.forEach(id => { if (typeof id === 'string' && workflow[id]) done.add(id); });
        if (event.type === 'executed' && data.node != null) {
            const id = String(data.node); done.add(id); live.outputs[id] = data.output;
        }
        if (event.type === 'progress' && typeof data.value === 'number' && Number.isFinite(data.value)
            && typeof data.max === 'number' && Number.isFinite(data.max) && data.max > 0) {
            live.step = data.value; live.total = data.max;
        }
        if (['execution_error', 'execution_interrupted'].includes(String(event.type))) {
            failure = `ComfyUI ${event.type}: ${String(data.exception_message || data.node_type || 'Execution interrupted')}`;
            owned = false;
        }
        if (event.type === 'execution_success') owned = false;
        fraction = Math.max(fraction, Math.min(0.94, 0.05 + (done.size + (live.total ? (live.step || 0) / live.total : 0)) / Object.keys(workflow).length * 0.89));
        progress(live.node ? `${workflow[live.node]?.class_type || live.node}${live.total ? ` - ${live.step}/${live.total}` : ''}` : 'Finishing workflow...', fraction);
        publish();
    };
    ws.onmessage = event => handle(event.data);
    try {
        await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer); signal.removeEventListener('abort', abort); ws.onopen = null; ws.onerror = null; ws.onclose = null;
                if (error) reject(error); else resolve();
            };
            const abort = () => finish(new DOMException('Generation cancelled.', 'AbortError'));
            const timer = setTimeout(() => finish(new Error('ComfyUI live connection timed out. No job queued.')), 30000);
            ws.onopen = () => finish(); ws.onerror = ws.onclose = () => finish(new Error('Cannot connect to ComfyUI. No job queued.'));
            if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
        ws.onerror = ws.onclose = () => { if (!complete && !signal.aborted) progress('Live preview disconnected; monitoring ComfyUI history...', fraction); };
        signal.throwIfAborted();
        // Do not abort submission: retain the job ID to cancel only this job if Cancel races with /prompt.
        const queued = await jsonRequest(`${base}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: client }) });
        if (!isRecord(queued) || typeof queued.prompt_id !== 'string' || !queued.prompt_id) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(queued).slice(0, 1800)}`);
        promptId = queued.prompt_id; live.promptId = promptId; pending.forEach(handle); pending.length = 0; publish();
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (true) {
            signal.throwIfAborted();
            if (failure) throw new Error(failure);
            const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`, { signal });
            signal.throwIfAborted();
            if (failure) throw new Error(failure);
            const history = isRecord(payload) ? payload[promptId] : undefined;
            if (isRecord(history)) {
                const status = isRecord(history.status) ? history.status : {};
                if (isRecord(history.outputs)) Object.assign(live.outputs, history.outputs);
                publish();
                if (status.status_str === 'error') throw new Error(`ComfyUI failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                if (status.completed) {
                    complete = true; live.node = undefined; live.preview = undefined; publish();
                    return { promptId, outputs: live.outputs };
                }
            }
            if (Date.now() > deadline) throw new Error(`Monitoring timed out for job ${promptId}. Check ComfyUI before retrying.`);
            await pause(signal);
        }
    } catch (cause) {
        let failure = cause;
        if (signal.aborted && promptId && !complete) {
            try {
                const result = await jsonRequest(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST' });
                if (!isRecord(result) || result.cancelled !== true) throw new Error('The server did not confirm targeted cancellation.');
            } catch (error) { failure = new Error(`Cancellation of job ${promptId} could not be confirmed. No global interrupt was sent. ${String(error)}`, { cause }); }
        }
        if (promptId && !complete) {
            try {
                progress('Retrieving completed outputs from the stopped job...', fraction);
                const recoverySignal = AbortSignal.timeout(10000);
                for (let attempt = 0; attempt < 10; attempt++) {
                    const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`, { signal: recoverySignal });
                    const history = isRecord(payload) ? payload[promptId] : undefined;
                    if (isRecord(history)) {
                        if (isRecord(history.outputs)) Object.assign(live.outputs, history.outputs);
                        live.node = undefined; live.preview = undefined; publish();
                        break;
                    }
                    if (attempt === 9) throw new Error('The stopped job has not appeared in ComfyUI history.');
                    await pause(recoverySignal);
                }
            } catch (error) { failure = new Error(`${String(failure)} Output recovery failed; live outputs were retained. ${String(error)}`, { cause: failure }); }
        }
        throw failure;
    } finally { ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); }
};
