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
- Store safety classifications, previews, trigger words, and recommended generation settings.
- Load Civitai or CivArchive prompt examples directly into the Image Generator.
- `USE` selects the matching workflow family, compatible base model, LoRA, and trigger words.
- **Civitai Blue and Red** include **Qwen 2.1**, **MOSS** (MOSS Image and MOSS Image Base), and **MiniMax H3** family filters. Searches use the catalogue's base-model filters rather than requiring the family name in each model title.
- **CivArchive** exposes the corresponding **Qwen 2.1**, **MOSS Image**, **MOSS Image Base**, and **MiniMax H3** filters.
- Downloads, local categories, scans and manual organization recognize `qwen21`, `moss`, and `H3` subfolders under the selected ComfyUI model directory. Qwen 2.1 scans also inspect the existing `QWEN` folder for older installations.
- `USE` sends Qwen 2.1 and MOSS models/LoRAs to their matching image workflows, preserving existing settings and active LoRAs. If every LoRA slot is enabled, it asks you to free a slot rather than silently replacing an active LoRA. MiniMax H3 models must be selected in **Video > Minimax REF2v H3**; they are never applied to an SD image workflow.
- After **USE**, MOSS and Qwen 2.1 (normal/Turbo) retain the model's Civitai/CivArchive prompt-example source. **Find prompt examples** appears above their settings; active LoRAs with saved examples also expose **Local prompts**. **Use prompt** applies positive/negative text and trigger words to the active workflow without replacing model, LoRA or sampling settings.

Fully quit and restart Electron after updating from source to activate the new native download, scan and organization categories. Vite can refresh the menus without reloading the Electron main process: if **Library Tools > Scan selection** reports **Unknown model scan family**, refreshing the page alone is not enough. The error now includes the restart instruction. Catalogue availability still depends on each remote service; adding a filter does not guarantee matching results.

Regression checks: `node --test services/civitaiService.test.mjs`.

## Folder layout and workflow dependencies

Configure your ComfyUI root and server in [Connections](../connections.md#comfyui). Keep model sidecars when moving files outside the organizer.

Use the [workflow dependency reference](../reference/comfyui-workflows.md) and the [complete required-node list](../../COMFYUI_REQUIRED_NODES.txt) when preparing a new workflow.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Local Models and LoRAs inventory](../screenshots/07-model-library.png) -->

---

[Back to documentation index](../README.md)
