import React, { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import JSZip from 'jszip';
import { RootState, AppDispatch } from '../../store/store';
import {
    setUploadedFiles, setBackgroundFile, setSelectedPose, setQuality,
    setGeneratedImages, updateGeneratedImage, setError, startOver,
    setIsDebugMode, addDebugInfo, setLoading, removeAllFiles,
    removeUploadedFile, updatePersona, updateCharacterName, clearDebugInfos, setSaveStatus,
    setNumImages, setProvider
} from '../../store/groupPhotoFusionSlice';
import { updateOptions as updateGenerationOptions } from '../../store/generationSlice';
import { addToLibrary } from '../../store/librarySlice';
import { addSessionTokenUsage, setModalOpen } from '../../store/appSlice';
import { Pose, UploadedFile, Quality, DebugInfo, GeneratedImage } from '../../groupPhotoFusion/types';
import { POSES, PERSONAS } from '../../groupPhotoFusion/constants';
import { generateComfyUIGroupPhoto, generateGroupPhoto, generateQwenGroupPhoto } from '../../services/groupPhotoFusionService';
import { DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODELS, getApiKey, getGeminiImageSizes, getGeminiModels, supportsGeminiThinkingLevel } from '../../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../../services/mammouthService';
import FileUpload from './FileUpload';
import ImagePreview from './ImagePreview';
import PoseSelector from './PoseSelector';
import QualitySelector from './QualitySelector';
import BackgroundUpload from './BackgroundUpload';
import { DownloadIcon, RefreshIcon, ZoomIcon, ZipIcon, SaveIcon, CheckIcon, SpinnerIcon } from '../icons';
import DebugSection from './DebugSection';
import { dataUrlToThumbnail, fileToDataUrl } from '../../utils/imageUtils';
import { SendToLTXButton } from '../SendToLTXButton';
import { Accordion } from '../ui/Accordion';
import { ModelFields, NumberField, SamplerFields } from '../ui/fields';
import { Select } from '../ui/Select';

const NAME = 'Photo Fusion';
const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : Array.isArray(input?.[1]?.options) ? input[1].options : [];
const getImageExtension = (dataUrl: string) => dataUrl.startsWith('data:image/png') ? 'png' : dataUrl.startsWith('data:image/webp') ? 'webp' : 'jpg';
const QWEN_LIGHTNING_PRESETS = {
  4: 'QWEN\\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors',
  8: 'QWEN\\Qwen-Image-Lightning-8steps-V2.0.safetensors',
} as const;
const getSubjectDescriptions = (uploadedFiles: UploadedFile[]) => uploadedFiles.map(uploadedFile => {
  const persona = PERSONAS.find(item => item.id === uploadedFile.personaId)?.description || '';
  const characterName = uploadedFile.characterName?.trim();
  const identityHint = characterName
    ? `the notable person ${characterName}, whose distinctive recognizable facial identity must be preserved`
    : '';
  return [identityHint, persona].filter(Boolean).join('; ');
});

const GroupPhotoFusionPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const {
      provider, uploadedFiles, backgroundFile, selectedPose, quality, numImages,
      isLoading, generatedImages, error, isDebugMode, debugInfos
  } = useSelector((state: RootState) => state.groupPhotoFusion);
  const generationOptions = useSelector((state: RootState) => state.generation.options);
  const isComfyUIConnected = useSelector((state: RootState) => state.app.isComfyUIConnected);
  const isMammouthConnected = useSelector((state: RootState) => state.app.isMammouthConnected);
  const comfyUIObjectInfo = useSelector((state: RootState) => state.app.comfyUIObjectInfo);
  const ltxPrompt = selectedPose?.getPrompt(getSubjectDescriptions(uploadedFiles), quality, !!backgroundFile);

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [geminiModels, setGeminiModels] = useState<string[]>([...GEMINI_IMAGE_MODELS]);
  const [mammouthModels, setMammouthModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
  const [isLoadingMammouthModels, setIsLoadingMammouthModels] = useState(false);
  const ggufModels = Array.from(new Set([
    ...getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name),
    ...getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.gguf_name),
  ]));
  const unetModels = getOptions(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name);
  const flux2Models = Array.from(new Set([
    ...ggufModels.filter(model => /flux[-_ ]?2|klein/i.test(model)),
    ...unetModels.filter(model => /flux[-_ ]?2|klein/i.test(model)),
  ]));
  const qwenModels = getOptions(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name);
  const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
  const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
  const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
  const schedulers = getOptions(comfyUIObjectInfo?.KSampler?.input?.required?.scheduler);
  const qwenLoras = getOptions(comfyUIObjectInfo?.LoraLoaderModelOnly?.input?.required?.lora_name);
  const cacheDitModels = getOptions(comfyUIObjectInfo?.CacheDiT_Model_Optimizer?.input?.required?.model_type);
  const selectedFlux2Model = generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf';
  const fluxRequiredNodes = [selectedFlux2Model.toLowerCase().endsWith('.gguf') ? 'UnetLoaderGGUF' : 'UNETLoader', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'];
  const qwenRequiredNodes = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow', 'CFGNorm', 'TextEncodeQwenImageEditPlus', 'ImageScaleToTotalPixels'];
  const requiredNodes = provider === 'qwen' ? qwenRequiredNodes : fluxRequiredNodes;
  const missingNodes = provider === 'gemini' || provider === 'mammouth' || !comfyUIObjectInfo ? [] : requiredNodes.filter(node => !comfyUIObjectInfo[node]);
  if (provider === 'comfyui' && (generationOptions.comfyFlux2EditLora1Name?.trim() || generationOptions.comfyFlux2EditLora2Name?.trim()) && comfyUIObjectInfo && !comfyUIObjectInfo.LoraLoaderModelOnly) missingNodes.push('LoraLoaderModelOnly');
  if (provider === 'comfyui' && generationOptions.comfyFlux2EditUseCacheDit && comfyUIObjectInfo && !comfyUIObjectInfo.CacheDiT_Model_Optimizer) missingNodes.push('CacheDiT_Model_Optimizer');

  const updateFlux2Option = (updates: Partial<typeof generationOptions>) => dispatch(updateGenerationOptions(updates));
  const activeQwenLoraName = (generationOptions.comfyQwenEditLora1Name || '').toLowerCase();
  const qwenLightningPreset = activeQwenLoraName.includes('lightning') && activeQwenLoraName.includes('4step') && generationOptions.photoFusionQwenSteps === 4
    ? 4
    : activeQwenLoraName.includes('lightning') && activeQwenLoraName.includes('8step') && generationOptions.photoFusionQwenSteps === 8
      ? 8
      : null;
  const selectQwenLightningPreset = (steps: 4 | 8) => {
    const installedLora = qwenLoras.find(name => {
      const normalizedName = name.toLowerCase();
      return normalizedName.includes('qwen') && normalizedName.includes('lightning') && normalizedName.includes(`${steps}step`);
    });
    updateFlux2Option({
      comfyQwenEditUseLora: true,
      comfyQwenEditLora1Name: installedLora || QWEN_LIGHTNING_PRESETS[steps],
      comfyQwenEditLora1Strength: 1,
      photoFusionQwenSteps: steps,
    });
  };
  const qwenInputLimitExceeded = provider === 'qwen' && uploadedFiles.length + (backgroundFile ? 1 : 0) > 3;
  const providerLabel = provider === 'comfyui' ? 'FLUX2' : provider === 'qwen' ? 'QWEN-Edit' : provider === 'gemini' ? 'Gemini' : 'Mammouth';
  const isProviderReady = provider === 'mammouth' ? isMammouthConnected : provider === 'gemini' ? !!getApiKey() : isComfyUIConnected && missingNodes.length === 0;

  useEffect(() => {
    if (provider !== 'gemini') return;
    getGeminiModels().then(models => setGeminiModels(Array.from(new Set([
      generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL,
      ...models,
      ...GEMINI_IMAGE_MODELS,
    ]))));
  }, [provider]);

  useEffect(() => {
    if (provider !== 'mammouth') return;
    setIsLoadingMammouthModels(true);
    getMammouthImageModels()
      .then(models => setMammouthModels(models.length > 0 ? models : [...MAMMOUTH_IMAGE_MODELS].sort()))
      .finally(() => setIsLoadingMammouthModels(false));
  }, [provider]);

  const handleFilesChange = (files: UploadedFile[]) => {
    if (provider === 'qwen' && files.length + (backgroundFile ? 1 : 0) > 3) {
      dispatch(setError('Qwen Edit accepts at most 3 input images. Remove the background or one subject first.'));
      return;
    }
    dispatch(setUploadedFiles(files));
  };

  const handleAddLocalFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const subjectLimit = provider === 'qwen' ? 3 - (backgroundFile ? 1 : 0) : 4;
    const availableSlots = subjectLimit - uploadedFiles.length;
    if (files.length > availableSlots) {
      dispatch(setError(provider === 'qwen'
        ? `Qwen Edit can add only ${Math.max(availableSlots, 0)} more subject photo${availableSlots === 1 ? '' : 's'} with the current inputs.`
        : `You can add only ${Math.max(availableSlots, 0)} more subject photo${availableSlots === 1 ? '' : 's'}.`));
      return;
    }
    const additions: UploadedFile[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      personaId: 'default',
    }));
    dispatch(setError(null));
    dispatch(setUploadedFiles([...uploadedFiles, ...additions]));
  };

  const handleBackgroundChange = (file: UploadedFile) => {
    if (provider === 'qwen' && uploadedFiles.length >= 3) {
      dispatch(setError('Qwen Edit cannot add a background when 3 subject images are selected.'));
      return;
    }
    dispatch(setBackgroundFile(file));
  };

  const handleRemoveBackground = () => {
    dispatch(setBackgroundFile(null));
  };

  const handleRemoveImage = (id: string) => {
    dispatch(removeUploadedFile(id));
  };

  const handlePersonaChange = (id: string, personaId: string) => {
    dispatch(updatePersona({ id, personaId }));
  };

  const handleCharacterNameChange = (id: string, characterName: string) => {
    dispatch(updateCharacterName({ id, characterName }));
  };

  const handleRemoveAll = () => {
    dispatch(removeAllFiles());
  };

  const handleOpenLibrary = useCallback(() => {
    const subjectLimit = provider === 'qwen' ? 3 - (backgroundFile ? 1 : 0) : 4;
    if (uploadedFiles.length >= subjectLimit) {
        dispatch(setError(provider === 'qwen' ? 'Qwen Edit accepts at most 3 total input images.' : 'You can only add up to 4 subjects.'));
        return;
    }
    dispatch(setModalOpen({ modal: 'isGroupFusionPickerOpen', isOpen: true }));
  }, [uploadedFiles.length, backgroundFile, provider, dispatch]);
  
  const handleGenerate = useCallback(async () => {
    if (!selectedPose || uploadedFiles.length < 2) {
      dispatch(setError("Please upload 2 to 4 subject photos and select a pose."));
      return;
    }
    if (provider === 'qwen' && uploadedFiles.length + (backgroundFile ? 1 : 0) > 3) {
      dispatch(setError('Qwen Edit supports 2 to 3 people, or 2 people with one background image.'));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));
    dispatch(clearDebugInfos());

    const placeholders: GeneratedImage[] = Array(numImages).fill(0).map(() => ({
        id: crypto.randomUUID(),
        base64: null,
        status: 'generating',
      progress: 0,
      progressMessage: 'Queued',
        saveStatus: 'idle'
    }));
    dispatch(setGeneratedImages(placeholders));

    try {
      const subjectFiles = uploadedFiles.map(uf => uf.file);
      const isBackgroundSupported = !(selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw');
      const backgroundToUse = backgroundFile && isBackgroundSupported ? backgroundFile : null;
      const personaDescriptions = getSubjectDescriptions(uploadedFiles);

      const prompt = selectedPose.getPrompt(personaDescriptions, quality, !!backgroundToUse);
      const baseSeed = generationOptions.comfySeed ?? Math.floor(Math.random() * 1e15);
      for (let index = 0; index < numImages; index += 1) {
        const id = placeholders[index].id;
        const updateProgress = (message: string, value: number) => dispatch(updateGeneratedImage({ id, progress: value, progressMessage: message }));
        try {
          updateProgress('Starting generation...', 0.02);
          const result = provider === 'gemini' || provider === 'mammouth'
            ? await generateGroupPhoto(
                [...subjectFiles, ...(backgroundToUse ? [backgroundToUse.file] : [])],
                prompt,
                provider,
                generationOptions,
                updateProgress,
              )
            : provider === 'qwen'
              ? await generateQwenGroupPhoto(
                  subjectFiles,
                  backgroundToUse?.file || null,
                  prompt,
                  personaDescriptions,
                  {
                    ...generationOptions,
                    comfySeed: generationOptions.comfySeedControl === 'fixed'
                      ? baseSeed
                      : index === 0 ? baseSeed : Math.floor(Math.random() * 1e15),
                  },
                  updateProgress,
                )
              : await generateComfyUIGroupPhoto(
                  subjectFiles,
                  backgroundToUse?.file || null,
                  prompt,
                  personaDescriptions,
                  {
                    ...generationOptions,
                    comfySeed: generationOptions.comfySeedControl === 'fixed'
                      ? baseSeed
                      : generationOptions.comfySeedControl === 'decrement'
                        ? baseSeed - index * (generationOptions.comfySeedIncrement || 1)
                        : generationOptions.comfySeedControl === 'increment'
                          ? baseSeed + index * (generationOptions.comfySeedIncrement || 1)
                          : index === 0 ? baseSeed : Math.floor(Math.random() * 1e15),
                  },
                  updateProgress,
                );
          dispatch(updateGeneratedImage({
            id,
            base64: `data:${result.imageMimeType || 'image/jpeg'};base64,${result.imageBase64}`,
            seed: result.seed,
            status: 'success',
            progress: 1,
            progressMessage: 'Complete',
          }));
          if (result.usageMetadata) {
            dispatch(addSessionTokenUsage(result.usageMetadata));
          }
          if (isDebugMode) {
            dispatch(addDebugInfo({
              prompt,
              subjects: uploadedFiles,
              background: backgroundToUse,
              quality,
              apiResponseText: result.responseText,
              generatedImageBase64: result.imageBase64,
              generatedImageMimeType: result.imageMimeType,
            }));
          }
        } catch (generationError) {
          dispatch(updateGeneratedImage({
            id,
            base64: null,
            status: 'error',
            progress: 1,
            progressMessage: 'Failed',
            error: generationError instanceof Error ? generationError.message : "An unknown error occurred.",
          }));
        }
      }
      
    } catch (err) {
      console.error(err);
      dispatch(setError(err instanceof Error ? err.message : "An unknown error occurred during image generation."));
      dispatch(setGeneratedImages(null));
    } finally {
      dispatch(setLoading(false));
    }
  }, [selectedPose, uploadedFiles, quality, backgroundFile, isDebugMode, dispatch, numImages, generationOptions, provider]);

  const handleRetry = useCallback(async (id: string) => {
    dispatch(updateGeneratedImage({ id, status: 'generating', progress: 0, progressMessage: 'Starting retry...', error: undefined }));
    
    const subjectFiles = uploadedFiles.map(uf => uf.file);
    const isBackgroundSupported = !(selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw');
    const backgroundToUse = backgroundFile && isBackgroundSupported ? backgroundFile : null;
    const personaDescriptions = getSubjectDescriptions(uploadedFiles);
    if (!selectedPose) return;
    const prompt = selectedPose.getPrompt(personaDescriptions, quality, !!backgroundToUse);
    const updateProgress = (message: string, value: number) => dispatch(updateGeneratedImage({ id, progress: value, progressMessage: message }));

    try {
        const result = provider === 'gemini' || provider === 'mammouth'
          ? await generateGroupPhoto([...subjectFiles, ...(backgroundToUse ? [backgroundToUse.file] : [])], prompt, provider, generationOptions, updateProgress)
          : provider === 'qwen'
            ? await generateQwenGroupPhoto(subjectFiles, backgroundToUse?.file || null, prompt, personaDescriptions, generationOptions, updateProgress)
          : await generateComfyUIGroupPhoto(subjectFiles, backgroundToUse?.file || null, prompt, personaDescriptions, generationOptions, updateProgress);
        dispatch(updateGeneratedImage({
            id,
          base64: `data:${result.imageMimeType || 'image/jpeg'};base64,${result.imageBase64}`,
            seed: result.seed,
            status: 'success',
            progress: 1,
            progressMessage: 'Complete',
        }));
        if (result.usageMetadata) {
            dispatch(addSessionTokenUsage(result.usageMetadata));
        }
        if (isDebugMode) {
            dispatch(addDebugInfo({
                prompt,
                subjects: uploadedFiles,
                background: backgroundToUse,
                quality,
                apiResponseText: result.responseText,
                generatedImageBase64: result.imageBase64,
                generatedImageMimeType: result.imageMimeType,
            }));
        }
    } catch(err) {
        dispatch(updateGeneratedImage({
            id,
            status: 'error',
          progress: 1,
          progressMessage: 'Failed',
            error: err instanceof Error ? err.message : "An unknown error occurred."
        }));
    }
  }, [selectedPose, uploadedFiles, quality, backgroundFile, isDebugMode, dispatch, generationOptions, provider]);
  
  const handleDownloadAll = async () => {
    if (!generatedImages) return;

    const successfulImages = generatedImages.filter(img => img.status === 'success' && img.base64);
    if (successfulImages.length === 0) return;

    try {
        const zip = new JSZip();
        successfulImages.forEach((image, index) => {
            if (image.base64) {
                const base64Data = image.base64.split(',')[1];
                zip.file(`fusion_${index + 1}.${getImageExtension(image.base64)}`, base64Data, { base64: true });
            }
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipBlob);
        link.download = `group-photo-fusion-collection.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch(err) {
        console.error("Failed to create ZIP file", err);
        dispatch(setError("Could not create ZIP file. Please download images individually."));
    }
  };

  const handleSaveToLibrary = async (image: GeneratedImage, index: number) => {
    if (!image.base64) return;
    dispatch(setSaveStatus({ index, status: 'saving' }));
    try {
        const item = {
            mediaType: 'group-fusion' as const,
            name: `Group Fusion - ${selectedPose?.title || 'Fusion'}`,
            media: image.base64,
            thumbnail: await dataUrlToThumbnail(image.base64, 256),
            sourceImage: uploadedFiles[0] ? await fileToDataUrl(uploadedFiles[0].file) : undefined,
            options: {
              ...generationOptions,
              provider: provider === 'qwen' ? 'comfyui' : provider,
              ...(provider === 'comfyui' ? {
                comfyModelType: 'flux2-edit' as const,
                comfyFlux2EditPrompt: ltxPrompt,
                comfySeed: image.seed,
              } : provider === 'qwen' ? {
                comfyModelType: 'qwen-edit' as const,
                comfyPrompt: ltxPrompt,
                comfySeed: image.seed,
              } : {}),
            },
        };
        await dispatch(addToLibrary(item)).unwrap();
        dispatch(setSaveStatus({ index, status: 'saved' }));
    } catch(err) {
        console.error("Failed to save to library:", err);
        dispatch(setSaveStatus({ index, status: 'idle' }));
        dispatch(setError("Failed to save image to library."));
    }
  };

  const renderContent = () => {
    if (generatedImages) {
        const successfulGenerations = generatedImages.filter(img => img.status === 'success').length;
        const totalGenerations = generatedImages.length;
        const completedGenerations = generatedImages.filter(img => img.status !== 'generating').length;
        const overallProgress = generatedImages.reduce((sum, image) => sum + (image.progress || 0), 0) / totalGenerations;
        
        return (
        <>
          {zoomedImage && (
            <div 
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 cursor-zoom-out"
              onClick={() => setZoomedImage(null)}
            >
              <img src={zoomedImage} alt="Generated group photo - zoomed" className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          )}
          <div className="w-full max-w-5xl text-center">
            <h2 className="text-2xl font-bold text-text-primary mb-4">{isLoading ? 'Fusing Photos' : 'Your Fused Photos are Ready!'}</h2>
            <div className="mb-6 space-y-3 rounded-md border border-border-primary bg-bg-secondary p-4 text-left">
              <div className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="text-text-primary">Generation progress</span><span className="text-text-secondary">{completedGenerations}/{totalGenerations}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-tertiary" role="progressbar" aria-label="Photo Fusion generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overallProgress * 100)}><div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round(overallProgress * 100)}%` }} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {generatedImages.map((image, index) => <div key={image.id} className="rounded border border-border-primary bg-bg-primary px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-bold text-text-primary">Image {index + 1}</span><span className="text-text-muted">{Math.round((image.progress || 0) * 100)}%</span></div>
                  <div className="h-1 overflow-hidden rounded-full bg-bg-tertiary"><div className={`h-full transition-all duration-300 ${image.status === 'error' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.round((image.progress || 0) * 100)}%` }} /></div>
                  <p className="mt-1 truncate text-[11px] text-text-muted" title={image.progressMessage}>{image.progressMessage || 'Queued'}</p>
                </div>)}
              </div>
            </div>
            <div className={`grid grid-cols-1 ${totalGenerations > 1 ? 'sm:grid-cols-2' : ''} gap-6 mb-8`}>
              {generatedImages.map((image, index) => (
                <div key={image.id} className={`relative group bg-bg-tertiary rounded-lg flex items-center justify-center overflow-hidden ${totalGenerations > 1 ? 'aspect-square' : ''}`}>
                  {image.status === 'success' && image.base64 && (
                    <img src={image.base64} alt="Generated group photo" className={`w-full ${totalGenerations > 1 ? 'h-full object-cover' : 'h-auto object-contain max-w-3xl mx-auto'}`} />
                  )}
                  {image.status === 'generating' && (
                     <div className="flex flex-col items-center justify-center text-center">
                        <SpinnerIcon className="w-10 h-10 animate-spin text-accent" />
                      <p className="text-sm text-text-secondary mt-2">{image.progressMessage || 'Queued'}</p>
                      <div className="mt-3 h-1.5 w-3/4 overflow-hidden rounded-full bg-bg-primary"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.round((image.progress || 0) * 100)}%` }} /></div>
                    </div>
                  )}
                   {image.status === 'error' && (
                    <div className="p-4 text-center">
                        <p className="text-danger font-semibold">Generation Failed</p>
                        <p className="text-xs text-danger mt-1">{image.error}</p>
                    </div>
                   )}

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-3">
                    {image.status === 'success' && image.base64 && (
                      <>
                        <button 
                            onClick={() => setZoomedImage(image.base64!)}
                            className="text-white rounded-full p-3 bg-black/50 hover:bg-black/80"
                            aria-label="Zoom in on image"
                        >
                            <ZoomIcon className="h-6 w-6" />
                        </button>
                        <a
                          href={image.base64}
                          download={`group-fusion-${image.id.substring(0,4)}.${getImageExtension(image.base64)}`}
                          className="text-white rounded-full p-3 bg-black/50 hover:bg-black/80"
                          aria-label="Download image"
                        >
                          <DownloadIcon className="h-6 w-6" />
                        </a>
                        <button
                            onClick={() => handleSaveToLibrary(image, index)}
                            disabled={image.saveStatus !== 'idle'}
                            className={`text-white rounded-full p-3 bg-black/50 hover:bg-black/80 disabled:opacity-50 transition-colors ${image.saveStatus === 'saved' ? 'bg-green-500 hover:bg-green-600' : ''}`}
                            aria-label="Save to library"
                        >
                           {image.saveStatus === 'saving' ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : image.saveStatus === 'saved' ? <CheckIcon className="w-6 h-6" /> : <SaveIcon className="w-6 h-6" />}
                        </button>
                        <SendToLTXButton imageDataUrl={image.base64} prompt={ltxPrompt} className="text-white rounded-full p-3 bg-black/50 hover:bg-black/80" />
                      </>
                    )}
                     {image.status === 'error' && (
                        <button 
                            onClick={() => handleRetry(image.id)}
                          disabled={!isProviderReady}
                            className="text-white rounded-full p-3 bg-black/50 hover:bg-black/80"
                            aria-label="Retry generation"
                        >
                            <RefreshIcon className="h-6 w-6" />
                        </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center space-x-4">
               <button
                onClick={handleDownloadAll}
                disabled={successfulGenerations === 0}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-accent-text bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ZipIcon className="h-5 w-5 mr-2" />
                Download All (.zip)
              </button>
              <button
                onClick={() => dispatch(startOver())}
                className="inline-flex items-center px-6 py-3 border border-accent text-base font-medium rounded-md shadow-sm text-accent bg-transparent hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent"
              >
                <RefreshIcon className="h-5 w-5 mr-2" />
                Start Over
              </button>
            </div>
          </div>
        </>
      );
    }

    if (uploadedFiles.length > 0) {
      const isBackgroundDisabled = selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw';
      return (
        <div className="w-full">
          <ImagePreview files={uploadedFiles} onRemove={handleRemoveImage} onPersonaChange={handlePersonaChange} onCharacterNameChange={handleCharacterNameChange} onRemoveAll={handleRemoveAll} onAddLocalFiles={handleAddLocalFiles} onOpenLibrary={handleOpenLibrary} />
          <div className="space-y-8 mt-8">
            <BackgroundUpload
              backgroundFile={backgroundFile}
              onBackgroundChange={handleBackgroundChange}
              onRemoveBackground={handleRemoveBackground}
              isDisabled={!!isBackgroundDisabled}
            />
            <PoseSelector 
              poses={POSES} 
              selectedPose={selectedPose} 
              onSelectPose={(p) => dispatch(setSelectedPose(p))}
              numFiles={uploadedFiles.length}
            />
            <QualitySelector selectedQuality={quality} onSelectQuality={(q) => dispatch(setQuality(q))} />
            {provider === 'comfyui' && <div className="mx-auto w-full max-w-4xl space-y-3">
              <h3 className="text-sm font-bold text-text-secondary">FLUX2 settings</h3>
              <Accordion title="Models">{() => <ModelFields name={NAME} disabled={isLoading} onChange={(id, value) => updateFlux2Option({ [id as 'comfyFlux2EditUnet']: value })} fields={[
                { id: 'comfyFlux2EditUnet', label: 'FLUX2 Model (GGUF / Safetensors)', value: selectedFlux2Model, choices: flux2Models },
                { id: 'comfyFlux2EditClip', label: 'CLIP', value: generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors', choices: clips },
                { id: 'comfyFlux2EditVae', label: 'VAE', value: generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors', choices: vaes },
              ]} />}</Accordion>
              <Accordion title="LoRAs">{() => <>
                {([1, 2] as const).map(index => {
                  const nameField = `comfyFlux2EditLora${index}Name` as const, strengthField = `comfyFlux2EditLora${index}Strength` as const;
                  const selectedName = generationOptions[nameField] || '';
                  return <div key={index} className="space-y-2">
                    <Select variant="search" label={`LoRA ${index}`} ariaLabel={`${NAME} LoRA ${index}`} value={selectedName} options={[{ value: '', label: 'None' }, ...qwenLoras.map(value => ({ value, label: value }))]} disabled={isLoading} onChange={value => updateFlux2Option({ [nameField]: value })} />
                    <NumberField slider label={`LoRA ${index} Strength`} ariaLabel={`${NAME} LoRA ${index} strength`} value={generationOptions[strengthField] ?? 1} min={-2} max={2} step={0.05} disabled={isLoading || !selectedName} onChange={value => updateFlux2Option({ [strengthField]: value })} />
                  </div>;
                })}
                {(generationOptions.comfyFlux2EditLora1Name || generationOptions.comfyFlux2EditLora2Name) && !comfyUIObjectInfo?.LoraLoaderModelOnly && <p className="text-xs text-warning">Additional LoRAs require LoraLoaderModelOnly in ComfyUI.</p>}
              </>}</Accordion>
              <Accordion title="Sampler">{() => <>
                <SamplerFields name={NAME} disabled={isLoading} samplers={samplers} limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }}
                  value={{ sampler: generationOptions.comfyFlux2EditSampler || 'euler', steps: generationOptions.comfyFlux2EditSteps ?? 4, cfg: generationOptions.comfyFlux2EditCfg ?? 1 }}
                  onChange={patch => updateFlux2Option({
                    ...(patch.sampler !== undefined && { comfyFlux2EditSampler: patch.sampler }),
                    ...(patch.steps !== undefined && { comfyFlux2EditSteps: patch.steps }),
                    ...(patch.cfg !== undefined && { comfyFlux2EditCfg: patch.cfg }) })} />
                <NumberField label="Seed (-1 = random)" ariaLabel={`${NAME} Seed`} value={generationOptions.comfySeed ?? -1} min={-1} step={1} disabled={isLoading} onChange={value => updateFlux2Option({ comfySeed: value < 0 ? undefined : value })} />
                <Select label="Seed Control" ariaLabel={`${NAME} Seed Control`} value={generationOptions.comfySeedControl || 'randomize'} disabled={isLoading} onChange={value => updateFlux2Option({ comfySeedControl: value })}
                  options={[{ value: 'randomize', label: 'Randomize' }, { value: 'fixed', label: 'Fixed' }, { value: 'increment', label: 'Increment' }, { value: 'decrement', label: 'Decrement' }]} />
                {(generationOptions.comfySeedControl === 'increment' || generationOptions.comfySeedControl === 'decrement') && <NumberField slider label="Seed Step" ariaLabel={`${NAME} Seed Step`} value={generationOptions.comfySeedIncrement ?? 1} min={1} max={1000} step={1} disabled={isLoading} onChange={value => updateFlux2Option({ comfySeedIncrement: value })} />}
              </>}</Accordion>
              <Accordion title="Advanced">{() => <>
                <NumberField slider label="Source Megapixels" ariaLabel={`${NAME} Source Megapixels`} value={generationOptions.comfyFlux2EditMegapixels ?? 1} min={0.25} max={4} step={0.25} disabled={isLoading} onChange={value => updateFlux2Option({ comfyFlux2EditMegapixels: value })} />
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-secondary">
                  <input type="checkbox" checked={!!generationOptions.comfyFlux2EditUseCacheDit} onChange={(event) => updateFlux2Option({ comfyFlux2EditUseCacheDit: event.target.checked })} disabled={isLoading} className="rounded text-accent focus:ring-accent" />
                  Enable CacheDiT Accelerator
                </label>
                {generationOptions.comfyFlux2EditUseCacheDit && <>
                  <Select label="CacheDiT Model Type" ariaLabel={`${NAME} CacheDiT Model Type`} value={generationOptions.comfyFlux2EditCacheDitModelType || 'Auto'} options={cacheDitModels} disabled={isLoading} onChange={value => updateFlux2Option({ comfyFlux2EditCacheDitModelType: value })} />
                  <NumberField slider label="Warmup" ariaLabel={`${NAME} CacheDiT Warmup`} value={generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0} min={0} max={20} step={1} disabled={isLoading} onChange={value => updateFlux2Option({ comfyFlux2EditCacheDitWarmupSteps: value })} />
                  <NumberField slider label="Skip" ariaLabel={`${NAME} CacheDiT Skip`} value={generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0} min={0} max={10} step={1} disabled={isLoading} onChange={value => updateFlux2Option({ comfyFlux2EditCacheDitSkipInterval: value })} />
                </>}
              </>}</Accordion>
            </div>}
            {provider === 'qwen' && <div className="mx-auto w-full max-w-4xl space-y-3">
              <h3 className="text-sm font-bold text-text-secondary">QWEN-Edit settings</h3>
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-text-secondary">Lightning preset</span>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-bg-tertiary p-1">
                    {([4, 8] as const).map(steps => <button key={steps} type="button" onClick={() => selectQwenLightningPreset(steps)} disabled={isLoading} className={`rounded px-3 py-2 text-xs font-bold transition-colors ${qwenLightningPreset === steps ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>{steps}-step</button>)}
                  </div>
                  <p className="text-xs text-text-muted">Switches the installed Lightning LoRA and sampling steps together.</p>
                </div>
              <Accordion title="Models">{() => <ModelFields name={NAME} disabled={isLoading} onChange={(id, value) => updateFlux2Option({ [id as 'comfyQwenEditUnet']: value })} fields={[
                { id: 'comfyQwenEditUnet', label: 'Qwen Edit Model', value: generationOptions.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', choices: qwenModels },
                { id: 'comfyQwenEditClip', label: 'CLIP', value: generationOptions.comfyQwenEditClip || 'qwen_2.5_vl_7b_fp8_scaled.safetensors', choices: clips },
                { id: 'comfyQwenEditVae', label: 'VAE', value: generationOptions.comfyQwenEditVae || 'qwen_image_vae.safetensors', choices: vaes },
              ]} />}</Accordion>
              <Accordion title="LoRAs">{() => <>
                <Select variant="search" label="Lightning LoRA" ariaLabel={`${NAME} Lightning LoRA`} value={generationOptions.comfyQwenEditLora1Name || QWEN_LIGHTNING_PRESETS[8]} options={qwenLoras} disabled={isLoading} onChange={value => updateFlux2Option({ comfyQwenEditUseLora: true, comfyQwenEditLora1Name: value })} />
                <NumberField slider label="LoRA Strength" ariaLabel={`${NAME} LoRA Strength`} value={generationOptions.comfyQwenEditLora1Strength ?? 1} min={0} max={2} step={0.05} disabled={isLoading} onChange={value => updateFlux2Option({ comfyQwenEditLora1Strength: value })} />
              </>}</Accordion>
              <Accordion title="Sampler">{() => <SamplerFields name={NAME} disabled={isLoading} samplers={samplers} schedulers={schedulers} limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }}
                value={{ sampler: generationOptions.photoFusionQwenSampler || 'euler_ancestral', scheduler: generationOptions.photoFusionQwenScheduler || 'beta57', steps: generationOptions.photoFusionQwenSteps ?? 8, cfg: generationOptions.photoFusionQwenCfg ?? 1 }}
                onChange={patch => updateFlux2Option({
                  ...(patch.sampler !== undefined && { photoFusionQwenSampler: patch.sampler }),
                  ...(patch.scheduler !== undefined && { photoFusionQwenScheduler: patch.scheduler }),
                  ...(patch.steps !== undefined && { photoFusionQwenSteps: patch.steps }),
                  ...(patch.cfg !== undefined && { photoFusionQwenCfg: patch.cfg }) })} />}</Accordion>
              <Accordion title="Advanced">{() => <>
                <NumberField slider label="Source Megapixels" ariaLabel={`${NAME} Source Megapixels`} value={generationOptions.comfyQwenEditMegapixels ?? 1} min={0.25} max={4} step={0.25} disabled={isLoading} onChange={value => updateFlux2Option({ comfyQwenEditMegapixels: value })} />
                <NumberField slider label="AuraFlow Shift" ariaLabel={`${NAME} AuraFlow Shift`} value={generationOptions.comfyQwenEditShift ?? 2.5} min={0} max={10} step={0.1} disabled={isLoading} onChange={value => updateFlux2Option({ comfyQwenEditShift: value })} />
              </>}</Accordion>
            </div>}
          </div>
          <div className="w-full max-w-4xl mx-auto mt-8">
              <h2 className="text-xl font-semibold text-text-primary mb-4 text-center">Number of Pictures</h2>
              <div className="p-4 bg-bg-tertiary rounded-lg">
                  <NumberField slider label="Number of Images to Generate" ariaLabel={`${NAME} Number of images`} value={numImages} min={1} max={4} step={1} disabled={isLoading} onChange={value => dispatch(setNumImages(Math.round(value)))} />
              </div>
          </div>
          <div className="mt-8 text-center">
            {provider === 'comfyui' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use FLUX2 Photo Fusion.</p>}
            {provider === 'qwen' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use QWEN-Edit Photo Fusion.</p>}
            {provider === 'gemini' && !getApiKey() && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Configure Gemini to use Gemini Photo Fusion.</p>}
            {provider === 'mammouth' && !isMammouthConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect Mammouth to use Mammouth Photo Fusion.</p>}
            {provider !== 'gemini' && provider !== 'mammouth' && missingNodes.length > 0 && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
            {qwenInputLimitExceeded && <p className="mb-3 rounded-md bg-warning-bg p-3 text-sm text-warning">QWEN-Edit accepts at most 3 input images: use 2–3 people without a background, or 2 people with one background.</p>}
            <button
              onClick={handleGenerate}
              disabled={isLoading || !isProviderReady || qwenInputLimitExceeded || !selectedPose || uploadedFiles.length < 2 || uploadedFiles.length > 4}
              className="px-8 py-4 bg-accent text-accent-text font-bold rounded-lg shadow-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300 transform hover:scale-105"
            >
              {isLoading ? 'Generating...' : `Fuse Photos with ${providerLabel}`}
            </button>
          </div>
        </div>
      );
    }
    
    return <FileUpload onFilesChange={handleFilesChange} onOpenLibrary={handleOpenLibrary} />;
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex-grow flex flex-col items-center justify-center">
        <div className="mb-6 flex w-full max-w-4xl flex-wrap items-center gap-3 rounded-md border border-border-primary bg-bg-secondary p-3">
          <span className="text-sm font-semibold text-text-secondary">Photo Fusion engine</span>
          <div className="flex gap-1 rounded-md bg-bg-tertiary p-1">
            <button type="button" onClick={() => dispatch(setProvider('comfyui'))} disabled={isLoading} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'comfyui' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>FLUX2</button>
            <button type="button" onClick={() => dispatch(setProvider('qwen'))} disabled={isLoading} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'qwen' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>QWEN-Edit</button>
            <button type="button" onClick={() => dispatch(setProvider('gemini'))} disabled={isLoading} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'gemini' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Gemini</button>
            <button type="button" onClick={() => dispatch(setProvider('mammouth'))} disabled={isLoading} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'mammouth' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Mammouth</button>
          </div>
          {provider === 'gemini' && <div className="grid min-w-[240px] flex-1 gap-2 sm:grid-cols-3">
            <Select ariaLabel="Gemini image model" value={generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL} options={geminiModels} disabled={isLoading} onChange={model => {
              const sizes = getGeminiImageSizes(model);
              updateFlux2Option({ geminiT2IModel: model, geminiImageSize: sizes.includes(generationOptions.geminiImageSize) ? generationOptions.geminiImageSize : '1K' });
            }} />
            <Select<string> ariaLabel="Gemini image size" value={generationOptions.geminiImageSize || '1K'} options={getGeminiImageSizes(generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL)} disabled={isLoading} onChange={size => updateFlux2Option({ geminiImageSize: size as typeof generationOptions.geminiImageSize })} />
            {supportsGeminiThinkingLevel(generationOptions.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) && <Select<string> ariaLabel="Gemini thinking level" value={generationOptions.geminiThinkingLevel || 'minimal'} disabled={isLoading}
              options={[{ value: 'minimal', label: 'Minimal thinking' }, { value: 'high', label: 'High thinking' }]} onChange={level => updateFlux2Option({ geminiThinkingLevel: level as typeof generationOptions.geminiThinkingLevel })} />}
          </div>}
          {provider === 'mammouth' && <div className="relative min-w-[240px] flex-1">
            <Select ariaLabel="Mammouth image model" value={generationOptions.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} options={mammouthModels} disabled={isLoading || isLoadingMammouthModels} onChange={model => updateFlux2Option({ mammouthImageModel: model })} />
            {isLoadingMammouthModels && <SpinnerIcon className="absolute right-8 top-2.5 h-4 w-4 animate-spin text-text-muted" />}
          </div>}
        </div>
        {error && (
            <div className="bg-danger-bg border border-danger text-danger px-4 py-3 rounded-lg relative mb-6 w-full max-w-2xl" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
            </div>
        )}
        {renderContent()}
        {isDebugMode && debugInfos.length > 0 && <DebugSection debugInfos={debugInfos} />}
        <div className="w-full max-w-5xl mx-auto text-center mt-10 text-text-muted text-sm">
            <label className="flex items-center justify-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDebugMode}
                onChange={() => dispatch(setIsDebugMode(!isDebugMode))}
                className="form-checkbox h-5 w-5 text-accent bg-bg-tertiary border-border-primary rounded focus:ring-accent"
              />
              <span className="text-text-secondary">Enable Debug Mode</span>
            </label>
        </div>
    </div>
  );
};

export default GroupPhotoFusionPanel;