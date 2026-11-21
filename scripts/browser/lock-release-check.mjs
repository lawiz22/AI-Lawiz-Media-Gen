// Usage: node scripts/browser/lock-release-check.mjs
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR
// (default %TEMP%/scene-variation-browser). ComfyUI is simulated: no GPU job is ever queued.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';
const SETTLE_MS = 10000;

const bootstrap = async page => {
    const html = (await (await page.request.get(origin)).text()).replace(/<script[^>]+src="\/index.tsx[^"]*"[^>]*><\/script>/, '');
    await page.route('**/__lock-test', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${origin}/__lock-test`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { Provider, useSelector } = await import('/node_modules/.vite/deps/react-redux.js');
        const { store } = await import('/store/store.ts');
        const app = await import('/store/appSlice.ts');
        const workflow = await import('/services/qwen21Workflow.ts');
        const { default: Panel } = await import('/components/OutpaintPanel.tsx');
        const { TabActivity } = await import('/components/TabActivity.tsx');
        const test = window.__lock = { store, graphs: [], sockets: [], info: {}, hold: false, promptFails: false, interruptFails: false, serverDown: false, jobUnknown: false, interrupts: 0 };
        const settings = workflow.defaultQwen21OutpaintOptions();
        for (const node of Object.values(workflow.buildQwen21OutpaintWorkflow('source.png', settings))) {
            test.info[node.class_type] = { input: { required: Object.fromEntries(Object.entries(node.inputs).map(([key, value]) => [key, [[value]]])) } };
        }
        test.info.LoraLoaderModelOnly = { input: { required: { lora_name: [[settings.outpaintLora.name, 'QWEN/extra.safetensors']] } } };
        const canvas = document.createElement('canvas'); canvas.width = 526; canvas.height = 526;
        canvas.getContext('2d').fillRect(0, 0, 526, 526);
        test.source = canvas.toDataURL();
        const resultBlob = await (await fetch(test.source)).blob();
        const output = { images: [{ filename: 'outpaint.png', subfolder: '', type: 'output' }] };
        test.emit = (type, data = {}) => test.sockets.at(-1).onmessage?.({ data: JSON.stringify({ type, data: { prompt_id: `job-${test.graphs.length}`, ...data } }) });
        test.complete = () => test.emit('executed', { node: '12', output });
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (url, init) => {
            const target = String(url);
            if (!target.startsWith('http://comfy.test')) return originalFetch(url, init);
            if (test.serverDown) throw new TypeError('Failed to fetch');
            if (target.endsWith('/object_info')) return Response.json(test.info);
            if (target.endsWith('/queue')) return Response.json({ queue_running: [], queue_pending: [] });
            if (target.endsWith('/upload/image')) return Response.json({ name: 'uploaded.png', subfolder: '', type: 'input' });
            if (target.endsWith('/interrupt')) {
                test.interrupts++;
                if (test.interruptFails) throw new TypeError('Failed to fetch');
                setTimeout(() => test.emit('execution_interrupted'), 10);
                return Response.json({});
            }
            if (target.endsWith('/prompt')) {
                test.graphs.push(JSON.parse(init.body).prompt);
                if (test.promptFails) return Response.json({ error: 'Simulated generation failure' }, { status: 400 });
                if (!test.hold) setTimeout(test.complete, 10);
                return Response.json({ prompt_id: `job-${test.graphs.length}` });
            }
            if (target.includes('/history/')) return Response.json(test.jobUnknown ? {} : { [target.split('/').pop()]: { outputs: { '12': output } } });
            if (target.includes('/view?')) return new Response(resultBlob, { headers: { 'Content-Type': 'image/png' } });
            throw new Error(`Unexpected ComfyUI request ${target}`);
        };
        window.WebSocket = class {
            static OPEN = 1; static CONNECTING = 0; readyState = 1;
            constructor() { test.sockets.push(this); setTimeout(() => this.onopen?.(), 0); }
            close() { if (this.readyState === 3) return; this.readyState = 3; setTimeout(() => this.onclose?.(), 0); }
        };
        localStorage.setItem('comfyui_url', 'http://comfy.test');
        store.dispatch(app.setActiveTab('outpaint'));
        const Shell = () => {
            const active = useSelector(state => state.app.activeTab);
            return React.createElement('main', null,
                React.createElement('button', { onClick: () => store.dispatch(app.setActiveTab(active === 'outpaint' ? 'library' : 'outpaint')) }, active === 'outpaint' ? 'Hide tab' : 'Show tab'),
                React.createElement(TabActivity, { mode: active === 'outpaint' ? 'visible' : 'hidden' }, React.createElement(Panel, { isComfyUIConnected: true, comfyUIObjectInfo: test.info })));
        };
        createRoot(document.getElementById('root')).render(React.createElement(Provider, { store }, React.createElement(Shell)));
    });
    await page.getByRole('heading', { name: 'OUTPAINT', exact: true }).waitFor();
    const source = await page.evaluate(() => window.__lock.source);
    await page.locator('#outpaint-source').setInputFiles({ name: 'source.png', mimeType: 'image/png', buffer: Buffer.from(source.split(',')[1], 'base64') });
    await page.getByLabel('Outpaint preview', { exact: true }).waitFor();
    for (const title of ['Models & CLIP', 'LoRA Settings', 'Sampler Settings']) await page.getByRole('button', { name: title, exact: true }).click();
};

const snapshot = page => page.evaluate(() => {
    const test = window.__lock;
    const selects = [...document.querySelectorAll('section[aria-label="Outpaint"] select')];
    const generate = [...document.querySelectorAll('section[aria-label="Outpaint"] button')].find(button => /^Outpaint(ing\.\.\.)?$/.test(button.textContent.trim()));
    return {
        globalLock: test.store.getState().generation.isLoading,
        selects: selects.length,
        disabledSelects: selects.filter(select => select.disabled).length,
        generateDisabled: !generate || generate.disabled,
        openSockets: test.sockets.filter(socket => socket.readyState !== 3).length,
    };
});
const released = state => !state.globalLock && state.selects > 0 && state.disabledSelects === 0 && !state.generateDisabled;
const waitReleased = async page => {
    const deadline = Date.now() + SETTLE_MS;
    let state = await snapshot(page);
    while (!released(state) && Date.now() < deadline) { await page.waitForTimeout(100); state = await snapshot(page); }
    return state;
};
const generate = page => page.getByRole('button', { name: 'Outpaint', exact: true });
const startHeldJob = async page => {
    await page.evaluate(() => { window.__lock.hold = true; });
    const queued = await page.evaluate(() => window.__lock.graphs.length);
    await generate(page).click();
    await page.waitForFunction(count => window.__lock.graphs.length > count, queued);
    const state = await snapshot(page);
    if (!state.globalLock || state.disabledSelects !== state.selects) throw new Error(`Controls were not locked during the job: ${JSON.stringify(state)}`);
};

const scenarios = [
    ['Idle baseline: every listbox is enabled', async () => {}],
    ['Successful generation releases the controls', async page => {
        await generate(page).click();
        await page.getByRole('img', { name: 'Outpaint result', exact: true }).waitFor();
    }],
    ['Successful generation closes its WebSocket', async page => {
        await generate(page).click();
        await page.getByRole('img', { name: 'Outpaint result', exact: true }).waitFor();
        await page.waitForTimeout(300);
    }, state => state.openSockets === 0],
    ['Rejected prompt (HTTP 400) releases the controls', async page => {
        await page.evaluate(() => { window.__lock.promptFails = true; });
        await generate(page).click();
        await page.getByRole('alert').filter({ hasText: /Simulated generation failure/ }).waitFor();
    }],
    ['execution_error event releases the controls', async page => {
        await startHeldJob(page);
        await page.evaluate(() => window.__lock.emit('execution_error', { exception_message: 'CUDA out of memory' }));
    }],
    ['Stop releases the controls', async page => {
        await startHeldJob(page);
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
    }],
    ['Live connection lost, job finished on the server: result recovered', async page => {
        await startHeldJob(page);
        await page.evaluate(() => window.__lock.sockets.at(-1).close());
        await page.getByRole('img', { name: 'Outpaint result', exact: true }).waitFor();
    }],
    ['Connection lost and server unreachable releases the controls', async page => {
        await startHeldJob(page);
        await page.evaluate(() => { window.__lock.serverDown = true; window.__lock.sockets.at(-1).close(); });
        await page.getByRole('alert').filter({ hasText: /connection to ComfyUI was lost/ }).waitFor({ timeout: SETTLE_MS });
    }],
    ['Connection lost after a server restart (job unknown) releases the controls', async page => {
        await startHeldJob(page);
        await page.evaluate(() => { window.__lock.jobUnknown = true; window.__lock.sockets.at(-1).close(); });
        await page.getByRole('alert').filter({ hasText: /could not be found on the server/ }).waitFor({ timeout: SETTLE_MS });
    }],
    ['Interruption of another job does not cancel this one', async page => {
        await startHeldJob(page);
        await page.evaluate(() => window.__lock.emit('execution_interrupted', { prompt_id: 'someone-else' }));
        await page.waitForTimeout(300);
        if (!(await snapshot(page)).globalLock) throw new Error('The job was cancelled by a foreign interruption.');
        await page.evaluate(() => window.__lock.complete());
        await page.getByRole('img', { name: 'Outpaint result', exact: true }).waitFor();
    }],
    ['Stop while the server is unreachable releases the controls', async page => {
        await startHeldJob(page);
        await page.evaluate(() => { window.__lock.interruptFails = true; });
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
    }],
    ['Tab switch after a generation keeps the controls enabled', async page => {
        await generate(page).click();
        await page.getByRole('img', { name: 'Outpaint result', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Hide tab', exact: true }).click();
        await page.getByRole('button', { name: 'Show tab', exact: true }).click();
    }],
    ['Job finishing while its tab is hidden releases the controls', async page => {
        await startHeldJob(page);
        await page.getByRole('button', { name: 'Hide tab', exact: true }).click();
        await page.evaluate(() => window.__lock.complete());
        await page.waitForFunction(() => !window.__lock.store.getState().generation.isLoading, null, { timeout: 6000 }).catch(() => {});
        await page.getByRole('button', { name: 'Show tab', exact: true }).click();
    }],
];

const only = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let failures = 0;
try {
    for (const [name, run, extra] of scenarios) {
        if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let ok = false, detail = '';
        try {
            await bootstrap(page);
            await run(page);
            const state = await waitReleased(page);
            ok = released(state) && (!extra || extra(state)) && errors.length === 0;
            detail = JSON.stringify(state) + (errors.length ? ` pageErrors=${JSON.stringify(errors)}` : '');
        } catch (error) { detail = String(error?.message || error).split('\n')[0]; }
        finally { await page.close(); }
        if (!ok) failures++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
    }
} finally { await browser.close(); }
console.log(failures ? `\n${failures} scenario(s) failed.` : '\nAll scenarios passed.');
process.exit(failures ? 1 : 0);
