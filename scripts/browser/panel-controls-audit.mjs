// Usage: node scripts/browser/panel-controls-audit.mjs
// Lists every form control of a group of panels (name, kind, value, choices, disabled) in the real application,
// so a panel can be compared before and after a UI migration.
//   LAWIZ_AUDIT_OUT=file.json       writes the inventory
//   LAWIZ_AUDIT_BASELINE=file.json  compares the current inventory with a saved one
//   LAWIZ_AUDIT_GROUP=fun           group of panels to visit (see GROUPS)
//   LAWIZ_AUDIT_EXERCISE=1          also changes every listbox and number field and checks that the new value is shown
//   LAWIZ_AUDIT_TEXT=1              with EXERCISE: also types into every text field and editable prompt box
//   LAWIZ_AUDIT_THEME=studio-light  application theme used for the visit and the screenshots
//   LAWIZ_AUDIT_CONTRAST=file.json  also measures the contrast of every visible text against its background and writes the texts under 4.5:1
//   LAWIZ_AUDIT_MEDIA=folder        folder holding sample.mp4 and sample.wav for the `upload` steps (default: TEMP); without them these steps are skipped
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR. ComfyUI is simulated.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';

// Each panel: the tab to activate, the buttons that lead to it, images to upload first, and the variants (extra clicks) to inventory.
const GROUPS = {
    fun: { tab: 'fun', panels: [
        { name: 'Photo Fusion', open: ['Photo Fusion'], upload: 2, variants: [{ name: 'flux2', button: 'FLUX2' }, { name: 'qwen', button: 'QWEN-Edit' }, { name: 'gemini', button: 'Gemini' }, { name: 'mammouth', button: 'Mammouth' }] },
        { name: 'Past Forward', open: ['Past Forward'], variants: [{ name: 'flux2', button: 'FLUX2' }, { name: 'qwen', button: 'QWEN-Edit' }, { name: 'gemini', button: 'Gemini' }, { name: 'mammouth', button: 'Mammouth' },
            // Kept last: they change local choices that the engine variants above must not see.
            { name: 'woman reimagined', button: 'FLUX2', steps: [{ button: 'Woman' }, { checkbox: /Reimagine the scene/ }] },
            { name: 'historical', steps: [{ button: /^Historical Cameo/ }] }] },
        { name: 'Swap Anything', open: ['Swap Anything'], variants: [{ name: 'default' }] },
        { name: 'Swap a Person', open: ['Swap a Person'], variants: [{ name: 'default' }, { name: 'lanpaint', radio: 'LanPaint (Head Swap)' }] },
        { name: 'Stylise Anything', open: ['Stylise Anything'], variants: [{ name: 'default' }] },
    ] },
    // One panel, one variant per workflow: each variant continues from the state left by the previous one.
    image: { tab: 'image-generator', panels: [{ name: 'Image', open: [], variants: [
        { name: 'sd1.5 t2i', steps: [{ button: 'ComfyUI' }, { tab: 'SD 1.5' }, { tab: 'T2I' }] },
        { name: 'sd1.5 refine', steps: [{ checkbox: /Enable Refine/ }] },
        { name: 'sd1.5 i2i', steps: [{ tab: 'I2I' }] },
        { name: 'sdxl', steps: [{ tab: 'SDXL' }] },
        { name: 'qwen t2i', steps: [{ tab: 'QWEN' }, { tab: 'T2I' }] },
        { name: 'qwen edit', steps: [{ tab: 'I2I' }] },
        { name: 'qwen21 t2i', steps: [{ tab: 'QWEN 2.1' }, { tab: 'T2I' }] },
        { name: 'qwen21 turbo', steps: [{ tab: 'T2I (Turbo)' }] },
        { name: 'z-image', steps: [{ tab: 'Z-Image' }] },
        { name: 'flux2 simple', steps: [{ tab: 'FLUX2' }, { tab: 'FLUX2 SIMPLE' }] },
        { name: 'flux2 edit', steps: [{ tab: 'FLUX2 Edit' }] },
        { name: 'krea2 simple', steps: [{ tab: 'KREA2' }, { tab: 'SIMPLE KREA' }] },
        { name: 'krea2 raw', steps: [{ tab: 'KREA2 RAW' }] },
        { name: 'krea2 edit', steps: [{ tab: 'I2I Edit / Identity' }] },
        { name: 'moss image', steps: [{ tab: 'MOSS' }, { tab: 'MOSS Image' }] },
        { name: 'moss photo', steps: [{ tab: 'MOSS PHOTO' }] },
        { name: 'mammouth t2i', steps: [{ button: 'Mammouth' }, { button: 't2i' }] },
        { name: 'mammouth i2i', steps: [{ button: 'i2i' }] },
        { name: 'gemini t2i', steps: [{ button: 'Gemini' }, { button: 't2i' }] },
        { name: 'gemini i2i', steps: [{ button: 'i2i' }] },
        { name: 'gemini inpaint', steps: [{ button: 'Inpaint/Outpaint' }] },
        { name: 'gemini compose', steps: [{ button: 'compose' }] },
    ] }] },
    character: { tab: 'character-generator', panels: [{ name: 'Character', open: [], variants: [
        // The old Advanced toggle stays open for the next variants; it no longer exists once the sections are accordions.
        { name: 'qwen', steps: [{ button: 'ComfyUI' }, { tab: 'QWEN' }, { button: /^Advanced/, optional: true }] },
        { name: 'flux2 angles', steps: [{ tab: 'FLUX2' }, { tab: 'Character Angles' }] },
        { name: 'flux2 blazing', steps: [{ tab: 'Blazing Fast character' }] },
        { name: 'qwen21 sheet', steps: [{ tab: 'QWEN 2.1' }, { tab: 'Character Sheet' }] },
        { name: 'qwen21 create', steps: [{ tab: 'Create Character' }] },
        { name: 'mammouth', steps: [{ button: 'Mammouth' }] },
        { name: 'gemini', steps: [{ button: 'Gemini' }] },
    ] }] },
    scene: { tab: 'scene-variation', panels: [{ name: 'Scene', open: [], variants: [
        { name: 'variation', steps: [{ tab: 'Scene Variation' }] },
        { name: 'variation qwen', steps: [{ button: 'Qwen 2.1' }] },
        { name: 'character in a scene', steps: [{ tab: 'Character in a Scene' }] },
        { name: 'creation suite', steps: [{ tab: 'Creation suite' }] },
        { name: 'clothes switcher', steps: [{ tab: 'Clothes Switcher' }] },
    ] }] },
    qwen21: { tab: 'image-generator', panels: [{ name: 'Qwen21', open: [], variants: [
        { name: 'multi', steps: [{ button: 'ComfyUI' }, { tab: 'QWEN 2.1' }, { tab: 'I2I Multi Images' }] },
        { name: 'consistency', steps: [{ tab: 'I2I Consistency' }] },
        { name: 'turbo', steps: [{ tab: 'I2I Turbo' }] },
        { name: 'remove background', steps: [{ tab: 'Remove Background' }] },
    ] }] },
    video: { tab: 'video', panels: [{ name: 'Video', open: [], variants: [
        { name: 'prompt', steps: [{ button: 'Video Prompt Generator' }] },
        { name: 'ltx director', steps: [{ button: 'LTX' }, { button: 'LTX Director' }] },
        { name: 'ltx director advanced', steps: [{ button: 'Advanced', optional: true }] },
        { name: 'ltx director clip', steps: [{ button: '+ Prompt clip' }] },
        { name: 'ltx ripple', steps: [{ button: 'LTX-Ripple-FFAF' }] },
        { name: 'ltx audio-sync', steps: [{ button: 'LTX 2.5 Audio-Sync' }] },
        { name: 'h3 minimax', steps: [{ button: 'H3' }, { button: 'Minimax REF2v H3' }] },
        { name: 'h3 ultrafast', steps: [{ button: 'Ultrafast' }] },
        { name: 'h3 advanced', steps: [{ button: 'MiniMax Advanced' }] },
        { name: 'h3 character swap', steps: [{ button: 'Character Swap H3' }] },
    ] }] },
    tts: { tab: 'tts', panels: [{ name: 'TTS', open: [], variants: [
        { name: 'voice clone', steps: [{ button: 'TTS Voice Clone' }] },
        { name: 'voice clone upload', steps: [{ button: 'My voices' }, { upload: 'audio' }] },
        { name: 'advanced', steps: [{ button: 'TTS Advanced' }, { button: 'Engine settings', optional: true }] },
        { name: 'advanced dialogue', steps: [{ button: 'dialogue' }] },
    ] }] },
    prompt: { tab: 'prompt-generator', panels: [{ name: 'Prompt', open: [], variants: [
        { name: 'from image', steps: [{ button: 'Prompt from Image' }, { button: 'Gemini' }] },
        { name: 'from image ollama', steps: [{ button: 'Ollama' }] },
        { name: 'from image florence', steps: [{ button: 'Florence2' }] },
        { name: 'background', steps: [{ button: 'Gemini' }, { button: 'Extract Background' }] },
        { name: 'subject', steps: [{ button: 'Subject / Object' }] },
        { name: 'soup', steps: [{ button: 'Magical Prompt Soup' }] },
    ] }] },
    extractor: { tab: 'extractor-tools', panels: [{ name: 'Extractor', open: [], variants: [
        { name: 'clothes', steps: [{ button: 'Clothes' }, { button: 'Gemini' }] },
        { name: 'clothes ollama', steps: [{ button: 'ollama' }] },
        { name: 'clothes mammouth', steps: [{ button: 'Mammouth' }] },
        { name: 'hair', steps: [{ button: 'Hair' }] },
        { name: 'objects', steps: [{ button: 'Objects' }] },
        { name: 'poses json', steps: [{ button: 'Poses' }, { button: 'ControlNet JSON' }] },
        { name: 'poses mannequin', steps: [{ button: 'Mannequin Image' }] },
        { name: 'font flux2', steps: [{ button: 'Font' }, { button: 'Flux2' }] },
    ] }] },
    logo: { tab: 'logo-theme-generator', panels: [{ name: 'Logo', open: [], variants: [
        { name: 'logo', steps: [{ button: 'Logo Generator' }] },
        { name: 'banner', steps: [{ button: 'Banner Generator' }] },
        { name: 'album cover', steps: [{ button: 'Album Cover Generator' }] },
    ] }] },
    tools: { tab: 'video-utils', panels: [{ name: 'Tools', open: [], variants: [
        { name: 'frames', steps: [{ tab: 'Frame Extractor' }, { upload: 'video' }] },
        { name: 'clips', steps: [{ tab: 'Video Extractor' }] },
        { name: 'audio extractor', steps: [{ tab: 'Audio Extractor' }, { upload: 'video' }] },
        { name: 'merge', steps: [{ tab: 'Merge Video' }, { upload: 'video' }] },
        { name: 'reference maker', steps: [{ tab: 'Reference Maker' }, { upload: 'image' }] },
        { name: 'colors', steps: [{ tab: 'Color Palette Extractor' }, { upload: 'image' }] },
        { name: 'resize crop image', steps: [{ tab: 'Resize & Crop' }, { upload: 'image' }] },
        { name: 'resize crop video', steps: [{ tab: 'Video' }, { upload: 'video' }] },
        { name: 'resize crop video custom', steps: [{ button: 'Custom (px)', optional: true }] },
        { name: 'outpaint', steps: [{ tab: 'Outpaint' }, { upload: 'image' }] },
        { name: 'outpaint by side', steps: [{ button: 'By side' }] },
        { name: 'upscale seedvr2', steps: [{ tab: 'Upscale' }, { button: 'Upscale SeedVR2' }, { button: 'Advanced', optional: true }] },
        { name: 'upscale z-image', steps: [{ button: 'Z-Image Creative Upscale' }] },
        { name: 'voice recorder', steps: [{ tab: 'Voice Recorder' }] },
    ] }] },
    library: { tab: 'library', panels: [{ name: 'Library', open: [], variants: [
        { name: 'default' },
        { name: 'image and character filters', steps: [{ button: /^Images/ }, { button: /^Characters/ }] },
    ] }] },
    models: { tab: 'civitai', panels: [{ name: 'Models', open: [], variants: [
        { name: 'my library', steps: [{ button: 'My Library' }] },
        { name: 'civitai', steps: [{ button: 'Civitai' }] },
        { name: 'archive', steps: [{ button: 'ArchiveCivit' }] },
        { name: 'library tools', steps: [{ button: 'Library Tools' }] },
    ] }] },
    styles: { tab: 'style-gallery', panels: [{ name: 'Styles', open: [], variants: [
        { name: 'gallery' },
        { name: 'new style', steps: [{ button: '+ New style' }] },
    ] }] },
    // Opened from the header over a tab that has few controls of its own.
    settings: { tab: 'prompt-generator', panels: [{ name: 'Settings', open: [], variants: [
        { name: 'connection', steps: [{ page: 'Connection Settings' }] },
        { name: 'visual', steps: [{ press: 'Escape' }, { page: 'Visual Settings' }] },
    ] }] },
};
// Controls are read in the page content and in any open dialog (some are rendered outside <main>).
const ROOTS = ['main', 'dialog[open]', '[role="dialog"]'];
const scoped = (...controls) => ROOTS.flatMap(root => controls.map(control => `${root} ${control}`)).join(', ');
const mediaDir = process.env.LAWIZ_AUDIT_MEDIA || process.env.TEMP || os.tmpdir();
const samples = {
    image: { name: 'sample.png', mimeType: 'image/png' },
    video: { name: 'sample.mp4', mimeType: 'video/mp4', path: path.join(mediaDir, 'sample.mp4') },
    audio: { name: 'sample.wav', mimeType: 'audio/wav', path: path.join(mediaDir, 'sample.wav') },
};
const group = GROUPS[process.env.LAWIZ_AUDIT_GROUP || 'fun'];
if (!group) throw new Error(`Unknown group. Available: ${Object.keys(GROUPS).join(', ')}`);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    sessionStorage.setItem('currentUser', JSON.stringify({ username: 'audit', role: 'admin' }));
    localStorage.setItem('comfyui_url', 'http://comfy.test');
    const list = (...values) => [values];
    const models = list('flux2\\flux-2-klein-4b-fp8.safetensors', 'flux2\\flux2Klein9BInt8_v10.safetensors', 'qwen\\qwen_image_edit.safetensors', 'krea2_turbo_fp8_scaled.safetensors', 'z_image_turbo_bf16.safetensors', 'qwen_image_2.1_fp8.safetensors', 'moss_image_fp8.safetensors',
        'qwen\\qwen_image_edit_2511.safetensors', 'krea2_raw_fp8_scaled.safetensors', 'z_image_base.safetensors');
    const loras = list('FLUX2\\style-a.safetensors', 'FLUX2\\style-b.safetensors', 'QWEN\\lightning-4steps.safetensors', 'SD15\\detail.safetensors', 'SDXL\\detail-xl.safetensors', 'ZIT\\z-image-look.safetensors', 'KREA\\krea-look.safetensors');
    const samplers = list('euler', 'euler_ancestral', 'er_sde'), schedulers = list('simple', 'beta', 'beta57', 'normal');
    const clips = list('qwen_3_4b.safetensors', 'qwen38BFluxKlein9BTE_38b.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors', 'clip_l.safetensors');
    const catalog = {
        KSampler: { input: { required: { sampler_name: samplers, scheduler: schedulers } } },
        KSamplerSelect: { input: { required: { sampler_name: samplers } } },
        BasicScheduler: { input: { required: { scheduler: schedulers } } },
        'KSampler (Efficient)': { input: { required: { sampler_name: samplers, scheduler: schedulers, preview_method: list('auto', 'none'), vae_decode: list('true', 'false') } } },
        UNETLoader: { input: { required: { unet_name: models, weight_dtype: list('default', 'fp8_e4m3fn') } } },
        UnetLoaderGGUF: { input: { required: { unet_name: list('flux2\\klein9b-Q5.gguf', 'qwen\\qwen-image-Q5.gguf', 'qwen\\qwen-image-Q8.gguf') } } },
        CLIPLoader: { input: { required: { clip_name: clips, type: list('flux2', 'qwen_image'), device: list('default', 'cpu') } } },
        CLIPLoaderGGUF: { input: { required: { clip_name: list('t5\\umt5-xxl-Q5.gguf', 'qwen\\qwen3-4b-Q5.gguf') } } },
        DualCLIPLoader: { input: { required: { clip_name1: clips } } },
        VAELoader: { input: { required: { vae_name: list('flux2-vae.safetensors', 'qwen_image_vae.safetensors', 'ae.safetensors') } } },
        CheckpointLoaderSimple: { input: { required: { ckpt_name: list('sam3.1_multiplex_fp16.safetensors', 'SDXL\\base.safetensors', 'SD15\\dream.safetensors', 'SDXL\\sdxl-second.safetensors', 'sd1.5\\classic.safetensors', 'sd1.5\\second.safetensors') } } },
        UltralyticsDetectorProvider: { input: { required: { model_name: list('bbox/face_yolov8m.pt', 'bbox/hand_yolov8s.pt') } } },
        SAMLoader: { input: { required: { model_name: list('sam_vit_b_01ec64.pth', 'sam_vit_l.pth') } } },
        ModelAttentionBackend: { input: { required: { attention: list('auto', 'sdpa') } } },
        LoraLoader: { input: { required: { lora_name: loras } } },
        LoraLoaderModelOnly: { input: { required: { lora_name: loras } } },
        LanPaint_KSampler: { input: { required: { sampler_name: samplers, scheduler: schedulers, LanPaint_PromptMode: list('Image First', 'Prompt First') } } },
        CacheDiT_Model_Optimizer: { input: { required: { model_type: list('Auto', 'Flux', 'Qwen') } } },
    };
    for (const node of ['ReferenceLatent', 'Flux2Scheduler', 'EmptyFlux2LatentImage', 'ModelSamplingAuraFlow', 'CFGNorm', 'TextEncodeQwenImageEditPlus', 'ImageScaleToTotalPixels']) catalog[node] = { input: { required: {} } };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
        const target = String(url);
        if (!target.startsWith('http://comfy.test')) return originalFetch(url, init);
        const route = target.slice('http://comfy.test'.length).split('?')[0];
        if (route === '/object_info') return Response.json(catalog);
        if (route.startsWith('/object_info/')) { const node = decodeURIComponent(route.slice('/object_info/'.length)); return Response.json({ [node]: catalog[node] || { input: { required: {} } } }); }
        return Response.json({});
    };
    window.WebSocket = class {
        static OPEN = 1; static CONNECTING = 0; readyState = 1;
        constructor() { setTimeout(() => this.onopen?.(), 0); }
        send() {} close() { this.readyState = 3; } addEventListener() {} removeEventListener() {}
    };
});

