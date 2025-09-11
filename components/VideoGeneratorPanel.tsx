import React, { useState } from 'react';
import { GenerateIcon, ResetIcon, VideoIcon } from './icons';

export const VideoGeneratorPanel: React.FC = () => {
    const [provider, setProvider] = useState<'gemini' | 'comfyui'>('gemini');
    
    const renderProviderSwitch = () => (
        <div className="bg-bg-tertiary p-1 rounded-full grid grid-cols-2 gap-1">
            <button 
                onClick={() => setProvider('gemini')} 
                disabled
                className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${provider === 'gemini' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                Gemini
            </button>
            <button 
                onClick={() => setProvider('comfyui')} 
                disabled
                className={`px-4 py-2 text-sm font-bold rounded-full transition-colors ${provider === 'comfyui' ? 'bg-accent text-accent-text shadow-md' : 'hover:bg-bg-secondary'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                ComfyUI
            </button>
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Column for Controls */}
            <div className="lg:col-span-1 space-y-8">
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
                    <h2 className="text-xl font-bold mb-4 text-accent">1. Upload Media & Set Prompt</h2>
                    <div className="space-y-4">
                        <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg border-border-primary bg-bg-tertiary/50">
                            <VideoIcon className="w-8 h-8 mb-3 text-text-secondary" />
                            <p className="mb-2 text-sm text-text-secondary">
                                <span className="font-semibold text-accent">Video Upload</span> coming soon
                            </p>
                            <p className="text-xs text-text-muted">MP4, MOV, WEBM</p>
                        </div>
                    </div>
                </div>
                <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg space-y-8">
                    <div>
                        <h2 className="text-xl font-bold mb-4 text-accent">2. Configure Generation</h2>
                        {renderProviderSwitch()}
                    </div>
                    <div className="text-text-secondary text-center p-4 border border-dashed border-border-primary rounded-lg min-h-[100px] flex items-center justify-center">
                        Video generation options will appear here.
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-accent tracking-wider uppercase border-b-2 border-accent/30 pb-2">Actions</h3>
                        <div className="space-y-4 pt-4">
                            <div className="grid grid-cols-2 gap-4">
                                <button disabled className="flex items-center justify-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-3 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <ResetIcon className="w-5 h-5"/> Reset
                                </button>
                                <button disabled className="flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-bg-tertiary text-text-secondary">
                                    <GenerateIcon className="w-5 h-5"/> Generate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right column for results */}
            <div className="lg:col-span-2 sticky top-24">
                <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-secondary rounded-2xl shadow-lg h-full min-h-[500px]">
                    <VideoIcon className="w-16 h-16 text-border-primary mb-4" />
                    <h3 className="text-lg font-bold text-text-primary">Your generated videos will appear here</h3>
                    <p className="text-text-secondary max-w-xs">Video generation capabilities are coming soon. Stay tuned!</p>
                </div>
            </div>
        </div>
    );
};