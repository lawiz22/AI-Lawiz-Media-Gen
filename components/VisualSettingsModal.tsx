import React from 'react';
import { CloseIcon } from './icons';

interface VisualSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTheme: string;
    setTheme: (theme: string) => void;
    fontSize: number;
    setFontSize: (size: number) => void;
}

const themes = [
    {
        name: 'cyberpunk',
        label: 'Cyberpunk',
        colors: { bg: '#06b6d4', ring: '#0e7490' },
    },
    {
        name: 'synthwave',
        label: 'Synthwave',
        colors: { bg: '#ec4899', ring: '#be185d' },
    },
    {
        name: 'studio-light',
        label: 'Studio Light',
        colors: { bg: '#2563eb', ring: '#1e40af' },
    },
    {
        name: '70s-groove',
        label: '70s Groove',
        colors: { bg: '#FF7043', ring: '#E64A19' },
    },
];

export const VisualSettingsModal: React.FC<VisualSettingsModalProps> = ({
    isOpen,
    onClose,
    currentTheme,
    setTheme,
    fontSize,
    setFontSize
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-bg-secondary border border-border-primary rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between p-4 border-b border-border-primary bg-bg-tertiary/50">
                    <h2 className="text-lg font-bold text-text-primary">Visual Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-text-muted hover:text-text-primary transition-colors"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* Theme Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-text-secondary">Color Theme</label>
                        <div className="grid grid-cols-2 gap-3">
                            {themes.map((theme) => (
                                <button
                                    key={theme.name}
                                    onClick={() => setTheme(theme.name)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${currentTheme === theme.name
                                            ? 'bg-bg-tertiary border-accent ring-1 ring-accent'
                                            : 'bg-bg-primary border-border-primary hover:border-accent/50'
                                        }`}
                                >
                                    <div
                                        className="w-6 h-6 rounded-full shadow-sm"
                                        style={{ backgroundColor: theme.colors.bg }}
                                    />
                                    <span className={`text-sm font-medium ${currentTheme === theme.name ? 'text-accent' : 'text-text-primary'
                                        }`}>
                                        {theme.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Font Size Selection */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-text-secondary">Interface Scale (Font Size)</label>
                            <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-1 rounded">{fontSize}px</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className="text-xs text-text-muted">Small</span>
                            <input
                                type="range"
                                min="12"
                                max="18"
                                step="1"
                                value={fontSize}
                                onChange={(e) => setFontSize(parseInt(e.target.value))}
                                className="flex-grow h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                            <span className="text-xs text-text-muted">Large</span>
                        </div>
                        <div className="flex justify-between text-xs text-text-muted px-1">
                            <span>12px</span>
                            <span>14px</span>
                            <span>16px</span>
                            <span>18px</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border-primary bg-bg-tertiary/30 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-accent text-accent-text rounded-lg hover:bg-accent-hover transition-colors font-medium text-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
