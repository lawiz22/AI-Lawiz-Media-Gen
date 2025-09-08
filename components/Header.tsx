import React from 'react';
import { Banner } from './Banner';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LogoutIcon } from './icons';
import type { User } from '../types';

interface HeaderProps {
    theme: string;
    setTheme: (theme: string) => void;
    onLogout: () => void;
    currentUser: User;
}

export const Header: React.FC<HeaderProps> = ({ theme, setTheme, onLogout, currentUser }) => {
  return (
    <header className="bg-bg-secondary/50 backdrop-blur-sm p-4 shadow-lg sticky top-0 z-10 border-b border-border-primary">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-border-primary">
                <img 
                    src="https://storage.ko-fi.com/cdn/useruploads/641ac8f7-0ccd-47d0-b775-532bf235d9c4_7f5b18e9-ba-4cb3-a029-d6d243fdaabe.png" 
                    alt="zGenMedia Logo" 
                    className="w-full h-full object-cover"
                />
            </div>
            <Banner />
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-text-primary">Welcome, {currentUser.username}</p>
                <p className="text-xs text-text-secondary">{currentUser.role === 'admin' ? 'Administrator' : 'User'}</p>
            </div>
            <ThemeSwitcher currentTheme={theme} setTheme={setTheme} />
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
