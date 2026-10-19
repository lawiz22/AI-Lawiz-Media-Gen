import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { generateImagePrompt, IMAGE_PROMPT_FORMATS, type ImagePromptFormat, type ImagePromptProvider } from '../services/imagePromptService';
import { getApiKey } from '../services/geminiService';
import { getMammouthApiKey } from '../services/mammouthService';
import { getOpenRouterModels, getOpenRouterSettings } from '../services/openRouterService';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, testOllamaConnection } from '../services/ollamaService';
import { CloseIcon, CopyIcon, GenerateIcon, SpinnerIcon } from './icons';

interface ImagePromptModalProps {
    image: File;
    onClose: () => void;
    onUsePrompt?: (prompt: string) => void;
    defaultFormat?: ImagePromptFormat;
}

export const ImagePromptButton: React.FC<Omit<ImagePromptModalProps, 'image' | 'onClose'> & { image?: File | null; disabled?: boolean }> = ({
    image, disabled = false, defaultFormat, onUsePrompt,
}) => {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
    useEffect(() => { setOpen(false); }, [image, disabled]);
    return <>
        <button ref={trigger} type="button" disabled={disabled || !image} onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-3 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50">
            <GenerateIcon className="h-4 w-4" />Generate Prompt from Image
        </button>
        {open && image && createPortal(<ImagePromptModal image={image} defaultFormat={defaultFormat} onClose={close} onUsePrompt={onUsePrompt} />, document.body)}
    </>;
};

