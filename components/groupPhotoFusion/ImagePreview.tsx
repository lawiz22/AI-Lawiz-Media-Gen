import React from 'react';
import { UploadedFile } from '../../groupPhotoFusion/types';
import { PERSONAS } from '../../groupPhotoFusion/constants';
import { CloseIcon, LibraryIcon, UploadCloudIcon } from '../icons';

interface ImagePreviewProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  onPersonaChange: (id: string, personaId: string) => void;
  onCharacterNameChange: (id: string, characterName: string) => void;
  onRemoveAll: () => void;
  onAddLocalFiles: (files: FileList | null) => void;
  onOpenLibrary: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ files, onRemove, onPersonaChange, onCharacterNameChange, onRemoveAll, onAddLocalFiles, onOpenLibrary }) => {
  return (
    <div className="mb-8">
        <div className="flex justify-center items-center mb-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Your Subjects ({files.length}/4)</h2>
            {files.length > 0 && (
                <div className="ml-4 flex items-center gap-4">
                  <input
                    type="file"
                    id="gpf-add-file-upload"
                    multiple
                    accept="image/png, image/jpeg, image/webp"
                    onChange={(event) => {
                      onAddLocalFiles(event.target.files);
                      event.target.value = '';
                    }}
                    className="sr-only"
                    disabled={files.length >= 4}
                  />
                  <label
                    htmlFor="gpf-add-file-upload"
                    className={`flex items-center gap-1 text-sm text-accent transition-colors ${files.length >= 4 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:underline'}`}
                    aria-label="Add subjects from computer"
                  >
                    <UploadCloudIcon className="w-4 h-4" /> + Computer
                  </label>
                    <button
                        onClick={onOpenLibrary}
                        className="text-sm text-accent hover:underline transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                        aria-label="Import subject from library"
                        disabled={files.length >= 4}
                    >
                        <LibraryIcon className="w-4 h-4" /> + Import
                    </button>
                    <button
                        onClick={onRemoveAll}
                        className="text-sm text-text-secondary hover:text-accent underline transition-colors"
                        aria-label="Remove all uploaded subjects"
                    >
                        Remove All
                    </button>
                </div>
            )}
        </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {files.map((uploadedFile, index) => (
          <div key={uploadedFile.id}>
            <div className="relative group aspect-square">
              <img
                src={uploadedFile.previewUrl}
                alt={`Uploaded subject ${index + 1}`}
                className="w-full h-full object-cover rounded-lg shadow-md"
              />
              <button
                onClick={() => onRemove(uploadedFile.id)}
                className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-black focus:ring-accent"
                aria-label={`Remove subject ${index + 1}`}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2">
                <label htmlFor={`persona-select-${uploadedFile.id}`} className="sr-only">Select facial expression for subject {index + 1}</label>
                <select
                    id={`persona-select-${uploadedFile.id}`}
                    value={uploadedFile.personaId}
                    onChange={(e) => onPersonaChange(uploadedFile.id, e.target.value)}
                    className="w-full bg-bg-tertiary border border-border-primary text-text-primary text-sm rounded-lg focus:ring-accent focus:border-accent block p-2.5"
                >
                  {PERSONAS.map((persona) => (
                    <option key={persona.id} value={persona.id}>{persona.name}</option>
                  ))}
                </select>
                <label htmlFor={`character-name-${uploadedFile.id}`} className="mt-2 block text-left text-xs font-medium text-text-secondary">Known person (optional)</label>
                <input
                  id={`character-name-${uploadedFile.id}`}
                  type="text"
                  value={uploadedFile.characterName || ''}
                  onChange={(event) => onCharacterNameChange(uploadedFile.id, event.target.value)}
                  placeholder="e.g. Elvis Presley"
                  maxLength={80}
                  className="mt-1 block w-full rounded-lg border border-border-primary bg-bg-tertiary p-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-accent"
                />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImagePreview;