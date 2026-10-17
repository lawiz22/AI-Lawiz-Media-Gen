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

## Folder layout and workflow dependencies

Configure your ComfyUI root and server in [Connections](../connections.md#comfyui). Keep model sidecars when moving files outside the organizer.

Use the [workflow dependency reference](../reference/comfyui-workflows.md) and the [complete required-node list](../../COMFYUI_REQUIRED_NODES.txt) when preparing a new workflow.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Local Models and LoRAs inventory](../screenshots/07-model-library.png) -->

---

[Back to documentation index](../README.md)
