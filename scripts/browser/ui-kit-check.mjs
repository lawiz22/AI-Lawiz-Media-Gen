// Usage: node scripts/browser/ui-kit-check.mjs [scenario filter]
// Exercises the UI kit (components/ui) and its legacy wrappers in a real browser: keyboard, filter, long lists,
// clipping containers, hidden tabs, locked fieldsets and prompt coloring. LAWIZ_SCREENSHOT_DIR saves screenshots.
// Needs the Vite dev server (LAWIZ_ORIGIN, default http://127.0.0.1:3000) and Playwright in LAWIZ_PLAYWRIGHT_DIR.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const playwrightDir = process.env.LAWIZ_PLAYWRIGHT_DIR || path.join(process.env.TEMP || os.tmpdir(), 'scene-variation-browser');
const { chromium } = createRequire(path.join(playwrightDir, 'resolve.cjs'))('playwright');
const origin = process.env.LAWIZ_ORIGIN || 'http://127.0.0.1:3000';
const shots = process.env.LAWIZ_SCREENSHOT_DIR;
const theme = process.env.LAWIZ_THEME || 'cyberpunk';

// index.html waits on four third-party sites (Tailwind, fonts, a stylesheet): each resource is fetched once per run, not once per scenario.
const external = new Map();
const serveOnce = async route => {
    const url = route.request().url();
    if (/\/\/(apis|accounts)\.google\.com\//.test(url)) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (!external.has(url)) external.set(url, route.fetch().then(async response => ({ status: response.status(), headers: response.headers(), body: await response.body() })));
    try { await route.fulfill(await external.get(url)); }
    catch { external.delete(url); await route.abort().catch(() => {}); }
};

const bootstrap = async page => {
    const html = (await (await page.request.get(origin)).text()).replace(/<script[^>]+src="\/index.tsx[^"]*"[^>]*><\/script>/, '');
    await page.route(url => !url.href.startsWith(origin), serveOnce);
    await page.route('**/__ui-kit', route => route.fulfill({ contentType: 'text/html', body: html }));
    const loading = new Set();
    page.on('request', request => loading.add(request.url()));
    for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => loading.delete(request.url()));
    await page.goto(`${origin}/__ui-kit`, { waitUntil: 'domcontentloaded' })
        .catch(error => { throw new Error(`${String(error.message).split('\n')[0]} Still loading: ${[...loading].join(', ') || 'nothing'}`); });
    // The application sets the theme on the root element; without it no theme color is defined.
    await page.evaluate(name => document.documentElement.setAttribute('data-theme', name), theme);
    await page.evaluate(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js');
        const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { Select } = await import('/components/ui/Select.tsx');
        const { PromptBox } = await import('/components/ui/PromptBox.tsx');
        const { SettingsLayout } = await import('/components/ui/SettingsLayout.tsx');
        const { SamplerFields, LoraSlots, SeedField } = await import('/components/ui/fields.tsx');
        const { SelectInput, TextInput } = await import('/components/InputComponents.tsx');
        const { MenuSelect } = await import('/components/MenuSelect.tsx');
        const h = React.createElement;
        const loras = Array.from({ length: 3000 }, (_, index) => `FLUX2\\style-${String(index).padStart(4, '0')}.safetensors`);
        const prompt = 'A portrait of <Picture 1> wearing a (red wool coat:1.2), cinematic light <lora:film-grain:0.8>, __season__ mood, '
            + '{day|night} street BREAK ' + 'highly detailed background with many small shops and reflections on the wet pavement after the rain, '.repeat(8);
        const initial = {
            lora: loras[1500], mode: 'b', missing: 'gone.safetensors', clipped: 'entry 2', bottom: 'two', version: 2, legacy: 'saved-but-removed', prompt, negative: '', title: '',
            sampler: { sampler: 'euler', scheduler: 'simple', steps: 8, cfg: 1 }, seed: 5, slots: [{ enabled: true, name: loras[3], strength: 0.8 }, { enabled: false, name: '', strength: 1 }],
        };
        const App = () => {
            const [state, setState] = React.useState(initial), [hidden, setHidden] = React.useState(false), [locked, setLocked] = React.useState(false);
            const set = patch => setState(current => ({ ...current, ...patch }));
            window.__kit = { hide: setHidden, lock: setLocked };
            return h('main', { className: 'space-y-4 bg-bg-primary p-6 text-text-primary' },
                h('pre', { id: 'state', className: 'hidden' }, JSON.stringify(state)),
                h('p', { id: 'tint', className: 'bg-accent/10' }, 'tint probe'),
                h(React.Activity, { mode: hidden ? 'hidden' : 'visible' },
                    h('section', { style: { '--color-accent': 'rgb(255, 0, 128)', maxWidth: 1100 }, className: 'rounded-xl bg-bg-secondary p-4' },
                        h(SettingsLayout, {
                            label: 'Kit', disabled: locked,
                            models: h(React.Fragment, null,
                                h(Select, { variant: 'search', label: 'LoRA', value: state.lora, options: loras, onChange: lora => set({ lora }) }),
                                h(Select, { variant: 'search', label: 'Mode', value: state.mode, options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma', disabled: true }, { value: 'd', label: 'Delta' }], onChange: mode => set({ mode }) }),
                                h(Select, { variant: 'search', label: 'Missing', value: state.missing, options: ['one.safetensors', 'two.safetensors'], onChange: missing => set({ missing }) }),
                                h('div', { id: 'clip', style: { overflow: 'hidden', height: 76 } },
                                    h(Select, { variant: 'search', label: 'Clipped', value: state.clipped, options: Array.from({ length: 6 }, (_, index) => `entry ${index}`), onChange: clipped => set({ clipped }) }))),
                            loras: h(LoraSlots, { name: 'Kit', slots: state.slots, choices: loras, onChange: (index, patch) => set({ slots: state.slots.map((slot, i) => i === index ? { ...slot, ...patch } : slot) }) }),
                            sampler: h(React.Fragment, null,
                                h(SamplerFields, { name: 'Kit', value: state.sampler, samplers: ['euler', 'heun', 'er_sde'], schedulers: ['simple', 'beta'], onChange: patch => set({ sampler: { ...state.sampler, ...patch } }) }),
                                h(SeedField, { name: 'Kit', value: state.seed, onChange: seed => set({ seed }) })),
                            advanced: () => h('div', null,
                                h(SelectInput, { label: 'Legacy select', value: state.legacy, options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], onChange: event => set({ legacy: event.target.value }) }),
                                h(TextInput, { label: 'Negative Prompt', value: state.negative, isTextArea: true, onChange: event => set({ negative: event.target.value }) }),
                                h(TextInput, { label: 'Title', value: state.title, onChange: event => set({ title: event.target.value }) }),
                                h('label', { className: 'block text-xs' }, 'Version', h(MenuSelect, { ariaLabel: 'Model version', value: state.version, options: [1, 2, 3].map(value => ({ value, label: `v${value}` })), onChange: version => set({ version }) }))),
                        },
                            h(PromptBox, { label: 'Positive prompt', ariaLabel: 'Kit prompt', value: state.prompt, rows: 3, clearable: true, copyable: true, onChange: value => set({ prompt: value }) }),
                            h(PromptBox, { label: 'Final prompt', ariaLabel: 'Kit final prompt', kind: 'readonly', value: state.prompt, rows: 2 })))),
                h('div', { style: { position: 'fixed', bottom: 8, right: 8, width: 300 } },
                    h(Select, { variant: 'search', label: 'Bottom', value: state.bottom, options: Array.from({ length: 20 }, (_, index) => index === 1 ? 'two' : `item ${index}`), onChange: bottom => set({ bottom }) })));
        };
        createRoot(document.getElementById('root')).render(h(React.StrictMode, null, h(App)));
    });
    await page.getByRole('button', { name: 'LoRA', exact: true }).waitFor();
    // The Tailwind CDN generates classes after render; wait until the kit is styled before measuring.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('button[aria-label="LoRA"]')).display === 'flex');
};

