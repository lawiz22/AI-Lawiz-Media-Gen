// Implemented OptionsPanel component to fix module resolution errors.
import React, { useState, useEffect, useRef } from 'react';
import type { GenerationOptions } from '../types';
import { 
    MAX_IMAGES, 
    PRESET_POSES, 
    BACKGROUND_OPTIONS, 
    ASPECT_RATIO_OPTIONS,
    PHOTO_STYLE_OPTIONS,
    IMAGE_STYLE_OPTIONS,
    CLOTHING_ADJECTIVES,
    CLOTHING_COLORS,
    CLOTHING_MATERIALS,
    CLOTHING_ITEMS,
    CLOTHING_DETAILS,
    BACKGROUND_LOCATIONS,
    BACKGROUND_STYLES,
    BACKGROUND_TIMES_OF_DAY,
    BACKGROUND_DETAILS,
    POSE_ACTIONS,
    POSE_MODIFIERS,
    POSE_DIRECTIONS,
    POSE_DETAILS,
} from '../constants';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon, TrashIcon } from './icons';
import { generateBackgroundImagePreview } from '../services/geminiService';

interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  setPreviewedBackgroundImage: (image: string | null) => void;
  onGenerate: () => void;
  onReset: () => void;
  isDisabled: boolean;
  isReady: boolean;
}

// Simple multi-select component for poses
const PoseSelector: React.FC<{ selected: string[], onChange: (selected: string[]) => void }> = ({ selected, onChange }) => {
    const togglePose = (poseValue: string) => {
        if (selected.includes(poseValue)) {
            onChange(selected.filter(p => p !== poseValue));
        } else {
            onChange([...selected, poseValue]);
        }
    };

    return (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {PRESET_POSES.map((pose) => (
                <button
                    key={pose.value}
                    onClick={() => togglePose(pose.value)}
                    className={`w-full text-left text-sm p-2 rounded-md transition-colors ${
                        selected.includes(pose.value)
                            ? 'bg-accent text-accent-text'
                            : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'
                    }`}
                >
                    {pose.label}
                </button>
            ))}
        </div>
    );
};

