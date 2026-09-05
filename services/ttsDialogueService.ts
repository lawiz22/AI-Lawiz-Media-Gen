import { generateMammouthText } from './mammouthService';
import type { ChatterboxLanguage } from './comfyUIService';

export const TTS_DIALOGUE_THEMES = [
    { value: 'surprise', label: 'Surprise Me', direction: 'an unexpected but coherent spoken style' },
    { value: 'science-talk', label: 'Science Talk', direction: 'an accessible scientist explaining a fascinating discovery with precise, vivid language', fallback: 'A strange signal crossed the laboratory tonight, carrying a pattern that should not exist.' },
    { value: 'movie-dialogue', label: 'Movie Dialogue', direction: 'a cinematic character delivering a memorable line at a decisive story moment', fallback: 'You can lock every door in this city, but you cannot lock away the truth.' },
    { value: 'documentary', label: 'Documentary', direction: 'a calm documentary narrator revealing an intriguing fact with authority', fallback: 'Beneath this quiet landscape, an ancient network is still moving water across the continent.' },
    { value: 'film-noir', label: 'Film Noir', direction: 'a weary noir detective speaking with dry wit and restrained suspicion', fallback: 'The rain had washed every street clean, except the one clue waiting on my desk.' },
    { value: 'science-fiction', label: 'Science Fiction', direction: 'a spacecraft crew member confronting an extraordinary cosmic event', fallback: 'Control, the stars just disappeared, and something enormous is answering our signal.' },
    { value: 'fantasy', label: 'Fantasy', direction: 'a fantasy hero or oracle speaking of magic, fate, and immediate danger', fallback: 'The old magic is awake again, and it knows the name you tried to forget.' },
    { value: 'horror', label: 'Horror', direction: 'a frightened but controlled character realizing something deeply unsettling', fallback: 'Do not answer the knocking. We are all inside, and it is counting us.' },
    { value: 'comedy', label: 'Comedy', direction: 'a witty character reacting to an absurd problem with sharp comic timing', fallback: 'I followed the instructions perfectly, which is apparently how we summoned a marching band.' },
    { value: 'romance', label: 'Romance', direction: 'an intimate, sincere confession with warmth and emotional restraint', fallback: 'Every road felt temporary until the evening I found you waiting at the end.' },
    { value: 'thriller', label: 'Thriller', direction: 'an urgent warning delivered under pressure with escalating stakes', fallback: 'You have ten seconds to leave that room before they realize you heard everything.' },
    { value: 'adventure', label: 'Adventure', direction: 'a bold explorer inviting the listener toward an unknown destination', fallback: 'Beyond that ridge lies the city no mapmaker returned to describe. We leave at dawn.' },
    { value: 'breaking-news', label: 'Breaking News', direction: 'a concise live news report describing a surprising developing event', fallback: 'We are live downtown, where every clock stopped simultaneously just three minutes ago.' },
    { value: 'commercial', label: 'Commercial', direction: 'a polished, energetic product advertisement with one clear benefit and a memorable finish', fallback: 'Meet the brighter way to organize your day, with less effort and more room to create.' },
    { value: 'motivational', label: 'Motivational', direction: 'a grounded motivational speaker encouraging one immediate positive action', fallback: 'Start before you feel ready. One honest step today can change the direction of everything.' },
    { value: 'meditation', label: 'Meditation', direction: 'a slow, soothing guide using simple calming imagery and gentle instructions', fallback: 'Breathe in slowly. Let the noise drift away, and feel the ground supporting you.' },
    { value: 'nature', label: 'Nature Narration', direction: 'an evocative natural-history narrator observing animal behavior or a changing landscape', fallback: 'At first light, the young fox leaves the shelter and listens to the waking forest.' },
    { value: 'historical', label: 'Historical Drama', direction: 'a historical figure speaking with conviction at a consequential moment', fallback: 'Tomorrow they may erase our names, but tonight they will hear what we defended.' },
    { value: 'mystery', label: 'Mystery', direction: 'a curious investigator noticing a subtle clue that changes the entire case', fallback: 'The portrait was untouched, yet its shadow pointed toward a door that was never there.' },
    { value: 'gaming', label: 'Game Character', direction: 'a charismatic game character giving a concise mission briefing or battle line', fallback: 'The gate is open, the guardians are moving, and this is our only chance.' },
    { value: 'podcast', label: 'Podcast Host', direction: 'a conversational podcast host opening an intriguing topic with a natural hook', fallback: 'Here is a question worth asking: what if our strongest habit began as a simple mistake?' },
] as const;

