import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { setGlobalError, setModalOpen } from '../store/appSlice';
import { setElementImages, setGenerationMode, setMaskImage, setPreviewedBackgroundImage, setPreviewedClothingImage, setSourceImage, updateOptions as updateStoredOptions } from '../store/generationSlice';
import { useHasGenerationJobs } from '../store/generationJobs';
import { generatePromptFromImage } from '../services/geminiService';
import { cancelComfyUIExecution, generateComfyUIPromptFromSource } from '../services/comfyUIService';
import type { ComfyModelType, GenerationOptions } from '../types';
import { ActionControlPanel } from './ActionControlPanel';
import { GenerationLivePreview, GenerationProgress, ImageGridWithJobs } from './GenerationProgress';
import { ImageGeneratorHeader } from './ImageGeneratorHeader';
import { ImageUploader } from './ImageUploader';
import { LoraSettingsPanel } from './LoraSettingsPanel';
import { OptionsPanel } from './OptionsPanel';
import Qwen21MultiPanel, { type Qwen21MultiHandle } from './Qwen21MultiPanel';
import Qwen21RemoveBackgroundPanel from './Qwen21RemoveBackgroundPanel';
import { SamplerSettingsPanel } from './SamplerSettingsPanel';
import { TabActivity } from './TabActivity';
import { LibraryIcon } from './icons';
import { NumberField } from './ui/fields';

