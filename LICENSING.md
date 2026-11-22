# Licensing and third-party permissions

## Original Lawiz contributions

Copyright (C) 2026 Lawiz.

The original contributions to LAWIZ'S Media Generator for which Lawiz holds licensing rights are licensed under the **GNU General Public License, version 3 only** (`GPL-3.0-only`). You may redistribute and modify those contributions under that license. They are provided **without any warranty**, including the implied warranties of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the complete, unmodified license text.

This grant does not claim ownership of third-party code, replace existing third-party licenses, or grant permissions that Lawiz does not hold. It is not a statement that every part of the current application has been cleared for redistribution.

## zGenMedia: derived material replaced

Lawiz's first version (September 2025) started from [zGenMedia Portrait Generator v2.0](https://github.com/zGenMedia/zGenMedia-Portrait-Generator-v2.0), and the Photo Fusion feature was first built from [zGenMedia Group Photo Fusion](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion). Neither project carries a license. A permission request sent on October 19, 2026 in [zGenMedia/zGenMedia-Group-Photo-Fusion#1](https://github.com/zGenMedia/zGenMedia-Group-Photo-Fusion/issues/1) received no response.

On November 22, 2026 the developer replaced that material instead of relying on permission:

- **Photo Fusion** was rewritten from its behaviour: new interface, scenes, prompts, state and service. The files derived from Group Photo Fusion were deleted.
- **Shared code from Portrait Generator** was rewritten: the image upload box, the generation progress card, the file-reading helpers, seven icon drawings and the thirteen original character pose texts.
- **Character creation**, which descends from Portrait Generator, was not rewritten from scratch. Its code has been substantially reworked since 2025 and its copied pose texts were replaced; its origin is recorded here.

How it was checked: every source file was compared line by line with the public files of both projects (whitespace normalised, lines of 25 characters or more). The lines still identical are generic: React and browser idioms, Gemini API calls, and the Google AI Studio scaffolding that both projects share (`vite.config.ts`, `index.html`, `index.tsx`).

Limits: this is the developer's assessment, not a legal opinion. A line comparison does not detect code that was copied and then renamed or reformatted. Commits and installers produced before November 22, 2026 still contain the former material.

If zGenMedia replies, record the exact response and its source here.

## Past Forward and Apache-2.0 notices

The developer identifies [Past Forward by Ammaar Reshi](https://github.com/ammaarreshi/past-forward-ai-studio) as the source of the Past Forward feature's starting point.

This local file retains an explicit `Apache-2.0` header:

- [utils/pastForwardAlbumUtils.ts](utils/pastForwardAlbumUtils.ts)

Keep applicable upstream license, copyright and attribution notices, document modifications, and include the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) and any applicable upstream NOTICE when distributing Apache-covered material. Apache-2.0 is compatible with GPLv3, but that does not erase the upstream notices. File-level headers are not a blanket license for every file in the upstream repository; the full scope of the imported material still needs verification.

## Runtime components and dependencies

- **BFSNodes:** [ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes) is GPLv3. The app loads and adapts the user's installed native Shot Planner JavaScript at runtime. Loading it at runtime is not, by itself, an exemption from applicable GPL obligations. Its authors retain their rights; no BFS source is bundled here.
- **FFmpeg:** the installed `@ffmpeg/core` 0.12.10 declares `GPL-2.0-or-later`; its JavaScript/WebAssembly assets are included in the renderer build. `@ffmpeg/ffmpeg` is an MIT-licensed wrapper, which does not make the core MIT-licensed. Distribution requires the applicable notices and corresponding source/build information for the actual core and included libraries. A link to the latest upstream repository alone is not a verified source-compliance solution. See the [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/) and [FFmpeg legal guidance](https://ffmpeg.org/legal.html).
- **Other dependencies:** packages retain their own licenses and notices. The dependency license fields in [package-lock.json](package-lock.json) are an inventory aid, not a complete redistribution notice bundle. Electron/Chromium notices do not replace the notices needed for npm dependencies or imported application code.
- **Models and services:** ComfyUI, custom nodes, model weights and API services are separate installations or services with their own licenses and terms. The app's GPL grant does not override model restrictions or automatically apply to generated images, videos or audio.

## Distribution status

The GPL text and this scope notice are configured for inclusion in Electron packages. This does not complete a third-party license audit.

Before publishing a new installer, assemble the required third-party license and notice texts (npm dependencies, the FFmpeg core, the Past Forward Apache notices), provide access to the complete corresponding source and build instructions for the exact distributed version and GPL components, and verify the legal notices in the packaged application.
