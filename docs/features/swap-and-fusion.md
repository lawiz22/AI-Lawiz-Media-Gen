# Swap a Person and Photo Fusion

[Documentation index](../README.md) | [Project overview](../../README.md)

Keep the SAM3 swap, LanPaint head swap and multi-person fusion workflows distinct when choosing settings and dependencies.

## On this page

- [Swap a Person](#swap-a-person)
- [LanPaint head swap](#lanpaint-head-swap)
- [Photo Fusion](#photo-fusion)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Swap a Person

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

## LanPaint head swap

- Select **LanPaint (Head Swap)** to use the supplied, user-tested reference workflow alongside the original SAM3 mode. It uses the complete destination and donor images, two FLUX2 reference latents and **LanPaint_KSampler**, without SAM detection, donor cutouts or a final masked composite. The SAM target/preset controls are hidden in this mode because they do not affect this graph.
- Defaults reproduce the supplied JSON: `flux2\moodyDesireMixFlux2_v30_pruned_fp8.safetensors`, `qwen38BFluxKlein9BTE_38b.safetensors`, `flux2-vae.safetensors`, and model-only LoRA `FLUX2\bfs_head_v1_flux-klein_9b_step3500_rank128.safetensors` at strength 1. Sampling uses **4 steps, CFG 1, Euler, simple, denoise 1**, Flux guidance **4**, LanPaint **2 steps**, **Image First** and **Image Inpainting**. The original seed **782879205881587** is retained; enter `-1` for a random seed.
- **Reference resolution** defaults to **2 MP** for both images. ComfyUI resizes them with **Lanczos before VAE encoding**, reducing large destination photos before processing. The generation target and empty latent use the resized destination's VAE-aligned dimensions, never the full-resolution original. Lower the resolution to 1 MP if needed. As in the supplied workflow, this is a target resolution, so small images may be enlarged. The original uploaded files are not overwritten, and results are not resized back to their original dimensions.
- The editable **LanPaint prompt** is copied verbatim from the reference, including the `head_swap:` trigger, destination proportions, lighting, pose/expression and neck/jaw integration instructions. With **Preserve destination style** off, it also retains the reference's photorealistic/sharp/4K wording; that wording does not set the output dimensions or guarantee VHS fidelity. The SAM3 mode's optional style/proportions additions are not appended to this prompt.
- **Preserve destination style** is a separate LanPaint checkbox, off by default. When enabled, the sent prompt replaces the reference's `Photorealistic, high quality, sharp details, 4K.` sentence with instructions to match Picture 1's visual medium, softness, grain, noise, colors, compression and blur, including chroma bleed and interlacing when VHS artifacts are actually present. It avoids importing the donor's finish or inventing absent artifacts, and prioritizes destination style over conflicting finish instructions. The editable prompt is not overwritten; unchecking restores its exact unmodified use. Models, LoRA, resolution and sampling are unchanged. The Library stores the effective prompt and the checkbox state from the successful generation. **Restore LanPaint workflow** resets the checkbox to off. This is generation guidance, not a guaranteed style lock; judge it on a new result.
- **CacheDiT** starts enabled with model type Flux, warmup 0, skip interval 0 and summary enabled, matching the reference. **FLUX2 settings** exposes models, LoRA, sampler, scheduler, guidance, denoise, LanPaint steps/prompt mode, seed and the CacheDiT toggle. **Restore LanPaint workflow** restores the supplied settings and prompt without clearing images or touching the SAM3 settings.
- Install [LanPaint](https://github.com/scraed/LanPaint) in ComfyUI, restart and reconnect. The default graph also needs **ComfyUI-CacheDiT**, the named model/encoder/VAE/LoRA and current core FLUX2 nodes. Disable CacheDiT only to intentionally omit it. Nodes and selected model/sampler options are checked before uploads; this panel does not install packages or download weights automatically.
- Library saves include the actual prompt, resolved seed, source snapshot and full `lanPaintPersonSettings`, with a `lanpaint` tag. Editing settings or changing modes afterward does not change the saved result's metadata. Donor images are not saved for replay. The user confirmed that the integrated baseline LanPaint mode works; the new optional style guidance has automated prompt/UI coverage but still needs visual evaluation on each image pair.

## Photo Fusion

- Choose between local ComfyUI FLUX2, local Qwen Edit, and Mammouth AI; FLUX2 is selected by default.
- Fuse two to four subject portraits with FLUX2 or Mammouth. Qwen Edit accepts two or three subjects without a background, or exactly two subjects plus one background image.
- Preserve each uploaded person as a distinct identity with explicit facial-feature and exact-subject-count instructions.
- Optionally identify any subject as a notable person, such as Elvis Presley or Marilyn Monroe, to reinforce that recognizable identity in FLUX2, Qwen Edit, and Mammouth prompts.
- Add an optional background reference while retaining personas, scenarios, poses, quality controls, and one to four output images.
- Configure the FLUX2 model, CLIP, VAE, megapixels, sampler, steps, CFG, seed behavior, and optional CacheDiT acceleration.
- Qwen Photo Fusion uses concise model-specific prompts to preserve every identity, prevent missing or duplicated people, and apply the selected scene without overloading the edit model.
- Configure the Qwen Edit model, CLIP encoder, VAE, source megapixels, AuraFlow shift, sampler, scheduler, steps, CFG, and optional LoRA. The synchronized Lightning presets select the matching installed LoRA and switch sampling to 4 or 8 steps.
- Retry individual results, inspect debug information, download all outputs as a ZIP, or save selected results to the Library.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![FLUX2 Photo Fusion with multiple identities and advanced controls](../screenshots/09-photo-fusion.png) -->

<!-- ![Swap a Person destination, donor and generated result](../screenshots/15-swap-person.png) -->

## Related guides

- [Image and character generation](images-and-characters.md)
- [Photo Fusion dependency reference](../reference/comfyui-workflows.md#photo-fusion-flux2)
- [Library and backups](library.md)

---

[Back to documentation index](../README.md)
