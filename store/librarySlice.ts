import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { LibraryItem, LibrarySliceState } from '../types';
import * as idb from '../services/idbLibraryService';
import * as libraryService from '../services/libraryService';

export const fetchLibrary = createAsyncThunk('library/fetchLibrary', async () => {
    const items = await idb.getLibraryItems();
    return items;
});

export const addToLibrary = createAsyncThunk('library/addToLibrary', async (item: Omit<LibraryItem, 'id'>) => {
    // The service handles saving to IDB/Drive and returns the full item with an ID.
    const newItem = await libraryService.saveToLibrary(item); 
    return newItem;
});

export const deleteFromLibrary = createAsyncThunk('library/deleteFromLibrary', async (id: number) => {
    // The service handles deleting from IDB/Drive.
    await libraryService.deleteLibraryItem(id);
    return id; // Return the ID for the reducer to identify which item to remove.
});

export const clearLibraryItems = createAsyncThunk('library/clearLibrary', async () => {
    await libraryService.clearLibrary();
});


const initialState: LibrarySliceState = { 
    items: [], 
    status: 'idle', 
    error: null 
};

const librarySlice = createSlice({
    name: 'library',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchLibrary.pending, (state) => {
                state.status = 'loading';
            })
            .addCase(fetchLibrary.fulfilled, (state, action) => {
                state.status = 'succeeded';
                state.items = action.payload;
            })
            .addCase(fetchLibrary.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.error.message || 'Failed to fetch library';
            })
            .addCase(addToLibrary.fulfilled, (state, action: PayloadAction<LibraryItem>) => {
                // Add the new item to the beginning of the array to show the most recent first.
                state.items.unshift(action.payload);
            })
            .addCase(deleteFromLibrary.fulfilled, (state, action: PayloadAction<number>) => {
                state.items = state.items.filter(item => item.id !== action.payload);
            })
            .addCase(clearLibraryItems.fulfilled, (state) => {
                state.items = [];
                state.status = 'succeeded';
            });
    }
});

export default librarySlice.reducer;