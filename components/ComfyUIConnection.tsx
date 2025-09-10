
import React, { useState, useEffect, useCallback } from 'react';
import { checkConnection } from '../services/comfyUIService';
import { CloseIcon, SpinnerIcon } from './icons';

interface ComfyUIConnectionProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl: string;
  onSaveUrl: (url: string) => void;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

export const ComfyUIConnection: React.FC<ComfyUIConnectionProps> = ({ isOpen, onClose, initialUrl, onSaveUrl }) => {
  const [url, setUrl] = useState<string>(initialUrl || 'http://127.0.0.1:8188');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Effect to sync the internal URL state if the modal is reopened
  // with a different URL from the parent component.
  useEffect(() => {
    if (isOpen) {
        setUrl(initialUrl || 'http://127.0.0.1:8188');
        setStatus('idle'); // Reset status when opening
    }
  }, [initialUrl, isOpen]);

  const handleTestConnection = async () => {
    setStatus('testing');
    setStatusMessage('');
    const result = await checkConnection(url);
    if (result.success) {
      setStatus('success');
      setStatusMessage('Connection successful!');
    } else {
      setStatus('failed');
      setStatusMessage(result.error || 'Failed to connect.');
    }
  };
  
  const handleSave = () => {
    onSaveUrl(url);
    setStatus('success');
    setStatusMessage('URL saved!');
    setTimeout(() => {
        onClose();
    }, 1000); // Close modal automatically after 1 second
  };

  const getStatusColor = () => {
    switch (status) {
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
      aria-labelledby="comfy-modal-title"
      onClick={onClose}
    >
      <div 
        className="bg-bg-secondary w-full max-w-lg p-6 rounded-2xl shadow-lg border border-border-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="comfy-modal-title" className="text-xl font-bold text-accent">ComfyUI Connection</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-sm text-text-secondary mb-4">
          Configure the address of your local or remote ComfyUI server to enable workflow exporting.
        </p>

        <div className="space-y-4">
            <div>
              <label htmlFor="comfyui-url" className="block text-sm font-medium text-text-secondary">
                Server URL
              </label>
              <input
                type="text"
                id="comfyui-url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (status !== 'testing') setStatus('idle');
                }}
                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
                placeholder="http://127.0.0.1:8188"
              />
            </div>
            
            {status !== 'idle' && (
              <p className={`text-sm text-center font-medium ${getStatusColor()}`}>
                {status === 'testing' ? <SpinnerIcon className="inline w-4 h-4 mr-2 animate-spin" /> : null}
                {statusMessage || (status === 'testing' ? 'Testing connection...' : '')}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleTestConnection}
                disabled={status === 'testing'}
                className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
              >
                 {status === 'testing' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
                 Test Connection
              </button>
              <button
                onClick={handleSave}
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                className="flex-1 font-bold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Save and Close
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};
