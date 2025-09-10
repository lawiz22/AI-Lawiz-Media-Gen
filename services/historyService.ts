import type { HistoryItem } from '../types';

const HISTORY_STORAGE_KEY = 'generation_history';
const MAX_HISTORY_ITEMS = 50;

/**
 * Retrieves the generation history from localStorage.
 */
export const getHistory = (): HistoryItem[] => {
  const historyJson = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!historyJson) {
    return [];
  }
  try {
    const history: HistoryItem[] = JSON.parse(historyJson);
    // Sort by most recent first
    return history.sort((a, b) => b.id - a.id);
  } catch (e) {
    console.error("Failed to parse history from localStorage", e);
    return [];
  }
};

/**
 * Saves a new generation to the history in localStorage.
 */
export const saveGenerationToHistory = (item: Omit<HistoryItem, 'id'>): void => {
  try {
    const history = getHistory();
    const newHistoryItem: HistoryItem = {
      ...item,
      id: Date.now() // Use timestamp as a unique ID
    };
    
    // Add new item to the front and limit the total number of items
    const updatedHistory = [newHistoryItem, ...history].slice(0, MAX_HISTORY_ITEMS);
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
  } catch (e) {
    console.error("Failed to save generation to history", e);
  }
};

/**
 * Deletes a specific history item by its ID.
 */
export const deleteHistoryItem = (id: number): void => {
  try {
    let history = getHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to delete history item", e);
  }
};

/**
 * Clears the entire generation history from localStorage.
 */
export const clearHistory = (): void => {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear history", e);
  }
};