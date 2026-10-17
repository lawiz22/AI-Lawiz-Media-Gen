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
| Video Prompt Generator prompt | Generated text, prompt-generation settings, editable templates, original and edited references | Restore the complete [prompt-generation setup](video-prompt-generator.md#library-snapshots-and-restoration) |
| MiniMax H3 rendered result | Original result binary, thumbnail, actual seed, prompt, render settings and executed graph | Play/download the saved result and inspect [H3 render metadata](minimax-h3.md#save-rendered-output-to-library); not a runnable reference-input snapshot |

The rendered H3 file is stored locally rather than as a temporary server URL. For image-sequence formats, only the returned file is saved, not the complete server-side sequence.

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![Library gallery with filters and saved H3 video details](../screenshots/12-library.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [MiniMax H3 REF2V](minimax-h3.md)
- [LTX Director and audio](ltx-and-audio.md)

---

[Back to documentation index](../README.md)
