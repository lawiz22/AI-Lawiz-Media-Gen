import React, { useState, useEffect } from 'react';
import { Banner } from './Banner';
import { SpinnerIcon } from './icons';
import { Logo } from './Logo';
import type { VersionInfo } from '../types';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<string | true>;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch('/version.json')
      .then(res => res.json())
      .then(data => setVersionInfo(data))
      .catch(err => console.error("Failed to load version info:", err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await onLogin(username, password);
      if (typeof result === 'string') {
        setError(result);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
            <div className="flex justify-center items-center gap-4 mb-4">
                 <div className="w-16 h-16 flex-shrink-0">
                    <Logo />
                </div>
                <Banner />
            </div>
            <p className="text-text-secondary">Please enter your credentials to continue.</p>
        </div>
        
        <div className="bg-bg-secondary p-8 rounded-2xl shadow-2xl border border-border-primary">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label 
                htmlFor="username" 
                className="block text-sm font-medium text-text-secondary"
              >
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent shadow-sm disabled:opacity-50"
                placeholder="e.g., admin"
              />
            </div>
            
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-text-secondary"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-3 text-sm focus:ring-accent focus:border-accent shadow-sm disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-danger-bg text-danger text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-accent-text bg-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-hover transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isLoading && <SpinnerIcon className="w-5 h-5 animate-spin" />}
              {isLoading ? 'Authenticating...' : 'Enter Application'}
            </button>
          </form>
        </div>

        <footer className="text-center p-4 mt-8 text-text-muted text-xs">
            {versionInfo && <p className="mb-2">v{versionInfo.version}</p>}
            <p>lawiz2222@gmail.com for info</p>
        </footer>
      </div>
    </div>
  );
};