export interface GenerationOptions {
  numImages: number;
  background: string;
  aspectRatio: string;
  customBackground?: string;
  consistentBackground?: boolean;
  clothing: 'original' | 'image' | 'prompt';
  customClothingPrompt?: string;
  randomizeClothing?: boolean;
  poseMode: 'random' | 'select' | 'prompt';
  poseSelection: string[];
  photoStyle: string;
}

export interface User {
  username: string;
  password?: string; // Not always present, e.g., when just identifying the current user
  role: 'admin' | 'user';
}