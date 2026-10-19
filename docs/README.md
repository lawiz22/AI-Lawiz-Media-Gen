# Documentation

[Project overview](../README.md)

The README is the short introduction. This index is the entry point for setup, workflow guides, technical references and screenshots. The guides retain the detailed behavior, model defaults, limits and validation notes from the former long README.

## Start here

1. [Getting started](getting-started.md): requirements, Windows installation and source setup.
2. [Connections and local services](connections.md): provider keys, OpenRouter, Ollama, ComfyUI and system indicators.
3. Choose a workflow guide below, then review [Library and backups](features/library.md) to keep your work safe.

## Feature index

| Area | Guide | Covers |
| --- | --- | --- |
| Images and characters | [Image and character generation](features/images-and-characters.md) | Model families, Qwen 2.1 T2I/edit modes, character sheets and Outpaint |
| Scene editing | [Scene Variation](features/scene-variation.md) | Global/Masked modes, SAM3 masks and Character in a Scene |
| Identity editing | [Swap a Person and Photo Fusion](features/swap-and-fusion.md) | SAM3 swaps, LanPaint head swaps and multi-person fusion |
| Prompt analysis and utilities | [Creative tools](features/creative-tools.md) | Prompt/Soup tools, PastForward, styles, Reference Maker, Video Extractor, recording and upscaling |
| Local inventory | [Models and LoRAs](features/models-and-loras.md) | Scanning, metadata, organization and workflow selection |
| Video prompts | [Video Prompt Generator](features/video-prompt-generator.md) | Media editing, providers, templates, H3 transfer and prompt snapshots |
| H3 rendering | [MiniMax H3 REF2V](features/minimax-h3.md) | References, LoRAs, timing, previews, cancellation and rendered-result saving |
| H3 character swap | [Character Swap H3](features/character-swap-h3.md) | Native BFS Shot Planner, memory history, live progress, persistent shots, resume, partial assembly, comparison, Library imports/saves and user-confirmed multi-shot rendering |
| Timelines and speech | [LTX Director and audio](features/ltx-and-audio.md) | LTX profiles, clips, soundtracks, TTS and voice reuse |
| Saved assets | [Library and backups](features/library.md) | Search, tags, ratings, archives, Folder projects, Drive and video persistence |

## Quick task index

- **Generate a video prompt:** [references and media editing](features/video-prompt-generator.md#references-and-media-editing), then [providers and templates](features/video-prompt-generator.md#providers-and-editable-templates).
- **Render in H3:** [workflow settings](features/minimax-h3.md#workflow-settings-and-six-loras), [reference limits](features/minimax-h3.md#reference-limits-and-token-mapping), then [save the result](features/minimax-h3.md#save-rendered-output-to-library).
- **Restore a saved prompt:** [Library snapshots and restoration](features/video-prompt-generator.md#library-snapshots-and-restoration).
- **Back up your work:** [portable archives](features/library.md#portable-archives) or [Library Folder projects](features/library.md#library-folder-projects).
- **Prepare ComfyUI:** [connection setup](connections.md#comfyui), [workflow dependencies](reference/comfyui-workflows.md) and the [complete node list](../COMFYUI_REQUIRED_NODES.txt).
- **Build the Windows setup:** [production build](development.md#production-build).
- **Add screenshots:** [capture index and instructions](screenshots/README.md).

## Technical reference and development

- [ComfyUI workflow dependencies](reference/comfyui-workflows.md): KREA2, FLUX2, Photo Fusion, legacy workflows and LTX packages.
- [Complete required-node list](../COMFYUI_REQUIRED_NODES.txt): node names, model-family requirements and install notes.
- [Development and Windows packaging](development.md): commands, source layout, installer creation, validation, stack and licensing.
- [Screenshots and gallery](screenshots/README.md): planned filenames, capture checklist and image activation.

## Documentation layout

```text
README.md                         Short project introduction
COMFYUI_REQUIRED_NODES.txt         Detailed node inventory
docs/
  README.md                       Central index and maintenance conventions
  getting-started.md               Installation and first session
  connections.md                  Providers and local services
  development.md                  Contributor and Windows build guide
  features/                       One guide per feature area
  reference/comfyui-workflows.md   Model-family dependency reference
  screenshots/README.md           Screenshot index and contribution guide
  screenshots/*.png               Captures added as they become available
```

## Keeping documentation easy to update

1. Put detailed behavior, limits and defaults in the **owning feature guide**, not in the project README.
2. Keep setup in **Getting started**, connection settings in **Connections**, packaging/tests in **Development**, and the exact node inventory in the required-node list.
3. Add a new guide to the feature/reference index and cross-link related workflows. Keep filenames stable; update links and the local **On this page** list whenever headings change.
4. Add screenshots to the shared capture directory using its checklist. Leave image tags commented until the file exists.
5. Distinguish executable workflows from preparation slots, tested behavior from unverified GPU quality, and prompt snapshots from rendered-output metadata.
6. Keep secrets and personal information out of prose, workflow examples and screenshots.
7. Check relative links/anchors and Markdown preview before committing. Documentation-only changes do not require rebuilding the Windows installer.

The documentation follows the existing English README and the application's English control labels. User-facing instructions should use the exact labels visible in the application.
