// @ts-check
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

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'layout',
        docs: {
            description: 'require the leading asterisk of each inner JSDoc line to be followed by a space or the end of the line.'
        },
        schema: []
    },
    create(context) {
        const sourceCode = context.sourceCode;
        return {
            Program() {
                for (const comment of sourceCode.getAllComments()) {
                    // Only JSDoc blocks: `/**` but neither `/***` banners nor the empty `/**/`.
                    if (comment.type !== 'Block' || !comment.value.startsWith('*') || comment.value[1] === '*' || !comment.loc) {
                        continue;
                    }
                    const lines = comment.value.split('\n').map(line => line.replace(/\r$/, ''));
                    // The first line holds the opening `/**`, the last one the closing `*/`.
                    for (let i = 1; i < lines.length - 1; i++) {
                        if (!/^\s*\*(?: |$)/.test(lines[i])) {
                            context.report({
                                loc: { line: comment.loc.start.line + i, column: 0 },
                                message: 'JSDoc line asterisks must be followed by a space'
                            });
                        }
                    }
                }
            }
        };
    }
};
