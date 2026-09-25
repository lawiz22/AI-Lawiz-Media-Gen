import type { CSSProperties } from 'react';

export const createAccentStyle = (accent: string, light: string, hover: string): CSSProperties => ({
    '--color-accent': accent,
    '--color-accent-light': light,
    '--color-accent-lighter': light,
    '--color-accent-hover': hover,
} as CSSProperties);

export const TAB_ACCENT_STYLES: Record<string, CSSProperties> = {
    'image-generator': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    'character-generator': createAccentStyle('#e879f9', '#f0abfc', '#c026d3'),
    'ltx-director': createAccentStyle('#fbbf24', '#fcd34d', '#d97706'),
    tts: createAccentStyle('#34d399', '#6ee7b7', '#059669'),
    'prompt-generator': createAccentStyle('#a78bfa', '#c4b5fd', '#7c3aed'),
    'extractor-tools': createAccentStyle('#fb923c', '#fdba74', '#ea580c'),
    fun: createAccentStyle('#fb7185', '#fda4af', '#e11d48'),
    'logo-theme-generator': createAccentStyle('#f472b6', '#f9a8d4', '#db2777'),
    'video-utils': createAccentStyle('#38bdf8', '#7dd3fc', '#0284c7'),
    upscale: createAccentStyle('#a3e635', '#bef264', '#65a30d'),
    civitai: createAccentStyle('#2dd4bf', '#5eead4', '#0d9488'),
    library: createAccentStyle('#818cf8', '#a5b4fc', '#4f46e5'),
    admin: createAccentStyle('#f87171', '#fca5a5', '#dc2626'),
};

export const LIBRARY_CATEGORY_ACCENT_STYLES: Record<string, CSSProperties> = {
    image: TAB_ACCENT_STYLES['image-generator'],
    character: TAB_ACCENT_STYLES['character-generator'],
    'group-fusion': createAccentStyle('#fb7185', '#fda4af', '#e11d48'),
    'swap-anything': createAccentStyle('#f59e0b', '#fbbf24', '#d97706'),
    'past-forward-photo': createAccentStyle('#22d3ee', '#67e8f9', '#0891b2'),
    video: TAB_ACCENT_STYLES['ltx-director'],
    'audio-tts': TAB_ACCENT_STYLES.tts,
    'tts-reference': TAB_ACCENT_STYLES.tts,
    logo: TAB_ACCENT_STYLES['logo-theme-generator'],
    banner: TAB_ACCENT_STYLES['logo-theme-generator'],
    'album-cover': TAB_ACCENT_STYLES['logo-theme-generator'],
    clothes: TAB_ACCENT_STYLES['extractor-tools'],
    hair: TAB_ACCENT_STYLES['extractor-tools'],
    object: TAB_ACCENT_STYLES['extractor-tools'],
    pose: TAB_ACCENT_STYLES['extractor-tools'],
    font: TAB_ACCENT_STYLES['extractor-tools'],
    preset: TAB_ACCENT_STYLES.library,
    prompt: TAB_ACCENT_STYLES['prompt-generator'],
    'color-palette': TAB_ACCENT_STYLES['logo-theme-generator'],
    'extracted-frame': TAB_ACCENT_STYLES['video-utils'],
};

export const getTabAccentStyle = (tabId: string): CSSProperties =>
    TAB_ACCENT_STYLES[tabId] || TAB_ACCENT_STYLES.admin;