import React, { useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import JSZip from 'jszip';
import { RootState, AppDispatch } from '../../store/store';
import {
    setUploadedFiles, setBackgroundFile, setSelectedPose, setQuality,
    setGeneratedImages, updateGeneratedImage, setError, startOver,
    setIsDebugMode, addDebugInfo, setLoading, removeAllFiles,
    removeUploadedFile, updatePersona, clearDebugInfos, setSaveStatus
} from '../../store/groupPhotoFusionSlice';
import { addToLibrary } from '../../store/librarySlice';
import { Pose, UploadedFile, Quality, DebugInfo, GeneratedImage } from '../../groupPhotoFusion/types';
import { POSES, PERSONAS } from '../../groupPhotoFusion/constants';
import { generateGroupPhoto } from '../../services/groupPhotoFusionService';
import FileUpload from './FileUpload';
import ImagePreview from './ImagePreview';
import PoseSelector from './PoseSelector';
import QualitySelector from './QualitySelector';
import BackgroundUpload from './BackgroundUpload';
import GroupPhotoFusionLoader from './GroupPhotoFusionLoader';
import { DownloadIcon, RefreshIcon, ZoomIcon, ZipIcon, SaveIcon, CheckIcon, SpinnerIcon } from '../icons';
import DebugSection from './DebugSection';
import { dataUrlToThumbnail } from '../../utils/imageUtils';

const GroupPhotoFusionPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const {
      uploadedFiles, backgroundFile, selectedPose, quality,
      isLoading, generatedImages, error, isDebugMode, debugInfos
  } = useSelector((state: RootState) => state.groupPhotoFusion);

  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

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
  
  const handleGenerate = useCallback(async () => {
    if (!selectedPose || uploadedFiles.length < 2) {
      dispatch(setError("Please upload 2 to 4 subject photos and select a pose."));
      return;
    }

    dispatch(setLoading(true));
    dispatch(setError(null));
    dispatch(clearDebugInfos());

    const placeholders: GeneratedImage[] = Array(4).fill(0).map(() => ({
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
      const allFiles = backgroundToUse ? [...subjectFiles, backgroundToUse.file] : subjectFiles;

      const personaDescriptions = uploadedFiles.map(uf => {
        if (uf.personaId) {
            const persona = PERSONAS.find(p => p.id === uf.personaId);
            return persona ? persona.description : '';
        }
        return '';
      });

      const prompt = selectedPose.getPrompt(personaDescriptions, quality, !!backgroundToUse);
      
      const generationPromises = Array(4).fill(0).map(() => generateGroupPhoto(allFiles, prompt));
      const results = await Promise.allSettled(generationPromises);
      
      results.forEach((result, index) => {
        const id = placeholders[index].id;
        if (result.status === 'fulfilled') {
          dispatch(updateGeneratedImage({
            id,
            base64: `data:image/jpeg;base64,${result.value.imageBase64}`,
            status: 'success',
          }));
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
  }, [selectedPose, uploadedFiles, quality, backgroundFile, isDebugMode, dispatch]);

  const handleRetry = useCallback(async (id: string) => {
    dispatch(updateGeneratedImage({ id, status: 'generating', error: undefined }));
    
    const subjectFiles = uploadedFiles.map(uf => uf.file);
    const isBackgroundSupported = !(selectedPose?.id === 'cinematic-portrait' || selectedPose?.id === 'professional-bw');
    const backgroundToUse = backgroundFile && isBackgroundSupported ? backgroundFile : null;
    const allFiles = backgroundToUse ? [...subjectFiles, backgroundToUse.file] : subjectFiles;
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
        const result = await generateGroupPhoto(allFiles, prompt);
        dispatch(updateGeneratedImage({
            id,
            base64: `data:image/jpeg;base64,${result.imageBase64}`,
            status: 'success'
        }));
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
  }, [selectedPose, uploadedFiles, quality, backgroundFile, isDebugMode, dispatch]);
  
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              {generatedImages.map((image, index) => (
                <div key={image.id} className="relative group aspect-square bg-bg-tertiary rounded-lg flex items-center justify-center overflow-hidden">
                  {image.status === 'success' && image.base64 && (
                    <img src={image.base64} alt="Generated group photo" className="w-full h-full object-cover" />
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
          <ImagePreview files={uploadedFiles} onRemove={handleRemoveImage} onPersonaChange={handlePersonaChange} onRemoveAll={handleRemoveAll} />
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
          </div>
          <div className="mt-8 text-center">
            <button
              onClick={handleGenerate}
              disabled={isLoading || !selectedPose || uploadedFiles.length < 2 || uploadedFiles.length > 4}
              className="px-8 py-4 bg-accent text-accent-text font-bold rounded-lg shadow-lg hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed transition-colors duration-300 transform hover:scale-105"
            >
              {isLoading ? 'Generating...' : '✨ Fuse Photos'}
            </button>
          </div>
        </div>
      );
    }
    
    return <FileUpload onFilesChange={handleFilesChange} />;
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex-grow flex flex-col items-center justify-center">
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
