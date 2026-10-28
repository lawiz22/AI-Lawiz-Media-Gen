import { FFFSType } from '@ffmpeg/ffmpeg';
import { readVideoClipSource, withVideoEncoder } from './videoClipService';

export const buildLastVideoFrameArgs = (): string[] => [
    '-i', '/source/input', '-map', '0:v:0', '-an', '-sn', '-dn', '-vsync', '0',
    '-c:v', 'png', '-compression_level', '0', '-update', '1', '-y', 'last-frame.png',
];

export const buildVideoFrameArgs = (seconds: number | null): string[] => {
    if (seconds === null) return buildLastVideoFrameArgs();
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Select a finite, non-negative video frame time.');
    const args = buildLastVideoFrameArgs();
    args.splice(args.indexOf('-c:v'), 0, '-vf', `select=lte(t\\,${seconds})`);
    return args;
};

export const extractVideoFrame = async (file: File, seconds: number | null, signal: AbortSignal): Promise<File> => {
    const args = buildVideoFrameArgs(seconds);
    await readVideoClipSource(file, signal);
    return withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        const mounted = await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/source');
        if (!mounted) throw new Error('Could not mount the video for last-frame extraction.');
        // Keep the last frame at or before the selected time, including variable-frame-rate sources.
        const code = await ffmpeg.exec(args);
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`Could not decode the ${seconds === null ? 'last' : 'selected'} video frame (code ${code}). ${logs()}`);
        const data = await ffmpeg.readFile('last-frame.png');
        if (!(data instanceof Uint8Array) || data.length < 8
            || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)) {
            throw new Error('The output did not contain a decodable video frame.');
        }
        const suffix = seconds === null ? 'last-frame' : `frame-${seconds.toFixed(3)}s`;
        return new File([new Uint8Array(data)], `${file.name.replace(/\.[^.]+$/, '')}-${suffix}.png`, { type: 'image/png' });
    });
};

export const extractLastVideoFrame = (file: File, signal: AbortSignal): Promise<File> => extractVideoFrame(file, null, signal);
