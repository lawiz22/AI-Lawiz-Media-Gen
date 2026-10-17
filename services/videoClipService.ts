import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import coreAssetURL from '@ffmpeg/core?url';
import wasmAssetURL from '@ffmpeg/core/wasm?url';
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url';

export interface VideoClipOptions {
    start: number;
    end: number;
    duration: number;
    reduceResolution: boolean;
    spatialEdit?: { x: number; y: number; width: number; height: number; outputWidth: number; outputHeight: number };
}

export const canSaveVideoClip = (duration: number): boolean =>
    Number.isFinite(duration) && duration > 0 && duration < 300;

export const readVideoClipSource = async (file: File, signal: AbortSignal): Promise<void> => {
    signal.throwIfAborted();
    try {
        if (file.size === 0) throw new Error('The selected video is empty.');
        // Probe both ends without allocating the entire source (which may exceed 2 GB).
        await file.slice(0, Math.min(file.size, 65536)).arrayBuffer();
        signal.throwIfAborted();
        await file.slice(Math.max(0, file.size - 65536), file.size).arrayBuffer();
        signal.throwIfAborted();
    } catch (cause) {
        signal.throwIfAborted();
        throw new Error(
            `Could not read source video "${file.name}". Select the file again using Upload Video. If it still fails, copy it to a new local file and select that copy. ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
        );
    }
};

const readVideoDuration = (file: File, signal: AbortSignal): Promise<number> => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Video extraction cancelled.', 'AbortError'));
    const timer = setTimeout(() => fail(new Error('Timed out verifying the MP4 duration.')), 30000);
    video.onloadedmetadata = () => {
        const duration = video.duration;
        cleanup();
        if (Number.isFinite(duration) && duration > 0) resolve(duration);
        else reject(new Error('The extracted MP4 has an invalid duration.'));
    };
    video.onerror = () => fail(new Error('Could not verify the extracted MP4.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) return abort();
    video.preload = 'metadata';
    video.src = url;
});

export const buildVideoClipArgs = ({ start, end, duration, reduceResolution }: VideoClipOptions): string[] => {
    if (![start, end, duration].every(Number.isFinite) || duration <= 0 || start < 0 || end <= start || end > duration) {
        throw new Error('Select a valid start and end frame within the video.');
    }
    return [
        '-ss', String(start), '-i', '/source/input', '-t', String(end - start),
        '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', reduceResolution
            ? "scale='max(2,trunc(iw/4)*2)':'max(2,trunc(ih/4)*2)'"
            : "scale='max(2,trunc(iw/2)*2)':'max(2,trunc(ih/2)*2)'",
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'clip.mp4',
    ];
};

export const buildSpatialVideoFilter = (edit: NonNullable<VideoClipOptions['spatialEdit']>): string => {
    const { x, y, width, height, outputWidth, outputHeight } = edit;
    if (![x, y, width, height, outputWidth, outputHeight].every(Number.isFinite)
        || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100.001 || y + height > 100.001
        || ![outputWidth, outputHeight].every(value => Number.isInteger(value) && value >= 2 && value <= 4096 && value % 2 === 0)) {
        throw new Error('Invalid video crop or output size. Use even dimensions between 2 and 4096.');
    }
    return `crop=iw*${width}/100:ih*${height}/100:iw*${x}/100:ih*${y}/100,scale=${outputWidth}:${outputHeight},setsar=1`;
};

export const extractVideoClip = async (
    file: File,
    options: VideoClipOptions,
    signal: AbortSignal,
    onProgress: (progress: number) => void,
): Promise<{ file: File; duration: number }> => {
    const args = buildVideoClipArgs(options);
    if (options.spatialEdit) args[args.indexOf('-vf') + 1] = buildSpatialVideoFilter(options.spatialEdit);
    await readVideoClipSource(file, signal);
    const ffmpeg = new FFmpeg();
    const assetURLs: string[] = [];
    const logs: string[] = [];
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => ffmpeg.terminate();
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    ffmpeg.on('log', ({ message }) => {
        logs.push(message);
        if (logs.length > 15) logs.shift();
    });
    ffmpeg.on('progress', ({ time }) => onProgress(Math.min(99, Math.max(0, time / 1_000_000 / (options.end - options.start) * 100))));
    const loadAsset = async (url: string, type: string) => {
        try {
            const response = await fetch(url, { signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.arrayBuffer();
            signal.throwIfAborted();
            const objectURL = URL.createObjectURL(new Blob([data], { type }));
            assetURLs.push(objectURL);
            return objectURL;
        } catch (cause) {
            signal.throwIfAborted();
            throw new Error(`Could not read the local MP4 encoder asset (${type}). ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
        }
    };
    try {
        const coreURL = await loadAsset(coreAssetURL, 'text/javascript');
        const wasmURL = await loadAsset(wasmAssetURL, 'application/wasm');
        signal.throwIfAborted();
        await Promise.race([
            ffmpeg.load({ coreURL, wasmURL, classWorkerURL }),
            new Promise<never>((_, reject) => { loadTimer = setTimeout(() => reject(new Error('Timed out loading the local video encoder.')), 60000); }),
        ]);
        clearTimeout(loadTimer);
        signal.throwIfAborted();
        await ffmpeg.createDir('/source');
        const mounted = await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/source');
        if (!mounted) throw new Error('Could not mount the video source for read-only, chunked access.');
        signal.throwIfAborted();
        const exitCode = await ffmpeg.exec(args);
        if (exitCode !== 0) throw new Error(`MP4 extraction failed (code ${exitCode}). ${logs.join('\n')}`);
        const output = await ffmpeg.readFile('clip.mp4');
        if (typeof output === 'string' || output.byteLength === 0) throw new Error('The video encoder returned an empty MP4.');
        const outputFile = new File([new Uint8Array(output)], 'clip.mp4', { type: 'video/mp4' });
        const clipDuration = await readVideoDuration(outputFile, signal);
        signal.throwIfAborted();
        onProgress(100);
        return { file: outputFile, duration: clipDuration };
    } finally {
        clearTimeout(loadTimer);
        signal.removeEventListener('abort', abort);
        ffmpeg.terminate();
        assetURLs.forEach(url => URL.revokeObjectURL(url));
    }
};
