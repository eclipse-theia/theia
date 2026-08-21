// *****************************************************************************
// Copyright (C) 2026 ankitsharma101 and others.
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

/**
 * @typedef {import('@typescript-eslint/utils').TSESTree.ClassDeclaration} ClassDeclaration
 * @typedef {import('@typescript-eslint/utils').TSESTree.ClassExpression} ClassExpression
 * @typedef {import('@typescript-eslint/utils').TSESTree.Decorator} Decorator
 * @typedef {import('estree').Node} Node
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

const { derivePackageName, reportingMalformedPackageJson } = require('../util/package-json');

/**
 * The console methods `ILogger` can replace. Members without a logger counterpart, such as
 * `console.time` or `console.group`, are left alone.
 */
const loggingConsoleMethods = new Set(['log', 'trace', 'debug', 'info', 'warn', 'error']);

/** @type {RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce ILogger usage and naming conventions in @injectable classes',
            recommended: true,
            url: 'https://github.com/eclipse-theia/theia/tree/master/doc/coding-guidelines.md#logging'
        },
        messages: {
            noConsole: 'Use injected ILogger instead of console statements in @injectable classes.',
            missingNamed: 'Injected ILoggers must use the @named decorator.',
            invalidNameFormat: 'Logger name must follow the convention: [optional-purpose]package-name:class-name#optional-suffix',
            classNameMismatch: 'Logger name\'s class segment should be "{{expected}}" (the enclosing class), but found "{{actual}}".',
            packageNameMismatch: 'Logger name\'s package segment should be "{{expected}}" (the enclosing package), but found "{{actual}}".'
        },
        schema: []
    },
    create(context) {
        // Runtimes and files without an ILogger binding are exempted through ESLint itself, see
        // the 'named-logger-check' overrides in configs/errors.eslintrc.json and the inline
        // 'eslint-disable' comments in the logger and DI bootstrap files.
        const expectedPackageName = reportingMalformedPackageJson(context, () => derivePackageName(context.getFilename()));

        /** @type {Array<{ isInjectable: boolean, className: string | undefined }>} */
        const injectableClassStack = [];

        /**
         * True only when the `console` of `console.log(...)` is the real global one, i.e. it is
         * not shadowed by a local variable, parameter, or import of the same name. The reference
         * lives in the scope of the call itself, as neither the member expression nor the call
         * opens a new scope between the two.
         * @param {Node} callNode the `console.log(...)` call.
         * @param {Node} identifierNode the `console` of that call.
         */
        function isGlobalConsole(callNode, identifierNode) {
            const reference = context.sourceCode.getScope(callNode).references.find(r => r.identifier === identifierNode);
            // An unresolved reference, or one resolving to a variable without local `defs` (how
            // ESLint represents environment globals), is the real global console. Any variable
            // with a def (parameter, `const console = ...`, an import) is a shadow.
            return !reference?.resolved || reference.resolved.defs.length === 0;
        }

        /**
         * @param {ClassDeclaration | ClassExpression} node
         */
        function enterClass(node) {
            const hasInjectable = node.decorators?.some(
                (/** @type {Decorator} */ d) =>
                    d.expression &&
                    d.expression.type === 'CallExpression' &&
                    d.expression.callee &&
                    d.expression.callee.type === 'Identifier' &&
                    d.expression.callee.name === 'injectable'
            );
            injectableClassStack.push({ isInjectable: !!hasInjectable, className: node.id ? node.id.name : undefined });
        }

        function exitClass() {
            injectableClassStack.pop();
        }

        /**
         * The class a node belongs to, which is always the innermost one. A nested class is not
         * covered by an enclosing `@injectable()` class and vice versa.
         */
        function enclosingClass() {
            return injectableClassStack[injectableClassStack.length - 1];
        }

        return {
            ClassDeclaration: enterClass,
            'ClassDeclaration:exit': exitClass,
            ClassExpression: enterClass,
            'ClassExpression:exit': exitClass,

            CallExpression(node) {
                if (
                    enclosingClass()?.isInjectable &&
                    node.callee &&
                    node.callee.type === 'MemberExpression' &&
                    node.callee.object &&
                    node.callee.object.type === 'Identifier' &&
                    node.callee.object.name === 'console' &&
                    node.callee.property.type === 'Identifier' &&
                    loggingConsoleMethods.has(node.callee.property.name) &&
                    isGlobalConsole(node, node.callee.object)
                ) {
                    context.report({ node, messageId: 'noConsole' });
                }
            },

            Decorator(node) {
                if (
                    node.expression &&
                    node.expression.type === 'CallExpression' &&
                    node.expression.callee &&
                    node.expression.callee.type === 'Identifier' &&
                    node.expression.callee.name === 'inject'
                ) {
                    const arg = node.expression.arguments[0];
                    if (arg && arg.type === 'Identifier' && arg.name === 'ILogger') {
                        const target = node.parent;
                        const allDecorators = target.decorators || [];

                        const namedDecorator = allDecorators.find(
                            (/** @type {Decorator} */ d) =>
                                d.expression &&
                                d.expression.type === 'CallExpression' &&
                                d.expression.callee &&
                                d.expression.callee.type === 'Identifier' &&
                                d.expression.callee.name === 'named'
                        );

                        if (!namedDecorator) {
                            context.report({ node: target, messageId: 'missingNamed' });
                        } else {
                            const namedArg = namedDecorator.expression.arguments[0];
                            if (namedArg && namedArg.type === 'Literal' && typeof namedArg.value === 'string') {
                                const namePattern = /^(?:\[[a-zA-Z0-9_.-]+\])?([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+)(?:#[a-zA-Z0-9_.-]+)?$/;
                                const match = namePattern.exec(namedArg.value);

                                if (!match) {
                                    context.report({ node: namedArg, messageId: 'invalidNameFormat' });
                                } else {
                                    const [, actualPackageName, actualClassName] = match;
                                    const expectedClassName = enclosingClass()?.className;

                                    if (expectedClassName && actualClassName !== expectedClassName) {
                                        context.report({
                                            node: namedArg,
                                            messageId: 'classNameMismatch',
                                            data: { expected: expectedClassName, actual: actualClassName }
                                        });
                                    }
                                    if (expectedPackageName && actualPackageName !== expectedPackageName) {
                                        context.report({
                                            node: namedArg,
                                            messageId: 'packageNameMismatch',
                                            data: { expected: expectedPackageName, actual: actualPackageName }
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
    }
};
