import { h3Resolution, isRecord, validateMinimaxH3Readiness, type H3ObjectInfo, type H3Workflow } from './minimaxH3Workflow';
import { audioPromptRequirements, type AudioLyrics, type VideoPromptDraft, type VideoReference } from './videoPromptService';
import type { AudioSelection } from './audioClipService';

type Value = string | number | boolean;
export interface AudioSyncLora { enabled: boolean; name: string; strength: number }
export const defaultAudioSyncLoras = (): AudioSyncLora[] => Array.from({ length: 4 }, () => ({ enabled: false, name: '', strength: 1 }));
export interface AudioSyncSettings {
    enhancePrompt: boolean;
    textToVideo: boolean;
    randomizeSeed: boolean;
    loras?: AudioSyncLora[];
    nodes: Record<string, Record<string, Value>>;
}
export interface AudioSyncDraft {
    prompt: string;
    image: File | null;
    audio: File | null;
    audioDuration?: number;
    audioOriginal?: File;
    audioSelection?: AudioSelection;
    lyrics?: AudioLyrics;
}
interface SavedInput { name: string; type: string; lastModified?: number }
export interface AudioSyncSavedSetup {
    version: 1;
    prompt: string;
    settings: AudioSyncSettings;
    image?: SavedInput;
    audio?: SavedInput;
    audioOriginal?: SavedInput;
    audioSelection?: AudioSelection;
    lyrics?: AudioLyrics;
    finalPrompt?: string;
    promptIsFinal?: boolean;
    promptId?: string;
    workflow?: H3Workflow;
}
const node = (class_type: string, inputs: Record<string, unknown>) => ({ class_type, inputs });
const id = (number: number) => `398:${number}`;
const link = (number: number, output = 0): [string, number] => [id(number), output];

