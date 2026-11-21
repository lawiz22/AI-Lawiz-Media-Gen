// Usage: node scripts/browser/tab-switch-job-check.mjs [scenario filter]
// Proves that hiding a tab (React.Activity) neither cancels its running job nor reloads its node schemas on return,
// and that a real unmount still cancels the job.
// LAWIZ_LEGACY_CLEANUP=1 serves the old "abort on every effect cleanup" hook as a negative control (expected to fail).
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR
// (default %TEMP%/scene-variation-browser). ComfyUI is simulated: no GPU job is ever queued.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';
const legacy = process.env.LAWIZ_LEGACY_CLEANUP === '1';
const SETTLE_MS = 10000;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const legacyHook = `import React from '/node_modules/.vite/deps/react.js';
export const useUnmountCleanup = cleanup => { React.useEffect(() => () => cleanup(), []); return () => {}; };`;

const bootstrap = async page => {
    const html = (await (await page.request.get(origin)).text()).replace(/<script[^>]+src="\/index.tsx[^"]*"[^>]*><\/script>/, '');
    await page.route('**/__job-test', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.route('http://comfy.test/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    if (legacy) await page.route('**/components/useUnmountCleanup.ts*', route => route.fulfill({ contentType: 'text/javascript', body: legacyHook }));
    await page.goto(`${origin}/__job-test`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { Provider } = await import('/node_modules/.vite/deps/react-redux.js');
        const { store } = await import('/store/store.ts');
        const { ClothesSwitcherPanel } = await import('/components/ClothesSwitcherPanel.tsx');
        const { TabActivity } = await import('/components/TabActivity.tsx');
        const test = window.__job = { store, prompts: 0, cancels: 0, schemas: 0, saves: 0, done: false, sockets: [] };
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) { if (this.transaction.db.name === 'lawiz-clothes-switcher') test.saves++; return put.apply(this, args); };
        const image = filename => ({ images: [{ filename, subfolder: '', type: 'output' }] });
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (url, init) => {
            const target = String(url);
            if (!target.startsWith('http://comfy.test')) return originalFetch(url, init);
            if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
            if (target.includes('/object_info/')) { test.schemas++; return Response.json({ [decodeURIComponent(target.split('/').pop())]: { input: { required: {} } } }); }
            if (target.endsWith('/upload/image')) return Response.json({ name: 'uploaded.png', subfolder: '', type: 'input' });
            if (target.endsWith('/prompt')) return Response.json({ prompt_id: `job-${++test.prompts}` });
            if (target.endsWith('/cancel')) { test.cancels++; return Response.json({ cancelled: true }); }
            if (target.includes('/history/')) {
                const id = target.split('/').pop();
                return Response.json(test.done ? { [id]: { status: { completed: true, status_str: 'success' }, outputs: { '9': image('result.png'), '150': image('depth.png'), '163': image('canny.png') } } } : {});
            }
            throw new Error(`Unexpected ComfyUI request ${target}`);
        };
        window.WebSocket = class {
            static OPEN = 1; static CONNECTING = 0; readyState = 1;
            constructor() { test.sockets.push(this); setTimeout(() => this.onopen?.(), 0); }
            close() { this.readyState = 3; }
        };
        localStorage.setItem('comfyui_url', 'http://comfy.test');
        const onModelChange = () => {};
        const Shell = () => {
            const [mode, setMode] = React.useState('visible');
            return React.createElement('main', null,
                React.createElement('button', { onClick: () => setMode(mode === 'visible' ? 'hidden' : 'visible') }, mode === 'visible' ? 'Hide tab' : 'Show tab'),
                React.createElement('button', { onClick: () => setMode('removed') }, 'Remove panel'),
                mode !== 'removed' && React.createElement(TabActivity, { mode }, React.createElement(ClothesSwitcherPanel, { isComfyUIConnected: true, onModelChange })));
        };
        createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Provider, { store }, React.createElement(Shell))));
    });
    await page.waitForFunction(() => document.querySelector('aside fieldset') && !document.querySelector('aside fieldset').disabled);
    await page.getByLabel('Clothes Switcher original photo', { exact: true }).setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: png });
};

