
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import { deleteFromLibrary, clearLibraryItems, importLibraryItems, fetchLibrary } from '../store/librarySlice';
import type { LibraryItem, LibraryItemType, GenerationOptions, ThemeGenerationInfo, PaletteColor } from '../types';
import {
  CloseIcon, SpinnerIcon, LibraryIcon, VideoIcon, PhotographIcon, TshirtIcon,
  DocumentTextIcon, FilmIcon, CubeIcon, CheckIcon, LogoIconSimple, CharacterIcon, PaletteIcon,
  BannerIcon, AlbumCoverIcon, TrashIcon, LoadIcon, FileExportIcon, UploadIconSimple, GoogleDriveIcon,
  PoseIcon, FontIcon, Squares2X2Icon, ListBulletIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, WarningIcon,
  SendIcon, WorkflowIcon, GenerateIcon, PastForwardIcon, RefreshIcon
} from './icons';
import { createPaletteThumbnail } from '../utils/imageUtils';
import { exportLibraryAsJson } from '../services/libraryService';
import { updateOptions, setGenerationMode } from '../store/generationSlice';
import { setActiveTab } from '../store/appSlice';

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
      className="fixed inset-0 bg-black/80 z-60 flex items-center justify-center p-4 animate-fade-in"
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
  onLoadItem: (item: LibraryItem) => void;
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
    case 'logo': return <LogoIconSimple {...props} />;
    case 'banner': return <BannerIcon {...props} />;
    case 'album-cover': return <AlbumCoverIcon {...props} />;
    case 'clothes': return <TshirtIcon {...props} />;
    case 'prompt': return <DocumentTextIcon {...props} />;
    case 'extracted-frame': return <FilmIcon {...props} />;
    case 'object': return <CubeIcon {...props} />;
    case 'color-palette': return <PaletteIcon {...props} />;
    case 'pose': return <PoseIcon {...props} />;
    case 'font': return <FontIcon {...props} />;
    case 'past-forward-photo': return <PastForwardIcon {...props} />;
    default: return null;
  }
};