/** The Image Generator tab: header, the QWEN 2.1 edit panels, and the standard two-column workflow layout. */
export const ImageGeneratorTab: React.FC<{
    options: GenerationOptions;
    generationMode: 't2i' | 'i2i';
    sourceImage: File | null;
    maskImage: File | null;
    elementImages: File[];
    previewedBackgroundImage: string | null;
    previewedClothingImage: string | null;
    isLoading: boolean;
    isReady: boolean;
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
    availableLoras: string[];
    activeTab: string;
    /** Results of the workflow currently shown, stored under contentKey. */
    content?: { images?: any[]; lastUsedPrompt?: any; options?: GenerationOptions };
    contentKey: string;
    generationTime?: number | null;
    jobsKey: string;
    updateOptions: (options: Partial<GenerationOptions>, switchModel?: boolean) => void;
    restoreOptions: (options: GenerationOptions) => boolean;
    switchComfyModel: (modelType: ComfyModelType) => void;
    onGenerate: () => void;
    onReset: () => void;
    onExportWorkflow: (options: GenerationOptions) => void | Promise<void>;
    onSourceChange: (file: File | null) => void;
    onSendToI2I: (imageDataUrl: string) => void | Promise<void>;
    onSendToCharacter: (imageDataUrl: string) => void | Promise<void>;
    onSendToUpscale: (imageDataUrl: string, name?: string) => void | Promise<void>;
}> = ({
    options, generationMode, sourceImage, maskImage, elementImages, previewedBackgroundImage, previewedClothingImage,
    isLoading, isReady, isComfyUIConnected, comfyUIObjectInfo, availableLoras, activeTab, content, contentKey, generationTime, jobsKey,
    updateOptions, restoreOptions, switchComfyModel, onGenerate, onReset, onExportWorkflow, onSourceChange, onSendToI2I, onSendToCharacter, onSendToUpscale,
}) => {
    const dispatch: AppDispatch = useDispatch();
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
    const [promptContainer, setPromptContainer] = useState<HTMLDivElement | null>(null);
    const qwen21MultiRef = React.useRef<Qwen21MultiHandle>(null);
    const hasJobs = useHasGenerationJobs(jobsKey);
    const isComfy = options.provider === 'comfyui';
    const modelType = options.comfyModelType;
    const refinable = isComfy && generationMode === 't2i' && (modelType === 'sd1.5' || modelType === 'sdxl' || modelType === 'qwen-t2i-gguf' || modelType === 'z-image');
    // These workflows have no source image, or show it inside their own panel.
    const ownsSource = isComfy && (modelType === 'krea2-edit' || modelType === 'flux2-edit'
        || generationMode === 't2i' && (modelType === 'flux2-simple' || modelType === 'krea2-simple' || modelType === 'krea2-raw' || modelType === 'qwen21-t2i' || modelType === 'qwen21-turbo' || modelType === 'moss-image' || modelType === 'moss-photo'));
    const openSourceLibrary = () => dispatch(setModalOpen({ modal: 'isRefineSourcePickerOpen', isOpen: true }));

    const generatePromptFromSource = async () => {
        if (!sourceImage) return;
        setIsGeneratingPrompt(true);
        try {
            const prompt = isComfy ? await generateComfyUIPromptFromSource(sourceImage, modelType || 'sdxl') : await generatePromptFromImage(sourceImage);
            dispatch(updateStoredOptions(modelType === 'krea2-simple' || modelType === 'krea2-raw' ? { comfyKreaPrompt: prompt }
                : modelType === 'flux2-simple' ? { comfyFlux2Prompt: prompt } : { comfyPrompt: prompt }));
        } catch (error) {
            console.error("Failed to generate prompt:", error);
            dispatch(setGlobalError({ title: "Prompt Generation Failed", message: "Could not generate prompt from image." }));
        } finally {
            setIsGeneratingPrompt(false);
        }
    };

    return <>
        <ImageGeneratorHeader
            options={options}
            updateOptions={updateOptions}
            restoreOptions={restoreOptions}
            switchComfyModel={switchComfyModel}
            generationMode={generationMode}
            setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
            onExportWorkflow={() => {
                if (isComfy && modelType === 'qwen21-i2i-multi') { void qwen21MultiRef.current?.exportWorkflow(); return; }
                const images = content?.images || [];
                const lastImage = images.length > 0 ? images[images.length - 1] : null;
                void onExportWorkflow(lastImage && lastImage.seed !== undefined ? { ...options, comfySeed: lastImage.seed } : options);
            }}
            isDisabled={isLoading}
        />
        <TabActivity mode={isComfy && modelType === 'qwen21-remove-background' ? 'visible' : 'hidden'}>
            <Qwen21RemoveBackgroundPanel options={options} updateOptions={updateOptions} sourceFile={sourceImage} onSourceChange={onSourceChange} isComfyUIConnected={isComfyUIConnected} objectInfo={comfyUIObjectInfo} />
        </TabActivity>
        <TabActivity mode={isComfy && modelType === 'qwen21-i2i-consistency' ? 'visible' : 'hidden'}>
            <Qwen21RemoveBackgroundPanel editMode="consistency" options={options} updateOptions={updateOptions} sourceFile={sourceImage} onSourceChange={onSourceChange} isComfyUIConnected={isComfyUIConnected} objectInfo={comfyUIObjectInfo} />
        </TabActivity>
        <TabActivity mode={isComfy && modelType === 'qwen21-i2i-turbo' ? 'visible' : 'hidden'}>
            <Qwen21RemoveBackgroundPanel editMode="turbo" options={options} updateOptions={updateOptions} sourceFile={sourceImage} onSourceChange={onSourceChange} isComfyUIConnected={isComfyUIConnected} objectInfo={comfyUIObjectInfo} />
        </TabActivity>
        <TabActivity mode={isComfy && modelType === 'qwen21-i2i-multi' ? 'visible' : 'hidden'}>
            <Qwen21MultiPanel ref={qwen21MultiRef} options={options} updateOptions={updateOptions} isComfyUIConnected={isComfyUIConnected} objectInfo={comfyUIObjectInfo} />
        </TabActivity>
        <TabActivity mode={isComfy && ['qwen21-remove-background', 'qwen21-i2i-consistency', 'qwen21-i2i-turbo', 'qwen21-i2i-multi'].includes(modelType || '') ? 'hidden' : 'visible'}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 space-y-8">
                    {!ownsSource && <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <h2 className="text-xl font-bold text-accent">{refinable ? '1. Refine (Optional)' : '1. Source & Context'}</h2>
                        </div>
                        {refinable ? <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="useRefine"
                                    checked={options.useRefine || false}
                                    onChange={(e) => dispatch(updateStoredOptions({ useRefine: e.target.checked }))}
                                    className="w-5 h-5 rounded border-border-primary text-accent focus:ring-accent"
                                />
                                <label htmlFor="useRefine" className="text-sm font-medium text-text-primary cursor-pointer">Enable Refine (Image-to-Image)</label>
                            </div>
                            {options.useRefine && <div className="animate-fade-in space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-text-secondary">Source Image</label>
                                    <button onClick={openSourceLibrary} className="p-2 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Load from Library">
                                        <LibraryIcon className="w-5 h-5" />
                                    </button>
                                </div>
                                <ImageUploader label="Upload Source Image to Refine" id="refine-source-upload" onImageUpload={(file) => dispatch(setSourceImage(file))} sourceFile={sourceImage} />
                                <NumberField slider label="Denoise Strength" ariaLabel="Image Refine Denoise Strength" value={options.refineDenoise || 0.5} min={0.01} max={1} step={0.01} onChange={value => dispatch(updateStoredOptions({ refineDenoise: value }))} />
                                <p className="text-xs text-text-muted">Lower values keep more of the original image structure.</p>
                                <NumberField slider label="Megapixels (Resize)" ariaLabel="Image Refine Megapixels" value={options.refineMegapixels || 0.5} min={0.1} max={2} step={0.1} onChange={value => dispatch(updateStoredOptions({ refineMegapixels: value }))} />
                                <p className="text-xs text-text-muted">Target resolution in megapixels (0.5 is approx 700x700).</p>
                            </div>}
                        </div> : <div className="space-y-2">
                            <ImageUploader
                                label={generationMode === 'i2i' ? 'Upload Source Image (Required)' : 'Upload Source Image (Optional for T2I)'}
                                id="main-source-upload"
                                onImageUpload={(file) => dispatch(setSourceImage(file))}
                                sourceFile={sourceImage}
                            />
                        </div>}
                    </div>}
                    <OptionsPanel
                        options={options}
                        setOptions={restoreOptions}
                        updateOptions={updateOptions}
                        generationMode={generationMode}
                        setGenerationMode={(mode) => dispatch(setGenerationMode(mode))}
                        previewedBackgroundImage={previewedBackgroundImage}
                        setPreviewedBackgroundImage={(url) => dispatch(setPreviewedBackgroundImage(url))}
                        previewedClothingImage={previewedClothingImage}
                        setPreviewedClothingImage={(url) => dispatch(setPreviewedClothingImage(url))}
                        onGenerate={onGenerate}
                        onReset={onReset}
                        onGeneratePrompt={generatePromptFromSource}
                        onExportWorkflow={() => { void onExportWorkflow(options); }}
                        isDisabled={isLoading}
                        isReady={isReady}
                        isGeneratingPrompt={isGeneratingPrompt}
                        comfyUIObjectInfo={comfyUIObjectInfo}
                        comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                        sourceImage={sourceImage}
                        onSourceImageChange={onSourceChange}
                        onOpenSourceLibrary={openSourceLibrary}
                        activeTab={activeTab}
                        maskImage={maskImage}
                        setMaskImage={(file) => dispatch(setMaskImage(file))}
                        elementImages={elementImages}
                        setElementImages={(files) => dispatch(setElementImages(files))}
                        onOpenMaskPicker={() => dispatch(setModalOpen({ modal: 'isMaskPickerOpen', isOpen: true }))}
                        onOpenElementPicker={() => dispatch(setModalOpen({ modal: 'isElementPickerOpen', isOpen: true }))}
                        hideGeneralSettings={true}
                        promptContainer={promptContainer}
                        settingsSlot={isComfy && <>
                            <LoraSettingsPanel options={options} updateOptions={(opts) => dispatch(updateStoredOptions(opts))} isDisabled={isLoading} availableLoras={availableLoras} comfyUIObjectInfo={comfyUIObjectInfo} />
                            <SamplerSettingsPanel options={options} updateOptions={(opts) => dispatch(updateStoredOptions(opts))} isDisabled={isLoading} comfyUIObjectInfo={comfyUIObjectInfo} />
                        </>}
                    />
                </div>
                <div className="lg:col-span-2 space-y-8">
                    {/* MOSS PHOTO keeps its prompt in its own guided panel. */}
                    {!(isComfy && modelType === 'moss-photo') && <div ref={setPromptContainer} data-image-prompt="true" className="min-w-0" />}
                    <ActionControlPanel options={options} generationMode={generationMode} onGenerate={onGenerate} onReset={onReset} isReady={isReady} isDisabled={isLoading} updateOptions={updateOptions} />
                    {isLoading && (modelType === 'moss-image' || modelType === 'moss-photo') && <GenerationLivePreview />}
                    {isLoading && !hasJobs ? (
                        <GenerationProgress onCancel={cancelComfyUIExecution} />
                    ) : (
                        <>
                            {isLoading && <GenerationProgress onCancel={cancelComfyUIExecution} />}
                            <ImageGridWithJobs
                                jobsKey={jobsKey}
                                showJobs={isLoading}
                                images={content?.images || []}
                                onSendToI2I={onSendToI2I}
                                onSendToCharacter={onSendToCharacter}
                                onSendToUpscale={onSendToUpscale}
                                lastUsedPrompt={content?.lastUsedPrompt}
                                options={content?.options ?? options}
                                sourceImage={sourceImage}
                                activeTab={contentKey}
                                generationTime={generationTime}
                            />
                        </>
                    )}
                </div>
            </div>
        </TabActivity>
    </>;
};
