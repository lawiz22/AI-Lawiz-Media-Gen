# Local Models and LoRAs

[Documentation index](../README.md) | [Project overview](../../README.md)

Manage models installed on your own ComfyUI server. Scanning and selecting a model do not install workflow dependencies automatically.

## On this page

- [Inventory and metadata](#inventory-and-metadata)
- [Folder layout and workflow dependencies](#folder-layout-and-workflow-dependencies)
- [Screenshots](#screenshots)

## Inventory and metadata

- Scan the local ComfyUI model tree without uploading model files.
- Identify installed checkpoints and LoRAs through Civitai metadata or SHA-256 matching.
- Use CivArchive as a fallback for models deleted from Civitai.
- Detect updates, download models, organize files by model family, and retain sidecar metadata.
- After a Civitai or CivArchive download, only the downloaded file is indexed (including its hash and available metadata). No folder-wide scan is triggered. My Library opens and focuses that file before optional metadata enrichment, so you can refine it immediately. Other entries are retained, and automatic usage recommendations preserve existing values. Full scans remain explicit actions in Library Tools. Fully restart Electron after updating to load the single-file indexing bridge.
- Store safety classifications, previews, trigger words, and recommended generation settings.
- **My Library** family, type, status, safety and text filters also apply to a card opened through a shortcut. Refreshing inventory metadata no longer resets the selected family to **All**. FLUX2 filtering respects explicit categories and exact folder boundaries, without treating an SDXL filename containing “flux2” as a FLUX2 LoRA.
- The **Gestionnaire de styles** shares the existing inventory without rescanning model files; when it is empty, Electron uses its existing fast inventory initialization. Select an indexed LoRA while creating a style, link matching existing styles, display its preview and open its exact card with **Open in My Library**. Unique matches can supply missing triggers, steps, CFG and sampler settings automatically; manual style values remain authoritative. See [Style Gallery integration](images-and-characters.md#blazing-fast-character-and-style-gallery).
- **KREA2** is available as a separate style category, linked to compatible My Library LoRAs and installed `KREA`/`KREA2` paths. Its thumbnail style picker is integrated only in **SIMPLE KREA** for now; FLUX2 styles are not mixed with KREA2 styles. Manual family classifications are respected, and the same fill-only-missing recommendations, preview images and exact-card navigation apply.
- **FLUX2-9B** and **FLUX2-4B** have distinct library filters, manual categories, download folders and scoped scans. The explicitly labelled **FLUX2 (all variants)** filter remains available for broad searches. Manual categories take priority; base-model metadata and explicit 4B/9B names distinguish variants. Existing LoRAs in the legacy `FLUX2` folder default to 9B unless identified as 4B, as requested; files are not moved automatically. Unknown base models are not assumed to be Klein 9B. Scoped scans inspect legacy folders too, skip incompatible variants and preserve the other variant's inventory entries. Civitai searches use the corresponding Klein base-model filters; CivArchive downloads retain the selected variant. `USE` will not substitute an arbitrary FLUX2 base model for a 9B/4B LoRA.
- Load Civitai or CivArchive prompt examples directly into the Image Generator.
- `USE` selects the matching workflow family, compatible base model, LoRA, and trigger words.
- For **FLUX2-4B / FLUX2-9B**, `USE` first offers **Use in t2i** or **Use in i2i**. The selected destination's generation settings, prompt, style/strength/overrides and additional LoRAs reset before applying the chosen model or LoRA, its matching base model/CLIP/VAE, trigger words and available steps/CFG/sampler recommendations. Without recommendations, t2i uses 10 steps and i2i uses 4 steps, both with Euler and CFG 1. The source image, reference images, roles and descriptions are retained; the other mode's style is not reset. Cancel/Close applies nothing, and a missing compatible base model blocks the transfer before changing settings. Other model families retain their existing USE behavior.
- `USE` reads the current model catalog and generator settings from the same Redux Provider as the interface, including after hot reloads. A reloaded module cannot substitute an empty store and incorrectly report that an installed FLUX2 base model is missing; 9B/4B compatibility checks remain enforced.
- **Civitai Blue and Red** include **Qwen 2.1**, **MOSS** (MOSS Image and MOSS Image Base), and **MiniMax H3** family filters. Searches use the catalogue's base-model filters rather than requiring the family name in each model title.
- **CivArchive** exposes the corresponding **Qwen 2.1**, **MOSS Image**, **MOSS Image Base**, and **MiniMax H3** filters.
- Downloads, local categories, scans and manual organization recognize `qwen21`, `moss`, and `H3` subfolders under the selected ComfyUI model directory. Qwen 2.1 scans also inspect the existing `QWEN` folder for older installations.
- `USE` sends Qwen 2.1 and MOSS models/LoRAs to their matching image workflows, preserving existing settings and active LoRAs. If every LoRA slot is enabled, it asks you to free a slot rather than silently replacing an active LoRA. MiniMax H3 models must be selected in **Video > H3 > Minimax REF2v H3**; they are never applied to an SD image workflow.
- After **USE**, MOSS and Qwen 2.1 (normal/Turbo) retain the model's Civitai/CivArchive prompt-example source. **Find prompt examples** appears above their settings; active LoRAs with saved examples also expose **Local prompts**. **Use prompt** applies positive/negative text and trigger words to the active workflow without replacing model, LoRA or sampling settings.

Fully quit and restart Electron after updating from source to activate the new native download, scan and organization categories. Vite can refresh the menus without reloading the Electron main process: if **Library Tools > Scan selection** reports **Unknown model scan family**, refreshing the page alone is not enough. The error now includes the restart instruction. Catalogue availability still depends on each remote service; adding a filter does not guarantee matching results.

Regression checks: `node --test services/civitaiService.test.mjs services/styleLibrary.test.mjs services/flux2Style.test.mjs components/BlazingFastCharacterPanel.test.mjs`.

## Folder layout and workflow dependencies

Configure your ComfyUI root and server in [Connections](../connections.md#comfyui). Keep model sidecars when moving files outside the organizer.

Use the [workflow dependency reference](../reference/comfyui-workflows.md) and the [complete required-node list](../../COMFYUI_REQUIRED_NODES.txt) when preparing a new workflow.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Local Models and LoRAs inventory](../screenshots/07-model-library.png) -->

---

[Back to documentation index](../README.md)
