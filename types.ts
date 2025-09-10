export interface GenerationOptions {
  provider: 'gemini' | 'comfyui';
  numImages: number;
  background: string;
  aspectRatio: string;
  customBackground?: string;
  consistentBackground?: boolean;
  clothing: 'original' | 'image' | 'prompt';
  customClothingPrompt?: string;
  randomizeClothing?: boolean;
  clothingStyleConsistency?: 'varied' | 'strict';
  poseMode: 'random' | 'select' | 'prompt';
  poseSelection: string[];
  photoStyle: string;
  imageStyle: string;
  eraStyle: string;
  
  // ComfyUI specific options
  comfyModelType?: 'sdxl' | 'flux';
  comfyFluxGuidance?: number;
  comfyModel?: string;
  comfySteps?: number;
  comfyCfg?: number;
  comfySampler?: string;
  comfyScheduler?: string;
  comfyPrompt?: string;
  comfyFluxNodeName?: string | null;
}

export interface User {
  username: string;
  password?: string; // Not always present, e.g., when just identifying the current user
  role: 'admin' | 'user';
}

export interface HistoryItem {
  id: number; // Using timestamp for unique ID
  timestamp: string;
  sourceImage: string; // as data URL
  options: GenerationOptions;
  generatedImages: string[];
}