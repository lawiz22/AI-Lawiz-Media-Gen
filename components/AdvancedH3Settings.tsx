import React from 'react';
import { ADVANCED_NODE_SPECS, ADVANCED_LTX_DECODE_8GB, ADVANCED_LTX_DECODE_DIRECTOR, advancedParameterVisible, type AdvancedH3Settings as Settings, type AdvancedValue } from '../services/minimaxH3AdvancedWorkflow';
import { h3Choices, h3Input, isRecord, type H3ObjectInfo, type MinimaxH3Options } from '../services/minimaxH3Workflow';

const field = 'mt-1 w-full rounded-lg border border-border-primary bg-bg-primary p-2 text-sm text-text-primary';
const accordion = 'rounded-xl border border-border-primary bg-bg-secondary p-4';
export const AdvancedH3Settings: React.FC<{
    settings: Settings;
    options: MinimaxH3Options;
    info: H3ObjectInfo | null;
    section?: 'switches' | 'parameters';
    onChange: (settings: Settings) => void;
    onOptionsChange: (patch: Partial<MinimaxH3Options>) => void;
}> = ({ settings, options, info, section = 'parameters', onChange, onOptionsChange }) => {
    const [opened, setOpened] = React.useState<Record<string, boolean>>({});
    const videoInput = settings.inputMode === 'video';
    const h3Needed = !videoInput || settings.latentUpscale;
    const patch = (value: Partial<Settings>) => onChange({ ...settings, ...value });
    const toggle = (label: string, checked: boolean, change: (checked: boolean) => void) =>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-cyan-400" checked={checked} onChange={event => change(event.target.checked)} />{label}</label>;
    const visible = (id: string) => {
        if (id === 'scheduler' && videoInput) return false;
        if (id === 'attention') return h3Needed && settings.comfyAttention;
        if (id === 'clear') return settings.vramClear;
        if (id === 'ltx-attention') return settings.ltxAttention;
        if (id === 'ltx-lora') return settings.ltxLora;
        if (id === 'ltx-decode') return settings.ltxDecodeMode !== 'standard';
        if (id === 'interpolate') return settings.interpolation;
        if (id.startsWith('noise-')) return !videoInput && !!settings.imageNoise[id.slice(6)];
        return true;
    };
    const group = (name: string) => ADVANCED_NODE_SPECS.filter(spec => spec.group === name && visible(spec.id)).map(spec => {
        const values: Record<string, AdvancedValue> | undefined = settings.nodes[spec.id];
        if (!values) return <p key={spec.id} role="alert">Missing {spec.title} settings. Reset Advanced settings.</p>;
        const update = (key: string, value: AdvancedValue) => patch({ nodes: { ...settings.nodes, [spec.id]: { ...values, [key]: value } } });
        return <section key={spec.id} className="space-y-3 border-t border-border-primary pt-3">
            <h5 className="text-sm font-semibold text-cyan-200">{spec.title}</h5>
            {spec.id === 'ltx-decode' && <div className="space-y-2">
                <p className="text-xs text-text-secondary">LTX Director uses 256 / 64 spatial tiles and 64 / 4 temporal chunks. The low-VRAM preset uses temporal 16: smaller chunks, more passes, potentially slower. Neither is a measured speed/VRAM guarantee for this graph.</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-lg border border-cyan-400/50 px-3 py-2 text-xs text-cyan-200" onClick={() => patch({ ltxDecodeMode: 'tiled', nodes: { ...settings.nodes, 'ltx-decode': { ...ADVANCED_LTX_DECODE_DIRECTOR } } })}>Use LTX Director decode settings</button>
                    <button type="button" className="rounded-lg border border-border-primary px-3 py-2 text-xs" onClick={() => patch({ ltxDecodeMode: 'tiled', nodes: { ...settings.nodes, 'ltx-decode': { ...ADVANCED_LTX_DECODE_8GB } } })}>Use low-VRAM decode settings (more passes)</button>
                </div>
            </div>}
            {spec.id.startsWith('noise-') && toggle('Randomize noise seed', !!settings.randomizeImageNoise?.[spec.id.slice(6)], enabled => patch({ randomizeImageNoise: { ...settings.randomizeImageNoise, [spec.id.slice(6)]: enabled } }))}
            <div className="grid gap-3 sm:grid-cols-2">{Object.entries(values).filter(([key]) => advancedParameterVisible(values, key)).map(([key, value]) => {
                const label = `${spec.title} / ${key}`;
                const schema = h3Input(info, spec.classType, key, values);
                const config = Array.isArray(schema) && isRecord(schema[1]) ? schema[1] : {};
                const choices = h3Choices(info, spec.classType, key);
                const modes = key === 'mode' ? ['scale by multiplier', 'target dimensions', 'megapixels'] : key === 'resize_type' ? ['scale by multiplier', 'target dimensions'] : choices;
                const selection = modes.length > 0 || /(?:_name|_dtype)$/.test(key) || ['device', 'precision', 'attention', 'scheduler'].includes(key);
                if (typeof value === 'boolean') return <React.Fragment key={key}>{toggle(label, value, next => update(key, next))}</React.Fragment>;
                return <label key={key} className={`min-w-0 text-xs text-text-secondary ${key === 'text' ? 'sm:col-span-2' : ''}`}>{key}
                    {typeof value === 'number' ? <input aria-label={label} type="number" className={field} value={value}
                        min={typeof config.min === 'number' ? config.min : undefined} max={typeof config.max === 'number' ? Math.min(config.max, Number.MAX_SAFE_INTEGER) : undefined}
                        step={Array.isArray(schema) && schema[0] === 'INT' ? 1 : typeof config.step === 'number' ? config.step : 'any'} onChange={event => update(key, Number(event.target.value))} />
                        : selection ? <select aria-label={label} className={field} value={value} onChange={event => update(key, event.target.value)}>
                            {!modes.includes(value) && <option value={value}>{value || 'Select a file'}</option>}{modes.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                        </select> : <textarea aria-label={label} className={field} rows={key === 'text' ? 3 : 1} value={value} onChange={event => update(key, event.target.value)} />}
                </label>;
            })}</div>
        </section>;
    });
    const parameters = (id: string, title: string, content: () => React.ReactNode) => <details key={id} className={accordion} open={!!opened[id]} onToggle={event => {
        const open = event.currentTarget.open;
        setOpened(current => current[id] === open ? current : { ...current, [id]: open });
    }}>
        <summary className="cursor-pointer font-semibold">{title}</summary>
        {opened[id] && <div className="mt-3 space-y-4">{content()}</div>}
    </details>;
    if (section === 'switches') return <details className={`${accordion} border-cyan-400/50`} open>
        <summary className="cursor-pointer font-semibold text-cyan-300">Advanced mode & switches</summary>
        <div className="mt-3 space-y-3">
            <label className="block max-w-lg text-sm">Input<select aria-label="Advanced input" className={field} value={settings.inputMode ?? 'generate'} onChange={event => onOptionsChange({
                advanced: { ...settings, inputMode: event.target.value === 'video' ? 'video' : 'generate' },
                ...(event.target.value === 'video' ? { originalAudioId: undefined, forceOriginalAudio: false } : {}),
            })}>
                <option value="generate">Generate H3 first pass</option><option value="video">Finish an existing video · no H3 first pass</option>
            </select></label>
            <label className="block max-w-lg text-sm">Stage order<select aria-label="Advanced stage order" className={field} value={settings.stageOrder ?? 'latent-first'} onChange={event => patch({ stageOrder: event.target.value === 'ltx-first' ? 'ltx-first' : 'latent-first' })}>
                <option value="ltx-first">LTX Refine → H3 latent upscale</option><option value="latent-first">H3 latent upscale → LTX Refine</option>
            </select></label>
            <p className="text-xs text-text-muted">Order applies when both stages are enabled. LTX-first re-encodes refined frames with the H3 VAE before H3 latent upscale; it is not a direct transfer of LTX latents.</p>
            {!videoInput && <><label className="block max-w-lg text-sm">Mode<select aria-label="Advanced mode" className={field} value={settings.mode} onChange={event => patch({ mode: event.target.value === 'ref2v' ? 'ref2v' : 'fl2v' })}>
                <option value="fl2v">FL2V · First / last frame (default)</option><option value="ref2v">REF2V · Multimodal references</option>
            </select></label>
            <p className="text-xs text-text-secondary">{settings.mode === 'fl2v' ? 'Image 1 = first frame; Image 2 = last frame. Missing frames remain optional. Switch to REF2V for other conditioning references.' : 'Up to 3 images, 1 video and 2 standalone audios.'} Only enabled features show their settings below; hidden settings are retained.</p></>}
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {toggle('H3 latent upscale', settings.latentUpscale, latentUpscale => patch({ latentUpscale }))}
                {toggle('LTX Refine', settings.ltxRefine, ltxRefine => patch({ ltxRefine }))}
                {toggle('RTX upscaler · FINAL', settings.rtxUpscale, rtxUpscale => patch({ rtxUpscale }))}
                {h3Needed && toggle('Turbo LoRA chain', options.useLoras, useLoras => onOptionsChange({ useLoras }))}
                {h3Needed && toggle('ComfyAttn', settings.comfyAttention, comfyAttention => patch({ comfyAttention }))}
                {h3Needed && toggle('Boost · SolAttn / sigma shift / chunks', settings.boost, boost => patch({ boost }))}
                {toggle('VRAM Clear', settings.vramClear, vramClear => patch({ vramClear }))}
                {h3Needed && toggle('Realtime preview', options.preview, preview => onOptionsChange({ preview }))}
                {toggle('Interpolation', settings.interpolation, interpolation => patch({ interpolation }))}
                {!videoInput && (['1', '2', '3'] as const).map(slot => <React.Fragment key={slot}>{toggle(`Add noise to Image ${slot}`, !!settings.imageNoise[slot], enabled => patch({ imageNoise: { ...settings.imageNoise, [slot]: enabled } }))}</React.Fragment>)}
            </div>
            <p className="text-xs text-cyan-200">{videoInput ? 'Source video' : 'H3 first pass'} → {settings.stageOrder === 'ltx-first' ? 'interpolation → LTX Refine → H3 latent upscale' : 'H3 latent upscale → interpolation → LTX Refine'} → RTX → FINAL save. Disabled stages are bypassed; RTX is always last.</p>
        </div>
    </details>;
    return <div className="space-y-4" aria-label="Advanced optional settings">
        {parameters('base', videoInput ? 'Attention & VRAM' : 'Base scheduler, attention & VRAM', () => group('base'))}
        {h3Needed && settings.boost && parameters('boost', 'Boost settings', () => group('boost'))}
        {settings.latentUpscale && parameters('latent', 'H3 latent upscale · all options', () => group('latent'))}
        {settings.ltxRefine && parameters('ltx', 'LTX Refine · all options', () => <>
            <div className="flex flex-wrap gap-4">
                {toggle('LTX attention patch', settings.ltxAttention, ltxAttention => patch({ ltxAttention }))}
                {toggle('LTX refine LoRA', settings.ltxLora, ltxLora => patch({ ltxLora }))}
            </div>
            <p className="text-xs text-text-muted">Refinement uses incoming frames/FPS and {videoInput ? 'passes the optional source soundtrack through unchanged.' : 'retains source audio through the LTX audio VAE.'}</p>
            <p className="text-xs text-amber-200">LTX also upscales its own latents by 2x. That is roughly 4x the pixels to decode compared with the LTX input, before final RTX. Interpolation can increase the frame count too.</p>
            <label className="block text-sm">LTX decode mode<select aria-label="LTX decode mode" className={field} value={settings.ltxDecodeMode ?? 'tiled'} onChange={event => patch({ ltxDecodeMode: event.target.value === 'standard' ? 'standard' : 'tiled' })}>
                <option value="tiled">Tiled · smaller chunks</option><option value="standard">Standard · higher peak VRAM / OOM risk</option>
            </select></label>
            {settings.ltxDecodeMode === 'standard' && <p className="text-xs text-amber-300">Standard uses VAEDecode, like Director's Standard mode. It can exceed 8 GB at this graph's output resolution; speed is not guaranteed. Tiled settings are retained.</p>}
            {group('ltx')}
        </>)}
        {settings.rtxUpscale && parameters('rtx', 'RTX · final upscale options', () => group('rtx'))}
        {(settings.interpolation || (!videoInput && Object.values(settings.imageNoise).some(Boolean))) && parameters('extras', videoInput ? 'Interpolation' : 'Interpolation & image noise', () => group('extras'))}
    </div>;
};
