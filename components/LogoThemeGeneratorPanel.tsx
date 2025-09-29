import React, { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store/store';
import { setLogoSaveStatus, setBannerSaveStatus, setAlbumCoverSaveStatus, updateLogoThemeState } from '../store/logoThemeSlice';
import { addToLibrary } from '../store/librarySlice';
import type { LogoThemeState, LibraryItem, LogoStyle, LogoBackground, PaletteColor, BannerStyle, BannerLogoPlacement, BannerAspectRatio, MusicStyle, AlbumEra, AlbumMediaType, ThemeGenerationInfo } from '../types';
import { GenerateIcon, ResetIcon, SpinnerIcon, LibraryIcon, CloseIcon, SaveIcon, CheckIcon, DownloadIcon, UploadIconSimple, ChevronLeftIcon, ChevronRightIcon, ZoomIcon } from './icons';
import { generateLogos, generateBanners, generateAlbumCovers } from '../services/geminiService';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { BANNER_ASPECT_RATIO_OPTIONS, BANNER_STYLE_OPTIONS, BANNER_LOGO_PLACEMENT_OPTIONS } from '../constants';

const sanitizeForFilename = (text: string, maxLength: number = 40): string => {
    if (!text) return '';
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/__+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, maxLength);
};

interface LogoThemeGeneratorPanelProps {
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
    onOpenLibraryForReferences: () => void;
    onOpenLibraryForPalette: () => void;
    onOpenLibraryForFont: () => void;
    onOpenLibraryForBannerReferences: () => void;
    onOpenLibraryForBannerPalette: () => void;
    onOpenLibraryForBannerLogo: () => void;
    onOpenLibraryForBannerFont: () => void;
    onOpenLibraryForAlbumCoverReferences: () => void;
    onOpenLibraryForAlbumCoverPalette: () => void;
    onOpenLibraryForAlbumCoverLogo: () => void;
    onOpenLibraryForAlbumCoverFont: () => void;
}

const Section: React.FC<{ title: string; description: string; borderColor: string; children: React.ReactNode }> = ({ title, description, borderColor, children }) => (
    <div className={`bg-bg-primary/50 p-6 rounded-lg border-l-4`} style={{ borderColor }}>
        <h2 className="text-2xl font-bold mb-2" style={{ color: borderColor }}>{title}</h2>
        <p className="text-sm text-text-secondary mb-6">{description}</p>
        <div className="space-y-4">
            {children}
        </div>
    </div>
);

interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  tabs: SubTab[];
  activeTab: string;
  onTabClick: (id: string) => void;
}

