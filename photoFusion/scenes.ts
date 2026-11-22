export type FusionEngine = 'comfyui' | 'qwen' | 'gemini' | 'mammouth';
export type FusionDetail = 'standard' | 'high' | 'max';

export interface FusionSubject {
    id: string;
    file: File;
    previewUrl: string;
    expression: string;
    knownAs?: string;
}

export interface FusionResult {
    id: string;
    status: 'running' | 'done' | 'failed';
    progress: number;
    note: string;
    dataUrl?: string;
    seed?: number;
    error?: string;
    saved: 'no' | 'saving' | 'yes';
}

export interface FusionScene {
    id: string;
    title: string;
    summary: string;
    action: string;
    light: string;
    place: string;
    framing?: string;
    /** Extra instruction when the user supplies a background image. */
    backdropNote?: string;
    /** Exact number of people the scene is written for. */
    people?: number;
    /** The scene always uses its own setting, even when a background image is supplied. */
    ownSetting?: boolean;
}

export const FUSION_SCENES: FusionScene[] = [
    { id: 'friends-afternoon', title: "Friends' Afternoon", summary: 'Relaxed friends sharing an easy, happy moment.',
        action: 'They are gathered loosely, some leaning on each other, chatting and smiling as if the camera arrived mid-conversation.',
        light: 'soft daylight with gentle shadows', place: 'a sunlit backyard terrace with greenery softly blurred behind them' },
    { id: 'team-portrait', title: 'Team Portrait', summary: 'Polished group portrait for a company page.',
        action: 'They stand in two loose rows, shoulders angled toward the centre, facing the lens with calm, approachable expressions.',
        light: 'even, bright studio light without harsh shadows', place: 'a modern open-plan office, kept softly out of focus' },
    { id: 'record-sleeve', title: 'Record Sleeve', summary: 'Moody artwork for a band release.',
        action: 'They are spaced unevenly across the frame, each looking in a different direction, with no posed grins.',
        light: 'hard side light with deep contrast and visible film grain', place: 'a rain-wet alley at night lit by a single street lamp' },
    { id: 'film-poster', title: 'Film Poster', summary: 'Bold key-art composition; always uses its own setting.', ownSetting: true,
        action: 'They are layered at different depths, the front person largest, everyone gazing past the camera with resolve.',
        light: 'strong rim light, dark falloff and drifting haze', place: 'a dark, textured void with a faint glow on the horizon' },
    { id: 'monochrome-studio', title: 'Monochrome Studio', summary: 'Black-and-white studio portrait; always uses its own setting.', ownSetting: true,
        action: 'They sit and stand close together in a simple, balanced arrangement, looking softly at the lens.',
        light: 'a single soft key light, rendered in black and white with deep blacks and clean highlights', place: 'a plain charcoal paper backdrop' },
    { id: 'cheek-kiss', title: 'Cheek Kiss', summary: 'Playful moment for exactly two people.', people: 2,
        action: "One person plants a light kiss on the other's cheek while both break into laughter.",
        light: 'warm, cheerful light', place: 'a colourful fairground at dusk' },
    { id: 'photo-strip', title: 'Photo Strip', summary: 'Four booth frames stacked in one vertical strip.',
        action: 'They squeeze together in front of the booth camera.',
        framing: 'Compose the output as one vertical strip of four separate frames showing the same people, with a new playful expression in each frame: grinning, pulling faces, surprised, laughing.',
        light: 'direct flash with a quick falloff', place: 'a plain pale booth curtain', backdropNote: 'The background image replaces the curtain in every frame.' },
    { id: 'picnic-overhead', title: 'Overhead Picnic', summary: 'Seen from directly above, lying on a blanket.',
        action: 'They lie on their backs side by side on a checkered blanket, heads close together, looking up toward the camera.',
        framing: 'The camera is straight above them, looking down.', light: 'dappled afternoon light', place: 'short summer grass',
        backdropNote: 'Re-project the background image so it reads as ground seen from above.' },
    { id: 'mid-conversation', title: 'Mid-Conversation', summary: 'Unposed moment; nobody looks at the lens.',
        action: 'They talk and laugh with each other, turned toward one another rather than the camera.',
        light: 'natural window light', place: 'a busy café corner, softly blurred' },
    { id: 'low-light', title: 'Low Light', summary: 'No-flash photo in a dim venue.',
        action: 'They are caught in a spontaneous, slightly candid moment.',
        light: 'only the dim ambient light of the venue, with no flash or bright fill on the faces', place: 'a dim lounge with warm table lamps',
        backdropNote: 'Match the dim ambient light of the background image.' },
    { id: 'group-embrace', title: 'Group Embrace', summary: 'Close-up of a joyful reunion hug.',
        action: 'They wrap their arms around one another in a tight, joyful hug, faces close to the lens.',
        light: 'soft, warm light', place: 'a train station platform, blurred' },
    { id: 'quiet-bench', title: 'Quiet Bench', summary: 'Calm, close moment of friendship.',
        action: 'They sit close together sharing a quiet laugh, glancing at each other with easy affection.',
        light: 'low golden evening light', place: 'a park bench at dusk' },
    { id: 'line-up', title: 'Line-Up', summary: 'Everyone facing the camera, smiling.',
        action: 'They stand in a single line, shoulder to shoulder, smiling at the camera.',
        light: 'clear, balanced light', place: 'a neutral seamless backdrop' },
];

