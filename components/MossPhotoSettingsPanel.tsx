import React from 'react';
import type { GenerationOptions } from '../types';
import { getQwen21Choices } from '../services/qwen21Workflow';
import {
    defaultMossPhotoSettings, MOSS_PHOTO_FOCALS, MOSS_PHOTO_LONG_SIDES, MOSS_PHOTO_LOOKS,
    MOSS_PHOTO_NODE_SPECS, MOSS_PHOTO_RATIOS, mossPhotoDimensions,
    type MossPhotoSettings, type PhotoPromptRow, type PhotoValue,
} from '../services/mossPhotoWorkflow';

const field = 'mt-1 w-full rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm';
const accordion = 'rounded-xl border border-border-primary bg-bg-secondary p-3';
export const MossPhotoSettingsPanel: React.FC<{
    options: GenerationOptions; updateOptions: (patch: Partial<GenerationOptions>) => void;
    objectInfo?: Parameters<typeof getQwen21Choices>[0]; disabled: boolean;
}> = ({ options, updateOptions, objectInfo, disabled }) => {
    const settings = options.comfyMossPhoto || defaultMossPhotoSettings();
    const [opened, setOpened] = React.useState<Record<string, boolean>>({});
    const update = (patch: Partial<MossPhotoSettings>) => updateOptions({ comfyMossPhoto: { ...settings, ...patch } });
    const toggle = (label: string, value: boolean, change: (value: boolean) => void) =>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-accent" checked={value} onChange={event => change(event.target.checked)} />{label}</label>;
    const select = (label: string, value: string, values: readonly string[], change: (value: string) => void) =>
        <label className="block text-sm">{label}<select aria-label={label} className={field} value={value} onChange={event => change(event.target.value)}>
            {values.map(entry => <option key={entry} value={entry}>{entry}</option>)}
        </select></label>;
    const numeric = (label: string, value: number, change: (value: number) => void, min: number, max: number, step = 1) =>
        <label className="block text-sm">{label}<input aria-label={label} type="number" className={field} value={value} min={min} max={max} step={step} onChange={event => change(Number(event.target.value))} /></label>;
    const details = (title: string, content: React.ReactNode | (() => React.ReactNode), initiallyOpen = false) => {
        const open = opened[title] ?? initiallyOpen;
        return <details className={accordion} open={open} onToggle={event => {
            const next = event.currentTarget.open;
            setOpened(current => current[title] === next ? current : { ...current, [title]: next });
        }}>
            <summary className="cursor-pointer font-semibold text-accent">{title}</summary>
            {open && <div className="mt-4 space-y-4">{typeof content === 'function' ? content() : content}</div>}
        </details>;
    };
    const modelSchema = (key: string): [string, string] => {
        if (key === 'model') return ['UNETLoader', 'unet_name'];
        if (key === 'model weights') return ['UNETLoader', 'weight_dtype'];
        if (key === 'vae') return ['VAELoader', 'vae_name'];
        if (/^lora \d$/.test(key)) return ['LoraLoaderModelOnly', 'lora_name'];
        return ['CLIPLoader', key.endsWith('type') ? 'type' : 'clip_name'];
    };
    const group = (name: string) => MOSS_PHOTO_NODE_SPECS.filter(spec => spec.group === name).map(spec => {
        const values = { ...spec.defaults, ...settings.nodes[spec.id] };
        const patch = (key: string, value: PhotoValue) => update({ nodes: { ...settings.nodes, [spec.id]: { ...values, [key]: value } } });
        return <section key={spec.id} className="space-y-3">
            <h4 className="text-sm font-bold">{spec.title}</h4>
            <div className="grid gap-3 sm:grid-cols-2">{Object.entries(values).filter(([key]) => {
                if (spec.id === '86' && settings.look === 'J') return false;
                if (spec.id === '87' && key === 'gray_scale') return false;
                if (spec.id === '160' && key.startsWith('prompt writer') && !settings.aiWriter) return false;
                const lora = key.match(/^lora (\d) strength$/);
                return !lora || (values[`lora ${lora[1]}`] !== 'None' && values[`lora ${lora[1]}`] !== '');
            }).map(([key, value]) => {
                const [nodeType, input] = spec.id === '160' ? modelSchema(key) : [spec.classType, key];
                const choices = getQwen21Choices(objectInfo, nodeType, input);
                const allChoices = [...new Set([String(value), ...(/^lora \d$/.test(key) ? ['None'] : []), ...choices])];
                const label = `${spec.title} / ${key}`;
                const schema = objectInfo?.[nodeType]?.input;
                const definition = schema?.required?.[input] || schema?.optional?.[input];
                const bounds = Array.isArray(definition) && typeof definition[1] === 'object' && definition[1] !== null ? definition[1] : {};
                if (typeof value === 'boolean') return <React.Fragment key={key}>{toggle(label, value, next => patch(key, next))}</React.Fragment>;
                return <label key={key} className="min-w-0 text-xs text-text-secondary">{key}
                    {typeof value === 'number' ? <input aria-label={label} type="number" className={field} value={value}
                        min={typeof bounds.min === 'number' ? bounds.min : undefined} max={typeof bounds.max === 'number' ? Math.min(bounds.max, Number.MAX_SAFE_INTEGER) : undefined}
                        step={Array.isArray(definition) && definition[0] === 'INT' ? 1 : 'any'} onChange={event => patch(key, Number(event.target.value))} />
                        : choices.length || spec.id === '160' ? <select aria-label={label} className={field} value={value} onChange={event => patch(key, event.target.value)}>
                            {allChoices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                        </select> : <input aria-label={label} className={field} value={value} onChange={event => patch(key, event.target.value)} />}
                </label>;
            })}</div>
        </section>;
    });
    const rows = (manual: boolean) => {
        const entries: PhotoPromptRow[] = manual ? settings.myPrompts : [{ enabled: settings.primaryEnabled, text: options.comfyPrompt || '' }, ...settings.ideas];
        const change = (index: number, patch: Partial<PhotoPromptRow>) => {
            const next = entries.map((row, position) => ({ ...row, ...(position === index ? patch : patch.enabled && (manual || !settings.combineIdeas) ? { enabled: false } : {}) }));
            if (manual) update({ myPrompts: next });
            else {
                const [primary, ...ideas] = next;
                updateOptions({ comfyPrompt: primary.text, comfyMossPhoto: { ...settings, primaryEnabled: primary.enabled, ideas } });
            }
        };
        return <div className="space-y-3">
            {entries.map((row, index) => <div key={index} className={`space-y-2 rounded-md border p-3 ${row.enabled ? 'border-accent' : 'border-border-primary'}`}>
                <div className="flex items-center justify-between gap-2">
                    {toggle(`${manual ? 'Prompt' : 'Idea'} ${index + 1} ON`, row.enabled, enabled => change(index, { enabled }))}
                    {(manual ? entries.length > 1 : index > 0) && <button type="button" className="text-xs text-danger" onClick={() => update(manual
                        ? { myPrompts: entries.filter((_, position) => position !== index) }
                        : { ideas: settings.ideas.filter((_, position) => position !== index - 1) })}>Remove row {index + 1}</button>}
                </div>
                <textarea aria-label={`MOSS PHOTO ${manual ? 'prompt' : 'idea'} ${index + 1}`} className={field} rows={3} value={row.text} onChange={event => change(index, { text: event.target.value })} />
            </div>)}
            <button type="button" className="rounded-md border border-accent px-3 py-2 text-sm text-accent" onClick={() => update(manual
                ? { myPrompts: [...settings.myPrompts, { enabled: false, text: '' }] }
                : { ideas: [...settings.ideas, { enabled: false, text: '' }] })}>+ Add {manual ? 'Prompt' : 'Idea'} Row</button>
        </div>;
    };
    const dimensions = () => {
        try {
            const size = mossPhotoDimensions(settings);
            return <output aria-label="MOSS PHOTO output size" className="block text-sm text-accent">{size.width} x {size.height} ({size.ratio})</output>;
        } catch (error) {
            return <p role="alert" className="text-sm text-danger">{error instanceof Error ? error.message : 'Invalid MOSS PHOTO dimensions.'}</p>;
        }
    };
    return <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-70">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-accent">MOSS PHOTO</h3>
            <button type="button" className="text-xs text-text-secondary hover:text-accent" onClick={() => updateOptions({ comfyMossPhoto: defaultMossPhotoSettings() })}>Restore PHOTO workflow defaults</button>
        </div>
        {toggle('AI prompt writer', settings.aiWriter, aiWriter => update({ aiWriter }))}
        {settings.aiWriter ? details('Your idea', <>
            {select('Idea selection mode', settings.combineIdeas ? 'Combine selected rows' : 'Single Active (Radio)', ['Single Active (Radio)', 'Combine selected rows'], mode => update({
                combineIdeas: mode === 'Combine selected rows',
                ...(mode === 'Single Active (Radio)' ? { primaryEnabled: true, ideas: settings.ideas.map(row => ({ ...row, enabled: false })) } : {}),
            }))}
            {rows(false)}
            {details('AI writer parameters', () => group('writer'))}
        </>, true) : details('Your own prompt (no AI rewriting)', <>
            {toggle('Add look + lens text', settings.addLookText, addLookText => update({ addLookText }))}
            {rows(true)}
            <p className="text-xs text-text-secondary">One active row is used. Disable look + lens text to send your positive prompt exactly as written. The AI writer model is not loaded.</p>
        </>, true)}
        {details('Look, people, quality & extras', <>
            <label className="block text-sm">Look - select one<select aria-label="MOSS PHOTO look" className={field} value={settings.look} onChange={event => update({ look: event.target.value })}>
                {MOSS_PHOTO_LOOKS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            {settings.look === 'F' && details('Your own style', <textarea aria-label="Your own style" className={field} rows={4} value={settings.ownStyle} onChange={event => update({ ownStyle: event.target.value })} />, true)}
            {settings.look === 'E' && details('Aerochrome IR (experimental)', () => group('ir'), true)}
            {settings.look === 'J' && <p className="text-xs text-warning">Polaroid uses its fixed lens look: focal text, sharpening and SeedVR2 detail are bypassed. Their saved settings are retained for other looks.</p>}
            {toggle('Camera flash (any look)', settings.flash, flash => update({ flash }))}
            {toggle('Ordinary people', settings.ordinaryPeople, ordinaryPeople => update({ ordinaryPeople }))}
            {select('People - select one', settings.people, ['A', 'B', 'C', 'D'], people => update({ people }))}
            <p className="text-xs text-text-secondary">A: Caucasian / B: Asian / C: As in my idea / D: No people. Ordinary people adds realistic average-face/body wording independently.</p>
            {numeric('Quality steps (25 quick / 50 best)', settings.steps, steps => update({ steps }), 1, 50)}
            {toggle('Second pass', settings.secondPass, secondPass => update({ secondPass }))}
            {settings.secondPass && details('Second pass parameters', () => group('second'), true)}
            {toggle('Face fix', settings.faceFix, faceFix => update({ faceFix }))}
            {settings.faceFix && details('Face fix parameters', () => group('face'), true)}
            {toggle('Hand fix', settings.handFix, handFix => update({ handFix }))}
            {settings.handFix && details('Hand fix parameters', () => group('hand'), true)}
            {settings.look !== 'J' && toggle('Detail (SeedVR2)', settings.detail, detail => update({ detail }))}
            {settings.detail && settings.look !== 'J' && details('SeedVR2 detail parameters', () => <><p className="text-xs text-warning">First use loads a 3.19 GB model and may be slow. Reduce resolution or disable Detail if VRAM is insufficient.</p>{group('detail')}</>, true)}
            {toggle('JPEG crunch', settings.jpeg, jpeg => update({ jpeg }))}
            {(settings.jpeg || settings.look === 'C') && details('JPEG crunch parameters', () => group('jpeg'), true)}
            {settings.look === 'C' && <p className="text-xs text-text-secondary">Cheap iPhone applies its automatic JPEG crunch when always_on_for_iphone is enabled.</p>}
        </>, true)}
        {details('Image size + focal length', () => <>
            {select('Aspect ratio', settings.ratio, MOSS_PHOTO_RATIOS, ratio => update({ ratio }))}
            {settings.ratio !== 'Custom Resolution' && <label className="block text-sm">Size<select aria-label="MOSS PHOTO size" className={field} value={settings.sizeIndex} onChange={event => update({ sizeIndex: Number(event.target.value) })}>
                {MOSS_PHOTO_LONG_SIDES.map((side, index) => <option key={side} value={index}>{side} px long side</option>)}
            </select></label>}
            {(settings.ratio === 'Custom Ratio' || settings.ratio === 'Custom Resolution') && details(settings.ratio, <div className="grid grid-cols-2 gap-3">
                {(settings.ratio === 'Custom Ratio' ? settings.customRatio : settings.customResolution).map((value, index) => <React.Fragment key={index}>{numeric(index === 0 ? 'Custom width' : 'Custom height', value, next => {
                    const current = settings.ratio === 'Custom Ratio' ? settings.customRatio : settings.customResolution;
                    const pair: [number, number] = [current[0], current[1]];
                    pair[index] = next;
                    update(settings.ratio === 'Custom Ratio' ? { customRatio: pair } : { customResolution: pair });
                }, settings.ratio === 'Custom Ratio' ? 1 : 64, settings.ratio === 'Custom Ratio' ? 99 : 8192)}</React.Fragment>)}
            </div>, true)}
            <div className="grid gap-3 sm:grid-cols-2">
                {numeric('Batch size', settings.batchSize, batchSize => update({ batchSize }), 1, 64)}
                {numeric('Snap to', settings.snapTo, snapTo => update({ snapTo }), 8, 64, 8)}
            </div>
            {toggle('Swap width / height', settings.swap, swap => update({ swap }))}
            {settings.look !== 'J' && <>
                <label className="block text-sm">Focal length<select aria-label="Focal length" className={field} value={settings.focal} onChange={event => update({ focal: event.target.value })}>
                    {MOSS_PHOTO_FOCALS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select></label>
                {settings.focal !== 'Off' && details('Lens options', <>
                    {toggle('Auto ratio from lens', settings.autoRatio, autoRatio => update({ autoRatio }))}
                    {settings.focal === '8mm' && select('Fisheye type', settings.fisheye, ['Full-frame', 'Circular'], fisheye => update({ fisheye }))}
                    {select('Lens detail', settings.lensDetail, ['Full description', 'Short tag'], lensDetail => update({ lensDetail }))}
                </>, true)}
            </>}
            {dimensions()}
        </>)}
        {details('Models & LoRAs', () => group('models'))}
        {details('Sampling & finishing', () => <>{group('sampler')}{group('finish')}</>)}
        {details('Negative prompt, seed & output', () => <>
            <label className="block text-sm">Negative Prompt<textarea className={field} rows={4} value={settings.negativePrompt} onChange={event => update({ negativePrompt: event.target.value })} /></label>
            <label className="block text-sm">Seed<input aria-label="MOSS PHOTO seed" className={field} type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder="Random" value={options.comfySeed ?? ''} onChange={event => updateOptions({ comfySeed: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
            {select('Seed control', options.comfySeedControl || 'randomize', ['randomize', 'fixed', 'increment', 'decrement'], value => {
                if (value === 'randomize' || value === 'fixed' || value === 'increment' || value === 'decrement') updateOptions({ comfySeedControl: value });
            })}
            {(options.comfySeedControl === 'increment' || options.comfySeedControl === 'decrement') && numeric('Seed increment', options.comfySeedIncrement ?? 1, comfySeedIncrement => updateOptions({ comfySeedIncrement }), 1, 1000000)}
            <label className="block text-sm">Filename prefix<input className={field} value={settings.filenamePrefix} onChange={event => update({ filenamePrefix: event.target.value })} /></label>
        </>)}
    </fieldset>;
};
