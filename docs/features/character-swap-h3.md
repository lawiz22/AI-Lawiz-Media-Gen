# Character Swap H3

[Documentation index](../README.md) | [Video workspace](video-prompt-generator.md)

**Video > Character Swap H3** is independent of Video Prompt Generator and Minimax REF2v H3.

## Native Shot Planner

The app loads the installed BFSNodes Shot Planner from the configured ComfyUI server at runtime. Its Vue interface, timeline, thumbnails, cut detection, shot cards, people, filters, SAM masks, reference overrides, prompts, VLM tools, tour and guide are the native BFS interface, not an approximation. No BFS source or model weights are bundled. Keep BFSNodes installed and ComfyUI accessible; remote/browser installations require ComfyUI CORS, just like the other browser ComfyUI integrations.

An adapter removes the ComfyUI canvas attachment and mounts the planner inside the new workspace. Unsupported interface versions fail visibly rather than substituting a reduced planner. Normal subtab changes keep the planner and job monitor mounted.

Select/upload a source and references in the planner. **Check workflow / refresh models** checks active graph nodes and model choices without submitting a GPU render. Expand **Character Swap workflow settings** to adjust the supplied workflow's model, encoders, VAEs, character/turbo LoRAs, sampler and other rendering controls. VLM analysis may need the VLM to have been initialized by an execution, as explained by the native planner.

### Import from Library

The highlighted **Source video & reference photos · Library** section above the native planner provides **Choose video from Library**, which copies a saved video's original bytes into ComfyUI input. It uses the native source-selection behavior: shot boundaries/overrides are reset and the new source starts as a single, maximum 15-second clip. Adjust the range and use automatic splitting for a longer multi-shot run. Existing global references remain available.

Choose **Global references** or **Selected shot references**, then **Choose photo 1 / 2 from Library** to import an image into that exact slot. For a shot override, select the shot in the native timeline first. Other shot settings are preserved. Imports use unique filenames, support asset-backed and older inline Library items, and upload large videos in chunks instead of one oversized request. Only the selected original media is resolved: missing unrelated attachments do not block its import, and generic Blob types use the saved asset's MIME metadata when available. Upload failures are visible and do not replace the current plan's media. Imports and plan editing are locked while rendering; disabled Library controls explain whether the planner is loading, an operation is running or a render is active.

## Live render progress

The outer progress card stays visible while the native planner is locked for rendering. It connects using the submitted job's own ComfyUI client ID, showing live operation/node names, measured sampling steps and the percentage of the **current pass**, including recursive shots and an enabled second pass. A separate counter/bar shows saved shots. Sampling reaching 100%, or all shots being saved, does **not** mean decoding and final assembly are finished.

Loading, queueing and operations without measured progress use an indeterminate bar, not a simulated percentage. Polled cache counts are labelled as the last executed BFS timeline until live shot-completion events establish the current run; an older full cache never announces that a newly edited render is already assembling. Connection loss is explicit; the socket reconnects with the same client ID, while history and stored-shot polling continue as a fallback. An unavailable step socket warns rather than preventing rendering. Reloading the app restores monitoring without resubmitting the job. Older servers may only provide legacy step events rather than detailed node progress.

## Low-VRAM execution and memory

Defaults are 0.25 megapixels, dimensions aligned to 32, H3's `17n+5` frame grid, sequential recursive execution, model unloading between shots and before joining, and lossless intermediate storage. The app enforces recursive execution, persistent output storage and original footage for missing/skipped shots; it does not expose the native all-shots-at-once mode as a working alternative.

The memory gauge uses BFS's `/bfs/shotloop/vram` measurements and compares planned tokens against previous successful runs on that GPU. It is **not** a guarantee against OOM and is **not model-specific calibration**. Changing models, LoRAs, precision, masking, preview or enabling the second pass can change actual memory requirements. Unknown memory data must be read as uncalibrated, not a successful fit test.

## Persistent shots, resume and partial assembly

