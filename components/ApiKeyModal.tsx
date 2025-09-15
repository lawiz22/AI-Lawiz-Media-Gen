
import React, { useState } from 'react';
import { Logo } from './Logo';

interface ApiKeyModalProps {
  onSave: (apiKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSave }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSaveClick = () => {
    if (!apiKey.trim()) {
      setError('API Key cannot be empty.');
      return;
    }
    setError(null);
    onSave(apiKey.trim());
  };

  return (
    <div
      className="fixed inset-0 bg-bg-primary/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="bg-bg-secondary w-full max-w-lg p-8 rounded-2xl shadow-lg border border-border-primary text-center">
        <div className="flex justify-center mb-4">
            <Logo className="w-16 h-16"/>
        </div>
        <h2 id="api-key-modal-title" className="text-2xl font-bold text-accent mb-2">
          API Key Required
        </h2>
        <p className="text-text-secondary mb-6">
          Please enter your Google AI API key to continue. Your key is stored only for this session and is required to use the AI features.
        </p>
        <div className="space-y-4">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (error) setError(null);
            }}
            className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm text-center focus:ring-accent focus:border-accent shadow-sm"
            placeholder="Paste your API Key here"
            aria-label="Google AI API Key"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <a 
            href="https://aistudio.google.com/app/apikey" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline"
          >
            Get your API Key from Google AI Studio
          </a>
          <button
            onClick={handleSaveClick}
            className="w-full font-bold py-3 px-4 rounded-lg transition-colors duration-200 bg-accent text-accent-text hover:bg-accent-hover"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
