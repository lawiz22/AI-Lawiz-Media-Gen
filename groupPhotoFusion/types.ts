export interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  personaId: string;
}

export interface Pose {
  id: string;
  title: string;
  description: string;
  getPrompt: (personaDescriptions: string[], quality: Quality, hasBackground: boolean) => string;
}

export type Quality = 'Standard' | 'High' | 'Ultra High';

export interface GeneratePhotoResult {
  imageBase64: string;
  responseText: string;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface Persona {
    id: string;
    name: string;
    description: string;
    type: 'default' | 'male' | 'female';
}

export interface GeneratedImage {
  id: string;
  base64: string | null;
  status: 'generating' | 'success' | 'error';
  error?: string;
  saveStatus: 'idle' | 'saving' | 'saved';
}

export interface DebugInfo {
  prompt: string;
  subjects: UploadedFile[];
  background: UploadedFile | null;
  quality: Quality;
  apiResponseText: string;
  generatedImageBase64: string;
}