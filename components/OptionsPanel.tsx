
// Fix: Implemented the full OptionsPanel component, which was missing.
// This resolves the module resolution error and provides the necessary UI
// for configuring image generation for both Gemini and ComfyUI providers.
import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import type { GenerationOptions } from '../types';
import {
  BACKGROUND_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  PHOTO_STYLE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  ERA_STYLE_OPTIONS,
  PRESET_POSES,
  TEXT_OBJECT_PROMPTS
} from '../constants';
import { generateBackgroundImagePreview } from '../services/geminiService';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon, WorkflowIcon } from './icons';

// --- Prop Types ---
interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  setPreviewedBackgroundImage: (url: string | null) => void;
  onGenerate: () => void;
  onReset: () => void;
  onGeneratePrompt: () => void;
  onExportWorkflow: () => void;
  isDisabled: boolean;
  isReady: boolean;
  isGeneratingPrompt: boolean;
  comfyUIObjectInfo: any | null;
  comfyUIUrl: string;
  sourceImage: File | null;
}

// --- Helper Components ---
const OptionSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="space-y-4">
        <h3 className="text-lg font-semibold text-text-primary border-b border-border-primary pb-2">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const SelectInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, options: {value: string, label: string}[], disabled?: boolean }> = 
({ label, value, onChange, options, disabled }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        <select value={value} onChange={onChange} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent">
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

const TextInput: React.FC<{ label: string, value: string, onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void, placeholder?: string, disabled?: boolean, isTextArea?: boolean }> =
({ label, value, onChange, placeholder, disabled, isTextArea }) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary">{label}</label>
        {isTextArea ? (
            <textarea value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} rows={3} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent" />
        ) : (
            <input type="text" value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent" />
        )}
    </div>
);

