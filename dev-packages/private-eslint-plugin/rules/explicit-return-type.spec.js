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

const { RuleTester } = require('eslint');
const rule = require('./explicit-return-type');

const error = { message: 'Expected a return type annotation.' };
const ruleTester = new RuleTester({
    parser: require.resolve('@typescript-eslint/parser'),
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' }
});

ruleTester.run('@theia/explicit-return-type', rule, {
    valid: [
        'function typed(): void {}',
        'class Typed { method(): void {} get value(): string { return ""; } }',
        'interface Typed { method(): void; }',
        'const arrow = () => {};',
        'class Constructed { constructor() {} }',
        'class WithSetter { set value(value: string) {} }',
        'abstract class Abstract { abstract method(): void; }'
    ],
    invalid: [
        {
            code: 'function untyped() {}',
            errors: [error]
        },
        {
            code: 'const untyped = function () {};',
            errors: [error]
        },
        {
            code: 'class Untyped { method() {} }',
            errors: [error]
        },
        {
            code: 'class Untyped { get value() { return ""; } }',
            errors: [error]
        },
        {
            code: 'const untyped = { method() {} };',
            errors: [error]
        },
        {
            code: 'interface Untyped { method(); }',
            errors: [error]
        },
        {
            code: 'function overloaded(); function overloaded(): void {}',
            errors: [error]
        }
    ]
});
