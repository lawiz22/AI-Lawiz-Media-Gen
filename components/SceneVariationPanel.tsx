import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { GenerationOptions, LibraryItem } from '../types';
import { addSessionTokenUsage } from '../store/appSlice';
import { addToLibrary, deleteFromLibrary } from '../store/librarySlice';
import { fileToDataUrl, dataUrlToThumbnail } from '../utils/imageUtils';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL } from '../services/ollamaService';
import { getApiKey } from '../services/geminiService';
import { getMammouthApiKey } from '../services/mammouthService';
import {
    analyzeSceneImage, buildSceneJobs, createSceneControls, defaultSceneSettings, generateSceneVariation,
    randomSceneChoice, runSceneBatch, sceneChoices, sceneModelOptions, sceneReadinessErrors, SCENE_INTENSITIES,
    type SceneAnalysis, type SceneAxis, type SceneChoice, type SceneControl, type SceneControls,
    type SceneIntensity, type SceneJob, type SceneProvider, type SceneSubject,
    buildMaskedSceneJobs, readSceneMask, sceneMaskedReadinessErrors, validateSceneMasks, type SceneMask,
    generateAutomaticSceneMasks, type ScenePoseMaskArea, parseSceneVariationPreset,
} from '../services/sceneVariationService';
import { sceneSegmentationErrors } from '../services/sceneMaskWorkflow';
import { ImageUploader } from './ImageUploader';
import { LibraryPickerModal } from './LibraryPickerModal';
import { PresetSaveModal } from './PresetSaveModal';
import { ConfirmationModal } from './ConfirmationModal';
import { NumberSlider } from './InputComponents';
import { SendToLTXButton } from './SendToLTXButton';
import { CheckIcon, CloseIcon, DiceIcon, DownloadIcon, GenerateIcon, LibraryIcon, RefreshIcon, SaveIcon, SpinnerIcon, TrashIcon, ZoomIcon } from './icons';

interface Props { isComfyUIConnected: boolean | null; comfyUIObjectInfo: any; onModelChange: (model: string) => void; pendingPreset?: LibraryItem | null; onPresetLoaded?: () => void }
interface Result extends SceneJob {
    status: 'pending' | 'running' | 'done' | 'error' | 'stopped';
    src?: string;
    actualPrompt?: string;
    error?: string;
    saved: 'idle' | 'saving' | 'saved';
    source: File;
    sourcePreview: string;
}
const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary disabled:opacity-50';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-primary px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40';
const labels: Record<SceneAxis, string> = { pose: 'Pose', expression: 'Facial expression', lighting: 'Lighting & ambience', camera: 'Camera angle', season: 'Season' };

const Select: React.FC<{ label: string; value: string; values: Array<{ value: string; label: string }>; onChange: (value: string) => void; disabled?: boolean }> = ({ label, value, values, onChange, disabled }) => (
    <label className="block min-w-0 text-sm text-text-secondary">{label}<select aria-label={label} className={inputClass} value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        {!values.some(item => item.value === value) && <option value={value}>{value || '(none)'} - unavailable</option>}
        {values.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select></label>
);
const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) => (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-text-secondary"><input type="checkbox" className="rounded text-accent focus:ring-accent" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} />{label}</label>
);
const ChoiceControl: React.FC<{ label: string; control: SceneControl; choices: SceneChoice[]; onChange: (updates: Partial<SceneControl>) => void; disabled: boolean }> = ({ label, control, choices, onChange, disabled }) => (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Select label={label} value={control.value} values={[{ value: 'auto', label: 'Auto' }, ...choices.map(choice => ({ value: choice.instruction, label: choice.label }))]} onChange={value => onChange({ value })} disabled={disabled || !control.enabled || !choices.length} />
        <button type="button" title={`Randomize ${label}`} aria-label={`Randomize ${label}`} className={`${buttonClass} h-10 w-10 !p-2`} disabled={disabled || !control.enabled || !choices.length} onClick={() => onChange({ value: randomSceneChoice(choices, control.value) })}><DiceIcon className="h-5 w-5" /></button>
    </div>
);

