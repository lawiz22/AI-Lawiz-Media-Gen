export type AudioSamples = Pick<AudioBuffer, 'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'>;
export interface AudioSelection { start: number; end: number }

export const audioSelectionFrames = (audio: AudioSamples, selection: AudioSelection) => {
    const { sampleRate, length, numberOfChannels } = audio;
    if (![sampleRate, length, numberOfChannels].every(value => Number.isInteger(value) && value > 0)) {
        throw new Error('The decoded audio has invalid sample metadata.');
    }
    const duration = length / sampleRate;
    const { start, end } = selection;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration) {
        throw new Error('Choose an audio start and end within the original recording.');
    }
    const first = Math.round(start * sampleRate), last = Math.min(length, Math.round(end * sampleRate));
    if (last <= first) throw new Error('Select at least one audio sample.');
    return { first, last, duration: (last - first) / sampleRate };
};

export const nextAudioSelection = (selection: AudioSelection, duration: number): AudioSelection | null => {
    if (![selection.start, selection.end, duration].every(Number.isFinite)
        || selection.start < 0 || selection.end <= selection.start || selection.end > duration) {
        throw new Error('Choose a valid audio selection before advancing.');
    }
    if (selection.end === duration) return null;
    return { start: selection.end, end: Math.min(duration, selection.end + selection.end - selection.start) };
};

export const encodeAudioWav = (audio: AudioSamples, selection: AudioSelection = { start: 0, end: audio.length / audio.sampleRate }): Blob => {
    const { first, last } = audioSelectionFrames(audio, selection);
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    if (channels.some(channel => channel.length !== audio.length)) throw new Error('The decoded audio channels have inconsistent lengths.');
    const dataLength = (last - first) * channels.length * 2;
    if (dataLength > 0xffffffff - 36) throw new Error('The selected audio exceeds the WAV file size limit.');
    const output = new ArrayBuffer(44 + dataLength);
    const view = new DataView(output);
    const text = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true);
    view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * channels.length * 2, true);
    view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, dataLength, true);
    let offset = 44;
    for (let frame = first; frame < last; frame++) {
        for (const channel of channels) {
            if (!Number.isFinite(channel[frame])) throw new Error('The decoded audio contains an invalid sample.');
            const sample = Math.max(-1, Math.min(1, channel[frame]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }
    }
    return new Blob([output], { type: 'audio/wav' });
};

export const audioWaveformPeaks = (audio: AudioSamples, bins = 640): number[] => {
    audioSelectionFrames(audio, { start: 0, end: audio.length / audio.sampleRate });
    if (!Number.isInteger(bins) || bins < 1) throw new Error('Invalid waveform resolution.');
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    const count = Math.min(bins, audio.length);
    return Array.from({ length: count }, (_, bucket) => {
        let peak = 0;
        for (let frame = Math.floor(bucket * audio.length / count); frame < Math.floor((bucket + 1) * audio.length / count); frame++) {
            for (const channel of channels) {
                if (!Number.isFinite(channel[frame])) throw new Error('The decoded audio contains an invalid sample.');
                peak = Math.max(peak, Math.abs(channel[frame]));
            }
        }
        return peak;
    });
};
