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

/* eslint-disable max-len */

import { inject, injectable } from 'inversify';
import { ChannelHandlerFactory, RpcCreateMessage, RpcPortForwardMessage, RpcRequestSyncMessage, RpcServerProvider, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { RpcServerWrap } from '../../common/rpc/rpc-server-wrap';
import { TheiaIpcMain, TheiaIpcMainEvent } from './ipc-main';
import { ElectronMainApplicationContribution } from '../electron-main-application';
import { SenderWebContents } from '../electron-main-rpc-context';

/**
 * This component handles Electron IPC messages coming from the preload context
 * to create and handle RPC proxies. It allows creating a proxy synchronously
 * and later connect a {@link MessagePort} to do asynchronous communication.
 */
@injectable()
export class ElectronMainRpcImpl implements ElectronMainApplicationContribution {

    protected proxyId = 0;
    protected serverWraps = new Map<unknown, RpcServerWrap>();

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    @inject(RpcServerProvider)
    protected rpcServerProvider: RpcServerProvider;

    onStart(): void {
        this.ipcMain.on(ipc.create, this.handleCreateSync, this);
        this.ipcMain.on(ipc.requestSync, this.handleRequestSync, this);
        this.ipcMain.on(ipc.portForward, this.handlePortForward, this);
    }

    protected handleCreateSync(event: TheiaIpcMainEvent, { proxyPath }: RpcCreateMessage): void {
        const server = this.rpcServerProvider(proxyPath);
        const proxyId = this.proxyId++;
        const channels = this.channelHandlerFactory();
        const serverWrap = new RpcServerWrap(server, channels, (bindings, sender) => {
            bindings.set(SenderWebContents, sender);
        });
        this.serverWraps.set(proxyId, serverWrap);
        event.returnValue = proxyId;
    }

    protected handleRequestSync(event: TheiaIpcMainEvent, { proxyId, method, params }: RpcRequestSyncMessage): void {
        const server = this.serverWraps.get(proxyId);
        if (!server) {
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        event.returnValue = server.callMethod(event.sender, method, params);
    }

    protected handlePortForward({ ports, sender }: TheiaIpcMainEvent, { proxyId }: RpcPortForwardMessage): void {
        const server = this.serverWraps.get(proxyId);
        if (!server) {
            ports.forEach(port => port.close());
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        const [forward, ...rest] = ports;
        if (!forward) {
            throw new Error('missing port to forward to');
        }
        rest.forEach(port => port.close());
        server.registerPort(sender, forward);
        forward.on('message', event => server.handleMessage(sender, forward, event.data));
        forward.on('close', () => server.unregisterPort(sender, forward));
    }
}
