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
import { ElectronMainApplicationContribution } from './electron-main-application';
import {
    ConnectionRequest, ELECTRON_MESSAGE_PORT_IPC as ipc, FunctionUtils, MessagePortHandler, MessagePortHandlerId, MessagePortServer, TheiaIpcMain, TheiaIpcMainEvent
} from '../electron-common';

@injectable()
export class ElectronMessagePortServerMain implements ElectronMainApplicationContribution, MessagePortServer {

    protected messagePortHandlers = new Map<string, MessagePortHandler>();

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    onStart(): void {
        this.ipcMain.on(ipc.connectionRequest, this.onConnectionRequest, this);
    }

    handle(handlerId: string, handler: MessagePortHandler, thisArg?: object): void {
        this.messagePortHandlers.set(handlerId, this.futils.bindfn(handler, thisArg));
    }

    removeHandler(handlerId: MessagePortHandlerId): void {
        this.messagePortHandlers.delete(handlerId);
    }

    protected async onConnectionRequest(event: TheiaIpcMainEvent, message: ConnectionRequest): Promise<void> {
        const [requestId, handlerId, handlerParams] = message;
        const handler = this.messagePortHandlers.get(handlerId);
        if (!handler) {
            throw new Error('no handler!');
        }
        try {
            await handler(event, handlerParams);
            this.ipcMain.sendTo(event.sender, ipc.connectionResponse, [requestId]);
        } catch (error) {
            console.debug(error);
            this.ipcMain.sendTo(event.sender, ipc.connectionResponse, [requestId, error]);
        }
    }
}
