import React, { useEffect, useRef, useState } from 'react';
import { normalizeAudioDataUrl } from '../utils/imageUtils';
import { MicrophoneIcon, PauseIcon, PlayIcon, VolumeIcon } from './icons';

interface AudioPlayerProps {
    src: string;
    label: string;
    detail?: string;
    compact?: boolean;
}

const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, label, detail, compact = false }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [error, setError] = useState('');
    const [playbackSrc, setPlaybackSrc] = useState(src.startsWith('data:') ? '' : src);

    useEffect(() => {
        const audio = audioRef.current;
        audio?.pause();
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setError('');
        if (!src.startsWith('data:')) {
            setPlaybackSrc(src);
            return;
        }

        let disposed = false;
        let objectUrl = '';
        setPlaybackSrc('');
        fetch(normalizeAudioDataUrl(src))
            .then((response) => response.blob())
            .then((blob) => {
                if (disposed) return;
                objectUrl = URL.createObjectURL(blob);
                setPlaybackSrc(objectUrl);
            })
            .catch(() => {
                if (!disposed) setError('The saved audio data is invalid or incomplete.');
            });
        return () => {
            disposed = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    const togglePlayback = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
            try {
                await audio.play();
                setError('');
            } catch {
                setError('This audio format could not be played. Download the file to inspect it.');
            }
        } else {
            audio.pause();
        }
    };

    const seek = (value: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration)) return;
        audio.currentTime = value;
        setCurrentTime(value);
    };

    const changeVolume = (value: number) => {
        if (audioRef.current) audioRef.current.volume = value;
        setVolume(value);
    };

    return (
        <div className={`w-full rounded-md border border-border-primary bg-bg-primary ${compact ? 'p-3' : 'p-4'}`}>
            <audio
                ref={audioRef}
                src={playbackSrc || undefined}
                preload="metadata"
                onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setError('This audio file cannot be decoded by the player.')}
            />
            <div className="flex min-w-0 items-center gap-3">
                <button onClick={togglePlayback} disabled={!playbackSrc} aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`} title={isPlaying ? 'Pause' : 'Play'} className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent text-accent-text transition-transform hover:scale-105 disabled:cursor-wait disabled:opacity-50">
                    {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5"><MicrophoneIcon className="h-3.5 w-3.5 flex-none text-accent" /><p className="truncate text-sm font-semibold text-text-primary">{label}</p></div>
                            {detail && <p className="mt-0.5 truncate text-[11px] text-text-muted">{detail}</p>}
                        </div>
                        <span className="flex-none font-mono text-[11px] text-text-muted">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>
                    <input aria-label={`Seek ${label}`} type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(Number(event.target.value))} className="h-1.5 w-full cursor-pointer accent-accent" />
                </div>
                {!compact && <div className="hidden w-28 flex-none items-center gap-2 sm:flex"><VolumeIcon className="h-4 w-4 text-text-muted" /><input aria-label={`Volume ${label}`} type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} className="h-1 w-full cursor-pointer accent-accent" /></div>}
            </div>
            {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        </div>
    );
};
