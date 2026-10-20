# MiniMax H3 REF2V

[Documentation index](../README.md) | [Project overview](../../README.md)

Execute the connected reference-to-video workflow. Other H3 workflow slots remain reserved for future graphs.

## On this page

- [Workflow settings and six LoRAs](#workflow-settings-and-six-loras)
- [Reference limits and token mapping](#reference-limits-and-token-mapping)
- [Timing and resolution](#timing-and-resolution)
- [Audio passages and waveform](#audio-passages-and-waveform)
- [Original soundtrack and passage lyrics](#original-soundtrack-and-passage-lyrics)
- [Continue from the last output frame](#continue-from-the-last-output-frame)
- [Live preview and cancellation](#live-preview-and-cancellation)
- [Execution and optional prompt rewriting](#execution-and-optional-prompt-rewriting)
- [Save rendered output to Library](#save-rendered-output-to-library)
- [Regression checks](#regression-checks)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Workflow settings and six LoRAs

- **H3 REF2V** retains the supplied model/CLIP/dual-VAE choices, resolution selector, duration/frame expression, `seeds_2` sampler, Beta scheduler, intermediate sigma extension, ReferencePack and VHS output controls. Six independently enabled LoRA slots preserve the source strengths; all start disabled. Optional patched-CLIP conditioning is off, matching the source graph. Refresh loads installed model/LoRA lists and format-specific encoder widgets; **Check workflow** validates active nodes/models/options without uploading or queueing a job. Active settings are checked again before generation.

## Reference limits and token mapping

- H3's native reference capacity is **9 pictures / 3 videos / 3 standalone audio files**; the linked prompt generator retains its 4 / 2 / 2 limit. Each reference can be disabled, and each video soundtrack can be excluded independently. Edited files are uploaded once without reapplying crops/trims. Sparse reference tokens are compacted by kind; available video soundtracks consume Audio labels before standalone audio. The server probe verifies silent videos before final audio numbering. Prompts mentioning missing/disabled references fail explicitly.

## Timing and resolution

- Native H3 sampling is 24 fps, with frame counts rounded using the source expression to `5 mod 17`; the UI shows effective frames/duration and binary-megapixel resolution. Canvas dimensions must be divisible by 32. ReferencePack supports at most 60 seconds, not a promise of model quality/VRAM availability; native H3 describes a trained range of about 124–362 frames. Output FPS is independently configurable. All-frame previews are limited to 1024 frames; select fewer preview frames or disable preview for longer clips.

## Audio passages and waveform

- Each standalone audio reference has two theme-matched players, without the browser's native audio controls: **Generation audio** previews the current reference file; **Original track** keeps the full recording available, with custom play/pause, seek and volume controls, a spaced-bar waveform, timeline ticks, highlighted selection and playback cursor. Drag across the waveform to select a passage, click to seek, enter precise start/end seconds, or use **Set start/end here**. **Play selection** stops at the selection end; the original track's play button can play the whole recording. Playback pauses when the workspace is hidden.
- **Apply passage + H3 duration** creates a real PCM16 WAV excerpt locally and updates both the reference and H3 duration. Merely moving the selection does not change the submitted audio; unapplied edits are identified. **Next 3 s** (or the current selection length) advances directly from the previous end and applies the next excerpt in one click. The last passage is shortened to the remaining recording, never looped. Adjacent selections use the same rounded sample boundary, avoiding duplicated/skipped boundary samples.
- The full original, selected timestamps and edited WAV remain in the local draft, including across reloads. Prompt Library saves/restores also preserve them. **Restore original** restores the full audio reference without resetting H3 settings. Native H3 frame rounding/output FPS still determine actual video duration; a 3-second audio selection is not a promise of exactly 3 seconds of rendered video. Passages cannot exceed H3's 60-second limit. Audio decoding, waveform calculation and WAV export use system memory, not GPU VRAM; decoding failures are reported without replacing the current reference.

## Original soundtrack and passage lyrics

- **Soundtrack mode** is explicit in both prompt preparation and H3. The default **Reference / generated audio** retains the existing graph: input audio conditions REF2V, while `VAEDecodeAudio` decodes sampled, newly generated audio. That mode can change words, voices, melody or accompaniment.
- **Original track - do not regenerate audio** instead connects the selected standalone audio output of ReferencePack directly to VHS. The applied PCM WAV is the soundtrack; no generated audio is decoded or mixed in, including in live previews. H3's joint sampling/reference conditioning remains unchanged. This preserves the recording's performance, **not a guarantee of exact lip synchronization**. MP4 encodes audio to AAC, so this is not byte-identical/lossless WAV copying.
- Apply the intended passage first. Its duration must match H3 duration. Original-track output requires **H.264 MP4, native 24 FPS, no loops and no ping-pong**; incompatible settings report an error instead of silently changing them. Original mode rounds the native frame grid up to cover the entire audio, then forces VHS `trim_to_audio` on to remove the surplus; frame and audio-codec/container rounding can remain at the endpoint. Missing/disabled/deleted soundtrack references are rejected, never silently replaced.
- On each audio card, enable **Use exact lyrics / spoken words**, enter/review the text, or click **Transcribe current passage**. This manually sends **only the current edited audio file**, never the preserved full song, to Gemini or an audio-capable OpenRouter model using Connection Settings. It can incur API charges. Mammouth does not support audio in this integration. Transcription requests audible words only, without web lookup/song completion; review `[unclear]` markers and mistakes.
- **Next N s** never makes an automatic API request. Enabled lyrics for an earlier passage remain visible but are marked stale and block prompt/video generation until edited, confirmed for the new passage or transcribed again. Turning lyrics off restores reference-only prompting. Late transcription responses do not overwrite a newer passage.
- **Refresh prompt for current passage** explicitly asks the selected LLM to retain the existing visual scene while replacing old quoted lyrics/music instructions with the current excerpt and reviewed words. It sends the enabled edited references and may incur provider charges; it does not start GPU generation or automatically save a prompt Library item. The main prompt remains manually editable. Review its result before rendering. Stale responses from changed/hidden drafts are not applied.
- Original-track selection, lyrics and their passage stamp persist with local drafts and prompt Library snapshots, including transfers between preparation and H3.
- **Force original WAV soundtrack (lock)** adds a local final mux after ComfyUI finishes. It discards **all server audio** and maps only server video plus the currently applied PCM16 WAV, copying video without GPU use or video re-encoding. The player, download, last-frame extraction and Library save use this corrected local MP4. Save/download it before closing the app; the corrected file is not written back to ComfyUI. A failed/cancelled mux is an error, never a fallback to the server soundtrack.
- Selecting original mode enables the lock; existing original-mode drafts can enable it explicitly with the checkbox. Enabling chooses compatible H.264/24 FPS/no-loop output settings. The lock and selected source are synchronized across the two editors, transfers, Next, last-frame continuation, reloads and prompt Library snapshots. To return to generated-audio mode, uncheck the lock first. API workflow exports only contain the server graph; the extra local mux is performed by this application.
- The same waveform passage editor is available **before the first prompt** in Video Prompt Generator. Apply the desired excerpt there, then transcribe/compose the prompt. Unapplied partial selections block prompt/video generation, transcription and transfer rather than silently submitting an older/full track.

## Continue from the last output frame

- Under a completed video, **Copy last frame to Picture 1** downloads that result and decodes forward to the actual last video frame, at full resolution. It overwrites one temporary PNG instead of retaining a reversed video in memory, so audio/container padding does not cause an approximate end-time capture. A decoding failure leaves Picture 1 unchanged.
- Existing Picture 1 keeps its reference identity, role and original image for **Restore original**; other references are untouched. If absent, Picture 1 is created. It is enabled for the next render. Then use **Next N s** on the original audio and generate the next clip. Nothing automatically starts another generation or overwrites the completed output. REF2V is reference conditioning, not a strict first-frame constraint: this assists continuity but cannot guarantee a seamless join. Image/animated-image outputs do not offer this video-frame action.

## Live preview and cancellation

- **Live preview** is available through KJ's client-targeted WebSocket API (JPEG, animated WebP or MP4), with independent preview resolution, quality, frame count, FPS, tiny/full VAE and audio controls. It is optional and can add decoding/VRAM cost. Sampling, preview, source soundtracks, conditioning VAEs, output audio, sigma extension, prompt display, LoRA chain and output-saving controls are independently adjustable where applicable. Disabling a branch removes/bypasses its nodes, rather than only hiding UI. Normal tab changes do not cancel a running H3 job. **Cancel** uses ComfyUI's atomic per-job `/api/jobs/{id}/cancel` endpoint, never a global interrupt; an older server without it reports a cancellation error and must be managed in ComfyUI. Closing/reloading the application does not stop an already submitted server job or resume its monitor.

## Execution and optional prompt rewriting

- Generation uploads enabled references to the configured ComfyUI server, displays the completed output and offers the exact executed API graph/prompt. Saved output remains on ComfyUI; disabling Save output uses its temporary folder. Browser playback depends on the selected output codec; image-sequence outputs remain in the server output folder. By default ReferencePack's provider is **none**, using the dedicated generator's prompt unchanged except reference-token remapping. Optional server-side rewriting uses a local endpoint or `OPENROUTER_API_KEY` / `LLM_KEY` from the **ComfyUI server environment**, never a copied/embedded workflow key. Hosted rewriting may incur an additional charge.

## Save rendered output to Library

- **Save to Library** under the last completed H3 output copies the original result into **Library > Videos** (or Images for GIF/WebP/PNG output), with a thumbnail, actual seed, prompt, exact render settings and executed API graph. It stores a local binary asset, not the temporary ComfyUI URL, so playback/download and Library ZIP/Folder/Drive backups do not depend on the server file remaining available. Settings edited after the render do not change the saved result. Failed saves remain retryable; unavailable thumbnail codecs are explicitly reported and use a placeholder without discarding the original output. Library details expose the H3 settings/workflow; saving a result does not create a runnable input-reference snapshot. Image-sequence formats save only the file returned by ComfyUI, not the whole server-side sequence.

## Regression checks

- Regression checks: `node --test services/audioClipService.test.mjs services/videoFrameService.test.mjs services/minimaxH3Workflow.test.mjs services/minimaxH3Service.test.mjs services/minimaxH3Library.test.mjs services/videoPromptService.test.mjs services/videoPromptLibrary.test.mjs services/videoPromptDrive.test.mjs services/openRouterService.test.mjs services/videoClipService.test.mjs`.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![MiniMax H3 REF2V settings, live preview and completed video](../screenshots/11-minimax-h3.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [Library and backups](library.md)
- [Complete required-node list](../../COMFYUI_REQUIRED_NODES.txt)

---

[Back to documentation index](../README.md)
