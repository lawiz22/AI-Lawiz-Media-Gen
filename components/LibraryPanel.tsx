
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { deleteFromLibrary, deleteManyFromLibrary, clearLibraryItems, fetchLibrary, updateLibraryItem, updateLibraryItems } from '../store/librarySlice';
import type { LibraryItem, LibraryItemType, GenerationOptions, ThemeGenerationInfo, PaletteColor } from '../types';
import {
  CloseIcon, SpinnerIcon, LibraryIcon, VideoIcon, PhotographIcon, TshirtIcon,
  DocumentTextIcon, FilmIcon, CubeIcon, CheckIcon, LogoIconSimple, CharacterIcon, PaletteIcon,
  BannerIcon, AlbumCoverIcon, TrashIcon, LoadIcon, FileExportIcon, UploadIconSimple, GoogleDriveIcon,
  PoseIcon, FontIcon, Squares2X2Icon, ListBulletIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, WarningIcon,
  SendIcon, WorkflowIcon, GenerateIcon, PastForwardIcon, RefreshIcon, MicrophoneIcon, GroupPhotoFusionIcon, DownloadIcon, ZoomIcon,
  StarIcon
} from './icons';
import { createPaletteThumbnail, createVideoPlaceholderThumbnail, normalizeAudioDataUrl } from '../utils/imageUtils';
import { getPromptSoupSourceClass } from '../utils/promptSoup';
import { addToExistingLibraryArchive, chooseLibraryFolder, createLibraryAssetObjectUrl, exportLibraryArchive, exportLibraryArchivesByCategory, exportLibraryFolder, getActiveLibraryFolderName, getLibraryFolderSyncStatus, hydrateLibraryItem, importLibraryArchive, importLibraryFolder, importLibraryJsonFile } from '../services/libraryService';
import { updateOptions, setGenerationMode, switchComfyModelOptions } from '../store/generationSlice';
import { setActiveTab } from '../store/appSlice';
import { setActivePromptToolsSubTab, updatePromptGenState } from '../store/promptGenSlice';
import { AudioPlayer } from './AudioPlayer';
import { getPromptDestinationOptions, PROMPT_T2I_WORKFLOWS } from '../utils/promptDestination';
import { LibraryPickerModal } from './LibraryPickerModal';

// --- Confirmation Modal Component (defined in-file to avoid adding new files) ---
interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel' }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 animate-fade-in"
      role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-md p-6 rounded-2xl shadow-lg border border-border-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-danger-bg p-2 rounded-full">
              <WarningIcon className="w-6 h-6 text-danger" />
            </div>
            <h2 id="confirm-modal-title" className="text-xl font-bold text-text-primary">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover" aria-label="Close">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-text-secondary">{message}</div>

        <div className="mt-6 flex justify-end gap-4">
          <button onClick={onClose} className="bg-bg-tertiary text-text-secondary font-semibold py-2 px-5 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
            {cancelText}
          </button>
          <button onClick={onConfirm} className="bg-danger text-white font-bold py-2 px-5 rounded-lg hover:bg-red-700 transition-colors">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};


interface LibraryPanelProps {
  onLoadItem: (item: LibraryItem, options?: { importTtsCharacterPhotos: boolean }) => void;
  onUpscaleItem: (item: LibraryItem) => void;
  isDriveConnected: boolean;
  onSyncWithDrive: () => void;
  isSyncing: boolean;
  syncMessage: string;
  isDriveConfigured: boolean;
}

const getCategoryIcon = (mediaType: LibraryItemType, className: string = "w-4 h-4") => {
  const props = { className };
  switch (mediaType) {
    case 'image': return <PhotographIcon {...props} />;
    case 'character': return <CharacterIcon {...props} />;
    case 'video': return <VideoIcon {...props} />;
    case 'audio-tts': return <MicrophoneIcon {...props} />;
    case 'tts-reference': return <MicrophoneIcon {...props} />;
    case 'logo': return <LogoIconSimple {...props} />;
    case 'banner': return <BannerIcon {...props} />;
    case 'album-cover': return <AlbumCoverIcon {...props} />;
    case 'clothes': return <TshirtIcon {...props} />;
    case 'hair': return <CharacterIcon {...props} />;
    case 'prompt': return <DocumentTextIcon {...props} />;
    case 'extracted-frame': return <FilmIcon {...props} />;
    case 'object': return <CubeIcon {...props} />;
    case 'color-palette': return <PaletteIcon {...props} />;
    case 'pose': return <PoseIcon {...props} />;
    case 'font': return <FontIcon {...props} />;
    case 'group-fusion': return <GroupPhotoFusionIcon {...props} />;
    case 'swap-anything': return <RefreshIcon {...props} />;
    case 'past-forward-photo': return <PastForwardIcon {...props} />;
    case 'preset': return <WorkflowIcon {...props} />;
    default: return null;
  }
};

const FILTER_BUTTONS: { id: LibraryItemType; label: string; icon: React.ReactElement }[] = [
  { id: 'image', label: 'Images', icon: <PhotographIcon className="w-5 h-5" /> },
  { id: 'character', label: 'Characters', icon: <CharacterIcon className="w-5 h-5" /> },
  { id: 'group-fusion', label: 'Photo Fusion', icon: <GroupPhotoFusionIcon className="w-5 h-5" /> },
  { id: 'swap-anything', label: 'Swap Anything', icon: <RefreshIcon className="w-5 h-5" /> },
  { id: 'past-forward-photo', label: 'Past Forward', icon: <PastForwardIcon className="w-5 h-5" /> },
  { id: 'video', label: 'Videos', icon: <VideoIcon className="w-5 h-5" /> },
  { id: 'audio-tts', label: 'Audio TTS', icon: <MicrophoneIcon className="w-5 h-5" /> },
  { id: 'tts-reference', label: 'TTS References', icon: <MicrophoneIcon className="w-5 h-5" /> },
  { id: 'logo', label: 'Logos', icon: <LogoIconSimple className="w-5 h-5" /> },
  { id: 'banner', label: 'Banners', icon: <BannerIcon className="w-5 h-5" /> },
  { id: 'album-cover', label: 'Album Covers', icon: <AlbumCoverIcon className="w-5 h-5" /> },
  { id: 'clothes', label: 'Clothes', icon: <TshirtIcon className="w-5 h-5" /> },
  { id: 'hair', label: 'Hair', icon: <CharacterIcon className="w-5 h-5" /> },
  { id: 'object', label: 'Objects', icon: <CubeIcon className="w-5 h-5" /> },
  { id: 'pose', label: 'Poses', icon: <PoseIcon className="w-5 h-5" /> },
  { id: 'font', label: 'Fonts', icon: <FontIcon className="w-5 h-5" /> },
  { id: 'preset', label: 'Presets', icon: <WorkflowIcon className="w-5 h-5" /> },
  { id: 'prompt', label: 'Prompts', icon: <DocumentTextIcon className="w-5 h-5" /> },
  { id: 'color-palette', label: 'Palettes', icon: <PaletteIcon className="w-5 h-5" /> },
  { id: 'extracted-frame', label: 'Frames', icon: <FilmIcon className="w-5 h-5" /> },
];

const NON_DOWNLOADABLE_MEDIA_TYPES = new Set<LibraryItemType>(['prompt', 'color-palette', 'preset']);
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
};

interface LibraryVisualMedia {
  src: string;
  label: string;
  kind: 'image' | 'video';
}

const getLibraryVisualMedia = (item: LibraryItem | null): LibraryVisualMedia[] => {
  if (!item) return [];
  const media: LibraryVisualMedia[] = [];
  const seen = new Set<string>();
  const add = (src: string | undefined, label: string, kind: LibraryVisualMedia['kind'] = 'image') => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    media.push({ src, label, kind });
  };

  if (!NON_DOWNLOADABLE_MEDIA_TYPES.has(item.mediaType) && item.mediaType !== 'audio-tts' && item.mediaType !== 'tts-reference') {
    add(item.media, item.mediaType === 'pose' ? 'Mannequin' : item.mediaType === 'video' ? 'Video' : 'Result', item.mediaType === 'video' ? 'video' : 'image');
  }
  add(item.sourceImage, 'Source Image');
  add(item.startFrame, 'Start Frame');
  add(item.endFrame, 'End Frame');
  add(item.skeletonImage, 'Skeleton');
  item.ltxDirectorOptions?.segments.forEach((segment, index) => add(segment.sourceImage, `Clip ${index + 1} Source`));
  return media;
};

