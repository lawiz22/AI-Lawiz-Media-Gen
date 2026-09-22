# LAWIZ'S Media Generator

<div align="center">

**A Windows creative workstation for cloud AI, Ollama, and local ComfyUI production.**

[![Version](https://img.shields.io/badge/version-1.85.0-0ea5e9?style=for-the-badge)](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-44-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Windows](https://img.shields.io/badge/Windows-desktop-0078D4?style=for-the-badge&logo=windows11&logoColor=white)](https://www.microsoft.com/windows)

[Features](#features) · [Screenshots](#screenshots) · [Requirements](#requirements) · [Setup](#setup) · [Ollama](#ollama-setup) · [ComfyUI](#comfyui-setup) · [Production](#production-build)

</div>

LAWIZ'S Media Generator combines image generation, character creation, video direction, speech synthesis, asset extraction, upscaling, and model management in one React/Electron desktop application. It can use hosted generation through Mammouth AI, local language and vision models through Ollama, or configurable workflows on a local ComfyUI server.

> This repository contains the application and workflow definitions. AI checkpoints, LoRAs, ComfyUI, custom nodes, and third-party API access are not bundled.

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
- SAM3.1-guided Swap Anything with destination/donor images, editable target regions, optional LoRAs, and FLUX2 sampling.
- Inpainting, composition, generated masks, and reusable source elements.
- Exportable ComfyUI workflows and reusable generation presets.

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
- Creative Magic Soup generation through Mammouth AI or Ollama, with adjustable creativity and source-color attribution.
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

- Persistent local media library backed by IndexedDB.
- Save source media, results, prompts, seeds, and generation settings.
- Search, filter, import, export, reuse, and send assets between tools.
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

FLUX2 Simple uses ComfyUI-GGUF, `Power Lora Loader (rgthree)`, `Flux2Scheduler`, and `EmptyFlux2LatentImage` with the FLUX2 Klein GGUF diffusion model, FLUX2 CLIP encoder, FLUX2 VAE, and compatible LoRAs installed in their corresponding ComfyUI model folders. FLUX2 Edit and FLUX2 Photo Fusion additionally use `LoadImage`, `ImageScaleToTotalPixels`, `GetImageSize`, `VAEEncode`, and `ReferenceLatent` to encode the source and each independent reference. Character FLUX2 uses the same FLUX2 model stack with `ReferenceLatent` and two optional LoRAs. Pose references require `AIO_Preprocessor` from ComfyUI ControlNet Aux, while optional acceleration requires `CacheDiT_Model_Optimizer` from ComfyUI-CacheDiT.

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
- Mammouth AI, Ollama, Google Gemini, Civitai, and CivArchive integrations

## Repository

- Source: [github.com/lawiz22/AI-Lawiz-Media-Gen](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
- Current application version: `1.85.0`
- Default development port: `3000`
- Default ComfyUI endpoint: `http://127.0.0.1:8188`
- Default Ollama endpoint: `http://127.0.0.1:11434`
- Default Ollama model: `huihui_ai/qwen3-vl-abliterated:8b`

No license file is currently included. Unless a license is added, reuse and redistribution rights are not granted by this repository.