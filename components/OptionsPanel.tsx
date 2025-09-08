// Implemented OptionsPanel component to fix module resolution errors.
import React, { useState, useEffect, useRef } from 'react';
import type { GenerationOptions } from '../types';
import { 
    MAX_IMAGES, 
    PRESET_POSES, 
    BACKGROUND_OPTIONS, 
    ASPECT_RATIO_OPTIONS,
    PHOTO_STYLE_OPTIONS
} from '../constants';
import { GenerateIcon, ResetIcon, SpinnerIcon, RefreshIcon } from './icons';
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
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                    {pose.label}
                </button>
            ))}
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


  const handleOptionChange = <K extends keyof GenerationOptions>(
    key: K,
    value: GenerationOptions[K]
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };
  
  const handlePoseSelectionChange = (selection: string[]) => {
      handleOptionChange('poseSelection', selection);
      // Automatically adjust numImages to match selection count
      if (options.poseMode === 'select') {
        handleOptionChange('numImages', selection.length);
      }
  };
  
  const handleRandomizePreview = () => {
    isManualTrigger.current = true;
    setPreviewTrigger(p => p + 1);
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
    
    // If triggered by the randomize button, generate immediately
    if (isManualTrigger.current) {
        isManualTrigger.current = false; // reset flag
        performGeneration();
        return; 
    }

    // Otherwise, use a debounce for typing
    const handler = setTimeout(() => {
        performGeneration();
    }, 1000); // 1-second debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [options.customBackground, options.aspectRatio, options.background, previewTrigger, setPreviewedBackgroundImage]);

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-cyan-400">2. Configure Options</h2>
      <div className="space-y-6">
        
        {/* Number of Images */}
        <div>
            <label htmlFor="numImages" className="block text-sm font-medium text-gray-300">
                Number of Images ({options.numImages})
            </label>
            <input
                id="numImages"
                type="range"
                min="1"
                max={MAX_IMAGES}
                value={options.numImages}
                onChange={(e) => handleOptionChange('numImages', parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-thumb"
                disabled={isDisabled || options.poseMode === 'select'}
            />
             {options.poseMode === 'select' && (
                <p className="text-xs text-gray-400 mt-1">Number of images is determined by your pose selection.</p>
            )}
        </div>

        {/* Aspect Ratio */}
        <div>
            <label htmlFor="aspectRatio" className="block text-sm font-medium text-gray-300 mb-1">Aspect Ratio</label>
            <select
                id="aspectRatio"
                value={options.aspectRatio}
                onChange={(e) => handleOptionChange('aspectRatio', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
            >
                {ASPECT_RATIO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>

        {/* Background */}
        <div>
            <label htmlFor="background" className="block text-sm font-medium text-gray-300 mb-1">Background</label>
            <select
                id="background"
                value={options.background}
                onChange={(e) => handleOptionChange('background', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
            >
                {BACKGROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {options.background === 'prompt' && (
                <>
                  <textarea
                      placeholder="e.g., a vibrant cityscape at night"
                      value={options.customBackground}
                      onChange={(e) => handleOptionChange('customBackground', e.target.value)}
                      disabled={isDisabled}
                      className="mt-2 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500 min-h-[60px]"
                      rows={2}
                  />
                  <div className="mt-2 p-2 bg-gray-900/50 rounded-lg min-h-[100px] flex flex-col items-center justify-center">
                    {isPreviewLoading && (
                      <div className="text-center text-gray-400">
                        <SpinnerIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                        <p className="text-xs">Generating preview...</p>
                      </div>
                    )}
                    {previewError && !isPreviewLoading && (
                      <div className="text-center text-red-400 text-xs p-2">
                        <p className="font-semibold">Preview Failed</p>
                        <p className="max-w-xs mx-auto">{previewError}</p>
                        <button
                          onClick={handleRandomizePreview}
                          className="mt-2 flex items-center gap-1 mx-auto text-xs bg-gray-700 hover:bg-gray-600 text-cyan-300 font-semibold py-1 px-3 rounded-lg transition-colors duration-200"
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
                            className="absolute top-2 right-2 flex items-center gap-1 bg-gray-800/80 backdrop-blur-sm text-white text-xs font-bold py-1 px-2 rounded-full hover:bg-cyan-600 transition-colors duration-200 shadow-lg"
                            aria-label="Generate new background preview"
                        >
                            <RefreshIcon className="w-4 h-4"/>
                            <span>Randomize</span>
                        </button>
                      </div>
                    )}
                    {!isPreviewLoading && !previewError && !previewImage && (
                       <p className="text-xs text-gray-500 text-center">A preview of your background will appear here after you stop typing.</p>
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
                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-cyan-600 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                          />
                          <span className="text-sm text-gray-300">Use this background for all images</span>
                        </label>
                      </div>
                    )}
                </>
            )}
        </div>

        {/* Clothing */}
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Clothing Style</label>
             <select
                id="clothing"
                value={options.clothing}
                onChange={(e) => handleOptionChange('clothing', e.target.value as GenerationOptions['clothing'])}
                disabled={isDisabled}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
            >
                <option value="original">Original from Image</option>
                <option value="image">From Uploaded Image</option>
                <option value="prompt">From Text Prompt</option>
            </select>
            {options.clothing === 'prompt' && (
                <input
                    type="text"
                    placeholder="e.g., a stylish black leather jacket"
                    value={options.customClothingPrompt}
                    onChange={(e) => handleOptionChange('customClothingPrompt', e.target.value)}
                    disabled={isDisabled}
                    className="mt-2 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                />
            )}
        </div>
        
        {/* Poses */}
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Poses</label>
            <div className="flex items-center gap-4">
                <button onClick={() => handleOptionChange('poseMode', 'random')} className={`px-4 py-2 text-sm rounded-md transition-colors w-1/2 ${options.poseMode === 'random' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`} disabled={isDisabled}>Random Poses</button>
                <button onClick={() => handleOptionChange('poseMode', 'select')} className={`px-4 py-2 text-sm rounded-md transition-colors w-1/2 ${options.poseMode === 'select' ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`} disabled={isDisabled}>Select Poses</button>
            </div>
            {options.poseMode === 'select' && (
                <div className="mt-4">
                    <p className="text-xs text-gray-400 mb-2">Select one or more poses. The number of images will match your selection.</p>
                    <PoseSelector selected={options.poseSelection} onChange={handlePoseSelectionChange} />
                </div>
            )}
        </div>
        
        {/* Photo Style */}
        <div>
            <label htmlFor="photoStyle" className="block text-sm font-medium text-gray-300 mb-1">Photo Style</label>
            <select
                id="photoStyle"
                value={options.photoStyle}
                onChange={(e) => handleOptionChange('photoStyle', e.target.value)}
                disabled={isDisabled}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
            >
                {PHOTO_STYLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-gray-700 pt-6 flex flex-col gap-3">
            <button
              onClick={onGenerate}
              disabled={isDisabled || !isReady}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                <GenerateIcon className="w-5 h-5" />
                Generate Portraits
            </button>
            <button
                onClick={onReset}
                disabled={isDisabled}
                className="w-full flex items-center justify-center gap-2 bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors duration-200 disabled:bg-gray-500"
            >
                <ResetIcon className="w-5 h-5" />
                Reset All Options
            </button>
        </div>

      </div>
    </div>
  );
};