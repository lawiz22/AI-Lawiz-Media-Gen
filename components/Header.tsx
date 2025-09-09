import React from 'react';
import { Banner } from './Banner';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LogoutIcon } from './icons';
import { Logo } from './Logo';
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
            <div className="w-12 h-12 flex-shrink-0">
                <Logo />
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
