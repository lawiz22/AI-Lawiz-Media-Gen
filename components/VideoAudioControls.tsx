import React, { useEffect, useRef, useState } from 'react';
import { audioLyricsSource, transcribeAudioLyrics, referenceToken, type AudioLyrics, type VideoPromptProvider, type VideoReference } from '../services/videoPromptService';

const input = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary';
const button = 'rounded-lg border border-border-primary px-3 py-2 text-xs font-semibold hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-40';

export const OriginalAudioSelector: React.FC<{
    references: VideoReference[]; value: string | undefined; onChange: (id: string | undefined) => void;
    forced?: boolean; onForceChange: (forced: boolean, id: string | undefined) => void;
}> = ({ references, value, onChange, forced = false, onForceChange }) => {
    const audio = references.filter(ref => ref.kind === 'audio');
    return <div className="space-y-2 rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
        <label className="block text-xs font-semibold">Soundtrack mode
            <select aria-label="Soundtrack mode" className={input} disabled={forced} value={value === undefined && !forced ? 'reference' : 'original'} onChange={event => onChange(event.target.value === 'reference' ? undefined : audio.length === 1 ? audio[0].id : '')}>
                <option value="reference">Reference / generated audio (existing behavior)</option>
                <option value="original">Original track - do not regenerate audio</option>
            </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" aria-label="Force original WAV soundtrack" checked={forced}
                onChange={event => onForceChange(event.target.checked, event.target.checked ? value ?? (audio.length === 1 ? audio[0].id : '') : value)} />
            Force original WAV soundtrack (lock)
        </label>
        {forced && <p className="text-[11px] text-violet-300">Locked across passages and transfers. The final MP4 is remuxed locally with ONLY the applied WAV, replacing all server audio without re-encoding video. Missing audio or mux errors stop completion; generated sound is never a fallback. Enabling sets H.264 / 24 FPS / no loops. Uncheck to change soundtrack mode.</p>}
        {(value !== undefined || forced) && <>
            <label className="block text-xs">Original soundtrack
                <select aria-label="Original soundtrack" className={input} value={value ?? ''} onChange={event => onChange(event.target.value)}>
                    <option value="">Choose an audio reference</option>
                    {value && !audio.some(ref => ref.id === value) && <option value={value}>Missing track - choose another</option>}
                    {audio.map(ref => <option key={ref.id} value={ref.id}>{referenceToken(ref)} - {ref.file.name}</option>)}
                </select>
            </label>
            <p className="text-[11px] text-text-secondary">The selected WAV passage goes directly to the final soundtrack, not through H3's generated-audio decoder. No extra generated music or vocals are mixed in. Apply a passage here before prompting or rendering. Uses H.264 MP4 / 24 FPS, no loops, and trims the video to the audio end (frame/codec rounding applies). MP4 audio is encoded to AAC, not a bit-identical WAV copy. Lip motion is still generated, not guaranteed exact.</p>
        </>}
    </div>;
};

export const AudioLyricsEditor: React.FC<{
    reference: VideoReference;
    provider: VideoPromptProvider;
    model: string;
    onChange: (lyrics: AudioLyrics) => void;
    onSettingsChange?: (provider: VideoPromptProvider, model?: string) => void;
    requireAppliedPassage?: boolean;
    passagePending?: boolean;
}> = ({ reference, provider, model, onChange, onSettingsChange, requireAppliedPassage = false, passagePending = false }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef(0);
    const pending = useRef(false);
    const current = useRef(reference);
    current.current = reference;
    const source = audioLyricsSource(reference);
    const previousSource = useRef(source);
    const enabled = !!reference.lyrics?.enabled;
    const stale = enabled && reference.lyrics?.source !== source;
    useEffect(() => {
        const changed = previousSource.current !== source;
        previousSource.current = source;
        if (changed && pending.current) {
            request.current++; pending.current = false; setBusy(false);
            setError('The passage changed. The previous transcription will not replace this passage; request it again if needed.');
        }
    }, [source]);
    useEffect(() => {
        if (pending.current) {
            pending.current = false;
            setError('Transcription was interrupted when the panel was hidden. A pending API request may still be billed; request it again for this passage.');
        }
        setBusy(false);
        return () => { request.current++; };
    }, []);
    const transcribe = async () => {
        const id = ++request.current;
        pending.current = true; setBusy(true); setError('');
        try {
            const lyrics = await transcribeAudioLyrics(reference, provider, model);
            if (id !== request.current) return;
            if (audioLyricsSource(current.current) !== lyrics.source) throw new Error('The passage changed during transcription. Its old words were not applied.');
            onChange(lyrics);
        } catch (cause) { if (id === request.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { if (id === request.current) { pending.current = false; setBusy(false); } }
    };
    return <section aria-label={`Lyrics ${referenceToken(reference)}`} className="mt-3 space-y-3 rounded-xl border border-border-primary bg-bg-secondary p-3">
        <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" aria-label={`Use exact lyrics ${referenceToken(reference)}`} checked={enabled} disabled={busy} onChange={event => onChange({
                enabled: event.target.checked, text: reference.lyrics?.text || '', source: reference.lyrics?.source || source,
            })} />Use exact lyrics / spoken words
        </label>
        {enabled && <>
            {onSettingsChange && <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs">Transcription provider<select aria-label="Transcription provider" className={input} value={provider} disabled={busy} onChange={event => {
                    const next = event.target.value;
                    if (next === 'gemini' || next === 'openrouter') onSettingsChange(next);
                }}><option value="gemini">Gemini</option><option value="openrouter">OpenRouter</option>{provider === 'mammouth' && <option value="mammouth" disabled>Mammouth - audio unsupported</option>}</select></label>
                <label className="text-xs">Transcription model<input aria-label="Transcription model" className={input} value={model} disabled={busy} onChange={event => onSettingsChange(provider, event.target.value)} /></label>
            </div>}
            <p className="text-[11px] text-text-secondary">{provider} / {model}. Transcribe sends only the current audio file to this provider using Connection Settings and may incur API charges. No web lyrics lookup. Nothing is requested automatically by Next.</p>
            {requireAppliedPassage && !reference.audioSelection && <p role="alert" className="text-xs text-amber-300">Apply the desired audio passage first. The full original will not be sent for transcription while the soundtrack is locked.</p>}
            {passagePending && <p className="text-xs text-amber-300">Apply the selection before transcribing. No older/full audio will be sent instead.</p>}
            {stale && <p role="alert" className="text-xs text-amber-300">These lyrics belong to a previous passage. Edit, confirm or transcribe the current excerpt before generating.</p>}
            <label className="block text-xs">Words for this passage
                <textarea aria-label={`Lyrics text ${referenceToken(reference)}`} className={`${input} min-h-24`} value={reference.lyrics?.text || ''} disabled={busy}
                    placeholder="Enter the exact words, or transcribe this excerpt. Review uncertain words before generation."
                    onChange={event => onChange({ enabled: true, text: event.target.value, source })} />
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={busy || passagePending || provider === 'mammouth' || (requireAppliedPassage && !reference.audioSelection)} onClick={() => void transcribe()}>{busy ? 'Transcribing...' : 'Transcribe current passage'}</button>
                {stale && <button type="button" className={button} disabled={busy || !reference.lyrics?.text.trim()} onClick={() => onChange({ enabled: true, text: reference.lyrics!.text, source })}>Use these words for this passage</button>}
            </div>
            <p className="text-[11px] text-text-muted">Transcription can be wrong. Correct it here; [unclear] is not a word to sing. To replace old quoted lyrics already embedded in the scene description, also refresh or edit the prompt.</p>
        </>}
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </section>;
};
