// @ts-check
"use-strict";
/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/**
 * @file Common data and functions to manage shared core dependencies.
 */

const { theiaReExports } = require('../package.json');

/**
 * Path prefix used to require shared dependencies such as
 * ```ts
 * const sharedDep = require(theiaCoreSharedPrefix + 'sharedDep')
 * ```
 * @type {string}
 */
const theiaCoreSharedPrefix = '@theia/core/shared/';
/**
 * List of modules exported like
 * ```ts
 * export * from 'module';
 * ```
 * @type {{module: string, alias: string}[]}
 */
const exportStar = theiaReExports['export *'].map(entry => {
    const [module, alias = entry] = entry.split(':', 2);
    return { module, alias };
});
/**
 * List of modules exported via namespace like
 * ```ts
 * import namespace = require('module');
 * export = namespace;
 * ```
 * @type {{module: string, namespace: string}[]}
 */
const exportEqual = theiaReExports['export ='].map(entry => {
    const [module, namespace = entry] = entry.split(' as ', 2);
    return { module, namespace };
});
/**
 * List of all shared modules.
 * @type {string[]}
 */
const sharedModules = [
    'electron',
    ...exportStar.map(entry => entry.module),
    ...exportEqual.map(entry => entry.module),
].sort();

module.exports = {
    exportStar,
    exportEqual,
    sharedModules,
    theiaCoreSharedPrefix,
    getPackageName,
    isSharedModule,
    getTheiaCoreSharedModule,
};

/**
 * Only keep the first two parts of the package name e.g.,
 * - `@a/b/c/...` => `@a/b`
 * - `a/b/c/...` => `a`
 * @param {string} package
 * @returns {string}
 */
function getPackageName(package) {
    const slice = package.startsWith('@') ? 2 : 1;
    return package.split('/', slice + 1)
        .slice(0, slice)
        .join('/');
}

/**
 * @param {string} module
 * @returns {boolean} is the module part of the shared dependencies
 */
function isSharedModule(module) {
    return sharedModules.includes(module);
}

/**
 * Given an import like `@theia/core/shared/a/b/c` it will return `a/b/c`.
 * If the import is not from `@theia/core/shared/` it will return undefined.
 * @param {string} module
 * @returns {string | undefined}
 */
function getTheiaCoreSharedModule(module) {
    if (module.startsWith(theiaCoreSharedPrefix)) {
        const shared = module.substr(theiaCoreSharedPrefix.length);
        if (shared.length > 0) {
            return shared;
        }
    }
}
