# LAWIZ'S Media Generator

React 19 and Redux Toolkit app built with Vite and packaged with Electron for Windows; it drives the user's ComfyUI server and cloud APIs. The shell is Windows PowerShell 5.1, where `&&` is a parse error: chain with `;`.

## Commands

- Test: `npm test`
- Single test: `node --test utils/krea2Prompting.test.mjs`
- Typecheck: `npm run typecheck`
- Full check: `npm run typecheck; if ($?) { npm test }; if ($?) { npx vite build --outDir "$env:TEMP\lawiz-b3-build" --emptyOutDir }`
- Browser checks: `npm run check:tabs`, `npm run check:ui`, `npm run check:panels`
- Prerequisites: browser checks need the Vite dev server on port 3000 (`LAWIZ_ORIGIN`) and Playwright in `LAWIZ_PLAYWRIGHT_DIR` (default `%TEMP%/scene-variation-browser`).

## Layout

| Path | What lives there |
|---|---|
| `dist/` | Written by `npm run build` and `npm run electron:build` (installer, `win-unpacked`); never edit by hand. |

## Conventions

- Build form controls from the kit in `components/ui/` (`Select.tsx`, `PromptBox.tsx`, `fields.tsx`, `Accordion.tsx`, `SettingsLayout.tsx`).
- Keep ComfyUI graphs, default values and the saved preset and Library formats unchanged unless the task asks.
- Add every new ComfyUI node class to `COMFYUI_REQUIRED_NODES.txt`.
- Record third-party code or text in `LICENSING.md`.
- A version bump edits `package.json`, `package-lock.json`, `version.json`, the README badge and `docs/development.md`.
- Log each change, in French, in `REFACTOR_JOURNAL.md`.

## Landmines

- Many tests read source text (9 read `App.tsx`) or compile sources to `data:` URLs with imports stripped; moving code or adding an import can fail them.
- Hidden tabs stay mounted in `TabActivity` (React.Activity) and their effect cleanups run on hide. Abort work on a real unmount with `components/useUnmountCleanup.ts`.
- `vite.config.ts` inlines `GEMINI_API_KEY` from `.env` or `.env.local` into the shipped bundle, and `.env` is tracked by git.

## Boundaries

- Always: the full check before handoff.
- Ask first: `git add`, `git commit`, `git push`; `npm run dev`; `npm run build`; `npm run electron:build`; `npm run electron:dev`.
- Never: queue a GPU generation to validate (the browser checks simulate ComfyUI); write into `dist/` for verification; put a real key in `.env` or `.env.local`.

## Pointers

- `docs/development.md` - commands, packaging and disk space. Read before `npm run electron:build`.
- `LICENSING.md` - third-party scope and release obligations. Read before importing third-party code or publishing.
- `docs/reference/comfyui-workflows.md` - workflow dependencies and defaults. Read before changing a ComfyUI graph.
- `REFACTOR_JOURNAL.md` - history and open points. Read before resuming the refactor.
