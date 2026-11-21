import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LibraryItemType } from '../types';
import { addToLibrary } from '../store/librarySlice';
import { buildQuickSwapPersonPrompt, buildLanPaintPersonPrompt, defaultQuickSwapPersonOptions, defaultLanPaintPersonOptions, personSwapPresets, personSwapTargets, type LanPaintPersonOptions } from '../services/swapPersonWorkflow';
import { defaultSwapAnythingOptions, type SwapAnythingOptions } from '../services/swapAnythingWorkflow';
import { generateComfyUISwapAnything, generateComfyUILanPaintPerson } from '../services/comfyUIService';
import { sceneModelOptions } from '../services/sceneVariationService';
import { familyFiles, flux2Family } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { CheckIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon } from './icons';
import { Accordion } from './ui/Accordion';
import { Button, ModelFields, NumberField, SamplerFields, SeedField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { SettingsLayout } from './ui/SettingsLayout';
import { ui } from './ui/styles';

type Side = 'destination' | 'donor';
interface PersonImage { file: File | null; preview: string }
type SwapMode = 'swap-anything' | 'lanpaint';
type Result = { src: string; prompt: string; seed: number; source: string; target: string } & (
    { mode: 'swap-anything'; settings: SwapAnythingOptions } | { mode: 'lanpaint'; settings: LanPaintPersonOptions }
);
interface Props { isComfyUIConnected: boolean; comfyUIObjectInfo: any | null }
const NAME = 'Swap a Person';
const emptyImage = (): PersonImage => ({ file: null, preview: '' });
const imageTypes: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'past-forward-photo', 'group-fusion', 'swap-anything'];
const sides: Side[] = ['destination', 'donor'];
const noneFirst = (values: string[]) => [{ value: '', label: 'None' }, ...values.map(value => ({ value, label: value }))];
const check = 'flex items-center gap-2 text-sm text-text-secondary';

