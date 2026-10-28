import { FFFSType } from '@ffmpeg/ffmpeg';
import { withVideoEncoder } from './videoClipService';
import { audioSelectionFrames, audioWaveformPeaks, encodeAudioWav, type AudioSamples, type AudioSelection } from './audioClipService';

const yieldToUI = () => new Promise<void>(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
});

export const decodeMediaAudio = async (file: File, signal: AbortSignal, progress: (message: string) => void): Promise<AudioBuffer> => {
    signal.throwIfAborted();
    if (!file.size) throw new Error('Choose a non-empty audio or video file.');
    progress('Loading the local audio decoder...');
    const wav = await withVideoEncoder(signal, async (ffmpeg, logs) => {
        await ffmpeg.createDir('/source');
        if (!await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/source')) {
            throw new Error('Could not read the selected source file.');
        }
        progress('Extracting the first audio track locally...');
        const code = await ffmpeg.exec(['-i', '/source/input', '-map', '0:a:0', '-vn', '-sn', '-dn',
            '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-y', 'audio.wav']);
        signal.throwIfAborted();
        if (code !== 0) throw new Error(`Audio extraction failed. The file may have no audio track or use an unsupported codec. ${logs()}`);
        const data = await ffmpeg.readFile('audio.wav');
        if (!(data instanceof Uint8Array) || data.length <= 44) throw new Error('The decoder returned no usable audio.');
        return new Uint8Array(data);
    });
    signal.throwIfAborted();
    progress('Decoding audio for waveform editing...');
    const context = new AudioContext();
    try {
        const audio = await context.decodeAudioData(wav.buffer);
        signal.throwIfAborted();
        audioSelectionFrames(audio, { start: 0, end: audio.length / audio.sampleRate });
        return audio;
    } finally { await context.close(); }
};

export const buildAudioWaveform = async (audio: AudioSamples, selection: AudioSelection, signal: AbortSignal, bins = 1000): Promise<number[]> => {
    const { first, last } = audioSelectionFrames(audio, selection);
    if (!Number.isInteger(bins) || bins < 1) throw new Error('Invalid waveform resolution.');
    const count = Math.min(bins, last - first), peaks: number[] = [];
    for (let bucket = 0; bucket < count; bucket += 50) {
        signal.throwIfAborted();
        const end = Math.min(count, bucket + 50);
        peaks.push(...audioWaveformPeaks(audio, end - bucket, {
            start: (first + Math.floor(bucket * (last - first) / count)) / audio.sampleRate,
            end: (first + Math.floor(end * (last - first) / count)) / audio.sampleRate,
        }));
        await yieldToUI();
    }
    signal.throwIfAborted();
    return peaks;
};

export const exportAudioExcerpt = async (audio: AudioSamples, selection: AudioSelection, name: string, signal: AbortSignal): Promise<File> => {
    const { first, last } = audioSelectionFrames(audio, selection);
    const size = (last - first) * audio.numberOfChannels * 2;
    if (size > 0xffffffff - 36) throw new Error('The selected audio exceeds the WAV file size limit.');
    const parts: BlobPart[] = [];
    for (let frame = first; frame < last; frame += 65536) {
        signal.throwIfAborted();
        const chunk = encodeAudioWav(audio, { start: frame / audio.sampleRate, end: Math.min(last, frame + 65536) / audio.sampleRate });
        if (frame === first) {
            const header = await chunk.slice(0, 44).arrayBuffer();
            const view = new DataView(header);
            view.setUint32(4, size + 36, true); view.setUint32(40, size, true);
            parts.push(header);
        }
        parts.push(chunk.slice(44));
        await yieldToUI();
    }
    signal.throwIfAborted();
    return new File(parts, `${name.replace(/\.[^.]+$/, '')}-${selection.start.toFixed(3)}-${selection.end.toFixed(3)}.wav`, { type: 'audio/wav' });
};
