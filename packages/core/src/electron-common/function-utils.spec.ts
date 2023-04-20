// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { assert } from 'chai';
import { Container } from 'inversify';
import { AnyFunction, FunctionUtils } from './function-utils';

describe('FunctionUtils', () => {

    let container: Container;
    let futils: FunctionUtils;

    beforeEach(() => {
        container = new Container();
        container.bind(FunctionUtils).toSelf().inSingletonScope();
        futils = container.get(FunctionUtils);
    });

    describe('bindfn', () => {

        it('no thisArg should return the function as-is', () => {
            function a(): string {
                return 'a';
            }
            const b = () => 'b';
            assert.strictEqual(a, futils.bindfn(a));
            assert.strictEqual(b, futils.bindfn(b));
        });

        class A {
            protected a = 'a';
            protected b = 'b';
            methodA(): string {
                return this.a;
            }
            methodB(): string {
                return this.b;
            }
        }

        const a1 = new A();
        const a2 = new A();

        it('bound methods should work', () => {
            const boundfn = futils.bindfn(a1.methodA, a1);
            assert.strictEqual(boundfn(), 'a');
        });

        it('identity is preserved when the same arguments are used', () => {
            assert.strictEqual(futils.bindfn(a1.methodA, a1), futils.bindfn(a1.methodA, a1));
        });

        it('identity is different when callbackfn is different', () => {
            assert.notStrictEqual(futils.bindfn(a1.methodA, a1), futils.bindfn(a1.methodB, a1));
        });

        it('identity is different when thisArg is different', () => {
            assert.notStrictEqual(futils.bindfn(a1.methodA, a1), futils.bindfn(a1.methodA, a2));
        });
    });

    describe('mapfn', () => {

        function returnArgs(...args: unknown[]): unknown[] {
            return args;
        }

        function returnArgsLength(...args: unknown[]): number {
            return args.length;
        }

        function mapResultToString<T extends AnyFunction>(fn: T): (...args: Parameters<T>) => string {
            return (...args) => String(fn(...args));
        }

        function mapVoid<T extends AnyFunction>(fn: T): (...args: Parameters<T>) => void {
            return (...args) => {
                fn(...args);
            };
        }

        it('mapped functions should work', () => {
            const mapped = futils.mapfn(returnArgsLength, mapResultToString);
            assert.strictEqual(mapped(0, '1', 2, {}, []), '5');
        });

        it('identity is preserved when the same arguments are used', () => {
            assert.strictEqual(futils.mapfn(returnArgs, mapResultToString), futils.mapfn(returnArgs, mapResultToString));
        });

        it('identity is different when callbackfn is different', () => {
            assert.notStrictEqual(futils.mapfn(returnArgs, mapResultToString), futils.mapfn(returnArgsLength, mapResultToString));
        });

        it('identity is different when mapfn is different', () => {
            assert.notStrictEqual(futils.mapfn(returnArgs, mapResultToString), futils.mapfn(returnArgs, mapVoid));
        });
    });
});
