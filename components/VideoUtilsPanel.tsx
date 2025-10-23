import React, { useState, useRef, ChangeEvent, useMemo, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import ReactCrop, { centerCrop, makeAspectCrop, Crop, PixelCrop, PercentCrop } from 'react-image-crop';
import { addToLibrary } from '../store/librarySlice';
import { setFrameSaveStatus, setPaletteSaveStatus, updateVideoUtilsState, updateColorPickerState, updateResizeCropState, setResizeCropSaveStatus } from '../store/videoSlice';
// Fix: Imported the missing ImageIcon to resolve the "Cannot find name" error.
import { FilmIcon, DownloadIcon, SaveIcon, SpinnerIcon, StartFrameIcon, EndFrameIcon, CheckIcon, PaletteIcon, LibraryIcon, CopyIcon, GenerateIcon, VideoIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ResetIcon, CropIcon, ResizeIcon, ImageIcon } from './icons';
import { dataUrlToFile, dataUrlToThumbnail, createPaletteThumbnail, fileToResizedDataUrl, fileToDataUrl } from '../utils/imageUtils';
import { resizeImageFile, cropImageFile } from '../utils/imageProcessing';
import type { LibraryItem, VideoUtilsState, PaletteColor, ColorPickerState, ResizeCropState } from '../types';
import { ImageUploader } from './ImageUploader';

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

const VideoUploader: React.FC<{ onVideoUpload: (file: File | null) => void; sourceFile: File | null; }> = ({ onVideoUpload, sourceFile }) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const fileName = sourceFile?.name || '';

    const handleFileChange = useCallback((file: File | null) => {
        if (file && file.type.startsWith('video/')) {
            onVideoUpload(file);
        } else {
            onVideoUpload(null);
            if (file) alert("Please upload a valid video file.");
        }
    }, [onVideoUpload]);

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
            <label htmlFor="video-upload-input" className="block text-sm font-medium text-text-secondary mb-2">Upload Video</label>
            <label
                htmlFor="video-upload-input"
                className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg transition-colors duration-200 ${isDragging ? 'border-accent bg-bg-tertiary' : 'border-border-primary bg-bg-tertiary/50 hover:bg-bg-tertiary cursor-pointer'}`}
                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-text-secondary">
                    <VideoIcon className="w-8 h-8 mb-3" />
                    <p className="mb-2 text-sm"><span className="font-semibold text-accent">Click to upload</span> or drag and drop</p>
                    <p className="text-xs">MP4, MOV, WEBM</p>
                </div>
                <input id="video-upload-input" type="file" className="hidden" accept="video/*" onChange={onFileChange} />
            </label>
            {fileName && <p className="text-xs text-text-muted mt-1 truncate">File: {fileName}</p>}
        </div>
    );
};

interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  tabs: SubTab[];
  activeTab: string;
  onTabClick: (id: string) => void;
}

const SubTabs: React.FC<SubTabsProps> = ({ tabs, activeTab, onTabClick }) => (
    <div className="flex items-center border-b-2 border-border-primary mb-8 -mt-2">
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
    setStartFrame: (file: File | null) => void;
    setEndFrame: (file: File | null) => void;
    onOpenLibrary: () => void;
    onOpenVideoLibrary: () => void;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
    onReset: () => void;
    onOpenLibraryForResizeCrop: () => void;
}

const ResizeCropTool: React.FC<{
    resizeCrop: ResizeCropState;
    onOpenLibrary: () => void;
}> = ({ resizeCrop, onOpenLibrary }) => {
    const dispatch = useDispatch();
    const [crop, setCrop] = useState<Crop>();
    const imgRef = useRef<HTMLImageElement>(null);

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

    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const aspectStr = resizeCrop.aspectRatio;
        const aspect = aspectStr === 'free' ? undefined : (parseFloat(aspectStr.split(':')[0]) / parseFloat(aspectStr.split(':')[1]));
        
        const newCrop = centerCrop(
            makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
            width, height
        );
        setCrop(newCrop);
        // Also update the redux state immediately
        handleCropComplete(undefined, newCrop as PercentCrop);
    };

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

    const handleDownloadResult = () => {
        if (!resizeCrop.resultUrl || !resizeCrop.sourceFile) return;
        const link = document.createElement('a');
        link.href = resizeCrop.resultUrl;
        link.download = `edited_${resizeCrop.sourceFile.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-yellow">
            <div className="flex items-center gap-3 mb-4">
                <CropIcon className="w-8 h-8 text-highlight-yellow" />
                <h2 className="text-2xl font-bold text-highlight-yellow">Resize & Crop</h2>
            </div>
            <p className="text-sm text-text-secondary mb-6">
                Quickly resize or crop your images to a specific aspect ratio or scale.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <ImageUploader label="Upload Image" id="resize-crop-source" onImageUpload={handleImageUpload} sourceFile={resizeCrop.sourceFile} />
                        <button onClick={onOpenLibrary} className="mt-8 self-center bg-bg-tertiary p-3 rounded-lg hover:bg-bg-tertiary-hover text-text-secondary" title="Select from Library">
                            <LibraryIcon className="w-6 h-6" />
                        </button>
                    </div>
                    {resizeCrop.sourceFile && (
                        <div className="space-y-4 pt-4 border-t border-border-primary">
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Resize: {resizeCrop.scale}%</label>
                                <input type="range" min="10" max="200" step="1" value={resizeCrop.scale} onChange={(e) => dispatch(updateResizeCropState({ scale: Number(e.target.value) }))} disabled={resizeCrop.isLoading} className="w-full h-2 mt-1 bg-bg-tertiary rounded-lg appearance-none cursor-pointer" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-text-secondary">Crop Aspect Ratio</label>
                                <select value={resizeCrop.aspectRatio} onChange={e => dispatch(updateResizeCropState({ aspectRatio: e.target.value }))} className="mt-1 w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm">
                                    <option value="free">Freeform</option><option value="1:1">1:1 (Square)</option><option value="16:9">16:9 (Widescreen)</option><option value="9:16">9:16 (Tall)</option><option value="4:3">4:3 (Landscape)</option><option value="3:4">3:4 (Portrait)</option>
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
                                aspect={resizeCrop.aspectRatio === 'free' ? undefined : (parseFloat(resizeCrop.aspectRatio.split(':')[0]) / parseFloat(resizeCrop.aspectRatio.split(':')[1]))}
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
    const dispatch = useDispatch();
    const videoUtilsState = useSelector((state: RootState) => state.video.videoUtilsState);
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
        setStartFrame(file);
        alert('Frame set as Start Frame in the Video Generator tab.');
    };

    const handleSetAsEndFrame = async () => {
        if (!extractedFrame) return;
        const file = await dataUrlToFile(extractedFrame, 'end_frame.jpeg');
        setEndFrame(file);
        alert('Frame set as End Frame in the Video Generator tab.');
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

    const subTabs = [
        { id: 'frames', label: 'Frame Extractor' },
        { id: 'colors', label: 'Color Palette Extractor' },
        { id: 'resize-crop', label: 'Resize & Crop' },
    ];

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto">
             <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />
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
                <div className="bg-bg-primary/50 p-6 rounded-lg border-l-4 border-highlight-green">
                    <div className="flex items-center gap-3 mb-4">
                        <PaletteIcon className="w-8 h-8 text-highlight-green" />
                        <h2 className="text-2xl font-bold text-highlight-green">Color Palette Extractor</h2>
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
                />
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
