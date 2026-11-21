import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { withUiKit } from './ui/compileForTest.mjs';

const require = createRequire(import.meta.url), source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const reactURL = pathToFileURL(require.resolve('react')).href;
const stylesURL = compile(source('../services/styleGallery.ts'));
const helpers = compile(`import { isH3LoraPath } from '${stylesURL}';\n` + source('../services/minimaxH3Workflow.ts').replace(/^import .*;\r?$/gm, ''));
const anglesURL = compile(source('../services/characterAnglesWorkflow.ts'));
const civitaiURL = compile(source('../services/civitaiService.ts'));
const workflowURL = compile(source('../services/blazingFastCharacterWorkflow.ts')
    .replace("import template from '../assets/blazingFastCharacterWorkflow.json';", `const template = ${source('../assets/blazingFastCharacterWorkflow.json')};`)
    .replace("from './characterAnglesWorkflow'", `from '${anglesURL}'`)
    .replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './minimaxH3Workflow'", `from '${helpers}'`).replace("from './styleGallery'", `from '${stylesURL}'`));
const constantsURL = compile(source('../constants.ts'));
const styleLibraryURL = compile(source('../services/styleLibrary.ts').replace("from './civitaiService'", `from '${civitaiURL}'`)
    .replace("from './styleGallery'", `from '${stylesURL}'`));
const inputsURL = compile(withUiKit(source('./InputComponents.tsx')));
const browserURL = compile(source('./StyleBrowser.tsx').replace("from 'react'", `from '${reactURL}'`)
    .replace("from 'react-dom'", `from '${pathToFileURL(require.resolve('react-dom')).href}'`)
    .replace("from '../services/styleGallery'", `from '${stylesURL}'`).replace("from '../services/styleLibrary'", `from '${styleLibraryURL}'`));
const componentSource = source('./BlazingFastCharacterPanel.tsx');
const component = await import(compile(`
    import React, { useEffect, useMemo, useRef, useState } from '${reactURL}';
    import { SelectInput, PresetTextInput } from '${inputsURL}';
    import { defaultBlazingSettings, randomBlazingPose, blazingOutputs, blazingPoseCount, blazingPrompts } from '${workflowURL}';
    import { resolveLibraryStyle, styleInstalledLoras } from '${styleLibraryURL}';
    import { inferFlux2Variant } from '${civitaiURL}';
    import { StylePicker } from '${browserURL}';
    import { BACKGROUND_OPTIONS } from '${constantsURL}';
    const DiceIcon = () => null;
    const SaveStyleSamplingButton = ({ style, disabled }) => React.createElement('button', { disabled: disabled || !style }, 'Save sampling as style default');
    import { CHARACTER_ANGLE_OPTIONS, CHARACTER_POSE_OPTIONS, CHARACTER_EXPRESSION_OPTIONS, CHARACTER_NONE_VALUE } from '${anglesURL}';
    import { defaultStyleGallery } from '${stylesURL}';
    import { h3Choices } from '${helpers}';
    const useDispatch = () => () => {}, useSelector = selector => selector({generation:{isLoading:false},library:{items:[]}});
    const useMediaURL = () => '', useStyleGallery = () => ({gallery:defaultStyleGallery(),error:''}), useUnmountCleanup = () => () => {}, useDraftAutosave = () => {};
    const useModelInventory = () => ({inventory:{root:'',scannedAt:null,items:[]},error:''});
    const LibraryPickerModal = () => null, CreationSuiteResult = () => null, comfyOutputImage = () => undefined, comfyOutputText = () => '';
    ${componentSource.replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`));
const render = () => renderToStaticMarkup(React.createElement(component.BlazingFastCharacterPanel, { isComfyUIConnected: false, onModelChange() {}, onManageStyles() {} }));
test('renders offline with left options, right prompt/LoRAs and six outputs by default', () => {
    const html = render();
    assert.ok(html.includes('Blazing Fast character'));
    assert.ok(html.includes('lg:grid-cols-3')); assert.ok(html.includes('lg:col-span-2'));
    assert.ok(html.indexOf('Reference &amp; options') < html.indexOf('Prompt &amp; style'));
    assert.ok(html.indexOf('Prompt &amp; style') < html.indexOf('Additional LoRAs'));
    for (let i = 1; i <= 6; i++) {
        for (const key of ['angle', 'pose', 'expression']) assert.ok(html.includes(`aria-label="${key} for Blazing pose ${i}"`));
        assert.ok(html.includes(`Pose ${i}`));
    }
    assert.ok(html.includes('Generate 6 poses'));
    assert.ok(html.includes('same settings and noise seed'));
    assert.ok(html.includes('Choose style')); assert.ok(html.includes('aria-haspopup="dialog"'));
    assert.ok(!html.includes('aria-label="FLUX2 style"'));
    assert.ok(!html.includes('Pixar')); assert.ok(!html.includes('Enable pose'));
    assert.equal(html.split('Save sampling as style default').length - 1, 1);
});
test('Blazing save captures the editable four fields with its native automatic scheduler', () => {
    const tree = ts.createSourceFile('panel.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let sampling;
    const visit = node => {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'SaveStyleSamplingButton') {
            sampling = node.attributes.properties.find(property => property.name?.getText(tree) === 'sampling').initializer.expression.getText(tree);
        }
        ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(sampling);
    const capture = new Function('settings', 'selectedStyle', `return ${sampling};`);
    assert.deepEqual(capture({ steps: 8, cfg: 0, sampler: 'heun', seed: 12345, megapixels: 2 }),
        { steps: 8, cfg: 0, sampler: 'heun', scheduler: 'flux2' });
    assert.equal(capture({ steps: 8, cfg: 0, sampler: 'heun', useStyleSettings: true }, { settings: { scheduler: 'beta' } }).scheduler, 'beta');
});
test('sampler uses a standard dropdown and completed-image actions accept partial results', () => {
    const html = render();
    assert.ok(html.includes('aria-label="Blazing sampler"'));
    assert.ok(html.includes('aria-label="Number of Blazing poses"'));
    assert.ok(!html.includes('blazing-samplers'));
    assert.ok(componentSource.includes("busy={locked || !image}"));
    assert.ok(componentSource.includes("onSave={() => perform('save', output.id)}"));
    assert.ok(componentSource.includes('partial => { setResult(partial)'));
    assert.ok(componentSource.includes('displayedOutputs.slice(0, 6)'));
});
test('current prompt preview identifies added text and stays separate from the actual last run', () => {
    const html = render();
    assert.ok(html.includes('Blazing pose 1 prompt preview'));
    assert.ok(html.includes('Additional editing prompt: empty.'));
    assert.ok(html.includes('Identity description will be generated'));
    assert.ok(componentSource.includes('Latest run — actual initial prompt'));
    assert.ok(componentSource.includes("comfyOutputText(live.outputs['495'])"));
});
test('sampler choices retain the entire legacy and COMBO catalogs without a name whitelist', async () => {
    const tree = ts.createSourceFile('panel.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let declaration;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'samplerOptions') declaration = node.getText(tree);
        ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(declaration);
    const { choices } = await import(compile(`
        import { h3Choices } from '${helpers}';
        export const choices = info => { const useMemo = fn => fn(); const ${declaration}; return samplerOptions; };
    `));
    const names = ['euler', 'heun', 'dpmpp_2m', 'custom_installed_sampler', 'res_2m'];
    for (const input of [[names], ['COMBO', { options: names }]]) {
        assert.deepEqual(choices({ KSamplerSelect: { input: { required: { sampler_name: input } } } }),
            names.map(value => ({ value, label: value })));
    }
});
test('four LoRA slots reuse the standard dropdown instead of the large datalist', () => {
    const html = render();
    for (let i = 1; i <= 4; i++) {
        assert.match(html, new RegExp(`<select aria-label="Blazing LoRA ${i} filename"`));
    }
    assert.ok(!html.includes('blazing-loras'));
    assert.ok(html.includes('compatible installed LoRAs'));
});
test('background and poses use shared preset dropdowns with custom text and reference defaults', () => {
    const html = render();
    assert.ok(html.includes('aria-label="Blazing background"'));
    for (const label of ['Black Background', 'White Background', 'Gray Background', 'Green Screen Background', 'Natural Studio Background', 'Custom...']) assert.ok(html.includes(label));
    assert.ok(!html.includes('blazing-backgrounds'));
    assert.equal((html.match(/<option value="" selected="">Same as reference<\/option>/g) || []).length, 18);
    for (let i = 1; i <= 6; i++) assert.ok(html.includes(`aria-label="Randomize Blazing pose ${i}"`));
    assert.ok(html.includes('Randomize all poses'));
    assert.ok(html.includes('Reset poses to reference'));
});
test('memoized LoRA choices filter a 2500+ inventory by the exact FLUX2 folder', async () => {
    const tree = ts.createSourceFile('panel.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let declaration;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'loraOptions') declaration = node.getText(tree);
        ts.forEachChild(node, visit);
    };
    visit(tree);
    assert.ok(declaration);
    const { choices } = await import(compile(`
        import { h3Choices } from '${helpers}';
        import { styleInstalledLoras } from '${styleLibraryURL}';
        export const choices = info => {
            const styleModel = 'FLUX2-9B', inventory = { items: [] };
            const useMemo = factory => factory();
            const ${declaration};
            return loraOptions;
        };
    `));
    const flux2 = ['FLUX2\\style.safetensors', 'flux2/characters/hero.safetensors', 'FlUx2\\nested\\detail.safetensors'];
    const others = ['FLUX20\\wrong.safetensors', 'FLUX2-old/wrong.safetensors', 'flux2_style.safetensors', 'SDXL/FLUX2-name.safetensors',
        ...Array.from({ length: 2500 }, (_, i) => `SDXL\\model-${i}.safetensors`)];
    assert.deepEqual(choices({ LoraLoaderModelOnly: { input: { required: { lora_name: [[...others, ...flux2]] } } } }),
        [{ value: '', label: 'None' }, ...flux2.map(name => ({ value: name, label: name }))]);
    assert.deepEqual(choices({}), [{ value: '', label: 'None' }]);
});
test('standard dropdown displays a saved unavailable LoRA without offering it for reselection', async () => {
    const { SelectInput } = await import(inputsURL);
    const html = renderToStaticMarkup(React.createElement(SelectInput, {
        label: 'Blazing LoRA 1 filename', value: 'SDXL/old.safetensors', onChange() {},
        options: [{ value: '', label: 'None' }, { value: 'SDXL/old.safetensors', label: 'Saved; unavailable in FLUX2 list', disabled: true }],
    }));
    assert.match(html, /<option value="SDXL\/old.safetensors" disabled="" selected="">Saved; unavailable in FLUX2 list<\/option>/);
    assert.ok(componentSource.includes('enabled: !!event.target.value && value.enabled'));
    assert.ok(componentSource.includes('disabled={!lora.name}'));
});
test('cancel is outside locked fieldsets; source snapshots, automatic saves and retries are wired', () => {
    assert.match(componentSource, /await saveResults\(generated, abort.signal\)/);
    assert.match(componentSource, /controller.current\?\.abort\(\)/);
    assert.ok(componentSource.indexOf("{running && <button") > componentSource.lastIndexOf('</fieldset>'));
    assert.ok(componentSource.includes('buildBlazingLibraryCaption(image)'));
    assert.ok(componentSource.includes('item.blazingFastOptions?.promptId === value.promptId'));
    assert.ok(componentSource.includes("item.mediaType === 'prompt' && item.linkedResultId === image.id"));
});
test('root navigation and Library restore stay separate from existing Character Angles', () => {
    const app = source('../App.tsx'), library = source('./LibraryPanel.tsx');
    assert.ok(app.includes("label: 'Gestionnaire de styles'"));
    assert.ok(app.includes("['standard', 'Character Angles'], ['blazing-fast', 'Blazing Fast character']"));
    assert.ok(app.includes('mode={isBlazingCharacter ?'));
    assert.ok(app.includes('if (item.blazingFastOptions)'));
    assert.ok(library.includes('Download associated TXT'));
    assert.ok(library.includes("'Open in Blazing Fast character'"));
});
test('Library classifies Blazing snapshots without fabricating legacy generation options', async () => {
    const text = source('./LibraryPanel.tsx'), tree = ts.createSourceFile('LibraryPanel.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = tree.statements.filter(node => ts.isVariableStatement(node)
        && node.declarationList.declarations.some(value => ['getCharacterProvider', 'getCharacterWorkflow'].includes(value.name.getText(tree))));
    const api = await import(compile(declarations.map(node => node.getText(tree)).join('\n') + '\nexport { getCharacterProvider, getCharacterWorkflow };'));
    assert.equal(api.getCharacterProvider({ blazingFastOptions: {} }), 'comfyui');
    assert.equal(api.getCharacterWorkflow({ blazingFastOptions: {} }), 'FLUX2 - Blazing Fast character');
    assert.equal(api.getCharacterWorkflow({ options: { provider: 'comfyui', comfyCharacterMode: 'flux2' } }), 'flux2');
    assert.equal(api.getCharacterProvider({ options: { provider: 'gemini' } }), 'gemini');
    assert.equal(api.getCharacterProvider({}), '');
});
const galleryComponent = await import(compile(`
    import React, { useEffect, useMemo, useState } from '${reactURL}';
    import { PresetTextInput, SelectInput } from '${inputsURL}';
    import { linkStyleLibrary, matchStyleLibrary, resolveLibraryStyle, styleLibraryLoras, styleInstalledLoras } from '${styleLibraryURL}';
    import { StyleBrowser, StyleLibraryPreview, StyleModal } from '${browserURL}';
    import { getComfyRelativePath } from '${civitaiURL}';
    import { defaultStyleGallery, normalizeStyleModel, isH3LoraPath } from '${stylesURL}';
    import { h3Choices, h3LoraChoices } from '${helpers}';
    const useStyleGallery = () => ({gallery:defaultStyleGallery(),error:''});
    const useModelInventory = () => ({inventory:{root:'',scannedAt:null,items:[]},error:'',loading:false,refresh(){}});
    const window = {};
    ${source('./StyleGalleryPanel.tsx').replace(/import[\s\S]*?from\s+'[^']+';/g, '')}
`));
test('gallery renders only one page of seeded cards with model/search filters and import/export management', () => {
    const html = renderToStaticMarkup(React.createElement(galleryComponent.StyleGalleryPanel, { isComfyUIConnected: false }));
    assert.equal((html.match(/<h4/g) || []).length, 24);
    assert.ok(html.includes('Style pages top')); assert.ok(html.includes('Style pages bottom'));
    for (const label of ['Petit', 'Moyen', 'Gros']) assert.ok(html.includes(label));
    for (const text of ['New style', 'Export JSON', 'Import JSON', 'Refresh LoRAs', 'Style model filter', 'Search styles', 'Prompt only']) {
        if (text === 'Prompt only') continue;
        assert.ok(html.includes(text), text);
    }
});
