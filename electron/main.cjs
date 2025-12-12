
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');


const isDev = !app.isPackaged;

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
            webSecurity: false,
        },
    });

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.webContents.on('did-finish-load', () => {
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    });
}

// Global Error Handlers
process.on('uncaughtException', (error) => {
    dialog.showErrorBox('Critical Error', `A critical error occurred:\n${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    dialog.showErrorBox('Critical Error', `An unhandled rejection occurred:\n${reason}`);
});

app.whenReady().then(async () => {
    try {
        await initStore();
        createWindow();
    } catch (error) {
        dialog.showErrorBox('Startup Error', `Failed to initialize application: ${error.message}`);
        app.quit();
    }

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

// IPC Handlers
ipcMain.handle('get-api-key', () => {
    return store.get('gemini_api_key');
});

ipcMain.handle('set-api-key', (event, key) => {
    store.set('gemini_api_key', key);
    return true;
});

