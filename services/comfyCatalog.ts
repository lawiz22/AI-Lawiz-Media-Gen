export interface ComfyNodeSchema {
    input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> };
    [key: string]: unknown;
}
export type ComfyCatalog = Record<string, ComfyNodeSchema>;
export interface ComfyCatalogRequest {
    /** Accept cached data up to this age. Defaults to any age. */
    maxAgeMs?: number;
    /** Ask the server again, unless a request is already in flight. */
    force?: boolean;
    /** Cancels this caller's wait only, never the request shared with other callers. */
    signal?: AbortSignal;
}

interface Timed<T> { value: T; at: number }
interface ServerCache {
    full?: Timed<ComfyCatalog> & { signature: string };
    fullRequest?: Promise<ComfyCatalog>;
    nodes: Map<string, Timed<ComfyNodeSchema | undefined>>;
    nodeRequests: Map<string, Promise<ComfyNodeSchema | undefined>>;
}

const servers = new Map<string, ServerCache>();
const listeners = new Set<(base: string) => void>();
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const serverCache = (base: string): ServerCache => {
    let cache = servers.get(base);
    if (!cache) { cache = { nodes: new Map(), nodeRequests: new Map() }; servers.set(base, cache); }
    return cache;
};
const isFresh = (entry: Timed<unknown> | undefined, maxAgeMs: number): boolean => !!entry && Date.now() - entry.at <= maxAgeMs;
const signatureOf = (text: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
    return `${text.length}:${hash >>> 0}`;
};
const waitFor = <T>(request: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) return request;
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        request.then(value => { signal.removeEventListener('abort', abort); resolve(value); },
            error => { signal.removeEventListener('abort', abort); reject(error); });
    });
};
// ComfyUI may answer with a text/plain content type, so the body is parsed explicitly.
const readJson = async (url: string): Promise<{ text: string; payload: unknown }> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Failed to fetch ComfyUI object info (HTTP ${response.status}).`);
    const text = await response.text();
    return { text, payload: JSON.parse(text) };
};

/** Complete node catalog of one ComfyUI server. Concurrent callers share a single request. */
export const loadComfyCatalog = (base: string, { maxAgeMs = Infinity, force = false, signal }: ComfyCatalogRequest = {}): Promise<ComfyCatalog> => {
    const cache = serverCache(base);
    if (!force && !cache.fullRequest && isFresh(cache.full, maxAgeMs)) return waitFor(Promise.resolve(cache.full!.value), signal);
    if (!cache.fullRequest) {
        const request: Promise<ComfyCatalog> = readJson(`${base}/object_info`).then(({ text, payload }) => {
            if (!isRecord(payload)) throw new Error('ComfyUI returned an invalid node catalog.');
            const signature = signatureOf(text);
            const unchanged = cache.full?.signature === signature;
            // An unchanged catalog keeps its identity so that lists derived from it are not rebuilt.
            cache.full = { value: unchanged ? cache.full!.value : payload as ComfyCatalog, signature, at: Date.now() };
            cache.nodes.clear();
            if (!unchanged) listeners.forEach(listener => listener(base));
            return cache.full.value;
        }).finally(() => { if (cache.fullRequest === request) cache.fullRequest = undefined; });
        cache.fullRequest = request;
    }
    return waitFor(cache.fullRequest, signal);
};

/** Schemas of the named nodes only. Uninstalled nodes are absent from the result. */
export const loadComfyNodes = async (base: string, names: readonly string[], { maxAgeMs = Infinity, force = false, signal }: ComfyCatalogRequest = {}): Promise<ComfyCatalog> => {
    const cache = serverCache(base);
    const unique = [...new Set(names)];
    const schemas = await waitFor(Promise.all(unique.map(name => {
        if (!force) {
            const single = cache.nodes.get(name);
            const newest = single && (!cache.full || single.at >= cache.full.at) ? single
                : cache.full ? { value: cache.full.value[name], at: cache.full.at } : undefined;
            if (isFresh(newest, maxAgeMs)) return newest!.value;
        }
        let request = cache.nodeRequests.get(name);
        if (!request) {
            const started: Promise<ComfyNodeSchema | undefined> = readJson(`${base}/object_info/${encodeURIComponent(name)}`).then(({ payload }) => {
                if (!isRecord(payload)) throw new Error(`Invalid ComfyUI schema response for ${name}.`);
                const schema = isRecord(payload[name]) ? payload[name] as ComfyNodeSchema : undefined;
                cache.nodes.set(name, { value: schema, at: Date.now() });
                return schema;
            }).finally(() => { if (cache.nodeRequests.get(name) === started) cache.nodeRequests.delete(name); });
            cache.nodeRequests.set(name, started);
            request = started;
        }
        return request;
    })), signal);
    const catalog: ComfyCatalog = {};
    unique.forEach((name, index) => { const schema = schemas[index]; if (schema) catalog[name] = schema; });
    return catalog;
};

/** Forget one server's catalog, or every catalog when no server is given. */
export const invalidateComfyCatalog = (base?: string): void => {
    if (base === undefined) servers.clear();
    else servers.delete(base);
};
export const cachedComfyCatalog = (base: string): ComfyCatalog | undefined => servers.get(base)?.full?.value;
/** Notified with the server URL whenever its complete catalog actually changes. */
export const subscribeComfyCatalog = (listener: (base: string) => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const comfyInput = (catalog: unknown, node: string, input: string): unknown => {
    const schema = isRecord(catalog) ? catalog[node] : undefined;
    const inputs = isRecord(schema) && isRecord(schema.input) ? schema.input : undefined;
    if (!inputs) return undefined;
    return (isRecord(inputs.required) ? inputs.required[input] : undefined) ?? (isRecord(inputs.optional) ? inputs.optional[input] : undefined);
};
/** Choices of one widget, for both ComfyUI encodings: [[...]] and ['COMBO', { options: [...] }]. */
export const comfyWidgetChoices = (widget: unknown): string[] => {
    if (!Array.isArray(widget)) return [];
    const values: unknown = Array.isArray(widget[0]) ? widget[0] : isRecord(widget[1]) ? widget[1].options : undefined;
    if (!Array.isArray(values)) return [];
    return values.flatMap(value => typeof value === 'string' ? [value] : isRecord(value) && typeof value.key === 'string' ? [value.key] : []);
};
export const comfyChoices = (catalog: unknown, node: string, input: string): string[] => comfyWidgetChoices(comfyInput(catalog, node, input));
