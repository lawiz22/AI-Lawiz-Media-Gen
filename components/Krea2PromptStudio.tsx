import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import { updateKrea2Draft } from '../store/promptGenSlice';
import { KREA2_RAW_RESOLUTION_OPTIONS, KREA2_RESOLUTION_OPTIONS } from '../constants';
import {
    KREA2_ASPECTS, KREA2_COMPOSITION_MODULES, KREA2_NEGATIVE_FAMILIES, KREA2_POSES, KREA2_PROMPTING_SOURCE, KREA2_RAW_SETTINGS, KREA2_RECIPES,
    KREA2_STYLE_FAMILIES, KREA2_STYLE_FORMULAS, KREA2_STYLE_PARAGRAPHS, KREA2_TRAPS, KREA2_TURBO_SETTINGS, KREA2_VOCABULARY,
    buildKrea2Prompt, checkKrea2Prompt, cleanKrea2WriterOutput, findKrea2Pose, formatKrea2Pose, krea2PromptBlocks, krea2SkillSettings, krea2WriterInstruction,
    type Krea2Aspect, type Krea2PromptDraft, type Krea2SettingsPatch, type Krea2Workflow,
} from '../utils/krea2Prompting';
import { generateGeminiText } from '../services/geminiService';
import { generateMammouthText } from '../services/mammouthService';
import { generateOpenRouterText, getOpenRouterSettings } from '../services/openRouterService';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, generateOllamaText, testOllamaConnection } from '../services/ollamaService';
import { ImageUploader } from './ImageUploader';
import { Accordion } from './ui/Accordion';
import { Button, TextField } from './ui/fields';
import { PromptBox } from './ui/PromptBox';
import { Select } from './ui/Select';
import { ui } from './ui/styles';
import { CheckIcon, CopyIcon, GenerateIcon, SaveIcon, SendIcon, SpinnerIcon } from './icons';
import { useUnmountCleanup } from './useUnmountCleanup';
import { StyleModal } from './StyleBrowser';
import type { GenerationOptions } from '../types';
import { getKrea2PromptUpdate } from '../utils/promptDestination';

type WriterProvider = 'gemini' | 'mammouth' | 'openrouter' | 'ollama';

const WORKFLOWS: ReadonlyArray<{ value: Krea2Workflow; label: string }> = [
    { value: 'krea2-simple', label: 'SIMPLE KREA' },
    { value: 'krea2-raw', label: 'KREA2 RAW' },
    { value: 'krea2-edit', label: 'I2I Edit / Identity' },
];
const PROVIDERS: ReadonlyArray<{ value: WriterProvider; label: string }> = [
    { value: 'gemini', label: 'Gemini' }, { value: 'mammouth', label: 'Mammouth AI' }, { value: 'openrouter', label: 'OpenRouter' }, { value: 'ollama', label: 'Ollama' },
];
const FIELDS: ReadonlyArray<{ key: keyof Krea2PromptDraft; label: string; placeholder: string }> = [
    { key: 'medium', label: 'Medium', placeholder: 'editorial fashion photograph' },
    { key: 'subject', label: 'Subject and identity', placeholder: 'a woman in her thirties with short copper hair and green eyes' },
    { key: 'action', label: 'Appearance, pose, action, expression', placeholder: 'wearing a navy wool coat over grey trousers, glancing over her shoulder' },
    { key: 'composition', label: 'Composition and camera', placeholder: 'a three-quarter shot at eye level, 85mm portrait, subject on the right third' },
    { key: 'environment', label: 'Environment', placeholder: 'a rain-slicked Lisbon street at dusk, tram rails leading away' },
    { key: 'lighting', label: 'Light and colour', placeholder: 'a warm shop window on the left, cool blue ambient fill, soft shadows' },
    { key: 'materials', label: 'Materials and micro-detail', placeholder: 'wet cobblestones, wool fibres and natural skin texture' },
    { key: 'mood', label: 'Mood', placeholder: 'quiet, nostalgic' },
    { key: 'text', label: 'Exact text to render (five words or fewer)', placeholder: 'CAFÉ' },
    { key: 'restrictions', label: 'Restrictions (stated as what is there)', placeholder: 'her hands stay in her coat pockets' },
];
const chip = 'rounded-full border border-border-primary px-2 py-0.5 text-xs text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50';
const append = (current: string, term: string) => current.trim() ? `${current.trim().replace(/[,\s]+$/, '')}, ${term}` : term;
const styleOptions = [{ value: '', label: 'None' }, ...KREA2_STYLE_FAMILIES.flatMap(({ family, names }) => names.map(name => ({ value: name, label: `${name} · ${family}${KREA2_STYLE_PARAGRAPHS[name] ? ' · full paragraph' : ''}` })))];
const poseOptions = [{ value: '', label: 'None' }, ...KREA2_POSES.map(pose => ({ value: pose.name, label: `${pose.id}. ${pose.name} · ${pose.group}` }))];
const styleCount = KREA2_STYLE_FAMILIES.reduce((count, family) => count + family.names.length, 0);

