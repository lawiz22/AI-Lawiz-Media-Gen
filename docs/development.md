# Development and Windows packaging

[Documentation index](./README.md) | [Project overview](../README.md)

Contributor commands, project structure, Windows setup builds and validation. End-user installation is covered in [Getting started](getting-started.md).

## On this page

- [Development commands and layout](#development-commands-and-layout)
- [Production build](#production-build)
- [Technology](#technology)
- [Repository and licensing](#repository-and-licensing)

## Development commands and layout

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

## Production build

**Redistribution clearance is pending.** Original Lawiz contributions are GPLv3, but permission for zGenMedia-derived code and third-party source/notice obligations must be resolved before publishing a cleared release. Read [licensing scope and distribution status](../LICENSING.md) first. Builds for local validation do not resolve those permissions.

Create the optimized renderer and Windows x64 NSIS installer:

```powershell
npm ci
@'
const { spawnSync } = require('node:child_process');
const build = spawnSync('npm run electron:build -- --win nsis --x64 --publish never', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, GEMINI_API_KEY: '', API_KEY: '' },
});
process.exit(build.status === null ? 1 : build.status);
'@ | node
```

`electron:build` runs `vite build` first and then `electron-builder`. It generates the NSIS setup `.exe` in `dist`, alongside the packaged application under `dist/win-unpacked`. `--publish never` prevents release uploads. The empty environment overrides keep local `.env.local` Gemini credentials out of the renderer bundle; configure provider keys in the installed application's Connection Settings instead. Run the setup `.exe` to install the desktop app; ComfyUI, Ollama and their models remain separate installations. Build artifacts in `dist` are ignored by Git and are not included in a normal source commit.

Without a configured code-signing certificate, the generated installer is unsigned and Windows may show a SmartScreen warning.

Allow several GB of free space on both the output and Windows temporary-file drives. NSIS's `error creating mmap` can indicate a full disk even when RAM is available. Do not use an installer left by a failed build; a partially written `.exe` may still exist.

Recommended pre-commit checks:

```powershell
npm audit --omit=dev
node --test services/sceneVariationService.test.mjs
node --test services\characterSwapWorkflow.test.mjs services\characterSwapService.test.mjs services\characterSwapProgress.test.mjs services\characterSwapLibrary.test.mjs components\CharacterSwapComparison.test.mjs components\VideoWorkspace.test.mjs
node --test services/minimaxH3Workflow.test.mjs services/minimaxH3Service.test.mjs services/minimaxH3Library.test.mjs services/videoPromptService.test.mjs services/videoPromptLibrary.test.mjs services/videoPromptDrive.test.mjs services/openRouterService.test.mjs services/videoClipService.test.mjs services/ltxDirectorWorkflow.test.mjs
npm run build
git diff --check
```

The Scene Variation suite runs directly with Node's test runner and covers prompt generation, SAM3 single-target encoding, mask validation, masked workflows, and sequential generation. There is no `npm test` script. These tests do not run live AI models; production validation also requires the Vite build and a smoke test of the packaged Electron application and configured provider connections.

## Technology

- [React 19](https://react.dev/) and [Redux Toolkit](https://redux-toolkit.js.org/)
- [TypeScript](https://www.typescriptlang.org/) and [Vite](https://vite.dev/)
- [Electron](https://www.electronjs.org/) and [electron-builder](https://www.electron.build/)
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) API and WebSocket execution tracking
- [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide), IndexedDB, and optional Google Drive integration
- Mammouth AI, Ollama, Google Gemini, Civitai, and CivArchive integrations

## Repository and licensing

- Source: [github.com/lawiz22/AI-Lawiz-Media-Gen](https://github.com/lawiz22/AI-Lawiz-Media-Gen)
- Current application version: `1.88.0`
- Default development port: `3000`
- Default ComfyUI endpoint: `http://127.0.0.1:8188`
- Default Ollama endpoint: `http://127.0.0.1:11434`
- Default Ollama model: `huihui_ai/qwen3-vl-abliterated:8b`

Original Lawiz contributions are licensed under **GPL-3.0-only**; see [LICENSE](../LICENSE). The grant applies only where Lawiz holds licensing rights. Existing third-party licenses remain applicable, and authorization for zGenMedia-derived portions is pending in [zGenMedia/zGenMedia-Group-Photo-Fusion#1](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion/issues/1). See [LICENSING.md](../LICENSING.md) for scope and distribution requirements.

The package metadata points to that scope notice rather than claiming that all bundled code is already cleared under a single SPDX license. Future Electron packages include LICENSE and LICENSING.md in the application archive; previously built installers are not retroactively updated. These two documents alone are not a complete third-party notice/source bundle.

---

[Back to documentation index](./README.md)
