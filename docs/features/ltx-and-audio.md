# LTX video and audio

[Documentation index](../README.md) | [Project overview](../../README.md)

Compose LTX timelines, animate an image with LTX 2.5 Audio-Sync, and reuse speech, photos and soundtracks. Director and Audio-Sync are independent workflows inside Video.

## On this page

- [Director timelines and TTS](#director-timelines-and-tts)
- [LTX 2.5 Audio-Sync](#ltx-25-audio-sync)
- [LTX-Ripple-FFAF](#ltx-ripple-ffaf)
- [Required nodes and models](#required-nodes-and-models)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Director timelines and TTS

- Build LTX 2.3 or LTX 2.5 timelines from prompt-only clips, image clips, or both.
- Give every clip its own prompt and duration, with optional generated continuation prompts.
- Add photos and soundtrack audio from local files or directly from the Library.
- Import Advanced TTS dialogue as speaker-aware clips with optional per-character reference photos.
- Add generated speech context and control frame rate and guidance.
- Configure the LTX checkpoint and up to three LoRAs.
- Model lists are not filtered by LTX version, filename, or extension. Select checkpoints or diffusion models in Safetensors/GGUF format; Director chooses the corresponding ComfyUI loader. Select both the text encoder and text projection for LTX 2.3, or the single encoder for LTX 2.5. Encoder choices and model selections are retained in saved projects and Library presets. Unfiltered choices still require models compatible with the selected LTX version.
- Reduce final decode VRAM usage with tiled VAE decoding and an adjustable tile size.
- Accelerate both LTX profiles with optional CacheDiT settings shared across LTX 2.3 and LTX 2.5.
- Generate the final video through ComfyUI and download the result.
- Generate multilingual speech through supported Chatterbox and IndexTTS ComfyUI nodes.
- Build solo or multi-character conversations with named voices, reusable references, per-line emotions, and composite character thumbnails.

## LTX-Ripple-FFAF

Open **Video > LTX-Ripple-FFAF** (First Frame All Frames). This uses the supplied `00-LTX_Ripple_FFAF_EditAPI.json` graph, checked against its normal UI workflow, independently of Director, Audio-Sync and H3.

1. Select the **source video** and its **already edited first-frame image**, from disk or Library. This workflow propagates that edit; it does not edit the first frame itself.
2. Keep the original editing prompt or describe what should remain consistent. The prompt is sent verbatim, without a remote rewriter.
3. Open the option accordions as needed. All active scalar settings are exposed: models, required Ripple LoRA, resolution, source frame skipping/stride, conditioning, sampling, CacheDiT, attention, tiled decoding, encoding and comparison labels.
4. Use **Check nodes and models** before generation. It validates without uploading or queueing. **Export API workflow** uploads the two inputs but does not queue a render.
5. Generate, monitor node/step progress and available ComfyUI previews, and use **Cancel this operation** when needed. Cancellation targets only this job; unsupported targeted cancellation is reported rather than falling back to a global interrupt.

Defaults remain those in the supplied workflow: LTX 2.5 distilled NVFP4 model, Gemma4 LTX encoder, LTX 2.5 video/audio VAEs, `LTX2_camera_control\LTX25_Ripple_v11.safetensors` at **1.35**, **0.4 MP / 16:9 / alignment 32**, **24 FPS**, **Euler / simple / 8 steps / CFG 1 / denoise 1**, fixed seed **132644**, CacheDiT enabled (warmup 6, interval 4, noise 0.001), and the original attention/decode settings. The template's 217-frame placeholder is replaced when a video is selected. Frame count must be **8n + 1**. FPS edits also update all three output encoders to prevent timing drift.

**Source-length protection:** selecting a video reads its duration and fills the largest valid LTX frame count that fits at the current forced FPS, skip and stride. It rounds **down**, never up: a 5-second source at 24 FPS fits to **113 frames** rather than 121 or 217. You can shorten this count. **Allow extra frames (extend beyond source video)** is unchecked by default; increasing beyond the source requires explicit opt-in. Turning it off clamps the count again. FPS/skip/stride edits update the limit, preserve manually shortened selections, and refit a full-source selection. Restored older drafts are also clamped, not silently allowed to extend.

The browser's duration estimate is not the final safety boundary. With extension off, a `ComfyMathExpression` derives the aligned count from `VHS_LoadVideo`'s **actual decoded frame-count output**, after its cap/skip/stride. Video latent length, audio latent length, guide slicing, source output and comparison frames use this same safe count. This prevents a short or variable-frame-rate source from producing an invented tail even if its duration metadata is imprecise. With explicit extension on, the supplied workflow's requested-length connections are restored. Duration metadata and the extension choice are retained in workspace/Library snapshots.

Four optional model-only LoRAs can be chained after Ripple and before its optimization patches. Slots start disabled; choose LTX 2.5-compatible LoRAs and adjust each strength. The required Ripple LoRA remains separate and adjustable. Large option menus are constructed only when their accordion opens.

The three original outputs are retained: **edited video** with the source soundtrack, **source video**, and **silent side-by-side comparison**. Each output supports download, frame extraction and Library save. Presets and saved outputs retain their prompt, settings, original image and source-video binaries; rendered results also retain the exact executed graph and seed. Workspace drafts persist independently in IndexedDB, and Library assets follow the existing Drive backup/restore paths. Loading a Ripple item reopens this tab without replacing other video workflows.

Five disconnected nodes (`445`, `815`, `933`, `935`, `952`) are omitted from submission; none contributes to the original outputs. Missing nodes/models are explicit errors, never silently replaced. See [Ripple requirements](../reference/comfyui-workflows.md#ltx-ripple-ffaf).

## LTX 2.5 Audio-Sync

Open **Video > LTX 2.5 Audio-Sync**. This follows the supplied ImageAudioToVideo v10 workflow, not LTX Director or an H3 finishing stage.

### Direct generation or prompt-generator transfer

1. Enter a video prompt directly, or open **Video Prompt Generator**, use the **generation** template, select **LTX 2.5 Audio-Sync** as the destination and click **Send to LTX 2.5 Audio-Sync**.
2. Select one first-frame image and one soundtrack, from local files or Library. A generator transfer copies the edited files, target aspect and requested duration into an independent draft; subsequent composer edits do not change it. Extra images, extra audios, video references and character-replacement prompts are rejected explicitly rather than silently discarded.
3. **Enable Qwen prompt enhancement** uses the workflow's local image-aware writer. A generator transfer automatically switches it **off** to avoid rewriting the generated prompt; you can explicitly re-enable it afterward. With enhancement off, the writer and its separate model are omitted. Optional enabled lyrics are appended separately without changing the saved scene prompt. Opening this subtab never calls a cloud prompt provider.
4. Selecting a soundtrack locally reads its duration and resets the passage start to 0. Use the shared H3 waveform editor to select and apply any excerpt, preview it, or advance to the next passage. A passage extending beyond the file is rejected. The browser must support decoding the input audio format; WAV is recommended.
5. Use **Check nodes and models**, then **Generate LTX 2.5 Audio-Sync**. The preflight does not upload or queue anything. Exporting an API workflow uploads the inputs to obtain real ComfyUI filenames, but does not queue a render.

**Text to video** bypasses first-frame conditioning in both passes. Audio remains mandatory. An optional image can still guide Qwen; without one, its image input is omitted.

### Waveform, passages and optional words

- The waveform always represents the **full original**, including after applying an excerpt. Drag to select, click to seek, use **Set start/end here**, or enter precise start/end times. Playback includes volume, a seek bar and **-5 s / +5 s** controls.
- **Apply passage + Audio-Sync duration** encodes only the selection as WAV and updates video/audio duration together. Its server start is **0**, not the original passage offset, so it is never trimmed twice. Applied start/duration fields are locked; edit the original waveform and apply again instead.
- **Next N s** applies the next passage of the same length, shortening the last passage at the track end. Neither Next nor playback calls a transcription provider. **Restore original audio** resets to the full input.
- **Use exact lyrics / spoken words** is **off by default** and independent of Qwen. Enable it to type words separately, or explicitly **Transcribe current passage** using Gemini or an audio-capable OpenRouter model. Only the applied WAV is sent; provider calls use Connection Settings and may incur charges.
- Changing the passage makes old enabled words stale. Edit, confirm, transcribe again, or disable them before rendering. No previous transcript is silently reused. Enabled words are added as verbatim-vocal instructions to the LTX input prompt; they are not a separate native LTX conditioning node, and Qwen can still rewrite the prompt if explicitly enabled.
- Apply pending waveform changes before checking, exporting, saving a setup or rendering. With words disabled, no transcript is required for lip sync.

### Source defaults and accordions

- Resolution: **4:3, 0.4 MP, alignment 32**; the summary resolves the same dimensions as the ComfyUI resolution node.
- Source duration: **13.2000732421875 seconds**, **24 FPS**. This is replaced with the selected local audio duration, not treated as a universal clip length.
- Two `euler_ancestral` passes with the supplied manual sigma schedules and video/audio CFG 1, plus latent spatial 2x upscale. First-pass image strength is 0.7; second-pass strength is 1.
- The source first-pass seed can be fixed or randomized; the second pass retains its independent seed, initially 42.
- Tiled decode starts at tile 512 / overlap 64 / temporal 64 / temporal overlap 16.
- **Qwen prompt enhancement**, **Models**, **Resolution and image conditioning**, **Sampling - first and second pass**, and **Negative prompt, decode and output** are accordions. Their contents are constructed only when opened. Qwen controls disappear when enhancement is disabled; image strengths disappear in text-to-video mode.
- Model choices come from the installed server catalog without filename filtering. Safetensors use native loaders; selecting a GGUF diffusion model or video text encoder switches to the corresponding GGUF loader. Compatibility with LTX 2.5 remains the user's responsibility.
- **LoRAs - camera and style (up to 4)** provides four independently enabled slots, each with an installed-file selector and model strength (-20 to 20, initially 1). Enabled LoRAs are chained in slot order after the diffusion loader and shared by **both sampling passes**; the Qwen writer, video text encoder, VAEs and audio conditioning are unchanged. Disabled slots retain their selections but add no loader nodes. Old setups without LoRA settings keep the original model path. Select camera/style weights compatible with LTX 2.5 and the chosen model/quantization; a catalog entry is not a compatibility guarantee.

The same trimmed audio latent, with a zero noise mask, feeds both passes. Final audio is decoded with the audio VAE and attached through `CreateVideo`, exactly as in the source workflow. This is **not** H3's optional local original-WAV replacement: audio undergoes VAE reconstruction and output encoding, so it is not guaranteed to be a bit-identical soundtrack or perfect lip synchronization.

### Saved setups, output and validation

The workspace saves Audio-Sync's draft, input files, passage, optional words and transcription settings independently in IndexedDB. **Save setup to Library** creates a reusable preset with its image, applied WAV, full original audio, passage and words; **Save video to Library** stores the downloaded result and exact execution snapshot with those inputs. Original file timestamps are retained so restored transcripts stay associated with the right passage. These binary assets also follow the existing Drive backup/restore paths. Loading either reopens Audio-Sync without replacing Director, H3 or the prompt composer. Saved video prompts also offer **Audio-Sync** as a Library destination.

LoRA selections, enabled states and strengths are part of these settings, including Library/Drive setups, generated-result snapshots and API exports. Prompt-generator transfers preserve them while switching Qwen enhancement off.

The output includes download, full-resolution selected/last-frame PNG export, Library saving and executed-API export. Enhanced prompt text is read from execution history, including cached outputs. If ComfyUI does not report it, the app explicitly labels the displayed text as the input prompt instead of claiming it is the final enhanced prompt.

Cancellation targets this operation's prompt ID only; it never sends a global interrupt. An older server that cannot confirm targeted cancellation reports that limitation explicitly.

Source adaptations include clearing personal prompt/input filenames, using a float duration instead of the API export's fractional `PrimitiveInt`, synchronizing video/audio duration, directly wiring the selected prompt branch, pruning unused branches/models, and adding the model-only LoRA chain only when slots are enabled. The source frame expression remains duration x FPS + 1; LTX performs its normal latent frame alignment.

Validation includes source-export comparison, mocked execution/cancellation and real installed-schema checks for enhancement on/off and image/text modes. Schema validation is not a GPU render or a visual-quality assessment. Run `node --test services/ltxAudioSyncWorkflow.test.mjs services/ltxAudioSyncService.test.mjs`; set `COMFYUI_AUDIO_SYNC_LIVE_URL` to enable the live schema check. Optionally set `LTX_AUDIO_SYNC_REFERENCE_API` to the supplied API JSON path for the exact source comparison.

## Required nodes and models

See [LTX Director dependencies](../reference/comfyui-workflows.md#ltx-director) before preparing the workflow. Connection setup and default CacheDiT values are documented in [Connections](../connections.md#comfyui).

Audio-Sync has its own [LTX 2.5 node and model requirements](../reference/comfyui-workflows.md#ltx-25-audio-sync). Nothing is automatically installed or downloaded.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![LTX Director multi-clip timeline](../screenshots/05-ltx-director.png) -->

<!-- ![Advanced TTS multi-character dialogue](../screenshots/06-advanced-tts.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [MiniMax H3 REF2V](minimax-h3.md)
- [Voice recording and local media tools](creative-tools.md#local-media-tools)

---

[Back to documentation index](../README.md)
