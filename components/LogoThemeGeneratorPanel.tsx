import React from 'react';
import type { LogoThemeState, LibraryItem, LogoStyle, LogoBackground, PaletteColor } from '../types';
import { GenerateIcon, ResetIcon, SpinnerIcon, LibraryIcon, CloseIcon, SaveIcon, CheckIcon, DownloadIcon } from './icons';
import { generateLogos } from '../services/geminiService';
import { saveToLibrary } from '../services/libraryService';
import { dataUrlToThumbnail } from '../utils/imageUtils';

interface LogoThemeGeneratorPanelProps {
    state: LogoThemeState;
    setState: React.Dispatch<React.SetStateAction<LogoThemeState>>;
    onOpenLibraryForReferences: () => void;
    onOpenLibraryForPalette: () => void;
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

const LOGO_STYLES: { id: LogoStyle; label: string; description: string }[] = [
    { id: 'symbolic', label: 'Symbolic / Iconic', description: 'A simple, memorable icon or symbol.' },
    { id: 'wordmark', label: 'Wordmark', description: 'A typography-focused design of the brand name.' },
    { id: 'emblem', label: 'Emblem', description: 'Text integrated within a symbol or badge.' },
    { id: 'abstract', label: 'Abstract', description: 'A unique, non-representational geometric shape.' },
    { id: 'combination', label: 'Combination', description: 'An icon paired with a wordmark.' },
];

const BACKGROUND_OPTIONS: { id: LogoBackground; label: string }[] = [
    { id: 'transparent', label: 'Transparent' },
    { id: 'white', label: 'White' },
    { id: 'black', label: 'Black' },
];

export const LogoThemeGeneratorPanel: React.FC<LogoThemeGeneratorPanelProps> = ({ state, setState, onOpenLibraryForReferences, onOpenLibraryForPalette }) => {
    
    const handleInputChange = (field: keyof LogoThemeState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setState(prev => ({ ...prev, [field]: e.target.value }));
    };
    
    const handleStyleChange = (style: LogoStyle) => {
        setState(prev => ({ ...prev, logoStyle: style }));
    };
    
    const handleBgChange = (bg: LogoBackground) => {
        setState(prev => ({ ...prev, backgroundColor: bg }));
    };
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setState(prev => ({ ...prev, numLogos: parseInt(e.target.value, 10) }));
    };

    const handleRemoveReference = (id: number) => {
        setState(prev => ({
            ...prev,
            referenceItems: prev.referenceItems?.filter(item => item.id !== id)
        }));
    };

    const handleClearPalette = () => {
        setState(prev => ({ ...prev, selectedPalette: null }));
    };
    
    const handleReset = () => {
        setState(prev => ({
            ...prev,
            logoPrompt: '',
            brandName: '',
            slogan: '',
            logoStyle: 'symbolic',
            referenceItems: [],
            selectedPalette: null,
            generatedLogos: [],
            logoError: null,
        }));
    };

