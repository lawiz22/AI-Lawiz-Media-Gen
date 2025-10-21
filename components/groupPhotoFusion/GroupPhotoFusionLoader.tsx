import React, { useState, useEffect } from 'react';
import { SpinnerIcon } from '../icons';

const loadingMessages = [
    "Analyzing individual photos...",
    "Understanding identities and clothing...",
    "Composing the scene...",
    "Adjusting lighting and shadows...",
    "Rendering the final image...",
    "Almost there..."
];

const GroupPhotoFusionLoader: React.FC = () => {
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
        }, 2500);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <SpinnerIcon className="w-16 h-16 text-accent animate-spin" />
            <h2 className="text-2xl font-bold text-text-primary mt-6">Fusing Photos...</h2>
            <p className="text-text-secondary mt-2">{loadingMessages[messageIndex]}</p>
        </div>
    );
};

export default GroupPhotoFusionLoader;
