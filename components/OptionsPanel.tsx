import React from 'react';
import type { GenerationOptions } from '../types';
import { MAX_IMAGES, BACKGROUND_OPTIONS, ASPECT_RATIO_OPTIONS } from '../constants';
import { GenerateIcon, ResetIcon } from './icons';

interface OptionsPanelProps {
  options: GenerationOptions;
  setOptions: React.Dispatch<React.SetStateAction<GenerationOptions>>;
  onGenerate: () => void;
  onReset: () => void;
  isDisabled: boolean;
  isReady: boolean;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({ options, setOptions, onGenerate, onReset, isDisabled, isReady }) => {
  const handleOptionChange = <K extends keyof GenerationOptions,>(key: K, value: GenerationOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-gray-800 p-6 rounded-2xl shadow-lg space-y-6">
      <h2 className="text-xl font-bold text-cyan-400">2. Configure Options</h2>

      <div>
        <label htmlFor="numImages" className="block text-sm font-medium text-gray-300">
          Number of Images: <span className="font-bold text-white">{options.numImages}</span>
        </label>
        <input
          id="numImages"
          type="range"
          min="1"
          max={MAX_IMAGES}
          value={options.numImages}
          onChange={(e) => handleOptionChange('numImages', parseInt(e.target.value, 10))}
          disabled={isDisabled}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="aspectRatio" className="block text-sm font-medium text-gray-300 mb-1">Aspect Ratio</label>
        <select
          id="aspectRatio"
          value={options.aspectRatio}
          onChange={(e) => handleOptionChange('aspectRatio', e.target.value)}
          disabled={isDisabled}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 disabled:opacity-50"
        >
          {ASPECT_RATIO_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="background" className="block text-sm font-medium text-gray-300 mb-1">Background</label>
        <select
          id="background"
          value={options.background}
          onChange={(e) => handleOptionChange('background', e.target.value)}
          disabled={isDisabled}
          className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 disabled:opacity-50"
        >
          {BACKGROUND_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {options.background === 'prompt' && (
        <div className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
          <div>
            <label htmlFor="customBackground" className="block text-sm font-medium text-gray-300 mb-1">
              Background Prompt
            </label>
            <textarea
              id="customBackground"
              rows={3}
              value={options.customBackground || ''}
              onChange={(e) => handleOptionChange('customBackground', e.target.value)}
              disabled={isDisabled}
              placeholder="e.g., a futuristic city skyline at night"
              className="bg-gray-900/50 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 disabled:opacity-50 resize-y"
            />
          </div>
          <div className="flex items-center">
            <input
              id="consistentBackground"
              type="checkbox"
              checked={options.consistentBackground || false}
              onChange={(e) => handleOptionChange('consistentBackground', e.target.checked)}
              disabled={isDisabled}
              className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2 disabled:opacity-50"
            />
            <label htmlFor="consistentBackground" className="ml-2 text-sm font-medium text-gray-300">
              Consistent Background
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col space-y-3 pt-4 border-t border-gray-700">
        <button
          onClick={onGenerate}
          disabled={isDisabled || !isReady}
          className="w-full flex items-center justify-center gap-2 bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          <GenerateIcon className="w-5 h-5"/>
          {isDisabled ? 'Generating...' : 'Generate Series'}
        </button>
        <button
          onClick={onReset}
          disabled={isDisabled}
          className="w-full flex items-center justify-center gap-2 bg-gray-600 text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors duration-200 disabled:opacity-50"
        >
          <ResetIcon className="w-5 h-5"/>
          Reset
        </button>
      </div>
    </div>
  );
};