const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
    getMammouthApiKey: () => ipcRenderer.invoke('get-mammouth-api-key'),
    setMammouthApiKey: (key) => ipcRenderer.invoke('set-mammouth-api-key', key),
});
