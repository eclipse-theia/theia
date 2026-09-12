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

const fs = require('fs');
const path = require('path');
const { RuleTester } = require('eslint');

const rule = require('./preload-localization-check');
const { tempFiles } = require('../util/test/temp-files');

/**
 * A stand-in for the monorepo, with a package declaring the three kinds of preload entry point and
 * an installed '@theia/core' whose messaging module, one of the modules of 'preload-phase-modules.json',
 * the frontend loads before the preload phase is over.
 */
const repo = tempFiles({
    'package.json': '{ "name": "@theia/monorepo" }',
    'node_modules/@theia/core/package.json': '{ "name": "@theia/core", "main": "lib/common/index.js" }',
    'node_modules/@theia/core/src/browser/messaging/messaging-frontend-module.ts': "export * from '../../common';",
    'node_modules/@theia/core/src/common/index.ts': "export * from './core-preferences';",
    'node_modules/@theia/core/src/common/core-preferences.ts': "export const label = nls.localizeByDefault('Files');",
    'node_modules/@theia/core/src/browser/configured-entry-point.ts': "export * from '../common';",
    // A module of '@theia/core' that the frontend only loads once the preload phase is over.
    'node_modules/@theia/core/src/browser/after-the-preload-phase.ts': "export * from '../common';",
    'packages/my-package/package.json': JSON.stringify({
        name: '@theia/my-package',
        theiaExtensions: [
            { frontendPreload: 'lib/browser/preload-module', frontend: 'lib/browser/frontend-module' },
            { frontendPreload: 'lib/browser/js-preload-module' },
            { preload: 'lib/electron-browser/preload' },
            { frontendOnlyPreload: 'lib/browser-only/preload-module' }
        ]
    }),
    // The entry points themselves, whose content the test cases provide.
    'packages/my-package/src/browser/preload-module.ts': '',
    'packages/my-package/src/browser/js-preload-module.js': '',
    'packages/my-package/src/electron-browser/preload.ts': '',
    'packages/my-package/src/browser-only/preload-module.ts': '',
    // The modules a preload entry point may pull in.
    'packages/my-package/src/browser/clean.ts': 'export const clean = true;',
    'packages/my-package/src/browser/localizing.ts': "export const cancel = nls.localizeByDefault('Cancel');",
    'packages/my-package/src/browser/barrel.ts': "export * from './localizing';",
    'packages/my-package/src/browser/lazy.ts': 'export const cancel = () => nls.localizeByDefault(\'Cancel\');',
    'packages/my-package/src/browser/types.ts': 'export interface Options { id: string }',
    // A package without any preload entry point at all.
    'packages/other-package/package.json': '{ "name": "@theia/other-package" }',
    'packages/other-package/src/browser/localizing.ts': "export const cancel = nls.localizeByDefault('Cancel');"
});
after(() => repo.dispose());

/**
 * A second spelling of the first stand-in, reaching it through a link, which is how a checkout below
 * a linked directory is linted.
 */
const linkedRepo = (() => {
    const links = tempFiles({});
    after(() => links.dispose());
    const link = links.resolve('linked');
    // A junction, because Windows only lets a privileged process create a symbolic link, whereas a
    // junction is what npm itself links a workspace package with. The type is ignored elsewhere.
    fs.symlinkSync(repo.resolve('.'), link, 'junction');
    return link;
})();

/**
 * The display of a file in a message, which the rule makes relative to the working directory.
 * @param {string} relativePath path within the stand-in monorepo.
 */
const display = relativePath => path.relative(process.cwd(), repo.resolve(relativePath)).replace(/\\/g, '/');

const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' }
});

