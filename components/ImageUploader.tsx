
import React, { useState, useCallback, ChangeEvent, DragEvent } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  label: string;
  id: string;
  onImageUpload: (file: File | null) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ label, id, onImageUpload }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = useCallback((file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      onImageUpload(file);
      setFileName(file.name);
    } else {
      setPreview(null);
      onImageUpload(null);
      setFileName('');
    }
  }, [onImageUpload]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e.target.files ? e.target.files[0] : null);
  };
  
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files ? e.dataTransfer.files[0] : null);
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary mb-2">{label}</label>
      <label
        htmlFor={id}
        className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200
        ${isDragging ? 'border-accent bg-bg-tertiary' : 'border-border-primary bg-bg-tertiary/50 hover:bg-bg-tertiary'}`}
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
            <p className="text-xs">PNG, JPG, WEBP</p>
          </div>
        )}
        <input id={id} type="file" className="hidden" accept="image/*" onChange={onFileChange} />
      </label>
      {fileName && <p className="text-xs text-text-muted mt-1 truncate">File: {fileName}</p>}
    </div>
  );
};
