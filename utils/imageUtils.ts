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