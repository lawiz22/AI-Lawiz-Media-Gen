# LAWIZ'S Media Generator

<div align="center">

**A Windows creative workstation for cloud AI and local ComfyUI production.**

[![Version](https://img.shields.io/badge/version-1.58.0-0ea5e9?style=for-the-badge)](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Windows](https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[Features](#features) · [Requirements](#requirements) · [Setup](#setup) · [ComfyUI](#comfyui-setup) · [Production](#production-build)

</div>

LAWIZ'S Media Generator combines image generation, character creation, video direction, speech synthesis, asset extraction, upscaling, and model management in one React/Electron desktop application. It can use hosted generation through Mammouth AI or execute configurable workflows on a local ComfyUI server.

> This repository contains the application and workflow definitions. AI checkpoints, LoRAs, ComfyUI, custom nodes, and third-party API access are not bundled.

## Features

### Image and Character Generation

- Text-to-image and image-to-image generation through Mammouth AI or ComfyUI.
- Local workflows for SD 1.5, SDXL, Flux, Qwen Image, Qwen Edit, Z-Image, Nunchaku Flux, Flux Krea, and face detailing.
- Adjustable checkpoints, UNets, CLIP models, VAEs, samplers, schedulers, seeds, dimensions, and LoRA chains.
- Refine mode with source-image denoise control.
- Character generation with pose, clothing, background, and multi-angle controls.
- Inpainting, composition, generated masks, and reusable source elements.
- Exportable ComfyUI workflows and reusable generation presets.

### Local Models and LoRAs

- Scan the local ComfyUI model tree without uploading model files.
- Identify installed checkpoints and LoRAs through Civitai metadata or SHA-256 matching.
- Use CivArchive as a fallback for models deleted from Civitai.
- Detect updates, download models, organize files by model family, and retain sidecar metadata.
- Store safety classifications, previews, trigger words, and recommended generation settings.
- Load Civitai or CivArchive prompt examples directly into the Image Generator.
- `USE` selects the matching workflow family, compatible base model, LoRA, and trigger words.

### LTX Director and Audio

- Build an LTX 2.3 timeline from prompt-only clips, image clips, or both.
- Give every clip its own prompt and duration, with optional generated continuation prompts.
- Add soundtrack or generated speech context and control frame rate and guidance.
- Configure the LTX checkpoint and up to three LoRAs.
- Generate the final video through ComfyUI and download the result.
- Generate multilingual speech through supported Chatterbox ComfyUI nodes and reference voices.

### Creative Tools

- Prompt analysis, prompt generation, and prompt mixing.
- Clothes, subject, object, background, pose, mannequin, and font extraction.
- MediaPipe pose detection with ControlNet-compatible output.
- Group photo fusion and PastForward transformations.
- Logo, banner, album-cover, and theme generation.
- Video frame extraction, palette extraction, image resize, and crop tools.
- SeedVR2 and Z-Image creative upscaling workflows.

### Library

- Persistent local media library backed by IndexedDB.
- Save source media, results, prompts, seeds, and generation settings.
- Search, filter, import, export, reuse, and send assets between tools.
- Optional Google Drive folder synchronization.

## Requirements

| Requirement | Purpose |
| --- | --- |
| Windows 10 or 11 | Target platform for the packaged Electron application |
| Node.js 20+ and npm | Development and production builds |
| Mammouth AI API key | Mammouth generation and AI-assisted prompt features |
| Google Gemini API key | Direct Gemini features, when used |
| ComfyUI | Local image, video, TTS, and upscale workflows |
| Google OAuth client ID | Optional Google Drive synchronization |
| Civitai API key | Optional authenticated model operations |

Each local workflow requires its referenced models and custom nodes to be installed in ComfyUI. The application reads available choices from ComfyUI's `/object_info` endpoint, but it does not install workflow dependencies automatically.

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

For browser-only development, run `npm run dev` and open `http://localhost:3000`. Electron-only features such as local model scanning, native file selection, secure key persistence, and CivArchive prompt retrieval require the desktop application.

## Configuration

Connection settings are entered inside the application:

| Setting | Typical value | Required for |
| --- | --- | --- |
| ComfyUI URL | `http://127.0.0.1:8188` | Local workflows |
| Mammouth API key | Provider-issued key | Mammouth generation and prompt tools |
| Gemini API key | Google AI key | Direct Gemini generation |
| Google OAuth client ID | OAuth web client ID | Drive synchronization |
| Civitai API key | Civitai account key | Authenticated model operations |

In Electron, API keys are persisted through `electron-store`. Do not commit API keys or place secrets directly in source files. For browser development, `GEMINI_API_KEY` can be supplied through a local Vite environment file that remains outside version control.

## ComfyUI Setup

1. Start ComfyUI with CORS enabled for the application origin. A typical local command includes:

	```powershell
	python main.py --listen 127.0.0.1 --enable-cors-header "*"
	```

2. Enter the ComfyUI URL in **Connection Settings**. The default expected address is `http://127.0.0.1:8188`.
3. Confirm the connection indicator is active. The application then reads installed checkpoints, LoRAs, UNets, VAEs, text encoders, samplers, schedulers, and custom nodes.
4. Open **Models/LoRAs** to select the ComfyUI root folder, scan local models, and retrieve metadata.

Large local libraries are indexed from these directories:

```text
ComfyUI/models/checkpoints
ComfyUI/models/diffusion_models
ComfyUI/models/loras
```

Model-specific metadata is stored beside the model where applicable. Keep these sidecars with the model when moving files outside the application's organizer.

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

`electron:build` runs `vite build` first and then `electron-builder`. The output includes the packaged Windows application under `dist/win-unpacked` and distributable artifacts generated by Electron Builder in `dist`.

Recommended pre-commit checks:

```powershell
npm audit --omit=dev
npm run build
git diff --check
```

The repository currently has no automated test script. Production validation therefore consists of the Vite build plus a smoke test of the packaged Electron application and the configured provider connections.

## Technology

- [React 19](https://react.dev/) and [Redux Toolkit](https://redux-toolkit.js.org/)
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/)
- [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/)
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) API and WebSocket execution tracking
- [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide), IndexedDB, and optional Google Drive integration
- Mammouth AI, Google Gemini, Civitai, and CivArchive integrations

## Repository

- Source: [github.com/lawiz22/AI-Lawiz-Media-Gen](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
- Current application version: `1.58.0`
- Default development port: `3000`
- Default ComfyUI endpoint: `http://127.0.0.1:8188`

No license file is currently included. Unless a license is added, reuse and redistribution rights are not granted by this repository.