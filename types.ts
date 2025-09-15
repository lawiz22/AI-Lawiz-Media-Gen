import { fileToDataUrl } from './utils/imageUtils';

declare global {
  // Fix: Moved namespace declaration for `gapi` into `declare global` to make it globally available
  // in a module context, resolving the namespace error in other files.
  namespace gapi {
    namespace client {
      namespace drive {
        interface File {
          id?: string | null;
          name?: string | null;
          appProperties?: { [key:string]: string } | null;
        }
      }
    }
  }
  
  interface FileSystemFileHandle {
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
  interface Window {
    showSaveFilePicker(options?: any): Promise<FileSystemFileHandle>;
    gapi: any; // Google API Client
    google: any; // Google Identity Services
    gapiLoaded?: boolean;
    gisLoaded?: boolean;
  }
}
export interface GenerationOptions {
  provider: 'gemini' | 'comfyui';
  geminiMode?: 'i2i' | 't2i';
  geminiPrompt?: string;
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
  width?: number;
  height?: number;

  // ComfyUI specific options
  comfyModelType?: 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea';
  comfyFluxGuidance?: number;
  comfyModel?: string;
  comfySteps?: number;
  comfyCfg?: number;
  comfySampler?: string;
  comfyScheduler?: string;
  comfyPrompt?: string;
  comfyNegativePrompt?: string;
  comfyFluxNodeName?: string | null;
  comfySdxlUseLora?: boolean;
  comfySdxlLoraName?: string;
  comfySdxlLoraStrength?: number;

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
  comfyNunchakuBaseShift?: number;
  comfyNunchakuMaxShift?: number;

  // ComfyUI Flux Krea specific options
  comfyFluxKreaModel?: string;
  comfyFluxKreaClipT5?: string;
  comfyFluxKreaClipL?: string;
  comfyFluxKreaVae?: string;
  comfyFluxKreaUpscaleModel?: string;
  useP1x4r0maWomanLora?: boolean;
  p1x4r0maWomanLoraStrength?: number;
  p1x4r0maWomanLoraName?: string;
  useNippleDiffusionLora?: boolean;
  nippleDiffusionLoraStrength?: number;
  nippleDiffusionLoraName?: string;
  usePussyDiffusionLora?: boolean;
  pussyDiffusionLoraStrength?: number;
  pussyDiffusionLoraName?: string;
  comfyFluxKreaUseUpscaler?: boolean;
  comfyFluxKreaDenoise?: number;
  comfyFluxKreaUpscalerSteps?: number;

  // --- Video Generation ---
  videoProvider?: 'comfyui' | 'gemini';
  comfyVidModelType?: 'wan-i2v';

  // WAN 2.2 Image-to-Video (First/Last Frame)
  comfyVidWanI2VHighNoiseModel?: string;
  comfyVidWanI2VLowNoiseModel?: string;
  comfyVidWanI2VClipModel?: string;
  comfyVidWanI2VVaeModel?: string;
  comfyVidWanI2VClipVisionModel?: string;
  comfyVidWanI2VUseLightningLora?: boolean;
  comfyVidWanI2VHighNoiseLora?: string;
  comfyVidWanI2VHighNoiseLoraStrength?: number;
  comfyVidWanI2VLowNoiseLora?: string;
  comfyVidWanI2VLowNoiseLoraStrength?: number;
  comfyVidWanI2VSteps?: number;
  comfyVidWanI2VCfg?: number;
  comfyVidWanI2VSampler?: string;
  comfyVidWanI2VScheduler?: string;
  comfyVidWanI2VFrameCount?: number;
  comfyVidWanI2VRefinerStartStep?: number;
  comfyVidWanI2VFrameRate?: number;
  comfyVidWanI2VVideoFormat?: string;
  comfyVidWanI2VUseFilmGrain?: boolean;
  comfyVidWanI2VFilmGrainIntensity?: number;
  comfyVidWanI2VFilmGrainSize?: number;
  comfyVidWanI2VPositivePrompt?: string;
  comfyVidWanI2VNegativePrompt?: string;
  comfyVidWanI2VWidth?: number;
  comfyVidWanI2VHeight?: number;
  comfyVidWanI2VUseEndFrame?: boolean;
  comfyVidWanI2VEndFrameStrength?: number;

  // Gemini Video Options
  geminiVidModel?: string;
  geminiVidPrompt?: string;
  geminiVidUseEndFrame?: boolean;
}

export interface User {
  username: string;
  password?: string; // Not always present, e.g., when just identifying the current user
  role: 'admin' | 'user';
}

export interface HistoryItem {
  id: number; // Using timestamp for unique ID
  timestamp: string;
  sourceImage?: string; // as data URL, optional for text-to-image
  options: GenerationOptions;
  generatedImages: string[];
}

export interface VersionInfo {
  version: string;
  date: string;
  changes: string;
}

export interface GeneratedClothing {
  name: string;
  laidOutImage: string;
  foldedImage: string;
}

export interface LibraryItem {
  id: number; // Timestamp
  driveFileId?: string; // ID of the file on Google Drive
  mediaType: 'image' | 'video' | 'clothes' | 'prompt';
  thumbnail: string; // Small data URL for preview
  media: string; // Full-size data URL for image/video, JSON for clothes, or the prompt text
  name?: string; // For clothes items or prompts
  options?: GenerationOptions; // For image/video generations
  clothingDetails?: string; // For clothes items
  sourceImage?: string; // data URL
  startFrame?: string; // data URL
  endFrame?: string; // data URL
  promptType?: 'image' | 'background' | 'subject' | 'soup'; // For prompt items
  promptModelType?: 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2'; // For prompt items
  previewThumbnail?: string; // Optional AI-generated thumbnail for prompt hover
}

// Type for Google Drive Folder representation
export interface DriveFolder {
    id: string;
    name: string;
}