export type TtsDialogueTheme = typeof TTS_DIALOGUE_THEMES[number]['value'];

const WORDS_PER_SECOND = 5;
const CHARACTERS_PER_SECOND = 7;
const CHARACTER_BUDGET_LANGUAGES: readonly ChatterboxLanguage[] = ['Chinese', 'Japanese'];
const FALLBACK_EXTENSIONS: Record<ChatterboxLanguage, readonly string[]> = {
    English: ['Keep listening.', 'Stay with me.', 'Nothing here is accidental.', 'The choice is yours now.', 'Take a breath, then move.', 'One small detail changes everything.', 'Trust what the silence reveals.', 'Now the next move begins.'],
    German: ['Hör weiter zu.', 'Bleib bei mir.', 'Nichts hier ist zufällig.', 'Du hast jetzt die Wahl.', 'Atme tief ein, dann geh.', 'Ein kleines Detail verändert alles.', 'Vertraue darauf, was die Stille verrät.', 'Jetzt beginnt der nächste Schritt.'],
    Norwegian: ['Fortsett å lytte.', 'Bli hos meg.', 'Ingenting her er tilfeldig.', 'Valget er ditt nå.', 'Trekk pusten, og gå videre.', 'En liten detalj forandrer alt.', 'Stol på det stillheten avslører.', 'Nå begynner neste steg.'],
    French: ['Continuez à écouter.', 'Restez avec moi.', 'Rien ici n’est dû au hasard.', 'Le choix vous appartient.', 'Respirez, puis avancez.', 'Un petit détail change tout.', 'Fiez-vous à ce que révèle le silence.', 'La prochaine étape commence maintenant.'],
    Spanish: ['Sigue escuchando.', 'Quédate conmigo.', 'Nada de esto es casualidad.', 'Ahora la decisión es tuya.', 'Respira y sigue adelante.', 'Un pequeño detalle lo cambia todo.', 'Confía en lo que revela el silencio.', 'El siguiente paso comienza ahora.'],
    Arabic: ['واصل الاستماع.', 'ابق معي.', 'لا شيء هنا يحدث بالمصادفة.', 'الخيار لك الآن.', 'تنفس ثم تقدم.', 'تفصيل صغير يغير كل شيء.'],
    Danish: ['Bliv ved med at lytte.', 'Bliv hos mig.', 'Intet her er tilfældigt.', 'Valget er dit nu.', 'Træk vejret, og gå videre.', 'En lille detalje ændrer alt.'],
    Greek: ['Συνέχισε να ακούς.', 'Μείνε μαζί μου.', 'Τίποτα εδώ δεν είναι τυχαίο.', 'Η επιλογή είναι τώρα δική σου.', 'Πάρε μια ανάσα και προχώρα.', 'Μια μικρή λεπτομέρεια αλλάζει τα πάντα.'],
    Finnish: ['Jatka kuuntelemista.', 'Pysy kanssani.', 'Mikään täällä ei ole sattumaa.', 'Valinta on nyt sinun.', 'Hengitä ja jatka eteenpäin.', 'Yksi pieni yksityiskohta muuttaa kaiken.'],
    Hebrew: ['המשיכו להקשיב.', 'הישארו איתי.', 'שום דבר כאן אינו מקרי.', 'הבחירה עכשיו בידיכם.', 'קחו נשימה והמשיכו.', 'פרט קטן משנה הכול.'],
    Hindi: ['सुनते रहिए।', 'मेरे साथ रहिए।', 'यहाँ कुछ भी संयोग नहीं है।', 'अब चुनाव आपका है।', 'साँस लें और आगे बढ़ें।', 'एक छोटा सा विवरण सब कुछ बदल देता है।'],
    Italian: ['Continua ad ascoltare.', 'Resta con me.', 'Qui nulla accade per caso.', 'Ora la scelta è tua.', 'Respira e vai avanti.', 'Un piccolo dettaglio cambia tutto.'],
    Japanese: ['このまま聞いてください。', '私と一緒にいてください。', 'ここで偶然に起きることはありません。', '選ぶのはあなたです。', '息を整えて進みましょう。', '小さな手がかりがすべてを変えます。'],
    Korean: ['계속 들어 주세요.', '제 곁에 있어 주세요.', '여기에는 우연이 없습니다.', '이제 선택은 당신의 몫입니다.', '숨을 고르고 나아가세요.', '작은 단서 하나가 모든 것을 바꿉니다.'],
    Malay: ['Teruskan mendengar.', 'Kekal bersama saya.', 'Tiada apa di sini berlaku secara kebetulan.', 'Pilihan kini di tangan anda.', 'Tarik nafas dan teruskan.', 'Satu perincian kecil mengubah segalanya.'],
    Dutch: ['Blijf luisteren.', 'Blijf bij me.', 'Niets hier is toeval.', 'De keuze is nu aan jou.', 'Haal adem en ga verder.', 'Eén klein detail verandert alles.'],
    Polish: ['Słuchaj dalej.', 'Zostań ze mną.', 'Nic tutaj nie jest przypadkowe.', 'Wybór należy teraz do ciebie.', 'Weź oddech i ruszaj dalej.', 'Jeden drobny szczegół zmienia wszystko.'],
    Portuguese: ['Continue ouvindo.', 'Fique comigo.', 'Nada aqui acontece por acaso.', 'A escolha agora é sua.', 'Respire e siga em frente.', 'Um pequeno detalhe muda tudo.'],
    Swedish: ['Fortsätt lyssna.', 'Stanna hos mig.', 'Ingenting här är en slump.', 'Valet är ditt nu.', 'Andas och gå vidare.', 'En liten detalj förändrar allt.'],
    Swahili: ['Endelea kusikiliza.', 'Baki nami.', 'Hakuna jambo hapa lililotokea kwa bahati.', 'Uamuzi ni wako sasa.', 'Vuta pumzi kisha songa mbele.', 'Maelezo madogo hubadilisha kila kitu.'],
    Turkish: ['Dinlemeye devam et.', 'Benimle kal.', 'Burada hiçbir şey tesadüf değil.', 'Seçim artık senin.', 'Nefes al ve ilerle.', 'Küçük bir ayrıntı her şeyi değiştirir.'],
    Chinese: ['请继续听。', '请和我一起。', '这里没有任何事情是偶然的。', '现在由你来选择。', '深呼吸，然后继续前进。', '一个小细节会改变一切。'],
};
const LOCALIZED_FALLBACKS: Record<Exclude<ChatterboxLanguage, 'English'>, readonly string[]> = {
    German: [
        'Heute beginnt etwas, das wir lange für unmöglich gehalten haben.',
        'Hör genau zu, denn jedes kleine Detail könnte die Antwort sein.',
        'Wir haben noch Zeit, aber die nächste Entscheidung verändert alles.',
        'Bleib ruhig. Der wichtigste Augenblick liegt direkt vor uns.',
    ],
    Norwegian: [
        'I dag begynner noe vi lenge trodde var umulig.',
        'Lytt nøye, for den minste detaljen kan være svaret vi trenger.',
        'Vi har fortsatt tid, men det neste valget forandrer alt.',
        'Hold deg rolig. Det viktigste øyeblikket ligger rett foran oss.',
    ],
    French: [
        'Aujourd’hui commence quelque chose que nous pensions impossible depuis longtemps.',
        'Écoutez attentivement, car le moindre détail pourrait contenir la réponse.',
        'Il nous reste du temps, mais la prochaine décision changera tout.',
        'Restez calme. Le moment le plus important est juste devant nous.',
    ],
    Spanish: [
        'Hoy comienza algo que durante mucho tiempo creímos imposible.',
        'Escucha con atención, porque el detalle más pequeño podría ser la respuesta.',
        'Todavía tenemos tiempo, pero la próxima decisión lo cambiará todo.',
        'Mantén la calma. El momento más importante está justo frente a nosotros.',
    ],
    Arabic: ['اليوم يبدأ أمر ظنناه مستحيلاً منذ زمن.', 'استمع جيداً، فقد يحمل أصغر تفصيل الإجابة.', 'ما زال لدينا وقت، لكن القرار التالي سيغير كل شيء.'],
    Danish: ['I dag begynder noget, vi længe troede var umuligt.', 'Lyt godt efter, for den mindste detalje kan være svaret.', 'Vi har stadig tid, men den næste beslutning ændrer alt.'],
    Greek: ['Σήμερα αρχίζει κάτι που για καιρό θεωρούσαμε αδύνατο.', 'Άκουσε προσεκτικά, γιατί η μικρότερη λεπτομέρεια μπορεί να είναι η απάντηση.', 'Έχουμε ακόμη χρόνο, αλλά η επόμενη απόφαση θα αλλάξει τα πάντα.'],
    Finnish: ['Tänään alkaa jokin, jota pidimme pitkään mahdottomana.', 'Kuuntele tarkasti, sillä pieninkin yksityiskohta voi olla vastaus.', 'Meillä on vielä aikaa, mutta seuraava päätös muuttaa kaiken.'],
    Hebrew: ['היום מתחיל דבר שבמשך זמן רב חשבנו לבלתי אפשרי.', 'הקשיבו היטב, כי הפרט הקטן ביותר עשוי להיות התשובה.', 'עדיין יש לנו זמן, אבל ההחלטה הבאה תשנה הכול.'],
    Hindi: ['आज वह शुरू हो रहा है जिसे हम लंबे समय से असंभव मानते थे।', 'ध्यान से सुनिए, क्योंकि सबसे छोटा विवरण भी उत्तर हो सकता है।', 'हमारे पास अभी समय है, लेकिन अगला निर्णय सब कुछ बदल देगा।'],
    Italian: ['Oggi comincia qualcosa che credevamo impossibile da tempo.', 'Ascolta attentamente, perché il minimo dettaglio potrebbe essere la risposta.', 'Abbiamo ancora tempo, ma la prossima decisione cambierà tutto.'],
    Japanese: ['今日、長い間不可能だと思っていたことが始まります。', 'よく聞いてください。最も小さな手がかりが答えかもしれません。', 'まだ時間はありますが、次の決断がすべてを変えます。'],
    Korean: ['오늘, 오랫동안 불가능하다고 믿었던 일이 시작됩니다.', '가장 작은 단서가 답일 수 있으니 귀 기울여 주세요.', '아직 시간은 있지만 다음 결정이 모든 것을 바꿀 것입니다.'],
    Malay: ['Hari ini bermula sesuatu yang telah lama kita anggap mustahil.', 'Dengar dengan teliti kerana perincian terkecil mungkin jawapannya.', 'Kita masih ada masa, tetapi keputusan seterusnya akan mengubah segalanya.'],
    Dutch: ['Vandaag begint iets wat we lange tijd onmogelijk achtten.', 'Luister goed, want het kleinste detail kan het antwoord zijn.', 'We hebben nog tijd, maar de volgende beslissing verandert alles.'],
    Polish: ['Dziś zaczyna się coś, co długo uważaliśmy za niemożliwe.', 'Słuchaj uważnie, bo najmniejszy szczegół może być odpowiedzią.', 'Wciąż mamy czas, ale następna decyzja zmieni wszystko.'],
    Portuguese: ['Hoje começa algo que durante muito tempo julgámos impossível.', 'Escute com atenção, pois o menor detalhe pode ser a resposta.', 'Ainda temos tempo, mas a próxima decisão mudará tudo.'],
    Swedish: ['I dag börjar något som vi länge trodde var omöjligt.', 'Lyssna noga, för den minsta detaljen kan vara svaret.', 'Vi har fortfarande tid, men nästa beslut förändrar allt.'],
    Swahili: ['Leo linaanza jambo ambalo kwa muda mrefu tulidhani haliwezekani.', 'Sikiliza kwa makini, kwa sababu jambo dogo zaidi linaweza kuwa jibu.', 'Bado tuna wakati, lakini uamuzi unaofuata utabadilisha kila kitu.'],
    Turkish: ['Bugün, uzun zamandır imkânsız sandığımız bir şey başlıyor.', 'Dikkatle dinle, çünkü en küçük ayrıntı cevap olabilir.', 'Hâlâ zamanımız var, ancak bir sonraki karar her şeyi değiştirecek.'],
    Chinese: ['今天，一件我们长久以来认为不可能的事情开始了。', '仔细听，最微小的细节也可能是答案。', '我们还有时间，但下一个决定将改变一切。'],
};

