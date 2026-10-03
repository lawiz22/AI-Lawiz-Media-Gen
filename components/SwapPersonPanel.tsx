import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { buildQuickSwapPersonPrompt, buildLanPaintPersonPrompt, defaultQuickSwapPersonOptions, defaultLanPaintPersonOptions, personSwapPresets, personSwapTargets, type LanPaintPersonOptions } from '../services/swapPersonWorkflow';
import { defaultSwapAnythingOptions, type SwapAnythingOptions } from '../services/swapAnythingWorkflow';
import { generateComfyUISwapAnything, generateComfyUILanPaintPerson } from '../services/comfyUIService';
import { sceneModelOptions } from '../services/sceneVariationService';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider } from './InputComponents';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon } from './icons';

type Side = 'destination' | 'donor';
interface PersonImage { file: File | null; preview: string }
type SwapMode = 'swap-anything' | 'lanpaint';
type Result = { src: string; prompt: string; seed: number; source: string; target: string } & (
    { mode: 'swap-anything'; settings: SwapAnythingOptions } | { mode: 'lanpaint'; settings: LanPaintPersonOptions }
);
interface Props { isComfyUIConnected: boolean; comfyUIObjectInfo: any | null }
const emptyImage = (): PersonImage => ({ file: null, preview: '' });
const imageTypes: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'past-forward-photo', 'group-fusion', 'swap-anything'];
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm font-semibold text-text-secondary hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed';
const input = 'mt-1 block w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary';
const Select: React.FC<{ label: string; value: string; choices: Array<{ value: string; label: string }>; disabled: boolean; onChange: (value: string) => void }> = ({ label, value, choices, disabled, onChange }) => <label className="block min-w-0 text-sm text-text-secondary">{label}<select className={input} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>;

