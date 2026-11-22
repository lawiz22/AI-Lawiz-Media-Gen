import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import JSZip from 'jszip';
import type { AppDispatch, RootState } from '../../store/store';
import {
    addSubjects, patchResult, patchSubject, removeSubject, resetPhotoFusion, setBackdrop, setBusy, setCount, setDetail,
    setEngine, setFusionError, setResults, setScene,
} from '../../store/photoFusionSlice';
import { updateOptions } from '../../store/generationSlice';
import { addToLibrary } from '../../store/librarySlice';
import { addSessionTokenUsage, setModalOpen } from '../../store/appSlice';
import {
    FUSION_DETAILS, FUSION_EXPRESSIONS, FUSION_SCENES, buildFusionPrompt, describeScene, findScene, personNotes, sceneFits, usesBackdrop,
    type FusionDetail, type FusionEngine, type FusionResult, type FusionSubject,
} from '../../photoFusion/scenes';
import { FUSION_LIMITS, fusionInputProblem, runPhotoFusion } from '../../services/photoFusionService';
import { DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_IMAGE_MODELS, getApiKey, getGeminiImageSizes, getGeminiModels, supportsGeminiThinkingLevel } from '../../services/geminiService';
import { DEFAULT_MAMMOUTH_IMAGE_MODEL, MAMMOUTH_IMAGE_MODELS, getMammouthImageModels } from '../../services/mammouthService';
import { CloseIcon, DownloadIcon, LibraryIcon, RefreshIcon, SaveIcon, CheckIcon, SpinnerIcon, ZipIcon } from '../icons';
import { ImageUploader } from '../ImageUploader';
import { SendToLTXButton } from '../SendToLTXButton';
import { SettingsLayout } from '../ui/SettingsLayout';
import { Button, ModelFields, NumberField, SamplerFields, TextField } from '../ui/fields';
import { PromptBox } from '../ui/PromptBox';
import { Select } from '../ui/Select';
import { ui } from '../ui/styles';
import { dataUrlToThumbnail, fileToDataUrl } from '../../utils/imageUtils';
import { familyFiles, flux2Family } from '../../services/styleLibrary';
import { useModelInventory } from '../useModelInventory';
import type { GenerationOptions } from '../../types';

const NAME = 'Photo Fusion';
const ENGINES: { id: FusionEngine; label: string }[] = [
    { id: 'comfyui', label: 'FLUX2' }, { id: 'qwen', label: 'QWEN-Edit' }, { id: 'gemini', label: 'Gemini' }, { id: 'mammouth', label: 'Mammouth' },
];
const LIGHTNING_LORAS = { 4: 'QWEN\\Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors', 8: 'QWEN\\Qwen-Image-Lightning-8steps-V2.0.safetensors' } as const;
const choices = (input: any): string[] => Array.isArray(input?.[0]) ? input[0] : Array.isArray(input?.[1]?.options) ? input[1].options : [];
const extension = (dataUrl: string) => /^data:image\/(png|webp)/.exec(dataUrl)?.[1] || 'jpg';
const toSubject = (file: File, expression = 'as-is'): FusionSubject => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), expression });

/** Seed of the nth image of a run, following the shared seed control. */
const seedAt = (index: number, base: number, options: GenerationOptions) => {
    const step = options.comfySeedIncrement || 1;
    if (options.comfySeedControl === 'fixed') return base;
    if (options.comfySeedControl === 'increment') return base + index * step;
    if (options.comfySeedControl === 'decrement') return base - index * step;
    return index === 0 ? base : Math.floor(Math.random() * 1e15);
};