export const estimateSpeechDuration = (text: string, language?: ChatterboxLanguage) => {
    if (language && CHARACTER_BUDGET_LANGUAGES.includes(language)) {
        const characters = text.replace(/\s/g, '').length;
        return characters === 0 ? 0 : characters / CHARACTERS_PER_SECOND;
    }
    const words = text.trim().match(/\S+/g)?.length || 0;
    return words === 0 ? 0 : words / WORDS_PER_SECOND;
};

const trimToWordBudget = (text: string, maxWords: number) => {
    const cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ');
    const words = cleaned.split(' ');
    if (words.length <= maxWords) return cleaned;
    const shortened = words.slice(0, maxWords).join(' ');
    const sentenceEnd = Math.max(shortened.lastIndexOf('.'), shortened.lastIndexOf('!'), shortened.lastIndexOf('?'));
    if (sentenceEnd >= shortened.length * 0.6) return shortened.slice(0, sentenceEnd + 1);
    return `${shortened.replace(/[,:;.!?]+$/, '')}.`;
};

const trimToCharacterBudget = (text: string, maxCharacters: number) => {
    const cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, ' ');
    if (cleaned.replace(/\s/g, '').length <= maxCharacters) return cleaned;
    let characterCount = 0;
    let endIndex = 0;
    for (const character of cleaned) {
        if (!/\s/.test(character)) characterCount += 1;
        endIndex += character.length;
        if (characterCount >= maxCharacters) break;
    }
    const shortened = cleaned.slice(0, endIndex);
    const sentenceEnd = Math.max(shortened.lastIndexOf('。'), shortened.lastIndexOf('！'), shortened.lastIndexOf('？'));
    return sentenceEnd >= shortened.length * 0.6 ? shortened.slice(0, sentenceEnd + 1) : `${shortened.replace(/[，、。！？]+$/, '')}。`;
};

