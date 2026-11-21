// Usage: node scripts/browser/tab-switch-audit.mjs
// Loads the real app (browser mode, simulated ComfyUI) and reports, per main tab: visible listboxes,
// disabled listboxes, values missing from their list, ComfyUI requests and store updates on first visit and on return.
// LAWIZ_SCREENSHOT_DIR saves one screenshot per tab.
// Needs the Vite dev server (LAWIZ_ORIGIN) and Playwright in LAWIZ_PLAYWRIGHT_DIR. No GPU job is queued.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';
const TABS = ['Image Gen', 'Character', 'Gestionnaire de styles', 'Scene Variation', 'Video', 'TTS', 'Prompt', 'Extractor', 'Fun', 'Logo', 'Tools', 'Models/LoRAs', 'Library'];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    sessionStorage.setItem('currentUser', JSON.stringify({ username: 'audit', role: 'admin' }));
    localStorage.setItem('comfyui_url', 'http://comfy.test');
    const probe = window.__audit = { requests: [], sockets: 0, updates: 0 };
    const list = (...values) => [values];
    const catalog = {
        KSampler: { input: { required: { sampler_name: list('euler', 'er_sde'), scheduler: list('simple', 'beta') } } },
        KSamplerSelect: { input: { required: { sampler_name: list('euler', 'er_sde') } } },
        BasicScheduler: { input: { required: { scheduler: list('simple', 'beta') } } },
        UNETLoader: { input: { required: { unet_name: list('flux2\\flux2Klein9BInt8_v10.safetensors', 'krea2_turbo_fp8_scaled.safetensors'), weight_dtype: list('default') } } },
        CLIPLoader: { input: { required: { clip_name: list('qwen38BFluxKlein9BTE_38b.safetensors', 'qwen3vl_4b_fp8_scaled.safetensors'), type: list('flux2', 'krea2'), device: list('default') } } },
        VAELoader: { input: { required: { vae_name: list('flux2-vae.safetensors', 'qwen_image_vae.safetensors') } } },
        LoraLoaderModelOnly: { input: { required: { lora_name: list('KREA\\snofs_krea_v1_nostrip.safetensors', 'FLUX2\\style.safetensors') } } },
        LoraLoader: { input: { required: { lora_name: list('KREA\\snofs_krea_v1_nostrip.safetensors', 'FLUX2\\style.safetensors') } } },
        CheckpointLoaderSimple: { input: { required: { ckpt_name: list('sdxl\\base.safetensors') } } },
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
        const target = String(url);
        if (!target.startsWith('http://comfy.test')) return originalFetch(url, init);
        const route = target.slice('http://comfy.test'.length).split('?')[0];
        probe.requests.push(route);
        if (route === '/object_info') return Response.json(catalog);
        if (route.startsWith('/object_info/')) {
            const name = decodeURIComponent(route.slice('/object_info/'.length));
            return Response.json({ [name]: catalog[name] || { input: { required: {} } } });
        }
        return Response.json({});
    };
    window.WebSocket = class {
        static OPEN = 1; static CONNECTING = 0; readyState = 1;
        constructor() { probe.sockets++; setTimeout(() => this.onopen?.(), 0); }
        send() {} close() { this.readyState = 3; } addEventListener() {} removeEventListener() {}
    };
});

const measure = () => page.evaluate(() => {
    const probe = window.__audit;
    const visible = element => element.offsetParent !== null;
    const name = element => element.getAttribute('aria-label') || element.closest('label')?.textContent?.trim().slice(0, 40) || element.id || '(unnamed)';
    const selects = [...document.querySelectorAll('select')].filter(visible);
    const menus = [...document.querySelectorAll('button[aria-haspopup="listbox"]')].filter(visible);
    const lists = [...document.querySelectorAll('input[list]')].filter(visible);
    const all = [...selects, ...menus, ...lists];
    const requests = probe.requests.splice(0);
    const result = {
        native: selects.length, custom: menus.length, datalist: lists.length,
        disabled: all.filter(element => element.disabled).map(name),
        empty: selects.filter(select => !select.disabled && select.options.length === 0).map(name),
        notListed: [...selects.filter(select => /\(not listed\)$/.test(select.selectedOptions[0]?.textContent || '')), ...menus.filter(menu => /\(not listed\)/.test(menu.textContent))].map(name),
        requests: requests.length, objectInfo: requests.filter(route => route.startsWith('/object_info')).length,
        sockets: probe.sockets, updates: probe.updates,
    };
    probe.sockets = 0; probe.updates = 0;
    return result;
});

try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Library', exact: true }).first().waitFor({ timeout: 30000 });
    await page.evaluate(async () => {
        // Vite serves an edited module under a timestamped URL; use the URL the app itself imported.
        const served = await (await fetch('/index.tsx')).text();
        const { store } = await import(served.match(/from "(\/store\/store\.ts[^"]*)"/)?.[1] || '/store/store.ts');
        store.subscribe(() => { window.__audit.updates++; });
    });
    await page.waitForTimeout(2500);
    const startup = await measure();
    console.log(`Startup: ${startup.requests} ComfyUI request(s), ${startup.objectInfo} object_info, ${startup.updates} store update(s) after subscription`);
    const rows = [];
    for (const pass of ['first visit', 'return visit']) {
        for (const tab of TABS) {
            await page.getByRole('button', { name: tab, exact: true }).first().click();
            await page.waitForTimeout(1200);
            rows.push({ pass, tab, ...(await measure()) });
            if (process.env.LAWIZ_SCREENSHOT_DIR && pass === 'first visit') await page.screenshot({ path: path.join(process.env.LAWIZ_SCREENSHOT_DIR, `tab-${tab.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true });
        }
    }
    for (const row of rows) {
        console.log(`${row.pass.padEnd(12)} ${row.tab.padEnd(24)} listboxes native=${String(row.native).padStart(3)} custom=${String(row.custom).padStart(2)} datalist=${String(row.datalist).padStart(2)}`
            + ` | disabled=${String(row.disabled.length).padStart(2)} empty=${String(row.empty.length).padStart(2)}`
            + ` | comfy requests=${String(row.requests).padStart(3)} (object_info ${String(row.objectInfo).padStart(3)}) sockets=${row.sockets} store updates=${row.updates}`);
        if (row.disabled.length) console.log(`             disabled: ${[...new Set(row.disabled)].join(' | ')}`);
        if (row.empty.length) console.log(`             empty: ${[...new Set(row.empty)].join(' | ')}`);
        if (row.notListed.length) console.log(`             value not in its list: ${[...new Set(row.notListed)].join(' | ')}`);
    }
    if (errors.length) console.log(`Page errors: ${JSON.stringify([...new Set(errors)].slice(0, 10))}`);
} finally { await browser.close(); }
