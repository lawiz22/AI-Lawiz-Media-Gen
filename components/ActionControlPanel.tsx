import React from 'react';
import { GenerationOptions } from '../types';
import { GenerateIcon, ResetIcon, WorkflowIcon } from './icons';

interface ActionControlPanelProps {
    options: GenerationOptions;
    generationMode: 't2i' | 'i2i';
    onGenerate: () => void;
    onReset: () => void;
    onExportWorkflow: () => void;
    isReady: boolean;
    isDisabled: boolean;
}

export const ActionControlPanel: React.FC<ActionControlPanelProps> = ({
    options,
    generationMode,
    onGenerate,
    onReset,
    onExportWorkflow,
    isReady,
    isDisabled
}) => {
    const activeModelName = options.provider === 'gemini'
        ? (generationMode === 't2i' ? (options.geminiT2IModel || 'gemini-2.5-flash-image') : 'gemini-2.5-flash-image')
        : (options.comfyModelType || 'sdxl');

    return (
        <div className="bg-bg-secondary p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                    Active Model: <span className="text-accent font-bold">{activeModelName}</span>
                </span>
            </div>
            <div className="flex items-center gap-4 w-full sm:w-auto">
                <button
                    onClick={onReset}
                    disabled={isDisabled}
                    className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50 text-sm"
                >
                    <ResetIcon className="w-4 h-4" /> Reset
                </button>
                <button
                    onClick={onGenerate}
                    disabled={!isReady}
                    style={isReady ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                    className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 font-bold py-2 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary text-sm"
                >
                    <GenerateIcon className="w-4 h-4" /> Generate
                </button>
                {options.provider === 'comfyui' && (
                    <button
                        onClick={onExportWorkflow}
                        disabled={isDisabled}
                        className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50 text-sm"
                        title="Export Workflow JSON"
                    >
                        <WorkflowIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
};
