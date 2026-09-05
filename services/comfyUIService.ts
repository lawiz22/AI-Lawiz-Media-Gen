import type { GenerationOptions } from "../types";
import {
    COMFYUI_SD15_WORKFLOW_TEMPLATE,
    COMFYUI_WORKFLOW_TEMPLATE,
    COMFYUI_WAN22_WORKFLOW_TEMPLATE,
    COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE,
    COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE,
    COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE,
    COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE,
    COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE,
    COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE,
    COMFYUI_QWEN_WORKFLOW_TEMPLATE,
    COMFYUI_QWEN_EDIT_WORKFLOW_TEMPLATE,
    COMFYUI_FLUX_WORKFLOW_TEMPLATE,
    COMFYUI_Z_IMAGE_WORKFLOW_TEMPLATE,
} from "../constants";

import { generateMammouthText } from './mammouthService';
import { LTX_DIRECTOR_WORKFLOW_TEMPLATE } from './ltxDirectorWorkflow';
import { buildCharacterAnglesWorkflow } from './characterAnglesWorkflow';

export const LTX_PROMPT_THEMES = [
    { value: 'surprise', label: 'Surprise Mix', direction: 'an unexpected hybrid of contrasting cinematic eras and visual techniques' },
    { value: 'silent-20s', label: 'Silent Film 1920s', direction: '1920s silent cinema, monochrome orthochromatic film, iris transitions, expressive theatrical blocking, hand-cranked cadence' },
    { value: 'noir-40s', label: 'Film Noir 1940s', direction: '1940s film noir, hard venetian-blind shadows, wet streets, cigarette haze, stark black-and-white photography' },
    { value: 'technicolor-50s', label: 'Technicolor 1950s', direction: 'lush 1950s three-strip Technicolor, studio backdrops, saturated primaries, elegant dolly movement' },
    { value: 'new-wave-60s', label: 'New Wave 1960s', direction: '1960s New Wave cinema, spontaneous location shooting, jump-cut energy, grainy handheld 16mm, bold zooms' },
    { value: 'grindhouse-70s', label: 'Vintage Film 1970s', direction: 'gritty 1970s cinema, warm faded emulsion, practical lighting, smoky interiors, tactile 35mm grain and zoom lenses' },
    { value: 'vhs-80s', label: 'VHS Film 1980s', direction: '1980s genre cinema, neon practicals, anamorphic flares, punchy synth-era color, VHS texture and energetic camera moves' },
    { value: 'indie-90s', label: 'Indie Film 1990s', direction: '1990s independent film, muted color negative, intimate handheld framing, available light and candid performances' },
    { value: 'digital-2000s', label: 'Digital Film 2000s', direction: 'early-2000s digital cinema, cool highlights, bleach-bypass contrast, restless steadicam and music-video editing language' },
    { value: 'prestige-2010s', label: 'Prestige Film 2010s', direction: '2010s prestige cinema, controlled color grade, shallow-focus large-sensor photography, precise atmospheric composition' },
    { value: 'modern', label: 'Modern Cinema', direction: 'contemporary cinematic realism, natural motivated light, detailed large-format imagery, fluid stabilized camera movement' },
    { value: 'retro-future', label: 'Retro-Futurist', direction: 'retro-futurist cinema mixing analog machinery, miniature effects, luminous control panels and bold speculative production design' },
    { value: 'experimental', label: 'Experimental Art Film', direction: 'experimental art cinema, surreal visual metaphors, mixed media, unexpected temporal rhythms and daring in-camera transitions' },
] as const;

export type LtxPromptTheme = typeof LTX_PROMPT_THEMES[number]['value'];

export const LTX_PROMPT_SUBTHEMES = [
    { value: 'surprise', label: 'Surprise Genre', direction: 'an unpredictable genre collision with a coherent emotional arc' },
    { value: 'action', label: 'Action', direction: 'kinetic physical stakes, escalating movement and a decisive visual payoff' },
    { value: 'comedy', label: 'Comedy', direction: 'visual comedy driven by timing, escalating mishaps and expressive reactions' },
    { value: 'drama', label: 'Drama', direction: 'restrained emotional tension, meaningful gestures and a revealing turning point' },
    { value: 'romance', label: 'Romance', direction: 'tender attraction, charged glances and intimate but tasteful emotional movement' },
    { value: 'sensual', label: 'Sensual / Erotic', direction: 'tasteful adult sensuality, confident body language, intimate atmosphere and implied desire without explicit nudity or sexual acts' },
    { value: 'horror', label: 'Horror', direction: 'mounting dread, unsettling environmental motion and a disturbing final reveal' },
    { value: 'sci-fi', label: 'Sci-Fi', direction: 'speculative technology, strange physical phenomena and a sense of discovery or danger' },
    { value: 'fantasy', label: 'Fantasy', direction: 'mythic wonder, tangible magic and an action that transforms the surrounding world' },
    { value: 'nature', label: 'Nature', direction: 'organic animal or environmental behavior shaped by weather, light and natural forces' },
    { value: 'documentary', label: 'Documentary', direction: 'observational authenticity, unscripted detail, credible ambient behavior and an informative visual discovery' },
] as const;

export type LtxPromptSubtheme = typeof LTX_PROMPT_SUBTHEMES[number]['value'];

export const LTX_PROMPT_AUDIO_STYLES = [
    { value: 'natural', label: 'No Music / Natural Sound', direction: 'No musical score. Use only restrained, scene-specific diegetic sound and natural ambience; brief silence is welcome when dramatically appropriate.' },
    { value: 'silence', label: 'Complete Silence', direction: 'Absolute silence throughout: no music, ambience, dialogue, Foley, hum, or sound effects.' },
    { value: 'surprise', label: 'Surprise Audio', direction: 'Choose one deliberate audio approach, with a real possibility of silence or natural ambience instead of automatically adding music.' },
    { value: 'cinematic', label: 'Cinematic Score', direction: 'A concise cinematic score with a specific emotional motif, sparse enough to fit the shot without trailer-style bombast.' },
    { value: 'orchestral', label: 'Orchestral', direction: 'A short orchestral cue with clearly named instruments and dynamics tailored to the action.' },
    { value: 'electronic', label: 'Electronic', direction: 'A focused electronic cue with specific synth texture, pulse, and tempo appropriate to the scene.' },
    { value: 'synthwave', label: 'Synthwave / 1980s', direction: 'A compact 1980s-inspired synth cue with analog arpeggio, gated percussion, and a clearly defined mood.' },
    { value: 'jazz', label: 'Jazz', direction: 'A brief jazz cue naming its lead instruments, rhythm, and performance character.' },
    { value: 'rock', label: 'Rock', direction: 'A short rock cue with a specific guitar, bass, and drum character; avoid generic stadium music.' },
    { value: 'acoustic', label: 'Acoustic / Folk', direction: 'A restrained acoustic cue using specific organic instruments and an intimate performance style.' },
    { value: 'horror', label: 'Horror Drone', direction: 'A minimal unsettling drone or textural sting that supports tension without masking diegetic sounds.' },
    { value: 'documentary', label: 'Documentary Minimal', direction: 'A subtle documentary underscore using one or two restrained instruments, leaving natural ambience prominent.' },
] as const;

export type LtxPromptAudioStyle = typeof LTX_PROMPT_AUDIO_STYLES[number]['value'];

const getRandomItem = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const resolvePromptStyle = <T extends { value: string; direction: string }>(items: readonly T[], requested: string): T => {
    const choices = items.filter(({ value }) => value !== 'surprise');
    return requested === 'surprise' ? getRandomItem(choices) : items.find(({ value }) => value === requested) || getRandomItem(choices);
};

const resolveAudioStyle = (requested: LtxPromptAudioStyle) => {
    if (requested !== 'surprise') return LTX_PROMPT_AUDIO_STYLES.find(({ value }) => value === requested) || LTX_PROMPT_AUDIO_STYLES[0];
    return getRandomItem(LTX_PROMPT_AUDIO_STYLES.filter(({ value }) => value !== 'surprise'));
};

