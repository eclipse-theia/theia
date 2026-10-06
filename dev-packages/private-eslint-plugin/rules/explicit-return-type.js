// @ts-check
// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'require return type annotations on functions, methods and method signatures (TSLint typedef: call-signature)'
        },
        schema: []
    },
    create(context) {
        const message = 'Expected a return type annotation.';
        const isConstructorOrSetter = fn => {
            const parent = fn.parent;
            return ((parent.type === 'MethodDefinition' || parent.type === 'TSAbstractMethodDefinition') && (parent.kind === 'constructor' || parent.kind === 'set'))
                || (parent.type === 'Property' && parent.kind === 'set');
        };
        const check = (node, excluded = false) => {
            if (!node.returnType && !excluded) {
                context.report({ node: node.id ?? (node.parent && node.parent.key) ?? node, message });
            }
        };
        return {
            FunctionDeclaration: node => check(node),
            TSDeclareFunction: node => check(node),
            FunctionExpression: node => check(node, isConstructorOrSetter(node)),
            TSEmptyBodyFunctionExpression: node => check(node, isConstructorOrSetter(node)),
            TSMethodSignature: node => check(node)
        };
    }
};
