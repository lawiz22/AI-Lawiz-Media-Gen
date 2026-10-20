import { FFFSType } from '@ffmpeg/ffmpeg';
import { withVideoEncoder } from './videoClipService';

export const buildOriginalAudioArgs = (duration: number): string[] => {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw new Error('Original soundtrack duration must be greater than zero and at most 60 seconds.');
    return [
        '-i', '/source/video', '-i', '/source/audio',
        '-map', '0:v:0', '-map', '1:a:0', '-sn', '-dn',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-t', String(duration), '-map_metadata', '-1', '-movflags', '+faststart',
        '-y', 'original-audio.mp4',
    ];
};

export const forceOriginalVideoAudio = async (video: File, audio: File, duration: number, signal: AbortSignal): Promise<File> => {
    signal.throwIfAborted();
    if (!video.size || video.type !== 'video/mp4') throw new Error('Audio lock requires a non-empty MP4 video.');
    const args = buildOriginalAudioArgs(duration);
    const header = new DataView(await audio.slice(0, 44).arrayBuffer());
    const tag = (offset: number, value: string) => [...value].every((char, index) => header.getUint8(offset + index) === char.charCodeAt(0));
    if (header.byteLength !== 44 || !tag(0, 'RIFF') || !tag(8, 'WAVE') || !tag(12, 'fmt ') || !tag(36, 'data')
        || header.getUint32(16, true) !== 16 || header.getUint16(20, true) !== 1 || header.getUint16(34, true) !== 16) {
        throw new Error('Audio lock requires an applied PCM16 WAV passage. Apply the passage again.');
    }
    const rate = header.getUint32(24, true), channels = header.getUint16(22, true), bytes = header.getUint32(40, true);
    if (!rate || !channels || !bytes || bytes !== audio.size - 44 || bytes % (channels * 2)
        || header.getUint32(28, true) !== rate * channels * 2 || header.getUint16(32, true) !== channels * 2) {
        throw new Error('The applied WAV passage has invalid sample metadata. Apply it again.');
    }
    const actualDuration = bytes / (rate * channels * 2);
    if (Math.abs(actualDuration - duration) > 1 / rate + 1e-6) throw new Error('Audio lock duration does not match the WAV samples. Apply the passage again.');
    args[args.indexOf('-t') + 1] = String(actualDuration);
    return withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        if (!await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'video', data: video }, { name: 'audio', data: audio }] }, '/source')) {
            throw new Error('Could not mount the video and selected WAV for audio locking.');
        }
        const code = await ffmpeg.exec(args);
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`Could not lock the original soundtrack (code ${code}). No generated-audio fallback was used. ${logs()}`);
        const data = await ffmpeg.readFile('original-audio.mp4');
        if (!(data instanceof Uint8Array) || data.length < 12 || ![102, 116, 121, 112].every((byte, index) => data[index + 4] === byte)) {
            throw new Error('Audio locking returned an invalid MP4. No generated-audio fallback was used.');
        }
        return new File([new Uint8Array(data)], 'minimax-h3-original-audio.mp4', { type: 'video/mp4' });
    });
};
