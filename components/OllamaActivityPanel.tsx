import React from 'react';
import type { OllamaActivity } from '../services/ollamaService';
import { CloseIcon, SpinnerIcon } from './icons';

interface OllamaActivityPanelProps {
    activity: OllamaActivity;
    model: string;
    onClose: () => void;
    onStop: () => void;
}

export const OllamaActivityPanel: React.FC<OllamaActivityPanelProps> = ({ activity, model, onClose, onStop }) => {
    const phaseLabels = {
        loading: 'Loading model',
        thinking: 'Thinking',
        responding: 'Writing response',
        complete: 'Complete',
        cancelled: 'Stopped',
        failed: 'Failed',
    };
    const isActive = activity.phase === 'loading' || activity.phase === 'thinking' || activity.phase === 'responding';

    return (
        <div className="overflow-hidden rounded-md border border-emerald-400/40 bg-bg-primary shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border-primary bg-emerald-500/10 px-3 py-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                        {isActive && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                        Ollama · {phaseLabels[activity.phase]}
                    </div>
                    <p className="truncate text-xs text-text-muted" title={model}>{model}</p>
                </div>
                <div className="flex items-center gap-2">
                    {isActive && <button type="button" onClick={onStop} className="rounded border border-red-400/50 bg-red-500/10 px-2 py-1 text-xs font-bold text-red-300 hover:bg-red-500/20">Stop</button>}
                    <button type="button" onClick={onClose} className="rounded p-1 text-text-secondary hover:bg-bg-tertiary-hover" aria-label="Close Ollama activity"><CloseIcon className="h-4 w-4" /></button>
                </div>
            </div>
            <div className="grid max-h-56 grid-cols-1 gap-3 overflow-y-auto p-3 md:grid-cols-2">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-muted">Thinking</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">{activity.thinking || (activity.phase === 'loading' ? 'Preparing request and loading model...' : 'This model is not exposing its reasoning.')}</pre>
                </div>
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-muted">Live output</p>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-accent">{activity.response || 'Waiting for response...'}</pre>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-primary px-3 py-2 text-xs text-text-muted">
                <span>Input tokens: {activity.promptTokens ?? 'pending'}</span>
                <span>Output tokens: {activity.responseTokens ?? 'pending'}</span>
                <span>Speed: {activity.tokensPerSecond ? `${activity.tokensPerSecond.toFixed(1)} tok/s` : 'pending'}</span>
            </div>
        </div>
    );
};