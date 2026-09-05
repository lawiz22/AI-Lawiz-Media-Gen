
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { LibraryItem, LibrarySliceState } from '../types';
import * as idb from '../services/idbLibraryService';
import * as libraryService from '../services/libraryService';
import { createVideoPlaceholderThumbnail, videoToThumbnail } from '../utils/imageUtils';

export const fetchLibrary = createAsyncThunk('library/fetchLibrary', async (_, thunkAPI) => {
    try {
        const items = await idb.getLibraryItems();
        const placeholder = createVideoPlaceholderThumbnail();
        for (const item of items) {
            if (!item.ltxDirectorOptions || (item.thumbnail && item.thumbnail !== placeholder) || !item.media) continue;
            try {
                const thumbnail = await videoToThumbnail(item.media, 256);
                item.thumbnail = thumbnail;
                await idb.updateLibraryItem(item.id, { thumbnail });
            } catch (error) {
                console.warn(`Could not repair the thumbnail for LTX video ${item.id}.`, error);
            }
        }
        return items;
    } catch (err: any) {
        return thunkAPI.rejectWithValue(err.message || "Unknown library error");
    }
});

export const addToLibrary = createAsyncThunk('library/addToLibrary', async (item: Omit<LibraryItem, 'id'>, thunkAPI) => {
    try {
        const newItem = await libraryService.saveToLibrary(item); 
        return newItem;
    } catch (err: any) {
        return thunkAPI.rejectWithValue(err.message);
    }
});

export const importLibraryItems = createAsyncThunk('library/importLibraryItems', async (items: LibraryItem[], thunkAPI) => {
    try {
        await libraryService.bulkSaveToLibrary(items);
    } catch (err: any) {
        return thunkAPI.rejectWithValue(err.message);
    }
});

export const deleteFromLibrary = createAsyncThunk('library/deleteFromLibrary', async (id: number, thunkAPI) => {
    try {
        await libraryService.deleteLibraryItem(id);
        return id;
    } catch (err: any) {
        return thunkAPI.rejectWithValue(err.message);
    }
});

export const clearLibraryItems = createAsyncThunk('library/clearLibrary', async (_, thunkAPI) => {
    try {
        await libraryService.clearLibrary();
    } catch (err: any) {
        return thunkAPI.rejectWithValue(err.message);
    }
});


const initialState: LibrarySliceState = { 
    items: [], 
    status: 'idle', 
    error: null 
};

const librarySlice = createSlice({
    name: 'library',
    initialState,
    reducers: {
        unloadLibrary: (state) => {
            state.items = [];
            state.status = 'idle';
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchLibrary.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchLibrary.fulfilled, (state, action) => {
                if (state.status !== 'loading') return;
                state.status = 'succeeded';
                state.items = action.payload;
                state.error = null;
            })
            .addCase(fetchLibrary.rejected, (state, action) => {
                if (state.status !== 'loading') return;
                state.status = 'failed';
                state.error = action.payload as string || 'Failed to fetch library';
            })
            .addCase(addToLibrary.fulfilled, (state, action: PayloadAction<LibraryItem>) => {
                state.items.unshift(action.payload);
                state.error = null;
                 state.status = 'succeeded';
            })
            .addCase(addToLibrary.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string || 'Failed to add item to library';
            })
            .addCase(deleteFromLibrary.fulfilled, (state, action: PayloadAction<number>) => {
                state.items = state.items.filter(item => item.id !== action.payload);
                state.error = null;
                 state.status = 'succeeded';
            })
            .addCase(deleteFromLibrary.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string || 'Failed to delete item';
            })
            .addCase(clearLibraryItems.fulfilled, (state) => {
                state.items = [];
                state.status = 'succeeded';
                state.error = null;
            })
            .addCase(clearLibraryItems.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string || 'Failed to clear library';
            })
            .addCase(importLibraryItems.fulfilled, (state) => {
                state.status = 'succeeded'; // The component will trigger a fetch, no need to change items here
                state.error = null;
            })
            .addCase(importLibraryItems.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload as string || 'Failed to import library';
            });
    }
});

export const { unloadLibrary } = librarySlice.actions;
export default librarySlice.reducer;
