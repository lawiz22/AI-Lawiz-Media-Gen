# Screenshots and gallery

[Documentation index](../README.md) | [Project overview](../../README.md)

This is the shared image directory for all guides. Linked filenames below are available screenshots; unlinked filenames are planned capture slots. Files are not required until their Markdown image is activated.

## On this page

- [Capture checklist](#capture-checklist)
- [Capture index](#capture-index)
- [Add a screenshot](#add-a-screenshot)
- [Keep captures current](#keep-captures-current)

## Capture checklist

- Capture the relevant panel at 1600 x 900 or wider when possible.
- Use a consistent application theme and readable text; crop unnecessary desktop/window borders.
- Hide API keys, tokens, email addresses, personal file paths and other private information.
- Use shareable, non-sensitive reference images and generated results.
- Prefer optimized PNG for UI captures; WebP is welcome if you also update the embedding filename.
- Keep each image reasonably small, preferably under 1 MB, without making UI text unreadable.

## Capture index

| Filename | Capture | Owning guide |
| --- | --- | --- |
| `01-image-generator.png` | Image Generator: provider, workflow controls and result | [Open guide](../features/images-and-characters.md) |
| `02-prompt-providers.png` | Prompt provider and selectable model controls | [Open guide](../connections.md) |
| `03-magic-prompt-soup.png` | Multiple colored Soup ingredients and generated concept | [Open guide](../connections.md) |
| `04-character-generator.png` | Character references, output controls and results | [Open guide](../features/images-and-characters.md) |
| `05-ltx-director.png` | Multi-clip LTX timeline with photos, prompts and audio | [Open guide](../features/ltx-and-audio.md) |
| `06-advanced-tts.png` | Named voices, character photos and dialogue controls | [Open guide](../features/ltx-and-audio.md) |
| `07-model-library.png` | Model inventory, metadata, previews and filters | [Open guide](../features/models-and-loras.md) |
| `08-voice-recorder-library.png` | Voice Recorder and reusable Library voice reference | [Open guide](../features/creative-tools.md) |
| `09-photo-fusion.png` | Multiple identities, advanced controls and fused result | [Open guide](../features/swap-and-fusion.md) |
| `10-video-prompt-generator.png` | References, media editing and production prompt | [Open guide](../features/video-prompt-generator.md) |
| `11-minimax-h3.png` | REF2V parameters, preview and final output | [Open guide](../features/minimax-h3.md) |
| `12-library.png` | Library filters and saved H3 video details | [Open guide](../features/library.md) |
| `13-system-indicators.png` | Desktop CPU, RAM, GPU, VRAM and temperature gauges | [Open guide](../connections.md) |
| `14-scene-variation.png` | Reviewed scene analysis and person mask previews | [Open guide](../features/scene-variation.md) |
| `15-swap-person.png` | Destination, donor, selected workflow and result | [Open guide](../features/swap-and-fusion.md) |
| [`16-installation-overview.png`](16-installation-overview.png) | What's installed: backend connections including OpenRouter, feature/node readiness and ComfyUI installation details | [Open guide](../connections.md#installation-overview) |
| [`17-comfyui-nodes.png`](17-comfyui-nodes.png) | What's installed: ComfyUI node packs, individual availability checks, search and Problems only filter | [Open guide](../connections.md#comfyui-node-checks) |
| [`18-comfyui-model-inventory.png`](18-comfyui-model-inventory.png) | What's installed: ComfyUI model filenames and category counts for checkpoints, diffusion/UNET models, encoders, VAEs and LoRAs | [Open guide](../connections.md#comfyui-model-inventory) |

## Add a screenshot

1. Copy the image into this directory using the planned filename above.
2. Open its owning guide and find the matching commented image tag in **Screenshots**.
3. Remove only the surrounding `<!--` and `-->` to display the image.
4. Keep useful alt text describing what the capture demonstrates.
5. Preview the Markdown and confirm the relative path works on GitHub.

For an unplanned capture, add a new index row and place its image in the relevant guide section. Once an image is available, link its filename in this index.

For example, from a feature guide:

```markdown
![MiniMax H3 REF2V settings and completed output](../screenshots/11-minimax-h3.png)
```

The example path is relative to a file in `docs/features`, not to this gallery page. It remains a code example until the image is added.

## Keep captures current

- Replace a capture under its existing filename when its UI changes, so guide links remain stable.
- For a new subject, add one index row and an image tag in its owning guide; do not scatter duplicate copies across folders.
- If renaming a file or switching PNG/WebP, update both the index and every image tag that references it.
- Add an actual image to the project README only when it provides a useful overview; keep detailed screenshots in the guides.
- This folder is tracked normally; no new Git ignore rules are needed.
