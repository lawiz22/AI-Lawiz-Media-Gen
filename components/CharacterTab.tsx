import React, { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { setModalOpen } from '../store/appSlice';
import {
    setBackgroundImage, setCharacterName, setCharacterPoseImage, setClothingImage, setPreviewedBackgroundImage, setPreviewedClothingImage,
    setShouldGenerateCharacterName, setSourceImage,
} from '../store/generationSlice';
import { useHasGenerationJobs } from '../store/generationJobs';
import { DEFAULT_GEMINI_IMAGE_MODEL, getGeminiAspectRatios } from '../services/geminiService';
import type { CharacterResultSnapshot } from '../services/characterResults';
import type { GenerationOptions, LibraryItem } from '../types';
import { ActionControlPanel } from './ActionControlPanel';
import { BlazingFastCharacterPanel } from './BlazingFastCharacterPanel';
import { GenerationProgress, ImageGridWithJobs } from './GenerationProgress';
import { ImageUploader } from './ImageUploader';
import { OptionsPanel } from './OptionsPanel';
import Qwen21CharacterSheetPanel from './Qwen21CharacterSheetPanel';
import { TabActivity } from './TabActivity';
import { CharacterIcon, CloseIcon as CancelCharacterIcon, LibraryIcon } from './icons';
import { ui } from './ui/styles';

const choice = (active: boolean) => `rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${active
    ? 'bg-accent text-accent-text shadow-sm' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'} disabled:cursor-not-allowed disabled:opacity-50`;
const subTab = (active: boolean) => `border-b-2 px-1 py-3 text-sm font-semibold ${active ? 'border-accent text-accent' : 'border-transparent text-text-secondary'}`;

/** The Character tab: provider and workflow bars, the Blazing Fast and Character Sheet panels, and the shared two-column layout. */
export const CharacterTab: React.FC<{
    options: GenerationOptions;
    sourceImage: File | null;
    clothingImage: File | null;
    backgroundImage: File | null;
    characterPoseImage: File | null;
    previewedBackgroundImage: string | null;
    previewedClothingImage: string | null;
    characterName: string;
    shouldGenerateCharacterName: boolean;
    isLoading: boolean;
    isReady: boolean;
    isCancelling: boolean;
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
    /** Results of the provider and workflow currently shown, stored under contentKey. */
    content?: { images?: any[]; lastUsedPrompt?: any };
    contentKey: string;
    generationTime?: number | null;
    /** Settings, source and name used for the results shown, kept when the form changes afterwards. */
    resultSnapshot?: CharacterResultSnapshot;
    blazingPreset: LibraryItem | null;
    onBlazingPresetLoaded: () => void;
    onBlazingModelChange: (model: string) => void;
    onManageStyles: () => void;
    updateOptions: (options: Partial<GenerationOptions>, switchModel?: boolean) => void;
    restoreOptions: (options: GenerationOptions) => boolean;
    onGenerate: () => void;
    onReset: () => void;
    onCancel: () => void;
    onSendToI2I: (imageDataUrl: string) => void | Promise<void>;
    onSendToCharacter: (imageDataUrl: string) => void | Promise<void>;
    onSendToUpscale: (imageDataUrl: string, name?: string) => void | Promise<void>;
}> = ({
    options, sourceImage, clothingImage, backgroundImage, characterPoseImage, previewedBackgroundImage, previewedClothingImage,
    characterName, shouldGenerateCharacterName, isLoading, isReady, isCancelling, isComfyUIConnected, comfyUIObjectInfo,
    content, contentKey, generationTime, resultSnapshot, blazingPreset, onBlazingPresetLoaded, onBlazingModelChange, onManageStyles,
    updateOptions, restoreOptions, onGenerate, onReset, onCancel, onSendToI2I, onSendToCharacter, onSendToUpscale,
}) => {
    const dispatch: AppDispatch = useDispatch();
    const [characterOutputsContainer, setCharacterOutputsContainer] = useState<HTMLDivElement | null>(null);
    const hasJobs = useHasGenerationJobs(contentKey);
    const isComfy = options.provider === 'comfyui', mode = options.comfyCharacterMode;
    const isBlazingCharacter = isComfy && mode === 'flux2' && options.comfyCharacterFlux2Tab === 'blazing-fast';
    const isSheet = isComfy && mode === 'qwen21';
    const openSourceLibrary = () => dispatch(setModalOpen({ modal: 'isCharacterSourcePickerOpen', isOpen: true }));
    const changeSource = useCallback((file: File | null) => { dispatch(setSourceImage(file)); }, [dispatch]);

    return <>
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-border-primary bg-bg-secondary p-2 shadow-sm">
            <div className="flex gap-1 rounded-lg bg-bg-tertiary p-1">
                <button type="button" onClick={() => updateOptions({ provider: 'comfyui' })} disabled={isLoading} className={choice(isComfy)}>ComfyUI</button>
                <button type="button" onClick={() => updateOptions({ provider: 'mammouth' })} disabled={isLoading} className={choice(options.provider === 'mammouth')}>Mammouth</button>
                <button type="button" disabled={isLoading} className={choice(options.provider === 'gemini')} onClick={() => {
                    const geminiModel = options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL;
                    const aspectRatio = getGeminiAspectRatios(geminiModel).includes(options.aspectRatio) ? options.aspectRatio : '1:1';
                    updateOptions({ provider: 'gemini', geminiMode: 'i2i', geminiI2iMode: 'character', aspectRatio });
                }}>Gemini</button>
            </div>
            {isComfy && <div role="tablist" aria-label="ComfyUI character workflow" className="flex gap-1 rounded-lg bg-bg-tertiary p-1">
                <button type="button" role="tab" aria-selected={(mode || 'qwen') === 'qwen'} onClick={() => updateOptions({ comfyCharacterMode: 'qwen' })} disabled={isLoading} className={choice((mode || 'qwen') === 'qwen')}>QWEN</button>
                <button type="button" role="tab" aria-selected={mode === 'flux2'} onClick={() => updateOptions({ comfyCharacterMode: 'flux2' })} disabled={isLoading} className={choice(mode === 'flux2')}>FLUX2</button>
                <button type="button" role="tab" aria-selected={mode === 'qwen21' || mode === 'qwen21-create'} onClick={() => updateOptions({ comfyCharacterMode: mode === 'qwen21-create' ? 'qwen21-create' : 'qwen21' })} disabled={isLoading} className={choice(mode === 'qwen21' || mode === 'qwen21-create')}>QWEN 2.1</button>
            </div>}
        </div>
        {isComfy && mode === 'flux2' && <div role="tablist" aria-label="FLUX2 character workflow" className="mb-4 flex gap-4 border-b border-border-primary">
            {([['standard', 'Character Angles'], ['blazing-fast', 'Blazing Fast character']] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={(options.comfyCharacterFlux2Tab || 'standard') === tab} disabled={isLoading} onClick={() => updateOptions({ comfyCharacterFlux2Tab: tab })} className={subTab((options.comfyCharacterFlux2Tab || 'standard') === tab)}>{label}</button>)}
        </div>}
        <TabActivity mode={isBlazingCharacter ? 'visible' : 'hidden'}>
            <BlazingFastCharacterPanel isComfyUIConnected={isComfyUIConnected} onManageStyles={onManageStyles} onModelChange={onBlazingModelChange} pendingPreset={blazingPreset} onPresetLoaded={onBlazingPresetLoaded} />
        </TabActivity>
        {isComfy && ['qwen21', 'qwen21-create'].includes(mode || '') && <div role="tablist" aria-label="Qwen 2.1 character workflow" className="flex gap-4 border-b border-border-primary">
            {([['qwen21', 'Character Sheet'], ['qwen21-create', 'Create Character']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={isLoading} onClick={() => updateOptions({ comfyCharacterMode: value })} className={subTab(mode === value)}>{label}</button>)}
        </div>}
        <TabActivity mode={isSheet ? 'visible' : 'hidden'}>
            <Qwen21CharacterSheetPanel options={options} onOptionsChange={updateOptions} sourceFile={sourceImage} onSourceChange={changeSource} onOpenLibrary={openSourceLibrary} characterName={characterName} onNameChange={name => dispatch(setCharacterName(name))} isComfyUIConnected={isComfyUIConnected} objectInfo={comfyUIObjectInfo} />
        </TabActivity>
        <TabActivity mode={isBlazingCharacter || isSheet ? 'hidden' : 'visible'}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1 space-y-8">
                    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-accent">1. Character Source</h2>
                            <button onClick={openSourceLibrary} className="p-2 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover" title="Load from Library"><LibraryIcon className="w-5 h-5" /></button>
                        </div>
                        <ImageUploader label="Upload Face/Character Reference" id="char-source-upload" onImageUpload={file => dispatch(setSourceImage(file))} sourceFile={sourceImage} />
                        <div className="mt-4">
                            <label htmlFor="character-name" className={ui.label}>Character Name</label>
                            <div className="mt-1 flex gap-2">
                                <input id="character-name" type="text" value={characterName} onChange={event => dispatch(setCharacterName(event.target.value))} placeholder="Enter or Auto-Generate" className={ui.control} />
                                <button onClick={() => dispatch(setShouldGenerateCharacterName(!shouldGenerateCharacterName))} aria-pressed={shouldGenerateCharacterName} className={`shrink-0 rounded-md border p-2 ${shouldGenerateCharacterName ? 'bg-accent text-accent-text border-accent' : 'bg-bg-tertiary text-text-secondary border-border-primary'}`} title="Auto-generate name"><CharacterIcon className="w-5 h-5" /></button>
                            </div>
                        </div>
                    </div>
                    <OptionsPanel
                        options={options}
                        setOptions={restoreOptions}
                        updateOptions={updateOptions}
                        generationMode="i2i"
                        setGenerationMode={() => { }}
                        previewedBackgroundImage={previewedBackgroundImage}
                        setPreviewedBackgroundImage={url => dispatch(setPreviewedBackgroundImage(url))}
                        previewedClothingImage={previewedClothingImage}
                        setPreviewedClothingImage={url => dispatch(setPreviewedClothingImage(url))}
                        onGenerate={onGenerate}
                        onReset={onReset}
                        onGeneratePrompt={() => { }}
                        onExportWorkflow={() => { }}
                        onOpenPosePicker={() => dispatch(setModalOpen({ modal: 'isPosePickerOpen', isOpen: true }))}
                        isDisabled={isLoading}
                        isReady={isReady}
                        isGeneratingPrompt={false}
                        comfyUIObjectInfo={comfyUIObjectInfo}
                        comfyUIUrl={localStorage.getItem('comfyui_url') || ''}
                        sourceImage={sourceImage}
                        hideProviderSwitch={true}
                        hideGenerationModeSwitch={true}
                        title="2. Character Options"
                        characterOutputsContainer={characterOutputsContainer}
                        activeTab="character-generator"
                        maskImage={null}
                        setMaskImage={() => { }}
                        elementImages={[]}
                        setElementImages={() => { }}
                        onOpenMaskPicker={() => { }}
                        onOpenElementPicker={() => { }}
                        clothingImage={clothingImage}
                        setClothingImage={file => dispatch(setClothingImage(file))}
                        backgroundImage={backgroundImage}
                        setBackgroundImage={file => dispatch(setBackgroundImage(file))}
                        characterPoseImage={characterPoseImage}
                        setCharacterPoseImage={file => dispatch(setCharacterPoseImage(file))}
                        onOpenClothingLibrary={() => dispatch(setModalOpen({ modal: 'isClothingPickerOpen', isOpen: true }))}
                        onOpenBackgroundLibrary={() => dispatch(setModalOpen({ modal: 'isBackgroundPickerOpen', isOpen: true }))}
                    />
                </div>
                <div className="lg:col-span-2 min-w-0 space-y-8">
                    <ActionControlPanel options={options} generationMode="i2i" onGenerate={onGenerate} onReset={onReset} isReady={isReady} isDisabled={isLoading} />
                    {isLoading && !hasJobs ? <GenerationProgress /> : <ImageGridWithJobs
                        key={contentKey}
                        jobsKey={contentKey}
                        contentKey={contentKey}
                        images={content?.images || []}
                        onSendToI2I={onSendToI2I}
                        onSendToCharacter={onSendToCharacter}
                        onSendToUpscale={onSendToUpscale}
                        lastUsedPrompt={content?.lastUsedPrompt}
                        options={resultSnapshot?.options ?? options}
                        sourceImage={resultSnapshot ? resultSnapshot.sourceImage : sourceImage}
                        characterName={resultSnapshot ? resultSnapshot.characterName : characterName}
                        activeTab="character-generator"
                        generationTime={generationTime}
                    />}
                    {isLoading && isComfy && <div className="flex justify-end"><button type="button" onClick={onCancel} disabled={isCancelling} className="inline-flex items-center justify-center gap-2 rounded-md border border-danger bg-danger-bg px-4 py-2 text-sm font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-50"><CancelCharacterIcon className="h-4 w-4" />{isCancelling ? 'Cancelling...' : 'Cancel Generation'}</button></div>}
                    <div ref={setCharacterOutputsContainer} data-character-outputs="true" className="min-w-0" />
                </div>
            </div>
        </TabActivity>
    </>;
};
