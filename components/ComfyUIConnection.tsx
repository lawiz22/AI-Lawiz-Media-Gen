

import React, { useState, useEffect, useCallback } from 'react';
import { checkConnection } from '../services/comfyUIService';
import { testMammouthConnection } from '../services/mammouthService';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, testOllamaConnection } from '../services/ollamaService';
import { CloseIcon, SpinnerIcon } from './icons';

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialComfyUIUrl: string;
  initialGoogleClientId: string;
  initialGeminiApiKey?: string;
  initialMammouthApiKey?: string;
  initialOllamaUrl: string;
  initialOllamaModel: string;
  onSave: (comfyUIUrl: string, googleClientId: string, geminiApiKey?: string, mammouthApiKey?: string, ollamaUrl?: string, ollamaModel?: string) => void;
  onConnectionFail: (url: string) => void;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

export const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({ isOpen, onClose, initialComfyUIUrl, initialGoogleClientId, initialGeminiApiKey, initialMammouthApiKey, initialOllamaUrl, initialOllamaModel, onSave, onConnectionFail }) => {
  const [comfyUrl, setComfyUrl] = useState<string>('');
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [mammouthApiKey, setMammouthApiKey] = useState<string>('');
  const [comfyStatus, setComfyStatus] = useState<ConnectionStatus>('idle');
  const [comfyStatusMessage, setComfyStatusMessage] = useState<string>('');
  const [mammouthStatus, setMammouthStatus] = useState<ConnectionStatus>('idle');
  const [mammouthStatusMessage, setMammouthStatusMessage] = useState<string>('');
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<ConnectionStatus>('idle');
  const [ollamaStatusMessage, setOllamaStatusMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setComfyUrl(initialComfyUIUrl || 'http://127.0.0.1:8188');
      setGoogleClientId(initialGoogleClientId || '');
      setGeminiApiKey(initialGeminiApiKey || '');
      setMammouthApiKey(initialMammouthApiKey || '');
      setOllamaUrl(initialOllamaUrl || DEFAULT_OLLAMA_URL);
      setOllamaModel(initialOllamaModel || DEFAULT_OLLAMA_MODEL);
      setOllamaModels([]);
      setComfyStatus('idle'); // Reset status when opening
      setMammouthStatus('idle');
      setOllamaStatus('idle');
    }
  }, [initialComfyUIUrl, initialGoogleClientId, initialGeminiApiKey, initialMammouthApiKey, initialOllamaUrl, initialOllamaModel, isOpen]);

  const handleTestConnection = async () => {
    setComfyStatus('testing');
    setComfyStatusMessage('');
    const result = await checkConnection(comfyUrl);
    if (result.success) {
      setComfyStatus('success');
      setComfyStatusMessage('Connection successful!');
    } else {
      setComfyStatus('failed');
      setComfyStatusMessage(result.error || 'Failed to connect.');
      onConnectionFail(comfyUrl);
    }
  };

  const handleSave = () => {
    onSave(comfyUrl, googleClientId, geminiApiKey, mammouthApiKey, ollamaUrl, ollamaModel);
    onClose();
  };

  const handleTestMammouth = async () => {
    setMammouthStatus('testing');
    setMammouthStatusMessage('');
    const result = await testMammouthConnection(mammouthApiKey);
    setMammouthStatus(result.success ? 'success' : 'failed');
    setMammouthStatusMessage(result.message);
  };

  const handleTestOllama = async () => {
    setOllamaStatus('testing');
    setOllamaStatusMessage('');
    const result = await testOllamaConnection(ollamaUrl);
    setOllamaModels(result.models);
    setOllamaStatus(result.success ? 'success' : 'failed');
    setOllamaStatusMessage(result.message);
  };

  const getStatusColor = () => {
    switch (comfyStatus) {
      case 'success': return 'text-green-400';
      case 'failed': return 'text-danger';
      case 'testing': return 'text-accent';
      default: return 'text-text-muted';
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-lg border border-border-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="settings-modal-title" className="text-xl font-bold text-accent">Connection Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* ComfyUI Section */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">ComfyUI Server</h3>
            <p className="text-sm text-text-secondary mb-4">
              Configure the address of your local or remote ComfyUI server.
            </p>
            <label htmlFor="comfyui-url" className="block text-sm font-medium text-text-secondary">
              Server URL
            </label>
            <div className="flex gap-2 items-center mt-1">
              <input
                type="text"
                id="comfyui-url"
                value={comfyUrl}
                onChange={(e) => {
                  setComfyUrl(e.target.value);
                  if (comfyStatus !== 'testing') setComfyStatus('idle');
                }}
                className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
                placeholder="http://127.0.0.1:8188"
              />
              <button
                onClick={handleTestConnection}
                disabled={comfyStatus === 'testing'}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
              >
                {comfyStatus === 'testing' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : "Test"}
              </button>
            </div>
            {comfyStatus !== 'idle' && (
              <p className={`text-sm text-center font-medium mt-2 ${getStatusColor()}`}>
                {comfyStatusMessage || (comfyStatus === 'testing' ? 'Testing connection...' : '')}
              </p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Ollama Server</h3>
            <p className="text-sm text-text-secondary mb-4">Connect to Ollama Desktop for local prompt analysis and Magic Soup.</p>
            <label htmlFor="ollama-url" className="block text-sm font-medium text-text-secondary">Server URL</label>
            <div className="mt-1 flex items-center gap-2">
              <input id="ollama-url" type="text" value={ollamaUrl} onChange={(event) => { setOllamaUrl(event.target.value); setOllamaStatus('idle'); }} className="block w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" placeholder={DEFAULT_OLLAMA_URL} />
              <button type="button" onClick={handleTestOllama} disabled={ollamaStatus === 'testing' || !ollamaUrl.trim()} className="flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-bg-tertiary px-4 py-2 font-semibold text-text-secondary hover:bg-bg-tertiary-hover disabled:opacity-50">
                {ollamaStatus === 'testing' ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : 'Test'}
              </button>
            </div>
            <label htmlFor="ollama-model" className="mt-3 block text-sm font-medium text-text-secondary">Default Model</label>
            <input id="ollama-model" type="text" list="ollama-model-options" value={ollamaModel} onChange={(event) => setOllamaModel(event.target.value)} className="mt-1 block w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm" placeholder={DEFAULT_OLLAMA_MODEL} />
            <datalist id="ollama-model-options">{ollamaModels.map((model) => <option key={model} value={model} />)}</datalist>
            {ollamaStatus !== 'idle' && <p className={`mt-2 text-sm font-medium ${ollamaStatus === 'success' ? 'text-green-400' : ollamaStatus === 'failed' ? 'text-danger' : 'text-accent'}`}>{ollamaStatusMessage || 'Testing connection...'}</p>}
          </div>

          {/* Gemini API Key Section */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Gemini API Key</h3>
            <p className="text-sm text-text-secondary mb-4">
              Enter your Google Gemini API Key. This is required for AI generation features.
            </p>
            <label htmlFor="gemini-api-key" className="block text-sm font-medium text-text-secondary">
              API Key
            </label>
            <input
              type="password"
              id="gemini-api-key"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
              placeholder="AIzaSy..."
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Mammouth AI API</h3>
            <p className="text-sm text-text-secondary mb-4">
              Add an API key from Mammouth to access its image models and usage tracking.
            </p>
            <label htmlFor="mammouth-api-key" className="block text-sm font-medium text-text-secondary">
              API Key
            </label>
            <div className="flex gap-2 items-center mt-1">
              <input
                type="password"
                id="mammouth-api-key"
                value={mammouthApiKey}
                onChange={(event) => {
                  setMammouthApiKey(event.target.value);
                  setMammouthStatus('idle');
                }}
                className="block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
                placeholder="Mammouth API key"
              />
              <button
                onClick={handleTestMammouth}
                disabled={mammouthStatus === 'testing' || !mammouthApiKey.trim()}
                className="flex-shrink-0 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50"
              >
                {mammouthStatus === 'testing' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : 'Test'}
              </button>
            </div>
            {mammouthStatus !== 'idle' && (
              <p className={`text-sm font-medium mt-2 ${mammouthStatus === 'success' ? 'text-green-400' : mammouthStatus === 'failed' ? 'text-danger' : 'text-accent'}`}>
                {mammouthStatusMessage || 'Testing connection...'}
              </p>
            )}
          </div>

          {/* Google Drive Section */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Google Drive Integration</h3>
            <p className="text-sm text-text-secondary mb-4">
              Provide a Google Cloud OAuth Client ID to enable library syncing with Google Drive.
            </p>
            <label htmlFor="google-client-id" className="block text-sm font-medium text-text-secondary">
              Google Client ID
            </label>
            <input
              type="text"
              id="google-client-id"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
              placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
            />
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
              className="w-full font-bold py-3 px-4 rounded-lg transition-colors duration-200"
            >
              Save and Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
