
import React, { useEffect } from 'react';
import { CloseIcon, WarningIcon } from './icons';

interface ErrorModalProps {
  title: string;
  message: string;
  onClose: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({ title, message, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        onClick={onClose}
    >
      <div 
          className="bg-bg-secondary w-full max-w-md p-6 rounded-2xl shadow-lg border border-border-primary"
          onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className="bg-danger-bg p-2 rounded-full">
                    <WarningIcon className="w-6 h-6 text-danger" />
                </div>
                <h2 id="error-modal-title" className="text-xl font-bold text-text-primary">{title}</h2>
            </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-60 overflow-y-auto pr-2">
          {message}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-accent text-accent-text font-semibold py-2 px-5 rounded-lg hover:bg-accent-hover transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