export const FUSION_EXPRESSIONS = [
    { id: 'as-is', label: 'As in photo', text: '' },
    { id: 'neutral', label: 'Neutral', text: 'a relaxed, neutral face' },
    { id: 'soft-smile', label: 'Soft smile', text: 'a small, warm closed-lip smile' },
    { id: 'big-smile', label: 'Big smile', text: 'a wide, open, happy smile' },
    { id: 'laughing', label: 'Laughing', text: 'laughing freely' },
    { id: 'serious', label: 'Serious', text: 'a serious, unsmiling look' },
    { id: 'surprised', label: 'Surprised', text: 'a surprised look with raised brows and parted lips' },
    { id: 'confident', label: 'Confident', text: 'an assured look with a slight smile' },
    { id: 'pensive', label: 'Pensive', text: 'a pensive, faraway look' },
    { id: 'sad', label: 'Sad', text: 'a quietly sad look, without tears' },
    { id: 'wink', label: 'Wink', text: 'a cheeky wink with a small smile' },
];

export const FUSION_DETAILS: { value: FusionDetail; label: string; text: string }[] = [
    { value: 'standard', label: 'Standard', text: 'a clean, natural-looking photo' },
    { value: 'high', label: 'High', text: 'a sharp, finely detailed high-resolution photo' },
    { value: 'max', label: 'Maximum', text: 'a photorealistic, tack-sharp high-resolution photo with true-to-life skin and fabric texture' },
];

export const findScene = (id: string) => FUSION_SCENES.find(scene => scene.id === id) || FUSION_SCENES[0];
export const sceneFits = (scene: FusionScene, count: number) => !scene.people || scene.people === count;
export const usesBackdrop = (scene: FusionScene, hasBackdrop: boolean) => hasBackdrop && !scene.ownSetting;

/** What the user asked for each person, or '' when nothing was asked. */
export const personNotes = (subjects: Pick<FusionSubject, 'expression' | 'knownAs'>[]) => subjects.map(subject => {
    const expression = FUSION_EXPRESSIONS.find(item => item.id === subject.expression)?.text;
    const name = subject.knownAs?.trim();
    return [name && `is ${name}, and that well-known face must stay recognisable`, expression && `shows ${expression}`].filter(Boolean).join(' and ');
});

/** The scene in one paragraph, shared by every engine. */
export const describeScene = (scene: FusionScene, detail: FusionDetail, hasBackdrop: boolean) => {
    const backdrop = usesBackdrop(scene, hasBackdrop);
    const setting = backdrop ? ['Use the supplied background image as the setting.', scene.backdropNote].filter(Boolean).join(' ') : `Setting: ${scene.place}.`;
    const finish = FUSION_DETAILS.find(item => item.value === detail)?.text || FUSION_DETAILS[1].text;
    return [scene.action, scene.framing, `Lighting: ${scene.light}.`, setting, `Render it as ${finish}.`].filter(Boolean).join(' ');
};

export const buildFusionPrompt = (scene: FusionScene, subjects: Pick<FusionSubject, 'expression' | 'knownAs'>[], detail: FusionDetail, hasBackdrop: boolean) => {
    const notes = personNotes(subjects);
    const people = notes.some(Boolean)
        ? `${notes.map((note, index) => `Person ${index + 1} ${note || 'stays as in their photo'}.`).join(' ')} These per-person choices override any mood described below; only expressions may change, never identity, body or clothing.`
        : 'Keep every person as they look in their photo.';
    return `One single photograph of exactly ${subjects.length} people, one for each reference portrait. ${people}\n${describeScene(scene, detail, hasBackdrop)}`;
};
