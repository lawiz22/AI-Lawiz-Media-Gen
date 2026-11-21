import React, { useMemo, useState } from 'react';
import { useDispatch, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import { addToLibrary } from '../store/librarySlice';
import type { GenerationOptions, LibraryItem, LibraryItemType } from '../types';
import { dataUrlToThumbnail, fileToDataUrl } from '../utils/imageUtils';
import { generateStyliseAnythingImage } from '../services/styliseAnythingService';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { TextInput } from './InputComponents';
import { CheckIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon, SwatchIcon } from './icons';
import { PHOTOGRAPHIC_ERAS, PHOTOGRAPHIC_PRESETS, type PhotographicPreset } from './styliseAnything/photographicPresets';
import { Button, ModelFields, NumberField, SamplerFields, SeedField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { familyFiles } from '../services/styleLibrary';
import { useModelInventory } from './useModelInventory';
import { SettingsLayout } from './ui/SettingsLayout';
import { ui } from './ui/styles';

interface StyliseAnythingPanelProps {
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
}

const LIBRARY_IMAGE_TYPES: LibraryItemType[] = ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'hair', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'];
const DEFAULT_PRESET = PHOTOGRAPHIC_PRESETS[0];
const getOptions = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : Array.isArray(input?.[1]?.options) ? input[1].options : [];
const NAME = 'Stylise Anything';

const StyliseAnythingPanel: React.FC<StyliseAnythingPanelProps> = ({ isComfyUIConnected, comfyUIObjectInfo }) => {
    const dispatch: AppDispatch = useDispatch();
    const { inventory } = useModelInventory();
    const store = useStore<RootState>();
    const generationOptions = store.getState().generation.options;
    const [sourceImage, setSourceImage] = useState<File | null>(null);
    const [selectedEra, setSelectedEra] = useState(DEFAULT_PRESET.era);
    const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET.id);
    const [preset, setPreset] = useState<PhotographicPreset>({ ...DEFAULT_PRESET });
    const [additionalInstructions, setAdditionalInstructions] = useState('');
    const [preserveComposition, setPreserveComposition] = useState(true);
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
    const models = useMemo(() => Array.from(new Set([
        ...getOptions(comfyUIObjectInfo?.UnetLoaderGGUF?.input?.required?.unet_name).filter(model => /flux[-_ ]?2|klein/i.test(model)),
        ...getOptions(comfyUIObjectInfo?.UNETLoader?.input?.required?.unet_name),
    ])), [comfyUIObjectInfo]);
    const clips = getOptions(comfyUIObjectInfo?.CLIPLoader?.input?.required?.clip_name);
    const vaes = getOptions(comfyUIObjectInfo?.VAELoader?.input?.required?.vae_name);
    const samplers = getOptions(comfyUIObjectInfo?.KSamplerSelect?.input?.required?.sampler_name);
    const selectedModelLoader = (advanced.comfyFlux2EditUnet || '').toLowerCase().endsWith('.gguf') ? 'UnetLoaderGGUF' : 'UNETLoader';
    const missingNodes = !comfyUIObjectInfo ? [] : [selectedModelLoader, 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage'].filter(node => !comfyUIObjectInfo[node]);

    const applyPreset = (nextPreset: PhotographicPreset) => {
        setSelectedPresetId(nextPreset.id);
        setSelectedEra(nextPreset.era);
        setPreset({ ...nextPreset });
        setResult(null);
        setSaveStatus('idle');
    };
    const updatePreset = <K extends keyof PhotographicPreset>(key: K, value: PhotographicPreset[K]) => setPreset(current => ({ ...current, [key]: value }));
    const updateAdvanced = <K extends keyof GenerationOptions>(key: K, value: GenerationOptions[K]) => setAdvanced(current => ({ ...current, [key]: value }));
    const handleEraChange = (era: string) => {
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
                ...store.getState().generation.options,
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

    const randomSeed = advanced.comfySeed === undefined || Number(advanced.comfySeed) < 0;

    return <section className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-border-primary bg-bg-secondary shadow-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-5 py-4">
            <div><h2 className="flex items-center gap-2 text-xl font-bold text-accent"><SwatchIcon className="h-5 w-5" />{NAME}</h2><p className="text-xs text-text-muted">Apply an editable period photographic treatment to any source image with FLUX2.</p></div>
            <span className="rounded border border-accent px-2 py-1 text-xs font-bold text-accent">FLUX2</span>
        </header>

        <div className="p-5">
            <SettingsLayout label={NAME} disabled={isGenerating}
                top={<div className="space-y-2">
                    <ImageUploader id="stylise-anything-source" label="Source Image" sourceFile={sourceImage} onImageUpload={(file) => { setSourceImage(file); setResult(null); }} disabled={isGenerating} />
                    <Button className="w-full" onClick={() => setLibraryOpen(true)} disabled={isGenerating}><LibraryIcon className="h-4 w-4" />Choose from Library</Button>
                </div>}
                models={() => <ModelFields name={NAME} disabled={isGenerating} onChange={(id, value) => updateAdvanced(id as 'comfyFlux2EditUnet' | 'comfyFlux2EditClip' | 'comfyFlux2EditVae', value)} fields={[
                    { id: 'comfyFlux2EditUnet', label: 'FLUX2 Model', value: advanced.comfyFlux2EditUnet || '', choices: familyFiles(models, 'flux2', inventory) },
                    { id: 'comfyFlux2EditClip', label: 'CLIP', value: advanced.comfyFlux2EditClip || '', choices: clips },
                    { id: 'comfyFlux2EditVae', label: 'VAE', value: advanced.comfyFlux2EditVae || '', choices: vaes },
                ]} />}
                sampler={() => <>
                    <SamplerFields name={NAME} disabled={isGenerating} samplers={samplers} limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }}
                        value={{ sampler: advanced.comfyFlux2EditSampler || 'euler', steps: advanced.comfyFlux2EditSteps ?? 4, cfg: advanced.comfyFlux2EditCfg ?? 1 }}
                        onChange={patch => setAdvanced(current => ({ ...current,
                            ...(patch.sampler !== undefined && { comfyFlux2EditSampler: patch.sampler }),
                            ...(patch.steps !== undefined && { comfyFlux2EditSteps: patch.steps }),
                            ...(patch.cfg !== undefined && { comfyFlux2EditCfg: patch.cfg }) }))} />
                    <SeedField name={NAME} value={randomSeed ? 0 : Number(advanced.comfySeed)} onChange={seed => updateAdvanced('comfySeed', seed)} randomize={randomSeed} onRandomizeChange={random => updateAdvanced('comfySeed', random ? undefined : 0)} disabled={isGenerating} />
                </>}
                advanced={() => <NumberField slider label="Source MP" ariaLabel={`${NAME} Source MP`} value={advanced.comfyFlux2EditMegapixels ?? 1} min={0.25} max={4} step={0.25} disabled={isGenerating} onChange={value => updateAdvanced('comfyFlux2EditMegapixels', value)} />}>
                <div className="grid gap-3 sm:grid-cols-[0.35fr_0.65fr_auto]">
                    <Select label="Era" ariaLabel={`${NAME} Era`} value={selectedEra} onChange={handleEraChange} options={PHOTOGRAPHIC_ERAS} disabled={isGenerating} />
                    <Select label="Photographic preset" ariaLabel={`${NAME} Photographic preset`} value={String(selectedPresetId)} onChange={value => { const selected = PHOTOGRAPHIC_PRESETS.find(item => item.id === Number(value)); if (selected) applyPreset(selected); }} options={eraPresets.map(item => ({ value: String(item.id), label: item.name }))} disabled={isGenerating} />
                    <Button onClick={randomizePreset} disabled={isGenerating} title="Random preset from this era" aria-label="Random preset from this era" className="mt-6 self-start"><DiceIcon className="h-4 w-4" /></Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput label="Preset name" value={preset.name} onChange={(event) => updatePreset('name', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Photo type" value={preset.photoType} onChange={(event) => updatePreset('photoType', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Camera type" value={preset.cameraType} onChange={(event) => updatePreset('cameraType', event.target.value)} disabled={isGenerating} />
                    <TextInput label="Film or media" value={preset.filmOrMedia} onChange={(event) => updatePreset('filmOrMedia', event.target.value)} disabled={isGenerating} />
                </div>
                <PromptBox label="Visual style" ariaLabel={`${NAME} Visual style`} value={preset.visualStyle} onChange={value => updatePreset('visualStyle', value)} disabled={isGenerating} />
                <PromptBox kind="instruction" label="Additional instructions" ariaLabel={`${NAME} Additional instructions`} value={additionalInstructions} onChange={setAdditionalInstructions} disabled={isGenerating} />
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${preserveComposition ? 'border-accent' : 'border-border-primary bg-bg-tertiary'}`}><input type="checkbox" checked={preserveComposition} onChange={(event) => setPreserveComposition(event.target.checked)} disabled={isGenerating} className="rounded text-accent focus:ring-accent" /><span><span className="block text-sm font-bold text-text-primary">Preserve source composition</span><span className="block text-xs text-text-muted">Keep subjects, objects, pose, crop, viewpoint, and layout unchanged.</span></span></label>

                {!isComfyUIConnected && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Connect ComfyUI to use Stylise Anything.</p>}
                {missingNodes.length > 0 && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">Missing ComfyUI nodes: {missingNodes.join(', ')}</p>}
                {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
                {isGenerating && <div><div className="mb-1 flex justify-between text-xs text-text-muted"><span>{progressMessage}</span><span>{Math.round(progress * 100)}%</span></div><div className="h-1 overflow-hidden rounded bg-bg-tertiary"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div></div>}
                <div className="flex gap-3">
                    <Button onClick={reset} disabled={isGenerating}><RefreshIcon className="h-5 w-5" />Reset</Button>
                    <Button variant="primary" className="flex-1" onClick={generate} disabled={!canGenerate}>{isGenerating ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <GenerateIcon className="h-5 w-5" />}{isGenerating ? 'Stylising...' : 'Stylise Image'}</Button>
                </div>

                <h3 className="text-xs font-bold uppercase text-text-muted">Result</h3>
                <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-md bg-bg-primary">{result ? <img src={result} alt={`${preset.name} result`} className="max-h-[75vh] max-w-full object-contain" /> : <span className="px-6 text-center text-sm text-text-muted">Choose a source image and photographic preset.</span>}</div>
                {result && <div className="grid grid-cols-2 gap-2">
                    <a href={result} download={`stylise-anything-${preset.id}.png`} className={ui.buttons.secondary}><DownloadIcon className="h-4 w-4" />Download</a>
                    <Button variant="primary" onClick={saveResult} disabled={saveStatus !== 'idle'}>{saveStatus === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveStatus === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveStatus === 'saved' ? 'Saved' : 'Save to Library'}</Button>
                </div>}
            </SettingsLayout>
        </div>
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={selectLibraryImage} filter={LIBRARY_IMAGE_TYPES} />
    </section>;
};

export default StyliseAnythingPanel;
