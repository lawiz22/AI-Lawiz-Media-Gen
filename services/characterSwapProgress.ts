import { isRecord } from './minimaxH3Workflow';
import type { SwapJob } from './characterSwapService';

export interface SwapProgress {
    node?: string;
    executionNode?: string;
    label: string;
    value?: number;
    max?: number;
    sampling: boolean;
    done: number;
    total: number;
    countsAreLive: boolean;
}
export const initialSwapProgress = (): SwapProgress => ({
    label: 'Waiting for ComfyUI execution updates', sampling: false, done: 0, total: 0, countsAreLive: false,
});
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nodeProgress = (previous: SwapProgress, data: Record<string, unknown>, job: SwapJob): SwapProgress => {
    const id = [data.display_node_id, data.display_node, data.real_node_id, data.node_id, data.node]
        .find(value => typeof value === 'string' && !!job.workflow[value]);
    const node = typeof id === 'string' ? id : typeof data.node === 'string' ? data.node : previous.node;
    const name = node ? job.workflow[node]?.class_type || node : previous.label;
    const sampling = !!name && /Sampler|MMH3UltimateUpscale/.test(name);
    const executionNode = typeof data.node_id === 'string' ? data.node_id : typeof data.node === 'string' ? data.node : previous.executionNode;
    // ComfyUI initializes every node at 0/1 before it has reported any measured work.
    const measured = finite(data.value) && finite(data.max) && data.max > 0 && (data.max !== 1 || data.value > 0);
    const same = node === previous.node && executionNode === previous.executionNode;
    return {
        ...previous, node, executionNode, label: name || 'Executing workflow', sampling,
        value: measured ? Math.max(0, Math.min(Number(data.value), Number(data.max))) : same ? previous.value : undefined,
        max: measured ? Number(data.max) : same ? previous.max : undefined,
    };
};
export const reduceSwapProgress = (
    previous: SwapProgress, type: string, data: unknown, job: SwapJob, runId: string,
): SwapProgress => {
    if (!isRecord(data)) return previous;
    if (type === 'bfs-shotloop-progress' || type === 'bfs-shotloop-next' || type === 'bfs-shotloop-cache') {
        if (!runId || data.run_id !== runId || !finite(data.done) || !finite(data.count) || data.count <= 0) return previous;
        const cached = type === 'bfs-shotloop-cache';
        const done = Math.max(previous.countsAreLive && data.count === previous.total ? previous.done : 0, Math.min(data.done, data.count), 0);
        return {
            ...previous, done, total: data.count, countsAreLive: previous.countsAreLive || !cached,
            ...(!cached && done >= data.count ? { label: 'Assembling final video', value: undefined, max: undefined, sampling: false }
                : !cached && done !== previous.done ? { label: 'Preparing next shot', value: undefined, max: undefined, sampling: false } : {}),
        };
    }
    // A reconnect sends only "executing" on this job's unique client socket.
    if (data.prompt_id !== job.promptId && !(job.state === 'submitting' && typeof data.prompt_id === 'string')
        && !(type === 'executing' && data.prompt_id === undefined)) return previous;
    if (type === 'progress_state' && isRecord(data.nodes)) {
        const running = Object.values(data.nodes).filter(isRecord).reverse().find(node => node.state === 'running');
        return running ? nodeProgress(previous, running, job) : previous;
    }
    if (type === 'executing') {
        if (data.node === null) return { ...previous, label: 'Finishing output files', sampling: false, value: undefined, max: undefined };
        return nodeProgress(previous, data, job);
    }
    if (type === 'progress') return nodeProgress(previous, data, job);
    if (type === 'execution_start') return { ...previous, label: 'Loading models / preparing workflow' };
    return previous;
};

export interface SwapProgressConnection { clientId: string; ready: Promise<void>; close: () => void }
export const connectSwapProgress = (
    job: SwapJob, onEvent: (type: string, data: unknown) => void, onConnection: (connected: boolean) => void,
    onError: (error: Error) => void,
): SwapProgressConnection => {
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let opened = false;
    let resolveReady: () => void;
    let rejectReady: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const timeout = setTimeout(() => {
        if (!opened && !stopped) rejectReady(new Error('Timed out connecting to live ComfyUI render progress.'));
    }, 30000);
    const connect = () => {
        if (stopped) return;
        try {
            const url = new URL(`${job.base}/ws`);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            url.searchParams.set('clientId', job.clientId);
            socket = new WebSocket(url);
        } catch (cause) {
            const error = new Error(`Cannot connect to render progress: ${cause instanceof Error ? cause.message : String(cause)}`);
            onConnection(false); onError(error);
            if (!opened) { clearTimeout(timeout); rejectReady(error); }
            timer = setTimeout(connect, 3000);
            return;
        }
        socket.onopen = () => {
            if (stopped) return;
            opened = true; clearTimeout(timeout); onConnection(true); resolveReady();
        };
        socket.onmessage = event => {
            if (stopped || typeof event.data !== 'string') return;
            try {
                const payload: unknown = JSON.parse(event.data);
                if (isRecord(payload) && typeof payload.type === 'string') onEvent(payload.type, payload.data);
            } catch (cause) { onError(new Error(`Invalid render progress message: ${cause instanceof Error ? cause.message : String(cause)}`)); }
        };
        socket.onclose = () => {
            if (stopped) return;
            onConnection(false);
            timer = setTimeout(connect, 3000);
        };
        socket.onerror = () => {
            if (stopped) return;
            onConnection(false);
            if (!opened) {
                clearTimeout(timeout);
                rejectReady(new Error('Live ComfyUI step progress is unavailable.'));
            }
        };
    };
    connect();
    return {
        clientId: job.clientId, ready,
        close: () => {
            stopped = true; clearTimeout(timeout); clearTimeout(timer); socket?.close();
            if (!opened) rejectReady(new DOMException('Render progress connection closed.', 'AbortError'));
        },
    };
};