const inventory = () => page.evaluate(controls => {
    const text = value => (value || '').replace(/\s+/g, ' ').trim();
    const visible = node => node.offsetParent !== null || getComputedStyle(node).position === 'fixed';
    // Visible label of a control: its own label element without the text of the control it wraps.
    const labelOf = node => {
        const label = node.labels?.[0] || node.closest('label');
        if (!label) return '';
        const copy = label.cloneNode(true);
        copy.querySelectorAll('select, textarea, input, button, output').forEach(child => child.remove());
        return text(copy.textContent);
    };
    return [...document.querySelectorAll(controls)].filter(visible).map(node => {
        const kind = node.tagName === 'INPUT' ? node.type : node.tagName === 'BUTTON' ? 'listbox' : node.tagName.toLowerCase();
        const entry = { kind, label: labelOf(node), aria: node.getAttribute('aria-label') || '', disabled: !!node.disabled || !!node.closest('fieldset:disabled') };
        if (kind === 'range' || kind === 'number') entry.range = [node.min, node.max, node.step].join(' / ');
        if (kind === 'checkbox' || kind === 'radio') entry.value = node.checked;
        else if (kind === 'file') entry.value = '';
        else if (kind === 'listbox') entry.value = text(node.textContent);
        else entry.value = node.value;
        if (kind === 'select-one') entry.kind = 'select';
        if (node.tagName === 'SELECT') { entry.kind = 'select'; entry.value = text(node.selectedOptions[0]?.textContent); entry.choices = [...node.options].map(option => text(option.textContent)); }
        if (!entry.label && !entry.aria) entry.label = node.placeholder ? `[placeholder] ${node.placeholder}` : node.id ? `[id] ${node.id}` : '';
        return entry;
    });
}, scoped('select', 'textarea', 'input', 'button[aria-haspopup="listbox"]'));
// Opens every collapsed section of the visible panel, twice for nested ones.
const expand = async () => {
    for (let pass = 0; pass < 2; pass++) {
        await page.evaluate(([summaries, toggles]) => {
            const visible = node => node.offsetParent !== null;
            document.querySelectorAll(summaries).forEach(summary => { if (visible(summary)) summary.click(); });
            document.querySelectorAll(toggles).forEach(button => { if (visible(button)) button.click(); });
        }, [scoped('details:not([open]) > summary'), scoped('button[aria-expanded="false"]:not([aria-haspopup])')]);
        await page.waitForTimeout(250);
    }
};

