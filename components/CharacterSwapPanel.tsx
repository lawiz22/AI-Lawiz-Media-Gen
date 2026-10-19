import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { minimaxComfyURL } from '../services/minimaxH3Service';
import { h3Choices, isRecord, type H3ObjectInfo } from '../services/minimaxH3Workflow';
import { buildCharacterSwapWorkflow, defaultCharacterSwapSettings, validateCharacterSwapWorkflow } from '../services/characterSwapWorkflow';
import { mountCharacterSwapPlanner, type PlannerHandle, type PlannerBridge, type PlannerLibraryTarget } from '../services/characterSwapPlanner';
import { connectSwapProgress, initialSwapProgress, reduceSwapProgress, type SwapProgressConnection } from '../services/characterSwapProgress';
import { buildCharacterSwapLibraryItem, swapLibraryFile, swapResultSnapshot, uploadSwapLibraryFile } from '../services/characterSwapLibrary';
import {
    initialSwapPlan, isSwapJobActive, loadSwapProject, normalizeSwapPlan, recoverSwapJob, saveSwapProject,
    swapHistoryError, swapHistoryVideos, swapJSON, swapRequest, swapVideoURL, validateSwapPlan, SwapHTTPError, type SwapJob, type SwapProject,
} from '../services/characterSwapService';
import { CharacterSwapComparison } from './CharacterSwapComparison';
import { LibraryPickerModal } from './LibraryPickerModal';

const button = 'rounded-lg border border-border-primary px-3 py-2 text-sm hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40';
const input = 'w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm';
const imageLibraryTypes: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'clothes', 'hair', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo', 'logo', 'banner', 'album-cover'];
const message = (cause: unknown): string => cause instanceof Error ? cause.message : String(cause);
const modelInputs: Record<string, [string, string]> = {
    model: ['UNETLoader', 'unet_name'], clip: ['CLIPLoader', 'clip_name'],
    videoVae: ['VAELoader', 'vae_name'], audioVae: ['VAELoader', 'vae_name'], vlmClip: ['CLIPLoader', 'clip_name'],
    characterLora: ['LoraLoaderModelOnly', 'lora_name'], turboLora: ['LoraLoaderModelOnly', 'lora_name'],
    upscaleLora: ['LoraLoaderModelOnly', 'lora_name'], sampler: ['KSamplerSelect', 'sampler_name'],
    attention: ['ModelAttentionBackend', 'attention'],
    upscaleModel: ['MMH3LatentUpscaleWithModelParams', 'model_name'],
    upscaleDevice: ['MMH3LatentUpscaleWithModelParams', 'device'],
    upscalePrecision: ['MMH3LatentUpscaleWithModelParams', 'precision'],
};
const activeGraphSignature = (project: SwapProject): string =>
    JSON.stringify({ settings: project.settings, secondPass: project.plan.second_pass });

