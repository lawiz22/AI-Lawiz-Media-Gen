# Video Prompt Generator

[Documentation index](../README.md) | [Project overview](../../README.md)

Create a production prompt independently of video rendering, save its complete prompt-generation setup, then copy it or send it to an available workflow.

## On this page

- [Video workspace](#video-workspace)
- [Target model and generation mode](#target-model-and-generation-mode)
- [H3 style-aware prompting](#h3-style-aware-prompting)
- [References and media editing](#references-and-media-editing)
- [Providers and editable templates](#providers-and-editable-templates)
- [Original audio and editable lyrics](#original-audio-and-editable-lyrics)
- [Send to MiniMax H3](#send-to-minimax-h3)
- [Send to LTX 2.5 Audio-Sync](#send-to-ltx-25-audio-sync)
- [Library snapshots and restoration](#library-snapshots-and-restoration)
- [Local draft persistence](#local-draft-persistence)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Video workspace

- **Video** has three top-level tabs, in order: **Video Prompt Generator**, **LTX**, **H3**.
- **LTX** contains **LTX Director**, **LTX-Ripple-FFAF**, and **[LTX 2.5 Audio-Sync](ltx-and-audio.md#ltx-25-audio-sync)**.
- **H3** contains **Minimax REF2v H3**, **[Ultrafast](minimax-h3.md#ultrafast)**, **[MiniMax Advanced](minimax-h3.md#minimax-advanced)**, and the independent [Character Swap H3 Shot Planner](character-swap-h3.md). Each group remembers its last opened tool while the workspace is mounted. Renderers retain their independent drafts and controls.
- The prompt generator remains optional. Existing Library, TTS and model transfers open the correct group/tool automatically.

## Target model and generation mode

Choose **Target video model** and **Generation mode** before composing:

- **H3 / MiniMax** retains its existing editable templates, numbered shots, multimodal output fields and optional H3 styles. Only mode-specific source instructions are added.
- **LTX 2 / LTX 2.5** uses separate editable templates: fluent present-tense prose, chronological physical motion and a continuous shot unless cuts are requested. It does not use H3 shot/subject tokens or H3 style LoRAs. Switching back preserves the H3 templates and selected style.
- **T2V** establishes the scene from text. Attached visuals, if any, are contextual references rather than a conditioned first frame.
- **FI2V - First image to video** requires an image; the first attached image defines the starting frame. The prompt focuses on motion from that frame without redesigning its subjects or composition. This is the renamed **I2V** mode.
- **REF2V - References to video** uses images for their assigned identity, appearance, clothing, object, environment or style roles in a **new scene**, not as a starting frame. Pose, composition and camera framing come from the idea rather than being copied from the reference. Video/audio references contribute their stated motion/style/voice/sound cues without imposing a source opening frame or timeline. At least one reference is required. Assign each attachment's role to avoid carrying over unwanted attributes.
- **V2V** requires a source video; the first attached video defines source timing, motion, framing and continuity. The prompt distinguishes retained content from requested edits. Character replacement requires this mode plus an image.

Older drafts without an explicit mode infer it from their references (H3 images use REF2V, LTX images use FI2V) and keep their saved H3 templates. Existing explicitly saved **I2V** drafts and snapshots remain compatible and display as **FI2V**, preserving their first-frame semantics. The model family and mode are saved in the workspace and Library snapshot. Changing either after generation requires regenerating before transfer; switching an existing first-frame prompt to REF2V does not rewrite it automatically.

REF2V prompts transfer to H3 REF2v, Ultrafast or Advanced. An explicit REF2V transfer to Advanced selects its REF2V generation branch, retaining other render settings instead of inheriting FL2V or source-video finishing mode. The connected LTX workflows do not implement independent reference conditioning: REF2V prompt composition/copy/export remains available, but transfer is blocked with an explanation rather than silently treating a reference as a first frame.

LTX responses retain the application's validated field envelope for editing and Library storage; **Copy**, **Export .txt** and LTX transfers extract the visual description, soundscape and music as natural prose without field headings. H3 output formatting is unchanged.

## H3 style-aware prompting

Choose **Prompt style - H3 / MiniMax** to link a Style Gallery entry to prompt generation and H3 transfer. The chosen AI provider receives the style's title, exact triggers, visual directions and notes, plus up to three locally saved LoRA examples when available. No online example search occurs automatically. Era-specific looks should be expressed as concrete camera, lighting, texture, color and motion vocabulary, without replacing the requested subjects or audio.

**Find prompt examples** / **Local prompts** opens the same example dialog as the image generator. **Save all locally** writes the existing desktop LoRA prompt sidecar. **Use prompt** copies an example into the idea, not into models or sampling controls. The desktop app and an indexed My Library LoRA are required for local example storage.

Generated prompts keep their required field structure; the selected trigger leads the visual field body. **Send to H3** carries the style snapshot and actual LoRA into REF2V, Ultrafast or Advanced. Changing style after generation requires regenerating before sending. Saved Library prompts retain the style context and examples. H3 styles remain inactive for every LTX destination.

## References and media editing

- The dedicated prompt generator accepts up to **6 pictures, 2 videos and 2 audio files**, with previews, stable numbered/color-coded reference tokens, per-reference roles and click-to-insert tokens. Images and videos have free/preset-ratio crop and pixel resizing; video editing also trims and exports a real local H.264 MP4 with audio using the existing FFmpeg encoder. Restore Original undoes edits.
- Each reference category offers **Library** as well as upload/drop. Choose saved images/characters/frames and other image assets, videos, or TTS/reference audio. Imports read the original durable media rather than an expired preview, use the same slot/type limits and editing controls, and never modify the Library item. Missing or unsupported media is reported in the picker.

## Providers and editable templates

- Choose OpenRouter, Gemini or Mammouth, using the existing Connection Settings keys. OpenRouter loads its live model catalog automatically into a native dropdown. Search by name, model ID or input type (`video`, `audio`, etc.); each entry shows its supported inputs. **Refresh OpenRouter models** retries a failed load or updates the catalog. Gemini/Mammouth model IDs remain editable.
- Attaching references filters the OpenRouter list to models supporting **all** required input types. Grok 4.7 remains the default for compatible requests, but it does not advertise video input. An incompatible current selection stays visible with a warning; choose a video-capable model from the list. Selection never changes automatically, and generation is disabled until an available, compatible model is selected. The selected model is saved in the workspace and Library prompt snapshot, independently of the global OpenRouter default.
- Gemini receives native images/video/audio; OpenRouter also validates each modality before sending a completion (audio must be WAV/MP3). Mammouth currently accepts image references only in this integration and explicitly rejects video/audio rather than silently omitting them. Generation sends the idea, template, notes and edited files to the selected provider; provider billing/access applies. Requests are limited to 18 MB total media before base64 encoding. Catalog capabilities do not guarantee account access, credits or that every provider accepts every media format.
- **Templates** edits and saves the generation and character-replacement canvases locally. Generation returns `integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`; replacement returns `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. Keep these field names/order when customizing templates. Malformed, empty or incomplete responses are reported, not accepted as successful prompts.

Regression checks: `node --test components/VideoWorkspace.test.mjs services/openRouterService.test.mjs services/videoPromptService.test.mjs services/videoPromptLibrary.test.mjs`. These use mocked providers; live catalog capabilities do not establish paid-generation access or model output quality.

## Original audio and editable lyrics

- The audio reference cards include the same original-track waveform, precise start/end selection, selection playback and **Next N s** as H3. Select the first four seconds, click **Apply passage + prompt duration**, then compose/transcribe: only that real WAV excerpt is attached to the model and transferred to H3. The full recording stays local for subsequent selections. Prompt excerpts support 1-120 seconds; H3 rendering supports at most 60. Pending partial selections block model requests and transfer until applied.
- **Force original WAV soundtrack (lock)** persists alongside the selected track. Selecting original mode enables it; it can also be checked explicitly in either editor. It prevents switching back to generated mode without unlocking and locally replaces all server sound with the selected WAV after rendering. An explicit transfer sets compatible H.264/24 FPS/no-loop settings, reports mux failures explicitly and never substitutes generated audio. Each editor keeps an independent audio choice; transfer copies the generator selection together with its references, avoiding a stale soundtrack from an older H3 draft.
- **Soundtrack mode** lets you keep the existing reference/generated-audio behavior or explicitly select an **original track** to preserve its performance in H3's final soundtrack. Original mode also tells the prompt model not to rewrite words, invent music or rearrange the recording. Apply the desired passage in H3 before rendering; original mode uses H.264 MP4 at 24 FPS, no loops/ping-pong, and trims surplus video to the audio endpoint, subject to frame/codec rounding. AAC output is not a lossless WAV copy, and keeping the soundtrack does not itself guarantee accurate generated lip motion. See [H3 original soundtrack](minimax-h3.md#original-soundtrack-and-passage-lyrics).
- On an audio card, **Use exact lyrics / spoken words** exposes an editable passage transcript and **Transcribe current passage**. This is an explicit API call with the selected Gemini/OpenRouter model and **only the current audio file**; provider capabilities, credentials and charges apply. Mammouth audio is unsupported. No web lyrics lookup or automatic calls on passage changes.
- Edit/transcribe again after changing the passage. Stale enabled lyrics block generation rather than silently reuse an earlier verse; you can explicitly confirm unchanged words or disable the option. Update the scene prompt manually or generate a new one here before transferring it. Lyrics, passage stamps and original-track selection survive prompt Library round-trips and H3 transfers.

## Send to MiniMax H3

- Output can be edited, previewed with colored Picture/Video/Audio/Subject tokens, copied or exported as text. Choose **Minimax REF2v H3**, **Ultrafast**, or **MiniMax Advanced**, then **Send to** that workflow to copy the prompt, optional edited media, target aspect, duration and soundtrack choice to its independent rendering draft. Existing drafts require replacement confirmation. Subsequent generator edits do not affect the renderer, and renderer edits do not affect the generator. Advanced enforces 3 images / 1 video / 2 standalone audios without silently dropping references; choose REF2V for multimodal conditioning. Plain prompts do not require an image.
- The destination choice is saved locally. Advanced defaults to FL2V and has independent settings. The obsolete Text to video, Character replacement and Audio-driven video preparation cards are no longer shown. Their legacy saved drafts are retained rather than deleted.

## Send to LTX 2.5 Audio-Sync

Choose **LTX** as the target model, **T2V** or **FI2V**, and the **generation** template, then choose **LTX 2.5 Audio-Sync** in **Send prompt to workflow**. One edited image and one edited standalone audio are supported; extra references and video/character-replacement inputs are rejected explicitly. Missing inputs can be attached in Audio-Sync after transferring. Apply any pending audio passage first. An explicit T2V transfer enables Audio-Sync's text-to-video setting; FI2V disables it.

The destination keeps an independent prompt/input draft and its own models and seeds. Transfer updates the prompt, aspect and requested duration, **switches local Qwen enhancement off**, and does not overwrite H3/Director. You can explicitly re-enable Qwen in Audio-Sync. Applied audio passages retain the full original, selection and optional words for further editing in its shared H3 waveform/lyrics controls. Later generator edits have no effect until another explicit transfer. Apply the desired audio passage there to synchronize its WAV and duration; transcription is optional and never automatic.

Audio-Sync uses its source workflow's masked audio latent and VAE decode. It does not import H3's **Force original WAV soundtrack** post-render mux setting. See [Audio-Sync behavior and limits](ltx-and-audio.md#ltx-25-audio-sync).

For **LTX Director**, T2V/FI2V transfer creates a new segment with the prompt, optional single edited first-frame image and requested **3-15 second** duration. Existing segments and models are retained. Video/audio references are rejected rather than dropped; use Audio-Sync for a soundtrack.

For **LTX-Ripple-FFAF**, choose V2V and attach exactly one source video and one edited first-frame image. Transfer copies the prompt and files into an independent Ripple draft, retaining its render/model settings. Ripple controls source timing and output dimensions; generator duration/aspect do not overwrite those settings. Audio references are rejected explicitly.

## Library snapshots and restoration

- Each successful video prompt generation automatically saves a **Library > Prompts** item containing the output, exact generation-time idea/provider/model, aspect ratio, duration, workflow, editable canvases, full instruction, stable reference numbers/roles, and original plus edited images/videos/audio. Later changes to the composer do not change that saved snapshot. **Save to Library** also saves edited output as a new item or retries a failed save; prompts created before this feature save the current setup and are labeled accordingly.
- Editing unlocks as soon as the model responds, without waiting for the Library save. A slow save cannot lock the generated text; changes made during saving are not marked as already saved. Save failures are shown and remain retryable.
- Library details preview the saved reference media and show all settings. **Open in Minimax REF2v H3**, **Open in Ultrafast**, or **Open in MiniMax Advanced** restores the saved prompt and original/edited references directly into the chosen renderer, leaving this prompt composer unchanged. Legacy prompt-generation items have no H3 sampling settings and show a defaults notice on load; cross-variant loading explicitly uses destination model/sampling defaults while preserving input controls. Each renderer's **Save prompt to Library** adds an exact generation-setup snapshot, including the variant, for subsequent reruns. See [saving and reopening generation prompts](minimax-h3.md#save-and-reopen-generation-prompts).
- Reference binaries use the existing Library asset store and are included in Library ZIP export/import, Library Folder projects and Google Drive synchronization; no API keys are included. Existing saved prompts are never deleted or rewritten by compatibility loading.

## Local draft persistence

- The workspace, target model/mode, separate H3/LTX canvases, H3 settings and workflow drafts (including original and edited files) persist in browser/Electron IndexedDB, not in the cloud or source tree; storage failures are shown explicitly. Local saves wait for a 400 ms typing pause instead of cloning the full media workspace on every keystroke.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Video Prompt Generator with colored references and production prompt](../screenshots/10-video-prompt-generator.png) -->

## Related guides

- [MiniMax H3 REF2V](minimax-h3.md)
- [LTX Director and audio](ltx-and-audio.md)
- [Library and backups](library.md)
- [Provider connections](../connections.md)

---

[Back to documentation index](../README.md)
