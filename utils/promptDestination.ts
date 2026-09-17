import type { ComfyModelType, GenerationOptions } from '../types';

export const PROMPT_T2I_WORKFLOWS: Array<{ id: ComfyModelType; label: string }> = [
  { id: 'sd1.5', label: 'SD 1.5' },
  { id: 'sdxl', label: 'SDXL' },
  { id: 'flux', label: 'FLUX' },
  { id: 'qwen-t2i-gguf', label: 'QWEN' },
  { id: 'z-image', label: 'Z-Image' },
  { id: 'flux2-simple', label: 'FLUX2' },
  { id: 'krea2-simple', label: 'KREA2' },
];

export const getPromptDestinationOptions = (
  prompt: string,
  workflow: ComfyModelType,
): Partial<GenerationOptions> & { comfyModelType: ComfyModelType } => {
  const updates: Partial<GenerationOptions> & { comfyModelType: ComfyModelType } = {
    provider: 'comfyui',
    comfyModelType: workflow,
    comfyPrompt: prompt,
  };

  if (workflow === 'flux2-simple') {
    Object.assign(updates, {
      comfyFlux2Prompt: prompt,
      comfySteps: 10,
      comfyCfg: 1,
      comfySampler: 'euler',
    });
  }
  if (workflow === 'krea2-simple') {
    Object.assign(updates, {
      comfyKreaPrompt: prompt,
      comfyKreaNegativePrompt: '',
      comfyKreaUnet: 'krea2_raw_fp8_scaled.safetensors',
      comfyKreaClip: 'qwen3vl_4b_fp8_scaled.safetensors',
      comfyKreaVae: 'qwen_image_vae.safetensors',
      comfyKreaResolution: '832x1216',
      comfyKreaUseLora: true,
      comfyKreaLora1Name: 'KREA\\krea2_turbo_lora_rank_64_bf16.safetensors',
      comfyKreaLora1Strength: 0.6,
      comfyKreaLora2Name: 'KREA\\snofs_krea_v1_nostrip.safetensors',
      comfyKreaLora2Strength: 1,
      comfySteps: 10,
      comfyCfg: 1,
      comfySampler: 'er_sde',
      comfyScheduler: 'beta',
    });
  } else if (workflow === 'krea2-raw') {
    updates.comfyKreaPrompt = prompt;
  }
  return updates;
};