const CustomPoseEditor: React.FC<{ 
    poses: string[], 
    onChange: (poses: string[]) => void,
    onRandomize: () => void,
    isDisabled: boolean 
}> = ({ poses, onChange, onRandomize, isDisabled }) => {
    const [newPose, setNewPose] = useState('');

    const handleAddPose = () => {
        if (newPose.trim()) {
            onChange([...poses, newPose.trim()]);
            setNewPose('');
        }
    };

    const handleRemovePose = (index: number) => {
        onChange(poses.filter((_, i) => i !== index));
    };

    return (
        <div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 mb-2 border border-border-primary rounded-md p-2 bg-bg-primary/50">
                {poses.length > 0 ? poses.map((pose, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 bg-bg-tertiary p-2 rounded-md">
                        <span className="text-sm text-text-primary flex-1 break-words">{pose}</span>
                        <button onClick={() => handleRemovePose(index)} disabled={isDisabled} aria-label={`Remove pose: ${pose}`}>
                            <TrashIcon className="w-4 h-4 text-text-secondary hover:text-danger flex-shrink-0"/>
                        </button>
                    </div>
                )) : <p className="text-xs text-text-muted text-center p-4">Add custom poses below or use the randomize button.</p>}
            </div>

            <div className="flex gap-2 mb-2">
                <input 
                    type="text" 
                    value={newPose} 
                    onChange={e => setNewPose(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPose(); }}}
                    placeholder="Describe a pose..." 
                    disabled={isDisabled}
                    className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                />
                <button onClick={handleAddPose} disabled={isDisabled} className="bg-accent text-accent-text px-4 rounded-md text-sm font-semibold hover:bg-accent-hover disabled:bg-gray-600 disabled:opacity-50">Add</button>
            </div>

            <button onClick={onRandomize} disabled={isDisabled} className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                <RefreshIcon className="w-5 h-5" />
                Randomize Poses
            </button>
        </div>
    );
};

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options,
  setOptions,
  setPreviewedBackgroundImage,
  onGenerate,
  onReset,
  isDisabled,
  isReady,
}) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const isManualTrigger = useRef(false);
  const randomImageCount = useRef(options.numImages);

  useEffect(() => {
    if (options.poseMode === 'random') {
        randomImageCount.current = options.numImages;
    }
  }, [options.numImages, options.poseMode]);

  const handleOptionChange = <K extends keyof GenerationOptions>(
    key: K,
    value: GenerationOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };
  
  const handlePoseModeChange = (mode: GenerationOptions['poseMode']) => {
    setOptions(prev => {
        const newOptions = { ...prev, poseMode: mode, poseSelection: [] };
        if (mode === 'select' || mode === 'prompt') {
            newOptions.numImages = 0;
        } else {
            newOptions.numImages = randomImageCount.current;
        }
        return newOptions;
    });
  };

  const handlePoseSelectionChange = (selection: string[]) => {
      setOptions(prev => ({
        ...prev,
        poseSelection: selection,
        numImages: selection.length
      }));
  };
  
  const handleRandomizePreview = () => {
    isManualTrigger.current = true;
    setPreviewTrigger(p => p + 1);
  };

  const handleRandomizeClothing = () => {
    const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    
    const adjective = getRandom(CLOTHING_ADJECTIVES);
    const color = getRandom(CLOTHING_COLORS);
    const material = getRandom(CLOTHING_MATERIALS);
    const item = getRandom(CLOTHING_ITEMS);
    const detail = getRandom(CLOTHING_DETAILS);

    const phraseStructures = [
      `a ${adjective} ${color} ${material} ${item}`,
      `a ${color} ${item} with ${detail}`,
      `a ${adjective} ${item} made of ${material}`,
      `a ${adjective} ${color} ${item} with ${detail}`,
    ];
    
    const randomPrompt = getRandom(phraseStructures);
    handleOptionChange('customClothingPrompt', randomPrompt);
  };

  const handleRandomizeBackgroundPrompt = () => {
    const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    
    const location = getRandom(BACKGROUND_LOCATIONS);
    const style = getRandom(BACKGROUND_STYLES);
    const time = getRandom(BACKGROUND_TIMES_OF_DAY);
    const detail = getRandom(BACKGROUND_DETAILS);

    const promptStructures = [
      `${location} ${style} ${time}`,
      `${location} ${time}, ${style}`,
      `${location} ${style}, ${detail}`,
      `A portrait background of ${location} ${time} ${style}`,
    ];

    const randomPrompt = getRandom(promptStructures);
    handleOptionChange('customBackground', randomPrompt);
  };

  const handleRandomizeCustomPoses = () => {
    const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const numToGenerate = randomImageCount.current > 0 ? randomImageCount.current : 3;
    const newPoses: string[] = [];

    for (let i = 0; i < numToGenerate; i++) {
        const action = getRandom(POSE_ACTIONS);
        const modifier = getRandom(POSE_MODIFIERS);
        const direction = getRandom(POSE_DIRECTIONS);
        const detail = getRandom(POSE_DETAILS);

        const structures = [
            `${action} ${modifier} ${direction}`,
            `${action} ${direction} ${detail}`,
            `${modifier} ${action}, ${detail}`,
            `A person ${action} ${modifier}, ${direction}, ${detail}`
        ];
        newPoses.push(getRandom(structures));
    }
    
    handlePoseSelectionChange(newPoses);
  };

  useEffect(() => {
    if (options.background !== 'prompt' || !options.customBackground?.trim()) {
      setPreviewImage(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      setPreviewedBackgroundImage(null); // Clear lifted state
      return;
    }
    
    const performGeneration = () => {
      setIsPreviewLoading(true);
      setPreviewError(null);
      setPreviewImage(null);
      setPreviewedBackgroundImage(null);
      generateBackgroundImagePreview(options.customBackground!, options.aspectRatio)
        .then(imageSrc => {
          setPreviewImage(imageSrc);
          setPreviewedBackgroundImage(imageSrc); // Lift state up
        })
        .catch(err => {
          setPreviewError(err.message || 'Failed to generate preview.');
          setPreviewedBackgroundImage(null); // Clear lifted state on error
        })
        .finally(() => {
          setIsPreviewLoading(false);
        });
    };
    
    if (isManualTrigger.current) {
        isManualTrigger.current = false;
        performGeneration();
        return; 
    }

    const handler = setTimeout(() => {
        performGeneration();
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [options.customBackground, options.aspectRatio, options.background, previewTrigger, setPreviewedBackgroundImage]);

  return (
    <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-accent">2. Configure Options</h2>
      <div className="space-y-6">
        
        <div>
            <label htmlFor="numImages" className="block text-sm font-medium text-text-secondary">
                Number of Images ({options.numImages})
            </label>
            <input
                id="numImages"
                type="range"
                min="1"
                max={MAX_IMAGES}
                value={options.numImages}
                onChange={(e) => handleOptionChange('numImages', parseInt(e.target.value, 10))}
                className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer range-thumb"
                style={{'--thumb-color': 'var(--color-accent)'} as React.CSSProperties}
                disabled={isDisabled || options.poseMode === 'select' || options.poseMode === 'prompt'}
            />
             {(options.poseMode === 'select' || options.poseMode === 'prompt') && (
                <p className="text-xs text-text-muted mt-1">Number of images is determined by your pose selection.</p>
            )}
        </div>

        <div>
            <label htmlFor="aspectRatio" className="block text-sm font-medium text-text-secondary mb-1">Aspect Ratio</label>
            <select
                id="aspectRatio"
                value={options.aspectRatio}
                onChange={(e) => handleOptionChange('aspectRatio', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
            >
                {ASPECT_RATIO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>

        <div>
            <label htmlFor="background" className="block text-sm font-medium text-text-secondary mb-1">Background</label>
            <select
                id="background"
                value={options.background}
                onChange={(e) => handleOptionChange('background', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
            >
                {BACKGROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {options.background === 'prompt' && (
                <div className="mt-2">
                  <div className="relative">
                    <textarea
                        placeholder="e.g., a vibrant cityscape at night"
                        value={options.customBackground}
                        onChange={(e) => handleOptionChange('customBackground', e.target.value)}
                        disabled={isDisabled}
                        className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 pr-10 text-sm focus:ring-accent focus:border-accent min-h-[60px]"
                        rows={2}
                    />
                    <button
                        onClick={handleRandomizeBackgroundPrompt}
                        disabled={isDisabled}
                        title="Randomize Background Prompt"
                        aria-label="Randomize Background Prompt"
                        className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                    >
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="mt-2 p-2 bg-bg-primary/50 rounded-lg min-h-[100px] flex flex-col items-center justify-center">
                    {isPreviewLoading && (
                      <div className="text-center text-text-secondary">
                        <SpinnerIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                        <p className="text-xs">Generating preview...</p>
                      </div>
                    )}
                    {previewError && !isPreviewLoading && (
                      <div className="text-center text-danger text-xs p-2">
                        <p className="font-semibold">Preview Failed</p>
                        <p className="max-w-xs mx-auto">{previewError}</p>
                        <button
                          onClick={handleRandomizePreview}
                          className="mt-2 flex items-center gap-1 mx-auto text-xs bg-bg-tertiary hover:bg-bg-tertiary-hover text-accent font-semibold py-1 px-3 rounded-lg transition-colors duration-200"
                          aria-label="Retry background preview generation"
                        >
                          <RefreshIcon className="w-4 h-4"/>
                          Retry
                        </button>
                      </div>
                    )}
                    {previewImage && !isPreviewLoading && (
                       <div className="relative w-full">
                        <img src={previewImage} alt="Background preview" className="rounded-md object-contain max-h-48 w-full" />
                        <button
                            onClick={handleRandomizePreview}
                            className="absolute top-2 right-2 flex items-center gap-1 bg-bg-secondary/80 backdrop-blur-sm text-text-primary text-xs font-bold py-1 px-2 rounded-full hover:bg-accent hover:text-accent-text transition-colors duration-200 shadow-lg"
                            aria-label="Generate new background preview"
                        >
                            <RefreshIcon className="w-4 h-4"/>
                            <span>Randomize</span>
                        </button>
                      </div>
                    )}
                    {!isPreviewLoading && !previewError && !previewImage && (
                       <p className="text-xs text-text-muted text-center">A preview of your background will appear here after you stop typing.</p>
                    )}
                  </div>
                   {previewImage && !isPreviewLoading && !previewError && (
                      <div className="mt-3">
                        <label className="flex items-center space-x-2 cursor-pointer p-1">
                          <input
                            type="checkbox"
                            checked={!!options.consistentBackground}
                            onChange={(e) => handleOptionChange('consistentBackground', e.target.checked)}
                            disabled={isDisabled}
                            className="h-4 w-4 rounded border-border-primary bg-bg-tertiary text-accent focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-secondary"
                          />
                          <span className="text-sm text-text-secondary">Use this background for all images</span>
                        </label>
                      </div>
                    )}
                </div>
            )}
        </div>

        <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Clothing Style</label>
             <select
                id="clothing"
                value={options.clothing}
                onChange={(e) => handleOptionChange('clothing', e.target.value as GenerationOptions['clothing'])}
                disabled={isDisabled}
                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
            >
                <option value="original">Original from Image</option>
                <option value="image">From Uploaded Image</option>
                <option value="prompt">From Text Prompt</option>
            </select>
            {options.clothing === 'prompt' && (
                <div className="relative mt-2">
                    <input
                        type="text"
                        placeholder="e.g., a stylish black leather jacket"
                        value={options.customClothingPrompt}
                        onChange={(e) => handleOptionChange('customClothingPrompt', e.target.value)}
                        disabled={isDisabled}
                        className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 pr-10 text-sm focus:ring-accent focus:border-accent"
                    />
                     <button
                        onClick={handleRandomizeClothing}
                        disabled={isDisabled}
                        title="Randomize Clothing"
                        aria-label="Randomize Clothing Description"
                        className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                    >
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
        
        <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Poses</label>
            <div className="flex flex-col sm:flex-row items-center gap-2">
                <button onClick={() => handlePoseModeChange('random')} className={`w-full text-center px-3 py-2 text-sm rounded-md transition-colors ${options.poseMode === 'random' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`} disabled={isDisabled}>Random</button>
                <button onClick={() => handlePoseModeChange('select')} className={`w-full text-center px-3 py-2 text-sm rounded-md transition-colors ${options.poseMode === 'select' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`} disabled={isDisabled}>Select</button>
                <button onClick={() => handlePoseModeChange('prompt')} className={`w-full text-center px-3 py-2 text-sm rounded-md transition-colors ${options.poseMode === 'prompt' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`} disabled={isDisabled}>Custom</button>
            </div>
            {options.poseMode === 'select' && (
                <div className="mt-4">
                    <p className="text-xs text-text-muted mb-2">Select one or more poses. The number of images will match your selection.</p>
                    <PoseSelector selected={options.poseSelection} onChange={handlePoseSelectionChange} />
                </div>
            )}
            {options.poseMode === 'prompt' && (
                <div className="mt-4">
                    <CustomPoseEditor
                        poses={options.poseSelection}
                        onChange={handlePoseSelectionChange}
                        onRandomize={handleRandomizeCustomPoses}
                        isDisabled={isDisabled}
                    />
                </div>
            )}
        </div>
        
        <div>
            <label htmlFor="photoStyle" className="block text-sm font-medium text-text-secondary mb-1">Photo Style</label>
            <select
                id="photoStyle"
                value={options.photoStyle}
                onChange={(e) => handleOptionChange('photoStyle', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
            >
                {PHOTO_STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>

        <div>
            <label htmlFor="imageStyle" className="block text-sm font-medium text-text-secondary mb-1">Image Style</label>
            <select
                id="imageStyle"
                value={options.imageStyle}
                onChange={(e) => handleOptionChange('imageStyle', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
            >
                {IMAGE_STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>

        <div className="border-t border-border-primary pt-6 flex flex-col gap-3">
            <button
              onClick={onGenerate}
              disabled={isDisabled || !isReady}
              className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-3 px-4 rounded-lg hover:bg-accent-hover transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                <GenerateIcon className="w-5 h-5" />
                Generate Portraits
            </button>
            <button
                onClick={onReset}
                disabled={isDisabled}
                className="w-full flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:bg-gray-500"
            >
                <ResetIcon className="w-5 h-5" />
                Reset All Options
            </button>
        </div>

      </div>
    </div>
  );
};