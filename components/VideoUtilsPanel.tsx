import React, { useState, useRef, ChangeEvent, useMemo, useEffect } from 'react';
import { FilmIcon, DownloadIcon, SaveIcon, SpinnerIcon, StartFrameIcon, EndFrameIcon, CheckIcon } from './icons';
import { dataUrlToFile, dataUrlToThumbnail } from '../utils/imageUtils';
import { saveToLibrary } from '../services/libraryService';
import type { LibraryItem } from '../types';

// Helper to format time in HH:MM:SS.ms
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

interface VideoUtilsPanelProps {
    setStartFrame: (file: File) => void;
    setEndFrame: (file: File) => void;
    videoFile: File | null;
    setVideoFile: (file: File | null) => void;
    extractedFrame: string | null;
    setExtractedFrame: (frame: string | null) => void;
}

export const VideoUtilsPanel: React.FC<VideoUtilsPanelProps> = ({ 
    setStartFrame, 
    setEndFrame,
    videoFile,
    setVideoFile,
    extractedFrame,
    setExtractedFrame
}) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const videoSrc = useMemo(() => {
        if (!videoFile) return null;
        return URL.createObjectURL(videoFile);
    }, [videoFile]);

    useEffect(() => {
        // Cleanup the object URL when the component unmounts or the src changes
        return () => {
            if (videoSrc) {
                URL.revokeObjectURL(videoSrc);
            }
        };
    }, [videoSrc]);

    useEffect(() => {
        // Reset save state if a new frame is extracted
        setSavingState('idle');
    }, [extractedFrame]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('video/')) {
            setVideoFile(file);
            setExtractedFrame(null); // Reset on new video
        } else {
            setVideoFile(null);
            setExtractedFrame(null);
            if (file) alert('Please select a valid video file.');
        }
         // Clear the input value to allow re-uploading the same file
        e.target.value = '';
    };

    const handleExtractFrame = (time: number) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const captureFrame = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                setExtractedFrame(canvas.toDataURL('image/jpeg', 0.95));
            }
        };

        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
            video.currentTime = time;
            // The 'seeked' event ensures the frame is ready to be drawn
            const onSeeked = () => {
                captureFrame();
                video.removeEventListener('seeked', onSeeked);
            };
            video.addEventListener('seeked', onSeeked);
        }
    };

    const handleDownloadFrame = () => {
        if (!extractedFrame) return;
        const link = document.createElement('a');
        link.href = extractedFrame;
        link.download = `frame_${formatTime(currentTime).replace(/:|\./g, '_')}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSetAsStartFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'start_frame.jpeg');
        setStartFrame(file);
    };

    const handleSetAsEndFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'end_frame.jpeg');
        setEndFrame(file);
    };

    const handleSaveFrameToLibrary = async () => {
        if (!extractedFrame) return;
        setSavingState('saving');
        try {
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'extracted-frame',
                media: extractedFrame,
                thumbnail: await dataUrlToThumbnail(extractedFrame, 256),
                name: `Frame at ${formatTime(currentTime)} from ${videoFile?.name || 'Uploaded Video'}`,
            };
            await saveToLibrary(item);
            setSavingState('saved');
        } catch (err) {
            console.error("Failed to save frame to library:", err);
            setSavingState('idle'); // Allow retry on error
        }
    };
    
    const savingStatus = savingState;

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-4xl mx-auto space-y-8">
            <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
                <div className="flex items-center gap-3 mb-4">
                    <FilmIcon className="w-8 h-8 text-accent" />
                    <h2 className="text-2xl font-bold text-accent">Frame Extractor</h2>
                </div>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a video to select and save a specific frame as a high-quality image. Perfect for creating start/end frames for the video generator.
                </p>

                {/* --- Uploader --- */}
                <div className="max-w-xl mx-auto">
                    <label htmlFor="video-upload" className="block text-sm font-medium text-text-secondary mb-2">
                        Upload Video File
                    </label>
                    <input
                        id="video-upload"
                        type="file"
                        accept="video/*"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-text hover:file:bg-accent-hover"
                    />
                </div>
                
                {videoSrc && (
                    <div className="mt-8 space-y-6">
                        {/* --- Video Player and Controls --- */}
                        <div>
                            <video
                                ref={videoRef}
                                src={videoSrc}
                                controls
                                className="w-full rounded-lg bg-black"
                                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                            />
                            <div className="mt-4">
                                <input
                                    type="range"
                                    min="0"
                                    max={duration || 0}
                                    step="0.01"
                                    value={currentTime}
                                    onChange={(e) => {
                                        if (videoRef.current) {
                                            videoRef.current.currentTime = parseFloat(e.target.value);
                                        }
                                    }}
                                    className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="text-center text-sm font-mono text-text-secondary mt-2">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </div>
                            </div>
                        </div>

                        {/* --- Action Buttons --- */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleExtractFrame(currentTime)}
                                className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                            >
                                Save Current Frame
                            </button>
                             <button
                                onClick={() => handleExtractFrame(duration)}
                                className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                            >
                                Save Last Frame
                            </button>
                        </div>
                        
                        {/* --- Extracted Frame Preview --- */}
                        {extractedFrame && (
                             <div className="text-center p-4 bg-bg-primary/50 rounded-lg space-y-4">
                                <h3 className="text-lg font-semibold text-text-primary">Frame Preview</h3>
                                <img src={extractedFrame} alt="Extracted Frame" className="max-w-full mx-auto rounded-md shadow-lg" />
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <button onClick={handleDownloadFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                        <DownloadIcon className="w-5 h-5"/> Download
                                    </button>
                                    <button onClick={handleSetAsStartFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                        <StartFrameIcon className="w-5 h-5"/> Set as Start
                                    </button>
                                    <button onClick={handleSetAsEndFrame} className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors">
                                        <EndFrameIcon className="w-5 h-5"/> Set as End
                                    </button>
                                    <button
                                        onClick={handleSaveFrameToLibrary}
                                        disabled={savingStatus !== 'idle'}
                                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors ${
                                            savingStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                            savingStatus === 'saving' ? 'bg-bg-tertiary cursor-wait' :
                                            'bg-bg-tertiary hover:bg-accent hover:text-accent-text'
                                        }`}
                                    >
                                        {savingStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : savingStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                        {savingStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* Canvas for frame extraction (hidden) */}
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
    );
};
