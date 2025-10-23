import { fileToDataUrl } from "./imageUtils";

const parseAspectRatio = (ratioStr: string): number => {
  const [width, height] = ratioStr.split(':').map(Number);
  if (!width || !height || height === 0) return 1;
  return width / height;
};

export const cropImageToAspectRatio = (file: File, targetAspectRatioStr: string): Promise<File> => {
    return new Promise((resolve, reject) => {
        const targetRatio = parseAspectRatio(targetAspectRatioStr);
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            const sourceWidth = image.naturalWidth;
            const sourceHeight = image.naturalHeight;
            const sourceRatio = sourceWidth / sourceHeight;

            if (Math.abs(sourceRatio - targetRatio) < 0.01) {
                return resolve(file);
            }

            let sx = 0, sy = 0, sWidth = sourceWidth, sHeight = sourceHeight;

            if (sourceRatio > targetRatio) {
                sWidth = sourceHeight * targetRatio;
                sx = (sourceWidth - sWidth) / 2;
            } else {
                sHeight = sourceWidth / targetRatio;
                sy = (sourceHeight - sHeight) / 2;
            }

            const canvas = document.createElement('canvas');
            canvas.width = sWidth;
            canvas.height = sHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        return reject(new Error('Canvas to Blob conversion failed'));
                    }
                    const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpeg", { type: 'image/jpeg' });
                    resolve(croppedFile);
                },
                'image/jpeg',
                0.95
            );
        };

        image.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };

        image.src = url;
    });
};

export const resizeImageFile = (file: File, scale: number): Promise<File> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            const sourceWidth = image.naturalWidth;
            const sourceHeight = image.naturalHeight;

            const newWidth = Math.round(sourceWidth * scale);
            const newHeight = Math.round(sourceHeight * scale);

            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            ctx.drawImage(image, 0, 0, newWidth, newHeight);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        return reject(new Error('Canvas to Blob conversion failed'));
                    }
                    // Use a high-quality JPEG format for the resized image
                    const resizedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(resizedFile);
                },
                'image/jpeg',
                0.95 // High quality
            );
        };

        image.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };

        image.src = url;
    });
};

export const cropImageFile = (
    file: File,
    crop: { x: number; y: number; width: number; height: number } // percentages
): Promise<File> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            URL.revokeObjectURL(url);
            const sourceWidth = image.naturalWidth;
            const sourceHeight = image.naturalHeight;

            const cropX = Math.round(sourceWidth * crop.x);
            const cropY = Math.round(sourceHeight * crop.y);
            const cropWidth = Math.round(sourceWidth * crop.width);
            const cropHeight = Math.round(sourceHeight * crop.height);

            const canvas = document.createElement('canvas');
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context'));

            ctx.drawImage(
                image,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );

            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('Canvas to Blob failed'));
                // Use a new name to avoid caching issues
                const newName = `cropped_${Date.now()}_${file.name}`;
                const newFile = new File([blob], newName, { type: 'image/jpeg' });
                resolve(newFile);
            }, 'image/jpeg', 0.95);
        };
        image.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        image.src = url;
    });
};