// A control wired to its state accepts a new value and still shows it after the re-render.
const exercise = async () => {
    const failures = []; let changed = 0;
    const name = handle => handle.evaluate(node => node.getAttribute('aria-label') || node.labels?.[0]?.textContent?.trim().slice(0, 40) || node.closest('label')?.textContent?.trim().slice(0, 40) || node.id);
    for (const handle of await page.locator(scoped('input[type="number"]', 'input[type="range"]', 'select', 'button[aria-haspopup="listbox"]')).elementHandles()) {
        if (!await handle.evaluate(node => node.isConnected && node.offsetParent !== null && !node.disabled && !node.closest('fieldset:disabled'))) continue;
        const tag = await handle.evaluate(node => node.tagName === 'INPUT' && node.type === 'range' ? 'RANGE' : node.tagName), label = await name(handle);
        try {
            if (tag === 'RANGE') {
                const before = await handle.inputValue();
                await handle.focus();
                await page.keyboard.press(await handle.evaluate(node => Number(node.value) >= Number(node.max) ? 'ArrowLeft' : 'ArrowRight')); await page.waitForTimeout(80);
                if (await handle.inputValue() === before) failures.push(`${label || 'slider'}: the slider did not move from ${before}`);
            } else if (tag === 'INPUT') {
                const next = await handle.evaluate(node => {
                    const value = Number(node.value), step = Number(node.step) > 0 ? Number(node.step) : 1, max = node.max === '' ? Infinity : Number(node.max);
                    return String(+(value + step <= max ? value + step : value - step).toFixed(6));
                });
                await handle.fill(next); await handle.evaluate(node => node.blur()); await page.waitForTimeout(80);
                if (Number(await handle.inputValue()) !== Number(next)) failures.push(`${label}: typed ${next}, shows ${await handle.inputValue()}`);
            } else if (tag === 'SELECT') {
                // "Custom" entries only reflect manual edits; choosing them is a deliberate no-op.
                const choices = await handle.evaluate(node => [...node.options].filter(option => !option.disabled && option.value !== node.value && option.value !== 'custom').map(option => option.value));
                if (!choices.length) continue;
                // A workflow restores its own model family: one accepted alternative is enough.
                let shown;
                for (const next of choices) {
                    await handle.selectOption(next); await page.waitForTimeout(80);
                    shown = await handle.evaluate(node => node.isConnected) ? await handle.inputValue() : next;
                    if (shown === next) break;
                }
                if (!choices.includes(shown)) failures.push(`${label}: no other choice is kept, shows ${shown}`);
            } else {
                const before = (await handle.textContent()).trim();
                let accepted = false, count = 1;
                for (let index = 0; index < count && !accepted; index++) {
                    await handle.click();
                    const choices = page.locator('[role="listbox"] [role="option"]:not([aria-disabled="true"]):not([aria-selected="true"])');
                    count = await choices.count();
                    if (index >= count) { await page.keyboard.press('Escape'); break; }
                    const text = (await choices.nth(index).textContent()).trim();
                    await choices.nth(index).click(); await page.waitForTimeout(80);
                    const after = (await handle.textContent()).trim();
                    accepted = after.includes(text) && after !== before;
                }
                if (!count) continue;
                if (!accepted) failures.push(`${label}: no other choice is kept, shows ${(await handle.textContent()).trim()}`);
            }
            changed++;
        } catch (error) { failures.push(`${label}: ${String(error.message).split('\n')[0]}`); }
    }
    if (process.env.LAWIZ_AUDIT_TEXT) for (const handle of await page.locator(scoped('textarea:not([readonly])', 'input[type="text"]:not([readonly])')).elementHandles()) {
        if (!await handle.evaluate(node => node.isConnected && node.offsetParent !== null && !node.disabled && !node.closest('fieldset:disabled'))) continue;
        const label = await name(handle), next = `${await handle.inputValue()} typed`;
        try {
            await handle.fill(next); await page.waitForTimeout(80);
            if (await handle.inputValue() !== next) failures.push(`${label}: typed text is not kept`);
            changed++;
        } catch (error) { failures.push(`${label}: ${String(error.message).split('\n')[0]}`); }
    }
    return { changed, failures };
};

