export const COMFY_MEMORY_ACTIONS = [
    {
        id: 'unload-models',
        label: 'Clear VRAM',
        accessibleLabel: 'Clear VRAM / unload models',
        description: "Unload ComfyUI's loaded models and release unused GPU allocations. Keeps the node execution cache. Other applications' VRAM is not affected.",
        payload: { unload_models: true },
    },
    {
        id: 'free-caches',
        label: 'Free model + node cache',
        accessibleLabel: 'Free model and node cache',
        description: 'Unload models and clear cached node execution results. The next run may reload/recompute them. Does not delete model files, outputs or Library media.',
        payload: { unload_models: true, free_memory: true },
    },
] as const;

export type ComfyMemoryAction = typeof COMFY_MEMORY_ACTIONS[number]['id'];

export const requestComfyMemoryRelease = async (action: ComfyMemoryAction, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    const command = COMFY_MEMORY_ACTIONS.find(item => item.id === action);
    if (!command) throw new Error('Unknown ComfyUI memory action.');
    const configured = localStorage.getItem('comfyui_url')?.trim();
    if (!configured) throw new Error('Configure your ComfyUI URL in Connection Settings before freeing memory.');
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
        throw new Error('Use an HTTP(S) ComfyUI base URL without query parameters, fragments or embedded credentials.');
    }
    const response = await fetch(`${url.href.replace(/\/+$/, '')}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command.payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    const text = await response.text();
    if (response.status !== 200) throw new Error(`ComfyUI memory request failed (HTTP ${response.status}). ${text.slice(0, 600)}`.trim());
    if (text.trim()) throw new Error('ComfyUI returned an unexpected response instead of the native /free acknowledgement. Check the server URL and reverse proxy.');
};
