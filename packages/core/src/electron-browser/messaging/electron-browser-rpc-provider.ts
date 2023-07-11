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

import { inject, injectable } from 'inversify';
import { TheiaIpcWindow } from '../../browser';
import { ChannelHandlerFactory, RpcClient, RpcHandler, RpcProvider, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { ElectronRpcSync } from '../../electron-common';
import { ElectronRpcImpl } from '../../electron-common/messaging/electron-rpc-impl';

/**
 * This component interfaces with the preload context to create proxy instances
 * synchronously. We then send a {@link MessagePort} to do asynchronous
 * communication with the remote server in the main context.
 */
@injectable()
export class ElectronBrowserRpcProvider implements RpcProvider {

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    @inject(ElectronRpcSync)
    protected rpcSync: ElectronRpcSync;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    getRpc(proxyPath: string): { client: RpcClient, handler?: RpcHandler } {
        const proxyId = this.rpcSync.createProxy(proxyPath);
        const { port1, port2 } = new MessageChannel();
        this.ipcWindow.postMessage(origin, ipc.portForward, { proxyId }, [port1]);
        const channels = this.channelHandlerFactory<void>();
        const rpc = new ElectronRpcImpl(port2, channels);
        rpc.sendRequestSync = (method, params) => this.rpcSync.requestSync(proxyId, method, params);
        port2.addEventListener('message', event => channels.handleMessage(event.data));
        port2.start();
        return {
            client: rpc,
            handler: rpc
        };
    }
}
