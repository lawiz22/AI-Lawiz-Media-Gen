// Usage: node scripts/browser/app-render-profile.mjs
// Measures how much the whole application re-renders for typical store updates (React Profiler around <App />):
// generation progress ticks, prompt typing and a modal flag. Compare the numbers before and after a change.
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR.
// ComfyUI is simulated; no job is queued. Durations come from a development build: compare them, do not read them as absolute.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    sessionStorage.setItem('currentUser', JSON.stringify({ username: 'profile', role: 'admin' }));
    localStorage.setItem('comfyui_url', 'http://comfy.test');
    const list = (...values) => [values];
    const catalog = {
        KSampler: { input: { required: { sampler_name: list('euler', 'er_sde'), scheduler: list('simple', 'beta') } } },
        UNETLoader: { input: { required: { unet_name: list('flux2\\flux2Klein9BInt8_v10.safetensors'), weight_dtype: list('default') } } },
        LoraLoaderModelOnly: { input: { required: { lora_name: list(...Array.from({ length: 1500 }, (_, index) => `FLUX2\\style-${index}.safetensors`)) } } },
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
        const target = String(url);
        if (!target.startsWith('http://comfy.test')) return originalFetch(url, init);
        const route = target.slice('http://comfy.test'.length).split('?')[0];
        if (route === '/object_info') return Response.json(catalog);
        if (route.startsWith('/object_info/')) return Response.json({ [decodeURIComponent(route.slice('/object_info/'.length))]: { input: { required: {} } } });
        return Response.json({});
    };
    window.WebSocket = class {
        static OPEN = 1; static CONNECTING = 0; readyState = 1;
        constructor() { setTimeout(() => this.onopen?.(), 0); }
        send() {} close() { this.readyState = 3; } addEventListener() {} removeEventListener() {}
    };
});

