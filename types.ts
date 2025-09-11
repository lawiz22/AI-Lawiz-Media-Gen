export interface GenerationOptions {
  provider: 'gemini' | 'comfyui';
  numImages: number;
  background: string;
  aspectRatio: string;
  customBackground?: string;
  consistentBackground?: boolean;
  clothing: 'original' | 'image' | 'prompt' | 'random';
  customClothingPrompt?: string;
  clothingStyleConsistency?: 'varied' | 'strict';
  poseMode: 'random' | 'select' | 'prompt';
  poseSelection: string[];
  photoStyle: string;
  imageStyle: string;
  eraStyle: string;
  creativity?: number;
  addTextToImage?: boolean;
  textOnImagePrompt?: string;
  textObjectPrompt?: string;

  // ComfyUI specific options
  comfyModelType?: 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux';
  comfyFluxGuidance?: number;
  comfyModel?: string;
  comfySteps?: number;
  comfyCfg?: number;
  comfySampler?: string;
  comfyScheduler?: string;
  comfyPrompt?: string;
  comfyNegativePrompt?: string;
  comfyFluxNodeName?: string | null;

  // ComfyUI WAN 2.2 specific options
  comfyWanHighNoiseModel?: string;
  comfyWanLowNoiseModel?: string;
  comfyWanClipModel?: string;
  comfyWanVaeModel?: string;
  comfyWanUseFusionXLora?: boolean;
  comfyWanFusionXLoraStrength?: number;
  comfyWanFusionXLoraName?: string;
  comfyWanUseLightningLora?: boolean;
  comfyWanLightningLoraStrength?: number;
  comfyWanLightningLoraNameHigh?: string;
  comfyWanLightningLoraNameLow?: string;
  comfyWanUseStockPhotoLora?: boolean;
  comfyWanStockPhotoLoraStrength?: number;
  comfyWanStockPhotoLoraNameHigh?: string;
  comfyWanStockPhotoLoraNameLow?: string;
  comfyWanRefinerStartStep?: number;
  
  // ComfyUI Nunchaku Kontext Flux specific options
  comfyNunchakuModel?: string;
  comfyNunchakuClipL?: string;
  comfyNunchakuT5XXL?: string;
  comfyNunchakuVae?: string;
  comfyNunchakuUseTurboLora?: boolean;
  comfyNunchakuTurboLoraName?: string;
  comfyNunchakuTurboLoraStrength?: number;
  comfyNunchakuUseNudifyLora?: boolean;
  comfyNunchakuNudifyLoraName?: string;
  comfyNunchakuNudifyLoraStrength?: number;
  comfyNunchakuUseDetailLora?: boolean;
  comfyNunchakuDetailLoraName?: string;
  comfyNunchakuDetailLoraStrength?: number;
  comfyFluxGuidanceKontext?: number;
  comfyNunchakuCacheThreshold?: number;
  comfyNunchakuCpuOffload?: 'auto' | 'enable' | 'disable';
  comfyNunchakuAttention?: string;
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

export interface VersionInfo {
  version: string;
  date: string;
  changes: string;
}