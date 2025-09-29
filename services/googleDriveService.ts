// Fix: Add global declarations for Google API scripts to resolve TypeScript errors.
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

import type { LibraryItem, DriveFolder } from '../types';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';
const PICKER_API_KEY = process.env.API_KEY!;
const LIBRARY_FILENAME = 'library.json';

let tokenClient: any = null;
let driveFolder: DriveFolder | null = null;
let gapiInitializationPromise: Promise<void> | null = null;
let gisInitializationPromise: Promise<void> | null = null;
const subfolderCache: Record<string, string> = {};

type LibraryItemMetadata = Omit<LibraryItem, 'media' | 'thumbnail'> | LibraryItem;
type LibraryIndex = { version: number; items: Record<string, LibraryItemMetadata> };

const getClientId = (): string => localStorage.getItem('google_client_id') || '';

const initializeGapiClient = (): Promise<void> => {
    if (!gapiInitializationPromise) {
        gapiInitializationPromise = new Promise((resolve, reject) => {
            const checkGapi = () => {
                if (window.gapi) {
                    window.gapi.load('client:picker', () => {
                        window.gapi.client.init({
                            apiKey: PICKER_API_KEY,
                            discoveryDocs: [DISCOVERY_DOC],
                        }).then(resolve).catch((err: any) => {
                            console.error("Error initializing GAPI client modules.", err);
                            gapiInitializationPromise = null;
                            reject(new Error("Failed to initialize Google API client. Check API Key and enabled APIs."));
                        });
                    });
                } else {
                    setTimeout(checkGapi, 100);
                }
            };
            checkGapi();
        });
    }
    return gapiInitializationPromise;
};

const initializeGisClient = (): Promise<void> => {
    if (!gisInitializationPromise) {
        gisInitializationPromise = new Promise((resolve) => {
            const checkGis = () => {
                if (window.google && window.google.accounts) {
                    const clientId = getClientId();
                    if (!clientId) {
                        console.warn("Cannot initialize GIS client: Google Client ID is not configured.");
                        resolve(); 
                        return;
                    }
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: SCOPES,
                        callback: '',
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

export const isDriveConfigured = (): boolean => !!getClientId();
export const isConnected = (): boolean => !!window.gapi?.client?.getToken() && !!driveFolder;
export const setFolder = (folder: DriveFolder) => { driveFolder = folder; };

export const restoreConnection = async (): Promise<boolean> => {
    if (!isDriveConfigured()) return false;
    await ensureClientsReady();
    if (!tokenClient) return false;

    return new Promise((resolve) => {
        if (window.gapi.client.getToken() !== null) {
            resolve(true);
            return;
        }
        tokenClient.callback = (tokenResponse: any) => {
            if (tokenResponse && !tokenResponse.error) {
                window.gapi.client.setToken(tokenResponse);
                resolve(true);
            } else {
                resolve(false);
            }
        };
        tokenClient.requestAccessToken({ prompt: 'none' });
    });
};

export const disconnect = () => {
    const token = window.gapi?.client?.getToken();
    if (token) {
        window.google?.accounts.oauth2.revoke(token.access_token, () => {});
    }
    if (window.gapi?.client) {
        window.gapi.client.setToken(null);
    }
    driveFolder = null;
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

export const getOrCreateSubfolder = async (name: string): Promise<string> => {
    if (subfolderCache[name]) {
        return subfolderCache[name];
    }
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

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

export async function getLibraryIndex(): Promise<{ index: LibraryIndex; fileId: string | null }> {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const query = `'${driveFolder!.id}' in parents and name = '${LIBRARY_FILENAME}' and trashed = false`;
    const listResponse = await window.gapi.client.drive.files.list({ q: query, fields: 'files(id)' });
    
    const file = listResponse.result.files?.[0];

    if (file?.id) {
        const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` }
        });
        if (!fileResponse.ok) throw new Error("Could not download library index from Google Drive.");
        
        const textContent = await fileResponse.text();
        if (!textContent.trim()) {
            return { index: { version: 1, items: {} }, fileId: file.id };
        }
        try {
            const index = JSON.parse(textContent);
            if (typeof index.version !== 'number' || typeof index.items !== 'object' || index.items === null) {
                throw new Error("Parsed JSON does not match expected LibraryIndex structure.");
            }
            return { index, fileId: file.id };
        } catch (e) {
             console.error("Failed to parse library.json from Drive. It is likely corrupted.", e);
             throw new Error("Failed to parse library.json from Google Drive. The file may be corrupted. Please resolve the issue on Google Drive or disconnect and reconnect to create a new one.");
        }
    }

    return { index: { version: 1, items: {} }, fileId: null };
}

export async function updateLibraryIndex(index: LibraryIndex, fileId: string | null): Promise<string> {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();
    
    const blob = new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' });
    let idToUpdate = fileId;

    if (!idToUpdate) {
        const fileMetadata = {
            name: LIBRARY_FILENAME,
            mimeType: 'application/json',
            parents: [driveFolder!.id]
        };
        const createResponse = await window.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        idToUpdate = createResponse.result.id;
        if (!idToUpdate) {
            throw new Error(`Google Drive: Failed to create empty library index file.`);
        }
    }

    const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${idToUpdate}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
            'Content-Type': 'application/json',
        },
        body: blob
    });
    if (!updateResponse.ok) {
        const errorBody = await updateResponse.text();
        throw new Error(`Google Drive: Failed to upload content to library index (ID: ${idToUpdate}). Body: ${errorBody}`);
    }
    
    const result = await updateResponse.json();
    return result.id;
}

export async function uploadMediaFile(blob: Blob, filename: string, parentFolderId: string): Promise<string> {
    if (!isConnected()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const fileMetadata = {
        name: filename,
        mimeType: blob.type,
        parents: [parentFolderId]
    };

    const initResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${window.gapi.client.getToken().access_token}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(fileMetadata),
    });

    if (!initResponse.ok) {
        throw new Error(`Google Drive: Failed to initiate media upload. Status: ${initResponse.statusText}`);
    }
    const location = initResponse.headers.get('Location');
    if (!location) {
        throw new Error('Google Drive: Did not receive a session URI for resumable upload.');
    }

    const uploadResponse = await fetch(location, { method: 'PUT', body: blob });

    if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.text();
        throw new Error(`Google Drive: Media upload failed. Status: ${uploadResponse.statusText}. Body: ${errorBody}`);
    }

    const finalFile = await uploadResponse.json();
    if (!finalFile.id) {
        throw new Error('Google Drive: Upload succeeded but did not return a file ID.');
    }
    return finalFile.id;
};

export const downloadMediaFile = async (fileId: string): Promise<Blob> => {
    if (!window.gapi.client.getToken()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${window.gapi.client.getToken().access_token}` }
    });
    if (!fileResponse.ok) throw new Error(`Failed to download file content for ID: ${fileId}. Status: ${fileResponse.statusText}`);
    
    return fileResponse.blob();
};

export const deleteMediaFile = async (fileId: string): Promise<void> => {
    if (!window.gapi.client.getToken()) throw new Error("Not connected to Google Drive.");
    await ensureClientsReady();

    await window.gapi.client.drive.files.delete({
        fileId: fileId
    });
};