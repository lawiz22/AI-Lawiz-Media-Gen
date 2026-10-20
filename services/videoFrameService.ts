import { FFFSType } from '@ffmpeg/ffmpeg';
import { readVideoClipSource, withVideoEncoder } from './videoClipService';

export const buildLastVideoFrameArgs = (): string[] => [
    '-i', '/source/input', '-map', '0:v:0', '-an', '-sn', '-dn', '-vsync', '0',
    '-c:v', 'png', '-compression_level', '0', '-update', '1', '-y', 'last-frame.png',
];

export const extractLastVideoFrame = async (file: File, signal: AbortSignal): Promise<File> => {
    await readVideoClipSource(file, signal);
    return withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        const mounted = await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/source');
        if (!mounted) throw new Error('Could not mount the video for last-frame extraction.');
        // Overwrite one PNG while decoding forwards: exact last frame, without buffering the video in reverse.
        const code = await ffmpeg.exec(buildLastVideoFrameArgs());
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`Could not decode the last video frame (code ${code}). ${logs()}`);
        const data = await ffmpeg.readFile('last-frame.png');
        if (!(data instanceof Uint8Array) || data.length < 8
            || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)) {
            throw new Error('The output did not contain a decodable video frame.');
        }
        return new File([new Uint8Array(data)], `${file.name.replace(/\.[^.]+$/, '')}-last-frame.png`, { type: 'image/png' });
    });
};
