# Getting started

[Documentation index](./README.md) | [Project overview](../README.md)

Install the desktop application or run from source, then enable only the providers you need.

## On this page

- [Requirements](#requirements)
- [Install an existing Windows setup](#install-an-existing-windows-setup)
- [Run from source](#run-from-source)
- [First session](#first-session)

## Requirements

| Requirement | Purpose |
| --- | --- |
| Windows 10 or 11 | Target platform and Electron system-audio loopback capture |
| Node.js 20+ and npm | Source development and production builds; not needed to run an existing setup |
| Mammouth AI API key | When using Mammouth generation or prompt tools |
| Google Gemini API key | Direct Gemini features, when used |
| OpenRouter API key | OpenRouter prompt tools, when used |
| Ollama | Optional local prompt analysis, extraction, and Magic Soup |
| ComfyUI | Local image, video, TTS, and upscale workflows |
| Google OAuth client ID | Optional Google Drive synchronization |
| Civitai API key | Optional authenticated model operations |

Each local workflow requires its referenced models and custom nodes to be installed in ComfyUI. The application reads available choices from ComfyUI's `/object_info` endpoint, but it does not install workflow dependencies automatically.

## Install an existing Windows setup

If you already have a generated Windows setup `.exe`, run it to install the application. You do not need Node.js for this route. Unsigned local builds may trigger Windows SmartScreen.

ComfyUI, Ollama, AI weights and API subscriptions are separate installations, not part of the setup. For building your own installer, see [Windows packaging](development.md#production-build).

## Run from source

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

## First session

1. Start a local project in the application.
2. Open **Connection Settings** and configure the cloud providers or local servers you plan to use.
3. Start with one workflow and confirm its required models/nodes are already installed.
4. Save useful outputs to the Library and set up a backup before clearing browser/Electron data.

Continue with [Connections and local services](connections.md) and [Library and backups](features/library.md).

---

[Back to documentation index](./README.md)
