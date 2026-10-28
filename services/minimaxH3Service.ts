import type { MinimaxDraft } from './videoPromptService';
import { forceOriginalVideoAudio } from './videoAudioService';
import {
    h3ReferenceControl, isRecord, planH3References, validateMinimaxH3Readiness,
    type H3ObjectInfo, type H3Workflow, type MinimaxH3Options,
} from './minimaxH3Workflow';
import { buildH3RenderWorkflow, type H3RenderWorkflow } from './minimaxH3UltrafastWorkflow';
import { ADVANCED_NODE_SPECS, planAdvancedH3Input } from './minimaxH3AdvancedWorkflow';

export interface H3Preview { url: string; mime: string; step: number; total: number }
export interface H3StageVideo { nodeId: string; label: string; videoUrl: string }
export interface H3ExecutionProgress {
    nodes: Array<{ id: string; label: string; state: 'running' | 'complete' | 'cached' }>;
    totalNodes: number;
    currentNode?: string;
    step?: number;
    totalSteps?: number;
    elapsedSeconds: number;
    nodeSeconds: number;
    lastEventSeconds: number;
    videos: H3StageVideo[];
}
export const h3ExecutionLabel = (id: string, workflow: H3Workflow): string => {
    const labels: Record<string, string> = {
        '153': 'H3 · base sampling', '133': 'H3 · video decode', '134': 'H3 · audio decode',
        'advanced-latent-sample': 'H3 · latent upscale sampling',
        'advanced-source-video': 'Source video · loading frames and soundtrack', 'advanced-source-info': 'Source video · FPS and metadata',
        'advanced-source-align': 'Source video · aligning dimensions', 'advanced-h3-encode': 'H3 latent upscale · encoding input frames',
        'advanced-latent-conditioning': 'H3 latent upscale · conditioning', 'advanced-h3-decode': 'H3 latent upscale · video decode',
        'advanced-ltx-sample': 'LTX Refine · sampling', 'advanced-ltx-decode': `LTX Refine · ${workflow['advanced-ltx-decode']?.class_type === 'VAEDecode' ? 'standard' : 'tiled'} video decode`,
        'advanced-rtx': 'RTX · final upscale', 'ultrafast-rtx': 'RTX · final upscale',
        '119': 'Final video · encoding and saving',
        'advanced-save-first-pass': 'First pass · encoding and saving',
        'advanced-save-latent-upscale': 'Latent upscale · encoding and saving',
        'advanced-save-ltx': 'LTX Refine · encoding and saving',
        'advanced-first-decode': 'First pass · checkpoint video decode',
        'advanced-first-audio': 'First pass · checkpoint audio decode',
    };
    const spec = ADVANCED_NODE_SPECS.find(spec => `advanced-${spec.id}` === id);
    return labels[id] ?? (spec ? `${spec.group === 'ltx' ? 'LTX Refine · ' : ''}${spec.title}` : workflow[id]?.class_type ?? id);
};
export interface H3GenerationResult { videoUrl: string; videoBlob?: Blob; stageVideos?: H3StageVideo[]; promptId: string; workflow: H3Workflow; prompt: string; promptIsFinal: boolean; seed: number; options: MinimaxH3Options }
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
export const loadH3ObjectInfo = async (signal?: AbortSignal, variant: H3RenderWorkflow = 'reference'): Promise<H3ObjectInfo> => {
    const base = minimaxComfyURL();
    const classes = [
        'ResolutionSelector', 'PrimitiveFloat', 'ComfyMathExpression', 'UNETLoader', 'CLIPLoader', 'VAELoader',
        'ModelPreviewOverrideKJ', 'Power Lora Loader (rgthree)', 'MiniMaxH3ReferencePack', 'MiniMaxH3ReferenceToVideo',
        'BasicGuider', 'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'BetaSamplingScheduler',
        'ExtendIntermediateSigmas', 'VAEDecode', 'VAEDecodeAudio', 'VHS_VideoCombine', 'Display Any (rgthree)',
        'LoraLoader', 'LoraLoaderModelOnly',
        ...(variant === 'ultrafast' ? ['LTX_lora_loader', 'ModelAttentionBackend', 'MiniMaxH3SigmaShift',
            'BasicScheduler', 'CreateVideo', 'SaveVideo', 'SpectrumApplyMiniMaxH3', 'RTXVideoSuperResolution'] : []),
        ...(variant === 'advanced' ? ADVANCED_NODE_SPECS.map(spec => spec.classType).concat([
            'MiniMaxH3ImageToVideo', 'LTXVSeparateAVLatent', 'LTXVConcatAVLatent', 'GetImageSize',
            'LTXVConditioning', 'VAEEncode', 'LTXVLatentUpsampler', 'LTXVEmptyLatentAudio',
            'LTXVAudioVAEEncode', 'LTXVAudioVAEDecode', 'ImpactExecutionOrderController', 'VHS_LoadVideo', 'VHS_VideoInfo', 'ImageScale',
        ]) : []),
    ];
    const schemas = await Promise.all([...new Set(classes)].map(async name => {
        const payload = await jsonRequest(`${base}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(payload)) throw new Error(`Invalid ComfyUI schema response for ${name}.`);
        return payload;
    }));
    const info: H3ObjectInfo = {};
    for (const schema of schemas) for (const [name, node] of Object.entries(schema)) {
        if (isRecord(node)) info[name] = node;
    }
    return info;
};
export const parseH3Preview = (type: string, payload: unknown): H3Preview | null => {
    if (type !== 'kj_preview_override' || !isRecord(payload) || String(payload.node_id) !== '141' || typeof payload.image !== 'string' || !payload.image) return null;
    const mime = typeof payload.mime === 'string' ? payload.mime : 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mime)) return null;
    return { url: `data:${mime};base64,${payload.image}`, mime, step: typeof payload.step === 'number' ? payload.step : 0, total: typeof payload.total === 'number' ? payload.total : 0 };
};
export const h3VideoFromHistory = (history: unknown, base: string, nodeId = '119'): string | null => {
    if (!isRecord(history) || !isRecord(history.outputs) || !isRecord(history.outputs[nodeId])) return null;
    const output = history.outputs[nodeId];
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
    onExecution?: (progress: H3ExecutionProgress) => void,
): Promise<H3GenerationResult> => {
    signal.throwIfAborted();
    const base = minimaxComfyURL();
    onProgress('Checking H3 nodes and models...', 0.01);
    const info = await loadH3ObjectInfo(signal, options.variant ?? 'reference');
    const videoFinishing = options.variant === 'advanced' && options.advanced?.inputMode === 'video';
    const plan = options.variant === 'advanced' ? planAdvancedH3Input(draft, options) : planH3References(draft, options);
    const placeholders = Object.fromEntries(plan.references.map(ref => [ref.id, ref.file.name]));
    validateMinimaxH3Readiness(buildH3RenderWorkflow(draft, options, placeholders), info);
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
        if (ref.kind === 'video' && (videoFinishing ? options.advanced?.sourceAudio !== false : h3ReferenceControl(options, ref).useSoundtrack)) {
            const probe = await jsonRequest(`${base}/minimax_refpack/probe?file=${encodeURIComponent(uploads[ref.id])}`, { signal });
            if (!isRecord(probe) || typeof probe.has_audio !== 'boolean') throw new Error('The H3 reference probe did not report soundtrack availability. Disable source soundtrack or update comfyui-minimaxrefpack.');
            if (!probe.has_audio) {
                if (videoFinishing && resolvedOptions.advanced) {
                    resolvedOptions.advanced = { ...resolvedOptions.advanced, sourceAudio: false };
                    onProgress('Source video has no soundtrack; finishing without audio.', 0.14);
                } else resolvedOptions.references[ref.id] = { ...h3ReferenceControl(options, ref), useSoundtrack: false };
            }
        }
    }
    const workflow = buildH3RenderWorkflow(draft, resolvedOptions, uploads);
    const resolvedPlan = options.variant === 'advanced' ? planAdvancedH3Input(draft, resolvedOptions) : planH3References(draft, resolvedOptions);
    validateMinimaxH3Readiness(workflow, info);
    signal.throwIfAborted();
    const rendered = await new Promise<H3GenerationResult>((resolve, reject) => {
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
        const started = Date.now();
        let nodeStarted = started, lastEvent = started;
        let currentNode: string | undefined, step: number | undefined, totalSteps: number | undefined;
        const nodes = new Map<string, H3ExecutionProgress['nodes'][number]>();
        const videos = new Map<string, H3StageVideo>();
        const report = () => onExecution?.({
            nodes: [...nodes.values()].map(node => ({ ...node })), totalNodes: Object.keys(workflow).length,
            currentNode, step, totalSteps, elapsedSeconds: Math.floor((Date.now() - started) / 1000),
            nodeSeconds: Math.floor((Date.now() - nodeStarted) / 1000), lastEventSeconds: Math.floor((Date.now() - lastEvent) / 1000),
            videos: [...videos.values()],
        });
        const captureVideo = (id: string, output: unknown) => {
            if (!id.startsWith('advanced-save-') || workflow[id]?.class_type !== 'VHS_VideoCombine') return;
            const videoUrl = h3VideoFromHistory({ outputs: { [id]: output } }, base, id);
            if (videoUrl) videos.set(id, { nodeId: id, label: h3ExecutionLabel(id, workflow).replace(' · encoding and saving', ''), videoUrl });
        };
        const fraction = () => 0.2 + 0.68 * ([...nodes.values()].filter(node => node.state !== 'running').length
            + (step !== undefined && totalSteps ? Math.min(1, step / totalSteps) : 0)) / Object.keys(workflow).length;
        const activate = (id: string) => {
            if (!workflow[id] || currentNode === id) return;
            if (currentNode) nodes.set(currentNode, { id: currentNode, label: h3ExecutionLabel(currentNode, workflow), state: 'complete' });
            currentNode = id; nodeStarted = Date.now(); step = undefined; totalSteps = undefined;
            nodes.set(id, { id, label: h3ExecutionLabel(id, workflow), state: 'running' });
        };
        const updateSteps = (value: unknown, max: unknown) => {
            if (typeof value !== 'number' || !Number.isFinite(value) || typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return;
            step = Math.max(0, Math.min(value, max)); totalSteps = max;
        };
        const heartbeat = onExecution ? setInterval(report, 1000) : undefined;
        const connectTimer = setTimeout(() => fail(new Error('Timed out connecting to the ComfyUI WebSocket.')), 30000);
        const jobTimer = setTimeout(() => fail(new Error('H3 monitoring timed out after two hours. Check the ComfyUI queue before retrying.')), 2 * 60 * 60 * 1000);
        const cleanup = () => {
            clearTimeout(connectTimer); clearTimeout(jobTimer); clearInterval(poll); clearInterval(heartbeat);
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
                    if (isRecord(history.outputs)) for (const [id, output] of Object.entries(history.outputs)) captureVideo(id, output);
                    report();
                    if (status.status_str === 'error') throw new Error(`H3 execution failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                    const videoUrl = h3VideoFromHistory(history, base);
                    if (videoUrl) {
                        const outputs = isRecord(history.outputs) ? history.outputs : {};
                        const displayed = isRecord(outputs['186']) && Array.isArray(outputs['186'].text) && outputs['186'].text.every(value => typeof value === 'string')
                            ? outputs['186'].text.join('\n').trim() : '';
                        if (currentNode) nodes.set(currentNode, { id: currentNode, label: h3ExecutionLabel(currentNode, workflow), state: 'complete' });
                        currentNode = undefined; report();
                        settled = true; cleanup();
                        onProgress(options.forceOriginalAudio ? 'H3 rendered. Locking the original WAV soundtrack...' : 'H3 video ready.', options.forceOriginalAudio ? 0.9 : 1);
                        resolve({ videoUrl, ...(videos.size ? { stageVideos: [...videos.values()] } : {}), promptId, workflow, prompt: displayed || resolvedPlan.prompt, promptIsFinal: videoFinishing || !!displayed || options.promptProvider === 'none', seed: options.seed, options: resolvedOptions });
                    } else if (status.completed || ending) throw new Error(`H3 finished without a video in ${workflow['119'].class_type} output 119. Check the output format and ComfyUI logs.`);
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
                onProgress('Queueing H3 workflow...', 0.16);
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
                lastEvent = Date.now();
                if (payload.type === 'execution_cached' && Array.isArray(data.nodes)) for (const id of data.nodes) {
                    if (typeof id === 'string' && workflow[id]) nodes.set(id, { id, label: h3ExecutionLabel(id, workflow), state: 'cached' });
                }
                if (payload.type === 'executing' && typeof data.node === 'string') {
                    activate(data.node);
                    onProgress(`Running ${h3ExecutionLabel(data.node, workflow)}...`, fraction());
                }
                if (payload.type === 'progress_state' && isRecord(data.nodes)) for (const [id, state] of Object.entries(data.nodes)) {
                    if (!workflow[id] || !isRecord(state)) continue;
                    if (state.state === 'finished') {
                        if (nodes.get(id)?.state !== 'cached') nodes.set(id, { id, label: h3ExecutionLabel(id, workflow), state: 'complete' });
                        if (currentNode === id) { currentNode = undefined; step = undefined; totalSteps = undefined; }
                    } else if (state.state === 'running') {
                        activate(id); updateSteps(state.value, state.max);
                        onProgress(`${h3ExecutionLabel(id, workflow)}${totalSteps ? `: ${step}/${totalSteps}` : '...'}`, fraction());
                    }
                }
                if (payload.type === 'progress' && typeof data.value === 'number' && Number.isFinite(data.value)
                    && typeof data.max === 'number' && Number.isFinite(data.max) && data.max > 0) {
                    if (typeof data.node === 'string') activate(data.node);
                    updateSteps(data.value, data.max);
                    onProgress(`${currentNode ? h3ExecutionLabel(currentNode, workflow) : 'H3'}: ${step}/${totalSteps}`, fraction());
                }
                if (payload.type === 'executed' && typeof data.node === 'string' && workflow[data.node]) {
                    captureVideo(data.node, data.output);
                    nodes.set(data.node, { id: data.node, label: h3ExecutionLabel(data.node, workflow), state: 'complete' });
                    if (currentNode === data.node) { currentNode = undefined; step = undefined; totalSteps = undefined; }
                }
                report();
                if (payload.type === 'execution_error') fail(new Error(`ComfyUI ${String(data.node_type || '')}: ${String(data.exception_message || JSON.stringify(data))}`));
                if (payload.type === 'execution_interrupted') fail(new DOMException('H3 execution interrupted.', 'AbortError'));
                if (payload.type === 'execution_success' || (payload.type === 'executing' && data.node === null)) { ending = true; void checkHistory(); }
            } catch (cause) { fail(cause); }
        };
        ws.onerror = () => fail(new Error('ComfyUI WebSocket failed. Check ComfyUI and its queue before retrying.'));
        ws.onclose = () => { if (!settled) fail(new Error('ComfyUI WebSocket closed before completion. Check the server queue; the job may still be running.')); };
    });
    if (!resolvedOptions.forceOriginalAudio) return rendered;
    signal.throwIfAborted();
    const audio = resolvedPlan.references.find(ref => ref.id === resolvedOptions.originalAudioId && ref.kind === 'audio');
    if (!audio) throw new Error('The locked soundtrack is missing. No generated-audio fallback was used.');
    const response = await fetch(rendered.videoUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
    if (!response.ok) throw new Error(`Could not download the rendered video for audio locking (${response.status}).`);
    const video = await response.blob();
    onProgress('Replacing all server audio with the selected WAV locally (no GPU/video re-encoding)...', 0.94);
    const videoBlob = await forceOriginalVideoAudio(new File([video], 'h3-render.mp4', { type: 'video/mp4' }), audio.file, resolvedOptions.duration, signal);
    onProgress('H3 video ready. Original WAV soundtrack locked.', 1);
    return { ...rendered, videoBlob };
};
