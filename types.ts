import type { fileURLToPath } from "url";

export interface User {
  username: string;
  role: 'admin' | 'user';
  password?: string; // Only used for creation/local storage
}

export type PoseMode = 'random' | 'select' | 'prompt' | 'library';
export type BackgroundMode = 'black' | 'white' | 'gray' | 'green screen' | 'natural studio' | 'original' | 'random' | 'prompt' | 'image';
export type ClothingMode = 'original' | 'image' | 'prompt' | 'random';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type PhotoStyle = 'professional photoshoot' | '35mm analog' | 'polaroid' | 'candid' | 'smartphone';
export type ImageStyle = 'photorealistic' | 'cartoon' | 'comic book style' | 'anime' | 'oil painting' | 'watercolor painting' | 'impressionism' | 'charcoal sketch' | 'cubism' | 'surrealism' | 'pixel art';
export type EraStyle = 'a modern digital photograph' | 'a 1990s magazine ad' | 'a 1970s film look' | 'a high-contrast film noir style photograph' | 'a classical Dutch Master painting' | 'a high-fashion Vogue magazine shot';
export type GeminiMode = 'i2i' | 't2i';
export type GeminiPoseSource = 'mannequin' | 'json';
export type GeminiT2IModel = 'imagen-4.0-generate-001' | 'gemini-2.5-flash-image-preview';
export type ComfyModelType = 'sd1.5' | 'sdxl' | 'flux' | 'wan2.2' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea' | 'face-detailer-sd1.5';
export type ComfyVideoModelType = 'wan-i2v' | 'svd';
export type Provider = 'gemini' | 'comfyui';
export type VideoProvider = 'gemini' | 'comfyui';
export type ClothingStyleConsistency = 'varied' | 'strict';
export type NunchakuPrecision = 'nunchaku-fp16' | 'bfloat16' | 'float32';
export type NunchakuAttention = 'nunchaku-fp16' | 'flash-attention2';

export interface GenerationOptions {
    provider: Provider;
    numImages: number;
    aspectRatio: AspectRatio;
    imageStyle: ImageStyle;
    photoStyle: PhotoStyle;
    eraStyle: EraStyle;
    creativity?: number; // 0-1, for non-photorealistic styles
    
    // Gemini-specific
    geminiMode: GeminiMode;
    geminiPrompt?: string; // For t2i
    geminiT2IModel?: GeminiT2IModel;
    poseMode: PoseMode;
    poseSelection: string[];
    poseLibraryItems?: LibraryItem[];
    geminiPoseSource?: GeminiPoseSource;
    background: BackgroundMode;
    customBackground?: string;
    consistentBackground?: boolean;
    clothing: ClothingMode;
    customClothingPrompt?: string;
    clothingStyleConsistency?: ClothingStyleConsistency;
    addTextToImage?: boolean;
    textOnImagePrompt?: string;
    textObjectPrompt?: string;

    // Gemini I2I Editing
    geminiI2iMode?: 'general' | 'inpaint' | 'compose';
    geminiGeneralEditPrompt?: string;
    geminiInpaintTask?: 'remove' | 'replace' | 'changeColor' | 'custom';
    geminiInpaintCustomPrompt?: string;
    geminiInpaintTargetPrompt?: string; // For color name or replacement object
    geminiComposePrompt?: string;
    
    // ComfyUI-specific
    comfyPrompt?: string;
    comfyNegativePrompt?: string;
    comfyModelType?: ComfyModelType;
    comfyModel?: string; // Checkpoint name
    comfySteps?: number;
    comfyCfg?: number;
    comfySampler?: string;
    comfyScheduler?: string;
    comfySeed?: number;
    comfySeedControl?: 'fixed' | 'increment' | 'decrement' | 'randomize';
    comfySeedIncrement?: number;
    comfySdxlUseLora?: boolean;
    comfySdxlLoraName?: string;
    comfySdxlLoraStrength?: number;
    
    comfyFluxGuidance?: number;
    
    // WAN 2.2 specific
    comfyWanHighNoiseModel?: string;
    comfyWanLowNoiseModel?: string;
    comfyWanClipModel?: string;
    comfyWanVaeModel?: string;
    comfyWanRefinerStartStep?: number;
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

