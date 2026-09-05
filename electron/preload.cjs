const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
    getMammouthApiKey: () => ipcRenderer.invoke('get-mammouth-api-key'),
    setMammouthApiKey: (key) => ipcRenderer.invoke('set-mammouth-api-key', key),
    getCivitaiSettings: () => ipcRenderer.invoke('get-civitai-settings'),
    setCivitaiApiKey: (provider, key) => ipcRenderer.invoke('set-civitai-api-key', provider, key),
    selectComfyUIRoot: () => ipcRenderer.invoke('select-comfyui-root'),
    getCivitaiInventory: () => ipcRenderer.invoke('get-civitai-inventory'),
    refreshCivitaiLibrarySafety: (request) => ipcRenderer.invoke('refresh-civitai-library-safety', request),
    setLocalModelSafety: (request) => ipcRenderer.invoke('set-local-model-safety', request),
    setLocalModelArchiveLink: (request) => ipcRenderer.invoke('set-local-model-archive-link', request),
    fetchLocalModelArchive: (request) => ipcRenderer.invoke('fetch-local-model-archive', request),
    scanCivitaiLibrary: (request) => ipcRenderer.invoke('scan-civitai-library', request),
    classifyCivitaiModelRoot: (provider) => ipcRenderer.invoke('classify-civitai-model-root', provider),
    getLocalModelPreview: (modelPath, metadata) => ipcRenderer.invoke('get-local-model-preview', modelPath, metadata),
    selectLocalModelPreview: (modelPath) => ipcRenderer.invoke('select-local-model-preview', modelPath),
    reclassifyLocalModel: (request) => ipcRenderer.invoke('reclassify-local-model', request),
    fetchLocalModelUsageMetadata: (request) => ipcRenderer.invoke('fetch-local-model-usage-metadata', request),
    setLocalModelUsageMetadata: (request) => ipcRenderer.invoke('set-local-model-usage-metadata', request),
    getLocalModelPromptExamples: (request) => ipcRenderer.invoke('get-local-model-prompt-examples', request),
    downloadCivitaiModel: (request) => ipcRenderer.invoke('download-civitai-model', request),
    updateCivitaiModel: (request) => ipcRenderer.invoke('update-civitai-model', request),
    cancelCivitaiDownload: (downloadId) => ipcRenderer.invoke('cancel-civitai-download', downloadId),
    onCivitaiDownloadProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('civitai-download-progress', listener);
        return () => ipcRenderer.removeListener('civitai-download-progress', listener);
    },
    onCivitaiScanProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('civitai-scan-progress', listener);
        return () => ipcRenderer.removeListener('civitai-scan-progress', listener);
    },
    onCivitaiSafetyProgress: (callback) => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('civitai-safety-progress', listener);
        return () => ipcRenderer.removeListener('civitai-safety-progress', listener);
    },
});
