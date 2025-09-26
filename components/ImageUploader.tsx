import React, { useState, useCallback, ChangeEvent, DragEvent, useEffect } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  label?: string;
  id: string;
  onImageUpload: (file: File | null) => void;
  onImagesUpload?: (files: File[]) => void;
  sourceFile?: File | null;
  // Fix: Added optional 'disabled' prop to allow the uploader to be disabled, resolving the TypeScript error in parent components.
  disabled?: boolean;
  infoText?: string;
  multiple?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ label, id, onImageUpload, onImagesUpload, sourceFile, disabled = false, infoText, multiple = false }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (sourceFile && !multiple) {
      if (!sourceFile.type.startsWith('image/')) {
        onImageUpload(null);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(sourceFile);
      setFileName(sourceFile.name);
    } else {
      setPreview(null);
      setFileName('');
    }
  }, [sourceFile, onImageUpload, multiple]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    // Fix: Explicitly type `files` as `File[]` to resolve type inference issues with `FileList` elements, which caused errors on lines 43 and 45.
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (multiple && onImagesUpload) {
        onImagesUpload(files.filter(f => f.type.startsWith('image/')));
    } else {
        onImageUpload(files.find(f => f.type.startsWith('image/')) || null);
    }
    e.target.value = '';
  };
  
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    // Fix: Explicitly type `files` as `File[]` to resolve type inference issues with `FileList` elements, which caused errors on lines 68 and 70.
    const files: File[] = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (multiple && onImagesUpload) {
        onImagesUpload(files.filter(f => f.type.startsWith('image/')));
    } else {
        const imageFile = files.find(f => f.type.startsWith('image/'));
        onImageUpload(imageFile || null);
    }
  };

  return (
    <div>
      {label && <label htmlFor={id} className="block text-sm font-medium text-text-secondary mb-2">{label}</label>}
      <label
        htmlFor={disabled ? undefined : id}
        className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg transition-colors duration-200
        ${disabled 
            ? 'border-border-primary bg-bg-tertiary/50 opacity-50 cursor-not-allowed' 
            : isDragging 
                ? 'border-accent bg-bg-tertiary' 
                : 'border-border-primary bg-bg-tertiary/50 hover:bg-bg-tertiary cursor-pointer'}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {preview ? (
          <img src={preview} alt="Preview" className="object-contain w-full h-full rounded-lg p-1" />
        ) : (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-text-secondary">
            <UploadIcon className="w-8 h-8 mb-3" />
            <p className="mb-2 text-sm"><span className="font-semibold text-accent">Click to upload</span> or drag and drop</p>
            <p className="text-xs">{infoText || 'PNG, JPG, WEBP'}</p>
          </div>
        )}
        <input id={id} type="file" className="hidden" accept="image/*" onChange={onFileChange} disabled={disabled} multiple={multiple} />
      </label>
      {fileName && <p className="text-xs text-text-muted mt-1 truncate">File: {fileName}</p>}
    </div>
  );
};