const SwapPersonPanel: React.FC<Props> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const [images, setImages] = useState<Record<Side, PersonImage>>({ destination: emptyImage(), donor: emptyImage() });
    const [options, setOptions] = useState(defaultQuickSwapPersonOptions);
    const [mode, setMode] = useState<SwapMode>('swap-anything');
    const [lanOptions, setLanOptions] = useState(defaultLanPaintPersonOptions);
    const isLanPaint = mode === 'lanpaint';
    const [preset, setPreset] = useState('face-hair');
    const [people, setPeople] = useState({ destination: 'the woman', donor: 'the woman' });
    const [preserveStyle, setPreserveStyle] = useState(false);
    const [busy, setBusy] = useState('');
    const working = useRef(false);
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [advanced, setAdvanced] = useState(false);
    const [libraryTarget, setLibraryTarget] = useState<Side | null>(null);
    const [result, setResult] = useState<Result | null>(null);
    const [saved, setSaved] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const locked = !!busy || otherBusy;
    const canGenerate = !locked && isComfyUIConnected && images.destination.file && images.donor.file && (isLanPaint ? lanOptions.prompt.trim() : options.destinationTarget.trim() && options.donorTarget.trim());
    const expectedTargets = personSwapTargets(preset, people.destination, people.donor);
    const activePreset = expectedTargets.destinationTarget === options.destinationTarget && expectedTargets.donorTarget === options.donorTarget ? preset : 'custom';
    const perform = async (kind: string, action: () => Promise<void>) => {
        if (working.current || otherBusy) return;
        working.current = true; setBusy(kind); setError(''); setProgress(0); setMessage('');
        try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operation failed.'); }
        finally { working.current = false; setBusy(''); }
    };
    const updateOption = <Key extends keyof SwapAnythingOptions>(key: Key, value: SwapAnythingOptions[Key]) => setOptions(current => ({ ...current, [key]: value }));
    const updateLanOption = <Key extends keyof LanPaintPersonOptions>(key: Key, value: LanPaintPersonOptions[Key]) => setLanOptions(current => ({ ...current, [key]: value }));
    const applyPreset = (value: string) => {
        if (value === 'custom') return;
        setPreset(value);
        setOptions(current => ({ ...current, ...personSwapTargets(value, people.destination, people.donor) }));
    };
    const changePerson = (side: Side, value: string) => {
        const next = { ...people, [side]: value }; setPeople(next);
        const targets = personSwapTargets(preset, next.destination, next.donor);
        updateOption(side === 'destination' ? 'destinationTarget' : 'donorTarget', side === 'destination' ? targets.destinationTarget : targets.donorTarget);
    };
    const loadImage = async (side: Side, file: File | null) => {
        if (file && !file.type.startsWith('image/')) throw new Error('Select an image file.');
        const preview = file ? await fileToDataUrl(file) : '';
        setImages(current => ({ ...current, [side]: { file, preview } }));
    };
    const selectLibrary = async (item: LibraryItem) => {
        const side = libraryTarget; setLibraryTarget(null);
        if (!side) return;
        await perform('loading', async () => {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error('Unable to load the Library image.');
            const blob = await response.blob();
            await loadImage(side, new File([blob], `${side}-${item.id}.png`, { type: blob.type || 'image/png' }));
        });
    };
    const generate = () => perform('generating', async () => {
        if (!images.destination.file || !images.donor.file) throw new Error('Select both images.');
        const activeOptions = isLanPaint ? lanOptions : options;
        const seed = activeOptions.seed === -1 ? Math.floor(Math.random() * 1e15) : activeOptions.seed;
        if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Enter a nonnegative integer seed or -1 for random.');
        if (isLanPaint) {
            const settings = { ...lanOptions, seed };
            const src = await generateComfyUILanPaintPerson(images.destination.file, images.donor.file, settings, (text, value) => { setMessage(text); setProgress(value); });
            setResult({ src, prompt: buildLanPaintPersonPrompt(settings), seed, source: images.destination.preview, settings, mode: 'lanpaint', target: 'Head swap' });
            setSaved(false); setShowSource(false);
            return;
        }
        let prompt = buildQuickSwapPersonPrompt({ ...options, seed });
        if (preserveStyle) prompt += '\nMatch the visual medium, softness, grain, color and capture artifacts of Picture 1, including VHS artifacts when present. Do not import the donor camera style or sharpen the destination.';
        const settings = { ...options, seed, prompt };
        const src = await generateComfyUISwapAnything(images.destination.file, images.donor.file, settings, (text, value) => { setMessage(text); setProgress(value); });
        setResult({ src, prompt, seed, source: images.destination.preview, settings, mode: 'swap-anything', target: settings.destinationTarget }); setSaved(false); setShowSource(false);
    });
    const save = () => perform('saving', async () => {
        if (!result) return;
        await dispatch(addToLibrary({ mediaType: 'swap-anything', name: `Swap a Person - ${result.mode === 'lanpaint' ? 'LanPaint - ' : ''}${result.target}`, media: result.src,
            thumbnail: await dataUrlToThumbnail(result.src, 256), sourceImage: result.source, prompt: result.prompt,
            lanPaintPersonSettings: result.mode === 'lanpaint' ? result.settings : undefined,
            options: { provider: 'comfyui', comfyModelType: 'flux2-edit', comfySeed: result.seed, comfyFlux2EditPrompt: result.prompt,
                comfyFlux2EditUnet: result.settings.unet, comfyFlux2EditClip: result.settings.clip, comfyFlux2EditVae: result.settings.vae,
                comfyFlux2EditSteps: result.settings.steps, comfyFlux2EditCfg: result.settings.cfg, comfyFlux2EditSampler: result.settings.sampler,
                comfyFlux2EditMegapixels: result.settings.megapixels,
                ...(result.mode === 'lanpaint' ? { comfyFlux2EditLora1Name: result.settings.loraName, comfyFlux2EditLora1Strength: result.settings.loraStrength,
                    comfyFlux2EditUseCacheDit: result.settings.cacheEnabled, comfyFlux2EditCacheDitModelType: 'Flux', comfyFlux2EditCacheDitWarmupSteps: 0, comfyFlux2EditCacheDitSkipInterval: 0 } : {}),
            }, tags: ['swap-person', 'flux2', ...(result.mode === 'lanpaint' ? ['lanpaint'] : [])] })).unwrap();
        setSaved(true);
    });
    const reset = () => {
        if (working.current) return;
        setImages({ destination: emptyImage(), donor: emptyImage() }); setOptions(defaultQuickSwapPersonOptions());
        setMode('swap-anything'); setLanOptions(defaultLanPaintPersonOptions());
        setPeople({ destination: 'the woman', donor: 'the woman' }); setPreset('face-hair'); setPreserveStyle(false);
        setResult(null); setError(''); setSaved(false); setShowSource(false);
    };
    const inventory = (key: 'unet' | 'clip' | 'vae' | 'sampler' | 'samCheckpoint' | 'lora1Name' | 'lora2Name') => {
        const values = key === 'unet' ? [...sceneModelOptions(comfyUIObjectInfo, 'UNETLoader', 'unet_name'), ...sceneModelOptions(comfyUIObjectInfo, 'UnetLoaderGGUF', 'unet_name').filter(name => /flux.?2|klein/i.test(name))]
            : key === 'clip' ? sceneModelOptions(comfyUIObjectInfo, 'CLIPLoader', 'clip_name') : key === 'vae' ? sceneModelOptions(comfyUIObjectInfo, 'VAELoader', 'vae_name')
                : key === 'sampler' ? sceneModelOptions(comfyUIObjectInfo, 'KSamplerSelect', 'sampler_name') : key === 'samCheckpoint' ? sceneModelOptions(comfyUIObjectInfo, 'CheckpointLoaderSimple', 'ckpt_name').filter(name => /sam3/i.test(name))
                    : ['', ...sceneModelOptions(comfyUIObjectInfo, 'LoraLoader', 'lora_name')];
        return [...new Set([options[key] || '', ...values])].map(value => ({ value, label: value || 'None' }));
    };

    const lanInventory = (key: 'unet' | 'clip' | 'vae' | 'sampler' | 'scheduler' | 'loraName' | 'promptMode') => {
        const definitions = { unet: ['UNETLoader', 'unet_name'], clip: ['CLIPLoader', 'clip_name'], vae: ['VAELoader', 'vae_name'],
            sampler: ['LanPaint_KSampler', 'sampler_name'], scheduler: ['LanPaint_KSampler', 'scheduler'], loraName: ['LoraLoaderModelOnly', 'lora_name'], promptMode: ['LanPaint_KSampler', 'LanPaint_PromptMode'] };
        const [node, field] = definitions[key];
        const values = sceneModelOptions(comfyUIObjectInfo, node, field);
        if (key === 'unet') values.push(...sceneModelOptions(comfyUIObjectInfo, 'UnetLoaderGGUF', 'unet_name').filter(name => /flux.?2|klein/i.test(name)));
        if (key === 'loraName') values.unshift('');
        return [...new Set([lanOptions[key], ...values])].map(value => ({ value, label: value || 'None' }));
    };

    return <section className="mx-auto max-w-7xl bg-bg-secondary" aria-label="Swap a Person">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
            <h2 className="text-xl font-bold text-accent">Swap a Person</h2>
            <button type="button" className={button} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}>FLUX2 settings</button>
        </header>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
                <fieldset className="min-w-0"><legend className="mb-2 text-sm text-text-secondary">Workflow</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{([{ value: 'swap-anything', label: 'Swap Anything (SAM3)' }, { value: 'lanpaint', label: 'LanPaint (Head Swap)' }] as const).map(item => <label key={item.value} className={`${button} cursor-pointer ${mode === item.value ? '!border-accent !text-accent' : ''}`}><input type="radio" name="person-swap-workflow" value={item.value} checked={mode === item.value} disabled={locked} onChange={() => setMode(item.value)} />{item.label}</label>)}</div></fieldset>
                {!isLanPaint && <Select label="Person swap" value={activePreset} onChange={applyPreset} disabled={locked} choices={[...personSwapPresets.map(item => ({ value: item.id, label: item.label })), { value: 'custom', label: 'Custom' }]} />}
                <div className="grid gap-4 sm:grid-cols-2">
                    {(['destination', 'donor'] as const).map(side => {
                        const label = side === 'destination' ? 'Destination' : 'Donor';
                        const key = side === 'destination' ? 'destinationTarget' : 'donorTarget';
                        return <div key={side} className="min-w-0 space-y-3">
                            <ImageUploader id={`swap-person-${side}`} label={`Picture ${side === 'destination' ? 1 : 2} - ${label}`} sourceFile={images[side].file} onImageUpload={file => void perform('loading', () => loadImage(side, file))} disabled={locked} />
                            <button type="button" className={`${button} w-full`} onClick={() => setLibraryTarget(side)} disabled={locked}><LibraryIcon className="h-4 w-4 shrink-0" />{label} Library</button>
                            {!isLanPaint && <><Select label={`${label} person`} value={people[side]} onChange={value => changePerson(side, value)} disabled={locked} choices={[{ value: 'the woman', label: 'Woman' }, { value: 'the man', label: 'Man' }, { value: 'the person', label: 'Person' }]} />
                            <label className="block text-sm text-text-secondary">{side === 'destination' ? 'Area to replace' : 'Element to take'}<textarea className={input} rows={3} value={options[key]} onChange={event => updateOption(key, event.target.value)} disabled={locked} /></label></>}
                        </div>;
                    })}
                </div>
                {isLanPaint ? <>
                    <NumberSlider label={`Reference resolution: ${lanOptions.megapixels} MP (Lanczos)`} value={lanOptions.megapixels} min={0.25} max={4} step={0.25} onChange={event => updateLanOption('megapixels', Number(event.target.value))} disabled={locked} allowDirectInput />
                    <label className="block text-sm text-text-secondary">LanPaint prompt<textarea className={input} rows={10} value={lanOptions.prompt} onChange={event => updateLanOption('prompt', event.target.value)} disabled={locked} /></label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={!!lanOptions.preserveDestinationStyle} onChange={event => updateLanOption('preserveDestinationStyle', event.target.checked)} disabled={locked} />Preserve destination style</label>
                    {comfyUIObjectInfo && !comfyUIObjectInfo.LanPaint_KSampler && <p role="status" className="text-sm text-warning">LanPaint_KSampler unavailable. Install LanPaint in ComfyUI, restart and reconnect.</p>}
                </> : <>
                <label className="block text-sm text-text-secondary">Optional editing instructions<textarea className={input} rows={3} value={options.prompt || ''} onChange={event => updateOption('prompt', event.target.value)} disabled={locked} /></label>
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={preserveStyle} onChange={event => setPreserveStyle(event.target.checked)} disabled={locked} />Reinforce destination style</label>
                <NumberSlider label={`Mask margin: ${options.maskGrow} px`} value={options.maskGrow} min={0} max={128} step={1} onChange={event => updateOption('maskGrow', Number(event.target.value))} disabled={locked} allowDirectInput />
                </>}
                {advanced && isLanPaint && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <button type="button" className={`${button} sm:col-span-2`} disabled={locked} onClick={() => setLanOptions(defaultLanPaintPersonOptions())}><RefreshIcon className="h-4 w-4" />Restore LanPaint workflow</button>
                    {(['unet', 'clip', 'vae', 'loraName', 'sampler', 'scheduler', 'promptMode'] as const).map(key => <Select key={key} label={{ unet: 'FLUX2 model', clip: 'CLIP', vae: 'VAE', loraName: 'Head swap LoRA', sampler: 'Sampler', scheduler: 'Scheduler', promptMode: 'LanPaint prompt mode' }[key]} value={lanOptions[key]} choices={lanInventory(key)} onChange={value => updateLanOption(key, value)} disabled={locked} />)}
                    {([{ key: 'steps', label: 'Steps', min: 1, max: 100, step: 1 }, { key: 'cfg', label: 'CFG', min: 0, max: 20, step: 0.1 }, { key: 'guidance', label: 'Flux guidance', min: 0, max: 20, step: 0.1 }, { key: 'denoise', label: 'Denoise', min: 0, max: 1, step: 0.05 }, { key: 'lanPaintSteps', label: 'LanPaint steps', min: 1, max: 100, step: 1 }, { key: 'loraStrength', label: 'LoRA strength', min: 0, max: 2, step: 0.05 }] as const).map(setting => <NumberSlider key={setting.key} label={`${setting.label}: ${lanOptions[setting.key]}`} value={lanOptions[setting.key]} min={setting.min} max={setting.max} step={setting.step} onChange={event => updateLanOption(setting.key, Number(event.target.value))} disabled={locked} allowDirectInput />)}
                    <label className="text-sm text-text-secondary">Seed (-1 = random)<input type="number" min={-1} step={1} className={input} value={lanOptions.seed} onChange={event => updateLanOption('seed', Number(event.target.value))} disabled={locked} /></label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={lanOptions.cacheEnabled} onChange={event => updateLanOption('cacheEnabled', event.target.checked)} disabled={locked} />CacheDiT</label>
                </div>}
                {advanced && !isLanPaint && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <button type="button" className={`${button} sm:col-span-2`} disabled={locked} onClick={() => { setOptions(current => ({ ...defaultSwapAnythingOptions(), destinationTarget: current.destinationTarget, donorTarget: current.donorTarget, prompt: current.prompt })); setPreserveStyle(false); }}><RefreshIcon className="h-4 w-4" />Swap Anything defaults</button>
                    {(['unet', 'clip', 'vae', 'sampler', 'samCheckpoint', 'lora1Name', 'lora2Name'] as const).map(key => <Select key={key} label={{ unet: 'FLUX2 model', clip: 'CLIP', vae: 'VAE', sampler: 'Sampler', samCheckpoint: 'SAM3 checkpoint', lora1Name: 'LoRA 1', lora2Name: 'LoRA 2' }[key]} value={options[key] || ''} choices={inventory(key)} onChange={value => updateOption(key, value)} disabled={locked} />)}
                    {([{ key: 'steps', label: 'Steps', min: 1, max: 40, step: 1 }, { key: 'cfg', label: 'CFG', min: 0.1, max: 10, step: 0.1 }, { key: 'megapixels', label: 'Destination MP', min: 0.25, max: 4, step: 0.25 }, { key: 'donorMegapixels', label: 'Donor MP', min: 0.25, max: 4, step: 0.25 }, { key: 'samThreshold', label: 'SAM threshold', min: 0.05, max: 1, step: 0.05 }, { key: 'samRefineIterations', label: 'SAM refinement', min: 0, max: 10, step: 1 }, { key: 'lora1Strength', label: 'LoRA 1 strength', min: 0, max: 2, step: 0.05 }, { key: 'lora2Strength', label: 'LoRA 2 strength', min: 0, max: 2, step: 0.05 }] as const).map(setting => <NumberSlider key={setting.key} label={`${setting.label}: ${options[setting.key]}`} value={options[setting.key]} min={setting.min} max={setting.max} step={setting.step} onChange={event => updateOption(setting.key, Number(event.target.value))} disabled={locked} allowDirectInput />)}
                    <label className="text-sm text-text-secondary">Seed (-1 = random)<input type="number" min={-1} step={1} className={input} value={options.seed} onChange={event => updateOption('seed', Number(event.target.value))} disabled={locked} /></label>
                </div>}
                {!isComfyUIConnected && <p className="text-sm text-warning">ComfyUI disconnected.</p>}
                {error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-danger">{error}</p>}
                {busy && <div role="status" className="space-y-2 text-sm text-text-secondary"><span>{message || busy}</span><progress className="w-full" value={progress} max={1} /></div>}
                <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={locked} onClick={reset}><RefreshIcon className="h-4 w-4" />Reset</button><button type="button" className={`${button} flex-1 !bg-accent !text-accent-text`} disabled={!canGenerate} onClick={() => void generate()}>{busy === 'generating' ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}Swap person</button></div>
            </div>
            <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-semibold text-text-secondary">Result{result ? ` - ${result.mode === 'lanpaint' ? 'LanPaint' : 'Swap Anything'}` : ''}</h3>
                <div className="flex min-h-80 items-center justify-center bg-bg-primary">{result ? <img src={showSource ? result.source : result.src} alt={showSource ? 'Original destination' : 'Person swap result'} className="max-h-[75vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">No result</span>}</div>
                {result && <>
                    <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={showSource} onChange={event => setShowSource(event.target.checked)} />Show original destination</label>
                    <div className="flex flex-wrap gap-2"><a href={result.src} download={`swap-person-${result.seed}.png`} className={button}><DownloadIcon className="h-4 w-4" />Download</a><button type="button" className={button} disabled={locked || saved} onClick={() => void save()}>{saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved ? 'Saved' : 'Save to Library'}</button></div>
                    <details className="text-sm text-text-muted"><summary>Prompt / seed {result.seed}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{result.prompt}</pre></details>
                </>}
            </div>
        </div>
        <LibraryPickerModal isOpen={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelectItem={selectLibrary} filter={imageTypes} />
    </section>;
};

export default SwapPersonPanel;