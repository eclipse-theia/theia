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

const path = require('path');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'prevent imports from \'src\'.',
        },
    },
    create(context) {
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
            const extension = path.parse(module).ext;
            const re = /^@theia\/\S+\/src\//;
            if (re.test(module) && extension === '') {
                context.report({
                    node,
                    message: `'${module}' should not be imported with '/src/'`,
                    fix: function (fixer) {
                        const updatedModule = `'${module.replace('/src/', '/lib/')}'`;
                        return fixer.replaceText(node, updatedModule);
                    }
                });
            }
        }
    }
};
