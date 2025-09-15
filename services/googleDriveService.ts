
import type { LibraryItem, DriveFolder } from '../types';
import { dataUrlToBlob } from '../utils/imageUtils';

const getApiKey = (): string => {
    const key = process.env.API_KEY;
    if (!key) {
        throw new Error("Google AI API Key is not configured in the environment. This is required for Google Picker.");
    }
    return key;
};

const getGoogleClientId = (): string | null => {
    return localStorage.getItem('google_client_id');
}

export const isDriveConfigured = (): boolean => {
    return !!getGoogleClientId();
};


const SCOPES = 'https://www.googleapis.com/auth/drive';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Defined a type for the gapi.client.drive.File object to resolve TypeScript errors.
interface GapiDriveFile {
    id?: string | null;
    name?: string | null;
    appProperties?: { [key: string]: string; } | null;
}

let tokenClient: any = null;
let initPromise: Promise<void> | null = null; // Use a promise to prevent re-initialization
let currentFolder: DriveFolder | null = null;
let accessToken: any = null;
let subfolderCache: Record<string, string> = {}; // Cache for subfolder IDs

export const initClients = (): Promise<void> => {
    const clientId = getGoogleClientId();
    if (!clientId) {
        return Promise.reject(new Error("Google Client ID is not configured. Please set it in the Connection Settings."));
    }
    
    if (initPromise) {
        return initPromise;
    }

    initPromise = new Promise<void>(async (resolve, reject) => {
        try {
            // 1. Wait for the main GAPI and GIS scripts to be loaded from index.html
            await Promise.all([
                new Promise<void>(res => window.gapiLoaded ? res() : window.addEventListener('gapiLoaded', () => res(), { once: true })),
                new Promise<void>(res => window.gisLoaded ? res() : window.addEventListener('gisLoaded', () => res(), { once: true }))
            ]);

            // 2. Load the GAPI client and picker libraries together. All dependent initialization happens inside the async callback.
            window.gapi.load('client:picker', async () => {
                try {
                    // The old gapi.client.init is deprecated. The new method is to first
                    // load the discovery document. Authentication for Drive API calls will be
                    // handled by the OAuth token set via gapi.client.setToken(), not a global API key.
                    await window.gapi.client.load(DISCOVERY_DOC);
                    
                    // 4. Now that the client is ready, set up the auth token client.
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: SCOPES,
                        callback: (tokenResponse: any) => {
                            accessToken = tokenResponse;
                            if (tokenResponse && tokenResponse.access_token) {
                                window.gapi.client.setToken(tokenResponse);
                            }
                        },
                    });
                    
                    resolve(); // Initialization is complete.

                } catch (err: any) {
                    const errorMessage = err.result?.error?.message || err.details || err.message || 'Failed to initialize gapi client.';
                    console.error("Error during gapi client setup:", err);
                    // Reject the outer promise
                    reject(new Error(`Drive Init Error: ${errorMessage}`));
                }
            });

        } catch (err: any) {
            initPromise = null; // Allow retry on failure
            const errorMessage = err.details || err.message || 'An unknown error occurred.';
            console.error("Error during Google Drive client initialization setup:", err);
            reject(new Error(`Drive Init Error: ${errorMessage}`));
        }
    });

    // Catch potential rejections and reset the promise so retries are possible
    initPromise.catch((e) => {
        console.error("Caught error in Google Drive init promise chain, allowing retry.", e);
        initPromise = null;
    });

    return initPromise;
};

const requestAccessToken = () => {
    return new Promise<void>((resolve, reject) => {
        if (!tokenClient) {
            return reject(new Error("Token client not initialized."));
        }

        const originalCallback = tokenClient.callback;
        // Override the callback for this specific request to handle its resolution
        tokenClient.callback = (resp: any) => {
            tokenClient.callback = originalCallback; // Restore original callback

            if (resp.error !== undefined) {
                const errorDetails = resp.error_description || resp.error || "Unknown authentication error.";
                if (resp.error === 'popup_closed_by_user') {
                    return reject(new Error("User cancelled authentication."));
                }
                return reject(new Error(`Google Auth Error: ${errorDetails}`));
            }

            accessToken = resp;
            // This is crucial for gapi.client to work for subsequent API calls
            window.gapi.client.setToken(resp); 
            resolve();
        };

        // If we have no token, we must ask for consent which shows the popup.
        // Otherwise, a silent request is attempted.
        if (accessToken === null) {
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            tokenClient.requestAccessToken({ prompt: '' });
        }
    });
};