export interface Krea2PromptStudioProps {
    /** Fixed when the studio is opened from a KREA2 workflow. */
    workflow?: Krea2Workflow;
    onUse: (prompt: string, workflow: Krea2Workflow, skill?: Krea2SettingsPatch) => void;
    onSave?: (prompt: string) => Promise<void>;
    /** Current CFG and negative prompt of the workflow, for the checks. */
    settings?: { cfg?: number; negativePrompt?: string };
    ollamaUrl?: string;
    ollamaModel?: string;
}

export const Krea2PromptStudio: React.FC<Krea2PromptStudioProps> = ({ workflow, onUse, onSave, settings, ollamaUrl, ollamaModel }) => {
    const dispatch: AppDispatch = useDispatch();
    const draft = useSelector((state: RootState) => state.promptGen.krea2Draft);
    const update = (change: Partial<Krea2PromptDraft>) => dispatch(updateKrea2Draft(change));
    const [target, setTarget] = useState<Krea2Workflow>(workflow || 'krea2-simple');
    const [applySettings, setApplySettings] = useState(false);
    const [provider, setProvider] = useState<WriterProvider>('gemini');
    const url = ollamaUrl || localStorage.getItem('ollama_url') || DEFAULT_OLLAMA_URL;
    const [model, setModel] = useState(ollamaModel || localStorage.getItem('ollama_model') || DEFAULT_OLLAMA_MODEL);
    const [models, setModels] = useState<string[]>([]);
    const [image, setImage] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState('');
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const abort = useRef<AbortController | null>(null);
    const imageId = useId();
    const root = useUnmountCleanup(() => abort.current?.abort());
    const destination = workflow || target;

    useEffect(() => { if (workflow) setTarget(workflow); }, [workflow]);
    useEffect(() => { setSaveState('idle'); }, [draft.prompt]);
    useEffect(() => {
        if (provider !== 'ollama') return;
        let active = true;
        testOllamaConnection(url).then(result => { if (active) setModels(result.models); });
        return () => { active = false; };
    }, [provider, url]);

    const checks = useMemo(() => checkKrea2Prompt(draft.prompt, settings), [draft.prompt, settings]);
    const words = draft.prompt.trim() ? draft.prompt.trim().split(/\s+/).length : 0;
    const resolutions = destination === 'krea2-raw' ? KREA2_RAW_RESOLUTION_OPTIONS : KREA2_RESOLUTION_OPTIONS;
    const skill = krea2SkillSettings(destination, draft.aspect, resolutions);
    const skillSummary = destination === 'krea2-edit'
        ? `${skill.edit?.steps} steps · CFG ${skill.edit?.cfg} · ${skill.edit?.sampler} · ${skill.edit?.scheduler} · ${skill.edit?.aspect}`
        : destination === 'krea2-raw' ? `${skill.comfyKreaResolution} (RAW keeps its own sampling)`
            : `${skill.comfySteps} steps · CFG ${skill.comfyCfg} · ${skill.comfySampler} · ${skill.comfyScheduler} · ${skill.comfyKreaResolution}`;
    const pose = findKrea2Pose(draft.pose);
    const openRouterKey = provider === 'openrouter' ? getOpenRouterSettings().apiKey : '';

    const copy = (text: string, id: string) => {
        void navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(current => current === id ? '' : current), 1500); });
    };
    const write = async () => {
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        setBusy(true); setError('');
        try {
            const instruction = krea2WriterInstruction(draft, destination, Boolean(image));
            const inputs = image ? [image] : [];
            const raw = provider === 'gemini' ? await generateGeminiText(instruction, inputs)
                : provider === 'openrouter' ? await generateOpenRouterText(instruction, inputs)
                    : provider === 'mammouth' ? (await generateMammouthText(instruction, inputs)).text
                        : await generateOllamaText(instruction, url, model, image || undefined, undefined, controller.signal);
            const body = cleanKrea2WriterOutput(raw);
            if (!body) throw new Error('The model returned an empty prompt.');
            if (!controller.signal.aborted) update({ prompt: [body, ...krea2PromptBlocks(draft)].join('\n\n') });
        } catch (failure) {
            const cause = failure as Error;
            setError(cause?.name === 'AbortError' ? 'Request stopped.' : cause?.message || 'The prompt could not be written.');
        } finally {
            if (abort.current === controller) abort.current = null;
            setBusy(false);
        }
    };
    const save = async () => {
        if (!onSave) return;
        setSaveState('saving');
        try { await onSave(draft.prompt); setSaveState('saved'); }
        catch (failure) { setSaveState('idle'); setError(failure instanceof Error ? failure.message : 'The prompt could not be saved.'); }
    };
    const canWrite = !busy && (Boolean(draft.idea.trim()) || Boolean(image) || FIELDS.some(field => String(draft[field.key]).trim()))
        && (provider !== 'ollama' || Boolean(model.trim())) && (provider !== 'openrouter' || Boolean(openRouterKey));

    return <div ref={root} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-4">
            <Accordion title="Write with AI" defaultOpen>
                <PromptBox kind="instruction" label="Idea or brief" rows={4} value={draft.idea} onChange={idea => update({ idea })}
                    placeholder="A courier crossing a rainy night market, cinematic and candid" hint="The builder fields below, the style and the pose are passed along when filled." />
                <ImageUploader id={`krea2-reference-${imageId}`} label="Reference image (optional, for a faithful prompt)" sourceFile={image} onImageUpload={setImage} />
                {image && <Button variant="ghost" onClick={() => setImage(null)}>Remove reference image</Button>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select<WriterProvider> label="Language model" ariaLabel="KREA2 writer provider" value={provider} options={PROVIDERS} onChange={setProvider} />
                    {provider === 'ollama' && <Select variant="search" label="Ollama model" ariaLabel="KREA2 writer Ollama model" value={model} options={[...new Set([model, ...models])].filter(Boolean)}
                        onChange={value => { setModel(value); localStorage.setItem('ollama_model', value); }} />}
                </div>
                {provider === 'openrouter' && !openRouterKey && <p className="text-xs text-danger">Configure your OpenRouter API key in Connection Settings.</p>}
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => void write()} disabled={!canWrite}>
                        {busy ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <GenerateIcon className="h-4 w-4" />}{busy ? 'Writing...' : 'Write KREA2 prompt'}
                    </Button>
                    {busy && provider === 'ollama' && <Button variant="danger" onClick={() => abort.current?.abort()}>Stop</Button>}
                </div>
            </Accordion>

            <Accordion title="Prompt builder (sentence frame)">
                <p className={ui.hint}>Order is emphasis: medium and subject first, then pose, camera, place, light, materials and mood. Empty fields are skipped.</p>
                {FIELDS.map(field => <div key={field.key} className="space-y-1">
                    <TextField label={field.label} ariaLabel={`KREA2 ${field.label}`} value={String(draft[field.key])} placeholder={field.placeholder} onChange={value => update({ [field.key]: value })} />
                    {KREA2_VOCABULARY.filter(group => group.field === field.key).map(group => <div key={group.id} className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-text-muted">{group.label}:</span>
                        {group.terms.map(term => <button key={term} type="button" className={chip} onClick={() => update({ [field.key]: append(String(draft[field.key]), term) })}>{term}</button>)}
                    </div>)}
                </div>)}
                <Button variant="primary" onClick={() => update({ prompt: buildKrea2Prompt(draft) })}>Build prompt from fields</Button>
            </Accordion>

            <Accordion title={`Style index (${styleCount} styles)`}>
                <Select variant="search" label="Style" ariaLabel="KREA2 style" value={draft.style} options={styleOptions} onChange={style => update({ style })} />
                {draft.style && <p className="whitespace-pre-wrap rounded-md border border-border-primary bg-bg-primary p-3 text-xs text-text-secondary">
                    {KREA2_STYLE_PARAGRAPHS[draft.style] || `Only the name ships with the index. Write the paragraph yourself with a formula below, or keep "Style: ${draft.style}."`}
                </p>}
                <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                    <li>One style per prompt, matched to the subject.</li>
                    <li>Trim a clause you do not want instead of negating it.</li>
                    <li>The "influenced by / reminiscent of" clause is the strongest signal.</li>
                </ul>
                {KREA2_STYLE_FORMULAS.map(formula => <p key={formula} className="text-xs text-text-muted">{formula}</p>)}
            </Accordion>

            <Accordion title={`Pose library (${KREA2_POSES.length} poses, 11 fields)`}>
                <Select variant="search" label="Pose" ariaLabel="KREA2 pose" value={draft.pose} options={poseOptions} onChange={value => update({ pose: value })} />
                <TextField label="Held or moved object (replaces 'the object')" ariaLabel="KREA2 pose object" value={draft.poseObject} placeholder="the goat" onChange={poseObject => update({ poseObject: poseObject.replace(/^the\s+/i, '') })} />
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={draft.poseKeyFieldsOnly} onChange={event => update({ poseKeyFieldsOnly: event.target.checked })} />Keep only the four key fields (silhouette, weight, torso, movement)</label>
                {pose && <pre className="whitespace-pre-wrap rounded-md border border-border-primary bg-bg-primary p-3 text-xs text-text-secondary">{formatKrea2Pose(pose, draft.poseObject, draft.poseKeyFieldsOnly)}</pre>}
                <p className={ui.hint}>Hands fail most: prefer an open palm, a handle or a cuff, and name the contact.</p>
            </Accordion>

            <Accordion title="Recipes and composition modules">
                {KREA2_RECIPES.map(recipe => <div key={recipe.name} className="space-y-1 border-b border-border-primary pb-3 last:border-b-0">
                    <p className="text-sm font-semibold text-text-primary">{recipe.name}</p>
                    <p className="text-xs text-text-muted">{recipe.template}</p>
                    <p className="text-xs text-text-secondary">{recipe.example}</p>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" onClick={() => update({ idea: recipe.example })}>Use as brief</Button>
                        <Button variant="ghost" onClick={() => update({ prompt: recipe.example })}>Use as prompt</Button>
                    </div>
                </div>)}
                <div className="flex flex-wrap gap-1">
                    {KREA2_COMPOSITION_MODULES.map(module => <button key={module.name} type="button" title={module.text} className={chip} onClick={() => update({ composition: append(draft.composition, module.text) })}>+ {module.name}</button>)}
                </div>
                <p className={ui.hint}>Composition modules are added to the Composition field; rewrite them in your own words.</p>
            </Accordion>
        </div>

        <div className="space-y-4">
            <Select<Krea2Aspect> label="Aspect ratio" ariaLabel="KREA2 aspect ratio" value={draft.aspect} options={KREA2_ASPECTS.map(aspect => ({ value: aspect.id, label: `${aspect.id} · ${aspect.use}` }))} onChange={aspect => update({ aspect })} />
            <PromptBox kind="positive" label="KREA2 prompt" rows={14} value={draft.prompt} onChange={busy ? undefined : prompt => update({ prompt })} copyable clearable
                placeholder="Write with AI, build from fields, or type here." hint={`${words} words. Krea 2 prefers long, concrete prose.`} />
            {error && <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}
            {checks.length > 0 && <ul aria-label="KREA2 prompt checks" className="space-y-1 rounded-md border border-border-primary p-3 text-xs">
                {checks.map(check => <li key={check.id} className={check.level === 'warning' ? 'text-warning' : 'text-text-secondary'}>{check.level === 'warning' ? 'Fix: ' : 'Tip: '}{check.message}</li>)}
            </ul>}
            {draft.prompt.trim() && checks.every(check => check.level !== 'warning') && <p className="text-xs text-text-muted">No rule violation found. Render four seeds before rewording.</p>}

            <div className={`${ui.section} space-y-3`}>
                {!workflow && <Select<Krea2Workflow> label="Send to" ariaLabel="KREA2 destination workflow" value={target} options={WORKFLOWS} onChange={setTarget} />}
                <label className="flex items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={applySettings} onChange={event => setApplySettings(event.target.checked)} />Also apply the guide settings: {skillSummary}</label>
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" disabled={!draft.prompt.trim() || busy} onClick={() => onUse(draft.prompt, destination, applySettings ? skill : undefined)}>
                        <SendIcon className="h-4 w-4" />{workflow ? 'Use in this workflow' : `Use in ${WORKFLOWS.find(entry => entry.value === target)?.label}`}
                    </Button>
                    <Button disabled={!draft.prompt.trim()} onClick={() => copy(draft.prompt, 'prompt')}><CopyIcon className="h-4 w-4" />{copied === 'prompt' ? 'Copied!' : 'Copy'}</Button>
                    {onSave && <Button disabled={!draft.prompt.trim() || busy || saveState !== 'idle'} onClick={() => void save()}>
                        {saveState === 'saving' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : saveState === 'saved' ? <CheckIcon className="h-4 w-4" /> : <SaveIcon className="h-4 w-4" />}{saveState === 'saved' ? 'Saved!' : 'Save to Library'}
                    </Button>}
                </div>
            </div>

            <Accordion title="Recommended settings">
                <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                    <li>Krea 2 Turbo: {KREA2_TURBO_SETTINGS.steps} steps, CFG {KREA2_TURBO_SETTINGS.cfg.toFixed(1)} (0 gives noise, above 1.5 oversaturates), {KREA2_TURBO_SETTINGS.sampler}, {KREA2_TURBO_SETTINGS.scheduler} (simple gives flat fills).</li>
                    <li>Shift {KREA2_TURBO_SETTINGS.shift.toFixed(1)} smooths skin and slims the figure; 1.15 keeps grain and skin defects.</li>
                    <li>Native 2048 per side, minimum 1024, dimensions divisible by 16. Choose the ratio first, then the size.</li>
                    <li>RAW: {KREA2_RAW_SETTINGS.steps} steps, CFG {KREA2_RAW_SETTINGS.cfg}; train LoRAs on RAW, run them on Turbo.</li>
                    <li>Encoder qwen3vl_4b, VAE qwen_image_vae; a Wan-family VAE shifts colours and texture.</li>
                    <li>Render four seeds before rewording: a defect on three or four is the prompt, on one or two the seed.</li>
                </ul>
                <ul className="space-y-1 text-xs text-text-secondary">{KREA2_ASPECTS.map(aspect => <li key={aspect.id}><span className="font-semibold text-text-primary">{aspect.id}</span> · {aspect.use} · {aspect.sizes}</li>)}</ul>
            </Accordion>

            <Accordion title="Traps and fixes">
                <ul className="space-y-2 text-xs">{KREA2_TRAPS.map(entry => <li key={entry.trap}><span className="font-semibold text-text-primary">{entry.trap}:</span> <span className="text-text-secondary">{entry.fix}</span></li>)}</ul>
            </Accordion>

            <Accordion title="Negative families (RAW or CFG above 1 only)">
                <p className={ui.hint}>At CFG 1.0 the negative branch cancels out. Use these only with KREA2 RAW (CFG 3.5) or another live negative path; drop "text" when you want lettering.</p>
                {KREA2_NEGATIVE_FAMILIES.map(family => <div key={family.name} className="flex items-start justify-between gap-2">
                    <p className="text-xs text-text-secondary"><span className="font-semibold text-text-primary">{family.name}:</span> {family.text}</p>
                    <button type="button" className={chip} onClick={() => copy(family.text, family.name)}>{copied === family.name ? 'Copied!' : 'Copy'}</button>
                </div>)}
            </Accordion>

            <p className="text-xs text-text-muted">
                Guide adapted from <a href={KREA2_PROMPTING_SOURCE.url} target="_blank" rel="noreferrer" className="text-accent underline">{KREA2_PROMPTING_SOURCE.title}</a> v{KREA2_PROMPTING_SOURCE.version} by {KREA2_PROMPTING_SOURCE.author}, <a href={KREA2_PROMPTING_SOURCE.licenseUrl} target="_blank" rel="noreferrer" className="text-accent underline">{KREA2_PROMPTING_SOURCE.license}</a>; based on {KREA2_PROMPTING_SOURCE.basis}, pose system by {KREA2_PROMPTING_SOURCE.poses}. Condensed and turned into tools; the adult reference is not included.
            </p>
        </div>
    </div>;
};

