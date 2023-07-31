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

import { inject, injectable, multiInject, named } from 'inversify';
import { FrontendApplicationContribution, TheiaIpcWindow } from '../../browser';
import { ChannelHandlerFactory, ElectronMainContext, FrontendContext, isObject, RpcCreateMessage, RpcServerProvider, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { RpcServerWrap } from '../../common/rpc/rpc-server-wrap';

/**
 * This component handles Electron IPC messages coming from the preload context
 * to create and handle RPC proxies. It allows creating a proxy synchronously
 * and later connect a {@link MessagePort} to do asynchronous communication.
 */
@injectable()
export class ElectronBrowserRpcContribution implements FrontendApplicationContribution {

    protected nextProxyId = 0;
    /** proxy id -> rpc server wrap handle */
    protected serverWraps = new Map<unknown, RpcServerWrap>();

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    @multiInject(RpcServerProvider) @named(FrontendContext)
    protected rpcServerProviders: RpcServerProvider[];

    onStart(): void {
        this.ipcWindow.on(ipc.create, this.handleCreate, this);
    }

    protected async handleCreate({ ports }: MessageEvent, { proxyPath }: RpcCreateMessage): Promise<number> {
        const [forward, ...unused] = ports;
        if (!forward) {
            throw new Error('missing port to forward to');
        }
        // forward.on('close', () => server.unregisterPort(sender, forward));
        const server = await this.getServer(proxyPath);
        const proxyId = this.nextProxyId++;
        const channels = this.channelHandlerFactory();
        const serverWrap = new RpcServerWrap(server, channels);
        unused.forEach(port => port.close());
        serverWrap.registerPort(ElectronMainContext, forward);
        forward.addEventListener('message', event => serverWrap.handleMessage(ElectronMainContext, forward, event.data));
        this.serverWraps.set(proxyId, serverWrap);
        return proxyId;
    }

    protected async getServer(path: unknown): Promise<unknown> {
        for (const provider of this.rpcServerProviders) {
            const server = await provider(path);
            if (isObject(server)) {
                return server;
            }
        }
        throw new Error(`no server found for path: ${path}`);
    }
}