const PhotoFusionPanel: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const { engine, subjects, backdrop, sceneId, detail, count, busy, results, error } = useSelector((state: RootState) => state.photoFusion);
    const options = useSelector((state: RootState) => state.generation.options);
    const isComfyUIConnected = useSelector((state: RootState) => state.app.isComfyUIConnected);
    const isMammouthConnected = useSelector((state: RootState) => state.app.isMammouthConnected);
    const info = useSelector((state: RootState) => state.app.comfyUIObjectInfo);
    const { inventory } = useModelInventory();
    const [geminiModels, setGeminiModels] = useState<string[]>([...GEMINI_IMAGE_MODELS]);
    const [mammouthModels, setMammouthModels] = useState<string[]>([...MAMMOUTH_IMAGE_MODELS].sort());
    const [loadingMammouth, setLoadingMammouth] = useState(false);
    const [enlarged, setEnlarged] = useState<string | null>(null);
    const set = (patch: Partial<GenerationOptions>) => dispatch(updateOptions(patch));

    const scene = findScene(sceneId);
    const limit = FUSION_LIMITS[engine];
    const prompt = buildFusionPrompt(scene, subjects, detail, !!backdrop);
    const inputProblem = fusionInputProblem(engine, subjects.length, usesBackdrop(scene, !!backdrop));
    const sceneProblem = sceneFits(scene, subjects.length) ? '' : `${scene.title} is written for exactly ${scene.people} people.`;

    const gguf = [...choices(info?.UnetLoaderGGUF?.input?.required?.unet_name), ...choices(info?.UnetLoaderGGUF?.input?.required?.gguf_name)];
    const unets = choices(info?.UNETLoader?.input?.required?.unet_name);
    const clips = choices(info?.CLIPLoader?.input?.required?.clip_name);
    const vaes = choices(info?.VAELoader?.input?.required?.vae_name);
    const samplers = choices(info?.KSamplerSelect?.input?.required?.sampler_name);
    const schedulers = choices(info?.KSampler?.input?.required?.scheduler);
    const loras = choices(info?.LoraLoaderModelOnly?.input?.required?.lora_name);
    const cacheDitTypes = choices(info?.CacheDiT_Model_Optimizer?.input?.required?.model_type);
    const fluxModel = options.comfyFlux2EditUnet || 'flux-2-klein-4b-Q4_K_M.gguf';

    const missingNodes = useMemo(() => {
        if (!info || engine === 'gemini' || engine === 'mammouth') return [];
        const needed = engine === 'qwen'
            ? ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow', 'CFGNorm', 'TextEncodeQwenImageEditPlus', 'ImageScaleToTotalPixels']
            : [fluxModel.toLowerCase().endsWith('.gguf') ? 'UnetLoaderGGUF' : 'UNETLoader', 'CLIPLoader', 'VAELoader', 'ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage',
                ...(options.comfyFlux2EditLora1Name?.trim() || options.comfyFlux2EditLora2Name?.trim() ? ['LoraLoaderModelOnly'] : []),
                ...(options.comfyFlux2EditUseCacheDit ? ['CacheDiT_Model_Optimizer'] : [])];
        return needed.filter(node => !info[node]);
    }, [info, engine, fluxModel, options.comfyFlux2EditLora1Name, options.comfyFlux2EditLora2Name, options.comfyFlux2EditUseCacheDit]);

    const engineProblem = engine === 'gemini' ? (getApiKey() ? '' : 'Configure a Gemini API key in Connection Settings.')
        : engine === 'mammouth' ? (isMammouthConnected ? '' : 'Connect Mammouth in Connection Settings.')
        : !isComfyUIConnected ? 'Connect ComfyUI to use this engine.'
        : missingNodes.length ? `Missing ComfyUI nodes: ${missingNodes.join(', ')}` : '';
    const blocker = engineProblem || inputProblem || sceneProblem;

    useEffect(() => {
        if (engine !== 'gemini') return;
        getGeminiModels().then(models => setGeminiModels([...new Set([options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL, ...models, ...GEMINI_IMAGE_MODELS])]));
    }, [engine]);
    useEffect(() => {
        if (engine !== 'mammouth') return;
        setLoadingMammouth(true);
        getMammouthImageModels().then(models => setMammouthModels(models.length ? models : [...MAMMOUTH_IMAGE_MODELS].sort())).finally(() => setLoadingMammouth(false));
    }, [engine]);

    const addFiles = (files: File[]) => {
        const room = limit.subjects - subjects.length;
        if (!files.length) return;
        if (files.length > room) { dispatch(setFusionError(room > 0 ? `Only ${room} more ${room === 1 ? 'person' : 'people'} can be added with ${ENGINES.find(item => item.id === engine)?.label}.` : 'The subject list is full.')); return; }
        dispatch(addSubjects(files.map(file => toSubject(file))));
    };
    const openLibrary = useCallback(() => {
        if (subjects.length >= limit.subjects) { dispatch(setFusionError('The subject list is full.')); return; }
        dispatch(setModalOpen({ modal: 'isGroupFusionPickerOpen', isOpen: true }));
    }, [subjects.length, limit.subjects, dispatch]);

    const runOne = async (id: string, index: number, base: number) => {
        const progress = (note: string, value: number) => dispatch(patchResult({ id, note, progress: value }));
        try {
            progress('Starting...', 0.02);
            const output = await runPhotoFusion({
                engine, subjects: subjects.map(subject => subject.file), backdrop: usesBackdrop(scene, !!backdrop) ? backdrop!.file : null, prompt,
                scene: describeScene(scene, detail, !!backdrop), notes: personNotes(subjects), options: { ...options, comfySeed: seedAt(index, base, options) },
            }, progress);
            dispatch(patchResult({ id, status: 'done', progress: 1, note: 'Done', dataUrl: output.dataUrl, seed: output.seed, error: undefined }));
            if (output.usage) dispatch(addSessionTokenUsage(output.usage));
        } catch (cause) {
            dispatch(patchResult({ id, status: 'failed', progress: 1, note: 'Failed', error: cause instanceof Error ? cause.message : String(cause) }));
        }
    };

    const generate = async () => {
        if (blocker) { dispatch(setFusionError(blocker)); return; }
        const runs: FusionResult[] = Array.from({ length: count }, () => ({ id: crypto.randomUUID(), status: 'running', progress: 0, note: 'Queued', saved: 'no' }));
        const base = options.comfySeed ?? Math.floor(Math.random() * 1e15);
        dispatch(setFusionError(null));
        dispatch(setResults(runs));
        dispatch(setBusy(true));
        try { for (const [index, run] of runs.entries()) await runOne(run.id, index, base); }
        finally { dispatch(setBusy(false)); }
    };

    const retry = async (id: string) => {
        dispatch(patchResult({ id, status: 'running', progress: 0, note: 'Retrying...', error: undefined }));
        dispatch(setBusy(true));
        try { await runOne(id, 0, options.comfySeed ?? Math.floor(Math.random() * 1e15)); } finally { dispatch(setBusy(false)); }
    };

    const save = async (result: FusionResult) => {
        if (!result.dataUrl) return;
        dispatch(patchResult({ id: result.id, saved: 'saving' }));
        const comfy = engine === 'comfyui' ? { comfyModelType: 'flux2-edit' as const, comfyFlux2EditPrompt: prompt, comfySeed: result.seed }
            : engine === 'qwen' ? { comfyModelType: 'qwen-edit' as const, comfyPrompt: prompt, comfySeed: result.seed } : {};
        try {
            await dispatch(addToLibrary({
                mediaType: 'group-fusion', name: `Photo Fusion - ${scene.title}`, media: result.dataUrl,
                thumbnail: await dataUrlToThumbnail(result.dataUrl, 256),
                sourceImage: subjects[0] ? await fileToDataUrl(subjects[0].file) : undefined,
                options: { ...options, provider: engine === 'qwen' ? 'comfyui' : engine, ...comfy },
            })).unwrap();
            dispatch(patchResult({ id: result.id, saved: 'yes' }));
        } catch {
            dispatch(patchResult({ id: result.id, saved: 'no' }));
            dispatch(setFusionError('Could not save the image to the Library.'));
        }
    };

    const downloadAll = async () => {
        const done = (results || []).filter(result => result.dataUrl);
        if (!done.length) return;
        const zip = new JSZip();
        done.forEach((result, index) => zip.file(`photo-fusion-${index + 1}.${extension(result.dataUrl!)}`, result.dataUrl!.split(',')[1], { base64: true }));
        const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
        Object.assign(document.createElement('a'), { href: url, download: 'photo-fusion.zip' }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const sources = <>
        <section className={`${ui.section} space-y-3`} aria-label="Subjects">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-text-primary">People ({subjects.length}/{limit.subjects})</h3>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={openLibrary} disabled={subjects.length >= limit.subjects}><LibraryIcon className="h-4 w-4" />Library</Button>
                    {subjects.length > 0 && <Button variant="ghost" onClick={() => dispatch(resetPhotoFusion())}>Remove all</Button>}
                </div>
            </div>
            {subjects.length < limit.subjects && <ImageUploader id="photo-fusion-people" multiple infoText={`One photo per person, 2 to ${limit.subjects} people`} onImageUpload={file => file && addFiles([file])} onImagesUpload={addFiles} disabled={busy} />}
            <div className="grid grid-cols-2 gap-3">
                {subjects.map((subject, index) => <div key={subject.id} className="min-w-0 space-y-2">
                    <div className="relative">
                        <img src={subject.previewUrl} alt={`Person ${index + 1}`} className="aspect-square w-full rounded-md object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-bg-primary px-1.5 text-xs font-bold text-text-primary">{index + 1}</span>
                        <button type="button" onClick={() => dispatch(removeSubject(subject.id))} aria-label={`Remove person ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-bg-primary p-1 text-text-primary hover:bg-danger hover:text-white"><CloseIcon className="h-4 w-4" /></button>
                    </div>
                    <Select ariaLabel={`Expression of person ${index + 1}`} value={subject.expression} options={FUSION_EXPRESSIONS.map(item => ({ value: item.id, label: item.label }))} onChange={expression => dispatch(patchSubject({ id: subject.id, expression }))} />
                    <TextField label="Known person (optional)" ariaLabel={`Known person ${index + 1}`} placeholder="e.g. Elvis Presley" value={subject.knownAs || ''} onChange={knownAs => dispatch(patchSubject({ id: subject.id, knownAs: knownAs.slice(0, 80) }))} />
                </div>)}
            </div>
        </section>
        <section className={`${ui.section} space-y-2`} aria-label="Background">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-text-primary">Background (optional)</h3>
                {backdrop && <Button variant="ghost" onClick={() => dispatch(setBackdrop(null))}>Remove background</Button>}
            </div>
            <ImageUploader id="photo-fusion-background" sourceFile={backdrop?.file || null} disabled={busy} onImageUpload={file => dispatch(setBackdrop(file ? toSubject(file, 'background') : null))} />
            {backdrop && scene.ownSetting && <p className={ui.hint}>{scene.title} uses its own setting; the background is ignored.</p>}
        </section>
        <Select label="Scene" ariaLabel={`${NAME} scene`} value={scene.id} onChange={id => dispatch(setScene(id))}
            options={FUSION_SCENES.map(item => ({ value: item.id, label: item.title, disabled: !sceneFits(item, subjects.length) && subjects.length > 0 }))} />
        <p className={ui.hint}>{scene.summary}</p>
        <Select<FusionDetail> label="Detail" ariaLabel={`${NAME} detail`} value={detail} options={FUSION_DETAILS.map(({ value, label }) => ({ value, label }))} onChange={value => dispatch(setDetail(value))} />
        <NumberField slider label="Images" ariaLabel={`${NAME} number of images`} value={count} min={1} max={4} step={1} onChange={value => dispatch(setCount(Math.round(value)))} />
    </>;

    const cloudModels = engine === 'gemini' ? <>
        <Select label="Gemini model" ariaLabel="Gemini image model" value={options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL} options={geminiModels} onChange={model => {
            const sizes = getGeminiImageSizes(model);
            set({ geminiT2IModel: model, geminiImageSize: sizes.includes(options.geminiImageSize) ? options.geminiImageSize : '1K' });
        }} />
        <Select<string> label="Image size" ariaLabel="Gemini image size" value={options.geminiImageSize || '1K'} options={getGeminiImageSizes(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL)} onChange={size => set({ geminiImageSize: size as GenerationOptions['geminiImageSize'] })} />
        {supportsGeminiThinkingLevel(options.geminiT2IModel || DEFAULT_GEMINI_IMAGE_MODEL) && <Select<string> label="Thinking" ariaLabel="Gemini thinking level" value={options.geminiThinkingLevel || 'minimal'}
            options={[{ value: 'minimal', label: 'Minimal' }, { value: 'high', label: 'High' }]} onChange={level => set({ geminiThinkingLevel: level as GenerationOptions['geminiThinkingLevel'] })} />}
    </> : <Select label="Mammouth model" ariaLabel="Mammouth image model" value={options.mammouthImageModel || DEFAULT_MAMMOUTH_IMAGE_MODEL} options={mammouthModels} disabled={loadingMammouth} onChange={model => set({ mammouthImageModel: model })} />;

    const seedFields = <>
        <NumberField label="Seed (-1 = random)" ariaLabel={`${NAME} Seed`} value={options.comfySeed ?? -1} min={-1} step={1} onChange={value => set({ comfySeed: value < 0 ? undefined : value })} />
        <Select label="Seed Control" ariaLabel={`${NAME} Seed Control`} value={options.comfySeedControl || 'randomize'} onChange={value => set({ comfySeedControl: value })}
            options={[{ value: 'randomize', label: 'Randomize' }, { value: 'fixed', label: 'Fixed' }, { value: 'increment', label: 'Increment' }, { value: 'decrement', label: 'Decrement' }]} />
        {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && <NumberField slider label="Seed Step" ariaLabel={`${NAME} Seed Step`} value={options.comfySeedIncrement ?? 1} min={1} max={1000} step={1} onChange={value => set({ comfySeedIncrement: value })} />}
    </>;

    const lightning = (options.comfyQwenEditLora1Name || '').toLowerCase();
    const lightningSteps = lightning.includes('lightning') && ([4, 8] as const).find(steps => lightning.includes(`${steps}step`) && options.photoFusionQwenSteps === steps);
    const pickLightning = (steps: 4 | 8) => set({
        comfyQwenEditUseLora: true, comfyQwenEditLora1Strength: 1, photoFusionQwenSteps: steps,
        comfyQwenEditLora1Name: loras.find(name => /qwen/i.test(name) && /lightning/i.test(name) && name.toLowerCase().includes(`${steps}step`)) || LIGHTNING_LORAS[steps],
    });

    const sections = engine === 'comfyui' ? {
        models: () => <ModelFields name={NAME} onChange={(id, value) => set({ [id as 'comfyFlux2EditUnet']: value })} fields={[
            { id: 'comfyFlux2EditUnet', label: 'FLUX2 Model (GGUF / Safetensors)', value: fluxModel, choices: familyFiles([...new Set([...gguf, ...unets])], 'flux2', inventory) },
            { id: 'comfyFlux2EditClip', label: 'CLIP', value: options.comfyFlux2EditClip || 'qwen_3_4b.safetensors', choices: clips },
            { id: 'comfyFlux2EditVae', label: 'VAE', value: options.comfyFlux2EditVae || 'flux2-vae.safetensors', choices: vaes },
        ]} />,
        loras: () => <>{([1, 2] as const).map(slot => {
            const name = `comfyFlux2EditLora${slot}Name` as const, strength = `comfyFlux2EditLora${slot}Strength` as const;
            return <div key={slot} className="space-y-2">
                <Select variant="search" label={`LoRA ${slot}`} ariaLabel={`${NAME} LoRA ${slot}`} value={options[name] || ''} options={[{ value: '', label: 'None' }, ...familyFiles(loras, flux2Family(fluxModel), inventory).map(value => ({ value, label: value }))]} onChange={value => set({ [name]: value })} />
                <NumberField slider label={`LoRA ${slot} Strength`} ariaLabel={`${NAME} LoRA ${slot} strength`} value={options[strength] ?? 1} min={-2} max={2} step={0.05} disabled={!options[name]} onChange={value => set({ [strength]: value })} />
            </div>;
        })}</>,
        sampler: () => <>
            <SamplerFields name={NAME} samplers={samplers} limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }}
                value={{ sampler: options.comfyFlux2EditSampler || 'euler', steps: options.comfyFlux2EditSteps ?? 4, cfg: options.comfyFlux2EditCfg ?? 1 }}
                onChange={patch => set({ ...(patch.sampler !== undefined && { comfyFlux2EditSampler: patch.sampler }), ...(patch.steps !== undefined && { comfyFlux2EditSteps: patch.steps }), ...(patch.cfg !== undefined && { comfyFlux2EditCfg: patch.cfg }) })} />
            {seedFields}
        </>,
        advanced: () => <>
            <NumberField slider label="Source Megapixels" ariaLabel={`${NAME} Source Megapixels`} value={options.comfyFlux2EditMegapixels ?? 1} min={0.25} max={4} step={0.25} onChange={value => set({ comfyFlux2EditMegapixels: value })} />
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-secondary">
                <input type="checkbox" checked={!!options.comfyFlux2EditUseCacheDit} onChange={event => set({ comfyFlux2EditUseCacheDit: event.target.checked })} className="rounded text-accent focus:ring-accent" />
                Enable CacheDiT Accelerator
            </label>
            {options.comfyFlux2EditUseCacheDit && <>
                <Select label="CacheDiT Model Type" ariaLabel={`${NAME} CacheDiT Model Type`} value={options.comfyFlux2EditCacheDitModelType || 'Auto'} options={cacheDitTypes} onChange={value => set({ comfyFlux2EditCacheDitModelType: value })} />
                <NumberField slider label="Warmup" ariaLabel={`${NAME} CacheDiT Warmup`} value={options.comfyFlux2EditCacheDitWarmupSteps ?? 0} min={0} max={20} step={1} onChange={value => set({ comfyFlux2EditCacheDitWarmupSteps: value })} />
                <NumberField slider label="Skip" ariaLabel={`${NAME} CacheDiT Skip`} value={options.comfyFlux2EditCacheDitSkipInterval ?? 0} min={0} max={10} step={1} onChange={value => set({ comfyFlux2EditCacheDitSkipInterval: value })} />
            </>}
        </>,
    } : engine === 'qwen' ? {
        models: () => <ModelFields name={NAME} onChange={(id, value) => set({ [id as 'comfyQwenEditUnet']: value })} fields={[
            { id: 'comfyQwenEditUnet', label: 'Qwen Edit Model', value: options.comfyQwenEditUnet || 'qwen_image_edit_2509_fp8_e4m3fn.safetensors', choices: familyFiles(unets, 'qwen-edit', inventory) },
            { id: 'comfyQwenEditClip', label: 'CLIP', value: options.comfyQwenEditClip || 'qwen_2.5_vl_7b_fp8_scaled.safetensors', choices: clips },
            { id: 'comfyQwenEditVae', label: 'VAE', value: options.comfyQwenEditVae || 'qwen_image_vae.safetensors', choices: vaes },
        ]} />,
        loras: () => <>
            <div className="space-y-1">
                <span className={ui.label}>Lightning preset</span>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-bg-tertiary p-1">
                    {([4, 8] as const).map(steps => <button key={steps} type="button" onClick={() => pickLightning(steps)} className={`rounded px-3 py-2 text-xs font-bold ${lightningSteps === steps ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>{steps}-step</button>)}
                </div>
                <p className={ui.hint}>Sets the installed Lightning LoRA and the number of steps together.</p>
            </div>
            <Select variant="search" label="Lightning LoRA" ariaLabel={`${NAME} Lightning LoRA`} value={options.comfyQwenEditLora1Name || LIGHTNING_LORAS[8]} options={familyFiles(loras, 'qwen-edit', inventory)} onChange={value => set({ comfyQwenEditUseLora: true, comfyQwenEditLora1Name: value })} />
            <NumberField slider label="LoRA Strength" ariaLabel={`${NAME} LoRA Strength`} value={options.comfyQwenEditLora1Strength ?? 1} min={0} max={2} step={0.05} onChange={value => set({ comfyQwenEditLora1Strength: value })} />
        </>,
        sampler: () => <>
            <SamplerFields name={NAME} samplers={samplers} schedulers={schedulers} limits={{ steps: { min: 1, max: 40, step: 1 }, cfg: { min: 0.1, max: 10, step: 0.1 } }}
                value={{ sampler: options.photoFusionQwenSampler || 'euler_ancestral', scheduler: options.photoFusionQwenScheduler || 'beta57', steps: options.photoFusionQwenSteps ?? 8, cfg: options.photoFusionQwenCfg ?? 1 }}
                onChange={patch => set({ ...(patch.sampler !== undefined && { photoFusionQwenSampler: patch.sampler }), ...(patch.scheduler !== undefined && { photoFusionQwenScheduler: patch.scheduler }), ...(patch.steps !== undefined && { photoFusionQwenSteps: patch.steps }), ...(patch.cfg !== undefined && { photoFusionQwenCfg: patch.cfg }) })} />
            {seedFields}
        </>,
        advanced: () => <>
            <NumberField slider label="Source Megapixels" ariaLabel={`${NAME} Source Megapixels`} value={options.comfyQwenEditMegapixels ?? 1} min={0.25} max={4} step={0.25} onChange={value => set({ comfyQwenEditMegapixels: value })} />
            <NumberField slider label="AuraFlow Shift" ariaLabel={`${NAME} AuraFlow Shift`} value={options.comfyQwenEditShift ?? 2.5} min={0} max={10} step={0.1} onChange={value => set({ comfyQwenEditShift: value })} />
        </>,
    } : { models: () => cloudModels };

    const done = (results || []).filter(result => result.status === 'done').length;
    const progress = results?.length ? results.reduce((sum, result) => sum + result.progress, 0) / results.length : 0;

    return <div className="w-full space-y-4">
        <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-text-secondary">Engine</span>
            <div className="flex gap-1 rounded-md bg-bg-tertiary p-1" role="group" aria-label={`${NAME} engine`}>
                {ENGINES.map(item => <button key={item.id} type="button" aria-pressed={engine === item.id} disabled={busy} onClick={() => dispatch(setEngine(item.id))}
                    className={`rounded px-3 py-1.5 text-xs font-bold ${engine === item.id ? 'bg-accent text-accent-text' : 'text-text-secondary hover:bg-bg-secondary'}`}>{item.label}</button>)}
            </div>
        </div>
        {error && <p role="alert" className="rounded-md border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p>}
        <SettingsLayout label={NAME} disabled={busy} top={sources} {...sections}>
            <PromptBox label="Prompt sent" ariaLabel={`${NAME} prompt`} kind="readonly" value={prompt} rows={6} hint="Built from the people, scene and detail on the left." />
            {blocker && subjects.length > 0 && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{blocker}</p>}
            <Button variant="primary" className="w-full py-3" onClick={generate} disabled={busy || !!blocker}>
                {busy ? <><SpinnerIcon className="h-5 w-5 animate-spin" />Generating...</> : `Fuse photos with ${ENGINES.find(item => item.id === engine)?.label}`}
            </Button>
            {results && <section aria-label={`${NAME} results`} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-text-primary">{done}/{results.length} ready</span>
                    <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-bg-tertiary" role="progressbar" aria-label={`${NAME} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                        <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <Button variant="secondary" onClick={downloadAll} disabled={!done}><ZipIcon className="h-4 w-4" />Download all</Button>
                    <Button variant="ghost" onClick={() => dispatch(setResults(null))} disabled={busy}>Clear results</Button>
                </div>
                <div className={`grid gap-3 ${results.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {results.map((result, index) => <figure key={result.id} className="min-w-0 overflow-hidden rounded-lg border border-border-primary bg-bg-secondary">
                        {result.dataUrl
                            ? <button type="button" onClick={() => setEnlarged(result.dataUrl!)} aria-label={`Enlarge image ${index + 1}`} className="block w-full"><img src={result.dataUrl} alt={`Photo Fusion result ${index + 1}`} className="w-full object-contain" /></button>
                            : <div className="flex aspect-[3/2] flex-col items-center justify-center gap-2 p-4 text-center">
                                {result.status === 'running' ? <SpinnerIcon className="h-8 w-8 animate-spin text-accent" /> : <p className="font-semibold text-danger">Failed</p>}
                                <p className={`text-xs ${result.status === 'failed' ? 'text-danger' : 'text-text-secondary'}`}>{result.error || result.note}</p>
                              </div>}
                        <figcaption className="flex flex-wrap items-center gap-2 border-t border-border-primary p-2">
                            <span className="mr-auto text-xs text-text-muted">Image {index + 1}{result.seed !== undefined ? ` · seed ${result.seed}` : ''}</span>
                            {result.dataUrl && <>
                                <a href={result.dataUrl} download={`photo-fusion-${index + 1}.${extension(result.dataUrl)}`} aria-label={`Download image ${index + 1}`} className={ui.buttons.ghost}><DownloadIcon className="h-4 w-4" /></a>
                                <Button variant="ghost" aria-label={`Save image ${index + 1} to Library`} disabled={result.saved !== 'no'} onClick={() => save(result)}>
                                    {result.saved === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : result.saved === 'yes' ? <CheckIcon className="h-4 w-4 text-highlight-green" /> : <SaveIcon className="h-4 w-4" />}
                                </Button>
                                <SendToLTXButton imageDataUrl={result.dataUrl} prompt={prompt} className={ui.buttons.ghost} />
                            </>}
                            {result.status === 'failed' && <Button variant="ghost" aria-label={`Retry image ${index + 1}`} disabled={busy || !!blocker} onClick={() => retry(result.id)}><RefreshIcon className="h-4 w-4" />Retry</Button>}
                        </figcaption>
                    </figure>)}
                </div>
            </section>}
        </SettingsLayout>
        {enlarged && <div role="dialog" aria-modal="true" aria-label="Enlarged result" className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4" onClick={() => setEnlarged(null)}>
            <img src={enlarged} alt="Enlarged Photo Fusion result" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>}
    </div>;
};

export default PhotoFusionPanel;
