import type { ComfyModelType, GenerationOptions } from '../types';
import { defaultQwen21Settings } from '../services/qwen21Workflow';
import { defaultKrea2EditSettings } from '../services/krea2EditWorkflow';

export const getImagePromptOnlyUpdate = (prompt: string, options: GenerationOptions, mode: 't2i' | 'i2i'): Partial<GenerationOptions> => {
  if (!prompt.trim()) throw new Error('The selected Library prompt is empty.');
  if (options.provider !== 'comfyui') {
    if (mode === 't2i') return { geminiPrompt: prompt };
    if (options.geminiI2iMode === 'compose') return { geminiComposePrompt: prompt };
    if (options.geminiI2iMode === 'inpaint') {
      if (options.geminiInpaintTask === 'custom') return { geminiInpaintCustomPrompt: prompt };
      if (options.geminiInpaintTask === 'replace' || options.geminiInpaintTask === 'changeColor') return { geminiInpaintTargetPrompt: prompt };
      throw new Error('Choose a Custom Prompt, Replace or Change Color task before importing an inpainting prompt.');
    }
    return { geminiGeneralEditPrompt: prompt };
  }
  if (options.comfyModelType === 'krea2-simple' || options.comfyModelType === 'krea2-raw') return { comfyKreaPrompt: prompt };
  if (options.comfyModelType === 'krea2-edit') return { comfyKrea2Edit: { ...(options.comfyKrea2Edit || defaultKrea2EditSettings()), prompt } };
  if (options.comfyModelType === 'flux2-simple') return { comfyFlux2Prompt: prompt };
  if (options.comfyModelType === 'flux2-edit') return { comfyFlux2EditPrompt: prompt };
  if (options.comfyModelType === 'qwen21-t2i' || options.comfyModelType === 'qwen21-turbo') {
    const mode = options.comfyModelType === 'qwen21-turbo' ? 'turbo' : 't2i';
    const key = mode === 'turbo' ? 'comfyQwen21Turbo' : 'comfyQwen21T2i';
    return { [key]: { ...(options[key] || defaultQwen21Settings(mode)), prompt } };
  }
  return { comfyPrompt: prompt };
};

export const PROMPT_T2I_WORKFLOWS: Array<{ id: ComfyModelType; label: string }> = [
  { id: 'sd1.5', label: 'SD 1.5' },
  { id: 'sdxl', label: 'SDXL' },
  { id: 'flux', label: 'FLUX' },
  { id: 'qwen-t2i-gguf', label: 'QWEN' },
  { id: 'qwen21-t2i', label: 'QWEN 2.1 T2I' },
  { id: 'qwen21-turbo', label: 'QWEN 2.1 T2I (Turbo)' },
  { id: 'z-image', label: 'Z-Image' },
  { id: 'flux2-simple', label: 'FLUX2' },
  { id: 'krea2-simple', label: 'KREA2' },
  { id: 'moss-image', label: 'MOSS Image' },
  { id: 'moss-photo', label: 'MOSS PHOTO' },
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