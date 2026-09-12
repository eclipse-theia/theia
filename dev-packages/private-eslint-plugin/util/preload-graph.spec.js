// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// @ts-check

const assert = require('assert');
const path = require('path');

const { analyzeFile, findLoadTimeNlsCall, resolveModule } = require('./preload-graph');
const { tempFiles } = require('./test/temp-files');

/**
 * A stand-in for a package of the monorepo, together with an installed '@theia/core' laid out the
 * way the workspace links it, i.e. with its sources next to the 'lib' the specifiers point at.
 */
const repo = tempFiles({
    'package.json': '{ "name": "@theia/monorepo" }',
    'node_modules/@theia/core/package.json': '{ "name": "@theia/core", "main": "lib/common/index.js" }',
    'node_modules/@theia/core/src/common/index.ts': "export * from './nls';",
    'node_modules/@theia/core/src/common/nls.ts': 'export const nls = { localize: (key, value) => value };',
    'node_modules/@theia/core/src/browser/localizing.ts': "export const cancel = nls.localizeByDefault('Cancel');",
    'node_modules/external/package.json': '{ "name": "external", "main": "lib/index.js" }',
    'node_modules/no-main/package.json': '{ "name": "no-main" }',
    'packages/my-package/package.json': '{ "name": "@theia/my-package" }',
    'packages/my-package/src/browser/directory/index.ts': 'export const inIndex = true;',
    'packages/my-package/src/browser/sibling.ts': 'export const sibling = true;'
});
after(() => repo.dispose());

/**
 * Writes a source file and analyzes it.
 * @param {string} name
 * @param {string} code
 */
function analyze(name, code) {
    const written = tempFiles({ [name]: code });
    after(() => written.dispose());
    return analyzeFile(written.resolve(name));
}

