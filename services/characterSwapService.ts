import { openDB, type DBSchema } from 'idb';
import { isRecord, type H3Workflow } from './minimaxH3Workflow';
import type { CharacterSwapSettings } from './characterSwapWorkflow';

export type SwapPlan = Record<string, unknown>;
export interface SwapVideo { filename: string; subfolder: string; type: string }
export interface SwapJob {
    base: string;
    clientId: string;
    promptId?: string;
    state: 'submitting' | 'running' | 'failed' | 'completed' | 'cancelled';
    workflow: H3Workflow;
    plan: SwapPlan;
    signature: string;
    error?: string;
    videos?: SwapVideo[];
    settings?: CharacterSwapSettings;
    submittedAt?: string;
}
export interface SwapResult {
    base: string;
    videos: SwapVideo[];
    plan: SwapPlan;
    sourceRangeVerified?: boolean;
    settings?: CharacterSwapSettings;
    workflow?: H3Workflow;
    promptId?: string;
}
export interface SwapProject {
    version: 1;
    plan: SwapPlan;
    settings: CharacterSwapSettings;
    signatures: Record<string, string>;
    job?: SwapJob;
    result?: SwapResult;
}

interface SwapDatabase extends DBSchema {
    projects: { key: string; value: SwapProject };
}
const database = () => openDB<SwapDatabase>('lawiz-character-swap', 1, {
    upgrade(db) { db.createObjectStore('projects'); },
});
export const loadSwapProject = async (): Promise<SwapProject | undefined> => {
    const db = await database();
    try {
        const value = await db.get('projects', 'current');
        if (value === undefined) return undefined;
        if (!isRecord(value) || value.version !== 1 || !isRecord(value.plan) || !isRecord(value.settings) || !isRecord(value.signatures)) {
            throw new Error('The saved Character Swap project is invalid or from an unsupported version.');
        }
        if (Object.values(value.signatures).some(signature => typeof signature !== 'string')
            || value.job && (!isRecord(value.job) || typeof value.job.base !== 'string' || typeof value.job.clientId !== 'string'
                || !['submitting', 'running', 'failed', 'completed', 'cancelled'].includes(value.job.state)
                || !isRecord(value.job.plan) || !isRecord(value.job.workflow))) {
            throw new Error('The saved Character Swap job is invalid. Its queue ownership cannot be safely recovered.');
        }
        if (value.result && (!isRecord(value.result) || typeof value.result.base !== 'string' || !isRecord(value.result.plan)
            || !Array.isArray(value.result.videos) || value.result.videos.some(video =>
                !isRecord(video) || typeof video.filename !== 'string' || typeof video.subfolder !== 'string' || typeof video.type !== 'string'))) {
            throw new Error('The saved Character Swap result is invalid. The project has not been overwritten.');
        }
        return value;
    } finally { db.close(); }
};
export const saveSwapProject = async (project: SwapProject): Promise<void> => {
    const db = await database();
    try { await db.put('projects', project, 'current'); }
    finally { db.close(); }
};
export const normalizeSwapPlan = (plan: SwapPlan): SwapPlan => ({
    ...plan, run: 'recursive', auto_continue: false, shot_cache: 'output', skip_fill: 'original',
    second_pass: { enabled: false, ...(isRecord(plan.second_pass) ? plan.second_pass : {}) },
});
export const initialSwapPlan = (): SwapPlan => normalizeSwapPlan({
    video: '', fps: 24, grid: 'H3 (17n+5)', mode: 'shots', max_s: 4.6, min_s: 1,
    max_total_s: 0, max_parts: 0, start_s: 0, end_s: 0, start_f: 0, end_f: 0,
    sensitivity: 0.5, generation_size_mode: 'megapixels',
    megapixels: 0.25, multiple: 32, between_shots: 'free', unload_before_join: true,
    shot_storage: 'lossless', bounds: [], segs: [], global_prompt: '', global_ref: '',
    second_pass: { enabled: false, mode: 'scale', scale: 1.25, align: 32 },
});
export const validateSwapPlan = (plan: SwapPlan): void => {
    if (typeof plan.video !== 'string' || !plan.video.trim()) throw new Error('Choose a source video in the planner first.');
    const shots = Array.isArray(plan.segs) ? plan.segs.filter(isRecord) : [];
    const enabled = shots.filter(shot => shot.enabled !== false);
    if (shots.length && !enabled.length) throw new Error('Enable at least one shot before rendering.');
    const hasReference = typeof plan.global_ref === 'string' && !!plan.global_ref.trim()
        || enabled.some(shot => typeof shot.ref === 'string' && !!shot.ref.trim());
    if (!hasReference) throw new Error('Choose a character reference in Prompts & refs or in an enabled shot before rendering.');
};
export const swapVideoURL = (base: string, video: SwapVideo): string =>
    `${base}/view?${new URLSearchParams({ filename: video.filename, subfolder: video.subfolder, type: video.type })}`;

