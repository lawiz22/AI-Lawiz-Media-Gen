// Implemented OptionsPanel component to fix module resolution errors.
import React from 'react';
import type { GenerationOptions } from '../types';
import { 
    MAX_IMAGES, 
    PRESET_POSES, 
    BACKGROUND_OPTIONS, 
    ASPECT_RATIO_OPTIONS,
    PHOTO_STYLE_OPTIONS
} from '../constants';
import { GenerateIcon, ResetIcon } from './icons';

interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
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
  onGenerate,
  onReset,
  isDisabled,
  isReady,
}) => {
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
                <input
                    type="text"
                    placeholder="e.g., a vibrant cityscape at night"
                    value={options.customBackground}
                    onChange={(e) => handleOptionChange('customBackground', e.target.value)}
                    disabled={isDisabled}
                    className="mt-2 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm focus:ring-cyan-500 focus:border-cyan-500"
                />
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
