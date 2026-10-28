# Library and backups

[Documentation index](../README.md) | [Project overview](../../README.md)

Understand what is saved, how to find assets, and which backup format to use. A local Library is not automatically a backup.

## On this page

- [Storage and reuse](#storage-and-reuse)
- [Search and metadata](#search-and-metadata)
- [Portable archives](#portable-archives)
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

## Portable archives

- Export and restore the binary `.lawiz-library` backup format, which stores a manifest and original media assets without Base64 expansion.
- Create a new archive or add the full Library/selected categories to an existing `.lawiz-library`; matching item IDs are replaced while other archived items are preserved.
- Export either complete selected categories or exactly the individually checked Library items into a `.lawiz-library` archive.
- Export every non-empty category to its own `LMG_<Category>_1.lawiz-library` file in one selected folder, creating missing archives and merging into matching existing files.

## Library Folder projects

- Use a **Library Folder** as an incremental project: `manifest.json` tracks the project while content-addressed media is organized in folders such as `Images/`, `Videos/`, `Prompts/`, and `Audio TTS/`. Files are written only when their SHA-256 content is new within that category. A full project update mirrors the local Library, including removing deleted entries and asset files that are no longer referenced.
- The active Library Folder displays pending local additions, modifications, or deletions directly on the update button. Stored asset hashes let subsequent updates skip unchanged media instead of rescanning the complete project.
- Open a Library Folder project to import every manifest-referenced item and media Blob into the local Library. The portable `.lawiz-library` archive format remains available separately.

## Deletion and legacy imports

- Delete every item in the selected Library categories through a count-aware confirmation warning.
- Import legacy JSON Library backups progressively; each item is migrated into Blob storage as it is read instead of loading the complete backup into memory.

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