try {
    const html = (await (await page.request.get(origin)).text()).replace(/<script[^>]+src="\/index.tsx[^"]*"[^>]*><\/script>/, '');
    await page.route('**/__profile', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(`${origin}/__profile`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { Provider } = await import('/node_modules/.vite/deps/react-redux.js');
        const { default: App } = await import('/App.tsx');
        // Vite serves an edited module under a timestamped URL; a plain import would create a second, disconnected instance.
        const served = (await Promise.all(['/App.tsx', '/index.tsx'].map(async file => (await fetch(file)).text()))).join('\n');
        const used = name => served.match(new RegExp(`from "(/store/${name}\\.ts[^"]*)"`))?.[1];
        const { store } = await import(used('store'));
        // Development React captures a stack for the first 10,000 elements of each second; skipping it keeps runs comparable.
        const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const skipOwnerStacks = () => { if (internals && 'recentlyCreatedOwnerStacks' in internals) internals.recentlyCreatedOwnerStacks = 1e9; };
        skipOwnerStacks(); setInterval(skipOwnerStacks, 50);
        const probe = window.__profile = { store, skipOwnerStacks, ownerStacks: !!internals && 'recentlyCreatedOwnerStacks' in internals, commits: 0, duration: 0, generation: await import(used('generationSlice')), app: await import(used('appSlice')) };
        probe.jobs = used('generationJobs') ? await import(used('generationJobs')) : null;
        const rootElement = document.getElementById('root');
        // Time a component spent in the reported commit: its own duration minus the children visited in the same commit.
        const rendered = startTime => {
            const container = rootElement[Object.keys(rootElement).find(key => key.startsWith('__reactContainer$'))];
            const visit = fiber => {
                let total = 0;
                for (; fiber; fiber = fiber.sibling) {
                    if (!(fiber.actualStartTime >= startTime)) continue;
                    const self = fiber.actualDuration - visit(fiber.child);
                    total += fiber.actualDuration;
                    const type = fiber.type, name = typeof type === 'function' ? type.displayName || type.name : type?.type?.name || type?.render?.name;
                    if (!name || self < 0.05) continue;
                    const entry = probe.components[name] ||= { renders: 0, selfMs: 0 };
                    entry.renders++; entry.selfMs += self;
                }
                return total;
            };
            visit(container?.stateNode?.current?.child);
        };
        const onRender = (_id, _phase, actualDuration, _base, startTime) => { probe.commits++; probe.duration += actualDuration; probe.each?.push(+actualDuration.toFixed(1)); if (probe.components) rendered(startTime); };
        createRoot(document.getElementById('root')).render(React.createElement(React.Profiler, { id: 'app', onRender },
            React.createElement(Provider, { store }, React.createElement(App))));
    });
    await page.getByRole('button', { name: 'Library', exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(3000);

    const measure = (name, count, body) => page.evaluate(async ([label, times, source]) => {
        const probe = window.__profile, action = new Function('probe', 'index', source);
        const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
        await settle(400);
        probe.commits = 0; probe.duration = 0; probe.each = []; probe.components = {};
        const started = performance.now();
        for (let index = 0; index < times; index++) { probe.skipOwnerStacks(); action(probe, index); await settle(30); }
        const elapsed = performance.now() - started - times * 30;
        await settle(600);
        const components = Object.entries(probe.components).sort((a, b) => b[1].selfMs - a[1].selfMs).slice(0, 10).map(([name, entry]) => `${name} x${entry.renders} ${entry.selfMs.toFixed(0)}ms`);
        probe.components = null;
        return { label, times, commits: probe.commits, renderMs: Math.round(probe.duration), perUpdateMs: +(probe.duration / times).toFixed(1), blockedMs: Math.round(elapsed), each: probe.each, components };
    }, [name, count, body]);

    // Unmeasured warm-up: the first full re-renders run unoptimized code and would distort whichever row comes first.
    await measure('warm-up', 40, "probe.store.dispatch(probe.generation.updateOptions({ comfyPrompt: 'warm-up ' + index }))");

    await page.evaluate(() => {
        const probe = window.__profile;
        probe.store.dispatch(probe.generation.setLoadingState({ isLoading: true }));
        probe.jobs?.setGenerationJobs('image-generator', [{ label: 'Image 1', progress: 0, message: 'Queued', status: 'pending' }]);
    });
    // One tick of a ComfyUI image generation: overall progress plus the progress of the output being rendered.
    const tick = "probe.store.dispatch(probe.generation.updateProgress({ message: 'Sampling step ' + index, value: index / 50 }));"
        + "probe.jobs?.setGenerationJobs('image-generator', jobs => jobs.map(job => ({ ...job, progress: index / 50, message: 'Sampling step ' + index })));";
    const rows = [await measure('Generation progress tick', 50, tick)];
    // The isolated components must still show what App used to pass down: overall progress and the output tile.
    const shown = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('p, span, h2')].filter(node => node.offsetParent !== null);
        return { progress: visible.filter(node => node.textContent === 'Sampling step 49').length, tile: visible.some(node => node.textContent === 'Image 1'), grid: visible.some(node => node.textContent === '3. Generated Content') };
    });
    const displayed = shown.progress === 2 && shown.tile && shown.grid;
    console.log(`${displayed ? 'PASS' : 'FAIL'}  Progress bar and output tile follow the ticks ${JSON.stringify(shown)}`);
    if (!displayed) process.exitCode = 1;
    await page.evaluate(() => {
        const probe = window.__profile;
        probe.jobs?.setGenerationJobs('image-generator', []);
        probe.store.dispatch(probe.generation.setLoadingState({ isLoading: false }));
    });
    rows.push(await measure('Prompt keystroke (Image Gen)', 20, "probe.store.dispatch(probe.generation.updateOptions({ comfyPrompt: 'a portrait ' + index }))"));
    rows.push(await measure('Session token counter update', 20, "probe.store.dispatch(probe.app.addSessionTokenUsage({ promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }))"));
    rows.push(await measure('Drive sync message update', 20, "probe.store.dispatch(probe.app.setSyncMessage('Syncing ' + index))"));
    rows.push(await measure('Library picker open or close', 20, "probe.store.dispatch(probe.app.setModalOpen({ modal: 'isClothingPickerOpen', isOpen: index % 2 === 0 }))"));
    // Same keystroke while one of the Qwen 2.1 edit panels is the visible workflow.
    const model = await page.evaluate(() => { const { store, generation } = window.__profile, before = store.getState().generation.options.comfyModelType; store.dispatch(generation.updateOptions({ comfyModelType: 'qwen21-remove-background' })); return before; });
    await page.waitForTimeout(1500);
    rows.push(await measure('Prompt keystroke (Qwen 2.1 edit)', 20, "probe.store.dispatch(probe.generation.updateOptions({ comfyPrompt: 'a portrait ' + index }))"));
    await page.evaluate(before => window.__profile.store.dispatch(window.__profile.generation.updateOptions({ comfyModelType: before })), model);
    await page.waitForTimeout(1000);
    // Worst case for a tab that was not kept up to date while hidden: the prompt changes, then another tab is shown.
    const tabs = "['character-generator', 'video', 'library', 'prompt-generator', 'image-generator'][index % 5]";
    rows.push(await measure('Prompt edit, then tab switch', 20, `probe.store.dispatch(probe.generation.updateOptions({ comfyPrompt: 'switch ' + index })); probe.store.dispatch(probe.app.setActiveTab(${tabs}))`));
    // A tab changed while hidden must be up to date as soon as it is shown again.
    const tabsShown = await page.evaluate(async () => {
        const { store, app, generation } = window.__profile, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const names = () => [...document.querySelectorAll('input[placeholder="Enter or Auto-Generate"]')].filter(node => node.offsetParent !== null).map(node => node.value);
        store.dispatch(app.setActiveTab('character-generator')); await wait(300);
        const before = names();
        store.dispatch(app.setActiveTab('library')); await wait(300);
        const whileHidden = names();
        store.dispatch(generation.setCharacterName('Edited while hidden')); await wait(300);
        store.dispatch(app.setActiveTab('character-generator')); await wait(50);
        const after = names();
        store.dispatch(generation.setCharacterName(before[0] || '')); store.dispatch(app.setActiveTab('image-generator')); await wait(300);
        return { before, whileHidden, after };
    });
    const tabsOk = tabsShown.before.length === 1 && tabsShown.whileHidden.length === 0 && tabsShown.after.join() === 'Edited while hidden';
    console.log(`${tabsOk ? 'PASS' : 'FAIL'}  A tab edited while hidden is up to date when shown ${JSON.stringify(tabsShown)}`);
    if (!tabsOk) process.exitCode = 1;
    const dialogs = async (modal, isOpen) => {
        await page.evaluate(([name, open]) => window.__profile.store.dispatch(window.__profile.app.setModalOpen({ modal: name, isOpen: open })), [modal, isOpen]);
        await page.waitForTimeout(150);
        return page.locator('[role="dialog"][aria-labelledby="library-picker-title"]').count();
    };
    const pickers = [await dialogs('isClothingPickerOpen', true), await dialogs('isPosePickerOpen', true), await dialogs('isClothingPickerOpen', false), await dialogs('isPosePickerOpen', false)];
    const pickersOk = pickers.join() === '1,1,1,0';
    console.log(`${pickersOk ? 'PASS' : 'FAIL'}  Library pickers open one at a time and close (dialogs shown: ${pickers.join(', ')})`);
    if (!pickersOk) process.exitCode = 1;
    const stored = await page.evaluate(() => {
        const { store, app } = window.__profile;
        store.dispatch(app.setProjectName('Profile project')); store.dispatch(app.setFontSize(15));
        store.dispatch(app.setDriveFolder({ id: 'folder-1', name: 'Drive folder' }));
        store.dispatch(app.setCurrentUser({ username: 'profile-2', role: 'admin' }));
        const written = [localStorage.getItem('projectName'), localStorage.getItem('fontSize'), JSON.parse(localStorage.getItem('drive_folder')).id, JSON.parse(sessionStorage.getItem('currentUser')).username];
        store.dispatch(app.setDriveFolder(null)); store.dispatch(app.setFontSize(14));
        return [...written, localStorage.getItem('drive_folder'), localStorage.getItem('fontSize')];
    });
    const storedOk = JSON.stringify(stored) === JSON.stringify(['Profile project', '15', 'folder-1', 'profile-2', null, '14']);
    console.log(`${storedOk ? 'PASS' : 'FAIL'}  Preferences are still written to browser storage ${JSON.stringify(stored)}`);
    if (!storedOk) process.exitCode = 1;
    // The tab container on its own: what a hidden tab ignores, what still reaches it, and what it shows on return.
    const kept = await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { TabActivity } = await import('/components/TabActivity.tsx');
        const wait = () => new Promise(resolve => setTimeout(resolve, 150));
        const host = document.body.appendChild(document.createElement('div')), counts = { renders: 0, instances: 0 };
        const Tab = ({ label }) => {
            counts.renders++;
            const [own, setOwn] = React.useState(() => { counts.instances++; return 0; });
            window.__bumpTab = () => setOwn(value => value + 1);
            return React.createElement('output', null, `${label}/${own}`);
        };
        const root = createRoot(host), text = () => host.querySelector('output').textContent;
        const show = (mode, label, key) => root.render(React.createElement(TabActivity, { mode }, React.createElement(Tab, { key, label })));
        const steps = {};
        show('visible', 'a', 1); await wait();
        show('hidden', 'a', 1); await wait(); counts.renders = 0;
        show('hidden', 'b', 1); await wait(); steps.parentUpdateIgnored = text() === 'a/0' && counts.renders === 0;
        window.__bumpTab(); await wait(); steps.ownStateStillRenders = text() === 'a/1';
        show('hidden', 'c', 2); await wait(); steps.resetAppliesWhileHidden = text() === 'c/0' && counts.instances === 2;
        show('hidden', 'd', 2); await wait(); show('visible', 'd', 2); await wait(); steps.upToDateWhenShown = text() === 'd/0' && counts.instances === 2;
        steps.seen = `${text()} instances=${counts.instances}`;
        root.unmount(); host.remove();
        return steps;
    });
    const keptOk = ['parentUpdateIgnored', 'ownStateStillRenders', 'resetAppliesWhileHidden', 'upToDateWhenShown'].every(step => kept[step] === true);
    console.log(`${keptOk ? 'PASS' : 'FAIL'}  Hidden tab: parent updates wait, own state and resets apply, shown up to date ${JSON.stringify(kept)}`);
    if (!keptOk) process.exitCode = 1;

    console.log(`Owner-stack capture ${await page.evaluate(() => window.__profile.ownerStacks) ? 'skipped' : 'NOT skipped (durations vary with element count)'}`);
    console.log('Update                          count  commits  render ms  ms/update  blocked ms (approx.)');
    for (const row of rows) console.log(`${row.label.padEnd(31)} ${String(row.times).padStart(5)}  ${String(row.commits).padStart(7)}  ${String(row.renderMs).padStart(9)}  ${String(row.perUpdateMs).padStart(9)}  ${String(row.blockedMs).padStart(14)}`);
    if (process.env.LAWIZ_PROFILE_COMMITS) for (const row of rows) console.log(`  ${row.label}: commits (ms) ${row.each.join(', ')}\n    rendered: ${row.components.join('; ')}`);
    if (errors.length) console.log(`Page errors: ${JSON.stringify([...new Set(errors)].slice(0, 5))}`);
} finally { await browser.close(); }
