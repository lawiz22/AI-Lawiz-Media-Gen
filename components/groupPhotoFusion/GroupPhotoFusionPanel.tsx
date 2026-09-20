import React, { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import JSZip from 'jszip';
import { RootState, AppDispatch } from '../../store/store';
import {
    setUploadedFiles, setBackgroundFile, setSelectedPose, setQuality,
    setGeneratedImages, updateGeneratedImage, setError, startOver,
    setIsDebugMode, addDebugInfo, setLoading, removeAllFiles,
    removeUploadedFile, updatePersona, clearDebugInfos, setSaveStatus,
    setNumImages, setProvider
} from '../../store/groupPhotoFusionSlice';
import { updateOptions as updateGenerationOptions } from '../../store/generationSlice';
import { addToLibrary } from '../../store/librarySlice';
import { addSessionTokenUsage, setModalOpen } from '../../store/appSlice';
import { Pose, UploadedFile, Quality, DebugInfo, GeneratedImage } from '../../groupPhotoFusion/types';
import { POSES, PERSONAS } from '../../groupPhotoFusion/constants';
import { generateComfyUIGroupPhoto, generateGroupPhoto } from '../../services/groupPhotoFusionService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../../services/mammouthService';
import FileUpload from './FileUpload';
import ImagePreview from './ImagePreview';
import PoseSelector from './PoseSelector';
import QualitySelector from './QualitySelector';
import BackgroundUpload from './BackgroundUpload';
import GroupPhotoFusionLoader from './GroupPhotoFusionLoader';
import { DownloadIcon, RefreshIcon, ZoomIcon, ZipIcon, SaveIcon, CheckIcon, SpinnerIcon } from '../icons';
import DebugSection from './DebugSection';
import { dataUrlToThumbnail, fileToDataUrl } from '../../utils/imageUtils';
import { SendToLTXButton } from '../SendToLTXButton';
import { CheckboxSlider, NumberSlider, SelectInput } from '../InputComponents';

const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean))).map(value => ({ value, label: value }));

const GroupPhotoFusionPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const {
      provider, uploadedFiles, backgroundFile, selectedPose, quality, numImages,
      isLoading, generatedImages, error, isDebugMode, debugInfos
  } = useSelector((state: RootState) => state.groupPhotoFusion);
  const generationOptions = useSelector((state: RootState) => state.generation.options);
    const { isComfyUIConnected, isMammouthConnected, comfyUIObjectInfo } = useSelector((state: RootState) => state.app);
  const ltxPrompt = selectedPose?.getPrompt(uploadedFiles.map(file => {
    const persona = PERSONAS.find(item => item.id === file.personaId);
    return persona?.description || '';
  }), quality, !!backgroundFile);

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mammouthModels, setMammouthModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
  const [isLoadingMammouthModels, setIsLoadingMammouthModels] = useState(false);
  const models = getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name);
  const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
  const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
  const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
  const cacheDitModels = getOptions(comfyUIObjectInfo?.CacheDiT_Model_Optimizer?.input?.required?.model_type);
  const requiredNodes = ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'];
  const missingNodes = comfyUIObjectInfo ? requiredNodes.filter(node => !comfyUIObjectInfo[node]) : [];
  if (generationOptions.comfyFlux2EditUseCacheDit && comfyUIObjectInfo && !comfyUIObjectInfo.CacheDiT_Model_Optimizer) missingNodes.push('CacheDiT_Model_Optimizer');

  const updateFlux2Option = (updates: Partial<typeof generationOptions>) => dispatch(updateGenerationOptions(updates));

  useEffect(() => {
    if (provider !== 'mammouth') return;
    setIsLoadingMammouthModels(true);
    getMammouthImageModels()
      .then(models => setMammouthModels(models.length > 0 ? models : [...MAMMOUTH_IMAGE_MODELS].sort()))
      .finally(() => setIsLoadingMammouthModels(false));
  }, [provider]);

  const handleFilesChange = (files: UploadedFile[]) => {
    dispatch(setUploadedFiles(files));
  };

  const handleBackgroundChange = (file: UploadedFile) => {
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

  const handleRemoveAll = () => {
    dispatch(removeAllFiles());
  };

  const handleOpenLibrary = useCallback(() => {
    if (uploadedFiles.length >= 4) {
        dispatch(setError("You can only add up to 4 subjects."));
        return;
    }
    dispatch(setModalOpen({ modal: 'isGroupFusionPickerOpen', isOpen: true }));
  }, [uploadedFiles.length, dispatch]);
  
  const handleGenerate = useCallback(async () => {
    if (!selectedPose || uploadedFiles.length < 2) {
      dispatch(setError("Please upload 2 to 4 subject photos and select a pose."));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));
    dispatch(clearDebugInfos());

    const placeholders: GeneratedImage[] = Array(numImages).fill(0).map(() => ({
        id: crypto.randomUUID(),
        base64: null,
        status: 'generating',
        saveStatus: 'idle'
    }));
    dispatch(setGeneratedImages(placeholders));

    try {
      const subjectFiles = uploadedFiles.map(uf => uf.file);
      const isBackgroundSupported = !(selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw');
      const backgroundToUse = backgroundFile && isBackgroundSupported ? backgroundFile : null;
      const personaDescriptions = uploadedFiles.map(uf => {
        if (uf.personaId) {
            const persona = PERSONAS.find(p => p.id === uf.personaId);
            return persona ? persona.description : '';
        }
        return '';
      });

      const prompt = selectedPose.getPrompt(personaDescriptions, quality, !!backgroundToUse);
      const baseSeed = generationOptions.comfySeed ?? Math.floor(Math.random() * 1e15);
      const generationTasks = Array(numImages).fill(0).map((_, index) => () => provider === 'mammouth'
        ? generateGroupPhoto(
            [...subjectFiles, ...(backgroundToUse ? [backgroundToUse.file] : [])],
            prompt,
            'mammouth',
            generationOptions.mammouthImageModel,
          )
        : generateComfyUIGroupPhoto(
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
            () => undefined,
          ));
      const results = await generationTasks.reduce<Promise<PromiseSettledResult<Awaited<ReturnType<typeof generateComfyUIGroupPhoto>>>[]>>(async (pending, task) => {
        const settled = await pending;
        settled.push(...await Promise.allSettled([task()]));
        return settled;
      }, Promise.resolve([]));
      
      results.forEach((result, index) => {
        const id = placeholders[index].id;
        if (result.status === 'fulfilled') {
          dispatch(updateGeneratedImage({
            id,
            base64: `data:image/jpeg;base64,${result.value.imageBase64}`,
            seed: result.value.seed,
            status: 'success',
          }));
          if (result.value.usageMetadata) {
            dispatch(addSessionTokenUsage(result.value.usageMetadata));
          }
          if (isDebugMode) {
            dispatch(addDebugInfo({
              prompt,
              subjects: uploadedFiles,
              background: backgroundToUse,
              quality,
              apiResponseText: result.value.responseText,
              generatedImageBase64: result.value.imageBase64,
            }));
          }
        } else {
          dispatch(updateGeneratedImage({
            id,
            base64: null,
            status: 'error',
            error: result.reason instanceof Error ? result.reason.message : "An unknown error occurred.",
          }));
        }
      });
      
    } catch (err) {
      console.error(err);
      dispatch(setError(err instanceof Error ? err.message : "An unknown error occurred during image generation."));
      dispatch(setGeneratedImages(null));
    } finally {
      dispatch(setLoading(false));
    }
  }, [selectedPose, uploadedFiles, quality, backgroundFile, isDebugMode, dispatch, numImages, generationOptions, provider]);

  const handleRetry = useCallback(async (id: string) => {
    dispatch(updateGeneratedImage({ id, status: 'generating', error: undefined }));
    
    const subjectFiles = uploadedFiles.map(uf => uf.file);
    const isBackgroundSupported = !(selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw');
    const backgroundToUse = backgroundFile && isBackgroundSupported ? backgroundFile : null;
    const personaDescriptions = uploadedFiles.map(uf => {
        if (uf.personaId) {
            const persona = PERSONAS.find(p => p.id === uf.personaId);
            return persona ? persona.description : '';
        }
        return '';
    });
    if (!selectedPose) return;
    const prompt = selectedPose.getPrompt(personaDescriptions, quality, !!backgroundToUse);

    try {
        const result = provider === 'mammouth'
          ? await generateGroupPhoto([...subjectFiles, ...(backgroundToUse ? [backgroundToUse.file] : [])], prompt, 'mammouth', generationOptions.mammouthImageModel)
          : await generateComfyUIGroupPhoto(subjectFiles, backgroundToUse?.file || null, prompt, personaDescriptions, generationOptions, () => undefined);
        dispatch(updateGeneratedImage({
            id,
            base64: `data:image/jpeg;base64,${result.imageBase64}`,
          seed: result.seed,
            status: 'success'
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
            }));
        }
    } catch(err) {
        dispatch(updateGeneratedImage({
            id,
            status: 'error',
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
                zip.file(`fusion_${index + 1}.jpg`, base64Data, { base64: true });
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
              provider,
              ...(provider === 'comfyui' ? {
                comfyModelType: 'flux2-edit' as const,
                comfyFlux2EditPrompt: ltxPrompt,
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
    if (isLoading) {
      return <GroupPhotoFusionLoader />;
    }

    if (generatedImages) {
        const successfulGenerations = generatedImages.filter(img => img.status === 'success').length;
        const totalGenerations = generatedImages.length;
        
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
            <h2 className="text-2xl font-bold text-text-primary mb-4">Your Fused Photos are Ready!</h2>
            <div className={`grid grid-cols-1 ${totalGenerations > 1 ? 'sm:grid-cols-2' : ''} gap-6 mb-8`}>
              {generatedImages.map((image, index) => (
                <div key={image.id} className={`relative group bg-bg-tertiary rounded-lg flex items-center justify-center overflow-hidden ${totalGenerations > 1 ? 'aspect-square' : ''}`}>
                  {image.status === 'success' && image.base64 && (
                    <img src={image.base64} alt="Generated group photo" className={`w-full ${totalGenerations > 1 ? 'h-full object-cover' : 'h-auto object-contain max-w-3xl mx-auto'}`} />
                  )}
                  {image.status === 'generating' && (
                     <div className="flex flex-col items-center justify-center text-center">
                        <SpinnerIcon className="w-10 h-10 animate-spin text-accent" />
                        <p className="text-sm text-text-secondary mt-2">Generating...</p>
                    </div>
                  )}
                   {image.status === 'error' && (
                    <div className="p-4 text-center">
                        <p className="text-danger font-semibold">Generation Failed</p>
                        <p className="text-xs text-danger/80 mt-1">{image.error}</p>
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
                          download={`group-fusion-${image.id.substring(0,4)}.jpg`}
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
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-accent-text bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent disabled:bg-accent/50 disabled:cursor-not-allowed"
              >
                <ZipIcon className="h-5 w-5 mr-2" />
                Download All (.zip)
              </button>
              <button
                onClick={() => dispatch(startOver())}
                className="inline-flex items-center px-6 py-3 border border-accent text-base font-medium rounded-md shadow-sm text-accent bg-transparent hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary focus:ring-accent"
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
          <ImagePreview files={uploadedFiles} onRemove={handleRemoveImage} onPersonaChange={handlePersonaChange} onRemoveAll={handleRemoveAll} onOpenLibrary={handleOpenLibrary} />
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
            {provider === 'comfyui' && <div className="mx-auto w-full max-w-4xl rounded-md border border-border-primary bg-bg-secondary">
              <button type="button" onClick={() => setAdvancedOpen(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-text-secondary hover:text-accent" aria-expanded={advancedOpen}>
                <span>FLUX2 Advanced Settings</span><span>{advancedOpen ? '−' : '+'}</span>
              </button>
              {advancedOpen && <div className="space-y-5 border-t border-border-primary p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectInput label="FLUX2 Model" value={generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf'} onChange={(event) => updateFlux2Option({ comfyFlux2EditUnet: event.target.value })} options={withCurrent(generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf', models)} disabled={isLoading} />
                  <SelectInput label="CLIP" value={generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors'} onChange={(event) => updateFlux2Option({ comfyFlux2EditClip: event.target.value })} options={withCurrent(generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors', clips)} disabled={isLoading} />
                  <SelectInput label="VAE" value={generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors'} onChange={(event) => updateFlux2Option({ comfyFlux2EditVae: event.target.value })} options={withCurrent(generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors', vaes)} disabled={isLoading} />
                  <SelectInput label="Sampler" value={generationOptions.comfyFlux2EditSampler || 'euler'} onChange={(event) => updateFlux2Option({ comfyFlux2EditSampler: event.target.value })} options={withCurrent(generationOptions.comfyFlux2EditSampler || 'euler', samplers)} disabled={isLoading} />
                  <NumberSlider label={`Source Megapixels: ${generationOptions.comfyFlux2EditMegapixels ?? 1}`} value={generationOptions.comfyFlux2EditMegapixels ?? 1} onChange={(event) => updateFlux2Option({ comfyFlux2EditMegapixels: Number(event.target.value) })} min={0.25} max={4} step={0.25} disabled={isLoading} allowDirectInput />
                  <NumberSlider label={`Steps: ${generationOptions.comfyFlux2EditSteps ?? 4}`} value={generationOptions.comfyFlux2EditSteps ?? 4} onChange={(event) => updateFlux2Option({ comfyFlux2EditSteps: Number(event.target.value) })} min={1} max={40} step={1} disabled={isLoading} allowDirectInput />
                  <NumberSlider label={`CFG: ${generationOptions.comfyFlux2EditCfg ?? 1}`} value={generationOptions.comfyFlux2EditCfg ?? 1} onChange={(event) => updateFlux2Option({ comfyFlux2EditCfg: Number(event.target.value) })} min={0.1} max={10} step={0.1} disabled={isLoading} allowDirectInput />
                  <label className="block text-sm font-medium text-text-secondary">Seed (-1 = random)<input type="number" value={generationOptions.comfySeed ?? -1} onChange={(event) => updateFlux2Option({ comfySeed: Number(event.target.value) < 0 ? undefined : Number(event.target.value) })} disabled={isLoading} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2" /></label>
                  <SelectInput label="Seed Control" value={generationOptions.comfySeedControl || 'randomize'} onChange={(event) => updateFlux2Option({ comfySeedControl: event.target.value as NonNullable<typeof generationOptions.comfySeedControl> })} options={[{ value: 'randomize', label: 'Randomize' }, { value: 'fixed', label: 'Fixed' }, { value: 'increment', label: 'Increment' }, { value: 'decrement', label: 'Decrement' }]} disabled={isLoading} />
                  {(generationOptions.comfySeedControl === 'increment' || generationOptions.comfySeedControl === 'decrement') && <NumberSlider label={`Seed Step: ${generationOptions.comfySeedIncrement ?? 1}`} value={generationOptions.comfySeedIncrement ?? 1} onChange={(event) => updateFlux2Option({ comfySeedIncrement: Number(event.target.value) })} min={1} max={1000} step={1} disabled={isLoading} allowDirectInput />}
                </div>
                <CheckboxSlider label="Enable CacheDiT Accelerator" checked={!!generationOptions.comfyFlux2EditUseCacheDit} onChange={(event) => updateFlux2Option({ comfyFlux2EditUseCacheDit: event.target.checked })} disabled={isLoading} />
                {generationOptions.comfyFlux2EditUseCacheDit && <div className="grid gap-4 sm:grid-cols-3">
                  <SelectInput label="CacheDiT Model Type" value={generationOptions.comfyFlux2EditCacheDitModelType || 'Auto'} onChange={(event) => updateFlux2Option({ comfyFlux2EditCacheDitModelType: event.target.value })} options={withCurrent(generationOptions.comfyFlux2EditCacheDitModelType || 'Auto', cacheDitModels)} disabled={isLoading} />
                  <NumberSlider label={`Warmup: ${generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitWarmupSteps ?? 0} onChange={(event) => updateFlux2Option({ comfyFlux2EditCacheDitWarmupSteps: Number(event.target.value) })} min={0} max={20} step={1} disabled={isLoading} allowDirectInput />
                  <NumberSlider label={`Skip: ${generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0}`} value={generationOptions.comfyFlux2EditCacheDitSkipInterval ?? 0} onChange={(event) => updateFlux2Option({ comfyFlux2EditCacheDitSkipInterval: Number(event.target.value) })} min={0} max={10} step={1} disabled={isLoading} allowDirectInput />
                </div>}
              </div>}
            </div>}
          </div>
          <div className="w-full max-w-4xl mx-auto mt-8">
              <h2 className="text-xl font-semibold text-text-primary mb-4 text-center">Number of Pictures</h2>
              <div className="p-4 bg-bg-tertiary rounded-lg">
                  <label className="block text-sm font-medium text-text-secondary">Number of Images to Generate: {numImages}</label>
                  <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={numImages}
                      onChange={(e) => dispatch(setNumImages(parseInt(e.target.value, 10)))}
                      disabled={isLoading}
                      className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-text-muted mt-1 px-1">
                      <span>1</span>
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                  </div>
              </div>
          </div>
          <div className="mt-8 text-center">
            {provider === 'comfyui' && !isComfyUIConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use FLUX2 Photo Fusion.</p>}
            {provider === 'mammouth' && !isMammouthConnected && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Connect Mammouth to use Mammouth Photo Fusion.</p>}
            {provider === 'comfyui' && missingNodes.length > 0 && <p className="mb-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
            <button
              onClick={handleGenerate}
              disabled={isLoading || (provider === 'comfyui' ? !isComfyUIConnected || missingNodes.length > 0 : !isMammouthConnected) || !selectedPose || uploadedFiles.length < 2 || uploadedFiles.length > 4}
              className="px-8 py-4 bg-accent text-accent-text font-bold rounded-lg shadow-lg hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed transition-colors duration-300 transform hover:scale-105"
            >
              {isLoading ? 'Generating...' : `Fuse Photos with ${provider === 'comfyui' ? 'FLUX2' : 'Mammouth'}`}
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
            <button type="button" onClick={() => dispatch(setProvider('mammouth'))} disabled={isLoading} className={`rounded px-3 py-1.5 text-xs font-bold ${provider === 'mammouth' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>Mammouth</button>
          </div>
          {provider === 'mammouth' && <div className="relative min-w-[240px] flex-1">
            <select value={generationOptions.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} onChange={(event) => updateFlux2Option({ mammouthImageModel: event.target.value })} disabled={isLoading || isLoadingMammouthModels} className="w-full rounded-md border border-border-primary bg-bg-tertiary p-2 pr-8 text-sm" aria-label="Mammouth image model">
              {mammouthModels.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            {isLoadingMammouthModels && <SpinnerIcon className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-text-muted" />}
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