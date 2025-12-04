import React from 'react';
import { GenerationOptions } from '../types';
import { ASPECT_RATIO_OPTIONS, MAX_IMAGES, COMFYUI_T2I_WORKFLOWS, COMFYUI_I2I_WORKFLOWS } from '../constants';

interface ImageGeneratorHeaderProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    generationMode: 't2i' | 'i2i';
    setGenerationMode: (mode: 't2i' | 'i2i') => void;
    isDisabled: boolean;
    comfyModels: string[];
}

export const ImageGeneratorHeader: React.FC<ImageGeneratorHeaderProps> = ({
    options,
    updateOptions,
    generationMode,
    setGenerationMode,
    isDisabled,
    comfyModels
}) => {
    // Filter models based on the selected workflow type
    const filteredModels = comfyModels.filter(model => {
        const lowerModel = model.toLowerCase();
        if (options.comfyModelType === 'sd1.5' || options.comfyModelType === 'face-detailer-sd1.5') {
            return lowerModel.includes('sd1.5') || lowerModel.includes('sd 1.5');
        }
        if (options.comfyModelType === 'sdxl') {
            return lowerModel.includes('sdxl');
        }
        if (options.comfyModelType === 'flux' || options.comfyModelType === 'nunchaku-flux-image' || options.comfyModelType === 'nunchaku-kontext-flux') {
            return lowerModel.includes('flux');
        }
        return true; // Show all for other types or if no specific filter matches
    });

    return (
        <div className="bg-bg-secondary p-2 rounded-xl shadow-sm border border-border-primary mb-4 flex flex-wrap items-center justify-between gap-4">
            {/* Left Side: Provider & Mode */}
            <div className="flex items-center gap-4">
                {/* Provider Switch */}
                <div className="bg-bg-tertiary p-1 rounded-lg flex gap-1">
                    <button
                        onClick={() => updateOptions({ provider: 'comfyui' })}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${options.provider === 'comfyui'
                            ? 'bg-accent text-accent-text shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                            }`}
                    >
                        ComfyUI
                    </button>
                    <button
                        onClick={() => updateOptions({ provider: 'gemini' })}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${options.provider === 'gemini'
                            ? 'bg-accent text-accent-text shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                            }`}
                    >
                        Gemini
                    </button>
                </div>

                <div className="h-6 w-px bg-border-primary/50"></div>

                {/* Mode Switch */}
                <div className="bg-bg-tertiary p-1 rounded-lg flex gap-1">
                    <button
                        onClick={() => setGenerationMode('t2i')}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${generationMode === 't2i'
                            ? 'bg-accent text-accent-text shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                            }`}
                    >
                        T2I
                    </button>
                    <button
                        onClick={() => setGenerationMode('i2i')}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${generationMode === 'i2i'
                            ? 'bg-accent text-accent-text shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                            }`}
                    >
                        I2I
                    </button>
                </div>

                {/* Workflow Type (ComfyUI Only) */}
                {options.provider === 'comfyui' && (
                    <div className="flex items-center gap-2">
                        <select
                            value={options.comfyModelType || 'sdxl'}
                            onChange={(e) => updateOptions({ comfyModelType: e.target.value })}
                            disabled={isDisabled}
                            className="bg-bg-tertiary border border-border-primary rounded-md px-2 py-1.5 text-xs font-medium focus:ring-accent focus:border-accent max-w-[150px]"
                        >
                            {(generationMode === 'i2i' ? COMFYUI_I2I_WORKFLOWS : COMFYUI_T2I_WORKFLOWS)
                                .filter(opt => opt.value !== 'wan2.2')
                                .map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                        </select>

                        {/* Checkpoint Model (Show for specific workflows) */}
                        {(options.comfyModelType === 'sd1.5' || options.comfyModelType === 'sdxl' || options.comfyModelType === 'flux' || options.comfyModelType === 'face-detailer-sd1.5') && (
                            <select
                                value={options.comfyModel || ''}
                                onChange={(e) => updateOptions({ comfyModel: e.target.value })}
                                disabled={isDisabled}
                                className="bg-bg-tertiary border border-border-primary rounded-md px-2 py-1.5 text-xs font-medium focus:ring-accent focus:border-accent max-w-[200px]"
                            >
                                <option value="">Select Checkpoint</option>
                                {filteredModels.map(model => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        )}
                    </div>
                )}
            </div>

            {/* Right Side: Global Settings */}
            <div className="flex items-center gap-4">
                {/* Aspect Ratio (Only show if not Qwen T2I which has its own) */}
                {!(options.provider === 'comfyui' && options.comfyModelType === 'qwen-t2i-gguf') && (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-secondary">Ratio:</label>
                        <select
                            value={options.aspectRatio}
                            onChange={(e) => updateOptions({ aspectRatio: e.target.value })}
                            disabled={isDisabled}
                            className="bg-bg-tertiary border border-border-primary rounded-md px-2 py-1 text-xs focus:ring-accent focus:border-accent"
                        >
                            {ASPECT_RATIO_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Number of Images */}
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-text-secondary">Count:</label>
                    <input
                        type="number"
                        min={1}
                        max={MAX_IMAGES}
                        value={options.numImages}
                        onChange={(e) => updateOptions({
                            numImages: Math.min(Math.max(1, parseInt(e.target.value) || 1), MAX_IMAGES),
                            poseSelection: options.poseSelection.slice(0, parseInt(e.target.value) || 1)
                        })}
                        disabled={isDisabled}
                        className="w-12 bg-bg-tertiary border border-border-primary rounded-md px-2 py-1 text-xs focus:ring-accent focus:border-accent text-center"
                    />
                </div>
            </div>
        </div>
    );
};
