# Creative tools

[Documentation index](../README.md) | [Project overview](../../README.md)

Prompt analysis, visual transformations, local media utilities and upscaling are grouped below by task.

## On this page

- [Prompt tools and extraction](#prompt-tools-and-extraction)
- [PastForward transformations](#pastforward-transformations)
- [Stylise Anything and design tools](#stylise-anything-and-design-tools)
- [Local media tools](#local-media-tools)
- [Upscaling](#upscaling)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Prompt tools and extraction

- Prompt analysis through Mammouth AI, Ollama vision models, or ComfyUI Florence2.
- Local Ollama background and subject extraction with selectable installed models.
- Creative Magic Soup generation through Mammouth AI or Ollama, with adjustable creativity and color attribution for multiple numbered Main, Background, and Subject ingredients.
- Clothes, subject, object, background, pose, mannequin, and font extraction.
- MediaPipe pose detection with ControlNet-compatible output.

## PastForward transformations

- PastForward decade, hairstyle, fantasy, superhero, and historical transformations with local FLUX2 selected by default, local Qwen Edit, or Mammouth AI.
- Choose the PastForward source from the computer or the Library with any engine, select any combination of decades, regenerate individual results, or export an album containing only the active decades.
- Track each selected decade independently with named progress and error details, and open generated results in a full-size uncropped preview.
- FLUX2 uses theme-specific editing prompts and optional reinforced source conditioning to preserve identity while changing hairstyles, clothing, backgrounds, or visual eras.
- Through the Decades requires an explicit Woman/Man identity selection for FLUX2 and Qwen Edit. Each engine receives only the selected gender's hairstyle, wardrobe, anatomy, and presentation instructions, preventing cross-gender transformations.
- Hairstyle Time Machine uses the same required Woman/Man selection with FLUX2 and Qwen Edit, applying a distinct gender-specific hairstyle for every decade while preserving the face, clothing, pose, framing, and background.
- Qwen Edit uses concise model-specific decade prompts that preserve identity while requiring visibly different period hairstyles and complete wardrobe replacement. Its advanced controls include the model, encoder, VAE, sampler, scheduler, shift, source resolution, CFG, and synchronized Lightning 4-step and 8-step presets that switch both the installed LoRA and sampling steps.
- Superhero Saga renders decade-specific comic-book illustrations rather than photorealistic costume portraits, with complete heroic poses, environments, and cover compositions. Its required Woman/Man identity selector sends only the matching gender instruction to FLUX2, Qwen Edit, and Mammouth, preventing cross-gender transformations and generic Superman substitutions.
- Historical Cameo inserts the subject into a concrete event for each decade, with a believable role, supporting crowd, period action, and documentary photographic composition.
- Historical Cameo provides ten selectable annual events per decade from the 1950s through the 2000s, plus event randomization and editable Photo Type and Shot & Angle controls when scene reimagination is enabled.
- Historical transformations require an explicit Woman/Man selection and optional source glasses and facial-hair declarations, allowing prompts to preserve those identity traits without introducing them when absent.
- Enable **Reimagine the scene** to replace the source background, pose, framing, camera angle, lighting, and composition while retaining the recognizable subject identity.

## Stylise Anything and design tools

- Stylise Anything transforms one source image through the existing local FLUX2 Edit workflow using 120 photographic presets grouped from the 1950s through the 2020s.
- Every Stylise Anything preset field remains editable, including its name, photo type, camera type, film or media, visual style, and additional instructions. Source composition can be preserved or freely restyled, with advanced FLUX2 model and sampling controls available in the same panel.
- Logo, banner, album-cover, and theme generation.

## Local media tools

- Video frame extraction, palette extraction, image resize, and crop tools.
- **Tools > Reference Maker** composes 1 to 9 photos into a reference sheet locally, without AI, API access or ComfyUI. Add multiple files or select Library images, then choose each photo's original/fixed aspect ratio or **Free crop**, move/resize its crop, duplicate, remove or reorder it. The live preview redraws on the next animation frame, without an Apply/Generate step. Auto columns create a 2-by-2 sheet for four images or a 3-by-3 sheet for nine images; choose 1 to 9 columns manually, a background color, scaled spacing and a maximum output resolution of 0.5/1/2/4/8 MP. Each row shares a photo height, preserving the selected crop ratios without stretching or additional cropping; incomplete rows are centered. Dimensions are capped at 8192 pixels. **Download PNG** exports the currently previewed sheet; **Save to Library** stores it as a reusable image in the gallery. Reference Maker's own reset, Tools reset and the active-panel reset all clear its photos and settings. Work in progress survives tool switches but is not persisted across app restarts. Regression checks: `node --test utils/referenceSheet.test.mjs`.
- **Tools > Video Extractor** uses the Frame Extractor-style preview, timeline, editable FPS and frame stepping to select start/end boundaries (in seconds or with **Set start/end here**). Export locally to a real H.264/AAC MP4, preserving source audio when present, or toggle **Reduce resolution (50%)** to halve both dimensions. Download any extracted clip; **Save to Library** is available only when the verified output duration is strictly less than 5 minutes (300 seconds). Variable-frame-rate sources use time-based boundaries. The bundled single-thread FFmpeg WebAssembly encoder requires no ComfyUI server or media upload; large files consume browser memory and can be cancelled. FFmpeg core is distributed under GPL-2.0-or-later.
- Video Extractor probes small portions at both ends of the selected source before loading the encoder, then mounts it read-only through FFmpeg WORKERFS. FFmpeg reads only the requested portions instead of copying the entire source into browser/WASM memory, including for sources larger than 2 GB. Encoded output still uses memory. Read failures identify whether the source video or a bundled encoder asset is inaccessible. If the source becomes unreadable after selection, select it again; if necessary, copy it to a new local file and select the copy.
- Record a selected microphone, computer output audio, or both; export WAV audio and save it with an optional photo as a reusable voice reference.

## Upscaling

- SeedVR2 and Z-Image creative upscaling workflows.
- SeedVR2 lists all DiT and VAE models reported by the connected ComfyUI server and selects the first available model by default. Choose another model in **Advanced**; a valid selection is preserved when the lists refresh. Removed models fall back to the first available model, and upscaling is blocked with a message if either list is empty.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Voice Recorder and reusable Library voice reference](../screenshots/08-voice-recorder-library.png) -->

## Related guides

- [OpenRouter and Ollama](../connections.md)
- [Swap a Person and Photo Fusion](swap-and-fusion.md)
- [Library and backups](library.md)

---

[Back to documentation index](../README.md)
