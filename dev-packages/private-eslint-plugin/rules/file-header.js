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
        type: 'problem',
        docs: {
            description: 'require a matching license file header.'
        },
        schema: [
            {
                type: 'object',
                properties: {
                    match: {
                        type: 'string'
                    }
                },
                required: ['match'],
                additionalProperties: false
            }
        ]
    },
    create(context) {
        const sourceCode = context.getSourceCode();
        const options = /** @type {{ match: string }} */ (context.options[0]);
        const pattern = new RegExp(options.match);
        return {
            Program(node) {
                const comments = sourceCode.getAllComments();
                const firstToken = sourceCode.getFirstToken(node);
                const leadingComments = firstToken?.range
                    ? comments.filter(comment => comment.range && comment.range[1] <= firstToken.range[0])
                    : comments;
                const header = leadingComments.map(comment => comment.value).join('\n');
                if (leadingComments.length === 0 || !pattern.test(header)) {
                    context.report({
                        node,
                        loc: { line: 1, column: 0 },
                        message: 'missing or invalid license file header (expected to match "{{match}}")',
                        data: { match: options.match }
                    });
                }
            }
        };
    }
};
