# LAWIZ'S Media Generator

<div align="center">

**A Windows creative workstation for cloud AI, Ollama, and local ComfyUI production.**

[![Version](https://img.shields.io/badge/version-1.88.0-0ea5e9?style=for-the-badge)](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Windows](https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[Features](#features) | [Quick start](#quick-start) | [Documentation](docs/README.md) | [Screenshots](docs/screenshots/README.md) | [Windows build](docs/development.md#production-build) | [Acknowledgements](#acknowledgements)

</div>

LAWIZ'S Media Generator combines image generation, character creation, video direction, speech synthesis, asset extraction, upscaling, and model management in one React/Electron desktop application. It connects to hosted providers including Mammouth AI, Gemini and OpenRouter, local language and vision models through Ollama, and configurable workflows on a local ComfyUI server.

> This repository contains the application and workflow definitions. AI checkpoints, LoRAs, ComfyUI, custom nodes, and third-party API access are not bundled.

> **Licensing status:** original Lawiz contributions are GPLv3. Permission for portions derived from zGenMedia's projects is still pending; this is not clearance to redistribute the complete application. See [licensing scope and pending permissions](LICENSING.md).

## Features

| Workspace | What you can do | Guide |
| --- | --- | --- |
| Images and characters | Generate/refine with MOSS, use KREA2 Edit/Identity, Qwen 2.1 and Outpaint, and compare multi-angle characters | [Images and characters](docs/features/images-and-characters.md) |
| Scene and identity editing | Vary scenes, edit selected people, swap identities and fuse portraits | [Scene Variation](docs/features/scene-variation.md) / [Swap and Fusion](docs/features/swap-and-fusion.md) |
| Video | Write multimodal prompts, render MiniMax H3 REF2V and multi-shot character swaps, and direct LTX timelines | [Video prompts](docs/features/video-prompt-generator.md) / [H3](docs/features/minimax-h3.md) / [Character Swap](docs/features/character-swap-h3.md) / [LTX](docs/features/ltx-and-audio.md) |
| Creative tools | Generate prompts from images, create Magic Soup, transform styles, crop references, extract/merge video clips and record audio | [Creative tools](docs/features/creative-tools.md) / [Image-to-prompt](docs/features/images-and-characters.md#generating-a-prompt-from-an-image) |
| Models and LoRAs | Scan local models, retrieve metadata and organize your ComfyUI inventory | [Models and LoRAs](docs/features/models-and-loras.md) |
| Library | Save media and exact generation settings, import saved image prompts without changing settings, search/tag/rate assets and back up projects | [Library and backups](docs/features/library.md) / [Prompt import](docs/features/images-and-characters.md#importing-library-prompts) |
| Installation diagnostics | Check backend connections, feature readiness, required nodes and the connected ComfyUI model inventory | [What's installed](docs/connections.md#installation-overview) |

## What's new in 1.88

### Latest image and workflow additions

- **[MOSS Image 1.0](docs/reference/comfyui-workflows.md#moss-image-10)**: local text-to-image generation with portrait, landscape and square presets up to 1280 px per side. **Refine Image (Image-to-Image)** accepts an upload or Library source, preserves its proportions and exposes a separate refinement denoise control.
- **[Generate Prompt from Image](docs/features/images-and-characters.md#generating-a-prompt-from-an-image)** in MOSS refinement: analyze the source with OpenRouter, Gemini, Mammouth or a local Ollama vision model. Choose SD 1.5, SDXL, Z-Image, Qwen 2.1 or MOSS prompt formatting, then edit, copy or explicitly apply the result without replacing other generation settings.
- **[KREA2 I2I Edit / Identity](docs/features/images-and-characters.md#krea2-identity-and-general-edit)**: General Edit and Identity V2 workflows with one or two references, an editable example-driven prompt builder, independent reference placement/boost controls, optional LoRAs and Turbo/Raw presets. Requires ComfyUI-Krea2Edit v2.0.0+ and compatible weights.
- **[Import Library Prompt](docs/features/images-and-characters.md#importing-library-prompts)**: search saved image prompts and preview their associated images in Image Generation. Import only the active positive prompt or cloud edit instruction, keeping models, LoRAs, seeds and sampling settings unchanged.
- **[Shared Character controls](docs/features/images-and-characters.md#shared-character-controls)**: eight independently enabled camera/pose/expression slots across Gemini, Mammouth and ComfyUI multi-angle workflows, with clothing/background/pose references and progressive results. [Compare saved-in-session result sets](docs/features/images-and-characters.md#comparing-character-results) by provider, workflow and model without generating again; ComfyUI generation can be cancelled while retaining completed outputs.
- **Expanded Qwen 2.1 editing**: [multi-image composition](docs/features/images-and-characters.md#qwen-21-multi-image-edit) with up to four role-based references and explicit analysis, [Consistency/Turbo single-image editing](docs/features/images-and-characters.md#qwen-21-single-image-edit) with extra LoRA slots, and [background removal](docs/features/images-and-characters.md#qwen-21-remove-background) with alpha-preserving PNG download and Library saving.
- **[What's installed](docs/connections.md#installation-overview)**: inspect service connectivity and feature readiness, search required ComfyUI nodes by name or pack, filter problems and browse the server's model inventory. Inventory presence is not a guarantee of workflow compatibility.
- **[Header memory controls](docs/connections.md#header-memory-controls)**, visible only when ComfyUI is connected: **Clear VRAM / unload models** or **Free model + node cache**, using native server commands without deleting files or interrupting a running render.

### Video and Library highlights

- A unified **Video** workspace with **Video Prompt Generator**, **LTX Director**, **Minimax H3** and an independent **[Character Swap H3](docs/features/character-swap-h3.md)** using the native BFS Shot Planner, persistent sequential shots and before/after comparison. Its optional second pass starts disabled.
- **Character Swap H3 progress and Library integration**: live operation/sampling-step percentages, saved-shot counts, source-video and global/per-shot reference imports, and local saving of result/comparison videos. Monitoring reconnects when returning from another workspace without submitting the render again.
- **User-confirmed GPU rendering on an RTX 3070 8 GB**: a successful single-shot test followed by a **15-second clip split into 4 shots**, reported successful on October 19, 2026. This validates those runs, not every model/resolution or a general guarantee against OOM; see [validation details](docs/features/character-swap-h3.md#validation).
- Editable multimodal prompt templates, image/video crop and resize, colored references and automatic prompt snapshots in the Library.
- Connected **H3 REF2V**, six optional LoRAs, optional live previews and local Library saving of rendered videos with their actual settings. Choose reference-generated audio or lock an original WAV soundtrack with a local final mux. Trim passages before prompt generation or rendering, edit/manually transcribe lyrics and refresh the prompt for each passage.
- Expanded Library organization/backups, multi-ingredient Magic Soup and configurable local model workflows.

See the [documentation index](docs/README.md) for supported modes, limits, dependencies and detailed behavior. Additional H3 workflows are preparation slots, not executable graphs yet.

## Quick start

**Windows setup:** run an available setup `.exe`, then configure only the providers you want in **Connection Settings**. ComfyUI, Ollama and their models remain separate installations.

**From source** (Windows, Node.js 20+ and npm):

```powershell
git clone https://github.com/lawiz22/AI-Lawiz-Media-Gen.git
Set-Location AI-Lawiz-Media-Gen
npm ci
npm run electron:dev
```

For browser-only development, use `npm run dev` at `http://localhost:3000`; some features require Electron. Follow [Getting started](docs/getting-started.md) and [Connections](docs/connections.md) for provider keys, local servers and prerequisites.

## Documentation

- **[Complete documentation index](docs/README.md)** - feature guides, quick tasks and technical references.
- **[Installation and requirements](docs/getting-started.md)** - desktop setup, source setup and first session.
- **[Provider and local-service connections](docs/connections.md)** - OpenRouter, Gemini, Mammouth, Ollama and ComfyUI.
- **[Development and Windows packaging](docs/development.md)** - commands, validation and setup generation in `dist`.
- **[ComfyUI workflow dependencies](docs/reference/comfyui-workflows.md)** and **[required-node inventory](COMFYUI_REQUIRED_NODES.txt)**.
- **[Screenshots and capture guide](docs/screenshots/README.md)** - a shared directory, planned filenames and ready-to-enable image slots.

Detailed settings belong in the guides so this README can stay short. Screenshots can be added progressively without displaying broken images.

## Acknowledgements

This application would not be possible without **[comfyanonymous](https://github.com/comfyanonymous), [Comfy Org](https://github.com/Comfy-Org) and the [ComfyUI](https://github.com/Comfy-Org/ComfyUI) contributors**, along with the custom-node creators who make these workflows possible. Thank you for sharing your tools, research and time with the community.

A special thank-you to **[NRDX (`alisson-anjos`)](https://github.com/alisson-anjos)**, creator of **[ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes)**, and its contributors. Character Swap H3 uses their **native BFS Shot Planner**, including its shot timeline, sequential shot loop, persistent cache and GPU-memory history. The planner is their work, loaded from the user's ComfyUI installation rather than bundled with this app; Lawiz adds the application integration, render monitoring and Library connections.

The following authors, maintainers and teams also deserve credit for the node packs used across Lawiz's workflows. Names, public handles and project links were checked against upstream GitHub repositories, package metadata and explicit project credits on October 19, 2026.

| Author / maintainer / team | Project | Used for |
| --- | --- | --- |
| [HearmemanAI (`Hearmeman24`)](https://github.com/Hearmeman24) | [MiniMax References Manager](https://github.com/Hearmeman24/ComfyUI-MiniMaxRefPack) | H3 REF2V reference management and prompt-writing integration |
| [kijai](https://github.com/kijai) | [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes), [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2) | Video previews, image/mask utilities, VAE helpers and Florence2 captioning |
| [rgthree](https://github.com/rgthree) | [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) | Power LoRA loading and workflow display/output utilities |
| [Kosinkadink](https://github.com/Kosinkadink) | [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | Video encoding and output assembly |
| [Jonathan Watkins (`WhatDreamsCost`)](https://github.com/WhatDreamsCost) | [WhatDreamsCost-ComfyUI](https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI) | LTX Director timeline and guide nodes |
| [Lightricks](https://github.com/Lightricks) | [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) | LTX video support required by the Director workflows |
| [city96](https://github.com/city96) | [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) | Quantized model and text-encoder loading |
| [John Pollock (`pollockjj`)](https://github.com/pollockjj) | [ComfyUI-MultiGPU](https://github.com/pollockjj/ComfyUI-MultiGPU) | Device-aware model/text-encoder loading and offloading |
| [Nunchaku team](https://github.com/nunchux-ai) | [ComfyUI-nunchaku](https://github.com/nunchux-ai/ComfyUI-nunchaku) | Nunchaku FLUX and Kontext workflows |
| [NumZ](https://github.com/numz) and [Adrien Toupet / AInVFX](https://github.com/adrientoupet) | [ComfyUI-SeedVR2_VideoUpscaler](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler) | SeedVR2 image/video upscaling; the underlying SeedVR2 research is by the ByteDance Seed team |
| [Pixaroma](https://github.com/pixaroma) | [ComfyUI-Pixaroma](https://github.com/pixaroma/ComfyUI-Pixaroma) | Qwen 2.1 image editing, outpainting, references and comparison utilities |
| [lbouaraba](https://github.com/lbouaraba) (publisher: ConradLocke) | [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit) | KREA2 General Edit and Identity conditioning |
| [LucianoCirino](https://github.com/LucianoCirino) (original author), [jags111](https://github.com/jags111) (maintained fork) | [Efficiency Nodes](https://github.com/jags111/efficiency-nodes-comfyui), [original project](https://github.com/LucianoCirino/efficiency-nodes-comfyui) | Efficient sampling used by the MOSS workflow |
| [scraed](https://github.com/scraed) and the LanPaint authors Candi Zheng, Yuan Lan and Yang Wang | [LanPaint](https://github.com/scraed/LanPaint) | Training-free inpainting used by the LanPaint head-swap mode |
| [Ziteng Zhang (`Jasonzzt`)](https://github.com/Jasonzzt) | [ComfyUI-CacheDiT](https://github.com/Jasonzzt/ComfyUI-CacheDiT) | Optional model acceleration and LTX optimization |
| [AI Lab (`1038lab`)](https://github.com/1038lab) | [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG) | Reference-image background removal |
| [LBH-123-AI](https://github.com/LBH-123-AI) (original nodes/network/checkpoints), [xmarre](https://github.com/xmarre) (Plus fork) | [MiniMax H3 Latent Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler), [Upscaler-Plus](https://github.com/xmarre/Comfyui_Minimax_h3_latent_Upscaler-Plus) | H3 latent-upscaling tooling for optional second-pass workflows |
| [bbaudio-2025](https://github.com/bbaudio-2025) | [Comfyui-MMH3-UltimateUpscale](https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale) | Optional H3 second-pass upscaling on VRAM-limited GPUs |
| [Dr.Lt.Data (`ltdrdata`)](https://github.com/ltdrdata) | [ComfyUI Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack), [Impact Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack) | Face detailing and detector integration |
| [yolain](https://github.com/yolain) | [ComfyUI-Easy-Use](https://github.com/yolain/ComfyUI-Easy-Use) | GPU/cache cleanup and workflow utilities |
| [Fannovel16](https://github.com/Fannovel16) | [ComfyUI ControlNet Aux](https://github.com/Fannovel16/comfyui_controlnet_aux) | Optional pose/structure preprocessing |
| [BadCafeCode](https://github.com/BadCafeCode) | [Masquerade Nodes](https://github.com/BadCafeCode/masquerade-nodes-comfyui) | Mask-based donor extraction in Swap Anything |
| [Rvage (`r-vage`)](https://github.com/r-vage) | [ComfyUI-RvTools v2](https://github.com/r-vage/ComfyUI-RvTools_v2) | RGB normalization in Swap Anything |
| [diodiogod](https://github.com/diodiogod) | [TTS Audio Suite](https://github.com/diodiogod/TTS-Audio-Suite) | Multilingual speech synthesis |
| [Shmuel Ronen](https://github.com/ShmuelRonen) | [ComfyUI_ChatterBox_Voice](https://github.com/ShmuelRonen/ComfyUI_ChatterBox_Voice) | ChatterBox voice-cloning integration |
| [ControlAltAI (`gseth`)](https://github.com/gseth) | [ControlAltAI Nodes](https://github.com/gseth/ControlAltAI-Nodes) | Resolution utilities |
| [VRGameDevGirl (`vrgamegirl19`)](https://github.com/vrgamegirl19) | [VRGameDevGirl Custom Nodes](https://github.com/vrgamegirl19/comfyui-vrgamedevgirl) | Optional film grain in WAN video workflows |
| [Shammi G (`ShammiG`)](https://github.com/ShammiG) | [Simple Readable Metadata-SG](https://github.com/ShammiG/ComfyUI-Simple_Readable_Metadata-SG) | Source-image metadata handling |
| [Girish Gopaul (`giriss`)](https://github.com/giriss) | [comfy-image-saver](https://github.com/giriss/comfy-image-saver) | String Literal utility used by a voice workflow |
| [peterkickasspeter-civit](https://github.com/peterkickasspeter-civit) | [ZImageTurboProgressiveLockedUpscale](https://github.com/peterkickasspeter-civit/ComfyUI-ZImageTurboProgressiveLockedUpscale) | Z-Image creative upscaling |

Thank you as well to every contributor to these projects and to the researchers behind the models they support. These credits are not an exhaustive dependency or model attribution list; see the [workflow dependency inventory](COMFYUI_REQUIRED_NODES.txt) and each upstream project for its own contributors, model credits, installation instructions and license terms. Third-party nodes and models remain separate installations, and these acknowledgements do not imply endorsement of Lawiz.

Feature starting points also include **[Ammaar Reshi's Past Forward](https://github.com/ammaarreshi/past-forward-ai-studio)** and **zGenMedia's [Portrait Generator v2.0](https://github.com/zGenMedia/zGenMedia-Portrait-Generator-v2.0) and [Group Photo Fusion](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion)**. Thank you to their creators. Attribution is not permission: authorization for the zGenMedia-derived portions remains [pending](LICENSING.md#zgenmedia-permission-pending).

## License

Copyright (C) 2026 Lawiz. Original contributions for which Lawiz holds licensing rights are licensed under the **GNU General Public License v3.0 only** (`GPL-3.0-only`), without warranty. See [LICENSE](LICENSE) for the license text and [LICENSING.md](LICENSING.md) for its scope, third-party notices and unresolved permissions.

**The current application is not yet cleared for redistribution as a complete GPLv3 release.** Permission for code derived from zGenMedia's projects is being requested in [zGenMedia/zGenMedia-Group-Photo-Fusion#1](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion/issues/1). Adding the GPL text does not relicense that material or replace third-party obligations.

## Important notes

- Selected cloud providers receive the media/prompts sent to them and may charge for usage. Configure your own credentials; never commit API keys.
- Local workflows need compatible models, custom nodes and sufficient GPU memory. The app does not install them automatically.
- The local Library is not a backup: use [archives, Library Folder projects or Drive](docs/features/library.md).