    const handleGenerate = async () => {
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
            await saveToLibrary({
                mediaType: 'logo',
                name: state.brandName || `Logo for ${state.logoPrompt?.substring(0, 20)}...`,
                media: logoSrc,
                thumbnail: await dataUrlToThumbnail(logoSrc, 256),
                options: {
                    // We can store some logo-specific metadata here in the future
                } as any,
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

    const selectedPaletteColors = state.selectedPalette ? JSON.parse(state.selectedPalette.media) as PaletteColor[] : [];

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-7xl mx-auto space-y-12">
            <Section 
                title="Logo Generator"
                description="Create unique, professional logos from a text description. Specify style, colors, and content to generate the perfect brand identity."
                borderColor="var(--color-accent)"
            >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* --- Left Column: Controls --- */}
                    <div className="space-y-6">
                        <textarea
                            value={state.logoPrompt}
                            onChange={handleInputChange('logoPrompt')}
                            placeholder="Describe the logo's core concept, e.g., 'a majestic lion head combined with a shield'"
                            className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent"
                            rows={3}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <input type="text" value={state.brandName} onChange={handleInputChange('brandName')} placeholder="Brand Name" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                            <input type="text" value={state.slogan} onChange={handleInputChange('slogan')} placeholder="Slogan (Optional)" className="w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent" />
                        </div>
                        
                        <div>
                            <h3 className="text-md font-semibold text-text-secondary mb-2">Logo Style</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {LOGO_STYLES.map(style => (
                                    <button key={style.id} onClick={() => handleStyleChange(style.id)} title={style.description}
                                        className={`p-3 text-center rounded-lg text-sm transition-colors ${state.logoStyle === style.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-md font-semibold text-text-secondary">Inspiration & Colors</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={onOpenLibraryForReferences} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                    <LibraryIcon className="w-5 h-5"/> Add References
                                </button>
                                <button onClick={onOpenLibraryForPalette} className="flex items-center justify-center gap-2 p-3 bg-bg-tertiary rounded-lg hover:bg-bg-tertiary-hover transition-colors">
                                    <LibraryIcon className="w-5 h-5"/> Select Palette
                                </button>
                            </div>
                             {(state.referenceItems && state.referenceItems.length > 0) && (
                                <div className="p-2 bg-bg-tertiary rounded-md">
                                    <div className="grid grid-cols-4 gap-2">
                                        {state.referenceItems.map(item => (
                                            <div key={item.id} className="relative group">
                                                <img src={item.thumbnail} alt={item.name} className="w-full aspect-square object-cover rounded"/>
                                                <button onClick={() => handleRemoveReference(item.id)} className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <CloseIcon className="w-3 h-3"/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                             {state.selectedPalette && (
                                <div className="p-3 bg-bg-tertiary rounded-md flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex -space-x-2">
                                            {selectedPaletteColors.slice(0, 5).map(c => <div key={c.hex} className="w-6 h-6 rounded-full border-2 border-bg-tertiary" style={{backgroundColor: c.hex}}></div>)}
                                        </div>
                                        <p className="text-sm font-semibold truncate">{state.selectedPalette.name}</p>
                                    </div>
                                    <button onClick={handleClearPalette} className="p-1 text-text-secondary hover:text-white"><CloseIcon className="w-4 h-4"/></button>
                                </div>
                            )}
                        </div>

                        <div>
                            <h3 className="text-md font-semibold text-text-secondary mb-2">Settings</h3>
                            <div className="p-4 bg-bg-tertiary rounded-lg space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary">Number of Logos: {state.numLogos}</label>
                                    <input type="range" min="1" max="4" step="1" value={state.numLogos} onChange={handleSliderChange} className="w-full h-2 mt-1 bg-bg-primary rounded-lg appearance-none cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Background</label>
                                    <div className="flex items-center gap-2">
                                        {BACKGROUND_OPTIONS.map(bg => (
                                            <button key={bg.id} onClick={() => handleBgChange(bg.id)} className={`flex-1 p-2 text-xs rounded-md ${state.backgroundColor === bg.id ? 'bg-accent text-accent-text font-bold' : 'bg-bg-primary hover:bg-bg-tertiary-hover'}`}>{bg.label}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <button onClick={handleReset} disabled={state.isGeneratingLogos} className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50">
                                <ResetIcon className="w-5 h-5"/> Reset
                            </button>
                             <button onClick={handleGenerate} disabled={state.isGeneratingLogos} style={!state.isGeneratingLogos ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}} className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                                {state.isGeneratingLogos ? <SpinnerIcon className="w-5 h-5 animate-spin"/> : <GenerateIcon className="w-5 h-5"/>}
                                {state.isGeneratingLogos ? 'Generating...' : 'Generate Logos'}
                            </button>
                        </div>
                    </div>
                    {/* --- Right Column: Results --- */}
                    <div className="space-y-4">
                        {state.logoError && <p className="text-danger text-center bg-danger-bg p-3 rounded-md">{state.logoError}</p>}

                        {state.isGeneratingLogos ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl shadow-inner h-full min-h-[400px]">
                                <SpinnerIcon className="w-16 h-16 text-accent animate-spin mb-4" />
                                <h3 className="text-lg font-bold text-text-primary">Generating your logos...</h3>
                            </div>
                        ) : (state.generatedLogos && state.generatedLogos.length > 0) ? (
                            <div className="grid grid-cols-2 gap-4">
                                {state.generatedLogos.map((logo, index) => (
                                    <div key={index} className="group relative aspect-square bg-bg-primary p-2 rounded-lg flex items-center justify-center">
                                        <img src={logo.src} alt={`Generated Logo ${index + 1}`} className="max-w-full max-h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                            <button 
                                                onClick={() => handleDownloadLogo(logo.src, index)} 
                                                className="w-full flex items-center justify-center gap-2 text-sm bg-bg-tertiary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-accent hover:text-accent-text transition-colors duration-200"
                                            >
                                                <DownloadIcon className="w-4 h-4"/>
                                                <span>Download</span>
                                            </button>
                                            <button 
                                                onClick={() => handleSaveLogo(logo.src, index)} 
                                                disabled={logo.saved !== 'idle'}
                                                className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-2 px-3 rounded-lg transition-colors duration-200 ${
                                                    logo.saved === 'saved' ? 'bg-green-500 text-white cursor-default' :
                                                    logo.saved === 'saving' ? 'bg-bg-tertiary text-text-secondary cursor-wait' :
                                                    'bg-bg-tertiary text-text-secondary hover:bg-accent hover:text-accent-text'
                                                }`}
                                            >
                                                {logo.saved === 'saving' ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : logo.saved === 'saved' ? <CheckIcon className="w-4 h-4" /> : <SaveIcon className="w-4 h-4" />}
                                                <span>{logo.saved === 'saving' ? 'Saving...' : logo.saved === 'saved' ? 'Saved' : 'Save to Library'}</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-tertiary rounded-2xl shadow-inner h-full min-h-[400px]">
                                <GenerateIcon className="w-16 h-16 text-border-primary mb-4" />
                                <h3 className="text-lg font-bold text-text-primary">Your generated logos will appear here</h3>
                                <p className="text-text-secondary max-w-xs">Configure your options and click "Generate Logos".</p>
                            </div>
                        )}
                    </div>
                </div>

            </Section>

            <Section 
                title="Banner Generator"
                description="Design eye-catching banners for social media, websites, or advertisements. Combine text and imagery for impactful visuals."
                borderColor="var(--color-highlight-green)"
            >
                <div className="text-center text-text-muted p-8 bg-bg-tertiary rounded-md">
                    <p>Banner Generator controls will be here.</p>
                </div>
            </Section>

            <Section 
                title="Album Cover Generator"
                description="Produce stunning album art that captures the essence of your music. Generate visuals based on genre, mood, and artist name."
                borderColor="var(--color-highlight-yellow)"
            >
                <div className="text-center text-text-muted p-8 bg-bg-tertiary rounded-md">
                    <p>Album Cover Generator controls will be here.</p>
                </div>
            </Section>

            <Section 
                title="Theme Generator"
                description="Generate a cohesive color palette and style guide for your project. Describe a concept to get hex codes, font suggestions, and mood boards."
                borderColor="#ec4899" // Synthwave accent for variety
            >
                <div className="text-center text-text-muted p-8 bg-bg-tertiary rounded-md">
                    <p>Theme Generator controls will be here.</p>
                </div>
            </Section>
        </div>
    );
};