// Loads a sample file into the first file input of the visible panel that accepts this kind of media.
const upload = async kind => {
    const sample = samples[kind];
    if (sample.path && !existsSync(sample.path)) { console.log(`  (no ${sample.name} in ${mediaDir}: upload skipped)`); return; }
    const buffer = sample.path ? readFileSync(sample.path) : Buffer.from(await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const context = canvas.getContext('2d');
        ['#c2410c', '#0f766e', '#1d4ed8', '#facc15'].forEach((color, index) => { context.fillStyle = color; context.fillRect(index % 2 * 320, Math.floor(index / 2) * 240, 320, 240); });
        return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const index = await page.evaluate(media => [...document.querySelectorAll('main input[type="file"]')].findIndex(node =>
        !node.disabled && (node.accept || '').includes(media) && (node.offsetParent !== null || node.parentElement.offsetParent !== null)), kind);
    if (index < 0) throw new Error(`No visible ${kind} file input`);
    await page.locator('main input[type="file"]').nth(index).setInputFiles({ name: sample.name, mimeType: sample.mimeType, buffer });
    await page.waitForTimeout(1500);
};

// WCAG contrast of every visible text of the page against the background painted behind it. Disabled, dimmed and over-media texts are left out.
const contrast = () => page.evaluate(() => {
    const parse = value => {
        const srgb = value.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
        if (srgb) return [srgb[1] * 255, srgb[2] * 255, srgb[3] * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
        const rgb = value.match(/^rgba?\(([^)]+)\)$/);
        if (!rgb) return null;
        const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const over = (top, under) => [0, 1, 2].map(index => top[index] * top[3] + under[index] * (1 - top[3]));
    const luminance = color => { const [r, g, b] = color.map(value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const backdrop = node => {
        const layers = [];
        for (let current = node; current; current = current.parentElement) {
            const style = getComputedStyle(current);
            if (style.backgroundImage !== 'none') return null;
            const color = parse(style.backgroundColor);
            if (color && color[3] > 0) { layers.push(color); if (color[3] === 1) break; }
            if (style.position === 'absolute' && current.parentElement?.querySelector('img, video, canvas')) return null;
        }
        return layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255]);
    };
    const dimmed = node => { for (let current = node; current; current = current.parentElement) if (Number(getComputedStyle(current).opacity) < 1) return true; return false; };
    const elements = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.replace(/\s+/g, ' ').trim(), element = node.parentElement;
        if (text && !elements.has(element) && !/^(OPTION|SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(element.tagName)) elements.set(element, text);
    }
    for (const control of document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]), textarea, select')) {
        const text = control.tagName === 'SELECT' ? control.selectedOptions[0]?.textContent : control.value;
        if (text && text.trim()) elements.set(control, text.trim());
    }
    const low = []; let checked = 0;
    for (const [element, text] of elements) {
        const box = element.getBoundingClientRect();
        if (box.width < 2 || box.height < 2 || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        if (element.closest(':disabled, [aria-disabled="true"], [aria-hidden="true"]') || dimmed(element)) continue;
        const style = getComputedStyle(element), ink = parse(style.color), behind = backdrop(element);
        if (!ink || !behind || style.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;
        checked++;
        const shown = over(ink, behind), [light, dark] = [luminance(shown), luminance(behind)].sort((a, b) => b - a);
        const ratio = (light + 0.05) / (dark + 0.05);
        if (ratio < 4.5) low.push({ ratio: +ratio.toFixed(2), ink: shown.map(Math.round).join(','), behind: behind.map(Math.round).join(','), text: text.slice(0, 40), tag: element.tagName.toLowerCase(), classes: String(element.getAttribute('class') || '').slice(0, 160) });
    }
    return { checked, low };
});

const result = {}, exercised = {}, contrasts = {};
try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Library', exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async ([tab, theme]) => {
        const served = await (await fetch('/index.tsx')).text();
        const { store } = await import(served.match(/from "(\/store\/store\.ts[^"]*)"/)[1]);
        const app = await import((await (await fetch('/App.tsx')).text()).match(/from "(\/store\/appSlice\.ts[^"]*)"/)[1]);
        store.dispatch(app.setActiveTab(tab));
        if (theme) store.dispatch(app.setTheme(theme));
    }, [group.tab, process.env.LAWIZ_AUDIT_THEME || '']);
    await page.waitForTimeout(500);
    for (const panel of group.panels) {
        for (const name of panel.open) await page.locator('main').getByRole('button', { name, exact: true }).first().click();
        await page.waitForTimeout(400);
        if (panel.upload) {
            // File inputs are usually hidden: the one of the visible panel is the one whose parent is displayed.
            const index = await page.evaluate(() => [...document.querySelectorAll('main input[type="file"]')].findIndex(node => node.parentElement.offsetParent !== null));
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
            await page.locator('main input[type="file"]').nth(index).setInputFiles(Array.from({ length: panel.upload }, (_, n) => ({ name: `person-${n + 1}.png`, mimeType: 'image/png', buffer: png })));
            await page.waitForTimeout(800);
        }
        for (const variant of panel.variants) {
            if (variant.radio) { await page.locator('main').getByRole('radio', { name: variant.radio }).first().check(); await page.waitForTimeout(300); }
            if (variant.button) { await page.locator('main').getByRole('button', { name: variant.button, exact: true }).first().click(); await page.waitForTimeout(500); }
            for (const step of variant.steps || []) {
                if (step.optional && !await page.locator('main').getByRole('button', { name: step.button, exact: typeof step.button === 'string' }).count()) continue;
                if (step.upload) await upload(step.upload);
                if (step.page) await page.getByRole('button', { name: step.page, exact: true }).first().click();
                if (step.press) await page.keyboard.press(step.press);
                if (step.tab) await page.locator('main').getByRole('tab', { name: step.tab, exact: true }).first().click();
                if (step.button) await page.locator(ROOTS.join(', ')).getByRole('button', { name: step.button, exact: typeof step.button === 'string' }).first().click();
                if (step.checkbox) await page.locator('main').getByRole('checkbox', { name: step.checkbox }).first().check();
                await page.waitForTimeout(300);
            }
            await expand();
            result[`${panel.name} / ${variant.name}`] = await inventory();
            if (process.env.LAWIZ_AUDIT_CONTRAST) contrasts[`${panel.name} / ${variant.name}`] = await contrast();
            if (process.env.LAWIZ_SCREENSHOT_DIR) await page.screenshot({ fullPage: true, path: path.join(process.env.LAWIZ_SCREENSHOT_DIR, `${panel.name} - ${variant.name}.png`.replace(/\s+/g, '-').toLowerCase()) });
            if (process.env.LAWIZ_AUDIT_EXERCISE) exercised[`${panel.name} / ${variant.name}`] = await exercise();
        }
    }
} finally { await browser.close(); }

