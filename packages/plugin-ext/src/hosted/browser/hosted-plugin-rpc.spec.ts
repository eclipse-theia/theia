// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { DisposableCollection, Emitter } from '@theia/core';
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { PLUGIN_HOST_BACKEND } from '../../common/plugin-protocol';
import { createProxyIdentifier, RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol';
import { HostedPluginSupport } from './hosted-plugin';
disableJSDOM();

interface Greeter {
    $greet(name: string): Promise<string>;
}
const GREETER = createProxyIdentifier<Greeter>('Greeter');

/** Exposes the protected factory, and stands in for the two collaborators it uses. */
class TestHostedPluginSupport extends HostedPluginSupport {
    constructor(server: unknown, watcher: unknown) {
        super();
        Object.assign(this, { server, watcher });
    }

    createRpc(toDisconnect: DisposableCollection): RPCProtocol {
        return this.createServerRpc(PLUGIN_HOST_BACKEND, toDisconnect);
    }
}

describe('HostedPluginSupport.createServerRpc', () => {

    before(() => { disableJSDOM = enableJSDOM(); });
    after(() => { disableJSDOM(); });

    /**
     * Wires a plugin host to the main side the way the real backend does: the watcher is a
     * singleton shared by every connection, and everything the main side writes is routed to the
     * plugin host through `HostedPluginServer.onMessage`.
     */
    function connectPluginHost(): { support: TestHostedPluginSupport, host: RPCProtocol } {
        const watcher = new Emitter<{ pluginHostId: string, message: Uint8Array }>();
        const hostChannel = new BasicChannel(() => {
            const writer = new Uint8ArrayWriteBuffer();
            writer.onCommit(message => setTimeout(() => watcher.fire({ pluginHostId: PLUGIN_HOST_BACKEND, message }), 0));
            return writer;
        });
        const server = {
            onMessage: (_pluginHostId: string, message: Uint8Array) =>
                setTimeout(() => hostChannel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(message)), 0)
        };
        return {
            support: new TestHostedPluginSupport(server, { onPostMessageEvent: watcher.event }),
            host: new RPCProtocolImpl(hostChannel)
        };
    }

    it('should answer the plugin host from the protocol serving the current connection', async () => {
        const { support, host } = connectPluginHost();

        const firstConnection = new DisposableCollection();
        support.createRpc(firstConnection).set(GREETER, { $greet: async () => 'first connection' });
        expect(await host.getProxy(GREETER).$greet('world')).to.equal('first connection');

        // The connection drops. Its protocol is disposed, but the watcher it subscribed to is a
        // singleton that survives, and the reconnect reuses the same `pluginHostId`.
        firstConnection.dispose();

        const secondConnection = new DisposableCollection();
        support.createRpc(secondConnection).set(GREETER, { $greet: async () => 'second connection' });

        // A subscription outliving its protocol would be dispatched first and answer from an
        // empty `locals` map, rejecting this before the live protocol could reply.
        expect(await host.getProxy(GREETER).$greet('world')).to.equal('second connection');
    });
});
