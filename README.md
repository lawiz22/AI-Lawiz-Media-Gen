# LAWIZ'S Media Generator v1.58

LAWIZ'S Media Generator is a React and Electron creative workstation for cloud image generation with Mammouth AI and local workflows through ComfyUI. It includes image and character generation, prompt tools, asset extraction, a media library, and a dedicated LTX Director video timeline.

## Main Features

### Image Generation

- Mammouth AI and ComfyUI providers.
- Text-to-image and image-to-image workflows.
- Character, clothing, background, pose, logo, banner, album cover, group fusion, and PastForward tools.
- Selectable Mammouth image models with session token accounting.
- Configurable ComfyUI checkpoints, samplers, schedulers, VAEs, and LoRAs.

### LTX Director

LTX Director is the application's video generator and runs through ComfyUI using the included LTX 2.3 workflow.

- Add multiple photos to a visual timeline.
- Assign an independent prompt to every photo.
- Adjust each clip from 1 to 20 seconds with the slider or by dragging its right edge.
- Add an optional soundtrack.
- Configure frame rate and guide strength.
- Use Advanced options to select the LTX checkpoint and configure up to three LoRAs and their strengths.
- Generate and download the final video directly from the editor.

The former WAN and Mammouth video generators are not part of this release.

### Prompt, Extraction, and Media Tools

- Mammouth-powered prompt analysis and prompt generation.
- Background, subject, clothes, object, pose, mannequin, and font extraction.
- MediaPipe pose detection and ControlNet-compatible output.
- Video frame extraction, color palette extraction, image resize, and crop tools.

### Library

- Persistent local library backed by IndexedDB.
- Optional Google Drive synchronization.
- Restore saved generation settings and source media.

## Requirements

- Node.js and npm.
- A Mammouth AI API key for Mammouth image and prompt features.
- A running ComfyUI instance for local image workflows and LTX Director.
- The LTX Director custom nodes, LTX 2.3 models, VAEs, text encoders, upscaler, and selected LoRAs referenced by the workflow.
- An optional Google OAuth client ID for Google Drive synchronization.

The default ComfyUI address is `http://127.0.0.1:8188`. API keys and connection settings can be entered in the application settings.

## Development

Install the locked dependencies:

```bash
npm ci
```

Run the browser version:

```bash
npm run dev
```

Run the Electron application:

```bash
npm run electron:dev
```

## Production Build

Build and preview the optimized web bundle:

```bash
npm run build
npm run preview
```

Build the Windows Electron installer:

```bash
npm run electron:build
```

Generated files are written to `dist/`. This directory is ignored by Git; publish the installer separately as a GitHub Release asset.

Before committing a release, run:

```bash
npm audit --omit=dev
npm run build
git diff --check
```

## Technology

- React 19 and Redux Toolkit
- TypeScript and Vite
- Electron and electron-builder
- Mammouth AI API
- ComfyUI API and WebSocket execution tracking
- MediaPipe, IndexedDB, and optional Google Drive integration