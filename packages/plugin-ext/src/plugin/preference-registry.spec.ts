/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { PreferenceRegistryExtImpl } from './preference-registry';
import * as chai from 'chai';
import { WorkspaceExtImpl } from '../plugin/workspace';
import { RPCProtocol } from '../common/rpc-protocol';
import { ProxyIdentifier } from '../common/rpc-protocol';

const expect = chai.expect;

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('PreferenceRegistryExtImpl:', () => {

    let preferenceRegistryExtImpl: PreferenceRegistryExtImpl;
    const getProxy = (proxyId: ProxyIdentifier<unknown>) => { };
    const set = (identifier: ProxyIdentifier<unknown>, instance: unknown) => { };
    const dispose = () => { };

    const mockRPC = {
        getProxy,
        set,
        dispose
    } as RPCProtocol;
    const mockWorkspace: WorkspaceExtImpl = {} as WorkspaceExtImpl;

    beforeEach(() => {
        preferenceRegistryExtImpl = new PreferenceRegistryExtImpl(mockRPC, mockWorkspace);
    });

    it('Check parseConfigurationData', () => {
        const value: { [key: string]: any } = {
            'my.key1.foo': 'value1',
            'my.key1.bar': 'value2',
        };
        const result: { [key: string]: any } = (preferenceRegistryExtImpl as any).parseConfigurationData(value);
        expect(result.my).to.be.an('object');
        expect(result.my.key1).to.be.an('object');

        expect(result.my.key1.foo).to.be.an('string');
        expect(result.my.key1.foo).to.equal('value1');

        expect(result.my.key1.bar).to.be.an('string');
        expect(result.my.key1.bar).to.equal('value2');
    });

    it('Prototype pollution check', () => {
        const value: { [key: string]: any } = {
            'my.key1.foo': 'value1',
            '__proto__.injectedParsedPrototype': true,
            'a.__proto__.injectedParsedPrototype': true,
            '__proto__': {},
        };
        const result: { [key: string]: any } = (preferenceRegistryExtImpl as any).parseConfigurationData(value);
        expect(result.my).to.be.an('object');
        expect(result.__proto__).to.be.an('undefined');
        expect(result.my.key1.foo).to.equal('value1');
        const prototypeObject = Object.prototype as any;
        expect(prototypeObject.injectedParsedPrototype).to.be.an('undefined');
        const rawObject = {} as any;
        expect(rawObject.injectedParsedPrototype).to.be.an('undefined');
    });

    it('Prototype constructor pollution check', () => {
        const value: { [key: string]: any } = {
            'my.key1.foo': 'value1',
            'a.constructor.prototype.injectedParsedConstructorPrototype': true,
            'constructor.prototype.injectedParsedConstructorPrototype': true,
        };
        const result: { [key: string]: any } = (preferenceRegistryExtImpl as any).parseConfigurationData(value);
        expect(result.my).to.be.an('object');
        expect(result.__proto__).to.be.an('undefined');
        expect(result.my.key1.foo).to.equal('value1');
        const prototypeObject = Object.prototype as any;
        expect(prototypeObject.injectedParsedConstructorPrototype).to.be.an('undefined');
        const rawObject = {} as any;
        expect(rawObject.injectedParsedConstructorPrototype).to.be.an('undefined');
    });

});