const SwapPersonPanel: React.FC<Props> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherBusy = useSelector((state: RootState) => state.generation.isLoading);
    const [images, setImages] = useState<Record<Side, PersonImage>>({ destination: emptyImage(), donor: emptyImage() });
    const [options, setOptions] = useState(defaultQuickSwapPersonOptions);
    const { inventory } = useModelInventory();
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

    const catalog = (node: string, field: string) => sceneModelOptions(comfyUIObjectInfo, node, field);
    const flux2Models = familyFiles([...new Set([...catalog('UNETLoader', 'unet_name'), ...catalog('UnetLoaderGGUF', 'unet_name').filter(name => /flux.?2|klein/i.test(name))])], 'flux2', inventory);
    const clips = catalog('CLIPLoader', 'clip_name'), vaes = catalog('VAELoader', 'vae_name');
    // The workflows use -1 for "new seed for every run".
    const seedField = (seed: number, change: (seed: number) => void) =>
        <SeedField name={NAME} value={Math.max(seed, 0)} onChange={change} randomize={seed === -1} onRandomizeChange={random => change(random ? -1 : 0)} disabled={locked} />;
    const strength = { min: 0, max: 2, step: 0.05 };

    const swapSections = {
        models: () => <ModelFields name={NAME} disabled={locked} onChange={(id, value) => updateOption(id as 'unet' | 'clip' | 'vae' | 'samCheckpoint', value)} fields={[
            { id: 'unet', label: 'FLUX2 model', value: options.unet || '', choices: flux2Models },
            { id: 'clip', label: 'CLIP', value: options.clip || '', choices: clips },
            { id: 'vae', label: 'VAE', value: options.vae || '', choices: vaes },
            { id: 'samCheckpoint', label: 'SAM3 checkpoint', value: options.samCheckpoint || '', choices: catalog('CheckpointLoaderSimple', 'ckpt_name').filter(name => /sam3/i.test(name)) },
        ]} />,
        loras: () => ([1, 2] as const).map(index => <div key={index} className="space-y-2">
            <Select variant="search" label={`LoRA ${index}`} ariaLabel={`${NAME} LoRA ${index}`} value={options[`lora${index}Name`] || ''} options={noneFirst(familyFiles(catalog('LoraLoader', 'lora_name'), flux2Family(options.unet), inventory))} disabled={locked} onChange={value => updateOption(`lora${index}Name`, value)} />
            <NumberField slider label={`LoRA ${index} strength`} ariaLabel={`${NAME} LoRA ${index} strength`} value={options[`lora${index}Strength`]} {...strength} disabled={locked} onChange={value => updateOption(`lora${index}Strength`, value)} />
        </div>),
        sampler: () => <>
            <SamplerFields name={NAME} disabled={locked} value={{ sampler: options.sampler, steps: options.steps, cfg: options.cfg }} samplers={catalog('KSamplerSelect', 'sampler_name')}
                limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }} onChange={patch => setOptions(current => ({ ...current, ...patch }))} />
            {seedField(options.seed, seed => updateOption('seed', seed))}
        </>,
        advanced: () => <>
            <NumberField slider label="Destination MP" ariaLabel={`${NAME} Destination MP`} value={options.megapixels} min={0.25} max={4} step={0.25} disabled={locked} onChange={value => updateOption('megapixels', value)} />
            <NumberField slider label="Donor MP" ariaLabel={`${NAME} Donor MP`} value={options.donorMegapixels} min={0.25} max={4} step={0.25} disabled={locked} onChange={value => updateOption('donorMegapixels', value)} />
            <NumberField slider label="SAM threshold" ariaLabel={`${NAME} SAM threshold`} value={options.samThreshold} min={0.05} max={1} step={0.05} disabled={locked} onChange={value => updateOption('samThreshold', value)} />
            <NumberField slider label="SAM refinement" ariaLabel={`${NAME} SAM refinement`} value={options.samRefineIterations} min={0} max={10} step={1} disabled={locked} onChange={value => updateOption('samRefineIterations', value)} />
            <Button className="w-full" disabled={locked} onClick={() => { setOptions(current => ({ ...defaultSwapAnythingOptions(), destinationTarget: current.destinationTarget, donorTarget: current.donorTarget, prompt: current.prompt })); setPreserveStyle(false); }}><RefreshIcon className="h-4 w-4" />Swap Anything defaults</Button>
        </>,
    };
    const lanSections = {
        models: () => <ModelFields name={NAME} disabled={locked} onChange={(id, value) => updateLanOption(id as 'unet' | 'clip' | 'vae', value)} fields={[
            { id: 'unet', label: 'FLUX2 model', value: lanOptions.unet, choices: flux2Models },
            { id: 'clip', label: 'CLIP', value: lanOptions.clip, choices: clips },
            { id: 'vae', label: 'VAE', value: lanOptions.vae, choices: vaes },
        ]} />,
        loras: () => <div className="space-y-2">
            <Select variant="search" label="Head swap LoRA" ariaLabel={`${NAME} Head swap LoRA`} value={lanOptions.loraName} options={noneFirst(familyFiles(catalog('LoraLoaderModelOnly', 'lora_name'), flux2Family(lanOptions.unet), inventory))} disabled={locked} onChange={value => updateLanOption('loraName', value)} />
            <NumberField slider label="LoRA strength" ariaLabel={`${NAME} LoRA strength`} value={lanOptions.loraStrength} {...strength} disabled={locked} onChange={value => updateLanOption('loraStrength', value)} />
        </div>,
        sampler: () => <>
            <SamplerFields name={NAME} disabled={locked} value={{ sampler: lanOptions.sampler, scheduler: lanOptions.scheduler, steps: lanOptions.steps, cfg: lanOptions.cfg, denoise: lanOptions.denoise }}
                samplers={catalog('LanPaint_KSampler', 'sampler_name')} schedulers={catalog('LanPaint_KSampler', 'scheduler')}
                limits={{ steps: { min: 1, max: 100, step: 1 }, cfg: { min: 0, max: 20, step: 0.1 }, denoise: { min: 0, max: 1, step: 0.05 } }} onChange={patch => setLanOptions(current => ({ ...current, ...patch }))} />
            <NumberField slider label="Flux guidance" ariaLabel={`${NAME} Flux guidance`} value={lanOptions.guidance} min={0} max={20} step={0.1} disabled={locked} onChange={value => updateLanOption('guidance', value)} />
            <NumberField slider label="LanPaint steps" ariaLabel={`${NAME} LanPaint steps`} value={lanOptions.lanPaintSteps} min={1} max={100} step={1} disabled={locked} onChange={value => updateLanOption('lanPaintSteps', value)} />
            <Select label="LanPaint prompt mode" ariaLabel={`${NAME} LanPaint prompt mode`} value={lanOptions.promptMode} options={catalog('LanPaint_KSampler', 'LanPaint_PromptMode')} disabled={locked} onChange={value => updateLanOption('promptMode', value)} />
            {seedField(lanOptions.seed, seed => updateLanOption('seed', seed))}
        </>,
        advanced: () => <>
            <label className={check}><input type="checkbox" checked={lanOptions.cacheEnabled} onChange={event => updateLanOption('cacheEnabled', event.target.checked)} disabled={locked} />CacheDiT</label>
            <Button className="w-full" disabled={locked} onClick={() => setLanOptions(defaultLanPaintPersonOptions())}><RefreshIcon className="h-4 w-4" />Restore LanPaint workflow</Button>
        </>,
    };
    const sections = isLanPaint ? lanSections : swapSections;

    return <section className="mx-auto max-w-7xl bg-bg-secondary" aria-label={NAME}>
        <header className="border-b border-border-primary px-5 py-4"><h2 className="text-xl font-bold text-accent">{NAME}</h2></header>
        <div className="p-5">
            <SettingsLayout label={NAME} disabled={locked} {...sections} top={<>
                <fieldset className="min-w-0"><legend className="mb-2 text-sm text-text-secondary">Workflow</legend><div className="grid grid-cols-1 gap-2">{([{ value: 'swap-anything', label: 'Swap Anything (SAM3)' }, { value: 'lanpaint', label: 'LanPaint (Head Swap)' }] as const).map(item => <label key={item.value} className={`${ui.buttons.secondary} cursor-pointer ${mode === item.value ? '!border-accent !text-accent' : ''}`}><input type="radio" name="person-swap-workflow" value={item.value} checked={mode === item.value} disabled={locked} onChange={() => setMode(item.value)} />{item.label}</label>)}</div></fieldset>
                {sides.map(side => {
                    const label = side === 'destination' ? 'Destination' : 'Donor';
                    return <div key={side} className="min-w-0 space-y-2">
                        <ImageUploader id={`swap-person-${side}`} label={`Picture ${side === 'destination' ? 1 : 2} - ${label}`} sourceFile={images[side].file} onImageUpload={file => void perform('loading', () => loadImage(side, file))} disabled={locked} />
                        <Button className="w-full" onClick={() => setLibraryTarget(side)} disabled={locked}><LibraryIcon className="h-4 w-4 shrink-0" />{label} Library</Button>
                    </div>;
                })}
                {isLanPaint
                    ? <NumberField slider label="Reference resolution (MP, Lanczos)" ariaLabel={`${NAME} Reference resolution`} value={lanOptions.megapixels} min={0.25} max={4} step={0.25} onChange={value => updateLanOption('megapixels', value)} disabled={locked} />
                    : <NumberField slider label="Mask margin (px)" ariaLabel={`${NAME} Mask margin`} value={options.maskGrow} min={0} max={128} step={1} onChange={value => updateOption('maskGrow', value)} disabled={locked} />}
            </>}>
                {isLanPaint ? <>
                    <PromptBox label="LanPaint prompt" ariaLabel={`${NAME} LanPaint prompt`} rows={10} value={lanOptions.prompt} onChange={value => updateLanOption('prompt', value)} disabled={locked} />
                    <label className={check}><input type="checkbox" checked={!!lanOptions.preserveDestinationStyle} onChange={event => updateLanOption('preserveDestinationStyle', event.target.checked)} disabled={locked} />Preserve destination style</label>
                    {comfyUIObjectInfo && !comfyUIObjectInfo.LanPaint_KSampler && <p role="status" className="text-sm text-warning">LanPaint_KSampler unavailable. Install LanPaint in ComfyUI, restart and reconnect.</p>}
                </> : <>
                    <Select label="Person swap" ariaLabel={`${NAME} Person swap`} value={activePreset} onChange={applyPreset} disabled={locked} options={[...personSwapPresets.map(item => ({ value: item.id, label: item.label })), { value: 'custom', label: 'Custom' }]} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        {sides.map(side => {
                            const label = side === 'destination' ? 'Destination' : 'Donor', key = side === 'destination' ? 'destinationTarget' : 'donorTarget';
                            const target = side === 'destination' ? 'Area to replace' : 'Element to take';
                            return <div key={side} className="min-w-0 space-y-3">
                                <Select label={`${label} person`} ariaLabel={`${NAME} ${label} person`} value={people[side]} onChange={value => changePerson(side, value)} disabled={locked} options={[{ value: 'the woman', label: 'Woman' }, { value: 'the man', label: 'Man' }, { value: 'the person', label: 'Person' }]} />
                                <PromptBox kind="neutral" label={target} ariaLabel={`${NAME} ${target}`} rows={3} value={options[key]} onChange={value => updateOption(key, value)} disabled={locked} />
                            </div>;
                        })}
                    </div>
                    <PromptBox kind="instruction" label="Optional editing instructions" ariaLabel={`${NAME} Optional editing instructions`} rows={3} value={options.prompt || ''} onChange={value => updateOption('prompt', value)} disabled={locked} />
                    <label className={check}><input type="checkbox" checked={preserveStyle} onChange={event => setPreserveStyle(event.target.checked)} disabled={locked} />Reinforce destination style</label>
                </>}
                {!isComfyUIConnected && <p className="text-sm text-warning">ComfyUI disconnected.</p>}
                {error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-danger">{error}</p>}
                {busy && <div role="status" className="space-y-2 text-sm text-text-secondary"><span>{message || busy}</span><progress className="w-full" value={progress} max={1} /></div>}
                <div className="flex flex-wrap gap-3">
                    <Button disabled={locked} onClick={reset}><RefreshIcon className="h-4 w-4" />Reset</Button>
                    <Button variant="primary" className="flex-1" disabled={!canGenerate} onClick={() => void generate()}>{busy === 'generating' ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}Swap person</Button>
                </div>
                <h3 className="text-sm font-semibold text-text-secondary">Result{result ? ` - ${result.mode === 'lanpaint' ? 'LanPaint' : 'Swap Anything'}` : ''}</h3>
                <div className="flex min-h-80 items-center justify-center bg-bg-primary">{result ? <img src={showSource ? result.source : result.src} alt={showSource ? 'Original destination' : 'Person swap result'} className="max-h-[75vh] max-w-full object-contain" /> : <span className="text-sm text-text-muted">No result</span>}</div>
                {result && <>
                    <label className={check}><input type="checkbox" checked={showSource} onChange={event => setShowSource(event.target.checked)} />Show original destination</label>
                    <div className="flex flex-wrap gap-2">
                        <a href={result.src} download={`swap-person-${result.seed}.png`} className={ui.buttons.secondary}><DownloadIcon className="h-4 w-4" />Download</a>
                        <Button disabled={locked || saved} onClick={() => void save()}>{saved ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saved ? 'Saved' : 'Save to Library'}</Button>
                    </div>
                    <Accordion title={`Prompt / seed ${result.seed}`}><PromptBox kind="readonly" label="Prompt" ariaLabel={`${NAME} result prompt`} rows={8} value={result.prompt} copyable /></Accordion>
                </>}
            </SettingsLayout>
        </div>
        <LibraryPickerModal isOpen={libraryTarget !== null} onClose={() => setLibraryTarget(null)} onSelectItem={selectLibrary} filter={imageTypes} />
    </section>;
};

export default SwapPersonPanel;
