import React from 'react';
import { GenerationOptions } from '../types';
import { ASPECT_RATIO_OPTIONS, FLUX2_RESOLUTION_OPTIONS, KREA2_RAW_RESOLUTION_OPTIONS, KREA2_RESOLUTION_OPTIONS, MAX_IMAGES } from '../constants';
import { GenerateIcon, ResetIcon } from './icons';
import { NumberField } from './ui/fields';
import { Select } from './ui/Select';
import { DEFAULT_GEMINI_IMAGE_MODEL, getGeminiAspectRatios } from '../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL } from '../services/mammouthService';
import { defaultQwen21Settings, QWEN21_SIZES, qwen21Dimensions } from '../services/qwen21Workflow';
import { defaultMossSettings } from '../services/mossWorkflow';
import { defaultMossPhotoSettings, mossPhotoDimensions } from '../services/mossPhotoWorkflow';

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
    const qwen21Mode = options.comfyModelType === 'qwen21-turbo' ? 'turbo' : 't2i';
    const qwen21Key = qwen21Mode === 'turbo' ? 'comfyQwen21Turbo' : 'comfyQwen21T2i';
    const qwen21Settings = options[qwen21Key] || defaultQwen21Settings(qwen21Mode);
    const moss = options.comfyMoss || defaultMossSettings();
    const photo = options.comfyMossPhoto || defaultMossPhotoSettings();
    let photoResolution = '';
    if (options.comfyModelType === 'moss-photo') {
        try {
            const size = mossPhotoDimensions(photo);
            photoResolution = `${size.width} x ${size.height}`;
        } catch (error) {
            photoResolution = error instanceof Error ? error.message : 'Invalid PHOTO dimensions.';
        }
    }
    const aspectRatioOptions = options.provider === 'gemini'
        ? getGeminiAspectRatios(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL).map(value => ({
            value,
            label: ASPECT_RATIO_OPTIONS.find(option => option.value === value)?.label || value,
        }))
        : ASPECT_RATIO_OPTIONS;
    const activeModelName = options.provider === 'gemini'
        ? (options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL)
        : options.provider === 'mammouth'
            ? (options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL)
            : options.comfyCharacterMode === 'flux2'
                ? `FLUX2 Klein Multi-Angle (${options.comfyCharacterFlux2Unet || 'flux-2-klein-4b-Q4_K_M.gguf'})`
                : options.comfyCharacterUnet
                    ? `Qwen Edit Multi-Angle (${options.comfyCharacterUnet})`
                : options.comfyModelType === 'krea2-simple'
                    ? 'KREA2 Simple'
                    : options.comfyModelType === 'krea2-raw'
                        ? 'KREA2 RAW'
                    : options.comfyModelType === 'flux2-simple'
                        ? 'FLUX2 Simple'
                    : options.comfyModelType === 'flux2-edit'
                        ? 'FLUX2 Multi-Reference Edit'
                    : options.comfyModelType === 'moss-image'
                        ? 'MOSS Image 1.0'
                    : options.comfyModelType === 'moss-photo'
                        ? 'MOSS PHOTO'
                    : options.comfyModelType === 'krea2-edit'
                        ? `KREA2 ${options.comfyKrea2Edit?.task === 'identity' ? 'Identity' : 'General Edit'} V2`
                    : (options.comfyModelType || 'sdxl');

    return (
        <div className="flex flex-col gap-4 rounded-2xl bg-bg-secondary p-4 shadow-lg">
            <div className="flex w-full min-w-0 items-center gap-4">
                <span className="min-w-0 max-w-full break-words text-sm font-medium uppercase tracking-wide text-text-secondary">
                    Active Model: <span className="text-accent font-bold">{activeModelName}</span>
                </span>
            </div>
            <div className="flex w-full flex-wrap items-end justify-start gap-4 border-t border-border-primary pt-4">
                {updateOptions && <>
                    {options.provider === 'comfyui' && options.comfyModelType === 'z-image' && (
                        <NumberField slider className="w-56" label="Megapixels" ariaLabel="Image Megapixels" value={options.megapixel || 1} min={0.1} max={2} step={0.1} disabled={isDisabled} onChange={megapixel => updateOptions({ megapixel })} />
                    )}
                    {options.provider === 'comfyui' && options.comfyModelType === 'krea2-edit' ? (
                        <span className="text-xs text-text-secondary">Edit | {options.comfyKrea2Edit?.aspect || '3:4'} | {options.comfyKrea2Edit?.megapixels ?? 1} MP | Batch: {options.comfyKrea2Edit?.batchSize ?? 1} | Total: {options.numImages * (options.comfyKrea2Edit?.batchSize ?? 1)} images</span>
                    ) : options.provider === 'comfyui' && options.comfyModelType === 'moss-photo' ? (
                        <span className="text-xs text-text-secondary">PHOTO | {photoResolution} | Batch: {photo.batchSize} | Total: {options.numImages * photo.batchSize} images</span>
                    ) : options.provider === 'comfyui' && options.comfyModelType === 'moss-image' ? (
                        <span className="text-xs text-text-secondary">{moss.refineImage ? 'Refine: source proportions, max 1280 px' : `Resolution: ${moss.width} x ${moss.height}`} | Batch: {moss.batchSize} | Total: {options.numImages * moss.batchSize} images</span>
                    ) : options.provider === 'comfyui' && options.comfyModelType === 'flux2-edit' ? (
                        <NumberField slider className="w-56" label="Source Megapixels" ariaLabel="Image Source Megapixels" value={options.comfyFlux2EditMegapixels ?? 1} min={0.25} max={4} step={0.25} disabled={isDisabled} onChange={comfyFlux2EditMegapixels => updateOptions({ comfyFlux2EditMegapixels })} />
                    ) : options.provider === 'comfyui' && (options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw') ? (
                        <Select className="w-64" label="Resolution" ariaLabel="Image Resolution" value={options.comfyKreaResolution || (options.comfyModelType === 'krea2-raw' ? '1920x1088' : '832x1216')} onChange={comfyKreaResolution => updateOptions({ comfyKreaResolution })} disabled={isDisabled}
                            options={options.comfyModelType === 'krea2-raw' ? KREA2_RAW_RESOLUTION_OPTIONS : KREA2_RESOLUTION_OPTIONS} />
                    ) : options.provider === 'comfyui' && options.comfyModelType === 'flux2-simple' ? (
                        <Select className="w-64" label="Resolution" ariaLabel="Image Resolution" value={options.comfyFlux2Resolution || '832x1216'} onChange={comfyFlux2Resolution => updateOptions({ comfyFlux2Resolution })} disabled={isDisabled} options={FLUX2_RESOLUTION_OPTIONS} />
                    ) : options.provider === 'comfyui' && (options.comfyModelType === 'qwen21-t2i' || options.comfyModelType === 'qwen21-turbo') ? (
                        <div className="flex flex-wrap items-end gap-2">
                            <Select<string> className="w-36" label="Orientation" ariaLabel="Quick Orientation" value={qwen21Settings.orientation} onChange={orientation => updateOptions({ [qwen21Key]: { ...qwen21Settings, orientation: orientation as 'landscape' | 'portrait' } })} disabled={isDisabled}
                                options={[{ value: 'landscape', label: 'Landscape' }, { value: 'portrait', label: 'Portrait' }]} />
                            <Select<number> className="w-40" label="Size" ariaLabel="Quick Size" value={qwen21Settings.sizeIndex} onChange={sizeIndex => updateOptions({ [qwen21Key]: { ...qwen21Settings, sizeIndex } })} disabled={isDisabled}
                                options={QWEN21_SIZES[qwen21Mode].map((_, sizeIndex) => {
                                    const { width, height } = qwen21Dimensions(qwen21Mode, { ...qwen21Settings, sizeIndex });
                                    return { value: sizeIndex, label: `${width} x ${height}` };
                                })} />
                        </div>
                    ) : (
                        <Select<string> className="w-56" label="Aspect Ratio" ariaLabel="Image Aspect Ratio" value={options.aspectRatio} onChange={aspectRatio => updateOptions({ aspectRatio: aspectRatio as GenerationOptions['aspectRatio'] })} disabled={isDisabled} options={aspectRatioOptions} />
                    )}
                    <NumberField slider className="w-52" label="Number of Images" ariaLabel="Image Number of Images" value={options.numImages} min={1} max={MAX_IMAGES} step={1} disabled={isDisabled} onChange={value => {
                        const count = Math.min(Math.max(1, Math.round(value)), MAX_IMAGES);
                        updateOptions({ numImages: count, poseSelection: options.poseSelection.slice(0, count) });
                    }} />
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