const resolveTheme = (requestedTheme: TtsDialogueTheme) => {
    const themes = TTS_DIALOGUE_THEMES.filter((theme) => theme.value !== 'surprise');
    return requestedTheme === 'surprise'
        ? themes[Math.floor(Math.random() * themes.length)]
        : themes.find((theme) => theme.value === requestedTheme) || themes[0];
};

const createFallbackDialogue = (openings: readonly string[], minLength: number, maxLength: number, language: ChatterboxLanguage, usesCharacterBudget: boolean) => {
    const candidates = [...openings, ...FALLBACK_EXTENSIONS[language]].sort(() => Math.random() - 0.5);
    let dialogue = '';
    let candidateIndex = 0;
    const getLength = (value: string) => usesCharacterBudget
        ? value.replace(/\s/g, '').length
        : value.match(/\S+/g)?.length || 0;

    while (getLength(dialogue) < minLength && candidateIndex < candidates.length * 2) {
        const addition = candidates[candidateIndex % candidates.length];
        const candidate = `${dialogue} ${addition}`.trim();
        if (getLength(candidate) <= maxLength) dialogue = candidate;
        candidateIndex += 1;
    }

    return usesCharacterBudget
        ? trimToCharacterBudget(dialogue, maxLength)
        : trimToWordBudget(dialogue, maxLength);
};