/** Opens the studio from a KREA2 workflow and writes the result into that workflow. */
export const Krea2PromptHelperButton: React.FC<{
    workflow: Krea2Workflow; options: GenerationOptions; updateOptions: (change: Partial<GenerationOptions>) => void; disabled?: boolean;
}> = ({ workflow, options, updateOptions, disabled }) => {
    const dispatch: AppDispatch = useDispatch();
    const draftPrompt = useSelector((state: RootState) => state.promptGen.krea2Draft.prompt);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    const current = workflow === 'krea2-edit' ? options.comfyKrea2Edit?.prompt || '' : options.comfyKreaPrompt || '';
    const settings = workflow === 'krea2-edit' ? { cfg: options.comfyKrea2Edit?.cfg, negativePrompt: options.comfyKrea2Edit?.negativePrompt }
        : workflow === 'krea2-simple' ? { cfg: options.comfyCfg ?? 1, negativePrompt: options.comfyKreaNegativePrompt } : undefined;
    const show = () => {
        if (!draftPrompt.trim() && current.trim()) dispatch(updateKrea2Draft({ prompt: current }));
        setError('');
        setOpen(true);
    };
    return <>
        <Button className="w-full" disabled={disabled} onClick={show}><GenerateIcon className="h-4 w-4" />KREA2 prompt helper</Button>
        {open && <StyleModal title="KREA2 prompt helper" onClose={() => setOpen(false)}>
            {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
            {current.trim() && current !== draftPrompt && <Button variant="ghost" className="mb-3" onClick={() => dispatch(updateKrea2Draft({ prompt: current }))}>Load this workflow's current prompt</Button>}
            <Krea2PromptStudio workflow={workflow} settings={settings} onUse={(prompt, target, skill) => {
                try { updateOptions(getKrea2PromptUpdate(prompt, target, options, skill)); setOpen(false); }
                catch (failure) { setError(failure instanceof Error ? failure.message : 'The prompt could not be applied.'); }
            }} />
        </StyleModal>}
    </>;
};
