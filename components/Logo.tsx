import React from 'react';

export const Logo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg 
    {...props}
    viewBox="0 0 52 52" 
    xmlns="http://www.w3.org/2000/svg" 
    aria-label="LAWIZ Logo"
  >
    <defs>
      <clipPath id="clip0_lz_logo_v2">
        <rect width="52" height="52" rx="26" fill="white"/>
      </clipPath>
    </defs>
    <g clipPath="url(#clip0_lz_logo_v2)">
      {/* Optional: Add a subtle background color that matches the UI */}
      <rect width="52" height="52" fill="var(--color-bg-tertiary)" />
      {/* The 'L' shape - a simple, bold right angle */}
      <path 
        d="M10 10 V 42 H 26" 
        stroke="var(--color-accent)" 
        strokeWidth="6" 
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The 'Z' shape - a dynamic, sharp Z */}
      <path 
        d="M26 10 H 42 L 26 42 H 42" 
        stroke="var(--color-text-primary)" 
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);