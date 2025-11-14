import React from 'react';

const Footer: React.FC = () => (
    <footer className="absolute bottom-0 left-0 w-full p-4 flex justify-center items-center z-20">
        <a 
            href="https://aistudio.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors font-permanent-marker"
        >
            Built with Google AI Studio
        </a>
    </footer>
);

export default Footer;