// --- Main Component ---
export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options, setOptions, setPreviewedBackgroundImage,
  onGenerate, onReset, onGeneratePrompt, onExportWorkflow,
  isDisabled, isReady, isGeneratingPrompt,
  comfyUIObjectInfo, comfyUIUrl, sourceImage,
}) => {
    const [isPreviewingBg, setIsPreviewingBg] = useState(false);
    const [bgPreviewError, setBgPreviewError] = useState<string | null>(null);
    const [selectedPoses, setSelectedPoses] = useState<string[]>(options.poseSelection);

    useEffect(() => {
        setOptions(prev => ({ ...prev, poseSelection: selectedPoses }));
    }, [selectedPoses, setOptions]);

    const handleOptionChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setOptions(prev => ({ ...prev, [field]: value }));
    };

    const handleSliderChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [field]: parseFloat(e.target.value) }));
    };
    
    const handleNumberInputChange = (field: keyof GenerationOptions) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setOptions(prev => ({ ...prev, [field]: parseInt(e.target.value, 10) || 0 }));
    };

    const handlePoseSelection = (poseValue: string) => {
        setSelectedPoses(prev => {
            const isSelected = prev.includes(poseValue);
            if (isSelected) {
                return prev.filter(p => p !== poseValue);
            } else {
                return [...prev, poseValue];
            }
        });
    };
    
    const handleGenerateBgPreview = async () => {
        if (!options.customBackground) {
            setBgPreviewError("Please enter a background prompt first.");
            return;
        }
        setIsPreviewingBg(true);
        setBgPreviewError(null);
        setPreviewedBackgroundImage(null);
        try {
            const imageUrl = await generateBackgroundImagePreview(options.customBackground, options.aspectRatio);
            setPreviewedBackgroundImage(imageUrl);
        } catch (err: any) {
            setBgPreviewError(err.message || "Failed to generate preview.");
        } finally {
            setIsPreviewingBg(false);
        }
    };
    
    const comfyModels = useMemo(() => {
        if (!comfyUIObjectInfo || !comfyUIObjectInfo.CheckpointLoaderSimple) return [];
        return comfyUIObjectInfo.CheckpointLoaderSimple.input.required.ckpt_name[0];
    }, [comfyUIObjectInfo]);

    const comfySamplers = useMemo(() => {
        if (!comfyUIObjectInfo || !comfyUIObjectInfo.KSampler) return [];
        return comfyUIObjectInfo.KSampler.input.required.sampler_name[0];
    }, [comfyUIObjectInfo]);

    const comfySchedulers = useMemo(() => {
        if (!comfyUIObjectInfo || !comfyUIObjectInfo.KSampler) return [];
        return comfyUIObjectInfo.KSampler.input.required.scheduler[0];
    }, [comfyUIObjectInfo]);

    useEffect(() => {
        if (options.provider === 'comfyui' && comfyModels.length > 0 && !options.comfyModel) {
            setOptions(prev => ({ ...prev, comfyModel: comfyModels[0] }));
        }
    }, [options.provider, comfyModels, options.comfyModel, setOptions]);

    const renderProviderSwitch = () => (
        <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1">
            <button onClick={() => setOptions(prev => ({...prev, provider: 'gemini'}))} disabled={isDisabled}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'}`}>
                Gemini
            </button>
            <button onClick={() => setOptions(prev => ({...prev, provider: 'comfyui'}))} disabled={isDisabled || !comfyUIUrl}
                    className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${options.provider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'} ${!comfyUIUrl ? 'cursor-not-allowed opacity-50' : ''}`}>
                ComfyUI
            </button>
        </div>
    );
    
    const renderGeminiOptions = () => (
      <>
        <OptionSection title="Core Settings">
            <div>
                <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
            </div>
            <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
        </OptionSection>

        <OptionSection title="Background">
            <SelectInput label="Background Type" value={options.background} onChange={handleOptionChange('background')} options={BACKGROUND_OPTIONS} disabled={isDisabled} />
            {options.background === 'prompt' && (
                <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Custom Background Prompt" value={options.customBackground || ''} onChange={handleOptionChange('customBackground')} placeholder="e.g., a futuristic neon city" disabled={isDisabled} />
                    <div className="flex items-center gap-2">
                        <button onClick={handleGenerateBgPreview} disabled={isDisabled || isPreviewingBg} className="text-sm flex-1 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                            {isPreviewingBg ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <RefreshIcon className="w-4 h-4"/>}
                            {isPreviewingBg ? 'Generating...' : 'Preview Background'}
                        </button>
                        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                           <input type="checkbox" checked={options.consistentBackground} onChange={handleOptionChange('consistentBackground')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                           Use same BG
                        </label>
                    </div>
                    {bgPreviewError && <p className="text-xs text-danger">{bgPreviewError}</p>}
                </div>
            )}
        </OptionSection>
        
        <OptionSection title="Clothing">
            <SelectInput label="Clothing Source" value={options.clothing} onChange={handleOptionChange('clothing')} options={[
                { value: 'original', label: 'Keep Original' },
                { value: 'image', label: 'Use Reference Image' },
                { value: 'prompt', label: 'Describe with Prompt' }
            ]} disabled={isDisabled} />
             {options.clothing === 'prompt' && (
                <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Custom Clothing Prompt" value={options.customClothingPrompt || ''} onChange={handleOptionChange('customClothingPrompt')} placeholder="e.g., a stylish leather jacket" disabled={isDisabled || options.randomizeClothing} />
                    <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={options.randomizeClothing} onChange={handleOptionChange('randomizeClothing')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                        Randomize Clothing
                    </label>
                    <SelectInput label="Style Consistency" value={options.clothingStyleConsistency || 'varied'} onChange={handleOptionChange('clothingStyleConsistency')} options={[
                        {value: 'varied', label: 'Varied Interpretations'}, {value: 'strict', label: 'Strictly Identical'},
                    ]} disabled={isDisabled || options.randomizeClothing} />
                </div>
            )}
        </OptionSection>

        <OptionSection title="Pose">
             <SelectInput label="Pose Mode" value={options.poseMode} onChange={handleOptionChange('poseMode')} options={[
                { value: 'random', label: 'Random' },
                { value: 'select', label: 'Select from Presets' },
            ]} disabled={isDisabled} />
            {options.poseMode === 'select' && (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                    {PRESET_POSES.map(pose => (
                        <button key={pose.value} onClick={() => handlePoseSelection(pose.value)} disabled={isDisabled}
                            className={`p-2 text-xs text-left rounded-md transition-colors ${selectedPoses.includes(pose.value) ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>
                            {pose.label}
                        </button>
                    ))}
                </div>
            )}
        </OptionSection>

        <OptionSection title="Style">
            <SelectInput label="Artistic Style" value={options.imageStyle} onChange={handleOptionChange('imageStyle')} options={IMAGE_STYLE_OPTIONS} disabled={isDisabled} />
            {options.imageStyle === 'photorealistic' ? (
                <>
                    <SelectInput label="Photo Style" value={options.photoStyle} onChange={handleOptionChange('photoStyle')} options={PHOTO_STYLE_OPTIONS} disabled={isDisabled} />
                    <SelectInput label="Era / Theme" value={options.eraStyle} onChange={handleOptionChange('eraStyle')} options={ERA_STYLE_OPTIONS} disabled={isDisabled} />
                </>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-text-secondary">Creativity: {options.creativity}</label>
                    <input type="range" min="0" max="1" step="0.1" value={options.creativity} onChange={handleSliderChange('creativity')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                </div>
            )}
        </OptionSection>
        
        <OptionSection title="Text Overlay (Optional)">
             <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={options.addTextToImage} onChange={handleOptionChange('addTextToImage')} disabled={isDisabled} className="rounded text-accent focus:ring-accent" />
                Add text to image
            </label>
            {options.addTextToImage && (
                 <div className="space-y-2 pl-4 border-l-2 border-border-primary">
                    <TextInput label="Text to Display" value={options.textOnImagePrompt || ''} onChange={handleOptionChange('textOnImagePrompt')} placeholder="e.g., Happy Birthday" disabled={isDisabled} />
                    <SelectInput label="How to display text" value={options.textObjectPrompt || ''} onChange={handleOptionChange('textObjectPrompt')} options={TEXT_OBJECT_PROMPTS.map(p => ({value: p, label: p.replace("'%s'", '...')}))} disabled={isDisabled} />
                </div>
            )}
        </OptionSection>
      </>
    );
    
    const renderComfyUIOptions = () => (
      <>
        {comfyUIObjectInfo === null ? (
            <div className="flex items-center justify-center text-text-secondary p-8">
                <SpinnerIcon className="w-8 h-8 animate-spin mr-2" />
                <span>Loading ComfyUI models...</span>
            </div>
        ) : comfyModels.length === 0 ? (
            <div className="bg-danger-bg text-danger p-4 rounded-lg text-sm">
                Could not load any ComfyUI models. Ensure your server is running and accessible. Check the connection in the header.
            </div>
        ) : (
            <>
                <OptionSection title="Core Settings">
                    <SelectInput label="Model Type" value={options.comfyModelType || 'sdxl'} onChange={handleOptionChange('comfyModelType')} options={[{label: 'SDXL', value: 'sdxl'}, {label: 'FLUX', value: 'flux'}]} disabled={isDisabled} />
                    <SelectInput label="Checkpoint Model" value={options.comfyModel || ''} onChange={handleOptionChange('comfyModel')} options={comfyModels.map((m:string) => ({value: m, label: m}))} disabled={isDisabled} />
                    <SelectInput label="Sampler" value={options.comfySampler || ''} onChange={handleOptionChange('comfySampler')} options={comfySamplers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                    <SelectInput label="Scheduler" value={options.comfyScheduler || ''} onChange={handleOptionChange('comfyScheduler')} options={comfySchedulers.map((s:string) => ({value: s, label: s}))} disabled={isDisabled} />
                    <SelectInput label="Aspect Ratio" value={options.aspectRatio} onChange={handleOptionChange('aspectRatio')} options={ASPECT_RATIO_OPTIONS} disabled={isDisabled} />
                    <div>
                        <label className="block text-sm font-medium text-text-secondary">Number of Images: {options.numImages}</label>
                        <input type="range" min="1" max="8" step="1" value={options.numImages} onChange={handleNumberInputChange('numImages')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                    </div>
                </OptionSection>

                <OptionSection title="Prompt">
                    <TextInput label="Positive Prompt" value={options.comfyPrompt || ''} onChange={handleOptionChange('comfyPrompt')} disabled={isDisabled} isTextArea={true} placeholder="A photorealistic portrait of a person..." />
                    <button onClick={onGeneratePrompt} disabled={!sourceImage || isGeneratingPrompt || isDisabled} className="w-full text-sm flex items-center justify-center gap-2 bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isGeneratingPrompt ? <SpinnerIcon className="w-4 h-4 animate-spin"/> : <GenerateIcon className="w-4 h-4"/>}
                        {isGeneratingPrompt ? 'Generating...' : 'Generate from Source Image'}
                    </button>
                </OptionSection>

                <OptionSection title="Parameters">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary">Steps: {options.comfySteps}</label>
                        <input type="range" min="10" max="50" step="1" value={options.comfySteps} onChange={handleSliderChange('comfySteps')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary">CFG Scale: {options.comfyCfg}</label>
                        <input type="range" min="1" max="15" step="0.5" value={options.comfyCfg} onChange={handleSliderChange('comfyCfg')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                    </div>
                    {options.comfyModelType === 'flux' && (
                        <div>
                            <label className="block text-sm font-medium text-text-secondary">FLUX Guidance: {options.comfyFluxGuidance}</label>
                            <input type="range" min="1" max="10" step="0.1" value={options.comfyFluxGuidance} onChange={handleSliderChange('comfyFluxGuidance')} disabled={isDisabled} className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                        </div>
                    )}
                </OptionSection>
            </>
        )}
      </>
    );

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
            <div>
                <h2 className="text-xl font-bold mb-4 text-accent">2. Configure Generation</h2>
                {renderProviderSwitch()}
            </div>
            
            {options.provider === 'gemini' ? renderGeminiOptions() : renderComfyUIOptions()}

            <OptionSection title="Actions">
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                      <button onClick={onReset} disabled={isDisabled} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                          <ResetIcon className="w-5 h-5"/> Reset
                      </button>
                      <button onClick={onGenerate} disabled={!isReady} style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                          <GenerateIcon className="w-5 h-5"/> Generate
                      </button>
                  </div>
                  {options.provider === 'comfyui' && (
                      <button onClick={onExportWorkflow} disabled={isDisabled || !options.comfyPrompt} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                          <WorkflowIcon className="w-5 h-5" /> Export Workflow (.json)
                      </button>
                  )}
              </div>
            </OptionSection>
        </div>
    );
};
