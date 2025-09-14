
import React from 'react';
import { SpinnerIcon } from './icons';

interface LoadingStateProps {
  message: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8">
      <SpinnerIcon className="w-12 h-12 text-accent animate-spin" />
      <h2 className="text-2xl font-semibold text-text-primary mt-6">Processing Your Image...</h2>
      <p className="text-text-secondary mt-2 max-w-sm">{message || 'Please wait a moment.'}</p>
    </div>
  );
};
