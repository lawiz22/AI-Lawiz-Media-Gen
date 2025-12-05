import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, SaveIcon } from './icons';

interface PresetSaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
    initialName?: string;
}

export const PresetSaveModal: React.FC<PresetSaveModalProps> = ({ isOpen, onClose, onSave, initialName = '' }) => {
    const [name, setName] = useState(initialName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, initialName]);

    const handleSave = () => {
        if (name.trim()) {
            onSave(name.trim());
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-bg-secondary w-full max-w-md p-6 rounded-2xl shadow-lg border border-border-primary" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-accent">Save Preset</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover transition-colors">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Preset Name</label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter preset name..."
                            className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                        />
                        <p className="text-xs text-text-muted mt-1">The model name will be automatically prefixed.</p>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={onClose} className="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-lg hover:bg-bg-tertiary-hover text-sm font-semibold transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={!name.trim()} className="px-4 py-2 bg-accent text-accent-text rounded-lg hover:bg-accent-hover text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
                            <SaveIcon className="w-4 h-4" /> Save Preset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
