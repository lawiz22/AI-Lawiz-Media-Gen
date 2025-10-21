import React from 'react';
import { Quality } from '../../groupPhotoFusion/types';

interface QualitySelectorProps {
  selectedQuality: Quality;
  onSelectQuality: (quality: Quality) => void;
}

const QUALITIES: { id: Quality; title: string; description: string }[] = [
  {
    id: 'Standard',
    title: 'Standard',
    description: 'Good quality, fast generation.',
  },
  {
    id: 'High',
    title: 'High',
    description: 'Great quality and detail.',
  },
  {
    id: 'Ultra High',
    title: 'Ultra High',
    description: 'Maximum realism and sharpness.',
  },
];

const QualitySelector: React.FC<QualitySelectorProps> = ({ selectedQuality, onSelectQuality }) => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold text-text-primary mb-4 text-center">Choose an Image Quality</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {QUALITIES.map((quality) => {
          const isSelected = selectedQuality === quality.id;
          return (
            <button
              key={quality.id}
              onClick={() => onSelectQuality(quality.id)}
              className={`p-4 rounded-lg text-left transition-all duration-200 ${
                isSelected
                  ? 'bg-accent text-accent-text ring-2 ring-offset-2 ring-offset-bg-secondary ring-accent shadow-lg'
                  : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'
              }`}
            >
              <h3 className={`font-bold ${isSelected ? 'text-accent-text' : 'text-text-primary'}`}>{quality.title}</h3>
              <p className={`text-sm ${isSelected ? 'text-accent-text/80' : 'text-text-secondary'} mt-1`}>{quality.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QualitySelector;
