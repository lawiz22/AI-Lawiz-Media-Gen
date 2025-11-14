import React, { useState, useCallback } from 'react';
import { UploadedFile } from '../../groupPhotoFusion/types';
import { UploadCloudIcon, LibraryIcon } from '../icons';

interface FileUploadProps {
  onFilesChange: (files: UploadedFile[]) => void;
  onOpenLibrary: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFilesChange, onOpenLibrary }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    setError(null);
    if (!files || files.length === 0) return;

    if (files.length < 2 || files.length > 4) {
      setError("Please upload between 2 and 4 subject photos.");
      return;
    }

    const uploadedFiles: UploadedFile[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      personaId: 'default',
    }));
    onFilesChange(uploadedFiles);
  }, [onFilesChange]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
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
    // This is necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`relative block w-full border-2 ${isDragging ? 'border-accent' : 'border-border-primary'} border-dashed rounded-lg p-12 text-center hover:border-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent transition-colors duration-300 bg-bg-tertiary`}
      >
        <input
          type="file"
          id="gpf-file-upload"
          multiple
          accept="image/png, image/jpeg, image/webp"
          onChange={handleChange}
          className="sr-only"
        />
        <label htmlFor="gpf-file-upload" className="cursor-pointer">
          <UploadCloudIcon className="mx-auto h-12 w-12 text-text-muted" />
          <span className="mt-2 block text-sm font-medium text-text-secondary">
            Drag & drop subject photos here, or <span className="text-accent">click to select</span>
          </span>
          <p className="mt-1 text-xs text-text-muted">
            Upload 2 to 4 subject photos (PNG, JPG, WEBP)
          </p>
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-center">
        <span className="h-px flex-grow bg-border-primary"></span>
        <span className="mx-4 text-sm font-semibold text-text-muted">OR</span>
        <span className="h-px flex-grow bg-border-primary"></span>
      </div>

      <button
        onClick={onOpenLibrary}
        className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-bg-tertiary text-text-secondary font-semibold rounded-lg hover:bg-bg-tertiary-hover transition-colors"
      >
        <LibraryIcon className="w-5 h-5" />
        Import from Library
      </button>
    </div>
  );
};

export default FileUpload;