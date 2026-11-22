import React, { useEffect, useRef, useState } from 'react';
import { UploadIcon } from './icons';

interface ImageUploaderProps {
  label?: string;
  id: string;
  onImageUpload: (file: File | null) => void;
  onImagesUpload?: (files: File[]) => void;
  sourceFile?: File | null;
  disabled?: boolean;
  infoText?: string;
  multiple?: boolean;
}

const images = (list: FileList | null) => Array.from(list || []).filter(file => file.type.startsWith('image/'));

/** Drop zone or file picker for images; shows the current image when one is given. */
export const ImageUploader: React.FC<ImageUploaderProps> = ({ label, id, onImageUpload, onImagesUpload, sourceFile, disabled = false, infoText, multiple = false }) => {
  const [hover, setHover] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const shown = !multiple && sourceFile?.type.startsWith('image/') ? sourceFile : null;
  const rejected = useRef<File | null>(null);

  useEffect(() => {
    if (!multiple && sourceFile && !sourceFile.type.startsWith('image/') && rejected.current !== sourceFile) {
      rejected.current = sourceFile;
      onImageUpload(null);
    }
  }, [multiple, sourceFile, onImageUpload]);

  useEffect(() => {
    if (!shown) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(shown);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [shown]);

  const accept = (list: FileList | null) => {
    if (disabled) return;
    const picked = images(list);
    if (multiple && onImagesUpload) onImagesUpload(picked);
    else onImageUpload(picked[0] || null);
  };

  const frame = disabled ? 'cursor-not-allowed opacity-50' : hover ? 'border-accent bg-bg-tertiary' : 'cursor-pointer hover:bg-bg-tertiary';
  return (
    <div className="min-w-0">
      {label && <label htmlFor={id} className="mb-2 block text-sm font-medium text-text-secondary">{label}</label>}
      <label htmlFor={disabled ? undefined : id}
        className={`relative flex h-48 w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border-primary transition-colors ${frame}`}
        onDragOver={event => { event.preventDefault(); if (!disabled) setHover(true); }}
        onDragLeave={event => { event.preventDefault(); setHover(false); }}
        onDrop={event => { event.preventDefault(); setHover(false); accept(event.dataTransfer.files); }}>
        {previewUrl
          ? <img src={previewUrl} alt="Selected image" className="h-full w-full object-contain p-1" />
          : <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-text-secondary">
              <UploadIcon className="h-8 w-8" />
              <span>Drop {multiple ? 'images' : 'an image'} here or <span className="font-semibold text-accent">browse</span></span>
              <span className="text-xs text-text-muted">{infoText || 'PNG, JPG or WEBP'}</span>
            </span>}
        <input id={id} type="file" accept="image/*" multiple={multiple} disabled={disabled} className="hidden"
          onChange={event => { accept(event.target.files); event.target.value = ''; }} />
      </label>
      {shown && <p className="mt-1 truncate text-xs text-text-muted">{shown.name}</p>}
    </div>
  );
};
