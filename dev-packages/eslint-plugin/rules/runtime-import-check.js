// @ts-check
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

const path = require('path');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'prevent imports from folders meant for incompatible runtimes.',
            url: 'https://github.com/eclipse-theia/theia/wiki/Code-Organization'
        },
    },
    create(context) {
        const relativeFilePath = path.relative(context.getCwd(), path.resolve(context.getFilename()));

        /**
         * Check if the import is valid according to out code organization guidelines:
         * - https://github.com/eclipse-theia/theia/wiki/Code-Organization
         * @param {*} node 
         */
        function checkModuleImport(node) {
            const module = /** @type {string} */(node.value);

            let position = Infinity;
            let restrictedFolders;
            let matchedFolder;

            for (const [folder, restricted] of restrictedMapping) {
                const indexOf = relativeFilePath.indexOf(folder);
                if (indexOf !== -1 && indexOf < position) {
                    restrictedFolders = restricted;
                    matchedFolder = folder;
                    position = indexOf;
                }
            }
            if (restrictedFolders && restrictedFolders.some(folder => module.includes(folder))) {
                context.report({
                    node,
                    message: `${module} cannot be imported in '${matchedFolder}'`
                });
            }
        }

        return {
            ImportDeclaration(node) {
                checkModuleImport(node.source);
            },
            TSExternalModuleReference(node) {
                checkModuleImport(node.expression);
            },
        }
    },
}

/** Code organization folders in the project */
const folders = {
    common: '/common/',
    browser: '/browser/',
    node: '/node/',
    electronCommon: '/electron-common/',
    electronBrowser: '/electron-browser/',
    electronNode: '/electron-node/',
    electronMain: '/electron-main/',
};

/** The mapping of folders to their restricted folders. */
const restrictedMapping = [
    // We start by declaring the allowed imports, we'll negate those later.
    [folders.common, []],
    [folders.browser, [folders.common]],
    [folders.node, [folders.common]],
    [folders.electronCommon, [folders.common]],
    [folders.electronBrowser, [folders.electronCommon, folders.browser, folders.common]],
    [folders.electronNode, [folders.electronCommon, folders.node, folders.common]],
    [folders.electronMain, [folders.electronCommon, folders.node, folders.common]]
].map(
    // Convert the mapping from "allowed" to a list of "restricted" folders.
    ([folder, allowed]) => /** @type {[string, string[]]} */([
        // We want to restrict everything that's either not `folder` nor in the list of allowed folders.
        folder,
        Object.values(folders).filter(f => f !== folder && !allowed.includes(f))
    ])
);
