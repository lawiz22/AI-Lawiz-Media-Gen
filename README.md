# LAWIZ'S Media Generator

<div align="center">

**A Windows creative workstation for cloud AI, Ollama, and local ComfyUI production.**

[![Version](https://img.shields.io/badge/version-1.88.0-0ea5e9?style=for-the-badge)](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Windows](https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[Features](#features) · [Screenshots](#screenshots) · [Requirements](#requirements) · [Setup](#setup) · [Ollama](#ollama-setup) · [ComfyUI](#comfyui-setup) · [Production](#production-build)

</div>

LAWIZ'S Media Generator combines image generation, character creation, video direction, speech synthesis, asset extraction, upscaling, and model management in one React/Electron desktop application. It can use hosted generation through Mammouth AI, local language and vision models through Ollama, or configurable workflows on a local ComfyUI server.

> This repository contains the application and workflow definitions. AI checkpoints, LoRAs, ComfyUI, custom nodes, and third-party API access are not bundled.

## Version 1.88 Highlights

- Magic Soup accumulates multiple numbered Main, Background, and Subject ingredients instead of replacing previous selections. Each ingredient keeps a distinct color through generation, saved thumbnails, and Library details, while Reset clears the complete recipe.
- The Library provides full-text metadata search, provider and workflow filters, reusable tags, SFW/NSFW labels, one-to-five-star ratings, sorting, explicit page/all-results selection, checked-item exports, and confirmed batch actions.
- Library Folder projects synchronize additions, metadata updates, ratings, tags, safety labels, deletions, and orphaned assets while displaying the pending change count.
- FLUX2 Image, I2I Edit, Character, Swap Anything, and Stylise Anything workflows list compatible GGUF models plus every Safetensors diffusion model exposed by ComfyUI. The generated workflow automatically selects `UnetLoaderGGUF` or `UNETLoader` from the chosen file format.

## Features

### Image and Character Generation

- Text-to-image and image-to-image generation through Mammouth AI or ComfyUI.
- Local workflows for SD 1.5, SDXL, Flux, FLUX2 Simple, Qwen Image, Qwen Edit, Z-Image, KREA2 Simple, KREA2 RAW, Nunchaku Flux, Flux Krea, and face detailing.
- Qwen image-to-image editing with multiple source references passed independently to ComfyUI.
- FLUX2 Edit with a primary source image and role-based references for identity, outfit, background, pose, style, or custom instructions.
- Import the FLUX2 source and reference images from the Library, retain saved Library prompts, and generate role-aware reference hints through Mammouth AI. Pose references are analyzed directly for accurate pose guidance.
- Adjustable checkpoints, UNets, CLIP models, VAEs, samplers, schedulers, seeds, dimensions, and LoRA chains.
- Refine mode with source-image denoise control.
- Character generation with pose, clothing, background, and multi-angle controls.
- Character now defaults to FLUX2 with `flux2\flux2Klein9BInt8_v10.safetensors`, `qwen38BFluxKlein9BTE_38b.safetensors`, and `flux2-vae.safetensors`. Existing saved presets retain their selected models. **Load FLUX2 angle workflow** applies the supplied Klein multi-view prompts with this 9B model/CLIP pair, 4 steps, CFG 1, Euler, 1 MP, no LoRAs or CacheDiT, and no pose reference. It replaces the output settings but retains the source image and current seed. The first six outputs are front three-quarter, side profile, rear, rear three-quarter, high angle, and low angle; the seventh is a disabled close-up template requiring its bracketed angle/detail fields to be completed. The eighth slot stays disabled.
- Each reference output uses an editable **Full workflow prompt**, sent verbatim to CLIP unless **Preserve original background with new perspective** is checked. This opt-in checkbox replaces the background clause with a request to preserve the original location and objects as viewed from the requested angle. It also works with structured prompts and takes priority over custom backgrounds and background reference images. Stored prompts remain untouched, so unchecking restores their original wording. The reference prompts otherwise request photorealism and a neutral compositing background; they are not Scene Variation's source-style-preserving prompts. Switch an output back to **Angle / pose / expression** to use the original controls. Empty full prompts and unresolved close-up placeholders are rejected before upload or sampling. The seven stored texts match the supplied JSON; the six complete graphs were compared with the original 4B settings and matched seeds, ignoring node IDs, metadata and save filenames. Current defaults intentionally use 9B instead. Regression checks: `node --test services/characterAnglesWorkflow.test.mjs services/sceneVariationService.test.mjs`.
- **Return to standard FLUX2** exits full-prompt mode for all Character outputs at once, including disabled outputs and incomplete close-up templates. It removes the full prompt overrides and restores the angle/pose/expression controls while retaining their values, enabled outputs, models, sampling, seed, and background-perspective checkbox. It does not restore a historical snapshot from before loading the reference workflow. The button is unavailable while generating.
- SAM3.1-guided Swap Anything with destination/donor images, editable target regions, optional LoRAs, and FLUX2 sampling.
- Inpainting, composition, generated masks, and reusable source elements.
- Exportable ComfyUI workflows and reusable generation presets.

### Scene Variation

- Open Scene Variation between Character and LTX Director. Import an image locally or from the Library, select Gemini, Mammouth or an Ollama vision model, then click Analyze. No image is sent for analysis on import.
- New Scene Variation sessions default to `flux2\flux2Klein9BInt8_v10.safetensors`, `qwen38BFluxKlein9BTE_38b.safetensors`, and `flux2-vae.safetensors`, independently of Image Generation's current model. Manual selections and saved presets remain supported; these defaults do not download models.
- Review and correct the detected people, location anchors, visual style and indoor/outdoor classification before generating.
- The header's save icon stores a named **Scene Variation preset** in **Library > Presets**, using the same save dialog as Image Generation. Load it from the header's preset selector or open it from the Library; the trash icon deletes the selected preset after confirmation. Presets store FLUX2 model/CLIP/VAE, sampling, seed, LoRAs and CacheDiT settings, Global/Masked mode, amplitude, image count, analysis provider/Ollama model, SAM checkpoint, mask margin and pose edit area. They do not store source images, analysis, person-specific choices, masks, results or API keys. Loading keeps the current source and analysis, resets variation controls for review and clears masks for recalculation; it never triggers analysis or generation. An incoming Library preset waits for an active operation to finish. Scene Variation presets are separate from Image Generation presets and use the existing Library persistence and backup paths.
- Global remains the default, unchanged whole-scene workflow. Select **Masked by person** for isolated pose/expression edits. Camera, lighting and season are Global-only; switching back restores their controls.
- In masked mode, enable the desired people and click **Calculate masks (SAM3)**. The SAM3 checkpoint selector uses the installed checkpoint inventory and prefers SAM3.1. Calculation uses the `CheckpointLoaderSimple` + `CLIPTextEncode` + `SAM3_Detect` interface already used by Swap Anything, plus `GrowMask`, `MaskToImage` and `SaveImage`; other SAM extensions are not silently substituted. No model is installed or downloaded automatically. Required inputs and the checkpoint are checked on the connected server.
- SAM3 segments all detected bodies to protect unselected people. **Pose edit area** defaults to **Movement area**: fill the detected body's bounding rectangle and extend each side by 10%, 20% or 35% of its width/height for subtle, moderate or strong amplitude. This adds room for a new pose and background reconstruction beyond the old silhouette. The original SAM mask with its configurable pixel margin (default 32 source pixels) is also retained in the editable region. Select **Silhouette** for the previous tight-mask behavior. Expression-only targets still use a face mask restricted to that person's body. Other bodies are excluded and shared editable areas are removed. Empty, multiple or overlapping body detections stop preparation: refine the person descriptions or use a manual override. Each person's preview highlights the final editable region in magenta; verify that it covers the intended person and excludes the others, then click **Generate variations**. Automatic two-person segmentation and pose changes with Movement area have been confirmed in real use. Inspect every new source: SAM3 can identify the wrong person, and successful mask validation is not identity verification.
- When a tight mask prevents a pose change, select **Movement area**, choose the desired amplitude, calculate the masks again, and inspect the extra space around the old silhouette before starting a new generation. No new analysis is needed just to change the edit area. **Silhouette** remains available for restrained edits, and **Global** remains the unchanged whole-scene alternative. Retry intentionally reuses the old mask snapshot; start a new generation to apply recalculated masks.
- Each person has a separate **SAM description**, generated by Analyze and editable before calculating masks. It uses a short English noun phrase with distinctive visible hair/clothing cues and position, rather than position alone. These appearance details are sent only to SAM, never to FLUX2. Analyze again to populate this field in older analyses, or enter it manually; an empty field falls back to the original positional description. Editing it invalidates automatic masks. A more specific phrase can help distinguish people but does not guarantee a unique detection.
- ComfyUI's SAM3 encoder interprets commas as separate detection prompts and a trailing `:N` as a detection count. Scene Variation normalizes the text at the SAM encoding boundary to send one category per person, including for existing descriptions. Commas in a descriptive phrase therefore no longer create extra mask batches. For the former "4 mask images returned; expected 2" error caused by commas, calculate the masks again with the updated app; no new Analyze call or description rewrite is needed. The multiple-mask safety check remains enabled.
- Masks calculate once for the selected people, not once per output image. Stop during segmentation finishes the current mask workflow and submits no more detections. Person descriptions, person selection, pose-versus-expression targeting, checkpoint or margin changes invalidate automatic masks when they change the segmentation inputs. Changing the pose edit area, or amplitude with Movement area enabled for a pose, also requires recalculation; manual overrides remain unchanged. Use **Recalculate masks** to replace ready masks, or **Calculate masks (SAM3)** when masks are pending. No extra cloud analysis is triggered by mask calculation.
- **Manual mask override** remains optional: import an opaque grayscale PNG at exactly the source dimensions (maximum 16 megapixels). White edits, black protects; gray blends. Masks must contain both editable and protected pixels. Transparent, colored, empty, full-image and overlapping masks are rejected. Automatic masks have the same size and validation requirements.
- For a pose change, cover the person's entire old silhouette and intended destination while excluding every other person. For expression-only changes, restrict the mask to the face. Movement area adds geometric space, not a prediction of the requested pose: it may expose more background, cannot extend beyond the image, and cannot guarantee FLUX2 pose compliance. Overlapping people may still require separate preparation. If an expanded region covers the entire image, validation rejects it; use Silhouette with a smaller margin or a manual override. A mask is a pixel region, not a verified person detector.
- Masked generation runs one FLUX2 pass per selected person, feeding each composite into the next pass. Every variation starts from the original. The sampler uses a noise-masked source latent; the decoded edit is resized and composited over the original-resolution input using the original mask. Pixels outside editable regions bypass VAE decoding/resizing. Working resolution affects generated regions; final output retains source dimensions. Incorrect masks, boundary seams, identity/clothing drift and duplicates inside editable regions remain possible.
- Masked mode additionally requires `ImageScale`, `ImageToMask`, `SetLatentNoiseMask` and `ImageCompositeMasked`; node inputs and selected mask options are checked against the connected server before generation. Stop finishes all person passes of the current image. A failed intermediate pass does not publish a partial image; Retry starts from the original using the captured masks, prompts and settings, even after changing modes. Library saves include the masked tag and actual pass prompts, but do not persist masks for later replay. Reanalysis, source replacement and Reset clear imported masks.
- Subject descriptions use short source-position cues rather than wardrobe inventories. Reanalyze older images to refresh these cues. Both prompt paths preserve each person's original outfit from the image and explicitly lock the detected person count; correct missing or extra detections before generating. These are generation instructions, not automatic visual checks of the output.
- Independently enable pose, facial expression, lighting/ambience, camera angle and outdoor season variations. Pose and expression have per-person controls and group actions. Disabled axes are explicitly preserved in the prompt.
- Choose a fixed proposal, use its dice button, or select Auto. Subtle, moderate and strong select proposals at that exact level; changing amplitude resets proposal selections to Auto without enabling disabled controls. Auto prioritizes unused poses per person before repeating, prefers less-used posture families, and avoids duplicate combinations when possible; fixed manual choices remain identical across outputs. Dice actions do not enable disabled controls or call a cloud API.
- Pose analysis aims for 4 subtle, 6 moderate and 8 strong proposals per person when feasible. Moderate/strong proposals may change the support posture (for example, kneeling to fully standing on the same existing floor), not just the arms; constraints of the source scene still apply and no new supports are invented. Analyze again to obtain this larger pose bank; old analyses remain usable but cannot supply poses they never proposed.
- Pose and camera edits are explicit, visible targets. Camera changes preserve the physical scene, not its original screen-space projection. Analyze again to refresh proposals after analysis-prompt updates, then start a new generation: Retry deliberately reuses the original job's prompt and settings. These instructions improve the request but do not verify or guarantee the generated image's compliance.
- **Camera angle** distinguishes angle changes from zoom/crop changes. New analyses request source-relative angular moves (about 15/30/45 degrees for subtle/moderate/strong). The choice list filters explicit same-angle instructions, zoom/crop-only moves and movements described as a few inches/centimeters. Recognized angles get descriptive labels instead of analysis placeholders such as moderate-1. Proposals that produce the same short camera instruction are deduplicated, and source-relative left/right/higher/lower alternatives supplement recognized angles or replace an entirely filtered list without reanalysis. An explicitly empty camera proposal list stays empty; unrecognized instructions remain available. Auto cycles through distinct camera requests within a camera-only batch; a manual choice stays fixed. Different requests do not guarantee visually different results. Select a new angle if an old fixed choice is unavailable, then start a new generation rather than Retry.
- With **only Camera angle enabled**, Scene Variation uses a short prompt patterned after Character FLUX2's direct `Camera angle: 30 degrees left.` wording. Recognized lateral, vertical, low/high and aerial angles are reduced to their camera instruction, dropping incidental commentary about emphasizing a limb or profile. The short prompt preserves the same people, exact body poses, expressions, outfits, location and style without the long scene inventories or repeated TARGET/UNCHANGED instructions. The result summary records the instruction actually used. Combined-axis and masked edits retain their existing prompt paths. Character and Scene Variation still have separate model/sampling settings; this change does not copy them automatically. Code tests compare the FLUX2 reference and sampling nodes at matched settings, not the visual result. Pose retention and camera compliance still need evaluation on the generated image.
- Generate 1-8 images (default 4) sequentially from the original source. Stop finishes the current image without submitting the remaining jobs. Completed results survive errors; failed/stopped jobs can be retried with their original prompt and seed.
- FLUX2 settings are independent: GGUF/Safetensors model, CLIP, VAE, sampler, steps, CFG, megapixels, seed, two optional LoRAs and CacheDiT. LoRAs and CacheDiT start disabled. Models and required nodes must be installed in ComfyUI.
- Compare results with the source, inspect actual prompts/seeds, download, save to the Library or send to LTX Director. Reset clears this panel only.
- Global preservation targets the same location, people, outfits and visual medium (including VHS texture), not identical background pixels. Camera, lighting and season changes affect background appearance. Generative editing and optional LoRAs can still cause drift; prompts cannot guarantee perfect preservation.
- Focused regression checks: `node --test services/sceneVariationService.test.mjs`.

### Swap a Person

- Open **Fun > Swap a Person**, import the destination (Picture 1) and donor (Picture 2), choose a workflow and click **Swap person**. Local files and Library images are supported. **Swap Anything (SAM3)** remains the default mode, with the same engine and presets described below. The separate **LanPaint (Head Swap)** mode is described afterward. Neither mode requires preliminary AI analysis or manual mask preparation. Switching modes retains both images, the last result and each mode's independent settings. Swap Anything's existing behavior is unchanged.
- Presets cover **Face + donor hair**, **Face only**, **Full head**, **Hair only**, **Whole person** and **Outfit only**. Woman/Man/Person shortcuts are independent for destination and donor; mixed selections are allowed. Both final target descriptions remain editable. For several people, specify a position, such as `the face of the woman on the left`; there is no automatic person inventory or bystander-mask protection. Editing descriptions marks the preset Custom. Selecting a preset changes targets, not sampling settings or optional instructions.
- The default **Face + donor hair** reproduces the user's successful Swap Anything setup: destination `the woman's face`, donor `the woman's face and hair`, and empty optional instructions. It deliberately does not enlarge the destination target to all hair. **Face only** targets the face on both images. These are editing requests, not guaranteed clothing or hairstyle locks.
- **Validated in real use:** the simplified Swap a Person panel produced a user-approved face-and-hair replacement with natural integration, retaining the destination's purple shirt and background in the tested example. No preliminary analysis or manual mask preparation was needed. Start with **Face + donor hair**, the shared defaults below, empty optional instructions and **Reinforce destination style** off. This confirms the workflow on the tested images, not guaranteed preservation for every source/donor pair.
- Shared defaults: `flux-2-klein-4b-fp8.safetensors`, `qwen_3_4b.safetensors`, `flux2-vae.safetensors`, `sam3.1_multiplex_fp16.safetensors`, 4 steps, CFG 1, **DDIM**, 1 destination MP, 1.5 donor MP, SAM threshold 0.5, 2 refinement iterations and **2 px mask margin** on the scaled destination. **FLUX2 settings** exposes these parameters, seed (`-1` for random), and two optional LoRAs. Its **Swap Anything defaults** button resets sampling/model settings and style reinforcement while preserving images, target descriptions and optional instructions. Models must already be installed and compatible; no downloads are started automatically.
- With empty **Optional editing instructions**, the normal Swap Anything prompt now adds a short **destination-proportions instruction**: retain Picture 1's original head-to-body ratio and head size relative to its neck and shoulders; fit the donor face/head to the destination anatomy and perspective instead of copying its apparent size or camera distance from Picture 2. Do not enlarge the head or shrink the body. This addresses oversized-head results without changing models, sampling or masks. Nonempty custom instructions replace this default prompt. Start a new generation to apply the change; existing results are unchanged, and visual compliance still needs checking.
- **Reinforce destination style** is off by default. Enabling it appends a short instruction to match Picture 1's medium, softness, grain, color and capture artifacts, including VHS when present. Leave it off and optional instructions empty for the recommended starting settings. Swap Anything's own default prompt is unchanged; the proportions addition is specific to Swap a Person.
- The graph uses the original two SAM detections, green destination marking, donor crop and FLUX2 reference editing. It saves the decoded result directly, without additional masked-noise constraints, clothing subtraction, donor neutralization or final pixel compositing. Output size follows the original workflow's scaled destination. Identity, outfits, other people, style and integration still depend on SAM3/FLUX2: there is no pixel-exact preservation guarantee. Compare generated results visually.
- Compare with the original destination, inspect the actual prompt/seed, download or save to the existing Swap Anything Library category with the `swap-person` tag. Saved metadata uses the successful result's source/prompt/settings snapshot, not later edits. Donor images are not persisted for replay. Failed attempts retain the previous successful result. Reset clears this panel only; switching Fun tabs retains its state.
- Focused regression checks: `node --test services/swapPersonWorkflow.test.mjs`.

#### LanPaint Head Swap

- Select **LanPaint (Head Swap)** to use the supplied, user-tested reference workflow alongside the original SAM3 mode. It uses the complete destination and donor images, two FLUX2 reference latents and **LanPaint_KSampler**, without SAM detection, donor cutouts or a final masked composite. The SAM target/preset controls are hidden in this mode because they do not affect this graph.
- Defaults reproduce the supplied JSON: `flux2\moodyDesireMixFlux2_v30_pruned_fp8.safetensors`, `qwen38BFluxKlein9BTE_38b.safetensors`, `flux2-vae.safetensors`, and model-only LoRA `FLUX2\bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` at strength 1. Sampling uses **4 steps, CFG 1, Euler, simple, denoise 1**, Flux guidance **4**, LanPaint **2 steps**, **Image First** and **Image Inpainting**. The original seed **782879205881587** is retained; enter `-1` for a random seed.
- **Reference resolution** defaults to **2 MP** for both images. ComfyUI resizes them with **Lanczos before VAE encoding**, reducing large destination photos before processing. The generation target and empty latent use the resized destination's VAE-aligned dimensions, never the full-resolution original. Lower the resolution to 1 MP if needed. As in the supplied workflow, this is a target resolution, so small images may be enlarged. The original uploaded files are not overwritten, and results are not resized back to their original dimensions.
- The editable **LanPaint prompt** is copied verbatim from the reference, including the `head_swap:` trigger, destination proportions, lighting, pose/expression and neck/jaw integration instructions. With **Preserve destination style** off, it also retains the reference's photorealistic/sharp/4K wording; that wording does not set the output dimensions or guarantee VHS fidelity. The SAM3 mode's optional style/proportions additions are not appended to this prompt.
- **Preserve destination style** is a separate LanPaint checkbox, off by default. When enabled, the sent prompt replaces the reference's `Photorealistic, high quality, sharp details, 4K.` sentence with instructions to match Picture 1's visual medium, softness, grain, noise, colors, compression and blur, including chroma bleed and interlacing when VHS artifacts are actually present. It avoids importing the donor's finish or inventing absent artifacts, and prioritizes destination style over conflicting finish instructions. The editable prompt is not overwritten; unchecking restores its exact unmodified use. Models, LoRA, resolution and sampling are unchanged. The Library stores the effective prompt and the checkbox state from the successful generation. **Restore LanPaint workflow** resets the checkbox to off. This is generation guidance, not a guaranteed style lock; judge it on a new result.
- **CacheDiT** starts enabled with model type Flux, warmup 0, skip interval 0 and summary enabled, matching the reference. **FLUX2 settings** exposes models, LoRA, sampler, scheduler, guidance, denoise, LanPaint steps/prompt mode, seed and the CacheDiT toggle. **Restore LanPaint workflow** restores the supplied settings and prompt without clearing images or touching the SAM3 settings.
- Install [LanPaint](https://github.com/scraed/LanPaint) in ComfyUI, restart and reconnect. The default graph also needs **ComfyUI-CacheDiT**, the named model/encoder/VAE/LoRA and current core FLUX2 nodes. Disable CacheDiT only to intentionally omit it. Nodes and selected model/sampler options are checked before uploads; this panel does not install packages or download weights automatically.
- Library saves include the actual prompt, resolved seed, source snapshot and full `lanPaintPersonSettings`, with a `lanpaint` tag. Editing settings or changing modes afterward does not change the saved result's metadata. Donor images are not saved for replay. The user confirmed that the integrated baseline LanPaint mode works; the new optional style guidance has automated prompt/UI coverage but still needs visual evaluation on each image pair.

### Photo Fusion

- Choose between local ComfyUI FLUX2, local Qwen Edit, and Mammouth AI; FLUX2 is selected by default.
- Fuse two to four subject portraits with FLUX2 or Mammouth. Qwen Edit accepts two or three subjects without a background, or exactly two subjects plus one background image.
- Preserve each uploaded person as a distinct identity with explicit facial-feature and exact-subject-count instructions.
- Optionally identify any subject as a notable person, such as Elvis Presley or Marilyn Monroe, to reinforce that recognizable identity in FLUX2, Qwen Edit, and Mammouth prompts.
- Add an optional background reference while retaining personas, scenarios, poses, quality controls, and one to four output images.
- Configure the FLUX2 model, CLIP, VAE, megapixels, sampler, steps, CFG, seed behavior, and optional CacheDiT acceleration.
- Qwen Photo Fusion uses concise model-specific prompts to preserve every identity, prevent missing or duplicated people, and apply the selected scene without overloading the edit model.
- Configure the Qwen Edit model, CLIP encoder, VAE, source megapixels, AuraFlow shift, sampler, scheduler, steps, CFG, and optional LoRA. The synchronized Lightning presets select the matching installed LoRA and switch sampling to 4 or 8 steps.
- Retry individual results, inspect debug information, download all outputs as a ZIP, or save selected results to the Library.

<!-- ![FLUX2 Photo Fusion with multiple identities and advanced controls](assets/screenshots/09-photo-fusion.png) -->

### Local Models and LoRAs

- Scan the local ComfyUI model tree without uploading model files.
- Identify installed checkpoints and LoRAs through Civitai metadata or SHA-256 matching.
- Use CivArchive as a fallback for models deleted from Civitai.
- Detect updates, download models, organize files by model family, and retain sidecar metadata.
- Store safety classifications, previews, trigger words, and recommended generation settings.
- Load Civitai or CivArchive prompt examples directly into the Image Generator.
- `USE` selects the matching workflow family, compatible base model, LoRA, and trigger words.

### LTX Director and Audio

- Build LTX 2.3 or LTX 2.5 timelines from prompt-only clips, image clips, or both.
- Give every clip its own prompt and duration, with optional generated continuation prompts.
- Add photos and soundtrack audio from local files or directly from the Library.
- Import Advanced TTS dialogue as speaker-aware clips with optional per-character reference photos.
- Add generated speech context and control frame rate and guidance.
- Configure the LTX checkpoint and up to three LoRAs.
- Reduce final decode VRAM usage with tiled VAE decoding and an adjustable tile size.
- Accelerate both LTX profiles with optional CacheDiT settings shared across LTX 2.3 and LTX 2.5.
- Generate the final video through ComfyUI and download the result.
- Generate multilingual speech through supported Chatterbox and IndexTTS ComfyUI nodes.
- Build solo or multi-character conversations with named voices, reusable references, per-line emotions, and composite character thumbnails.

### Creative Tools

- Prompt analysis through Mammouth AI, Ollama vision models, or ComfyUI Florence2.
- Local Ollama background and subject extraction with selectable installed models.
- Creative Magic Soup generation through Mammouth AI or Ollama, with adjustable creativity and color attribution for multiple numbered Main, Background, and Subject ingredients.
- Clothes, subject, object, background, pose, mannequin, and font extraction.
- MediaPipe pose detection with ControlNet-compatible output.
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
- Stylise Anything transforms one source image through the existing local FLUX2 Edit workflow using 120 photographic presets grouped from the 1950s through the 2020s.
- Every Stylise Anything preset field remains editable, including its name, photo type, camera type, film or media, visual style, and additional instructions. Source composition can be preserved or freely restyled, with advanced FLUX2 model and sampling controls available in the same panel.
- Logo, banner, album-cover, and theme generation.
- Video frame extraction, palette extraction, image resize, and crop tools.
- Record a selected microphone, computer output audio, or both; export WAV audio and save it with an optional photo as a reusable voice reference.
- SeedVR2 and Z-Image creative upscaling workflows.

### Library

- Persistent local media library backed by IndexedDB, with full-size media stored as separate Blobs and only lightweight metadata and thumbnails loaded into application state.
- Save source media, results, prompts, seeds, and generation settings.
- Search, filter, import, export, reuse, and send assets between tools.
- Search across names, prompts, models, LoRAs, tags, and other textual metadata. Images and Characters expose dynamic Provider and Workflow subfilters.
- Classify Library items as SFW, NSFW, or unrated and attach reusable custom tags. The collapsible Safety & Tags panel supports combining multiple tag buttons with search and requires matching items to contain every selected tag. Checkboxes can narrow bulk actions to selected matching items, with separate controls for the current page or every filtered result. Without a selection, actions update every matching item. The local first-pass detector uses explicit common terms and leaves ambiguous items unrated for manual review.
- Rate Library items from one to five stars in the item detail modal and sort results by date, name, or rating in ascending or descending order. Ratings appear on cards only when set and are included in archives, Drive metadata, and Library Folder synchronization.
- Export and restore the binary `.lawiz-library` backup format, which stores a manifest and original media assets without Base64 expansion.
- Create a new archive or add the full Library/selected categories to an existing `.lawiz-library`; matching item IDs are replaced while other archived items are preserved.
- Export either complete selected categories or exactly the individually checked Library items into a `.lawiz-library` archive.
- Export every non-empty category to its own `LMG_<Category>_1.lawiz-library` file in one selected folder, creating missing archives and merging into matching existing files.
- Use a **Library Folder** as an incremental project: `manifest.json` tracks the project while content-addressed media is organized in folders such as `Images/`, `Videos/`, `Prompts/`, and `Audio TTS/`. Files are written only when their SHA-256 content is new within that category. A full project update mirrors the local Library, including removing deleted entries and asset files that are no longer referenced.
- The active Library Folder displays pending local additions, modifications, or deletions directly on the update button. Stored asset hashes let subsequent updates skip unchanged media instead of rescanning the complete project.
- Open a Library Folder project to import every manifest-referenced item and media Blob into the local Library. The portable `.lawiz-library` archive format remains available separately.
- Delete every item in the selected Library categories through a count-aware confirmation warning.
- Import legacy JSON Library backups progressively; each item is migrated into Blob storage as it is read instead of loading the complete backup into memory.
- Organize Photo Fusion, Swap Anything, and FLUX2 Edit assets in dedicated media categories.
- Store named voice references and character photos for TTS and LTX reuse.
- Optional Google Drive folder synchronization.

## Screenshots

The README is prepared for nine screenshots covering the main workflows. Capture them at `1600×900` or wider, keep the application theme consistent, hide API keys and personal information, and save them under [`assets/screenshots`](assets/screenshots) using the filenames below.

| File | Recommended capture |
| --- | --- |
| `01-image-generator.png` | Image Generator with provider, workflow options, source image, and generated result visible |
| `02-prompt-providers.png` | Prompt from Image showing Mammouth, Ollama, and Florence2 plus the Ollama model selector |
| `03-magic-prompt-soup.png` | Magic Soup at high creativity with three source prompts and a colorful generated result |
| `04-character-generator.png` | Character workflow with reference image, pose/clothing controls, and multiple results |
| `05-ltx-director.png` | LTX Director timeline containing several clips, character photos, prompts, and audio |
| `06-advanced-tts.png` | Advanced TTS multi-character dialogue with named voices, photos, and emotions |
| `07-model-library.png` | Models/LoRAs inventory with previews, metadata, filters, and a selected model |
| `08-voice-recorder-library.png` | Voice Recorder ready or recorded state beside a saved voice reference in the Library |
| `09-photo-fusion.png` | Photo Fusion with FLUX2 selected, multiple subject references, advanced settings, and a fused result |

The image tags are already placed throughout this document as comments. After adding a screenshot, remove the surrounding `<!--` and `-->` from its matching tag. See [`assets/screenshots/README.md`](assets/screenshots/README.md) for the capture checklist.

<!-- ![Image Generator with local and cloud workflow controls](assets/screenshots/01-image-generator.png) -->

## Requirements

| Requirement | Purpose |
| --- | --- |
| Windows 10 or 11 | Target platform and Electron system-audio loopback capture |
| Node.js 20+ and npm | Development and production builds |
| Mammouth AI API key | Mammouth generation and AI-assisted prompt features |
| Google Gemini API key | Direct Gemini features, when used |
| Ollama | Optional local prompt analysis, extraction, and Magic Soup |
| ComfyUI | Local image, video, TTS, and upscale workflows |
| Google OAuth client ID | Optional Google Drive synchronization |
| Civitai API key | Optional authenticated model operations |

Each local workflow requires its referenced models and custom nodes to be installed in ComfyUI. The application reads available choices from ComfyUI's `/object_info` endpoint, but it does not install workflow dependencies automatically.

KREA2 Simple uses `Power Lora Loader (rgthree)` from rgthree-comfy with the KREA2 diffusion model, KREA2 CLIP encoder, Qwen Image VAE, and KREA LoRAs installed in their corresponding ComfyUI model folders.

KREA2 RAW uses the supplied two-stage `ClownsharKSampler_Beta` graph with fixed sampler parameters, selectable KREA models and LoRAs, 29 source resolutions, and `1920x1088` as its default resolution.

FLUX2 Simple supports GGUF and Safetensors diffusion models using `UnetLoaderGGUF` or `UNETLoader` automatically. It also uses `Power Lora Loader (rgthree)`, `Flux2Scheduler`, and `EmptyFlux2LatentImage` with a FLUX2 CLIP encoder, FLUX2 VAE, and compatible LoRAs installed in their corresponding ComfyUI model folders. FLUX2 Edit and FLUX2 Photo Fusion additionally use `LoadImage`, `ImageScaleToTotalPixels`, `GetImageSize`, `VAEEncode`, and `ReferenceLatent` to encode the source and each independent reference. Character FLUX2 supports the same GGUF/Safetensors selection with `ReferenceLatent` and two optional LoRAs. Pose references require `AIO_Preprocessor` from ComfyUI ControlNet Aux, while optional acceleration requires `CacheDiT_Model_Optimizer` from ComfyUI-CacheDiT.

Photo Fusion maps the first portrait to Picture 1 and each remaining portrait to a distinct FLUX2 identity reference. An optional background is encoded as a separate background reference. Uploaded ComfyUI input names are made unique so same-named Library items cannot overwrite one another during parallel multi-image uploads.

Qwen Edit Photo Fusion maps each input image to exactly one person and uses the existing three-picture Qwen workflow. It therefore supports a maximum of three total inputs: two or three subject portraits, or two portraits plus one background. The interface blocks unsupported combinations instead of silently omitting an image. Its workflow requires `UNETLoader`, `CLIPLoader`, `VAELoader`, `TextEncodeQwenImageEditPlus`, `ModelSamplingAuraFlow`, `CFGNorm`, `ImageScaleToTotalPixels`, and `KSampler`. Lightning presets additionally require a compatible Qwen Image Edit 4-step or 8-step LoRA in ComfyUI.

The standard Flux workflow automatically enables `Flux\flux-turbo.safetensors` at strength `1`. Qwen T2I always uses 4 steps and CFG `1`, including when Library metadata contains different recommended values.

LTX Director requires the latest WhatDreamsCost LTX Director, ComfyUI-LTXVideo, and ComfyUI-KJNodes packages. LTX 2.5 also uses ComfyUI-GGUF. CacheDiT acceleration requires [ComfyUI-CacheDiT](https://github.com/Jasonzzt/ComfyUI-CacheDiT), which exposes `CacheDiT_LTX2_Optimizer`; restart ComfyUI after installing or updating it so the node appears in `/object_info`.

## Setup

1. Clone the repository and enter it:

	```powershell
	git clone https://github.com/lawiz22/AI-Lawiz-Media-Gen.git
	Set-Location AI-Lawiz-Media-Gen
	```

2. Install the locked dependency tree:

	```powershell
	npm ci
	```

3. Start the Electron development application:

	```powershell
	npm run electron:dev
	```

4. Sign in locally, open **Connection Settings**, and configure the providers you intend to use.

For browser-only development, run `npm run dev` and open `http://localhost:3000`. Browser voice recording uses the native screen or tab picker for computer audio. Electron captures Windows system audio directly. Other Electron-only features include local model scanning, native file selection, secure key persistence, and CivArchive prompt retrieval.

## Configuration

Connection settings are entered inside the application:

| Setting | Typical value | Required for |
| --- | --- | --- |
| ComfyUI URL | `http://127.0.0.1:8188` | Local workflows |
| Ollama URL | `http://127.0.0.1:11434` | Local prompt tools |
| Ollama model | `huihui_ai/qwen3-vl-abliterated:8b` | Default local vision and text model |
| Mammouth API key | Provider-issued key | Mammouth generation and prompt tools |
| Gemini API key | Google AI key | Direct Gemini generation |
| Google OAuth client ID | OAuth web client ID | Drive synchronization |
| Civitai API key | Civitai account key | Authenticated model operations |

In Electron, API keys are persisted through `electron-store`. Do not commit API keys or place secrets directly in source files. For browser development, `GEMINI_API_KEY` can be supplied through a local Vite environment file that remains outside version control.

## Ollama Setup

1. Install and start [Ollama](https://ollama.com/) for Windows.
2. Pull the default local vision model:

	```powershell
	ollama pull huihui_ai/qwen3-vl-abliterated:8b
	```

3. Open **Connection Settings**, keep the default URL `http://127.0.0.1:11434`, and click **Test**. A successful test reports how many installed models are available.
4. Select the default model or another installed model. The Prompt tools refresh their model list from Ollama's `/api/tags` endpoint.

Ollama is available in **Prompt from Image**, **Extract Background**, **Subject / Object**, and **Magical Prompt Soup**. Florence2 remains available only in **Prompt from Image** because its caption tasks cannot reliably isolate a background or subject. Ollama image analysis requests use a larger context window automatically, while Magic Soup asks the selected model to synthesize a new concept instead of concatenating source descriptions.

When using browser-only development, local browser security may block Ollama even when the desktop application works. If that happens, allow the development origin through Ollama's `OLLAMA_ORIGINS` setting and restart Ollama.

<!-- ![Prompt providers and selectable Ollama models](assets/screenshots/02-prompt-providers.png) -->

<!-- ![Creative Ollama Magic Soup generated from three source prompts](assets/screenshots/03-magic-prompt-soup.png) -->

## ComfyUI Setup

1. Start ComfyUI with CORS enabled for the application origin. A typical local command includes:

	```powershell
	python main.py --listen 127.0.0.1 --enable-cors-header "*"
	```

2. Enter the ComfyUI URL in **Connection Settings**. The default expected address is `http://127.0.0.1:8188`.
3. Confirm the connection indicator is active. The application then reads installed checkpoints, LoRAs, UNets, VAEs, text encoders, samplers, schedulers, and custom nodes.
4. Open **Models/LoRAs** to select the ComfyUI root folder, scan local models, and retrieve metadata.

LTX 2.3 and LTX 2.5 use the same CacheDiT controls. New projects enable acceleration with 8 warmup steps, a skip interval of 3, a noise scale of `0.001`, and summary output enabled. These defaults do not overwrite explicit values restored from saved projects.

Large local libraries are indexed from these directories:

```text
ComfyUI/models/checkpoints
ComfyUI/models/diffusion_models
ComfyUI/models/loras
```

FLUX2 and KREA2 diffusion models are indexed directly from `ComfyUI/models/diffusion_models`. Their LoRAs use the dedicated `ComfyUI/models/loras/flux2` and `ComfyUI/models/loras/krea` folders.

In Photo Fusion, choose **FLUX2**, **QWEN-Edit**, or **Mammouth** from the engine control. FLUX2 and Qwen Edit run locally through the configured ComfyUI endpoint and expose their own advanced model and sampling settings. Mammouth sends each subject as a distinct multimodal input and exposes the hosted image-model selector instead.

Model-specific metadata is stored beside the model where applicable. Keep these sidecars with the model when moving files outside the application's organizer.

<!-- ![Character Generator references, controls, and results](assets/screenshots/04-character-generator.png) -->

<!-- ![LTX Director multi-clip timeline](assets/screenshots/05-ltx-director.png) -->

<!-- ![Advanced TTS multi-character dialogue](assets/screenshots/06-advanced-tts.png) -->

<!-- ![Local Models and LoRAs inventory](assets/screenshots/07-model-library.png) -->

<!-- ![Voice Recorder and reusable Library voice reference](assets/screenshots/08-voice-recorder-library.png) -->

## Development

| Command | Description |
| --- | --- |
| `npm ci` | Install exact versions from `package-lock.json` |
| `npm run dev` | Start the Vite server on port 3000 |
| `npm run electron:dev` | Start Vite and Electron together |
| `npm run build` | Create the optimized web bundle |
| `npm run preview` | Preview the optimized web bundle |
| `npm run electron:build` | Build the web bundle and package the Windows app |

Project layout:

```text
components/       React panels and shared UI
electron/         Electron main process and preload bridge
services/         Provider, ComfyUI, library, and media services
store/            Redux Toolkit state slices
utils/            Image, prompt, pose, and album helpers
App.tsx           Main application shell and tool routing
constants.ts      Embedded ComfyUI workflow templates
```

## Production Build

Create the optimized renderer and Windows Electron package:

```powershell
npm ci
npm run electron:build
```

`electron:build` runs `vite build` first and then `electron-builder`. On Windows, it generates the NSIS setup `.exe` in `dist`, alongside the packaged application under `dist/win-unpacked`. Run the setup `.exe` to install the desktop app; ComfyUI, Ollama and their models remain separate installations.

Allow several GB of free space on both the output and Windows temporary-file drives. NSIS's `error creating mmap` can indicate a full disk even when RAM is available. Do not use an installer left by a failed build; a partially written `.exe` may still exist.

Recommended pre-commit checks:

```powershell
npm audit --omit=dev
node --test services/sceneVariationService.test.mjs
npm run build
git diff --check
```

The Scene Variation suite runs directly with Node's test runner and covers prompt generation, SAM3 single-target encoding, mask validation, masked workflows, and sequential generation. There is no `npm test` script. These tests do not run live AI models; production validation also requires the Vite build and a smoke test of the packaged Electron application and configured provider connections.

## Technology

- [React 19](https://react.dev/) and [Redux Toolkit](https://redux-toolkit.js.org/)
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/)
- [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/)
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) API and WebSocket execution tracking
- [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide), IndexedDB, and optional Google Drive integration
- Mammouth AI, Ollama, Google Gemini, Civitai, and CivArchive integrations

## Repository

- Source: [github.com/lawiz22/AI-Lawiz-Media-Gen](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
- Current application version: `1.88.0`
- Default development port: `3000`
- Default ComfyUI endpoint: `http://127.0.0.1:8188`
- Default Ollama endpoint: `http://127.0.0.1:11434`
- Default Ollama model: `huihui_ai/qwen3-vl-abliterated:8b`

No license file is currently included. Unless a license is added, reuse and redistribution rights are not granted by this repository.