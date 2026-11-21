// Usage: node scripts/browser/panel-controls-audit.mjs
// Lists every form control of a group of panels (name, kind, value, choices, disabled) in the real application,
// so a panel can be compared before and after a UI migration.
//   LAWIZ_AUDIT_OUT=file.json       writes the inventory
//   LAWIZ_AUDIT_BASELINE=file.json  compares the current inventory with a saved one
//   LAWIZ_AUDIT_GROUP=fun           group of panels to visit (see GROUPS)
//   LAWIZ_AUDIT_EXERCISE=1          also changes every listbox and number field and checks that the new value is shown
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR. ComfyUI is simulated.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';

// Each panel: the tab to activate, the buttons that lead to it, images to upload first, and the variants (extra clicks) to inventory.
const GROUPS = {
    fun: { tab: 'fun', panels: [
        { name: 'Photo Fusion', open: ['Photo Fusion'], upload: 2, variants: [{ name: 'flux2', button: 'FLUX2' }, { name: 'qwen', button: 'QWEN-Edit' }, { name: 'gemini', button: 'Gemini' }, { name: 'mammouth', button: 'Mammouth' }] },
        { name: 'Past Forward', open: ['Past Forward'], variants: [{ name: 'flux2', button: 'FLUX2' }, { name: 'qwen', button: 'QWEN-Edit' }, { name: 'gemini', button: 'Gemini' }, { name: 'mammouth', button: 'Mammouth' }] },
        { name: 'Swap Anything', open: ['Swap Anything'], variants: [{ name: 'default' }] },
        { name: 'Swap a Person', open: ['Swap a Person'], variants: [{ name: 'default' }, { name: 'lanpaint', radio: 'LanPaint (Head Swap)' }] },
        { name: 'Stylise Anything', open: ['Stylise Anything'], variants: [{ name: 'default' }] },
    ] },
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
    const models = list('flux2\\flux-2-klein-4b-fp8.safetensors', 'flux2\\flux2Klein9BInt8_v10.safetensors', 'qwen\\qwen_image_edit.safetensors', 'krea2_turbo_fp8_scaled.safetensors');
    const loras = list('FLUX2\\style-a.safetensors', 'FLUX2\\style-b.safetensors', 'QWEN\\lightning-4steps.safetensors');
    const samplers = list('euler', 'euler_ancestral', 'er_sde'), schedulers = list('simple', 'beta', 'beta57', 'normal');
    const catalog = {
        KSampler: { input: { required: { sampler_name: samplers, scheduler: schedulers } } },
        KSamplerSelect: { input: { required: { sampler_name: samplers } } },
        UNETLoader: { input: { required: { unet_name: models, weight_dtype: list('default') } } },
        UnetLoaderGGUF: { input: { required: { unet_name: list('flux2\\klein9b-Q5.gguf', 'qwen\\qwen-image-Q5.gguf') } } },
        CLIPLoader: { input: { required: { clip_name: list('qwen_3_4b.safetensors', 'qwen38BFluxKlein9BTE_38b.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors'), type: list('flux2', 'qwen_image') } } },
        VAELoader: { input: { required: { vae_name: list('flux2-vae.safetensors', 'qwen_image_vae.safetensors') } } },
        CheckpointLoaderSimple: { input: { required: { ckpt_name: list('sam3.1_multiplex_fp16.safetensors', 'SDXL\\base.safetensors') } } },
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

const inventory = () => page.evaluate(() => {
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
    return [...document.querySelectorAll('main select, main textarea, main input, main button[aria-haspopup="listbox"]')].filter(visible).map(node => {
        const kind = node.tagName === 'INPUT' ? node.type : node.tagName === 'BUTTON' ? 'listbox' : node.tagName.toLowerCase();
        const entry = { kind, label: labelOf(node), aria: node.getAttribute('aria-label') || '', disabled: !!node.disabled || !!node.closest('fieldset:disabled') };
        if (kind === 'checkbox' || kind === 'radio') entry.value = node.checked;
        else if (kind === 'file') entry.value = '';
        else if (kind === 'listbox') entry.value = text(node.textContent);
        else entry.value = node.value;
        if (kind === 'select-one') entry.kind = 'select';
        if (node.tagName === 'SELECT') { entry.kind = 'select'; entry.value = text(node.selectedOptions[0]?.textContent); entry.choices = [...node.options].map(option => text(option.textContent)); }
        if (!entry.label && !entry.aria) entry.label = node.placeholder ? `[placeholder] ${node.placeholder}` : node.id ? `[id] ${node.id}` : '';
        return entry;
    });
});
// Opens every collapsed section of the visible panel, twice for nested ones.
const expand = async () => {
    for (let pass = 0; pass < 2; pass++) {
        await page.evaluate(() => {
            const visible = node => node.offsetParent !== null;
            document.querySelectorAll('main details:not([open]) > summary').forEach(summary => { if (visible(summary)) summary.click(); });
            document.querySelectorAll('main button[aria-expanded="false"]:not([aria-haspopup])').forEach(button => { if (visible(button)) button.click(); });
        });
        await page.waitForTimeout(250);
    }
};

// A control wired to its state accepts a new value and still shows it after the re-render.
const exercise = async () => {
    const failures = []; let changed = 0;
    const name = handle => handle.evaluate(node => node.getAttribute('aria-label') || node.labels?.[0]?.textContent?.trim().slice(0, 40) || node.closest('label')?.textContent?.trim().slice(0, 40) || node.id);
    for (const handle of await page.locator('main').locator('input[type="number"], input[type="range"], select, button[aria-haspopup="listbox"]').elementHandles()) {
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
                const next = await handle.evaluate(node => [...node.options].find(option => !option.disabled && option.value !== node.value && option.value !== 'custom')?.value);
                if (next === undefined) continue;
                await handle.selectOption(next); await page.waitForTimeout(80);
                if (await handle.evaluate(node => node.isConnected) && await handle.inputValue() !== next) failures.push(`${label}: chose ${next}, shows ${await handle.inputValue()}`);
            } else {
                const before = (await handle.textContent()).trim();
                await handle.click();
                const option = page.locator('[role="listbox"] [role="option"]:not([aria-disabled="true"]):not([aria-selected="true"])').first();
                if (!await option.count()) { await page.keyboard.press('Escape'); continue; }
                const text = (await option.textContent()).trim();
                await option.click(); await page.waitForTimeout(80);
                const after = (await handle.textContent()).trim();
                if (!after.includes(text) || after === before) failures.push(`${label}: chose ${text}, shows ${after}`);
            }
            changed++;
        } catch (error) { failures.push(`${label}: ${String(error.message).split('\n')[0]}`); }
    }
    return { changed, failures };
};

