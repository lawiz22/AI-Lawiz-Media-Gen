# Licensing and third-party permissions

## Original Lawiz contributions

Copyright (C) 2026 Lawiz.

The original contributions to LAWIZ'S Media Generator for which Lawiz holds licensing rights are licensed under the **GNU General Public License, version 3 only** (`GPL-3.0-only`). You may redistribute and modify those contributions under that license. They are provided **without any warranty**, including the implied warranties of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the complete, unmodified license text.

This grant does not claim ownership of third-party code, replace existing third-party licenses, or grant permissions that Lawiz does not hold. It is not a statement that every part of the current application has been cleared for redistribution.

## zGenMedia: permission pending

The developer has identified these projects as sources used during development:

- [zGenMedia Portrait Generator v2.0](https://github.com/zGenMedia/zGenMedia-Portrait-Generator-v2.0)
- [zGenMedia Group Photo Fusion](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion)

As of October 19, 2026, no applicable license or reuse authorization has been identified for the portions taken from these projects. A request covering both projects was sent in [zGenMedia/zGenMedia-Group-Photo-Fusion#1](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion/issues/1).

**Permission is pending, not granted.** The GPL grant for Lawiz's original contributions does not cover the underlying zGenMedia material or establish permission to redistribute adaptations of it. The exact affected file boundaries have not yet been audited; copied portions may occur in shared application files, not only dedicated feature panels. An unmarked file must not be assumed to be cleared.

Do not treat the current application or an existing installer as cleared for redistribution by the addition of LICENSE. Resolve the permission request, or remove and independently replace the affected material, before presenting the complete application as a cleared GPLv3 release. Substantial changes and attribution alone do not establish reuse permission.

When a response is received, preserve the exact permission and its source, verify that it covers the intended source/binary redistribution, and update this notice. Do not treat silence, an issue reaction or issue closure alone as permission.

## Past Forward and Apache-2.0 notices

The developer identifies [Past Forward by Ammaar Reshi](https://github.com/ammaarreshi/past-forward-ai-studio) as the source of the Past Forward feature's starting point.

These local files retain explicit `Apache-2.0` headers:

- [components/pastForward/PolaroidCard.tsx](components/pastForward/PolaroidCard.tsx)
- [utils/pastForwardAlbumUtils.ts](utils/pastForwardAlbumUtils.ts)

Keep applicable upstream license, copyright and attribution notices, document modifications, and include the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) and any applicable upstream NOTICE when distributing Apache-covered material. Apache-2.0 is compatible with GPLv3, but that does not erase the upstream notices. File-level headers are not a blanket license for every file in the upstream repository; the full scope of the imported material still needs verification.

## Runtime components and dependencies

- **BFSNodes:** [ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes) is GPLv3. The app loads and adapts the user's installed native Shot Planner JavaScript at runtime. Loading it at runtime is not, by itself, an exemption from applicable GPL obligations. Its authors retain their rights; no BFS source is bundled here.
- **FFmpeg:** the installed `@ffmpeg/core` 0.12.10 declares `GPL-2.0-or-later`; its JavaScript/WebAssembly assets are included in the renderer build. `@ffmpeg/ffmpeg` is an MIT-licensed wrapper, which does not make the core MIT-licensed. Distribution requires the applicable notices and corresponding source/build information for the actual core and included libraries. A link to the latest upstream repository alone is not a verified source-compliance solution. See the [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/) and [FFmpeg legal guidance](https://ffmpeg.org/legal.html).
- **Other dependencies:** packages retain their own licenses and notices. The dependency license fields in [package-lock.json](package-lock.json) are an inventory aid, not a complete redistribution notice bundle. Electron/Chromium notices do not replace the notices needed for npm dependencies or imported application code.
- **Models and services:** ComfyUI, custom nodes, model weights and API services are separate installations or services with their own licenses and terms. The app's GPL grant does not override model restrictions or automatically apply to generated images, videos or audio.

## Distribution status

The GPL text and this scope notice are configured for inclusion in future Electron packages. This does not complete a third-party license audit or clear the pending permissions above. Previously generated installers are unchanged.

Before publishing a new installer, resolve the zGenMedia permission and imported-code scope, assemble the required third-party license/notice texts, provide access to the complete corresponding source and build instructions for the exact distributed version and GPL components, and verify the legal notices in the packaged application.
