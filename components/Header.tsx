
import React from 'react';
import { Banner } from './Banner';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LogoutIcon, WorkflowIcon, SpinnerIcon, GoogleDriveIcon, AdminIcon } from './icons';
import { Logo } from './Logo';
import type { User, VersionInfo, DriveFolder } from '../types';

interface HeaderProps {
    theme: string;
    setTheme: (theme: string) => void;
    onLogout: () => void;
    currentUser: User;
    onOpenSettingsModal: () => void;
    onOpenAdminPanel: () => void;
    isComfyUIConnected: boolean | null;
    versionInfo: VersionInfo | null;
    driveFolder: DriveFolder | null;
    onDriveConnect: () => void;
    onDriveDisconnect: () => void;
    isDriveConfigured: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
    theme, setTheme, onLogout, currentUser, 
    onOpenSettingsModal,
    onOpenAdminPanel,
    isComfyUIConnected, versionInfo,
    driveFolder, onDriveConnect, onDriveDisconnect,
    isDriveConfigured
}) => {

  const driveButtonTitle = driveFolder 
    ? `Connected to Drive folder: "${driveFolder.name}". Click to disconnect.`
    : "Connect to Google Drive to sync your library.";

  const handleDriveClick = () => {
    if (driveFolder) {
      if (window.confirm(`Are you sure you want to disconnect from the Google Drive folder "${driveFolder.name}"?`)) {
        onDriveDisconnect();
      }
    } else {
      onDriveConnect();
    }
  };

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
                <div className="flex items-center justify-end gap-2">
                    {versionInfo && (
                        <div
                            className="text-xs text-text-muted cursor-help"
                            title={`Updated: ${new Date(versionInfo.date).toLocaleString()}\n\nChanges: ${versionInfo.changes}`}
                        >
                            v{versionInfo.version}
                        </div>
                    )}
                    <p className="text-xs text-text-secondary">{currentUser.role === 'admin' ? 'Administrator' : 'User'}</p>
                </div>
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
                onClick={onOpenSettingsModal}
                title="Connection Settings"
                className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
            >
                <WorkflowIcon className="w-5 h-5" />
            </button>
            {isDriveConfigured && (
                 <button 
                    onClick={handleDriveClick}
                    title={driveButtonTitle}
                    className={`p-2 rounded-full transition-colors ${!!driveFolder ? 'bg-accent text-accent-text hover:bg-accent-hover' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary'}`}
                >
                    <GoogleDriveIcon className="w-5 h-5" />
                </button>
            )}
            {currentUser.role === 'admin' && (
                <>
                    <button 
                        onClick={onOpenAdminPanel}
                        title="Admin Panel"
                        className="p-2 rounded-full bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary-hover hover:text-text-primary transition-colors"
                    >
                        <AdminIcon className="w-5 h-5" />
                    </button>
                </>
            )}
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
