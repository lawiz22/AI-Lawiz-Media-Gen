import { useSyncExternalStore } from 'react';

export interface GenerationJob { label: string; progress: number; message: string; status: 'pending' | 'done' | 'error'; src?: string }

// Per-output progress and live previews change many times per second. They live outside Redux and App
// so that only the result area re-renders, not every mounted tab.
const NONE: GenerationJob[] = [];
let jobs: Record<string, GenerationJob[]> = {};
let preview: Blob | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const getGenerationJobs = (key: string): GenerationJob[] => jobs[key] ?? NONE;
export const setGenerationJobs = (key: string, update: GenerationJob[] | ((current: GenerationJob[]) => GenerationJob[])): void => {
    const next = typeof update === 'function' ? update(getGenerationJobs(key)) : update;
    jobs = { ...jobs, [key]: next.length ? next : NONE };
    publish();
};
export const clearGenerationJobs = (): void => { jobs = {}; publish(); };
export const setGenerationPreview = (image: Blob | null): void => { preview = image; publish(); };

export const useGenerationJobs = (key: string): GenerationJob[] => useSyncExternalStore(subscribe, () => getGenerationJobs(key));
export const useHasGenerationJobs = (key: string): boolean => useSyncExternalStore(subscribe, () => getGenerationJobs(key).length > 0);
export const useGenerationPreview = (): Blob | null => useSyncExternalStore(subscribe, () => preview);
