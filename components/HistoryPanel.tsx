import React, { useState, useEffect, useCallback } from 'react';
import type { HistoryItem } from '../types';
import { getHistory, deleteHistoryItem, clearHistory } from '../services/historyService';
import { CloseIcon, SpinnerIcon, TrashIcon, LoadIcon, HistoryIcon } from './icons';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadHistoryItem: (item: HistoryItem) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, onLoadHistoryItem }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    const items = getHistory();
    setHistory(items);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, loadHistory]);

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this history item?')) {
      deleteHistoryItem(id);
      loadHistory();
    }
  };
  
  const handleClearAll = () => {
     if (window.confirm('Are you sure you want to delete your entire generation history? This cannot be undone.')) {
        clearHistory();
        loadHistory();
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
      aria-labelledby="history-modal-title"
      onClick={onClose}
    >
      <div 
        className="bg-bg-secondary w-full max-w-2xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 id="history-modal-title" className="text-xl font-bold text-accent flex items-center gap-2">
            <HistoryIcon className="w-6 h-6" />
            Generation History
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
            {isLoading ? (
                <div className="flex justify-center items-center h-full">
                    <SpinnerIcon className="w-8 h-8 text-accent animate-spin" />
                </div>
            ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-text-secondary p-8">
                    <HistoryIcon className="w-16 h-16 text-border-primary mb-4" />
                    <h3 className="text-lg font-bold text-text-primary">No History Yet</h3>
                    <p>Your generated media will appear here automatically.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {history.map(item => (
                        <div key={item.id} className="bg-bg-tertiary p-3 rounded-lg flex items-center gap-4">
                            <img src={item.sourceImage} alt="Source" className="w-16 h-16 object-cover rounded-md flex-shrink-0 bg-bg-primary"/>
                            <div className="flex-grow">
                                <p className="text-sm font-semibold text-text-primary">
                                    {new Date(item.timestamp).toLocaleString()}
                                </p>
                                <p className="text-xs text-text-muted">
                                    {item.options.provider.toUpperCase()} &bull; {item.generatedImages.length} images
                                </p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <button
                                    onClick={() => onLoadHistoryItem(item)}
                                    title="Load Generation"
                                    className="p-2 rounded-full bg-bg-secondary text-text-secondary hover:bg-accent hover:text-accent-text transition-colors"
                                >
                                    <LoadIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    title="Delete Item"
                                    className="p-2 rounded-full bg-bg-secondary text-text-secondary hover:bg-danger hover:text-white transition-colors"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
        
        {history.length > 0 && (
             <div className="mt-4 pt-4 border-t border-border-primary flex-shrink-0">
                <button
                    onClick={handleClearAll}
                    className="w-full flex items-center justify-center gap-2 text-sm bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors duration-200"
                >
                    <TrashIcon className="w-4 h-4" />
                    Clear All History
                </button>
            </div>
        )}
      </div>
    </div>
  );
};