const describe = entry => `${entry.kind.padEnd(9)} ${(entry.label || entry.aria || '(no name)').slice(0, 60).padEnd(60)} = ${String(JSON.stringify(entry.value)).slice(0, 50)}${entry.range ? ` <${entry.range}>` : ''}${entry.choices ? ` [${entry.choices.length} choices]` : ''}${entry.disabled ? ' (disabled)' : ''}`;
if (process.env.LAWIZ_AUDIT_OUT) writeFileSync(process.env.LAWIZ_AUDIT_OUT, JSON.stringify(result, null, 1));
const baseline = process.env.LAWIZ_AUDIT_BASELINE ? JSON.parse(readFileSync(process.env.LAWIZ_AUDIT_BASELINE, 'utf8')) : null;
// Sliders show their value in the label, and kit controls prefix the workflow name: compare on the bare name.
const bare = (entry, panel) => (entry.label || entry.aria).replace(/:\s*[-\d.]+\s*(px|MP|%)?(\s*\(.*\))?$/, '').replace(new RegExp(`^${panel.split(' / ')[0]} `, 'i'), '').toLowerCase();
for (const [panel, entries] of Object.entries(result)) {
    const kinds = entries.reduce((counts, entry) => ({ ...counts, [entry.kind]: (counts[entry.kind] || 0) + 1 }), {});
    console.log(`\n${panel}: ${entries.length} controls ${JSON.stringify(kinds)}`);
    if (exercised[panel]) {
        console.log(`  ${exercised[panel].failures.length ? 'FAIL' : 'PASS'}  ${exercised[panel].changed} listboxes, sliders and number fields accept and show a new value${exercised[panel].failures.length ? `: ${JSON.stringify(exercised[panel].failures)}` : ''}`);
        if (exercised[panel].failures.length) process.exitCode = 1;
    }
    if (!baseline) { for (const entry of entries) console.log(`  ${describe(entry)}`); continue; }
    const before = baseline[panel] || [];
    const names = list => list.map(entry => bare(entry, panel)).filter(Boolean);
    const missing = names(before).filter(name => !names(entries).includes(name)), added = names(entries).filter(name => !names(before).includes(name));
    console.log(`  before: ${before.length} controls. Names only before: ${JSON.stringify([...new Set(missing)])}`);
    console.log(`  names only now: ${JSON.stringify([...new Set(added)])}`);
    // A name used by several controls is paired in order of appearance.
    const seen = {};
    for (const entry of entries) {
        const key = bare(entry, panel);
        if (!key) continue;
        const old = before.filter(candidate => bare(candidate, panel) === key)[seen[key] = (seen[key] ?? -1) + 1];
        if (!old) continue;
        const same = String(old.value) === String(entry.value) || String(entry.value).startsWith(String(old.value));
        if (!same || old.kind !== entry.kind || old.disabled !== entry.disabled) console.log(`  changed: ${bare(entry, panel)} | ${old.kind} ${JSON.stringify(old.value)}${old.disabled ? ' disabled' : ''} -> ${entry.kind} ${JSON.stringify(entry.value)}${entry.disabled ? ' disabled' : ''}`);
    }
}
if (process.env.LAWIZ_AUDIT_CONTRAST) {
    writeFileSync(process.env.LAWIZ_AUDIT_CONTRAST, JSON.stringify(contrasts, null, 1));
    const under = limit => Object.values(contrasts).reduce((sum, screen) => sum + screen.low.filter(entry => entry.ratio < limit).length, 0);
    console.log(`\nContrast: ${Object.values(contrasts).reduce((sum, screen) => sum + screen.checked, 0)} texts on ${Object.keys(contrasts).length} screens, ${under(3)} under 3:1, ${under(4.5)} under 4.5:1`);
    for (const [screen, { low }] of Object.entries(contrasts)) console.log(`  CONTRAST ${screen}: ${low.filter(entry => entry.ratio < 3).length} under 3:1, ${low.length} under 4.5:1`);
}
if (errors.length) { console.log(`\nPage errors: ${JSON.stringify([...new Set(errors)].slice(0, 5))}`); process.exitCode = 1; }
