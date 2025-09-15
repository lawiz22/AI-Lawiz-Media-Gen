
import type { LibraryItem, DriveFolder } from '../types';
import { dataUrlToBlob } from '../utils/imageUtils';

// --- Constants ---
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';
const PICKER_API_KEY = process.env.API_KEY!;

// --- Module-level State ---
let tokenClient: any = null;
let driveFolder: DriveFolder | null = null;
let gapiInitializationPromise: Promise<void> | null = null;
let gisInitializationPromise: Promise<void> | null = null;

// --- Helper Functions ---
const getClientId = (): string => localStorage.getItem('google_client_id') || '';

// This function ensures the GAPI client (for Drive and Picker) is loaded and initialized.
// It's designed to be called multiple times but will only execute the initialization once.
const initializeGapiClient = (): Promise<void> => {
    if (!gapiInitializationPromise) {
        gapiInitializationPromise = new Promise((resolve, reject) => {
            // Wait for the gapi script to be loaded by index.html
            const checkGapi = () => {
                if (window.gapi) {
                    // gapi is available, now load the specific 'client' and 'picker' modules.
                    window.gapi.load('client:picker', () => {
                        window.gapi.client.init({
                            apiKey: PICKER_API_KEY,
                            discoveryDocs: [DISCOVERY_DOC],
                        }).then(resolve).catch((err: any) => {
                            console.error("Error initializing GAPI client modules.", err);
                            gapiInitializationPromise = null; // Allow retry
                            reject(new Error("Failed to initialize Google API client. Check API Key and enabled APIs."));
                        });
                    });
                } else {
                    // If gapi isn't on window yet, wait a bit and try again.
                    setTimeout(checkGapi, 100);
                }
            };
            checkGapi();
        });
    }
    return gapiInitializationPromise;
};

// This function ensures the GIS client (for authentication) is loaded and initialized.
const initializeGisClient = (): Promise<void> => {
    if (!gisInitializationPromise) {
        gisInitializationPromise = new Promise((resolve) => {
            const checkGis = () => {
                if (window.google && window.google.accounts) {
                    const clientId = getClientId();
                    if (!clientId) {
                        console.warn("Cannot initialize GIS client: Google Client ID is not configured.");
                        // Resolve anyway so the app doesn't hang, checks later will prevent usage.
                        resolve(); 
                        return;
                    }
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: SCOPES,
                        callback: '', // Callback is handled dynamically by the promise in connectAndPickFolder
                    });
                    resolve();
                } else {
                    setTimeout(checkGis, 100);
                }
            };
            checkGis();
        });
    }
    return gisInitializationPromise;
};

const ensureClientsReady = async (): Promise<void> => {
    await Promise.all([initializeGapiClient(), initializeGisClient()]);
};

// --- Exported Functions ---
export const isDriveConfigured = (): boolean => !!getClientId();
export const isConnected = (): boolean => !!window.gapi?.client?.getToken() && !!driveFolder;
export const setFolder = (folder: DriveFolder) => { driveFolder = folder; };

export const disconnect = () => {
    const token = window.gapi?.client?.getToken();
    if (token) {
        window.google?.accounts.oauth2.revoke(token.access_token, () => {});
    }
    if (window.gapi?.client) {
        window.gapi.client.setToken(null);
    }
    driveFolder = null;
};

export const connectAndPickFolder = async (): Promise<DriveFolder | null> => {
    if (!isDriveConfigured()) throw new Error('Google Drive Client ID is not configured.');
    if (!PICKER_API_KEY) throw new Error('Google API Key is not configured in the environment.');
    
    await ensureClientsReady();
    if (!tokenClient) throw new Error("Google Identity Service client not initialized. Check Client ID setting.");

    return new Promise((resolve, reject) => {
        const tokenCallback = async (tokenResponse: any) => {
            if (tokenResponse.error) {
                return reject(new Error(`Google Auth Error: ${tokenResponse.error}. Check your OAuth Client ID settings.`));
            }
            window.gapi.client.setToken(tokenResponse);

            try {
                // Use a more robust view configuration specifically for folder selection.
                const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
                view.setIncludeFolders(true);
                view.setSelectFolderEnabled(true);

                const picker = new window.google.picker.PickerBuilder()
                    .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                    .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES) // Add support for Shared Drives
                    .setAppId(getClientId().split('.')[0])
                    .setOAuthToken(tokenResponse.access_token)
                    .addView(view)
                    // setSelectableMimeTypes is not needed when setSelectFolderEnabled is true
                    .setDeveloperKey(PICKER_API_KEY)
                    .setOrigin(window.location.origin)
                    .setCallback((data: any) => {
                        if (data.action === window.google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            // Ensure a folder was actually selected
                            if (doc.mimeType === "application/vnd.google-apps.folder") {
                                const folder: DriveFolder = { id: doc.id, name: doc.name };
                                setFolder(folder);
                                resolve(folder);
                            } else {
                                // This shouldn't happen with our view config, but handle it just in case.
                                reject(new Error("Selection was not a folder. Please select a folder."));
                            }
                        } else if (data.action === window.google.picker.Action.CANCEL) {
                            resolve(null);
                        }
                    })
                    .build();
                picker.setVisible(true);
            } catch (err: any) {
                 console.error("Error creating Google Picker:", err);
                 reject(new Error(`Failed to create file picker. Check API Key restrictions and ensure Picker API is enabled. Error: ${err.message}`));
            }
        };
        
        tokenClient.callback = tokenCallback;
        if (window.gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

export const listFiles = async (): Promise<gapi.client.drive.File[]> => {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();
    const response = await window.gapi.client.drive.files.list({
        q: `'${driveFolder!.id}' in parents and trashed = false`,
        fields: 'files(id, name, appProperties)',
        pageSize: 1000,
    });
    return response.result.files || [];
};

export const uploadFile = async (item: LibraryItem): Promise<string> => {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const blob = await dataUrlToBlob(item.media);
    const { id, thumbnail, media, driveFileId, ...metadataToStore } = item;
    const extension = blob.type.split('/')[1] || 'bin';
    const filename = `${item.mediaType}_${item.id}.${extension}`;

    const metadata = {
        name: filename,
        mimeType: blob.type,
        parents: [driveFolder!.id],
        appProperties: { libraryItem: JSON.stringify(metadataToStore) }
    };

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
        xhr.setRequestHeader('Authorization', `Bearer ${window.gapi.client.getToken().access_token}`);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText).id);
            } else {
                reject(new Error(`Google Drive upload failed: ${xhr.responseText}`));
            }
        };
        xhr.onerror = () => reject(new Error('Network error during Google Drive upload.'));

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', blob, filename);
        xhr.send(formData);
    });
};

export const downloadFile = async (fileId: string): Promise<{ metadata: LibraryItem | null, blob: Blob | null }> => {
    if (!window.gapi.client.getToken()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const metaResponse = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'appProperties, mimeType, name, id',
    });

    if (!metaResponse.result) throw new Error(`File metadata not found for ID: ${fileId}`);
    
    let metadata: LibraryItem | null = null;
    if (metaResponse.result.appProperties?.libraryItem) {
        try {
            const parsedProps = JSON.parse(metaResponse.result.appProperties.libraryItem);
            const idTimestamp = parseInt(metaResponse.result.name?.split('_')[1]?.split('.')[0] || '0', 10);
            metadata = { ...parsedProps, id: idTimestamp > 0 ? idTimestamp : Date.now() };
        } catch (e) {
            console.error("Failed to parse appProperties from Drive file", e);
        }
    }

    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` }
    });

    if (!fileResponse.ok) throw new Error(`Failed to download file content for ID: ${fileId}`);
    
    return { metadata, blob: await fileResponse.blob() };
};
