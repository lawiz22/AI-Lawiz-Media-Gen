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
const subfolderCache: Record<string, string> = {};


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

const getOrCreateSubfolder = async (name: string): Promise<string> => {
    if (subfolderCache[name]) {
        return subfolderCache[name];
    }
    if (!isConnected()) throw new Error("Not connected to Google Drive.");

    const query = `'${driveFolder!.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
    const listResponse = await window.gapi.client.drive.files.list({ q: query, fields: 'files(id)' });

    if (listResponse.result.files && listResponse.result.files.length > 0 && listResponse.result.files[0].id) {
        const folderId = listResponse.result.files[0].id;
        subfolderCache[name] = folderId;
        return folderId;
    }

    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [driveFolder!.id]
    };
    const createResponse = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    });

    const folderId = createResponse.result.id;
    if (!folderId) {
        throw new Error(`Failed to create subfolder '${name}' in Google Drive.`);
    }
    subfolderCache[name] = folderId;
    return folderId;
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
    // Clear subfolder cache on disconnect
    Object.keys(subfolderCache).forEach(key => delete subfolderCache[key]);
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
                const view = new window.google.picker.DocsView();
                view.setIncludeFolders(true);
                view.setSelectFolderEnabled(true);
                
                const picker = new window.google.picker.PickerBuilder()
                    .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
                    .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES)
                    .setAppId(getClientId().split('.')[0])
                    .setOAuthToken(tokenResponse.access_token)
                    .setDeveloperKey(PICKER_API_KEY)
                    .setOrigin(window.location.origin)
                    .addView(view)
                    .setCallback((data: any) => {
                        if (data.action === window.google.picker.Action.PICKED) {
                            const doc = data.docs[0];
                            if (doc.mimeType === "application/vnd.google-apps.folder") {
                                const folder: DriveFolder = { id: doc.id, name: doc.name };
                                setFolder(folder);
                                resolve(folder);
                            } else {
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

    const allFiles: gapi.client.drive.File[] = [];
    const subfolderNames = ['images', 'videos', 'clothes'];

    for (const name of subfolderNames) {
        try {
            const folderQuery = `'${driveFolder!.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
            const folderListResponse = await window.gapi.client.drive.files.list({ q: folderQuery, fields: 'files(id)' });
            
            if (folderListResponse.result.files && folderListResponse.result.files.length > 0) {
                const subfolderId = folderListResponse.result.files[0].id;
                if (subfolderId) {
                    const fileQuery = `'${subfolderId}' in parents and trashed = false`;
                    const fileListResponse = await window.gapi.client.drive.files.list({
                        q: fileQuery,
                        fields: 'files(id, name, appProperties)',
                        pageSize: 1000,
                    });
                    if (fileListResponse.result.files) {
                        allFiles.push(...fileListResponse.result.files);
                    }
                }
            }
        } catch (e) {
            console.error(`Could not list files for subfolder '${name}':`, e);
        }
    }
    
    return allFiles;
};

export const uploadFile = async (item: LibraryItem): Promise<string> => {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const blob = await dataUrlToBlob(item.media);
    const { id, thumbnail, media, driveFileId, ...metadataToStore } = item;
    
    const subfolderName = item.mediaType + 's'; // 'images', 'videos', 'clothes'
    const parentFolderId = await getOrCreateSubfolder(subfolderName);

    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
    const filename = `${item.mediaType}_${item.id}.${extension}`;

    const fileMetadata = {
        name: filename,
        mimeType: blob.type,
        parents: [parentFolderId],
        appProperties: { libraryItem: JSON.stringify(metadataToStore) }
    };

    const createResponse = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id'
    });

    const fileId = createResponse.result.id;
    if (!fileId) {
        throw new Error("Google Drive failed to create the file metadata entry.");
    }

    const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
            'Content-Type': blob.type
        },
        body: blob
    });

    if (!updateResponse.ok) {
        try {
            await window.gapi.client.drive.files.delete({ fileId });
        } catch (cleanupError) {
            console.error("Failed to clean up empty file after upload failure:", cleanupError);
        }
        const errorBody = await updateResponse.text();
        throw new Error(`Google Drive content upload failed: ${updateResponse.statusText} - ${errorBody}`);
    }

    return fileId;
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