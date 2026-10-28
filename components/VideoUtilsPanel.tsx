import React, { useState, useRef, ChangeEvent, useMemo, useEffect, useCallback, useId } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import ReactCrop, { centerCrop, makeAspectCrop, Crop, PixelCrop, PercentCrop } from 'react-image-crop';
import { addToLibrary } from '../store/librarySlice';
import { setFrameSaveStatus, setPaletteSaveStatus, updateVideoUtilsState, updateColorPickerState, updateResizeCropState, setResizeCropSaveStatus } from '../store/videoSlice';
// Fix: Imported the missing ImageIcon to resolve the "Cannot find name" error.
import { FilmIcon, DownloadIcon, SaveIcon, SpinnerIcon, StartFrameIcon, EndFrameIcon, CheckIcon, PaletteIcon, LibraryIcon, CopyIcon, GenerateIcon, VideoIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ResetIcon, CropIcon, ResizeIcon, ImageIcon } from './icons';
import { dataUrlToFile, dataUrlToThumbnail, createPaletteThumbnail, fileToResizedDataUrl, fileToDataUrl, videoToThumbnail } from '../utils/imageUtils';
import { resizeImageFile, cropImageFile } from '../utils/imageProcessing';
import { canSaveVideoClip, extractVideoClip } from '../services/videoClipService';
import { readLibraryMediaFile } from '../services/libraryMediaService';
import type { LibraryItem, VideoUtilsState, PaletteColor, ColorPickerState, ResizeCropState, VideoSliceState } from '../types';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { createAccentStyle } from '../utils/accentTheme';
import { VoiceRecorderPanel } from './VoiceRecorderPanel';
import { VideoClipExtractor } from './VideoClipExtractor';
import { ReferenceMakerPanel } from './ReferenceMakerPanel';
import { VideoMergePanel } from './VideoMergePanel';
import { AudioExtractorPanel } from './AudioExtractorPanel';

const VIDEO_UTILS_ACCENT_STYLES: Record<string, React.CSSProperties> = {
    frames: createAccentStyle('#38bdf8', '#7dd3fc', '#0284c7'),
    clips: createAccentStyle('#38bdf8', '#7dd3fc', '#0284c7'),
    merge: createAccentStyle('#38bdf8', '#7dd3fc', '#0284c7'),
    'audio-extractor': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    'reference-maker': createAccentStyle('#c084fc', '#d8b4fe', '#9333ea'),
    colors: createAccentStyle('#4ade80', '#86efac', '#16a34a'),
    'resize-crop': createAccentStyle('#facc15', '#fde047', '#ca8a04'),
    'voice-recorder': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
};

// --- Color Naming Utilities (Client-Side) ---
const colorNameList = [
    { name: "White", hex: "#FFFFFF" }, { name: "Silver", hex: "#C0C0C0" }, { name: "Gray", hex: "#808080" },
    { name: "Black", hex: "#000000" }, { name: "Red", hex: "#FF0000" }, { name: "Maroon", hex: "#800000" },
    { name: "Yellow", hex: "#FFFF00" }, { name: "Olive", hex: "#808000" }, { name: "Lime", hex: "#00FF00" },
    { name: "Green", hex: "#008000" }, { name: "Aqua", hex: "#00FFFF" }, { name: "Teal", hex: "#008000" },
    { name: "Blue", hex: "#0000FF" }, { name: "Navy", hex: "#000080" }, { name: "Fuchsia", hex: "#FF00FF" },
    { name: "Purple", hex: "#800080" }, { name: "Light Salmon", hex: "#FFA07A" }, { name: "Salmon", hex: "#FA8072" },
    { name: "Dark Salmon", hex: "#E9967A" }, { name: "Light Coral", hex: "#F08080" }, { name: "Indian Red", hex: "#CD5C5C" },
    { name: "Crimson", hex: "#DC143C" }, { name: "Fire Brick", hex: "#B22222" }, { name: "Dark Red", hex: "#8B0000" },
    { name: "Orange", hex: "#FFA500" }, { name: "Dark Orange", hex: "#FF8C00" }, { name: "Coral", hex: "#FF7F50" },
    { name: "Tomato", hex: "#FF6347" }, { name: "Orange Red", hex: "#FF4500" }, { name: "Gold", hex: "#FFD700" },
    { name: "Light Yellow", hex: "#FFFFE0" }, { name: "Lemon Chiffon", hex: "#FFFACD" }, { name: "Papaya Whip", hex: "#FFEFD5" },
    { name: "Moccasin", hex: "#FFE4B5" }, { name: "Peach Puff", hex: "#FFDAB9" }, { name: "Pale Goldenrod", hex: "#EEE8AA" },
    { name: "Khaki", hex: "#F0E68C" }, { name: "Dark Khaki", hex: "#BDB76B" }, { name: "Green Yellow", hex: "#ADFF2F" },
    { name: "Chartreuse", hex: "#7FFF00" }, { name: "Lawn Green", hex: "#7CFC00" }, { name: "Lime Green", hex: "#32CD32" },
    { name: "Pale Green", hex: "#98FB98" }, { name: "Light Green", hex: "#90EE90" }, { name: "Medium Spring Green", hex: "#00FA9A" },
    { name: "Spring Green", hex: "#00FF7F" }, { name: "Sea Green", hex: "#2E8B57" }, { name: "Forest Green", hex: "#228B22" },
    { name: "Dark Green", hex: "#006400" }, { name: "Yellow Green", hex: "#9ACD32" }, { name: "Olive Drab", hex: "#6B8E23" },
    { name: "Dark Olive Green", hex: "#556B2F" }, { name: "Light Sea Green", hex: "#20B2AA" }, { name: "Dark Cyan", hex: "#008B8B" },
    { name: "Light Cyan", hex: "#E0FFFF" }, { name: "Pale Turquoise", hex: "#AFEEEE" }, { name: "Aquamarine", hex: "#7FFFD4" },
    { name: "Turquoise", hex: "#40E0D0" }, { name: "Medium Turquoise", hex: "#48D1CC" }, { name: "Dark Turquoise", hex: "#00CED1" },
    { name: "Cadet Blue", hex: "#5F9EA0" }, { name: "Steel Blue", hex: "#4682B4" }, { name: "Light Steel Blue", hex: "#B0C4DE" },
    { name: "Powder Blue", hex: "#B0E0E6" }, { name: "Light Blue", hex: "#ADD8E6" }, { name: "Sky Blue", hex: "#87CEEB" },
    { name: "Light Sky Blue", hex: "#87CEFA" }, { name: "Deep Sky Blue", hex: "#00BFFF" }, { name: "Dodger Blue", hex: "#1E90FF" },
    { name: "Cornflower Blue", hex: "#6495ED" }, { name: "Royal Blue", hex: "#4169E1" }, { name: "Medium Blue", hex: "#0000CD" },
    { name: "Dark Blue", hex: "#00008B" }, { name: "Midnight Blue", hex: "#191970" }, { name: "Lavender", hex: "#E6E6FA" },
    { name: "Thistle", hex: "#D8BFD8" }, { name: "Plum", hex: "#DDA0DD" }, { name: "Violet", hex: "#EE82EE" },
    { name: "Orchid", hex: "#DA70D6" }, { name: "Medium Orchid", hex: "#BA55D3" }, { name: "Medium Purple", hex: "#9370DB" },
    { name: "Rebecca Purple", hex: "#663399" }, { name: "Blue Violet", hex: "#8A2BE2" }, { name: "Dark Violet", hex: "#9400D3" },
    { name: "Dark Orchid", hex: "#9932CC" }, { name: "Dark Magenta", hex: "#8B008B" }, { name: "Indigo", hex: "#4B0082" },
    { name: "Slate Blue", hex: "#6A5ACD" }, { name: "Dark Slate Blue", hex: "#483D8B" }, { name: "Pink", hex: "#FFC0CB" },
    { name: "Light Pink", hex: "#FFB6C1" }, { name: "Hot Pink", hex: "#FF69B4" }, { name: "Deep Pink", hex: "#FF1493" },
    { name: "Pale Violet Red", hex: "#DB7093" }, { name: "Medium Violet Red", hex: "#C71585" }, { name: "White Smoke", hex: "#F5F5F5" },
    { name: "Gainsboro", hex: "#DCDCDC" }, { name: "Light Gray", hex: "#D3D3D3" }, { name: "Dark Gray", hex: "#A9A9A9" },
    { name: "Dim Gray", hex: "#696969" }, { name: "Light Slate Gray", hex: "#778899" }, { name: "Slate Gray", hex: "#708090" },
    { name: "Dark Slate Gray", hex: "#2F4F4F" }, { name: "Cornsilk", hex: "#FFF8DC" }, { name: "Blanched Almond", hex: "#FFEBCD" },
    { name: "Bisque", hex: "#FFE4C4" }, { name: "Navajo White", hex: "#FFDEAD" }, { name: "Wheat", hex: "#F5DEB3" },
    { name: "Burly Wood", hex: "#DEB887" }, { name: "Tan", hex: "#D2B48C" }, { name: "Rosy Brown", hex: "#BC8F8F" },
    { name: "Sandy Brown", hex: "#F4A460" }, { name: "Goldenrod", hex: "#DAA520" }, { name: "Dark Goldenrod", hex: "#B8860B" },
    { name: "Peru", hex: "#CD853F" }, { name: "Chocolate", hex: "#D2691E" }, { name: "Saddle Brown", hex: "#8B4513" },
    { name: "Sienna", hex: "#A0522D" }, { name: "Brown", hex: "#A52A2A" },
];
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
};
const findClosestColorName = (hexColor: string): string => {
    const rgbColor = hexToRgb(hexColor);
    if (!rgbColor) return hexColor;
    let minDistance = Infinity;
    let closestName = 'Unknown';
    for (const color of colorNameList) {
        const knownRgb = hexToRgb(color.hex);
        if (knownRgb) {
            const distance = Math.sqrt(
                Math.pow(rgbColor.r - knownRgb.r, 2) + Math.pow(rgbColor.g - knownRgb.g, 2) + Math.pow(rgbColor.b - knownRgb.b, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestName = color.name;
            }
        }
    }
    return closestName;
};

// --- General Utilities ---
const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00.000';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(3, '0')}`;
};

