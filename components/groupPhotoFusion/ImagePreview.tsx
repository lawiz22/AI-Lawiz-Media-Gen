import React from 'react';
import { UploadedFile } from '../../groupPhotoFusion/types';
import { PERSONAS } from '../../groupPhotoFusion/constants';
import { CloseIcon, LibraryIcon } from '../icons';

interface ImagePreviewProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  onPersonaChange: (id: string, personaId: string) => void;
  onRemoveAll: () => void;
  onOpenLibrary: () => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ files, onRemove, onPersonaChange, onRemoveAll, onOpenLibrary }) => {
  const defaultPersona = PERSONAS.find(p => p.id === 'default');
  const femalePersonas = PERSONAS.filter(p => p.type === 'female');
  const malePersonas = PERSONAS.filter(p => p.type === 'male');
  
  return (
    <div className="mb-8">
        <div className="flex justify-center items-center mb-4 text-center">
            <h2 className="text-xl font-semibold text-text-primary">Your Subjects ({files.length}/4)</h2>
            {files.length > 0 && (
                <div className="ml-4 flex items-center gap-4">
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
                <label htmlFor={`persona-select-${uploadedFile.id}`} className="sr-only">Select persona for subject {index + 1}</label>
                <select
                    id={`persona-select-${uploadedFile.id}`}
                    value={uploadedFile.personaId}
                    onChange={(e) => onPersonaChange(uploadedFile.id, e.target.value)}
                    className="w-full bg-bg-tertiary border border-border-primary text-text-primary text-sm rounded-lg focus:ring-accent focus:border-accent block p-2.5"
                >
                    {defaultPersona && <option key={defaultPersona.id} value={defaultPersona.id}>{defaultPersona.name}</option>}
                    {femalePersonas.length > 0 && (
                        <optgroup label="Female">
                            {femalePersonas.map((persona) => (
                                <option key={persona.id} value={persona.id}>{persona.name}</option>
                            ))}
                        </optgroup>
                    )}
                    {malePersonas.length > 0 && (
                        <optgroup label="Male">
                            {malePersonas.map((persona) => (
                                <option key={persona.id} value={persona.id}>{persona.name}</option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImagePreview;