import React from 'react';

interface ThemeSwitcherProps {
  currentTheme: string;
  setTheme: (theme: string) => void;
}

const themes = [
  {
    name: 'cyberpunk',
    label: 'Cyberpunk',
    colors: { bg: '#06b6d4', ring: '#0e7490' },
  },
  {
    name: 'synthwave',
    label: 'Synthwave',
    colors: { bg: '#ec4899', ring: '#be185d' },
  },
  {
    name: 'studio-light',
    label: 'Studio Light',
    colors: { bg: '#2563eb', ring: '#1e40af' },
  },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ currentTheme, setTheme }) => {
  return (
    <div className="flex items-center gap-2 p-1 bg-bg-tertiary rounded-full">
      {themes.map((theme) => (
        <button
          key={theme.name}
          title={theme.label}
          onClick={() => setTheme(theme.name)}
          className={`w-6 h-6 rounded-full transition-all duration-200 focus:outline-none ${
            currentTheme === theme.name
              ? 'ring-2 ring-offset-2 ring-offset-bg-secondary'
              : 'scale-90 opacity-60 hover:opacity-100 hover:scale-100'
          }`}
          style={{
            backgroundColor: theme.colors.bg,
            // @ts-ignore
            '--tw-ring-color': theme.colors.ring,
          }}
          aria-pressed={currentTheme === theme.name}
        />
      ))}
    </div>
  );
};