export const generateTtsDialogue = async (requestedTheme: TtsDialogueTheme, durationSeconds: number, language: ChatterboxLanguage) => {
    const theme = resolveTheme(requestedTheme);
    const usesCharacterBudget = CHARACTER_BUDGET_LANGUAGES.includes(language);
    const maxWords = Math.max(7, Math.floor(durationSeconds * WORDS_PER_SECOND));
    const minWords = Math.max(6, Math.floor(maxWords * 0.95));
    const maxCharacters = Math.max(20, Math.floor(durationSeconds * CHARACTERS_PER_SECOND));
    const minCharacters = Math.max(18, Math.floor(maxCharacters * 0.95));
    const lengthInstruction = usesCharacterBudget
        ? `Use ${minCharacters} to ${maxCharacters} ${language} characters, excluding spaces and punctuation.`
        : `Use ${minWords} to ${maxWords} words.`;
    const instruction = `Write one original passage in ${language}, intended to be spoken aloud in approximately ${durationSeconds} seconds. Style: ${theme.direction}. ${lengthInstruction} Make it vivid, natural, self-contained, and different on every request. Write only words the voice should speak. Do not include a speaker name, heading, quotation marks, stage directions, sound effects, translations, or commentary.`;

    try {
        const result = await generateMammouthText(instruction);
        const text = usesCharacterBudget
            ? trimToCharacterBudget(result.text, maxCharacters)
            : trimToWordBudget(result.text, maxWords);
        return { text, theme: theme.value, themeLabel: theme.label };
    } catch {
        const fallbackOpenings = language === 'English'
            ? TTS_DIALOGUE_THEMES.flatMap((dialogueTheme) => dialogueTheme.fallback ? [dialogueTheme.fallback] : [])
            : LOCALIZED_FALLBACKS[language];
        const text = createFallbackDialogue(
            fallbackOpenings,
            usesCharacterBudget ? minCharacters : minWords,
            usesCharacterBudget ? maxCharacters : maxWords,
            language,
            usesCharacterBudget,
        );
        return { text, theme: theme.value, themeLabel: theme.label };
    }
};
