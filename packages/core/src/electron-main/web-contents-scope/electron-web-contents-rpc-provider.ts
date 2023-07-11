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
import { TheiaIpcMain } from '../messaging';
import { ChannelHandlerFactory, ElectronWebContentsScope, RpcClient, RpcHandler, RpcProvider, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { MessageChannelMain, WebContents } from '@theia/electron/shared/electron';
import { ElectronRpcImpl } from '../../electron-common/messaging/electron-rpc-impl';

/**
 * @internal
 */
@injectable()
export class WebContentsRpcProvider implements RpcProvider {

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(ElectronWebContentsScope)
    protected scopedWebContents: WebContents;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    getRpc(proxyPath: string): { client: RpcClient, handler?: RpcHandler } {
        const { port1, port2 } = new MessageChannelMain();
        this.ipcMain.postMessageTo(this.scopedWebContents, ipc.create, { proxyPath }, [port1]);
        const channels = this.channelHandlerFactory<void>();
        const rpc = new ElectronRpcImpl(port2, channels);
        port2.on('message', event => channels.handleMessage(event.data));
        port2.on('close', () => rpc.dispose());
        port2.start();
        return {
            client: rpc,
            handler: rpc
        };
    }
}