const sanitizeForFilename = (text: string, maxLength: number = 40): string => {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/__+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, maxLength);
};

const quantizeImage = (file: File, colorCount: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event?.target?.result || typeof event.target.result !== 'string') {
                return reject(new Error("Failed to read image file."));
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 100;
                const scale = Math.min(MAX_WIDTH / img.width, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return reject('Could not get canvas context');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const colorMap = new Map<string, number>();
                const q = 16; 

                for (let i = 0; i < imageData.length; i += 4) {
                    if (imageData[i + 3] < 128) continue; 
                    
                    const r = Math.round(imageData[i] / q) * q;
                    const g = Math.round(imageData[i + 1] / q) * q;
                    const b = Math.round(imageData[i + 2] / q) * q;

                    const rgbString = `${r},${g},${b}`;
                    colorMap.set(rgbString, (colorMap.get(rgbString) || 0) + 1);
                }

                const sortedColors = Array.from(colorMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, colorCount);

                const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
                const finalHexColors = sortedColors.map(([rgbStr]) => {
                    const [r, g, b] = rgbStr.split(',').map(Number);
                    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
                });
                resolve(finalHexColors);
            };
            img.onerror = reject;
            img.src = event.target.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const VideoUploader: React.FC<{ onVideoUpload: (file: File | null) => void; sourceFile: File | null; disabled?: boolean; }> = ({ onVideoUpload, sourceFile, disabled = false }) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const inputId = useId();
    const fileName = sourceFile?.name || '';

    const handleFileChange = useCallback((file: File | null) => {
        if (disabled) return;
        if (file && file.type.startsWith('video/')) {
            onVideoUpload(file);
        } else {
            onVideoUpload(null);
            if (file) alert("Please upload a valid video file.");
        }
    }, [onVideoUpload, disabled]);

    const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        handleFileChange(e.target.files ? e.target.files[0] : null);
        e.target.value = ''; // Allow re-uploading same file
    };
    const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files ? e.dataTransfer.files[0] : null);
    };

    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary mb-2">Upload Video</label>
            <label
                htmlFor={inputId}
                className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg transition-colors duration-200 ${isDragging ? 'border-accent bg-bg-tertiary' : 'border-border-primary bg-bg-tertiary/50 hover:bg-bg-tertiary cursor-pointer'}`}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-text-secondary">
                    <VideoIcon className="w-8 h-8 mb-3" />
                    <p className="mb-2 text-sm"><span className="font-semibold text-accent">Click to upload</span> or drag and drop</p>
                    <p className="text-xs">MP4, MOV, WEBM</p>
                </div>
                <input id={inputId} type="file" className="hidden" accept="video/*" onChange={onFileChange} disabled={disabled} />
            </label>
            {fileName && <p className="text-xs text-text-muted mt-1 truncate">File: {fileName}</p>}
        </div>
    );
};

interface SubTab {
  id: VideoSliceState['activeVideoUtilsSubTab'];
  label: string;
}

interface SubTabsProps {
  tabs: SubTab[];
  activeTab: VideoSliceState['activeVideoUtilsSubTab'];
  onTabClick: (id: VideoSliceState['activeVideoUtilsSubTab']) => void;
}

const SubTabs: React.FC<SubTabsProps> = ({ tabs, activeTab, onTabClick }) => (
    <div className="flex flex-wrap items-center border-b-2 border-border-primary mb-8 -mt-2">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-semibold transition-colors duration-200 border-b-2 ${
                    activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);


interface VideoUtilsPanelProps {
    setStartFrame: (file: File | null) => Promise<void>;
    setEndFrame: (file: File | null) => Promise<void>;
    onOpenLibrary: () => void;
    onOpenVideoLibrary: () => void;
    activeSubTab: VideoSliceState['activeVideoUtilsSubTab'];
    setActiveSubTab: (tabId: VideoSliceState['activeVideoUtilsSubTab']) => void;
    onReset: () => void;
    onOpenLibraryForResizeCrop: () => void;
}

const RESIZE_CROP_ASPECT_RATIOS = [
    { value: 'free', label: 'Freeform', shortLabel: 'Free' },
    { value: '1:1', label: '1:1 (Square)', shortLabel: '1:1' },
    { value: '16:9', label: '16:9 (Widescreen)', shortLabel: '16:9' },
    { value: '9:16', label: '9:16 (Vertical)', shortLabel: '9:16' },
    { value: '4:3', label: '4:3 (Standard)', shortLabel: '4:3' },
    { value: '3:4', label: '3:4 (Portrait)', shortLabel: '3:4' },
    { value: '21:9', label: '21:9 (Ultrawide)', shortLabel: '21:9' },
    { value: '3:2', label: '3:2 (Classic)', shortLabel: '3:2' },
    { value: '2:3', label: '2:3 (Classic Portrait)', shortLabel: '2:3' },
    { value: '4:5', label: '4:5 (Social Portrait)', shortLabel: '4:5' },
    { value: '5:4', label: '5:4 (Large Format)', shortLabel: '5:4' },
] as const;

const parseCropAspectRatio = (aspectStr: string): number | undefined => {
    if (!aspectStr || aspectStr === 'free') return undefined;
    const [w, h] = aspectStr.split(':').map(Number);
    return w > 0 && h > 0 ? w / h : undefined;
};

const clampEvenVideoDimension = (value: number): number =>
    Math.max(2, Math.min(4096, Math.round(value / 2) * 2));

const ResizeCropTool: React.FC<{
    resizeCrop: ResizeCropState;
    onOpenLibrary: () => void;
    resetVersion: number;
    setStartFrame: (file: File | null) => Promise<void>;
    setEndFrame: (file: File | null) => Promise<void>;
}> = ({ resizeCrop, onOpenLibrary, resetVersion, setStartFrame, setEndFrame }) => {
    const dispatch = useDispatch<AppDispatch>();
    const [mediaMode, setMediaMode] = useState<'image' | 'video'>('image');
    const [crop, setCrop] = useState<Crop>();
    const imgRef = useRef<HTMLImageElement>(null);

    // --- Video Resize & Crop State ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoControllerRef = useRef<AbortController | null>(null);
    const videoSourceVersionRef = useRef(0);
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
    const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoCurrentTime, setVideoCurrentTime] = useState(0);
    const [videoStart, setVideoStart] = useState(0);
    const [videoEnd, setVideoEnd] = useState(0);
    const [videoFps, setVideoFps] = useState(24);
    const [videoCrop, setVideoCrop] = useState<PercentCrop>({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    const [videoAspectRatio, setVideoAspectRatio] = useState<string>('free');
    const [videoResizeMode, setVideoResizeMode] = useState<'scale' | 'dimensions'>('scale');
    const [videoScale, setVideoScale] = useState<number>(100);
    const [videoOutputWidth, setVideoOutputWidth] = useState<number>(1280);
    const [videoOutputHeight, setVideoOutputHeight] = useState<number>(720);
    const [videoLockRatio, setVideoLockRatio] = useState<boolean>(true);
    const [videoIsLoading, setVideoIsLoading] = useState<boolean>(false);
    const [videoProgress, setVideoProgress] = useState<number>(0);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [videoResult, setVideoResult] = useState<{ file: File; name: string; duration: number } | null>(null);
    const [videoResultUrl, setVideoResultUrl] = useState<string | null>(null);
    const [videoSaveStatus, setVideoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [capturedFrame, setCapturedFrame] = useState<{ dataUrl: string; time: number; width: number; height: number } | null>(null);
    const [capturedFrameSaveStatus, setCapturedFrameSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [isVideoLibraryPickerOpen, setIsVideoLibraryPickerOpen] = useState<boolean>(false);

    useEffect(() => {
        return () => {
            videoControllerRef.current?.abort();
        };
    }, []);

    useEffect(() => {
        if (resetVersion === 0) return;
        videoSourceVersionRef.current++;
        videoControllerRef.current?.abort();
        videoControllerRef.current = null;
        setVideoFile(null);
        setVideoDimensions({ width: 0, height: 0 });
        setVideoDuration(0);
        setVideoCurrentTime(0);
        setVideoStart(0);
        setVideoEnd(0);
        setVideoFps(24);
        setVideoCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
        setVideoAspectRatio('free');
        setVideoResizeMode('scale');
        setVideoScale(100);
        setVideoOutputWidth(1280);
        setVideoOutputHeight(720);
        setVideoLockRatio(true);
        setVideoIsLoading(false);
        setVideoProgress(0);
        setVideoError(null);
        setVideoResult(null);
        setVideoSaveStatus('idle');
        setCapturedFrame(null);
        setCapturedFrameSaveStatus('idle');
        setIsVideoLibraryPickerOpen(false);
    }, [resetVersion]);

    const handleImageUpload = (file: File | null) => {
        dispatch(updateResizeCropState({
            sourceFile: file,
            previewUrl: null, // this is important to trigger the effect
            resultUrl: null,
            saveStatus: 'idle',
            crop: null,
            scale: 100,
        }));
    };

    // Fix: Corrected the useEffect hook to properly manage the object URL lifecycle.
    // The previous implementation revoked the URL immediately after it was created,
    // preventing the image from loading. This new logic ensures the URL is valid
    // as long as the source image is present.
    useEffect(() => {
        // This effect manages the lifecycle of the preview object URL.
        if (!resizeCrop.sourceFile) {
            // If the source file is cleared, ensure the previewUrl is also cleared.
            // The cleanup function from the previous render will handle revoking any existing URL.
            if (resizeCrop.previewUrl) {
                dispatch(updateResizeCropState({ previewUrl: null }));
            }
            return;
        }

        const objectUrl = URL.createObjectURL(resizeCrop.sourceFile);
        dispatch(updateResizeCropState({ previewUrl: objectUrl }));

        // The cleanup function for this effect will be called when the sourceFile changes again, or on unmount.
        return () => {
            URL.revokeObjectURL(objectUrl);
        };
        // The effect should only re-run when the source file itself changes.
    }, [resizeCrop.sourceFile, dispatch]);

    useEffect(() => {
        videoSourceVersionRef.current++;
        const url = videoFile ? URL.createObjectURL(videoFile) : null;
        setVideoPreviewUrl(url);
        setVideoDimensions({ width: 0, height: 0 });
        setVideoDuration(0);
        setVideoCurrentTime(0);
        setVideoStart(0);
        setVideoEnd(0);
        setVideoCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
        setVideoScale(100);
        setVideoResult(null);
        setVideoSaveStatus('idle');
        setCapturedFrame(null);
        setCapturedFrameSaveStatus('idle');
        setVideoIsLoading(false);
        setVideoProgress(0);
        setVideoError(null);
        return () => {
            videoSourceVersionRef.current++;
            videoControllerRef.current?.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [videoFile]);

    useEffect(() => {
        const url = videoResult ? URL.createObjectURL(videoResult.file) : null;
        setVideoResultUrl(url);
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [videoResult]);

    const handleCropComplete = useCallback((_: PixelCrop | undefined, percentCrop: PercentCrop) => {
        if (percentCrop.width > 0 && percentCrop.height > 0) {
            dispatch(updateResizeCropState({
                crop: {
                    x: percentCrop.x / 100,
                    y: percentCrop.y / 100,
                    width: percentCrop.width / 100,
                    height: percentCrop.height / 100,
                }
            }));
        }
    }, [dispatch]);

    const applyImageAspectRatio = useCallback((aspectStr: string, imgWidth: number, imgHeight: number) => {
        const aspect = parseCropAspectRatio(aspectStr);
        const newCrop: PercentCrop = aspect
            ? centerCrop(
                makeAspectCrop({ unit: '%', width: 90 }, aspect, imgWidth, imgHeight),
                imgWidth,
                imgHeight
            )
            : { unit: '%', x: 5, y: 5, width: 90, height: 90 };
        setCrop(newCrop);
        handleCropComplete(undefined, newCrop);
    }, [handleCropComplete]);

    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        applyImageAspectRatio(resizeCrop.aspectRatio, width, height);
    };

    const handleImageAspectRatioChange = (nextAspectRatio: string) => {
        dispatch(updateResizeCropState({ aspectRatio: nextAspectRatio }));
        if (imgRef.current && imgRef.current.width > 0 && imgRef.current.height > 0) {
            applyImageAspectRatio(nextAspectRatio, imgRef.current.width, imgRef.current.height);
        }
    };

    const syncVideoDimensionsFromCropAndScale = useCallback((
        nextCrop: PercentCrop,
        nextScale: number,
        dims: { width: number; height: number },
        mode: 'scale' | 'dimensions',
        lockRatio: boolean,
        currentCustomWidth: number,
    ) => {
        if (!dims.width || !dims.height || nextCrop.width <= 0 || nextCrop.height <= 0) return;
        const croppedW = dims.width * (nextCrop.width / 100);
        const croppedH = dims.height * (nextCrop.height / 100);
        if (mode === 'scale') {
            setVideoOutputWidth(clampEvenVideoDimension(croppedW * (nextScale / 100)));
            setVideoOutputHeight(clampEvenVideoDimension(croppedH * (nextScale / 100)));
        } else if (lockRatio && croppedW > 0 && croppedH > 0) {
            setVideoOutputHeight(clampEvenVideoDimension(currentCustomWidth * (croppedH / croppedW)));
        }
    }, []);

    const computeVideoCropForAspect = useCallback((aspectStr: string, dims: { width: number; height: number }): PercentCrop => {
        const aspect = parseCropAspectRatio(aspectStr);
        if (!aspect || !dims.width || !dims.height) {
            return { unit: '%', x: 0, y: 0, width: 100, height: 100 };
        }
        return centerCrop(
            makeAspectCrop({ unit: '%', width: 100 }, aspect, dims.width, dims.height),
            dims.width,
            dims.height
        );
    }, []);

    const handleVideoLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const dur = video.duration;
        if (!w || !h) {
            setVideoError('Could not read video dimensions.');
            return;
        }
        if (!Number.isFinite(dur) || dur <= 0) {
            setVideoError('This video does not have a valid finite duration.');
            return;
        }
        const dims = { width: w, height: h };
        setVideoDimensions(dims);
        setVideoDuration(dur);
        setVideoStart(0);
        setVideoEnd(dur);
        const nextCrop = computeVideoCropForAspect(videoAspectRatio, dims);
        setVideoCrop(nextCrop);
        const croppedW = w * (nextCrop.width / 100);
        const croppedH = h * (nextCrop.height / 100);
        setVideoOutputWidth(clampEvenVideoDimension(croppedW * (videoScale / 100)));
        setVideoOutputHeight(clampEvenVideoDimension(croppedH * (videoScale / 100)));
    };

    const seekVideo = (time: number) => {
        if (!videoRef.current || !videoDuration) return;
        videoRef.current.pause();
        const clamped = Math.max(0, Math.min(videoDuration, time));
        videoRef.current.currentTime = clamped;
        setVideoCurrentTime(clamped);
    };

    const validVideoRange = Number.isFinite(videoStart)
        && Number.isFinite(videoEnd)
        && videoDuration > 0
        && videoStart >= 0
        && videoEnd > videoStart
        && videoEnd <= videoDuration;

    const handleCaptureSelectedFrame = (targetTime?: number) => {
        const video = videoRef.current;
        if (!video || !videoDimensions.width || !videoDimensions.height) return;
        const captureNow = () => {
            const outW = videoResizeMode === 'scale'
                ? clampEvenVideoDimension(videoDimensions.width * (videoCrop.width / 100) * (videoScale / 100))
                : videoOutputWidth;
            const outH = videoResizeMode === 'scale'
                ? clampEvenVideoDimension(videoDimensions.height * (videoCrop.height / 100) * (videoScale / 100))
                : videoOutputHeight;
            if (!outW || !outH) return;
            const sx = videoDimensions.width * (videoCrop.x / 100);
            const sy = videoDimensions.height * (videoCrop.y / 100);
            const sWidth = videoDimensions.width * (videoCrop.width / 100);
            const sHeight = videoDimensions.height * (videoCrop.height / 100);
            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setVideoError('Could not initialize canvas to capture frame.');
                return;
            }
            ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            setCapturedFrame({
                dataUrl,
                time: video.currentTime,
                width: outW,
                height: outH,
            });
            setCapturedFrameSaveStatus('idle');
            setVideoError(null);
        };

        video.pause();
        if (targetTime !== undefined && Math.abs(video.currentTime - targetTime) > 0.001) {
            const clamped = Math.max(0, Math.min(videoDuration, targetTime));
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                setVideoCurrentTime(video.currentTime);
                captureNow();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = clamped;
        } else {
            captureNow();
        }
    };

    const handleDownloadCapturedFrame = () => {
        if (!capturedFrame) return;
        const link = document.createElement('a');
        link.href = capturedFrame.dataUrl;
        const videoName = sanitizeForFilename(videoFile?.name.replace(/\.[^/.]+$/, '') || 'video_frame');
        const timeStr = formatTime(capturedFrame.time).replace(/:|\./g, '_');
        link.download = `${videoName}_${timeStr}_${capturedFrame.width}x${capturedFrame.height}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSetCapturedAsStartFrame = async () => {
        if (!capturedFrame) return;
        const file = await dataUrlToFile(capturedFrame.dataUrl, 'start_frame.jpeg');
        await setStartFrame(file);
        alert('Frame sent to LTX Director.');
    };

    const handleSetCapturedAsEndFrame = async () => {
        if (!capturedFrame) return;
        const file = await dataUrlToFile(capturedFrame.dataUrl, 'end_frame.jpeg');
        await setEndFrame(file);
        alert('Frame sent to LTX Director.');
    };

    const handleSaveCapturedFrameToLibrary = async () => {
        if (!capturedFrame || capturedFrameSaveStatus !== 'idle') return;
        setCapturedFrameSaveStatus('saving');
        try {
            const videoName = videoFile?.name || 'video';
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'extracted-frame',
                media: capturedFrame.dataUrl,
                thumbnail: await dataUrlToThumbnail(capturedFrame.dataUrl, 256),
                name: `Frame (${capturedFrame.width}x${capturedFrame.height}) from ${videoName} at ${formatTime(capturedFrame.time)}`,
            };
            await dispatch(addToLibrary(item)).unwrap();
            setCapturedFrameSaveStatus('saved');
        } catch (err) {
            console.error('Failed to save captured frame to library:', err);
            setCapturedFrameSaveStatus('idle');
        }
    };

    const handleVideoCropChange = (nextCrop: PercentCrop) => {
        if (nextCrop.width <= 0 || nextCrop.height <= 0) return;
        setVideoCrop(nextCrop);
        syncVideoDimensionsFromCropAndScale(nextCrop, videoScale, videoDimensions, videoResizeMode, videoLockRatio, videoOutputWidth);
    };

    const handleVideoAspectRatioChange = (nextRatio: string) => {
        setVideoAspectRatio(nextRatio);
        if (videoDimensions.width > 0 && videoDimensions.height > 0) {
            const nextCrop = computeVideoCropForAspect(nextRatio, videoDimensions);
            setVideoCrop(nextCrop);
            syncVideoDimensionsFromCropAndScale(nextCrop, videoScale, videoDimensions, videoResizeMode, videoLockRatio, videoOutputWidth);
        }
    };

    const handleVideoScaleChange = (nextScale: number) => {
        setVideoScale(nextScale);
        setVideoResizeMode('scale');
        syncVideoDimensionsFromCropAndScale(videoCrop, nextScale, videoDimensions, 'scale', videoLockRatio, videoOutputWidth);
    };

    const videoCropAspect = useMemo(() => {
        if (!videoDimensions.width || !videoDimensions.height || !videoCrop.width || !videoCrop.height) return 16 / 9;
        return (videoDimensions.width * videoCrop.width) / (videoDimensions.height * videoCrop.height);
    }, [videoDimensions, videoCrop]);

    const handleApplyChanges = async () => {
        if (!resizeCrop.sourceFile) return;
        dispatch(updateResizeCropState({ isLoading: true, error: null, resultUrl: null }));
        try {
            let processedFile = resizeCrop.sourceFile;
            if (resizeCrop.scale !== 100) {
                processedFile = await resizeImageFile(processedFile, resizeCrop.scale / 100);
            }
            if (resizeCrop.crop && resizeCrop.crop.width > 0 && resizeCrop.crop.height > 0) {
                processedFile = await cropImageFile(processedFile, resizeCrop.crop);
            }
            const resultDataUrl = await fileToDataUrl(processedFile);
            dispatch(updateResizeCropState({ resultUrl: resultDataUrl }));
        } catch (err: any) {
            dispatch(updateResizeCropState({ error: err.message || 'An error occurred.' }));
        } finally {
            dispatch(updateResizeCropState({ isLoading: false }));
        }
    };

    const handleApplyVideoChanges = async () => {
        if (!videoFile || videoIsLoading) return;
        if (!videoDimensions.width || !videoDimensions.height || videoDuration <= 0) {
            setVideoError('Wait for the video preview metadata to finish loading.');
            return;
        }
        if (!validVideoRange) {
            setVideoError('Select a valid start and end time within the video duration.');
            return;
        }
        const outW = videoResizeMode === 'scale'
            ? clampEvenVideoDimension(videoDimensions.width * (videoCrop.width / 100) * (videoScale / 100))
            : videoOutputWidth;
        const outH = videoResizeMode === 'scale'
            ? clampEvenVideoDimension(videoDimensions.height * (videoCrop.height / 100) * (videoScale / 100))
            : videoOutputHeight;

        if (![outW, outH].every(value => Number.isInteger(value) && value >= 2 && value <= 4096 && value % 2 === 0)) {
            setVideoError('Use even output dimensions between 2 and 4096 pixels.');
            return;
        }

        const controller = new AbortController();
        videoControllerRef.current = controller;
        const version = videoSourceVersionRef.current;
        videoRef.current?.pause();
        setVideoIsLoading(true);
        setVideoProgress(0);
        setVideoError(null);
        setVideoResult(null);
        setVideoSaveStatus('idle');

        try {
            const { file: processedVideo, duration: outDuration } = await extractVideoClip(
                videoFile,
                {
                    start: videoStart,
                    end: videoEnd,
                    duration: videoDuration,
                    reduceResolution: false,
                    spatialEdit: {
                        x: videoCrop.x,
                        y: videoCrop.y,
                        width: videoCrop.width,
                        height: videoCrop.height,
                        outputWidth: outW,
                        outputHeight: outH,
                    },
                },
                controller.signal,
                setVideoProgress
            );
            if (version !== videoSourceVersionRef.current) return;
            const base = videoFile.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
            const isTrimmed = videoStart > 0.001 || Math.abs(videoEnd - videoDuration) > 0.001;
            const rangeSuffix = isTrimmed ? `_${videoStart.toFixed(2)}-${videoEnd.toFixed(2)}` : '';
            const outName = `edited_${base}${rangeSuffix}_${outW}x${outH}.mp4`;
            setVideoResult({
                file: new File([processedVideo], outName, { type: 'video/mp4' }),
                name: outName,
                duration: outDuration,
            });
        } catch (cause) {
            if (version !== videoSourceVersionRef.current) return;
            if (controller.signal.aborted) {
                setVideoError('Video processing cancelled.');
            } else {
                console.error('Failed to resize/crop video:', cause);
                setVideoError(cause instanceof Error ? cause.message : String(cause));
            }
        } finally {
            if (version === videoSourceVersionRef.current) {
                setVideoIsLoading(false);
                videoControllerRef.current = null;
            }
        }
    };
    
    const handleSaveResultToLibrary = async () => {
        if (!resizeCrop.resultUrl || !resizeCrop.sourceFile) return;
        dispatch(setResizeCropSaveStatus('saving'));
        try {
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'image', name: `Edited - ${resizeCrop.sourceFile.name}`,
                media: resizeCrop.resultUrl, thumbnail: await dataUrlToThumbnail(resizeCrop.resultUrl, 256),
                sourceImage: await fileToResizedDataUrl(resizeCrop.sourceFile, 512),
            };
            await dispatch(addToLibrary(item)).unwrap();
            dispatch(setResizeCropSaveStatus('saved'));
        } catch (err) {
            console.error('Failed to save result:', err);
            dispatch(setResizeCropSaveStatus('idle'));
        }
    };

    const handleSaveVideoResultToLibrary = async () => {
        if (!videoResult || !canSaveVideoClip(videoResult.duration) || videoSaveStatus !== 'idle') return;
        const version = videoSourceVersionRef.current;
        setVideoSaveStatus('saving');
        setVideoError(null);
        try {
            const [media, thumbnail] = await Promise.all([
                fileToDataUrl(videoResult.file),
                videoToThumbnail(videoResult.file, 256),
            ]);
            await dispatch(addToLibrary({
                mediaType: 'video',
                name: `Edited - ${videoFile?.name || videoResult.name}`,
                media,
                thumbnail,
            })).unwrap();
            if (version === videoSourceVersionRef.current) setVideoSaveStatus('saved');
        } catch (cause) {
            console.error('Failed to save edited video:', cause);
            if (version === videoSourceVersionRef.current) {
                setVideoError(`Could not save to Library: ${cause instanceof Error ? cause.message : String(cause)}`);
                setVideoSaveStatus('idle');
            }
        }
    };

    const handleDownloadResult = () => {
        if (!resizeCrop.resultUrl || !resizeCrop.sourceFile) return;
        const link = document.createElement('a');
        link.href = resizeCrop.resultUrl;
        link.download = `edited_${resizeCrop.sourceFile.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSelectVideoFromLibrary = async (item: LibraryItem) => {
        setIsVideoLibraryPickerOpen(false);
        setVideoError(null);
        try {
            const file = await readLibraryMediaFile(item, ['video']);
            setVideoFile(file);
        } catch (cause) {
            setVideoError(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const effectiveVideoOutputWidth = videoResizeMode === 'scale' && videoDimensions.width
        ? clampEvenVideoDimension(videoDimensions.width * (videoCrop.width / 100) * (videoScale / 100))
        : videoOutputWidth;
    const effectiveVideoOutputHeight = videoResizeMode === 'scale' && videoDimensions.height
        ? clampEvenVideoDimension(videoDimensions.height * (videoCrop.height / 100) * (videoScale / 100))
        : videoOutputHeight;
    const videoControlsDisabled = videoIsLoading || videoSaveStatus === 'saving';

    return (
        <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <CropIcon className="w-8 h-8 text-accent" />
                    <h2 className="text-2xl font-bold text-accent">Resize & Crop</h2>
                </div>
                <div role="tablist" aria-label="Resize & Crop media type" className="inline-flex rounded-lg bg-bg-tertiary p-1 border border-border-primary">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mediaMode === 'image'}
                        onClick={() => setMediaMode('image')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                            mediaMode === 'image'
                                ? 'bg-accent text-accent-text shadow-sm'
                                : 'text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        <ImageIcon className="w-4 h-4" />
                        Image
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={mediaMode === 'video'}
                        onClick={() => setMediaMode('video')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                            mediaMode === 'video'
                                ? 'bg-accent text-accent-text shadow-sm'
                                : 'text-text-secondary hover:text-text-primary'
                        }`}
                    >
                        <VideoIcon className="w-4 h-4" />
                        Video
                    </button>
                </div>
            </div>
            <p className="text-sm text-text-secondary mb-6">
                {mediaMode === 'image'
                    ? 'Quickly resize or crop your images using standard aspect ratios (16:9, 4:3, 1:1, etc.) or freeform selection.'
                    : 'Resize or crop your videos using standard aspect ratios (16:9, 4:3, 9:16, etc.) or freeform selection. Exports MP4 with original audio locally.'}
            </p>

            {mediaMode === 'image' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <ImageUploader label="Upload Image" id="resize-crop-source" onImageUpload={handleImageUpload} sourceFile={resizeCrop.sourceFile} />
                            <button onClick={onOpenLibrary} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select image from Library">
                                <LibraryIcon className="w-6 h-6" />
                            </button>
                        </div>
                        {resizeCrop.sourceFile && (
                            <div className="space-y-4 pt-4 border-t border-border-primary">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary">Resize: {resizeCrop.scale}%</label>
                                    <input type="range" min="10" max="200" step="1" value={resizeCrop.scale} onChange={(e) => dispatch(updateResizeCropState({ scale: Number(e.target.value) }))} disabled={resizeCrop.isLoading} className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-text-secondary">Crop Aspect Ratio</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {RESIZE_CROP_ASPECT_RATIOS.map(ratio => (
                                            <button
                                                key={ratio.value}
                                                type="button"
                                                disabled={resizeCrop.isLoading}
                                                onClick={() => handleImageAspectRatioChange(ratio.value)}
                                                aria-pressed={resizeCrop.aspectRatio === ratio.value}
                                                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                                    resizeCrop.aspectRatio === ratio.value
                                                        ? 'border-accent bg-accent/15 text-accent'
                                                        : 'border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                {ratio.shortLabel}
                                            </button>
                                        ))}
                                    </div>
                                    <select value={resizeCrop.aspectRatio} onChange={e => handleImageAspectRatioChange(e.target.value)} disabled={resizeCrop.isLoading} className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                        {RESIZE_CROP_ASPECT_RATIOS.map(ratio => (
                                            <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <button onClick={handleApplyChanges} disabled={resizeCrop.isLoading} style={!resizeCrop.isLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                                    {resizeCrop.isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                    {resizeCrop.isLoading ? 'Processing...' : 'Apply Changes'}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-4">
                        <div className="bg-bg-primary p-2 rounded-lg min-h-[400px] flex items-center justify-center">
                            {resizeCrop.previewUrl ? (
                                <ReactCrop
                                    crop={crop}
                                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                                    onComplete={handleCropComplete}
                                    aspect={parseCropAspectRatio(resizeCrop.aspectRatio)}
                                    className="max-w-full"
                                >
                                    <img ref={imgRef} src={resizeCrop.previewUrl} alt="Image to crop" onLoad={onImageLoad} style={{ maxHeight: '60vh' }}/>
                                </ReactCrop>
                            ) : (
                                <div className="text-center text-text-secondary"><ImageIcon className="w-16 h-16 mx-auto mb-4 text-border-primary" /><p>Upload an image to begin editing.</p></div>
                            )}
                        </div>
                        {resizeCrop.resultUrl && (
                            <div className="pt-4 border-t border-border-primary">
                                <h3 className="text-lg font-semibold text-text-primary mb-2">Result</h3>
                                <img src={resizeCrop.resultUrl} alt="Processed result" className="w-full rounded-lg shadow-md" />
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <button onClick={handleDownloadResult} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"><DownloadIcon className="w-5 h-5" /> Download</button>
                                    <button onClick={handleSaveResultToLibrary} disabled={resizeCrop.saveStatus !== 'idle'} className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors ${resizeCrop.saveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'}`}>
                                        {resizeCrop.saveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : resizeCrop.saveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                        {resizeCrop.saveStatus === 'saving' ? 'Saving...' : resizeCrop.saveStatus === 'saved' ? 'Saved' : 'Save to Library'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {resizeCrop.error && <p className="text-danger text-center bg-danger-bg p-3 rounded-md mt-4">{resizeCrop.error}</p>}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-grow">
                                <VideoUploader onVideoUpload={setVideoFile} sourceFile={videoFile} disabled={videoControlsDisabled} />
                            </div>
                            <button
                                type="button"
                                disabled={videoControlsDisabled}
                                onClick={() => setIsVideoLibraryPickerOpen(true)}
                                className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Select video from Library"
                            >
                                <LibraryIcon className="w-6 h-6" />
                            </button>
                        </div>

                        {videoFile && (
                            <div className="space-y-4 pt-4 border-t border-border-primary">
                                {videoDimensions.width > 0 && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary bg-bg-tertiary/60 p-2.5 rounded-lg">
                                        <span>Source: <strong className="text-text-primary">{videoDimensions.width} × {videoDimensions.height} px</strong></span>
                                        <span>Output: <strong className="text-accent">{effectiveVideoOutputWidth} × {effectiveVideoOutputHeight} px</strong></span>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-text-secondary">Crop Aspect Ratio</label>
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDimensions.width}
                                            onClick={() => handleVideoAspectRatioChange('free')}
                                            className="text-xs text-text-secondary hover:text-accent disabled:opacity-50"
                                        >
                                            Reset full frame
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {RESIZE_CROP_ASPECT_RATIOS.map(ratio => (
                                            <button
                                                key={ratio.value}
                                                type="button"
                                                disabled={videoControlsDisabled || !videoDimensions.width}
                                                onClick={() => handleVideoAspectRatioChange(ratio.value)}
                                                aria-pressed={videoAspectRatio === ratio.value}
                                                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${
                                                    videoAspectRatio === ratio.value
                                                        ? 'border-accent bg-accent/15 text-accent'
                                                        : 'border-border-primary bg-bg-tertiary text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                {ratio.shortLabel}
                                            </button>
                                        ))}
                                    </div>
                                    <select
                                        aria-label="Video crop aspect ratio"
                                        value={videoAspectRatio}
                                        onChange={e => handleVideoAspectRatioChange(e.target.value)}
                                        disabled={videoControlsDisabled || !videoDimensions.width}
                                        className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm disabled:opacity-50"
                                    >
                                        {RESIZE_CROP_ASPECT_RATIOS.map(ratio => (
                                            <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-3 pt-2 border-t border-border-primary">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-text-secondary">Resize Mode</span>
                                        <div className="inline-flex rounded-md bg-bg-tertiary p-0.5 border border-border-primary text-xs">
                                            <button
                                                type="button"
                                                disabled={videoControlsDisabled}
                                                onClick={() => {
                                                    setVideoResizeMode('scale');
                                                    syncVideoDimensionsFromCropAndScale(videoCrop, videoScale, videoDimensions, 'scale', videoLockRatio, videoOutputWidth);
                                                }}
                                                className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                                                    videoResizeMode === 'scale' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                Scale (%)
                                            </button>
                                            <button
                                                type="button"
                                                disabled={videoControlsDisabled}
                                                onClick={() => {
                                                    setVideoResizeMode('dimensions');
                                                    if (videoDimensions.width > 0) {
                                                        setVideoOutputWidth(effectiveVideoOutputWidth);
                                                        setVideoOutputHeight(effectiveVideoOutputHeight);
                                                    }
                                                }}
                                                className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                                                    videoResizeMode === 'dimensions' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'
                                                }`}
                                            >
                                                Custom (px)
                                            </button>
                                        </div>
                                    </div>

                                    {videoResizeMode === 'scale' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary">
                                                Resize: {videoScale}% ({effectiveVideoOutputWidth} × {effectiveVideoOutputHeight} px)
                                            </label>
                                            <input
                                                type="range"
                                                min="10"
                                                max="200"
                                                step="1"
                                                value={videoScale}
                                                onChange={(e) => handleVideoScaleChange(Number(e.target.value))}
                                                disabled={videoControlsDisabled || !videoDimensions.width}
                                                className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="text-xs text-text-secondary">
                                                    Width (px)
                                                    <input
                                                        aria-label="Video output width"
                                                        type="number"
                                                        min={2}
                                                        max={4096}
                                                        step={2}
                                                        value={videoOutputWidth}
                                                        disabled={videoControlsDisabled || !videoDimensions.width}
                                                        onChange={e => {
                                                            const val = Number(e.target.value);
                                                            setVideoOutputWidth(val);
                                                            if (videoLockRatio && val > 0) {
                                                                setVideoOutputHeight(clampEvenVideoDimension(val / videoCropAspect));
                                                            }
                                                        }}
                                                        className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm text-text-primary"
                                                    />
                                                </label>
                                                <label className="text-xs text-text-secondary">
                                                    Height (px)
                                                    <input
                                                        aria-label="Video output height"
                                                        type="number"
                                                        min={2}
                                                        max={4096}
                                                        step={2}
                                                        value={videoOutputHeight}
                                                        disabled={videoControlsDisabled || !videoDimensions.width}
                                                        onChange={e => {
                                                            const val = Number(e.target.value);
                                                            setVideoOutputHeight(val);
                                                            if (videoLockRatio && val > 0) {
                                                                setVideoOutputWidth(clampEvenVideoDimension(val * videoCropAspect));
                                                            }
                                                        }}
                                                        className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm text-text-primary"
                                                    />
                                                </label>
                                            </div>
                                            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={videoLockRatio}
                                                    disabled={videoControlsDisabled || !videoDimensions.width}
                                                    onChange={e => {
                                                        setVideoLockRatio(e.target.checked);
                                                        if (e.target.checked && videoOutputWidth > 0) {
                                                            setVideoOutputHeight(clampEvenVideoDimension(videoOutputWidth / videoCropAspect));
                                                        }
                                                    }}
                                                />
                                                Preserve cropped aspect ratio (uncheck to stretch)
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 pt-2 border-t border-border-primary">
                                    <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                                        <span className="font-mono">
                                            {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                                        </span>
                                        <label className="flex items-center gap-1.5">
                                            <span>FPS:</span>
                                            <input
                                                aria-label="Video frame rate"
                                                type="number"
                                                min={1}
                                                max={240}
                                                step="any"
                                                value={videoFps}
                                                disabled={videoControlsDisabled}
                                                onChange={e => {
                                                    const val = Number(e.target.value);
                                                    if (val >= 1 && val <= 240) setVideoFps(val);
                                                }}
                                                className="w-16 bg-bg-tertiary p-1 rounded border border-border-primary text-center text-text-primary"
                                            />
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDuration}
                                            onClick={() => seekVideo(videoCurrentTime - 1)}
                                            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary disabled:opacity-50"
                                            title="Seek 1 Second Backward"
                                        >
                                            <ChevronDoubleLeftIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDuration}
                                            onClick={() => seekVideo(videoCurrentTime - 1 / (videoFps || 24))}
                                            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary disabled:opacity-50"
                                            title="Previous Frame"
                                        >
                                            <ChevronLeftIcon className="w-5 h-5" />
                                        </button>
                                        <input
                                            aria-label="Video timeline position"
                                            type="range"
                                            min={0}
                                            max={videoDuration || 0}
                                            step={0.001}
                                            value={videoCurrentTime}
                                            disabled={videoControlsDisabled || !videoDuration}
                                            onChange={e => seekVideo(Number(e.target.value))}
                                            className="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                        />
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDuration}
                                            onClick={() => seekVideo(videoCurrentTime + 1 / (videoFps || 24))}
                                            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary disabled:opacity-50"
                                            title="Next Frame"
                                        >
                                            <ChevronRightIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDuration}
                                            onClick={() => seekVideo(videoCurrentTime + 1)}
                                            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-text-secondary disabled:opacity-50"
                                            title="Seek 1 Second Forward"
                                        >
                                            <ChevronDoubleRightIcon className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs text-text-secondary">
                                                Start Frame (seconds)
                                                <input
                                                    aria-label="Start frame (seconds)"
                                                    type="number"
                                                    min={0}
                                                    max={videoDuration}
                                                    step={0.001}
                                                    value={Number.isFinite(videoStart) ? videoStart : ''}
                                                    disabled={videoControlsDisabled || !videoDuration}
                                                    onChange={e => setVideoStart(e.target.value === '' ? NaN : Number(e.target.value))}
                                                    className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm text-text-primary"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                disabled={videoControlsDisabled || !videoDuration}
                                                onClick={() => setVideoStart(videoRef.current?.currentTime ?? videoCurrentTime)}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-xs font-semibold text-text-secondary disabled:opacity-50"
                                            >
                                                <StartFrameIcon className="w-4 h-4" />
                                                Set start here
                                            </button>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="block text-xs text-text-secondary">
                                                End Frame (seconds)
                                                <input
                                                    aria-label="End frame (seconds)"
                                                    type="number"
                                                    min={0}
                                                    max={videoDuration}
                                                    step={0.001}
                                                    value={Number.isFinite(videoEnd) ? videoEnd : ''}
                                                    disabled={videoControlsDisabled || !videoDuration}
                                                    onChange={e => setVideoEnd(e.target.value === '' ? NaN : Number(e.target.value))}
                                                    className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm text-text-primary"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                disabled={videoControlsDisabled || !videoDuration}
                                                onClick={() => setVideoEnd(videoRef.current?.currentTime ?? videoCurrentTime)}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-xs font-semibold text-text-secondary disabled:opacity-50"
                                            >
                                                <EndFrameIcon className="w-4 h-4" />
                                                Set end here
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-text-secondary">
                                        {validVideoRange
                                            ? `Selected clip duration: ${formatTime(videoEnd - videoStart)}`
                                            : 'End must be after start and within the video duration.'}
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDimensions.width}
                                            onClick={() => handleCaptureSelectedFrame()}
                                            className="w-full flex items-center justify-center gap-2 font-semibold py-2.5 px-3 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-sm text-text-primary border border-border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <FilmIcon className="w-4 h-4 text-accent" />
                                            Save This Frame (Crop & Resize)
                                        </button>
                                        <button
                                            type="button"
                                            disabled={videoControlsDisabled || !videoDimensions.width}
                                            onClick={() => handleCaptureSelectedFrame(videoDuration)}
                                            className="w-full flex items-center justify-center gap-2 font-semibold py-2.5 px-3 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary-hover text-sm text-text-secondary border border-border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <EndFrameIcon className="w-4 h-4" />
                                            Save Last Frame (Crop & Resize)
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleApplyVideoChanges}
                                    disabled={videoControlsDisabled || !videoDimensions.width || !validVideoRange}
                                    style={!videoControlsDisabled && videoDimensions.width && validVideoRange ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                                    className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                                >
                                    {videoIsLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                    {videoIsLoading ? `Processing Video... ${Math.floor(videoProgress)}%` : 'Apply Video Changes (MP4)'}
                                </button>
                                {videoIsLoading && (
                                    <button
                                        type="button"
                                        onClick={() => videoControllerRef.current?.abort()}
                                        className="w-full flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover"
                                    >
                                        Cancel Processing
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="bg-bg-primary p-2 rounded-lg min-h-[400px] flex flex-col items-center justify-center">
                            {videoPreviewUrl ? (
                                <>
                                    <ReactCrop
                                        crop={videoCrop}
                                        onChange={(_, percentCrop) => handleVideoCropChange(percentCrop)}
                                        aspect={parseCropAspectRatio(videoAspectRatio)}
                                        keepSelection
                                        disabled={videoControlsDisabled || !videoDimensions.width}
                                        minWidth={2}
                                        minHeight={2}
                                        className="max-w-full"
                                    >
                                        <video
                                            ref={videoRef}
                                            src={videoPreviewUrl}
                                            controls
                                            preload="metadata"
                                            onLoadedMetadata={handleVideoLoadedMetadata}
                                            onTimeUpdate={e => setVideoCurrentTime(e.currentTarget.currentTime)}
                                            onError={() => setVideoError('Could not decode this video. Choose a supported MP4, MOV or WEBM file.')}
                                            style={{ maxHeight: '60vh' }}
                                            className="block max-w-full rounded"
                                        />
                                    </ReactCrop>
                                    <p className="text-xs text-text-muted mt-2 text-center">
                                        Drag the handles to crop or drag inside the selection to reposition the video frame.
                                    </p>
                                </>
                            ) : (
                                <div className="text-center text-text-secondary">
                                    <VideoIcon className="w-16 h-16 mx-auto mb-4 text-border-primary" />
                                    <p>Upload a video to begin resizing & cropping.</p>
                                </div>
                            )}
                        </div>

                        {capturedFrame && (
                            <div className="pt-4 border-t border-border-primary space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-text-primary">Selected Frame Result</h3>
                                    <span className="text-xs text-text-secondary font-mono">
                                        {capturedFrame.width} × {capturedFrame.height} px @ {formatTime(capturedFrame.time)}
                                    </span>
                                </div>
                                <img
                                    src={capturedFrame.dataUrl}
                                    alt="Cropped and resized video frame"
                                    className="max-w-full mx-auto rounded-lg shadow-md"
                                />
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={handleDownloadCapturedFrame}
                                        className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors"
                                    >
                                        <DownloadIcon className="w-5 h-5" /> Download
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSetCapturedAsStartFrame}
                                        className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors"
                                    >
                                        <StartFrameIcon className="w-5 h-5" /> Set as Start
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSetCapturedAsEndFrame}
                                        className="flex flex-col items-center justify-center gap-1 p-2 bg-bg-tertiary rounded-md hover:bg-accent hover:text-accent-text transition-colors"
                                    >
                                        <EndFrameIcon className="w-5 h-5" /> Set as End
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveCapturedFrameToLibrary}
                                        disabled={capturedFrameSaveStatus !== 'idle'}
                                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors ${
                                            capturedFrameSaveStatus === 'saved'
                                                ? 'bg-green-500 text-white cursor-default'
                                                : capturedFrameSaveStatus === 'saving'
                                                ? 'bg-bg-tertiary cursor-wait'
                                                : 'bg-bg-tertiary hover:bg-accent hover:text-accent-text'
                                        }`}
                                    >
                                        {capturedFrameSaveStatus === 'saving' ? (
                                            <SpinnerIcon className="w-5 h-5 animate-spin" />
                                        ) : capturedFrameSaveStatus === 'saved' ? (
                                            <CheckIcon className="w-5 h-5" />
                                        ) : (
                                            <SaveIcon className="w-5 h-5" />
                                        )}
                                        {capturedFrameSaveStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {videoResult && videoResultUrl && (
                            <div className="pt-4 border-t border-border-primary space-y-3">
                                <h3 className="text-lg font-semibold text-text-primary">Result</h3>
                                <video src={videoResultUrl} controls className="w-full rounded-lg shadow-md bg-black" />
                                <p className="text-xs text-text-secondary break-all">{videoResult.name}</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <a
                                        href={videoResultUrl}
                                        download={videoResult.name}
                                        className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover"
                                    >
                                        <DownloadIcon className="w-5 h-5" /> Download MP4
                                    </a>
                                    <button
                                        type="button"
                                        onClick={handleSaveVideoResultToLibrary}
                                        disabled={!canSaveVideoClip(videoResult.duration) || videoSaveStatus !== 'idle'}
                                        className={`flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                            videoSaveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-accent text-accent-text hover:bg-accent-hover'
                                        }`}
                                    >
                                        {videoSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : videoSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                        {videoSaveStatus === 'saving' ? 'Saving...' : videoSaveStatus === 'saved' ? 'Saved' : 'Save to Library'}
                                    </button>
                                </div>
                                {!canSaveVideoClip(videoResult.duration) && (
                                    <p className="text-xs text-text-secondary">
                                        Library saving is only available for videos shorter than 5 minutes. You can still download this MP4.
                                    </p>
                                )}
                            </div>
                        )}
                        {videoError && <p role="alert" className="text-danger text-center bg-danger-bg p-3 rounded-md mt-4 whitespace-pre-wrap">{videoError}</p>}
                    </div>
                </div>
            )}

            {isVideoLibraryPickerOpen && (
                <LibraryPickerModal
                    isOpen={isVideoLibraryPickerOpen}
                    hydrateMedia={false}
                    onClose={() => setIsVideoLibraryPickerOpen(false)}
                    onSelectItem={handleSelectVideoFromLibrary}
                    filter="video"
                />
            )}
        </div>
    );
};

export const VideoUtilsPanel: React.FC<VideoUtilsPanelProps> = ({ 
    setStartFrame, 
    setEndFrame,
    onOpenLibrary,
    onOpenVideoLibrary,
    activeSubTab,
    setActiveSubTab,
    onReset,
    onOpenLibraryForResizeCrop,
}) => {
    // ... existing frame extractor and color picker logic will remain the same ...
    const dispatch = useDispatch<AppDispatch>();
    const videoUtilsState = useSelector((state: RootState) => state.video.videoUtilsState);
    const referenceMakerResetVersion = useSelector((state: RootState) => state.video.referenceMakerResetVersion);
    const videoMergeResetVersion = useSelector((state: RootState) => state.video.videoMergeResetVersion);
    const audioExtractorResetVersion = useSelector((state: RootState) => state.video.audioExtractorResetVersion);
    const { videoFile, extractedFrame, colorPicker, extractedFrameSaveStatus, resizeCrop } = videoUtilsState;

    // --- State Setters ---
    const setVideoFile = (file: File | null) => {
        dispatch(updateVideoUtilsState({ videoFile: file, extractedFrame: null }));
    };
    const setExtractedFrame = (frame: string | null) => {
        dispatch(updateVideoUtilsState({ extractedFrame: frame }));
    };

     const handleColorImageUpload = (file: File | null) => {
        dispatch(updateColorPickerState({ imageFile: file, palette: [], error: null, dominantColorPool: [], pickingColorIndex: null }));
        if (file) {
            const defaultName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
            dispatch(updateColorPickerState({ paletteName: `Palette from "${defaultName}"` }));
        } else {
            dispatch(updateColorPickerState({ paletteName: '' }));
        }
    };

    // --- Frame Extractor Local State ---
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [frameRate, setFrameRate] = useState<number>(24);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoSrc = useMemo(() => videoFile ? URL.createObjectURL(videoFile) : null, [videoFile]);
    
    // --- Color Picker Local State & Refs ---
    const [copiedHex, setCopiedHex] = useState<string | null>(null);
    const imageCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        return () => { if (videoSrc) URL.revokeObjectURL(videoSrc); };
    }, [videoSrc]);

    // Effect to draw the image onto the canvas for color picking
    useEffect(() => {
        if (colorPicker.imageFile && imageCanvasRef.current) {
            const canvas = imageCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const img = new Image();
            const objectUrl = URL.createObjectURL(colorPicker.imageFile);
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(objectUrl);
            };
            img.src = objectUrl;
        }
    }, [colorPicker.imageFile]);
    
    // --- Frame Extractor Logic ---
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
        if (video.readyState >= 2) {
            video.currentTime = time;
            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); captureFrame(); };
            video.addEventListener('seeked', onSeeked);
        }
    };
    
    const handleFrameStep = (direction: 'forward' | 'backward') => {
        if (!videoRef.current) return;
        const validFrameRate = frameRate > 0 ? frameRate : 24;
        const frameDuration = 1 / validFrameRate;
        const newTime = videoRef.current.currentTime + (direction === 'forward' ? frameDuration : -frameDuration);
        videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime));
    };

    const handleSecondStep = (direction: 'forward' | 'backward') => {
        if (!videoRef.current) return;
        const step = direction === 'forward' ? 1 : -1; // 1 second
        const newTime = videoRef.current.currentTime + step;
        videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime));
    };

    const handleDownloadFrame = () => {
        if (!extractedFrame) return;
        const link = document.createElement('a');
        link.href = extractedFrame;
        const videoName = sanitizeForFilename(videoFile?.name.replace(/\.[^/.]+$/, "") || 'video_frame');
        const time = formatTime(currentTime).replace(/:|\./g, '_');
        link.download = `${videoName}_${time}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSetAsStartFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'start_frame.jpeg');
        await setStartFrame(file);
        alert('Frame sent to LTX Director.');
    };

    const handleSetAsEndFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'end_frame.jpeg');
        await setEndFrame(file);
        alert('Frame sent to LTX Director.');
    };

    const handleSaveFrameToLibrary = async () => {
        if (!extractedFrame) return;
        dispatch(setFrameSaveStatus('saving'));
        try {
            const videoName = videoFile?.name || 'video';
            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'extracted-frame',
                media: extractedFrame,
                thumbnail: await dataUrlToThumbnail(extractedFrame, 256),
                name: `Frame from ${videoName} at ${formatTime(currentTime)}`,
            };
            await dispatch(addToLibrary(item)).unwrap();
            dispatch(setFrameSaveStatus('saved'));
        } catch (err) {
            console.error("Failed to save frame to library:", err);
            dispatch(setFrameSaveStatus('idle'));
        }
    };

    // --- Color Picker Logic ---
    const shuffleArray = (array: any[]) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    const handleExtractPalette = async () => {
        if (!colorPicker.imageFile) return;
        dispatch(updateColorPickerState({ isExtracting: true, error: null, palette: [], dominantColorPool: [], pickingColorIndex: null }));
        try {
            const DOMINANT_COLOR_POOL_SIZE = 64;
            const allHexCodes = await quantizeImage(colorPicker.imageFile, DOMINANT_COLOR_POOL_SIZE);

            const shuffledCodes = shuffleArray([...allHexCodes]);
            const initialPaletteHex = shuffledCodes.slice(0, colorPicker.colorCount);
            
            const finalPalette: PaletteColor[] = initialPaletteHex.map(hex => ({
                hex, name: findClosestColorName(hex),
            }));

            dispatch(updateColorPickerState({ 
                palette: finalPalette, 
                dominantColorPool: allHexCodes,
                isExtracting: false 
            }));
        } catch (err: any) {
            dispatch(updateColorPickerState({ error: err.message, isExtracting: false }));
        }
    };

    const handleShuffle = () => {
        if (!colorPicker.dominantColorPool || colorPicker.dominantColorPool.length === 0) return;

        const shuffledCodes = shuffleArray([...colorPicker.dominantColorPool]);
        const newPaletteHex = shuffledCodes.slice(0, colorPicker.colorCount);
        
        const newPalette: PaletteColor[] = newPaletteHex.map(hex => ({
            hex, name: findClosestColorName(hex),
        }));

        dispatch(updateColorPickerState({ palette: newPalette }));
    };

    const handleColorSwatchClick = (index: number) => {
        dispatch(updateColorPickerState({
            pickingColorIndex: colorPicker.pickingColorIndex === index ? null : index,
        }));
    };
    
    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (colorPicker.pickingColorIndex === null) return;

        const canvas = event.currentTarget;
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
        const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
        const hex = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;

        const newColor: PaletteColor = { hex, name: findClosestColorName(hex) };

        const updatedPalette = [...colorPicker.palette];
        updatedPalette[colorPicker.pickingColorIndex] = newColor;

        dispatch(updateColorPickerState({
            palette: updatedPalette,
            pickingColorIndex: null, // Deactivate picking mode
        }));
    };

    const handleCopyHex = (hex: string) => {
        navigator.clipboard.writeText(hex).then(() => {
            setCopiedHex(hex);
            setTimeout(() => setCopiedHex(null), 2000);
        });
    };

    const handleSavePalette = async () => {
        if (colorPicker.palette.length === 0) return;
        dispatch(setPaletteSaveStatus('saving'));
        try {
            let sourceImageDataUrl: string | undefined = undefined;
            if (colorPicker.imageFile) {
                sourceImageDataUrl = await fileToResizedDataUrl(colorPicker.imageFile, 512);
            }

            const item: Omit<LibraryItem, 'id'> = {
                mediaType: 'color-palette',
                name: colorPicker.paletteName.trim() || `Palette from ${colorPicker.imageFile?.name || 'Image'}`,
                media: JSON.stringify(colorPicker.palette),
                thumbnail: createPaletteThumbnail(colorPicker.palette),
                sourceImage: sourceImageDataUrl,
            };
            await dispatch(addToLibrary(item)).unwrap();
            dispatch(setPaletteSaveStatus('saved'));
        } catch (err) {
            console.error("Failed to save palette:", err);
            dispatch(setPaletteSaveStatus('idle'));
        }
    };

    const subTabs: SubTab[] = [
        { id: 'frames', label: 'Frame Extractor' },
        { id: 'clips', label: 'Video Extractor' },
        { id: 'audio-extractor', label: 'Audio Extractor' },
        { id: 'merge', label: 'Merge Video' },
        { id: 'reference-maker', label: 'Reference Maker' },
        { id: 'colors', label: 'Color Palette Extractor' },
        { id: 'resize-crop', label: 'Resize & Crop' },
        { id: 'voice-recorder', label: 'Voice Recorder' },
    ];

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto" style={VIDEO_UTILS_ACCENT_STYLES[activeSubTab] || VIDEO_UTILS_ACCENT_STYLES.frames}>
             <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />
            <div className={activeSubTab === 'reference-maker' ? 'block' : 'hidden'}>
                <ReferenceMakerPanel key={referenceMakerResetVersion} />
            </div>
            <div className={activeSubTab === 'merge' ? 'block' : 'hidden'}>
                <VideoMergePanel key={videoMergeResetVersion} />
            </div>
            <div className={activeSubTab === 'audio-extractor' ? 'block' : 'hidden'}>
                <AudioExtractorPanel key={audioExtractorResetVersion} active={activeSubTab === 'audio-extractor'} />
            </div>
            <div className={activeSubTab === 'clips' ? 'block' : 'hidden'}>
                <VideoClipExtractor videoFile={videoFile} onOpenLibrary={onOpenVideoLibrary}
                    renderUploader={disabled => <VideoUploader onVideoUpload={setVideoFile} sourceFile={videoFile} disabled={disabled} />} />
            </div>
            {/* --- Frame Extractor --- */}
            <div className={activeSubTab === 'frames' ? 'block' : 'hidden'}>
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
                    <div className="flex items-center gap-3 mb-4">
                        <FilmIcon className="w-8 h-8 text-accent"/>
                        <h2 className="text-2xl font-bold text-accent">Frame Extractor</h2>
                    </div>
                    <p className="text-sm text-text-secondary mb-6">
                        Upload a video to preview it and extract specific frames as high-quality images.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="flex-grow">
                                    <VideoUploader onVideoUpload={setVideoFile} sourceFile={videoFile} />
                                </div>
                                <button
                                    onClick={onOpenVideoLibrary}
                                    className="self-center mt-8 bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary"
                                    title="Select video from Library"
                                >
                                    <LibraryIcon className="w-6 h-6"/>
                                </button>
                            </div>
                            {videoSrc && (
                                <div className="space-y-4 pt-4">
                                    <video 
                                        ref={videoRef} 
                                        src={videoSrc} 
                                        controls 
                                        className="w-full rounded-lg bg-black"
                                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                    />
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleSecondStep('backward')} className="p-2 rounded-full bg-bg-primary hover:bg-bg-tertiary-hover transition-colors" title="Seek 1 Second Backward">
                                                <ChevronDoubleLeftIcon className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => handleFrameStep('backward')} className="p-2 rounded-full bg-bg-primary hover:bg-bg-tertiary-hover transition-colors" title="Previous Frame">
                                                <ChevronLeftIcon className="w-5 h-5" />
                                            </button>
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
                                            <button onClick={() => handleFrameStep('forward')} className="p-2 rounded-full bg-bg-primary hover:bg-bg-tertiary-hover transition-colors" title="Next Frame">
                                                <ChevronRightIcon className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => handleSecondStep('forward')} className="p-2 rounded-full bg-bg-primary hover:bg-bg-tertiary-hover transition-colors" title="Seek 1 Second Forward">
                                                <ChevronDoubleRightIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-mono text-text-secondary">
                                                {formatTime(currentTime)} / {formatTime(duration)}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="frame-rate-input" className="text-xs text-text-muted">FPS:</label>
                                                <input
                                                    id="frame-rate-input"
                                                    type="number"
                                                    value={frameRate}
                                                    onChange={(e) => setFrameRate(Number(e.target.value) || 24)}
                                                    min="1"
                                                    className="w-16 bg-bg-primary p-1 text-sm rounded-md border border-border-primary text-center"
                                                    title="Set the video's frames per second for accurate stepping"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <button onClick={() => handleExtractFrame(currentTime)} className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                            Save Current Frame
                                        </button>
                                        <button onClick={() => handleExtractFrame(duration)} className="bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                            Save Last Frame
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            {extractedFrame ? (
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
                                            disabled={extractedFrameSaveStatus !== 'idle'}
                                            className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors ${
                                                extractedFrameSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                extractedFrameSaveStatus === 'saving' ? 'bg-bg-tertiary cursor-wait' :
                                                'bg-bg-tertiary hover:bg-accent hover:text-accent-text'
                                            }`}
                                        >
                                            {extractedFrameSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : extractedFrameSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5"/> : <SaveIcon className="w-5 h-5"/>}
                                            {extractedFrameSaveStatus === 'saved' ? 'Saved!' : 'Save to Library'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl shadow-inner h-full min-h-[400px]">
                                    <FilmIcon className="w-16 h-16 text-border-primary mb-4" />
                                    <h3 className="text-lg font-bold text-text-primary">Your extracted frame will appear here</h3>
                                    <p className="text-text-secondary max-w-xs">Upload a video and click "Save Frame" to see a preview.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Color Palette Extractor --- */}
             <div className={activeSubTab === 'colors' ? 'block' : 'hidden'}>
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-accent">
                    <div className="flex items-center gap-3 mb-4">
                        <PaletteIcon className="w-8 h-8 text-accent" />
                        <h2 className="text-2xl font-bold text-accent">Color Palette Extractor</h2>
                    </div>
                    <p className="text-sm text-text-secondary mb-6">
                        Upload an image to extract a color palette. Re-shuffle the results or click a color to pick a new one from the image.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        {/* --- Left Column: Controls & Image --- */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="flex items-center gap-2">
                                <ImageUploader label="Upload Image" id="color-picker-image" onImageUpload={handleColorImageUpload} sourceFile={colorPicker.imageFile} />
                                <button onClick={onOpenLibrary} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary">
                                    <LibraryIcon className="w-6 h-6"/>
                                </button>
                            </div>
                            {colorPicker.imageFile && (
                                <div className="relative bg-bg-primary p-2 rounded-lg">
                                    <canvas
                                        ref={imageCanvasRef}
                                        className={`max-w-full rounded-lg shadow-lg ${colorPicker.pickingColorIndex !== null ? 'cursor-crosshair' : 'cursor-default'}`}
                                        onClick={handleCanvasClick}
                                        style={{ imageRendering: 'pixelated' }}
                                    />
                                    {colorPicker.pickingColorIndex !== null && (
                                        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center text-white font-bold p-4 text-center pointer-events-none animate-fade-in">
                                            Click on the image to pick a new color.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* --- Right Column: Results --- */}
                        <div className="lg:col-span-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Number of Colors: {colorPicker.colorCount}</label>
                                <input
                                    type="range" min="2" max="16" step="1"
                                    value={colorPicker.colorCount}
                                    onChange={e => dispatch(updateColorPickerState({colorCount: Number(e.target.value)}))}
                                    className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer"
                                    disabled={colorPicker.isExtracting}
                                />
                            </div>
                            <button
                                onClick={handleExtractPalette}
                                disabled={!colorPicker.imageFile || colorPicker.isExtracting}
                                style={colorPicker.imageFile && !colorPicker.isExtracting ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                                className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                            >
                                {colorPicker.isExtracting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                                {colorPicker.isExtracting ? 'Extracting Palette...' : 'Extract Palette'}
                            </button>
                            {colorPicker.error && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{colorPicker.error}</p>}
                            
                            {colorPicker.palette.length > 0 && (
                                <div className="space-y-4 pt-4 border-t border-border-primary">
                                    <h3 className="text-lg font-semibold text-text-primary">Generated Palette</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {colorPicker.palette.map((color, index) => (
                                            <div key={index} 
                                                className="flex flex-col items-center cursor-pointer group"
                                                onClick={() => handleColorSwatchClick(index)}
                                                title="Click to change this color"
                                            >
                                                <div 
                                                    className={`w-full h-24 rounded-t-lg border-2 transition-all duration-200 ${colorPicker.pickingColorIndex === index ? 'border-accent ring-2 ring-accent shadow-lg scale-105' : 'border-border-primary group-hover:border-accent-light'}`}
                                                    style={{ backgroundColor: color.hex }} 
                                                />
                                                <div className="w-full p-2 bg-bg-tertiary rounded-b-lg text-center">
                                                    <p className="text-sm font-semibold text-text-primary truncate" title={color.name}>
                                                        {color.name}
                                                    </p>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleCopyHex(color.hex); }}
                                                        className="text-xs font-mono text-text-muted hover:text-accent flex items-center gap-1 mx-auto"
                                                        title="Click to copy HEX"
                                                    >
                                                        {copiedHex === color.hex ? 'Copied!' : color.hex}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="pt-4 space-y-4">
                                        <div>
                                            <label htmlFor="palette-name" className="block text-sm font-medium text-text-secondary">Palette Name</label>
                                            <input
                                                id="palette-name"
                                                type="text"
                                                value={colorPicker.paletteName}
                                                onChange={(e) => dispatch(updateColorPickerState({ paletteName: e.target.value }))}
                                                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
                                                placeholder="Enter a name for your palette"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={handleShuffle}
                                                disabled={colorPicker.paletteSaveStatus !== 'idle' || colorPicker.isExtracting}
                                                className="w-full flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg transition-colors duration-200 disabled:opacity-50 bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover"
                                            >
                                                <RefreshIcon className="w-5 h-5"/> Re-shuffle
                                            </button>
                                            <button
                                                onClick={handleSavePalette}
                                                disabled={colorPicker.paletteSaveStatus !== 'idle' || colorPicker.isExtracting}
                                                className={`w-full flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg transition-colors duration-200 disabled:opacity-50 ${
                                                    colorPicker.paletteSaveStatus === 'saved' ? 'bg-green-500 text-white cursor-default' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover'
                                                }`}
                                            >
                                                {colorPicker.paletteSaveStatus === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : colorPicker.paletteSaveStatus === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                {colorPicker.paletteSaveStatus === 'saved' ? 'Saved' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
             <div className={activeSubTab === 'resize-crop' ? 'block' : 'hidden'}>
                <ResizeCropTool 
                    resizeCrop={resizeCrop}
                    onOpenLibrary={onOpenLibraryForResizeCrop}
                    resetVersion={referenceMakerResetVersion}
                    setStartFrame={setStartFrame}
                    setEndFrame={setEndFrame}
                />
            </div>

            <div className={activeSubTab === 'voice-recorder' ? 'block' : 'hidden'}>
                <VoiceRecorderPanel />
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
             <div className="mt-8 pt-4 border-t border-danger-bg">
                <button onClick={onReset} className="flex items-center gap-2 text-sm text-danger font-semibold bg-danger-bg py-2 px-4 rounded-lg hover:bg-danger hover:text-white transition-colors">
                    <ResetIcon className="w-5 h-5" /> Reset All Media Tools
                </button>
            </div>
        </div>
    );
};