export const ImagePromptModal: React.FC<ImagePromptModalProps> = ({ image, onClose, onUsePrompt, defaultFormat = 'moss-image' }) => {
    const id = useId();
    const [defaults] = useState(() => {
        const openrouter = getOpenRouterSettings();
        const provider: ImagePromptProvider = openrouter.apiKey ? 'openrouter' : getApiKey() ? 'gemini' : getMammouthApiKey() ? 'mammouth' : 'ollama';
        return {
            provider,
            models: { openrouter: openrouter.model, gemini: 'gemini-2.5-flash', mammouth: 'gemini-2.5-flash', ollama: localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL },
        };
    });
    const [provider, setProvider] = useState<ImagePromptProvider>(defaults.provider);
    const [format, setFormat] = useState(defaultFormat);
    const [models, setModels] = useState(defaults.models);
    const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL);
    const [choices, setChoices] = useState<Partial<Record<ImagePromptProvider, string[]>>>({});
    const [preview, setPreview] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('');
    const [copied, setCopied] = useState(false);
    const dialog = useRef<HTMLDivElement>(null);
    const firstControl = useRef<HTMLSelectElement>(null);
    const mounted = useRef(true);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; controller.current?.abort(); };
    }, []);
    useEffect(() => {
        const url = URL.createObjectURL(image);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [image]);
    useEffect(() => { firstControl.current?.focus(); }, []);
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
            if (event.key === 'Tab') {
                const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
                if (!controls?.length) return;
                const first = controls[0], last = controls[controls.length - 1];
                if (!Array.from(controls).some(control => control === document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
                else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
        window.addEventListener('keydown', handleKey, true);
        return () => window.removeEventListener('keydown', handleKey, true);
    }, [onClose]);
    const resetResult = () => { setResult(null); setCopied(false); setError(''); setStatus(''); };
    const generate = async () => {
        if (busy) return;
        setBusy(true); resetResult(); setStatus('Analyzing source image...');
        const request = new AbortController();
        controller.current = request;
        try {
            const prompt = await generateImagePrompt({ image, format, provider, model: models[provider], ollamaUrl, signal: request.signal });
            if (mounted.current) { setResult(prompt); setStatus('Prompt ready. Review or edit it before use.'); }
        } catch (failure) {
            if (mounted.current) {
                console.error('Could not generate a prompt from the source image:', failure);
                setError(failure instanceof Error ? failure.message : 'Could not analyze the source image.');
                setStatus('');
            }
        } finally {
            if (mounted.current) setBusy(false);
            if (controller.current === request) controller.current = null;
        }
    };
    const loadModels = async () => {
        setBusy(true); setError(''); setStatus('Loading available models...');
        try {
            let available: string[];
            if (provider === 'openrouter') available = (await getOpenRouterModels()).filter(model => model.supportsImages).map(model => model.id);
            else {
                const connection = await testOllamaConnection(ollamaUrl);
                if (!connection.success) throw new Error(connection.message);
                available = connection.models;
            }
            if (!available.length) throw new Error('No models available. Install a vision model locally or choose another service.');
            if (mounted.current) { setChoices(current => ({ ...current, [provider]: available })); setStatus(`${available.length} models loaded. Choose a vision-capable model.`); }
        } catch (failure) {
            if (mounted.current) { setError(failure instanceof Error ? failure.message : 'Could not load analysis models.'); setStatus(''); }
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const copy = async (prompt: string) => {
        try {
            if (!navigator.clipboard) throw new Error('Clipboard access is unavailable. Select the prompt text and copy it manually.');
            await navigator.clipboard.writeText(prompt);
            if (mounted.current) { setCopied(true); setError(''); }
        } catch (failure) {
            if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not copy the prompt.');
        }
    };
    const usePrompt = (prompt: string) => {
        try { onUsePrompt?.(prompt); onClose(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not apply the prompt.'); }
    };
    const inputClass = 'mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm disabled:opacity-50';
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialog} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border-primary bg-bg-secondary p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id={`${id}-title`} className="text-lg font-bold text-accent">Generate Prompt from Image</h2>
                <button type="button" aria-label="Close image prompt modal" onClick={onClose} className="rounded p-2 text-text-secondary hover:bg-bg-tertiary"><CloseIcon className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="min-w-0">
                    {preview && <img src={preview} alt="Source image for prompt analysis" className="max-h-64 w-full rounded-lg object-contain" />}
                    <p className="mt-2 break-words text-xs text-text-secondary">{image.name}</p>
                </div>
                <div className="min-w-0 space-y-3">
                    <label className="block text-sm text-text-secondary">Prompt format
                        <select ref={firstControl} value={format} disabled={busy} onChange={event => { setFormat(event.target.value as ImagePromptFormat); resetResult(); }} className={inputClass}>
                            {IMAGE_PROMPT_FORMATS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                        </select>
                    </label>
                    <label className="block text-sm text-text-secondary">Analysis service
                        <select value={provider} disabled={busy} onChange={event => { setProvider(event.target.value as ImagePromptProvider); resetResult(); }} className={inputClass}>
                            <option value="openrouter">OpenRouter</option><option value="gemini">Gemini</option><option value="mammouth">Mammouth</option><option value="ollama">Local (Ollama)</option>
                        </select>
                    </label>
                    {provider === 'ollama' && <label className="block text-sm text-text-secondary">Ollama URL
                        <input value={ollamaUrl} disabled={busy} onChange={event => { setOllamaUrl(event.target.value); setChoices(current => ({ ...current, ollama: [] })); resetResult(); }} className={inputClass} />
                    </label>}
                    <label className="block text-sm text-text-secondary">Analysis model
                        <input value={models[provider]} list={`${id}-models`} disabled={busy} onChange={event => { setModels(current => ({ ...current, [provider]: event.target.value })); resetResult(); }} className={inputClass} />
                        <datalist id={`${id}-models`}>{(choices[provider] || []).map(model => <option key={model} value={model} />)}</datalist>
                    </label>
                    {(provider === 'ollama' || provider === 'openrouter') && <button type="button" disabled={busy} onClick={loadModels} className="text-sm text-accent disabled:opacity-50">Load available models</button>}
                    <p className="text-xs text-text-secondary">{provider === 'ollama' ? 'Requires a vision model, such as Qwen VL, Gemma 3 or LLaVA. The image is sent to the Ollama URL above.' : 'Uses your API key from Connection Settings. The image is sent to the selected service when you click Generate; provider charges may apply.'}</p>
                </div>
            </div>
            <button type="button" disabled={busy || !models[provider].trim()} onClick={generate} className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 font-semibold text-bg-primary disabled:opacity-50">
                {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}Generate Prompt
            </button>
            <p role="status" aria-live="polite" className="mt-2 text-sm text-text-secondary">{status}</p>
            {busy && <p className="mt-1 text-xs text-text-secondary">Closing cancels local analysis. Cloud requests may continue at the provider after closing.</p>}
            {error && <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-sm text-danger">{error}</p>}
            {result !== null && <div className="mt-4 space-y-3">
                <label className="block text-sm text-text-secondary">Generated positive prompt
                    <textarea value={result} rows={7} onChange={event => { setResult(event.target.value); setCopied(false); }} className={inputClass} />
                </label>
                <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={!result.trim() || busy} onClick={() => { void copy(result); }} className="inline-flex items-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm disabled:opacity-50"><CopyIcon className="h-4 w-4" />{copied ? 'Copied!' : 'Copy Prompt'}</button>
                    {onUsePrompt && <button type="button" disabled={!result.trim() || busy} onClick={() => usePrompt(result)} className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg-primary disabled:opacity-50">Use as Positive Prompt</button>}
                </div>
                <p className="text-xs text-text-secondary">Only the positive prompt is replaced. Models, negative prompt, seed, sampler, LoRAs, denoise and source image stay unchanged.</p>
            </div>}
        </div>
    </div>;
};