    // Nunchaku specific
    comfyNunchakuModel?: string;
    comfyNunchakuVae?: string;
    comfyNunchakuClipL?: string;
    comfyNunchakuT5XXL?: string;
    comfyFluxGuidanceKontext?: number; // Used by both nunchaku workflows
    comfyNunchakuCacheThreshold?: number;
    comfyNunchakuCpuOffload?: 'auto' | 'enable' | 'disable';
    comfyNunchakuAttention?: NunchakuAttention;
    comfyNunchakuUseTurboLora?: boolean;
    comfyNunchakuTurboLoraName?: string;
    comfyNunchakuTurboLoraStrength?: number;
    comfyNunchakuUseNudifyLora?: boolean;
    comfyNunchakuNudifyLoraName?: string;
    comfyNunchakuNudifyLoraStrength?: number;
    comfyNunchakuUseDetailLora?: boolean;
    comfyNunchakuDetailLoraName?: string;
    comfyNunchakuDetailLoraStrength?: number;
    comfyNunchakuBaseShift?: number; // Only for image workflow
    comfyNunchakuMaxShift?: number; // Only for image workflow

    // FLUX Krea specific
    comfyFluxKreaModel?: string;
    comfyFluxKreaClipT5?: string;
    comfyFluxKreaClipL?: string;
    comfyFluxKreaVae?: string;
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
    comfyFluxKreaUpscaleModel?: string;
    comfyFluxKreaDenoise?: number;
    comfyFluxKreaUpscalerSteps?: number;
    
    // Face Detailer specific
    comfyDetailerBboxModel?: string;
    comfyDetailerSamModel?: string;
    comfyDetailerSteps?: number;
    comfyDetailerCfg?: number;
    comfyDetailerSampler?: string;
    comfyDetailerScheduler?: string;
    comfyDetailerDenoise?: number;
    comfyDetailerFeather?: number;
    comfyDetailerBboxThreshold?: number;
    comfyDetailerBboxDilation?: number;
    comfyDetailerBboxCropFactor?: number;

    // Video Generation
    videoProvider?: VideoProvider;
    width?: number;
    height?: number;

    // Gemini Video
    geminiVidModel?: 'veo-2.0-generate-001';
    geminiVidPrompt?: string;
    geminiVidUseEndFrame?: boolean;

    // ComfyUI Video
    comfyVidModelType?: ComfyVideoModelType;
    comfyVidWanI2VHighNoiseModel?: string;
    comfyVidWanI2VLowNoiseModel?: string;
    comfyVidWanI2VClipModel?: string;
    comfyVidWanI2VVaeModel?: string;
    comfyVidWanI2VClipVisionModel?: string;
    comfyVidWanI2VPositivePrompt?: string;
    comfyVidWanI2VNegativePrompt?: string;
    comfyVidWanI2VSteps?: number;
    comfyVidWanI2VCfg?: number;
    comfyVidWanI2VSampler?: string;
    comfyVidWanI2VScheduler?: string;
    comfyVidWanI2VFrameCount?: number;
    comfyVidWanI2VRefinerStartStep?: number;
    comfyVidWanI2VUseLightningLora?: boolean;
    comfyVidWanI2VHighNoiseLora?: string;
    comfyVidWanI2VHighNoiseLoraStrength?: number;
    comfyVidWanI2VLowNoiseLora?: string;
    comfyVidWanI2VLowNoiseLoraStrength?: number;
    comfyVidWanI2VUseFilmGrain?: boolean;
    comfyVidWanI2VFilmGrainIntensity?: number;
    comfyVidWanI2VFilmGrainSize?: number; // It's actually saturation mix
    comfyVidWanI2VFrameRate?: number;
    comfyVidWanI2VVideoFormat?: string;
    comfyVidWanI2VWidth?: number;
    comfyVidWanI2VHeight?: number;
    comfyVidWanI2VUseEndFrame?: boolean;
    comfyVidWanI2VNoiseSeed?: number;
    comfyVidWanI2VSeedControl?: 'fixed' | 'randomize';
}

export interface IdentifiedClothing {
  itemName: string;
  description: string;
}

