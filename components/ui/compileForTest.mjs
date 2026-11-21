// Test helper: compiles the UI kit to data: URLs so a component source that imports it can be loaded by node --test.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = text => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64')}`;
const packages = { react: pathToFileURL(require.resolve('react')).href, 'react-dom': pathToFileURL(require.resolve('react-dom')).href };
const link = (text, modules, prefix) => Object.entries({ ...packages, ...Object.fromEntries(Object.entries(modules).map(([name, url]) => [`${prefix}${name}`, url])) })
    .reduce((source, [name, url]) => source.replace(`from '${name}'`, `from '${url}'`), text);

/** Compiled kit modules by file name, in dependency order. */
export const uiModules = {};
for (const file of ['styles.ts', 'Select.tsx', 'PromptBox.tsx', 'Accordion.tsx', 'fields.tsx', 'SettingsLayout.tsx']) {
    uiModules[file.replace(/\.tsx?$/, '')] = compile(link(read(`./${file}`), uiModules, './'));
}
/** Points the react and UI kit imports of a component source at loadable URLs. prefix is the kit's path as written in that source. */
export const withUiKit = (text, prefix = './ui/') => link(text, uiModules, prefix);
