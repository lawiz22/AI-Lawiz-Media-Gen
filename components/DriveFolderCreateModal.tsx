import React, { useEffect, useRef, useState } from 'react';
import { CloseIcon, FolderPlusIcon, SpinnerIcon } from './icons';

interface DriveFolderCreateModalProps {
    isOpen: boolean;
    parentName: string;
    onClose: () => void;
    onCreate: (name: string) => Promise<void>;
}

export const DriveFolderCreateModal: React.FC<DriveFolderCreateModalProps> = ({ isOpen, parentName, onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setIsCreating(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleCreate = async () => {
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;
        setIsCreating(true);
        try {
            await onCreate(trimmedName);
            onClose();
        } catch {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in" onClick={isCreating ? undefined : onClose}>
            <div className="w-full max-w-md rounded-lg border border-border-primary bg-bg-secondary p-6 shadow-lg" onClick={event => event.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-accent">Create Drive Folder</h2>
                    <button onClick={onClose} disabled={isCreating} title="Close" className="rounded-full p-1 text-text-secondary hover:bg-bg-tertiary-hover disabled:opacity-50">
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </div>
                <label className="mb-1 block text-sm font-medium text-text-secondary" htmlFor="drive-folder-name">Folder name</label>
                <input
                    ref={inputRef}
                    id="drive-folder-name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter') void handleCreate();
                        if (event.key === 'Escape' && !isCreating) onClose();
                    }}
                    disabled={isCreating}
                    placeholder="New library folder"
                    className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm focus:border-accent focus:ring-accent disabled:opacity-50"
                />
                <p className="mt-2 text-xs text-text-muted">Created inside “{parentName}” and selected as the new sync destination.</p>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isCreating} className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-tertiary-hover disabled:opacity-50">Cancel</button>
                    <button onClick={() => void handleCreate()} disabled={!name.trim() || isCreating} className="flex min-w-24 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-text hover:bg-accent-hover disabled:opacity-50">
                        {isCreating ? <SpinnerIcon className="h-4 w-4" /> : <FolderPlusIcon className="h-4 w-4" />}
                        Create
                    </button>
                </div>
            </div>
        </div>
    );
};