import React from 'react';
import { SpinnerIcon, CloseIcon } from './icons';

interface LoaderProps {
  message?: string;
  /** Between 0 and 1. */
  progress: number;
  onCancel?: () => void;
}

/** Progress card shown while a generation runs. */
export const Loader: React.FC<LoaderProps> = ({ message, progress, onCancel }) => {
  const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <section aria-label="Generation progress" className="w-full max-w-md space-y-4 rounded-xl border border-border-primary bg-bg-secondary p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <SpinnerIcon className="h-6 w-6 animate-spin text-accent" />
        <span className="flex-1 text-sm font-semibold text-text-primary">Generating</span>
        <span className="font-mono text-2xl font-bold text-accent">{percent}%</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-3 overflow-hidden rounded-full bg-bg-tertiary">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="truncate text-sm text-text-secondary" title={message}>{message || 'Starting...'}</p>
      {onCancel && (
        <button type="button" onClick={onCancel} className="mx-auto flex items-center gap-2 rounded-lg border border-danger px-5 py-2 text-sm font-semibold text-danger hover:bg-danger-bg">
          <CloseIcon className="h-4 w-4" />
          Cancel Generation
        </button>
      )}
    </section>
  );
};
