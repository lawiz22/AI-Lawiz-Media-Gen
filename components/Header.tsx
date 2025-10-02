import React, { useState, useEffect, useRef } from 'react';
import { Banner } from './Banner';
import { ThemeSwitcher } from './ThemeSwitcher';
import { LogoutIcon, WorkflowIcon, SpinnerIcon, GoogleDriveIcon, AdminIcon, PencilIcon } from './icons';
import { Logo } from './Logo';
import type { User, VersionInfo, DriveFolder } from '../types';

interface HeaderProps {
    theme: string;
    setTheme: (theme: string) => void;
    projectName: string;
    onProjectNameChange: (newName: string) => void;
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
    projectName, onProjectNameChange,
    onOpenSettingsModal,
    onOpenAdminPanel,
    isComfyUIConnected, versionInfo,
    driveFolder, onDriveConnect, onDriveDisconnect,
    isDriveConfigured
}) => {

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (!isEditingName) {
      setEditingName(projectName);
    }
  }, [projectName, isEditingName]);

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
  
  const handleBeginEditing = () => {
    setEditingName(projectName);
    setIsEditingName(true);
  };

  const handleNameChangeCommit = () => {
    if (editingName.trim() && editingName.trim() !== projectName) {
      onProjectNameChange(editingName.trim());
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameChangeCommit();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
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
                 {isEditingName ? (
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                        <input
                            ref={inputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={handleNameChangeCommit}
                            onKeyDown={handleKeyDown}
                            className="text-lg font-bold bg-bg-tertiary border border-accent rounded-md px-2 py-0 text-accent focus:outline-none w-[220px]"
                        />
                    </div>
                ) : (
                    <div
                        className="flex items-center justify-end gap-1.5 cursor-pointer group mt-1"
                        onClick={handleBeginEditing}
                        title="Click to edit project name"
                    >
                        <p className="text-lg font-bold text-accent truncate max-w-[200px] group-hover:underline">{projectName}</p>
                        <PencilIcon className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" />
                    </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-1">
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