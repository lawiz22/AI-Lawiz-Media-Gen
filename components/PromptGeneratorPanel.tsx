import React, { useState } from 'react';
import { ImageUploader } from './ImageUploader';
import { generateComfyUIPromptFromSource, extractBackgroundPromptFromImage } from '../services/comfyUIService';
import { GenerateIcon, SpinnerIcon, CopyIcon, SendIcon } from './icons';

interface PromptGeneratorPanelProps {
    onUsePrompt: (prompt: string) => void;
}

export const PromptGeneratorPanel: React.FC<PromptGeneratorPanelProps> = ({ onUsePrompt }) => {
    // --- State for "Generate Prompt from Image" ---
    const [image, setImage] = useState<File | null>(null);
    const [modelType, setModelType] = useState<'sdxl' | 'flux'>('sdxl');
    const [prompt, setPrompt] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copyButtonText, setCopyButtonText] = useState('Copy Prompt');

    // --- State for "Extract Background from Image" ---
    const [bgImage, setBgImage] = useState<File | null>(null);
    const [bgModelType, setBgModelType] = useState<'sd1.5' | 'sdxl' | 'flux'>('sdxl');
    const [bgPrompt, setBgPrompt] = useState<string>('');
    const [isBgLoading, setIsBgLoading] = useState<boolean>(false);
    const [bgError, setBgError] = useState<string | null>(null);
    const [bgCopyButtonText, setBgCopyButtonText] = useState('Copy Prompt');


    const handleGenerate = async () => {
        if (!image) {
            setError("Please upload an image first.");
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const generatedPrompt = await generateComfyUIPromptFromSource(image, modelType);
            setPrompt(generatedPrompt);
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleCopy = () => {
        if (!prompt) return;
        navigator.clipboard.writeText(prompt)
            .then(() => {
                setCopyButtonText('Copied!');
                setTimeout(() => setCopyButtonText('Copy Prompt'), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy prompt to clipboard.');
            });
    };

    const handleUsePrompt = () => {
        if (prompt) {
            onUsePrompt(prompt);
        }
    };

    const handleBgGenerate = async () => {
        if (!bgImage) {
            setBgError("Please upload an image first.");
            return;
        }
        setIsBgLoading(true);
        setBgError(null);
        try {
            const generatedPrompt = await extractBackgroundPromptFromImage(bgImage, bgModelType);
            setBgPrompt(generatedPrompt);
        } catch (err: any) {
            setBgError(err.message || 'An unknown error occurred.');
        } finally {
            setIsBgLoading(false);
        }
    };
    
    const handleBgCopy = () => {
        if (!bgPrompt) return;
        navigator.clipboard.writeText(bgPrompt)
            .then(() => {
                setBgCopyButtonText('Copied!');
                setTimeout(() => setBgCopyButtonText('Copy Prompt'), 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy prompt to clipboard.');
            });
    };

    const handleUseBgPrompt = () => {
        if (bgPrompt) {
            onUsePrompt(bgPrompt);
        }
    };

    return (
        <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg max-w-4xl mx-auto space-y-8">
            {/* --- Generate Prompt from Image Section --- */}
            <div>
                <h2 className="text-xl font-bold text-accent mb-4">Generate Prompt from Image</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a photo to generate a descriptive prompt using AI. Choose a prompt type optimized for your target model.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column: Uploader & Generate Button */}
                    <div className="space-y-4">
                        <ImageUploader 
                            label="Upload Photo"
                            id="prompt-gen-image"
                            onImageUpload={setImage}
                            sourceFile={image}
                        />
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Prompt Type</label>
                            <div className="flex rounded-md border border-border-primary">
                                <button onClick={() => setModelType('sdxl')} className={`flex-1 p-2 text-sm rounded-l-md transition-colors ${modelType === 'sdxl' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>Simplified (SDXL)</button>
                                <button onClick={() => setModelType('flux')} className={`flex-1 p-2 text-sm rounded-r-md transition-colors border-l border-border-primary ${modelType === 'flux' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>Detailed (FLUX)</button>
                            </div>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={!image || isLoading}
                            style={image && !isLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                        >
                            {isLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isLoading ? 'Generating...' : 'Generate Prompt'}
                        </button>
                    </div>
                    {/* Right Column: Results & Actions */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Prompt
                            </label>
                            <textarea
                                id="generated-prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                readOnly={isLoading}
                                placeholder="Your generated prompt will appear here..."
                                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px]"
                                rows={10}
                            />
                        </div>
                        {error && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{error}</p>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button 
                                onClick={handleCopy}
                                disabled={!prompt || isLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {copyButtonText}
                            </button>
                            <button 
                                onClick={handleUsePrompt}
                                disabled={!prompt || isLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use Prompt for ComfyUI
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <hr className="border-t-2 border-border-primary/50" />

            {/* --- Extract Background from Image Section --- */}
            <div>
                <h2 className="text-xl font-bold text-accent mb-4">Extract Background from Image</h2>
                <p className="text-sm text-text-secondary mb-6">
                    Upload a photo to generate a prompt describing only the background. This is useful for creating consistent environments.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Left Column */}
                    <div className="space-y-4">
                        <ImageUploader 
                            label="Upload Photo"
                            id="bg-extract-image"
                            onImageUpload={setBgImage}
                            sourceFile={bgImage}
                        />
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Prompt Type</label>
                            <div className="flex rounded-md border border-border-primary">
                                <button onClick={() => setBgModelType('sd1.5')} className={`flex-1 p-2 text-sm rounded-l-md transition-colors ${bgModelType === 'sd1.5' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>Very Simple (SD 1.5)</button>
                                <button onClick={() => setBgModelType('sdxl')} className={`flex-1 p-2 text-sm transition-colors border-x border-border-primary ${bgModelType === 'sdxl' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>Simplified (SDXL)</button>
                                <button onClick={() => setBgModelType('flux')} className={`flex-1 p-2 text-sm rounded-r-md transition-colors ${bgModelType === 'flux' ? 'bg-accent text-accent-text' : 'bg-bg-tertiary hover:bg-bg-tertiary-hover'}`}>Detailed (FLUX)</button>
                            </div>
                        </div>
                         <button
                            onClick={handleBgGenerate}
                            disabled={!bgImage || isBgLoading}
                            style={bgImage && !isBgLoading ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-text)' } : {}}
                            className="w-full flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary"
                        >
                            {isBgLoading ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <GenerateIcon className="w-5 h-5" />}
                            {isBgLoading ? 'Generating...' : 'Generate Background Prompt'}
                        </button>
                    </div>
                    {/* Right Column */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="generated-bg-prompt" className="block text-sm font-medium text-text-secondary mb-1">
                                Generated Background Prompt
                            </label>
                            <textarea
                                id="generated-bg-prompt"
                                value={bgPrompt}
                                onChange={(e) => setBgPrompt(e.target.value)}
                                readOnly={isBgLoading}
                                placeholder="Your generated background prompt will appear here..."
                                className="w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent min-h-[228px]"
                                rows={10}
                            />
                        </div>
                         {bgError && (
                            <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                                <p className="font-bold">Error</p>
                                <p>{bgError}</p>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button 
                                onClick={handleBgCopy}
                                disabled={!bgPrompt || isBgLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <CopyIcon className="w-5 h-5" />
                                {bgCopyButtonText}
                            </button>
                             <button 
                                onClick={handleUseBgPrompt}
                                disabled={!bgPrompt || isBgLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50"
                            >
                                <SendIcon className="w-5 h-5" />
                                Use Prompt for ComfyUI
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};