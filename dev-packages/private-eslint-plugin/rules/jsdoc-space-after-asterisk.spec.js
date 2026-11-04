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

const { RuleTester } = require('eslint');
const rule = require('./jsdoc-space-after-asterisk');

const message = 'JSDoc line asterisks must be followed by a space';

const ruleTester = new RuleTester({
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' }
});

ruleTester.run('@theia/jsdoc-space-after-asterisk', rule, {
    valid: [
        `
/**
 * Does something.
 *
 * @param value the value
 */
function f(value) { }
`,
        '/** Single line JSDoc. */\nconst value = true;',
        `
/*
 *no space, but not a JSDoc comment
 */
const value = true;
`,
        `
/*****************************************
 *banner comments are not JSDoc
 *****************************************/
const value = true;
`,
        `
class A {
    /**
     * Indented JSDoc.
     */
    method() { }
}
`,
        '/**\r\n * Windows line endings.\r\n */\r\nconst value = true;',
        `
// *line comment
//*another line comment
const value = true;
`
    ],
    invalid: [
        {
            code: `
/**
 *no space after asterisk
 */
const value = true;
`,
            errors: [{ message, line: 3, column: 1 }]
        },
        {
            code: `
/**
 * Does something.
 *@param value the value
 */
function f(value) { }
`,
            errors: [{ message, line: 4, column: 1 }]
        },
        {
            code: `
class A {
    /**
     *first
     * second
     *third
     */
    method() { }
}
`,
            errors: [
                { message, line: 4, column: 1 },
                { message, line: 6, column: 1 }
            ]
        },
        {
            code: `
/**
 * Missing asterisk on the next line.
   no asterisk
 */
const value = true;
`,
            errors: [{ message, line: 4, column: 1 }]
        }
    ]
});