ruleTester.run('preload-localization-check', rule, {
    valid: [
        {
            name: 'a preload entry point importing modules that do not localize on load',
            code: `
                import { injectable } from 'inversify';
                import { clean } from './clean';
                import { cancel } from './lazy';
                console.log(injectable, clean, cancel());
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts')
        },
        {
            name: 'a preload entry point localizing from a function rather than on load',
            code: `
                export function getCancel() { return nls.localizeByDefault('Cancel'); }
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts')
        },
        {
            name: 'a preload entry point importing a localizing module for its types only',
            code: `
                import type { Localizing } from './localizing';
                import { Options } from './types';
                export const use = (a: Localizing, b: Options) => undefined;
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts')
        },
        {
            name: 'a module of the frontend, which runs once the preload phase is over',
            code: `
                import { cancel } from './localizing';
                export const label = nls.localizeByDefault('Cancel');
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/browser/frontend-module.ts')
        },
        {
            name: 'a module of a package that declares no preload entry point',
            code: `
                import { cancel } from './localizing';
                export const label = nls.localizeByDefault('Cancel');
                console.log(cancel);
            `,
            filename: repo.resolve('packages/other-package/src/browser/browser-module.ts')
        },
        {
            name: 'a file outside of any package',
            code: "export const label = nls.localizeByDefault('Cancel');",
            filename: path.join(path.parse(repo.resolve('.')).root, 'outside', 'module.ts')
        },
        {
            name: 'a module of @theia/core that is not part of the preload phase',
            code: `
                import { label } from '../common';
                console.log(label);
            `,
            filename: repo.resolve('node_modules/@theia/core/src/browser/after-the-preload-phase.ts')
        }
    ],
    invalid: [
        {
            name: 'a preload entry point localizing while it is loaded',
            code: `
                export const cancel = nls.localizeByDefault('Cancel');
                export namespace Progress {
                    export const Cancel = nls.localize('theia/my-package/cancel', 'Cancel');
                }
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts'),
            errors: [
                { messageId: 'loadTimeNls', data: { callee: 'nls.localizeByDefault' } },
                { messageId: 'loadTimeNls', data: { callee: 'nls.localize' } }
            ]
        },
        {
            name: 'a preload entry point importing a module that localizes while it is loaded',
            code: `
                import { cancel } from './localizing';
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts'),
            errors: [{
                messageId: 'importedLoadTimeNls',
                data: { specifier: './localizing', callee: 'nls.localizeByDefault' }
            }]
        },
        {
            name: 'a preload entry point pulling in a localizing module through a barrel',
            code: `
                import { cancel } from './barrel';
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/browser/preload-module.ts'),
            errors: [{
                messageId: 'transitiveLoadTimeNls',
                data: {
                    specifier: './barrel',
                    callee: 'nls.localizeByDefault',
                    module: display('packages/my-package/src/browser/localizing.ts'),
                    chain: `${display('packages/my-package/src/browser/barrel.ts')} -> ${display('packages/my-package/src/browser/localizing.ts')}`
                }
            }]
        },
        {
            name: 'an Electron preload entry point',
            code: `
                import { cancel } from './../browser/localizing';
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/electron-browser/preload.ts'),
            errors: [{ messageId: 'importedLoadTimeNls', data: { specifier: './../browser/localizing', callee: 'nls.localizeByDefault' } }]
        },
        {
            name: 'a frontend-only preload entry point',
            code: `
                import { cancel } from '../browser/localizing';
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/browser-only/preload-module.ts'),
            errors: [{ messageId: 'importedLoadTimeNls', data: { specifier: '../browser/localizing', callee: 'nls.localizeByDefault' } }]
        },
        {
            name: 'a module the frontend loads before the preload phase, even though no package.json declares it',
            code: `
                import { label } from '../../common';
                console.log(label);
            `,
            filename: repo.resolve('node_modules/@theia/core/src/browser/messaging/messaging-frontend-module.ts'),
            errors: [{
                messageId: 'transitiveLoadTimeNls',
                data: {
                    specifier: '../../common',
                    callee: 'nls.localizeByDefault',
                    module: display('node_modules/@theia/core/src/common/core-preferences.ts'),
                    chain: `${display('node_modules/@theia/core/src/common/index.ts')} -> ${display('node_modules/@theia/core/src/common/core-preferences.ts')}`
                }
            }]
        },
        {
            // The entry points that no package.json declares are resolved through 'node_modules',
            // where a workspace package is itself a link, so they only match the linted file if
            // both are canonicalized.
            name: 'a preload entry point of a workspace reached through a link',
            code: `
                import { label } from '../../common';
                console.log(label);
            `,
            filename: path.join(linkedRepo, 'node_modules/@theia/core/src/browser/messaging/messaging-frontend-module.ts'),
            errors: [{
                messageId: 'transitiveLoadTimeNls',
                data: {
                    specifier: '../../common',
                    callee: 'nls.localizeByDefault',
                    module: display('node_modules/@theia/core/src/common/core-preferences.ts'),
                    chain: `${display('node_modules/@theia/core/src/common/index.ts')} -> ${display('node_modules/@theia/core/src/common/core-preferences.ts')}`
                }
            }]
        },
        {
            name: 'a preload entry point configured through the options',
            code: `
                import { label } from '../common';
                console.log(label);
            `,
            options: [{ additionalEntryPoints: ['@theia/core/lib/browser/configured-entry-point'] }],
            filename: repo.resolve('node_modules/@theia/core/src/browser/configured-entry-point.ts'),
            errors: [{
                messageId: 'transitiveLoadTimeNls',
                data: {
                    specifier: '../common',
                    callee: 'nls.localizeByDefault',
                    module: display('node_modules/@theia/core/src/common/core-preferences.ts'),
                    chain: `${display('node_modules/@theia/core/src/common/index.ts')} -> ${display('node_modules/@theia/core/src/common/core-preferences.ts')}`
                }
            }]
        },
        {
            // The option adds to the modules of the preload phase rather than replacing them, which
            // a configured entry point of its own would not tell apart from the opposite.
            name: 'a module of the preload phase while the options configure another entry point',
            code: `
                import { label } from '../../common';
                console.log(label);
            `,
            options: [{ additionalEntryPoints: ['@theia/core/lib/browser/configured-entry-point'] }],
            filename: repo.resolve('node_modules/@theia/core/src/browser/messaging/messaging-frontend-module.ts'),
            errors: [{
                messageId: 'transitiveLoadTimeNls',
                data: {
                    specifier: '../../common',
                    callee: 'nls.localizeByDefault',
                    module: display('node_modules/@theia/core/src/common/core-preferences.ts'),
                    chain: `${display('node_modules/@theia/core/src/common/index.ts')} -> ${display('node_modules/@theia/core/src/common/core-preferences.ts')}`
                }
            }]
        }
    ]
});

// A preload entry point may be plain JavaScript, which is linted with the default parser. Its scope
// analysis says nothing about whether a reference is a value or a type, so every import counts.
new RuleTester({ parserOptions: { ecmaVersion: 2020, sourceType: 'module' } }).run('preload-localization-check', rule, {
    valid: [
        {
            name: 'a JavaScript preload entry point importing a module that does not localize on load',
            code: `
                import { clean } from './clean';
                console.log(clean);
            `,
            filename: repo.resolve('packages/my-package/src/browser/js-preload-module.js')
        }
    ],
    invalid: [
        {
            name: 'a JavaScript preload entry point importing a module that localizes while it is loaded',
            code: `
                import { cancel } from './localizing';
                console.log(cancel);
            `,
            filename: repo.resolve('packages/my-package/src/browser/js-preload-module.js'),
            errors: [{ messageId: 'importedLoadTimeNls', data: { specifier: './localizing', callee: 'nls.localizeByDefault' } }]
        }
    ]
});
