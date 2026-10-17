# LTX Director and audio

[Documentation index](../README.md) | [Project overview](../../README.md)

Compose LTX timelines and reuse speech, photos and soundtracks. This remains separate from the dedicated H3 prompt-generator link.

## On this page

- [Director timelines and TTS](#director-timelines-and-tts)
- [Required nodes and models](#required-nodes-and-models)
- [Screenshots](#screenshots)
- [Related guides](#related-guides)

## Director timelines and TTS

- Build LTX 2.3 or LTX 2.5 timelines from prompt-only clips, image clips, or both.
- Give every clip its own prompt and duration, with optional generated continuation prompts.
- Add photos and soundtrack audio from local files or directly from the Library.
- Import Advanced TTS dialogue as speaker-aware clips with optional per-character reference photos.
- Add generated speech context and control frame rate and guidance.
- Configure the LTX checkpoint and up to three LoRAs.
- Model lists are not filtered by LTX version, filename, or extension. Select checkpoints or diffusion models in Safetensors/GGUF format; Director chooses the corresponding ComfyUI loader. Select both the text encoder and text projection for LTX 2.3, or the single encoder for LTX 2.5. Encoder choices and model selections are retained in saved projects and Library presets. Unfiltered choices still require models compatible with the selected LTX version.
- Reduce final decode VRAM usage with tiled VAE decoding and an adjustable tile size.
- Accelerate both LTX profiles with optional CacheDiT settings shared across LTX 2.3 and LTX 2.5.
- Generate the final video through ComfyUI and download the result.
- Generate multilingual speech through supported Chatterbox and IndexTTS ComfyUI nodes.
- Build solo or multi-character conversations with named voices, reusable references, per-line emotions, and composite character thumbnails.

## Required nodes and models

See [LTX Director dependencies](../reference/comfyui-workflows.md#ltx-director) before preparing the workflow. Connection setup and default CacheDiT values are documented in [Connections](../connections.md#comfyui).

## Screenshots

See the [capture guide](../screenshots/README.md) for filenames and activation steps. These images are planned, not yet included.

<!-- ![LTX Director multi-clip timeline](../screenshots/05-ltx-director.png) -->

<!-- ![Advanced TTS multi-character dialogue](../screenshots/06-advanced-tts.png) -->

## Related guides

- [Video Prompt Generator](video-prompt-generator.md)
- [MiniMax H3 REF2V](minimax-h3.md)
- [Voice recording and local media tools](creative-tools.md#local-media-tools)

---

[Back to documentation index](../README.md)
