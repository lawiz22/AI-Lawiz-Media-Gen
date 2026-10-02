import React, { useEffect, useState } from 'react';
import type { GenerationOptions, Provider } from '../types';
import { DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODELS, getApiKey, getGeminiImageSizes, getGeminiModels, supportsGeminiThinkingLevel } from '../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../services/mammouthService';
import { SpinnerIcon } from './icons';

interface CloudImageProviderBarProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    extractorProvider?: 'flux2' | 'gemini' | 'mammouth';
    onExtractorProviderChange?: (provider: 'flux2' | 'gemini' | 'mammouth') => void;
    disabled?: boolean;
    action?: React.ReactNode;
}

export const CloudImageProviderBar: React.FC<CloudImageProviderBarProps> = ({ options, updateOptions, extractorProvider, onExtractorProviderChange, disabled, action }) => {
    const [models, setModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
    const [geminiModels, setGeminiModels] = useState<string[]>([...GEMINI_IMAGE_MODELS]);
    const [loading, setLoading] = useState(false);
    const activeProvider = extractorProvider || options.provider;

    useEffect(() => {
        if (activeProvider !== 'gemini') return;
        getGeminiModels().then(result => setGeminiModels(Array.from(new Set([
            options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL,
            ...result,
            ...GEMINI_IMAGE_MODELS,
        ]))));
    }, [activeProvider]);

    useEffect(() => {
        if (activeProvider !== 'mammouth') return;
        setLoading(true);
        getMammouthImageModels()
            .then(result => setModels(result.length > 0 ? result : [...MAMMOUTH_IMAGE_MODELS].sort()))
            .finally(() => setLoading(false));
    }, [activeProvider]);

    const selectProvider = (provider: Provider) => updateOptions({ provider });

    return (
        <div className="bg-bg-secondary border border-border-primary p-3 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-text-secondary">{extractorProvider ? 'Image generation' : 'Image provider'}</span>
            <div className="bg-bg-tertiary p-1 rounded-lg flex gap-1">
                {extractorProvider && <button
                    onClick={() => onExtractorProviderChange?.('flux2')}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md ${extractorProvider === 'flux2' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}
                >
                    Flux2
                </button>}
                {extractorProvider && <button
                    onClick={() => onExtractorProviderChange?.('gemini')}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md ${extractorProvider === 'gemini' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}
                >
                    Gemini
                </button>}
                <button
                    onClick={() => extractorProvider ? onExtractorProviderChange?.('mammouth') : selectProvider('mammouth')}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md ${activeProvider === 'mammouth' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}
                >
                    Mammouth
                </button>
            </div>
            {extractorProvider && activeProvider === 'gemini' && (
                <div className="grid min-w-[240px] flex-1 gap-2 sm:grid-cols-3">
                    <select
                        value={options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL}
                        onChange={event => {
                            const model = event.target.value;
                            const sizes = getGeminiImageSizes(model);
                            updateOptions({
                                geminiT2IModel: model,
                                geminiImageSize: sizes.includes(options.geminiImageSize) ? options.geminiImageSize : '1K',
                            });
                        }}
                        disabled={disabled}
                        className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm"
                        aria-label="Gemini image model"
                    >
                        {geminiModels.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                    <select value={options.geminiImageSize || '1K'} onChange={event => updateOptions({ geminiImageSize: event.target.value as GenerationOptions['geminiImageSize'] })} disabled={disabled} className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" aria-label="Gemini image size">
                        {getGeminiImageSizes(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL).map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                    {supportsGeminiThinkingLevel(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) && <select value={options.geminiThinkingLevel || 'minimal'} onChange={event => updateOptions({ geminiThinkingLevel: event.target.value as GenerationOptions['geminiThinkingLevel'] })} disabled={disabled} className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" aria-label="Gemini thinking level">
                        <option value="minimal">Minimal thinking</option>
                        <option value="high">High thinking</option>
                    </select>}
                    {!getApiKey() && <p className="text-xs text-danger sm:col-span-3">Configure Gemini in Connection Settings.</p>}
                </div>
            )}
            {activeProvider === 'mammouth' && (
                <div className="relative flex-1 min-w-[240px]">
                    <select
                        value={options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL}
                        onChange={event => updateOptions({ mammouthImageModel: event.target.value })}
                        disabled={disabled || loading}
                        className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 pr-8 text-sm"
                        aria-label="Mammouth image model"
                    >
                        {models.map(model => <option key={model} value={model}>{model}</option>)}
                    </select>
                    {loading && <SpinnerIcon className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-text-muted" />}
                </div>
            )}
            {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
    );
};
