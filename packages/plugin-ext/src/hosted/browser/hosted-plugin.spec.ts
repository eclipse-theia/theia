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
// HostedPluginSupport transitively imports browser widgets (Lumino) that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Some transitively imported modules read the frontend config at load time.
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Disposable, DisposableCollection, Emitter } from '@theia/core/lib/common';
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FrontendApplicationState } from '@theia/core/lib/common/frontend-application-state';
import { PLUGIN_HOST_BACKEND } from '../../common/plugin-protocol.js';
import { createProxyIdentifier, RPCProtocol, RPCProtocolImpl } from '../../common/rpc-protocol.js';
import { HostedPluginSupport } from './hosted-plugin.js';

disableJSDOM();

describe('HostedPluginSupport - plugin view initialization', () => {

    it('initializes plugin views once the application is ready, after the onDidInitializeLayout hooks', async () => {
        const states = new Map<FrontendApplicationState, Deferred<void>>();
        const reach = (state: FrontendApplicationState): Deferred<void> => {
            if (!states.has(state)) {
                states.set(state, new Deferred<void>());
            }
            return states.get(state)!;
        };
        const calls: string[] = [];
        const support = new HostedPluginSupport();
        Object.assign(support, {
            appState: { reachedState: (state: FrontendApplicationState) => reach(state).promise },
            viewRegistry: {
                initWidgets: async () => { calls.push('initWidgets'); },
                removeStaleWidgets: () => { calls.push('removeStaleWidgets'); }
            },
            workspaceTrustService: { refreshRestrictedModeIndicator: () => { } }
        });
        const flush = () => new Promise(resolve => setTimeout(resolve));

        await (support as unknown as { afterLoadContributions(toDisconnect: DisposableCollection): Promise<void> })
            .afterLoadContributions(new DisposableCollection(Disposable.NULL));
        reach('initialized_layout').resolve();
        await flush();
        expect(calls).to.deep.equal([]);

        reach('ready').resolve();
        await flush();
        expect(calls).to.deep.equal(['initWidgets', 'removeStaleWidgets']);
    });

});

describe('HostedPluginSupport.createServerRpc', () => {

    const GREETER = createProxyIdentifier<{ $greet(): Promise<string> }>('Greeter');

    it('should answer the plugin host from the protocol serving the current connection', async () => {
        // The watcher is a singleton shared by every connection, and reconnects reuse the same
        // `pluginHostId`; everything the main side writes reaches the plugin host through
        // `HostedPluginServer.onMessage`.
        const watcher = new Emitter<{ pluginHostId: string, message: Uint8Array }>();
        const hostChannel = new BasicChannel(() => {
            const writer = new Uint8ArrayWriteBuffer();
            writer.onCommit(message => setTimeout(() => watcher.fire({ pluginHostId: PLUGIN_HOST_BACKEND, message }), 0));
            return writer;
        });
        const host = new RPCProtocolImpl(hostChannel);
        const support = new HostedPluginSupport();
        Object.assign(support, {
            server: {
                onMessage: (_pluginHostId: string, message: Uint8Array) =>
                    setTimeout(() => hostChannel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(message)), 0)
            },
            watcher: { onPostMessageEvent: watcher.event }
        });
        const createServerRpc = (): RPCProtocol =>
            (support as unknown as { createServerRpc(pluginHostId: string): RPCProtocol }).createServerRpc(PLUGIN_HOST_BACKEND);

        const firstConnection = createServerRpc();
        firstConnection.set(GREETER, { $greet: async () => 'first connection' });
        expect(await host.getProxy(GREETER).$greet()).to.equal('first connection');

        firstConnection.dispose();
        createServerRpc().set(GREETER, { $greet: async () => 'second connection' });

        // A subscription outliving its protocol is dispatched first and would answer from an
        // empty `locals` map, before the live protocol could reply.
        expect(await host.getProxy(GREETER).$greet()).to.equal('second connection');
    });

});
