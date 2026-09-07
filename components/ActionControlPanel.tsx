import React from 'react';
import { GenerationOptions } from '../types';
import { ASPECT_RATIO_OPTIONS, FLUX2_RESOLUTION_OPTIONS, KREA2_RESOLUTION_OPTIONS, MAX_IMAGES } from '../constants';
import { GenerateIcon, ResetIcon } from './icons';
import { DEFAULT_GEMINI_IMAGE_MODEL } from '../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL } from '../services/mammouthService';

interface ActionControlPanelProps {
    options: GenerationOptions;
    generationMode: 't2i' | 'i2i';
    onGenerate: () => void;
    onReset: () => void;
    isReady: boolean;
    isDisabled: boolean;
    updateOptions?: (options: Partial<GenerationOptions>) => void;
}

export const ActionControlPanel: React.FC<ActionControlPanelProps> = ({
    options,
    generationMode,
    onGenerate,
    onReset,
    isReady,
    isDisabled,
    updateOptions
}) => {
    const activeModelName = options.provider === 'gemini'
        ? (generationMode === 't2i' ? (options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) : DEFAULT_GEMINI_IMAGE_MODEL)
        : options.provider === 'mammouth'
            ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
            : options.comfyCharacterUnet
                ? `Qwen Edit Multi-Angle (${options.comfyCharacterUnet})`
                : options.comfyModelType === 'krea2-simple'
                    ? 'KREA2 Simple'
                    : options.comfyModelType === 'flux2-simple'
                        ? 'FLUX2 Simple'
                    : (options.comfyModelType || 'sdxl');

    return (
        <div className="flex flex-col gap-4 rounded-2xl bg-bg-secondary p-4 shadow-lg">
            <div className="flex w-full min-w-0 items-center gap-4">
                <span className="min-w-0 max-w-full break-words text-sm font-medium uppercase tracking-wide text-text-secondary">
                    Active Model: <span className="text-accent font-bold">{activeModelName}</span>
                </span>
            </div>
            <div className="flex w-full flex-wrap items-center justify-start gap-4 border-t border-border-primary pt-4">
                {updateOptions && <>
                    {options.provider === 'comfyui' && options.comfyModelType === 'z-image' && (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-text-secondary">MP:</label>
                            <input type="range" min="0.1" max="2" step="0.1" value={options.megapixel || 1} onChange={(event) => updateOptions({ megapixel: Number(event.target.value) })} disabled={isDisabled} className="w-20 accent-accent" />
                            <span className="w-8 text-right text-xs text-text-secondary">{(options.megapixel || 1).toFixed(1)}</span>
                        </div>
                    )}
                    {options.comfyModelType === 'krea2-simple' ? (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-text-secondary">Resolution:</label>
                            <select value={options.comfyKreaResolution || '832x1216'} onChange={(event) => updateOptions({ comfyKreaResolution: event.target.value })} disabled={isDisabled} className="rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-xs focus:border-accent focus:ring-accent">
                                {KREA2_RESOLUTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    ) : options.comfyModelType === 'flux2-simple' ? (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-text-secondary">Resolution:</label>
                            <select value={options.comfyFlux2Resolution || '832x1216'} onChange={(event) => updateOptions({ comfyFlux2Resolution: event.target.value })} disabled={isDisabled} className="rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-xs focus:border-accent focus:ring-accent">
                                {FLUX2_RESOLUTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-text-secondary">Ratio:</label>
                            <select value={options.aspectRatio} onChange={(event) => updateOptions({ aspectRatio: event.target.value })} disabled={isDisabled} className="rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-xs focus:border-accent focus:ring-accent">
                                {ASPECT_RATIO_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-secondary">Count:</label>
                        <input
                            type="number"
                            min={1}
                            max={MAX_IMAGES}
                            value={options.numImages}
                            onChange={(event) => {
                                const count = Math.min(Math.max(1, Number.parseInt(event.target.value, 10) || 1), MAX_IMAGES);
                                updateOptions({ numImages: count, poseSelection: options.poseSelection.slice(0, count) });
                            }}
                            disabled={isDisabled}
                            className="w-12 rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-center text-xs focus:border-accent focus:ring-accent"
                        />
                    </div>
                </>}
                <button
                    onClick={onReset}
                    disabled={isDisabled}
                    className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50 text-sm"
                >
                    <ResetIcon className="w-4 h-4" /> Reset
                </button>
                <button
                    onClick={onGenerate}
                    disabled={!isReady}
                    style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                    className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary text-sm"
                >
                    <GenerateIcon className="w-4 h-4" /> Generate
                </button>
            </div>
        </div>
    );
};
