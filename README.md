# LAWIZ'S Media Generator

<div align="center">

**A Windows creative workstation for cloud AI, Ollama, and local ComfyUI production.**

[![Version](https://img.shields.io/badge/version-1.88.0-0ea5e9?style=for-the-badge)](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Windows](https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[Features](#features) | [Quick start](#quick-start) | [Documentation](docs/README.md) | [Screenshots](docs/screenshots/README.md) | [Windows build](docs/development.md#production-build)

</div>

LAWIZ'S Media Generator combines image generation, character creation, video direction, speech synthesis, asset extraction, upscaling, and model management in one React/Electron desktop application. It connects to hosted providers including Mammouth AI, Gemini and OpenRouter, local language and vision models through Ollama, and configurable workflows on a local ComfyUI server.

> This repository contains the application and workflow definitions. AI checkpoints, LoRAs, ComfyUI, custom nodes, and third-party API access are not bundled.

## Features

| Workspace | What you can do | Guide |
| --- | --- | --- |
| Images and characters | Generate/edit images, create character views, use Qwen 2.1 and Outpaint | [Images and characters](docs/features/images-and-characters.md) |
| Scene and identity editing | Vary scenes, edit selected people, swap identities and fuse portraits | [Scene Variation](docs/features/scene-variation.md) / [Swap and Fusion](docs/features/swap-and-fusion.md) |
| Video | Write multimodal prompts, render MiniMax H3 REF2V videos and direct LTX timelines | [Video prompts](docs/features/video-prompt-generator.md) / [H3](docs/features/minimax-h3.md) / [LTX](docs/features/ltx-and-audio.md) |
| Creative tools | Analyze prompts, create Magic Soup, transform styles, crop references, extract clips and record audio | [Creative tools](docs/features/creative-tools.md) |
| Models and LoRAs | Scan local models, retrieve metadata and organize your ComfyUI inventory | [Models and LoRAs](docs/features/models-and-loras.md) |
| Library | Save media and exact generation settings, search/tag/rate assets and back up projects | [Library and backups](docs/features/library.md) |

## What's new in 1.88

- A unified **Video** workspace with **Video Prompt Generator**, **LTX Director** and **Minimax H3**.
- Editable multimodal prompt templates, image/video crop and resize, colored references and automatic prompt snapshots in the Library.
- Connected **H3 REF2V**, six optional LoRAs, optional live previews and local Library saving of rendered videos with their actual settings.
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

## Important notes

- Selected cloud providers receive the media/prompts sent to them and may charge for usage. Configure your own credentials; never commit API keys.
- Local workflows need compatible models, custom nodes and sufficient GPU memory. The app does not install them automatically.
- The local Library is not a backup: use [archives, Library Folder projects or Drive](docs/features/library.md).
- No license file is currently included; reuse and redistribution rights are not granted unless a license is added.
