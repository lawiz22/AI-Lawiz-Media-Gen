import React, { useEffect, useState } from 'react';
import type { GenerationOptions, Provider } from '../types';
import { DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODELS, getApiKey, getGeminiImageSizes, getGeminiModels, supportsGeminiThinkingLevel } from '../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../services/mammouthService';
import { SpinnerIcon } from './icons';
import { Select } from './ui/Select';

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
                    <Select variant="search" ariaLabel="Gemini image model" value={options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL} options={geminiModels} disabled={disabled}
                        onChange={model => {
                            const sizes = getGeminiImageSizes(model);
                            updateOptions({
                                geminiT2IModel: model,
                                geminiImageSize: sizes.includes(options.geminiImageSize) ? options.geminiImageSize : '1K',
                            });
                        }} />
                    <Select ariaLabel="Gemini image size" value={options.geminiImageSize || '1K'} options={getGeminiImageSizes(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL)} disabled={disabled}
                        onChange={size => updateOptions({ geminiImageSize: size as GenerationOptions['geminiImageSize'] })} />
                    {supportsGeminiThinkingLevel(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) && <Select ariaLabel="Gemini thinking level" value={options.geminiThinkingLevel || 'minimal'} disabled={disabled}
                        options={[{ value: 'minimal', label: 'Minimal thinking' }, { value: 'high', label: 'High thinking' }]}
                        onChange={level => updateOptions({ geminiThinkingLevel: level as GenerationOptions['geminiThinkingLevel'] })} />}
                    {!getApiKey() && <p className="text-xs text-danger sm:col-span-3">Configure Gemini in Connection Settings.</p>}
                </div>
            )}
            {activeProvider === 'mammouth' && (
                <div className="relative flex-1 min-w-[240px]">
                    <Select variant="search" ariaLabel="Mammouth image model" value={options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} options={models} disabled={disabled || loading}
                        onChange={model => updateOptions({ mammouthImageModel: model })} />
                    {loading && <SpinnerIcon className="absolute right-8 top-2.5 w-4 h-4 animate-spin text-text-muted" />}
                </div>
            )}
            {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
    );
};