export interface GeneratedClothing {
  itemName: string;
  laidOutImage: string; // data URL
  foldedImage?: string;  // data URL, now optional
  saved?: 'idle' | 'saving' | 'saved'; // UI state
}

export interface IdentifiedObject {
    name: string;
    description: string;
}

export interface GeneratedObject {
    name: string;
    image: string; // data URL
    saved?: 'idle' | 'saving' | 'saved'; // UI state
}

export interface IdentifiedPose {
    description: string;
}

export type MannequinStyle = 'wooden-artist' | 'neutral-gray' | 'wireframe' | 'comic-outline' | 'custom-reference';

export interface GeneratedPose {
    description: string;
    image: string; // data URL for mannequin
    skeletonImage: string; // data URL for skeleton render
    poseJson: object; // The ControlNet JSON object
    mannequinStyle: MannequinStyle; // The style used for generation
    saved?: 'idle' | 'saving' | 'saved'; // UI state
    generationPrompt?: string;
}


export interface ExtractorState {
    // Clothes
    clothesSourceFile: File | null;
    clothesDetails: string;
    isIdentifying: boolean;
    identifiedItems: (IdentifiedClothing & { selected: boolean })[];
    isGenerating: boolean;
    generatedClothes: GeneratedClothing[];
    clothesError: string | null;
    generateFolded: boolean;
    excludeAccessories: boolean;
    // Objects
    objectSourceFile: File | null;
    objectHints: string;
    maxObjects: number;
    isIdentifyingObjects: boolean;
    identifiedObjects: (IdentifiedObject & { selected: boolean })[];
    isGeneratingObjects: boolean;
    generatedObjects: GeneratedObject[];
    objectError: string | null;
    // Poses
    poseSourceFile: File | null;
    isGeneratingPoses: boolean;
    generatedPoses: GeneratedPose[];
    poseError: string | null;
    mannequinStyle: MannequinStyle;
    mannequinReferenceFile: File | null;
    // Font
    fontSourceFile: File | null;
    isGeneratingFont: boolean;
    generatedFontChart: { src: string; saved: 'idle' | 'saving' | 'saved' } | null;
    fontError: string | null;
}

export type LibraryItemType = 'image' | 'character' | 'video' | 'logo' | 'banner' | 'album-cover' | 'clothes' | 'prompt' | 'extracted-frame' | 'object' | 'color-palette' | 'pose' | 'font';
export type PromptCategory = 'image' | 'background' | 'subject' | 'soup';

export type LogoStyle = 'symbolic' | 'wordmark' | 'emblem' | 'abstract' | 'combination' | 'pixel-art' | 'vaporwave' | 'grunge' | 'vintage-badge' | '3d-clay' | 'hand-drawn' | 'geometric';
export type LogoBackground = 'transparent' | 'white' | 'black';
export type BannerStyle = 'none' | 'corporate-clean' | 'gaming-energetic' | 'artistic-brush' | 'minimalist-type' | 'vintage-retro' | 'tech-glow' | 'cinematic-photo' | 'promotional-sale' | 'watercolor-wash' | 'collage';
export type BannerLogoPlacement = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'no-logo';
export type BannerAspectRatio = '16:9' | '1.91:1' | '4:1' | '2:1' | '1:1' | '9:16' | '1:2' | '1:4';

export type MusicStyle = 'rock' | 'pop' | 'electronic' | 'jazz' | 'hip-hop' | 'country' | 'folk' | 'metal' | 'classical' | 'other';
export type AlbumEra = '50s' | '60s' | '70s' | '80s' | '90s' | '2000s' | 'modern';
export type AlbumMediaType = 'vinyl' | 'cd' | 'digital';

export interface ThemeGenerationInfo {
    prompt?: string;
    // Common
    style?: string; // LogoStyle, BannerStyle, MusicStyle, etc.
    referenceItems?: { name: string; thumbnail: string }[];
    selectedPalette?: { name: string; media: string }; // name and palette JSON
    selectedFont?: { name: string; thumbnail: string };
    fontReferenceImage?: string; // thumbnail dataURL
    // Logo specific
    brandName?: string;
    slogan?: string;
    backgroundColor?: LogoBackground;
    // Banner specific
    bannerTitle?: string;
    bannerAspectRatio?: BannerAspectRatio;
    bannerLogoPlacement?: BannerLogoPlacement;
    bannerSelectedLogo?: { name: string; thumbnail: string };
    // Album specific
    albumTitle?: string;
    artistName?: string;
    albumEra?: AlbumEra;
    albumMediaType?: AlbumMediaType;
    addVinylWear?: boolean;
    albumSelectedLogo?: { name: string; thumbnail: string };
}

