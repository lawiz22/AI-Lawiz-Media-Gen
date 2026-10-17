import type { MinimaxDraft } from './videoPromptService';
import {
    buildMinimaxH3Workflow, h3ReferenceControl, isRecord, planH3References, validateMinimaxH3Readiness,
    type H3ObjectInfo, type H3Workflow, type MinimaxH3Options,
} from './minimaxH3Workflow';

export interface H3Preview { url: string; mime: string; step: number; total: number }
export interface H3GenerationResult { videoUrl: string; promptId: string; workflow: H3Workflow; prompt: string; promptIsFinal: boolean; seed: number; options: MinimaxH3Options }
export const minimaxComfyURL = (): string => {
    const configured = localStorage.getItem('comfyui_url')?.trim();
    if (!configured) throw new Error('Configure your ComfyUI URL in Connection Settings.');
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ComfyUI requires an HTTP or HTTPS URL.');
    if (url.search || url.hash || url.username || url.password) throw new Error('Use a ComfyUI base URL without query parameters, fragments or embedded credentials.');
    return url.href.replace(/\/+$/, '');
};
const jsonRequest = async (url: string, init: RequestInit = {}): Promise<unknown> => {
    const timeout = AbortSignal.timeout(url.endsWith('/upload/image') ? 120000 : 30000);
    const response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    if (!response.ok) throw new Error(`ComfyUI HTTP ${response.status}: ${(await response.text()).slice(0, 1800)}`);
    return response.json();
};
export const loadH3ObjectInfo = async (signal?: AbortSignal): Promise<H3ObjectInfo> => {
    const base = minimaxComfyURL();
    const classes = [
        'ResolutionSelector', 'PrimitiveFloat', 'ComfyMathExpression', 'UNETLoader', 'CLIPLoader', 'VAELoader',
        'ModelPreviewOverrideKJ', 'Power Lora Loader (rgthree)', 'MiniMaxH3ReferencePack', 'MiniMaxH3ReferenceToVideo',
        'BasicGuider', 'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'BetaSamplingScheduler',
        'ExtendIntermediateSigmas', 'VAEDecode', 'VAEDecodeAudio', 'VHS_VideoCombine', 'Display Any (rgthree)',
        'LoraLoader', 'LoraLoaderModelOnly',
    ];
    const schemas = await Promise.all(classes.map(async name => {
        const payload = await jsonRequest(`${base}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(payload)) throw new Error(`Invalid ComfyUI schema response for ${name}.`);
        return payload;
    }));
    const info: H3ObjectInfo = {};
    for (const schema of schemas) for (const [name, node] of Object.entries(schema)) {
        if (isRecord(node)) info[name] = node;
    }
    if (!info.MiniMaxH3ReferencePack) throw new Error('MiniMaxH3ReferencePack is missing. Install comfyui-minimaxrefpack and update ComfyUI.');
    return info;
};
export const parseH3Preview = (type: string, payload: unknown): H3Preview | null => {
    if (type !== 'kj_preview_override' || !isRecord(payload) || String(payload.node_id) !== '141' || typeof payload.image !== 'string' || !payload.image) return null;
    const mime = typeof payload.mime === 'string' ? payload.mime : 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mime)) return null;
    return { url: `data:${mime};base64,${payload.image}`, mime, step: typeof payload.step === 'number' ? payload.step : 0, total: typeof payload.total === 'number' ? payload.total : 0 };
};
export const h3VideoFromHistory = (history: unknown, base: string): string | null => {
    if (!isRecord(history) || !isRecord(history.outputs) || !isRecord(history.outputs['119'])) return null;
    const output = history.outputs['119'];
    const ui = isRecord(output.ui) ? output.ui : {};
    for (const list of [output.gifs, output.videos, output.images, output.files, ui.videos]) {
        if (!Array.isArray(list)) continue;
        for (const file of list) {
            if (!isRecord(file) || typeof file.filename !== 'string') continue;
            const params = new URLSearchParams({ filename: file.filename, subfolder: typeof file.subfolder === 'string' ? file.subfolder : '', type: typeof file.type === 'string' ? file.type : 'output' });
            return `${base}/view?${params}`;
        }
    }
    return null;
};

export const generateMinimaxH3Video = async (
    draft: MinimaxDraft,
    options: MinimaxH3Options,
    signal: AbortSignal,
    onProgress: (message: string, fraction: number) => void,
    onPreview: (preview: H3Preview) => void,
): Promise<H3GenerationResult> => {
    signal.throwIfAborted();
    const base = minimaxComfyURL();
    onProgress('Checking H3 nodes and models...', 0.01);
    const info = await loadH3ObjectInfo(signal);
    const plan = planH3References(draft, options);
    const placeholders = Object.fromEntries(plan.references.map(ref => [ref.id, ref.file.name]));
    validateMinimaxH3Readiness(buildMinimaxH3Workflow(draft, options, placeholders), info);
    const uploads: Record<string, string> = {};
    const resolvedOptions = { ...options, references: { ...options.references } };
    for (const [index, ref] of plan.references.entries()) {
        signal.throwIfAborted();
        onProgress(`Uploading ${ref.kind} ${ref.slot}...`, 0.03 + index / plan.references.length * 0.12);
        const extension = ref.file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
        const data = new FormData();
        data.append('image', ref.file, `lawiz-h3-${crypto.randomUUID()}${extension}`);
        data.append('type', 'input'); data.append('overwrite', 'false');
        const uploaded = await jsonRequest(`${base}/upload/image`, { method: 'POST', body: data, signal });
        if (!isRecord(uploaded) || typeof uploaded.name !== 'string') throw new Error('ComfyUI returned an invalid media upload response.');
        uploads[ref.id] = `${typeof uploaded.subfolder === 'string' && uploaded.subfolder ? `${uploaded.subfolder}/` : ''}${uploaded.name}`;
        if (ref.kind === 'video' && h3ReferenceControl(options, ref).useSoundtrack) {
            const probe = await jsonRequest(`${base}/minimax_refpack/probe?file=${encodeURIComponent(uploads[ref.id])}`, { signal });
            if (!isRecord(probe) || typeof probe.has_audio !== 'boolean') throw new Error('The H3 reference probe did not report soundtrack availability. Disable source soundtrack or update comfyui-minimaxrefpack.');
            if (!probe.has_audio) resolvedOptions.references[ref.id] = { ...h3ReferenceControl(options, ref), useSoundtrack: false };
        }
    }
    const workflow = buildMinimaxH3Workflow(draft, resolvedOptions, uploads);
    const resolvedPlan = planH3References(draft, resolvedOptions);
    validateMinimaxH3Readiness(workflow, info);
    signal.throwIfAborted();
    return new Promise<H3GenerationResult>((resolve, reject) => {
        const clientId = `lawiz-h3-${crypto.randomUUID()}`;
        const wsURL = new URL(`${base}/ws`);
        wsURL.protocol = wsURL.protocol === 'https:' ? 'wss:' : 'ws:';
        wsURL.searchParams.set('clientId', clientId);
        const ws = new WebSocket(wsURL);
        let promptId = '';
        let settled = false;
        let checking = false;
        let ending = false;
        let submitted = false;
        let poll: ReturnType<typeof setInterval> | undefined;
        const connectTimer = setTimeout(() => fail(new Error('Timed out connecting to the ComfyUI WebSocket.')), 30000);
        const jobTimer = setTimeout(() => fail(new Error('H3 monitoring timed out after two hours. Check the ComfyUI queue before retrying.')), 2 * 60 * 60 * 1000);
        const cleanup = () => {
            clearTimeout(connectTimer); clearTimeout(jobTimer); clearInterval(poll);
            signal.removeEventListener('abort', abort);
            ws.close();
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true; cleanup(); reject(error);
        };
        const cancelOwnedPrompt = async () => {
            if (!promptId) return;
            const response = await jsonRequest(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST' });
            if (!isRecord(response) || typeof response.cancelled !== 'boolean') throw new Error('ComfyUI did not confirm targeted cancellation. Update ComfyUI or cancel this job in its own UI; no global interrupt was sent.');
        };
        const abort = () => {
            if (settled) return;
            // Wait for the queue response if cancellation races with submission.
            if (submitted && !promptId) { onProgress('Waiting for prompt ID to cancel safely...', 0.15); return; }
            void cancelOwnedPrompt().then(() => fail(new DOMException('H3 generation cancelled.', 'AbortError')))
                .catch(cause => fail(new Error(`Cancellation failed; check ComfyUI before retrying. ${cause instanceof Error ? cause.message : String(cause)}`)));
        };
        const checkHistory = async () => {
            if (!promptId || settled || checking) return;
            checking = true;
            try {
                const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`);
                if (settled || signal.aborted) return;
                const history = isRecord(payload) ? payload[promptId] : undefined;
                if (isRecord(history)) {
                    const status = isRecord(history.status) ? history.status : {};
                    if (status.status_str === 'error') throw new Error(`H3 execution failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                    const videoUrl = h3VideoFromHistory(history, base);
                    if (videoUrl) {
                        const outputs = isRecord(history.outputs) ? history.outputs : {};
                        const displayed = isRecord(outputs['186']) && Array.isArray(outputs['186'].text) && outputs['186'].text.every(value => typeof value === 'string')
                            ? outputs['186'].text.join('\n').trim() : '';
                        settled = true; cleanup();
                        onProgress('H3 video ready.', 1);
                        resolve({ videoUrl, promptId, workflow, prompt: displayed || resolvedPlan.prompt, promptIsFinal: !!displayed || options.promptProvider === 'none', seed: options.seed, options: resolvedOptions });
                    } else if (status.completed || ending) throw new Error('H3 finished without a video in VHS_VideoCombine output 119. Check the output format and ComfyUI logs.');
                }
            } catch (cause) { fail(cause); }
            finally { checking = false; }
        };
        signal.addEventListener('abort', abort, { once: true });
        ws.onopen = async () => {
            clearTimeout(connectTimer);
            if (settled) return;
            if (signal.aborted) { abort(); return; }
            try {
                onProgress('Queueing REF2V workflow...', 0.16);
                submitted = true;
                const response = await jsonRequest(`${base}/prompt`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
                });
                if (!isRecord(response) || typeof response.prompt_id !== 'string') throw new Error(`ComfyUI did not return a prompt ID: ${JSON.stringify(response).slice(0, 1800)}`);
                promptId = response.prompt_id;
                if (signal.aborted) { abort(); return; }
                poll = setInterval(() => { void checkHistory(); }, 3000);
                void checkHistory();
            } catch (cause) { fail(cause); }
        };
        ws.onmessage = event => {
            if (typeof event.data !== 'string' || settled) return;
            try {
                const payload: unknown = JSON.parse(event.data);
                if (!isRecord(payload) || typeof payload.type !== 'string' || !isRecord(payload.data)) return;
                const data = payload.data;
                if (payload.type === 'kj_preview_override') {
                    // This extension targets this WebSocket's unique client ID.
                    const preview = parseH3Preview(payload.type, data);
                    if (preview) onPreview(preview);
                    return;
                }
                if (!promptId || data.prompt_id !== promptId) return;
                if (payload.type === 'progress' && typeof data.value === 'number' && typeof data.max === 'number' && data.max > 0) onProgress(`Sampling H3: ${data.value}/${data.max}`, 0.2 + data.value / data.max * 0.65);
                if (payload.type === 'executing' && typeof data.node === 'string') onProgress(`Running ${workflow[data.node]?.class_type || data.node}...`, 0.2);
                if (payload.type === 'execution_error') fail(new Error(`ComfyUI ${String(data.node_type || '')}: ${String(data.exception_message || JSON.stringify(data))}`));
                if (payload.type === 'execution_interrupted') fail(new DOMException('H3 execution interrupted.', 'AbortError'));
                if (payload.type === 'execution_success' || (payload.type === 'executing' && data.node === null)) { ending = true; void checkHistory(); }
            } catch (cause) { fail(cause); }
        };
        ws.onerror = () => fail(new Error('ComfyUI WebSocket failed. Check ComfyUI and its queue before retrying.'));
        ws.onclose = () => { if (!settled) fail(new Error('ComfyUI WebSocket closed before completion. Check the server queue; the job may still be running.')); };
    });
};
