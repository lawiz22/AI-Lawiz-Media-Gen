

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