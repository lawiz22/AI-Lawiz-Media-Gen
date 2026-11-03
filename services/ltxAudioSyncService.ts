import { AUDIO_SYNC_TEMPLATE, audioSyncInputPrompt, audioSyncNumber, audioSyncPromptText, buildAudioSyncWorkflow, validateAudioSyncDraft, type AudioSyncDraft, type AudioSyncSettings } from './ltxAudioSyncWorkflow';
import { h3VideoFromHistory, jsonRequest, minimaxComfyURL } from './minimaxH3Service';
import { isRecord, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';

export interface AudioSyncResult {
    videoUrl: string;
    promptId: string;
    prompt: string;
    promptIsFinal: boolean;
    inputPrompt: string;
    settings: AudioSyncSettings;
    workflow: H3Workflow;
}

export const loadAudioSyncObjectInfo = async (signal?: AbortSignal): Promise<H3ObjectInfo> => {
    const base = minimaxComfyURL();
    const classes = new Set([...Object.values(AUDIO_SYNC_TEMPLATE).map(value => value.class_type), 'UnetLoaderGGUF', 'CLIPLoaderGGUF', 'LoraLoaderModelOnly']);
    const schemas = await Promise.all([...classes].map(async name => {
        const response = await jsonRequest(`${base}/object_info/${encodeURIComponent(name)}`, { signal });
        if (!isRecord(response)) throw new Error(`Invalid ComfyUI schema for ${name}.`);
        return response;
    }));
    const info: H3ObjectInfo = {};
    for (const schema of schemas) for (const [name, spec] of Object.entries(schema)) if (isRecord(spec)) info[name] = spec;
    return info;
};

const upload = async (base: string, file: File, signal?: AbortSignal): Promise<string> => {
    const form = new FormData();
    const extension = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    form.append('image', file, `ltx-audio-sync-${crypto.randomUUID()}-${extension}`);
    form.append('type', 'input');
    form.append('overwrite', 'false');
    const response = await jsonRequest(`${base}/upload/image`, { method: 'POST', body: form, signal });
    if (!isRecord(response) || typeof response.name !== 'string' || !response.name) throw new Error(`ComfyUI did not return an uploaded filename for ${file.name}.`);
    return `${typeof response.subfolder === 'string' && response.subfolder ? `${response.subfolder}/` : ''}${response.name}`;
};

export const prepareAudioSyncWorkflow = async (
    draft: AudioSyncDraft, settings: AudioSyncSettings, signal: AbortSignal,
    onProgress: (message: string, fraction: number) => void,
): Promise<H3Workflow> => {
    signal.throwIfAborted();
    validateAudioSyncDraft(draft, settings);
    onProgress('Checking LTX Audio-Sync nodes, models and settings...', 0.01);
    const info = await loadAudioSyncObjectInfo(signal);
    const prompt = audioSyncInputPrompt(draft);
    buildAudioSyncWorkflow(settings, prompt, { image: draft.image?.name, audio: draft.audio!.name }, info);
    const base = minimaxComfyURL();
    onProgress('Uploading first frame and soundtrack...', 0.06);
    const [image, audio] = await Promise.all([
        draft.image ? upload(base, draft.image, signal) : undefined,
        upload(base, draft.audio!, signal),
    ]);
    signal.throwIfAborted();
    return buildAudioSyncWorkflow(settings, prompt, { image, audio }, info);
};

const wait = (signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
});

