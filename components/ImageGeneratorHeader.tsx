import React, { useState, useEffect, useMemo } from 'react';
import { ComfyModelType, GenerationOptions, LibraryItem } from '../types';
import { SaveIcon, LoadIcon, TrashIcon, WorkflowIcon } from './icons';
import { PresetSaveModal } from './PresetSaveModal';
import { ConfirmationModal } from './ConfirmationModal';
import { saveToLibrary, fetchLibrary, deleteLibraryItem } from '../services/libraryService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL } from '../services/mammouthService';

type GenerationMode = 't2i' | 'i2i';
type ModelFamilyId = 'sd15' | 'sdxl' | 'flux' | 'qwen' | 'z-image' | 'flux2' | 'krea2';

interface ModelFamily {
    id: ModelFamilyId;
    label: string;
    workflows: Partial<Record<GenerationMode, ComfyModelType>>;
}

const MODEL_FAMILIES: ModelFamily[] = [
    { id: 'sd15', label: 'SD 1.5', workflows: { t2i: 'sd1.5', i2i: 'face-detailer-sd1.5' } },
    { id: 'sdxl', label: 'SDXL', workflows: { t2i: 'sdxl' } },
    { id: 'flux', label: 'FLUX', workflows: { t2i: 'flux' } },
    { id: 'qwen', label: 'QWEN', workflows: { t2i: 'qwen-t2i-gguf', i2i: 'qwen-edit' } },
    { id: 'z-image', label: 'Z-Image', workflows: { t2i: 'z-image' } },
    { id: 'flux2', label: 'FLUX2', workflows: { t2i: 'flux2-simple' } },
    { id: 'krea2', label: 'KREA2', workflows: { t2i: 'krea2-simple' } },
];

interface ImageGeneratorHeaderProps {
    options: GenerationOptions;
    updateOptions: (options: Partial<GenerationOptions>) => void;
    switchComfyModel: (modelType: ComfyModelType) => void;
    generationMode: GenerationMode;
    setGenerationMode: (mode: GenerationMode) => void;
    onExportWorkflow: () => void;
    isDisabled: boolean;
}

export const ImageGeneratorHeader: React.FC<ImageGeneratorHeaderProps> = ({
    options,
    updateOptions,
    switchComfyModel,
    generationMode,
    setGenerationMode,
    onExportWorkflow,
    isDisabled
}) => {
    const [presets, setPresets] = useState<LibraryItem[]>([]);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    const activeModelFamily = MODEL_FAMILIES.find(family =>
        Object.values(family.workflows).includes(options.comfyModelType as ComfyModelType)
        || (family.id === 'krea2' && options.comfyModelType === 'krea2-raw')
    ) || MODEL_FAMILIES[1];
    const availableGenerationModes = (['t2i', 'i2i'] as const).filter(mode => activeModelFamily.workflows[mode]);

    const selectModelFamily = (family: ModelFamily) => {
        const nextMode = family.workflows[generationMode] ? generationMode : 't2i';
        const workflow = family.workflows[nextMode];
        if (!workflow) return;
        setGenerationMode(nextMode);
        switchComfyModel(workflow);
    };

    const selectGenerationMode = (mode: GenerationMode) => {
        const workflow = activeModelFamily.workflows[mode];
        if (!workflow) return;
        setGenerationMode(mode);
        switchComfyModel(workflow);
    };

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

    // Filter presets based on current model
    const currentModelPrefix = options.provider === 'gemini'
        ? (options.geminiT2IModel || 'Gemini')
        : options.provider === 'mammouth'
            ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
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
            {/* Left Side: Provider & ComfyUI Workflow */}
            <div className="flex min-w-0 flex-wrap items-center gap-4">
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
                        onClick={() => updateOptions({ provider: 'mammouth' })}
                        disabled={isDisabled}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${options.provider === 'mammouth'
                            ? 'bg-accent text-accent-text shadow-sm'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                            }`}
                    >
                        Mammouth
                    </button>
                </div>

                {/* Model Family (ComfyUI Only) */}
                {options.provider === 'comfyui' && (
                    <div
                        role="tablist"
                        aria-label="ComfyUI model type"
                        className="flex max-w-[560px] items-center gap-1 overflow-x-auto rounded-lg bg-bg-tertiary p-1"
                    >
                        {MODEL_FAMILIES.map(family => {
                            const isAvailable = Object.keys(family.workflows).length > 0;
                            return <button
                                key={family.id}
                                type="button"
                                role="tab"
                                aria-selected={activeModelFamily.id === family.id}
                                onClick={() => selectModelFamily(family)}
                                disabled={isDisabled || !isAvailable}
                                title={isAvailable ? family.label : `${family.label} - Coming soon`}
                                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${activeModelFamily.id === family.id
                                    ? 'bg-accent text-accent-text shadow-sm'
                                    : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                                    } disabled:cursor-not-allowed disabled:opacity-35`}
                            >
                                {family.label}
                            </button>;
                        })}
                    </div>
                )}

                <div className="bg-bg-tertiary p-1 rounded-lg flex gap-1" aria-label="Generation mode">
                    {(options.provider === 'comfyui' ? availableGenerationModes : (['t2i', 'i2i'] as const)).map(mode => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => options.provider === 'comfyui' ? selectGenerationMode(mode) : setGenerationMode(mode)}
                            disabled={isDisabled}
                            aria-pressed={generationMode === mode}
                            className={`px-3 py-1.5 text-xs font-bold uppercase rounded-md transition-colors ${generationMode === mode
                                ? 'bg-accent text-accent-text shadow-sm'
                                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                                } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            {mode}
                        </button>
                    ))}
                    {options.provider === 'comfyui' && activeModelFamily.id === 'krea2' && (
                        <>
                        <button
                            type="button"
                            onClick={() => switchComfyModel('krea2-simple')}
                            disabled={isDisabled}
                            aria-pressed={options.comfyModelType === 'krea2-simple'}
                            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${options.comfyModelType === 'krea2-simple' ? 'bg-accent text-accent-text shadow-sm' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'}`}
                        >
                            SIMPLE KREA
                        </button>
                        <button
                            type="button"
                            onClick={() => switchComfyModel('krea2-raw')}
                            disabled={isDisabled}
                            aria-pressed={options.comfyModelType === 'krea2-raw'}
                            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${options.comfyModelType === 'krea2-raw' ? 'bg-accent text-accent-text shadow-sm' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'}`}
                        >
                            KREA2 RAW
                        </button>
                        </>
                    )}
                    {options.provider === 'comfyui' && activeModelFamily.id === 'flux2' && (
                        <button
                            type="button"
                            onClick={() => switchComfyModel('flux2-simple')}
                            disabled={isDisabled}
                            aria-pressed={options.comfyModelType === 'flux2-simple'}
                            className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-accent-text shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            FLUX2 SIMPLE
                        </button>
                    )}
                </div>

                {/* Preset Manager (ComfyUI Only) */}
                {options.provider === 'comfyui' && <div className="flex items-center gap-1 bg-bg-tertiary p-1 rounded-md border border-border-primary/50">
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
                </div>}
            </div>

            {options.provider === 'comfyui' && (
                <button
                    onClick={onExportWorkflow}
                    disabled={isDisabled}
                    className="ml-auto flex shrink-0 items-center justify-center rounded-lg bg-bg-tertiary p-2.5 text-text-secondary transition-colors duration-200 hover:bg-bg-tertiary-hover disabled:opacity-50"
                    title="Export Workflow JSON"
                    aria-label="Export Workflow JSON"
                >
                    <WorkflowIcon className="h-4 w-4" />
                </button>
            )}

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
