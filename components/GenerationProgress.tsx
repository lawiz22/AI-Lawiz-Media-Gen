import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import { useGenerationJobs, useGenerationPreview } from '../store/generationJobs';
import { ImageGrid } from './ImageGrid';
import { Loader } from './Loader';
import { MossGenerationPreview } from './MossSettingsPanel';

// These components subscribe to fast-changing generation state themselves, so App does not re-render on every tick.

export const GenerationProgress: React.FC<{ onCancel?: () => void }> = ({ onCancel }) => {
    const message = useSelector((state: RootState) => state.generation.progressMessage);
    const progress = useSelector((state: RootState) => state.generation.progressValue);
    return <Loader message={message} progress={progress} onCancel={onCancel} />;
};

export const ImageGridWithJobs: React.FC<Omit<React.ComponentProps<typeof ImageGrid>, 'generationJobs'> & { jobsKey: string; showJobs?: boolean }> =
    ({ jobsKey, showJobs = true, ...props }) => {
        const jobs = useGenerationJobs(jobsKey);
        return <ImageGrid {...props} generationJobs={showJobs ? jobs : undefined} />;
    };

export const GenerationLivePreview: React.FC = () => {
    const image = useGenerationPreview();
    return image ? <MossGenerationPreview image={image} /> : null;
};