export const CharacterSwapPanel: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const [project, setProject] = useState<SwapProject>();
    const current = useRef<SwapProject>();
    const [base, setBase] = useState('');
    const [ready, setReady] = useState(false);
    const [plannerReady, setPlannerReady] = useState(false);
    const [error, setError] = useState('');
    const [storageError, setStorageError] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    const [info, setInfo] = useState<H3ObjectInfo>({});
    const host = useRef<HTMLDivElement>(null);
    const handle = useRef<PlannerHandle>();
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const pendingAction = useRef(false);
    const mounted = useRef(false);
    const pollAction = useRef<() => Promise<void>>(async () => {});
    const renderAction = useRef<() => Promise<void>>(async () => {});
    const runId = useRef('');
    const monitor = useRef<SwapProgressConnection>();
    const [progress, setProgress] = useState(initialSwapProgress);
    const [progressConnected, setProgressConnected] = useState(false);
    const [progressWarning, setProgressWarning] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [libraryTarget, setLibraryTarget] = useState<PlannerLibraryTarget | null>(null);
    const [referenceScope, setReferenceScope] = useState<'global' | 'shot'>('global');
    const [savingOutput, setSavingOutput] = useState('');
    const savingLibrary = useRef(false);
    const [savedOutputs, setSavedOutputs] = useState<Record<string, boolean>>({});

    const persist = (next: SwapProject): Promise<void> => {
        current.current = next;
        setProject(next);
        const saving = saveQueue.current.then(() => saveSwapProject(next));
        saveQueue.current = saving.then(() => { setStorageError(''); }, cause => {
            setStorageError(`Project could not be saved. Do not close the application. ${message(cause)}`);
        });
        return saving;
    };
    const fail = (cause: unknown) => { setError(message(cause)); };
    const ensureMonitor = (job: SwapJob): SwapProgressConnection => {
        if (monitor.current?.clientId === job.clientId) return monitor.current;
        monitor.current?.close();
        setProgress(initialSwapProgress());
        setProgressConnected(false);
        setProgressWarning('');
        monitor.current = connectSwapProgress(job, (type, data) => {
            const latest = current.current?.job;
            if (latest?.clientId === job.clientId && isSwapJobActive(latest)) {
                setProgress(previous => reduceSwapProgress(previous, type, data, latest, runId.current));
            }
        }, connected => {
            setProgressConnected(connected);
            if (connected) setProgressWarning('');
        }, cause => setProgressWarning(message(cause)));
        return monitor.current;
    };
    const active = isSwapJobActive(project?.job);
    useEffect(() => {
        if (active && project?.job) {
            void ensureMonitor(project.job).ready.catch(cause => {
                if (!(cause instanceof DOMException && cause.name === 'AbortError')) setProgressWarning(message(cause));
            });
        } else {
            monitor.current?.close(); monitor.current = undefined;
            setProgressConnected(false);
        }
    }, [active, project?.job?.clientId]);
    useEffect(() => () => {
        monitor.current?.close();
        monitor.current = undefined;
    }, []);
    useEffect(() => {
        if (!active) return;
        const timestamp = Date.parse(project?.job?.submittedAt || '');
        const start = Number.isFinite(timestamp) ? timestamp : Date.now();
        const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [active, project?.job?.clientId]);
    useEffect(() => {
        mounted.current = true;
        let disposed = false;
        void loadSwapProject().then(value => {
            if (disposed) return;
            const next = value || { version: 1 as const, plan: initialSwapPlan(), settings: defaultCharacterSwapSettings(), signatures: {} };
            current.current = next;
            setProject(next);
            setReady(true);
            try { setBase(minimaxComfyURL()); }
            catch (cause) { fail(cause); }
        }).catch(fail);
        return () => { disposed = true; mounted.current = false; };
    }, []);

    useEffect(() => {
        if (!ready || !base || !host.current) return;
        const controller = new AbortController();
        const events = new EventTarget();
        let dispose: (() => void) | undefined;
        let socket: WebSocket | undefined;
        let reconnect: ReturnType<typeof setTimeout> | undefined;
        let stopped = false;
        const bridgeAPI: PlannerBridge['api'] = Object.assign(events, {
            apiURL: (path: string) => `${base}${path}`,
            fetchApi: async (path: string, init: RequestInit = {}) => {
                try {
                    if (path === '/bfs/shotloop/progress' && typeof init.body === 'string') {
                        const body: unknown = JSON.parse(init.body);
                        if (isRecord(body) && body.reset && !window.confirm('Delete all stored shots for this source video? This also affects its cache in ComfyUI.')) {
                            throw new Error('Shot cache reset cancelled; stored shots were kept.');
                        }
                    }
                    const response = await swapRequest(base, path, { ...init, signal: init.signal || controller.signal });
                    if (response.headers.get('content-type')?.includes('json')) {
                        const payload: unknown = await response.clone().json();
                        if (isRecord(payload) && payload.error) throw new Error(String(payload.error));
                        if (path === '/bfs/shotloop/progress' && isRecord(payload) && typeof payload.run_id === 'string'
                            && (!isSwapJobActive(current.current?.job) || current.current?.job?.base === base)) runId.current = payload.run_id;
                        if (path === '/bfs/shotloop/combine' && isRecord(payload) && typeof payload.filename === 'string') {
                            const p = current.current;
                            if (p) await persist({ ...p, result: {
                                base, plan: structuredClone(p.plan), sourceRangeVerified: false, videos: [{
                                    filename: payload.filename, subfolder: typeof payload.subfolder === 'string' ? payload.subfolder : '', type: 'output',
                                }],
                            } });
                            setStatus('Stored shots assembled on the last executed BFS timeline. No generation was submitted.');
                        }
                    }
                    return response;
                } catch (cause) {
                    if (!controller.signal.aborted) fail(cause);
                    throw cause;
                }
            },
        });
        const connect = () => {
            if (stopped) return;
            const url = new URL(`${base}/ws`);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            url.searchParams.set('clientId', `lawiz-planner-${crypto.randomUUID()}`);
            socket = new WebSocket(url);
            socket.onmessage = event => {
                if (typeof event.data !== 'string') return;
                try {
                    const payload: unknown = JSON.parse(event.data);
                    if (isRecord(payload) && typeof payload.type === 'string' && payload.type.startsWith('bfs-shotloop-')) {
                        if (isRecord(payload.data) && typeof payload.data.run_id === 'string' && payload.data.run_id !== runId.current) return;
                        events.dispatchEvent(new CustomEvent(payload.type, { detail: payload.data }));
                    }
                } catch (cause) { fail(new Error(`Invalid BFS progress event: ${message(cause)}`)); }
            };
            socket.onclose = () => {
                if (stopped) return;
                setStatus('Planner connection interrupted; reconnecting. Submitted renders remain on ComfyUI.');
                reconnect = setTimeout(connect, 3000);
            };
            socket.onerror = () => { if (!stopped) setStatus('Planner WebSocket unavailable; render history will still be checked.'); };
        };
        connect();
        setPlannerReady(false);
        void mountCharacterSwapPlanner(host.current, base, {
            getPlan: () => JSON.stringify(current.current?.plan || initialSwapPlan()),
            setPlan: raw => {
                const p = current.current;
                if (!p) return;
                const parsed: unknown = JSON.parse(raw);
                if (!isRecord(parsed)) { fail(new Error('The planner returned an invalid project.')); return; }
                const normalized = normalizeSwapPlan(parsed);
                void persist({ ...p, plan: normalized }).catch(fail);
                if (parsed.run !== normalized.run || parsed.shot_cache !== normalized.shot_cache || parsed.skip_fill !== normalized.skip_fill) {
                    setTimeout(() => handle.current?.reload(), 0);
                    setStatus('Character Swap uses persistent storage, sequential rendering and original footage for skipped shots.');
                }
            },
            expose: value => { handle.current = value; },
        }, { api: bridgeAPI, queue: () => renderAction.current() }, controller.signal).then(cleanup => {
            if (stopped) cleanup();
            else { dispose = cleanup; setPlannerReady(true); }
        }).catch(cause => { if (!controller.signal.aborted) fail(cause); });
        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(reconnect);
            socket?.close();
            dispose?.();
            handle.current = undefined;
        };
    }, [ready, base, retry]);

    const checkWorkflow = async (p: SwapProject): Promise<void> => {
        const workflow = buildCharacterSwapWorkflow(normalizeSwapPlan(p.plan), p.settings);
        const schemas = await Promise.all([...new Set(Object.values(workflow).map(node => node.class_type))].map(async name => {
            const schema = await swapJSON(base, `/object_info/${encodeURIComponent(name)}`);
            if (!isRecord(schema)) throw new Error(`Invalid schema for ${name}.`);
            return schema;
        }));
        const merged: H3ObjectInfo = {};
        for (const schema of schemas) for (const [name, value] of Object.entries(schema)) {
            if (isRecord(value)) merged[name] = value;
        }
        setInfo(merged);
        validateCharacterSwapWorkflow(workflow, merged);
    };

    const poll = async (): Promise<void> => {
        const p = current.current, job = p?.job;
        if (!p || !isSwapJobActive(job) || !job || pendingAction.current) return;
        pendingAction.current = true;
        try {
            if (!job.promptId) {
                const id = await recoverSwapJob(job);
                if (!id) {
                    setStatus('Submission could not be confirmed. Check the ComfyUI queue, then use Reconcile. No duplicate render has been submitted.');
                    return;
                }
                await persist({ ...current.current!, job: { ...job, promptId: id, state: 'running' } });
                return;
            }
            const payload = await swapJSON(job.base, `/history/${encodeURIComponent(job.promptId)}`);
            const history: unknown = isRecord(payload) ? payload[job.promptId] : undefined;
            if (isRecord(history)) {
                const errorText = swapHistoryError(history);
                const videos = swapHistoryVideos(history);
                if (errorText) {
                    await persist({ ...current.current!, job: { ...job, state: 'failed', error: errorText } });
                    setError(errorText);
                    setStatus('Paused. Stored shots are safe: resume, redo an individual shot, or combine them in Run.');
                    handle.current?.reload();
                } else if (isRecord(history.status) && history.status.completed) {
                    if (!videos.length) throw new Error('The render completed without BFS Shot Join video files. Check the ComfyUI outputs before resuming.');
                    await persist({ ...current.current!, job: { ...job, state: 'completed', videos }, result: {
                        base: job.base, videos, plan: job.plan, sourceRangeVerified: true,
                        workflow: job.workflow, settings: job.settings, promptId: job.promptId,
                    } });
                    setStatus(`Completed. Result saved on ComfyUI.${videos.length > 1 ? ' Comparison export ready.' : ''}`);
                    handle.current?.reload();
                }
            } else {
                const queue = await swapJSON(job.base, '/queue');
                const lists = isRecord(queue) ? [queue.queue_running, queue.queue_pending] : [];
                const found = lists.some(list => Array.isArray(list) && list.some(row => Array.isArray(row) && row[1] === job.promptId));
                if (!found) {
                    setStatus('This job is no longer in the queue or history (server restarted or history cleared). Reconcile its stored shots before resuming.');
                } else {
                    const running = isRecord(queue) && Array.isArray(queue.queue_running)
                        && queue.queue_running.some(row => Array.isArray(row) && row[1] === job.promptId);
                    setStatus(`${running ? 'Rendering sequentially' : 'Queued, waiting for ComfyUI'} · ${job.promptId}. Shots are saved individually on ComfyUI.`);
                    if (running) {
                        const cache = await swapJSON(job.base, '/bfs/shotloop/progress', { plan: job.plan });
                        if (!isRecord(cache) || typeof cache.run_id !== 'string') throw new Error('BFS returned invalid shot progress.');
                        const id = cache.run_id;
                        runId.current = id;
                        setProgress(previous => reduceSwapProgress(previous, 'bfs-shotloop-cache', cache, job, id));
                    }
                }
            }
        } catch (cause) { fail(new Error(`Monitoring interrupted; the server job may still be running. ${message(cause)}`)); }
        finally { pendingAction.current = false; }
    };
    pollAction.current = poll;
    useEffect(() => {
        if (!ready) return;
        void pollAction.current();
        const timer = setInterval(() => { if (mounted.current) void pollAction.current(); }, 4000);
        return () => clearInterval(timer);
    }, [ready]);

    const render = async (): Promise<void> => {
        const p = current.current;
        if (!p || pendingAction.current || isSwapJobActive(p.job) || storageError) return;
        pendingAction.current = true;
        setBusy(true); setError('');
        try {
            validateSwapPlan(p.plan);
            if (!window.confirm('Render the enabled shots sequentially? Models and masks run locally on your ComfyUI server.')) return;
            setStatus('Checking installed nodes, models and settings…');
            await checkWorkflow(p);
            const plan = normalizeSwapPlan(p.plan);
            const signature = activeGraphSignature(p);
            const source = String(plan.video);
            const cache = await swapJSON(base, '/bfs/shotloop/progress', { plan });
            if (!isRecord(cache) || !Array.isArray(cache.ok)) throw new Error('BFS returned invalid shot-cache status. Nothing was submitted.');
            if (cache.ok.some(Boolean)) {
                if (!p.signatures[source] && !window.confirm('This video has stored BFS shots from outside this workspace. Their model and sampling settings cannot be verified. Reuse them as-is? Cancel to stop; use Redo all in Run if you want to regenerate them.')) return;
                if (p.signatures[source] && p.signatures[source] !== signature) {
                    await swapJSON(base, '/bfs/shotloop/redo', { plan, shots: cache.ok.map((_item: unknown, i: number) => i), cascade: true });
                }
            }
            const job: SwapJob = {
                base, clientId: `lawiz-swap-${crypto.randomUUID()}`, state: 'submitting',
                plan: structuredClone(plan), workflow: buildCharacterSwapWorkflow(plan, p.settings), signature,
                settings: structuredClone(p.settings), submittedAt: new Date().toISOString(),
            };
            if (typeof cache.run_id === 'string') runId.current = cache.run_id;
            setStatus('Connecting live render progress…');
            await ensureMonitor(job).ready.catch(cause => {
                if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
                setProgressWarning(`${message(cause)} Rendering will use history / stored-shot monitoring while reconnecting.`);
            });
            await persist({ ...p, plan, job, signatures: { ...p.signatures, [source]: signature } });
            setStatus('Submitting render…');
            const response = await swapJSON(base, '/prompt', {
                prompt: job.workflow, client_id: job.clientId, extra_data: { client_id: job.clientId },
            });
            if (!isRecord(response) || typeof response.prompt_id !== 'string') {
                throw new Error(`ComfyUI did not confirm submission: ${JSON.stringify(response).slice(0, 2000)}`);
            }
            await persist({ ...current.current!, job: { ...job, promptId: response.prompt_id, state: 'running' } });
            setStatus(`Rendering · ${response.prompt_id}`);
        } catch (cause) {
            const latest = current.current;
            if (!isSwapJobActive(latest?.job)) { monitor.current?.close(); monitor.current = undefined; }
            if (cause instanceof SwapHTTPError && latest?.job?.state === 'submitting') {
                await persist({ ...latest, job: { ...latest.job, state: 'failed', error: message(cause) } }).catch(fail);
            }
            fail(cause);
        }
        finally { pendingAction.current = false; setBusy(false); }
    };
    renderAction.current = render;
    const reconcile = async () => {
        const p = current.current;
        if (!p?.job || pendingAction.current) return;
        await poll();
        const latest = current.current;
        if (!latest?.job || !isSwapJobActive(latest.job)) return;
        const queue = await swapJSON(latest.job.base, '/queue');
        if (!isRecord(queue) || !Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) throw new Error('Invalid ComfyUI queue; cannot safely release the job.');
        const active = [...queue.queue_running, ...queue.queue_pending].some(row => Array.isArray(row) &&
            (row[1] === latest.job?.promptId || (isRecord(row[3]) && row[3].client_id === latest.job?.clientId)));
        if (active) { setStatus('The render is still queued or running. No duplicate was submitted.'); return; }
        if (window.confirm('This job is absent from the current queue. Mark it paused so you can resume from stored shots?')) {
            await persist({ ...latest, job: { ...latest.job, state: 'failed', error: 'Job absent from server queue; stored shots retained.' } });
            handle.current?.reload();
            setStatus('Project paused. Render / resume will reuse the stored shots that are still valid.');
        }
    };
    const cancel = async () => {
        const p = current.current, job = p?.job;
        if (!p || !job?.promptId || pendingAction.current) return;
        pendingAction.current = true; setBusy(true);
        try {
            const result = await swapJSON(job.base, `/api/jobs/${encodeURIComponent(job.promptId)}/cancel`, {});
            if (!isRecord(result) || result.cancelled !== true) throw new Error('The server did not confirm targeted cancellation. Cancel this job in ComfyUI; no global interrupt was sent.');
            await persist({ ...p, job: { ...job, state: 'cancelled' } });
            setStatus('Stopped. Stored shots remain available for resume or partial assembly.');
            handle.current?.reload();
        } catch (cause) { fail(cause); }
        finally { pendingAction.current = false; setBusy(false); }
    };
    const importLibraryMedia = async (item: LibraryItem): Promise<void> => {
        const target = libraryTarget;
        if (!target || !handle.current || !current.current || pendingAction.current || isSwapJobActive(current.current.job)) {
            throw new Error('The planner is not ready to import media. Wait for the current operation to finish.');
        }
        pendingAction.current = true; setBusy(true); setError('');
        try {
            const kind = target.kind === 'video' ? 'video' : 'image';
            setStatus(`Reading ${kind} from Library…`);
            const file = await swapLibraryFile(item, kind);
            const name = await uploadSwapLibraryFile(base, file, fraction => setStatus(`Uploading Library ${kind} to ComfyUI: ${Math.round(fraction * 100)}%`));
            if (!handle.current || !current.current) throw new Error('The planner disconnected during import. Reconnect before selecting the Library item again.');
            handle.current.importMedia(target, name);
            await persist(current.current);
            setLibraryTarget(null);
            setStatus(target.kind === 'video' ? 'Library video imported. Set the range and split shots in the native planner.'
                : `Library reference imported into ${target.shot === 'global' ? 'global defaults' : `shot ${target.shot + 1}`} (${target.field === 'ref' ? 'reference 1' : 'reference 2'}).`);
        } catch (cause) { fail(cause); throw cause; }
        finally { pendingAction.current = false; setBusy(false); }
    };
    const pickReference = (field: 'ref' | 'ref2') => {
        const shot = referenceScope === 'global' ? 'global' : handle.current?.selectedShot();
        if (shot === null || shot === undefined) { fail(new Error('Select a shot in the planner timeline before importing a shot reference.')); return; }
        setLibraryTarget({ kind: 'reference', shot, field });
    };
    const saveOutput = async (index: number): Promise<void> => {
        if (!current.current || savingLibrary.current) return;
        savingLibrary.current = true; setError('');
        try {
            const result = swapResultSnapshot(current.current);
            const key = swapVideoURL(result.base, result.videos[index]);
            setSavingOutput(key);
            const { item, warning } = await buildCharacterSwapLibraryItem(result, index);
            await dispatch(addToLibrary(item)).unwrap();
            setSavedOutputs(previous => ({ ...previous, [key]: true }));
            setStatus(`Saved ${index === 1 ? 'comparison' : 'result'} to Library with its original video file.${warning ? ` ${warning}` : ''}`);
        } catch (cause) { fail(cause); }
        finally { savingLibrary.current = false; setSavingOutput(''); }
    };

    return <div className="space-y-4">
        <section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary p-4">
            <div><h2 className="text-xl font-bold">Character Swap H3</h2>
                <p className="text-sm text-text-secondary">Independent BFS Shot Planner · sequential low-VRAM rendering · persistent shot cache</p></div>
            <p className="text-xs text-text-secondary">The native memory gauge compares with previous runs on this GPU; it is not a VRAM guarantee or a model-specific calibration. Cache folders belong to the source video and are shared with its BFS runs in ComfyUI.</p>
            {project && isRecord(project.plan.second_pass) && project.plan.second_pass.enabled === true && <p className="text-sm text-amber-300">
                Second pass enabled: upscale and extra sampling require more memory. The native memory gauge does not certify this additional pass.
            </p>}
            {(error || project?.job?.error) && <p role="alert" className="whitespace-pre-wrap text-sm text-red-300">{error || project?.job?.error}</p>}
            {storageError && <p role="alert" className="text-sm text-red-300">{storageError} <button className={button} onClick={() => { if (current.current) void persist(current.current).catch(fail); }}>Retry saving</button></p>}
            <p role="status" className="text-sm text-text-secondary">{status || (!ready ? 'Loading saved project…' : plannerReady ? 'Project saved locally. Second pass is off by default.' : 'Loading your installed BFS planner…')}</p>
            {active && <section aria-label="Character Swap render progress" className="space-y-2 rounded-lg border border-accent/40 bg-bg-primary p-3">
                {progressWarning && <p role="alert" className="text-sm text-amber-300">{progressWarning}</p>}
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-medium text-accent">{progress.label}</span>
                    <span className="tabular-nums text-text-secondary">{Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
                </div>
                <progress aria-label="Current render operation" className="h-3 w-full accent-accent"
                    value={progressConnected && progress.max ? progress.value : undefined} max={progress.max || 1} />
                <p className="text-sm tabular-nums" aria-live="polite">
                    {progressConnected && progress.max && progress.value !== undefined
                        ? `${progress.sampling ? 'Sampling step' : 'Operation'} ${progress.value} / ${progress.max} · ${Math.floor(progress.value / progress.max * 100)}%${progress.sampling ? ' of current pass' : ''}`
                        : progressConnected ? 'Live monitoring · loading, processing or waiting for the next measured step…'
                            : 'Live progress disconnected; reconnecting. Server history and saved shots are still monitored.'}
                </p>
                {progress.total > 0 && <>
                    <progress aria-label="Shots saved" className="h-2 w-full accent-accent" value={progress.done} max={progress.total} />
                    <p className="text-xs text-text-secondary">{progress.countsAreLive ? 'Shots saved' : 'Stored shots (last executed BFS timeline)'}: {progress.done} / {progress.total} · {Math.floor(progress.done / progress.total * 100)}% of shots.
                        {!progress.countsAreLive ? ' Waiting for live shot completion updates.'
                            : progress.done >= progress.total ? ' Finishing assembly; the final video is not ready yet.' : ` Current / next shot: ${progress.done + 1}.`}
                    </p>
                </>}
                <p className="text-xs text-text-secondary">Step progress is per operation, not an estimated percentage of the entire render. Decoding and final assembly can take time after sampling finishes.</p>
            </section>}
            <div className="flex flex-wrap gap-2">
                <button className={`${button} border-accent text-accent`} disabled={!plannerReady || busy || active || !!storageError} onClick={() => { void render(); }}>Render / resume shots</button>
                <button className={button} disabled={!ready || busy || active} onClick={() => {
                    if (!current.current) return;
                    setBusy(true); setError('');
                    void checkWorkflow(current.current).then(() => setStatus('Workflow checked: active nodes, models and options are available. No render submitted.'))
                        .catch(fail).finally(() => setBusy(false));
                }}>Check workflow / refresh models</button>
                <button className={button} disabled={!ready || busy} onClick={() => { void reconcile().catch(fail); }}>Reconcile server job</button>
                <button className={button} disabled={!active || !project?.job?.promptId || busy} onClick={() => { void cancel(); }}>Stop this render</button>
                <button className={button} disabled={busy || active} onClick={() => {
                    try { setError(''); setBase(minimaxComfyURL()); setRetry(value => value + 1); }
                    catch (cause) { fail(cause); }
                }}>Reconnect planner</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border-primary pt-3">
                <span className="text-sm font-medium">Import from Library</span>
                <button className={button} disabled={!plannerReady || busy || active} onClick={() => setLibraryTarget({ kind: 'video' })}>Source video</button>
                <select aria-label="Library reference destination" className="rounded-lg border border-border-primary bg-bg-primary p-2 text-sm"
                    disabled={!plannerReady || busy || active} value={referenceScope} onChange={event => setReferenceScope(event.target.value === 'shot' ? 'shot' : 'global')}>
                    <option value="global">Global references</option><option value="shot">Selected shot references</option>
                </select>
                <button className={button} disabled={!plannerReady || busy || active} onClick={() => pickReference('ref')}>Reference photo 1</button>
                <button className={button} disabled={!plannerReady || busy || active} onClick={() => pickReference('ref2')}>Reference photo 2</button>
            </div>
            <details>
                <summary className="cursor-pointer text-sm font-medium">Character Swap workflow settings</summary>
                <fieldset disabled={busy || active} className="mt-3 grid gap-3 md:grid-cols-3">
                    {project && Object.entries(project.settings).filter(([key]) => key !== 'secondPass'
                        && (isRecord(project.plan.second_pass) && project.plan.second_pass.enabled === true || !/^(secondPass|upscale)/.test(key))).map(([key, value]) => {
                        const schema = modelInputs[key];
                        const choices = schema ? h3Choices(info, schema[0], schema[1]) : [];
                        return <label key={key} className="min-w-0 space-y-1 text-xs text-text-secondary">{key.replace(/([A-Z])/g, ' $1')}
                            {typeof value === 'boolean' ? <input className="ml-2" type="checkbox" checked={value} onChange={event => {
                                if (current.current) void persist({ ...current.current, settings: { ...current.current.settings, [key]: event.target.checked } }).catch(fail);
                            }} /> : <>
                                <input className={input} type={typeof value === 'number' ? 'number' : 'text'} step="any" list={choices.length ? `swap-${key}` : undefined} value={String(value)} onChange={event => {
                                    const next = typeof value === 'number' ? Number(event.target.value) : event.target.value;
                                    if (current.current) void persist({ ...current.current, settings: { ...current.current.settings, [key]: next } }).catch(fail);
                                }} />
                                {choices.length > 0 && <datalist id={`swap-${key}`}>{choices.map(choice => <option key={choice} value={choice} />)}</datalist>}
                            </>}
                        </label>;
                    })}
                </fieldset>
            </details>
        </section>
        <fieldset disabled={busy || active} inert={busy || active} className="min-w-0">
            <div className="overflow-x-auto rounded-xl border border-border-primary">
                <div ref={host} className="character-swap-planner relative" style={{ minWidth: 900, height: 1050 }} />
            </div>
        </fieldset>
        {project?.result && <div className="space-y-3">
            <CharacterSwapComparison {...project.result} />
            <div className="flex flex-wrap gap-2">
                {project.result.videos.slice(0, 2).map((video, index) => {
                    const key = swapVideoURL(project.result!.base, video);
                    return <button key={key} className={button} disabled={!!savingOutput || savedOutputs[key]}
                        onClick={() => { void saveOutput(index); }}>
                        {savingOutput === key ? 'Saving video…' : savedOutputs[key] ? 'Saved to Library' : `Save ${index === 1 ? 'comparison' : 'result'} to Library`}
                    </button>;
                })}
            </div>
            <p className="text-xs text-text-secondary">Library saves a copy of the original video, not a link to ComfyUI. Existing downloads remain available above.</p>
        </div>}
        {libraryTarget && <LibraryPickerModal isOpen onClose={() => { if (!busy) setLibraryTarget(null); }}
            filter={libraryTarget.kind === 'video' ? 'video' : imageLibraryTypes} onSelectItem={importLibraryMedia} />}
    </div>;
};