const showPicker = (): Promise<DriveFolder> => {
    const clientId = getGoogleClientId();
    if (!clientId) {
        return Promise.reject(new Error("Google Client ID not configured."));
    }
    const API_KEY = getApiKey();

    return new Promise((resolve, reject) => {
        // Create a DocsView that is specifically configured for folder selection.
        const docsView = new window.google.picker.DocsView()
            .setIncludeFolders(true) // Show folders
            .setMimeTypes("application/vnd.google-apps.folder") // Only show folders
            .setSelectFolderEnabled(true); // *** This is the key: enable selecting a folder.

        const picker = new window.google.picker.PickerBuilder()
            .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
            .enableFeature(window.google.picker.Feature.SUPPORT_DRIVES) // Enable shared drives
            .setAppId(clientId.split('-')[0])
            .setOAuthToken(accessToken.access_token)
            .setDeveloperKey(API_KEY)
            .setCallback((data: any) => {
                if (data.action === 'picked' && data.docs && data.docs.length > 0) {
                    const folder = { id: data.docs[0].id, name: data.docs[0].name };
                    resolve(folder);
                } else if (data.action === 'cancel') {
                    reject(new Error("User cancelled folder selection."));
                }
            })
            .addView(docsView) // Use the configured DocsView
            .setTitle('Select your Library Folder')
            .build();
        picker.setVisible(true);
    });
};

export const connectAndPickFolder = async (): Promise<DriveFolder | null> => {
    try {
        await initClients();
    } catch (err: any) {
        console.error("Drive Connection Error:", err);
        throw new Error(`Drive Connection Error: ${err.message}`);
    }

    await requestAccessToken();
    
    const folder = await showPicker();
    setFolder(folder);
    subfolderCache = {}; // Reset cache when picking a new folder
    return folder;
};

export const disconnect = () => {
    accessToken = null;
    currentFolder = null;
    subfolderCache = {};
};

export const setFolder = (folder: DriveFolder) => {
    currentFolder = folder;
};

export const isConnected = (): boolean => !!accessToken && !!currentFolder;

const getOrCreateFolder = async (name: string, parentId: string): Promise<string> => {
    if (subfolderCache[name]) {
        return subfolderCache[name];
    }

    const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
    const listResponse = await window.gapi.client.drive.files.list({ q, fields: 'files(id)' });
    
    if (listResponse.result.files && listResponse.result.files.length > 0 && listResponse.result.files[0].id) {
        const folderId = listResponse.result.files[0].id;
        subfolderCache[name] = folderId;
        return folderId;
    }

    const fileMetadata = {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
    };
    const createResponse = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    
    if (!createResponse.result.id) {
        throw new Error(`Failed to create folder "${name}"`);
    }
    const folderId = createResponse.result.id;
    subfolderCache[name] = folderId;
    return folderId;
};


export const uploadFile = async (item: LibraryItem): Promise<string | null> => {
    if (!isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }
    
    const subfolderName = item.mediaType === 'image' ? 'images' : item.mediaType === 'video' ? 'videos' : 'clothes';
    const parentFolderId = await getOrCreateFolder(subfolderName, currentFolder!.id);

    const blob = await dataUrlToBlob(item.media);
    const extension = item.mediaType === 'image' ? 'jpg' : item.mediaType === 'video' ? 'mp4' : 'png';
    const filename = `lawiz_ai_${item.mediaType}_${item.id}.${extension}`;

    const metadataToStore = { ...item };
    delete (metadataToStore as any).media;
    delete (metadataToStore as any).thumbnail;
    
    const fileMetadata = {
        name: filename,
        mimeType: blob.type,
        parents: [parentFolderId],
        appProperties: {
            libraryItem: JSON.stringify(metadataToStore)
        }
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken.access_token }),
        body: form,
    });
    
    if (!res.ok) {
        const errorBody = await res.json();
        console.error("Google Drive Upload Error:", errorBody);
        throw new Error(`Failed to upload to Google Drive: ${errorBody.error.message}`);
    }

    const body = await res.json();
    return body.id;
};


export const listFiles = async (): Promise<GapiDriveFile[]> => {
    if (!isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    const imageFolderId = await getOrCreateFolder('images', currentFolder!.id);
    const videoFolderId = await getOrCreateFolder('videos', currentFolder!.id);
    const clothesFolderId = await getOrCreateFolder('clothes', currentFolder!.id);
    
    const parentIds = [imageFolderId, videoFolderId, clothesFolderId];
    
    const q = `(${parentIds.map(id => `'${id}' in parents`).join(' or ')}) and trashed = false`;

    const response = await window.gapi.client.drive.files.list({
        q: q,
        fields: 'files(id, name, appProperties)',
        pageSize: 1000,
    });
    return response.result.files || [];
};

export const downloadFile = async (fileId: string): Promise<{metadata: LibraryItem | null, blob: Blob | null}> => {
    if (!isConnected()) {
        throw new Error("Not connected to Google Drive.");
    }

    // First, get the metadata
    const metaResponse = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'id, name, appProperties'
    });
    
    const appProperties = metaResponse.result.appProperties;
    let metadata: LibraryItem | null = null;
    if (appProperties && appProperties.libraryItem) {
        try {
            metadata = JSON.parse(appProperties.libraryItem);
        } catch (e) {
            console.error("Failed to parse metadata from Drive file:", e);
        }
    }

    // Then, download the file content
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken.access_token })
    });
    
    if (!fileResponse.ok) {
        throw new Error(`Failed to download file content for ID ${fileId}`);
    }
    const blob = await fileResponse.blob();

    return { metadata, blob };
};