const SubTabs: React.FC<SubTabsProps> = ({ tabs, activeTab, onTabClick }) => (
    <div className="flex items-center border-b-2 border-border-primary mb-8 -mt-2">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabClick(tab.id)}
                className={`px-4 py-2 text-sm font-semibold transition-colors duration-200 border-b-2 ${
                    activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);


const LOGO_STYLES: { id: LogoStyle; label: string; description: string }[] = [
    { id: 'symbolic', label: 'Symbolic / Iconic', description: 'A simple, memorable icon or symbol.' },
    { id: 'wordmark', label: 'Wordmark', description: 'A typography-focused design of the brand name.' },
    { id: 'emblem', label: 'Emblem', description: 'Text integrated within a symbol or badge.' },
    { id: 'abstract', label: 'Abstract', description: 'A unique, non-representational geometric shape.' },
    { id: 'combination', label: 'Combination', description: 'An icon paired with a wordmark.' },
    { id: 'pixel-art', label: 'Pixel Art', description: '8-bit retro video game style.' },
    { id: 'vaporwave', label: 'Vaporwave', description: 'Neon, retro-futuristic 80s/90s aesthetic.' },
    { id: 'grunge', label: 'Grunge', description: 'Distressed, textured, and edgy look.' },
    { id: 'vintage-badge', label: 'Vintage Badge', description: 'Classic circular or shaped badge design.' },
    { id: '3d-clay', label: '3D Clay', description: 'Playful, soft, 3D claymation effect.' },
    { id: 'hand-drawn', label: 'Hand-Drawn', description: 'Organic, sketchy, and artistic feel.' },
    { id: 'geometric', label: 'Geometric', description: 'Made of clean lines and basic shapes.' },
];

const BACKGROUND_OPTIONS: { id: LogoBackground; label: string }[] = [
    { id: 'transparent', label: 'Transparent' },
    { id: 'white', label: 'White' },
    { id: 'black', label: 'Black' },
];

const MUSIC_STYLES: { id: MusicStyle, label: string }[] = [
    { id: 'rock', label: 'Rock' },
    { id: 'pop', label: 'Pop' },
    { id: 'electronic', label: 'Electronic' },
    { id: 'jazz', label: 'Jazz' },
    { id: 'hip-hop', label: 'Hip-Hop' },
    { id: 'country', label: 'Country' },
    { id: 'folk', label: 'Folk' },
    { id: 'metal', label: 'Metal' },
    { id: 'classical', label: 'Classical' },
    { id: 'other', label: 'Other' },
];

const ALBUM_ERAS: { id: AlbumEra, label: string }[] = [
    { id: 'modern', label: 'Modern' },
    { id: '2000s', label: '2000s' },
    { id: '90s', label: '90s' },
    { id: '80s', label: '80s' },
    { id: '70s', label: '70s' },
    { id: '60s', label: '60s' },
    { id: '50s', label: '50s' },
];

const ALBUM_MEDIA_TYPES: { id: AlbumMediaType, label: string }[] = [
    { id: 'digital', label: 'Digital' },
    { id: 'vinyl', label: 'Vinyl Sleeve' },
    { id: 'cd', label: 'CD Booklet' },
];


export const LogoThemeGeneratorPanel: React.FC<LogoThemeGeneratorPanelProps> = ({ 
    activeSubTab, setActiveSubTab, 
    onOpenLibraryForReferences, onOpenLibraryForPalette, onOpenLibraryForFont,
    onOpenLibraryForBannerReferences, onOpenLibraryForBannerPalette, onOpenLibraryForBannerLogo, onOpenLibraryForBannerFont,
    onOpenLibraryForAlbumCoverReferences, onOpenLibraryForAlbumCoverPalette, onOpenLibraryForAlbumCoverLogo, onOpenLibraryForAlbumCoverFont
}) => {
    const dispatch: AppDispatch = useDispatch();
    const state = useSelector((state: RootState) => state.logoTheme.logoThemeState);

    const [zoomedLogoIndex, setZoomedLogoIndex] = useState<number | null>(null);
    const [zoomedBannerIndex, setZoomedBannerIndex] = useState<number | null>(null);
    const [zoomedAlbumCoverIndex, setZoomedAlbumCoverIndex] = useState<number | null>(null);
    
    const [fontPreview, setFontPreview] = useState<string | null>(null);
    const [bannerFontPreview, setBannerFontPreview] = useState<string | null>(null);
    const [albumFontPreview, setAlbumFontPreview] = useState<string | null>(null);
    
    useEffect(() => {
        if (state.fontReferenceImage) {
            const url = URL.createObjectURL(state.fontReferenceImage);
            setFontPreview(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setFontPreview(null);
        }
    }, [state.fontReferenceImage]);
    
    useEffect(() => {
        if (state.bannerFontReferenceImage) {
            const url = URL.createObjectURL(state.bannerFontReferenceImage);
            setBannerFontPreview(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setBannerFontPreview(null);
        }
    }, [state.bannerFontReferenceImage]);

    useEffect(() => {
        if (state.albumFontReferenceImage) {
            const url = URL.createObjectURL(state.albumFontReferenceImage);
            setAlbumFontPreview(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setAlbumFontPreview(null);
        }
    }, [state.albumFontReferenceImage]);

    const subTabs = [
        { id: 'logo', label: 'Logo Generator' },
        { id: 'banner', label: 'Banner Generator' },
        { id: 'album-cover', label: 'Album Cover Generator' },
    ];

    const handleInputChange = (field: keyof LogoThemeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        dispatch(updateLogoThemeState({ [field]: e.target.value }));
    };
    
    const handleStyleChange = (style: LogoStyle) => {
        dispatch(updateLogoThemeState({ logoStyle: style }));
    };
    
    const handleBgChange = (bg: LogoBackground) => {
        dispatch(updateLogoThemeState({ backgroundColor: bg }));
    };
    
    const handleSliderChange = (field: keyof LogoThemeState) => (e: React.ChangeEvent<HTMLInputElement>) => {
        dispatch(updateLogoThemeState({ [field]: parseInt(e.target.value, 10) }));
    };

    const handleRemoveReference = (id: number, type: 'logo' | 'banner' | 'album-cover') => {
        if (type === 'logo') {
            dispatch(updateLogoThemeState({ referenceItems: state.referenceItems?.filter(item => item.id !== id) }));
        } else if (type === 'banner') {
            dispatch(updateLogoThemeState({ bannerReferenceItems: state.bannerReferenceItems?.filter(item => item.id !== id) }));
        } else {
            dispatch(updateLogoThemeState({ albumReferenceItems: state.albumReferenceItems?.filter(item => item.id !== id) }));
        }
    };

    const handleClearPalette = (type: 'logo' | 'banner' | 'album-cover') => {
        if (type === 'logo') {
            dispatch(updateLogoThemeState({ selectedPalette: undefined }));
        } else if (type === 'banner') {
            dispatch(updateLogoThemeState({ bannerSelectedPalette: undefined }));
        } else {
            dispatch(updateLogoThemeState({ albumSelectedPalette: undefined }));
        }
    };

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner' | 'album-cover') => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
    
        const newItems: LibraryItem[] = await Promise.all(files.map(async (file: File, index) => {
            const media = await fileToDataUrl(file);
            const thumbnail = await dataUrlToThumbnail(media, 128);
            return { id: Date.now() + index, name: file.name, mediaType: 'image' as const, media, thumbnail };
        }));
    
        if (type === 'logo') {
            dispatch(updateLogoThemeState({ referenceItems: [...(state.referenceItems || []), ...newItems] }));
        } else if (type === 'banner') {
            dispatch(updateLogoThemeState({ bannerReferenceItems: [...(state.bannerReferenceItems || []), ...newItems] }));
        } else {
            dispatch(updateLogoThemeState({ albumReferenceItems: [...(state.albumReferenceItems || []), ...newItems] }));
        }
        e.target.value = '';
    };

    const handleLogoReset = () => {
        dispatch(updateLogoThemeState({
            logoPrompt: '', brandName: '', slogan: '', logoStyle: 'symbolic',
            fontReferenceImage: null, selectedFont: null,
            referenceItems: [], selectedPalette: undefined, generatedLogos: [], logoError: null
        }));
    };

    const handleGenerateLogos = async () => {
        dispatch(updateLogoThemeState({ isGeneratingLogos: true, logoError: null, generatedLogos: [] }));
        try {
            const logos = await generateLogos(state);
            dispatch(updateLogoThemeState({ isGeneratingLogos: false, generatedLogos: logos.map(src => ({ src, saved: 'idle' })) }));
        } catch (err: any) {
            dispatch(updateLogoThemeState({ isGeneratingLogos: false, logoError: err.message || "An unknown error occurred." }));
        }
    };
    
    const handleSaveLogo = async (logoSrc: string, index: number) => {
        dispatch(setLogoSaveStatus({ index, status: 'saving' }));

        try {
            let logoName = 'Logo';
            const styleLabel = LOGO_STYLES.find(s => s.id === state.logoStyle)?.label || state.logoStyle;
            logoName = state.brandName ? `${state.brandName} - ${styleLabel} Logo` : state.logoPrompt ? `Logo for "${state.logoPrompt.substring(0, 25)}..." - ${styleLabel}` : `${styleLabel} Logo Concept`;
            
            const themeOptions: ThemeGenerationInfo = {
                prompt: state.logoPrompt,
                style: state.logoStyle,
                brandName: state.brandName,
                slogan: state.slogan,
                backgroundColor: state.backgroundColor,
                referenceItems: state.referenceItems?.map(item => ({ name: item.name!, thumbnail: item.thumbnail })),
                selectedPalette: state.selectedPalette ? { name: state.selectedPalette.name!, media: state.selectedPalette.media } : undefined,
                selectedFont: state.selectedFont ? { name: state.selectedFont.name!, thumbnail: state.selectedFont.thumbnail } : undefined,
                fontReferenceImage: state.fontReferenceImage ? await dataUrlToThumbnail(await fileToDataUrl(state.fontReferenceImage), 64) : undefined,
            };

            const libraryItem: Omit<LibraryItem, 'id'> = {
                mediaType: 'logo', 
                name: logoName, 
                media: logoSrc, 
                thumbnail: await dataUrlToThumbnail(logoSrc, 256),
                themeOptions: themeOptions,
            };

            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setLogoSaveStatus({ index, status: 'saved' }));
        } catch (e) {
            console.error("Failed to save logo to library", e);
            dispatch(setLogoSaveStatus({ index, status: 'idle' }));
        }
    };

    const handleDownloadLogo = (logoSrc: string, index: number) => {
        const link = document.createElement('a');
        link.href = logoSrc;
        const baseName = sanitizeForFilename(state.brandName || state.logoPrompt || 'logo');
        const randomPart = Math.random().toString(36).substring(2, 7);
        link.download = `${baseName}_${index + 1}_${randomPart}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleBannerReset = () => {
        dispatch(updateLogoThemeState({
            bannerPrompt: '', bannerTitle: '', bannerAspectRatio: '16:9', bannerStyle: 'corporate-clean',
            bannerFontReferenceImage: null, bannerSelectedFont: null,
            bannerReferenceItems: [], bannerSelectedPalette: undefined, bannerSelectedLogo: null, bannerLogoPlacement: 'top-left',
            generatedBanners: [], bannerError: null
        }));
    };

    const handleGenerateBanners = async () => {
        dispatch(updateLogoThemeState({ isGeneratingBanners: true, bannerError: null, generatedBanners: [] }));
        try {
            const banners = await generateBanners(state);
            dispatch(updateLogoThemeState({ isGeneratingBanners: false, generatedBanners: banners.map(src => ({ src, saved: 'idle' })) }));
        } catch (err: any) {
            dispatch(updateLogoThemeState({ isGeneratingBanners: false, bannerError: err.message || "An unknown error occurred." }));
        }
    };

    const handleSaveBanner = async (bannerSrc: string, index: number) => {
        dispatch(setBannerSaveStatus({ index, status: 'saving' }));
        try {
            const name = state.bannerTitle || state.bannerPrompt?.substring(0, 30) || 'Banner';
            
            const themeOptions: ThemeGenerationInfo = {
                prompt: state.bannerPrompt,
                bannerTitle: state.bannerTitle,
                style: state.bannerStyle,
                bannerAspectRatio: state.bannerAspectRatio,
                bannerLogoPlacement: state.bannerLogoPlacement,
                referenceItems: state.bannerReferenceItems?.map(item => ({ name: item.name!, thumbnail: item.thumbnail })),
                selectedPalette: state.bannerSelectedPalette ? { name: state.bannerSelectedPalette.name!, media: state.bannerSelectedPalette.media } : undefined,
                bannerSelectedLogo: state.bannerSelectedLogo ? { name: state.bannerSelectedLogo.name!, thumbnail: state.bannerSelectedLogo.thumbnail } : undefined,
                selectedFont: state.bannerSelectedFont ? { name: state.bannerSelectedFont.name!, thumbnail: state.bannerSelectedFont.thumbnail } : undefined,
                fontReferenceImage: state.bannerFontReferenceImage ? await dataUrlToThumbnail(await fileToDataUrl(state.bannerFontReferenceImage), 64) : undefined,
            };

            const libraryItem: Omit<LibraryItem, 'id'> = { mediaType: 'banner', name: `Banner: ${name}`, media: bannerSrc, thumbnail: await dataUrlToThumbnail(bannerSrc, 256), themeOptions };
            
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setBannerSaveStatus({ index, status: 'saved' }));
        } catch(e) {
            console.error("Failed to save banner", e);
            dispatch(setBannerSaveStatus({ index, status: 'idle' }));
        }
    };

    const handleDownloadBanner = (bannerSrc: string, index: number) => {
        const link = document.createElement('a');
        link.href = bannerSrc;
        const baseName = sanitizeForFilename(state.bannerTitle || state.bannerPrompt || 'banner');
        const randomPart = Math.random().toString(36).substring(2, 7);
        link.download = `${baseName}_${index + 1}_${randomPart}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAlbumCoverReset = () => {
        dispatch(updateLogoThemeState({
            albumPrompt: '', albumTitle: '', artistName: '', musicStyle: 'rock', customMusicStyle: '', albumEra: 'modern', albumMediaType: 'digital',
            addVinylWear: false, albumFontReferenceImage: null, albumSelectedFont: null, albumReferenceItems: [], albumSelectedPalette: undefined, albumSelectedLogo: null,
            generatedAlbumCovers: [], albumCoverError: null
        }));
    };

    const handleGenerateAlbumCovers = async () => {
        dispatch(updateLogoThemeState({ isGeneratingAlbumCovers: true, albumCoverError: null, generatedAlbumCovers: [] }));
        try {
            const covers = await generateAlbumCovers(state);
            dispatch(updateLogoThemeState({ isGeneratingAlbumCovers: false, generatedAlbumCovers: covers.map(src => ({ src, saved: 'idle' })) }));
        } catch (err: any) {
            dispatch(updateLogoThemeState({ isGeneratingAlbumCovers: false, albumCoverError: err.message || "An unknown error occurred." }));
        }
    };

    const handleSaveAlbumCover = async (coverSrc: string, index: number) => {
        dispatch(setAlbumCoverSaveStatus({ index, status: 'saving' }));

        try {
            const name = `${state.artistName || 'Artist'} - ${state.albumTitle || 'Album'}`;

            const themeOptions: ThemeGenerationInfo = {
                prompt: state.albumPrompt,
                albumTitle: state.albumTitle,
                artistName: state.artistName,
                style: state.musicStyle === 'other' ? state.customMusicStyle : state.musicStyle,
                albumEra: state.albumEra,
                albumMediaType: state.albumMediaType,
                addVinylWear: state.addVinylWear,
                referenceItems: state.albumReferenceItems?.map(item => ({ name: item.name!, thumbnail: item.thumbnail })),
                selectedPalette: state.albumSelectedPalette ? { name: state.albumSelectedPalette.name!, media: state.albumSelectedPalette.media } : undefined,
                albumSelectedLogo: state.albumSelectedLogo ? { name: state.albumSelectedLogo.name!, thumbnail: state.albumSelectedLogo.thumbnail } : undefined,
                selectedFont: state.albumSelectedFont ? { name: state.albumSelectedFont.name!, thumbnail: state.albumSelectedFont.thumbnail } : undefined,
                fontReferenceImage: state.albumFontReferenceImage ? await dataUrlToThumbnail(await fileToDataUrl(state.albumFontReferenceImage), 64) : undefined,
            };
            const libraryItem: Omit<LibraryItem, 'id'> = { mediaType: 'album-cover', name: name, media: coverSrc, thumbnail: await dataUrlToThumbnail(coverSrc, 256), themeOptions };
            
            await dispatch(addToLibrary(libraryItem)).unwrap();
            dispatch(setAlbumCoverSaveStatus({ index, status: 'saved' }));
        } catch(e) {
            console.error("Failed to save album cover", e);
            dispatch(setAlbumCoverSaveStatus({ index, status: 'idle' }));
        }
    };

    const handleDownloadAlbumCover = (coverSrc: string, index: number) => {
        const link = document.createElement('a');
        link.href = coverSrc;
        const artist = sanitizeForFilename(state.artistName || 'artist');
        const album = sanitizeForFilename(state.albumTitle || 'album');
        const randomPart = Math.random().toString(36).substring(2, 7);
        link.download = `${artist}_${album}_${index + 1}_${randomPart}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleFontImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        dispatch(updateLogoThemeState({
            fontReferenceImage: file,
            selectedFont: null, // Clear library selection
        }));
        e.target.value = ''; // Allow re-upload
    };
    
    const handleBannerFontImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        dispatch(updateLogoThemeState({
            bannerFontReferenceImage: file,
            bannerSelectedFont: null,
        }));
        e.target.value = '';
    };

    const handleAlbumFontImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        dispatch(updateLogoThemeState({
            albumFontReferenceImage: file,
            albumSelectedFont: null,
        }));
        e.target.value = '';
    };

    const handleClearFont = () => {
        dispatch(updateLogoThemeState({
            fontReferenceImage: null,
            selectedFont: null,
        }));
    };
    
    const handleClearBannerFont = () => {
        dispatch(updateLogoThemeState({
            bannerFontReferenceImage: null,
            bannerSelectedFont: null,
        }));
    };

    const handleClearAlbumFont = () => {
        dispatch(updateLogoThemeState({
            albumFontReferenceImage: null,
            albumSelectedFont: null,
        }));
    };

    const selectedPaletteColors = state.selectedPalette ? JSON.parse(state.selectedPalette.media) as PaletteColor[] : [];
    const bannerSelectedPaletteColors = state.bannerSelectedPalette ? JSON.parse(state.bannerSelectedPalette.media) as PaletteColor[] : [];
    const albumSelectedPaletteColors = state.albumSelectedPalette ? JSON.parse(state.albumSelectedPalette.media) as PaletteColor[] : [];
    
    const currentZoomedLogo = zoomedLogoIndex !== null ? state.generatedLogos?.[zoomedLogoIndex] : null;
    const currentZoomedBanner = zoomedBannerIndex !== null ? state.generatedBanners?.[zoomedBannerIndex] : null;
    const currentZoomedAlbumCover = zoomedAlbumCoverIndex !== null ? state.generatedAlbumCovers?.[zoomedAlbumCoverIndex] : null;

    // --- Modal Logic ---
    const useZoomModal = (itemCount: number, getZoomedIndex: () => number | null, setZoomedIndex: (index: number | null) => void) => {
        const handleClose = useCallback(() => setZoomedIndex(null), [setZoomedIndex]);
        const handleNext = useCallback(() => {
            if (getZoomedIndex() !== null && itemCount > 1) {
                setZoomedIndex((getZoomedIndex()! + 1) % itemCount);
            }
        }, [getZoomedIndex, setZoomedIndex, itemCount]);
        const handlePrev = useCallback(() => {
            if (getZoomedIndex() !== null && itemCount > 1) {
                setZoomedIndex((getZoomedIndex()! - 1 + itemCount) % itemCount);
            }
        }, [getZoomedIndex, setZoomedIndex, itemCount]);
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (getZoomedIndex() === null) return;
                if (e.key === 'Escape') handleClose();
                if (e.key === 'ArrowRight') handleNext();
                if (e.key === 'ArrowLeft') handlePrev();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [getZoomedIndex, handleClose, handleNext, handlePrev]);
        return { handleClose, handleNext, handlePrev };
    };

    const { handleClose: handleCloseLogoZoom, handleNext: handleNextLogo, handlePrev: handlePrevLogo } = useZoomModal(state.generatedLogos?.length || 0, () => zoomedLogoIndex, setZoomedLogoIndex);
    const { handleClose: handleCloseBannerZoom, handleNext: handleNextBanner, handlePrev: handlePrevBanner } = useZoomModal(state.generatedBanners?.length || 0, () => zoomedBannerIndex, setZoomedBannerIndex);
    const { handleClose: handleCloseAlbumCoverZoom, handleNext: handleNextAlbumCover, handlePrev: handlePrevAlbumCover } = useZoomModal(state.generatedAlbumCovers?.length || 0, () => zoomedAlbumCoverIndex, setZoomedAlbumCoverIndex);

    return (
        <>
            <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto">
                <SubTabs tabs={subTabs} activeTab={activeSubTab} onTabClick={setActiveSubTab} />

                <div className={activeSubTab === 'logo' ? 'block' : 'hidden'}>
                    <Section 
                        title="Logo Generator"
                        description="Create unique, professional logos from a text description. Specify style, colors, and content to generate the perfect brand identity."
                        borderColor="var(--color-accent)"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            {/* --- Left Column: Controls --- */}
                            <div className="space-y-6">
                                <textarea value={state.logoPrompt} onChange={handleInputChange('logoPrompt')} placeholder="Describe the logo's core concept, e.g., 'a majestic lion head combined with a shield'" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" rows={3} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input type="text" value={state.brandName} onChange={handleInputChange('brandName')} placeholder="Brand Name" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                                    <input type="text" value={state.slogan} onChange={handleInputChange('slogan')} placeholder="Slogan (Optional)" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Logo Style</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {LOGO_STYLES.map(style => <button key={style.id} onClick={() => handleStyleChange(style.id)} title={style.description} className={`p-3 text-center rounded-lg text-sm transition-colors ${state.logoStyle === style.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>{style.label}</button>)}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Font (Optional)</h3>
                                    {state.fontReferenceImage || state.selectedFont ? (
                                        <div className="mt-2 p-2 bg-bg-primary/50 rounded-md flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <img 
                                                    src={state.selectedFont ? state.selectedFont.thumbnail : fontPreview!}
                                                    alt="Font preview" 
                                                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                                                />
                                                <p className="text-sm font-semibold truncate">
                                                    {state.selectedFont ? state.selectedFont.name : state.fontReferenceImage?.name}
                                                </p>
                                            </div>
                                            <button onClick={handleClearFont} className="p-1 text-text-secondary hover:text-white flex-shrink-0 ml-2">
                                                <CloseIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={onOpenLibraryForFont} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                                <LibraryIcon className="w-5 h-5"/> From Library
                                            </button>
                                            <label htmlFor="logo-font-upload" className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors cursor-pointer">
                                                <UploadIconSimple className="w-5 h-5"/> Upload Image
                                                <input id="logo-font-upload" type="file" accept="image/*" className="hidden" onChange={handleFontImageUpload} />
                                            </label>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-md font-semibold text-text-secondary mb-2">Inspiration Images</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={onOpenLibraryForReferences} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors"><LibraryIcon className="w-5 h-5"/> From Library</button>
                                            <label htmlFor="logo-ref-upload" className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors cursor-pointer"><UploadIconSimple className="w-5 h-5"/> Upload File(s)<input id="logo-ref-upload" type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleReferenceUpload(e, 'logo')} /></label>
                                        </div>
                                        {(state.referenceItems && state.referenceItems.length > 0) && <div className="mt-4 p-2 bg-bg-primary/50 rounded-md"><div className="grid grid-cols-4 gap-2">{state.referenceItems.map(item => <div key={item.id} className="relative group"><img src={item.thumbnail} alt={item.name} className="w-full aspect-square object-cover rounded"/><button onClick={() => handleRemoveReference(item.id, 'logo')} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><CloseIcon className="w-3 h-3"/></button></div>)}</div></div>}
                                    </div>
                                    <div>
                                        <h3 className="text-md font-semibold text-text-secondary mb-2">Color Palette</h3>
                                        <button onClick={onOpenLibraryForPalette} className="w-full flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors"><LibraryIcon className="w-5 h-5"/> From Library</button>
                                        {state.selectedPalette && <div className="mt-4 p-3 bg-bg-primary/50 rounded-md flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex -space-x-2">{selectedPaletteColors.slice(0, 5).map(c => <div key={c.hex} className="w-6 h-6 rounded-full border-2 border-bg-tertiary" style={{backgroundColor: c.hex}}></div>)}</div><p className="text-sm font-semibold truncate">{state.selectedPalette.name}</p></div><button onClick={() => handleClearPalette('logo')} className="p-1 text-text-secondary hover:text-white"><CloseIcon className="w-4 h-4"/></button></div>}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Settings</h3>
                                    <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                        <div><label className="block text-sm font-medium text-text-secondary">Number of Logos: {state.numLogos}</label><input type="range" min="1" max="4" step="1" value={state.numLogos} onChange={handleSliderChange('numLogos')} className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer" /></div>
                                        <div><label className="block text-sm font-medium text-text-secondary mb-2">Background</label><div className="flex items-center gap-2">{BACKGROUND_OPTIONS.map(bg => <button key={bg.id} onClick={() => handleBgChange(bg.id)} className={`flex-1 p-2 text-xs rounded-md ${state.backgroundColor === bg.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{bg.label}</button>)}</div></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button onClick={handleLogoReset} disabled={state.isGeneratingLogos} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"><ResetIcon className="w-5 h-5"/> Reset</button>
                                    <button onClick={handleGenerateLogos} disabled={state.isGeneratingLogos} style={!state.isGeneratingLogos ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">{state.isGeneratingLogos ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}{state.isGeneratingLogos ? 'Generating...' : 'Generate Logos'}</button>
                                </div>
                            </div>
                            {/* --- Right Column: Results --- */}
                            <div className="space-y-4">
                                {state.logoError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.logoError}</p>}
                                {state.isGeneratingLogos ? <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl shadow-inner h-full min-h-[400px]"><SpinnerIcon className="w-16 h-16 text-accent animate-spin mb-4" /><h3 className="text-lg font-bold text-text-primary">Generating your logos...</h3></div> : (state.generatedLogos && state.generatedLogos.length > 0) ? <div className="grid grid-cols-2 gap-4">{state.generatedLogos.map((logo, index) => (
                                    <div key={index} className="group relative aspect-square bg-bg-primary p-2 rounded-lg flex items-center justify-center">
                                        <img src={logo.src} alt={`Generated Logo ${index + 1}`} className="max-w-full max-h-full object-contain" />
                                        <div 
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                            onClick={() => setZoomedLogoIndex(index)}
                                            title="Zoom In"
                                        >
                                            <div 
                                                className="flex items-center gap-2"
                                                onClick={(e) => e.stopPropagation()} 
                                            >
                                                <button
                                                    onClick={() => handleDownloadLogo(logo.src, index)}
                                                    title="Save to Disk"
                                                    className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleSaveLogo(logo.src, index)}
                                                    title={logo.saved === 'saved' ? 'Saved!' : 'Save to Library'}
                                                    disabled={logo.saved !== 'idle'}
                                                    className={`p-3 rounded-full transition-all duration-200 ${
                                                        logo.saved === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                        logo.saved === 'saving' ? 'bg-bg-secondary text-text-secondary cursor-wait' :
                                                        'bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text'
                                                    }`}
                                                >
                                                    {logo.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : logo.saved === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}</div> : <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl shadow-inner h-full min-h-[400px]"><GenerateIcon className="w-16 h-16 text-border-primary mb-4" /><h3 className="text-lg font-bold text-text-primary">Your generated logos will appear here</h3><p className="text-text-secondary max-w-xs">Configure your options and click "Generate Logos".</p></div>}
                            </div>
                        </div>
                    </Section>
                </div>
                <div className={activeSubTab === 'banner' ? 'block' : 'hidden'}>
                    <Section 
                        title="Banner Generator"
                        description="Design eye-catching banners for social media, websites, or advertisements. Combine text and imagery for impactful visuals."
                        borderColor="var(--color-highlight-green)"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div className="space-y-6">
                                <textarea value={state.bannerPrompt} onChange={handleInputChange('bannerPrompt')} placeholder="Describe the banner's visual concept..." className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm" rows={3} />
                                <input type="text" value={state.bannerTitle} onChange={handleInputChange('bannerTitle')} placeholder="Banner Title / Main Text" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm" />
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Banner Style</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{BANNER_STYLE_OPTIONS.map(style => <button key={style.id} onClick={() => dispatch(updateLogoThemeState({ bannerStyle: style.id }))} title={style.description} className={`p-3 text-center rounded-lg text-sm transition-colors ${state.bannerStyle === style.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>{style.label}</button>)}</div>
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Font (Optional)</h3>
                                    {state.bannerFontReferenceImage || state.bannerSelectedFont ? (
                                        <div className="mt-2 p-2 bg-bg-primary/50 rounded-md flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <img 
                                                    src={state.bannerSelectedFont ? state.bannerSelectedFont.thumbnail : bannerFontPreview!}
                                                    alt="Font preview" 
                                                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                                                />
                                                <p className="text-sm font-semibold truncate">
                                                    {state.bannerSelectedFont ? state.bannerSelectedFont.name : state.bannerFontReferenceImage?.name}
                                                </p>
                                            </div>
                                            <button onClick={handleClearBannerFont} className="p-1 text-text-secondary hover:text-white flex-shrink-0 ml-2">
                                                <CloseIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={onOpenLibraryForBannerFont} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                                <LibraryIcon className="w-5 h-5"/> From Library
                                            </button>
                                            <label htmlFor="banner-font-upload" className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors cursor-pointer">
                                                <UploadIconSimple className="w-5 h-5"/> Upload Image
                                                <input id="banner-font-upload" type="file" accept="image/*" className="hidden" onChange={handleBannerFontImageUpload} />
                                            </label>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <button onClick={onOpenLibraryForBannerReferences} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Images</button>
                                        <button onClick={onOpenLibraryForBannerPalette} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Palette</button>
                                        <button onClick={onOpenLibraryForBannerLogo} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Logo</button>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {state.bannerSelectedLogo && <div className="relative group"><img src={state.bannerSelectedLogo.thumbnail} className="w-16 h-16 object-contain rounded bg-bg-primary/50 p-1"/><button onClick={() => dispatch(updateLogoThemeState({ bannerSelectedLogo: null }))} className="absolute -top-1 -right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>}
                                        {state.bannerSelectedPalette && <div className="relative group flex items-center gap-2 p-2 rounded-md bg-bg-primary/50"><div className="flex -space-x-2">{bannerSelectedPaletteColors.slice(0, 4).map(c => <div key={c.hex} className="w-8 h-8 rounded-full border-2 border-bg-tertiary" style={{backgroundColor: c.hex}}></div>)}</div><button onClick={() => handleClearPalette('banner')} className="p-1 text-text-secondary hover:text-white opacity-0 group-hover:opacity-100"><CloseIcon className="w-4 h-4"/></button></div>}
                                    </div>
                                    {(state.bannerReferenceItems && state.bannerReferenceItems.length > 0) && <div className="p-2 bg-bg-primary/50 rounded-md"><div className="grid grid-cols-4 gap-2">{state.bannerReferenceItems.map(item => <div key={item.id} className="relative group"><img src={item.thumbnail} alt={item.name} className="w-full aspect-square object-cover rounded"/><button onClick={() => handleRemoveReference(item.id, 'banner')} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>)}</div></div>}
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Settings</h3>
                                    <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                        <div><label className="block text-sm font-medium text-text-secondary">Number of Banners: {state.numBanners}</label><input type="range" min="1" max="4" step="1" value={state.numBanners} onChange={handleSliderChange('numBanners')} className="w-full h-2 mt-1 bg-bg-primary rounded-lg" /></div>
                                        <div><label className="block text-sm font-medium text-text-secondary mb-2">Aspect Ratio</label><select value={state.bannerAspectRatio} onChange={(e) => dispatch(updateLogoThemeState({ bannerAspectRatio: e.target.value as BannerAspectRatio }))} className="w-full bg-bg-primary border border-border-primary p-2 rounded-md text-sm">{BANNER_ASPECT_RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        <div><label className="block text-sm font-medium text-text-secondary mb-2">Logo Placement</label><div className="grid grid-cols-3 gap-2">{BANNER_LOGO_PLACEMENT_OPTIONS.map(opt => <button key={opt.id} onClick={() => dispatch(updateLogoThemeState({ bannerLogoPlacement: opt.id }))} className={`p-2 text-xs rounded-md ${state.bannerLogoPlacement === opt.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{opt.label}</button>)}</div></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button onClick={handleBannerReset} disabled={state.isGeneratingBanners} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover"><ResetIcon className="w-5 h-5"/> Reset</button>
                                    <button onClick={handleGenerateBanners} disabled={state.isGeneratingBanners} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg bg-accent text-accent-text disabled:opacity-50">{state.isGeneratingBanners ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}{state.isGeneratingBanners ? 'Generating...' : 'Generate Banners'}</button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {state.bannerError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.bannerError}</p>}
                                {state.isGeneratingBanners ? <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl h-full min-h-[400px]"><SpinnerIcon className="w-16 h-16 text-accent animate-spin mb-4" /><h3 className="text-lg font-bold text-text-primary">Generating banners...</h3></div> : (state.generatedBanners && state.generatedBanners.length > 0) ? <div className="grid grid-cols-2 gap-4">{state.generatedBanners.map((banner, index) => (
                                    <div key={index} className="group relative aspect-video bg-bg-primary p-2 rounded-lg flex items-center justify-center">
                                        <img src={banner.src} alt={`Generated Banner ${index + 1}`} className="max-w-full max-h-full object-contain" />
                                        <div 
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                            onClick={() => setZoomedBannerIndex(index)}
                                            title="Zoom In"
                                        >
                                            <div 
                                                className="flex items-center gap-2"
                                                onClick={(e) => e.stopPropagation()} 
                                            >
                                                <button
                                                    onClick={() => handleDownloadBanner(banner.src, index)}
                                                    title="Save to Disk"
                                                    className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text transition-colors"
                                                >
                                                    <DownloadIcon className="w-5 h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleSaveBanner(banner.src, index)}
                                                    title={banner.saved === 'saved' ? 'Saved!' : 'Save to Library'}
                                                    disabled={banner.saved !== 'idle'}
                                                    className={`p-3 rounded-full transition-all duration-200 ${
                                                        banner.saved === 'saved' ? 'bg-green-500 text-white cursor-default' : 
                                                        banner.saved === 'saving' ? 'bg-bg-secondary text-text-secondary cursor-wait' :
                                                        'bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text'
                                                    }`}
                                                >
                                                    {banner.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : banner.saved === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}</div> : <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl h-full min-h-[400px]"><GenerateIcon className="w-16 h-16 text-border-primary mb-4" /><h3 className="text-lg font-bold text-text-primary">Your banners will appear here</h3></div>}
                            </div>
                        </div>
                    </Section>
                </div>
                 <div className={activeSubTab === 'album-cover' ? 'block' : 'hidden'}>
                    <Section 
                        title="Album Cover Generator"
                        description="Design the perfect 1:1 album cover for your music. Specify genre, era, and media type for a pitch-perfect result."
                        borderColor="var(--color-danger)"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            {/* --- Left Column: Controls --- */}
                            <div className="space-y-6">
                                <textarea value={state.albumPrompt} onChange={handleInputChange('albumPrompt')} placeholder="Describe the album cover's visual concept..." className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" rows={3} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <input type="text" value={state.albumTitle} onChange={handleInputChange('albumTitle')} placeholder="Album Title" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                                    <input type="text" value={state.artistName} onChange={handleInputChange('artistName')} placeholder="Artist / Band Name" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Style</h3>
                                    <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div><label className="block text-sm font-medium text-text-primary mb-1">Music Style</label><select value={state.musicStyle} onChange={(e) => dispatch(updateLogoThemeState({ musicStyle: e.target.value as MusicStyle }))} className="w-full bg-bg-primary border border-border-primary p-2 rounded-md text-sm">{MUSIC_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                                            <div><label className="block text-sm font-medium text-text-primary mb-1">Era</label><select value={state.albumEra} onChange={(e) => dispatch(updateLogoThemeState({ albumEra: e.target.value as AlbumEra }))} className="w-full bg-bg-primary border border-border-primary p-2 rounded-md text-sm">{ALBUM_ERAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select></div>
                                            <div><label className="block text-sm font-medium text-text-primary mb-1">Media Format</label><select value={state.albumMediaType} onChange={(e) => dispatch(updateLogoThemeState({ albumMediaType: e.target.value as AlbumMediaType }))} className="w-full bg-bg-primary border border-border-primary p-2 rounded-md text-sm">{ALBUM_MEDIA_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
                                        </div>
                                        {state.musicStyle === 'other' && <input type="text" value={state.customMusicStyle} onChange={handleInputChange('customMusicStyle')} placeholder="Enter custom music style" className="w-full bg-bg-primary border border-border-primary rounded-md p-2 text-sm" />}
                                        {state.albumMediaType === 'vinyl' && <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer pt-2"><input type="checkbox" checked={state.addVinylWear} onChange={(e) => dispatch(updateLogoThemeState({ addVinylWear: e.target.checked }))} className="rounded text-accent focus:ring-accent" />Add wear & tear (scratches, ring wear)</label>}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Font (Optional)</h3>
                                    {state.albumFontReferenceImage || state.albumSelectedFont ? (
                                        <div className="mt-2 p-2 bg-bg-primary/50 rounded-md flex items-center justify-between">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <img 
                                                    src={state.albumSelectedFont ? state.albumSelectedFont.thumbnail : albumFontPreview!}
                                                    alt="Font preview" 
                                                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                                                />
                                                <p className="text-sm font-semibold truncate">
                                                    {state.albumSelectedFont ? state.albumSelectedFont.name : state.albumFontReferenceImage?.name}
                                                </p>
                                            </div>
                                            <button onClick={handleClearAlbumFont} className="p-1 text-text-secondary hover:text-white flex-shrink-0 ml-2">
                                                <CloseIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-4">
                                            <button onClick={onOpenLibraryForAlbumCoverFont} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                                <LibraryIcon className="w-5 h-5"/> From Library
                                            </button>
                                            <label htmlFor="album-font-upload" className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors cursor-pointer">
                                                <UploadIconSimple className="w-5 h-5"/> Upload Image
                                                <input id="album-font-upload" type="file" accept="image/*" className="hidden" onChange={handleAlbumFontImageUpload} />
                                            </label>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <button onClick={onOpenLibraryForAlbumCoverReferences} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Images</button>
                                        <button onClick={onOpenLibraryForAlbumCoverPalette} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Palette</button>
                                        <button onClick={onOpenLibraryForAlbumCoverLogo} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Logo</button>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {state.albumSelectedLogo && <div className="relative group"><img src={state.albumSelectedLogo.thumbnail} className="w-16 h-16 object-contain rounded bg-bg-primary/50 p-1"/><button onClick={() => dispatch(updateLogoThemeState({ albumSelectedLogo: null }))} className="absolute -top-1 -right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>}
                                        {state.albumSelectedPalette && <div className="relative group flex items-center gap-2 p-2 rounded-md bg-bg-primary/50"><div className="flex -space-x-2">{albumSelectedPaletteColors.slice(0, 4).map(c => <div key={c.hex} className="w-8 h-8 rounded-full border-2 border-bg-tertiary" style={{backgroundColor: c.hex}}></div>)}</div><button onClick={() => handleClearPalette('album-cover')} className="p-1 text-text-secondary hover:text-white opacity-0 group-hover:opacity-100"><CloseIcon className="w-4 h-4"/></button></div>}
                                    </div>
                                    {(state.albumReferenceItems && state.albumReferenceItems.length > 0) && <div className="p-2 bg-bg-primary/50 rounded-md"><div className="grid grid-cols-4 gap-2">{state.albumReferenceItems.map(item => <div key={item.id} className="relative group"><img src={item.thumbnail} alt={item.name} className="w-full aspect-square object-cover rounded"/><button onClick={() => handleRemoveReference(item.id, 'album-cover')} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>)}</div></div>}
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Settings</h3>
                                    <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-text-secondary">Number of Covers: {state.numAlbumCovers}</label>
                                            <input type="range" min="1" max="4" step="1" value={state.numAlbumCovers} onChange={handleSliderChange('numAlbumCovers')} className="w-full h-2 mt-1 bg-bg-primary rounded-lg" />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button onClick={handleAlbumCoverReset} disabled={state.isGeneratingAlbumCovers} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover"><ResetIcon className="w-5 h-5"/> Reset</button>
                                    <button onClick={handleGenerateAlbumCovers} disabled={state.isGeneratingAlbumCovers} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg bg-danger text-white disabled:opacity-50">{state.isGeneratingAlbumCovers ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}{state.isGeneratingAlbumCovers ? 'Generating...' : 'Generate Covers'}</button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {state.albumCoverError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.albumCoverError}</p>}
                                {state.isGeneratingAlbumCovers ? <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl h-full min-h-[400px]"><SpinnerIcon className="w-16 h-16 text-danger animate-spin mb-4" /><h3 className="text-lg font-bold text-text-primary">Generating album covers...</h3></div> : (state.generatedAlbumCovers && state.generatedAlbumCovers.length > 0) ? <div className="grid grid-cols-2 gap-4">{state.generatedAlbumCovers.map((cover, index) => (
                                    <div key={index} className="group relative aspect-square bg-bg-primary p-2 rounded-lg flex items-center justify-center">
                                        <img src={cover.src} alt={`Generated Album Cover ${index + 1}`} className="max-w-full max-h-full object-contain" />
                                        <div 
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                            onClick={() => setZoomedAlbumCoverIndex(index)}
                                            title="Zoom In"
                                        >
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => handleDownloadAlbumCover(cover.src, index)} title="Save to Disk" className="p-3 rounded-full bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text"><DownloadIcon className="w-5 h-5" /></button>
                                                <button onClick={() => handleSaveAlbumCover(cover.src, index)} title={cover.saved === 'saved' ? 'Saved!' : 'Save to Library'} disabled={cover.saved !== 'idle'} className={`p-3 rounded-full transition-all ${cover.saved === 'saved' ? 'bg-green-500 text-white' : 'bg-bg-tertiary/80 text-text-primary hover:bg-accent hover:text-accent-text'}`}>
                                                    {cover.saved === 'saving' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : cover.saved === 'saved' ? <CheckIcon className="w-5 h-5" /> : <SaveIcon className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}</div> : <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl h-full min-h-[400px]"><GenerateIcon className="w-16 h-16 text-border-primary mb-4" /><h3 className="text-lg font-bold text-text-primary">Your album covers will appear here</h3></div>}
                            </div>
                        </div>
                    </Section>
                </div>
            </div>
            {currentZoomedLogo && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={handleCloseLogoZoom}><div className="relative" onClick={e => e.stopPropagation()}><img src={currentZoomedLogo.src} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }}/><button onClick={handleCloseLogoZoom} className="absolute -top-2 -right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75"><CloseIcon className="w-5 h-5"/></button>{state.generatedLogos && state.generatedLogos.length > 1 && <><button onClick={handlePrevLogo} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronLeftIcon className="w-8 h-8"/></button><button onClick={handleNextLogo} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronRightIcon className="w-8 h-8"/></button></>}</div></div>}
            {currentZoomedBanner && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={handleCloseBannerZoom}><div className="relative" onClick={e => e.stopPropagation()}><img src={currentZoomedBanner.src} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }}/><button onClick={handleCloseBannerZoom} className="absolute -top-2 -right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75"><CloseIcon className="w-5 h-5"/></button>{state.generatedBanners && state.generatedBanners.length > 1 && <><button onClick={handlePrevBanner} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronLeftIcon className="w-8 h-8"/></button><button onClick={handleNextBanner} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronRightIcon className="w-8 h-8"/></button></>}</div></div>}
            {currentZoomedAlbumCover && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={handleCloseAlbumCoverZoom}><div className="relative" onClick={e => e.stopPropagation()}><img src={currentZoomedAlbumCover.src} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }}/><button onClick={handleCloseAlbumCoverZoom} className="absolute -top-2 -right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75"><CloseIcon className="w-5 h-5"/></button>{state.generatedAlbumCovers && state.generatedAlbumCovers.length > 1 && <><button onClick={handlePrevAlbumCover} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronLeftIcon className="w-8 h-8"/></button><button onClick={handleNextAlbumCover} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 hover:bg-accent"><ChevronRightIcon className="w-8 h-8"/></button></>}</div></div>}
        </>
    );
};