export const AUDIO_SYNC_TEMPLATE: H3Workflow = {
    '75': node('SaveVideo', { filename_prefix: 'video/LTX-2.5_i2v', format: 'auto', 'format.codec': 'auto', codec: 'auto', 'video-preview': '', video: link(370) }),
    '395': node('LoadImage', { image: '' }),
    '403': node('ResolutionSelector', { aspect_ratio: '4:3 (Standard)', megapixels: 0.4, multiple: 32 }),
    '405': node('LoadAudio', { audio: '' }),
    [id(393)]: node('CLIPLoader', { clip_name: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors', type: 'ltxv', device: 'default' }),
    [id(380)]: node('TextGenerateLTX2Prompt', { prompt: link(376), max_length: 600, sampling_mode: 'on', 'sampling_mode.temperature': 0.7,
        'sampling_mode.top_k': 64, 'sampling_mode.top_p': 0.95, 'sampling_mode.min_p': 0.05, 'sampling_mode.repetition_penalty': 1.15,
        'sampling_mode.seed': 0, 'sampling_mode.presence_penalty': 0, thinking: false, use_default_template: true, mtp: 'auto', clip: link(393), image: link(350) }),
    [id(383)]: node('PrimitiveBoolean', { value: true }),
    [id(364)]: node('CLIPTextEncode', { text: link(382), clip: link(387) }),
    [id(376)]: node('PrimitiveStringMultiline', { value: '' }),
    [id(382)]: node('ComfySwitchNode', { switch: link(383), on_false: link(376), on_true: link(380) }),
    [id(384)]: node('UNETLoader', { unet_name: 'ltx-2.5-22b-distilled-transformer-nvfp4.safetensors', weight_dtype: 'default' }),
    [id(381)]: node('PreviewAny', { source: link(382) }),
    [id(362)]: node('PrimitiveFloat', { value: 13.2000732421875 }),
    [id(363)]: node('PrimitiveBoolean', { value: false }),
    [id(365)]: node('LTXVConditioning', { frame_rate: link(359), positive: link(364), negative: link(373) }),
    [id(385)]: node('VAELoader', { vae_name: 'ltx-2.5-video-vae-bf16.safetensors' }),
    [id(386)]: node('VAELoader', { vae_name: 'ltx-2.5-audio-vae-bf16.safetensors' }),
    [id(372)]: node('PrimitiveInt', { value: ['403', 0] }),
    [id(373)]: node('CLIPTextEncode', { text: 'pc game, console game, video game, cartoon, childish, ugly', clip: link(387) }),
    [id(387)]: node('CLIPLoader', { clip_name: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors', type: 'ltxv', device: 'default' }),
    [id(360)]: node('PrimitiveInt', { value: ['403', 1] }),
    [id(352)]: node('KSamplerSelect', { sampler_name: 'euler_ancestral' }),
    [id(339)]: node('RandomNoise', { noise_seed: 980081529686318 }),
    [id(397)]: node('ManualSigmas', { sigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0' }),
    [id(361)]: node('PrimitiveInt', { value: 24 }),
    [id(371)]: node('LatentUpscaleModelLoader', { model_name: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors' }),
    [id(388)]: node('LTXVDualCFGGuider', { video_cfg: 1, audio_cfg: 1, model: link(384), positive: link(365), negative: link(365, 1) }),
    [id(344)]: node('SamplerCustomAdvanced', { noise: link(339), guider: link(388), sampler: link(352), sigmas: link(397), latent_image: link(377) }),
    [id(357)]: node('LTXVImgToVideoInplace', { strength: 0.7, bypass: link(363), vae: link(385), image: link(350), latent: link(356) }),
    [id(367)]: node('LTXVSeparateAVLatent', { av_latent: link(344) }),
    [id(377)]: node('LTXVConcatAVLatent', { video_latent: link(357), audio_latent: link(704) }),
    [id(351)]: node('ResizeImageMaskNode', { resize_type: 'scale longer dimension', 'resize_type.longer_size': 1536, scale_method: 'lanczos', input: ['395', 0] }),
    [id(353)]: node('ComfyMathExpression', { expression: 'a/2', 'values.a': link(372) }),
    [id(355)]: node('ComfyMathExpression', { expression: 'a/2', 'values.a': link(360) }),
    [id(350)]: node('LTXVPreprocess', { img_compression: 18, image: link(351) }),
    [id(356)]: node('EmptyLTXVLatentVideo', { width: link(353, 1), height: link(355, 1), length: link(378, 1), batch_size: 1 }),
    [id(348)]: node('LTXVLatentUpsampler', { samples: link(367), upscale_model: link(371), vae: link(385) }),
    [id(349)]: node('LTXVImgToVideoInplace', { strength: 1, bypass: link(363), vae: link(385), image: link(350), latent: link(348) }),
    [id(359)]: node('ComfyMathExpression', { expression: 'a', 'values.a': link(361) }),
    [id(378)]: node('ComfyMathExpression', { expression: 'a * b + 1', 'values.a': link(362), 'values.b': link(361) }),
    [id(338)]: node('RandomNoise', { noise_seed: 42 }),
    [id(340)]: node('LTXVConcatAVLatent', { video_latent: link(349), audio_latent: link(704) }),
    [id(396)]: node('ManualSigmas', { sigmas: '0.85, 0.7250, 0.4219, 0.0' }),
    [id(391)]: node('LTXVDualCFGGuider', { video_cfg: 1, audio_cfg: 1, model: link(384), positive: link(365), negative: link(365, 1) }),
    [id(341)]: node('KSamplerSelect', { sampler_name: 'euler_ancestral' }),
    [id(368)]: node('SamplerCustomAdvanced', { noise: link(338), guider: link(391), sampler: link(341), sigmas: link(396), latent_image: link(340) }),
    [id(369)]: node('LTXVSeparateAVLatent', { av_latent: link(368) }),
    [id(374)]: node('VAEDecodeTiled', { tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 16, samples: link(369), vae: link(385) }),
    [id(358)]: node('LTXVAudioVAEDecode', { samples: link(369, 1), audio_vae: link(386) }),
    [id(370)]: node('CreateVideo', { fps: link(359), bit_depth: 8, color_space: 'sRGB', codec: 'none', images: link(374), audio: link(358) }),
    [id(702)]: node('LTXVAudioVAEEncode', { audio: link(707), audio_vae: link(386) }),
    [id(703)]: node('SolidMask', { value: 0, width: link(372), height: link(360) }),
    [id(704)]: node('SetLatentNoiseMask', { samples: link(702), mask: link(703) }),
    [id(706)]: node('PrimitiveFloat', { value: link(709) }),
    [id(707)]: node('TrimAudioDuration', { start_index: 0, duration: link(706), audio: ['405', 0] }),
    [id(709)]: node('ComfyNumberConvert', { value: 13.2000732421875 }),
};

const hiddenNodes = new Set(['395', '405', id(376), id(383), id(363), id(709), id(703)]);
export const defaultAudioSyncSettings = (): AudioSyncSettings => ({
    enhancePrompt: true, textToVideo: false, randomizeSeed: true,
    loras: defaultAudioSyncLoras(),
    nodes: Object.fromEntries(Object.entries(AUDIO_SYNC_TEMPLATE).filter(([key]) => !hiddenNodes.has(key)).map(([key, spec]) => [
        key, Object.fromEntries(Object.entries(spec.inputs).filter((entry): entry is [string, Value] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
            .filter(([name]) =>
                name !== 'video-preview' && name !== 'codec' && name !== 'format.codec' && name !== 'expression')),
    ])),
});

export const audioSyncNumber = (settings: AudioSyncSettings, key: number, input = 'value'): number => {
    const value = settings.nodes[id(key)]?.[input];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`LTX Audio-Sync requires a finite number for ${key}.${input}.`);
    return value;
};
export const audioSyncResolution = (settings: AudioSyncSettings) => {
    const { aspect_ratio, megapixels, multiple } = settings.nodes['403'];
    if (typeof aspect_ratio !== 'string' || typeof megapixels !== 'number' || typeof multiple !== 'number') throw new Error('Complete the Audio-Sync resolution settings.');
    return h3Resolution({ aspect: aspect_ratio, megapixels, multiple });
};

export const audioSyncReference = (draft: AudioSyncDraft): VideoReference | null => draft.audio ? {
    id: 'ltx-audio-sync-audio', kind: 'audio', slot: 1, note: '', file: draft.audio,
    original: draft.audioOriginal || draft.audio, audioSelection: draft.audioSelection, lyrics: draft.lyrics,
} : null;

export const audioSyncInputPrompt = (draft: AudioSyncDraft): string => {
    if (!draft.lyrics?.enabled) return draft.prompt;
    const reference = audioSyncReference(draft);
    if (!reference?.audioSelection) throw new Error('Apply the Audio-Sync passage before using lyrics or spoken words.');
    const requirements = audioPromptRequirements([reference]);
    return `${draft.prompt}\n\n${requirements}`;
};

export const applyAudioSyncPassage = (draft: AudioSyncDraft, settings: AudioSyncSettings, file: File, selection: AudioSelection) => {
    const duration = selection.end - selection.start;
    if (!draft.audio || !file.size || !file.type.startsWith('audio/') || !Number.isFinite(selection.start) || selection.start < 0
        || !Number.isFinite(duration) || duration <= 0) throw new Error('Choose a valid, non-empty Audio-Sync passage.');
    return {
        draft: { ...draft, audio: file, audioOriginal: draft.audioOriginal || draft.audio, audioSelection: { ...selection }, audioDuration: duration },
        settings: { ...settings, nodes: { ...settings.nodes,
            [id(362)]: { value: duration }, [id(707)]: { ...settings.nodes[id(707)], start_index: 0 } } },
    };
};

export const validateAudioSyncDraft = (draft: AudioSyncDraft, settings: AudioSyncSettings): void => {
    if (!draft.prompt.trim()) throw new Error('Enter an LTX Audio-Sync prompt or send one from Video Prompt Generator.');
    if (!draft.audio?.size || !draft.audio.type.startsWith('audio/')) throw new Error('Choose a non-empty soundtrack audio file.');
    if (!settings.textToVideo && (!draft.image?.size || !draft.image.type.startsWith('image/'))) throw new Error('Choose a first-frame image or enable Text to video.');
    const duration = audioSyncNumber(settings, 362), start = audioSyncNumber(settings, 707, 'start_index');
    if (duration <= 0 || !Number.isFinite(start) || start < 0) throw new Error('Audio start must be non-negative and duration must be greater than zero.');
    if (draft.audioDuration !== undefined && start + duration > draft.audioDuration + 0.05) throw new Error('The requested passage exceeds the selected audio. Reduce its start/duration or use the remaining audio duration.');
    if (draft.audioSelection && (!draft.audioOriginal?.size || !Number.isFinite(draft.audioSelection.start) || draft.audioSelection.start < 0
        || !Number.isFinite(draft.audioSelection.end) || draft.audioSelection.end <= draft.audioSelection.start)) {
        throw new Error('The applied Audio-Sync passage is invalid or missing its full original. Choose the original audio and apply the passage again.');
    }
    if (draft.audioSelection && (start !== 0 || Math.abs(duration - (draft.audioSelection.end - draft.audioSelection.start)) > 0.000001)) {
        throw new Error('Apply the desired audio passage again to synchronize its WAV, duration and words. Applied WAV passages must start at zero.');
    }
    audioSyncInputPrompt(draft);
};

export const buildAudioSyncWorkflow = (
    settings: AudioSyncSettings, prompt: string, files: { image?: string; audio: string }, info?: H3ObjectInfo,
): H3Workflow => {
    if (!prompt.trim() || !files.audio.trim() || !settings.textToVideo && !files.image?.trim()) throw new Error('LTX Audio-Sync requires a prompt, audio and a first-frame image (unless Text to video is enabled).');
    const defaults = defaultAudioSyncSettings();
    const workflow = structuredClone(AUDIO_SYNC_TEMPLATE);
    for (const [key, inputs] of Object.entries(settings.nodes)) {
        if (!defaults.nodes[key]) throw new Error(`Unknown Audio-Sync settings node ${key}.`);
        for (const [name, value] of Object.entries(inputs)) {
            const initial = defaults.nodes[key][name];
            if (initial === undefined || typeof initial !== typeof value || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid Audio-Sync setting ${key}.${name}.`);
            workflow[key].inputs[name] = value;
        }
    }
    audioSyncResolution(settings);
    const duration = audioSyncNumber(settings, 362), fps = audioSyncNumber(settings, 361);
    if (duration <= 0 || !Number.isInteger(fps) || fps < 1 || duration * fps + 1 > 16384) throw new Error('Use a positive duration and whole-number FPS within the LTX 16384-frame limit.');
    for (const key of [339, 338]) {
        const seed = audioSyncNumber(settings, key, 'noise_seed');
        if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('LTX seeds must be non-negative safe integers.');
    }
    for (const key of [397, 396]) {
        const sigmas = String(workflow[id(key)].inputs.sigmas).split(',').map(value => value.trim());
        const values = sigmas.map(Number);
        if (sigmas.some(value => !value) || values.length < 2 || values.some((value, index) => !Number.isFinite(value) || value < 0 || value > 1 || index > 0 && value > values[index - 1])
            || values.at(-1) !== 0) throw new Error('Manual sigmas must be a descending comma-separated schedule from at most 1 to 0.');
    }
    const tile = workflow[id(374)].inputs;
    if (Number(tile.overlap) >= Number(tile.tile_size) || Number(tile.temporal_overlap) >= Number(tile.temporal_size)) throw new Error('VAE overlaps must be smaller than their tile sizes.');
    if (audioSyncNumber(settings, 707, 'start_index') < 0 || !String(workflow['75'].inputs.filename_prefix).trim()) throw new Error('Use a non-negative audio start and a non-empty output filename prefix.');
    workflow['395'].inputs.image = files.image || '';
    workflow['405'].inputs.audio = files.audio;
    workflow[id(376)].inputs.value = prompt;
    workflow[id(709)].inputs.value = duration;
    workflow[id(364)].inputs.text = settings.enhancePrompt ? link(380) : link(376);
    workflow[id(381)].inputs.source = settings.enhancePrompt ? link(380) : link(376);
    delete workflow[id(382)];
    delete workflow[id(383)];
    delete workflow[id(363)];
    for (const key of [357, 349]) workflow[id(key)].inputs.bypass = false;
    if (settings.textToVideo) {
        workflow[id(377)].inputs.video_latent = link(356);
        workflow[id(340)].inputs.video_latent = link(348);
        delete workflow[id(357)];
        delete workflow[id(349)];
    }
    if (!files.image) delete workflow[id(380)].inputs.image;
    if (!settings.enhancePrompt) {
        delete workflow[id(380)];
        delete workflow[id(393)];
    }
    const model = workflow[id(384)], clip = workflow[id(387)];
    if (String(model.inputs.unet_name).toLowerCase().endsWith('.gguf')) {
        model.class_type = 'UnetLoaderGGUF'; delete model.inputs.weight_dtype;
    }
    if (String(clip.inputs.clip_name).toLowerCase().endsWith('.gguf')) {
        clip.class_type = 'CLIPLoaderGGUF'; delete clip.inputs.device;
    }
    const loras = settings.loras ?? [];
    if (!Array.isArray(loras) || loras.length > 4) throw new Error('LTX Audio-Sync supports at most four LoRAs.');
    let loraModel: [string, number] = link(384);
    loras.forEach((lora, index) => {
        if (!lora || typeof lora.enabled !== 'boolean') throw new Error(`Invalid Audio-Sync LoRA slot ${index + 1}.`);
        if (!lora.enabled) return;
        if (typeof lora.name !== 'string' || !lora.name.trim()) throw new Error(`Select a file for enabled Audio-Sync LoRA ${index + 1}.`);
        if (typeof lora.strength !== 'number' || !Number.isFinite(lora.strength) || lora.strength < -20 || lora.strength > 20) {
            throw new Error(`Audio-Sync LoRA ${index + 1} strength must be a finite number between -20 and 20.`);
        }
        const key = `audio-sync-lora-${index + 1}`;
        workflow[key] = node('LoraLoaderModelOnly', { model: loraModel, lora_name: lora.name, strength_model: lora.strength });
        loraModel = [key, 0];
    });
    for (const key of [388, 391]) workflow[id(key)].inputs.model = loraModel;
    const needed = new Set<string>();
    const visit = (key: string) => {
        if (needed.has(key)) return;
        if (!workflow[key]) throw new Error(`Missing Audio-Sync workflow link ${key}.`);
        needed.add(key);
        for (const input of Object.values(workflow[key].inputs)) if (Array.isArray(input) && typeof input[0] === 'string') visit(input[0]);
    };
    visit('75'); visit(id(381));
    const pruned = Object.fromEntries(Object.entries(workflow).filter(([key]) => needed.has(key)));
    if (info) validateMinimaxH3Readiness(pruned, info);
    return pruned;
};

export const transferAudioSyncPrompt = (draft: VideoPromptDraft): { draft: AudioSyncDraft; settings: AudioSyncSettings; notice: string } => {
    const images = draft.references.filter(ref => ref.kind === 'image'), audios = draft.references.filter(ref => ref.kind === 'audio');
    if (draft.template !== 'generation') throw new Error('LTX Audio-Sync accepts the video generation template, not character replacement.');
    if (images.length > 1 || audios.length > 1 || draft.references.some(ref => ref.kind === 'video')) throw new Error('LTX Audio-Sync accepts one first-frame image and one soundtrack, without video references. Remove extra references before transferring.');
    const settings = structuredClone(draft.audioSyncSettings || defaultAudioSyncSettings());
    settings.enhancePrompt = false;
    const aspect = /^(\d+:\d+)/.exec(draft.aspect)?.[1];
    const choices = ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)'];
    const selected = choices.find(value => value.startsWith(`${aspect} `));
    if (!selected) throw new Error('Choose an aspect ratio supported by LTX Audio-Sync.');
    settings.nodes['403'].aspect_ratio = selected;
    settings.nodes[id(362)].value = draft.duration;
    settings.nodes[id(707)].start_index = 0;
    const audio = audios[0];
    return {
        draft: { prompt: draft.result.trim(), image: images[0]?.file || null, audio: audio?.file || null,
            ...(audio?.audioSelection ? { audioOriginal: audio.original, audioSelection: { ...audio.audioSelection },
                audioDuration: audio.audioSelection.end - audio.audioSelection.start } : {}),
            ...(audio?.lyrics ? { lyrics: { ...audio.lyrics } } : {}) },
        settings,
        notice: 'Prompt and edited first-frame/audio references copied to LTX 2.5 Audio-Sync. Qwen enhancement was disabled to preserve the generated prompt; you can re-enable it explicitly. Model settings are retained. Select any missing input and check the audio passage duration before generating.',
    };
};

export const audioSyncPromptText = (output: unknown): string => {
    if (!isRecord(output)) return '';
    for (const value of [output.text, output.string, output.value]) {
        if (typeof value === 'string') return value.trim();
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.join('\n').trim();
    }
    return '';
};
