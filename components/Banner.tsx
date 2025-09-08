import React from 'react';

export const Banner: React.FC = () => {
  return (
    <svg 
      viewBox="0 0 400 60" 
      xmlns="http://www.w3.org/2000/svg"
      className="w-64 sm:w-80 md:w-96 h-auto"
      aria-labelledby="bannerTitle"
    >
      <title id="bannerTitle">LAWIZ'S Portrait Generator</title>
      <defs>
        <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');
          .title-text, .subtitle-text {
            font-family: 'Orbitron', sans-serif;
            fill: var(--color-banner-fill);
            transition: fill 0.3s ease, text-shadow 0.3s ease;
          }
          .title-text {
            text-shadow: 
              0 0 3px var(--color-banner-glow-1),
              0 0 5px var(--color-banner-glow-1),
              0 0 10px var(--color-banner-glow-1);
            animation: pulse 4s infinite ease-in-out;
          }
          .subtitle-text {
            filter: url(#neon-glow);
            text-shadow: 0 0 2px var(--color-banner-glow-1);
            animation: pulse 4s infinite ease-in-out reverse;
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              text-shadow: 
                0 0 3px var(--color-banner-glow-1),
                0 0 5px var(--color-banner-glow-1),
                0 0 10px var(--color-banner-glow-1);
            }
            50% {
              opacity: 0.85;
               text-shadow: 
                0 0 5px var(--color-banner-glow-1),
                0 0 10px var(--color-banner-glow-1),
                0 0 15px var(--color-banner-glow-2);
            }
          }
        `}
      </style>
      
      <text x="0" y="25" fontSize="24" fontWeight="bold" className="title-text">
        LAWIZ'S
      </text>
      <text x="0" y="55" fontSize="28" fontWeight="bold" className="subtitle-text">
        Portrait Generator
      </text>
    </svg>
  );
};