const state = page => page.evaluate(() => JSON.parse(document.getElementById('state').textContent));
const trigger = (page, name) => page.getByRole('button', { name, exact: true });
const listbox = (page, name) => page.getByRole('listbox', { name, exact: true });
const option = (page, name) => page.getByRole('option', { name, exact: true });
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const expectState = async (page, key, value) => {
    await page.waitForFunction(([name, expected]) => JSON.stringify(JSON.parse(document.getElementById('state').textContent)[name]) === expected, [key, JSON.stringify(value)], { timeout: 3000 })
        .catch(async () => { throw new Error(`Expected ${key} = ${JSON.stringify(value)}, got ${JSON.stringify((await state(page))[key])}`); });
};
const lora = index => `FLUX2\\style-${String(index).padStart(4, '0')}.safetensors`;
const layers = page => page.evaluate(() => {
    const area = document.querySelector('textarea[aria-label="Kit prompt"]'), layer = area.parentElement.querySelector('[data-prompt-highlight]');
    return { areaWidth: area.clientWidth, layerWidth: layer.clientWidth, areaHeight: area.scrollHeight, layerHeight: layer.scrollHeight, areaTop: area.scrollTop, layerTop: layer.scrollTop,
        tokens: [...layer.querySelectorAll('span')].map(span => span.textContent), color: getComputedStyle(area).color };
});

