import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { GenerationOptions, LibraryItem } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { addSessionTokenUsage } from '../store/appSlice';
import { setLoadingState } from '../store/generationSlice';
import { cancelComfyUIExecution, exportComfyUIWorkflow, generateComfyUICharacterScene } from '../services/comfyUIService';
import { analyzeCharacterScene } from '../services/qwen21CharacterSceneService';
import { buildCharacterSceneWorkflow, characterScenePrompt, defaultCharacterSceneOptions, validateCharacterSceneReadiness, type CharacterSceneOptions } from '../services/qwen21CharacterSceneWorkflow';
import { getQwen21Choices, qwen21MultiDimensions, QWEN21_MULTI_SIZES, type Qwen21Lora } from '../services/qwen21Workflow';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from '../services/ollamaService';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider } from './InputComponents';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, ResetIcon, SaveIcon, SpinnerIcon, WorkflowIcon } from './icons';

interface Props { isComfyUIConnected: boolean | null; objectInfo: any; onModelChange: (model: string) => void }
interface Result { src: string; before: string; original: string; character: string; prompt: string; seed: number; width: number; height: number; seconds: number; options: GenerationOptions }
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const input = 'mt-1 w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary disabled:opacity-50';
const initial = () => ({ ...defaultCharacterSceneOptions(), ollamaUrl: localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL, ollamaModel: localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL });
const CharacterScenePanel: React.FC<Props> = ({ isComfyUIConnected, objectInfo, onModelChange }) => {
    const dispatch: AppDispatch = useDispatch();
    const global = useSelector((state: RootState) => state.generation);
    const [settings, setSettings] = useState<CharacterSceneOptions>(initial);
    const current = useRef(settings); current.current = settings;
    const [scene, setScene] = useState<File | null>(null);
    const [character, setCharacter] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [library, setLibrary] = useState<'scene' | 'character' | 'restore' | null>(null);
    const [compare, setCompare] = useState(true);
    const [position, setPosition] = useState(50);
    const request = useRef<AbortController | null>(null);
    const generation = useRef<AbortController | null>(null);
    const busy = useRef(false);
    const skipAnalysis = useRef(false);
    const analyzedSources = useRef<{ scene: File | null; character: File | null }>({ scene: null, character: null });
    const locked = running || saving || global.isLoading;
    const analysis = settings.analysis || null;
    const update = (change: Partial<CharacterSceneOptions>) => setSettings(previous => ({ ...previous, ...change }));
    useEffect(() => { onModelChange(`Qwen Image 2.1 - Character in a Scene: ${settings.unet}`); }, [settings.unet, onModelChange]);
    const analyze = async () => {
        if (!scene || busy.current || global.isLoading) return;
        request.current?.abort(); const cancellation = new AbortController(); request.current = cancellation;
        setAnalyzing(true); setError(''); update({ analysis: null, targetId: '', placement: '' });
        try {
            const response = await analyzeCharacterScene(scene, character, current.current, cancellation.signal);
            if (request.current !== cancellation || cancellation.signal.aborted) return;
            update({ analysis: response.analysis });
            if (response.usageMetadata) dispatch(addSessionTokenUsage(response.usageMetadata));
        } catch (failure) { if (!cancellation.signal.aborted && request.current === cancellation) setError(failure instanceof Error ? failure.message : 'Image analysis failed.'); }
        finally { if (request.current === cancellation) { request.current = null; setAnalyzing(false); } }
    };
    useEffect(() => {
        const unchanged = analyzedSources.current.scene === scene && analyzedSources.current.character === character;
        analyzedSources.current = { scene, character };
        if (skipAnalysis.current) { skipAnalysis.current = false; return; }
        if (unchanged) return;
        request.current?.abort();
        request.current = null;
        setAnalyzing(false);
        update({ analysis: null, targetId: '', placement: '' });
    }, [scene, character]);
    useEffect(() => () => { request.current?.abort(); }, []);
    let prompt = ''; let readiness = ''; let promptError = ''; let dimensions = { width: 1152, height: 864 };
    try { prompt = characterScenePrompt(settings, analysis); } catch (failure) { promptError = failure instanceof Error ? failure.message : 'Complete the analysis.'; }
    try {
        dimensions = qwen21MultiDimensions(settings);
        const graph = buildCharacterSceneWorkflow('scene.png', 'character.png', { ...settings, prompt: prompt || settings.prompt || 'Character in a scene.', seed: settings.seed === -1 ? 0 : settings.seed });
        if (isComfyUIConnected && objectInfo) validateCharacterSceneReadiness(graph, objectInfo);
    } catch (failure) { readiness = failure instanceof Error ? failure.message : 'Invalid workflow settings.'; }
    const ready = !!scene && !!character && !!analysis && !analyzing && !locked && !!isComfyUIConnected && !!objectInfo && !readiness && !promptError;
    const snapshotOptions = (snapshot: CharacterSceneOptions): GenerationOptions => ({ ...structuredClone(global.options), provider: 'comfyui', comfyModelType: 'qwen21-character-scene', comfyPrompt: snapshot.prompt, comfySeed: snapshot.seed, comfyCharacterScene: snapshot });
    const generate = async () => {
        if (!ready || !scene || !character || busy.current) return;
        busy.current = true; setRunning(true); setStopping(false); setError('');
        const cancellation = new AbortController(); generation.current = cancellation;
        const snapshot = structuredClone(settings); const sceneFile = scene; const characterFile = character; const started = performance.now(); const options = snapshotOptions(snapshot);
        dispatch(setLoadingState({ isLoading: true }));
        try {
            const [original, characterOriginal] = await Promise.all([fileToDataUrl(sceneFile), fileToDataUrl(characterFile)]); cancellation.signal.throwIfAborted();
            const generated = await generateComfyUICharacterScene(sceneFile, characterFile, snapshot, (text, value) => { setMessage(text); setProgress(value); }, cancellation.signal);
            const image = new Image(); image.src = generated.src; await image.decode(); cancellation.signal.throwIfAborted();
            setResult({ ...generated, original, character: characterOriginal, width: image.naturalWidth, height: image.naturalHeight, seconds: (performance.now() - started) / 1000, options: { ...options, comfyPrompt: generated.prompt, comfySeed: generated.seed, comfyCharacterScene: { ...snapshot, seed: generated.seed, prompt: generated.prompt } } });
            setSaved(false); setPosition(50);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Character in a Scene failed.'); }
        finally { busy.current = false; generation.current = null; setRunning(false); setStopping(false); dispatch(setLoadingState({ isLoading: false })); }
    };
    const stop = async () => { if (!running || stopping) return; setStopping(true); generation.current?.abort(new Error('Generation cancelled.')); await cancelComfyUIExecution(); };
    const save = async () => {
        if (!result || saved || locked || busy.current) return;
        busy.current = true; setSaving(true); setError('');
        try { await dispatch(addToLibrary({ mediaType: 'image', name: `Character in a Scene - ${result.width}x${result.height}`, media: result.src, thumbnail: await dataUrlToThumbnail(result.src, 256), sourceImage: result.original, characterSceneImage: result.character, options: result.options, tags: ['qwen21', 'character-in-scene'] })).unwrap(); setSaved(true); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Library save failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const exportWorkflow = async () => {
        if (!ready || !scene || !character || busy.current) return;
        busy.current = true; setSaving(true); setError('');
        try { await exportComfyUIWorkflow(snapshotOptions({ ...structuredClone(settings), seed: settings.seed === -1 && result ? result.seed : settings.seed }), scene, [character]); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Export failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const chooseLibrary = async (item: LibraryItem) => {
        if (!library || locked || busy.current) return;
        const target = library; setLibrary(null); busy.current = true; setSaving(true); setError('');
        try {
            const read = async (url: string | undefined, name: string) => { if (!url) throw new Error('Saved source image unavailable.'); const response = await fetch(url); if (!response.ok) throw new Error('Library image unavailable.'); const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('Choose an image.'); return new File([blob], name, { type: blob.type }); };
            if (target === 'restore') {
                if (!item.options?.comfyCharacterScene) throw new Error('Choose a saved Character in a Scene result.');
                const [sceneFile, characterFile] = await Promise.all([read(item.sourceImage, 'scene.png'), read(item.characterSceneImage, 'character.png')]);
                request.current?.abort(); skipAnalysis.current = true; setAnalyzing(false); setSettings(structuredClone(item.options.comfyCharacterScene)); setScene(sceneFile); setCharacter(characterFile);
            } else { const file = await read(item.media, `${target}.png`); if (target === 'scene') setScene(file); else setCharacter(file); }
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Library load failed.'); }
        finally { busy.current = false; setSaving(false); }
    };
    const select = (label: string, key: keyof CharacterSceneOptions, type: string, name: string) => <label className="block text-sm text-text-secondary">{label}<select aria-label={label} className={input} disabled={locked} value={String(settings[key])} onChange={event => update({ [key]: event.target.value })}>{[...new Set([String(settings[key]), ...getQwen21Choices(objectInfo, type, name)])].map(value => <option key={value}>{value}</option>)}</select></label>;
    const loraChange = (key: 'lora' | 'extraLora', change: Partial<Qwen21Lora>) => update({ [key]: { ...settings[key], ...change } });
    const reset = () => { if (locked || busy.current) return; request.current?.abort(); setSettings(initial()); setScene(null); setCharacter(null); setResult(null); setSaved(false); setError(''); };
    return <section aria-label="Character in a Scene" className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary pb-3"><h2 className="text-xl font-bold text-accent">Character in a Scene</h2><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={() => setLibrary('restore')}><LibraryIcon className="h-4 w-4" />Restore composition</button><button type="button" className={button} disabled={locked} onClick={reset}><ResetIcon className="h-4 w-4" />Reset</button></div></header>
        {!isComfyUIConnected && <p role="status" className="text-sm text-text-secondary">ComfyUI disconnected.</p>}
        {(error || readiness) && <p role="alert" className="break-words rounded-md border border-danger/50 bg-danger-bg p-3 text-sm text-danger">{error || readiness}</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"><div className="min-w-0 space-y-4">
            <ImageUploader id="character-scene-source" label="Scene / <image1>" sourceFile={scene} onImageUpload={setScene} disabled={locked} /><button type="button" className={`${button} w-full`} disabled={locked} onClick={() => setLibrary('scene')}><LibraryIcon className="h-4 w-4" />Scene from Library</button>
            <ImageUploader id="character-scene-character" label="Character / <image2>" sourceFile={character} onImageUpload={setCharacter} disabled={locked} /><button type="button" className={`${button} w-full`} disabled={locked} onClick={() => setLibrary('character')}><LibraryIcon className="h-4 w-4" />Character from Library</button>
            <label className="block text-sm text-text-secondary">Image analysis<select aria-label="Scene analysis provider" className={input} disabled={locked || analyzing} value={settings.analysisProvider} onChange={event => update({ analysisProvider: event.target.value as CharacterSceneOptions['analysisProvider'] })}><option value="gemini">Gemini</option><option value="mammouth">Mammouth</option><option value="ollama">Ollama</option></select></label>
            {settings.analysisProvider === 'mammouth' && <label className="block text-sm text-text-secondary">Mammouth vision model<input aria-label="Mammouth vision model" className={input} disabled={locked || analyzing} placeholder="gemini-2.5-flash" value={settings.mammouthModel} onChange={event => update({ mammouthModel: event.target.value })} /></label>}
            {settings.analysisProvider === 'ollama' && <><label className="block text-sm text-text-secondary">Ollama URL<input aria-label="Ollama URL" className={input} disabled={locked || analyzing} value={settings.ollamaUrl} onChange={event => update({ ollamaUrl: event.target.value })} /></label><label className="block text-sm text-text-secondary">Ollama vision model<input aria-label="Ollama vision model" className={input} disabled={locked || analyzing} value={settings.ollamaModel} onChange={event => update({ ollamaModel: event.target.value })} /></label></>}
            <button type="button" className={button} disabled={locked || analyzing || !scene} onClick={() => { void analyze(); }}>{analyzing ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <RefreshIcon className="h-4 w-4" />}{analyzing ? 'Analyzing...' : 'Analyze scene and character'}</button>
            <label className="block text-sm text-text-secondary">Output Size<select aria-label="Output Size" className={input} disabled={locked} value={settings.sizeIndex} onChange={event => update({ sizeIndex: Number(event.target.value) })}>{QWEN21_MULTI_SIZES.map(([width, height], index) => <option key={index} value={index}>{width} x {height}</option>)}</select></label><label className="block text-sm text-text-secondary">Orientation<select aria-label="Orientation" className={input} disabled={locked} value={settings.orientation} onChange={event => update({ orientation: event.target.value as 'portrait' | 'landscape' })}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><output className="text-xs text-text-secondary">{dimensions.width} x {dimensions.height}</output>
            <label className="block text-sm text-text-secondary">Seed (-1 = random)<input aria-label="Character Scene Seed" type="number" min={-1} max={Number.MAX_SAFE_INTEGER} step={1} className={input} disabled={locked} value={settings.seed} onChange={event => update({ seed: Number(event.target.value) })} /></label>
            <details className="border-t border-border-primary pt-3"><summary className="cursor-pointer text-sm font-bold uppercase text-accent">Models & Sampling</summary><div className="space-y-3 pt-3">{select('Diffusion Model', 'unet', 'UNETLoader', 'unet_name')}{select('Weight Dtype', 'weightDtype', 'UNETLoader', 'weight_dtype')}{select('CLIP', 'clip', 'CLIPLoader', 'clip_name')}{select('CLIP Device', 'clipDevice', 'CLIPLoader', 'device')}{select('VAE', 'vae', 'VAELoader', 'vae_name')}{select('Cache Device', 'cacheDevice', 'QwenImage21Cache', 'device')}{select('Cache Dtype', 'cacheDtype', 'QwenImage21Cache', 'dtype')}{select('Attention', 'attention', 'ModelAttentionBackend', 'attention')}{select('Sampler', 'sampler', 'KSampler', 'sampler_name')}{select('Scheduler', 'scheduler', 'KSampler', 'scheduler')}{select('Scene Upscale Method', 'referenceUpscale', 'ImageScaleToTotalPixels', 'upscale_method')}{(['steps', 'cfg', 'denoise', 'referenceResolution', 'resolutionSteps', 'characterMegapixels'] as const).map(key => <NumberSlider key={key} label={key === 'characterMegapixels' ? 'Character Reference MP' : key === 'referenceResolution' ? 'Encoder Resolution' : key === 'resolutionSteps' ? 'Scene Resolution Steps' : key === 'cfg' ? 'CFG' : key === 'steps' ? 'Steps' : 'Denoise'} min={key === 'steps' || key === 'resolutionSteps' ? 1 : key === 'characterMegapixels' ? 0.01 : 0} max={key === 'steps' ? 100 : key === 'cfg' ? 20 : key === 'denoise' ? 1 : key === 'referenceResolution' ? 4096 : key === 'resolutionSteps' ? 256 : 16} step={key === 'steps' || key === 'resolutionSteps' ? 1 : key === 'referenceResolution' ? 32 : 0.01} value={settings[key]} disabled={locked} allowDirectInput onChange={event => update({ [key]: Number(event.target.value) })} />)}<label className="block text-sm text-text-secondary">Negative Prompt<textarea aria-label="Negative Prompt" className={input} rows={2} disabled={locked} value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} /></label></div></details>
        </div><div className="min-w-0 space-y-4">
            <div role="group" aria-label="Character scene operation" className="flex gap-1 border-b border-border-primary">{(['insert', 'replace'] as const).map(mode => <button type="button" key={mode} aria-pressed={settings.mode === mode} disabled={locked} onClick={() => update({ mode, manualPrompt: false })} className={`border-b-2 px-4 py-2 text-sm font-semibold ${settings.mode === mode ? 'border-accent text-accent' : 'border-transparent text-text-secondary'}`}>{mode === 'insert' ? 'Insert' : 'Replace'}</button>)}</div>
            {settings.mode === 'replace' && <label className="block text-sm text-text-secondary">Who to replace<select aria-label="Person to replace" className={input} disabled={locked || analyzing || !analysis?.people.length} value={settings.targetId} onChange={event => update({ targetId: event.target.value, manualPrompt: false })}><option value="">Choose a person</option>{analysis?.people.map(person => <option key={person.id} value={person.id}>{person.id}: {person.description}</option>)}</select></label>}
            {settings.mode === 'insert' && <label className="block text-sm text-text-secondary">Placement<select aria-label="Character placement" className={input} disabled={locked || analyzing || !analysis} value={settings.placement} onChange={event => update({ placement: event.target.value })}><option value="">Automatic / refinement</option>{analysis?.placements.map((placement, index) => <option key={index} value={placement.instruction}>{placement.label}</option>)}</select></label>}
            {promptError && <p role="status" className="text-sm text-text-secondary">{promptError}</p>}
            {settings.mode === 'replace' && analysis?.people.filter(person => person.id === settings.targetId).map(person => <fieldset key={person.id} className="min-w-0 space-y-2 border-b border-border-primary pb-3"><legend className="text-sm font-bold text-accent">Selected person</legend>{(['description', 'pose', 'expression'] as const).map(key => <label key={key} className="block text-xs text-text-secondary">{key}<input aria-label={`${person.id} ${key}`} className={input} value={person[key]} disabled={locked || analyzing} onChange={event => update({ analysis: { ...analysis, people: analysis.people.map(item => item.id === person.id ? { ...item, [key]: event.target.value } : item) }, manualPrompt: false })} /></label>)}</fieldset>)}
            {analysis && <details className="border-t border-border-primary pt-3"><summary className="cursor-pointer text-sm font-bold text-accent">Scene / character analysis</summary><div className="space-y-3 pt-3">{(['scene', 'style', 'lighting', 'character'] as const).map(key => <label key={key} className="block text-sm text-text-secondary">{key === 'character' ? 'Character appearance' : key === 'scene' ? 'Scene layout' : key === 'style' ? 'Scene style' : 'Scene lighting'}<textarea aria-label={`Analyzed ${key}`} className={input} rows={2} disabled={locked || analyzing} value={analysis[key]} onChange={event => update({ analysis: { ...analysis, [key]: event.target.value } })} /></label>)}{analysis.uncertainty && <p role="status" className="break-words text-sm text-text-secondary">{analysis.uncertainty}</p>}</div></details>}
            <label className="block text-sm text-text-secondary">Refine placement / result<textarea aria-label="Character scene refinement" className={input} rows={3} disabled={locked} value={settings.refinement} onChange={event => update({ refinement: event.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" aria-label="Manual scene prompt" disabled={locked || (!settings.manualPrompt && !!promptError)} checked={settings.manualPrompt} onChange={event => update({ manualPrompt: event.target.checked, prompt })} />Manual prompt</label><label className="block text-sm text-text-secondary">Qwen 2.1 Prompt<textarea aria-label="Character in a Scene Prompt" className={input} rows={8} readOnly={!settings.manualPrompt} disabled={locked} value={prompt} onChange={event => update({ prompt: event.target.value })} /></label>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} aria-label="Export Character Scene workflow" title="Export Character Scene workflow" disabled={!ready} onClick={exportWorkflow}><WorkflowIcon className="h-4 w-4" /></button>{running && <button type="button" className={button} disabled={stopping} onClick={stop}><CloseIcon className="h-4 w-4" />{stopping ? 'Stopping...' : 'Stop'}</button>}<button type="button" className={`${button} !border-accent bg-accent !text-accent-text`} disabled={!ready} onClick={generate}>{running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{running ? 'Generating...' : 'Generate'}</button></div>
            {running && <div role="status"><p className="text-xs text-text-secondary">{message}</p><progress aria-label="Character Scene progress" max={1} value={progress} className="w-full accent-accent" /></div>}
            {result && <div className="space-y-3 border-t border-border-primary pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Result <span className="text-xs font-normal text-text-secondary">{result.width} x {result.height} / {result.seconds.toFixed(1)} s</span></h3><div className="flex flex-wrap gap-2"><a className={button} aria-label="Download scene PNG" title="Download scene PNG" href={result.src} download={`character-in-scene-${result.seed}.png`}><DownloadIcon className="h-4 w-4" /></a><button type="button" className={button} disabled={locked || saved} aria-label="Save scene PNG to Library" onClick={save}>{saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved ? 'Saved' : 'Save to Library'}</button><SendToLTXButton imageDataUrl={result.src} prompt={result.prompt} className={button} /></div></div><label className="flex items-center gap-2 text-sm"><input aria-label="Compare scene / result" type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Compare scene / result</label><div className="relative mx-auto overflow-hidden bg-bg-tertiary" style={{ width: '100%', maxWidth: 520 * result.width / result.height, aspectRatio: `${result.width} / ${result.height}` }}><img src={result.src} alt="Character in a Scene result" className="absolute h-full w-full object-contain" />{compare && <><img src={result.before} alt="Native scene reference" className="absolute h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} /><div className="pointer-events-none absolute inset-y-0 w-px bg-accent" style={{ left: `${position}%` }} /></>}</div>{compare && <input aria-label="Scene / result comparison" type="range" min={0} max={100} value={position} onChange={event => setPosition(Number(event.target.value))} className="w-full accent-accent" />}<p className="text-xs text-text-muted">Seed {result.seed}</p></div>}
            <details open className="border-t border-border-primary pt-4"><summary className="cursor-pointer text-base font-bold uppercase text-accent">LoRA Settings</summary><div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">{(['lora', 'extraLora'] as const).map((key, index) => { const lora = settings[key]; const label = index === 0 ? 'Fusion LoRA' : 'Additional LoRA'; return <div key={key} className="min-w-0 space-y-3 border-b border-border-primary pb-3"><label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" aria-label={`Enable ${label}`} checked={lora.enabled} disabled={locked} onChange={event => loraChange(key, { enabled: event.target.checked })} />{label}</label><label className="block text-sm text-text-secondary">{label} Model<select aria-label={`${label} Model`} className={input} disabled={locked} value={lora.name} onChange={event => loraChange(key, { name: event.target.value, enabled: !!event.target.value })}>{[...new Set(['', lora.name, ...getQwen21Choices(objectInfo, 'LoraLoader', 'lora_name'), ...getQwen21Choices(objectInfo, 'LoraLoaderModelOnly', 'lora_name')])].map(name => <option key={name} value={name}>{name || 'None'}</option>)}</select></label>{lora.name && <><NumberSlider label={`${label} Model Strength`} min={-2} max={2} step={0.05} value={lora.modelStrength} disabled={locked || !lora.enabled} allowDirectInput onChange={event => loraChange(key, { modelStrength: Number(event.target.value) })} /><NumberSlider label={`${label} CLIP Strength`} min={-2} max={2} step={0.05} value={lora.clipStrength} disabled={locked || !lora.enabled} allowDirectInput onChange={event => loraChange(key, { clipStrength: Number(event.target.value) })} /></>}</div>; })}</div></details>
        </div></div>
        <LibraryPickerModal isOpen={!!library} onClose={() => setLibrary(null)} onSelectItem={item => { void chooseLibrary(item); }} filter={['image', 'character', 'extracted-frame', 'past-forward-photo']} />
    </section>;
};
export default CharacterScenePanel;