export interface LibraryItem {
    id: number; // Unique ID, typically a timestamp
    name?: string;
    mediaType: LibraryItemType;
    media: string; // data URL for image/video/clothes, prompt text, or JSON string for palette
    thumbnail: string; // data URL for a small thumbnail
    options?: GenerationOptions;
    themeOptions?: ThemeGenerationInfo;
    sourceImage?: string; // data URL for image/video generations
    startFrame?: string; // data URL for video generations
    endFrame?: string; // data URL for video generations
    promptType?: PromptCategory;
    promptModelType?: ComfyModelType | 'gemini';
    driveFileId?: string; // Google Drive file ID for the media
    previewThumbnail?: string; // AI-generated visual thumbnail for prompts
    poseJson?: string; // For pose items, the ControlNet JSON as a string
    skeletonImage?: string; // For pose items, the data URL for the skeleton visualization
}

export interface VersionInfo {
    version: string;
    date: string;
    changes: string;
}

export interface DriveFolder {
    id: string;
    name: string;
}

export interface PaletteColor {
    hex: string;
    name: string;
}

export interface ColorPickerState {
    imageFile: File | null;
    palette: PaletteColor[];
    paletteName: string;
    colorCount: number;
    isExtracting: boolean;
    error: string | null;
    dominantColorPool: string[]; // Store a large pool of hex codes for reshuffling
    paletteSaveStatus: 'idle' | 'saving' | 'saved';
    pickingColorIndex: number | null; // The index of the color swatch being replaced by the eyedropper
}

export interface VideoUtilsState {
    videoFile: File | null;
    extractedFrame: string | null;
    extractedFrameSaveStatus: 'idle' | 'saving' | 'saved';
    colorPicker: ColorPickerState;
}

export interface PromptGenState {
    image: File | null;
    prompt: string;
    promptSaveStatus: 'idle' | 'saving' | 'saved';
    bgImage: File | null;
    bgPrompt: string;
    bgPromptSaveStatus: 'idle' | 'saving' | 'saved';
    subjectImage: File | null;
    subjectPrompt: string;
    subjectPromptSaveStatus: 'idle' | 'saving' | 'saved';
    soupPrompt: string;
    soupPromptSaveStatus: 'idle' | 'saving' | 'saved';
    soupHistory: string[];
}

export interface LogoThemeState {
    // Logo Generator State
    logoPrompt?: string;
    brandName?: string;
    slogan?: string;
    logoStyle?: LogoStyle;
    fontReferenceImage?: File | null;
    selectedFont?: LibraryItem | null;
    referenceItems?: LibraryItem[];
    selectedPalette?: LibraryItem | null;
    numLogos?: number;
    backgroundColor?: LogoBackground;
    isGeneratingLogos?: boolean;
    generatedLogos?: { src: string; saved: 'idle' | 'saving' | 'saved' }[];
    logoError?: string | null;
    
    // Banner Generator State
    bannerPrompt?: string;
    bannerTitle?: string;
    bannerAspectRatio?: BannerAspectRatio;
    bannerStyle?: BannerStyle;
    bannerFontReferenceImage?: File | null;
    bannerSelectedFont?: LibraryItem | null;
    bannerReferenceItems?: LibraryItem[];
    bannerSelectedPalette?: LibraryItem | null;
    bannerSelectedLogo?: LibraryItem | null;
    bannerLogoPlacement?: BannerLogoPlacement;
    numBanners?: number;
    isGeneratingBanners?: boolean;
    generatedBanners?: { src: string; saved: 'idle' | 'saving' | 'saved' }[];
    bannerError?: string | null;