const SceneVariationPanel: React.FC<Props> = ({ isComfyUIConnected, comfyUIObjectInfo, onModelChange, pendingPreset, onPresetLoaded }) => {
    const dispatch: AppDispatch = useDispatch();
    const otherGenerationBusy = useSelector((state: RootState) => state.generation.isLoading);
    const libraryItems = useSelector((state: RootState) => state.library.items);
    const presets = libraryItems.filter(item => item.mediaType === 'preset' && item.sceneVariationPreset);
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [presetSaveOpen, setPresetSaveOpen] = useState(false);
    const [presetDeleteOpen, setPresetDeleteOpen] = useState(false);
    const [presetBusy, setPresetBusy] = useState(false);
    const presetOperation = useRef(false);
    const [initialSettings] = useState(() => defaultSceneSettings());
    const [settings, setSettings] = useState(initialSettings);
    const [source, setSource] = useState<File | null>(null);
    const [sourcePreview, setSourcePreview] = useState('');
    const [sourceLoading, setSourceLoading] = useState(false);
    const [provider, setProvider] = useState<SceneProvider>('gemini');
    const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL);
    const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
    const [controls, setControls] = useState<SceneControls>(() => createSceneControls());
    const [mode, setMode] = useState<'global' | 'masked'>('global');
    const [masks, setMasks] = useState<Record<string, SceneMask>>({});
    const [maskLoading, setMaskLoading] = useState(false);
    const [segmenting, setSegmenting] = useState(false);
    const [samCheckpoint, setSamCheckpoint] = useState('');
    const [maskPadding, setMaskPadding] = useState(32);
    const [poseMaskArea, setPoseMaskArea] = useState<ScenePoseMaskArea>('movement');
    const maskRequest = useRef(0);
    const [intensity, setIntensity] = useState<SceneIntensity>('moderate');
    const [count, setCount] = useState(4);
    const [analyzing, setAnalyzing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [results, setResults] = useState<Result[]>([]);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [zoom, setZoom] = useState<string | null>(null);
    const analysisRequest = useRef(0);
    const analysisAbort = useRef<AbortController | null>(null);
    const stopRequested = useRef(false);
    const generationRunning = useRef(false);
    const sourceRequest = useRef(0);
    const busy = generating || sourceLoading || maskLoading || segmenting;
    const locked = busy || analyzing || presetBusy;
    const modelName = settings.comfyFlux2EditUnet || '';
    const effectiveControls = mode === 'global' ? controls : { ...controls,
        camera: { ...controls.camera, enabled: false }, lighting: { ...controls.lighting, enabled: false }, season: { ...controls.season, enabled: false } };
    const maskSubjects = analysis?.subjects.filter(subject => (['pose', 'expression'] as const).some(axis => controls[axis].enabled && controls[`${axis}:${subject.id}`]?.enabled && sceneChoices(analysis, axis, intensity, subject).length)) || [];
    const samModels = sceneModelOptions(comfyUIObjectInfo, 'CheckpointLoaderSimple', 'ckpt_name').filter(name => /sam[-_. ]?3/i.test(name));
    const selectedSam = samCheckpoint || samModels.find(name => /3[._]1/.test(name)) || samModels[0] || '';
    const hasPoseMasks = maskSubjects.some(subject => controls.pose.enabled && controls[`pose:${subject.id}`]?.enabled && sceneChoices(analysis!, 'pose', intensity, subject).length > 0);
    const automaticKey = JSON.stringify({ people: analysis?.subjects.map(subject => [subject.id, subject.description, subject.samDescription, subject.faceVisible]),
        targets: maskSubjects.map(subject => [subject.id, controls.pose.enabled && controls[`pose:${subject.id}`]?.enabled && sceneChoices(analysis!, 'pose', intensity, subject).length > 0]), checkpoint: selectedSam, padding: maskPadding,
        poseArea: hasPoseMasks ? poseMaskArea : undefined, poseIntensity: hasPoseMasks && poseMaskArea === 'movement' ? intensity : undefined });
    const activeMasks = Object.fromEntries(Object.entries<SceneMask>(masks).filter(([, mask]) => !mask.automaticKey || mask.automaticKey === automaticKey));
    const missingMasks = mode === 'masked' ? maskSubjects.filter(subject => !activeMasks[subject.id]).map(subject => subject.id) : [];
    const segmentationErrors = mode === 'masked' ? sceneSegmentationErrors(comfyUIObjectInfo, selectedSam) : [];

    useEffect(() => { onModelChange(modelName); }, [modelName, onModelChange]);
    useEffect(() => {
        if (!zoom) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setZoom(null); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [zoom]);

    const invalidateAnalysis = () => {
        maskRequest.current++; setMasks({}); setMaskLoading(false);
        analysisRequest.current++;
        analysisAbort.current?.abort();
        analysisAbort.current = null;
        setAnalyzing(false);
    };
    const loadPreset = (item: LibraryItem) => {
        if (locked || otherGenerationBusy || generationRunning.current) return;
        try {
            const preset = parseSceneVariationPreset(item.sceneVariationPreset);
            invalidateAnalysis();
            setSettings({ ...defaultSceneSettings(), ...preset.settings });
            setMode(preset.mode); setIntensity(preset.intensity); setCount(preset.count);
            setProvider(preset.provider); setOllamaModel(preset.ollamaModel);
            setSamCheckpoint(preset.samCheckpoint); setMaskPadding(preset.maskPadding); setPoseMaskArea(preset.poseMaskArea);
            setControls(createSceneControls(analysis || undefined));
            setSelectedPresetId(String(item.id)); setError(''); setMessage('Scene Variation preset loaded.');
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load preset.'); }
    };
    useEffect(() => {
        if (!pendingPreset || locked || otherGenerationBusy) return;
        loadPreset(pendingPreset);
        onPresetLoaded?.();
    }, [pendingPreset, locked, otherGenerationBusy]);
    const savePreset = async (name: string) => {
        if (locked || otherGenerationBusy || presetOperation.current) return;
        presetOperation.current = true; setPresetBusy(true); setError('');
        try {
            const preset = parseSceneVariationPreset({ version: 1, settings, mode, intensity, count, provider, ollamaModel,
                samCheckpoint: selectedSam, maskPadding, poseMaskArea });
            const item = await dispatch(addToLibrary({ mediaType: 'preset', name: `SCENE-VARIATION_FLUX2_Param_${name}`,
                media: '', thumbnail: '', tags: ['scene-variation'], sceneVariationPreset: preset })).unwrap();
            setSelectedPresetId(String(item.id)); setMessage('Scene Variation preset saved to Library.');
        } catch (reason) { setError(typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : 'Unable to save preset.'); }
        finally { presetOperation.current = false; setPresetBusy(false); }
    };
    const deletePreset = async () => {
        if (locked || otherGenerationBusy || presetOperation.current || !selectedPresetId) return;
        presetOperation.current = true; setPresetBusy(true); setError('');
        try {
            await dispatch(deleteFromLibrary(Number(selectedPresetId))).unwrap();
            setSelectedPresetId(''); setMessage('Scene Variation preset deleted.');
        } catch (reason) { setError(typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : 'Unable to delete preset.'); }
        finally { presetOperation.current = false; setPresetBusy(false); }
    };
    const changeSource = async (file: File | null) => {
        if (generationRunning.current) return;
        invalidateAnalysis();
        const request = ++sourceRequest.current;
        setAnalysis(null); setControls(createSceneControls()); setResults([]); setError('');
        setSource(null); setSourcePreview(''); setSourceLoading(!!file);
        try {
            if (file) {
                const bitmap = await createImageBitmap(file); bitmap.close();
                const preview = await fileToDataUrl(file);
                if (request !== sourceRequest.current) return;
                setSource(file); setSourcePreview(preview);
            }
        } catch (reason) {
            if (request === sourceRequest.current) setError(reason instanceof Error ? reason.message : 'Unable to read image.');
        } finally { if (request === sourceRequest.current) setSourceLoading(false); }
    };
    const selectLibrary = async (item: LibraryItem) => {
        if (generationRunning.current) return;
        invalidateAnalysis();
        const request = ++sourceRequest.current;
        setSourceLoading(true); setLibraryOpen(false); setError('');
        try {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error('Unable to load the Library image.');
            const blob = await response.blob();
            if (request !== sourceRequest.current) return;
            await changeSource(new File([blob], `scene-${item.id}`, { type: blob.type }));
        } catch (reason) {
            if (request === sourceRequest.current) setError(reason instanceof Error ? reason.message : 'Library import failed.');
        } finally { if (request === sourceRequest.current) setSourceLoading(false); }
    };
    const analyze = async () => {
        if (!source || busy) return;
        invalidateAnalysis();
        const request = analysisRequest.current;
        const controller = new AbortController(); analysisAbort.current = controller;
        setAnalyzing(true); setError(''); setMessage('Analyzing scene...');
        setAnalysis(null); setControls(createSceneControls());
        try {
            const next = await analyzeSceneImage(source, provider, { url: localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL, model: ollamaModel }, controller.signal,
                usage => dispatch(addSessionTokenUsage(usage)));
            if (request !== analysisRequest.current) return;
            setAnalysis(next); setControls(createSceneControls(next));
        } catch (reason) {
            if (request === analysisRequest.current) setError(reason instanceof Error ? reason.message : 'Scene analysis failed.');
        } finally {
            if (request === analysisRequest.current) { setAnalyzing(false); setMessage(''); analysisAbort.current = null; }
        }
    };
    const updateControl = (key: string, updates: Partial<SceneControl>) => setControls(current => ({ ...current, [key]: { ...current[key], ...updates } }));
    const updateSettings = (updates: Partial<GenerationOptions>) => setSettings(current => ({ ...current, ...updates }));
    const updateSubject = (id: string, updates: Partial<SceneSubject>) => setAnalysis(current => current && ({ ...current, subjects: current.subjects.map(subject => subject.id === id ? { ...subject, ...updates } : subject) }));
    const importMask = async (personId: string, file: File) => {
        if (!source || locked) return;
        const request = ++maskRequest.current;
        setMaskLoading(true); setError('');
        try {
            const mask = await readSceneMask(file, source);
            if (request !== maskRequest.current) return;
            const next = { ...activeMasks, [personId]: mask };
            validateSceneMasks(Object.keys(next), next);
            setMasks(next);
        } catch (reason) {
            if (request === maskRequest.current) setError(reason instanceof Error ? reason.message : 'Unable to read mask.');
        } finally { if (request === maskRequest.current) setMaskLoading(false); }
    };
    const calculateMasks = async () => {
        if (!source || !analysis || locked || generationRunning.current || !isComfyUIConnected || otherGenerationBusy) return;
        if (segmentationErrors.length) { setError(segmentationErrors.join('\n')); return; }
        generationRunning.current = true; stopRequested.current = false;
        const request = ++maskRequest.current;
        setSegmenting(true); setStopping(false); setError(''); setProgress(0); setMessage('Calculating SAM3 masks...');
        try {
            const calculated = await generateAutomaticSceneMasks(source, analysis, effectiveControls, intensity, selectedSam, maskPadding,
                (text, value) => { setMessage(text); setProgress(value); }, () => stopRequested.current, poseMaskArea);
            if (request !== maskRequest.current || stopRequested.current) return;
            setMasks(Object.fromEntries(Object.entries<SceneMask>(calculated).map(([id, mask]) => [id, { ...mask, automaticKey }])));
            setMessage('SAM3 masks ready.');
        } catch (reason) {
            if (request === maskRequest.current) {
                if (reason instanceof Error && reason.name === 'AbortError') setMessage('Mask calculation stopped.');
                else { setError(reason instanceof Error ? reason.message : 'SAM3 segmentation failed.'); setMessage('Mask calculation failed.'); }
            }
        } finally { generationRunning.current = false; setSegmenting(false); setStopping(false); }
    };
    const globalPeople = (axis: 'pose' | 'expression', action: 'all' | 'none' | 'random' | 'auto') => {
        if (!analysis) return;
        setControls(current => {
            const next = { ...current };
            for (const subject of analysis.subjects) {
                const choices = sceneChoices(analysis, axis, intensity, subject);
                if (!choices.length) continue;
                const key = `${axis}:${subject.id}`;
                const control = current[key];
                if (action === 'random' || action === 'auto') {
                    if (current[axis].enabled && control.enabled) next[key] = { ...control, value: action === 'auto' ? 'auto' : randomSceneChoice(choices, control.value) };
                } else next[key] = { ...control, enabled: action === 'all' };
            }
            return next;
        });
    };
    const addPerson = () => {
        if (!analysis || analysis.subjects.length >= 20) return;
        const id = `person-${Math.max(0, ...analysis.subjects.map(subject => Number(subject.id.slice(7)))) + 1}`;
        const subject: SceneSubject = { id, description: '', faceVisible: false, pose: 'As visible in the original image', expression: 'As visible in the original image',
            poses: [{ label: 'Slight head tilt', instruction: 'Tilt the head slightly; preserve body support and every other body joint.', intensity: 'subtle' }],
            expressions: [{ label: 'Gentle smile', instruction: 'A gentle closed-mouth smile, preserving head orientation and body pose.', intensity: 'subtle' }] };
        setAnalysis({ ...analysis, subjects: [...analysis.subjects, subject] });
        setControls(current => ({ ...current, [`pose:${id}`]: { enabled: false, value: 'auto' }, [`expression:${id}`]: { enabled: false, value: 'auto' } }));
    };
    const patchResult = (id: string, patch: Partial<Result>) => setResults(current => current.map(result => result.id === id ? { ...result, ...patch } : result));
    const executeBatch = async (file: File, jobs: SceneJob[]) => {
        if (generationRunning.current) return;
        generationRunning.current = true; stopRequested.current = false;
        setGenerating(true); setStopping(false); setError(''); setProgress(0);
        let completed = 0;
        try {
            await runSceneBatch(file, jobs, () => stopRequested.current, async (original, job) => {
                patchResult(job.id, { status: 'running', error: undefined });
                try {
                    return await generateSceneVariation(original, job, (text, value) => {
                        setMessage(`Image ${completed + 1}/${jobs.length}: ${text}`); setProgress((completed + value) / jobs.length);
                    });
                } catch (reason) {
                    patchResult(job.id, { status: 'error', error: reason instanceof Error ? reason.message : 'Generation failed.' });
                    throw reason;
                }
            }, (job, result) => {
                completed++;
                patchResult(job.id, { status: 'done', src: result.src, actualPrompt: result.prompt });
            });
            setMessage(stopRequested.current ? `Stopped. ${completed}/${jobs.length} completed.` : `${completed}/${jobs.length} completed.`);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Generation failed.'); setMessage('Batch stopped after an error.'); }
        finally {
            const ids = new Set(jobs.map(job => job.id));
            setResults(current => current.map(result => ids.has(result.id) && result.status === 'pending' ? { ...result, status: 'stopped' } : result));
            generationRunning.current = false; setGenerating(false); setStopping(false);
        }
    };
    const generate = async () => {
        if (!source || !analysis || locked || generationRunning.current) return;
        try {
            if (!isComfyUIConnected) throw new Error('Connect ComfyUI first.');
            const readiness = mode === 'masked' ? sceneMaskedReadinessErrors(comfyUIObjectInfo, settings) : sceneReadinessErrors(comfyUIObjectInfo, settings);
            if (readiness.length) throw new Error(readiness.join('\n'));
            const prepared = mode === 'masked' ? buildMaskedSceneJobs(analysis, effectiveControls, intensity, count, settings, activeMasks) : buildSceneJobs(analysis, controls, intensity, count, settings);
            const jobs = prepared.map(job => ({ ...job, id: crypto.randomUUID() }));
            setResults(jobs.map(job => ({ ...job, status: 'pending', saved: 'idle', source, sourcePreview })));
            await executeBatch(source, jobs);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to prepare variations.'); }
    };
    const save = async (result: Result) => {
        if (!result.src || result.saved !== 'idle') return;
        patchResult(result.id, { saved: 'saving' });
        try {
            await dispatch(addToLibrary({ mediaType: 'image', name: `Scene Variation - ${result.seed}`, media: result.src,
                thumbnail: await dataUrlToThumbnail(result.src, 256), sourceImage: result.sourcePreview,
                tags: ['scene-variation', ...(result.maskedPasses ? ['masked-by-person'] : [])], options: { ...result.options, comfyFlux2EditPrompt: result.actualPrompt || result.prompt } })).unwrap();
            patchResult(result.id, { saved: 'saved' });
        } catch (reason) { patchResult(result.id, { saved: 'idle' }); setError(reason instanceof Error ? reason.message : 'Save failed.'); }
    };
    const reset = () => {
        if (generationRunning.current || presetOperation.current) return;
        setSelectedPresetId(''); setPresetSaveOpen(false); setPresetDeleteOpen(false);
        invalidateAnalysis(); sourceRequest.current++;
        setMode('global');
        setSamCheckpoint(''); setMaskPadding(32); setPoseMaskArea('movement');
        setSource(null); setSourcePreview(''); setSourceLoading(false); setAnalysis(null); setControls(createSceneControls());
        setSettings({ ...initialSettings }); setIntensity('moderate'); setCount(4); setResults([]); setError(''); setMessage(''); setProgress(0); setZoom(null); setLibraryOpen(false);
    };
    const modelList = Array.from(new Set([
        ...sceneModelOptions(comfyUIObjectInfo, 'UnetLoaderGGUF', 'unet_name'),
        ...sceneModelOptions(comfyUIObjectInfo, 'UNETLoader', 'unet_name'),
    ])).filter(model => /flux[-_ ]?2|klein/i.test(model));
    const readiness = mode === 'masked' ? sceneMaskedReadinessErrors(comfyUIObjectInfo, settings) : sceneReadinessErrors(comfyUIObjectInfo, settings);
    const analysisReady = provider === 'gemini' ? !!getApiKey() : provider === 'mammouth' ? !!getMammouthApiKey() : !!ollamaModel.trim();
    const hasChanges = !!analysis && (['pose', 'expression', 'lighting', 'camera', 'season'] as const).some(axis => effectiveControls[axis].enabled && (
        axis === 'pose' || axis === 'expression'
            ? analysis.subjects.some(subject => controls[`${axis}:${subject.id}`]?.enabled && sceneChoices(analysis, axis, intensity, subject).length > 0)
            : sceneChoices(analysis, axis, intensity).length > 0));
    const selectSettings = (label: string, field: keyof GenerationOptions, values: string[], allowNone = false) => <Select key={field} label={label} value={String(settings[field] ?? '')}
        values={[...(allowNone ? [{ value: '', label: 'None' }] : []), ...Array.from(new Set(values.filter(value => value && value !== 'None'))).map(value => ({ value, label: value }))]}
        onChange={value => updateSettings({ [field]: value })} disabled={locked} />;
    const numberSetting = (label: string, field: keyof GenerationOptions, min: number, max: number, step: number, fallback: number, disabled = false) => <NumberSlider key={field} label={label}
        value={Number(settings[field] ?? fallback)} onChange={event => updateSettings({ [field]: Number(event.target.value) })} min={min} max={max} step={step} disabled={locked || disabled} allowDirectInput />;

    return <section aria-label="Scene Variation" className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary pb-3">
            <div className="flex items-center gap-3"><h2 className="text-xl font-bold text-accent">Scene Variation</h2><span className="text-xs font-semibold text-text-muted">FLUX2</span></div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                <select aria-label="Scene Variation preset" className={`${inputClass} !mt-0 !w-auto max-w-full sm:max-w-64`} value={presets.some(item => String(item.id) === selectedPresetId) ? selectedPresetId : ''} disabled={locked || otherGenerationBusy}
                    onChange={event => { const item = presets.find(candidate => String(candidate.id) === event.target.value); if (item) loadPreset(item); else setSelectedPresetId(''); }}>
                    <option value="">Load Preset...</option>
                    {presets.map(item => <option key={item.id} value={item.id}>{item.name?.replace('SCENE-VARIATION_FLUX2_Param_', '') || `Preset ${item.id}`}</option>)}
                </select>
                <button type="button" className={buttonClass} title="Save Scene Variation preset" aria-label="Save Scene Variation preset" disabled={locked || otherGenerationBusy} onClick={() => setPresetSaveOpen(true)}>{presetBusy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}</button>
                {presets.some(item => String(item.id) === selectedPresetId) && <button type="button" className={buttonClass} title="Delete Scene Variation preset" aria-label="Delete Scene Variation preset" disabled={locked || otherGenerationBusy} onClick={() => setPresetDeleteOpen(true)}><TrashIcon className="h-4 w-4" /></button>}
                <button type="button" className={buttonClass} onClick={reset} disabled={generating || segmenting || presetBusy}><RefreshIcon className="h-4 w-4" />Reset</button>
            </div>
        </header>
        <div role="radiogroup" aria-label="Editing mode" className="flex flex-wrap gap-2">
            {(['global', 'masked'] as const).map(value => <label key={value} className={`${buttonClass} ${mode === value ? '!border-accent !text-accent' : ''}`} title={value === 'global' ? 'Whole-scene FLUX2 editing' : 'Pose and expression only. Camera, lighting and season remain in Global mode.'}>
                <input type="radio" name="scene-editing-mode" value={value} checked={mode === value} disabled={locked} onChange={() => { setMode(value); setError(''); }} className="accent-accent" />
                {value === 'global' ? 'Global' : 'Masked by person'}
            </label>)}
        </div>
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
            <div className="min-w-0 space-y-4">
                <ImageUploader id="scene-variation-source" label="Source image" sourceFile={source} onImageUpload={file => { void changeSource(file); }} disabled={busy} />
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setLibraryOpen(true)} disabled={busy} className={buttonClass}><LibraryIcon className="h-4 w-4" />Library</button>
                    {sourcePreview && <button type="button" className={buttonClass} onClick={() => setZoom(sourcePreview)} title="View original image"><ZoomIcon className="h-4 w-4" />Original</button>}</div>
                <Select label="Image analysis" value={provider} values={['gemini', 'mammouth', 'ollama'].map(value => ({ value, label: value === 'gemini' ? 'Gemini' : value === 'mammouth' ? 'Mammouth' : 'Ollama' }))} onChange={value => { invalidateAnalysis(); setProvider(value as SceneProvider); setAnalysis(null); setControls(createSceneControls()); setError(''); }} disabled={busy} />
                {provider === 'ollama' && <label className="block text-sm text-text-secondary">Ollama vision model<input className={inputClass} value={ollamaModel} onChange={event => { invalidateAnalysis(); setOllamaModel(event.target.value); setAnalysis(null); }} disabled={busy} /></label>}
                {!analysisReady && <p role="status" className="text-sm text-highlight-yellow">{provider === 'ollama' ? 'Select a vision model.' : `Configure the ${provider === 'gemini' ? 'Gemini' : 'Mammouth'} API key in Connection Settings.`}</p>}
                <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={analyze} disabled={!source || !analysisReady || locked}>{analyzing ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}Analyze</button>
                    {analyzing && <button type="button" className={buttonClass} onClick={() => { invalidateAnalysis(); setMessage('Analysis cancelled locally.'); }}>Cancel analysis</button>}</div>
                {analysis && <details open className="space-y-3 border-t border-border-primary pt-3"><summary className="cursor-pointer text-sm font-semibold text-text-primary">Scene analysis</summary>
                    <Select label="Environment" value={analysis.environment} values={['indoor', 'outdoor', 'unknown'].map(value => ({ value, label: value }))} onChange={value => setAnalysis({ ...analysis, environment: value as SceneAnalysis['environment'] })} disabled={locked} />
                    {(['location', 'style', 'lighting', 'camera', 'season'] as const).map(field => <label key={field} className="block text-sm capitalize text-text-secondary">{field}<textarea className={inputClass} rows={field === 'location' || field === 'style' ? 3 : 2} maxLength={1600} value={analysis[field]} onChange={event => setAnalysis({ ...analysis, [field]: event.target.value })} disabled={locked} /></label>)}
                    <label className="block text-sm text-text-secondary">Fixed location anchors<textarea className={inputClass} rows={3} value={analysis.anchors.join('\n')} onChange={event => setAnalysis({ ...analysis, anchors: event.target.value.split('\n') })} disabled={locked} /></label>
                    {analysis.uncertainty && <p className="whitespace-pre-wrap text-sm text-highlight-yellow">{analysis.uncertainty}</p>}
                    <div className="space-y-3">{analysis.subjects.map(subject => <div key={subject.id} className="space-y-2 border-t border-border-primary pt-3">
                        <div className="flex items-center justify-between"><span className="text-xs font-semibold text-accent">{subject.id}</span><button type="button" title={`Remove ${subject.id} from analysis`} aria-label={`Remove ${subject.id} from analysis`} className={buttonClass} disabled={locked} onClick={() => { setAnalysis({ ...analysis, subjects: analysis.subjects.filter(item => item.id !== subject.id) }); setMasks(current => { const next = { ...current }; delete next[subject.id]; return next; }); }}><CloseIcon className="h-4 w-4" /></button></div>
                        {(['description', 'pose', 'expression'] as const).map(field => <label key={field} className="block text-sm capitalize text-text-secondary">{subject.id} {field}<textarea className={inputClass} rows={2} maxLength={1600} value={subject[field]} onChange={event => updateSubject(subject.id, { [field]: event.target.value })} disabled={locked} /></label>)}
                        <label className="block text-sm text-text-secondary" title="SAM-only English description: person + distinctive visible hair/clothing + position. Not sent to FLUX2. Analyze again to populate this field for older analyses.">{subject.id} SAM description<textarea aria-label={`${subject.id} SAM description`} className={inputClass} rows={2} maxLength={400} value={subject.samDescription || ''} placeholder="person with short blond hair wearing a checked top on the left" onChange={event => updateSubject(subject.id, { samDescription: event.target.value })} disabled={locked} /></label>
                        <Toggle label={`${subject.id} face visible`} checked={subject.faceVisible} onChange={faceVisible => updateSubject(subject.id, { faceVisible })} disabled={locked} />
                    </div>)}</div>
                    <button type="button" onClick={addPerson} className={buttonClass} disabled={locked || analysis.subjects.length >= 20}>Add detected person</button>
                </details>}
            </div>
            <div className="min-w-0 space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select label="Variation amplitude" value={intensity} values={SCENE_INTENSITIES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => { setIntensity(value as SceneIntensity); setControls(current => Object.fromEntries(Object.entries<SceneControl>(current).map(([key, control]) => [key, { ...control, value: 'auto' }]))); }} disabled={locked} />
                    <label className="block text-sm text-text-secondary">Images<input className={inputClass} type="number" min={1} max={8} step={1} value={count} onChange={event => setCount(Math.min(8, Math.max(1, Math.round(Number(event.target.value) || 1))))} disabled={locked} /></label>
                </div>
                {(['pose', 'expression'] as const).map(axis => <section key={axis} aria-label={labels[axis]} className="space-y-3 border-t border-border-primary pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><Toggle label={`Vary ${labels[axis].toLowerCase()}`} checked={controls[axis].enabled} onChange={enabled => updateControl(axis, { enabled })} disabled={locked || !analysis?.subjects.some(subject => sceneChoices(analysis, axis, intensity, subject).length)} />
                        <div className="flex flex-wrap gap-1"><button type="button" className={buttonClass} disabled={locked || !controls[axis].enabled} onClick={() => globalPeople(axis, 'all')}>All</button><button type="button" className={buttonClass} disabled={locked || !controls[axis].enabled} onClick={() => globalPeople(axis, 'none')}>None</button><button type="button" className={buttonClass} disabled={locked || !controls[axis].enabled} onClick={() => globalPeople(axis, 'auto')}>Auto</button><button type="button" className={buttonClass} title={`Randomize enabled ${axis}s`} aria-label={`Randomize enabled ${axis}s`} disabled={locked || !controls[axis].enabled} onClick={() => globalPeople(axis, 'random')}><DiceIcon className="h-4 w-4" /></button></div>
                    </div>
                    {analysis?.subjects.map(subject => {
                        const key = `${axis}:${subject.id}`; const control = controls[key]; const choices = sceneChoices(analysis, axis, intensity, subject);
                        return <div key={key} className={`min-w-0 space-y-1 border-l-2 pl-3 ${controls[axis].enabled && control.enabled ? 'border-accent' : 'border-border-primary'}`}>
                            <Toggle label={`${subject.id} ${axis}`} checked={control.enabled} onChange={enabled => updateControl(key, { enabled })} disabled={locked || !controls[axis].enabled || !choices.length} />
                            <p className="break-words text-xs text-text-muted">{subject.description}</p>
                            <ChoiceControl label={`${subject.id} ${labels[axis].toLowerCase()} choice`} control={control} choices={choices} onChange={updates => updateControl(key, updates)} disabled={locked || !controls[axis].enabled} />
                            {!choices.length && <p className="text-xs text-text-muted">{axis === 'expression' && !subject.faceVisible ? 'Face not visible' : 'No applicable proposals'}</p>}
                        </div>;
                    })}
                </section>)}
                {mode === 'masked' && <section aria-label="Person masks" className="space-y-3 border-t border-border-primary pt-3">
                    <h3 className="text-sm font-semibold text-text-primary" title="SAM3 calculates a region for each selected person. Inspect every overlay: incorrect detections can edit the wrong person. Pose margins exclude other detected bodies; large movements may require a manual correction.">Person masks</h3>
                    <Select label="SAM3 checkpoint" value={selectedSam} values={samModels.map(value => ({ value, label: value }))} onChange={setSamCheckpoint} disabled={locked} />
                    <fieldset disabled={locked || !hasPoseMasks} className="min-w-0 space-y-1">
                        <legend className="text-sm text-text-secondary">Pose edit area</legend>
                        <div className="flex flex-wrap gap-2">
                            {(['movement', 'silhouette'] as const).map(value => <label key={value} className={`${buttonClass} ${poseMaskArea === value ? '!border-accent !text-accent' : ''}`} title={value === 'movement' ? 'Fill the body bounds and add space according to variation amplitude, excluding other people. Inspect the overlay before generation.' : 'Original SAM silhouette plus the pixel margin.'}>
                                <input type="radio" name="scene-pose-mask-area" value={value} checked={poseMaskArea === value} onChange={() => setPoseMaskArea(value)} className="accent-accent" />
                                {value === 'movement' ? 'Movement area' : 'Silhouette'}
                            </label>)}
                        </div>
                    </fieldset>
                    <NumberSlider label="Pose mask margin (pixels)" value={maskPadding} min={0} max={128} step={1} onChange={event => setMaskPadding(Number(event.target.value))} disabled={locked || !hasPoseMasks} allowDirectInput />
                    {segmentationErrors.length > 0 && <details><summary className="cursor-pointer text-sm text-highlight-yellow">SAM3 requirements ({segmentationErrors.length})</summary><ul className="list-inside list-disc break-words text-xs text-highlight-yellow">{segmentationErrors.map(item => <li key={item}>{item}</li>)}</ul></details>}
                    {!missingMasks.length && maskSubjects.length > 0 && <button type="button" className={buttonClass} disabled={locked || otherGenerationBusy || !isComfyUIConnected || segmentationErrors.length > 0} onClick={calculateMasks}><RefreshIcon className="h-4 w-4" />Recalculate masks</button>}
                    {maskSubjects.map(subject => <div key={subject.id} className="space-y-2 border-l-2 border-accent pl-3">
                        <span className="text-sm text-text-secondary">{subject.id}</span>
                        <details><summary className="cursor-pointer text-xs text-text-muted" title="Opaque grayscale PNG at the source dimensions. White edits, black protects. Include the old silhouette and destination, exclude other people.">Manual mask override</summary>
                        <label className="block text-sm text-text-secondary">{subject.id} mask
                            <input type="file" accept="image/png" aria-label={`${subject.id} mask`} className={`${inputClass} file:mr-2 file:max-w-full`} disabled={locked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importMask(subject.id, file); }} />
                        </label>
                        </details>
                        {activeMasks[subject.id] && <div className="flex items-start gap-2">
                            <button type="button" className="h-28 min-w-0 flex-1" title={`Inspect ${subject.id} edit region`} onClick={() => setZoom(activeMasks[subject.id].preview)}><img className="h-full w-full object-contain" src={activeMasks[subject.id].preview} alt={`${subject.id} mask overlay`} /></button>
                            <button type="button" className={buttonClass} aria-label={`Remove ${subject.id} mask`} title={`Remove ${subject.id} mask`} disabled={locked} onClick={() => setMasks(current => { const next = { ...current }; delete next[subject.id]; return next; })}><CloseIcon className="h-4 w-4" /></button>
                        </div>}
                    </div>)}
                    {maskLoading && <p role="status" className="text-sm text-text-muted">Validating mask...</p>}
                    {missingMasks.length > 0 && <p role="status" className="break-words text-sm text-highlight-yellow">Masks pending: {missingMasks.join(', ')}</p>}
                </section>}
                {mode === 'global' && (['lighting', 'camera', 'season'] as const).map(axis => {
                    const choices = analysis ? sceneChoices(analysis, axis, intensity) : [];
                    return <section key={axis} aria-label={labels[axis]} className="space-y-2 border-t border-border-primary pt-3">
                        <Toggle label={`Vary ${labels[axis].toLowerCase()}`} checked={controls[axis].enabled} onChange={enabled => updateControl(axis, { enabled })} disabled={locked || !choices.length} />
                        <ChoiceControl label={labels[axis]} control={controls[axis]} choices={choices} onChange={updates => updateControl(axis, updates)} disabled={locked} />
                        {axis === 'season' && analysis && analysis.environment !== 'outdoor' && <p className="text-xs text-text-muted">Unavailable: {analysis.environment} scene</p>}
                    </section>;
                })}
                <details className="space-y-4 border-t border-border-primary pt-3"><summary className="cursor-pointer text-sm font-semibold text-text-primary">FLUX2 Advanced Settings</summary>
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        {selectSettings('FLUX2 Model (GGUF / Safetensors)', 'comfyFlux2EditUnet', modelList)}
                        {selectSettings('CLIP', 'comfyFlux2EditClip', sceneModelOptions(comfyUIObjectInfo, 'CLIPLoader', 'clip_name'))}
                        {selectSettings('VAE', 'comfyFlux2EditVae', sceneModelOptions(comfyUIObjectInfo, 'VAELoader', 'vae_name'))}
                        {selectSettings('Sampler', 'comfyFlux2EditSampler', sceneModelOptions(comfyUIObjectInfo, 'KSamplerSelect', 'sampler_name'))}
                        {numberSetting('Steps', 'comfyFlux2EditSteps', 1, 40, 1, 4)}
                        {numberSetting('CFG', 'comfyFlux2EditCfg', 0.1, 10, 0.1, 1)}
                        {numberSetting('Source megapixels', 'comfyFlux2EditMegapixels', 0.25, 4, 0.25, 1)}
                        <label className="block text-sm text-text-secondary">Seed (-1 = random)<input className={inputClass} type="number" min={-1} max={Number.MAX_SAFE_INTEGER} step={1} value={settings.comfySeed ?? -1} onChange={event => updateSettings({ comfySeed: Number(event.target.value) < 0 ? undefined : Number(event.target.value) })} disabled={locked} /></label>
                    </div>
                    <div className="space-y-3 border-t border-border-primary pt-3"><h3 className="text-sm font-semibold text-text-primary">Additional LoRAs</h3>
                        {([1, 2] as const).map(index => <div key={index} className="grid min-w-0 gap-3 sm:grid-cols-2">
                            {selectSettings(`LoRA ${index}`, `comfyFlux2EditLora${index}Name`, sceneModelOptions(comfyUIObjectInfo, 'LoraLoaderModelOnly', 'lora_name'), true)}
                            {numberSetting(`LoRA ${index} strength`, `comfyFlux2EditLora${index}Strength`, -2, 2, 0.05, 1, !settings[`comfyFlux2EditLora${index}Name`])}
                        </div>)}
                        {(settings.comfyFlux2EditLora1Name || settings.comfyFlux2EditLora2Name) && <p className="text-xs text-highlight-yellow">Selected LoRAs may alter the source style.</p>}
                    </div>
                    <Toggle label="Enable CacheDiT Accelerator" checked={!!settings.comfyFlux2EditUseCacheDit} onChange={comfyFlux2EditUseCacheDit => updateSettings({ comfyFlux2EditUseCacheDit })} disabled={locked} />
                    {settings.comfyFlux2EditUseCacheDit && <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                        {selectSettings('CacheDiT model type', 'comfyFlux2EditCacheDitModelType', sceneModelOptions(comfyUIObjectInfo, 'CacheDiT_Model_Optimizer', 'model_type'))}
                        {numberSetting('CacheDiT warmup steps', 'comfyFlux2EditCacheDitWarmupSteps', 0, 20, 1, 0)}
                        {numberSetting('CacheDiT skip interval', 'comfyFlux2EditCacheDitSkipInterval', 0, 10, 1, 0)}
                    </div>}
                </details>
                {!isComfyUIConnected && <p className="text-sm text-highlight-yellow">ComfyUI is not connected.</p>}
                {readiness.length > 0 && <details><summary className="cursor-pointer text-sm text-highlight-yellow">ComfyUI requirements ({readiness.length})</summary><ul className="list-inside list-disc break-words text-xs text-highlight-yellow">{readiness.map(item => <li key={item}>{item}</li>)}</ul></details>}
                {error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-danger">{error}</p>}
                <div className="flex flex-wrap gap-3">
                    <button type="button" className={`${buttonClass} !border-accent bg-accent !text-accent-text`} onClick={missingMasks.length ? calculateMasks : generate} disabled={locked || otherGenerationBusy || !analysis || !hasChanges || !isComfyUIConnected || (missingMasks.length ? segmentationErrors.length > 0 : readiness.length > 0)}><GenerateIcon className="h-5 w-5" />{missingMasks.length ? 'Calculate masks (SAM3)' : 'Generate variations'}</button>
                    {segmenting && <button type="button" className={buttonClass} disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }}>Stop after current mask</button>}
                    {generating && <button type="button" className={buttonClass} disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }}>Stop after current image</button>}
                </div>
                {(generating || segmenting || analyzing || message) && <div aria-live="polite" className="space-y-2 text-sm text-text-secondary"><span>{stopping ? segmenting ? 'Stopping after current mask...' : 'Stopping after current image...' : message}</span>{(generating || segmenting) && <progress className="h-2 w-full accent-accent" value={progress} max={1} aria-label="Scene variation progress" />}</div>}
            </div>
        </div>
        {results.length > 0 && <section aria-label="Scene variation results" className="space-y-3 border-t border-border-primary pt-5"><h3 className="text-lg font-semibold text-text-primary">Variations</h3>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">{results.map((result, index) => <article key={result.id} className="min-w-0 overflow-hidden rounded-md border border-border-primary bg-bg-secondary">
                <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 text-sm"><strong>Variation {index + 1}</strong><span className="text-xs text-text-muted">{result.status}</span></div>
                <div className="flex aspect-[4/3] items-center justify-center bg-bg-primary">{result.src ? <button type="button" className="h-full w-full" onClick={() => setZoom(result.src!)} title={`Enlarge variation ${index + 1}`}><img src={result.src} alt={`Scene variation ${index + 1}`} className="h-full w-full object-contain" /></button> : result.status === 'running' ? <SpinnerIcon className="h-7 w-7 animate-spin text-accent" /> : <span className="text-sm text-text-muted">{result.status}</span>}</div>
                <div className="space-y-3 p-3">{result.maskedPasses && <p className="text-xs text-accent">Masked / {result.maskedPasses.length} passes</p>}<ul className="list-inside list-disc break-words text-xs text-text-secondary">{result.changes.map((change, changeIndex) => <li key={changeIndex}>{change}</li>)}</ul>
                    <details className="text-xs text-text-muted"><summary className="cursor-pointer">Prompt / seed {result.seed}</summary><pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">{result.actualPrompt || result.prompt}</pre></details>
                    {result.error && <p className="break-words text-xs text-danger">{result.error}</p>}
                    {(result.status === 'error' || result.status === 'stopped') && <button type="button" className={buttonClass} disabled={locked || otherGenerationBusy || !isComfyUIConnected} onClick={() => { void executeBatch(result.source, [result]); }}><RefreshIcon className="h-4 w-4" />Retry</button>}
                    {result.src && <div className="flex flex-wrap gap-2">
                        <button type="button" className={buttonClass} title="Compare original" aria-label={`Compare original for variation ${index + 1}`} onClick={() => setZoom(result.sourcePreview)}><ZoomIcon className="h-4 w-4" /></button>
                        <a className={buttonClass} href={result.src} download={`scene-variation-${index + 1}-${result.seed}.${result.src.startsWith('data:image/jpeg') ? 'jpg' : result.src.startsWith('data:image/webp') ? 'webp' : 'png'}`} title="Download variation" aria-label={`Download variation ${index + 1}`}><DownloadIcon className="h-4 w-4" /></a>
                        <button type="button" className={buttonClass} title="Save to Library" aria-label={`Save variation ${index + 1} to Library`} disabled={result.saved !== 'idle'} onClick={() => { void save(result); }}>{result.saved === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : result.saved === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}</button>
                        <SendToLTXButton imageDataUrl={result.src} className={buttonClass} />
                    </div>}
                </div>
            </article>)}</div>
        </section>}
        <LibraryPickerModal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} onSelectItem={selectLibrary} filter={['image', 'character', 'extracted-frame', 'group-fusion', 'swap-anything', 'past-forward-photo']} />
        <PresetSaveModal isOpen={presetSaveOpen} onClose={() => setPresetSaveOpen(false)} onSave={name => { void savePreset(name); }} />
        <ConfirmationModal isOpen={presetDeleteOpen} onClose={() => setPresetDeleteOpen(false)} onConfirm={() => { void deletePreset(); }} title="Delete Preset" message={`Delete "${presets.find(item => String(item.id) === selectedPresetId)?.name || 'Scene Variation preset'}" from the Library?`} confirmLabel="Delete" isDanger />
        {zoom && <div role="dialog" aria-modal="true" aria-label="Scene image preview" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setZoom(null)}><button type="button" autoFocus className="absolute right-4 top-4 rounded-md bg-black p-3 text-white" aria-label="Close scene image preview" onClick={() => setZoom(null)}><CloseIcon className="h-6 w-6" /></button><img src={zoom} alt="Scene preview" className="max-h-[90vh] max-w-full object-contain" onClick={event => event.stopPropagation()} /></div>}
    </section>;
};

export default SceneVariationPanel;