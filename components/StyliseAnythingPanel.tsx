import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import type { GenerationOptions, LibraryItem, LibraryItemType } from '../types';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { generateStyliseAnythingImage } from '../services/styliseAnythingService';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { NumberSlider, SelectInput, TextInput } from './InputComponents';
import { CheckIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon, SwatchIcon } from './icons';
import { PHOTOGRAPHIC_ERAS, PHOTOGRAPHIC_PRESETS, type PhotographicPreset } from './styliseAnything/photographicPresets';

interface StyliseAnythingPanelProps {
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
}

const LIBRARY_IMAGE_TYPES: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'hair', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'];
const DEFAULT_PRESET = PHOTOGRAPHIC_PRESETS[0];
const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : [];
const withCurrent = (current: string, values: string[]) => Array.from(new Set([current, ...values].filter(Boolean))).map(value => ({ value, label: value }));

const StyliseAnythingPanel: React.FC<StyliseAnythingPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const generationOptions = useSelector((state: RootState) => state.generation.options);
    const [sourceImage, setSourceImage] = useState<File | null>(null);
    const [selectedEra, setSelectedEra] = useState(DEFAULT_PRESET.era);
    const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);
    const [preset, setPreset] = useState<PhotographicPreset>({ ...DEFAULT_PRESET });
    const [additionalInstructions, setAdditionalInstructions] = useState('');
    const [preserveComposition, setPreserveComposition] = useState(true);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [advanced, setAdvanced] = useState<Partial<GenerationOptions>>({
        comfyFlux2EditUnet: generationOptions.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf',
        comfyFlux2EditClip: generationOptions.comfyFlux2EditClip || 'qwen_3_4b.safetensors',
        comfyFlux2EditVae: generationOptions.comfyFlux2EditVae || 'flux2-vae.safetensors',
        comfyFlux2EditSampler: generationOptions.comfyFlux2EditSampler || 'euler',
        comfyFlux2EditMegapixels: generationOptions.comfyFlux2EditMegapixels ?? 1,
        comfyFlux2EditSteps: generationOptions.comfyFlux2EditSteps ?? 4,
        comfyFlux2EditCfg: generationOptions.comfyFlux2EditCfg ?? 1,
        comfySeed: undefined,
    });
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const eraPresets = useMemo(() => PHOTOGRAPHIC_PRESETS.filter(item => item.era === selectedEra), [selectedEra]);
    const models = getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name);
    const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
    const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
    const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    const missingNodes = !comfyUIObjectInfo ? [] : ['UnetLoaderGGUF', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'].filter(node => !comfyUIObjectInfo[node]);

    const applyPreset = (nextPreset: PhotographicPreset) => {
        setSelectedPresetId(nextPreset.id);
        setSelectedEra(nextPreset.era);
        setPreset({ ...nextPreset });
        setResult(null);
        setSaveStatus('idle');
    };
    const updatePreset = <K extends keyof PhotographicPreset>(key: K, value: PhotographicPreset[K]) => setPreset(current => ({ ...current, [key]: value }));
    const updateAdvanced = <K extends keyof GenerationOptions>(key: K, value: GenerationOptions[K]) => setAdvanced(current => ({ ...current, [key]: value }));
    const handleEraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const era = event.target.value;
        const firstPreset = PHOTOGRAPHIC_PRESETS.find(item => item.era === era);
        if (firstPreset) applyPreset(firstPreset);
    };
    const randomizePreset = () => {
        const alternatives = eraPresets.filter(item => item.id !== selectedPresetId);
        applyPreset(alternatives[Math.floor(Math.random() * alternatives.length)] || eraPresets[0]);
    };
    const selectLibraryImage = async (item: LibraryItem) => {
        const response = await fetch(item.media);
        if (!response.ok) throw new Error(`Unable to load Library image (${response.status}).`);
        const blob = await response.blob();
        setSourceImage(new File([blob], `stylise-${item.name || item.id}.png`, { type: blob.type || 'image/png' }));
        setResult(null);
    };
    const generate = async () => {
        if (!sourceImage) return;
        setIsGenerating(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setProgress(0);
        try {
            const generated = await generateStyliseAnythingImage(sourceImage, preset, additionalInstructions, preserveComposition, {
                ...generationOptions,
                ...advanced,
                comfySeed: advanced.comfySeed === undefined || Number(advanced.comfySeed) < 0 ? Math.floor(Math.random() * 1e15) : Number(advanced.comfySeed),
            }, (message, value) => {
                setProgressMessage(message);
                setProgress(value);
            });
            setResult(generated);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'Stylise Anything generation failed.');
        } finally {
            setIsGenerating(false);
        }
    };
    const reset = () => {
        setSourceImage(null);
        applyPreset(DEFAULT_PRESET);
        setAdditionalInstructions('');
        setPreserveComposition(true);
        setResult(null);
        setError(null);
        setSaveStatus('idle');
    };
    const saveResult = async () => {
        if (!result || !sourceImage) return;
        setSaveStatus('saving');
        try {
            await dispatch(addToLibrary({
                mediaType: 'image',
                name: `Stylise Anything - ${preset.name}`,
                media: result,
                thumbnail: await dataUrlToThumbnail(result, 256),
                sourceImage: await fileToDataUrl(sourceImage),
            })).unwrap();
            setSaveStatus('saved');
        } catch (saveError) {
            setSaveStatus('idle');
            setError(saveError instanceof Error ? saveError.message : 'Could not save the result.');
        }
    };

    const canGenerate = isComfyUIConnected && missingNodes.length === 0 && !!sourceImage && !!preset.photoType.trim() && !!preset.cameraType.trim() && !!preset.filmOrMedia.trim() && !!preset.visualStyle.trim() && !isGenerating;

    return <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
            <div><h2 className="flex items-center gap-2 text-xl font-bold text-accent"><SwatchIcon className="h-5 w-5" />Stylise Anything</h2><p className="text-xs text-text-muted">Apply an editable period photographic treatment to any source image with FLUX2.</p></div>
            <div className="flex items-center gap-2"><span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs font-bold text-accent">FLUX2</span><button type="button" onClick={() => setAdvancedOpen(open => !open)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${advancedOpen ? 'border-accent text-accent' : 'border-border-primary text-text-secondary'}`}>Advanced</button></div>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-5">
                <div className="space-y-2"><ImageUploader id="stylise-anything-source" label="Source Image" sourceFile={sourceImage} onImageUpload={(file) => { setSourceImage(file); setResult(null); }} disabled={isGenerating} /><button type="button" onClick={() => setLibraryOpen(true)} disabled={isGenerating} className="flex w-full items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm font-semibold text-text-secondary hover:border-accent hover:text-accent"><LibraryIcon className="h-4 w-4" />Choose from Library</button></div>

                <div className="grid gap-3 sm:grid-cols-[0.35fr_0.65fr_auto]">
                    <SelectInput label="Era" value={selectedEra} onChange={handleEraChange} options={PHOTOGRAPHIC_ERAS.map(era => ({ value: era, label: era }))} disabled={isGenerating} />
                    <SelectInput label="Photographic preset" value={String(selectedPresetId)} onChange={(event) => { const selected = PHOTOGRAPHIC_PRESETS.find(item => item.id === Number(event.target.value)); if (selected) applyPreset(selected); }} options={eraPresets.map(item => ({ value: String(item.id), label: item.name }))} disabled={isGenerating} />
                    <button type="button" onClick={randomizePreset} disabled={isGenerating} title="Random preset from this era" aria-label="Random preset from this era" className="mt-6 self-start rounded-md border border-border-primary bg-bg-tertiary p-2.5 text-text-secondary hover:border-accent hover:text-accent"><DiceIcon className="h-4 w-4" /></button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput label="Preset name" value={preset.name} onChange={(event) => updatePreset('name', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Photo type" value={preset.photoType} onChange={(event) => updatePreset('photoType', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Camera type" value={preset.cameraType} onChange={(event) => updatePreset('cameraType', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Film or media" value={preset.filmOrMedia} onChange={(event) => updatePreset('filmOrMedia', event.target.value)} disabled={isGenerating} />
                </div>
                <TextInput label="Visual style" value={preset.visualStyle} onChange={(event) => updatePreset('visualStyle', event.target.value)} disabled={isGenerating} isTextArea />
                <TextInput label="Additional instructions" value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} disabled={isGenerating} isTextArea />
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${preserveComposition ? 'border-accent bg-accent/10' : 'border-border-primary bg-bg-tertiary'}`}><input type="checkbox" checked={preserveComposition} onChange={(event) => setPreserveComposition(event.target.checked)} disabled={isGenerating} className="rounded text-accent focus:ring-accent" /><span><span className="block text-sm font-bold text-text-primary">Preserve source composition</span><span className="block text-xs text-text-muted">Keep subjects, objects, pose, crop, viewpoint, and layout unchanged.</span></span></label>

                {advancedOpen && <div className="space-y-4 border-t border-border-primary pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <SelectInput label="FLUX2 Model" value={advanced.comfyFlux2EditUnet || ''} onChange={(event) => updateAdvanced('comfyFlux2EditUnet', event.target.value)} options={withCurrent(advanced.comfyFlux2EditUnet || '', models)} disabled={isGenerating} />
                        <SelectInput label="CLIP" value={advanced.comfyFlux2EditClip || ''} onChange={(event) => updateAdvanced('comfyFlux2EditClip', event.target.value)} options={withCurrent(advanced.comfyFlux2EditClip || '', clips)} disabled={isGenerating} />
                        <SelectInput label="VAE" value={advanced.comfyFlux2EditVae || ''} onChange={(event) => updateAdvanced('comfyFlux2EditVae', event.target.value)} options={withCurrent(advanced.comfyFlux2EditVae || '', vaes)} disabled={isGenerating} />
                        <SelectInput label="Sampler" value={advanced.comfyFlux2EditSampler || 'euler'} onChange={(event) => updateAdvanced('comfyFlux2EditSampler', event.target.value)} options={withCurrent(advanced.comfyFlux2EditSampler || 'euler', samplers)} disabled={isGenerating} />
                        <NumberSlider label={`Source MP: ${advanced.comfyFlux2EditMegapixels ?? 1}`} value={advanced.comfyFlux2EditMegapixels ?? 1} onChange={(event) => updateAdvanced('comfyFlux2EditMegapixels', Number(event.target.value))} min={0.25} max={4} step={0.25} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`Steps: ${advanced.comfyFlux2EditSteps ?? 4}`} value={advanced.comfyFlux2EditSteps ?? 4} onChange={(event) => updateAdvanced('comfyFlux2EditSteps', Number(event.target.value))} min={1} max={40} step={1} disabled={isGenerating} allowDirectInput />
                        <NumberSlider label={`CFG: ${advanced.comfyFlux2EditCfg ?? 1}`} value={advanced.comfyFlux2EditCfg ?? 1} onChange={(event) => updateAdvanced('comfyFlux2EditCfg', Number(event.target.value))} min={0.1} max={10} step={0.1} disabled={isGenerating} allowDirectInput />
                        <label className="block text-sm font-medium text-text-secondary">Seed (-1 = random)<input type="number" value={advanced.comfySeed ?? -1} onChange={(event) => updateAdvanced('comfySeed', Number(event.target.value))} disabled={isGenerating} className="mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2" /></label>
                    </div>
                </div>}

                {!isComfyUIConnected && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use Stylise Anything.</p>}
                {missingNodes.length > 0 && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
                {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                <div className="flex gap-3"><button type="button" onClick={reset} disabled={isGenerating} className="flex items-center gap-2 rounded-md border border-border-primary px-4 py-3 font-semibold text-text-secondary"><RefreshIcon className="h-5 w-5" />Reset</button><button type="button" onClick={generate} disabled={!canGenerate} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 font-bold text-accent-text disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Stylising...' : 'Stylise Image'}</button></div>
            </div>

            <div className="flex min-h-[560px] flex-col"><h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Result</h3><div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{result ? <img src={result} alt={`${preset.name} result`} className="max-h-[75vh] max-w-full object-contain" /> : <span className="px-6 text-center text-sm text-text-muted">Choose a source image and photographic preset.</span>}</div>{result && <div className="mt-3 grid grid-cols-2 gap-2"><a href={result} download={`stylise-anything-${preset.id}.png`} className="flex items-center justify-center gap-2 rounded-md border border-border-primary py-2 text-sm font-semibold text-text-secondary"><DownloadIcon className="h-4 w-4" />Download</a><button type="button" onClick={saveResult} disabled={saveStatus !== 'idle'} className="flex items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-bold text-accent-text disabled:opacity-60">{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</button></div>}</div>
        </div>
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={selectLibraryImage} filter={LIBRARY_IMAGE_TYPES} />
    </section>;
};

export default StyliseAnythingPanel;
