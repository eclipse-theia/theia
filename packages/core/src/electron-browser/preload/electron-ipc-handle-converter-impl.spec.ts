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

/* eslint-disable @typescript-eslint/no-explicit-any, no-null/no-null */

import { assert } from 'chai';
import { Container } from 'inversify';
import { FunctionUtils, IpcHandleConverter, proxy, proxyable } from '../../electron-common';
import { ElectronIpcHandleConverterImpl } from './electron-ipc-handle-converter-impl';

describe('IpcHandleConverterImpl', () => {

    function createIpcHandleConverter(): IpcHandleConverter {
        const container = new Container();
        container.bind(FunctionUtils).toSelf().inSingletonScope();
        container.bind(IpcHandleConverter).to(ElectronIpcHandleConverterImpl).inSingletonScope();
        return container.get(IpcHandleConverter);
    }

    describe('pass-through values', () => {
        const regularObject = {} as any;
        regularObject.nestedObject = {} as any;
        regularObject.nestedObject.someField = 'some value';
        const nullObject = Object.create(null);
        nullObject.nestedNullObject = Object.create(null);
        nullObject.nestedNullObject.otherField = 'other value';

        let ipcHandleConverter: IpcHandleConverter;
        beforeEach(() => {
            ipcHandleConverter = createIpcHandleConverter();
        });

        function test(message: string, value: unknown): void {
            it(message, () => assert.deepStrictEqual(value, ipcHandleConverter.getIpcHandle(value)));
        }

        test('regular object', regularObject);
        test('null object', nullObject);
        test('integer', 0);
        test('decimal', 1.1e12);
        test('string', 'some string');
        test('null', null);
        test('undefined', undefined);
    });

    describe('complex objects', () => {

        function randomObject(): object {
            return { value: Math.random() };
        }

        class NonProxyableBase {

            publicFieldBase = randomObject();

            protected protectedFieldBase = randomObject();

            publicMethodBase(): object {
                return this.publicFieldBase;
            }

            protected protectedMethodBase(): object {
                return this.protectedFieldBase;
            }
        }

        // This is technically bogus
        class NonProxyableClassA extends NonProxyableBase {

            @proxy() publicFieldA = randomObject();

            protected protectedFieldA = randomObject();

            @proxy() publicMethodA(): object {
                return this.publicFieldA;
            }

            protected protectedMethodA(): object {
                return this.publicFieldA;
            }
        }

        @proxyable()
        class ProxyableClassB extends NonProxyableBase {

            @proxy() publicFieldB = randomObject();

            protected protectedFieldB = randomObject();

            @proxy() publicMethodB(): object {
                return this.publicFieldB;
            }

            protected protectedMethodB(): object {
                return this.publicFieldB;
            }
        }

        @proxyable()
        class ProxyableClassC extends ProxyableClassB {

            @proxy() publicFieldC = randomObject();

            protected protectedFieldC = randomObject();

            @proxy() publicMethodC(): object {
                return this.publicFieldC;
            }

            protected protectedMethodC(): object {
                return this.publicFieldC;
            }
        }

        @proxyable({ fields: ['publicFieldBase'] })
        class ProxyableClassD extends NonProxyableBase {

            @proxy() publicFieldD = randomObject();

            protected protectedFieldD = randomObject();

            @proxy() publicMethodD(): object {
                return this.publicFieldD;
            }

            protected protectedMethodD(): object {
                return this.publicFieldD;
            }
        }

        // This is technically bogus
        @proxyable()
        class ProxyableClassE extends NonProxyableClassA {
            // @proxy() fields for NonProxyableClassA now take effect
        }

        function test(ctor: new () => any, expectedFields: string[]): void {
            describe(`${ctor.name} extends ${Object.getPrototypeOf(ctor).name || 'Object'}`, () => {
                const ipcHandleConverter = createIpcHandleConverter();
                const instance = new ctor();
                const handle = ipcHandleConverter.getIpcHandle(instance);
                const keys = Object.keys(handle);
                it('check generated keys', () => {
                    assert.sameMembers(keys, expectedFields);
                });
                keys.forEach(property => {
                    if (typeof handle[property] === 'function') {
                        it(property, () => {
                            assert.deepStrictEqual(handle[property](), instance[property]());
                        });
                    } else {
                        it(property, () => {
                            assert.deepStrictEqual(handle[property], instance[property]);
                        });
                    }
                });
            });
        }

        test(NonProxyableBase, [
            'publicFieldBase',
            'protectedFieldBase'
        ]);

        test(NonProxyableClassA, [
            'publicFieldBase',
            'publicFieldA',
            'protectedFieldBase',
            'protectedFieldA'
        ]);

        test(ProxyableClassB, [
            'publicFieldB',
            'publicMethodB'
        ]);

        test(ProxyableClassC, [
            'publicFieldB',
            'publicFieldC',
            'publicMethodB',
            'publicMethodC'
        ]);

        test(ProxyableClassD, [
            'publicFieldBase',
            'publicFieldD',
            'publicMethodD'
        ]);

        test(ProxyableClassE, [
            'publicFieldA',
            'publicMethodA'
        ]);
    });
});
