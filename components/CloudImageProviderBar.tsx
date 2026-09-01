import React, { useEffect, useState } from 'react';
import type { GenerationOptions, Provider } from '../types';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../services/mammouthService';
import { SpinnerIcon } from './icons';

interface CloudImageProviderBarProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    disabled?: boolean;
}

export const CloudImageProviderBar: React.FC<CloudImageProviderBarProps> = ({ options, updateOptions, disabled }) => {
    const [models, setModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (options.provider !== 'mammouth') return;
        setLoading(true);
        getMammouthImageModels()
            .then(result => setModels(result.length > 0 ? result : [...MAMMOUTH_IMAGE_MODELS].sort()))
            .finally(() => setLoading(false));
    }, [options.provider]);

    const selectProvider = (provider: Provider) => updateOptions({ provider });

    return (
        <div className="bg-bg-secondary border border-border-primary p-3 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-text-secondary">Image provider</span>
            <div className="bg-bg-tertiary p-1 rounded-lg flex gap-1">
                <button
                    onClick={() => selectProvider('mammouth')}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md ${options.provider === 'mammouth' ? 'bg-accent text-accent-text' : 'hover:bg-bg-secondary'}`}
                >
                    Mammouth
                </button>
            </div>
            {options.provider === 'mammouth' && (
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
        </div>
    );
};
