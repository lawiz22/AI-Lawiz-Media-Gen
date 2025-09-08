export interface GenerationOptions {
  numImages: number;
  background: string;
  aspectRatio: string;
  customBackground?: string;
  consistentBackground?: boolean;
  clothing: 'original' | 'image' | 'prompt';
  customClothingPrompt?: string;
  randomizeClothing?: boolean;
  poseMode: 'random' | 'select';
  poseSelection: string[];
  photoStyle: string;
}