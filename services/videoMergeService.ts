import { FFFSType, type FFmpeg } from '@ffmpeg/ffmpeg';
import { readVideoClipSource, withVideoEncoder } from './videoClipService';

export interface MergeVideoInfo {
    videoStream: number;
    width: number;
    height: number;
    displayWidth: number;
    displayHeight: number;
    duration: number;
    fps: number;
    hasAudio: boolean;
}

export interface MergeClip {
    id: string;
    file: File;
    info: MergeVideoInfo;
    start: number;
    end: number;
}

export interface MergePlan {
    width: number;
    height: number;
    fps: number;
    duration: number;
    needsAdaptation: boolean;
    clips: { width: number; height: number; frames: number; duration: number }[];
}

export interface MergeProgress {
    percent: number;
    stage: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const even = (value: number) => Math.floor((value + 1e-8) / 2) * 2;
const rate = (value: unknown): number => {
    if (typeof value !== 'string') return NaN;
    const parts = value.split('/').map(Number);
    return parts.length === 2 ? parts[0] / parts[1] : Number(value);
};

export const parseMergeVideoInfo = (data: unknown): MergeVideoInfo => {
    if (isRecord(data) && data.error !== undefined) throw new Error('The video probe reported a decoding error.');
    if (!isRecord(data) || !Array.isArray(data.streams)) throw new Error('The video probe returned invalid stream metadata.');
    const video = data.streams.find(stream => isRecord(stream) && stream.codec_type === 'video'
        && !(isRecord(stream.disposition) && stream.disposition.attached_pic === 1));
    if (!isRecord(video)) throw new Error('The selected file has no video stream.');
    const format = isRecord(data.format) ? data.format : {};
    const duration = Number(video.duration ?? format.duration);
    let width = Number(video.width);
    let height = Number(video.height);
    const average = rate(video.avg_frame_rate);
    const fps = Number.isFinite(average) && average > 0 ? average : rate(video.r_frame_rate);
    if (![width, height, duration, fps].every(value => Number.isFinite(value) && value > 0)
        || !Number.isInteger(width) || !Number.isInteger(height)) {
        throw new Error('Could not determine finite video dimensions, duration and frame rate.');
    }
    const sarText = video.sample_aspect_ratio;
    const sar = sarText === undefined || sarText === 'N/A' || sarText === '0:1' ? 1
        : rate(typeof sarText === 'string' ? sarText.replace(':', '/') : sarText);
    if (!Number.isFinite(sar) || sar <= 0) throw new Error('The video has an invalid pixel aspect ratio.');
    // Correct anamorphic pixels by reducing one axis, never by enlarging the other.
    let displayWidth = width * Math.min(1, sar);
    let displayHeight = height / Math.max(1, sar);
    const rotationData = Array.isArray(video.side_data_list)
        ? video.side_data_list.find(item => isRecord(item) && item.rotation !== undefined) : undefined;
    const tags = isRecord(video.tags) ? video.tags : {};
    const rotation = Number(isRecord(rotationData) ? rotationData.rotation : tags.rotate ?? 0);
    if (!Number.isFinite(rotation) || rotation % 90 !== 0) throw new Error('Only videos with 0, 90, 180 or 270 degree rotation are supported.');
    if (Math.abs(rotation % 180) === 90) {
        [width, height] = [height, width];
        [displayWidth, displayHeight] = [displayHeight, displayWidth];
    }
    return {
        videoStream: data.streams.filter(stream => isRecord(stream) && stream.codec_type === 'video').indexOf(video),
        width, height, displayWidth, displayHeight, duration, fps,
        hasAudio: data.streams.some(stream => isRecord(stream) && stream.codec_type === 'audio'),
    };
};

export const planVideoMerge = (clips: readonly MergeClip[]): MergePlan => {
    if (!clips.length) throw new Error('Add at least one video clip.');
    for (const clip of clips) {
        const { info, start, end } = clip;
        if (![info.width, info.height, info.displayWidth, info.displayHeight, info.fps, info.duration].every(value => Number.isFinite(value) && value > 0)
            || !Number.isInteger(info.videoStream) || info.videoStream < 0
            || info.displayWidth > info.width || info.displayHeight > info.height
            || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > info.duration) {
            throw new Error(`"${clip.file.name}": choose a valid start/end within the video and valid source dimensions and video stream index.`);
        }
    }
    const first = clips[0].info;
    const minWidth = clips.reduce((min, clip) => Math.min(min, clip.info.displayWidth), Infinity);
    const minHeight = clips.reduce((min, clip) => Math.min(min, clip.info.displayHeight), Infinity);
    const scale = Math.min(1, minWidth / first.displayWidth, minHeight / first.displayHeight);
    const width = even(first.displayWidth * scale);
    const height = even(first.displayHeight * scale);
    if (width < 2 || height < 2) throw new Error('These videos cannot share an even-sized output without upscaling.');
    const fps = clips.reduce((min, clip) => Math.min(min, clip.info.fps), Infinity);
    const normalized = clips.map(clip => {
        const factor = Math.min(1, width / clip.info.displayWidth, height / clip.info.displayHeight);
        const contentWidth = even(clip.info.displayWidth * factor);
        const contentHeight = even(clip.info.displayHeight * factor);
        const frames = Math.floor((clip.end - clip.start) * fps + 1e-6);
        if (contentWidth < 2 || contentHeight < 2 || frames < 1) throw new Error(`"${clip.file.name}": the selection must contain at least one output frame and fit without upscaling.`);
        return { width: contentWidth, height: contentHeight, frames, duration: frames / fps };
    });
    return {
        width, height, fps, clips: normalized,
        duration: normalized.reduce((sum, clip) => sum + clip.duration, 0),
        needsAdaptation: clips.some((clip, index) => clip.info.width !== width || clip.info.height !== height
            || clip.info.fps !== fps || normalized[index].width !== width || normalized[index].height !== height),
    };
};

export const buildMergeClipArgs = (clip: MergeClip, plan: MergePlan, index: number): string[] => {
    const content = plan.clips[index];
    if (!content || content.width > clip.info.width || content.height > clip.info.height
        || content.width > plan.width || content.height > plan.height) throw new Error('Video merge would upscale a source; export was blocked.');
    return [
        '-ss', String(clip.start), '-i', '/source/input',
        ...(!clip.info.hasAudio ? ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'] : []),
        '-t', String(content.duration), '-map', `0:v:${clip.info.videoStream}`, '-map', clip.info.hasAudio ? '0:a:0' : '1:a:0',
        '-vf', `setpts=PTS-STARTPTS,fps=${plan.fps},scale=w='trunc(min(min(${plan.width},${plan.height}*dar),min(iw,ih*dar))/2)*2':h='trunc(min(min(${plan.width}/dar,${plan.height}),min(iw/dar,ih))/2)*2':flags=lanczos,setsar=1,pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2:black`,
        '-af', 'asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        '-video_track_timescale', '90000', '-map_metadata', '-1', '-metadata:s:v:0', 'rotate=0',
        '-movflags', '+faststart', 'part.mp4',
    ];
};

const probeVideo = async (ffmpeg: FFmpeg, path: string, logs: () => string): Promise<MergeVideoInfo> => {
    const outputPath = `probe-${crypto.randomUUID()}.json`;
    const code = await ffmpeg.ffprobe(['-v', 'error', '-show_error', '-show_streams', '-show_format', '-of', 'json', path, '-o', outputPath]);
    if (code !== 0 && code !== -1) throw new Error(`Could not inspect video (code ${code}). ${logs()}`);
    let output: string | Uint8Array;
    try {
        output = await ffmpeg.readFile(outputPath, 'utf8');
    } catch (cause) {
        throw new Error(`The video probe produced no readable metadata (code ${code}). ${logs()}`, { cause });
    }
    await ffmpeg.deleteFile(outputPath);
    if (typeof output !== 'string') throw new Error('The video probe did not return JSON text.');
    const data: unknown = JSON.parse(output);
    const info = parseMergeVideoInfo(data);
    // Core 0.12.10 leaves its exit-status sentinel at -1 even after a successful FFprobe return.
    if (code === -1) console.warn('FFprobe returned the core 0.12.10 unset-status sentinel; verified fresh JSON metadata with no probe error.', path);
    return info;
};

export const inspectMergeVideos = async (
    files: readonly File[], signal: AbortSignal, onProgress: (value: MergeProgress) => void,
): Promise<MergeClip[]> => {
    if (!files.length) throw new Error('Select at least one video.');
    for (const file of files) await readVideoClipSource(file, signal);
    return withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        const clips: MergeClip[] = [];
        for (const [index, file] of files.entries()) {
            signal.throwIfAborted();
            onProgress({ percent: index / files.length * 100, stage: `Inspecting ${index + 1}/${files.length}: ${file.name}` });
            if (!await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/source')) throw new Error(`Could not mount "${file.name}".`);
            try {
                const info = await probeVideo(ffmpeg, '/source/input', logs);
                clips.push({ id: crypto.randomUUID(), file, info, start: 0, end: info.duration });
            } catch (cause) {
                signal.throwIfAborted();
                throw new Error(`Could not inspect "${file.name}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
            } finally {
                if (!signal.aborted) await ffmpeg.unmount('/source');
            }
        }
        signal.throwIfAborted();
        return clips;
    });
};

export const mergeVideoClips = async (
    clips: readonly MergeClip[], allowAdaptation: boolean, signal: AbortSignal, onProgress: (value: MergeProgress) => void,
): Promise<{ file: File; duration: number }> => {
    const plan = planVideoMerge(clips);
    if (plan.needsAdaptation && !allowAdaptation) throw new Error('Confirm downscale/letterbox and frame-rate adaptation before merging.');
    for (const clip of clips) await readVideoClipSource(clip.file, signal);
    onProgress({ percent: 0, stage: 'Loading local video encoder...' });
    return withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        const parts: File[] = [];
        let completed = 0;
        let totalBytes = 0;
        for (const [index, clip] of clips.entries()) {
            signal.throwIfAborted();
            const stage = `Encoding clip ${index + 1}/${clips.length}: ${clip.file.name}`;
            onProgress({ percent: completed / plan.duration * 90, stage });
            if (!await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: clip.file }] }, '/source')) throw new Error(`Could not mount "${clip.file.name}".`);
            const update = ({ time }: { time: number }) => onProgress({
                percent: (completed + Math.min(plan.clips[index].duration, Math.max(0, time / 1_000_000))) / plan.duration * 90, stage,
            });
            ffmpeg.on('progress', update);
            try {
                const code = await ffmpeg.exec(buildMergeClipArgs(clip, plan, index));
                if (code !== 0) throw new Error(`Could not encode clip ${index + 1} (code ${code}). ${logs()}`);
                const data = await ffmpeg.readFile('part.mp4');
                if (typeof data === 'string' || !data.byteLength) throw new Error(`Clip ${index + 1} produced no video.`);
                totalBytes += data.byteLength;
                if (totalBytes >= 2 ** 31) throw new Error('The merged video exceeds the local WebAssembly encoder file limit (2 GB). Merge smaller batches or shorter selections.');
                parts.push(new File([new Uint8Array(data)], `part-${index}.mp4`, { type: 'video/mp4' }));
                await ffmpeg.deleteFile('part.mp4');
            } finally {
                ffmpeg.off('progress', update);
                if (!signal.aborted) await ffmpeg.unmount('/source');
            }
            completed += plan.clips[index].duration;
        }
        signal.throwIfAborted();
        onProgress({ percent: 90, stage: 'Joining encoded clips...' });
        await ffmpeg.createDir('/parts');
        if (!await ffmpeg.mount(FFFSType.WORKERFS, { files: parts }, '/parts')) throw new Error('Could not mount the encoded clips for final assembly.');
        await ffmpeg.writeFile('concat.txt', 'ffconcat version 1.0\n' + parts.map((_, index) =>
            `file '/parts/part-${index}.mp4'\nduration ${plan.clips[index].duration}\n`).join(''));
        const code = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-map', '0:v:0', '-map', '0:a:0',
            '-c', 'copy', '-movflags', '+faststart', 'merged.mp4']);
        if (code !== 0) throw new Error(`Final video assembly failed (code ${code}). ${logs()}`);
        onProgress({ percent: 97, stage: 'Verifying final video...' });
        const info = await probeVideo(ffmpeg, 'merged.mp4', logs);
        if (info.width !== plan.width || info.height !== plan.height || !info.hasAudio
            || Math.abs(info.duration - plan.duration) > Math.max(0.1, 2 / plan.fps)) {
            throw new Error('The merged video did not match the expected dimensions, audio or duration.');
        }
        const data = await ffmpeg.readFile('merged.mp4');
        if (typeof data === 'string' || !data.byteLength) throw new Error('Final assembly returned an empty MP4.');
        signal.throwIfAborted();
        onProgress({ percent: 100, stage: 'Merge complete.' });
        return { file: new File([new Uint8Array(data)], 'merged.mp4', { type: 'video/mp4' }), duration: info.duration };
    });
};
