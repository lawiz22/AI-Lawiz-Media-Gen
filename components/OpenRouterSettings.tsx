import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_OPENROUTER_MODEL, getOpenRouterModels, testOpenRouterConnection, type OpenRouterModel, type OpenRouterSettings as Settings } from '../services/openRouterService';
import { SpinnerIcon } from './icons';

export const OpenRouterSettings: React.FC<{ value: Settings; onChange: (value: Settings) => void }> = ({ value, onChange }) => {
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
    const [message, setMessage] = useState('');
    const [refresh, setRefresh] = useState(0);
    const version = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setCatalogError(null);
        getOpenRouterModels(controller.signal).then(setModels).catch(cause => {
            if (controller.signal.aborted) return;
            console.error('Could not load OpenRouter models:', cause);
            setCatalogError(cause instanceof Error ? cause.message : String(cause));
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [refresh]);

    useEffect(() => {
        version.current++;
        setStatus('idle');
        setMessage('');
        return () => { version.current++; };
    }, [value.apiKey, value.model]);

    const test = async () => {
        const current = version.current;
        setStatus('testing');
        setMessage('');
        const result = await testOpenRouterConnection(value.apiKey, value.model);
        if (current !== version.current) return;
        setStatus(result.success ? 'success' : 'failed');
        setMessage(result.message);
    };
    const selected = models.find(model => model.id === value.model);

    return <div className="space-y-3">
        <h3 className="text-lg font-semibold text-text-primary">OpenRouter API</h3>
        <p className="text-sm text-text-secondary">Available in Prompt tools and Video Prompt Generator. Selected text and media references are sent to OpenRouter and its model provider only when you generate. Video/audio support depends on the selected model.</p>
        <label htmlFor="openrouter-api-key" className="block text-sm font-medium text-text-secondary">OpenRouter API Key</label>
        <div className="flex items-center gap-2">
            <input id="openrouter-api-key" type="password" autoComplete="off" value={value.apiKey} onChange={event => onChange({ ...value, apiKey: event.target.value })} placeholder="sk-or-v1-..." className="block w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" />
            <button type="button" aria-label="Test OpenRouter connection" onClick={test} disabled={status === 'testing' || !value.apiKey.trim()} className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary-hover disabled:opacity-50">
                {status === 'testing' ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : 'Test'}
            </button>
        </div>
        {status !== 'idle' && <p role="status" className={`text-sm ${status === 'failed' ? 'text-danger' : status === 'success' ? 'text-green-400' : 'text-accent'}`}>{message || 'Verifying API key and model...'}</p>}
        <label htmlFor="openrouter-default-model" className="block text-sm font-medium text-text-secondary">Default OpenRouter Model</label>
        <div className="flex items-center gap-2">
            <select id="openrouter-default-model" value={value.model} onChange={event => onChange({ ...value, model: event.target.value })} className="min-w-0 flex-1 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm">
                {!selected && <option value={value.model}>{value.model === DEFAULT_OPENROUTER_MODEL ? 'Grok 4.7' : value.model}{models.length ? ' (not in current catalog)' : ''}</option>}
                {models.map(model => <option key={model.id} value={model.id}>{model.name} [{model.supportsImages ? 'Text + Vision' : 'Text only'}] ({model.id})</option>)}
            </select>
            <button type="button" onClick={() => setRefresh(current => current + 1)} disabled={loading} className="rounded-lg bg-bg-tertiary px-3 py-2 text-sm disabled:opacity-50">{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
        {catalogError && <p role="alert" className="text-sm text-danger">{catalogError}</p>}
        {selected && !selected.supportsImages && <p className="text-xs text-highlight-yellow">This model supports Magic Soup only. Choose Text + Vision for image, background and subject analysis.</p>}
        <p className="text-xs text-text-muted">Default: Grok 4.7 ({DEFAULT_OPENROUTER_MODEL}). Test does not generate tokens or check paid-generation access. Save and Close applies these settings.</p>
    </div>;
};
