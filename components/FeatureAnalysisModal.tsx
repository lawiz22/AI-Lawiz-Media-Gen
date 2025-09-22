import React, { useState, useEffect } from 'react';
import { CloseIcon, SpinnerIcon } from './icons';

interface Feature {
  featureName: string;
  description: string;
  implementationDetails?: {
    serviceFunctions: string[];
    modelsUsed: string[];
    apiMethods: string[];
    keyTechniques: string;
  };
  comfyui_equivalent_notes?: string;
  modelsUsed?: string[];
  apiMethods?: string[];
  keyTechniques?: string;
}

interface FeatureAnalysisData {
  featureAnalysis: {
    geminiFeatures: Feature[];
    comfyuiFeatures: Feature[];
    geminiHelperFeaturesForComfyUI: Feature[];
  };
}

const FeatureDetail: React.FC<{ label: string, value: string | string[] | undefined }> = ({ label, value }) => {
    if (!value) return null;
    const displayValue = Array.isArray(value) ? value.join(', ') : value;
    return (
        <p className="text-xs">
            <strong className="text-text-secondary">{label}:</strong>{' '}
            <span className="text-text-primary font-mono">{displayValue}</span>
        </p>
    );
};

const FeatureCard: React.FC<{ feature: Feature, type: 'gemini' | 'comfyui' | 'helper' }> = ({ feature, type }) => {
    const borderColor = type === 'gemini' ? 'border-accent' : type === 'comfyui' ? 'border-highlight-green' : 'border-highlight-yellow';
    return (
        <div className={`bg-bg-primary/50 p-4 rounded-lg border-l-4 ${borderColor}`}>
            <h4 className="font-bold text-text-primary">{feature.featureName}</h4>
            <p className="text-sm text-text-secondary mt-1 mb-3">{feature.description}</p>
            <div className="space-y-1">
                {feature.implementationDetails && (
                    <>
                        <FeatureDetail label="Services" value={feature.implementationDetails.serviceFunctions} />
                        <FeatureDetail label="Models" value={feature.implementationDetails.modelsUsed} />
                        <FeatureDetail label="API Methods" value={feature.implementationDetails.apiMethods} />
                        <FeatureDetail label="Key Techniques" value={feature.implementationDetails.keyTechniques} />
                    </>
                )}
                 {feature.modelsUsed && <FeatureDetail label="Models" value={feature.modelsUsed} />}
                 {feature.apiMethods && <FeatureDetail label="API Methods" value={feature.apiMethods} />}
                 {feature.keyTechniques && <FeatureDetail label="Key Techniques" value={feature.keyTechniques} />}
            </div>
             {feature.comfyui_equivalent_notes && (
                <div className="mt-3 pt-2 border-t border-border-primary/50">
                     <p className="text-xs text-text-secondary">
                        <strong className="text-highlight-green">ComfyUI Equivalent:</strong> {feature.comfyui_equivalent_notes}
                     </p>
                </div>
            )}
        </div>
    );
};

export const FeatureAnalysisModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<FeatureAnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setError(null);
      fetch('/featureAnalysis.json')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(setData)
        .catch(err => {
          console.error("Failed to load feature analysis data:", err);
          setError("Could not load feature analysis data. Please check the console for details.");
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-analysis-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-5xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 id="feature-analysis-title" className="text-xl font-bold text-accent">
            Feature Analysis: Gemini vs. ComfyUI
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
          {isLoading && (
            <div className="flex justify-center items-center py-16">
              <SpinnerIcon className="w-12 h-12 text-accent animate-spin" />
            </div>
          )}
          {error && <p className="text-danger text-center bg-danger-bg p-4 rounded-md">{error}</p>}
          {data && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-accent mb-3">Gemini Features</h3>
                <div className="space-y-4">
                  {data.featureAnalysis.geminiFeatures.map(f => <FeatureCard key={f.featureName} feature={f} type="gemini" />)}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-highlight-green mb-3">ComfyUI Features</h3>
                <div className="space-y-4">
                  {data.featureAnalysis.comfyuiFeatures.map(f => <FeatureCard key={f.featureName} feature={f} type="comfyui" />)}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-highlight-yellow mb-3">Gemini Helper Features for ComfyUI</h3>
                 <div className="space-y-4">
                  {data.featureAnalysis.geminiHelperFeaturesForComfyUI.map(f => <FeatureCard key={f.featureName} feature={f} type="helper" />)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