const includeRequiredDialogue = (prompt: string, requiredDialogue?: string): string => {
    const dialogue = requiredDialogue?.trim().replace(/"/g, "'");
    if (!dialogue) return prompt;
    const speakingCue = `The visible character speaks clearly and naturally, saying: "${dialogue}"`;
    return prompt.includes(speakingCue) ? prompt : `${prompt.trim()} ${speakingCue}`;
};

const createLocalLtxPrompt = (requestedTheme: LtxPromptTheme, requestedSubtheme: LtxPromptSubtheme, requestedAudioStyle: LtxPromptAudioStyle, durationSeconds: number, previousPrompt?: string, ttsContext?: string): string => {
    const theme = resolvePromptStyle(LTX_PROMPT_THEMES, requestedTheme);
    const subtheme = resolvePromptStyle(LTX_PROMPT_SUBTHEMES, requestedSubtheme);
    const audioStyle = resolveAudioStyle(requestedAudioStyle);
    const subjects = ['a night-shift projectionist discovers a moving figure inside a blank frame', 'two rival weather researchers chase a luminous storm across an empty salt flat', 'an elegant stranger arrives at a roadside diner carrying a ticking glass suitcase', 'a retired stage performer returns to an abandoned theater as the scenery begins moving by itself', 'a wildlife cinematographer follows an animal leaving impossible footprints through a flooded forest', 'a young mechanic awakens a forgotten machine beneath a crowded apartment building'];
    const actions = durationSeconds <= 4
        ? ['One immediate physical action reaches a clear visual beat within the shot.', 'A single simple movement unfolds in real time and ends on one readable reaction.']
        : durationSeconds <= 8
            ? ['One focused action develops through two readable beats and reaches a concise payoff.', 'A simple cause triggers one believable reaction and a clear final beat.']
            : ['The movement grows from a quiet observation into a decisive physical action with a surprising final beat.', 'A small background anomaly triggers a chain of believable reactions, practical movement, and a visual reversal.'];
    const cameras = ['The camera makes a slow push-in before orbiting gently around the subject.', 'A low tracking shot follows the movement, ending on a close reaction.', 'The shot begins wide, then transitions into a steady handheld medium shot.'];
    const lighting = ['Practical light sources evolve through the shot, creating moving shadows and tactile reflections.', 'Directional light changes with the action while atmosphere and lens behavior remain physically believable.', 'The lighting reveals new story information as the subject moves through layered depth.'];
    const opening = previousPrompt
        ? `Continue directly from this previous scene: ${previousPrompt.trim()} The next beat introduces a fresh escalation without repeating the earlier action.`
        : ttsContext?.trim()
            ? `Build the scene around this narrative context: "${ttsContext.trim().replace(/"/g, "'")}".`
        : `${getRandomItem(subjects)}.`;
    return `${opening} This is one continuous ${durationSeconds}-second shot. Genre direction: ${subtheme.direction}. Visual language: ${theme.direction}. ${getRandomItem(actions)} ${getRandomItem(cameras)} ${getRandomItem(lighting)} Audio direction: ${audioStyle.direction}`;
};

export const generateLtxDirectorPrompt = async (
    sourceImage: File | null,
    theme: LtxPromptTheme,
    subtheme: LtxPromptSubtheme,
    audioStyle: LtxPromptAudioStyle,
    durationSeconds: number,
    previousPrompt?: string,
    requiredDialogue?: string,
    ttsContext?: string,
) => {
    const selectedTheme = resolvePromptStyle(LTX_PROMPT_THEMES, theme);
    const selectedSubtheme = resolvePromptStyle(LTX_PROMPT_SUBTHEMES, subtheme);
    const selectedAudioStyle = resolveAudioStyle(audioStyle);
    const variation = crypto.randomUUID();
    const continuation = previousPrompt?.trim()
        ? `Continue the narrative directly from the previous clip below. Preserve its established characters, location, causality, and final beat, but advance the action instead of paraphrasing or repeating it. The new prompt must also work as a self-contained video-generation instruction. Previous clip: "${previousPrompt.trim()}". `
        : '';
    const imageStartingPoint = previousPrompt?.trim()
        ? 'Treat the supplied image as the exact visual starting point and reconcile it naturally with the continuing story. '
        : 'Treat the supplied image as the exact visual starting point. ';
    const pacing = durationSeconds <= 4
        ? 'Use only one immediate, simple physical action and one clear visual beat. No setup, secondary event, or multi-step action can fit.'
        : durationSeconds <= 8
            ? 'Use one focused action with at most two quickly readable beats and one concise payoff.'
            : 'Use one focused action that may develop through at most three readable beats before its payoff.';
    const timing = `The entire described action must unfold naturally in real time within exactly ${durationSeconds} seconds. ${pacing} Do not use a montage, sequence of scenes, time jump, location change, or more action than a performer and camera can complete in ${durationSeconds} seconds.`;
    const audioDirection = `Audio direction: ${selectedAudioStyle.direction} Describe only audio that can occur within ${durationSeconds} seconds. Follow this audio direction exactly and never add unspecified background music.`;
    const dialogueDirection = requiredDialogue?.trim() && ttsContext?.trim()
        ? `The visible character must speak this exact dialogue without translating, paraphrasing, shortening, or adding words: "${requiredDialogue.trim().replace(/"/g, "'")}". Describe natural lip movement and performance that match this line. `
        : '';
    const contextDirection = ttsContext?.trim()
        ? `Use this TTS script as narrative and visual context for the random scene, including its concrete subjects when filmable: "${ttsContext.trim().replace(/"/g, "'")}". Do not quote or require spoken dialogue unless separately instructed. `
        : '';
    const instruction = sourceImage
        ? `Analyze the supplied image and write one inventive English prompt for an LTX image-to-video clip. ${continuation}${imageStartingPoint}Preserve the visible subject, identity, clothing, composition, and environment. ${timing} ${contextDirection}${dialogueDirection}Genre direction: ${selectedSubtheme.direction}. Visual era and filmmaking language: ${selectedTheme.direction}. ${audioDirection} Include era-authentic camera behavior, practical light, and realistic secondary motion only when they fit the available time. Avoid generic walking, smiling, posing, floating particles, and empty cinematic adjectives unless the image uniquely requires them. Do not describe a new still image. Do not use headings or preamble. Return only the final video prompt. Variation key: ${variation}`
        : `Write one highly original English prompt for an LTX text-to-video clip. ${continuation}${timing} ${contextDirection}${dialogueDirection}Genre direction: ${selectedSubtheme.direction}. Visual era and filmmaking language: ${selectedTheme.direction}. ${audioDirection} Invent an unusual but filmable subject, a specific location, and a compact action with a clear payoff. Include era-authentic camera behavior, practical light, and physical secondary motion only when they fit the available time. Avoid generic heroes, neon alleys, simple walking, floating particles, and stock trailer language. Do not use headings or preamble. Return only the final video prompt. Variation key: ${variation}`;
    try {
        const result = await generateMammouthText(instruction, sourceImage ? [sourceImage] : []);
        return { ...result, text: includeRequiredDialogue(result.text.trim().replace(/^['"`]+|['"`]+$/g, ''), requiredDialogue) };
    } catch (error) {
        if (sourceImage) throw error;
        return { text: includeRequiredDialogue(createLocalLtxPrompt(theme, subtheme, audioStyle, durationSeconds, previousPrompt, ttsContext), requiredDialogue) };
    }
};

// Remove local initialization
// const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Helper Functions ---
const getComfyUIUrl = (): string => {
    let url = localStorage.getItem('comfyui_url') || '';
    if (!url) return '';

    // Force HTTP protocol
    if (url.startsWith('https://')) {
        url = 'http://' + url.substring(8);
    } else if (!url.startsWith('http://')) {
        url = 'http://' + url;
    }

    // Remove any trailing slashes
    return url.replace(/\/+$/, '');
};

const getClientId = (): string => `lawiz-app-${Math.random().toString(36).substring(2, 15)}`;

const sanitizeFilename = (filename: string): string => {
    if (!filename) return "image.png";

    const extensionMatch = filename.match(/\.[0-9a-z]+$/i);
    const extension = extensionMatch ? extensionMatch[0] : '.png';
    let baseName = extension ? filename.substring(0, filename.length - extension.length) : filename;

    // Replace invalid characters and multiple spaces/underscores
    baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');

    const maxLength = 100 - extension.length;
    if (baseName.length > maxLength) {
        baseName = baseName.substring(0, maxLength);
    }

    return baseName + extension;
}

// --- Module state for cancellation ---
let currentExecution: { clientId: string; ws: WebSocket; reject: (reason?: any) => void } | null = null;

export const cancelComfyUIExecution = async (): Promise<void> => {
    if (!currentExecution) {
        console.warn("No ComfyUI execution to cancel.");
        return;
    }
    const url = getComfyUIUrl();
    if (!url) return;

    try {
        // ComfyUI's interrupt endpoint does not require a body.
        await fetch(`${url}/interrupt`, { method: 'POST' });
        console.log("ComfyUI execution interrupt requested.");

        currentExecution.reject(new Error('Operation was cancelled by the user.'));

        if (currentExecution.ws.readyState === WebSocket.OPEN) {
            currentExecution.ws.close();
        }
    } catch (e) {
        console.error("Failed to send interrupt request to ComfyUI:", e);
    } finally {
        currentExecution = null;
    }
};

export const CHATTERBOX_LANGUAGES = [
    'English', 'German', 'Norwegian', 'Arabic', 'Danish', 'Greek', 'Spanish',
    'Finnish', 'French', 'Hebrew', 'Hindi', 'Italian', 'Japanese', 'Korean',
    'Malay', 'Dutch', 'Polish', 'Portuguese', 'Swedish', 'Swahili', 'Turkish',
    'Chinese',
] as const;

export type ChatterboxLanguage = typeof CHATTERBOX_LANGUAGES[number];

const LEGACY_CHATTERBOX_LANGUAGES: readonly ChatterboxLanguage[] = ['English', 'German', 'Norwegian'];

export interface ChatterboxTtsOptions {
    language: ChatterboxLanguage;
    device: 'auto' | 'cpu' | 'cuda';
    exaggeration: number;
    temperature: number;
    cfgWeight: number;
    seed: number;
    audioPromptPath: string;
    enableChunking: boolean;
    maxCharsPerChunk: number;
    chunkCombinationMethod: 'auto' | 'concatenate' | 'crossfade';
    silenceBetweenChunksMs: number;
    filenamePrefix: string;
}

export type ChatterboxTtsReference =
    | { type: 'upload'; file: File }
    | { type: 'suite'; voice: string };

export interface TtsReferenceVoice {
    value: string;
    label: string;
}

const formatTtsVoiceLabel = (voice: string): string => {
    const filename = voice.split('/').pop() || voice;
    return filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
};

export const getTtsReferenceVoices = async (): Promise<TtsReferenceVoice[]> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const response = await fetch(`${url}/object_info/UnifiedTTSTextNode`);
    if (!response.ok) throw new Error('Could not load TTS Audio Suite voices.');
    const objectInfo = await response.json();
    const choices = objectInfo?.UnifiedTTSTextNode?.input?.required?.narrator_voice?.[0];
    if (!Array.isArray(choices)) throw new Error('TTS Audio Suite did not return a voice list.');
    return choices
        .filter((voice): voice is string => typeof voice === 'string' && voice !== 'none')
        .map((voice) => ({ value: voice, label: formatTtsVoiceLabel(voice) }));
};

export const generateChatterboxTts = async (
    text: string,
    reference: ChatterboxTtsReference,
    options: ChatterboxTtsOptions,
    updateProgress: (message: string, value: number) => void,
): Promise<string> => {
    const uploadedAudio = reference.type === 'upload'
        ? await (async () => {
            updateProgress('Uploading reference voice...', 0.05);
            return uploadLtxMedia(reference.file);
        })()
        : null;
    const isOfficialMultilingual = reference.type === 'suite' || !LEGACY_CHATTERBOX_LANGUAGES.includes(options.language);
    const workflow = isOfficialMultilingual ? {
        ...(uploadedAudio ? { '26': {
            inputs: { audio: uploadedAudio.name },
            class_type: 'LoadAudio',
            _meta: { title: 'Load Audio' },
        } } : {}),
        '42': {
            inputs: {
                model_version: 'v1',
                language: options.language,
                device: options.device,
                exaggeration: options.exaggeration,
                temperature: options.temperature,
                cfg_weight: options.cfgWeight,
                repetition_penalty: 1.2,
                min_p: 0.05,
                top_p: 1,
            },
            class_type: 'ChatterBoxOfficial23LangEngineNode',
            _meta: { title: 'ChatterBox Official 23-Lang Engine' },
        },
        '43': {
            inputs: {
                TTS_engine: ['42', 0],
                text: text.trim(),
                narrator_voice: reference.type === 'suite' ? reference.voice : 'none',
                seed: options.seed,
                ...(uploadedAudio ? { opt_narrator: ['26', 0] } : {}),
                enable_chunking: options.enableChunking,
                max_chars_per_chunk: options.maxCharsPerChunk,
                chunk_combination_method: options.chunkCombinationMethod,
                silence_between_chunks_ms: options.silenceBetweenChunksMs,
                enable_audio_cache: true,
                batch_size: 0,
            },
            class_type: 'UnifiedTTSTextNode',
            _meta: { title: 'TTS Text' },
        },
        '49': {
            inputs: {
                filename_prefix: options.filenamePrefix || 'audio/ChatterB',
                audio: ['43', 0],
            },
            class_type: 'SaveAudio',
            _meta: { title: 'Save Audio' },
        },
    } : {
        '26': {
            inputs: { audio: uploadedAudio!.name },
            class_type: 'LoadAudio',
            _meta: { title: 'Load Audio' },
        },
        '39': {
            inputs: { string: text.trim() },
            class_type: 'String Literal',
            _meta: { title: 'String Literal' },
        },
        '42': {
            inputs: {
                text: ['39', 0],
                language: options.language,
                device: options.device,
                exaggeration: options.exaggeration,
                temperature: options.temperature,
                cfg_weight: options.cfgWeight,
                seed: options.seed,
                audio_prompt_path: options.audioPromptPath,
                enable_chunking: options.enableChunking,
                max_chars_per_chunk: options.maxCharsPerChunk,
                chunk_combination_method: options.chunkCombinationMethod,
                silence_between_chunks_ms: options.silenceBetweenChunksMs,
                reference_audio: ['26', 0],
            },
            class_type: 'ChatterBoxVoiceTTS',
            _meta: { title: 'ChatterBox Voice TTS' },
        },
        '49': {
            inputs: {
                filename_prefix: options.filenamePrefix || 'audio/ChatterB',
                audio: ['42', 0],
            },
            class_type: 'SaveAudio',
            _meta: { title: 'Save Audio' },
        },
    };
    const { audioUrl } = await executeWorkflow(workflow, updateProgress, true, 0);
    if (!audioUrl) throw new Error('ComfyUI completed without returning a TTS audio file.');
    return audioUrl;
};

// --- Mammouth-based Prompt Generation ---
type ComfyPromptModelType = 'sd1.5' | 'sdxl' | 'flux' | 'gemini' | 'wan2.2' | 'qwen-edit' | 'nunchaku-kontext-flux' | 'nunchaku-flux-image' | 'flux-krea' | 'face-detailer-sd1.5' | 'qwen-t2i-gguf' | 'z-image';

const getPromptStyleInstruction = (modelType: ComfyPromptModelType): string => {
    switch (modelType) {
        case 'sd1.5':
        case 'face-detailer-sd1.5':
            return 'Your response MUST be a very simple, comma-separated list of keywords. Do not use sentences.';
        case 'flux':
        case 'nunchaku-flux-image':
        case 'flux-krea':
        case 'qwen-t2i-gguf':
        case 'z-image':
            return 'Your response MUST be a single, detailed, artistic, and descriptive paragraph. Use rich vocabulary.';
        case 'gemini':
            return 'Your response MUST be a detailed, narrative paragraph written in a natural language. Describe the scene as if you were writing a story or giving instructions to a human artist. Use full, descriptive sentences.';
        case 'wan2.2':
        case 'sdxl':
        case 'qwen-edit':
        case 'nunchaku-kontext-flux': // I2I prompt is often best as a sentence
        default:
            return 'Your response MUST be a single, concise, natural language sentence.';
    }
};

export const generateComfyUIPromptFromSource = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
    const instruction = getPromptStyleInstruction(modelType) + ' Start the prompt directly without any preamble.';
    const result = await generateMammouthText(instruction, [sourceImage]);
    const text = result.text.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a prompt.');
    return text;
};

export const generateWanVideoPromptFromImage = async (sourceImage: File): Promise<string> => {
    const instruction = `Analyze this image. Describe the main subject and its environment in a concise, cinematic phrase suitable for a text-to-video prompt. For example: "A lion running across the savannah" or "A cyberpunk woman with neon hair in a rainy neon-lit alley". Respond with only the descriptive phrase.`;
    const result = await generateMammouthText(instruction, [sourceImage]);
    const text = result.text.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a video prompt from the image.');
    return text;
};


export const extractBackgroundPromptFromImage = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
    const styleInstruction = getPromptStyleInstruction(modelType);
    const instruction = `Analyze ONLY the background of this image, ignoring any people or foreground subjects. Describe the environment in detail. ${styleInstruction}`;
    const result = await generateMammouthText(instruction, [sourceImage]);
    const text = result.text.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a background prompt.');
    return text;
};

export const extractSubjectPromptFromImage = async (sourceImage: File, modelType: ComfyPromptModelType): Promise<string> => {
    const styleInstruction = getPromptStyleInstruction(modelType);
    const instruction = `Analyze ONLY the main subject (person or object) of this image, ignoring the background. Describe the subject in detail, including appearance, clothing, and any defining features. ${styleInstruction}`;
    const result = await generateMammouthText(instruction, [sourceImage]);
    const text = result.text.trim().replace(/['"`]/g, '');
    if (!text) throw new Error('AI failed to generate a subject prompt.');
    return text;
};

export const generateMagicalPromptSoup = async (
    fullPrompt: string,
    bgPrompt: string,
    subjectPrompt: string,
    modelType: ComfyPromptModelType,
    creativity: number
): Promise<{ text: string; source: number }[]> => {
    let instruction = `You are a creative assistant for generating image prompts. Combine the following elements into a new, cohesive, and imaginative prompt suitable for a '${modelType}' model.
    
    Creativity Level: ${creativity} (0 is a simple combination, 1 is a wild, artistic reinterpretation).

    **Elements to combine:**`;
    if (fullPrompt) instruction += `\n1. Full Scene Idea: "${fullPrompt}"`;
    if (bgPrompt) instruction += `\n2. Background Idea: "${bgPrompt}"`;
    if (subjectPrompt) instruction += `\n3. Subject Idea: "${subjectPrompt}"`;

    instruction += `\n\nYour task is to merge these ideas. You MUST respond with a valid JSON object containing a single key "prompt_parts", which is an array of objects. Each object in the array must have two keys: "text" (a small segment of the final prompt) and "source" (an integer: 0 for new/combined ideas, 1 for elements from the Full Scene, 2 for Background, 3 for Subject).
    
    Example response format:
    { "prompt_parts": [ {"text": "A beautiful portrait of", "source": 1}, {"text": "an astronaut", "source": 3}, {"text": "on a neon-lit alien world", "source": 2}, {"text": "in a impressionistic style", "source": 0} ] }
    `;

    const result = await generateMammouthText(instruction);

    try {
        const jsonText = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const parsed = JSON.parse(jsonText);
        if (parsed.prompt_parts && Array.isArray(parsed.prompt_parts)) {
            return parsed.prompt_parts;
        }
        throw new Error("Invalid JSON format from AI.");
    } catch (e) {
        console.error("Failed to parse prompt soup from AI:", result.text, e);
        throw new Error("AI returned an invalid response for the prompt soup.");
    }
};

// --- ComfyUI Connection & API ---

export const checkConnection = async (url: string): Promise<{ success: boolean; error?: string }> => {
    if (!url) return { success: false, error: 'URL is not provided.' };

    let processedUrl = url.trim();
    // Force HTTP protocol, as ComfyUI servers typically do not use HTTPS locally.
    if (processedUrl.startsWith('https://')) {
        processedUrl = 'http://' + processedUrl.substring(8);
    } else if (!processedUrl.startsWith('http://')) {
        processedUrl = 'http://' + processedUrl;
    }

    // Remove any trailing slashes to prevent double slashes in the final URL.
    processedUrl = processedUrl.replace(/\/+$/, '');

    try {
        const response = await fetch(`${processedUrl}/system_stats`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        await response.json(); // Check if it's a valid JSON response
        return { success: true };
    } catch (error: any) {
        console.error('ComfyUI connection check failed:', error);
        const errorMessage = 'Failed to connect. Please check:\n' +
            '1. Is the ComfyUI server running on HTTP (not HTTPS)?\n' +
            '2. Is the URL in Settings correct?\n' +
            '3. Did you start ComfyUI with the `--enable-cors` flag?\n' +
            '4. Check the browser console (F12) for "mixed content" errors.\n' +
            '5. Is a firewall, VPN, or ad-blocker interfering?';
        return { success: false, error: errorMessage };
    }
};

export const getComfyUIObjectInfo = async (): Promise<any> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const response = await fetch(`${url}/object_info`);
    if (!response.ok) throw new Error('Failed to fetch ComfyUI object info');
    return response.json();
};

const uploadImage = async (file: File): Promise<{ name: string; subfolder: string; type: string }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');

    const fileBuffer = await file.arrayBuffer();
    const originalFilename = file.name || "image.png";
    const sanitizedFilename = sanitizeFilename(originalFilename);
    const normalizedFile = new File([fileBuffer], sanitizedFilename, { type: file.type });

    const formData = new FormData();
    formData.append('image', normalizedFile);
    formData.append('overwrite', 'true');

    const response = await fetch(`${url}/upload/image`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("ComfyUI image upload failed. Server response:", errorText);
        throw new Error(`Failed to upload image to ComfyUI: ${response.statusText}`);
    }

    return response.json();
};

const uploadLtxMedia = async (file: File): Promise<{ name: string; subfolder?: string; type?: string }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');

    const formData = new FormData();
    formData.append('image', file, sanitizeFilename(file.name));
    formData.append('type', 'input');
    formData.append('overwrite', 'true');
    const response = await fetch(`${url}/upload/image`, { method: 'POST', body: formData });
    if (!response.ok) {
        throw new Error(`Failed to upload ${file.type.startsWith('audio/') ? 'audio' : 'image'} to ComfyUI: ${await response.text()}`);
    }
    return response.json();
};

const queuePrompt = async (prompt: any, clientId: string): Promise<string> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const response = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, client_id: clientId }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to queue prompt: ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(`Error from ComfyUI: ${data.error.type} - ${JSON.stringify(data.error.details || data.error.message)}`);
    return data.prompt_id;
};

