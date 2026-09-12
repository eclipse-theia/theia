// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

const { preloadPhaseModules } = require('./frontend-generator');
const { tempFiles } = require('./test/temp-files');

/**
 * A stand-in for the generator, written the way the real one is: the emitted 'index.js' is a
 * template literal with interpolated expressions, one of which picks the messaging module by
 * target and another of which contributes a whole block only for a browser-only application.
 */
const generatorSource = `
export class FrontendGenerator {
    protected compileIndexJs(frontendModules: Map<string, string>, frontendPreloadModules: Map<string, string>): string {
        return \`
require('reflect-metadata');
const { Container } = require('@theia/core/shared/inversify');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/config-provider');

async function preload(container) {
\${Array.from(frontendPreloadModules.values(), jsModulePath => \`
    await load(container, \${this.importOrRequire()}('\${jsModulePath}'));\`).join(EOL)}
    const { Preloader } = require('@theia/core/lib/browser/preload/preloader');
    await container.get(Preloader).initialize();
}

module.exports = (async () => {
    const { messagingFrontendModule } = require('@theia/core/lib/\${this.pck.isBrowser() || this.pck.isBrowserOnly()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
    const container = new Container();
    \${this.ifBrowserOnly(\`const { messagingFrontendOnlyModule } = require('@theia/core/lib/browser-only/messaging/messaging-frontend-only-module');
    container.load(messagingFrontendOnlyModule);\`)}

    await preload(container);

    const { FrontendApplication } = require('@theia/core/lib/browser');
    \${this.ifMonaco(() => \`const { MonacoInit } = require('@theia/monaco/lib/browser/monaco-init');\`)}
})();\`;
    }
}
`;

/**
 * Lays out a workspace with an '@theia/application-manager' whose generator has the given source.
 * @param {string} source
 */
function workspace(source) {
    const files = tempFiles({
        'packages/my-package/package.json': '{ "name": "@theia/my-package" }',
        'node_modules/@theia/application-manager/package.json': '{ "name": "@theia/application-manager" }',
        'node_modules/@theia/application-manager/src/generator/frontend-generator.ts': source
    });
    after(() => files.dispose());
    return files.resolve('packages/my-package/package.json');
}

describe('frontend-generator', () => {

    describe('preloadPhaseModules', () => {

        it('reads the modules the generator emits before the end of the preload phase', () => {
            assert.deepStrictEqual(preloadPhaseModules(workspace(generatorSource)), [
                'reflect-metadata',
                '@theia/core/shared/inversify',
                '@theia/core/lib/browser/config-provider',
                '@theia/core/lib/browser/preload/preloader',
                '@theia/core/lib/browser/messaging/messaging-frontend-module',
                '@theia/core/lib/electron-browser/messaging/electron-messaging-frontend-module',
                '@theia/core/lib/browser-only/messaging/messaging-frontend-only-module'
            ]);
        });

        it('reads nothing from a generator that never ends the preload phase', () => {
            assert.strictEqual(preloadPhaseModules(workspace(generatorSource.replace('await preload(container);', ''))), undefined);
        });

        it('reads nothing from a generator without the method emitting the index', () => {
            assert.strictEqual(preloadPhaseModules(workspace(generatorSource.replace('compileIndexJs', 'compileSomethingElse'))), undefined);
        });

        it('reads nothing from a generator that does not parse', () => {
            assert.strictEqual(preloadPhaseModules(workspace('export class FrontendGenerator { compileIndexJs(: string {')), undefined);
        });

        it('reads nothing where the generator is not part of the workspace', () => {
            const files = tempFiles({ 'packages/my-package/package.json': '{ "name": "@theia/my-package" }' });
            after(() => files.dispose());
            assert.strictEqual(preloadPhaseModules(files.resolve('packages/my-package/package.json')), undefined);
        });
    });

    describe('preloadPhaseModules of the generator of this repository', () => {

        const modules = preloadPhaseModules(path.resolve(__dirname, '..', 'package.json'));

        it('covers the modules the frontend loads before the preload phase is over', () => {
            assert.deepStrictEqual(modules?.filter(module => module.startsWith('@theia/core/lib/')).sort(), [
                '@theia/core/lib/browser-only/messaging/messaging-frontend-only-module',
                '@theia/core/lib/browser/frontend-application-config-provider',
                '@theia/core/lib/browser/messaging/messaging-frontend-module',
                '@theia/core/lib/browser/preload/preloader',
                '@theia/core/lib/electron-browser/messaging/electron-messaging-frontend-module'
            ]);
        });

        it('covers nothing the frontend only loads once the preload phase is over', () => {
            // '@theia/core/lib/browser' and the Monaco initialization are required further down in
            // the emitted index, where localized strings are fine.
            assert.ok(!modules?.some(module => module === '@theia/core/lib/browser' || module.startsWith('@theia/monaco/')), `unexpected modules in ${modules}`);
        });
    });
});
