import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToLibrary } from '../store/librarySlice';
import type { AppDispatch } from '../store/store';
import type { LibraryItem } from '../types';
import { CHATTERBOX_LANGUAGES, generateChatterboxTts, getTtsReferenceVoices, type ChatterboxLanguage, type ChatterboxTtsOptions, type TtsReferenceVoice } from '../services/comfyUIService';
import { fileToDataUrl, fileToResizedDataUrl, getAudioMimeType } from '../utils/imageUtils';
import { CheckIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, MicrophoneIcon, PhotographIcon, SaveIcon, SpinnerIcon, UploadCloudIcon } from './icons';
import { AudioPlayer } from './AudioPlayer';
import { LibraryPickerModal } from './LibraryPickerModal';
import { estimateSpeechDuration, generateTtsDialogue, TTS_DIALOGUE_THEMES, type TtsDialogueTheme } from '../services/ttsDialogueService';
import { TtsAdvancedPanel } from './TtsAdvancedPanel';
import { Accordion } from './ui/Accordion';
import { Button, NumberField, SeedField, TextField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';

interface TtsPanelProps {
    isComfyUIConnected: boolean | null;
}

const DEFAULT_OPTIONS: ChatterboxTtsOptions = {
    language: 'English',
    device: 'auto',
    exaggeration: 0.71,
    temperature: 0.45,
    cfgWeight: 0.42,
    seed: 184978833,
    audioPromptPath: '',
    enableChunking: true,
    maxCharsPerChunk: 400,
    chunkCombinationMethod: 'auto',
    silenceBetweenChunksMs: 100,
    filenamePrefix: 'audio/ChatterB',
};

const createAudioThumbnail = () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#111318"/><circle cx="128" cy="112" r="58" fill="#fbbf24"/><path d="M128 65a22 22 0 0 0-22 22v48a22 22 0 0 0 44 0V87a22 22 0 0 0-22-22Zm-48 64v8a48 48 0 0 0 96 0v-8h-12v8a36 36 0 0 1-72 0v-8H80Zm42 56v18h-25v12h62v-12h-25v-18h-12Z" fill="#111318"/><text x="128" y="240" text-anchor="middle" fill="#fafafa" font-family="sans-serif" font-size="18" font-weight="700">TTS AUDIO</text></svg>';
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const TtsVoiceClonePanel: React.FC<TtsPanelProps> = ({ isComfyUIConnected }) => {
    const dispatch: AppDispatch = useDispatch();
    const audioInput = useRef<HTMLInputElement>(null);
    const thumbnailInput = useRef<HTMLInputElement>(null);
    const [text, setText] = useState('');
    const [referenceAudio, setReferenceAudio] = useState<File | null>(null);
    const [referenceSource, setReferenceSource] = useState<'suite' | 'upload'>('suite');
    const [suiteVoices, setSuiteVoices] = useState<TtsReferenceVoice[]>([]);
    const [selectedSuiteVoice, setSelectedSuiteVoice] = useState('');
    const [isLoadingVoices, setIsLoadingVoices] = useState(false);
    const [voiceLoadError, setVoiceLoadError] = useState('');
    const [options, setOptions] = useState<ChatterboxTtsOptions>(DEFAULT_OPTIONS);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [error, setError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [referenceAudioUrl, setReferenceAudioUrl] = useState('');
    const [referenceThumbnail, setReferenceThumbnail] = useState('');
    const [selectedLibraryReference, setSelectedLibraryReference] = useState<LibraryItem | null>(null);
    const [isReferencePickerOpen, setIsReferencePickerOpen] = useState(false);
    const [referenceSaveStatus, setReferenceSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [generatedReference, setGeneratedReference] = useState<{ name: string; source: 'suite' | 'upload' | 'library'; thumbnail: string } | null>(null);
    const [dialogueTheme, setDialogueTheme] = useState<TtsDialogueTheme>('surprise');
    const [dialogueDuration, setDialogueDuration] = useState(8);
    const [isGeneratingDialogue, setIsGeneratingDialogue] = useState(false);

    useEffect(() => {
        if (!isComfyUIConnected) {
            if (isComfyUIConnected === false) setReferenceSource('upload');
            return;
        }
        let disposed = false;
        setIsLoadingVoices(true);
        setVoiceLoadError('');
        getTtsReferenceVoices()
            .then((voices) => {
                if (disposed) return;
                setSuiteVoices(voices);
                setSelectedSuiteVoice((current) => voices.some(({ value }) => value === current) ? current : voices[0]?.value || '');
                if (voices.length === 0) setReferenceSource('upload');
            })
            .catch((loadError) => {
                if (disposed) return;
                setVoiceLoadError(loadError instanceof Error ? loadError.message : 'Could not load Audio Suite voices.');
                setReferenceSource('upload');
            })
            .finally(() => {
                if (!disposed) setIsLoadingVoices(false);
            });
        return () => { disposed = true; };
    }, [isComfyUIConnected]);

    useEffect(() => {
        if (!referenceAudio) {
            setReferenceAudioUrl('');
            return;
        }
        const objectUrl = URL.createObjectURL(referenceAudio);
        setReferenceAudioUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [referenceAudio]);

    const updateOption = <K extends keyof ChatterboxTtsOptions>(key: K, value: ChatterboxTtsOptions[K]) => {
        setOptions((current) => ({ ...current, [key]: value }));
    };

    const selectUploadedAudio = (file: File | null) => {
        setReferenceAudio(file);
        setSelectedLibraryReference(null);
        setReferenceThumbnail('');
        setReferenceSaveStatus('idle');
    };

    const selectReferenceThumbnail = async (file: File | null) => {
        if (!file) return;
        try {
            setReferenceThumbnail(await fileToResizedDataUrl(file, 512));
            setReferenceSaveStatus('idle');
        } catch {
            setError('Could not read the reference thumbnail.');
        }
    };

    const selectLibraryReference = async (item: LibraryItem) => {
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error(`Could not read library reference (${response.status}).`);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1]?.replace('mpeg', 'mp3').replace('x-wav', 'wav') || 'wav';
            const filename = `${item.name || 'tts-reference'}.${extension}`;
            setReferenceAudio(new File([blob], filename, { type: getAudioMimeType(filename, blob.type) }));
            setReferenceThumbnail(item.thumbnail || '');
            setSelectedLibraryReference(item);
            setReferenceSource('upload');
            setReferenceSaveStatus('idle');
            setError('');
        } catch (selectionError) {
            setError(selectionError instanceof Error ? selectionError.message : 'Could not load the TTS reference.');
        }
    };

    const saveReferenceToLibrary = async () => {
        if (!referenceAudio || referenceSaveStatus !== 'idle') return;
        setReferenceSaveStatus('saving');
        setError('');
        try {
            const media = await fileToDataUrl(referenceAudio);
            const filename = referenceAudio.name.replace(/\.[^.]+$/, '') || 'TTS Reference';
            await dispatch(addToLibrary({
                name: filename,
                mediaType: 'tts-reference',
                media,
                thumbnail: referenceThumbnail || createAudioThumbnail(),
            })).unwrap();
            setReferenceSaveStatus('saved');
        } catch (saveError) {
            setReferenceSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save the TTS reference.');
        }
    };

    const generateRandomDialogue = async () => {
        if (isGeneratingDialogue) return;
        setIsGeneratingDialogue(true);
        setError('');
        try {
            const result = await generateTtsDialogue(dialogueTheme, dialogueDuration, options.language);
            setText(result.text);
        } finally {
            setIsGeneratingDialogue(false);
        }
    };

    const generate = async () => {
        const hasReference = referenceSource === 'suite' ? Boolean(selectedSuiteVoice) : Boolean(referenceAudio);
        if (!text.trim() || !hasReference || !isComfyUIConnected || isGenerating) return;
        setIsGenerating(true);
        setAudioUrl('');
        setGeneratedReference(null);
        setError('');
        setSaveStatus('idle');
        try {
            const reference = referenceSource === 'suite'
                ? { type: 'suite' as const, voice: selectedSuiteVoice }
                : { type: 'upload' as const, file: referenceAudio! };
            const result = await generateChatterboxTts(text, reference, options, (message, value) => {
                setProgressMessage(message);
                setProgress(value);
            });
            setAudioUrl(result);
            setGeneratedReference({
                name: referenceSource === 'suite'
                    ? suiteVoices.find(({ value }) => value === selectedSuiteVoice)?.label || selectedSuiteVoice
                    : selectedLibraryReference?.name || referenceAudio?.name || 'Uploaded voice',
                source: referenceSource === 'suite' ? 'suite' : selectedLibraryReference ? 'library' : 'upload',
                thumbnail: referenceSource === 'upload' ? referenceThumbnail : '',
            });
            setProgress(1);
            setProgressMessage('Voice generated.');
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'TTS generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };

    const saveToLibrary = async () => {
        if (!audioUrl || saveStatus !== 'idle') return;
        setSaveStatus('saving');
        setError('');
        try {
            const response = await fetch(audioUrl);
            if (!response.ok) throw new Error(`Could not read generated audio (${response.status}).`);
            const blob = await response.blob();
            const outputFilename = new URL(audioUrl, window.location.href).searchParams.get('filename') || 'chatterbox-tts.wav';
            const mimeType = getAudioMimeType(outputFilename, blob.type);
            const media = await fileToDataUrl(new File([blob], outputFilename, { type: mimeType }));
            const title = text.trim().split(/\s+/).slice(0, 7).join(' ');
            await dispatch(addToLibrary({
                name: `TTS - ${title}${text.trim().split(/\s+/).length > 7 ? '...' : ''}`,
                mediaType: 'audio-tts',
                media,
                thumbnail: generatedReference?.thumbnail || createAudioThumbnail(),
                ttsOptions: {
                    text: text.trim(),
                    referenceAudioName: generatedReference?.name || 'Unknown voice',
                    referenceSource: generatedReference?.source || referenceSource,
                    ...options,
                },
            })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save TTS audio.');
        }
    };

    return (
        <>
        <section className="overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-lg">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-accent"><MicrophoneIcon className="h-6 w-6" />TTS Voice Clone</h2>
                    <p className="mt-1 text-xs text-text-muted">ChatterBox Voice TTS via ComfyUI</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${isComfyUIConnected ? 'bg-green-500/15 text-green-400' : 'bg-danger-bg text-danger'}`}>ComfyUI {isComfyUIConnected ? 'connected' : 'offline'}</div>
            </header>

            <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
                <aside className="border-b border-border-primary p-5 lg:border-b-0 lg:border-r">
                    <div className="mb-5">
                        <label className="mb-2 block text-xs font-bold uppercase text-text-secondary">Reference voice</label>
                        <div className="mb-3 grid grid-cols-2 rounded-md border border-border-primary bg-bg-primary p-1">
                            <button onClick={() => setReferenceSource('suite')} disabled={suiteVoices.length === 0} className={`h-9 rounded text-xs font-semibold ${referenceSource === 'suite' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'} disabled:opacity-40`}>Audio Suite</button>
                            <button onClick={() => setReferenceSource('upload')} className={`h-9 rounded text-xs font-semibold ${referenceSource === 'upload' ? 'bg-accent text-accent-text' : 'text-text-secondary hover:text-text-primary'}`}>My voices</button>
                        </div>
                        {referenceSource === 'suite' ? (
                            <div className="rounded-md border border-border-primary bg-bg-primary p-3">
                                <Select variant="search" label="Installed voice" value={selectedSuiteVoice} options={suiteVoices} onChange={setSelectedSuiteVoice} disabled={isLoadingVoices || suiteVoices.length === 0}
                                    placeholder={isLoadingVoices ? 'Loading voices...' : suiteVoices.length === 0 ? 'No compatible voices found' : 'Select a voice'} />
                                <p className="mt-2 text-xs text-text-muted">{suiteVoices.length} compatible references found in TTS Audio Suite.</p>
                            </div>
                        ) : (
                            <>
                                <button onClick={() => audioInput.current?.click()} className={`flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed p-4 text-center ${referenceAudio ? 'border-accent bg-bg-primary text-accent' : 'border-border-primary bg-bg-primary text-text-muted hover:border-accent'}`}>
                                    <UploadCloudIcon className="h-8 w-8" />
                                    <span className="max-w-full truncate text-sm font-semibold">{referenceAudio?.name || 'Choose source voice audio'}</span>
                                    <span className="text-xs opacity-70">WAV, MP3, FLAC, M4A or OGG</span>
                                </button>
                                <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={(event) => selectUploadedAudio(event.target.files?.[0] || null)} />
                                {referenceAudioUrl && <div className="mt-3"><AudioPlayer src={referenceAudioUrl} label="Source voice" detail={referenceAudio?.name} compact /></div>}
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button onClick={() => setIsReferencePickerOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border-primary bg-bg-primary px-3 text-xs font-semibold text-text-secondary hover:border-accent hover:text-accent"><LibraryIcon className="h-4 w-4" />TTS Library</button>
                                    <button onClick={() => thumbnailInput.current?.click()} disabled={!referenceAudio} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border-primary bg-bg-primary px-3 text-xs font-semibold text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"><PhotographIcon className="h-4 w-4" />Add photo</button>
                                </div>
                                <input ref={thumbnailInput} type="file" accept="image/*" className="hidden" onChange={(event) => selectReferenceThumbnail(event.target.files?.[0] || null)} />
                                {referenceThumbnail && <div className="mt-3 flex items-center gap-3 rounded-md border border-border-primary bg-bg-primary p-2"><img src={referenceThumbnail} alt="Reference thumbnail" className="h-14 w-14 rounded object-cover" /><div className="min-w-0"><p className="text-xs font-semibold text-text-primary">Reference thumbnail</p><p className="truncate text-xs text-text-muted">Used for this voice and its generated results</p></div></div>}
                                {referenceAudio && !selectedLibraryReference && <button onClick={saveReferenceToLibrary} disabled={referenceSaveStatus !== 'idle'} className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md font-bold ${referenceSaveStatus === 'saved' ? 'bg-green-500 text-black' : 'bg-accent text-accent-text hover:bg-accent-hover'} disabled:cursor-default`}>
                                    {referenceSaveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : referenceSaveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{referenceSaveStatus === 'saving' ? 'Saving reference...' : referenceSaveStatus === 'saved' ? 'Reference saved' : 'Save as TTS reference'}
                                </button>}
                            </>
                        )}
                        {voiceLoadError && <p className="mt-2 text-xs text-danger">{voiceLoadError} Upload remains available.</p>}
                    </div>

                    <Accordion title="Advanced">
                        <Select<ChatterboxTtsOptions['device']> label="Device" value={options.device} onChange={device => updateOption('device', device)}
                            options={[{ value: 'auto', label: 'Auto' }, { value: 'cuda', label: 'CUDA' }, { value: 'cpu', label: 'CPU' }]} />
                        <NumberField slider label="Exaggeration" value={options.exaggeration} min={0} max={2} step={0.01} onChange={value => updateOption('exaggeration', value)} />
                        <NumberField slider label="Temperature" value={options.temperature} min={0.05} max={2} step={0.01} onChange={value => updateOption('temperature', value)} />
                        <NumberField slider label="CFG weight" value={options.cfgWeight} min={0} max={1} step={0.01} onChange={value => updateOption('cfgWeight', value)} />
                        <SeedField name="TTS" value={options.seed} max={2147483647} onChange={seed => updateOption('seed', seed)} />
                        <TextField label="Audio prompt path" value={options.audioPromptPath} onChange={value => updateOption('audioPromptPath', value)} />
                        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary"><input type="checkbox" checked={options.enableChunking} onChange={(event) => updateOption('enableChunking', event.target.checked)} className="h-4 w-4 accent-accent" />Enable chunking</label>
                        <NumberField slider label="Max characters per chunk" value={options.maxCharsPerChunk} min={50} max={2000} step={1} onChange={value => updateOption('maxCharsPerChunk', value)} />
                        <Select<ChatterboxTtsOptions['chunkCombinationMethod']> label="Chunk combination" value={options.chunkCombinationMethod} onChange={method => updateOption('chunkCombinationMethod', method)}
                            options={[{ value: 'auto', label: 'Auto' }, { value: 'concatenate', label: 'Concatenate' }, { value: 'crossfade', label: 'Crossfade' }]} />
                        <NumberField slider label="Silence between chunks (ms)" value={options.silenceBetweenChunksMs} min={0} max={5000} step={10} onChange={value => updateOption('silenceBetweenChunksMs', value)} />
                        <TextField label="Filename prefix" value={options.filenamePrefix} onChange={value => updateOption('filenamePrefix', value)} />
                    </Accordion>
                </aside>

                <div className="p-5">
                    <div className="mb-3 grid items-end gap-2 sm:grid-cols-2 xl:grid-cols-[160px_minmax(0,1fr)_110px_auto]">
                        <Select<ChatterboxLanguage> variant="search" label="Language" value={options.language} options={CHATTERBOX_LANGUAGES} onChange={language => updateOption('language', language)} />
                        <Select<TtsDialogueTheme> label="Dialogue style" value={dialogueTheme} options={TTS_DIALOGUE_THEMES} onChange={setDialogueTheme} />
                        <Select<number> label="Target time" value={dialogueDuration} options={Array.from({ length: 13 }, (_, index) => ({ value: index + 3, label: `${index + 3} sec` }))} onChange={setDialogueDuration} />
                        <Button onClick={generateRandomDialogue} disabled={isGeneratingDialogue} className="h-10">
                            {isGeneratingDialogue ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <DiceIcon className="h-4 w-4" />}{isGeneratingDialogue ? 'Writing...' : 'Random Dialogue'}
                        </Button>
                    </div>
                    <PromptBox label="Text to speak" kind="positive" highlight={false} value={text} onChange={setText} rows={10} placeholder="Write what the cloned voice should say..." />
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-text-muted"><span>{text.length} characters</span><span>Approx. speaking time: {estimateSpeechDuration(text, options.language).toFixed(1)} sec</span><span>{options.enableChunking ? `Chunks every ${options.maxCharsPerChunk} characters` : 'Chunking disabled'}</span></div>

                    <button onClick={generate} disabled={!text.trim() || (referenceSource === 'suite' ? !selectedSuiteVoice : !referenceAudio) || !isComfyUIConnected || isGenerating} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent font-bold text-accent-text hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
                        {isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Generating voice...' : 'Generate TTS'}
                    </button>

                    {isGenerating && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-primary"><div className="h-full bg-accent" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div></div>}
                    {error && <p className="mt-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                    {audioUrl && <div className="mt-5 border-t border-border-primary pt-5">
                        <AudioPlayer src={audioUrl} label="Generated voice" detail="ChatterBox TTS output" />
                        <div className="mt-3 flex flex-wrap gap-2">
                            <a href={audioUrl} download className="inline-flex h-10 items-center gap-2 rounded-md border border-border-primary px-4 text-sm font-semibold text-accent hover:border-accent"><DownloadIcon className="h-4 w-4" />Download</a>
                            <button onClick={saveToLibrary} disabled={saveStatus !== 'idle'} className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-bold ${saveStatus === 'saved' ? 'bg-green-500 text-black' : 'bg-accent text-accent-text hover:bg-accent-hover'} disabled:cursor-default`}>
                                {saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved to Audio TTS' : 'Save to Library'}
                            </button>
                        </div>
                    </div>}
                </div>
            </div>
        </section>
        <LibraryPickerModal isOpen={isReferencePickerOpen} onClose={() => setIsReferencePickerOpen(false)} onSelectItem={selectLibraryReference} filter={['tts-reference', 'audio-tts']} />
        </>
    );
};

export const TtsPanel: React.FC<TtsPanelProps> = ({ isComfyUIConnected }) => {
    const [activeSubgroup, setActiveSubgroup] = useState<'voice-clone' | 'advanced'>('voice-clone');

    return <div>
        <nav className="mb-4 grid grid-cols-2 border-b border-border-primary" aria-label="TTS tools">
            <button onClick={() => setActiveSubgroup('voice-clone')} aria-current={activeSubgroup === 'voice-clone' ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-sm font-bold transition-colors ${activeSubgroup === 'voice-clone' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'}`}>TTS Voice Clone</button>
            <button onClick={() => setActiveSubgroup('advanced')} aria-current={activeSubgroup === 'advanced' ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-sm font-bold transition-colors ${activeSubgroup === 'advanced' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'}`}>TTS Advanced</button>
        </nav>
        {activeSubgroup === 'voice-clone'
            ? <TtsVoiceClonePanel isComfyUIConnected={isComfyUIConnected} />
            : <TtsAdvancedPanel isComfyUIConnected={isComfyUIConnected} />}
    </div>;
};