describe('preload-graph', () => {

    describe('analyzeFile: calls evaluated on load', () => {

        it('finds a call at the top level of the module', () => {
            const { nlsCalls } = analyze('top-level.ts', "export const cancel = nls.localizeByDefault('Cancel');");
            assert.deepStrictEqual(nlsCalls.map(call => call.callee), ['nls.localizeByDefault']);
        });

        it('finds a call in a namespace, which is evaluated with the module', () => {
            const { nlsCalls } = analyze('namespace.ts', `
                export namespace ProgressMessage {
                    export const Cancel = nls.localizeByDefault('Cancel');
                }
            `);
            assert.deepStrictEqual(nlsCalls.map(call => call.callee), ['nls.localizeByDefault']);
        });

        it('finds the localizing Command factories', () => {
            const { nlsCalls } = analyze('command.ts', `
                const close = Command.toDefaultLocalizedCommand({ id: 'close', label: 'Close' });
                const open = Command.toLocalizedCommand({ id: 'open', label: 'Open' }, 'theia/my-package/open');
            `);
            assert.deepStrictEqual(nlsCalls.map(call => call.callee), ['Command.toDefaultLocalizedCommand', 'Command.toLocalizedCommand']);
        });

        it('finds a call in a static field and in a decorator, which run when the class is defined', () => {
            const { nlsCalls } = analyze('class-definition.ts', `
                @contribution(nls.localizeByDefault('Settings'))
                class MyClass {
                    static readonly label = nls.localize('theia/my-package/label', 'Label');
                }
            `);
            assert.deepStrictEqual(nlsCalls.map(call => call.callee).sort(), ['nls.localize', 'nls.localizeByDefault']);
        });

        it('ignores a call in a function, which only runs once it is called', () => {
            const { nlsCalls } = analyze('deferred.ts', `
                export function cancel() { return nls.localizeByDefault('Cancel'); }
                export const lazy = () => nls.localizeByDefault('Cancel');
                class MyClass {
                    label = nls.localizeByDefault('Cancel');
                    getLabel() { return nls.localizeByDefault('Cancel'); }
                }
            `);
            assert.deepStrictEqual(nlsCalls, []);
        });

        it('ignores calls of anything but the NLS API', () => {
            const { nlsCalls } = analyze('unrelated.ts', `
                const formatted = messages.localize('Cancel');
                const command = Command.toCommand({ id: 'close' });
            `);
            assert.deepStrictEqual(nlsCalls, []);
        });
    });

    describe('analyzeFile: imports surviving compilation', () => {

        it('follows an import whose binding is used as a value', () => {
            const { imports } = analyze('value-import.ts', `
                import { MessageService } from './message-service';
                new MessageService();
            `);
            assert.deepStrictEqual(imports.map(entry => entry.specifier), ['./message-service']);
        });

        it('does not follow an import that the compiler erases', () => {
            const { imports } = analyze('erased-import.ts', `
                import type { Erased } from './erased';
                import { type AlsoErased } from './also-erased';
                import { OnlyAType } from './only-a-type';
                import { Unused } from './unused';
                export type { Reexported } from './reexported';
                const useThem = (a: OnlyAType, b: Erased, c: AlsoErased) => undefined;
            `);
            assert.deepStrictEqual(imports, []);
        });

        it('follows an import that is only there for its side effects', () => {
            const { imports } = analyze('side-effect-import.ts', "import './side-effect';");
            assert.deepStrictEqual(imports.map(entry => entry.specifier), ['./side-effect']);
        });

        it('follows a re-export, as a barrel carries the values of the modules behind it', () => {
            const { imports } = analyze('barrel.ts', `
                export * from './all';
                export { Named } from './named';
            `);
            assert.deepStrictEqual(imports.map(entry => entry.specifier), ['./all', './named']);
        });

        it('follows an import equals and a require evaluated on load, but not a dynamic import', () => {
            const { imports } = analyze('require.ts', `
                import legacy = require('./legacy');
                const { ipcRenderer } = require('electron');
                const lazy = () => require('./lazy');
                const dynamic = import('./dynamic');
                console.log(legacy, ipcRenderer, lazy, dynamic);
            `);
            assert.deepStrictEqual(imports.map(entry => entry.specifier), ['./legacy', 'electron']);
        });

        it('does not follow a require without a literal specifier, nor an import equals of a namespace', () => {
            const { imports } = analyze('indirect-require.ts', `
                import alias = Namespace.Member;
                const specifier = './computed';
                const computed = require(specifier);
                console.log(alias, computed);
            `);
            assert.deepStrictEqual(imports, []);
        });
    });

    describe('analyzeFile: sources it cannot analyze', () => {

        it('reports nothing for a file that does not parse, which the compiler reports anyway', () => {
            assert.deepStrictEqual(analyze('broken.ts', "import { from './unterminated;"), { imports: [], nlsCalls: [] });
        });
    });

    describe('resolveModule', () => {

        const from = repo.resolve('packages/my-package/src/browser/entry.ts');

        it('resolves a relative specifier to a source file', () => {
            assert.strictEqual(resolveModule(from, './sibling'), repo.resolve('packages/my-package/src/browser/sibling.ts'));
        });

        it('resolves a relative specifier to the index of a directory', () => {
            assert.strictEqual(resolveModule(from, './directory'), repo.resolve('packages/my-package/src/browser/directory/index.ts'));
        });

        it('resolves the lib path of a workspace package to its source', () => {
            assert.strictEqual(resolveModule(from, '@theia/core/lib/browser/localizing'), repo.resolve('node_modules/@theia/core/src/browser/localizing.ts'));
        });

        it('resolves a workspace package without a path through its main', () => {
            assert.strictEqual(resolveModule(from, '@theia/core'), repo.resolve('node_modules/@theia/core/src/common/index.ts'));
        });

        it('does not resolve a module without sources, such as a published dependency', () => {
            assert.strictEqual(resolveModule(from, 'external/lib/index'), undefined);
        });

        it('does not resolve a path of a package outside of its compiled output', () => {
            // '@theia/core/shared/...' re-exports a dependency and is not compiled from 'src'.
            assert.strictEqual(resolveModule(from, '@theia/core/shared/inversify'), undefined);
        });

        it('does not resolve a package without a path whose main is missing', () => {
            assert.strictEqual(resolveModule(from, 'no-main'), undefined);
        });

        it('does not resolve a module that is not installed', () => {
            assert.strictEqual(resolveModule(from, 'not-installed'), undefined);
        });

        it('does not resolve a relative specifier without a source file', () => {
            assert.strictEqual(resolveModule(from, './missing'), undefined);
        });
    });

    describe('findLoadTimeNlsCall', () => {

        const graph = tempFiles({
            'clean.ts': 'export const clean = true;',
            'entry.ts': "export * from './barrel';",
            'barrel.ts': "export * from './localizing';",
            'localizing.ts': "export const cancel = nls.localizeByDefault('Cancel');",
            'cyclic.ts': "export * from './cyclic-back';\nexport const cyclic = true;",
            'cyclic-back.ts': "export * from './cyclic';\nexport const back = true;",
            'shortest.ts': "export * from './barrel';\nexport * from './localizing';"
        });
        after(() => graph.dispose());

        it('reports nothing for a module that localizes nowhere', () => {
            assert.strictEqual(findLoadTimeNlsCall(graph.resolve('clean.ts')), undefined);
        });

        it('reports the chain of imports leading to the call', () => {
            const found = findLoadTimeNlsCall(graph.resolve('entry.ts'));
            assert.strictEqual(found?.nlsCall.callee, 'nls.localizeByDefault');
            assert.deepStrictEqual(found?.chain, ['entry.ts', 'barrel.ts', 'localizing.ts'].map(file => graph.resolve(file)));
        });

        it('reports the shortest chain', () => {
            const found = findLoadTimeNlsCall(graph.resolve('shortest.ts'));
            assert.deepStrictEqual(found?.chain, ['shortest.ts', 'localizing.ts'].map(file => graph.resolve(file)));
        });

        it('terminates on a cycle', () => {
            assert.strictEqual(findLoadTimeNlsCall(graph.resolve('cyclic.ts')), undefined);
        });

        it('reports nothing for a file that does not exist', () => {
            assert.strictEqual(findLoadTimeNlsCall(path.join(path.dirname(graph.resolve('clean.ts')), 'missing.ts')), undefined);
        });
    });
});