- The plan, workflow settings, submission intent, prompt ID and last result references are stored in a dedicated local IndexedDB database, separate from the prompt generator and REF2V.
- BFS stores completed shots under ComfyUI's `output/bfs_shotloop` directory. Its cache is **per source video's path and modification time**, not per application project. Runs of the same input in ComfyUI share that cache. Renaming/copying the source creates a separate native cache. Do not clear the server output/input folders if you need recovery.
- **Render / resume shots** reuses valid stored shots. BFS handles per-shot prompt/reference/mask changes. The app additionally invalidates stored shots when its rendering settings or second-pass settings differ from its previous submission for the same source. Changes made outside this app are not known to that signature history.
- On the first submission for a source with an existing BFS cache, the app asks before reusing shots whose rendering settings it cannot verify. Cancel and use **Redo all** if those older shots should be regenerated.
- On an execution error, the app pauses and preserves completed files. Resume after adjusting the failing shot, redo individual shots in **Run**, or use **Combine stored shots** without generating.
- Partial assembly follows the last executed BFS timeline: original footage replaces missing, outdated or disabled shots, preserving duration and the soundtrack. Edits made after that execution are not a new executed timeline; do not interpret partial assembly as rendering those edits.
- **Reconcile server job** reconnects monitoring after an app restart. Submission intent is saved before the network request; an uncertain submission is searched in the queue and recent history by its unique client ID, never automatically submitted twice. If the job is absent after a server restart/history cleanup, explicit confirmation releases the local lock so you can resume from disk.
- **Stop this render** uses the targeted ComfyUI job-cancellation endpoint. It never globally interrupts another job. Unsupported servers report an error; cancel the specific job in ComfyUI instead.
- Native **Reset loop** deletes this source's cached shots and requires confirmation. Model-setting changes mark shots for redo rather than deleting the files.

Cache status in the planner reflects the last server run. The next planner execution recalculates shot signatures. Unsaved result URLs and intermediate shots remain on ComfyUI; deleting server files makes those results unavailable. **Save result to Library** copies the finished video into the Library's binary asset store, so saved outputs are independent of ComfyUI and participate in normal Library backups. Intermediate shot caches are not Library backups. A project save failure is shown explicitly and blocks a new render until saving succeeds.

## Optional second pass

The second pass is **disabled by default**. Enabling it explicitly in **Run > Second pass (upscale)** adds the latent-upscale and second-sampling branch before decoding each shot. Disabled graphs contain no second-pass upscaler, second sampler or upscale LoRA. Its additional node/model requirements are checked only when enabled. It costs additional memory and time; the native historical gauge alone does not certify it.

## Before / after and exports

Completed output shows a synchronized original/result wipe slider. When BFS produces its aligned guide file, the player uses it; otherwise a completed app-monitored render uses its saved execution range to align the original source. The result player controls playback and seeking; the comparison source is muted. The partial-combine endpoint does not return its executed timeline, so partial assemblies are result-only: the app disables the wipe instead of assuming that today's edited range matches the stored timeline.

**Download result** opens the server's full-quality MP4. When produced by the full join, **Download comparison video** opens the native BFS comparison export. Native **Combine stored shots** produces a result-only MP4, not a new comparative export. The app does not run the tensor-heavy BFSVideoCompare node merely to display the wipe.

**Save result to Library** and **Save comparison to Library** retain the original video bytes plus a thumbnail and the saved render plan/submitted settings/API graph when available. Changing settings after rendering does not change that output's metadata. Reused cached shots can have earlier provenance; the saved graph describes the submission, not a guarantee that every reused shot was generated with it. Older results recover their matching completed job's graph when possible. Partial assemblies are savable too, but are explicitly marked as lacking a verified executed timeline; unknown historical settings are never replaced with today's settings. Download/thumbnail/storage errors remain visible and saving can be retried.

## Validation

### User-confirmed GPU runs

On **October 19, 2026**, the user confirmed successful real GPU rendering on their **RTX 3070 with 8 GB VRAM**:

- An initial single-shot Character Swap H3 render completed successfully.
- A subsequent **15-second source clip split into 4 shots** also rendered successfully, confirming multi-shot execution on this setup.

These reports validate actual generation and multi-shot completion for the tested clips, beyond automated graph checks or simulated progress events. They do not certify other models, resolutions, longer clips, the optional second pass, or every recovery scenario. The memory gauge remains a historical comparison, not an OOM guarantee.

### Automated and interface checks

```powershell
node --test services\characterSwapWorkflow.test.mjs services\characterSwapService.test.mjs services\characterSwapProgress.test.mjs services\characterSwapLibrary.test.mjs services\minimaxH3Library.test.mjs components\CharacterSwapComparison.test.mjs components\VideoWorkspace.test.mjs
npm run build
```

Automated checks cover graph wiring, disabled/enabled upscale branches, native-module adaptation, durable state, job ownership/recovery, measured progress, Library binary saves/imports, error reporting and existing workspace behavior. Browser checks also exercised real Library media imports, byte-identical video saving and local playback, simulated sampling/assembly progress, and reconnecting after a workspace switch without duplicate submission. Simulated progress and recovery checks do not establish GPU quality or memory limits; the real rendering reports above cover only the tested runs.
