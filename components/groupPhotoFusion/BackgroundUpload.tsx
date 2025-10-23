import React, { useCallback, useState } from 'react';
import { UploadedFile } from '../../groupPhotoFusion/types';
// FIX: Imported missing ImageIcon.
import { CloseIcon, ImageIcon } from '../icons';

interface BackgroundUploadProps {
  backgroundFile: UploadedFile | null;
  onBackgroundChange: (file: UploadedFile) => void;
  onRemoveBackground: () => void;
  isDisabled: boolean;
}

const BackgroundUpload: React.FC<BackgroundUploadProps> = ({ backgroundFile, onBackgroundChange, onRemoveBackground, isDisabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File | null) => {
    setError(null);
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Invalid file type. Please upload a PNG, JPG, or WEBP.');
      return;
    }
    
    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      file: file,
      previewUrl: URL.createObjectURL(file),
      personaId: 'background', // Not a real persona, just for identification
    };
    onBackgroundChange(uploadedFile);
  }, [onBackgroundChange]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); if (!isDisabled) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!isDisabled) {
        handleFile(e.dataTransfer.files ? e.dataTransfer.files[0] : null);
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files ? e.target.files[0] : null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <h2 className="text-xl font-semibold text-text-primary mb-4">Add a Background (Optional)</h2>
      {backgroundFile ? (
        <div className="relative group w-full max-w-sm mx-auto">
          <img src={backgroundFile.previewUrl} alt="Background preview" className="w-full rounded-lg shadow-md" />
          {!isDisabled && (
            <button
              onClick={onRemoveBackground}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove background image"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          className={`relative block w-full border-2 ${isDragging ? 'border-accent' : 'border-border-primary'} border-dashed rounded-lg p-12 text-center ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent cursor-pointer'} transition-colors duration-300 bg-bg-tertiary`}
        >
          <input
            type="file"
            id="gpf-background-upload"
            accept="image/png, image/jpeg, image/webp"
            onChange={handleChange}
            className="sr-only"
            disabled={isDisabled}
          />
          <label htmlFor={isDisabled ? undefined : "gpf-background-upload"} className={isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
            <ImageIcon className="mx-auto h-12 w-12 text-text-muted" />
            <span className="mt-2 block text-sm font-medium text-text-secondary">
              Drag & drop a background photo, or click to select
            </span>
            <p className="mt-1 text-xs text-text-muted">
              PNG, JPG, WEBP
            </p>
          </label>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {isDisabled && !backgroundFile && <p className="mt-2 text-sm text-highlight-yellow">This pose does not support a custom background.</p>}
    </div>
  );
};

export default BackgroundUpload;
