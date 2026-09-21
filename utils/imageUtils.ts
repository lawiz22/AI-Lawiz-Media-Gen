import type { PaletteColor } from '../types';

// Fix: The function was returning just the blob data, not a full Generative AI Part. Wrapped the result in `inlineData` and updated the return type to match the expected structure for the Gemini API.
export const fileToGenerativePart = async (file: File): Promise<{inlineData: {mimeType: string; data: string}}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('Failed to read file as a data URL.'));
      }
      const base64String = reader.result.split(',')[1];
      if (!base64String) {
        return reject(new Error('Failed to extract base64 string from data URL.'));
      }
      resolve({
        inlineData: {
          mimeType: file.type,
          data: base64String,
        }
      });
    };
    reader.onerror = (error) => {
        reject(error);
    };
    reader.readAsDataURL(file);
  });
};

export const dataUrlToGenerativePart = (dataUrl: string): {inlineData: {mimeType: string; data: string}} => {
    const [header, base64Data] = dataUrl.split(',');
    if (!header || !base64Data) {
        throw new Error("Invalid data URL format");
    }
    const mimeTypeMatch = header.match(/:(.*?);/);
    if (!mimeTypeMatch || !mimeTypeMatch[1]) {
        throw new Error("Could not extract MIME type from data URL");
    }
    const mimeType = mimeTypeMatch[1];
    return {
        inlineData: {
            mimeType: mimeType,
            data: base64Data
        }
    };
};

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('Failed to read file as a data URL.'));
      }
      const base64String = reader.result.split(',')[1];
      if (!base64String) {
        return reject(new Error('Failed to extract base64 string from data URL.'));
      }
      resolve(base64String);
    };
    reader.onerror = (error) => {
        reject(error);
    };
    reader.readAsDataURL(file);
  });
};

export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('Failed to read file as a data URL.'));
      }
      resolve(reader.result);
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
};
const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to compress image.')), 'image/jpeg', quality);
});

export const limitImageFileSize = async (file: File, maxBytes = 20 * 1024 * 1024): Promise<File> => {
    if (file.size <= maxBytes) return file;

    const sourceUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Could not resize ${file.name || 'the source image'}.`));
            image.src = sourceUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        let context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create an image resize canvas.');
        context.drawImage(image, 0, 0);

        let blob = await canvasToJpegBlob(canvas, 0.9);
        while (blob.size > maxBytes) {
            const scale = Math.min(0.9, Math.sqrt(maxBytes / blob.size) * 0.95);
            const nextWidth = Math.max(1, Math.round(canvas.width * scale));
            const nextHeight = Math.max(1, Math.round(canvas.height * scale));
            const resizedCanvas = document.createElement('canvas');
            resizedCanvas.width = nextWidth;
            resizedCanvas.height = nextHeight;
            context = resizedCanvas.getContext('2d');
            if (!context) throw new Error('Could not create an image resize canvas.');
            context.drawImage(canvas, 0, 0, nextWidth, nextHeight);
            canvas.width = nextWidth;
            canvas.height = nextHeight;
            canvas.getContext('2d')?.drawImage(resizedCanvas, 0, 0);
            blob = await canvasToJpegBlob(canvas, 0.88);
        }

        const baseName = (file.name || 'mammouth-input').replace(/\.[^.]+$/, '');
        return new File([blob], `${baseName}-mammouth.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
};

export const limitImageFilesTotalSize = async (files: File[], maxTotalBytes = 18 * 1024 * 1024): Promise<File[]> => {
    if (files.length === 0) return [];
    const maxBytesPerFile = Math.floor(maxTotalBytes / files.length);
    return Promise.all(files.map(file => limitImageFileSize(file, maxBytesPerFile)));
};

export const getAudioMimeType = (filename: string, reportedType = ''): string => {
    const extension = filename.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        flac: 'audio/flac',
        m4a: 'audio/mp4',
        mp4: 'audio/mp4',
        ogg: 'audio/ogg',
        opus: 'audio/ogg',
        aac: 'audio/aac',
    };
    return mimeTypes[extension || ''] || (reportedType.startsWith('audio/') ? reportedType : 'audio/wav');
};

