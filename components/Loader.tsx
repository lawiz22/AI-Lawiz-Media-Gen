import React from 'react';
import { SpinnerIcon } from './icons';

interface LoaderProps {
  message?: string;
  progress: number; // A value from 0 to 1
}

export const Loader: React.FC<LoaderProps> = ({ message, progress }) => {
  const fillPercentage = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-md">
      <div className="w-full bg-bg-tertiary/50 rounded-xl border-2 border-border-primary shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-accent uppercase tracking-widest flex items-center gap-2">
                <SpinnerIcon className="w-5 h-5 animate-spin" />
                Generating
            </h3>
            <p className="text-3xl font-bold font-mono text-text-primary">{fillPercentage}%</p>
        </div>

        <div className="h-4 w-full bg-bg-primary rounded-full overflow-hidden border border-border-primary/50 mb-4">
            <div
                className="h-full bg-accent rounded-full transition-all duration-300 ease-out shadow-[0_0_15px_var(--color-accent)]"
                style={{ width: `${fillPercentage}%` }}
            />
        </div>

        <p className="text-sm text-text-secondary h-5 truncate" title={message}>
          {message || 'Initializing...'}
        </p>
      </div>
    </div>
  );
};
