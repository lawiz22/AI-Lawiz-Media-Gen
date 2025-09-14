import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon, FolderIcon } from './icons';

interface LocalPathModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
  onSavePath: (path: string) => void;
  onDisconnectPath: () => void;
}

export const LocalPathModal: React.FC<LocalPathModalProps> = ({ 
  isOpen, 
  onClose, 
  currentPath, 
  onSavePath, 
  onDisconnectPath 
}) => {
  const [path, setPath] = useState(currentPath || '');

  useEffect(() => {
    if (isOpen) {
      setPath(currentPath || '');
    }
  }, [isOpen, currentPath]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      onSavePath(path.trim());
      onClose();
    }
  };

  const handleDisconnect = () => {
    onDisconnectPath();
    onClose();
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
      aria-labelledby="local-path-modal-title"
      onClick={onClose}
    >
      <div 
        className="bg-bg-secondary w-full max-w-lg p-6 rounded-2xl shadow-lg border border-border-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="local-path-modal-title" className="text-xl font-bold text-accent flex items-center gap-2">
            <FolderIcon className="w-6 h-6" />
            Local Library Path
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-sm text-text-secondary mb-4">
          Enter the path to your local library folder.
          <br />
          <strong className="text-text-primary">Note:</strong> Due to browser security, this path is for reference only. All data is saved securely in your browser's local database.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="local-path-input" className="block text-sm font-medium text-text-secondary">
                Library Folder Path
              </label>
              <input
                type="text"
                id="local-path-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent shadow-sm"
                placeholder="e.g., C:\Users\YourUser\AI_Creations"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              {currentPath && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex-1 bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors duration-200"
                >
                  Disconnect
                </button>
              )}
              <button
                type="submit"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
                className="flex-1 font-bold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Save Path
              </button>
            </div>
        </form>
      </div>
    </div>
  );
};