const downloadLibraryItem = (item: LibraryItem) => {
  const inlineMimeType = item.media.match(/^data:([^;,]+)/)?.[1];
  const mimeType = item.assetRefs?.media?.mimeType || inlineMimeType || '';
  const extension = MIME_EXTENSIONS[mimeType] || (item.mediaType === 'video' ? 'mp4' : item.mediaType === 'audio-tts' || item.mediaType === 'tts-reference' ? 'wav' : 'png');
  const safeName = (item.name || `${item.mediaType}-${item.id}`)
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '') || `library-item-${item.id}`;
  const anchor = document.createElement('a');
  anchor.href = item.media;
  anchor.download = `${safeName}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const DetailItem: React.FC<{ label: string; value?: string | number | boolean | null; isCode?: boolean }> = ({ label, value, isCode }) => {
  if (value === null || value === undefined || value === '') return null;
  const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <div className="mb-2">
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</h4>
      {isCode ? (
        <pre className="text-xs bg-bg-primary p-2 rounded-md mt-1 max-h-48 overflow-auto text-text-secondary whitespace-pre-wrap font-mono">
          <code>{displayValue}</code>
        </pre>
      ) : (
        <p className="text-sm text-text-primary mt-1">{String(displayValue)}</p>
      )}
    </div>
  );
};

const LoraDetail: React.FC<{ label: string; name?: string; strength?: number; enabled?: boolean }> = ({ label, name, strength, enabled = true }) => {
  if (!enabled || !name) return null;
  return (
    <div className="pl-4 border-l-2 border-border-primary/50 ml-2 py-1">
      <p className="text-xs text-text-secondary">{label}:</p>
      <p className="text-xs font-mono text-text-primary ml-2">{name} (Strength: {strength})</p>
    </div>
  );
};

const renderOptionsDetails = (options?: GenerationOptions, mediaType?: LibraryItemType) => {
  if (!options) return <DetailItem label="Options" value="Not available" />;
  const isImageType = mediaType === 'image' || mediaType === 'character' || mediaType === 'logo' || mediaType === 'banner' || mediaType === 'album-cover' || mediaType === 'clothes' || mediaType === 'hair' || mediaType === 'object' || mediaType === 'extracted-frame' || mediaType === 'pose' || mediaType === 'font' || mediaType === 'group-fusion' || mediaType === 'swap-anything';
  const comfyPositivePrompt = options.comfyModelType === 'flux2-simple'
    ? options.comfyFlux2Prompt
    : options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw'
      ? options.comfyKreaPrompt
      : options.comfyPrompt;
  const comfyNegativePrompt = options.comfyModelType === 'flux2-simple'
    ? options.comfyFlux2NegativePrompt
    : options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw'
      ? options.comfyKreaNegativePrompt
      : options.comfyNegativePrompt;

  return (
    <div>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Generation Options</h4>
      <div className="space-y-3 bg-bg-primary p-3 rounded-md max-h-96 overflow-y-auto">
        <DetailItem label="Provider" value={options.provider} />
        {(options.provider === 'gemini' || options.provider === 'mammouth') && isImageType && (
          <>
            {options.provider === 'mammouth' && <DetailItem label="Model" value={options.mammouthImageModel} />}
            <DetailItem label="Mode" value={options.geminiMode} />
            {options.geminiMode === 't2i' && <DetailItem label="Prompt" value={options.geminiPrompt} isCode />}
            <DetailItem label="Pose" value={options.poseMode} />
            <DetailItem label="Background" value={options.background} />
            {options.background === 'prompt' && <DetailItem label="BG Prompt" value={options.customBackground} isCode />}
            <DetailItem label="Clothing" value={options.clothing} />
            {options.clothing === 'prompt' && <DetailItem label="Clothing Prompt" value={options.customClothingPrompt} isCode />}
            <DetailItem label="Image Style" value={options.imageStyle} />
          </>
        )}
            let comparison = 0;
        {options.provider === 'comfyui' && isImageType && (
          <>
            <DetailItem label="Workflow" value={options.comfyModelType} />
            <DetailItem label="Prompt" value={comfyPositivePrompt} isCode />
            {comfyNegativePrompt && <DetailItem label="Negative Prompt" value={comfyNegativePrompt} isCode />}
            {(['sdxl', 'sd1.5', 'flux', 'qwen-t2i-gguf', 'z-image', 'flux2-simple', 'krea2-simple', 'krea2-raw'] as const).includes(options.comfyModelType as any) && (
              <div className="space-y-2 p-2 mt-2 border-t border-border-primary/50">
                <DetailItem label="Steps" value={options.comfySteps} />
                <DetailItem label="CFG" value={options.comfyCfg} />
                <DetailItem label="Sampler" value={options.comfySampler} />
                <DetailItem label="Scheduler" value={options.comfyScheduler} />
                {options.comfySeed !== undefined && <DetailItem label="Seed" value={options.comfySeed} isCode />}

                {/* SDXL / SD1.5 / FLUX Specifics */}
                {(options.comfyModelType === 'sdxl' || options.comfyModelType === 'sd1.5' || options.comfyModelType === 'flux') && (
                  <>
                    <DetailItem label="Model" value={options.comfyModel} />
                    {options.comfyModelType === 'flux' && <DetailItem label="FLUX Guidance" value={options.comfyFluxGuidance} />}
                  </>
                )}

                {/* Qwen Specifics */}
                {options.comfyModelType === 'qwen-t2i-gguf' && (
                  <>
                    <DetailItem label="Unet" value={options.comfyQwenUnet} />
                    <DetailItem label="VAE" value={options.comfyQwenVae} />
                    <DetailItem label="CLIP" value={options.comfyQwenClip} />
                    <DetailItem label="Shift" value={options.comfyQwenShift} />
                  </>
                )}

                {/* Z-Image Specifics */}
                {options.comfyModelType === 'z-image' && (
                  <>
                    <DetailItem label="Unet" value={options.comfyZImageUnet} />
                    <DetailItem label="VAE" value={options.comfyZImageVae} />
                    <DetailItem label="CLIP" value={options.comfyZImageClip} />
                    <DetailItem label="Shift" value={options.comfyZImageShift} />
                    <DetailItem label="Use Shift" value={options.comfyZImageUseShift} />
                    <DetailItem label="CacheDiT" value={options.comfyZImageUseCacheDit} />
                    {options.comfyZImageUseCacheDit && <DetailItem label="CacheDiT Settings" value={`${options.comfyZImageCacheDitModelType || 'Auto'} · warmup ${options.comfyZImageCacheDitWarmupSteps ?? 3} · skip ${options.comfyZImageCacheDitSkipInterval ?? 2} · summary ${options.comfyZImageCacheDitPrintSummary ?? true ? 'on' : 'off'}`} />}
                    <DetailItem label="Megapixel" value={options.megapixel} />
                  </>
                )}

                {/* LoRAs */}
                <div>
                  <h5 className="text-xs font-bold text-text-secondary uppercase tracking-wider mt-2">LoRAs</h5>
                  {[1, 2, 3, 4].map(i => {
                    let prefix = '';
                    if (options.comfyModelType === 'sdxl') prefix = 'comfySdxl';
                    else if (options.comfyModelType === 'sd1.5') prefix = 'comfySd15';
                    else if (options.comfyModelType === 'flux') prefix = 'comfyFlux';
                    else if (options.comfyModelType === 'qwen-t2i-gguf') prefix = 'comfyQwen';
                    else if (options.comfyModelType === 'z-image') prefix = 'comfyZImage';

                    if (!prefix) return null;

                    const nameKey = `${prefix}Lora${i}Name` as keyof GenerationOptions;
                    const strengthKey = `${prefix}Lora${i}Strength` as keyof GenerationOptions;
                    const name = options[nameKey] as string;
                    const strength = options[strengthKey] as number;

                    if (!name) return null;

                    return (
                      <LoraDetail
                        key={i}
                        label={`LoRA ${i}`}
                        name={name}
                        strength={strength}
                        enabled={true}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {/* ... Other ComfyUI details ... */}
          </>
        )}
        {mediaType === 'video' && options.videoProvider && (
          <>
            <DetailItem label="Video Provider" value={options.videoProvider} />
            {options.videoProvider === 'gemini' && <DetailItem label="Video Prompt" value={options.geminiVidPrompt} isCode />}
            {options.videoProvider === 'comfyui' && <DetailItem label="Video Prompt" value={options.comfyVidWanI2VPositivePrompt} isCode />}
          </>
        )}
        {isImageType && <DetailItem label="Aspect Ratio" value={options.aspectRatio} />}
      </div>
    </div>
  );
};

const renderThemeOptionsDetails = (themeOptions: ThemeGenerationInfo) => {
  if (!themeOptions) return null;
  const palette = themeOptions.selectedPalette ? JSON.parse(themeOptions.selectedPalette.media) as PaletteColor[] : [];
  return (
    <div>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Theme Options</h4>
      <div className="space-y-3 bg-bg-primary p-3 rounded-md max-h-96 overflow-y-auto">
        <DetailItem label="Prompt" value={themeOptions.prompt} isCode />
        <DetailItem label="Brand Name" value={themeOptions.brandName} />
        <DetailItem label="Slogan" value={themeOptions.slogan} />
        <DetailItem label="Style" value={themeOptions.style} />
        <DetailItem label="Background" value={themeOptions.backgroundColor} />
        <DetailItem label="Banner Title" value={themeOptions.bannerTitle} />
        <DetailItem label="Aspect Ratio" value={themeOptions.bannerAspectRatio} />
        <DetailItem label="Logo Placement" value={themeOptions.bannerLogoPlacement} />
        <DetailItem label="Artist Name" value={themeOptions.artistName} />
        <DetailItem label="Album Title" value={themeOptions.albumTitle} />
        <DetailItem label="Album Era" value={themeOptions.albumEra} />
        <DetailItem label="Media Format" value={themeOptions.albumMediaType} />
        <DetailItem label="Vinyl Wear" value={themeOptions.addVinylWear} />
        {/* ... */}
      </div>
    </div>
  );
};

interface PromptDestinationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: LibraryItem | null;
  onDestinationSelected: () => void;
}

const PromptDestinationPickerModal: React.FC<PromptDestinationPickerModalProps> = ({ isOpen, onClose, item, onDestinationSelected }) => {
  // ... (Implementation remains unchanged) ...
  const dispatch: AppDispatch = useDispatch();
  const promptGenState = useSelector((state: RootState) => state.promptGen.promptGenState);
  const prompt = item?.media || '';
  const handleSelectDestination = (provider: 'mammouth' | 'comfyui', comfyModelType?: GenerationOptions['comfyModelType']) => {
    if (provider === 'mammouth') {
      dispatch(updateOptions({ provider, geminiPrompt: prompt, geminiMode: 't2i' }));
    } else if (comfyModelType) {
      dispatch(switchComfyModelOptions(getPromptDestinationOptions(prompt, comfyModelType)));
    }
    dispatch(setGenerationMode('t2i'));
    dispatch(setActiveTab('image-generator'));
    onDestinationSelected();
    onClose();
  };
  const handleUseForMagicSoup = () => {
    if (!item || !['image', 'background', 'subject'].includes(item.promptType || '')) return;
    const promptUpdate = item.promptType === 'background'
      ? promptGenState.bgPrompt
        ? { additionalSoupBackgroundPrompts: [...(promptGenState.additionalSoupBackgroundPrompts ?? []), prompt] }
        : { bgPrompt: prompt }
      : item.promptType === 'subject'
        ? promptGenState.subjectPrompt
          ? { additionalSoupSubjectPrompts: [...(promptGenState.additionalSoupSubjectPrompts ?? []), prompt] }
          : { subjectPrompt: prompt }
        : promptGenState.prompt
          ? { additionalSoupMainPrompts: [...(promptGenState.additionalSoupMainPrompts ?? []), prompt] }
          : { prompt };
    dispatch(updatePromptGenState(promptUpdate));
    dispatch(setActivePromptToolsSubTab('prompt-soup'));
    dispatch(setActiveTab('prompt-generator'));
    onDestinationSelected();
    onClose();
  };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-destination-title"
    >
      <div
        className="bg-bg-secondary w-full max-w-2xl p-6 rounded-2xl shadow-lg border border-border-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="prompt-destination-title" className="text-xl font-bold text-accent flex items-center gap-2">
            <SendIcon className="w-6 h-6" />
            Use Prompt In...
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-text-secondary mb-6">Where would you like to use this generated prompt?</p>
        <div className="space-y-6">
          {item && ['image', 'background', 'subject'].includes(item.promptType || '') && (
            <div>
              <h3 className="text-lg font-semibold text-text-primary mb-3">Prompt Tools</h3>
              <button
                onClick={handleUseForMagicSoup}
                className="flex w-full items-center gap-4 rounded-lg border border-violet-400/40 bg-violet-500/10 p-4 text-left transition-colors hover:bg-violet-500/20"
              >
                <GenerateIcon className="h-8 w-8 flex-shrink-0 text-violet-300" />
                <div>
                  <p className="font-bold text-violet-200">Use for Magic Soup</p>
                  <p className="text-xs text-text-secondary">Load as the {item.promptType === 'image' ? 'main prompt' : item.promptType} ingredient and open Magical Prompt Soup.</p>
                </div>
              </button>
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">Mammouth AI</h3>
            <button
              onClick={() => handleSelectDestination('mammouth')}
              className="w-full text-left p-4 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors flex items-center gap-4"
            >
              <GenerateIcon className="w-8 h-8 text-accent flex-shrink-0" />
              <div>
                <p className="font-bold">Mammouth T2I</p>
                <p className="text-xs text-text-secondary">Use the selected Mammouth image model.</p>
              </div>
            </button>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">ComfyUI (T2I Workflows)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROMPT_T2I_WORKFLOWS.map(wf => (
                <button
                  key={wf.id}
                  onClick={() => handleSelectDestination('comfyui', wf.id as GenerationOptions['comfyModelType'])}
                  className="w-full text-left p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors flex items-center gap-3"
                >
                  <WorkflowIcon className="w-6 h-6 text-highlight-green flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{wf.label}</p>
                    <p className="text-xs text-text-secondary">Switch to Image Generator with this workflow.</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


type ViewMode = 'grid' | 'smallGrid' | 'list';
type SafetyFilter = 'all' | 'sfw' | 'nsfw' | 'unrated';
type LibrarySortField = 'date' | 'name' | 'rating';
type SortDirection = 'asc' | 'desc';

const NSFW_TEXT_PATTERN = /\b(?:nsfw|nude|nudity|naked|topless|explicit|porn|pornographic|sex|sexual|erotic|hentai|xxx|fetish|lingerie)\b/i;
const SFW_TEXT_PATTERN = /\b(?:sfw|landscape|nature|architecture|cityscape|product|food|vehicle|animal|wildlife|logo|typography|abstract|still life|paysage|nature|architecture|produit|nourriture|vehicule|animal|logo|typographie|abstrait)\b/i;
const TAGGABLE_MEDIA_TYPES = new Set<LibraryItemType>(['image', 'character', 'video', 'audio-tts', 'tts-reference', 'logo', 'banner', 'album-cover', 'clothes', 'hair', 'prompt', 'extracted-frame', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo', 'preset']);

const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase().slice(0, 48);

const getValidRating = (value: unknown): LibraryItem['rating'] =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? value as LibraryItem['rating'] : undefined;

const RatingStars: React.FC<{ rating: unknown; className?: string }> = ({ rating, className = 'h-3.5 w-3.5' }) => {
  const validRating = getValidRating(rating);
  if (!validRating) return null;
  return <span className="flex items-center gap-0.5" aria-label={`${validRating} out of 5 stars`}>
    {Array.from({ length: validRating }, (_, index) => <StarIcon key={index} className={`${className} fill-amber-400 text-amber-400`} />)}
  </span>;
};

const getImageWorkflow = (item: LibraryItem) => {
  if (item.options?.provider === 'comfyui') return item.options.comfyModelType || '';
  if (item.options?.provider === 'mammouth') return item.options.mammouthImageModel || '';
  if (item.options?.provider === 'gemini') return item.options.geminiT2IModel || '';
  return '';
};

const getCharacterWorkflow = (item: LibraryItem) => {
  if (item.options?.provider === 'comfyui') return item.options.comfyCharacterMode || 'qwen';
  if (item.options?.provider === 'mammouth') return item.options.mammouthImageModel || '';
  if (item.options?.provider === 'gemini') return item.options.geminiT2IModel || '';
  return '';
};

const getLibrarySearchText = (item: LibraryItem) => {
  const values: string[] = [];
  const visited = new WeakSet<object>();
  const visit = (value: unknown, key = '') => {
    if (value === null || value === undefined || key === 'assetRefs' || key === 'thumbnail' || key === 'sourceImage' || key === 'startFrame' || key === 'endFrame' || key === 'skeletonImage') return;
    if (typeof value === 'string') {
      if (!value.startsWith('data:') && !value.startsWith('blob:')) values.push(value);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      values.push(String(value));
      return;
    }
    if (typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) value.forEach(entry => visit(entry));
    else Object.entries(value).forEach(([entryKey, entryValue]) => visit(entryValue, entryKey));
  };
  visit(item);
  return values.join(' ').toLowerCase();
};

const formatFileSize = (bytes: number) => {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ onLoadItem, onUpscaleItem, isDriveConnected, onSyncWithDrive, isSyncing, syncMessage, isDriveConfigured }) => {
  const dispatch: AppDispatch = useDispatch();
  const { items, status: libraryStatus, error: libraryError } = useSelector((state: RootState) => state.library);
  const projectName = useSelector((state: RootState) => state.app.projectName);

  const [filter, setFilter] = useState<LibraryItemType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [imageProvider, setImageProvider] = useState('');
  const [imageWorkflow, setImageWorkflow] = useState('');
  const [characterProvider, setCharacterProvider] = useState('');
  const [characterWorkflow, setCharacterWorkflow] = useState('');
  const [safetyFilter, setSafetyFilter] = useState<SafetyFilter>('all');
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [isSafetyTagsOpen, setIsSafetyTagsOpen] = useState(true);
  const [bulkTag, setBulkTag] = useState('');
  const [itemTag, setItemTag] = useState('');
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(() => new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedItemModal, setSelectedItemModal] = useState<LibraryItem | null>(null);
  const [mediaViewerIndex, setMediaViewerIndex] = useState<number | null>(null);
  const [mediaViewerScale, setMediaViewerScale] = useState<'fit' | 'actual'>('fit');
  const [importTtsCharacterPhotos, setImportTtsCharacterPhotos] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [hoveredSource, setHoveredSource] = useState<{ src: string; x: number; y: number } | null>(null);
  const hoverRequestRef = useRef(0);
  const hoverObjectUrlRef = useRef<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortField, setSortField] = useState<LibrarySortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeLibraryFolderName, setActiveLibraryFolderName] = useState<string | null>(null);
  const [pendingProjectChanges, setPendingProjectChanges] = useState<number | null>(null);
  const [isCheckingProjectChanges, setIsCheckingProjectChanges] = useState(false);
  const [isDeletingCategories, setIsDeletingCategories] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [operationNotice, setOperationNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isResolvingItem, setIsResolvingItem] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // NEW: Local loading timeout state
  const [isTakingTooLong, setIsTakingTooLong] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    confirmText?: string;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { }, confirmText: 'Confirm' });

  const [isPickerOpen, setPickerOpen] = useState(false);
  const [promptToUse, setPromptToUse] = useState<LibraryItem | null>(null);
  const [soupPromptToLink, setSoupPromptToLink] = useState<LibraryItem | null>(null);

  useEffect(() => {
    if (!operationNotice) return;
    const timer = window.setTimeout(() => setOperationNotice(null), operationNotice.type === 'error' ? 12_000 : 7_000);
    return () => window.clearTimeout(timer);
  }, [operationNotice]);

  const handleLinkSoupResult = async (result: LibraryItem) => {
    if (!soupPromptToLink) return;
    await dispatch(updateLibraryItem({ id: soupPromptToLink.id, changes: { linkedResultId: result.id } })).unwrap();
    setSelectedItemModal(current => current?.id === soupPromptToLink.id ? { ...current, linkedResultId: result.id } : current);
    setSoupPromptToLink(null);
  };

  const handleUnlinkSoupResult = async (item: LibraryItem) => {
    await dispatch(updateLibraryItem({ id: item.id, changes: { linkedResultId: undefined } })).unwrap();
    setSelectedItemModal(current => current?.id === item.id ? { ...current, linkedResultId: undefined } : current);
  };

  // NEW: Effect to track loading time and show specific UI message if it hangs
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (libraryStatus === 'loading') {
      setIsTakingTooLong(false);
      timer = setTimeout(() => {
        setIsTakingTooLong(true);
      }, 4000); // 4s local timeout warning
    } else {
      setIsTakingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [libraryStatus]);

  useEffect(() => {
    void getActiveLibraryFolderName().then(setActiveLibraryFolderName).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeLibraryFolderName) {
      setPendingProjectChanges(null);
      return;
    }
    setIsCheckingProjectChanges(true);
    void (async () => {
      try {
        const quickStatus = await getLibraryFolderSyncStatus(items, false);
        if (cancelled) return;
        setPendingProjectChanges(quickStatus?.canRead ? quickStatus.pendingItemIds.length : null);
        if (!quickStatus?.canRead || quickStatus.pendingItemIds.length > 0) return;
        const verifiedStatus = await getLibraryFolderSyncStatus(items, true);
        if (!cancelled) setPendingProjectChanges(verifiedStatus?.canRead ? verifiedStatus.pendingItemIds.length : null);
      } catch {
        if (!cancelled) setPendingProjectChanges(null);
      } finally {
        if (!cancelled) setIsCheckingProjectChanges(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeLibraryFolderName, items]);

  // ... (handleImportClick, handleFileSelected, handleFilterClick, handleClearFilters, handleDelete, handleExport, handleClearLibrary logic unchanged) ...
  const handleImportClick = () => { fileInputRef.current?.click(); };
  const resolveAndUseItem = async (item: LibraryItem, callback: (resolvedItem: LibraryItem) => void) => {
    setIsResolvingItem(true);
    try {
      callback(await hydrateLibraryItem(item));
    } catch (error) {
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not load the Library media.' });
    } finally {
      setIsResolvingItem(false);
    }
  };
  const handleOpenItem = async (item: LibraryItem) => {
    setIsResolvingItem(true);
    try {
      setMediaViewerIndex(null);
      setSelectedItemModal(await hydrateLibraryItem(item));
    } catch (error) {
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not open the Library item.' });
    } finally {
      setIsResolvingItem(false);
    }
  };
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage(`Reading ${formatFileSize(file.size)} backup...`);
    try {
      const importFile = file.name.toLowerCase().endsWith('.json') ? importLibraryJsonFile : importLibraryArchive;
      await importFile(file, progress => {
        const percent = progress.totalBytes > 0 ? Math.round((progress.bytesRead / progress.totalBytes) * 100) : 0;
        const current = progress.currentName ? ` · ${progress.currentName}` : '';
        setImportMessage(`Importing ${percent}% · ${progress.importedCount} item(s)${current}`);
      });
      setImportMessage('Refreshing...');
      await dispatch(fetchLibrary());
    } catch (err: any) {
      setOperationNotice({ type: 'error', message: `Import failed: ${err.message}` });
    } finally {
      setIsImporting(false); setImportMessage('');
      if (e.target) e.target.value = '';
    }
  };
  const handleFilterClick = (type: LibraryItemType) => {
    setFilter(prev => {
      const next = prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type];
      if (type === 'image' && !next.includes('image')) {
        setImageProvider('');
        setImageWorkflow('');
      }
      if (type === 'character' && !next.includes('character')) {
        setCharacterProvider('');
        setCharacterWorkflow('');
      }
      return next;
    });
  };
  const handleClearFilters = () => {
    setFilter([]);
    setSearchTerm('');
    setImageProvider('');
    setImageWorkflow('');
    setCharacterProvider('');
    setCharacterWorkflow('');
    setSafetyFilter('all');
    setSelectedTagFilters([]);
  };
  const handleDelete = (id: number, name: string) => {
    setConfirmModal({
      isOpen: true, title: 'Confirm Deletion', message: <p>Delete <strong className="text-text-primary">{name}</strong>?</p>, confirmText: 'Delete',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false })); setDeletingId(id);
        try { await dispatch(deleteFromLibrary(id)).unwrap(); if (selectedItemModal?.id === id) setSelectedItemModal(null); }
        catch (err) { console.error(err); } finally { setDeletingId(null); }
      }
    });
  };
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportLibraryArchive(projectName, undefined, progress => setImportMessage(`Exporting ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error.';
      setOperationNotice({ type: 'error', message });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const getSelectedCategoryItems = () => {
    const selectedCategoryItems = items.filter(item => filter.includes(item.mediaType));
    const linkedResultIds = new Set(selectedCategoryItems
      .filter(item => item.mediaType === 'prompt' && item.linkedResultId != null)
      .map(item => item.linkedResultId!));
    return [...new Map([
      ...selectedCategoryItems,
      ...items.filter(item => linkedResultIds.has(item.id)),
    ].map(item => [item.id, item])).values()];
  };
  const handleExportSelectedCategories = async () => {
    const selectedItems = getSelectedCategoryItems();
    setIsExporting(true);
    try {
      await exportLibraryArchive(projectName, selectedItems, progress => setImportMessage(`Exporting ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error.';
      setOperationNotice({ type: 'error', message });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const handleExportCheckedItems = async () => {
    if (selectedItems.length === 0) return;
    setIsExporting(true);
    try {
      await exportLibraryArchive(projectName, selectedItems, progress => setImportMessage(`Exporting ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error.';
      setOperationNotice({ type: 'error', message });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const handleAddToExistingArchive = async () => {
    const selectedItems = filter.length > 0 ? getSelectedCategoryItems() : undefined;
    setIsExporting(true);
    try {
      const result = await addToExistingLibraryArchive(selectedItems, progress => setImportMessage(`Updating archive ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`));
      setOperationNotice({ type: 'success', message: `${result.added} item(s) added to the existing LAWIZ Library archive. ${result.retained} existing item(s) were preserved.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Unknown archive update error.';
      setOperationNotice({ type: 'error', message });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const handleExportByCategory = async () => {
    setIsExporting(true);
    try {
      const result = await exportLibraryArchivesByCategory(progress => {
        const current = progress.currentItem ? ` · ${progress.currentItem}` : '';
        setImportMessage(`Category ${progress.completedCategories}/${progress.totalCategories} · ${progress.currentCategory}${current}`);
      });
      setOperationNotice({ type: 'success', message: `${result.exportedItems} item(s) exported by category. ${result.created} archive(s) created and ${result.updated} archive(s) updated.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Unknown category export error.';
      setOperationNotice({ type: 'error', message });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const handleUpdateLibraryFolder = async () => {
    setIsExporting(true);
    try {
      const result = await exportLibraryFolder(undefined, progress => {
        const action = progress.stage === 'hashing' ? 'Checking' : 'Writing';
        setImportMessage(`${action} project folder ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`);
      });
      setActiveLibraryFolderName(result.directoryName);
      setPendingProjectChanges(0);
      setOperationNotice({ type: 'success', message: `Library Folder updated: ${result.added} item(s) added, ${result.replaced} replaced, ${result.removed} removed, ${result.assetsWritten} asset(s) written, and ${result.assetsReused} reused.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unknown Library Folder export error.' });
    } finally {
      setIsExporting(false);
      setImportMessage('');
    }
  };
  const handleImportLibraryFolder = async () => {
    setIsImporting(true);
    try {
      const result = await importLibraryFolder(progress => {
        setImportMessage(`Importing project folder ${progress.completed}/${progress.total}${progress.currentName ? ` · ${progress.currentName}` : ''}`);
      });
      setActiveLibraryFolderName(result.directoryName);
      setImportMessage('Refreshing...');
      await dispatch(fetchLibrary());
      setOperationNotice({ type: 'success', message: `${result.imported} item(s) imported from the Library Folder.` });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Unknown Library Folder import error.' });
    } finally {
      setIsImporting(false);
      setImportMessage('');
    }
  };
  const handleChooseLibraryFolder = async () => {
    try {
      setActiveLibraryFolderName(await chooseLibraryFolder());
      setPendingProjectChanges(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not select the Library Folder.' });
    }
  };
  const handleDeleteSelectedCategories = () => {
    const selectedItems = items.filter(item => filter.includes(item.mediaType));
    if (selectedItems.length === 0) return;
    const categoryLabels = FILTER_BUTTONS.filter(button => filter.includes(button.id)).map(button => button.label).join(', ');
    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Categories',
      message: <div className="space-y-2"><p>Permanently delete <strong className="text-text-primary">{selectedItems.length} item(s)</strong> from: <strong className="text-text-primary">{categoryLabels}</strong>?</p><p className="font-semibold text-danger">This cannot be undone.</p></div>,
      confirmText: `Delete ${selectedItems.length} item(s)`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsDeletingCategories(true);
        try {
          const ids = selectedItems.map(item => item.id);
          await dispatch(deleteManyFromLibrary(ids)).unwrap();
          if (selectedItemModal && ids.includes(selectedItemModal.id)) closeItemModal();
        } catch (error) {
          setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not delete the selected categories.' });
        } finally {
          setIsDeletingCategories(false);
        }
      },
    });
  };
  const handleClearLibrary = () => {
    setConfirmModal({
      isOpen: true, title: 'Clear Entire Library', message: 'Permanently delete ALL items?', confirmText: 'Clear All',
      onConfirm: () => { setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => { } }); dispatch(clearLibraryItems()); }
    });
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (filter.length > 0) filtered = filtered.filter(item => filter.includes(item.mediaType));
    if (filter.includes('image') && (imageProvider || imageWorkflow)) {
      filtered = filtered.filter(item => item.mediaType !== 'image'
        || ((!imageProvider || item.options?.provider === imageProvider)
          && (!imageWorkflow || getImageWorkflow(item) === imageWorkflow)));
    }
    if (filter.includes('character') && (characterProvider || characterWorkflow)) {
      filtered = filtered.filter(item => item.mediaType !== 'character'
        || ((!characterProvider || item.options?.provider === characterProvider)
          && (!characterWorkflow || getCharacterWorkflow(item) === characterWorkflow)));
    }
    if (safetyFilter !== 'all') {
      filtered = filtered.filter(item => safetyFilter === 'unrated' ? !item.safetyRating : item.safetyRating === safetyFilter);
    }
    if (selectedTagFilters.length > 0) {
      filtered = filtered.filter(item => selectedTagFilters.every(tag => item.tags?.includes(tag)));
    }
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch) filtered = filtered.filter(item => getLibrarySearchText(item).includes(normalizedSearch));
    return [...filtered].sort((left, right) => {
      let comparison = 0;
      if (sortField === 'rating') {
        const leftRating = getValidRating(left.rating);
        const rightRating = getValidRating(right.rating);
        if (leftRating === undefined && rightRating !== undefined) return 1;
        if (leftRating !== undefined && rightRating === undefined) return -1;
        if (leftRating !== undefined && rightRating !== undefined) comparison = leftRating - rightRating;
      }
      if (sortField === 'name') comparison = (left.name || '').localeCompare(right.name || '', undefined, { sensitivity: 'base' });
      else if (sortField === 'rating') comparison = (getValidRating(left.rating) || 0) - (getValidRating(right.rating) || 0);
      else comparison = left.id - right.id;
      if (comparison === 0) comparison = left.id - right.id;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [items, filter, searchTerm, imageProvider, imageWorkflow, characterProvider, characterWorkflow, safetyFilter, selectedTagFilters, sortField, sortDirection]);

  const imageProviders = useMemo(() => [...new Set(items
    .filter(item => item.mediaType === 'image' && item.options?.provider)
    .map(item => item.options!.provider!))].sort(), [items]);
  const imageWorkflows = useMemo(() => [...new Set(items
    .filter(item => item.mediaType === 'image' && (!imageProvider || item.options?.provider === imageProvider))
    .map(getImageWorkflow)
    .filter(Boolean))].sort(), [items, imageProvider]);
  const characterProviders = useMemo(() => [...new Set(items
    .filter(item => item.mediaType === 'character' && item.options?.provider)
    .map(item => item.options!.provider!))].sort(), [items]);
  const characterWorkflows = useMemo(() => [...new Set(items
    .filter(item => item.mediaType === 'character' && (!characterProvider || item.options?.provider === characterProvider))
    .map(getCharacterWorkflow)
    .filter(Boolean))].sort(), [items, characterProvider]);
  const availableTags = useMemo(() => [...new Set(items.flatMap(item => item.tags || []))]
    .sort((left, right) => left.localeCompare(right)), [items]);
  useEffect(() => {
    const availableTagSet = new Set(availableTags);
    setSelectedTagFilters(previous => {
      const next = previous.filter(tag => availableTagSet.has(tag));
      return next.length === previous.length ? previous : next;
    });
  }, [availableTags]);
  const safetyCounts = useMemo(() => ({
    all: items.length,
    sfw: items.filter(item => item.safetyRating === 'sfw').length,
    nsfw: items.filter(item => item.safetyRating === 'nsfw').length,
  }), [items]);

  const filteredTaggableItems = useMemo(() => filteredItems.filter(item => TAGGABLE_MEDIA_TYPES.has(item.mediaType)), [filteredItems]);
  const selectedItems = useMemo(() => filteredTaggableItems.filter(item => selectedItemIds.has(item.id)), [filteredTaggableItems, selectedItemIds]);
  const actionTargetItems = selectedItems.length > 0 ? selectedItems : filteredTaggableItems;

  useEffect(() => {
    const filteredIds = new Set(filteredTaggableItems.map(item => item.id));
    setSelectedItemIds(previous => {
      const next = new Set([...previous].filter(id => filteredIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filteredTaggableItems]);

  const toggleItemSelection = (id: number) => {
    setSelectedItemIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteCheckedItems = () => {
    const itemsToDelete = [...selectedItems];
    if (itemsToDelete.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Items',
      message: <div className="space-y-2"><p>Permanently delete the <strong className="text-text-primary">{itemsToDelete.length} checked item(s)</strong>?</p><p className="font-semibold text-danger">This cannot be undone.</p></div>,
      confirmText: `Delete ${itemsToDelete.length} item(s)`,
      onConfirm: async () => {
        setConfirmModal(previous => ({ ...previous, isOpen: false }));
        setIsDeletingSelected(true);
        try {
          const ids = itemsToDelete.map(item => item.id);
          await dispatch(deleteManyFromLibrary(ids)).unwrap();
          setSelectedItemIds(previous => new Set([...previous].filter(id => !ids.includes(id))));
          if (selectedItemModal && ids.includes(selectedItemModal.id)) closeItemModal();
        } catch (error) {
          setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not delete the checked items.' });
        } finally {
          setIsDeletingSelected(false);
        }
      },
    });
  };

  const updateVisibleItems = async (getChanges: (item: LibraryItem) => Partial<LibraryItem> | null) => {
    const updates = actionTargetItems.map(item => ({ item, changes: getChanges(item) }))
      .filter((entry): entry is { item: LibraryItem; changes: Partial<LibraryItem> } => entry.changes !== null)
      .map(({ item, changes }) => ({ id: item.id, changes }));
    if (updates.length === 0) return;
    setIsUpdatingTags(true);
    try {
      await dispatch(updateLibraryItems(updates)).unwrap();
    } finally {
      setIsUpdatingTags(false);
    }
  };

  const classifyVisibleItems = () => updateVisibleItems(item => {
    if (item.safetyRating) return null;
    const searchableText = getLibrarySearchText(item);
    if (NSFW_TEXT_PATTERN.test(searchableText)) return { safetyRating: 'nsfw' };
    if (SFW_TEXT_PATTERN.test(searchableText)) return { safetyRating: 'sfw' };
    return null;
  });

  const setVisibleSafety = (safetyRating: LibraryItem['safetyRating']) => updateVisibleItems(() => ({ safetyRating }));

  const confirmVisibleSafety = (safetyRating: LibraryItem['safetyRating']) => {
    if (actionTargetCount === 0) return;
    const actionLabel = safetyRating === 'sfw' ? 'Mark SFW' : safetyRating === 'nsfw' ? 'Mark NSFW' : 'Clear safety';
    const targetDescription = selectedItems.length > 0 ? 'selected' : 'matching';
    setConfirmModal({
      isOpen: true,
      title: actionLabel,
      message: <p>Apply <strong className="text-text-primary">{actionLabel}</strong> to <strong className="text-text-primary">{actionTargetCount} {targetDescription} item(s)</strong>?</p>,
      confirmText: `${actionLabel} (${actionTargetCount})`,
      onConfirm: async () => {
        setConfirmModal(previous => ({ ...previous, isOpen: false }));
        try {
          await setVisibleSafety(safetyRating);
        } catch (error) {
          setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not update the safety classification.' });
        }
      },
    });
  };

  const addTagToVisibleItems = async () => {
    const tag = normalizeTag(bulkTag);
    if (!tag) return;
    await updateVisibleItems(item => item.tags?.includes(tag) ? null : { tags: [...(item.tags || []), tag] });
    setBulkTag('');
  };

  const removeTagFromVisibleItems = async () => {
    const tag = normalizeTag(bulkTag);
    if (!tag) return;
    await updateVisibleItems(item => item.tags?.includes(tag) ? { tags: item.tags.filter(candidate => candidate !== tag) } : null);
    setSelectedTagFilters(previous => previous.filter(candidate => candidate !== tag));
    setBulkTag('');
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTagFilters(previous => previous.includes(tag)
      ? previous.filter(candidate => candidate !== tag)
      : [...previous, tag]);
  };

  const updateSelectedItemMetadata = async (changes: Partial<LibraryItem>) => {
    if (!selectedItemModal) return;
    await dispatch(updateLibraryItem({ id: selectedItemModal.id, changes })).unwrap();
    setSelectedItemModal(current => current ? { ...current, ...changes } : current);
  };

  const updateSelectedItemRating = async (rating: LibraryItem['rating']) => {
    try {
      await updateSelectedItemMetadata({ rating });
    } catch (error) {
      setOperationNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not update the rating.' });
    }
  };

  const addSelectedItemTag = async () => {
    if (!selectedItemModal) return;
    const tag = normalizeTag(itemTag);
    if (!tag || selectedItemModal.tags?.includes(tag)) return;
    await updateSelectedItemMetadata({ tags: [...(selectedItemModal.tags || []), tag] });
    setItemTag('');
  };

  const removeSelectedItemTag = (tag: string) => updateSelectedItemMetadata({
    tags: selectedItemModal?.tags?.filter(candidate => candidate !== tag) || [],
  });

  const visibleTaggableCount = filteredTaggableItems.length;
  const actionTargetCount = actionTargetItems.length;

  useEffect(() => { setCurrentPage(1); }, [filteredItems.length, itemsPerPage]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);
  const currentPageTaggableItems = useMemo(() => paginatedItems.filter(item => TAGGABLE_MEDIA_TYPES.has(item.mediaType)), [paginatedItems]);

  const totalPages = useMemo(() => Math.ceil(filteredItems.length / itemsPerPage), [filteredItems, itemsPerPage]);
  const selectedCategoryItemCount = useMemo(() => items.filter(item => filter.includes(item.mediaType)).length, [filter, items]);
  const hasPendingProjectChanges = pendingProjectChanges !== null && pendingProjectChanges > 0;
  const categoryItemCounts = useMemo(() => {
    const counts = new Map<LibraryItemType, number>();
    for (const item of items) counts.set(item.mediaType, (counts.get(item.mediaType) || 0) + 1);
    return counts;
  }, [items]);

  const visualMedia = useMemo(() => getLibraryVisualMedia(selectedItemModal), [selectedItemModal]);
  const closeItemModal = useCallback(() => {
    setMediaViewerIndex(null);
    setSelectedItemModal(null);
  }, []);
  const openMediaViewer = (index: number) => {
    setMediaViewerScale('fit');
    setMediaViewerIndex(index);
  };
  const showPreviousMedia = useCallback(() => {
    setMediaViewerIndex(current => current === null || visualMedia.length < 2 ? current : (current - 1 + visualMedia.length) % visualMedia.length);
  }, [visualMedia.length]);
  const showNextMedia = useCallback(() => {
    setMediaViewerIndex(current => current === null || visualMedia.length < 2 ? current : (current + 1) % visualMedia.length);
  }, [visualMedia.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (mediaViewerIndex !== null) {
      if (e.key === 'Escape') setMediaViewerIndex(null);
      else if (e.key === 'ArrowLeft') showPreviousMedia();
      else if (e.key === 'ArrowRight') showNextMedia();
      return;
    }
    if (e.key === 'Escape') closeItemModal();
  }, [closeItemModal, mediaViewerIndex, showNextMedia, showPreviousMedia]);
  useEffect(() => { if (selectedItemModal) window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [selectedItemModal, handleKeyDown]);

  const clearHoverObjectUrl = () => {
    if (hoverObjectUrlRef.current) URL.revokeObjectURL(hoverObjectUrlRef.current);
    hoverObjectUrlRef.current = null;
  };
  useEffect(() => () => clearHoverObjectUrl(), []);
  const handleMouseEnterSource = async (e: React.MouseEvent, item: LibraryItem) => {
    const requestId = ++hoverRequestRef.current;
    const position = { x: e.clientX, y: e.clientY };
    clearHoverObjectUrl();
    const linkedResult = item.linkedResultId ? items.find(candidate => candidate.id === item.linkedResultId) : undefined;
    const inlineImage = linkedResult?.thumbnail || linkedResult?.media || item.sourceImage;
    if (inlineImage) {
      setHoveredSource({ src: inlineImage, ...position });
      return;
    }
    const assetRef = linkedResult?.assetRefs?.media || item.assetRefs?.sourceImage;
    if (!assetRef) {
      setHoveredSource(null);
      return;
    }
    try {
      const objectUrl = await createLibraryAssetObjectUrl(assetRef);
      if (requestId !== hoverRequestRef.current) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      hoverObjectUrlRef.current = objectUrl;
      setHoveredSource({ src: objectUrl, ...position });
    } catch (error) {
      console.warn(`Could not load hover preview for Library item ${item.id}.`, error);
    }
  };
  const handleMouseLeaveSource = () => {
    hoverRequestRef.current += 1;
    clearHoverObjectUrl();
    setHoveredSource(null);
  };
  const getItemThumbnail = (item: LibraryItem) => item.thumbnail || (item.mediaType === 'video' ? createVideoPlaceholderThumbnail() : '');

  const renderItemViews = () => {
    if (libraryStatus === 'loading') {
      return (
        <div className="flex flex-col justify-center items-center py-16 space-y-4">
          <SpinnerIcon className="w-12 h-12 text-accent animate-spin" />
          {isTakingTooLong && (
            <div className="text-center animate-fade-in">
              <p className="text-text-secondary text-sm mb-2">Taking longer than expected...</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-bg-tertiary rounded-lg text-text-primary hover:bg-bg-tertiary-hover text-sm flex items-center gap-2 mx-auto"
              >
                <RefreshIcon className="w-4 h-4" /> Refresh Page
              </button>
            </div>
          )}
        </div>
      );
    }
    // ... (rest of renderItemViews unchanged) ...
    if (filteredItems.length === 0) {
      return (
        <div className="text-center py-16 text-text-secondary">
          <LibraryIcon className="w-16 h-16 mx-auto text-border-primary mb-4" />
          <h3 className="font-bold text-lg text-text-primary">No Items Found</h3>
          <p>Your library is empty or no items match your current filters.</p>
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <div className="flex flex-col gap-1.5">
          {paginatedItems.map(item => (
            <div key={item.id} className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-bg-tertiary ${selectedItemIds.has(item.id) ? 'ring-2 ring-accent' : ''}`} onClick={() => handleOpenItem(item)} onMouseEnter={(e) => { if (item.mediaType === 'prompt' || item.mediaType === 'color-palette') void handleMouseEnterSource(e, item); }} onMouseLeave={handleMouseLeaveSource}>
              {TAGGABLE_MEDIA_TYPES.has(item.mediaType) && <input type="checkbox" aria-label={`Select ${item.name || `item ${item.id}`}`} checked={selectedItemIds.has(item.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleItemSelection(item.id)} className="h-5 w-5 flex-shrink-0 accent-accent" />}
              <img src={getItemThumbnail(item)} alt={item.name} className="w-10 h-10 object-cover rounded-md flex-shrink-0" />
              <div className="flex-shrink-0 text-text-secondary">{getCategoryIcon(item.mediaType, "w-5 h-5")}</div>
              <div className="min-w-0 flex-grow"><p className="truncate text-sm font-medium text-text-primary">{item.name}</p><div className="mt-0.5 flex flex-wrap items-center gap-1"><span className="text-xs text-text-muted">Created: {new Date(item.id).toLocaleDateString()}</span>{getValidRating(item.rating) && <RatingStars rating={item.rating} />}{item.safetyRating && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${item.safetyRating === 'nsfw' ? 'bg-red-600' : 'bg-blue-600'}`}>{item.safetyRating}</span>}{item.tags?.map(tag => <span key={tag} className="rounded bg-bg-primary px-1.5 py-0.5 text-[10px] text-text-secondary">#{tag}</span>)}</div></div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button disabled={isResolvingItem} onClick={(e) => { e.stopPropagation(); if (item.mediaType === 'prompt') { setPromptToUse(item); setPickerOpen(true); } else { void resolveAndUseItem(item, onLoadItem); } }} title={item.mediaType === 'prompt' ? 'Use Prompt' : 'Load in Generator'} className="p-1.5 rounded-full hover:bg-bg-primary text-text-secondary hover:text-accent disabled:opacity-50">{item.mediaType === 'prompt' ? <SendIcon className="w-4 h-4" /> : <LoadIcon className="w-4 h-4" />}</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.name || `Item #${item.id}`); }} disabled={deletingId === item.id} title="Delete Item" className="p-1.5 rounded-full hover:bg-bg-primary text-text-secondary hover:text-danger">{deletingId === item.id ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}</button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const gridClasses = viewMode === 'grid' ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8" : "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 2xl:grid-cols-16";
    return (
      <div className={`grid ${gridClasses} gap-4`}>
        {paginatedItems.map(item => (
          <div key={item.id} className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-bg-tertiary shadow-md ${selectedItemIds.has(item.id) ? 'ring-4 ring-accent ring-offset-2 ring-offset-bg-secondary' : ''}`} onClick={() => handleOpenItem(item)} onMouseEnter={(e) => { if (item.mediaType === 'prompt' || item.mediaType === 'color-palette') void handleMouseEnterSource(e, item); }} onMouseLeave={handleMouseLeaveSource}>
            <img src={getItemThumbnail(item)} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 p-2 text-white transform translate-y-4 group-hover:translate-y-0 transition-transform"><p className="text-xs font-bold truncate max-w-full">{item.name}</p></div>
            <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>{getCategoryIcon(item.mediaType, "w-4 h-4 text-white")}</div>
            {TAGGABLE_MEDIA_TYPES.has(item.mediaType) && <label className="absolute left-2 top-2 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-md bg-black/75 shadow" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${item.name || `item ${item.id}`}`} checked={selectedItemIds.has(item.id)} onChange={() => toggleItemSelection(item.id)} className="h-5 w-5 accent-accent" /></label>}
            {getValidRating(item.rating) && <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-1 shadow"><RatingStars rating={item.rating} className={viewMode === 'smallGrid' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} /></span>}
            {item.safetyRating && <span className={`absolute left-2 top-12 rounded px-2 py-1 text-[10px] font-bold uppercase text-white shadow ${item.safetyRating === 'nsfw' ? 'bg-red-600' : 'bg-blue-600'}`}>{item.safetyRating}</span>}
            {item.tags?.length ? <div className="absolute bottom-8 left-2 right-2 flex flex-wrap gap-1 opacity-0 transition-opacity group-hover:opacity-100">{item.tags.slice(0, 3).map(tag => <span key={tag} className="max-w-full truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">#{tag}</span>)}</div> : null}
          </div>
        ))}
      </div>
    );
  };

  const PaginationControls = ({ placement }: { placement: 'top' | 'bottom' }) => {
    const pageCount = Math.max(1, totalPages);
    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 border-border-primary ${placement === 'top' ? 'mb-4 border-b pb-3' : 'mt-6 border-t pt-4'}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor={`items-per-page-${placement}`} className="text-xs font-semibold text-text-secondary">Items per page</label>
            <select id={`items-per-page-${placement}`} value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="h-8 bg-bg-tertiary border border-border-primary rounded-md px-2 text-xs focus:ring-accent focus:border-accent">
            <option value={12}>12</option><option value={20}>20</option><option value={48}>48</option><option value={96}>96</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`page-select-${placement}`} className="text-xs font-semibold text-text-secondary">Page</label>
            <select id={`page-select-${placement}`} value={Math.min(currentPage, pageCount)} onChange={(e) => setCurrentPage(Number(e.target.value))} className="h-8 min-w-16 bg-bg-tertiary border border-border-primary rounded-md px-2 text-xs focus:ring-accent focus:border-accent">
              {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
            <span className="text-xs text-text-muted">of {pageCount} · {filteredItems.length} item(s)</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="First Page"><ChevronDoubleLeftIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Previous Page"><ChevronLeftIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))} disabled={currentPage >= pageCount} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Next Page"><ChevronRightIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(pageCount)} disabled={currentPage >= pageCount} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Last Page"><ChevronDoubleRightIcon className="w-5 h-5" /></button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-accent">Library</h2>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                <LibraryIcon className="h-4 w-4 text-accent" />
                <span>Project folder: <strong className="text-text-primary">{activeLibraryFolderName || 'Not selected'}</strong></span>
                <button type="button" onClick={handleChooseLibraryFolder} disabled={isImporting || isExporting || isSyncing} className="font-semibold text-accent hover:underline disabled:opacity-50">{activeLibraryFolderName ? 'Change' : 'Choose'}</button>
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 bg-bg-primary rounded-full">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="Large Grid View"><Squares2X2Icon className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('smallGrid')} className={`p-2 rounded-full transition-colors ${viewMode === 'smallGrid' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="Small Grid View"><Squares2X2Icon className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-full transition-colors ${viewMode === 'list' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="List View"><ListBulletIcon className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-primary bg-bg-primary p-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                Sort by
                <select aria-label="Sort Library by" value={sortField} onChange={(event) => setSortField(event.target.value as LibrarySortField)} className="h-8 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs text-text-primary focus:border-accent focus:ring-accent">
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                  <option value="rating">Rating</option>
                </select>
              </label>
              <button type="button" onClick={() => setSortDirection(previous => previous === 'asc' ? 'desc' : 'asc')} aria-label={`Change sort order to ${sortDirection === 'asc' ? 'descending' : 'ascending'}`} className="flex h-8 items-center gap-1.5 rounded-md border border-border-primary bg-bg-tertiary px-2.5 text-xs font-semibold text-text-primary hover:bg-bg-tertiary-hover" title="Toggle ascending or descending order">
                <ChevronRightIcon className={`h-4 w-4 transition-transform ${sortDirection === 'asc' ? '-rotate-90' : 'rotate-90'}`} />
                {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              </button>
            </div>
            <div className="flex w-full items-stretch gap-1 rounded-lg border border-border-primary bg-bg-primary p-1 sm:w-auto" role="group" aria-label="Main safety filter">
              {([
                { value: 'all' as const, label: 'ALL', count: safetyCounts.all, activeClass: 'bg-accent text-accent-text' },
                { value: 'sfw' as const, label: 'SFW', count: safetyCounts.sfw, activeClass: 'bg-blue-600 text-white' },
                { value: 'nsfw' as const, label: 'NSFW', count: safetyCounts.nsfw, activeClass: 'bg-red-600 text-white' },
              ]).map(option => (
                <button key={option.value} type="button" onClick={() => setSafetyFilter(option.value)} aria-pressed={safetyFilter === option.value} className={`min-w-0 flex-1 rounded-md px-2 py-2.5 text-sm font-black transition-colors sm:min-w-24 sm:px-4 ${safetyFilter === option.value ? option.activeClass : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>
                  {option.label} <span className="ml-1 text-xs opacity-75">{option.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isDriveConfigured && (
              <button onClick={onSyncWithDrive} disabled={!isDriveConnected || isSyncing || isImporting} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                {isSyncing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GoogleDriveIcon className="w-5 h-5" />}
                {isSyncing ? 'Syncing...' : 'Sync with Drive'}
              </button>
            )}
            <button onClick={handleImportClick} disabled={isImporting || isExporting || isSyncing} title="Import a .lawiz-library archive or legacy JSON backup" className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              {isImporting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <UploadIconSimple className="w-5 h-5" />}
              {isImporting ? 'Importing...' : 'Import archive'}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".lawiz-library,.json,application/zip,application/json" onChange={handleFileSelected} />
            <button onClick={handleImportLibraryFolder} disabled={isImporting || isExporting || isSyncing} title="Import a Library Folder project into the local Library" className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              <LoadIcon className="w-5 h-5" /> Open project folder
            </button>
            <button onClick={handleUpdateLibraryFolder} disabled={(items.length === 0 && !hasPendingProjectChanges) || isImporting || isExporting || isSyncing || isCheckingProjectChanges} title={hasPendingProjectChanges ? `${pendingProjectChanges} item(s) need to be added, updated, or removed from the project folder` : 'Incrementally update the active Library Folder project'} className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 ${hasPendingProjectChanges ? 'bg-amber-400 text-zinc-950 ring-2 ring-amber-200 hover:bg-amber-300' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}>
              {isCheckingProjectChanges ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <LibraryIcon className="w-5 h-5" />}
              {hasPendingProjectChanges ? 'Sync folder changes' : isCheckingProjectChanges ? 'Checking project...' : 'Update project folder'}
              {hasPendingProjectChanges && <span className="flex min-w-7 items-center justify-center rounded-full bg-zinc-950 px-1.5 py-0.5 text-xs font-bold text-amber-300" aria-label={`${pendingProjectChanges} pending changes`}>+{pendingProjectChanges}</span>}
            </button>
            <button onClick={handleExport} disabled={items.length === 0 || isImporting || isExporting || isSyncing} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              <FileExportIcon className="w-5 h-5" /> New archive
            </button>
            <button onClick={handleAddToExistingArchive} disabled={items.length === 0 || (filter.length > 0 && selectedCategoryItemCount === 0) || isImporting || isExporting || isSyncing} title={filter.length > 0 ? 'Add the selected categories to an existing archive' : 'Add the entire Library to an existing archive'} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              <LibraryIcon className="w-5 h-5" /> Add to existing
            </button>
            <button onClick={handleExportByCategory} disabled={items.length === 0 || isImporting || isExporting || isSyncing} title="Create or update one LMG archive per Library category" className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              <FileExportIcon className="w-5 h-5" /> Export by category
            </button>
            <button onClick={handleExportSelectedCategories} disabled={filter.length === 0 || selectedCategoryItemCount === 0 || isImporting || isExporting || isSyncing} title={filter.length === 0 ? 'Select one or more categories first' : 'Export selected categories and linked prompt images'} className="flex items-center gap-2 bg-accent text-accent-text font-semibold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50">
              <FileExportIcon className="w-5 h-5" /> Export categories
            </button>
            <button onClick={handleExportCheckedItems} disabled={selectedItems.length === 0 || isImporting || isExporting || isSyncing} title={selectedItems.length === 0 ? 'Check one or more Library items first' : `Export exactly ${selectedItems.length} checked item(s)`} className="flex items-center gap-2 bg-emerald-600 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg">
              <CheckIcon className="h-5 w-5" /> Export checked ({selectedItems.length})
            </button>
          </div>
        </div>

        {(isSyncing || isImporting || isExporting) && <p className="text-sm text-accent text-center mb-4">{isImporting || isExporting ? importMessage : syncMessage}</p>}
        {operationNotice && (
          <div role={operationNotice.type === 'error' ? 'alert' : 'status'} className={`mb-4 flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${operationNotice.type === 'error' ? 'border-danger/50 bg-danger-bg text-danger' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
            <p>{operationNotice.message}</p>
            <button type="button" onClick={() => setOperationNotice(null)} aria-label="Dismiss notification" className="flex-shrink-0 rounded p-0.5 opacity-75 hover:bg-black/10 hover:opacity-100">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {libraryError && libraryStatus === 'failed' && (
          <div className="bg-danger-bg text-danger text-sm p-3 rounded-md mb-4 animate-fade-in" role="alert">
            <p className="font-bold">A library operation failed:</p>
            <p>{libraryError}</p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 p-3 bg-bg-primary/50 rounded-lg border border-border-primary/50">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <input type="search" aria-label="Search Library" placeholder="Search all text..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-9 w-full shrink-0 bg-bg-tertiary border border-border-primary rounded-md px-3 text-sm focus:ring-accent focus:border-accent sm:w-64" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-text-secondary mr-2">Filter:</p>
              {FILTER_BUTTONS.map(({ id, label, icon }) => (
                <button key={id} onClick={() => handleFilterClick(id)} title={label} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${filter.includes(id) ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>
                  {icon}<span>{label}</span><span className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${filter.includes(id) ? 'bg-black/25' : 'bg-bg-primary text-text-muted'}`}>{categoryItemCounts.get(id) || 0}</span>
                </button>
              ))}
              {(filter.length > 0 || searchTerm || safetyFilter !== 'all' || selectedTagFilters.length > 0) && <button onClick={handleClearFilters} className="text-xs text-accent hover:underline">Clear</button>}
              {filter.length > 0 && <button type="button" onClick={handleDeleteSelectedCategories} disabled={isDeletingCategories || selectedCategoryItemCount === 0} className="ml-auto flex items-center gap-1.5 rounded-md bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger hover:text-white disabled:opacity-50"><TrashIcon className="h-4 w-4" /> {isDeletingCategories ? 'Deleting...' : 'Delete selected categories'}</button>}
            </div>
          </div>
          {filter.includes('image') && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-primary/50 pt-3">
              <span className="text-xs font-bold uppercase text-text-muted">Images</span>
              <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                Provider
                <select value={imageProvider} onChange={(event) => { setImageProvider(event.target.value); setImageWorkflow(''); }} className="h-8 min-w-32 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                  <option value="">All providers</option>
                  {imageProviders.map(provider => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                Workflow
                <select value={imageWorkflow} onChange={(event) => setImageWorkflow(event.target.value)} className="h-8 min-w-40 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                  <option value="">All workflows</option>
                  {imageWorkflows.map(workflow => <option key={workflow} value={workflow}>{workflow}</option>)}
                </select>
              </label>
            </div>
          )}
          {filter.includes('character') && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-primary/50 pt-3">
              <span className="text-xs font-bold uppercase text-text-muted">Characters</span>
              <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                Provider
                <select value={characterProvider} onChange={(event) => { setCharacterProvider(event.target.value); setCharacterWorkflow(''); }} className="h-8 min-w-32 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                  <option value="">All providers</option>
                  {characterProviders.map(provider => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                Workflow
                <select value={characterWorkflow} onChange={(event) => setCharacterWorkflow(event.target.value)} className="h-8 min-w-40 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                  <option value="">All workflows</option>
                  {characterWorkflows.map(workflow => <option key={workflow} value={workflow}>{workflow}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="mt-3 border-t border-border-primary/50 pt-3">
            <button type="button" onClick={() => setIsSafetyTagsOpen(previous => !previous)} aria-expanded={isSafetyTagsOpen} aria-controls="library-safety-tags-controls" className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-bg-tertiary">
              <span className="text-xs font-bold uppercase text-text-muted">Safety & Tags</span>
              <span className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                {(safetyFilter !== 'all' || selectedTagFilters.length > 0) && <span className="rounded-full bg-accent px-2 py-0.5 text-accent-text">{(safetyFilter !== 'all' ? 1 : 0) + selectedTagFilters.length} active</span>}
                <ChevronRightIcon className={`h-4 w-4 transition-transform ${isSafetyTagsOpen ? 'rotate-90' : ''}`} />
              </span>
            </button>
            {isSafetyTagsOpen && <div id="library-safety-tags-controls" className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Safety filter" value={safetyFilter} onChange={(event) => setSafetyFilter(event.target.value as SafetyFilter)} className="h-8 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                <option value="all">All safety</option>
                <option value="sfw">SFW</option>
                <option value="nsfw">NSFW</option>
                <option value="unrated">Unrated</option>
              </select>
              <button type="button" onClick={() => void classifyVisibleItems()} disabled={isUpdatingTags || visibleTaggableCount === 0} className="h-8 rounded-md border border-amber-400/60 px-3 text-xs font-bold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50" title="Classify unrated visible items from names, prompts and generation metadata">Detect common terms</button>
              <button type="button" onClick={() => setSelectedItemIds(new Set(currentPageTaggableItems.map(item => item.id)))} disabled={currentPageTaggableItems.length === 0} title={`Select the ${currentPageTaggableItems.length} selectable item(s) displayed on this page`} className="h-8 rounded-md border border-border-primary px-3 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-50">Select page</button>
              <button type="button" onClick={() => setSelectedItemIds(new Set(filteredTaggableItems.map(item => item.id)))} disabled={filteredTaggableItems.length === 0} title={`Select all ${filteredTaggableItems.length} item(s) matching the current filters and search`} className="h-8 rounded-md border border-accent/60 px-3 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50">Select all results</button>
              <button type="button" onClick={() => setSelectedItemIds(new Set())} disabled={selectedItems.length === 0} title="Clear the complete selection" className="h-8 rounded-md border border-border-primary px-3 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-50">Deselect all</button>
              <button type="button" onClick={handleDeleteCheckedItems} disabled={selectedItems.length === 0 || isDeletingSelected} title={selectedItems.length === 0 ? 'Check one or more Library items first' : `Delete exactly ${selectedItems.length} checked item(s)`} className="flex h-8 items-center gap-1.5 rounded-md border border-danger/60 px-3 text-xs font-bold text-danger hover:bg-danger-bg disabled:opacity-50">
                {isDeletingSelected ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : <TrashIcon className="h-3.5 w-3.5" />} Delete selected
              </button>
              <span className={`text-xs font-semibold ${selectedItems.length ? 'text-accent' : 'text-text-muted'}`}>{selectedItems.length ? `${selectedItems.length} selected` : `${visibleTaggableCount} matching`}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => confirmVisibleSafety('sfw')} disabled={isUpdatingTags || actionTargetCount === 0} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">Mark SFW</button>
              <button type="button" onClick={() => confirmVisibleSafety('nsfw')} disabled={isUpdatingTags || actionTargetCount === 0} className="h-8 rounded-md bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50">Mark NSFW</button>
              <button type="button" onClick={() => confirmVisibleSafety(undefined)} disabled={isUpdatingTags || actionTargetCount === 0} className="h-8 rounded-md border border-border-primary px-3 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-50">Clear safety</button>
              {availableTags.length > 0 && <select aria-label="Choose existing tag for bulk edit" value="" onChange={(event) => setBulkTag(event.target.value)} className="h-8 min-w-36 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent">
                <option value="">Existing tag...</option>
                {availableTags.map(tag => <option key={tag} value={tag}>#{tag}</option>)}
              </select>}
              <input aria-label="Bulk custom tag" value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addTagToVisibleItems(); }} placeholder="Custom tag..." className="h-8 w-40 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs focus:border-accent focus:ring-accent" />
              <button type="button" onClick={() => void addTagToVisibleItems()} disabled={isUpdatingTags || actionTargetCount === 0 || !normalizeTag(bulkTag)} className="h-8 rounded-md bg-accent px-3 text-xs font-bold text-accent-text hover:bg-accent-hover disabled:opacity-50">Add tag</button>
              <button type="button" onClick={() => void removeTagFromVisibleItems()} disabled={isUpdatingTags || actionTargetCount === 0 || !normalizeTag(bulkTag)} className="h-8 rounded-md border border-danger/50 px-3 text-xs font-bold text-danger hover:bg-danger-bg disabled:opacity-50">Remove tag</button>
              {isUpdatingTags && <SpinnerIcon className="h-4 w-4 animate-spin text-accent" />}
            </div>
            {availableTags.length > 0 && <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tag filters">
              <button type="button" onClick={() => setSelectedTagFilters([])} aria-pressed={selectedTagFilters.length === 0} className={`h-7 rounded-full border px-2.5 text-xs font-semibold transition-colors ${selectedTagFilters.length === 0 ? 'border-accent bg-accent text-accent-text' : 'border-border-primary text-text-secondary hover:bg-bg-tertiary'}`}>All tags</button>
              {availableTags.map(tag => {
                const isActive = selectedTagFilters.includes(tag);
                return <button key={tag} type="button" onClick={() => toggleTagFilter(tag)} aria-pressed={isActive} className={`h-7 max-w-48 truncate rounded-full border px-2.5 text-xs font-semibold transition-colors ${isActive ? 'border-accent bg-accent text-accent-text' : 'border-border-primary bg-bg-primary text-text-secondary hover:bg-bg-tertiary'}`} title={`Filter by #${tag}`}>#{tag}</button>;
              })}
            </div>}
            </div>}
          </div>
        </div>

        <PaginationControls placement="top" />
        {renderItemViews()}
        <PaginationControls placement="bottom" />

        <div className="mt-8 pt-4 border-t border-danger-bg">
          <button onClick={handleClearLibrary} disabled={isImporting || isSyncing} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors disabled:opacity-50">
            <TrashIcon className="w-5 h-5" /> Clear Entire Local Library
          </button>
        </div>
      </div>

      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} confirmText={confirmModal.confirmText} />
      {hoveredSource && <div style={{ position: 'fixed', top: hoveredSource.y + 20, left: hoveredSource.x + 20, zIndex: 100 }} className="pointer-events-none animate-fade-in"><img src={hoveredSource.src} className="w-48 h-48 object-cover rounded-lg shadow-2xl border-2 border-accent" alt="Source Preview" /></div>}
      {selectedItemModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="library-item-title" onClick={closeItemModal}>
          <div className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 id="library-item-title" className="text-xl font-bold text-accent flex items-center gap-2">{getCategoryIcon(selectedItemModal.mediaType, "w-6 h-6")}{selectedItemModal.name || `Library Item #${selectedItemModal.id}`}</h2>
              <button onClick={closeItemModal} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors" aria-label="Close"><CloseIcon className="w-5 h-5" /></button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 -mr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {visualMedia.length > 0 && (
                    <div className={`grid gap-3 ${visualMedia.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {visualMedia.map((media, index) => <div key={`${media.label}-${media.src}`} className={visualMedia.length === 3 && index === 0 ? 'col-span-2' : ''}>
                        <h4 className="mb-2 text-sm font-semibold text-text-secondary">{media.label}</h4>
                        <div role="button" tabIndex={0} onClick={() => openMediaViewer(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openMediaViewer(index); }} className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg border border-border-primary bg-bg-primary focus:outline-none focus:ring-2 focus:ring-accent">
                          {media.kind === 'video' ? <video src={media.src} muted preload="metadata" className="h-full w-full object-contain" /> : <img src={media.src} alt={media.label} className="h-full w-full object-contain" />}
                          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 p-2 text-white opacity-80 shadow transition-opacity group-hover:opacity-100"><ZoomIcon className="h-5 w-5" /></span>
                        </div>
                      </div>)}
                    </div>
                  )}
                  {(selectedItemModal.mediaType === 'audio-tts' || selectedItemModal.mediaType === 'tts-reference') && (
                    <div className="aspect-square bg-bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                      <div className="w-full px-6"><AudioPlayer src={normalizeAudioDataUrl(selectedItemModal.media)} label={selectedItemModal.name || 'TTS audio'} detail={selectedItemModal.ttsOptions?.referenceAudioName ? `Voice: ${selectedItemModal.ttsOptions.referenceAudioName}` : selectedItemModal.mediaType === 'tts-reference' ? 'Reusable voice reference' : undefined} /></div>
                    </div>
                  )}
                  {(selectedItemModal.mediaType === 'color-palette') && (<div><h4 className="text-sm font-semibold text-text-secondary mb-2">Palette</h4><div className="grid grid-cols-4 gap-2 p-2 bg-bg-primary rounded-md">{JSON.parse(selectedItemModal.media).map((color: any) => (<div key={color.hex} className="text-center"><div className="w-full h-16 rounded-md" style={{ backgroundColor: color.hex }}></div><p className="text-xs mt-1 text-text-primary truncate">{color.name}</p><p className="text-xs text-text-muted">{color.hex}</p></div>))}</div></div>)}
                </div>
                <div className="space-y-4">
                  <DetailItem label="Item ID" value={selectedItemModal.id} />
                  <DetailItem label="Type" value={selectedItemModal.mediaType} />
                  <div className="rounded-md border border-border-primary bg-bg-primary p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Rating</h4>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1" role="group" aria-label="Item rating">
                        {([1, 2, 3, 4, 5] as const).map(rating => (
                          <button key={rating} type="button" onClick={() => void updateSelectedItemRating(rating)} aria-label={`Rate ${rating} star${rating === 1 ? '' : 's'}`} aria-pressed={getValidRating(selectedItemModal.rating) === rating} className="rounded p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent">
                            <StarIcon className={`h-7 w-7 ${getValidRating(selectedItemModal.rating) && rating <= getValidRating(selectedItemModal.rating)! ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-text-muted'}`} />
                          </button>
                        ))}
                      </div>
                      {getValidRating(selectedItemModal.rating) && <button type="button" onClick={() => void updateSelectedItemRating(undefined)} className="rounded-md border border-border-primary px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary">Clear rating</button>}
                    </div>
                  </div>
                  {TAGGABLE_MEDIA_TYPES.has(selectedItemModal.mediaType) && <div className="space-y-3 rounded-md border border-border-primary bg-bg-primary p-3">
                    <div><h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Safety</h4><div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void updateSelectedItemMetadata({ safetyRating: 'sfw' })} className={`rounded-md px-3 py-1.5 text-xs font-bold ${selectedItemModal.safetyRating === 'sfw' ? 'bg-blue-600 text-white' : 'border border-blue-500 text-blue-400'}`}>SFW</button>
                      <button type="button" onClick={() => void updateSelectedItemMetadata({ safetyRating: 'nsfw' })} className={`rounded-md px-3 py-1.5 text-xs font-bold ${selectedItemModal.safetyRating === 'nsfw' ? 'bg-red-600 text-white' : 'border border-red-500 text-red-400'}`}>NSFW</button>
                      <button type="button" onClick={() => void updateSelectedItemMetadata({ safetyRating: undefined })} className="rounded-md border border-border-primary px-3 py-1.5 text-xs font-semibold text-text-secondary">Unrated</button>
                    </div></div>
                    <div><h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Custom Tags</h4><div className="mt-2 flex flex-wrap gap-1">{selectedItemModal.tags?.length ? selectedItemModal.tags.map(tag => <button key={tag} type="button" onClick={() => void removeSelectedItemTag(tag)} title={`Remove ${tag}`} className="rounded bg-bg-tertiary px-2 py-1 text-xs text-text-secondary hover:text-danger">#{tag} ×</button>) : <span className="text-xs text-text-muted">No custom tags</span>}</div><div className="mt-2 flex flex-wrap gap-2">{availableTags.some(tag => !selectedItemModal.tags?.includes(tag)) && <select aria-label="Choose existing tag for item" value="" onChange={(event) => setItemTag(event.target.value)} className="h-8 min-w-36 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs"><option value="">Existing tag...</option>{availableTags.filter(tag => !selectedItemModal.tags?.includes(tag)).map(tag => <option key={tag} value={tag}>#{tag}</option>)}</select>}<input aria-label="Item custom tag" value={itemTag} onChange={(event) => setItemTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addSelectedItemTag(); }} placeholder="Add tag..." className="h-8 min-w-32 flex-1 rounded-md border border-border-primary bg-bg-tertiary px-2 text-xs" /><button type="button" onClick={() => void addSelectedItemTag()} disabled={!normalizeTag(itemTag)} className="rounded-md bg-accent px-3 text-xs font-bold text-accent-text disabled:opacity-50">Add</button></div></div>
                  </div>}
                  {selectedItemModal.mediaType === 'prompt' && selectedItemModal.promptParts?.length ? (
                    <div className="mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Prompt Text</h4>
                      <div className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-bg-primary p-3 font-mono text-xs">
                        {selectedItemModal.promptParts.map((part, index) => <span key={index} className={getPromptSoupSourceClass(part.source)}>{part.text} </span>)}
                      </div>
                    </div>
                  ) : selectedItemModal.mediaType === 'prompt' ? <DetailItem label="Prompt Text" value={selectedItemModal.media} isCode /> : null}
                  {selectedItemModal.promptType === 'soup' && selectedItemModal.linkedResultId && (() => {
                    const linkedResult = items.find(item => item.id === selectedItemModal.linkedResultId);
                    return linkedResult ? <div className="rounded-md border border-border-primary bg-bg-primary p-3">
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-text-muted">Linked Result</h4>
                      <div className="flex items-center gap-3">
                        <img src={linkedResult.thumbnail || linkedResult.media} alt={linkedResult.name || 'Linked result'} className="h-20 w-20 rounded-md object-cover" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-text-primary">{linkedResult.name || `Image #${linkedResult.id}`}</p><p className="text-xs text-text-muted">Library image</p></div>
                        <button type="button" onClick={() => handleUnlinkSoupResult(selectedItemModal)} className="rounded-md px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-bg">Unlink</button>
                      </div>
                    </div> : null;
                  })()}
                  {selectedItemModal.indexTtsOptions && <div className="space-y-3 rounded-md bg-bg-primary p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">IndexTTS Advanced</h4>
                    <DetailItem label="Mode" value={selectedItemModal.indexTtsOptions.mode === 'dialogue' ? 'Multi-character dialogue' : 'Solo voice'} />
                    <DetailItem label="Engine" value={selectedItemModal.indexTtsOptions.engine === 'chatterbox-multilingual' ? 'ChatterBox Multilingual' : 'IndexTTS 2 / 2.5'} />
                    <DetailItem label="Model" value={selectedItemModal.indexTtsOptions.modelPath} isCode />
                    <DetailItem label="Language" value={selectedItemModal.indexTtsOptions.language} />
                    <DetailItem label="Pause Between Lines" value={`${selectedItemModal.indexTtsOptions.pauseMs} ms`} />
                    {selectedItemModal.indexTtsOptions.characters.map((character, index) => <div key={character.id} className="rounded border border-border-primary p-2">
                      <p className="text-xs font-bold text-text-primary">{character.name || `Character ${index + 1}`}</p>
                      <p className="mt-1 text-xs text-text-muted">{character.referenceAudioName} · {character.referenceSource === 'suite' ? 'Audio Suite' : character.referenceSource === 'library' ? 'Library voice' : 'Uploaded clone'}</p>
                    </div>)}
                    {selectedItemModal.indexTtsOptions.lines.map((line, index) => {
                      const character = selectedItemModal.indexTtsOptions?.characters.find((item) => item.id === line.characterId);
                      return <div key={index} className="rounded border border-border-primary p-2"><p className="mb-1 text-xs font-bold text-accent">{character?.name || `Line ${index + 1}`} · {line.emotionMode === 'qwen' ? 'Auto emotion' : 'Manual emotion'}</p><p className="whitespace-pre-wrap text-xs text-text-primary">{line.text}</p></div>;
                    })}
                  </div>}
                  {selectedItemModal.ttsOptions && <div className="space-y-2 rounded-md bg-bg-primary p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">ChatterBox TTS</h4>
                    <DetailItem label="Text" value={selectedItemModal.ttsOptions.text} isCode />
                    <DetailItem label="Reference Voice" value={selectedItemModal.ttsOptions.referenceAudioName} />
                    <DetailItem label="Reference Source" value={selectedItemModal.ttsOptions.referenceSource === 'suite' ? 'TTS Audio Suite' : selectedItemModal.ttsOptions.referenceSource === 'library' ? 'TTS Reference Library' : 'Uploaded audio'} />
                    <DetailItem label="Language" value={selectedItemModal.ttsOptions.language || 'English'} />
                    <DetailItem label="Device" value={selectedItemModal.ttsOptions.device} />
                    <DetailItem label="Exaggeration" value={selectedItemModal.ttsOptions.exaggeration} />
                    <DetailItem label="Temperature" value={selectedItemModal.ttsOptions.temperature} />
                    <DetailItem label="CFG Weight" value={selectedItemModal.ttsOptions.cfgWeight} />
                    <DetailItem label="Seed" value={selectedItemModal.ttsOptions.seed} />
                    <DetailItem label="Chunking" value={selectedItemModal.ttsOptions.enableChunking} />
                    <DetailItem label="Max Characters / Chunk" value={selectedItemModal.ttsOptions.maxCharsPerChunk} />
                    <DetailItem label="Chunk Combination" value={selectedItemModal.ttsOptions.chunkCombinationMethod} />
                    <DetailItem label="Silence Between Chunks" value={`${selectedItemModal.ttsOptions.silenceBetweenChunksMs} ms`} />
                  </div>}
                  {selectedItemModal.poseJson && <DetailItem label="Pose JSON (ControlNet)" value={selectedItemModal.poseJson} isCode />}
                  {selectedItemModal.ltxDirectorOptions && <div className="space-y-3 rounded-md bg-bg-primary p-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">LTX Director Generation</h4>
                    {selectedItemModal.ltxDirectorOptions.segments.map((segment, index) => (
                      <div key={index} className="rounded-md border border-border-primary bg-bg-tertiary p-2">
                        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-text-secondary">
                          <span>Clip {index + 1}</span>
                          <span>{segment.durationSeconds}s{segment.hasSourceImage ? ' · Image' : ' · Prompt only'}</span>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs text-text-primary">{segment.prompt}</pre>
                      </div>
                    ))}
                    <DetailItem label="Frame Rate" value={`${selectedItemModal.ltxDirectorOptions.frameRate} fps`} />
                    <DetailItem label="Guide Strength" value={selectedItemModal.ltxDirectorOptions.guideStrength} />
                    <DetailItem label="VAE Decode" value={selectedItemModal.ltxDirectorOptions.vaeDecodeMode === 'standard' ? 'Standard' : `Tiled · ${selectedItemModal.ltxDirectorOptions.vaeTileSize ?? 256}px · overlap ${selectedItemModal.ltxDirectorOptions.vaeOverlap ?? 64} · temporal ${selectedItemModal.ltxDirectorOptions.vaeTemporalSize ?? 64}/${selectedItemModal.ltxDirectorOptions.vaeTemporalOverlap ?? 4}`} />
                    <DetailItem label="CacheDiT LTX-2" value={(selectedItemModal.ltxDirectorOptions.useCacheDit ?? true) ? `On · warmup ${selectedItemModal.ltxDirectorOptions.cacheDitWarmupSteps ?? 8} · skip ${selectedItemModal.ltxDirectorOptions.cacheDitSkipInterval ?? 3} · noise ${selectedItemModal.ltxDirectorOptions.cacheDitNoiseScale ?? 0.001}` : 'Off'} />
                    <DetailItem label="LTX Version" value={selectedItemModal.ltxDirectorOptions.modelVersion || '2.3'} />
                    <DetailItem label={selectedItemModal.ltxDirectorOptions.modelVersion === '2.5' ? 'GGUF Diffusion Model' : 'Checkpoint'} value={selectedItemModal.ltxDirectorOptions.checkpoint} isCode />
                    {selectedItemModal.ltxDirectorOptions.textEncoder && <DetailItem label="Text Encoder" value={selectedItemModal.ltxDirectorOptions.textEncoder} isCode />}
                    {selectedItemModal.ltxDirectorOptions.videoVae && <DetailItem label="Video VAE" value={selectedItemModal.ltxDirectorOptions.videoVae} isCode />}
                    {selectedItemModal.ltxDirectorOptions.audioVae && <DetailItem label="Audio VAE" value={selectedItemModal.ltxDirectorOptions.audioVae} isCode />}
                    {selectedItemModal.ltxDirectorOptions.latentUpscaler && <DetailItem label="Latent Upscaler" value={selectedItemModal.ltxDirectorOptions.latentUpscaler} isCode />}
                    {selectedItemModal.ltxDirectorOptions.loras.map((lora, index) => (
                      <DetailItem key={index} label={`LoRA ${index + 1} (${lora.strength})`} value={lora.name} isCode />
                    ))}
                    <DetailItem label="Audio" value={selectedItemModal.ltxDirectorOptions.audioName || 'None'} />
                  </div>}
                  {!selectedItemModal.ttsOptions && (selectedItemModal.themeOptions ? renderThemeOptionsDetails(selectedItemModal.themeOptions) : renderOptionsDetails(selectedItemModal.options, selectedItemModal.mediaType))}
                  {selectedItemModal.mediaType === 'audio-tts' && selectedItemModal.indexTtsOptions?.characters.some((character) => character.thumbnail) && <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-primary bg-bg-primary p-3">
                    <input type="checkbox" checked={importTtsCharacterPhotos} onChange={(event) => setImportTtsCharacterPhotos(event.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
                    <span><span className="block text-sm font-bold text-text-primary">Import character photos into LTX</span><span className="mt-0.5 block text-xs text-text-muted">Assign each saved character photo to that character’s dialogue clips.</span></span>
                  </label>}
                  <div className="pt-4 flex flex-wrap gap-2">
                    {selectedItemModal.media.startsWith('data:image/') && (
                      <button onClick={() => { onUpscaleItem(selectedItemModal); setSelectedItemModal(null); }} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-primary font-semibold py-2 px-4 rounded-lg hover:bg-accent hover:text-accent-text transition-colors"><GenerateIcon className="w-5 h-5" /> Upscale SeedVR2</button>
                    )}
                    {!NON_DOWNLOADABLE_MEDIA_TYPES.has(selectedItemModal.mediaType) && selectedItemModal.media && (
                      <button type="button" onClick={() => downloadLibraryItem(selectedItemModal)} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-primary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"><DownloadIcon className="w-5 h-5" /> Download</button>
                    )}
                    {selectedItemModal.mediaType === 'prompt' ? (
                      <>
                        <button onClick={() => { setPromptToUse(selectedItemModal); setPickerOpen(true); }} className="flex-1 flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"><SendIcon className="w-5 h-5" /> Use</button>
                        {selectedItemModal.promptType === 'soup' && <button type="button" onClick={() => setSoupPromptToLink(selectedItemModal)} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-primary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"><PhotographIcon className="w-5 h-5" /> {selectedItemModal.linkedResultId ? 'Change Result' : 'Link Result'}</button>}
                      </>
                    ) : (
                      <button onClick={() => { onLoadItem(selectedItemModal, { importTtsCharacterPhotos }); setSelectedItemModal(null); }} className="flex-1 flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"><LoadIcon className="w-5 h-5" /> {selectedItemModal.ltxDirectorOptions ? 'Open in LTX Director' : selectedItemModal.mediaType === 'audio-tts' ? 'Use in LTX Video' : 'Load in Generator'}</button>
                    )}
                    <button onClick={() => handleDelete(selectedItemModal.id, selectedItemModal.name || `Item #${selectedItemModal.id}`)} disabled={deletingId === selectedItemModal.id} className="flex items-center justify-center gap-2 bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">{deletingId === selectedItemModal.id ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <TrashIcon className="w-5 h-5" />}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {mediaViewerIndex !== null && visualMedia[mediaViewerIndex] && (() => {
        const activeMedia = visualMedia[mediaViewerIndex];
        return <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 animate-fade-in" role="dialog" aria-modal="true" aria-label={`${activeMedia.label} full-size viewer`} onClick={() => setMediaViewerIndex(null)}>
          <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-white/15 bg-black/80 px-4 py-3" onClick={event => event.stopPropagation()}>
            <div className="min-w-0"><p className="truncate font-semibold text-white">{activeMedia.label}</p><p className="text-xs text-white/60">{mediaViewerIndex + 1} of {visualMedia.length}</p></div>
            <button type="button" onClick={() => setMediaViewerIndex(null)} className="flex items-center gap-2 rounded-md bg-white px-4 py-2 font-bold text-black hover:bg-white/85" aria-label="Close full-size viewer"><CloseIcon className="h-5 w-5" /> Close viewer</button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-auto" onClick={event => event.stopPropagation()}>
            <div className={mediaViewerScale === 'fit' ? 'flex h-full min-h-0 w-full items-center justify-center p-4' : 'min-h-full min-w-full p-6'}>
              {activeMedia.kind === 'video'
                ? <video key={activeMedia.src} src={activeMedia.src} controls autoPlay className={mediaViewerScale === 'fit' ? 'max-h-full max-w-full object-contain' : 'mx-auto block max-h-none max-w-none'} />
                : <img src={activeMedia.src} alt={activeMedia.label} className={mediaViewerScale === 'fit' ? 'max-h-full max-w-full object-contain' : 'mx-auto block max-h-none max-w-none'} />}
            </div>
            {visualMedia.length > 1 && <>
              <button type="button" onClick={showPreviousMedia} className="fixed left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 p-3 text-white shadow-lg hover:bg-accent" aria-label="Previous media"><ChevronLeftIcon className="h-8 w-8" /></button>
              <button type="button" onClick={showNextMedia} className="fixed right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 p-3 text-white shadow-lg hover:bg-accent" aria-label="Next media"><ChevronRightIcon className="h-8 w-8" /></button>
            </>}
          </div>

          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-t border-white/15 bg-black/80 p-3" role="toolbar" aria-label="Full-size media controls" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setMediaViewerScale('fit')} className={`rounded-md px-4 py-2 text-sm font-bold ${mediaViewerScale === 'fit' ? 'bg-accent text-accent-text' : 'bg-white/10 text-white hover:bg-white/20'}`}>Fit</button>
            <button type="button" onClick={() => setMediaViewerScale('actual')} className={`rounded-md px-4 py-2 text-sm font-bold ${mediaViewerScale === 'actual' ? 'bg-accent text-accent-text' : 'bg-white/10 text-white hover:bg-white/20'}`}>100%</button>
            {visualMedia.length > 1 && <div className="ml-3 flex max-w-[50vw] gap-2 overflow-x-auto">
              {visualMedia.map((media, index) => <button key={`${media.label}-${index}`} type="button" onClick={() => setMediaViewerIndex(index)} title={media.label} className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded border-2 ${index === mediaViewerIndex ? 'border-accent' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                {media.kind === 'video' ? <video src={media.src} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={media.src} alt={media.label} className="h-full w-full object-cover" />}
              </button>)}
            </div>}
          </div>
        </div>;
      })()}
      <PromptDestinationPickerModal isOpen={isPickerOpen} onClose={() => setPickerOpen(false)} item={promptToUse} onDestinationSelected={() => setSelectedItemModal(null)} />
      <LibraryPickerModal isOpen={!!soupPromptToLink} onClose={() => setSoupPromptToLink(null)} onSelectItem={handleLinkSoupResult} filter={['image', 'character', 'logo', 'banner', 'album-cover']} />
    </>
  );
};
