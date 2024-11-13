// @ts-check
// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

/**
 * @typedef {import('@typescript-eslint/utils').TSESTree.ClassDeclaration} ClassDeclaration
 * @typedef {import('@typescript-eslint/utils').TSESTree.ClassElement} ClassElement
 * @typedef {import('@typescript-eslint/utils').TSESTree.Decorator} Decorator
 * @typedef {import('@typescript-eslint/utils').TSESTree.MethodDefinition} MethodDefinition
 * @typedef {import('@typescript-eslint/utils').TSESTree.Parameter} Parameter
 * @typedef {import('estree').Node} Node
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * Type guard to check if a ClassElement is a MethodDefinition.
 * @param {ClassElement} element
 * @returns {element is MethodDefinition}
 */
function isMethodDefinition(element) {
    return element.type === 'MethodDefinition';
}

/** @type {RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Ensure @injectable classes have annotated constructor parameters',
        },
        messages: {
            missingAnnotation: 'Constructor parameters in an @injectable class must be annotated with @inject, @unmanaged or @multiInject',
        },
    },
    create(context) {
        return {
            /**
             * @param {ClassDeclaration} node
             */
            ClassDeclaration(node) {
                // Check if the class has a decorator named `injectable`
                const hasInjectableDecorator = node.decorators?.some(
                    (/** @type {Decorator} */ decorator) =>
                        decorator.expression.type === 'CallExpression' &&
                        decorator.expression.callee.type === 'Identifier' &&
                        decorator.expression.callee.name === 'injectable'
                );

                if (hasInjectableDecorator) {
                    // Find the constructor method within the class body
                    const constructor = node.body.body.find(
                        member =>
                            isMethodDefinition(member) &&
                            member.kind === 'constructor'
                    );

                    if (
                        constructor &&
                        // We need to re-apply 'isMethodDefinition' here because the type guard is not properly preserved
                        isMethodDefinition(constructor) &&
                        constructor.value &&
                        constructor.value.params.length > 0
                    ) {
                        constructor.value.params.forEach(
                            /** @type {Parameter} */ param => {
                                // Check if each constructor parameter has a decorator
                                const hasAnnotation = param.decorators?.some(
                                    (/** @type {Decorator} */ decorator) =>
                                        decorator.expression.type === 'CallExpression' &&
                                        decorator.expression.callee.type === 'Identifier' &&
                                        (decorator.expression.callee.name === 'inject' ||
                                            decorator.expression.callee.name === 'unmanaged' ||
                                            decorator.expression.callee.name === 'multiInject')
                                );

                                if (!hasAnnotation) {
                                    context.report({
                                        node: /** @type Node */ (param),
                                        messageId: 'missingAnnotation',
                                    });
                                }
                            }
                        );
                    }
                }
            },
        };
    },
};