export const generateAudioSyncVideo = async (
    draft: AudioSyncDraft, settings: AudioSyncSettings, signal: AbortSignal,
    onProgress: (message: string, fraction: number) => void,
): Promise<AudioSyncResult> => {
    const snapshot = structuredClone(settings);
    const inputPrompt = audioSyncInputPrompt(draft);
    const workflow = await prepareAudioSyncWorkflow(draft, snapshot, signal, onProgress);
    const base = minimaxComfyURL(), clientId = `lawiz-ltx-audio-sync-${crypto.randomUUID()}`;
    let promptId = '', completed = false, displayed = '';
    const wsURL = new URL(`${base}/ws`);
    wsURL.protocol = wsURL.protocol === 'https:' ? 'wss:' : 'ws:';
    wsURL.searchParams.set('clientId', clientId);
    const ws = new WebSocket(wsURL);
    let liveStatus = 'Waiting for ComfyUI...';
    let liveFraction = 0.15;
    ws.onmessage = event => {
        if (typeof event.data !== 'string') return;
        try {
            const payload: unknown = JSON.parse(event.data);
            if (!isRecord(payload) || !isRecord(payload.data) || payload.data.prompt_id !== promptId || signal.aborted) return;
            const data = payload.data;
            if (payload.type === 'executing' && typeof data.node === 'string' && workflow[data.node]) {
                const labels: Record<string, string> = { '398:380': 'Qwen prompt enhancement', '398:344': 'First-pass sampling', '398:348': 'Latent 2x upscale', '398:368': 'Second-pass sampling', '398:374': 'Tiled video decode', '398:358': 'Audio decode', '75': 'Saving final video' };
                liveStatus = labels[data.node] || workflow[data.node].class_type;
                liveFraction = data.node === '398:368' ? 0.65 : data.node === '398:374' ? 0.85 : liveFraction;
            }
            if (payload.type === 'progress' && typeof data.value === 'number' && typeof data.max === 'number') {
                onProgress(`${liveStatus} (${data.value}/${data.max})`, liveFraction);
            } else onProgress(liveStatus, liveFraction);
        } catch (cause) {
            onProgress(`Invalid live progress message; monitoring history instead: ${cause instanceof Error ? cause.message : String(cause)}`, liveFraction);
        }
    };
    try {
        await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer); signal.removeEventListener('abort', abort);
                ws.onopen = null; ws.onerror = null;
                if (error) reject(error); else resolve();
            };
            const abort = () => finish(new DOMException('LTX Audio-Sync cancelled.', 'AbortError'));
            const timer = setTimeout(() => finish(new Error('Timed out connecting to ComfyUI. No workflow was queued.')), 30000);
            ws.onopen = () => finish();
            ws.onerror = () => finish(new Error('Could not connect to ComfyUI. No workflow was queued.'));
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
        });
        ws.onerror = () => onProgress('Live progress connection failed; monitoring ComfyUI history...', liveFraction);
        ws.onclose = () => {
            if (promptId && !completed && !signal.aborted) onProgress('Live progress disconnected; monitoring ComfyUI history...', liveFraction);
        };
        signal.throwIfAborted();
        onProgress('Queueing LTX 2.5 Audio-Sync...', 0.15);
        // Do not abort submission: obtain its ID first so cancellation can target only this job.
        const response = await jsonRequest(`${base}/prompt`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        });
        if (!isRecord(response) || typeof response.prompt_id !== 'string' || !response.prompt_id) throw new Error(`ComfyUI did not return a prompt ID: ${JSON.stringify(response).slice(0, 1800)}`);
        promptId = response.prompt_id;
        const deadline = Date.now() + 2 * 60 * 60 * 1000;
        while (true) {
            signal.throwIfAborted();
            const payload = await jsonRequest(`${base}/history/${encodeURIComponent(promptId)}`, { signal });
            const history = isRecord(payload) ? payload[promptId] : undefined;
            if (isRecord(history)) {
                const status = isRecord(history.status) ? history.status : {};
                if (status.status_str === 'error') throw new Error(`LTX Audio-Sync failed: ${JSON.stringify(status.messages ?? status).slice(0, 2000)}`);
                if (isRecord(history.outputs)) displayed = audioSyncPromptText(history.outputs['398:381']) || audioSyncPromptText(history.outputs['398:380']) || displayed;
                const videoUrl = h3VideoFromHistory(history, base, '75');
                if (videoUrl) {
                    completed = true;
                    onProgress('LTX 2.5 Audio-Sync video ready.', 1);
                    return { videoUrl, promptId, inputPrompt, prompt: displayed || inputPrompt, promptIsFinal: !snapshot.enhancePrompt || !!displayed, settings: snapshot, workflow };
                }
                if (status.completed) throw new Error('LTX Audio-Sync completed without a saved video in output 75. Check the ComfyUI logs.');
            }
            if (Date.now() > deadline) throw new Error('Audio-Sync monitoring timed out after two hours. Check the ComfyUI queue before retrying.');
            await wait(signal);
        }
    } catch (cause) {
        if (signal.aborted && promptId && !completed) {
            try {
                const cancelled = await jsonRequest(`${base}/api/jobs/${encodeURIComponent(promptId)}/cancel`, { method: 'POST' });
                if (!isRecord(cancelled) || cancelled.cancelled !== true) throw new Error('The server did not confirm targeted cancellation.');
            } catch (error) {
                throw new Error(`Could not confirm cancellation of Audio-Sync job ${promptId}. Check ComfyUI before retrying. No global interrupt was sent. ${error instanceof Error ? error.message : String(error)}`, { cause });
            }
        }
        throw cause;
    } finally { ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); }
};

export const readAudioSyncDuration = (file: File): Promise<number> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), audio = new Audio();
    const cleanup = () => { clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out reading the audio duration. Try a WAV file.')); }, 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error('The audio has no finite duration. Try a WAV file.'));
        else resolve(duration);
    };
    audio.onerror = () => { cleanup(); reject(new Error('Could not read the audio duration. Choose a browser-supported audio file such as WAV.')); };
    audio.src = url;
});