export const normalizeAudioDataUrl = (dataUrl: string): string => {
    if (!dataUrl.startsWith('data:')) return dataUrl;
    const separatorIndex = dataUrl.indexOf(',');
    if (separatorIndex < 0) return dataUrl;
    const payload = dataUrl.slice(separatorIndex + 1);
    try {
        const header = atob(payload.slice(0, 64));
        let mimeType = '';
        if (header.startsWith('RIFF') && header.includes('WAVE')) mimeType = 'audio/wav';
        else if (header.startsWith('fLaC')) mimeType = 'audio/flac';
        else if (header.startsWith('OggS')) mimeType = 'audio/ogg';
        else if (header.startsWith('ID3') || header.charCodeAt(0) === 0xff) mimeType = 'audio/mpeg';
        else if (header.includes('ftyp')) mimeType = 'audio/mp4';
        if (mimeType) return `data:${mimeType};base64,${payload}`;
        return dataUrl;
    } catch {
        return dataUrl;
    }
};

/**
 * Takes a File, resizes it if its dimensions exceed the max size,
 * and returns a high-quality JPEG data URL for storage.
 */
export const fileToResizedDataUrl = (file: File, maxSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("FileReader failed to load file."));
            }
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width <= maxSize && height <= maxSize) {
                    // No resize needed, just return original data url
                    resolve(event.target!.result as string);
                    return;
                }

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * (maxSize / width));
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round(width * (maxSize / height));
                        height = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error("Could not get canvas context"));
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.9)); // High quality JPEG
            };
            img.onerror = reject;
            img.src = event.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

/**
 * Takes an image data URL and creates a small thumbnail data URL.
 */
export const dataUrlToThumbnail = (dataUrl: string, maxSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width > height) {
                if (width > maxSize) {
                    height = Math.round(height * (maxSize / width));
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = Math.round(width * (maxSize / height));
                    height = maxSize;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not get canvas context"));
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // Lower quality for small thumbnails
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
};

export const videoToThumbnail = (source: Blob | string, maxSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
        let settled = false;
        const timeout = window.setTimeout(() => finish(), 30000);
        const cleanup = () => {
            window.clearTimeout(timeout);
            video.onerror = null;
            video.onloadeddata = null;
            video.onseeked = null;
            video.pause();
            video.removeAttribute('src');
            video.load();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        const finish = (thumbnail?: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (thumbnail) resolve(thumbnail);
            else reject(new Error('Could not extract a thumbnail from the video.'));
        };
        const capture = () => {
            if (!video.videoWidth || !video.videoHeight) return finish();
            const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
            canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) return finish();
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            finish(canvas.toDataURL('image/jpeg', 0.75));
        };

        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        video.onerror = () => finish();
        video.onloadeddata = () => {
            const captureTime = Number.isFinite(video.duration) ? Math.min(0.5, video.duration / 2) : 0;
            if (captureTime > 0) {
                video.onseeked = capture;
                video.currentTime = captureTime;
            } else {
                capture();
            }
        };
        video.src = objectUrl || source as string;
        video.load();
    });
};

/**
 * Converts a data URL string back to a File object.
 */
export const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
};

/**
 * Converts a data URL string to a Blob object.
 */
export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    return res.blob();
};


/**
 * Gets the dimensions of an image from its data URL.
 */
export const getImageDimensionsFromDataUrl = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
};

/**
 * Gets the dimensions of an image from a File object efficiently.
 */
export const getImageDimensionsFromFile = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
};

export const createPaletteThumbnail = (palette: PaletteColor[]): string => {
    const width = 256;
    const height = 256;
    if (palette.length === 0) return '';
    const barWidth = width / palette.length;

    const rects = palette.map((color, index) => 
        `<rect x="${index * barWidth}" y="0" width="${barWidth}" height="${height}" fill="${color.hex}" />`
    ).join('');

    const finalSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#1f2937"/>
        ${rects}
    </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(finalSvg)}`;
};

export const createVideoPlaceholderThumbnail = (): string => {
    const width = 256;
    const height = 256;

    const iconPath = "M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z";

    const finalSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 256 256">
        <rect width="256" height="256" fill="#1f2937"/>
        <svg x="50%" y="50%" width="128" height="128" viewBox="0 0 24 24" style="transform: translate(-50%, -50%);">
             <path d="${iconPath}" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </svg>
    `;
    return `data:image/svg+xml;base64,${btoa(finalSvg)}`;
};

