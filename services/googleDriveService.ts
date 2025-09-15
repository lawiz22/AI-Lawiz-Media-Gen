
import type { LibraryItem, DriveFolder } from '../types';
import { dataUrlToBlob } from '../utils/imageUtils';

// --- Constants ---
const GAPI_SCRIPT_ID = 'gapi-script';
const GIS_SCRIPT_ID = 'gis-script';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';
// The API_KEY must be sourced from the environment for the Picker API.
const PICKER_API_KEY = process.env.API_KEY!;

// --- Module-level State ---
let tokenClient: any = null;
let driveFolder: DriveFolder | null = null;
let isGapiInitialized = false;
let isGisInitialized = false;

// --- Helper Functions ---
const getClientId = (): string => localStorage.getItem('google_client_id') || '';

const loadScript = (id: string, src: string, onLoad: () => void) => {
    if (document.getElementById(id)) {
        onLoad();
        return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = onLoad;
    document.body.appendChild(script);
};

const initializeGapiClient = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (isGapiInitialized) {
            resolve();
            return;
        }
        window.gapi.load('client:picker', async () => {
            try {
                await window.gapi.client.init({
                    apiKey: PICKER_API_KEY,
                    discoveryDocs: [DISCOVERY_DOC],
                });
                isGapiInitialized = true;
                resolve();
            } catch (error) {
                console.error("Error initializing GAPI client", error);
                reject(error);
            }
        });
    });
};

const initializeGisClient = (): Promise<void> => {
    return new Promise((resolve) => {
        if (isGisInitialized) {
            resolve();
            return;
        }
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: getClientId(),
            scope: SCOPES,
            callback: '', // Callback is handled by the promise
        });
        isGisInitialized = true;
        resolve();
    });
};

const ensureClientsReady = async (): Promise<void> => {
    const gapiPromise = new Promise<void>((resolve) => {
        if (window.gapi) initializeGapiClient().then(resolve);
        else loadScript(GAPI_SCRIPT_ID, 'https://apis.google.com/js/api.js', () => initializeGapiClient().then(resolve));
    });

    const gisPromise = new Promise<void>((resolve) => {
        if (window.google) initializeGisClient().then(resolve);
        else loadScript(GIS_SCRIPT_ID, 'https://accounts.google.com/gsi/client', () => initializeGisClient().then(resolve));
    });

    await Promise.all([gapiPromise, gisPromise]);
};

// --- Exported Functions ---
export const isDriveConfigured = (): boolean => !!getClientId();

export const isConnected = (): boolean => !!window.gapi?.client?.getToken() && !!driveFolder;

export const setFolder = (folder: DriveFolder) => {
    driveFolder = folder;
};

export const disconnect = () => {
    const token = window.gapi?.client?.getToken();
    if (token) {
        window.google?.accounts.oauth2.revoke(token.access_token, () => {});
    }
    window.gapi?.client?.setToken(null);
    driveFolder = null;
};

export const connectAndPickFolder = async (): Promise<DriveFolder | null> => {
    if (!isDriveConfigured()) {
        throw new Error('Google Drive Client ID is not configured.');
    }
    await ensureClientsReady();

    return new Promise((resolve, reject) => {
        const callback = async (tokenResponse: any) => {
            if (tokenResponse.error) {
                return reject(new Error(`Google Auth Error: ${tokenResponse.error}. Please check your OAuth Client ID configuration in the Google Cloud Console.`));
            }
            window.gapi.client.setToken(tokenResponse);

            try {
                const view = new window.google.picker.View(window.google.picker.ViewId.FOLDERS);
                view.setMimeTypes("application/vnd.google-apps.folder");
                const picker = new window.google.picker.PickerBuilder()
                    .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                    .setAppId(getClientId().split('.')[0]) // App ID is the numeric part before the first dot
                    .setOAuthToken(tokenResponse.access_token)
                    .addView(view)
                    .setDeveloperKey(PICKER_API_KEY)
                    .setCallback((data: any) => {
                        if (data.action === window.google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            const folder: DriveFolder = { id: doc.id, name: doc.name };
                            setFolder(folder);
                            resolve(folder);
                        } else if (data.action === window.google.picker.Action.CANCEL) {
                            // Don't reject, just resolve null for a cleaner UX
                            resolve(null);
                        }
                    })
                    .build();
                picker.setVisible(true);
            } catch (err: any) {
                 console.error("Error creating Google Picker:", err);
                 reject(new Error(`Failed to create file picker. This may be due to an invalid API Key or Picker API not being enabled. Error: ${err.message}`));
            }
        };
        
        // This pattern handles both initial login and token refresh
        tokenClient.callback = callback;
        if (window.gapi.client.getToken() === null) {
            // First time, user needs to see the consent screen
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // User is already logged in, just refresh token silently
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

export const listFiles = async (): Promise<gapi.client.drive.File[]> => {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    const response = await window.gapi.client.drive.files.list({
        q: `'${driveFolder!.id}' in parents and trashed = false`,
        fields: 'files(id, name, appProperties)',
        pageSize: 1000,
    });
    return response.result.files || [];
};

export const uploadFile = async (item: LibraryItem): Promise<string> => {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");

    const blob = await dataUrlToBlob(item.media);
    const { id, thumbnail, media, driveFileId, ...metadataToStore } = item;

    const extension = blob.type.split('/')[1] || 'bin';
    const filename = `${item.mediaType}_${item.id}.${extension}`;

    const metadata = {
        name: filename,
        mimeType: blob.type,
        parents: [driveFolder!.id],
        appProperties: {
            libraryItem: JSON.stringify(metadataToStore)
        }
    };
    
    const mediaFile = new File([blob], filename, { type: blob.type });

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', mediaFile);
    
    const token = window.gapi.client.getToken().access_token;
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': `Bearer ${token}` }),
        body: form,
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Google Drive upload failed: ${error.error.message}`);
    }
    
    const result = await response.json();
    return result.id;
};


export const downloadFile = async (fileId: string): Promise<{ metadata: LibraryItem | null, blob: Blob | null }> => {
    if (!window.gapi.client.getToken()) throw new Error("Not connected to Google Drive.");

    // First, get the metadata
    const metaResponse = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'appProperties, mimeType, name, id',
    });

    if (!metaResponse.result) {
        throw new Error(`File metadata not found for ID: ${fileId}`);
    }
    
    const appProperties = metaResponse.result.appProperties;
    let metadata: LibraryItem | null = null;
    if (appProperties && appProperties.libraryItem) {
        try {
            const parsedProps = JSON.parse(appProperties.libraryItem);
            const idTimestamp = parseInt(metaResponse.result.name?.split('_')[1]?.split('.')[0] || '0', 10);
            metadata = { ...parsedProps, id: idTimestamp };
        } catch (e) {
            console.error("Failed to parse appProperties from Drive file", e);
        }
    }

    // Then, get the file content
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` })
    });

    if (!fileResponse.ok) {
        throw new Error(`Failed to download file content for ID: ${fileId}`);
    }
    
    const blob = await fileResponse.blob();
    
    return { metadata, blob };
};