export class SwapHTTPError extends Error {
    constructor(public readonly status: number, path: string, detail: string) {
        super(`ComfyUI ${path}: HTTP ${status}. ${detail}`);
        this.name = 'SwapHTTPError';
    }
}
export const swapRequest = async (base: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const timeout = AbortSignal.timeout(path.includes('/combine') ? 30 * 60 * 1000 : 120000);
    const response = await fetch(`${base}${path}`, {
        ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    });
    if (!response.ok) throw new SwapHTTPError(response.status, path, (await response.text()).slice(0, 1500));
    return response;
};
export const swapJSON = async (base: string, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> => {
    const response = await swapRequest(base, path, body === undefined ? { signal } : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    const payload: unknown = await response.json();
    if (isRecord(payload) && payload.error) throw new Error(`ComfyUI ${path}: ${String(payload.error)}`);
    return payload;
};
export const swapHistoryVideos = (history: unknown): SwapVideo[] => {
    if (!isRecord(history) || !isRecord(history.outputs)) return [];
    const join = history.outputs['1202'];
    if (!isRecord(join)) return [];
    const ui = isRecord(join.ui) ? join.ui : join;
    if (!Array.isArray(ui.images)) return [];
    return ui.images.flatMap((item: unknown): SwapVideo[] => isRecord(item) && typeof item.filename === 'string'
        ? [{ filename: item.filename, subfolder: typeof item.subfolder === 'string' ? item.subfolder : '', type: 'output' }] : []);
};
export const swapHistoryError = (history: unknown): string | undefined => {
    if (!isRecord(history) || !isRecord(history.status)) return undefined;
    if (history.status.status_str === 'error') return `Character Swap paused: ${JSON.stringify(history.status.messages || history.status).slice(0, 2500)}`;
    return undefined;
};
export const isSwapJobActive = (job?: SwapJob): boolean => !!job && ['submitting', 'running'].includes(job.state);

export const queueJobId = (queue: unknown, clientId: string): string | undefined => {
    if (!isRecord(queue)) return undefined;
    for (const list of [queue.queue_running, queue.queue_pending]) {
        if (!Array.isArray(list)) continue;
        for (const row of list) {
            if (Array.isArray(row) && typeof row[1] === 'string' && isRecord(row[3]) && row[3].client_id === clientId) return row[1];
        }
    }
    return undefined;
};

export const recoverSwapJob = async (job: SwapJob): Promise<string | undefined> => {
    const queue = await swapJSON(job.base, '/queue');
    if (!isRecord(queue) || !Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) {
        throw new Error('ComfyUI returned an invalid queue while recovering the submitted job.');
    }
    const queued = queueJobId(queue, job.clientId);
    if (queued) return queued;
    const history = await swapJSON(job.base, '/history?max_items=100');
    if (!isRecord(history)) throw new Error('ComfyUI returned invalid history while recovering the submitted job.');
    for (const [id, record] of Object.entries(history)) {
        if (!isRecord(record) || !Array.isArray(record.prompt)) continue;
        const extra: unknown = record.prompt[3];
        if (isRecord(extra) && extra.client_id === job.clientId) return id;
    }
    return undefined;
};