export const createBlankImageFile = (width: number, height: number, color: string, filename: string): Promise<File> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return reject(new Error('Could not get canvas context'));
        }

        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);

        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    return reject(new Error('Canvas to Blob conversion failed'));
                }
                const file = new File([blob], filename, { type: 'image/png' });
                resolve(file);
            },
            'image/png'
        );
    });
};

export const createFontChartGuide = (backgroundColor: string, filename: string): Promise<File> => {
    return new Promise((resolve, reject) => {
        const width = 1024;
        const height = 1536;
        const rows = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789'];
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('Could not create the font chart guide.'));

        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, width, height);
        const red = parseInt(backgroundColor.slice(1, 3), 16) || 0;
        const green = parseInt(backgroundColor.slice(3, 5), 16) || 0;
        const blue = parseInt(backgroundColor.slice(5, 7), 16) || 0;
        context.fillStyle = (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#000000' : '#ffffff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        const marginX = 54;
        const rowHeight = 250;
        const firstRowY = 270;
        rows.forEach((row, rowIndex) => {
            const cellWidth = (width - marginX * 2) / row.length;
            const fontSize = rowIndex < 2 ? 68 : rowIndex < 4 ? 62 : 66;
            context.font = `700 ${fontSize}px Arial, sans-serif`;
            [...row].forEach((character, columnIndex) => {
                context.fillText(character, marginX + cellWidth * (columnIndex + 0.5), firstRowY + rowHeight * rowIndex);
            });
        });

        canvas.toBlob(blob => {
            if (!blob) return reject(new Error('Could not encode the font chart guide.'));
            resolve(new File([blob], filename, { type: 'image/png' }));
        }, 'image/png');
    });
};

export const getDominantImageColor = async (file: File): Promise<string> => {
    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not analyze the source colors.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] < 128) continue;
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const key = `${red >> 5}-${green >> 5}-${blue >> 5}`;
            const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
            bucket.count += 1;
            bucket.red += red;
            bucket.green += green;
            bucket.blue += blue;
            buckets.set(key, bucket);
        }
        const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
        if (!dominant) return '#ffffff';
        const toHex = (value: number) => Math.round(value / dominant.count).toString(16).padStart(2, '0');
        return `#${toHex(dominant.red)}${toHex(dominant.green)}${toHex(dominant.blue)}`;
    } finally {
        bitmap.close();
    }
};

export const letterboxImage = (file: File, targetAspectRatio: string, fillColor: string = '#111827'): Promise<File> => {
    return new Promise((resolve, reject) => {
        const [targetW, targetH] = targetAspectRatio.split(':').map(Number);
        const targetRatio = targetW / targetH;

        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            URL.revokeObjectURL(url);
            
            const sourceWidth = img.naturalWidth;
            const sourceHeight = img.naturalHeight;
            const sourceRatio = sourceWidth / sourceHeight;

            let canvasWidth = sourceWidth;
            let canvasHeight = sourceHeight;

            if (Math.abs(sourceRatio - targetRatio) < 0.01) {
                // Ratios are close enough, no letterboxing needed
                resolve(file);
                return;
            }

            // Determine new canvas dimensions
            if (sourceRatio > targetRatio) {
                // Source is wider than target, so canvas height needs to increase
                canvasHeight = sourceWidth / targetRatio;
            } else {
                // Source is taller than target, so canvas width needs to increase
                canvasWidth = sourceHeight * targetRatio;
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(canvasWidth);
            canvas.height = Math.round(canvasHeight);
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not get canvas context"));

            // Fill background
            ctx.fillStyle = fillColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw original image centered
            const drawX = (canvas.width - sourceWidth) / 2;
            const drawY = (canvas.height - sourceHeight) / 2;
            ctx.drawImage(img, drawX, drawY);

            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error("Canvas to Blob failed"));
                const newFile = new File([blob], file.name, { type: 'image/png' });
                resolve(newFile);
            }, 'image/png');
        };

        img.onerror = reject;
        img.src = url;
    });
};