const FILTER_BUTTONS: { id: LibraryItemType; label: string; icon: React.ReactElement }[] = [
  { id: 'image', label: 'Images', icon: <PhotographIcon className="w-5 h-5" /> },
  { id: 'character', label: 'Characters', icon: <CharacterIcon className="w-5 h-5" /> },
  { id: 'past-forward-photo', label: 'Past Forward', icon: <PastForwardIcon className="w-5 h-5" /> },
  { id: 'video', label: 'Videos', icon: <VideoIcon className="w-5 h-5" /> },
  { id: 'logo', label: 'Logos', icon: <LogoIconSimple className="w-5 h-5" /> },
  { id: 'banner', label: 'Banners', icon: <BannerIcon className="w-5 h-5" /> },
  { id: 'album-cover', label: 'Album Covers', icon: <AlbumCoverIcon className="w-5 h-5" /> },
  { id: 'clothes', label: 'Clothes', icon: <TshirtIcon className="w-5 h-5" /> },
  { id: 'object', label: 'Objects', icon: <CubeIcon className="w-5 h-5" /> },
  { id: 'pose', label: 'Poses', icon: <PoseIcon className="w-5 h-5" /> },
  { id: 'font', label: 'Fonts', icon: <FontIcon className="w-5 h-5" /> },
  { id: 'prompt', label: 'Prompts', icon: <DocumentTextIcon className="w-5 h-5" /> },
  { id: 'color-palette', label: 'Palettes', icon: <PaletteIcon className="w-5 h-5" /> },
  { id: 'extracted-frame', label: 'Frames', icon: <FilmIcon className="w-5 h-5" /> },
];

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
  const isImageType = mediaType === 'image' || mediaType === 'character' || mediaType === 'logo' || mediaType === 'banner' || mediaType === 'album-cover' || mediaType === 'clothes' || mediaType === 'object' || mediaType === 'extracted-frame' || mediaType === 'pose' || mediaType === 'font';

  return (
    <div>
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Generation Options</h4>
      <div className="space-y-3 bg-bg-primary p-3 rounded-md max-h-96 overflow-y-auto">
        <DetailItem label="Provider" value={options.provider} />
        {options.provider === 'gemini' && isImageType && (
          <>
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
        {options.provider === 'comfyui' && isImageType && (
          <>
            <DetailItem label="Workflow" value={options.comfyModelType} />
            <DetailItem label="Prompt" value={options.comfyPrompt} isCode />
            {options.comfyNegativePrompt && <DetailItem label="Negative Prompt" value={options.comfyNegativePrompt} isCode />}
            {(options.comfyModelType === 'sdxl' || options.comfyModelType === 'sd1.5' || options.comfyModelType === 'flux' || options.comfyModelType === 'qwen-t2i-gguf' || options.comfyModelType === 'z-image') && (
              <div className="space-y-2 p-2 mt-2 border-t border-border-primary/50">
                {/* Common Fields */}
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
  prompt: string;
}

const PromptDestinationPickerModal: React.FC<PromptDestinationPickerModalProps> = ({ isOpen, onClose, prompt }) => {
  // ... (Implementation remains unchanged) ...
  const dispatch: AppDispatch = useDispatch();
  const handleSelectDestination = (provider: 'gemini' | 'comfyui', comfyModelType?: GenerationOptions['comfyModelType']) => {
    let optionsUpdate: Partial<GenerationOptions> = {
      provider,
      comfyPrompt: prompt,
      geminiPrompt: prompt,
    };
    if (provider === 'gemini') {
      optionsUpdate.geminiMode = 't2i';
    } else {
      optionsUpdate.comfyModelType = comfyModelType;
    }
    dispatch(updateOptions(optionsUpdate));
    dispatch(setGenerationMode('t2i'));
    dispatch(setActiveTab('image-generator'));
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
  const comfyT2iWorkflows = [
    { id: 'sdxl', label: 'SDXL' },
    { id: 'sd1.5', label: 'SD 1.5' },
    { id: 'flux', label: 'FLUX' },
    { id: 'wan2.2', label: 'WAN 2.2' },
    { id: 'nunchaku-flux-image', label: 'Nunchaku FLUX' },
    { id: 'flux-krea', label: 'FLUX Krea' },
  ];
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
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">Gemini</h3>
            <button
              onClick={() => handleSelectDestination('gemini')}
              className="w-full text-left p-4 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors flex items-center gap-4"
            >
              <GenerateIcon className="w-8 h-8 text-accent flex-shrink-0" />
              <div>
                <p className="font-bold">Gemini T2I</p>
                <p className="text-xs text-text-secondary">Use Google's powerful text-to-image models.</p>
              </div>
            </button>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-3">ComfyUI (T2I Workflows)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {comfyT2iWorkflows.map(wf => (
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

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ onLoadItem, isDriveConnected, onSyncWithDrive, isSyncing, syncMessage, isDriveConfigured }) => {
  const dispatch: AppDispatch = useDispatch();
  const { items, status: libraryStatus, error: libraryError } = useSelector((state: RootState) => state.library);
  const projectName = useSelector((state: RootState) => state.app.projectName);

  const [filter, setFilter] = useState<LibraryItemType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedItemModal, setSelectedItemModal] = useState<LibraryItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [hoveredSource, setHoveredSource] = useState<{ src: string; x: number; y: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
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
  const [promptToUse, setPromptToUse] = useState('');

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

  // ... (handleImportClick, handleFileSelected, handleFilterClick, handleClearFilters, handleDelete, handleExport, handleClearLibrary logic unchanged) ...
  const handleImportClick = () => { fileInputRef.current?.click(); };
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage('Reading import file...');
    try {
      const text = await file.text();
      const importedItems: LibraryItem[] = JSON.parse(text);
      if (!Array.isArray(importedItems)) throw new Error('Invalid file format.');
      setImportMessage('Importing items...');
      await dispatch(importLibraryItems(importedItems)).unwrap();
      setImportMessage('Refreshing...');
      await dispatch(fetchLibrary());
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false); setImportMessage('');
      if (e.target) e.target.value = '';
    }
  };
  const handleFilterClick = (type: LibraryItemType) => {
    setFilter(prev => prev.includes(type) ? prev.filter(f => f !== type) : [...prev, type]);
  };
  const handleClearFilters = () => { setFilter([]); setSearchTerm(''); };
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
  const handleExport = async () => { try { await exportLibraryAsJson(projectName); } catch (e) { alert("Export failed."); } };
  const handleClearLibrary = () => {
    setConfirmModal({
      isOpen: true, title: 'Clear Entire Library', message: 'Permanently delete ALL items?', confirmText: 'Clear All',
      onConfirm: () => { setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => { } }); dispatch(clearLibraryItems()); }
    });
  };

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (filter.length > 0) filtered = filtered.filter(item => filter.includes(item.mediaType));
    if (searchTerm.trim() !== '') filtered = filtered.filter(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    return [...filtered].sort((a, b) => b.id - a.id);
  }, [items, filter, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [filteredItems.length, itemsPerPage]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => Math.ceil(filteredItems.length / itemsPerPage), [filteredItems, itemsPerPage]);

  // ... (handleKeyDown logic unchanged) ...
  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedItemModal(null); }, []);
  useEffect(() => { if (selectedItemModal) window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [selectedItemModal, handleKeyDown]);

  const handleMouseEnterSource = (e: React.MouseEvent, sourceImage?: string) => { if (!sourceImage) return; setHoveredSource({ src: sourceImage, x: e.clientX, y: e.clientY }); };
  const handleMouseLeaveSource = () => { setHoveredSource(null); };

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
            <div key={item.id} className="group flex items-center gap-3 p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors w-full cursor-pointer" onClick={() => setSelectedItemModal(item)} onMouseEnter={(e) => (item.mediaType === 'prompt' || item.mediaType === 'color-palette') && handleMouseEnterSource(e, item.sourceImage)} onMouseLeave={handleMouseLeaveSource}>
              <img src={item.thumbnail} alt={item.name} className="w-10 h-10 object-cover rounded-md flex-shrink-0" />
              <div className="flex-shrink-0 text-text-secondary">{getCategoryIcon(item.mediaType, "w-5 h-5")}</div>
              <div className="flex-grow truncate"><p className="font-medium text-text-primary truncate text-sm">{item.name}</p><p className="text-xs text-text-muted">Created: {new Date(item.id).toLocaleDateString()}</p></div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onLoadItem(item); }} title="Load in Generator" className="p-1.5 rounded-full hover:bg-bg-primary text-text-secondary hover:text-accent"><LoadIcon className="w-4 h-4" /></button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.name || `Item #${item.id}`); }} disabled={deletingId === item.id} title="Delete Item" className="p-1.5 rounded-full hover:bg-bg-primary text-text-secondary hover:text-danger">{deletingId === item.id ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}</button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const gridClasses = viewMode === 'grid' ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12";
    return (
      <div className={`grid ${gridClasses} gap-4`}>
        {paginatedItems.map(item => (
          <div key={item.id} className="group relative aspect-square bg-bg-tertiary rounded-lg overflow-hidden shadow-md cursor-pointer" onClick={() => setSelectedItemModal(item)} onMouseEnter={(e) => (item.mediaType === 'prompt' || item.mediaType === 'color-palette') && handleMouseEnterSource(e, item.sourceImage)} onMouseLeave={handleMouseLeaveSource}>
            <img src={item.thumbnail} alt={item.name || `Library item ${item.id}`} className="object-cover w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute bottom-0 left-0 p-2 text-white transform translate-y-4 group-hover:translate-y-0 transition-transform"><p className="text-xs font-bold truncate max-w-full">{item.name}</p></div>
            <div className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full" title={item.mediaType}>{getCategoryIcon(item.mediaType, "w-4 h-4 text-white")}</div>
          </div>
        ))}
      </div>
    );
  };

  const PaginationControls = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-border-primary">
        <div className="flex items-center gap-2">
          <label htmlFor="items-per-page" className="text-sm text-text-secondary">Items per page:</label>
          <select id="items-per-page" value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-bg-tertiary border border-border-primary rounded-md p-1.5 text-sm focus:ring-accent focus:border-accent">
            <option value={12}>12</option><option value={20}>20</option><option value={48}>48</option><option value={96}>96</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm text-text-secondary mr-2">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="First Page"><ChevronDoubleLeftIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Previous Page"><ChevronLeftIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Next Page"><ChevronRightIcon className="w-5 h-5" /></button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-full hover:bg-bg-primary disabled:opacity-50" title="Last Page"><ChevronDoubleRightIcon className="w-5 h-5" /></button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-accent">Library</h2>
            <div className="flex items-center gap-1 p-1 bg-bg-primary rounded-full">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="Large Grid View"><Squares2X2Icon className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('smallGrid')} className={`p-2 rounded-full transition-colors ${viewMode === 'smallGrid' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="Small Grid View"><Squares2X2Icon className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-full transition-colors ${viewMode === 'list' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-tertiary'}`} title="List View"><ListBulletIcon className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDriveConfigured && (
              <button onClick={onSyncWithDrive} disabled={!isDriveConnected || isSyncing || isImporting} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                {isSyncing ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GoogleDriveIcon className="w-5 h-5" />}
                {isSyncing ? 'Syncing...' : 'Sync with Drive'}
              </button>
            )}
            <button onClick={handleImportClick} disabled={isImporting || isSyncing} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              {isImporting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <UploadIconSimple className="w-5 h-5" />}
              {isImporting ? 'Importing...' : 'Import'}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json,application/json" onChange={handleFileSelected} />
            <button onClick={handleExport} disabled={items.length === 0 || isImporting || isSyncing} className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
              <FileExportIcon className="w-5 h-5" /> Export
            </button>
          </div>
        </div>

        {(isSyncing || isImporting) && <p className="text-sm text-accent text-center mb-4">{isImporting ? importMessage : syncMessage}</p>}
        {libraryError && libraryStatus === 'failed' && (
          <div className="bg-danger-bg text-danger text-sm p-3 rounded-md mb-4 animate-fade-in" role="alert">
            <p className="font-bold">A library operation failed:</p>
            <p>{libraryError}</p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 p-4 bg-bg-primary/50 rounded-lg border border-border-primary/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent" />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-text-secondary mr-2">Filter:</p>
              {FILTER_BUTTONS.map(({ id, label, icon }) => (
                <button key={id} onClick={() => handleFilterClick(id)} title={label} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${filter.includes(id) ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>
                  {icon}<span>{label}</span>
                </button>
              ))}
              {(filter.length > 0 || searchTerm) && <button onClick={handleClearFilters} className="text-xs text-accent hover:underline">Clear</button>}
            </div>
          </div>
        </div>

        {renderItemViews()}
        <PaginationControls />

        <div className="mt-8 pt-4 border-t border-danger-bg">
          <button onClick={handleClearLibrary} disabled={isImporting || isSyncing} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors disabled:opacity-50">
            <TrashIcon className="w-5 h-5" /> Clear Entire Local Library
          </button>
        </div>
      </div>

      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} confirmText={confirmModal.confirmText} />
      {hoveredSource && <div style={{ position: 'fixed', top: hoveredSource.y + 20, left: hoveredSource.x + 20, zIndex: 100 }} className="pointer-events-none animate-fade-in"><img src={hoveredSource.src} className="w-48 h-48 object-cover rounded-lg shadow-2xl border-2 border-accent" alt="Source Preview" /></div>}
      {selectedItemModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="library-item-title" onClick={() => setSelectedItemModal(null)}>
          <div className="bg-bg-secondary w-full max-w-4xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 id="library-item-title" className="text-xl font-bold text-accent flex items-center gap-2">{getCategoryIcon(selectedItemModal.mediaType, "w-6 h-6")}{selectedItemModal.name || `Library Item #${selectedItemModal.id}`}</h2>
              <button onClick={() => setSelectedItemModal(null)} className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors" aria-label="Close"><CloseIcon className="w-5 h-5" /></button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 -mr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {selectedItemModal.mediaType === 'pose' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div><h4 className="text-sm font-semibold text-text-secondary mb-2 text-center">Mannequin</h4><div className="aspect-square bg-white rounded-lg flex items-center justify-center p-1"><img src={selectedItemModal.media} alt="Mannequin" className="max-w-full max-h-full object-contain" /></div></div>
                      <div><h4 className="text-sm font-semibold text-text-secondary mb-2 text-center">Skeleton</h4><div className="aspect-square bg-black rounded-lg flex items-center justify-center p-1">{selectedItemModal.skeletonImage ? <img src={selectedItemModal.skeletonImage} alt="Skeleton" className="max-w-full max-h-full object-contain" /> : <p className="text-xs text-text-muted">No skeleton available</p>}</div></div>
                    </div>
                  ) : (selectedItemModal.mediaType !== 'prompt' && selectedItemModal.mediaType !== 'color-palette') && (
                    <div className="aspect-square bg-bg-primary rounded-lg flex items-center justify-center overflow-hidden">
                      {selectedItemModal.mediaType === 'video' ? <video src={selectedItemModal.media} controls className="w-full h-full object-contain" /> : <img src={selectedItemModal.media} alt={selectedItemModal.name} className="w-full h-full object-contain" />}
                    </div>
                  )}
                  {(selectedItemModal.sourceImage || selectedItemModal.startFrame) && (<div><h4 className="text-sm font-semibold text-text-secondary mb-2">Source Image</h4><div className="aspect-square bg-bg-primary rounded-lg flex items-center justify-center overflow-hidden"><img src={selectedItemModal.sourceImage || selectedItemModal.startFrame} alt="Source" className="w-full h-full object-contain" /></div></div>)}
                  {(selectedItemModal.mediaType === 'color-palette') && (<div><h4 className="text-sm font-semibold text-text-secondary mb-2">Palette</h4><div className="grid grid-cols-4 gap-2 p-2 bg-bg-primary rounded-md">{JSON.parse(selectedItemModal.media).map((color: any) => (<div key={color.hex} className="text-center"><div className="w-full h-16 rounded-md" style={{ backgroundColor: color.hex }}></div><p className="text-xs mt-1 text-text-primary truncate">{color.name}</p><p className="text-xs text-text-muted">{color.hex}</p></div>))}</div></div>)}
                </div>
                <div className="space-y-4">
                  <DetailItem label="Item ID" value={selectedItemModal.id} />
                  <DetailItem label="Type" value={selectedItemModal.mediaType} />
                  {selectedItemModal.mediaType === 'prompt' && <DetailItem label="Prompt Text" value={selectedItemModal.media} isCode />}
                  {selectedItemModal.poseJson && <DetailItem label="Pose JSON (ControlNet)" value={selectedItemModal.poseJson} isCode />}
                  {selectedItemModal.themeOptions ? renderThemeOptionsDetails(selectedItemModal.themeOptions) : renderOptionsDetails(selectedItemModal.options, selectedItemModal.mediaType)}
                  <div className="pt-4 flex flex-wrap gap-2">
                    {selectedItemModal.mediaType === 'prompt' ? (
                      <button onClick={() => { setPromptToUse(selectedItemModal.media); setPickerOpen(true); }} className="flex-1 flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"><SendIcon className="w-5 h-5" /> Use</button>
                    ) : (
                      <button onClick={() => { onLoadItem(selectedItemModal); setSelectedItemModal(null); }} className="flex-1 flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors"><LoadIcon className="w-5 h-5" /> Load in Generator</button>
                    )}
                    <button onClick={() => handleDelete(selectedItemModal.id, selectedItemModal.name || `Item #${selectedItemModal.id}`)} disabled={deletingId === selectedItemModal.id} className="flex items-center justify-center gap-2 bg-danger-bg text-danger font-semibold py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">{deletingId === selectedItemModal.id ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <TrashIcon className="w-5 h-5" />}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <PromptDestinationPickerModal isOpen={isPickerOpen} onClose={() => setPickerOpen(false)} prompt={promptToUse} />
    </>
  );
};
