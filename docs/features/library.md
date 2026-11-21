# Library and backups

[Documentation index](../README.md) | [Project overview](../../README.md)

Understand what is saved, how to find assets, and which backup format to use. A local Library is not automatically a backup.

## On this page

- [Storage and reuse](#storage-and-reuse)
- [Search and metadata](#search-and-metadata)
- [JSON backups and legacy archives](#json-backups-and-legacy-archives)
- [Library Folder projects](#library-folder-projects)
- [Deletion and legacy imports](#deletion-and-legacy-imports)
- [Categories, voices and Drive](#categories-voices-and-drive)
- [Video prompts versus rendered H3 outputs](#video-prompts-versus-rendered-h3-outputs)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Storage and reuse

- Persistent local media library backed by IndexedDB, with full-size media stored as separate Blobs and only lightweight metadata and thumbnails loaded into application state.
- Save source media, results, prompts, seeds, and generation settings.
- Search, filter, import, export, reuse, and send assets between tools.

## Search and metadata

- Search across names, prompts, models, LoRAs, tags, and other textual metadata. Images and Characters expose dynamic Provider and Workflow subfilters.
- Classify Library items as SFW, NSFW, or unrated and attach reusable custom tags. The collapsible Safety & Tags panel supports combining multiple tag buttons with search and requires matching items to contain every selected tag. Checkboxes can narrow bulk actions to selected matching items, with separate controls for the current page or every filtered result. Without a selection, actions update every matching item. The local first-pass detector uses explicit common terms and leaves ambiguous items unrated for manual review.
- Rate Library items from one to five stars in the item detail modal and sort results by date, name, or rating in ascending or descending order. Ratings appear on cards only when set and are included in archives, Drive metadata, and Library Folder synchronization.
- New images, characters and videos made with a **Style Gallery / Gestionnaire de styles** entry automatically receive its name as a reusable hashtag when saved. Names use the existing tag format (lowercase, collapsed whitespace, up to 48 characters), for example `Retro VHS` becomes `#retro vhs`. Existing tags are kept and equivalent style tags are not duplicated. Use the tag buttons or search for the name / `#retro vhs` to find matching results.
- Automatic style tags cover FLUX2 generation/editing, KREA2 Simple, MOSS Image/Photo, Blazing Fast characters and H3 REF2V/Ultrafast/Advanced results. Only the active image workflow's style is used; inactive selections for other models are ignored. Image generation keeps a settings snapshot so changing the selected style before saving does not relabel an earlier result. Enhanced images retain their source style tag. Saved tags survive backups and synchronization, independently of later edits to the style manager. Existing Library items are not retroactively retagged.

## JSON backups and legacy archives

- The main actions are **Project**, **Import...** and **Backup**. Opening changes the active project; importing adds to it; a backup creates an independent portable copy. These are deliberately separate operations.
- **Backup -> Create JSON backup** is the recommended portable backup. Choose the entire project, selected categories, or checked items and their linked results. Original media and nested original/edited references are embedded as Base64, together with prompts, settings, tags, ratings and thumbnails. Temporary `blob:` URLs and local IndexedDB asset IDs are not portable backups and are not exported as substitutes for missing originals.
- JSON output retains the historical top-level Library-item array format. Existing Library JSON backups remain importable. With file-picker support, JSON and Base64 are written incrementally instead of building one giant string. Without a save-file picker, the download fallback buffers the output. Video JSON backups are inherently larger than their binary media.
- **Backup -> Legacy archive options** preserves `.lawiz-library` creation, merge into an existing archive, one archive per category, selected-category export and exact checked-item export. Binary archives avoid Base64 expansion. Merging into an archive still intentionally replaces matching archived IDs; importing into the live Library instead keeps existing items and reassigns conflicting IDs.
- Google Drive download/upload actions are grouped separately under **Backup -> Google Drive**. A download adds content to the active Library/project; Drive does not open or switch a local project folder. Existing Drive behavior otherwise remains unchanged.

## Library Folder projects

- **Project -> New project** uses an empty folder. If no folder is active, it adopts the current local Library, so upgrading does not discard existing work. With a project already open, a new project starts empty. **Project -> Open project** replaces the displayed Library, rather than merging two projects. Empty projects are supported.
- Before switching, choose **Save and open**, **Cancel**, or **Keep local recovery and open** if the old folder is unavailable. The destination is prepared separately, its media sizes and SHA-256 hashes are verified, and its Library plus active folder identity are committed in one IndexedDB transaction. Preparation or activation failure leaves the old project intact.
- Automatic saving runs centrally even while the Library tab is hidden. Successful local additions, metadata edits and deletions are grouped for one second, then saved incrementally to the active folder. Saves are serialized; edits arriving during a save remain pending for another pass. **Project -> Save now** explicitly retries saving or requests permission.
- The header distinguishes local-only storage, pending changes, saving, successful folder saves and errors. Permission denial, missing media, disk errors or an externally changed manifest never select another destination or report success. Changes remain local until a successful save. Closing with pending changes, a save, an operation or an unresolved error requests the browser's normal leave-page warning; this is not a guarantee against process termination or power failure.
- `manifest.json` remains the version-1 project format. Media remains content-addressed under categories such as `Images/`, `Videos/`, `Prompts/` and `Audio TTS/`; cached hashes and unchanged assets are reused. New media is written before the manifest is replaced. An externally changed manifest is detected before replacement rather than automatically merged.
- On the first use after upgrading, a previously selected folder that differs from the local Library requires an explicit choice: open its contents, or confirm saving the local Library into it. No automatic first-run overwrite is performed.
- **Import -> Categories from another project** previews available categories and counts directly from its manifest. Choose categories without exporting JSON first. The destination remains the current project; the source folder is read-only. Linked results are included when available, embedded references are preserved, and ID collisions are remapped without replacing existing items. Missing historical linked results are reported rather than silently connected to unrelated local IDs.
- Library projects cover Library items and their saved setups, not unsaved drafts, app-wide connection settings or every tool's workspace.

### Recovery and disk use

- **Project -> Recovery / deleted items** restores deleted items, the Library before the last open/import, or unsaved-project recoveries. Unsaved work retained when switching projects is kept separately so a later import cannot overwrite its only recovery. Restore operations preserve the current Library before replacing it. Deleted items can also be restored into a different project deliberately.
- Each folder save retains `manifest.previous.json` and its media. Recovery offers **Restore previous project-folder save** for a valid previous manifest. Local recoveries store Blob references, not additional Base64 copies.
- Superseded folder media is not immediately deleted during autosave. **Preview cleanup of unused folder media** lists the count and size before confirmation. It removes only generated hash-named files unused by both the current and previous manifests, rejects changed manifests and unsafe paths, and leaves unrelated user files untouched.
- Deleted-item recoveries and individual project recoveries can be permanently removed only through explicit confirmations. Local recoveries consume browser storage and do not survive clearing that storage; make independent JSON backups, preferably on another disk.

## Deletion and legacy imports

- Individual, checked-item and category deletions move the original metadata/media into local recovery before removing them from the active Library. Folder auto-save propagates the removal; a synchronized folder is therefore not an independent backup.
- JSON and binary-archive imports are prepared progressively in staging and committed together only after validation. A truncated JSON, duplicate source ID, damaged asset or quota failure does not leave a half-imported Library. An interrupted, uncommitted staging import is cleaned up at the next startup under the project-operation lock.
- Compatibility and safety checks: `node --test services/libraryProject.test.mjs services/videoPromptDrive.test.mjs`.

## Categories, voices and Drive

- Organize Photo Fusion, Swap Anything, and FLUX2 Edit assets in dedicated media categories.
- Store named voice references and character photos for TTS and LTX reuse.
- Optional Google Drive folder synchronization.

## Video prompts versus rendered H3 outputs

These are different kinds of saved item:

| Item | Saved content | Use |
| --- | --- | --- |
| H3 / Ultrafast / Advanced generation prompt/setup | Free-form prompt, workflow variant, exact H3 settings (including Advanced mode and nested latent/LTX/RTX parameters), original and edited references, roles and audio passage metadata | **Open in Minimax REF2v H3**, **Open in Ultrafast**, or **Open in MiniMax Advanced** to rerun the [saved generation setup](minimax-h3.md#save-and-reopen-generation-prompts); cross-variant loading explicitly uses destination defaults |
| Older Video Prompt Generator prompt | Generated text, prompt-generation settings, editable templates, original and edited references | Choose either renderer to restore the prompt/references; missing historical H3 sampling settings are explicitly replaced by defaults, without modifying the saved item |
| MiniMax H3 rendered result | Original result binary, thumbnail, actual seed, prompt, render settings and executed graph | Play/download the saved result and inspect [H3 render metadata](minimax-h3.md#save-rendered-output-to-library); not a runnable reference-input snapshot |
| Character Swap H3 result/comparison | Original video binary, thumbnail, shot plan and submitted workflow/settings when available | Play/download independently of ComfyUI and inspect [Character Swap provenance](character-swap-h3.md#before--after-and-exports); partial assemblies and unavailable historical settings are labelled explicitly |

The rendered H3 file is stored locally rather than as a temporary server URL. For image-sequence formats, only the returned file is saved, not the complete server-side sequence.

Video rows also offer **Latent upscale** and **LTX refine**; the detail modal offers **Advanced · H3 latent upscale only** and **Advanced · LTX refine only**. These send the saved video binary directly to [Advanced video finishing](minimax-h3.md#finish-an-existing-library-video), without rerunning H3's first pass or changing the original Library item. The presets enable only the chosen stage; additional stages and their order remain editable. Source FPS and optional soundtrack are used, dimensions align to multiples of 32, and VAE processing may change the frame count. A saved finishing setup includes its source video and options; reopening it does not require the old ComfyUI URL.

Video prompt loading reads stored reference binaries directly, even when their old preview URLs have expired. Legacy URL-only references can be recovered from an exactly matching file in the persisted video workspace, with an explicit recovery notice; save a new generation setup afterward. A missing file is named in the error and is never replaced by a thumbnail or silently omitted. Opening a saved video prompt selects the chosen renderer before loading, so even an error appears there, not in Video Prompt Generator. Ultrafast enforces 6 images / 2 videos / 2 standalone audios; Advanced enforces 3 / 1 / 2. Over-limit transfers fail without dropping files or overwriting the current draft. Normal H3 retains 9 / 3 / 3. Advanced defaults to FL2V on cross-variant loads; select REF2V when the saved references require multimodal conditioning.

Character Swap H3 can also import Library videos as sources and Library images as global or selected-shot references. Its intermediate shot cache remains on ComfyUI and is not included in Library backups. See [Library imports](character-swap-h3.md#import-from-library) for source-reset behavior and reference-slot selection.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Library gallery with filters and saved H3 video details](../screenshots/12-library.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [MiniMax H3 REF2V](minimax-h3.md)
- [LTX Director and audio](ltx-and-audio.md)

---

[Back to documentation index](../README.md)
