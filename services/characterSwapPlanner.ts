export type PlannerLibraryTarget = { kind: 'video' } | { kind: 'reference'; shot: 'global' | number; field: 'ref' | 'ref2' };
export interface PlannerHandle {
    reload: () => void;
    selectedShot: () => number | null;
    importMedia: (target: PlannerLibraryTarget, name: string) => void;
}
export interface PlannerMount {
    getPlan: () => string;
    setPlan: (value: string) => void;
    expose: (handle: PlannerHandle) => void;
}
export interface PlannerBridge {
    api: EventTarget & {
        apiURL: (path: string) => string;
        fetchApi: (path: string, init?: RequestInit) => Promise<Response>;
    };
    queue: () => Promise<void>;
}
interface PlannerModule {
    mount: (host: HTMLElement, io: PlannerMount) => () => void;
}
declare global {
    interface Window { lawizPlannerBridges?: Record<string, PlannerBridge> }
}

// Load the user's installed GPL planner at runtime; do not bundle or redistribute its source.
export const adaptPlannerModule = (source: string, moduleURL: string, bridgeURL: string): string => {
    const marker = '\napp.registerExtension({';
    const end = source.indexOf(marker);
    if (end < 0 || !source.includes('function Panel(io)') || !source.includes('io.expose(')) {
        throw new Error('Unsupported BFS Shot Planner interface. Update BFSNodes or check its installed version.');
    }
    let adapted = source.slice(0, end)
        .replace(/^import \{ app \} from .*;\r?$/m, `import { app } from ${JSON.stringify(bridgeURL)};`)
        .replace(/^import \{ api \} from .*;\r?$/m, `import { api } from ${JSON.stringify(bridgeURL)};`)
        .replace(/^import \{ wheelToCanvas \} from .*;\r?$/m, '');
    if (!['const setVideo =', 'const setRef =', 'function refreshFiles(', 'const sel ='].every(marker => adapted.includes(marker))) {
        throw new Error('Unsupported BFS Library import interface. Update BFSNodes or check its installed version.');
    }
    adapted = adapted.replace('io.expose({', `io.expose({
        selectedShot: () => segs.value.length ? sel.value : null,
        importMedia: (target, name) => {
            if (target.kind === "video") setVideo(name);
            else {
                if (target.shot !== "global" && (!Number.isInteger(target.shot) || target.shot < 0 || target.shot >= segs.value.length))
                    throw new Error("The selected shot no longer exists. Select it again before importing.");
                setRef(target.shot, target.shot === "global" ? "global_" + target.field : target.field, name);
            }
            refreshFiles();
        },`);
    adapted = adapted.replace(/from (["'])(\.[^"']+)\1/g, (_match, _quote: string, path: string) =>
        `from ${JSON.stringify(new URL(path, moduleURL).href)}`);
    adapted = adapted.replace('new URL("./docs/BFSShotPlanner.md", import.meta.url).href',
        JSON.stringify(new URL('./docs/BFSShotPlanner.md', moduleURL).href));
    return `${adapted}
export function mount(host, io) {
    styles();
    const panel = createApp({ setup: () => Panel(io) });
    panel.mount(host);
    return () => panel.unmount();
}
`;
};

export const mountCharacterSwapPlanner = async (
    host: HTMLElement, base: string, io: PlannerMount, bridge: PlannerBridge, signal: AbortSignal,
): Promise<() => void> => {
    const response = await bridge.api.fetchApi('/extensions', { signal });
    const extensions: unknown = await response.json();
    const path = Array.isArray(extensions) && extensions.find((item: unknown) =>
        typeof item === 'string' && /\/bfs_shot_loop\.js$/.test(item));
    if (typeof path !== 'string') throw new Error('BFS Shot Planner is not installed on this ComfyUI server.');
    const moduleURL = `${base}${path}`;
    const sourceResponse = await bridge.api.fetchApi(path, { signal });
    const source = await sourceResponse.text();
    signal.throwIfAborted();
    const key = `lawizBfs${crypto.randomUUID().replace(/-/g, '')}`;
    const registry = window.lawizPlannerBridges ||= {};
    registry[key] = bridge;
    const urls: string[] = [];
    let unmount: (() => void) | undefined;
    try {
        const bridgeURL = URL.createObjectURL(new Blob([
            `const bridge = window.lawizPlannerBridges[${JSON.stringify(key)}];
export const api = bridge.api;
export const app = { queuePrompt: () => bridge.queue() };`,
        ], { type: 'text/javascript' }));
        urls.push(bridgeURL);
        const url = URL.createObjectURL(new Blob([adaptPlannerModule(source, moduleURL, bridgeURL)], { type: 'text/javascript' }));
        urls.push(url);
        const module: PlannerModule = await import(/* @vite-ignore */ url);
        signal.throwIfAborted();
        unmount = module.mount(host, io);
        return () => {
            unmount?.();
            delete registry[key];
            urls.forEach(value => URL.revokeObjectURL(value));
        };
    } catch (cause) {
        unmount?.();
        delete registry[key];
        urls.forEach(value => URL.revokeObjectURL(value));
        throw cause;
    }
};