const scenarios = [
    ['A 3000-entry list opens on its selected entry and renders only a window of rows', async page => {
        await trigger(page, 'LoRA').click();
        await listbox(page, 'LoRA').waitFor();
        expect(await page.getByLabel('Filter LoRA', { exact: true }).evaluate(node => node === document.activeElement), 'The filter field is not focused.');
        const rows = await page.getByRole('option').count();
        expect(rows > 0 && rows <= 24, `Expected a window of rows, found ${rows}.`);
        await option(page, lora(1500)).waitFor();
        expect(await option(page, lora(1500)).getAttribute('aria-selected') === 'true', 'The selected entry is not marked.');
        return `${rows} rows in the page for 3000 options`;
    }],
    ['Typing filters the list and Enter selects the first match', async page => {
        await trigger(page, 'LoRA').click();
        await page.getByLabel('Filter LoRA', { exact: true }).fill('STYLE 2987');
        await option(page, lora(2987)).waitFor();
        expect(await page.getByRole('option').count() === 1, 'The filter did not narrow the list to one entry.');
        await page.keyboard.press('Enter');
        await expectState(page, 'lora', lora(2987));
        expect(await listbox(page, 'LoRA').count() === 0, 'The list stayed open after a selection.');
        expect(await trigger(page, 'LoRA').evaluate(node => node === document.activeElement), 'Focus did not return to the control.');
        await trigger(page, 'LoRA').click();
        await page.getByLabel('Filter LoRA', { exact: true }).fill('no such file');
        await page.getByText('No match', { exact: true }).waitFor();
    }],
    ['Keyboard: arrows open and move, disabled entries are skipped, Escape cancels', async page => {
        await trigger(page, 'Mode').focus();
        await page.keyboard.press('ArrowDown');
        await listbox(page, 'Mode').waitFor();
        expect(await page.getByLabel('Filter Mode', { exact: true }).count() === 0, 'A short list must not show a filter field.');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expectState(page, 'mode', 'd');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Home');
        await page.keyboard.press('Escape');
        expect(await listbox(page, 'Mode').count() === 0, 'Escape did not close the list.');
        await expectState(page, 'mode', 'd');
        await trigger(page, 'Mode').click();
        await option(page, 'Gamma').click({ force: true });
        expect(await listbox(page, 'Mode').count() === 1, 'A disabled entry closed the list.');
        await expectState(page, 'mode', 'd');
    }],
    ['A click outside closes the list without changing the value', async page => {
        await trigger(page, 'LoRA').click();
        await listbox(page, 'LoRA').waitFor();
        await page.mouse.click(700, 20);
        await listbox(page, 'LoRA').waitFor({ state: 'detached' });
        await expectState(page, 'lora', lora(1500));
    }],
    ['A saved value missing from the list is shown as such and can be replaced', async page => {
        expect((await trigger(page, 'Missing').innerText()).includes('gone.safetensors (not listed)'), 'The missing value is not displayed.');
        await trigger(page, 'Missing').click();
        await option(page, 'two.safetensors').click();
        await expectState(page, 'missing', 'two.safetensors');
        expect(!(await trigger(page, 'Missing').innerText()).includes('not listed'), 'The control still reports a missing value.');
    }],
    ['The list is not clipped by its container and keeps the tab accent color', async page => {
        await trigger(page, 'Clipped').click();
        await listbox(page, 'Clipped').waitFor();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="option"]')).position === 'absolute');
        const result = await page.evaluate(() => {
            const clip = document.getElementById('clip').getBoundingClientRect(), node = [...document.querySelectorAll('[role="option"]')].at(-1), box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return { reachable: node.contains(hit), beyond: box.top >= clip.bottom, selected: getComputedStyle(document.querySelector('[role="option"][aria-selected="true"]')).color };
        });
        expect(result.beyond, 'The harness no longer places the list outside its clipping container.');
        expect(result.reachable, 'The last entry is covered or clipped.');
        expect(result.selected === 'rgb(255, 0, 128)', `The list lost the tab accent color (${result.selected}).`);
        await option(page, 'entry 5').click();
        await expectState(page, 'clipped', 'entry 5');
    }],
    ['Near the bottom of the window the list opens upward', async page => {
        await trigger(page, 'Bottom').click();
        await listbox(page, 'Bottom').waitFor();
        const result = await page.evaluate(() => {
            const button = document.querySelector('button[aria-label="Bottom"]').getBoundingClientRect(), list = document.querySelector('[role="listbox"]').parentElement.getBoundingClientRect();
            return { above: list.bottom <= button.top, onScreen: list.top >= 0 && list.bottom <= window.innerHeight };
        });
        expect(result.above && result.onScreen, `The list is not fully visible above its control: ${JSON.stringify(result)}`);
        await page.getByLabel('Filter Bottom', { exact: true }).fill('item 7');
        await option(page, 'item 7').click();
        await expectState(page, 'bottom', 'item 7');
    }],
    ['Hiding the tab closes an open list', async page => {
        await trigger(page, 'LoRA').click();
        await listbox(page, 'LoRA').waitFor();
        await page.evaluate(() => window.__kit.hide(true));
        await listbox(page, 'LoRA').waitFor({ state: 'detached' });
        await page.evaluate(() => window.__kit.hide(false));
        await trigger(page, 'LoRA').waitFor();
        expect(await listbox(page, 'LoRA').count() === 0, 'The list reopened when the tab came back.');
    }],
    ['A list left open when the settings lock cannot change the value', async page => {
        await trigger(page, 'LoRA').click();
        await option(page, lora(1499)).waitFor();
        await page.evaluate(() => window.__kit.lock(true));
        await option(page, lora(1499)).click();
        await listbox(page, 'LoRA').waitFor({ state: 'detached' });
        await expectState(page, 'lora', lora(1500));
        expect(await trigger(page, 'LoRA').isDisabled(), 'The control is not disabled by its locked fieldset.');
    }],
    ['Prompt coloring stays aligned with the text while typing, wrapping and scrolling', async page => {
        let view = await layers(page);
        expect(view.areaWidth === view.layerWidth && view.areaHeight === view.layerHeight, `Layers differ: ${JSON.stringify(view)}`);
        expect(view.tokens.join('|') === '<Picture 1>|(red wool coat:1.2)|<lora:film-grain:0.8>|__season__|{day|night}|BREAK', `Unexpected tokens: ${view.tokens.join('|')}`);
        expect(view.color === 'rgba(0, 0, 0, 0)', `The text layer is not transparent (${view.color}).`);
        await page.setViewportSize({ width: 900, height: 1100 });
        view = await layers(page);
        expect(view.areaWidth === view.layerWidth && view.areaHeight === view.layerHeight, `Layers differ after resizing: ${JSON.stringify(view)}`);
        await page.getByLabel('Kit prompt', { exact: true }).evaluate(node => { node.scrollTop = 40; });
        await page.waitForFunction(() => document.querySelector('[data-prompt-highlight]').scrollTop === document.querySelector('textarea[aria-label="Kit prompt"]').scrollTop);
        view = await layers(page);
        expect(view.areaTop > 0 && view.areaTop === view.layerTop, `Scrolling is not mirrored: ${JSON.stringify(view)}`);
        await page.getByLabel('Kit prompt', { exact: true }).fill('new text (weight:0.5)\n');
        await expectState(page, 'prompt', 'new text (weight:0.5)\n');
        view = await layers(page);
        expect(view.tokens.join('|') === '(weight:0.5)' && view.areaHeight === view.layerHeight, `Typing broke the layers: ${JSON.stringify(view)}`);
        expect(await page.getByLabel('Kit final prompt', { exact: true }).inputValue() === 'new text (weight:0.5)\n', 'The read-only prompt did not follow.');
        await page.getByRole('button', { name: 'Clear Kit prompt', exact: true }).click();
        await expectState(page, 'prompt', '');
    }],
    ['Standard fields report changes: LoRA slots, sampler, seed', async page => {
        await page.locator('summary', { hasText: /^LoRAs$/ }).click();
        await trigger(page, 'Kit LoRA 1 file').waitFor();
        expect(await trigger(page, 'Kit LoRA 2 file').count() === 0, 'A disabled LoRA slot shows its file list.');
        await page.getByLabel('Kit Enable LoRA 2', { exact: true }).check();
        await trigger(page, 'Kit LoRA 2 file').click();
        await page.getByLabel('Filter Kit LoRA 2 file', { exact: true }).fill('0042');
        await page.keyboard.press('Enter');
        await page.getByLabel('Kit LoRA 2 strength', { exact: true }).fill('0.65');
        await expectState(page, 'slots', [{ enabled: true, name: lora(3), strength: 0.8 }, { enabled: true, name: lora(42), strength: 0.65 }]);
        await page.locator('summary', { hasText: /^Sampler$/ }).click();
        await page.getByLabel('Kit Steps', { exact: true }).fill('12');
        await trigger(page, 'Kit Sampler').click();
        await option(page, 'er_sde').click();
        await expectState(page, 'sampler', { sampler: 'er_sde', scheduler: 'simple', steps: 12, cfg: 1 });
        await page.getByLabel('Kit Steps', { exact: true }).fill('0');
        await page.getByLabel('Kit Steps', { exact: true }).blur();
        expect(await page.getByLabel('Kit Steps', { exact: true }).inputValue() === '12', 'An out-of-range number was kept.');
        expect(await page.getByLabel('Kit Steps slider', { exact: true }).inputValue() === '12', 'The slider does not follow the manual field.');
        await page.getByLabel('Kit Steps slider', { exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        await expectState(page, 'sampler', { sampler: 'er_sde', scheduler: 'simple', steps: 13, cfg: 1 });
        expect(await page.getByLabel('Kit Steps', { exact: true }).inputValue() === '13', 'The manual field does not follow the slider.');
        await page.getByRole('button', { name: 'Kit Random seed', exact: true }).click();
        expect((await state(page)).seed !== 5, 'Random did not change the seed.');
    }],
    ['Existing SelectInput, TextInput and MenuSelect callers keep working through the kit', async page => {
        await page.locator('summary', { hasText: /^Advanced$/ }).click();
        const legacy = page.getByLabel('Legacy select', { exact: true });
        expect(await legacy.evaluate(node => node.selectedOptions[0].textContent) === 'saved-but-removed (not listed)', 'The legacy select hides its missing value.');
        await legacy.selectOption('y');
        await expectState(page, 'legacy', 'y');
        const negative = page.getByLabel('Negative Prompt', { exact: true });
        await negative.fill('blurry');
        await expectState(page, 'negative', 'blurry');
        expect(await negative.evaluate(node => getComputedStyle(node.parentElement).borderLeftWidth) === '4px', 'The negative prompt has no role color.');
        await page.getByLabel('Title', { exact: true }).fill('My title');
        await expectState(page, 'title', 'My title');
        await trigger(page, 'Model version').click();
        await option(page, 'v3').click();
        await expectState(page, 'version', 3);
    }],
];

const only = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let failures = 0;
try {
    for (const [name, run] of scenarios) {
        if (only && !name.toLowerCase().includes(only.toLowerCase())) continue;
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error' && !/favicon|cdn\.tailwindcss|\[vite\]|WebSocket connection/.test(message.text())) errors.push(message.text()); });
        let ok = false, detail = '';
        try {
            await bootstrap(page);
            detail = await run(page) || '';
            ok = errors.length === 0;
            if (errors.length) detail = `page errors: ${JSON.stringify([...new Set(errors)].slice(0, 3))}`;
        } catch (error) { detail = String(error?.message || error).split('\n')[0]; }
        finally { await page.close(); }
        if (!ok) failures++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
    }
    if (!only || shots) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        try {
            await bootstrap(page);
            console.log(`\nOpacity modifier on a theme color (bg-accent/10) computes to: ${await page.evaluate(() => getComputedStyle(document.getElementById('tint')).backgroundColor)}`);
            if (shots) {
                for (const title of ['LoRAs', 'Sampler', 'Advanced']) await page.locator('summary', { hasText: new RegExp(`^${title}$`) }).click();
                await page.waitForTimeout(500);
                await page.screenshot({ path: path.join(shots, `ui-kit-${theme}.png`) });
                await trigger(page, 'LoRA').click();
                await page.getByLabel('Filter LoRA', { exact: true }).fill('style 12');
                await page.waitForTimeout(300);
                await page.screenshot({ path: path.join(shots, `ui-kit-${theme}-list.png`) });
                console.log(`Screenshots saved in ${shots}`);
            }
        } catch (error) { failures++; console.log(`FAIL  Opacity probe and screenshots\n      ${String(error?.message || error).split('\n')[0]}`); }
        await page.close();
    }
} finally { await browser.close(); }
console.log(failures ? `\n${failures} scenario(s) failed.` : '\nAll scenarios passed.');
process.exit(failures ? 1 : 0);
