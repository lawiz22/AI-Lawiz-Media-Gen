# ComfyUI workflow dependencies

[Documentation index](../README.md) | [Project overview](../../README.md)

This reference preserves the model-family notes formerly grouped under Qwen requirements. For the full node inventory, use the [required-node list](../../COMFYUI_REQUIRED_NODES.txt). Model licenses and compatibility must be checked for the exact installed weights.

## On this page

- [KREA2 Simple](#krea2-simple)
- [KREA2 RAW](#krea2-raw)
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
