# Video Prompt Generator

[Documentation index](../README.md) | [Project overview](../../README.md)

Create a production prompt from your idea and edited references, save its complete prompt-generation setup, then send it to H3.

## On this page

- [Video workspace](#video-workspace)
- [References and media editing](#references-and-media-editing)
- [Providers and editable templates](#providers-and-editable-templates)
- [Original audio and editable lyrics](#original-audio-and-editable-lyrics)
- [Send to MiniMax H3](#send-to-minimax-h3)
- [Library snapshots and restoration](#library-snapshots-and-restoration)
- [Local draft persistence](#local-draft-persistence)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Video workspace

- **Video** contains **Video Prompt Generator** (first subtab), **LTX Director**, **Minimax H3**, and the independent [Character Swap H3 Shot Planner](character-swap-h3.md). Existing Library, TTS and model transfers still open LTX Director inside this workspace.

## References and media editing

- The dedicated prompt generator accepts up to **4 pictures, 2 videos and 2 audio files**, with previews, stable numbered/color-coded reference tokens, per-reference roles and click-to-insert tokens. Images and videos have free/preset-ratio crop and pixel resizing; video editing also trims and exports a real local H.264 MP4 with audio using the existing FFmpeg encoder. Restore Original undoes edits.

## Providers and editable templates

- Choose OpenRouter, Gemini or Mammouth, using the existing Connection Settings keys. OpenRouter loads its live model catalog automatically into a native dropdown. Search by name, model ID or input type (`video`, `audio`, etc.); each entry shows its supported inputs. **Refresh OpenRouter models** retries a failed load or updates the catalog. Gemini/Mammouth model IDs remain editable.
- Attaching references filters the OpenRouter list to models supporting **all** required input types. Grok 4.7 remains the default for compatible requests, but it does not advertise video input. An incompatible current selection stays visible with a warning; choose a video-capable model from the list. Selection never changes automatically, and generation is disabled until an available, compatible model is selected. The selected model is saved in the workspace and Library prompt snapshot, independently of the global OpenRouter default.
- Gemini receives native images/video/audio; OpenRouter also validates each modality before sending a completion (audio must be WAV/MP3). Mammouth currently accepts image references only in this integration and explicitly rejects video/audio rather than silently omitting them. Generation sends the idea, template, notes and edited files to the selected provider; provider billing/access applies. Requests are limited to 18 MB total media before base64 encoding. Catalog capabilities do not guarantee account access, credits or that every provider accepts every media format.
- **Templates** edits and saves the generation and character-replacement canvases locally. Generation returns `integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`; replacement returns `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. Keep these field names/order when customizing templates. Malformed, empty or incomplete responses are reported, not accepted as successful prompts.

Regression checks: `node --test components/VideoWorkspace.test.mjs services/openRouterService.test.mjs services/videoPromptService.test.mjs services/videoPromptLibrary.test.mjs`. These use mocked providers; live catalog capabilities do not establish paid-generation access or model output quality.

## Original audio and editable lyrics

- The audio reference cards include the same original-track waveform, precise start/end selection, selection playback and **Next N s** as H3. Select the first four seconds, click **Apply passage + prompt duration**, then compose/transcribe: only that real WAV excerpt is attached to the model and transferred to H3. The full recording stays local for subsequent selections. Prompt excerpts support 1-120 seconds; H3 rendering supports at most 60. Pending partial selections block model requests and transfer until applied.
- **Force original WAV soundtrack (lock)** persists alongside the selected track. Selecting original mode enables it; it can also be checked explicitly in either editor. It prevents switching back to generated mode without unlocking and locally replaces all server sound with the selected WAV after rendering. It sets compatible H.264/24 FPS/no-loop settings, reports mux failures explicitly and never substitutes generated audio. Both editors share this audio choice so transferring a new prompt cannot quietly reset it.
- **Soundtrack mode** lets you keep the existing reference/generated-audio behavior or explicitly select an **original track** to preserve its performance in H3's final soundtrack. Original mode also tells the prompt model not to rewrite words, invent music or rearrange the recording. Apply the desired passage in H3 before rendering; original mode uses H.264 MP4 at 24 FPS, no loops/ping-pong, and trims surplus video to the audio endpoint, subject to frame/codec rounding. AAC output is not a lossless WAV copy, and keeping the soundtrack does not itself guarantee accurate generated lip motion. See [H3 original soundtrack](minimax-h3.md#original-soundtrack-and-passage-lyrics).
- On an audio card, **Use exact lyrics / spoken words** exposes an editable passage transcript and **Transcribe current passage**. This is an explicit API call with the selected Gemini/OpenRouter model and **only the current audio file**; provider capabilities, credentials and charges apply. Mammouth audio is unsupported. No web lyrics lookup or automatic calls on passage changes.
- Edit/transcribe again after changing the passage. Stale enabled lyrics block generation rather than silently reuse an earlier verse; you can explicitly confirm unchanged words or disable the option. The H3 panel also offers manual **Refresh prompt for current passage** to replace old quoted vocals in an existing scene description. Lyrics, passage stamps and original-track selection survive prompt Library round-trips and H3 transfers.

## Send to MiniMax H3

- Output can be edited, previewed with colored Picture/Video/Audio/Subject tokens, copied or exported as text. **Send to Minimax H3 draft** transfers the prompt, edited media, target aspect and duration into one of four independent workflow slots. **Reference to video** executes the supplied `00-rEF2V` MiniMax H3 workflow through ComfyUI; Text to video, Character replacement and Audio-driven video remain preparation slots for future graphs.

## Library snapshots and restoration

- Each successful video prompt generation automatically saves a **Library > Prompts** item containing the output, exact generation-time idea/provider/model, aspect ratio, duration, workflow, editable canvases, full instruction, stable reference numbers/roles, and original plus edited images/videos/audio. Later changes to the composer do not change that saved snapshot. **Save to Library** also saves edited output as a new item or retries a failed save; prompts created before this feature save the current setup and are labeled accordingly.
- Library details preview the saved reference media and show all settings. **Open in Video Prompt Generator** restores the complete setup without replacing your independent Minimax workflow drafts. Reference binaries use the existing Library asset store and are included in Library ZIP export/import, Library Folder projects and Google Drive synchronization; no API keys are included.

## Local draft persistence

- The workspace, editable canvases, H3 settings and workflow drafts (including original and edited files) persist in browser/Electron IndexedDB, not in the cloud or source tree; storage failures are shown explicitly. No new prompt-generator-to-LTX link is enabled yet.

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
