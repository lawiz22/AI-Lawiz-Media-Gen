import React from 'react';
import { CloseIcon, WarningIcon } from './icons';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isDanger = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-bg-secondary w-full max-w-md p-6 rounded-2xl shadow-lg border border-border-primary" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                        {isDanger && <WarningIcon className="w-6 h-6 text-danger" />}
                        {title}
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover transition-colors">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-text-secondary mb-6">{message}</p>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-lg hover:bg-bg-tertiary-hover text-sm font-semibold transition-colors">
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => { onConfirm(); onClose(); }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isDanger
                                ? 'bg-danger text-white hover:bg-red-600'
                                : 'bg-accent text-accent-text hover:bg-accent-hover'
                            }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
