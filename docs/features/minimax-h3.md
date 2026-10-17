# MiniMax H3 REF2V

[Documentation index](../README.md) | [Project overview](../../README.md)

Execute the connected reference-to-video workflow. Other H3 workflow slots remain reserved for future graphs.

## On this page

- [Workflow settings and six LoRAs](#workflow-settings-and-six-loras)
- [Reference limits and token mapping](#reference-limits-and-token-mapping)
- [Timing and resolution](#timing-and-resolution)
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

## Live preview and cancellation

- **Live preview** is available through KJ's client-targeted WebSocket API (JPEG, animated WebP or MP4), with independent preview resolution, quality, frame count, FPS, tiny/full VAE and audio controls. It is optional and can add decoding/VRAM cost. Sampling, preview, source soundtracks, conditioning VAEs, output audio, sigma extension, prompt display, LoRA chain and output-saving controls are independently adjustable where applicable. Disabling a branch removes/bypasses its nodes, rather than only hiding UI. Normal tab changes do not cancel a running H3 job. **Cancel** uses ComfyUI's atomic per-job `/api/jobs/{id}/cancel` endpoint, never a global interrupt; an older server without it reports a cancellation error and must be managed in ComfyUI. Closing/reloading the application does not stop an already submitted server job or resume its monitor.

## Execution and optional prompt rewriting

- Generation uploads enabled references to the configured ComfyUI server, displays the completed output and offers the exact executed API graph/prompt. Saved output remains on ComfyUI; disabling Save output uses its temporary folder. Browser playback depends on the selected output codec; image-sequence outputs remain in the server output folder. By default ReferencePack's provider is **none**, using the dedicated generator's prompt unchanged except reference-token remapping. Optional server-side rewriting uses a local endpoint or `OPENROUTER_API_KEY` / `LLM_KEY` from the **ComfyUI server environment**, never a copied/embedded workflow key. Hosted rewriting may incur an additional charge.

## Save rendered output to Library

- **Save to Library** under the last completed H3 output copies the original result into **Library > Videos** (or Images for GIF/WebP/PNG output), with a thumbnail, actual seed, prompt, exact render settings and executed API graph. It stores a local binary asset, not the temporary ComfyUI URL, so playback/download and Library ZIP/Folder/Drive backups do not depend on the server file remaining available. Settings edited after the render do not change the saved result. Failed saves remain retryable; unavailable thumbnail codecs are explicitly reported and use a placeholder without discarding the original output. Library details expose the H3 settings/workflow; saving a result does not create a runnable input-reference snapshot. Image-sequence formats save only the file returned by ComfyUI, not the whole server-side sequence.

## Regression checks

- Regression checks: `node --test services/minimaxH3Workflow.test.mjs services/minimaxH3Service.test.mjs services/minimaxH3Library.test.mjs services/videoPromptService.test.mjs services/videoPromptLibrary.test.mjs services/videoPromptDrive.test.mjs services/openRouterService.test.mjs services/videoClipService.test.mjs`.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![MiniMax H3 REF2V settings, live preview and completed video](../screenshots/11-minimax-h3.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [Library and backups](library.md)
- [Complete required-node list](../../COMFYUI_REQUIRED_NODES.txt)

---

[Back to documentation index](../README.md)
