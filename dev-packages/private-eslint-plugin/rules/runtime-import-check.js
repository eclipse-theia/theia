// @ts-check
// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

/* eslint-disable max-len */

const path = require('path');

/**
 * Runtime-specific folders according to our coding guidelines.
 */
const folders = {
    common: 'common',
    browser: 'browser',
    node: 'node',
    electronCommon: 'electron-common',
    electronBrowser: 'electron-browser',
    electronNode: 'electron-node',
    electronMain: 'electron-main',
};

/**
 * @typedef {object} ImportRule
 * @property {string[]} allowed
 * @property {string[]} restricted
 */

/**
 * @param {string} src
 * @param {string[]} allowedFolders
 * @returns {[string, ImportRule]}
 */
function allow(src, allowedFolders) {
    const allowed = [src, ...allowedFolders];
    const restricted = Object.values(folders).filter(folder => !allowed.includes(folder));
    return [src, { allowed, restricted }];
}

/**
 * Mapping of folders to the list of allowed/restricted folders to import from.
 * @type {[string, ImportRule][]}
 */
const importRuleMapping = [
    allow(folders.common, []),
    allow(folders.browser, [folders.common]),
    allow(folders.node, [folders.common]),
    allow(folders.electronCommon, [folders.common]),
    allow(folders.electronBrowser, [folders.electronCommon, folders.browser, folders.common]),
    allow(folders.electronNode, [folders.electronCommon, folders.node, folders.common]),
    allow(folders.electronMain, [folders.electronCommon, folders.node, folders.common]),
];

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'prevent imports from folders meant for incompatible runtimes.',
            url: 'https://github.com/eclipse-theia/theia/tree/master/doc/code-organization.md'
        },
    },
    create(context) {
        let relativeFilePath = path.relative(context.getCwd(), context.getFilename());
        // Normalize the path so we only deal with forward slashes.
        if (process.platform === 'win32') {
            relativeFilePath = relativeFilePath.replace(/\\/g, '/');
        }
        // Search for a folder following our naming conventions, keep the left-most match.
        // e.g. `src/electron-node/browser/node/...` should match `electron-node`
        let lowestIndex = Infinity;
        /** @type {ImportRule | undefined} */
        let matchedImportRule;
        /** @type {string | undefined} */
        let matchedFolder;
        for (const [folder, importRule] of importRuleMapping) {
            const index = relativeFilePath.indexOf(`/${folder}/`);
            if (index !== -1 && index < lowestIndex) {
                matchedImportRule = importRule;
                matchedFolder = folder;
                lowestIndex = index;
            }
        }
        // File doesn't follow our naming convention so we'll bail now.
        if (matchedFolder === undefined) {
            return {};
        }
        return {
            ImportDeclaration(node) {
                checkModuleImport(node.source);
            },
            TSExternalModuleReference(node) {
                checkModuleImport(node.expression);
            },
        };
        function checkModuleImport(node) {
            const module = /** @type {string} */(node.value);
            if (matchedImportRule.restricted.some(restricted => module.includes(`/${restricted}/`) || module.endsWith(`/${restricted}`))) {
                context.report({
                    node,
                    message: `'${module}' cannot be imported in '${matchedFolder}', only '${matchedImportRule.allowed.join(', ')}' ${matchedImportRule.allowed.length === 1 ? 'is' : 'are'} allowed.`
                });
            }
        }
    },
};
