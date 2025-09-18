import React, { useState, useCallback, useEffect } from 'react';
import type { LogoThemeState, LibraryItem, LogoStyle, LogoBackground, PaletteColor, BannerStyle, BannerLogoPlacement, BannerAspectRatio } from '../types';
import { GenerateIcon, ResetIcon, SpinnerIcon, LibraryIcon, CloseIcon, SaveIcon, CheckIcon, DownloadIcon, UploadIconSimple, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { generateLogos, generateBanners } from '../services/geminiService';
import { saveToLibrary } from '../services/libraryService';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { BANNER_ASPECT_RATIO_OPTIONS, BANNER_STYLE_OPTIONS, BANNER_LOGO_PLACEMENT_OPTIONS } from '../constants';

interface LogoThemeGeneratorPanelProps {
    state: LogoThemeState;
    setState: React.Dispatch<React.SetStateAction<LogoThemeState>>;
    activeSubTab: string;
    setActiveSubTab: (tabId: string) => void;
    onOpenLibraryForReferences: () => void;
    onOpenLibraryForPalette: () => void;
    onOpenLibraryForBannerReferences: () => void;
    onOpenLibraryForBannerPalette: () => void;
    onOpenLibraryForBannerLogo: () => void;
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

const FONT_STYLE_ADJECTIVES = [
    'Bold', 'Italic', 'Script', 'Sans-serif', 'Serif', 'Modern', 'Minimalist',
    'Groovy', 'Psychedelic', 'Futuristic', 'Retro', 'Grunge', 'Elegant',
    'Playful', 'Hand-drawn', 'Geometric', 'Blocky', 'Stencil', 'Bubbly'
];


export const LogoThemeGeneratorPanel: React.FC<LogoThemeGeneratorPanelProps> = ({ state, setState, activeSubTab, setActiveSubTab, onOpenLibraryForReferences, onOpenLibraryForPalette, onOpenLibraryForBannerReferences, onOpenLibraryForBannerPalette, onOpenLibraryForBannerLogo }) => {
    const [zoomedLogoIndex, setZoomedLogoIndex] = useState<number | null>(null);
    const [zoomedBannerIndex, setZoomedBannerIndex] = useState<number | null>(null);
    
    const subTabs = [
        { id: 'logo', label: 'Logo Generator' },
        { id: 'banner', label: 'Banner Generator' },
    ];

    const handleInputChange = (field: keyof LogoThemeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setState(prev => ({ ...prev, [field]: e.target.value }));
    };
    
    const handleStyleChange = (style: LogoStyle) => {
        setState(prev => ({ ...prev, logoStyle: style }));
    };
    
    const handleBgChange = (bg: LogoBackground) => {
        setState(prev => ({ ...prev, backgroundColor: bg }));
    };
    
    const handleSliderChange = (field: keyof LogoThemeState) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setState(prev => ({ ...prev, [field]: parseInt(e.target.value, 10) }));
    };

    const handleRemoveReference = (id: number, type: 'logo' | 'banner') => {
        if (type === 'logo') {
            setState(prev => ({ ...prev, referenceItems: prev.referenceItems?.filter(item => item.id !== id) }));
        } else {
            setState(prev => ({ ...prev, bannerReferenceItems: prev.bannerReferenceItems?.filter(item => item.id !== id) }));
        }
    };

    const handleClearPalette = (type: 'logo' | 'banner') => {
        if (type === 'logo') {
            setState(prev => ({ ...prev, selectedPalette: null }));
        } else {
            setState(prev => ({ ...prev, bannerSelectedPalette: null }));
        }
    };

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
    
        const newItems: LibraryItem[] = await Promise.all(files.map(async (file, index) => {
            const media = await fileToDataUrl(file);
            const thumbnail = await dataUrlToThumbnail(media, 128);
            return { id: Date.now() + index, name: file.name, mediaType: 'image' as const, media, thumbnail };
        }));
    
        if (type === 'logo') {
            setState(prev => ({ ...prev, referenceItems: [...(prev.referenceItems || []), ...newItems] }));
        } else {
            setState(prev => ({ ...prev, bannerReferenceItems: [...(prev.bannerReferenceItems || []), ...newItems] }));
        }
        e.target.value = '';
    };

    const handleFontAdjectiveToggle = (adjective: string, type: 'logo' | 'banner') => {
        if (type === 'logo') {
            setState(prev => {
                const currentAdjectives = prev.fontStyleAdjectives || [];
                const newAdjectives = currentAdjectives.includes(adjective)
                    ? currentAdjectives.filter(adj => adj !== adjective)
                    : [...currentAdjectives, adjective];
                return { ...prev, fontStyleAdjectives: newAdjectives };
            });
        } else { // banner
             setState(prev => {
                const currentAdjectives = prev.bannerFontStyleAdjectives || [];
                const newAdjectives = currentAdjectives.includes(adjective)
                    ? currentAdjectives.filter(adj => adj !== adjective)
                    : [...currentAdjectives, adjective];
                return { ...prev, bannerFontStyleAdjectives: newAdjectives };
            });
        }
    };
    
    const handleLogoReset = () => {
        setState(prev => ({
            ...prev,
            logoPrompt: '', brandName: '', slogan: '', logoStyle: 'symbolic',
            fontStyleAdjectives: [],
            referenceItems: [], selectedPalette: null, generatedLogos: [], logoError: null
        }));
    };

    const handleGenerateLogos = async () => {
        setState(prev => ({ ...prev, isGeneratingLogos: true, logoError: null, generatedLogos: [] }));
        try {
            const logos = await generateLogos(state);
            setState(prev => ({ ...prev, generatedLogos: logos.map(src => ({ src, saved: 'idle' })) }));
        } catch (err: any) {
            setState(prev => ({ ...prev, logoError: err.message || "An unknown error occurred." }));
        } finally {
            setState(prev => ({ ...prev, isGeneratingLogos: false }));
        }
    };
    
    const handleSaveLogo = async (logoSrc: string, index: number) => {
        setState(prev => {
            const updatedLogos = [...(prev.generatedLogos || [])];
            updatedLogos[index] = { ...updatedLogos[index], saved: 'saving' };
            return { ...prev, generatedLogos: updatedLogos };
        });

        try {
            let logoName = 'Logo';
            const styleLabel = LOGO_STYLES.find(s => s.id === state.logoStyle)?.label || state.logoStyle;
            logoName = state.brandName ? `${state.brandName} - ${styleLabel} Logo` : state.logoPrompt ? `Logo for "${state.logoPrompt.substring(0, 25)}..." - ${styleLabel}` : `${styleLabel} Logo Concept`;

            await saveToLibrary({
                mediaType: 'logo', name: logoName, media: logoSrc, thumbnail: await dataUrlToThumbnail(logoSrc, 256),
                options: {} as any,
            });
             setState(prev => {
                const updatedLogos = [...(prev.generatedLogos || [])];
                updatedLogos[index] = { ...updatedLogos[index], saved: 'saved' };
                return { ...prev, generatedLogos: updatedLogos };
            });
        } catch (e) {
            console.error("Failed to save logo to library", e);
             setState(prev => {
                const updatedLogos = [...(prev.generatedLogos || [])];
                updatedLogos[index] = { ...updatedLogos[index], saved: 'idle' };
                return { ...prev, generatedLogos: updatedLogos };
            });
        }
    };

    const handleDownloadLogo = (logoSrc: string, index: number) => {
        const link = document.createElement('a');
        link.href = logoSrc;
        link.download = `${(state.brandName || 'logo').replace(/\s+/g, '_')}_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const handleBannerReset = () => {
        setState(prev => ({
            ...prev,
            bannerPrompt: '', bannerTitle: '', bannerAspectRatio: '16:9', bannerStyle: 'corporate-clean',
            bannerFontStyleAdjectives: [],
            bannerReferenceItems: [], bannerSelectedPalette: null, bannerSelectedLogo: null, bannerLogoPlacement: 'top-left',
            generatedBanners: [], bannerError: null
        }));
    };

    const handleGenerateBanners = async () => {
        setState(prev => ({ ...prev, isGeneratingBanners: true, bannerError: null, generatedBanners: [] }));
        try {
            const banners = await generateBanners(state);
            setState(prev => ({ ...prev, generatedBanners: banners.map(src => ({ src, saved: 'idle' })) }));
        } catch (err: any) {
            setState(prev => ({ ...prev, bannerError: err.message || "An unknown error occurred." }));
        } finally {
            setState(prev => ({ ...prev, isGeneratingBanners: false }));
        }
    };

    const handleSaveBanner = async (bannerSrc: string, index: number) => {
        setState(prev => {
            const updatedBanners = [...(prev.generatedBanners || [])];
            updatedBanners[index] = { ...updatedBanners[index], saved: 'saving' };
            return { ...prev, generatedBanners: updatedBanners };
        });
        try {
            const name = state.bannerTitle || state.bannerPrompt?.substring(0, 30) || 'Banner';
            await saveToLibrary({ mediaType: 'banner', name: `Banner: ${name}`, media: bannerSrc, thumbnail: await dataUrlToThumbnail(bannerSrc, 256), options: {} as any });
            setState(prev => {
                const updatedBanners = [...(prev.generatedBanners || [])];
                updatedBanners[index] = { ...updatedBanners[index], saved: 'saved' };
                return { ...prev, generatedBanners: updatedBanners };
            });
        } catch(e) {
            console.error("Failed to save banner", e);
            setState(prev => {
                const updatedBanners = [...(prev.generatedBanners || [])];
                updatedBanners[index] = { ...updatedBanners[index], saved: 'idle' };
                return { ...prev, generatedBanners: updatedBanners };
            });
        }
    };

    const handleDownloadBanner = (bannerSrc: string, index: number) => {
        const link = document.createElement('a');
        link.href = bannerSrc;
        link.download = `banner_${(state.bannerTitle || 'design').replace(/\s+/g, '_')}_${index + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const selectedPaletteColors = state.selectedPalette ? JSON.parse(state.selectedPalette.media) as PaletteColor[] : [];
    const bannerSelectedPaletteColors = state.bannerSelectedPalette ? JSON.parse(state.bannerSelectedPalette.media) as PaletteColor[] : [];
    const currentZoomedLogo = zoomedLogoIndex !== null ? state.generatedLogos?.[zoomedLogoIndex] : null;
    const currentZoomedBanner = zoomedBannerIndex !== null ? state.generatedBanners?.[zoomedBannerIndex] : null;

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
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Typography</h3>
                                    <div className="p-3 bg-bg-tertiary rounded-lg">
                                        <label className="block text-sm font-medium text-text-primary mb-2">Font Style Adjectives</label>
                                        <div className="flex flex-wrap gap-2">
                                            {FONT_STYLE_ADJECTIVES.map(adj => (
                                                <button key={adj} onClick={() => handleFontAdjectiveToggle(adj, 'logo')} className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${state.fontStyleAdjectives?.includes(adj) ? 'bg-accent text-accent-text' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{adj}</button>
                                            ))}
                                        </div>
                                    </div>
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
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{BANNER_STYLE_OPTIONS.map(style => <button key={style.id} onClick={() => setState(p => ({...p, bannerStyle: style.id}))} title={style.description} className={`p-3 text-center rounded-lg text-sm transition-colors ${state.bannerStyle === style.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>{style.label}</button>)}</div>
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Typography</h3>
                                    <div className="p-3 bg-bg-tertiary rounded-lg">
                                        <label className="block text-sm font-medium text-text-primary mb-2">Font Style Adjectives</label>
                                        <div className="flex flex-wrap gap-2">
                                            {FONT_STYLE_ADJECTIVES.map(adj => (
                                                <button key={adj} onClick={() => handleFontAdjectiveToggle(adj, 'banner')} className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${state.bannerFontStyleAdjectives?.includes(adj) ? 'bg-accent text-accent-text' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{adj}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <button onClick={onOpenLibraryForBannerReferences} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Images</button>
                                        <button onClick={onOpenLibraryForBannerPalette} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Palette</button>
                                        <button onClick={onOpenLibraryForBannerLogo} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover"><LibraryIcon className="w-5 h-5"/> Logo</button>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        {state.bannerSelectedLogo && <div className="relative group"><img src={state.bannerSelectedLogo.thumbnail} className="w-16 h-16 object-contain rounded bg-bg-primary/50 p-1"/><button onClick={() => setState(p => ({...p, bannerSelectedLogo: null}))} className="absolute -top-1 -right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>}
                                        {state.bannerSelectedPalette && <div className="relative group flex items-center gap-2 p-2 rounded-md bg-bg-primary/50"><div className="flex -space-x-2">{bannerSelectedPaletteColors.slice(0, 4).map(c => <div key={c.hex} className="w-8 h-8 rounded-full border-2 border-bg-tertiary" style={{backgroundColor: c.hex}}></div>)}</div><button onClick={() => handleClearPalette('banner')} className="p-1 text-text-secondary hover:text-white opacity-0 group-hover:opacity-100"><CloseIcon className="w-4 h-4"/></button></div>}
                                    </div>
                                    {(state.bannerReferenceItems && state.bannerReferenceItems.length > 0) && <div className="p-2 bg-bg-primary/50 rounded-md"><div className="grid grid-cols-4 gap-2">{state.bannerReferenceItems.map(item => <div key={item.id} className="relative group"><img src={item.thumbnail} alt={item.name} className="w-full aspect-square object-cover rounded"/><button onClick={() => handleRemoveReference(item.id, 'banner')} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100"><CloseIcon className="w-3 h-3"/></button></div>)}</div></div>}
                                </div>
                                <div>
                                    <h3 className="text-md font-semibold text-text-secondary mb-2">Settings</h3>
                                    <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                        <div><label className="block text-sm font-medium text-text-secondary">Number of Banners: {state.numBanners}</label><input type="range" min="1" max="4" step="1" value={state.numBanners} onChange={handleSliderChange('numBanners')} className="w-full h-2 mt-1 bg-bg-primary rounded-lg" /></div>
                                        <div><label className="block text-sm font-medium text-text-secondary mb-2">Aspect Ratio</label><select value={state.bannerAspectRatio} onChange={(e) => setState(p=>({...p, bannerAspectRatio: e.target.value as BannerAspectRatio}))} className="w-full bg-bg-primary border border-border-primary p-2 rounded-md text-sm">{BANNER_ASPECT_RATIO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                        <div><label className="block text-sm font-medium text-text-secondary mb-2">Logo Placement</label><div className="grid grid-cols-3 gap-2">{BANNER_LOGO_PLACEMENT_OPTIONS.map(opt => <button key={opt.id} onClick={() => setState(p=>({...p, bannerLogoPlacement: opt.id}))} className={`p-2 text-xs rounded-md ${state.bannerLogoPlacement === opt.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{opt.label}</button>)}</div></div>
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
            </div>
            {currentZoomedLogo && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={handleCloseLogoZoom}><div className="relative" onClick={e => e.stopPropagation()}><img src={currentZoomedLogo.src} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }}/><button onClick={handleCloseLogoZoom} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 z-10"><CloseIcon className="w-5 h-5" /></button></div>{state.generatedLogos && state.generatedLogos.length > 1 && <><button onClick={(e) => { e.stopPropagation(); handlePrevLogo(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text"><ChevronLeftIcon className="w-8 h-8" /></button><button onClick={(e) => { e.stopPropagation(); handleNextLogo(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text"><ChevronRightIcon className="w-8 h-8" /></button></>}<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-bg-secondary/80 p-3 rounded-full" onClick={e => e.stopPropagation()}><button onClick={() => handleDownloadLogo(currentZoomedLogo.src, zoomedLogoIndex!)} className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text"><DownloadIcon className="w-6 h-6" /></button><button onClick={() => handleSaveLogo(currentZoomedLogo.src, zoomedLogoIndex!)} disabled={currentZoomedLogo.saved !== 'idle'} className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text disabled:opacity-50">{currentZoomedLogo.saved === 'saving' ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : currentZoomedLogo.saved === 'saved' ? <CheckIcon className="w-6 h-6" /> : <SaveIcon className="w-6 h-6" />}</button></div></div>}
            {currentZoomedBanner && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={handleCloseBannerZoom}><div className="relative" onClick={e => e.stopPropagation()}><img src={currentZoomedBanner.src} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: '80vh', maxWidth: '80vw' }}/><button onClick={handleCloseBannerZoom} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/75 z-10"><CloseIcon className="w-5 h-5" /></button></div>{state.generatedBanners && state.generatedBanners.length > 1 && <><button onClick={(e) => { e.stopPropagation(); handlePrevBanner(); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text"><ChevronLeftIcon className="w-8 h-8" /></button><button onClick={(e) => { e.stopPropagation(); handleNextBanner(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-bg-secondary/50 text-text-primary hover:bg-accent hover:text-accent-text"><ChevronRightIcon className="w-8 h-8" /></button></>}<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-bg-secondary/80 p-3 rounded-full" onClick={e => e.stopPropagation()}><button onClick={() => handleDownloadBanner(currentZoomedBanner.src, zoomedBannerIndex!)} className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text"><DownloadIcon className="w-6 h-6" /></button><button onClick={() => handleSaveBanner(currentZoomedBanner.src, zoomedBannerIndex!)} disabled={currentZoomedBanner.saved !== 'idle'} className="p-3 rounded-full text-text-primary hover:bg-accent hover:text-accent-text disabled:opacity-50">{currentZoomedBanner.saved === 'saving' ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : currentZoomedBanner.saved === 'saved' ? <CheckIcon className="w-6 h-6" /> : <SaveIcon className="w-6 h-6" />}</button></div></div>}
        </>
    );
};