// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { Emitter } from '@theia/core/lib/common/event';
import * as chai from 'chai';
import * as theia from '@theia/plugin';
import { PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { ProxyIdentifier, RPCProtocol } from '../common/rpc-protocol';
import { DecorationsExtImpl } from './decorations';
import { URI } from './types-impl';

const expect = chai.expect;

describe('DecorationsExtImpl', () => {

    let onDidChangeCalls: (URI[] | null)[];
    let decorationsExt: DecorationsExtImpl;
    let onDidChangeFileDecorationsEmitter: Emitter<theia.Uri | theia.Uri[] | undefined>;

    beforeEach(() => {
        onDidChangeCalls = [];
        const decorationsMainMock = {
            $registerDecorationProvider: async () => undefined,
            $unregisterDecorationProvider: () => undefined,
            $onDidChange: (handle: number, resources: URI[] | null) => {
                onDidChangeCalls.push(resources);
            }
        };
        const rpcMock = {
            getProxy<T>(proxyId: ProxyIdentifier<T>): T {
                return (proxyId.id === PLUGIN_RPC_CONTEXT.DECORATIONS_MAIN.id
                    ? decorationsMainMock
                    : new Proxy({}, { get: () => () => undefined })) as unknown as T;
            },
            set<T, R extends T>(_identifier: ProxyIdentifier<T>, instance: R): R {
                return instance;
            },
            dispose(): void { }
        } as RPCProtocol;

        decorationsExt = new DecorationsExtImpl(rpcMock);
        onDidChangeFileDecorationsEmitter = new Emitter<theia.Uri | theia.Uri[] | undefined>();
        decorationsExt.registerFileDecorationProvider({
            onDidChangeFileDecorations: onDidChangeFileDecorationsEmitter.event,
            provideFileDecoration: () => undefined
        }, { id: 'test.plugin', name: 'test' });
    });

    it('forwards small change events unchanged', () => {
        const uris = [1, 2, 3].map(i => URI.parse(`file:///project/f${i}.ts`));
        onDidChangeFileDecorationsEmitter.fire(uris);
        expect(onDidChangeCalls).to.have.lengthOf(1);
        expect(onDidChangeCalls[0]).to.have.lengthOf(3);
    });

    it('forwards undefined change events as a flush', () => {
        onDidChangeFileDecorationsEmitter.fire(undefined);
        expect(onDidChangeCalls).to.have.lengthOf(1);
        // eslint-disable-next-line no-null/no-null
        expect(onDidChangeCalls[0]).to.equal(null);
    });

    it('sends a flush instead of truncating events exceeding the max event size', () => {
        const uris = [];
        for (let i = 0; i < 300; i++) {
            uris.push(URI.parse(`file:///project/folder${i % 30}/f${i}.ts`));
        }
        onDidChangeFileDecorationsEmitter.fire(uris);
        expect(onDidChangeCalls).to.have.lengthOf(1);
        // eslint-disable-next-line no-null/no-null
        expect(onDidChangeCalls[0]).to.equal(null);
    });

});