const snapshot = page => page.evaluate(() => {
    const test = window.__job;
    return { globalLock: test.store.getState().generation.isLoading, queued: test.prompts, cancelRequests: test.cancels, schemaRequests: test.schemas, draftSaves: test.saves, openSockets: test.sockets.filter(socket => socket.readyState !== 3).length };
});
const click = (page, name) => page.getByRole('button', { name, exact: true }).click();
const result = page => page.getByRole('heading', { name: 'Clothes Switcher result', exact: true });
const start = async page => {
    await click(page, 'Generate Clothes Switcher');
    await page.waitForFunction(() => window.__job.prompts === 1);
    if (!(await snapshot(page)).globalLock) throw new Error('The job did not take the global lock.');
};
const finishJob = page => page.evaluate(() => { window.__job.done = true; });
const unlocked = page => page.waitForFunction(() => !window.__job.store.getState().generation.isLoading, null, { timeout: SETTLE_MS });

const scenarios = [
    ['Returning to the tab reuses the cached node schemas', async page => {
        const before = (await snapshot(page)).schemaRequests;
        if (!before) throw new Error('The panel never loaded its node schemas.');
        await click(page, 'Hide tab');
        await click(page, 'Show tab');
        await page.waitForTimeout(500);
        const after = (await snapshot(page)).schemaRequests;
        if (after !== before) throw new Error(`Node schemas were requested again on return: ${before} -> ${after}`);
    }, state => state.cancelRequests === 0],
    ['Typing saves the draft once edits pause; hiding the tab flushes a pending save', async page => {
        const prompt = page.getByLabel('Clothes Switcher prompt', { exact: true });
        const saves = async () => (await snapshot(page)).draftSaves;
        await page.waitForTimeout(700);
        const before = await saves();
        await prompt.pressSequentially('a red wool coat', { delay: 20 });
        await page.waitForTimeout(700);
        const typed = await saves() - before;
        if (typed !== 1) throw new Error(`Expected 1 draft write for 15 keystrokes, got ${typed}.`);
        await prompt.pressSequentially('!');
        await click(page, 'Hide tab');
        await page.waitForTimeout(100);
        if (await saves() - before !== 2) throw new Error('The pending draft was not saved when the tab was hidden.');
        await click(page, 'Show tab');
        await page.waitForTimeout(700);
        if (await saves() - before !== 2) throw new Error('Returning to the tab rewrote an unchanged draft.');
    }, state => state.cancelRequests === 0],
    ['Job finishing while its tab is hidden is not cancelled and shows its result', async page => {
        await start(page);
        await click(page, 'Hide tab');
        await page.waitForTimeout(500);
        await finishJob(page);
        await unlocked(page);
        await click(page, 'Show tab');
        await result(page).waitFor({ timeout: 3000 });
    }, state => state.cancelRequests === 0],
    ['Leaving and returning during a job keeps it running until its result', async page => {
        await start(page);
        await click(page, 'Hide tab');
        await click(page, 'Show tab');
        await page.waitForTimeout(500);
        const state = await snapshot(page);
        if (!state.globalLock || state.cancelRequests) throw new Error(`The job was cancelled by the tab switch: ${JSON.stringify(state)}`);
        await page.getByRole('button', { name: 'Cancel this job', exact: true }).waitFor();
        await finishJob(page);
        await result(page).waitFor({ timeout: SETTLE_MS });
    }, state => state.cancelRequests === 0],
    ['Removing the panel (real unmount) still cancels its job', async page => {
        await start(page);
        await click(page, 'Remove panel');
        await page.waitForFunction(() => window.__job.cancels === 1, null, { timeout: SETTLE_MS });
    }, state => state.cancelRequests === 1],
    ['Cancel button still cancels the job', async page => {
        await start(page);
        await click(page, 'Cancel this job');
        await page.waitForFunction(() => window.__job.cancels === 1, null, { timeout: SETTLE_MS });
    }, state => state.cancelRequests === 1],
];

const only = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let failures = 0;
try {
    for (const [name, run, expected] of scenarios) {
        if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let ok = false, detail = '';
        try {
            await bootstrap(page);
            await run(page);
            await unlocked(page);
            const state = await snapshot(page);
            ok = expected(state) && state.openSockets === 0 && errors.length === 0;
            detail = JSON.stringify(state) + (errors.length ? ` pageErrors=${JSON.stringify(errors)}` : '');
        } catch (error) { detail = String(error?.message || error).split('\n')[0]; }
        finally { await page.close(); }
        if (!ok) failures++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
    }
} finally { await browser.close(); }
console.log(failures ? `\n${failures} scenario(s) failed.` : '\nAll scenarios passed.');
process.exit(failures ? 1 : 0);
