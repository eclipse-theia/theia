// @ts-check
// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

const levenshtein = require('js-levenshtein');

const metadata = require('@theia/core/src/common/i18n/nls.metadata.json');
const messages = new Set(Object.values(metadata.messages)
    .reduceRight((prev, curr) => prev.concat(curr), [])
    .map(e => e.replace(/&&/g, '')));

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'prevent incorrect use of \'nls.localize\'.',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type === 'Super') {
                    return;
                }
                const { value, byDefault, node: localizeNode } = evaluateLocalize(node);
                if (value !== undefined) {
                    if (byDefault && !messages.has(value)) {
                        let lowestDistance = Number.MAX_VALUE;
                        let lowestMessage = '';
                        for (const message of messages) {
                            const distance = levenshtein(value, message);
                            if (distance < lowestDistance) {
                                lowestDistance = distance;
                                lowestMessage = message;
                            }
                        }
                        if (lowestMessage) {
                            context.report({
                                node: localizeNode,
                                message: `'${value}' is not a valid default value. Did you mean '${lowestMessage}'?`,
                                fix: function (fixer) {
                                    const updatedCall = `'${lowestMessage.replace(/'/g, "\\'")}'`;
                                    return fixer.replaceText(localizeNode, updatedCall);
                                }
                            });
                        } else {
                            context.report({
                                node: localizeNode,
                                message: `'${value}' is not a valid default value.`
                            });
                        }
                    } else if (!byDefault && messages.has(value)) {
                        context.report({
                            node,
                            message: `'${value}' can be translated using the 'nls.localizeByDefault' function.`,
                            fix: function (fixer) {
                                const code = context.getSourceCode();
                                const args = node.arguments.slice(1);
                                const argsCode = args.map(e => code.getText(e)).join(', ');
                                const updatedCall = `nls.localizeByDefault(${argsCode})`;
                                return fixer.replaceText(node, updatedCall);
                            }
                        });
                    }
                }
            }
        };
        function evaluateLocalize(/** @type {import('estree').CallExpression} */ node) {
            const callee = node.callee;
            if ('object' in callee && 'name' in callee.object && 'property' in callee && 'name' in callee.property && callee.object.name === 'nls') {
                if (callee.property.name === 'localize') {
                    const defaultTextNode = node.arguments[1]; // The default text node is the second argument for `nls.localize`
                    if (defaultTextNode && defaultTextNode.type === 'Literal' && typeof defaultTextNode.value === 'string') {
                        return {
                            value: defaultTextNode.value,
                            byDefault: false
                        };
                    }
                } else if (callee.property.name === 'localizeByDefault') {
                    const defaultTextNode = node.arguments[0]; // The default text node is the first argument for ``nls.localizeByDefault`
                    if (defaultTextNode && defaultTextNode.type === 'Literal' && typeof defaultTextNode.value === 'string') {
                        return {
                            node: defaultTextNode,
                            value: defaultTextNode.value,
                            byDefault: true
                        };
                    }
                }
            }
            return {};
        }
    }
};