    // Album Cover Generator State
    albumPrompt?: string;
    albumTitle?: string;
    artistName?: string;
    musicStyle?: MusicStyle;
    customMusicStyle?: string;
    albumEra?: AlbumEra;
    albumMediaType?: AlbumMediaType;
    addVinylWear?: boolean;
    albumFontReferenceImage?: File | null;
    albumSelectedFont?: LibraryItem | null;
    albumReferenceItems?: LibraryItem[];
    albumSelectedPalette?: LibraryItem | null;
    albumSelectedLogo?: LibraryItem | null;
    numAlbumCovers?: number;
    isGeneratingAlbumCovers?: boolean;
    generatedAlbumCovers?: { src: string; saved: 'idle' | 'saving' | 'saved' }[];
    albumCoverError?: string | null;
}

export interface AppSliceState {
  currentUser: User | null;
  theme: string;
  activeTab: string;
  isComfyUIConnected: boolean | null;
  comfyUIObjectInfo: any | null;
  versionInfo: VersionInfo | null;
  globalError: { title: string; message: string } | null;
  
  // Modals & Panels
  isSettingsModalOpen: boolean;
  isAdminPanelOpen: boolean;
  isFeatureAnalysisModalOpen: boolean;
  isClothingPickerOpen: boolean;
  isBackgroundPickerOpen: boolean;
  isPosePickerOpen: boolean;
  isColorImagePickerOpen: boolean;
  isVideoUtilsPickerOpen: boolean;
  isStartFramePickerOpen: boolean;
  isEndFramePickerOpen: boolean;
  isLogoRefPickerOpen: boolean;
  isLogoPalettePickerOpen: boolean;
  isLogoFontPickerOpen: boolean;
  isOAuthHelperOpen: boolean;
  isPromptGenImagePickerOpen: boolean;
  isPromptGenBgImagePickerOpen: boolean;
  isPromptGenSubjectImagePickerOpen: boolean;
  isNunchakuSourcePickerOpen: boolean;
  isCharacterSourcePickerOpen: boolean;
  isVideoStartFramePickerOpen: boolean;
  isVideoEndFramePickerOpen: boolean;
  isGeminiVideoSourcePickerOpen: boolean;
  isClothesSourcePickerOpen: boolean;
  isObjectSourcePickerOpen: boolean;
  isPoseSourcePickerOpen: boolean;
  isBannerRefPickerOpen: boolean;
  isBannerPalettePickerOpen: boolean;
  isBannerLogoPickerOpen: boolean;
  isBannerFontPickerOpen: boolean;
  isAlbumCoverRefPickerOpen: boolean;
  isAlbumCoverPalettePickerOpen: boolean;
  isAlbumCoverLogoPickerOpen: boolean;
  isAlbumCoverFontPickerOpen: boolean;
  isMannequinRefPickerOpen: boolean;
  isFontSourcePickerOpen: boolean;
  isMaskPickerOpen: boolean;
  isElementPickerOpen: boolean;

  // Google Drive State
  driveFolder: DriveFolder | null;
  isSyncing: boolean;
  syncMessage: string;
  isDriveConfigured: boolean;
}

export interface GenerationSliceState {
  sourceImage: File | null;
  generationMode: 't2i' | 'i2i';
  characterName: string;
  shouldGenerateCharacterName: boolean;
  clothingImage: File | null;
  backgroundImage: File | null;
  previewedBackgroundImage: string | null;
  previewedClothingImage: string | null;
  maskImage: File | null;
  elementImages: File[];
  options: GenerationOptions;
  isLoading: boolean;
  progressMessage: string;
  progressValue: number;
  generatedContent: {
    [tabId: string]: {
      images: { src: string; saved: 'idle' | 'saving' | 'saved' }[];
      lastUsedPrompt: string | null;
    }
  };
}

export interface VideoSliceState {
  // Video Generation
  videoStartFrame: File | null;
  videoEndFrame: File | null;
  generatedVideoUrl: { url: string; saved: 'idle' | 'saving' | 'saved' } | null;
  generationOptionsForSave: GenerationOptions | null;
  
  // Video Utilities
  videoUtilsState: VideoUtilsState;
  activeVideoUtilsSubTab: 'frames' | 'colors';
}

export interface LibrarySliceState {
    items: LibraryItem[];
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
}
