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
// eslint-disable-next-line max-len
import { ChannelHandlerFactory, ElectronMainContext, isObject, isPromiseLike, RpcCreateMessage, RpcPortForwardMessage, RpcRequestSyncMessage, RpcServerProvider, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { RpcServerWrap } from '../../common/rpc/rpc-server-wrap';
import { ElectronMainApplicationContribution } from '../electron-main-application';
import { SenderWebContents } from '../electron-main-rpc-context';
import { TheiaIpcMain, TheiaIpcMainEvent } from './ipc-main';

/**
 * This component handles Electron IPC messages coming from the preload context
 * to create and handle RPC proxies. It allows creating a proxy synchronously
 * and later connect a {@link MessagePort} to do asynchronous communication.
 */
@injectable()
export class ElectronMainRpcContribution implements ElectronMainApplicationContribution {

    protected nextProxyId = 0;
    /** proxy id -> rpc server wrap handle */
    protected serverWraps = new Map<unknown, RpcServerWrap>();

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    @multiInject(RpcServerProvider) @named(ElectronMainContext)
    protected rpcServerProviders: RpcServerProvider[];

    onStart(): void {
        this.ipcMain.on(ipc.createSync, this.handleCreateSync, this);
        this.ipcMain.on(ipc.requestSync, this.handleRequestSync, this);
        this.ipcMain.on(ipc.portForward, this.handlePortForward, this);
    }

    protected handleCreateSync(event: TheiaIpcMainEvent, { proxyPath }: RpcCreateMessage): number {
        const server = this.getServerSync(proxyPath);
        const proxyId = this.nextProxyId++;
        const channels = this.channelHandlerFactory();
        const serverWrap = new RpcServerWrap(server, channels, (bindings, sender) => {
            bindings.set(SenderWebContents, sender);
        });
        this.serverWraps.set(proxyId, serverWrap);
        return proxyId;
    }

    protected handleRequestSync(event: TheiaIpcMainEvent, { proxyId, method, params }: RpcRequestSyncMessage): unknown {
        const server = this.serverWraps.get(proxyId);
        if (!server) {
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        return server.callMethod(event.sender, method, params);
    }

    protected handlePortForward({ ports, sender }: TheiaIpcMainEvent, { proxyId }: RpcPortForwardMessage): void {
        const server = this.serverWraps.get(proxyId);
        if (!server) {
            ports.forEach(port => port.close());
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        const [forward, ...unused] = ports;
        if (!forward) {
            throw new Error('missing port to forward to');
        }
        unused.forEach(port => port.close());
        server.registerPort(sender, forward);
        forward.on('message', event => server.handleMessage(sender, forward, event.data));
        forward.on('close', () => server.unregisterPort(sender, forward));
    }

    protected getServerSync(path: unknown): unknown {
        for (const provider of this.rpcServerProviders) {
            const server = provider(path);
            console.log('SERVER?', path, server);
            // We need this function to by synchronous so we'll skip promises:
            if (!isPromiseLike(server) && isObject(server)) {
                return server;
            }
        }
        throw new Error(`no server found for path: ${path}`);
    }
}
