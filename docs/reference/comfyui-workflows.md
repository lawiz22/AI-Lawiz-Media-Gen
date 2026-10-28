# ComfyUI workflow dependencies

[Documentation index](../README.md) | [Project overview](../../README.md)

This reference preserves the model-family notes formerly grouped under Qwen requirements. For the full node inventory, use the [required-node list](../../COMFYUI_REQUIRED_NODES.txt). Model licenses and compatibility must be checked for the exact installed weights.

## On this page

- [KREA2 Simple](#krea2-simple)
- [KREA2 RAW](#krea2-raw)
- [MOSS Image 1.0](#moss-image-10)
- [MOSS PHOTO](#moss-photo)
- [KREA2 Identity and General Edit V2](#krea2-identity-and-general-edit-v2)
- [FLUX2](#flux2)
- [Photo Fusion FLUX2](#photo-fusion-flux2)
- [Photo Fusion Qwen Edit](#photo-fusion-qwen-edit)
- [Legacy Flux and Qwen](#legacy-flux-and-qwen)
- [LTX Director](#ltx-director)
- [Related guides](#related-guides)

## KREA2 Simple

KREA2 Simple uses `Power Lora Loader (rgthree)` from rgthree-comfy with the KREA2 diffusion model, KREA2 CLIP encoder, Qwen Image VAE, and KREA LoRAs installed in their corresponding ComfyUI model folders.

## KREA2 RAW

KREA2 RAW uses the supplied two-stage `ClownsharKSampler_Beta` graph with fixed sampler parameters, selectable KREA models and LoRAs, 29 source resolutions, and `1920x1088` as its default resolution.

## FLUX2

FLUX2 Simple supports GGUF and Safetensors diffusion models using `UnetLoaderGGUF` or `UNETLoader` automatically. It also uses `Power Lora Loader (rgthree)`, `Flux2Scheduler`, and `EmptyFlux2LatentImage` with a FLUX2 CLIP encoder, FLUX2 VAE, and compatible LoRAs installed in their corresponding ComfyUI model folders. FLUX2 Edit and FLUX2 Photo Fusion additionally use `LoadImage`, `ImageScaleToTotalPixels`, `GetImageSize`, `VAEEncode`, and `ReferenceLatent` to encode the source and each independent reference. Character FLUX2 supports the same GGUF/Safetensors selection with `ReferenceLatent` and two optional LoRAs. Pose references require `AIO_Preprocessor` from ComfyUI ControlNet Aux, while optional acceleration requires `CacheDiT_Model_Optimizer` from ComfyUI-CacheDiT.

## KREA2 Identity and General Edit V2

Open **Image Generation > ComfyUI > KREA2 > I2I Edit / Identity**. Install [ComfyUI-Krea2Edit](https://github.com/lbouaraba/comfyui-krea2edit) **v2.0.0+** and restart the server. Both `Krea2EditModelPatch` and `Krea2EditGroundedEncode` are required; ordinary text encoding cannot replace their image conditioning. The app checks live input schemas, reference-placement choices, models, enabled LoRAs and sampler options before uploading references.

**General Edit** defaults to Turbo, 8 steps, CFG 1, reference boost 4 and grounding 768. **Identity** changes the first LoRA to Identity Edit V2, sets reference boost 2 and uses beside placement to allow restaging. Task switches preserve the prompt and other custom LoRAs, but disable extra Identity/General Edit task LoRAs. Full, r128 and r64 task weights are selectable; r64 is the initial low-VRAM choice. Four independently enabled `LoraLoaderModelOnly` slots are chained before the edit patch; no Power LoRA is used. Use one task LoRA at strength 1.0; if deliberately combining both, start around 0.6 each, not both at 1.0.

**Image 1** is required. **Enable image 2** is unchecked by default, and a disabled second image is not decoded, uploaded or wired into any node. With two images, place the scene in image 1 and the person/reference in image 2. Each has an independent aligned/beside/experimental bag-of-features placement and reference boost; scene aligned plus person beside is recommended for identity insertion. Placement controls depend on the live node schema: installations without `ref_position`/`ref_position_a` remain usable with the node's native layout, show a compatibility notice and disable unsupported placement controls. Saved placement settings are retained but not sent until supported. Both grounded encoders receive exactly the same enabled images, including when the negative prompt is empty. The selected VAE is shared by source encodes, the pixel-space patch and output decoding. When supported, `target_latent` is the same empty target used by the sampler, enabling source pre-encoding before sampling. These three optional enhancements are omitted from generation and export when unavailable; required image conditioning is still validated before uploads.

The supplied API graph's connected image-edit path is retained. Its personal/subject-specific extra LoRAs and disconnected legacy LoRA are **not** enabled automatically. The custom `ResolutionSelector` is replaced with equivalent aspect/megapixel/alignment controls that compute explicit native latent dimensions, rounded down so the output never exceeds **2,000,000 pixels**. Alignment supports 8/16/32/64; batch size is 1-8. Denoise is exposed on the sampler but does not convert the empty target into a conventional source-latent I2I workflow. Models, dtype, CLIP device, grounding resolution/system prompt, negative prompt, filename prefix, sampler/scheduler, seeds and seed progression remain editable. Defaults use the source graph's Turbo/Qwen3-VL/Qwen Image VAE, `er_sde`, `beta` and denoise 1.

The live prompt builder includes season/background changes, person/object removal, recoloring, relighting, additions, sign text, outfits, flat lays, restyling, one-image restaging, two-image identity replacement/person insertion and copying an outfit. An example fills editable fields; subsequent field changes rebuild the positive prompt. Manual prompt edits and prompt-only Library imports remain verbatim until a builder field is changed. Two-image examples do not enable image 2 automatically, and an instruction mentioning image 2 is blocked until it is enabled and supplied. Describe visible framing, concrete new clothing/what is removed, and where light lands. Removal examples recommend the explicit **Raw - removals (20 steps / CFG 3)** button rather than silently changing the sampler.

Generation, export, presets and history use the same nested settings. Seed controls and batches apply to every requested execution, uploads occur once per enabled source, only `SaveImage` output 29 is collected, and results retain image 1 for comparisons. Model licensing is not changed by this integration: see the [upstream model terms](https://huggingface.co/conradlocke/krea2-identity-edit), including commercial-use permission requirements.

## MOSS PHOTO

Select **Image Generation > ComfyUI > MOSS > MOSS PHOTO**. See [PHOTO controls and behavior](../features/images-and-characters.md#moss-photo).

PHOTO defaults to Clean, AI writing enabled, 1024 x 768, 25 steps, CFG 3, `er_sde` / `simple`, batch 1 and no LoRAs. Second pass, face/hand fixes, SeedVR2 and general JPEG crunch start disabled. This is a separate graph from the Efficient-sampler MOSS Image workflow below.

Update ComfyUI for MOSS encoders, `EmptyFlux2LatentImage`, `ModelSamplingAuraFlow`, `TextGenerate`, core string/regex/primitive nodes and `er_sde` / `simple` sampling. Install/update:

- [ComfyUI-Kreative-Moss](https://github.com/Lo-res/ComfyUI-Kreative-Moss): `KreativeResolutionFocal`, `KreativeShowText`, `GenTimerLap`.
- [rgthree-comfy](https://github.com/rgthree/rgthree-comfy): source prompt switches.
- [ComfyUI-ProPost](https://github.com/digitaljohn/comfyui-propost): `ProPostFilmGrain`. Core `ImageSharpen` is also required except for Polaroid.
- Optional face/hand fixing: Impact Pack and Impact Subpack (`FaceDetailer`, `UltralyticsDetectorProvider`), with `bbox/face_yolov8m.pt` and `bbox/hand_yolov8s.pt`.
- Optional SeedVR2: `SeedVR2LoadDiTModel`, `SeedVR2LoadVAEModel`, `SeedVR2VideoUpscaler`; source models `seedvr2_ema_3b_fp8_e4m3fn.safetensors` and `ema_vae_fp16.safetensors`. `KreativeDetailMix` comes from [ComfyUI-Kreative-Studio](https://github.com/Lo-res/ComfyUI-Kreative-Studio). First use may load/download the 3.19 GB model through the installed node's own behavior.
- Optional JPEG/iPhone crunch: `KreativeJPEGCrunch` from Kreative Studio.
- Optional experimental IR: [comfyui_aerochrome](https://github.com/Lo-res/comfyui_aerochrome), exposing `AerochromeIRPrep` and `AerochromeIRFilm`.

Default files are `dirtyMoss_bf16.safetensors` in diffusion models, `qwen3.5_9b_int8_convrot.safetensors` and `Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors` in text encoders, and `flux2-vae.safetensors` in VAE. All four LoRAs default to None. Disabling AI writing removes the writer dependency. Disabling an optional stage removes its nodes from generation and export; the app validates only the resulting active graph against live object info.

The supplied graph is adapted for API operation: panel-only controls are translated into actual branch wiring, seed behavior is controlled by the app, model loading is split to avoid an unused writer, stale displayed texts/personal examples are cleared, and final `KreativeKeep` is replaced by standard `SaveImage` output 10 so generated images flow into the normal results/Library system. The first-pass preview is not treated as a final saved output.

## MOSS Image 1.0

Select **Image Generation > ComfyUI > MOSS > MOSS Image**. This preserves the supplied MOSS graph, including `SkipLayerGuidanceDiTSimple`, `Power Lora Loader (rgthree)`, `KSampler (Efficient)` and the explicit `VAEDecode` from sampler output 3. Install/update Efficiency Nodes and rgthree, plus a ComfyUI version that exposes `moss_image` in `CLIPLoader.type`, `EmptyFlux2LatentImage`, and SLG. The selected Efficient sampler must expose `seeds_2` and `beta57` for the source defaults. Missing nodes, weights, enabled LoRAs or sampler choices produce an explicit error before queueing; weights are not downloaded automatically.

Source models are `mossImageINT8INT6_mossImageINT8.safetensors`, `qwen3.5_9b_int8_convrot.safetensors`, and `flux2-vae.safetensors`. All model filenames, weight dtype, CLIP type/device, positive/negative prompts, resolution, batch size, output prefix, SLG layers/range, steps, CFG, sampler/scheduler, denoise, preview method and sampler VAE decode are editable. **Orientation** offers Portrait, Landscape and Square, followed by valid resolution presets aligned to 16 pixels; no side exceeds **1280 px**. Portrait/landscape switching reverses the current dimensions when a matching preset exists. Older saved sizes outside the presets must be reselected explicitly. LoRAs have independent enable and strength controls, with add/remove support. The four source LoRAs and their exact strengths/enabled states are restored by **Restore workflow defaults** (the positive prompt and shared seed are retained).

Defaults: **1280 x 848** (intentionally capped from the source JSON's 1296 x 864), batch 1, 10 steps, CFG 1.2, `seeds_2`, `beta57`, denoise 1, SLG single layer 22 from 0 to 0.5, preview `auto`, VAE decode `true`. Seed controls support fixed, increment, decrement and randomize across generations. The total number of saved images is **Images to Generate x Batch size**. Settings participate in per-model persistence, presets, history and workflow export.

The MOSS Image sampling controls use **1-50 steps** in whole-step increments and **CFG 0-5** in **0.1** increments for fine adjustment, with matching direct numeric inputs. Existing workflow defaults are unchanged.

Live JPEG/PNG previews are displayed when the server emits standard ComfyUI binary preview frames. They are optional: an unsupported or disabled preview does not prevent final images. Only `SaveImage` output is collected, so Efficient sampler preview outputs are not duplicated in the gallery.

**Refine Image (Image-to-Image)** optionally replaces the empty latent with `LoadImage -> ImageScale -> VAEEncode`, using the same selected VAE as the decoder. Upload or drag in an image, or use **Load Source Image from Library**. A source is required while refinement is enabled; a stale source is ignored when it is disabled. The source's proportions determine the canvas instead of the Portrait/Landscape/Square preset. Images are never upscaled: the longest side is capped at 1280, then both dimensions are rounded down to multiples of 16 (which can slightly adjust the ratio). Images too small or too narrow to meet those limits are rejected explicitly.

**Refine denoise** defaults to 0.5, accepts 0 through 1, and retains its value independently of the ordinary T2I denoise. Lower values retain more of the source structure; higher values transform it more. Both the source section and sampler section control the same refine value. Batches larger than one use `RepeatLatentBatch` after encoding, preserving the requested output count. Source nodes, selected weights and enum choices are validated before uploading. Workflow export uses the same image-based graph and uploaded ComfyUI source name. Results retain the original source for comparison.

## Photo Fusion FLUX2

Photo Fusion maps the first portrait to Picture 1 and each remaining portrait to a distinct FLUX2 identity reference. An optional background is encoded as a separate background reference. Uploaded ComfyUI input names are made unique so same-named Library items cannot overwrite one another during parallel multi-image uploads.

## Photo Fusion Qwen Edit

Qwen Edit Photo Fusion maps each input image to exactly one person and uses the existing three-picture Qwen workflow. It therefore supports a maximum of three total inputs: two or three subject portraits, or two portraits plus one background. The interface blocks unsupported combinations instead of silently omitting an image. Its workflow requires `UNETLoader`, `CLIPLoader`, `VAELoader`, `TextEncodeQwenImageEditPlus`, `ModelSamplingAuraFlow`, `CFGNorm`, `ImageScaleToTotalPixels`, and `KSampler`. Lightning presets additionally require a compatible Qwen Image Edit 4-step or 8-step LoRA in ComfyUI.

## Legacy Flux and Qwen

The standard Flux workflow automatically enables `Flux\flux-turbo.safetensors` at strength `1`. The legacy Qwen T2I GGUF workflow always uses 4 steps and CFG `1`, including when Library metadata contains different recommended values; this does not apply to Qwen Image 2.1.

## LTX Director

LTX Director requires the latest WhatDreamsCost LTX Director, ComfyUI-LTXVideo, and ComfyUI-KJNodes packages. GGUF models and text encoders additionally require ComfyUI-GGUF. CacheDiT acceleration requires [ComfyUI-CacheDiT](https://github.com/Jasonzzt/ComfyUI-CacheDiT), which exposes `CacheDiT_LTX2_Optimizer`; restart ComfyUI after installing or updating it so the node appears in `/object_info`.

## Related guides

- [Connections and local services](../connections.md)
- [Image and character generation](../features/images-and-characters.md)
- [MiniMax H3 REF2V](../features/minimax-h3.md)

---

[Back to documentation index](../README.md)
