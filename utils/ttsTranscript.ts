import type { IndexTtsGenerationInfo } from '../types';

interface SpeakerLine {
    speaker: string;
    text: string;
}

const ordinal = (index: number) => {
    const labels = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
    return labels[index] || `${index + 1}th`;
};

export const formatIndexTtsTranscript = (options: IndexTtsGenerationInfo): string => options.lines
    .map((line) => {
        const character = options.characters.find((item) => item.id === line.characterId);
        return `${character?.name.trim() || 'Character'}: ${line.text.trim()}`;
    })
    .filter((line) => !line.endsWith(':'))
    .join('\n');

export const parseSpeakerTranscript = (transcript?: string): SpeakerLine[] => {
    if (!transcript?.trim()) return [];
    const lines = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
        const match = line.match(/^([^:\n]{1,80}):\s*(.+)$/);
        return match ? { speaker: match[1].trim(), text: match[2].trim() } : null;
    });
    return parsed.every((line): line is SpeakerLine => Boolean(line)) ? parsed : [];
};

export const createLtxDialogueInstruction = (transcript?: string): string => {
    const speakerLines = parseSpeakerTranscript(transcript);
    if (!speakerLines.length) {
        const dialogue = transcript?.trim().replace(/"/g, "'");
        return dialogue ? `The visible character speaks clearly and naturally, saying exactly: "${dialogue}".` : '';
    }
    const speakers = [...new Set(speakerLines.map((line) => line.speaker))];
    const identities = speakers.map((speaker, index) => `the ${ordinal(index)} visible character is ${speaker}`).join(', ');
    const dialogue = speakerLines.map((line, index) => {
        const speakerIndex = speakers.indexOf(line.speaker);
        const transition = index === 0 ? 'First' : 'Then';
        const action = index > 0 && speakerIndex !== speakers.indexOf(speakerLines[index - 1].speaker) ? 'replies' : 'says';
        return `${transition}, the ${ordinal(speakerIndex)} character, ${line.speaker}, ${action} exactly: "${line.text.replace(/"/g, "'")}".`;
    }).join(' ');
    return `Multi-character dialogue direction: ${identities}. Keep each voice and line assigned to that character and match the supplied audio timing. ${dialogue}`;
};

export const createLtxScenePrompt = (transcript?: string): string => {
    const speakerLines = parseSpeakerTranscript(transcript);
    if (!speakerLines.length) return createLtxDialogueInstruction(transcript);
    const speakers = [...new Set(speakerLines.map((line) => line.speaker))];
    return `Show ${speakers.length === 1 ? 'one visible speaking character' : `${speakers.length} visible speaking characters`} in the scene: ${speakers.join(', ')}. ${createLtxDialogueInstruction(transcript)}`;
};

export const stripLtxDialogueInstruction = (prompt: string): string => prompt
    .replace(/Multi-character dialogue direction:[\s\S]*$/i, '')
    .replace(/The (?:visible )?character speaks clearly and naturally, saying(?: exactly)?: ["“][\s\S]*?["”]\.?/gi, '')
    .trim();