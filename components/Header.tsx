
import React from 'react';
import { Banner } from './Banner';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LogoutIcon, WorkflowIcon, HistoryIcon, SpinnerIcon } from './icons';
import { Logo } from './Logo';
import type { User } from '../types';

interface HeaderProps {
    theme: string;
    setTheme: (theme: string) => void;
    onLogout: () => void;
    currentUser: User;
    onOpenComfyModal: () => void;
    onOpenHistoryPanel: () => void;
    isComfyUIConnected: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({ theme, setTheme, onLogout, currentUser, onOpenComfyModal, onOpenHistoryPanel, isComfyUIConnected }) => {
  return (
    <header className="bg-bg-secondary/50 backdrop-blur-sm p-4 shadow-lg sticky top-0 z-10 border-b border-border-primary">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex-shrink-0">
                <Logo />
            </div>
            <Banner />
        </div>
        <div className="flex items-center gap-2 md:gap-4">
            <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-text-primary">Welcome, {currentUser.username}</p>
                <p className="text-xs text-text-secondary">{currentUser.role === 'admin' ? 'Administrator' : 'User'}</p>
                 <div className="mt-1">
                    {isComfyUIConnected === null ? (
                        <div className="flex items-center justify-end gap-1 text-xs text-text-muted">
                        <SpinnerIcon className="h-3 w-3 animate-spin" />
                        <span>Checking...</span>
                        </div>
                    ) : (
                        <div className={`flex items-center justify-end gap-1.5 text-xs font-semibold ${isComfyUIConnected ? 'text-green-400' : 'text-danger'}`}>
                        <span className={`h-2 w-2 rounded-full ${isComfyUIConnected ? 'bg-green-400' : 'bg-danger'}`}></span>
                        <span>COMFYUI {isComfyUIConnected ? 'Connected' : 'Not Connected'}</span>
                        </div>
                    )}
                </div>
            </div>
            <ThemeSwitcher currentTheme={theme} setTheme={setTheme} />
            <button 
                onClick={onOpenHistoryPanel}
                title="Generation History"
                className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            >
                <HistoryIcon className="w-5 h-5" />
            </button>
             <button 
                onClick={onOpenComfyModal}
                title="ComfyUI Connection"
                className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            >
                <WorkflowIcon className="w-5 h-5" />
            </button>
            <button 
                onClick={onLogout}
                title="Logout"
                className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            >
                <LogoutIcon className="w-5 h-5" />
            </button>
        </div>
      </div>
    </header>
  );
};
