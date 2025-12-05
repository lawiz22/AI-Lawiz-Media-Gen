import React, { useState, useEffect, useMemo } from 'react';
import { GenerationOptions, LibraryItem } from '../types';
import { ASPECT_RATIO_OPTIONS, MAX_IMAGES, COMFYUI_T2I_WORKFLOWS, COMFYUI_I2I_WORKFLOWS } from '../constants';
import { SaveIcon, LoadIcon, TrashIcon } from './icons';
import { PresetSaveModal } from './PresetSaveModal';
import { ConfirmationModal } from './ConfirmationModal';
import { saveToLibrary, fetchLibrary, deleteLibraryItem } from '../services/libraryService';

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
    const [presets, setPresets] = useState<LibraryItem[]>([]);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');

    // Fetch presets on mount
    const loadPresets = async () => {
        try {
            const allItems = await fetchLibrary();
            const presetItems = allItems.filter(item => item.mediaType === 'preset');
            setPresets(presetItems);
        } catch (error) {
            console.error("Failed to load presets:", error);
        }
    };

    useEffect(() => {
        loadPresets();
    }, []);

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

    // Filter presets based on current model
    const currentModelPrefix = options.provider === 'gemini'
        ? (options.geminiT2IModel || 'Gemini')
        : (options.comfyModelType || 'ComfyUI');

    // Helper to determine if a preset belongs to the current model context
    // We'll check if the preset name starts with the model type (case-insensitive)
    // or if the saved options inside the preset match the current model type.
    const filteredPresets = useMemo(() => {
        return presets.filter(preset => {
            // Check if options are stored in the preset (they should be for 'preset' type)
            // If we saved the whole options object as 'options' property or spread it.
            // Based on saveToLibrary, we usually save specific fields. 
            // For presets, we should probably save the whole options object.
            // Let's assume we save it in the 'options' field of LibraryItem if possible, 
            // or we just rely on naming convention as requested by user.
            // User said: "pre fix with the model name exemple FLUX_Param_ blabla"

            // We can strictly filter by name prefix
            const prefix = currentModelPrefix.toUpperCase();
            return preset.name.toUpperCase().startsWith(prefix);
        });
    }, [presets, currentModelPrefix]);

    const handleSavePreset = async (name: string) => {
        const prefix = currentModelPrefix.toUpperCase();
        const finalName = `${prefix}_Param_${name}`;

        try {
            await saveToLibrary({
                mediaType: 'preset',
                name: finalName,
                media: '', // No media for preset
                thumbnail: '', // No thumbnail
                options: options // Save current options
            });
            await loadPresets(); // Reload presets
        } catch (error) {
            console.error("Failed to save preset:", error);
        }
    };

    const handleLoadPreset = (presetId: string) => {
        const id = parseInt(presetId, 10);
        const preset = presets.find(p => p.id === id);
        if (preset && preset.options) {
            updateOptions(preset.options);
            setSelectedPresetId(presetId);
        } else {
            setSelectedPresetId('');
        }
    };

    const handleDeletePreset = async () => {
        if (!selectedPresetId) return;

        try {
            const id = parseInt(selectedPresetId, 10);
            await deleteLibraryItem(id);
            await loadPresets();
            setSelectedPresetId('');
        } catch (error) {
            console.error("Failed to delete preset:", error);
        }
    };

    const selectedPresetName = useMemo(() => {
        if (!selectedPresetId) return '';
        const id = parseInt(selectedPresetId, 10);
        const preset = presets.find(p => p.id === id);
        return preset ? preset.name.replace(`${currentModelPrefix.toUpperCase()}_Param_`, '') : '';
    }, [selectedPresetId, presets, currentModelPrefix]);

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

                {/* Preset Manager */}
                <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-md border border-border-primary/50">
                    <select
                        value={selectedPresetId}
                        onChange={(e) => handleLoadPreset(e.target.value)}
                        disabled={isDisabled}
                        className="bg-transparent text-xs font-medium focus:outline-none text-text-secondary max-w-[120px]"
                    >
                        <option value="">Load Preset...</option>
                        {filteredPresets.map(preset => (
                            <option key={preset.id} value={preset.id}>{preset.name.replace(`${currentModelPrefix.toUpperCase()}_Param_`, '')}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setIsSaveModalOpen(true)}
                        disabled={isDisabled}
                        className="p-1 hover:bg-bg-secondary rounded text-text-secondary hover:text-accent transition-colors"
                        title="Save Current Parameters as Preset"
                    >
                        <SaveIcon className="w-4 h-4" />
                    </button>
                    {selectedPresetId && (
                        <button
                            onClick={() => setIsDeleteModalOpen(true)}
                            disabled={isDisabled}
                            className="p-1 hover:bg-bg-secondary rounded text-text-secondary hover:text-danger transition-colors"
                            title="Delete Selected Preset"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Right Side: Global Settings */}
            <div className="flex items-center gap-4">
                {/* Megapixel Slider (Z-Image Only) */}
                {options.comfyModelType === 'z-image' && (
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-text-secondary">MP:</label>
                        <input
                            type="range"
                            min="0.1"
                            max="2.0"
                            step="0.1"
                            value={options.megapixel || 1.0}
                            onChange={(e) => updateOptions({ megapixel: parseFloat(e.target.value) })}
                            disabled={isDisabled}
                            className="w-20 accent-accent"
                        />
                        <span className="text-xs text-text-secondary w-8 text-right">{(options.megapixel || 1.0).toFixed(1)}</span>
                    </div>
                )}

                {/* Aspect Ratio */}
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

            <PresetSaveModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onSave={handleSavePreset}
            />

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeletePreset}
                title="Delete Preset"
                message={`Are you sure you want to delete the preset "${selectedPresetName}"? This action cannot be undone.`}
                confirmLabel="Delete"
                isDanger
            />
        </div>
    );
};