const executeWorkflow = async (
    workflow: any,
    onProgress: (message: string, value: number) => void,
    isLongJob: boolean = false,
    expectedImageCount: number = 1,
    imageNodeOrder?: string[],
    onNodeOutput?: (nodeId: string, output: any) => void,
): Promise<{ images: string[], videoUrl: string | null, audioUrl: string | null }> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error("ComfyUI URL not set");
    const clientId = getClientId();
    const wsProtocol = url.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${url.replace(/^https?:\/\//, '')}/ws?clientId=${clientId}`;

    return new Promise((resolve, reject) => {
        onProgress("Connecting to ComfyUI...", 0.1);
        const ws = new WebSocket(wsUrl);
        currentExecution = { clientId, ws, reject };

        const cleanup = () => {
            if (currentExecution && currentExecution.clientId === clientId) {
                currentExecution = null;
            }
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        };

        ws.onopen = async () => {
            try {
                onProgress("Queueing prompt...", 0.2);
                await queuePrompt(workflow, clientId);
            } catch (err) {
                reject(err);
                cleanup();
            }
        };

        ws.onmessage = async (event) => {
            if (typeof event.data !== 'string') return;
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'status':
                    const queueRemaining = data.data.status.exec_info.queue_remaining;
                    onProgress(queueRemaining > 0 ? `In queue... position ${queueRemaining}` : "Preparing to generate...", 0.25);
                    break;
                case 'progress':
                    const { value, max } = data.data;
                    onProgress(`Sampling...`, 0.3 + (value / max) * 0.6);
                    break;
                case 'executed':
                    const eventOutput = data.data.output;
                    onNodeOutput?.(String(data.data.node), eventOutput);
                    const hasMediaOutput = eventOutput && (
                        Array.isArray(eventOutput.images) ||
                        Array.isArray(eventOutput.videos) ||
                        Array.isArray(eventOutput.audio) ||
                        Array.isArray(eventOutput.audios) ||
                        Array.isArray(eventOutput.gifs) ||
                        Array.isArray(eventOutput.files) ||
                        Array.isArray(eventOutput.ui?.videos)
                    );
                    if (!hasMediaOutput) break;
                    onProgress("Fetching results...", 0.95);
                    const promptId = data.data.prompt_id;

                    const retries = isLongJob ? 150 : 15;
                    const delay = 3000;

                    const fetchHistoryWithRetries = async (retries: number, delay: number): Promise<any> => {
                        for (let i = 0; i < retries; i++) {
                            try {
                                const historyRes = await fetch(`${url}/history/${promptId}`);
                                if (!historyRes.ok) throw new Error(`Failed to fetch history (attempt ${i + 1}): ${historyRes.statusText}`);
                                const historyData = await historyRes.json();
                                const history = historyData[promptId];
                                if (history && history.outputs) return history;
                                onProgress(`Waiting for outputs from server... (${i + 1}/${retries})`, 0.96);
                            } catch (e) {
                                console.warn(`History fetch attempt ${i + 1} failed`, e);
                            }
                            if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
                        }
                        throw new Error(`No outputs found in history for prompt ${promptId} after ${retries} attempts.`);
                    };

                    try {
                        const history = await fetchHistoryWithRetries(retries, delay);
                        const outputs = history.outputs;
                        const imageOutputs = [];
                        let videoUrl = null;
                        let audioUrl = null;

                        for (const nodeId in outputs) {
                            const nodeOutput = outputs[nodeId];
                            const genericFiles = Array.isArray(nodeOutput.files) ? nodeOutput.files : [];
                            const audioFiles = genericFiles.filter((file: any) => /\.(wav|mp3|flac|m4a|ogg|opus|aac)$/i.test(file.filename || ''));
                            const audioList = Array.isArray(nodeOutput.audio)
                                ? nodeOutput.audio
                                : Array.isArray(nodeOutput.audios) ? nodeOutput.audios : audioFiles;
                            if (audioList.length > 0 && audioList[0].filename) {
                                const audioFile = audioList[0];
                                audioUrl = `${url}/view?filename=${encodeURIComponent(audioFile.filename)}&subfolder=${encodeURIComponent(audioFile.subfolder || '')}&type=${encodeURIComponent(audioFile.type || 'output')}`;
                            }
                            let videoList = [];
                            if (nodeOutput.ui && Array.isArray(nodeOutput.ui.videos)) videoList = nodeOutput.ui.videos;
                            else if (Array.isArray(nodeOutput.videos)) videoList = nodeOutput.videos;
                            else if (Array.isArray(nodeOutput.gifs)) videoList = nodeOutput.gifs;
                            else if (genericFiles.length > 0) videoList = genericFiles.filter((file: any) => !audioFiles.includes(file));
                            if (videoList.length > 0) {
                                const videoFile = videoList[0];
                                if (videoFile.filename) {
                                    videoUrl = `${url}/view?filename=${encodeURIComponent(videoFile.filename)}&subfolder=${encodeURIComponent(videoFile.subfolder || '')}&type=${encodeURIComponent(videoFile.type || 'output')}`;
                                    break;
                                }
                            }
                        }

                        const imageOutputNodeIds = imageNodeOrder || Object.keys(outputs);
                        for (const nodeId of imageOutputNodeIds) {
                            if (outputs[nodeId]?.images) {
                                for (const image of outputs[nodeId].images) {
                                    const isVideoFile = image.format?.startsWith('video/') || image.filename?.endsWith('.mp4');
                                    if (isVideoFile && !videoUrl) {
                                        videoUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type}`;
                                    } else if (!isVideoFile) {
                                        const fileUrl = `${url}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type}`;
                                        const imageRes = await fetch(fileUrl);
                                        const blob = await imageRes.blob();
                                        const dataUrl = await new Promise<string>(res => {
                                            const reader = new FileReader();
                                            reader.onload = () => res(reader.result as string);
                                            reader.readAsDataURL(blob);
                                        });
                                        imageOutputs.push(dataUrl);
                                    }
                                }
                            }
                        }

                        if (!videoUrl && !audioUrl && imageOutputs.length < expectedImageCount) {
                            onProgress(`Generated ${imageOutputs.length}/${expectedImageCount} images...`, 0.95);
                            break;
                        }
                        resolve({ images: imageOutputs, videoUrl, audioUrl });
                    } catch (err) {
                        reject(err);
                        cleanup();
                    }
                    break;
                case 'execution_interrupted':
                    reject(new Error('Operation was cancelled by the user.'));
                    cleanup();
                    break;
                case 'execution_error':
                    reject(new Error(`ComfyUI execution error: ${JSON.stringify(data.data)}`));
                    cleanup();
                    break;
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket Error:", err);
            reject(new Error("WebSocket connection failed. Ensure the ComfyUI server is running and accessible."));
            cleanup();
        };

        ws.onclose = () => {
            cleanup();
        };
    });
};

export interface SeedVr2UpscaleOptions {
    ditModel: string;
    vaeModel: string;
    resolution: number;
    seed?: number;
    ditDevice: string;
    blocksToSwap: number;
    swapIoComponents: boolean;
    ditOffloadDevice: string;
    cacheDitModel: boolean;
    attentionMode: string;
    vaeDevice: string;
    vaeEncodeTiled: boolean;
    vaeEncodeTileSize: number;
    vaeEncodeTileOverlap: number;
    vaeDecodeTiled: boolean;
    vaeDecodeTileSize: number;
    vaeDecodeTileOverlap: number;
    tileDebug: string;
    vaeOffloadDevice: string;
    cacheVaeModel: boolean;
    batchSize: number;
    uniformBatchSize: boolean;
    colorCorrection: string;
    temporalOverlap: number;
    prependFrames: number;
    inputNoiseScale: number;
    latentNoiseScale: number;
    upscalerOffloadDevice: string;
    enableDebug: boolean;
}

export const generateSeedVr2Upscale = async (
    sourceImage: File,
    options: SeedVr2UpscaleOptions,
    updateProgress: (message: string, value: number) => void,
): Promise<string> => {
    const resolution = Math.min(2180, Math.max(256, Math.round(options.resolution / 2) * 2));
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const objectInfoResponse = await fetch(`${url}/object_info`);
    if (!objectInfoResponse.ok) throw new Error('Could not inspect the installed ComfyUI nodes.');
    const objectInfo = await objectInfoResponse.json();
    const requiredNodes = ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'];
    const missingNodes = requiredNodes.filter((nodeName) => !objectInfo[nodeName]);
    if (missingNodes.length > 0) {
        throw new Error(`SeedVR2 custom nodes are not installed or loaded: ${missingNodes.join(', ')}.`);
    }
    const hasEasyCleanup = Boolean(objectInfo['easy cleanGpuUsed'] && objectInfo['easy clearCacheAll']);
    updateProgress('Uploading source image...', 0.05);
    const uploadedImage = await uploadImage(sourceImage);
    const workflow: Record<string, any> = {
        '20': {
            inputs: {
                model: options.ditModel,
                device: options.ditDevice,
                blocks_to_swap: options.blocksToSwap,
                swap_io_components: options.swapIoComponents,
                offload_device: options.ditOffloadDevice,
                cache_model: options.cacheDitModel,
                attention_mode: options.attentionMode,
            },
            class_type: 'SeedVR2LoadDiTModel',
            _meta: { title: 'SeedVR2 Load DiT Model' },
        },
        '26': {
            inputs: { image: uploadedImage.name },
            class_type: 'LoadImage',
            _meta: { title: 'Load Image' },
        },
        '29': {
            inputs: {
                model: options.vaeModel,
                device: options.vaeDevice,
                encode_tiled: options.vaeEncodeTiled,
                encode_tile_size: options.vaeEncodeTileSize,
                encode_tile_overlap: options.vaeEncodeTileOverlap,
                decode_tiled: options.vaeDecodeTiled,
                decode_tile_size: options.vaeDecodeTileSize,
                decode_tile_overlap: options.vaeDecodeTileOverlap,
                tile_debug: options.tileDebug,
                offload_device: options.vaeOffloadDevice,
                cache_model: options.cacheVaeModel,
            },
            class_type: 'SeedVR2LoadVAEModel',
            _meta: { title: 'SeedVR2 Load VAE Model' },
        },
        '33': {
            inputs: {
                seed: options.seed ?? Math.floor(Math.random() * 4294967295),
                resolution,
                max_resolution: resolution,
                batch_size: options.batchSize,
                uniform_batch_size: options.uniformBatchSize,
                color_correction: options.colorCorrection,
                temporal_overlap: options.temporalOverlap,
                prepend_frames: options.prependFrames,
                input_noise_scale: options.inputNoiseScale,
                latent_noise_scale: options.latentNoiseScale,
                offload_device: options.upscalerOffloadDevice,
                enable_debug: options.enableDebug,
                image: [hasEasyCleanup ? '28' : '26', 0],
                dit: ['20', 0],
                vae: ['29', 0],
            },
            class_type: 'SeedVR2VideoUpscaler',
            _meta: { title: 'SeedVR2 Image Upscaler' },
        },
        '24': {
            inputs: { filename_prefix: 'upscaled/seedvr2', images: ['33', 0] },
            class_type: 'SaveImage',
            _meta: { title: 'Save Upscaled Image' },
        },
    };
    if (hasEasyCleanup) {
        workflow['22'] = {
            inputs: { anything: ['26', 0] },
            class_type: 'easy cleanGpuUsed',
            _meta: { title: 'Clean VRAM Used' },
        };
        workflow['28'] = {
            inputs: { anything: ['22', 0] },
            class_type: 'easy clearCacheAll',
            _meta: { title: 'Clear Cache All' },
        };
    }
    const result = await executeWorkflow(workflow, updateProgress, true);
    if (!result.images[0]) throw new Error('SeedVR2 completed without returning an image.');
    return result.images[0];
};

export interface ZImageCreativeLora {
    enabled: boolean;
    name: string;
    strength: number;
}

export interface ZImageCreativeUpscaleOptions {
    turboUnet: string;
    baseUnet: string;
    vae: string;
    clip: string;
    upscaleModel: string;
    florenceModel: string;
    florencePrecision: string;
    florenceAttention: string;
    promptPrefix: string;
    turboLoras: ZImageCreativeLora[];
    baseLoras: ZImageCreativeLora[];
    turboShift: number;
    baseShift: number;
    upscaleFactor: number;
    maxStepScale: number;
    steps: number;
    sampler: string;
    scheduler: string;
    tailStepsFirst: number;
    tailStepsLast: number;
    refineSampler: string;
    refineScheduler: string;
    refineSteps: number;
    refineEnterSigma: number;
    seed?: number;
    sageAttention: string;
    allowCompile: boolean;
    florenceKeepLoaded: boolean;
    florenceMaxTokens: number;
    florenceBeams: number;
    florenceSample: boolean;
}

export const generateZImageCreativeUpscale = async (
    sourceImage: File,
    sourceDimensions: { width: number; height: number },
    options: ZImageCreativeUpscaleOptions,
    updateProgress: (message: string, value: number) => void,
    onPromptReady?: (prompt: string) => void,
): Promise<string> => {
    const url = getComfyUIUrl();
    if (!url) throw new Error('ComfyUI URL not set');
    const objectInfoResponse = await fetch(`${url}/object_info`);
    if (!objectInfoResponse.ok) throw new Error('Could not inspect the installed ComfyUI nodes.');
    const objectInfo = await objectInfoResponse.json();
    const requiredNodes = ['UNETLoader', 'VAELoader', 'CLIPLoaderGGUF', 'Florence2Run', 'DownloadAndLoadFlorence2Model', 'AddTextPrefix', 'easy showAnything', 'ZImageTurboProgressiveLockedUpscale', 'UpscaleModelLoader'];
    const missingNodes = requiredNodes.filter((nodeName) => !objectInfo[nodeName]);
    if (missingNodes.length > 0) throw new Error(`Z-Image Creative Upscale nodes are not installed or loaded: ${missingNodes.join(', ')}.`);

    updateProgress('Uploading source image for Florence2...', 0.05);
    const uploadedImage = await uploadImage(sourceImage);
    const upscaleFactor = Math.min(8, Math.max(1, options.upscaleFactor));
    const targetLongSide = 2180;
    const targetScale = targetLongSide / Math.max(sourceDimensions.width, sourceDimensions.height);
    const targetWidth = sourceDimensions.width * targetScale;
    const targetHeight = sourceDimensions.height * targetScale;
    const latentWidth = Math.max(64, Math.floor(targetWidth / upscaleFactor / 16) * 16);
    const latentHeight = Math.max(64, Math.floor(targetHeight / upscaleFactor / 16) * 16);
    const seed = options.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const workflow: Record<string, any> = {
        '1': { inputs: { unet_name: options.baseUnet, weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'Base Refine Model' } },
        '4': { inputs: { vae_name: options.vae }, class_type: 'VAELoader', _meta: { title: 'VAE' } },
        '5': { inputs: { clip_name: options.clip, type: 'lumina2' }, class_type: 'CLIPLoaderGGUF', _meta: { title: 'Z-Image Text Encoder' } },
        '7': { inputs: { text: ['237', 0], clip: ['5', 0] }, class_type: 'CLIPTextEncode', _meta: { title: 'Florence2 Creative Prompt' } },
        '8': { inputs: { conditioning: ['7', 0] }, class_type: 'ConditioningZeroOut', _meta: { title: 'Zero Negative Conditioning' } },
        '15': { inputs: { shift: options.turboShift, model: ['54', 0] }, class_type: 'ModelSamplingAuraFlow', _meta: { title: 'Turbo Generation Sampling' } },
        '40': { inputs: { model_name: options.upscaleModel }, class_type: 'UpscaleModelLoader', _meta: { title: 'Pixel Upscale Model' } },
        '54': { inputs: { unet_name: options.turboUnet, weight_dtype: 'default' }, class_type: 'UNETLoader', _meta: { title: 'Turbo Generation Model' } },
        '115': { inputs: { image: uploadedImage.name }, class_type: 'LoadImage', _meta: { title: 'Creative Upscale Source' } },
        '200': { inputs: { shift: options.baseShift, model: ['1', 0] }, class_type: 'ModelSamplingAuraFlow', _meta: { title: 'Base Refine Sampling' } },
        '230': { inputs: { width: latentWidth, height: latentHeight, batch_size: 1 }, class_type: 'EmptySD3LatentImage', _meta: { title: 'Aspect-Matched Creative Latent' } },
        '237': { inputs: { anything: ['242', 0] }, class_type: 'easy showAnything', _meta: { title: 'Florence2 Prompt Output' } },
        '240': {
            inputs: {
                text_input: '', task: 'more_detailed_caption', fill_mask: false,
                keep_model_loaded: options.florenceKeepLoaded, max_new_tokens: options.florenceMaxTokens,
                num_beams: options.florenceBeams, do_sample: options.florenceSample,
                output_mask_select: '', seed, image: ['115', 0], florence2_model: ['241', 0],
            },
            class_type: 'Florence2Run', _meta: { title: 'Florence2 Image Prompt' },
        },
        '241': {
            inputs: { model: options.florenceModel, precision: options.florencePrecision, convert_to_safetensors: options.florenceAttention },
            class_type: 'DownloadAndLoadFlorence2Model', _meta: { title: 'Florence2 Model' },
        },
        '242': { inputs: { texts: ['240', 2], prefix: options.promptPrefix }, class_type: 'AddTextPrefix', _meta: { title: 'Creative Prompt Prefix' } },
        '198': {
            inputs: {
                upscale_factor: upscaleFactor, max_step_scale: options.maxStepScale,
                steps: options.steps, sampler: options.sampler, scheduler: options.scheduler,
                tail_steps_first_upscale: options.tailStepsFirst, tail_steps_last_upscale: options.tailStepsLast,
                seed, refine_sampler: options.refineSampler, refine_scheduler: options.refineScheduler,
                refine_steps: options.refineSteps, refine_enter_sigma: options.refineEnterSigma,
                model: ['15', 0], latent: ['230', 0], positive: ['7', 0], negative: ['8', 0],
                vae: ['4', 0], upscale_model: ['40', 0], refine_model: ['200', 0],
            },
            class_type: 'ZImageTurboProgressiveLockedUpscale', _meta: { title: 'Z-Image Creative Progressive Upscale' },
        },
        '13': { inputs: { filename_prefix: 'upscaled/z_image_creative', images: ['198', 1] }, class_type: 'SaveImage', _meta: { title: 'Save Creative Upscale' } },
    };

    const chainLoras = (modelNodeId: string, loras: ZImageCreativeLora[], prefix: string): string => {
        let currentNodeId = modelNodeId;
        loras.forEach((lora, index) => {
            if (!lora.enabled || !lora.name) return;
            const nodeId = `${prefix}_lora_${index + 1}`;
            workflow[nodeId] = {
                inputs: { lora_name: lora.name, strength_model: lora.strength, model: [currentNodeId, 0] },
                class_type: 'LoraLoaderModelOnly', _meta: { title: `${prefix === 'turbo' ? 'Turbo Generation' : 'Base Refine'} LoRA ${index + 1}` },
            };
            currentNodeId = nodeId;
        });
        return currentNodeId;
    };
    workflow['15'].inputs.model = [chainLoras('54', options.turboLoras, 'turbo'), 0];
    const baseModelNode = chainLoras('1', options.baseLoras, 'base');
    if (objectInfo['PathchSageAttentionKJ']) {
        workflow['144'] = { inputs: { sage_attention: options.sageAttention, allow_compile: options.allowCompile, model: [baseModelNode, 0] }, class_type: 'PathchSageAttentionKJ', _meta: { title: 'Base Refine Sage Attention' } };
        workflow['200'].inputs.model = ['144', 0];
    } else {
        workflow['200'].inputs.model = [baseModelNode, 0];
    }

    const result = await executeWorkflow(workflow, updateProgress, true, 1, ['13'], (nodeId, output) => {
        if (nodeId !== '237') return;
        const rawText = output?.text ?? output?.string ?? output?.value;
        const textValue = Array.isArray(rawText) ? rawText[0] : rawText;
        if (typeof textValue === 'string' && textValue.trim()) onPromptReady?.(textValue.trim());
    });
    if (!result.images[0]) throw new Error('Z-Image Creative Upscale completed without returning an image.');
    return result.images[0];
};

// Helper to upload image to ComfyUI
const uploadImageToComfyUI = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('overwrite', 'true');

    const comfyUrl = localStorage.getItem('comfyui_url') || 'http://127.0.0.1:8188';
    const response = await fetch(`${comfyUrl}/upload/image`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Failed to upload image to ComfyUI: ${response.statusText}`);
    }

    const data = await response.json();
    return data.name;
};

const buildWorkflow = async (options: GenerationOptions, sourceFile: File | null, referenceImages: File[] = []): Promise<any> => {
    let workflow;

    const findNodeKey = (wf: any, identifier: string, by: 'title' | 'class_type' | 'key') => {
        return Object.keys(wf).find(k => {
            const node = wf[k];
            if (by === 'title') {
                const title = node._meta?.title?.toLowerCase();
                if (!title) return false;

                // Make prompt matching more robust to handle different naming conventions
                if (identifier === 'Positive Prompt') {
                    return title.includes('positive prompt') || title.includes('(positive)') || title === 'positive';
                }
                if (identifier === 'Negative Prompt') {
                    return title.includes('negative prompt') || title.includes('(negative)') || title === 'negative';
                }
                return title === identifier.toLowerCase();
            } else if (by === 'class_type') {
                return node.class_type === identifier;
            } else {
                return k === identifier;
            }
        });
    };

    switch (options.comfyModelType) {
        case 'sd1.5': workflow = JSON.parse(JSON.stringify(COMFYUI_SD15_WORKFLOW_TEMPLATE)); break;
        case 'wan2.2': workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-kontext-flux': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_WORKFLOW_TEMPLATE)); break;
        case 'nunchaku-flux-image': workflow = JSON.parse(JSON.stringify(COMFYUI_NUNCHAKU_FLUX_IMAGE_WORKFLOW_TEMPLATE)); break;
        case 'flux-krea': workflow = JSON.parse(JSON.stringify(COMFYUI_FLUX_KREA_WORKFLOW_TEMPLATE)); break;
        case 'face-detailer-sd1.5': workflow = JSON.parse(JSON.stringify(COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE)); break;
        case 'qwen-edit': {
            if (!sourceFile) throw new Error('Qwen Image Edit requires a source image.');
            workflow = JSON.parse(JSON.stringify(COMFYUI_QWEN_EDIT_WORKFLOW_TEMPLATE));

            const inputImages = [sourceFile, ...referenceImages].slice(0, 3);
            const uploadedImages = await Promise.all(inputImages.map(uploadImage));
            workflow["78"].inputs.image = uploadedImages[0].name;
            for (let index = 1; index < uploadedImages.length; index += 1) {
                const nodeId = `qwen_edit_image_${index + 1}`;
                workflow[nodeId] = {
                    inputs: { image: uploadedImages[index].name },
                    class_type: 'LoadImage',
                    _meta: { title: `Source Image ${index + 1}` },
                };
                workflow["110"].inputs[`image${index + 1}`] = [nodeId, 0];
                workflow["111"].inputs[`image${index + 1}`] = [nodeId, 0];
            }

            workflow["110"].inputs.prompt = options.comfyNegativePrompt || '';
            workflow["111"].inputs.prompt = options.comfyPrompt || '';
            workflow["37"].inputs.unet_name = options.comfyQwenEditUnet;
            workflow["116"].inputs.clip_name = options.comfyQwenEditClip;
            workflow["39"].inputs.vae_name = options.comfyQwenEditVae;
            workflow["66"].inputs.shift = options.comfyQwenEditShift ?? 2.5;
            workflow["93"].inputs.megapixels = options.comfyQwenEditMegapixels ?? 1;

            let modelInput: [string, number] = ["37", 0];
            if (options.comfyQwenEditUseLora) {
                for (let index = 1; index <= 5; index += 1) {
                    const name = options[`comfyQwenEditLora${index}Name` as keyof GenerationOptions] as string;
                    if (!name) continue;
                    const strength = options[`comfyQwenEditLora${index}Strength` as keyof GenerationOptions] as number | undefined;
                    const nodeId = `qwen_edit_lora_${index}`;
                    workflow[nodeId] = {
                        inputs: { lora_name: name, strength_model: strength ?? 1, model: modelInput },
                        class_type: 'LoraLoaderModelOnly',
                        _meta: { title: `Qwen Edit LoRA ${index}` },
                    };
                    modelInput = [nodeId, 0];
                }
            }
            workflow["66"].inputs.model = modelInput;
            workflow["3"].inputs.steps = options.comfySteps ?? 8;
            workflow["3"].inputs.cfg = options.comfyCfg ?? 1;
            workflow["3"].inputs.sampler_name = options.comfySampler || 'euler_ancestral';
            workflow["3"].inputs.scheduler = options.comfyScheduler || 'beta57';
            workflow["3"].inputs.seed = options.comfySeed ?? Math.floor(Math.random() * 1e15);
            break;
        }

        case 'flux': {
            workflow = JSON.parse(JSON.stringify(COMFYUI_FLUX_WORKFLOW_TEMPLATE));

            // Set Prompts
            if (workflow["6"]) workflow["6"].inputs.text = options.comfyPrompt || '';
            if (workflow["33"]) {
                workflow["33"].inputs.text = options.comfyNegativePrompt || '';
            }

            // Set Flux Guidance
            if (workflow["35"]) workflow["35"].inputs.guidance = options.comfyFluxGuidance || 3.5;

            // Set Checkpoint
            if (workflow["43"] && options.comfyModel) workflow["43"].inputs.ckpt_name = options.comfyModel;

            // Set CLIPs
            if (workflow["44"]) {
                if (options.comfyFluxClip1) workflow["44"].inputs.clip_name1 = options.comfyFluxClip1;
                if (options.comfyFluxClip2) workflow["44"].inputs.clip_name2 = options.comfyFluxClip2;
            }

            // Set VAE
            if (workflow["45"] && options.comfyFluxVae) {
                workflow["45"].inputs.vae_name = options.comfyFluxVae;
            }

            // Dynamic LoRA Chaining
            let lastModelNodeId = "43"; // Start with CheckpointLoaderSimple

            // Remove template LoRAs first to start clean
            delete workflow["41"];
            delete workflow["42"];

            if (options.comfyFluxUseLora) {
                let currentLoraIndex = 0;
                for (let i = 1; i <= 4; i++) {
                    const loraName = options[`comfyFluxLora${i}Name` as keyof GenerationOptions] as string;
                    const loraStrength = options[`comfyFluxLora${i}Strength` as keyof GenerationOptions] as number;

                    if (loraName && loraName !== 'None') {
                        currentLoraIndex++;
                        const loraNodeId = `lora_${currentLoraIndex}`;
                        workflow[loraNodeId] = {
                            "inputs": {
                                "lora_name": loraName,
                                "strength_model": loraStrength !== undefined ? Number(loraStrength) : 1.0,
                                "model": [
                                    lastModelNodeId,
                                    0
                                ]
                            },
                            "class_type": "LoraLoaderModelOnly",
                            "_meta": {
                                "title": `LoraLoaderModelOnly ${currentLoraIndex}`
                            }
                        };
                        lastModelNodeId = loraNodeId;
                    }
                }
            }

            // Connect last model node to KSampler
            if (workflow["31"]) workflow["31"].inputs.model = [lastModelNodeId, 0];

            // Handle T2I vs Refine (I2I)
            if (options.useRefine && sourceFile) {
                // I2I / Refine Path
                const uploadedImageName = await uploadImageToComfyUI(sourceFile);
                if (workflow["90"]) workflow["90"].inputs.image = uploadedImageName;

                // Ensure KSampler uses VAEEncode (91)
                if (workflow["31"]) workflow["31"].inputs.latent_image = ["91", 0];

                // Set Denoise
                if (workflow["31"]) workflow["31"].inputs.denoise = options.refineDenoise || 0.5;
            } else {
                // T2I Path
                // Ensure KSampler uses EmptySD3LatentImage (27)
                if (workflow["31"]) workflow["31"].inputs.latent_image = ["27", 0];

                // Set Denoise to 1.0 for T2I
                if (workflow["31"]) workflow["31"].inputs.denoise = 1.0;

                // Handle Aspect Ratio
                if (workflow["27"] && options.aspectRatio) {
                    const [w, h] = options.aspectRatio.split(':').map(Number);
                    const baseSize = 1024;
                    const aspect = w / h;

                    let width, height;
                    if (aspect >= 1) {
                        width = baseSize;
                        height = Math.round(baseSize / aspect / 16) * 16;
                    } else {
                        height = baseSize;
                        width = Math.round(baseSize * aspect / 16) * 16;
                    }
                    workflow["27"].inputs.width = width;
                    workflow["27"].inputs.height = height;
                }

                // Set KSampler Parameters
                if (workflow["31"]) {
                    workflow["31"].inputs.steps = options.comfySteps;
                    workflow["31"].inputs.cfg = options.comfyCfg;
                    workflow["31"].inputs.sampler_name = options.comfySampler;
                    workflow["31"].inputs.scheduler = options.comfyScheduler;

                    if (options.comfySeed !== undefined) {
                        workflow["31"].inputs.seed = options.comfySeed;
                        workflow["31"].inputs.control_after_generate = "fixed";
                    } else {
                        workflow["31"].inputs.seed = Math.floor(Math.random() * 1e15);
                        workflow["31"].inputs.control_after_generate = "fixed";
                    }
                }
            }
            break;
        }
        case 'qwen-t2i-gguf': {
            workflow = JSON.parse(JSON.stringify(COMFYUI_QWEN_WORKFLOW_TEMPLATE));

            // Set Prompts
            if (workflow["6"]) workflow["6"].inputs.text = options.comfyPrompt || '';
            if (workflow["7"]) workflow["7"].inputs.text = options.comfyNegativePrompt || '';

            // Set Models
            if (workflow["201"] && options.comfyQwenUnet) workflow["201"].inputs.unet_name = options.comfyQwenUnet;
            if (workflow["80"] && options.comfyQwenClip) workflow["80"].inputs.clip_name = options.comfyQwenClip;
            if (workflow["39"] && options.comfyQwenVae) workflow["39"].inputs.vae_name = options.comfyQwenVae;

            // Set Shift
            if (workflow["66"] && options.comfyQwenShift) workflow["66"].inputs.shift = options.comfyQwenShift;

            // Dynamic LoRA Chaining
            let lastModelNodeId = "201"; // Start with UnetLoaderGGUF

            // Remove template LoRAs first to start clean
            delete workflow["196"];
            delete workflow["197"];
            delete workflow["202"];
            delete workflow["75"];

            if (options.comfyQwenUseLora) {
                let currentLoraIndex = 0;
                for (let i = 1; i <= 4; i++) {
                    const loraName = options[`comfyQwenLora${i}Name` as keyof GenerationOptions] as string;
                    const loraStrength = options[`comfyQwenLora${i}Strength` as keyof GenerationOptions] as number;

                    if (loraName && loraName !== 'None') {
                        currentLoraIndex++;
                        const loraNodeId = `lora_qwen_${currentLoraIndex}`;
                        workflow[loraNodeId] = {
                            "inputs": {
                                "lora_name": loraName,
                                "strength_model": loraStrength !== undefined ? Number(loraStrength) : 1.0,
                                "model": [
                                    lastModelNodeId,
                                    0
                                ]
                            },
                            "class_type": "LoraLoaderModelOnly",
                            "_meta": {
                                "title": `LoraLoaderModelOnly ${currentLoraIndex}`
                            }
                        };
                        lastModelNodeId = loraNodeId;
                    }
                }
            }

            // Connect last model node to ModelSamplingAuraFlow (66)
            if (workflow["66"]) workflow["66"].inputs.model = [lastModelNodeId, 0];

            // Set KSampler Parameters
            if (workflow["3"]) {
                workflow["3"].inputs.steps = options.comfySteps;
                workflow["3"].inputs.cfg = options.comfyCfg;
                workflow["3"].inputs.sampler_name = options.comfySampler;
                workflow["3"].inputs.scheduler = options.comfyScheduler;

                if (options.comfySeed !== undefined) {
                    workflow["3"].inputs.seed = options.comfySeed;
                    workflow["3"].inputs.control_after_generate = "fixed";
                } else {
                    workflow["3"].inputs.seed = Math.floor(Math.random() * 1e15);
                    workflow["3"].inputs.control_after_generate = "fixed";
                }
            }

            // Handle T2I vs Refine (I2I)
            if (options.useRefine && sourceFile) {
                // I2I / Refine Path
                const uploadedImageName = await uploadImageToComfyUI(sourceFile);

                // Add LoadImage node
                workflow["90"] = {
                    "inputs": { "image": uploadedImageName },
                    "class_type": "LoadImage",
                    "_meta": { "title": "Load Image (Refine)" }
                };

                // Add VAEEncode node
                workflow["91"] = {
                    "inputs": {
                        "pixels": ["90", 0],
                        "vae": ["39", 0]
                    },
                    "class_type": "VAEEncode",
                    "_meta": { "title": "VAE Encode" }
                };

                // Ensure KSampler uses VAEEncode (91)
                if (workflow["3"]) workflow["3"].inputs.latent_image = ["91", 0];

                // Set Denoise
                if (workflow["3"]) workflow["3"].inputs.denoise = options.refineDenoise || 0.5;
            } else {
                // T2I Path
                // Ensure KSampler uses EmptySD3LatentImage (58)
                if (workflow["3"]) workflow["3"].inputs.latent_image = ["58", 0];

                // Set Denoise to 1.0 for T2I
                if (workflow["3"]) workflow["3"].inputs.denoise = 1.0;

                // Handle Aspect Ratio
                if (workflow["58"] && options.aspectRatio) {
                    let width = 1024;
                    let height = 1024;

                    switch (options.aspectRatio) {
                        case "1:1": width = 1328; height = 1328; break;
                        case "16:9": width = 1664; height = 928; break;
                        case "9:16": width = 928; height = 1664; break;
                        case "4:3": width = 1472; height = 1140; break;
                        case "3:4": width = 1140; height = 1472; break;
                        case "3:2": width = 1584; height = 1056; break;
                        case "2:3": width = 1056; height = 1584; break;
                        default:
                            // Fallback to generic calculation if ratio not in list
                            const [w, h] = options.aspectRatio.split(':').map(Number);
                            const baseSize = 1024;
                            const aspect = w / h;
                            if (aspect >= 1) {
                                width = baseSize;
                                height = Math.round(baseSize / aspect / 16) * 16;
                            } else {
                                height = baseSize;
                                width = Math.round(baseSize * aspect / 16) * 16;
                            }
                            break;
                    }
                    workflow["58"].inputs.width = width;
                    workflow["58"].inputs.height = height;
                }
            }
            break;
        }
        case 'z-image': {
            workflow = JSON.parse(JSON.stringify(COMFYUI_Z_IMAGE_WORKFLOW_TEMPLATE));

            // 1. Set Prompts
            if (workflow["6"]) workflow["6"].inputs.text = options.comfyPrompt;
            if (workflow["7"]) workflow["7"].inputs.text = options.comfyNegativePrompt;

            // 2. Set Models
            if (workflow["16"] && options.comfyZImageUnet) workflow["16"].inputs.unet_name = options.comfyZImageUnet;
            if (workflow["17"] && options.comfyZImageVae) workflow["17"].inputs.vae_name = options.comfyZImageVae;
            if (workflow["32"] && options.comfyZImageClip) workflow["32"].inputs.clip_name = options.comfyZImageClip;


            // 3. Handle LoRAs (Dynamic Chaining)
            // Chain: Unet (16) -> SageAttention (28) -> LoRAs -> AuraFlow (11) -> KSampler (3)
            // Initial input to LoRA chain is Node 28 (SageAttention)
            let currentModelNode = ["28", 0];

            // Helper to add LoRA node
            const addLoraNode = (name: string, strength: number, previousModel: any[]) => {
                const loraNodeId = (Math.floor(Math.random() * 100000) + 1000).toString();
                workflow[loraNodeId] = {
                    inputs: {
                        lora_name: name,
                        strength_model: strength,
                        model: previousModel
                    },
                    class_type: "LoraLoaderModelOnly",
                    _meta: { title: "LoraLoaderModelOnly (Dynamic)" }
                };
                return [loraNodeId, 0];
            };

            if (options.comfyZImageUseLora) {
                if (options.comfyZImageLora1Name) currentModelNode = addLoraNode(options.comfyZImageLora1Name, options.comfyZImageLora1Strength || 1.0, currentModelNode);
                if (options.comfyZImageLora2Name) currentModelNode = addLoraNode(options.comfyZImageLora2Name, options.comfyZImageLora2Strength || 1.0, currentModelNode);
                if (options.comfyZImageLora3Name) currentModelNode = addLoraNode(options.comfyZImageLora3Name, options.comfyZImageLora3Strength || 1.0, currentModelNode);
                if (options.comfyZImageLora4Name) currentModelNode = addLoraNode(options.comfyZImageLora4Name, options.comfyZImageLora4Strength || 1.0, currentModelNode);
            }

            // Connect final LoRA output to AuraFlow (Node 11) or KSampler (Node 3)
            if (options.comfyZImageUseShift) {
                if (workflow["11"]) {
                    workflow["11"].inputs.model = currentModelNode;
                    if (options.comfyZImageShift !== undefined) workflow["11"].inputs.shift = options.comfyZImageShift;
                }
                // Node 3 is connected to Node 11 in template, so no change needed for Node 3 input if using Shift
            } else {
                // Bypass Node 11 (Shift)
                if (workflow["3"]) workflow["3"].inputs.model = currentModelNode;
            }

            // 4. Set KSampler Parameters
            if (workflow["3"]) {
                if (options.comfySteps) workflow["3"].inputs.steps = options.comfySteps;
                if (options.comfyCfg) workflow["3"].inputs.cfg = options.comfyCfg;
                if (options.comfySampler) workflow["3"].inputs.sampler_name = options.comfySampler;
                if (options.comfyScheduler) workflow["3"].inputs.scheduler = options.comfyScheduler;
                if (options.comfySeed) workflow["3"].inputs.seed = options.comfySeed;
            }

            // 5. Handle Resolution
            if (workflow["13"]) {
                const megapixel = options.megapixel || 1.0;
                const totalPixels = megapixel * 1024 * 1024;
                let ratio = 1.0;

                if (options.aspectRatio) {
                    const [w, h] = options.aspectRatio.split(':').map(Number);
                    if (w && h) ratio = w / h;
                }

                const width = Math.round(Math.sqrt(totalPixels * ratio));
                const height = Math.round(Math.sqrt(totalPixels / ratio));

                // Ensure divisible by 16 (or 64 as per FluxResolutionNode?)
                // User said "mimic exact ratio and size available in node FLUX RESOLUTION CALC".
                // But also said "do the math" based on megapixel.
                // I'll stick to the math + rounding to 16 or 64.
                // Flux usually likes 16. The template had "divisible_by": "64" in Node 29.
                // I'll round to 64 to be safe for Z-Image/Flux.
                workflow["13"].inputs.width = Math.round(width / 64) * 64;
                workflow["13"].inputs.height = Math.round(height / 64) * 64;
            }

            // 6. Handle Refine (I2I)
            // 6. Handle Refine (I2I)
            if (options.useRefine && sourceFile) {
                const uploadedImageName = await uploadImageToComfyUI(sourceFile);
                // Add LoadImage (Node 90)
                workflow["90"] = {
                    inputs: { image: uploadedImageName, upload: "image" },
                    class_type: "LoadImage",
                    _meta: { title: "Load Image (Refine)" }
                };

                // Add VAEEncode (Node 91)
                workflow["91"] = {
                    inputs: {
                        pixels: ["90", 0],
                        vae: ["17", 0] // Use same VAE as T2I
                    },
                    class_type: "VAEEncode",
                    _meta: { title: "VAE Encode (Refine)" }
                };

                // Connect VAEEncode to KSampler (Node 3)
                if (workflow["3"]) {
                    workflow["3"].inputs.latent_image = ["91", 0];
                    workflow["3"].inputs.denoise = options.refineDenoise || 0.5;
                }
            } else {
                // T2I Path
                if (workflow["3"]) {
                    workflow["3"].inputs.latent_image = ["13", 0]; // EmptySD3LatentImage
                    workflow["3"].inputs.denoise = 1.0;
                }
            }
            break;
        }
        case 'sdxl':
        default: workflow = JSON.parse(JSON.stringify(COMFYUI_WORKFLOW_TEMPLATE)); break;
    }

    const posPromptKey = findNodeKey(workflow, "Positive Prompt", 'title');
    if (posPromptKey) {
        const promptInput = 'prompt' in workflow[posPromptKey].inputs ? 'prompt' : 'text';
        workflow[posPromptKey].inputs[promptInput] = options.comfyPrompt || '';
    }

    const negPromptKey = findNodeKey(workflow, "Negative Prompt", 'title');
    if (negPromptKey) {
        const promptInput = 'prompt' in workflow[negPromptKey].inputs ? 'prompt' : 'text';
        workflow[negPromptKey].inputs[promptInput] = options.comfyNegativePrompt || '';
    }

    if (['sd1.5', 'sdxl'].includes(options.comfyModelType!)) {
        const ckptLoaderKey = findNodeKey(workflow, "CheckpointLoaderSimple", 'class_type');
        if (ckptLoaderKey && options.comfyModel) workflow[ckptLoaderKey].inputs.ckpt_name = options.comfyModel;

        // SD 1.5 LoRA Injection
        let currentModelNodeId = ckptLoaderKey;
        let currentClipNodeId = ckptLoaderKey;

        if (options.comfyModelType === 'sd1.5' && options.comfySd15UseLora) {
            for (let i = 1; i <= 4; i++) {
                const loraName = options[`comfySd15Lora${i}Name` as keyof GenerationOptions] as string;
                const loraStrength = options[`comfySd15Lora${i}Strength` as keyof GenerationOptions] as number;

                if (loraName) {
                    const loraNodeId = `lora_sd15_${i}`;
                    const loraNode = {
                        "inputs": {
                            "lora_name": loraName,
                            "strength_model": loraStrength,
                            "strength_clip": loraStrength,
                            "model": [currentModelNodeId, 0],
                            "clip": [currentClipNodeId, 1]
                        },
                        "class_type": "LoraLoader",
                        "_meta": { "title": `LoRA ${i}` }
                    };
                    workflow[loraNodeId] = loraNode;
                    currentModelNodeId = loraNodeId;
                    currentClipNodeId = loraNodeId;
                }
            }
        } else if (options.comfyModelType === 'sdxl' && options.comfySdxlUseLora) {
            for (let i = 1; i <= 4; i++) {
                const loraName = options[`comfySdxlLora${i}Name` as keyof GenerationOptions] as string;
                const loraStrength = options[`comfySdxlLora${i}Strength` as keyof GenerationOptions] as number;

                if (loraName) {
                    const loraNodeId = `lora_sdxl_${i}`;
                    const loraNode = {
                        "inputs": {
                            "lora_name": loraName,
                            "strength_model": loraStrength,
                            "strength_clip": loraStrength,
                            "model": [currentModelNodeId, 0],
                            "clip": [currentClipNodeId, 1]
                        },
                        "class_type": "LoraLoader",
                        "_meta": { "title": `LoRA ${i}` }
                    };
                    workflow[loraNodeId] = loraNode;
                    currentModelNodeId = loraNodeId;
                    currentClipNodeId = loraNodeId;
                }
            }
        }

        const ksamplerKey = findNodeKey(workflow, "KSampler", 'class_type');
        if (ksamplerKey) {
            const ksampler = workflow[ksamplerKey];
            ksampler.inputs.model = [currentModelNodeId, 0]; // Connect model from last LoRA or Checkpoint

            // Connect CLIP to Positive/Negative prompts
            if (posPromptKey) workflow[posPromptKey].inputs.clip = [currentClipNodeId, 1];
            if (negPromptKey) workflow[negPromptKey].inputs.clip = [currentClipNodeId, 1];

            ksampler.inputs.steps = options.comfySteps;
            ksampler.inputs.cfg = options.comfyCfg;
            ksampler.inputs.sampler_name = options.comfySampler;
            ksampler.inputs.scheduler = options.comfyScheduler;

            // Ensure seed is set and fixed for export/reproducibility
            if (options.comfySeed !== undefined) {
                ksampler.inputs.seed = options.comfySeed;
                ksampler.inputs.control_after_generate = "fixed";
            } else {
                // If no seed provided, ensure we have a random one but set to fixed so it doesn't change on load
                ksampler.inputs.seed = Math.floor(Math.random() * 1e15);
                ksampler.inputs.control_after_generate = "fixed";
            }
        }

        const latentKey = findNodeKey(workflow, "EmptyLatentImage", 'class_type');

        // Refine Feature Logic (SD 1.5 and SDXL)
        if ((options.comfyModelType === 'sd1.5' || options.comfyModelType === 'sdxl') && options.useRefine && sourceFile) {
            // Upload the source image
            const filename = await uploadImageToComfyUI(sourceFile);

            // Add LoadImage node
            const loadImageNode = {
                "inputs": { "image": filename },
                "class_type": "LoadImage",
                "_meta": { "title": "Load Image (Refine)" }
            };
            workflow["100"] = loadImageNode; // Using ID 100 to avoid conflicts

            // Add ImageScaleToTotalPixels node
            const scaleNode = {
                "inputs": {
                    "upscale_method": "lanczos",
                    "megapixels": options.refineMegapixels || 0.5,
                    "image": ["100", 0]
                },
                "class_type": "ImageScaleToTotalPixels",
                "_meta": { "title": "Scale Image" }
            };
            workflow["101"] = scaleNode;

            // Add VAEEncode node
            const vaeEncodeNode = {
                "inputs": {
                    "pixels": ["101", 0],
                    "vae": [ckptLoaderKey, 2]
                },
                "class_type": "VAEEncode",
                "_meta": { "title": "VAE Encode" }
            };
            workflow["102"] = vaeEncodeNode;

            // Connect VAEEncode to KSampler
            if (ksamplerKey) {
                workflow[ksamplerKey].inputs.latent_image = ["102", 0];
                workflow[ksamplerKey].inputs.denoise = options.refineDenoise || 0.5;
            }

            // Remove EmptyLatentImage if it exists, as we are using VAEEncode
            if (latentKey) delete workflow[latentKey];

        } else if (latentKey) {
            // Standard T2I Logic
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const isSD15 = options.comfyModelType === 'sd1.5';
            const baseSize = isSD15 ? 512 : 1024;
            const aspect = w / h;

            let width, height;
            if (aspect >= 1) {
                width = baseSize;
                height = Math.round(baseSize / aspect / 8) * 8;
            } else {
                height = baseSize;
                width = Math.round(baseSize * aspect / 8) * 8;
            }
            workflow[latentKey].inputs.width = width;
            workflow[latentKey].inputs.height = height;
        }
    }
    else if (options.comfyModelType === 'wan2.2') {
        workflow["38"].inputs.unet_name = options.comfyWanHighNoiseModel;
        workflow["39"].inputs.unet_name = options.comfyWanLowNoiseModel;
        workflow["22"].inputs.clip_name = options.comfyWanClipModel;
        if (options.comfyWanClipModel?.toLowerCase().endsWith('.gguf')) {
            workflow["22"].class_type = 'CLIPLoaderGGUF';
            workflow["22"]._meta.title = 'CLIPLoaderGGUF';
        } else {
            workflow["22"].class_type = 'CLIPLoader';
            workflow["22"]._meta.title = 'CLIP Loader';
        }
        workflow["8"].inputs.vae_name = options.comfyWanVaeModel;

        const [w, h] = options.aspectRatio.split(':').map(Number);
        const aspect = w / h;
        const baseSize = 1024;
        let width, height;
        if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
        else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
        workflow["5"].inputs.width = width;
        workflow["5"].inputs.height = height;

        const sampler1 = workflow["35"];
        const sampler2 = workflow["36"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfySteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfySampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyScheduler;
        sampler2.inputs.start_at_step = options.comfyWanRefinerStartStep;
        sampler1.inputs.end_at_step = options.comfyWanRefinerStartStep;

        if (!options.comfyWanUseFusionXLora) { delete workflow["30"]; delete workflow["43"]; workflow["29"].inputs.model = ["38", 0]; workflow["29"].inputs.clip = ["22", 0]; workflow["44"].inputs.model = ["39", 0]; }
        if (!options.comfyWanUseLightningLora) { delete workflow["29"]; delete workflow["44"]; workflow["14"].inputs.model = options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]; workflow["14"].inputs.clip = options.comfyWanUseFusionXLora ? ["30", 1] : ["22", 0]; workflow["45"].inputs.model = options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]; }
        if (!options.comfyWanUseStockPhotoLora) { delete workflow["14"]; delete workflow["45"]; sampler1.inputs.model = options.comfyWanUseLightningLora ? ["29", 0] : (options.comfyWanUseFusionXLora ? ["30", 0] : ["38", 0]); sampler2.inputs.model = options.comfyWanUseLightningLora ? ["44", 0] : (options.comfyWanUseFusionXLora ? ["43", 0] : ["39", 0]); }
    }
    else if (options.comfyModelType === 'nunchaku-kontext-flux') {
        if (sourceFile) { workflow["99"].inputs.image = (await uploadImage(sourceFile)).name; }
        workflow["22"].inputs.model_path = options.comfyNunchakuModel;
        workflow["1"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["2"].inputs.clip_name1 = options.comfyNunchakuClipL;
        workflow["2"].inputs.clip_name2 = options.comfyNunchakuT5XXL;
        const ksampler = workflow["20"];
        ksampler.inputs.steps = options.comfySteps; ksampler.inputs.cfg = options.comfyCfg; ksampler.inputs.sampler_name = options.comfySampler; ksampler.inputs.scheduler = options.comfyScheduler;
        workflow["12"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["22"].inputs.cache_threshold = options.comfyNunchakuCacheThreshold ?? 0.12;
        workflow["22"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["22"].inputs.attention = options.comfyNunchakuAttention;

        let lastLoraNode = "22";
        if (options.comfyNunchakuUseTurboLora) { workflow["26"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "26"; } else { delete workflow["26"]; }
        if (options.comfyNunchakuUseNudifyLora) { workflow["27"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "27"; } else { delete workflow["27"]; }
        if (options.comfyNunchakuUseDetailLora) { workflow["28"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "28"; } else { delete workflow["28"]; }
        ksampler.inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'nunchaku-flux-image') {
        workflow["45"].inputs.model_path = options.comfyNunchakuModel;
        workflow["10"].inputs.vae_name = options.comfyNunchakuVae;
        workflow["44"].inputs.text_encoder1 = options.comfyNunchakuClipL;
        workflow["44"].inputs.text_encoder2 = options.comfyNunchakuT5XXL;
        workflow["17"].inputs.steps = options.comfySteps;
        workflow["16"].inputs.sampler_name = options.comfySampler;
        workflow["17"].inputs.scheduler = options.comfyScheduler;
        workflow["26"].inputs.guidance = options.comfyFluxGuidanceKontext;
        workflow["30"].inputs.base_shift = options.comfyNunchakuBaseShift;
        workflow["30"].inputs.max_shift = options.comfyNunchakuMaxShift;
        workflow["45"].inputs.cpu_offload = options.comfyNunchakuCpuOffload;
        workflow["45"].inputs.attention = options.comfyNunchakuAttention;
        workflow["45"].inputs.cache_threshold = options.comfyNunchakuCacheThreshold ?? 0;

        const latentKey = findNodeKey(workflow, "EmptySD3LatentImage", 'class_type');
        if (latentKey) {
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const aspect = w / h;
            const baseSize = 768;
            let width, height;
            if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
            else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
            workflow[latentKey].inputs.width = width; workflow[latentKey].inputs.height = height;
            const modelSamplingKey = findNodeKey(workflow, "ModelSamplingFlux", "class_type");
            if (modelSamplingKey) { workflow[modelSamplingKey].inputs.width = width; workflow[modelSamplingKey].inputs.height = height; }
        }

        let lastLoraNode = "45";
        if (options.comfyNunchakuUseTurboLora) { workflow["46"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "46"; } else { delete workflow["46"]; }
        if (options.comfyNunchakuUseNudifyLora) { workflow["48"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "48"; } else { delete workflow["48"]; }
        if (options.comfyNunchakuUseDetailLora) { workflow["47"].inputs.model = [lastLoraNode, 0]; lastLoraNode = "47"; } else { delete workflow["47"]; }
        workflow["30"].inputs.model = [lastLoraNode, 0];
    }
    else if (options.comfyModelType === 'flux-krea') {
        workflow["186"].inputs.unet_name = options.comfyFluxKreaModel;
        workflow["26"].inputs.clip_name2 = options.comfyFluxKreaClipT5;
        workflow["26"].inputs.clip_name1 = options.comfyFluxKreaClipL;
        workflow["27"].inputs.vae_name = options.comfyFluxKreaVae;
        workflow["163"].inputs.steps = options.comfySteps;
        workflow["163"].inputs.sampler_name = options.comfySampler;
        workflow["163"].inputs.scheduler = options.comfyScheduler;
        const latentKey = findNodeKey(workflow, "EmptySD3LatentImage", 'class_type');
        if (latentKey) {
            const [w, h] = options.aspectRatio.split(':').map(Number);
            const aspect = w / h;
            const baseSize = 1024;
            let width, height;
            if (aspect >= 1) { width = baseSize; height = Math.round(baseSize / aspect / 8) * 8; }
            else { height = baseSize; width = Math.round(baseSize * aspect / 8) * 8; }
            workflow[latentKey].inputs.width = width;
            workflow[latentKey].inputs.height = height;
        }

        const loraLoader = workflow["191"];
        loraLoader.widgets_values[2].on = options.useP1x4r0maWomanLora;
        loraLoader.widgets_values[3].on = options.useNippleDiffusionLora;
        loraLoader.widgets_values[4].on = options.usePussyDiffusionLora;

        if (!options.comfyFluxKreaUseUpscaler) {
            workflow["51"].mode = workflow["100"].mode = workflow["102"].mode = workflow["110"].mode = workflow["111"].mode = workflow["170"].mode = 4;
        }
    } else if (options.comfyModelType === 'face-detailer-sd1.5') {
        workflow = JSON.parse(JSON.stringify(COMFYUI_FACE_DETAILER_WORKFLOW_TEMPLATE));
        if (sourceFile) {
            workflow["72"].inputs.image = (await uploadImage(sourceFile)).name;
        }
        // Fix: Correctly modify the 'inputs' object for each node, not a non-existent 'widgets_values' array.
        workflow["4"].inputs.ckpt_name = options.comfyModel;
        workflow["53"].inputs.model_name = options.comfyDetailerBboxModel;
        workflow["16"].inputs.model_name = options.comfyDetailerSamModel;
        workflow["5"].inputs.text = options.comfyPrompt;
        workflow["6"].inputs.text = options.comfyNegativePrompt;

        const detailerNodeInputs = workflow["51"].inputs;
        detailerNodeInputs.steps = options.comfyDetailerSteps;
        detailerNodeInputs.cfg = options.comfyDetailerCfg;
        detailerNodeInputs.sampler_name = options.comfyDetailerSampler;
        detailerNodeInputs.scheduler = options.comfyDetailerScheduler;
        detailerNodeInputs.denoise = options.comfyDetailerDenoise;
        detailerNodeInputs.feather = options.comfyDetailerFeather;
        detailerNodeInputs.bbox_threshold = options.comfyDetailerBboxThreshold;
        detailerNodeInputs.bbox_dilation = options.comfyDetailerBboxDilation;
        detailerNodeInputs.bbox_crop_factor = options.comfyDetailerBboxCropFactor;



        return workflow;
    }

    return workflow;
};

export const generateComfyUIPortraits = async (
    sourceImage: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
    referenceImages: File[] = [],
): Promise<{ images: { src: string, seed: number }[]; finalPrompt: string }> => {
    const allImages: { src: string, seed: number }[] = [];
    const baseWorkflow = await buildWorkflow(options, sourceImage, referenceImages);

    const isLongJob = ['flux-krea', 'nunchaku-kontext-flux', 'face-detailer-sd1.5', 'qwen-t2i-gguf', 'qwen-edit'].includes(options.comfyModelType!);
    const numImages = options.comfyModelType === 'face-detailer-sd1.5' ? 1 : options.numImages;

    let currentSeed = options.comfySeed ?? Math.floor(Math.random() * 1e15);

    for (let i = 0; i < numImages; i++) {
        const currentWorkflow = JSON.parse(JSON.stringify(baseWorkflow));

        // Capture the seed used for this iteration before it gets updated for the next one
        const seedForThisImage = currentSeed;

        const samplerKey = Object.keys(currentWorkflow).find(k => currentWorkflow[k].class_type.toLowerCase().startsWith('ksampler'));
        if (samplerKey) {
            currentWorkflow[samplerKey].inputs.seed = seedForThisImage;

            const seedControl = options.comfyModelType === 'sd1.5' ? (options.comfySeedControl || 'randomize') : 'randomize';
            const seedIncrement = options.comfySeedIncrement || 1;

            switch (seedControl) {
                case 'increment':
                    currentSeed += seedIncrement;
                    break;
                case 'decrement':
                    currentSeed -= seedIncrement;
                    break;
                case 'randomize':
                    currentSeed = Math.floor(Math.random() * 1e15);
                    break;
                case 'fixed':
                default:
                    // Seed remains unchanged
                    break;
            }
        }

        const progressWrapper = (message: string, value: number) => {
            const overallProgress = (i + value) / numImages;
            updateProgress(`Image ${i + 1}/${numImages}: ${message}`, overallProgress);
        };

        try {
            const result = await executeWorkflow(currentWorkflow, progressWrapper, isLongJob);
            result.images.forEach(img => allImages.push({ src: img, seed: seedForThisImage }));
        } catch (error) {
            console.error(`Error generating image ${i + 1}:`, error);
            throw error;
        }
    }

    // RE-WRITING THE FUNCTION CONTENT FOR REPLACEMENT
    // I will capture the seed used before modifying it for the next iteration.

    return { images: allImages, finalPrompt: options.comfyPrompt || '' };
};

export const generateComfyUICharacterAngles = async (
    sourceImage: File,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void,
): Promise<{ images: { src: string; seed: number }[]; finalPrompt: string }> => {
    updateProgress('Uploading character source...', 0.05);
    const uploadedImage = await uploadImage(sourceImage);
    const { workflow, prompts, seed } = buildCharacterAnglesWorkflow(uploadedImage.name, options);
    const outputCount = prompts.length;
    const result = await executeWorkflow(
        workflow,
        updateProgress,
        true,
        outputCount,
        Array.from({ length: outputCount }, (_, index) => `save_${index}`),
    );
    if (result.images.length !== outputCount) {
        throw new Error(`ComfyUI returned ${result.images.length}/${outputCount} character outputs.`);
    }
    return {
        images: result.images.map((src, index) => ({ src, seed: seed + index })),
        finalPrompt: prompts.join('\n\n'),
    };
};

export const generateComfyUIVideo = async (
    startFrame: File | null,
    endFrame: File | null,
    options: GenerationOptions,
    updateProgress: (message: string, value: number) => void
): Promise<{ videoUrl: string, finalPrompt: string }> => {
    let workflow;
    let finalPrompt = '';

    if (options.comfyVidModelType === 'wan-t2v') {
        workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_T2I_WORKFLOW_TEMPLATE));
        finalPrompt = options.comfyVidWanT2VPositivePrompt || '';

        workflow["6"].inputs.text = options.comfyVidWanT2VPositivePrompt;
        workflow["7"].inputs.text = options.comfyVidWanT2VNegativePrompt;

        // Models
        workflow["105"].inputs.unet_name = options.comfyVidWanT2VHighNoiseModel;
        workflow["106"].inputs.unet_name = options.comfyVidWanT2VLowNoiseModel;
        workflow["107"].inputs.clip_name = options.comfyVidWanT2VClipModel;
        workflow["39"].inputs.vae_name = options.comfyVidWanT2VVaeModel;

        // Latent
        const latentNode = workflow["117"];
        latentNode.inputs.width = options.comfyVidWanT2VWidth;
        latentNode.inputs.height = options.comfyVidWanT2VHeight;
        latentNode.inputs.length = options.comfyVidWanT2VFrameCount;

        // Samplers
        const sampler1 = workflow["101"];
        const sampler2 = workflow["102"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfyVidWanT2VSteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyVidWanT2VCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfyVidWanT2VSampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyVidWanT2VScheduler;
        sampler1.inputs.end_at_step = options.comfyVidWanT2VRefinerStartStep;
        sampler2.inputs.start_at_step = options.comfyVidWanT2VRefinerStartStep;
        sampler1.inputs.noise_seed = options.comfyVidWanT2VNoiseSeed ?? Math.floor(Math.random() * 1e15);
        sampler1.inputs.control_after_generate = options.comfyVidWanT2VSeedControl || 'randomize';

        // LoRA Chaining
        let highNoiseModelInput: [string, number] = ["105", 0];
        let lowNoiseModelInput: [string, number] = ["106", 0];

        if (options.comfyVidWanT2VUseOptionalLora && options.comfyVidWanT2VOptionalLoraName) {
            workflow["optional_lora_high"] = { inputs: { lora_name: options.comfyVidWanT2VOptionalLoraName, strength_model: options.comfyVidWanT2VOptionalLoraStrength, model: highNoiseModelInput }, class_type: "LoraLoaderModelOnly" };
            workflow["optional_lora_low"] = { inputs: { lora_name: options.comfyVidWanT2VOptionalLoraName, strength_model: options.comfyVidWanT2VOptionalLoraStrength, model: lowNoiseModelInput }, class_type: "LoraLoaderModelOnly" };
            highNoiseModelInput = ["optional_lora_high", 0];
            lowNoiseModelInput = ["optional_lora_low", 0];
        }

        if (options.comfyVidWanT2VUseLightningLora) {
            workflow["94"].inputs.model = highNoiseModelInput;
            workflow["94"].inputs.lora_name = options.comfyVidWanT2VLightningLoraHigh;
            workflow["94"].inputs.strength_model = options.comfyVidWanT2VLightningLoraStrengthHigh;
            workflow["95"].inputs.model = lowNoiseModelInput;
            workflow["95"].inputs.lora_name = options.comfyVidWanT2VLightningLoraLow;
            workflow["95"].inputs.strength_model = options.comfyVidWanT2VLightningLoraStrengthLow;
        } else {
            delete workflow["94"];
            delete workflow["95"];
            workflow["79"].inputs.model = highNoiseModelInput;
            workflow["93"].inputs.model = lowNoiseModelInput;
        }

        // Post-processing
        workflow["111"].inputs.frame_rate = options.comfyVidWanT2VFrameRate;
        workflow["111"].inputs.format = options.comfyVidWanT2VVideoFormat;
        if (options.comfyVidWanT2VUseFilmGrain) {
            workflow["114"].inputs.grain_intensity = options.comfyVidWanT2VFilmGrainIntensity;
            workflow["114"].inputs.saturation_mix = options.comfyVidWanT2VFilmGrainSaturation;
        } else {
            delete workflow["114"];
            workflow["111"].inputs.images = ["8", 0];
        }
    } else { // Existing I2V logic
        if (!startFrame) throw new Error("A start frame is required for Image-to-Video generation.");
        workflow = JSON.parse(JSON.stringify(COMFYUI_WAN22_I2V_WORKFLOW_TEMPLATE));
        finalPrompt = options.comfyVidWanI2VPositivePrompt || '';

        updateProgress("Uploading start frame...", 0.05);
        const startFrameInfo = await uploadImage(startFrame);

        workflow["52"].inputs.image = startFrameInfo.name;
        workflow["105"].inputs.unet_name = options.comfyVidWanI2VHighNoiseModel;
        workflow["106"].inputs.unet_name = options.comfyVidWanI2VLowNoiseModel;
        workflow["107"].inputs.clip_name = options.comfyVidWanI2VClipModel;
        workflow["39"].inputs.vae_name = options.comfyVidWanI2VVaeModel;
        workflow["49"].inputs.clip_name = options.comfyVidWanI2VClipVisionModel;
        workflow["112"].inputs.string = options.comfyVidWanI2VPositivePrompt;
        workflow["7"].inputs.text = options.comfyVidWanI2VNegativePrompt;

        const mainNode = workflow["83"];
        mainNode.inputs.length = options.comfyVidWanI2VFrameCount;
        mainNode.inputs.width = options.comfyVidWanI2VWidth;
        mainNode.inputs.height = options.comfyVidWanI2VHeight;

        const useEndFrame = endFrame && options.comfyVidWanI2VUseEndFrame;
        if (useEndFrame) {
            updateProgress("Uploading end frame...", 0.1);
            const endFrameInfo = await uploadImage(endFrame);
            workflow["72"].inputs.image = endFrameInfo.name;
        } else {
            delete workflow["72"];
            delete workflow["87"];
            delete mainNode.inputs.end_image;
            delete mainNode.inputs.clip_vision_end_image;
        }

        const sampler1 = workflow["101"];
        const sampler2 = workflow["102"];
        sampler1.inputs.steps = sampler2.inputs.steps = options.comfyVidWanI2VSteps;
        sampler1.inputs.cfg = sampler2.inputs.cfg = options.comfyVidWanI2VCfg;
        sampler1.inputs.sampler_name = sampler2.inputs.sampler_name = options.comfyVidWanI2VSampler;
        sampler1.inputs.scheduler = sampler2.inputs.scheduler = options.comfyVidWanI2VScheduler;
        sampler1.inputs.end_at_step = options.comfyVidWanI2VRefinerStartStep;
        sampler2.inputs.start_at_step = options.comfyVidWanI2VRefinerStartStep;
        sampler1.inputs.noise_seed = options.comfyVidWanI2VNoiseSeed ?? Math.floor(Math.random() * 1e15);
        sampler1.inputs.control_after_generate = options.comfyVidWanI2VSeedControl || 'randomize';

        if (options.comfyVidWanI2VUseLightningLora) {
            workflow["94"].inputs.lora_name = options.comfyVidWanI2VHighNoiseLora;
            workflow["94"].inputs.strength_model = options.comfyVidWanI2VHighNoiseLoraStrength;
            workflow["95"].inputs.lora_name = options.comfyVidWanI2VLowNoiseLora;
            workflow["95"].inputs.strength_model = options.comfyVidWanI2VLowNoiseLoraStrength;
        } else {
            delete workflow["94"];
            delete workflow["95"];
            workflow["79"].inputs.model = ["105", 0];
            workflow["93"].inputs.model = ["106", 0];
        }

        workflow["111"].inputs.frame_rate = options.comfyVidWanI2VFrameRate;
        workflow["111"].inputs.format = options.comfyVidWanI2VVideoFormat;

        if (options.comfyVidWanI2VUseFilmGrain) {
            workflow["114"].inputs.grain_intensity = options.comfyVidWanI2VFilmGrainIntensity;
            workflow["114"].inputs.saturation_mix = options.comfyVidWanI2VFilmGrainSize;
        } else {
            delete workflow["114"];
            workflow["111"].inputs.images = ["8", 0];
        }
    }

    // --- Execution ---
    const { videoUrl } = await executeWorkflow(workflow, updateProgress, true);
    if (!videoUrl) throw new Error("Generation finished, but no video file was found.");

    return { videoUrl, finalPrompt };
};

export interface LtxDirectorOptions {
    frameRate: number;
    guideStrength: number;
    seed?: number;
    checkpoint: string;
    loras: Array<{ enabled: boolean; name: string; strength: number }>;
}

export interface LtxDirectorSegment {
    image: File | null;
    prompt: string;
    durationSeconds: number;
}

export const generateLtxDirectorVideo = async (
    segments: LtxDirectorSegment[],
    audio: File | null,
    options: LtxDirectorOptions,
    updateProgress: (message: string, value: number) => void,
): Promise<string> => {
    const workflow = JSON.parse(JSON.stringify(LTX_DIRECTOR_WORKFLOW_TEMPLATE));
    const timelineSegments = [];
    const segmentLengths = [];
    let startFrame = 0;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const length = Math.max(19, Math.round((segment.durationSeconds * 23 - 3) / 8) * 8 + 3);
        segmentLengths.push(length);
        if (segment.image) {
            updateProgress(`Uploading image ${index + 1} of ${segments.length}...`, 0.03 + (index / segments.length) * 0.07);
            const imageInfo = await uploadLtxMedia(segment.image);
            timelineSegments.push({
                id: crypto.randomUUID(),
                start: startFrame,
                length,
                prompt: segment.prompt,
                type: 'image',
                imageFile: imageInfo.name,
                imageB64: `/api/view?filename=${encodeURIComponent(imageInfo.name)}&type=${encodeURIComponent(imageInfo.type || 'input')}&subfolder=${encodeURIComponent(imageInfo.subfolder || '')}`,
            });
        }
        startFrame += length;
    }

    let audioSegments: unknown[] = [];
    if (audio) {
        updateProgress('Uploading soundtrack...', 0.1);
        const audioInfo = await uploadLtxMedia(audio);
        audioSegments = [{
            id: crypto.randomUUID(), start: 0, length: startFrame,
            audioFile: audioInfo.name,
            audioB64: `/api/view?filename=${encodeURIComponent(audioInfo.name)}&type=${encodeURIComponent(audioInfo.type || 'input')}&subfolder=${encodeURIComponent(audioInfo.subfolder || '')}`,
        }];
    }

    const durationSeconds = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
    const prompts = segments.map((segment) => segment.prompt);
    const timeline = {
        segments: timelineSegments,
        audioSegments,
    };
    Object.assign(workflow['46'].inputs, {
        global_prompt: prompts.join('\n'),
        duration_frames: startFrame,
        duration_seconds: durationSeconds,
        timeline_data: JSON.stringify(timeline),
        local_prompts: prompts.join('|'),
        segment_lengths: segmentLengths.join(','),
        guide_strength: options.guideStrength.toFixed(2),
        use_custom_audio: Boolean(audio),
        frame_rate: options.frameRate,
    });
    workflow['28'].inputs.noise_seed = options.seed ?? Math.floor(Math.random() * 1e15);
    workflow['79'].inputs.preview_rate = options.frameRate;
    workflow['77'].inputs.ckpt_name = options.checkpoint;

    delete workflow['80'];
    delete workflow['93'];
    delete workflow['96'];
    let modelInput: [string, number] = ['79', 0];
    options.loras.filter((lora) => lora.enabled && lora.name).forEach((lora, index) => {
        const nodeId = `ltx_director_lora_${index + 1}`;
        workflow[nodeId] = {
            inputs: {
                lora_name: lora.name,
                strength_model: lora.strength,
                model: modelInput,
            },
            class_type: 'LoraLoaderModelOnly',
        };
        modelInput = [nodeId, 0];
    });
    workflow['46'].inputs.model = modelInput;

    const { videoUrl } = await executeWorkflow(workflow, updateProgress, true);
    if (!videoUrl) throw new Error('LTX Director finished without a video output. Verify its custom nodes and models in ComfyUI.');
    return videoUrl;
};

export const exportComfyUIWorkflow = async (options: GenerationOptions, sourceFile: File | null, referenceImages: File[] = []): Promise<void> => {
    const workflow = await buildWorkflow(options, sourceFile, referenceImages);
    const jsonString = JSON.stringify(workflow, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfyui_workflow_${options.comfyModelType}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};