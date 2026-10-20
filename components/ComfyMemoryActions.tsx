import React, { useEffect, useRef, useState } from 'react';
import { COMFY_MEMORY_ACTIONS, requestComfyMemoryRelease, type ComfyMemoryAction } from '../services/comfyMemoryService';
import { CloseIcon, CubeIcon, SpinnerIcon, TrashIcon } from './icons';

export const ComfyMemoryActions: React.FC = () => {
    const [pending, setPending] = useState<ComfyMemoryAction | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);

    const release = async (action: ComfyMemoryAction) => {
        if (controller.current) return;
        const abort = new AbortController();
        controller.current = abort;
        setPending(action); setNotice(''); setError('');
        try {
            await requestComfyMemoryRelease(action, abort.signal);
            if (!abort.signal.aborted) setNotice(`${action === 'unload-models' ? 'Model unload' : 'Model and node-cache cleanup'} request accepted. ComfyUI applies it between jobs; a running render is not interrupted.`);
        } catch (cause) {
            if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (controller.current === abort) { controller.current = null; setPending(null); }
        }
    };

    return <div className="relative" role="group" aria-label="ComfyUI memory controls" aria-busy={pending !== null}>
        <div className="flex items-center justify-end gap-1">
            {COMFY_MEMORY_ACTIONS.map(action => <button key={action.id} type="button" aria-label={action.accessibleLabel} title={`${action.accessibleLabel}\n${action.description}`}
                disabled={pending !== null} onClick={() => void release(action.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-40">
                <span aria-hidden="true">
                    {pending === action.id ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : action.id === 'unload-models' ? <CubeIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                </span>
            </button>)}
        </div>
        {(notice || error) && <div className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg border border-border-primary bg-bg-secondary p-3 shadow-lg">
            <p role={error ? 'alert' : 'status'} className={`min-w-0 flex-1 break-words text-xs leading-relaxed ${error ? 'text-danger' : 'text-text-secondary'}`}>{error || notice}</p>
            <button type="button" aria-label="Dismiss memory notification" title="Dismiss" onClick={() => { setNotice(''); setError(''); }}
                className="shrink-0 rounded text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <CloseIcon className="h-4 w-4" aria-hidden="true" />
            </button>
        </div>}
    </div>;
};
