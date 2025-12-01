const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
// const Store = require('electron-store'); // electron-store is ESM only

let store;
async function initStore() {
    const { default: Store } = await import('electron-store');
    store = new Store();
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false, // Disabled to allow local ComfyUI communication without CORS issues
        },
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(async () => {
    await initStore();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers for API Key Management
ipcMain.handle('get-api-key', () => {
    return store.get('gemini_api_key');
});

ipcMain.handle('set-api-key', (event, key) => {
    store.set('gemini_api_key', key);
    return true;
});
