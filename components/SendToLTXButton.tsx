import React from 'react';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import { queueLtxTransfer } from '../store/appSlice';
import { VideoIcon } from './icons';

interface SendToLTXButtonProps {
    imageDataUrl: string;
    prompt?: string | null;
    className?: string;
    showLabel?: boolean;
    onSent?: () => void;
}

export const SendToLTXButton: React.FC<SendToLTXButtonProps> = ({
    imageDataUrl,
    prompt,
    className = 'p-2 rounded-full bg-bg-secondary/90 text-text-primary hover:bg-accent hover:text-accent-text transition-colors shadow-lg',
    showLabel = false,
    onSent,
}) => {
    const dispatch: AppDispatch = useDispatch();

    return (
        <button
            onClick={(event) => {
                event.stopPropagation();
                dispatch(queueLtxTransfer({ imageDataUrl, prompt: prompt?.trim() || undefined }));
                onSent?.();
            }}
            className={className}
            title="Send image to LTX Director"
            aria-label="Send image to LTX Director"
        >
            <VideoIcon className="h-5 w-5" />
            {showLabel && <span>Send to LTX</span>}
        </button>
    );
};
