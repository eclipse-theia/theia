// *****************************************************************************
// Copyright (C) 2026 Eclipse Foundation and others.
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
 * @typedef {import('@typescript-eslint/utils').TSESTree.Decorator} Decorator
 * @typedef {import('estree').Node} Node
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/** @type {RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce ILogger usage and naming conventions in @injectable classes',
        },
        messages: {
            noConsole: 'Use injected ILogger instead of console statements in @injectable classes.',
            missingNamed: 'Injected ILoggers must use the @named decorator.',
            invalidNameFormat: 'Logger name must follow the convention: [optional-purpose]package-name:class-name#optional-suffix',
            classNameMismatch: 'Logger name\'s class segment should be "{{expected}}" (the enclosing class), but found "{{actual}}".',
            packageNameMismatch: 'Logger name\'s package segment should be "{{expected}}" (derived from the file path), but found "{{actual}}".'
        }
    },
    create(context) {
        const filename = context.getFilename().replace(/\\/g, '/');

        // The Electron main process has no ILogger/DI setup available during early
        // bootstrap, so this rule cannot apply there.
        if (filename.includes('/electron-main/')) {
            return {};
        }

        // These files sit below or alongside the logger/DI infrastructure itself and
        // predate it being available, so they are exempt for the same reason:
        // - console-logger-server.ts: this *is* the console logger implementation.
        // - logger-cli-contribution.ts: parses the log config the logger depends on.
        // - ws-connection-source.ts: the socket the frontend logger's RPC rides on.
        // - plugin-host-rpc.ts: the plugin host already routes console.* calls itself
        //   and has no ILogger available here either.
        const exemptFiles = [
            'packages/core/src/node/console-logger-server.ts',
            'packages/core/src/node/logger-cli-contribution.ts',
            'packages/core/src/browser/messaging/ws-connection-source.ts',
            'packages/plugin-ext/src/hosted/node/plugin-host-rpc.ts'
        ];
        if (exemptFiles.some(exempt => filename.endsWith(exempt))) {
            return {};
        }

        /** @type {Array<{ isInjectable: boolean, className: string | undefined }>} */
        const injectableClassStack = [];

        /**
         * Walks up from the given scope looking for the reference tied to `identifierNode`,
         * and returns the variable it resolves to (or undefined if unresolved).
         * @param {Node} identifierNode
         */
        function resolveVariable(identifierNode) {
            let scope = context.getScope();
            while (scope) {
                const ref = scope.references.find(r => r.identifier === identifierNode);
                if (ref) {
                    return ref.resolved;
                }
                scope = scope.upper;
            }
            return undefined;
        }

        /**
         * True only when `identifierNode` refers to the real global `console`, i.e. it is
         * not shadowed by a local variable, parameter, or import of the same name.
         * @param {Node} identifierNode
         */
        function isGlobalConsole(identifierNode) {
            const variable = resolveVariable(identifierNode);
            // No resolved variable, or a resolved variable with no local `defs` (how ESLint
            // represents environment globals), both mean this is the real global console.
            // Any variable with a def (parameter, `const console = ...`, etc.) is a shadow.
            return !variable || variable.defs.length === 0;
        }

        /**
        * Derives the Theia package name from a normalized (forward-slash) file path, e.g.
        * 'packages/plugin-ext/src/main/node/plugin-deployer-impl.ts' -> 'plugin-ext'.
        * Returns undefined for paths outside packages/ or dev-packages/ (e.g. examples/,
        * doc/), where the convention doesn't cleanly apply.
        * @param {string} normalizedFilename
        */
        function derivePackageName(normalizedFilename) {
            const match = /(?:^|\/)(?:packages|dev-packages)\/([^/]+)\//.exec(normalizedFilename);
            return match ? match[1] : undefined;
        }

        return {
            /**
             * @param {ClassDeclaration} node
             */
            ClassDeclaration(node) {
                const hasInjectable = node.decorators?.some(
                    (/** @type {Decorator} */ d) =>
                        d.expression &&
                        d.expression.type === 'CallExpression' &&
                        d.expression.callee &&
                        d.expression.callee.name === 'injectable'
                );
                injectableClassStack.push({ isInjectable: !!hasInjectable, className: node.id ? node.id.name : undefined });
            },

            'ClassDeclaration:exit'() {
                injectableClassStack.pop();
            },

            CallExpression(node) {
                const isInsideInjectable = injectableClassStack.some(entry => entry.isInjectable);
                if (
                    isInsideInjectable &&
                    node.callee &&
                    node.callee.type === 'MemberExpression' &&
                    node.callee.object &&
                    node.callee.object.type === 'Identifier' &&
                    node.callee.object.name === 'console' &&
                    isGlobalConsole(node.callee.object)
                ) {
                    context.report({ node, messageId: 'noConsole' });
                }
            },

            Decorator(node) {
                if (
                    node.expression &&
                    node.expression.type === 'CallExpression' &&
                    node.expression.callee &&
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
                                    const enclosingClass = injectableClassStack[injectableClassStack.length - 1];
                                    const expectedClassName = enclosingClass && enclosingClass.className;
                                    const expectedPackageName = derivePackageName(filename);

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
