import React, { useCallback, useState } from 'react';
import { UploadedFile } from '../../groupPhotoFusion/types';
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
      file,
      previewUrl: URL.createObjectURL(file),
      personaId: '',
    };
    onBackgroundChange(uploadedFile);
  }, [onBackgroundChange]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDisabled) return;
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
  };

  if (isDisabled) {
    return (
      <div className="w-full max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-text-primary mb-4 text-center">Custom Background</h2>
          <div className="text-center p-6 bg-bg-tertiary rounded-lg">
              <p className="text-text-secondary">A custom background is not available for this scenario.</p>
          </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold text-text-primary mb-4 text-center">Add a Custom Background (Optional)</h2>
      {backgroundFile ? (
        <div className="relative group w-full aspect-video mx-auto max-w-lg">
            <img 
                src={backgroundFile.previewUrl} 
                alt="Background preview" 
                className="w-full h-full object-cover rounded-lg shadow-md"
            />
            <button
                onClick={onRemoveBackground}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-black focus:ring-accent"
                aria-label="Remove background image"
            >
                <CloseIcon className="h-5 w-5" />
            </button>
        </div>
      ) : (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className={`relative block w-full border-2 ${isDragging ? 'border-accent' : 'border-border-primary'} border-dashed rounded-lg p-8 text-center hover:border-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent transition-colors duration-300 bg-bg-tertiary`}
        >
            <input
                type="file"
                id="background-upload"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleChange}
                className="sr-only"
            />
            <label htmlFor="background-upload" className="cursor-pointer">
                <ImageIcon className="mx-auto h-12 w-12 text-text-muted" />
                <span className="mt-2 block text-sm font-medium text-text-secondary">
                    Drag & drop a background here, or click to select
                </span>
                <p className="mt-1 text-xs text-text-muted">
                    PNG, JPG, WEBP
                </p>
            </label>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger text-center">{error}</p>}
    </div>
  );
};

export default BackgroundUpload;