const result = {}, exercised = {};
try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Library', exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async tab => {
        const served = await (await fetch('/index.tsx')).text();
        const { store } = await import(served.match(/from "(\/store\/store\.ts[^"]*)"/)[1]);
        const app = await import((await (await fetch('/App.tsx')).text()).match(/from "(\/store\/appSlice\.ts[^"]*)"/)[1]);
        store.dispatch(app.setActiveTab(tab));
    }, group.tab);
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
            await expand();
            result[`${panel.name} / ${variant.name}`] = await inventory();
            if (process.env.LAWIZ_SCREENSHOT_DIR) await page.screenshot({ fullPage: true, path: path.join(process.env.LAWIZ_SCREENSHOT_DIR, `${panel.name} - ${variant.name}.png`.replace(/\s+/g, '-').toLowerCase()) });
            if (process.env.LAWIZ_AUDIT_EXERCISE) exercised[`${panel.name} / ${variant.name}`] = await exercise();
        }
    }
} finally { await browser.close(); }

const describe = entry => `${entry.kind.padEnd(9)} ${(entry.label || entry.aria || '(no name)').slice(0, 60).padEnd(60)} = ${JSON.stringify(entry.value).slice(0, 50)}${entry.choices ? ` [${entry.choices.length} choices]` : ''}${entry.disabled ? ' (disabled)' : ''}`;
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
if (errors.length) { console.log(`\nPage errors: ${JSON.stringify([...new Set(errors)].slice(0, 5))}`); process.exitCode = 1; }
